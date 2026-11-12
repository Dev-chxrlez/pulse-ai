import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const directory = fileURLToPath(new URL('../server/', import.meta.url));
const port = process.env.DEMO_PORT || '4173';
const child = spawn(process.execPath, ['--env-file-if-exists=.env', 'src/index.js'], {
  cwd: directory,
  stdio: 'inherit',
  env: { ...process.env, PORT: port, HOST: '127.0.0.1', SERVE_CLIENT: 'true', ...(process.env.DEMO_DATA_DIR ? { DATA_DIR: process.env.DEMO_DATA_DIR } : {}) },
});
child.on('error', error => { console.error(`Could not start demo: ${error.code || error.name}`); process.exitCode = 1; });
child.on('exit', (code, signal) => { process.exitCode = code ?? (['SIGINT', 'SIGTERM'].includes(signal) ? 0 : 1); });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
