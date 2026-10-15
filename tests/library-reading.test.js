/**
 * 도서 대여 탭 확인 — 학생별 독서 현황 · 권장 도서 레벨 · 북리포트 제출 상태 · 워크시트 자료실
 *
 *   npx http-server -p 8899 -s .      (저장소 최상위에서)
 *   node tests/library-reading.test.js
 */
const { chromium } = require('./playwright');
const BASE = 'http://127.0.0.1:8899/index.html';
const SHOT = process.env.SHOT_DIR || '';
const results = [];
const ok = (l, c, e = '') => { results.push(!!c); console.log(`  ${c ? '✓' : '✗ 실패'}  ${l}${e ? ' — ' + e : ''}`); };

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 1050 } });
  await p.addInitScript(() => { window.GORAE_LOCAL_ONLY = true; });
  const errs = [];
  p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
  p.on('console', m => { if (m.type() === 'error' && !/ERR_CERT|Failed to load resource/.test(m.text())) errs.push('CONSOLE: ' + m.text()); });
  const shot = async (name, full) => { if (SHOT) await p.screenshot({ path: `${SHOT}/${name}.png`, fullPage: !!full }); };

  await p.goto(BASE + '#/settings', { waitUntil: 'networkidle' });
  await p.click('#b-sample'); await p.click('#confirm-yes'); await p.waitForTimeout(1200);

  /* ---------- 탭 1: 도서 목록 ---------- */
  await p.goto(BASE + '#/library'); await p.waitForTimeout(500);
  ok('탭 3개 표시', await p.locator('.lib-tabs [data-tab]').count() === 3);
  ok('워크시트 · 북리포트 열', (await p.textContent('.tbl thead')).includes('워크시트 · 북리포트'));
  ok('대출 중인 책에 북리포트 상태', await p.locator('#rows .lib-ws .tag').count() >= 1);
  await shot('lib-1-books');

  // 대여할 때 레벨 비교 — 예시 학생 0번은 Lv4
  const lend = await p.evaluate(() => {
    var s = Store.students({ active: true })[0];
    Store.saveStudent({ id: s.id, readLevel: '2' });
    var bk = Store.books().filter(function (x) { return Store.bookStatus(x).key === 'in' && Worksheet.levelOf(x) > 2; })[0];
    return { sid: s.id, bid: bk.id };
  });
  await p.click(`[data-lend="${lend.bid}"]`);
  await p.selectOption('#l-stu', lend.sid);
  const warn = await p.textContent('#l-lvcheck');
  ok('대여창 레벨 경고', /권장 레벨 Lv2보다 높은/.test(warn), warn.trim());
  await shot('lib-1-lend-warn');
  await p.$eval('#l-ws', el => { el.checked = false; });
  await p.click('#l-save'); await p.waitForTimeout(300);

  /* ---------- 탭 2: 학생별 독서 현황 ---------- */
  await p.click('[data-tab="students"]'); await p.waitForTimeout(300);
  ok('학생 카드 표시', await p.locator('.rd-card').count() >= 5);
  await shot('lib-2-students', true);

  // 북리포트 상태 바꾸기 — 한 번 눌러 한 번만 바뀌는지 (클릭 처리 겹침 확인)
  const loanId = await p.evaluate((sid) => Store.loans({ studentId: sid, open: true })[0].id, lend.sid);
  for (let i = 0; i < 3; i++) { await p.click('[data-tab="books"]'); await p.click('[data-tab="students"]'); }
  await p.click(`[data-br="${loanId}|제출완료"]`); await p.waitForTimeout(200);
  ok('북리포트 제출완료 저장', await p.evaluate((id) => Store.bookReportOf(Store.loans().filter(l => l.id === id)[0]), loanId) === '제출완료');
  await p.click(`[data-br="${loanId}|작성중"]`); await p.waitForTimeout(200);
  ok('북리포트 작성중으로 되돌리기', await p.evaluate((id) => Store.bookReportOf(Store.loans().filter(l => l.id === id)[0]), loanId) === '작성중');

  // 필터: 미제출 있는 학생만
  await p.click('[data-brf="waiting"]'); await p.waitForTimeout(200);
  const waitingOk = await p.evaluate(() => [].every.call(document.querySelectorAll('.rd-card'), function (c) {
    return /북리포트 대기/.test(c.textContent);
  }));
  ok('미제출 필터', waitingOk);
  await p.click('[data-brf="all"]');

  // 레벨 설정 창 — 한 번 눌렀을 때 창이 하나만 떠야 합니다
  await p.click(`[data-rlv="${lend.sid}"]`); await p.waitForTimeout(200);
  ok('레벨 설정 창 하나만', await p.locator('#rl-lv').count() === 1);
  await p.selectOption('#rl-lv', '3');
  await p.fill('#rl-note', 'AR 1.5 ~ 2.2 권장');
  await p.click('#rl-save'); await p.waitForTimeout(200);
  ok('권장 레벨 저장', await p.evaluate((sid) => Store.student(sid).readLevel, lend.sid) === '3');

  // 독서 이력 출력
  await p.click(`[data-rprint="${lend.sid}"]`); await p.waitForTimeout(400);
  const hist = await p.frameLocator('#hi-if').locator('body').textContent();
  ok('독서 이력 미리보기', /독서 이력/.test(hist) && /북리포트/.test(hist));
  await shot('lib-2-history');
  await p.click('[data-close]');

  /* ---------- 탭 3: 워크시트 자료실 ---------- */
  await p.click('[data-tab="sheets"]'); await p.waitForTimeout(300);
  const total = await p.locator('.ws-item').count();
  ok('자료 목록 표시', total === await p.evaluate(() => Store.books().length), total + '건');
  await shot('lib-3-sheets', true);
  await p.click('[data-wlv="5"]'); await p.waitForTimeout(200);
  const lv5 = await p.evaluate(() => Store.books().filter(x => Worksheet.levelOf(x) === 5).length);
  ok('레벨 거르기', await p.locator('.ws-item').count() === lv5, lv5 + '권');
  await p.click('[data-blank="2"]'); await p.waitForTimeout(400);
  ok('빈 양식 출력', /Book Report/.test(await p.frameLocator('#ws-if').locator('body').textContent()));
  await p.click('[data-close]');

  /* ---------- 학생 명부 · 대시보드 ---------- */
  await p.goto(BASE + '#/students'); await p.waitForTimeout(300);
  await p.click('#add').catch(() => {});
  ok('학생 등록창에 권장 도서 레벨', await p.locator('#f-rlv').count() === 1);
  await p.click('[data-close]');

  await p.goto(BASE + '#/dashboard'); await p.waitForTimeout(400);
  ok('대시보드에 북리포트 대기', /북리포트 대기/.test(await p.textContent('body')));

  /* ---------- 휴대폰 화면 ---------- */
  await p.setViewportSize({ width: 390, height: 844 });
  await p.goto(BASE + '#/library'); await p.click('[data-tab="students"]'); await p.waitForTimeout(300);
  const overflow = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  ok('휴대폰에서 가로 넘침 없음', !overflow);
  await shot('lib-m-students');

  errs.forEach(e => console.log('  ' + e));
  console.log(`\n에러 ${errs.length}건 · 통과 ${results.filter(Boolean).length}건 · 실패 ${results.filter(x => !x).length}건`);
  await b.close();
  process.exit(errs.length || results.some(x => !x) ? 1 : 0);
})();
