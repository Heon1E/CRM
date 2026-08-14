import React from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

/**
 * 재사용 가능한 페이지네이션 컴포넌트
 * @param {number} totalCount - 전체 항목 수
 * @param {number} pageSize - 페이지당 항목 수
 * @param {number} currentPage - 현재 페이지 (1부터 시작)
 * @param {function} onPageChange - 페이지 변경 핸들러 (page: number) => void
 */
const Pagination = ({ totalCount, pageSize, currentPage, onPageChange }) => {
  const totalPages = Math.ceil(totalCount / pageSize)

  // 페이지가 없으면 숨김
  if (totalPages === 0) {
    return null
  }

  // 페이지 번호 배열 생성 (최대 5개 표시)
  const getPageNumbers = () => {
    const pages = []
    const maxVisible = 5

    if (totalPages <= maxVisible) {
      // 전체 페이지가 5개 이하면 모두 표시
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i)
      }
    } else {
      // 현재 페이지를 중심으로 표시
      let start = Math.max(1, currentPage - Math.floor(maxVisible / 2))
      let end = Math.min(totalPages, start + maxVisible - 1)

      // 끝에 도달했을 때 시작점 조정
      if (end - start < maxVisible - 1) {
        start = Math.max(1, end - maxVisible + 1)
      }

      for (let i = start; i <= end; i++) {
        pages.push(i)
      }
    }

    return pages
  }

  const pageNumbers = getPageNumbers()

  const handlePrev = () => {
    if (currentPage > 1) {
      onPageChange(currentPage - 1)
    }
  }

  const handleNext = () => {
    if (currentPage < totalPages) {
      onPageChange(currentPage + 1)
    }
  }

  const handlePageClick = (page) => {
    if (page !== currentPage) {
      onPageChange(page)
    }
  }

  return (
    <div className="flex items-center justify-center space-x-2 py-4 px-4 border-t" style={{ borderColor: "var(--border)" }}>
      {/* 이전 버튼 */}
      <button
        onClick={handlePrev}
        disabled={currentPage === 1}
        className={`flex items-center justify-center w-11 h-11 rounded-lg border transition-colors touch-manipulation ${
          currentPage === 1
            ? 'border-[color:var(--border)] text-[color:var(--text-muted)] cursor-not-allowed'
            : 'border-[color:var(--border)] text-[color:var(--text-secondary)] hover:bg-[color:var(--bg-subtle)]'
        }`}
        style={{ WebkitTapHighlightColor: 'transparent' }}
      >
        <ChevronLeft className="w-5 h-5" />
      </button>

      {/* 페이지 번호 */}
      <div className="flex items-center space-x-1">
        {pageNumbers[0] > 1 && (
          <>
            <button
              onClick={() => handlePageClick(1)}
              className="flex items-center justify-center w-11 h-11 rounded-lg border border-[color:var(--border)] text-[color:var(--text-secondary)] hover:bg-[color:var(--bg-subtle)] transition-colors touch-manipulation"
              style={{ WebkitTapHighlightColor: 'transparent' }}
            >
              1
            </button>
            {pageNumbers[0] > 2 && (
              <span className="px-2 text-[color:var(--text-secondary)]">...</span>
            )}
          </>
        )}

        {pageNumbers.map((page) => (
          <button
            key={page}
            onClick={() => handlePageClick(page)}
            className={`flex items-center justify-center w-11 h-11 rounded-lg border transition-colors touch-manipulation ${
              page === currentPage
                ? 'bg-[color:var(--accent)] text-white border-[color:var(--accent)] font-semibold'
                : 'border-[color:var(--border)] text-[color:var(--text-secondary)] hover:bg-[color:var(--bg-subtle)]'
            }`}
            style={{ WebkitTapHighlightColor: 'transparent' }}
          >
            {page}
          </button>
        ))}

        {pageNumbers[pageNumbers.length - 1] < totalPages && (
          <>
            {pageNumbers[pageNumbers.length - 1] < totalPages - 1 && (
              <span className="px-2 text-[color:var(--text-secondary)]">...</span>
            )}
            <button
              onClick={() => handlePageClick(totalPages)}
              className="flex items-center justify-center w-11 h-11 rounded-lg border border-[color:var(--border)] text-[color:var(--text-secondary)] hover:bg-[color:var(--bg-subtle)] transition-colors touch-manipulation"
              style={{ WebkitTapHighlightColor: 'transparent' }}
            >
              {totalPages}
            </button>
          </>
        )}
      </div>

      {/* 다음 버튼 */}
      <button
        onClick={handleNext}
        disabled={currentPage === totalPages}
        className={`flex items-center justify-center w-11 h-11 rounded-lg border transition-colors touch-manipulation ${
        currentPage === totalPages
          ? 'border-[color:var(--border)] text-[color:var(--text-muted)] cursor-not-allowed'
          : 'border-[color:var(--border)] text-[color:var(--text-secondary)] hover:bg-[color:var(--bg-subtle)]'
        }`}
        style={{ WebkitTapHighlightColor: 'transparent' }}
      >
        <ChevronRight className="w-5 h-5" />
      </button>

      {/* 페이지 정보 */}
      <div className="ml-4 text-sm text-[color:var(--text-secondary)] hidden sm:block">
        {totalCount > 0 ? (
          <>
            {((currentPage - 1) * pageSize + 1).toLocaleString()} -{' '}
            {Math.min(currentPage * pageSize, totalCount).toLocaleString()} /{' '}
            {totalCount.toLocaleString()}
          </>
        ) : (
          '0 / 0'
        )}
      </div>
    </div>
  )
}

export default Pagination


