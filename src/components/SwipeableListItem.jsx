import React, { useState, useRef, useEffect } from 'react'
import { Edit, Trash2 } from 'lucide-react'

/**
 * 스와이프 가능한 리스트 항목 컴포넌트
 * 
 * @param {Object} props
 * @param {React.ReactNode} props.children - 리스트 항목 내용
 * @param {Function} props.onEdit - 수정 버튼 클릭 핸들러
 * @param {Function} props.onDelete - 삭제 버튼 클릭 핸들러
 * @param {boolean} props.enabled - 스와이프 활성화 여부 (기본값: true)
 */
const SwipeableListItem = ({
  children,
  onEdit,
  onDelete,
  enabled = true,
  editLabel = '수정',
  deleteLabel = '삭제'
}) => {
  const [translateX, setTranslateX] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const [startX, setStartX] = useState(0)
  const [startY, setStartY] = useState(0)
  const [currentX, setCurrentX] = useState(0)
  const containerRef = useRef(null)

  // 액션 버튼 전체 너비 계산 (수정 + 삭제)
  const actionWidth = (onEdit ? 80 : 0) + (onDelete ? 80 : 0)

  // 터치 시작
  const handleTouchStart = (e) => {
    if (!enabled) return
    const touch = e.touches[0]
    setStartX(touch.clientX)
    setStartY(touch.clientY)
    setCurrentX(touch.clientX)
    setIsDragging(false) // 초기에는 드래깅이 아님
  }

  // 터치 이동
  const handleTouchMove = (e) => {
    if (!enabled) return

    const touch = e.touches[0]
    const diffX = touch.clientX - startX
    const diffY = Math.abs(touch.clientY - startY)

    // 가로 이동이 세로 이동보다 크면 스와이프로 인식 (10px 이상 차이)
    if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 10) {
      setIsDragging(true)
      e.preventDefault() // 가로 스와이프일 때만 스크롤 방지

      // 왼쪽으로 스와이프만 허용 (오른쪽은 제한)
      if (diffX < 0) {
        const newTranslateX = Math.max(-actionWidth, diffX)
        setTranslateX(newTranslateX)
      } else if (translateX < 0) {
        // 이미 열려있을 때 오른쪽으로 스와이프하면 닫기
        const newTranslateX = Math.min(0, translateX + diffX)
        setTranslateX(newTranslateX)
      }
    } else if (Math.abs(diffY) > Math.abs(diffX) && Math.abs(diffY) > 10) {
      // 세로 스크롤이 더 크면 스와이프 취소
      setIsDragging(false)
    }

    setCurrentX(touch.clientX)
  }

  // 터치 종료
  const handleTouchEnd = () => {
    if (!enabled) return

    // 스와이프 거리에 따라 열기/닫기 결정
    const threshold = actionWidth * 0.3 // 30% 이상 스와이프하면 열기
    if (translateX < -threshold) {
      setTranslateX(-actionWidth) // 완전히 열기
    } else {
      setTranslateX(0) // 닫기
    }

    setIsDragging(false)
    setStartX(0)
    setStartY(0)
    setCurrentX(0)
  }

  // 마우스 이벤트 지원 (데스크톱 테스트용)
  const handleMouseDown = (e) => {
    if (!enabled) return
    setIsDragging(true)
    setStartX(e.clientX)
    setCurrentX(e.clientX)
  }

  const handleMouseMove = (e) => {
    if (!enabled || !isDragging) return
    const diffX = e.clientX - startX
    setCurrentX(e.clientX)

    if (diffX < 0) {
      const newTranslateX = Math.max(-actionWidth, diffX)
      setTranslateX(newTranslateX)
    } else if (translateX < 0) {
      const newTranslateX = Math.min(0, translateX + diffX)
      setTranslateX(newTranslateX)
    }
  }

  const handleMouseUp = () => {
    if (!enabled || !isDragging) return
    handleTouchEnd()
  }

  // 마우스가 컨테이너 밖으로 나갔을 때 (전역 이벤트 리스너)
  useEffect(() => {
    if (!isDragging) return

    const handleGlobalMouseMove = (e) => {
      if (isDragging) {
        handleMouseMove(e)
      }
    }
    const handleGlobalMouseUp = () => {
      if (isDragging) {
        handleMouseUp()
      }
    }

    document.addEventListener('mousemove', handleGlobalMouseMove)
    document.addEventListener('mouseup', handleGlobalMouseUp)

    return () => {
      document.removeEventListener('mousemove', handleGlobalMouseMove)
      document.removeEventListener('mouseup', handleGlobalMouseUp)
    }
  }, [isDragging])

  // 액션 버튼 클릭 시 닫기
  const handleActionClick = (action) => {
    setTranslateX(0)
    if (action === 'edit' && onEdit) {
      onEdit()
    } else if (action === 'delete' && onDelete) {
      onDelete()
    }
  }

  // 액션이 없으면 스와이프 비활성화
  if (!enabled || actionWidth === 0) {
    return <div>{children}</div>
  }

  return (
    <div
      ref={containerRef}
      className="relative overflow-hidden touch-manipulation"
      style={{ WebkitTapHighlightColor: 'transparent' }}
    >
      {/* 액션 버튼 (배경) */}
      <div
        className="absolute top-0 right-0 bottom-0 flex transition-opacity duration-200"
        style={{
          width: `${actionWidth}px`,
          zIndex: 1,
          opacity: translateX !== 0 || isDragging ? 1 : 0
        }}
      >
        {onEdit && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              handleActionClick('edit')
            }}
            className="flex-1 bg-slate-100 text-slate-600 border border-slate-200 hover:bg-slate-200 flex items-center justify-center font-medium transition-colors touch-manipulation"
            style={{ minWidth: '80px', minHeight: '44px', WebkitTapHighlightColor: 'transparent' }}
            aria-label={editLabel}
          >
            <Edit className="w-5 h-5" />
          </button>
        )}
        {onDelete && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              handleActionClick('delete')
            }}
            className="flex-1 bg-red-50 hover:bg-red-100 flex items-center justify-center text-red-500 font-medium transition-colors touch-manipulation border border-red-100"
            style={{ minWidth: '80px', minHeight: '44px', WebkitTapHighlightColor: 'transparent' }}
            aria-label={deleteLabel}
          >
            <Trash2 className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* 리스트 항목 (앞면) */}
      <div
        className="relative bg-transparent transition-transform duration-300 ease-out"
        style={{
          transform: `translateX(${translateX}px)`,
          touchAction: isDragging ? 'none' : 'pan-y pan-x', // 드래그 중이 아닐 때만 스크롤 허용
          zIndex: 2,
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onMouseDown={handleMouseDown}
      >
        {children}
      </div>
    </div>
  )
}

export default SwipeableListItem



