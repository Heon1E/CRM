import React, { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, TrendingDown, PhoneOff, Sprout, Target, ChevronRight } from 'lucide-react'

/**
 * 영업 코치 — 오늘 누구부터 챙길지 정해 준다.
 *
 * 예전 'AI Sales Coach'는 "최근 7일 활동이 N건입니다" 한 줄이 전부라 쓸모가 없었다.
 * 여기서는 거래처별로 **매출 흐름과 접점 이력을 함께** 보고 우선순위를 매긴다.
 *
 * 계산은 전부 규칙 기반이다. 근거 숫자를 그대로 보여줄 수 있어야 믿고 움직일 수 있는데,
 * 문장을 생성하는 모델은 숫자를 지어낼 수 있다. 판단은 코드가 하고 사람이 검증한다.
 *
 * 네 가지로 나눈다 (위에 있을수록 급하다):
 *   1) 매출이 꺾인 곳   — 돈이 실제로 빠지고 있다
 *   2) 연락이 끊긴 곳   — 과거 실적이 있는데 최근 거래도 접점도 없다
 *   3) 크는데 방치된 곳 — 늘고 있는데 최근 방문이 없다
 *   4) 아직 매출이 없는 곳 — 방문은 했는데 첫 거래가 없다
 */

const MAN = 10_000
const DAY = 86_400_000

/** 최근 N개월 매출 합 (오늘 기준) */
const sumSince = (list, fromMs) =>
    list.reduce((a, s) => (s.ms >= fromMs ? a + s.amount : a), 0)

const fmtMan = (v) => `${Math.round(v / MAN).toLocaleString('ko-KR')}만원`
const fmtMonths = (ms) => {
    const m = Math.floor((Date.now() - ms) / DAY / 30.44)
    return m <= 0 ? '이번 달' : `${m}개월 전`
}

const GROUPS = [
    {
        key: 'declining', title: '매출이 꺾인 곳', icon: TrendingDown,
        color: '#B91C1C', bg: '#FEE2E2',
        hint: '최근 3개월이 그 전 3개월보다 30% 넘게 줄었습니다. 이유부터 확인하세요.',
    },
    {
        key: 'silent', title: '연락이 끊긴 곳', icon: PhoneOff,
        color: '#B45309', bg: '#FEF3C7',
        hint: '과거 실적이 있는데 최근 거래도 방문도 없습니다. 살아 있는지 확인이 필요합니다.',
    },
    {
        key: 'growing', title: '크는데 방치된 곳', icon: Sprout,
        color: '#1C6B3C', bg: '#E3F5EA',
        hint: '매출이 늘고 있는데 최근 접점이 없습니다. 지금 만나면 더 늘릴 수 있습니다.',
    },
    {
        key: 'prospect', title: '아직 첫 거래가 없는 곳', icon: Target,
        color: '#1D4ED8', bg: '#DBEAFE',
        hint: '방문은 했는데 매출이 아직 없습니다. 무엇이 막고 있는지 확인하세요.',
    },
]

