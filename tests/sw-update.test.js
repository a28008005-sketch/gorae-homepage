// 서비스워커·버전 표시: 배포한 새 파일이 바로 반영되는지, 인터넷이 끊겨도 열리는지
// 실행: node tests/hwvideo-server.mjs &  →  node tests/sw-update.test.js
// (테스트 서버는 GitHub Pages 처럼 10분 캐시 머리글을 붙여 보냅니다.)
var chromium = require('./playwright.js').chromium;
var fs = require('fs');
var path = require('path');
var execSync = require('child_process').execSync;
var ROOT = path.join(__dirname, '..');
var F = path.join(ROOT, 'assets/js/views/resources.js');
var B = 'http://localhost:8899';

function stamp() { execSync('node tools/stamp.js', { cwd: ROOT }); }

(async function () {
  var ok = function (c, m) { console.log((c ? '✓ ' : '✗ ') + m); if (!c) process.exitCode = 1; };
  var orig = fs.readFileSync(F, 'utf8');
  var origIndex = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  var origCheckin = fs.readFileSync(path.join(ROOT, 'checkin.html'), 'utf8');
  var b = await chromium.launch(); var ctx = await b.newContext();
  var errs = [];
  await ctx.addCookies([{ name: 'gorae_staff', value: 'ok', url: B }]);

  // 처음 방문 → 서비스워커가 붙음
  var first = await ctx.newPage();
  await first.goto(B + '/index.html'); await first.waitForTimeout(1500); await first.close();

  // 평소처럼 학원 화면을 열어 둔 탭
  var p = await ctx.newPage(); p.on('pageerror', function (e) { errs.push(String(e)); });
  await p.goto(B + '/index.html#/resources'); await p.waitForTimeout(1500);
  ok(await p.evaluate(function () { return !!navigator.serviceWorker.controller; }), '서비스워커 동작 중');
  ok((await p.$$('.daily-row')).length === 6, '데일리 시트지 칸 보임');

  try {
    // "배포": 파일을 고치고 버전 표시를 갱신
    fs.writeFileSync(F, orig.replace("return '학원자료실';", "return '학원자료실NEW';"));
    stamp();
    await p.reload(); await p.waitForTimeout(1500);
    ok(await p.evaluate(function () { return Views.resources.title(); }) === '학원자료실NEW', '열어 둔 탭: 새로고침 한 번에 새 화면');
    var q = await ctx.newPage(); q.on('pageerror', function (e) { errs.push(String(e)); });
    await q.goto(B + '/index.html#/resources'); await q.waitForTimeout(1500);
    ok(await q.evaluate(function () { return Views.resources.title(); }) === '학원자료실NEW', '새 탭: 바로 새 화면');
    await q.close();
  } finally {
    fs.writeFileSync(F, orig);
    fs.writeFileSync(path.join(ROOT, 'index.html'), origIndex);
    fs.writeFileSync(path.join(ROOT, 'checkin.html'), origCheckin);
  }

  // 큰 파일(/hw…)은 기기 보관함에 쌓지 않음
  var r = await p.evaluate(async function () {
    await fetch('/hw/admin/api/token');
    var names = await caches.keys(); var n = 0;
    for (var i = 0; i < names.length; i++) {
      var keys = await (await caches.open(names[i])).keys();
      n += keys.filter(function (k) { return /^\/hw(\/|$)/.test(new URL(k.url).pathname); }).length;
    }
    return { names: names, hw: n };
  });
  ok(r.hw === 0, '숙제 영상·자료 파일은 보관함에 쌓지 않음');
  ok(r.names.length === 1 && r.names[0] === 'gorae-staff-v3', '보관함 하나만 유지 (' + r.names.join(',') + ')');

  await ctx.setOffline(true); await p.reload().catch(function () {}); await p.waitForTimeout(1200);
  ok((await p.$$('.daily-row')).length === 6, '인터넷이 끊겨도 화면 열림');
  ok(!errs.length, '오류 없음 ' + errs.join('|'));
  await b.close();
})();
