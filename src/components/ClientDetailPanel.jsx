import React, { useState, useMemo, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useData } from '../contexts/DataContext'
import {
    Phone,
    Mail,
    Building2,
    DollarSign,
    Activity,
    TrendingUp,
    TrendingDown,
    ArrowRight
} from 'lucide-react'
import { formatCurrency } from '../utils/formatters'
import { coerceClientStatus, getClientStatusTone } from '../utils/clientStatus'
import { showError } from '../utils/alert'

const ClientDetailPanel = ({ clientId, onClose, isEmbedded = false }) => {
    const { clients, sales, activities, loading, ensureSalesDetail } = useData()

    // 거래 내역에 품목이 나와야 한다 — DataContext 참고
    useEffect(() => { ensureSalesDetail() }, [ensureSalesDetail])
    const [fallbackClient, setFallbackClient] = useState(null)
    const [isFetchingClient, setIsFetchingClient] = useState(false)
    const navigate = useNavigate()

    // 현재 선택된 고객 정보
    const currentClient = useMemo(() => {
        if (!clients || !Array.isArray(clients) || !clientId) return null
        return clients.find((c) => String(c.id) === String(clientId))
    }, [clients, clientId])

    useEffect(() => {
        const fetchFallbackClient = async () => {
            if (loading || currentClient || !clientId) return
            setIsFetchingClient(true)
            try {
                const { data: clientData, error } = await supabase
                    .from('clients')
                    .select('*')
                    .eq('id', clientId)
                    .maybeSingle()

                if (error) throw error
                if (!clientData) {
                    setFallbackClient(null)
                    return
                }

                const { data: contactsData } = await supabase
                    .from('client_contacts')
                    .select('*')
                    .eq('client_id', clientData.id)
                    .order('is_primary', { ascending: false })

                const contacts = (contactsData || []).filter((c) => !c.deleted_at)
                const primary = contacts.find((c) => c.is_primary) || contacts[0]

                setFallbackClient({
                    ...clientData,
                    contacts,
                    contact_person: primary?.name || '',
                    phone: primary?.phone || '',
                    email: primary?.email || '',
                })
            } catch (error) {
                console.error('고객 상세 정보 조회 오류:', error)
            } finally {
                setIsFetchingClient(false)
            }
        }

        fetchFallbackClient()
    }, [loading, currentClient, clientId])

    const resolvedClient = currentClient || fallbackClient

    /*
     * 연락처는 **여기서 따로 읽는다.**
     *
     * `DataContext`는 대표 담당자 하나만 펴서(`contact_person`/`phone`/`email`)
     * 내려준다. 목록 화면에는 그것으로 충분하지만 상세는 다르다 — 만나러
     * 가면서 누구에게 걸지 고르는 자리다. 거래처 하나에 대한 한 번의 조회라
     * 무겁지 않다.
     *
     * **번호가 있는 사람을 앞에 세운다.** (주)아모레퍼시픽은 8명 중 4명만
     * 번호가 있는데 하필 대표가 그 4명에 없었다. 대표 순서만 따르면 정작
     * 걸 수 있는 사람이 아래로 밀린다.
     */
    const [contactList, setContactList] = useState([])
    useEffect(() => {
        if (!clientId) { setContactList([]); return undefined }
        let alive = true
        ;(async () => {
            const { data, error } = await supabase
                .from('client_contacts')
                .select('id, name, department_role, phone, email, is_primary, deleted_at')
                .eq('client_id', clientId)
            if (!alive) return
            if (error) { console.warn('연락처 조회 실패:', error.message); setContactList([]); return }
            const rows = (data || []).filter((c) => !c.deleted_at)
            rows.sort((a, b) =>
                (b.is_primary ? 1 : 0) - (a.is_primary ? 1 : 0)
                || (b.phone ? 1 : 0) - (a.phone ? 1 : 0)
                || String(a.name || '').localeCompare(String(b.name || ''), 'ko'))
            setContactList(rows)
        })()
        return () => { alive = false }
    }, [clientId])

    // 같은 회사명을 가진 모든 고객 데이터
    const companyClients = useMemo(() => {
        if (!resolvedClient) return []
        if (currentClient && clients && Array.isArray(clients)) {
            const companyName = currentClient.company
            if (!companyName) return [currentClient]
            return clients.filter((c) => c.company === companyName)
        }
        const companyName = resolvedClient.company
        if (!companyName) return [currentClient]
        return [resolvedClient]
    }, [currentClient, clients, resolvedClient])

    // 대표 담당자 (첫 번째)
    const primaryContact = companyClients[0] || resolvedClient

    // 이 회사의 모든 매출 내역
    const companySales = useMemo(() => {
        if (!sales || !Array.isArray(sales) || !primaryContact) return []
        const companyName = primaryContact.company
        if (!companyName) return []

        // 모든 담당자의 ID를 가져와서 매출 필터링
        const companyClientIds = companyClients.map((c) => String(c.id))
        return sales.filter((sale) =>
            companyClientIds.includes(String(sale.clientId || sale.client_id))
        )
    }, [sales, companyClients, primaryContact])

    // 이 회사의 모든 활동 내역
    const companyActivities = useMemo(() => {
        if (!activities || !Array.isArray(activities) || !primaryContact) return []
        const companyName = primaryContact.company
        if (!companyName) return []

        // 모든 담당자의 ID를 가져와서 활동 필터링
        const companyClientIds = companyClients.map((c) => String(c.id))
        return activities.filter((activity) =>
            companyClientIds.includes(String(activity.clientId || activity.client_id))
        )
    }, [activities, companyClients, primaryContact])

    // 이번 달 매출 계산
    const thisMonthSales = useMemo(() => {
        const now = new Date()
        const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())

        return companySales
            .filter((sale) => {
                const saleDate = sale.sale_date || sale.date
                if (!saleDate) return false
                const saleDateObj = new Date(saleDate)
                return saleDateObj >= firstDayOfMonth && saleDateObj <= today
            })
            .reduce((sum, sale) => sum + (sale.totalAmount || 0), 0)
    }, [companySales])

    // 올해 누적 매출 계산 (YTD)
    const ytdSales = useMemo(() => {
        const now = new Date()
        const firstDayOfYear = new Date(now.getFullYear(), 0, 1)
        const today = new Date()

        return companySales
            .filter((sale) => {
                const saleDate = sale.sale_date || sale.date
                if (!saleDate) return false
                const saleDateObj = new Date(saleDate)
                return saleDateObj >= firstDayOfYear && saleDateObj <= today
            })
            .reduce((sum, sale) => sum + (sale.totalAmount || 0), 0)
    }, [companySales])

    // 전년 동기 대비 성장률 계산 (YoY)
    const yoyGrowth = useMemo(() => {
        const now = new Date()
        const currentYear = now.getFullYear()
        const currentMonth = now.getMonth()
        const currentDay = now.getDate()

        const firstDayOfYear = new Date(currentYear, 0, 1)
        const today = new Date(currentYear, currentMonth, currentDay)

        const thisYearSales = companySales
            .filter((sale) => {
                const saleDate = sale.sale_date || sale.date
                if (!saleDate) return false
                const saleDateObj = new Date(saleDate)
                saleDateObj.setHours(0, 0, 0, 0)
                return saleDateObj >= new Date(firstDayOfYear.setHours(0, 0, 0, 0)) && saleDateObj <= new Date(today.setHours(0, 0, 0, 0))
            })
            .reduce((sum, sale) => sum + (sale.totalAmount || 0), 0)

        const lastYear = currentYear - 1
        const firstDayOfLastYear = new Date(lastYear, 0, 1)
        const lastYearSameDate = new Date(lastYear, currentMonth, currentDay)

        const lastYearSales = companySales
            .filter((sale) => {
                const saleDate = sale.sale_date || sale.date
                if (!saleDate) return false
                const saleDateObj = new Date(saleDate)
                const saleYear = saleDateObj.getFullYear()
                saleDateObj.setHours(0, 0, 0, 0)
                return (
                    saleYear === lastYear &&
                    saleDateObj >= new Date(firstDayOfLastYear.setHours(0, 0, 0, 0)) &&
                    saleDateObj <= new Date(lastYearSameDate.setHours(0, 0, 0, 0))
                )
            })
            .reduce((sum, sale) => sum + (sale.totalAmount || 0), 0)

        if (lastYearSales === 0) return { value: null, label: '신규', isPositive: null }

        const growthRate = ((thisYearSales - lastYearSales) / lastYearSales) * 100
        const isPositive = growthRate > 0

        return {
            value: growthRate,
            label: `${isPositive ? '+' : ''}${growthRate.toFixed(1)}%`,
            isPositive: isPositive,
        }
    }, [companySales])

    // 정렬된 활동
    const sortedActivities = useMemo(() => {
        return [...companyActivities].sort((a, b) => new Date(b.activity_date || b.date) - new Date(a.activity_date || a.date))
    }, [companyActivities])

    // Flattened Sales Items (Last 3 Months)
    const flatSalesItems = useMemo(() => {
        if (!companySales || companySales.length === 0) return []
        const flats = []
        /*
         * **키가 겹치고 있었다.** `${sale.id}-${item.product_id}`로 만들었는데
         * 매출을 가볍게 받는 경로(`SALES_LIGHT`)에는 **`id`가 없다** — 무게를
         * 줄이려고 일부러 뺀 칸이다. `product_id`도 비어 있는 품목이 있어서
         * 같은 날 여러 줄이 같은 키를 갖게 됐다.
         * React는 이럴 때 "줄을 빠뜨리거나 겹쳐 그릴 수 있다"고 경고한다 —
         * 방문 직전에 보는 구매 이력이라 줄이 사라지면 안 된다.
         * 순번을 섞어 어떤 경우에도 유일하게 만든다.
         */
        companySales.forEach((sale, si) => {
            const saleDate = sale.sale_date || sale.date
            const items = sale.items || []
            const base = sale.id || `${saleDate}#${si}`
            if (items.length > 0) {
                items.forEach((item, ii) => {
                    flats.push({
                        id: item.id || `${base}:${ii}`,
                        saleId: sale.id,
                        date: saleDate,
                        itemName: item.item_name || item.itemName || item.product_name || '-',
                        quantity: Number(item.quantity) || 0,
                        unitPrice: Number(item.unit_price || item.unitPrice || item.price) || 0,
                        totalAmount: Number(item.total_amount || item.totalAmount) || 0,
                        notes: item.notes || sale.notes || '-'
                    })
                })
            } else {
                flats.push({
                    id: base,
                    saleId: sale.id,
                    date: saleDate,
                    itemName: sale.displayItemName || sale.item_name || '-',
                    quantity: 1,
                    unitPrice: Number(sale.total_amount || sale.totalAmount) || 0,
                    totalAmount: Number(sale.total_amount || sale.totalAmount) || 0,
                    notes: sale.notes || '-'
                })
            }
        })

        const threeMonthsAgo = new Date()
        threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3)
        threeMonthsAgo.setHours(0, 0, 0, 0)

        return flats
            .filter(item => new Date(item.date) >= threeMonthsAgo)
            .sort((a, b) => new Date(b.date) - new Date(a.date))
    }, [companySales])

    // Top Products
    const topProducts = useMemo(() => {
        if (!flatSalesItems.length) return []
        const productStats = {}
        flatSalesItems.forEach(item => {
            const name = item.itemName
            if (!productStats[name]) {
                productStats[name] = { name, totalQty: 0, lastSoldDate: item.date, lastPrice: item.unitPrice }
            }
            productStats[name].totalQty += item.quantity
            if (new Date(item.date) > new Date(productStats[name].lastSoldDate)) {
                productStats[name].lastSoldDate = item.date
                productStats[name].lastPrice = item.unitPrice
            }
        })
        return Object.values(productStats).sort((a, b) => b.totalQty - a.totalQty).slice(0, 3)
    }, [flatSalesItems])

    const lastActivity = sortedActivities[0]

    if (loading || isFetchingClient) {
        return <div className="p-8 text-center text-gray-500">정보를 불러오는 중...</div>
    }

    if (!resolvedClient) {
        return <div className="p-8 text-center text-gray-500">고객 정보를 찾을 수 없습니다.</div>
    }

    return (
        <div className={`h-full overflow-y-auto bg-slate-50 ${isEmbedded ? 'p-6' : ''}`}>
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h2 className="text-xl font-bold text-slate-800">{primaryContact.company}</h2>
                    <p className="text-sm text-slate-500">{primaryContact.contact_person} {primaryContact.role && `· ${primaryContact.role}`}</p>
                </div>
                <div className="flex items-center gap-2">
                    {/* Full Page Link Button if Embedded */}
                    {isEmbedded && (
                        <Link to={`/clients/${clientId}`} className="p-2 hover:bg-slate-200 rounded-full text-slate-500" title="전체 화면으로 보기">
                            <ArrowRight className="w-5 h-5" />
                        </Link>
                    )}
                    {/* 목록과 **같은 함수**를 본다. 한쪽만 고치면 같은 거래처가
                        화면마다 다른 색으로 뜬다. */}
                    <span className="badge-status" data-tone={getClientStatusTone(primaryContact.status)}>
                        {coerceClientStatus(primaryContact.status)}
                    </span>
                </div>
            </div>

            {/* Sales Briefing (Top Section) */}
            <div className="mb-6 bg-white p-4 rounded-lg shadow-sm border border-oem-border relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4 opacity-5">
                    <TrendingUp className="w-24 h-24 text-oem-blue" />
                </div>
                <h3 className="text-xs font-bold text-oem-blue flex items-center gap-1 mb-3">
                    <span className="bg-oem-blue text-white px-1 rounded">⚡</span> 한눈에 보기
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 relative z-10">
                    {/* Top Products */}
                    <div>
                        <p className="text-[10px] font-bold text-oem-blue uppercase mb-2">자주 사는 품목</p>
                        <div className="space-y-2">
                            {topProducts.map((prod, idx) => (
                                <div key={idx} className="flex justify-between items-center text-xs">
                                    <span className="font-bold text-slate-700">{prod.name}</span>
                                    <span className="text-oem-blue font-bold">{formatCurrency(prod.lastPrice)}</span>
                                </div>
                            ))}
                            {topProducts.length === 0 && <p className="text-xs text-slate-500">데이터 없음</p>}
                        </div>
                    </div>
                    {/* Last Activity */}
                    <div>
                        <p className="text-[10px] font-bold text-oem-blue uppercase mb-2">최근 활동</p>
                        {lastActivity ? (
                            <div className="bg-oem-grey-light/50 p-2 rounded border border-oem-border">
                                <div className="flex justify-between items-center mb-1">
                                    <span className="font-bold text-xs text-oem-blue">{lastActivity.type}</span>
                                    <span className="text-[10px] text-oem-blue">{new Date(lastActivity.date).toLocaleDateString()}</span>
                                </div>
                                <p className="text-xs text-oem-blue line-clamp-2">{lastActivity.description}</p>
                            </div>
                        ) : <p className="text-xs text-slate-500">활동 없음</p>}
                    </div>
                </div>
            </div>

            {/*
              * 연락처 — **전부 보여준다.**
              *
              * 예전에는 대표 담당자 하나만 펴서 'PHONE / EMAIL' 두 칸에 넣었다.
              * 그런데 (주)아모레퍼시픽은 **8명이 등록돼 있고 그중 4명이 전화번호를
              * 가지고 있는데**, 하필 대표로 지정된 이태성 차장에게만 번호가 없어
              * 화면에는 `-` 두 개만 떴다. 만나러 가면서 누구에게 걸어야 할지
              * 알 수 없는 화면이었다.
              *
              * 번호는 눌러서 바로 건다. 이 화면을 여는 이유가 그것이다.
              */}
            <div className="bg-white rounded border border-oem-border mb-6">
                <div className="px-4 py-2 border-b border-oem-border flex items-center justify-between">
                    <span className="text-xs font-bold">연락처</span>
                    <span className="text-[11px] text-[color:var(--text-secondary)]">{contactList.length}명</span>
                </div>
                {contactList.length === 0 ? (
                    <p className="p-4 text-xs text-[color:var(--text-secondary)]">
                        등록된 연락처가 없습니다. 설정 &gt; 휴대폰 연락처 가져오기로 채울 수 있습니다.
                    </p>
                ) : (
                    <ul className="divide-y divide-oem-border">
                        {contactList.map((c, i) => (
                            <li key={c.id || i} className="px-4 py-2 flex items-center gap-3 flex-wrap">
                                <span className="font-bold text-sm">{c.name}</span>
                                {c.department_role && (
                                    <span className="text-[12px] text-[color:var(--text-secondary)]">{c.department_role}</span>
                                )}
                                {c.is_primary && (
                                    <span className="badge-status" data-tone="new">대표</span>
                                )}
                                <span className="flex-1" />
                                {c.phone && (
                                    <a href={`tel:${String(c.phone).replace(/[^0-9+]/g, '')}`}
                                        className="tel-link text-[13px] font-bold text-[color:var(--accent)] hover:underline">
                                        <Phone className="w-3.5 h-3.5 mr-1" />{c.phone}
                                    </a>
                                )}
                                {c.email && (
                                    <a href={`mailto:${c.email}`} title={c.email}
                                        className="tel-link text-[12px] text-[color:var(--text-secondary)] hover:underline max-w-[180px] truncate">
                                        <Mail className="w-3.5 h-3.5 mr-1 shrink-0" />{c.email}
                                    </a>
                                )}
                            </li>
                        ))}
                    </ul>
                )}
            </div>

            {/* Stats Row */}
            <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="bg-white p-4 rounded border border-slate-200">
                    <p className="text-xs text-slate-500 mb-1">이번 달 매출</p>
                    <p className="text-lg font-bold text-oem-blue">{formatCurrency(thisMonthSales)}</p>
                </div>
                <div className="bg-white p-4 rounded border border-slate-200">
                    <p className="text-xs text-slate-500 mb-1">올해 누적</p>
                    <p className="text-lg font-bold text-slate-700">{formatCurrency(ytdSales)}</p>
                </div>
            </div>

            {/* Recent History List */}
            <div className="bg-white border-t border-slate-200">
                <div className="p-4 border-b border-slate-100 font-bold text-sm text-slate-700">
                    최근 구매 이력 (3개월)
                </div>
                <div className="divide-y divide-slate-50">
                    {flatSalesItems.slice(0, 10).map((item) => (
                        <div key={item.id} className="p-3 hover:bg-slate-50 transition-colors">
                            <div className="flex justify-between mb-1">
                                <span className="text-xs font-bold text-slate-700">{item.itemName}</span>
                                <span className="text-xs font-bold text-slate-600">{formatCurrency(item.totalAmount)}</span>
                            </div>
                            <div className="flex justify-between items-center text-[10px] text-slate-500">
                                <span>{new Date(item.date).toLocaleDateString()} · {item.quantity}개 ({formatCurrency(item.unitPrice)})</span>
                                <span className="max-w-[100px] truncate">{item.notes}</span>
                            </div>
                        </div>
                    ))}
                    {flatSalesItems.length === 0 && (
                        <div className="p-8 text-center text-xs text-slate-500">구매 이력이 없습니다.</div>
                    )}
                </div>
            </div>

        </div>
    )
}

export default ClientDetailPanel
