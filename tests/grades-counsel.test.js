/* 성적 관리 — 통계·학부모 공유 합치기, 시험 기록 가져오기, 상담 이력·팔로우업 */
const { chromium } = require('./playwright');
const BASE = 'http://127.0.0.1:8899/index.html';
const SHOT = process.env.SHOT_DIR;
let fails = 0;
const ok = (l, c, e = '') => { if (!c) fails++; console.log(`  ${c ? '✓' : '✗ 실패'}  ${l}${e ? ' — ' + e : ''}`); };

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 1000 } });
  await p.addInitScript(() => { window.GORAE_LOCAL_ONLY = true; });
  const errs = [];
  p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
  p.on('console', m => { if (m.type() === 'error' && !/ERR_CERT|fonts/.test(m.text())) errs.push('CONSOLE: ' + m.text()); });
  const shot = async (n, full) => { if (SHOT) await p.screenshot({ path: `${SHOT}/${n}.png`, fullPage: !!full }); };

  await p.goto(BASE + '#/settings', { waitUntil: 'networkidle' });
  await p.click('#b-sample'); await p.click('#confirm-yes'); await p.waitForTimeout(1200);
  const names = await p.evaluate(() => Store.students({ active: true }).map(s => s.name));

  /* ---------- 메뉴 합치기 ---------- */
  const menu = await p.$$eval('#nav a', as => as.map(a => a.textContent.trim()));
  ok('성적 관리 메뉴 있음', menu.includes('성적 관리'), menu.join(' / '));
  ok('통계 · 학부모 공유 메뉴는 빠짐', !menu.includes('통계') && !menu.includes('학부모 공유'));

  await p.goto(BASE + '#/stats'); await p.waitForTimeout(400);
  ok('예전 #/stats → 성적 관리 · 통계 탭', (await p.textContent('#page-title')) === '성적 관리' &&
    /on/.test(await p.getAttribute('[data-tab="stats"]', 'class')) && /전체 출석률/.test(await p.textContent('#view')));
  ok('메뉴 강조는 성적 관리', await p.getAttribute('#nav a.active', 'data-route') === 'grades');
  await p.goto(BASE + '#/share'); await p.waitForTimeout(400);
  ok('예전 #/share → 학부모 리포트 탭', /on/.test(await p.getAttribute('[data-tab="report"]', 'class')) && await p.locator('#sh-make').count() === 1);

  /* ---------- 확장 프로그램이 보내는 성적 받기 ---------- */
  await p.goto(BASE + '#/grades'); await p.waitForTimeout(400);
  await p.click('[data-tab="records"]'); await p.waitForTimeout(200);
  const rows = [
    { no: '3', name: names[0], school: '초전초', grade: '4', exam: '2026 가을 정기평가 Level 3', registeredAt: '2026-10-10 15:20:11',
      links: [{ label: '성적표', url: 'https://englishwhale.com/pt/grade_view.php?idx=3' }, { label: '인증서', url: 'https://englishwhale.com/pt/cert.php?idx=3' }] },
    { no: '2', name: names[1], school: '초전초', grade: '5', exam: '2026 가을 정기평가 Level 4', registeredAt: '2026-10-09 16:00:00', links: [] },
    { no: '1', name: '명부에없는학생', school: '진주초', grade: '3', exam: '2026 가을 정기평가 Level 2', registeredAt: '2026-10-08 10:00:00', links: [] }
  ];
  const acked = await p.evaluate((rows) => new Promise(res => {
    window.addEventListener('message', e => { if (e.data && e.data.type === 'gorae-grades-ack') res(e.data); });
    window.postMessage({ type: 'gorae-grades-import', id: 't1', rows, pageUrl: 'https://englishwhale.com/pt/grade_list.php' }, location.origin);
  }), rows);
  ok('받았다는 대답(ack)', acked.id === 't1' && acked.count === 3);
  await p.waitForSelector('#gi-ok', { timeout: 3000 });
  const prev = await p.textContent('.modal-b');
  ok('가져오기 확인 창: 새 기록 3 · 못 찾은 학생 1', /새 기록 3건/.test(prev) && /못 찾은 학생 1건/.test(prev));
  await shot('gr-import-preview');
  await p.click('#gi-ok'); await p.waitForTimeout(500);
  ok('시험 기록 3건 저장', await p.evaluate(() => Store.grades().length) === 3);
  ok('명부 학생에 연결', await p.evaluate((n) => !!Store.grades().find(g => g.name === n).studentId, names[0]));
  ok('표에 링크 표시', await p.locator('tr[data-grade] a.tag').count() === 2);
  ok('미연결 표시', await p.locator('.tag.bad:has-text("미연결")').count() === 1);
  await shot('gr-records', true);

  // 같은 기록을 다시 보내면 늘어나지 않습니다
  await p.evaluate((rows) => window.postMessage({ type: 'gorae-grades-import', id: 't2', rows }, location.origin), rows);
  await p.waitForSelector('#gi-ok');
  ok('다시 보내면 새 기록 0', /새 기록 0건/.test(await p.textContent('.modal-b')));
  await p.click('#gi-ok'); await p.waitForTimeout(400);
  ok('중복 없이 3건 유지', await p.evaluate(() => Store.grades().length) === 3);

  // 점수 · 메모 입력 후 다시 가져와도 유지
  await p.click(`tr[data-grade]:has-text("${names[0]}") td.nm`); await p.waitForTimeout(300);
  await p.fill('#gf-score', '92점'); await p.fill('#gf-memo', '리스닝 보완');
  await p.click('#gf-save'); await p.waitForTimeout(300);
  await p.evaluate((rows) => window.postMessage({ type: 'gorae-grades-import', id: 't3', rows }, location.origin), rows);
  await p.waitForSelector('#gi-ok'); await p.click('#gi-ok'); await p.waitForTimeout(300);
  ok('다시 가져와도 점수·메모 유지', await p.evaluate((n) => { const g = Store.grades().find(g => g.name === n); return g.score === '92점' && g.memo === '리스닝 보완'; }, names[0]));

  // 미연결 기록을 학생에 연결
  await p.click('tr[data-grade]:has-text("명부에없는학생") td.nm'); await p.waitForTimeout(300);
  const sid2 = await p.evaluate((n) => Store.students().find(s => s.name === n).id, names[2]);
  await p.selectOption('#gf-stu', sid2); await p.click('#gf-save'); await p.waitForTimeout(300);
  ok('미연결 기록 연결', await p.evaluate(() => Store.grades({ unlinked: true }).length) === 0);

  // 한 학생 것만 고르기
  await p.evaluate(() => window.postMessage({ type: 'gorae-grades-import', id: 't4', rows: [
    { name: '신예솔', exam: '단어 인증 Level 5', registeredAt: '2026-10-11 10:00' },
    { name: '다른학생', exam: '단어 인증 Level 5', registeredAt: '2026-10-11 10:00' }] }, location.origin));
  await p.waitForSelector('#gi-name');
  await p.fill('#gi-name', '신예솔');
  ok('이름으로 고르면 1건', (await p.textContent('#gi-ok')).trim() === '1건 가져오기');
  await p.click('#gi-ok'); await p.waitForTimeout(300);
  ok('고른 학생만 저장', await p.evaluate(() => !!Store.grades().find(g => g.name === '신예솔') && !Store.grades().find(g => g.name === '다른학생')));
  await p.evaluate(() => Store.deleteGrade(Store.grades().find(g => g.name === '신예솔').id));

  /* ---------- 표 붙여넣기 ---------- */
  const parsed = await p.evaluate((n) => Views.grades.parsePasted(
    '번호\t학생명\t학교\t학년\t시험명\t성적표/인증서\t등록일시\n' +
    '5\t' + n + '\t초전초\t4\t2026 겨울 모의평가\t성적표 인증서\t2026.10.12 09:10\n'), names[0]);
  ok('붙여넣기 읽기', parsed.length === 1 && parsed[0].exam === '2026 겨울 모의평가' && parsed[0].registeredAt.startsWith('2026-10-12'), JSON.stringify(parsed[0]));
  const noHead = await p.evaluate(() => Views.grades.parsePasted('7\t김하늘\t초전초\t3\t단어 인증 Level 1\t보기\t2026-10-01 11:00'));
  ok('머리줄 없이 붙여넣기', noHead.length === 1 && noHead[0].name === '김하늘' && noHead[0].registeredAt === '2026-10-01 11:00');

  /* ---------- 상담 이력 · 팔로우업 ---------- */
  const sid = await p.evaluate((n) => Store.students().find(s => s.name === n).id, names[0]);
  await p.click('[data-tab="counsel"]'); await p.waitForTimeout(300);
  await p.click('#cs-add'); await p.waitForTimeout(300);
  await p.selectOption('#cf-stu', sid);
  await p.selectOption('#cf-topic', '성적');
  ok('관련 시험 고르기에 학생의 시험이 나옴', await p.locator('#cf-grade option').count() === 2);
  await p.selectOption('#cf-grade', { index: 1 });
  await p.fill('#cf-content', '정기평가 리스닝 점수가 낮아 어머님과 통화. 집에서 듣기 숙제를 늘리기로 함.');
  await p.fill('#cf-plan', '2주간 리스닝 숙제 매일 / 다음 평가 전 재상담');
  await p.click('[data-fu="7"]');
  await p.click('#cf-save'); await p.waitForTimeout(400);
  const c1 = await p.evaluate(() => Store.counsels()[0]);
  ok('상담 저장 + 다음 확인일', c1.followUpDate && !c1.followUpDone && c1.gradeId, c1.followUpDate);
  ok('팔로우업 할 일에 표시', await p.locator('.csl-due').count() === 1);
  ok('학생 타임라인 표시', /정기평가 리스닝/.test(await p.textContent('.csl-thread')));
  await shot('gr-counsel', true);

  await p.click('.csl-due [data-csl-follow]'); await p.waitForTimeout(300);
  ok('후속 상담 창에 앞 상담 보임', /이어지는 상담/.test(await p.textContent('.modal-b')));
  await p.fill('#cf-content', '2주 리스닝 숙제 잘 하고 있음. 받아쓰기 점수 올라감.');
  await p.click('#cf-save'); await p.waitForTimeout(400);
  const after = await p.evaluate((id) => ({ parent: Store.counsel(id), n: Store.counsels().length,
    threads: Store.counselThreads(Store.counsel(id).studentId).length }), c1.id);
  ok('후속 상담 저장 → 앞 상담 확인 완료', after.parent.followUpDone === true && after.n === 2);
  ok('한 흐름(스레드)으로 묶임', after.threads === 1 && await p.locator('.csl-item.follow').count() === 1);
  ok('팔로우업 할 일 비워짐', await p.locator('.csl-due').count() === 0);
  await shot('gr-counsel-thread', true);

  // 지난 팔로우업 → 대시보드 · 탭 배지
  await p.evaluate((sid) => Store.saveCounsel({ studentId: sid, topic: '학습태도', with: '학생', channel: '대면',
    content: '숙제 미제출이 잦아 면담', followUpDate: U.daysAgo(2), followUpDone: false }), sid);
  await p.goto(BASE + '#/grades?tab=counsel'); await p.waitForTimeout(400);
  ok('탭 배지(기한 지난 팔로우업)', /1/.test(await p.textContent('[data-tab="counsel"]')));
  ok('지난 팔로우업 빨간 표시', /2일 지남/.test(await p.textContent('.csl-due')));
  await p.click('.csl-due [data-csl-done]'); await p.waitForTimeout(300);
  ok('확인 완료 버튼', await p.evaluate(() => Store.counsels({ pending: true }).length) === 0);
  await p.evaluate((sid) => Store.saveCounsel({ studentId: sid, topic: '진로·진학', content: '중등 진학 상담', followUpDate: U.ymd() }), sid);
  await p.goto(BASE + '#/dashboard'); await p.waitForTimeout(600);
  ok('대시보드 오늘 일정에 상담 팔로우업', /상담 팔로우업/.test(await p.textContent('#selected-tasks')));

  /* ---------- 학생 상세 ---------- */
  await p.goto(BASE + '#/students'); await p.waitForTimeout(300);
  await p.click(`tr[data-open="${sid}"]`); await p.waitForTimeout(300);
  const detail = await p.textContent('.modal-b');
  ok('학생 상세에 성적 · 상담', /성적 · 상담/.test(detail) && /92점/.test(detail) && /팔로우업 대기 1건/.test(detail));
  await shot('gr-student');
  await p.click('#d-counsel'); await p.waitForTimeout(300);
  ok('학생 상세 → 상담 기록 창', await p.inputValue('#cf-stu') === sid);
  await p.keyboard.press('Escape');

  /* ---------- 학부모 리포트에 시험 기록 ---------- */
  await p.goto(BASE + '#/grades?tab=report&student=' + sid); await p.waitForTimeout(400);
  await p.fill('#sh-from', '2026-01-01'); await p.dispatchEvent('#sh-from', 'change'); await p.waitForTimeout(200);
  const pv = await p.textContent('#sh-preview');
  ok('리포트에 시험 기록', /시험 기록/.test(pv) && /92점/.test(pv));
  ok('리포트에 상담 내용은 없음', !/리스닝 숙제를 늘리기로/.test(pv));
  await p.$eval('#sh-grades', el => { el.checked = false; el.dispatchEvent(new Event('change', { bubbles: true })); });
  ok('체크 끄면 시험 기록 빠짐', !/시험 기록/.test(await p.textContent('#sh-preview')));

  /* ---------- 동기화 등록 ---------- */
  ok('grade · counsel 동기화 대상', await p.evaluate(() => {
    const kinds = Store.allRecords().map(r => r.kind);
    return kinds.includes('grade') && kinds.includes('counsel');
  }));

  /* ---------- 휴대폰 화면 ---------- */
  await p.setViewportSize({ width: 390, height: 844 });
  await p.goto(BASE + '#/grades?tab=counsel&student=' + sid); await p.waitForTimeout(400);
  ok('휴대폰: 가로 넘침 없음', await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  await shot('gr-mobile', true);

  console.log('\n에러 ' + errs.length + '건');
  errs.slice(0, 8).forEach(e => console.log('   ' + e));
  await b.close();
  process.exit(fails || errs.length ? 1 : 0);
})();
