/**
 * notion.mjs — 노션에서 글을 읽어와 HTML로 바꾼다.
 *
 * 외부 라이브러리를 쓰지 않는다(설치할 게 없다). Node에 기본으로 들어있는
 * fetch만 사용한다.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join, extname } from 'node:path';

const API = 'https://api.notion.com/v1';
const VERSION = process.env.NOTION_VERSION || '2022-06-28';

class NotionError extends Error {}

async function call(token, path, { method = 'GET', body } = {}) {
  const res = await fetch(API + path, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Notion-Version': VERSION,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { message: text }; }

  if (!res.ok) {
    const err = new NotionError(data.message || `HTTP ${res.status}`);
    err.status = res.status;
    err.code = data.code;
    throw err;
  }
  return data;
}

/* ------------------------------------------------------------------ */
/* 표에서 글 목록 가져오기                                             */
/* ------------------------------------------------------------------ */

/**
 * 노션은 예전 방식(databases/query)과 새 방식(data_sources/query)이 있다.
 * 예전 방식을 먼저 써보고, 안 되면 새 방식으로 자동으로 넘어간다.
 */
async function queryAll(token, databaseId) {
  const pages = [];
  let cursor;

  const run = async (path) => {
    do {
      const data = await call(token, path, {
        method: 'POST',
        body: cursor ? { start_cursor: cursor, page_size: 100 } : { page_size: 100 },
      });
      pages.push(...data.results);
      cursor = data.has_more ? data.next_cursor : undefined;
    } while (cursor);
  };

  try {
    await run(`/databases/${databaseId}/query`);
  } catch (err) {
    const needsDataSource =
      err.status === 400 &&
      /data.?source/i.test(err.message || '');
    if (!needsDataSource) throw err;

    const db = await call(token, `/databases/${databaseId}`);
    const ds = db.data_sources?.[0]?.id;
    if (!ds) throw new NotionError('표에서 데이터 소스를 찾지 못했습니다.');
    pages.length = 0;
    cursor = undefined;
    await run(`/data_sources/${ds}/query`);
  }

  return pages;
}

/* ------------------------------------------------------------------ */
/* 속성 읽기 — 이름을 조금씩 다르게 지어도 알아서 찾는다               */
/* ------------------------------------------------------------------ */

const ALIASES = {
  title:   ['제목', 'Title', 'Name', '이름'],
  status:  ['상태', 'Status', '공개', '공개여부'],
  date:    ['날짜', 'Date', '발행일', '작성일'],
  summary: ['요약', 'Summary', 'Description', '설명', '한줄요약'],
  tags:    ['태그', 'Tags', '분류', '카테고리'],
  slug:    ['주소', 'Slug', 'URL', '링크'],
};

function findProp(props, kind) {
  for (const name of ALIASES[kind]) {
    if (props[name]) return props[name];
  }
  // 이름이 안 맞으면 유형으로 한 번 더 찾아본다
  const byType = {
    title: 'title',
    date: 'date',
    tags: 'multi_select',
    status: 'select',
  }[kind];
  if (byType) {
    for (const p of Object.values(props)) {
      if (p.type === byType) return p;
    }
  }
  return null;
}

const plain = (rich) => (rich || []).map((r) => r.plain_text).join('');

function readProp(props, kind) {
  const p = findProp(props, kind);
  if (!p) return null;
  switch (p.type) {
    case 'title': return plain(p.title);
    case 'rich_text': return plain(p.rich_text);
    case 'date': return p.date?.start || null;
    case 'select': return p.select?.name || null;
    case 'status': return p.status?.name || null;
    case 'multi_select': return p.multi_select.map((t) => t.name);
    case 'checkbox': return p.checkbox;
    case 'url': return p.url;
    default: return null;
  }
}

/** "공개"로 표시된 글만 내보낸다. 상태 칸이 아예 없으면 전부 공개로 본다. */
function isPublished(props) {
  const v = readProp(props, 'status');
  if (v == null) return true;
  return /공개|게시|발행|published|live/i.test(v);
}

function makeSlug(title, id) {
  const base = String(title || '')
    .trim()
    .replace(/[\s/\\]+/g, '-')
    .replace(/[^\p{Letter}\p{Number}-]/gu, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
  return base || 'post-' + String(id).replace(/-/g, '').slice(0, 8);
}

/* ------------------------------------------------------------------ */
/* 블록 → HTML                                                         */
/* ------------------------------------------------------------------ */

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function richToHtml(rich) {
  return (rich || []).map((r) => {
    let out = esc(r.plain_text);
    const a = r.annotations || {};
    if (a.code) out = `<code>${out}</code>`;
    if (a.bold) out = `<strong>${out}</strong>`;
    if (a.italic) out = `<em>${out}</em>`;
    if (a.strikethrough) out = `<s>${out}</s>`;
    if (a.underline) out = `<u>${out}</u>`;
    if (r.href) out = `<a href="${esc(r.href)}" target="_blank" rel="noopener">${out}</a>`;
    return out;
  }).join('').replace(/\n/g, '<br>');
}

async function fetchChildren(token, blockId) {
  const out = [];
  let cursor;
  do {
    const qs = cursor ? `?start_cursor=${cursor}&page_size=100` : '?page_size=100';
    const data = await call(token, `/blocks/${blockId}/children${qs}`);
    out.push(...data.results);
    cursor = data.has_more ? data.next_cursor : undefined;
  } while (cursor);
  return out;
}

/** 노션 이미지 주소는 1시간이면 만료된다. 그래서 파일로 내려받아 둔다. */
async function saveImage(url, outDir, name) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`이미지를 받지 못했습니다 (HTTP ${res.status})`);
  const buf = Buffer.from(await res.arrayBuffer());

  let ext = extname(new URL(url).pathname).toLowerCase();
  if (!/^\.(png|jpg|jpeg|gif|webp|svg|avif)$/.test(ext)) {
    const type = res.headers.get('content-type') || '';
    ext = type.includes('png') ? '.png'
        : type.includes('webp') ? '.webp'
        : type.includes('gif') ? '.gif'
        : type.includes('svg') ? '.svg' : '.jpg';
  }

  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, name + ext), buf);
  return name + ext;
}

