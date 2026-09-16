/** 도메인 인식 라우팅 — staff.whalejinju.kr vs whalejinju.kr */

(function() {
  var currentHost = window.location.hostname;

  // 로컬/테스트 환경 무시
  if (currentHost === 'localhost' || currentHost.startsWith('127.') || currentHost === '[::1]') {
    return;
  }

  // staff.whalejinju.kr (대시보드) — 정상, 아무것도 하지 않음
  if (currentHost === 'staff.whalejinju.kr') {
    return;
  }

  // whalejinju.kr (프로모션 사이트) — 대시보드로 리다이렉트 확인
  if (currentHost === 'whalejinju.kr') {
    // 학원 프로모션 사이트로 이동해야 함을 알림
    // 현재는 로깅만 함 (실제 리다이렉트는 프로모션 사이트에서 처리)
    console.log('[Domain Check] 학원 프로모션 사이트입니다. 원생관리는 staff.whalejinju.kr 에서 접근하세요.');
    return;
  }

  // 기타 도메인 — 경고만 표시
  console.warn('[Domain Check] 예상치 못한 도메인입니다:', currentHost);
})();
