const path=require('node:path'),fs=require('node:fs'),assert=require('node:assert/strict');
const local=(p)=>require(path.join(process.cwd(),p));
const {startServer}=local('tests/helpers/server-control');
const {connectSocket,emitAck,closeSocket}=local('tests/helpers/socket-client');
const {chromium}=local('node_modules/playwright');
const {createVideoSessionRegistry}=local('services/video/video-session-registry');
(async()=>{
 let app=await startServer({env:{VIDEO_PROVIDER:'mesh'}}), socket;
 const stateFile=app.roomStateFile;
 try{
  socket=await connectSocket(app.baseUrl,{clientId:'board-probe'});
  const created=await emitAck(socket,'create-room',{roomName:'Synthetic board bounds'}),roomId=created.room.roomId;
  assert.equal((await emitAck(socket,'join-room',{roomId,username:'Synthetic'})).ok,true);
  assert.equal((await emitAck(socket,'board-add-task',{text:'Positive control'})).ok,true);
  await new Promise(resolve=>setTimeout(resolve,400));
  const rows=JSON.parse(fs.readFileSync(stateFile,'utf8'));
  await closeSocket(socket);socket=null; await app.stop();
  const row=rows.find(x=>x.roomId===roomId || x.id===roomId);assert.ok(row);
  const seed=row.board.tasks[0];row.board.tasks=Array.from({length:100},(_,i)=>({...seed,id:`synthetic-${i}`}));
  fs.writeFileSync(stateFile,JSON.stringify(rows));
  app=await startServer({roomStateFile:stateFile,resetStateFileOnStart:false,env:{VIDEO_PROVIDER:'mesh'}});
  socket=await connectSocket(app.baseUrl,{clientId:'board-probe'});
  const joined=await emitAck(socket,'join-room',{roomId,username:'Synthetic'});assert.equal(joined.room.board.tasks.length,100);
  const ack=await emitAck(socket,'board-add-task',{text:'Beyond seeded sample'});assert.equal(ack.ok,true);
  const view=await app.request(`/api/rooms/${roomId}`);assert.equal(view.body.board.tasks.length,101);
  const board={seeded:100,after:101,ack:ack.ok,networkTaskWrites:2,note:'100 is a bounded audit sample, not an existing documented product cap. Source trace confirms no task-count ceiling.'};
  const browser=await chromium.launch({channel:'chrome',args:['--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1']});
  let lobby;
  try{
   const page=await browser.newPage();await page.goto(app.baseUrl+'/lobby');
   lobby=await page.evaluate(async()=>{
    let leaves=0;const intervals=[];
    window.setInterval=(_callback,ms)=>{intervals.push(ms);return 123;};
    window.fetch=async()=>new Response(JSON.stringify({ok:true,authToken:'synthetic',role:'viewer'}),{status:200});
    window.HalastudyRealtimeKitClient={joinHeadless:async()=>({meeting:{self:{},participants:{}},leave:async()=>{leaves++;}})};
    const joined=await window.connectRealtimeKit('viewer');
    window.dispatchEvent(new Event('pagehide'));
    return {joined:joined.ok,intervals,leaveCalls:leaves};
   });
   assert.equal(lobby.joined,true);assert.equal(lobby.intervals.length,0);assert.equal(lobby.leaveCalls,0);
  }finally{await browser.close();}
  let now=1000;const registry=createVideoSessionRegistry({now:()=>now});
  registry.registerVideoSession({roomId:'LOBBY',userId:'synthetic',clientSessionId:'no-heartbeat'});
  registry.registerVideoSession({roomId:'LOBBY',userId:'synthetic',clientSessionId:'heartbeat'});
  now+=151000;registry.touchVideoSession({roomId:'LOBBY',userId:'synthetic',clientSessionId:'heartbeat'});
  assert.equal(registry.sweepStaleVideoSessions().length,1);assert.equal(registry.listActive()[0].clientSessionId,'heartbeat');
  fs.writeFileSync(path.join(__dirname,'evidence','remaining-probes.json'),JSON.stringify({board,lobby,registry:{staleSessionEnded:true,touchedSessionRetained:true}},null,2));
  console.log(JSON.stringify({board,lobby}));
 }finally{if(socket)await closeSocket(socket);await app.stop();}
})().catch(e=>{console.error(e);process.exitCode=1;});
