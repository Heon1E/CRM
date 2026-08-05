import React, { useState, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useData } from '../contexts/DataContext'
import { useDashboardData } from '../hooks/useDashboardData'
import { supabase } from '../lib/supabase'
import { KPI_CATEGORIES, getKpiOverrides, setKpiCategory } from '../utils/kpiCategories'
import toast from 'react-hot-toast'
import { Users, TrendingUp, TrendingDown, Minus, Search, ChevronDown, ChevronUp, ArrowUpRight, CalendarDays } from 'lucide-react'
import ClientMonthSalesModal from '../components/ClientMonthSalesModal'

const SALES_REP_OPTIONS = ['박민철', '송원기', '이헌일', ''] // '' = 미배정

const MyAccounts = () => {
    const { clients, refreshData } = useData()
    const { getUserSalesRep, rawSalesData } = useDashboardData()
    const navigate = useNavigate()

    const [searchTerm, setSearchTerm] = useState('')
    const [sortField, setSortField] = useState('thisYearSales')
    const [sortDir, setSortDir] = useState('desc')
    const [editingClientId, setEditingClientId] = useState(null)
    const [savingClientId, setSavingClientId] = useState(null)
    const [kpiOverrides, setKpiOverrides] = useState(() => getKpiOverrides())

    // 모달 상태 관리
    const [isSalesModalOpen, setIsSalesModalOpen] = useState(false)
    const [selectedClientForSales, setSelectedClientForSales] = useState(null)

    // 내 담당자 이름 (fallback: 이헌일)
    const mySalesRep = getUserSalesRep || '이헌일'

    const now = new Date()
    const currentYear = now.getFullYear()
    const currentMonth = now.getMonth() + 1

    // 내 담당 거래처 목록 + 매출 데이터 계산 (회사명 기준 그룹핑)
    const myClientsData = useMemo(() => {
        const now = new Date()
        const currentYear = now.getFullYear()
        const previousYear = currentYear - 1

        // 내 담당 거래처 필터링
        const myClients = (clients || []).filter(c => c.sales_rep === mySalesRep)

        // 회사명 기준 그룹핑
        const groupedMap = new Map()
        myClients.forEach(client => {
            const companyName = (client.company || client.name || '(이름 없음)').trim()
            if (!groupedMap.has(companyName)) {
                groupedMap.set(companyName, {
                    primaryClient: client,
                    allClients: [client],
                    clientIds: [client.id],
                })
            } else {
                const group = groupedMap.get(companyName)
                group.allClients.push(client)
                group.clientIds.push(client.id)
            }
        })

        return Array.from(groupedMap.values()).map(group => {
            const { primaryClient, allClients, clientIds } = group

            // 모든 레코드의 매출 합산
            const thisYearSales = (rawSalesData || [])
                .filter(s => {
                    const d = new Date(s.sale_date || s.date)
                    return clientIds.includes(s.client_id) && d.getFullYear() === currentYear
                })
                .reduce((sum, s) => sum + (s.total_amount || s.totalAmount || 0), 0)

            const thisMonthSales = (rawSalesData || [])
                .filter(s => {
                    const d = new Date(s.sale_date || s.date)
                    return clientIds.includes(s.client_id) && d.getFullYear() === currentYear && (d.getMonth() + 1) === currentMonth
                })
                .reduce((sum, s) => sum + (s.total_amount || s.totalAmount || 0), 0)

            const lastYearTotalSales = (rawSalesData || [])
                .filter(s => {
                    const d = new Date(s.sale_date || s.date)
                    return clientIds.includes(s.client_id) && d.getFullYear() === previousYear
                })
                .reduce((sum, s) => sum + (s.total_amount || s.totalAmount || 0), 0)

            const lastYearSamePeriodEnd = new Date(previousYear, now.getMonth(), now.getDate())
            lastYearSamePeriodEnd.setHours(23, 59, 59, 999)
            const lastYearSamePeriodSales = (rawSalesData || [])
                .filter(s => {
                    const d = new Date(s.sale_date || s.date)
                    return clientIds.includes(s.client_id) &&
                        d.getFullYear() === previousYear &&
                        d <= lastYearSamePeriodEnd
                })
                .reduce((sum, s) => sum + (s.total_amount || s.totalAmount || 0), 0)

            const yoyChange = lastYearSamePeriodSales > 0
                ? ((thisYearSales - lastYearSamePeriodSales) / lastYearSamePeriodSales) * 100
                : (thisYearSales > 0 ? 100 : 0)

            // 자동 KPI 분류 판정
            let autoKpiCategory = '기존'
            if (lastYearTotalSales === 0 && thisYearSales > 0) {
                autoKpiCategory = '신규'
            } else if (lastYearTotalSales > 0 && thisYearSales > 0) {
                const thisYearStart = new Date(currentYear, 0, 1)
                const clientSalesBefore = (rawSalesData || [])
                    .filter(s => clientIds.includes(s.client_id) && new Date(s.sale_date || s.date) < thisYearStart)
                    .sort((a, b) => new Date(b.sale_date || b.date) - new Date(a.sale_date || a.date))
                if (clientSalesBefore.length > 0) {
                    const lastDate = new Date(clientSalesBefore[0].sale_date || clientSalesBefore[0].date)
                    const gapMonths = (thisYearStart - lastDate) / (30 * 24 * 60 * 60 * 1000)
                    if (gapMonths >= 6) autoKpiCategory = '단절복구'
                }
            }

            // 담당자 목록 (중복 제거)
            const contacts = allClients
                .map(c => ({ name: c.contact_person || '', phone: c.phone || '', id: c.id }))
                .filter(c => c.name)
            const uniqueContacts = contacts.filter((c, i, arr) => arr.findIndex(x => x.name === c.name) === i)

            return {
                id: primaryClient.id,
                clientIds,
                company: primaryClient.company || primaryClient.name || '(이름 없음)',
                contactPerson: uniqueContacts[0]?.name || '',
                additionalContacts: uniqueContacts.slice(1),
                phone: uniqueContacts[0]?.phone || '',
                salesRep: primaryClient.sales_rep || '',
                thisYearSales,
                thisMonthSales,
                lastYearTotalSales,
                lastYearSamePeriodSales,
                yoyChange: Math.round(yoyChange * 10) / 10,
                autoKpiCategory,
            }
        })
    }, [clients, rawSalesData, mySalesRep])

    // 필터링 & 정렬
    const filteredClients = useMemo(() => {
        let filtered = myClientsData
        if (searchTerm) {
            const term = searchTerm.toLowerCase()
            filtered = filtered.filter(c =>
                c.company.toLowerCase().includes(term) ||
                c.contactPerson.toLowerCase().includes(term)
            )
        }
        filtered.sort((a, b) => {
            const aVal = a[sortField] || 0
            const bVal = b[sortField] || 0
            return sortDir === 'desc' ? bVal - aVal : aVal - bVal
        })
        return filtered
    }, [myClientsData, searchTerm, sortField, sortDir])

    // 합계
    const totals = useMemo(() => ({
        thisYear: myClientsData.reduce((sum, c) => sum + c.thisYearSales, 0),
        thisMonth: myClientsData.reduce((sum, c) => sum + c.thisMonthSales, 0),
        lastYearTotal: myClientsData.reduce((sum, c) => sum + c.lastYearTotalSales, 0),
        lastYearSamePeriod: myClientsData.reduce((sum, c) => sum + c.lastYearSamePeriodSales, 0),
        count: myClientsData.length,
    }), [myClientsData])

    const totalYoY = totals.lastYearSamePeriod > 0
        ? Math.round(((totals.thisYear - totals.lastYearSamePeriod) / totals.lastYearSamePeriod) * 1000) / 10
        : 0

    // 담당자 변경 핸들러
    const handleSalesRepChange = useCallback(async (clientId, newSalesRep) => {
        setSavingClientId(clientId)
        try {
            const { error } = await supabase
                .from('clients')
                .update({ sales_rep: newSalesRep || null })
                .eq('id', clientId)

            if (error) throw error

            toast.success('담당자가 변경되었습니다')
            setEditingClientId(null)
            await refreshData()
        } catch (err) {
            console.error('담당자 변경 실패:', err)
            toast.error('변경 실패: ' + err.message)
        } finally {
            setSavingClientId(null)
        }
    }, [refreshData])

    // KPI 카테고리 변경 핸들러
    const handleKpiCategoryChange = useCallback((clientId, category) => {
        setKpiCategory(clientId, category)
        setKpiOverrides(getKpiOverrides()) // 상태 갱신
        const label = KPI_CATEGORIES.find(c => c.value === category)?.label || '자동'
        toast.success(`KPI 분류: ${label}`)
    }, [])

    // 정렬 토글
    const toggleSort = (field) => {
        if (sortField === field) {
            setSortDir(d => d === 'desc' ? 'asc' : 'desc')
        } else {
            setSortField(field)
            setSortDir('desc')
        }
    }

    const SortIcon = ({ field }) => {
        if (sortField !== field) return <ChevronDown className="w-3 h-3 opacity-30" />
        return sortDir === 'desc'
            ? <ChevronDown className="w-3 h-3 text-oem-blue" />
            : <ChevronUp className="w-3 h-3 text-oem-blue" />
    }

    const formatMoney = (val) => {
        if (val >= 100_000_000) return `${(val / 100_000_000).toFixed(1)}억`
        if (val >= 10_000) return `${Math.round(val / 10_000).toLocaleString()}만`
        return `${val.toLocaleString()}원`
    }

    return (
        <div className="p-3 md:p-6 space-y-4">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                    <h1 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                        <Users className="w-5 h-5 text-oem-blue" />
                        내 담당 거래처
                    </h1>
                    <p className="text-xs text-gray-500 mt-0.5">
                        담당자: <b className="text-gray-700">{mySalesRep}</b> · {totals.count}개 거래처
                    </p>
                </div>

                {/* Search */}
                <div className="relative w-full sm:w-64">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                        type="text"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="거래처 검색..."
                        className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-oem-blue"
                    />
                </div>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                <div className="bg-white border border-gray-100 rounded-lg p-3">
                    <p className="text-[10px] text-gray-500 uppercase font-bold flex items-center gap-1">
                        <CalendarDays className="w-3 h-3 text-oem-blue" />
                        금월 총매출
                    </p>
                    <p className="text-lg font-bold text-oem-blue mt-1">{formatMoney(totals.thisMonth)}</p>
                </div>
                <div className="bg-white border border-gray-100 rounded-lg p-3">
                    <p className="text-[10px] text-gray-500 uppercase font-bold">올해 총매출</p>
                    <p className="text-lg font-bold text-gray-900 mt-1">{formatMoney(totals.thisYear)}</p>
                </div>
                <div className="bg-white border border-gray-100 rounded-lg p-3">
                    <p className="text-[10px] text-gray-500 uppercase font-bold">작년 총매출</p>
                    <p className="text-lg font-bold text-gray-600 mt-1">{formatMoney(totals.lastYearTotal)}</p>
                </div>
                <div className="bg-white border border-gray-100 rounded-lg p-3">
                    <p className="text-[10px] text-gray-500 uppercase font-bold">작년 동기 매출</p>
                    <p className="text-lg font-bold text-gray-600 mt-1">{formatMoney(totals.lastYearSamePeriod)}</p>
                </div>
                <div className={`border rounded-lg p-3 ${totalYoY >= 0 ? 'bg-green-50 border-green-100' : 'bg-red-50 border-red-100'}`}>
                    <p className="text-[10px] text-gray-500 uppercase font-bold">전년 동기 대비</p>
                    <p className={`text-lg font-bold mt-1 flex items-center gap-1 ${totalYoY >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {totalYoY >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                        {totalYoY >= 0 ? '+' : ''}{totalYoY}%
                    </p>
                </div>
            </div>

            {/* Table */}
            <div className="bg-white border border-gray-100 rounded-lg overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="bg-gray-50 border-b border-gray-100">
                                <th className="text-left px-3 py-2.5 text-[11px] font-bold text-gray-500 uppercase w-8">#</th>
                                <th className="text-left px-3 py-2.5 text-[11px] font-bold text-gray-500 uppercase min-w-[140px]">거래처</th>
                                <th
                                    className="text-right px-3 py-2.5 text-[11px] font-bold text-oem-blue uppercase cursor-pointer hover:text-blue-700 select-none"
                                    onClick={() => toggleSort('thisMonthSales')}
                                >
                                    <span className="inline-flex items-center gap-1">금월 매출 <SortIcon field="thisMonthSales" /></span>
                                </th>
                                <th
                                    className="text-right px-3 py-2.5 text-[11px] font-bold text-gray-500 uppercase cursor-pointer hover:text-oem-blue select-none"
                                    onClick={() => toggleSort('thisYearSales')}
                                >
                                    <span className="inline-flex items-center gap-1">올해 매출 <SortIcon field="thisYearSales" /></span>
                                </th>
                                <th
                                    className="text-right px-3 py-2.5 text-[11px] font-bold text-gray-500 uppercase cursor-pointer hover:text-oem-blue select-none"
                                    onClick={() => toggleSort('lastYearTotalSales')}
                                >
                                    <span className="inline-flex items-center gap-1">작년 매출 <SortIcon field="lastYearTotalSales" /></span>
                                </th>
                                <th
                                    className="text-right px-3 py-2.5 text-[11px] font-bold text-gray-500 uppercase cursor-pointer hover:text-oem-blue select-none"
                                    onClick={() => toggleSort('lastYearSamePeriodSales')}
                                >
                                    <span className="inline-flex items-center gap-1">작년 동기 <SortIcon field="lastYearSamePeriodSales" /></span>
                                </th>
                                <th
                                    className="text-right px-3 py-2.5 text-[11px] font-bold text-gray-500 uppercase cursor-pointer hover:text-oem-blue select-none"
                                    onClick={() => toggleSort('yoyChange')}
                                >
                                    <span className="inline-flex items-center gap-1">전년비 <SortIcon field="yoyChange" /></span>
                                </th>
                                <th className="text-center px-3 py-2.5 text-[11px] font-bold text-gray-500 uppercase min-w-[80px]">KPI 분류</th>
                                <th className="text-center px-3 py-2.5 text-[11px] font-bold text-gray-500 uppercase min-w-[100px]">담당자</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredClients.length === 0 ? (
                                <tr>
                                    <td colSpan={7} className="text-center py-8 text-gray-400 text-sm">
                                        {searchTerm ? '검색 결과가 없습니다' : '담당 거래처가 없습니다'}
                                    </td>
                                </tr>
                            ) : (
                                filteredClients.map((client, idx) => (
                                    <tr
                                        key={client.id}
                                        className="border-b border-gray-50 hover:bg-blue-50/30 transition-colors group"
                                    >
                                        <td className="px-3 py-2 text-[11px] text-gray-400">{idx + 1}</td>
                                        <td className="px-3 py-2">
                                            <button
                                                onClick={() => navigate(`/clients/${client.id}`)}
                                                className="text-left group/link"
                                            >
                                                <p className="text-sm font-semibold text-gray-900 group-hover/link:text-oem-blue flex items-center gap-1">
                                                    {client.company}
                                                    <ArrowUpRight className="w-3 h-3 opacity-0 group-hover/link:opacity-100 transition-opacity" />
                                                </p>
                                                {client.contactPerson && (
                                                    <p className="text-[10px] text-gray-400">{client.contactPerson}</p>
                                                )}
                                            </button>
                                        </td>
                                        <td className="px-3 py-2 text-right">
                                            <button
                                                onClick={() => {
                                                    setSelectedClientForSales(client)
                                                    setIsSalesModalOpen(true)
                                                }}
                                                className={`font-bold hover:underline transition-colors ${client.thisMonthSales > 0 ? 'text-oem-blue' : 'text-gray-400 font-normal hover:text-oem-blue'}`}
                                                title="당월 매출 상세 보기"
                                            >
                                                {formatMoney(client.thisMonthSales)}
                                            </button>
                                        </td>
                                        <td className="px-3 py-2 text-right">
                                            <span className="font-bold text-gray-900">{formatMoney(client.thisYearSales)}</span>
                                        </td>
                                        <td className="px-3 py-2 text-right text-gray-500">
                                            {formatMoney(client.lastYearTotalSales)}
                                        </td>
                                        <td className="px-3 py-2 text-right text-gray-500">
                                            {formatMoney(client.lastYearSamePeriodSales)}
                                        </td>
                                        <td className="px-3 py-2 text-right">
                                            {client.lastYearSamePeriodSales > 0 || client.thisYearSales > 0 ? (
                                                <span className={`inline-flex items-center gap-0.5 text-xs font-bold ${client.yoyChange > 0 ? 'text-green-600' :
                                                    client.yoyChange < 0 ? 'text-red-500' : 'text-gray-400'
                                                    }`}>
                                                    {client.yoyChange > 0 ? <TrendingUp className="w-3 h-3" /> :
                                                        client.yoyChange < 0 ? <TrendingDown className="w-3 h-3" /> :
                                                            <Minus className="w-3 h-3" />}
                                                    {client.yoyChange > 0 ? '+' : ''}{client.yoyChange}%
                                                </span>
                                            ) : (
                                                <span className="text-[10px] text-gray-300">—</span>
                                            )}
                                        </td>
                                        {/* KPI 분류 */}
                                        <td className="px-3 py-2 text-center">
                                            {(() => {
                                                const override = kpiOverrides[client.id]
                                                const current = override || 'auto'
                                                const catInfo = KPI_CATEGORIES.find(c => c.value === current) || KPI_CATEGORIES[0]
                                                const autoLabel = client.autoKpiCategory || '기존'
                                                return (
                                                    <select
                                                        value={current}
                                                        onChange={(e) => handleKpiCategoryChange(client.id, e.target.value)}
                                                        className={`text-[11px] font-medium border rounded px-1.5 py-0.5 cursor-pointer focus:outline-none focus:ring-1 focus:ring-oem-blue ${catInfo.bg} ${catInfo.color} border-transparent hover:border-gray-300`}
                                                        title={`자동판정: ${autoLabel}`}
                                                    >
                                                        <option value="auto">자동 ({autoLabel})</option>
                                                        <option value="신규">🆕 신규</option>
                                                        <option value="단절복구">🔄 단절복구</option>
                                                        <option value="미산정">❌ 미산정</option>
                                                    </select>
                                                )
                                            })()}
                                        </td>
                                        <td className="px-3 py-2 text-center">
                                            {editingClientId === client.id ? (
                                                <select
                                                    defaultValue={client.salesRep}
                                                    onChange={(e) => handleSalesRepChange(client.id, e.target.value)}
                                                    disabled={savingClientId === client.id}
                                                    className="text-xs border border-oem-blue rounded px-1.5 py-1 focus:outline-none bg-white"
                                                    autoFocus
                                                    onBlur={() => !savingClientId && setEditingClientId(null)}
                                                >
                                                    {SALES_REP_OPTIONS.map(rep => (
                                                        <option key={rep} value={rep}>
                                                            {rep || '미배정'}
                                                        </option>
                                                    ))}
                                                </select>
                                            ) : (
                                                <button
                                                    onClick={() => setEditingClientId(client.id)}
                                                    className="text-xs text-gray-600 hover:text-oem-blue hover:underline transition-colors"
                                                    title="클릭하여 담당자 변경"
                                                >
                                                    {client.salesRep || '미배정'}
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                        {/* Footer Totals */}
                        {filteredClients.length > 0 && (
                            <tfoot>
                                <tr className="bg-gray-50 border-t-2 border-gray-200 font-bold">
                                    <td className="px-3 py-2.5" colSpan={2}>
                                        <span className="text-[11px] text-gray-500 uppercase">합계 ({filteredClients.length}건)</span>
                                    </td>
                                    <td className="px-3 py-2.5 text-right text-sm text-oem-blue">
                                        {formatMoney(filteredClients.reduce((s, c) => s + c.thisMonthSales, 0))}
                                    </td>
                                    <td className="px-3 py-2.5 text-right text-sm text-gray-900">
                                        {formatMoney(filteredClients.reduce((s, c) => s + c.thisYearSales, 0))}
                                    </td>
                                    <td className="px-3 py-2.5 text-right text-sm text-gray-600">
                                        {formatMoney(filteredClients.reduce((s, c) => s + c.lastYearTotalSales, 0))}
                                    </td>
                                    <td className="px-3 py-2.5 text-right text-sm text-gray-600">
                                        {formatMoney(filteredClients.reduce((s, c) => s + c.lastYearSamePeriodSales, 0))}
                                    </td>
                                    <td className="px-3 py-2.5 text-right">
                                        <span className={`text-xs font-bold ${totalYoY >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                            {totalYoY >= 0 ? '+' : ''}{totalYoY}%
                                        </span>
                                    </td>
                                    <td className="px-3 py-2.5"></td>
                                    <td className="px-3 py-2.5"></td>
                                </tr>
                            </tfoot>
                        )}
                    </table>
                </div>
            </div>

            {/* 금월 매출 상세 모달 */}
            <ClientMonthSalesModal
                isOpen={isSalesModalOpen}
                onClose={() => {
                    setIsSalesModalOpen(false)
                    setSelectedClientForSales(null)
                }}
                client={selectedClientForSales}
                salesData={rawSalesData}
                currentMonth={currentMonth}
                currentYear={currentYear}
            />
        </div>
    )
}

export default MyAccounts
