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
  var tab = 'list';                       // 'list' 워크시트 목록 · 'progress' 학생별 진도
  var pf = { classId: '', level: '' };    // 학생별 진도 거르기

  function title() { return '영자신문 워크시트'; }
  function sub() {
    var all = Store.newsItems();
    var done = all.filter(function (n) { return n.status === '완성'; }).length;
    return all.length
      ? '전체 ' + all.length + '건 · 완성 ' + done + '건'
      : 'Time for Kids 기사로 만드는 레벨별 워크시트';
  }

  /** 주소가 있을 때만 버튼을 내놓습니다. */
  function linkBtn(url, label) {
    if (!url) return '';
    return '<a class="btn sm" href="' + U.esc(url) + '" target="_blank" rel="noopener">' + label + '</a> ';
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
        '<td class="nm">' + U.esc(n.title) + doneCount(n.id) + '</td>' +
        '<td><span class="tag blue">' + U.esc(n.level || '-') + '</span></td>' +
        '<td>' + U.esc(n.topic || '-') + '</td>' +
        '<td>' + statusTag(n.status) + '</td>' +
        '<td>' + U.esc(n.date || '-') + '</td>' +
        '<td>' +
          // 노션 마스터 목록과 같은 이름·차례로 둡니다.
          // 원문은 음원 QR 이 들어간 인쇄용 PDF, 원문URL 은 기사 웹페이지입니다.
          linkBtn(n.articleUrl, '원문') +
          linkBtn(n.sourceUrl, '원문URL') +
          linkBtn(n.worksheetUrl, '워크시트') +
          linkBtn(n.answersUrl, '정답지') +
          '<button class="btn sm ghost" data-edit="' + n.id + '">수정</button>' +
        '</td>' +
      '</tr>';
    }).join('');
  }

  /** 목록에 '완료 3명 · 진행중 1명' 을 작게 붙입니다 */
  function doneCount(newsId) {
    var recs = Store.newsProgressFor(newsId);
    var done = recs.filter(function (x) { return x.status === '완료'; }).length;
    var doing = recs.length - done;
    if (!recs.length) return '';
    return '<div class="np-sub">' + (done ? '완료 ' + done + '명' : '') +
      (done && doing ? ' · ' : '') + (doing ? '진행중 ' + doing + '명' : '') + '</div>';
  }

  function tabsHtml() {
    return '<div class="seg np-tabs" role="tablist">' +
      '<button data-tab="list"' + (tab === 'list' ? ' class="on"' : '') + '>워크시트 목록</button>' +
      '<button data-tab="progress"' + (tab === 'progress' ? ' class="on"' : '') + '>학생별 진도</button>' +
    '</div>';
  }
  function bindTabs(el) {
    UI.on(el, '[data-tab]', 'click', function (e, btn) { tab = btn.getAttribute('data-tab'); render(el); });
  }

  /* ---------- 학생별 진도 ---------- */
  function progStudents() {
    return Store.students({ active: true }).filter(function (s) {
      if (pf.classId && s.classId !== pf.classId) return false;
      if (pf.level && Store.newsLevelOf(s) !== pf.level) return false;
      return true;
    });
  }

  function miniBar(done, total) {
    var w = total ? Math.round(done / total * 100) : 0;
    return '<div class="np-bar"><div class="np-track"><div class="np-fill" style="width:' + w + '%"></div></div>' +
      '<span class="np-num">' + done + '/' + total + '</span></div>';
  }

  function progRow(s) {
    var plan = Store.newsPlan(s.id);
    var sc = Store.scheduleOf(s);
    var lvSel = '<select class="np-lv" data-lvset="' + s.id + '">' +
      '<option value="">레벨 선택</option>' +
      Store.NEWS_LEVELS.map(function (lv) {
        return '<option value="' + lv + '"' + (s.newsLevel === lv ? ' selected' : '') + '>' + lv + '</option>';
      }).join('') + '</select>';

    var doing = plan.doing.length
      ? plan.doing.map(function (n) {
          return '<div class="np-item"><span class="tag warn">진행중</span> ' + U.esc(n.title) +
            ' <button class="btn sm" data-done="' + s.id + '|' + n.id + '">완료</button></div>';
        }).join('')
      : '<span class="np-none">-</span>';

    var next;
    if (!plan.level) next = '<span class="np-none">레벨을 정해 주세요</span>';
    else if (plan.next) next = '<div class="np-item">' + U.esc(plan.next.title) +
      ' <button class="btn sm primary" data-start="' + s.id + '|' + plan.next.id + '">시작</button></div>';
    else if (plan.total) next = '<span class="tag ok">' + U.esc(plan.level) + ' 모두 완료</span>';
    else next = '<span class="np-none">' + U.esc(plan.level) + ' 워크시트가 아직 없습니다</span>';

    var last = plan.lastDone
      ? U.esc(plan.lastDone.title) + '<div class="np-sub">' + U.esc(plan.lastDoneAt || '') + '</div>'
      : '<span class="np-none">-</span>';

    return '<tr>' +
      '<td class="nm"><button class="np-name" data-stu="' + s.id + '">' + U.esc(s.name) + '</button>' +
        '<div class="np-sub">' + U.esc([s.grade, sc.className].filter(Boolean).join(' · ') || '-') + '</div></td>' +
      '<td>' + lvSel + '</td>' +
      '<td>' + (plan.level ? miniBar(plan.doneInLevel, plan.total) : '<span class="np-none">-</span>') + '</td>' +
      '<td>' + doing + '</td>' +
      '<td>' + next + '</td>' +
      '<td>' + last + '</td>' +
    '</tr>';
  }

  function progSummary(list) {
    var doing = 0, waiting = 0, noLevel = 0;
    list.forEach(function (s) {
      var p = Store.newsPlan(s.id);
      if (!p.level) noLevel++;
      else if (p.doing.length) doing++;
      else if (p.next) waiting++;
    });
    return '<div class="grid g-3">' +
      '<div class="stat"><div class="lbl">하는 중</div><div class="val">' + doing + '<small>명</small></div><div class="sub">진행중인 워크시트가 있는 학생</div></div>' +
      '<div class="stat"><div class="lbl">다음 차례 대기</div><div class="val">' + waiting + '<small>명</small></div><div class="sub">끝내고 새 기사를 시작할 학생</div></div>' +
      '<div class="stat"><div class="lbl">레벨 미정</div><div class="val">' + noLevel + '<small>명</small></div><div class="sub">신문 레벨을 정해 주세요</div></div>' +
    '</div>';
  }

  function renderProgress(el) {
    var list = progStudents();
    var rowsHtml = list.length ? list.map(progRow).join('') :
      '<tr><td colspan="6">' + UI.emptyBox(Store.students({ active: true }).length
        ? '조건에 맞는 학생이 없습니다.' : '등록생이 없습니다. 학생 명부에서 먼저 등록해 주세요.', 'students') + '</td></tr>';
    el.innerHTML =
      '<div class="stack">' +
        tabsHtml() +
        progSummary(list) +
        '<div class="card"><div class="card-h"><h2>학생별 진도</h2></div>' +
        '<div class="card-b">' +
          '<div class="row" style="margin-bottom:14px">' +
            '<select id="np-class" style="width:150px">' +
              UI.options(Store.classes().map(function (c) { return { value: c.id, label: c.name }; }), pf.classId, '전체 반') +
            '</select>' +
            '<div class="chips">' +
              '<button class="chip' + (pf.level ? '' : ' on') + '" data-plv="">전체 레벨</button>' +
              Store.NEWS_LEVELS.map(function (lv) {
                return '<button class="chip' + (pf.level === lv ? ' on blue' : '') + '" data-plv="' + lv + '">' + lv + '</button>';
              }).join('') +
            '</div>' +
            (pf.classId
              ? '<div class="row np-bulk"><select id="np-bulk-lv" style="width:110px">' + UI.options(Store.NEWS_LEVELS, '', '레벨') + '</select>' +
                '<button class="btn sm" id="np-bulk">이 반 전체 지정</button></div>'
              : '') +
          '</div>' +
          '<p class="hint" style="margin:0 0 12px">학생마다 <b>신문 레벨</b>을 먼저 정해 주세요. 반을 고르면 반 전체를 한 번에 정할 수 있습니다. 다음 차례는 학생 레벨의 워크시트 중 아직 하지 않은 것을 오래된 순으로 보여 줍니다. ' +
            '<b>시작</b>을 누르면 진행중으로, <b>완료</b>를 누르면 끝낸 날짜와 함께 기록됩니다. 이름을 누르면 기사별로 고칠 수 있습니다.</p>' +
          '<div class="table-wrap"><table class="tbl">' +
            '<thead><tr><th>학생</th><th>신문 레벨</th><th>진도</th><th>하는 중</th><th>다음 차례</th><th>최근 완료</th></tr></thead>' +
            '<tbody>' + rowsHtml + '</tbody>' +
          '</table></div>' +
        '</div></div>' +
      '</div>';

    bindTabs(el);
    el.querySelector('#np-class').addEventListener('change', function (e) { pf.classId = e.target.value; render(el); });
    var bulk = el.querySelector('#np-bulk');
    if (bulk) bulk.addEventListener('click', function () {
      var lv = el.querySelector('#np-bulk-lv').value;
      if (!lv) { UI.toast('지정할 레벨을 골라 주세요.', true); return; }
      var targets = Store.studentsInClass(pf.classId).filter(function (s) { return s.status === '등록생'; });
      var name = (Store.klass(pf.classId) || {}).name || '';
      UI.confirm(U.esc(name) + ' 등록생 ' + targets.length + '명의 신문 레벨을 ' + lv + ' 로 정할까요?', function () {
        targets.forEach(function (s) { Store.saveStudent({ id: s.id, newsLevel: lv }); });
        UI.toast(targets.length + '명을 ' + lv + ' 로 정했습니다.'); render(el);
      }, { yes: '지정' });
    });
    UI.on(el, '[data-plv]', 'click', function (e, b) { pf.level = b.getAttribute('data-plv'); render(el); });
    UI.on(el, '[data-lvset]', 'change', function (e, sel) {
      Store.saveStudent({ id: sel.getAttribute('data-lvset'), newsLevel: sel.value });
      UI.toast('신문 레벨을 바꿨습니다.'); render(el);
    });
    UI.on(el, '[data-start]', 'click', function (e, b) {
      var p = b.getAttribute('data-start').split('|');
      Store.setNewsProgress(p[0], p[1], '진행중'); UI.toast('시작으로 기록했습니다.'); render(el);
    });
    UI.on(el, '[data-done]', 'click', function (e, b) {
      var p = b.getAttribute('data-done').split('|');
      Store.setNewsProgress(p[0], p[1], '완료'); UI.toast('완료로 기록했습니다.'); render(el);
    });
    UI.on(el, '[data-stu]', 'click', function (e, b) { openStudent(b.getAttribute('data-stu'), el); });
  }

  /** 학생 한 명의 기사별 기록 — 순서를 건너뛰거나 잘못 누른 것을 고칠 때 */
  function openStudent(id, host) {
    var s = Store.student(id);
    if (!s) return;
    function body() {
      var plan = Store.newsPlan(id);
      var items = plan.pool.slice();
      // 다른 레벨에서 한 기록도 함께 보여 줍니다
      Store.newsProgressOf(id).forEach(function (x) {
        if (!items.some(function (n) { return n.id === x.newsId; })) items.push(Store.newsItem(x.newsId));
      });
      if (!items.length) return UI.emptyBox(plan.level ? plan.level + ' 워크시트가 아직 없습니다.' : '신문 레벨을 먼저 정해 주세요.', 'news');
      return '<p class="hint" style="margin:0 0 10px">' + U.esc(s.name) + ' · 신문 레벨 ' + U.esc(plan.level || '미정') +
        ' · 완료 ' + plan.doneInLevel + '/' + plan.total + '</p>' +
        '<div class="np-list">' + items.map(function (n) {
          var r = plan.byNews[n.id];
          var st = r ? r.status : '';
          var when = r ? (r.status === '완료' ? r.doneAt + ' 완료' : r.startedAt + ' 시작') : '';
          var isNext = plan.next && plan.next.id === n.id;
          return '<div class="np-li">' +
            '<div class="np-li-t"><b>' + U.esc(n.title) + '</b> <span class="tag blue">' + U.esc(n.level) + '</span>' +
              (isNext ? ' <span class="tag ok">다음 차례</span>' : '') +
              '<div class="np-sub">' + U.esc(n.topic || '') + (when ? ' · ' + U.esc(when) : '') +
              (n.worksheetUrl ? ' · <a href="' + U.esc(n.worksheetUrl) + '" target="_blank" rel="noopener">워크시트</a>' : '') + '</div></div>' +
            '<div class="seg">' +
              ['', '진행중', '완료'].map(function (v) {
                return '<button data-set="' + n.id + '|' + v + '"' + (st === v ? ' class="on"' : '') + '>' + (v || '안 함') + '</button>';
              }).join('') +
            '</div></div>';
        }).join('') + '</div>';
    }
    UI.modal({
      title: s.name + ' · 영자신문 진도',
      body: '<div id="np-body">' + body() + '</div>',
      footer: '<div class="sp"></div><button class="btn" data-close>닫기</button>',
      onMount: function (w) {
        UI.on(w, '[data-set]', 'click', function (e, b) {
          var p = b.getAttribute('data-set').split('|');
          Store.setNewsProgress(id, p[0], p[1]);
          w.querySelector('#np-body').innerHTML = body();
          render(host);
        });
      }
    });
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
        '<label class="fld full">원문 <span style="font-weight:400">(음원 QR 이 들어간 인쇄용 PDF)</span>' +
          '<input type="text" id="n-art" value="' + U.esc(n.articleUrl || '') + '" placeholder="/assets/pdf/..."></label>' +
        '<label class="fld full">원문URL <span style="font-weight:400">(기사 웹페이지)</span>' +
          '<input type="text" id="n-src" value="' + U.esc(n.sourceUrl || '') + '" placeholder="https://www.timeforkids.com/..."></label>' +
        '<label class="fld full">워크시트 <span style="font-weight:400">(문제지 PDF)</span>' +
          '<input type="text" id="n-ws" value="' + U.esc(n.worksheetUrl || '') + '" placeholder="/assets/pdf/..."></label>' +
        '<label class="fld full">정답지 <span style="font-weight:400">(채점용 PDF)</span>' +
          '<input type="text" id="n-ans" value="' + U.esc(n.answersUrl || '') + '" placeholder="/assets/pdf/..."></label>' +
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
    if (tab === 'progress') { renderProgress(el); return; }
    el.innerHTML =
      '<div class="stack">' +
        tabsHtml() +
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
              '노션의 <b>워크시트 만들기 요청</b> 표에 한 줄만 적어 두시면 평일 오후 1~6시에 보통 1~2시간 안에 처리되고, ' +
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

    bindTabs(el);
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
