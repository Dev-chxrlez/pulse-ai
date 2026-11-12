import {test} from 'node:test';
import assert from 'node:assert/strict';
import {apiRequest} from '../../client/src/api.js';

test('client errors remain actionable for offline, timeout, proxy HTML, and API failures',async()=>{
  const originalFetch=globalThis.fetch;
  try {
    globalThis.fetch=async()=>{throw new TypeError('fetch failed');};
    await assert.rejects(apiRequest('health'),/Cannot reach the server/);
    globalThis.fetch=async()=>{throw new DOMException('Timed out','TimeoutError');};
    await assert.rejects(apiRequest('health'),/took too long/);
    globalThis.fetch=async()=>new Response('<html>Proxy failure</html>',{status:502,headers:{'Content-Type':'text/html'}});
    await assert.rejects(apiRequest('health'),/unexpected response/);
    globalThis.fetch=async()=>Response.json({error:{message:'Upload limit reached.'}},{status:429});
    await assert.rejects(apiRequest('health'),/Upload limit reached/);
    globalThis.fetch=async(url,options)=>{assert.equal(url,'/api/health');assert.ok(options.signal);return Response.json({status:'ok'});};
    assert.deepEqual(await apiRequest('health'),{status:'ok'});
  }finally{globalThis.fetch=originalFetch;}
});
