$env:TEMP = (New-Item -ItemType Directory -Force "$env:LOCALAPPDATA/Temp/halastudy-viber-2026-10-20/socket-boundary").FullName
$env:TMP = $env:TEMP
$env:BACKUP_INTERVAL_MINUTES = '0'
$env:PLATFORM_DATABASE_URL = ''
$env:SUPABASE_URL = ''
$env:SUPABASE_SERVICE_ROLE_KEY = ''
@'
const fs=require('fs');
const crypto=require('crypto');
const {io}=require('socket.io-client');
const {startServer}=require('./tests/helpers/server-control');
(async()=>{
  const server=await startServer({env:{VIDEO_PROVIDER:'mesh'}});
  let socket;
  const evidence={target:server.baseUrl,scope:'isolated synthetic server; no external providers'};
  try {
    evidence.healthBefore=(await server.request('/api/health')).status;
    socket=io(server.baseUrl,{transports:['websocket'],reconnection:false,auth:{clientId:crypto.randomUUID()}});
    await new Promise((resolve,reject)=>{socket.once('connect',resolve);socket.once('connect_error',reject)});
    evidence.validControl=await new Promise(resolve=>socket.timeout(5000).emit('create-room',{roomName:'Boundary control'},(error,response)=>resolve({error:error?.message,ok:response?.ok,errorCode:response?.errorCode})));
    evidence.attack={event:'create-room',payload:null,authenticated:false};
    evidence.ack=await new Promise(resolve=>socket.timeout(1500).emit('create-room',null,(error,response)=>resolve({error:error?.message,response})));
    try { evidence.healthAfter=(await server.request('/api/health')).status; }
    catch(error){ evidence.healthAfter={connectionError:error.code}; }
    evidence.serverError=server.logs().stderr.split(/\r?\n/).filter(line=>/TypeError|Cannot destructure|co-study-server\.js|Node\.js/.test(line));
    evidence.processCrash=typeof evidence.healthAfter==='object' && evidence.serverError.some(line=>line.includes('TypeError'));
    fs.writeFileSync(require('path').join(process.env.VIBER_EVIDENCE_DIR,'socket-boundary.json'),JSON.stringify(evidence,null,2));
    console.log(JSON.stringify(evidence,null,2));
  } finally {socket?.disconnect();await server.stop();}
})().catch(error=>{console.error(error);process.exitCode=1});
'@ | & 'C:\Users\alkhu\AppData\Local\npm-cache\_npx\52027bd8fc0022aa\node_modules\node\bin\node.exe'
exit $LASTEXITCODE
