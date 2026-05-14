import { chromium } from '@playwright/test';
const browser = await chromium.launch({ ignoreHTTPSErrors: true, args: ['--ignore-certificate-errors', '--no-sandbox'] });
const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
const page = await ctx.newPage();

for (const url of ['https://127.0.0.1:3010/', 'https://127.0.0.1:3443/']) {
  try {
    const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 10000 });
    console.log(`OK ${url} -> ${resp.status()} (title: ${(await page.title()).slice(0,60)})`);
  } catch (e) {
    console.log(`FAIL ${url} -> ${e.message.split('\n')[0]}`);
  }
}
await browser.close();
