/* 태블릿 등하원 출결 — 번호 입력 → 등원/하원 → 원생관리 화면에 반영되는지 확인합니다.
 * 준비: npx http-server -p 8899 -s .  /  node tests/fake-cloud-server.js &  /  curl -s http://127.0.0.1:8902/reset
 */
const { chromium } = require('./playwright');
const ROOT = 'http://127.0.0.1:8899/';
const SHOT = process.env.SHOT_DIR;

// 가짜 전송 계층 (cloud-sync.test.js 와 같은 것)
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

// 두 기기 모두 이미 학원 계정으로 로그인해 둔 상태로 시작합니다.
const SIGNED_IN = `
if (!localStorage.getItem('gorae-academy-sync')) {
  localStorage.setItem('gorae-academy-sync', JSON.stringify({ mode: 'cloud', url: 'https://fake.supabase.co', anonKey: 'fake' }));
  localStorage.setItem('__fakeuser', JSON.stringify({ id: 'u-1', email: 'wonjang@gorae.kr' }));
}
`;

const ok = (label, cond, extra = '') => { console.log(`  ${cond ? '✓' : '✗ 실패'}  ${label}${extra ? ' — ' + extra : ''}`); if (!cond) process.exitCode = 1; };

(async () => {
  const browser = await chromium.launch();
  const errs = [];
  const mk = async (name, viewport) => {
    const ctx = await browser.newContext({ viewport });
    await ctx.addInitScript(INIT);
    await ctx.addInitScript(SIGNED_IN);
    const p = await ctx.newPage();
    p.on('pageerror', e => errs.push(name + ': ' + e.message));
    return p;
  };

  // ---- 원장님 PC: 학생 등록 ----
  const A = await mk('원생관리', { width: 1380, height: 900 });
  await A.goto(ROOT + 'index.html#/attendance', { waitUntil: 'networkidle' });
  await A.waitForTimeout(500);
  ok('원생관리 로그인 상태로 열림', !(await A.isVisible('.gate')));
  await A.evaluate(() => {
    Store.saveStudent({ name: '김하늘', status: '등록생', grade: '3학년', parentPhone: '010-1111-2345' });
    Store.saveStudent({ name: '김바다', status: '등록생', grade: '5학년', parentPhone: '01011112345' });   // 형제 (같은 번호)
    Store.saveStudent({ name: '이도윤', status: '등록생', grade: '4학년', parentPhone: '010-9876-5432' });
    Store.saveStudent({ name: '박퇴원', status: '퇴원생', grade: '4학년', parentPhone: '010-0000-7777' });
  });
  await A.evaluate(() => Sync.push());
  await A.waitForTimeout(400);

  // ---- 학원 태블릿 ----
  const T = await mk('태블릿', { width: 1280, height: 800 });
  await T.goto(ROOT + 'checkin.html', { waitUntil: 'networkidle' });
  await T.waitForTimeout(800);
  ok('태블릿에 로그인 창이 뜨지 않음', !(await T.isVisible('.gate')));
  ok('태블릿이 학생 명단을 받아옴', (await T.evaluate(() => Store.students({ active: true }).length)) === 3);
  if (SHOT) await T.screenshot({ path: SHOT + '/checkin-1-pad.png' });

  const type = async (digits) => { for (const d of digits) await T.click(`.ci-key[data-k="${d}"]`); await T.waitForTimeout(300); };

  // 없는 번호
  await type('0000');
  ok('없는 번호는 안내 문구', /등록된 번호가 없어요/.test(await T.textContent('#ci-msg')));

  // 퇴원생 번호는 안 잡힘
  await type('7777');
  ok('퇴원생은 출결 대상 아님', /등록된 번호가 없어요/.test(await T.textContent('#ci-msg')));

  // 한 명
  await type('5432');
  ok('뒤 4자리로 학생 찾음', (await T.$$eval('.ci-name', els => els.map(e => e.querySelector('.nm').textContent))).join() === '이도윤');
  await T.click('.ci-name');
  await T.waitForTimeout(200);
  ok('등원 완료 화면', /등원 완료/.test(await T.textContent('.ci-title')));
  if (SHOT) await T.screenshot({ path: SHOT + '/checkin-2-done.png' });

  // 형제
  await T.click('.ci-panel'); await T.evaluate(() => Checkin.reset());
  await type('2345');
  const names = await T.$$eval('.ci-name .nm', els => els.map(e => e.textContent).sort());
  ok('같은 번호의 형제는 이름을 골라서', names.join() === '김바다,김하늘', names.join());
  if (SHOT) await T.screenshot({ path: SHOT + '/checkin-3-pick.png' });
  await T.click('.ci-name:has-text("김하늘")');
  await T.waitForTimeout(200);
  await T.evaluate(() => Checkin.reset());

  // 등원 직후 다시 누르면 하원 처리하지 않음
  await type('5432');
  ok('이름 옆에 등원 시각 표시', /등원 \d\d:\d\d/.test(await T.textContent('.ci-badge')));
  await T.click('.ci-name');
  ok('등원 직후엔 "이미 등원" 안내', /이미 등원/.test(await T.textContent('.ci-title')));
  await T.evaluate(() => Checkin.reset());

  // 등원을 20분 전으로 돌려 놓고 하원
  await T.evaluate(() => {
    var s = Store.students().filter(x => x.name === '이도윤')[0];
    Store.setAttendance(s.id, U.ymd(), { checkInAt: new Date(Date.now() - 20 * 60000).toISOString() });
  });
  await type('5432');
  await T.click('.ci-name');
  ok('하원할지 묻는 화면', /하원/.test(await T.textContent('.ci-confirm')));
  if (SHOT) await T.screenshot({ path: SHOT + '/checkin-4-out.png' });
  await T.click('[data-act="out"]');
  await T.waitForTimeout(200);
  ok('하원 완료 화면', /하원 완료/.test(await T.textContent('.ci-title')));

  const rec = await T.evaluate(() => {
    var s = Store.students().filter(x => x.name === '이도윤')[0];
    return Store.attendanceFor(s.id, U.ymd());
  });
  ok('출결 기록: 출석 + 등원/하원 시각', rec.status === '출석' && /^\d\d:\d\d$/.test(rec.checkIn) && /^\d\d:\d\d$/.test(rec.checkOut),
     JSON.stringify({ status: rec.status, checkIn: rec.checkIn, checkOut: rec.checkOut }));

  // 키보드 입력도 됨
  await T.evaluate(() => Checkin.reset());
  await T.keyboard.type('0000'); await T.waitForTimeout(300);
  ok('숫자 키보드로도 입력', /등록된 번호가 없어요/.test(await T.textContent('#ci-msg')));

  await T.waitForTimeout(1200);   // 태블릿이 올릴 시간
  ok('태블릿 보낼 기록 없음', (await T.evaluate(() => Sync.pendingCount())) === 0);

  // ---- 원생관리 화면에 반영 ----
  await A.evaluate(() => Sync.pull());
  await A.waitForTimeout(500);
  await A.click('#sc-all');           // 예시 학생은 수업 요일이 없어 '전체 등록생'으로 봅니다
  await A.waitForTimeout(200);
  const rowText = await A.evaluate(() => {
    var s = Store.students().filter(x => x.name === '이도윤')[0];
    var row = document.querySelector('.att-row[data-sid="' + s.id + '"]');
    return row ? row.textContent : '';
  });
  ok('원생관리 출결 화면에 등원·하원 시각', /등원 \d\d:\d\d · 하원 \d\d:\d\d/.test(rowText));
  const onBtn = await A.evaluate(() => {
    var s = Store.students().filter(x => x.name === '김하늘')[0];
    var b = document.querySelector('.att-row[data-sid="' + s.id + '"] [data-status="출석"]');
    return b && b.classList.contains('on');
  });
  ok('원생관리에서 출석 버튼이 켜짐', onBtn);
  if (SHOT) await A.screenshot({ path: SHOT + '/checkin-5-admin.png' });

  // 세로 태블릿
  await T.setViewportSize({ width: 800, height: 1280 });
  await T.evaluate(() => Checkin.reset());
  if (SHOT) await T.screenshot({ path: SHOT + '/checkin-6-portrait.png' });

  ok('페이지 오류 없음', errs.length === 0, errs.join(' | '));
  await browser.close();
})();
