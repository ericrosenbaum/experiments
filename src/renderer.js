// Draws shapes as vertex-colored triangle strips with WebGL, as the
// original's ofMesh did, on black.

import { STRIDE } from './shape.js';

const VERTEX = `
attribute vec2 position;
attribute vec3 color;
uniform vec2 resolution;
varying vec3 vColor;
void main() {
  vec2 clip = position / resolution * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
  vColor = color;
}`;

const FRAGMENT = `
precision mediump float;
varying vec3 vColor;
void main() {
  gl_FragColor = vec4(vColor, 1.0);
}`;

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.width = 0;
    this.height = 0;
    this.buffers = new Map(); // shape -> { buffer, version }
    this.scratch = null;
    canvas.addEventListener('webglcontextlost', (e) => e.preventDefault());
    canvas.addEventListener('webglcontextrestored', () => this.init());
    this.init();
  }

  init() {
    const gl = this.canvas.getContext('webgl', { antialias: true, alpha: false, preserveDrawingBuffer: false });
    if (!gl) throw new Error('This browser has no WebGL.');
    this.gl = gl;
    const program = gl.createProgram();
    for (const [type, src] of [
      [gl.VERTEX_SHADER, VERTEX],
      [gl.FRAGMENT_SHADER, FRAGMENT],
    ]) {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      gl.attachShader(program, s);
    }
    gl.linkProgram(program);
    gl.useProgram(program);
    this.position = gl.getAttribLocation(program, 'position');
    this.color = gl.getAttribLocation(program, 'color');
    this.resolution = gl.getUniformLocation(program, 'resolution');
    gl.enableVertexAttribArray(this.position);
    gl.enableVertexAttribArray(this.color);
    this.dynamic = gl.createBuffer();
    this.buffers = new Map();
    this.width = 0; // force a resize
  }

  resize() {
    const dpr = Math.min(devicePixelRatio || 1, 3);
    const w = innerWidth;
    const h = innerHeight;
    if (w === this.width && h === this.height && dpr === this.dpr) return;
    this.width = w;
    this.height = h;
    this.dpr = dpr;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
  }

  draw(shapes, time) {
    this.resize();
    const gl = this.gl;
    if (gl.isContextLost()) return;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform2f(this.resolution, this.width, this.height);

    for (const shape of shapes) {
      if (shape.vertexCount < 3) continue;
      if (shape.playing) {
        this.scratch = shape.animatedVertices(time, this.scratch);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.dynamic);
        gl.bufferData(gl.ARRAY_BUFFER, this.scratch.subarray(0, shape.vertexCount * STRIDE), gl.STREAM_DRAW);
      } else {
        let entry = this.buffers.get(shape);
        if (!entry) {
          entry = { buffer: gl.createBuffer(), version: -1 };
          this.buffers.set(shape, entry);
        }
        gl.bindBuffer(gl.ARRAY_BUFFER, entry.buffer);
        if (entry.version !== shape.version) {
          gl.bufferData(gl.ARRAY_BUFFER, shape.vertices.subarray(0, shape.vertexCount * STRIDE), gl.DYNAMIC_DRAW);
          entry.version = shape.version;
        }
      }
      gl.vertexAttribPointer(this.position, 2, gl.FLOAT, false, STRIDE * 4, 0);
      gl.vertexAttribPointer(this.color, 3, gl.FLOAT, false, STRIDE * 4, 8);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, shape.vertexCount);
    }
  }

  /** Free the GL buffers of shapes that are gone. */
  forget(shape) {
    const entry = this.buffers.get(shape);
    if (entry) this.gl.deleteBuffer(entry.buffer);
    this.buffers.delete(shape);
  }
}
