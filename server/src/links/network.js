import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import {lookup} from 'node:dns/promises';
export class LinkError extends Error {constructor(code,message,status=400){super(message);this.code=code;this.status=status;}}
export const facebookHosts=new Set(['facebook.com','www.facebook.com','m.facebook.com','web.facebook.com']);
export function facebookUrl(value){
  let url;try{if(typeof value!=='string'||value.length>2000)throw Error();url=new URL(value);}catch{throw new LinkError('LINK_URL','Enter a complete HTTPS link to one public Facebook video or Reel.');}
  if(url.protocol!=='https:'||url.username||url.password||url.port||!facebookHosts.has(url.hostname))throw new LinkError('LINK_URL','Use an HTTPS Facebook video link, without credentials or custom ports.');
  if(url.hash||[...url.searchParams.keys()].some(key=>/^(list|set|playlist|album|collection)$/i.test(key)))throw new LinkError('LINK_PLAYLIST','Playlists and collections are not supported. Use one video link.');
  const path=url.pathname;
  const video=/^\/(?:reel\/\d+|share\/[vr]\/[A-Za-z0-9]+|[^/]+\/videos\/(?:[^/]+\/)?\d+)\/?$/.test(path);
  const watch=['/watch','/watch/','/video.php'].includes(path)&&/^\d+$/.test(url.searchParams.get('v')||'')&&url.searchParams.getAll('v').length===1;
  if(!video&&!watch)throw new LinkError('LINK_UNSUPPORTED','Use an individual Facebook video, Reel, or share link—not a profile, page, or playlist.');
  url.hash='';return url.href;
}
export function publicIPv4(value){
  if(net.isIP(value)!==4)return false;const [a,b,c]=value.split('.').map(Number);
  return !(a===0||a===10||a===127||a>=224||(a===100&&b>=64&&b<=127)||(a===169&&b===254)||(a===172&&b>=16&&b<=31)||(a===192&&(b===168||b===0||b===2||(b===88&&c===99)))||(a===198&&(b===18||b===19||(b===51&&c===100)))||(a===203&&b===0&&c===113));
}
export async function publicAddress(host,resolve=lookup){
  let timer;let addresses;try{addresses=await Promise.race([resolve(host,{all:true,family:4}),new Promise((_resolve,reject)=>{timer=setTimeout(()=>reject(new LinkError('LINK_TIMEOUT','Facebook DNS lookup timed out. Retry later.',422)),5000);})]);}finally{clearTimeout(timer);}
  if(!addresses.length||addresses.some(row=>!publicIPv4(row.address)))throw new LinkError('LINK_NETWORK','The link resolved to a blocked or non-public network destination.');
  return addresses[0].address;
}
const mediaHost=host=>facebookHosts.has(host)||/^[a-z0-9.-]+\.fbcdn\.net$/.test(host);
export async function resolveFacebook(value,{resolve=lookup,maxRedirects=5}={}){
  let url=facebookUrl(value);
  for(let index=0;index<=maxRedirects;index++){
    const target=new URL(url),address=await publicAddress(target.hostname,resolve);
    const response=await new Promise((resolveResponse,reject)=>{
      const request=https.get(target,{lookup:(_hostname,options,callback)=>options.all?callback(null,[{address,family:4}]):callback(null,address,4),headers:{'User-Agent':'Mozilla/5.0'},timeout:15000},res=>{const result={status:res.statusCode,location:res.headers.location};res.destroy();resolveResponse(result);});
      request.on('timeout',()=>request.destroy(new Error('timeout')));request.on('error',()=>reject(new LinkError('LINK_UNAVAILABLE','Facebook could not be reached. Check that the public video is available.',422)));
    });
    if([301,302,303,307,308].includes(response.status)){
      if(!response.location)throw new LinkError('LINK_REDIRECT','Facebook returned an invalid redirect.',422);
      const next=new URL(response.location,url);
      if(/^\/(?:login|checkpoint|auth)(?:\/|\.php|$)/.test(next.pathname))throw new LinkError('LINK_LOGIN','Facebook requires sign-in for this video. Use a publicly accessible video; PULSE will not use cookies or credentials.',422);
      url=facebookUrl(next.href);continue;
    }
    if(response.status>=400)throw new LinkError('LINK_UNAVAILABLE','The Facebook video is unavailable or not accessible publicly.',422);
    return url;
  }
  throw new LinkError('LINK_REDIRECT','The link exceeded the supported redirect limit.',422);
}
// yt-dlp MUST use this proxy: each HTTPS hop is hostname-checked and IP-pinned.
// Only IPv4 is enabled; no unchecked DNS lookup happens after validation.
export async function restrictedProxy({maxBytes,resolve=lookup}){
  let transferred=0;const sockets=new Set();
  const server=http.createServer((_req,res)=>{res.writeHead(403);res.end();});
  server.on('connection',socket=>{sockets.add(socket);socket.on('close',()=>sockets.delete(socket));socket.on('error',()=>{});});
  server.on('connect',async(req,client,head)=>{
    try{
      const match=/^([a-z0-9.-]+):443$/i.exec(req.url);
      if(!match||!mediaHost(match[1].toLowerCase()))throw Error();
      const host=match[1].toLowerCase(),address=await publicAddress(host,resolve);
      if(client.destroyed)return;
      const upstream=net.connect({host:address,port:443});sockets.add(upstream);
      upstream.on('close',()=>sockets.delete(upstream));upstream.on('error',()=>client.destroy());client.on('error',()=>upstream.destroy());client.on('close',()=>upstream.destroy());
      upstream.setTimeout(20000,()=>upstream.destroy());
      upstream.on('data',chunk=>{transferred+=chunk.length;if(transferred>maxBytes)for(const socket of sockets)socket.destroy();});
      upstream.once('connect',()=>{client.write('HTTP/1.1 200 Connection Established\r\n\r\n');if(head.length)upstream.write(head);client.pipe(upstream).pipe(client);});
    }catch{client.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');}
  });
  await new Promise((resolveListen,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolveListen);});
  return {url:`http://127.0.0.1:${server.address().port}`,close:async()=>{for(const socket of sockets)socket.destroy();await new Promise(resolveClose=>server.close(resolveClose));}};
}
