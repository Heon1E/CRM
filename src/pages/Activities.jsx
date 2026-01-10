import React, { useState, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Edit, Download, Loader2 } from 'lucide-react'
import { useData } from '../contexts/DataContext'
import EditActivityModal from '../components/EditActivityModal'
import AddActivityModal from '../components/AddActivityModal'
import SwipeableListItem from '../components/SwipeableListItem'
import { exportActivitiesToExcel } from '../utils/excelExport'
import { formatActivityTitle, formatActivityText } from '../utils/koreanJosa'
import { useInfiniteScroll } from '../hooks/useInfiniteScroll'

const Activities = () => {
  const { activities, loading, updateActivity, deleteActivity } = useData()
  const [searchParams] = useSearchParams()
  const [editingActivityId, setEditingActivityId] = useState(null)
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)

  // 쿼리 파라미터에서 status 필터 가져오기
  const statusFilter = searchParams.get('status')

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-gray-500">데이터를 불러오는 중...</div>
      </div>
    )
  }

  const getTypeColor = (type) => {
    switch (type) {
      case '미팅':
        return 'bg-blue-50 text-blue-700'
      case '제안서':
        return 'bg-purple-50 text-purple-700'
      case '전화':
        return 'bg-emerald-50 text-emerald-700'
      case '계약':
        return 'bg-purple-50 text-purple-700'
      case '견적':
        return 'bg-amber-50 text-amber-700'
      case '이메일':
        return 'bg-gray-100 text-gray-600'
      default:
        return 'bg-gray-100 text-gray-600'
    }
  }

  const getStatusColor = (status) => {
    return status === '완료'
      ? 'bg-emerald-50 text-emerald-700'
      : 'bg-amber-50 text-amber-700'
  }

  // 상태 필터링 적용 (useMemo로 최적화)
  const filteredActivities = useMemo(() => {
    const allActivities = activities || []
    return statusFilter
      ? allActivities.filter((activity) => activity.status === statusFilter)
      : allActivities
  }, [activities, statusFilter])

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
      alert('상태 변경 중 오류가 발생했습니다.')
    }
  }

  return (
    <div className="space-y-5 md:space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900">영업 활동</h1>
          <p className="text-gray-500 mt-1.5 text-sm md:text-base">
            {statusFilter ? `'${statusFilter}' 상태: ` : '총 '}
            {filteredActivities.length}건의 활동 기록
            {statusFilter && ` (전체 ${activities.length}건 중)`}
          </p>
        </div>
        <div className="flex items-center space-x-3 w-full sm:w-auto">
          <button
            onClick={handleExport}
            className="flex-1 sm:flex-none px-4 py-3 bg-white text-gray-700 border border-gray-200 rounded-xl hover:bg-gray-50 hover:border-gray-300 transition-all duration-200 flex items-center justify-center space-x-2 font-medium shadow-sm touch-manipulation min-h-[44px]"
            style={{ WebkitTapHighlightColor: 'transparent' }}
          >
            <Download className="w-4 h-4" />
            <span>엑셀 다운로드</span>
          </button>
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="btn-success flex-1 sm:flex-none flex items-center justify-center space-x-2 touch-manipulation min-h-[44px] px-4 py-3"
            style={{ WebkitTapHighlightColor: 'transparent' }}
          >
            <span>+</span>
            <span>활동 추가</span>
          </button>
        </div>
      </div>

      <div className="card p-5 md:p-6">
        <div className="relative" ref={containerRef}>
          {/* Timeline */}
          {visibleDates.length > 0 ? (
            visibleDates.map((date, dateIndex) => {
              const dateActivities = visibleGroupedActivities[date]
              return (
                <div key={date} className={dateIndex > 0 ? 'mt-8' : ''}>
                  {/* Date Header */}
                  <div className="flex items-center mb-5">
                    <div className="flex-1 border-t border-gray-200"></div>
                    <div className="px-4">
                      <span className="text-sm font-bold text-text-body bg-gray-50 px-4 py-2 rounded-button">
                        {new Date(date).toLocaleDateString('ko-KR', {
                          month: 'long',
                          day: 'numeric',
                          weekday: 'short',
                        })}
                      </span>
                    </div>
                    <div className="flex-1 border-t border-gray-200"></div>
                  </div>

                  {/* Activities */}
                  <div className="space-y-4">
                    {dateActivities.map((activity, index) => (
                      <div key={activity.id} className="flex items-start space-x-4">
                        {/* Timeline Line */}
                        <div className="flex flex-col items-center">
                          <div className="w-3 h-3 bg-brand-blue rounded-full border-2 border-white shadow-subtle"></div>
                          {index < dateActivities.length - 1 && (
                            <div className="w-0.5 h-full bg-gray-200 mt-2"></div>
                          )}
                        </div>

                        {/* Activity Content with Swipe */}
                        <div className="flex-1">
                          <SwipeableListItem
                            onEdit={() => setEditingActivityId(activity.id)}
                            onDelete={() => {
                              if (window.confirm('정말 삭제하시겠습니까?\n\n이 활동 기록이 영구적으로 삭제됩니다.')) {
                                deleteActivity(activity.id).catch((error) => {
                                  console.error('활동 삭제 중 오류:', error)
                                  alert('삭제 중 오류가 발생했습니다.')
                                })
                              }
                            }}
                            enabled={true}
                          >
                            <div className="bg-gray-50 rounded-xl p-4 md:p-5 hover:bg-gray-100 hover:shadow-sm transition-all duration-200">
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
                                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-all hover:shadow-sm touch-manipulation min-h-[44px] ${getStatusColor(
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
                                    <h3 className="font-bold text-base md:text-lg text-gray-900 break-words flex-1">
                                      {formatActivityTitle(activity.clientName, activity.description)}
                                    </h3>
                                    {/* 회의록 태그 표시 */}
                                    {activity.description && activity.description.includes('[회의록]') && (
                                      <span className="px-2 py-1 text-xs font-semibold bg-indigo-50 text-indigo-700 rounded-lg whitespace-nowrap flex-shrink-0">
                                        태그: 회의록
                                      </span>
                                    )}
                                  </div>
                                  {/* 상세 문구: [거래처명]의 [정제된_외부참석자]와 [활동종류] */}
                                  <p className="text-sm text-gray-600 mb-3 leading-relaxed break-words">
                                    {formatActivityText(
                                      activity.clientName,
                                      activity.user, // 참석자 (정제 로직 적용)
                                      activity.type
                                    )}
                                  </p>
                                  {/* 활동 내용 */}
                                  {activity.description && (
                                    <p className="text-sm text-gray-700 mb-3 leading-relaxed bg-white p-3 rounded-lg border border-gray-200 break-words">
                                      {activity.description}
                                    </p>
                                  )}
                                </div>
                                {/* PC에서만 표시하는 수정 버튼 (모바일에서는 스와이프 사용) */}
                                <div className="ml-4 hidden md:flex flex-col space-y-2">
                                  <button
                                    onClick={() => setEditingActivityId(activity.id)}
                                    className="text-brand-blue hover:text-brand-blue-hover font-medium flex items-center space-x-1 transition-colors touch-manipulation px-3 py-2 min-h-[44px]"
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
            <div className="text-center py-8 text-gray-500">활동 내역이 없습니다.</div>
          )}
          {/* 무한 스크롤 트리거 */}
          {hasMore && (
            <div className="mt-8 pt-6 border-t border-gray-200 text-center">
              <div className="flex items-center justify-center space-x-2 text-gray-500">
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
