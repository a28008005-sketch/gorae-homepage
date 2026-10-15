/* ===== 성적 관리 =====
 * 예전 '통계' 와 '학부모 공유' 메뉴를 한곳으로 모았습니다. 탭 네 개로 나뉩니다.
 *  ① 시험 기록  — 본사 성적 목록(englishwhale.com)에서 가져온 시험 기록
 *                 (크롬 확장 프로그램 '고래영어 성적 연동' 또는 표 붙여넣기)
 *  ② 상담 이력  — 학생별 상담 기록. 다음 확인일(팔로우업)을 정해 두고 후속 상담으로 이어 씁니다.
 *  ③ 통계       — Views.stats 를 그대로 씁니다
 *  ④ 학부모 리포트 — Views.share 를 그대로 씁니다
 */
window.Views = window.Views || {};
Views.grades = (function () {

  var TABS = [
    { id: 'records', label: '시험 기록' },
    { id: 'counsel', label: '상담 이력' },
    { id: 'stats',   label: '통계' },
    { id: 'report',  label: '학부모 리포트' }
  ];
  var tab = 'records';
  var appliedHash = '';     // 주소에 적힌 탭·학생은 주소가 바뀌었을 때 한 번만 따릅니다
  var host = null;
  var pendingImport = null; // 확장 프로그램이 보낸, 아직 확인하지 않은 성적

  var rf = { q: '', studentId: '', unlinked: false };            // 시험 기록 거르기
  var cf = { studentId: '', topic: '', q: '' };                   // 상담 이력 거르기

  function isTab(t) { return TABS.some(function (x) { return x.id === t; }); }
  function setTab(t) { if (isTab(t)) tab = t; }

  function title() { return '성적 관리'; }
  function sub() {
    if (tab === 'stats') return Views.stats.sub();
    if (tab === 'report') return Views.share.sub();
    if (tab === 'counsel') return '학생별 상담 내용과 다음 확인(팔로우업)을 이어서 기록합니다';
    return '본사 성적 목록에서 가져온 시험 기록을 학생별로 모읍니다';
  }

  /* ---------- 공통 ---------- */
  function studentOptions(selected, placeholder) {
    return UI.options(Store.students({ includeArchived: true }).map(function (s) {
      return { value: s.id, label: s.name + (s.grade ? ' · ' + s.grade : '') + (s.archived ? ' (퇴원)' : '') };
    }), selected, placeholder);
  }
  function studentName(id) {
    var s = id ? Store.student(id) : null;
    return s ? s.name : '';
  }
  function gradeKey(g) {
    return [String(g.name || '').trim(), String(g.exam || '').trim(), String(g.registeredAt || '').trim()].join('|');
  }
  /** '2026-10-15 14:03:22' 처럼 들어온 등록일시를 보기 좋게 */
  function regDate(v) {
    var s = String(v || '');
    return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 16) : (s || '-');
  }
  function linksHtml(links) {
    return (links || []).map(function (l) {
      return '<a class="tag blue" href="' + U.esc(l.url) + '" target="_blank" rel="noopener" data-stop>' +
        U.esc(l.label || '링크') + ' ↗</a>';
    }).join(' ');
  }

  /* ============================================================
   * ① 시험 기록
   * ============================================================ */
  function renderRecords(root) {
    var all = Store.grades();
    var unlinked = Store.grades({ unlinked: true }).length;
    var list = Store.grades({ q: rf.q, studentId: rf.studentId, unlinked: rf.unlinked });
    var lastImport = all.reduce(function (m, g) { return g.importedAt && g.importedAt > m ? g.importedAt : m; }, '');
    var sel = rf.studentId ? Store.student(rf.studentId) : null;

    root.innerHTML =
      '<div class="card" style="margin:16px 0"><div class="card-b" style="padding:14px 16px">' +
        '<div class="row">' +
          '<div><b style="font-size:14px">본사 성적 가져오기</b>' +
            '<div class="hint" style="margin-top:2px">' +
              (lastImport ? '마지막으로 가져온 때 ' + U.esc(lastImport.slice(0, 10)) + ' · ' : '') +
              '전체 ' + all.length + '건' +
              (unlinked ? ' · <b style="color:#963934">명부에 연결 안 된 기록 ' + unlinked + '건</b>' : '') +
            '</div></div>' +
          '<div class="sp"></div>' +
          '<button class="btn" id="gr-ext">확장 프로그램 안내</button>' +
          '<button class="btn" id="gr-paste">표 붙여넣기로 가져오기</button>' +
          '<button class="btn" id="gr-csv">CSV 내보내기</button>' +
          '<button class="btn primary" id="gr-add">+ 직접 입력</button>' +
        '</div></div></div>' +

      '<div class="card"><div class="card-b" style="padding-bottom:8px">' +
        '<div class="row">' +
          '<input type="search" id="gr-q" placeholder="학생 · 학교 · 시험명 검색" value="' + U.esc(rf.q) + '" style="flex:1;min-width:180px">' +
          '<select id="gr-stu" style="width:170px">' + studentOptions(rf.studentId, '전체 학생') + '</select>' +
          '<label class="check' + (rf.unlinked ? ' on' : '') + '"><input type="checkbox" id="gr-unlinked"' +
            (rf.unlinked ? ' checked' : '') + '>명부 미연결만</label>' +
        '</div>' +
        (sel
          ? '<div class="row" style="margin-top:10px;gap:6px">' +
              '<span class="tag mint">' + U.esc(sel.name) + ' · 시험 ' + list.length + '건</span>' +
              '<span class="tag gray">상담 ' + Store.counsels({ studentId: sel.id }).length + '건</span>' +
              '<div class="sp"></div>' +
              '<button class="btn sm" data-goto-counsel="' + sel.id + '">이 학생 상담 이력 →</button>' +
            '</div>'
          : '') +
      '</div>' +
      '<div class="table-wrap"><table class="tbl">' +
        '<thead><tr><th>등록일시</th><th>학생</th><th>학교</th><th>학년</th><th>시험명</th>' +
        '<th>점수 · 결과</th><th>성적표 · 인증서</th><th>메모</th></tr></thead><tbody>' +
        (list.length ? list.map(function (g) {
          var linked = studentName(g.studentId);
          return '<tr class="clickable" data-grade="' + g.id + '">' +
            '<td style="white-space:nowrap">' + U.esc(regDate(g.registeredAt)) + '</td>' +
            '<td class="nm">' + U.esc(g.name) +
              (linked ? '' : ' <span class="tag bad" title="학생 명부와 연결되지 않았습니다">미연결</span>') + '</td>' +
            '<td>' + U.esc(g.school || '-') + '</td><td>' + U.esc(g.grade || '-') + '</td>' +
            '<td>' + U.esc(g.exam) + '</td>' +
            '<td>' + (g.score ? '<b>' + U.esc(g.score) + '</b>' : '<span class="hint">–</span>') + '</td>' +
            '<td>' + (linksHtml(g.links) || '<span class="hint">–</span>') + '</td>' +
            '<td>' + U.esc(g.memo || '') + '</td></tr>';
        }).join('')
        : '<tr><td colspan="8">' + UI.emptyBox(all.length ? '조건에 맞는 기록이 없습니다.'
            : '아직 가져온 성적이 없습니다. 본사 성적 목록에서 확장 프로그램으로 보내거나, 표를 붙여넣어 주세요.', 'stats') + '</td></tr>') +
      '</tbody></table></div></div>';

    function redraw() { render(host); }
    root.querySelector('#gr-q').addEventListener('input', function (e) {
      rf.q = e.target.value;
      clearTimeout(redraw.t);
      redraw.t = setTimeout(function () {
        redraw();
        var q = host.querySelector('#gr-q');
        if (q) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); }
      }, 250);
    });
    root.querySelector('#gr-stu').addEventListener('change', function (e) { rf.studentId = e.target.value; redraw(); });
    root.querySelector('#gr-unlinked').addEventListener('change', function (e) { rf.unlinked = e.target.checked; redraw(); });
    root.querySelector('#gr-ext').addEventListener('click', openExtensionHelp);
    root.querySelector('#gr-paste').addEventListener('click', openPaste);
    root.querySelector('#gr-add').addEventListener('click', function () { openGradeForm(null); });
    root.querySelector('#gr-csv').addEventListener('click', function () {
      var head = ['등록일시', '학생명', '연결된 학생', '학교', '학년', '시험명', '점수·결과', '메모', '링크'];
      var body = list.map(function (g) {
        return [g.registeredAt, g.name, studentName(g.studentId), g.school, g.grade, g.exam, g.score, g.memo,
                (g.links || []).map(function (l) { return l.label + ' ' + l.url; }).join(' / ')];
      });
      U.download('고래영어_시험기록_' + U.ymd() + '.csv', U.toCsv([head].concat(body)), 'text/csv');
      UI.toast('CSV 파일을 내려받았습니다.');
    });
    UI.on(root, '[data-stop]', 'click', function (e) { e.stopPropagation(); });
    UI.on(root, '[data-grade]', 'click', function (e, tr) {
      if (e.target.closest('[data-stop]')) return;
      openGradeForm(tr.getAttribute('data-grade'));
    });
    UI.on(root, '[data-goto-counsel]', 'click', function (e, btn) {
      cf.studentId = btn.getAttribute('data-goto-counsel');
      tab = 'counsel'; App.setSub(sub()); redraw();
    });

    if (pendingImport) {
      var p = pendingImport;
      pendingImport = null;
      openImportPreview(p.rows, p.source);
    }
  }

  /** 시험 기록 한 건 수정 (학생 연결 · 점수 · 메모) */
  function openGradeForm(id) {
    var g = id ? Store.gradeRecord(id) : null;
    var isNew = !g;
    g = g || { name: '', school: '', grade: '', exam: '', registeredAt: U.ymd(), studentId: rf.studentId || '', score: '', memo: '', links: [] };
    UI.modal({
      title: isNew ? '시험 기록 직접 입력' : g.name + ' · ' + g.exam,
      body:
        '<div class="form-grid">' +
          '<label class="fld">학생 (명부 연결)<select id="gf-stu">' + studentOptions(g.studentId, '연결 안 함') + '</select></label>' +
          '<label class="fld">본사 기록의 학생명<input type="text" id="gf-name" value="' + U.esc(g.name) + '"' + (isNew ? '' : ' readonly') + '></label>' +
          '<label class="fld full">시험명<input type="text" id="gf-exam" value="' + U.esc(g.exam) + '"' + (isNew ? '' : ' readonly') + '></label>' +
          '<label class="fld">학교<input type="text" id="gf-school" value="' + U.esc(g.school) + '"></label>' +
          '<label class="fld">학년<input type="text" id="gf-grade" value="' + U.esc(g.grade) + '"></label>' +
          '<label class="fld">등록일<input type="text" id="gf-reg" value="' + U.esc(g.registeredAt) + '"' + (isNew ? '' : ' readonly') + '></label>' +
          '<label class="fld">점수 · 결과<input type="text" id="gf-score" value="' + U.esc(g.score || '') + '" placeholder="예) 92점, Level 4 통과"></label>' +
          '<label class="fld full">메모<textarea id="gf-memo" placeholder="성적표를 보고 느낀 점, 보완할 부분 등">' + U.esc(g.memo || '') + '</textarea></label>' +
        '</div>' +
        (g.links && g.links.length ? '<div class="section-title">성적표 · 인증서</div><div class="row" style="gap:6px">' + linksHtml(g.links) + '</div>' : '') +
        (isNew ? '' : '<p class="hint" style="margin:14px 0 0">학생명·시험명·등록일은 본사 기록 그대로 둡니다. 다시 가져와도 점수·메모·학생 연결은 지워지지 않습니다.</p>'),
      footer:
        (isNew ? '' : '<button class="btn danger" id="gf-del">삭제</button>') +
        (isNew ? '' : '<button class="btn" id="gf-counsel">이 시험으로 상담 기록</button>') +
        '<div class="sp"></div><button class="btn" data-close>취소</button>' +
        '<button class="btn primary" id="gf-save">저장</button>',
      onMount: function (w) {
        function val(sel) { return w.querySelector(sel).value.trim(); }
        w.querySelector('#gf-stu').addEventListener('change', function (e) {
          var nm = w.querySelector('#gf-name');
          if (isNew && !nm.value.trim()) nm.value = studentName(e.target.value);
        });
        w.querySelector('#gf-save').addEventListener('click', function () {
          var rec = {
            id: isNew ? undefined : g.id,
            studentId: val('#gf-stu'), school: val('#gf-school'), grade: val('#gf-grade'),
            score: val('#gf-score'), memo: val('#gf-memo')
          };
          if (isNew) {
            rec.name = val('#gf-name') || studentName(rec.studentId);
            rec.exam = val('#gf-exam');
            rec.registeredAt = val('#gf-reg');
            rec.links = [];
            rec.source = '직접 입력';
            if (!rec.name || !rec.exam) { UI.toast('학생과 시험명을 넣어 주세요.', true); return; }
          }
          Store.saveGrade(rec);
          UI.close(); UI.toast('저장했습니다.');
          render(host);
        });
        if (!isNew) {
          w.querySelector('#gf-del').addEventListener('click', function () {
            UI.confirm('이 시험 기록을 지울까요?', function () {
              Store.deleteGrade(g.id); UI.toast('지웠습니다.'); render(host);
            }, { danger: true, yes: '삭제' });
          });
          w.querySelector('#gf-counsel').addEventListener('click', function () {
            if (!val('#gf-stu')) { UI.toast('먼저 학생 명부와 연결해 주세요.', true); return; }
            Store.saveGrade({ id: g.id, studentId: val('#gf-stu') });
            openCounselForm({ studentId: val('#gf-stu'), topic: '성적', gradeId: g.id });
          });
        }
      }
    });
  }

  /* ---------- 가져오기: 표 붙여넣기 ---------- */
  /**
   * 머리줄 글자로 칸을 찾습니다. 본사 화면의 칸 순서가 바뀌어도 이름만 같으면 됩니다.
   * 크롬 확장 프로그램(extension/content.js)에도 같은 규칙이 들어 있습니다.
   */
  var COLS = {
    no:           /^(no\.?|번호|순번)$/i,
    name:         /(학생명|이름|성명|학생)/,
    school:       /학교/,
    grade:        /^(학년|학년도)$|학년/,
    exam:         /(시험명|시험|평가명|테스트)/,
    links:        /(성적표|인증서|링크|보기|출력)/,
    registeredAt: /(등록일|등록일시|일시|응시일|날짜)/
  };
  function mapHeader(cells) {
    var map = {};
    cells.forEach(function (raw, i) {
      var t = String(raw || '').replace(/\s+/g, '');
      Object.keys(COLS).forEach(function (k) {
        if (map[k] !== undefined) return;
        if (k === 'name' && /학교|학년/.test(t)) return;
        if (k === 'grade' && /성적/.test(t)) return;
        if (COLS[k].test(t)) map[k] = i;
      });
    });
    return map;
  }

  /** 엑셀·웹 표를 복사하면 칸은 탭, 줄은 줄바꿈으로 들어옵니다. */
  function parsePasted(text) {
    var lines = String(text || '').split(/\r?\n/).map(function (l) { return l.split('\t'); })
      .filter(function (c) { return c.join('').trim(); });
    if (!lines.length) return [];
    var hi = -1, map = null;
    for (var i = 0; i < Math.min(lines.length, 5); i++) {
      var m = mapHeader(lines[i]);
      if (m.name !== undefined && m.exam !== undefined) { hi = i; map = m; break; }
    }
    if (!map) {
      // 머리줄 없이 내용만 붙여넣은 경우 — 본사 화면 순서(번호·학생명·학교·학년·시험명·성적표·등록일시)로 봅니다.
      map = lines[0].length >= 7
        ? { no: 0, name: 1, school: 2, grade: 3, exam: 4, links: 5, registeredAt: 6 }
        : { no: 0, name: 1, school: 2, grade: 3, exam: 4, registeredAt: 5 };
    }
    return lines.slice(hi + 1).map(function (c) {
      function at(k) { return map[k] === undefined ? '' : String(c[map[k]] || '').trim(); }
      var reg = at('registeredAt');
      if (!reg) { // 등록일시 칸을 못 찾았으면 날짜처럼 생긴 칸을 씁니다
        for (var j = c.length - 1; j >= 0; j--) if (/^\d{4}[-.\/]\d{1,2}[-.\/]\d{1,2}/.test(String(c[j]).trim())) { reg = String(c[j]).trim(); break; }
      }
      return { no: at('no'), name: at('name'), school: at('school'), grade: at('grade'), exam: at('exam'),
               registeredAt: reg.replace(/\./g, '-').replace(/\//g, '-'), links: [] };
    }).filter(function (r) { return r.name && r.exam && !/^(학생명|이름)$/.test(r.name); });
  }

  function openPaste() {
    UI.modal({
      title: '표 붙여넣기로 가져오기', wide: true,
      body:
        '<ol class="hint" style="margin:0 0 12px;padding-left:18px;line-height:1.8">' +
          '<li>본사 성적 목록(englishwhale.com → 성적 목록)에서 표를 마우스로 끌어 선택합니다. 머리줄(번호·학생명…)까지 함께 잡으면 가장 정확합니다.</li>' +
          '<li>Ctrl+C 로 복사한 뒤 아래 칸에 Ctrl+V 로 붙여넣습니다.</li>' +
        '</ol>' +
        '<textarea id="gp-text" style="min-height:200px;font-size:12.5px" placeholder="여기에 붙여넣기"></textarea>' +
        '<p class="hint" style="margin:10px 0 0">붙여넣기로는 성적표·인증서 <b>링크</b>가 따라오지 않습니다. 링크까지 받으려면 크롬 확장 프로그램을 쓰세요.</p>',
      footer: '<button class="btn" data-close>취소</button><button class="btn primary" id="gp-next">읽어보기</button>',
      onMount: function (w) {
        w.querySelector('#gp-next').addEventListener('click', function () {
          var rows = parsePasted(w.querySelector('#gp-text').value);
          if (!rows.length) { UI.toast('학생명과 시험명이 있는 줄을 찾지 못했습니다.', true); return; }
          openImportPreview(rows, '붙여넣기');
        });
      }
    });
  }

  /** 가져오기 전에 무엇이 새로 들어가고 누가 연결되는지 보여 줍니다. */
  function openImportPreview(rows, source) {
    rows = (rows || []).filter(function (r) { return r && r.name && r.exam; });
    var have = {};
    Store.grades().forEach(function (g) { have[gradeKey(g)] = true; });
    var fresh = 0, matched = 0;
    var preview = rows.map(function (r) {
      var isNew = !have[gradeKey(r)];
      var m = Store.matchGradeStudent(r);
      if (isNew) fresh++;
      if (m) matched++;
      return { r: r, isNew: isNew, m: m };
    });

    UI.modal({
      title: '성적 가져오기 확인', wide: true,
      body:
        '<div class="row" style="gap:6px;margin-bottom:12px">' +
          '<span class="tag blue">받은 기록 ' + rows.length + '건</span>' +
          '<span class="tag ok">새 기록 ' + fresh + '건</span>' +
          '<span class="tag gray">이미 있음 ' + (rows.length - fresh) + '건</span>' +
          (rows.length - matched ? '<span class="tag bad">명부에서 못 찾은 학생 ' + (rows.length - matched) + '건</span>' : '') +
        '</div>' +
        // 특정 학생 것만 넣고 싶을 때 — 이름을 적으면 그 학생 줄만 체크됩니다
        '<div class="row" style="margin-bottom:10px">' +
          '<input type="search" id="gi-name" placeholder="학생 이름으로 고르기 (예: 신예솔)" style="flex:1;min-width:180px">' +
          '<button class="btn sm" type="button" id="gi-all">전체 선택</button>' +
          '<button class="btn sm" type="button" id="gi-none">전체 해제</button>' +
        '</div>' +
        '<div class="table-wrap" style="max-height:360px;overflow:auto"><table class="tbl" style="min-width:auto">' +
          '<thead><tr><th></th><th></th><th>학생</th><th>명부 연결</th><th>학교 · 학년</th><th>시험명</th><th>등록일시</th><th>링크</th></tr></thead><tbody>' +
          preview.map(function (x, i) {
            return '<tr data-gi-row="' + i + '"><td><input type="checkbox" data-gi="' + i + '" checked></td><td>' + (x.isNew ? '<span class="tag ok">새</span>' : '<span class="tag gray">있음</span>') + '</td>' +
              '<td class="nm">' + U.esc(x.r.name) + '</td>' +
              '<td>' + (x.m ? U.esc(x.m.name) + (x.m.grade ? ' · ' + U.esc(x.m.grade) : '') : '<span class="tag bad">못 찾음</span>') + '</td>' +
              '<td>' + U.esc([x.r.school, x.r.grade].filter(Boolean).join(' · ') || '-') + '</td>' +
              '<td>' + U.esc(x.r.exam) + '</td><td style="white-space:nowrap">' + U.esc(regDate(x.r.registeredAt)) + '</td>' +
              '<td>' + ((x.r.links || []).length || '–') + '</td></tr>';
          }).join('') +
        '</tbody></table></div>' +
        '<p class="hint" style="margin:12px 0 0">같은 학생·시험·등록일시의 기록은 한 줄로 합쳐집니다. ' +
          '명부에서 못 찾은 학생은 그대로 저장해 두고, 나중에 기록을 눌러 학생을 연결할 수 있습니다.</p>',
      footer: '<button class="btn" data-close>취소</button><button class="btn primary" id="gi-ok">가져오기</button>',
      onMount: function (w) {
        var boxes = w.querySelectorAll('[data-gi]');
        function picked() {
          return rows.filter(function (r, i) { return boxes[i].checked; });
        }
        function refresh() {
          var n = picked().length;
          var ok = w.querySelector('#gi-ok');
          ok.textContent = n + '건 가져오기';
          ok.disabled = !n;
        }
        function setAll(on) { boxes.forEach(function (b) { b.checked = on; }); refresh(); }
        w.querySelector('#gi-name').addEventListener('input', function (e) {
          var q = e.target.value.replace(/\s+/g, '');
          boxes.forEach(function (b, i) {
            var hit = !q || String(rows[i].name).replace(/\s+/g, '').indexOf(q) >= 0;
            b.checked = hit;
            w.querySelector('[data-gi-row="' + i + '"]').style.display = hit ? '' : 'none';
          });
          refresh();
        });
        w.querySelector('#gi-all').addEventListener('click', function () { setAll(true); });
        w.querySelector('#gi-none').addEventListener('click', function () { setAll(false); });
        boxes.forEach(function (b) { b.addEventListener('change', refresh); });
        refresh();
        w.querySelector('#gi-ok').addEventListener('click', function () {
          var chosen = picked();
          if (!chosen.length) { UI.toast('가져올 줄을 골라 주세요.', true); return; }
          var res = Store.importGrades(chosen, source);
          UI.close();
          UI.toast('새 기록 ' + res.added + '건' + (res.updated ? ' · 갱신 ' + res.updated + '건' : '') +
            (res.unlinked ? ' · 미연결 ' + res.unlinked + '건' : '') + ' 가져왔습니다.');
          tab = 'records';
          if (location.hash.indexOf('#/grades') === 0) render(host);
          else location.hash = '#/grades';
        });
      }
    });
  }

  function openExtensionHelp() {
    UI.modal({
      title: '크롬 확장 프로그램으로 성적 가져오기', wide: true,
      body:
        '<div class="section-title" style="margin-top:0">한 번만 설치</div>' +
        '<ol class="hint" style="margin:0;padding-left:18px;line-height:1.9">' +
          '<li>원생관리 저장소의 <b>extension</b> 폴더(또는 받은 압축 파일을 푼 폴더)를 컴퓨터에 둡니다.</li>' +
          '<li>크롬 주소창에 <b>chrome://extensions</b> 를 입력합니다.</li>' +
          '<li>오른쪽 위 <b>개발자 모드</b>를 켭니다.</li>' +
          '<li><b>압축해제된 확장 프로그램을 로드합니다</b> → extension 폴더를 고릅니다.</li>' +
          '<li>퍼즐 모양 아이콘에서 <b>고래영어 성적 연동</b>을 고정(핀)해 두면 편합니다.</li>' +
        '</ol>' +
        '<div class="section-title">쓸 때마다</div>' +
        '<ol class="hint" style="margin:0;padding-left:18px;line-height:1.9">' +
          '<li>본사 사이트에 로그인해 <b>성적 목록</b>(grade_list.php)을 엽니다. 여러 쪽이면 쪽마다 반복합니다.</li>' +
          '<li>확장 프로그램 아이콘 → <b>현재 페이지 데이터 동기화(전송)</b>.</li>' +
          '<li>원생관리 창이 열리고 <b>성적 가져오기 확인</b>이 뜹니다. 확인 후 [가져오기].</li>' +
        '</ol>' +
        '<p class="hint" style="margin:14px 0 0">본사 비밀번호나 쿠키는 확장 프로그램이 읽거나 보내지 않습니다. 화면에 보이는 표 내용만 옮깁니다.</p>'
    });
  }

  /* ---------- 확장 프로그램이 보내는 성적 받기 ----------
   * 확장 프로그램의 bridge.js 가 이 창에 window.postMessage 로 넘겨 줍니다.
   * 같은 창에서 온 메시지만 받습니다.
   */
  window.addEventListener('message', function (e) {
    if (e.source !== window || !e.data || e.data.type !== 'gorae-grades-import') return;
    var rows = Array.isArray(e.data.rows) ? e.data.rows : [];
    window.postMessage({ type: 'gorae-grades-ack', id: e.data.id, count: rows.length }, location.origin === 'null' ? '*' : location.origin);
    if (!rows.length) { if (window.UI) UI.toast('받은 성적이 없습니다.', true); return; }
    pendingImport = { rows: rows, source: '확장 프로그램' + (e.data.pageUrl ? ' · ' + e.data.pageUrl : '') };
    tab = 'records';
    if (location.hash.indexOf('#/grades') === 0 && host) render(host);
    else location.hash = '#/grades?tab=records';
  });

  /* ============================================================
   * ② 상담 이력
   * ============================================================ */
  function followLabel(c) {
    if (!c.followUpDate) return '';
    if (c.followUpDone) return '<span class="tag ok">확인 완료 · ' + U.esc(U.shortDate(c.followUpDate)) + '</span>';
    var diff = U.dayDiff(U.ymd(), c.followUpDate);
    if (diff < 0) return '<span class="tag bad">다음 확인 ' + U.esc(U.shortDate(c.followUpDate)) + ' · ' + (-diff) + '일 지남</span>';
    if (diff === 0) return '<span class="tag warn">오늘 확인</span>';
    return '<span class="tag blue">다음 확인 ' + U.esc(U.shortDate(c.followUpDate)) + ' · D-' + diff + '</span>';
  }

  function counselItem(c, opts) {
    opts = opts || {};
    var g = c.gradeId ? Store.gradeRecord(c.gradeId) : null;
    return '<div class="csl-item' + (opts.follow ? ' follow' : '') + '">' +
      '<div class="csl-meta">' +
        (opts.follow ? '<span class="csl-arrow">↳ 후속</span>' : '') +
        '<b>' + U.esc(U.human(c.date)) + '</b>' +
        (opts.showName ? '<a href="#" class="csl-name" data-csl-stu="' + c.studentId + '">' + U.esc(studentName(c.studentId) || '(삭제된 학생)') + '</a>' : '') +
        (c.with || c.channel ? '<span class="tag gray">' + U.esc([c.with, c.channel].filter(Boolean).join(' · ')) + '</span>' : '') +
        (c.topic ? '<span class="tag mint">' + U.esc(c.topic) + '</span>' : '') +
        followLabel(c) +
      '</div>' +
      (g ? '<div class="csl-grade">관련 시험 · ' + U.esc(g.exam) + (g.score ? ' (' + U.esc(g.score) + ')' : '') + '</div>' : '') +
      '<div class="csl-body">' + U.esc(c.content || '') + '</div>' +
      (c.plan ? '<div class="csl-plan"><b>조치 · 약속</b>' + U.esc(c.plan) + '</div>' : '') +
      '<div class="csl-acts">' +
        '<button class="btn sm" data-csl-follow="' + c.id + '">후속 상담 기록</button>' +
        (Store.isFollowUpPending(c) ? '<button class="btn sm" data-csl-done="' + c.id + '">확인 완료</button>' : '') +
        '<button class="btn sm" data-csl-edit="' + c.id + '">수정</button>' +
      '</div>' +
    '</div>';
  }

  function pendingBox() {
    var list = Store.counsels({ pending: true }).sort(function (a, b) {
      return String(a.followUpDate).localeCompare(String(b.followUpDate));
    });
    if (!list.length) return '<div class="hint">기다리는 팔로우업이 없습니다. 상담을 기록할 때 <b>다음 확인일</b>을 정해 두면 여기에 모입니다.</div>';
    return list.map(function (c) {
      return '<div class="csl-due">' +
        '<div class="csl-due-t"><a href="#" data-csl-stu="' + c.studentId + '"><b>' + U.esc(studentName(c.studentId) || '(삭제된 학생)') + '</b></a> ' +
          followLabel(c) + '</div>' +
        '<div class="hint" style="margin:3px 0 6px">' + U.esc(c.topic || '') + (c.plan ? ' · ' + U.esc(c.plan.slice(0, 60)) : (c.content ? ' · ' + U.esc(c.content.slice(0, 60)) : '')) + '</div>' +
        '<div class="row" style="gap:6px">' +
          '<button class="btn sm primary" data-csl-follow="' + c.id + '">후속 상담 기록</button>' +
          '<button class="btn sm" data-csl-done="' + c.id + '">확인 완료</button>' +
        '</div></div>';
    }).join('');
  }

  function renderCounsel(root) {
    var s = cf.studentId ? Store.student(cf.studentId) : null;
    if (cf.studentId && !s) cf.studentId = '';
    var body;
    if (s) {
      var threads = Store.counselThreads(s.id).filter(function (th) {
        return th.some(function (c) {
          return (!cf.topic || c.topic === cf.topic) &&
            (!cf.q || [c.content, c.plan, c.topic].join(' ').toLowerCase().indexOf(cf.q.toLowerCase()) >= 0);
        });
      });
      var gs = Store.grades({ studentId: s.id });
      var sc = Store.scheduleOf(s);
      body =
        '<div class="csl-head">' +
          '<div><b style="font-size:16px">' + U.esc(s.name) + '</b> ' +
            '<span class="hint">' + U.esc([s.grade, sc.className].filter(Boolean).join(' · ')) + '</span></div>' +
          '<div class="row" style="gap:6px;margin-top:6px">' +
            '<span class="tag gray">상담 ' + Store.counsels({ studentId: s.id }).length + '건</span>' +
            '<span class="tag gray">시험 기록 ' + gs.length + '건</span>' +
            (gs[0] ? '<span class="tag blue">최근 시험 · ' + U.esc(gs[0].exam) + (gs[0].score ? ' (' + U.esc(gs[0].score) + ')' : '') + '</span>' : '') +
            (s.parentPhone ? '<a class="btn sm" href="tel:' + U.esc(String(s.parentPhone).replace(/[^0-9+]/g, '')) + '">학부모 전화</a>' : '') +
            '<button class="btn sm" data-open-stu="' + s.id + '">학생 상세</button>' +
          '</div></div>' +
        (threads.length
          ? threads.map(function (th) {
              return '<div class="csl-thread">' + th.map(function (c, i) { return counselItem(c, { follow: i > 0 }); }).join('') + '</div>';
            }).join('')
          : UI.emptyBox('상담 기록이 없습니다. [+ 상담 기록]으로 첫 상담을 남겨 주세요.', 'students'));
    } else {
      var recent = Store.counsels({ topic: cf.topic, q: cf.q }).slice(0, 40);
      body = '<div class="section-title" style="margin-top:0">최근 상담</div>' +
        (recent.length
          ? recent.map(function (c) { return '<div class="csl-thread">' + counselItem(c, { showName: true }) + '</div>'; }).join('')
          : UI.emptyBox('아직 상담 기록이 없습니다.', 'students'));
    }

    root.innerHTML =
      '<div class="grid g-12" style="margin-top:16px">' +
        '<div class="card" style="height:fit-content"><div class="card-h"><h2>팔로우업 할 일</h2></div>' +
          '<div class="card-b">' + pendingBox() + '</div></div>' +
        '<div class="card"><div class="card-b">' +
          '<div class="row" style="margin-bottom:14px">' +
            '<select id="cs-stu" style="width:170px">' + studentOptions(cf.studentId, '전체 학생') + '</select>' +
            '<select id="cs-topic" style="width:130px">' + UI.options(Store.COUNSEL_TOPICS, cf.topic, '전체 주제') + '</select>' +
            '<input type="search" id="cs-q" placeholder="상담 내용 검색" value="' + U.esc(cf.q) + '" style="flex:1;min-width:140px">' +
            '<button class="btn primary" id="cs-add">+ 상담 기록</button>' +
          '</div>' + body +
        '</div></div>' +
      '</div>';

    function redraw() { render(host); }
    root.querySelector('#cs-stu').addEventListener('change', function (e) { cf.studentId = e.target.value; redraw(); });
    root.querySelector('#cs-topic').addEventListener('change', function (e) { cf.topic = e.target.value; redraw(); });
    root.querySelector('#cs-q').addEventListener('input', function (e) {
      cf.q = e.target.value;
      clearTimeout(redraw.t);
      redraw.t = setTimeout(function () {
        redraw();
        var q = host.querySelector('#cs-q');
        if (q) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); }
      }, 250);
    });
    root.querySelector('#cs-add').addEventListener('click', function () {
      openCounselForm({ studentId: cf.studentId });
    });
    UI.on(root, '[data-csl-stu]', 'click', function (e, a) {
      e.preventDefault();
      cf.studentId = a.getAttribute('data-csl-stu'); redraw();
    });
    UI.on(root, '[data-open-stu]', 'click', function (e, b) { Views.students.openDetail(b.getAttribute('data-open-stu')); });
    UI.on(root, '[data-csl-follow]', 'click', function (e, b) {
      var prev = Store.counsel(b.getAttribute('data-csl-follow'));
      if (prev) openCounselForm({ studentId: prev.studentId, parentId: prev.id, topic: prev.topic, with: prev.with, gradeId: prev.gradeId });
    });
    UI.on(root, '[data-csl-done]', 'click', function (e, b) {
      Store.setFollowUpDone(b.getAttribute('data-csl-done'), true);
      UI.toast('확인 완료로 표시했습니다.'); redraw();
    });
    UI.on(root, '[data-csl-edit]', 'click', function (e, b) {
      openCounselForm(Store.counsel(b.getAttribute('data-csl-edit')));
    });
  }

  function addDays(n) {
    var d = new Date(); d.setDate(d.getDate() + n);
    return U.ymd(d);
  }

  /**
   * 상담 기록 창. c.id 가 있으면 수정, c.parentId 가 있으면 앞 상담에 이어지는 후속 상담입니다.
   */
  function openCounselForm(c) {
    c = c || {};
    var isNew = !c.id;
    var parent = c.parentId ? Store.counsel(c.parentId) : null;
    var sid = c.studentId || '';
    function gradeOpts(studentId, selected) {
      return UI.options(Store.grades({ studentId: studentId }).map(function (g) {
        return { value: g.id, label: regDate(g.registeredAt).slice(0, 10) + ' · ' + g.exam + (g.score ? ' (' + g.score + ')' : '') };
      }), selected, '없음');
    }
    UI.modal({
      title: isNew ? (parent ? '후속 상담 기록' : '상담 기록') : '상담 기록 수정', wide: true,
      body:
        (parent
          ? '<div class="csl-parent"><div class="hint" style="margin-bottom:4px">이어지는 상담 · ' + U.esc(U.human(parent.date)) +
              (parent.topic ? ' · ' + U.esc(parent.topic) : '') + '</div>' +
              '<div style="white-space:pre-wrap">' + U.esc(parent.content || '') + '</div>' +
              (parent.plan ? '<div style="margin-top:6px"><b>조치 · 약속</b> ' + U.esc(parent.plan) + '</div>' : '') +
            '</div>'
          : '') +
        '<div class="form-grid">' +
          '<label class="fld">학생<select id="cf-stu"' + (parent ? ' disabled' : '') + '>' + studentOptions(sid, '학생 선택') + '</select></label>' +
          '<label class="fld">상담일<input type="date" id="cf-date" value="' + U.esc(c.date || U.ymd()) + '"></label>' +
          '<label class="fld">상담 대상<select id="cf-with">' + UI.options(Store.COUNSEL_WITH, c.with || '학부모') + '</select></label>' +
          '<label class="fld">방법<select id="cf-ch">' + UI.options(Store.COUNSEL_CHANNELS, c.channel || '전화') + '</select></label>' +
          '<label class="fld">주제<select id="cf-topic">' + UI.options(Store.COUNSEL_TOPICS, c.topic || '성적') + '</select></label>' +
          '<label class="fld">관련 시험<select id="cf-grade">' + gradeOpts(sid, c.gradeId || '') + '</select></label>' +
          '<label class="fld full">상담 내용<textarea id="cf-content" style="min-height:110px" placeholder="학부모님·학생과 나눈 이야기, 아이의 현재 상황">' + U.esc(c.content || '') + '</textarea></label>' +
          '<label class="fld full">조치 · 약속 사항<textarea id="cf-plan" placeholder="예) 단어 시험 재응시 / 2주 뒤 문법 진도 다시 안내">' + U.esc(c.plan || '') + '</textarea></label>' +
          '<label class="fld">다음 확인일 (팔로우업)<input type="date" id="cf-follow" value="' + U.esc(c.followUpDate || '') + '"></label>' +
          '<div class="fld">빠르게 정하기<div class="chips">' +
            '<button class="chip" type="button" data-fu="7">1주 뒤</button>' +
            '<button class="chip" type="button" data-fu="14">2주 뒤</button>' +
            '<button class="chip" type="button" data-fu="30">한 달 뒤</button>' +
            '<button class="chip" type="button" data-fu="">없음</button>' +
          '</div></div>' +
        '</div>' +
        (parent ? '<p class="hint" style="margin:12px 0 0">저장하면 앞 상담의 팔로우업은 <b>확인 완료</b>로 바뀝니다.</p>' : ''),
      footer:
        (isNew ? '' : '<button class="btn danger" id="cf-del">삭제</button>') +
        '<div class="sp"></div><button class="btn" data-close>취소</button>' +
        '<button class="btn primary" id="cf-save">저장</button>',
      onMount: function (w) {
        w.querySelector('#cf-stu').addEventListener('change', function (e) {
          w.querySelector('#cf-grade').innerHTML = gradeOpts(e.target.value, '');
        });
        UI.on(w, '[data-fu]', 'click', function (e, b) {
          var n = b.getAttribute('data-fu');
          w.querySelector('#cf-follow').value = n ? addDays(+n) : '';
        });
        w.querySelector('#cf-save').addEventListener('click', function () {
          var studentId = parent ? parent.studentId : w.querySelector('#cf-stu').value;
          var content = w.querySelector('#cf-content').value.trim();
          if (!studentId) { UI.toast('학생을 골라 주세요.', true); return; }
          if (!content) { UI.toast('상담 내용을 적어 주세요.', true); return; }
          var follow = w.querySelector('#cf-follow').value;
          var rec = {
            id: isNew ? undefined : c.id,
            studentId: studentId,
            parentId: parent ? parent.id : (c.parentId || ''),
            date: w.querySelector('#cf-date').value || U.ymd(),
            with: w.querySelector('#cf-with').value,
            channel: w.querySelector('#cf-ch').value,
            topic: w.querySelector('#cf-topic').value,
            gradeId: w.querySelector('#cf-grade').value,
            content: content,
            plan: w.querySelector('#cf-plan').value.trim(),
            followUpDate: follow
          };
          // 확인일을 새로 바꾸면 다시 기다리는 상태로 둡니다
          if (!isNew && follow !== c.followUpDate) rec.followUpDone = false;
          if (isNew) rec.followUpDone = false;
          Store.saveCounsel(rec);
          UI.close();
          UI.toast(parent ? '후속 상담을 이어서 기록했습니다.' : '상담을 기록했습니다.');
          cf.studentId = studentId;
          tab = 'counsel';
          if (location.hash.indexOf('#/grades') === 0 && host) { App.setSub(sub()); render(host); }
          else location.hash = '#/grades?tab=counsel&student=' + encodeURIComponent(studentId);
        });
        if (!isNew) {
          w.querySelector('#cf-del').addEventListener('click', function () {
            UI.confirm('이 상담 기록을 지울까요? 이어진 후속 상담은 남습니다.', function () {
              Store.deleteCounsel(c.id); UI.toast('지웠습니다.'); render(host);
            }, { danger: true, yes: '삭제' });
          });
        }
      }
    });
  }

  /* ============================================================
   * 탭 틀
   * ============================================================ */
  function tabsHtml() {
    var due = Store.counsels({ pending: true }).filter(function (c) { return c.followUpDate <= U.ymd(); }).length;
    var unlinked = Store.grades({ unlinked: true }).length;
    return '<div class="seg lib-tabs gr-tabs" role="tablist">' + TABS.map(function (t) {
      var badge = t.id === 'counsel' ? due : t.id === 'records' ? unlinked : 0;
      return '<button data-tab="' + t.id + '"' + (tab === t.id ? ' class="on"' : '') + '>' + t.label +
        (badge ? ' <span class="lib-badge">' + badge + '</span>' : '') + '</button>';
    }).join('') + '</div>';
  }

  /**
   * 그릴 때마다 안쪽 틀을 새로 만듭니다 (도서 대여 화면과 같은 방식).
   * 바깥 틀에 직접 그리면 다시 그릴 때마다 클릭 처리가 겹겹이 쌓입니다.
   */
  function render(el) {
    host = el;
    if (location.hash !== appliedHash) {
      appliedHash = location.hash;
      var q = App.query();
      if (isTab(q.tab)) tab = q.tab;
      if (q.student) { cf.studentId = q.student; if (tab === 'records') rf.studentId = q.student; }
    }
    App.setSub(sub());
    el.innerHTML = '';
    el.insertAdjacentHTML('afterbegin', tabsHtml());
    var root = document.createElement('div');
    if (tab === 'stats' || tab === 'report') root.style.marginTop = '16px';
    el.appendChild(root);
    if (tab === 'stats') Views.stats.render(root);
    else if (tab === 'report') Views.share.render(root);
    else if (tab === 'counsel') renderCounsel(root);
    else renderRecords(root);

    el.querySelectorAll('.gr-tabs [data-tab]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        tab = btn.getAttribute('data-tab');
        render(host);
      });
    });
  }

  return {
    title: title, sub: sub, render: render, setTab: setTab,
    openCounselForm: openCounselForm, parsePasted: parsePasted, openImportPreview: openImportPreview
  };
})();
