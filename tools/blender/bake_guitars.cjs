// Exports every MVP guitar/bass from the game's own builder: run `npx vite` (URL=http://localhost:PORT), then
// NODE_PATH=$(npm root -g) node tools/blender/bake_guitars.cjs <out dir>   -> <out>/guitars/<id>.glb, <out>/basses/<id>.glb
const { chromium } = require('playwright'); const fs=require('fs'); const path=require('path');
(async()=>{ const b=await chromium.launch({args:['--use-gl=swiftshader','--enable-unsafe-swiftshader']}); const p=await b.newPage();
p.on('pageerror',e=>console.log('err',e.message)); p.on('console',m=>{ if(m.type()==='error') console.log(m.text().slice(0,300)); });
await p.goto(''+(process.env.URL||'http://localhost:5179')+'/tools/blender/bake_guitars.html'); await p.waitForFunction(()=>window.__done,null,{timeout:300000});
const out=await p.evaluate(()=>window.__out);
for (const [k,v] of Object.entries(out)) { const f=path.join(process.argv[2]||'bake',k+'.glb'); fs.mkdirSync(path.dirname(f),{recursive:true}); fs.writeFileSync(f,Buffer.from(v,'base64')); console.log(k, fs.statSync(f).size); }
await b.close(); })();
