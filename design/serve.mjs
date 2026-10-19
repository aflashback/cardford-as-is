import {createServer} from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {resolve,extname,sep,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=dirname(fileURLToPath(import.meta.url));
const port=Number(process.env.DESIGN_PORT||4188);
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.woff2':'font/woff2','.jpg':'image/jpeg','.png':'image/png','.json':'application/json','.md':'text/plain; charset=utf-8'};
createServer(async(req,res)=>{try{const route=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);if(route==='/studio'||route==='/studio/'||route==='/studio/index.html'){res.writeHead(302,{'Location':'/rally/approved/','Cache-Control':'no-store'}).end();return;}let file=resolve(root,'.'+route);if(file!==root&&!file.startsWith(root+sep)){res.writeHead(403).end();return;}if((await stat(file)).isDirectory())file=resolve(file,'index.html');const body=await readFile(file);res.writeHead(200,{'Content-Type':mime[extname(file)]||'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}).end(body);}catch{res.writeHead(404,{'Content-Type':'text/plain'}).end('Page not found');}}).listen(port,'127.0.0.1',()=>console.log(`CardFord Rally: http://127.0.0.1:${port}/rally/`));
