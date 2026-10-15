// 단어 학습 '오늘 실시간 현황' — 웨일리 보카 앱이 워커를 거쳐 보낸 진행 기록을 보여 주는지 확인합니다.
// 실행: 저장소 최상위에서 정적 서버(8899)를 띄운 뒤  node tests/vocab-live.test.js
const { chromium } = require('./playwright');
const BASE = 'http://127.0.0.1:8899/index.html';
let fails = 0;
const ok = (l, c, e = '') => { if (!c) fails++; console.log(`  ${c ? '✓' : '✗ 실패'}  ${l}${e ? ' — ' + e : ''}`); };
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 1050 } });
  await p.addInitScript(() => { window.GORAE_LOCAL_ONLY = true; });
  const errs = [];
  p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));

  await p.goto(BASE + '#/settings', { waitUntil: 'networkidle' });
  await p.click('#b-sample'); await p.click('#confirm-yes'); await p.waitForTimeout(1800);

  await p.goto(BASE + '#/vocab', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(600);
  ok('기록이 없으면 안내 문구', /오늘 단어 공부를 시작한 학생이 아직 없습니다/.test(await p.innerText('#view, body')));

  // 워커가 클라우드에 넣는 모양 그대로, 동기화로 받아온 것처럼 넣는다.
  const names = await p.evaluate(() => {
    const st = Store.students({ active: true }).slice(0, 4);
    const now = Date.now(), today = U.ymd();
    const row = (s, i, data, minAgo) => ({ kind: 'vocab', id: 'voc-whaley-' + s.id + '-L-' + i, deleted: false,
      updatedAt: new Date(now - minAgo * 60000).toISOString(),
      data: Object.assign({ id: 'voc-whaley-' + s.id + '-L-' + i, studentId: s.id, date: today, source: 'whaley-voca',
        sessionId: 'whaley-' + s.id + '-L-' + i }, data) });
    Store.applyRemote([
      row(st[0], 3, { setName: 'Phonics Whale Vol.1 Unit1 Day3 · 학습 중 · STEP 2 랜덤 복습', status: 'in-progress', step: 'STEP 2 랜덤 복습', total: 35, correct: 30, durationSec: 420, wrongLeft: 5 }, 0),
      row(st[1], 2, { setName: 'Phonics Whale Vol.1 Unit1 Day2 · 완료 · 오늘 정답률 85% (남은 오답 3개)', status: 'done', total: 48, correct: 40, durationSec: 900, clearPct: 85, wrongLeft: 3 }, 5),
      row(st[2], 1, { setName: 'Space Whale 860 Day1 · 중간에 멈춤 · STEP 1 오늘의 진도', status: 'stopped', step: 'STEP 1 오늘의 진도', total: 10, correct: 7, durationSec: 120, wrongLeft: 3 }, 2),
      row(st[3], 5, { setName: 'Space Whale 860 Day5 · 학습 중 · STEP 1 오늘의 진도', status: 'in-progress', step: 'STEP 1 오늘의 진도', total: 5, correct: 5, durationSec: 60, wrongLeft: 0 }, 25),
    ]);
    App.rerender();
    return st.map(s => s.name);
  });
  await p.waitForTimeout(500);
  const card = await p.locator('.card', { hasText: '오늘 실시간 현황' }).first();
  const text = (await card.innerText()).replace(/\s+/g, ' ');
  ok('현황 카드 요약', /학습 중 1 · 완료 1 · 멈춤 2/.test(text), text.slice(0, 80));
  const rowText = async n => (await card.locator('tr', { hasText: n }).innerText()).replace(/\s+/g, ' ');
  const r0 = await rowText(names[0]); ok('학습 중 학생: 단계·맞힘·방금', /학습 중/.test(r0) && /STEP 2 랜덤 복습/.test(r0) && /30\/35/.test(r0) && /방금/.test(r0), r0);
  const r1 = await rowText(names[1]); ok('완료 학생: 오늘 정답률·남은 오답', /완료/.test(r1) && /85%/.test(r1) && /3개/.test(r1) && /오늘 학습 끝/.test(r1), r1);
  const r2 = await rowText(names[2]); ok('중간에 멈춘 학생', /중간에 멈춤/.test(r2), r2);
  const r3 = await rowText(names[3]); ok('25분째 소식 없는 학생은 응답 없음', /응답 없음/.test(r3) && /25분 전/.test(r3), r3);
  ok('맨 위가 가장 최근 소식', (await card.locator('tbody tr').first().innerText()).includes(names[0]));
  const det = (await p.locator('tr[data-open]', { hasText: names[1] }).last().innerText()).replace(/\s+/g, ' ');
  const todayShort = await p.evaluate(() => U.shortDate(U.ymd()));
  ok('학생별 상세에도 반영 (마지막 학습이 오늘)', det.includes(todayShort), det);

  // 같은 줄이 '완료'로 바뀌면 화면도 바뀐다 (덮어쓰기)
  await p.evaluate(() => {
    const v = Store.vocabLogs().find(x => x.status === 'in-progress' && x.step === 'STEP 2 랜덤 복습');
    Store.applyRemote([{ kind: 'vocab', id: v.id, deleted: false, updatedAt: new Date().toISOString(),
      data: Object.assign({}, v, { status: 'done', setName: 'X · 완료', total: 48, correct: 44, clearPct: 92, wrongLeft: 0 }) }]);
    App.rerender();
  });
  await p.waitForTimeout(400);
  const r0b = await rowText(names[0]); ok('학습 중 → 완료로 바뀜', /완료/.test(r0b) && /92%/.test(r0b), r0b);
  ok('기록 수는 그대로 (줄이 늘지 않음)', (await p.evaluate(() => Store.vocabLogs().filter(v => v.source === 'whaley-voca').length)) === 4);

  if (process.env.SHOT_DIR) await p.screenshot({ path: process.env.SHOT_DIR + '/vocab-live.png', fullPage: true });
  ok('화면 오류 없음', errs.length === 0, errs.join(' | '));
  await b.close();
  process.exit(fails ? 1 : 0);
})();
