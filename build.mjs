import { cp, mkdir } from 'node:fs/promises';
const root=new URL('.',import.meta.url);
await mkdir(new URL('dist',root),{recursive:true});
await cp(new URL('index.html',root),new URL('dist/index.html',root));
await cp(new URL('src',root),new URL('dist/src',root),{recursive:true});
await cp(new URL('public',root),new URL('dist',root),{recursive:true});
console.log('Built static website in dist/. No runtime dependencies.');
