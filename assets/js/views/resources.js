/* ===== 학원자료실 =====
 *
 * 노션 '고래영어 - 학원자료실' 을 옮긴 화면입니다.
 * 학습앱·워크시트·원서 목록처럼 수업에서 자주 여는 링크를 한곳에 모아 둡니다.
 * 처음 열면 노션에 있던 자료가 자동으로 들어갑니다(seed).
 */
window.Views = window.Views || {};
Views.resources = (function () {

  var filter = { category: '', q: '' };

  function title() { return '학원자료실'; }
  function sub() {
    seedOnce();
    var n = Store.resources().length;
    return n ? '자료 ' + n + '건 · 수업에서 바로 여는 링크를 모아 둡니다' : '수업 자료와 학습앱 링크를 모아 두는 곳입니다';
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
      return '<div class="res-card">' +
        '<div class="res-top">' +
          '<span class="tag ' + tagOf(r.category) + '">' + U.esc(r.category || '기타') + '</span>' +
          '<span class="res-date">' + U.esc(r.date || '') + '</span>' +
        '</div>' +
        '<div class="res-title">' + U.esc(r.title) + '</div>' +
        (r.desc ? '<div class="res-desc">' + U.esc(r.desc) + '</div>' : '') +
        '<div class="res-actions">' +
          (r.url
            ? '<a class="btn sm primary" href="' + U.esc(r.url) + '" target="_blank" rel="noopener">열기 →</a>' +
              '<button class="btn sm" data-copy="' + U.esc(r.url) + '">링크 복사</button>'
            : '<span class="hint">링크가 없습니다</span>') +
          '<div class="sp"></div>' +
          '<button class="btn sm ghost" data-edit="' + r.id + '">수정</button>' +
        '</div>' +
      '</div>';
    }).join('') + '</div>';
  }

  function form(r) {
    r = r || {};
    return '<div class="form-grid">' +
      '<label class="fld full">제목<input type="text" id="r-title" value="' + U.esc(r.title || '') + '" placeholder="고래 데일리 듣기"></label>' +
      '<label class="fld">분류<select id="r-cat">' +
        UI.options(Store.RESOURCE_CATEGORIES, r.category || '학습앱') + '</select></label>' +
      '<label class="fld">등록일<input type="date" id="r-date" value="' + U.esc(r.date || U.ymd()) + '"></label>' +
      '<label class="fld full">링크<input type="text" id="r-url" value="' + U.esc(r.url || '') + '" placeholder="https://"></label>' +
      '<label class="fld full">설명<textarea id="r-desc" placeholder="어떤 자료인지, 어떻게 쓰는지 적어 두세요">' + U.esc(r.desc || '') + '</textarea></label>' +
    '</div>';
  }

  function openForm(id) {
    var r = id ? Store.resource(id) : null;
    UI.modal({
      title: r ? '자료 수정' : '자료 등록',
      body: form(r),
      footer:
        (r ? '<button class="btn danger" id="r-del">삭제</button>' : '') +
        '<div class="sp"></div><button class="btn" data-close>취소</button>' +
        '<button class="btn primary" id="r-save">저장</button>',
      onMount: function (w) {
        w.querySelector('#r-save').addEventListener('click', function () {
          var title = w.querySelector('#r-title').value.trim();
          if (!title) { UI.toast('제목을 입력해 주세요.', true); return; }
          Store.saveResource({
            id: r ? r.id : undefined,
            title: title,
            category: w.querySelector('#r-cat').value,
            date: w.querySelector('#r-date').value,
            url: w.querySelector('#r-url').value.trim(),
            desc: w.querySelector('#r-desc').value.trim()
          });
          UI.close();
          UI.toast(r ? '수정했습니다.' : '자료를 등록했습니다.');
          App.rerender();
        });
        var del = w.querySelector('#r-del');
        if (del) del.addEventListener('click', function () {
          UI.confirm('이 자료를 목록에서 지울까요?', function () {
            Store.deleteResource(r.id);
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

        '<div class="card"><div class="card-h"><h2>노션 자료실</h2></div>' +
          '<div class="card-b">' +
            '<p class="hint" style="margin:0 0 10px">' +
              '노션의 <b>고래영어 - 학원자료실</b> 에 파일(PDF 등)로 올려 두신 자료는 여기서 바로 열 수 없습니다. ' +
              '링크로 여는 자료만 이 화면에 모아 두고, 파일은 노션에서 받으시는 편이 편합니다.</p>' +
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
