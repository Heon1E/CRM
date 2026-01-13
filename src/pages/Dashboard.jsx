import React, { useState } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { useNavigate } from 'react-router-dom'
import { useData } from '../contexts/DataContext'
import MetricCard from '../components/MetricCard'
import EditActivityModal from '../components/EditActivityModal'
import SalesCalendar from '../components/SalesCalendar'
import AddIssueModal from '../components/AddIssueModal'
import EditIssueModal from '../components/EditIssueModal'
import AppInstallGuide from '../components/AppInstallGuide'
import { Plus, ChevronDown, ChevronUp, AlertCircle } from 'lucide-react'
import { formatActivityText, formatActivityTitle } from '../utils/koreanJosa'
import { showSuccess, showError } from '../utils/alert'
import { formatDate, formatCurrency, formatKoreanCurrency } from '../utils/formatters'

const Dashboard = () => {
  const { activities, clients, getStats, getWeeklySalesData, issues, updateIssue, loading } = useData()
  const navigate = useNavigate()
  const [editingActivityId, setEditingActivityId] = useState(null)
  const [expandedIssueId, setExpandedIssueId] = useState(null)
  const [editingIssueId, setEditingIssueId] = useState(null)
  const [isAddIssueModalOpen, setIsAddIssueModalOpen] = useState(false)
  const [editingIssueTitle, setEditingIssueTitle] = useState('')
  const [editingIssueContent, setEditingIssueContent] = useState('')
  
  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-gray-500">데이터를 불러오는 중...</div>
      </div>
    )
  }
  
  const stats = getStats()
  const weeklySalesData = getWeeklySalesData()

  // 진행 중 영업 건수
  const ongoingActivitiesCount = activities.filter((a) => a.status === '진행중').length

  // 진행 중 영업 클릭 핸들러
  const handleOngoingClick = () => {
    navigate('/activities?status=진행중')
  }


  // 최근 활동 (최신 5개)
  const recentActivities = activities
    .sort((a, b) => {
      const dateA = new Date(a.activity_date || a.date || a.created_at)
      const dateB = new Date(b.activity_date || b.date || b.created_at)
      return dateB - dateA
    })
    .slice(0, 5)

  // 오늘의 주요 일정 (오늘 날짜의 활동)
  const today = new Date().toISOString().split('T')[0]
  const todayActivities = activities
    .filter((activity) => {
      const activityDate = formatDate(activity.activity_date || activity.date || activity.created_at)
      return activityDate === today
    })
    .slice(0, 5)

  return (
    <div className="space-y-4 pb-20 md:pb-0">
      {/* 상단 헤더 영역 */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex-1">
          <h1 className="text-2xl md:text-3xl font-bold text-text-primary">Dashboard</h1>
        </div>
        <div className="flex items-center gap-3 w-full md:w-auto justify-end md:hidden">
          <AppInstallGuide />
        </div>
      </div>

      {/* 새로운 그리드 레이아웃 */}
      <div className="grid grid-cols-1 gap-4">
        {/* 첫 번째 행: 요약 카드 3개 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <MetricCard
            title="총 고객"
            value={`${stats.totalClients}명`}
            icon="👥"
            trend="up"
            trendValue="2명"
            bgColor="bg-slate-200"
          />
          <MetricCard
            title="이번 달 매출"
            value={formatKoreanCurrency(stats.thisMonthSales || 0)}
            icon="💰"
            trend={stats.salesGrowthRate >= 0 ? 'up' : 'down'}
            trendValue={`${Math.abs(stats.salesGrowthRate).toFixed(1)}%`}
            bgColor="bg-teal-100"
          />
          <MetricCard
            title="진행 중 영업"
            value={`${ongoingActivitiesCount}건`}
            icon="📊"
            trend="down"
            trendValue="1건"
            onClick={handleOngoingClick}
            clickable
            bgColor="bg-amber-100"
          />
        </div>

        {/* 두 번째 행: KPI 현황 (신규 추가) */}
        <div className="card p-4 md:p-5">
          <h3 className="text-base md:text-lg font-bold text-text-primary mb-4">KPI Status</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* 매출 목표 달성률 */}
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-gray-700">매출 목표 달성률</span>
                <span className="text-sm font-bold text-gray-900">75%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2.5">
                <div className="bg-blue-600 h-2.5 rounded-full" style={{ width: '75%' }}></div>
              </div>
            </div>
            {/* 신규 고객 목표 달성률 */}
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-gray-700">신규 고객 목표 달성률</span>
                <span className="text-sm font-bold text-gray-900">60%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2.5">
                <div className="bg-teal-600 h-2.5 rounded-full" style={{ width: '60%' }}></div>
              </div>
            </div>
          </div>
        </div>

        {/* 세 번째 행: 그래프(3) + 일정 리스트(1) */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          {/* 왼쪽 넓은 영역: 매출 추이 그래프 (높이 절반) */}
          <div className="lg:col-span-3 card p-4 md:p-5">
            <h3 className="text-base md:text-lg font-bold text-text-primary mb-4">
              Revenue Trend
            </h3>
            {weeklySalesData.length > 0 ? (
              <div className="w-full h-64 md:h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={weeklySalesData} margin={{ top: 10, right: 20, left: 10, bottom: 50 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis
                      dataKey="week"
                      stroke="#6b7280"
                      tick={{ fill: '#6b7280', fontSize: 11 }}
                      angle={-45}
                      textAnchor="end"
                      height={70}
                      interval={0}
                    />
                    <YAxis
                      stroke="#6b7280"
                      tick={{ fill: '#6b7280', fontSize: 12 }}
                      tickFormatter={(value) => formatCurrency(value * 10000)}
                      width={70}
                      domain={['dataMin - 1', 'auto']}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#fff',
                        border: '1px solid #e5e7eb',
                        borderRadius: '8px',
                        fontSize: '14px',
                        padding: '8px 12px',
                      }}
                      formatter={(value) => [formatCurrency(Number(value) * 10000), '매출']}
                      labelStyle={{ fontWeight: 'bold', marginBottom: '4px' }}
                    />
                    <Legend wrapperStyle={{ fontSize: '14px', paddingTop: '10px' }} />
                    <Line
                      type="monotone"
                      dataKey="매출"
                      stroke="#317AE2"
                      strokeWidth={2}
                      dot={{ fill: '#317AE2', r: 4 }}
                      activeDot={{ r: 6 }}
                      name="매출"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-16 md:h-21 flex items-center justify-center text-text-secondary text-sm md:text-base">
                이번 달 매출 데이터가 없습니다.
              </div>
            )}
          </div>

          {/* 오른쪽 좁은 영역: 오늘의 주요 일정 */}
          <div className="lg:col-span-1 card p-4 md:p-5">
            <h3 className="text-base md:text-lg font-bold text-text-primary mb-4">
              Upcoming Events
            </h3>
            <div className="space-y-2">
              {todayActivities.length > 0 ? (
                todayActivities.map((activity) => (
                  <div
                    key={activity.id}
                    onClick={() => setEditingActivityId(activity.id)}
                    className="p-2 border border-gray-200 rounded cursor-pointer hover:bg-gray-50 transition-colors"
                  >
                    <div className="text-xs font-medium text-gray-900 truncate">
                      {formatActivityTitle(activity.clientName, activity.description)}
                    </div>
                    {activity.type && (
                      <span className={`inline-block mt-1 px-1.5 py-0.5 rounded text-xs font-semibold ${
                        activity.type === '미팅' ? 'bg-blue-50 text-blue-700' :
                        activity.type === '전화' ? 'bg-emerald-50 text-emerald-700' :
                        activity.type === '계약' ? 'bg-purple-50 text-purple-700' :
                        activity.type === '견적' ? 'bg-amber-50 text-amber-700' :
                        'bg-gray-100 text-gray-600'
                      }`}>
                        {activity.type}
                      </span>
                    )}
                  </div>
                ))
              ) : (
                <div className="text-center py-4 text-gray-500 text-xs">
                  오늘 일정이 없습니다.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 네 번째 행: 최근 이슈 */}
        <div className="card p-4 md:p-5">
          <div className="flex items-center justify-between mb-4 md:mb-5">
            <h3 className="text-base md:text-lg font-bold text-gray-900 flex items-center space-x-2">
              <AlertCircle className="w-5 h-5 text-purple-600" />
              <span>Recent Issues</span>
            </h3>
            <button
              onClick={() => setIsAddIssueModalOpen(true)}
              className="px-3 py-1.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-all duration-200 flex items-center space-x-1 text-sm font-medium"
            >
              <Plus className="w-4 h-4" />
              <span>Add</span>
            </button>
          </div>

          <div className="space-y-2">
            {issues && issues.filter(issue => issue.status !== '완료').length > 0 ? (
              issues
                .filter(issue => issue.status !== '완료')
                .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
                .slice(0, 10)
                .map((issue) => {
                  const isExpanded = expandedIssueId === issue.id
                  const isEditing = editingIssueId === issue.id
                  
                  const baseDate = issue.date || issue.created_at
                  const daysDiff = baseDate 
                    ? Math.floor((new Date() - new Date(baseDate)) / (1000 * 60 * 60 * 24))
                    : 0
                  
                  let bgColor = 'bg-white border-gray-200'
                  if (daysDiff >= 14) {
                    bgColor = 'bg-red-50 border-red-200'
                  } else if (daysDiff >= 7) {
                    bgColor = 'bg-orange-50 border-orange-200'
                  } else if (issue.status === '진행') {
                    bgColor = 'bg-emerald-50 border-emerald-200'
                  }

                  const statusColor = issue.status === '완료'
                    ? 'bg-emerald-50 text-emerald-700'
                    : issue.status === '진행'
                    ? 'bg-blue-50 text-blue-700'
                    : 'bg-gray-50 text-gray-700'

                  return (
                    <div
                      key={issue.id}
                      className={`border rounded-lg transition-all duration-200 ${bgColor} ${isExpanded ? 'shadow-md' : ''}`}
                    >
                      {/* 제목 클릭 영역 */}
                      <button
                        onClick={() => {
                          if (!isEditing) {
                            setExpandedIssueId(isExpanded ? null : issue.id)
                            if (!isExpanded) {
                              setEditingIssueTitle(issue.title || '')
                              setEditingIssueContent(issue.content || '')
                            }
                          }
                        }}
                        className="w-full p-4 flex items-center justify-between gap-3 hover:bg-white/50 transition-colors rounded-lg"
                      >
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <span className={`px-2 py-1 rounded text-xs font-semibold shrink-0 ${statusColor}`}>
                            {issue.status || '등록'}
                          </span>
                          <span className="text-sm font-medium text-gray-900 text-left truncate">
                            {isEditing ? (
                              <input
                                type="text"
                                value={editingIssueTitle}
                                onChange={(e) => setEditingIssueTitle(e.target.value)}
                                onClick={(e) => e.stopPropagation()}
                                className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                                autoFocus
                              />
                            ) : (
                              issue.title
                            )}
                          </span>
                          {daysDiff > 0 && !isExpanded && (
                            <span className="text-xs text-gray-500 shrink-0">
                              ({daysDiff}일 경과)
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {isExpanded ? (
                            <ChevronUp className="w-4 h-4 text-gray-400" />
                          ) : (
                            <ChevronDown className="w-4 h-4 text-gray-400" />
                          )}
                        </div>
                      </button>

                      {/* 아코디언 상세 내용 */}
                      {isExpanded && (
                        <div className="px-4 pb-4 pt-0 border-t border-gray-200/50 mt-2 animate-in slide-in-from-top-2 duration-200">
                          <div className="pt-4 space-y-4">
                            {/* 내용 편집 */}
                            {isEditing ? (
                              <div className="space-y-3">
                                <div>
                                  <label className="block text-xs text-gray-500 mb-1">제목</label>
                                  <input
                                    type="text"
                                    value={editingIssueTitle}
                                    onChange={(e) => setEditingIssueTitle(e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                                  />
                                </div>
                                <div>
                                  <label className="block text-xs text-gray-500 mb-1">내용</label>
                                  <textarea
                                    value={editingIssueContent}
                                    onChange={(e) => setEditingIssueContent(e.target.value)}
                                    rows={4}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                                  />
                                </div>
                                <div className="flex items-center gap-2">
                                  <button
                                    onClick={async () => {
                                      try {
                                        await updateIssue(issue.id, {
                                          title: editingIssueTitle,
                                          content: editingIssueContent,
                                          updated_at: new Date().toISOString()
                                        })
                                        setEditingIssueId(null)
                                        await showSuccess('이슈가 수정되었습니다.')
                                      } catch (error) {
                                        console.error('이슈 수정 오류:', error)
                                        await showError('이슈 수정 중 오류가 발생했습니다.')
                                      }
                                    }}
                                    className="px-3 py-1.5 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 transition-colors"
                                  >
                                    저장
                                  </button>
                                  <button
                                    onClick={() => {
                                      setEditingIssueId(null)
                                      setEditingIssueTitle(issue.title || '')
                                      setEditingIssueContent(issue.content || '')
                                    }}
                                    className="px-3 py-1.5 bg-gray-200 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-300 transition-colors"
                                  >
                                    취소
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <>
                                {issue.content && (
                                  <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
                                    {issue.content}
                                  </p>
                                )}
                                {issue.target_date && (
                                  <p className="text-xs text-gray-500">
                                    목표일: {new Date(issue.target_date).toLocaleDateString('ko-KR')}
                                  </p>
                                )}
                                <p className="text-xs text-gray-400">
                                  등록일: {new Date(issue.created_at || issue.date).toLocaleDateString('ko-KR')}
                                </p>

                                <div className="flex items-center gap-2 pt-2 border-t border-gray-200">
                                  <select
                                    value={issue.status}
                                    onChange={async (e) => {
                                      try {
                                        await updateIssue(issue.id, {
                                          status: e.target.value,
                                          updated_at: new Date().toISOString()
                                        })
                                        if (e.target.value === '완료') {
                                          setExpandedIssueId(null)
                                        }
                                      } catch (error) {
                                        console.error('상태 변경 오류:', error)
                                        await showError('상태 변경 중 오류가 발생했습니다.')
                                      }
                                    }}
                                    onClick={(e) => e.stopPropagation()}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border-0 focus:outline-none focus:ring-2 focus:ring-purple-500 cursor-pointer ${statusColor}`}
                                  >
                                    <option value="등록">등록</option>
                                    <option value="진행">진행</option>
                                    <option value="완료">완료</option>
                                  </select>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      setEditingIssueId(issue.id)
                                    }}
                                    className="px-3 py-1.5 bg-purple-600 text-white rounded-lg text-xs font-medium hover:bg-purple-700 transition-colors"
                                  >
                                    수정
                                  </button>
                                </div>
                              </>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })
            ) : (
              <div className="text-center py-8 text-gray-500 text-sm">
                등록된 이슈가 없습니다.
              </div>
            )}
          </div>
        </div>

        {/* 다섯 번째 행: 최근 활동 내역 */}
        <div className="card p-4 md:p-5">
          <h3 className="text-base md:text-lg font-bold text-gray-900 mb-4 md:mb-5">
            Recent Activities
          </h3>
          <div className="space-y-3 md:space-y-4">
            {recentActivities.length > 0 ? (
              recentActivities.map((activity) => (
                <div
                  key={activity.id}
                  onClick={() => setEditingActivityId(activity.id)}
                  className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-4 md:p-5 border border-gray-100 rounded-xl hover:bg-gray-50 hover:border-gray-200 transition-all duration-200 gap-3 cursor-pointer"
                >
                  <div className="flex items-center space-x-3 md:space-x-4 flex-1 min-w-0">
                    <div className="w-10 h-10 bg-purple-50 rounded-full flex items-center justify-center flex-shrink-0">
                      <span className="text-brand-blue font-semibold text-sm md:text-base">
                        {activity.user ? activity.user.charAt(0) : '?'}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-2 mb-1.5">
                        {activity.type && (
                          <span className={`px-2 py-0.5 rounded text-xs font-semibold ${
                            activity.type === '미팅' ? 'bg-blue-50 text-blue-700' :
                            activity.type === '전화' ? 'bg-emerald-50 text-emerald-700' :
                            activity.type === '계약' ? 'bg-purple-50 text-purple-700' :
                            activity.type === '견적' ? 'bg-amber-50 text-amber-700' :
                            'bg-gray-100 text-gray-600'
                          }`}>
                            {activity.type}
                          </span>
                        )}
                      </div>
                      <h3 className="font-bold text-gray-900 text-sm md:text-base mb-1">
                        {formatActivityTitle(activity.clientName, activity.description)}
                      </h3>
                      <p className="text-sm text-gray-600 mb-1.5 leading-relaxed">
                        {formatActivityText(
                          activity.clientName,
                          activity.user,
                          activity.type
                        )}
                      </p>
                      <p className="text-xs md:text-sm text-gray-400">
                        {formatDate(activity.activity_date || activity.date)}
                      </p>
                    </div>
                  </div>
                  <span
                    className={`px-2 py-1 rounded-full text-xs font-semibold flex-shrink-0 self-start sm:self-auto ${
                      activity.status === '완료' || activity.status === 'Success'
                        ? 'bg-green-100 text-green-800'
                        : activity.status === '진행중' || activity.status === '대기' || activity.status === 'Processing' || activity.status === 'Pending'
                        ? 'bg-gray-100 text-gray-800'
                        : 'bg-red-100 text-red-800'
                    }`}
                  >
                    {activity.status || '상태 없음'}
                  </span>
                </div>
              ))
            ) : (
              <div className="text-center py-8 text-gray-500 text-sm md:text-base">
                활동 내역이 없습니다.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modals */}
      <EditActivityModal
        isOpen={editingActivityId !== null}
        onClose={() => setEditingActivityId(null)}
        activityId={editingActivityId}
      />
      <AddIssueModal
        isOpen={isAddIssueModalOpen}
        onClose={() => setIsAddIssueModalOpen(false)}
      />
      <EditIssueModal
        isOpen={editingIssueId !== null && editingIssueId !== expandedIssueId}
        onClose={() => setEditingIssueId(null)}
        issueId={editingIssueId}
      />

    </div>
  )
}

export default Dashboard