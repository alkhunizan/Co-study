const fs=require('node:fs');const path=require('node:path');const {spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');const runner='C:/Users/alkhu/.agents/skills/tester/scripts/journey.mjs';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{const names=['create-mobile','create-desktop','discover-mobile','recover-mobile','english-mobile','article-mobile','privacy-mobile','english-menu-close-mobile'];
for(let i=0;i<names.length;i++){const slug=names[i],out=path.join(root,'journeys',slug);console.log('START '+slug);
const r=spawnSync(process.execPath,[runner,path.join(root,'journeys',slug+'.json'),'--out',out],{encoding:'utf8',timeout:180000,windowsHide:true});
fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'runner.log'),(r.stdout||'')+(r.stderr||''));console.log(r.stdout||r.error||r.stderr);if(r.status!==0)console.log('Runner exit '+r.status+'; inspect evidence before classification.');
if(i<names.length-1)await sleep(15000);
}})().catch(e=>{console.error(e);process.exitCode=1;});
