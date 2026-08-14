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
import { coerceClientStatus } from '../utils/clientStatus'
import { showError } from '../utils/alert'

const ClientDetailPanel = ({ clientId, onClose, isEmbedded = false }) => {
    const { clients, sales, activities, loading } = useData()
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

                const contacts = contactsData || []
                const primary = contacts.find((c) => c.is_primary) || contacts[0]

                setFallbackClient({
                    ...clientData,
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
        companySales.forEach(sale => {
            const saleDate = sale.sale_date || sale.date
            const items = sale.items || []
            if (items.length > 0) {
                items.forEach(item => {
                    flats.push({
                        id: item.id || `${sale.id}-${item.product_id}`,
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
                    id: sale.id,
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
                    <span className={`px-2 py-0.5 rounded text-xs font-bold ${primaryContact.status === '매출' ? 'bg-green-100 text-green-700' : 'bg-slate-200 text-slate-600'}`}>
                        {coerceClientStatus(primaryContact.status)}
                    </span>
                </div>
            </div>

            {/* Sales Briefing (Top Section) */}
            <div className="mb-6 bg-white p-4 rounded-lg shadow-sm border border-indigo-100 relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4 opacity-5">
                    <TrendingUp className="w-24 h-24 text-indigo-600" />
                </div>
                <h3 className="text-xs font-bold text-indigo-900 flex items-center gap-1 mb-3">
                    <span className="bg-indigo-600 text-white px-1 rounded">⚡</span> Sales Briefing
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 relative z-10">
                    {/* Top Products */}
                    <div>
                        <p className="text-[10px] font-bold text-indigo-400 uppercase mb-2">선호 제품 (Top 3)</p>
                        <div className="space-y-2">
                            {topProducts.map((prod, idx) => (
                                <div key={idx} className="flex justify-between items-center text-xs">
                                    <span className="font-bold text-slate-700">{prod.name}</span>
                                    <span className="text-indigo-600 font-bold">{formatCurrency(prod.lastPrice)}</span>
                                </div>
                            ))}
                            {topProducts.length === 0 && <p className="text-xs text-slate-500">데이터 없음</p>}
                        </div>
                    </div>
                    {/* Last Activity */}
                    <div>
                        <p className="text-[10px] font-bold text-indigo-400 uppercase mb-2">최근 활동</p>
                        {lastActivity ? (
                            <div className="bg-indigo-50/50 p-2 rounded border border-indigo-50">
                                <div className="flex justify-between items-center mb-1">
                                    <span className="font-bold text-xs text-indigo-900">{lastActivity.type}</span>
                                    <span className="text-[10px] text-indigo-400">{new Date(lastActivity.date).toLocaleDateString()}</span>
                                </div>
                                <p className="text-xs text-indigo-800 line-clamp-2">{lastActivity.description}</p>
                            </div>
                        ) : <p className="text-xs text-slate-500">활동 없음</p>}
                    </div>
                </div>
            </div>

            {/* Quick Contact */}
            <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="bg-white p-3 rounded border border-slate-200 flex items-center gap-3">
                    <div className="w-8 h-8 rounded bg-green-50 flex items-center justify-center text-green-600"><Phone className="w-4 h-4" /></div>
                    <div className="overflow-hidden">
                        <p className="text-[10px] text-slate-500 uppercase font-bold">Phone</p>
                        <p className="text-sm font-bold text-slate-700 truncate">{primaryContact.phone || '-'}</p>
                    </div>
                </div>
                <div className="bg-white p-3 rounded border border-slate-200 flex items-center gap-3">
                    <div className="w-8 h-8 rounded bg-blue-50 flex items-center justify-center text-blue-600"><Mail className="w-4 h-4" /></div>
                    <div className="overflow-hidden">
                        <p className="text-[10px] text-slate-500 uppercase font-bold">Email</p>
                        <p className="text-sm font-bold text-slate-700 truncate">{primaryContact.email || '-'}</p>
                    </div>
                </div>
            </div>

            {/* Stats Row */}
            <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="bg-white p-4 rounded border border-slate-200">
                    <p className="text-xs text-slate-500 mb-1">이번 달 매출</p>
                    <p className="text-lg font-bold text-oem-blue">{formatCurrency(thisMonthSales)}</p>
                </div>
                <div className="bg-white p-4 rounded border border-slate-200">
                    <p className="text-xs text-slate-500 mb-1">올해 누적 (YTD)</p>
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
