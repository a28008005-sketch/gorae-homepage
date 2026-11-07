// 센텐스 · 파닉스 서바이벌 화면: 파닉스카드 기록도 함께 쌓이고, 실시간으로 올라오고, 학부모 전송 문구가 파닉스용인지
// 실행: node tests/hwvideo-server.mjs &  →  node tests/survival-phonics.test.mjs
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('./playwright.js');

const ok = (c, m, e = '') => { console.log((c ? '  ✓  ' : '  ✗ 실패  ') + m + (e ? ' — ' + e : '')); if (!c) process.exitCode = 1; };
const B = 'http://localhost:8899';
const SHOT = process.env.SHOT_DIR || '.';
const H = { 'content-type': 'application/json', origin: 'https://a28008005-sketch.github.io' };
const post = (p, b) => fetch(B + '/hw/api/sv/' + p, { method: 'POST', headers: H, body: JSON.stringify(b) }).then(r => r.json());

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
await page.addInitScript(() => { window.GORAE_LOCAL_ONLY = true; });
const errors = []; page.on('pageerror', e => errors.push(String(e)));
await page.goto(B + '/index.html#/settings', { waitUntil: 'networkidle' });
await page.click('#b-sample'); await page.click('#confirm-yes'); await page.waitForTimeout(1200);
const kids = await page.evaluate(() => Store.students({ active: true }).slice(0, 2).map(s => s.name));

// 파닉스카드 앱이 보내는 모양 그대로 (level: 'Phonics')
const lg = await post('log', { name: kids[0], level: 'Phonics', vol: 3, unit: 2, cards: 30, done: 30, total: 30, mode: 'practice' });
ok(lg.ok, '파닉스카드 연습 기록을 워커가 받음', JSON.stringify(lg));
const st = await post('start', { name: kids[0], level: 'Phonics', vol: 3, unit: 2, cards: 30, done: 28, total: 30, size: 2000, type: 'video/webm', durationSec: 95 });
ok(st.ok, '파닉스카드 실전 녹화 올리기 시작');
const pr = await fetch(B + `/hw/api/sv/part?key=${encodeURIComponent(st.key)}&uploadId=${encodeURIComponent(st.uploadId)}&n=1`, { method: 'PUT', headers: { origin: H.origin }, body: Buffer.alloc(2000, 1) }).then(r => r.json());
const cp = await post('complete', { id: st.id, key: st.key, uploadId: st.uploadId, parts: [pr] });
ok(cp.ok, '파닉스카드 영상 올리기 끝');
await post('log', { name: kids[1], level: '240', vol: 2, unit: 1, cards: 20, done: 20, total: 20, mode: 'practice' });
ok((await post('log', { name: kids[1], level: 'Phonix', vol: 3 })).ok === false, '이상한 레벨은 여전히 거절');

await ctx.addCookies([{ name: 'gorae_staff', value: 'ok', url: B }]);
await page.goto(B + '/index.html#/survival'); await page.waitForTimeout(1200);
ok((await page.textContent('#nav')).includes('센텐스 · 파닉스 서바이벌'), '메뉴 이름');
ok(await page.locator('.sub-row').count() === 3, '센텐스뱅크 + 파닉스카드 기록 3건', String(await page.locator('.sub-row').count()));
const phRow = page.locator('.sub-row', { hasText: '파닉스카드' }).filter({ hasText: '실전 녹화' });
ok(await phRow.count() === 1 && (await phRow.innerText()).includes('Whale Phonics · Vol.3 · Unit 2') && (await phRow.innerText()).includes('28/30단어'), '파닉스 실전 영상 줄');
await page.click('[data-kind="ph"]'); await page.waitForTimeout(200);
ok(await page.locator('.sub-row').count() === 2, '파닉스카드만 보기');
await page.click('[data-kind="sb"]'); await page.waitForTimeout(200);
ok(await page.locator('.sub-row').count() === 1, '센텐스뱅크만 보기');
await page.click('[data-kind=""]'); await page.waitForTimeout(200);
ok((await page.textContent('.grid.g-4')).includes('파닉스 2'), '오늘 도전 · 파닉스 2');

// 학부모 전송 창 — 파닉스 문구
await page.locator('.sub-row', { hasText: '실전 녹화' }).locator('[data-send]').click(); await page.waitForTimeout(300);
const txt = await page.inputValue('#sv-text');
ok(txt.includes('파닉스카드 Whale Phonics Vol.3 Unit 2') && txt.includes('그림 카드를 보고 영어 단어로'), '파닉스용 학부모 문구', txt.split('\n')[0]);
await page.screenshot({ path: SHOT + '/survival-send.png' });
await page.click('.modal [data-close]');

// 학부모 영상 화면
const share = await page.evaluate(() => fetch('/hw/admin/api/sv/list?days=30', { credentials: 'same-origin' }).then(r => r.json()).then(j => j.items.find(i => i.level === 'Phonics' && i.share).share));
const watch = await fetch(B + share).then(r => r.text());
ok(/파닉스카드 서바이벌/.test(watch) && /Whale Phonics Vol\.3/.test(watch) && /28단어 도전/.test(watch), '학부모 영상 화면이 파닉스카드로 나옴');

// 실시간: 화면을 연 채로 새 기록이 들어오면 20초 안에 올라옴
await post('log', { name: kids[1], level: 'Phonics', vol: 1, unit: 1, cards: 10, done: 9, total: 10, mode: 'practice' });
await page.waitForFunction(() => document.querySelectorAll('.sub-row').length === 4, null, { timeout: 26000 }).catch(() => {});
ok(await page.locator('.sub-row').count() === 4, '새 기록이 자동으로 올라옴 (새로고침 없이)');
ok((await page.textContent('#sv-live')).includes('확인'), '실시간 확인 시각 표시');
await page.screenshot({ path: SHOT + '/survival-live.png', fullPage: true });
ok(errors.length === 0, '오류 없음', errors.join(' | '));
await browser.close();