async function blocksToHtml(token, blocks, ctx, depth = 0) {
  const html = [];
  let list = null; // 목록은 <ul>/<ol> 로 묶어야 해서 모아둔다

  const flush = () => {
    if (!list) return;
    html.push(`<${list.tag}>${list.items.map((i) => `<li>${i}</li>`).join('')}</${list.tag}>`);
    list = null;
  };

  for (const b of blocks) {
    const t = b.type;
    const v = b[t] || {};

    const childHtml = async () => {
      if (!b.has_children || depth >= 3) return '';
      const kids = await fetchChildren(token, b.id);
      return blocksToHtml(token, kids, ctx, depth + 1);
    };

    if (t === 'bulleted_list_item' || t === 'numbered_list_item') {
      const tag = t === 'bulleted_list_item' ? 'ul' : 'ol';
      if (!list || list.tag !== tag) { flush(); list = { tag, items: [] }; }
      list.items.push(richToHtml(v.rich_text) + (await childHtml()));
      continue;
    }
    flush();

    switch (t) {
      case 'paragraph': {
        const inner = richToHtml(v.rich_text);
        if (inner.trim()) html.push(`<p>${inner}</p>`);
        html.push(await childHtml());
        break;
      }
      case 'heading_1': html.push(`<h2>${richToHtml(v.rich_text)}</h2>`); break;
      case 'heading_2': html.push(`<h2>${richToHtml(v.rich_text)}</h2>`); break;
      case 'heading_3': html.push(`<h3>${richToHtml(v.rich_text)}</h3>`); break;

      case 'quote':
        html.push(`<blockquote>${richToHtml(v.rich_text)}${await childHtml()}</blockquote>`);
        break;

      case 'callout': {
        const emoji = v.icon?.type === 'emoji' ? v.icon.emoji : '💡';
        html.push(
          `<div class="callout"><span class="callout-icon" aria-hidden="true">${esc(emoji)}</span>` +
          `<div><p>${richToHtml(v.rich_text)}</p>${await childHtml()}</div></div>`
        );
        break;
      }

      case 'code':
        html.push(`<pre><code>${esc(plain(v.rich_text))}</code></pre>`);
        break;

      case 'divider': html.push('<hr>'); break;

      case 'to_do':
        html.push(
          `<div class="todo${v.checked ? ' done' : ''}">` +
          `<input type="checkbox" disabled${v.checked ? ' checked' : ''}>` +
          `<span>${richToHtml(v.rich_text)}</span></div>`
        );
        break;

      case 'toggle':
        html.push(
          `<details><summary>${richToHtml(v.rich_text)}</summary>${await childHtml()}</details>`
        );
        break;

      case 'image': {
        const url = v.type === 'external' ? v.external.url : v.file?.url;
        if (!url) break;
        const caption = richToHtml(v.caption);
        let src = url;
        try {
          const file = await saveImage(url, ctx.imageDir, `${ctx.slug}-${ctx.imageCount++}`);
          src = `${ctx.imageBase}${file}`;
        } catch (e) {
          ctx.warnings.push(`이미지를 내려받지 못했습니다: ${e.message}`);
        }
        html.push(
          `<figure><img src="${esc(src)}" alt="${esc(plain(v.caption)) || '본문 이미지'}" loading="lazy">` +
          (caption ? `<figcaption>${caption}</figcaption>` : '') + `</figure>`
        );
        break;
      }

      case 'bookmark':
      case 'embed':
      case 'video': {
        const url = v.url || v.external?.url;
        if (url) html.push(`<p><a href="${esc(url)}" target="_blank" rel="noopener">${esc(url)}</a></p>`);
        break;
      }

      case 'column_list':
      case 'synced_block':
        html.push(await childHtml());
        break;

      default:
        if (v.rich_text) {
          const inner = richToHtml(v.rich_text);
          if (inner.trim()) html.push(`<p>${inner}</p>`);
        }
    }
  }

  flush();
  return html.filter(Boolean).join('\n');
}

/* ------------------------------------------------------------------ */
/* 바깥에서 쓰는 함수                                                   */
/* ------------------------------------------------------------------ */

export async function fetchPosts({ token, databaseId, imageDir, imageBase }) {
  const warnings = [];
  const rows = await queryAll(token, databaseId);
  const posts = [];

  for (const row of rows) {
    const props = row.properties || {};
    if (!isPublished(props)) continue;

    const title = readProp(props, 'title') || '(제목 없음)';
    const slugRaw = readProp(props, 'slug');
    const slug = (slugRaw && String(slugRaw).trim()) || makeSlug(title, row.id);

    const ctx = { slug, imageDir, imageBase, imageCount: 1, warnings };
    const blocks = await fetchChildren(token, row.id);
    const bodyHtml = await blocksToHtml(token, blocks, ctx);

    posts.push({
      id: row.id,
      title,
      slug,
      date: readProp(props, 'date') || (row.created_time || '').slice(0, 10),
      summary: readProp(props, 'summary') || '',
      tags: readProp(props, 'tags') || [],
      html: bodyHtml,
    });
  }

  posts.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  return { posts, warnings };
}

export { NotionError };
