import Swal from 'sweetalert2'
import withReactContent from 'sweetalert2-react-content'

const ReactSwal = withReactContent(Swal)

// 공통 설정 (Light Theme)
/*
 * **경고·확인 창의 단추도 브랜드 색이다.**
 * sweetalert2 기본값(인디고 #4F46E5)이 그대로 남아 있었다. 앱 안의 파랑·보라를
 * 전부 치웠는데 이것만 라이브러리 설정이라 빠져 있었다 — '저장하시겠습니까',
 * '삭제하시겠습니까'는 하루에 몇 번씩 보는 창이다.
 * 값은 `index.css`의 `--accent`(#007538)와 같다.
 */
const BRAND = '#007538'
const BRAND_DARK = '#005c2b'

const commonConfig = {
  confirmButtonColor: BRAND,
  cancelButtonColor: '#FFFFFF', // White
  background: '#FFFFFF',
  color: '#1E293B', // Slate-800
  buttonsStyling: true,
  allowOutsideClick: false,
  allowEscapeKey: true,
  customClass: {
    popup: 'rounded-xl border border-slate-100 shadow-xl', // Soft shadow & borders
    title: 'text-xl font-bold text-slate-900',
    confirmButton: 'px-5 py-2.5 rounded-lg font-bold text-sm shadow-sm transition-colors',
    cancelButton: 'px-5 py-2.5 rounded-lg font-bold text-sm text-slate-600 border border-slate-200 hover:bg-slate-50 transition-colors', // Outlined style
    htmlContainer: 'text-sm text-slate-600 leading-relaxed text-center', // Clean text
    actions: 'gap-3 mt-4',
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
 * @param {string} confirmButtonColor - 확인 버튼 색상 (기본: 브랜드 초록)
 * @returns {Promise<boolean>} - 확인 시 true, 취소 시 false
 */
/*
 * 확인 창.
 *
 * **확인 단추의 기본이 '삭제'였다.** 그래서 지우는 것이 아닌 자리에서도
 * '삭제'가 떴다 — 채권 '제외 해제'(되돌리는 것)와 견적서·발주서 '편집 취소'
 * (닫기만 하는 것)가 그랬다. 누르는 사람은 무엇이 지워지는 줄 안다.
 *
 * 기본을 중립으로 두고 **지우는 자리에서만 '삭제'를 넘긴다.** 잊어도 틀린
 * 말이 뜨지는 않는다 — 이 저장소가 늘 쓰는 방식이다(빠뜨릴 수 있는 것은
 * 기본값이 안전해야 한다).
 */
export const showConfirm = async (
  message,
  title = '확인',
  confirmText = '확인',
  cancelText = '취소',
  icon = 'warning',
  confirmButtonColor = BRAND
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
 * HTML 본문을 가진 확인 대화상자 (대사 미리보기처럼 표·목록을 보여줘야 할 때)
 * @param {string} html - 본문 HTML
 * @param {string} title - 제목
 * @param {string} confirmText - 확인 버튼 텍스트
 * @param {string} cancelText - 취소 버튼 텍스트
 * @returns {Promise<boolean>} 확인 시 true
 */
export const showHtmlConfirm = async (
  html,
  title = '확인',
  confirmText = '적용',
  cancelText = '취소'
) => {
  const result = await ReactSwal.fire({
    ...commonConfig,
    title,
    html,
    width: 640,
    showCancelButton: true,
    confirmButtonText: confirmText,
    cancelButtonText: cancelText,
    reverseButtons: true,
    focusConfirm: false,
    focusCancel: true,
    customClass: {
      ...commonConfig.customClass,
      htmlContainer: 'text-sm text-slate-600 leading-relaxed text-left',
    },
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
