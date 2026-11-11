// gorae-homework : 고래영어학원 동영상 숙제 제출 워커
// 경로: staff.whalejinju.kr/hw*
// 바인딩: HW (R2 bucket gorae-homework), GATE (서비스 바인딩 → gorae-staff-gate), ADMIN_PASSWORD (secret)
//
// 학원자료실 파일도 같은 버킷의 res/ 폴더에 둡니다. (숙제 영상은 sub/ 폴더)
//   PUT  /hw/admin/api/res/upload?name=파일이름   파일 올리기 (한 번에, 최대 95MB)
//   POST /hw/admin/api/res/delete {key}          파일 지우기
//   GET  /hw/admin/res?key=...[&dl=1]            파일 열기 / 내려받기
// ★ 버킷 수명 규칙(30일 자동 삭제)은 sub/ 폴더에만 걸려 있어야 합니다. 버킷 전체에 걸면 자료 파일도 지워집니다.
//
// 센텐스뱅크 서바이벌 (학습패드 앱 dailytest/cards/survival.html 이 부르는 곳, 2026-11 추가)
// 파닉스카드 서바이벌 (dailytest/cards/phonics.html, level 'Phonics') 도 같은 곳에 쌓입니다 (2026-11-07)
//   POST /hw/api/sv/log                 연습 기록 남기기 (영상 없음)
//   POST /hw/api/sv/start               실전 녹화 영상 올리기 시작 → 기록 하나 생김
//   PUT  /hw/api/sv/part?key=&uploadId=&n=   영상 조각
//   POST /hw/api/sv/complete            영상 올리기 끝
//   GET  /hw/sv/<id>?s=서명              학부모용 영상 보기 화면 (비밀번호 없이, 서명이 맞아야 열림)
//   GET  /hw/sv/<id>/video?s=서명        그 영상 파일
//   GET  /hw/admin/api/sv/list?days=90  기록 목록 (원생관리 로그인 필요)
//   POST /hw/admin/api/sv/sent {id,to}  학부모 전송 표시
//   POST /hw/admin/api/sv/delete {id}   기록·영상 지우기
//   기록은 sv/log/<id>.json, 영상은 sv/vid/<id>.<확장자> 에 둡니다. sv/ 폴더는 자동 삭제 규칙을 걸지 않습니다.
//
// 웨일튜터 학습현황 자동 가져오기 (2026-11-10 추가)
//   크론(평일 13~21시 KST, 10분마다)이 본사 웨일튜터 「학습현황」을 받아 wt/day/<날짜>.json · wt/students.json 에 둡니다.
//   GET  /hw/admin/api/wt?since=YYYY-MM-DD   원생관리 학습 현황판이 가져가는 곳 (북마크와 같은 모양)
//   POST /hw/admin/api/wt/refresh            지금 바로 한 번 받아 오기
//   크론 설정: 클라우드플레어 → gorae-homework → Settings → Trigger events → Cron  "*/10 4-12 * * 1-5" (UTC)
//
// 카카오 채널 숙제 (카카오 챗봇 스킬이 부르는 곳, 비밀값 KAKAO_SKILL_KEY 필요)
//   POST /hw/kakao/<KAKAO_SKILL_KEY>   채널로 온 파일은 sub/ 에 숙제로 저장, 글은 '카카오 메시지'로 저장, 자동 답장
//   학부모가 "이름 김고래" 라고 한 번 보내면 그 카카오 계정 = 그 학생으로 기억합니다 (kakao/users/ 폴더, 지우지 않음)

const PART_SIZE = 10 * 1024 * 1024; // 10MB 조각
const MAX_SIZE = 1024 * 1024 * 1024; // 1GB
const KEEP_DAYS = 30;
const RES_MAX = 95 * 1024 * 1024; // 자료 파일 한 개 최대 크기 (워커가 한 번에 받을 수 있는 한도 100MB 아래)

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(wtRefresh(env, { cron: true }).catch(() => {}));
  },
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const p = url.pathname.replace(/\/+$/, '') || '/';
    try {
      if (p.startsWith('/hw/api/sv/')) return withCors(request, await svPublic(request, env, url, p));
      if (p.startsWith('/hw/sv/') || p.startsWith('/hw/v/')) return svWatch(request, env, url, p);
      if (p.startsWith('/hw/kakao/')) return kakao(request, env, ctx, p, url);
      if (p === '/hw') return html(submitPage());
      if (p === '/hw/api/start' && request.method === 'POST') return start(request, env);
      if (p === '/hw/api/part' && request.method === 'PUT') return part(request, env, url);
      if (p === '/hw/api/complete' && request.method === 'POST') return complete(request, env);
      if (p === '/hw/api/abort' && request.method === 'POST') return abort(request, env);

      if (p.startsWith('/hw/admin')) {
        if (!(await authorized(request, env, url, p))) {
          // 원생관리 화면(X-HW-Key)이나 API 요청에는 브라우저 로그인 창을 띄우지 않습니다.
          if (p !== '/hw/admin' || request.headers.get('X-HW-Key') !== null) {
            const msg = request.headers.get('X-HW-Key') !== null ? '숙제 비밀번호가 맞지 않습니다.' : '원생관리 로그인이 필요합니다. 새로고침한 뒤 학원 비밀번호로 다시 들어와 주세요.';
            return json({ ok: false, error: msg }, 401);
          }
          return new Response('로그인이 필요합니다.', {
            status: 401,
            headers: { 'WWW-Authenticate': 'Basic realm="gorae-homework", charset="UTF-8"' },
          });
        }
        if (p === '/hw/admin/api/token') return token(env);
        if (p === '/hw/admin') return html(adminPage());
        if (p === '/hw/admin/api/list') return list(env, url);
        if (p === '/hw/admin/api/check' && request.method === 'POST') return check(request, env);
        if (p === '/hw/admin/file') return file(request, env, url);
        if (p === '/hw/admin/api/res/upload' && request.method === 'PUT') return resUpload(request, env, url);
        if (p === '/hw/admin/api/res/delete' && request.method === 'POST') return resDelete(request, env);
        if (p === '/hw/admin/res') return resFile(env, url);
        if (p === '/hw/admin/api/sv/list') return svList(env, url);
        if (p === '/hw/admin/api/wt') return wtGet(env, url);
        if (p === '/hw/admin/api/wt/refresh' && request.method === 'POST') return json(await wtRefresh(env, {}));
        if (p === '/hw/admin/api/sv/sent' && request.method === 'POST') return svSent(request, env);
        if (p === '/hw/admin/api/sv/delete' && request.method === 'POST') return svDelete(request, env);
      }
      return new Response('Not found', { status: 404 });
    } catch (e) {
      return json({ ok: false, error: String(e && e.message || e) }, 500);
    }
  },
};

