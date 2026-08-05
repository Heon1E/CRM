/**
 * 매출 추정 엔진 회귀 테스트
 *
 * 실행: npm run test:unit   (node --test, 별도 의존성 없음)
 *
 * v6.1에서 실제로 발견된 결함들을 고정한다. 각 테스트는 그 결함 하나에 대응한다.
 * `now`를 주입하므로 실행 시점과 무관하게 결정적으로 동작한다.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { calculateRevenueForecast, FORECAST_CONFIG } from '../src/utils/revenueForecastEngine.js'

const YEAR = 2026
const AUG_2 = new Date(2026, 7, 2)   // 8월 초, 영업일 0일 경과 (1일 토, 2일 일)
const JAN_1 = new Date(2026, 0, 1)   // 연초, 12개월 모두 예측 구간

const sale = (client_id, y, m, amt) => ({
    client_id,
    sale_date: `${y}-${String(m).padStart(2, '0')}-15`,
    total_amount: amt
})

/** 특정 연도 12개월 전체에 동일 금액 */
const fullYear = (id, y, amt) => Array.from({ length: 12 }, (_, i) => sale(id, y, i + 1, amt))

const totalOf = (rows) => rows.reduce((a, r) => a + r.total_amount, 0)

test('데이터가 없으면 예외를 던진다', () => {
    assert.throws(() => calculateRevenueForecast([], YEAR, AUG_2), /No data/)
})

test('올해 처음 거래한 고객도 잔여 기간 예측에 반영된다', () => {
    // v6.1 결함: 과거 3년 실적이 0이면 Stable로 떨어져 예측이 0이 되었다.
    const rows = Array.from({ length: 7 }, (_, i) => sale('new', YEAR, i + 1, 10_000_000))
    const r = calculateRevenueForecast(rows, YEAR, AUG_2)

    assert.equal(r.debug.contribution.NewThisYear.count, 1)
    assert.ok(
        r.total_amount > totalOf(rows),
        `연간 예측(${r.total_amount})이 YTD 실적(${totalOf(rows)})보다 커야 한다`
    )
    // 8~12월이 전부 0이 아니어야 한다
    const remaining = r.monthlyData.slice(7).reduce((a, m) => a + m.forecast, 0)
    assert.ok(remaining > 0, '잔여 기간 예측이 0이면 안 된다')
})

test('올해 신규 고객의 연환산에 상한이 적용된다', () => {
    // 1월 한 달 실적만으로 연환산하면 ~12배가 되므로 캡이 걸려야 한다
    const rows = [sale('new', YEAR, 1, 10_000_000)]
    const r = calculateRevenueForecast(rows, YEAR, new Date(2026, 0, 31))
    const annualized = r.debug.contribution.NewThisYear.forecastTargetYear

    assert.ok(
        annualized <= 10_000_000 * FORECAST_CONFIG.NEW_ANNUALIZE_CAP + 1,
        `연환산 ${annualized}이 상한(${FORECAST_CONFIG.NEW_ANNUALIZE_CAP}배)을 넘었다`
    )
})

test('진행 중인 달은 확정 실적 + 잔여 영업일 예측으로 계산된다', () => {
    // v6.1 결함: 이번 달 실적이 총액/차트에서 통째로 무시되어
    //            '예측 총액 < 이미 확정된 매출'이 발생했다.
    const rows = [
        ...fullYear('c', 2024, 10_000_000),
        ...fullYear('c', 2025, 10_000_000),
        ...Array.from({ length: 8 }, (_, i) => sale('c', YEAR, i + 1, i === 7 ? 500_000_000 : 10_000_000))
    ]
    const r = calculateRevenueForecast(rows, YEAR, AUG_2)
    const august = r.monthlyData[7]
    const ytdActual = r.debug.audit.currentYearYTD

    assert.equal(august.actual, 500_000_000)
    assert.ok(august.forecast >= august.actual, '이번 달 예측값이 확정 실적보다 작으면 안 된다')
    assert.ok(
        r.total_amount > ytdActual,
        `연간 예측(${r.total_amount})이 이미 확정된 YTD(${ytdActual})보다 작으면 안 된다`
    )
})

test('마감된 달은 실적으로 확정되고 예측으로 대체되지 않는다', () => {
    const rows = [
        ...fullYear('c', 2025, 10_000_000),
        ...Array.from({ length: 7 }, (_, i) => sale('c', YEAR, i + 1, 3_000_000))
    ]
    const r = calculateRevenueForecast(rows, YEAR, AUG_2)

    for (let i = 0; i < 7; i++) {
        assert.equal(r.monthlyData[i].isForecast, false)
        assert.equal(r.monthlyData[i].forecast, 3_000_000, `${i + 1}월은 실적 그대로여야 한다`)
    }
})

test('작년 한두 달만 거래한 고객의 12배 연환산에 상한이 적용된다', () => {
    // v6.1 결함: New 세그먼트의 12배 연환산에 상한이 없어 5천만 -> 6억이 되었다.
    const rows = [sale('g', 2025, 3, 50_000_000)]
    const r = calculateRevenueForecast(rows, YEAR, AUG_2)
    const fc = r.debug.contribution.New.forecastTargetYear

    assert.equal(r.debug.contribution.New.count, 1)
    assert.ok(
        fc <= 50_000_000 * FORECAST_CONFIG.NEW_ANNUALIZE_CAP + 1,
        `연환산 ${fc}이 상한을 넘었다`
    )
})

