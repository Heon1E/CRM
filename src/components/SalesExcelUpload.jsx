import React, { useState, useRef } from 'react'
import { Upload, Download, Loader2 } from 'lucide-react'
import { downloadSaleTemplate, parseSaleExcel } from '../utils/excelExport'
import { useData } from '../contexts/DataContext'
import { showSuccess, showError, showWarning } from '../utils/alert'

const SalesExcelUpload = () => {
  const { clients, addSale } = useData()
  const [isUploading, setIsUploading] = useState(false)
  const fileInputRef = useRef(null)

  // 양식 다운로드
  const handleDownloadTemplate = () => {
    downloadSaleTemplate()
  }

  // 엑셀 업로드 처리
  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    // 파일 확장자 검증
    if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
      await showWarning('엑셀 파일(.xlsx, .xls)만 업로드 가능합니다.')
      return
    }

    setIsUploading(true)

    try {
      // 엑셀 파일 파싱
      const salesData = await parseSaleExcel(file)

      // 거래처명과 판매일이 있는 데이터만 등록 (없으면 이미 필터링됨)
      // salesData.length === 0 체크는 제거 (데이터가 없어도 빈 배열 반환)

      // 거래처명으로 clientId 찾기 및 중복 체크
      const salesToInsert = []
      const errors = []
      const skipped = []

      for (const sale of salesData) {
        // 거래처명이 없으면 건너뛰기 (에러 대신 무시)
        if (!sale.clientName || sale.clientName.trim() === '') {
          continue
        }
        
        const client = clients.find((c) => c.company === sale.clientName)
        if (!client) {
          errors.push(`${sale.rowIndex || '알 수 없음'}번째 행: 거래처 "${sale.clientName}"를 찾을 수 없습니다.`)
          continue
        }

        // 중복 체크: 거래처명과 판매날짜가 모두 일치하는 데이터가 이미 있는지 확인
        // 이 체크는 addSale 함수 내부에서도 수행되지만, 사용자에게 미리 알려주기 위해 여기서도 수행
        salesToInsert.push({
          clientId: client.id,
          sale_date: sale.sale_date,
          item_name: sale.item_name,
          quantity: sale.quantity,
          unitPrice: sale.unitPrice,
          notes: sale.notes,
        })
      }

      if (errors.length > 0) {
        await showWarning(`일부 데이터를 등록하지 못했습니다:\n${errors.join('\n')}`)
      }

      if (salesToInsert.length === 0) {
        setIsUploading(false)
        return
      }

      // 날짜별로 그룹화하여 addSale 함수 형식에 맞게 변환
      const groupedByDate = {}
      salesToInsert.forEach((sale) => {
        const dateKey = sale.sale_date
        if (!groupedByDate[dateKey]) {
          groupedByDate[dateKey] = []
        }
        groupedByDate[dateKey].push({
          clientId: sale.clientId,
          sale_date: sale.sale_date,
          item_name: sale.item_name,
          quantity: sale.quantity,
          unitPrice: sale.unitPrice,
          totalAmount: sale.quantity * sale.unitPrice,
          notes: sale.notes,
        })
      })

      // 각 날짜별로 addSale 호출
      let successCount = 0
      for (const dateKey of Object.keys(groupedByDate)) {
        try {
          await addSale({
            rows: groupedByDate[dateKey],
          })
          successCount += groupedByDate[dateKey].length
        } catch (error) {
          console.error(`매출 등록 오류 (${dateKey}):`, error)
          errors.push(`${dateKey} 날짜의 매출 등록 중 오류: ${error.message || '알 수 없는 오류'}`)
        }
      }

      if (successCount > 0) {
        await showSuccess(`${successCount}개의 매출이 일괄 등록되었습니다.`)
      }

      if (errors.length > 0) {
        await showError(`일부 매출 등록에 실패했습니다:\n${errors.join('\n')}`)
      }

      // 파일 입력 초기화
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    } catch (error) {
      console.error('엑셀 업로드 오류:', error)
      await showError(`엑셀 업로드 중 오류가 발생했습니다: ${error.message || '알 수 없는 오류'}`)
    } finally {
      setIsUploading(false)
    }
  }

  return (
    <div className="flex items-center space-x-3">
      <button
        onClick={handleDownloadTemplate}
        className="px-4 py-2.5 bg-white text-gray-700 border border-gray-200 rounded-xl hover:bg-gray-50 hover:border-gray-300 transition-all duration-200 flex items-center justify-center space-x-2 font-medium shadow-sm"
      >
        <Download className="w-4 h-4" />
        <span>양식 다운로드</span>
      </button>
      <div className="relative">
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls"
          onChange={handleFileUpload}
          className="hidden"
          id="sales-excel-upload"
          disabled={isUploading}
        />
        <label
          htmlFor="sales-excel-upload"
          className={`px-4 py-2.5 bg-purple-600 text-white rounded-xl hover:bg-purple-700 transition-all duration-200 flex items-center justify-center space-x-2 font-semibold shadow-sm cursor-pointer ${
            isUploading ? 'opacity-50 cursor-not-allowed' : ''
          }`}
        >
          {isUploading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>업로드 중...</span>
            </>
          ) : (
            <>
              <Upload className="w-4 h-4" />
              <span>엑셀 업로드</span>
            </>
          )}
        </label>
      </div>
    </div>
  )
}

export default SalesExcelUpload
