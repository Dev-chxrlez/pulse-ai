import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export async function createStore(directory, basename = 'videos.json') {
  await mkdir(directory, { recursive: true });
  const filename = path.join(directory, basename);
  let records;
  try { records = JSON.parse(await readFile(filename, 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; records = []; }
  if (!Array.isArray(records)) throw new Error('Invalid metadata store');
  let queue = Promise.resolve();
  function mutate(change) {
    const operation = queue.then(async () => {
      const next = change(records);
      const temporary = `${filename}.${randomUUID()}.tmp`;
      await writeFile(temporary, JSON.stringify(next, null, 2), { mode: 0o600 });
      await rename(temporary, filename);
      records = next;
    });
    queue = operation.catch(() => {});
    return operation;
  }
  return {
    list: () => [...records].sort((a, b) => String(b.uploadedAt || b.importedAt || b.pickedAt || '').localeCompare(String(a.uploadedAt || a.importedAt || a.pickedAt || ''))),
    get: id => records.find(video => video.id === id),
    add: record => mutate(records => [...records, record]),
    update: (id, changes) => mutate(records => records.map(record => record.id === id ? { ...record, ...changes } : record)),
    transact: mutate,
  };
}