// ---------- 학부모 제출 API ----------
async function start(request, env) {
  const b = await request.json();
  const student = clean(b.student, 20);
  const cls = clean(b.cls, 20);
  const memo = clean(b.memo, 200);
  const filename = clean(b.filename, 100) || 'video';
  const size = Number(b.size) || 0;
  const type = String(b.type || '');
  if (!student) return json({ ok: false, error: '학생 이름을 입력해 주세요.' }, 400);
  if (!size || size > MAX_SIZE) return json({ ok: false, error: '파일 크기를 확인해 주세요. (최대 1GB)' }, 400);
  if (type && !/^(video|audio)\//.test(type)) return json({ ok: false, error: '동영상 또는 녹음 파일만 올릴 수 있어요.' }, 400);

  const day = kstDay();
  const ext = (filename.match(/\.([a-zA-Z0-9]{1,5})$/) || [, 'mp4'])[1].toLowerCase();
  const key = `sub/${day}/${Date.now()}_${rand(6)}.${ext}`;
  const mpu = await env.HW.createMultipartUpload(key, {
    httpMetadata: { contentType: type || 'video/mp4' },
    customMetadata: {
      student: enc(student), cls: enc(cls), memo: enc(memo),
      filename: enc(filename), size: String(size),
      submittedAt: new Date().toISOString(),
    },
  });
  return json({ ok: true, key, uploadId: mpu.uploadId, partSize: PART_SIZE });
}

async function part(request, env, url) {
  const key = url.searchParams.get('key');
  const uploadId = url.searchParams.get('uploadId');
  const n = Number(url.searchParams.get('n'));
  if (!validKey(key) || !uploadId || !(n >= 1 && n <= 200)) return json({ ok: false, error: 'bad request' }, 400);
  const mpu = env.HW.resumeMultipartUpload(key, uploadId);
  const res = await mpu.uploadPart(n, request.body);
  return json({ ok: true, partNumber: res.partNumber, etag: res.etag });
}

async function complete(request, env) {
  const b = await request.json();
  if (!validKey(b.key) || !b.uploadId || !Array.isArray(b.parts)) return json({ ok: false, error: 'bad request' }, 400);
  const mpu = env.HW.resumeMultipartUpload(b.key, b.uploadId);
  await mpu.complete(b.parts.map(x => ({ partNumber: Number(x.partNumber), etag: String(x.etag) })));
  return json({ ok: true });
}

async function abort(request, env) {
  const b = await request.json().catch(() => ({}));
  if (validKey(b.key) && b.uploadId) {
    try { await env.HW.resumeMultipartUpload(b.key, b.uploadId).abort(); } catch (_) {}
  }
  return json({ ok: true });
}

// ---------- 관리자 ----------
/*
 * 원생관리에 로그인한 기기인지 확인합니다.
 * 원생관리 로그인은 gorae-staff-gate 워커가 관리하므로, 서비스 바인딩(GATE)으로 그 워커에
 * 같은 쿠키를 들고 '로그인해야만 열리는 창구'를 두드려 봅니다. 401 이 아니면 로그인된 기기입니다.
 * 같은 쿠키는 5분 동안 결과를 기억해 매번 묻지 않습니다.
 */
const staffCache = new Map();
async function staffSignedIn(request, env) {
  if (!env.GATE) return false;
  const jar = request.headers.get('cookie') || '';
  const m = jar.match(/(?:^|;\s*)gorae_staff=([^;]+)/);
  if (!m) return false;
  const hit = staffCache.get(m[1]);
  if (hit && hit.until > Date.now()) return hit.ok;
  let ok = false;
  try {
    const r = await env.GATE.fetch('https://staff.whalejinju.kr/api/notion/students', {
      headers: { cookie: 'gorae_staff=' + m[1], accept: 'application/json' },
    });
    ok = r.status !== 401;
  } catch (_) { ok = false; }
  if (staffCache.size > 500) staffCache.clear();
  staffCache.set(m[1], { ok, until: Date.now() + 5 * 60 * 1000 });
  return ok;
}

async function authorized(request, env, url, p) {
  // 0) 원생관리에 로그인한 기기 (비밀번호 없이 바로)
  if (await staffSignedIn(request, env)) return true;
  if (!env.ADMIN_PASSWORD) return false;
  // 1) 원생관리 화면: X-HW-Key 머리글
  const k = request.headers.get('X-HW-Key');
  if (k !== null) return safeEqual(k, env.ADMIN_PASSWORD);
  // 2) 영상 재생·저장 링크: 12시간짜리 서명 토큰 (?t=)
  const t = url.searchParams.get('t');
  if (t && (p === '/hw/admin/file' || p === '/hw/admin/res')) return verifyToken(t, env);
  // 3) /hw/admin 단독 화면: 브라우저 기본 로그인
  const h = request.headers.get('Authorization') || '';
  if (!h.startsWith('Basic ')) return false;
  let decoded = '';
  try { decoded = new TextDecoder().decode(Uint8Array.from(atob(h.slice(6)), c => c.charCodeAt(0))); } catch (_) { return false; }
  const pw = decoded.slice(decoded.indexOf(':') + 1);
  return safeEqual(pw, env.ADMIN_PASSWORD);
}

async function hmac(text, env) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode('hw:' + env.ADMIN_PASSWORD),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(text));
  return [...new Uint8Array(mac)].map(b => b.toString(16).padStart(2, '0')).join('');
}
async function token(env) {
  const exp = String(Date.now() + 12 * 3600 * 1000);
  return json({ ok: true, token: exp + '.' + (await hmac(exp, env)), exp: Number(exp) });
}
async function verifyToken(t, env) {
  const [exp, sig] = String(t).split('.');
  if (!exp || !sig || Number(exp) < Date.now()) return false;
  return safeEqual(sig, await hmac(exp, env));
}

async function list(env, url) {
  const days = Math.min(Number(url.searchParams.get('days')) || 7, KEEP_DAYS);
  const items = [];
  const checked = new Set();
  const names = new Map();   // 카카오 계정 → 등록된 학생 이름 (한 번 부를 때만 기억)
  let cursor;
  do {
    const r = await env.HW.list({ prefix: 'checked/', cursor, limit: 1000 });
    r.objects.forEach(o => checked.add(o.key.slice('checked/'.length)));
    cursor = r.truncated ? r.cursor : undefined;
  } while (cursor);

  for (let i = 0; i < days; i++) {
    const d = new Date(Date.now() + 9 * 3600 * 1000 - i * 86400000).toISOString().slice(0, 10);
    let c;
    do {
      const r = await env.HW.list({ prefix: `sub/${d}/`, cursor: c, limit: 1000, include: ['customMetadata', 'httpMetadata'] });
      for (const o of r.objects) {
        const m = o.customMetadata || {};
        let student = dec(m.student);
        // 이름을 알려 주기 전에 카카오로 보낸 숙제는, 나중에 등록된 이름으로 채워서 보여 줍니다.
        if (!student && m.kakao) {
          if (!names.has(m.kakao)) names.set(m.kakao, ((await kakaoUser(env, m.kakao)) || {}).student || '');
          student = names.get(m.kakao);
        }
        items.push({
          key: o.key, size: o.size, uploaded: o.uploaded,
          student, cls: dec(m.cls), memo: dec(m.memo),
          filename: dec(m.filename), checked: checked.has(o.key),
          type: (o.httpMetadata && o.httpMetadata.contentType) || '',
          via: m.via || '',
        });
      }
      c = r.truncated ? r.cursor : undefined;
    } while (c);
  }
  items.sort((a, b) => (a.uploaded < b.uploaded ? 1 : -1));
  return json({ ok: true, items, keepDays: KEEP_DAYS });
}

async function check(request, env) {
  const b = await request.json();
  if (!validKey(b.key)) return json({ ok: false }, 400);
  if (b.checked) await env.HW.put('checked/' + b.key, '');
  else await env.HW.delete('checked/' + b.key);
  return json({ ok: true });
}

