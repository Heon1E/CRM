import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useData } from '../contexts/DataContext'
import {
    X, Loader2, RefreshCw, AlertTriangle, Swords, Package,
    ListChecks, Info, ExternalLink, TrendingUp, TrendingDown, Phone, User
} from 'lucide-react'
import { fetchBriefing } from '../services/clientBriefingService'

/**
 * 거래처 한 장 브리핑 — 만나기 직전에 보는 화면.
 *
 * 세 층으로 나눈다:
 *   1) 숫자   — 앱이 계산한다. 매출 추이, 마지막 거래, 접촉 이력.
 *   2) 정리   — 활동 기록을 읽어 접은 것 (단계·핵심사실·걸림돌·다음 할 일).
 *   3) 원문   — 날짜순 활동 기록. 정리가 미덥지 않으면 여기서 확인한다.
 *
 * **숫자와 글을 섞지 않는 게 핵심이다.** 수치는 계산해서 보여주고, 모델은
 * 글로 적힌 것만 읽는다. 모델이 숫자를 만들어내면 영업 판단이 틀어진다.
 */

const MAN = 10_000
const DAY = 86_400_000

const fmtMan = (v) => `${Math.round((Number(v) || 0) / MAN).toLocaleString('ko-KR')}만원`
const agoText = (ms) => {
    if (!ms) return '기록 없음'
    const d = Math.floor((Date.now() - ms) / DAY)
    if (d <= 0) return '오늘'
    if (d < 30) return `${d}일 전`
    // Math.floor(30/30.44)는 0이라 '0개월 전'이 된다. 최소 1개월로 올린다.
    return `${Math.max(1, Math.round(d / 30.44))}개월 전`
}

const STAGE_COLOR = {
    '중단': '#9fa0a0', '보류': '#B45309', '초기 접촉': '#6B7280', '정보 파악': '#8a6b00',
    '견적 제출': '#8a6b00', '샘플 진행': '#2a9a5e', '단가 협의': '#2a9a5e',
    '발주 임박': '#1C6B3C', '거래 중': '#1C6B3C',
}
const RISK_COLOR = { '낮음': '#1C6B3C', '보통': '#B45309', '높음': '#B91C1C' }

const Section = ({ icon: Icon, title, items, color }) => {
    if (!items || items.length === 0) return null
    return (
        <div style={{ marginTop: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 }}>
                <Icon size={13} style={{ color }} />
                <b style={{ fontSize: 12, color: 'var(--text-primary)' }}>{title}</b>
            </div>
            <ul style={{ margin: 0, paddingLeft: 17, fontSize: 12.5, lineHeight: 1.65, color: 'var(--text-secondary)' }}>
                {items.map((t, i) => <li key={i}>{t}</li>)}
            </ul>
        </div>
    )
}

