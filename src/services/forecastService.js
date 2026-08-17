import { supabase } from '../lib/supabase'
import { calculateRevenueForecast } from '../utils/revenueForecastEngine'

export const ForecastService = {
    /**
     * Get cached forecast or null if expired/missing
     * @param {number} year 
     */
    async getCachedForecast(year) {
        try {
            const { data, error } = await supabase
                .from('revenue_forecasts')
                .select('*')
                .eq('forecast_year', year)
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle()

            if (error) throw error
            if (!data) return null

            // Check expiry (e.g., 24 hours cache)
            const created = new Date(data.created_at)
            const now = new Date()
            const diffHours = (now - created) / 1000 / 60 / 60

            if (diffHours > 24) return null // Expired

            return {
                ...data,
                monthlyData: typeof data.monthly_data === 'string' ? JSON.parse(data.monthly_data) : data.monthly_data
            }

        } catch (e) {
            console.warn('Forecast cache fetch failed:', e)
            return null
        }
    },

    /**
     * Run heavy calculation and save to DB
     */
    async generateAndCacheForecast(userId) {
        try {
            // 1. Fetch raw sales data (Heavy query - fetch 3 years with pagination)
            let allSales = []
            let page = 0
            const pageSize = 1000

            while (true) {
                const { data: salesChunk, error } = await supabase
                    .from('sales')
                    .select('sale_date, total_amount, client_id')
                    .gte('sale_date', `${new Date().getFullYear() - 3}-01-01`)
                    // 휴지통에 든 매출은 빼야 한다. 지금은 지운 매출이 0건이라
                    // 티가 안 나지만, 잘못 올린 매출을 지우는 순간 예측만 옛 값을
                    // 계속 쓰게 된다 (다른 화면은 전부 걸러 낸다).
                    .is('deleted_at', null)
                    // 정렬 없는 .range()는 페이지 간 행 중복/누락을 일으켜 집계 총액을 틀리게 만든다.
                    // id를 tie-breaker로 두어 sale_date가 같은 행의 순서까지 고정한다.
                    .order('sale_date', { ascending: true })
                    .order('id', { ascending: true })
                    .range(page * pageSize, (page + 1) * pageSize - 1)

                if (error) throw error
                if (!salesChunk || salesChunk.length === 0) break

                allSales = [...allSales, ...salesChunk]
                if (salesChunk.length < pageSize) break
                page++
            }

            const sales = allSales // Assign to variable used by engine

            // 2. Run Engine
            const result = calculateRevenueForecast(sales)

            // 진단용 출력. console.table로 20행짜리 배열을 세 번 찍는 일이라
            // 그 자체로 눈에 띄게 느리다. 개발 중에만 남긴다.
            if (import.meta.env.DEV && result.debug) {
                console.group('AI Forecast Debug Report (v7.0)')
                console.log('%c Revenue Audit', 'font-weight: bold; color: #4F46E5')
                console.table(result.debug.audit)

                console.log('%c Segment Contribution', 'font-weight: bold; color: #4F46E5')
                console.table(result.debug.contribution)

                if (result.debug.stoppedClients?.length > 0) {
                    console.log('%c ⚠️ Stopped/Declining Clients (Sample)', 'color: #EF4444')
                    console.table(result.debug.stoppedClients)
                }

                if (result.debug.highPotentialClients?.length > 0) {
                    console.log('%c 🚀 High Potential New Clients (Sample)', 'color: #10B981')
                    console.table(result.debug.highPotentialClients)
                }

                if (result.debug.newThisYearClients?.length > 0) {
                    console.log('%c 🌱 New Clients Acquired This Year (Sample)', 'color: #0EA5E9')
                    console.table(result.debug.newThisYearClients)
                }

                console.log(`Scale Factor: ${result.debug.clampedScale} (Raw: ${result.debug.rawScale.toFixed(3)})`)
                console.groupEnd()
            }

            // 이 경고만은 배포에서도 남긴다 — 숫자를 믿으면 안 되는 상황이다.
            if (result.incompleteFlag) {
                console.warn('올해 매출 입력이 거의 없어 YTD 보정을 건너뛰었습니다. 예측 신뢰도가 낮습니다.')
            }

            // 3. Save to DB
            const { data: saved, error: saveError } = await supabase
                .from('revenue_forecasts')
                .insert([{
                    forecast_year: result.forecastYear,
                    total_amount: result.total_amount, // Updated key
                    monthly_data: result.monthlyData,
                    growth_rate: result.growth_rate,   // Updated key
                    analysis_summary: result.analysis_summary, // Updated key if needed
                    user_id: userId
                }])
                .select()
                .single()

            if (saveError) {
                // If table doesn't exist, return result without caching
                console.warn('Failed to cache forecast:', saveError.message)
                // Add current time as created_at for UI display
                return {
                    ...result,
                    created_at: new Date().toISOString()
                }
            }

            return {
                ...saved,
                monthlyData: saved.monthly_data,
                // DB 컬럼에 없는 진단 정보는 계산 결과에서 그대로 전달한다.
                // (캐시로 재조회될 때는 analysis_summary의 ⚠️ 문구로만 남는다)
                incompleteFlag: result.incompleteFlag,
                holidayDataMissing: result.holidayDataMissing,
                contribution: result.debug?.contribution,
                created_at: saved.created_at || new Date().toISOString() // Ensure date exists
            }

        } catch (e) {
            console.error('Forecast generation failed:', e)
            throw e
        }
    }
}