async function file(request, env, url) {
  const key = url.searchParams.get('key');
  if (!validKey(key)) return new Response('bad', { status: 400 });
  const range = request.headers.get('Range');
  let opts = {};
  let rangeInfo = null;
  if (range) {
    const m = range.match(/bytes=(\d*)-(\d*)/);
    if (m) {
      const head = await env.HW.head(key);
      if (!head) return new Response('없음', { status: 404 });
      const total = head.size;
      let s = m[1] === '' ? total - Number(m[2]) : Number(m[1]);
      let e = m[1] === '' ? total - 1 : (m[2] === '' ? total - 1 : Number(m[2]));
      e = Math.min(e, total - 1);
      opts.range = { offset: s, length: e - s + 1 };
      rangeInfo = { s, e, total };
    }
  }
  const obj = await env.HW.get(key, opts);
  if (!obj) return new Response('없음', { status: 404 });
  const h = new Headers();
  h.set('Content-Type', obj.httpMetadata?.contentType || 'video/mp4');
  h.set('Accept-Ranges', 'bytes');
  h.set('Cache-Control', 'private, no-store');
  if (url.searchParams.get('dl')) {
    const fn = dec(obj.customMetadata?.filename) || 'video';
    h.set('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(fn)}`);
  }
  if (rangeInfo) {
    h.set('Content-Range', `bytes ${rangeInfo.s}-${rangeInfo.e}/${rangeInfo.total}`);
    h.set('Content-Length', String(rangeInfo.e - rangeInfo.s + 1));
    return new Response(obj.body, { status: 206, headers: h });
  }
  h.set('Content-Length', String(obj.size));
  return new Response(obj.body, { headers: h });
}

// ---------- 센텐스뱅크 서바이벌 ----------
const SV_MAX = 500 * 1024 * 1024;   // 영상 한 개 최대 500MB
const SV_ORIGINS = ['https://a28008005-sketch.github.io', 'https://staff.whalejinju.kr'];
const SV_LEVELS = ['Phonics', '240', '520', '860', '1240', '1680'];
/** 학부모 화면에 쓰는 이름: 파닉스는 '파닉스카드 Vol.3', 센텐스뱅크는 '센텐스뱅크 240 Vol.2' */
const svKind = rec => rec.level === 'Phonics'
  ? { name: '파닉스카드', badge: 'PHONICS CARD SURVIVAL', range: `Whale Phonics Vol.${rec.vol}`, what: '그림 카드를 보고 영어 단어로 바로 말하는 모습이에요.', unit: '단어' }
  : { name: '센텐스뱅크', badge: 'SENTENCE BANK SURVIVAL', range: `${rec.level} Vol.${rec.vol}`, what: '한글 카드를 보고 영어로 바로 말하는 모습이에요.', unit: '문장' };

function corsHeaders(request) {
  const o = request.headers.get('Origin') || '';
  if (!SV_ORIGINS.includes(o) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(o)) return null;
  return { 'Access-Control-Allow-Origin': o, 'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '86400', Vary: 'Origin' };
}
function withCors(request, res) {
  const h = corsHeaders(request);
  if (!h) return res;
  const out = new Response(res.body, res);
  Object.keys(h).forEach(k => out.headers.set(k, h[k]));
  return out;
}
const svId = () => `${Date.now()}_${rand(8)}`;
const validSvId = id => typeof id === 'string' && /^[0-9]+_[a-z0-9]+$/.test(id);
const svLogKey = id => `sv/log/${id}.json`;

/** 앱이 보낸 값을 정리합니다. 이름·레벨이 없으면 받지 않습니다. */
function svRecord(b) {
  const name = clean(b.name, 20);
  const level = String(b.level || '');
  const vol = Number(b.vol);
  if (!name) return { error: '학생 이름이 없습니다.' };
  if (!SV_LEVELS.includes(level) || !(vol >= 1 && vol <= 6)) return { error: '레벨·권이 올바르지 않습니다.' };
  const n = (v, max) => { const x = Number(v); return Number.isFinite(x) && x >= 0 && x <= max ? Math.round(x) : 0; };
  return {
    name, code: clean(b.code, 20), level, vol, unit: n(b.unit, 4),
    mode: b.mode === 'real' ? 'real' : 'practice',
    cards: n(b.cards, 200), done: n(b.done, 200), total: n(b.total, 200),
    durationSec: n(b.durationSec, 7200), answer: b.answer === 'hide' ? 'hide' : 'show',
    date: kstDay(), at: new Date().toISOString(), video: null, sent: [],
  };
}
async function svPut(env, rec) {
  const meta = JSON.stringify(rec);
  await env.HW.put(svLogKey(rec.id), meta, {
    httpMetadata: { contentType: 'application/json' },
    customMetadata: meta.length < 1800 ? { j: meta } : {},
  });
}
async function svGet(env, id) {
  if (!validSvId(id)) return null;
  const o = await env.HW.get(svLogKey(id));
  if (!o) return null;
  try { return JSON.parse(await o.text()); } catch (_) { return null; }
}
async function svSig(id, env) { return (await hmac('sv:' + id, env)).slice(0, 32); }

async function svPublic(request, env, url, p) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204 });
  if (p === '/hw/api/sv/log' && request.method === 'POST') {
    const rec = svRecord(await request.json().catch(() => ({})));
    if (rec.error) return json({ ok: false, error: rec.error }, 400);
    rec.id = svId();
    await svPut(env, rec);
    return json({ ok: true, id: rec.id });
  }
  if (p === '/hw/api/sv/start' && request.method === 'POST') {
    const b = await request.json().catch(() => ({}));
    const rec = svRecord(b);
    if (rec.error) return json({ ok: false, error: rec.error }, 400);
    const size = Number(b.size) || 0;
    const type = clean(b.type, 60).split(';')[0];
    if (!size || size > SV_MAX) return json({ ok: false, error: '영상 크기를 확인해 주세요. (최대 500MB)' }, 400);
    if (!/^video\/(mp4|webm|quicktime)$/.test(type)) return json({ ok: false, error: '영상 형식이 올바르지 않습니다.' }, 400);
    rec.id = svId();
    rec.mode = 'real';
    const key = `sv/vid/${rec.id}.${type === 'video/webm' ? 'webm' : type === 'video/quicktime' ? 'mov' : 'mp4'}`;
    const mpu = await env.HW.createMultipartUpload(key, { httpMetadata: { contentType: type } });
    rec.video = { key, size, type, ok: false };
    await svPut(env, rec);
    return json({ ok: true, id: rec.id, key, uploadId: mpu.uploadId, partSize: PART_SIZE });
  }
  if (p === '/hw/api/sv/part' && request.method === 'PUT') {
    const key = url.searchParams.get('key');
    const uploadId = url.searchParams.get('uploadId');
    const n = Number(url.searchParams.get('n'));
    if (!validSvVid(key) || !uploadId || !(n >= 1 && n <= 100)) return json({ ok: false, error: 'bad request' }, 400);
    const res = await env.HW.resumeMultipartUpload(key, uploadId).uploadPart(n, request.body);
    return json({ ok: true, partNumber: res.partNumber, etag: res.etag });
  }
  if (p === '/hw/api/sv/complete' && request.method === 'POST') {
    const b = await request.json().catch(() => ({}));
    const rec = await svGet(env, b.id);
    if (!rec || !rec.video || rec.video.key !== b.key || !b.uploadId || !Array.isArray(b.parts)) return json({ ok: false, error: 'bad request' }, 400);
    await env.HW.resumeMultipartUpload(b.key, b.uploadId).complete(b.parts.map(x => ({ partNumber: Number(x.partNumber), etag: String(x.etag) })));
    rec.video.ok = true;
    await svPut(env, rec);
    return json({ ok: true, id: rec.id });
  }
  return json({ ok: false, error: 'not found' }, 404);
}
function validSvVid(k) { return typeof k === 'string' && /^sv\/vid\/[0-9]+_[a-z0-9]+\.(mp4|webm|mov)$/.test(k); }

