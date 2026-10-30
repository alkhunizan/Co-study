const path=require('node:path');
const fs=require('node:fs');
const assert=require('node:assert/strict');
const {startServer}=require(path.join(process.cwd(),'tests/helpers/server-control'));
const {connectSocket,emitAck,closeSocket}=require(path.join(process.cwd(),'tests/helpers/socket-client'));
const pause=(ms)=>new Promise((resolve)=>setTimeout(resolve,ms));
async function main(){
    const app=await startServer({env:{VIDEO_PROVIDER:'mesh'}});
    const sockets=[];
    const receipts=[];
    try{
        for(const clientId of ['viber-sender','viber-peer','viber-outsider']) sockets.push(await connectSocket(app.baseUrl,{clientId}));
        const [sender,peer,outsider]=sockets;
        const created=await emitAck(sender,'create-room',{roomName:'Synthetic signaling audit'});
        assert.equal(created.ok,true);
        for(const [index,socket] of [sender,peer].entries()) assert.equal((await emitAck(socket,'join-room',{roomId:created.room.roomId,username:`Synthetic ${index}`})).ok,true);
        for(const event of ['camera-status','rtc-offer','rtc-answer','rtc-ice']){
            const outside=[];
            const outsideListener=(value)=>outside.push(value);
            outsider.on(event,outsideListener);
            const field=event==='rtc-ice'?'candidate':'sdp';
            const value=event==='rtc-ice'?{candidate:'synthetic-candidate'}:{type:event==='rtc-answer'?'answer':'offer',sdp:'synthetic-sdp'};
            const positive=new Promise((resolve,reject)=>{
                const timer=setTimeout(()=>reject(new Error(`${event} relay absent`)),2000);
                peer.once(event,(message)=>{clearTimeout(timer);resolve(message);});
            });
            sender.emit(event,event==='camera-status'?{camera:true}:{targetId:peer.id,[field]:value});
            const received=await positive;
            if(event==='camera-status') assert.deepEqual(received,{userId:sender.id,camera:true});
            else{
                assert.equal(received.from,sender.id);
                assert.deepEqual(received[field],value);
                sender.emit(event,{targetId:outsider.id,[field]:value});
            }
            await pause(200);
            assert.equal(outside.length,0);
            outsider.off(event,outsideListener);
            receipts.push({event,joinedPeerReceived:true,outsideRoomReceived:0});
        }
        fs.writeFileSync(path.join(__dirname,'evidence/socket-probes.json'),JSON.stringify(receipts,null,2));
        console.log(JSON.stringify(receipts));
    }finally{for(const socket of sockets)await closeSocket(socket);await app.stop();}
}
main().catch((error)=>{console.error(error);process.exitCode=1;});
