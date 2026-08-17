import React, { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, TrendingDown, PhoneOff, Sprout, Target, ChevronRight, RotateCcw, Flame, CheckCircle2, EyeOff, Undo2, GitBranch } from 'lucide-react'
import toast from 'react-hot-toast'
import { getCoachOverrides, toggleCoachOverride, clearCoachOverride, overrideFor } from '../utils/coachOverrides'
import { createDealFromCoach } from '../services/dealSync'
import { getAllCachedStages } from '../services/clientBriefingService'
import ClientBriefing from './ClientBriefing'

/**
 * 영업 코치 — 오늘 누구부터 챙길지 정해 준다.
 *
 * 세 갈래를 **한 화면에서** 본다. 하나라도 빠지면 그쪽 영업이 통째로 잊힌다.
 *   기존관리 — 이미 사는 곳이 줄고 있는지, 크는데 방치되고 있는지
 *   복원영업 — 끊긴 곳을 되살리는 중인지, 아직 손도 못 댔는지
 *   신규영업 — 첫 거래를 향해 가고 있는지, 식었는지, 터졌는지
 *
 * '내 담당'은 `clients.sales_rep`으로 판단한다. 미팅·통화한 곳은 활동을 넣는
 * 순간 담당이 자동으로 채워지므로(DataContext.addActivity), 신규·복원 영업
 * 대상도 빠지지 않는다. 예전에는 활동만 있고 담당이 비어 있어 11곳이 새고 있었다.
 *
 * 계산은 전부 규칙 기반이다. 근거 숫자를 그대로 보여줄 수 있어야 믿고 움직일 수
 * 있는데, 문장을 생성하는 모델은 숫자를 지어낸다. 판단은 코드가 하고 사람이 검증한다.
 */

const MAN = 10_000
const DAY = 86_400_000

/** 단절 판정 — KPI(CHURN_RULE)와 같은 눈높이 */
const CHURN_GAP_DAYS = 183          // 6개월 무거래
const CHURN_MIN_HISTORY = 1000 * MAN // 과거 누적 1천만원

const fmtMan = (v) => `${Math.round(v / MAN).toLocaleString('ko-KR')}만원`
const agoText = (ms) => {
    if (!ms) return '기록 없음'
    const d = Math.floor((Date.now() - ms) / DAY)
    if (d <= 0) return '오늘'
    if (d < 30) return `${d}일 전`
    // Math.floor(30/30.44)는 0이라 '0개월 전'이 된다. 최소 1개월로 올린다.
    return `${Math.max(1, Math.round(d / 30.44))}개월 전`
}

const AREAS = [
    {
        key: 'manage', label: '기존 관리',
        groups: [
            {
                key: 'declining', title: '매출이 꺾인 곳', icon: TrendingDown, color: '#B91C1C', bg: '#FEE2E2',
                hint: '최근 3개월이 그 전 3개월보다 30% 넘게 줄었습니다. 이유부터 확인하세요.',
            },
            {
                key: 'growingIgnored', title: '크는데 방치된 곳', icon: Sprout, color: '#1C6B3C', bg: '#E3F5EA',
                hint: '매출이 늘고 있는데 90일간 접점이 없습니다. 지금 만나면 더 늘릴 수 있습니다.',
            },
        ],
    },
    {
        key: 'restore', label: '복원 영업',
        groups: [
            {
                key: 'restoreHot', title: '되살리는 중', icon: Flame, color: '#B45309', bg: '#FEF3C7',
                hint: '끊겼던 곳에 최근 접촉했습니다. 첫 재주문까지 밀어붙이세요.',
            },
            {
                key: 'restoreCold', title: '아직 손 못 댄 곳', icon: PhoneOff, color: '#B91C1C', bg: '#FEE2E2',
                hint: '과거 실적이 있는데 6개월 넘게 거래도 접촉도 없습니다.',
            },
            {
                key: 'restoreWon', title: '되살아난 곳', icon: RotateCcw, color: '#1C6B3C', bg: '#E3F5EA',
                hint: '끊겼다가 올해 다시 거래가 붙었습니다. 굳히세요.',
            },
        ],
    },
    {
        key: 'new', label: '신규 영업',
        groups: [
            {
                key: 'newHot', title: '진행 중', icon: Target, color: '#1D4ED8', bg: '#DBEAFE',
                hint: '방문했지만 아직 첫 거래가 없습니다. 무엇이 막고 있는지 확인하세요.',
            },
            {
                key: 'newCold', title: '식은 곳', icon: PhoneOff, color: '#B45309', bg: '#FEF3C7',
                hint: '접촉했다가 3개월 넘게 끊겼습니다. 되살릴지 접을지 정하세요.',
            },
            {
                key: 'newWon', title: '첫 거래 성사', icon: CheckCircle2, color: '#1C6B3C', bg: '#E3F5EA',
                hint: '올해 처음 거래가 붙었습니다. 두 번째 주문으로 이어가세요.',
            },
        ],
    },
]

