const { chromium } = require('./playwright');
const BASE = 'http://127.0.0.1:8899/index.html';
const ok = (l,c,e='') => console.log(`  ${c?'✓':'✗ 실패'}  ${l}${e?' — '+e:''}`);
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 1050 } });
  const errs = [];
  p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE: ' + m.text()); });

  await p.goto(BASE + '#/settings', { waitUntil: 'networkidle' });
  await p.click('#b-sample'); await p.click('#confirm-yes'); await p.waitForTimeout(1800);

  // 숙제
  await p.goto(BASE + '#/homework', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(600);
  ok('숙제 카드 표시', (await p.locator('.hw-card').count()) === 2, (await p.locator('.hw-card').count()) + '건');
  await p.click('.hw-card:first-child [data-check]'); await p.waitForTimeout(400);
  ok('제출 체크 모달', await p.isVisible('.sub-row'));
  await p.click('#sc-all'); await p.waitForTimeout(500);
  const rate = await p.evaluate(() => {
    const h = Store.homeworks({open:true})[0];
    return Store.homeworkProgress(h.id).rate;
  });
  ok('전원 제출 처리', rate === 100, rate + '%');
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);
  await p.screenshot({ path: (process.env.SHOT_DIR || '.') + '/h-homework.png', fullPage: true });

  // 단어 학습
  await p.goto(BASE + '#/vocab', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(700);
  const logs = await p.evaluate(() => Store.vocabLogs().length);
  ok('예시 단어학습 기록', logs > 20, logs + '건');
  const codes = await p.evaluate(() => Store.students().filter(s=>s.code).length);
  ok('학생 코드 발급', codes === 8, codes + '명');
  await p.screenshot({ path: (process.env.SHOT_DIR || '.') + '/h-vocab.png', fullPage: true });

  // CSV 가져오기
  await p.click('#imp'); await p.waitForTimeout(400);
  const code = await p.evaluate(() => Store.students()[0].code);
  await p.fill('#v-text', `학생코드,날짜,단어장,총문항,정답,학습시간\n${code},2026-09-02,Unit 9 테스트,25,23,300\nZZZZ,2026-09-02,없는학생,10,5,60`);
  await p.waitForTimeout(500);
  ok('미리보기 · 못 찾은 학생 구분', (await p.textContent('#v-preview')).includes('ZZZZ'));
  await p.click('#v-apply'); await p.waitForTimeout(600);
  const added = await p.evaluate(() => Store.vocabLogs().some(v => v.setName === 'Unit 9 테스트'));
  ok('CSV 가져오기 저장', added);

  // 중복 방지 (같은 sessionId 두 번)
  const before = await p.evaluate(() => Store.vocabLogs().length);
  await p.evaluate(() => {
    const s = Store.students()[0];
    Store.saveVocabLog({ studentId: s.id, date: U.ymd(), setName: '중복테스트', total: 10, correct: 9, sessionId: 'dup-1' });
    Store.saveVocabLog({ studentId: s.id, date: U.ymd(), setName: '중복테스트', total: 10, correct: 10, sessionId: 'dup-1' });
  });
  const after = await p.evaluate(() => Store.vocabLogs().length);
  ok('같은 세션은 한 건으로', after === before + 1, before + ' → ' + after);

  // 링크로 받기
  const link = await p.evaluate(() => {
    const s = Store.students()[1];
    const payload = { type:'gorae-vocab', version:1, sessions:[
      { studentCode: s.code, date: U.ymd(), setName: '링크 전송 테스트', total: 15, correct: 14, sessionId: 'link-1' }
    ]};
    return location.href.split('#')[0] + '#/import?d=' + U.encodeData(payload);
  });
  await p.goto(link, { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(800);
  ok('링크 수신 화면', await p.isVisible('.modal'));
  await p.click('#v-apply'); await p.waitForTimeout(600);
  ok('링크로 받은 기록 저장', await p.evaluate(() => Store.vocabLogs().some(v => v.sessionId === 'link-1')));

  // 도서 대여
  await p.goto(BASE + '#/library', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(700);
  const books = await p.evaluate(() => Store.books().length);
  ok('예시 도서 등록', books === 8, books + '권');
  ok('연체 카드 표시', (await p.textContent('#view')).includes('연체'));
  await p.screenshot({ path: (process.env.SHOT_DIR || '.') + '/h-library.png', fullPage: true });

  // 청구기호 빠른 대여
  await p.fill('#scan', 'RD-0413');
  await p.press('#scan', 'Enter'); await p.waitForTimeout(500);
  ok('청구기호로 대여 모달', await p.isVisible('#l-stu'));
  await p.selectOption('#l-stu', { index: 1 });
  await p.click('#l-save'); await p.waitForTimeout(600);
  ok('대여 처리', await p.evaluate(() => {
    const bk = Store.bookByCode('RD-0413');
    return !!Store.openLoanOf(bk.id);
  }));

  // 같은 책 다시 스캔 -> 반납
  await p.fill('#scan', 'RD-0413');
  await p.press('#scan', 'Enter'); await p.waitForTimeout(500);
  await p.click('#confirm-yes'); await p.waitForTimeout(600);
  ok('같은 책 재스캔 시 반납', await p.evaluate(() => {
    const bk = Store.bookByCode('RD-0413');
    return !Store.openLoanOf(bk.id);
  }));

  // 대시보드 · 학생 상세
  await p.goto(BASE + '#/dashboard', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(600);
  const dash = await p.textContent('#view');
  ok('대시보드에 숙제·도서 카드', dash.includes('숙제 현황') && dash.includes('도서 반납'));
  await p.screenshot({ path: (process.env.SHOT_DIR || '.') + '/h-dashboard.png', fullPage: true });

  await p.goto(BASE + '#/students', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(500);
  await p.click('#rows tr:first-child'); await p.waitForTimeout(500);
  const detail = await p.textContent('.modal-b');
  ok('학생 상세에 단어·숙제·도서', detail.includes('단어 학습 · 숙제 · 도서'));
  await p.screenshot({ path: (process.env.SHOT_DIR || '.') + '/h-student.png' });
  await p.keyboard.press('Escape');

  // 회귀
  for (const r of ['attendance','classes','tuition','stats','share','settings']) {
    await p.goto(BASE + '#/' + r, { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(400);
    if ((await p.textContent('#view')).length < 50) errs.push(r + ' 비어 있음');
  }
  console.log('\n에러 ' + errs.length + '건');
  errs.slice(0,8).forEach(e => console.log('   ' + e));
  await b.close();
})();
