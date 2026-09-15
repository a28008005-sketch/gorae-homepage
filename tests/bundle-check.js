const { chromium } = require('./playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1400, height: 950 } });
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.goto('file://' + process.cwd() + '/dist/고래영어-원생관리-미리보기.html', { waitUntil: 'networkidle' });
  await p.waitForTimeout(1500);
  console.log('학생 수:', await p.evaluate(() => Store.students().length));
  console.log('Worksheet 정의:', await p.evaluate(() => typeof Worksheet));
  console.log('WORKSHEET_CSS 정의:', await p.evaluate(() => typeof WORKSHEET_CSS));
  console.log('에러:', errs.length ? errs : '없음');
  await b.close();
})();