const SalesCoach = ({ sales = [], clients = [], activities = [], salesRepName = null }) => {
    const navigate = useNavigate()
    const [mineOnly, setMineOnly] = useState(true)
    const [openArea, setOpenArea] = useState('manage')
    const [openGroup, setOpenGroup] = useState('declining')
    const [overrides, setOverrides] = useState(() => getCoachOverrides())
    const [showHidden, setShowHidden] = useState(false)
    // 거래처를 누르면 브리핑을 연다. 활동 기록을 읽어 정리한 한 장이다.
    const [briefingClient, setBriefingClient] = useState(null)
    // 이미 읽어둔 브리핑의 단계만 배지로 보여준다 (여기서 새로 부르지 않는다 — 목록이 느려진다)
    const [stages, setStages] = useState(() => getAllCachedStages())

    const result = useMemo(() => {
        const now = Date.now()
        const m3 = now - 92 * DAY
        const m6 = now - CHURN_GAP_DAYS * DAY
        const yearStart = new Date(new Date().getFullYear(), 0, 1).getTime()

        // 거래처별로 매출·활동을 한 번에 모은다
        const acc = new Map()
        const ensure = (id) => {
            if (!acc.has(id)) acc.set(id, { sales: [], lastActivityMs: 0, firstActivityMs: 0, actCount: 0, actCount90: 0 })
            return acc.get(id)
        }

        sales.forEach((s) => {
            if (!s.client_id) return
            const ms = new Date(s.sale_date || s.date || s.created_at).getTime()
            if (!Number.isFinite(ms)) return
            ensure(s.client_id).sales.push({ ms, amount: Number(s.total_amount ?? s.totalAmount ?? 0) || 0 })
        })

        activities.forEach((a) => {
            const id = a.client_id || a.clientId
            if (!id) return
            const ms = new Date(a.activity_date || a.date).getTime()
            if (!Number.isFinite(ms)) return
            const e = ensure(id)
            if (ms > e.lastActivityMs) e.lastActivityMs = ms
            if (!e.firstActivityMs || ms < e.firstActivityMs) e.firstActivityMs = ms
            e.actCount += 1
            if (ms >= now - 90 * DAY) e.actCount90 += 1
        })

        const groups = {
            declining: [], growingIgnored: [],
            restoreHot: [], restoreCold: [], restoreWon: [],
            newHot: [], newCold: [], newWon: [],
        }
        const hidden = []

        clients.forEach((c) => {
            const e = acc.get(c.id)
            if (!e) return

            // 담당이 아닌 곳은 어느 갈래에도 넣지 않는다.
            // 미팅·통화하면 활동을 넣는 순간 담당이 채워지므로(addActivity),
            // 여기서 걸러도 정작 공들이는 곳이 빠지지 않는다.
            if (mineOnly && salesRepName && c.sales_rep !== salesRepName) return

            const ov = overrideFor(overrides, c)
            if (ov?.kind === 'hide') { hidden.push({ id: c.id, name: c.company, why: ov.why }); return }

            const recent = e.sales.reduce((a, s) => (s.ms >= m3 ? a + s.amount : a), 0)
            const prev = e.sales.reduce((a, s) => (s.ms >= m6 && s.ms < m3 ? a + s.amount : a), 0)
            const totalEver = e.sales.reduce((a, s) => a + s.amount, 0)
            const lastSaleMs = e.sales.reduce((a, s) => Math.max(a, s.ms), 0)
            const firstSaleMs = e.sales.length ? e.sales.reduce((a, s) => Math.min(a, s.ms), Infinity) : 0
            const thisYear = e.sales.reduce((a, s) => (s.ms >= yearStart ? a + s.amount : a), 0)
            const touchedRecently = e.lastActivityMs >= m3

            const row = {
                id: c.id, name: c.company, recent, prev, totalEver, thisYear,
                lastSaleMs, lastActivityMs: e.lastActivityMs, actCount90: e.actCount90,
                unassigned: !c.sales_rep,
            }

            // ---------- 사람이 알려준 사실이 규칙보다 우선한다 ----------
            // CRM에 과거 실적이 없어도 실제로는 예전 거래처인 경우가 있다.
            if (ov?.kind === 'restored') {
                row.score = thisYear || totalEver
                row.note = ov.why
                groups.restoreWon.push(row)
                return
            }
            if (ov?.kind === 'existing') {
                // 신규가 아니라 기존 거래처. 기존관리 규칙만 태운다.
                if (prev >= 500 * MAN && recent < prev * 0.7) {
                    row.drop = Math.round((1 - recent / prev) * 100)
                    row.score = prev - recent
                    groups.declining.push(row)
                }
                return
            }

            // ---------- 매출 이력이 없는 곳 = 신규 영업 ----------
            if (totalEver === 0) {
                if (!e.lastActivityMs) return                 // 접점도 매출도 없으면 대상이 아니다

                // 진행이 많이 된 곳을 위로 올린다.
                // 접점 횟수가 곧 진행도다(여러 번 만났다 = 얘기가 되고 있다).
                // 최근성은 살아있는 건인지를 가르고, 총 접촉 기간은 공들인 정도다.
                const daysSince = Math.max(0, Math.floor((now - e.lastActivityMs) / DAY))
                const spanDays = e.firstActivityMs ? Math.floor((e.lastActivityMs - e.firstActivityMs) / DAY) : 0
                row.actTotal = e.actCount
                row.spanDays = spanDays
                row.score =
                    e.actCount * 100 +                        // 만난 횟수 = 진행도
                    Math.max(0, 90 - daysSince) +             // 최근일수록 가산
                    Math.min(60, Math.floor(spanDays / 7))    // 오래 공들인 건 소폭 가산

                if (touchedRecently) groups.newHot.push(row)
                else groups.newCold.push(row)
                return
            }

            // ---------- 올해 첫 거래가 붙은 곳 ----------
            if (firstSaleMs >= yearStart) {
                row.score = thisYear
                groups.newWon.push(row)
                return
            }

            // ---------- 끊겼던 곳이 올해 되살아났는지 ----------
            // 올해 거래가 있고, 그 전에 6개월 이상 공백이 있었던 경우
            if (thisYear > 0 && totalEver >= CHURN_MIN_HISTORY) {
                const sorted = [...e.sales].sort((a, b) => a.ms - b.ms)
                let hadGap = false
                for (let i = 1; i < sorted.length; i++) {
                    if (sorted[i].ms - sorted[i - 1].ms >= CHURN_GAP_DAYS * DAY && sorted[i].ms >= yearStart) {
                        hadGap = true
                        break
                    }
                }
                if (hadGap) {
                    row.score = thisYear
                    groups.restoreWon.push(row)
                    return
                }
            }

            // ---------- 단절 (6개월 무거래 + 과거 실적) ----------
            if (lastSaleMs < m6 && totalEver >= CHURN_MIN_HISTORY) {
                row.score = totalEver
                if (touchedRecently) groups.restoreHot.push(row)
                else groups.restoreCold.push(row)
                return
            }

            // ---------- 기존 관리 ----------
            if (prev >= 500 * MAN && recent < prev * 0.7) {
                row.drop = Math.round((1 - recent / prev) * 100)
                row.score = prev - recent
                groups.declining.push(row)
                return
            }
            if (recent > 0 && prev > 0 && recent > prev * 1.2 && e.actCount90 === 0) {
                row.gain = Math.round((recent / prev - 1) * 100)
                row.score = recent - prev
                groups.growingIgnored.push(row)
            }
        })

        Object.values(groups).forEach((g) => g.sort((a, b) => b.score - a.score))
        return { groups, hidden }
    }, [sales, clients, activities, mineOnly, salesRepName, overrides])

    const { groups: G, hidden } = result
    const areaCount = (area) => area.groups.reduce((a, g) => a + G[g.key].length, 0)

    const hide = (row) => setOverrides(toggleCoachOverride(row.id, 'hide', '화면에서 제외'))

    /**
     * 코치가 잡아 준 곳을 곧장 파이프라인에 올린다.
     *
     * 코치는 '지금 챙길 곳'을 찾아 주는데, 거기서 파이프라인으로 옮기려면
     * 이름·금액을 손으로 다시 적어야 했다. 그 한 단계가 실제로는 안 하게 되는
     * 지점이다 — 그래서 여기서 바로 만든다.
     */
    const toDeal = async (row, groupLabel) => {
        try {
            await createDealFromCoach({
                clientId: row.id,
                clientName: row.name,
                title: groupLabel || '영업 기회',
                // 코치 행에는 'amount'가 없다. 최근 3개월 실적을 기대값 출발점으로 쓴다.
                amount: row.recent || row.thisYear || 0,
                owner: salesRepName || null,
                note: `영업 코치 '${groupLabel}'에서 올림`,
            })
            toast.success(`'${row.name}'을(를) 파이프라인에 올렸습니다.`)
        } catch (e) {
            toast.error(`파이프라인에 올리지 못했습니다: ${e.message}`)
        }
    }
    const unhide = (id) => setOverrides(clearCoachOverride(id))
    const total = AREAS.reduce((a, ar) => a + areaCount(ar), 0)

    const describe = (key, r) => {
        switch (key) {
            case 'declining': return `최근 3개월 ${fmtMan(r.recent)} · 그 전 ${fmtMan(r.prev)} (${r.drop}% 감소)`
            case 'growingIgnored': return `최근 3개월 ${fmtMan(r.recent)} (+${r.gain}%) · 90일간 방문 없음`
            case 'restoreHot': return `마지막 거래 ${agoText(r.lastSaleMs)} · 최근 접촉 ${agoText(r.lastActivityMs)} · 누적 ${fmtMan(r.totalEver)}`
            case 'restoreCold': return `마지막 거래 ${agoText(r.lastSaleMs)} · 접촉도 ${agoText(r.lastActivityMs)} · 누적 ${fmtMan(r.totalEver)}`
            case 'restoreWon': return r.note ? `${r.note} · 올해 ${fmtMan(r.thisYear)}` : `올해 ${fmtMan(r.thisYear)} 재개 · 과거 누적 ${fmtMan(r.totalEver)}`
            case 'newHot': return `접촉 ${r.actTotal}회 · 최근 ${agoText(r.lastActivityMs)}${r.spanDays > 14 ? ` · ${Math.round(r.spanDays / 30)}개월째` : ''}`
            case 'newCold': return `접촉 ${r.actTotal}회 · 마지막 ${agoText(r.lastActivityMs)}`
            case 'newWon': return `올해 첫 거래 ${fmtMan(r.thisYear)}`
            default: return ''
        }
    }

    return (
        <div className="win">
            <div className="win-title">
                <span>영업 코치</span>
                <span className="meta">{total > 0 ? `챙겨야 할 거래처 ${total}곳` : '급한 건 없습니다'}</span>
            </div>

            {salesRepName && (
                <div className="filterbar" style={{ gap: 8 }}>
                    {/* tap-box: 모바일에서 누르는 자리를 44px로 넓힌다 (index.css) */}
                    <label className="tap-box" style={{ gap: 5, fontSize: 13, padding: '0 6px' }}>
                        <input type="checkbox" checked={mineOnly} onChange={(e) => setMineOnly(e.target.checked)} />
                        내 담당만
                    </label>
                    {hidden.length > 0 && (
                        <button
                            className={`tb-btn${showHidden ? ' primary' : ''}`}
                            onClick={() => setShowHidden((v) => !v)}
                            title="코치에서 뺀 거래처"
                        >
                            <EyeOff size={13} /> 제외 {hidden.length}
                        </button>
                    )}
                </div>
            )}

            {showHidden && (
                <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)' }}>
                    <p style={{ margin: '0 0 6px', fontSize: 11, color: 'var(--text-secondary)' }}>
                        코치에서 뺀 거래처입니다. 되돌리려면 화살표를 누르세요.
                    </p>
                    <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                        {hidden.map((h) => (
                            <li key={h.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 0', fontSize: 12 }}>
                                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {h.name}
                                </span>
                                <button className="rowbtn" onClick={() => unhide(h.id)} title="다시 넣기">
                                    <Undo2 size={12} />
                                </button>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {AREAS.map((area) => {
                    const n = areaCount(area)
                    const isOpen = openArea === area.key
                    return (
                        <div key={area.key}>
                            <button
                                onClick={() => setOpenArea(isOpen ? null : area.key)}
                                style={{
                                    width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '6px 2px',
                                    background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left',
                                    borderBottom: '2px solid var(--border)',
                                }}
                            >
                                <b style={{ fontSize: 13, color: 'var(--text-primary)' }}>{area.label}</b>
                                <span style={{ fontSize: 12, fontWeight: 700, color: n ? 'var(--accent)' : 'var(--text-muted)' }}>
                                    {n}
                                </span>
                                <ChevronRight size={14} style={{ marginLeft: 'auto', opacity: 0.5, transform: isOpen ? 'rotate(90deg)' : 'none' }} />
                            </button>

                            {isOpen && area.groups.map((g) => {
                                const list = G[g.key]
                                const Icon = g.icon
                                const gOpen = openGroup === g.key
                                return (
                                    <div key={g.key} style={{ marginTop: 6, border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
                                        <button
                                            onClick={() => setOpenGroup(gOpen ? null : g.key)}
                                            style={{
                                                width: '100%', display: 'flex', alignItems: 'center', gap: 7, padding: '7px 9px',
                                                background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left',
                                            }}
                                        >
                                            <span style={{ background: g.bg, color: g.color, padding: 3, borderRadius: 'var(--radius)', display: 'flex' }}>
                                                <Icon size={13} />
                                            </span>
                                            <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-primary)' }}>{g.title}</span>
                                            <span style={{
                                                fontSize: 11.5, fontWeight: 700, color: list.length ? g.color : 'var(--text-muted)',
                                                background: list.length ? g.bg : 'transparent', padding: '1px 6px', borderRadius: 10,
                                            }}>
                                                {list.length}
                                            </span>
                                            <ChevronRight size={13} style={{ marginLeft: 'auto', opacity: 0.45, transform: gOpen ? 'rotate(90deg)' : 'none' }} />
                                        </button>

                                        {gOpen && (
                                            <div style={{ borderTop: '1px solid var(--border)', padding: '7px 9px' }}>
                                                <p style={{ margin: '0 0 6px', fontSize: 11, color: 'var(--text-secondary)' }}>{g.hint}</p>
                                                {list.length === 0 ? (
                                                    <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>해당하는 거래처가 없습니다.</p>
                                                ) : (
                                                    <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                                                        {list.slice(0, 8).map((r) => (
                                                            <li key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                                                <button
                                                                    onClick={() => setBriefingClient(clients.find((c) => c.id === r.id))}
                                                                    style={{
                                                                        width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                                                                        padding: '6px 0', background: 'transparent', border: 'none',
                                                                        borderTop: '1px solid var(--border)', cursor: 'pointer', textAlign: 'left',
                                                                    }}
                                                                >
                                                                    <span style={{ flex: 1, minWidth: 0 }}>
                                                                        <span style={{
                                                                            display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text-primary)',
                                                                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                                                        }}>
                                                                            {r.name}
                                                                            {stages[r.id] && (
                                                                                <span style={{
                                                                                    marginLeft: 5, fontSize: 10, fontWeight: 600,
                                                                                    padding: '1px 5px', borderRadius: 8,
                                                                                    background: 'var(--bg-card-hover)', color: 'var(--text-secondary)',
                                                                                }}>
                                                                                    {stages[r.id]}
                                                                                </span>
                                                                            )}
                                                                            {r.unassigned && (
                                                                                <span style={{ marginLeft: 5, fontSize: 10, fontWeight: 500, color: '#B45309' }}>
                                                                                    담당 미지정
                                                                                </span>
                                                                            )}
                                                                        </span>
                                                                        <span style={{ display: 'block', fontSize: 11, color: 'var(--text-secondary)' }}>
                                                                            {describe(g.key, r)}
                                                                        </span>
                                                                    </span>
                                                                    <ChevronRight size={13} style={{ opacity: 0.4, flexShrink: 0 }} />
                                                                </button>
                                                                <button
                                                                    className="rowbtn"
                                                                    onClick={(ev) => { ev.stopPropagation(); toDeal(r, g.title) }}
                                                                    title="파이프라인에 영업 기회로 올리기"
                                                                    style={{ flexShrink: 0 }}
                                                                >
                                                                    <GitBranch size={12} />
                                                                </button>
                                                                <button
                                                                    className="rowbtn"
                                                                    onClick={(ev) => { ev.stopPropagation(); hide(r) }}
                                                                    title="이 거래처를 코치에서 빼기"
                                                                    style={{ flexShrink: 0 }}
                                                                >
                                                                    <EyeOff size={12} />
                                                                </button>
                                                            </li>
                                                        ))}
                                                        {list.length > 8 && (
                                                            <li style={{ paddingTop: 5, fontSize: 11, color: 'var(--text-muted)' }}>
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
                    )
                })}
            </div>

            {briefingClient && (
                <ClientBriefing
                    client={briefingClient}
                    sales={sales}
                    activities={activities}
                    onClose={() => { setBriefingClient(null); setStages(getAllCachedStages()) }}
                />
            )}

            {sales.length === 0 && (
                <p style={{ padding: '0 12px 12px', margin: 0, fontSize: 12, color: '#B45309' }}>
                    <AlertTriangle size={12} style={{ display: 'inline', verticalAlign: -2, marginRight: 4 }} />
                    매출 자료를 불러오는 중입니다.
                </p>
            )}
        </div>
    )
}

export default SalesCoach
