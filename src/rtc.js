// Peer-to-peer media: one RTCPeerConnection per other person (a mesh, fine for
// a handful of people). Signalling rides the room WebSocket. Whoever joins
// later makes the offers, so the two sides never offer at once.
const ICE = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];

export class Mesh {
  // signal(to, data) sends to one peer; onStream(id, stream | null) reports their media.
  constructor({ stream, signal, onStream }) {
    this.stream = stream;
    this.signal = signal;
    this.onStream = onStream;
    this.peers = new Map();
  }

  _peer(id) {
    let pc = this.peers.get(id);
    if (pc) return pc;
    pc = new RTCPeerConnection({ iceServers: ICE });
    pc.pending = [];
    this.peers.set(id, pc);
    pc.onicecandidate = (ev) => { if (ev.candidate) this.signal(id, { candidate: ev.candidate }); };
    pc.ontrack = (ev) => this.onStream(id, ev.streams[0] ?? new MediaStream([ev.track]));
    pc.onconnectionstatechange = () => { if (pc.connectionState === 'failed') pc.restartIce?.(); };
    for (const track of this.stream?.getTracks() ?? []) pc.addTrack(track, this.stream);
    return pc;
  }

  async call(id) {
    const pc = this._peer(id);
    // With no camera or mic of our own we still want to receive theirs.
    const kinds = new Set((this.stream?.getTracks() ?? []).map((t) => t.kind));
    for (const kind of ['audio', 'video']) if (!kinds.has(kind)) pc.addTransceiver(kind, { direction: 'recvonly' });
    await pc.setLocalDescription(await pc.createOffer());
    this.signal(id, { description: pc.localDescription });
  }

  async receive(from, data) {
    const pc = this._peer(from);
    try {
      if (data.description) {
        await pc.setRemoteDescription(data.description);
        for (const c of pc.pending.splice(0)) await pc.addIceCandidate(c);
        if (data.description.type === 'offer') {
          await pc.setLocalDescription(await pc.createAnswer());
          this.signal(from, { description: pc.localDescription });
        }
      } else if (data.candidate) {
        if (pc.remoteDescription) await pc.addIceCandidate(data.candidate);
        else pc.pending.push(data.candidate);
      }
    } catch (err) { console.warn('rtc', from, err); }
  }

  drop(id) {
    this.peers.get(id)?.close();
    this.peers.delete(id);
    this.onStream(id, null);
  }
}
