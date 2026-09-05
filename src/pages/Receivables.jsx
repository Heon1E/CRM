import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { RefreshCw, Loader2, AlertTriangle, Search, Upload, EyeOff, RotateCcw } from 'lucide-react'
import * as XLSX from 'xlsx'
import { parseReceivablesLedger, summarizeReceivables, ledgerAge } from '../utils/receivablesLedger'
import { buildClientKeys } from '../hooks/useSalesImport'
import { supabase } from '../lib/supabase'
import { useData } from '../contexts/DataContext'
import { showSuccess, showError, showWarning, showConfirm, showInput } from '../utils/alert'

/**
 * 채권관리 — 결제가 밀린 순서로 본다.
 *
 * 데이터는 `execution/analyze_receivables.mjs --apply` 가 회사 외상매출금 대장에서
 * 만들어 넣는다(receivables 테이블). 월 단위 스냅샷이라 화면 상단에 기준월을 크게 띄운다.
 *
 * 정렬 기준이 핵심이다:
 *   aging_months  — 가장 오래된 미수분이 몇 개월 전 매출인가.
 *                   0이면 당월분만 남은 것이라 익월 결제 조건에서는 정상이다.
 *   overdue_amount— 당월 매출을 넘어선 잔액. 실제로 밀린 돈.
 * 대장의 '지연' 메모는 108곳 중 10곳에만 적혀 있어 순서를 매기지 못한다.
 * 그래서 계산값으로 정렬하고, 메모는 참고로 함께 보여준다.
 */

const won = (v) => Math.round(Number(v) || 0).toLocaleString('ko-KR')
const eok = (v) => ((Number(v) || 0) / 1e8).toFixed(2)

const BUCKETS = [
    { key: 'all', label: '전체', test: () => true },
    { key: 'overdue', label: '연체만', test: (r) => Number(r.overdue_amount) > 0 },
    { key: 'm1', label: '1개월', test: (r) => r.aging_months === 1 },
    { key: 'm2', label: '2개월', test: (r) => r.aging_months === 2 },
    { key: 'm3', label: '3개월 이상', test: (r) => r.aging_months >= 3 },
]

/*
 * 경과월 표시 — **색이 단계를 말해야 한다.**
 *
 * 예전에는 1개월이 **파란색**이었다. 파랑은 이 앱에서 걷어낸 색이고, 무엇보다
 * '주의'를 말하지 못한다. 3개월(빨강)·2개월(옅은 주황)과 나란히 놓으면
 * 순서도 읽히지 않았다.
 *
 * 지금은 밝기가 그대로 무게가 된다 — 채도 높은 노랑에서 시작해 점점 어두워진다:
 *   정상 회색(무게 없음) -> 1개월 노랑 0.82 -> 2개월 주황 0.45 -> 3개월+ 빨강 0.14
 *
 * 전부 **면을 채우고 어두운 글씨를 얹는다.** 노랑은 흰 바탕에서 1.2:1이라
 * 글씨나 얇은 선으로는 보이지 않는다 — 면으로 써야 산다.
 * 대비: 노랑 9.29 · 주황 5.39 · 빨강 5.44 (전부 본문 기준 통과)
 */
const agingStyle = (m) => {
    if (m >= 3) return { color: '#ffffff', background: '#c0392b' }
    if (m === 2) return { color: '#3e3a39', background: '#ff9d00' }
    if (m === 1) return { color: '#3e3a39', background: 'var(--ind-yellow)' }
    return { color: 'var(--text-secondary)', background: 'transparent' }
}

