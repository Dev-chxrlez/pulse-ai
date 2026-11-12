import { mkdirSync, openSync, closeSync, writeFileSync, readFileSync, unlinkSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';

export function acquireDataLock(directory) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const filename = path.join(directory, '.pulse.lock');
  const token = randomUUID();
  let descriptor;
  try { descriptor = openSync(filename, 'wx', 0o600); }
  catch(error) {
    if(error.code !== 'EEXIST') throw error;
    // Fail closed even for an apparently stale lock: deleting it during concurrent
    // startup could remove a different process's newly acquired lock.
    throw new Error('Another PULSE backend may be using this data directory. Stop npm run dev before npm run demo, or use a separate DEMO_DATA_DIR. If a process crashed, inspect .pulse.lock and confirm its owner stopped before removing that lock.');
  }
  try { writeFileSync(descriptor,JSON.stringify({pid:process.pid,token})); }
  catch(error) { closeSync(descriptor); unlinkSync(filename); throw error; }
  closeSync(descriptor);
  return () => {
    try { if(JSON.parse(readFileSync(filename,'utf8')).token === token) unlinkSync(filename); }
    catch { /* The process may already have released its lock. */ }
  };
}
