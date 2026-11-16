/* 반 담당 선생님 (Jinny / Binny) 지정·필터, 학생 개인 요일 우선 */
const { chromium } = require('./playwright');
const BASE = 'http://127.0.0.1:8899/index.html';
const ok = (l,c,e='') => console.log(`  ${c?'✓':'✗ 실패'}  ${l}${e?' — '+e:''}`);
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 1000 } });
  await p.addInitScript(() => { window.GORAE_LOCAL_ONLY = true; });
  const errs = [];
  p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
  await p.goto(BASE + '#/settings', { waitUntil: 'networkidle' });
  await p.click('#b-sample'); await p.click('#confirm-yes'); await p.waitForTimeout(1200);
  await p.goto(BASE + '#/classes', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(600);

  // 카드에서 바로 지정
  await p.locator('.class-card').nth(0).locator('[data-t="Jinny"]').click(); await p.waitForTimeout(300);
  await p.locator('.class-card').nth(1).locator('[data-t="Binny"]').click(); await p.waitForTimeout(300);
  const t = await p.evaluate(() => Store.classes().map(c => c.teacher || ''));
  ok('카드에서 담당 지정', t[0] === 'Jinny' && t[1] === 'Binny', JSON.stringify(t));

  // 필터
  await p.click('[data-tf="Jinny"]'); await p.waitForTimeout(300);
  ok('Jinny 필터', (await p.locator('.class-card').count()) === 1);
  await p.click('[data-tf="__none__"]'); await p.waitForTimeout(300);
  ok('담당 미지정 필터 (샘플 반은 모두 담당 있음)', (await p.locator('.class-card').count()) === 0);
  await p.click('[data-tf=""]'); await p.waitForTimeout(300);

  // 수정 창에서 바꾸기
  await p.locator('.class-card').nth(2).locator('[data-edit]').click(); await p.waitForTimeout(300);
  await p.click('[data-tc="Binny"]'); await p.click('#k-save'); await p.waitForTimeout(400);
  const t2 = await p.evaluate(() => Store.classes()[2].teacher);
  ok('수정 창에서 Binny 지정', t2 === 'Binny', t2);
  // 한 번 더 누르면 해제
  await p.locator('.class-card').nth(0).locator('[data-t="Jinny"]').click(); await p.waitForTimeout(300);
  ok('다시 누르면 해제', (await p.evaluate(() => Store.classes()[0].teacher)) === '');

  // 학생 요일 우선
  const sch = await p.evaluate(() => {
    var c = Store.classes()[0];
    var id = Store.saveStudent({ name: '요일테스트', status: '등록생', days: ['화', '목'], classId: c.id, arrive: '2:40' });
    var sc = Store.scheduleOf(Store.student(id));
    return { days: sc.days.join(''), arrive: sc.arrive, cls: sc.className === c.name };
  });
  ok('반에 있어도 학생 요일 우선', sch.days === '화목' && sch.arrive === '2:40' && sch.cls, JSON.stringify(sch));
  await p.goto(BASE + '#/settings'); await p.goto(BASE + '#/classes'); await p.waitForTimeout(600);
  await p.screenshot({ path: (process.env.SHOT_DIR || '.') + '/c-teacher.png', fullPage: true });
  // 대시보드에서도 보기·지정
  await p.goto(BASE + '#/dashboard', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(800);
  ok('대시보드에 오늘 반 카드', (await p.locator('.dash-cls .class-card').count()) === 3);
  await p.locator('.dash-cls .class-card').nth(0).locator('[data-t="Binny"]').click(); await p.waitForTimeout(400);
  ok('대시보드에서 담당 지정', (await p.evaluate(() => Store.classes()[0].teacher)) === 'Binny');
  await p.click('.dash-cls [data-tf="Binny"]'); await p.waitForTimeout(400);
  ok('대시보드 Binny 필터', (await p.locator('.dash-cls .class-card').count()) === 3);
  await p.click('.dash-cls [data-tf=""]'); await p.waitForTimeout(400);
  await p.screenshot({ path: (process.env.SHOT_DIR || '.') + '/c-dash.png', fullPage: false });
  // 시간표별 출석 현황 (시각화)
  const tl = await p.evaluate(() => {
    var d = U.ymd(), day = U.dayOf(d);
    var cid = Store.saveClass({ name: '1:40반', days: [day], time: '1시' });
    var cid2 = Store.saveClass({ name: '3:15~3:30반', days: [day], time: '3시' });
    var mk = function (n, c, arr) { return Store.saveStudent({ name: n, status: '등록생', classId: c, arrive: arr, days: [day] }); };
    var a = mk('가학생', cid, '1:40'), b = mk('나학생', cid, '1:40'), c = mk('다학생', cid, '1:40 (' + day + ' 1:00)');
    var e = mk('라학생', cid2, '3:20'), f = mk('마학생', cid2, '3:30');
    Store.setAttendance(a, d, { checkIn: '13:44' });
    Store.setAttendance(b, d, { checkIn: '14:05' });
    Store.setAttendance(e, d, { status: '결석' });
    return true;
  });
  await p.goto(BASE + '#/settings'); await p.goto(BASE + '#/dashboard'); await p.waitForTimeout(800);
  const dots = await p.$$eval('.tl-dot', ds => ds.map(d => d.textContent + ':' + d.className.split(' ')[1]));
  ok('시간표 출석 그림 표시', dots.length >= 5, dots.join(' '));
  ok('정시 등원 초록', dots.includes('가학생:st-in'));
  ok('10분 넘게 늦으면 주황', dots.includes('나학생:st-late'));
  ok('오늘 요일 시각을 따름 (1:00 지남 → 아직 안 옴)', dots.includes('다학생:st-miss') || new Date().getHours() < 13, dots.find(x => x.startsWith('다')));
  ok('결석 빨강', dots.includes('라학생:st-bad'));
  await p.locator('.tl-dot', { hasText: '가학생' }).click(); await p.waitForTimeout(400);
  ok('이름표 누르면 학생 정보', await p.locator('.modal').count() > 0);
  await p.keyboard.press('Escape');
  await p.screenshot({ path: (process.env.SHOT_DIR || '.') + '/c-tl.png', fullPage: false, clip: { x: 236, y: 230, width: 1204, height: 760 } });
  console.log(errs.length ? '\n에러 ' + errs.join('\n') : '\n페이지 에러 없음');
  await b.close();
})();
