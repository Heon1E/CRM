import React, { useState, useMemo, useEffect } from 'react'
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
    Cell, ReferenceLine, ResponsiveContainer
} from 'recharts'
import { Target, TrendingUp, Users, UserPlus, MapPin, FileWarning } from 'lucide-react'
import { useData } from '../contexts/DataContext'
import { useI18n } from '../contexts/I18nContext'
import { getKpiExclusions, toggleKpiExclusion, isExcludedFrom, KPI_EXCLUSION_KINDS, getKpiManualInputs, setKpiManualInput } from '../utils/kpiCategories'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function getISOWeekNumber(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7))
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
    return Math.round((d - yearStart) / (7 * 24 * 60 * 60 * 1000)) + 1
}

const totalWeeks = 52

// ---------------------------------------------------------------------------
// 공식 KPI 기준 (2026년간 KPI 표)
// ---------------------------------------------------------------------------

/**
 * 등급 구간. 기준표의 헤더와 동일하다.
 *   탁월 120~ / 우수 110~ / 양호(계획) 100~ / 보통 90~ / 미흡 80~
 *
 * [수정] 예전에는 S≥110 / A≥100 / B≥80 / C≥60 으로 되어 있어 등급이
 * 한 칸씩 후하게 나왔다. 110%면 기준표상 '우수'인데 '탁월'로 표시됐다.
 */
function getGradeInfo(percent) {
    const p = Number(percent) || 0
    if (p >= 120) return { grade: '탁월', color: '#6D28D9', barColor: '#8B5CF6', bgColor: '#EDE9FE' }
    if (p >= 110) return { grade: '우수', color: '#1D4ED8', barColor: '#3B82F6', bgColor: '#DBEAFE' }
    if (p >= 100) return { grade: '양호', color: '#1C6B3C', barColor: '#22A05B', bgColor: '#E3F5EA' }
    if (p >= 90) return { grade: '보통', color: '#B45309', barColor: '#F59E0B', bgColor: '#FEF3C7' }
    return { grade: '미흡', color: '#B91C1C', barColor: '#EF4444', bgColor: '#FEE2E2' }
}

/**
 * 기준표의 구간을 그대로 옮긴 것. [기준값, 환산%] 를 높은 순으로 둔다.
 * 값이 어느 구간 이상이면 그 구간의 환산율을 준다.
 *
 * 기준이 바뀌면 이 표만 고치면 된다.
 */
/**
 * 2026년 경영계획 목표 매출 (억원).
 *
 * KPI 카드에서 직접 입력하면 그 값이 우선한다. 다만 입력값은 브라우저
 * localStorage에 저장되므로 PC와 휴대폰에 따로 남는다. 회사 공식 목표는
 * 어느 기기에서 봐도 같아야 하므로 여기를 기본값으로 둔다.
 * 목표가 바뀌면 이 숫자만 고치면 된다.
 */
export const DEFAULT_REVENUE_TARGET_EOK = 145

export const KPI_BANDS = {
    // 수익성 — 목표 대비 매출 달성율 (%)
    //
    // 기준표 원안은 EBITDA(영업이익) 18/16/15/12억이지만 영업이익은 CRM에서
    // 구할 수 없어 매출액으로 대체한다. 이때 억원 기준을 그대로 쓰면 안 된다
    // (전사 매출이 연 125억대라 15억 기준은 언제나 '탁월'이 된다).
    // 기준표의 등급 헤더(120~/110~/100~/90~) 자체가 달성율 눈금이므로
    // '목표 대비 몇 %인가'에 그대로 적용한다.
    revenue: [[120, 120], [110, 110], [100, 100], [90, 90]],
    // 부문기여 — 25년대비 26년 판매상승률 (%)
    salesGrowth: [[20, 120], [10, 110], [0, 100], [-10, 90]],
    // 고객관리 — 기존고객 및 단절고객 편입 (건). 0건이 '양호'다
    clientMgmt: [[2, 120], [1, 110], [0, 100], [-1, 90]],
    // 신규고객 발굴 — 매출발생 기준 (건)
    newClients: [[5, 120], [4, 110], [3, 100], [1, 90]],
    // 정기적 방문횟수 — 연간 기준 (건)
    visits: [[310, 120], [270, 110], [240, 100], [210, 90]],
    // 채권관리 — 연간 기준 (건). 적을수록 좋다 (0건이 '양호')
    receivables: [[0, 100], [1, 90]],
}

/** 미흡 구간(가장 낮은 기준 미만)의 환산율 */
const BAND_FLOOR = 80

/**
 * 값을 기준표 구간에 따라 환산율로 바꾼다.
 * @param {number} value
 * @param {Array<[number, number]>} bands - [기준값, 환산%] 내림차순
 * @param {boolean} lowerIsBetter - 채권관리처럼 적을수록 좋은 항목
 */
export function bandScore(value, bands, lowerIsBetter = false) {
    // 미입력을 0으로 보면 안 된다. Number(null)/Number('')는 0이라
    // 그냥 Number()로 받으면 '미입력'이 '미흡(80%)'으로 잡혀 총점이 깎인다.
    if (value === null || value === undefined || value === '') return null
    const v = Number(value)
    if (!Number.isFinite(v)) return null
    if (lowerIsBetter) {
        for (const [threshold, pct] of bands) if (v <= threshold) return pct
        return BAND_FLOOR
    }
    for (const [threshold, pct] of bands) if (v >= threshold) return pct
    return BAND_FLOOR
}

// Check monthly revenue >= 2M KRW
/**
 * KPI 인정 실적 기준
 *
 * 신규고객 발굴 / 단절고객 편입 모두 이 기준을 통과해야 건수로 인정된다.
 * 반기 1천만원 = 연 2천만원과 같은 속도이므로, 둘 중 하나만 넘으면 인정한다.
 * (예: 상반기에 1천만원을 채웠다면 연말까지 기다리지 않고 그 시점에 인정)
 *
 * 기준이 바뀌면 여기만 고치면 된다.
 */
