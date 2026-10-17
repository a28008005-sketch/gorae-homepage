/* 등하원 카톡 알림 — 태블릿에서 등원·하원 → 워커 알림 창구로 요청이 가는지, 결과가 출결 화면에 보이는지 확인합니다.
 * 워커(/api/notify/*)는 가짜로 바꿔 둡니다. 실제 솔라피 발송은 tests/worker.test.js 가 가짜 솔라피로 확인합니다.
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
  const calls = [];
  let mode = 'ok';           // ok | down(인터넷 끊김) | reject(워커 거절)
  const STATUS = { ready: true, missing: [], in: true, out: true, sender: '010-****-8335' };

  const mk = async (name, viewport) => {
    const ctx = await browser.newContext({ viewport });
    await ctx.addInitScript(INIT);
    await ctx.addInitScript(SIGNED_IN);
    await ctx.route('**/api/notify/**', async (route) => {
      const req = route.request();
      if (req.url().endsWith('/status')) return route.fulfill({ json: STATUS });
      const body = JSON.parse(req.postData() || '{}');
      if (mode === 'down') return route.abort('internetdisconnected');
      calls.push({ path: new URL(req.url()).pathname, body });
      if (mode === 'reject') return route.fulfill({ status: 502, json: { ok: false, error: '템플릿 내용이 일치하지 않습니다' } });
      return route.fulfill({ json: { ok: true, sent: 1, total: 1 } });
    });
    const p = await ctx.newPage();
    p.on('pageerror', e => errs.push(name + ': ' + e.message));
    return p;
  };

  // ---- 원장님 PC: 학생 등록 + 설정에서 알림 켜기 ----
  const A = await mk('원생관리', { width: 1380, height: 900 });
  await A.goto(ROOT + 'index.html#/settings', { waitUntil: 'networkidle' });
  await A.waitForTimeout(500);
  ok('설정에 등하원 카톡 알림 칸', await A.isVisible('text=등하원 카톡 알림'));
  ok('워커 상태 표시: 발송 준비 완료', /발송 준비 완료/.test(await A.textContent('#n-state')), await A.textContent('#n-state'));
  ok('처음에는 꺼져 있음', !(await A.isChecked('#n-in')) && !(await A.isChecked('#n-out')));
  await A.click('label:has(#n-in)');
  await A.click('label:has(#n-out)');
  ok('켜면 학원 정보에 저장', await A.evaluate(() => Store.get().academy.notifyIn && Store.get().academy.notifyOut));
  if (SHOT) await A.screenshot({ path: SHOT + '/notify-1-settings.png' });

  await A.fill('#n-phone', '010-3803-8335');
  await A.click('#n-test-in');
  await A.waitForTimeout(300);
  ok('시험 발송 요청', calls.some(c => c.path === '/api/notify/test' && c.body.kind === 'in' && c.body.to === '010-3803-8335'));
  calls.length = 0;

  await A.evaluate(() => {
    Store.saveStudent({ name: '김하늘', status: '등록생', grade: '3학년', parentPhone: '010-1111-2345' });
    Store.saveStudent({ name: '이도윤', status: '등록생', grade: '4학년', parentPhone: '010-9876-5432, 010-2222-3333' });
    Store.saveStudent({ name: '최번호', status: '등록생', grade: '2학년', parentPhone: '' });
  });
  await A.evaluate(() => Sync.push());
  await A.waitForTimeout(500);

  // ---- 학원 태블릿 ----
  const T = await mk('태블릿', { width: 1280, height: 800 });
  await T.goto(ROOT + 'checkin.html', { waitUntil: 'networkidle' });
  await T.waitForTimeout(800);
  ok('태블릿도 알림 켜짐을 받아옴', await T.evaluate(() => Notify.enabled('in') && Notify.enabled('out')));
  const type = async (digits) => { for (const d of digits) await T.click(`.ci-key[data-k="${d}"]`); await T.waitForTimeout(300); };
  const recOf = (name) => T.evaluate((n) => {
    var s = Store.students().filter(x => x.name === n)[0];
    return Store.attendanceFor(s.id, U.ymd());
  }, name);

  // 등원 → 카톡
  await type('5432');
  await T.click('.ci-name');
  await T.waitForTimeout(400);
  ok('등원 완료 화면에 "부모님께 카톡" 표시', /부모님께 카톡으로 알려 드렸어요/.test(await T.textContent('.ci-done')));
  if (SHOT) await T.screenshot({ path: SHOT + '/notify-2-checkin.png' });
  const c1 = calls.find(c => c.path === '/api/notify/attendance');
  ok('워커로 등원 알림 요청 (이름·번호·시각)', c1 && c1.body.kind === 'in' && c1.body.name === '이도윤' &&
    c1.body.to === '010-9876-5432, 010-2222-3333' && /^\d\d:\d\d$/.test(c1.body.time) && !!c1.body.key, JSON.stringify(c1 && c1.body));
  let rec = await recOf('이도윤');
  ok('출결 기록에 "보냄" 남김', rec.notifyIn && rec.notifyIn.state === 'sent', JSON.stringify(rec.notifyIn));

  // 하원 → 카톡
  await T.evaluate(() => {
    var s = Store.students().filter(x => x.name === '이도윤')[0];
    Store.setAttendance(s.id, U.ymd(), { checkInAt: new Date(Date.now() - 60 * 60000).toISOString() });
    Checkin.reset();
  });
  calls.length = 0;
  await type('5432');
  await T.click('.ci-name');
  await T.click('[data-act="out"]');
  await T.waitForTimeout(400);
  ok('하원 알림 요청', calls.length === 1 && calls[0].body.kind === 'out');
  rec = await recOf('이도윤');
  ok('하원 결과도 기록', rec.notifyOut && rec.notifyOut.state === 'sent');

  // 연락처 없는 학생은 안 보냄 (번호가 없으면 태블릿에서 찾을 수도 없지만, 직접 불러 확인)
  const skipped = await T.evaluate(() => {
    var s = Store.students().filter(x => x.name === '최번호')[0];
    return Notify.queue(s, 'in', U.ymd(), '15:00');
  });
  ok('학부모 연락처가 없으면 보내지 않음', skipped === false && (await recOf('최번호')).notifyIn.state === 'skipped');

  // 인터넷이 끊겼을 때 → 담아 두었다가 다시 보냄
  await T.evaluate(() => Checkin.reset());
  calls.length = 0;
  mode = 'down';
  await type('2345');
  await T.click('.ci-name');
  await T.waitForTimeout(400);
  ok('끊기면 태블릿에 담아 둠', (await T.evaluate(() => Notify.pending())) === 1 && (await recOf('김하늘')).notifyIn.state === 'sending');
  mode = 'ok';
  await T.evaluate(() => Notify.flush());
  await T.waitForTimeout(400);
  ok('연결되면 다시 보냄 · 한 번만', calls.length === 1 && (await T.evaluate(() => Notify.pending())) === 0 &&
    (await recOf('김하늘')).notifyIn.state === 'sent', String(calls.length));

  // 워커가 거절하면 실패로 남기고 다시 보내지 않음
  await T.evaluate(() => Checkin.reset());
  await T.evaluate(() => {
    var s = Store.students().filter(x => x.name === '김하늘')[0];
    Store.setAttendance(s.id, U.ymd(), { checkInAt: new Date(Date.now() - 60 * 60000).toISOString() });
  });
  mode = 'reject';
  await type('2345');
  await T.click('.ci-name');
  await T.click('[data-act="out"]');
  await T.waitForTimeout(400);
  rec = await recOf('김하늘');
  ok('거절되면 실패와 이유를 남김', rec.notifyOut && rec.notifyOut.state === 'failed' && /템플릿/.test(rec.notifyOut.msg), JSON.stringify(rec.notifyOut));
  ok('거절된 건 다시 보내지 않음', (await T.evaluate(() => Notify.pending())) === 0);
  mode = 'ok';

  // 알림을 끄면 안 보냄
  await A.click('label:has(#n-out)');
  await A.evaluate(() => Sync.push());
  await A.waitForTimeout(500);
  await T.evaluate(() => Sync.pull());
  await T.waitForTimeout(400);
  ok('원장님이 끄면 태블릿도 꺼짐', await T.evaluate(() => Notify.enabled('in') && !Notify.enabled('out')));

  await T.waitForTimeout(1200);

  // ---- 원생관리 출결 화면에 결과 ----
  await A.evaluate(() => Sync.pull());
  await A.waitForTimeout(400);
  await A.goto(ROOT + 'index.html#/attendance', { waitUntil: 'networkidle' });
  await A.waitForTimeout(500);
  await A.click('#sc-all');
  await A.waitForTimeout(200);
  const rowOf = (n) => A.evaluate((n) => {
    var s = Store.students().filter(x => x.name === n)[0];
    var row = document.querySelector('.att-row[data-sid="' + s.id + '"]');
    return row ? row.textContent : '';
  }, n);
  ok('출결 화면에 "카톡 등원 보냄 · 하원 보냄"', /카톡 등원 보냄/.test(await rowOf('이도윤')) && /카톡 하원 보냄/.test(await rowOf('이도윤')), await rowOf('이도윤'));
  ok('실패한 건 "실패"로 보임', /카톡 하원 실패/.test(await rowOf('김하늘')), await rowOf('김하늘'));
  if (SHOT) await A.screenshot({ path: SHOT + '/notify-3-attendance.png' });

  ok('페이지 오류 없음', errs.length === 0, errs.join(' | '));
  await browser.close();
})();
