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

async function notionQuery(env, databaseId, filters = null, sorts = null) {
  const notionApiKey = env.NOTION_API_KEY;
  if (!notionApiKey) throw new Error('NOTION_API_KEY not set');

  const body = { page_size: 100 };
  if (filters) body.filter = filters;
  if (sorts) body.sorts = sorts;

  const response = await fetch(NOTION_API_URL + '/databases/' + databaseId + '/query', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + notionApiKey,
      'Notion-Version': '2024-04-02',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) throw new Error('Notion API error');
  return response.json();
}

async function getStudents(env) {
  try {
    const data = await notionQuery(env, DATABASES.students);
    return {
      success: true,
      data: data.results.map(page => ({
        id: page.id,
        name: page.properties.이름?.title[0]?.plain_text || '',
        grade: page.properties.학년?.rich_text[0]?.plain_text || '',
        status: page.properties.상태?.select?.name || '',
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
        student: page.properties.학생명?.rich_text[0]?.plain_text || '',
        status: page.properties.상태?.select?.name || '',
      })),
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function getCalendarEvents(env) {
  try {
    const data = await notionQuery(env, DATABASES.calendar, null, [
      { property: '날짜', direction: 'ascending' }
    ]);
    return {
      success: true,
      data: data.results.map(page => ({
        id: page.id,
        date: page.properties.날짜?.date?.start || '',
        title: page.properties.제목?.title[0]?.plain_text || '',
      })),
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

const dashboardHTML = '<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>고래영어 대시보드</title><style>*{margin:0;padding:0;box-sizing:border-box}html{color-scheme:light dark}body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#f8fafc;color:#1e293b;line-height:1.6}@media(prefers-color-scheme:dark){body{background:#0f172a;color:#e2e8f0}}.container{max-width:1200px;margin:0 auto;padding:16px}header{background:white;border-bottom:1px solid #e2e8f0;padding:16px 0;position:sticky;top:0;z-index:10}@media(prefers-color-scheme:dark){header{background:#1e293b;border-color:#334155}}.header-content{max-width:1200px;margin:0 auto;padding:0 16px}.logo{font-size:28px}.header-title{font-size:20px;font-weight:600;margin-top:8px}.header-date{font-size:13px;color:#64748b}@media(prefers-color-scheme:dark){.header-date{color:#94a3b8}}.tabs{display:flex;gap:8px;border-bottom:1px solid #e2e8f0;margin:20px 0;overflow-x:auto}@media(prefers-color-scheme:dark){.tabs{border-color:#334155}}.tab-btn{padding:12px 16px;border:none;background:transparent;cursor:pointer;font-size:14px;font-weight:500;color:#64748b;border-bottom:2px solid transparent;transition:all 0.2s;white-space:nowrap}@media(prefers-color-scheme:dark){.tab-btn{color:#94a3b8}}.tab-btn.active{color:#2563eb;border-bottom-color:#2563eb}.tab-btn:hover{color:#475569}.tab-content{display:none}.tab-content.active{display:block}.card{background:white;border-radius:12px;padding:20px;margin-bottom:16px;border:1px solid #e2e8f0}@media(prefers-color-scheme:dark){.card{background:#1e293b;border-color:#334155}}.card-title{font-size:16px;font-weight:600;margin-bottom:16px}.stats-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:16px}.stat-box{padding:16px;background:#f8fafc;border-radius:8px}@media(prefers-color-scheme:dark){.stat-box{background:#334155}}.stat-label{font-size:12px;color:#64748b;margin-bottom:8px}@media(prefers-color-scheme:dark){.stat-label{color:#94a3b8}}.stat-value{font-size:24px;font-weight:700;color:#2563eb}.student-list{display:grid;gap:12px}.student-item{padding:12px;background:#f8fafc;border-radius:8px;border-left:4px solid #2563eb;display:flex;justify-content:space-between;align-items:center}@media(prefers-color-scheme:dark){.student-item{background:#334155}}.student-name{font-weight:600}.student-info{font-size:12px;color:#64748b;margin-top:4px}@media(prefers-color-scheme:dark){.student-info{color:#94a3b8}}.badge{padding:4px 8px;background:#dbeafe;color:#1e40af;border-radius:4px;font-size:12px;font-weight:600}@media(prefers-color-scheme:dark){.badge{background:#1e3a8a;color:#93c5fd}}.attendance-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:12px}.attendance-item{padding:16px;background:#f8fafc;border-radius:8px;text-align:center}@media(prefers-color-scheme:dark){.attendance-item{background:#334155}}.attendance-status{font-size:28px;margin:8px 0}.attendance-name{font-size:12px;color:#64748b}@media(prefers-color-scheme:dark){.attendance-name{color:#94a3b8}}.calendar{display:grid;grid-template-columns:repeat(7,1fr);gap:8px;margin-bottom:16px}.calendar-day{padding:12px;background:#f8fafc;border-radius:8px;text-align:center;font-size:12px;aspect-ratio:1;display:flex;flex-direction:column;justify-content:center;align-items:center}@media(prefers-color-scheme:dark){.calendar-day{background:#334155}}.calendar-day.today{background:#2563eb;color:white;font-weight:600}.calendar-day.event{background:#fef08a;color:#713f12}@media(prefers-color-scheme:dark){.calendar-day.event{background:#854d0e;color:#fef08a}}.loading{text-align:center;padding:40px 20px;color:#64748b}.spinner{display:inline-block;width:24px;height:24px;border:3px solid #e2e8f0;border-top-color:#2563eb;border-radius:50%;animation:spin 0.8s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}.error{padding:16px;background:#fee2e2;color:#991b1b;border-radius:8px;margin-bottom:16px}@media(prefers-color-scheme:dark){.error{background:#7f1d1d;color:#fca5a5}}</style></head><body><header><div class="container"><div class="logo">🐋</div><div class="header-title">고래영어 대시보드</div><div class="header-date" id="today-date"></div></div></header><div class="container"><div class="tabs"><button class="tab-btn active" data-tab="dashboard">대시보드</button><button class="tab-btn" data-tab="students">학생 목록</button><button class="tab-btn" data-tab="attendance">출석 현황</button><button class="tab-btn" data-tab="calendar">월간 캘린더</button></div><div id="dashboard" class="tab-content active"><div class="stats-grid"><div class="stat-box"><div class="stat-label">등록된 학생</div><div class="stat-value" id="stat-students">-</div></div><div class="stat-box"><div class="stat-label">오늘 출석</div><div class="stat-value" id="stat-attendance">-</div></div><div class="stat-box"><div class="stat-label">이번 달 행사</div><div class="stat-value" id="stat-events">-</div></div></div><div class="card"><div class="card-title">👥 최근 학생</div><div id="recent-students" class="loading"><div class="spinner"></div></div></div></div><div id="students" class="tab-content"><div class="card"><div class="card-title">📚 학생 목록</div><div id="students-list" class="student-list loading"><div class="spinner"></div></div></div></div><div id="attendance" class="tab-content"><div class="card"><div class="card-title">✓ 오늘 출석 현황</div><div id="attendance-list" class="attendance-grid loading"><div class="spinner"></div></div></div></div><div id="calendar" class="tab-content"><div class="card"><div class="card-title" id="calendar-title">📅 캘린더</div><div id="calendar-grid" class="calendar loading"><div class="spinner"></div></div></div></div></div><script>const API_URL=new URL(location).origin;function updateDate(){const today=new Date();const options={weekday:"long",year:"numeric",month:"long",day:"numeric"};document.getElementById("today-date").textContent=today.toLocaleDateString("ko-KR",options)}async function fetchAPI(endpoint){try{const response=await fetch(API_URL+"/api"+endpoint);if(!response.ok)throw new Error("API error");return await response.json()}catch(error){console.error(error);return null}}async function loadStudents(){const result=await fetchAPI("/students");const container=document.getElementById("students-list");if(!result||!result.success){container.innerHTML=\'<div class="error">데이터를 불러올 수 없습니다</div>\';return}const students=result.data||[];document.getElementById("stat-students").textContent=students.length;container.innerHTML=students.map(student=>"<div class=\"student-item\"><div><div class=\"student-name\">"+student.name+"</div><div class=\"student-info\">"+student.grade+" · "+student.status+"</div></div><span class=\"badge\">"+student.status+"</span></div>").join("");const recent=students.slice(0,3);document.getElementById("recent-students").innerHTML=recent.map(s=>"<div class=\"student-item\"><div><div class=\"student-name\">"+s.name+"</div><div class=\"student-info\">"+s.grade+"</div></div></div>").join("")}async function loadAttendance(){const result=await fetchAPI("/attendance/today");const container=document.getElementById("attendance-list");if(!result||!result.success){container.innerHTML=\'<div class="error">출석 데이터를 불러올 수 없습니다</div>\';return}const attendance=result.data||[];document.getElementById("stat-attendance").textContent=attendance.filter(a=>a.status==="출석").length;if(attendance.length===0){container.innerHTML=\'<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: #64748b;">오늘 출석 기록이 없습니다</div>\';return}container.innerHTML=attendance.map(record=>{const statusEmoji=record.status==="출석"?"✓":"✗";return"<div class=\"attendance-item\"><div class=\"attendance-status\">"+statusEmoji+"</div><div class=\"attendance-name\">"+record.student+"</div></div>"}).join("")}async function loadCalendar(){const result=await fetchAPI("/calendar");const container=document.getElementById("calendar-grid");if(!result||!result.success){container.innerHTML=\'<div class="error" style="grid-column: 1/-1;">캘린더 데이터를 불러올 수 없습니다</div>\';return}const events=result.data||[];const today=new Date();const currentMonth=today.getMonth();const currentYear=today.getFullYear();const firstDay=new Date(currentYear,currentMonth,1);const lastDay=new Date(currentYear,currentMonth+1,0);const daysInMonth=lastDay.getDate();const startingDayOfWeek=firstDay.getDay();document.getElementById("calendar-title").textContent="📅 "+currentYear+"년 "+(currentMonth+1)+"월";let html="";for(let i=0;i<startingDayOfWeek;i++){html+="<div class=\"calendar-day\" style=\"background: transparent; border: none;\"></div>"}for(let day=1;day<=daysInMonth;day++){const date=new Date(currentYear,currentMonth,day);const dateStr=date.toISOString().split("T")[0];const isToday=date.getDate()===today.getDate()&&date.getMonth()===today.getMonth()&&date.getFullYear()===today.getFullYear();const hasEvent=events.some(e=>e.date===dateStr||e.date.startsWith(dateStr));const className=isToday?"today":hasEvent?"event":"";html+="<div class=\"calendar-day "+className+"\">"+day+"</div>"}container.innerHTML=html;document.getElementById("stat-events").textContent=events.length}document.querySelectorAll(".tab-btn").forEach(btn=>{btn.addEventListener("click",()=>{document.querySelectorAll(".tab-btn").forEach(b=>b.classList.remove("active"));document.querySelectorAll(".tab-content").forEach(c=>c.classList.remove("active"));btn.classList.add("active");const tabId=btn.dataset.tab;document.getElementById(tabId).classList.add("active");if(tabId==="attendance")loadAttendance()})});updateDate();loadStudents();loadAttendance();loadCalendar();setInterval(()=>{loadStudents();loadAttendance();loadCalendar()},5*60*1000)</script></body></html>';

async function handleRequest(request, env) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(request.url);
  const path = url.pathname;

  try {
    if (path === '/' || path === '/dashboard') {
      return new Response(dashboardHTML, {
        status: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    } else if (path === '/api/students') {
      const response = await getStudents(env);
      return new Response(JSON.stringify(response), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } else if (path === '/api/attendance/today') {
      const response = await getTodayAttendance(env);
      return new Response(JSON.stringify(response), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } else if (path === '/api/calendar') {
      const response = await getCalendarEvents(env);
      return new Response(JSON.stringify(response), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } else if (path === '/api/health') {
      return new Response(JSON.stringify({ status: 'ok' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Not found' }), {
      status: 404,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}

export default {
  fetch: handleRequest,
};
