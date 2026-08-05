import React, { useMemo } from 'react'
import { X, Package, TrendingUp } from 'lucide-react'
import { formatKoreanCurrency, formatCurrency, formatNumber } from '../utils/formatters'

const ClientMonthSalesModal = ({ isOpen, onClose, client, salesData, currentMonth, currentYear }) => {
    if (!isOpen || !client) return null

    // 해당 거래처의 이번 달 매출 데이터 필터링 (품목 단위 전개)
    const thisMonthItems = useMemo(() => {
        if (!salesData) return []

        const items = []
        salesData.forEach(sale => {
            const sClientId = sale.client_id || sale.clientId
            if (client.clientIds && client.clientIds.length > 0) {
                if (!client.clientIds.includes(sClientId)) return
            } else {
                if (sClientId !== client.id) return
            }

            const saleDate = new Date(sale.sale_date || sale.date)
            if (saleDate.getMonth() + 1 === currentMonth && saleDate.getFullYear() === currentYear) {
                // items 배열이 있으면(그룹화된 데이터) 전개, 없으면 단일 항목으로 취급
                if (sale.items && sale.items.length > 0) {
                    items.push(...sale.items.map(item => ({
                        id: item.id || `item-${Math.random()}`,
                        itemName: item.item_name || item.itemName || item.product_name || '품목명 없음',
                        unitPrice: Number(item.unit_price || item.unitPrice || item.price || 0),
                        quantity: Number(item.quantity || 0),
                        totalAmount: Number(item.total_amount || item.totalAmount || 0)
                    })))
                } else {
                    items.push({
                        id: sale.id,
                        itemName: sale.item_name || sale.itemName || sale.displayItemName || '품목명 없음',
                        unitPrice: Number(sale.unit_price || sale.unitPrice || sale.total_amount || 0),
                        quantity: Number(sale.quantity || 1),
                        totalAmount: Number(sale.total_amount || sale.totalAmount || 0)
                    })
                }
            }
        })

        // 품목명 기준으로 병합 (동일 품목 합산)
        const aggregatedItems = items.reduce((acc, item) => {
            const key = item.itemName
            if (!acc[key]) {
                acc[key] = { ...item }
            } else {
                acc[key].quantity += item.quantity
                acc[key].totalAmount += item.totalAmount
                // 단가가 다를 경우 평균 단가 계산 (또는 최신 단가 유지. 여기서는 편의상 최신 단가로 덮어쓰거나 무시)
                if (acc[key].unitPrice !== item.unitPrice && item.unitPrice > 0) {
                    acc[key].unitPrice = item.unitPrice
                }
            }
            return acc
        }, {})

        return Object.values(aggregatedItems).sort((a, b) => b.totalAmount - a.totalAmount)
    }, [salesData, client, currentMonth, currentYear])

    const totalSalesAmount = thisMonthItems.reduce((sum, item) => sum + item.totalAmount, 0)
    const totalQuantity = thisMonthItems.reduce((sum, item) => sum + item.quantity, 0)

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden oem-panel border-t-4 border-t-oem-blue flex flex-col max-h-[90vh]">
                {/* Header */}
                <div className="flex justify-between items-center p-5 border-b border-oem-border bg-gray-50/50">
                    <div>
                        <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                            <TrendingUp className="w-5 h-5 text-oem-blue" />
                            {client.company} 당월 매출 상세
                        </h2>
                        <p className="text-xs text-gray-500 mt-1">
                            {currentYear}년 {currentMonth}월 품목별 집계 내역
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-gray-600 transition-colors bg-white hover:bg-gray-100 p-1.5 rounded-lg border border-transparent hover:border-gray-200"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Content */}
                <div className="p-6 flex-1 overflow-y-auto bg-gray-50/30">
                    {/* Summary Cards */}
                    <div className="grid grid-cols-2 gap-4 mb-6">
                        <div className="bg-white border border-oem-border rounded-lg p-4 shadow-sm">
                            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">총 매출액</p>
                            <p className="text-2xl font-bold text-oem-blue">{formatKoreanCurrency(totalSalesAmount)}</p>
                        </div>
                        <div className="bg-white border border-oem-border rounded-lg p-4 shadow-sm">
                            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">총 판매 수량</p>
                            <p className="text-2xl font-bold text-gray-800">{formatNumber(totalQuantity)} 개</p>
                        </div>
                    </div>

                    {/* Table */}
                    <div className="bg-white border border-oem-border rounded-lg overflow-hidden shadow-sm">
                        <table className="w-full text-sm">
                            <thead className="bg-gray-50/80 border-b border-oem-border">
                                <tr>
                                    <th className="text-left px-4 py-3 text-xs font-bold text-gray-600">품목명</th>
                                    <th className="text-right px-4 py-3 text-xs font-bold text-gray-600 w-28">단가</th>
                                    <th className="text-right px-4 py-3 text-xs font-bold text-gray-600 w-24">수량</th>
                                    <th className="text-right px-4 py-3 text-xs font-bold text-gray-600 w-32">총액</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {thisMonthItems.length === 0 ? (
                                    <tr>
                                        <td colSpan={4} className="px-4 py-12 text-center text-gray-400">
                                            <Package className="w-8 h-8 mx-auto text-gray-300 mb-3" />
                                            <p className="text-sm">이번 달 매출 내역이 없습니다.</p>
                                        </td>
                                    </tr>
                                ) : (
                                    thisMonthItems.map((item, idx) => (
                                        <tr key={item.id || idx} className="hover:bg-blue-50/30 transition-colors">
                                            <td className="px-4 py-3 font-medium text-gray-900">{item.itemName}</td>
                                            <td className="px-4 py-3 text-right text-gray-600">{formatCurrency(item.unitPrice)}</td>
                                            <td className="px-4 py-3 text-right font-medium text-gray-800">{formatNumber(item.quantity)}</td>
                                            <td className="px-4 py-3 text-right font-bold text-gray-900 bg-gray-50/50">{formatCurrency(item.totalAmount)}</td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                            {thisMonthItems.length > 0 && (
                                <tfoot className="bg-gray-50 border-t-2 border-gray-200">
                                    <tr>
                                        <td colSpan={2} className="px-4 py-3 text-right text-xs font-bold text-gray-500 uppercase">합계</td>
                                        <td className="px-4 py-3 text-right font-bold text-gray-900">{formatNumber(totalQuantity)}</td>
                                        <td className="px-4 py-3 text-right font-bold tracking-tight text-oem-blue text-base">
                                            {formatKoreanCurrency(totalSalesAmount)}
                                        </td>
                                    </tr>
                                </tfoot>
                            )}
                        </table>
                    </div>
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-oem-border bg-gray-50 flex justify-end">
                    <button
                        onClick={onClose}
                        className="px-6 py-2 bg-white border border-gray-300 text-gray-700 font-bold rounded shadow-sm hover:bg-gray-50 transition-colors"
                    >
                        닫기
                    </button>
                </div>
            </div>
        </div>
    )
}

export default ClientMonthSalesModal