export const KPI_REVENUE_QUALIFY = {
    HALF_YEAR: 10_000_000, // 반기 1천만원
    ANNUAL: 20_000_000,    // 연 2천만원
}

/**
 * 해당 거래처가 그 해에 KPI 인정 실적을 냈는지 판정한다.
 * 예전에는 '어느 한 달이라도 200만원'이었는데 실제 평가 기준과 달랐다.
 */
const checkQualifyingRevenue = (clientId, salesData, year) => {
    let h1 = 0
    let h2 = 0

    ;(salesData || []).forEach(s => {
        if ((s.client_id || s.clientId) !== clientId) return
        const d = new Date(s.sale_date || s.date)
        if (isNaN(d.getTime()) || d.getFullYear() !== year) return
        const amt = Number(s.total_amount ?? s.totalAmount ?? 0) || 0
        if (d.getMonth() < 6) h1 += amt
        else h2 += amt
    })

    return Math.max(h1, h2) >= KPI_REVENUE_QUALIFY.HALF_YEAR
        || (h1 + h2) >= KPI_REVENUE_QUALIFY.ANNUAL
}

/**
 * 단절 판정 기준
 *
 * "6개월 이상 거래가 끊겼고, 과거에 1천만원 이상 거래한 적이 있는 곳"
 *
 * 과거 실적 조건이 핵심이다. 한두 번 소액만 사고 만 곳까지 단절고객으로 잡으면
 * 목록이 의미를 잃는다. 챙길 가치가 있던 거래처만 단절로 본다.
 *
 * 공백 기준이 6개월인 이유: 2~3개월 간격으로 꾸준히 소액 주문하는 거래처가 있다.
 * (예: 리메카 — 3년간 17개월 주문, 누적 2,182만원) 5개월로 잡으면 이런 정상
 * 거래처가 단절로 분류된다.
 *
 * 편입 인정 여부는 별도로 올해 실적(반기 1천만원)으로 판단한다.
 */
export const CHURN_RULE = {
    GAP_MONTHS: 6,                    // 마지막 주문 후 6개월 이상 주문 없음
    MIN_HISTORY_REVENUE: 10_000_000,  // 과거 누적 1천만원 이상 거래 이력
}

/** 연/월을 하나의 정수로 (2026년 3월 -> 2026*12+2) */
const monthIndex = (d) => d.getFullYear() * 12 + d.getMonth()

/** 금액을 만원 단위로 (목록 표시용) */
const formatMan = (v) => `${Math.round((Number(v) || 0) / 10000).toLocaleString('ko-KR')}만원`

/**
 * 거래처의 '주문이 있었던 월' 목록만으로 단절/편입을 판정한다.
 *
 * @param {Set<number>} orderMonths - monthIndex 집합
 * @param {number} nowMonthIdx      - 오늘이 속한 월
 * @param {number} yearStartMonthIdx- 올해 1월
 * @returns {{churned: boolean, reactivated: boolean}}
 *   churned     : 단골이었는데 지금까지 3개월 이상 주문이 없음 (아직 미복귀)
 *   reactivated : 단골이었다가 3개월 이상 끊겼고, 올해 다시 주문함 (편입 성공)
 */
