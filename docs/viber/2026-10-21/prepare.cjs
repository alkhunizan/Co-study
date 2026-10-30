const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const crypto = require('node:crypto');
const root = process.cwd();
const output = __dirname;
if (fs.existsSync(path.join(output, 'evidence', 'snapshot.json'))) {
  throw new Error('Historical one-use snapshot: refusing to overwrite the initial evidence.');
}
const runtime = path.join(process.env.LOCALAPPDATA, 'Temp', 'halastudy-viber-2026-10-21');
const safe = '%(prefix)///192.168.50.113/E/D-Backup/OS/Claude-Projects/body_doubling_live_cam/workspace/Co-study';
const git = (...args) => cp.execFileSync('git', ['-c', `safe.directory=${safe}`, ...args], {cwd: root, encoding:'utf8'});
fs.mkdirSync(runtime, {recursive:true});
const archive = path.join(runtime, 'head.tar');
git('archive', '--format=tar', `--output=${archive}`, 'HEAD');
for(const name of ['head','candidate']) {
  const dest = path.join(runtime,name);
  fs.mkdirSync(dest,{recursive:true});
  cp.execFileSync('tar.exe',['-xf',archive,'-C',dest]);
}
const files = [...new Set(git('ls-files','-co','--exclude-standard','-z').split('\0').filter(Boolean))]
  .filter(file=>! /^(?:docs\/|data\/|\.claude\/|\.gstack\/|\.env$)/.test(file));
const manifest=[];
for(const file of files){
  const from=path.join(root,file); if(!fs.statSync(from).isFile()) continue;
  const to=path.join(runtime,'candidate',file);
  fs.mkdirSync(path.dirname(to),{recursive:true});fs.copyFileSync(from,to);
  manifest.push({file,sha256:crypto.createHash('sha256').update(fs.readFileSync(from)).digest('hex')});
}
fs.writeFileSync(path.join(output,'evidence','snapshot.json'),JSON.stringify({root,runtime,head:git('rev-parse','HEAD').trim(),files:manifest},null,2));
console.log(JSON.stringify({runtime,files:manifest.length,envCopied:fs.existsSync(path.join(runtime,'candidate','.env'))}));
