const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const runtime=path.join(process.env.LOCALAPPDATA,'Temp/halastudy-viber-2026-10-21/candidate');
const evidence=path.join(__dirname,'evidence'),env={...process.env};
for(const name of Object.keys(env))if(/^(?:SUPABASE_|PLATFORM_|CLOUDFLARE_|R2_|DIGETPAY_|OPS_ALERT_|AUTH_MAIL_|BILLING_|SESSION_SECRET|HALASTUDY_TEST_DATABASE_URL|NODE_OPTIONS|DEBUG)/.test(name))delete env[name];
Object.assign(env,{NODE_ENV:'test',PLATFORM_DATA_DIR:'memory://',CO_STUDY_OFFLINE:'1',EXPECT_BLUR_CLOSED:'1',PROBE_LABEL:'final',VIBER_EVIDENCE:evidence,
 NODE_OPTIONS:`--require="${path.join(runtime,'../offline-browser-preload.cjs').replace(/\\/g,'/')}"`});
const receipts=[];
for(const name of process.argv.slice(2)){
 const fd=fs.openSync(path.join(evidence,`final-${name}.txt`),'w');
 const result=spawnSync(process.execPath,[path.join(__dirname,`${name}.cjs`)],{cwd:runtime,env,stdio:['ignore',fd,fd],timeout:180000});fs.closeSync(fd);
 const row={name,exitCode:result.status,error:result.error?.message};receipts.push(row);console.log(row);
 fs.writeFileSync(path.join(evidence,'final-probe-commands.json'),JSON.stringify(receipts,null,2));
}
