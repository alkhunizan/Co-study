// Run from the repository with Node 22. All data is synthetic/local; no provider network.
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const root = process.cwd();
const local = (name) => require(path.join(root, name));
const { createDatabase } = local('services/platform/database');
const { createDigetPayClient } = local('services/platform/digetpay-client');
const { createDigetPayBilling } = local('services/platform/digetpay-billing');
const { sandboxEnv, paymentFixture } = local('tests/helpers/digetpay-fixture');
const { startServer } = local('tests/helpers/server-control');
const { signupUser } = local('tests/helpers/auth-helpers');
const results = [];
const record = (name, detail) => { results.push({ name, ...detail }); console.log(JSON.stringify(results.at(-1))); };
async function main() {
    const db = await createDatabase();
    let clock = Date.parse('2026-10-20T10:00:00Z');
    const now = () => clock;
    const fixture = paymentFixture();
    const customer = { phone: '0501234567', name: 'Synthetic audit', email: 'audit@example.invalid' };
    const billing = createDigetPayBilling(db, createDigetPayClient(sandboxEnv, fixture.fetchImpl), now);
    const txBilling = createDigetPayBilling(db, createDigetPayClient({ ...sandboxEnv, DIGETPAY_STATUS_LOOKUP: 'transaction' }, fixture.fetchImpl), now);
    const newUser = async () => {
        const id = crypto.randomUUID();
        await db.query('INSERT INTO halastudy.users(id,display_name,created_at) VALUES($1,$2,$3)', [id, 'Synthetic', now()]);
        return id;
    };
    const approve = async (order) => {
        const row = (await db.query('SELECT * FROM halastudy.digetpay_orders WHERE id=$1', [order.id])).rows[0];
        Object.assign(fixture.sessions.get(row.session_id), { transactionStatus: 'SUCCESS', paymentStatus: 'APPROVED' });
    };
    try {
        const owner = await newUser();
        const order = await txBilling.checkout(owner, customer);
        for (let i = 0; i < 20; i++) await txBilling.notify({ orderId: order.id, transactionId: crypto.randomUUID() });
        const queued = Number((await db.query("SELECT count(*) AS count FROM halastudy.outbox WHERE kind='digetpay.verify'")).rows[0].count);
        const before = fixture.calls.length;
        await txBilling.drain();
        const queries = fixture.calls.length - before;
        assert.equal(queued, 20);
        assert.equal(queries, 10);
        record('V4-01 transaction hints grow durable queue', { notifications:20, queued, fakeStatusQueriesFirstDrain:queries, realProviderCalls:0 });
        const sessionOwner = await newUser();
        const sessionOrder = await billing.checkout(sessionOwner, customer);
        for (let i = 0; i < 20; i++) await billing.notify({ orderId: sessionOrder.id, transactionId: crypto.randomUUID() });
        const sessionRows = await db.query("SELECT count(*) AS count FROM halastudy.outbox WHERE payload->>'orderId'=$1", [sessionOrder.id]);
        assert.equal(Number(sessionRows.rows[0].count), 1);
        record('Queue positive control', {sessionModeTwentyHintsRows:1});
        const lateUser = await newUser();
        const a = await billing.checkout(lateUser, customer);
        clock += 49 * 3600000;
        const b = await billing.checkout(lateUser, customer);
        clock += 49 * 3600000;
        const c = await billing.checkout(lateUser, customer);
        await approve(a);
        assert.equal((await billing.status(lateUser, a.id)).status, 'completed');
        await approve(b);
        let conflict;
        try { await billing.status(lateUser, b.id); } catch (error) { conflict = { code:error.code, constraint:error.constraint }; }
        assert.equal(conflict?.code, '23505');
        const persisted = await db.query('SELECT id,status,transaction_id FROM halastudy.digetpay_orders WHERE user_id=$1 ORDER BY created_at', [lateUser]);
        record('V4-02 late payment review conflicts with newer open checkout', {
            orderStates:persisted.rows.map((row)=>({label:row.id===a.id?'A':row.id===b.id?'B':'C',status:row.status,transactionBound:!!row.transaction_id})),
            error:conflict, positiveControlFirstLateOrder:'completed', newestPending:c.status
        });
    } finally {
        await billing.close(); await txBilling.close(); await db.close();
    }
    const server = await startServer({ env:{
        PLATFORM_ENABLED:'true', PLATFORM_DATA_DIR:'memory://', BILLING_PROVIDER:'digetpay',
        DIGETPAY_API_KEY:'', VIDEO_PROVIDER:'mesh'
    }});
    try {
        const source = fs.readFileSync(path.join(root,'services/platform/routes.js'),'utf8');
        const registrations = [...source.matchAll(/router\.(get|post|patch|delete)\('([^']+)'/g)];
        for (const match of registrations) {
            if (['/catalog','/billing/digetpay/webhook'].includes(match[2])) continue;
            const route = '/api/platform'+match[2].replace(/:[A-Za-z]+/g,'00000000-0000-4000-8000-000000000001');
            const response = await server.request(route, {method:match[1].toUpperCase(), ...(match[1]!=='get'?{body:{}}:{})});
            assert.equal(response.status,401,route);
            record('Anonymous protected route', {method:match[1].toUpperCase(),route,status:response.status,errorCode:response.body.errorCode});
        }
        for (const route of ['/plans','/app','/supervisor','/.env','/.git/HEAD','/docs/viber/2026-10-20-digetpay-gate/RUN.md','/js/platform.js.map','/api/debug','/design-system/DESIGN.md','/unknown-audit-path']) {
            const response = await server.request(route);
            record('Local visitor', {route,status:response.status,noindex:response.headers['x-robots-tag']||null});
        }
        const alice = await signupUser(server,{email:'viber-alice@example.invalid'});
        const catalog = await server.request('/api/platform/catalog');
        record('Unconfigured payment catalog',{status:catalog.status,body:catalog.body});
        const checkout = await server.request('/api/platform/billing/checkout',{method:'POST',headers:{Cookie:alice.cookie},body:{phone:'0501234567',amount:1,currency:'SAR'}});
        assert.equal(checkout.status,503);
        record('Unconfigured checkout fails closed',{status:checkout.status,errorCode:checkout.body.errorCode});
        const crossOrigin = await server.request('/api/platform/focus/start',{method:'POST',headers:{Cookie:alice.cookie,Origin:'https://evil.example'},body:{}});
        assert.equal(crossOrigin.status,403);
        record('Cross-origin write rejected',{status:crossOrigin.status,errorCode:crossOrigin.body.errorCode});
        const raw = await fetch(server.baseUrl+'/api/platform/focus/start',{method:'POST',headers:{'Content-Type':'application/json',Cookie:alice.cookie},body:'{'});
        record('Malformed JSON',{status:raw.status,body:await raw.text()});
        const health = await server.request('/api/health');
        assert.equal(health.status,200);
        record('Health after malformed input',{status:health.status});
    } finally { await server.stop(); }
    fs.writeFileSync(path.join(__dirname,'evidence','targeted-probes.json'),JSON.stringify(results,null,2));
}
main().catch((error)=>{console.error(error);process.exitCode=1;});
