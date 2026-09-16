# 고래영어 서브도메인 설정

## 도메인 분리

- **whalejinju.kr** — 학원 공개 홍보 사이트 (프로모션)
- **staff.whalejinju.kr** — 원생관리 대시보드 (이 저장소)

## GitHub Pages 설정

현재 저장소는 `staff.whalejinju.kr` 으로 설정되어 있습니다.

### 1. DNS 설정 (도메인 등록업체)

도메인 레지스트라(GoDaddy, Namecheap, AWS Route53 등)에서 다음과 같이 설정하세요:

#### A 레코드 (whalejinju.kr)
프로모션 사이트로 연결합니다:
```
레코드: A
이름: @
값: [프로모션 사이트 호스팅 서버 IP]
```

#### CNAME 레코드 (staff.whalejinju.kr)
GitHub Pages로 연결합니다:
```
레코드: CNAME
이름: staff
값: a28008005-sketch.github.io
```

### 2. GitHub 저장소 설정

1. GitHub 저장소 페이지 → Settings → Pages
2. **Custom domain** 필드에 `staff.whalejinju.kr` 입력
3. **Enforce HTTPS** 체크 (자동 SSL 인증서 발급)
4. Save

→ 이미 `CNAME` 파일이 저장소에 포함되어 있습니다.

### 3. DNS 전파 대기

DNS 변경이 전 세계적으로 전파되는 데 **24~48시간** 소요될 수 있습니다.

```bash
# 전파 상태 확인
nslookup staff.whalejinju.kr
dig staff.whalejinju.kr +short
```

### 4. 검증

- `https://staff.whalejinju.kr` 접속 → 대시보드 로드되는지 확인
- HTTPS 인증서가 올바르게 발급되었는지 확인
- 콘솔에서 혼합 콘텐츠(Mixed Content) 오류 없는지 확인

## 모바일 앱 설정

이 웹앱의 링크를 모바일 홈화면에 저장하려면:
- iOS: Safari → 공유 → 홈 화면에 추가
- Android: Chrome → 메뉴 → 홈 화면에 앱 설치

모두 `staff.whalejinju.kr` 에서 실행되어야 합니다.

## 학부모 공유 링크

학부모에게 공유되는 링크는 `whalejinju.kr` 로 설정되어 있습니다.
(`store.js` 의 `academy.site` 필드)

이것은 홍보 사이트가 학부모 소통 허브이기 때문입니다. 필요시 변경할 수 있습니다.

## 트러블슈팅

### CNAME 오류
- "CNAME already in use" → 다른 저장소가 이미 `staff.whalejinju.kr` 를 사용 중
- 해당 저장소를 확인하거나 도메인 레지스트라에 문의

### HTTPS 인증서 미발급
- GitHub Pages HTTPS 설정 후 최대 24시간 소요
- "Enforce HTTPS" 체크박스가 비활성화되어 있다면, DNS 설정이 아직 전파 중

### 혼합 콘텐츠(Mixed Content) 경고
- 모든 리소스 URL이 `https://` 를 사용해야 함
- 현재 코드는 모두 프로토콜-상대(`//`) 또는 `https://` 경로 사용

## 참고

- GitHub Pages는 HTTP를 HTTPS로 자동 리다이렉트합니다
- CDN(Cloudflare 등)을 쓰는 경우 캐시 설정 확인 필요
- 도메인 소유권 인증은 GitHub Pages 설정 시 자동으로 처리됩니다
