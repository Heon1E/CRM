import React, { useState, useEffect } from 'react'
import { Sparkles, TrendingUp, Users, Target, AlertTriangle, Zap, Phone, ChevronRight } from 'lucide-react'
import { formatCurrency } from '../utils/formatters'
import { generateDailyAdvice, getCachedAdvice, cacheAdvice } from '../services/aiSalesCoach'
import AIInsightModal from './AIInsightModal'

const AIHeadline = ({ user, stats, loading }) => {
    const [aiAdvice, setAiAdvice] = useState(null)
    const [isGenerating, setIsGenerating] = useState(false)
    const [showModal, setShowModal] = useState(false)

    // Generate AI advice when stats are available
    useEffect(() => {
        if (loading || !stats) return

        const generateAdvice = async () => {
            // Check cache first
            const today = new Date().toISOString().split('T')[0]
            const cached = getCachedAdvice(today)

            if (cached) {
                setAiAdvice(cached)
                return
            }

            // Generate new advice
            setIsGenerating(true)
            try {
                const advice = await generateDailyAdvice(stats)
                setAiAdvice(advice)
                cacheAdvice(today, advice)
            } catch (error) {
                console.error('[AIHeadline] Failed to generate advice:', error)
            } finally {
                setIsGenerating(false)
            }
        }

        generateAdvice()
    }, [stats, loading])

    // Icon mapping
    const iconMap = {
        DORMANT_CLIENTS: Phone,
        CONCENTRATION_RISK: AlertTriangle,
        LOW_ACTIVITY: Target,
        MONTH_START: Sparkles,
        HIGH_ACTIVITY: Zap,
        MONTH_END: Target,
        GENERAL: Sparkles
    }

    // Intent mapping
    const intentMap = {
        HIGH: 'warning',
        MEDIUM: 'neutral',
        LOW: 'neutral'
    }

    if (loading || isGenerating) {
        return (
            <div className="p-4 rounded-lg border bg-blue-50 text-blue-700 border-blue-100 flex items-center gap-3 shadow-sm mb-6 animate-pulse">
                <div className="p-2 rounded-full bg-white bg-opacity-70 shadow-sm">
                    <Sparkles className="w-5 h-5" />
                </div>
                <div className="flex-1">
                    <p className="font-bold text-xs tracking-wide uppercase opacity-75 mb-0.5">AI SALES COACH</p>
                    <p className="text-base font-semibold leading-snug">비즈니스 데이터를 분석 중입니다...</p>
                </div>
            </div>
        )
    }

    if (!aiAdvice) {
        return null
    }

    const Icon = iconMap[aiAdvice.adviceType] || Sparkles
    const intent = intentMap[aiAdvice.priority] || 'neutral'

    const styles = {
        warning: "bg-amber-50 border-1 border-amber-200 text-amber-900",
        success: "bg-emerald-50 border-1 border-emerald-200 text-emerald-900",
        neutral: "bg-blue-50 border-1 border-blue-200 text-blue-900"
    }

    const hasData = aiAdvice.relatedData && aiAdvice.relatedData.length > 0

    return (
        <>
            <div
                className={`p-0 rounded-sm ${styles[intent]} mb-6 transition-all cursor-pointer group hover:shadow-md border border-gray-200 border-l-4`}
                onClick={() => hasData && setShowModal(true)}
                style={{ cursor: hasData ? 'pointer' : 'default' }}
            >
                <div className="p-4 flex items-start gap-4">
                    <div className={`p-2 rounded-sm shadow-sm flex-shrink-0 ${intent === 'warning' ? 'bg-amber-100 text-amber-600' : intent === 'success' ? 'bg-emerald-100 text-emerald-600' : 'bg-blue-100 text-blue-600'}`}>
                        <Icon className="w-5 h-5 md:w-6 md:h-6" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                            <p className="font-bold text-[10px] md:text-xs tracking-widest uppercase opacity-70">AI SALES COACH</p>
                            {aiAdvice.isAIGenerated && (
                                <span className="text-[9px] bg-white border border-gray-200 px-1.5 py-0.5 rounded-sm font-bold text-gray-500 flex-shrink-0">
                                    BETA
                                </span>
                            )}
                        </div>
                        <p className="text-sm md:text-base font-bold leading-relaxed break-keep text-gray-900">{aiAdvice.advice}</p>
                        {aiAdvice.reasoning && (
                            <p className="text-xs md:text-sm text-gray-600 mt-1 line-clamp-1 group-hover:line-clamp-none transition-all font-medium">{aiAdvice.reasoning}</p>
                        )}
                    </div>
                    {hasData && (
                        <div className="self-center bg-white border border-gray-200 p-1.5 rounded-sm hover:border-blue-300 hover:text-blue-600 transition-colors flex-shrink-0 shadow-sm">
                            <ChevronRight className="w-4 h-4" />
                        </div>
                    )}
                </div>
            </div>

            {showModal && (
                <AIInsightModal
                    advice={aiAdvice}
                    stats={stats}
                    onClose={() => setShowModal(false)}
                />
            )}
        </>
    )
}

export default AIHeadline
