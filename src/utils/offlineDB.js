import { openDB } from 'idb'

const DB_NAME = 'XavianCRM'
const DB_VERSION = 1

// IndexedDB 스토어 이름들
export const STORES = {
  CLIENTS: 'clients',
  ACTIVITIES: 'activities',
  SALES: 'sales',
  PRODUCTS: 'products',
  ISSUES: 'issues',
  SETTINGS: 'settings',
  PENDING_SCANS: 'pending_scans' // 오프라인 명함 스캔 대기 목록
}

/**
 * IndexedDB 초기화 및 DB 인스턴스 반환
 */
export const initDB = async () => {
  try {
    const db = await openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        // 각 스토어 생성 (이미 존재하면 무시)
        Object.values(STORES).forEach(storeName => {
          if (!db.objectStoreNames.contains(storeName)) {
            const store = db.createObjectStore(storeName, { keyPath: 'id' })
            // 인덱스 생성 (검색 최적화)
            store.createIndex('updated_at', 'updated_at', { unique: false })
            store.createIndex('created_at', 'created_at', { unique: false })
            
            // 특정 스토어별 인덱스
            if (storeName === STORES.ACTIVITIES) {
              store.createIndex('activity_date', 'activity_date', { unique: false })
              store.createIndex('client_id', 'client_id', { unique: false })
            }
            if (storeName === STORES.SALES) {
              store.createIndex('sale_date', 'sale_date', { unique: false })
              store.createIndex('client_id', 'client_id', { unique: false })
            }
            if (storeName === STORES.PENDING_SCANS) {
              store.createIndex('status', 'status', { unique: false })
              store.createIndex('timestamp', 'timestamp', { unique: false })
            }
          }
        })
      }
    })
    return db
  } catch (error) {
    console.error('IndexedDB 초기화 실패:', error)
    throw error
  }
}

/**
 * 특정 스토어의 모든 데이터 가져오기
 */
export const getAllFromStore = async (storeName) => {
  try {
    const db = await initDB()
    const tx = db.transaction(storeName, 'readonly')
    const store = tx.objectStore(storeName)
    const data = await store.getAll()
    await tx.done
    return data || []
  } catch (error) {
    console.error(`[offlineDB] ${storeName} 가져오기 실패:`, error)
    return []
  }
}

/**
 * 특정 스토어에 데이터 저장 (upsert)
 */
export const saveToStore = async (storeName, items) => {
  try {
    const db = await initDB()
    const tx = db.transaction(storeName, 'readwrite')
    const store = tx.objectStore(storeName)
    
    // 배열이면 여러 개, 단일 객체면 하나만 저장
    const itemsArray = Array.isArray(items) ? items : [items]
    
    for (const item of itemsArray) {
      // updated_at 타임스탬프 추가
      const itemWithTimestamp = {
        ...item,
        cached_at: new Date().toISOString(),
        updated_at: item.updated_at || new Date().toISOString()
      }
      await store.put(itemWithTimestamp)
    }
    
    await tx.done
    return true
  } catch (error) {
    console.error(`[offlineDB] ${storeName} 저장 실패:`, error)
    throw error
  }
}

/**
 * 특정 스토어에서 아이템 삭제
 */
export const deleteFromStore = async (storeName, id) => {
  try {
    const db = await initDB()
    const tx = db.transaction(storeName, 'readwrite')
    const store = tx.objectStore(storeName)
    await store.delete(id)
    await tx.done
    return true
  } catch (error) {
    console.error(`[offlineDB] ${storeName} 삭제 실패:`, error)
    throw error
  }
}

/**
 * 특정 스토어 전체 비우기
 */
export const clearStore = async (storeName) => {
  try {
    const db = await initDB()
    const tx = db.transaction(storeName, 'readwrite')
    const store = tx.objectStore(storeName)
    await store.clear()
    await tx.done
    return true
  } catch (error) {
    console.error(`[offlineDB] ${storeName} 비우기 실패:`, error)
    throw error
  }
}

/**
 * 모든 스토어의 데이터 가져오기 (초기 로딩용)
 */
export const getAllData = async () => {
  try {
    const [clients, activities, sales, products, issues, settings] = await Promise.all([
      getAllFromStore(STORES.CLIENTS),
      getAllFromStore(STORES.ACTIVITIES),
      getAllFromStore(STORES.SALES),
      getAllFromStore(STORES.PRODUCTS),
      getAllFromStore(STORES.ISSUES),
      getAllFromStore(STORES.SETTINGS)
    ])
    
    return {
      clients,
      activities,
      sales,
      products,
      issues,
      settings
    }
  } catch (error) {
    console.error('[offlineDB] 모든 데이터 가져오기 실패:', error)
    return {
      clients: [],
      activities: [],
      sales: [],
      products: [],
      issues: [],
      settings: []
    }
  }
}

/**
 * 특정 테이블명에 해당하는 스토어 이름 반환
 */
export const getStoreName = (tableName) => {
  const mapping = {
    'clients': STORES.CLIENTS,
    'activities': STORES.ACTIVITIES,
    'sales': STORES.SALES,
    'products': STORES.PRODUCTS,
    'issues': STORES.ISSUES,
    'settings': STORES.SETTINGS
  }
  return mapping[tableName] || null
}

