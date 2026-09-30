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

// 휴대폰 키보드가 넣는 앞뒤 공백 · 전각 문자는 같은 비밀번호로 봅니다.
r = await call('/__login', loginBody(' ' + ENV.STAFF_PASSWORD + ' '));
t('앞뒤 공백이 붙어도 통과', r.status === 200 && (r.headers.get('set-cookie') || '').startsWith('gorae_staff='));
r = await call('/__login', loginBody(ENV.STAFF_PASSWORD.replace(/[0-9]/g, d => String.fromCharCode(0xFF10 + Number(d)))));
t('전각 숫자로 넣어도 통과', r.status === 200 && (r.headers.get('set-cookie') || '').startsWith('gorae_staff='));
r = await call('/__login', loginBody(ENV.STAFF_PASSWORD + '1'));
t('한 글자라도 다르면 못 들어감', r.headers.get('location') === '/?e=1');

r = await call('/__login', loginBody(ENV.STAFF_PASSWORD));
const setCookie = r.headers.get('set-cookie') || '';
const doneHtml = await r.clone().text();
t('맞는 비밀번호로 통과 (쿠키를 담은 화면을 거쳐 이동)', r.status === 200 && setCookie.startsWith('gorae_staff=') &&
  doneHtml.includes('location.replace("/")') && doneHtml.includes('http-equiv="refresh"'));
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
{ const h = await r.text(); t('바깥 주소로는 돌려보내지 않음', h.includes('location.replace("/")') && !h.includes('evil')); }
r = await call('/__login', loginBody(ENV.STAFF_PASSWORD, '//evil.example.com'));
{ const h = await r.text(); t('// 로 시작하는 주소도 막음', h.includes('location.replace("/")') && !h.includes('evil')); }

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


/* ---------- 휴대폰 로그인 (2026-09-30 실제 문제) ---------- */
// 대시보드에 비밀값을 붙여 넣으며 끝에 줄바꿈·공백이 섞여 들어간 경우
{
  const E2 = { ...ENV, STAFF_PASSWORD: '132600\n' };
  r = await worker.fetch(req('/__login', loginBody('132600')), E2, {});
  t('비밀값 끝에 줄바꿈이 있어도 로그인', r.status === 200 && /gorae_staff=/.test(r.headers.get('set-cookie') || ''), String(r.status));
  r = await worker.fetch(req('/__login', loginBody('１３２６００')), E2, {});
  t('휴대폰 전각 숫자로 넣어도 로그인', r.status === 200, String(r.status));
  r = await worker.fetch(req('/__login', loginBody('132601')), E2, {});
  t('숫자 하나 틀리면 못 들어감', r.status === 302 && r.headers.get('location') === '/?e=1');
  r = await worker.fetch(req('/__login', loginBody('132600')), E2, {});
  const html = await r.text();
  t('로그인 성공은 302 가 아니라 쿠키를 담은 화면 (앱 안 브라우저 대응)',
    r.status === 200 && html.includes('location.replace') && (r.headers.get('set-cookie') || '').includes('Max-Age='));
}

/* ---------- 카카오 테스트 창구 (합친 뒤에도 살아 있는지) ---------- */
{
  const E3 = { ...ENV, KAKAO_SKILL_KEY: 'k'.repeat(24) };
  r = await worker.fetch(req('/api/kakao/test/' + 'k'.repeat(24)), E3, {});
  t('카카오 창구: 열쇠가 맞으면 열림', r.status === 200, String(r.status));
  r = await worker.fetch(req('/api/kakao/test/wrong'), E3, {});
  t('카카오 창구: 열쇠가 틀리면 404', r.status === 404, String(r.status));
  r = await worker.fetch(req('/api/kakao/test/' + 'k'.repeat(24), { method: 'POST', body: JSON.stringify({ userRequest: { utterance: '안녕' } }) }), E3, {});
  const kj = await r.json();
  t('카카오 창구: 받은 말을 답장으로 돌려줌', JSON.stringify(kj).includes('안녕'));
}

