import { supabase } from '../lib/supabase'

/**
 * 매출 집계 조회
 *
 * `execution/sql/sales_aggregates.sql`의 뷰를 읽는다. 브라우저가 매출 원본
 * 15,221행을 다 받는 대신 거래처×월로 줄여 받는다.
 *
 * **뷰가 없어도 앱은 돌아야 한다.** 마이그레이션 전이거나 실행을 잊었을 수
 * 있다. 그때는 `null`을 돌려주고, 부르는 쪽이 예전 경로(원본 전량)를 쓴다.
 * 화면이 먼저 죽으면 안 된다.
 */

const MISSING = (e) =>
    e && (e.code === 'PGRST205' || e.code === '42P01'
        || /does not exist|could not find the table/i.test(e.message || ''))

let warned = false
const warnOnce = (msg) => {
    if (warned) return
    warned = true
    console.warn(`[집계] ${msg} execution/sql/sales_aggregates.sql 을 실행하면 첫 화면이 빨라집니다.`)
}

/** 페이지네이션 — 집계라도 1000행을 넘을 수 있다 (Supabase 기본 제한) */
const fetchAll = async (view, cols, order) => {
    const out = []
    for (let from = 0; ; from += 1000) {
        const { data, error } = await supabase
            .from(view).select(cols).order(order).range(from, from + 999)
        if (error) return { data: null, error }
        out.push(...(data || []))
        if (!data || data.length < 1000) break
    }
    return { data: out, error: null }
}

/**
 * 거래처×월 매출.
 * 대시보드·KPI·영업 코치가 필요한 것이 전부 여기서 나온다.
 * @returns 행 배열, 또는 뷰가 없으면 `null`
 */
export const fetchClientMonthSales = async () => {
    const { data, error } = await fetchAll(
        'client_month_sales', 'client_id,ym,amount,cnt,last_date', 'ym')
    if (error) {
        if (MISSING(error)) { warnOnce('집계 뷰가 없습니다.'); return null }
        console.error('[집계] 조회 실패:', error.message)
        return null
    }
    return data
}

/** 월별 전사 합계 — 상단 카드·추이용. 몇십 행이면 끝난다. */
export const fetchMonthlySales = async () => {
    const { data, error } = await supabase
        .from('monthly_sales').select('ym,amount,cnt,client_count').order('ym')
    if (error) {
        if (MISSING(error)) { warnOnce('집계 뷰가 없습니다.'); return null }
        console.error('[집계] 월별 조회 실패:', error.message)
        return null
    }
    return data
}

/** 거래처별 요약 — 목록 정렬·영업 코치용 */
export const fetchClientSummary = async () => {
    const { data, error } = await fetchAll(
        'client_sales_summary',
        'client_id,company,sales_rep,total_amount,this_year,last_year,recent_3m,prev_3m,last_sale_date',
        'client_id')
    if (error) {
        if (MISSING(error)) { warnOnce('집계 뷰가 없습니다.'); return null }
        console.error('[집계] 거래처 요약 조회 실패:', error.message)
        return null
    }
    return data
}
