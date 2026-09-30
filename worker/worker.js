/**
 * 고래영어 원생관리 — 클라우드플레어 워커
 *
 * staff.whalejinju.kr 앞에 세워 두는 문지기입니다. 하는 일은 네 가지입니다.
 *
 *  1. 비밀번호 잠금  — 학원 비밀번호를 한 번 넣으면 그 기기는 30일간 통과합니다.
 *  2. 공개 통로(/p/) — 학부모에게 보낸 리포트·납부확인서 링크는 비밀번호 없이 열립니다.
 *  3. 노션 읽기 창구 — 노션 토큰을 브라우저에 두지 않고 여기서 대신 불러옵니다.
 *  4. 카카오 테스트 창구 — 카카오 채널로 온 메시지가 어떤 모양으로 넘어오는지 답장으로 보여 줍니다.
 *  5. 도서 조회 창구 — 책 ISBN 으로 네이버 책 · 알라딘에서 제목·지은이·표지를 찾아 줍니다.
 *
 * 화면 파일 자체는 그대로 GitHub Pages 에서 가져옵니다. 이 워커는 앞을 지킬 뿐입니다.
 *
 * 설치와 설정은 worker/README.md 를 보세요.
 */

const COOKIE = 'gorae_staff';
const SESSION_DAYS = 30;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // --- 노션 읽기 창구 -------------------------------------------------
    if (path.startsWith('/api/notion/')) {
      if (!(await signedIn(request, env))) return json({ error: '로그인이 필요합니다.' }, 401);
      return notion(path, env);
    }

    // --- 도서 조회 창구 ---------------------------------------------------
    // 네이버·알라딘 열쇠는 워커 비밀값에만 두고, 화면은 이 주소로만 물어봅니다.
    if (path === '/api/book') {
      if (!(await signedIn(request, env))) return json({ error: '로그인이 필요합니다.' }, 401);
      return bookLookup(url, env);
    }

    // --- 카카오 챗봇 테스트 창구 -----------------------------------------
    // 카카오 서버가 부르는 곳이라 비밀번호 쿠키가 없습니다.
    // 대신 주소 끝에 비밀 열쇠(KAKAO_SKILL_KEY)를 붙여야만 열립니다.
    if (path.startsWith('/api/kakao/test/')) return kakaoTest(request, env, path);

    // --- 로그인 처리 ----------------------------------------------------
    if (path === '/__login' && request.method === 'POST') return login(request, env, url);
    if (path === '/__logout') {
      return new Response(null, {
        status: 302,
        headers: { Location: '/', 'Set-Cookie': clearCookie() }
      });
    }

    // --- 공개 통로 ------------------------------------------------------
    // /p/... 로 들어온 요청은 비밀번호를 묻지 않고 그대로 내보냅니다.
    // 학부모 링크의 내용은 주소 뒤 #/report?d=... 에 들어 있어 서버까지 오지 않습니다.
    // 그래서 '이 요청은 공개'라는 표시를 주소 앞쪽(/p/)에 둘 수밖에 없습니다.
    if (path === '/p' || path.startsWith('/p/')) {
      const rest = path.slice(2);                       // '/p/assets/..' -> '/assets/..'
      return pass(request, url, !rest || rest === '/' ? '/index.html' : rest);
    }

    // --- 그 밖의 모든 요청은 비밀번호 확인 -------------------------------
    if (!(await signedIn(request, env))) {
      // 화면 파일이 아닌 것(이미지·아이콘 등)까지 로그인 화면을 주면 이상해지므로
      // 문서 요청에만 로그인 화면을 보여 줍니다.
      const wantsHtml = (request.headers.get('accept') || '').includes('text/html');
      if (!wantsHtml) return new Response('Unauthorized', { status: 401 });
      return loginPage(url.searchParams.get('e') ? '비밀번호가 맞지 않습니다.' : '');
    }

    return pass(request, url, path);
  }
};

/* ---------- 실제 파일 가져오기 ---------- */

