import { useState, useEffect } from 'react'

/**
 * 디바운스 훅
 * 입력값의 변경을 지연시켜 불필요한 재렌더링을 방지합니다.
 * @param {any} value - 디바운스할 값
 * @param {number} delay - 지연 시간 (ms, 기본값: 300)
 * @returns {any} 디바운스된 값
 */
export const useDebounce = (value, delay = 300) => {
  const [debouncedValue, setDebouncedValue] = useState(value)

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value)
    }, delay)

    return () => {
      clearTimeout(handler)
    }
  }, [value, delay])

  return debouncedValue
}
