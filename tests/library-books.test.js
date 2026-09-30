/**
 * 도서 등록 확인 — ISBN 바코드 등록 · 도서 정보 자동 조회 · 청구기호 자동 생성 · CSV 일괄 등록 · 라벨
 *
 *   npx http-server -p 8899 -s .      (저장소 최상위에서)
 *   node tests/library-books.test.js
 *
 * 바깥 도서 API(구글 도서 · 오픈 라이브러리 · 워커 /api/book)는 가짜 답으로 바꿔 둡니다.
 * 실제 네이버·알라딘·구글과 주고받는 부분은 이 스크립트로 검증되지 않습니다.
 */
const { chromium } = require('./playwright');
const { execSync } = require('child_process');
const BASE = 'http://127.0.0.1:8899/index.html';
const SHOT = process.env.SHOT_DIR || '.';
const results = [];
const ok = (l, c, e = '') => { results.push(!!c); console.log(`  ${c ? '✓' : '✗ 실패'}  ${l}${e ? ' — ' + e : ''}`); };

// 가짜 도서 정보
const DB = {
  '9780064440202': { title: 'Frog and Toad Are Friends', authors: ['Arnold Lobel'], publisher: 'HarperCollins', publishedDate: '1979-03-05' },
  '9780679824114': { title: 'Dinosaurs Before Dark', authors: ['Mary Pope Osborne'], publisher: 'Random House', publishedDate: '1992' },
  '9780545349277': null   // 구글에 없고 오픈 라이브러리에만 있음
};
const OL = {
  '9780545349277': { title: 'Clifford the Big Red Dog', authors: [{ name: 'Norman Bridwell' }], publishers: [{ name: 'Scholastic' }], publish_date: 'May 2010', cover: { medium: 'http://covers.example/c.jpg' } }
};
const COVER = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="60" height="90"><rect width="60" height="90" fill="#3b7a70"/></svg>');

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 1050 } });
  await p.addInitScript(() => { window.GORAE_LOCAL_ONLY = true; });
  const errs = [];
  p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
  p.on('console', m => { if (m.type() === 'error' && !/ERR_CERT|Failed to load resource/.test(m.text())) errs.push('CONSOLE: ' + m.text()); });

  const calls = [];
  await p.route('**/api/book?**', r => { calls.push('worker'); r.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"no key"}' }); });
  await p.route('https://www.googleapis.com/**', r => {
    const isbn = (r.request().url().match(/isbn:(\d+)/) || [])[1];
    calls.push('google:' + isbn);
    const v = DB[isbn];
    r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify(v ? { totalItems: 1, items: [{ volumeInfo: Object.assign({ imageLinks: { thumbnail: COVER } }, v) }] } : { totalItems: 0 }) });
  });
  await p.route('https://openlibrary.org/**', r => {
    const isbn = (r.request().url().match(/ISBN:(\d+)/) || [])[1];
    calls.push('ol:' + isbn);
    const v = OL[isbn];
    r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify(v ? { ['ISBN:' + isbn]: v } : {}) });
  });
  await p.route('http://covers.example/**', r => r.fulfill({ status: 404 }));
  await p.route('https://covers.example/**', r => r.fulfill({ status: 404 }));

  await p.goto(BASE + '#/settings', { waitUntil: 'networkidle' });
  await p.click('#b-sample'); await p.click('#confirm-yes'); await p.waitForTimeout(1500);

  /* ---------- 도구 ---------- */
  const unit = await p.evaluate(() => ({
    i10: Books.normIsbn('0-06-444020-6'),
    i13: Books.normIsbn('978-0-06-444020-2'),
    bad: Books.normIsbn('9780064440203'),
    addon: Books.normIsbn('978006444020251299'),
    ime: Books.fixIme('ㅣㅍ3-ㄲㅇ-001'),
    ime2: Books.fixIme('ㅣㅍ3-ㅊㅠ-012'),
    tsv: Books.parseTable('제목\t지은이\n"A, B"\tX\n'),
    csv: Books.parseTable('제목,지은이\n"Frog, ""Toad"""  ,Lobel\r\n\r\nC,D'),
    code: Books.nextCode({ level: 'AR 2.5', category: '리더스' }),
    bar: Books.code128('Lv3-RD-001').length,
    barKo: Books.code128('한글')
  }));
  ok('ISBN-10 을 13자리로', unit.i10 === '9780064440202', unit.i10);
  ok('하이픈 섞인 ISBN-13', unit.i13 === '9780064440202');
  ok('검증 숫자가 틀리면 거부', unit.bad === '');
  ok('가격 부가기호가 붙어도 앞 13자리', unit.addon === '9780064440202', unit.addon);
  ok('한글 입력 상태로 찍힌 청구기호 되돌리기', unit.ime.toLowerCase() === 'lv3-rd-001' && unit.ime2.toLowerCase() === 'lv3-cb-012', unit.ime + ' / ' + unit.ime2);
  ok('엑셀 붙여넣기(탭) 읽기', unit.tsv[1][0] === 'A, B' && unit.tsv[1][1] === 'X');
  ok('따옴표 CSV 읽기', unit.csv.length === 3 && unit.csv[1][0].startsWith('Frog, "Toad"'), JSON.stringify(unit.csv));
  ok('청구기호 규칙 Lv레벨-분류-번호', /^Lv\d-RD-\d{3}$/.test(unit.code), unit.code);
  ok('라벨 바코드 생성', unit.bar > 50 && unit.barKo === '');

  /* ---------- 바코드로 등록 ---------- */
  await p.goto(BASE + '#/library', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(600);
  const before = await p.evaluate(() => Store.books().length);
  await p.click('#scanadd'); await p.waitForTimeout(300);
  ok('바코드 등록 창 · 입력칸에 바로 커서', await p.evaluate(() => document.activeElement && document.activeElement.id === 'sc-isbn'));
  await p.selectOption('#sc-cat', '리더스');
  await p.fill('#sc-level', 'AR 2.9');
  await p.fill('#sc-series', 'Frog and Toad');
  await p.focus('#sc-isbn');
  await p.keyboard.type('9780064440202'); await p.keyboard.press('Enter');
  await p.waitForSelector('#sc-save', { timeout: 5000 });
  ok('ISBN 으로 제목 자동 입력', (await p.inputValue('#sc-title')) === 'Frog and Toad Are Friends');
  ok('워커 → 구글 순서로 조회', calls.indexOf('worker') >= 0 && calls.indexOf('google:9780064440202') > calls.indexOf('worker'), calls.join(','));
  await p.screenshot({ path: SHOT + '/lb-scan-card.png' });
  await p.keyboard.press('Enter');     // 등록 버튼에 초점이 있어 Enter 로 등록
  await p.waitForTimeout(300);
  let reg = await p.evaluate(() => Store.booksByIsbn('9780064440202'));
  ok('Enter 로 등록', reg.length === 1 && reg[0].author === 'Arnold Lobel' && reg[0].publisher === 'HarperCollins', JSON.stringify(reg[0] && reg[0].code));
  ok('청구기호 자동 부여', /^Lv\d-RD-\d{3}$/.test(reg[0].code), reg[0].code);
  ok('공통 정보(레벨·분류·시리즈) 반영', reg[0].level === 'AR 2.9' && reg[0].category === '리더스' && reg[0].series === 'Frog and Toad');
  ok('표지 주소 저장', !!reg[0].cover);
  ok('등록 뒤 다시 입력칸으로', await p.evaluate(() => document.activeElement.id === 'sc-isbn'));

  // 연속 등록 켜고 같은 책 한 권 더
  await p.click('label:has(#sc-auto)');
  await p.keyboard.type('9780064440202'); await p.keyboard.press('Enter');
  await p.waitForTimeout(800);
  reg = await p.evaluate(() => Store.booksByIsbn('9780064440202').map(b => b.code).sort());
  ok('연속 등록: 확인 없이 바로 · 번호 이어서', reg.length === 2 && reg[0] !== reg[1], reg.join(', '));

  // 오픈 라이브러리에만 있는 책
  await p.selectOption('#sc-cat', '그림책');
  await p.keyboard.type('9780545349277'); await p.keyboard.press('Enter');
  await p.waitForTimeout(800);
  const cl = await p.evaluate(() => Store.booksByIsbn('9780545349277')[0]);
  ok('구글에 없으면 오픈 라이브러리', cl && cl.title === 'Clifford the Big Red Dog' && cl.pubDate === '2010', cl && cl.pubDate);
  ok('분류가 바뀌면 청구기호 분류도', cl && /-PB-001$/.test(cl.code), cl && cl.code);

  // 어디에도 없는 책 → 제목 직접 입력
  await p.click('label:has(#sc-auto)');
  await p.focus('#sc-isbn');
  await p.keyboard.type('9791162245491'); await p.keyboard.press('Enter');
  await p.waitForSelector('#sc-title', { timeout: 5000 }); await p.waitForTimeout(200);
  ok('못 찾으면 제목 칸으로 커서', await p.evaluate(() => document.activeElement.id === 'sc-title'));
  await p.keyboard.type('우리 학원 자체 교재'); await p.keyboard.press('Enter'); await p.waitForTimeout(300);
  ok('직접 입력한 제목으로 등록', await p.evaluate(() => Store.booksByIsbn('9791162245491').length === 1));

  // 잘못된 번호
  await p.keyboard.type('12345'); await p.keyboard.press('Enter'); await p.waitForTimeout(200);
  ok('ISBN 이 아니면 안내', (await p.textContent('#sc-card')).includes('ISBN 이 아닙니다'));
  await p.screenshot({ path: SHOT + '/lb-scan-done.png' });

  // 방금 등록한 책 라벨
  await p.click('#sc-labels'); await p.waitForTimeout(700);
  const lab = await p.evaluate(() => {
    const d = document.querySelector('#lb-if').contentDocument;
    return { cells: d.querySelectorAll('.cell').length, svgs: d.querySelectorAll('svg.bc').length, info: document.querySelector('#lb-info').textContent };
  });
  ok('라벨 미리보기: 등록한 4권 · 바코드 포함', lab.svgs === 4, JSON.stringify(lab));
  await p.fill('#lb-skip', '5'); await p.waitForTimeout(300);
  const lab2 = await p.evaluate(() => document.querySelector('#lb-if').contentDocument.querySelectorAll('.cell').length);
  ok('이미 쓴 칸 건너뛰기', lab2 === 9, String(lab2));
  await p.screenshot({ path: SHOT + '/lb-labels.png' });
  await p.keyboard.press('Escape'); await p.click('.modal-wrap [data-close]').catch(() => {}); await p.waitForTimeout(400);

  const after = await p.evaluate(() => Store.books().length);
  ok('모두 4권 늘어남', after === before + 4, before + ' → ' + after);

  /* ---------- 대여·반납 칸에서 ISBN · 한글 상태 청구기호 ---------- */
  await p.goto(BASE + '#/library', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(500);
  await p.fill('#scan', '9780064440202'); await p.press('#scan', 'Enter'); await p.waitForTimeout(300);
  ok('같은 ISBN 2권이면 고르는 창', (await p.locator('[data-pick]').count()) === 2);
  await p.click('.modal-wrap [data-close]'); await p.waitForTimeout(200);
  const cc = await p.evaluate(() => Store.booksByIsbn('9780545349277')[0].code);   // 예: Lv2-PB-001
  const typedKo = cc.replace(/[A-Za-z]/g, ch => ({ l:'ㅣ', v:'ㅍ', p:'ㅔ', b:'ㅠ', r:'ㄱ', d:'ㅇ', c:'ㅊ', n:'ㅜ', f:'ㄹ', w:'ㅈ', e:'ㄷ', t:'ㅅ' })[ch.toLowerCase()] || ch);
  await p.fill('#scan', typedKo); await p.press('#scan', 'Enter'); await p.waitForTimeout(300);
  ok('한글 입력 상태로 찍혀도 대여 창', await p.isVisible('#l-stu'), cc + ' ← ' + typedKo);
  await p.click('.modal-wrap [data-close]'); await p.waitForTimeout(200);
  await p.fill('#scan', '9780141365466'); await p.press('#scan', 'Enter'); await p.waitForTimeout(300);
  ok('등록 안 된 ISBN 은 바로 등록 제안', (await p.textContent('.modal-wrap')).includes('아직 등록되지 않았습니다'));
  await p.click('.modal-wrap [data-close]'); await p.waitForTimeout(200);

  /* ---------- 도서 직접 등록 폼에서 ISBN 조회 ---------- */
  await p.click('#add'); await p.waitForTimeout(300);
  await p.fill('#b-isbn', '978-0-679-82411-4'); await p.press('#b-isbn', 'Enter');
  await p.waitForFunction(() => document.querySelector('#b-title').value !== '', null, { timeout: 5000 });
  ok('등록 폼: ISBN 조회로 칸 채움', (await p.inputValue('#b-title')) === 'Dinosaurs Before Dark' && (await p.inputValue('#b-pub')) === 'Random House');
  await p.selectOption('#b-cat', '챕터북');
  await p.click('#b-autocode');
  const autoc = await p.inputValue('#b-code');
  ok('자동 생성 버튼', /^Lv\d-CB-\d{3}$/.test(autoc), autoc);
  await p.screenshot({ path: SHOT + '/lb-form.png' });
  await p.click('#b-save'); await p.waitForTimeout(300);
  ok('등록 폼 저장', await p.evaluate(c => { const b = Store.bookByCode(c); return b && b.isbn === '9780679824114'; }, autoc));

  /* ---------- CSV · 엑셀 붙여넣기 일괄 등록 ---------- */
  await p.click('#bulk'); await p.waitForTimeout(300);
  const existing = await p.evaluate(() => Store.books().filter(b => b.code)[0].code);
  const tsv = ['ISBN\t제목\t레벨\t분류\t청구기호',
    '9780064440202\t\tAR 2.9\t리더스\t',
    '\tMy Own Book\t\tRD\t',
    '9.78068E+12\t\t\t챕터북\t',
    '\tDup Book\t\t리더스\t' + existing].join('\n');
  await p.fill('#bk-text', tsv); await p.waitForTimeout(300);
  const pv = await p.textContent('#bk-preview');
  ok('미리보기: 조회 후 등록 표시', pv.includes('조회 후 등록'));
  ok('미리보기: 엑셀이 바꾼 ISBN 경고', pv.includes('9.78E+12'));
  ok('미리보기: 청구기호 중복 건너뜀', pv.includes('중복'));
  ok('등록 버튼 권수', (await p.textContent('#bk-apply')).includes('2권'), await p.textContent('#bk-apply'));
  await p.screenshot({ path: SHOT + '/lb-bulk.png' });
  const nb = await p.evaluate(() => Store.books().length);
  await p.click('#bk-apply'); await p.waitForTimeout(1200);
  const bulk = await p.evaluate(() => Store.books().filter(b => b.title === 'My Own Book' || (b.isbn === '9780064440202' && b.level === 'AR 2.9' && !b.series)));
  ok('일괄 등록: ISBN만 있던 줄도 제목 채워 등록', (await p.evaluate(() => Store.books().length)) === nb + 2 && bulk.length === 2, JSON.stringify(bulk.map(b => [b.title, b.code])));
  ok('일괄 등록: RD → 리더스, 청구기호 자동', bulk.every(b => b.category === '리더스' && /^Lv\d-RD-\d{3}$/.test(b.code)));
  const codes = await p.evaluate(() => Store.books().map(b => b.code).filter(Boolean));
  ok('청구기호가 겹치지 않음', new Set(codes.map(c => c.toLowerCase())).size === codes.length);

  // 엑셀 기본 CSV (EUC-KR) 파일
  const eucKr = execSync(`python3 -c "import sys; sys.stdout.buffer.write('제목,지은이,분류\\n한글 제목 책,홍길동,그림책\\n'.encode('cp949'))"`);
  await p.click('#bulk'); await p.waitForTimeout(300);
  await p.setInputFiles('#bk-fileinput', { name: 'books.csv', mimeType: 'text/csv', buffer: eucKr });
  await p.waitForTimeout(500);
  ok('엑셀 CSV(EUC-KR) 한글이 깨지지 않음', (await p.textContent('#bk-preview')).includes('한글 제목 책'));
  await p.click('#bk-apply'); await p.waitForTimeout(500);

  // 양식 파일이 다시 읽히는지
  const tpl = await p.evaluate(() => Books.parseBooks(U.toCsv(Books.templateRows())).rows.map(r => r.isbn || r.code));
  ok('양식 파일: ISBN 이 글자로 들어가 다시 읽힘', tpl[0] === '9780064440202' && tpl[1] === '9780679824114', JSON.stringify(tpl));

  await p.goto(BASE + '#/library', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(600);
  await p.screenshot({ path: SHOT + '/lb-list.png', fullPage: true });

  // 좁은 화면
  await p.setViewportSize({ width: 390, height: 844 });
  await p.click('#scanadd'); await p.waitForTimeout(300);
  await p.keyboard.type('9780064440202'); await p.keyboard.press('Enter'); await p.waitForTimeout(800);
  await p.screenshot({ path: SHOT + '/lb-mobile.png' });
  const overflow = await p.evaluate(() => document.querySelector('.modal').scrollWidth > document.querySelector('.modal').clientWidth + 2);
  ok('휴대폰 폭에서 가로로 넘치지 않음', !overflow);

  ok('화면 오류 없음', errs.length === 0, errs.slice(0, 3).join(' | '));
  await b.close();
  const fail = results.filter(x => !x).length;
  console.log('\n통과 ' + (results.length - fail) + '건 · 실패 ' + fail + '건');
  process.exit(fail ? 1 : 0);
})();
