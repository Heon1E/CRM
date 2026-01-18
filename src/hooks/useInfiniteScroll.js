import { useState, useEffect, useCallback, useRef } from 'react'

/**
 * 무한 스크롤 훅
 * @param {Array} items - 전체 아이템 배열
 * @param {number} itemsPerPage - 페이지당 아이템 수
 * @param {Object} options - 옵션 객체
 * @returns {Object} { visibleItems, hasMore, loadMore, reset }
 */
export const useInfiniteScroll = (items = [], itemsPerPage = 20, options = {}) => {
  const { threshold = 200, enabled = true } = options
  const [visibleCount, setVisibleCount] = useState(itemsPerPage)
  const containerRef = useRef(null)
  const observerRef = useRef(null)

  // 초기 로드된 아이템 수
  const visibleItems = items.slice(0, visibleCount)
  const hasMore = visibleCount < items.length

  // 더 많은 아이템 로드
  const loadMore = useCallback(() => {
    if (!hasMore) return
    setVisibleCount((prev) => Math.min(prev + itemsPerPage, items.length))
  }, [hasMore, items.length, itemsPerPage])

  // 초기화
  const reset = useCallback(() => {
    setVisibleCount(itemsPerPage)
  }, [itemsPerPage])

  // Intersection Observer를 사용한 자동 로드
  useEffect(() => {
    if (!enabled || !hasMore) return

    // 옵저버 정리
    if (observerRef.current) {
      observerRef.current.disconnect()
    }

    // 트리거 엘리먼트 생성 (컨테이너 하단에 배치)
    const triggerElement = document.createElement('div')
    triggerElement.id = 'infinite-scroll-trigger'
    triggerElement.style.height = '1px'
    triggerElement.style.width = '100%'

    // 옵저버 생성
    observerRef.current = new IntersectionObserver(
      (entries) => {
        const [entry] = entries
        if (entry.isIntersecting) {
          loadMore()
        }
      },
      {
        root: null,
        rootMargin: `${threshold}px`,
        threshold: 0.1,
      }
    )

    // 트리거 엘리먼트를 컨테이너 하단에 추가
    if (containerRef.current) {
      const existingTrigger = containerRef.current.querySelector('#infinite-scroll-trigger')
      if (existingTrigger) {
        existingTrigger.remove()
      }
      containerRef.current.appendChild(triggerElement)
      observerRef.current.observe(triggerElement)
    }

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect()
      }
      if (triggerElement && triggerElement.parentNode) {
        triggerElement.parentNode.removeChild(triggerElement)
      }
    }
  }, [enabled, hasMore, loadMore, threshold])

  // items가 변경되면 초기화
  useEffect(() => {
    if (items.length > 0 && visibleCount > items.length) {
      setVisibleCount(itemsPerPage)
    }
  }, [items.length, itemsPerPage])

  return {
    visibleItems,
    hasMore,
    loadMore,
    reset,
    containerRef,
  }
}
