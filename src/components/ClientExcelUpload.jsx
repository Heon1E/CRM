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

      if (clients.length === 0) {
        await showWarning('등록할 거래처 데이터가 없습니다. 엑셀 파일을 확인해주세요.')
        setIsUploading(false)
        return
      }

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
          id="client-excel-upload"
          disabled={isUploading}
        />
        <label
          htmlFor="client-excel-upload"
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

export default ClientExcelUpload