const ClientBriefing = ({ client, sales = [], activities = [], onClose }) => {
    // 주요 품목을 보여주므로 상세가 필요하다 (첫 화면에서는 받지 않는다 — DataContext)
    const { ensureSalesDetail } = useData()
    useEffect(() => { ensureSalesDetail() }, [ensureSalesDetail])

    const navigate = useNavigate()
    const [briefing, setBriefing] = useState(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState(null)

    /** 숫자는 여기서 계산한다 (모델에 맡기지 않는다) */
    const metrics = useMemo(() => {
        const now = Date.now()
        const m3 = now - 92 * DAY, m6 = now - 183 * DAY
        const yearStart = new Date(new Date().getFullYear(), 0, 1).getTime()

        const rows = sales
            .filter((s) => s.client_id === client.id)
            .map((s) => ({
                ms: new Date(s.sale_date || s.date || s.created_at).getTime(),
                amount: Number(s.total_amount ?? s.totalAmount ?? 0) || 0,
                item: s.item_name || '',
            }))
            .filter((s) => Number.isFinite(s.ms))

        const recent = rows.reduce((a, s) => (s.ms >= m3 ? a + s.amount : a), 0)
        const prev = rows.reduce((a, s) => (s.ms >= m6 && s.ms < m3 ? a + s.amount : a), 0)
        const thisYear = rows.reduce((a, s) => (s.ms >= yearStart ? a + s.amount : a), 0)
        const total = rows.reduce((a, s) => a + s.amount, 0)
        const lastSaleMs = rows.reduce((a, s) => Math.max(a, s.ms), 0)

        // 최근 1년 많이 산 품목
        const byItem = {}
        rows.filter((s) => s.ms >= now - 365 * DAY).forEach((s) => {
            if (!s.item) return
            byItem[s.item] = (byItem[s.item] || 0) + s.amount
        })
        const topItems = Object.entries(byItem).sort((a, b) => b[1] - a[1]).slice(0, 4)

        const acts = activities
            .filter((a) => (a.client_id || a.clientId) === client.id)
            .map((a) => ({
                date: String(a.activity_date || a.date || '').slice(0, 10),
                type: a.type || '',
                description: String(a.description || '').trim(),
                ms: new Date(a.activity_date || a.date).getTime(),
            }))
            .filter((a) => a.date)
            .sort((a, b) => a.date.localeCompare(b.date))

        const lastActMs = acts.length ? acts[acts.length - 1].ms : 0
        const changePct = prev > 0 ? Math.round((recent / prev - 1) * 100) : null

        return { rows, recent, prev, thisYear, total, lastSaleMs, topItems, acts, lastActMs, changePct }
    }, [client.id, sales, activities])

    const salesSummary = useMemo(() => {
        const m = metrics
        return [
            `올해 매출 ${fmtMan(m.thisYear)}`,
            `최근 3개월 ${fmtMan(m.recent)} / 그 전 3개월 ${fmtMan(m.prev)}`,
            `누적 ${fmtMan(m.total)}`,
            `마지막 거래 ${m.lastSaleMs ? agoText(m.lastSaleMs) : '없음'}`,
            `접촉 ${m.acts.length}회, 마지막 ${m.lastActMs ? agoText(m.lastActMs) : '없음'}`,
            m.topItems.length ? `주요 품목: ${m.topItems.map(([n]) => n).join(', ')}` : '',
        ].filter(Boolean).join(' / ')
    }, [metrics])

    const load = useCallback(async (force = false) => {
        if (metrics.acts.length === 0) return
        setLoading(true)
        setError(null)
        try {
            const b = await fetchBriefing(client, metrics.acts, salesSummary, { force })
            setBriefing(b)
        } catch (e) {
            setError(e.message || '정리하지 못했습니다.')
        } finally {
            setLoading(false)
        }
    }, [client, metrics.acts, salesSummary])

    useEffect(() => { load(false) }, [load])

    useEffect(() => {
        const onKey = (e) => { if (e.key === 'Escape') onClose() }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [onClose])

    const m = metrics

    return (
        <div
            onClick={onClose}
            style={{
                position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.4)',
                display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '4vh 12px', overflowY: 'auto',
            }}
        >
            <div className="win" onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 720 }}>
                <div className="win-title">
                    <span>{client.company}</span>
                    <span className="meta">거래처 브리핑</span>
                </div>

                <div className="toolbar">
                    <button className="tb-btn" onClick={() => load(true)} disabled={loading || m.acts.length === 0}>
                        {loading ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} 다시 정리
                    </button>
                    <button className="tb-btn" onClick={() => { onClose(); navigate(`/clients/${client.id}`) }}>
                        <ExternalLink size={13} /> 거래처 상세
                    </button>
                    <button className="tb-btn" onClick={onClose} style={{ marginLeft: 'auto' }}>
                        <X size={13} /> 닫기
                    </button>
                </div>

                {/* 1) 숫자 */}
                <div style={{
                    display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(118px, 1fr))', gap: 1,
                    background: 'var(--border)', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)',
                }}>
                    {[
                        { label: '올해 매출', value: fmtMan(m.thisYear) },
                        {
                            label: '최근 3개월', value: fmtMan(m.recent),
                            sub: m.changePct === null ? '' : `${m.changePct > 0 ? '+' : ''}${m.changePct}%`,
                            up: (m.changePct ?? 0) >= 0,
                        },
                        { label: '누적 매출', value: fmtMan(m.total) },
                        { label: '마지막 거래', value: m.lastSaleMs ? agoText(m.lastSaleMs) : '없음' },
                        { label: '접촉', value: `${m.acts.length}회`, sub: m.lastActMs ? agoText(m.lastActMs) : '' },
                    ].map((c) => (
                        <div key={c.label} style={{ background: 'var(--bg-card)', padding: '8px 10px' }}>
                            <div style={{ fontSize: 10.5, color: 'var(--text-secondary)' }}>{c.label}</div>
                            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>{c.value}</div>
                            {c.sub && (
                                <div style={{ fontSize: 10.5, color: c.up ? '#1C6B3C' : '#B91C1C', display: 'flex', alignItems: 'center', gap: 2 }}>
                                    {c.label === '최근 3개월' && (c.up ? <TrendingUp size={10} /> : <TrendingDown size={10} />)}
                                    {c.sub}
                                </div>
                            )}
                        </div>
                    ))}
                </div>

                {/* 담당자 — 만나러 가기 전에 누구를 찾아야 하는지 */}
                {(client.contact_person || client.phone) && (
                    <div style={{
                        padding: '8px 12px', fontSize: 12.5, borderBottom: '1px solid var(--border)',
                        display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
                    }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                            <User size={13} style={{ color: 'var(--text-muted)' }} />
                            <b>{client.contact_person}</b>
                            {client.contact_role && (
                                <span style={{ color: 'var(--text-secondary)' }}>{client.contact_role}</span>
                            )}
                        </span>
                        {client.phone ? (
                            // 휴대폰에서 누르면 바로 걸린다
                            <a href={`tel:${String(client.phone).replace(/[^0-9+]/g, '')}`}
                                style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--accent)', fontWeight: 600 }}>
                                <Phone size={12} /> {client.phone}
                            </a>
                        ) : (
                            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>전화번호 없음</span>
                        )}
                    </div>
                )}

                {m.topItems.length > 0 && (
                    <div style={{ padding: '8px 12px', fontSize: 12, color: 'var(--text-secondary)', borderBottom: '1px solid var(--border)' }}>
                        최근 1년 주요 품목: {m.topItems.map(([n, v]) => `${n} (${fmtMan(v)})`).join(' · ')}
                    </div>
                )}

                {/* 2) 정리 */}
                <div style={{ padding: 12 }}>
                    {m.acts.length === 0 ? (
                        <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)' }}>
                            활동 기록이 없어 정리할 내용이 없습니다.
                        </p>
                    ) : loading && !briefing ? (
                        <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                            <Loader2 size={14} className="animate-spin" /> 활동 기록 {m.acts.length}건을 읽는 중…
                        </p>
                    ) : error ? (
                        <p style={{ margin: 0, fontSize: 12.5, color: '#B45309' }}>
                            <AlertTriangle size={12} style={{ display: 'inline', verticalAlign: -2, marginRight: 4 }} />
                            {error} — 아래 원문은 그대로 보실 수 있습니다.
                        </p>
                    ) : briefing ? (
                        <>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
                                <span style={{
                                    fontSize: 11.5, fontWeight: 700, padding: '2px 8px', borderRadius: 10,
                                    color: '#fff', background: STAGE_COLOR[briefing.stage] || '#6B7280',
                                }}>
                                    {briefing.stage}
                                </span>
                                <span style={{ fontSize: 11.5, fontWeight: 600, color: RISK_COLOR[briefing.risk] }}>
                                    놓칠 위험 {briefing.risk}
                                </span>
                                {briefing.fromCache && (
                                    <span style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>(이전 정리 · 새 활동 없음)</span>
                                )}
                            </div>

                            {briefing.headline && (
                                <p style={{ margin: '0 0 6px', fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
                                    {briefing.headline}
                                </p>
                            )}
                            {briefing.summary && (
                                <p style={{ margin: 0, fontSize: 13, lineHeight: 1.7, color: 'var(--text-secondary)' }}>
                                    {briefing.summary}
                                </p>
                            )}

                            <Section icon={ListChecks} title="다음에 할 일" items={briefing.nextActions} color="#1C6B3C" />
                            <Section icon={AlertTriangle} title="걸림돌" items={briefing.blockers} color="#B91C1C" />
                            <Section icon={Package} title="따낼 물량" items={briefing.opportunity} color="#8a6b00" />
                            <Section icon={Swords} title="경쟁" items={briefing.competitors} color="#B45309" />
                            <Section icon={Info} title="기억할 것" items={briefing.keyFacts} color="#6B7280" />

                            <p style={{ margin: '10px 0 0', fontSize: 11, color: 'var(--text-muted)' }}>
                                ※ 위 정리는 활동 기록 {briefing.activityCount || m.acts.length}건을 읽어 만든 것입니다.
                                숫자는 아래 원문에서 확인하세요.
                            </p>
                        </>
                    ) : null}
                </div>

                {/* 3) 원문 */}
                {m.acts.length > 0 && (
                    <>
                        <div className="filterbar"><b style={{ fontSize: 12 }}>활동 기록 {m.acts.length}건</b></div>
                        <div style={{ maxHeight: 340, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {[...m.acts].reverse().map((a, i) => (
                                <div key={i} style={{ borderLeft: '3px solid var(--border)', paddingLeft: 9 }}>
                                    <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-primary)' }}>
                                        {a.date} <span style={{ fontWeight: 500, color: 'var(--text-secondary)' }}>{a.type}</span>
                                    </div>
                                    <div style={{ fontSize: 12.5, lineHeight: 1.65, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap' }}>
                                        {a.description || '(내용 없음)'}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </>
                )}
            </div>
        </div>
    )
}

export default ClientBriefing
