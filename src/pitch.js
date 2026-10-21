// Dynamic Wavelet Algorithm pitch tracking, ported from dywapitchtrack.c
// (Copyright (c) 2010 Antoine Schmitt, MIT licence), which the original app
// used. The C version assumes 44.1 kHz; here the sample rate is a parameter.
//
// The heart of it is Larson & Maddox, "Real-Time Time-Domain Pitch Tracking
// Using Wavelets", plus dynamic tracking that smooths out octave jumps and
// voiced/unvoiced glitches across successive calls.

const MAX_FLWT_LEVELS = 6;
const MAX_F = 3000;
const DIFFERENCE_LEVELS_N = 3;
const MAXIMA_THRESHOLD_RATIO = 0.75;

const floorPow2 = (n) => 2 ** Math.floor(Math.log2(n));

export class PitchTracker {
  constructor(sampleRate = 44100, maxSamples = 4096) {
    this.sampleRate = sampleRate;
    this.prevPitch = -1;
    this.confidence = -1;
    // scratch space, allocated once: this runs on the audio thread
    this.sam = new Float64Array(maxSamples);
    this.distances = new Int32Array(maxSamples);
    this.mins = new Int32Array(maxSamples);
    this.maxs = new Int32Array(maxSamples);
  }

  /** The pitch in Hz of samples[start, start + count), or 0 if there is none. */
  compute(samples, start = 0, count = samples.length) {
    return this.dynamicProcess(this.waveletPitch(samples, start, count));
  }

  waveletPitch(samples, start, count) {
    const sr = this.sampleRate;
    const n = Math.min(floorPow2(count), this.sam.length);
    const { sam, distances, mins, maxs } = this;
    for (let i = 0; i < n; i++) sam[i] = samples[start + i];
    let curSamNb = n;

    // the DC offset and the amplitude threshold for extrema
    let dc = 0;
    let maxValue = 0;
    let minValue = 0;
    for (let i = 0; i < n; i++) {
      const si = sam[i];
      dc += si;
      if (si > maxValue) maxValue = si;
      if (si < minValue) minValue = si;
    }
    dc /= n;
    maxValue -= dc;
    minValue -= dc;
    const amplitudeThreshold = Math.max(maxValue, -minValue) * MAXIMA_THRESHOLD_RATIO;

    let curLevel = 0;
    let curModeDistance = -1;

    for (;;) {
      const delta = Math.trunc(sr / (2 ** curLevel * MAX_F));
      if (curSamNb < 2) return 0;

      // the first maxima and minima after each zero crossing, if they are
      // above the threshold and at least delta apart
      let previousDV = -1000;
      let nbMins = 0;
      let nbMaxs = 0;
      let lastMinIndex = -1000000;
      let lastMaxIndex = -1000000;
      let findMax = false;
      let findMin = false;
      for (let i = 2; i < curSamNb; i++) {
        const si = sam[i] - dc;
        const si1 = sam[i - 1] - dc;
        if (si1 <= 0 && si > 0) findMax = true;
        if (si1 >= 0 && si < 0) findMin = true;
        const dv = si - si1;
        if (previousDV > -1000) {
          if (findMin && previousDV < 0 && dv >= 0 && Math.abs(si) >= amplitudeThreshold && i > lastMinIndex + delta) {
            mins[nbMins++] = i;
            lastMinIndex = i;
            findMin = false;
          }
          if (findMax && previousDV > 0 && dv <= 0 && Math.abs(si) >= amplitudeThreshold && i > lastMaxIndex + delta) {
            maxs[nbMaxs++] = i;
            lastMaxIndex = i;
            findMax = false;
          }
        }
        previousDV = dv;
      }
      if (nbMins === 0 && nbMaxs === 0) return 0;

      // histogram of distances between nearby extrema
      distances.fill(0, 0, n);
      for (let i = 0; i < nbMins; i++) {
        for (let j = 1; j < DIFFERENCE_LEVELS_N && i + j < nbMins; j++) distances[Math.abs(mins[i] - mins[i + j])]++;
      }
      for (let i = 0; i < nbMaxs; i++) {
        for (let j = 1; j < DIFFERENCE_LEVELS_N && i + j < nbMaxs; j++) distances[Math.abs(maxs[i] - maxs[i + j])]++;
      }

      // the best summed distance
      let bestDistance = -1;
      let bestValue = -1;
      for (let i = 0; i < curSamNb; i++) {
        let summed = 0;
        for (let j = -delta; j <= delta; j++) {
          if (i + j >= 0 && i + j < curSamNb) summed += distances[i + j];
        }
        if (summed === bestValue) {
          if (i === 2 * bestDistance) bestDistance = i;
        } else if (summed > bestValue) {
          bestValue = summed;
          bestDistance = i;
        }
      }

      // the mode distance, averaged around the best one
      let distAvg = 0;
      let nbDists = 0;
      for (let j = -delta; j <= delta; j++) {
        const k = bestDistance + j;
        if (k >= 0 && k < n && distances[k] > 0) {
          nbDists += distances[k];
          distAvg += k * distances[k];
        }
      }
      distAvg /= nbDists;

      // two consecutive levels agree: that's the pitch
      if (curModeDistance > -1) {
        if (Math.abs(distAvg * 2 - curModeDistance) <= 2 * delta) {
          return sr / (2 ** (curLevel - 1) * curModeDistance);
        }
      }

      curModeDistance = distAvg;
      curLevel++;
      if (curLevel >= MAX_FLWT_LEVELS || curSamNb < 2) return 0;

      // downsample by two
      for (let i = 0; i < curSamNb / 2; i++) sam[i] = (sam[2 * i] + sam[2 * i + 1]) / 2;
      curSamNb = Math.trunc(curSamNb / 2);
    }
  }

  // A pitch can't jump by more than 20% at once, can't double or halve all of
  // a sudden (that's the algorithm slipping an octave), and a lone voiced
  // frame or a lone gap in a voiced stretch is smoothed over.
  dynamicProcess(pitch) {
    if (pitch === 0) pitch = -1;
    let estimated = -1;
    const acceptedError = 0.2;
    const maxConfidence = 5;

    if (pitch !== -1) {
      if (this.prevPitch === -1) {
        estimated = pitch;
        this.prevPitch = pitch;
        this.confidence = 1;
      } else if (Math.abs(this.prevPitch - pitch) / pitch < acceptedError) {
        this.prevPitch = pitch;
        estimated = pitch;
        this.confidence = Math.min(maxConfidence, this.confidence + 1);
      } else if (this.confidence >= maxConfidence - 2 && Math.abs(this.prevPitch - 2 * pitch) / (2 * pitch) < acceptedError) {
        estimated = 2 * pitch;
        this.prevPitch = estimated;
      } else if (this.confidence >= maxConfidence - 2 && Math.abs(this.prevPitch - 0.5 * pitch) / (0.5 * pitch) < acceptedError) {
        estimated = 0.5 * pitch;
        this.prevPitch = estimated;
      } else if (this.confidence >= 1) {
        estimated = this.prevPitch;
        this.confidence = Math.max(0, this.confidence - 1);
      } else {
        estimated = pitch;
        this.prevPitch = pitch;
        this.confidence = 1;
      }
    } else if (this.prevPitch !== -1) {
      if (this.confidence >= 1) {
        estimated = this.prevPitch;
        this.confidence = Math.max(0, this.confidence - 1);
      } else {
        this.prevPitch = -1;
        estimated = -1;
        this.confidence = 0;
      }
    }

    return this.confidence >= 1 && estimated !== -1 ? estimated : 0;
  }
}
