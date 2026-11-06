/* ===== 센텐스뱅크 서바이벌 기록 =====
 *
 * 학습패드 앱(dailytest/cards/survival.html)에서 아이가 연습하거나 실전 녹화를 하면
 * gorae-homework 워커(R2 의 sv/ 폴더)에 기록이 쌓입니다. 이 화면은 그 기록을 학생별로 보여 주고,
 * 실전 영상은 [학부모 전송] 한 번으로 학부모님 휴대폰에 문자(영상 링크)로 보냅니다.
 *  - 기록 목록·영상: /hw/admin/api/sv/*  (원생관리 로그인 쿠키로 통과)
 *  - 문자 발송:     /api/notify/message  (gorae-staff-gate 워커 → 솔라피 문자)
 */
window.Views = window.Views || {};
Views.survival = (function () {

  var API = '/hw/admin';
  var APP = 'https://a28008005-sketch.github.io/dailytest/cards/survival.html';
  var days = '30';
  var q = '';
  var mode = '';
  var items = null;
  var loadError = '';

  function title() { return '센텐스뱅크 서바이벌'; }
  function sub() {
    if (!items) return '학습패드 앱의 연습·실전 녹화 기록';
    var vids = items.filter(hasVideo);
    var unsent = vids.filter(function (i) { return !(i.sent && i.sent.length); }).length;
    return '기록 ' + items.length + '건 · 실전 영상 ' + vids.length + '건 · 미전송 ' + unsent + '건';
  }

  function onServer() { return /^https?:$/.test(location.protocol); }
  function hasVideo(i) { return !!(i.video && i.video.ok && i.share); }

  function call(url, opts) {
    opts = opts || {};
    return fetch(url, {
      method: opts.method || 'GET',
      headers: opts.body ? { 'Content-Type': 'application/json' } : {},
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      credentials: 'same-origin', cache: 'no-store'
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (r.status === 401) throw new Error(j.error || '원생관리 로그인이 필요합니다. 새로고침해 주세요.');
        if (r.status === 404) throw new Error('워커를 새 코드로 바꿔야 이 기능이 열립니다. (바탕화면 gorae-homepage 폴더의 워커 붙여넣기 안내를 확인해 주세요)');
        if (!r.ok || j.ok === false) throw new Error(j.error || '처리하지 못했습니다.');
        return j;
      });
    });
  }

  function load(el) {
    loadError = '';
    return call(API + '/api/sv/list?days=' + days).then(function (j) {
      items = j.items || [];
    }).catch(function (e) {
      items = null; loadError = e.message;
    }).then(function () {
      App.setSub(sub());
      draw(el);
    });
  }

  /* ---------- 학생 명부와 맞추기 ---------- */
  function norm(s) { return String(s || '').replace(/\s+/g, ''); }
  function student(name) {
    var n = norm(name);
    return Store.students({ includeArchived: true }).filter(function (s) { return norm(s.name) === n; })[0] || null;
  }
  function phoneOf(name) { var s = student(name); return s ? String(s.parentPhone || '') : ''; }

  function when(iso) {
    return new Date(iso).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }
  function dur(sec) { sec = Number(sec) || 0; var m = Math.floor(sec / 60), s = sec % 60; return m ? m + '분 ' + s + '초' : s + '초'; }
  function range(i) { return i.level + ' · Vol.' + i.vol + (i.unit ? ' · Unit ' + i.unit : ''); }
  function shareUrl(i) { return (onServer() ? location.origin : 'https://staff.whalejinju.kr') + i.share; }

  /* ---------- 화면 ---------- */
  function filtered() {
    return items.filter(function (i) {
      if (mode === 'real' && i.mode !== 'real') return false;
      if (mode === 'practice' && i.mode === 'real') return false;
      if (mode === 'unsent' && !(hasVideo(i) && !(i.sent && i.sent.length))) return false;
      return !q || norm(i.name).indexOf(norm(q)) >= 0;
    });
  }

  function summary(list) {
    var by = {};
    list.forEach(function (i) {
      var k = norm(i.name);
      var b = by[k] || (by[k] = { name: i.name, practice: 0, real: 0, last: '', vols: {} });
      if (i.mode === 'real') b.real++; else b.practice++;
      if (!b.last || i.at > b.last) b.last = i.at;
      b.vols[i.level + ' Vol.' + i.vol] = (b.vols[i.level + ' Vol.' + i.vol] || 0) + 1;
    });
    var rows = Object.keys(by).map(function (k) { return by[k]; }).sort(function (a, b) { return a.last < b.last ? 1 : -1; });
    if (!rows.length) return '';
    return '<div class="card" style="margin-bottom:16px"><div class="card-h"><h2>학생별 기록</h2><div class="sp"></div>' +
        '<span class="hint">최근 ' + days + '일</span></div>' +
      '<div class="card-b tight"><div style="overflow-x:auto"><table class="tbl" style="width:100%;border-collapse:collapse;font-size:13.5px">' +
        '<thead><tr style="text-align:left;color:#6b7785"><th style="padding:8px">학생</th><th style="padding:8px">연습</th><th style="padding:8px">실전 영상</th><th style="padding:8px">한 권 · 횟수</th><th style="padding:8px">마지막</th></tr></thead><tbody>' +
        rows.map(function (r) {
          var vols = Object.keys(r.vols).map(function (v) { return '<span class="tag gray" style="margin:2px">' + U.esc(v) + ' ×' + r.vols[v] + '</span>'; }).join('');
          return '<tr style="border-top:1px solid #eef1f5"><td style="padding:8px;font-weight:700">' + U.esc(r.name) + '</td>' +
            '<td style="padding:8px">' + r.practice + '회</td><td style="padding:8px">' + r.real + '개</td>' +
            '<td style="padding:8px">' + vols + '</td><td style="padding:8px;white-space:nowrap">' + U.esc(when(r.last)) + '</td></tr>';
        }).join('') +
      '</tbody></table></div></div></div>';
  }

  function row(i) {
    var s = student(i.name);
    var sent = i.sent && i.sent.length ? i.sent[i.sent.length - 1] : null;
    var tag = i.mode === 'real' ? '<span class="tag warn">실전 녹화</span>' : '<span class="tag gray">연습</span>';
    var vstate = i.mode !== 'real' ? '' : hasVideo(i) ? '' : ' <span class="tag bad" title="녹화 영상이 끝까지 올라오지 않았습니다">영상 없음</span>';
    return '<div class="sub-row" data-id="' + U.esc(i.id) + '" style="flex-wrap:wrap;gap:10px">' +
      '<div style="flex:1;min-width:220px">' +
        '<b>' + U.esc(i.name) + '</b>' + (s ? '' : ' <span class="tag gray" title="학생 명부에 같은 이름이 없습니다">명부에 없음</span>') +
        ' ' + tag + vstate +
        ' <span class="tag blue">' + U.esc(range(i)) + '</span>' +
        '<div class="hint" style="margin-top:4px">' + U.esc(when(i.at)) +
          ' · ' + (i.done || 0) + '/' + (i.total || i.cards || 0) + '문장' +
          (i.durationSec ? ' · ' + dur(i.durationSec) : '') +
          (i.answer === 'hide' ? ' · 정답 숨김(실전)' : '') +
          (sent ? ' · <span style="color:#296b4d;font-weight:700">학부모 전송 ' + U.esc(when(sent.at)) + '</span>' : '') +
        '</div>' +
      '</div>' +
      (hasVideo(i)
        ? '<button class="btn sm primary" data-play>▶ 영상 보기</button>' +
          '<button class="btn sm mint" data-send>' + (sent ? '다시 전송' : '학부모 전송') + '</button>' +
          '<button class="btn sm" data-copy>링크 복사</button>'
        : '') +
      '<button class="btn sm ghost danger" data-del title="기록 지우기">삭제</button>' +
    '</div>';
  }

  function listHtml() {
    var list = filtered();
    if (!list.length) return UI.emptyBox(items.length ? '조건에 맞는 기록이 없습니다.' : '아직 기록이 없습니다. 학습패드 앱에서 학생 번호로 들어가 연습해 보세요.', 'inbox');
    var out = '', day = '';
    list.forEach(function (i) {
      if (i.date !== day) { day = i.date; out += '<div class="att-label" style="margin:14px 0 6px;font-weight:600">' + U.esc(day) + '</div>'; }
      out += row(i);
    });
    return out;
  }

  function appCard() {
    return '<div class="card" style="margin-top:16px"><div class="card-h"><h2>학습패드 앱</h2><div class="sp"></div>' +
        '<a class="btn primary" target="_blank" rel="noopener" href="' + APP + '">앱 열기 →</a></div>' +
      '<div class="card-b"><p class="hint" style="margin:0;line-height:1.7">' +
        '앱 첫 화면에서 <b>학부모 휴대폰 뒤 4자리</b>로 학생을 고르면 그 학생 이름으로 기록이 남습니다. ' +
        '<b>연습</b>은 횟수·범위만 남고, <b>실전 녹화</b>는 카드 화면과 아이 얼굴·목소리가 한 영상으로 녹화되어 여기에 올라옵니다. ' +
        '[학부모 전송]을 누르면 학생 명부의 학부모 연락처로 영상 링크가 문자로 갑니다.</p></div></div>';
  }

  function draw(el) {
    if (!onServer()) { el.innerHTML = UI.emptyBox('학원 주소(staff.whalejinju.kr)로 접속했을 때만 볼 수 있습니다.', 'alert'); return; }
    if (items === null && loadError) {
      el.innerHTML = '<div class="card"><div class="card-b"><p style="margin:0 0 12px;color:#a8453f">' + U.esc(loadError) + '</p>' +
        '<button class="btn primary" id="sv-retry">다시 불러오기</button></div></div>' + appCard();
      el.querySelector('#sv-retry').addEventListener('click', function () { items = null; load(el); });
      return;
    }
    if (items === null) { el.innerHTML = '<div class="card"><div class="card-b hint">불러오는 중…</div></div>'; return; }

    var weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
    var week = items.filter(function (i) { return i.at >= weekAgo; });
    var vids = items.filter(hasVideo);
    var unsent = vids.filter(function (i) { return !(i.sent && i.sent.length); }).length;
    var list = filtered();

    el.innerHTML =
      '<div class="grid g-3" style="margin-bottom:16px">' +
        '<div class="stat"><div class="lbl">최근 7일 연습</div><div class="val">' + week.filter(function (i) { return i.mode !== 'real'; }).length + '<small>회</small></div></div>' +
        '<div class="stat"><div class="lbl">실전 영상</div><div class="val">' + vids.length + '<small>개</small></div><div class="sub">최근 ' + days + '일</div></div>' +
        '<div class="stat accent"><div class="lbl">학부모 미전송</div><div class="val">' + unsent + '<small>개</small></div></div>' +
      '</div>' +
      summary(list) +
      '<div class="card"><div class="card-h" style="flex-wrap:wrap"><h2>도전 기록</h2><div class="sp"></div>' +
        '<input type="text" id="sv-q" placeholder="학생 이름 검색" value="' + U.esc(q) + '" style="width:140px">' +
        '<div class="seg">' + [['', '전체'], ['practice', '연습'], ['real', '실전'], ['unsent', '미전송']].map(function (m) {
          return '<button data-mode="' + m[0] + '" class="' + (mode === m[0] ? 'on' : '') + '">' + m[1] + '</button>'; }).join('') + '</div>' +
        '<div class="seg">' + [['7', '7일'], ['30', '30일'], ['90', '90일']].map(function (d) {
          return '<button data-days="' + d[0] + '" class="' + (days === d[0] ? 'on' : '') + '">' + d[1] + '</button>'; }).join('') + '</div>' +
        '<button class="btn sm ghost" id="sv-reload">새로고침</button>' +
      '</div><div class="card-b" id="sv-list">' + listHtml() + '</div></div>' +
      appCard();
    bind(el);
  }

  /* ---------- 동작 ---------- */
  function itemOf(btn) { var id = btn.closest('[data-id]').getAttribute('data-id'); return items.filter(function (i) { return i.id === id; })[0]; }

  function copy(text, msg) {
    var done = function () { UI.toast(msg); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, function () { window.prompt('복사해 주세요', text); });
    else window.prompt('복사해 주세요', text);
  }

  function message(i) {
    return '[고래영어] ' + i.name + ' 학생이 센텐스뱅크 ' + range(i).replace(/ · /g, ' ') + ' 서바이벌에 도전했어요!\n' +
      '한글 카드를 보고 바로 영어로 말하는 모습을 영상으로 담았습니다. 많이 칭찬해 주세요.\n\n' +
      '영상 보기\n' + shareUrl(i) + '\n\n고래영어 초전캠퍼스';
  }

  function play(i) {
    UI.modal({
      title: i.name + ' · ' + range(i), wide: true,
      body: '<video controls playsinline autoplay src="' + U.esc(i.share.replace('?', '/video?')) + '" style="width:100%;max-height:70vh;background:#000;border-radius:10px"></video>',
      footer: '<button class="btn mint" id="sv-m-send">학부모 전송</button><div class="sp"></div><button class="btn" data-close>닫기</button>',
      onMount: function (w) { w.querySelector('#sv-m-send').addEventListener('click', function () { UI.close(); send(i); }); }
    });
  }

  function send(i) {
    var phone = phoneOf(i.name);
    UI.modal({
      title: '학부모님께 영상 보내기',
      body: '<div style="display:flex;flex-direction:column;gap:10px">' +
        '<label style="display:flex;flex-direction:column;gap:4px;font-size:13px;font-weight:700">받는 번호 (학생 명부의 학부모 연락처)' +
          '<input type="text" id="sv-to" value="' + U.esc(phone) + '" placeholder="010-0000-0000"></label>' +
        (phone ? '' : '<p class="hint" style="margin:0;color:#a8453f">학생 명부에 ' + U.esc(i.name) + ' 학생의 학부모 연락처가 없습니다. 번호를 직접 넣어 주세요.</p>') +
        '<label style="display:flex;flex-direction:column;gap:4px;font-size:13px;font-weight:700">보낼 내용' +
          '<textarea id="sv-text" rows="8" style="font:inherit;font-size:14px;line-height:1.6;padding:10px;border:1px solid #dfe5ec;border-radius:8px">' + U.esc(message(i)) + '</textarea></label>' +
        '<p class="hint" style="margin:0">문자(장문)로 발송됩니다. 영상 링크는 비밀번호 없이 열리지만 주소를 아는 사람만 볼 수 있습니다.</p></div>',
      footer: '<button class="btn" id="sv-copy-msg">내용 복사 (카톡용)</button><div class="sp"></div>' +
        '<button class="btn" data-close>취소</button><button class="btn primary" id="sv-go">문자 보내기</button>',
      onMount: function (w) {
        w.querySelector('#sv-copy-msg').addEventListener('click', function () {
          copy(w.querySelector('#sv-text').value, '내용을 복사했습니다. 카톡에 붙여 넣어 보내세요.');
          call(API + '/api/sv/sent', { method: 'POST', body: { id: i.id, to: '', how: 'copy' } }).then(function (j) { mergeRec(j.rec); });
        });
        w.querySelector('#sv-go').addEventListener('click', function () {
          var to = w.querySelector('#sv-to').value, text = w.querySelector('#sv-text').value;
          var b = this; b.disabled = true; b.textContent = '보내는 중…';
          call('/api/notify/message', { method: 'POST', body: { to: to, text: text, subject: '고래영어 학습 영상' } })
            .then(function (r) {
              return call(API + '/api/sv/sent', { method: 'POST', body: { id: i.id, to: to, how: 'sms' } }).then(function (j) {
                mergeRec(j.rec); UI.close(); UI.toast('학부모님께 보냈습니다. (' + r.sent + '/' + r.total + ')'); App.rerender();
              });
            })
            .catch(function (e) { b.disabled = false; b.textContent = '문자 보내기'; UI.toast(e.message, true); });
        });
      }
    });
  }

  function mergeRec(rec) {
    if (!rec || !items) return;
    items = items.map(function (x) { if (x.id !== rec.id) return x; rec.share = x.share; return rec; });
  }

  function remove(i) {
    UI.modal({
      title: '기록 지우기',
      body: '<p style="margin:0">' + U.esc(i.name) + ' · ' + U.esc(range(i)) + ' 기록' + (hasVideo(i) ? '과 영상' : '') + '을 지울까요? 지우면 되살릴 수 없고, 보낸 영상 링크도 열리지 않습니다.</p>',
      footer: '<div class="sp"></div><button class="btn" data-close>취소</button><button class="btn danger" id="sv-del-go">지우기</button>',
      onMount: function (w) {
        w.querySelector('#sv-del-go').addEventListener('click', function () {
          call(API + '/api/sv/delete', { method: 'POST', body: { id: i.id } }).then(function () {
            items = items.filter(function (x) { return x.id !== i.id; }); UI.close(); UI.toast('지웠습니다.'); App.rerender();
          }).catch(function (e) { UI.toast(e.message, true); });
        });
      }
    });
  }

  function bind(el) {
    var qi = el.querySelector('#sv-q');
    if (qi) qi.addEventListener('input', function () { q = qi.value; el.querySelector('#sv-list').innerHTML = listHtml(); });
    Array.prototype.forEach.call(el.querySelectorAll('[data-mode]'), function (b) { b.addEventListener('click', function () { mode = b.getAttribute('data-mode'); draw(el); }); });
    Array.prototype.forEach.call(el.querySelectorAll('[data-days]'), function (b) { b.addEventListener('click', function () { days = b.getAttribute('data-days'); items = null; draw(el); load(el); }); });
    var rl = el.querySelector('#sv-reload'); if (rl) rl.addEventListener('click', function () { items = null; draw(el); load(el); });
    el.onclick = function (e) {
      var t = e.target.closest('button'); if (!t || !t.closest('#sv-list')) return;
      var i = itemOf(t); if (!i) return;
      if (t.hasAttribute('data-play')) play(i);
      else if (t.hasAttribute('data-send')) send(i);
      else if (t.hasAttribute('data-copy')) copy(shareUrl(i), '영상 링크를 복사했습니다.');
      else if (t.hasAttribute('data-del')) remove(i);
    };
  }

  function render(el) {
    draw(el);
    if (onServer()) load(el);
  }

  return { title: title, sub: sub, render: render };
})();
