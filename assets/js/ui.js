/* ===== 공통 UI 헬퍼 (토스트 · 모달 · 반복 렌더) ===== */
var UI = (function () {

  /* ---------- 토스트 ---------- */
  function toast(msg, isBad) {
    var root = document.getElementById('toast-root');
    var el = document.createElement('div');
    el.className = 'toast' + (isBad ? ' bad' : '');
    el.textContent = msg;
    root.appendChild(el);
    setTimeout(function () {
      el.style.transition = 'opacity .25s';
      el.style.opacity = '0';
      setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 260);
    }, 2200);
  }

  /* ---------- 모달 ---------- */
  var openModal = null;

  function modal(opts) {
    close();
    var wrap = document.createElement('div');
    wrap.className = 'modal-wrap';
    wrap.innerHTML =
      '<div class="modal-bg"></div>' +
      '<div class="modal' + (opts.wide ? ' wide' : '') + '">' +
        '<div class="modal-h"><h3>' + U.esc(opts.title || '') + '</h3><div class="sp"></div>' +
          '<button class="x-btn" data-close style="font-size:20px">&times;</button></div>' +
        '<div class="modal-b">' + (opts.body || '') + '</div>' +
        (opts.footer === false ? '' : '<div class="modal-f">' + (opts.footer || '<button class="btn" data-close>닫기</button>') + '</div>') +
      '</div>';
    document.getElementById('modal-root').appendChild(wrap);
    openModal = wrap;

    wrap.querySelector('.modal-bg').addEventListener('click', close);
    wrap.querySelectorAll('[data-close]').forEach(function (b) {
      b.addEventListener('click', close);
    });
    if (opts.onMount) opts.onMount(wrap);
    return wrap;
  }

  function close() {
    if (openModal && openModal.parentNode) openModal.parentNode.removeChild(openModal);
    openModal = null;
  }

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') close();
  });

  /** 확인 대화상자 */
  function confirm(msg, onYes, opts) {
    opts = opts || {};
    modal({
      title: opts.title || '확인',
      body: '<p style="margin:0;font-size:14px;line-height:1.7">' + msg + '</p>',
      footer: '<button class="btn" data-close>취소</button>' +
              '<button class="btn ' + (opts.danger ? 'danger' : 'primary') + '" id="confirm-yes">' +
              U.esc(opts.yes || '확인') + '</button>',
      onMount: function (w) {
        w.querySelector('#confirm-yes').addEventListener('click', function () {
          close(); onYes();
        });
      }
    });
  }

  /* ---------- 렌더 헬퍼 ---------- */
  function statusTag(status) {
    var map = { '등록생': 'ok', '대기생': 'blue', '휴원생': 'gray', '퇴원생': 'gray' };
    return '<span class="tag ' + (map[status] || 'gray') + '">' + U.esc(status || '-') + '</span>';
  }

  function attTag(rec) {
    if (!rec || !rec.status) return '<span class="tag gray">미체크</span>';
    if (rec.status === '결석') return '<span class="tag bad">결석</span>';
    var flags = rec.flags || [];
    if (flags.length) return '<span class="tag warn">출석 · ' + U.esc(flags.join('/')) + '</span>';
    return '<span class="tag ok">출석</span>';
  }

  function emptyBox(msg, icon) {
    return '<div class="empty"><span class="big">' + (icon || '🐋') + '</span>' + U.esc(msg) + '</div>';
  }

  function bar(name, value, max, suffix) {
    var w = max ? Math.min(100, (value / max) * 100) : 0;
    return '<div class="bar-row">' +
      '<div class="bar-name">' + U.esc(name) + '</div>' +
      '<div class="bar-track"><div class="bar-fill' + (w < 60 ? ' low' : '') + '" style="width:' + w + '%"></div></div>' +
      '<div class="bar-val">' + value + (suffix || '') + '</div></div>';
  }

  /** select 옵션 문자열 */
  function options(list, selected, placeholder) {
    var out = placeholder ? '<option value="">' + U.esc(placeholder) + '</option>' : '';
    list.forEach(function (v) {
      var val = (typeof v === 'object') ? v.value : v;
      var lab = (typeof v === 'object') ? v.label : v;
      out += '<option value="' + U.esc(val) + '"' + (String(selected) === String(val) ? ' selected' : '') + '>' + U.esc(lab) + '</option>';
    });
    return out;
  }

  /** 이벤트 위임 */
  function on(root, selector, type, handler) {
    root.addEventListener(type, function (e) {
      var el = e.target.closest(selector);
      if (el && root.contains(el)) handler(e, el);
    });
  }

  return {
    toast: toast, modal: modal, close: close, confirm: confirm,
    statusTag: statusTag, attTag: attTag, emptyBox: emptyBox, bar: bar,
    options: options, on: on
  };
})();
