const path = require('node:path');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { startServer } = require(path.join(process.cwd(),'tests/helpers/server-control'));
const { signupUser } = require(path.join(process.cwd(),'tests/helpers/auth-helpers'));
const { sandboxEnv } = require(path.join(process.cwd(),'tests/helpers/digetpay-fixture'));
const results=[];
async function main() {
    for (const mode of ['session','transaction']) {
        const server = await startServer({env:{
            ...sandboxEnv, PLATFORM_ENABLED:'true', PLATFORM_DATA_DIR:'memory://', VIDEO_PROVIDER:'mesh',
            DIGETPAY_STATUS_LOOKUP:mode, NODE_OPTIONS:`--require=${path.join(__dirname,'provider-preload.cjs')}`
        }});
        const call=(cookie,route,body)=>server.request('/api/platform'+route,{method:'POST',headers:{Cookie:cookie},body});
        try {
            const alice=await signupUser(server,{email:`alice-${mode}@example.invalid`});
            const bob=await signupUser(server,{email:`bob-${mode}@example.invalid`});
            for(const body of [{},{phone:5},{phone:'5'.repeat(1000)}]){
                const bad=await call(alice.cookie,'/billing/checkout',body);
                assert.equal(bad.status,400);
            }
            const order=await call(alice.cookie,'/billing/checkout',{phone:'0501234567',amountMinor:1,currency:'SAR'});
            assert.equal(order.status,200);
            assert.equal(order.body.amountMinor,499);
            assert.equal(order.body.currency,'USD');
            const repeat=await call(alice.cookie,'/billing/checkout',{phone:'0501234567'});
            assert.equal(repeat.body.id,order.body.id);
            const outsider=await call(bob.cookie,`/billing/checkout/${order.body.id}/verify`,{});
            assert.equal(outsider.status,404);
            if(mode==='session'){
                const verified=await call(alice.cookie,`/billing/checkout/${order.body.id}/verify`,{});
                assert.equal(verified.body.status,'completed');
                const duplicate=await call(alice.cookie,`/billing/checkout/${order.body.id}/verify`,{});
                assert.equal(duplicate.body.status,'completed');
                const me=await server.request('/api/platform/me',{headers:{Cookie:alice.cookie}});
                const other=await server.request('/api/platform/me',{headers:{Cookie:bob.cookie}});
                assert.equal(me.body.benefits.plan.id,'vip');
                assert.equal(other.body.benefits.plan.id,'free');
                const latest=await server.request('/api/platform/billing/latest',{headers:{Cookie:alice.cookie}});
                const foreignLatest=await server.request('/api/platform/billing/latest',{headers:{Cookie:bob.cookie}});
                assert.equal(latest.body.order.id,order.body.id);
                assert.equal(foreignLatest.body.order,null);
                const exportOwn=await server.request('/api/platform/progress/export',{headers:{Cookie:alice.cookie}});
                const exportFree=await server.request('/api/platform/progress/export',{headers:{Cookie:bob.cookie}});
                assert.equal(exportOwn.status,200);
                assert.match(exportOwn.text,/started_utc,completed_utc,validated_minutes,xp/);
                assert.equal(exportFree.status,403);
                const recovery=await server.request('/api/auth/recovery/config');
                assert.deepEqual(recovery.body,{enabled:false,mode:'disabled'});
                results.push({mode,checkout:order.status,invalidInputs:3,duplicateOrderReused:true,ownerVerified:verified.body.status,otherUser:outsider.status,alice:'vip',bob:'free',
                    latestOwnerMatches:true,otherLatest:null,vipExport:exportOwn.status,freeExport:exportFree.status,recovery:recovery.body});
            }else{
                const accepted=[];
                for(let i=0;i<20;i++){
                    const response=await call('', '/billing/digetpay/webhook',{orderId:order.body.id,transactionId:crypto.randomUUID()});
                    accepted.push(response.status);
                }
                assert.ok(accepted.every((status)=>status===200));
                results.push({mode,anonymousNotifications:accepted.length,allAccepted:true,otherUser:outsider.status});
            }
        }finally{await server.stop();}
    }
    fs.writeFileSync(path.join(__dirname,'evidence/http-payment-probes.json'),JSON.stringify(results,null,2));
    console.log(JSON.stringify(results));
}
main().catch((error)=>{console.error(error);process.exitCode=1;});
