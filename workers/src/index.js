const NOTION_API_URL = 'https://api.notion.com/v1';

const DATABASES = {
  students: '3bc7e934731849f893208973a5ea9650',
  attendance: '07a67769a5504e10a61736c3de6f436e',
  counseling: 'e968535167dd492b90f63d335a123d47',
  payment: 'fb5eb6a5171a429c84a02ec0a60aa268',
  tasks: 'e511f5492e25485da9da30f8b411a224',
  patrols: 'f8c08fb1005c47c9a728fb088039ca7f',
  notifications: '4cefa2a2adb94923ad722bbbe21c2461',
  resources: '65deb8ef95a94b2f8439bda34d7a0b77',
  books: 'fef622ad46444043acadb99fae0f8cd4',
  memos: '53c66a36431c45c69fdc12950f88c734',
  calendar: 'a6650ba193bb4332b1747c5bdb0ac4d6',
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// 노션 속성은 종류(제목/텍스트/선택/날짜…)마다 값의 모양이 달라서, 종류를 보고 읽는다.
function textOf(prop) {
  if (!prop) return '';
  switch (prop.type) {
    case 'title': return prop.title?.[0]?.plain_text || '';
    case 'rich_text': return prop.rich_text?.[0]?.plain_text || '';
    case 'select': return prop.select?.name || '';
    case 'multi_select': return (prop.multi_select || []).map(o => o.name).join(', ');
    case 'number': return prop.number === null || prop.number === undefined ? '' : String(prop.number);
    case 'date': return prop.date?.start || '';
    case 'checkbox': return prop.checkbox ? 'Y' : 'N';
    case 'phone_number': return prop.phone_number || '';
    case 'email': return prop.email || '';
    default: return '';
  }
}

async function notionQuery(env, databaseId, filters = null, sorts = null) {
  const notionApiKey = env.NOTION_API_KEY;
  if (!notionApiKey) throw new Error('NOTION_API_KEY 시크릿이 등록되지 않았습니다');

  const body = { page_size: 100 };
  if (filters) body.filter = filters;
  if (sorts) body.sorts = sorts;

  const response = await fetch(NOTION_API_URL + '/databases/' + databaseId + '/query', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + notionApiKey,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error('노션 응답 ' + response.status + ': ' + detail.slice(0, 300));
  }
  return response.json();
}

async function getStudents(env) {
  try {
    const data = await notionQuery(env, DATABASES.students);
    return {
      success: true,
      data: data.results.map(page => ({
        id: page.id,
        name: textOf(page.properties['이름']),
        grade: textOf(page.properties['학년']),
        status: textOf(page.properties['상태']),
      })),
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function getTodayAttendance(env) {
  try {
    const today = new Date().toISOString().split('T')[0];
    const data = await notionQuery(env, DATABASES.attendance, {
      property: '날짜',
      date: { equals: today },
    });
    return {
      success: true,
      data: data.results.map(page => ({
        id: page.id,
        student: textOf(page.properties['학생명']),
        status: textOf(page.properties['상태']),
      })),
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function getCalendarEvents(env) {
  try {
    const data = await notionQuery(env, DATABASES.calendar, null, [
      { property: '날짜', direction: 'ascending' },
    ]);
    return {
      success: true,
      data: data.results.map(page => ({
        id: page.id,
        date: textOf(page.properties['날짜']),
        title: textOf(page.properties['제목']),
        kind: textOf(page.properties['종류']),
      })),
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// 아래 문자열 안에서는 역따옴표와 ${ 를 절대 쓰지 않는다. 바깥이 템플릿 문자열이라 깨진다.
const dashboardHTML = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="theme-color" content="#2563eb">
<title>고래영어 대시보드</title>
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🐋</text></svg>">
<style>
*{margin:0;padding:0;box-sizing:border-box}
html{color-scheme:light dark}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif;background:#f8fafc;color:#1e293b;line-height:1.6;word-break:keep-all}
@media(prefers-color-scheme:dark){body{background:#0f172a;color:#e2e8f0}}
.container{max-width:1200px;margin:0 auto;padding:16px}
header{background:#fff;border-bottom:1px solid #e2e8f0;padding:16px 0}
@media(prefers-color-scheme:dark){header{background:#1e293b;border-color:#334155}}
.logo{font-size:28px}
.header-title{font-size:20px;font-weight:600;margin-top:4px}
.header-date{font-size:13px;color:#64748b}
@media(prefers-color-scheme:dark){.header-date{color:#94a3b8}}
.tabs{display:flex;gap:8px;border-bottom:1px solid #e2e8f0;margin:20px 0;overflow-x:auto}
@media(prefers-color-scheme:dark){.tabs{border-color:#334155}}
.tab-btn{padding:12px 16px;border:none;background:transparent;cursor:pointer;font-size:14px;font-weight:500;color:#64748b;border-bottom:2px solid transparent;white-space:nowrap}
@media(prefers-color-scheme:dark){.tab-btn{color:#94a3b8}}
.tab-btn.active{color:#2563eb;border-bottom-color:#2563eb}
.tab-content{display:none}
.tab-content.active{display:block}
.card{background:#fff;border-radius:12px;padding:20px;margin-bottom:16px;border:1px solid #e2e8f0}
@media(prefers-color-scheme:dark){.card{background:#1e293b;border-color:#334155}}
.card-title{font-size:16px;font-weight:600;margin-bottom:16px}
.stats-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:16px}
.stat-box{padding:16px;background:#fff;border:1px solid #e2e8f0;border-radius:12px}
@media(prefers-color-scheme:dark){.stat-box{background:#1e293b;border-color:#334155}}
.stat-label{font-size:12px;color:#64748b;margin-bottom:4px}
@media(prefers-color-scheme:dark){.stat-label{color:#94a3b8}}
.stat-value{font-size:28px;font-weight:700;color:#2563eb}
.student-list{display:grid;gap:10px}
.student-item{padding:12px;background:#f8fafc;border-radius:8px;border-left:4px solid #2563eb;display:flex;justify-content:space-between;align-items:center;gap:12px}
@media(prefers-color-scheme:dark){.student-item{background:#334155}}
.student-name{font-weight:600}
.student-info{font-size:12px;color:#64748b;margin-top:2px}
@media(prefers-color-scheme:dark){.student-info{color:#94a3b8}}
.badge{padding:4px 8px;background:#dbeafe;color:#1e40af;border-radius:4px;font-size:12px;font-weight:600;white-space:nowrap}
@media(prefers-color-scheme:dark){.badge{background:#1e3a8a;color:#93c5fd}}
.attendance-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:12px}
.attendance-item{padding:16px;background:#f8fafc;border-radius:8px;text-align:center}
@media(prefers-color-scheme:dark){.attendance-item{background:#334155}}
.attendance-status{font-size:28px}
.attendance-name{font-size:12px;color:#64748b}
@media(prefers-color-scheme:dark){.attendance-name{color:#94a3b8}}
.weekdays{display:grid;grid-template-columns:repeat(7,1fr);gap:8px;margin-bottom:8px}
.weekday{text-align:center;font-size:12px;color:#64748b;font-weight:600}
.calendar{display:grid;grid-template-columns:repeat(7,1fr);gap:8px}
.calendar-day{padding:8px;background:#f8fafc;border-radius:8px;text-align:center;font-size:13px;aspect-ratio:1;display:flex;justify-content:center;align-items:center}
@media(prefers-color-scheme:dark){.calendar-day{background:#334155}}
.calendar-day.blank{background:transparent}
.calendar-day.today{background:#2563eb;color:#fff;font-weight:700}
.calendar-day.event{background:#fef08a;color:#713f12;font-weight:600}
@media(prefers-color-scheme:dark){.calendar-day.event{background:#854d0e;color:#fef08a}}
.event-list{margin-top:16px;display:grid;gap:8px}
.event-row{display:flex;gap:10px;font-size:13px;padding:8px 12px;background:#f8fafc;border-radius:8px}
@media(prefers-color-scheme:dark){.event-row{background:#334155}}
.event-date{color:#2563eb;font-weight:600;white-space:nowrap}
.muted{text-align:center;padding:32px 16px;color:#64748b;font-size:14px}
.error{padding:14px 16px;background:#fee2e2;color:#991b1b;border-radius:8px;font-size:13px;line-height:1.5}
@media(prefers-color-scheme:dark){.error{background:#7f1d1d;color:#fca5a5}}
</style>
</head>
<body>
<header><div class="container">
<div class="logo">🐋</div>
<div class="header-title">고래영어 대시보드</div>
<div class="header-date" id="today-date"></div>
</div></header>

<div class="container">
<div class="tabs">
<button class="tab-btn active" data-tab="dashboard">대시보드</button>
<button class="tab-btn" data-tab="students">학생 목록</button>
<button class="tab-btn" data-tab="attendance">출석 현황</button>
<button class="tab-btn" data-tab="calendar">월간 캘린더</button>
</div>

<div id="dashboard" class="tab-content active">
<div class="stats-grid">
<div class="stat-box"><div class="stat-label">등록된 학생</div><div class="stat-value" id="stat-students">-</div></div>
<div class="stat-box"><div class="stat-label">오늘 출석</div><div class="stat-value" id="stat-attendance">-</div></div>
<div class="stat-box"><div class="stat-label">이번 달 행사</div><div class="stat-value" id="stat-events">-</div></div>
</div>
<div class="card"><div class="card-title">👥 최근 학생</div><div id="recent-students" class="student-list"><div class="muted">불러오는 중…</div></div></div>
</div>

<div id="students" class="tab-content">
<div class="card"><div class="card-title">📚 학생 목록</div><div id="students-list" class="student-list"><div class="muted">불러오는 중…</div></div></div>
</div>

<div id="attendance" class="tab-content">
<div class="card"><div class="card-title">✓ 오늘 출석 현황</div><div id="attendance-list" class="attendance-grid"><div class="muted">불러오는 중…</div></div></div>
</div>

<div id="calendar" class="tab-content">
<div class="card">
<div class="card-title" id="calendar-title">📅 캘린더</div>
<div class="weekdays"><div class="weekday">일</div><div class="weekday">월</div><div class="weekday">화</div><div class="weekday">수</div><div class="weekday">목</div><div class="weekday">금</div><div class="weekday">토</div></div>
<div id="calendar-grid" class="calendar"></div>
<div id="event-list" class="event-list"></div>
</div>
</div>
</div>

<script>
function esc(s) {
  return String(s == null ? '' : s)
    .split('&').join('&amp;')
    .split('<').join('&lt;')
    .split('>').join('&gt;')
    .split('"').join('&quot;');
}

function showError(el, message) {
  el.innerHTML = '<div class="error"><b>불러오지 못했습니다</b><br>' + esc(message) + '</div>';
}

function updateDate() {
  var today = new Date();
  document.getElementById('today-date').textContent =
    today.toLocaleDateString('ko-KR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

async function fetchAPI(endpoint) {
  try {
    var response = await fetch('/api' + endpoint);
    return await response.json();
  } catch (error) {
    return { success: false, error: '서버에 연결하지 못했습니다 (' + error.message + ')' };
  }
}

async function loadStudents() {
  var listEl = document.getElementById('students-list');
  var recentEl = document.getElementById('recent-students');
  var result = await fetchAPI('/students');

  if (!result || !result.success) {
    var message = (result && result.error) || '알 수 없는 오류';
    showError(listEl, message);
    showError(recentEl, message);
    return;
  }

  var students = result.data || [];
  document.getElementById('stat-students').textContent = students.length;

  if (students.length === 0) {
    listEl.innerHTML = '<div class="muted">등록된 학생이 없습니다</div>';
    recentEl.innerHTML = '<div class="muted">등록된 학생이 없습니다</div>';
    return;
  }

  function row(s) {
    return '<div class="student-item"><div>' +
      '<div class="student-name">' + esc(s.name) + '</div>' +
      '<div class="student-info">' + esc([s.grade, s.status].filter(Boolean).join(' · ')) + '</div>' +
      '</div><span class="badge">' + esc(s.status || '-') + '</span></div>';
  }

  listEl.innerHTML = students.map(row).join('');
  recentEl.innerHTML = students.slice(0, 5).map(row).join('');
}

async function loadAttendance() {
  var el = document.getElementById('attendance-list');
  var result = await fetchAPI('/attendance/today');

  if (!result || !result.success) {
    showError(el, (result && result.error) || '알 수 없는 오류');
    return;
  }

  var records = result.data || [];
  document.getElementById('stat-attendance').textContent =
    records.filter(function (a) { return a.status === '출석'; }).length;

  if (records.length === 0) {
    el.innerHTML = '<div class="muted" style="grid-column:1/-1">오늘 출석 기록이 없습니다</div>';
    return;
  }

  el.innerHTML = records.map(function (r) {
    var mark = r.status === '출석' ? '✓' : '✗';
    return '<div class="attendance-item"><div class="attendance-status">' + mark + '</div>' +
      '<div class="attendance-name">' + esc(r.student) + '</div></div>';
  }).join('');
}

async function loadCalendar() {
  var grid = document.getElementById('calendar-grid');
  var listEl = document.getElementById('event-list');
  var result = await fetchAPI('/calendar');

  if (!result || !result.success) {
    showError(listEl, (result && result.error) || '알 수 없는 오류');
    return;
  }

  var events = result.data || [];
  var today = new Date();
  var year = today.getFullYear();
  var month = today.getMonth();

  document.getElementById('calendar-title').textContent = '📅 ' + year + '년 ' + (month + 1) + '월';

  var daysInMonth = new Date(year, month + 1, 0).getDate();
  var firstWeekday = new Date(year, month, 1).getDay();

  function localDate(y, m, d) {
    return y + '-' + String(m + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
  }

  var thisMonth = events.filter(function (e) {
    return e.date && e.date.slice(0, 7) === year + '-' + String(month + 1).padStart(2, '0');
  });
  document.getElementById('stat-events').textContent = thisMonth.length;

  var cells = [];
  for (var i = 0; i < firstWeekday; i++) {
    cells.push('<div class="calendar-day blank"></div>');
  }
  for (var day = 1; day <= daysInMonth; day++) {
    var key = localDate(year, month, day);
    var isToday = key === localDate(today.getFullYear(), today.getMonth(), today.getDate());
    var hasEvent = events.some(function (e) { return e.date && e.date.slice(0, 10) === key; });
    var cls = isToday ? ' today' : (hasEvent ? ' event' : '');
    cells.push('<div class="calendar-day' + cls + '">' + day + '</div>');
  }
  grid.innerHTML = cells.join('');

  listEl.innerHTML = thisMonth.length === 0
    ? '<div class="muted">이번 달 일정이 없습니다</div>'
    : thisMonth.map(function (e) {
        return '<div class="event-row"><span class="event-date">' + esc(e.date.slice(5, 10)) + '</span>' +
          '<span>' + esc(e.title) + (e.kind ? ' (' + esc(e.kind) + ')' : '') + '</span></div>';
      }).join('');
}

document.querySelectorAll('.tab-btn').forEach(function (btn) {
  btn.addEventListener('click', function () {
    document.querySelectorAll('.tab-btn').forEach(function (b) { b.classList.remove('active'); });
    document.querySelectorAll('.tab-content').forEach(function (c) { c.classList.remove('active'); });
    btn.classList.add('active');
    document.getElementById(btn.dataset.tab).classList.add('active');
  });
});

function loadAll() {
  loadStudents();
  loadAttendance();
  loadCalendar();
}

updateDate();
loadAll();
setInterval(loadAll, 5 * 60 * 1000);
</script>
</body>
</html>`;

async function handleRequest(request, env) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const path = new URL(request.url).pathname;

  const json = (body, status = 200) => new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' },
  });

  try {
    if (path === '/' || path === '/dashboard') {
      return new Response(dashboardHTML, {
        status: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    }
    if (path === '/api/students') return json(await getStudents(env));
    if (path === '/api/attendance/today') return json(await getTodayAttendance(env));
    if (path === '/api/calendar') return json(await getCalendarEvents(env));
    if (path === '/api/health') {
      return json({ status: 'ok', hasNotionKey: Boolean(env.NOTION_API_KEY) });
    }
    return json({ error: 'Not found', path }, 404);
  } catch (error) {
    return json({ error: error.message }, 500);
  }
}

export default {
  fetch: handleRequest,
};
