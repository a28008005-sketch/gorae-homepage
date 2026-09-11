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
  // NEWSLETTERS 저장소가 워크시트 PDF를 올리는 표
  newsletters: '3c8dc243c7ea4ebb9956508c1dc61c7c',
  // 보카 앱이 하루치를 끝낼 때마다 스스로 쌓는 표
  voca: '934da1ef11974796af76fca51d6f4af2',
  // 학생별 진도. 기기가 아니라 여기에 있어야 집·학원 어디서 열어도 이어진다.
  vocaProgress: 'b157655521584b14a64158358b440fe7',
};

// 학생·출석·캘린더는 전용 화면을 쓰고, 나머지는 표 내용을 그대로 목록으로 보여준다.
const TABLES = [
  { key: 'newsletters', label: '영자신문', icon: '📰', color: '#93c5fd' },
  { key: 'counseling', label: '상담일지', icon: '💬', color: '#ddd6fe' },
  { key: 'payment', label: '결제', icon: '💳', color: '#fde68a' },
  { key: 'tasks', label: '과제', icon: '📋', color: '#86efac' },
  { key: 'patrols', label: '수업일지', icon: '📓', color: '#bfdbfe' },
  { key: 'notifications', label: '알림', icon: '🔔', color: '#fbcfe8' },
  { key: 'resources', label: '자료실', icon: '📂', color: '#a5f3fc' },
  { key: 'books', label: '도서대여', icon: '📚', color: '#ddd6fe' },
  { key: 'memos', label: '업무메모', icon: '📝', color: '#fed7aa' },
];

// 탭·제목 앞에 붙는 색깔 타일. 보내주신 아이콘 그림과 같은 느낌을 내기 위한 것.
function iconTile(icon, color, cls) {
  return '<span class="' + cls + '" style="background:' + color + '">' + icon + '</span>';
}

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
    case 'url': return prop.url || '';
    case 'status': return prop.status?.name || '';
    case 'people': return (prop.people || []).map(p => p.name).filter(Boolean).join(', ');
    case 'files': return (prop.files || []).map(f => f.name).filter(Boolean).join(', ');
    case 'created_time': return prop.created_time || '';
    case 'last_edited_time': return prop.last_edited_time || '';
    case 'relation': return (prop.relation || []).length ? (prop.relation.length + '건 연결') : '';
    case 'formula': return textOf({ type: prop.formula?.type, ...prop.formula });
    case 'rollup': return textOf({ type: prop.rollup?.type, ...prop.rollup });
    default: return '';
  }
}