/**
 * 같은 주소로 다시 요청해 GitHub Pages 의 파일을 받아옵니다.
 * 워커 안에서 보내는 요청은 워커를 한 번 더 타지 않으므로 무한히 돌지 않습니다.
 * 그래서 GitHub Pages 쪽 도메인 설정(CNAME)은 지금 그대로 두어도 됩니다.
 */
async function pass(request, url, path) {
  const target = new URL(url.toString());
  target.pathname = path;
  target.search = '';

  const res = await fetch(target.toString(), {
    method: 'GET',
    headers: { 'user-agent': request.headers.get('user-agent') || 'gorae-worker' },
    redirect: 'follow',
    cf: { cacheTtl: 300, cacheEverything: true }
  });

  const out = new Response(res.body, res);
  out.headers.set('x-gorae-gate', 'on');
  out.headers.delete('set-cookie');
  return out;
}

/* ---------- 로그인 ---------- */

async function login(request, env, url) {
  const form = await request.formData();
  const pw = String(form.get('pw') || '');
  const to = safeRedirect(String(form.get('to') || '/'));

  if (!env.STAFF_PASSWORD || !timingSafeEqual(normPw(pw), normPw(env.STAFF_PASSWORD))) {
    return new Response(null, { status: 302, headers: { Location: '/?e=1' } });
  }
  return loginDone(to, await makeCookie(env, url));
}

/**
 * 로그인 성공 응답.
 * 302 로 바로 넘기면 네이버·카카오톡 같은 앱 안 브라우저가 쿠키를 저장하지 않고 넘어가 버려서
 * 비밀번호가 맞아도 다시 로그인 화면이 나옵니다. 그래서 쿠키를 담은 짧은 화면을 먼저 보여 주고,
 * 그 화면이 원래 가려던 주소로 넘어갑니다.
 */
function loginDone(to, cookie) {
  const safe = JSON.stringify(to).replace(/</g, '\\u003c');
  const attr = to.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  const html = '<!doctype html><html lang="ko"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">' +
    '<meta http-equiv="refresh" content="1;url=' + attr + '"><title>들어가는 중…</title></head>' +
    '<body style="font-family:sans-serif;text-align:center;padding-top:30vh;color:#555">원생관리를 여는 중입니다…' +
    '<script>setTimeout(function(){location.replace(' + safe + ')},150)</script></body></html>';
  return new Response(html, {
    status: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'Set-Cookie': cookie
    }
  });
}

/**
 * 비교 전에 비밀번호를 정리합니다.
 * 휴대폰 키보드는 전각 숫자(１２３)나 앞뒤 공백을 넣기도 하고,
 * 대시보드에 붙여 넣은 비밀값 끝에 줄바꿈이 따라 들어가기도 합니다.
 */
function normPw(s) {
  return String(s || '').normalize('NFKC').replace(/\s+/g, '');
}

/** 돌아갈 주소는 이 사이트 안쪽만 허용합니다(열린 리다이렉트 방지). */
function safeRedirect(to) {
  return to.startsWith('/') && !to.startsWith('//') ? to : '/';
}

async function signedIn(request, env) {
  const raw = readCookie(request, COOKIE);
  if (!raw) return false;
  const [expires, sig] = raw.split('.');
  if (!expires || !sig) return false;
  if (Number(expires) < Date.now()) return false;
  return timingSafeEqual(sig, await sign(expires, env));
}

async function makeCookie(env, url) {
  const expires = Date.now() + SESSION_DAYS * 86400000;
  const value = expires + '.' + (await sign(String(expires), env));
  return COOKIE + '=' + value +
    '; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=' + SESSION_DAYS * 86400;
}

function clearCookie() {
  return COOKIE + '=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0';
}

function readCookie(request, name) {
  const jar = request.headers.get('cookie') || '';
  for (const part of jar.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return v.join('=');
  }
  return '';
}

