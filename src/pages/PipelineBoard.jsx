import React, { useState, useMemo } from 'react'
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd'
import { useData } from '../contexts/DataContext'
import { supabase } from '../lib/supabase'
import { CheckCircle2, TrendingUp, ArrowRight } from 'lucide-react'
import Toast from '../components/Toast'

const PipelineBoard = () => {
  const { clients, loading, updateClient } = useData()
  const [toast, setToast] = useState(null)

  // 영업 단계 정의 (거래중 제외)
  const stages = ['잠재고객', '연락중', '미팅예정', '견적제출', '협상중']

  // status가 '거래중'이 아닌 클라이언트만 필터링
  const activeClients = useMemo(() => {
    if (!clients || !Array.isArray(clients)) return []
    return clients.filter((client) => {
      const status = client.status || ''
      return status !== '거래중' && status !== 'Active'
    })
  }, [clients])

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
        // status를 '거래중'으로 변경
        await updateClient(clientId, {
          ...client,
          status: '거래중',
        })
        // 토스트 메시지 표시
        setToast('🎉 계약이 성사되었습니다!')
        return
      }

      // 일반 단계로 드롭한 경우
      const newStatus = destination.droppableId

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
        <div className="text-text-secondary">데이터를 불러오는 중...</div>
      </div>
    )
  }

  return (
    <div className="space-y-5 md:space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-text-primary flex items-center space-x-2">
            <TrendingUp className="w-6 h-6 md:w-8 md:h-8 text-brand-blue" />
            <span>영업 파이프라인</span>
          </h1>
          <p className="text-text-secondary mt-1.5 text-sm md:text-base">
            총 {activeClients.length}건의 영업 기회
          </p>
        </div>
      </div>

      <DragDropContext onDragEnd={handleDragEnd}>
        <div className="flex gap-4 overflow-x-auto pb-4">
          {/* 영업 단계 컬럼들 */}
          {stages.map((stage) => {
            const stageClients = clientsByStage[stage] || []
            return (
              <div
                key={stage}
                className="flex-shrink-0 w-72 bg-gray-50 rounded-lg p-4"
                style={{ minHeight: '600px' }}
              >
                {/* 컬럼 헤더 */}
                <div className="mb-4">
                  <h3 className="text-sm font-semibold text-text-primary mb-1">
                    {stage}
                  </h3>
                  <div className="text-xs text-text-secondary">
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
                        snapshot.isDraggingOver ? 'bg-blue-50 rounded-lg' : ''
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
                              className={`card p-4 cursor-move transition-all ${
                                snapshot.isDragging
                                  ? 'shadow-lg rotate-2'
                                  : 'hover:shadow-md'
                              }`}
                            >
                              <div className="space-y-2">
                                <h4 className="font-semibold text-text-primary text-sm">
                                  {client.company || '-'}
                                </h4>
                                {client.contact_person && (
                                  <p className="text-xs text-text-body">
                                    담당자: {client.contact_person}
                                  </p>
                                )}
                                {client.phone && (
                                  <p className="text-xs text-text-secondary">
                                    📞 {client.phone}
                                  </p>
                                )}
                                {client.email && (
                                  <p className="text-xs text-text-secondary truncate">
                                    ✉️ {client.email}
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
                  className={`bg-gray-50 rounded-lg p-4 border-2 border-dashed ${
                    snapshot.isDraggingOver
                      ? 'border-brand-green bg-brand-green bg-opacity-5'
                      : 'border-border-light'
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
                            ? 'text-brand-green'
                            : 'text-text-secondary'
                        }`}
                      />
                    </div>
                    <h3
                      className={`text-lg font-bold mb-2 ${
                        snapshot.isDraggingOver
                          ? 'text-brand-green'
                          : 'text-text-primary'
                      }`}
                    >
                      계약 성사 (Win)
                    </h3>
                    <div className="flex items-center space-x-2 mb-2">
                      <ArrowRight className="w-4 h-4 text-text-secondary" />
                      <p
                        className={`text-sm text-center ${
                          snapshot.isDraggingOver
                            ? 'text-brand-green font-semibold'
                            : 'text-text-secondary'
                        }`}
                      >
                        협상중 단계의 카드를
                      </p>
                    </div>
                    <p
                      className={`text-sm text-center mb-4 ${
                        snapshot.isDraggingOver
                          ? 'text-brand-green font-semibold'
                          : 'text-text-secondary'
                      }`}
                    >
                      여기로 끌어다 놓으세요
                    </p>
                    {snapshot.isDraggingOver && (
                      <div className="mt-4 text-brand-green font-semibold animate-pulse text-lg">
                        놓으세요! 🎉
                      </div>
                    )}
                    {!snapshot.isDraggingOver && (
                      <div className="text-xs text-text-secondary text-center mt-4">
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
