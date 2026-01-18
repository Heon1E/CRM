import React, { useState, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Edit, Download, Loader2, Search } from 'lucide-react'
import { useData } from '../contexts/DataContext'
import EditActivityModal from '../components/EditActivityModal'
import AddActivityModal from '../components/AddActivityModal'
import SwipeableListItem from '../components/SwipeableListItem'
import { exportActivitiesToExcel } from '../utils/excelExport'
import { formatActivityTitle, formatActivityText } from '../utils/koreanJosa'
import { useInfiniteScroll } from '../hooks/useInfiniteScroll'
import { showError, showConfirm } from '../utils/alert'

const Activities = () => {
  // 모든 Hook 선언을 최상단에 배치 (React Hooks 규칙 준수)
  const { activities, loading, updateActivity, deleteActivity } = useData()
  const [searchParams] = useSearchParams()
  const [editingActivityId, setEditingActivityId] = useState(null)
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')

  // 쿼리 파라미터에서 status 필터 가져오기
  const statusFilter = searchParams.get('status')

  // 상태 + 거래처 검색 필터링 적용 (useMemo로 최적화)
  const filteredActivities = useMemo(() => {
    const allActivities = activities || []
    const statusFiltered = statusFilter
      ? allActivities.filter((activity) => activity.status === statusFilter)
      : allActivities

    if (!searchTerm.trim()) {
      return statusFiltered
    }

    const term = searchTerm.toLowerCase().trim()
    return statusFiltered.filter((activity) => {
      const clientName = activity.clientName || activity.client_name || activity.company || ''
      return clientName.toLowerCase().includes(term)
    })
  }, [activities, statusFilter, searchTerm])

  // 날짜별로 그룹화 (useMemo로 최적화)
  const groupedActivities = useMemo(() => {
    return filteredActivities.reduce((acc, activity) => {
      const date = activity.activity_date || activity.date
      if (!acc[date]) {
        acc[date] = []
      }
      acc[date].push(activity)
      return acc
    }, {})
  }, [filteredActivities])

  // 날짜 내림차순 정렬 (useMemo로 최적화)
  const sortedDates = useMemo(() => {
    return Object.keys(groupedActivities).sort((a, b) => {
      return new Date(b) - new Date(a)
    })
  }, [groupedActivities])

  // 무한 스크롤을 위한 평탄화된 활동 목록
  const flattenedActivities = useMemo(() => {
    const flat = []
    sortedDates.forEach((date) => {
      const dateActivities = groupedActivities[date]
      dateActivities.forEach((activity) => {
        flat.push({ ...activity, _dateKey: date }) // 날짜 키를 함께 저장
      })
    })
    return flat
  }, [sortedDates, groupedActivities])

  // 무한 스크롤 훅 사용
  const { visibleItems, hasMore, containerRef } = useInfiniteScroll(
    flattenedActivities,
    30, // 페이지당 30개 (활동은 더 많이 표시)
    { threshold: 100, enabled: !loading }
  )

  // 표시할 그룹 복원 (무한 스크롤에 맞게)
  const visibleGroupedActivities = useMemo(() => {
    const grouped = {}
    visibleItems.forEach((activity) => {
      const date = activity._dateKey || activity.activity_date || activity.date
      if (!grouped[date]) {
        grouped[date] = []
      }
      grouped[date].push(activity)
    })
    return grouped
  }, [visibleItems])

  // 표시할 날짜 목록
  const visibleDates = useMemo(() => {
    return Object.keys(visibleGroupedActivities).sort((a, b) => {
      return new Date(b) - new Date(a)
    })
  }, [visibleGroupedActivities])

  // Guard Clause: 모든 Hook 선언이 끝난 후에 조기 리턴
  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-gray-300">데이터를 불러오는 중...</div>
      </div>
    )
  }

  const getTypeColor = (type) => {
    switch (type) {
      case '미팅':
      case '제안서':
      case '전화':
      case '계약':
      case '견적':
      case '이메일':
      default:
        return 'bg-white/5 text-gray-300 border border-gray-800'
    }
  }

  const getStatusColor = (status) => {
    return status === '완료'
      ? 'bg-emerald-400/10 text-emerald-300 border border-emerald-400/30'
      : 'bg-amber-400/10 text-amber-300 border border-amber-400/30'
  }

  const handleExport = () => {
    exportActivitiesToExcel(activities)
  }

  // 빠른 상태 변경 (Toggle)
  const handleStatusToggle = async (activity) => {
    const newStatus = activity.status === '완료' ? '진행중' : '완료'
    try {
      await updateActivity(activity.id, {
        ...activity,
        status: newStatus,
      })
    } catch (error) {
      console.error('상태 변경 중 오류:', error)
      await showError('상태 변경 중 오류가 발생했습니다.')
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <p className="text-gray-300 text-[11px] font-bold uppercase tracking-[0.15em] mb-1">Overview</p>
          <h1 className="text-2xl md:text-3xl font-semibold text-white">영업 활동</h1>
          <p className="text-gray-300 mt-1.5 text-sm md:text-base">
            {statusFilter ? `'${statusFilter}' 상태: ` : '총 '}
            {filteredActivities.length}건의 활동 기록
            {(statusFilter || searchTerm.trim()) && ` (전체 ${activities.length}건 중)`}
          </p>
        </div>
        <div className="flex items-center space-x-3 w-full sm:w-auto">
          <button
            onClick={handleExport}
            className="btn-secondary flex-1 sm:flex-none flex items-center justify-center space-x-2 touch-manipulation min-h-[44px] px-4 py-3"
            style={{ WebkitTapHighlightColor: 'transparent' }}
          >
            <Download className="w-4 h-4" />
            <span>엑셀 다운로드</span>
          </button>
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="btn-primary flex-1 sm:flex-none flex items-center justify-center space-x-2 touch-manipulation min-h-[44px] px-4 py-3"
            style={{ WebkitTapHighlightColor: 'transparent' }}
          >
            <span>+</span>
            <span>활동 추가</span>
          </button>
        </div>
      </div>

      {/* Search Bar */}
      <div className="card p-4 md:p-5 bg-[#1E1E1E] border-gray-800">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-300 w-5 h-5 pointer-events-none" />
          <input
            type="text"
            placeholder="거래처 검색..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="input-field w-full pl-10 pr-4 py-3 text-base md:text-base touch-manipulation min-h-[44px]"
            style={{ fontSize: '16px', WebkitTapHighlightColor: 'transparent' }}
          />
        </div>
      </div>

      <div className="card p-6 bg-[#1E1E1E] border-gray-800">
        <div className="relative" ref={containerRef}>
          {/* Timeline */}
          {visibleDates.length > 0 ? (
            visibleDates.map((date, dateIndex) => {
              const dateActivities = visibleGroupedActivities[date]
              return (
                <div key={date} className={dateIndex > 0 ? 'mt-8' : ''}>
                  {/* Date Header */}
                  <div className="flex items-center mb-5">
                    <div className="flex-1 border-t border-gray-800"></div>
                    <div className="px-4">
                      <span className="text-xs font-semibold text-gray-300 bg-[#1E1E1E] border border-gray-800 px-3 py-1.5 rounded-full">
                        {new Date(date).toLocaleDateString('ko-KR', {
                          month: 'long',
                          day: 'numeric',
                          weekday: 'short',
                        })}
                      </span>
                    </div>
                    <div className="flex-1 border-t border-gray-800"></div>
                  </div>

                  {/* Activities */}
                  <div className="space-y-4">
                    {dateActivities.map((activity, index) => (
                      <div key={activity.id} className="flex items-start space-x-4">
                        {/* Timeline Line */}
                        <div className="flex flex-col items-center">
                          <div className="w-3 h-3 bg-zinc-400/40 rounded-full border-2 border-[#1E1E1E] shadow-subtle"></div>
                          {index < dateActivities.length - 1 && (
                            <div className="w-0.5 h-full bg-gray-800 mt-2"></div>
                          )}
                        </div>

                        {/* Activity Content with Swipe */}
                        <div className="flex-1">
                          <SwipeableListItem
                            onEdit={() => setEditingActivityId(activity.id)}
                            onDelete={async () => {
                              const confirmed = await showConfirm(
                                '이 활동 기록이 영구적으로 삭제됩니다.',
                                '정말 삭제하시겠습니까?',
                                '삭제',
                                '취소'
                              )
                              if (confirmed) {
                                try {
                                  await deleteActivity(activity.id)
                                } catch (error) {
                                  console.error('활동 삭제 중 오류:', error)
                                  await showError('삭제 중 오류가 발생했습니다.')
                                }
                              }
                            }}
                            enabled={true}
                          >
                            <div className="bg-[#1E1E1E] border border-gray-800 rounded-lg p-4 md:p-5 hover:bg-white/5 hover:border-gray-700 transition-all duration-200">
                              <div className="flex items-start justify-between">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center space-x-2 mb-3 flex-wrap gap-2">
                                    <span
                                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${getTypeColor(
                                        activity.type
                                      )}`}
                                    >
                                      {activity.type}
                                    </span>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        handleStatusToggle(activity)
                                      }}
                                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-all touch-manipulation min-h-[44px] ${getStatusColor(
                                        activity.status
                                      )}`}
                                      title="클릭하여 상태 변경"
                                      style={{ minWidth: '44px', WebkitTapHighlightColor: 'transparent' }}
                                    >
                                      {activity.status}
                                    </button>
                                  </div>
                                  {/* 거래처 중심 제목: [거래처] - [핵심요약] */}
                                  <div className="flex items-start justify-between mb-2 gap-2">
                                    <h3 className="font-bold text-base md:text-lg text-white break-words flex-1">
                                      {formatActivityTitle(activity.clientName, activity.description)}
                                    </h3>
                                    {/* 회의록 태그 표시 */}
                                    {activity.description && activity.description.includes('[회의록]') && (
                                      <span className="px-2 py-1 text-xs font-semibold bg-zinc-900/80 text-gray-300 rounded-lg whitespace-nowrap flex-shrink-0 border border-zinc-800">
                                        태그: 회의록
                                      </span>
                                    )}
                                  </div>
                                  {/* 상세 문구: [거래처명]의 [정제된_외부참석자]와 [활동종류] */}
                                  <p className="text-sm text-gray-300 mb-3 leading-relaxed break-words">
                                    {formatActivityText(
                                      activity.clientName,
                                      activity.user, // 참석자 (정제 로직 적용)
                                      activity.type
                                    )}
                                  </p>
                                  {/* 활동 내용 */}
                                  {activity.description && (
                                    <p className="text-sm text-gray-300 mb-3 leading-relaxed bg-zinc-900/80 p-3 rounded-lg border border-zinc-800 break-words">
                                      {activity.description}
                                    </p>
                                  )}
                                </div>
                                {/* PC에서만 표시하는 수정 버튼 (모바일에서는 스와이프 사용) */}
                                <div className="ml-4 hidden md:flex flex-col space-y-2">
                                  <button
                                    onClick={() => setEditingActivityId(activity.id)}
                                    className="text-gray-300 hover:text-white font-medium flex items-center space-x-1 transition-colors touch-manipulation px-3 py-2 min-h-[44px]"
                                    style={{ WebkitTapHighlightColor: 'transparent' }}
                                  >
                                    <Edit className="w-4 h-4" />
                                    <span className="text-sm">수정</span>
                                  </button>
                                </div>
                              </div>
                            </div>
                          </SwipeableListItem>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })
          ) : (
            <div className="text-center py-8 text-gray-300">활동 내역이 없습니다.</div>
          )}
          {/* 무한 스크롤 트리거 */}
          {hasMore && (
            <div className="mt-8 pt-6 border-t border-zinc-800 text-center">
              <div className="flex items-center justify-center space-x-2 text-gray-300">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-sm">더 많은 활동을 불러오는 중...</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      <AddActivityModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
      />
      <EditActivityModal
        isOpen={editingActivityId !== null}
        onClose={() => setEditingActivityId(null)}
        activityId={editingActivityId}
      />
    </div>
  )
}

export default Activities