const Receivables = () => {
    const navigate = useNavigate()
    const { clients } = useData()

    const [rows, setRows] = useState([])
    const [months, setMonths] = useState([])
    const [baseMonth, setBaseMonth] = useState('')
    const [loading, setLoading] = useState(true)
    const [tableMissing, setTableMissing] = useState(false)
    const [bucket, setBucket] = useState('overdue')
    const [query, setQuery] = useState('')
    const [mineOnly, setMineOnly] = useState(false)
    const [sort, setSort] = useState({ key: 'aging_months', dir: 'desc' })
    const [uploading, setUploading] = useState(false)
    const [showExcluded, setShowExcluded] = useState(false)
    const fileRef = React.useRef(null)

    const repById = useMemo(() => {
        const m = new Map()
        clients.forEach((c) => m.set(c.id, c.sales_rep || ''))
        return m
    }, [clients])

    const load = useCallback(async (month) => {
        setLoading(true)
        try {
            // 어떤 기준월들이 있는지 먼저 본다 (월 스냅샷이 쌓인다)
            const { data: mData, error: mErr } = await supabase
                .from('receivables').select('base_month').order('base_month', { ascending: false }).limit(500)

            if (mErr) {
                if (mErr.code === '42P01' || mErr.code === 'PGRST205' ||
                    /does not exist|could not find the table/i.test(mErr.message || '')) {
                    setTableMissing(true); setRows([]); return
                }
                throw mErr
            }
            setTableMissing(false)

            const uniq = [...new Set((mData || []).map((x) => x.base_month))].sort().reverse()
            setMonths(uniq)
            const target = month || uniq[0]
            setBaseMonth(target || '')
            if (!target) { setRows([]); return }

            const { data, error } = await supabase
                .from('receivables').select('*').eq('base_month', target)
                .order('aging_months', { ascending: false }).limit(2000)
            if (error) throw error
            setRows(data || [])
        } catch (e) {
            console.error('채권 조회 실패:', e)
            await showError(e.message || '채권 자료를 불러오지 못했습니다.')
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => { load() }, [load])

    // 제외된 건은 실제 채권이 아니므로 합계·연체 건수에서 모두 뺀다
    const active = useMemo(() => rows.filter((r) => !r.excluded), [rows])
    const excludedRows = useMemo(() => rows.filter((r) => r.excluded), [rows])

    // 계산은 `receivablesLedger.summarizeReceivables` 하나뿐이다 —
    // KPI 카드도 같은 함수를 쓴다. 두 벌로 세면 어긋났을 때 알 수 없다.
    const summary = useMemo(() => summarizeReceivables(rows), [rows])

    /*
     * **대장이 낡았으면 맨 위에서 말해 준다.** 월 스냅샷이라 두 달 이상
     * 벌어지면 이미 갚은 곳이 아직 밀린 것처럼 보이고 새로 밀린 곳은 안 보인다.
     * 여기가 대장을 올리는 자리이므로, 알려 줄 곳도 여기다.
     * 가장 최신 기준월로 잰다 — 사용자가 옛 달을 골라 보는 중일 수 있다.
     */
    const age = useMemo(() => ledgerAge(months[0]), [months])

    const view = useMemo(() => {
        const b = BUCKETS.find((x) => x.key === bucket) || BUCKETS[0]
        const q = query.trim().toLowerCase()
        const source = showExcluded ? excludedRows : active
        const out = source.filter((r) => {
            if (!showExcluded && !b.test(r)) return false
            if (mineOnly && repById.get(r.client_id) !== '이헌일') return false
            if (q && !String(r.client_name || '').toLowerCase().includes(q)) return false
            return true
        })
        const dir = sort.dir === 'asc' ? 1 : -1
        return out.sort((a, b2) => {
            const va = a[sort.key], vb = b2[sort.key]
            if (typeof va === 'string' || typeof vb === 'string') {
                return String(va || '').localeCompare(String(vb || '')) * dir
            }
            const d = (Number(va) || 0) - (Number(vb) || 0)
            // 경과월이 같으면 밀린 금액이 큰 곳을 위로
            if (d === 0 && sort.key === 'aging_months') {
                return (Number(b2.overdue_amount) || 0) - (Number(a.overdue_amount) || 0)
            }
            return d * dir
        })
    }, [active, excludedRows, showExcluded, bucket, query, mineOnly, sort, repById])

    const toggleSort = (key) => {
        setSort((s) => (s.key === key ? { key, dir: s.dir === 'desc' ? 'asc' : 'desc' } : { key, dir: 'desc' }))
    }
    const sortMark = (key) => (sort.key === key ? (sort.dir === 'desc' ? ' ▼' : ' ▲') : '')

    /**
     * 외상매출금 대장 엑셀을 화면에서 바로 올린다.
     *
     * 판독·계산은 `receivablesLedger.js`로, 스크립트와 **같은 코드**를 쓴다.
     * 매달 대장이 새로 오면 터미널 없이 여기서 갱신하면 된다.
     * 같은 기준월을 다시 올리면 덮어쓴다(중복이 쌓이지 않는다).
     */
    const handleUpload = async (e) => {
        const file = e.target.files?.[0]
        if (!file) return
        setUploading(true)
        try {
            const buf = await file.arrayBuffer()
            const wb = XLSX.read(buf, { type: 'array' })
            const ws = wb.Sheets[wb.SheetNames[0]]
            const parsed = parseReceivablesLedger({
                aoa: XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' }),
                merges: ws['!merges'] || [],
            })

            if (!parsed.baseMonth || parsed.rows.length === 0) {
                await showWarning('대장에서 잔액이 채워진 달을 찾지 못했습니다.\n외상매출금 관리대장 파일이 맞는지 확인해 주세요.')
                return
            }

            // 거래처 연결 (스크립트와 같은 기준)
            const map = new Map()
            clients.forEach((c) => buildClientKeys(c.company).forEach((k) => { if (!map.has(k)) map.set(k, c) }))

            // 이미 '제외'로 표시해 둔 거래처는 새 달에도 그대로 제외한다.
            // 회계 장부가 고쳐지기 전까지 대장에는 계속 미수로 찍혀 나오기 때문이다.
            // (excluded 열이 아직 없으면 조용히 건너뛴다 — 마이그레이션 전에도 업로드는 되어야 한다)
            const prevExcluded = new Map()
            {
                const { data: ex, error: exErr } = await supabase.from('receivables')
                    .select('client_name, exclusion_reason').eq('excluded', true)
                if (!exErr) {
                    (ex || []).forEach((r) => { if (!prevExcluded.has(r.client_name)) prevExcluded.set(r.client_name, r.exclusion_reason) })
                }
            }

            const payload = parsed.rows.map((x) => {
                const hit = buildClientKeys(x.name).map((k) => map.get(k)).find(Boolean)
                const carried = prevExcluded.has(x.name)
                    ? { excluded: true, exclusion_reason: prevExcluded.get(x.name) }
                    : {}
                return {
                    ...carried,
                    client_id: hit ? hit.id : null,
                    client_name: x.name,
                    base_month: parsed.baseMonth,
                    balance: Math.round(x.balance),
                    overdue_amount: Math.round(x.overdue),
                    aging_months: x.aging,
                    oldest_unpaid_month: x.oldest,
                    delay_note: x.delay || null,
                    updated_at: new Date().toISOString(),
                }
            })

            for (let i = 0; i < payload.length; i += 200) {
                const { error } = await supabase.from('receivables')
                    .upsert(payload.slice(i, i + 200), { onConflict: 'client_name,base_month' })
                if (error) throw error
            }

            const overdue = payload.filter((p) => p.overdue_amount > 0).length
            await showSuccess(
                `${parsed.baseMonth} 기준 채권 ${payload.length}건을 반영했습니다.\n` +
                `연체 ${overdue}곳 · 거래처 연결 ${payload.filter((p) => p.client_id).length}건`
            )
            await load(parsed.baseMonth)
        } catch (err) {
            console.error('대장 업로드 실패:', err)
            if (/schema cache|does not exist|PGRST205/i.test(`${err.message} ${err.code}`)) {
                await showError('receivables 테이블이 아직 없습니다.\nSupabase SQL Editor에서 execution/sql/receivables.sql 을 먼저 실행해 주세요.')
            } else {
                await showError(err.message || '대장을 반영하지 못했습니다.')
            }
        } finally {
            setUploading(false)
            if (fileRef.current) fileRef.current.value = ''
        }
    }

    /**
     * 대장에는 미수로 잡혀 있지만 실제 채권이 아닌 건을 제외한다.
     *
     * **행을 지우지 않는다.** 회계 장부가 고쳐지기 전까지는 다음 달 대장에도
     * 그대로 나오므로 지워봐야 되살아나고, 왜 뺐는지도 남지 않는다.
     * 표시를 달아두면 새 달을 올릴 때 같은 거래처가 그 표시를 물려받는다.
     */
    const excludeRow = async (row) => {
        const reason = await showInput(
            `${row.client_name}의 미수금 ${won(row.balance)}원을 채권에서 뺍니다.
왜 채권이 아닌지 적어 주세요.`,
            '채권에서 제외',
            'text',
            '예) 선입금 후 출고 건을 미수로 잘못 잡음'
        )
        if (reason === null) return
        try {
            const { error } = await supabase.from('receivables')
                .update({ excluded: true, exclusion_reason: reason || '사유 미기재' })
                .eq('id', row.id)
            if (error) throw error
            await showSuccess(`${row.client_name}을(를) 채권에서 뺐습니다.
다음 달 대장을 올려도 계속 제외됩니다.`)
            await load(baseMonth)
        } catch (e) {
            if (/column .* does not exist|excluded/i.test(e.message || '')) {
                await showError(`제외 기능이 아직 준비되지 않았습니다.
Supabase에서 execution/sql/receivables_exclusions.sql 을 실행해 주세요.`)
            } else {
                await showError(e.message || '제외하지 못했습니다.')
            }
        }
    }

    const restoreRow = async (row) => {
        const ok = await showConfirm(`${row.client_name}을(를) 다시 채권으로 되돌립니다.`, '제외 해제')
        if (!ok) return
        const { error } = await supabase.from('receivables')
            .update({ excluded: false, exclusion_reason: null }).eq('id', row.id)
        if (error) { await showError(error.message); return }
        await load(baseMonth)
    }

    /*
     * **'KPI에 N건 저장' 단추를 없앴다.** 대장의 연체 거래처 수(36곳)를 KPI
     * 채권관리에 넣고 있었는데, 그 KPI가 세는 것은 **대손·법적 조치 같은 사고
     * 건수**다(사용자 확인). 눈금이 0건 양호 / 1건 보통 / 2건 미흡인 것도
     * 그래서다 — 36을 넣으면 언제나 '미흡'이 된다.
     *
     * 두 숫자는 이름만 비슷하고 세는 대상이 다르다. 단추를 남겨 두면 언젠가
     * 누르게 되고, 그날부터 KPI가 부당하게 깎인다. 사고 건수는 KPI 카드에서
     * 직접 넣는다. 대장 수치는 그 카드에 '참고'로만 보인다.
     */

    if (tableMissing) {
        return (
            <div className="win" style={{ margin: 12 }}>
                <div className="win-title"><span>채권관리</span></div>
                <div className="toolbar">
                    <input
                        ref={fileRef} type="file" accept=".xlsx,.xls"
                        onChange={handleUpload} style={{ display: 'none' }} id="recv-ledger-input-empty"
                    />
                    <label htmlFor="recv-ledger-input-empty" className="tb-btn primary" style={{ cursor: 'pointer' }}>
                        {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />} 대장 올리기
                    </label>
                    <button className="tb-btn" onClick={() => load()} disabled={loading}>
                        <RefreshCw size={14} /> 다시 확인
                    </button>
                </div>
                <div style={{ padding: 16, fontSize: 13, lineHeight: 1.8, color: 'var(--text-secondary)' }}>
                    <p style={{ margin: 0 }}>아직 준비되지 않았습니다. 두 단계만 하면 됩니다.</p>
                    <ol style={{ margin: '10px 0 0', paddingLeft: 20 }}>
                        <li>Supabase SQL Editor에서 <code>execution/sql/receivables.sql</code> 실행</li>
                        <li>이 화면의 <b>대장 올리기</b>로 외상매출금 엑셀을 올리기<br />
                            <span style={{ fontSize: 12 }}>
                                (터미널을 쓰려면{' '}
                                <code>node execution/analyze_receivables.mjs "&lt;외상매출금.xlsx&gt;" --apply</code>)
                            </span>
                        </li>
                    </ol>
                </div>
            </div>
        )
    }

    return (
        <div className="win" style={{ margin: 12 }}>
            <div className="win-title">
                <span>채권관리</span>
                <span className="meta">
                    {baseMonth ? `${baseMonth} 기준` : ''} · 결제가 밀린 순서
                </span>
            </div>

            <div className="toolbar">
                <button className="tb-btn" onClick={() => load(baseMonth)} disabled={loading}>
                    {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} 새로고침
                </button>
                {months.length > 1 && (
                    <>
                        <span className="tb-sep" />
                        <select value={baseMonth} onChange={(e) => load(e.target.value)} disabled={loading}>
                            {months.map((m) => <option key={m} value={m}>{m} 기준</option>)}
                        </select>
                    </>
                )}
                <span className="tb-sep" />
                <input
                    ref={fileRef} type="file" accept=".xlsx,.xls"
                    onChange={handleUpload} style={{ display: 'none' }} id="recv-ledger-input"
                />
                <label htmlFor="recv-ledger-input" className="tb-btn" style={{ cursor: uploading ? 'not-allowed' : 'pointer' }}>
                    {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />} 대장 올리기
                </label>
                <span className="tb-sep" />

            </div>

            {/* 요약 */}
            <div style={{
                display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                gap: 1, background: 'var(--border)', borderTop: '1px solid var(--border)',
                borderBottom: '1px solid var(--border)'
            }}>
                {[
                    { label: '총 미수금', value: `${eok(summary.total)}억`, sub: `${summary.clients}개 거래처` },
                    { label: '연체 금액', value: `${eok(summary.overdueAmount)}억`, sub: `${summary.overdueCount}개 거래처`, warn: summary.overdueAmount > 0 },
                    { label: '3개월 이상', value: `${summary.m3}곳`, sub: '집중 관리 대상', warn: summary.m3 > 0 },
                ].map((c) => (
                    <div key={c.label} style={{ background: 'var(--bg-card)', padding: '10px 14px' }}>
                        <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{c.label}</div>
                        <div style={{ fontSize: 20, fontWeight: 700, color: c.warn ? '#B91C1C' : 'var(--text-primary)' }}>
                            {c.value}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{c.sub}</div>
                    </div>
                ))}
            </div>

            {age.stale && months.length > 0 && (
                <div style={{
                    margin: '10px 0', padding: '10px 14px', display: 'flex', alignItems: 'center',
                    gap: 10, flexWrap: 'wrap',
                    /* 진짜 노랑 면 + 먹색 글씨(9.29:1). 옅은 amber로 깔면
                       표 안의 경과월 칩보다 약해져서 경고가 경고로 안 보인다. */
                    background: 'var(--ind-yellow)', border: 'none',
                    borderRadius: 'var(--radius)', color: 'var(--ind-ink)', fontWeight: 700,
                }}>
                    <span>
                        가장 최신 대장이 {months[0]} 기준입니다 ({age.monthsBehind}개월 전).
                        지금 보이는 숫자는 현재를 말하지 못합니다 — 최신 대장을 올려 주세요.
                    </span>
                </div>
            )}

            <div className="filterbar" style={{ gap: 8, flexWrap: 'wrap' }}>
                {BUCKETS.map((b) => (
                    <button
                        key={b.key}
                        className={`tb-btn${bucket === b.key ? ' primary' : ''}`}
                        onClick={() => setBucket(b.key)}
                    >
                        {b.label}
                    </button>
                ))}
                <span className="tb-sep" />
                <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13 }}>
                    <input type="checkbox" checked={mineOnly} onChange={(e) => setMineOnly(e.target.checked)} />
                    내 담당만
                </label>
                {excludedRows.length > 0 && (
                    <button
                        className={`tb-btn${showExcluded ? ' primary' : ''}`}
                        onClick={() => setShowExcluded((v) => !v)}
                        title="채권이 아니라고 표시해 둔 건"
                    >
                        <EyeOff size={13} /> 제외 {excludedRows.length}건
                    </button>
                )}
                <span style={{ display: 'flex', alignItems: 'center', gap: 5, marginLeft: 'auto' }}>
                    <Search size={14} style={{ opacity: 0.6 }} />
                    <input
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="거래처 검색"
                        style={{ width: 160 }}
                    />
                </span>
            </div>

            <div style={{ overflowX: 'auto' }}>
                <table className="dgrid">
                    <thead>
                        <tr>
                            <th className="seq" style={{ width: 40 }}>#</th>
                            <th style={{ minWidth: 180, cursor: 'pointer' }} onClick={() => toggleSort('client_name')}>
                                거래처{sortMark('client_name')}
                            </th>
                            <th style={{ minWidth: 90, cursor: 'pointer', textAlign: 'right' }} onClick={() => toggleSort('aging_months')}>
                                경과{sortMark('aging_months')}
                            </th>
                            <th style={{ minWidth: 130, cursor: 'pointer', textAlign: 'right' }} onClick={() => toggleSort('overdue_amount')}>
                                연체금액{sortMark('overdue_amount')}
                            </th>
                            <th style={{ minWidth: 130, cursor: 'pointer', textAlign: 'right' }} onClick={() => toggleSort('balance')}>
                                잔액{sortMark('balance')}
                            </th>
                            <th style={{ minWidth: 88 }}>최초 미수월</th>
                            <th style={{ minWidth: 56 }} title="대장에 적힌 메모">메모</th>
                            <th style={{ minWidth: 64 }}>담당</th>
                            {/* **행 동작은 오른쪽에 붙박는다.** 표가 1,000px이라 화면 밖으로 밀려
    제외 단추에 손이 닿지 않았다(실측 803px 지점에서 잘림). */}
                            <th className="sticky-act"></th>
                        </tr>
                    </thead>
                    <tbody>
                        {view.map((r, i) => {
                            const st = agingStyle(r.aging_months)
                            return (
                                <tr
                                    key={r.id}
                                    onClick={() => r.client_id && navigate(`/clients/${r.client_id}`)}
                                    style={{ cursor: r.client_id ? 'pointer' : 'default' }}
                                    title={r.client_id ? '거래처 상세로 이동' : 'CRM에 등록되지 않은 거래처'}
                                >
                                    <td className="seq">{i + 1}</td>
                                    <td>
                                        {r.client_name}
                                        {!r.client_id && (
                                            <span style={{ marginLeft: 6, fontSize: 11, color: 'var(--text-secondary)' }}>
                                                (미등록)
                                            </span>
                                        )}
                                    </td>
                                    <td className="num">
                                        <span style={{
                                            ...st, padding: '1px 7px', borderRadius: 'var(--radius)',
                                            fontWeight: r.aging_months >= 1 ? 700 : 400
                                        }}>
                                            {r.aging_months === 0 ? '정상' : `${r.aging_months}개월`}
                                        </span>
                                    </td>
                                    <td className="num" style={{ color: Number(r.overdue_amount) > 0 ? '#B91C1C' : 'var(--text-secondary)', fontWeight: Number(r.overdue_amount) > 0 ? 600 : 400 }}>
                                        {Number(r.overdue_amount) > 0 ? won(r.overdue_amount) : '-'}
                                    </td>
                                    <td className="num">{won(r.balance)}</td>
                                    <td className="dt">{r.oldest_unpaid_month || '-'}</td>
                                    <td style={{ fontSize: 12 }}>
                                        {r.excluded
                                            ? <span style={{ color: '#B45309' }}>제외: {r.exclusion_reason || '사유 미기재'}</span>
                                            : (r.delay_note || '')}
                                    </td>
                                    <td style={{ fontSize: 12 }}>{repById.get(r.client_id) || ''}</td>
                                    <td className="sticky-act" onClick={(e) => e.stopPropagation()}>
                                        {r.excluded ? (
                                            <button className="rowbtn" onClick={() => restoreRow(r)} title="다시 채권으로 되돌리기">
                                                <RotateCcw size={13} />
                                            </button>
                                        ) : (
                                            <button className="rowbtn" onClick={() => excludeRow(r)} title="채권에서 제외 (회계 착오 등)">
                                                <EyeOff size={13} />
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            )
                        })}
                        {view.length === 0 && !loading && (
                            <tr><td colSpan={9} style={{ textAlign: 'center', padding: 20, color: 'var(--text-secondary)' }}>
                                해당하는 거래처가 없습니다.
                            </td></tr>
                        )}
                    </tbody>
                </table>
            </div>

            <div className="statusbar">
                <span>{view.length}건 표시</span>
                <span>연체 {won(view.reduce((a, r) => a + Number(r.overdue_amount || 0), 0))}원</span>
                <span>잔액 {won(view.reduce((a, r) => a + Number(r.balance || 0), 0))}원</span>
            </div>

            <p style={{ padding: '10px 12px', margin: 0, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                <AlertTriangle size={12} style={{ display: 'inline', verticalAlign: -2, marginRight: 4 }} />
                <b>경과</b>는 잔액을 최근 매출부터 거꾸로 배분해 가장 오래된 미수분이 몇 개월 전 매출인지 계산한 값입니다.
                익월 결제 조건이면 <b>당월분만 남은 상태가 정상</b>이고, 그걸 넘어선 금액이 <b>연체금액</b>입니다.
                <br />
                자료는 <b>{baseMonth || '-'} 월말 기준</b>이며 회사 외상매출금 대장에서 가져옵니다. 갱신하려면 새 대장 파일로
                <code style={{ margin: '0 4px' }}>analyze_receivables.mjs --apply</code>를 실행하세요.
            </p>
        </div>
    )
}

export default Receivables
