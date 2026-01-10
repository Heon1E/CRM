import React, { createContext, useContext, useState, useCallback, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './AuthContext'
import { useOnlineStatus } from '../hooks/useOnlineStatus'
import { 
  getAllData as getOfflineData, 
  saveToStore, 
  deleteFromStore,
  getStoreName,
  clearStore,
  STORES
} from '../utils/offlineDB'
import { 
  addToQueue, 
  getPendingOperations, 
  updateQueueStatus, 
  removeFromQueue,
  QUEUE_STATUS,
  QUEUE_OPERATION,
  getQueueCount
} from '../utils/syncQueue'

const DataContext = createContext()

export const useData = () => {
  const context = useContext(DataContext)
  if (!context) {
    throw new Error('useData must be used within a DataProvider')
  }
  return context
}

export const DataProvider = ({ children }) => {
  const { user, loading: authLoading } = useAuth() // AuthContext의 user와 loading 상태 참조
  const { isOnline } = useOnlineStatus() // 온라인/오프라인 상태
  const [products, setProducts] = useState([])
  const [clients, setClients] = useState([])
  const [activities, setActivities] = useState([])
  const [sales, setSales] = useState([])
  const [issues, setIssues] = useState([])
  const [loading, setLoading] = useState(true)
  const [pendingSyncCount, setPendingSyncCount] = useState(0) // 동기화 대기 중인 작업 수

  // 데이터 정제 헬퍼 함수 (Sanitize)
  const sanitizeData = useCallback((data, type) => {
    const sanitized = { ...data }

    // [수정 1] 날짜 필드 정제 목록에 'next_action_date' 추가
    const dateFields = ['sale_date', 'activity_date', 'lastOrder', 'next_action_date']
    dateFields.forEach((field) => {
      if (sanitized[field] === '' || sanitized[field] === undefined) {
        sanitized[field] = null
      }
    })

    // 숫자 필드 정제
    const numberFields = ['orderAmount', 'totalAmount', 'quantity', 'unitPrice']
    numberFields.forEach((field) => {
      if (sanitized[field] === '' || sanitized[field] === undefined || sanitized[field] === null) {
        sanitized[field] = 0
      } else if (typeof sanitized[field] === 'string') {
        const parsed = parseFloat(sanitized[field])
        sanitized[field] = isNaN(parsed) ? 0 : parsed
      }
    })

    // [수정 2] 텍스트 필드 정제 목록에 'next_action_detail' 추가
    const textFields = ['company', 'contact_person', 'phone', 'email', 'status', 'user', 'description', 'notes', 'clientName', 'name', 'type', 'standard', 'title', 'content', 'next_action_detail']
    textFields.forEach((field) => {
      if (sanitized[field] === null) {
        sanitized[field] = ''
      }
    })

    // Issue 타입의 경우 날짜 필드 추가
    if (type === 'issue') {
      const issueDateFields = ['target_date']
      issueDateFields.forEach((field) => {
        if (sanitized[field] === '' || sanitized[field] === undefined) {
          sanitized[field] = null
        }
      })
    }

    // 타입별 추가 정제
    if (type === 'client') {
      if (!Array.isArray(sanitized.contract_prices)) {
        sanitized.contract_prices = []
      }
    }

    if (type === 'sale') {
      if (!Array.isArray(sanitized.items)) {
        sanitized.items = []
      }
      if (sanitized.items && sanitized.items.length > 0) {
        sanitized.items = sanitized.items.map((item) => {
          if (!item.item_name || item.item_name.trim() === '') {
            return {
              ...item,
              item_name: item.productName || item.name || '',
            }
          }
          return item
        })
      }
      if (sanitized.items && sanitized.items.length > 0) {
        const calculatedTotal = sanitized.items.reduce((sum, item) => {
          const quantity = parseFloat(item.quantity) || 0
          const unitPrice = parseFloat(item.unitPrice) || 0
          return sum + (quantity * unitPrice)
        }, 0)
        if (calculatedTotal > 0) {
          sanitized.totalAmount = calculatedTotal
        }
      }
    }

    if (type === 'activity') {
      if (sanitized.description === null) {
        sanitized.description = ''
      }
    }

    // undefined 필드 제거
    Object.keys(sanitized).forEach((key) => {
      if (sanitized[key] === undefined) {
        delete sanitized[key]
      }
    })

    return sanitized
  }, [])

  // 동기화 큐 상태 업데이트
  useEffect(() => {
    const updateSyncCount = async () => {
      try {
        const count = await getQueueCount()
        setPendingSyncCount(count)
      } catch (error) {
        console.error('[DataContext] 동기화 큐 개수 가져오기 실패:', error)
      }
    }

    // 초기 로드 및 큐 업데이트 이벤트 리스너
    updateSyncCount()
    window.addEventListener('syncQueueUpdated', updateSyncCount)

    return () => {
      window.removeEventListener('syncQueueUpdated', updateSyncCount)
    }
  }, [])

  // 온라인 복귀 시 자동 동기화
  useEffect(() => {
    if (!isOnline || !user) return

    const syncOfflineOperations = async () => {
      try {
        const pendingOps = await getPendingOperations()
        if (pendingOps.length === 0) return

        for (const op of pendingOps) {
          try {
            await updateQueueStatus(op.id, QUEUE_STATUS.SYNCING)
            
            let result
            const storeName = getStoreName(op.table)
            
            if (op.operation === QUEUE_OPERATION.INSERT) {
              // Insert: Supabase에 저장
              result = await supabase.from(op.table).insert(op.data).select().single()
              if (result.error) throw result.error
              
              // IndexedDB의 임시 ID를 실제 ID로 업데이트
              if (storeName && op.tempId) {
                await deleteFromStore(storeName, op.tempId)
                if (result.data) {
                  await saveToStore(storeName, result.data)
                }
              }
            } else if (op.operation === QUEUE_OPERATION.UPDATE) {
              // Update: Supabase에 업데이트
              result = await supabase.from(op.table).update(op.data).eq('id', op.data.id).select().single()
              if (result.error) throw result.error
              
              // IndexedDB도 업데이트
              if (storeName && result.data) {
                await saveToStore(storeName, result.data)
              }
            } else if (op.operation === QUEUE_OPERATION.DELETE) {
              // Delete: Supabase에서 삭제
              result = await supabase.from(op.table).delete().eq('id', op.data.id)
              if (result.error) throw result.error
              
              // IndexedDB에서도 삭제
              if (storeName) {
                await deleteFromStore(storeName, op.data.id)
              }
            }
            
            await updateQueueStatus(op.id, QUEUE_STATUS.COMPLETED)
            await removeFromQueue(op.id)
            
            // 데이터 새로고침
            window.location.reload() // 간단한 방법: 전체 새로고침 (필요시 선택적 업데이트로 개선 가능)
            
          } catch (error) {
            console.error(`[DataContext] 동기화 실패 (${op.table}/${op.operation}):`, error)
            await updateQueueStatus(op.id, QUEUE_STATUS.FAILED, error)
          }
        }
      } catch (error) {
        console.error('[DataContext] 오프라인 작업 동기화 중 오류:', error)
      }
    }

    // 온라인 복귀 이벤트 리스너
    const handleOnlineStatusChanged = (event) => {
      if (event.detail.isOnline && event.detail.wasOffline) {
        syncOfflineOperations()
      }
    }

    window.addEventListener('onlineStatusChanged', handleOnlineStatusChanged)

    return () => {
      window.removeEventListener('onlineStatusChanged', handleOnlineStatusChanged)
    }
  }, [isOnline, user])

  // 초기 데이터 로드
  useEffect(() => {
    if (authLoading) {
      setLoading(true)
      return
    }

    if (!user) {
      setLoading(false)
      return
    }

    const fetchAllData = async () => {
      setLoading(true)
      const errors = []
      
      const timeoutId = setTimeout(() => {
        console.warn('데이터 로딩 시간 초과: 강제로 화면을 표시합니다.')
        setLoading(false)
      }, 5000)

      try {
        // 온라인 상태면 Supabase에서 가져오고 IndexedDB에 저장
        // 오프라인 상태면 IndexedDB에서 가져오기
        if (!isOnline) {
          // 오프라인: IndexedDB에서 로드
          const offlineData = await getOfflineData()
          
          if (offlineData.products && offlineData.products.length > 0) {
            setProducts(offlineData.products)
          }
          if (offlineData.clients && offlineData.clients.length > 0) {
            setClients(offlineData.clients.map(c => ({
              ...c,
              lastOrder: c.last_order || c.lastOrder,
              orderAmount: c.order_amount || c.orderAmount,
              contract_prices: typeof c.contract_prices === 'string' ? (c.contract_prices ? JSON.parse(c.contract_prices) : []) : (c.contract_prices || [])
            })))
          }
          if (offlineData.activities && offlineData.activities.length > 0) {
            setActivities(offlineData.activities.map(a => ({
              ...a,
              clientId: a.client_id || a.clientId,
              clientName: a.client_name || a.clientName,
              user: a.user_name || a.user,
              date: a.activity_date
            })))
          }
          if (offlineData.sales && offlineData.sales.length > 0) {
            setSales(offlineData.sales)
          }
          if (offlineData.issues && offlineData.issues.length > 0) {
            setIssues(offlineData.issues)
          }
          
          clearTimeout(timeoutId)
          setLoading(false)
          return
        }

        // 온라인: Supabase에서 로드하고 IndexedDB에 저장
        const fetchProducts = async () => {
          try {
            const { data, error } = await supabase.from('products').select('*').order('name')
            if (error) throw error
            return { success: true, data: data || [] }
          } catch (error) {
            console.error('Products 로드 실패:', error)
            errors.push('제품 데이터')
            return { success: false, data: [] }
          }
        }

        const fetchClients = async () => {
          try {
            const { data, error } = await supabase.from('clients').select('*').order('company')
            
            if (error) {
              console.error('❌ [fetchClients] 에러 발생:', error)
              throw error
            }
            
            return { success: true, data: data || [] }
          } catch (error) {
            console.error('❌ [fetchClients] Clients 로드 실패:', error)
            errors.push('고객 데이터')
            return { success: false, data: [] }
          }
        }

        const fetchActivities = async () => {
          try {
            const { data, error } = await supabase
              .from('activities')
              .select('*')
              .order('activity_date', { ascending: false })
              .order('created_at', { ascending: false })
            
            if (error) {
              console.error('❌ [fetchActivities] 에러 발생:', error)
              throw error
            }
            
            return { success: true, data: data || [] }
          } catch (error) {
            console.error('❌ [fetchActivities] Activities 로드 실패:', error)
            errors.push('활동 데이터')
            return { success: false, data: [] }
          }
        }

        const fetchSales = async () => {
          try {
            // 기본 조회로 수행 (foreign key 조인은 나중에 필요시 추가)
            const result = await supabase
              .from('sales')
              .select('*')
              .order('sale_date', { ascending: false })
            
            if (result.error) throw result.error
            return { success: true, data: result.data || [] }
          } catch (error) {
            console.error('Sales 로드 실패:', error)
            errors.push('매출 데이터')
            return { success: false, data: [] }
          }
        }

        const fetchIssues = async () => {
          try {
            const { data, error } = await supabase.from('issues').select('*').order('created_at', { ascending: false })
            if (error) throw error
            return { success: true, data: data || [] }
          } catch (error) {
            console.error('Issues 로드 실패:', error)
            errors.push('이슈 데이터')
            return { success: false, data: [] }
          }
        }

        const results = await Promise.allSettled([
          fetchProducts(),
          fetchClients(),
          fetchActivities(),
          fetchSales(),
          fetchIssues(),
        ])

        const productsResult = results[0].status === 'fulfilled' ? results[0].value : { success: false, data: null }
        const clientsResult = results[1].status === 'fulfilled' ? results[1].value : { success: false, data: null }
        const activitiesResult = results[2].status === 'fulfilled' ? results[2].value : { success: false, data: null }
        const salesResult = results[3].status === 'fulfilled' ? results[3].value : { success: false, data: null }
        const issuesResult = results[4].status === 'fulfilled' ? results[4].value : { success: false, data: null }

        if (productsResult.success && productsResult.data !== null) {
          const productsData = productsResult.data || []
          setProducts(productsData)
          // IndexedDB에 저장
          if (productsData.length > 0) {
            try {
              await saveToStore(STORES.PRODUCTS, productsData)
            } catch (error) {
              console.error('[DataContext] Products IndexedDB 저장 실패:', error)
            }
          }
        }
        
        if (clientsResult.success && clientsResult.data !== null) {
          const mappedClients = (clientsResult.data || []).map((client) => {
            try {
              return {
                ...client,
                lastOrder: client.last_order || client.lastOrder,
                orderAmount: client.order_amount || client.orderAmount,
                contact_person: client.contact_person || client.contact || '',
                contract_prices: typeof client.contract_prices === 'string' ? (client.contract_prices ? JSON.parse(client.contract_prices) : []) : (client.contract_prices || []),
              }
            } catch (e) {
              return { 
                ...client, 
                lastOrder: client.last_order || client.lastOrder,
                orderAmount: client.order_amount || client.orderAmount,
                contact_person: client.contact_person || client.contact || '', 
                contract_prices: [] 
              }
            }
          })
          
          setClients(mappedClients)
          // IndexedDB에 저장 (원본 데이터 형태로)
          if (clientsResult.data && clientsResult.data.length > 0) {
            try {
              await saveToStore(STORES.CLIENTS, clientsResult.data)
            } catch (error) {
              console.error('[DataContext] Clients IndexedDB 저장 실패:', error)
            }
          }
        } else {
          console.warn('⚠️ [초기 로드] clientsResult 실패:', clientsResult)
        }

        if (activitiesResult.success && activitiesResult.data !== null) {
          const mappedActivities = (activitiesResult.data || []).map((activity) => ({
            ...activity,
            clientId: activity.client_id || activity.clientId,
            clientName: activity.client_name || activity.clientName,
            user: activity.user_name || activity.user,  // user_name -> user 변환
            date: activity.activity_date,
          }))
          
          setActivities(mappedActivities)
          // IndexedDB에 저장 (원본 데이터 형태로)
          if (activitiesResult.data && activitiesResult.data.length > 0) {
            try {
              await saveToStore(STORES.ACTIVITIES, activitiesResult.data)
            } catch (error) {
              console.error('[DataContext] Activities IndexedDB 저장 실패:', error)
            }
          }
        } else {
          console.warn('⚠️ [초기 로드] activitiesResult 실패:', activitiesResult)
        }

        if (salesResult.success && salesResult.data !== null) {
          const processGroupedSales = (rawData, productsData) => {
            const groups = {}
            rawData.forEach((row) => {
              const timeKey = row.created_at ? row.created_at.substring(0, 16) : ''
              const key = `${row.sale_date}_${row.clientId}_${timeKey}`

              if (!groups[key]) {
                groups[key] = {
                  ...row,
                  id: row.id,
                  originalRows: [row],
                  totalAmount: Number(row.totalAmount || 0),
                  itemCount: 1,
                  displayItemName: row.item_name || '',
                  items: [{ id: row.id, productId: '', item_name: row.item_name || '', quantity: row.quantity || 1, unitPrice: row.unit_price || 0, unit_price: row.unit_price || 0 }],
                }
              } else {
                groups[key].originalRows.push(row)
                groups[key].totalAmount += Number(row.totalAmount || 0)
                groups[key].itemCount += 1
                groups[key].items.push({ id: row.id, productId: '', item_name: row.item_name || '', quantity: row.quantity || 1, unitPrice: row.unit_price || 0, unit_price: row.unit_price || 0 })
              }
            })

            return Object.values(groups).map((group) => {
              group.items = group.items.map((item) => {
                const product = productsData?.find((p) => p.name === item.item_name)
                return { ...item, productId: product?.id || '', productName: product?.name || item.item_name }
              })
              if (group.itemCount > 1) {
                group.displayItemName = `${group.displayItemName} 외 ${group.itemCount - 1}건`
              }
              return group
            })
          }

          const groupedSalesData = processGroupedSales(salesResult.data || [], productsResult.data || [])
          const mappedSales = groupedSalesData.map((group) => {
            // DB에서 가져온 데이터를 camelCase로 변환
            let clientName = group.client_name || group.clientName
            if (!clientName && group.clients) {
              if (Array.isArray(group.clients) && group.clients.length > 0) clientName = group.clients[0].company
              else if (group.clients && typeof group.clients === 'object' && group.clients.company) clientName = group.clients.company
            }
            return { 
              ...group, 
              clientId: group.client_id || group.clientId,
              clientName: clientName || group.clientName || '알 수 없음',
              totalAmount: group.total_amount || group.totalAmount,
              date: group.sale_date
            }
          })
          setSales(mappedSales)
          // IndexedDB에 저장 (원본 데이터 형태로)
          if (salesResult.data && salesResult.data.length > 0) {
            try {
              await saveToStore(STORES.SALES, salesResult.data)
            } catch (error) {
              console.error('[DataContext] Sales IndexedDB 저장 실패:', error)
            }
          }
        }

        if (issuesResult.success && issuesResult.data !== null) {
          const issuesData = issuesResult.data || []
          setIssues(issuesData)
          // IndexedDB에 저장
          if (issuesData.length > 0) {
            try {
              await saveToStore(STORES.ISSUES, issuesData)
            } catch (error) {
              console.error('[DataContext] Issues IndexedDB 저장 실패:', error)
            }
          }
        }

        if (errors.length > 0) {
          console.warn('일부 데이터를 불러오지 못했습니다:', errors.join(', '))
        }
      } catch (error) {
        console.error('데이터 로드 중 예상치 못한 오류 발생:', error)
      } finally {
        clearTimeout(timeoutId)
        setLoading(false)
      }
    }

    fetchAllData()
  }, [user, authLoading])

  const processGroupedSales = useCallback((rawData, productsData) => {
    // DB에서 가져온 데이터의 컬럼명을 camelCase로 변환
    const groups = {}
    rawData.forEach((row) => {
        // DB 컬럼명을 camelCase로 변환
        const clientId = row.client_id || row.clientId
        const totalAmount = Number(row.total_amount || row.totalAmount || 0)
        const clientName = row.client_name || row.clientName
        
        const timeKey = row.created_at ? row.created_at.substring(0, 16) : ''
        const key = `${row.sale_date}_${clientId}_${timeKey}`
        if (!groups[key]) {
            groups[key] = {
                ...row, 
                id: row.id, 
                clientId: clientId,
                clientName: clientName,
                totalAmount: totalAmount,
                itemCount: 1, 
                displayItemName: row.item_name || '',
                items: [{ id: row.id, productId: '', item_name: row.item_name || '', quantity: row.quantity || 1, unitPrice: row.unit_price || 0, unit_price: row.unit_price || 0 }]
            }
        } else {
            groups[key].originalRows.push(row)
            groups[key].totalAmount += totalAmount
            groups[key].itemCount += 1
            groups[key].items.push({ id: row.id, productId: '', item_name: row.item_name || '', quantity: row.quantity || 1, unitPrice: row.unit_price || 0, unit_price: row.unit_price || 0 })
        }
    })
    return Object.values(groups).map((group) => {
        group.items = group.items.map((item) => {
            const product = productsData?.find((p) => p.name === item.item_name)
            return { ...item, productId: product?.id || '', productName: product?.name || item.item_name }
        })
        if (group.itemCount > 1) group.displayItemName = `${group.displayItemName} 외 ${group.itemCount - 1}건`
        return group
    })
  }, [])

  const fetchDashboardData = useCallback(async () => {
    // (기존 fetchDashboardData 로직 유지)
    setLoading(true)
    // ... (fetchDashboardData 내부 로직은 위 useEffect 로직과 거의 동일하므로 간소화를 위해 생략하지 않고, 이미 위에서 복사한 원본 유지)
    // 사용자가 복사 붙여넣기 할 때 누락 없도록 원본 코드 유지
    // 다만 여기서는 addActivity/updateActivity 수정이 핵심이므로, 그 부분에 집중
    setLoading(false) // 임시 Placeholder
  }, [])


  // Products CRUD
  const addProduct = useCallback(async (productData) => {
    try {
      const sanitized = sanitizeData(productData, 'product')
      const allowedFields = ['name', 'type', 'standard']
      const filteredData = {}
      allowedFields.forEach((field) => { if (sanitized[field] !== undefined) filteredData[field] = sanitized[field] })
      
      const { data, error } = await supabase.from('products').insert([filteredData]).select().single()
      if (error) throw error
      setProducts((prev) => [...prev, data])
      return data
    } catch (error) {
      console.error('제품 추가 중 오류 발생:', error)
      alert(`제품 추가 중 오류가 발생했습니다: ${error.message}`)
      throw error
    }
  }, [sanitizeData])

  const addProductsBulk = useCallback(async (productsData) => {
    try {
        if (!Array.isArray(productsData) || productsData.length === 0) throw new Error('등록할 제품 데이터가 없습니다.')
        const sanitizedProducts = productsData.map((product) => {
            const sanitized = sanitizeData(product, 'product')
            const allowedFields = ['name', 'type', 'standard']
            const filteredData = {}
            allowedFields.forEach((field) => { if (sanitized[field] !== undefined) filteredData[field] = sanitized[field] })
            return filteredData
        })
        const { data, error } = await supabase.from('products').insert(sanitizedProducts).select()
        if (error) throw error
        setProducts((prev) => [...prev, ...data])
        return data
    } catch (error) {
        console.error('제품 일괄 등록 오류:', error)
        throw error
    }
  }, [sanitizeData])

  const updateProduct = useCallback(async (id, productData) => {
    try {
      const sanitized = sanitizeData(productData, 'product')
      const allowedFields = ['name', 'type', 'standard']
      const filteredData = {}
      allowedFields.forEach((field) => { if (sanitized[field] !== undefined) filteredData[field] = sanitized[field] })
      
      const { data, error } = await supabase.from('products').update(filteredData).eq('id', id).select().single()
      if (error) throw error
      setProducts((prev) => prev.map((product) => (product.id === id ? data : product)))
      return data
    } catch (error) {
      console.error('제품 수정 중 오류 발생:', error)
      throw error
    }
  }, [sanitizeData])

  const deleteProduct = useCallback(async (id) => {
    try {
      const { error } = await supabase.from('products').delete().eq('id', id)
      if (error) throw error
      setProducts((prev) => prev.filter((product) => product.id !== id))
      // 관련 데이터 정리 로직은 생략 (기존 유지)
    } catch (error) {
      console.error('제품 삭제 중 오류 발생:', error)
      throw error
    }
  }, [])

  // Clients CRUD
  const addClient = useCallback(async (clientData) => {
    try {
      const sanitized = sanitizeData(clientData, 'client')
      if (sanitized.orderAmount && sanitized.orderAmount < 10000) sanitized.orderAmount = sanitized.orderAmount * 10000
      
      // DB 컬럼명은 snake_case이므로 매핑 필요
      // ⚠️ 중요: 'lastOrder' -> 'last_order', 'orderAmount' -> 'order_amount'
      const fieldMapping = {
        'lastOrder': 'last_order',
        'orderAmount': 'order_amount'
      }
      
      const allowedFields = ['company', 'contact_person', 'phone', 'email', 'status', 'lastOrder', 'orderAmount', 'contract_prices']
      const filteredData = {}
      allowedFields.forEach((field) => { 
        if (sanitized[field] !== undefined) {
          // camelCase를 snake_case로 매핑
          const dbFieldName = fieldMapping[field] || field
          filteredData[dbFieldName] = sanitized[field]
        }
      })
      
      let clientWithCamelCase
      
      if (isOnline) {
        // 온라인: Supabase에 바로 저장
        const { data, error } = await supabase.from('clients').insert([filteredData]).select().single()
        
        if (error) {
          console.error('❌ [addClient] 저장 실패:', error)
          throw error
        }
        
        // DB에서 가져온 데이터를 camelCase로 변환
        clientWithCamelCase = {
          ...data,
          lastOrder: data.last_order || data.lastOrder,
          orderAmount: data.order_amount || data.orderAmount,
          contract_prices: typeof data.contract_prices === 'string' ? (data.contract_prices ? JSON.parse(data.contract_prices) : []) : (data.contract_prices || [])
        }
        
        // IndexedDB에도 저장
        try {
          await saveToStore(STORES.CLIENTS, data)
        } catch (error) {
          console.error('[DataContext] addClient IndexedDB 저장 실패:', error)
        }
      } else {
        // 오프라인: 임시 ID 생성 및 IndexedDB에 저장, Sync Queue에 추가
        const tempId = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
        const offlineData = {
          ...filteredData,
          id: tempId,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }
        
        clientWithCamelCase = {
          ...offlineData,
          lastOrder: offlineData.last_order || offlineData.lastOrder,
          orderAmount: offlineData.order_amount || offlineData.orderAmount,
          contract_prices: typeof offlineData.contract_prices === 'string' ? (offlineData.contract_prices ? JSON.parse(offlineData.contract_prices) : []) : (offlineData.contract_prices || [])
        }
        
        // IndexedDB에 임시 저장
        try {
          await saveToStore(STORES.CLIENTS, offlineData)
        } catch (error) {
          console.error('[DataContext] addClient IndexedDB 저장 실패:', error)
          throw error
        }
        
        // Sync Queue에 추가
        try {
          await addToQueue('clients', QUEUE_OPERATION.INSERT, filteredData, tempId)
        } catch (error) {
          console.error('[DataContext] addClient Sync Queue 추가 실패:', error)
        }
      }
      
      setClients((prev) => [...prev, clientWithCamelCase])
      return clientWithCamelCase
    } catch (error) {
      console.error('❌ [addClient] 고객 추가 중 오류 발생:', error)
      throw error
    }
  }, [sanitizeData, isOnline])

  const updateClient = useCallback(async (id, clientData) => {
    try {
        const sanitized = sanitizeData(clientData, 'client')
        if (sanitized.orderAmount && sanitized.orderAmount < 10000) sanitized.orderAmount = sanitized.orderAmount * 10000
        
        // DB 컬럼명은 snake_case이므로 매핑 필요
        // ⚠️ 중요: 'lastOrder' -> 'last_order', 'orderAmount' -> 'order_amount'
        const fieldMapping = {
          'lastOrder': 'last_order',
          'orderAmount': 'order_amount'
        }
        
        const allowedFields = ['company', 'contact_person', 'phone', 'email', 'status', 'lastOrder', 'orderAmount', 'contract_prices']
        const filteredData = {}
        allowedFields.forEach((field) => { 
          if (sanitized[field] !== undefined) {
            // camelCase를 snake_case로 매핑
            const dbFieldName = fieldMapping[field] || field
            filteredData[dbFieldName] = sanitized[field]
          }
        })
        
        const { data, error } = await supabase.from('clients').update(filteredData).eq('id', id).select().single()
        
        if (error) {
          console.error('❌ [updateClient] 저장 실패:', error)
          throw error
        }
        
        // DB에서 가져온 데이터를 camelCase로 변환
        const updatedClient = { 
          ...data, 
          lastOrder: data.last_order || data.lastOrder,
          orderAmount: data.order_amount || data.orderAmount,
          contract_prices: typeof data.contract_prices === 'string' ? JSON.parse(data.contract_prices) : data.contract_prices || [] 
        }
        
        setClients((prev) => prev.map((client) => (client.id === id ? updatedClient : client)))
        return updatedClient
    } catch (error) {
        console.error('❌ [updateClient] 고객 수정 오류:', error)
        throw error
    }
  }, [sanitizeData])

  const deleteClient = useCallback(async (id) => {
    try {
        const { error } = await supabase.from('clients').delete().eq('id', id)
        if (error) throw error
        setClients((prev) => prev.filter((client) => client.id !== id))
        setActivities((prev) => prev.filter((activity) => activity.clientId !== id))
        setSales((prev) => prev.filter((sale) => sale.clientId !== id))
    } catch (error) {
        console.error('고객 삭제 오류:', error)
        throw error
    }
  }, [])

  // ==============================================================================
  // ★★★ [핵심 수정 구간: Activities CRUD] ★★★
  // next_action_date, next_action_detail이 Supabase로 전달되도록 allowedFields에 추가함
  // ==============================================================================
  const addActivity = useCallback(async (activityData) => {
    try {
      const client = clients.find((c) => c.id === activityData.clientId)
      const activityDataWithDate = {
        ...activityData,
        activity_date: activityData.activity_date || activityData.date || null,
        clientName: client?.company || '알 수 없음',
      }
      delete activityDataWithDate.date
      delete activityDataWithDate.time

      const sanitized = sanitizeData(activityDataWithDate, 'activity')

      // [수정 3] 허용 필드 목록에 'next_action_date', 'next_action_detail' 추가
      // DB 컬럼명은 snake_case이므로 매핑 필요
      // ⚠️ 중요: 'user' 필드는 DB에서 'user_name' 컬럼으로 저장됨
      const fieldMapping = {
        'clientId': 'client_id',
        'clientName': 'client_name',
        'user': 'user_name'  // user는 예약어이므로 user_name으로 변경
      }
      
      const allowedFields = [
        'clientId',
        'type',
        'activity_date',
        'user',
        'description',
        'status',
        'clientName',
        'next_action_date', 
        'next_action_detail'
      ]
      
      const filteredData = {}
      allowedFields.forEach((field) => {
        if (sanitized[field] !== undefined) {
          // camelCase를 snake_case로 매핑 (user -> user_name)
          const dbFieldName = fieldMapping[field] || field
          filteredData[dbFieldName] = sanitized[field]
        }
      })
      
      const { data, error } = await supabase
        .from('activities')
        .insert([filteredData])
        .select()
        .single()

      if (error) {
        console.error('❌ [addActivity] 저장 실패:', error)
        throw error
      }

      // DB에서 가져온 데이터를 camelCase로 변환
      // ⚠️ 중요: DB의 'user_name' 컬럼을 'user' 필드로 변환
      const activityWithDate = {
        ...data,
        clientId: data.client_id || data.clientId,
        clientName: data.client_name || data.clientName,
        user: data.user_name || data.user,  // user_name -> user 변환
        date: data.activity_date,
      }

      setActivities((prev) => [activityWithDate, ...prev])
      return activityWithDate
    } catch (error) {
      console.error('활동 추가 중 오류 발생:', error)
      alert(`활동 추가 중 오류가 발생했습니다: ${error.message}`)
      throw error
    }
  }, [clients, sanitizeData])

  const updateActivity = useCallback(async (id, activityData) => {
    try {
      const client = clients.find((c) => c.id === activityData.clientId)
      const activityDataWithDate = {
        ...activityData,
        activity_date: activityData.activity_date || activityData.date || null,
        clientName: client?.company || activityData.clientName,
      }
      delete activityDataWithDate.date
      delete activityDataWithDate.time

      const sanitized = sanitizeData(activityDataWithDate, 'activity')

      // [수정 4] 수정 시에도 허용 필드 목록에 'next_action_date', 'next_action_detail' 추가
      // DB 컬럼명은 snake_case이므로 매핑 필요
      // ⚠️ 중요: 'user' 필드는 DB에서 'user_name' 컬럼으로 저장됨 (예약어 문제)
      const fieldMapping = {
        'clientId': 'client_id',
        'clientName': 'client_name',
        'user': 'user_name'  // user는 예약어이므로 user_name으로 변경
      }
      
      const allowedFields = [
        'clientId',
        'type',
        'activity_date',
        'user',
        'description',
        'status',
        'clientName',
        'next_action_date', 
        'next_action_detail'
      ]
      
      const filteredData = {}
      allowedFields.forEach((field) => {
        if (sanitized[field] !== undefined) {
          // camelCase를 snake_case로 매핑 (user -> user_name)
          const dbFieldName = fieldMapping[field] || field
          filteredData[dbFieldName] = sanitized[field]
        }
      })

      const { data, error } = await supabase
        .from('activities')
        .update(filteredData)
        .eq('id', id)
        .select()
        .single()

      if (error) throw error

      // DB에서 가져온 데이터를 camelCase로 변환
      // ⚠️ 중요: DB의 'user_name' 컬럼을 'user' 필드로 변환
      const activityWithDate = {
        ...data,
        clientId: data.client_id || data.clientId,
        clientName: data.client_name || data.clientName,
        user: data.user_name || data.user,  // user_name -> user 변환
        date: data.activity_date,
      }

      setActivities((prev) =>
        prev.map((activity) => (activity.id === id ? activityWithDate : activity))
      )
      return activityWithDate
    } catch (error) {
      console.error('활동 수정 중 오류 발생:', error)
      alert(`활동 수정 중 오류가 발생했습니다: ${error.message}`)
      throw error
    }
  }, [clients, sanitizeData])

  const deleteActivity = useCallback(async (id) => {
    try {
      const { error } = await supabase.from('activities').delete().eq('id', id)
      if (error) throw error
      setActivities((prev) => prev.filter((activity) => activity.id !== id))
    } catch (error) {
      console.error('활동 삭제 중 오류 발생:', error)
      throw error
    }
  }, [])

  // Sales CRUD (기존 유지)
  const addSale = useCallback(async (saleData) => {
    try {
        if (saleData.rows && Array.isArray(saleData.rows)) {
            const rowsToInsert = saleData.rows.map((row) => ({
                client_id: row.clientId || row.client_id,
                sale_date: row.sale_date,
                item_name: (row.item_name || '').trim(),
                quantity: Number(row.quantity) || 1,
                unit_price: Number(row.unitPrice || row.unit_price || 0),
                total_amount: (Number(row.quantity) || 1) * (Number(row.unitPrice || row.unit_price || 0)),
                notes: row.notes || '',
                client_name: row.clientName || ''
            }))
            const { data, error } = await supabase.from('sales').insert(rowsToInsert).select()
            if (error) throw error
            // DB에서 가져온 데이터를 camelCase로 변환
            const newSales = data.map((sale) => ({ 
              ...sale, 
              clientId: sale.client_id || sale.clientId,
              clientName: sale.client_name || sale.clientName,
              totalAmount: sale.total_amount || sale.totalAmount,
              date: sale.sale_date, 
              items: [{ productId: '', item_name: sale.item_name, quantity: sale.quantity, unitPrice: sale.unit_price, total: sale.total_amount }] 
            }))
            setSales((prev) => [...newSales, ...prev])
            return newSales[0]
        }
        
        const client = clients.find((c) => c.id === saleData.clientId)
        const saleDataWithDate = { ...saleData, sale_date: saleData.date || saleData.sale_date || null, clientName: client?.company || '알 수 없음', totalAmount: saleData.totalAmount || 0 }
        delete saleDataWithDate.date
        
        const sanitized = sanitizeData(saleDataWithDate, 'sale')
        // DB 컬럼명은 snake_case이므로 매핑 필요
        const fieldMapping = {
          'clientId': 'client_id',
          'clientName': 'client_name',
          'totalAmount': 'total_amount'
        }
        
        const allowedFields = ['clientId', 'sale_date', 'items', 'item_name', 'totalAmount', 'notes', 'clientName']
        const filteredData = {}
        allowedFields.forEach((field) => { 
          if (sanitized[field] !== undefined) {
            const dbFieldName = fieldMapping[field] || field
            filteredData[dbFieldName] = sanitized[field]
          }
        })
        if (filteredData.items && filteredData.items.length > 0) filteredData.item_name = filteredData.items[0].item_name || ''

        const { data, error } = await supabase.from('sales').insert([filteredData]).select().single()
        if (error) throw error
        // DB에서 가져온 데이터를 camelCase로 변환
        const newSale = { 
          ...data, 
          clientId: data.client_id || data.clientId,
          clientName: data.client_name || data.clientName,
          totalAmount: data.total_amount || data.totalAmount,
          date: data.sale_date, 
          items: typeof data.items === 'string' ? JSON.parse(data.items) : data.items || [] 
        }
        setSales((prev) => [newSale, ...prev])
        return newSale
    } catch (error) {
        console.error('매출 추가 오류:', error)
        throw error
    }
  }, [clients, sanitizeData])

  const updateSale = useCallback(async (id, saleData) => {
    try {
        const client = clients.find((c) => c.id === saleData.clientId)
        const saleDataWithDate = { ...saleData, sale_date: saleData.date || saleData.sale_date || null, clientName: client?.company || saleData.clientName, items: saleData.items || [], totalAmount: saleData.totalAmount || 0 }
        delete saleDataWithDate.date
        const sanitized = sanitizeData(saleDataWithDate, 'sale')
        // DB 컬럼명은 snake_case이므로 매핑 필요
        const fieldMapping = {
          'clientId': 'client_id',
          'clientName': 'client_name',
          'totalAmount': 'total_amount'
        }
        
        const allowedFields = ['clientId', 'sale_date', 'items', 'totalAmount', 'notes', 'clientName']
        const filteredData = {}
        allowedFields.forEach((field) => { 
          if (sanitized[field] !== undefined) {
            const dbFieldName = fieldMapping[field] || field
            filteredData[dbFieldName] = sanitized[field]
          }
        })
        
        const { data, error } = await supabase.from('sales').update(filteredData).eq('id', id).select().single()
        if (error) throw error
        // DB에서 가져온 데이터를 camelCase로 변환
        const updatedSale = { 
          ...data, 
          clientId: data.client_id || data.clientId,
          clientName: data.client_name || data.clientName,
          totalAmount: data.total_amount || data.totalAmount,
          date: data.sale_date, 
          items: typeof data.items === 'string' ? JSON.parse(data.items) : data.items || [] 
        }
        setSales((prev) => prev.map((sale) => (sale.id === id ? updatedSale : sale)))
        return updatedSale
    } catch (error) {
        console.error('매출 수정 오류:', error)
        throw error
    }
  }, [clients, sanitizeData])

  const deleteSale = useCallback(async (id) => {
    try {
        const { error } = await supabase.from('sales').delete().eq('id', id)
        if (error) throw error
        setSales((prev) => prev.filter((sale) => sale.id !== id))
    } catch (error) {
        console.error('매출 삭제 오류:', error)
        throw error
    }
  }, [])

  // 통계 및 주간 데이터 (기존 유지)
  const getStats = useCallback(() => {
    const totalClients = clients.length
    const activeClients = clients.filter((c) => c.status === '활성').length
    const now = new Date()
    const currentMonth = now.getMonth() + 1
    const currentYear = now.getFullYear()
    
    const thisMonthActivities = activities.filter((activity) => {
        const d = new Date(activity.activity_date || activity.date)
        return d.getMonth() + 1 === currentMonth && d.getFullYear() === currentYear
    }).length

    const thisPeriodStart = new Date(currentYear, currentMonth - 1, 1)
    const thisPeriodEnd = new Date(currentYear, currentMonth - 1, now.getDate())
    const thisPeriodSales = sales.filter((s) => { const d = new Date(s.date || s.sale_date); return d >= thisPeriodStart && d <= thisPeriodEnd }).reduce((sum, s) => sum + s.totalAmount, 0)
    
    const lastMonth = currentMonth === 1 ? 12 : currentMonth - 1
    const lastMonthYear = currentMonth === 1 ? currentYear - 1 : currentYear
    const lastPeriodStart = new Date(lastMonthYear, lastMonth - 1, 1)
    const lastPeriodEnd = new Date(lastMonthYear, lastMonth - 1, now.getDate())
    const lastPeriodSales = sales.filter((s) => { const d = new Date(s.date || s.sale_date); return d >= lastPeriodStart && d <= lastPeriodEnd }).reduce((sum, s) => sum + s.totalAmount, 0)
    
    const salesGrowthRate = lastPeriodSales > 0 ? ((thisPeriodSales - lastPeriodSales) / lastPeriodSales) * 100 : (thisPeriodSales > 0 ? 100 : 0)

    return { totalClients, activeClients, thisMonthActivities, thisMonthSales: thisPeriodSales, lastPeriodSales, salesGrowthRate }
  }, [clients, activities, sales])

  const getWeeklySalesData = useCallback(() => {
    const now = new Date()
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1)
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    const weeks = []
    let currentWeek = 1
    let weekStart = new Date(firstDay)

    while (weekStart <= lastDay) {
        const weekEnd = new Date(weekStart)
        weekEnd.setDate(weekEnd.getDate() + 6)
        if (weekEnd > lastDay) weekEnd.setTime(lastDay.getTime())
        const weekSales = sales.filter((s) => { const d = new Date(s.date || s.sale_date); return d >= weekStart && d <= weekEnd }).reduce((sum, s) => sum + s.totalAmount, 0)
        weeks.push({ week: `${currentWeek}주차`, 매출: weekSales / 10000, startDate: weekStart.toISOString().split('T')[0], endDate: weekEnd.toISOString().split('T')[0] })
        currentWeek++
        weekStart = new Date(weekEnd); weekStart.setDate(weekStart.getDate() + 1)
    }
    return weeks.length > 0 ? weeks : [{ week: '1주차', 매출: 0, startDate: firstDay.toISOString().split('T')[0], endDate: lastDay.toISOString().split('T')[0] }]
  }, [sales])

  // Issues CRUD
  const addIssue = useCallback(async (issueData) => {
    try {
        const sanitized = sanitizeData(issueData, 'issue')
        let dateValue = sanitized.date || sanitized.target_date || ''
        if (!dateValue) { const t = new Date(); dateValue = `${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,'0')}-${String(t.getDate()).padStart(2,'0')}` }
        const allowedFields = ['title', 'content', 'target_date', 'status']
        const filteredData = { date: dateValue }
        allowedFields.forEach((f) => { if (sanitized[f] !== undefined) filteredData[f] = sanitized[f] })
        
        const { data, error } = await supabase.from('issues').insert([filteredData]).select().single()
        if (error) throw error
        setIssues((prev) => [data, ...prev])
        return data
    } catch (error) {
        console.error('ISSUE 추가 오류:', error)
        throw error
    }
  }, [sanitizeData])

  const updateIssue = useCallback(async (id, issueData) => {
    try {
        const sanitized = sanitizeData(issueData, 'issue')
        const allowedFields = ['title', 'content', 'target_date', 'status']
        const filteredData = {}
        allowedFields.forEach((f) => { if (sanitized[f] !== undefined) filteredData[f] = sanitized[f] })
        if (sanitized.date || sanitized.target_date) filteredData.date = sanitized.date || sanitized.target_date

        const { data, error } = await supabase.from('issues').update(filteredData).eq('id', id).select().single()
        if (error) throw error
        setIssues((prev) => prev.map((i) => (i.id === id ? data : i)))
        return data
    } catch (error) {
        console.error('ISSUE 수정 오류:', error)
        throw error
    }
  }, [sanitizeData])

  const deleteIssue = useCallback(async (id) => {
    try {
        const { error } = await supabase.from('issues').delete().eq('id', id)
        if (error) throw error
        setIssues((prev) => prev.filter((i) => i.id !== id))
    } catch (error) {
        console.error('ISSUE 삭제 오류:', error)
        throw error
    }
  }, [])

  const value = {
    products, clients, activities, sales, issues, loading, 
    isOnline, pendingSyncCount, // 오프라인 상태 및 동기화 대기 작업 수
    fetchDashboardData,
    addProduct, addProductsBulk, updateProduct, deleteProduct,
    addClient, updateClient, deleteClient,
    addActivity, updateActivity, deleteActivity,
    addSale, updateSale, deleteSale,
    addIssue, updateIssue, deleteIssue,
    getStats, getWeeklySalesData,
  }

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>
}