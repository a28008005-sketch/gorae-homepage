/* ===== 수납 · 결제 시스템 =====
 * 청구서 생성, 수납 현황 관리, 미납자 안내
 * 실제 결제 처리는 PG 연동 (IMP, Toss, 카카오페이 등)이 필요합니다.
 */
window.Views = window.Views || {};
Views.payments = (function () {

  function title() { return '수납 · 결제'; }

  function render() {
    var html = '<div class="page-section">';
    html += '<div class="tabs"><button class="tab-btn active" data-tab="invoice">청구서</button>';
    html += '<button class="tab-btn" data-tab="dashboard">수납현황</button>';
    html += '<button class="tab-btn" data-tab="reminder">미납자안내</button></div>';

    html += '<div id="tab-invoice" class="tab-content">';
    html += '<div class="section-header"><h2>청구서 발행</h2></div>';
    html += '<form id="pay-form" class="form-group">';
    html += '<div class="form-row">';
    html += '<select id="pay-student" required><option>학생 선택</option></select>';
    html += '<select id="pay-type" required>';
    html += '<option value="">항목 선택</option>';
    html += '<option value="tuition">수강료</option>';
    html += '<option value="textbook">교재비</option>';
    html += '<option value="shuttle">셔틀비</option>';
    html += '<option value="etc">기타</option>';
    html += '</select>';
    html += '</div>';
    html += '<div class="form-row">';
    html += '<input type="number" id="pay-amount" placeholder="금액" required>';
    html += '<input type="date" id="pay-due" required>';
    html += '</div>';
    html += '<textarea id="pay-note" placeholder="비고"></textarea>';
    html += '<button type="submit" class="btn-primary">청구서 생성</button>';
    html += '</form>';
    html += '<div id="invoice-list" class="card-list"></div>';
    html += '</div>';

    html += '<div id="tab-dashboard" class="tab-content" style="display:none;">';
    html += '<div class="section-header"><h2>수납 현황</h2></div>';
    html += '<div class="stats-grid">';
    html += '<div class="stat-card"><div class="stat-label">총 청구액</div><div class="stat-value" id="stat-total">0</div></div>';
    html += '<div class="stat-card"><div class="stat-label">수납액</div><div class="stat-value" id="stat-paid" style="color:#4CAF50">0</div></div>';
    html += '<div class="stat-card"><div class="stat-label">미납액</div><div class="stat-value" id="stat-unpaid" style="color:#f44336">0</div></div>';
    html += '<div class="stat-card"><div class="stat-label">수납률</div><div class="stat-value" id="stat-rate">0%</div></div>';
    html += '</div>';
    html += '<div id="payment-table"></div>';
    html += '</div>';

    html += '<div id="tab-reminder" class="tab-content" style="display:none;">';
    html += '<div class="section-header"><h2>미납자 안내</h2></div>';
    html += '<p class="info-box">아래 학생들에게 미납 안내를 발송합니다.</p>';
    html += '<select id="remind-template">';
    html += '<option value="default">기본 안내문</option>';
    html += '<option value="friendly">친절한 안내</option>';
    html += '<option value="formal">공식 안내</option>';
    html += '</select>';
    html += '<button id="send-reminder-btn" class="btn-primary" style="margin-left:10px;">안내 발송 (카카오톡)</button>';
    html += '<div id="unpaid-list" class="card-list" style="margin-top:20px;"></div>';
    html += '</div>';

    html += '</div>';
    return html;
  }

  function initStudentSelect() {
    var sel = document.getElementById('pay-student');
    if (!sel) return;
    Store.students({ active: true }).forEach(function (s) {
      var opt = document.createElement('option');
      opt.value = s.id;
      opt.textContent = s.name + ' (' + (s.parentPhone || '전화 없음') + ')';
      sel.appendChild(opt);
    });
  }

  function renderInvoices() {
    var list = Store.payments();
    var div = document.getElementById('invoice-list');
    if (!div) return;

    div.innerHTML = '';
    if (list.length === 0) {
      div.innerHTML = '<p class="empty-state">발행된 청구서가 없습니다.</p>';
      return;
    }

    list.forEach(function (p) {
      var s = Store.student(p.studentId);
      var card = document.createElement('div');
      card.className = 'card';
      var typeName = { tuition: '수강료', textbook: '교재비', shuttle: '셔틀비', etc: '기타' }[p.type] || p.type;
      var statusColor = p.status === '수납' ? '#4CAF50' : '#f44336';

      card.innerHTML = '<div class="card-header">' +
        '<h3>' + U.esc(s ? s.name : '(삭제된 학생)') + '</h3>' +
        '<span class="badge" style="background:' + statusColor + '">' + p.status + '</span>' +
        '</div>' +
        '<p><strong>항목:</strong> ' + typeName + '</p>' +
        '<p><strong>금액:</strong> ' + U.fmtMoney(p.amount) + '</p>' +
        '<p><strong>마감일:</strong> ' + U.fmtDate(p.dueDate) + '</p>' +
        (p.note ? '<p><strong>비고:</strong> ' + U.esc(p.note) + '</p>' : '') +
        (p.paidAt ? '<p><strong>수납일:</strong> ' + U.fmtDate(p.paidAt) + '</p>' : '') +
        '<div class="card-actions">';

      if (p.status === '미납') {
        card.innerHTML += '<button class="btn-small mark-paid" data-id="' + p.id + '">수납 표시</button>';
        card.innerHTML += '<button class="btn-small send-kakao" data-id="' + p.id + '">카카오톡 발송</button>';
      }
      card.innerHTML += '<button class="btn-small btn-danger delete-pay" data-id="' + p.id + '">삭제</button>' +
        '</div>';

      div.appendChild(card);
    });

    document.querySelectorAll('.mark-paid').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var p = Store.payments().filter(function(x) { return x.id === this.dataset.id; }.bind(this))[0];
        if (p) {
          p.status = '수납';
          p.paidAt = U.ymd();
          Store.savePayment(p);
          renderInvoices();
          renderDashboard();
          UI.toast('수납이 기록되었습니다.');
        }
      });
    });

    document.querySelectorAll('.delete-pay').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (confirm('청구서를 삭제하시겠습니까?')) {
          Store.deletePayment(this.dataset.id);
          renderInvoices();
          renderDashboard();
        }
      });
    });

    document.querySelectorAll('.send-kakao').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var p = Store.payments().filter(function(x) { return x.id === this.dataset.id; }.bind(this))[0];
        if (p) {
          var s = Store.student(p.studentId);
          showKakaoPaymentLink(s, p);
        }
      });
    });
  }

  function renderDashboard() {
    var payments = Store.payments();
    var total = 0, paid = 0;
    payments.forEach(function (p) {
      total += p.amount;
      if (p.status === '수납') paid += p.amount;
    });
    var unpaid = total - paid;
    var rate = total > 0 ? Math.round((paid / total) * 100) : 0;

    document.getElementById('stat-total').textContent = U.fmtMoney(total);
    document.getElementById('stat-paid').textContent = U.fmtMoney(paid);
    document.getElementById('stat-unpaid').textContent = U.fmtMoney(unpaid);
    document.getElementById('stat-rate').textContent = rate + '%';

    var table = document.getElementById('payment-table');
    if (!table) return;

    var html = '<table class="table"><tr><th>학생</th><th>항목</th><th>금액</th><th>마감일</th><th>상태</th></tr>';
    payments.slice().sort(function(a, b) { return a.dueDate < b.dueDate ? 1 : -1; }).forEach(function (p) {
      var s = Store.student(p.studentId);
      var typeName = { tuition: '수강료', textbook: '교재비', shuttle: '셔틀비', etc: '기타' }[p.type] || p.type;
      html += '<tr><td>' + U.esc(s ? s.name : '(삭제)') + '</td><td>' + typeName + '</td><td>' +
        U.fmtMoney(p.amount) + '</td><td>' + U.fmtDate(p.dueDate) + '</td><td>' + p.status + '</td></tr>';
    });
    html += '</table>';
    table.innerHTML = html;
  }

  function renderUnpaid() {
    var unpaid = Store.payments({ status: '미납' });
    var div = document.getElementById('unpaid-list');
    if (!div) return;

    div.innerHTML = '';
    if (unpaid.length === 0) {
      div.innerHTML = '<p class="empty-state">미납자가 없습니다.</p>';
      return;
    }

    unpaid.forEach(function (p) {
      var s = Store.student(p.studentId);
      var card = document.createElement('div');
      card.className = 'card';
      card.innerHTML = '<h3>' + U.esc(s ? s.name : '(삭제된 학생)') + '</h3>' +
        '<p>미납액: <strong>' + U.fmtMoney(p.amount) + '</strong> / 마감일: ' + U.fmtDate(p.dueDate) + '</p>' +
        '<p>전화: ' + U.esc(s ? (s.parentPhone || '없음') : '없음') + '</p>';
      div.appendChild(card);
    });
  }

  function showKakaoPaymentLink(student, payment) {
    var typeName = { tuition: '수강료', textbook: '교재비', shuttle: '셔틀비', etc: '기타' }[payment.type] || payment.type;
    var html = '<div><h3>카카오톡 결제 링크 생성</h3>' +
      '<p><strong>학생:</strong> ' + U.esc(student.name) + '</p>' +
      '<p><strong>항목:</strong> ' + typeName + '</p>' +
      '<p><strong>금액:</strong> ' + U.fmtMoney(payment.amount) + '</p>' +
      '<hr>' +
      '<p style="color:#666;font-size:12px;">📌 백엔드 연동 필요</p>' +
      '<p>현재는 테스트 모드입니다. 실제 결제 링크를 생성하려면:</p>' +
      '<ol style="text-align:left;">' +
      '<li>PG사 (아임포트, 토스, 카카오페이 등) 가입</li>' +
      '<li>API 키 설정 → 알림 설정 메뉴에서 입력</li>' +
      '<li>백엔드 서버에서 결제 링크 생성 후 학부모에게 발송</li>' +
      '</ol>' +
      '<p style="background:#f5f5f5;padding:10px;border-radius:4px;margin-top:15px;">' +
      '<strong>테스트 메시지:</strong><br>' +
      '고래영어: [' + typeName + '] ' + U.fmtMoney(payment.amount) + ' 결제 요청' +
      '<br><a href="#" style="color:#007bff;">결제하기</a> (링크 클릭 시 실제 결제창 열림)' +
      '</p>';
    UI.modal(html);
  }

  function setup() {
    initStudentSelect();

    var form = document.getElementById('pay-form');
    if (form) {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var p = {
          studentId: document.getElementById('pay-student').value,
          type: document.getElementById('pay-type').value,
          amount: parseInt(document.getElementById('pay-amount').value),
          dueDate: document.getElementById('pay-due').value,
          note: document.getElementById('pay-note').value
        };
        Store.savePayment(p);
        form.reset();
        renderInvoices();
        renderDashboard();
        UI.toast('청구서가 생성되었습니다.');
      });
    }

    document.querySelectorAll('.tab-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        document.querySelectorAll('.tab-btn').forEach(function(b) { b.classList.remove('active'); });
        document.querySelectorAll('.tab-content').forEach(function(c) { c.style.display = 'none'; });
        this.classList.add('active');
        document.getElementById('tab-' + this.dataset.tab).style.display = 'block';
        if (this.dataset.tab === 'dashboard') renderDashboard();
        if (this.dataset.tab === 'reminder') renderUnpaid();
      });
    });

    var reminderBtn = document.getElementById('send-reminder-btn');
    if (reminderBtn) {
      reminderBtn.addEventListener('click', function () {
        var template = document.getElementById('remind-template').value;
        showReminderGuide(template);
      });
    }

    renderInvoices();
  }

  function showReminderGuide(template) {
    var unpaid = Store.payments({ status: '미납' });
    var msg = {
      default: '안녕하세요. 고래영어입니다. 아래의 미납 내용을 확인하시고 결제 부탁드립니다.',
      friendly: '고래영어입니다. 아이의 교육을 위해 수강료 확인 부탁드립니다 😊',
      formal: '[고래영어] 수강료 안내 - 상기 금액을 지정된 기한까지 납부하여 주시기 바랍니다.'
    }[template] || '';

    var html = '<div><h3>미납자 안내 발송</h3>' +
      '<p><strong>미납자 수:</strong> ' + unpaid.length + '명</p>' +
      '<p><strong>메시지 내용:</strong></p>' +
      '<p style="background:#f5f5f5;padding:10px;border-radius:4px;">' + U.esc(msg) + '</p>' +
      '<hr>' +
      '<p style="color:#666;font-size:12px;">📌 백엔드 연동 필요</p>' +
      '<p>실제 카카오 알림톡 발송을 위해서는:</p>' +
      '<ol style="text-align:left;">' +
      '<li><strong>카카오 비즈니스 가입</strong> (비즈메시지 또는 알림톡)</li>' +
      '<li><strong>템플릿 등록</strong> - 카카오에서 승인</li>' +
      '<li><strong>백엔드 API 구축</strong> - Node.js/Python에서 카카오 API 호출</li>' +
      '<li><strong>연동 설정 입력</strong> - "알림 설정" 메뉴에서 키 입력</li>' +
      '</ol>' +
      '<p>현재는 테스트 모드입니다.</p>';
    UI.modal(html);
  }

  return { title: title, render: render, setup: setup };
})();
