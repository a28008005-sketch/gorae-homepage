/**
 * 고래영어 원생관리 — 클라우드플레어 워커
 *
 * staff.whalejinju.kr 앞에 세워 두는 문지기입니다. 하는 일은 세 가지입니다.
 *
 *  1. 비밀번호 잠금  — 학원 비밀번호를 한 번 넣으면 그 기기는 30일간 통과합니다.
 *  2. 공개 통로(/p/) — 학부모에게 보낸 리포트·납부확인서 링크는 비밀번호 없이 열립니다.
 *  3. 노션 읽기 창구 — 노션 토큰을 브라우저에 두지 않고 여기서 대신 불러옵니다.
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

  if (!env.STAFF_PASSWORD || !timingSafeEqual(pw, env.STAFF_PASSWORD)) {
    return new Response(null, { status: 302, headers: { Location: '/?e=1' } });
  }
  return new Response(null, {
    status: 302,
    headers: { Location: to, 'Set-Cookie': await makeCookie(env, url) }
  });
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
