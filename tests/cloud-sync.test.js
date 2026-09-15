const { chromium } = require('playwright');
const BASE = 'http://127.0.0.1:8899/index.html';
const API = 'http://127.0.0.1:8902';

// 브라우저에 심을 가짜 전송 계층 — 실제 Supabase 자리에 들어갑니다.
const INIT = `
window.addEventListener('DOMContentLoaded', function () {
  Cloud.setTransport({
    name: 'fake',
    connect: function () {
      var u = null;
      try { u = JSON.parse(localStorage.getItem('__fakeuser') || 'null'); } catch (e) {}
      return Promise.resolve(u);
    },
    signIn: function (email, password) {
      return fetch('http://127.0.0.1:8902/signin', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: email, password: password })
      }).then(function (r) { return r.json().then(function (j) {
        if (!r.ok) throw new Error(Cloud.translateAuthError(j.error));
        localStorage.setItem('__fakeuser', JSON.stringify(j.user));
        return j.user;
      }); });
    },
    signOut: function () { localStorage.removeItem('__fakeuser'); return Promise.resolve(); },
    fetchSince: function (since) {
      return fetch('http://127.0.0.1:8902/since?ts=' + encodeURIComponent(since || '')).then(function (r) {
        if (!r.ok) throw new Error('연결 실패'); return r.json();
      }).then(function (list) {
        return list.map(function (r) {
          return { kind: r.kind, id: r.id, data: r.data, updatedAt: r.updated_at, deleted: !!r.deleted };
        });
      });
    },
    upsert: function (rows) {
      return fetch('http://127.0.0.1:8902/upsert', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ rows: rows })
      }).then(function (r) { if (!r.ok) throw new Error('전송 실패'); });
    }
  }, true);
}, true);
`;

const ok = (label, cond, extra='') => console.log(`  ${cond ? '✓' : '✗ 실패'}  ${label}${extra ? ' — ' + extra : ''}`);

