/* ===== 과제 관리 ===== */
window.Views = window.Views || {};
Views.assignments = (function () {

  function title() { return '과제 관리'; }

  function render() {
    var html = '<div class="page-section">';
    html += '<div class="section-header"><h2>과제 부여</h2></div>';
    html += '<form id="asn-form" class="form-group">';
    html += '<input type="text" id="asn-title" placeholder="과제명" required>';
    html += '<textarea id="asn-desc" placeholder="과제 설명" rows="4"></textarea>';
    html += '<div class="form-row">';
    html += '<select id="asn-class" required><option>반 선택</option></select>';
    html += '<input type="date" id="asn-due" required>';
    html += '</div>';
    html += '<button type="submit" class="btn-primary">과제 발행</button>';
    html += '</form>';

    html += '<div class="section-header" style="margin-top: 30px;"><h2>발행된 과제</h2></div>';
    html += '<div id="asn-list" class="card-list"></div>';
    html += '</div>';

    return html;
  }

  function initClasses() {
    var sel = document.getElementById('asn-class');
    if (!sel) return;
    var students = Store.students({ active: true });
    var classes = {};
    students.forEach(function (s) {
      (s.classes || []).forEach(function (cls) {
        classes[cls] = true;
      });
    });
    Object.keys(classes).forEach(function (cls) {
      var opt = document.createElement('option');
      opt.value = cls;
      opt.textContent = cls;
      sel.appendChild(opt);
    });
  }

  function renderList() {
    var list = Store.assignments();
    var div = document.getElementById('asn-list');
    if (!div) return;

    div.innerHTML = '';
    if (list.length === 0) {
      div.innerHTML = '<p class="empty-state">아직 발행된 과제가 없습니다.</p>';
      return;
    }

    list.forEach(function (asn) {
      var card = document.createElement('div');
      card.className = 'card';
      var dueInfo = U.ymd() > asn.dueDate ? '마감됨' : '진행중';
      var submitted = (asn.submissions || []).filter(function(s) { return s.submitted; }).length;
      var total = (asn.submissions || []).length;

      card.innerHTML = '<div class="card-header">' +
        '<h3>' + U.esc(asn.title) + '</h3>' +
        '<span class="badge" style="background:' + (dueInfo === '마감됨' ? '#999' : '#4CAF50') + '">' + dueInfo + '</span>' +
        '</div>' +
        '<p><strong>반:</strong> ' + U.esc(asn.classId || '전체') + '</p>' +
        '<p><strong>마감일:</strong> ' + U.fmtDate(asn.dueDate) + '</p>' +
        '<p><strong>설명:</strong> ' + U.esc(asn.description || '') + '</p>' +
        '<p><strong>제출:</strong> ' + submitted + ' / ' + total + ' 명</p>' +
        '<div class="card-actions">' +
        '<button class="btn-small edit-asn" data-id="' + asn.id + '">수정</button>' +
        '<button class="btn-small btn-danger delete-asn" data-id="' + asn.id + '">삭제</button>' +
        '<button class="btn-small view-submissions" data-id="' + asn.id + '">제출 현황</button>' +
        '</div>';

      div.appendChild(card);
    });

    document.querySelectorAll('.delete-asn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (confirm('과제를 삭제하시겠습니까?')) {
          Store.deleteAssignment(this.dataset.id);
          renderList();
        }
      });
    });

    document.querySelectorAll('.view-submissions').forEach(function (btn) {
      btn.addEventListener('click', function () {
        showSubmissions(this.dataset.id);
      });
    });
  }

  function showSubmissions(assignmentId) {
    var asn = Store.assignments().filter(function(a) { return a.id === assignmentId; })[0];
    if (!asn) return;

    var students = Store.students({ active: true });
    var html = '<div style="max-height:500px;overflow-y:auto;">';
    html += '<h3>' + U.esc(asn.title) + ' - 제출 현황</h3>';
    html += '<table class="table"><tr><th>학생</th><th>제출</th><th>제출일</th></tr>';

    students.forEach(function (s) {
      var sub = (asn.submissions || []).filter(function(x) { return x.studentId === s.id; })[0];
      var status = sub && sub.submitted ? '✅ 제출' : '❌ 미제출';
      var date = (sub && sub.at) ? U.fmtDate(sub.at) : '-';
      html += '<tr><td>' + U.esc(s.name) + '</td><td>' + status + '</td><td>' + date + '</td></tr>';
    });

    html += '</table></div>';
    UI.modal(html);
  }

  function setup() {
    initClasses();

    var form = document.getElementById('asn-form');
    if (form) {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var asn = {
          title: document.getElementById('asn-title').value,
          description: document.getElementById('asn-desc').value,
          classId: document.getElementById('asn-class').value,
          dueDate: document.getElementById('asn-due').value,
          submissions: []
        };

        Store.students({ active: true }).forEach(function (s) {
          if (!asn.classId || (s.classes || []).indexOf(asn.classId) >= 0) {
            asn.submissions.push({ studentId: s.id, submitted: false });
          }
        });

        Store.saveAssignment(asn);
        form.reset();
        renderList();
        UI.toast('과제가 발행되었습니다.');
      });
    }

    renderList();
  }

  return { title: title, render: render, setup: setup };
})();
