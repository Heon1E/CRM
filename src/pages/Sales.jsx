import React, { useState } from 'react'
import { Edit, Download, Plus } from 'lucide-react'
import { useData } from '../contexts/DataContext'
import AddSaleModal from '../components/AddSaleModal'
import EditSaleModal from '../components/EditSaleModal'
import { exportSalesToExcel } from '../utils/excelExport'

const Sales = () => {
  const { sales, clients, products, loading } = useData()
  const [editingSaleGroup, setEditingSaleGroup] = useState(null) // 그룹 전체 데이터 저장
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-gray-500">데이터를 불러오는 중...</div>
      </div>
    )
  }

  // 날짜 내림차순 정렬
  const sortedSales = [...(sales || [])].sort((a, b) => {
    return new Date(b.date || b.sale_date) - new Date(a.date || a.sale_date)
  })

  const handleExport = () => {
    exportSalesToExcel(sales)
  }

  return (
    <div className="space-y-5 md:space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900">매출 관리</h1>
          <p className="text-text-secondary mt-1.5 text-sm md:text-base">총 {sales.length}건의 매출 기록</p>
        </div>
        <div className="flex items-center space-x-3 w-full sm:w-auto">
          <button
            onClick={handleExport}
            className="btn-secondary flex-1 sm:flex-none flex items-center justify-center space-x-2"
          >
            <Download className="w-4 h-4" />
            <span>엑셀 다운로드</span>
          </button>
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="btn-success flex-1 sm:flex-none flex items-center justify-center space-x-2"
          >
            <Plus className="w-4 h-4" />
            <span>매출 추가</span>
          </button>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-border-light">
            <thead className="bg-transparent">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-semibold text-text-secondary uppercase tracking-wider">
                  날짜
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  거래처
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  대표 품목
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  품목 수
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  총 매출액
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  비고
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  작업
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {sortedSales.length > 0 ? (
                sortedSales.map((sale) => (
                  <tr key={sale.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-5 whitespace-nowrap text-sm font-semibold text-gray-900">
                      {sale.date || sale.sale_date || '-'}
                    </td>
                    <td className="px-6 py-5 whitespace-nowrap">
                      <div className="text-sm font-semibold text-gray-900">
                        {(() => {
                          // clientName이 있으면 사용, 없으면 clients 배열에서 찾기
                          if (sale.clientName && sale.clientName !== '알 수 없음') {
                            return sale.clientName
                          }
                          if (sale.clientId && clients && Array.isArray(clients)) {
                            const client = clients.find((c) => c.id === sale.clientId)
                            return client?.company || '-'
                          }
                          return '-'
                        })()}
                      </div>
                    </td>
                    <td className="px-6 py-5 whitespace-nowrap">
                      <div className="text-sm text-gray-600">
                        {sale.displayItemName || sale.items?.[0]?.item_name || sale.items?.[0]?.productName || '-'}
                      </div>
                    </td>
                    <td className="px-6 py-5 whitespace-nowrap text-sm text-gray-500">
                      {sale.itemCount || sale.items?.length || 1}건
                    </td>
                    <td className="px-6 py-5 whitespace-nowrap text-sm font-bold text-gray-900">
                      {(sale.totalAmount / 10000).toLocaleString()}만원
                    </td>
                    <td className="px-6 py-5 text-sm text-gray-500">
                      <div className="max-w-xs truncate">{sale.notes || '-'}</div>
                    </td>
                    <td className="px-6 py-5 whitespace-nowrap text-sm">
                      <button
                        onClick={() => {
                          // 그룹 내 모든 원본 데이터를 모달에 전달
                          setEditingSaleGroup(sale)
                        }}
                        className="text-brand-blue hover:text-brand-blue-hover font-medium flex items-center space-x-1 transition-colors"
                      >
                        <Edit className="w-4 h-4" />
                        <span>수정</span>
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="7" className="px-6 py-8 text-center text-gray-500">
                    매출 기록이 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modals */}
      <AddSaleModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
      />
      <EditSaleModal
        isOpen={editingSaleGroup !== null}
        onClose={() => setEditingSaleGroup(null)}
        saleGroup={editingSaleGroup}
      />
    </div>
  )
}

export default Sales
