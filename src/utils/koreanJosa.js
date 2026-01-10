/**
 * 한국어 조사(Josa) 처리 유틸리티
 * 받침 유무에 따라 올바른 조사를 자동으로 선택합니다.
 */

/**
 * 한글 문자의 받침 유무를 확인합니다.
 * @param {string} char - 확인할 문자 (한 글자)
 * @returns {boolean} - 받침이 있으면 true, 없으면 false
 */
const hasJongseong = (char) => {
  if (!char || typeof char !== 'string') return false
  
  const code = char.charCodeAt(0)
  // 한글 유니코드 범위: 0xAC00 (가) ~ 0xD7A3 (힣)
  if (code < 0xAC00 || code > 0xD7A3) return false
  
  // (문자코드 - 0xAC00) % 28이 0이면 받침 없음, 아니면 받침 있음
  return (code - 0xAC00) % 28 !== 0
}

/**
 * 단어의 마지막 글자의 받침 유무를 확인합니다.
 * @param {string} word - 확인할 단어
 * @returns {boolean} - 마지막 글자에 받침이 있으면 true, 없으면 false
 */
const hasLastJongseong = (word) => {
  if (!word || typeof word !== 'string' || word.length === 0) return false
  
  const lastChar = word[word.length - 1]
  return hasJongseong(lastChar)
}

/**
 * 조사 타입에 따라 올바른 조사를 반환합니다.
 * @param {string} word - 조사를 붙일 단어
 * @param {string} type - 조사 타입 ('와과' | '이가' | '을를' | '은는' 등)
 * @returns {string} - 올바른 조사
 */
export const getParticle = (word, type) => {
  if (!word || typeof word !== 'string' || word.length === 0) {
    // 기본값 반환
    switch (type) {
      case '와과': return '와'
      case '이가': return '가'
      case '을를': return '를'
      case '은는': return '는'
      default: return ''
    }
  }
  
  const hasJong = hasLastJongseong(word)
  
  switch (type) {
    case '와과':
      return hasJong ? '과' : '와'
    case '이가':
      return hasJong ? '이' : '가'
    case '을를':
      return hasJong ? '을' : '를'
    case '은는':
      return hasJong ? '은' : '는'
    default:
      return ''
  }
}

/**
 * 참석자 이름에서 중복된 거래처명을 제거합니다 (Smart Cleaning).
 * @param {string} attendeeName - 참석자 이름
 * @param {string} clientName - 거래처 이름
 * @returns {string} - 정제된 참석자 이름
 */
const cleanAttendeeName = (attendeeName, clientName) => {
  if (!attendeeName || !clientName) return attendeeName || ''
  
  const attendee = attendeeName.trim()
  const client = clientName.trim()
  
  // 외부 참석자: 이름 앞에 거래처명이 반복되면 제거
  if (attendee.startsWith(client)) {
    const cleaned = attendee.substring(client.length).trim()
    // 공백이나 특수문자로 시작하면 제거
    return cleaned.replace(/^[\s\-_\.]+/, '').trim() || attendee
  }
  
  return attendee
}

/**
 * 내부 참석자 이름에서 회사명을 제거합니다.
 * @param {string} attendeeName - 참석자 이름
 * @returns {string} - 정제된 참석자 이름
 */
const cleanInternalAttendeeName = (attendeeName) => {
  if (!attendeeName) return ''
  
  const attendee = attendeeName.trim()
  const companyNames = ['아이앤디', 'I&D', 'I&N', 'I&N디', '아이앤디주식회사', '아이앤디(주)']
  
  for (const company of companyNames) {
    if (attendee.includes(company)) {
      // 회사명 제거
      let cleaned = attendee.replace(new RegExp(company, 'gi'), '').trim()
      // 공백이나 특수문자로 시작하면 제거
      cleaned = cleaned.replace(/^[\s\-_\.]+/, '').trim()
      return cleaned || attendee
    }
  }
  
  return attendee
}

/**
 * 영업 활동 문구를 생성합니다 (거래처 중심, 중복 제거 적용).
 * 형식: "[거래처명]의 [정제된_외부참석자]와 [활동종류]"
 * @param {string} clientName - 거래처 이름
 * @param {string|Array} attendees - 참석자 (문자열 또는 배열, 현재는 user 필드에 모두 저장)
 * @param {string} activityType - 활동 유형
 * @returns {string} - 생성된 문구
 */
