/* ===== 상담 일지 ===== */
window.Views = window.Views || {};
Views.counseling = (function () {

  function title() { return '상담 일지'; }

  function render() {
    var html = '<div class="page-section">';
    html += '<div class="section-header"><h2>상담 기록</h2></div>';
    html += '<form id="cnt-form" class="form-group">';
    html += '<div class="form-row">';
    html += '<select id="cnt-student" required><option>학생 선택</option></select>';
    html += '<input type="date" id="cnt-date" required>';
    html += '</div>';
    html += '<textarea id="cnt-content" placeholder="상담 내용" rows="4" required></textarea>';
    html += '<textarea id="cnt-feedback" placeholder="피드백 (학부모 공유용)" rows="3"></textarea>';
    html += '<label><input type="checkbox" id="cnt-share"> 학부모에게 공유</label>';
    html += '<button type="submit" class="btn-primary">상담 기록 저장</button>';
    html += '</form>';

    html += '<div class="section-header" style="margin-top: 30px;"><h2>상담 기록 조회</h2></div>';
    html += '<div class="form-row">';
    html += '<select id="cnt-filter"><option value="">전체</option></select>';
    html += '</div>';
    html += '<div id="cnt-list" class="card-list"></div>';
    html += '</div>';

    return html;
  }

  function initStudentSelect() {
    var sel = document.getElementById('cnt-student');
    if (!sel) return;
    Store.students({ active: true }).forEach(function (s) {
      var opt = document.createElement('option');
      opt.value = s.id;
      opt.textContent = s.name + ' (' + (s.grade || '미정') + ')';
      sel.appendChild(opt);
    });

    var filterSel = document.getElementById('cnt-filter');
    if (filterSel) {
      Store.students({ active: true }).forEach(function (s) {
        var opt = document.createElement('option');
        opt.value = s.id;
        opt.textContent = s.name;
        filterSel.appendChild(opt);
      });
    }
  }

  function renderList(studentId) {
    var list = studentId ? Store.counselings({ studentId: studentId }) : Store.counselings();
    var div = document.getElementById('cnt-list');
    if (!div) return;

    div.innerHTML = '';
    if (list.length === 0) {
      div.innerHTML = '<p class="empty-state">상담 기록이 없습니다.</p>';
      return;
    }

    list.forEach(function (cnt) {
      var s = Store.student(cnt.studentId);
      var card = document.createElement('div');
      card.className = 'card';
      card.innerHTML = '<div class="card-header">' +
        '<h3>' + U.esc(s ? s.name : '(삭제된 학생)') + '</h3>' +
        '<small>' + U.fmtDate(cnt.date) + '</small>' +
        '</div>' +
        '<p><strong>상담내용:</strong> ' + U.esc(cnt.content || '').substring(0, 100) + '...</p>' +
        (cnt.feedback ? '<p><strong>피드백:</strong> ' + U.esc(cnt.feedback).substring(0, 100) + '...</p>' : '') +
        (cnt.shared ? '<p>✓ 학부모에게 공유됨</p>' : '') +
        '<div class="card-actions">' +
        '<button class="btn-small view-cnt" data-id="' + cnt.id + '">보기</button>' +
        '<button class="btn-small edit-cnt" data-id="' + cnt.id + '">수정</button>' +
        '<button class="btn-small btn-danger delete-cnt" data-id="' + cnt.id + '">삭제</button>' +
        '</div>';
      div.appendChild(card);
    });

    document.querySelectorAll('.delete-cnt').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (confirm('상담 기록을 삭제하시겠습니까?')) {
          Store.deleteCounseling(this.dataset.id);
          renderList(studentId);
        }
      });
    });

    document.querySelectorAll('.view-cnt').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var cnt = Store.counselings().filter(function(c) { return c.id === this.dataset.id; }.bind(this))[0];
        if (cnt) {
          UI.modal('<h3>상담 상세</h3><p><strong>내용:</strong></p><p>' + U.esc(cnt.content).replace(/\n/g, '<br>') +
            '</p><p><strong>피드백:</strong></p><p>' + U.esc(cnt.feedback).replace(/\n/g, '<br>') + '</p>');
        }
      });
    });
  }

  function setup() {
    initStudentSelect();

    var form = document.getElementById('cnt-form');
    if (form) {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var cnt = {
          studentId: document.getElementById('cnt-student').value,
          date: document.getElementById('cnt-date').value,
          content: document.getElementById('cnt-content').value,
          feedback: document.getElementById('cnt-feedback').value,
          shared: document.getElementById('cnt-share').checked
        };
        Store.saveCounseling(cnt);
        form.reset();
        document.getElementById('cnt-filter').value = '';
        renderList();
        UI.toast('상담 기록이 저장되었습니다.');
      });
    }

    var filterSel = document.getElementById('cnt-filter');
    if (filterSel) {
      filterSel.addEventListener('change', function () {
        renderList(this.value);
      });
    }

    renderList();
  }

  return { title: title, render: render, setup: setup };
})();
