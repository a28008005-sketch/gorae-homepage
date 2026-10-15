// 카카오로 들어온 숙제가 원생관리 화면(숙제 영상 · 대시보드)에 보이는지 확인합니다.
// 실행: node tests/hwvideo-server.mjs &  →  node tests/kakao-hwvideo.test.mjs
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('./playwright.js');

const ok = (c, m) => { console.log((c ? '✓ ' : '✗ ') + m); if (!c) process.exitCode = 1; };
const B = 'http://localhost:8899';
const SHOT = process.env.SHOT_DIR || '.';

async function kakao(utterance, user) {
  const r = await fetch(B + '/hw/kakao/kk-test', { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ userRequest: { utterance, user: { id: user, properties: {} } }, action: { params: {}, detailParams: {} } }) });
  return r.json();
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
await page.addInitScript(() => { window.GORAE_LOCAL_ONLY = true; });
const errors = []; page.on('pageerror', e => errors.push(String(e)));

await page.goto(B + '/index.html#/settings', { waitUntil: 'networkidle' });
await page.click('#b-sample'); await page.click('#confirm-yes'); await page.waitForTimeout(1500);
const kid = await page.evaluate(() => Store.students({ active: true })[0].name);

// 학부모 A: 녹음 → 이름 등록 → 사진 → 메시지 / 학부모 B: 이름 없이 녹음
await kakao('http://talk.kakaocdn.net/dn/a/voice.m4a', 'mom-A');
const reg = await kakao('이름 ' + kid, 'mom-A');
ok(reg.template.outputs[0].simpleText.text.includes(kid + ' 학생으로 등록'), '카카오 이름 등록 답장');
await kakao('http://talk.kakaocdn.net/dn/a/photo.jpg', 'mom-A');
await kakao('오늘은 조금 늦게 갈 것 같아요', 'mom-A');
await kakao('http://talk.kakaocdn.net/dn/b/voice.m4a', 'mom-B');

await ctx.addCookies([{ name: 'gorae_staff', value: 'ok', url: B }]);

// 대시보드
await page.goto(B + '/index.html#/dashboard');
await page.waitForFunction(() => /미확인/.test((document.querySelector('#dash-hw') || {}).textContent || ''), null, { timeout: 5000 });
const dash = await page.textContent('#dash-hw');
ok(dash.includes('오늘 숙제 3건') && dash.includes('카톡 메시지 1건') && dash.includes('미확인 4건'), '대시보드에 오늘 들어온 숙제 요약');
ok(dash.includes(kid) && dash.includes('이름 미등록') && dash.includes('카톡 녹음') && dash.includes('늦게 갈 것 같아요'), '대시보드에 학생·종류·메시지 표시');
await page.locator('.card', { has: page.locator('#dash-hw') }).screenshot({ path: SHOT + '/kakao-dashboard.png' });

// 숙제 영상 화면
await page.click('a[data-route="hwvideo"]');
await page.waitForSelector('[data-key]', { timeout: 5000 });
const list = await page.textContent('#hw-list');
ok(list.includes('카톡 녹음') && list.includes('카톡 사진') && list.includes('카톡 메시지'), '목록에 카톡 녹음·사진·메시지 구분');
ok((list.match(new RegExp(kid, 'g')) || []).length >= 3, '이름 등록 전에 보낸 녹음도 학생 이름으로 보임');
ok(list.includes('이름 미등록'), '이름 모르는 학부모 숙제는 이름 미등록 표시');
ok((await page.textContent('.grid')).includes('제출 숙제'), '통계: 제출 숙제');
await page.screenshot({ path: SHOT + '/kakao-hwvideo.png', fullPage: true });

// 녹음 듣기 · 사진 보기
const audioRow = page.locator('.sub-row', { hasText: '카톡 녹음' }).first();
ok((await audioRow.locator('[data-play]').textContent()).includes('듣기'), '녹음은 듣기 버튼');
await audioRow.locator('[data-play]').click();
await page.waitForSelector('.modal audio', { timeout: 5000 });
ok(true, '녹음은 오디오 플레이어로 열림');
await page.click('[data-close]');
await page.locator('.sub-row', { hasText: '카톡 사진' }).first().locator('[data-play]').click();
await page.waitForSelector('.modal img', { timeout: 5000 });
ok(await page.evaluate(() => document.querySelector('.modal img').complete), '사진은 그림으로 열림');
await page.click('[data-close]');
ok(await page.locator('.sub-row', { hasText: '카톡 메시지' }).locator('[data-play]').count() === 0, '메시지에는 재생 버튼 없음');

ok(errors.length === 0, '화면 오류 없음' + (errors.length ? ' — ' + errors.join(' | ') : ''));
await browser.close();