export const formatActivityText = (clientName, attendees = '', activityType = '활동') => {
  const client = clientName || '알 수 없음'
  const type = activityType || '활동'
  
  // 참석자 처리 (문자열 또는 배열)
  let attendeeList = []
  if (Array.isArray(attendees)) {
    attendeeList = attendees.filter(name => name && name.trim() && name.trim() !== '알 수 없음')
  } else if (typeof attendees === 'string' && attendees.trim()) {
    attendeeList = attendees.split(',').map(name => name.trim()).filter(name => name && name !== '알 수 없음')
  }
  
  // 아이앤디 관련 이름 필터링 (우리 회사 이름은 제외)
  const companyNames = ['아이앤디', 'I&D', 'I&N', 'I&N디', '아이앤디주식회사', '아이앤디(주)']
  let externalList = attendeeList.filter(name => !companyNames.some(company => name.toLowerCase().includes(company.toLowerCase())))
  let internalList = attendeeList.filter(name => companyNames.some(company => name.toLowerCase().includes(company.toLowerCase())))
  
  // Smart Cleaning: 외부 참석자 이름에서 거래처명 중복 제거
  externalList = externalList.map(name => cleanAttendeeName(name, client))
  
  // Smart Cleaning: 내부 참석자 이름에서 회사명 제거
  internalList = internalList.map(name => cleanInternalAttendeeName(name))
  
  // 문구 생성: "[거래처명]의 [정제된_외부참석자]와 [활동종류]"
  let text = `${client}의`
  
  // 외부 참석자가 있으면 추가
  if (externalList.length > 0 && externalList[0]) {
    const firstExternal = externalList[0]
    const josa = getParticle(firstExternal, '와과')
    text += ` ${firstExternal}${josa}`
    if (externalList.length > 1) {
      text += ` 외 ${externalList.length - 1}명`
    }
  }
  
  // 활동 종류 추가
  text += ` ${type}`
  
  // 내부 참석자가 있으면 추가 (정제된 이름 사용)
  if (internalList.length > 0 && internalList[0]) {
    text += ` (내부참석자: ${internalList.join(', ')})`
  }
  
  return text
}

/**
 * 활동 내용에서 핵심 요약을 추출합니다.
 * @param {string} description - 활동 내용
 * @returns {string} - 핵심 요약 (최대 30자)
 */
const extractCoreSummary = (description = '') => {
  if (!description || !description.trim()) return ''
  
  const content = description.trim()
  
  // 1순위: 대괄호 키워드가 있으면 그 문장을 우선 추출
  const bracketKeywords = ['[결론]', '[핵심]', '[이슈]', '[결과]', '[요약]']
  for (const keyword of bracketKeywords) {
    const keywordIndex = content.indexOf(keyword)
    if (keywordIndex !== -1) {
      // 키워드 이후의 문장 추출
      let afterKeyword = content.substring(keywordIndex + keyword.length).trim()
      // 첫 번째 줄 또는 첫 번째 마침표까지
      const firstLine = afterKeyword.split('\n')[0]
      const firstSentence = firstLine.split('.')[0]
      const summary = firstSentence.trim()
      if (summary) {
        return summary.length > 30 ? summary.substring(0, 30) + '...' : summary
      }
    }
  }
  
  // 2순위: 첫 번째 줄(엔터 전까지) 또는 첫 번째 마침표까지의 문장을 추출
  const firstLine = content.split('\n')[0].trim()
  const firstSentence = firstLine.split('.')[0].trim()
  if (firstSentence) {
    return firstSentence.length > 30 ? firstSentence.substring(0, 30) + '...' : firstSentence
  }
  
  // 3순위: 앞 30글자만 자르고 '...' 붙임
  return content.length > 30 ? content.substring(0, 30) + '...' : content
}

/**
 * 영업 활동 리스트 제목을 생성합니다.
 * 형식: "[거래처명] - [핵심요약]" (활동 종류는 제목에서 제거, 뱃지로만 표시)
 * @param {string} clientName - 거래처 이름
 * @param {string} description - 활동 내용
 * @returns {string} - 생성된 제목
 */
export const formatActivityTitle = (clientName, description = '') => {
  const client = clientName || '알 수 없음'
  const summary = extractCoreSummary(description)
  return summary ? `${client} - ${summary}` : client
}