(async () => {
  const browser = await chromium.launch();
  const errs = [];
  const mkDevice = async (name) => {
    const ctx = await browser.newContext({ viewport: { width: 1380, height: 950 } });
    await ctx.addInitScript(INIT);
    const p = await ctx.newPage();
    p.on('pageerror', e => errs.push(name + ' PAGEERROR: ' + e.message));
    p.on('console', m => {
      const t = m.text();
      if (m.type() === 'error' && !/status of (401|500)/.test(t)) errs.push(name + ' CONSOLE: ' + t);
    });
    return p;
  };

  // ============ 선생님 A (원장) ============
  const A = await mkDevice('A');
  await A.goto(BASE, { waitUntil: 'networkidle' });

  // 로컬 모드에서 예시 데이터로 시작
  await A.goto(BASE + '#/settings', { waitUntil: 'networkidle' });
  await A.click('#b-sample'); await A.click('#confirm-yes'); await A.waitForTimeout(900);
  const localCount = await A.evaluate(() => Store.students().length);
  ok('로컬 모드에서 예시 학생 생성', localCount === 8, localCount + '명');

  // 클라우드 연결
  await A.fill('#c-url', 'https://fake.supabase.co');
  await A.fill('#c-key', 'eyJhbGciOiJfake-anon-key');
  await A.click('#c-connect'); await A.waitForTimeout(600);
  ok('연결 후 로그인 화면 표시', await A.isVisible('.gate'));

  // service_role 키 거부 확인은 별도로
  // 로그인
  await A.fill('#g-email', 'wonjang@gorae.kr');
  await A.fill('#g-pw', 'wrongpass');
  await A.click('#g-login'); await A.waitForTimeout(600);
  const errText = await A.textContent('#g-err');
  ok('잘못된 비밀번호 거부', /맞지 않습니다/.test(errText), errText.trim());

  await A.fill('#g-pw', 'test1234');
  await A.click('#g-login'); await A.waitForTimeout(900);
  ok('로그인 성공 · 게이트 해제', !(await A.isVisible('.gate')));
  ok('상태 칩 표시', /연결됨|동기화/.test(await A.textContent('#sync-chip')), (await A.textContent('#sync-chip')).trim());

  // 전체 올리기
  await A.goto(BASE + '#/settings', { waitUntil: 'domcontentloaded' }); await A.waitForTimeout(500);
  await A.click('#c-upload'); await A.click('#confirm-yes');
  await A.waitForTimeout(2500);
  const serverRows = await (await fetch(API + '/count')).json();
  const localRecs = await A.evaluate(() => Store.allRecords().length);
  ok('기존 기록 전체 업로드', serverRows.rows === localRecs, serverRows.rows + '행 (로컬 ' + localRecs + '건)');

  // ============ 선생님 B (다른 기기, 빈 상태) ============
  const B = await mkDevice('B');
  await B.goto(BASE, { waitUntil: 'networkidle' });
  await B.evaluate((cfg) => {
    localStorage.setItem('gorae-academy-sync', JSON.stringify(cfg));
  }, { mode: 'cloud', url: 'https://fake.supabase.co', anonKey: 'anon', lastPulledAt: '', pending: [] });
  await B.reload({ waitUntil: 'networkidle' }); await B.waitForTimeout(500);
  ok('B 기기: 로그인 요구', await B.isVisible('.gate'));
  await B.fill('#g-email', 'teacher@gorae.kr');
  await B.fill('#g-pw', 'test1234');
  await B.click('#g-login'); await B.waitForTimeout(2500);
  const bCount = await B.evaluate(() => Store.students().length);
  ok('B 기기: 로그인만으로 명부 수신', bCount === 8, bCount + '명');
  const bPay = await B.evaluate(() => Store.payments({}).length);
  ok('B 기기: 수강료 기록도 수신', bPay > 0, bPay + '건');

  // ============ 양방향 전파 ============
  // B가 새 학생 등록 -> A가 받는지
  await B.evaluate(() => Store.saveStudent({ name: '한소원', grade: '중3', status: '등록생', days: ['화','목'], time: '7시' }));
  await B.waitForTimeout(1500);
  await A.evaluate(() => Sync.syncNow()); await A.waitForTimeout(900);
  const aSees = await A.evaluate(() => Store.students().some(s => s.name === '한소원'));
  ok('B → A 신규 학생 전파', aSees);

  // A가 출결 체크 -> B가 받는지
  await A.evaluate(() => {
    var s = Store.students()[0];
    Store.setAttendance(s.id, U.ymd(), { status: '출석', note: 'A선생님 입력' });
    return s.name;
  });
  await A.waitForTimeout(1500);
  await B.evaluate(() => Sync.syncNow()); await B.waitForTimeout(900);
  const bSeesNote = await B.evaluate(() => {
    var s = Store.students()[0];
    var r = Store.attendanceFor(s.id, U.ymd());
    return r && r.note;
  });
  ok('A → B 출결 전파', bSeesNote === 'A선생님 입력', String(bSeesNote));

  // 삭제 전파 (소프트 삭제)
  await A.evaluate(() => {
    var s = Store.students().find(x => x.name === '한소원');
    Store.deleteStudent(s.id);
  });
  await A.waitForTimeout(1500);
  await B.evaluate(() => Sync.syncNow()); await B.waitForTimeout(900);
  const bGone = await B.evaluate(() => !Store.students().some(s => s.name === '한소원'));
  ok('삭제 전파 (다른 기기에서도 사라짐)', bGone);

  // ============ 오프라인 → 복구 ============
  await fetch(API + '/fail?on=1');
  await B.evaluate(() => Store.saveStudent({ name: '오프라인학생', grade: '5학년', status: '등록생', days: ['월'], time: '3시' }));
  await B.waitForTimeout(1800);
  const chipB = (await B.textContent('#sync-chip')).trim();
  const pend = await B.evaluate(() => Sync.pendingCount());
  ok('오프라인 시 대기열에 보관', pend > 0 && /오프라인/.test(chipB), chipB + ' / 대기 ' + pend);
  const stillUsable = await B.evaluate(() => Store.students().some(s => s.name === '오프라인학생'));
  ok('오프라인에도 입력은 즉시 반영', stillUsable);

  await fetch(API + '/fail?on=0');
  await B.evaluate(() => Sync.syncNow()); await B.waitForTimeout(1200);
  await A.evaluate(() => Sync.syncNow()); await A.waitForTimeout(900);
  const recovered = await A.evaluate(() => Store.students().some(s => s.name === '오프라인학생'));
  ok('연결 복구 후 밀린 기록 전송', recovered && (await B.evaluate(() => Sync.pendingCount())) === 0);

  // ============ 동시 수정 (나중 저장이 남음) ============
  await A.evaluate(() => { var s = Store.students()[0]; Store.saveStudent({ id: s.id, note: 'A가 씀' }); });
  await A.waitForTimeout(1400);
  await B.evaluate(() => Sync.syncNow()); await B.waitForTimeout(600);
  await B.evaluate(() => { var s = Store.students()[0]; Store.saveStudent({ id: s.id, note: 'B가 나중에 씀' }); });
  await B.waitForTimeout(1400);
  await A.evaluate(() => Sync.syncNow()); await A.waitForTimeout(900);
  const finalNote = await A.evaluate(() => Store.students()[0].note);
  ok('동시 수정 시 나중 저장이 남음', finalNote === 'B가 나중에 씀', finalNote);

  // ============ 학부모 공개 화면은 로그인 불필요 ============
  await A.evaluate(() => Sync.signOut());
  await A.waitForTimeout(400);
  const rep = await A.evaluate(() => {
    var s = Store.students()[0];
    var d = Views.share.build(s.id, U.daysAgo(20), U.ymd(), '테스트');
    return location.href.split('#')[0] + '#/report?d=' + U.encodeData(d);
  });
  const P = await mkDevice('parent');
  await P.goto(rep, { waitUntil: 'networkidle' }); await P.waitForTimeout(700);
  ok('학부모 리포트는 로그인 없이 열림', !(await P.isVisible('.gate')) && await P.isVisible('.report'));

  // ============ 세션 종료 시 자동으로 로그인 화면 ============
  await A.waitForTimeout(600);
  ok('로그아웃하면 로그인 화면이 다시 뜸', await A.isVisible('.gate'));

  // ============ 로컬 모드 복귀 ============
  await A.click('#g-local'); await A.click('#confirm-yes'); await A.waitForTimeout(700);
  const backLocal = await A.evaluate(() => Sync.isCloud());
  ok('로컬 모드로 되돌리기', backLocal === false);

  console.log('\n에러 ' + errs.length + '건');
  errs.slice(0, 10).forEach(e => console.log('   ' + e));
  await A.screenshot({ path: (process.env.SHOT_DIR || '.') + '/s-settings.png' });
  await browser.close();
})();
