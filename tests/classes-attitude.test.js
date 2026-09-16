const { chromium } = require('./playwright');
const BASE = 'http://127.0.0.1:8899/index.html';
const ok = (l,c,e='') => console.log(`  ${c?'✓':'✗ 실패'}  ${l}${e?' — '+e:''}`);
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 1000 } });
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
  ok('메뉴 아이콘 11개 표시', icons.nav === 11 && icons.brand, JSON.stringify(icons));
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
