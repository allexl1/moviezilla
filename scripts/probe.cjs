const { chromium } = require('playwright-core');

(async () => {
  const browser = await chromium.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    args: ['--no-sandbox', '--disable-gpu'],
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(`PAGEERROR: ${e.message.split('\n')[0]}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`CONSOLE: ${m.text().split('\n')[0].slice(0, 200)}`);
  });
  const url = process.argv[2] || 'http://localhost:5173/';
  const clicks = (process.argv[3] || '').split('|').filter(Boolean);
  await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 }).catch(() => {});
  await page.waitForTimeout(4000);
  for (const step of clicks) {
    try {
      if (step.startsWith('type:')) {
        const [, sel, ...rest] = step.split(':');
        await page.fill(sel, rest.join(':'), { timeout: 8000 });
        await page.waitForTimeout(2500);
      } else if (step.startsWith('text:')) {
        const txt = step.slice(5);
        await page.getByText(txt, { exact: false }).first().click({ timeout: 8000 });
        await page.waitForTimeout(2500);
      } else {
        await page.click(step, { timeout: 8000 });
        await page.waitForTimeout(2500);
      }
    } catch (e) {
      errors.push(`STEPFAIL ${step}: ${e.message.split('\n')[0]}`);
    }
  }
  await page.screenshot({ path: process.argv[4] || '/tmp/mz-check.png' });
  console.log('ERRORS:\n' + (errors.length ? errors.join('\n') : '(none)'));
  await browser.close();
})().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
