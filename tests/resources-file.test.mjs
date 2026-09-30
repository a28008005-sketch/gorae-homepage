// 학원자료실: 파일 첨부 → 열기·내려받기 → 파일 바꾸기·빼기 → 삭제, 데일리 시트지 인쇄 연결
// 실행: node tests/hwvideo-server.mjs &  →  node tests/resources-file.test.mjs
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('./playwright.js');
import fs from 'node:fs';

const ok = (c, m) => { console.log((c ? '✓ ' : '✗ ') + m); if (!c) process.exitCode = 1; };
const B = 'http://localhost:8899';
const SHOT = process.env.SHOT_DIR || '.';
fs.writeFileSync('/tmp/res-a.pdf', '%PDF-1.4\n% 고래 마켓데이 달러\n' + 'x'.repeat(40000));
fs.writeFileSync('/tmp/res-b.pdf', '%PDF-1.4\n% second\n');
fs.writeFileSync('/tmp/res-x.html', '<script>alert(1)</script>');

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
await page.addInitScript(() => { window.GORAE_LOCAL_ONLY = true; });
const errors = []; page.on('pageerror', e => errors.push(String(e)));
page.on('dialog', d => { errors.push('dialog:' + d.message()); d.dismiss(); });

// 로그인 안 한 상태: 워커가 막는지
const denied = await (await fetch(B + '/hw/admin/api/res/upload?name=a.pdf', { method: 'PUT', body: 'x' })).status;
ok(denied === 401, '로그인 없이 파일 올리기 차단 (' + denied + ')');

await ctx.addCookies([{ name: 'gorae_staff', value: 'ok', url: B }]);
await page.goto(B + '/index.html#/resources', { waitUntil: 'networkidle' });

// 데일리 시트지 인쇄 연결
const links = await page.$$eval('.daily-row a', as => as.map(a => a.href));
ok(links.length === 12, '데일리 시트지: 6레벨 × 그림 있음/없음 버튼 12개');
ok(links.includes('https://a28008005-sketch.github.io/dailytest/print/?lv=240&kind=pic') &&
   links.includes('https://a28008005-sketch.github.io/dailytest/print/?lv=Phonics&kind=plain'), '인쇄 화면으로 레벨·종류를 넘기는 주소');

// 1) 파일 첨부로 등록 (링크 없이)
await page.click('#r-new');
await page.setInputFiles('#r-file', '/tmp/res-a.pdf');
ok((await page.inputValue('#r-title')) === 'res-a', '제목이 비어 있으면 파일 이름으로 채움');
await page.fill('#r-title', '마켓데이달러');
await page.screenshot({ path: SHOT + '/res-form.png' });
await page.click('#r-save');
await page.waitForSelector('.res-card .res-file', { timeout: 8000 });
const card = await page.textContent('.res-grid');
ok(card.includes('마켓데이달러') && card.includes('res-a.pdf') && card.includes('KB'), '카드에 파일 이름·크기 표시');
await page.screenshot({ path: SHOT + '/res-list.png', fullPage: true });

const rec = await page.evaluate(() => Store.resources().filter(r => r.title === '마켓데이달러')[0]);
ok(rec && rec.file && /^res\//.test(rec.file.key) && !rec.url, '자료 기록에 파일 열쇠 저장 (링크 없음)');

// 2) 파일 열기 / 내려받기
const openHref = await page.getAttribute('.res-card a:has-text("파일 열기")', 'href');
const r1 = await page.evaluate(async h => { const x = await fetch(h); return { s: x.status, t: x.headers.get('content-type'), d: x.headers.get('content-disposition'), b: (await x.text()).slice(0, 8) }; }, openHref);
ok(r1.s === 200 && r1.t === 'application/pdf' && /^inline/.test(r1.d) && r1.b === '%PDF-1.4', 'PDF가 브라우저 안에서 열림 (바로 인쇄 가능)');
const dlHref = await page.getAttribute('.res-card a:has-text("내려받기")', 'href');
const r2 = await page.evaluate(async h => (await fetch(h)).headers.get('content-disposition'), dlHref);
ok(/^attachment/.test(r2) && r2.includes(encodeURIComponent('res-a.pdf')), '내려받기는 원래 파일 이름으로');
const r3 = await (await fetch(B + openHref)).status;
ok(r3 === 401, '로그인 없는 기기에서는 파일 링크가 열리지 않음');

// 3) 파일 바꾸기 → 예전 파일은 보관함에서 지워짐
const oldKey = rec.file.key;
await page.click('.res-card:has-text("마켓데이달러") [data-edit]');
ok(await page.isVisible('#r-file-now'), '수정 화면에 지금 파일 표시');
await page.setInputFiles('#r-file', '/tmp/res-b.pdf');
await page.click('#r-save');
await page.waitForTimeout(800);
const rec2 = await page.evaluate(() => Store.resources().filter(r => r.title === '마켓데이달러')[0]);
ok(rec2.file.name === 'res-b.pdf' && rec2.file.key !== oldKey, '파일 바꾸기');
ok((await page.evaluate(async k => (await fetch('/hw/admin/res?key=' + encodeURIComponent(k))).status, oldKey)) === 404, '바뀐 예전 파일은 보관함에서 정리');

// 4) HTML 같은 파일은 화면에 띄우지 않고 내려받기로만
await page.click('#r-new');
await page.fill('#r-title', '위험 파일');
await page.setInputFiles('#r-file', '/tmp/res-x.html');
await page.click('#r-save');
await page.waitForTimeout(800);
const xk = await page.evaluate(() => Store.resources().filter(r => r.title === '위험 파일')[0].file.key);
const xr = await page.evaluate(async k => { const x = await fetch('/hw/admin/res?key=' + encodeURIComponent(k)); return x.headers.get('content-disposition') + '|' + x.headers.get('content-type'); }, xk);
ok(/^attachment/.test(xr) && xr.includes('octet-stream'), 'HTML 파일은 열지 않고 내려받기로만 (' + xr + ')');

// 5) 파일 빼기
await page.click('.res-card:has-text("마켓데이달러") [data-edit]');
await page.click('#r-file-remove');
await page.fill('#r-url', 'https://example.com/a');
await page.click('#r-save');
await page.waitForTimeout(600);
const rec3 = await page.evaluate(() => Store.resources().filter(r => r.title === '마켓데이달러')[0]);
ok(!rec3.file && rec3.url === 'https://example.com/a', '파일 빼고 링크만 남기기');

// 6) 삭제하면 파일도 정리
await page.click('.res-card:has-text("위험 파일") [data-edit]');
await page.click('#r-del'); await page.click('#confirm-yes');
await page.waitForTimeout(600);
ok((await page.evaluate(async k => (await fetch('/hw/admin/res?key=' + encodeURIComponent(k))).status, xk)) === 404, '자료 삭제 시 파일도 정리');

// 7) 기존 링크 자료(시드)는 그대로
ok((await page.textContent('.res-grid')).includes('고래 데일리 듣기'), '기존 링크 자료 유지');

// 모바일
await page.setViewportSize({ width: 390, height: 844 });
await page.reload(); await page.waitForTimeout(500);
await page.screenshot({ path: SHOT + '/res-mobile.png', fullPage: true });
const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
ok(!overflow, '휴대폰 화면에서 옆으로 넘치지 않음');

ok(!errors.length, '스크립트 오류·팝업 없음 ' + (errors.join(' | ') || ''));
await browser.close();
