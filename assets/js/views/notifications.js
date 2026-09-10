/* ===== 알림톡 연동 설정 ===== */
window.Views = window.Views || {};
Views.notifications = (function () {

  function title() { return '알림 설정'; }

  function render() {
    var html = '<div class="page-section">';
    html += '<div class="section-header"><h2>알림톡 연동</h2></div>';

    html += '<div class="alert alert-info">';
    html += '<strong>📌 주의:</strong> 백엔드 서버와 PG 연동이 필요합니다. 아래 단계별 안내를 따라 진행하세요.';
    html += '</div>';

    html += '<div class="form-group" style="background:#f9f9f9;padding:15px;border-radius:4px;margin:20px 0;">';
    html += '<h3 style="margin-top:0;">1단계: 카카오 비즈니스 가입 및 설정</h3>';
    html += '<ol>';
    html += '<li><a href="https://business.kakao.com/" target="_blank">카카오 비즈센터</a> 접속</li>';
    html += '<li>알림톡 또는 친구톡 활성화</li>';
    html += '<li>메시지 템플릿 등록 및 승인 대기</li>';
    html += '<li>API 키(REST API Key) 발급받기</li>';
    html += '</ol>';
    html += '</div>';

    html += '<div class="form-group">';
    html += '<h3>2단계: API 키 설정</h3>';
    html += '<form id="notify-form">';
    html += '<label>카카오 REST API Key</label>';
    html += '<input type="password" id="notify-kakao-key" placeholder="app_1a2b3c4d5e... " class="form-control">';
    html += '<small style="color:#666;">비즈메시지 또는 친구톡 REST API Key</small>';

    html += '<label style="margin-top:15px;">카카오 API 엔드포인트</label>';
    html += '<input type="url" id="notify-kakao-url" placeholder="https://kapi.kakao.com/v2/..." value="https://kapi.kakao.com/v2/api/kakao_talk_bisagent/messages/send" class="form-control">';

    html += '<div style="margin-top:15px;"><label><input type="checkbox" id="notify-auto-attendance"> 출결 체크 시 자동 알림톡 발송</label></div>';
    html += '<div style="margin-top:10px;"><label><input type="checkbox" id="notify-auto-payment"> 청구서 생성 시 자동 알림톡 발송</label></div>';
    html += '<div style="margin-top:10px;"><label><input type="checkbox" id="notify-auto-grade"> 성적표 발송 시 자동 알림톡 발송</label></div>';

    html += '<button type="submit" class="btn-primary" style="margin-top:20px;">설정 저장</button>';
    html += '</form>';
    html += '</div>';

    html += '<div class="form-group" style="background:#f9f9f9;padding:15px;border-radius:4px;margin:20px 0;">';
    html += '<h3 style="margin-top:0;">3단계: 백엔드 서버 구축</h3>';
    html += '<p>Node.js 또는 Python 백엔드에서 다음 API를 구현합니다:</p>';
    html += '<pre style="background:#fff;padding:10px;border-radius:4px;border:1px solid #ddd;overflow-x:auto;"><code>POST /api/notify/attendance
POST /api/notify/payment
POST /api/notify/grade</code></pre>';
    html += '<p>각 엔드포인트는:</p>';
    html += '<ul>';
    html += '<li>학부모 전화번호 확인</li>';
    html += '<li>카카오 API로 알림톡/친구톡 발송</li>';
    html += '<li>발송 이력 기록</li>';
    html += '</ul>';
    html += '</div>';

    html += '<div class="form-group" style="background:#f9f9f9;padding:15px;border-radius:4px;margin:20px 0;">';
    html += '<h3 style="margin-top:0;">4단계: 프론트엔드 연동</h3>';
    html += '<p>출결, 결제, 성적 저장 시 백엔드 API 호출:</p>';
    html += '<pre style="background:#fff;padding:10px;border-radius:4px;border:1px solid #ddd;overflow-x:auto;"><code>fetch(\'/api/notify/attendance\', {
  method: \'POST\',
  headers: { \'Content-Type\': \'application/json\' },
  body: JSON.stringify({
    studentId: \'stu_xxx\',
    studentName: \'김철수\',
    date: \'2025-09-10\',
    status: \'출석\'
  })
}).then(r => r.json()).then(d => console.log(d));</code></pre>';
    html += '</div>';

    html += '<div id="notification-log" class="card-list" style="margin-top:30px;"></div>';

    html += '</div>';
    return html;
  }

  function loadSettings() {
    var set = Store.getNotificationSettings();
    document.getElementById('notify-kakao-key').value = set.kakaoKey || '';
    document.getElementById('notify-kakao-url').value = set.kakaoApiUrl || 'https://kapi.kakao.com/v2/api/kakao_talk_bisagent/messages/send';
    document.getElementById('notify-auto-attendance').checked = set.autoNotifyAttendance || false;
    document.getElementById('notify-auto-payment').checked = set.autoNotifyPayment || false;
    document.getElementById('notify-auto-grade').checked = set.autoNotifyGrade || false;
  }

  function setup() {
    loadSettings();

    var form = document.getElementById('notify-form');
    if (form) {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var set = {
          kakaoKey: document.getElementById('notify-kakao-key').value,
          kakaoApiUrl: document.getElementById('notify-kakao-url').value,
          autoNotifyAttendance: document.getElementById('notify-auto-attendance').checked,
          autoNotifyPayment: document.getElementById('notify-auto-payment').checked,
          autoNotifyGrade: document.getElementById('notify-auto-grade').checked
        };
        Store.saveNotificationSettings(set);
        UI.toast('알림 설정이 저장되었습니다.');
      });
    }
  }

  return { title: title, render: render, setup: setup };
})();
