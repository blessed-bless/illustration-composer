import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const T={'.html':'text/html;charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml'};
const port=process.env.PORT||5173;
http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p.endsWith('/'))p+='index.html';
const f=path.join(import.meta.dirname,path.normalize(p));if(!f.startsWith(import.meta.dirname)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){r.writeHead(404);return r.end('404');}
r.writeHead(200,{'content-type':T[path.extname(f)]||'application/octet-stream'});fs.createReadStream(f).pipe(r);}).listen(port,()=>console.log('http://localhost:'+port));
