/**
 * 클라우드플레어 워커 확인 — 비밀번호 문지기 · 공개 통로 · 노션 창구
 *
 *   node tests/worker.test.js
 *
 * 브라우저 없이 워커 코드를 그대로 불러 실행합니다.
 * 바깥으로 나가는 요청(GitHub Pages · 노션)은 가짜로 바꿔 두고,
 * 워커가 무엇을 통과시키고 무엇을 막는지만 봅니다.
 */
const worker = (await import('../worker/worker.js')).default;

const ok = [], errs = [];
function t(name, cond, note) {
  (cond ? ok : errs).push(name);
  console.log((cond ? '  ✓  ' : '  ✗  ') + name + (note ? ' — ' + note : ''));
}

const ENV = {
  STAFF_PASSWORD: '고래영어2026',
  SESSION_SECRET: 'test-secret',
  NOTION_TOKEN: 'ntn_test',
  NOTION_STUDENT_DB: '2c3e4c50882081c2b2c5ded6f7a8ba5a'
};

/* 바깥 요청 가로채기 */
const seen = [];
globalThis.fetch = async (input, init) => {
  const u = typeof input === 'string' ? input : input.url;
  seen.push(u);
  if (u.startsWith('https://api.notion.com/')) {
    return new Response(JSON.stringify({
      results: [
        { id: 'p1', properties: {
            '학생 이름': { title: [{ plain_text: '김서준' }] },
            '연락처': { phone_number: '010-1111-2222' },
            '학부모님 연락처': { phone_number: '010-3333-4444' },
            '학부모님 이메일': { email: 'p@example.com' },
            '특이사항': { rich_text: [{ plain_text: '알레르기 있음' }] },
            '삭제': { checkbox: false } } },
        { id: 'p2', properties: {
            '학생 이름': { title: [{ plain_text: '김노션' }] },
            '삭제': { checkbox: true } } }
      ]
    }), { headers: { 'content-type': 'application/json' } });
  }
  // GitHub Pages 대역
  return new Response('<!DOCTYPE html><title>app</title>', {
    headers: { 'content-type': 'text/html', 'set-cookie': 'origin=should-be-dropped' }
  });
};

const HTML = { accept: 'text/html,application/xhtml+xml' };
function req(path, opts = {}) {
  return new Request('https://staff.whalejinju.kr' + path, opts);
}
const call = (path, opts) => worker.fetch(req(path, opts), ENV, {});

/* ---------- 잠금 ---------- */
let r = await call('/', { headers: HTML });
const body = await r.text();
t('비밀번호 없이 열면 로그인 화면', r.status === 200 && body.includes('원생관리 열기'));
t('로그인 화면은 색인하지 않음', body.includes('name="robots" content="noindex"'));

r = await call('/assets/js/store.js', { headers: { accept: '*/*' } });
t('비밀번호 없이 파일 요청은 401', r.status === 401, String(r.status));

/* ---------- 로그인 ---------- */
function loginBody(pw, to) {
  const f = new URLSearchParams({ pw });
  if (to) f.set('to', to);
  return { method: 'POST', body: f };
}

r = await call('/__login', loginBody('틀린비번'));
t('틀린 비밀번호는 못 들어감', r.status === 302 && r.headers.get('location') === '/?e=1',
  r.headers.get('location'));

r = await call('/', { headers: HTML });
const errPage = await r.text();
r = await call('/?e=1', { headers: HTML });
t('틀렸을 때 안내 문구', (await r.text()).includes('비밀번호가 맞지 않습니다'));

r = await call('/__login', loginBody(ENV.STAFF_PASSWORD));
const setCookie = r.headers.get('set-cookie') || '';
t('맞는 비밀번호로 통과', r.status === 302 && r.headers.get('location') === '/');
t('쿠키는 HttpOnly · Secure',
  setCookie.includes('HttpOnly') && setCookie.includes('Secure') && setCookie.includes('SameSite=Lax'));

const cookie = setCookie.split(';')[0];
const AUTH = { headers: { ...HTML, cookie } };

r = await call('/', AUTH);
t('로그인 뒤에는 앱이 열림', r.status === 200 && (await r.text()).includes('<title>app</title>'));
t('원본의 쿠키는 흘리지 않음', !r.headers.get('set-cookie'));

/* ---------- 쿠키 위조 ---------- */
r = await call('/', { headers: { ...HTML, cookie: 'gorae_staff=9999999999999.deadbeef' } });
t('서명이 틀린 쿠키는 거부', (await r.text()).includes('원생관리 열기'));

const expired = '1.' + cookie.split('.')[1];
r = await call('/', { headers: { ...HTML, cookie: 'gorae_staff=' + expired } });
t('기한 지난 쿠키는 거부', (await r.text()).includes('원생관리 열기'));

/* ---------- 공개 통로 ---------- */
seen.length = 0;
r = await call('/p/', { headers: HTML });
t('학부모 링크는 비밀번호 없이 열림', r.status === 200 && (await r.text()).includes('<title>app</title>'));
t('/p/ 는 index.html 로 이어짐', seen[0] && seen[0].endsWith('/index.html'), seen[0]);

seen.length = 0;
await call('/p/assets/css/style.css', { headers: { accept: '*/*' } });
t('/p/ 아래 파일은 /p 를 뗀 주소로', seen[0] && seen[0].endsWith('/assets/css/style.css'), seen[0]);

/* ---------- 열린 리다이렉트 ---------- */
r = await call('/__login', loginBody(ENV.STAFF_PASSWORD, 'https://evil.example.com'));
t('바깥 주소로는 돌려보내지 않음', r.headers.get('location') === '/', r.headers.get('location'));
r = await call('/__login', loginBody(ENV.STAFF_PASSWORD, '//evil.example.com'));
t('// 로 시작하는 주소도 막음', r.headers.get('location') === '/', r.headers.get('location'));

/* ---------- 로그아웃 ---------- */
r = await call('/__logout', AUTH);
t('로그아웃하면 쿠키가 지워짐',
  r.status === 302 && (r.headers.get('set-cookie') || '').includes('Max-Age=0'));

/* ---------- 노션 창구 ---------- */
r = await call('/api/notion/students', { headers: { accept: 'application/json' } });
t('로그인 없이 노션 창구는 401', r.status === 401, String(r.status));

seen.length = 0;
r = await call('/api/notion/students', { headers: { accept: 'application/json', cookie } });
const data = await r.json();
t('노션 학생 명부를 읽어 옴', r.status === 200 && data.students.length === 1, JSON.stringify(data).slice(0, 90));
t('삭제 표시된 학생은 빠짐', !data.students.some(s => s.name === '김노션'));
t('이름·연락처가 옮겨짐',
  data.students[0] && data.students[0].name === '김서준' &&
  data.students[0].parentPhone === '010-3333-4444' &&
  data.students[0].memo === '알레르기 있음');
t('노션 토큰은 응답에 들어가지 않음', !JSON.stringify(data).includes(ENV.NOTION_TOKEN));

r = await call('/api/notion/없는것', { headers: { accept: 'application/json', cookie } });
t('없는 노션 경로는 404', r.status === 404, String(r.status));

r = await worker.fetch(req('/api/notion/students', { headers: { cookie } }),
  { ...ENV, NOTION_TOKEN: '' }, {});
t('토큰이 없으면 친절히 알려 줌', r.status === 503);

/* ---------- 결과 ---------- */
console.log('\n통과 ' + ok.length + '건 · 실패 ' + errs.length + '건');
if (errs.length) { console.log('실패: ' + errs.join(', ')); process.exit(1); }
