// 고래 포인트: 학생별 잔액·이번 달 적립, [사용 · 빼기]·[적립]·내역 지우기, 잔액 전부 고래카드로
// 실행: node tests/hwvideo-server.mjs &  →  node tests/points.test.mjs
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('./playwright.js');

const ok = (c, m) => { console.log((c ? '✓ ' : '✗ ') + m); if (!c) process.exitCode = 1; };
const B = 'http://localhost:8899';
const SHOT = process.env.SHOT_DIR || '.';

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
await page.addInitScript(() => { window.GORAE_LOCAL_ONLY = true; });
const errors = []; page.on('pageerror', e => errors.push(String(e)));
await ctx.addCookies([{ name: 'gorae_staff', value: 'ok', url: B }]);
await page.goto(B + '/index.html#/dashboard', { waitUntil: 'networkidle' });

// 앱(워커)이 넣는 적립 줄처럼 넣습니다.
const ids = await page.evaluate(() => {
  var a = Store.saveStudent({ name: '포인트하나', status: '등록생', grade: '3학년' });
  var b = Store.saveStudent({ name: '포인트둘', status: '등록생', grade: '5학년' });
  var t = U.ymd(), last = U.daysAgo(40);
  Store.savePoint({ studentId: a, date: t, amount: 10, source: 'whaley-voca', reason: '보카 240 Day 3 · 하루 학습 완료 8P + 정답률 90% 이상 2P' });
  Store.savePoint({ studentId: a, date: U.daysAgo(1), amount: 8, source: 'whaley-voca' });
  Store.savePoint({ studentId: a, date: last, amount: 100, source: 'whaley-voca' });   // 지난달
  Store.savePoint({ studentId: b, date: t, amount: 18, source: 'whaley-voca' });
  return { a: a, b: b };
});
await page.goto(B + '/index.html#/points', { waitUntil: 'networkidle' });
ok(await page.isVisible('a[data-route="points"]'), '왼쪽 메뉴에 고래 포인트');
const rowA = page.locator('tr', { hasText: '포인트하나' });
ok((await rowA.textContent()).includes('118P'), '잔액 118P (지난달 포함)');
ok((await rowA.textContent()).includes('18 / 300P'), '이번 달 적립 18 / 300P (지난달 제외)');
ok((await rowA.textContent()).includes('1,180원'), '원으로도 보임');
await page.screenshot({ path: SHOT + '/points-list.png' });

// 사용 · 빼기: 잔액보다 많이는 못 뺌
await rowA.locator('[data-use]').click();
await page.fill('#pt-amt', '500');
await page.click('#pt-save');
ok(await page.isVisible('#pt-amt'), '잔액보다 많이 빼면 막힘');
await page.fill('#pt-amt', '50');
ok((await page.textContent('#pt-won')).includes('500원'), '50P = 500원 미리보기');
await page.selectOption('#pt-why', '마켓데이');
await page.fill('#pt-memo', '10월 마켓데이');
await page.screenshot({ path: SHOT + '/points-use.png' });
await page.click('#pt-save');
await page.waitForTimeout(200);
let sum = await page.evaluate(id => Store.pointSummary(id), ids.a);
ok(sum.balance === 68 && sum.used === 50 && sum.earned === 18, '50P 빼고 잔액 68P (적립 상한 계산엔 안 들어감)');
ok((await rowA.textContent()).includes('68P'), '목록도 68P');

// 직접 적립
await page.locator('tr', { hasText: '포인트둘' }).locator('[data-add]').click();
await page.fill('#pt-amt', '20');
await page.click('#pt-save');
await page.waitForTimeout(200);
sum = await page.evaluate(id => Store.pointSummary(id), ids.b);
ok(sum.balance === 38 && sum.earned === 18, '직접 적립 20P → 38P, 이번 달 앱 적립은 그대로 18P');

// 내역: 원장님 기록만 지울 수 있음
await rowA.locator('[data-hist]').click();
ok((await page.$$('#pt-hist tbody tr')).length === 4, '내역 4줄');
ok((await page.$$('#pt-hist [data-undo]')).length === 1, '지우기는 원장님이 넣은 줄에만');
await page.screenshot({ path: SHOT + '/points-history.png' });
await page.click('#pt-hist [data-undo]');
await page.waitForTimeout(200);
sum = await page.evaluate(id => Store.pointSummary(id), ids.a);
ok(sum.balance === 118, '잘못 뺀 줄을 지우면 118P로 돌아옴');
await page.click('.modal [data-close]');

// 잔액 전부 고래카드로
await page.click('#pt-bulk');
await page.click('#confirm-yes');
await page.waitForTimeout(200);
const after = await page.evaluate(ids => [Store.pointSummary(ids.a).balance, Store.pointSummary(ids.b).balance,
  Store.points({ studentId: ids.a })[0].reason], ids);
ok(after[0] === 0 && after[1] === 0, '모두 0P');
ok(/고래카드 적립/.test(after[2]), '고래카드 적립 기록이 남음');

// 클라우드로 올라갈 기록(kind: point)
const kinds = await page.evaluate(() => Store.allRecords().filter(r => r.kind === 'point').length);
ok(kinds >= 7, '동기화 대상(kind: point)으로 잡힘');

ok(errors.length === 0, '오류 없음 ' + errors.join(' | '));
await browser.close();
