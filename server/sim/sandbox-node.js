// Sandboxes for the sim server. nodeSandbox() runs programs in a worker
// thread with memory limits: fine on your own machine, but a worker thread is
// not a security boundary (see docs/multiplayer-plan.md, section 7). Before a
// server is reachable from the internet, SANDBOX=isolate picks the V8 isolate
// in sandbox-isolate.js instead.
import { Worker } from 'node:worker_threads';
import { Sandbox } from '../../src/behavior/sandbox-host.js';

export function nodeSandbox(opts = {}) {
  const w = new Worker(new URL('./sandbox-thread.mjs', import.meta.url), {
    resourceLimits: { maxOldGenerationSizeMb: 64, maxYoungGenerationSizeMb: 16, stackSizeMb: 4 },
    stdout: false, stderr: false,
  });
  w.unref();
  return new Sandbox({
    post: (m) => w.postMessage(m),
    onMessage: (fn) => {
      w.on('message', fn);
      w.on('error', (err) => fn({ type: 'error', message: err?.message ?? String(err), fatal: true }));
      w.on('exit', (code) => { if (code !== 0) fn({ type: 'error', message: `sandbox exited (${code})`, fatal: true }); });
    },
    terminate: () => w.terminate(),
  }, opts);
}

let pick = null;
export async function sandboxFactory() {
  if (pick) return pick;
  if (process.env.SANDBOX === 'isolate') {
    const { isolateSandbox } = await import('./sandbox-isolate.js');
    pick = isolateSandbox;
  } else pick = nodeSandbox;
  return pick;
}
