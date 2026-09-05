/*
 * 거래처 상태 — **DB에 실제로 들어 있는 값을 전부 적는다.**
 *
 * 예전에는 `['매출', '신규', '단절']` 셋뿐이었다. 그런데 실제 분포는 이렇다
 * (2026-09 실측, 1,150곳):
 *
 *   활성 736 · 매출 335 · 잠재고객 46 · 신규 44 · 거래 종료 4 · 단절 1 · 영업 대기 1
 *
 * 목록에 없는 값은 `coerceClientStatus`가 '신규'로 바꿔 버렸다. **가장 흔한
 * 값인 '활성' 736곳이 전부 '신규'로 표시되고 있었다** — 몇 년째 거래 중인
 * 곳을 신규라고 말하는 셈이다(전체의 64%).
 *
 * 더 나쁜 것은 수정 창이다. 이 목록이 그대로 선택지가 되므로 '활성' 거래처를
 * 열면 고를 수 있는 값에 '활성'이 없고, 저장하면 **다른 값으로 바뀐다.**
 *
 * 순서는 거래의 흐름을 따른다 — 처음 만난 곳에서 끝난 곳까지.
 */
export const CLIENT_STATUS_OPTIONS = ['신규', '잠재고객', '영업 대기', '활성', '매출', '거래 종료', '단절']
export const CLIENT_STATUS_SET = new Set(CLIENT_STATUS_OPTIONS)

export const PIPELINE_STATUSES = ['잠재고객', '연락중', '미팅예정', '견적제출', '협상중', '거래 종료', '영업 대기']

// '활성'도 거래 중이다. 예전에는 '매출'만 넣어 736곳이 비활성으로 잡혔다.
export const ACTIVE_STATUSES = ['매출', '활성']

export const INACTIVE_KEYWORDS = ['단절', 'inactive', 'lost', 'closed']

export const normalizeStatus = (status) => (status || '').toString().trim()

export const isValidClientStatus = (status) => CLIENT_STATUS_SET.has(normalizeStatus(status))

/**
 * 화면에 쓸 상태 문자열.
 *
 * **모르는 값이라고 다른 이름을 붙이지 않는다.** 예전에는 목록에 없으면
 * 무조건 '신규'로 바꿨는데, 그래서 '활성' 736곳이 신규가 됐다.
 * 비어 있을 때만 기본값을 쓰고, 값이 있으면 그대로 보여준다 —
 * 낯선 값이 보이면 사람이 알아채고 고칠 수 있지만, 그럴듯한 거짓말은 못 알아챈다.
 */
export const coerceClientStatus = (status, fallback = '신규') => {
  const normalized = normalizeStatus(status)
  if (!normalized) return fallback
  return normalized
}

/**
 * 상태를 **색의 무게**로 나눈다 (DESIGN.md 1장).
 * `.badge-status[data-tone]`이 이 값을 받는다.
 *
 * 목록과 상세가 **같은 함수**를 봐야 한다. 한쪽만 고치면 같은 거래처가
 * 화면마다 다른 색으로 뜬다.
 *
 * 노랑('신규')은 1,150곳 중 44곳뿐이라 한 화면에 한둘이다 — 그래야 산다.
 * 흔한 '활성'에 칠하면 노랑이 죽는다.
 */
export const getClientStatusTone = (status) => {
  const s = normalizeStatus(status)
  if (s === '매출') return 'live'                       // 거래 중 — 초록(결론)
  if (s === '신규') return 'new'                        // 지금 여기 — 노랑
  if (s === '잠재고객' || s === '영업 대기') return 'lead'
  if (s === '거래 종료' || s === '단절') return 'off'
  return 'idle'                                        // 활성 등 — 물러난다
}

export const isPipelineStatus = (status) => PIPELINE_STATUSES.includes(normalizeStatus(status))

export const isPipelineCandidate = (status) => {
  const normalized = normalizeStatus(status)
  return isPipelineStatus(normalized) || normalized === '신규' || normalized === '단절'
}

export const isActiveClientStatus = (status) => {
  const normalized = normalizeStatus(status)
  if (!normalized) return false
  if (ACTIVE_STATUSES.includes(normalized)) return true
  if (isPipelineCandidate(normalized)) return false
  const lower = normalized.toLowerCase()
  return !INACTIVE_KEYWORDS.some((keyword) => lower.includes(keyword))
}

export default {
  CLIENT_STATUS_OPTIONS,
  CLIENT_STATUS_SET,
  PIPELINE_STATUSES,
  ACTIVE_STATUSES,
  INACTIVE_KEYWORDS,
  normalizeStatus,
  isValidClientStatus,
  coerceClientStatus,
  getClientStatusTone,
  isPipelineStatus,
  isPipelineCandidate,
  isActiveClientStatus,
}