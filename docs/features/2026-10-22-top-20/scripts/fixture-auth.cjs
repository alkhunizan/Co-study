// Reusable synthetic local identity; never send these credentials off loopback.
module.exports=async function fixtureAuth(context,base){
    if(!['127.0.0.1','localhost'].includes(new URL(base).hostname))throw new Error('Local fixture only');
    const data={email:'zoom-review@example.invalid',password:'local-review-pass-123',displayName:'Zoom reviewer'};
    let response=await context.request.post(base+'/api/auth/login',{data});
    if(!response.ok())response=await context.request.post(base+'/api/auth/signup',{data});
    if(!response.ok())throw new Error(`Synthetic fixture authentication failed: ${response.status()}`);
    return (await response.json()).user;
};