// 표마다 칸 구성이 달라서, 노션이 알려주는 대로 읽어 목록으로 만든다.
// 이렇게 해두면 나중에 노션에서 칸을 더해도 코드를 고칠 필요가 없다.
async function getTable(env, key) {
  try {
    const data = await notionQuery(env, DATABASES[key]);

    const rows = data.results.map(page => {
      let heading = '';
      let when = '';
      const fields = [];
      const links = [];

      for (const [label, prop] of Object.entries(page.properties)) {
        if (prop.type === 'title') {
          heading = textOf(prop);
          continue;
        }
        // 첫 날짜는 오른쪽에 따로 보여주므로 아래 목록에서는 뺀다.
        if (prop.type === 'date' && !when) {
          const value = textOf(prop);
          if (value) {
            when = value;
            continue;
          }
        }
        // 첨부 파일과 주소는 눌러서 열 수 있게 한다 (영자신문 워크시트 PDF 등).
        // 노션이 주는 파일 주소는 한 시간쯤 뒤 만료되지만, 탭을 열 때마다 새로 받아온다.
        if (prop.type === 'files') {
          for (const file of prop.files || []) {
            const url = file.file?.url || file.external?.url;
            if (url) links.push({ label, url });
          }
          continue;
        }
        if (prop.type === 'url' && prop.url) {
          links.push({ label, url: prop.url });
          continue;
        }

        const value = textOf(prop);
        if (value) fields.push({ label, value });
      }

      return { id: page.id, heading: heading || '(제목 없음)', when, fields, links };
    });

    // 날짜가 있는 표는 최근 것이 위로 오게 한다.
    rows.sort((a, b) => (b.when || '').localeCompare(a.when || ''));

    return { success: true, data: rows };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function notionApi(env, path, method, body) {
  const notionApiKey = env.NOTION_API_KEY;
  if (!notionApiKey) throw new Error('NOTION_API_KEY 시크릿이 등록되지 않았습니다');

  const response = await fetch(NOTION_API_URL + path, {
    method,
    headers: {
      'Authorization': 'Bearer ' + notionApiKey,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error('노션 응답 ' + response.status + ': ' + detail.slice(0, 300));
  }
  return response.json();
}

async function notionQuery(env, databaseId, filters = null, sorts = null) {
  const body = { page_size: 100 };
  if (filters) body.filter = filters;
  if (sorts) body.sorts = sorts;
  return notionApi(env, '/databases/' + databaseId + '/query', 'POST', body);
}

// 노션은 한 번에 100줄까지만 준다. 한 달 출석은 (학생 수 × 수업일) 그보다 쉽게 넘어서
// 이어받기를 해야 뒷날짜가 통째로 빠지지 않는다.
async function notionQueryAll(env, databaseId, filters = null) {
  const results = [];
  let cursor = null;
  for (let page = 0; page < 20; page++) {
    const body = { page_size: 100 };
    if (filters) body.filter = filters;
    if (cursor) body.start_cursor = cursor;

    const chunk = await notionApi(env, '/databases/' + databaseId + '/query', 'POST', body);
    results.push(...chunk.results);
    if (!chunk.has_more) break;
    cursor = chunk.next_cursor;
  }
  return results;
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
        code: textOf(page.properties['단어장코드']),
      })),
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// 워커는 UTC로 도는데 학원은 한국 시간을 쓴다. 새벽 0~9시에 어제 출석이 뜨지 않도록 서울 기준으로 계산한다.
function seoulToday() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

async function getTodayAttendance(env) {
  try {
    const today = seoulToday();
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

// 달력 칸에 보여줄 이번 달 출결을 날짜별로 센다.
async function getMonthAttendance(env) {
  try {
    const month = seoulToday().slice(0, 7);
    const year = Number(month.slice(0, 4));
    const monthNumber = Number(month.slice(5, 7));
    const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();

    const pages = await notionQueryAll(env, DATABASES.attendance, {
      and: [
        { property: '날짜', date: { on_or_after: month + '-01' } },
        { property: '날짜', date: { on_or_before: month + '-' + String(lastDay).padStart(2, '0') } },
      ],
    });

    const byDate = {};
    for (const page of pages) {
      const date = textOf(page.properties['날짜']).slice(0, 10);
      if (!date) continue;
      if (!byDate[date]) byDate[date] = { present: 0, absent: 0 };

      const status = textOf(page.properties['상태']);
      if (status === '출석') byDate[date].present++;
      else if (status === '결석') byDate[date].absent++;
    }

    return { success: true, month, data: byDate };
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

const ATTENDANCE_STATUSES = ['출석', '결석'];

// 출석을 누르면 그 학생의 오늘 줄을 찾아 고치고, 없으면 새로 만든다.
// 같은 학생을 두 번 눌러도 줄이 두 개 생기지 않게 하기 위함이다.
async function markAttendance(env, student, status) {
  try {
    const name = String(student || '').trim();
    if (!name) return { success: false, error: '학생 이름이 비어 있습니다' };
    if (name.length > 50) return { success: false, error: '학생 이름이 너무 깁니다' };
    if (!ATTENDANCE_STATUSES.includes(status)) {
      return { success: false, error: '출석 또는 결석만 저장할 수 있습니다' };
    }

    const today = seoulToday();
    const existing = await notionQuery(env, DATABASES.attendance, {
      and: [
        { property: '날짜', date: { equals: today } },
        { property: '학생명', title: { equals: name } },
      ],
    });

    const properties = { 상태: { select: { name: status } } };

    if (existing.results.length > 0) {
      await notionApi(env, '/pages/' + existing.results[0].id, 'PATCH', { properties });
    } else {
      await notionApi(env, '/pages', 'POST', {
        parent: { database_id: DATABASES.attendance },
        properties: {
          ...properties,
          학생명: { title: [{ text: { content: name } }] },
          날짜: { date: { start: today } },
        },
      });
    }

    return { success: true, student: name, status, date: today };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// 보카 앱이 하루치를 끝내면 이 창구로 성적을 보낸다.
// 학생 앱은 공개 주소라 비밀번호를 줄 수 없으므로, 등록된 학생 이름인지로 거른다.
async function reportVoca(env, payload) {
  try {
    const student = String(payload.student || '').trim();
    const level = String(payload.level || '').trim().slice(0, 60);
    const day = Number(payload.day);
    const correct = Number(payload.correct);
    const total = Number(payload.total);

    if (!student || student.length > 50) return { success: false, error: '학생 이름이 올바르지 않습니다' };
    if (!Number.isFinite(day) || day < 1 || day > 1000) return { success: false, error: '일차가 올바르지 않습니다' };
    if (!Number.isFinite(total) || total < 0 || total > 500) return { success: false, error: '문항수가 올바르지 않습니다' };
    if (!Number.isFinite(correct) || correct < 0 || correct > total) return { success: false, error: '정답수가 올바르지 않습니다' };

    const known = await notionQuery(env, DATABASES.students, { property: '이름', title: { equals: student } });
    if (known.results.length === 0) return { success: false, error: '등록되지 않은 학생입니다' };

    // 같은 학생이 같은 일차를 다시 풀면 줄을 늘리지 않고 덮어쓴다.
    const key = student + '|' + level + '|' + day;
    const existing = await notionQuery(env, DATABASES.voca, { property: '키', rich_text: { equals: key } });

    const properties = {
      레벨: { rich_text: [{ text: { content: level } }] },
      일차: { number: day },
      정답: { number: correct },
      문항수: { number: total },
      날짜: { date: { start: seoulToday() } },
      키: { rich_text: [{ text: { content: key } }] },
    };

    if (existing.results.length > 0) {
      await notionApi(env, '/pages/' + existing.results[0].id, 'PATCH', { properties });
    } else {
      await notionApi(env, '/pages', 'POST', {
        parent: { database_id: DATABASES.voca },
        properties: { ...properties, 학생명: { title: [{ text: { content: student } }] } },
      });
    }

    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

function daysAgo(dateText, n) {
  const d = new Date(dateText + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

// 수행률 = 최근 7일 중 공부한 날 비율 (꾸준히 했는가)
// 성취률 = 전체 정답 ÷ 전체 문항 (얼마나 맞혔는가)
async function getVocaProgress(env) {
  try {
    const pages = await notionQueryAll(env, DATABASES.voca);
    const today = seoulToday();
    const weekStart = daysAgo(today, 6);

    const byStudent = new Map();
    for (const page of pages) {
      const name = textOf(page.properties['학생명']);
      if (!name) continue;

      if (!byStudent.has(name)) {
        byStudent.set(name, { name, correct: 0, total: 0, recentDays: new Set(), records: [] });
      }
      const row = byStudent.get(name);

      const correct = page.properties['정답']?.number || 0;
      const total = page.properties['문항수']?.number || 0;
      const date = textOf(page.properties['날짜']).slice(0, 10);

      row.correct += correct;
      row.total += total;
      if (date && date >= weekStart && date <= today) row.recentDays.add(date);
      row.records.push({
        date,
        level: textOf(page.properties['레벨']),
        day: page.properties['일차']?.number || 0,
        correct,
        total,
      });
    }

    const students = [...byStudent.values()].map(row => {
      row.records.sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.day - a.day);
      return {
        name: row.name,
        doneRate: Math.round((row.recentDays.size / 7) * 100),
        doneDays: row.recentDays.size,
        achieveRate: row.total ? Math.round((row.correct / row.total) * 100) : 0,
        correct: row.correct,
        total: row.total,
        records: row.records.slice(0, 5),
      };
    }).sort((a, b) => a.name.localeCompare(b.name));

    return { success: true, data: students };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// 학생 앱이 공개 주소라 워커 주소도 알려지게 된다. 그래서 원생 정보를 주는 창구는 모두 비밀번호를 본다.
// 노션 글자 칸은 조각 하나에 2000자까지다. 진도는 그보다 길 수 있어 나눠 담고, 읽을 때 도로 붙인다.
function toRichText(text) {
  const chunks = [];
  for (let i = 0; i < text.length; i += 1800) chunks.push({ text: { content: text.slice(i, i + 1800) } });
  return chunks.length ? chunks : [{ text: { content: '' } }];
}

function fromRichText(prop) {
  return (prop?.rich_text || []).map(piece => piece.plain_text).join('');
}

// 헷갈리는 글자(O·0, I·1)는 빼고 만든다. 아이들이 손으로 적어 들고 다니기 때문이다.
function makeCode() {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const digits = '23456789';
  let code = '';
  for (let i = 0; i < 2; i++) code += letters[Math.floor(Math.random() * letters.length)];
  for (let i = 0; i < 4; i++) code += digits[Math.floor(Math.random() * digits.length)];
  return code;
}

async function findStudentByCode(env, code) {
  const clean = String(code || '').trim().toUpperCase();
  if (!/^[A-Z0-9]{4,12}$/.test(clean)) return { error: '코드는 영문과 숫자로만 되어 있습니다' };

  const found = await notionQuery(env, DATABASES.students, {
    property: '단어장코드',
    rich_text: { equals: clean },
  });
  if (found.results.length === 0) return { error: '코드를 찾을 수 없습니다. 선생님께 확인해 주세요' };

  const page = found.results[0];
  if (textOf(page.properties['상태']) === '퇴원생') return { error: '지금은 쓸 수 없는 코드입니다' };

  return { name: textOf(page.properties['이름']) };
}

// 학생이 코드를 넣으면 자기 이름과 지난 진도를 돌려준다. 기기가 바뀌어도 이어서 한다.
async function vocaLogin(env, code) {
  try {
    const student = await findStudentByCode(env, code);
    if (student.error) return { success: false, error: student.error };

    const saved = await notionQuery(env, DATABASES.vocaProgress, {
      property: '학생명',
      title: { equals: student.name },
    });

    let progress = null;
    let levelId = '';
    let dayIdx = 0;

    if (saved.results.length > 0) {
      const row = saved.results[0];
      levelId = textOf(row.properties['레벨']);
      dayIdx = row.properties['일차']?.number || 0;
      try {
        progress = JSON.parse(fromRichText(row.properties['진도']) || 'null');
      } catch (e) {
        progress = null; // 깨진 진도는 없는 셈 치고 새로 시작하게 둔다
      }
    }

    return { success: true, name: student.name, levelId, dayIdx, progress };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function vocaSave(env, payload) {
  try {
    const student = await findStudentByCode(env, payload.code);
    if (student.error) return { success: false, error: student.error };

    const levelId = String(payload.levelId || '').slice(0, 60);
    const dayIdx = Number(payload.dayIdx);

    let blob = JSON.stringify(payload.progress || {});
    // 마스터한 단어 목록이 아주 길어지면 진도 칸에 다 안 들어간다.
    // 그때는 목록을 비운다 — 다음 일차와 학습 이력은 그대로 남는다.
    if (blob.length > 150000) {
      blob = JSON.stringify(Object.assign({}, payload.progress, { mastered: {} }));
    }
    if (blob.length > 178000) return { success: false, error: '진도가 너무 큽니다' };

    const properties = {
      레벨: { rich_text: [{ text: { content: levelId } }] },
      일차: { number: Number.isFinite(dayIdx) ? dayIdx : 0 },
      진도: { rich_text: toRichText(blob) },
      수정일: { date: { start: seoulToday() } },
    };

    const existing = await notionQuery(env, DATABASES.vocaProgress, {
      property: '학생명',
      title: { equals: student.name },
    });

    if (existing.results.length > 0) {
      await notionApi(env, '/pages/' + existing.results[0].id, 'PATCH', { properties });
    } else {
      await notionApi(env, '/pages', 'POST', {
        parent: { database_id: DATABASES.vocaProgress },
        properties: Object.assign({ 학생명: { title: [{ text: { content: student.name } }] } }, properties),
      });
    }

    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// 코드가 없는 학생에게 한 번에 발급한다. 원장님이 코드를 직접 지어내지 않아도 되게.
async function issueCodes(env) {
  try {
    const pages = await notionQueryAll(env, DATABASES.students);
    const taken = new Set(pages.map(page => textOf(page.properties['단어장코드'])).filter(Boolean));
    const issued = [];

    for (const page of pages) {
      if (textOf(page.properties['단어장코드'])) continue;
      if (textOf(page.properties['상태']) === '퇴원생') continue;

      let code = makeCode();
      while (taken.has(code)) code = makeCode();
      taken.add(code);

      await notionApi(env, '/pages/' + page.id, 'PATCH', {
        properties: { 단어장코드: { rich_text: [{ text: { content: code } }] } },
      });
      issued.push({ name: textOf(page.properties['이름']), code });
    }

    return { success: true, issued };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

function passwordOk(request, env) {
  const expected = env.DASHBOARD_PASSWORD;
  if (!expected) return true; // 아직 안 걸었으면 보기는 막지 않는다 (저장은 따로 막는다)

  let given = '';
  try {
    // 한글 비밀번호를 헤더에 담으려면 인코딩이 필요하다.
    given = decodeURIComponent(request.headers.get('X-Dashboard-Password') || '');
  } catch (e) { /* 깨진 값은 틀린 비밀번호와 똑같이 다룬다 */ }

  return sameSecret(given, expected);
}

function sameSecret(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
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
.tab-btn{display:inline-flex;align-items:center;gap:7px;padding:10px 14px;border:none;background:transparent;cursor:pointer;font-size:14px;font-weight:500;color:#64748b;border-bottom:2px solid transparent;white-space:nowrap}
.tab-ico{width:24px;height:24px;border-radius:7px;display:inline-flex;align-items:center;justify-content:center;font-size:14px;line-height:1;flex-shrink:0}
.title-ico{width:28px;height:28px;border-radius:8px;display:inline-flex;align-items:center;justify-content:center;font-size:16px;line-height:1;margin-right:8px;flex-shrink:0}
@media(prefers-color-scheme:dark){.tab-btn{color:#94a3b8}}
.tab-btn.active{color:#2563eb;border-bottom-color:#2563eb}
.tab-content{display:none}
.tab-content.active{display:block}
.card{background:#fff;border-radius:12px;padding:20px;margin-bottom:16px;border:1px solid #e2e8f0}
@media(prefers-color-scheme:dark){.card{background:#1e293b;border-color:#334155}}
.card-title{display:flex;align-items:center;font-size:16px;font-weight:600;margin-bottom:16px}
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
.weekdays{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:6px;margin-bottom:8px}
.weekday{text-align:center;font-size:12px;color:#64748b;font-weight:600}
.calendar{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:6px}
.calendar-day{padding:4px 2px;min-width:0;background:#f8fafc;border-radius:8px;text-align:center;font-size:13px;min-height:52px;display:flex;flex-direction:column;justify-content:center;align-items:center;gap:2px}
.d-num{font-size:13px;line-height:1.1}
.d-att{display:flex;gap:4px;font-size:10px;font-weight:700;line-height:1}
.d-att .p{color:#16a34a}
.d-att .a{color:#dc2626}
@media(prefers-color-scheme:dark){.d-att .p{color:#4ade80}.d-att .a{color:#f87171}}
.calendar-day.today .p{color:#bbf7d0}
.calendar-day.today .a{color:#fecaca}
.calendar-day.event .p{color:#15803d}
.calendar-day.event .a{color:#b91c1c}
.cal-legend{display:flex;flex-wrap:wrap;gap:14px;margin-top:12px;font-size:12px;color:#64748b}
@media(prefers-color-scheme:dark){.cal-legend{color:#94a3b8}}
.cal-legend b{font-weight:700}
.cal-legend .p{color:#16a34a}
.cal-legend .a{color:#dc2626}
.ev-chip{display:inline-block;width:12px;height:12px;border-radius:3px;background:#fef08a;vertical-align:-2px;margin-right:2px}
@media(prefers-color-scheme:dark){.calendar-day{background:#334155}}
.calendar-day.blank{background:transparent}
.calendar-day.today{background:#2563eb;color:#fff;font-weight:700}
.calendar-day.event{background:#fef08a;color:#713f12;font-weight:600}
@media(prefers-color-scheme:dark){.calendar-day.event{background:#854d0e;color:#fef08a}}
.event-list{margin-top:16px;display:grid;gap:8px}
.event-row{display:flex;gap:10px;font-size:13px;padding:8px 12px;background:#f8fafc;border-radius:8px}
@media(prefers-color-scheme:dark){.event-row{background:#334155}}
.event-date{color:#2563eb;font-weight:600;white-space:nowrap}
.check-list{display:grid;gap:10px}
.check-row{padding:12px 14px;background:#f8fafc;border-radius:8px;display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}
@media(prefers-color-scheme:dark){.check-row{background:#334155}}
.check-btns{display:flex;gap:8px}
.chk{padding:8px 16px;border:1px solid #cbd5e1;background:#fff;color:#475569;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;min-width:64px}
@media(prefers-color-scheme:dark){.chk{background:#1e293b;border-color:#475569;color:#cbd5e1}}
.chk:disabled{opacity:.5;cursor:progress}
.chk.on-present{background:#16a34a;border-color:#16a34a;color:#fff}
.chk.on-absent{background:#dc2626;border-color:#dc2626;color:#fff}
.code-bar{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:12px}
.code-note{font-size:12px;color:#64748b}
@media(prefers-color-scheme:dark){.code-note{color:#94a3b8}}
.code-bar button{padding:8px 14px;border:1px solid #cbd5e1;background:#fff;color:#1e293b;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer}
@media(prefers-color-scheme:dark){.code-bar button{background:#1e293b;border-color:#475569;color:#e2e8f0}}
.code-bar button:disabled{opacity:.5;cursor:progress}
.code-msg{font-size:12px;padding:10px 12px;background:#dbeafe;color:#1e40af;border-radius:8px;margin-bottom:12px;line-height:1.5}
@media(prefers-color-scheme:dark){.code-msg{background:#1e3a8a;color:#bfdbfe}}
.code-cell{display:flex;align-items:center;gap:8px}
.code-chip{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:13px;font-weight:700;letter-spacing:.06em;padding:4px 9px;background:#fff;border:1px solid #cbd5e1;border-radius:6px;color:#1e293b}
@media(prefers-color-scheme:dark){.code-chip{background:#0f172a;border-color:#475569;color:#e2e8f0}}
.code-none{font-size:11px;color:#94a3b8}
.voca-row{padding:14px;background:#f8fafc;border-radius:10px;margin-bottom:10px}
@media(prefers-color-scheme:dark){.voca-row{background:#334155}}
.voca-name{font-weight:700;margin-bottom:10px}
.voca-bars{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:14px}
.pbar-top{display:flex;justify-content:space-between;font-size:12px;color:#64748b;margin-bottom:4px}
@media(prefers-color-scheme:dark){.pbar-top{color:#94a3b8}}
.pbar-top b{font-size:14px;color:#1e293b}
@media(prefers-color-scheme:dark){.pbar-top b{color:#e2e8f0}}
.pbar-track{height:10px;border-radius:999px;background:#e2e8f0;overflow:hidden}
@media(prefers-color-scheme:dark){.pbar-track{background:#475569}}
.pbar-fill{height:100%;border-radius:999px;transition:width .4s ease}
.pbar-note{font-size:11px;color:#94a3b8;margin-top:4px}
.voca-recent{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}
.rec{font-size:11px;padding:4px 8px;background:#fff;border:1px solid #e2e8f0;border-radius:6px;color:#475569}
@media(prefers-color-scheme:dark){.rec{background:#1e293b;border-color:#475569;color:#cbd5e1}}
.pw-box{padding:12px 14px;background:#fef3c7;border-radius:8px;margin-bottom:14px}
@media(prefers-color-scheme:dark){.pw-box{background:#78350f}}
.pw-msg{font-size:13px;color:#92400e;margin-bottom:8px}
@media(prefers-color-scheme:dark){.pw-msg{color:#fde68a}}
.pw-row{display:flex;gap:8px;flex-wrap:wrap}
.pw-row input{flex:1;min-width:140px;padding:8px 10px;border:1px solid #d6d3d1;border-radius:6px;font-size:14px}
.pw-row button{padding:8px 16px;border:none;background:#2563eb;color:#fff;border-radius:6px;font-weight:600;cursor:pointer}
.rows{display:grid;gap:10px}
.row-item{padding:12px 14px;background:#f8fafc;border-radius:8px;border-left:4px solid #2563eb}
@media(prefers-color-scheme:dark){.row-item{background:#334155}}
.row-head{display:flex;justify-content:space-between;gap:12px;align-items:baseline}
.row-title{font-weight:600}
.row-when{font-size:12px;color:#2563eb;font-weight:600;white-space:nowrap}
.row-fields{margin-top:6px;display:flex;flex-wrap:wrap;gap:4px 14px}
.field{font-size:12px;color:#475569}
@media(prefers-color-scheme:dark){.field{color:#cbd5e1}}
.row-links{margin-top:8px;display:flex;flex-wrap:wrap;gap:6px}
.link-chip{display:inline-block;padding:5px 10px;background:#dbeafe;color:#1e40af;border-radius:6px;font-size:12px;font-weight:600;text-decoration:none}
.link-chip:hover{background:#bfdbfe}
@media(prefers-color-scheme:dark){.link-chip{background:#1e3a8a;color:#93c5fd}.link-chip:hover{background:#1d4ed8}}
.field b{color:#64748b;font-weight:600}
@media(prefers-color-scheme:dark){.field b{color:#94a3b8}}
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
<button class="tab-btn active" data-tab="dashboard"><span class="tab-ico" style="background:#bfdbfe">🐋</span>대시보드</button>
<button class="tab-btn" data-tab="students"><span class="tab-ico" style="background:#bbf7d0">👥</span>학생 목록</button>
<button class="tab-btn" data-tab="attendance"><span class="tab-ico" style="background:#a5f3fc">✅</span>출석 현황</button>
<button class="tab-btn" data-tab="calendar"><span class="tab-ico" style="background:#bfdbfe">📅</span>월간 캘린더</button>
<!--EXTRA_TABS-->
</div>

<div id="pw-box" class="pw-box" hidden>
<div class="pw-msg" id="pw-msg">비밀번호를 입력하세요</div>
<div class="pw-row"><input id="pw-input" type="password" placeholder="비밀번호" autocomplete="current-password"><button id="pw-save" type="button">확인</button></div>
</div>

<div id="dashboard" class="tab-content active">
<div class="stats-grid">
<div class="stat-box"><div class="stat-label">등록된 학생</div><div class="stat-value" id="stat-students">-</div></div>
<div class="stat-box"><div class="stat-label">오늘 출석</div><div class="stat-value" id="stat-attendance">-</div></div>
<div class="stat-box"><div class="stat-label">이번 달 행사</div><div class="stat-value" id="stat-events">-</div></div>
</div>
<div class="card"><div class="card-title"><span class="title-ico" style="background:#bbf7d0">👥</span>최근 학생</div><div id="recent-students" class="student-list"><div class="muted">불러오는 중…</div></div></div>
</div>

<div id="students" class="tab-content">
<div class="card"><div class="card-title"><span class="title-ico" style="background:#bbf7d0">👥</span>학생 목록</div><div class="code-bar"><span class="code-note">학습코드는 아이들이 보카 앱에 들어갈 때 쓰는 열쇠입니다</span><button id="issue-codes" type="button">코드 없는 학생에게 발급</button></div>
<div id="code-msg" class="code-msg" hidden></div>
<div id="students-list" class="student-list"><div class="muted">불러오는 중…</div></div></div>
</div>

<div id="attendance" class="tab-content">
<div class="card">
<div class="card-title"><span class="title-ico" style="background:#a5f3fc">✅</span>오늘 출석 체크</div>
<div id="save-msg" class="error" hidden></div>
<div id="attendance-list" class="check-list"><div class="muted">불러오는 중…</div></div>
</div>
</div>

<div id="calendar" class="tab-content">
<div class="card">
<div class="card-title"><span class="title-ico" style="background:#bfdbfe">📅</span><span id="calendar-title">캘린더</span></div>
<div class="weekdays"><div class="weekday">일</div><div class="weekday">월</div><div class="weekday">화</div><div class="weekday">수</div><div class="weekday">목</div><div class="weekday">금</div><div class="weekday">토</div></div>
<div id="calendar-grid" class="calendar"></div>
<div class="cal-legend"><span><b class="p">3</b> 출석</span><span><b class="a">1</b> 결석</span><span><i class="ev-chip"></i> 행사가 있는 날</span></div>
<div id="event-list" class="event-list"></div>
</div>
</div>
<!--EXTRA_PANELS-->
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
    var headers = {};
    var password = getPassword();
    // 한글 비밀번호는 그대로 헤더에 넣을 수 없어 인코딩해서 보낸다.
    if (password) headers['X-Dashboard-Password'] = encodeURIComponent(password);

    var response = await fetch('/api' + endpoint, { headers: headers });
    if (response.status === 401) {
      setPassword('');
      askPassword('비밀번호가 맞지 않습니다. 다시 입력해 주세요');
      return { success: false, error: '비밀번호가 필요합니다' };
    }
    return await response.json();
  } catch (error) {
    return { success: false, error: '서버에 연결하지 못했습니다 (' + error.message + ')' };
  }
}

var PW_KEY = 'gorae-dashboard-pw';

function getPassword() {
  try { return localStorage.getItem(PW_KEY) || ''; } catch (e) { return ''; }
}

function setPassword(value) {
  try {
    if (value) localStorage.setItem(PW_KEY, value);
    else localStorage.removeItem(PW_KEY);
  } catch (e) { /* 저장이 막힌 브라우저에서도 이번 사용은 되도록 넘어간다 */ }
}

var pendingMark = null;

function askPassword(message) {
  var box = document.getElementById('pw-box');
  document.getElementById('pw-msg').textContent = message;
  box.hidden = false;
  document.getElementById('pw-input').focus();
}

async function saveMark(student, status) {
  var password = getPassword();
  if (!password) return { needPassword: true };

  try {
    var response = await fetch('/api/attendance/mark', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // 한글 비밀번호는 그대로 헤더에 넣을 수 없어 인코딩해서 보낸다.
        'X-Dashboard-Password': encodeURIComponent(password),
      },
      body: JSON.stringify({ student: student, status: status }),
    });

    if (response.status === 401) {
      setPassword('');
      return { needPassword: true, wrong: true };
    }
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
    return result;
  }

  var students = result.data || [];
  document.getElementById('stat-students').textContent = students.length;

  if (students.length === 0) {
    listEl.innerHTML = '<div class="muted">등록된 학생이 없습니다</div>';
    recentEl.innerHTML = '<div class="muted">등록된 학생이 없습니다</div>';
    return result;
  }

  function row(s) {
    return '<div class="student-item"><div>' +
      '<div class="student-name">' + esc(s.name) + '</div>' +
      '<div class="student-info">' + esc([s.grade, s.status].filter(Boolean).join(' · ')) + '</div>' +
      '</div><span class="code-cell">' +
      (s.code ? '<span class="code-chip">' + esc(s.code) + '</span>' : '<span class="code-none">코드 없음</span>') +
      '<span class="badge">' + esc(s.status || '-') + '</span></span></div>';
  }

  listEl.innerHTML = students.map(row).join('');
  recentEl.innerHTML = students.slice(0, 5).map(row).join('');
  return result;
}

async function loadAttendance(studentsResult) {
  var el = document.getElementById('attendance-list');
  var result = await fetchAPI('/attendance/today');

  if (!result || !result.success) {
    showError(el, (result && result.error) || '알 수 없는 오류');
    return;
  }

  var marked = {};
  (result.data || []).forEach(function (r) { marked[r.student] = r.status; });
  document.getElementById('stat-attendance').textContent =
    (result.data || []).filter(function (a) { return a.status === '출석'; }).length;

  if (!studentsResult || !studentsResult.success) {
    showError(el, '학생 목록을 불러오지 못해 출석 체크를 만들 수 없습니다');
    return;
  }

  // 퇴원생은 매일 보는 체크 목록에 남길 필요가 없다.
  var students = (studentsResult.data || []).filter(function (s) { return s.status !== '퇴원생'; });
  if (students.length === 0) {
    el.innerHTML = '<div class="muted">출석을 체크할 학생이 없습니다</div>';
    return;
  }

  el.innerHTML = students.map(function (s) {
    var now = marked[s.name] || '';
    return '<div class="check-row" data-student="' + esc(s.name) + '">' +
      '<div><div class="student-name">' + esc(s.name) + '</div>' +
      '<div class="student-info">' + esc([s.grade, s.status].filter(Boolean).join(' · ')) + '</div></div>' +
      '<div class="check-btns">' +
      '<button type="button" class="chk' + (now === '출석' ? ' on-present' : '') + '" data-status="출석">출석</button>' +
      '<button type="button" class="chk' + (now === '결석' ? ' on-absent' : '') + '" data-status="결석">결석</button>' +
      '</div></div>';
  }).join('');
}

async function applyMark(row, status) {
  var buttons = row.querySelectorAll('.chk');
  buttons.forEach(function (b) { b.disabled = true; });
  var result = await saveMark(row.dataset.student, status);
  buttons.forEach(function (b) { b.disabled = false; });

  if (result.needPassword) {
    pendingMark = { row: row, status: status };
    askPassword(result.wrong
      ? '비밀번호가 맞지 않습니다. 다시 입력해 주세요'
      : '출석을 저장하려면 비밀번호가 필요합니다');
    return;
  }

  var saveMsg = document.getElementById('save-msg');
  if (!result.success) {
    saveMsg.textContent = '저장하지 못했습니다: ' + (result.error || '알 수 없는 오류');
    saveMsg.hidden = false;
    return;
  }

  saveMsg.hidden = true;
  document.getElementById('pw-box').hidden = true;
  buttons.forEach(function (b) {
    b.classList.remove('on-present', 'on-absent');
    if (b.dataset.status === status) {
      b.classList.add(status === '출석' ? 'on-present' : 'on-absent');
    }
  });
  document.getElementById('stat-attendance').textContent =
    document.querySelectorAll('#attendance-list .chk.on-present').length;
}

document.getElementById('attendance-list').addEventListener('click', function (e) {
  var btn = e.target.closest('button.chk');
  if (btn) applyMark(btn.closest('.check-row'), btn.dataset.status);
});

document.getElementById('pw-save').addEventListener('click', function () {
  var input = document.getElementById('pw-input');
  var value = input.value.trim();
  if (!value) return;

  setPassword(value);
  input.value = '';
  document.getElementById('pw-box').hidden = true;

  if (pendingMark) {
    var row = pendingMark.row;
    var status = pendingMark.status;
    pendingMark = null;
    applyMark(row, status);
  } else {
    loadAll();
  }
});

document.getElementById('pw-input').addEventListener('keydown', function (e) {
  if (e.key === 'Enter') document.getElementById('pw-save').click();
});

async function loadCalendar() {
  var grid = document.getElementById('calendar-grid');
  var listEl = document.getElementById('event-list');
  var both = await Promise.all([fetchAPI('/calendar'), fetchAPI('/attendance/month')]);
  var result = both[0];
  var attResult = both[1];

  if (!result || !result.success) {
    showError(listEl, (result && result.error) || '알 수 없는 오류');
    return;
  }

  var events = result.data || [];
  var attendance = (attResult && attResult.success && attResult.data) || {};
  var today = new Date();
  var year = today.getFullYear();
  var month = today.getMonth();

  document.getElementById('calendar-title').textContent = year + '년 ' + (month + 1) + '월';

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

    var counts = attendance[key];
    var marks = '';
    if (counts && (counts.present || counts.absent)) {
      marks = '<span class="d-att">' +
        (counts.present ? '<b class="p">' + counts.present + '</b>' : '') +
        (counts.absent ? '<b class="a">' + counts.absent + '</b>' : '') +
        '</span>';
    }

    cells.push('<div class="calendar-day' + cls + '">' +
      '<span class="d-num">' + day + '</span>' + marks + '</div>');
  }
  grid.innerHTML = cells.join('');

  listEl.innerHTML = thisMonth.length === 0
    ? '<div class="muted">이번 달 일정이 없습니다</div>'
    : thisMonth.map(function (e) {
        return '<div class="event-row"><span class="event-date">' + esc(e.date.slice(5, 10)) + '</span>' +
          '<span>' + esc(e.title) + (e.kind ? ' (' + esc(e.kind) + ')' : '') + '</span></div>';
      }).join('');
}

function progressBar(label, pct, note, color) {
  var width = Math.max(0, Math.min(100, pct));
  return '<div class="pbar-item">' +
    '<div class="pbar-top"><span>' + label + '</span><b>' + width + '%</b></div>' +
    '<div class="pbar-track"><div class="pbar-fill" style="width:' + width + '%;background:' + color + '"></div></div>' +
    '<div class="pbar-note">' + esc(note) + '</div>' +
    '</div>';
}

async function loadVoca() {
  var el = document.getElementById('voca-progress');
  if (!el) return;

  var result = await fetchAPI('/voca/progress');
  if (!result || !result.success) {
    showError(el, (result && result.error) || '알 수 없는 오류');
    return;
  }

  var students = result.data || [];
  if (students.length === 0) {
    el.innerHTML = '<div class="muted">아직 보카 학습 기록이 없습니다. 학생이 앱에서 하루치를 끝내면 여기에 쌓입니다.</div>';
    return;
  }

  el.innerHTML = students.map(function (st) {
    var recent = st.records.map(function (r) {
      return '<span class="rec">' + esc((r.date || '').slice(5)) + ' · ' +
        esc(r.level) + ' ' + r.day + '일차 <b>' + r.correct + '/' + r.total + '</b></span>';
    }).join('');

    return '<div class="voca-row">' +
      '<div class="voca-name">' + esc(st.name) + '</div>' +
      '<div class="voca-bars">' +
        progressBar('수행률', st.doneRate, '최근 7일 중 ' + st.doneDays + '일 학습', '#2563eb') +
        progressBar('성취률', st.achieveRate, st.correct + ' / ' + st.total + ' 문항 정답', '#16a34a') +
      '</div>' +
      (recent ? '<div class="voca-recent">' + recent + '</div>' : '') +
      '</div>';
  }).join('');
}

async function loadTable(key) {
  var el = document.querySelector('[data-table="' + key + '"]');
  if (!el || el.dataset.loaded === 'yes') return;
  el.dataset.loaded = 'yes';

  var result = await fetchAPI('/table/' + key);
  if (!result || !result.success) {
    el.dataset.loaded = 'no';
    showError(el, (result && result.error) || '알 수 없는 오류');
    return;
  }

  var rows = result.data || [];
  if (rows.length === 0) {
    el.innerHTML = '<div class="muted">아직 등록된 내용이 없습니다</div>';
    return;
  }

  el.innerHTML = rows.map(function (r) {
    var fields = r.fields.map(function (f) {
      return '<span class="field"><b>' + esc(f.label) + '</b> ' + esc(f.value) + '</span>';
    }).join('');

    var links = (r.links || []).map(function (l) {
      return '<a class="link-chip" href="' + esc(l.url) + '" target="_blank" rel="noopener">' +
        esc(l.label) + ' 열기</a>';
    }).join('');

    return '<div class="row-item"><div class="row-head">' +
      '<span class="row-title">' + esc(r.heading) + '</span>' +
      (r.when ? '<span class="row-when">' + esc(r.when.slice(0, 10)) + '</span>' : '') +
      '</div>' +
      (fields ? '<div class="row-fields">' + fields + '</div>' : '') +
      (links ? '<div class="row-links">' + links + '</div>' : '') +
      '</div>';
  }).join('');
}

document.getElementById('issue-codes').addEventListener('click', async function () {
  var button = this;
  var msg = document.getElementById('code-msg');
  button.disabled = true;
  msg.hidden = false;
  msg.textContent = '발급하는 중…';

  var password = getPassword();
  var result;
  try {
    var response = await fetch('/api/voca/codes', {
      method: 'POST',
      headers: password ? { 'X-Dashboard-Password': encodeURIComponent(password) } : {},
    });
    result = await response.json();
  } catch (error) {
    result = { success: false, error: error.message };
  }
  button.disabled = false;

  if (!result || !result.success) {
    msg.textContent = '발급하지 못했습니다: ' + ((result && result.error) || '알 수 없는 오류');
    return;
  }
  msg.textContent = result.issued.length === 0
    ? '모든 학생이 이미 코드를 갖고 있습니다'
    : result.issued.length + '명에게 발급했습니다: ' +
      result.issued.map(function (x) { return x.name + ' ' + x.code; }).join(', ');

  loadStudents();
});

document.querySelectorAll('.tab-btn').forEach(function (btn) {
  btn.addEventListener('click', function () {
    document.querySelectorAll('.tab-btn').forEach(function (b) { b.classList.remove('active'); });
    document.querySelectorAll('.tab-content').forEach(function (c) { c.classList.remove('active'); });
    btn.classList.add('active');
    var tab = btn.dataset.tab;
    document.getElementById(tab).classList.add('active');
    // 나머지 표는 눌렀을 때 불러온다. 12개를 한꺼번에 부르면 첫 화면이 느려진다.
    if (document.querySelector('[data-table="' + tab + '"]')) loadTable(tab);
    if (tab === 'tasks') loadVoca();
  });
});

async function loadAll() {
  // 비밀번호를 묻는 중이면 조회하지 않는다. 5분 자동 새로고침도 여기서 멈춘다.
  var box = document.getElementById('pw-box');
  if (box && !box.hidden && !getPassword()) return;

  loadCalendar();
  // 학생 목록은 한 번만 불러서 학생 탭과 출석 체크 목록이 함께 쓴다.
  loadAttendance(await loadStudents());

  var open = document.querySelector('.tab-btn.active');
  var openTable = open && document.querySelector('[data-table="' + open.dataset.tab + '"]');
  if (openTable) {
    openTable.dataset.loaded = 'no';
    loadTable(open.dataset.tab);
  }
}

async function boot() {
  updateDate();

  // 비밀번호를 걸어 두었는지 먼저 확인한다. 안 걸어 두었으면 묻지 않고 그냥 연다.
  var health = await fetch('/api/health')
    .then(function (r) { return r.json(); })
    .catch(function () { return null; });

  if (health && health.hasPassword && !getPassword()) {
    askPassword('대시보드를 보려면 비밀번호를 입력하세요');
    return;
  }
  loadAll();
}

boot();
setInterval(loadAll, 5 * 60 * 1000);
</script>
</body>
</html>`;

// 탭과 화면은 TABLES 하나만 고치면 따라오도록, 내보낼 때 끼워 넣는다.
function renderDashboard() {
  const tabs = TABLES.map(t =>
    '<button class="tab-btn" data-tab="' + t.key + '">' +
    iconTile(t.icon, t.color, 'tab-ico') + t.label + '</button>'
  ).join('');

  const panels = TABLES.map(t =>
    '<div id="' + t.key + '" class="tab-content">' +
    (t.key === 'tasks'
      ? '<div class="card"><div class="card-title">' +
        iconTile('🐳', '#a5f3fc', 'title-ico') + '보카 수행률 · 성취률</div>' +
        '<div id="voca-progress"><div class="muted">불러오는 중…</div></div></div>'
      : '') +
    '<div class="card">' +
    '<div class="card-title">' + iconTile(t.icon, t.color, 'title-ico') + t.label + '</div>' +
    '<div class="rows" data-table="' + t.key + '"><div class="muted">불러오는 중…</div></div>' +
    '</div></div>'
  ).join('');

  return dashboardHTML
    .replace('<!--EXTRA_TABS-->', tabs)
    .replace('<!--EXTRA_PANELS-->', panels);
}

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
      return new Response(renderDashboard(), {
        status: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    }
    if (path === '/api/health') {
      return json({
        status: 'ok',
        hasNotionKey: Boolean(env.NOTION_API_KEY),
        hasPassword: Boolean(env.DASHBOARD_PASSWORD),
        today: seoulToday(),
      });
    }

    // 보카 앱(학생용 공개 주소)이 쓰는 창구들. 비밀번호 대신 학습코드로 본인을 밝힌다.
    if (path === '/api/voca/report' && request.method === 'POST') {
      const payload = await request.json().catch(() => ({}));
      return json(await reportVoca(env, payload));
    }
    if (path === '/api/voca/login' && request.method === 'POST') {
      const payload = await request.json().catch(() => ({}));
      return json(await vocaLogin(env, payload.code));
    }
    if (path === '/api/voca/save' && request.method === 'POST') {
      const payload = await request.json().catch(() => ({}));
      return json(await vocaSave(env, payload));
    }

    // ── 여기부터는 원생 정보다 ──
    if (!passwordOk(request, env)) {
      return json({ success: false, error: '비밀번호가 맞지 않습니다' }, 401);
    }

    if (path === '/api/voca/progress') return json(await getVocaProgress(env));
    if (path === '/api/voca/codes' && request.method === 'POST') return json(await issueCodes(env));
    if (path === '/api/students') return json(await getStudents(env));
    if (path === '/api/attendance/today') return json(await getTodayAttendance(env));
    if (path === '/api/attendance/month') return json(await getMonthAttendance(env));
    if (path === '/api/calendar') return json(await getCalendarEvents(env));

    if (path.startsWith('/api/table/')) {
      const key = path.slice('/api/table/'.length);
      if (!TABLES.some(t => t.key === key)) return json({ success: false, error: '없는 표: ' + key }, 404);
      return json(await getTable(env, key));
    }

    // 기록을 고치는 요청은 비밀번호가 있어야만 받는다.
    // 비밀번호를 아직 안 걸었으면 보기는 되지만 저장은 막는다 — 주소만 알면 기록을 바꾸는 일이 없도록.
    if (path === '/api/attendance/mark' && request.method === 'POST') {
      // 비밀번호를 아예 안 걸어둔 상태에서는 기록을 고치지 못하게 한다.
      if (!env.DASHBOARD_PASSWORD) {
        return json({ success: false, error: '비밀번호(DASHBOARD_PASSWORD)가 등록되지 않아 저장할 수 없습니다' }, 403);
      }
      const payload = await request.json().catch(() => ({}));
      return json(await markAttendance(env, payload.student, payload.status));
    }

    return json({ error: 'Not found', path }, 404);
  } catch (error) {
    return json({ error: error.message }, 500);
  }
}

export default {
  fetch: handleRequest,
};
