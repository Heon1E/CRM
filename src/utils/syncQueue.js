import { openDB } from 'idb'

const QUEUE_DB_NAME = 'XavianCRM_SyncQueue'
const QUEUE_DB_VERSION = 1
const QUEUE_STORE = 'pendingOperations'

/**
 * 동기화 큐 DB 초기화
 */
const initQueueDB = async () => {
  try {
    const db = await openDB(QUEUE_DB_NAME, QUEUE_DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(QUEUE_STORE)) {
          const store = db.createObjectStore(QUEUE_STORE, { 
            keyPath: 'id',
            autoIncrement: true 
          })
          // 테이블명과 타임스탬프로 인덱싱
          store.createIndex('table', 'table', { unique: false })
          store.createIndex('timestamp', 'timestamp', { unique: false })
          store.createIndex('status', 'status', { unique: false })
        }
      }
    })
    return db
  } catch (error) {
    console.error('[syncQueue] DB 초기화 실패:', error)
    throw error
  }
}

/**
 * 작업 상태
 */
export const QUEUE_STATUS = {
  PENDING: 'pending',
  SYNCING: 'syncing',
  COMPLETED: 'completed',
  FAILED: 'failed'
}

/**
 * 작업 타입
 */
export const QUEUE_OPERATION = {
  INSERT: 'insert',
  UPDATE: 'update',
  DELETE: 'delete'
}

/**
 * 큐에 작업 추가
 * 
 * @param {string} table - 테이블명 ('clients', 'activities' 등)
 * @param {string} operation - 작업 타입 ('insert', 'update', 'delete')
 * @param {Object} data - 작업에 필요한 데이터
 * @param {string} tempId - 임시 ID (insert의 경우)
 */
export const addToQueue = async (table, operation, data, tempId = null) => {
  try {
    const db = await initQueueDB()
    const tx = db.transaction(QUEUE_STORE, 'readwrite')
    const store = tx.objectStore(QUEUE_STORE)
    
    const queueItem = {
      table,
      operation,
      data,
      tempId: tempId || (data.id ? `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}` : null),
      timestamp: new Date().toISOString(),
      status: QUEUE_STATUS.PENDING,
      retryCount: 0,
      lastError: null
    }
    
    const id = await store.add(queueItem)
    await tx.done
    
    // 큐에 작업이 추가되었음을 이벤트로 알림
    window.dispatchEvent(new CustomEvent('syncQueueUpdated', { 
      detail: { count: await getQueueCount() } 
    }))
    
    return id
  } catch (error) {
    console.error('[syncQueue] 작업 추가 실패:', error)
    throw error
  }
}

/**
 * 큐의 모든 대기 중인 작업 가져오기
 */
export const getPendingOperations = async () => {
  try {
    const db = await initQueueDB()
    const tx = db.transaction(QUEUE_STORE, 'readonly')
    const store = tx.objectStore(QUEUE_STORE)
    const index = store.index('status')
    
    // PENDING 상태인 작업만 가져오기 (타임스탬프 오름차순)
    const pendingOps = await index.getAll(QUEUE_STATUS.PENDING)
    await tx.done
    
    return pendingOps.sort((a, b) => 
      new Date(a.timestamp) - new Date(b.timestamp)
    )
  } catch (error) {
    console.error('[syncQueue] 대기 작업 가져오기 실패:', error)
    return []
  }
}

/**
 * 큐의 작업 개수 가져오기
 */
export const getQueueCount = async () => {
  try {
    const db = await initQueueDB()
    const tx = db.transaction(QUEUE_STORE, 'readonly')
    const store = tx.objectStore(QUEUE_STORE)
    const index = store.index('status')
    const count = await index.count(QUEUE_STATUS.PENDING)
    await tx.done
    return count
  } catch (error) {
    console.error('[syncQueue] 큐 개수 가져오기 실패:', error)
    return 0
  }
}

/**
 * 작업 상태 업데이트
 */
export const updateQueueStatus = async (id, status, error = null) => {
  try {
    const db = await initQueueDB()
    const tx = db.transaction(QUEUE_STORE, 'readwrite')
    const store = tx.objectStore(QUEUE_STORE)
    
    const item = await store.get(id)
    if (!item) {
      throw new Error(`큐 아이템을 찾을 수 없습니다: ${id}`)
    }
    
    item.status = status
    if (error) {
      item.lastError = error.message || String(error)
      item.retryCount = (item.retryCount || 0) + 1
    }
    
    if (status === QUEUE_STATUS.COMPLETED) {
      // 완료된 작업은 24시간 후 삭제 예약 (선택사항)
      // 여기서는 즉시 삭제하지 않고 상태만 변경
    }
    
    await store.put(item)
    await tx.done
    
    // 큐 상태 변경 알림
    window.dispatchEvent(new CustomEvent('syncQueueUpdated', { 
      detail: { count: await getQueueCount() } 
    }))
    
    return true
  } catch (error) {
    console.error('[syncQueue] 상태 업데이트 실패:', error)
    throw error
  }
}

/**
 * 작업 제거 (완료된 작업 정리)
 */
export const removeFromQueue = async (id) => {
  try {
    const db = await initQueueDB()
    const tx = db.transaction(QUEUE_STORE, 'readwrite')
    const store = tx.objectStore(QUEUE_STORE)
    await store.delete(id)
    await tx.done
    
    // 큐 상태 변경 알림
    window.dispatchEvent(new CustomEvent('syncQueueUpdated', { 
      detail: { count: await getQueueCount() } 
    }))
    
    return true
  } catch (error) {
    console.error('[syncQueue] 작업 제거 실패:', error)
    throw error
  }
}

/**
 * 완료된 작업들 정리 (24시간 이상 지난 것들)
 */
export const cleanupCompletedOperations = async () => {
  try {
    const db = await initQueueDB()
    const tx = db.transaction(QUEUE_STORE, 'readwrite')
    const store = tx.objectStore(QUEUE_STORE)
    
    const completedOps = await store.index('status').getAll(QUEUE_STATUS.COMPLETED)
    const now = new Date()
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)
    
    for (const op of completedOps) {
      const opDate = new Date(op.timestamp)
      if (opDate < oneDayAgo) {
        await store.delete(op.id)
      }
    }
    
    await tx.done
    return true
  } catch (error) {
    console.error('[syncQueue] 완료 작업 정리 실패:', error)
    return false
  }
}

