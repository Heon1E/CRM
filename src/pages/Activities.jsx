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
  const [searchInput, setSearchInput] = useState('') // Search input value (not yet submitted)
  const [searchTerm, setSearchTerm] = useState('') // Submitted search term for filtering

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

  // 엑셀 내보내기 핸들러
  const handleExport = async () => {
    try {
      if (!filteredActivities || filteredActivities.length === 0) {
        await showError('내보낼 데이터가 없습니다.')
        return
      }
      exportActivitiesToExcel(filteredActivities)
    } catch (error) {
      console.error('Export failed:', error)
      await showError('엑셀 내보내기 중 오류가 발생했습니다.')
    }
  }

  // Guard Clause: 모든 Hook 선언이 끝난 후에 조기 리턴
  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-oem-bg-app">
        <div className="text-oem-text-secondary animate-pulse font-medium">Synchronizing activity logs...</div>
      </div>
    )
  }

  return (
    <div className="p-3 md:p-6 bg-oem-bg-app font-['Noto_Sans_KR',sans-serif] text-oem-text-primary mt-[50px] min-h-screen">
      <div className="max-w-[1600px] mx-auto space-y-6">

        {/* 타이틀바 */}
        <div className="win-title" style={{ border: '1px solid var(--border)', borderBottom: 0 }}>
          <span className="flex items-baseline gap-3">
            영업활동
            <span className="meta">
              {statusFilter ? `${statusFilter} · ` : ''}{filteredActivities.length}건
            </span>
          </span>
        </div>

        {/* 툴바 */}
        <div className="toolbar" style={{ border: '1px solid var(--border)', borderTop: 0 }}>
          <button onClick={() => setIsAddModalOpen(true)} className="tb-btn primary">
            <Edit className="w-3.5 h-3.5" /> 신규 <kbd>F2</kbd>
          </button>
          <span className="tb-sep" />
          <button onClick={handleExport} className="tb-btn">
            <Download className="w-3.5 h-3.5" /> 엑셀 내리기
          </button>
        </div>

        {/* Filter Ribbon */}
        <div className="oem-panel bg-white shadow-sm border-l-4 border-l-oem-blue">
          <div className="p-4 flex flex-col lg:flex-row gap-4 lg:items-center">
            <div className="flex-1 flex items-center gap-3">
              <label className="text-xs font-bold text-oem-text-secondary tracking-wide whitespace-nowrap">거래처로 거르기</label>
              <div className="relative flex-1 group">
                <input
                  type="text"
                  placeholder="Enter company reference..."
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') setSearchTerm(searchInput)
                  }}
                  className="w-full bg-oem-bg-panel border border-oem-border px-4 py-2 rounded-oem text-[13px] outline-none focus:border-oem-blue focus:bg-white transition-all"
                />
                <Search className="absolute right-3 top-1/2 transform -translate-y-1/2 text-oem-text-secondary w-4 h-4 group-focus-within:text-oem-blue" />
              </div>
            </div>
            <div className="flex items-center gap-4 px-4 text-[11px] font-medium text-oem-text-secondary uppercase">
              <span className="bg-oem-bg-header px-2 py-1 rounded text-oem-blue border border-oem-border">최신순</span>
            </div>
          </div>
        </div>

        {/* Data Stream */}
        <div className="oem-panel bg-white shadow-sm overflow-hidden" ref={containerRef}>
          <div className="oem-panel-header">
            <span>활동 기록</span>
            <div className="flex items-center gap-4 text-[10px] font-medium text-oem-text-secondary">
              <span>아래로 내리면 더 불러옵니다</span>
              <span className="w-px h-3 bg-oem-border"></span>
              <span className="text-oem-green font-bold">실시간</span>
            </div>
          </div>

          <div className="overflow-y-auto max-h-[calc(100vh-320px)] divide-y divide-oem-border">
            {visibleDates.length > 0 ? (
              visibleDates.map((date) => {
                const dateActivities = visibleGroupedActivities[date]
                return (
                  <div key={date} className="bg-white">
                    {/* Date Ribbon */}
                    <div className="bg-oem-bg-header/50 px-4 py-1.5 flex items-center gap-3 sticky top-0 z-10 backdrop-blur-sm border-b border-oem-border">
                      <span className="font-bold text-[11px] text-oem-blue tracking-tighter uppercase whitespace-nowrap">
                        {new Date(date).toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' })}
                      </span>
                      <div className="h-px flex-1 bg-oem-border"></div>
                      <span className="text-[10px] font-bold text-oem-text-secondary">{dateActivities.length}건</span>
                    </div>

                    {/* Timeline Interaction Table (Desktop) */}
                    <table className="dgrid min-w-full">
                      <tbody>
                        {dateActivities.map((activity) => (
                          <tr key={activity.id} onClick={() => setEditingActivityId(activity.id)} className="group cursor-pointer">
                            <td className="w-20 text-center">
                              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${activity.status === '완료'
                                ? 'bg-oem-bg-header text-oem-text-secondary'
                                : 'bg-oem-red/10 text-oem-red border-oem-red/20'
                                }`}>
                                {activity.status === '완료' ? '완료' : '예정'}
                              </span>
                            </td>
                            <td className="w-24">
                              <div className="flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-oem-blue"></span>
                                <span className="text-[11px] font-bold text-oem-text-secondary">{activity.type}</span>
                              </div>
                            </td>
                            <td className="w-64 font-bold text-oem-text-primary group-hover:text-oem-blue transition-colors">
                              {activity.clientName || '거래처 없음'}
                            </td>
                            <td className="text-oem-text-primary font-medium italic">
                              {activity.title || activity.description || '(No context provided)'}
                            </td>
                            <td className="w-20 text-center">
                              <button className="p-1.5 hover:bg-oem-bg-header rounded text-oem-blue transition-colors opacity-0 group-hover:opacity-100">
                                <Edit className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>

                    {/* Timeline Interaction List (Mobile) */}
                    <div className="hidden">
                      {dateActivities.map((activity) => (
                        <div key={activity.id} onClick={() => setEditingActivityId(activity.id)} className="p-4 bg-white active:bg-gray-50 transition-colors cursor-pointer">
                          <div className="flex justify-between items-start mb-2">
                            <div className="flex items-center gap-2">
                              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${activity.status === '완료'
                                ? 'bg-oem-bg-header text-oem-text-secondary'
                                : 'bg-oem-red/10 text-oem-red border-oem-red/20'
                                }`}>
                                {activity.status === '완료' ? '완료' : '예정'}
                              </span>
                              <div className="flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-oem-blue"></span>
                                <span className="text-[11px] font-bold text-oem-text-secondary">{activity.type}</span>
                              </div>
                            </div>
                            <button className="text-oem-text-secondary">
                              <Edit className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          <h3 className="font-bold text-oem-text-primary text-sm mb-1">
                            {activity.clientName || '거래처 없음'}
                          </h3>

                          <p className="text-sm text-oem-text-primary/90 font-medium leading-snug break-words">
                            {activity.title || activity.description || '(No context provided)'}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })
            ) : (
              <div className="py-24 text-center">
                <div className="flex flex-col items-center gap-3">
                  <div className="w-12 h-12 bg-oem-bg-header rounded-full flex items-center justify-center">
                    <Search className="w-6 h-6 text-oem-text-secondary" />
                  </div>
                  <p className="text-oem-text-secondary font-medium italic">No interactive history records matching current filter context.</p>
                </div>
              </div>
            )}

            {hasMore && (
              <div className="p-8 text-center bg-oem-bg-header/20">
                <span className="text-xs font-bold text-oem-text-secondary animate-pulse tracking-wide">더 불러오는 중…</span>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="statusbar" style={{ border: '1px solid var(--border)' }}>
        <span><span className="dot" />준비됨</span>
        <span>표시 {filteredActivities.length}건</span>
        {statusFilter && <span>필터: {statusFilter}</span>}
        <span className="flex-1" />
        <span className="hint"><kbd>F2</kbd> 신규</span>
      </div>

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



