// 웨일튜터 자동 가져오기: 워커가 받아 둔 학습현황을 현황판이 스스로 가져와 붙이는지
// 실행: node tests/hwvideo-server.mjs &  →  node tests/wt-auto.test.mjs
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('./playwright.js');

const ok = (c, m, e = '') => { console.log((c ? '  ✓  ' : '  ✗ 실패  ') + m + (e ? ' — ' + e : '')); if (!c) process.exitCode = 1; };
const B = 'http://localhost:8899';
const SHOT = process.env.SHOT_DIR || '.';
const kst = (n = 0) => new Date(Date.now() + 9 * 3600e3 - n * 864e5).toISOString().slice(0, 10);
const weekdays = []; for (let i = 0; weekdays.length < 4; i++) { const d = kst(i); const w = new Date(d + 'T12:00:00Z').getUTCDay(); if (w > 0 && w < 6) weekdays.push(d); }

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1366, height: 1000 } });
const page = await ctx.newPage();
await page.addInitScript(() => { window.GORAE_LOCAL_ONLY = true; window.GORAE_WT_AUTO = true; try { localStorage.setItem('gorae-board-popup', new Date().toISOString().slice(0, 10)); } catch (e) {} });
const errors = []; page.on('pageerror', e => errors.push(String(e)));
await page.goto(B + '/index.html#/settings', { waitUntil: 'networkidle' });
await page.click('#b-sample'); await page.click('#confirm-yes'); await page.waitForTimeout(1200);
const names = await page.evaluate(() => Store.students({ active: true }).slice(0, 2).map(s => s.name));

const row = (id, lesson, ai, dt) => ({ id, lesson, ai_test: ai, dt: String(dt), student_book_check: '1', voca_score: '90', key_sentences: '100', indatetime: weekdays[0] + ' 15:10:00' });
const fake = (extra) => ({
  students: [{ student_id: 'auto-a', student_name: names[0], current_bookcode: 'WE-L1V2', current_short_name: '240 vol.2/기본', book_start_datetime: '2026-10-01 10:00:00' },
    { student_id: 'auto-b', student_name: names[1], current_bookcode: 'WE-L0V3', current_short_name: 'Whale phonics3/기본', book_start_datetime: '2026-10-01 10:00:00' }],
  days: Object.assign({
    [weekdays[3]]: [row('auto-a', 'WE-L1V2U1D1', '8 / 10', 80)],
    [weekdays[2]]: [row('auto-a', 'WE-L1V2U1D2', '9 / 10', 90), row('auto-b', 'WE-L0V3U1D1', '-', 0)],
    [weekdays[1]]: [row('auto-a', 'WE-L1V2U1D3', '7 / 10', 70)]
  }, extra || {})
});
await fetch(B + '/__wt_fake', { method: 'POST', body: JSON.stringify(fake()) });
await ctx.addCookies([{ name: 'gorae_staff', value: 'ok', url: B }]);

// 워커가 받아 두기 (크론 대신 지금 받기)
const rf = await page.evaluate(() => fetch('/hw/admin/api/wt/refresh', { method: 'POST', credentials: 'same-origin' }).then(r => r.json()));
ok(rf.ok && rf.rows >= 4, '워커가 웨일튜터 학습현황을 받아 둠', JSON.stringify(rf));
const g = await page.evaluate(() => fetch('/hw/admin/api/wt', { credentials: 'same-origin' }).then(r => r.json()));
ok(g.students.length === 2 && Object.keys(g.days).length === 3, '현황판용 묶음 (학생 2명 · 3일)');

// 현황판을 열기만 하면 자동으로 붙음
await page.goto(B + '/index.html#/board'); await page.waitForTimeout(1800);
const a = await page.evaluate(n => { const s = Store.students({ active: true }).find(x => x.name === n); return Store.board(s.id); }, names[0]);
ok(a.wt && Object.keys(a.wt.days).length === 3 && a.current.title === '240 vol.2', '열자마자 자동 반영 (240 vol.2 · 3일)', a.current.title);
ok(await page.locator('.modal').count() === 0, '자동 반영은 창을 띄우지 않음');
await page.click('[data-act="mode"][data-k="wt"]'); await page.waitForTimeout(300);
ok((await page.textContent('#bd-wtauto')).includes('자동 연결'), '자동 연결 표시', await page.textContent('#bd-wtauto'));

// 오늘 새 기록 → [지금 새로 받기]
await fetch(B + '/__wt_fake', { method: 'POST', body: JSON.stringify(fake({ [weekdays[0]]: [row('auto-a', 'WE-L1V2U1D4', '10 / 10', 100)] })) });
const savesBefore = await page.evaluate(n => { const s = Store.students({ active: true }).find(x => x.name === n); return Store.board(s.id).updatedAt; }, names[1]);
await page.click('[data-act="wtnow"]'); await page.waitForTimeout(2000);
const a2 = await page.evaluate(n => { const s = Store.students({ active: true }).find(x => x.name === n); return Store.board(s.id); }, names[0]);
ok(!!a2.wt.days[weekdays[0]] && WT_stats(a2), '오늘 기록 새로 반영', JSON.stringify(a2.wt.days[weekdays[0]]));
function WT_stats() { return true; }
const reached = await page.evaluate(n => { const s = Store.students({ active: true }).find(x => x.name === n); return WT.stats(Store.board(s.id)).reached; }, names[0]);
ok(reached === 4, '4/21회차로 올라감', String(reached));
const savesAfter = await page.evaluate(n => { const s = Store.students({ active: true }).find(x => x.name === n); return Store.board(s.id).updatedAt; }, names[1]);
ok(savesBefore === savesAfter, '바뀌지 않은 학생은 다시 저장하지 않음');
await page.screenshot({ path: SHOT + '/wt-auto.png' });
ok(errors.length === 0, '오류 없음', errors.join(' | '));
await browser.close();
