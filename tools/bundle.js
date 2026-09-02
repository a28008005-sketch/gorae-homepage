/*
 * 단일 파일 빌드
 *   node tools/bundle.js          -> dist/고래영어-원생관리.html
 *   node tools/bundle.js --demo   -> dist/고래영어-원생관리-미리보기.html (예시 데이터 자동 입력)
 *
 * CSS 와 JS 를 index.html 안에 그대로 넣어 파일 하나로 만듭니다.
 * USB 에 담아 다니거나 메일로 보내 열어보기 좋습니다.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const demo = process.argv.includes('--demo');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

let html = read('index.html');

// <link rel="stylesheet"> -> <style>
html = html.replace(/<link rel="stylesheet" href="([^"]+)">/g, (m, href) =>
  '<style>\n' + read(href) + '\n</style>');

// <script src> -> <script>
html = html.replace(/<script src="([^"]+)"><\/script>/g, (m, src) =>
  '<script>\n' + read(src) + '\n</script>');

// 저장소 안의 문서 링크는 단일 파일에서 열 수 없으므로 GitHub 주소로 바꿉니다.
const REPO = 'https://github.com/a28008005-sketch/gorae-homepage/blob/main';
html = html.replace(/href="docs\/([^"]+)"/g, `href="${REPO}/docs/$1"`);

if (demo) {
  html = html.replace('</body>', `
<script>
/* 미리보기 전용 — 처음 열었을 때 예시 학생과 기록을 넣어 화면을 보여줍니다. */
(function () {
  function seed() {
    if (Store.students().length) return;      // 이미 쓰던 기록이 있으면 건드리지 않습니다
    Views.settings.seedSample();
  }
  function banner() {
    var el = document.getElementById('view');
    if (!el || document.getElementById('demo-strip')) return;
    var d = document.createElement('div');
    d.id = 'demo-strip';
    d.className = 'demo-strip';
    d.innerHTML =
      '<span><b>미리보기</b> · 아래 학생과 기록은 기능을 보여드리기 위한 <b>예시</b>입니다. ' +
      '입력해 보셔도 이 브라우저에만 저장되고 실제 학원 자료에는 영향이 없습니다.</span>' +
      '<button class="x-btn" aria-label="닫기">&times;</button>';
    d.querySelector('button').addEventListener('click', function () { d.remove(); });
    el.parentNode.insertBefore(d, el);
  }
  document.addEventListener('DOMContentLoaded', function () {
    setTimeout(function () { seed(); banner(); if (window.App) App.rerender(); }, 60);
  });
})();
</script>
</body>`);

  html = html.replace('</style>', `
.demo-strip{
  display:flex;align-items:flex-start;gap:12px;
  margin:16px 26px 0;padding:11px 15px;
  background:var(--mint-soft);border:1px solid #a9e5dd;border-radius:11px;
  font-size:12.5px;color:#0d6f64;line-height:1.6;
}
.demo-strip b{color:#0a5b52}
.demo-strip button{margin-left:auto;flex:0 0 auto;color:#0d8375}
@media(max-width:760px){ .demo-strip{margin:12px 14px 0} }
</style>`);
}

fs.mkdirSync(path.join(ROOT, 'dist'), { recursive: true });
const out = demo ? 'dist/고래영어-원생관리-미리보기.html' : 'dist/고래영어-원생관리.html';
fs.writeFileSync(path.join(ROOT, out), html, 'utf8');
console.log(out + '  (' + Math.round(html.length / 1024) + ' KB)');
