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

  function highlight(route) {
    navEl.querySelectorAll('a').forEach(function (a) {
      a.classList.toggle('active', a.getAttribute('data-route') === route);
    });
  }

  function route() {
    var p = parseHash();
    current = p.route;
    currentQuery = p.query;

    /* 학부모용 읽기 전용 화면 (학습 리포트 · 납부 확인서) */
    if (current === 'report') {
      Views.share.renderReport(viewEl, p.query.d || '');
      return;
    }
    if (current === 'receipt') {
      Views.tuition.renderReceipt(viewEl, p.query.d || '');
      return;
    }
    document.body.classList.remove('share-mode');

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
    if (!view || current === 'report' || current === 'receipt') return;
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

  function boot() {
    viewEl = document.getElementById('view');
    titleEl = document.getElementById('page-title');
    subEl = document.getElementById('page-sub');
    navEl = document.getElementById('nav');

    document.getElementById('today-chip').textContent = U.human(U.ymd());
    document.getElementById('menu-toggle').addEventListener('click', openSidebar);
    document.getElementById('backdrop').addEventListener('click', closeSidebar);

    // 저장 가능 여부 안내
    try {
      localStorage.setItem('__t', '1');
      localStorage.removeItem('__t');
    } catch (e) {
      document.getElementById('storage-note').textContent = '⚠️ 저장 불가 (시크릿 모드)';
    }

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
