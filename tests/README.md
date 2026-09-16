# 검증 스크립트

브라우저(Chromium)를 띄워 실제로 클릭해 보는 방식의 확인 스크립트입니다.
단위 테스트 프레임워크는 쓰지 않고, 통과 여부를 `✓ / ✗` 로 출력합니다.

## 준비

```bash
npm i -g playwright        # 이미 있으면 생략
npx http-server -p 8899 -s .   # 저장소 최상위에서 정적 서버 실행
```

## 실행

```bash
node tests/classes-attitude.test.js          # 반·시간표, 수업 태도, 삭제된 메뉴
node tests/homework-vocab-library.test.js    # 숙제, 단어학습 가져오기, 도서 대여
node tests/worksheet.test.js                 # 워크시트 레벨 판정·생성·대여 연동
node tests/bundle-check.js                   # dist 단일 파일이 제대로 동작하는지
```

클라우드플레어 워커는 브라우저 없이 확인합니다. 정적 서버도 필요 없습니다.

```bash
node tests/worker.test.js                    # 비밀번호 문지기 · 공개 통로 · 노션 창구
```

클라우드 동기화 확인은 가짜 백엔드를 먼저 띄웁니다.

```bash
node tests/fake-cloud-server.js &            # 8902 포트
curl -s http://127.0.0.1:8902/reset          # 매 실행 전 초기화 (중요)
node tests/cloud-sync.test.js                # 두 기기 양방향 전파 · 오프라인 · 충돌
```

> `fake-cloud-server.js` 는 Supabase 의 `records` 표 동작만 흉내 낸 것입니다.
> 실제 Supabase 와 주고받는 부분은 이 스크립트로 검증되지 않습니다.

## 알아둘 것

- 워크시트 테스트에서 `ERR_CERT_AUTHORITY_INVALID` 가 콘솔에 찍힐 수 있습니다.
  워크시트가 Google Fonts 를 불러오는데 일부 실행 환경에서 인증서를 못 믿어서 나는 것이고,
  **앱 문제가 아닙니다.** 글꼴은 대체 글꼴로 떨어지고 판정 결과에는 영향이 없습니다.
- `cloud-sync.test.js` 는 실행 전에 반드시 `/reset` 을 부르세요. 앞 회차 자료가 남아 있으면
  학생 수가 두 배로 잡혀 엉뚱하게 실패합니다.

## 스크린샷

`SHOT_DIR` 을 주면 그 폴더에 화면을 저장합니다.

```bash
SHOT_DIR=/tmp/shots node tests/worksheet.test.js
```
