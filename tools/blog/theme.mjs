/**
 * theme.mjs — 홈페이지(site/index.html)에서 디자인을 그대로 뽑아온다.
 *
 * 블로그용 색·폰트를 따로 만들지 않는다. 홈페이지 파일에서 <style> 전체와
 * 로고를 읽어와 그대로 쓰기 때문에, 홈페이지 디자인을 바꾸면 블로그도 같이 바뀐다.
 */
import { readFile } from 'node:fs/promises';

const HOME = new URL('../../site/index.html', import.meta.url);

export async function loadTheme() {
  const html = await readFile(HOME, 'utf8');

  const style = html.match(/<style>([\s\S]*?)<\/style>/);
  if (!style) throw new Error('site/index.html 에서 <style> 부분을 찾지 못했습니다.');

  const logo = html.match(/<img src="(data:image\/png;base64,[^"]+)"/);
  if (!logo) throw new Error('site/index.html 에서 로고 이미지를 찾지 못했습니다.');

  const fonts = html.match(/<link rel="preconnect"[\s\S]*?rel="stylesheet">/);

  return {
    css: style[1],
    logo: logo[1],
    fonts: fonts ? fonts[0] : '',
  };
}

/** 블로그 화면에만 추가로 필요한 스타일. 홈페이지 토큰(--brand 등)을 그대로 쓴다. */
export const BLOG_CSS = `
  /* ---------- 블로그 공통 ---------- */
  .blog-head { padding: clamp(2.4rem, 5vw, 3.6rem) 0 clamp(1.4rem, 3vw, 2rem); }
  .blog-head h1 { font-size: clamp(1.9rem, 2vw + 1.3rem, 2.6rem); margin-top: 0.6rem; }
  .blog-head p { color: var(--ink-soft); margin: 0.8rem 0 0; max-width: 52ch; }

  .post-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1.1rem; padding-bottom: clamp(3rem, 6vw, 5rem); }
  @media (max-width: 920px) { .post-grid { grid-template-columns: repeat(2, 1fr); } }
  @media (max-width: 620px) { .post-grid { grid-template-columns: 1fr; } }

  .post-card {
    background: var(--surface); border: 1px solid var(--line); border-radius: 14px;
    padding: 1.5rem 1.5rem 1.3rem; display: flex; flex-direction: column; gap: 0.7rem;
    text-decoration: none; color: inherit;
    transition: transform .18s ease, box-shadow .18s ease, border-color .18s ease;
  }
  .post-card:hover { transform: translateY(-3px); box-shadow: 7px 10px 26px -14px var(--shadow); border-color: transparent; }
  .post-card:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
  .post-card h2 { font-size: 1.12rem; line-height: 1.45; font-weight: 700; }
  .post-card .summary { margin: 0; color: var(--ink-soft); font-size: 0.93rem; flex: 1; }
  .post-date { font-family: "Fraunces", serif; font-style: italic; font-size: 0.85rem; color: var(--accent-strong); font-variant-numeric: tabular-nums; }

  .post-tags { display: flex; flex-wrap: wrap; gap: 0.4rem; }
  .post-tag {
    font-size: 0.74rem; font-weight: 700; color: var(--brand);
    background: var(--brand-tint); border-radius: 999px; padding: 0.3em 0.8em;
  }

  /* ---------- 글 본문 ---------- */
  .post-wrap { max-width: 720px; margin: 0 auto; padding-bottom: clamp(3rem, 6vw, 5rem); }
  .post-header { padding: clamp(2.4rem, 5vw, 3.4rem) 0 clamp(1.6rem, 3vw, 2.2rem); border-bottom: 1px solid var(--line); margin-bottom: clamp(1.8rem, 4vw, 2.6rem); }
  .post-header h1 { font-size: clamp(1.8rem, 2vw + 1.2rem, 2.4rem); line-height: 1.35; margin: 0.7rem 0 0; }
  .post-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 0.6rem 1rem; margin-top: 1rem; }

  .post-body { font-size: 1.02rem; line-height: 1.9; color: var(--ink); }
  .post-body > * + * { margin-top: 1.15rem; }
  .post-body h2 { font-size: 1.4rem; margin-top: 2.8rem; padding-top: 0.2rem; }
  .post-body h3 { font-size: 1.13rem; margin-top: 2rem; font-weight: 700; }
  .post-body p { margin: 0; }
  .post-body strong { font-weight: 700; }
  .post-body a { color: var(--brand); text-decoration: none; border-bottom: 1px solid currentColor; }
  .post-body a:hover { color: var(--accent-strong); }
  .post-body ul, .post-body ol { margin: 0; padding-left: 1.3rem; display: flex; flex-direction: column; gap: 0.5rem; }
  .post-body li { padding-left: 0.2rem; }
  .post-body li::marker { color: var(--brand); font-weight: 700; }
  .post-body img { border-radius: 14px; border: 1px solid var(--line); margin-inline: auto; }
  .post-body figure { margin: 0; }
  .post-body figcaption { font-size: 0.82rem; color: var(--ink-faint); text-align: center; margin-top: 0.6rem; }
  .post-body hr { border: 0; border-top: 1px solid var(--line); margin: 2.4rem 0; }

  .post-body blockquote {
    margin: 0; padding: 0.2rem 0 0.2rem 1.2rem; border-left: 3px solid var(--accent);
    color: var(--ink-soft); font-size: 1rem;
  }
  .post-body .callout {
    display: flex; gap: 0.8rem; background: var(--brand-tint); border-radius: 14px;
    padding: 1.1rem 1.2rem; font-size: 0.96rem; line-height: 1.75;
  }
  .post-body .callout .callout-icon { flex: none; font-size: 1.1rem; line-height: 1.6; }
  .post-body .callout > div:last-child > * + * { margin-top: 0.6rem; }

  .post-body code {
    font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
    font-size: 0.88em; background: var(--paper-alt); border: 1px solid var(--line);
    border-radius: 6px; padding: 0.12em 0.4em;
  }
  .post-body pre {
    background: var(--paper-alt); border: 1px solid var(--line); border-radius: 12px;
    padding: 1rem 1.1rem; overflow-x: auto;
  }
  .post-body pre code { background: none; border: 0; padding: 0; font-size: 0.86rem; line-height: 1.7; }

  .post-body details {
    border: 1px solid var(--line); border-radius: 12px; padding: 0.9rem 1.1rem; background: var(--surface);
  }
  .post-body details > summary { cursor: pointer; font-weight: 700; color: var(--brand); }
  .post-body details > summary:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  .post-body details > *:not(summary) { margin-top: 0.9rem; }

  .post-body .todo { display: flex; align-items: flex-start; gap: 0.6rem; }
  .post-body .todo input { margin-top: 0.45rem; accent-color: var(--brand); }
  .post-body .todo.done span { color: var(--ink-faint); text-decoration: line-through; }

  /* ---------- 아래쪽 이동 ---------- */
  .post-foot {
    margin-top: clamp(2.6rem, 5vw, 3.6rem); padding-top: 1.6rem; border-top: 1px solid var(--line);
    display: flex; flex-wrap: wrap; gap: 0.8rem; justify-content: space-between; align-items: center;
  }
  .blog-foot { border-top: 1px solid var(--line); padding: 2rem 0; margin-top: auto; }
  .blog-foot .wrap { display: flex; flex-wrap: wrap; gap: 0.8rem 1.6rem; justify-content: space-between; align-items: center; font-size: 0.84rem; color: var(--ink-faint); }
  .blog-foot a { color: var(--ink-soft); text-decoration: none; }
  .blog-foot a:hover { color: var(--brand); }
  body { display: flex; flex-direction: column; min-height: 100vh; }
  main { flex: 1; }

  /* ---------- 바로가기 (블로그 · 카톡 · 전화) ---------- */
  .quick {
    position: fixed; right: clamp(10px, 1.6vw, 18px); top: 50%; transform: translateY(-50%);
    z-index: 60; display: flex; flex-direction: column; gap: 8px;
  }
  .quick a {
    width: 58px; padding: 8px 4px 6px; border-radius: 16px;
    display: flex; flex-direction: column; align-items: center; gap: 3px;
    background: var(--surface); border: 1px solid var(--line);
    box-shadow: 0 12px 26px -16px var(--shadow);
    text-decoration: none; color: var(--ink-soft);
    transition: transform .16s ease, box-shadow .16s ease;
  }
  .quick a:hover { transform: translateY(-2px); color: var(--brand); }
  .quick a:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  .quick svg { width: 26px; height: 26px; display: block; }
  .quick span { font-size: 10px; font-weight: 700; letter-spacing: -0.02em; }
  @media (max-width: 760px) {
    .quick {
      right: 0; left: 0; top: auto; bottom: 0; transform: none;
      flex-direction: row; gap: 0;
      background: var(--surface); border-top: 1px solid var(--line);
      padding: 6px 4px calc(6px + env(safe-area-inset-bottom, 0px));
    }
    .quick a { flex: 1; width: auto; border: 0; box-shadow: none; border-radius: 10px; background: transparent; padding: 6px 2px; }
    .quick a:hover { transform: none; }
    .quick span { font-size: 11px; }
    body { padding-bottom: 68px; }
  }
`;

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * 블로그 한 페이지의 HTML 뼈대. 홈페이지와 같은 헤더/푸터를 쓴다.
 * depth 0 = site/blog/index.html, depth 1 = site/blog/posts/글.html
 */
