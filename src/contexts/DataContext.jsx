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
  const { user, loading: authLoading } = useAuth()
  const { isOnline } = useOnlineStatus()
  const [products, setProducts] = useState([])
  const [clients, setClients] = useState([])
  const [activities, setActivities] = useState([])
  const [sales, setSales] = useState([])
  const [issues, setIssues] = useState([])
  const [loading, setLoading] = useState(true)
  const [pendingSyncCount, setPendingSyncCount] = useState(0)

  // UUID 정규식 (공통 사용)
  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

  // 헬퍼: 확실한 UUID 가져오기
  const getValidUserId = async (currentUser) => {
    // 1. 현재 user 객체의 id가 유효한 UUID인지 확인
    if (currentUser?.id && UUID_REGEX.test(currentUser.id)) {
      return currentUser.id
    }

    // 2. 아니면 Supabase Auth에서 직접 가져오기
    console.warn('[DataContext] 유효한 UUID를 찾기 위해 Supabase Auth 재조회 중...')
    const { data: { user: authUser }, error } = await supabase.auth.getUser()
    
    if (error || !authUser) {
      throw new Error('사용자 정보를 확인할 수 없습니다. 다시 로그인해주세요.')
    }

    if (authUser.id && UUID_REGEX.test(authUser.id)) {
      return authUser.id
    }

    throw new Error('유효한 사용자 ID(UUID)를 확보할 수 없습니다.')
  }

  const sanitizeData = useCallback((data, type) => {
    const sanitized = { ...data }

    const dateFields = ['sale_date', 'activity_date', 'lastOrder', 'next_action_date']
    dateFields.forEach((field) => {
      if (sanitized[field] === '' || sanitized[field] === undefined) {
        sanitized[field] = null
      }
    })

    const numberFields = ['orderAmount', 'totalAmount', 'quantity', 'unitPrice']
    numberFields.forEach((field) => {
      if (sanitized[field] === '' || sanitized[field] === undefined || sanitized[field] === null) {
        sanitized[field] = 0
      } else if (typeof sanitized[field] === 'string') {
        const parsed = parseFloat(sanitized[field])
        sanitized[field] = isNaN(parsed) ? 0 : parsed
      }
    })

    const textFields = ['company', 'contact_person', 'phone', 'email', 'status', 'user', 'description', 'notes', 'clientName', 'name', 'type', 'standard', 'title', 'content', 'next_action_detail']
    textFields.forEach((field) => {
      if (sanitized[field] === null) {
        sanitized[field] = ''
      }
    })

    if (type === 'issue') {
      const issueDateFields = ['target_date']
      issueDateFields.forEach((field) => {
        if (sanitized[field] === '' || sanitized[field] === undefined) {
          sanitized[field] = null
        }
      })
    }

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

    updateSyncCount()
    window.addEventListener('syncQueueUpdated', updateSyncCount)
    return () => {
      window.removeEventListener('syncQueueUpdated', updateSyncCount)
    }
  }, [])

  // 온라인 복귀 시 자동 동기화 (여기도 수정됨: 좀비 데이터 방지)
  useEffect(() => {
    if (!isOnline || !user) return

    const syncOfflineOperations = async () => {
      try {
        const pendingOps = await getPendingOperations()
        
        // 명함 스캔 재시도 로직 (기존 유지)
        const { getAllFromStore } = await import('../utils/offlineDB')
        const pendingScans = await getAllFromStore(STORES.PENDING_SCANS)
        const scansToProcess = pendingScans.filter(scan => scan.status === 'pending')
        
        for (const scan of scansToProcess) {
          if (!scan.imageBase64) continue
          try {
            window.dispatchEvent(new CustomEvent('retryBusinessCardScan', {
              detail: { scanId: scan.id, imageBase64: scan.imageBase64, taskId: scan.taskId || `retry_${scan.id}` }
            }))
          } catch (scanError) {
            console.error('[DataContext] 오프라인 명함 스캔 재시도 실패:', scanError)
          }
        }

        if (pendingOps.length === 0) return

        for (const op of pendingOps) {
          try {
            if (op.table === 'pending_scans' || op.table === 'business_card_scans') continue
            
            await updateQueueStatus(op.id, QUEUE_STATUS.SYNCING)
            
            let result
            const storeName = getStoreName(op.table)
            
            if (op.operation === QUEUE_OPERATION.INSERT) {
              const syncData = { ...op.data }
              
              // [중요] 동기화 시 created_by 강제 교정
              let validUserId = null
              try {
                 validUserId = await getValidUserId(user)
              } catch (e) {
                 console.error('[Sync] 사용자 ID 확보 실패, 건너뜀', e)
                 continue 
              }

              // 무조건 덮어쓰기
              syncData.created_by = validUserId

              // 최후 검증
              if (String(syncData.created_by).includes('@')) {
                 throw new Error('Email detected in created_by during sync. Aborting insert.')
              }
              
              result = await supabase.from(op.table).insert([syncData]).select().single()
              
              if (result.error) throw result.error
              
              if (storeName && op.tempId) {
                await deleteFromStore(storeName, op.tempId)
                if (result.data) {
                  await saveToStore(storeName, result.data)
                }
              }
            } else if (op.operation === QUEUE_OPERATION.UPDATE) {
              result = await supabase.from(op.table).update(op.data).eq('id', op.data.id).select().single()
              if (result.error) throw result.error
              
              if (storeName && result.data) {
                await saveToStore(storeName, result.data)
              }
            } else if (op.operation === QUEUE_OPERATION.DELETE) {
              result = await supabase.from(op.table).delete().eq('id', op.data.id)
              if (result.error) throw result.error
              
              if (storeName) {
                await deleteFromStore(storeName, op.data.id)
              }
            }
            
            await updateQueueStatus(op.id, QUEUE_STATUS.COMPLETED)
            await removeFromQueue(op.id)
            
          } catch (error) {
            console.error(`[DataContext] 동기화 실패 (${op.table}/${op.operation}):`, error)
            await updateQueueStatus(op.id, QUEUE_STATUS.FAILED, error)
          }
        }
        
        if (pendingOps.length > 0) {
          window.dispatchEvent(new CustomEvent('syncCompleted'))
        }
      } catch (error) {
        console.error('[DataContext] 오프라인 작업 동기화 중 오류:', error)
      }
    }

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

  // 초기 데이터 로드 (기존 유지)
  useEffect(() => {
    if (authLoading) { setLoading(true); return }
    if (!user) { setLoading(false); return }

    const fetchAllData = async () => {
      setLoading(true)
      const errors = []
      
      try {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession()
        if (sessionError || !session) { setLoading(false); return }
      } catch (sessionCheckError) {
        setLoading(false); return
      }
      
      const timeoutId = setTimeout(() => { setLoading(false) }, 5000)

      try {
        if (!isOnline) {
          const offlineData = await getOfflineData()
          if (offlineData.products?.length > 0) setProducts(offlineData.products)
          if (offlineData.clients?.length > 0) {
            setClients(offlineData.clients.map(c => ({
              ...c,
              lastOrder: c.last_order || c.lastOrder,
              orderAmount: c.order_amount || c.orderAmount,
              contract_prices: typeof c.contract_prices === 'string' ? (c.contract_prices ? JSON.parse(c.contract_prices) : []) : (c.contract_prices || [])
            })))
          }
          if (offlineData.activities?.length > 0) {
            setActivities(offlineData.activities.map(a => ({
              ...a,
              clientId: a.client_id || a.clientId,
              clientName: a.client_name || a.clientName,
              user: a.user_name || a.user,
              date: a.activity_date
            })))
          }
          if (offlineData.sales?.length > 0) setSales(offlineData.sales)
          if (offlineData.issues?.length > 0) setIssues(offlineData.issues)
          
          clearTimeout(timeoutId)
          setLoading(false)
          return
        }

        const fetchProducts = async () => {
          try {
            const { data, error } = await supabase.from('products').select('*').order('name')
            if (error) throw error
            return { success: true, data: data || [] }
          } catch (error) {
            errors.push('제품 데이터')
            return { success: false, data: [] }
          }
        }

        const fetchClients = async () => {
          try {
            const { data, error } = await supabase.from('clients').select('*').order('company')
            if (error) throw error
            return { success: true, data: data || [] }
          } catch (error) {
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
            if (error) throw error
            return { success: true, data: data || [] }
          } catch (error) {
            errors.push('활동 데이터')
            return { success: false, data: [] }
          }
        }

        const fetchSales = async () => {
          try {
            const result = await supabase.from('sales').select('*').order('sale_date', { ascending: false })
            if (result.error) throw result.error
            return { success: true, data: result.data || [] }
          } catch (error) {
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
            errors.push('이슈 데이터')
            return { success: false, data: [] }
          }
        }

        const results = await Promise.allSettled([
          fetchProducts(), fetchClients(), fetchActivities(), fetchSales(), fetchIssues()
        ])

        const productsResult = results[0].status === 'fulfilled' ? results[0].value : { success: false, data: null }
        const clientsResult = results[1].status === 'fulfilled' ? results[1].value : { success: false, data: null }
        const activitiesResult = results[2].status === 'fulfilled' ? results[2].value : { success: false, data: null }
        const salesResult = results[3].status === 'fulfilled' ? results[3].value : { success: false, data: null }
        const issuesResult = results[4].status === 'fulfilled' ? results[4].value : { success: false, data: null }

        if (productsResult.success && productsResult.data) {
          setProducts(productsResult.data)
          await saveToStore(STORES.PRODUCTS, productsResult.data).catch(e => console.error(e))
        }
        
        if (clientsResult.success && clientsResult.data) {
          const mappedClients = clientsResult.data.map((client) => ({
             ...client,
             lastOrder: client.last_order || client.lastOrder,
             orderAmount: client.order_amount || client.orderAmount,
             contact_person: client.contact_person || client.contact || '',
             contract_prices: typeof client.contract_prices === 'string' ? (client.contract_prices ? JSON.parse(client.contract_prices) : []) : (client.contract_prices || []),
          }))
          setClients(mappedClients)
          await saveToStore(STORES.CLIENTS, clientsResult.data).catch(e => console.error(e))
        }

        if (activitiesResult.success && activitiesResult.data) {
          const mappedActivities = activitiesResult.data.map((activity) => ({
            ...activity,
            clientId: activity.client_id || activity.clientId,
            clientName: activity.client_name || activity.clientName,
            user: activity.user_name || activity.user,
            date: activity.activity_date,
          }))
          setActivities(mappedActivities)
          await saveToStore(STORES.ACTIVITIES, activitiesResult.data).catch(e => console.error(e))
        }

        if (salesResult.success && salesResult.data) {
          const groupedSalesData = processGroupedSales(salesResult.data, productsResult.data || [])
          const mappedSales = groupedSalesData.map((group) => {
            let clientName = group.client_name || group.clientName
            if (!clientName && group.clients) {
              if (Array.isArray(group.clients) && group.clients.length > 0) clientName = group.clients[0].company
              else if (group.clients?.company) clientName = group.clients.company
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
          await saveToStore(STORES.SALES, salesResult.data).catch(e => console.error(e))
        }

        if (issuesResult.success && issuesResult.data) {
          setIssues(issuesResult.data)
          await saveToStore(STORES.ISSUES, issuesResult.data).catch(e => console.error(e))
        }
      } catch (error) {
        console.error('데이터 로드 중 오류:', error)
      } finally {
        clearTimeout(timeoutId)
        setLoading(false)
      }
    }

    fetchAllData()
  }, [user, authLoading])

  const processGroupedSales = useCallback((rawData, productsData) => {
    const groups = {}
    rawData.forEach((row) => {
        const clientId = row.client_id || row.clientId
        const totalAmount = Number(row.total_amount || row.totalAmount || 0)
        const clientName = row.client_name || row.clientName
        const timeKey = row.created_at ? row.created_at.substring(0, 16) : ''
        const key = `${row.sale_date}_${clientId}_${timeKey}`
        if (!groups[key]) {
            groups[key] = {
                ...row, id: row.id, clientId, clientName, totalAmount, itemCount: 1, 
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
    setLoading(true); setLoading(false); 
  }, [])


  // ==============================================================================
  // Products CRUD
  // ==============================================================================
  const addProduct = useCallback(async (productData) => {
    if (!user) throw new Error('로그인이 필요합니다.')
    
    const userId = await getValidUserId(user)
    const sanitized = sanitizeData(productData, 'product')
    const allowedFields = ['name', 'type', 'standard']
    const filteredData = {}
    allowedFields.forEach((field) => { if (sanitized[field] !== undefined) filteredData[field] = sanitized[field] })
    
    const { data, error } = await supabase.from('products').insert([{ ...filteredData, created_by: userId }]).select().single()
    if (error) throw error
    
    if (isOnline) await saveToStore(STORES.PRODUCTS, data).catch(e => console.error(e))
    setProducts((prev) => [...prev, data])
    return data
  }, [sanitizeData, user, isOnline])

  const addProductsBulk = useCallback(async (productsData) => {
    if (!user) throw new Error('로그인이 필요합니다.')
    const userId = await getValidUserId(user)
    
    const sanitizedProducts = productsData.map((product) => {
        const sanitized = sanitizeData(product, 'product')
        const allowedFields = ['name', 'type', 'standard']
        const filteredData = {}
        allowedFields.forEach((field) => { if (sanitized[field] !== undefined) filteredData[field] = sanitized[field] })
        return { ...filteredData, created_by: userId }
    })
    
    const { data, error } = await supabase.from('products').insert(sanitizedProducts).select()
    if (error) throw error
    
    if (isOnline) await saveToStore(STORES.PRODUCTS, data).catch(e => console.error(e))
    setProducts((prev) => [...prev, ...data])
    return data
  }, [sanitizeData, user, isOnline])

  const updateProduct = useCallback(async (id, productData) => {
    if (!user) throw new Error('로그인이 필요합니다.')
    const sanitized = sanitizeData(productData, 'product')
    const allowedFields = ['name', 'type', 'standard']
    const filteredData = {}
    allowedFields.forEach((field) => { if (sanitized[field] !== undefined) filteredData[field] = sanitized[field] })
    
    const { data, error } = await supabase.from('products').update(filteredData).eq('id', id).select().single()
    if (error) throw error
    
    if (isOnline) await saveToStore(STORES.PRODUCTS, data).catch(e => console.error(e))
    setProducts((prev) => prev.map((product) => (product.id === id ? data : product)))
    return data
  }, [sanitizeData, user, isOnline])

  const deleteProduct = useCallback(async (id) => {
    if (!user) throw new Error('로그인이 필요합니다.')
    const { error } = await supabase.from('products').delete().eq('id', id)
    if (error) throw error
    if (isOnline) await deleteFromStore(STORES.PRODUCTS, id).catch(e => console.error(e))
    setProducts((prev) => prev.filter((product) => product.id !== id))
  }, [user, isOnline])

  // ==============================================================================
  // Clients CRUD
  // ==============================================================================
  const addClient = useCallback(async (clientData) => {
    try {
      if (!user) throw new Error('로그인이 필요합니다.')
      
      // 1. UUID 확보 (실패시 에러 throw)
      const userId = await getValidUserId(user)
      
      // 2. 데이터 정제
      const sanitized = sanitizeData(clientData, 'client')
      
      // ⚠️ 핵심: sanitized에서 created_by가 이메일로 남아있을 수 있으므로 명시적으로 삭제
      delete sanitized.created_by
      
      if (sanitized.orderAmount && sanitized.orderAmount < 10000) {
        sanitized.orderAmount = sanitized.orderAmount * 10000
      }
      
      const fieldMapping = { 'lastOrder': 'last_order', 'orderAmount': 'order_amount' }
      const allowedFields = ['company', 'contact_person', 'phone', 'email', 'status', 'lastOrder', 'orderAmount', 'contract_prices']
      const filteredData = {}
      allowedFields.forEach((field) => { 
        if (sanitized[field] !== undefined) {
          filteredData[fieldMapping[field] || field] = sanitized[field]
        }
      })
      
      // 3. 최종 전송 데이터 객체 생성 (순서 중요: ...filteredData 다음 created_by)
      const finalInsertData = {
        ...filteredData,
        created_by: userId  // ⚠️ 핵심: 반드시 UUID로 덮어쓰기
      }
      
      // 4. 안전장치: 이메일 체크
      if (String(finalInsertData.created_by).includes('@')) {
        console.error('❌ [addClient] 최종 검증 실패: finalInsertData.created_by에 이메일이 포함되어 있습니다!', finalInsertData.created_by)
        throw new Error('SYSTEM ERROR: User ID contains email. Aborting save.')
      }
      
      // 5. UUID 검증 (최종 확인)
      if (!UUID_REGEX.test(finalInsertData.created_by)) {
        console.error('❌ [addClient] 최종 검증 실패: finalInsertData.created_by가 UUID 형식이 아닙니다!', finalInsertData.created_by)
        throw new Error('사용자 ID 형식이 올바르지 않습니다. 다시 로그인해주세요.')
      }
      
      // ⚠️ 최종 전송 데이터 확인 로그 (디버깅용)
      console.log('[addClient] 최종 전송 데이터:', finalInsertData)
      console.log('[addClient] 최종 전송 데이터 created_by:', finalInsertData.created_by)
      console.log('[addClient] userId 변수:', userId)
      console.log('[addClient] userId === finalInsertData.created_by:', userId === finalInsertData.created_by)

      if (isOnline) {
        // 온라인: Supabase에 저장
        const { data, error } = await supabase
          .from('clients')
          .insert([finalInsertData])
          .select()
          .single()
        
        if (error) {
          console.error('[addClient] Supabase Error:', error)
          throw error
        }
        
        const clientWithCamelCase = {
          ...data,
          lastOrder: data.last_order || data.lastOrder,
          orderAmount: data.order_amount || data.orderAmount,
          contract_prices: typeof data.contract_prices === 'string' 
            ? (data.contract_prices ? JSON.parse(data.contract_prices) : []) 
            : (data.contract_prices || [])
        }
        
        await saveToStore(STORES.CLIENTS, data).catch(e => console.error(e))
        setClients((prev) => [...prev, clientWithCamelCase])
        return clientWithCamelCase
        
      } else {
        // 오프라인
        const tempId = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
        const offlineData = { 
          ...finalInsertData, 
          id: tempId, 
          created_at: new Date().toISOString(), 
          updated_at: new Date().toISOString() 
        }
        
        await saveToStore(STORES.CLIENTS, offlineData)
        await addToQueue('clients', QUEUE_OPERATION.INSERT, finalInsertData, tempId) // Queue에도 올바른 finalInsertData 저장
        
        const clientWithCamelCase = { 
          ...offlineData, 
          lastOrder: offlineData.last_order, 
          orderAmount: offlineData.order_amount 
        }
        setClients((prev) => [...prev, clientWithCamelCase])
        return clientWithCamelCase
      }
      
    } catch (error) {
      console.error('[addClient] 고객 추가 실패:', error)
      throw error
    }
  }, [sanitizeData, isOnline, user])

  const updateClient = useCallback(async (id, clientData) => {
    if (!user) throw new Error('로그인이 필요합니다.')
    const sanitized = sanitizeData(clientData, 'client')
    if (sanitized.orderAmount && sanitized.orderAmount < 10000) sanitized.orderAmount = sanitized.orderAmount * 10000
    
    const fieldMapping = { 'lastOrder': 'last_order', 'orderAmount': 'order_amount' }
    const allowedFields = ['company', 'contact_person', 'phone', 'email', 'status', 'lastOrder', 'orderAmount', 'contract_prices']
    const filteredData = {}
    allowedFields.forEach((field) => { 
      if (sanitized[field] !== undefined) filteredData[fieldMapping[field] || field] = sanitized[field]
    })
    
    if (isOnline) {
      const { data, error } = await supabase.from('clients').update(filteredData).eq('id', id).select().single()
      if (error) throw error
      await saveToStore(STORES.CLIENTS, data).catch(e => console.error(e))
      const updatedClient = { 
        ...data, 
        lastOrder: data.last_order || data.lastOrder, 
        orderAmount: data.order_amount || data.orderAmount,
        contract_prices: typeof data.contract_prices === 'string' ? JSON.parse(data.contract_prices) : data.contract_prices || [] 
      }
      setClients((prev) => prev.map((client) => (client.id === id ? updatedClient : client)))
      return updatedClient
    } else {
      const clientWithCamelCase = { ...sanitized, id: id, is_offline: true, updated_at: new Date().toISOString() }
      await saveToStore(STORES.CLIENTS, clientWithCamelCase)
      await addToQueue('clients', QUEUE_OPERATION.UPDATE, filteredData, id)
      setClients((prev) => prev.map((client) => (client.id === id ? clientWithCamelCase : client)))
      return clientWithCamelCase
    }
  }, [sanitizeData, user, isOnline])

  const deleteClient = useCallback(async (id) => {
    if (!user) throw new Error('로그인이 필요합니다.')
    const { error } = await supabase.from('clients').delete().eq('id', id)
    if (error) throw error
    if (isOnline) await deleteFromStore(STORES.CLIENTS, id).catch(e => console.error(e))
    setClients((prev) => prev.filter((client) => client.id !== id))
    setActivities((prev) => prev.filter((activity) => activity.clientId !== id))
    setSales((prev) => prev.filter((sale) => sale.clientId !== id))
  }, [user, isOnline])

  // ==============================================================================
  // ★★★ [핵심 수정 구간: Activities CRUD] ★★★
  // ==============================================================================
  const addActivity = useCallback(async (activityData) => {
    try {
      if (!user) throw new Error('로그인이 필요합니다.')
      
      // 1. UUID 확보 (실패시 에러 throw)
      const userId = await getValidUserId(user)
      
      // 2. 데이터 정제
      const client = clients.find((c) => c.id === activityData.clientId)
      const activityDataWithDate = {
        ...activityData,
        activity_date: activityData.activity_date || activityData.date || null,
        clientName: client?.company || '알 수 없음',
      }
      
      const sanitized = sanitizeData(activityDataWithDate, 'activity')
      
      const fieldMapping = { 'clientId': 'client_id', 'clientName': 'client_name', 'user': 'user_name' }
      const allowedFields = ['clientId', 'type', 'activity_date', 'user', 'description', 'status', 'clientName', 'next_action_date', 'next_action_detail']
      
      const filteredData = {}
      allowedFields.forEach((field) => {
        if (sanitized[field] !== undefined) filteredData[fieldMapping[field] || field] = sanitized[field]
      })

      // 3. 최종 전송 데이터 객체 생성 (순서 중요: ...filteredData 다음 created_by)
      const finalInsertData = {
        ...filteredData,
        created_by: userId
      }

      // 4. 안전장치: 이메일 체크
      if (String(finalInsertData.created_by).includes('@')) {
         throw new Error('SYSTEM ERROR: User ID contains email. Aborting save.')
      }

      if (isOnline) {
        // 온라인: Supabase에 저장
        const { data: insertedData, error } = await supabase.from('activities').insert([finalInsertData]).select().single()

        if (error) {
          console.error('[addActivity] Supabase Error:', error)
          throw error
        }

        const activityWithCamelCase = {
          ...insertedData,
          clientId: insertedData.client_id || insertedData.clientId,
          clientName: insertedData.client_name || insertedData.clientName,
          user: insertedData.user_name || insertedData.user,
          date: insertedData.activity_date,
        }

        await saveToStore(STORES.ACTIVITIES, activityWithCamelCase)
        setActivities((prev) => [activityWithCamelCase, ...prev])
        return activityWithCamelCase

      } else {
        // 오프라인
        const tempId = `offline-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
        
        const activityWithCamelCase = {
          ...sanitized,
          id: tempId,
          clientId: sanitized.clientId || filteredData.client_id,
          clientName: sanitized.clientName || filteredData.client_name,
          user: sanitized.user || filteredData.user_name,
          date: sanitized.activity_date || filteredData.activity_date,
          created_by: userId,
          is_offline: true,
          created_at: new Date().toISOString()
        }
        
        await saveToStore(STORES.ACTIVITIES, activityWithCamelCase)
        await addToQueue('activities', QUEUE_OPERATION.INSERT, finalInsertData, tempId) // Queue에도 올바른 finalInsertData 저장
        
        setActivities((prev) => [...prev, activityWithCamelCase])
        return activityWithCamelCase
      }

    } catch (error) {
      console.error('활동 추가 실패:', error)
      throw error
    }
  }, [clients, sanitizeData, isOnline, user])

  const updateActivity = useCallback(async (id, activityData) => {
    if (!user) throw new Error('로그인이 필요합니다.')

    const client = clients.find((c) => c.id === activityData.clientId)
    const activityDataWithDate = {
      ...activityData,
      activity_date: activityData.activity_date || activityData.date || null,
      clientName: client?.company || activityData.clientName,
    }
    const sanitized = sanitizeData(activityDataWithDate, 'activity')
    
    const fieldMapping = { 'clientId': 'client_id', 'clientName': 'client_name', 'user': 'user_name' }
    const allowedFields = ['clientId', 'type', 'activity_date', 'user', 'description', 'status', 'clientName', 'next_action_date', 'next_action_detail']
    
    const filteredData = {}
    allowedFields.forEach((field) => {
      if (sanitized[field] !== undefined) filteredData[fieldMapping[field] || field] = sanitized[field]
    })

    if (isOnline) {
      const { data, error } = await supabase.from('activities').update(filteredData).eq('id', id).select().single()
      if (error) throw error
      await saveToStore(STORES.ACTIVITIES, data).catch(e => console.error(e))
      
      const activityWithDate = {
        ...data,
        clientId: data.client_id || data.clientId,
        clientName: data.client_name || data.clientName,
        user: data.user_name || data.user,
        date: data.activity_date,
      }
      setActivities((prev) => prev.map((activity) => (activity.id === id ? activityWithDate : activity)))
      return activityWithDate
    } else {
      const activityWithCamelCase = {
        ...sanitized, id: id, is_offline: true, updated_at: new Date().toISOString(),
        date: sanitized.activity_date || filteredData.activity_date
      }
      await saveToStore(STORES.ACTIVITIES, activityWithCamelCase)
      await addToQueue('activities', QUEUE_OPERATION.UPDATE, filteredData, id)
      setActivities((prev) => prev.map((activity) => (activity.id === id ? activityWithCamelCase : activity)))
      return activityWithCamelCase
    }
  }, [clients, sanitizeData, user, isOnline])

  const deleteActivity = useCallback(async (id) => {
    if (!user) throw new Error('로그인이 필요합니다.')
    const { error } = await supabase.from('activities').delete().eq('id', id)
    if (error) throw error
    if (isOnline) await deleteFromStore(STORES.ACTIVITIES, id).catch(e => console.error(e))
    setActivities((prev) => prev.filter((activity) => activity.id !== id))
  }, [user, isOnline])

  // ==============================================================================
  // Sales CRUD
  // ==============================================================================
  const addSale = useCallback(async (saleData) => {
    if (!user) throw new Error('로그인이 필요합니다.')
    const userId = await getValidUserId(user)

    if (saleData.rows && Array.isArray(saleData.rows)) {
        const rowsToInsert = saleData.rows.map((row) => ({
            client_id: row.clientId || row.client_id,
            sale_date: row.sale_date,
            item_name: (row.item_name || '').trim(),
            quantity: Number(row.quantity) || 1,
            unit_price: Number(row.unitPrice || row.unit_price || 0),
            total_amount: (Number(row.quantity) || 1) * (Number(row.unitPrice || row.unit_price || 0)),
            notes: row.notes || '',
            client_name: row.clientName || '',
            created_by: userId
        }))
        const { data, error } = await supabase.from('sales').insert(rowsToInsert).select()
        if (error) throw error
        if (isOnline) await saveToStore(STORES.SALES, data).catch(e => console.error(e))
        
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
    const sanitized = sanitizeData(saleDataWithDate, 'sale')
    const fieldMapping = { 'clientId': 'client_id', 'clientName': 'client_name', 'totalAmount': 'total_amount' }
    const allowedFields = ['clientId', 'sale_date', 'items', 'item_name', 'totalAmount', 'notes', 'clientName']
    const filteredData = {}
    allowedFields.forEach((field) => { 
        if (sanitized[field] !== undefined) filteredData[fieldMapping[field] || field] = sanitized[field]
    })
    if (filteredData.items && filteredData.items.length > 0) filteredData.item_name = filteredData.items[0].item_name || ''

    const insertData = { ...filteredData, created_by: userId }
    const { data, error } = await supabase.from('sales').insert([insertData]).select().single()
    if (error) throw error
    
    if (isOnline) await saveToStore(STORES.SALES, data).catch(e => console.error(e))
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
  }, [clients, sanitizeData, user, isOnline])

  const updateSale = useCallback(async (id, saleData) => {
    if (!user) throw new Error('로그인이 필요합니다.')
    const client = clients.find((c) => c.id === saleData.clientId)
    const saleDataWithDate = { ...saleData, sale_date: saleData.date || saleData.sale_date || null, clientName: client?.company || saleData.clientName, items: saleData.items || [], totalAmount: saleData.totalAmount || 0 }
    const sanitized = sanitizeData(saleDataWithDate, 'sale')
    const fieldMapping = { 'clientId': 'client_id', 'clientName': 'client_name', 'totalAmount': 'total_amount' }
    const allowedFields = ['clientId', 'sale_date', 'items', 'totalAmount', 'notes', 'clientName']
    const filteredData = {}
    allowedFields.forEach((field) => { 
        if (sanitized[field] !== undefined) filteredData[fieldMapping[field] || field] = sanitized[field]
    })
    
    if (isOnline) {
        const { data, error } = await supabase.from('sales').update(filteredData).eq('id', id).select().single()
        if (error) throw error
        await saveToStore(STORES.SALES, data).catch(e => console.error(e))
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
    } else {
        const saleWithCamelCase = { ...sanitized, id: id, is_offline: true, updated_at: new Date().toISOString() }
        await saveToStore(STORES.SALES, saleWithCamelCase)
        await addToQueue('sales', QUEUE_OPERATION.UPDATE, filteredData, id)
        setSales((prev) => prev.map((sale) => (sale.id === id ? saleWithCamelCase : sale)))
        return saleWithCamelCase
    }
  }, [clients, sanitizeData, user, isOnline])

  const deleteSale = useCallback(async (id) => {
    if (!user) throw new Error('로그인이 필요합니다.')
    const { error } = await supabase.from('sales').delete().eq('id', id)
    if (error) throw error
    if (isOnline) await deleteFromStore(STORES.SALES, id).catch(e => console.error(e))
    setSales((prev) => prev.filter((sale) => sale.id !== id))
  }, [user, isOnline])

  // ==============================================================================
  // Issues CRUD
  // ==============================================================================
  const addIssue = useCallback(async (issueData) => {
    if (!user) throw new Error('로그인이 필요합니다.')
    const userId = await getValidUserId(user)
    
    const sanitized = sanitizeData(issueData, 'issue')
    let dateValue = sanitized.date || sanitized.target_date || ''
    if (!dateValue) { const t = new Date(); dateValue = `${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,'0')}-${String(t.getDate()).padStart(2,'0')}` }
    const allowedFields = ['title', 'content', 'target_date', 'status']
    const filteredData = { date: dateValue }
    allowedFields.forEach((f) => { if (sanitized[f] !== undefined) filteredData[f] = sanitized[f] })
    
    const { data, error } = await supabase.from('issues').insert([{ ...filteredData, created_by: userId }]).select().single()
    if (error) throw error
    
    if (isOnline) await saveToStore(STORES.ISSUES, data).catch(e => console.error(e))
    setIssues((prev) => [data, ...prev])
    return data
  }, [sanitizeData, user, isOnline])

  const updateIssue = useCallback(async (id, issueData) => {
    if (!user) throw new Error('로그인이 필요합니다.')
    const sanitized = sanitizeData(issueData, 'issue')
    const allowedFields = ['title', 'content', 'target_date', 'status']
    const filteredData = {}
    allowedFields.forEach((f) => { if (sanitized[f] !== undefined) filteredData[f] = sanitized[f] })
    if (sanitized.date || sanitized.target_date) filteredData.date = sanitized.date || sanitized.target_date

    if (isOnline) {
      const { data, error } = await supabase.from('issues').update(filteredData).eq('id', id).select().single()
      if (error) throw error
      await saveToStore(STORES.ISSUES, data).catch(e => console.error(e))
      setIssues((prev) => prev.map((i) => (i.id === id ? data : i)))
      return data
    } else {
      const issueWithOffline = { ...sanitized, id: id, is_offline: true, updated_at: new Date().toISOString() }
      await saveToStore(STORES.ISSUES, issueWithOffline)
      await addToQueue('issues', QUEUE_OPERATION.UPDATE, filteredData, id)
      setIssues((prev) => prev.map((i) => (i.id === id ? issueWithOffline : i)))
      return issueWithOffline
    }
  }, [sanitizeData, user, isOnline])

  const deleteIssue = useCallback(async (id) => {
    if (!user) throw new Error('로그인이 필요합니다.')
    const { error } = await supabase.from('issues').delete().eq('id', id)
    if (error) throw error
    if (isOnline) await deleteFromStore(STORES.ISSUES, id).catch(e => console.error(e))
    setIssues((prev) => prev.filter((i) => i.id !== id))
  }, [user, isOnline])

  // Stats
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

  const value = {
    products, clients, activities, sales, issues, loading, 
    isOnline, pendingSyncCount,
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