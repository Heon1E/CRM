import React, { useState, useRef } from 'react'
import { Upload, Download, Loader2 } from 'lucide-react'
import { downloadClientTemplate, parseClientExcel } from '../utils/excelExport'
import { useData } from '../contexts/DataContext'
import { showSuccess, showError, showWarning } from '../utils/alert'

const ClientExcelUpload = () => {
  const { addClientsBulk } = useData()
  const [isUploading, setIsUploading] = useState(false)
  const fileInputRef = useRef(null)

  // 양식 다운로드
  const handleDownloadTemplate = () => {
    downloadClientTemplate()
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
      const clients = await parseClientExcel(file)

      // 회사명이 있는 데이터만 등록 (회사명이 없으면 이미 필터링됨)
      // clients.length === 0 체크는 제거 (회사명이 없으면 null 반환되어 필터링되므로)

      // 일괄 등록
      await addClientsBulk(clients)
      await showSuccess(`${clients.length}개의 거래처가 일괄 등록되었습니다.\n담당자가 자동으로 키맨으로 지정되었습니다.`)

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
          id="client-excel-upload"
          disabled={isUploading}
        />
        <label
          htmlFor="client-excel-upload"
          className={`px-4 py-2.5 bg-white text-black rounded-xl hover:bg-zinc-100 transition-all duration-200 flex items-center justify-center space-x-2 font-semibold cursor-pointer ${
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

export default ClientExcelUpload



