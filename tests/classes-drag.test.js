/* 반 · 시간표 — 시간대별 반 나누기 (학생 이름표 끌어 옮기기) */
const { chromium } = require('./playwright');
const BASE = 'http://127.0.0.1:8899/index.html';
const ok = (l, c, e = '') => console.log(`  ${c ? '✓' : '✗ 실패'}  ${l}${e ? ' — ' + e : ''}`);

async function drag(p, from, to, steps = 12) {
  await p.locator(from).first().scrollIntoViewIfNeeded();
  const a = await p.locator(from).first().boundingBox();
  const b = await p.locator(to).first().boundingBox();
  await p.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await p.mouse.down();
  await p.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps });
  await p.mouse.up();
  await p.waitForTimeout(500);
}

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1280, height: 1000 } });
  await p.addInitScript(() => { window.GORAE_LOCAL_ONLY = true; });
  const errs = [];
  p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));

  await p.goto(BASE + '#/settings', { waitUntil: 'networkidle' });
  await p.click('#b-sample'); await p.click('#confirm-yes'); await p.waitForTimeout(1200);

  // 시간대 하나를 Jinny반 · Binny반 둘로 나눈 상태를 만듭니다
  const ids = await p.evaluate(() => {
    const c = Store.classes()[0];
    Store.saveClass({ id: c.id, name: '2:40반 Jinny', teacher: 'Jinny' });
    const bid = Store.saveClass({ name: '2:40반 Binny', teacher: 'Binny', days: c.days, time: c.time });
    const s = Store.studentsInClass(c.id)[0];
    return { j: c.id, b: bid, s: s.id, name: s.name };
  });
  await p.goto(BASE + '#/classes', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(600);

  const rows = await p.locator('.split-row').count();
  const cols = await p.locator('.split-row').first().locator('.split-col').count();
  ok('시간대별 반 나누기 표시', rows > 0 && cols === 2, rows + '줄 · 첫 줄 ' + cols + '칸');
  const order = await p.locator('.split-row').first().locator('.split-col .teacher-tag').allTextContents();
  ok('Jinny반 · Binny반 나란히', order.join(',') === 'Jinny,Binny', order.join(','));

  // 마우스로 Jinny → Binny
  await drag(p, `.split [data-drop="${ids.j}"] [data-drag="${ids.s}"]`, `.split [data-drop="${ids.b}"]`);
  let cid = await p.evaluate(id => Store.student(id).classId, ids.s);
  ok('마우스로 끌어 옆 반으로 옮김', cid === ids.b);
  ok('옮긴 반 칸에 이름 표시', await p.locator(`.split [data-drop="${ids.b}"] [data-drag="${ids.s}"]`).count() === 1);
  await p.screenshot({ path: (process.env.SHOT_DIR || '.') + '/c-split.png', fullPage: true });

  // 반 미배정으로 빼기 → 다시 넣기
  await drag(p, `.split [data-drag="${ids.s}"]`, '.split-tray');
  cid = await p.evaluate(id => Store.student(id).classId, ids.s);
  ok('미배정 칸으로 빼기', cid === '');
  await drag(p, `.split-tray [data-drag="${ids.s}"]`, `.split [data-drop="${ids.j}"]`);
  cid = await p.evaluate(id => Store.student(id).classId, ids.s);
  ok('미배정에서 반으로 넣기', cid === ids.j);

  // 반 카드끼리도 끌어 옮겨짐 (두 카드가 한 화면에 들어오게 창을 길게)
  await p.setViewportSize({ width: 1280, height: 2400 });
  await drag(p, `.class-members[data-drop="${ids.j}"] [data-drag="${ids.s}"]`, `.class-members[data-drop="${ids.b}"]`);
  cid = await p.evaluate(id => Store.student(id).classId, ids.s);
  ok('반 카드에서 다른 반 카드로', cid === ids.b);

  // 끌지 않고 누르기만 하면 학생 정보가 열림
  await p.click(`.split [data-drag="${ids.s}"]`); await p.waitForTimeout(400);
  ok('누르면 학생 정보 열림', await p.locator('.modal').count() > 0);
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);
  if (await p.locator('.modal').count()) await p.click('.modal [data-close]').catch(() => {});

  // 같은 칸에 놓으면 아무 일도 없음
  const before = await p.evaluate(id => Store.student(id).updatedAt, ids.s);
  await drag(p, `.split [data-drag="${ids.s}"]`, `.split [data-drop="${ids.b}"] .split-h`);
  const after = await p.evaluate(id => Store.student(id).updatedAt, ids.s);
  ok('같은 반에 놓으면 그대로', before === after);

  // 태블릿(터치)
  const t = await b.newPage({ viewport: { width: 820, height: 1180 }, hasTouch: true, isMobile: true });
  await t.addInitScript(() => { window.GORAE_LOCAL_ONLY = true; });
  await t.goto(BASE + '#/settings', { waitUntil: 'networkidle' });
  await t.click('#b-sample'); await t.click('#confirm-yes'); await t.waitForTimeout(1200);
  await t.evaluate(() => {
    const c = Store.classes()[0];
    Store.saveClass({ id: c.id, name: '2:40반 Jinny', teacher: 'Jinny' });
    Store.saveClass({ name: '2:40반 Binny', teacher: 'Binny', days: c.days, time: c.time });
  });
  await t.goto(BASE + '#/classes', { waitUntil: 'domcontentloaded' }); await t.waitForTimeout(800);
  await t.evaluate(() => window.scrollTo(0, 0));
  const tid = await t.evaluate(() => {
    const c = Store.classes().find(x => /Jinny$/.test(x.name));
    const bc = Store.classes().find(x => /Binny$/.test(x.name));
    const s = Store.studentsInClass(c.id)[0];
    return { j: c.id, b: bc.id, s: s.id };
  });
  const sel = `.split [data-drag="${tid.s}"]`;
  await t.locator(sel).scrollIntoViewIfNeeded();
  const box = await t.locator(sel).boundingBox();
  const dst = await t.locator(`.split [data-drop="${tid.b}"]`).boundingBox();
  const cdp = await t.context().newCDPSession(t);
  const pt = (x, y) => [{ x, y, id: 1 }];
  const x0 = box.x + box.width / 2, y0 = box.y + box.height / 2, x1 = dst.x + dst.width / 2, y1 = dst.y + dst.height / 2;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt(x0, y0) });
  for (let i = 1; i <= 10; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pt(x0 + (x1 - x0) * i / 10, y0 + (y1 - y0) * i / 10) });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await t.waitForTimeout(500);
  cid = await t.evaluate(id => Store.student(id).classId, tid.s);
  ok('태블릿 손가락으로 끌어 옮김', cid === tid.b);
  await t.screenshot({ path: (process.env.SHOT_DIR || '.') + '/c-split-tablet.png', fullPage: true });

  ok('스크립트 오류 없음', errs.length === 0, errs.join(' | '));
  await b.close();
})();
