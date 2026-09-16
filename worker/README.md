# 클라우드플레어 워커 설치

`staff.whalejinju.kr` 앞에 문지기를 세웁니다. 화면 파일은 지금처럼 GitHub Pages 에서
그대로 가져오고, 이 워커는 **앞에서 비밀번호만 확인**합니다.

하는 일은 세 가지입니다.

| 주소 | 하는 일 |
|---|---|
| `staff.whalejinju.kr/**` | 학원 비밀번호를 확인합니다. 통과하면 30일간 다시 묻지 않습니다 |
| `staff.whalejinju.kr/p/**` | 학부모 링크 전용 통로. 비밀번호를 묻지 않습니다 |
| `staff.whalejinju.kr/api/notion/students` | 노션 학생 명부를 대신 읽어 옵니다 (로그인 필요) |

---

## 먼저 확인할 것

- `whalejinju.kr` 도메인이 **클라우드플레어에 등록**되어 있어야 합니다
- `staff.whalejinju.kr` DNS 레코드가 **프록시 켜짐(주황색 구름)** 이어야 합니다.
  회색 구름이면 워커를 거치지 않고 바로 GitHub Pages 로 갑니다

GitHub Pages 쪽 설정(`CNAME` 파일, Custom domain)은 **그대로 두시면 됩니다.**
워커 안에서 보내는 요청은 워커를 한 번 더 거치지 않아 무한히 돌지 않습니다.

---

## 설치

### 방법 A — 클라우드플레어 웹 화면에서 (권장)

1. 클라우드플레어 대시보드 → **Workers & Pages** → **Create** → **Start with Hello World**
2. 이름을 `gorae-staff-gate` 로 하고 만듭니다
3. **Edit code** 를 눌러 편집기를 열고, 이 폴더의 `worker.js` **전체를 붙여넣기** 합니다
4. **Deploy**
5. 워커 → **Settings → Domains & Routes → Add route**
   - Route: `staff.whalejinju.kr/*`
   - Zone: `whalejinju.kr`
6. 워커 → **Settings → Variables and Secrets** 에서 아래를 넣습니다

   | 이름 | 종류 | 값 |
   |---|---|---|
   | `STAFF_PASSWORD` | Secret | 선생님들이 쓸 학원 비밀번호 |
   | `SESSION_SECRET` | Secret | 아무 긴 문자열 (쿠키 서명용) |
   | `NOTION_TOKEN` | Secret | 노션 연동을 쓸 때만 |
   | `NOTION_STUDENT_DB` | Text | `2c3e4c50882081c2b2c5ded6f7a8ba5a` |

### 방법 B — 명령어로

```bash
cd worker
npx wrangler login
npx wrangler secret put STAFF_PASSWORD
npx wrangler secret put SESSION_SECRET
npx wrangler deploy
```

`wrangler.toml` 에 경로와 도메인이 이미 적혀 있습니다.

---

## 설치 뒤에 꼭 할 것

앱의 **설정 · 백업 → 학부모 공개 링크 주소** 칸에 이것을 넣어 주세요.

```
https://staff.whalejinju.kr/p/
```

이걸 빼면 학부모에게 보낸 리포트 링크에도 비밀번호 창이 떠 버립니다.
자세한 설명은 `docs/접속-로그인-안내.md` 에 있습니다.

---

## 확인

```bash
node tests/worker.test.js
```

브라우저 없이 워커 코드를 그대로 실행해, 무엇을 막고 무엇을 통과시키는지 봅니다.
바깥으로 나가는 요청(GitHub Pages·노션)은 가짜로 바꿔 두고 확인합니다.

실제 도메인에 올린 뒤에는 이 세 가지를 눈으로 확인해 주세요.

1. `https://staff.whalejinju.kr` → 비밀번호 화면이 뜨는지
2. 비밀번호를 넣으면 대시보드가 열리는지
3. 학부모 공유에서 만든 `/p/#/report?d=...` 링크를 **시크릿 창**에서 열었을 때
   비밀번호 없이 리포트가 보이는지

---

## 노션 연동에 대해

워커에 `/api/notion/students` 창구를 열어 두었습니다.
노션 토큰을 브라우저에 두면 누구나 볼 수 있으므로, 워커가 대신 불러오는 방식입니다.

**다만 지금은 옮겨올 내용이 없습니다.** 노션 `학생 명부` 데이터베이스를 확인해 보니
견본 한 줄(`김노션`, 삭제 표시됨)뿐이고 실제 학생 기록은 들어 있지 않았습니다.
노션에 학생을 채워 넣으신 뒤에 쓰시면 됩니다.

쓰시려면 노션 쪽에서 한 번 열어 주셔야 합니다.

1. <https://www.notion.so/my-integrations> → **New integration** → 이름 `고래영어 원생관리`
2. 만들어진 **Internal Integration Token** 을 복사 → 워커의 `NOTION_TOKEN` 에 넣기
3. 노션에서 **학생 명부** 데이터베이스를 열고 → 오른쪽 위 `...` → **연결 추가** →
   방금 만든 통합을 고르기

이 부분은 실제 노션 토큰으로 주고받는 것까지는 확인하지 못했습니다.
읽어온 값을 앱의 학생 모양으로 바꾸는 부분만 가짜 응답으로 확인했습니다.