test('2년간 꾸준히 거래한 대형 고객은 New가 아니라 기성 고객으로 분류된다', () => {
    // v6.1 결함: '3년 전 실적 = 0' 만으로 판정해 연 12억 고객도 New가 되었다.
    const rows = [
        ...fullYear('big', 2024, 100_000_000),
        ...fullYear('big', 2025, 100_000_000)
    ]
    const r = calculateRevenueForecast(rows, YEAR, AUG_2)

    assert.equal(r.debug.contribution.New.count, 0)
    assert.equal(r.debug.contribution.Stable.count, 1)
})

test('작년 하반기에 급증한 신규 고객은 활동 월수와 무관하게 HighPotential로 잡힌다', () => {
    // 1년 내내 거래하면서 하반기에 램프업하는 것이 전형적인 고성장 패턴이다.
    const rows = [
        ...Array.from({ length: 6 }, (_, i) => sale('hp', 2025, i + 1, 1_000_000)),
        ...Array.from({ length: 6 }, (_, i) => sale('hp', 2025, i + 7, 10_000_000))
    ]
    const r = calculateRevenueForecast(rows, YEAR, AUG_2)
    const seg = r.debug.contribution.HighPotential

    assert.equal(seg.count, 1)
    assert.ok(Number(seg.ratio) > 1.5, `하반기 모멘텀이 반영되어야 한다 (실제 ${seg.ratio}배)`)
    assert.ok(
        seg.forecastTargetYear <= seg.revenuePrevYear * FORECAST_CONFIG.HP_CAP + 1,
        '상한을 넘으면 안 된다'
    )
})

test('월별 시즌성이 예측 연도의 영업일 기준으로 재분배된다', () => {
    // 2026-02는 설날 이동으로 영업일 17일, 2025-02는 20일.
    // 작년 월 구성비를 그대로 복사하면 2월이 과대 예측된다.
    const rows = [
        ...fullYear('flat', 2024, 10_000_000),
        ...fullYear('flat', 2025, 10_000_000)
    ]
    const r = calculateRevenueForecast(rows, YEAR, JAN_1)

    const total = r.monthlyData.reduce((a, m) => a + m.forecast, 0)
    const febShare = r.monthlyData[1].forecast / total

    assert.ok(
        febShare < 1 / 12,
        `매월 균등 실적이라도 영업일이 적은 2월 비중은 1/12보다 작아야 한다 (실제 ${(febShare * 100).toFixed(2)}%)`
    )
    // 2월이 연중 최저 비중이어야 한다 (영업일 17일로 가장 적음)
    const minMonth = r.monthlyData.reduce((min, m) => (m.forecast < min.forecast ? m : min))
    assert.equal(minMonth.month, 2)
})

test('올해 실적 입력이 거의 없으면 incompleteFlag로 표시된다', () => {
    const rows = fullYear('c', 2025, 100_000_000) // 2026 데이터 없음
    const r = calculateRevenueForecast(rows, YEAR, AUG_2)

    assert.equal(r.incompleteFlag, true)
    assert.equal(r.debug.clampedScale, 1.0, '데이터 미입력 시 축소 보정을 걸면 안 된다')
    assert.ok(r.analysis_summary.startsWith('⚠️'), '요약문에 경고가 포함되어야 한다')
})

test('YTD 보정 배율은 설정된 범위로 제한된다', () => {
    const rows = [
        ...fullYear('c', 2024, 10_000_000),
        ...fullYear('c', 2025, 10_000_000),
        ...Array.from({ length: 7 }, (_, i) => sale('c', YEAR, i + 1, 100_000_000)) // 10배 폭증
    ]
    const r = calculateRevenueForecast(rows, YEAR, AUG_2)

    assert.ok(r.debug.rawScale > FORECAST_CONFIG.SCALE_MAX, '원시 배율은 범위를 벗어난 상태여야 한다')
    assert.equal(r.debug.clampedScale, FORECAST_CONFIG.SCALE_MAX)
})

test('이탈 고객은 예측에서 제외되거나 잔존 수준으로만 유지된다', () => {
    const stopped = [...fullYear('stop', 2024, 10_000_000), sale('stop', 2025, 1, 50_000)]
    const r = calculateRevenueForecast(stopped, YEAR, JAN_1)

    assert.equal(r.debug.contribution.Churned.count, 1)
    assert.equal(r.debug.contribution.Churned.forecastTargetYear, 0, '거래 중단 고객은 0이어야 한다')
})

test('세그먼트별 예측 합계가 전체 예측 기반과 일치한다', () => {
    const rows = [
        ...fullYear('a', 2024, 10_000_000),
        ...fullYear('a', 2025, 12_000_000),
        ...fullYear('b', 2024, 20_000_000),
        ...fullYear('b', 2025, 15_000_000),
        [sale('c', 2025, 11, 5_000_000)]
    ].flat()
    const r = calculateRevenueForecast(rows, YEAR, JAN_1)

    const segTotal = Object.values(r.debug.contribution).reduce((a, s) => a + s.forecastTargetYear, 0)
    const monthlyTotal = r.monthlyData.reduce((a, m) => a + m.forecast, 0)

    // 보정 배율 적용 후이므로 배율만큼의 차이는 허용
    const expected = segTotal * r.debug.clampedScale
    assert.ok(
        Math.abs(monthlyTotal - expected) / expected < 0.001,
        `월별 합계(${monthlyTotal})와 세그먼트 합계x배율(${expected})이 일치해야 한다`
    )
})
