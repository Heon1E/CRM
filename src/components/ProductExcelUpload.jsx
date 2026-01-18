import React, { useState, useRef } from 'react'
import { Upload, Download, Loader2 } from 'lucide-react'
import { downloadProductTemplate, parseProductExcel } from '../utils/excelExport'
import { useData } from '../contexts/DataContext'
import { showWarning, showSuccess, showError } from '../utils/alert'

const ProductExcelUpload = () => {
  const { addProductsBulk } = useData()
  const [isUploading, setIsUploading] = useState(false)
  const fileInputRef = useRef(null)

  // 양식 다운로드
  const handleDownloadTemplate = () => {
    downloadProductTemplate()
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
      const products = await parseProductExcel(file)

      if (products.length === 0) {
        await showWarning('등록할 제품 데이터가 없습니다. 엑셀 파일을 확인해주세요.')
        setIsUploading(false)
        return
      }

      // 일괄 등록
      await addProductsBulk(products)
      await showSuccess(`${products.length}개의 제품이 일괄 등록되었습니다.`)

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
          id="excel-upload"
          disabled={isUploading}
        />
        <label
          htmlFor="excel-upload"
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

export default ProductExcelUpload



