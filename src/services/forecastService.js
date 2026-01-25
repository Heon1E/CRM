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
            // 1. Fetch raw sales data (Heavy query - fetch 3 years for cohort analysis)
            const { data: sales, error } = await supabase
                .from('sales')
                .select('sale_date, total_amount, client_id')
                .gte('sale_date', `${new Date().getFullYear() - 3}-01-01`) // Fetch last 3 years

            if (error) throw error

            // 2. Run Engine
            const result = calculateRevenueForecast(sales)

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
                segments: result.segments, // Pass segment debug info to UI (even if not in DB)
                created_at: saved.created_at || new Date().toISOString() // Ensure date exists
            }

        } catch (e) {
            console.error('Forecast generation failed:', e)
            throw e
        }
    }
}
