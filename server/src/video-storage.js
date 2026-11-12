import {stat,rename,unlink} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {fileTypeFromFile} from 'file-type';
export const videoTypes={'.mp4':['video/mp4'],'.mov':['video/quicktime'],'.webm':['video/webm']};
export function createVideoStorage({store,mediaDir,maxBytes}){
  return {async save({filename,originalName,source}){
    let owned=filename;
    try{
      const info=await stat(filename);if(!info.isFile()||!info.size)throw Object.assign(new Error('Choose a non-empty video using the video field.'),{status:400});
      if(info.size>maxBytes)throw Object.assign(new Error('Video exceeds the configured upload limit.'),{status:413});
      const extension=path.extname(originalName).toLowerCase();const detected=await fileTypeFromFile(filename).catch(error=>{if(error.code)throw error;return undefined;});
      if(!detected||!videoTypes[extension]?.includes(detected.mime))throw Object.assign(new Error('The file contents do not match a supported video container.'),{status:415});
      const id=randomUUID(),storageName=id+extension;await rename(filename,path.join(mediaDir,storageName));owned=path.join(mediaDir,storageName);
      const name=[...path.basename(originalName)].filter(character=>character.charCodeAt(0)>=32&&character.charCodeAt(0)!==127).join('').slice(0,255);
      const record={id,storageName,originalName:name,mimeType:detected.mime,size:info.size,uploadedAt:new Date().toISOString(),status:'uploaded',...(source?{source}:{})};
      await store.add(record);owned=null;return record;
    }finally{if(owned)await unlink(owned).catch(()=>{});}
  }};
}
