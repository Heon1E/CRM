import React, { useState, useMemo, useEffect } from 'react'
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd'
import { useData } from '../contexts/DataContext'
import { supabase } from '../lib/supabase'
import { CheckCircle2, TrendingUp, ArrowRight, Mail } from 'lucide-react'
import Toast from '../components/Toast'
import { showConfirm } from '../utils/alert'

const PipelineBoard = () => {
  const { clients, loading, updateClient, addSale } = useData()
  const [toast, setToast] = useState(null)

  // 영업 단계 정의 (거래중 제외)
  const stages = ['잠재고객', '연락중', '미팅예정', '견적제출', '협상중']

  // 파이프라인 대상자 필터링: '신규' 또는 '단절' 상태인 거래처만 포함
  // '활성' 상태인 거래처는 파이프라인에서 제외
  const activeClients = useMemo(() => {
    if (!clients || !Array.isArray(clients)) return []
    return clients.filter((client) => {
      const status = client.status || ''
      // 파이프라인 단계에 해당하는 상태 또는 '신규', '단절' 상태만 포함
      const pipelineStatuses = ['잠재고객', '연락중', '미팅예정', '견적제출', '협상중']
      return pipelineStatuses.includes(status) || status === '신규' || status === '단절'
    })
  }, [clients])

  // 기존 데이터 자동 동기화: '신규' 또는 '단절' 상태인 거래처를 첫 번째 단계('잠재고객')로 자동 설정
  useEffect(() => {
    if (loading || !clients || !Array.isArray(clients)) return
    
    const syncNewClients = async () => {
      // 파이프라인 단계 정의 (Hook 순서 유지를 위해 상수로 정의)
      const pipelineStages = ['잠재고객', '연락중', '미팅예정', '견적제출', '협상중']
      
      // '신규' 또는 '단절' 상태인 거래처 중 파이프라인 단계에 없는 것들 찾기
      const newOrInactiveClients = clients.filter((client) => {
        const status = client.status || ''
        return (status === '신규' || status === '단절') && !pipelineStages.includes(status)
      })

      // 각 거래처를 '잠재고객' 단계로 자동 설정
      for (const client of newOrInactiveClients) {
        try {
          await updateClient(client.id, {
            ...client,
            status: '잠재고객',
          })
        } catch (error) {
          console.error(`거래처 자동 동기화 오류 (${client.company || client.id}):`, error)
        }
      }
    }

    syncNewClients()
  }, [clients, loading, updateClient])

  // 단계별로 클라이언트 그룹화
  const clientsByStage = useMemo(() => {
    const grouped = {}
    stages.forEach((stage) => {
      grouped[stage] = activeClients.filter((client) => {
        const status = client.status || '잠재고객'
        return status === stage
      })
    })
    return grouped
  }, [activeClients, stages])

  // 드래그 앤 드롭 핸들러
  const handleDragEnd = async (result) => {
    const { destination, source, draggableId } = result

    // 드롭 위치가 없으면 무시
    if (!destination) return

    // 같은 위치면 무시
    if (
      destination.droppableId === source.droppableId &&
      destination.index === source.index
    ) {
      return
    }

    const clientId = draggableId
    const client = activeClients.find((c) => c.id === clientId)

    if (!client) return

    try {
      // '계약 성사' 영역으로 드롭한 경우
      if (destination.droppableId === 'win-zone') {
        // 사용자 확인
        const confirmed = await showConfirm(
          '계약이 완료되었습니다. 해당 거래처를 \'활성\' 고객으로 전환하고 매출 실적에 반영하시겠습니까?',
          '축하합니다! 계약 성사',
          '활성 고객 전환',
          '취소',
          'success',
          '#10b981' // 녹색 (green-500)
        )

        if (!confirmed) {
          // 취소하면 드래그 취소
          return
        }

        // 1. 거래처 status를 '활성'으로 변경
        await updateClient(clientId, {
          ...client,
          status: '활성',
        })

        // 2. 매출 테이블에 새 데이터 추가 (날짜: 오늘, 거래처: 해당 거래처, 금액: 0 또는 기본값)
        const today = new Date().toISOString().split('T')[0]
        try {
          await addSale({
            rows: [{
              clientId: clientId,
              sale_date: today,
              item_name: '계약 완료',
              quantity: 1,
              unitPrice: 0,
              totalAmount: 0,
              notes: '파이프라인에서 계약 완료로 자동 등록',
            }]
          })
        } catch (saleError) {
          console.error('매출 등록 오류:', saleError)
          // 매출 등록 실패해도 거래처 상태 변경은 유지
        }

        // 토스트 메시지 표시
        setToast('계약이 성사되어 \'활성\' 고객으로 전환되었습니다')
        return
      }

      // 일반 단계로 드롭한 경우
      const newStatus = destination.droppableId
      const oldStatus = client.status || ''

      // 이전 단계로 되돌리는 경우 확인 (활성 -> 파이프라인 단계로 되돌리는 경우)
      if (oldStatus === '활성' && stages.includes(newStatus)) {
        const confirmed = window.confirm(
          '이미 \'활성\' 상태인 고객을 파이프라인 단계로 되돌리시겠습니까?\n\n' +
          '상태를 \'신규\'로 변경하시겠습니까? (취소 시 현재 상태 유지)'
        )
        if (confirmed) {
          // 사용자가 확인하면 '신규'로 변경
          await updateClient(clientId, {
            ...client,
            status: '신규',
          })
          setToast('고객 상태가 \'신규\'로 변경되었습니다')
          return
        } else {
          // 취소하면 상태 유지 (드래그 취소)
          return
        }
      }

      // 유효한 단계인지 확인
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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-gray-300">데이터를 불러오는 중...</div>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <p className="text-gray-300 text-[11px] font-bold uppercase tracking-[0.15em] mb-1">Overview</p>
          <h1 className="text-2xl md:text-3xl font-semibold text-white flex items-center space-x-2">
            <TrendingUp className="w-6 h-6 md:w-8 md:h-8 text-gray-300" />
            <span>영업 파이프라인</span>
          </h1>
          <p className="text-gray-300 mt-1.5 text-sm md:text-base">
            총 {activeClients.length}건의 영업 기회
          </p>
        </div>
      </div>

      <DragDropContext onDragEnd={handleDragEnd}>
        <div className="flex gap-6 overflow-x-auto pb-4">
          {/* 영업 단계 컬럼들 */}
          {stages.map((stage) => {
            const stageClients = clientsByStage[stage] || []
            return (
              <div
                key={stage}
                className="flex-shrink-0 w-72 bg-[#1E1E1E] border border-gray-800 rounded-2xl p-4 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)] transition-all hover:border-gray-700 hover:bg-white/5"
                style={{ minHeight: '600px' }}
              >
                {/* 컬럼 헤더 */}
                <div className="mb-4">
                  <h3 className="text-sm font-semibold text-white mb-1">
                    {stage}
                  </h3>
                  <div className="text-xs text-gray-300">
                    {stageClients.length}건
                  </div>
                </div>

                {/* 드롭 영역 */}
                <Droppable droppableId={stage}>
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      className={`space-y-3 min-h-[500px] ${
                        snapshot.isDraggingOver ? 'bg-white/5 rounded-lg' : ''
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
                              className={`card p-4 cursor-move transition-all bg-[#1E1E1E] border-gray-800 rounded-xl shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)] ${
                                snapshot.isDragging
                                  ? 'rotate-2'
                                  : 'hover:bg-white/5 hover:border-gray-700'
                              }`}
                            >
                              <div className="space-y-2">
                                <h4 className="font-semibold text-white text-sm">
                                  {client.company || '-'}
                                </h4>
                                {client.contact_person && (
                                  <p className="text-xs text-gray-300">
                                    담당자: {client.contact_person}
                                  </p>
                                )}
                                {client.phone && (
                                  <p className="text-xs text-gray-300">
                                    {client.phone}
                                  </p>
                                )}
                                {client.email && (
                                  <p className="flex items-center gap-1 text-xs text-gray-300 truncate">
                                    <Mail className="w-3.5 h-3.5 text-gray-300" />
                                    <span className="truncate">{client.email}</span>
                                  </p>
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

          {/* 계약 성사 영역 */}
          <div className="flex-shrink-0 w-72">
            <Droppable droppableId="win-zone">
              {(provided, snapshot) => (
                <div
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                  className={`bg-[#1E1E1E] rounded-2xl p-4 border-2 border-dashed shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)] transition-all ${
                    snapshot.isDraggingOver
                      ? 'border-blue-400/40 bg-blue-500/10'
                      : 'border-gray-800 hover:border-gray-700 hover:bg-white/5'
                  }`}
                  style={{ minHeight: '600px' }}
                >
                  <div className="flex flex-col items-center justify-center h-full">
                    <div
                      className={`mb-4 ${
                        snapshot.isDraggingOver ? 'scale-110' : ''
                      } transition-transform`}
                    >
                      <CheckCircle2
                        className={`w-12 h-12 ${
                          snapshot.isDraggingOver
                            ? 'text-blue-300'
                            : 'text-gray-300'
                        }`}
                      />
                    </div>
                    <h3
                      className={`text-lg font-bold mb-2 ${
                        snapshot.isDraggingOver
                          ? 'text-blue-300'
                          : 'text-white'
                      }`}
                    >
                      계약 성사 (Win)
                    </h3>
                    <div className="flex items-center space-x-2 mb-2">
                      <ArrowRight className="w-4 h-4 text-gray-300" />
                      <p
                        className={`text-sm text-center ${
                          snapshot.isDraggingOver
                            ? 'text-blue-300 font-semibold'
                            : 'text-gray-300'
                        }`}
                      >
                        협상중 단계의 카드를
                      </p>
                    </div>
                    <p
                      className={`text-sm text-center mb-4 ${
                        snapshot.isDraggingOver
                          ? 'text-blue-300 font-semibold'
                          : 'text-gray-300'
                      }`}
                    >
                      여기로 끌어다 놓으세요
                    </p>
                    {snapshot.isDraggingOver && (
                      <div className="mt-4 text-blue-300 font-semibold animate-pulse text-lg">
                        놓으세요! 🎉
                      </div>
                    )}
                    {!snapshot.isDraggingOver && (
                      <div className="text-xs text-gray-300 text-center mt-4">
                        드롭존
                      </div>
                    )}
                  </div>
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          </div>
        </div>
      </DragDropContext>

      {/* 토스트 메시지 */}
      {toast && (
        <Toast
          message={toast}
          onClose={() => setToast(null)}
          duration={3000}
        />
      )}
    </div>
  )
}

export default PipelineBoard



