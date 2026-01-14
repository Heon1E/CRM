import React, { useState, useRef } from 'react'
import { Upload, Download, Loader2, Trash2 } from 'lucide-react'
import { downloadSaleTemplate, parseSaleExcel } from '../utils/excelExport'
import { useData } from '../contexts/DataContext'
import { supabase } from '../lib/supabase'
import { showSuccess, showError, showWarning } from '../utils/alert'

const SalesExcelUpload = ({ onRefresh }) => {
  const { clients, addSale } = useData()
  const [isUploading, setIsUploading] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const fileInputRef = useRef(null)

  // 양식 다운로드
  const handleDownloadTemplate = () => {
    downloadSaleTemplate()
  }

  // 엑셀 업로드 처리 (Smart Bulk Upload with Consumption Logic)
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
      // Step 1: 엑셀 파일 파싱
      const salesData = await parseSaleExcel(file)

      if (!salesData || salesData.length === 0) {
        await showWarning('엑셀 파일에 유효한 데이터가 없습니다.')
        setIsUploading(false)
        return
      }

      // 거래처명으로 clientId 찾기 및 유효성 검사
      const validatedSales = []
      const errors = []

      for (const sale of salesData) {
        // 거래처명이 없으면 건너뛰기
        if (!sale.clientName || sale.clientName.trim() === '') {
          continue
        }
        
        const client = clients.find((c) => c.company === sale.clientName)
        if (!client) {
          errors.push(`${sale.rowIndex || '알 수 없음'}번째 행: 거래처 "${sale.clientName}"를 찾을 수 없습니다.`)
          continue
        }

        // 총액 계산
        const totalAmount = (sale.quantity || 0) * (sale.unitPrice || 0)

        validatedSales.push({
          clientId: client.id,
          clientName: sale.clientName,
          sale_date: sale.sale_date,
          item_name: sale.item_name,
          quantity: sale.quantity,
          unitPrice: sale.unitPrice,
          totalAmount: totalAmount,
          notes: sale.notes,
        })
      }

      if (errors.length > 0) {
        await showWarning(`일부 데이터를 등록하지 못했습니다:\n${errors.join('\n')}`)
      }

      if (validatedSales.length === 0) {
        setIsUploading(false)
        return
      }

      // Step 2: 엑셀 파일에 있는 날짜들 추출
      const excelDates = [...new Set(validatedSales.map(s => s.sale_date).filter(Boolean))]
      
      if (excelDates.length === 0) {
        await showWarning('유효한 날짜가 없습니다.')
        setIsUploading(false)
        return
      }

      // Step 2: Supabase에서 해당 날짜들의 모든 기존 sales 데이터 조회 (No JOIN)
      const { data: existingSales, error: fetchError } = await supabase
        .from('sales')
        .select('*')
        .in('sale_date', excelDates)

      if (fetchError) {
        console.error('기존 매출 데이터 조회 오류:', fetchError)
        await showError('기존 매출 데이터를 불러오는 중 오류가 발생했습니다.')
        setIsUploading(false)
        return
      }

      // Step 3: Matching & Consuming Logic
      // 기존 DB 레코드 풀 생성 (사용 여부 추적)
      const dbRecordsPool = (existingSales || []).map(record => ({
        ...record,
        used: false, // 매칭 여부 플래그
        matchKey: `${record.sale_date}|${record.client_id}|${record.total_amount || 0}` // 매칭 키
      }))

      const salesToInsert = []
      let duplicateCount = 0

      // 각 Excel 행에 대해 매칭 시도
      for (const excelSale of validatedSales) {
        const matchKey = `${excelSale.sale_date}|${excelSale.clientId}|${excelSale.totalAmount || 0}`
        
        // 사용되지 않은 정확한 매칭 찾기
        const matchedRecord = dbRecordsPool.find(
          record => !record.used && record.matchKey === matchKey
        )

        if (matchedRecord) {
          // 매칭 발견: DB 레코드를 "사용됨"으로 표시하고 Excel 행은 스킵
          matchedRecord.used = true
          duplicateCount++
        } else {
          // 매칭 없음: 새로운 레코드로 추가
          salesToInsert.push(excelSale)
        }
      }

      // Step 4: 새로운 레코드만 삽입
      let insertedCount = 0
      const insertErrors = []

      if (salesToInsert.length > 0) {
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
            totalAmount: sale.totalAmount,
            notes: sale.notes,
          })
        })

        // 각 날짜별로 addSale 호출
        for (const dateKey of Object.keys(groupedByDate)) {
          try {
            await addSale({
              rows: groupedByDate[dateKey],
            })
            insertedCount += groupedByDate[dateKey].length
          } catch (error) {
            console.error(`매출 등록 오류 (${dateKey}):`, error)
            insertErrors.push(`${dateKey} 날짜의 매출 등록 중 오류: ${error.message || '알 수 없는 오류'}`)
          }
        }
      }

      // Step 5: 결과 알림
      const totalRows = validatedSales.length
      const resultMessage = `Total ${totalRows} rows: ${insertedCount} inserted, ${duplicateCount} duplicates skipped.`
      
      if (insertedCount > 0) {
        await showSuccess(resultMessage)
      } else if (duplicateCount > 0) {
        await showWarning(resultMessage)
      }

      if (insertErrors.length > 0) {
        await showError(`일부 매출 등록에 실패했습니다:\n${insertErrors.join('\n')}`)
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

  // Delete All 핸들러
  const handleDeleteAll = async () => {
    const confirmed = window.confirm('Are you sure you want to delete ALL sales data? This cannot be undone.')
    
    if (!confirmed) return

    try {
      setIsDeleting(true)
      
      // 모든 sales 레코드 삭제
      const { error } = await supabase
        .from('sales')
        .delete()
        .gte('created_at', '1970-01-01') // 모든 레코드 삭제

      if (error) throw error

      await showSuccess('모든 매출 데이터가 삭제되었습니다.')
      
      // 리스트 즉시 새로고침 (부모 컴포넌트의 fetchData 호출)
      if (onRefresh) {
        await onRefresh()
      }
    } catch (error) {
      console.error('전체 삭제 오류:', error)
      await showError('전체 삭제 중 오류가 발생했습니다.')
    } finally {
      setIsDeleting(false)
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
      {/* Delete All 버튼 (위험 구역) */}
      <button
        onClick={handleDeleteAll}
        disabled={isDeleting || isUploading}
        className={`flex-1 sm:flex-none flex items-center justify-center space-x-2 touch-manipulation min-h-[44px] px-4 py-2.5 rounded-xl font-semibold shadow-sm transition-all duration-200 ${
          isDeleting || isUploading
            ? 'opacity-50 cursor-not-allowed bg-gray-400 text-white'
            : 'bg-red-600 hover:bg-red-700 text-white'
        }`}
        style={{ WebkitTapHighlightColor: 'transparent' }}
      >
        {isDeleting ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>삭제 중...</span>
          </>
        ) : (
          <>
            <Trash2 className="w-4 h-4" />
            <span>Delete All</span>
          </>
        )}
      </button>
    </div>
  )
}

export default SalesExcelUpload
