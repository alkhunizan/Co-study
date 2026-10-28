const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const runtime = path.join(process.env.LOCALAPPDATA,'Temp','halastudy-viber-2026-10-21','candidate');
const evidence = path.join(__dirname,'evidence');
const env = {...process.env};
for(const name of Object.keys(env)) if(/^(?:SUPABASE_|PLATFORM_|CLOUDFLARE_|R2_|DIGETPAY_|OPS_ALERT_|AUTH_MAIL_|BILLING_|SESSION_SECRET|HALASTUDY_TEST_DATABASE_URL|NODE_OPTIONS)/.test(name)) delete env[name];
Object.assign(env,{NODE_ENV:'test', PLATFORM_DATA_DIR:'memory://', CO_STUDY_OFFLINE:'1',CO_STUDY_SMOKE_PORT:'3465',PLAYWRIGHT_CHANNEL:'chrome',PLAYWRIGHT_OUTPUT_DIR:path.join(evidence,'browser'),PLAYWRIGHT_HTML_OUTPUT_DIR:path.join(evidence,'browser-report')});
env.PATH=path.dirname(process.execPath)+';'+env.PATH;
if (process.env.VIBER_FINAL === '1') {
 const preload=path.join(runtime,'..','offline-browser-preload.cjs');
 fs.copyFileSync(path.join(__dirname,'offline-browser-preload.cjs'),preload);
 env.NODE_OPTIONS=`--require="${preload.replace(/\\/g, '/')}"`;
 env.VIBER_EVIDENCE=evidence;
}
const npm = 'C:/Program Files/nodejs/node_modules/npm/bin/npm-cli.js';
const names = process.argv.slice(2);
const ledger=[];
for(const name of names){
 const args = name==='install' ? [npm,'ci','--no-audit','--no-fund'] : [npm,'run',name];
 const log=path.join(evidence,`${name.replace(/:/g,'-')}.txt`), fd=fs.openSync(log,'w');
 const start=Date.now(); const result=spawnSync(process.execPath,args,{cwd:runtime,env,stdio:['ignore',fd,fd],timeout:1200000}); fs.closeSync(fd);
 const row={command:args.slice(1).join(' '),exitCode:result.status,seconds:(Date.now()-start)/1000,error:result.error?.message,log};
 ledger.push(row); console.log(JSON.stringify(row)); fs.writeFileSync(path.join(evidence,`commands-${names[0].replace(/:/g,'-')}.json`),JSON.stringify(ledger,null,2));
 if(name==='install'&&result.status!==0)process.exit(1);
}
