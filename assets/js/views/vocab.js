/* ===== 단어 학습 (단어학습앱 연동) ===== */
window.Views = window.Views || {};
Views.vocab = (function () {

  var period = 30;   // 최근 며칠

  function title() { return '단어 학습'; }
  function sub() { return '단어학습앱에서 넘어온 학습 기록입니다'; }

  function range() { return { from: U.daysAgo(period - 1), to: U.ymd() }; }

  function rowsData() {
    var r = range();
    return Store.students({ active: true }).map(function (s) {
      return { s: s, sum: Store.vocabSummary(s.id, r.from, r.to) };
    });
  }

  /* ---------- 가져오기 ---------- */
  function openImport(prefill) {
    UI.modal({
      title: '단어 학습 기록 가져오기',
      wide: true,
      body:
        '<p class="hint" style="margin-top:0">단어학습앱에서 내보낸 <b>JSON</b> 또는 <b>CSV</b>를 넣으세요. ' +
        '학생은 <b>학생 코드</b> 또는 <b>이름</b>으로 찾습니다.</p>' +
        '<div class="row" style="margin:12px 0">' +
          '<button class="btn" id="v-file">파일 선택</button>' +
          '<input type="file" id="v-fileinput" accept=".json,.csv,.txt,application/json,text/csv" style="display:none">' +
          '<a class="btn" href="docs/단어학습앱-연동.md" target="_blank" rel="noopener">형식 안내</a>' +
        '</div>' +
        '<label class="fld">직접 붙여넣기' +
          '<textarea id="v-text" style="min-height:150px;font-size:12px;font-family:ui-monospace,Menlo,monospace" ' +
          'placeholder=\'{"type":"gorae-vocab","sessions":[{"studentCode":"A3F9","date":"2026-09-02","setName":"Unit 3","total":20,"correct":18}]}\'>' +
          U.esc(prefill || '') + '</textarea></label>' +
        '<div id="v-preview" style="margin-top:14px"></div>',
      footer: '<button class="btn" data-close>취소</button>' +
              '<button class="btn primary" id="v-apply" disabled>가져오기</button>',
      onMount: function (w) {
        var current = null;

        function preview() {
          var text = w.querySelector('#v-text').value;
          var box = w.querySelector('#v-preview');
          var applyBtn = w.querySelector('#v-apply');
          if (!text.trim()) { box.innerHTML = ''; applyBtn.disabled = true; current = null; return; }
          var parsed = VocabImport.parse(text);
          if (parsed.error) {
            box.innerHTML = '<div class="gate-err" style="margin:0">' + U.esc(parsed.error) + '</div>';
            applyBtn.disabled = true; current = null;
            return;
          }
          current = VocabImport.resolve(parsed.sessions);
          box.innerHTML = VocabImport.previewHtml(current);
          applyBtn.disabled = !current.ready.length;
          applyBtn.textContent = current.ready.length ? current.ready.length + '건 가져오기' : '가져오기';
        }

        w.querySelector('#v-text').addEventListener('input', preview);
        w.querySelector('#v-file').addEventListener('click', function () {
          w.querySelector('#v-fileinput').click();
        });
        w.querySelector('#v-fileinput').addEventListener('change', function (e) {
          var f = e.target.files[0];
          if (!f) return;
          var reader = new FileReader();
          reader.onload = function () {
            w.querySelector('#v-text').value = reader.result;
            preview();
          };
          reader.readAsText(f);
          e.target.value = '';
        });
        w.querySelector('#v-apply').addEventListener('click', function () {
          if (!current) return;
          var n = VocabImport.apply(current.ready);
          UI.close();
          UI.toast(n + '건을 가져왔습니다.');
          App.rerender();
        });
        if (prefill) preview();
      }
    });
  }

  /* ---------- 학생 코드 ---------- */
  function openCodes() {
    var list = Store.students({ active: true });
    UI.modal({
      title: '학생 코드', wide: true,
      body:
        '<p class="hint" style="margin-top:0">단어학습앱에서 학생을 지목할 때 쓰는 코드입니다. ' +
        '앱에 이 코드를 넣어두면 이름이 같거나 바뀌어도 정확히 연결됩니다.</p>' +
        '<div class="row" style="margin:12px 0">' +
          '<button class="btn" id="c-make">코드 없는 학생에게 코드 만들기</button>' +
          '<button class="btn" id="c-csv">코드 목록 CSV</button>' +
        '</div>' +
        '<div id="c-list">' + codeTable(list) + '</div>',
      onMount: function (w) {
        w.querySelector('#c-make').addEventListener('click', function () {
          var n = 0;
          Store.students({ active: true }).forEach(function (s) {
            if (!s.code) { Store.ensureCode(s.id); n++; }
          });
          w.querySelector('#c-list').innerHTML = codeTable(Store.students({ active: true }));
          UI.toast(n ? n + '명에게 코드를 만들었습니다.' : '모든 학생에게 코드가 있습니다.');
        });
        w.querySelector('#c-csv').addEventListener('click', function () {
          var head = ['학생코드', '이름', '학년', '반'];
          var body = Store.students({ active: true }).map(function (s) {
            return [s.code || '', s.name, s.grade || '', Store.scheduleOf(s).className];
          });
          U.download('고래영어_학생코드.csv', U.toCsv([head].concat(body)), 'text/csv');
          UI.toast('CSV 파일을 내려받았습니다.');
        });
      }
    });
  }

  function codeTable(list) {
    if (!list.length) return UI.emptyBox('등록생이 없습니다.', '🧒');
    return '<div class="table-wrap"><table class="tbl" style="min-width:auto">' +
      '<thead><tr><th>학생</th><th>학년</th><th>반</th><th>코드</th></tr></thead><tbody>' +
      list.map(function (s) {
        return '<tr><td class="nm">' + U.esc(s.name) + '</td>' +
          '<td>' + U.esc(s.grade || '-') + '</td>' +
          '<td>' + U.esc(Store.scheduleOf(s).className || '-') + '</td>' +
          '<td>' + (s.code
            ? '<span class="code-chip">' + U.esc(s.code) + '</span>'
            : '<span class="hint">없음</span>') + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  }

  /* ---------- 렌더 ---------- */
  function render(el) {
    var data = rowsData();
    var totals = data.reduce(function (a, d) {
      a.sessions += d.sum.sessions; a.total += d.sum.total;
      a.correct += d.sum.correct; a.minutes += d.sum.minutes;
      return a;
    }, { sessions: 0, total: 0, correct: 0, minutes: 0 });
    var studied = data.filter(function (d) { return d.sum.sessions > 0; });

    el.innerHTML =
      '<div class="card" style="margin-bottom:16px"><div class="card-b" style="padding:12px 16px">' +
        '<div class="row">' +
          '<b style="font-size:13.5px">기간</b>' +
          '<div class="seg">' +
            [7, 30, 90].map(function (d) {
              return '<button data-period="' + d + '" class="' + (period === d ? 'on' : '') + '">최근 ' + d + '일</button>';
            }).join('') +
          '</div>' +
          '<div class="sp"></div>' +
          '<button class="btn" id="codes">학생 코드</button>' +
          '<button class="btn primary" id="imp">기록 가져오기</button>' +
        '</div>' +
      '</div></div>' +

      '<div class="grid g-4" style="margin-bottom:16px">' +
        '<div class="stat accent"><div class="lbl">평균 정답률</div><div class="val">' + U.pct(totals.correct, totals.total) + '<small>%</small></div>' +
          '<div class="sub">최근 ' + period + '일</div></div>' +
        '<div class="stat"><div class="lbl">학습한 단어</div><div class="val">' + U.num(totals.total) + '<small>개</small></div>' +
          '<div class="sub">맞힌 단어 ' + U.num(totals.correct) + '개</div></div>' +
        '<div class="stat"><div class="lbl">학습 횟수</div><div class="val">' + totals.sessions + '<small>회</small></div>' +
          '<div class="sub">총 ' + totals.minutes + '분</div></div>' +
        '<div class="stat"><div class="lbl">참여 학생</div><div class="val">' + studied.length + '<small>/' + data.length + '</small></div>' +
          '<div class="sub">기간 내 1회 이상</div></div>' +
      '</div>' +

      (Store.vocabLogs().length ? '' :
        '<div class="card" style="margin-bottom:16px"><div class="card-b">' +
          '<p class="hint" style="margin:0">📱 아직 들어온 기록이 없습니다. 단어학습앱에서 결과를 내보내 ' +
          '<b>[기록 가져오기]</b>로 넣거나, 앱이 <code>#/import?d=...</code> 링크를 열도록 만들면 자동으로 쌓입니다. ' +
          '형식은 <b>docs/단어학습앱-연동.md</b>에 정리해 두었습니다.</p>' +
        '</div></div>') +

      '<div class="grid g-21" style="margin-bottom:16px">' +
        '<div class="card"><div class="card-h"><h2>학생별 정답률</h2></div><div class="card-b">' +
          (studied.length
            ? studied.slice().sort(function (a, b) { return b.sum.accuracy - a.sum.accuracy; })
                .map(function (d) { return UI.bar(d.s.name, d.sum.accuracy, 100, '%'); }).join('')
            : UI.emptyBox('기간 내 학습 기록이 없습니다.', '📱')) +
        '</div></div>' +

        '<div class="card"><div class="card-h"><h2>최근 학습</h2></div><div class="card-b">' +
          (function () {
            var r = range();
            var logs = Store.vocabLogs({ from: r.from, to: r.to }).slice(0, 8);
            if (!logs.length) return '<div class="hint">기록이 없습니다.</div>';
            return logs.map(function (v) {
              var s = Store.student(v.studentId);
              var rate = U.pct(v.correct, v.total);
              return '<div class="memo-item"><span class="dt">' + U.shortDate(v.date) + '</span>' +
                '<div class="txt"><b>' + U.esc(s ? s.name : '(삭제됨)') + '</b> ' +
                  '<span class="tag ' + (rate >= 80 ? 'ok' : rate >= 60 ? 'warn' : 'bad') + '">' + rate + '%</span>' +
                  '<br><span style="font-size:12px;color:#63778a">' + U.esc(v.setName || '') +
                  ' · ' + v.correct + '/' + v.total + '개</span></div></div>';
            }).join('');
          })() +
        '</div></div>' +
      '</div>' +

      '<div class="card"><div class="card-h"><h2>학생별 상세</h2><div class="sp"></div>' +
        '<button class="btn sm" id="csv">CSV 내보내기</button></div>' +
        '<div class="table-wrap"><table class="tbl">' +
          '<thead><tr><th>학생</th><th>반</th><th>코드</th><th class="num">학습 횟수</th>' +
          '<th class="num">단어 수</th><th class="num">정답률</th><th class="num">학습 시간</th><th>마지막 학습</th></tr></thead><tbody>' +
          (data.length ? data.map(function (d) {
            return '<tr class="clickable" data-open="' + d.s.id + '">' +
              '<td class="nm">' + U.esc(d.s.name) + '</td>' +
              '<td>' + U.esc(Store.scheduleOf(d.s).className || '-') + '</td>' +
              '<td>' + (d.s.code ? '<span class="code-chip">' + U.esc(d.s.code) + '</span>' : '-') + '</td>' +
              '<td class="num">' + d.sum.sessions + '</td>' +
              '<td class="num">' + U.num(d.sum.total) + '</td>' +
              '<td class="num">' + (d.sum.total ? d.sum.accuracy + '%' : '-') + '</td>' +
              '<td class="num">' + d.sum.minutes + '분</td>' +
              '<td>' + (d.sum.lastDate ? U.shortDate(d.sum.lastDate) : '-') + '</td></tr>';
          }).join('') : '<tr><td colspan="8">' + UI.emptyBox('등록생이 없습니다.', '🧒') + '</td></tr>') +
        '</tbody></table></div></div>';

    UI.on(el, '[data-period]', 'click', function (e, b) {
      period = +b.getAttribute('data-period');
      render(el);
    });
    el.querySelector('#imp').addEventListener('click', function () { openImport(''); });
    el.querySelector('#codes').addEventListener('click', openCodes);
    UI.on(el, '[data-open]', 'click', function (e, tr) {
      Views.students.openDetail(tr.getAttribute('data-open'));
    });
    el.querySelector('#csv').addEventListener('click', function () {
      var head = ['학생', '반', '학생코드', '학습횟수', '단어수', '정답수', '정답률(%)', '학습시간(분)', '마지막학습'];
      var body = rowsData().map(function (d) {
        return [d.s.name, Store.scheduleOf(d.s).className, d.s.code || '',
                d.sum.sessions, d.sum.total, d.sum.correct, d.sum.accuracy, d.sum.minutes, d.sum.lastDate];
      });
      U.download('고래영어_단어학습_' + U.ymd() + '.csv', U.toCsv([head].concat(body)), 'text/csv');
      UI.toast('CSV 파일을 내려받았습니다.');
    });
  }

  /* ---------- 링크로 받기 (#/import?d=...) ---------- */
  function renderImportRoute(el, encoded) {
    var payload = U.decodeData(encoded);
    var text = payload ? JSON.stringify(payload) : '';
    el.innerHTML = '<div class="card"><div class="card-b">' +
      (payload
        ? '<p class="hint" style="margin-top:0">단어학습앱이 보낸 기록입니다. 확인 후 가져오기를 눌러 주세요.</p>'
        : UI.emptyBox('링크에서 기록을 읽지 못했습니다. 링크가 잘리지 않았는지 확인해 주세요.', '⚠️')) +
      '</div></div>';
    if (payload) openImport(text);
  }

  return { title: title, sub: sub, render: render, renderImportRoute: renderImportRoute, openImport: openImport };
})();
