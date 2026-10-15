/* 고래영어 성적 연동 — 팝업
 * 화면 확인 → [현재 페이지 데이터 동기화(전송)] → 실제로 보내는 일은 background.js 가 합니다.
 */
'use strict';

var DEFAULTS = { mode: 'app', appUrl: 'https://staff.whalejinju.kr/', apiUrl: '', apiToken: '' };
var GRADE_PAGE = /^https?:\/\/(www\.)?englishwhale\.com\/pt\/grade_list\.php/i;

var $ = function (id) { return document.getElementById(id); };
var tab = null;

function setStatus(text, kind) {
  var el = $('status');
  el.textContent = text;
  el.className = 'box status' + (kind ? ' ' + kind : '');
}

function showLast(r) {
  if (!r) { $('last').textContent = ''; return; }
  var when = r.at ? new Date(r.at).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
  $('last').textContent = '최근 결과' + (when ? ' (' + when + ')' : '') + ' · ' + r.message;
}

/* ---------- 설정 ---------- */
function fillSettings(s) {
  document.querySelectorAll('input[name=mode]').forEach(function (r) { r.checked = r.value === s.mode; });
  $('appUrl').value = s.appUrl || '';
  $('apiUrl').value = s.apiUrl || '';
  $('apiToken').value = s.apiToken || '';
  toggleFields();
}
function currentMode() {
  var on = document.querySelector('input[name=mode]:checked');
  return on ? on.value : 'app';
}
function toggleFields() {
  $('app-fields').hidden = currentMode() !== 'app';
  $('api-fields').hidden = currentMode() !== 'api';
}
document.querySelectorAll('input[name=mode]').forEach(function (r) { r.addEventListener('change', toggleFields); });

$('save').addEventListener('click', function () {
  var s = {
    mode: currentMode(),
    appUrl: $('appUrl').value.trim() || DEFAULTS.appUrl,
    apiUrl: $('apiUrl').value.trim(),
    apiToken: $('apiToken').value.trim()
  };
  var check = s.mode === 'api' ? s.apiUrl : s.appUrl;
  var u;
  try { u = new URL(check); } catch (e) { u = null; }
  if (!u || !/^https?:$/.test(u.protocol)) { $('saved').textContent = '주소가 올바르지 않습니다.'; return; }

  // 다른 주소로 보내려면 크롬의 허락이 필요합니다. 버튼을 누른 바로 그 순간에만 물을 수 있습니다.
  var origin = u.protocol + '//' + u.hostname + '/*';
  chrome.permissions.request({ origins: [origin] }).then(function (granted) {
    if (!granted) { $('saved').textContent = '허락하지 않아 저장하지 않았습니다.'; return; }
    return chrome.storage.sync.set(s).then(function () {
      $('saved').textContent = '저장했습니다.';
      updateButton();
    });
  }).catch(function (e) { $('saved').textContent = '저장 실패: ' + e.message; });
});

/* ---------- 보내기 ---------- */
function updateButton() {
  $('sync').disabled = !tab || !GRADE_PAGE.test(tab.url || '');
}

$('sync').addEventListener('click', function () {
  if (!tab) return;
  $('sync').disabled = true;
  setStatus('표를 읽어 보내는 중…');
  chrome.runtime.sendMessage({ type: 'GORAE_SYNC', tabId: tab.id }).then(function (r) {
    setStatus(r.message, r.ok ? 'ok' : 'bad');
    showLast(r);
  }).catch(function (e) {
    setStatus('보내지 못했습니다: ' + e.message, 'bad');
  }).then(function () { $('sync').disabled = false; });
});

/* ---------- 시작 ---------- */
Promise.all([
  chrome.tabs.query({ active: true, currentWindow: true }),
  chrome.storage.sync.get(DEFAULTS),
  chrome.storage.local.get('lastResult')
]).then(function (got) {
  tab = got[0][0] || null;
  fillSettings(Object.assign({}, DEFAULTS, got[1]));
  showLast(got[2].lastResult);
  updateButton();

  if (!tab || !GRADE_PAGE.test(tab.url || '')) {
    setStatus('본사 성적 목록 화면(englishwhale.com/pt/grade_list.php)을 연 뒤 다시 눌러 주세요.', 'warn');
    return;
  }
  return chrome.runtime.sendMessage({ type: 'GORAE_PREVIEW', tabId: tab.id }).then(function (r) {
    if (r && r.ok) {
      var names = {};
      r.rows.forEach(function (x) { names[x.name] = 1; });
      setStatus('이 페이지에서 성적 ' + r.rows.length + '건 (학생 ' + Object.keys(names).length + '명)을 찾았습니다. ' +
        '여러 쪽이면 쪽마다 한 번씩 보내 주세요.', 'ok');
    } else {
      setStatus((r && r.message) || '표를 찾지 못했습니다.', 'bad');
      $('sync').disabled = true;
    }
  });
}).catch(function (e) { setStatus('오류: ' + e.message, 'bad'); });
