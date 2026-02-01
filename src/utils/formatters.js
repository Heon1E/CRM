/**
 * 공통 포맷팅 유틸리티 함수
 * 날짜, 금액 등 반복되는 포맷팅 로직을 통합
 */

/**
 * 날짜를 YYYY-MM-DD 형식으로 변환
 * @param {string|Date} dateString - 날짜 문자열 또는 Date 객체
 * @returns {string} YYYY-MM-DD 형식의 날짜 문자열
 */
export const formatDate = (dateString) => {
  if (!dateString) return '날짜 없음'

  // ISO 형식 문자열인 경우 (예: "2026-01-07T00:00:00...")
  if (typeof dateString === 'string' && dateString.includes('T')) {
    return dateString.split('T')[0]
  }

  // 이미 YYYY-MM-DD 형식인 경우
  if (typeof dateString === 'string' && /^\d{4}-\d{2}-\d{2}/.test(dateString)) {
    return dateString.substring(0, 10)
  }

  // Date 객체인 경우
  if (dateString instanceof Date) {
    const year = dateString.getFullYear()
    const month = String(dateString.getMonth() + 1).padStart(2, '0')
    const day = String(dateString.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  // 그 외의 경우 Date 객체로 변환 시도
  try {
    const date = new Date(dateString)
    if (!isNaN(date.getTime())) {
      const year = date.getFullYear()
      const month = String(date.getMonth() + 1).padStart(2, '0')
      const day = String(date.getDate()).padStart(2, '0')
      return `${year}-${month}-${day}`
    }
  } catch (e) {
    // 변환 실패 시 원본 반환
  }

  return dateString
}

/**
 * 날짜를 input[type="date"] 형식으로 변환
 * @param {string|Date} dateString - 날짜 문자열 또는 Date 객체
 * @returns {string} YYYY-MM-DD 형식의 날짜 문자열 (input용)
 */
export const parseDateForInput = (dateString) => {
  if (!dateString) return ''

  // ISO 형식 문자열인 경우
  if (typeof dateString === 'string' && dateString.includes('T')) {
    return dateString.split('T')[0]
  }

  // 이미 YYYY-MM-DD 형식인 경우
  if (typeof dateString === 'string' && /^\d{4}-\d{2}-\d{2}/.test(dateString)) {
    return dateString.substring(0, 10)
  }

  // Date 객체인 경우
  if (dateString instanceof Date) {
    const year = dateString.getFullYear()
    const month = String(dateString.getMonth() + 1).padStart(2, '0')
    const day = String(dateString.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  // 그 외의 경우 Date 객체로 변환 시도
  try {
    const date = new Date(dateString)
    if (!isNaN(date.getTime())) {
      const year = date.getFullYear()
      const month = String(date.getMonth() + 1).padStart(2, '0')
      const day = String(date.getDate()).padStart(2, '0')
      return `${year}-${month}-${day}`
    }
  } catch (e) {
    // 변환 실패 시 빈 문자열 반환
  }

  return ''
}

/**
 * 금액을 만원 단위로 포맷팅
 * @param {number} amount - 금액 (원 단위)
 * @returns {string} 포맷팅된 금액 문자열 (예: "1,234만원" 또는 "5,700원")
 */
export const formatCurrency = (amount) => {
  if (!amount || amount === 0) return '0원'

  const amountNum = Number(amount)

  // 모든 금액을 원 단위로 표시 (천단위 콤마)
  return `${amountNum.toLocaleString()}원`
}

/**
 * 금액을 천 단위 콤마로 포맷팅
 * @param {number} amount - 금액
 * @returns {string} 포맷팅된 금액 문자열 (예: "1,234,567")
 */
export const formatNumber = (amount) => {
  if (!amount && amount !== 0) return '0'
  return amount.toLocaleString()
}

/**
 * 금액을 한국 전통 단위(억, 만원)로 포맷팅
 * @param {number} amount - 금액 (원 단위)
 * @returns {string} 포맷팅된 금액 문자열 (예: "8억 9,443만원" 또는 "57만원" 또는 "5,700원")
 */
export const formatKoreanCurrency = (amount) => {
  if (!amount || amount === 0) return '0원'

  const amountNum = Number(amount)

  // 1만원 미만: 원 단위로 표시
  if (amountNum < 10000) {
    return `${amountNum.toLocaleString()}원`
  }

  // 1억원 이상: "X억 Y,YYY만원" 형식
  if (amountNum >= 100000000) {
    const eok = Math.floor(amountNum / 100000000)
    const man = Math.floor((amountNum % 100000000) / 10000)

    if (man > 0) {
      return `${eok}억 ${man.toLocaleString()}만원`
    } else {
      return `${eok}억원`
    }
  }

  // 1만원 이상 1억원 미만: "X,YYY만원" 형식
  const man = Math.floor(amountNum / 10000)
  return `${man.toLocaleString()}만원`
}

