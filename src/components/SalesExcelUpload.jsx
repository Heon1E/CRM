import React, { useState, useRef } from 'react'
import { Upload, Download, Loader2, Trash2 } from 'lucide-react'
import { downloadSaleTemplate, parseSaleExcel } from '../utils/excelExport'
import { supabase } from '../lib/supabase'
import { showSuccess, showError, showWarning } from '../utils/alert'
import { useSalesImport } from '../hooks/useSalesImport'

/**
 * 매출 엑셀 일괄 업로드.
 *
 * 파싱만 여기서 하고, 거래처 매칭 / 대사 / 반영은 useSalesImport가 전담한다.
 * ERP 스크린샷 입력도 같은 훅을 쓴다 — 매출 저장 경로는 하나여야 한다.
 */
const SalesExcelUpload = ({ onRefresh }) => {
  const { importSalesRows, isImporting, progress } = useSalesImport()
  const [isParsing, setIsParsing] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const fileInputRef = useRef(null)

  const busy = isParsing || isImporting

  const handleDownloadTemplate = () => {
    downloadSaleTemplate()
  }

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
      await showWarning('엑셀 파일(.xlsx, .xls)만 업로드 가능합니다.')
      return
    }

    setIsParsing(true)
    try {
      const salesData = await parseSaleExcel(file)
      setIsParsing(false)

      if (!salesData || salesData.length === 0) {
        await showWarning('엑셀 파일에 유효한 데이터가 없습니다.')
        return
      }

      const result = await importSalesRows(salesData, { sourceLabel: '엑셀 업로드' })

      if (result.message) {
        if (result.applyResult?.inserted > 0) await showSuccess(result.message)
        else await showWarning(result.message)
      }
      if (result.applyResult?.errors?.length > 0) {
        await showError(`일부 처리에 문제가 있었습니다:\n${result.applyResult.errors.join('\n')}`)
      }
      if (result.ok && onRefresh) await onRefresh()
    } catch (error) {
      console.error('엑셀 업로드 오류:', error)
      await showError(`엑셀 업로드 중 오류가 발생했습니다: ${error.message || '알 수 없는 오류'}`)
    } finally {
      setIsParsing(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleDeleteAll = async () => {
    const confirmed = window.confirm('Are you sure you want to delete ALL sales data? This cannot be undone.')
    if (!confirmed) return

    try {
      setIsDeleting(true)
      const { error } = await supabase.from('sales').delete().gte('created_at', '1970-01-01')
      if (error) throw error
      await showSuccess('모든 매출 데이터가 삭제되었습니다.')
      if (onRefresh) await onRefresh()
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
        className="btn-secondary px-4 py-2.5 flex items-center justify-center space-x-2 font-medium"
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
          disabled={busy}
        />
        <label
          htmlFor="sales-excel-upload"
          className={`px-4 py-2.5 bg-white text-black rounded-xl hover:bg-zinc-100 transition-all duration-200 flex items-center justify-center space-x-2 font-semibold cursor-pointer ${busy ? 'opacity-50 cursor-not-allowed' : ''
            }`}
        >
          {busy ? (
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
      {busy && (isParsing || progress.stage) && (
        <div className="flex items-center space-x-3 min-w-[220px]">
          <div className="flex-1">
            <p className="text-xs text-[color:var(--text-secondary)] mb-1">
              {isParsing ? '파일 파싱 중' : progress.stage}
            </p>
            <div className="w-full h-2 bg-gray-800 rounded-full overflow-hidden border border-[color:var(--border)]">
              <div
                className="h-2 bg-white/70 transition-all"
                style={{
                  width: `${progress.total > 0 ? Math.min(100, Math.round((progress.current / progress.total) * 100)) : 0}%`,
                }}
              />
            </div>
          </div>
          <span className="text-xs text-[color:var(--text-secondary)] whitespace-nowrap">
            {progress.total > 0 ? `${progress.current}/${progress.total}` : ''}
          </span>
        </div>
      )}
      {/* Delete All 버튼 (위험 구역) */}
      <button
        onClick={handleDeleteAll}
        disabled={isDeleting || busy}
        className={`flex-1 sm:flex-none flex items-center justify-center space-x-2 touch-manipulation min-h-[44px] px-4 py-2.5 rounded-xl font-semibold transition-all duration-200 ${isDeleting || busy
          ? 'opacity-50 cursor-not-allowed bg-[color:var(--bg-card)] text-[color:var(--text-secondary)] border border-[color:var(--border)]'
          : 'bg-red-50 hover:bg-red-100 text-red-700 border border-red-200'
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
