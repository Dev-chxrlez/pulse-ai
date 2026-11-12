import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {acquireDataLock} from '../src/data-lock.js';

test('data lock prevents concurrent backend writers and releases idempotently',async()=>{
  const directory=await mkdtemp(path.join(tmpdir(),'pulse-lock-'));
  let release;
  try { release=acquireDataLock(directory);assert.throws(()=>acquireDataLock(directory),/Another PULSE backend/);release();release();release=acquireDataLock(directory); }
  finally { release?.();await rm(directory,{recursive:true,force:true}); }
});
