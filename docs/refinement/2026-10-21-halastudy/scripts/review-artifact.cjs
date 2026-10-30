const fs=require('node:fs');
const path=require('node:path');
const {pathToFileURL,fileURLToPath}=require('node:url');
const {chromium}=require(path.join(process.cwd(),'node_modules/playwright'));
async function main(){
    const output=process.env.REFINEMENT_OUTPUT;
    const browser=await chromium.launch({channel:'chrome'});
    const page=await browser.newPage();const errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.goto(pathToFileURL(path.join(output,'REVIEW.html')).href);
    const links=await page.locator('a[href]').evaluateAll(anchors=>anchors.map(anchor=>anchor.href));
    const missing=links.filter(link=>new URL(link).protocol==='file:').filter(link=>!fs.existsSync(fileURLToPath(new URL(link))));
    const failedImages=await page.locator('img').evaluateAll(async images=>{
        for(const image of images)image.loading='eager';
        return (await Promise.all(images.map(async image=>{try{await image.decode();return null;}catch{return image.src;}}))).filter(Boolean);
    });
    const rows=[];
    for(const width of [390,1440]){
        await page.setViewportSize({width,height:width===390?844:1000});
        const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
        await page.screenshot({path:path.join(output,`screenshots/review-${width}.png`)});
        rows.push({width,overflow});
    }
    const result={links:links.length,images:await page.locator('img').count(),missing,failedImages,errors,rows};
    fs.writeFileSync(path.join(output,'evidence/artifact-qa.json'),JSON.stringify(result,null,2));
    await browser.close();
    console.log(`${result.links} review links; ${result.images} decoded images; ${missing.length} missing files; ${failedImages.length} broken images; ${errors.length} page exceptions.`);
    if(missing.length||failedImages.length||errors.length||rows.some(row=>row.overflow))process.exitCode=1;
}
main().catch(error=>{console.error(error);process.exitCode=1;});
