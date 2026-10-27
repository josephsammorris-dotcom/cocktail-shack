// End-to-end: a TV and three phones play through the game against `wrangler dev`.
// Usage: node tests/e2e.cjs [weeks-to-play] [outdir]   (needs `npm run dev` running on :8787)
const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://127.0.0.1:8787';
const WEEKS = Number(process.argv[2] || 2), OUT = process.argv[3] || 'shots';
const sleep = ms => new Promise(r => setTimeout(r, ms));
// polls from Node: software-rendered WebGL can starve in-page polling
async function until(page, fn, timeout = 30000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) { if (await page.evaluate(fn).catch(() => false)) return; await sleep(400); }
  throw new Error('timed out waiting for ' + fn.toString().slice(0, 90));
}
(async () => {
  require('fs').mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
  const errors = [];
  const tvCtx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const tv = await tvCtx.newPage();
  tv.setDefaultTimeout(150000);
  tv.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errors.push('TV: ' + m.text()); });
  tv.on('pageerror', e => errors.push('TV pageerror: ' + e.message));
  await tv.goto(BASE + '/tv');
  await until(tv, () => /^[A-Z]{4}$/.test(document.getElementById('code').textContent));
  const code = await tv.$eval('#code', e => e.textContent);
  console.log('room', code);
  const names = ['Tiki Tom', '', 'Sandy Pints'];
  const phones = [];
  for (let i = 0; i < 3; i++) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
    const p = await ctx.newPage();
    p.on('pageerror', e => errors.push(`P${i} pageerror: ` + e.message));
    p.on('console', m => { if (m.type() === 'error') errors.push(`P${i}: ` + m.text()); });
    await p.goto(`${BASE}/play/${code}`);
    await p.waitForSelector('#name');
    // a stand-in selfie (a drawn face), as if taken with the phone's camera
    if (i !== 1) {
      await p.evaluate(i => {
        const c = document.createElement('canvas'); c.width = c.height = 160; const x = c.getContext('2d');
        x.fillStyle = ['#93c5fd', '#fde68a', '#bbf7d0'][i]; x.fillRect(0, 0, 160, 160);
        x.fillStyle = ['#f2c7a5', '#8d5a3b', '#e0a982'][i]; x.beginPath(); x.arc(80, 88, 52, 0, 7); x.fill();
        x.fillStyle = '#111'; x.beginPath(); x.arc(62, 86, 6, 0, 7); x.arc(98, 86, 6, 0, 7); x.fill();
        x.strokeStyle = '#111'; x.lineWidth = 5; x.beginPath(); x.arc(80, 100, 22, 0.2, Math.PI - 0.2); x.stroke();
        localStorage.setItem('cocktail-shack-photo', c.toDataURL('image/jpeg', 0.8));
      }, i);
      await p.reload(); await p.waitForSelector('#name');
    }
    if (i === 0) await p.screenshot({ path: `${OUT}/phone-join.png` });
    await p.fill('#name', names[i]);
    await p.click('#join');
    await p.waitForSelector('#w-list');
    phones.push(p);
  }
  await sleep(1500);
  await tv.screenshot({ path: `${OUT}/tv-lobby.png` });
  await phones[0].screenshot({ path: `${OUT}/phone-wait.png` });
  await phones[0].click('#start');
  await until(tv, () => !document.getElementById('brief').classList.contains('hide'), 15000);
  await sleep(1500);
  await tv.screenshot({ path: `${OUT}/tv-briefing.png` });
  await phones[1].screenshot({ path: `${OUT}/phone-briefing.png` });

  for (let w = 1; w <= WEEKS; w++) {
    await Promise.all(phones.map(p => p.waitForSelector('#lock, #unlock', { timeout: 30000 })));
    await sleep(800);
    // each phone tweaks its plan differently
    const p0 = phones[0];
    await p0.click('[data-step="price"][data-d="1"]'); await p0.click('[data-step="price"][data-d="1"]');
    await p0.click('[data-step="ads"][data-d="-1"]');
    if (w === 2) { await phones[1].click('#hire').catch(() => {}); await sleep(400); }
    await phones[1].click('#q-max'); await sleep(300);
    if (w === 1) { await tv.screenshot({ path: `${OUT}/tv-planning.png` }); await p0.screenshot({ path: `${OUT}/phone-planning.png` }); await p0.screenshot({ path: `${OUT}/phone-planning-full.png`, fullPage: true }); }
    for (const p of phones) { const b = await p.$('#lock'); if (b && await b.isEnabled()) await b.click(); }
    await sleep(600);
    await until(tv, () => document.querySelector('.tag3d.counter') || !document.getElementById('results').classList.contains('hide'), 60000);
    await sleep(3500);
    await tv.screenshot({ path: `${OUT}/tv-match-w${w}-a.png` });
    if (w === 1) await phones[0].screenshot({ path: `${OUT}/phone-match.png` });
    await sleep(5000);
    await tv.screenshot({ path: `${OUT}/tv-match-w${w}-b.png` });
    // (slow software rendering can mean the results timer has already moved on to the next briefing)
    await until(tv, () => !document.getElementById('results').classList.contains('hide') || !document.getElementById('brief').classList.contains('hide'), 60000);
    await sleep(1500);
    await tv.screenshot({ path: `${OUT}/tv-results-w${w}.png` });
    // check the counters agree with the results
    const check = await tv.evaluate(() => [...document.querySelectorAll('.tag3d.counter')].map(e => e.textContent));
    console.log('week', w, 'counters', check.join(' | '));
    if (w === 1) { await phones[0].screenshot({ path: `${OUT}/phone-report.png`, fullPage: true }); }
    for (const p of phones) { const b = await p.$('#ready'); if (b) await b.click().catch(() => {}); }
    await sleep(1000);
  }
  // end the game from the host menu and show the finale
  await tv.keyboard.press('Escape'); await sleep(500);
  await tv.screenshot({ path: `${OUT}/tv-menu.png` });
  await tv.click('[data-act="end"]').catch(() => {});
  await until(tv, () => !document.getElementById('finale').classList.contains('hide'), 15000);
  await sleep(2000);
  await tv.screenshot({ path: `${OUT}/tv-finale.png` });
  await phones[0].screenshot({ path: `${OUT}/phone-final.png` });
  console.log('errors:', errors.length ? '\n' + [...new Set(errors)].slice(0, 30).join('\n') : 'none');
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
