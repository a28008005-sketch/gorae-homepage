/* 학습 현황판 — 레벨 21회차 · 웨일튜터 기록 가져오기 · 웨일튜터 한눈에 */
const { chromium } = require('./playwright');
const BASE = 'http://127.0.0.1:8899/index.html';
const ok = (l, c, e = '') => console.log(`  ${c ? '✓' : '✗ 실패'}  ${l}${e ? ' — ' + e : ''}`);
const SHOT = process.env.SHOT_DIR || '.';
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1366, height: 1000 } });
  await p.addInitScript(() => { window.GORAE_LOCAL_ONLY = true; try { localStorage.setItem('gorae-board-popup', new Date().toISOString().slice(0, 10)); } catch (e) {} });
  const errs = [];
  p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
  p.on('response', r => { if (r.status() >= 400 && !/\/(hw|api)\//.test(r.url())) errs.push('HTTP ' + r.status() + ' ' + r.url()); });

  await p.goto(BASE + '#/settings', { waitUntil: 'networkidle' });
  await p.click('#b-sample'); await p.click('#confirm-yes'); await p.waitForTimeout(1200);
  await p.goto(BASE + '#/board', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(500);
  await p.evaluate(() => { var k = document.querySelector('.modal [data-close]'); if (k) k.click(); });

  // 학생 3명을 웨일튜터 기록과 연결: A 240 vol.2 (Unit 3 Day 2 까지), B 파닉스 3 (AI 테스트 자주 안 함), C 는 웨일튜터에 없음
  const names = await p.evaluate(() => Store.students({ active: true }).slice(0, 3).map(s => s.name));
  const r = await p.evaluate((names) => {
    const days = {}, ymd = n => { const d = new Date(Date.now() - n * 864e5); return d.toISOString().slice(0, 10); };
    let n = 0;
    for (let i = 30; i >= 1; i--) {
      const d = new Date(Date.now() - i * 864e5); if (!(d.getDay() % 6)) continue;
      n++; if (n > 12) break;
      const u = Math.ceil(n / 5), dd = n - (u - 1) * 5;
      const w = dd === 5;
      days[ymd(i)] = [
        ['kid-a', 'WE-L1V2U' + u + 'D' + dd, w ? 17 : 8, w ? 20 : 10, w ? 0 : 80, 1, 100, 100, '15:00'],
        ['kid-b', 'WE-L0V3U' + u + 'D' + dd, n % 2 ? -1 : 4, w ? 20 : 10, w ? 0 : 50, n % 3 ? 1 : 0, null, null, '16:00']
      ];
    }
    const pay = { type: 'gorae-wt', at: new Date().toISOString(), days,
      students: [['kid-a', names[0], 'WE-L1V2', '240 vol.2/기본', '2026-10-01'], ['kid-b', names[1], 'WE-L0V3', 'Whale phonics3/기본', '2026-10-01'], ['kid-z', '없는학생', 'WE-L1V1', '', '']] };
    const msgs = [];
    Views.board._receive(pay, { postMessage: m => msgs.push(m) });
    return { msgs, a: Store.students({ active: true })[0].id, b: Store.students({ active: true })[1].id };
  }, names);
  ok('가져오기 응답 (ack)', r.msgs.includes('gorae-wt-ack'), r.msgs.join(','));
  ok('결과 창 — 학생 2명 연결', await p.locator('.modal h3', { hasText: '웨일튜터 기록을 가져왔습니다' }).count() === 1 &&
    (await p.locator('.modal').innerText()).includes('2명'));
  const ra = await p.evaluate(s => Store.board(s), r.a);
  ok('교재가 웨일튜터 교재로 맞춰짐', ra.current.title === '240 vol.2' && ra.sbank.level === '240', ra.current.title);
  ok('웨일튜터 아이디 채워짐', ra.tutorId === 'kid-a');
  await p.click('.modal [data-close]'); await p.waitForTimeout(300);

  // 웨일튜터 한눈에 (가져오면 바로 이 화면)
  ok('웨일튜터 한눈에 화면', await p.locator('.bd-hm').count() === 1);
  ok('날짜 칸 12일', await p.locator('.bd-hm thead th.hc').count() === 12);
  ok('AI 안 한 날 × 표시', await p.locator(`.bd-hm tr[data-sid="${r.b}"] .hm.miss`).count() >= 5);
  ok('위클리 칸 굵은 테두리', await p.locator(`.bd-hm tr[data-sid="${r.a}"] .hm.w`).count() === 2);
  ok('챙길 학생 먼저 (B 가 맨 위)', await p.locator('.bd-hm tbody tr').first().getAttribute('data-sid') === r.b);
  ok('AI 테스트 자주 안 함 표시', (await p.locator(`.bd-hm tr[data-sid="${r.b}"]`).innerText()).includes('AI 테스트 자주 안 함'));
  await p.screenshot({ path: SHOT + '/board-wt.png', fullPage: true });

  // 표로 보기 — 21칸
  await p.click('[data-act="mode"][data-k="table"]'); await p.waitForTimeout(300);
  const row = `.bd-table tr[data-sid="${r.a}"]`;
  ok('21칸 회차 줄', await p.locator(`${row} .bd-strip .sq`).count() === 21);
  ok('12/21회차 · 다음 Unit 3 · Day 3', (await p.locator(`${row} .bd-book`).innerText()).includes('12/21회차 · 다음 Unit 3 · Day 3'));
  ok('프랙티스북 12/20 자동', (await p.locator(`${row} .bd-ach.auto`).first().innerText()).includes('12/20'));
  const card = await p.getAttribute(`${row} .bd-sb a.go`, 'href');
  ok('센텐스카드 → 240 Vol.2 Unit 3', /survival\.html\?lv=240&v=2&u=3/.test(card || ''), card);
  await p.screenshot({ path: SHOT + '/board-level-table.png' });

  // 회차 칸 누르면 레벨 21회차 탭
  await p.click(`${row} .bd-strip .sq >> nth=4`); await p.waitForTimeout(300);
  ok('위클리 회차 상세', (await p.locator('.bd-seldetail h4').innerText()).includes('5회차 · Unit 1 위클리'));
  ok('웨일튜터 AI 17/20 표시', (await p.locator('.bd-lms').innerText()).includes('17 / 20'));
  await p.fill('#bd-lv-wk', '88'); await p.locator('#bd-lv-wk').blur(); await p.waitForTimeout(800);
  await p.click('.bd-seldetail [data-act="lvt"][data-k="card"]'); await p.waitForTimeout(300);
  const lv = await p.evaluate(s => Store.board(s).lv['WE-L1V2']['5'], r.a);
  ok('위클리 점수 · 카드 연습 저장', lv.wk === 88 && lv.card === true, JSON.stringify(lv));
  ok('카드 연습 링크 Unit 1', /u=1/.test(await p.getAttribute('.bd-seldetail a.go', 'href')));
  await p.screenshot({ path: SHOT + '/board-level-modal.png' });

  // 21회차 → 레벨 종료
  await p.click('.bd-ses.kM'); await p.waitForTimeout(200);
  await p.fill('#bd-lv-mt', '95'); await p.locator('#bd-lv-mt').blur(); await p.waitForTimeout(700);
  await p.click('.bd-seldetail [data-act="lvt"][data-k="org"]');
  await p.click('.bd-seldetail [data-act="lvt"][data-k="video"]');
  await p.click('.bd-seldetail [data-act="finish"]');
  await p.click('.bd-seldetail [data-act="finish-yes"]'); await p.waitForTimeout(300);
  const fin = await p.evaluate(s => Store.board(s), r.a);
  ok('레벨 종료 → 히스토리 (먼슬리 · AI 기록)', fin.history.slice(-1)[0].title === '240 vol.2' && fin.history.slice(-1)[0].mt === '95' && /%$/.test(fin.history.slice(-1)[0].ai), JSON.stringify(fin.history.slice(-1)[0]));
  ok('끝난 교재는 다시 안 잡힘', fin.wt.done === 'WE-L1V2');
  await p.click('.modal [data-close]');

  // 같은 묶음이 또 와도 교재가 되돌아가지 않음 · 새 교재 배정되면 넘어감
  const again = await p.evaluate(({ a }) => {
    const pay = { type: 'gorae-wt', at: 'x2', days: {}, students: [['kid-a', '', 'WE-L1V2', '', '']] };
    Views.board._receive(pay, { postMessage() {} });
    const t1 = Store.board(a).current.title;
    Views.board._receive({ type: 'gorae-wt', at: 'x3', days: {}, students: [['kid-a', '', 'WE-L1V3', '240 vol.3/기본', '2026-11-07']] }, { postMessage() {} });
    return { t1, t2: Store.board(a).current.title, key: WT.bookKey(Store.board(a)) };
  }, r);
  ok('종료 후 같은 교재 재수신 → 그대로', again.t1 !== '240 vol.2', again.t1);
  ok('웨일튜터에서 새 교재 배정 → 240 vol.3', again.t2 === '240 vol.3' && again.key === 'WE-L1V3', JSON.stringify(again));
  await p.evaluate(() => { document.querySelectorAll('.modal [data-close]').forEach(x => x.click()); });

  // 가져오기 안내 창 · 북마크
  await p.click('[data-act="wtimport"]'); await p.waitForTimeout(200);
  const href = await p.getAttribute('[data-bm]', 'href');
  ok('북마크 버튼 (javascript:)', /^javascript:/.test(href) && href.length > 1000);
  await p.click('[data-bm]'); await p.waitForTimeout(200);
  ok('북마크 버튼을 눌러도 실행 안 됨', !errs.length && await p.evaluate(() => location.hostname) === '127.0.0.1');
  ok('콘솔 오류 없음', errs.length === 0, errs.join(' | '));
  await b.close();
})();
