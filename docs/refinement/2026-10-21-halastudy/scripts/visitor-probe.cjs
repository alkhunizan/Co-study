const fs=require('node:fs');
const path=require('node:path');
async function main(){
    const rows=[];
    const checks=[['/',200],['/api/health',200],['/api/ready',200],['/app',200],['/account',200],
        ['/api/platform/progress',401],['/api/platform/staff/audit',401],['/api/me/stats',401],
        ['/.env',404],['/.git/HEAD',404],['/package.json',404],['/node_modules/express/package.json',404],
        ['/data/platform-preview/local-credentials.json',404],['/docs/refinement/2026-10-21-halastudy/PLAN.md',404],
        ['/design-system/README.md',404],['/api/debug',404],['/api/rooms/ZZZZZZ',404],['/auth/google',404]];
    for(const [route,expected]of checks){
        const response=await fetch('http://127.0.0.1:3495'+route,{redirect:'manual'});
        // Status/headers only: never collect credential or private file contents.
        await response.body?.cancel();
        rows.push({route,expected,status:response.status,noindex:response.headers.get('x-robots-tag'),cache:response.headers.get('cache-control'),
            contentType:response.headers.get('content-type'),csp:!!response.headers.get('content-security-policy'),nosniff:response.headers.get('x-content-type-options')});
    }
    fs.writeFileSync(path.join(process.env.REFINEMENT_OUTPUT,'evidence/visitor-probes.json'),JSON.stringify(rows,null,2));
    const failures=rows.filter(row=>row.status!==row.expected);
    console.log(`${rows.length} local anonymous HTTP probes; ${failures.length} unexpected responses. Production requests: 0.`);
    if(failures.length){console.log(JSON.stringify(failures));process.exitCode=1;}
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
