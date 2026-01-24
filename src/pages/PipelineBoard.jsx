import React, { useState, useMemo, useEffect } from 'react'
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd'
import { useData } from '../contexts/DataContext'
import { supabase } from '../lib/supabase'
import { CheckCircle2, TrendingUp, ArrowRight, Mail } from 'lucide-react'
import Toast from '../components/Toast'
import { showConfirm } from '../utils/alert'
import { PIPELINE_STATUSES, isPipelineCandidate, normalizeStatus, coerceClientStatus } from '../utils/clientStatus'

const PipelineBoard = () => {
  const { clients, loading, updateClient, addSale, sales } = useData()
  const [toast, setToast] = useState(null)

  // 영업 단계 정의
  const mainStages = ['잠재고객', '연락중', '미팅예정', '견적제출', '협상중']
  const endStages = ['거래 종료', '영업 대기']
  const stages = PIPELINE_STATUSES

  // 모바일 탭 상태
  const [currentMobileStage, setCurrentMobileStage] = useState(mainStages[0])
  const mobileTabs = [...mainStages, '계약 성사', ...endStages]

  // 파이프라인 대상자 필터링 & 매출 데이터 결합
  const activeClients = useMemo(() => {
    if (!clients || !Array.isArray(clients)) return []

    // 각 거래처별 매출 계산
    const clientRevenueMap = new Map()
    if (sales && Array.isArray(sales)) {
      sales.forEach(sale => {
        const clientId = sale.clientId || sale.client_id
        if (clientId) {
          const amount = Number(sale.totalAmount || sale.total_amount || 0)
          clientRevenueMap.set(String(clientId), (clientRevenueMap.get(String(clientId)) || 0) + amount)
        }
      })
    }

    return clients
      .filter((client) => {
        const status = normalizeStatus(client.status)
        return stages.includes(status)
      })
      .map(client => ({
        ...client,
        revenue: clientRevenueMap.get(String(client.id)) || client.orderAmount || 0
      }))
  }, [clients, stages, sales])

  // 수동 휴면 VIP 발굴 함수
  const handleDiscoverDormantVIPs = async () => {
    try {
      setToast('휴면 VIP 고객을 검색하는 중...')

      const now = new Date()
      const oneYearAgo = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate())
      const oneYearAgoStr = oneYearAgo.toISOString().split('T')[0]

      console.log('[Pipeline Discovery] Dormant period threshold (1 year):', oneYearAgoStr)

      // 1. 전체 매출 데이터 조회 (페이지네이션으로 모든 데이터 가져오기)
      let allSales = []
      let hasMore = true
      let page = 0
      const pageSize = 1000

      while (hasMore) {
        const { data: salesPage, error: salesError } = await supabase
          .from('sales')
          .select('client_id, sale_date, total_amount')
          .order('sale_date', { ascending: false })
          .range(page * pageSize, (page + 1) * pageSize - 1)

        if (salesError) throw salesError

        if (salesPage && salesPage.length > 0) {
          allSales = allSales.concat(salesPage)
          page++
          // 마지막 페이지인지 확인
          if (salesPage.length < pageSize) {
            hasMore = false
          }
        } else {
          hasMore = false
        }
      }


      if (!allSales || allSales.length === 0) {
        setToast('매출 데이터가 없습니다.')
        return
      }

      console.log('[Pipeline Discovery] Total sales records:', allSales.length)

      // 가장 오래된 매출 날짜 확인
      const oldestSale = allSales[allSales.length - 1]
      const newestSale = allSales[0]
      console.log('[Pipeline Discovery] Date range:', {
        oldest: oldestSale?.sale_date,
        newest: newestSale?.sale_date
      })

      // 2. 거래처별로 매출 집계 (누적 매출 & 마지막 거래일)
      const clientStatsMap = new Map()

      allSales.forEach(sale => {
        const clientId = sale.client_id
        if (!clientId) return

        const amount = Number(sale.total_amount || 0)
        const saleDate = sale.sale_date

        if (!clientStatsMap.has(clientId)) {
          clientStatsMap.set(clientId, {
            clientId: clientId,
            totalRevenue: 0,
            lastOrderDate: null
          })
        }

        const stats = clientStatsMap.get(clientId)
        stats.totalRevenue += amount

        // 마지막 거래일 갱신
        if (saleDate) {
          if (!stats.lastOrderDate || saleDate > stats.lastOrderDate) {
            stats.lastOrderDate = saleDate
          }
        }
      })

      console.log('[Pipeline Discovery] Unique clients with sales:', clientStatsMap.size)

      // 마지막 거래일 분포 확인
      const lastOrderDates = Array.from(clientStatsMap.values())
        .map(s => s.lastOrderDate)
        .filter(d => d)
        .sort()

      console.log('[Pipeline Discovery] Last order date distribution:', {
        oldest: lastOrderDates[0],
        newest: lastOrderDates[lastOrderDates.length - 1],
        sample: lastOrderDates.slice(0, 10)
      })

      // 3. 휴면 고객 필터링 (최근 1년 주문 없음 + 누적 매출 있음)
      const dormantCandidates = Array.from(clientStatsMap.values()).filter(stats => {
        // 조건 1: 누적 매출이 있어야 함
        if (stats.totalRevenue <= 0) return false

        // 조건 2: 마지막 주문일이 1년 이전이어야 함
        if (!stats.lastOrderDate) return false
        if (stats.lastOrderDate >= oneYearAgoStr) return false

        return true
      })

      console.log('[Pipeline Discovery] Dormant candidates found:', dormantCandidates.length)
      console.log('[Pipeline Discovery] Sample dormant clients:', dormantCandidates.slice(0, 3))

      if (dormantCandidates.length === 0) {
        setToast('발굴 가능한 휴면 VIP 고객이 없습니다.')
        return
      }

      // 4. 누적 매출 기준 내림차순 정렬 후 상위 10개 선정
      const top10VIPs = dormantCandidates
        .sort((a, b) => b.totalRevenue - a.totalRevenue)
        .slice(0, 10)

      console.log('[Pipeline Discovery] Top 10 VIPs:', top10VIPs)

      // 5. 기존 '잠재고객' 상태인 클라이언트를 '활성'으로 초기화
      const { data: currentPotentials, error: potentialsError } = await supabase
        .from('clients')
        .select('id')
        .eq('status', '잠재고객')

      if (potentialsError) throw potentialsError

      const idsToReset = (currentPotentials || []).map(c => c.id)

      // 6. 새로운 Top 10을 '잠재고객'으로 설정
      const idsToSet = top10VIPs.map(stats => stats.clientId)

      // 7. Bulk Update 실행
      if (idsToReset.length > 0) {
        const { error: resetError } = await supabase
          .from('clients')
          .update({ status: '활성' })
          .in('id', idsToReset)
        if (resetError) throw resetError
      }

      if (idsToSet.length > 0) {
        const { error: setError } = await supabase
          .from('clients')
          .update({ status: '잠재고객' })
          .in('id', idsToSet)
        if (setError) throw setError
      }

      setToast(`${top10VIPs.length}개의 휴면 VIP 고객을 발굴했습니다. 잠시 후 자동으로 새로고침됩니다.`)

      // 데이터 새로고침을 위해 페이지 리로드
      setTimeout(() => {
        window.location.reload()
      }, 2000)

    } catch (error) {
      console.error('[Discover Dormant VIPs Error]', error)
      setToast('휴면 VIP 발굴 중 오류가 발생했습니다.')
    }
  }

  // 단계별로 클라이언트 그룹화 및 매출액 순 정렬
  const clientsByStage = useMemo(() => {
    const grouped = {}
    stages.forEach((stage) => {
      grouped[stage] = activeClients
        .filter((client) => normalizeStatus(client.status) === stage)
        .sort((a, b) => b.revenue - a.revenue) // 매출액 높은 순 정렬
    })
    return grouped
  }, [activeClients, stages])

  // 드래그 앤 드롭 핸들러
  const handleDragEnd = async (result) => {
    const { destination, source, draggableId } = result

    if (!destination) return
    if (
      destination.droppableId === source.droppableId &&
      destination.index === source.index
    ) {
      return
    }

    const clientId = draggableId
    const client = clients.find((c) => c.id === clientId) // activeClients 대신 전체 clients에서 검색 (안전장치)

    if (!client) return

    try {
      // '계약 성사' 영역으로 드롭
      if (destination.droppableId === 'win-zone') {
        const confirmed = await showConfirm(
          '계약이 완료되었습니다. 해당 거래처를 \'매출\' 상태로 전환하고 매출 실적에 반영하시겠습니까?',
          '축하합니다! 계약 성사',
          '매출 상태 전환',
          '취소',
          'success',
          '#4f46e5' // Indigo-600
        )

        if (!confirmed) return

        // 1. 상태 변경
        await updateClient(clientId, {
          ...client,
          status: coerceClientStatus('매출'),
        })

        // 2. 매출 등록
        const today = new Date().toISOString().split('T')[0]
        try {
          await addSale({
            rows: [{
              clientId: clientId,
              sale_date: today,
              item_name: '신규 계약', // 기본 품목명
              quantity: 1,
              unitPrice: 0,
              totalAmount: 0, // 금액은 나중에 수정하도록 0으로
              notes: '파이프라인 계약 성사',
            }]
          })
        } catch (saleError) {
          console.error('매출 등록 오류:', saleError)
        }

        setToast('계약이 성사되어 \'매출\' 상태로 전환되었습니다')
        return
      }

      // 일반 단계 이동
      const newStatus = destination.droppableId
      if (stages.includes(newStatus)) {
        await updateClient(clientId, {
          ...client,
          status: newStatus,
        })
      }
    } catch (error) {
      console.error('상태 업데이트 중 오류:', error)
      setToast('상태 업데이트 중 오류가 발생했습니다.')
    }
  }

  // 로딩 상태
  if (loading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-200px)]">
        <div className="text-oem-text-secondary text-sm animate-pulse">데이터를 불러오는 중...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-oem-bg-app p-4 md:p-6 font-['Noto_Sans_KR',sans-serif] text-oem-text-primary mt-[50px]">
      <div className="max-w-[1800px] mx-auto space-y-4 md:space-y-6">

        {/* Page Title Section */}
        <div className="flex items-center justify-between border-b border-oem-border pb-3">
          <div>
            <h1 className="text-lg md:text-xl font-bold tracking-tight text-oem-blue flex items-center gap-2">
              Pipeline Status
              <span className="text-[10px] bg-oem-bg-header text-oem-text-secondary px-2 py-0.5 rounded-full font-normal hidden md:inline-block">Sales Opportunities</span>
            </h1>
          </div>
          <div className="flex items-center gap-2 md:gap-4 text-[10px] md:text-[11px] text-oem-text-secondary font-medium">
            <span className="hidden md:flex items-center gap-1"><span className="w-2 h-2 bg-oem-green rounded-full"></span> System Healthy</span>
            <span>Total: {activeClients.length}</span>
          </div>
        </div>

        {/* Mobile Tab Navigation (Visible only on small screens) */}
        <div className="md:hidden flex overflow-x-auto gap-2 pb-2 -mx-4 px-4 no-scrollbar">
          {mobileTabs.map((stage) => (
            <button
              key={stage}
              onClick={() => setCurrentMobileStage(stage)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-[12px] font-bold border transition-colors ${currentMobileStage === stage
                  ? 'bg-oem-blue text-white border-oem-blue'
                  : 'bg-white text-oem-text-secondary border-oem-border'
                }`}
            >
              {stage}
            </button>
          ))}
        </div>

        {/* Pipeline Board */}
        <div className="overflow-x-auto pb-6">
          <div className="md:min-w-[1200px]">
            <DragDropContext onDragEnd={handleDragEnd}>
              {/* Main Pipeline Row */}
              <div className="flex flex-col md:flex-row gap-4 items-start mb-6">

                {/* Stages Loop */}
                {mainStages.map((stage) => {
                  return (
                    <div
                      key={stage}
                      className={`flex-shrink-0 w-full md:w-72 flex flex-col bg-white border border-oem-border rounded-oem shadow-sm ${currentMobileStage === stage ? 'block' : 'hidden md:flex'
                        }`}
                      style={{ minHeight: '600px' }}
                    >
                      {/* Column Header */}
                      <div className="p-3 border-b border-oem-border bg-oem-bg-header/50">
                        <div className="flex items-center justify-between mb-2">
                          <h3 className="font-bold text-sm text-oem-text-primary">{stage}</h3>
                          <span className="bg-oem-blue/10 text-oem-blue text-[10px] font-bold px-2 py-0.5 rounded-full">
                            {(clientsByStage[stage] || []).length}
                          </span>
                        </div>
                        {stage === '잠재고객' && (
                          <button
                            onClick={handleDiscoverDormantVIPs}
                            className="w-full px-2 py-1.5 bg-white border border-oem-border hover:border-oem-blue text-oem-text-primary text-[10px] font-bold rounded flex items-center justify-center gap-1 transition-colors"
                          >
                            <TrendingUp className="w-3 h-3 text-oem-blue" />
                            휴면 VIP 발굴
                          </button>
                        )}
                        <div className="h-0.5 w-full bg-oem-border mt-2 rounded-full overflow-hidden">
                          <div className="h-full bg-oem-blue w-full opacity-50" />
                        </div>
                      </div>

                      {/* Droppable Area */}
                      <Droppable droppableId={stage}>
                        {(provided, snapshot) => (
                          <div
                            ref={provided.innerRef}
                            {...provided.droppableProps}
                            className={`flex-1 p-2 space-y-2 transition-colors ${snapshot.isDraggingOver ? 'bg-oem-blue/5' : ''
                              }`}
                          >
                            {(clientsByStage[stage] || []).map((client, index) => (
                              <Draggable
                                key={client.id}
                                draggableId={client.id}
                                index={index}
                              >
                                {(provided, snapshot) => (
                                  <div
                                    ref={provided.innerRef}
                                    {...provided.draggableProps}
                                    {...provided.dragHandleProps}
                                    className={`bg-white p-3 rounded border border-oem-border hover:border-oem-blue transition-all cursor-grab active:cursor-grabbing group relative ${snapshot.isDragging ? 'shadow-lg rotate-1 border-oem-blue z-50' : ''
                                      }`}
                                    style={{ ...provided.draggableProps.style }}
                                  >
                                    <div className="flex justify-between items-start mb-1">
                                      <h4 className="font-bold text-sm text-oem-text-primary group-hover:text-oem-blue transition-colors break-words w-[90%]">
                                        {client.company}
                                      </h4>
                                    </div>

                                    <div className="space-y-1">
                                      <div className="flex items-center justify-between text-[11px] text-oem-text-secondary">
                                        <span>{client.contact_person || '-'}</span>
                                      </div>

                                      {client.revenue > 0 && (
                                        <div className="text-[11px] text-oem-text-primary font-bold mt-2 pt-1 border-t border-oem-border/50 flex justify-between items-center">
                                          <span className="text-oem-text-secondary font-normal text-[10px]">누적 매출</span>
                                          <span>₩{client.revenue.toLocaleString()}</span>
                                        </div>
                                      )}

                                      {client.lastOrder && (
                                        <div className="text-[10px] text-oem-text-secondary text-right pt-0.5">
                                          {client.lastOrder.split('T')[0]}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                )}
                              </Draggable>
                            ))}
                            {provided.placeholder}
                          </div>
                        )}
                      </Droppable>
                    </div>
                  )
                })}

                {/* Win Zone */}
                <div className={`flex-shrink-0 w-full md:w-64 md:pt-8 ${currentMobileStage === '계약 성사' ? 'block' : 'hidden md:block'
                  }`}>
                  <Droppable droppableId="win-zone">
                    {(provided, snapshot) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                        className={`h-[400px] rounded-oem border-2 border-dashed flex flex-col items-center justify-center p-6 transition-all ${snapshot.isDraggingOver
                          ? 'border-oem-green bg-oem-green/5'
                          : 'border-oem-border bg-oem-bg-app hover:border-oem-green/50'
                          }`}
                      >
                        <div className={`p-3 rounded-full mb-3 transition-colors ${snapshot.isDraggingOver ? 'bg-oem-green/20' : 'bg-oem-bg-header'
                          }`}>
                          <CheckCircle2 className={`w-6 h-6 ${snapshot.isDraggingOver ? 'text-oem-green' : 'text-oem-text-secondary'
                            }`} />
                        </div>
                        <h3 className={`font-bold text-sm mb-1 ${snapshot.isDraggingOver ? 'text-oem-green' : 'text-oem-text-secondary'
                          }`}>
                          계약 성사 (Win)
                        </h3>
                        <p className="text-[10px] text-center text-oem-text-secondary leading-relaxed">
                          협상이 완료된 카드를<br />여기로 드롭하세요
                        </p>
                        {provided.placeholder}
                      </div>
                    )}
                  </Droppable>
                </div>
              </div>

              {/* End Stages Row (Reused for Mobile Tab) */}
              <div className="flex flex-col md:flex-row gap-4 items-start md:border-t md:border-oem-border md:pt-6 md:mt-6">
                <div className="w-full">
                  <h2 className="hidden md:flex text-sm font-bold text-oem-text-secondary mb-4 items-center gap-2">
                    <span className="w-1.5 h-1.5 bg-oem-text-secondary rounded-full"></span>
                    종료 및 대기 단계
                  </h2>
                  <div className="flex gap-4">
                    {endStages.map((stage) => {
                      const isActive = currentMobileStage === stage
                      const stageClients = clientsByStage[stage] || []

                      return (
                        <div
                          key={stage}
                          className={`flex-shrink-0 w-full md:w-72 flex flex-col bg-oem-bg-app border border-oem-border rounded-oem opacity-70 hover:opacity-100 transition-opacity ${isActive ? 'block' : 'hidden md:flex'
                            }`}
                          style={{ minHeight: '300px' }}
                        >
                          <div className="p-3 border-b border-oem-border bg-oem-bg-header/30">
                            <div className="flex items-center justify-between">
                              <h3 className="font-bold text-sm text-oem-text-secondary">{stage}</h3>
                              <span className="bg-oem-border text-oem-text-secondary text-[10px] font-bold px-2 py-0.5 rounded-full">
                                {stageClients.length}
                              </span>
                            </div>
                          </div>

                          <Droppable droppableId={stage}>
                            {(provided, snapshot) => (
                              <div
                                ref={provided.innerRef}
                                {...provided.droppableProps}
                                className={`flex-1 p-2 space-y-2 transition-colors ${snapshot.isDraggingOver ? 'bg-black/5' : ''
                                  }`}
                              >
                                {stageClients.map((client, index) => (
                                  <Draggable
                                    key={client.id}
                                    draggableId={client.id}
                                    index={index}
                                  >
                                    {(provided, snapshot) => (
                                      <div
                                        ref={provided.innerRef}
                                        {...provided.draggableProps}
                                        {...provided.dragHandleProps}
                                        className="bg-white p-3 rounded border border-oem-border shadow-sm"
                                        style={{ ...provided.draggableProps.style }}
                                      >
                                        <h4 className="font-bold text-sm text-oem-text-secondary mb-1">
                                          {client.company}
                                        </h4>
                                        <div className="text-[10px] text-oem-text-secondary">
                                          {client.contact_person || '-'}
                                        </div>
                                      </div>
                                    )}
                                  </Draggable>
                                ))}
                                {provided.placeholder}
                              </div>
                            )}
                          </Droppable>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            </DragDropContext>
          </div>
        </div>

        {toast && (
          <Toast
            message={toast}
            onClose={() => setToast(null)}
            duration={3000}
          />
        )}
      </div>
    </div>
  )
}

export default PipelineBoard
