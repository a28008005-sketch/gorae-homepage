/* 학습 현황판 — 표 체크, 교재 주문 알림 색, 상세 창, 대시보드 카드, 동기화 대기열 */
const { chromium } = require('./playwright');
const BASE = 'http://127.0.0.1:8899/index.html';
const ok = (l, c, e = '') => console.log(`  ${c ? '✓' : '✗ 실패'}  ${l}${e ? ' — ' + e : ''}`);
const SHOT = process.env.SHOT_DIR || '.';
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1366, height: 1000 } });
  await p.addInitScript(() => { window.GORAE_LOCAL_ONLY = true; });
  const errs = [];
  p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
  // 대시보드의 '오늘 들어온 숙제'·알림 상태는 워커(/hw/·/api/)를 부르는데 로컬 서버엔 없어서 404 가 납니다. 이 화면과 무관합니다.
  p.on('response', r => { if (r.status() >= 400 && !/\/(hw|api)\//.test(r.url())) errs.push('HTTP ' + r.status() + ' ' + r.url()); });
  p.on('console', m => { if (m.type() === 'error' && !/ERR_CERT|fonts|Failed to load resource/.test(m.text())) errs.push('CONSOLE: ' + m.text()); });

  await p.goto(BASE + '#/settings', { waitUntil: 'networkidle' });
  await p.click('#b-sample'); await p.click('#confirm-yes'); await p.waitForTimeout(1200);

  const menu = await p.$$eval('#nav a', as => as.map(a => a.textContent.trim()));
  ok('학습 현황판 메뉴 있음', menu.includes('학습 현황판'));

  await p.goto(BASE + '#/board', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(600);
  const active = await p.evaluate(() => Store.students({ active: true }).length);
  const rows = await p.locator('.bd-table tbody tr').count();
  ok('등록생이 모두 표에 나옴', rows === active && rows > 0, rows + '/' + active);

  const sid = await p.locator('.bd-table tbody tr').first().getAttribute('data-sid');
  const row = `tr[data-sid="${sid}"]`;

  // 웨일 프로그램 토글
  await p.click(`${row} [data-act="prog"][data-k="ws"]`);
  ok('웨일스튜던트 토글 저장', await p.evaluate(s => !!Store.board(s).programs.ws, sid));
  ok('동기화 대기열에 board 로 올라감', await p.evaluate(s => {
    const r = Store.allRecords().find(x => x.kind === 'board' && x.id === s);
    return !!(r && r.data.updatedAt);
  }, sid));

  // 공통 숙제
  await p.click(`${row} [data-act="practice"]`);
  for (let i = 0; i < 3; i++) await p.click(`${row} [data-act="daily"][data-n="1"]`);
  await p.click(`${row} [data-act="daily"][data-n="-1"]`);
  const w = await p.evaluate(s => { const r = Store.board(s); const k = Object.keys(r.hw)[0]; return r.hw[k]; }, sid);
  ok('프랙티스북 체크 · 데일리 2회', w.practice === true && w.daily === 2, JSON.stringify(w));

  // 상세 창 — 교재 등록
  await p.click(`${row} [data-act="open"][data-tab="book"]`); await p.waitForTimeout(300);
  await p.fill('#bd-f-current-title', 'Whale Phonics 3');
  await p.fill('#bd-f-current-total', '20');
  await p.fill('#bd-f-current-done', '15');
  await p.fill('#bd-f-current-next', 'Whale Phonics 4');
  await p.locator('#bd-f-current-next').blur(); await p.waitForTimeout(800);
  ok('교재 입력 저장', await p.evaluate(s => {
    const c = Store.board(s).current; return c.title === 'Whale Phonics 3' && c.total === 20 && c.done === 15 && c.next === 'Whale Phonics 4';
  }, sid));
  await p.click('.modal [data-close]'); await p.waitForTimeout(300);

  // 진도 올리기 → 80% 노랑 → 90% 빨강
  await p.click(`${row} [data-act="unit"][data-n="1"]`);
  ok('80% 이상 노란색', await p.locator(`${row} .bd-book.st-warn`).count() === 1);
  await p.click(`${row} [data-act="unit"][data-n="1"]`);
  await p.click(`${row} [data-act="unit"][data-n="1"]`);
  ok('90% 이상 빨간색', await p.locator(`${row} .bd-book.st-urgent`).count() === 1);
  ok('상단 주문 알림에 올라감', await p.locator('.bd-orders .bd-ord.urgent').count() >= 1);
  await p.screenshot({ path: SHOT + '/board-table.png', fullPage: true });

  ok('작업 중에는 팝업이 뜨지 않음', await p.locator('.modal').count() === 0);
  await p.click(`.bd-orders [data-sid="${sid}"]`);
  ok('주문완료 → 파란색', await p.locator(`${row} .bd-book.st-ordered`).count() === 1);

  // 완료 처리 → 다음 교재 시작, 히스토리 기록
  await p.click(`${row} [data-act="open"]`); await p.waitForTimeout(300);
  await p.click('.modal [data-act="tab"][data-t="book"]');
  await p.click('.modal [data-act="finish"]');
  await p.click('.modal [data-act="finish-yes"]'); await p.waitForTimeout(300);
  const after = await p.evaluate(s => Store.board(s), sid);
  ok('완료 처리 → 다음 교재 시작', after.current.title === 'Whale Phonics 4' && after.current.done === 0 && !after.current.ordered);
  ok('지난 교재 히스토리', after.history.length === 1 && after.history[0].title === 'Whale Phonics 3');

  // 보유 교재 · 개인 숙제
  await p.click('.modal [data-act="tab"][data-t="mat"]');
  await p.click('.modal [data-act="madd"][data-t="문법"]');
  await p.keyboard.type('Grammar Inside 1'); await p.waitForTimeout(800);
  ok('보유 교재 추가', await p.evaluate(s => Store.board(s).materials[0].title === 'Grammar Inside 1', sid));
  await p.click('.modal [data-act="tab"][data-t="hw"]');
  await p.click('.modal [data-act="cfg"][data-k="wonseo"]');
  await p.fill('#bd-f-w1', 'Magic Tree House 1'); await p.waitForTimeout(800);
  await p.click('.modal [data-act="cfgx"][data-k="exam"]');
  await p.click('.modal [data-act="tab"][data-t="info"]');
  await p.fill('#bd-f-tutorId', 'whale01'); await p.fill('#bd-f-tutorPw', 'pw1234'); await p.waitForTimeout(800);
  ok('웨일튜터 아이디·비번 저장', await p.evaluate(s => { const r = Store.board(s); return r.tutorId === 'whale01' && r.tutorPw === 'pw1234'; }, sid));
  ok('비밀번호는 가려서 표시', await p.getAttribute('#bd-f-tutorPw', 'type') === 'password');
  await p.click('.modal [data-act="track"][data-k="pc"]'); await p.waitForTimeout(300);
  await p.fill('#bd-f-sbank-level', 'Phonics 3'); await p.waitForTimeout(800);
  ok('파닉스 카드 과정으로 전환', await p.evaluate(s => { const b = Store.board(s).sbank; return b.track === 'pc' && b.level === 'Phonics 3'; }, sid));
  await p.screenshot({ path: SHOT + '/board-modal.png' });
  await p.click('.modal [data-close]'); await p.waitForTimeout(300);
  ok('표에 파닉스 카드 · 카드 준비 중 표시', (await p.locator(`${row} .bd-sb`).innerText()).includes('카드 준비 중'));
  ok('원서 칩·시험대비 칩 표에 표시', await p.locator(`${row} .bd-sp .bd-chip`).count() >= 3);
  await p.click(`${row} [data-act="ex"][data-k="exam"]`);
  ok('시험대비 이번 주 체크', await p.locator(`${row} [data-act="ex"][data-k="exam"].done`).count() === 1);

  // 새로고침해도 남는지
  await p.reload({ waitUntil: 'domcontentloaded' }); await p.waitForTimeout(600);
  ok('새로고침 뒤에도 기록 유지', await p.locator(`${row} [data-act="ex"][data-k="exam"].done`).count() === 1);

  // 대시보드 카드 (다른 학생을 90%로)
  const sid2 = await p.locator('.bd-table tbody tr').nth(1).getAttribute('data-sid');
  await p.evaluate(s => Store.saveBoard({ studentId: s, current: { title: '본사 리딩 2', total: 10, done: 9, next: '', ordered: false } }), sid2);
  await p.goto(BASE + '#/dashboard', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(600);
  ok('대시보드 교재 주문 알림 카드', await p.locator('.card-h h2', { hasText: '교재 주문 알림' }).count() === 1 &&
     await p.locator('.bd-chip.urgent').count() >= 1);

  // 하루 한 번 팝업
  await p.evaluate(() => localStorage.removeItem('gorae-board-popup'));
  await p.goto(BASE + '#/board', { waitUntil: 'domcontentloaded' });
  await p.reload({ waitUntil: 'domcontentloaded' }); await p.waitForTimeout(800);
  ok('주문 알림 팝업', await p.locator('.modal h3', { hasText: '교재 주문할 학생' }).count() === 1);

  // 태블릿 폭
  await p.click('.modal [data-close]');
  await p.setViewportSize({ width: 820, height: 1180 }); await p.waitForTimeout(300);
  const overflow = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  ok('태블릿 폭에서 화면이 옆으로 밀리지 않음', !overflow);
  await p.screenshot({ path: SHOT + '/board-tablet.png' });

  ok('콘솔 오류 없음', errs.length === 0, errs.join(' | '));
  await b.close();
})();
