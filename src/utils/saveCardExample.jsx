/**
 * 명함 저장 로직 사용 예시
 * 
 * 이 파일은 참고용 예시입니다.
 * 실제 컴포넌트에 아래 코드를 적용하세요.
 */

import { saveCardToCRM } from './supabaseAPI'
import { showSuccess, showError, showConfirm } from './alert'

/**
 * 예시 1: 기본 저장 (중복 체크 포함)
 */
export const handleSaveBasic = async (ocrResult, setLoading) => {
  // 1. 저장 중 상태 표시
  setLoading(true)

  try {
    // 2. 저장 함수 호출 (ocrResult는 Gemini가 분석한 데이터)
    const result = await saveCardToCRM(ocrResult)

    if (result.success) {
      showSuccess('저장 완료! 🎉')
      return { success: true, data: result.data }
    } else if (result.isDuplicate) {
      // 중복일 경우 선택권 주기
      const confirmed = await showConfirm(
        `${result.message}\n그래도 새로 등록하시겠습니까?`,
        '중복 거래처 발견',
        '등록',
        '취소',
        'warning'
      )

      if (confirmed) {
        // 강제 저장 (forceSave 옵션 사용)
        const forceResult = await saveCardToCRM(ocrResult, { forceSave: true })
        if (forceResult.success) {
          showSuccess('저장 완료! 🎉')
          return { success: true, data: forceResult.data }
        } else {
          showError(`저장 실패: ${forceResult.message}`)
          return { success: false }
        }
      } else {
        // 사용자가 취소
        return { success: false, cancelled: true }
      }
    } else {
      showError(`저장 실패: ${result.message}`)
      return { success: false }
    }
  } catch (error) {
    console.error('[저장 오류]', error)
    showError('저장 중 오류가 발생했습니다.')
    return { success: false }
  } finally {
    setLoading(false)
  }
}

/**
 * 예시 2: BusinessCardScannerModal에 통합하는 방법
 * 
 * 분석 결과를 받은 후, 사용자가 [저장] 버튼을 눌렀을 때:
 */
export const handleSaveInModal = async (extractedInfo, onClose, onSuccess) => {
  // extractedInfo는 extractBusinessCardInfo()의 반환값
  // { company, contact_person, position, phone, email, address }

  const result = await saveCardToCRM(extractedInfo)

  if (result.success) {
    showSuccess('명함이 성공적으로 저장되었습니다!')
    if (onSuccess) onSuccess(result.data)
    if (onClose) onClose()
  } else if (result.isDuplicate) {
    // 중복 확인 다이얼로그
    const confirmed = await showConfirm(
      `${result.message}\n그래도 새로 등록하시겠습니까?`,
      '중복 거래처 발견',
      '등록',
      '취소',
      'warning'
    )

    if (confirmed) {
      // 강제 저장
      const forceResult = await saveCardToCRM(extractedInfo, { forceSave: true })
      if (forceResult.success) {
        showSuccess('명함이 성공적으로 저장되었습니다!')
        if (onSuccess) onSuccess(forceResult.data)
        if (onClose) onClose()
      } else {
        showError(`저장 실패: ${forceResult.message}`)
      }
    }
  } else {
    showError(`저장 실패: ${result.message}`)
  }
}

/**
 * 예시 3: React 컴포넌트 내에서 사용
 * 
 * const MyComponent = () => {
 *   const [loading, setLoading] = useState(false)
 *   const [ocrResult, setOcrResult] = useState(null)
 * 
 *   const handleSave = async () => {
 *     if (!ocrResult) return
 *     
 *     setLoading(true)
 *     const result = await saveCardToCRM(ocrResult)
 *     setLoading(false)
 * 
 *     if (result.success) {
 *       showSuccess('저장 완료!')
 *       setOcrResult(null) // 폼 초기화
 *     } else if (result.isDuplicate) {
 *       const confirmed = await showConfirm(
 *         `${result.message}\n그래도 새로 등록하시겠습니까?`
 *       )
 *       if (confirmed) {
 *         const forceResult = await saveCardToCRM(ocrResult, { forceSave: true })
 *         if (forceResult.success) {
 *           showSuccess('저장 완료!')
 *           setOcrResult(null)
 *         }
 *       }
 *     } else {
 *       showError(`저장 실패: ${result.message}`)
 *     }
 *   }
 * 
 *   return (
 *     <div>
 *       {ocrResult && (
 *         <button onClick={handleSave} disabled={loading}>
 *           {loading ? '저장 중...' : '저장'}
 *         </button>
 *       )}
 *     </div>
 *   )
 * }
 */
