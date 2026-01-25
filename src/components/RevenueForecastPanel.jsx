import React, { useState, useEffect } from 'react'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { BrainCircuit, RefreshCw, TrendingUp, AlertCircle } from 'lucide-react'
import { ForecastService } from '../services/forecastService'
import { useAuth } from '../contexts/AuthContext'
import { formatKoreanCurrency } from '../utils/formatters'

const RevenueForecastPanel = () => {
    const { user } = useAuth()
    const [data, setData] = useState(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState(null)

    // 1. Load cached forecast on mount
    useEffect(() => {
        const loadCache = async () => {
            const cached = await ForecastService.getCachedForecast(new Date().getFullYear())
            if (cached) {
                setData(cached)
            }
        }
        loadCache()
    }, [])

    // 2. Handle Analysis Trigger
    const handleAnalyze = async () => {
        if (!user) return
        setLoading(true)
        setError(null)
        try {
            // Add artificial delay for "Thinking" effect if too fast
            const start = Date.now()
            const result = await ForecastService.generateAndCacheForecast(user.id)
            const duration = Date.now() - start
            if (duration < 1500) await new Promise(r => setTimeout(r, 1500 - duration))

            setData(result)
        } catch (e) {
            console.error(e)
            setError('Analysis failed. Please try again later.')
        } finally {
            setLoading(false)
        }
    }

    // --- Render Logic ---

    if (loading) {
        return (
            <div className="oem-panel h-[320px] flex flex-col items-center justify-center bg-white p-6 relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-blue-50/50 to-transparent animate-pulse" />
                <BrainCircuit className="w-12 h-12 text-oem-blue animate-bounce mb-4" />
                <h3 className="text-lg font-bold text-oem-blue mb-2">AI Analyzing Data...</h3>
                <p className="text-sm text-oem-text-secondary text-center max-w-xs">
                    Engine is processing historical trends, churn risks, and seasonal patterns.
                </p>
                <div className="w-48 h-1.5 bg-gray-100 rounded-full mt-6 overflow-hidden">
                    <div className="h-full bg-oem-blue animate-[loading_2s_ease-in-out_infinite]" style={{ width: '50%' }} />
                </div>
            </div>
        )
    }

    if (!data) {
        return (
            <div className="oem-panel h-[320px] flex flex-col items-center justify-center bg-white p-6 relative">
                <div className="absolute top-0 right-0 p-2">
                    <span className="bg-purple-100 text-purple-700 text-[10px] font-bold px-2 py-0.5 rounded-full border border-purple-200">BETA FEATURE</span>
                </div>
                <BrainCircuit className="w-12 h-12 text-oem-text-secondary mb-4 opacity-50" />
                <h3 className="text-lg font-bold text-oem-text-primary mb-2">AI Revenue Forecast</h3>
                <p className="text-sm text-oem-text-secondary text-center max-w-xs mb-6">
                    Predict year-end revenue using advanced cohort & trend analysis algorithms.
                </p>
                <button
                    onClick={handleAnalyze}
                    className="bg-oem-blue hover:bg-blue-700 text-white font-bold py-2.5 px-6 rounded shadow-lg shadow-blue-500/30 transition-all hover:scale-105 flex items-center gap-2"
                >
                    <TrendingUp className="w-4 h-4" />
                    RUN_ANALYSIS_ENGINE
                </button>
                {error && (
                    <div className="mt-4 flex items-center gap-2 text-red-500 text-xs font-bold bg-red-50 px-3 py-2 rounded">
                        <AlertCircle className="w-3 h-3" />
                        {error}
                    </div>
                )}
            </div>
        )
    }

    return (
        <div className="oem-panel bg-white h-auto md:h-[320px] flex flex-col">
            <div className="p-4 border-b border-oem-border flex justify-between items-start">
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-bold text-lg text-oem-text-primary">Annual Forecast</h3>
                        <span className="bg-purple-100 text-purple-700 text-[10px] font-bold px-2 py-0.5 rounded-full border border-purple-200 flex items-center gap-1">
                            <BrainCircuit className="w-3 h-3" /> AI GENERATED
                        </span>
                    </div>
                    <p className="text-[11px] text-oem-text-secondary">
                        Calculated: {(() => {
                            const d = new Date(data.created_at)
                            return !isNaN(d.getTime())
                                ? `${d.toLocaleDateString()} ${d.toLocaleTimeString()}`
                                : 'Just now'
                        })()}
                    </p>
                </div>
                <div className="text-right">
                    <div className="text-2xl font-bold text-oem-blue tracking-tight">
                        {formatKoreanCurrency(data.total_amount)}
                    </div>
                    <div className={`text-[11px] font-bold ${Number(data.growth_rate) >= 0 ? 'text-oem-green' : 'text-oem-red'}`}>
                        {Number(data.growth_rate) >= 0 ? '▲' : '▼'} {data.growth_rate}% (YoY)
                    </div>
                </div>
            </div>

            <div className="flex-1 w-full min-h-[150px] relative">
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data.monthlyData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                        <defs>
                            <linearGradient id="colorForecast" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#8884d8" stopOpacity={0.1} />
                                <stop offset="95%" stopColor="#8884d8" stopOpacity={0} />
                            </linearGradient>
                            <pattern id="patternRequest" patternUnits="userSpaceOnUse" width="4" height="4" patternTransform="rotate(45)">
                                <rect width="2" height="4" transform="translate(0,0)" fill="#e5e7eb" />
                            </pattern>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                        <XAxis
                            dataKey="month"
                            axisLine={false}
                            tickLine={false}
                            tick={{ fontSize: 10, fill: '#9ca3af' }}
                            tickFormatter={(v) => `${v}월`}
                        />
                        <YAxis hide />
                        <Tooltip
                            contentStyle={{ borderRadius: '4px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}
                            labelFormatter={(v) => `${v}월`}
                            formatter={(val, name, props) => [
                                formatKoreanCurrency(val),
                                props.payload.isForecast ? 'Forecast' : 'Actual'
                            ]}
                        />

                        {/* Forecast Part (Dashed or Lighter) - Visual Trick: Check 'isForecast' in active dot? */}
                        <Area
                            type="monotone"
                            dataKey="forecast"
                            stroke="#8884d8"
                            strokeWidth={2}
                            fillOpacity={1}
                            fill="url(#colorForecast)"
                            animationDuration={1500}
                        />
                    </AreaChart>
                </ResponsiveContainer>

                {/* Helper Badge for Chart */}
                <div className="absolute bottom-2 right-2 flex gap-3 text-[10px] items-center bg-white/80 p-1 rounded backdrop-blur-sm">
                    <div className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-[#8884d8]"></span>
                        <span className="text-gray-500">Trend Line</span>
                    </div>
                </div>
            </div>

            <div className="p-3 bg-gray-50 border-t border-oem-border flex justify-between items-center">
                <p className="text-[10px] text-oem-text-secondary italic flex-1 mr-4 line-clamp-1" title={data.analysis_summary}>
                    "{data.analysis_summary}"
                </p>
                <button
                    onClick={handleAnalyze}
                    className="text-gray-400 hover:text-oem-blue transition-colors p-1"
                    title="Re-run analysis"
                >
                    <RefreshCw className="w-3.5 h-3.5" />
                </button>
            </div>
        </div>
    )
}

export default RevenueForecastPanel
