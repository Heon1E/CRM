import { useEffect, useRef } from 'react'

/**
 * 전역 엔터 네비게이션 훅
 * 폼 내부의 모든 입력 필드에서 Enter 키를 누르면 다음 필드로 자동 이동
 * 
 * @param {Object} options - 설정 옵션
 * @param {React.RefObject} options.formRef - 폼 요소의 ref
 * @param {boolean} options.enabled - 훅 활성화 여부 (기본값: true)
 * @param {Array<string>} options.skipSelectors - 건너뛸 선택자 목록 (예: ['textarea', '.combobox-input'])
 */
const useEnterMove = ({ formRef, enabled = true, skipSelectors = ['textarea'] }) => {
  const isHandlingRef = useRef(false)

  useEffect(() => {
    if (!enabled || !formRef?.current) return

    const form = formRef.current

    // 건너뛸 선택자들을 포함한 선택자 생성
    const skipSelector = skipSelectors.length > 0 
      ? `:not(${skipSelectors.map(s => s.startsWith('.') || s.startsWith('#') ? s : s).join('):not(')})`
      : ''

    // 폼 내부의 모든 입력 가능한 요소 찾기
    const getFormElements = () => {
      // 기본 선택자 (skipSelector는 CSS 선택자로 직접 사용 불가하므로 필터링으로 처리)
      const allInputs = Array.from(form.querySelectorAll('input, select, button[type="submit"], button[type="button"]:not([data-skip-enter])'))
      
      return allInputs.filter(el => {
        // 숨겨진 요소, disabled 요소 제외
        if (el.offsetParent === null || el.disabled) return false
        
        // Combobox 내부 input은 제외 (Combobox가 자체적으로 처리)
        if (el.closest('[data-combobox]')) return false
        
        // skipSelectors에 해당하는 요소 제외
        for (const selector of skipSelectors) {
          if (selector.startsWith('.') || selector.startsWith('#')) {
            // 클래스나 ID 선택자
            if (el.matches(selector) || el.closest(selector)) return false
          } else if (selector.includes(' ')) {
            // 복합 선택자 (예: '[data-combobox] input')
            if (el.closest(selector.split(' ')[0]) && el.matches(selector.split(' ').slice(1).join(' '))) return false
          } else {
            // 태그명 (예: 'textarea')
            if (el.tagName.toLowerCase() === selector.toLowerCase()) return false
          }
        }
        
        return true
      })
    }

    const handleKeyDown = (e) => {
      // Enter 키가 아니면 무시
      if (e.key !== 'Enter') return

      // 이미 처리 중이면 무시 (중복 방지)
      if (isHandlingRef.current) return

      // textarea는 Shift+Enter가 아니면 줄바꿈 허용
      if (e.target.tagName === 'TEXTAREA') {
        if (!e.shiftKey) {
          // Shift 없이 Enter를 누르면 다음 필드로 이동
          e.preventDefault()
          moveToNextField(e.target)
        }
        // Shift+Enter는 기본 동작(줄바꿈) 허용
        return
      }

      // Combobox 내부 input은 Combobox가 처리하도록 허용
      if (e.target.closest('[data-combobox]')) {
        // Combobox가 Enter를 처리하지 않으면 다음 필드로 이동
        // 이는 Combobox 컴포넌트에서 e.preventDefault()를 호출하지 않았을 때를 의미
        setTimeout(() => {
          if (!isHandlingRef.current) {
            moveToNextField(e.target)
          }
        }, 50)
        return
      }

      // 기본 제출 동작 방지
      e.preventDefault()

      // 다음 필드로 이동
      moveToNextField(e.target)
    }

    const moveToNextField = (currentElement) => {
      isHandlingRef.current = true

      try {
        const elements = getFormElements()
        const currentIndex = elements.indexOf(currentElement)

        if (currentIndex === -1) {
          // 현재 요소를 찾을 수 없으면 폼 제출
          submitForm()
          return
        }

        // 다음 요소 찾기
        let nextIndex = currentIndex + 1

        // 다음 요소가 없거나 마지막 입력 필드이면 폼 제출
        if (nextIndex >= elements.length) {
          submitForm()
          return
        }

        // 다음 요소가 버튼이면 폼 제출
        const nextElement = elements[nextIndex]
        if (nextElement.tagName === 'BUTTON' && nextElement.type === 'submit') {
          submitForm()
          return
        }

        // 다음 요소로 포커스 이동
        nextElement.focus()
        
        // input이나 textarea면 텍스트 선택
        if (nextElement.tagName === 'INPUT' && nextElement.type !== 'checkbox' && nextElement.type !== 'radio') {
          nextElement.select?.()
        }
      } finally {
        // 짧은 딜레이 후 플래그 리셋 (Combobox 등 다른 컴포넌트의 이벤트 처리 대기)
        setTimeout(() => {
          isHandlingRef.current = false
        }, 100)
      }
    }

    const submitForm = () => {
      const submitButton = form.querySelector('button[type="submit"]')
      if (submitButton && !submitButton.disabled) {
        // 폼 제출 이벤트 발생
        const submitEvent = new Event('submit', {
          bubbles: true,
          cancelable: true,
        })
        form.dispatchEvent(submitEvent)
      }
    }

    // 폼 내부의 모든 입력 요소에 이벤트 리스너 추가
    const elements = getFormElements()
    elements.forEach((element) => {
      element.addEventListener('keydown', handleKeyDown)
    })

    // cleanup
    return () => {
      elements.forEach((element) => {
        element.removeEventListener('keydown', handleKeyDown)
      })
    }
  }, [enabled, formRef, skipSelectors])
}

export default useEnterMove

