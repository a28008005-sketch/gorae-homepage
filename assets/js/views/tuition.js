/* ===== 수강료 납부 관리 ===== */
window.Views = window.Views || {};
Views.tuition = (function () {

  var month = U.ym(new Date());
  var filter = 'all';   // all | unpaid | paid

  function title() { return '수강료 납부'; }
  function sub() { return U.humanMonth(month) + ' 청구 · 수납 현황'; }

  /* ---------- 목록 ---------- */
  function visible() {
    return Store.payments({ month: month }).filter(function (p) {
      var k = Store.paymentStatus(p).key;
      if (filter === 'unpaid') return k === 'overdue' || k === 'due' || k === 'partial';
      if (filter === 'paid') return k === 'paid' || k === 'exempt';
      return true;
    }).sort(function (a, b) {
      var sa = Store.student(a.studentId), sb = Store.student(b.studentId);
      return U.byName(sa || { name: '' }, sb || { name: '' });
    });
  }

  function rows() {
    var list = visible();
    if (!list.length) {
      return '<tr><td colspan="8">' + UI.emptyBox(
        Store.payments({ month: month }).length
          ? '조건에 맞는 청구 건이 없습니다.'
          : U.humanMonth(month) + ' 청구서가 아직 없습니다. 위의 [청구서 일괄 생성]을 눌러 주세요.', '🧾') + '</td></tr>';
    }
    return list.map(function (p) {
      var s = Store.student(p.studentId);
      var st = Store.paymentStatus(p);
      var paid = Number(p.paidAmount) || 0;
      return '<tr data-pid="' + p.id + '">' +
        '<td class="nm">' + U.esc(s ? s.name : '(삭제된 학생)') + '</td>' +
        '<td>' + U.esc(s && s.grade ? s.grade : '-') + '</td>' +
        '<td class="num">' + U.num(p.amount) + '</td>' +
        '<td class="num">' + (paid ? U.num(paid) : '<span style="color:#b3c1cd">0</span>') + '</td>' +
        '<td><span class="tag ' + st.tag + '">' + U.esc(st.label) + '</span></td>' +
        '<td>' + U.esc(p.dueDate || '-') + '</td>' +
        '<td>' + (p.paidDate ? U.esc(p.paidDate) + (p.method ? ' <span class="tag gray">' + U.esc(p.method) + '</span>' : '') : '-') + '</td>' +
        '<td style="white-space:nowrap">' +
          '<button class="btn sm" data-pay="' + p.id + '">납부 처리</button> ' +
          (paid > 0 ? '<button class="btn sm ghost" data-receipt="' + p.id + '">영수증</button> ' : '') +
          '<button class="x-btn" data-del="' + p.id + '" title="청구 삭제">&times;</button>' +
        '</td>' +
      '</tr>';
    }).join('');
  }

  /* ---------- 납부 처리 ---------- */
  function openPay(pid) {
    var p = Store.payments({}).filter(function (x) { return x.id === pid; })[0];
    if (!p) return;
    var s = Store.student(p.studentId);
    var remain = Math.max(0, (Number(p.amount) || 0) - (Number(p.paidAmount) || 0));

    UI.modal({
      title: (s ? s.name : '') + ' · ' + U.humanMonth(p.month) + ' 수강료',
      body:
        '<div class="form-grid">' +
          '<label class="fld">청구 금액<input type="number" id="p-amount" value="' + (Number(p.amount) || 0) + '" step="1000"></label>' +
          '<label class="fld">납부 기한<input type="date" id="p-due" value="' + U.esc(p.dueDate || '') + '"></label>' +
          '<label class="fld">납부 금액<input type="number" id="p-paid" value="' + (Number(p.paidAmount) || 0) + '" step="1000"></label>' +
          '<label class="fld">납부일<input type="date" id="p-date" value="' + U.esc(p.paidDate || U.ymd()) + '"></label>' +
          '<label class="fld">결제 수단<select id="p-method">' +
            UI.options(Store.PAY_METHODS, p.method, '선택 안 함') + '</select></label>' +
          '<label class="fld">&nbsp;<button class="btn mint" id="p-full">전액 납부 입력' +
            (remain ? ' (' + U.num(remain) + '원)' : '') + '</button></label>' +
          '<label class="fld full">비고<input type="text" id="p-note" value="' + U.esc(p.note || '') + '" placeholder="형제 할인, 분납 등"></label>' +
        '</div>',
      footer: '<button class="btn" id="p-unpay">납부 취소</button><div class="sp"></div>' +
              '<button class="btn" data-close>닫기</button><button class="btn primary" id="p-save">저장</button>',
      onMount: function (w) {
        w.querySelector('#p-full').addEventListener('click', function () {
          w.querySelector('#p-paid').value = w.querySelector('#p-amount').value;
          w.querySelector('#p-date').value = w.querySelector('#p-date').value || U.ymd();
        });
        w.querySelector('#p-unpay').addEventListener('click', function () {
          Store.savePayment({ id: p.id, paidAmount: 0, paidDate: '', method: '' });
          UI.close(); UI.toast('납부 기록을 지웠습니다.'); App.rerender();
        });
        w.querySelector('#p-save').addEventListener('click', function () {
          var paidAmount = Number(w.querySelector('#p-paid').value) || 0;
          Store.savePayment({
            id: p.id,
            amount: Number(w.querySelector('#p-amount').value) || 0,
            dueDate: w.querySelector('#p-due').value,
            paidAmount: paidAmount,
            paidDate: paidAmount > 0 ? (w.querySelector('#p-date').value || U.ymd()) : '',
            method: w.querySelector('#p-method').value,
            note: w.querySelector('#p-note').value.trim()
          });
          UI.close();
          UI.toast(paidAmount > 0 ? '납부 처리했습니다.' : '저장했습니다.');
          App.rerender();
        });
      }
    });
  }

  /* ---------- 미납 안내 문자 ---------- */
  function noticeText(p, s) {
    var ac = Store.get().academy;
    var remain = (Number(p.amount) || 0) - (Number(p.paidAmount) || 0);
    var lines = [
      '안녕하세요, ' + ac.name + ' ' + (ac.campus || '') + '입니다.',
      '',
      (s ? s.name : '') + ' 학생 ' + U.humanMonth(p.month) + ' 수강료 안내드립니다.',
      '· 납부 금액: ' + U.won(remain),
      '· 납부 기한: ' + (p.dueDate || '-')
    ];
    if (ac.bankAccount) {
      lines.push('· 입금 계좌: ' + [ac.bankName, ac.bankAccount, ac.bankHolder].filter(Boolean).join(' '));
    }
    lines.push('', '문의: ' + (ac.phone || '') , '감사합니다.');
    return lines.join('\n');
  }

  function openNotice() {
    var unpaid = Store.payments({ month: month }).filter(function (p) {
      var k = Store.paymentStatus(p).key;
      return k === 'overdue' || k === 'due' || k === 'partial';
    });
    if (!unpaid.length) { UI.toast('미납 건이 없습니다.'); return; }

    UI.modal({
      title: U.humanMonth(month) + ' 미납 안내 (' + unpaid.length + '명)',
      wide: true,
      body: unpaid.map(function (p) {
        var s = Store.student(p.studentId);
        var st = Store.paymentStatus(p);
        return '<div style="border:1px solid var(--line);border-radius:11px;padding:12px 14px;margin-bottom:10px">' +
          '<div class="row" style="margin-bottom:8px"><b>' + U.esc(s ? s.name : '') + '</b>' +
            '<span class="tag ' + st.tag + '">' + U.esc(st.label) + '</span>' +
            '<span class="hint">' + U.esc(s && s.parentPhone ? U.phone(s.parentPhone) : '연락처 없음') + '</span>' +
            '<div class="sp"></div>' +
            '<button class="btn sm" data-copy-notice="' + p.id + '">문자 내용 복사</button>' +
            (s && s.parentPhone ? '<a class="btn sm" href="sms:' + U.esc(s.parentPhone) + '?body=' +
              encodeURIComponent(noticeText(p, s)) + '">문자 앱으로</a>' : '') +
          '</div>' +
          '<pre style="margin:0;font-family:inherit;font-size:12.5px;color:#63778a;white-space:pre-wrap;line-height:1.6">' +
            U.esc(noticeText(p, s)) + '</pre>' +
        '</div>';
      }).join(''),
      onMount: function (w) {
        UI.on(w, '[data-copy-notice]', 'click', function (e, btn) {
          var p = unpaid.filter(function (x) { return x.id === btn.getAttribute('data-copy-notice'); })[0];
          U.copy(noticeText(p, Store.student(p.studentId)))
            .then(function () { UI.toast('복사했습니다.'); })
            .catch(function () { UI.toast('복사에 실패했습니다.', true); });
        });
      }
    });
  }

  /* ---------- 영수증 ---------- */
  function receiptData(p) {
    var s = Store.student(p.studentId);
    var ac = Store.get().academy;
    return {
      v: 1,
      academy: { name: ac.name, campus: ac.campus, phone: ac.phone, address: ac.address },
      student: { name: s ? s.name : '', grade: s && s.grade ? s.grade : '' },
      month: p.month,
      amount: Number(p.amount) || 0,
      paidAmount: Number(p.paidAmount) || 0,
      paidDate: p.paidDate || '',
      method: p.method || '',
      note: p.note || '',
      issuedAt: U.ymd()
    };
  }

  function receiptHtml(r) {
    var remain = r.amount - r.paidAmount;
    return '<div class="report">' +
      '<div class="report-hd">' +
        '<div style="font-size:12.5px;color:#c9e3f8">🐋 ' + U.esc(r.academy.name) + ' ' + U.esc(r.academy.campus) + '</div>' +
        '<div class="who" style="margin-top:6px">수강료 납부 확인서</div>' +
        '<div class="sub">' + U.humanMonth(r.month) + ' 수강료</div>' +
      '</div>' +
      '<div class="report-bd">' +
        '<dl class="kv" style="grid-template-columns:110px 1fr;font-size:14px">' +
          '<dt>학생</dt><dd><b>' + U.esc(r.student.name) + '</b>' + (r.student.grade ? ' · ' + U.esc(r.student.grade) : '') + '</dd>' +
          '<dt>청구 금액</dt><dd>' + U.won(r.amount) + '</dd>' +
          '<dt>납부 금액</dt><dd><b style="color:#12a05c">' + U.won(r.paidAmount) + '</b></dd>' +
          (remain > 0 ? '<dt>잔액</dt><dd style="color:#d5453f">' + U.won(remain) + '</dd>' : '') +
          '<dt>납부일</dt><dd>' + (r.paidDate ? U.human(r.paidDate) : '-') + '</dd>' +
          '<dt>결제 수단</dt><dd>' + U.esc(r.method || '-') + '</dd>' +
          (r.note ? '<dt>비고</dt><dd>' + U.esc(r.note) + '</dd>' : '') +
        '</dl>' +
        '<p style="margin:22px 0 0;font-size:13.5px;line-height:1.8">위 금액을 정히 영수하였음을 확인합니다.</p>' +
        '<div style="margin-top:22px;padding-top:14px;border-top:1px solid var(--line);font-size:12px;color:#93a4b4;line-height:1.7">' +
          U.esc(r.academy.name) + ' ' + U.esc(r.academy.campus) + '<br>' +
          U.esc(r.academy.address || '') + (r.academy.phone ? ' · ' + U.esc(r.academy.phone) : '') + '<br>' +
          '발행일 ' + U.esc(r.issuedAt) +
        '</div>' +
      '</div></div>';
  }

  function openReceipt(pid) {
    var p = Store.payments({}).filter(function (x) { return x.id === pid; })[0];
    if (!p) return;
    var r = receiptData(p);
    var url = location.href.split('#')[0] + '#/receipt?d=' + U.encodeData(r);
    UI.modal({
      title: '납부 확인서',
      wide: true,
      body: receiptHtml(r) +
        '<div class="row" style="margin-top:14px">' +
          '<button class="btn primary" id="r-open">새 창에서 열기 · 인쇄</button>' +
          '<button class="btn" id="r-copy">링크 복사</button>' +
        '</div>' +
        '<p class="hint" style="margin-top:10px">링크를 학부모님께 보내면 앱 설치 없이 확인서를 열람·인쇄하실 수 있습니다.</p>',
      onMount: function (w) {
        w.querySelector('#r-open').addEventListener('click', function () { window.open(url, '_blank'); });
        w.querySelector('#r-copy').addEventListener('click', function () {
          U.copy(url).then(function () { UI.toast('링크를 복사했습니다.'); })
            .catch(function () { UI.toast('복사에 실패했습니다.', true); });
        });
      }
    });
  }

  /** 학부모용 읽기 전용 확인서 */
  function renderReceipt(el, encoded) {
    var r = U.decodeData(encoded);
    document.body.classList.add('share-mode');
    if (!r || !r.student) {
      el.innerHTML = '<div class="share-view"><div class="card"><div class="card-b">' +
        UI.emptyBox('확인서를 불러올 수 없습니다. 링크가 잘리지 않았는지 확인해 주세요.', '⚠️') + '</div></div></div>';
      return;
    }
    document.title = r.student.name + ' 수강료 납부 확인서';
    el.innerHTML = '<div class="share-view">' + receiptHtml(r) +
      '<div class="row end no-print" style="margin-top:16px">' +
      '<button class="btn" id="rc-print">인쇄 / PDF 저장</button></div></div>';
    el.querySelector('#rc-print').addEventListener('click', function () { window.print(); });
  }

  /* ---------- 렌더 ---------- */
  function render(el) {
    var sum = Store.paymentSummary(month);
    var ac = Store.get().academy;

    el.innerHTML =
      '<div class="card" style="margin-bottom:16px"><div class="card-b" style="padding:12px 16px">' +
        '<div class="row">' +
          '<b style="font-size:13.5px">청구 월</b>' +
          '<input type="month" id="month" value="' + month + '" style="width:170px">' +
          '<button class="btn primary" id="gen">청구서 일괄 생성</button>' +
          '<div class="sp"></div>' +
          '<div class="seg">' +
            '<button data-f="all" class="' + (filter === 'all' ? 'on' : '') + '">전체</button>' +
            '<button data-f="unpaid" class="' + (filter === 'unpaid' ? 'on' : '') + '">미납</button>' +
            '<button data-f="paid" class="' + (filter === 'paid' ? 'on' : '') + '">완납</button>' +
          '</div>' +
          '<button class="btn" id="notice">미납 안내 문자</button>' +
          '<button class="btn" id="csv">CSV</button>' +
        '</div>' +
      '</div></div>' +

      '<div class="grid g-4" style="margin-bottom:16px">' +
        '<div class="stat accent"><div class="lbl">수납률</div><div class="val">' + sum.rate + '<small>%</small></div>' +
          '<div class="sub">' + U.humanMonth(month) + '</div></div>' +
        '<div class="stat"><div class="lbl">청구 총액</div><div class="val" style="font-size:22px">' + U.num(sum.billed) + '<small>원</small></div>' +
          '<div class="sub">청구 ' + sum.list.length + '건</div></div>' +
        '<div class="stat"><div class="lbl">수납액</div><div class="val" style="font-size:22px;color:#12a05c">' + U.num(sum.collected) + '<small>원</small></div>' +
          '<div class="sub">완납 ' + sum.counts.paid + '명 · 부분 ' + sum.counts.partial + '명</div></div>' +
        '<div class="stat"><div class="lbl">미수납액</div><div class="val" style="font-size:22px;color:' + (sum.outstanding ? '#d5453f' : 'inherit') + '">' +
          U.num(sum.outstanding) + '<small>원</small></div>' +
          '<div class="sub">미납 ' + sum.unpaidCount + '명 · 연체 ' + sum.counts.overdue + '명</div></div>' +
      '</div>' +

      (ac.bankAccount ? '' :
        '<div class="card" style="margin-bottom:16px"><div class="card-b" style="padding:12px 16px">' +
        '<span class="hint">💡 <b>설정 · 백업</b>에서 입금 계좌를 등록하면 미납 안내 문자에 계좌번호가 자동으로 들어갑니다.</span>' +
        '</div></div>') +

      '<div class="card">' +
        '<div class="card-h"><h2>' + U.humanMonth(month) + ' 청구 · 수납 내역</h2></div>' +
        '<div class="table-wrap"><table class="tbl">' +
          '<thead><tr><th>학생</th><th>학년</th><th class="num">청구액</th><th class="num">납부액</th>' +
          '<th>상태</th><th>납부 기한</th><th>납부일</th><th></th></tr></thead>' +
          '<tbody id="rows">' + rows() + '</tbody>' +
        '</table></div>' +
      '</div>';

    function refresh() { render(el); }

    el.querySelector('#month').addEventListener('change', function (e) {
      month = e.target.value || U.ym(new Date());
      App.setSub(sub());
      refresh();
    });

    UI.on(el, '[data-f]', 'click', function (e, btn) {
      filter = btn.getAttribute('data-f');
      refresh();
    });

    el.querySelector('#gen').addEventListener('click', function () {
      var existing = Store.payments({ month: month }).length;
      UI.confirm(
        U.humanMonth(month) + ' 청구서를 등록생 전체에게 생성할까요?<br>' +
        '<span style="font-size:13px;color:#63778a">이미 청구서가 있는 학생은 그대로 두고, 없는 학생만 추가합니다.' +
        (existing ? ' (현재 ' + existing + '건)' : '') + '<br>' +
        '금액은 학생별 수강료가 없으면 학원 기본 수강료(' + U.won(ac.defaultFee) + ')로 들어갑니다.</span>',
        function () {
          var made = Store.generateBills(month);
          UI.toast(made ? made + '건의 청구서를 생성했습니다.' : '새로 생성할 청구서가 없습니다.');
          refresh();
        }, { yes: '생성' });
    });

    el.querySelector('#notice').addEventListener('click', openNotice);

    UI.on(el, '[data-pay]', 'click', function (e, btn) { openPay(btn.getAttribute('data-pay')); });
    UI.on(el, '[data-receipt]', 'click', function (e, btn) { openReceipt(btn.getAttribute('data-receipt')); });
    UI.on(el, '[data-del]', 'click', function (e, btn) {
      UI.confirm('이 청구 건을 삭제할까요?', function () {
        Store.deletePayment(btn.getAttribute('data-del'));
        UI.toast('삭제했습니다.');
        refresh();
      }, { danger: true, yes: '삭제' });
    });

    el.querySelector('#csv').addEventListener('click', function () {
      var head = ['학생', '학년', '청구월', '청구액', '납부액', '잔액', '상태', '납부기한', '납부일', '결제수단', '비고'];
      var body = visible().map(function (p) {
        var s = Store.student(p.studentId);
        var st = Store.paymentStatus(p);
        return [s ? s.name : '', s && s.grade ? s.grade : '', p.month,
                Number(p.amount) || 0, Number(p.paidAmount) || 0,
                (Number(p.amount) || 0) - (Number(p.paidAmount) || 0),
                st.label, p.dueDate, p.paidDate, p.method, p.note];
      });
      U.download('고래영어_수강료_' + month + '.csv', U.toCsv([head].concat(body)), 'text/csv');
      UI.toast('CSV 파일을 내려받았습니다.');
    });
  }

  return { title: title, sub: sub, render: render, renderReceipt: renderReceipt, openPay: openPay };
})();
