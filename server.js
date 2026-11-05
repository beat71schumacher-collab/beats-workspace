// Kleiner Webserver ohne Abhaengigkeiten: macht die App im WLAN erreichbar.
const http=require('http'),fs=require('fs'),path=require('path'),os=require('os');
const PORT=process.env.PORT||8080, ROOT=__dirname;
const T={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.webmanifest':'application/manifest+json','.json':'application/json','.png':'image/png','.md':'text/plain; charset=utf-8'};
http.createServer((q,r)=>{let u=decodeURIComponent(q.url.split('?')[0]);if(u.endsWith('/'))u+='index.html';
const f=path.join(ROOT,path.normalize(u));if(!f.startsWith(ROOT)){r.writeHead(403);return r.end();}
fs.readFile(f,(e,d)=>{if(e){r.writeHead(404);return r.end('Nicht gefunden');}r.writeHead(200,{'Content-Type':T[path.extname(f)]||'application/octet-stream','Cache-Control':'no-cache'});r.end(d);});
}).listen(PORT,'0.0.0.0',()=>{console.log('Beats Workspace laeuft. Auf dem Handy (gleiches WLAN) oeffnen:');
for(const l of Object.values(os.networkInterfaces()).flat())if(l.family==='IPv4'&&!l.internal)console.log('  http://'+l.address+':'+PORT);
console.log('Auf diesem PC: http://localhost:'+PORT+'   (Beenden: Fenster schliessen)');});
