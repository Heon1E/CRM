/**
 * 한국 전화번호 포맷터 유틸리티
 * 숫자만 입력된 전화번호를 한국 전화번호 형식으로 자동 변환
 */

/**
 * 전화번호에서 숫자만 추출
 */
const extractNumbers = (phone) => {
  return phone?.replace(/[^\d]/g, '') || ''
}

/**
 * 한국 전화번호 포맷팅
 * @param {string} phone - 전화번호 (숫자만 또는 하이픈 포함)
 * @returns {string} - 포맷팅된 전화번호 (예: 02-1234-5678, 031-123-4567, 010-1234-5678)
 */
export const formatKoreanPhone = (phone) => {
  if (!phone) return ''

  const numbers = extractNumbers(phone)
  if (!numbers) return ''

  // 숫자가 7자리 이하면 그대로 반환 (너무 짧은 경우)
  if (numbers.length <= 7) {
    return numbers
  }

  // 서울 지역번호 (02)
  if (numbers.startsWith('02')) {
    if (numbers.length === 9) {
      // 02-123-4567 (구 형식)
      return `${numbers.slice(0, 2)}-${numbers.slice(2, 5)}-${numbers.slice(5)}`
    } else if (numbers.length === 10) {
      // 02-1234-5678 (신 형식)
      return `${numbers.slice(0, 2)}-${numbers.slice(2, 6)}-${numbers.slice(6)}`
    }
  }

  // 휴대폰 번호 (010, 011, 016, 017, 018, 019)
  if (numbers.startsWith('010') || numbers.startsWith('011') || 
      numbers.startsWith('016') || numbers.startsWith('017') || 
      numbers.startsWith('018') || numbers.startsWith('019')) {
    if (numbers.length === 10) {
      // 010-123-4567 (구 형식)
      return `${numbers.slice(0, 3)}-${numbers.slice(3, 6)}-${numbers.slice(6)}`
    } else if (numbers.length === 11) {
      // 010-1234-5678 (신 형식)
      return `${numbers.slice(0, 3)}-${numbers.slice(3, 7)}-${numbers.slice(7)}`
    }
  }

  // 3자리 지역번호 (031, 032, 033, 041, 042, 043, 044, 051, 052, 053, 054, 055, 061, 062, 063, 064)
  if (numbers.length === 10 && /^0[3-6]\d/.test(numbers)) {
    // 031-123-4567
    return `${numbers.slice(0, 3)}-${numbers.slice(3, 6)}-${numbers.slice(6)}`
  } else if (numbers.length === 11 && /^0[3-6]\d/.test(numbers)) {
    // 031-1234-5678
    return `${numbers.slice(0, 3)}-${numbers.slice(3, 7)}-${numbers.slice(7)}`
  }

  // 그 외의 경우 (일반 지역번호 또는 국번 없는 번호)
  if (numbers.length === 10) {
    return `${numbers.slice(0, 3)}-${numbers.slice(3, 6)}-${numbers.slice(6)}`
  } else if (numbers.length === 11) {
    return `${numbers.slice(0, 3)}-${numbers.slice(3, 7)}-${numbers.slice(7)}`
  }

  // 형식에 맞지 않으면 숫자만 반환
  return numbers
}

/**
 * 전화번호 입력 핸들러 (실시간 포맷팅)
 * onChange 이벤트에서 사용
 */
export const handlePhoneChange = (value, setFormData, formData) => {
  // 숫자와 하이픈만 허용
  const cleaned = value.replace(/[^\d-]/g, '')
  
  // 하이픈이 너무 많으면 제거 (최대 2개만 허용)
  const parts = cleaned.split('-')
  let formatted = cleaned
  if (parts.length > 3) {
    formatted = parts.slice(0, 3).join('-')
  }

  setFormData({ ...formData, phone: formatted })
}

/**
 * 전화번호 블러 핸들러 (포커스 잃을 때 포맷팅 적용)
 * onBlur 이벤트에서 사용
 */
export const handlePhoneBlur = (value, setFormData, formData) => {
  const formatted = formatKoreanPhone(value)
  setFormData({ ...formData, phone: formatted })
}
