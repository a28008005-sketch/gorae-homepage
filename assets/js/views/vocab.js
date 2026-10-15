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
    if (!list.length) return UI.emptyBox('등록생이 없습니다.', 'students');
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

  /* ---------- 오늘 실시간 현황 ----------
     웨일리 보카 앱은 공부하는 동안 5문제마다 진행 상황을 보냅니다(워커 → 학원 클라우드).
     같은 일차는 한 줄로 덮어써서 '학습 중' → '완료'(또는 '중간에 멈춤')로 바뀝니다.
     클라우드 동기화가 15초마다 새 기록을 받아오면 이 화면이 다시 그려집니다. */
  var STALE_MIN = 10;   // '학습 중'인데 이만큼 소식이 없으면 앱을 닫은 것으로 봅니다
  var tick = null;

  function minutesAgo(iso) {
    var t = Date.parse(iso || '');
    return isNaN(t) ? null : Math.max(0, Math.floor((Date.now() - t) / 60000));
  }
  function agoText(m) {
    if (m == null) return '';
    if (m < 1) return '방금';
    if (m < 60) return m + '분 전';
    return Math.floor(m / 60) + '시간 전';
  }
  function liveState(v) {
    var m = minutesAgo(v.updatedAt);
    if (v.status === 'in-progress' && m != null && m >= STALE_MIN) return { label: '응답 없음', cls: 'bad', note: '앱을 닫았거나 멈춘 것 같아요' };
    if (v.status === 'in-progress') return { label: '학습 중', cls: 'blue live', note: '' };
    if (v.status === 'stopped') return { label: '중간에 멈춤', cls: 'bad', note: '' };
    return { label: '완료', cls: 'ok', note: '' };
  }

  function liveCard() {
    var today = U.ymd();
    var logs = Store.vocabLogs({ from: today, to: today }).filter(function (v) { return v.source === 'whaley-voca'; })
      .sort(function (a, b) { return (b.updatedAt || '') < (a.updatedAt || '') ? -1 : 1; });
    var counts = { live: 0, done: 0, stop: 0 };
    logs.forEach(function (v) {
      var st = liveState(v).label;
      if (st === '학습 중') counts.live++; else if (st === '완료') counts.done++; else counts.stop++;
    });
    return '<div class="card" style="margin-bottom:16px"><div class="card-h"><h2>오늘 실시간 현황</h2>' +
        '<span class="hint" style="margin-left:8px;font-size:12px">' +
          '학습 중 <b>' + counts.live + '</b> · 완료 <b>' + counts.done + '</b> · 멈춤 <b>' + counts.stop + '</b>' +
        '</span><div class="sp"></div>' +
        '<span class="hint" style="font-size:12px">15초마다 자동으로 새로 받아옵니다</span></div>' +
      '<div class="card-b">' +
      (logs.length ? '<div class="table-wrap"><table class="tbl" style="min-width:auto">' +
        '<thead><tr><th>학생</th><th>상태</th><th>레벨 · 일차</th><th>지금 하는 것</th>' +
        '<th class="num">맞힘</th><th class="num">오늘 정답률</th><th class="num">남은 오답</th>' +
        '<th class="num">학습 시간</th><th>마지막 소식</th></tr></thead><tbody>' +
        logs.map(function (v) {
          var s = Store.student(v.studentId);
          var st = liveState(v);
          var title = String(v.setName || '').split(' · ')[0];
          return '<tr class="clickable" data-open="' + U.esc(v.studentId) + '">' +
            '<td class="nm">' + U.esc(s ? s.name : '(삭제됨)') + '</td>' +
            '<td><span class="tag ' + st.cls + '">' + st.label + '</span>' +
              (st.note ? '<div class="hint" style="font-size:11px;margin-top:2px">' + st.note + '</div>' : '') + '</td>' +
            '<td>' + U.esc(title) + '</td>' +
            '<td>' + (v.status === 'done' ? '오늘 학습 끝' : U.esc(v.step || '-')) + '</td>' +
            '<td class="num">' + (Number(v.correct) || 0) + '/' + (Number(v.total) || 0) + '</td>' +
            '<td class="num">' + (v.clearPct != null ? v.clearPct + '%' : '-') + '</td>' +
            '<td class="num">' + (v.wrongLeft != null ? v.wrongLeft + '개' : '-') + '</td>' +
            '<td class="num">' + Math.round((Number(v.durationSec) || 0) / 60) + '분</td>' +
            '<td>' + agoText(minutesAgo(v.updatedAt)) + '</td></tr>';
        }).join('') + '</tbody></table></div>'
        : '<div class="hint">오늘 단어 공부를 시작한 학생이 아직 없습니다. 아이가 앱에서 공부를 시작하면 여기에 바로 나타납니다.</div>') +
      '<p class="hint" style="margin:10px 0 0;font-size:12px">' +
        '오늘 정답률 80%가 되면 아이가 학습을 끝낼 수 있습니다. 80%가 안 돼도 오답 클리어를 3번 돌면 끝나고, 남은 오답은 여기에 표시됩니다.</p>' +
      '</div></div>';
  }

  /* ---------- 렌더 ---------- */
  function render(el) {
    // '몇 분 전' 글자가 멈춰 있지 않게, 이 화면을 보는 동안 30초마다 다시 그립니다.
    clearInterval(tick);
    tick = setInterval(function () {
      if (!document.body.contains(el) || String(location.hash).indexOf('#/vocab') !== 0) { clearInterval(tick); return; }
      if (document.querySelector('.modal-wrap')) return;
      render(el);
    }, 30000);

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

      liveCard() +

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
          '<p class="hint" style="margin:0">아직 들어온 기록이 없습니다. 단어학습앱에서 결과를 내보내 ' +
          '<b>[기록 가져오기]</b>로 넣거나, 앱이 <code>#/import?d=...</code> 링크를 열도록 만들면 자동으로 쌓입니다. ' +
          '형식은 <b>docs/단어학습앱-연동.md</b>에 정리해 두었습니다.</p>' +
        '</div></div>') +

      '<div class="grid g-21" style="margin-bottom:16px">' +
        '<div class="card"><div class="card-h"><h2>학생별 정답률</h2></div><div class="card-b">' +
          (studied.length
            ? studied.slice().sort(function (a, b) { return b.sum.accuracy - a.sum.accuracy; })
                .map(function (d) { return UI.bar(d.s.name, d.sum.accuracy, 100, '%'); }).join('')
            : UI.emptyBox('기간 내 학습 기록이 없습니다.', 'device')) +
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
                  '<br><span style="font-size:12px;color:#6b7b8a">' + U.esc(v.setName || '') +
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
          }).join('') : '<tr><td colspan="8">' + UI.emptyBox('등록생이 없습니다.', 'students') + '</td></tr>') +
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
        : UI.emptyBox('링크에서 기록을 읽지 못했습니다. 링크가 잘리지 않았는지 확인해 주세요.', 'alert')) +
      '</div></div>';
    if (payload) openImport(text);
  }

  return { title: title, sub: sub, render: render, renderImportRoute: renderImportRoute, openImport: openImport };
})();
