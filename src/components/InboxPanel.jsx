import React, { useState, useEffect, useCallback } from 'react'
import { Inbox, Loader2, Check, X, RefreshCw, MessageSquare, Image as ImageIcon } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useSalesImport, buildClientKeys } from '../hooks/useSalesImport'
import { useData } from '../contexts/DataContext'
import { normalizeDate, toNumber } from '../services/erpVisionService'
import { showSuccess, showError, showWarning } from '../utils/alert'
import {
    normalizeClient as normalizeReportClient, verifyReport, summarizeClients,
} from '../utils/collectionReport'

/**
 * 텔레그램으로 받은 항목 처리함.
 *
 * 봇은 읽어서 담아두기만 한다(telegram_inbox). 실제 반영은 여기서 사람이 확인한 뒤 한다.
 * 특히 **매출은 반드시 useSalesImport(대사)를 거친다** — 봇이 바로 저장하면 중복이 쌓인다.
 */

const LABEL = {
    sales: '매출',
    collection_report: '매출/수금 실적표',
    receivables: '채권(미수금)',
    activity: '일정·활동',
    memo: '메모',
    unknown: '분류 불명',
}

const won = (v) => Number(v || 0).toLocaleString('ko-KR')

const InboxPanel = ({ onRefresh }) => {
    const { clients, addActivity } = useData()
    const { importSalesRows, isImporting } = useSalesImport()

    const [items, setItems] = useState([])
    const [loading, setLoading] = useState(false)
    const [tableMissing, setTableMissing] = useState(false)
    const [workingId, setWorkingId] = useState(null)

    const load = useCallback(async () => {
        setLoading(true)
        try {
            const { data, error } = await supabase
                .from('telegram_inbox')
                .select('*')
                .eq('status', 'pending')
                .order('created_at', { ascending: false })
                .limit(50)

            if (error) {
                // 테이블을 아직 만들지 않은 상태 — 기능을 안 쓰는 것뿐이니 조용히 접어둔다.
                // PostgREST는 42P01이 아니라 PGRST205('Could not find the table')로 답한다.
                if (error.code === '42P01' || error.code === 'PGRST205' ||
                    /does not exist|could not find the table/i.test(error.message || '')) {
                    setTableMissing(true)
                    setItems([])
                    return
                }
                throw error
            }
            setTableMissing(false)
            setItems(data || [])
        } catch (e) {
            console.error('받은 항목 조회 실패:', e)
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => { load() }, [load])

    const mark = async (id, status, note) => {
        const { error } = await supabase
            .from('telegram_inbox')
            .update({ status, applied_at: new Date().toISOString(), note: note || null })
            .eq('id', id)
        if (error) throw error
        setItems((prev) => prev.filter((i) => i.id !== id))
    }

    const applyItem = async (item) => {
        const rows = item.payload?.rows || []
        const year = new Date(item.created_at).getFullYear()

        if (rows.length === 0) {
            await showWarning('반영할 내용이 없습니다. 무시 처리해 주세요.')
            return
        }

        setWorkingId(item.id)
        try {
            if (item.doc_type === 'sales') {
                const salesRows = rows
                    .map((r) => ({
                        clientName: String(r.clientName || '').trim(),
                        sale_date: normalizeDate(r.sale_date, year),
                        item_name: String(r.item_name || '').trim(),
                        quantity: toNumber(r.quantity),
                        unitPrice: toNumber(r.unitPrice),
                        notes: r.notes || '',
                    }))
                    .filter((r) => r.clientName && r.sale_date && r.item_name)

                if (salesRows.length === 0) {
                    await showWarning('거래처·날짜·품목이 채워진 행이 없습니다.')
                    return
                }

                const res = await importSalesRows(salesRows, { sourceLabel: '텔레그램 받은 항목' })
                if (!res.ok) return
                await mark(item.id, 'applied', res.message)
                if (res.message) await showSuccess(res.message)
            } else if (item.doc_type === 'collection_report') {
                /*
                 * 「영업사원 거래처별 매출/수금 실적표」 — 월별 이월/매출/수금/잔액이
                 * 다 있으므로 **엑셀 대장과 같은 계산**으로 채권 대장에 넣는다.
                 *
                 * **검산을 통과해야만 저장한다.** 이 숫자로 수금 독촉 전화를 건다.
                 * 표는 스스로를 검산한다 — 달마다 `이월+매출−수금=잔액`,
                 * 달 사이 `다음 달 이월=이번 달 잔액`, 맨 아래 `잔액 합계`.
                 *
                 * 쪽마다 따로 오므로(6쪽짜리다) **한 쪽씩 반영해도 쌓인다** —
                 * `(client_name, base_month)`로 upsert 하기 때문이다. 잔액 합계는
                 * 마지막 쪽에만 있으므로 그 쪽에서만 대조된다.
                 */
                const p = item.payload || {}
                const reportYear = Number(p.year) || year
                const clients0 = rows.map((r) => normalizeReportClient(r, reportYear))
                const v = verifyReport({ clients: clients0, year: reportYear, repTotal: p.repTotal })

                if (!v.baseMonth) {
                    await showWarning('매출·수금이 있는 달을 찾지 못했습니다. 표가 잘리지 않았는지 확인해 주세요.')
                    return
                }
                if (!v.ok) {
                    await showError(
                        `판독이 표와 맞지 않아 저장하지 않았습니다 (${v.problems.length}곳).\n\n` +
                        v.problems.slice(0, 6).map((x) => `· ${x.clientName || '합계'} ${x.month}\n  ${x.message}`).join('\n') +
                        (v.problems.length > 6 ? `\n\n… 외 ${v.problems.length - 6}곳` : '') +
                        `\n\n설정 > ERP 스크린샷에서 같은 사진을 올리면 틀린 칸을 한 번에 고칠 수 있습니다.`
                    )
                    return
                }

                const summarized = summarizeClients({ clients: clients0, year: reportYear, baseMonth: v.baseMonth })
                const map = new Map()
                clients.forEach((c) => buildClientKeys(c.company).forEach((kk) => { if (!map.has(kk)) map.set(kk, c) }))

                const prevExcluded = new Map()
                const { data: ex, error: exErr } = await supabase.from('receivables')
                    .select('client_name, exclusion_reason').eq('excluded', true)
                if (!exErr) (ex || []).forEach((r) => { if (!prevExcluded.has(r.client_name)) prevExcluded.set(r.client_name, r.exclusion_reason) })

                const payload = summarized.map((x) => {
                    const hit = buildClientKeys(x.name).map((kk) => map.get(kk)).find(Boolean)
                    return {
                        ...(prevExcluded.has(x.name) ? { excluded: true, exclusion_reason: prevExcluded.get(x.name) } : {}),
                        client_id: hit ? hit.id : null,
                        client_name: x.name,
                        base_month: v.baseMonth,
                        balance: Math.round(x.balance),
                        overdue_amount: Math.round(x.overdue),
                        aging_months: x.aging,
                        oldest_unpaid_month: x.oldest,
                        delay_note: p.salesRep ? `${p.salesRep} 담당 · 매출/수금 실적표에서` : '매출/수금 실적표에서',
                        updated_at: new Date().toISOString(),
                    }
                })

                for (let i = 0; i < payload.length; i += 200) {
                    const { error } = await supabase.from('receivables')
                        .upsert(payload.slice(i, i + 200), { onConflict: 'client_name,base_month' })
                    if (error) throw error
                }

                const overdue = payload.filter((x) => x.overdue_amount > 0).length
                await mark(item.id, 'applied', `${v.baseMonth} 채권 ${payload.length}곳`)
                await showSuccess(
                    `${v.baseMonth} 기준 ${payload.length}곳을 채권관리에 반영했습니다.\n` +
                    `잔액 합계 ${won(v.totals.balanceSum)}원 · 연체 ${overdue}곳\n` +
                    `거래처 연결 ${payload.filter((x) => x.client_id).length}곳` +
                    (p.salesRep ? `\n\n※ ${p.salesRep} 담당분입니다 — 전사 채권이 아닙니다.` : '')
                )
            } else if (item.doc_type === 'receivables') {
                /*
                 * **'반영'이 아무것도 반영하지 않고 있었다.**
                 * 채권관리 화면(`receivables` 표)에는 한 줄도 넣지 않으면서
                 * '반영됨'으로 표시하고 "저장했습니다"라고 말했다. 게다가
                 * 저장하던 값은 **연체 업체 수를 KPI 사고 건수 칸**에 넣는
                 * 것이라, 누르면 KPI가 부당하게 깎였다 (그 눈금은 0/1/2건인데
                 * 연체는 2026-05 기준 36곳이다). 채권관리 화면에 있던 같은
                 * 단추는 바로 그 이유로 이미 뺐다.
                 *
                 * 지금은 읽은 내용만 알려주고 **받은 항목을 그대로 남긴다** —
                 * '반영됨'으로 덮으면 처리된 줄 알고 넘어간다.
                 */
                const total = rows.reduce((a, r) => a + toNumber(r.amount), 0)
                await showWarning(
                    `읽은 내용: 거래처 ${rows.length}곳 · 잔액 합계 ${won(total)}원\n\n` +
                    `채권관리 대장에는 반영하지 않았습니다. 대장은 월 스냅샷이라 ` +
                    `경과월·연체금액을 월별 매출에서 거꾸로 계산해야 하는데, 사진 한 장에는 ` +
                    `그 이력이 없습니다.\n` +
                    `채권관리 화면의 '대장 올리기'로 엑셀을 올려 주세요.`
                )
            } else if (item.doc_type === 'activity') {
                const clientMap = new Map()
                clients.forEach((c) => {
                    buildClientKeys(c.company).forEach((k) => { if (!clientMap.has(k)) clientMap.set(k, c) })
                })

                let saved = 0
                const unmatched = []
                for (const r of rows) {
                    const c = buildClientKeys(r.clientName).map((k) => clientMap.get(k)).find(Boolean)
                    if (!c) { unmatched.push(r.clientName || '(거래처 없음)'); continue }
                    await addActivity({
                        clientId: c.id,
                        activity_date: normalizeDate(r.activity_date, year) || null,
                        type: r.type || '기타',
                        description: r.description || '',
                        status: '완료',
                        next_action_date: r.next_action_date ? normalizeDate(r.next_action_date, year) : null,
                        next_action_detail: r.next_action_detail || '',
                    })
                    saved += 1
                }

                if (saved === 0) {
                    await showWarning(`거래처를 찾지 못했습니다: ${[...new Set(unmatched)].join(', ')}`)
                    return
                }
                await mark(item.id, 'applied', `활동 ${saved}건`)
                let msg = `활동 ${saved}건을 등록했습니다.`
                if (unmatched.length) msg += `\n\n거래처를 못 찾아 건너뜀: ${[...new Set(unmatched)].join(', ')}`
                await showSuccess(msg)
            } else {
                await showWarning('자동으로 반영할 수 있는 종류가 아닙니다. 내용을 확인하고 무시 처리해 주세요.')
                return
            }

            if (onRefresh) await onRefresh()
        } catch (e) {
            console.error('받은 항목 반영 실패:', e)
            await showError(e.message || '반영 중 오류가 발생했습니다.')
        } finally {
            setWorkingId(null)
        }
    }

    const dismissItem = async (item) => {
        setWorkingId(item.id)
        try {
            await mark(item.id, 'dismissed')
        } catch (e) {
            await showError(e.message)
        } finally {
            setWorkingId(null)
        }
    }

    const preview = (item) => {
        const rows = item.payload?.rows || []
        if (rows.length === 0) return null

        if (item.doc_type === 'sales') {
            const total = rows.reduce((a, r) => a + toNumber(r.quantity) * toNumber(r.unitPrice), 0)
            return (
                <>
                    <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 12 }}>
                        {rows.slice(0, 5).map((r, i) => (
                            <li key={i}>
                                {normalizeDate(r.sale_date)} · {r.clientName} · {r.item_name} · {toNumber(r.quantity)}개 ·{' '}
                                {won(toNumber(r.quantity) * toNumber(r.unitPrice))}원
                            </li>
                        ))}
                        {rows.length > 5 && <li>… 외 {rows.length - 5}건</li>}
                    </ul>
                    <p style={{ margin: '6px 0 0', fontSize: 12, fontWeight: 600 }}>합계 {won(total)}원</p>
                </>
            )
        }

        if (item.doc_type === 'receivables') {
            const total = rows.reduce((a, r) => a + toNumber(r.amount), 0)
            return (
                <p style={{ margin: '6px 0 0', fontSize: 12 }}>
                    {rows.length}개 거래처 · 총 미수금 {won(total)}원 · 연체{' '}
                    {rows.filter((r) => Number(r.overdueDays) > 0).length}건
                </p>
            )
        }

        return (
            <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 12 }}>
                {rows.slice(0, 5).map((r, i) => (
                    <li key={i}>
                        {r.activity_date ? `${normalizeDate(r.activity_date)} · ` : ''}
                        {r.clientName ? `${r.clientName} · ` : ''}
                        {r.description || r.text || ''}
                    </li>
                ))}
            </ul>
        )
    }

    if (tableMissing) {
        return (
            <div className="win">
                <div className="win-title"><span>받은 항목 (텔레그램)</span></div>
                <p style={{ padding: 14, margin: 0, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                    아직 설정되지 않았습니다. <code>execution/sql/telegram_inbox.sql</code>을 Supabase에서 실행하고,
                    <code>directives/TELEGRAM_SETUP.md</code>의 순서대로 봇을 연결하면 여기에 표시됩니다.
                </p>
            </div>
        )
    }

    return (
        <div className="win">
            <div className="win-title">
                <span>받은 항목 (텔레그램)</span>
                <span className="meta">{items.length}건 대기</span>
            </div>

            <div className="toolbar">
                <button className="tb-btn" onClick={load} disabled={loading}>
                    {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} 새로고침
                </button>
            </div>

            {items.length === 0 ? (
                <p style={{ padding: 18, margin: 0, textAlign: 'center', fontSize: 13, color: 'var(--text-secondary)' }}>
                    <Inbox size={20} style={{ display: 'block', margin: '0 auto 8px', opacity: 0.5 }} />
                    대기 중인 항목이 없습니다. 휴대폰에서 봇에게 스크린샷이나 메시지를 보내보세요.
                </p>
            ) : (
                <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {items.map((item) => (
                        <div
                            key={item.id}
                            style={{
                                border: '1px solid var(--border)',
                                borderRadius: 'var(--radius)',
                                padding: 10,
                            }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                <b style={{ fontSize: 13 }}>{LABEL[item.doc_type] || item.doc_type}</b>
                                <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                                    {new Date(item.created_at).toLocaleString('ko-KR')}
                                    {item.from_name ? ` · ${item.from_name}` : ''}
                                </span>
                                {item.has_image && <ImageIcon size={13} style={{ opacity: 0.6 }} />}
                                {item.raw_text && <MessageSquare size={13} style={{ opacity: 0.6 }} />}
                            </div>

                            {item.payload?.summary && (
                                <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--text-secondary)' }}>
                                    {item.payload.summary}
                                </p>
                            )}
                            {item.raw_text && (
                                <p style={{ margin: '4px 0 0', fontSize: 12 }}>“{item.raw_text}”</p>
                            )}

                            {preview(item)}

                            {item.payload?.warnings?.length > 0 && (
                                <p style={{ margin: '6px 0 0', fontSize: 12, color: '#92400E' }}>
                                    ⚠️ {item.payload.warnings.slice(0, 3).join(' / ')}
                                </p>
                            )}

                            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                                <button
                                    className="tb-btn primary"
                                    onClick={() => applyItem(item)}
                                    disabled={workingId === item.id || isImporting}
                                >
                                    {workingId === item.id ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} 반영
                                </button>
                                <button
                                    className="tb-btn"
                                    onClick={() => dismissItem(item)}
                                    disabled={workingId === item.id}
                                >
                                    <X size={13} /> 무시
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}

export default InboxPanel
