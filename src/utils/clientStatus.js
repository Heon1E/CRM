export const CLIENT_STATUS_OPTIONS = ['매출', '신규', '단절']
export const CLIENT_STATUS_SET = new Set(CLIENT_STATUS_OPTIONS)

export const PIPELINE_STATUSES = ['잠재고객', '연락중', '미팅예정', '견적제출', '협상중', '거래 종료', '영업 대기']

export const ACTIVE_STATUSES = ['매출']

export const INACTIVE_KEYWORDS = ['단절', 'inactive', 'lost', 'closed']

export const normalizeStatus = (status) => (status || '').toString().trim()

export const isValidClientStatus = (status) => CLIENT_STATUS_SET.has(normalizeStatus(status))

export const coerceClientStatus = (status, fallback = '신규') => {
  const normalized = normalizeStatus(status)
  return CLIENT_STATUS_SET.has(normalized) ? normalized : fallback
}

export const getClientStatusTone = (status) => {
  const normalized = normalizeStatus(status)
  if (!CLIENT_STATUS_SET.has(normalized)) return 'unknown'
  if (normalized === '매출') return 'sales'
  if (normalized === '신규') return 'new'
  if (normalized === '단절') return 'inactive'
  return 'unknown'
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