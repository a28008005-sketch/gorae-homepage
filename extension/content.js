/* 고래영어 성적 연동 — 본사 성적 목록 읽기
 *
 * englishwhale.com/pt/grade_list.php 화면의 표를 찾아 줄마다 아래 모양으로 만듭니다.
 *   { no, name, school, grade, exam, links: [{ label, url }], registeredAt }
 *
 * 칸 순서가 아니라 머리줄 글자(번호·학생명·학교·학년·시험명·성적표/인증서·등록일시)로 칸을 찾으므로,
 * 본사 화면의 칸 순서가 바뀌어도 이름만 같으면 그대로 읽힙니다.
 * 원생관리 화면(assets/js/views/grades.js)의 '표 붙여넣기' 와 같은 규칙입니다.
 *
 * 화면에 보이는 표 내용만 읽습니다. 로그인 정보·쿠키는 읽지도, 보내지도 않습니다.
 */
(function () {
  'use strict';
  if (window.__goraeGradeScraper) return;   // 두 번 들어와도 한 번만 등록
  window.__goraeGradeScraper = true;

  var COLS = {
    no: /^(no\.?|번호|순번)$/i,
    name: /(학생명|이름|성명|학생)/,
    school: /학교/,
    grade: /학년/,
    exam: /(시험명|시험|평가명|테스트)/,
    registeredAt: /(등록일|등록일시|일시|응시일|날짜)/
  };
  var LINK_COL = /(성적표|인증서|링크|보기|출력)/;
  var DATE_LIKE = /^\d{4}[-.\/]\d{1,2}[-.\/]\d{1,2}/;

  function clean(s) {
    return String(s || '').replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
  }
  function cellText(el) {
    return clean(el ? (el.innerText || el.textContent) : '');
  }

  /** 머리줄 글자로 칸 위치를 찾습니다. links 는 여러 칸일 수 있습니다(성적표 · 인증서 따로). */
  function mapHeader(cells) {
    var map = { links: [] };
    cells.forEach(function (raw, i) {
      var t = clean(raw).replace(/\s+/g, '');
      if (!t) return;
      if (LINK_COL.test(t) && !/일시|날짜/.test(t)) { map.links.push(i); return; }
      Object.keys(COLS).forEach(function (k) {
        if (map[k] !== undefined) return;
        if (k === 'name' && /학교|학년/.test(t)) return;
        if (COLS[k].test(t)) map[k] = i;
      });
    });
    return map;
  }

  /** 행의 칸들 — colspan 을 펼쳐서 머리줄 위치와 맞춥니다. */
  function rowCells(tr) {
    var out = [];
    Array.prototype.forEach.call(tr.children, function (c) {
      if (!/^(TD|TH)$/.test(c.tagName)) return;
      var span = Math.max(1, parseInt(c.getAttribute('colspan') || '1', 10) || 1);
      for (var i = 0; i < span; i++) out.push(c);
    });
    return out;
  }

  /** 페이지 안의 표 중에서 성적 목록 표를 고릅니다 (학생명·시험명 칸이 있는 표). */
  function findGradeTable() {
    var best = null;
    Array.prototype.forEach.call(document.querySelectorAll('table'), function (table) {
      var rows = Array.prototype.slice.call(table.rows || []);
      for (var i = 0; i < Math.min(rows.length, 4); i++) {
        var cells = rowCells(rows[i]);
        var map = mapHeader(cells.map(cellText));
        if (map.name !== undefined && map.exam !== undefined) {
          var body = rows.slice(i + 1).filter(function (r) { return r.querySelector('td'); }).length;
          // 표가 겹쳐 있으면(바깥 레이아웃 표) 안쪽의 실제 목록 표가 더 정확합니다
          if (!best || body > best.body || (body === best.body && best.table.contains(table))) {
            best = { table: table, headerIndex: i, map: map, body: body };
          }
          break;
        }
      }
    });
    return best;
  }

  /** 'javascript:openPop("grade_view.php?idx=3")' 같은 곳에서 주소를 뽑습니다. */
  function urlFrom(str) {
    var s = String(str || '');
    var m = s.match(/['"]((?:https?:\/\/|\/|\.{0,2}\/?)[^'"\s]*?\.(?:php|html?|pdf|jpg|jpeg|png)(?:\?[^'"\s]*)?)['"]/i) ||
            s.match(/['"](https?:\/\/[^'"\s]+)['"]/i);
    return m ? m[1] : '';
  }
  function absolute(u) {
    try { return new URL(u, location.href).href; } catch (e) { return ''; }
  }

  /** 한 칸 안의 성적표 · 인증서 링크 */
  function linksIn(cell, fallbackLabel) {
    var out = [];
    var seen = {};
    var nodes = cell.querySelectorAll('a, button, input[type="button"], img[onclick], span[onclick], [onclick]');
    Array.prototype.forEach.call(nodes, function (n) {
      var href = n.getAttribute('href') || '';
      var raw = href && !/^\s*(javascript:|#)/i.test(href) ? href : urlFrom(href + ' ' + (n.getAttribute('onclick') || ''));
      if (!raw) return;
      var url = absolute(raw);
      if (!url || seen[url]) return;
      seen[url] = true;
      var label = clean(n.innerText || n.value || n.getAttribute('title') || n.getAttribute('alt') ||
        (n.querySelector('img') && n.querySelector('img').getAttribute('alt'))) || fallbackLabel || '링크';
      out.push({ label: label.slice(0, 30), url: url });
    });
    return out;
  }

  function scrape() {
    var found = findGradeTable();
    if (!found) {
      return { ok: false, rows: [], pageUrl: location.href,
        message: '이 화면에서 성적 표(학생명 · 시험명 칸)를 찾지 못했습니다.' };
    }
    var headerCells = rowCells(found.table.rows[found.headerIndex]).map(cellText);
    var map = found.map;
    var rows = [];
    Array.prototype.slice.call(found.table.rows, found.headerIndex + 1).forEach(function (tr) {
      var cells = rowCells(tr);
      if (cells.length < 3) return;                     // '자료가 없습니다' 같은 한 칸짜리 줄
      function at(k) { return map[k] === undefined ? '' : cellText(cells[map[k]]); }

      var links = [];
      var linkCols = map.links.length ? map.links : cells.map(function (_, i) { return i; });
      linkCols.forEach(function (i) {
        if (!cells[i]) return;
        var hl = clean(headerCells[i]);
        linksIn(cells[i], LINK_COL.test(hl) ? hl : '').forEach(function (l) {
          if (!links.some(function (x) { return x.url === l.url; })) links.push(l);
        });
      });

      var reg = at('registeredAt');
      if (!reg) {
        for (var j = cells.length - 1; j >= 0; j--) {
          var t = cellText(cells[j]);
          if (DATE_LIKE.test(t)) { reg = t; break; }
        }
      }
      var row = {
        no: at('no'),
        // '홍길동(hong12)' 처럼 아이디가 붙어 있으면 이름만 남깁니다
        name: at('name').replace(/\s*[\(\[].*?[\)\]]\s*$/, ''),
        school: at('school'),
        grade: at('grade'),
        exam: at('exam'),
        links: links,
        registeredAt: reg.replace(/\./g, '-').replace(/\//g, '-').replace(/-$/, '')
      };
      if (!row.name || !row.exam) return;
      rows.push(row);
    });
    return {
      ok: rows.length > 0, rows: rows, pageUrl: location.href, title: document.title,
      message: rows.length ? rows.length + '건을 찾았습니다.' : '표는 찾았지만 읽을 줄이 없습니다.'
    };
  }

  chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
    if (msg && msg.type === 'GORAE_SCRAPE') {
      var res;
      try { res = scrape(); } catch (e) { res = { ok: false, rows: [], message: '읽는 중 오류: ' + e.message }; }
      // 여러 프레임에 들어 있을 때, 표가 없는 프레임은 대답하지 않아 표가 있는 프레임의 대답이 쓰이게 합니다.
      // 맨 바깥 화면은 '못 찾음' 을 조금 늦게 보내 안쪽 프레임이 먼저 대답할 틈을 줍니다.
      if (res.ok) { sendResponse(res); return; }
      if (window === window.top) {
        setTimeout(function () { sendResponse(res); }, 400);
        return true;
      }
    }
  });
})();
