/* ===== 학부모 공유 리포트 =====
 * 노션의 [학부모 공유 페이지 만들기]를 대체합니다.
 * 리포트 데이터를 링크(#/report?d=...) 안에 담아 전달하므로
 * 학부모는 로그인 없이 링크만 열면 아이의 기록을 볼 수 있습니다.
 */
window.Views = window.Views || {};
Views.share = (function () {

  var state = { studentId: '', from: U.daysAgo(29), to: U.ymd(), comment: '' };

  function title() { return '학부모 공유'; }
  function sub() { return '기간별 학습 리포트를 만들어 링크로 전달합니다'; }

  /* ---------- 리포트 데이터 ---------- */
  function build(studentId, from, to, comment) {
    var s = Store.student(studentId);
    if (!s) return null;
    var sum = Store.summarize(studentId, from, to);
    var ac = Store.get().academy;
    return {
      v: 1,
      academy: { name: ac.name, campus: ac.campus, phone: ac.phone, address: ac.address },
      student: { name: s.name, grade: s.grade || '', className: Store.scheduleOf(s).className },
      period: { from: from, to: to },
      stats: {
        total: sum.total, present: sum.present, absent: sum.absent, rate: sum.rate,
        planner: sum.planner, planDone: sum.planDone, homework: sum.homework,
        homeworkRate: sum.homeworkRate, flags: sum.flags, attitudeIssues: sum.attitudeIssues
      },
      records: sum.records.map(function (r) {
        return { d: r.date, s: r.status, f: r.flags || [], p: !!r.planner, c: !!r.planDone, h: !!r.homework, n: r.note || '' };
      }),
      comment: comment || '',
      issuedAt: U.ymd()
    };
  }

  /* ---------- 리포트 HTML (공유 화면과 미리보기가 공용) ---------- */
  function reportHtml(rep) {
    var st = rep.stats;
    var rows = rep.records.length
      ? '<div class="table-wrap"><table class="tbl" style="min-width:auto">' +
        '<thead><tr><th>날짜</th><th>출결</th><th>플래너</th><th>계획실천</th><th>숙제</th><th>선생님 메모</th></tr></thead><tbody>' +
        rep.records.map(function (r) {
          var tag = !r.s ? '<span class="tag gray">-</span>'
            : r.s === '결석' ? '<span class="tag bad">결석</span>'
            : (r.f.length ? '<span class="tag warn">출석 · ' + U.esc(r.f.join('/')) + '</span>' : '<span class="tag ok">출석</span>');
          return '<tr><td>' + U.shortDate(r.d) + '</td><td>' + tag + '</td>' +
            '<td>' + (r.p ? '✅' : '–') + '</td><td>' + (r.c ? '✅' : '–') + '</td>' +
            '<td>' + (r.h ? '✅' : '–') + '</td><td>' + U.esc(r.n) + '</td></tr>';
        }).join('') + '</tbody></table></div>'
      : '<div class="hint">이 기간에 기록된 출결이 없습니다.</div>';

    return '<div class="report">' +
      '<div class="report-hd">' +
        '<div style="font-size:12.5px;color:#c9e3f8">🐋 ' + U.esc(rep.academy.name) + ' ' + U.esc(rep.academy.campus) + ' 학습 리포트</div>' +
        '<div class="who" style="margin-top:6px">' + U.esc(rep.student.name) +
          (rep.student.grade ? ' <span style="font-size:14px;font-weight:500">· ' + U.esc(rep.student.grade) + '</span>' : '') +
          (rep.student.className ? ' <span style="font-size:13px;font-weight:500;opacity:.85">· ' + U.esc(rep.student.className) + '</span>' : '') + '</div>' +
        '<div class="sub">' + U.human(rep.period.from) + ' ~ ' + U.human(rep.period.to) + '</div>' +
      '</div>' +
      '<div class="report-bd">' +
        '<div class="report-stats">' +
          '<div class="report-stat"><div class="v">' + st.rate + '%</div><div class="l">출석률</div></div>' +
          '<div class="report-stat"><div class="v">' + st.present + '/' + st.total + '</div><div class="l">출석 / 수업</div></div>' +
          '<div class="report-stat"><div class="v">' + st.homeworkRate + '%</div><div class="l">숙제 이행률</div></div>' +
          '<div class="report-stat"><div class="v">' + st.planner + '</div><div class="l">플래너 작성</div></div>' +
        '</div>' +

        '<div class="row" style="gap:6px;margin-bottom:16px">' +
          '<span class="tag gray">지각 ' + st.flags['지각'] + '회</span>' +
          '<span class="tag gray">외출 ' + st.flags['외출'] + '회</span>' +
          '<span class="tag gray">조퇴 ' + st.flags['조퇴'] + '회</span>' +
          '<span class="tag gray">결석 ' + st.absent + '회</span>' +
        '</div>' +

        (rep.comment
          ? '<div style="background:var(--mint-soft);border-radius:12px;padding:14px 16px;margin-bottom:18px">' +
            '<div style="font-size:12px;font-weight:700;color:#0d8375;margin-bottom:6px">선생님 코멘트</div>' +
            '<div style="font-size:13.5px;line-height:1.7;white-space:pre-wrap">' + U.esc(rep.comment) + '</div></div>'
          : '') +

        '<div class="section-title">기간 내 출결 기록</div>' + rows +

        '<div style="margin-top:22px;padding-top:14px;border-top:1px solid var(--line);font-size:12px;color:#93a4b4;line-height:1.7">' +
          U.esc(rep.academy.name) + ' ' + U.esc(rep.academy.campus) + '<br>' +
          U.esc(rep.academy.address || '') + (rep.academy.phone ? ' · ' + U.esc(rep.academy.phone) : '') + '<br>' +
          '발행일 ' + U.esc(rep.issuedAt) +
        '</div>' +
      '</div></div>';
  }

  /* ---------- 공유 링크 ---------- */
  function linkFor(rep) {
    var base = location.href.split('#')[0];
    return base + '#/report?d=' + U.encodeData(rep);
  }

  /* ---------- 관리자 화면 ---------- */
  function render(el) {
    var params = App.query();
    if (params.student) { state.studentId = params.student; }

    var list = Store.students();
    if (!state.studentId && list.length) state.studentId = list[0].id;

    el.innerHTML =
      '<div class="grid g-12">' +
        '<div class="card" style="height:fit-content">' +
          '<div class="card-h"><h2>리포트 만들기</h2></div>' +
          '<div class="card-b">' +
            '<label class="fld" style="margin-bottom:12px">학생' +
              '<select id="sh-stu">' + UI.options(list.map(function (s) {
                return { value: s.id, label: s.name + (s.grade ? ' · ' + s.grade : '') };
              }), state.studentId, list.length ? '' : '등록된 학생 없음') + '</select></label>' +
            '<div class="form-grid" style="margin-bottom:12px">' +
              '<label class="fld">시작일<input type="date" id="sh-from" value="' + state.from + '"></label>' +
              '<label class="fld">종료일<input type="date" id="sh-to" value="' + state.to + '"></label>' +
            '</div>' +
            '<div class="chips" style="margin-bottom:12px">' +
              '<button class="chip" data-preset="7">최근 7일</button>' +
              '<button class="chip" data-preset="30">최근 30일</button>' +
              '<button class="chip" data-preset="month">이번 달</button>' +
            '</div>' +
            '<label class="fld" style="margin-bottom:14px">선생님 코멘트' +
              '<textarea id="sh-comment" placeholder="이번 기간 아이의 학습 모습을 한두 문장으로 남겨 주세요." style="min-height:96px">' + U.esc(state.comment) + '</textarea></label>' +
            '<button class="btn primary block" id="sh-make" style="margin-bottom:8px">리포트 생성 · 링크 만들기</button>' +
            '<button class="btn block" id="sh-print">인쇄 / PDF 저장</button>' +
            '<p class="hint" style="margin:14px 0 0">링크에는 <b>학생 이름과 출결 기록만</b> 담깁니다. 연락처는 포함되지 않습니다. ' +
            '링크를 아는 사람은 누구나 열람할 수 있으니 학부모님께만 전달해 주세요.</p>' +
          '</div>' +
        '</div>' +

        '<div id="sh-preview"></div>' +
      '</div>';

    function currentReport() {
      return build(
        el.querySelector('#sh-stu').value,
        el.querySelector('#sh-from').value,
        el.querySelector('#sh-to').value,
        el.querySelector('#sh-comment').value.trim()
      );
    }

    function preview() {
      var rep = currentReport();
      el.querySelector('#sh-preview').innerHTML = rep
        ? reportHtml(rep)
        : '<div class="card"><div class="card-b">' + UI.emptyBox('학생을 먼저 등록해 주세요.', '🧒') + '</div></div>';
    }
    preview();

    ['#sh-stu', '#sh-from', '#sh-to'].forEach(function (sel) {
      el.querySelector(sel).addEventListener('change', preview);
    });
    el.querySelector('#sh-comment').addEventListener('input', function (e) {
      state.comment = e.target.value;
      preview();
    });

    UI.on(el, '[data-preset]', 'click', function (e, btn) {
      var p = btn.getAttribute('data-preset');
      if (p === 'month') {
        el.querySelector('#sh-from').value = U.ym(new Date()) + '-01';
        el.querySelector('#sh-to').value = U.ymd();
      } else {
        el.querySelector('#sh-from').value = U.daysAgo(+p - 1);
        el.querySelector('#sh-to').value = U.ymd();
      }
      preview();
    });

    el.querySelector('#sh-print').addEventListener('click', function () { window.print(); });

    el.querySelector('#sh-make').addEventListener('click', function () {
      var rep = currentReport();
      if (!rep) { UI.toast('학생을 선택해 주세요.', true); return; }
      var url = linkFor(rep);
      var isFile = location.protocol === 'file:';

      UI.modal({
        title: rep.student.name + ' 학부모 공유 링크',
        body:
          '<label class="fld">공유 링크<textarea id="sh-url" readonly style="min-height:110px;font-size:12px;word-break:break-all">' + U.esc(url) + '</textarea></label>' +
          '<div class="row" style="margin-top:12px">' +
            '<button class="btn primary" id="sh-copy">링크 복사</button>' +
            '<button class="btn" id="sh-open">새 창에서 열어보기</button>' +
            (rep.academy.phone ? '<a class="btn" href="sms:?body=' + encodeURIComponent(rep.student.name + ' 학생 학습 리포트입니다.\n' + url) + '">문자로 보내기</a>' : '') +
          '</div>' +
          (isFile
            ? '<p class="hint" style="margin-top:14px;color:#a2610f">지금은 파일을 직접 열어 사용 중이라 링크가 이 컴퓨터에서만 열립니다. ' +
              '홈페이지 주소(whalejinju.kr)로 접속해 만들면 학부모님도 바로 열어보실 수 있습니다.</p>'
            : '<p class="hint" style="margin-top:14px">카카오톡 · 문자로 링크를 전달하세요. 학부모님은 앱 설치나 로그인 없이 바로 열람할 수 있습니다.</p>'),
        onMount: function (w) {
          w.querySelector('#sh-copy').addEventListener('click', function () {
            U.copy(url).then(function () { UI.toast('링크를 복사했습니다.'); })
              .catch(function () { UI.toast('복사에 실패했습니다. 직접 선택해 복사해 주세요.', true); });
          });
          w.querySelector('#sh-open').addEventListener('click', function () { window.open(url, '_blank'); });
        }
      });
    });
  }

  /* ---------- 학부모용 읽기 전용 화면 ---------- */
  function renderReport(el, encoded) {
    var rep = U.decodeData(encoded);
    document.body.classList.add('share-mode');
    if (!rep || !rep.student) {
      el.innerHTML = '<div class="share-view"><div class="card"><div class="card-b">' +
        UI.emptyBox('리포트를 불러올 수 없습니다. 링크가 잘리지 않았는지 확인해 주세요.', '⚠️') +
        '</div></div></div>';
      return;
    }
    document.title = rep.student.name + ' 학습 리포트 · ' + rep.academy.name;
    el.innerHTML = '<div class="share-view">' + reportHtml(rep) +
      '<div class="row end no-print" style="margin-top:16px">' +
        '<button class="btn" id="rp-print">인쇄 / PDF 저장</button></div></div>';
    el.querySelector('#rp-print').addEventListener('click', function () { window.print(); });
  }

  return { title: title, sub: sub, render: render, renderReport: renderReport, build: build, reportHtml: reportHtml };
})();