async function svList(env, url) {
  const days = Math.min(Number(url.searchParams.get('days')) || 90, 400);
  const from = new Date(Date.now() + 9 * 3600 * 1000 - days * 86400000).toISOString().slice(0, 10);
  const items = [];
  let cursor;
  do {
    const r = await env.HW.list({ prefix: 'sv/log/', cursor, limit: 1000, include: ['customMetadata'] });
    for (const o of r.objects) {
      let rec = null;
      try { rec = JSON.parse((o.customMetadata || {}).j || 'null'); } catch (_) { rec = null; }
      if (!rec) { try { rec = JSON.parse(await (await env.HW.get(o.key)).text()); } catch (_) { rec = null; } }
      if (!rec || String(rec.date) < from) continue;
      if (rec.video && rec.video.ok) { const sg = await svSig(rec.id, env); rec.share = `/hw/v/${rec.id}/${sg}`; rec.kpath = `${rec.id}/${sg}`; }
      items.push(rec);
    }
    cursor = r.truncated ? r.cursor : undefined;
  } while (cursor);
  items.sort((a, b) => (a.at < b.at ? 1 : -1));
  return json({ ok: true, items });
}
async function svSent(request, env) {
  const b = await request.json().catch(() => ({}));
  const rec = await svGet(env, b.id);
  if (!rec) return json({ ok: false, error: '기록을 찾지 못했습니다.' }, 404);
  rec.sent = (rec.sent || []).concat([{ at: new Date().toISOString(), to: clean(b.to, 40), how: clean(b.how, 10) }]).slice(-10);
  await svPut(env, rec);
  return json({ ok: true, rec });
}
async function svDelete(request, env) {
  const b = await request.json().catch(() => ({}));
  const rec = await svGet(env, b.id);
  if (!rec) return json({ ok: true });
  if (rec.video && validSvVid(rec.video.key)) await env.HW.delete(rec.video.key);
  await env.HW.delete(svLogKey(rec.id));
  return json({ ok: true });
}

