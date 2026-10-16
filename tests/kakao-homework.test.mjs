/**
 * 카카오 채널 숙제 확인 — gorae-homework 워커의 /hw/kakao 창구
 *
 *   node tests/kakao-homework.test.mjs
 *
 * 브라우저 없이 워커를 그대로 부릅니다. R2 와 카카오 파일 서버는 가짜로 바꿔 둡니다.
 */
import worker from '../worker/homework-worker.js';

const ok = [], errs = [];
function t(name, cond, note) {
  (cond ? ok : errs).push(name);
  console.log((cond ? '  ✓  ' : '  ✗  ') + name + (note ? ' — ' + note : ''));
}

/* ---------- 가짜 R2 ---------- */
const store = new Map();
const HW = {
  put: async (k, b, o) => {
    const body = typeof b === 'string' ? Buffer.from(b) : Buffer.from(b instanceof ArrayBuffer ? new Uint8Array(b) : await new Response(b).arrayBuffer());
    store.set(k, { body, meta: o || {}, uploaded: new Date() });
    return { size: body.length };
  },
  get: async (k) => { const s = store.get(k); return s ? { body: s.body, size: s.body.length, httpMetadata: s.meta.httpMetadata, customMetadata: s.meta.customMetadata } : null; },
  delete: async (k) => store.delete(k),
  list: async ({ prefix }) => ({ truncated: false, objects: [...store.keys()].filter(k => k.startsWith(prefix)).map(k => ({
    key: k, size: store.get(k).body.length, uploaded: store.get(k).uploaded,
    customMetadata: store.get(k).meta.customMetadata, httpMetadata: store.get(k).meta.httpMetadata })) }),
};
const KEY = 'kk-test-123';
const env = { HW, KAKAO_SKILL_KEY: KEY, ADMIN_PASSWORD: 'pw' };

/* ---------- 가짜 카카오 파일 서버 ---------- */
let slow = 0;
globalThis.fetch = async (input) => {
  const u = typeof input === 'string' ? input : input.url;
  if (slow) await new Promise(r => setTimeout(r, slow));
  if (u.includes('/voice.m4a')) return new Response(Buffer.alloc(3000, 1), { headers: { 'content-type': 'audio/mp4', 'content-length': '3000' } });
  if (u.includes('/photo')) return new Response(Buffer.alloc(500, 2), { headers: { 'content-type': 'image/jpeg' } });
  if (u.includes('/clip.mp4')) return new Response(Buffer.alloc(800, 3), { headers: { 'content-type': 'application/octet-stream' } });
  if (u.includes('/page')) return new Response('<html>', { headers: { 'content-type': 'text/html' } });
  return new Response('nf', { status: 404 });
};

const waits = [];
const ctx = { waitUntil: (p) => waits.push(p) };
function kakao(utterance, opts = {}) {
  const body = opts.raw !== undefined ? opts.raw : JSON.stringify({
    intent: { name: '폴백 블록' },
    userRequest: { utterance, user: { id: opts.user || 'parent-A', type: 'botUserKey', properties: {} } },
    action: { params: opts.params || {}, detailParams: {} }
  });
  return worker.fetch(new Request('https://staff.whalejinju.kr/hw/kakao/' + (opts.key || KEY), {
    method: 'POST', headers: { 'content-type': 'application/json' }, body
  }), env, ctx);
}
async function say(res) {
  const j = await res.json();
  const o = (j.template && j.template.outputs && j.template.outputs[0]) || {};
  return { j, text: (o.simpleText && o.simpleText.text) || (o.textCard && (o.textCard.title + '\n' + o.textCard.description)) || '', card: o.textCard };
}
const subs = () => [...store.keys()].filter(k => k.startsWith('sub/'));
const listApi = async () => (await (await worker.fetch(new Request('https://staff.whalejinju.kr/hw/admin/api/list?days=1', {
  headers: { 'X-HW-Key': 'pw' } }), env, ctx)).json()).items;

