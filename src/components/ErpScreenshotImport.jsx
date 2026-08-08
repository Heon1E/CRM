import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { Image as ImageIcon, Loader2, Trash2, ScanLine, Check, AlertTriangle, X } from 'lucide-react'
import { analyzeErpScreenshots, toNumber } from '../services/erpVisionService'
import { useSalesImport, buildClientKeys } from '../hooks/useSalesImport'
import { useData } from '../contexts/DataContext'
import { setKpiManualInput } from '../utils/kpiCategories'
import { nameCandidates, NON_CLIENT_PATTERN, looksLikeMultiCompany } from '../utils/clientAliases'
import { showSuccess, showError, showWarning } from '../utils/alert'

/**
 * ERP 화면 스크린샷으로 데이터 입력하기.
 *
 * 사진 붙여넣기(Ctrl+V) / 끌어놓기 / 파일 선택 / 휴대폰 카메라 모두 받는다.
 * 판독 -> **화면에서 사람이 확인·수정** -> 반영. 판독 결과를 바로 저장하지 않는다.
 *
 * 매출은 useSalesImport(대사)를 그대로 탄다. 같은 화면을 두 번 올려도 중복되지 않고,
 * ERP에서 금액이 바뀐 건은 수정으로 반영된다.
 */

const DOC_TYPES = [
    { value: 'auto', label: '자동 판별' },
    { value: 'sales', label: '매출' },
    { value: 'receivables', label: '채권(미수금)' },
    { value: 'daily_report', label: '일일업무보고서' },
    { value: 'activity', label: '일정·활동' },
]

const DOC_LABEL = {
    sales: '매출',
    receivables: '채권(미수금)',
    daily_report: '일일업무보고서',
    activity: '일정·활동',
    unknown: '알 수 없음',
}

const won = (v) => Number(v || 0).toLocaleString('ko-KR')

