// Entry point of a Node worker thread that runs behavior programs: gives the
// shared sandbox code the `self` it expects (postMessage in, messages out),
// then loads it. The sandbox strips the Node globals itself.
import { parentPort } from 'node:worker_threads';

const port = parentPort;
globalThis.self = {
  postMessage: (m) => port.postMessage(m),
  addEventListener: (type, fn) => { if (type === 'message') port.on('message', (data) => fn({ data })); },
};
await import('../../src/behavior/sandbox.worker.js');
