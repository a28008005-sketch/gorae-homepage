// Notion API를 통해 대시보드 데이터를 제공하는 Workers
// Notion Integration 토큰과 데이터베이스 ID가 필요합니다

// 환경 변수에서 토큰 읽기 (배포 시 Cloudflare Secrets에 설정)
const NOTION_API_URL = 'https://api.notion.com/v1';

// 데이터베이스 ID - 나중에 각 테이블 ID로 바꿔야 함
const DATABASES = {
  students: '학생_테이블_ID', // "고래영어 - 학생"
  attendance: '출석_테이블_ID', // "고래영어 - 출석"
  counseling: '상담_테이블_ID', // "고래영어 - 상담일지"
  payment: '결제_테이블_ID', // "고래영어 - 결제"
  tasks: '과제_테이블_ID', // "고래영어 - 과제"
  patrols: '수업일지_테이블_ID', // "고래영어 - 수업일지"
  notifications: '알림_테이블_ID', // "고래영어 - 알림"
  resources: '자료실_테이블_ID', // "고래영어 - 학원자료실"
  books: '도서대여_테이블_ID', // "고래영어 - 도서대여"
  memos: '메모_테이블_ID', // "고래영어 - 업무메모"
  calendar: '캘린더_테이블_ID', // "고래영어 - 캘린더"
};

// CORS 헤더
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// Notion API 호출 기본 함수
async function notionQuery(env, databaseId, filters = null, sorts = null) {
  const notionApiKey = env.NOTION_API_KEY;
  if (!notionApiKey) {
    throw new Error('NOTION_API_KEY 환경 변수가 설정되지 않았습니다');
  }

  const body = {
    page_size: 100,
  };

  if (filters) body.filter = filters;
  if (sorts) body.sorts = sorts;

  const response = await fetch(`${NOTION_API_URL}/databases/${databaseId}/query`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${notionApiKey}`,
      'Notion-Version': '2024-04-02',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`Notion API error: ${response.status}`);
  }

  return response.json();
}

// 학생 목록 조회
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
        seat: page.properties.좌석?.rich_text[0]?.plain_text || '',
        days: page.properties.수업요일?.multi_select?.map(d => d.name) || [],
        time: page.properties.수업시간?.select?.name || '',
      })),
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// 오늘 출석 조회
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
        flags: page.properties.플래그?.multi_select?.map(f => f.name) || [],
      })),
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// 캘린더 이벤트 조회
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
        type: page.properties.종류?.select?.name || '',
        completed: page.properties.완료?.checkbox || false,
      })),
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// 라우터
async function handleRequest(request, env) {
  // CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(request.url);
  const path = url.pathname;

  try {
    let response;

    if (path === '/api/students') {
      response = await getStudents(env);
    } else if (path === '/api/attendance/today') {
      response = await getTodayAttendance(env);
    } else if (path === '/api/calendar') {
      response = await getCalendarEvents(env);
    } else if (path === '/api/health') {
      response = { status: 'ok', message: 'Notion API Worker is running' };
    } else {
      response = { error: 'Not found', path };
      return new Response(JSON.stringify(response), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify(response), {
      status: 200,
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
