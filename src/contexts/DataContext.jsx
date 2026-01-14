import React, { createContext, useContext, useState, useCallback, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './AuthContext'
import { useOnlineStatus } from '../hooks/useOnlineStatus'
import { 
  getAllData as getOfflineData, 
  saveToStore, 
  deleteFromStore,
  getStoreName,
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
  if (!context) throw new Error('useData must be used within a DataProvider')
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
  const [openModalCount, setOpenModalCount] = useState(0) // 모달 열림 상태 추적 (데이터 새로고침 방지)

  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

  // 1. 유틸리티 함수
  const getValidUserId = async (currentUser) => {
    if (currentUser?.id) return currentUser.id
    const { data: { user: authUser } } = await supabase.auth.getUser()
    return authUser?.id
  }

  // 매출 데이터 그룹화 함수 (sale_date, client_id, created_at 분 단위 기준)
  const processGroupedSales = useCallback((salesArray) => {
    if (!salesArray || salesArray.length === 0) return []
    
    // 먼저 camelCase 필드 추가 (기존 매핑)
    const normalizedSales = salesArray.map(s => ({
      ...s,
      clientId: s.client_id || s.clientId,
      totalAmount: s.total_amount || s.totalAmount || 0,
      date: s.sale_date || s.date,
      created_at: s.created_at || s.createdAt
    }))
    
    // 그룹화 키 생성 함수: sale_date + client_id + created_at의 분 단위까지
    const getGroupKey = (sale) => {
      const saleDate = sale.sale_date || sale.date || ''
      const clientId = sale.client_id || sale.clientId || ''
      // created_at을 분 단위까지 포함 (YYYY-MM-DDTHH:mm)
      let createdAtKey = ''
      if (sale.created_at) {
        const createdAt = new Date(sale.created_at)
        if (!isNaN(createdAt.getTime())) {
          const year = createdAt.getFullYear()
          const month = String(createdAt.getMonth() + 1).padStart(2, '0')
          const day = String(createdAt.getDate()).padStart(2, '0')
          const hours = String(createdAt.getHours()).padStart(2, '0')
          const minutes = String(createdAt.getMinutes()).padStart(2, '0')
          createdAtKey = `${year}-${month}-${day}T${hours}:${minutes}`
        }
      }
      return `${saleDate}|${clientId}|${createdAtKey}`
    }
    
    // 그룹화
    const groupedMap = {}
    normalizedSales.forEach(sale => {
      const key = getGroupKey(sale)
      if (!groupedMap[key]) {
        groupedMap[key] = []
      }
      groupedMap[key].push(sale)
    })
    
    // 그룹화된 데이터를 결과 배열로 변환
    const groupedResults = Object.values(groupedMap).map(group => {
      // 그룹 내 품목 정렬 (created_at 기준, 없으면 id 기준)
      const sortedItems = [...group].sort((a, b) => {
        if (a.created_at && b.created_at) {
          return new Date(a.created_at) - new Date(b.created_at)
        }
        return (a.id || '').localeCompare(b.id || '')
      })
      
      // 첫 번째 항목을 기본값으로 사용
      const firstItem = sortedItems[0]
      const saleDate = firstItem.sale_date || firstItem.date || ''
      const clientId = firstItem.client_id || firstItem.clientId || ''
      const notes = firstItem.notes || ''
      const createdAt = firstItem.created_at || null
      
      // 총 금액 합계
      const totalAmount = sortedItems.reduce((sum, item) => {
        const amount = item.total_amount || item.totalAmount || 0
        return sum + Number(amount)
      }, 0)
      
      // 품목 수
      const itemCount = sortedItems.length
      
      // 첫 번째 품목명
      const firstItemName = firstItem.item_name || firstItem.itemName || firstItem.product_name || '-'
      
      // displayItemName 생성
      const displayItemName = itemCount > 1 
        ? `${firstItemName} 외 ${itemCount - 1}건`
        : firstItemName
      
      // 그룹화된 결과 객체 생성
      const groupedSale = {
        id: firstItem.id || `${clientId}-${saleDate}-${createdAt || Date.now()}`,
        sale_date: saleDate,
        date: saleDate,
        client_id: clientId,
        clientId: clientId,
        notes: notes,
        created_at: createdAt,
        total_amount: totalAmount,
        totalAmount: totalAmount,
        itemCount: itemCount,
        displayItemName: displayItemName,
        items: sortedItems.map(item => ({
          id: item.id,
          item_name: item.item_name || item.itemName || '',
          quantity: item.quantity || 0,
          unit_price: item.unit_price || item.unitPrice || 0,
          total_amount: item.total_amount || item.totalAmount || 0,
          notes: item.notes || ''
        }))
      }
      
      return groupedSale
    })
    
    return groupedResults
  }, [])
  
  const sanitizeData = useCallback((data, type) => {
    const sanitized = { ...data }
    
    // 공통: DB에 존재하지 않는 임시 필드 제거 (rowIndex 등) - PGRST204 에러 방지
    delete sanitized.rowIndex
    delete sanitized.clientName // 엑셀 파싱 시 사용된 임시 필드
    
    // clients 테이블 전용 처리
    if (type === 'client') {
      // DB에 없는 필드 제거 (clients 테이블에 존재하지 않는 필드들)
      delete sanitized.activity_date
      delete sanitized.lastOrder // DB 컬럼명은 last_order이므로 제거
      delete sanitized.orderAmount // DB 컬럼명은 order_amount이므로 제거 (클라이언트 등록/수정 시 사용하지 않음)
      delete sanitized.contacts // contacts는 별도로 처리되므로 제거
      delete sanitized.contact_person // DB에 없는 필드 (client_contacts 테이블로 이관됨)
      delete sanitized.phone // DB에 없는 필드 (client_contacts 테이블로 이관됨)
      delete sanitized.email // DB에 없는 필드 (client_contacts 테이블로 이관됨)
      
      // clients 테이블에 존재하지 않는 필드들 제거
      delete sanitized.unitPrice
      delete sanitized.quantity
      delete sanitized.totalAmount
      delete sanitized.clientId
      delete sanitized.date
      delete sanitized.price // DB에 없는 필드 (products 테이블용)
      delete sanitized.unit_price // DB에 없는 필드 (sales 테이블용)
      
      // 디버깅: DB에 전송될 데이터 확인 (최종 검증)
      console.log('[sanitizeData] clients 테이블에 저장될 데이터 (최종 검증):', sanitized)
      console.log('[sanitizeData] 전송될 데이터의 키 목록:', Object.keys(sanitized))
    } else {
    const dateFields = ['sale_date', 'activity_date', 'lastOrder', 'next_action_date', 'target_date']
      dateFields.forEach(f => { if (!sanitized[f] || sanitized[f] === '') sanitized[f] = null })
      
    const numberFields = ['orderAmount', 'totalAmount', 'quantity', 'unitPrice']
    numberFields.forEach(f => {
      const val = sanitized[f]
      sanitized[f] = (val === '' || val === undefined || val === null) ? 0 : parseFloat(val) || 0
    })
    }
    
    return sanitized
  }, [])

  // 2. 담당자 관련 함수 (is_primary 반영)
  const replaceClientContacts = useCallback(async (clientId, contacts) => {
    try {
      const userId = await getValidUserId(user)
      await supabase.from('client_contacts').delete().eq('client_id', clientId)
      if (contacts && contacts.length > 0) {
        const toInsert = contacts.map(c => ({
          client_id: clientId,
          name: c.name || '',
          department_role: c.department_role || '',
          phone: c.phone || '',
          email: c.email || '',
          is_primary: !!c.is_primary,
          created_by: userId
        }))
        // 디버깅: DB에 전송될 담당자 데이터 확인
        console.log('[replaceClientContacts] client_contacts 테이블에 저장될 데이터:', toInsert)
        await supabase.from('client_contacts').insert(toInsert)
      }
      return { success: true }
    } catch (error) { return { success: false, error } }
  }, [user])

  // 3. 통계 계산 로직 (Dashboard 에러 해결 핵심)
  const getStats = useCallback(() => {
    const totalClients = clients.length
    const activeClients = clients.filter(c => c.status === '매출' || c.status === '활성').length
    const now = new Date()
    const currentMonth = now.getMonth() + 1
    const currentYear = now.getFullYear()
    
    const thisMonthActivities = activities.filter(a => {
      const d = new Date(a.activity_date || a.date)
      return d.getMonth() + 1 === currentMonth && d.getFullYear() === currentYear
    }).length

    const thisMonthSales = sales.filter(s => {
      const d = new Date(s.sale_date || s.date)
      return d.getMonth() + 1 === currentMonth && d.getFullYear() === currentYear
    }).reduce((sum, s) => {
      // DB 스키마 규격 우선: total_amount > totalAmount
      const amount = s.total_amount !== undefined && s.total_amount !== null 
        ? Number(s.total_amount) 
        : (s.totalAmount !== undefined && s.totalAmount !== null ? Number(s.totalAmount) : 0)
      return sum + amount
    }, 0)

    const lastMonth = currentMonth === 1 ? 12 : currentMonth - 1
    const lastMonthYear = currentMonth === 1 ? currentYear - 1 : currentYear
    const lastMonthSales = sales.filter(s => {
      const d = new Date(s.sale_date || s.date)
      return d.getMonth() + 1 === lastMonth && d.getFullYear() === lastMonthYear
    }).reduce((sum, s) => {
      // DB 스키마 규격 우선: total_amount > totalAmount
      const amount = s.total_amount !== undefined && s.total_amount !== null 
        ? Number(s.total_amount) 
        : (s.totalAmount !== undefined && s.totalAmount !== null ? Number(s.totalAmount) : 0)
      return sum + amount
    }, 0)

    const salesGrowthRate = lastMonthSales > 0 ? ((thisMonthSales - lastMonthSales) / lastMonthSales) * 100 : (thisMonthSales > 0 ? 100 : 0)

    return { totalClients, activeClients, thisMonthActivities, thisMonthSales, lastPeriodSales: lastMonthSales, salesGrowthRate }
  }, [clients, activities, sales])

  const getWeeklySalesData = useCallback(() => {
    const now = new Date()
    const weeks = []
    // 최근 4주간의 데이터 (오늘부터 역으로 4주)
    for (let i = 3; i >= 0; i--) {
      const weekEnd = new Date(now)
      weekEnd.setDate(now.getDate() - (i * 7))
      weekEnd.setHours(23, 59, 59, 999) // 주의 마지막 날 끝
      
      const weekStart = new Date(weekEnd)
      weekStart.setDate(weekEnd.getDate() - 6)
      weekStart.setHours(0, 0, 0, 0) // 주의 첫날 시작
      
      // 주간 레이블: 주의 시작일/종료일 (예: "1/1-1/7")
      const startMonth = weekStart.getMonth() + 1
      const startDate = weekStart.getDate()
      const endMonth = weekEnd.getMonth() + 1
      const endDate = weekEnd.getDate()
      const weekLabel = startMonth === endMonth 
        ? `${startMonth}/${startDate}-${endDate}`
        : `${startMonth}/${startDate}-${endMonth}/${endDate}`
      
      const weekSales = sales.filter(s => {
        // DB 스키마 규격 우선: sale_date > date
        const saleDate = s.sale_date || s.date
        if (!saleDate) return false
        
        const sd = new Date(saleDate)
        if (isNaN(sd.getTime())) return false
        
        // 주간 범위 내인지 확인
        return sd >= weekStart && sd <= weekEnd
      }).reduce((sum, s) => {
        // DB 스키마 규격 우선: total_amount > totalAmount
        const amount = s.total_amount !== undefined && s.total_amount !== null 
          ? Number(s.total_amount) 
          : (s.totalAmount !== undefined && s.totalAmount !== null ? Number(s.totalAmount) : 0)
        return sum + amount
      }, 0)
      
      weeks.push({ week: weekLabel, 매출: weekSales / 10000 })
    }
    return weeks
  }, [sales])

  // 레거시 데이터 자동 이관 함수
  const migrateLegacyClientData = useCallback(async (clientsData, contactsByClient) => {
    try {
      const userId = await getValidUserId(user)
      if (!userId) return

      const migrations = []
      
      for (const client of clientsData || []) {
        const hasContacts = contactsByClient[client.id] && contactsByClient[client.id].length > 0
        const hasLegacyData = client.contact_person && client.contact_person.trim()
        
        // client_contacts에 담당자가 없고, clients 테이블에 contact_person이 있으면 마이그레이션
        if (!hasContacts && hasLegacyData) {
          migrations.push({
            client_id: client.id,
            name: client.contact_person || '',
            department_role: '',
            phone: client.phone || '',
            email: client.email || '',
            is_primary: true,
            created_by: userId
          })
        }
      }

      // 마이그레이션이 필요한 경우 일괄 처리
      if (migrations.length > 0) {
        // 디버깅: 마이그레이션될 데이터 확인
        console.log('[migrateLegacyClientData] client_contacts 테이블에 저장될 레거시 데이터:', migrations)
        const { error } = await supabase
          .from('client_contacts')
          .insert(migrations)
        
        if (error) {
          console.error('레거시 데이터 마이그레이션 오류:', error)
        } else {
          console.log(`${migrations.length}개의 레거시 담당자 데이터가 마이그레이션되었습니다.`)
        }
      }
    } catch (error) {
      console.error('레거시 데이터 마이그레이션 중 오류:', error)
    }
  }, [user])

  // 4. 데이터 로드 및 동기화 (모달이 열려있을 때는 실행하지 않음)
  useEffect(() => {
    if (authLoading || !user) { if (!authLoading) setLoading(false); return }
    // 모달이 열려있으면 데이터 새로고침하지 않음 (입력 데이터 보존)
    if (openModalCount > 0) return
    
    const fetchData = async () => {
      setLoading(true)
      try {
        const [pRes, cRes, aRes, sRes, iRes, ctRes] = await Promise.all([
          supabase.from('products').select('*').order('name').range(0, 99999),
          supabase.from('clients').select('*').order('company').range(0, 99999),
          supabase.from('activities').select('*').order('activity_date', { ascending: false }).range(0, 99999),
          supabase.from('sales').select('*').order('sale_date', { ascending: false }).range(0, 99999),
          supabase.from('issues').select('*').order('created_at', { ascending: false }).range(0, 99999),
          supabase.from('client_contacts').select('*').order('is_primary', { ascending: false }).range(0, 99999)
        ])
        const contactsByClient = (ctRes.data || []).reduce((acc, c) => {
          if (!acc[c.client_id]) acc[c.client_id] = []
          acc[c.client_id].push(c)
          return acc
        }, {})
        
        // 레거시 데이터 자동 이관 실행
        await migrateLegacyClientData(cRes.data || [], contactsByClient)
        
        // 마이그레이션 후 담당자 데이터 다시 불러오기
        const { data: updatedContacts } = await supabase
          .from('client_contacts')
          .select('*')
          .order('is_primary', { ascending: false })
        
        const updatedContactsByClient = (updatedContacts || []).reduce((acc, c) => {
          if (!acc[c.client_id]) acc[c.client_id] = []
          acc[c.client_id].push(c)
          return acc
        }, {})
        
        setProducts(pRes.data || [])
        const clientsData = (cRes.data || []).map(client => {
          const contacts = updatedContactsByClient[client.id] || []
          const primary = contacts.find(c => c.is_primary) || contacts[0]
          return { ...client, lastOrder: client.last_order, orderAmount: client.order_amount, contact_person: primary?.name || '', phone: primary?.phone || '', email: primary?.email || '' }
        })
        setClients(clientsData)
        // activities에 clientName 매핑 추가 (clients 조인)
        setActivities((aRes.data || []).map(a => {
          const client = clientsData.find(c => c.id === a.client_id)
          return { 
            ...a, 
            clientId: a.client_id, 
            date: a.activity_date,
            clientName: client?.company || '알 수 없음'
          }
        }))
        // 매출 데이터 그룹화 후 저장
        const rawSales = (sRes.data || []).map(s => ({ ...s, clientId: s.client_id, totalAmount: s.total_amount, date: s.sale_date }))
        const groupedSales = processGroupedSales(rawSales)
        setSales(groupedSales)
        setIssues(iRes.data || [])
      } finally { setLoading(false) }
    }
    fetchData()
  }, [user, authLoading, migrateLegacyClientData, processGroupedSales, openModalCount])

  // 5. CRUD 액션
  const addClient = useCallback(async (c) => {
    const uid = await getValidUserId(user)
    const { data, error } = await supabase.from('clients').insert([{ ...sanitizeData(c, 'client'), created_by: uid }]).select().single()
    if (error) throw error
    if (c.contacts) await replaceClientContacts(data.id, c.contacts)
    
    // 담당자 저장 후 최신 담당자 데이터 조회
    const { data: contactsData } = await supabase
      .from('client_contacts')
      .select('*')
      .eq('client_id', data.id)
      .order('is_primary', { ascending: false })
    
    const contacts = contactsData || []
    const primary = contacts.find(c => c.is_primary) || contacts[0]
    
    // 최신 담당자 정보가 포함된 client 객체 생성
    const clientWithContacts = {
      ...data,
      lastOrder: data.last_order,
      orderAmount: data.order_amount,
      contact_person: primary?.name || '',
      phone: primary?.phone || '',
      email: primary?.email || ''
    }
    
    setClients(prev => [...prev, clientWithContacts])
    return clientWithContacts
  }, [user, sanitizeData, replaceClientContacts])

  const updateClient = useCallback(async (id, c) => {
    const { data, error } = await supabase.from('clients').update(sanitizeData(c, 'client')).eq('id', id).select().single()
    if (error) throw error
    if (c.contacts) await replaceClientContacts(id, c.contacts)
    
    // 담당자 저장 후 최신 담당자 데이터 조회
    const { data: contactsData } = await supabase
      .from('client_contacts')
      .select('*')
      .eq('client_id', id)
      .order('is_primary', { ascending: false })
    
    const contacts = contactsData || []
    const primary = contacts.find(c => c.is_primary) || contacts[0]
    
    // 최신 담당자 정보가 포함된 client 객체 생성
    const clientWithContacts = {
      ...data,
      lastOrder: data.last_order,
      orderAmount: data.order_amount,
      contact_person: primary?.name || '',
      phone: primary?.phone || '',
      email: primary?.email || ''
    }
    
    setClients(prev => prev.map(item => item.id === id ? clientWithContacts : item))
    return clientWithContacts
  }, [sanitizeData, replaceClientContacts])

  const addSale = useCallback(async (s) => {
    const uid = await getValidUserId(user)
    
    // 중복 체크: 거래처명과 판매날짜가 모두 일치하는 데이터가 이미 있는지 확인
    const rowsToInsert = []
    const skippedRows = []
    
    for (const r of s.rows) {
      const clientId = r.clientId || r.client_id
      const saleDate = r.sale_date || r.saleDate
      
      // 기존 sales 데이터에서 중복 확인 (그룹화된 데이터를 평탄화하여 확인)
      const existingSale = sales.find(sale => {
        const saleClientId = sale.client_id || sale.clientId
        const saleDateStr = sale.sale_date || sale.date
        return saleClientId === clientId && saleDateStr === saleDate
      })
      
      if (existingSale) {
        skippedRows.push({
          clientId: clientId,
          saleDate: saleDate,
          reason: '이미 존재하는 매출 데이터입니다.'
        })
        continue
      }
      
      rowsToInsert.push(r)
    }
    
    // 건너뛴 항목이 있으면 로그 출력
    if (skippedRows.length > 0) {
      console.log(`건너뛴 매출 데이터: ${skippedRows.length}건`)
    }
    
    // 등록할 데이터가 없으면 조기 종료
    if (rowsToInsert.length === 0) {
      return { skipped: skippedRows.length }
    }
    
    // DB 컬럼명(snake_case)으로 변환 및 필드 정제 (PGRST204 에러 방지)
    const rows = rowsToInsert.map(r => {
      const row = {
        client_id: r.clientId || r.client_id,
        sale_date: r.sale_date || r.saleDate || null,
        item_name: r.item_name || r.itemName || '', // 품목명이 없어도 등록 가능
        quantity: Number(r.quantity) || 0,
        unit_price: Number(r.unitPrice || r.unit_price) || 0,
        total_amount: Number(r.totalAmount || r.total_amount || (r.quantity * (r.unitPrice || r.unit_price))) || 0,
        notes: r.notes || '', // 비고가 없어도 등록 가능
        created_by: uid
      }
      
      // 빈 문자열 날짜 필드를 null로 변환
      if (!row.sale_date || row.sale_date === '') {
        row.sale_date = null
      }
      
      // DB에 없는 필드 제거 (임시 필드 및 camelCase 필드) - PGRST204 에러 방지
      delete row.clientId
      delete row.totalAmount
      delete row.unitPrice
      delete row.saleDate
      delete row.itemName
      delete row.rowIndex // 엑셀 파싱 시 추가된 임시 필드 제거
      delete row.clientName // 엑셀 파싱 시 사용된 임시 필드 제거
      delete row.price // DB에 없는 필드 (unit_price 사용)
      
      return row
    })
    
    // 디버깅: DB에 전송될 데이터 확인
    console.log('[addSale] sales 테이블에 저장될 데이터:', rows)
    console.log('[addSale] 전송될 데이터의 키 목록:', rows.map(r => Object.keys(r)))
    
    const { data, error } = await supabase.from('sales').insert(rows).select()
    if (error) throw error
    
    // 새로 추가된 데이터를 기존 데이터와 합쳐서 그룹화
    setSales(prev => {
      // 새로 추가된 데이터 정규화
      const newSales = data.map(d => ({ ...d, totalAmount: d.total_amount, clientId: d.client_id, date: d.sale_date }))
      
      // 기존 데이터가 그룹화되어 있으므로, items 배열을 평탄화해야 함
      const flattenedPrev = prev.flatMap(group => {
        // 그룹에 items 배열이 있으면 각 항목을 개별 행으로 반환
        if (group.items && Array.isArray(group.items) && group.items.length > 0) {
          return group.items.map(item => ({
            ...item,
            sale_date: group.sale_date || group.date,
            date: group.sale_date || group.date,
            client_id: group.client_id || group.clientId,
            clientId: group.client_id || group.clientId,
            notes: group.notes || item.notes || '',
            created_at: item.created_at || group.created_at
          }))
        }
        // items 배열이 없으면 그룹 자체를 개별 행으로 반환 (fallback)
        return [{
          id: group.id,
          item_name: group.displayItemName || '',
          quantity: 0,
          unit_price: 0,
          total_amount: group.total_amount || group.totalAmount || 0,
          sale_date: group.sale_date || group.date,
          date: group.sale_date || group.date,
          client_id: group.client_id || group.clientId,
          clientId: group.client_id || group.clientId,
          notes: group.notes || '',
          created_at: group.created_at
        }]
      })
      
      // 기존 데이터(평탄화)와 새 데이터 합치기
      const allSales = [...flattenedPrev, ...newSales]
      // 전체 데이터를 다시 그룹화 (새로 추가된 데이터가 기존 그룹과 합쳐질 수 있음)
      return processGroupedSales(allSales)
    })
    
    return { inserted: rows.length, skipped: skippedRows.length }
  }, [user, processGroupedSales, sales])

  // 매출 수정 (그룹 내 모든 항목 업데이트)
  const updateSale = useCallback(async (groupId, saleData) => {
    const uid = await getValidUserId(user)
    
    try {
      // 그룹 ID로 기존 그룹 찾기 (현재 상태에서)
      const currentGroup = sales.find(s => s.id === groupId)
      if (!currentGroup || !currentGroup.items || currentGroup.items.length === 0) {
        throw new Error('수정할 매출 데이터를 찾을 수 없습니다.')
      }

      // 기존 그룹 내 모든 항목의 ID 수집
      const existingItemIds = currentGroup.items
        .filter(item => item.id)
        .map(item => item.id)

      // 기존 항목 삭제
      if (existingItemIds.length > 0) {
        const { error: deleteError } = await supabase
          .from('sales')
          .delete()
          .in('id', existingItemIds)
        
        if (deleteError) throw deleteError
      }

      // 새로운 항목들 추가
      const rows = saleData.items.map(item => ({
        client_id: saleData.clientId || saleData.client_id,
        sale_date: saleData.sale_date || saleData.saleDate,
        item_name: item.item_name || item.itemName || '',
        quantity: Number(item.quantity) || 0,
        unit_price: Number(item.unit_price || item.unitPrice) || 0,
        total_amount: Number(item.total_amount || item.totalAmount || (item.quantity * (item.unit_price || item.unitPrice))) || 0,
        notes: saleData.notes || '',
        created_by: uid
      }))

      const { data, error } = await supabase.from('sales').insert(rows).select()
      if (error) throw error

      // 상태 업데이트: 기존 그룹 제거하고 새 그룹 추가
      setSales(prev => {
        // 기존 그룹 제거
        const filtered = prev.filter(s => s.id !== groupId)
        
        // 새 데이터 정규화 및 그룹화
        const newSales = data.map(d => ({ ...d, totalAmount: d.total_amount, clientId: d.client_id, date: d.sale_date }))
        const allSales = filtered.flatMap(group => {
          if (group.items && Array.isArray(group.items) && group.items.length > 0) {
            return group.items.map(item => ({
              ...item,
              sale_date: group.sale_date || group.date,
              date: group.sale_date || group.date,
              client_id: group.client_id || group.clientId,
              clientId: group.client_id || group.clientId,
              notes: group.notes || item.notes || '',
              created_at: item.created_at || group.created_at
            }))
          }
          return [{
            id: group.id,
            item_name: group.displayItemName || '',
            quantity: 0,
            unit_price: 0,
            total_amount: group.total_amount || group.totalAmount || 0,
            sale_date: group.sale_date || group.date,
            date: group.sale_date || group.date,
            client_id: group.client_id || group.clientId,
            clientId: group.client_id || group.clientId,
            notes: group.notes || '',
            created_at: group.created_at
          }]
        })
        
        return processGroupedSales([...allSales, ...newSales])
      })
    } catch (error) {
      console.error('매출 수정 중 오류:', error)
      throw error
    }
  }, [user, sales, processGroupedSales])

  // 매출 삭제 (그룹 내 모든 항목 삭제)
  // 제품 삭제 함수
  const deleteProduct = useCallback(async (productId) => {
    try {
      // 제품 정보 가져오기
      const product = products.find(p => p.id === productId)
      if (!product) {
        throw new Error('삭제할 제품을 찾을 수 없습니다.')
      }

      // 매출 기록에 해당 제품명이 사용되고 있는지 확인 (item_name으로 확인)
      const { data: salesWithProduct, error: checkError } = await supabase
        .from('sales')
        .select('id, item_name')
        .eq('item_name', product.name)
        .limit(1)
      
      if (checkError) {
        console.error('매출 기록 확인 중 오류:', checkError)
        // 확인 실패해도 삭제 시도 (DB 제약조건에서 처리)
      }
      
      if (salesWithProduct && salesWithProduct.length > 0) {
        throw new Error('해당 제품은 매출 기록이 있어 삭제할 수 없습니다. 대신 숨기거나 이름을 변경하세요.')
      }

      // 제품 삭제
      const { error } = await supabase
        .from('products')
        .delete()
        .eq('id', productId)
      
      if (error) {
        // 외래 키 제약조건 에러 처리
        if (error.code === '23503' || error.message?.includes('foreign key') || error.message?.includes('violates foreign key')) {
          throw new Error('해당 제품은 매출 기록이 있어 삭제할 수 없습니다. 대신 숨기거나 이름을 변경하세요.')
        }
        throw error
      }

      // 상태 업데이트: 제품 제거
      setProducts(prev => prev.filter(p => p.id !== productId))
    } catch (error) {
      console.error('제품 삭제 중 오류:', error)
      throw error
    }
  }, [products])

  const deleteSale = useCallback(async (groupId) => {
    try {
      // 그룹 ID로 기존 그룹 찾기
      const currentGroup = sales.find(s => s.id === groupId)
      if (!currentGroup || !currentGroup.items || currentGroup.items.length === 0) {
        throw new Error('삭제할 매출 데이터를 찾을 수 없습니다.')
      }

      // 그룹 내 모든 항목의 ID 수집
      const itemIds = currentGroup.items
        .filter(item => item.id)
        .map(item => item.id)

      if (itemIds.length === 0) {
        throw new Error('삭제할 매출 항목이 없습니다.')
      }

      // 모든 항목 삭제
      const { error } = await supabase
        .from('sales')
        .delete()
        .in('id', itemIds)
      
      if (error) throw error

      // 상태 업데이트: 그룹 제거
      setSales(prev => prev.filter(s => s.id !== groupId))
    } catch (error) {
      console.error('매출 삭제 중 오류:', error)
      throw error
    }
  }, [sales])

  // 담당자 목록 가져오기
  const fetchClientContacts = useCallback(async (clientId) => {
    try {
      const { data, error } = await supabase
        .from('client_contacts')
        .select('*')
        .eq('client_id', clientId)
        .order('is_primary', { ascending: false })
      
      if (error) throw error
      return (data || []).map(contact => ({
        ...contact,
        department_role: contact.department_role || ''
      }))
    } catch (error) {
      console.error('담당자 목록 불러오기 오류:', error)
      throw error
    }
  }, [])

  // 거래처 삭제 (외래 키 제약 조건 처리)
  const deleteClient = useCallback(async (clientId) => {
    try {
      // 1. 연결된 데이터를 먼저 삭제 (외래 키 제약 조건 처리)
      // client_contacts 삭제
      const { error: contactsError } = await supabase
        .from('client_contacts')
        .delete()
        .eq('client_id', clientId)
      
      if (contactsError) {
        console.error('담당자 삭제 오류:', contactsError)
        throw contactsError
      }

      // activities 삭제
      const { error: activitiesError } = await supabase
        .from('activities')
        .delete()
        .eq('client_id', clientId)
      
      if (activitiesError) {
        console.error('활동 삭제 오류:', activitiesError)
        throw activitiesError
      }

      // sales 삭제
      const { error: salesError } = await supabase
        .from('sales')
        .delete()
        .eq('client_id', clientId)
      
      if (salesError) {
        console.error('매출 삭제 오류:', salesError)
        throw salesError
      }

      // 2. 거래처 삭제
      const { error: clientError } = await supabase
        .from('clients')
        .delete()
        .eq('id', clientId)
      
      if (clientError) {
        console.error('거래처 삭제 오류:', clientError)
        throw clientError
      }

      // 3. 로컬 상태 업데이트
      setClients(prev => prev.filter(c => c.id !== clientId))
      setActivities(prev => prev.filter(a => (a.client_id || a.clientId) !== clientId))
      setSales(prev => prev.filter(s => (s.client_id || s.clientId) !== clientId))
      
      return { success: true }
    } catch (error) {
      console.error('거래처 삭제 중 오류:', error)
      throw error
    }
  }, [])

  // 거래처 일괄 등록 함수 (중복 방지 로직 포함)
  const addClientsBulk = useCallback(async (clientsData) => {
    const uid = await getValidUserId(user)
    const results = []
    const errors = []
    const skipped = []

    for (let i = 0; i < clientsData.length; i++) {
      const clientData = clientsData[i]
      try {
        // 중복 체크: 회사명만으로 체크 (핵심 식별자)
        const existingClient = clients.find(c => c.company === clientData.company)

        if (existingClient) {
          skipped.push({
            rowIndex: clientData.rowIndex || i + 1,
            company: clientData.company || '알 수 없음',
            reason: '이미 존재하는 거래처입니다.'
          })
          continue
        }

        // clients 테이블에 저장
        const sanitized = sanitizeData(clientData, 'client')
        const { data, error } = await supabase
          .from('clients')
          .insert([{ ...sanitized, created_by: uid }])
          .select()
          .single()

        if (error) throw error

        // 담당자 저장 (담당자1은 자동으로 is_primary: true로 설정됨)
        if (clientData.contacts && clientData.contacts.length > 0) {
          await replaceClientContacts(data.id, clientData.contacts)
        }

        // 담당자 저장 후 최신 담당자 데이터 조회
        const { data: contactsData } = await supabase
          .from('client_contacts')
          .select('*')
          .eq('client_id', data.id)
          .order('is_primary', { ascending: false })

        const contacts = contactsData || []
        const primary = contacts.find(c => c.is_primary) || contacts[0]

        // 최신 담당자 정보가 포함된 client 객체 생성
        const clientWithContacts = {
          ...data,
          lastOrder: data.last_order,
          orderAmount: data.order_amount,
          contact_person: primary?.name || '',
          phone: primary?.phone || '',
          email: primary?.email || ''
        }

        results.push(clientWithContacts)
      } catch (error) {
        console.error(`거래처 등록 오류 (${clientData.rowIndex || i + 1}번째 행):`, error)
        errors.push({
          rowIndex: clientData.rowIndex || i + 1,
          company: clientData.company || '알 수 없음',
          error: error.message || '알 수 없는 오류'
        })
      }
    }

    // 성공한 거래처들을 상태에 추가
    if (results.length > 0) {
      setClients(prev => [...prev, ...results])
    }

    // 건너뛴 항목이 있으면 메시지에 포함
    if (skipped.length > 0) {
      const skippedMessage = skipped.map(s => `${s.rowIndex}번째 행 (${s.company}): ${s.reason}`).join('\n')
      console.log(`건너뛴 거래처:\n${skippedMessage}`)
    }

    // 오류가 있으면 예외 발생
    if (errors.length > 0) {
      const errorMessage = errors.map(e => `${e.rowIndex}번째 행 (${e.company}): ${e.error}`).join('\n')
      throw new Error(`일부 거래처 등록에 실패했습니다:\n${errorMessage}`)
    }

    return results
  }, [user, sanitizeData, replaceClientContacts, clients])

  // 활동 내역 추가
  const addActivity = useCallback(async (activityData) => {
    const uid = await getValidUserId(user)
    
    // DB 컬럼명(snake_case)으로 변환 (user 필드는 DB에 없으므로 제외)
    const data = {
      client_id: activityData.clientId || activityData.client_id,
      activity_date: activityData.activity_date || activityData.date || null,
      type: activityData.type || '',
      description: activityData.description || '',
      status: activityData.status || '완료',
      next_action_date: activityData.next_action_date || null,
      next_action_detail: activityData.next_action_detail || '',
      created_by: uid
    }
    
    // 빈 문자열 날짜 필드를 null로 변환
    if (!data.activity_date || data.activity_date === '') {
      data.activity_date = null
    }
    if (!data.next_action_date || data.next_action_date === '') {
      data.next_action_date = null
    }
    
    // DB에 없는 필드 제거
    delete data.clientId
    delete data.date
    delete data.user // user 필드는 DB에 없으므로 제거
    
    const { data: insertedData, error } = await supabase.from('activities').insert([data]).select().single()
    if (error) throw error
    
    // 참석자 정보(user)는 UI용으로만 사용하고 DB에는 저장하지 않음
    // clientName 매핑 추가 (clients 조인)
    const client = clients.find(c => c.id === insertedData.client_id)
    const newActivity = { 
      ...insertedData, 
      clientId: insertedData.client_id, 
      date: insertedData.activity_date,
      clientName: client?.company || '알 수 없음',
      user: activityData.user || '' // UI 표시용으로만 유지
    }
    setActivities(prev => [newActivity, ...prev])
    return newActivity
  }, [user, clients])

  // 활동 내역 수정
  const updateActivity = useCallback(async (id, activityData) => {
    // DB 컬럼명(snake_case)으로 변환 (user 필드는 DB에 없으므로 제외)
    const data = {
      client_id: activityData.clientId || activityData.client_id,
      activity_date: activityData.activity_date || activityData.date || null,
      type: activityData.type || '',
      description: activityData.description || '',
      status: activityData.status || '완료',
      next_action_date: activityData.next_action_date || null,
      next_action_detail: activityData.next_action_detail || ''
    }
    
    // 빈 문자열 날짜 필드를 null로 변환
    if (!data.activity_date || data.activity_date === '') {
      data.activity_date = null
    }
    if (!data.next_action_date || data.next_action_date === '') {
      data.next_action_date = null
    }
    
    // DB에 없는 필드 제거
    delete data.clientId
    delete data.date
    
    const { data: updatedData, error } = await supabase.from('activities').update(data).eq('id', id).select().single()
    if (error) throw error
    
    // 참석자 정보(user)는 UI용으로만 사용하고 DB에는 저장하지 않음
    // clientName 매핑 추가 (clients 조인)
    const client = clients.find(c => c.id === updatedData.client_id)
    const updatedActivity = { 
      ...updatedData, 
      clientId: updatedData.client_id, 
      date: updatedData.activity_date,
      clientName: client?.company || '알 수 없음',
      user: activityData.user || '' // UI 표시용으로만 유지
    }
    setActivities(prev => prev.map(item => item.id === id ? updatedActivity : item))
    return updatedActivity
  }, [clients])

  // 활동 내역 삭제
  const deleteActivity = useCallback(async (id) => {
    const { error } = await supabase.from('activities').delete().eq('id', id)
    if (error) throw error
    
    setActivities(prev => prev.filter(item => item.id !== id))
  }, [])

  // 이슈 추가
  const addIssue = useCallback(async (issueData) => {
    const uid = await getValidUserId(user)
    
    // DB 컬럼명(snake_case)으로 변환
    const data = {
      title: issueData.title || '',
      content: issueData.content || issueData.description || '',
      status: issueData.status || '등록',
      target_date: issueData.target_date || issueData.date || null,
      created_by: uid
    }
    
    // 빈 문자열 날짜 필드를 null로 변환
    if (!data.target_date || data.target_date === '') {
      data.target_date = null
    }
    
    // DB에 없는 필드 제거
    delete data.date
    delete data.description
    
    const { data: insertedData, error } = await supabase.from('issues').insert([data]).select().single()
    if (error) throw error
    
    setIssues(prev => [insertedData, ...prev])
    return insertedData
  }, [user])

  // 이슈 수정
  const updateIssue = useCallback(async (id, issueData) => {
    // DB 컬럼명(snake_case)으로 변환
    const data = {
      title: issueData.title || '',
      content: issueData.content || issueData.description || '',
      status: issueData.status || '등록',
      target_date: issueData.target_date || issueData.date || null,
    }
    
    // 빈 문자열 날짜 필드를 null로 변환
    if (!data.target_date || data.target_date === '') {
      data.target_date = null
    }
    
    // DB에 없는 필드 제거
    delete data.date
    delete data.description
    
    const { data: updatedData, error } = await supabase.from('issues').update(data).eq('id', id).select().single()
    if (error) throw error
    
    setIssues(prev => prev.map(item => item.id === id ? updatedData : item))
    return updatedData
  }, [])

  // 이슈 삭제
  const deleteIssue = useCallback(async (id) => {
    const { error } = await supabase.from('issues').delete().eq('id', id)
    if (error) throw error
    
    setIssues(prev => prev.filter(item => item.id !== id))
  }, [])

  // 모달 열림/닫힘 추적 함수
  const registerModal = useCallback(() => {
    setOpenModalCount(prev => prev + 1)
    return () => {
      setOpenModalCount(prev => Math.max(0, prev - 1))
    }
  }, [])

  // 제품 일괄 등록 함수 (중복 방지 로직 포함)
  const addProductsBulk = useCallback(async (productsData) => {
    const uid = await getValidUserId(user)
    const results = []
    const errors = []
    const skipped = []

    for (let i = 0; i < productsData.length; i++) {
      const productData = productsData[i]
      try {
        // 중복 체크: 제품명이 동일한 경우 건너뛰기
        const existingProduct = products.find(p => p.name === productData.name)
        
        if (existingProduct) {
          skipped.push({
            rowIndex: productData.rowIndex || i + 1,
            name: productData.name || '알 수 없음',
            reason: '이미 존재하는 제품입니다.'
          })
          continue
        }

        // DB 전송 전 rowIndex 등 임시 필드 제거 및 DB 스키마 확인
        // products 테이블 스키마: name, type, standard (단가 필드 제거됨)
        const productToInsert = {
          name: productData.name,
          type: productData.type || '', // 비어있어도 등록 가능
          standard: productData.standard || '', // 비어있어도 등록 가능
          created_by: uid
        }
        // DB에 존재하지 않는 임시 필드 제거 (PGRST204 에러 방지)
        delete productToInsert.rowIndex
        delete productToInsert.clientName
        delete productToInsert.unitPrice
        delete productToInsert.unit_price
        delete productToInsert.price // 단가 필드 제거
        
        const { data, error } = await supabase
          .from('products')
          .insert([productToInsert])
          .select()
          .single()

        if (error) throw error
        results.push(data)
      } catch (error) {
        console.error(`제품 등록 오류 (${productData.rowIndex || i + 1}번째 행):`, error)
        errors.push({
          rowIndex: productData.rowIndex || i + 1,
          name: productData.name || '알 수 없음',
          error: error.message || '알 수 없는 오류'
        })
      }
    }

    // 성공한 제품들을 상태에 추가
    if (results.length > 0) {
      setProducts(prev => [...prev, ...results])
    }

    // 건너뛴 항목이 있으면 메시지에 포함
    if (skipped.length > 0) {
      const skippedMessage = skipped.map(s => `${s.rowIndex}번째 행 (${s.name}): ${s.reason}`).join('\n')
      console.log(`건너뛴 제품:\n${skippedMessage}`)
    }

    // 오류가 있으면 예외 발생
    if (errors.length > 0) {
      const errorMessage = errors.map(e => `${e.rowIndex}번째 행 (${e.name}): ${e.error}`).join('\n')
      throw new Error(`일부 제품 등록에 실패했습니다:\n${errorMessage}`)
    }

    return results
  }, [user, products])

  const value = {
    products, clients, activities, sales, issues, loading, isOnline, pendingSyncCount,
    addClient, updateClient, replaceClientContacts, addSale, updateSale, deleteSale, getStats, getWeeklySalesData,
    fetchClientContacts, deleteClient, addClientsBulk, addProductsBulk,
    addActivity, updateActivity, deleteActivity, addIssue, updateIssue, deleteIssue,
    registerModal, // 모달 상태 등록 함수
    addProduct: async (p) => { 
      const uid = await getValidUserId(user); 
      const { data } = await supabase.from('products').insert([{ ...p, created_by: uid }]).select().single();
      setProducts(prev => [...prev, data])
    },
    deleteProduct // 제품 삭제 함수 추가
  }

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>
}