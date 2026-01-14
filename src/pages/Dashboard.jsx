import React, { useState, useEffect, useMemo } from 'react'
import { LineChart, Line, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { useNavigate } from 'react-router-dom'
import { useData } from '../contexts/DataContext'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import MetricCard from '../components/MetricCard'
import EditActivityModal from '../components/EditActivityModal'
import SalesCalendar from '../components/SalesCalendar'
import AppInstallGuide from '../components/AppInstallGuide'
import { formatActivityText, formatActivityTitle } from '../utils/koreanJosa'
import { formatDate, formatCurrency, formatKoreanCurrency } from '../utils/formatters'

const Dashboard = () => {
  // ===== 모든 Hooks를 최상단에 선언 =====
  const { activities, clients, getStats, getWeeklySalesData, loading, sales } = useData()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [editingActivityId, setEditingActivityId] = useState(null)
  const [upcomingEvents, setUpcomingEvents] = useState([])
  const [myAccounts, setMyAccounts] = useState([])
  const [myMonthlySales, setMyMonthlySales] = useState(0)
  const [myWeeklySalesData, setMyWeeklySalesData] = useState([])

  // Sales Rep 옵션
  const SALES_REP_OPTIONS = ['박민철', '송원기', '이헌일']

  // 사용자 이름 매핑 (영어 -> 한글)
  const getUserSalesRep = useMemo(() => {
    if (!user) return null

    // 사용자 이름 추출 (user_metadata.full_name 또는 email에서)
    const userName = user.user_metadata?.full_name || user.email || ''
    
    // 영어 이름 -> 한글 이름 매핑
    const nameMapping = {
      'Heonil Lee': '이헌일',
      'heonil lee': '이헌일',
      'Heonil': '이헌일',
      'heonil': '이헌일',
      // 필요시 추가 매핑
    }

    // 매핑 확인
    if (nameMapping[userName]) {
      return nameMapping[userName]
    }

    // 직접 매칭 (한글 이름이 이미 있는 경우)
    if (SALES_REP_OPTIONS.includes(userName)) {
      return userName
    }

    // 이메일에서 이름 추출 시도 (예: heonil@example.com -> 이헌일)
    const emailName = user.email?.split('@')[0]?.toLowerCase()
    if (emailName && nameMapping[emailName]) {
      return nameMapping[emailName]
    }

    return null
  }, [user])
  
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

  // My Accounts 및 My Monthly Sales 데이터 페칭 (No JOIN 규칙 준수)
  useEffect(() => {
    const fetchMyData = async () => {
      if (!getUserSalesRep) {
        setMyAccounts([])
        setMyMonthlySales(0)
        setMyWeeklySalesData([])
        return
      }

      try {
        // Step 1: clients 테이블에서 sales_rep가 현재 사용자와 일치하는 클라이언트 조회
        const { data: myClientsData, error: clientsError } = await supabase
          .from('clients')
          .select('id')
          .eq('sales_rep', getUserSalesRep)

        if (clientsError) throw clientsError

        const myClientIds = (myClientsData || []).map(c => c.id)
        setMyAccounts(myClientIds)

        if (myClientIds.length === 0) {
          setMyMonthlySales(0)
          setMyWeeklySalesData([])
          return
        }

        // Step 2: 이번 달 sales 데이터 조회
        const now = new Date()
        const currentYear = now.getFullYear()
        const currentMonth = now.getMonth() + 1
        const startDate = `${currentYear}-${String(currentMonth).padStart(2, '0')}-01`
        const endDate = `${currentYear}-${String(currentMonth).padStart(2, '0')}-31`

        const { data: mySalesData, error: salesError } = await supabase
          .from('sales')
          .select('*')
          .in('client_id', myClientIds)
          .gte('sale_date', startDate)
          .lte('sale_date', endDate)

        if (salesError) throw salesError

        // 이번 달 매출 합계 계산
        const monthlyTotal = (mySalesData || []).reduce((sum, sale) => {
          return sum + (sale.total_amount || 0)
        }, 0)
        setMyMonthlySales(monthlyTotal)

        // 주간 매출 데이터 계산 (My Sales Trend용)
        const weeklyData = getWeeklySalesDataForClients(mySalesData || [])
        setMyWeeklySalesData(weeklyData)
      } catch (error) {
        console.error('My Data 조회 오류:', error)
        setMyAccounts([])
        setMyMonthlySales(0)
        setMyWeeklySalesData([])
      }
    }

    fetchMyData()
  }, [getUserSalesRep])

  // 주간 매출 데이터 계산 헬퍼 함수 (특정 클라이언트들용)
  const getWeeklySalesDataForClients = (salesData) => {
    if (!salesData || salesData.length === 0) return []

    const now = new Date()
    const weeks = []
    
    // 최근 8주 데이터 생성
    for (let i = 7; i >= 0; i--) {
      const weekStart = new Date(now)
      weekStart.setDate(now.getDate() - (i * 7))
      weekStart.setHours(0, 0, 0, 0)
      
      const weekEnd = new Date(weekStart)
      weekEnd.setDate(weekStart.getDate() + 6)
      weekEnd.setHours(23, 59, 59, 999)

      const weekSales = salesData.filter(sale => {
        const saleDate = new Date(sale.sale_date || sale.date)
        return saleDate >= weekStart && saleDate <= weekEnd
      })

      const weekTotal = weekSales.reduce((sum, sale) => {
        return sum + (sale.total_amount || 0)
      }, 0)

      const weekLabel = `${weekStart.getMonth() + 1}/${weekStart.getDate()}`
      weeks.push({
        week: weekLabel,
        매출: Math.round(weekTotal / 10000) // 만원 단위로 변환
      })
    }

    return weeks
  }

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

  // Upcoming Events 데이터 페칭 (No JOIN 규칙 준수)
  // 영업 활동의 다음 일정(next_action_date)이 곧 Upcoming Event가 됩니다.
  useEffect(() => {
    const fetchUpcomingEvents = async () => {
      try {
        // Step 1: activities 테이블에서 next_action_date가 있는 데이터만 조회
        const { data: activitiesData, error: activitiesError } = await supabase
          .from('activities')
          .select('*')
          .not('next_action_date', 'is', null)
          .order('next_action_date', { ascending: true })

        if (activitiesError) throw activitiesError

        if (!activitiesData || activitiesData.length === 0) {
          setUpcomingEvents([])
          return
        }

        // Step 2: 필요한 client_id들만 모아서 clients 테이블 별도 조회
        const clientIds = [...new Set(activitiesData.map(a => a.client_id).filter(Boolean))]
        
        let clientsMap = {}
        if (clientIds.length > 0) {
          const { data: clientsData, error: clientsError } = await supabase
            .from('clients')
            .select('id, company')
            .in('id', clientIds)

          if (!clientsError && clientsData) {
            clientsMap = clientsData.reduce((acc, client) => {
              acc[client.id] = client.company
              return acc
            }, {})
          }
        }

        // Step 3: 두 데이터를 병합하여 Upcoming Events 생성
        const mergedEvents = activitiesData.map(activity => ({
          ...activity,
          clientName: clientsMap[activity.client_id] || '알 수 없음',
          scheduleDate: activity.next_action_date
        }))

        setUpcomingEvents(mergedEvents)
      } catch (error) {
        console.error('Upcoming Events 조회 오류:', error)
        setUpcomingEvents([])
      }
    }

    fetchUpcomingEvents()
  }, [])

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
        {/* 첫 번째 행: 요약 카드 */}
        <div className={`grid grid-cols-1 md:grid-cols-3 ${getUserSalesRep ? 'lg:grid-cols-5' : ''} gap-4`}>
          <MetricCard
            title="총 거래처"
            value={`${stats.totalClients}명`}
            icon="👥"
            trend="up"
            trendValue="2명"
            bgColor="bg-slate-200"
          />
          {getUserSalesRep && (
            <>
              <MetricCard
                title="담당 거래처"
                value={`${myAccounts.length}명`}
                icon="👤"
                trend="up"
                trendValue=""
                bgColor="bg-blue-100"
              />
              <MetricCard
                title="담당 거래처 이번달 매출"
                value={formatKoreanCurrency(myMonthlySales || 0)}
                icon="💰"
                trend="up"
                trendValue=""
                bgColor="bg-indigo-100"
              />
            </>
          )}
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

        {/* 세 번째 행: 그래프(2) + 일정 리스트(1) */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          {/* 왼쪽: Revenue Trend (전체 매출 추이) */}
          <div className="lg:col-span-2 card p-4 md:p-5">
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
                      domain={[0, 'auto']}
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
                    <Area
                      type="monotone"
                      dataKey="매출"
                      fill="#f3f4f6"
                      fillOpacity={0.3}
                      stroke="none"
                    />
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

          {/* 중앙: My Sales Trend (담당 거래처 매출 추이) */}
          {getUserSalesRep && (
            <div className="lg:col-span-2 card p-4 md:p-5">
              <h3 className="text-base md:text-lg font-bold text-text-primary mb-4">
                My Sales Trend
              </h3>
              {myWeeklySalesData.length > 0 ? (
                <div className="w-full h-64 md:h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={myWeeklySalesData} margin={{ top: 10, right: 20, left: 10, bottom: 50 }}>
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
                        domain={[0, 'auto']}
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
                      <Area
                        type="monotone"
                        dataKey="매출"
                        fill="#dbeafe"
                        fillOpacity={0.3}
                        stroke="none"
                      />
                      <Line
                        type="monotone"
                        dataKey="매출"
                        stroke="#3b82f6"
                        strokeWidth={2}
                        dot={{ fill: '#3b82f6', r: 4 }}
                        activeDot={{ r: 6 }}
                        name="매출"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-16 md:h-21 flex items-center justify-center text-text-secondary text-sm md:text-base">
                  담당 거래처 매출 데이터가 없습니다.
                </div>
              )}
            </div>
          )}

          {/* 오른쪽: Upcoming Events (다음 일정) */}
          <div className={`card p-4 md:p-5 ${getUserSalesRep ? 'lg:col-span-1' : 'lg:col-span-3'}`}>
            <h3 className="text-base md:text-lg font-bold text-text-primary mb-4">
              Upcoming Events
            </h3>
            <div className="space-y-2">
              {upcomingEvents.length > 0 ? (
                upcomingEvents.slice(0, 5).map((event) => (
                  <div
                    key={event.id}
                    onClick={() => setEditingActivityId(event.id)}
                    className="p-2 border border-gray-200 rounded cursor-pointer hover:bg-gray-50 transition-colors"
                  >
                    <div className="text-xs font-semibold text-gray-700 mb-1">
                      {formatDate(event.scheduleDate || event.next_action_date)}
                    </div>
                    <div className="text-xs font-medium text-gray-900 truncate mb-1">
                      {event.clientName}
                    </div>
                    {event.next_action_detail && (
                      <div className="text-xs text-gray-600 truncate">
                        {event.next_action_detail}
                      </div>
                    )}
                    {event.type && (
                      <span className={`inline-block mt-1 px-1.5 py-0.5 rounded text-xs font-semibold ${
                        event.type === '미팅' ? 'bg-blue-50 text-blue-700' :
                        event.type === '전화' ? 'bg-emerald-50 text-emerald-700' :
                        event.type === '계약' ? 'bg-purple-50 text-purple-700' :
                        event.type === '견적' ? 'bg-amber-50 text-amber-700' :
                        'bg-gray-100 text-gray-600'
                      }`}>
                        {event.type}
                      </span>
                    )}
                  </div>
                ))
              ) : (
                <div className="text-center py-4 text-gray-500 text-xs">
                  예정된 일정이 없습니다.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 네 번째 행: 최근 활동 내역 */}
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

    </div>
  )
}

export default Dashboard