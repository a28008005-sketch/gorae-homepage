import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('./playwright.js');
import fs from 'node:fs';

const ok = (c, m) => { console.log((c ? '✓ ' : '✗ ') + m); if (!c) process.exitCode = 1; };
const B = 'http://localhost:8899';
fs.writeFileSync('/tmp/hwvideo-test.mp4', Buffer.alloc(13 * 1024 * 1024, 7));

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
const page = await ctx.newPage();
await page.addInitScript(() => { window.GORAE_LOCAL_ONLY = true; });
const errors = []; page.on('pageerror', e => errors.push(String(e)));
page.on('dialog', d => { errors.push('dialog:' + d.message()); d.dismiss(); });

// 0) 예시 데이터 (학생 명부)
await page.goto(B + '/index.html#/settings', { waitUntil: 'networkidle' });
await page.click('#b-sample'); await page.click('#confirm-yes'); await page.waitForTimeout(1500);
const kid = await page.evaluate(() => Store.students({active:true})[0].name);
// 1) 학부모 제출
await page.goto(B + '/hw');
await page.fill('#student', kid);
await page.fill('#cls', '월수금 4시');
await page.fill('#memo', '3과 읽기');
await page.setInputFiles('#f', '/tmp/hwvideo-test.mp4');
await page.click('#go');
await page.waitForSelector('#done', { state: 'visible', timeout: 20000 });
ok((await page.textContent('#doneTitle')).includes(kid), '학부모 제출 완료 화면');

// 2) 원생관리 → 숙제 영상 메뉴
await page.goto(B + '/index.html#/dashboard');
await page.waitForTimeout(800);
ok(await page.isVisible('a[data-route="hwvideo"]'), '왼쪽 메뉴에 "숙제 영상" 표시');
await page.click('a[data-route="hwvideo"]');
await page.waitForSelector('#hw-key');
ok((await page.textContent('#page-title')).includes('숙제 영상'), '제목 표시');
await page.screenshot({ path: (process.env.SHOT_DIR || '.') + '/hw-key.png' });

// 틀린 비밀번호 → 브라우저 로그인 창 없이 안내
await page.fill('#hw-key', 'wrong');
await page.click('#hw-key-go');
await page.waitForSelector('#hw-key', { timeout: 5000 });
await page.waitForTimeout(500);
ok((await page.content()).includes('숙제 비밀번호가 맞지 않습니다'), '틀린 비밀번호 안내 (창 안 뜸)');

await page.fill('#hw-key', 'pw-test');
await page.click('#hw-key-go');
await page.waitForSelector('[data-key]', { timeout: 5000 });
const rowText = await page.textContent('#hw-list');
ok(rowText.includes(kid) && !rowText.includes('명부에 없음') && rowText.includes('3과 읽기') && rowText.includes('13.0MB'), '제출 목록에 학생·메모·용량 표시, 명부와 이름 연결');
ok((await page.textContent('#page-sub')).includes('미확인 1건'), '미확인 건수 표시');
await page.screenshot({ path: (process.env.SHOT_DIR || '.') + '/hw-list.png', fullPage: true });

// 보기
await page.click('[data-play]');
await page.waitForSelector('.modal video');
const src = await page.getAttribute('.modal video', 'src');
const r = await page.evaluate(async s => { const x = await fetch(s, { headers: { Range: 'bytes=0-9' } }); return x.status; }, src);
ok(src.includes('&t=') && r === 206, '영상 재생 링크(토큰) 동작');
await page.click('#hw-ck-close');
await page.waitForTimeout(700);
ok((await page.textContent('#page-sub')).includes('미확인 0건'), '확인 완료 표시 반영');

// 새로고침해도 비밀번호 기억
await page.reload(); await page.waitForTimeout(800);
await page.waitForSelector('[data-key]', { timeout: 5000 });
ok(await page.isChecked('[data-ck]'), '다시 들어와도 비밀번호 묻지 않고 확인 상태 유지');

// 모바일
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(300);
await page.screenshot({ path: (process.env.SHOT_DIR || '.') + '/hw-mobile.png', fullPage: true });

// 기존 화면 이상 없음
for (const rt of ['dashboard', 'homework', 'students']) {
  await page.goto(B + '/index.html#/' + rt); await page.waitForTimeout(400);
}
ok(!errors.length, '스크립트 오류·팝업 없음 ' + (errors.join(' | ') || ''));
await browser.close();
