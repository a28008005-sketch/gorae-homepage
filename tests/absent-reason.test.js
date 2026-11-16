/* 결석 사유 — 출결 화면 · 대시보드에서 기입 */
const { chromium } = require('./playwright');
const BASE = 'http://127.0.0.1:8899/index.html';
const ok = (l, c, e = '') => console.log(`  ${c ? '✓' : '✗ 실패'}  ${l}${e ? ' — ' + e : ''}`);

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1280, height: 1100 } });
  await p.addInitScript(() => { window.GORAE_LOCAL_ONLY = true; });
  const errs = [];
  p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));

  await p.goto(BASE + '#/settings', { waitUntil: 'networkidle' });
  await p.click('#b-sample'); await p.click('#confirm-yes'); await p.waitForTimeout(1200);

  // 출결 화면: 결석을 누르면 사유 줄이 나옴
  await p.goto(BASE + '#/attendance', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(600);
  await p.click('#sc-all'); await p.waitForTimeout(400);
  const sid = await p.getAttribute('.att-row >> nth=0', 'data-sid');
  const row = `.att-row[data-sid="${sid}"]`;
  ok('결석 전에는 사유 줄 없음', await p.locator(row + ' .absent-box').count() === 0);
  await p.click(row + ' [data-status="결석"]'); await p.waitForTimeout(300);
  ok('결석 누르면 사유 줄 표시', await p.locator(row + ' .absent-box').count() === 1);

  await p.click(row + ' [data-absr="아파서"]'); await p.waitForTimeout(300);
  let r = await p.evaluate(id => Store.attendanceFor(id, U.ymd()).absentReason, sid);
  ok('빠른 선택으로 저장', r === '아파서', r);
  ok('고른 칩 표시', await p.locator(row + ' [data-absr="아파서"].on').count() === 1);

  await p.click(row + ' [data-absr="아파서"]'); await p.waitForTimeout(300);
  r = await p.evaluate(id => Store.attendanceFor(id, U.ymd()).absentReason, sid);
  ok('한 번 더 누르면 지워짐', r === '', JSON.stringify(r));

  await p.fill(row + ' [data-absr-in]', '감기로 병원');
  await p.press(row + ' [data-absr-in]', 'Tab'); await p.waitForTimeout(300);
  r = await p.evaluate(id => Store.attendanceFor(id, U.ymd()).absentReason, sid);
  ok('직접 쓰기 저장', r === '감기로 병원', r);
  ok('다시 그려도 글 유지', await p.inputValue(row + ' [data-absr-in]') === '감기로 병원');

  // 대시보드: 오늘 수업 학생 하나를 결석으로 → 사유 기입
  const d = await p.evaluate(() => {
    const s = Store.studentsOnDay(U.dayOf(U.ymd()))[0];
    if (!s) return null;
    Store.setAttendance(s.id, U.ymd(), { status: '결석', absentReason: '' });
    return s.id;
  });
  if (d) {
    await p.goto(BASE + '#/dashboard', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(800);
    const dr = `.absent-row[data-sid="${d}"]`;
    ok('대시보드에 오늘 결석 목록', await p.locator(dr).count() === 1);
    ok('사유 미기입 표시', /사유 미기입/.test(await p.locator('.absent-h').innerText()));
    await p.click(dr + ' [data-absr="가족 일정"]'); await p.waitForTimeout(400);
    r = await p.evaluate(id => Store.attendanceFor(id, U.ymd()).absentReason, d);
    ok('대시보드에서 사유 저장 (여러 번 그려도 한 번만 바뀜)', r === '가족 일정', r);
    await p.click(dr + ' [data-absr="학교 행사"]'); await p.waitForTimeout(400);
    r = await p.evaluate(id => Store.attendanceFor(id, U.ymd()).absentReason, d);
    ok('다른 사유로 바꾸기', r === '학교 행사', r);
    await p.locator('.absent-today').scrollIntoViewIfNeeded();
    await p.screenshot({ path: (process.env.SHOT_DIR || '.') + '/absent-dash.png', fullPage: false });
  } else {
    ok('오늘 수업 학생 없음 — 대시보드 확인 건너뜀', true);
  }

  // 학생 정보 최근 출결에 사유
  await p.evaluate(id => Views.students.openDetail(id), sid); await p.waitForTimeout(400);
  ok('학생 정보에 결석 사유', /사유: 감기로 병원/.test(await p.locator('.modal').innerText()));

  ok('스크립트 오류 없음', errs.length === 0, errs.join(' | '));
  await b.close();
})();
