/* ===== 영자신문 워크시트 =====
 *
 * 노션 '영자신문 워크시트 마스터 목록' 과 '워크시트 만들기 요청' 을 옮긴 화면입니다.
 *
 * 워크시트 파일(PDF)을 실제로 만들어 주는 것은 노션 쪽 자동화입니다.
 * 이 화면은 (1) 지금까지 만든 것을 레벨·주제별로 찾아보고
 *          (2) 새로 만들 기사를 요청 목록에 적어 두는 일을 합니다.
 */
window.Views = window.Views || {};
Views.news = (function () {

  var NOTION_REQUEST = 'https://app.notion.com/p/3d9e4c508820812cbbafebecf70eff9e';
  var NOTION_MASTER  = 'https://app.notion.com/p/3c8dc243c7ea4ebb9956508c1dc61c7c';

  var filter = { level: '', status: '', q: '' };

  function title() { return '영자신문 워크시트'; }
  function sub() {
    var all = Store.newsItems();
    var done = all.filter(function (n) { return n.status === '완성'; }).length;
    return all.length
      ? '전체 ' + all.length + '건 · 완성 ' + done + '건'
      : 'Time for Kids 기사로 만드는 레벨별 워크시트';
  }

  function statusTag(st) {
    var map = { '완성': 'ok', '진행중': 'warn', '계획': 'gray' };
    return '<span class="tag ' + (map[st] || 'gray') + '">' + U.esc(st || '계획') + '</span>';
  }

  /** 레벨별 집계 타일 */
  function levelTiles() {
    var all = Store.newsItems();
    return '<div class="grid g-4">' + Store.NEWS_LEVELS.map(function (lv) {
      var mine = all.filter(function (n) { return n.level === lv; });
      var done = mine.filter(function (n) { return n.status === '완성'; }).length;
      return '<div class="stat"><div class="lbl">' + U.esc(lv) + '</div>' +
        '<div class="val">' + mine.length + '<small>건</small></div>' +
        '<div class="sub">' + (mine.length ? '완성 ' + done + '건' : '아직 없습니다') + '</div></div>';
    }).join('') + '</div>';
  }

  function rows() {
    var list = Store.newsItems(filter);
    if (!list.length) {
      return '<tr><td colspan="6">' + UI.emptyBox(
        Store.newsItems().length ? '조건에 맞는 워크시트가 없습니다.' : '아직 만든 워크시트가 없습니다.',
        'news') + '</td></tr>';
    }
    return list.map(function (n) {
      return '<tr>' +
        '<td class="nm">' + U.esc(n.title) + '</td>' +
        '<td><span class="tag blue">' + U.esc(n.level || '-') + '</span></td>' +
        '<td>' + U.esc(n.topic || '-') + '</td>' +
        '<td>' + statusTag(n.status) + '</td>' +
        '<td>' + U.esc(n.date || '-') + '</td>' +
        '<td>' +
          // 원문 PDF 에는 음원 QR 이 들어 있습니다. 없으면 기사 웹주소로 보냅니다.
          (n.articleUrl
            ? '<a class="btn sm" href="' + U.esc(n.articleUrl) + '" target="_blank" rel="noopener">원문</a> '
            : n.sourceUrl
            ? '<a class="btn sm" href="' + U.esc(n.sourceUrl) + '" target="_blank" rel="noopener">원문</a> '
            : '') +
          (n.worksheetUrl
            ? '<a class="btn sm" href="' + U.esc(n.worksheetUrl) + '" target="_blank" rel="noopener">문제</a> '
            : '') +
          (n.answersUrl
            ? '<a class="btn sm" href="' + U.esc(n.answersUrl) + '" target="_blank" rel="noopener">정답</a> '
            : '') +
          '<button class="btn sm ghost" data-edit="' + n.id + '">수정</button>' +
        '</td>' +
      '</tr>';
    }).join('');
  }

  function form(n) {
    n = n || {};
    // 수정 모드는 상세 폼, 추가 모드는 간단한 폼
    if (n && n.id) {
      // 수정: 모든 필드 표시
      return '<div class="form-grid">' +
        '<label class="fld full">기사 제목<input type="text" id="n-title" value="' + U.esc(n.title || '') + '" placeholder="Meet Sea Turtles"></label>' +
        '<label class="fld">레벨<select id="n-level">' + UI.options(Store.NEWS_LEVELS, n.level || 'K1') + '</select></label>' +
        '<label class="fld">주제<select id="n-topic">' + UI.options(Store.NEWS_TOPICS, n.topic || 'Animals') + '</select></label>' +
        '<label class="fld">상태<select id="n-status">' + UI.options(Store.NEWS_STATUS, n.status || '계획') + '</select></label>' +
        '<label class="fld">날짜<input type="date" id="n-date" value="' + U.esc(n.date || U.ymd()) + '"></label>' +
        '<label class="fld full">기사 웹주소<input type="text" id="n-src" value="' + U.esc(n.sourceUrl || '') + '" placeholder="https://www.timeforkids.com/..."></label>' +
        '<label class="fld full">원문 PDF 주소 <span style="font-weight:400">(음원 QR 이 들어 있습니다)</span>' +
          '<input type="text" id="n-art" value="' + U.esc(n.articleUrl || '') + '" placeholder="/assets/pdf/..."></label>' +
        '<label class="fld full">워크시트 PDF 주소 <span style="font-weight:400">(Notion 공유 링크)</span>' +
          '<input type="text" id="n-ws" value="' + U.esc(n.worksheetUrl || '') + '" placeholder="https://"></label>' +
        '<label class="fld full">정답지 PDF 주소 <span style="font-weight:400">(Notion 공유 링크)</span>' +
          '<input type="text" id="n-ans" value="' + U.esc(n.answersUrl || '') + '" placeholder="https://"></label>' +
        '<label class="fld full">메모<textarea id="n-memo" placeholder="어떤 내용의 기사인지 적어 두세요">' + U.esc(n.memo || '') + '</textarea></label>' +
      '</div>';
    } else {
      // 추가: 최소 필드만 표시
      return '<div class="form-grid">' +
        '<label class="fld full" style="margin-bottom:8px">' +
          '<div style="font-size:12px;color:#666;margin-bottom:4px">선택한 레벨의 기사에서 자동으로 선택됩니다</div>' +
          '레벨' +
          '<select id="n-level">' + UI.options(Store.NEWS_LEVELS, 'K1') + '</select>' +
        '</label>' +
        '<label class="fld full">기사 제목 (선택사항)<input type="text" id="n-title" value="" placeholder="자동으로 선택됨"></label>' +
        '<label class="fld full" style="font-size:12px;color:#999">기사 선택이 어렵다면 Notion 에서 요청하세요. ' +
          '<a href="' + NOTION_REQUEST + '" target="_blank" rel="noopener" style="color:#0066cc">요청하러 가기 →</a></label>' +
      '</div>';
    }
  }

  function openForm(id) {
    var n = id ? Store.newsItem(id) : null;
    UI.modal({
      title: n ? '워크시트 수정' : '워크시트 추가',
      body: form(n),
      footer:
        (n ? '<button class="btn danger" id="n-del">삭제</button>' : '') +
        '<div class="sp"></div><button class="btn" data-close>취소</button>' +
        '<button class="btn primary" id="n-save">' + (n ? '수정' : '추가') + '</button>',
      onMount: function (w) {
        w.querySelector('#n-save').addEventListener('click', function () {
          if (n) {
            // 수정 모드
            var t = w.querySelector('#n-title').value.trim();
            if (!t) { UI.toast('기사 제목을 입력해 주세요.', true); return; }
            Store.saveNewsItem({
              id: n.id,
              title: t,
              level: w.querySelector('#n-level').value,
              topic: w.querySelector('#n-topic').value,
              status: w.querySelector('#n-status').value,
              date: w.querySelector('#n-date').value,
              sourceUrl: w.querySelector('#n-src').value.trim(),
              articleUrl: w.querySelector('#n-art').value.trim(),
              worksheetUrl: w.querySelector('#n-ws').value.trim(),
              answersUrl: w.querySelector('#n-ans').value.trim(),
              memo: w.querySelector('#n-memo').value.trim()
            });
            UI.close();
            UI.toast('수정했습니다.');
            App.rerender();
          } else {
            // 추가 모드 (간단한 형태)
            var level = w.querySelector('#n-level').value;
            var titleInput = w.querySelector('#n-title').value.trim();
            var title = titleInput || '[' + level + ' 레벨 기사]';

            Store.saveNewsItem({
              id: undefined,
              title: title,
              level: level,
              topic: 'Animals',  // 기본값
              status: '계획',
              date: U.ymd(),
              sourceUrl: '',
              worksheetUrl: '',
              answersUrl: '',
              memo: '클릭해서 Notion 에서 요청하거나 정보를 입력해 주세요.'
            });
            UI.close();
            UI.toast('추가했습니다. 수정 버튼으로 상세 정보를 입력해 주세요.');
            App.rerender();
          }
        });
        var del = w.querySelector('#n-del');
        if (del) del.addEventListener('click', function () {
          UI.confirm('이 워크시트를 목록에서 지울까요?', function () {
            Store.deleteNewsItem(n.id);
            UI.close(); UI.toast('삭제했습니다.'); App.rerender();
          }, { yes: '삭제' });
        });
      }
    });
  }

  function render(el) {
    el.innerHTML =
      '<div class="stack">' +
        levelTiles() +

        '<div class="card"><div class="card-h">' +
          '<h2>워크시트 목록</h2><div class="sp"></div>' +
          '<button class="btn primary" id="n-new">+ 워크시트 추가</button>' +
        '</div>' +
        '<div class="card-b">' +
          '<div class="row" style="margin-bottom:14px">' +
            '<input type="search" id="n-q" placeholder="제목·주제·메모로 찾기" style="flex:1;min-width:180px" value="' + U.esc(filter.q) + '">' +
            '<div class="chips">' +
              '<button class="chip' + (filter.level ? '' : ' on') + '" data-lv="">전체 레벨</button>' +
              Store.NEWS_LEVELS.map(function (lv) {
                return '<button class="chip' + (filter.level === lv ? ' on blue' : '') + '" data-lv="' + U.esc(lv) + '">' + U.esc(lv) + '</button>';
              }).join('') +
            '</div>' +
            '<div class="chips">' +
              '<button class="chip' + (filter.status ? '' : ' on') + '" data-st="">전체 상태</button>' +
              Store.NEWS_STATUS.map(function (st) {
                return '<button class="chip' + (filter.status === st ? ' on mint' : '') + '" data-st="' + U.esc(st) + '">' + U.esc(st) + '</button>';
              }).join('') +
            '</div>' +
          '</div>' +
          '<div class="table-wrap"><table class="tbl">' +
            '<thead><tr><th>기사</th><th>레벨</th><th>주제</th><th>상태</th><th>날짜</th><th></th></tr></thead>' +
            '<tbody id="n-rows">' + rows() + '</tbody>' +
          '</table></div>' +
        '</div></div>' +

        '<div class="card"><div class="card-h"><h2>새 워크시트 만들기</h2></div>' +
          '<div class="card-b">' +
            '<p class="hint" style="margin:0 0 12px">' +
              '워크시트 파일(원문·문제지·정답지 PDF)은 <b>노션</b>에서 자동으로 만들어집니다. ' +
              '노션의 <b>워크시트 만들기 요청</b> 표에 한 줄만 적어 두시면 한 시간에 한 번 처리되고, ' +
              '완성되면 <b>마스터 목록</b>에 쌓입니다.</p>' +
            '<p class="hint" style="margin:0 0 14px">' +
              '예) 요청 칸에 <code>K레벨 기사 한개 골라서 만들어줘</code> 라고 적고 상태를 <code>대기</code> 로 두시면 됩니다. ' +
              '이미 만든 기사는 자동으로 건너뜁니다.</p>' +
            '<div class="row">' +
              '<a class="btn primary" href="' + NOTION_REQUEST + '" target="_blank" rel="noopener">노션에서 만들기 요청 →</a>' +
              '<a class="btn" href="' + NOTION_MASTER + '" target="_blank" rel="noopener">노션 마스터 목록 →</a>' +
            '</div>' +
          '</div></div>' +
      '</div>';

    el.querySelector('#n-new').addEventListener('click', function () { openForm(); });

    UI.on(el, '[data-lv]', 'click', function (e, btn) {
      filter.level = btn.getAttribute('data-lv'); render(el);
    });
    UI.on(el, '[data-st]', 'click', function (e, btn) {
      filter.status = btn.getAttribute('data-st'); render(el);
    });
    UI.on(el, '[data-edit]', 'click', function (e, btn) { openForm(btn.getAttribute('data-edit')); });

    var q = el.querySelector('#n-q');
    q.addEventListener('input', function () {
      filter.q = q.value.trim();
      el.querySelector('#n-rows').innerHTML = rows();
    });
  }

  return { title: title, sub: sub, render: render };
})();