/* ---------- 도서 조회 창구 ---------- */
{
  const base = globalThis.fetch;
  let naverHeaders = null, naverOn = true;
  globalThis.fetch = async (input, init) => {
    const u = typeof input === 'string' ? input : input.url;
    if (u.startsWith('https://openapi.naver.com/')) {
      naverHeaders = init && init.headers;
      const items = naverOn && u.includes('9780064440202')
        ? [{ title: 'Frog and <b>Toad</b> Are Friends', author: 'Arnold Lobel^Someone', publisher: 'HarperCollins', pubdate: '19790305', image: 'https://img.example/n.jpg' }]
        : [];
      return new Response(JSON.stringify({ items }), { headers: { 'content-type': 'application/json' } });
    }
    if (u.startsWith('https://www.aladin.co.kr/')) {
      const item = u.includes('9788949161478')
        ? [{ title: '개구리와 두꺼비는 친구', author: '아놀드 로벨 (지은이), 엄혜숙 (옮긴이)', publisher: '비룡소', pubDate: '1996-06-10', cover: 'https://img.example/a.jpg' }]
        : [];
      return new Response(JSON.stringify({ item }) + ';', { headers: { 'content-type': 'text/javascript' } });
    }
    return base(input, init);
  };
  const EB = { ...ENV, NAVER_CLIENT_ID: 'nid', NAVER_CLIENT_SECRET: 'nsecret', ALADIN_TTB_KEY: 'ttb' };
  const book = (isbn, env = EB, ck = cookie) =>
    worker.fetch(req('/api/book?isbn=' + isbn, { headers: { accept: 'application/json', cookie: ck } }), env, {});

  r = await worker.fetch(req('/api/book?isbn=9780064440202', { headers: { accept: 'application/json' } }), EB, {});
  t('도서 조회: 로그인 없이는 401', r.status === 401, String(r.status));

  r = await book('9780064440202');
  let bj = await r.json();
  t('도서 조회: 네이버에서 찾음', r.status === 200 && bj.title === 'Frog and Toad Are Friends' && bj.source === '네이버 책', JSON.stringify(bj));
  t('도서 조회: 지은이 ^ 구분·출판일 모양 정리', bj.author === 'Arnold Lobel, Someone' && bj.pubDate === '1979-03-05');
  t('도서 조회: 네이버 열쇠를 머리글로 보냄', naverHeaders && naverHeaders['X-Naver-Client-Secret'] === 'nsecret');
  t('도서 조회: 열쇠는 응답에 들어가지 않음', !JSON.stringify(bj).includes('nsecret') && !JSON.stringify(bj).includes('ttb'));

  r = await book('9788949161478');
  bj = await r.json();
  t('도서 조회: 네이버에 없으면 알라딘으로', r.status === 200 && bj.source === '알라딘' && bj.author === '아놀드 로벨, 엄혜숙', JSON.stringify(bj));

  r = await book('9781234567897');
  t('도서 조회: 어디에도 없으면 404', r.status === 404, String(r.status));

  r = await book('12345');
  t('도서 조회: ISBN 모양이 아니면 400', r.status === 400, String(r.status));

  r = await book('9780064440202', ENV);
  t('도서 조회: 열쇠가 없으면 503 (화면은 구글 도서로 넘어감)', r.status === 503, String(r.status));

  r = await book('9788949161478', { ...ENV, ALADIN_TTB_KEY: 'ttb' });
  t('도서 조회: 알라딘 열쇠만 있어도 동작', r.status === 200, String(r.status));

  globalThis.fetch = base;
}

/* ---------- 결과 ---------- */
console.log('\n통과 ' + ok.length + '건 · 실패 ' + errs.length + '건');
if (errs.length) { console.log('실패: ' + errs.join(', ')); process.exit(1); }