/* ---------- 열쇠 ---------- */
let r = await worker.fetch(new Request('https://staff.whalejinju.kr/hw/kakao/' + KEY), env, ctx);
t('브라우저로 열면 창구가 열려 있다고 알려 줌', r.status === 200 && (await r.json()).ok === true);
r = await worker.fetch(new Request('https://staff.whalejinju.kr/hw/kakao/틀림'), env, ctx);
t('브라우저로 틀린 열쇠는 404', r.status === 404);
let s = await say(await kakao('안녕하세요', { key: '틀림' }));
t('카카오가 틀린 열쇠로 부르면 카카오 형식으로 이유', s.j.version === '2.0' && s.text.includes('열쇠'));
t('틀린 열쇠로는 아무것도 저장 안 함', store.size === 0);
r = await worker.fetch(new Request('https://staff.whalejinju.kr/hw/kakao/' + KEY + '/', { method: 'POST', body: '{}' }), env, ctx);
t('주소 끝 / 는 봐줌', r.status === 200 && (await r.json()).version === '2.0');

const noKey = async (e) => (await (await worker.fetch(new Request('https://staff.whalejinju.kr/hw/kakao/' + KEY), e, ctx)).json());
let nk = await noKey({ HW });
t('열쇠가 없으면 어디에 넣어야 하는지 안내', nk.ok === false && nk.error.includes('Variables and Secrets'), nk.error);
nk = await noKey({ HW, 'KAKAO_SKILL_KEY ': KEY });
t('이름 끝에 공백이 붙어도 찾아 씀', nk.ok === true);
nk = await noKey({ HW, kakao_skill_key: KEY });
t('소문자로 넣어도 찾아 씀', nk.ok === true);
nk = await noKey({ HW, KAKAO_KEY: KEY });
t('다른 이름으로 넣었으면 그 이름을 알려 줌 (값은 안 보임)', nk.error.includes('"KAKAO_KEY"') && !nk.error.includes(KEY), nk.error);

/* ---------- 이름 모를 때 녹음 ---------- */
s = await say(await kakao('http://talk.kakaocdn.net/dna/x/voice.m4a?credential=abc'));
t('녹음 파일 접수 답장', s.text.includes('숙제 파일 잘 받았어요'), s.text);
t('이름을 알려 달라고 함', s.text.includes('이름 김고래'));
let files = subs();
t('녹음이 숙제 폴더(sub/)에 저장', files.length === 1 && /^sub\/\d{4}-\d{2}-\d{2}\/\d+_[a-z0-9]+\.m4a$/.test(files[0]), files[0]);
const m1 = store.get(files[0]).meta;
t('녹음 종류·출처 기록', m1.httpMetadata.contentType === 'audio/mp4' && m1.customMetadata.via === 'kakao' && /^[0-9a-f]{24}$/.test(m1.customMetadata.kakao));
t('카카오 사용자 번호는 그대로 저장하지 않음', !JSON.stringify(m1).includes('parent-A'));

/* ---------- 이름 등록 ---------- */
s = await say(await kakao('이름이 뭐였더라?'));
t('"이름이…" 같은 글은 등록으로 보지 않음', !s.text.includes('등록했어요') && ![...store.keys()].some(k => k.startsWith('kakao/users/')));
s = await say(await kakao('이름 123'));
t('이름이 아닌 값은 다시 물어봄', s.text.includes('다시 알려') && ![...store.keys()].some(k => k.startsWith('kakao/users/')));

s = await say(await kakao('이름 김고래 학생'));
t('이름 등록 답장', s.text.includes('김고래 학생으로 등록'), s.text);
t('등록 기록은 숙제 폴더 밖(kakao/users)', [...store.keys()].some(k => /^kakao\/users\/[0-9a-f]{24}\.json$/.test(k)));
let items = await listApi();
const voice = items.filter(i => i.type === 'audio/mp4');
t('등록 전에 보낸 녹음도 목록에서는 김고래로 보임', voice.length === 1 && voice[0].student === '김고래' && voice[0].via === 'kakao');