/** 쿠키 위조를 막는 서명. SESSION_SECRET 이 없으면 비밀번호로 대신합니다. */
async function sign(text, env) {
  const secret = env.SESSION_SECRET || env.STAFF_PASSWORD || '';
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(text));
  return [...new Uint8Array(mac)].map(b => b.toString(16).padStart(2, '0')).join('');
}

/** 글자 수와 내용이 같은지, 앞에서 끊지 않고 끝까지 비교합니다. */
function timingSafeEqual(a, b) {
  a = String(a); b = String(b);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/* ---------- 도서 조회 ---------- */

/**
 * /api/book?isbn=9780064440202
 * 네이버 책(NAVER_CLIENT_ID · NAVER_CLIENT_SECRET) → 알라딘(ALADIN_TTB_KEY) 순서로 물어봅니다.
 * 열쇠가 하나도 없으면 503 을 돌려주고, 화면은 구글 도서 · 오픈 라이브러리로 넘어갑니다.
 */
async function bookLookup(url, env) {
  const isbn = String(url.searchParams.get('isbn') || '').replace(/[^0-9Xx]/g, '');
  if (!/^(97[89]\d{10}|\d{9}[\dXx])$/.test(isbn)) return json({ error: 'ISBN 이 올바르지 않습니다.' }, 400);

  const hasNaver = env.NAVER_CLIENT_ID && env.NAVER_CLIENT_SECRET;
  const hasAladin = !!env.ALADIN_TTB_KEY;
  if (!hasNaver && !hasAladin) return json({ error: '도서 조회 열쇠(네이버·알라딘)가 설정되지 않았습니다.' }, 503);

  const tries = [];
  if (hasNaver) tries.push(naverBook);
  if (hasAladin) tries.push(aladinBook);
  for (const fn of tries) {
    try {
      const r = await fn(isbn, env);
      if (r && r.title) return json(Object.assign({ isbn }, r), 200);
    } catch (e) {
      console.log('[book] ' + fn.name + ' 오류 ' + (e && e.message || e));
    }
  }
  return json({ error: '도서 정보를 찾지 못했습니다.' }, 404);
}

const stripTags = (s) => String(s || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();

async function naverBook(isbn, env) {
  const res = await fetch('https://openapi.naver.com/v1/search/book_adv.json?d_isbn=' + isbn, {
    headers: {
      'X-Naver-Client-Id': env.NAVER_CLIENT_ID,
      'X-Naver-Client-Secret': env.NAVER_CLIENT_SECRET
    }
  });
  if (!res.ok) throw new Error('네이버 응답 ' + res.status);
  const j = await res.json();
  const it = j.items && j.items[0];
  if (!it) return null;
  const d = String(it.pubdate || '');
  return {
    title: stripTags(it.title),
    author: stripTags(it.author).split('^').join(', '),
    publisher: stripTags(it.publisher),
    pubDate: /^\d{8}$/.test(d) ? d.slice(0, 4) + '-' + d.slice(4, 6) + '-' + d.slice(6, 8) : d,
    cover: it.image || '',
    source: '네이버 책'
  };
}

async function aladinBook(isbn, env) {
  const q = new URLSearchParams({
    ttbkey: env.ALADIN_TTB_KEY, itemIdType: isbn.length === 13 ? 'ISBN13' : 'ISBN',
    ItemId: isbn, output: 'js', Version: '20131101', Cover: 'Big'
  });
  const res = await fetch('https://www.aladin.co.kr/ttb/api/ItemLookUp.aspx?' + q.toString());
  if (!res.ok) throw new Error('알라딘 응답 ' + res.status);
  // 알라딘은 끝에 ; 가 붙거나 \' 같은 JSON 에 없는 표기를 섞어 보낼 때가 있어 정리한 뒤 읽습니다.
  const text = (await res.text()).trim().replace(/;\s*$/, '').replace(/\\'/g, "'");
  const j = JSON.parse(text);
  const it = j.item && j.item[0];
  if (!it) return null;
  return {
    title: stripTags(it.title),
    author: stripTags(it.author).replace(/\s*\((지은이|글|그림|옮긴이|엮은이|글·그림)\)/g, ''),
    publisher: stripTags(it.publisher),
    pubDate: String(it.pubDate || ''),
    cover: it.cover || '',
    source: '알라딘'
  };
}

/* ---------- 노션 ---------- */

/**
 * 지금은 '학생 명부' 읽기만 엽니다.
 * 노션 토큰(NOTION_TOKEN)은 워커 비밀값에만 두고 브라우저로는 나가지 않습니다.
 */
async function notion(path, env) {
  if (!env.NOTION_TOKEN) return json({ error: '노션 토큰이 설정되지 않았습니다.' }, 503);
  if (path !== '/api/notion/students') return json({ error: '없는 경로입니다.' }, 404);
  if (!env.NOTION_STUDENT_DB) return json({ error: '학생 명부 데이터베이스 ID가 없습니다.' }, 503);

  const res = await fetch(
    'https://api.notion.com/v1/databases/' + env.NOTION_STUDENT_DB + '/query',
    {
      method: 'POST',
      headers: {
        authorization: 'Bearer ' + env.NOTION_TOKEN,
        'notion-version': '2022-06-28',
        'content-type': 'application/json'
      },
      body: JSON.stringify({ page_size: 100 })
    }
  );
  if (!res.ok) {
    return json({ error: '노션이 응답하지 않았습니다.', status: res.status }, 502);
  }
  const body = await res.json();
  return json({ students: (body.results || []).map(toStudent).filter(s => s.name && !s.deleted) });
}

/** 노션 '학생 명부' 한 줄 -> 이 앱의 학생 모양 */
function toStudent(page) {
  const p = page.properties || {};
  return {
    notionId: page.id,
    name: text(p['학생 이름']),
    phone: (p['연락처'] || {}).phone_number || '',
    parentPhone: (p['학부모님 연락처'] || {}).phone_number || '',
    parentEmail: (p['학부모님 이메일'] || {}).email || '',
    memo: text(p['특이사항']),
    deleted: !!(p['삭제'] || {}).checkbox
  };
}

function text(prop) {
  if (!prop) return '';
  const rich = prop.title || prop.rich_text || [];
  return rich.map(t => t.plain_text || '').join('').trim();
}

/* ---------- 카카오 챗봇 테스트 ---------- */

/**
 * 채널로 보낸 메시지가 카카오 오픈빌더를 거쳐 무엇으로 넘어오는지 확인하는 창구입니다.
 * 받은 내용을 정리해서 그대로 카톡 답장으로 돌려줍니다. 아무것도 저장하지 않습니다.
 * 원본 전체는 클라우드플레어 워커의 '실시간 로그'에도 남깁니다.
 */
async function kakaoTest(request, env, path) {
  const isPost = request.method === 'POST';
  // 카카오는 '200 + 카카오 형식 JSON' 이 아니면 이유 없이 "올바르지 않은 응답" 이라고만 합니다.
  // 그래서 카카오가 부르는 POST 에는 문제가 있어도 카카오 형식으로 이유를 적어 돌려줍니다.
  const fail = (msg, status) => isPost ? kakaoReply('[고래영어 테스트 ⚠️] ' + msg) : json({ error: msg }, status);

  if (!env.KAKAO_SKILL_KEY) return fail('워커에 KAKAO_SKILL_KEY 가 설정되지 않았습니다.', 503);
  // 주소를 붙여넣다 끝에 딸려 온 '/' 나 공백은 봐줍니다.
  let key = path.slice('/api/kakao/test/'.length);
  try { key = decodeURIComponent(key); } catch (e) { /* 그대로 비교 */ }
  key = key.replace(/[\s/]+$/, '');
  const keyOk = timingSafeEqual(key, String(env.KAKAO_SKILL_KEY).trim());

  // 워커까지 왔는지부터 로그에 남깁니다. 여기 안 찍히면 워커 앞에서 막힌 것입니다.
  console.log('[kakao-test] ' + request.method + ' 도착 · 열쇠 ' + (keyOk ? '맞음' : '틀림') +
    ' · ' + (request.headers.get('user-agent') || '-'));
  if (!keyOk) return fail('스킬 주소 끝의 열쇠가 워커의 KAKAO_SKILL_KEY 와 다릅니다.', 404);
  if (!isPost) return json({ ok: true, message: '카카오 테스트 창구가 열려 있습니다. 오픈빌더 스킬 주소로 쓰세요.' });

  try {
    let body = null;
    try { body = JSON.parse(await request.text()); } catch (e) { /* 아래에서 안내 */ }
    console.log('[kakao-test] ' + JSON.stringify(body));
    if (!body || typeof body !== 'object') return fail('받은 내용이 JSON 이 아니었습니다.');
    return kakaoReply(kakaoSummary(body));
  } catch (e) {
    console.log('[kakao-test] 오류 ' + (e && e.stack || e));
    return fail('워커 안에서 오류가 났습니다: ' + cut(String(e && e.message || e), 200));
  }
}

/** 받은 JSON 에서 확인할 것만 추려 사람이 읽을 글로 만듭니다. */
function kakaoSummary(body) {
  const req = body.userRequest || {};
  const user = req.user || {};
  const props = user.properties || {};
  const action = body.action || {};
  const utter = String(req.utterance || '');

  const files = [];
  findUrls(body, '', files);

  const lines = ['[고래영어 테스트 수신 ✅]'];
  lines.push('보낸 말: ' + (utter ? cut(utter, 120) : '(없음)'));
  lines.push('블록: ' + ((body.intent || {}).name || '(알 수 없음)'));
  lines.push('보낸 사람 번호: ' + (user.id ? String(user.id).slice(0, 6) + '…' : '(없음)') +
    (props.plusfriendUserKey ? ' · 채널키 있음' : '') + (props.botUserKey ? ' · 봇키 있음' : ''));

  const params = Object.keys(action.params || {});
  if (params.length) lines.push('파라미터: ' + params.join(', '));

  if (files.length) {
    lines.push('', '찾은 파일 주소 ' + files.length + '개');
    files.slice(0, 5).forEach(f => {
      lines.push('· ' + f.where + ' [' + fileKind(f.url) + ']');
      lines.push('  ' + cut(f.url, 140));
    });
  } else {
    lines.push('', '파일 주소는 들어오지 않았습니다.');
  }
  return cut(lines.join('\n'), 990);   // 카카오 simpleText 는 1000자까지
}

/** JSON 안의 모든 http 주소를 어디에 있었는지와 함께 모읍니다. */
function findUrls(v, where, out) {
  if (typeof v === 'string') {
    const found = v.match(/https?:\/\/[^\s"',]+/g) || [];
    found.forEach(url => out.push({ where: where || '(맨 위)', url }));
  } else if (Array.isArray(v)) {
    v.forEach((x, i) => findUrls(x, where + '[' + i + ']', out));
  } else if (v && typeof v === 'object') {
    Object.keys(v).forEach(k => findUrls(v[k], where ? where + '.' + k : k, out));
  }
}

/** 주소 끝의 확장자로 어떤 파일인지 짐작합니다. */
function fileKind(url) {
  const ext = (url.split('?')[0].match(/\.([a-z0-9]{2,4})$/i) || [])[1];
  if (!ext) return '종류 모름';
  const e = ext.toLowerCase();
  if (['m4a', 'mp3', 'aac', 'wav', 'amr', 'ogg', '3gp', 'caf'].includes(e)) return '소리 ' + e;
  if (['jpg', 'jpeg', 'png', 'gif', 'heic', 'webp'].includes(e)) return '사진 ' + e;
  if (['mp4', 'mov'].includes(e)) return '영상 ' + e;
  return e;
}

function cut(s, n) { return s.length > n ? s.slice(0, n - 1) + '…' : s; }

/** 카카오 오픈빌더 응답 규격(2.0)의 글 한 줄짜리 답장 */
function kakaoReply(text) {
  return json({ version: '2.0', template: { outputs: [{ simpleText: { text } }] } });
}

/* ---------- 거들기 ---------- */

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
  });
}

/** 비밀번호를 묻는 화면. 대시보드와 같은 색을 씁니다. */
function loginPage(error) {
  const html = `<!DOCTYPE html>
<html lang="ko"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>고래영어 원생관리</title>
<style>
  :root{--navy:#0a2033;--navy-2:#102d45;--navy-3:#17405f;--brass:#a8894f;
        --ink:#14212c;--muted:#6b7b8a;--line:#e3e7ec;--bad-soft:#f7ecec}
  *{box-sizing:border-box}
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px;
       font-family:"Pretendard","Apple SD Gothic Neo","Malgun Gothic",-apple-system,BlinkMacSystemFont,sans-serif;
       background:linear-gradient(165deg,var(--navy),var(--navy-2) 55%,var(--navy-3));color:var(--ink)}
  .card{background:#fff;border-radius:16px;padding:34px 30px;width:100%;max-width:380px;
        box-shadow:0 28px 70px rgba(5,14,24,.4)}
  .brand{display:flex;align-items:center;gap:8px;font-size:14px;font-weight:700;color:var(--navy);margin-bottom:22px}
  .brand svg{color:var(--brass)}
  .brand span{color:var(--muted);font-weight:500}
  h1{margin:0 0 6px;font-size:20px;letter-spacing:-.3px}
  p.sub{margin:0 0 20px;font-size:13px;color:var(--muted);line-height:1.6}
  label{display:flex;flex-direction:column;gap:5px;font-size:12.5px;color:var(--muted);font-weight:600}
  input{border:1px solid var(--line);border-radius:9px;padding:10px 11px;font-size:14px;
        font-family:inherit;color:var(--ink);width:100%}
  input:focus{outline:2px solid #cfdae4;outline-offset:-1px;border-color:#215a86}
  button{width:100%;margin-top:16px;border:0;border-radius:9px;padding:11px 14px;
         background:var(--navy-3);color:#fff;font-size:14px;font-weight:600;cursor:pointer;font-family:inherit}
  button:hover{background:#2b6f9f}
  .err{background:var(--bad-soft);color:#963934;border-radius:8px;padding:9px 12px;
       font-size:12.5px;margin-bottom:14px;font-weight:600}
  .hint{margin-top:16px;font-size:12px;color:var(--muted);text-align:center;line-height:1.6}
</style></head>
<body>
  <form class="card" method="POST" action="/__login">
    <div class="brand">
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor"
           stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
        <path d="M2.6 6.8l3.5 10.6L10.2 9l3.6 8.4 2.4-5.6"/>
        <path d="M16.2 11.8c1.9-.2 3.4-1.3 4.4-3.2.3-.6 1.2-.4 1.2.3 0 2.4-1 4.5-2.9 5.9-.5.4-1.3.1-1.5-.5z"/>
      </svg>
      고래영어 <span>초전동캠퍼스</span>
    </div>
    <h1>원생관리 열기</h1>
    <p class="sub">학원 비밀번호를 넣어 주세요.<br>한 번 넣으면 이 기기에서는 30일 동안 다시 묻지 않습니다.</p>
    ${error ? '<div class="err">' + error + '</div>' : ''}
    <label>비밀번호
      <input type="password" name="pw" autocomplete="current-password" autofocus required>
    </label>
    <input type="hidden" name="to" value="/">
    <button type="submit">들어가기</button>
    <p class="hint">학부모님께 보내 드린 리포트 링크는<br>비밀번호 없이 그대로 열립니다.</p>
  </form>
</body></html>`;
  return new Response(html, {
    status: error ? 401 : 200,
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }
  });
}
