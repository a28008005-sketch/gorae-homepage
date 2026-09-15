const { chromium } = require('./playwright');
const BASE = 'http://127.0.0.1:8899/index.html';
const ok = (l,c,e='') => console.log(`  ${c?'✓':'✗ 실패'}  ${l}${e?' — '+e:''}`);
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 1050 } });
  const errs = [];
  p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
  p.on('console', m => { if (m.type() === 'error' && !/fonts.googleapis|font/i.test(m.text())) errs.push('CONSOLE: ' + m.text()); });

  await p.goto(BASE + '#/settings', { waitUntil: 'networkidle' });
  await p.click('#b-sample'); await p.click('#confirm-yes'); await p.waitForTimeout(1800);

  // 레벨 판정
  const lv = await p.evaluate(() => ({
    caterpillar: Worksheet.levelOf(Store.books().find(b=>b.title.includes('Caterpillar'))),
    frog: Worksheet.levelOf(Store.books().find(b=>b.title.includes('Frog and Toad Are'))),
    mth: Worksheet.levelOf(Store.books().find(b=>b.title.includes('Magic Tree House #1'))),
    web: Worksheet.levelOf(Store.books().find(b=>b.title.includes('Charlotte'))),
    nate: Worksheet.levelOf(Store.books().find(b=>b.title.includes('Nate')))
  }));
  ok('AR 기준 레벨 판정', lv.frog===4 && lv.mth===5 && lv.web===5 && lv.nate===3, JSON.stringify(lv));

  // 워크시트 HTML 생성
  const gen = await p.evaluate(() => {
    const bk = Store.books().find(b=>b.title.includes('Frog and Toad Are'));
    const st = Store.students()[0];
    const html = Worksheet.build(bk, st, { date: U.ymd() });
    // 학생 이름 칸(fillfield)을 뺀 나머지에 한글이 없어야 합니다.
    const bodyOnly = html.split('<body>')[1].replace(/<span class="v">[^<]*<\/span>/g, '');
    return { len: html.length, hasSheet: html.includes('class="sheet"'),
             acts: (html.match(/<section class="act"/g)||[]).length,
             hasWords: html.includes('spring'), hasName: html.includes(st.name),
             korean: (bodyOnly.match(/[가-힣]+/g)||[]).join(',') };
  });
  ok('워크시트 생성', gen.hasSheet && gen.len > 12000, gen.len + '자');
  ok('레벨별 활동 5개', gen.acts === 5, gen.acts + '개');
  ok('등록 단어 반영', gen.hasWords);
  ok('학생 이름 채움', gen.hasName);
  ok('워크시트 본문은 영어만', !gen.korean, gen.korean || '한글 없음');

  // 도서 목록에서 워크시트 버튼
  await p.goto(BASE + '#/library', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(700);
  await p.click('#rows tr:first-child [data-ws]'); await p.waitForTimeout(1200);
  ok('워크시트 모달', await p.isVisible('#ws-if'));
  const inner = await p.frameLocator('#ws-if').locator('.sheet').count();
  ok('iframe 안에 A4 시트 렌더', inner === 1);
  await p.screenshot({ path: (process.env.SHOT_DIR || '.') + '/w-modal.png' });
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);

  // 대여하면서 워크시트 자동
  await p.fill('#scan', 'CB-0118');
  await p.press('#scan', 'Enter'); await p.waitForTimeout(500);
  ok('대여창에 워크시트 체크', await p.isChecked('#l-ws'));
  const hint = await p.textContent('.modal-b');
  ok('자동 생성 안내 표시', /자동으로 만듭니다/.test(hint));
  await p.selectOption('#l-stu', { index: 1 });
  await p.click('#l-save'); await p.waitForTimeout(1400);
  ok('대여 직후 워크시트 자동 표시', await p.isVisible('#ws-if'));
  const issued = await p.evaluate(() => {
    const bk = Store.bookByCode('CB-0118');
    const l = Store.openLoanOf(bk.id);
    return l && l.wsIssued;
  });
  ok('대여 기록에 발행 표시', !!issued, String(issued));
  await p.screenshot({ path: (process.env.SHOT_DIR || '.') + '/w-lend.png' });
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);

  // 링크 등록 시 링크 우선
  await p.evaluate(() => {
    const bk = Store.bookByCode('NF-0033');
    Store.saveBook({ id: bk.id, wsUrl: 'https://example.com/sharks.pdf' });
  });
  await p.waitForTimeout(300);
  const [popup] = await Promise.all([
    p.waitForEvent('popup', { timeout: 4000 }).catch(() => null),
    (async () => {
      await p.goto(BASE + '#/library', { waitUntil: 'domcontentloaded' });
      await p.waitForTimeout(600);
      await p.click('tr:has-text("Sharks") [data-ws]');
    })()
  ]);
  ok('등록된 링크는 새 창으로', popup !== null, popup ? popup.url() : '열리지 않음');
  if (popup) await popup.close();

  // 폼에서 미리보기
  await p.goto(BASE + '#/library', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(600);
  await p.click('#rows tr:first-child [data-edit]'); await p.waitForTimeout(500);
  await p.click('#b-wspreview'); await p.waitForTimeout(1000);
  ok('폼에서 미리보기', await p.isVisible('#ws-if'));
  await p.keyboard.press('Escape');

  // 회귀
  for (const r of ['dashboard','students','attendance','homework','vocab','classes','tuition','stats','share','settings']) {
    await p.goto(BASE + '#/' + r, { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(350);
    if ((await p.textContent('#view')).length < 50) errs.push(r + ' 비어 있음');
  }
  console.log('\n에러 ' + errs.length + '건');
  errs.slice(0,8).forEach(e => console.log('   ' + e));
  await b.close();
})();