const SalesCoach = ({ sales = [], clients = [], activities = [], salesRepName = null, mineOnly: initialMine = true }) => {
    const navigate = useNavigate()
    const [mineOnly, setMineOnly] = useState(initialMine)
    const [open, setOpen] = useState('declining')

    const result = useMemo(() => {
        const now = Date.now()
        const m3 = now - 92 * DAY
        const m6 = now - 183 * DAY
        const m12 = now - 365 * DAY

        // 거래처별로 매출과 활동을 한 번에 모은다
        const byClient = new Map()
        const ensure = (id) => {
            if (!byClient.has(id)) byClient.set(id, { sales: [], lastActivityMs: 0, activityCount90: 0 })
            return byClient.get(id)
        }

        sales.forEach((s) => {
            const id = s.client_id
            if (!id) return
            const ms = new Date(s.sale_date || s.date || s.created_at).getTime()
            if (!Number.isFinite(ms)) return
            ensure(id).sales.push({ ms, amount: Number(s.total_amount ?? s.totalAmount ?? 0) || 0 })
        })

        activities.forEach((a) => {
            const id = a.client_id || a.clientId
            if (!id) return
            const ms = new Date(a.activity_date || a.date).getTime()
            if (!Number.isFinite(ms)) return
            const e = ensure(id)
            if (ms > e.lastActivityMs) e.lastActivityMs = ms
            if (ms >= now - 90 * DAY) e.activityCount90 += 1
        })

        const groups = { declining: [], silent: [], growing: [], prospect: [] }

        clients.forEach((c) => {
            if (mineOnly && salesRepName && c.sales_rep !== salesRepName) return

            const e = byClient.get(c.id)
            if (!e) return

            const recent = sumSince(e.sales, m3)
            const prev = e.sales.reduce((a, s) => (s.ms >= m6 && s.ms < m3 ? a + s.amount : a), 0)
            const year = sumSince(e.sales, m12)
            const lastSaleMs = e.sales.reduce((a, s) => Math.max(a, s.ms), 0)
            const totalEver = e.sales.reduce((a, s) => a + s.amount, 0)

            const row = {
                id: c.id, name: c.company, recent, prev, year, totalEver,
                lastSaleMs, lastActivityMs: e.lastActivityMs, activityCount90: e.activityCount90,
            }

            // 1) 매출이 꺾인 곳 — 규모가 있어야 의미가 있다 (직전 3개월 500만원 이상)
            if (prev >= 500 * MAN && recent < prev * 0.7) {
                row.drop = Math.round((1 - recent / prev) * 100)
                row.score = prev - recent            // 빠진 금액이 큰 순
                groups.declining.push(row)
                return
            }

            // 2) 연락이 끊긴 곳 — 과거 1천만원 이상 실적 + 6개월 무거래 + 3개월 무접점
            //    (KPI 단절 기준과 같은 눈높이: 소액 단발 거래처는 제외)
            if (totalEver >= 1000 * MAN && lastSaleMs > 0 && lastSaleMs < m6 && e.lastActivityMs < now - 90 * DAY) {
                row.score = totalEver
                groups.silent.push(row)
                return
            }

            // 3) 크는데 방치된 곳 — 최근 3개월이 그 전보다 20% 이상 늘었는데 90일간 접점 없음
            if (recent > 0 && prev > 0 && recent > prev * 1.2 && e.activityCount90 === 0) {
                row.gain = Math.round((recent / prev - 1) * 100)
                row.score = recent - prev
                groups.growing.push(row)
                return
            }

            // 4) 아직 첫 거래가 없는 곳 — 최근 6개월 안에 방문했는데 매출 이력이 없다
            if (totalEver === 0 && e.lastActivityMs >= m6) {
                row.score = e.lastActivityMs
                groups.prospect.push(row)
            }
        })

        Object.values(groups).forEach((g) => g.sort((a, b) => b.score - a.score))
        return groups
    }, [sales, clients, activities, mineOnly, salesRepName])

    const total = Object.values(result).reduce((a, g) => a + g.length, 0)

    const describe = (key, r) => {
        if (key === 'declining') return `최근 3개월 ${fmtMan(r.recent)} · 그 전 ${fmtMan(r.prev)} (${r.drop}% 감소)`
        if (key === 'silent') return `마지막 거래 ${fmtMonths(r.lastSaleMs)} · 누적 ${fmtMan(r.totalEver)}`
        if (key === 'growing') return `최근 3개월 ${fmtMan(r.recent)} (+${r.gain}%) · 90일간 방문 없음`
        return `마지막 방문 ${fmtMonths(r.lastActivityMs)} · 아직 매출 없음`
    }

    return (
        <div className="win">
            <div className="win-title">
                <span>영업 코치</span>
                <span className="meta">
                    {total > 0 ? `챙겨야 할 거래처 ${total}곳` : '급한 건 없습니다'}
                </span>
            </div>

            {salesRepName && (
                <div className="filterbar" style={{ gap: 8 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13 }}>
                        <input type="checkbox" checked={mineOnly} onChange={(e) => setMineOnly(e.target.checked)} />
                        내 담당만
                    </label>
                </div>
            )}

            <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {GROUPS.map((g) => {
                    const list = result[g.key]
                    const Icon = g.icon
                    const isOpen = open === g.key
                    return (
                        <div key={g.key} style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
                            <button
                                onClick={() => setOpen(isOpen ? null : g.key)}
                                style={{
                                    width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                                    padding: '8px 10px', background: 'transparent', border: 'none',
                                    cursor: 'pointer', textAlign: 'left',
                                }}
                            >
                                <span style={{ background: g.bg, color: g.color, padding: 4, borderRadius: 'var(--radius)', display: 'flex' }}>
                                    <Icon size={14} />
                                </span>
                                <b style={{ fontSize: 13, color: 'var(--text-primary)' }}>{g.title}</b>
                                <span style={{
                                    fontSize: 12, fontWeight: 700, color: list.length ? g.color : 'var(--text-muted)',
                                    background: list.length ? g.bg : 'transparent', padding: '1px 7px', borderRadius: 10,
                                }}>
                                    {list.length}
                                </span>
                                <ChevronRight
                                    size={14}
                                    style={{ marginLeft: 'auto', opacity: 0.5, transform: isOpen ? 'rotate(90deg)' : 'none' }}
                                />
                            </button>

                            {isOpen && (
                                <div style={{ borderTop: '1px solid var(--border)', padding: '8px 10px' }}>
                                    <p style={{ margin: '0 0 8px', fontSize: 11, color: 'var(--text-secondary)' }}>{g.hint}</p>
                                    {list.length === 0 ? (
                                        <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>해당하는 거래처가 없습니다.</p>
                                    ) : (
                                        <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                                            {list.slice(0, 8).map((r) => (
                                                <li key={r.id}>
                                                    <button
                                                        onClick={() => navigate(`/clients/${r.id}`)}
                                                        style={{
                                                            width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                                                            padding: '6px 0', background: 'transparent', border: 'none',
                                                            borderTop: '1px solid var(--border-light, var(--border))',
                                                            cursor: 'pointer', textAlign: 'left',
                                                        }}
                                                    >
                                                        <span style={{ flex: 1, minWidth: 0 }}>
                                                            <span style={{
                                                                display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text-primary)',
                                                                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                                            }}>
                                                                {r.name}
                                                            </span>
                                                            <span style={{ display: 'block', fontSize: 11, color: 'var(--text-secondary)' }}>
                                                                {describe(g.key, r)}
                                                            </span>
                                                        </span>
                                                        <ChevronRight size={13} style={{ opacity: 0.4, flexShrink: 0 }} />
                                                    </button>
                                                </li>
                                            ))}
                                            {list.length > 8 && (
                                                <li style={{ paddingTop: 6, fontSize: 11, color: 'var(--text-muted)' }}>
                                                    … 외 {list.length - 8}곳
                                                </li>
                                            )}
                                        </ul>
                                    )}
                                </div>
                            )}
                        </div>
                    )
                })}
            </div>

            {sales.length === 0 && (
                <p style={{ padding: '0 12px 12px', margin: 0, fontSize: 12, color: '#B45309' }}>
                    <AlertTriangle size={12} style={{ display: 'inline', verticalAlign: -2, marginRight: 4 }} />
                    매출 자료를 불러오지 못했습니다. 새로고침해 주세요.
                </p>
            )}
        </div>
    )
}

export default SalesCoach