export function page({ theme, title, description, body, depth = 0, active = 'blog' }) {
  const base = '../'.repeat(depth + 1);
  const links = [
    ['강점', base + 'index.html#strengths'],
    ['프로그램', base + 'index.html#programs'],
    ['커리큘럼', base + 'index.html#curriculum'],
    ['원장 소개', base + 'index.html#director'],
    ['블로그', base + 'blog/index.html'],
    ['오시는 길', base + 'index.html#contact'],
  ];

  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
${theme.fonts}
<style>${theme.css}${BLOG_CSS}</style>
</head>
<body>

<nav class="nav">
  <div class="nav-inner">
    <a class="brand" href="${base}index.html">
      <img src="${theme.logo}" alt="고래영어 초전캠퍼스">
    </a>
    <ul class="nav-links">
${links.map(([label, href]) =>
  `      <li><a href="${href}"${label === '블로그' && active === 'blog' ? ' class="is-active"' : ''}>${label}</a></li>`
).join('\n')}
    </ul>
    <div class="nav-cta">
      <a class="phone-chip" href="tel:010-3803-8335">010-3803-8335</a>
      <a class="btn btn-solid" href="https://forms.gle/qz8bCWyDeZGTb6p59" target="_blank" rel="noopener">상담 신청</a>
    </div>
  </div>
</nav>

<main>
${body}
</main>

<nav class="quick" aria-label="바로가기">
  <a href="https://blog.naver.com/superstar8335" target="_blank" rel="noopener">
    <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="2" width="20" height="20" rx="6" fill="#03C75A"/><path d="M8 16.6V7.4h3.1l2.7 4.5V7.4h2.2v9.2h-3.1l-2.7-4.5v4.5z" fill="#fff"/></svg>
    <span>블로그</span>
  </a>
  <a href="https://www.instagram.com/whalejinju" target="_blank" rel="noopener">
    <svg viewBox="0 0 24 24" aria-hidden="true"><defs><linearGradient id="ig-blog" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#FEDA75"/><stop offset=".25" stop-color="#FA7E1E"/><stop offset=".5" stop-color="#D62976"/><stop offset=".75" stop-color="#962FBF"/><stop offset="1" stop-color="#4F5BD5"/></linearGradient></defs><rect x="2" y="2" width="20" height="20" rx="6" fill="url(#ig-blog)"/><rect x="6.7" y="6.7" width="10.6" height="10.6" rx="3.4" fill="none" stroke="#fff" stroke-width="1.6"/><circle cx="12" cy="12" r="2.85" fill="none" stroke="#fff" stroke-width="1.6"/><circle cx="16.4" cy="7.7" r="1" fill="#fff"/></svg>
    <span>인스타</span>
  </a>
  <a href="https://pf.kakao.com/_xexaZcn" target="_blank" rel="noopener">
    <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="2" width="20" height="20" rx="6" fill="#FEE500"/><path d="M12 6.1c-3.4 0-6.2 2.2-6.2 4.9 0 1.7 1.1 3.2 2.8 4.1l-.6 2.3c-.1.3.2.5.4.3l2.7-1.8h.9c3.4 0 6.2-2.2 6.2-4.9S15.4 6.1 12 6.1z" fill="#3C1E1E"/></svg>
    <span>카톡</span>
  </a>
  <a href="tel:010-3803-8335">
    <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="2" width="20" height="20" rx="6" fill="#003C70"/><path d="M8.5 6.4h2.1l1.1 2.9-1.4 1a8.3 8.3 0 0 0 3.4 3.4l1-1.4 2.9 1.1v2.2c0 .7-.6 1.3-1.3 1.2A10.3 10.3 0 0 1 7.3 7.7c-.1-.7.5-1.3 1.2-1.3z" fill="#fff"/></svg>
    <span>전화</span>
  </a>
</nav>

<footer class="blog-foot">
  <div class="wrap">
    <span>© ${new Date().getFullYear()} 고래영어 초전캠퍼스 · 경남 진주시 초전동 1639-2</span>
    <span>
      <a href="tel:010-3803-8335">010-3803-8335</a> ·
      <a href="https://pf.kakao.com/_xexaZcn" target="_blank" rel="noopener">카카오톡 채널</a> ·
      <a href="${base}index.html">홈으로</a>
    </span>
  </div>
</footer>

</body>
</html>
`;
}

export { esc };
