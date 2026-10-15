/* ===== 숙제 영상 =====
 *
 * 학부모님이 staff.whalejinju.kr/hw 에서 올린 숙제 영상을 봅니다.
 * 카카오 채널로 보낸 녹음·사진·영상·메시지도 같은 목록에 모입니다. (카카오 챗봇 → gorae-homework 워커)
 * 영상 자체는 클라우드플레어 R2(gorae-homework 워커)에 있고, 이 화면은 목록을 불러와 보여 주기만 합니다.
 * 원생관리에 학원 비밀번호로 로그인한 기기라면 따로 비밀번호 없이 바로 보입니다.
 * (워커가 원생관리 로그인 쿠키를 gorae-staff-gate 에 물어 확인합니다.)
 */
window.Views = window.Views || {};
Views.hwvideo = (function () {

  var API = '/hw/admin';
  var days = '7';
  var q = '';
  var onlyNew = false;
  var items = null;        // 불러온 목록 (null = 아직 안 불러옴)
  var loadError = '';
  var tokenCache = { t: '', exp: 0 };

  function title() { return '숙제 영상'; }
  function sub() {
    if (!items) return '학부모님이 올린 숙제 영상';
    var n = items.filter(function (i) { return !i.checked; }).length;
    return '미확인 ' + n + '건 · 전체 ' + items.length + '건';
  }

  /* ---------- 요청 ---------- */
  function onServer() { return /^https?:$/.test(location.protocol); }

  function api(path, opts) {
    opts = opts || {};
    var headers = {};
    if (opts.body) headers['Content-Type'] = 'application/json';
    return fetch(API + path, {
      method: opts.method || 'GET',
      headers: headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      credentials: 'same-origin'
    }).then(function (r) {
      return r.json().catch(function () { return { ok: false, error: '서버 응답을 읽지 못했습니다.' }; })
        .then(function (j) {
          if (r.status === 401) { var e = new Error(j.error || '원생관리 로그인이 필요합니다.'); e.auth = true; throw e; }
          if (!r.ok || !j.ok) throw new Error(j.error || '불러오지 못했습니다.');
          return j;
        });
    });
  }

  function fileUrl(key, dl) {
    var go = function () {
      return '/hw/admin/file?key=' + encodeURIComponent(key) + '&t=' + encodeURIComponent(tokenCache.t) + (dl ? '&dl=1' : '');
    };
    if (tokenCache.t && tokenCache.exp - Date.now() > 10 * 60000) return Promise.resolve(go());
    return api('/api/token').then(function (j) { tokenCache = { t: j.token, exp: j.exp }; return go(); });
  }

  function load(el) {
    loadError = '';
    return api('/api/list?days=' + days).then(function (j) {
      items = j.items || [];
    }).catch(function (e) {
      items = null;
      loadError = e.message;
    }).then(function () {
      App.setSub(sub());
      draw(el);
    });
  }

  /* ---------- 학생 명부와 맞추기 ---------- */
  function norm(s) { return String(s || '').replace(/\s+/g, '').replace(/학생$/, ''); }
  function matchStudent(name) {
    var n = norm(name);
    if (!n) return null;
    return Store.students({ includeArchived: true }).filter(function (s) { return norm(s.name) === n; })[0] || null;
  }

  function when(iso) {
    var d = new Date(iso);
    return d.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }
  function mb(n) { return (n / 1048576).toFixed(1) + 'MB'; }

  /** 'video' · 'audio' · 'image' · 'text' (예전 제출은 종류 기록이 없어 영상으로 봅니다) */
  function kindOf(i) {
    var t = String(i.type || '');
    if (/^text\//.test(t)) return 'text';
    if (/^audio\//.test(t)) return 'audio';
    if (/^image\//.test(t)) return 'image';
    return 'video';
  }
  var KIND_LABEL = { video: '영상', audio: '녹음', image: '사진', text: '메시지' };
  function isFile(i) { return kindOf(i) !== 'text'; }
  function nameOf(i) { return i.student || '이름 미등록'; }

  /* ---------- 화면 조각 ---------- */
  function linkCard() {
    var link = (onServer() ? location.origin : 'https://staff.whalejinju.kr') + '/hw';
    return '<div class="card" style="margin-top:16px"><div class="card-h"><h2>학부모님께 보낼 제출 링크</h2></div>' +
      '<div class="card-b">' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">' +
          '<code style="padding:8px 10px;background:var(--bg,#f4f6f9);border-radius:8px;font-size:13px">' + U.esc(link) + '</code>' +
          '<button class="btn sm" id="hw-copy" data-link="' + U.esc(link) + '">링크 복사</button>' +
        '</div>' +
        '<p class="hint" style="margin:10px 0 0;line-height:1.7">카톡으로 이 링크를 보내 주시면 학부모님이 아이 이름을 적고 영상을 올립니다. ' +
          '영상은 제출 후 30일이 지나면 자동으로 지워집니다.</p>' +
        '<p class="hint" style="margin:6px 0 0;line-height:1.7">카카오 채널(고래영어학원)로 보낸 녹음·사진·영상과 메시지도 이 목록에 자동으로 들어옵니다. ' +
          '처음 보내는 학부모님은 채팅방에 <b>이름 김고래</b> 처럼 아이 이름을 한 번 보내 주시면 됩니다.</p>' +
      '</div></div>';
  }

  function row(i) {
    var s = matchStudent(i.student);
    var c = s && s.classId ? Store.klass(s.classId) : null;
    var kind = kindOf(i);
    var who = !i.student
      ? '<span class="tag warn" title="학부모님이 카카오 채팅방에 \'이름 김고래\' 처럼 보내 주시면 자동으로 채워집니다">이름 미등록</span>'
      : s ? '<span class="member-name pill" data-open="' + s.id + '" style="cursor:pointer">' + U.esc(i.student) + '</span>'
          : '<span class="member-name">' + U.esc(i.student) + '</span> <span class="tag gray" title="학생 명부에 같은 이름이 없습니다">명부에 없음</span>';
    return '<div class="sub-row" data-key="' + U.esc(i.key) + '" style="flex-wrap:wrap;gap:10px;' + (i.checked ? 'opacity:.6' : '') + '">' +
      '<div style="flex:1;min-width:200px">' +
        who +
        (c ? ' <span class="tag gray">' + U.esc(c.name) + '</span>' : '') +
        (i.cls ? ' <span class="hint">' + U.esc(i.cls) + '</span>' : '') +
        ' <span class="tag ' + (kind === 'text' ? 'blue' : 'gray') + '">' + (i.via === 'kakao' ? '카톡 ' : '') + KIND_LABEL[kind] + '</span>' +
        (kind === 'text'
          ? '<div style="margin-top:5px;white-space:pre-wrap;line-height:1.6">' + U.esc(i.memo) + '</div>' +
            '<div class="hint" style="margin-top:3px">' + U.esc(when(i.uploaded)) + '</div>'
          : '<div class="hint" style="margin-top:3px">' + U.esc(when(i.uploaded)) + ' · ' + mb(i.size) +
              (i.memo ? ' · “' + U.esc(i.memo) + '”' : '') + '</div>') +
      '</div>' +
      (kind === 'text' ? '' :
        '<button class="btn sm primary" data-play>' + (kind === 'audio' ? '▶ 듣기' : '▶ 보기') + '</button>' +
        '<button class="btn sm" data-dl>저장</button>') +
      '<label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer">' +
        '<input type="checkbox" data-ck' + (i.checked ? ' checked' : '') + '> 확인</label>' +
    '</div>';
  }

  function listHtml() {
    var list = items.filter(function (i) {
      if (onlyNew && i.checked) return false;
      return !q || norm(nameOf(i)).indexOf(norm(q)) >= 0;
    });
    if (!list.length) {
      return UI.emptyBox(items.length ? '조건에 맞는 제출이 없습니다.' : '이 기간에 올라온 숙제가 없습니다.', 'inbox');
    }
    var out = '', day = '';
    list.forEach(function (i) {
      var d = i.key.split('/')[1] || '';
      if (d !== day) {
        day = d;
        out += '<div class="att-label" style="margin:14px 0 6px;font-weight:600">' + U.esc(U.human ? U.human(d) : d) + '</div>';
      }
      out += row(i);
    });
    return out;
  }

  function draw(el) {
    if (!onServer()) {
      el.innerHTML = UI.emptyBox('숙제 영상은 학원 주소(staff.whalejinju.kr)로 접속했을 때만 볼 수 있습니다.', 'alert');
      return;
    }
    if (items === null && loadError) {
      el.innerHTML = '<div class="card"><div class="card-b">' +
        '<p style="margin:0 0 12px;color:#a8453f">' + U.esc(loadError) + '</p>' +
        '<button class="btn primary" id="hw-retry">새로고침</button></div></div>' + linkCard();
      el.querySelector('#hw-retry').addEventListener('click', function () { location.reload(); });
      bindCopy(el);
      return;
    }
    if (items === null) {
      el.innerHTML = '<div class="card"><div class="card-b hint">불러오는 중…</div></div>';
      return;
    }

    var unchecked = items.filter(function (i) { return !i.checked; }).length;
    var kids = {};
    var files = items.filter(isFile);
    files.forEach(function (i) { if (i.student) kids[norm(i.student)] = 1; });
    var msgs = items.length - files.length;

    el.innerHTML =
      '<div class="grid g-3" style="margin-bottom:16px">' +
        '<div class="stat accent"><div class="lbl">미확인</div><div class="val">' + unchecked + '<small>건</small></div>' +
          '<div class="sub">확인 체크 전</div></div>' +
        '<div class="stat"><div class="lbl">제출 숙제</div><div class="val">' + files.length + '<small>건</small></div>' +
          '<div class="sub">' + (days === '1' ? '오늘' : '최근 ' + days + '일') + (msgs ? ' · 카톡 메시지 ' + msgs + '건' : '') + '</div></div>' +
        '<div class="stat"><div class="lbl">제출한 학생</div><div class="val">' + Object.keys(kids).length + '<small>명</small></div>' +
          '<div class="sub">같은 이름은 한 명으로</div></div>' +
      '</div>' +
      '<div class="card">' +
        '<div class="card-h" style="flex-wrap:wrap"><h2>제출 목록</h2><div class="sp"></div>' +
          '<input type="text" id="hw-q" placeholder="학생 이름 검색" value="' + U.esc(q) + '" style="width:140px">' +
          '<div class="seg">' +
            [['1', '오늘'], ['7', '7일'], ['30', '30일']].map(function (d) {
              return '<button data-days="' + d[0] + '" class="' + (days === d[0] ? 'on' : '') + '">' + d[1] + '</button>';
            }).join('') +
          '</div>' +
          '<button class="btn sm' + (onlyNew ? ' primary' : '') + '" id="hw-new">미확인만</button>' +
          '<button class="btn sm ghost" id="hw-reload">새로고침</button>' +
        '</div>' +
        '<div class="card-b" id="hw-list">' + listHtml() + '</div>' +
      '</div>' +
      linkCard();

    bind(el);
    bindCopy(el);
  }

  /* ---------- 동작 ---------- */
  function bindCopy(el) {
    var b = el.querySelector('#hw-copy');
    if (!b) return;
    b.addEventListener('click', function () {
      var link = b.getAttribute('data-link');
      var done = function () { UI.toast('제출 링크를 복사했습니다.'); };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(link).then(done, function () { window.prompt('복사해 주세요', link); });
      } else {
        window.prompt('복사해 주세요', link);
      }
    });
  }

  function keyOf(btn) { return btn.closest('[data-key]').getAttribute('data-key'); }
  function itemOf(key) { return items.filter(function (i) { return i.key === key; })[0]; }

  function media(kind, src) {
    if (kind === 'audio') return '<audio controls autoplay src="' + U.esc(src) + '" style="width:100%"></audio>';
    if (kind === 'image') return '<img src="' + U.esc(src) + '" alt="숙제 사진" style="max-width:100%;max-height:70vh;display:block;margin:0 auto;border-radius:10px">';
    return '<video controls playsinline autoplay src="' + U.esc(src) + '" style="width:100%;max-height:70vh;background:#000;border-radius:10px"></video>';
  }

  function play(key) {
    var i = itemOf(key);
    var kind = i ? kindOf(i) : 'video';
    fileUrl(key).then(function (src) {
      UI.modal({
        title: (i ? nameOf(i) + ' · ' : '') + '숙제 ' + KIND_LABEL[kind], wide: kind !== 'audio',
        body: media(kind, src) +
          (i && i.memo ? '<p class="hint" style="margin:10px 0 0">메모: ' + U.esc(i.memo) + '</p>' : ''),
        footer: (i && !i.checked ? '<button class="btn primary" id="hw-ck-close">확인 완료로 표시</button>' : '') +
          '<div class="sp"></div><button class="btn" data-close>닫기</button>',
        onMount: function (w) {
          var b = w.querySelector('#hw-ck-close');
          if (b) b.addEventListener('click', function () { setChecked(key, true); UI.close(); });
        }
      });
    }).catch(function (e) { UI.toast(e.message, true); });
  }

  function download(key) {
    fileUrl(key, true).then(function (src) {
      var a = document.createElement('a');
      a.href = src; a.rel = 'noopener';
      document.body.appendChild(a); a.click(); a.parentNode.removeChild(a);
    }).catch(function (e) { UI.toast(e.message, true); });
  }

  function setChecked(key, on) {
    var i = itemOf(key);
    api('/api/check', { method: 'POST', body: { key: key, checked: on } }).then(function () {
      if (i) i.checked = on;
      App.setSub(sub());
      App.rerender();
    }).catch(function (e) { UI.toast(e.message, true); App.rerender(); });
  }

  function bind(el) {
    UI.on(el, '[data-days]', 'click', function (e, b) {
      days = b.getAttribute('data-days'); items = null; draw(el); load(el);
    });
    el.querySelector('#hw-q').addEventListener('input', function (e) {
      q = e.target.value;
      el.querySelector('#hw-list').innerHTML = listHtml();
    });
    el.querySelector('#hw-new').addEventListener('click', function () { onlyNew = !onlyNew; draw(el); });
    el.querySelector('#hw-reload').addEventListener('click', function () { items = null; draw(el); load(el); });
    UI.on(el, '[data-play]', 'click', function (e, b) { play(keyOf(b)); });
    UI.on(el, '[data-dl]', 'click', function (e, b) { download(keyOf(b)); });
    UI.on(el, '[data-ck]', 'change', function (e, cb) { setChecked(keyOf(cb), cb.checked); });
    UI.on(el, '[data-open]', 'click', function (e, b) {
      if (Views.students && Views.students.openDetail) Views.students.openDetail(b.getAttribute('data-open'));
    });
  }

  function render(el) {
    draw(el);
    // 화면에 들어올 때마다 새 목록을 받아옵니다. (비밀번호가 있을 때만)
    if (onServer() && !loadError) {
      var first = items === null;
      if (first) load(el);
      else api('/api/list?days=' + days).then(function (j) {
        items = j.items || []; App.setSub(sub()); draw(el);
      }).catch(function () {});
    }
  }

  /* ---------- 대시보드: 오늘 들어온 숙제 ---------- */
  // 대시보드는 동기화 때마다 다시 그려지므로, 1분 안에는 받아 둔 목록을 그대로 씁니다.
  var today = { at: 0, items: null, error: '' };

  function todayHtml() {
    if (!onServer()) return '<div class="hint">학원 주소(staff.whalejinju.kr)로 접속하면 카카오·제출 링크로 들어온 숙제가 여기에 보입니다.</div>';
    if (today.error) return '<div class="hint">' + U.esc(today.error) + '</div>';
    if (!today.items) return '<div class="hint">불러오는 중…</div>';
    if (!today.items.length) return '<div class="hint">오늘 들어온 숙제가 아직 없습니다.</div>';
    var fresh = today.items.filter(function (i) { return !i.checked; });
    var files = today.items.filter(isFile).length;
    return '<div class="hint" style="margin-bottom:8px">오늘 숙제 <b>' + files + '</b>건 · 카톡 메시지 <b>' + (today.items.length - files) + '</b>건 · 미확인 <b>' + fresh.length + '</b>건</div>' +
      (fresh.length ? '' : '<div class="hint">모두 확인했습니다 👍</div>') +
      fresh.slice(0, 6).map(function (i) {
        var k = kindOf(i);
        return '<div class="sub-row" style="gap:8px"><span class="member-name">' + U.esc(nameOf(i)) + '</span>' +
          '<span class="tag ' + (k === 'text' ? 'blue' : 'gray') + '">' + (i.via === 'kakao' ? '카톡 ' : '') + KIND_LABEL[k] + '</span>' +
          '<span class="hint" style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + (k === 'text' ? U.esc(i.memo) : '') + '</span>' +
          '<span class="hint">' + U.esc(when(i.uploaded).replace(/^.*?\s(?=오[전후])/, '')) + '</span></div>';
      }).join('') +
      (fresh.length > 6 ? '<div class="hint" style="margin-top:6px">외 ' + (fresh.length - 6) + '건</div>' : '');
  }

  function fillToday(box) {
    if (!box) return;
    box.innerHTML = todayHtml();
    if (!onServer() || Date.now() - today.at < 60000) return;
    today.at = Date.now();
    api('/api/list?days=1').then(function (j) {
      today.items = j.items || []; today.error = '';
    }).catch(function (e) {
      today.error = e.auth ? '원생관리에 학원 비밀번호로 로그인하면 보입니다.' : e.message;
    }).then(function () {
      if (document.body.contains(box)) box.innerHTML = todayHtml();
    });
  }

  return { title: title, sub: sub, render: render, fillToday: fillToday };
})();
