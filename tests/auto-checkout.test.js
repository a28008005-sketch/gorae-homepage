/* 자동 하원 — 태블릿 등원 뒤 하원을 안 누르면 정해진 시간(기본 90분) 뒤 하원 처리되는지 확인합니다.
 * 준비: npx http-server -p 8899 -s .  /  node tests/fake-cloud-server.js &  /  curl -s http://127.0.0.1:8902/reset
 */
const { chromium } = require('./playwright');
const ROOT = 'http://127.0.0.1:8899/';
const SHOT = process.env.SHOT_DIR;

// checkin.test.js 와 같은 가짜 전송 계층
const INIT = `
window.addEventListener('DOMContentLoaded', function () {
  Cloud.setTransport({
    name: 'fake',
    connect: function () {
      var u = null;
      try { u = JSON.parse(localStorage.getItem('__fakeuser') || 'null'); } catch (e) {}
      return Promise.resolve(u);
    },
    signIn: function () { return Promise.reject(new Error('unused')); },
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
  const notifyCalls = [];
  const mk = async (name) => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await ctx.addInitScript(INIT);
    await ctx.addInitScript(SIGNED_IN);
    await ctx.route('**/api/notify/**', async (route) => {
      if (route.request().url().endsWith('/status')) return route.fulfill({ json: { ready: true, missing: [], in: true, out: true, sender: '010-****-8335' } });
      notifyCalls.push(JSON.parse(route.request().postData() || '{}'));
      return route.fulfill({ json: { ok: true, sent: 1, total: 1 } });
    });
    const p = await ctx.newPage();
    p.on('pageerror', e => errs.push(name + ': ' + e.message));
    return p;
  };

  // 원장님 PC: 학생 셋 + 등원 알림만 켬 (하원 알림 끔)
  const A = await mk('원생관리');
  await A.goto(ROOT + 'index.html#/settings', { waitUntil: 'networkidle' });
  await A.waitForTimeout(500);
  ok('설정에 자동 하원 칸 (기본 90분)', (await A.inputValue('#n-auto')) === '90');
  await A.evaluate(() => {
    // 예전 학원 정보처럼 값이 없는 경우에도 90분으로 동작해야 합니다
    delete Store.get().academy.autoCheckoutMin;
    Store.saveAcademy({ notifyIn: true, notifyOut: false });
    Store.saveStudent({ name: '하원안함', status: '등록생', grade: '3학년', parentPhone: '010-1111-0001' });
    Store.saveStudent({ name: '일찍하원', status: '등록생', grade: '3학년', parentPhone: '010-1111-0002' });
    Store.saveStudent({ name: '방금등원', status: '등록생', grade: '3학년', parentPhone: '010-1111-0003' });
  });
  ok('값이 없는 예전 학원 정보도 90분', (await A.evaluate(() => Store.autoCheckoutMin())) === 90);
  await A.evaluate(() => Sync.push());
  await A.waitForTimeout(500);

  // 태블릿: 셋 다 등원
  const T = await mk('태블릿');
  await T.goto(ROOT + 'checkin.html', { waitUntil: 'networkidle' });
  await T.waitForTimeout(800);
  const type = async (digits) => { for (const d of digits) await T.click(`.ci-key[data-k="${d}"]`); await T.waitForTimeout(300); };
  for (const code of ['0001', '0002', '0003']) {
    await type(code);
    await T.click('.ci-name');
    await T.waitForTimeout(300);
    await T.evaluate(() => Checkin.reset());
  }
  ok('등원 알림은 셋 다 감', notifyCalls.filter(c => c.kind === 'in').length === 3, String(notifyCalls.length));

  // 하원안함: 95분 전 등원으로 돌려 둠 / 일찍하원: 60분 전 등원 → 지금 하원 누름 / 방금등원: 그대로
  const at = await T.evaluate(() => {
    const id = n => Store.students().find(s => s.name === n).id;
    const back = (n, min) => {
      const t = new Date(Date.now() - min * 60000);
      const p = x => (x < 10 ? '0' : '') + x;
      Store.setAttendance(id(n), U.ymd(), { checkInAt: t.toISOString(), checkIn: p(t.getHours()) + ':' + p(t.getMinutes()) });
      return t.toISOString();
    };
    return { late: back('하원안함', 95), early: back('일찍하원', 60) };
  });
  await type('0002');
  await T.click('.ci-name');
  await T.click('[data-act="out"]');
  await T.waitForTimeout(300);
  ok('1시간 뒤 하원을 누르면 바로 하원', /하원 완료/.test(await T.textContent('.ci-title')));
  await T.evaluate(() => Checkin.reset());

  // 태블릿을 새로 열면 시작하자마자 자동 하원을 확인합니다
  const callsBefore = notifyCalls.length;
  await T.reload({ waitUntil: 'networkidle' });
  await T.waitForTimeout(1200);
  const rec = n => T.evaluate((n) => {
    const s = Store.students().find(x => x.name === n);
    return Store.attendanceFor(s.id, U.ymd());
  }, n);

  const r1 = await rec('하원안함');
  const want = new Date(new Date(at.late).getTime() + 90 * 60000);
  const p = x => (x < 10 ? '0' : '') + x;
  ok('하원 안 누른 아이: 등원 90분 뒤로 자동 하원', r1.checkOutAuto === true && r1.checkOut === p(want.getHours()) + ':' + p(want.getMinutes()),
    JSON.stringify({ in: r1.checkIn, out: r1.checkOut, auto: r1.checkOutAuto }));
  const r2 = await rec('일찍하원');
  ok('직접 하원한 아이는 누른 시각 그대로', r2.checkOut && !r2.checkOutAuto);
  const r3 = await rec('방금등원');
  ok('90분이 안 지난 아이는 아직 학원에', !r3.checkOut);
  ok('자동 하원은 카톡을 보내지 않음', notifyCalls.length === callsBefore && !notifyCalls.some(c => c.kind === 'out'), String(notifyCalls.length - callsBefore));
  ok('태블릿 인원 표시에 반영', /지금 학원에 1명/.test(await T.textContent('#ci-count')), await T.textContent('#ci-count'));

  // 자동 하원된 아이가 다시 누르면 "이미 하원"
  await type('0001');
  ok('이름 옆에 하원 시각', /하원 \d\d:\d\d/.test(await T.textContent('.ci-badge')));
  await T.evaluate(() => Checkin.reset());

  // 원생관리 출결 화면
  await T.waitForTimeout(1500);
  await A.evaluate(() => Sync.pull());
  await A.waitForTimeout(500);
  await A.goto(ROOT + 'index.html#/attendance', { waitUntil: 'networkidle' });
  await A.waitForTimeout(600);
  await A.click('#sc-all');
  await A.waitForTimeout(200);
  const row = await A.evaluate(() => {
    const s = Store.students().find(x => x.name === '하원안함');
    const el = document.querySelector('.att-row[data-sid="' + s.id + '"]');
    return el ? el.textContent : '';
  });
  ok('출결 화면에 "하원 HH:MM 자동"', /하원 \d\d:\d\d 자동/.test(row), row.slice(0, 60));
  if (SHOT) await A.screenshot({ path: SHOT + '/auto-checkout.png' });

  // 0 이면 끔
  await A.evaluate(() => {
    Store.saveAcademy({ autoCheckoutMin: 0 });
    const s = Store.students().find(x => x.name === '방금등원');
    Store.setAttendance(s.id, U.ymd(), { checkInAt: new Date(Date.now() - 200 * 60000).toISOString() });
  });
  ok('0 분이면 자동 하원 안 함', (await A.evaluate(() => Store.autoCheckout())) === 0);

  ok('페이지 오류 없음', errs.length === 0, errs.join(' | '));
  await browser.close();
})();
