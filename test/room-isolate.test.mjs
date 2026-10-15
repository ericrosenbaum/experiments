// The room checks again, with programs in V8 isolates (isolated-vm) instead
// of worker threads: the sandbox a public server runs.
process.env.SANDBOX = 'isolate';
await import('./room.test.mjs');
