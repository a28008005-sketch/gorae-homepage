// 숙제 영상·학원자료실 파일 확인용: 원생관리 정적 파일 + gorae-homework 워커(가짜 R2) — 8899 포트
// 실행: node tests/hwvideo-server.mjs &  →  node tests/hwvideo.test.mjs
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import worker from '../worker/homework-worker.js';

const ROOT = new URL('..', import.meta.url).pathname;
const store = new Map(); const mp = {};
const HW = {
  createMultipartUpload: async (k, o) => { mp[k] = { o, parts: {} }; return { uploadId: 'u-' + k }; },
  resumeMultipartUpload: (k) => ({
    uploadPart: async (n, b) => { mp[k].parts[n] = Buffer.from(await new Response(b).arrayBuffer()); return { partNumber: n, etag: 'e' + n }; },
    complete: async (ps) => { store.set(k, { body: Buffer.concat(ps.map(p => mp[k].parts[p.partNumber])), meta: mp[k].o, uploaded: new Date() }); },
    abort: async () => {},
  }),
  list: async ({ prefix }) => ({ truncated: false, objects: [...store.keys()].filter(k => k.startsWith(prefix)).map(k => ({ key: k, size: store.get(k).body.length, uploaded: store.get(k).uploaded, customMetadata: store.get(k).meta?.customMetadata })) }),
  put: async (k, b, o) => { const body = b == null || typeof b === 'string' ? Buffer.from(b || '') : Buffer.from(await new Response(b).arrayBuffer()); store.set(k, { body, meta: o || {}, uploaded: new Date() }); return { size: body.length }; },
  delete: async (k) => store.delete(k),
  head: async (k) => store.has(k) ? { size: store.get(k).body.length } : null,
  get: async (k, o) => { const s = store.get(k); if (!s) return null; let b = s.body; if (o?.range) b = b.subarray(o.range.offset, o.range.offset + o.range.length); return { body: b, size: s.body.length, httpMetadata: s.meta?.httpMetadata, customMetadata: s.meta?.customMetadata }; },
};
// 원생관리 문지기 흉내: gorae_staff=ok 쿠키면 로그인된 것으로 봅니다.
const GATE = { fetch: async (u, init) => new Response('{}', { status: /gorae_staff=ok/.test((init && init.headers && init.headers.cookie) || '') ? 503 : 401 }) };
const env = { HW, GATE, ADMIN_PASSWORD: 'pw-test' };
const types = { '.pdf': 'application/pdf', '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json' };

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost:8899');
  if (url.pathname.startsWith('/hw')) {
    const chunks = []; for await (const c of req) chunks.push(c);
    const body = chunks.length ? Buffer.concat(chunks) : undefined;
    const r = await worker.fetch(new Request(url, { method: req.method, headers: req.headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : body }), env);
    res.writeHead(r.status, Object.fromEntries(r.headers));
    res.end(Buffer.from(await r.arrayBuffer()));
    return;
  }
  let f = path.join(ROOT, decodeURIComponent(url.pathname));
  if (f.endsWith('/')) f += 'index.html';
  fs.readFile(f, (e, d) => {
    if (e) { res.writeHead(404); res.end('nf'); return; }
    res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' });
    res.end(d);
  });
}).listen(8899, () => console.log('dev on 8899'));
