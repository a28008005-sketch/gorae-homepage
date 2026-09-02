/**
 * build.mjs — 블로그 화면을 만든다.
 *
 *   node tools/blog/build.mjs
 *
 * 노션 열쇠가 준비되어 있으면 노션에서 글을 읽어오고,
 * 없으면 예시 글(sample.json)로 화면을 만들어 미리 볼 수 있게 한다.
 */
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { loadTheme, page, esc } from './theme.mjs';
import { fetchPosts, NotionError } from './notion.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const OUT = join(ROOT, 'site', 'blog');
const POSTS_DIR = join(OUT, 'posts');
const IMAGES_DIR = join(OUT, 'images');

const BLOG_TITLE = '고래영어 이야기';
const BLOG_LEDE = '수업에서 있었던 일, 학부모님께 드리는 안내, 아이의 영어 공부에 도움이 될 이야기를 남깁니다.';

/* ---------- 설정 읽기 ---------- */

async function loadEnv() {
  // tools/blog/.env.local 파일이 있으면 거기서 읽는다 (git에 올라가지 않음)
  try {
    const text = await readFile(join(HERE, '.env.local'), 'utf8');
    for (const line of text.split('\n')) {
      const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
      if (m && !process.env[m[1]]) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
      }
    }
  } catch { /* 파일이 없으면 그냥 넘어간다 */ }

  return {
    token: process.env.NOTION_TOKEN || '',
    databaseId: (process.env.NOTION_DATABASE_ID || '').replace(/-/g, ''),
  };
}

/* ---------- 화면 만들기 ---------- */

const fmtDate = (d) => {
  if (!d) return '';
  const m = String(d).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}. ${m[2]}. ${m[3]}.` : String(d);
};

function listPage(theme, posts) {
  const cards = posts.length
    ? posts.map((p) => `
      <a class="post-card" href="posts/${encodeURIComponent(p.slug)}.html">
        <span class="post-date">${esc(fmtDate(p.date))}</span>
        <h2>${esc(p.title)}</h2>
        <p class="summary">${esc(p.summary)}</p>
        ${p.tags.length ? `<div class="post-tags">${p.tags.map((t) => `<span class="post-tag">${esc(t)}</span>`).join('')}</div>` : ''}
      </a>`).join('\n')
    : `<p style="grid-column:1/-1;color:var(--ink-soft);">아직 올라온 글이 없습니다. 노션에서 글을 <b>공개</b>로 바꾸면 여기에 나타납니다.</p>`;

  return page({
    theme,
    depth: 0,
    title: `${BLOG_TITLE} · 고래영어 초전캠퍼스`,
    description: BLOG_LEDE,
    body: `
  <section class="blog-head">
    <div class="wrap">
      <span class="eyebrow">Whale English Journal</span>
      <h1>${esc(BLOG_TITLE)}</h1>
      <p>${esc(BLOG_LEDE)}</p>
    </div>
  </section>

  <section>
    <div class="wrap">
      <div class="post-grid">
${cards}
      </div>
    </div>
  </section>`,
  });
}

function postPage(theme, post, prev, next) {
  const nav = [
    prev ? `<a class="btn btn-outline" href="${encodeURIComponent(prev.slug)}.html">← ${esc(prev.title)}</a>` : '<span></span>',
    next ? `<a class="btn btn-outline" href="${encodeURIComponent(next.slug)}.html">${esc(next.title)} →</a>` : '<span></span>',
  ].join('\n        ');

  return page({
    theme,
    depth: 1,
    title: `${post.title} · 고래영어 초전캠퍼스`,
    description: post.summary || post.title,
    body: `
  <article class="wrap post-wrap">
    <header class="post-header">
      <a class="ext-link" href="../index.html">← ${esc(BLOG_TITLE)}</a>
      <h1>${esc(post.title)}</h1>
      <div class="post-meta">
        <span class="post-date">${esc(fmtDate(post.date))}</span>
        ${post.tags.length ? `<div class="post-tags">${post.tags.map((t) => `<span class="post-tag">${esc(t)}</span>`).join('')}</div>` : ''}
      </div>
    </header>

    <div class="post-body">
${post.html || '<p>본문이 비어 있습니다.</p>'}
    </div>

    <nav class="post-foot">
        ${nav}
    </nav>
  </article>`,
  });
}

/* ---------- 실행 ---------- */

async function main() {
  const { token, databaseId } = await loadEnv();
  const theme = await loadTheme();

  let posts = [];
  let warnings = [];
  let mode;

  if (token && databaseId) {
    mode = 'notion';
    console.log('노션에서 글을 읽어오는 중…');
    const result = await fetchPosts({
      token,
      databaseId,
      imageDir: IMAGES_DIR,
      imageBase: '../images/',
    });
    posts = result.posts;
    warnings = result.warnings;
  } else {
    mode = 'sample';
    posts = JSON.parse(await readFile(join(HERE, 'sample.json'), 'utf8'));
    console.log('노션 열쇠가 아직 없어서 예시 글로 화면을 만듭니다.');
  }

  await rm(POSTS_DIR, { recursive: true, force: true });
  await mkdir(POSTS_DIR, { recursive: true });

  await writeFile(join(OUT, 'index.html'), listPage(theme, posts));
  for (let i = 0; i < posts.length; i++) {
    await writeFile(
      join(POSTS_DIR, `${posts[i].slug}.html`),
      postPage(theme, posts[i], posts[i - 1], posts[i + 1])
    );
  }

  console.log(`\n완료: 글 ${posts.length}개 (${mode === 'notion' ? '노션' : '예시'})`);
  for (const p of posts) console.log(`  · ${p.date}  ${p.title}`);
  if (warnings.length) {
    console.log('\n확인이 필요한 것:');
    for (const w of warnings) console.log('  ! ' + w);
  }
  console.log('\n미리보기:  site/blog/index.html');
}

main().catch((err) => {
  console.error('\n블로그를 만들지 못했습니다.\n');

  if (err instanceof NotionError || err.code) {
    if (err.status === 401) {
      console.error('원인: 노션 열쇠(API 키)가 맞지 않습니다.');
      console.error('할 일: tools/blog/.env.local 의 NOTION_TOKEN 값을 다시 확인해 주세요.');
      console.error('       열쇠는 ntn_ 또는 secret_ 으로 시작합니다.');
    } else if (err.status === 404) {
      console.error('원인: 노션 표를 찾지 못했습니다.');
      console.error('할 일: 노션 표 페이지에서 우측 위 ⋯ → 연결 → 만든 연결을 추가했는지 확인해 주세요.');
      console.error('       연결을 안 하면 열쇠가 맞아도 표가 보이지 않습니다.');
      console.error('       NOTION_DATABASE_ID 값도 다시 확인해 주세요.');
    } else if (err.status === 400) {
      console.error('원인: 노션이 요청을 이해하지 못했습니다. 표 주소(ID)가 잘못되었을 수 있습니다.');
      console.error('할 일: NOTION_DATABASE_ID 가 32자리 글자·숫자인지 확인해 주세요.');
    } else {
      console.error('노션이 보낸 말: ' + err.message);
    }
  } else {
    console.error(err.message);
  }

  console.error('');
  process.exit(1);
});