const ErpScreenshotImport = ({ onRefresh }) => {
    const { clients, activities, addActivity } = useData()
    const { importSalesRows, isImporting, progress } = useSalesImport()

    const [files, setFiles] = useState([])          // { file, url }
    const [docType, setDocType] = useState('auto')
    const [isAnalyzing, setIsAnalyzing] = useState(false)
    const [result, setResult] = useState(null)      // { docType, rows, summary, warnings }
    const [receivableCount, setReceivableCount] = useState('')
    const [isSaving, setIsSaving] = useState(false)
    const fileInputRef = useRef(null)
    const dropRef = useRef(null)

    const busy = isAnalyzing || isImporting || isSaving

    // ---- 이미지 받기 ----
    const addFiles = useCallback((incoming) => {
        const imgs = Array.from(incoming || []).filter((f) => f.type?.startsWith('image/'))
        if (imgs.length === 0) return
        setFiles((prev) => {
            const next = [...prev, ...imgs.map((f) => ({ file: f, url: URL.createObjectURL(f) }))]
            return next.slice(0, 6) // 서버 한도와 맞춘다
        })
        setResult(null)
    }, [])

    // 붙여넣기(Ctrl+V). 스샷 찍고 바로 붙이는 게 가장 빠른 경로다.
    useEffect(() => {
        const onPaste = (e) => {
            const items = e.clipboardData?.items
            if (!items) return
            const imgs = Array.from(items).filter((i) => i.type.startsWith('image/')).map((i) => i.getAsFile())
            if (imgs.length > 0) {
                e.preventDefault()
                addFiles(imgs)
            }
        }
        window.addEventListener('paste', onPaste)
        return () => window.removeEventListener('paste', onPaste)
    }, [addFiles])

    useEffect(() => () => files.forEach((f) => URL.revokeObjectURL(f.url)), []) // eslint-disable-line react-hooks/exhaustive-deps

    const removeFile = (idx) => {
        setFiles((prev) => {
            URL.revokeObjectURL(prev[idx]?.url)
            return prev.filter((_, i) => i !== idx)
        })
        setResult(null)
    }

    const clearAll = () => {
        files.forEach((f) => URL.revokeObjectURL(f.url))
        setFiles([])
        setResult(null)
        setReceivableCount('')
        if (fileInputRef.current) fileInputRef.current.value = ''
    }

    // ---- 판독 ----
    const handleAnalyze = async () => {
        if (files.length === 0) {
            await showWarning('스크린샷을 먼저 붙여넣거나 선택해 주세요.')
            return
        }
        setIsAnalyzing(true)
        try {
            const r = await analyzeErpScreenshots(files.map((f) => f.file), {
                docType,
                defaultYear: new Date().getFullYear(),
            })
            setResult(r)
            if (r.docType === 'receivables') {
                const overdue = r.rows.filter((x) => Number(x.overdueDays) > 0).length
                setReceivableCount(String(overdue))
            }
            if (r.rows.length === 0) {
                await showWarning(
                    r.summary || '표를 찾지 못했습니다. 화면을 더 크게 찍거나, 종류를 직접 지정해 다시 시도해 주세요.'
                )
            }
        } catch (e) {
            console.error('ERP 스크린샷 판독 실패:', e)
            await showError(e.message || '판독에 실패했습니다.')
        } finally {
            setIsAnalyzing(false)
        }
    }

    // ---- 셀 수정 ----
    const editCell = (idx, field, value) => {
        setResult((prev) => {
            const rows = prev.rows.map((r, i) => (i === idx ? { ...r, [field]: value } : r))
            return { ...prev, rows }
        })
    }
    const removeRow = (idx) => {
        setResult((prev) => ({ ...prev, rows: prev.rows.filter((_, i) => i !== idx) }))
    }

    // ---- 반영 ----
    const applySales = async () => {
        const rows = result.rows
            .filter((r) => r.clientName && r.sale_date && r.item_name)
            .map((r) => ({
                clientName: r.clientName,
                sale_date: r.sale_date,
                item_name: r.item_name,
                quantity: toNumber(r.quantity),
                unitPrice: toNumber(r.unitPrice),
                notes: r.notes,
            }))

        const skipped = result.rows.length - rows.length
        if (skipped > 0) {
            await showWarning(`거래처·날짜·품목이 빈 ${skipped}건은 제외하고 진행합니다.`)
        }
        if (rows.length === 0) return

        const res = await importSalesRows(rows, { sourceLabel: 'ERP 화면 판독' })
        if (res.message) {
            if (res.applyResult?.inserted > 0) await showSuccess(res.message)
            else await showWarning(res.message)
        }
        if (res.ok) {
            clearAll()
            if (onRefresh) await onRefresh()
        }
    }

    const applyReceivables = async () => {
        const n = Number(receivableCount)
        if (!Number.isFinite(n) || n < 0) {
            await showWarning('채권 문제 건수를 숫자로 입력해 주세요.')
            return
        }
        setKpiManualInput('receivables', n)
        await showSuccess(
            `채권관리 KPI에 ${n}건을 저장했습니다.\n` +
            `총 미수금 ${won(result.rows.reduce((a, r) => a + toNumber(r.amount), 0))}원 (${result.rows.length}개 거래처)`
        )
        clearAll()
        // 대시보드 KPI 카드가 값을 다시 읽도록 알린다
        window.dispatchEvent(new Event('kpi-manual-updated'))
    }

    /**
     * 적힌 이름으로 거래처를 찾는다.
     * 대응표(ALIASES)와 '(오산)' 같은 괄호·공장 접미사까지 훑어야
     * 이미 있는 회사를 못 찾고 새로 만드는 일이 없다.
     */
    const clientMap = useMemo(() => {
        const m = new Map()
        clients.forEach((c) => {
            buildClientKeys(c.company).forEach((k) => { if (!m.has(k)) m.set(k, c) })
        })
        return m
    }, [clients])

    const findClient = (raw) => {
        for (const cand of nameCandidates(raw)) {
            const hit = buildClientKeys(cand).map((k) => clientMap.get(k)).find(Boolean)
            if (hit) return hit
        }
        return null
    }

    /**
     * 이미 등록된 활동인지. 같은 거래처를 같은 날 두 번 등록하지 않는다.
     * 같은 일지를 두 번 찍어 올려도 활동이 늘지 않아야 한다
     * (활동 건수는 KPI 정기적방문횟수의 근거다).
     */
    const isDuplicateActivity = (clientId, date) =>
        activities.some((a) => (a.client_id || a.clientId) === clientId &&
            String(a.activity_date || a.date || '') === date)

    const applyActivities = async () => {
        const matched = []
        const unmatched = []
        result.rows.forEach((r) => {
            const c = findClient(r.clientName)
            if (c) matched.push({ ...r, clientId: c.id })
            else unmatched.push(r.clientName || '(거래처 없음)')
        })

        if (matched.length === 0) {
            await showWarning(
                `거래처를 찾지 못해 저장할 항목이 없습니다.\n판독된 이름: ${[...new Set(unmatched)].join(', ')}`
            )
            return
        }

        setIsSaving(true)
        const errors = []
        let saved = 0
        for (const a of matched) {
            try {
                await addActivity({
                    clientId: a.clientId,
                    activity_date: a.activity_date || null,
                    type: a.type || '기타',
                    description: a.description || '',
                    status: '완료',
                    next_action_date: a.next_action_date || null,
                    next_action_detail: a.next_action_detail || '',
                })
                saved += 1
            } catch (e) {
                errors.push(`${a.clientName}: ${e.message}`)
            }
        }
        setIsSaving(false)

        let msg = `활동 ${saved}건을 등록했습니다.`
        if (unmatched.length > 0) {
            msg += `\n\n거래처를 찾지 못해 건너뛴 ${unmatched.length}건: ${[...new Set(unmatched)].join(', ')}`
        }
        if (errors.length > 0) msg += `\n\n실패: ${errors.join('\n')}`
        await showSuccess(msg)

        clearAll()
        if (onRefresh) await onRefresh()
    }

    /**
     * 일일업무보고서 반영.
     *
     * '금일 영업 계획'은 판독 단계에서 이미 뺐다 (아직 다녀오지 않은 계획이고,
     * 실제로 다녀오면 다음 날 일지에 방문기록으로 다시 나와 이중 계상된다).
     */
    const applyDailyReport = async () => {
        const matched = [], unmatched = [], dups = [], skipped = []

        result.rows.forEach((r) => {
            const name = String(r.clientName || '').trim()
            if (!name || NON_CLIENT_PATTERN.test(name)) { skipped.push(name || '(빈칸)'); return }
            if (looksLikeMultiCompany(name)) { skipped.push(name); return }
            if (!r.activity_date) { skipped.push(`${name} (일자 없음)`); return }

            const c = findClient(name)
            if (!c) { unmatched.push(name); return }
            if (isDuplicateActivity(c.id, r.activity_date)) { dups.push(`${r.activity_date} ${c.company}`); return }
            matched.push({ ...r, clientId: c.id, clientCompany: c.company })
        })

        if (matched.length === 0) {
            let msg = '새로 등록할 방문기록이 없습니다.'
            if (dups.length) msg += `\n\n이미 등록됨 ${dups.length}건: ${dups.slice(0, 5).join(', ')}`
            if (unmatched.length) msg += `\n\n거래처를 찾지 못함: ${[...new Set(unmatched)].join(', ')}`
            if (skipped.length) msg += `\n\n건너뜀: ${[...new Set(skipped)].join(', ')}`
            await showWarning(msg)
            return
        }

        setIsSaving(true)
        const errors = []
        let saved = 0
        for (const a of matched) {
            try {
                await addActivity({
                    clientId: a.clientId,
                    activity_date: a.activity_date,
                    type: a.type,   // 유선이면 '전화', 아니면 '미팅'
                    status: '완료',
                    description:
                        [a.person ? `[담당자] ${a.person}` : '', a.purpose ? `[방문목적] ${a.purpose}` : '']
                            .filter(Boolean).join(' ') + (a.description ? `\n${a.description}` : ''),
                })
                saved += 1
            } catch (e) {
                errors.push(`${a.clientCompany}: ${e.message}`)
            }
        }
        setIsSaving(false)

        let msg = `방문기록 ${saved}건을 활동으로 등록했습니다.`
        const visits = matched.filter((m) => m.type === '미팅').length
        if (visits !== saved) msg += `\n(방문 ${visits}건 · 유선 ${saved - visits}건 — KPI 방문횟수는 방문만 셉니다)`
        if (dups.length) msg += `\n\n이미 등록되어 있어 건너뜀: ${dups.length}건`
        if (unmatched.length) msg += `\n\n거래처를 찾지 못해 건너뜀: ${[...new Set(unmatched)].join(', ')}`
        if (skipped.length) msg += `\n\n제외: ${[...new Set(skipped)].join(', ')}`
        if (errors.length) msg += `\n\n실패: ${errors.join('\n')}`
        await showSuccess(msg)

        clearAll()
        if (onRefresh) await onRefresh()
    }

    const handleApply = async () => {
        if (!result || result.rows.length === 0) return
        try {
            if (result.docType === 'sales') await applySales()
            else if (result.docType === 'receivables') await applyReceivables()
            else if (result.docType === 'daily_report') await applyDailyReport()
            else if (result.docType === 'activity') await applyActivities()
            else await showWarning('무엇을 반영할지 알 수 없습니다. 종류를 직접 지정해 다시 판독해 주세요.')
        } catch (e) {
            console.error('반영 실패:', e)
            await showError(e.message || '반영 중 오류가 발생했습니다.')
        }
    }

    // ---- 판독 결과 표 ----
    const renderRows = () => {
        const t = result.docType

        if (t === 'sales') {
            const total = result.rows.reduce((a, r) => a + toNumber(r.quantity) * toNumber(r.unitPrice), 0)
            return (
                <>
                    <div style={{ overflowX: 'auto' }}>
                        <table className="dgrid">
                            <thead>
                                <tr>
                                    <th style={{ width: 34 }}></th>
                                    <th style={{ minWidth: 100 }}>일자</th>
                                    <th style={{ minWidth: 140 }}>거래처</th>
                                    <th style={{ minWidth: 160 }}>품목</th>
                                    <th style={{ minWidth: 70 }}>수량</th>
                                    <th style={{ minWidth: 100 }}>단가</th>
                                    <th style={{ minWidth: 110 }}>금액</th>
                                </tr>
                            </thead>
                            <tbody>
                                {result.rows.map((r, i) => (
                                    <tr key={i}>
                                        <td>
                                            <button className="rowbtn" onClick={() => removeRow(i)} title="이 행 빼기">
                                                <X size={13} />
                                            </button>
                                        </td>
                                        <td><input value={r.sale_date || ''} onChange={(e) => editCell(i, 'sale_date', e.target.value)} /></td>
                                        <td><input value={r.clientName || ''} onChange={(e) => editCell(i, 'clientName', e.target.value)} /></td>
                                        <td><input value={r.item_name || ''} onChange={(e) => editCell(i, 'item_name', e.target.value)} /></td>
                                        <td><input value={r.quantity ?? ''} onChange={(e) => editCell(i, 'quantity', e.target.value)} style={{ textAlign: 'right' }} /></td>
                                        <td><input value={r.unitPrice ?? ''} onChange={(e) => editCell(i, 'unitPrice', e.target.value)} style={{ textAlign: 'right' }} /></td>
                                        <td className="num">{won(toNumber(r.quantity) * toNumber(r.unitPrice))}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <div className="statusbar">
                        <span>{result.rows.length}건</span>
                        <span>합계 {won(total)}원</span>
                    </div>
                </>
            )
        }

        if (t === 'receivables') {
            const total = result.rows.reduce((a, r) => a + toNumber(r.amount), 0)
            const overdue = result.rows.filter((r) => Number(r.overdueDays) > 0).length
            return (
                <>
                    <div style={{ overflowX: 'auto' }}>
                        <table className="dgrid">
                            <thead>
                                <tr>
                                    <th style={{ width: 34 }}></th>
                                    <th style={{ minWidth: 160 }}>거래처</th>
                                    <th style={{ minWidth: 120 }}>미수금</th>
                                    <th style={{ minWidth: 90 }}>연체일</th>
                                    <th style={{ minWidth: 110 }}>기일</th>
                                </tr>
                            </thead>
                            <tbody>
                                {result.rows.map((r, i) => (
                                    <tr key={i}>
                                        <td>
                                            <button className="rowbtn" onClick={() => removeRow(i)} title="이 행 빼기">
                                                <X size={13} />
                                            </button>
                                        </td>
                                        <td><input value={r.clientName || ''} onChange={(e) => editCell(i, 'clientName', e.target.value)} /></td>
                                        <td><input value={r.amount ?? ''} onChange={(e) => editCell(i, 'amount', e.target.value)} style={{ textAlign: 'right' }} /></td>
                                        <td><input value={r.overdueDays ?? ''} onChange={(e) => editCell(i, 'overdueDays', e.target.value)} style={{ textAlign: 'right' }} /></td>
                                        <td><input value={r.dueDate || ''} onChange={(e) => editCell(i, 'dueDate', e.target.value)} /></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <div className="statusbar">
                        <span>{result.rows.length}개 거래처</span>
                        <span>총 미수금 {won(total)}원</span>
                        <span>연체 {overdue}건</span>
                    </div>
                    <div style={{ padding: '10px 12px', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                        <label htmlFor="erp-receivable-count" style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                            채권관리 KPI에 기록할 <b>문제 발생 건수</b>
                        </label>
                        <input
                            id="erp-receivable-count"
                            type="number"
                            min="0"
                            value={receivableCount}
                            onChange={(e) => setReceivableCount(e.target.value)}
                            style={{ width: 90, textAlign: 'right' }}
                        />
                        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                            연체 건수({overdue}건)를 기본으로 넣었습니다. 실제 문제 건수로 고쳐도 됩니다.
                        </span>
                    </div>
                </>
            )
        }

        if (t === 'daily_report') {
            const visits = result.rows.filter((r) => r.type === '미팅').length
            return (
                <>
                    <div style={{ overflowX: 'auto' }}>
                        <table className="dgrid">
                            <thead>
                                <tr>
                                    <th style={{ width: 34 }}></th>
                                    <th style={{ minWidth: 100 }}>일자</th>
                                    <th style={{ minWidth: 140 }}>거래처</th>
                                    <th style={{ minWidth: 110 }}>담당자</th>
                                    <th style={{ minWidth: 70 }}>목적</th>
                                    <th style={{ minWidth: 70 }}>시간</th>
                                    <th style={{ minWidth: 260 }}>방문 및 미팅 내용</th>
                                </tr>
                            </thead>
                            <tbody>
                                {result.rows.map((r, i) => (
                                    <tr key={i}>
                                        <td>
                                            <button className="rowbtn" onClick={() => removeRow(i)} title="이 행 빼기">
                                                <X size={13} />
                                            </button>
                                        </td>
                                        <td><input value={r.activity_date || ''} onChange={(e) => editCell(i, 'activity_date', e.target.value)} /></td>
                                        <td><input value={r.clientName || ''} onChange={(e) => editCell(i, 'clientName', e.target.value)} /></td>
                                        <td><input value={r.person || ''} onChange={(e) => editCell(i, 'person', e.target.value)} /></td>
                                        <td><input value={r.purpose || ''} onChange={(e) => editCell(i, 'purpose', e.target.value)} /></td>
                                        <td><input value={r.time || ''} onChange={(e) => editCell(i, 'time', e.target.value)} /></td>
                                        <td>
                                            <textarea
                                                value={r.description || ''}
                                                onChange={(e) => editCell(i, 'description', e.target.value)}
                                                rows={3}
                                                style={{ width: '100%', minWidth: 260, resize: 'vertical' }}
                                            />
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <div className="statusbar">
                        <span>{result.rows.length}건</span>
                        <span>방문 {visits}건 · 유선 {result.rows.length - visits}건</span>
                        <span>KPI 방문횟수는 방문만 셉니다</span>
                    </div>
                </>
            )
        }

        // activity
        return (
            <>
                <div style={{ overflowX: 'auto' }}>
                    <table className="dgrid">
                        <thead>
                            <tr>
                                <th style={{ width: 34 }}></th>
                                <th style={{ minWidth: 100 }}>일자</th>
                                <th style={{ minWidth: 140 }}>거래처</th>
                                <th style={{ minWidth: 80 }}>유형</th>
                                <th style={{ minWidth: 220 }}>내용</th>
                            </tr>
                        </thead>
                        <tbody>
                            {result.rows.map((r, i) => (
                                <tr key={i}>
                                    <td>
                                        <button className="rowbtn" onClick={() => removeRow(i)} title="이 행 빼기">
                                            <X size={13} />
                                        </button>
                                    </td>
                                    <td><input value={r.activity_date || ''} onChange={(e) => editCell(i, 'activity_date', e.target.value)} /></td>
                                    <td><input value={r.clientName || ''} onChange={(e) => editCell(i, 'clientName', e.target.value)} /></td>
                                    <td><input value={r.type || ''} onChange={(e) => editCell(i, 'type', e.target.value)} /></td>
                                    <td><input value={r.description || ''} onChange={(e) => editCell(i, 'description', e.target.value)} /></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <div className="statusbar"><span>{result.rows.length}건</span></div>
            </>
        )
    }

    return (
        <div className="win">
            <div className="win-title">
                <span>ERP 화면 판독 입력</span>
                <span className="meta">스크린샷 → 표 인식 → 확인 후 반영</span>
            </div>

            <div className="toolbar">
                <select value={docType} onChange={(e) => setDocType(e.target.value)} disabled={busy}>
                    {DOC_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
                <span className="tb-sep" />
                <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    capture="environment"
                    onChange={(e) => addFiles(e.target.files)}
                    style={{ display: 'none' }}
                    id="erp-shot-input"
                />
                <label htmlFor="erp-shot-input" className="tb-btn" style={{ cursor: busy ? 'not-allowed' : 'pointer' }}>
                    <ImageIcon size={14} /> 사진 선택
                </label>
                <button className="tb-btn primary" onClick={handleAnalyze} disabled={busy || files.length === 0}>
                    {isAnalyzing ? <Loader2 size={14} className="animate-spin" /> : <ScanLine size={14} />} 판독
                </button>
                <button className="tb-btn" onClick={clearAll} disabled={busy || (files.length === 0 && !result)}>
                    <Trash2 size={14} /> 비우기
                </button>
                {result && result.rows.length > 0 && (
                    <button className="tb-btn primary" onClick={handleApply} disabled={busy}>
                        {isImporting || isSaving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} 반영하기
                    </button>
                )}
            </div>

            {/* 사진 받는 곳 */}
            <div
                ref={dropRef}
                onDragOver={(e) => { e.preventDefault() }}
                onDrop={(e) => { e.preventDefault(); addFiles(e.dataTransfer.files) }}
                style={{
                    margin: 12,
                    padding: files.length ? 10 : 22,
                    border: '1px dashed var(--border)',
                    borderRadius: 'var(--radius)',
                    background: 'var(--bg-subtle, transparent)',
                    textAlign: files.length ? 'left' : 'center',
                }}
            >
                {files.length === 0 ? (
                    <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                        ERP 화면을 캡처해서 <b>Ctrl+V</b>로 붙여넣거나, 여기로 끌어놓으세요.<br />
                        휴대폰에서는 <b>사진 선택</b>을 눌러 카메라로 찍어도 됩니다. (최대 6장)
                    </p>
                ) : (
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {files.map((f, i) => (
                            <div key={i} style={{ position: 'relative' }}>
                                <img
                                    src={f.url}
                                    alt={`스크린샷 ${i + 1}`}
                                    style={{ height: 84, border: '1px solid var(--border)', borderRadius: 'var(--radius)', display: 'block' }}
                                />
                                <button
                                    onClick={() => removeFile(i)}
                                    className="rowbtn"
                                    style={{ position: 'absolute', top: 2, right: 2, background: 'var(--bg-card)' }}
                                    title="빼기"
                                >
                                    <X size={12} />
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {isImporting && progress.stage && (
                <div style={{ padding: '0 12px 10px', fontSize: 12, color: 'var(--text-secondary)' }}>
                    {progress.stage} {progress.total > 0 ? `(${progress.current}/${progress.total})` : ''}
                </div>
            )}

            {result && (
                <div style={{ borderTop: '1px solid var(--border)' }}>
                    <div className="filterbar" style={{ gap: 10, flexWrap: 'wrap' }}>
                        <b>{DOC_LABEL[result.docType] || result.docType}</b>
                        {result.summary && <span style={{ color: 'var(--text-secondary)' }}>{result.summary}</span>}
                    </div>

                    {result.warnings.length > 0 && (
                        <div style={{ margin: '0 12px 10px', padding: 10, background: '#FEF3C7', color: '#92400E', borderRadius: 'var(--radius)', fontSize: 12 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, marginBottom: 4 }}>
                                <AlertTriangle size={14} /> 확인이 필요한 부분
                            </div>
                            <ul style={{ margin: 0, paddingLeft: 18 }}>
                                {result.warnings.slice(0, 8).map((w, i) => <li key={i}>{w}</li>)}
                            </ul>
                        </div>
                    )}

                    {result.rows.length > 0 && renderRows()}

                    <p style={{ padding: '8px 12px 12px', margin: 0, fontSize: 12, color: 'var(--text-secondary)' }}>
                        ※ 화면 판독은 틀릴 수 있습니다. <b>반영 전에 내용을 확인</b>해 주세요.
                        {result.docType === 'sales' && ' 매출은 같은 날짜를 다시 올려도 중복되지 않고, 바뀐 금액은 수정으로 반영됩니다.'}
                        {result.docType === 'daily_report' && " '금일 영업 계획'은 아직 다녀오지 않은 일정이라 제외했습니다. 같은 일지를 다시 올려도 중복되지 않습니다."}
                    </p>
                </div>
            )}
        </div>
    )
}

export default ErpScreenshotImport
