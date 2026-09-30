/* ===== 학원자료실 =====
 *
 * 노션 '고래영어 - 학원자료실' 을 옮긴 화면입니다.
 * 학습앱·워크시트·원서 목록처럼 수업에서 자주 여는 링크와 파일(PDF 등)을 한곳에 모아 둡니다.
 * 처음 열면 노션에 있던 자료가 자동으로 들어갑니다(seed).
 *
 * 파일은 클라우드플레어 R2(gorae-homework 워커의 res/ 폴더)에 올라가고,
 * 자료 기록에는 파일의 열쇠(key)·이름·크기만 남습니다.
 * 원생관리에 학원 비밀번호로 로그인한 기기에서만 올리고 열 수 있습니다.
 */
window.Views = window.Views || {};
Views.resources = (function () {

  var filter = { category: '', q: '' };
  var API = '/hw/admin';
  var MAX_FILE = 95 * 1024 * 1024;

  /** 데일리 시트지 인쇄 화면 (dailytest 저장소의 print 폴더) */
  var DAILY_PRINT = 'https://a28008005-sketch.github.io/dailytest/print/';
  var DAILY_LEVELS = [
    { id: '240', name: '240' }, { id: '520', name: '520' }, { id: '860', name: '860' },
    { id: '1240', name: '1240' }, { id: '1680', name: '1680' }, { id: 'Phonics', name: 'Phonics' }
  ];

  function title() { return '학원자료실'; }
  function sub() {
    seedOnce();
    var n = Store.resources().length;
    return n ? '자료 ' + n + '건 · 수업에서 바로 여는 링크와 파일을 모아 둡니다' : '수업 자료와 학습앱 링크를 모아 두는 곳입니다';
  }

  /** 노션 '고래영어 - 학원자료실' 에 있던 자료. 처음 한 번만 넣습니다. */
  var SEED = [
    {
      title: '고래 데일리 듣기',
      category: '학습앱',
      desc: '레벨별(lv240·520·860·1240·1680) 듣기 연습 앱. 열 번 듣고 따라 읽기.',
      url: 'https://a28008005-sketch.github.io/dailytest/',
      date: '2026-09-11'
    },
    {
      title: '고래 보카 다이브 (영어 스마트 단어장)',
      category: '학습앱',
      desc: '6레벨 720일차 단어·문장 학습. 학생이 하루치를 끝내면 수행률이 단어 학습 화면에 쌓입니다.',
      url: 'https://a28008005-sketch.github.io/dailytest/voca/',
      date: '2026-09-11'
    }
  ];

  function seedOnce() {
    if (!Store.markOnce('resourcesSeeded')) return;
    // 이미 직접 넣어 두신 자료가 있으면 건드리지 않습니다.
    if (Store.resources().length) return;
    SEED.forEach(function (r) { Store.saveResource(JSON.parse(JSON.stringify(r))); });
  }

  /* ---------- 파일 주고받기 ---------- */
  function onServer() { return /^https?:$/.test(location.protocol); }

  function size(n) {
    n = Number(n) || 0;
    if (n < 1024 * 1024) return Math.max(1, Math.round(n / 1024)) + 'KB';
    return (n / 1048576).toFixed(1) + 'MB';
  }

  function fileUrl(f, dl) {
    return API + '/res?key=' + encodeURIComponent(f.key) + (dl ? '&dl=1' : '');
  }

  /** 파일 하나를 올립니다. 진행률은 onProgress(0~1) 로 알려 줍니다. */
  function upload(file, onProgress) {
    return new Promise(function (resolve, reject) {
      var xhr = new XMLHttpRequest();
      xhr.open('PUT', API + '/api/res/upload?name=' + encodeURIComponent(file.name));
      xhr.withCredentials = true;
      xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
      xhr.upload.onprogress = function (e) { if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total); };
      xhr.onload = function () {
        var j = null;
        try { j = JSON.parse(xhr.responseText); } catch (e) { /* 아래에서 처리 */ }
        if (xhr.status === 401) { reject(new Error('원생관리 로그인이 필요합니다. 새로고침한 뒤 학원 비밀번호로 다시 들어와 주세요.')); return; }
        if (xhr.status === 404 && !j) { reject(new Error('파일 보관함(워커)이 아직 준비되지 않았습니다. 워커 코드를 새로 붙여넣어 주세요.')); return; }
        if (!j || !j.ok) { reject(new Error((j && j.error) || '파일을 올리지 못했습니다.')); return; }
        resolve({ key: j.key, name: file.name, size: j.size || file.size, type: j.type || file.type || '' });
      };
      xhr.onerror = function () { reject(new Error('인터넷 연결을 확인해 주세요. 파일을 올리지 못했습니다.')); };
      xhr.send(file);
    });
  }

  /** 필요 없어진 파일은 보관함에서도 지웁니다. 실패해도 자료 기록에는 영향이 없습니다. */
  function removeFile(f) {
    if (!f || !f.key || !onServer()) return;
    try {
      fetch(API + '/api/res/delete', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: f.key })
      }).catch(function () {});
    } catch (e) { /* 무시 */ }
  }

  /* ---------- 화면 ---------- */
  function tagOf(cat) {
    var map = { '학습앱': 'blue', '워크시트': 'mint', '원서': 'ok', '책': 'ok', '리포트': 'warn' };
    return map[cat] || 'gray';
  }

  function cards() {
    var list = Store.resources(filter);
    if (!list.length) {
      return UI.emptyBox(
        Store.resources().length ? '조건에 맞는 자료가 없습니다.' : '아직 등록한 자료가 없습니다. [+ 자료 등록]으로 시작하세요.',
        'archive');
    }
    return '<div class="res-grid">' + list.map(function (r) {
      var f = r.file && r.file.key ? r.file : null;
      var btns = '';
      if (f) {
        btns += '<a class="btn sm primary" href="' + U.esc(fileUrl(f)) + '" target="_blank" rel="noopener">파일 열기</a>' +
                '<a class="btn sm" href="' + U.esc(fileUrl(f, true)) + '" download>내려받기</a>';
      }
      if (r.url) {
        btns += '<a class="btn sm' + (f ? '' : ' primary') + '" href="' + U.esc(r.url) + '" target="_blank" rel="noopener">' + (f ? '링크' : '열기 →') + '</a>' +
                (f ? '' : '<button class="btn sm" data-copy="' + U.esc(r.url) + '">링크 복사</button>');
      }
      if (!btns) btns = '<span class="hint">링크·파일이 없습니다</span>';
      return '<div class="res-card">' +
        '<div class="res-top">' +
          '<span class="tag ' + tagOf(r.category) + '">' + U.esc(r.category || '기타') + '</span>' +
          '<span class="res-date">' + U.esc(r.date || '') + '</span>' +
        '</div>' +
        '<div class="res-title">' + U.esc(r.title) + '</div>' +
        (f ? '<div class="res-file">' + Icon.svg('archive', 13) + U.esc(f.name || '파일') + ' · ' + size(f.size) + '</div>' : '') +
        (r.desc ? '<div class="res-desc">' + U.esc(r.desc) + '</div>' : '') +
        '<div class="res-actions">' + btns +
          '<div class="sp"></div>' +
          '<button class="btn sm ghost" data-edit="' + r.id + '">수정</button>' +
        '</div>' +
      '</div>';
    }).join('') + '</div>';
  }

  function dailyCard() {
    return '<div class="card"><div class="card-h"><h2>데일리 시트지 인쇄</h2><div class="sp"></div>' +
        '<a class="btn sm" href="' + DAILY_PRINT + '" target="_blank" rel="noopener">인쇄 화면 열기 →</a></div>' +
      '<div class="card-b">' +
        '<p class="hint" style="margin:0 0 12px">레벨과 종류를 누르면 인쇄 화면이 새 탭에 열립니다. 거기서 권 전체를 열거나 필요한 DAY만 골라 뽑으세요.</p>' +
        '<div class="daily-grid">' + DAILY_LEVELS.map(function (lv) {
          var base = DAILY_PRINT + '?lv=' + encodeURIComponent(lv.id) + '&kind=';
          return '<div class="daily-row">' +
            '<span class="daily-lv">' + U.esc(lv.name) + '</span>' +
            '<a class="btn sm primary" href="' + base + 'pic" target="_blank" rel="noopener">그림 있음</a>' +
            '<a class="btn sm" href="' + base + 'plain" target="_blank" rel="noopener">그림 없음</a>' +
          '</div>';
        }).join('') + '</div>' +
      '</div></div>';
  }

  function form(r) {
    r = r || {};
    var f = r.file && r.file.key ? r.file : null;
    var fileBox;
    if (!onServer()) {
      fileBox = '<div class="hint">파일 올리기는 학원 주소(staff.whalejinju.kr)로 접속했을 때만 됩니다.</div>';
    } else {
      fileBox =
        (f ? '<div class="res-file-now" id="r-file-now">' +
               '<span>' + U.esc(f.name || '파일') + ' · ' + size(f.size) + '</span>' +
               '<div class="sp"></div><button type="button" class="btn sm ghost" id="r-file-remove">파일 빼기</button>' +
             '</div>' : '') +
        '<input type="file" id="r-file">' +
        '<div class="hint" id="r-file-hint">' + (f ? '다른 파일을 고르면 지금 파일과 바뀝니다. ' : '') + 'PDF·한글·워드·그림 등 95MB까지 올릴 수 있습니다.</div>' +
        '<div class="res-progress" id="r-prog" hidden><div></div></div>';
    }
    return '<div class="form-grid">' +
      '<label class="fld full">제목<input type="text" id="r-title" value="' + U.esc(r.title || '') + '" placeholder="고래 데일리 듣기"></label>' +
      '<label class="fld">분류<select id="r-cat">' +
        UI.options(Store.RESOURCE_CATEGORIES, r.category || '학습앱') + '</select></label>' +
      '<label class="fld">등록일<input type="date" id="r-date" value="' + U.esc(r.date || U.ymd()) + '"></label>' +
      '<div class="fld full">파일 첨부' + fileBox + '</div>' +
      '<label class="fld full">링크 <span class="hint" style="font-weight:400">(파일만 올릴 때는 비워 두셔도 됩니다)</span><input type="text" id="r-url" value="' + U.esc(r.url || '') + '" placeholder="https://"></label>' +
      '<label class="fld full">설명<textarea id="r-desc" placeholder="어떤 자료인지, 어떻게 쓰는지 적어 두세요">' + U.esc(r.desc || '') + '</textarea></label>' +
    '</div>';
  }

  function openForm(id) {
    var r = id ? Store.resource(id) : null;
    var oldFile = r && r.file && r.file.key ? r.file : null;
    var dropOld = false;   // [파일 빼기] 를 눌렀는지
    var busy = false;

    UI.modal({
      title: r ? '자료 수정' : '자료 등록',
      body: form(r),
      footer:
        (r ? '<button class="btn danger" id="r-del">삭제</button>' : '') +
        '<div class="sp"></div><button class="btn" data-close>취소</button>' +
        '<button class="btn primary" id="r-save">저장</button>',
      onMount: function (w) {
        var input = w.querySelector('#r-file');
        var saveBtn = w.querySelector('#r-save');

        var rm = w.querySelector('#r-file-remove');
        if (rm) rm.addEventListener('click', function () {
          dropOld = true;
          var now = w.querySelector('#r-file-now');
          if (now) now.parentNode.removeChild(now);
          w.querySelector('#r-file-hint').textContent = '저장하면 파일이 빠집니다. 새 파일을 고를 수도 있습니다.';
        });

        if (input) input.addEventListener('change', function () {
          var file = input.files && input.files[0];
          if (!file) return;
          if (file.size > MAX_FILE) {
            UI.toast('95MB 보다 큰 파일은 올릴 수 없습니다. (' + size(file.size) + ')', true);
            input.value = '';
            return;
          }
          // 제목이 비어 있으면 파일 이름으로 채워 드립니다.
          var t = w.querySelector('#r-title');
          if (!t.value.trim()) t.value = file.name.replace(/\.[^.]+$/, '');
        });

        saveBtn.addEventListener('click', function () {
          if (busy) return;
          var title = w.querySelector('#r-title').value.trim();
          if (!title) { UI.toast('제목을 입력해 주세요.', true); return; }
          var rec = {
            id: r ? r.id : undefined,
            title: title,
            category: w.querySelector('#r-cat').value,
            date: w.querySelector('#r-date').value,
            url: w.querySelector('#r-url').value.trim(),
            desc: w.querySelector('#r-desc').value.trim()
          };
          var file = input && input.files && input.files[0];

          function finish(newFile) {
            if (newFile) rec.file = newFile;
            else if (dropOld) rec.file = null;
            Store.saveResource(rec);
            if (oldFile && (newFile || dropOld)) removeFile(oldFile);
            UI.close();
            UI.toast(r ? '수정했습니다.' : '자료를 등록했습니다.');
            App.rerender();
          }

          if (!file) { finish(null); return; }

          busy = true;
          saveBtn.disabled = true;
          saveBtn.textContent = '올리는 중…';
          var prog = w.querySelector('#r-prog');
          prog.hidden = false;
          upload(file, function (p) {
            prog.firstChild.style.width = Math.round(p * 100) + '%';
            saveBtn.textContent = '올리는 중… ' + Math.round(p * 100) + '%';
          }).then(finish, function (e) {
            busy = false;
            saveBtn.disabled = false;
            saveBtn.textContent = '저장';
            prog.hidden = true;
            UI.toast(e.message, true);
          });
        });

        var del = w.querySelector('#r-del');
        if (del) del.addEventListener('click', function () {
          UI.confirm('이 자료를 목록에서 지울까요?' + (oldFile ? '<br>첨부한 파일도 함께 지워집니다.' : ''), function () {
            Store.deleteResource(r.id);
            removeFile(oldFile);
            UI.close(); UI.toast('삭제했습니다.'); App.rerender();
          }, { yes: '삭제' });
        });
      }
    });
  }

  function render(el) {
    seedOnce();

    el.innerHTML =
      '<div class="stack">' +
        '<div class="card"><div class="card-h">' +
          '<h2>자료 목록</h2><div class="sp"></div>' +
          '<button class="btn primary" id="r-new">+ 자료 등록</button>' +
        '</div>' +
        '<div class="card-b">' +
          '<div class="row" style="margin-bottom:14px">' +
            '<input type="search" id="r-q" placeholder="제목·설명으로 찾기" style="flex:1;min-width:180px" value="' + U.esc(filter.q) + '">' +
            '<div class="chips">' +
              '<button class="chip' + (filter.category ? '' : ' on') + '" data-cat="">전체</button>' +
              Store.RESOURCE_CATEGORIES.map(function (c) {
                return '<button class="chip' + (filter.category === c ? ' on blue' : '') + '" data-cat="' + U.esc(c) + '">' + U.esc(c) + '</button>';
              }).join('') +
            '</div>' +
          '</div>' +
          cards() +
        '</div></div>' +

        dailyCard() +

        '<div class="card"><div class="card-h"><h2>노션 자료실</h2></div>' +
          '<div class="card-b">' +
            '<p class="hint" style="margin:0 0 10px">' +
              '노션의 <b>고래영어 - 학원자료실</b> 에 올려 두신 파일은 노션에서 받아 ' +
              '[+ 자료 등록] 의 <b>파일 첨부</b>로 올리시면 여기서 바로 열고 인쇄할 수 있습니다.</p>' +
            '<a class="btn sm" href="https://app.notion.com/p/65deb8ef95a94b2f8439bda34d7a0b77" target="_blank" rel="noopener">노션 자료실 열기 →</a>' +
          '</div></div>' +
      '</div>';

    el.querySelector('#r-new').addEventListener('click', function () { openForm(); });

    UI.on(el, '[data-cat]', 'click', function (e, btn) {
      filter.category = btn.getAttribute('data-cat');
      render(el);
    });
    UI.on(el, '[data-edit]', 'click', function (e, btn) { openForm(btn.getAttribute('data-edit')); });
    UI.on(el, '[data-copy]', 'click', function (e, btn) {
      U.copy(btn.getAttribute('data-copy')).then(function () { UI.toast('링크를 복사했습니다.'); });
    });

    var q = el.querySelector('#r-q');
    q.addEventListener('input', function () {
      filter.q = q.value.trim();
      var host = el.querySelector('.card-b');
      // 목록만 다시 그려 입력 초점을 잃지 않게 합니다.
      var grid = host.querySelector('.res-grid') || host.querySelector('.empty');
      if (grid) grid.outerHTML = cards();
    });
  }

  return { title: title, sub: sub, render: render };
})();
