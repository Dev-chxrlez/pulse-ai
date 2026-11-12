import {fileURLToPath} from 'node:url';

const ENTRY = fileURLToPath(new URL('../../../client/src/video/index.js', import.meta.url));
let served = null;

// Bundle the shared templates once per server process (about 4 s), then reuse.
async function serveUrl() {
  if (!served) {
    const {bundle} = await import('@remotion/bundler');
    served = bundle({entryPoint: ENTRY, onProgress: () => {}}).catch(error => { served = null; throw error; });
  }
  return served;
}
export async function renderVideo({templateId, inputProps, output, onProgress = () => {}}) {
  const {renderMedia, selectComposition} = await import('@remotion/renderer');
  const url = await serveUrl();
  const composition = await selectComposition({serveUrl: url, id: templateId, inputProps, logLevel: 'error'});
  await renderMedia({composition, serveUrl: url, codec: 'h264', outputLocation: output, inputProps, logLevel: 'error', onProgress: ({progress}) => onProgress(progress)});
  return {frames: composition.durationInFrames, fps: composition.fps};
}
