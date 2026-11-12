export async function apiRequest(path, options = {}, timeout = 15000) {
  let response;
  try {
    response = await fetch(`/api/${path}`, { ...options, signal: AbortSignal.timeout(timeout) });
  } catch (error) {
    throw new Error(error.name === 'TimeoutError' ? 'The server took too long to respond. Try again.' : 'Cannot reach the server. Check your connection and try again.');
  }
  let result;
  try { result = await response.json(); }
  catch { throw new Error('The server returned an unexpected response. Check that the PULSE API is running.'); }
  if (!response.ok) { const error = new Error(result.error?.message || `Request failed (${response.status}). Please try again.`); error.code = result.error?.code; throw error; }
  return result;
}
export const get = path => apiRequest(path);
export function uploadVideo(file, onProgress, {path='/api/videos',headers={}} = {}) {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('POST', path);
    for (const [key,value] of Object.entries(headers)) request.setRequestHeader(key,value);
    request.timeout = 10 * 60 * 1000;
    request.upload.onprogress = event => { if(event.lengthComputable) onProgress(Math.round(event.loaded / event.total * 100)); };
    request.onerror = () => reject(new Error('Cannot reach the server. Check your connection and try again.'));
    request.ontimeout = () => reject(new Error('Upload timed out. Check your library before uploading again; the server may have received the file.'));
    request.onabort = () => reject(new Error('Upload was canceled.'));
    request.onload = () => {
      let data;
      try { data = JSON.parse(request.responseText); }
      catch { reject(new Error('Unexpected server response. Check the API and your library before retrying.')); return; }
      if(request.status >= 200 && request.status < 300) resolve(data.video);
      else reject(new Error(data.error?.message || 'Upload failed.'));
    };
    const form = new FormData(); form.append('video', file); request.send(form);
  });
}
export const analyzeVideo = async id => (await apiRequest(`videos/${encodeURIComponent(id)}/analyze`, { method: 'POST' })).video;
export const requestCreative = async (id, refresh = false) => (await apiRequest(`videos/${encodeURIComponent(id)}/creative${refresh ? '?refresh=1' : ''}`, { method: 'POST' })).video;
export function previewPerformance(file) {
  const form = new FormData(); form.append('csv', file);
  return apiRequest('performance/preview', { method: 'POST', body: form }, 20000);
}
export const commitPerformance = id => apiRequest(`performance/imports/${encodeURIComponent(id)}`, { method: 'POST' }, 20000);
export const matchPerformance = (id, videoId) => apiRequest(`performance/${encodeURIComponent(id)}/match`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ videoId }) }, 20000);
