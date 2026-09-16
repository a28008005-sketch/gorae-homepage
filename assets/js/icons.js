/* ===== 아이콘 =====
 *
 * 화면 곳곳에 쓰던 이모지(📊 🧒 ✅ …)를 선으로 그린 아이콘으로 바꿉니다.
 * 이모지는 기기마다 모양과 색이 달라 화면이 들쭉날쭉해 보였습니다.
 * 여기 아이콘은 글자색(currentColor)을 따라가므로 어디에 놓아도 톤이 맞습니다.
 *
 * 쓰는 법
 *   HTML 안:  <i data-icon="students"></i>   → 화면이 뜰 때 자동으로 채워집니다
 *   JS 안:    Icon.svg('students', 18)       → SVG 문자열을 돌려줍니다
 */
var Icon = (function () {

  /* 24x24 기준, 선 굵기 1.6. path 만 적어 둡니다. */
  var PATH = {
    dashboard:  '<rect x="3" y="3" width="7.5" height="7.5" rx="1.6"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.6"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="1.6"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.6"/>',
    students:   '<circle cx="9" cy="8" r="3.2"/><path d="M3.2 19.2c0-3.1 2.6-5.2 5.8-5.2s5.8 2.1 5.8 5.2"/><path d="M16.4 5.2a3.2 3.2 0 0 1 0 6.1"/><path d="M17.6 14.3c2.1.5 3.4 2.2 3.4 4.4"/>',
    attendance: '<rect x="3.2" y="4.4" width="17.6" height="16.4" rx="2.2"/><path d="M8 2.6v3.6M16 2.6v3.6M3.2 9.4h17.6"/><path d="M9 14.6l2.1 2.1 4-4.1"/>',
    homework:   '<path d="M8.4 4.2H6.6a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h10.8a2 2 0 0 0 2-2v-13a2 2 0 0 0-2-2h-1.8"/><rect x="8.4" y="2.4" width="7.2" height="3.6" rx="1.3"/><path d="M8.6 11.4h6.8M8.6 15.4h4.6"/>',
    vocab:      '<path d="M3.4 18.6L8.6 5.4h1.2l5.2 13.2"/><path d="M5.4 14.2h7.6"/><path d="M17.6 18.6v-6.4a2.4 2.4 0 1 1 4.8 0v6.4"/><path d="M17.6 15.4h4.8"/>',
    library:    '<path d="M3.6 5.4a2 2 0 0 1 2-2h4.2a2.2 2.2 0 0 1 2.2 2.2v14a1.8 1.8 0 0 0-1.8-1.8H3.6z"/><path d="M20.4 5.4a2 2 0 0 0-2-2h-4.2A2.2 2.2 0 0 0 12 5.6v14a1.8 1.8 0 0 1 1.8-1.8h6.6z"/>',
    classes:    '<rect x="3.2" y="4.6" width="17.6" height="16.2" rx="2.2"/><path d="M8 2.8v3.6M16 2.8v3.6M3.2 9.6h17.6"/><path d="M7.4 13.2h3M13.6 13.2h3M7.4 17h3M13.6 17h3"/>',
    tuition:    '<rect x="2.6" y="5" width="18.8" height="14" rx="2.4"/><path d="M2.6 9.8h18.8"/><path d="M6.4 14.8h3.4"/>',
    stats:      '<path d="M3.4 20.4h17.2"/><rect x="5.2" y="12" width="3.4" height="6"/><rect x="10.4" y="7.6" width="3.4" height="10.4"/><rect x="15.6" y="4" width="3.4" height="14"/>',
    share:      '<rect x="2.8" y="4.8" width="18.4" height="14.4" rx="2.2"/><path d="M3.6 6.6l7.5 5.8a1.4 1.4 0 0 0 1.8 0l7.5-5.8"/>',
    settings:   '<circle cx="12" cy="12" r="3.1"/><path d="M19.2 14.6a1.5 1.5 0 0 0 .3 1.7l.1.1a1.8 1.8 0 1 1-2.6 2.6l-.1-.1a1.5 1.5 0 0 0-1.7-.3 1.5 1.5 0 0 0-.9 1.4v.3a1.8 1.8 0 1 1-3.6 0v-.2a1.5 1.5 0 0 0-1-1.4 1.5 1.5 0 0 0-1.7.3l-.1.1a1.8 1.8 0 1 1-2.6-2.6l.1-.1a1.5 1.5 0 0 0 .3-1.7 1.5 1.5 0 0 0-1.4-.9h-.3a1.8 1.8 0 1 1 0-3.6h.2a1.5 1.5 0 0 0 1.4-1 1.5 1.5 0 0 0-.3-1.7l-.1-.1a1.8 1.8 0 1 1 2.6-2.6l.1.1a1.5 1.5 0 0 0 1.7.3h.1a1.5 1.5 0 0 0 .9-1.4v-.3a1.8 1.8 0 1 1 3.6 0v.2a1.5 1.5 0 0 0 .9 1.4 1.5 1.5 0 0 0 1.7-.3l.1-.1a1.8 1.8 0 1 1 2.6 2.6l-.1.1a1.5 1.5 0 0 0-.3 1.7v.1a1.5 1.5 0 0 0 1.4.9h.3a1.8 1.8 0 1 1 0 3.6h-.2a1.5 1.5 0 0 0-1.4.9z"/>',

    /* 화면 안에서 쓰는 것들 */
    check:      '<circle cx="12" cy="12" r="8.8"/><path d="M8.2 12.2l2.6 2.6 5-5.2"/>',
    calendar:   '<rect x="3.2" y="4.6" width="17.6" height="16.2" rx="2.2"/><path d="M8 2.8v3.6M16 2.8v3.6M3.2 9.6h17.6"/>',
    smile:      '<circle cx="12" cy="12" r="8.8"/><path d="M8.6 14.2c.8 1.2 2 1.9 3.4 1.9s2.6-.7 3.4-1.9"/><path d="M9.4 9.6h.01M14.6 9.6h.01"/>',
    coin:       '<ellipse cx="12" cy="6.6" rx="7.6" ry="3.2"/><path d="M4.4 6.6v10.8c0 1.8 3.4 3.2 7.6 3.2s7.6-1.4 7.6-3.2V6.6"/><path d="M4.4 12c0 1.8 3.4 3.2 7.6 3.2s7.6-1.4 7.6-3.2"/>',
    book:       '<path d="M4 4.4a1.8 1.8 0 0 1 1.8-1.8h11.6a1.4 1.4 0 0 1 1.4 1.4v14.4H5.8A1.8 1.8 0 0 0 4 20.2z"/><path d="M4 19.6a1.8 1.8 0 0 1 1.8-1.8h13"/>',
    flame:      '<path d="M12 21.4c3.5 0 6.2-2.6 6.2-6 0-3.9-3.2-5.7-4.4-9.8-.2-.7-1-1-1.5-.5-1.6 1.5-2.4 3.2-2.4 4.8 0 1 .3 1.8.6 2.5-1-.3-1.7-1-2.1-1.9-.3-.6-1.1-.6-1.4 0a7 7 0 0 0-.8 3.3c0 3.8 2.6 7.6 5.8 7.6z"/>',
    moon:       '<path d="M20 14.6A8.6 8.6 0 0 1 9.4 4 8.8 8.8 0 1 0 20 14.6z"/>',
    cloud:      '<path d="M6.8 18.6a4.4 4.4 0 0 1-.6-8.8 5.8 5.8 0 0 1 11.2-1.2 4 4 0 0 1-.6 10z"/>',
    search:     '<circle cx="10.8" cy="10.8" r="6.6"/><path d="M15.6 15.6l4.6 4.6"/>',
    alert:      '<path d="M12 3.4l9 15.6H3z"/><path d="M12 9.6v4M12 16.4h.01"/>',
    inbox:      '<path d="M3.2 13.2h4.2l1.4 2.6h6.4l1.4-2.6h4.2"/><path d="M6 4.6h12l3 8.6v4.2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4.2z"/>',
    receipt:    '<path d="M5.4 2.8h13.2v18.4l-2.2-1.4-2.2 1.4-2.2-1.4-2.2 1.4-2.2-1.4-2.2 1.4z"/><path d="M9 8h6M9 12h6"/>',
    device:     '<rect x="5" y="2.6" width="14" height="18.8" rx="2.4"/><path d="M10.4 18.6h3.2"/>',
    /* 로고의 'W + 고래 꼬리' 를 한 획으로 옮긴 마크입니다. */
    whale:      '<path d="M2.6 6.8l3.5 10.6L10.2 9l3.6 8.4 2.4-5.6"/><path d="M16.2 11.8c1.9-.2 3.4-1.3 4.4-3.2.3-.6 1.2-.4 1.2.3 0 2.4-1 4.5-2.9 5.9-.5.4-1.3.1-1.5-.5z"/>'
  };

  var FILLED = { flame: 1, moon: 1 };

  function svg(name, size) {
    var d = PATH[name];
    if (!d) return '';
    var s = size || 18;
    return '<svg viewBox="0 0 24 24" width="' + s + '" height="' + s + '" ' +
      'fill="' + (FILLED[name] ? 'currentColor' : 'none') + '" ' +
      'stroke="' + (FILLED[name] ? 'none' : 'currentColor') + '" ' +
      'stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" ' +
      'aria-hidden="true" focusable="false">' + d + '</svg>';
  }

  /** data-icon 이 붙은 자리를 모두 채웁니다. */
  function paint(root) {
    var host = root || document;
    var list = host.querySelectorAll('[data-icon]');
    for (var i = 0; i < list.length; i++) {
      var el = list[i];
      if (el.getAttribute('data-icon-done')) continue;
      el.innerHTML = svg(el.getAttribute('data-icon'), Number(el.getAttribute('data-icon-size')) || 18);
      el.setAttribute('data-icon-done', '1');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { paint(); });
  } else {
    paint();
  }

  return { svg: svg, paint: paint, has: function (n) { return !!PATH[n]; } };
})();
