// Permit only local app traffic and at most twelve counted public font GETs.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {chromium}=require(path.join(process.cwd(),'node_modules/playwright'));
const root=process.env.REFINEMENT_OUTPUT, cache=path.join(root,'evidence/font-cache');
fs.mkdirSync(cache,{recursive:true});
const ledger=path.join(root,'evidence/font-requests.ndjson'), launch=chromium.launch.bind(chromium);
chromium.launch=async options=>{
 const browser=await launch(options),newContext=browser.newContext.bind(browser);
 browser.newContext=async(...args)=>{
  const context=await newContext(...args);
  await context.route('**/*',async route=>{
   const u=new URL(route.request().url());
   if(!['http:','https:'].includes(u.protocol)||['127.0.0.1','localhost','[::1]'].includes(u.hostname))return route.continue();
   if(!['fonts.googleapis.com','fonts.gstatic.com'].includes(u.hostname)||route.request().method()!=='GET')return route.abort();
   const key=crypto.createHash('sha256').update(u.href).digest('hex'),meta=path.join(cache,key+'.json'),body=path.join(cache,key+'.bin');
   if(fs.existsSync(meta)){const m=JSON.parse(fs.readFileSync(meta));return route.fulfill({status:m.status,headers:m.headers,body:fs.readFileSync(body)});}
   const count=fs.existsSync(ledger)?fs.readFileSync(ledger,'utf8').trim().split('\n').filter(Boolean).length:0;
   if(count>=12)return route.abort();
   fs.appendFileSync(ledger,JSON.stringify({number:count+1,method:'GET',url:u.href})+'\n');
   try{
    const response=await route.fetch({maxRedirects:0}),bytes=await response.body();
    fs.writeFileSync(body,bytes);fs.writeFileSync(meta,JSON.stringify({url:u.href,status:response.status(),headers:response.headers()}));
    return route.fulfill({response});
   }catch{return route.abort();}
  });
  return context;
 };
 return browser;
};
