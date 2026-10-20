// 학원자료실 폴더 보기: 분류(큰 폴더) → 레벨(하위 폴더) 정리, 열린 폴더 기억, 하위 폴더 직접 지정, 검색은 카드
// 실행: node tests/hwvideo-server.mjs &  →  node tests/resources-folders.test.mjs
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('./playwright.js');

const ok = (c, m) => { console.log((c ? '✓ ' : '✗ ') + m); if (!c) process.exitCode = 1; };
const B = 'http://localhost:8899';
const SHOT = process.env.SHOT_DIR || '.';
const DESC = '본사 원본 Daily·Weekly 시험지 20쪽에 그날 음원 QR 만 얹은 판입니다.';

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
await page.addInitScript(() => { window.GORAE_LOCAL_ONLY = true; });
const errors = []; page.on('pageerror', e => errors.push(String(e)));
await ctx.addCookies([{ name: 'gorae_staff', value: 'ok', url: B }]);
await page.goto(B + '/index.html#/resources', { waitUntil: 'networkidle' });

// 실제 자료실처럼 원본 QR 시험지를 섞인 순서로 넣습니다.
await page.evaluate((DESC) => {
  var items = [
    '1240 Vol.2', '240 Vol.5', 'Phonics Vol.4', '1680 Vol.1', '240 Vol.1', '520 Vol.10', '520 Vol.2', '860 Vol.1', 'Phonics Vol.1', '1240 Vol.1'
  ];
  items.forEach(function (t, i) {
    Store.saveResource({ title: t + ' 원본 데일리테스트지 (QR)', category: '원본데일리테스트지QR', date: '2026-10-18', desc: DESC,
      file: { key: 'res/k' + i + '.pdf', name: t + '.pdf', size: 1000000 } });
  });
  Store.saveResource({ title: '센텐스빌더 3단계', category: '워크시트', folder: '센텐스빌더', date: '2026-10-19', url: 'https://example.com/sb' });
  App.rerender();
}, DESC);

ok(await page.isVisible('[data-mode="folder"].primary'), '처음에는 폴더로 보기');
ok((await page.$$('.res-card')).length === 0, '폴더 보기에서는 카드가 펼쳐지지 않음');

const bigNames = await page.$$eval('.rf > summary', s => s.map(x => x.textContent));
ok(bigNames.some(t => t.includes('원본데일리테스트지QR') && t.includes('10건')), '큰 폴더: 원본데일리테스트지QR 10건');
ok(bigNames.some(t => t.includes('학습앱')), '큰 폴더: 학습앱');
ok(await page.$eval('details.rf[data-fkey="c:원본데일리테스트지QR"]', d => !d.open), '큰 폴더는 처음엔 닫혀 있음');

await page.click('details.rf[data-fkey="c:원본데일리테스트지QR"] > summary');
const subs = await page.$$eval('details.rf[data-fkey="c:원본데일리테스트지QR"] .rf-sub > summary', s => s.map(x => x.children[1].textContent));
ok(JSON.stringify(subs) === JSON.stringify(['240', '520', '860', '1240', '1680', 'Phonics']), '하위 폴더가 레벨 순서대로: ' + subs.join(' | '));

await page.click('details.rf-sub[data-fkey="s:원본데일리테스트지QR/520"] > summary');
const rows520 = await page.$$eval('details.rf-sub[data-fkey="s:원본데일리테스트지QR/520"] .rf-title', s => s.map(x => x.textContent));
ok(rows520[0].startsWith('520 Vol.2') && rows520[1].startsWith('520 Vol.10'), 'Vol 번호 순서 (2 다음 10)');
const descCount = await page.$$eval('details.rf-sub[data-fkey="s:원본데일리테스트지QR/520"] .rf-desc', s => s.length);
const rowDesc = await page.$$eval('details.rf-sub[data-fkey="s:원본데일리테스트지QR/520"] .rf-row .rf-meta', s => s.filter(x => x.textContent.includes('본사 원본')).length);
ok(descCount === 1 && rowDesc === 0, '같은 설명은 폴더 위에 한 번만');
ok(await page.isVisible('details.rf-sub[data-fkey="s:원본데일리테스트지QR/520"] a:has-text("파일 열기")'), '폴더 안에서도 파일 열기 버튼');

await page.click('details.rf[data-fkey="c:워크시트"] > summary');
ok(await page.isVisible('details.rf-sub[data-fkey="s:워크시트/센텐스빌더"]'), '직접 정한 하위 폴더(센텐스빌더)');
await page.screenshot({ path: SHOT + '/res-folders.png', fullPage: true });

// 다시 그려도 연 폴더는 열린 채로
await page.reload({ waitUntil: 'networkidle' });
ok(await page.$eval('details.rf-sub[data-fkey="s:원본데일리테스트지QR/520"]', d => d.open), '새로고침해도 열어 둔 폴더 유지');

// 수정 화면에서 하위 폴더 바꾸기
await page.click('details.rf-sub[data-fkey="s:원본데일리테스트지QR/520"] .rf-row:has-text("520 Vol.2") [data-edit]');
ok((await page.getAttribute('#r-folder', 'placeholder')) === '자동: 520', '수정 화면에 자동 하위 폴더 안내');
await page.fill('#r-folder', '보관');
await page.click('#r-save');
await page.waitForTimeout(300);
ok(await page.isVisible('details.rf-sub[data-fkey="s:원본데일리테스트지QR/보관"]'), '하위 폴더를 직접 바꾸면 그 폴더로 이동');
const saved = await page.evaluate(() => Store.resources().filter(r => r.title.indexOf('520 Vol.2') === 0)[0]);
ok(saved.folder === '보관' && saved.file && saved.file.key === 'res/k6.pdf', '하위 폴더 저장 · 파일은 그대로');

// 분류 칩을 누르면 그 큰 폴더만
await page.click('[data-cat="학습앱"]');
const only = await page.$$eval('.rf > summary', s => s.length);
ok(only === 1 && await page.$eval('details.rf', d => d.open), '분류를 고르면 그 폴더만 열어서 보여 줌');
await page.click('[data-cat=""]');

// 검색하면 카드로 결과
await page.fill('#r-q', '1680 Vol');
await page.waitForTimeout(200);
const cards = await page.$$eval('.res-card .res-title', s => s.map(x => x.textContent));
ok(cards.length === 1 && cards[0].startsWith('1680 Vol.1'), '검색 결과는 카드로: ' + cards.join(' | '));
ok((await page.textContent('.res-card .tag')).includes('/ 1680'), '카드에 하위 폴더 표시');
await page.fill('#r-q', '');

// 카드로 보기 전환
await page.click('[data-mode="card"]');
ok((await page.$$('.res-card')).length >= 13, '카드로 보기 전환');
await page.click('[data-mode="folder"]');

// 휴대폰
await page.setViewportSize({ width: 390, height: 800 });
await page.waitForTimeout(200);
const sw = await page.evaluate(() => document.documentElement.scrollWidth);
ok(sw <= 392, '휴대폰 화면에서 옆으로 넘치지 않음 (' + sw + ')');
await page.screenshot({ path: SHOT + '/res-folders-mobile.png', fullPage: true });

ok(errors.length === 0, '스크립트 오류 없음' + (errors.length ? ' ' + errors.join(' / ') : ''));
await browser.close();
