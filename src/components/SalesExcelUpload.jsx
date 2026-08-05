import React, { useState, useRef } from 'react'
import { Upload, Download, Loader2, Trash2 } from 'lucide-react'
import { downloadSaleTemplate, parseSaleExcel } from '../utils/excelExport'
import { useData } from '../contexts/DataContext'
import { supabase } from '../lib/supabase'
import { showSuccess, showError, showWarning, showInfo, showHtmlConfirm } from '../utils/alert'
import { reconcileSales } from '../utils/salesReconciler'

const SalesExcelUpload = ({ onRefresh }) => {
  const { clients, addSale, registerMissingProductsFromSales, registerMissingClients, applySalesReconciliation } = useData()
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0, stage: '' })
  const [isDeleting, setIsDeleting] = useState(false)
  const fileInputRef = useRef(null)

  // 양식 다운로드
  const handleDownloadTemplate = () => {
    downloadSaleTemplate()
  }

  const normalizeKey = (name, { removeCorp = false, removePunct = false } = {}) => {
    if (!name) return ''
    let text = name
      .toString()
      .replace(/\u200B|\uFEFF/g, '') // zero-width chars
      .replace(/\u00A0/g, ' ') // nbsp
      .replace(/[（]/g, '(')
      .replace(/[）]/g, ')')
      .replace(/㈜/g, '(주)')
      .trim()

    if (removeCorp) {
      text = text.replace(/주식회사|유한회사|합자회사|합명회사|유한|㈜|\(주\)|\(유\)/g, '')
    }

    if (removePunct) {
      text = text.replace(/[\s\(\)\[\]\{\}\-_.·]/g, '')
    } else {
      text = text.replace(/\s+/g, '')
    }

    return text.toLowerCase()
  }

  const buildClientKeys = (name) => {
    const keys = new Set()
    keys.add(normalizeKey(name))
    keys.add(normalizeKey(name, { removeCorp: true }))
    keys.add(normalizeKey(name, { removePunct: true }))
    keys.add(normalizeKey(name, { removeCorp: true, removePunct: true }))
    return Array.from(keys).filter(Boolean)
  }

  const fetchAllRows = async (buildQuery, pageSize = 1000) => {
    let from = 0
    let results = []

    while (true) {
      const { data, error } = await buildQuery().range(from, from + pageSize - 1)
      if (error) throw error
      results = results.concat(data || [])
      if (!data || data.length < pageSize) break
      from += pageSize
    }

    return results
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
    setUploadProgress({ current: 0, total: 0, stage: '파일 파싱 중' })

    try {
      // Step 1: 엑셀 파일 파싱
      const salesData = await parseSaleExcel(file)

      if (!salesData || salesData.length === 0) {
        await showWarning('엑셀 파일에 유효한 데이터가 없습니다.')
        setIsUploading(false)
        return
      }

      // 거래처명으로 clientId 찾기 및 유효성 검사
      setUploadProgress({ current: 0, total: 0, stage: '거래처 목록 불러오는 중' })
      let validatedSales = []
      const errors = []

      const fetchedClients = await fetchAllRows(() =>
        supabase
          .from('clients')
          .select('id, company')
          .order('company')
      )

      const clientMap = new Map()
        ; (fetchedClients || []).forEach((c) => {
          buildClientKeys(c.company).forEach((key) => {
            if (!clientMap.has(key)) clientMap.set(key, c)
          })
        })

      setUploadProgress({ current: 0, total: salesData.length, stage: '거래처 매칭 중' })

      let processedCount = 0
      for (const sale of salesData) {
        // 거래처명이 없으면 건너뛰기
        if (!sale.clientName || sale.clientName.trim() === '') {
          continue
        }

        const clientKeys = buildClientKeys(sale.clientName)
        const client = clientKeys.map((key) => clientMap.get(key)).find(Boolean)

        // 거래처가 없어도 오류로 처리하지 않고 신규 등록 대상으로 포함
        const clientId = client ? client.id : null

        // 총액 계산
        const totalAmount = (sale.quantity || 0) * (sale.unitPrice || 0)

        validatedSales.push({
          clientId: clientId,
          clientName: sale.clientName.trim(),
          sale_date: sale.sale_date,
          item_name: sale.item_name,
          quantity: sale.quantity,
          unitPrice: sale.unitPrice,
          totalAmount: totalAmount,
          notes: sale.notes,
        })
        processedCount += 1
        if (processedCount % 200 === 0 || processedCount === salesData.length) {
          setUploadProgress((prev) => ({
            ...prev,
            current: processedCount,
            total: salesData.length
          }))
        }
      }

      if (errors.length > 0) {
        await showWarning(`일부 데이터를 등록하지 못했습니다:\n${errors.join('\n')}`)
      }

      if (validatedSales.length === 0) {
        setIsUploading(false)
        return
      }

      // Step 1.5: 엑셀에만 있고 DB에 없는 신규 거래처를 먼저 등록한다.
      // 이 단계를 건너뛰면 매출이 client_id 없이 저장되어 목록에 '알수없음'으로 표시된다.
      // 날짜별 저장 루프보다 앞에서 한 번에 처리해야, 같은 업체가 여러 날짜에 등장해도
      // 거래처가 중복 생성되지 않는다.
      const createdClientNames = []
      const unresolvedRows = validatedSales.filter(s => !s.clientId)

      if (unresolvedRows.length > 0) {
        setUploadProgress({ current: 0, total: unresolvedRows.length, stage: '신규 거래처 등록 중' })

        // 같은 업체의 표기 흔들림을 하나로 묶어 중복 생성을 막는다.
        // 기존 거래처를 찾을 때 쓰는 것과 같은 최대 정규화 기준을 써야 한다.
        // ('주식회사한국' / '(주)한국' / '한국' -> 모두 하나로 취급)
        const newNameByKey = new Map()
        unresolvedRows.forEach((s) => {
          const key = normalizeKey(s.clientName, { removeCorp: true, removePunct: true })
          if (key && !newNameByKey.has(key)) newNameByKey.set(key, s.clientName)
        })

        try {
          const created = await registerMissingClients(Array.from(newNameByKey.values()))
          created.forEach((c) => {
            createdClientNames.push(c.company)
            buildClientKeys(c.company).forEach((key) => {
              if (!clientMap.has(key)) clientMap.set(key, c)
            })
          })
        } catch (clientError) {
          console.error('신규 거래처 자동 등록 실패:', clientError)
        }

        // 새로 만든 거래처 ID를 매출 행에 채운다
        validatedSales.forEach((s) => {
          if (s.clientId) return
          const match = buildClientKeys(s.clientName).map((key) => clientMap.get(key)).find(Boolean)
          if (match) s.clientId = match.id
        })
      }

      // 거래처를 끝내 확정하지 못한 행은 저장하지 않는다.
      // client_id 없이 넣으면 '알수없음' 매출로 남아 나중에 찾아내기 어렵다.
      const orphanRows = validatedSales.filter(s => !s.clientId)
      if (orphanRows.length > 0) {
        const orphanNames = [...new Set(orphanRows.map(s => s.clientName))]
        await showWarning(
          `다음 거래처를 등록하지 못해 매출 ${orphanRows.length}건을 건너뜁니다:\n` +
          `${orphanNames.join(', ')}\n\n` +
          `거래처를 직접 추가한 뒤 다시 업로드해 주세요.`
        )
        validatedSales = validatedSales.filter(s => s.clientId)
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
      setUploadProgress({ current: 0, total: excelDates.length, stage: '기존 매출 조회 중' })
      let existingSales = []
      try {
        existingSales = await fetchAllRows(() =>
          supabase
            .from('sales')
            .select('*')
            // 정렬이 없으면 .range() 페이지 사이에서 행이 중복/누락된다.
            // 대사 결과가 통째로 틀어지므로 반드시 지정할 것.
            .order('id', { ascending: true })
            .in('sale_date', excelDates)
        )
      } catch (error) {
        console.error('기존 매출 데이터 조회 오류:', error)
        await showError('기존 매출 데이터를 불러오는 중 오류가 발생했습니다.')
        setIsUploading(false)
        return
      }

      // Step 3: 대사 - 엑셀과 기존 매출을 맞춰본다
      // 단순 중복 제거가 아니라 "엑셀 기준으로 해당 날짜를 맞추는" 방식이다.
      // 그래야 ERP에서 나중에 수정된 금액을 반영할 수 있다.
      setUploadProgress({ current: 0, total: validatedSales.length, stage: '기존 데이터와 대조 중' })
      const plan = reconcileSales(validatedSales, existingSales || [])

      const { stats } = plan
      const hasChanges = stats.insert + stats.update + stats.delete > 0

      if (!hasChanges) {
        await showInfo(
          `이미 모두 등록된 데이터입니다. 변경할 내용이 없습니다.\n(대조한 매출 ${stats.unchanged}건)`,
          '변경 사항 없음'
        )
        setIsUploading(false)
        setUploadProgress({ current: 0, total: 0, stage: '' })
        if (fileInputRef.current) fileInputRef.current.value = ''
        return
      }

      // Step 4: 미리보기 -> 사용자 승인
      const won = (v) => Number(v || 0).toLocaleString('ko-KR') + '원'
      const diff = stats.amountAfter - stats.amountBefore
      const diffText = diff === 0
        ? '변동 없음'
        : `${diff > 0 ? '+' : '-'}${Number(Math.abs(diff)).toLocaleString('ko-KR')}원`

      const deleteSample = plan.toDelete.slice(0, 5).map(r =>
        `<li>${r.sale_date} · ${r.item_name || '(품목없음)'} · ${won(r.total_amount)}${r.client_id ? '' : ' <b>(거래처 없음)</b>'}</li>`
      ).join('')
      const updateSample = plan.toUpdate.slice(0, 5).map(u =>
        `<li>${u.db.sale_date} · ${u.db.item_name || '(품목없음)'} — ${u.changes.map(c => `${c.field} ${Number(c.before).toLocaleString('ko-KR')} → <b>${Number(c.after).toLocaleString('ko-KR')}</b>`).join(', ')}</li>`
      ).join('')

      const previewHtml = `
        <div style="text-align:left">
          <p style="margin:0 0 10px"><b>대상 기간:</b> ${plan.targetDates[0]} ~ ${plan.targetDates[plan.targetDates.length - 1]} (${plan.targetDates.length}개 날짜)</p>
          <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:12px">
            <tr><td style="padding:5px 0">그대로 유지</td><td style="text-align:right"><b>${stats.unchanged}건</b></td></tr>
            <tr><td style="padding:5px 0;color:#2563eb">신규 등록</td><td style="text-align:right;color:#2563eb"><b>${stats.insert}건</b></td></tr>
            <tr><td style="padding:5px 0;color:#ca8a04">금액·수량 수정</td><td style="text-align:right;color:#ca8a04"><b>${stats.update}건</b></td></tr>
            <tr><td style="padding:5px 0;color:#dc2626">삭제</td><td style="text-align:right;color:#dc2626"><b>${stats.delete}건</b></td></tr>
          </table>
          <p style="margin:0 0 10px;padding:8px;background:#f8fafc;border-radius:6px">
            해당 기간 매출: ${won(stats.amountBefore)} → <b>${won(stats.amountAfter)}</b> (${diffText})
          </p>
          ${updateSample ? `<p style="margin:10px 0 4px"><b>수정될 항목</b>${stats.update > 5 ? ` (${stats.update}건 중 5건)` : ''}</p><ul style="margin:0;padding-left:18px;font-size:12px">${updateSample}</ul>` : ''}
          ${deleteSample ? `<p style="margin:10px 0 4px;color:#dc2626"><b>삭제될 항목</b>${stats.delete > 5 ? ` (${stats.delete}건 중 5건)` : ''}</p><ul style="margin:0;padding-left:18px;font-size:12px">${deleteSample}</ul>` : ''}
          ${stats.delete > 0 ? `<p style="margin:12px 0 0;font-size:12px;color:#dc2626">※ 삭제는 되돌릴 수 없습니다. 엑셀이 이 기간 전체를 담고 있는지 확인해 주세요.</p>` : ''}
        </div>
      `

      const approved = await showHtmlConfirm(previewHtml, '반영할 내용을 확인해 주세요', '반영하기', '취소')

      if (!approved) {
        setIsUploading(false)
        setUploadProgress({ current: 0, total: 0, stage: '' })
        if (fileInputRef.current) fileInputRef.current.value = ''
        return
      }

      // Step 5: 반영
      const applyResult = await applySalesReconciliation(plan, (p) => {
        setUploadProgress({ current: p.current, total: p.total, stage: p.stage })
      })

      const insertedCount = applyResult.inserted
      const duplicateCount = stats.unchanged
      const insertErrors = applyResult.errors || []

      let resultMessage =
        `신규 ${applyResult.inserted}건 · 수정 ${applyResult.updated}건 · 삭제 ${applyResult.deleted}건 · 유지 ${stats.unchanged}건`
      if (createdClientNames.length > 0) {
        resultMessage += `\n\n신규 거래처 ${createdClientNames.length}개를 자동 등록했습니다:\n${createdClientNames.join(', ')}\n(담당자·연락처는 거래처 화면에서 보완해 주세요)`
      }

      // [MODIFIED] 신규 등록이든 중복이든, 데이터가 처리되었으면 품목 동기화 시도 (연결 누락 보정)
      if (insertedCount > 0 || duplicateCount > 0) {
        try {
          if (registerMissingProductsFromSales) {
            setUploadProgress(prev => ({ ...prev, stage: '품목 동기화 및 매출 연결 중...' }))
            const { count, updatedSales } = await registerMissingProductsFromSales()
            console.log(`[Auto-Sync] Created ${count} products, Linked ${updatedSales} sales`)
          }
        } catch (syncError) {
          console.error('자동 품목 동기화 실패:', syncError)
          insertErrors.push(`데이터는 저장되었으나 품목 연결에 실패했습니다: ${syncError.message}`)
        }
      }

      if (insertedCount > 0) {
        await showSuccess(resultMessage)
      } else if (duplicateCount > 0) {
        await showWarning(resultMessage)
      }

      if (insertErrors.length > 0) {
        await showError(`일부 처리에 문제가 있었습니다:\n${insertErrors.join('\n')}`)
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
      setUploadProgress({ current: 0, total: 0, stage: '' })
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
          disabled={isUploading}
        />
        <label
          htmlFor="sales-excel-upload"
          className={`px-4 py-2.5 bg-white text-black rounded-xl hover:bg-zinc-100 transition-all duration-200 flex items-center justify-center space-x-2 font-semibold cursor-pointer ${isUploading ? 'opacity-50 cursor-not-allowed' : ''
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
      {isUploading && uploadProgress.stage && (
        <div className="flex items-center space-x-3 min-w-[220px]">
          <div className="flex-1">
            <p className="text-xs text-[color:var(--text-secondary)] mb-1">{uploadProgress.stage}</p>
            <div className="w-full h-2 bg-gray-800 rounded-full overflow-hidden border border-[color:var(--border)]">
              <div
                className="h-2 bg-white/70 transition-all"
                style={{
                  width: `${uploadProgress.total > 0 ? Math.min(100, Math.round((uploadProgress.current / uploadProgress.total) * 100)) : 0}%`,
                }}
              />
            </div>
          </div>
          <span className="text-xs text-[color:var(--text-secondary)] whitespace-nowrap">
            {uploadProgress.total > 0 ? `${uploadProgress.current}/${uploadProgress.total}` : ''}
          </span>
        </div>
      )}
      {/* Delete All 버튼 (위험 구역) */}
      <button
        onClick={handleDeleteAll}
        disabled={isDeleting || isUploading}
        className={`flex-1 sm:flex-none flex items-center justify-center space-x-2 touch-manipulation min-h-[44px] px-4 py-2.5 rounded-xl font-semibold transition-all duration-200 ${isDeleting || isUploading
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



