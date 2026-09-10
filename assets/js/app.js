/* ===== 라우터 · 앱 부트스트랩 ===== */
var App = (function () {

  var viewEl, titleEl, subEl, navEl;
  var current = '';
  var currentQuery = {};

  function parseHash() {
    var h = (location.hash || '#/dashboard').replace(/^#\/?/, '');
    var qi = h.indexOf('?');
    var route = qi >= 0 ? h.slice(0, qi) : h;
    var query = {};
    if (qi >= 0) {
      h.slice(qi + 1).split('&').forEach(function (pair) {
        if (!pair) return;
        var kv = pair.split('=');
        query[decodeURIComponent(kv[0])] = decodeURIComponent((kv[1] || '').replace(/\+/g, ' '));
      });
    }
    return { route: route || 'dashboard', query: query };
  }

  function query() { return currentQuery; }

  function setTitle(t) { titleEl.textContent = t; document.title = t + ' · 고래영어 원생관리'; }
  function setSub(s) { subEl.textContent = s || ''; }

  function refreshBrand() {
    var ac = Store.get().academy;
    document.querySelector('.brand-text b').textContent = ac.name;
    document.getElementById('brand-campus').textContent = ac.campus || '';
    document.querySelector('.app-foot').textContent =
      [ac.name + ' ' + (ac.campus || ''), ac.address, ac.phone].filter(Boolean).join(' · ');
    var link = document.querySelector('.ext-link');
    if (ac.site) {
      link.href = ac.site;
      link.textContent = ac.site.replace(/^https?:\/\//, '') + ' ↗';
      link.style.display = '';
    } else {
      link.style.display = 'none';
    }
  }

  function renderMenu() {
    var items = Store.menuList();
    navEl.innerHTML = items.map(function (m) {
      return '<a href="#/' + m.route + '" data-route="' + m.route + '"><i>' + m.icon + '</i><span>' + m.label + '</span></a>';
    }).join('');
  }

  function highlight(route) {
    navEl.querySelectorAll('a').forEach(function (a) {
      a.classList.toggle('active', a.getAttribute('data-route') === route);
    });
  }

  function route() {
    var p = parseHash();
    current = p.route;
    currentQuery = p.query;

    /* 학부모용 읽기 전용 리포트 */
    if (current === 'report') {
      Views.share.renderReport(viewEl, p.query.d || '');
      return;
    }
    document.body.classList.remove('share-mode');

    /* 권한 검사 */
    if (!Store.userHasAccess(current)) {
      current = 'dashboard';
      if (!Store.userHasAccess('dashboard')) {
        UI.toast('접근 권한이 없습니다.', true);
        return;
      }
    }

    var view = Views[current] || Views.dashboard;
    if (!Views[current]) { current = 'dashboard'; }

    highlight(current);
    setTitle(view.title());
    setSub(view.sub());
    viewEl.scrollTop = 0;
    view.render(viewEl);
    closeSidebar();
  }

  /** 현재 화면 다시 그리기 (데이터 변경 후) */
  function rerender() {
    var view = Views[current];
    if (!view || current === 'report') return;
    setSub(view.sub());
    view.render(viewEl);
  }

  /* ---------- 모바일 사이드바 ---------- */
  function openSidebar() {
    document.getElementById('sidebar').classList.add('open');
    document.getElementById('backdrop').classList.add('on');
  }
  function closeSidebar() {
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('backdrop').classList.remove('on');
  }

  function showUserMenu() {
    var user = Store.currentUser();
    var roleLabel = { 'admin': '관리자', 'teacher': '강사', 'parent': '학부모', 'student': '학생' };
    var body = '<div style="display:grid;gap:16px">' +
      '<div>' +
        '<label style="display:block;font-weight:600;margin-bottom:8px">현재 사용자</label>' +
        '<div style="padding:12px;background:#f5f5f5;border-radius:6px">' +
          '<div style="font-weight:600">' + U.esc(user.name) + '</div>' +
          '<div style="font-size:13px;color:#666;margin-top:4px">역할: ' + (roleLabel[user.role] || user.role) + '</div>' +
        '</div>' +
      '</div>' +
      '<div>' +
        '<label style="display:block;font-weight:600;margin-bottom:8px">사용자명</label>' +
        '<input type="text" id="user-name-input" value="' + U.esc(user.name) + '" style="width:100%;box-sizing:border-box">' +
      '</div>' +
      '<div>' +
        '<label style="display:block;font-weight:600;margin-bottom:8px">역할</label>' +
        '<select id="role-select" style="width:100%;box-sizing:border-box">' +
          '<option value="admin"' + (user.role === 'admin' ? ' selected' : '') + '>관리자 (전체 접근)</option>' +
          '<option value="teacher"' + (user.role === 'teacher' ? ' selected' : '') + '>강사 (출결, 상담)</option>' +
          '<option value="parent"' + (user.role === 'parent' ? ' selected' : '') + '>학부모 (공유만)</option>' +
          '<option value="student"' + (user.role === 'student' ? ' selected' : '') + '>학생 (대시보드만)</option>' +
        '</select>' +
      '</div>' +
      '<p style="font-size:12.5px;color:#999;margin:0">현재 역할에 따라 접근할 수 있는 메뉴가 결정됩니다.</p>' +
    '</div>';

    UI.modal({
      title: '사용자 설정',
      body: body,
      footer: '<button class="btn" data-close>취소</button><button class="btn primary" id="user-save-btn">저장</button>',
      onMount: function (modalWrap) {
        document.getElementById('user-save-btn').addEventListener('click', function () {
          var role = document.getElementById('role-select').value;
          var name = document.getElementById('user-name-input').value;
          if (!name.trim()) { UI.toast('사용자명을 입력해 주세요.', true); return; }
          Store.setCurrentUser(role, name.trim());
          renderMenu();
          App.rerender();
          UI.close();
          UI.toast('사용자 설정이 저장되었습니다.');
        });
      }
    });
  }

  function boot() {
    viewEl = document.getElementById('view');
    titleEl = document.getElementById('page-title');
    subEl = document.getElementById('page-sub');
    navEl = document.getElementById('nav');

    document.getElementById('today-chip').textContent = U.human(U.ymd());
    document.getElementById('menu-toggle').addEventListener('click', openSidebar);
    document.getElementById('backdrop').addEventListener('click', closeSidebar);
    document.getElementById('user-menu-btn').addEventListener('click', showUserMenu);

    // 저장 가능 여부 안내
    try {
      localStorage.setItem('__t', '1');
      localStorage.removeItem('__t');
    } catch (e) {
      document.getElementById('storage-note').textContent = '⚠️ 저장 불가 (시크릿 모드)';
    }

    renderMenu();
    refreshBrand();
    window.addEventListener('hashchange', route);
    if (!location.hash) location.hash = '#/dashboard';
    route();
  }

  document.addEventListener('DOMContentLoaded', boot);

  return {
    rerender: rerender, setSub: setSub, setTitle: setTitle,
    refreshBrand: refreshBrand, query: query
  };
})();