const analyzeChurn = (orderMonths, nowMonthIdx, yearStartMonthIdx, historyRevenue = 0) => {
    const ms = [...orderMonths].sort((a, b) => a - b)
    if (ms.length === 0) return { churned: false, reactivated: false, lastOrderMonth: null }

    // 과거에 챙길 만한 규모로 거래한 적이 있는 곳만 단절 대상으로 본다
    const worthTracking = historyRevenue >= CHURN_RULE.MIN_HISTORY_REVENUE

    // 편입: 주문이 끊긴 구간이 있고, 다시 주문한 시점이 올해인 경우
    // (편입 인정 여부는 호출부에서 올해 실적 기준으로 한 번 더 거른다)
    let reactivated = false
    if (worthTracking) {
        for (let i = 1; i < ms.length; i++) {
            if (ms[i] - ms[i - 1] >= CHURN_RULE.GAP_MONTHS && ms[i] >= yearStartMonthIdx) {
                reactivated = true
                break
            }
        }
    }

    // 미복귀 단절: 마지막 주문 이후 GAP_MONTHS 이상 지났고 아직 돌아오지 않음
    const last = ms[ms.length - 1]
    const churned = worthTracking && (nowMonthIdx - last >= CHURN_RULE.GAP_MONTHS)

    return { churned, reactivated, lastOrderMonth: last }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
const KPIWidget = ({ rawSalesData = [], clients = [], activities = [], myAccounts = [], salesRepName }) => {
    const { sales } = useData()
    const { locale } = useI18n()
    const [expandedKPI, setExpandedKPI] = useState(null)

    // KPI\ubcc4 \uc81c\uc678 \ubaa9\ub85d.
    // \ud56d\ubaa9\ubcc4\ub85c \ube7c\uc57c \ud558\ub294 \uacbd\uc6b0\uac00 \uc788\uc5b4 \uc804\uccb4 \uc81c\uc678('\ubbf8\uc0b0\uc815')\uc640 \ubd84\ub9ac\ud574\uc11c \uad00\ub9ac\ud55c\ub2e4.
    //   - \uc790\ud68c\uc0ac \ud30c\uc0dd \uac70\ub798\ucc98 -> \uc2e0\uaddc\uace0\uac1d \ubc1c\uad74\uc5d0\uc11c\ub9cc \uc81c\uc678 (\ub9e4\ucd9c \uc2e4\uc801\uc740 \uadf8\ub300\ub85c \uc7a1\ud600\uc57c \ud568)
    //   - \ud3d0\uc5c5/\uc0c1\ud638\ubcc0\uacbd     -> \ub2e8\uc808\uace0\uac1d \ud3b8\uc785\uc5d0\uc11c\ub9cc \uc81c\uc678
    const [exclusions, setExclusions] = useState(() => getKpiExclusions())

    // 목표 매출·채권관리는 CRM에서 알 수 없어 직접 입력받는다 (목표는 미입력 시 전년 매출)
    const [manual, setManual] = useState(() => getKpiManualInputs())
    const updateManual = (field, value) => setManual(setKpiManualInput(field, value))

    // ERP 스크린샷 판독(ErpScreenshotImport)이 채권 건수를 저장하면 여기로 알려온다.
    // localStorage는 같은 탭에서 바뀔 때 storage 이벤트가 오지 않아 직접 신호를 보낸다.
    useEffect(() => {
        const sync = () => setManual(getKpiManualInputs())
        window.addEventListener('kpi-manual-updated', sync)
        window.addEventListener('storage', sync)
        return () => {
            window.removeEventListener('kpi-manual-updated', sync)
            window.removeEventListener('storage', sync)
        }
    }, [])

    const toggleExclusion = (clientId, kind) => {
        setExclusions(toggleKpiExclusion(clientId, kind))
    }

    // Managed client IDs \u2014 \ud56d\ubaa9\ubcc4 \uc81c\uc678\ub294 \uc5ec\uae30\uc11c \uac78\uc9c0 \uc54a\ub294\ub2e4.
    // \uc5ec\uae30\uc11c \ube7c\uba74 \ub9e4\ucd9c\u00b7\ubd80\ubb38\uae30\uc5ec KPI\uc5d0\uc11c\uae4c\uc9c0 \uc2e4\uc801\uc774 \uc0ac\ub77c\uc9c4\ub2e4.
    const managedClientIds = useMemo(() => {
        return (myAccounts && myAccounts.length > 0)
            ? myAccounts.map(c => c.id)
            : (clients || []).filter(c => c.sales_rep === '\uc774\ud5cc\uc77c').map(c => c.id)
    }, [clients, salesRepName, myAccounts])

    // currentWeek is needed both in kpiData useMemo AND in JSX header
    const currentWeek = getISOWeekNumber(new Date())

    const kpiData = useMemo(() => {
        const now = new Date()
        const currentYear = now.getFullYear()
        const previousYear = currentYear - 1

        // 1. Revenue
        const totalRevThisYear = rawSalesData
            .filter(s => new Date(s.sale_date || s.date).getFullYear() === currentYear)
            .reduce((sum, s) => sum + (s.total_amount || s.totalAmount || 0), 0)

        const lastYearSamePeriodEnd = new Date(previousYear, now.getMonth(), now.getDate())
        lastYearSamePeriodEnd.setHours(23, 59, 59, 999)

        const totalRevLastYear = rawSalesData
            .filter(s => new Date(s.sale_date || s.date).getFullYear() === previousYear)
            .reduce((sum, s) => sum + (s.total_amount || s.totalAmount || 0), 0)

        const totalRevLastYearSamePeriod = rawSalesData
            .filter(s => {
                const d = new Date(s.sale_date || s.date)
                return d.getFullYear() === previousYear && d <= lastYearSamePeriodEnd
            })
            .reduce((sum, s) => sum + (s.total_amount || s.totalAmount || 0), 0)

        const revenuePercent = totalRevLastYearSamePeriod > 0
            ? Math.round((totalRevThisYear / totalRevLastYearSamePeriod) * 100)
            : 0

        // 2. My sales growth
        const myClientSalesThisYear = rawSalesData
            .filter(s => managedClientIds.includes(s.client_id) && new Date(s.sale_date || s.date).getFullYear() === currentYear)
            .reduce((sum, s) => sum + (s.total_amount || s.totalAmount || 0), 0)

        const myClientSalesLastYearSamePeriod = rawSalesData
            .filter(s => {
                const d = new Date(s.sale_date || s.date)
                return managedClientIds.includes(s.client_id) && d.getFullYear() === previousYear && d <= lastYearSamePeriodEnd
            })
            .reduce((sum, s) => sum + (s.total_amount || s.totalAmount || 0), 0)

        const salesGrowthRate = myClientSalesLastYearSamePeriod > 0
            ? Math.round(((myClientSalesThisYear - myClientSalesLastYearSamePeriod) / myClientSalesLastYearSamePeriod) * 100)
            : 0
        const salesGrowthPercent = bandScore(salesGrowthRate, KPI_BANDS.salesGrowth)

        // 3. 단절 / 편입 판정
        //
        // 정의: "거의 매월 주문하던 업체가 3개월 이상 주문이 없으면 단절"
        //
        // [버그 수정 이력]
        // 1) 예전에는 '거의 매월 주문하던' 조건이 아예 없어서, 몇 달 전에 딱 한 번
        //    거래한 곳도 단절고객으로 잡혔다.
        // 2) 또 단절 목록을 만들 때 '최근 거래가 있는 곳'을 미리 제외해 놓고
        //    그 목록에서 다시 '최근 거래가 있는 곳'을 찾았다. 교집합이 정의상
        //    항상 비어 있어 이 KPI는 구조적으로 영원히 0건이었다.
        const nowMonthIdx = monthIndex(now)
        const yearStartMonthIdx = currentYear * 12

        const orderMonthsByClient = {}
        rawSalesData.forEach(s => {
            const cid = s.client_id || s.clientId
            if (!managedClientIds.includes(cid)) return
            const d = new Date(s.sale_date || s.date)
            if (isNaN(d.getTime())) return
            if (!orderMonthsByClient[cid]) orderMonthsByClient[cid] = new Set()
            orderMonthsByClient[cid].add(monthIndex(d))
        })

        // 올해 누적 매출 (목록에 함께 표시한다)
        const ytdRevenueByClient = {}
        rawSalesData.forEach(s => {
            const cid = s.client_id || s.clientId
            if (!managedClientIds.includes(cid)) return
            const d = new Date(s.sale_date || s.date)
            if (isNaN(d.getTime()) || d.getFullYear() !== currentYear) return
            ytdRevenueByClient[cid] = (ytdRevenueByClient[cid] || 0) + (Number(s.total_amount ?? s.totalAmount ?? 0) || 0)
        })

        // 올해 이전에 매출이 있었던 거래처 (신규 판정의 기준)
        const hadSalesBeforeThisYear = new Set()
        rawSalesData.forEach(s => {
            const d = new Date(s.sale_date || s.date)
            if (!isNaN(d.getTime()) && d.getFullYear() < currentYear) {
                hadSalesBeforeThisYear.add(s.client_id || s.clientId)
            }
        })

        // 거래처별 전체 누적 매출 (단절 판정의 '과거 1천만원 이상' 조건에 쓴다)
        const historyRevenueByClient = {}
        rawSalesData.forEach(s => {
            const cid = s.client_id || s.clientId
            if (!managedClientIds.includes(cid)) return
            historyRevenueByClient[cid] = (historyRevenueByClient[cid] || 0)
                + (Number(s.total_amount ?? s.totalAmount ?? 0) || 0)
        })

        // 4. 신규고객 발굴
        // [수정] 예전에는 CRM 등록일(created_at)로 판정했다. 거래처 데이터를 올해 한꺼번에
        // 입력했기 때문에 2025년부터 거래하던 곳까지 전부 '신규'로 잡혔다.
        // 실제 거래 이력을 기준으로 '올해 처음 거래한 곳'만 신규로 본다.
        const newCandidateIds = managedClientIds.filter(id =>
            !hadSalesBeforeThisYear.has(id) && (ytdRevenueByClient[id] || 0) > 0
        )
        // 기존 거래처에서 자회사 등으로 파생된 곳은 사용자가 직접 제외한다
        const newClientIds = newCandidateIds.filter(
            id => !isExcludedFrom(exclusions, id, KPI_EXCLUSION_KINDS.NEW)
        )
        const qualifiedNewIds = newClientIds.filter(id => checkQualifyingRevenue(id, rawSalesData, currentYear))
        const qualifiedNewCount = qualifiedNewIds.length
        // [수정] 예전에는 count/3*100 (상한 130)이라 4건이 133%, 5건이 130%로
        // 기준표(4건=우수 110%, 5건=탁월 120%)와 어긋났다.
        const newClientPercent = bandScore(qualifiedNewCount, KPI_BANDS.newClients)

        // 단절 / 편입 판정
        const reactivatedIds = []
        const dormantIds = []

        managedClientIds.forEach(id => {
            if (isExcludedFrom(exclusions, id, KPI_EXCLUSION_KINDS.CHURN)) return

            const { churned, reactivated, lastOrderMonth } = analyzeChurn(
                orderMonthsByClient[id] || new Set(),
                nowMonthIdx,
                yearStartMonthIdx,
                historyRevenueByClient[id] || 0
            )
            if (churned) dormantIds.push({ id, lastOrderMonth })
            // 올해 처음 거래한 곳은 '단절 후 편입'이 될 수 없다 (신규와 이중 계상 방지)
            if (reactivated
                && !newCandidateIds.includes(id)
                && checkQualifyingRevenue(id, rawSalesData, currentYear)) {
                reactivatedIds.push(id)
            }
        })

        const reactivatedCount = reactivatedIds.length
        // [수정] 예전에는 '편입 1건당 20%'라 0건이면 0%(미흡)였다.
        // 기준표상 0건은 '양호(100%)'다. 그대로 두면 담당자가 크게 손해를 본다.
        const clientMgmtPercent = bandScore(reactivatedCount, KPI_BANDS.clientMgmt)

        // 화면 목록용 (업체명 + 올해 누적 매출)
        const nameOf = (id) => (clients.find(cl => cl.id === id)?.company) || id
        const toRow = (id) => ({ id, name: nameOf(id), revenue: ytdRevenueByClient[id] || 0 })
        const byRevenueDesc = (a, b) => b.revenue - a.revenue

        const qualifiedNewList = qualifiedNewIds.map(toRow).sort(byRevenueDesc)
        const reactivatedList = reactivatedIds.map(toRow).sort(byRevenueDesc)
        const dormantList = dormantIds
            .map(({ id, lastOrderMonth }) => ({
                ...toRow(id),
                history: historyRevenueByClient[id] || 0,
                lastOrder: lastOrderMonth == null
                    ? '-'
                    : `${Math.floor(lastOrderMonth / 12)}.${String((lastOrderMonth % 12) + 1).padStart(2, '0')}`
            }))
            .sort((a, b) => b.history - a.history)

        // 제외 처리된 거래처 (되돌릴 수 있도록 항목별로 보여준다)
        const excludedIdsFor = (kind) => Object.keys(exclusions)
            .filter(id => exclusions[id]?.[kind])
            .map(id => ({ id, name: nameOf(id) }))

        const excludedNewList = excludedIdsFor(KPI_EXCLUSION_KINDS.NEW)
        const excludedChurnList = excludedIdsFor(KPI_EXCLUSION_KINDS.CHURN)

        // 5. Visit count
        // [수정] 예전에는 연도 조건이 없어 작년 활동까지 올해 KPI에 합산됐다.
        // 일일업무보고서를 일괄로 넣으면 작년 12월분이 그대로 딸려 들어와
        // 올해 방문 실적이 부풀려진다. 반드시 올해 것만 센다.
        const visitCount = activities.filter(a => {
            const d = a.activity_date || a.date
            if (!d || new Date(d).getFullYear() !== currentYear) return false
            return managedClientIds.includes(a.client_id) &&
                ['visit', '\ubc29\ubb38', '\uc601\uc5c5\ubc29\ubb38', 'meeting', '\ubbf8\ud305'].includes((a.activity_type || a.type || '').toLowerCase())
        }).length
        // [수정] 예전엔 52주 x 2 = 104건이었다. 기준표의 양호(계획)는 연 240건이다.
        const visitTarget = 240
        const weekNum = getISOWeekNumber(now)
        const expectedVisitsByNow = (visitTarget / totalWeeks) * weekNum
        // 연말 기준 예상 방문수로 환산해 구간을 적용한다 (연중에는 진도율로 환산)
        const projectedVisits = weekNum > 0 ? Math.round(visitCount * (totalWeeks / weekNum)) : 0
        const visitPercent = bandScore(projectedVisits, KPI_BANDS.visits)

        // 수익성 — 연말 예상 매출을 목표와 견준다.
        // 연중에는 YTD를 경과일 비례로 환산해야 진도가 반영된다
        // (8월에 YTD를 연간 목표와 그대로 비교하면 항상 미달로 나온다).
        const yearStart = new Date(currentYear, 0, 1)
        const elapsedDays = Math.max(1, Math.round((now - yearStart) / 86400000) + 1)
        const daysInYear = ((currentYear % 4 === 0 && currentYear % 100 !== 0) || currentYear % 400 === 0) ? 366 : 365
        const projectedRevenue = totalRevThisYear * (daysInYear / elapsedDays)

        // 목표는 직접 입력할 수 있고, 없으면 경영계획 목표(DEFAULT_REVENUE_TARGET_EOK)를 쓴다
        const revenueTargetEok = manual.revenueTarget ?? DEFAULT_REVENUE_TARGET_EOK
        const revenueAchievement = revenueTargetEok > 0
            ? Math.round((projectedRevenue / 100_000_000) / revenueTargetEok * 100)
            : null
        const revenueKpiPercent = bandScore(revenueAchievement, KPI_BANDS.revenue)
        const receivablesPercent = bandScore(manual.receivables, KPI_BANDS.receivables, true)

        return {
            items: [
                {
                    id: 'revenue', category: '정량평가', name: '수익성', kpi: '올해 매출 · 작년 동기 대비', weight: 40, unit: '',
                    // 카드에 크게 보이는 값은 '올해 총 매출액'이다.
                    // 달성율(%)은 등급 계산에만 쓰고 보조 줄에 적는다 — 영업사원이 매일 보는 건 매출액이다.
                    display: `${(totalRevThisYear / 100_000_000).toFixed(1)}억`,
                    displaySub: revenuePercent >= 100
                        ? `작년 동기 대비 +${revenuePercent - 100}%`
                        : `작년 동기 대비 ${revenuePercent - 100}%`,
                    displaySubUp: revenuePercent >= 100,
                    actual: revenueAchievement,
                    target: 100, percent: revenueKpiPercent, icon: Target,
                    manualField: 'revenueTarget',
                    manualLabel: '2026년 목표 매출 (억원)',
                    detail: [
                        `올해 매출 ${(totalRevThisYear / 100_000_000).toFixed(1)}억 (1/1~오늘, ${elapsedDays}일 경과)`,
                        `작년 같은 기간 ${(totalRevLastYearSamePeriod / 100_000_000).toFixed(1)}억 → 성장률 ${revenuePercent >= 100 ? '+' : ''}${revenuePercent - 100}%`,
                        `작년 연간 ${(totalRevLastYear / 100_000_000).toFixed(1)}억`,
                        '',
                        `[등급 산정] 연말 예상 ${(projectedRevenue / 100_000_000).toFixed(1)}억 ÷ 목표 ${revenueTargetEok.toFixed(1)}억 = ${revenueAchievement}%`,
                        manual.revenueTarget == null
                            ? `목표 ${DEFAULT_REVENUE_TARGET_EOK}억은 경영계획 기본값입니다. 아래 칸에 넣으면 그 값이 우선합니다.`
                            : '아래 칸에 입력한 목표 기준으로 계산했습니다.',
                        '기준: 120%↑ 탁월 · 110%↑ 우수 · 100%↑ 양호 · 90%↑ 보통 · 90%↓ 미흡',
                        '※ 원 기준표는 EBITDA(영업이익)이나 자료가 없어 매출액으로 대체한 항목입니다.'
                    ].join('\n'),
                },
                {
                    id: 'sales_growth', category: '정량평가', name: '부문기여 (판매확대)', kpi: '25년대비 26년 판매상승률', weight: 20, unit: '%',
                    actual: salesGrowthRate, target: 0, percent: salesGrowthPercent, icon: TrendingUp,
                    detail: `담당 거래처 올해 매출: ${(myClientSalesThisYear / 10000).toLocaleString()}만원
전년 동기 매출: ${(myClientSalesLastYearSamePeriod / 10000).toLocaleString()}만원
기준: +20% 탁월 · +10% 우수 · 0% 양호 · -10% 보통 · -20% 미흡`,
                },
                {
                    id: 'client_mgmt', category: '\uc815\uc131\ud3c9\uac00', name: '\uace0\uac1d\uad00\ub9ac', kpi: '\ub2e8\uc808\uace0\uac1d \ud3b8\uc785', weight: 15, unit: '\uac74',
                    actual: reactivatedCount, target: 0, percent: clientMgmtPercent, icon: Users,
                    detail: `${CHURN_RULE.GAP_MONTHS}\uac1c\uc6d4 \uc774\uc0c1 \uac70\ub798\uac00 \ub04a\uacbc\ub2e4\uac00 \uc62c\ud574 \ub2e4\uc2dc \uac70\ub798\ud55c \uacf3 \uc911, \ubc18\uae30 1\ucc9c\ub9cc\uc6d0(\ub610\ub294 \uc5f0 2\ucc9c\ub9cc\uc6d0)\uc744 \ub118\uae34 \uac70\ub798\ucc98`,
                    clientList: reactivatedList,
                    emptyText: '\uae30\uc900\uc744 \ub118\uc740 \ud3b8\uc785 \uc2e4\uc801\uc774 \uc544\uc9c1 \uc5c6\uc2b5\ub2c8\ub2e4.',
                    dormantList,
                    excludeKind: KPI_EXCLUSION_KINDS.CHURN,
                    excludedList: excludedChurnList,
                },
                {
                    id: 'new_clients', category: '\uc815\uc131\ud3c9\uac00', name: '\uc2e0\uaddc\uace0\uac1d \ubc1c\uad74', kpi: '\uc2e0\uaddc \uac70\ub798\ucc98 (\ubc18\uae30 1\ucc9c\ub9cc+)', weight: 10, unit: '\uac74',
                    actual: qualifiedNewCount, target: 3, percent: newClientPercent, icon: UserPlus,
                    detail: `\uc62c\ud574 \ucc98\uc74c \uac70\ub798\ud55c ${newClientIds.length}\uacf3 \uc911, \ubc18\uae30 1\ucc9c\ub9cc\uc6d0(\ub610\ub294 \uc5f0 2\ucc9c\ub9cc\uc6d0)\uc744 \ub118\uae34 \uac70\ub798\ucc98`,
                    clientList: qualifiedNewList,
                    emptyText: '\uae30\uc900\uc744 \ub118\uc740 \uc2e0\uaddc \uac70\ub798\ucc98\uac00 \uc544\uc9c1 \uc5c6\uc2b5\ub2c8\ub2e4.',
                    clientListExcludable: true,
                    clientListExcludeHint: '\uae30\uc874 \uac70\ub798\ucc98\uc5d0\uc11c \uc790\ud68c\uc0ac \ub4f1\uc73c\ub85c \ud30c\uc0dd\ub41c \uacf3\uc740 \uc81c\uc678\ud558\uc138\uc694. \ub9e4\ucd9c \uc2e4\uc801\uc5d0\ub294 \uadf8\ub300\ub85c \ubc18\uc601\ub429\ub2c8\ub2e4.',
                    excludeKind: KPI_EXCLUSION_KINDS.NEW,
                    excludedList: excludedNewList,
                },
                {
                    id: 'visits', category: '\uc815\uc131\ud3c9\uac00', name: '\uc815\uae30\uc801\ubc29\ubb38\ud69f\uc218', kpi: '\uc5f0\uac04 \uae30\uc900', weight: 10, unit: '\uac74',
                    actual: visitCount, target: visitTarget, percent: visitPercent, icon: MapPin,
                    detail: [
                        `${weekNum}\uc8fc\ucc28 \uae30\uc900 ${visitCount}\uac74 (\uc5f0\ub9d0 \uc608\uc0c1 ${projectedVisits}\uac74)`,
                        `\uc9c4\ub3c4 \ubaa9\ud45c ${Math.round(expectedVisitsByNow)}\uac74 \u00b7 \uc5f0\uac04 \uacc4\ud68d ${visitTarget}\uac74`,
                        '\uae30\uc900: 310\uac74 \ud0c1\uc6d4 \u00b7 270\uac74 \uc6b0\uc218 \u00b7 240\uac74 \uc591\ud638 \u00b7 210\uac74 \ubcf4\ud1b5 \u00b7 180\uac74 \ubbf8\ud761'
                    ].join('\n'),
                },
                {
                    // [\ucd94\uac00] \uae30\uc900\ud45c\uc5d0 \uc788\uc73c\ub098 \ud654\uba74\uc5d0 \uc544\uc608 \uc5c6\ub358 \ud56d\ubaa9. \uc774\uac83\uc774 \ube60\uc838 \uac00\uc911\uce58 \ud569\uc774
                    // 95\uc810\uc774\uc5c8\uace0 \ucd1d\uc810\uc774 \uc2e4\uc81c\uc640 \ub2ec\ub790\ub2e4.
                    id: 'receivables', category: '\uc815\uc131\ud3c9\uac00', name: '\ucc44\uad8c\uad00\ub9ac', kpi: '\uc5f0\uac04 \uae30\uc900', weight: 5, unit: '\uac74',
                    actual: manual.receivables ?? null,
                    target: 0, percent: receivablesPercent, icon: FileWarning,
                    manualField: 'receivables',
                    manualLabel: '\ucc44\uad8c \ubb38\uc81c \ubc1c\uc0dd \uac74\uc218',
                    lowerIsBetter: true,
                    detail: manual.receivables == null
                        ? [
                            '\ucc44\uad8c\uad00\ub9ac\ub294 CRM\uc5d0 \uc790\ub8cc\uac00 \uc5c6\uc5b4 \uc790\ub3d9 \uacc4\uc0b0\ub418\uc9c0 \uc54a\uc2b5\ub2c8\ub2e4. \uac74\uc218\ub97c \uc785\ub825\ud558\uba74 \ubc18\uc601\ub429\ub2c8\ub2e4.',
                            '\uae30\uc900: 0\uac74 \uc591\ud638 \u00b7 1\uac74 \ubcf4\ud1b5 \u00b7 2\uac74 \ubbf8\ud761 (\uc801\uc744\uc218\ub85d \uc88b\uc74c)'
                        ].join('\n')
                        : [
                            `\uc785\ub825\ud55c \ucc44\uad8c \ubb38\uc81c ${manual.receivables}\uac74`,
                            '\uae30\uc900: 0\uac74 \uc591\ud638 \u00b7 1\uac74 \ubcf4\ud1b5 \u00b7 2\uac74 \ubbf8\ud761 (\uc801\uc744\uc218\ub85d \uc88b\uc74c)'
                        ].join('\n'),
                }
            ],
        }
    }, [rawSalesData, clients, activities, managedClientIds, exclusions, manual])

    /**
     * 총점 = 가중평균.
     * 미입력 항목(채권관리 등)은 0으로 치지 않고 계산에서 뺀다.
     * 0으로 치면 '미흡'으로 잡혀 총점이 부당하게 깎인다.
     */
    const { overallScore, scoredWeight, missingItems } = useMemo(() => {
        const scored = kpiData.items.filter(i => typeof i.percent === 'number')
        const missing = kpiData.items.filter(i => typeof i.percent !== 'number')
        const w = scored.reduce((sum, i) => sum + i.weight, 0)
        const sum = scored.reduce((acc, i) => acc + (i.percent * i.weight), 0)
        return {
            overallScore: w > 0 ? Math.round(sum / w) : 0,
            scoredWeight: w,
            missingItems: missing
        }
    }, [kpiData])

    /**
     * KPI 펼침 내용.
     *
     * 카드(6칸 그리드) 안이 아니라 표 아래 전체 폭에 그린다. 카드 안에 넣으면
     * 칸이 좁아 거래처 목록의 글자가 겹치고 제외 버튼이 칸 밖으로 나간다.
     */
    const expandedItem = kpiData?.items?.find((i) => i.id === expandedKPI) || null

    const renderDetail = (item) => (
        <div className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                        <p className="whitespace-pre-line">{item.detail}</p>

                        {/* 자동 계산이 안 되는 항목은 직접 입력받는다 */}
                        {item.manualField && (
                            <div className="mt-3 flex items-center gap-2 flex-wrap">
                                <label htmlFor={`kpi-${item.manualField}`} style={{ color: 'var(--text-secondary)' }}>
                                    {item.manualLabel}
                                </label>
                                <input
                                    id={`kpi-${item.manualField}`}
                                    type="number"
                                    step="any"
                                    value={manual[item.manualField] ?? ''}
                                    onChange={(e) => updateManual(item.manualField, e.target.value)}
                                    placeholder="미입력"
                                    style={{ width: '110px' }}
                                />
                                <span style={{ color: 'var(--text-muted)' }}>{item.unit}</span>
                                {manual[item.manualField] != null && (
                                    <button
                                        className="rowbtn"
                                        onClick={() => updateManual(item.manualField, '')}
                                    >
                                        지우기
                                    </button>
                                )}
                            </div>
                        )}

                        {/* 인정된 거래처 목록 + 올해 누적 매출 */}
                        {item.clientList && (
                            item.clientList.length > 0 ? (
                                <>
                                    {item.clientListExcludable && (
                                        <p className="mt-2" style={{ color: 'var(--text-muted)' }}>
                                            {item.clientListExcludeHint}
                                        </p>
                                    )}
                                    <ul className="mt-2 divide-y" style={{ borderColor: 'var(--border-light)' }}>
                                        {item.clientList.map(c => (
                                            <li key={c.id} className="flex items-center justify-between gap-2 py-1.5">
                                                <span className="truncate flex-1" style={{ color: 'var(--text-primary)' }}>{c.name}</span>
                                                <span className="shrink-0 tabular-nums font-semibold" style={{ color: 'var(--text-primary)' }}>
                                                    {formatMan(c.revenue)}
                                                </span>
                                                {item.clientListExcludable && (
                                                    <button
                                                        onClick={() => toggleExclusion(c.id, item.excludeKind)}
                                                        className="shrink-0 min-h-tap px-2.5 rounded-lg border text-xs font-semibold"
                                                        style={{ borderColor: 'var(--border-strong)', color: 'var(--text-secondary)' }}
                                                    >
                                                        제외
                                                    </button>
                                                )}
                                            </li>
                                        ))}
                                    </ul>
                                </>
                            ) : (
                                <p className="mt-2" style={{ color: 'var(--text-muted)' }}>{item.emptyText}</p>
                            )
                        )}

                        {/* 아직 복귀하지 않은 단절고객 — 복구 불가한 곳은 제외 가능 */}
                        {item.dormantList && item.dormantList.length > 0 && (
                            <div className="mt-4">
                                <p className="font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
                                    아직 복귀하지 않은 단절고객 {item.dormantList.length}곳
                                </p>
                                <p className="mb-2" style={{ color: 'var(--text-muted)' }}>
                                    폐업·상호변경 등으로 복구 가능성이 없는 곳은 제외하세요.
                                </p>
                                <ul className="divide-y" style={{ borderColor: 'var(--border-light)' }}>
                                    {item.dormantList.map(c => (
                                        <li key={c.id} className="flex items-center justify-between gap-2 py-1.5">
                                            <span className="truncate flex-1" style={{ color: 'var(--text-primary)' }}>{c.name}</span>
                                            <span className="shrink-0 tabular-nums" style={{ color: 'var(--text-muted)' }}>
                                                최종 {c.lastOrder} · 누적 {formatMan(c.history)}
                                            </span>
                                            <button
                                                onClick={() => toggleExclusion(c.id, item.excludeKind)}
                                                className="shrink-0 min-h-tap px-2.5 rounded-lg border text-xs font-semibold"
                                                style={{ borderColor: 'var(--border-strong)', color: 'var(--text-secondary)' }}
                                            >
                                                제외
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}

                        {/* 제외한 거래처 되돌리기 */}
                        {item.excludedList && item.excludedList.length > 0 && (
                            <div className="mt-4">
                                <p className="font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
                                    제외한 거래처 {item.excludedList.length}곳
                                </p>
                                <ul className="divide-y" style={{ borderColor: 'var(--border-light)' }}>
                                    {item.excludedList.map(c => (
                                        <li key={c.id} className="flex items-center justify-between gap-2 py-1.5">
                                            <span className="truncate" style={{ color: 'var(--text-muted)' }}>{c.name}</span>
                                            <button
                                                onClick={() => toggleExclusion(c.id, item.excludeKind)}
                                                className="shrink-0 min-h-tap px-2.5 rounded-lg border text-xs font-semibold"
                                                style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}
                                            >
                                                되돌리기
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
        </div>
    )

    const overallGrade = getGradeInfo(overallScore)

    return (
        <div className="rounded-xl overflow-hidden mb-6" style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)' }}>
            {/* Header */}
            <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border)' }}>
                <div className="flex items-center gap-3">
                    <h2 className="text-base font-black" style={{ color: 'var(--text-primary)' }}>KPI Performance</h2>
                    <span className="text-[10px] font-bold px-2 py-0.5" style={{ color: 'var(--text-secondary)', backgroundColor: 'var(--bg-header)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontFamily: 'var(--font-data)' }}>
                        {currentWeek}주차 / {totalWeeks}
                    </span>
                </div>
                <div className="flex items-center gap-2">
                    <span className="text-xs font-bold" style={{ color: 'var(--text-secondary)' }}>{locale === 'en' ? 'Overall:' : '\uc885\ud569:'}</span>
                    <span className="text-xl font-black" style={{ color: 'var(--text-primary)' }}>{overallScore}%</span>
                    <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                        (가중치 {scoredWeight}/100
                        {missingItems.length > 0 && ` · ${missingItems.map(i => i.name).join('·')} 미입력`})
                    </span>
                    <span
                        className="text-[10px] font-black px-2.5 py-1 rounded-full shadow-sm"
                        style={{ backgroundColor: overallGrade.bgColor, color: overallGrade.color }}
                    >
                        {overallGrade.grade}
                    </span>
                </div>
            </div>

            <div className="p-4 space-y-4">
                {/* KPI Cards Grid */}
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2.5">
                    {kpiData.items.map((item) => {
                        const isUnset = typeof item.percent !== 'number'
                        const grade = getGradeInfo(item.percent)
                        const Icon = item.icon
                        const isExpanded = expandedKPI === item.id

                        return (
                            <div
                                key={item.id}
                                onClick={() => setExpandedKPI(isExpanded ? null : item.id)}
                                className={`relative group cursor-pointer rounded-lg p-3 transition-all duration-200 border-t-4 ${isExpanded ? 'shadow-lg' : 'hover:-translate-y-0.5 hover:shadow-lg'}`}
                                style={{
                                    backgroundColor: 'var(--bg-card-hover)',
                                    border: '1px solid var(--border)',
                                    borderTopColor: grade.color,
                                    boxShadow: isExpanded ? `0 0 0 1px ${grade.color}40` : undefined
                                }}
                            >
                                <div className="relative z-10">
                                    {/* Category Badge */}
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                                            {item.category}
                                        </span>
                                        <span className="text-[11px] font-bold" style={{ color: 'var(--text-muted)' }}>Weight: {item.weight}</span>
                                    </div>

                                    {/* Name & Icon */}
                                    <div className="flex items-center gap-2 mb-2">
                                        <div className="p-1.5 rounded-md shrink-0" style={{ backgroundColor: `${grade.color}20` }}>
                                            <Icon className="w-4 h-4" style={{ color: grade.color }} />
                                        </div>
                                        <div>
                                            <p className="text-sm font-bold leading-tight" style={{ color: 'var(--text-primary)' }}>{item.name}</p>
                                            <p className="text-[10px] mt-0.5 font-medium" style={{ color: 'var(--text-secondary)' }}>{item.kpi}</p>
                                        </div>
                                    </div>

                                    {/* Score — 미입력 항목에는 등급을 붙이지 않는다 */}
                                    <div className="flex items-end justify-between mb-2">
                                        {isUnset ? (
                                            <span className="text-lg font-bold" style={{ color: 'var(--text-muted)' }}>미입력</span>
                                        ) : (
                                            <>
                                                {/* display가 있으면 그 값을 크게 보여준다 (수익성 = 올해 매출액).
                                                    환산 %는 등급 계산용이라 아래 '달성율' 줄에 남긴다. */}
                                                <div className="min-w-0">
                                                    <span className="text-xl font-bold block truncate" style={{ color: 'var(--text-primary)' }}>
                                                        {item.display ?? `${item.percent}%`}
                                                    </span>
                                                    {item.displaySub && (
                                                        <span className="text-[11px] font-semibold"
                                                            style={{ color: item.displaySubUp ? '#1C6B3C' : '#B91C1C' }}>
                                                            {item.displaySub}
                                                        </span>
                                                    )}
                                                </div>
                                                <span className="text-[11px] font-bold px-1.5 py-0.5 rounded-md shrink-0"
                                                    style={{ backgroundColor: `${grade.color}20`, color: grade.color }}>
                                                    {grade.grade}
                                                </span>
                                            </>
                                        )}
                                    </div>

                                    {/* Progress Bar */}
                                    <div className="w-full h-1 mb-2 overflow-hidden rounded-sm" style={{ backgroundColor: 'var(--border)' }}>
                                        {!isUnset && (
                                            <div
                                                className="h-full transition-all duration-700 ease-out rounded-sm"
                                                style={{ width: `${Math.min(item.percent, 120) / 1.2}%`, backgroundColor: grade.barColor }}
                                            />
                                        )}
                                    </div>

                                    {/* Actual vs Target */}
                                    <div className="flex justify-between text-[11px] font-medium" style={{ color: 'var(--text-muted)' }}>
                                        <span>
                                            {item.display ? '달성율' : (locale === 'en' ? 'Actual' : '실적')}{' '}
                                            <b style={{ color: 'var(--text-primary)' }}>
                                                {item.actual == null ? '미입력' : `${typeof item.actual === 'number' ? item.actual.toLocaleString() : item.actual}${item.display ? '%' : item.unit}`}
                                            </b>
                                        </span>
                                        {item.target > 0 && <span>{locale === 'en' ? 'Target' : '\ubaa9\ud45c'} {item.target}</span>}
                                    </div>

                                    {/* 펼침 내용은 카드 안이 아니라 표 아래 전체 폭에 그린다.
                                        6칸 그리드 안에 목록을 넣으면 칸이 좁아 글자가 겹치고 버튼이 삐져나온다. */}
                                    {isExpanded && (
                                        <div className="mt-3 pt-2 text-[11px] font-semibold text-center"
                                            style={{ borderTop: '1px solid var(--border)', color: grade.color }}>
                                            아래에서 자세히 보기 ▼
                                        </div>
                                    )}
                                </div>
                            </div>
                        )
                    })}
                </div>

                {/* 펼친 KPI 상세 — 전체 폭 */}
                {expandedItem && (
                    <div className="rounded-xl p-5"
                        style={{ backgroundColor: 'var(--bg-card-hover)', border: '1px solid var(--border)', borderTop: `3px solid ${getGradeInfo(expandedItem.percent).color}` }}>
                        <div className="flex items-start justify-between gap-3 mb-3">
                            <div>
                                <h3 className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>{expandedItem.name}</h3>
                                <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>{expandedItem.kpi}</p>
                            </div>
                            <button onClick={() => setExpandedKPI(null)}
                                className="shrink-0 px-3 min-h-tap rounded-lg border text-xs font-semibold"
                                style={{ borderColor: 'var(--border-strong)', color: 'var(--text-secondary)' }}>닫기</button>
                        </div>
                        {renderDetail(expandedItem)}
                    </div>
                )}

            </div>
        </div>
    )
}

export default KPIWidget