/** 학부모용 영상 보기 — 주소의 서명이 맞아야만 열립니다. */
async function svWatch(request, env, url, p) {
  // 두 가지 주소 모양을 받습니다: /hw/v/<id>/<서명>[/video]  (알림톡 버튼용)  ·  /hw/sv/<id>[/video]?s=<서명>
  let m = p.match(/^\/hw\/v\/([0-9]+_[a-z0-9]+)\/([0-9a-f]{32})(\/video)?$/);
  let id, sig, isVideo;
  if (m) { id = m[1]; sig = m[2]; isVideo = !!m[3]; }
  else {
    m = p.match(/^\/hw\/sv\/([0-9]+_[a-z0-9]+)(\/video)?$/);
    if (m) { id = m[1]; sig = String(url.searchParams.get('s') || ''); isVideo = !!m[2]; }
  }
  if (!id || !env.ADMIN_PASSWORD) return new Response('Not found', { status: 404 });
  if (!safeEqual(sig, await svSig(id, env))) return new Response('링크가 올바르지 않습니다.', { status: 403, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  const rec = await svGet(env, id);
  if (!rec || !rec.video || !rec.video.ok) return new Response('영상을 찾지 못했습니다.', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  if (isVideo) {
    const range = request.headers.get('Range');
    const head = await env.HW.head(rec.video.key);
    if (!head) return new Response('없음', { status: 404 });
    const total = head.size;
    const h = new Headers({ 'Content-Type': rec.video.type || 'video/mp4', 'Accept-Ranges': 'bytes', 'Cache-Control': 'private, max-age=3600' });
    const r = range && range.match(/bytes=(\d*)-(\d*)/);
    if (r) {
      let s = r[1] === '' ? total - Number(r[2]) : Number(r[1]);
      let e = r[1] === '' || r[2] === '' ? total - 1 : Math.min(Number(r[2]), total - 1);
      const obj = await env.HW.get(rec.video.key, { range: { offset: s, length: e - s + 1 } });
      h.set('Content-Range', `bytes ${s}-${e}/${total}`);
      h.set('Content-Length', String(e - s + 1));
      return new Response(obj.body, { status: 206, headers: h });
    }
    const obj = await env.HW.get(rec.video.key);
    h.set('Content-Length', String(total));
    return new Response(obj.body, { headers: h });
  }
  const esc = t => String(t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const K = svKind(rec);
  const title = `${rec.name} · ${K.name} ${K.range}${rec.unit ? ' Unit ' + rec.unit : ''}`;
  const src = `/hw/v/${id}/${sig}/video`;
  return html(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>${esc(title)}</title>
<meta property="og:title" content="${esc(rec.name)}의 ${K.name} 서바이벌 영상"><meta property="og:description" content="고래영어 초전캠퍼스 · ${esc(rec.date)}">
<style>body{margin:0;background:#0b1f5e;color:#fff;font-family:"Pretendard","Apple SD Gothic Neo","Malgun Gothic",sans-serif}
.w{max-width:900px;margin:0 auto;padding:20px 16px 40px}.b{font-size:13px;letter-spacing:.12em;opacity:.75;font-weight:700}
h1{font-size:24px;margin:6px 0 4px}p{margin:0 0 16px;opacity:.85;font-size:14px;line-height:1.6}
video{width:100%;border-radius:12px;background:#000;display:block}.f{margin-top:18px;font-size:13px;opacity:.7}</style></head>
<body><div class="w"><div class="b">WHALE ENGLISH · ${K.badge}</div>
<h1>${esc(rec.name)}의 ${K.name} 서바이벌</h1>
<p>${esc(K.range)}${rec.unit ? ' · Unit ' + esc(rec.unit) : ''} · ${esc(rec.date)}${rec.done ? ' · ' + esc(rec.done) + K.unit + ' 도전' : ''}<br>${K.what} 많이 칭찬해 주세요!</p>
<video src="${src}" controls playsinline preload="metadata"></video>
<div class="f">고래영어 초전캠퍼스 · 010-3803-8335</div></div></body></html>`);
}

// ---------- 학원자료실 파일 ----------
// 브라우저 안에서 바로 열어도 안전한 종류만 화면에 띄웁니다. 나머지(HTML 등)는 내려받기로만 줍니다.
const RES_INLINE = /^(application\/pdf|image\/(png|jpe?g|gif|webp)|audio\/[a-z0-9.+-]+|video\/[a-z0-9.+-]+|text\/plain)$/;

async function resUpload(request, env, url) {
  const name = clean(url.searchParams.get('name'), 120) || 'file';
  const size = Number(request.headers.get('Content-Length')) || 0;
  if (size > RES_MAX) return json({ ok: false, error: '파일이 너무 큽니다. 95MB 이하 파일만 올릴 수 있어요.' }, 413);
  const type = clean(request.headers.get('Content-Type'), 100).split(';')[0] || 'application/octet-stream';
  const ext = (name.match(/\.([a-zA-Z0-9]{1,5})$/) || [, 'bin'])[1].toLowerCase();
  const key = `res/${Date.now()}_${rand(6)}.${ext}`;
  const obj = await env.HW.put(key, request.body, {
    httpMetadata: { contentType: type },
    customMetadata: { filename: enc(name), uploadedAt: new Date().toISOString() },
  });
  const stored = obj && obj.size != null ? obj.size : size;
  if (stored > RES_MAX) { await env.HW.delete(key); return json({ ok: false, error: '파일이 너무 큽니다. 95MB 이하 파일만 올릴 수 있어요.' }, 413); }
  return json({ ok: true, key, size: stored, type, name });
}

async function resDelete(request, env) {
  const b = await request.json().catch(() => ({}));
  if (!validResKey(b.key)) return json({ ok: false, error: 'bad key' }, 400);
  await env.HW.delete(b.key);
  return json({ ok: true });
}

async function resFile(env, url) {
  const key = url.searchParams.get('key');
  if (!validResKey(key)) return new Response('bad', { status: 400 });
  const obj = await env.HW.get(key);
  if (!obj) return new Response('파일을 찾지 못했습니다. 자료실에서 다시 올려 주세요.', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  const type = obj.httpMetadata?.contentType || 'application/octet-stream';
  const fn = dec(obj.customMetadata?.filename) || 'file';
  const inline = !url.searchParams.get('dl') && RES_INLINE.test(type);
  const h = new Headers();
  h.set('Content-Type', inline ? type : 'application/octet-stream');
  h.set('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(fn)}`);
  h.set('X-Content-Type-Options', 'nosniff');
  h.set('Cache-Control', 'private, no-store');
  if (obj.size != null) h.set('Content-Length', String(obj.size));
  return new Response(obj.body, { headers: h });
}

// ---------- 카카오 채널 숙제 ----------
/*
 * 카카오 챗봇(폴백 블록)에 연결한 스킬이 부르는 곳입니다.
 * 카카오는 '200 + 카카오 형식 JSON' 이 아니면 이유 없이 실패로 보므로, 문제가 있어도 카카오 형식으로 답합니다.
 * 카카오는 5초 안에 답을 받아야 해서, 파일 저장이 3초 안에 안 끝나면 먼저 답하고 저장은 뒤에서 마칩니다.
 */
const KAKAO_WAIT_MS = 3000;
// 카카오 스킬 주소 끝 열쇠의 SHA-256 지문. 열쇠를 바꾸려면 워커 비밀값 KAKAO_SKILL_KEY 를 넣으면 그쪽이 우선합니다.
const KAKAO_KEY_SHA256 = '6702d1fae83efb5612a0daf77657b821863e9dc5f8df6eeb4b9e4992542b108f';
const KAKAO_MAX = 95 * 1024 * 1024;
const KAKAO_HOST = /(^|\.)(kakaocdn\.net|kakao\.com|daumcdn\.net)$/i;
const MEDIA_EXT = /^(m4a|mp3|aac|wav|amr|ogg|3gp|caf|mp4|mov|m4v|webm|jpg|jpeg|png|gif|heic|webp)$/;
const TYPE_BY_EXT = {
  m4a: 'audio/mp4', mp3: 'audio/mpeg', aac: 'audio/aac', wav: 'audio/wav', amr: 'audio/amr', ogg: 'audio/ogg',
  '3gp': 'video/3gpp', caf: 'audio/x-caf', mp4: 'video/mp4', mov: 'video/quicktime', m4v: 'video/mp4', webm: 'video/webm',
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', heic: 'image/heic', webp: 'image/webp',
};
const EXT_BY_TYPE = {
  'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/m4a': 'm4a', 'audio/mpeg': 'mp3', 'audio/aac': 'aac', 'audio/wav': 'wav',
  'audio/x-wav': 'wav', 'audio/amr': 'amr', 'audio/ogg': 'ogg', 'video/mp4': 'mp4', 'video/quicktime': 'mov',
  'video/3gpp': '3gp', 'video/webm': 'webm', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif',
  'image/heic': 'heic', 'image/webp': 'webp',
};

async function kakao(request, env, ctx, p, url) {
  const isPost = request.method === 'POST';
  const fail = (msg, status) => isPost ? kReply([kText('[설정 확인] ' + msg)]) : json({ ok: false, error: msg }, status);
  // 열쇠 확인: 워커 비밀값(KAKAO_SKILL_KEY)이 있으면 그것과, 없으면 코드에 적어 둔 '열쇠의 지문(SHA-256)'과 맞춥니다.
  // 지문만으로는 열쇠를 거꾸로 알아낼 수 없어서, 저장소가 공개돼 있어도 안전합니다.
  let key = p.slice('/hw/kakao/'.length);
  try { key = decodeURIComponent(key); } catch (_) { /* 그대로 비교 */ }
  key = key.trim();
  const secret = kakaoSecret(env);
  const keyOk = secret ? safeEqual(key, secret)
    : safeEqual(await sha256hex(key), String((env && env.KAKAO_SKILL_KEY_SHA256) || KAKAO_KEY_SHA256));
  console.log('[kakao] ' + request.method + ' 도착 · 열쇠 ' + (keyOk ? '맞음' : '틀림') + (secret ? ' (비밀값)' : ' (지문)'));
  if (!keyOk) return fail('스킬 주소 끝의 열쇠가 워커의 KAKAO_SKILL_KEY 와 다릅니다.', 404);
  if (!isPost) return json({ ok: true, message: '카카오 숙제 창구가 열려 있습니다. 카카오 스킬 주소로 쓰세요.' });

  let body = null;
  try { body = JSON.parse(await request.text()); } catch (_) { /* 아래에서 안내 */ }
  if (!body || typeof body !== 'object') return kReply([kText('메시지를 읽지 못했어요. 한 번만 다시 보내 주세요.')]);
  try {
    return await kakaoHandle(body, env, ctx, url.origin);
  } catch (e) {
    console.log('[kakao] 오류 ' + (e && e.stack || e));
    return kReply([kText('잠시 문제가 생겼어요. 조금 뒤에 다시 보내 주세요.')]);
  }
}

async function kakaoHandle(body, env, ctx, origin) {
  const req = body.userRequest || {};
  const uid = String((req.user || {}).id || '');
  const who = uid ? await kakaoHash(uid) : '';
  const utter = String(req.utterance || '').trim();
  const info = who ? await kakaoUser(env, who) : null;
  const name = (info && info.student) || '';
  const uploadLink = origin + '/hw' + (name ? '?name=' + encodeURIComponent(name) : '');
  const askName = '처음 보내 주셨다면 아이 이름을 한 번만 알려 주세요.\n예) 이름 김고래';

  // 1) 이름 등록: "이름 김고래" / "등록 김고래"
  // "이름이 뭐예요?" 같은 글까지 등록으로 보지 않도록, 낱말 뒤에 띄어쓰기나 : 가 있어야 합니다.
  const m = utter.match(/^(?:이름|등록)(?:\s*[:：]\s*|\s+)(.+)$/);
  if (m && who) {
    const student = clean(m[1].replace(/\s*학생\s*$/, ''), 20);
    if (!/^[가-힣A-Za-z][가-힣A-Za-z ]{1,14}$/.test(student)) return kReply([kText('아이 이름만 다시 알려 주세요.\n예) 이름 김고래')]);
    await env.HW.put('kakao/users/' + who + '.json', JSON.stringify({ student, at: new Date().toISOString() }), {
      httpMetadata: { contentType: 'application/json' },
    });
    return kReply([kText(student + ' 학생으로 등록했어요 😊\n이제 숙제 녹음·영상·사진을 이 채팅방에 보내 주시면 자동으로 접수됩니다.\n\n이름이 바뀌었거나 형제가 보낼 때는 다시 "이름 ○○○" 이라고 보내 주세요.')]);
  }

  // 2) 파일: 카카오 서버 주소로 온 사진·녹음·영상
  const urls = kakaoMediaUrls(body);
  if (urls.length) {
    const job = Promise.all(urls.slice(0, 5).map(u => saveKakaoFile(env, u, who, name).catch(e => {
      console.log('[kakao] 파일 저장 실패 ' + (e && e.message || e)); return null;
    })));
    const done = await Promise.race([job, new Promise(r => setTimeout(() => r(null), KAKAO_WAIT_MS))]);
    if (!done) {
      if (ctx && ctx.waitUntil) ctx.waitUntil(job);
    } else if (!done.some(Boolean)) {
      return kReply([kCard('파일을 받지 못했어요 😢', '번거로우시겠지만 아래 버튼을 눌러 숙제를 올려 주세요.', '숙제 올리기', uploadLink)]);
    }
    const head = name ? name + ' 학생 숙제 잘 받았어요 😊' : '숙제 파일 잘 받았어요 😊';
    return kReply([kText(head + '\n선생님이 확인하고 피드백 드릴게요.' + (name ? '' : '\n\n' + askName))]);
  }

  // 3) 글: 선생님이 원생관리에서 볼 수 있게 남기고, 안내로 답합니다.
  if (utter && who) {
    const text = utter.slice(0, 2000);
    await env.HW.put(`sub/${kstDay()}/${Date.now()}_${rand(6)}.txt`, text, {
      httpMetadata: { contentType: 'text/plain; charset=utf-8' },
      customMetadata: {
        student: enc(name), cls: '', memo: enc(text.slice(0, 200)), filename: enc('카카오 메시지'),
        size: String(new TextEncoder().encode(text).length), submittedAt: new Date().toISOString(),
        via: 'kakao', kakao: who,
      },
    });
  }
  return kReply([kCard(
    '메시지 잘 받았어요.',
    '선생님이 확인하고 답장드릴게요.\n숙제 녹음·영상·사진은 이 채팅방에 바로 보내 주시거나 아래 버튼으로 올려 주세요.' + (name ? '' : '\n\n' + askName),
    '숙제 올리기', uploadLink
  )]);
}

/** 카카오 서버(kakaocdn 등)에 있는 파일 주소만 모읍니다. 학부모가 붙여 넣은 다른 사이트 주소는 글로 봅니다. */
function kakaoMediaUrls(body) {
  const req = body.userRequest || {};
  const action = body.action || {};
  const found = [];
  const walk = (v) => {
    if (typeof v === 'string') (v.match(/https?:\/\/[^\s"'<>,()]+/g) || []).forEach(u => found.push(u));
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') Object.keys(v).forEach(k => walk(v[k]));
  };
  walk(req.utterance); walk(req.params); walk(action.params); walk(action.detailParams);
  const out = [];
  for (const u of found) {
    let host = '';
    try { host = new URL(u).hostname; } catch (_) { continue; }
    if (KAKAO_HOST.test(host) && !out.includes(u)) out.push(u);
  }
  return out;
}

async function saveKakaoFile(env, u, who, name) {
  const res = await fetch(u, { redirect: 'follow' });
  if (!res.ok) { console.log('[kakao] 파일 응답 ' + res.status + ' ' + u); return null; }
  const type = String(res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  const urlExt = ((u.split('?')[0].match(/\.([a-z0-9]{2,5})$/i) || [])[1] || '').toLowerCase();
  const media = /^(audio|video|image)\//.test(type);
  const loose = !type || type === 'application/octet-stream' || type === 'binary/octet-stream';
  if (!media && !(loose && MEDIA_EXT.test(urlExt))) { console.log('[kakao] 파일 아님 ' + type + ' ' + u); return null; }
  if (Number(res.headers.get('content-length')) > KAKAO_MAX) return null;
  const buf = await res.arrayBuffer();
  if (!buf.byteLength || buf.byteLength > KAKAO_MAX) return null;

  const ext = (MEDIA_EXT.test(urlExt) ? urlExt : EXT_BY_TYPE[type]) || 'bin';
  const contentType = media ? type : (TYPE_BY_EXT[ext] || 'application/octet-stream');
  const kind = contentType.startsWith('audio/') ? '녹음' : contentType.startsWith('image/') ? '사진' : '영상';
  const key = `sub/${kstDay()}/${Date.now()}_${rand(6)}.${ext}`;
  await env.HW.put(key, buf, {
    httpMetadata: { contentType },
    customMetadata: {
      student: enc(name), cls: '', memo: enc('카카오톡으로 보냄'), filename: enc('카카오_' + kind + '.' + ext),
      size: String(buf.byteLength), submittedAt: new Date().toISOString(), via: 'kakao', kakao: who,
    },
  });
  return key;
}

/** 카카오 사용자 번호는 그대로 두지 않고 줄여서 씁니다. */
async function kakaoHash(uid) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('gorae-kakao:' + uid));
  return [...new Uint8Array(d)].slice(0, 12).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function kakaoUser(env, who) {
  if (!/^[0-9a-f]{24}$/.test(String(who))) return null;
  const obj = await env.HW.get('kakao/users/' + who + '.json');
  if (!obj) return null;
  try { return JSON.parse(await new Response(obj.body).text()); } catch (_) { return null; }
}

async function sha256hex(text) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join('');
}

/** 대시보드에 붙여 넣다 이름 끝에 공백이 들어가거나 소문자로 넣은 경우도 찾아 씁니다. */
function kakaoSecret(env) {
  if (!env) return '';
  if (env.KAKAO_SKILL_KEY) return String(env.KAKAO_SKILL_KEY).trim();
  const k = Object.keys(env).find(n => n.replace(/\s+/g, '').toUpperCase() === 'KAKAO_SKILL_KEY');
  return k && env[k] ? String(env[k]).trim() : '';
}

function kText(t) { return { simpleText: { text: String(t).slice(0, 990) } }; }
function kCard(title, description, label, link) {
  return { textCard: { title: title.slice(0, 50), description: description.slice(0, 400),
    buttons: [{ action: 'webLink', label, webLinkUrl: link }] } };
}
function kReply(outputs) { return json({ version: '2.0', template: { outputs } }); }

// ---------- 유틸 ----------
// ---------- 웨일튜터 학습현황 자동 가져오기 ----------
const WT_BASE = 'https://whale.cloubot.com';
const WT_STAT = '/api/study/getStudyStat?user_idx=43294969&user_type=2&user_org_idx=dalnim0690&campus_number=699&class_idx=&student=&date=';
const WT_LIST = '/api/user/campusStudentListAll2/dalnim0690?page=all';
const WT_BACKFILL = 120;          // 처음 한 번은 120일치를 채웁니다
const kstDate = (ms) => new Date(ms + 9 * 3600 * 1000).toISOString().slice(0, 10);
const isWeekday = (ymd) => { const d = new Date(ymd + 'T12:00:00Z').getUTCDay(); return d > 0 && d < 6; };
const wtNum = (v) => (v == null || v === '' ? null : Number(v));

async function wtFetchJson(path) {
  const r = await fetch(WT_BASE + path, { headers: { accept: 'application/json', 'user-agent': 'gorae-staff/1.0' }, cf: { cacheTtl: 0 } });
  if (!r.ok) throw new Error('웨일튜터 응답 ' + r.status);
  return r.json();
}
async function wtDay(env, date) {
  const j = await wtFetchJson(WT_STAT + date);
  if (j && j.success === false) throw new Error('웨일튜터: ' + String(j.msg || '거절'));
  const rows = ((j && j.data) || []).map(x => {
    const t = String(x.ai_test || '-').split('/');
    return [x.id, x.lesson, t.length > 1 ? +t[0] : -1, t.length > 1 ? +t[1] : 0, +x.dt || 0, x.student_book_check == '1' ? 1 : 0,
      wtNum(x.voca_score), wtNum(x.key_sentences), String(x.indatetime || '').slice(11, 16)];
  });
  await env.HW.put('wt/day/' + date + '.json', JSON.stringify({ date, at: new Date().toISOString(), rows }), { httpMetadata: { contentType: 'application/json' } });
  return rows.length;
}
async function wtReadJson(env, key) {
  const o = await env.HW.get(key);
  if (!o) return null;
  try { return JSON.parse(await o.text()); } catch (_) { return null; }
}
/** 오늘(+ 아직 마무리 안 된 어제)과, 처음이면 지난 120일을 받아 둡니다. */
async function wtRefresh(env, opts) {
  const now = Date.now(), today = kstDate(now);
  const hour = new Date(now + 9 * 3600 * 1000).getUTCHours();
  if (opts.cron && (!isWeekday(today) || hour < 13 || hour > 21)) return { ok: true, skipped: true };
  const meta = (await wtReadJson(env, 'wt/meta.json')) || {};
  const dates = [today];
  if (meta.final !== kstDate(now - 864e5)) dates.push(kstDate(now - 864e5));   // 어제 기록 마무리
  // 처음 채우기는 한 번에 40일씩 (무료 요금제는 한 번에 바깥 요청 50개까지라서) — 10분마다 이어서 채웁니다
  const bf = meta.bf || 2, bfEnd = Math.min(WT_BACKFILL, bf + 39);
  if (bf <= WT_BACKFILL) for (let i = bf; i <= bfEnd; i++) dates.push(kstDate(now - i * 864e5));
  const want = dates.filter(isWeekday);
  let rows = 0, done = 0;
  for (let i = 0; i < want.length; i += 6) {
    const got = await Promise.all(want.slice(i, i + 6).map(d => wtDay(env, d).then(n => { done++; return n; }).catch(() => 0)));
    rows += got.reduce((a, b) => a + b, 0);
  }
  try {
    const L = await wtFetchJson(WT_LIST);
    let list = L && L.data; list = Array.isArray(list) ? list : (list && list.list) || [];
    if (list.length) await env.HW.put('wt/students.json', JSON.stringify(list.map(s => [s.student_id, s.student_name || s.name, s.current_bookcode || '', s.current_short_name || '', String(s.book_start_datetime || '').slice(0, 10)])), { httpMetadata: { contentType: 'application/json' } });
  } catch (_) { /* 명단은 다음 번에 */ }
  const next = { at: new Date().toISOString(), final: meta.final, bf: bf <= WT_BACKFILL && done >= want.length - 2 ? bfEnd + 1 : bf, days: done, rows };
  if (hour >= 21 || !isWeekday(today)) next.final = today;
  else if (meta.final !== kstDate(now - 864e5)) next.final = kstDate(now - 864e5);
  await env.HW.put('wt/meta.json', JSON.stringify(next), { httpMetadata: { contentType: 'application/json' } });
  return { ok: true, at: next.at, days: done, rows };
}
/** 학습 현황판이 가져가는 묶음 (북마크와 같은 모양) */
async function wtGet(env, url) {
  const since = /^\d{4}-\d{2}-\d{2}$/.test(url.searchParams.get('since') || '') ? url.searchParams.get('since') : kstDate(Date.now() - WT_BACKFILL * 864e5);
  const meta = (await wtReadJson(env, 'wt/meta.json')) || {};
  const students = (await wtReadJson(env, 'wt/students.json')) || [];
  const days = {};
  let cursor;
  do {
    const r = await env.HW.list({ prefix: 'wt/day/', cursor, limit: 1000 });
    const keys = r.objects.map(o => o.key).filter(k => k.slice(7, 17) >= since);
    const got = await Promise.all(keys.map(k => wtReadJson(env, k)));
    got.forEach(d => { if (d && d.rows && d.rows.length) days[d.date] = d.rows; });
    cursor = r.truncated ? r.cursor : undefined;
  } while (cursor);
  return json({ ok: true, type: 'gorae-wt', v: 1, at: meta.at || '', auto: true, students, days });
}

function json(o, status = 200) {
  return new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
}
function html(s) {
  return new Response(s, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
}
function clean(v, n) { return String(v || '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n); }
function enc(s) { return encodeURIComponent(s || ''); }
function dec(s) { try { return decodeURIComponent(s || ''); } catch (_) { return s || ''; } }
function kstDay() { return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10); }
function rand(n) { const a = crypto.getRandomValues(new Uint8Array(n)); return [...a].map(x => (x % 36).toString(36)).join(''); }
function validKey(k) { return typeof k === 'string' && /^sub\/\d{4}-\d{2}-\d{2}\/[0-9]+_[a-z0-9]+\.[a-z0-9]{1,5}$/.test(k); }
function validResKey(k) { return typeof k === 'string' && /^res\/[0-9]+_[a-z0-9]+\.[a-z0-9]{1,5}$/.test(k); }
function safeEqual(a, b) {
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
  if (x.length !== y.length) return false;
  let r = 0; for (let i = 0; i < x.length; i++) r |= x[i] ^ y[i];
  return r === 0;
}

const STYLE = `
:root{--navy:#1f3a5f;--sky:#3aa3d9;--bg:#f4f7fb;--card:#fff;--text:#1b2430;--muted:#6b7684;--ok:#1e8e5a;--line:#e3e8ef}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font-family:-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Noto Sans KR",sans-serif;line-height:1.55}
.wrap{max-width:560px;margin:0 auto;padding:20px 16px 48px}
.brand{display:flex;align-items:center;gap:8px;color:var(--navy);font-weight:700;margin:4px 0 16px}
.brand .dot{width:10px;height:10px;border-radius:50%;background:var(--sky)}
.card{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:20px}
h1{font-size:21px;margin:0 0 6px}p.sub{margin:0 0 18px;color:var(--muted);font-size:14px}
label{display:block;font-size:14px;font-weight:600;margin:14px 0 6px}
input[type=text],textarea{width:100%;padding:12px;border:1px solid var(--line);border-radius:10px;font-size:16px;font-family:inherit;background:#fff}
textarea{min-height:70px;resize:vertical}
.file{border:2px dashed #c9d6e6;border-radius:12px;padding:18px;text-align:center;color:var(--muted);font-size:14px;cursor:pointer;background:#fafcff}
.file strong{display:block;color:var(--navy);font-size:15px;margin-bottom:4px}
button{width:100%;margin-top:18px;padding:14px;border:0;border-radius:12px;background:var(--navy);color:#fff;font-size:16px;font-weight:700;font-family:inherit}
button:disabled{opacity:.5}
.bar{height:10px;background:#e6edf5;border-radius:6px;overflow:hidden;margin-top:14px;display:none}.bar i{display:block;height:100%;width:0;background:var(--sky);transition:width .2s}
.msg{margin-top:12px;font-size:14px;color:var(--muted);min-height:20px}
.done{text-align:center;padding:10px 0}.done .ic{font-size:42px}.done h2{margin:6px 0;color:var(--ok);font-size:20px}
.small{font-size:12px;color:var(--muted);margin-top:14px}
`;

function submitPage() {
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>숙제 영상 제출 · 고래영어학원</title><style>${STYLE}</style></head><body><div class="wrap">
<div class="brand"><span class="dot"></span>고래영어학원</div>
<div class="card" id="form">
<h1>숙제 영상 제출</h1>
<p class="sub">아이 이름을 적고 숙제 영상을 골라 주세요. 올리는 동안 이 화면을 닫지 말아 주세요.</p>
<label for="student">학생 이름</label><input id="student" type="text" placeholder="예) 김고래" autocomplete="off">
<label for="cls">반 · 요일 <span style="font-weight:400;color:var(--muted)">(선택)</span></label><input id="cls" type="text" placeholder="예) 월수금 4시반">
<label for="memo">선생님께 한마디 <span style="font-weight:400;color:var(--muted)">(선택)</span></label><textarea id="memo" placeholder="예) 3과 읽기 숙제입니다"></textarea>
<label>숙제 영상</label>
<div class="file" id="pick"><strong>여기를 눌러 영상 선택</strong><span id="fname">동영상 또는 녹음 파일 (최대 1GB)</span></div>
<input id="f" type="file" accept="video/*,audio/*" style="display:none">
<button id="go">제출하기</button>
<div class="bar" id="bar"><i id="fill"></i></div>
<div class="msg" id="msg"></div>
</div>
<div class="card done" id="done" style="display:none"><div class="ic">✅</div><h2 id="doneTitle">제출되었습니다</h2><p class="sub" style="margin:0">선생님이 확인 후 피드백 드릴게요. 감사합니다!</p><button id="again" style="background:#fff;color:var(--navy);border:1px solid var(--line)">다른 영상 더 올리기</button></div>
<p class="small">제출된 영상은 학원 수업 확인용으로만 사용되며 ${KEEP_DAYS}일 후 자동으로 삭제됩니다.</p>
</div>
<script>
const $=id=>document.getElementById(id);let file=null;
const qs=new URLSearchParams(location.search);if(qs.get('name'))$('student').value=qs.get('name');
try{if(!$('student').value)$('student').value=localStorage.getItem('hw_student')||'';$('cls').value=localStorage.getItem('hw_cls')||''}catch(e){}
$('pick').onclick=()=>$('f').click();
$('f').onchange=e=>{file=e.target.files[0]||null;$('fname').textContent=file?file.name+' · '+(file.size/1048576).toFixed(1)+'MB':'동영상 또는 녹음 파일 (최대 1GB)'};
$('again').onclick=()=>{file=null;$('f').value='';$('fname').textContent='동영상 또는 녹음 파일 (최대 1GB)';$('memo').value='';$('done').style.display='none';$('form').style.display='';$('bar').style.display='none';$('fill').style.width='0';$('msg').textContent='';};
function say(t){$('msg').textContent=t}
async function post(u,b){const r=await fetch(u,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b)});const j=await r.json().catch(()=>({ok:false,error:'서버 응답 오류'}));if(!r.ok||!j.ok)throw new Error(j.error||'오류가 발생했어요');return j}
$('go').onclick=async()=>{
 const student=$('student').value.trim();if(!student)return say('학생 이름을 입력해 주세요.');if(!file)return say('영상을 선택해 주세요.');
 try{localStorage.setItem('hw_student',student);localStorage.setItem('hw_cls',$('cls').value.trim())}catch(e){}
 $('go').disabled=true;$('bar').style.display='block';say('올리는 중이에요…');let st=null;
 try{
  st=await post('/hw/api/start',{student,cls:$('cls').value,memo:$('memo').value,filename:file.name,size:file.size,type:file.type});
  const ps=st.partSize,n=Math.ceil(file.size/ps),parts=[];
  for(let i=0;i<n;i++){
   const chunk=file.slice(i*ps,Math.min(file.size,(i+1)*ps));let ok=false,err;
   for(let t=0;t<3&&!ok;t++){try{const r=await fetch('/hw/api/part?key='+encodeURIComponent(st.key)+'&uploadId='+encodeURIComponent(st.uploadId)+'&n='+(i+1),{method:'PUT',body:chunk});const j=await r.json();if(!j.ok)throw new Error(j.error);parts.push({partNumber:j.partNumber,etag:j.etag});ok=true}catch(e){err=e;await new Promise(r=>setTimeout(r,1500))}}
   if(!ok)throw err||new Error('업로드 실패');
   const pct=Math.round((i+1)/n*100);$('fill').style.width=pct+'%';say('올리는 중이에요… '+pct+'%');
  }
  await post('/hw/api/complete',{key:st.key,uploadId:st.uploadId,parts});
  $('doneTitle').textContent=student+' 학생 숙제가 제출되었습니다';$('form').style.display='none';$('done').style.display='';
 }catch(e){say('제출이 안 됐어요: '+e.message+' 잠시 후 다시 시도해 주세요.');if(st)post('/hw/api/abort',{key:st.key,uploadId:st.uploadId}).catch(()=>{})}
 finally{$('go').disabled=false}
};
</script></body></html>`;
}

function adminPage() {
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>숙제 제출 기록 · 고래영어학원</title><style>${STYLE}
.wrap{max-width:900px}.top{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:12px}
select,.btn{padding:8px 12px;border:1px solid var(--line);border-radius:10px;background:#fff;font-size:14px;font-family:inherit;color:var(--text);text-decoration:none}
.day{font-weight:700;color:var(--navy);margin:20px 0 8px}.row{background:#fff;border:1px solid var(--line);border-radius:12px;padding:12px 14px;margin-bottom:8px;display:flex;gap:12px;align-items:center;flex-wrap:wrap}
.row .who{flex:1;min-width:180px}.row .who b{font-size:16px}.row .meta{color:var(--muted);font-size:13px}.row.ck{opacity:.6}
.row label{display:flex;align-items:center;gap:6px;margin:0;font-weight:500;font-size:14px}
video{width:100%;max-height:60vh;border-radius:10px;background:#000;margin-top:8px}
.stat{color:var(--muted);font-size:14px}
</style></head><body><div class="wrap">
<div class="brand"><span class="dot"></span>고래영어학원 · 숙제 제출 기록</div>
<div class="top"><div class="stat" id="stat">불러오는 중…</div>
<div><input id="q" type="text" placeholder="학생 이름 검색" style="width:150px;padding:8px 12px;font-size:14px"> <select id="days"><option value="1">오늘</option><option value="7" selected>최근 7일</option><option value="30">최근 30일</option></select></div></div>
<div id="list"></div>
<p class="small">제출 링크: <b>${'${location.origin}'}/hw</b> · 영상은 ${KEEP_DAYS}일 후 자동 삭제됩니다.</p>
</div>
<script>
const $=id=>document.getElementById(id);let items=[];
document.querySelector('.small b').textContent=location.origin+'/hw';
async function load(){$('stat').textContent='불러오는 중…';const r=await fetch('/hw/admin/api/list?days='+$('days').value);const j=await r.json();items=j.items||[];draw()}
function esc(s){return String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function t(d){const x=new Date(d);return x.toLocaleString('ko-KR',{timeZone:'Asia/Seoul',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'})}
function draw(){const q=$('q').value.trim();const list=items.filter(i=>!q||i.student.includes(q));
 const unchecked=list.filter(i=>!i.checked).length;$('stat').textContent='제출 '+list.length+'건 · 미확인 '+unchecked+'건';
 let h='',day='';for(const i of list){const d=i.key.split('/')[1];if(d!==day){day=d;h+='<div class="day">'+d+'</div>'}
 const src='/hw/admin/file?key='+encodeURIComponent(i.key);
 h+='<div class="row'+(i.checked?' ck':'')+'"><div class="who"><b>'+esc(i.student)+'</b> <span class="meta">'+esc(i.cls)+'</span><div class="meta">'+t(i.uploaded)+' · '+(i.size/1048576).toFixed(1)+'MB'+(i.memo?' · “'+esc(i.memo)+'”':'')+'</div></div>'+
 '<a class="btn" href="#" data-play="'+esc(i.key)+'">▶ 보기</a><a class="btn" href="'+src+'&dl=1">저장</a>'+
 '<label><input type="checkbox" data-ck="'+esc(i.key)+'" '+(i.checked?'checked':'')+'> 확인</label><div style="width:100%" id="v_'+esc(i.key).replace(/[^a-z0-9]/gi,'')+'"></div></div>'}
 $('list').innerHTML=h||'<p class="stat">제출된 숙제가 없습니다.</p>'}
document.addEventListener('click',e=>{const k=e.target.dataset&&e.target.dataset.play;if(!k)return;e.preventDefault();const box=document.getElementById('v_'+k.replace(/[^a-z0-9]/gi,''));box.innerHTML=box.innerHTML?'':'<video controls playsinline autoplay src="/hw/admin/file?key='+encodeURIComponent(k)+'"></video>'});
document.addEventListener('change',async e=>{const k=e.target.dataset&&e.target.dataset.ck;if(!k)return;await fetch('/hw/admin/api/check',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({key:k,checked:e.target.checked})});const it=items.find(i=>i.key===k);if(it)it.checked=e.target.checked;draw()});
$('days').onchange=load;$('q').oninput=draw;load();
</script></body></html>`;
}
