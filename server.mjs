import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
const base = fileURLToPath(new URL('.', import.meta.url));
const dist = process.argv.includes('--dist');
const root = resolve(base, dist ? 'dist' : '.');
const types = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json','.svg':'image/svg+xml','.jpg':'image/jpeg','.png':'image/png','.webp':'image/webp','.mp4':'video/mp4','.ttf':'font/ttf','.woff2':'font/woff2','.txt':'text/plain; charset=utf-8'};
http.createServer(async (req,res)=>{
  try {
    const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    const rel=pathname==='/' ? 'index.html' : pathname.replace(/^\/+/, '');
    const asset=!dist && (/^(media|fonts|brand)\//.test(rel) || rel==='favicon.svg');
    const file=resolve(root,asset ? 'public' : '.',rel);
    if(!file.startsWith(root+sep)){res.writeHead(403);res.end();return;}
    const info=await stat(file);
    if(!info.isFile())throw Error('Not a file');
    const data=await readFile(file);
    const headers={'Content-Type':types[extname(file)]||'application/octet-stream','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'};
    const range=req.headers.range?.match(/^bytes=(\d+)-(\d*)$/);
    if(range){
      const start=Number(range[1]);const end=range[2]?Math.min(Number(range[2]),data.length-1):data.length-1;
      if(start>=data.length||start>end){res.writeHead(416,{'Content-Range':`bytes */${data.length}`});res.end();return;}
      res.writeHead(206,{...headers,'Accept-Ranges':'bytes','Content-Range':`bytes ${start}-${end}/${data.length}`,'Content-Length':end-start+1});res.end(data.subarray(start,end+1));
    }else {res.writeHead(200,{...headers,'Content-Length':data.length,'Accept-Ranges':'bytes'});res.end(req.method==='HEAD'?undefined:data);}
  }catch{res.writeHead(404,{'Content-Type':'text/plain'});res.end('Not found');}
}).listen(Number(process.env.PORT)||5173,'127.0.0.1',()=>console.log(`Hollowick is ready at http://localhost:${Number(process.env.PORT)||5173}`));
