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
// 카카오 채널 숙제 (카카오 챗봇 스킬이 부르는 곳, 비밀값 KAKAO_SKILL_KEY 필요)
//   POST /hw/kakao/<KAKAO_SKILL_KEY>   채널로 온 파일은 sub/ 에 숙제로 저장, 글은 '카카오 메시지'로 저장, 자동 답장
//   학부모가 "이름 김고래" 라고 한 번 보내면 그 카카오 계정 = 그 학생으로 기억합니다 (kakao/users/ 폴더, 지우지 않음)

const PART_SIZE = 10 * 1024 * 1024; // 10MB 조각
const MAX_SIZE = 1024 * 1024 * 1024; // 1GB
const KEEP_DAYS = 30;
const RES_MAX = 95 * 1024 * 1024; // 자료 파일 한 개 최대 크기 (워커가 한 번에 받을 수 있는 한도 100MB 아래)

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const p = url.pathname.replace(/\/+$/, '') || '/';
    try {
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
  if (!env.KAKAO_SKILL_KEY) return fail('gorae-homework 워커에 KAKAO_SKILL_KEY 가 없습니다.', 503);
  let key = p.slice('/hw/kakao/'.length);
  try { key = decodeURIComponent(key); } catch (_) { /* 그대로 비교 */ }
  const keyOk = safeEqual(key.trim(), String(env.KAKAO_SKILL_KEY).trim());
  console.log('[kakao] ' + request.method + ' 도착 · 열쇠 ' + (keyOk ? '맞음' : '틀림'));
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

function kText(t) { return { simpleText: { text: String(t).slice(0, 990) } }; }
function kCard(title, description, label, link) {
  return { textCard: { title: title.slice(0, 50), description: description.slice(0, 400),
    buttons: [{ action: 'webLink', label, webLinkUrl: link }] } };
}
function kReply(outputs) { return json({ version: '2.0', template: { outputs } }); }

// ---------- 유틸 ----------
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
