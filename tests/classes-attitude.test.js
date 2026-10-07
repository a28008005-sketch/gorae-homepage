const { chromium } = require('./playwright');
const BASE = 'http://127.0.0.1:8899/index.html';
const ok = (l,c,e='') => console.log(`  ${c?'✓':'✗ 실패'}  ${l}${e?' — '+e:''}`);
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 1000 } });
  await p.addInitScript(() => { window.GORAE_LOCAL_ONLY = true; });   // 로컬 모드 화면만 확인합니다
  const errs = [];
  p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE: ' + m.text()); });

  await p.goto(BASE + '#/settings', { waitUntil: 'networkidle' });
  await p.click('#b-sample'); await p.click('#confirm-yes'); await p.waitForTimeout(1200);

  // 메뉴 확인
  const menu = await p.$$eval('#nav a', as => as.map(a => a.textContent.trim()));
  ok('순회 점검 메뉴 삭제됨', !menu.some(m => /순회/.test(m)), menu.join(' / '));
  ok('좌석 배치 메뉴 삭제됨', !menu.some(m => /좌석/.test(m)));
  ok('반 · 시간표 메뉴 있음', menu.some(m => /반/.test(m)));

  // 반
  await p.goto(BASE + '#/classes', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(600);
  ok('반 3개 생성됨', (await p.locator('.class-card').count()) === 3, (await p.locator('.class-card').count()) + '개');
  ok('주간 시간표 블록 표시', (await p.locator('.tt-block').count()) > 0, (await p.locator('.tt-block').count()) + '블록');
  await p.screenshot({ path: (process.env.SHOT_DIR || '.') + '/c-classes.png', fullPage: true });

  // 반 만들기
  await p.click('#add'); await p.waitForTimeout(300);
  await p.fill('#k-name', '중등 심화반');
  await p.click('[data-day="화"]'); await p.click('[data-day="목"]');
  await p.selectOption('#k-time', '7시');
  await p.click('#k-save'); await p.waitForTimeout(600);
  ok('반 만들기', (await p.locator('.class-card').count()) === 4);

  // 학생 배정
  await p.click('.class-card:last-child [data-members]'); await p.waitForTimeout(400);
  await p.click('.member-row:first-child .cbx');
  await p.click('#m-save'); await p.waitForTimeout(600);
  const moved = await p.evaluate(() => {
    const c = Store.classes().find(x => x.name === '중등 심화반');
    return Store.studentsInClass(c.id).length;
  });
  ok('학생 배정', moved === 1, moved + '명');

  // 반 시간표가 출결에 반영되는지 (화/목 7시반)
  const sched = await p.evaluate(() => {
    const c = Store.classes().find(x => x.name === '중등 심화반');
    const s = Store.studentsInClass(c.id)[0];
    return Store.scheduleOf(s);
  });
  ok('학생 시간표가 반을 따름', sched.days.join('') === '화목' && sched.time === '7시',
     sched.days.join('') + ' ' + sched.time);

  // 출결 · 수업 태도
  await p.goto(BASE + '#/attendance', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(600);
  await p.click('#sc-all'); await p.waitForTimeout(400);
  ok('수업 태도 줄 표시', (await p.locator('.att-attitude').count()) > 0);
  await p.click('.att-row:first-child [data-attitude="졸음"]'); await p.waitForTimeout(500);
  const saved = await p.evaluate(() => {
    const s = Store.students({active:true})[0];
    const r = Store.attendanceFor(s.id, U.ymd());
    return r && r.attitude;
  });
  ok('수업 태도 저장', Array.isArray(saved) && saved.includes('졸음'), JSON.stringify(saved));

  // 이모지가 붙어 저장되어 있던 예전 기록이 새 이름으로 옮겨오는지
  const renamed = await p.evaluate(() => {
    const s = Store.students({active:true})[0];
    const rec = Store.attendanceFor(s.id, U.ymd());
    rec.attitude = ['🟢 집중', '📱 휴대폰 사용'];
    const d = Store.get();
    d.meta.attitudesRenamed = false;
    Store.migrateAttitudes();
    return Store.attendanceFor(s.id, U.ymd()).attitude;
  });
  ok('예전 태도 이름 이관',
     renamed.join('|') === '집중|휴대폰 사용', JSON.stringify(renamed));

  // 아이콘이 이모지 대신 SVG 로 그려졌는지
  const icons = await p.evaluate(() => ({
    nav: document.querySelectorAll('.nav a i svg').length,
    brand: !!document.querySelector('.brand-mark svg')
  }));
  ok('메뉴 아이콘 전부 표시', icons.nav === 14 && icons.brand, JSON.stringify(icons));

  // 학원자료실 — 노션에 있던 자료가 들어오는지
  await p.goto(BASE + '#/resources', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(700);
  const res = await p.evaluate(() => Store.resources().map(r => r.title));
  ok('학원자료실 자료 채워짐', res.length >= 2 && res.some(t => /데일리 듣기/.test(t)), JSON.stringify(res));
  ok('자료실 카드 표시', (await p.locator('.res-card').count()) >= 2);

  // 영자신문 워크시트 — 목록과 레벨 거르기
  await p.goto(BASE + '#/news', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(700);
  // 개수는 assets/data/newsItems.js 에서 셉니다. 워크시트가 늘 때마다 테스트를 고치지 않도록.
  const want = await p.evaluate(() => ({
    all: window.NEWSLETTER_DATA.length,
    g2: window.NEWSLETTER_DATA.filter(n => n.level === 'G2').length
  }));
  const news = await p.evaluate(() => Store.newsItems().length);
  ok('영자신문 워크시트 채워짐', news === want.all, news + '/' + want.all);
  await p.click('[data-lv="G2"]'); await p.waitForTimeout(400);
  const g2 = await p.locator('#n-rows tr').count();
  ok('레벨로 거르기', g2 === want.g2, g2 + '행');
  await p.click('[data-lv=""]'); await p.waitForTimeout(300);

  // 학생별 진도 — 레벨을 정하면 다음 차례가 나오고, 시작·완료가 기록됩니다
  await p.click('[data-tab="progress"]'); await p.waitForTimeout(400);
  const sid = await p.evaluate(() => Store.students({ active: true })[0].id);
  await p.selectOption('[data-lvset="' + sid + '"]', 'K1'); await p.waitForTimeout(400);
  const plan0 = await p.evaluate(id => Store.newsPlan(id), sid);
  ok('레벨을 정하면 다음 차례가 나옴', plan0.level === 'K1' && !!plan0.next, plan0.next && plan0.next.title);
  await p.click('[data-start^="' + sid + '|"]'); await p.waitForTimeout(300);
  await p.click('[data-done^="' + sid + '|"]'); await p.waitForTimeout(300);
  const plan1 = await p.evaluate(id => Store.newsPlan(id), sid);
  ok('시작·완료가 기록되고 다음 기사로 넘어감',
    plan1.doneInLevel === 1 && plan1.next && plan1.next.id !== plan0.next.id,
    plan1.doneInLevel + '건 완료 · 다음 ' + (plan1.next && plan1.next.title));
  await p.click('[data-tab="list"]'); await p.waitForTimeout(300);

  // 대시보드 캘린더는 하나만 남아야 합니다
  await p.goto(BASE + '#/dashboard', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(700);
  const cal = await p.evaluate(() => ({
    grids: document.querySelectorAll('.calendar-grid').length,
    dark: document.querySelectorAll('.cal-panel').length,
    side: !!document.querySelector('.cal-side')
  }));
  ok('대시보드 캘린더는 하나', cal.grids === 1 && cal.dark === 0 && cal.side, JSON.stringify(cal));
  await p.screenshot({ path: (process.env.SHOT_DIR || '.') + '/c-attendance.png' });

  // 나머지 화면 회귀
  for (const r of ['dashboard','students','tuition','stats','share','settings']) {
    await p.goto(BASE + '#/' + r, { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(400);
    const len = (await p.textContent('#view')).length;
    if (len < 50) errs.push(r + ' 화면이 비어 있음');
  }
  await p.goto(BASE + '#/dashboard', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(500);
  await p.screenshot({ path: (process.env.SHOT_DIR || '.') + '/c-dashboard.png' });
  ok('삭제된 경로는 대시보드로', await p.evaluate(async () => {
    location.hash = '#/patrol';
    await new Promise(r => setTimeout(r, 400));
    return document.getElementById('page-title').textContent;
  }) === '대시보드');

  console.log('\n에러 ' + errs.length + '건');
  errs.slice(0,8).forEach(e => console.log('   ' + e));
  await b.close();
})();
