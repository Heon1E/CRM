import React, { useState } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { useNavigate } from 'react-router-dom'
import { useData } from '../contexts/DataContext'
import MetricCard from '../components/MetricCard'
import EditActivityModal from '../components/EditActivityModal'
import IssueTracker from '../components/IssueTracker'
import SalesCalendar from '../components/SalesCalendar'
import { formatActivityText, formatActivityTitle, getParticle } from '../utils/koreanJosa'

const Dashboard = () => {
  const { activities, clients, getStats, getWeeklySalesData, loading } = useData()
  const navigate = useNavigate()
  const [editingActivityId, setEditingActivityId] = useState(null)
  
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

  // 날짜 포맷팅 함수 (YYYY-MM-DD 형식으로 변환)
  const formatDate = (dateString) => {
    if (!dateString) return '날짜 없음'
    
    // ISO 형식 문자열인 경우 (예: "2026-01-07T00:00:00...")
    if (typeof dateString === 'string' && dateString.includes('T')) {
      return dateString.split('T')[0]
    }
    
    // 이미 YYYY-MM-DD 형식인 경우
    if (typeof dateString === 'string' && /^\d{4}-\d{2}-\d{2}/.test(dateString)) {
      return dateString.substring(0, 10)
    }
    
    // Date 객체인 경우
    if (dateString instanceof Date) {
      const year = dateString.getFullYear()
      const month = String(dateString.getMonth() + 1).padStart(2, '0')
      const day = String(dateString.getDate()).padStart(2, '0')
      return `${year}-${month}-${day}`
    }
    
    // 그 외의 경우 Date 객체로 변환 시도
    try {
      const date = new Date(dateString)
      if (!isNaN(date.getTime())) {
        const year = date.getFullYear()
        const month = String(date.getMonth() + 1).padStart(2, '0')
        const day = String(date.getDate()).padStart(2, '0')
        return `${year}-${month}-${day}`
      }
    } catch (e) {
      // 변환 실패 시 원본 반환
    }
    
    return dateString
  }

  // 최근 활동 (최신 5개)
  const recentActivities = activities
    .sort((a, b) => {
      const dateA = new Date(a.activity_date || a.date || a.created_at)
      const dateB = new Date(b.activity_date || b.date || b.created_at)
      return dateB - dateA
    })
    .slice(0, 5)

  return (
    <div className="space-y-4 md:space-y-6">
      {/* KPI Cards - 반응형 그리드: 모바일 1개, 태블릿 2개, PC 4개 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
        <MetricCard
          title="총 고객"
          value={`${stats.totalClients}명`}
          icon="👥"
          trend="up"
          trendValue="2명"
        />
        <MetricCard
          title="이번 달 매출"
          value={`${(stats.thisMonthSales / 10000).toLocaleString()}만원`}
          icon="💰"
          trend={stats.salesGrowthRate >= 0 ? 'up' : 'down'}
          trendValue={`${Math.abs(stats.salesGrowthRate).toFixed(1)}%`}
        />
        <MetricCard
          title="진행 중 영업"
          value={`${ongoingActivitiesCount}건`}
          icon="📊"
          trend="down"
          trendValue="1건"
          onClick={handleOngoingClick}
          clickable
        />
        <MetricCard
          title="이번 달 활동"
          value={`${stats.thisMonthActivities}건`}
          icon="✨"
          trend="up"
          trendValue="5건"
        />
      </div>

      {/* 영업 캘린더 + 주간 매출 추이 (3등분 레이아웃) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 md:gap-6">
        {/* 좌측 2/3: 영업 캘린더 */}
        <div className="lg:col-span-2">
          <SalesCalendar />
        </div>

        {/* 우측 1/3: 주간 매출 추이 */}
        <div className="card p-5 md:p-6 overflow-hidden">
          <h3 className="text-base md:text-lg font-bold text-text-primary mb-4 md:mb-6">
            이번 달 주간 매출 추이
          </h3>
          {weeklySalesData.length > 0 ? (
            <div className="w-full">
              <ResponsiveContainer width="100%" height={500} minHeight={400}>
                <LineChart data={weeklySalesData} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis
                    dataKey="week"
                    stroke="#6b7280"
                    tick={{ fill: '#6b7280', fontSize: 12 }}
                    angle={-45}
                    textAnchor="end"
                    height={60}
                  />
                  <YAxis
                    stroke="#6b7280"
                    tick={{ fill: '#6b7280', fontSize: 12 }}
                    tickFormatter={(value) => `${value}만원`}
                    width={60}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#fff',
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                      fontSize: '14px',
                    }}
                    formatter={(value) => `${value.toLocaleString()}만원`}
                  />
                  <Legend wrapperStyle={{ fontSize: '14px' }} />
                  <Line
                    type="monotone"
                    dataKey="매출"
                    stroke="#317AE2"
                    strokeWidth={2}
                    dot={{ fill: '#317AE2', r: 4 }}
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-[400px] flex items-center justify-center text-text-secondary text-sm md:text-base">
              이번 달 매출 데이터가 없습니다.
            </div>
          )}
        </div>
      </div>

      {/* ISSUE Tracker - 매출 추이 그래프와 영업 활동 리스트 사이 */}
      <div className="w-full">
        <IssueTracker maxItems={null} />
      </div>

      {/* Recent Activities - 모바일 최적화 */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 md:p-6 w-full">
        <h3 className="text-base md:text-lg font-bold text-gray-900 mb-5 md:mb-6">
          최근 영업 활동
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
                    {/* 활동 종류 뱃지 */}
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
                    {/* 제목: [거래처] - [핵심요약] */}
                    <h3 className="font-bold text-gray-900 text-sm md:text-base mb-1">
                      {formatActivityTitle(activity.clientName, activity.description)}
                    </h3>
                    {/* 상세 문구: [거래처명]의 [정제된_외부참석자]와 [활동종류] */}
                    <p className="text-sm text-gray-600 mb-1.5 leading-relaxed">
                      {formatActivityText(
                        activity.clientName,
                        activity.user, // 참석자
                        activity.type
                      )}
                    </p>
                    <p className="text-xs md:text-sm text-gray-400">
                      {formatDate(activity.activity_date || activity.date)}
                    </p>
                  </div>
                </div>
                <span
                  className={`px-3 md:px-4 py-1.5 rounded-lg text-xs font-semibold flex-shrink-0 self-start sm:self-auto ${
                    activity.status === '완료'
                      ? 'bg-emerald-50 text-emerald-700'
                      : 'bg-amber-50 text-amber-700'
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

      {/* Edit Activity Modal */}
      <EditActivityModal
        isOpen={editingActivityId !== null}
        onClose={() => setEditingActivityId(null)}
        activityId={editingActivityId}
      />
    </div>
  )
}

export default Dashboard
