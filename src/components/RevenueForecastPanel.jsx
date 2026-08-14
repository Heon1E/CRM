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
            if (cached) setData(cached)
        }
        loadCache()
    }, [])

    // 2. Handle Analysis Trigger
    const handleAnalyze = async () => {
        setLoading(true)
        setError(null)
        try {
            const start = Date.now()
            const result = await ForecastService.generateAndCacheForecast(user ? user.id : 'demo-user-123')
            const duration = Date.now() - start
            if (duration < 1500) await new Promise(r => setTimeout(r, 1500 - duration))
            if (!result) throw new Error('No data')
            setData(result)
        } catch (e) {
            console.error('[RevenueForecast] Analysis failed:', e)
            const msg = e?.message?.includes('No data')
                ? '분석할 매출 데이터가 없습니다.'
                : `분석 실패: ${e?.message || '알 수 없는 오류입니다.'}`
            setError(msg)
        } finally {
            setLoading(false)
        }
    }

    // --- Loading State ---
    if (loading) {
        return (
            <div className="oem-panel h-[320px] flex flex-col items-center justify-center p-6 relative overflow-hidden"
                style={{ backgroundColor: 'var(--bg-card)' }}>
                <div className="absolute inset-0 animate-pulse"
                    style={{ background: 'linear-gradient(90deg, transparent, rgba(16,185,129,0.04), transparent)' }} />
                <BrainCircuit className="w-12 h-12 animate-bounce mb-4" style={{ color: 'var(--accent)' }} />
                <h3 className="text-lg font-bold mb-2" style={{ color: 'var(--accent-light)' }}>AI Analyzing Data...</h3>
                <p className="text-sm text-center max-w-xs" style={{ color: 'var(--text-secondary)' }}>
                    Processing historical trends, churn risks, and seasonal patterns.
                </p>
                <div className="w-48 h-1.5 rounded-full mt-6 overflow-hidden" style={{ backgroundColor: 'var(--border)' }}>
                    <div className="h-full rounded-full animate-[loading_2s_ease-in-out_infinite]"
                        style={{ width: '60%', backgroundColor: 'var(--accent)' }} />
                </div>
            </div>
        )
    }

    // --- Empty State (No Data) ---
    if (!data) {
        return (
            <div className="oem-panel h-[320px] flex flex-col items-center justify-center p-6 relative"
                style={{ backgroundColor: 'var(--bg-card)' }}>
                <div className="absolute top-3 right-3">
                    <span className="badge-accent">시험 기능</span>
                </div>
                <BrainCircuit className="w-12 h-12 mb-4 opacity-30" style={{ color: 'var(--text-secondary)' }} />
                <h3 className="text-lg font-bold mb-2" style={{ color: 'var(--text-primary)' }}>AI Revenue Forecast</h3>
                <p className="text-sm text-center max-w-xs mb-6" style={{ color: 'var(--text-secondary)' }}>
                    Predict year-end revenue using advanced cohort & trend analysis algorithms.
                </p>
                <button
                    onClick={handleAnalyze}
                    className="font-bold py-2.5 px-6 rounded-lg transition-all hover:scale-105 flex items-center gap-2 shadow-lg"
                    style={{
                        backgroundColor: 'var(--accent)',
                        color: '#fff',
                        boxShadow: '0 4px 16px var(--accent-glow)'
                    }}
                >
                    <TrendingUp className="w-4 h-4" />
                    올해 매출 추정치 분석
                </button>
                {error && (
                    <div className="mt-4 flex items-center gap-2 text-xs font-bold px-3 py-2 rounded-lg"
                        style={{ color: 'var(--danger)', backgroundColor: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.2)' }}>
                        <AlertCircle className="w-3 h-3" />
                        {error}
                    </div>
                )}
            </div>
        )
    }

    // 캐시에서 읽어온 경우 incompleteFlag 컬럼이 없으므로 요약문의 경고 표식으로도 판단한다.
    const isLowConfidence = Boolean(data.incompleteFlag) || String(data.analysis_summary || '').startsWith('⚠️')

    // --- Data State ---
    return (
        <div className="oem-panel h-auto md:h-[320px] flex flex-col"
            style={{ backgroundColor: 'var(--bg-card)' }}>
            <div className="p-4 flex justify-between items-start" style={{ borderBottom: '1px solid var(--border)' }}>
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-bold text-lg" style={{ color: 'var(--text-primary)' }}>Annual Forecast</h3>
                        <span className="badge-accent flex items-center gap-1">
                            <BrainCircuit className="w-3 h-3" /> AI
                        </span>
                    </div>
                    <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                        Calculated: {(() => {
                            const d = new Date(data.created_at)
                            return !isNaN(d.getTime())
                                ? `${d.toLocaleDateString()} ${d.toLocaleTimeString()}`
                                : 'Just now'
                        })()}
                    </p>
                </div>
                <div className="text-right">
                    <div className="text-2xl font-bold tracking-tight" style={{ color: 'var(--accent-light)' }}>
                        {formatKoreanCurrency(data.total_amount)}
                    </div>
                    <div className="text-[11px] font-bold"
                        style={{ color: Number(data.growth_rate) >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                        {Number(data.growth_rate) >= 0 ? '▲' : '▼'} {data.growth_rate}% (YoY)
                    </div>
                    {isLowConfidence && (
                        <div className="mt-1 inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded"
                            style={{ color: 'var(--danger)', backgroundColor: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.2)' }}
                            title="올해 매출 입력이 거의 없어 실적 기반 보정을 적용하지 못했습니다.">
                            <AlertCircle className="w-3 h-3" />
                            데이터 부족
                        </div>
                    )}
                </div>
            </div>

            <div className="flex-1 w-full min-h-[150px] relative">
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data.monthlyData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                        <defs>
                            <linearGradient id="colorForecast" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#DC2626" stopOpacity={0.2} />
                                <stop offset="95%" stopColor="#DC2626" stopOpacity={0} />
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.04)" />
                        <XAxis
                            dataKey="month"
                            axisLine={false}
                            tickLine={false}
                            tick={{ fontSize: 10, fill: '#555E6E' }}
                            tickFormatter={(v) => `${v}월`}
                        />
                        <YAxis domain={[(dataMin) => Math.floor(dataMin * 0.85), 'auto']} hide />
                        <Tooltip
                            contentStyle={{
                                borderRadius: '8px',
                                border: '1px solid var(--border)',
                                backgroundColor: 'var(--bg-card)',
                                color: 'var(--text-primary)',
                                fontSize: '11px',
                                fontWeight: 'bold'
                            }}
                            labelFormatter={(v) => `${v}월`}
                            formatter={(val, name, props) => [
                                formatKoreanCurrency(val),
                                props.payload.isForecast ? 'Forecast' : 'Actual'
                            ]}
                        />
                        <Area
                            type="monotone"
                            dataKey="forecast"
                            stroke="#DC2626"
                            strokeWidth={2.5}
                            fillOpacity={1}
                            fill="url(#colorForecast)"
                            animationDuration={1500}
                        />
                    </AreaChart>
                </ResponsiveContainer>

                <div className="absolute bottom-2 right-2 flex gap-3 text-[10px] items-center px-2 py-1 rounded-lg"
                    style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                    <div className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: 'var(--accent)' }}></span>
                        <span style={{ color: 'var(--text-secondary)' }}>Trend Line</span>
                    </div>
                </div>
            </div>

            <div className="p-3 flex justify-between items-center" style={{ borderTop: '1px solid var(--border)' }}>
                <p className="text-[10px] italic flex-1 mr-4 line-clamp-1" style={{ color: 'var(--text-muted)' }}
                    title={data.analysis_summary}>
                    "{data.analysis_summary}"
                </p>
                <button
                    onClick={handleAnalyze}
                    className="transition-colors p-1"
                    style={{ color: 'var(--text-muted)' }}
                    title="Re-run analysis"
                    onMouseEnter={e => e.currentTarget.style.color = 'var(--accent)'}
                    onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}
                >
                    <RefreshCw className="w-3.5 h-3.5" />
                </button>
            </div>
        </div>
    )
}

export default RevenueForecastPanel
