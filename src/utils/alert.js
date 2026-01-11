import Swal from 'sweetalert2'
import withReactContent from 'sweetalert2-react-content'

const ReactSwal = withReactContent(Swal)

// 공통 설정
const commonConfig = {
  confirmButtonColor: '#6366f1', // indigo-500
  cancelButtonColor: '#6b7280', // gray-500
  buttonsStyling: true,
  allowOutsideClick: false,
  allowEscapeKey: true,
  customClass: {
    popup: 'rounded-lg',
    confirmButton: 'px-4 py-2 rounded-md font-medium',
    cancelButton: 'px-4 py-2 rounded-md font-medium',
    htmlContainer: 'text-left break-words whitespace-normal',
  },
}

/**
 * 성공 메시지 표시
 * @param {string} message - 표시할 메시지
 * @param {string} title - 제목 (기본: '성공')
 */
export const showSuccess = (message, title = '성공') => {
  return ReactSwal.fire({
    ...commonConfig,
    icon: 'success',
    title,
    text: message,
    confirmButtonText: '확인',
    timer: 2000,
    timerProgressBar: true,
  })
}

/**
 * 에러 메시지 표시
 * @param {string} message - 표시할 메시지
 * @param {string} title - 제목 (기본: '오류')
 */
export const showError = (message, title = '오류') => {
  return ReactSwal.fire({
    ...commonConfig,
    icon: 'error',
    title,
    text: message,
    confirmButtonText: '확인',
  })
}

/**
 * 경고 메시지 표시
 * @param {string} message - 표시할 메시지
 * @param {string} title - 제목 (기본: '경고')
 */
export const showWarning = (message, title = '경고') => {
  return ReactSwal.fire({
    ...commonConfig,
    icon: 'warning',
    title,
    text: message,
    confirmButtonText: '확인',
  })
}

/**
 * 정보 메시지 표시
 * @param {string} message - 표시할 메시지
 * @param {string} title - 제목 (기본: '알림')
 */
export const showInfo = (message, title = '알림') => {
  return ReactSwal.fire({
    ...commonConfig,
    icon: 'info',
    title,
    text: message,
    confirmButtonText: '확인',
  })
}

/**
 * 확인 대화상자 표시 (삭제 등 위험한 작업)
 * @param {string} message - 표시할 메시지
 * @param {string} title - 제목 (기본: '확인')
 * @param {string} confirmText - 확인 버튼 텍스트 (기본: '삭제')
 * @param {string} cancelText - 취소 버튼 텍스트 (기본: '취소')
 * @param {string} icon - 아이콘 타입 (기본: 'warning', 'success', 'info', 'question' 가능)
 * @param {string} confirmButtonColor - 확인 버튼 색상 (기본: '#6366f1')
 * @returns {Promise<boolean>} - 확인 시 true, 취소 시 false
 */
export const showConfirm = async (
  message,
  title = '확인',
  confirmText = '삭제',
  cancelText = '취소',
  icon = 'warning',
  confirmButtonColor = '#6366f1'
) => {
  const result = await ReactSwal.fire({
    ...commonConfig,
    icon: icon,
    title,
    text: message,
    showCancelButton: true,
    confirmButtonText: confirmText,
    cancelButtonText: cancelText,
    confirmButtonColor: confirmButtonColor,
    reverseButtons: true, // 확인 버튼을 오른쪽에 배치
    focusConfirm: false,
    focusCancel: true, // 기본 포커스를 취소 버튼에
  })

  return result.isConfirmed
}

/**
 * 입력 대화상자 표시
 * @param {string} message - 표시할 메시지
 * @param {string} title - 제목
 * @param {string} inputType - 입력 타입 (text, email, password 등)
 * @param {string} placeholder - 플레이스홀더
 * @returns {Promise<string|null>} - 입력값 또는 null (취소)
 */
export const showInput = async (
  message,
  title = '입력',
  inputType = 'text',
  placeholder = ''
) => {
  const result = await ReactSwal.fire({
    ...commonConfig,
    icon: 'question',
    title,
    text: message,
    input: inputType,
    inputPlaceholder: placeholder,
    showCancelButton: true,
    confirmButtonText: '확인',
    cancelButtonText: '취소',
  })

  return result.isConfirmed ? result.value : null
}

/**
 * 다중 줄 텍스트 입력 대화상자
 * @param {string} message - 표시할 메시지
 * @param {string} title - 제목
 * @param {string} placeholder - 플레이스홀더
 * @returns {Promise<string|null>} - 입력값 또는 null (취소)
 */
export const showTextarea = async (
  message,
  title = '입력',
  placeholder = ''
) => {
  const result = await ReactSwal.fire({
    ...commonConfig,
    icon: 'question',
    title,
    text: message,
    input: 'textarea',
    inputPlaceholder: placeholder,
    showCancelButton: true,
    confirmButtonText: '확인',
    cancelButtonText: '취소',
  })

  return result.isConfirmed ? result.value : null
}