import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { RefreshCw, Loader2, AlertTriangle, Search, Target } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useData } from '../contexts/DataContext'
import { setKpiManualInput } from '../utils/kpiCategories'
import { showSuccess, showError } from '../utils/alert'

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

const agingStyle = (m) => {
    if (m >= 3) return { color: '#B91C1C', background: '#FEE2E2' }
    if (m === 2) return { color: '#B45309', background: '#FEF3C7' }
    if (m === 1) return { color: '#1D4ED8', background: '#DBEAFE' }
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

    const summary = useMemo(() => {
        const withBal = rows.filter((r) => Number(r.balance) > 0)
        const od = rows.filter((r) => Number(r.overdue_amount) > 0)
        return {
            total: withBal.reduce((a, r) => a + Number(r.balance || 0), 0),
            clients: withBal.length,
            overdueCount: od.length,
            overdueAmount: od.reduce((a, r) => a + Number(r.overdue_amount || 0), 0),
            m3: rows.filter((r) => r.aging_months >= 3).length,
        }
    }, [rows])

    const view = useMemo(() => {
        const b = BUCKETS.find((x) => x.key === bucket) || BUCKETS[0]
        const q = query.trim().toLowerCase()
        const out = rows.filter((r) => {
            if (!b.test(r)) return false
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
    }, [rows, bucket, query, mineOnly, sort, repById])

    const toggleSort = (key) => {
        setSort((s) => (s.key === key ? { key, dir: s.dir === 'desc' ? 'asc' : 'desc' } : { key, dir: 'desc' }))
    }
    const sortMark = (key) => (sort.key === key ? (sort.dir === 'desc' ? ' ▼' : ' ▲') : '')

    const sendToKpi = async () => {
        setKpiManualInput('receivables', summary.overdueCount)
        window.dispatchEvent(new Event('kpi-manual-updated'))
        await showSuccess(`KPI 채권관리에 연체 ${summary.overdueCount}건을 저장했습니다.`)
    }

    if (tableMissing) {
        return (
            <div className="win" style={{ margin: 12 }}>
                <div className="win-title"><span>채권관리</span></div>
                <div style={{ padding: 16, fontSize: 13, lineHeight: 1.8, color: 'var(--text-secondary)' }}>
                    <p style={{ margin: 0 }}>아직 준비되지 않았습니다. 두 단계만 하면 됩니다.</p>
                    <ol style={{ margin: '10px 0 0', paddingLeft: 20 }}>
                        <li>Supabase SQL Editor에서 <code>execution/sql/receivables.sql</code> 실행</li>
                        <li>터미널에서{' '}
                            <code>node execution/analyze_receivables.mjs "&lt;외상매출금.xlsx&gt;" --apply</code>
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
                <button className="tb-btn" onClick={sendToKpi} disabled={loading || rows.length === 0}>
                    <Target size={14} /> KPI 채권관리에 {summary.overdueCount}건 저장
                </button>
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
                            <th style={{ minWidth: 100 }}>최초 미수월</th>
                            <th style={{ minWidth: 110 }}>대장 메모</th>
                            <th style={{ minWidth: 80 }}>담당</th>
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
                                    <td style={{ fontSize: 12 }}>{r.delay_note || ''}</td>
                                    <td style={{ fontSize: 12 }}>{repById.get(r.client_id) || ''}</td>
                                </tr>
                            )
                        })}
                        {view.length === 0 && !loading && (
                            <tr><td colSpan={8} style={{ textAlign: 'center', padding: 20, color: 'var(--text-secondary)' }}>
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
