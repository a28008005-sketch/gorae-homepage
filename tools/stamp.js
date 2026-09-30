/* 화면 파일 주소에 버전 표시(?v=...)를 붙입니다.
 *
 * 왜 필요한가
 *   브라우저는 같은 주소의 파일을 한동안(GitHub Pages 기준 10분) 다시 받지 않고,
 *   열어 둔 탭은 새로고침해도 예전 파일을 쓰는 일이 있습니다.
 *   그래서 배포해도 "화면이 안 바뀌었다"가 됩니다.
 *   파일 내용이 바뀌면 주소 끝의 ?v= 도 바뀌게 해서, 브라우저가 반드시 새 파일을 받게 합니다.
 *
 * 쓰는 법 — 화면 파일(js·css)을 고친 뒤, 커밋하기 전에 한 번:
 *   node tools/stamp.js
 * 확인만 (바꿀 게 남아 있으면 실패):
 *   node tools/stamp.js --check
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const PAGES = ['index.html', 'checkin.html'];
const check = process.argv.includes('--check');
let stale = 0;

for (const page of PAGES) {
  const file = path.join(ROOT, page);
  const before = fs.readFileSync(file, 'utf8');
  const after = before.replace(/(src|href)="(assets\/[^"?#]+\.(?:js|css))(?:\?v=[^"]*)?"/g, (m, attr, p) => {
    const body = fs.readFileSync(path.join(ROOT, p));
    const v = crypto.createHash('sha1').update(body).digest('hex').slice(0, 8);
    return `${attr}="${p}?v=${v}"`;
  });
  if (after !== before) {
    stale++;
    if (check) console.log('✗ ' + page + ' 의 버전 표시가 오래되었습니다. node tools/stamp.js 를 실행하세요.');
    else { fs.writeFileSync(file, after); console.log('✓ ' + page + ' 버전 표시 갱신'); }
  } else {
    console.log('✓ ' + page + ' 최신');
  }
}
if (check && stale) process.exitCode = 1;
