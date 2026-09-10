# 🐋 고래영어 대시보드 Workers 설정 가이드

## 1단계: Notion 테이블 ID 수집

각 Notion 테이블을 열었을 때, 주소창의 URL에서 데이터베이스 ID를 찾아야 합니다.

### 데이터베이스 ID 찾기

예: `https://www.notion.so/workspace/abc123def456789abc123def456?v=xxxxx`

- `?` 앞에 있는 긴 문자열이 데이터베이스 ID입니다 (하이픈을 빼고 사용)
- 예: `abc123def456789abc123def456`

### 필요한 테이블 ID 목록

다음 11개 테이블을 열어서 ID를 복사하세요:

1. **고래영어 - 학생** → `students` 변수에 붙여넣기
2. **고래영어 - 출석** → `attendance` 변수에 붙여넣기
3. **고래영어 - 상담일지** → `counseling` 변수에 붙여넣기
4. **고래영어 - 결제** → `payment` 변수에 붙여넣기
5. **고래영어 - 과제** → `tasks` 변수에 붙여넣기
6. **고래영어 - 수업일지** → `patrols` 변수에 붙여넣기
7. **고래영어 - 알림** → `notifications` 변수에 붙여넣기
8. **고래영어 - 학원자료실** → `resources` 변수에 붙여넣기
9. **고래영어 - 도서대여** → `books` 변수에 붙여넣기
10. **고래영어 - 업무메모** → `memos` 변수에 붙여넣기
11. **고래영어 - 캘린더** → `calendar` 변수에 붙여넣기

## 2단계: 코드 수정

`src/index.js` 파일의 `DATABASES` 부분에 위에서 수집한 ID를 붙여넣으세요.

```javascript
const DATABASES = {
  students: '여기에_학생_테이블_ID',
  attendance: '여기에_출석_테이블_ID',
  // ... 나머지도 마찬가지
};
```

## 3단계: Cloudflare에 배포

### 3-1. wrangler 설치
```bash
cd workers
npm install
```

### 3-2. Cloudflare 로그인
```bash
npx wrangler login
```
- 브라우저가 열리면 Cloudflare 계정으로 로그인하세요

### 3-3. Notion API 토큰 설정 (보안)

Cloudflare에 배포하기 전에 환경 변수로 Notion API 토큰을 설정해야 합니다.

```bash
npx wrangler secret put NOTION_API_KEY
# 프롬프트에서 Notion Integration 토큰을 붙여넣으세요
# (이전에 생성한 Integration 토큰을 사용하세요)
```

### 3-4. 배포
```bash
npm run deploy
```

배포 완료 후 나타나는 URL을 기억하세요:
```
https://gorae-notion-api.{your-account}.workers.dev
```

## 4단계: 대시보드에서 사용

대시보드 JavaScript에서 다음처럼 호출하세요:

```javascript
const API_URL = 'https://gorae-notion-api.{your-account}.workers.dev';

// 학생 목록 조회
fetch(`${API_URL}/api/students`)
  .then(r => r.json())
  .then(data => console.log(data));

// 오늘 출석 조회
fetch(`${API_URL}/api/attendance/today`)
  .then(r => r.json())
  .then(data => console.log(data));

// 캘린더 조회
fetch(`${API_URL}/api/calendar`)
  .then(r => r.json())
  .then(data => console.log(data));
```

## 참고사항

- Notion Integration 토큰은 이미 코드에 포함되어 있습니다
- API는 모든 CORS 요청을 허용합니다 (보안상 나중에 제한 필요)
- 배포된 URL은 24시간 지속됩니다
