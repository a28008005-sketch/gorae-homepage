/* 테스트용 가짜 백엔드 — Supabase records 테이블의 동작만 흉내냅니다. */
const http = require('http');
const rows = new Map();          // "kind:id" -> {kind,id,data,deleted,updated_at}
let seq = 0;
let failing = false;

function stamp() {               // 서버 시계 (같은 ms 충돌 방지용 시퀀스 포함)
  seq++;
  return new Date(Date.now() + seq).toISOString();
}

function body(req) {
  return new Promise(r => { let b = ''; req.on('data', c => b += c); req.on('end', () => r(b ? JSON.parse(b) : {})); });
}

http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Access-Control-Allow-Methods', '*');
  if (req.method === 'OPTIONS') return res.end();
  const url = new URL(req.url, 'http://x');

  if (url.pathname === '/fail') { failing = url.searchParams.get('on') === '1'; res.end('ok'); return; }
  if (failing) { res.statusCode = 500; res.end('{"error":"down"}'); return; }

  if (url.pathname === '/signin') {
    const b = await body(req);
    if (b.password !== 'test1234') { res.statusCode = 401; return res.end(JSON.stringify({ error: 'Invalid login credentials' })); }
    return res.end(JSON.stringify({ user: { email: b.email, id: 'u-' + b.email } }));
  }
  if (url.pathname === '/upsert') {
    const b = await body(req);
    (b.rows || []).forEach(r => {
      rows.set(r.kind + ':' + r.id, { kind: r.kind, id: r.id, data: r.data, deleted: !!r.deleted, updated_at: stamp() });
    });
    return res.end(JSON.stringify({ ok: true, count: (b.rows || []).length }));
  }
  if (url.pathname === '/since') {
    const ts = url.searchParams.get('ts') || '';
    const out = [...rows.values()].filter(r => !ts || r.updated_at >= ts);
    return res.end(JSON.stringify(out));
  }
  if (url.pathname === '/reset') { rows.clear(); failing = false; return res.end('ok'); }
  if (url.pathname === '/count') return res.end(JSON.stringify({ rows: rows.size }));
  res.statusCode = 404; res.end('{}');
}).listen(8902, () => console.log('fake backend on 8902'));