/* ---------- 이름 아는 상태에서 사진 · 영상 ---------- */
s = await say(await kakao('', { params: { secureimage: '{"secureUrls":"List(https://k.kakaocdn.net/dn/photo1.jpg)"}' } }));
t('사진 접수 답장에 이름', s.text.includes('김고래 학생 숙제 잘 받았어요'), s.text);
t('이름을 아는 사람에게는 다시 묻지 않음', !s.text.includes('이름 김고래'));
s = await say(await kakao('http://talk.kakaocdn.net/dna/y/clip.mp4'));
const clip = subs().find(k => k.endsWith('.mp4'));
t('종류를 안 알려 줘도 확장자로 영상 저장', !!clip && store.get(clip).meta.httpMetadata.contentType === 'video/mp4');
t('파일 이름에 종류 표시', decodeURIComponent(store.get(clip).meta.customMetadata.filename) === '카카오_영상.mp4');

/* ---------- 글 ---------- */
const before = subs().length;
s = await say(await kakao('오늘 감기로 결석합니다'));
t('글에는 안내 카드 + 숙제 올리기 버튼', !!s.card && s.card.buttons[0].webLinkUrl === 'https://staff.whalejinju.kr/hw?name=' + encodeURIComponent('김고래'), s.card && s.card.buttons[0].webLinkUrl);
const txt = subs().find(k => k.endsWith('.txt') && store.get(k).body.toString() === '오늘 감기로 결석합니다');
t('글도 원생관리에서 보이도록 남김', subs().length === before + 1 && !!txt);
s = await say(await kakao('https://youtube.com/watch?v=1 이거 보세요'));
t('다른 사이트 주소는 파일로 받지 않고 글로 봄', !!s.card && !subs().some(k => k.endsWith('.bin')));

/* ---------- 다른 학부모 ---------- */
s = await say(await kakao('숙제 언제까지예요?', { user: 'parent-B' }));
t('처음 온 학부모 글에는 이름 안내 포함', s.text.includes('이름 김고래') && s.card.buttons[0].webLinkUrl === 'https://staff.whalejinju.kr/hw');

/* ---------- 받지 못한 파일 ---------- */
const n0 = subs().length;
s = await say(await kakao('http://talk.kakaocdn.net/dna/z/missing.m4a'));
t('카카오 파일을 못 받으면 올리기 버튼 안내', !!s.card && s.card.title.includes('받지 못했어요'));
s = await say(await kakao('http://talk.kakaocdn.net/dna/z/page'));
t('파일이 아닌 응답은 저장 안 함', subs().length === n0);

/* ---------- 느린 다운로드 ---------- */
slow = 3500;
const t0 = Date.now();
s = await say(await kakao('http://talk.kakaocdn.net/dna/w/voice.m4a'));
const took = Date.now() - t0;
t('3초 넘게 걸려도 먼저 답장 (카카오 5초 제한)', took < 4500 && s.text.includes('잘 받았어요'), took + 'ms');
await Promise.all(waits);
slow = 0;
t('뒤에서 저장을 마침', subs().filter(k => k.endsWith('.m4a')).length === 2);

/* ---------- 이상한 요청 ---------- */
for (const odd of ['', 'null', '[]', '"글"']) {
  const j = (await say(await kakao(null, { raw: odd }))).j;
  t('이상한 요청(' + (odd || '빈 내용') + ')에도 카카오 형식', j.version === '2.0');
}
s = await say(await kakao('발화 내용', { raw: JSON.stringify({ userRequest: null, action: null }) }));
t('userRequest 가 없어도 멈추지 않음', s.j.version === '2.0');

/* ---------- 기존 제출 화면과 함께 ---------- */
items = await listApi();
t('목록 API 에 카카오 숙제·메시지가 함께', items.some(i => i.type.startsWith('image/')) && items.some(i => i.type.startsWith('text/plain') && i.memo.includes('결석')));

console.log('\n통과 ' + ok.length + '건 · 실패 ' + errs.length + '건');
if (errs.length) { console.log('실패: ' + errs.join(', ')); process.exit(1); }
