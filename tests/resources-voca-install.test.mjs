// 학원자료실: 학습앱 > 스마트단어장 보카앱 폴더에 '보카 앱 설치 안내'가 한 번만 들어가고, 학부모 안내문을 복사할 수 있는지
// 실행: node tests/hwvideo-server.mjs &  →  node tests/resources-voca-install.test.mjs
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('./playwright.js');

const ok = (c, m) => { console.log((c ? '✓ ' : '✗ ') + m); if (!c) process.exitCode = 1; };
const B = 'http://localhost:8899';
const SHOT = process.env.SHOT_DIR || '.';

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, permissions: ['clipboard-read', 'clipboard-write'] });
const page = await ctx.newPage();
await page.addInitScript(() => { window.GORAE_LOCAL_ONLY = true; });
const errors = []; page.on('pageerror', e => errors.push(String(e)));
await ctx.addCookies([{ name: 'gorae_staff', value: 'ok', url: B }]);
await page.goto(B + '/index.html#/resources', { waitUntil: 'networkidle' });

const voca = () => page.evaluate(() => Store.resources().filter(r => /dailytest\/voca\//.test(r.url || '')));
let list = await voca();
const guide = list.find(r => /install\.html$/.test(r.url));
const app = list.find(r => !/install\.html$/.test(r.url));
ok(!!guide, '설치 안내 자료가 들어감');
ok(guide && guide.category === '학습앱' && guide.folder === '스마트단어장 보카앱', '학습앱 > 스마트단어장 보카앱 폴더');
ok(app && app.folder === '스마트단어장 보카앱', '보카 앱 자료도 같은 폴더로 묶임');
ok(guide && /뒤 4자리/.test(guide.notice) && /010-3803-8335/.test(guide.notice), '학부모 안내문이 들어 있음');

// 다시 열어도, 표시가 지워진 다른 기기여도 두 번 들어가지 않음
await page.reload({ waitUntil: 'networkidle' });
list = await voca();
ok(list.filter(r => /install\.html$/.test(r.url)).length === 1, '두 번 들어가지 않음');

// 폴더 보기: 학습앱 > 스마트단어장 보카앱 폴더를 열면 두 자료가 함께 보임
if (!(await page.$eval('details.rf[data-fkey="c:학습앱"]', d => d.open))) await page.click('details.rf[data-fkey="c:학습앱"] > summary');
await page.waitForTimeout(300);
const sub = await page.$$eval('details.rf-sub > summary', s => s.map(x => x.textContent));
ok(sub.some(t => t.includes('스마트단어장 보카앱') && /2/.test(t)), '하위 폴더 스마트단어장 보카앱 2건');
await page.click('details.rf-sub[data-fkey="s:학습앱/스마트단어장 보카앱"] > summary');
await page.waitForTimeout(300);
await page.screenshot({ path: SHOT + '/resources-voca-folder.png' });

// 카드로 보기에서 안내문 복사
await page.click('[data-mode="card"]');
const btn = await page.$('[data-notice]');
ok(!!btn, '[학부모 안내문 복사] 버튼이 보임');
await btn.click();
await page.waitForTimeout(300);
const clip = await page.evaluate(() => navigator.clipboard.readText());
ok(/웨일리 보카 앱 설치 방법/.test(clip) && /\n\n/.test(clip), '안내문이 줄바꿈 그대로 복사됨');
await btn.scrollIntoViewIfNeeded();
await page.screenshot({ path: SHOT + '/resources-voca-install.png' });

ok(errors.length === 0, '오류 없음 ' + (errors.join(' | ')));
await browser.close();
