import { callGeminiWithRetry, isGeminiAvailable } from './geminiService'
import { formatCurrency } from '../utils/formatters'
import { todayYmd } from '../utils/day'

/**
 * Build analysis prompt for Gemini
 * @param {object} data - Analysis data from DataContext
 * @returns {string} - Formatted prompt
 */
function buildAnalysisPrompt(data) {
    const topClientsRevenue = data.topClients.slice(0, 3).reduce((sum, c) => sum + c.total, 0)
    const totalRevenue = data.topClients.reduce((sum, c) => sum + c.total, 0)
    const concentration = totalRevenue > 0 ? ((topClientsRevenue / totalRevenue) * 100).toFixed(0) : 0

    return `당신은 B2B 영업 전문 AI 코치입니다.
다음 실제 데이터를 분석하여 오늘 가장 중요한 영업 조언 1개를 생성하세요.

## 현재 데이터
- 현재 날짜: ${data.currentDate} (${data.dayOfMonth}일차)
- 휴면 고객: ${data.dormantClients.length}개
  상위 5개 예시: ${JSON.stringify(data.dormantClients.slice(0, 5).map(c => ({
        company: c.company,
        lastSale: c.lastSaleDate,
        revenue: c.historicalRevenue
    })), null, 2)}
- 최근 7일 활동: ${data.recentActivities.length}건
- 매출 집중도: 상위 3개 고객이 ${concentration}% 차지
- 활성 고객: ${data.activeClients}개
- 이번 달 매출: ${formatCurrency(data.currentMonthSales)}

## 출력 형식 (반드시 JSON으로만 응답)
{
  "adviceType": "DORMANT_CLIENTS|CONCENTRATION_RISK|LOW_ACTIVITY|MONTH_START|HIGH_ACTIVITY|MONTH_END",
  "adviceText": "구체적인 조언 (50자 이내, 이모지 1개 포함)",
  "priority": "HIGH|MEDIUM|LOW",
  "reasoning": "왜 이 조언이 가장 중요한지 1줄 설명",
  "dataSelection": {
    "type": "DORMANT_CLIENTS|TOP_CLIENTS|RECENT_ACTIVITIES",
    "sortBy": "historicalRevenue|lastSaleDate|revenue",
    "limit": 20,
    "filter": "추가 필터 조건 설명 (선택사항)"
  },
  "actionItems": ["구체적 액션1", "액션2", "액션3"]
}

## 우선순위 가이드
1. 휴면 고객 (5개 이상) → 즉시 수익 회복 가능성
2. 매출 집중도 (70% 이상) → 리스크 관리 필요
3. 활동 부족 (3건 미만, 5일 이후) → 파이프라인 위험
4. 월초 (1-7일) → 모멘텀 구축
5. 월중 (8-20일) → 파이프라인 가속
6. 월말 (21일~) → 클로징 집중

조언은 반드시 실행 가능하고 구체적이어야 합니다.
JSON 형식으로만 응답하세요.`
}

/**
 * Select and filter data based on AI guidance
 * @param {object} rawData - Full data from DataContext
 * @param {object} selection - AI's dataSelection object
 * @returns {array} - Filtered and sorted data
 */
function selectDataByAIGuidance(rawData, selection) {
    const { type, sortBy, limit } = selection

    switch (type) {
        case 'DORMANT_CLIENTS': {
            let clients = [...rawData.dormantClientsDetails]

            // Sort
            if (sortBy === 'historicalRevenue') {
                clients.sort((a, b) => b.historicalRevenue - a.historicalRevenue)
            } else if (sortBy === 'lastSaleDate') {
                clients.sort((a, b) => new Date(b.lastSaleDate) - new Date(a.lastSaleDate))
            }

            return clients.slice(0, limit || 20)
        }

        case 'TOP_CLIENTS': {
            return rawData.topClientsDetails.slice(0, limit || 10)
        }

        case 'RECENT_ACTIVITIES': {
            let activities = [...rawData.recentActivitiesDetails]
            activities.sort((a, b) => new Date(b.date) - new Date(a.date))
            return activities.slice(0, limit || 20)
        }

        default:
            return []
    }
}

/**
 * Generate daily AI advice with related data
 * @param {object} rawData - Full data from DataContext
 * @returns {Promise<object>} - Complete advice object
 */
export async function generateDailyAdvice(rawData) {
    // Check if Gemini is available
    if (!isGeminiAvailable()) {
        console.warn('[AI Sales Coach] Gemini API not available, using fallback')
        return getFallbackAdvice(rawData)
    }

    try {
        // 1. Prepare analysis data
        const analysisData = {
            dormantClients: rawData.dormantClientsDetails || [],
            recentActivities: rawData.recentActivitiesDetails || [],
            topClients: rawData.topRevenueClients || [],
            activeClients: rawData.currentActiveClientsCount || 0,
            currentMonthSales: rawData.currentMonthSalesTotal || 0,
            currentDate: todayYmd(),
            dayOfMonth: new Date().getDate()
        }

        // 2. Call Gemini API
        const prompt = buildAnalysisPrompt(analysisData)
        const aiResponse = await callGeminiWithRetry(prompt, {
            temperature: 0.7,
            maxOutputTokens: 500
        })

        // 3. Validate response
        if (!aiResponse.adviceType || !aiResponse.adviceText) {
            console.warn('[AI Sales Coach] Invalid AI response, using fallback')
            return getFallbackAdvice(rawData)
        }

        // 4. Filter data based on AI selection
        const relatedData = selectDataByAIGuidance(rawData, aiResponse.dataSelection || {
            type: aiResponse.adviceType,
            sortBy: 'historicalRevenue',
            limit: 20
        })

        // 5. Return complete advice object
        return {
            advice: aiResponse.adviceText,
            adviceType: aiResponse.adviceType,
            priority: aiResponse.priority || 'MEDIUM',
            relatedData: relatedData,
            reasoning: aiResponse.reasoning || '',
            actionItems: aiResponse.actionItems || [],
            generatedAt: new Date().toISOString(),
            isAIGenerated: true
        }

    } catch (error) {
        console.error('[AI Sales Coach] Generation failed:', error)
        return getFallbackAdvice(rawData)
    }
}

/**
 * Fallback advice when AI is unavailable
 * @param {object} rawData 
 * @returns {object}
 */
function getFallbackAdvice(rawData) {
    const dormantCount = rawData.dormantClientsDetails?.length || 0
    const recentActivities = rawData.recentActivitiesDetails?.length || 0
    const today = new Date().getDate()

    // Simple rule-based fallback
    if (dormantCount >= 5) {
        return {
            advice: `${dormantCount}개 휴면 고객사가 재활성화를 기다리고 있습니다. 3개월 이상 거래가 없는 기존 고객에게 연락하여 신규 수요를 발굴하세요! 📞`,
            adviceType: 'DORMANT_CLIENTS',
            priority: 'HIGH',
            relatedData: rawData.dormantClientsDetails?.slice(0, 20) || [],
            reasoning: '휴면 고객 재활성화는 신규 고객 확보보다 비용 효율적입니다',
            actionItems: ['상위 20개 고객사 리스트 확인', '과거 거래 내역 검토', '맞춤 제안서 준비'],
            generatedAt: new Date().toISOString(),
            isAIGenerated: false
        }
    }

    if (recentActivities < 3 && today > 5) {
        return {
            advice: `최근 7일간 활동이 ${recentActivities}건에 불과합니다. 주요 고객사와의 접점을 늘리고 파이프라인을 활성화하세요! 🚀`,
            adviceType: 'LOW_ACTIVITY',
            priority: 'HIGH',
            relatedData: rawData.recentActivitiesDetails || [],
            reasoning: '영업 활동 부족은 다음 달 매출 감소로 이어집니다',
            actionItems: ['주요 고객사 미팅 일정 잡기', '신규 리드 발굴', '파이프라인 점검'],
            generatedAt: new Date().toISOString(),
            isAIGenerated: false
        }
    }

    // Default advice
    return {
        advice: `${rawData.currentActiveClientsCount || 0}개 활성 고객사를 관리 중입니다. 주간 목표를 설정하고 우선순위 고객사에 집중하세요.`,
        adviceType: 'GENERAL',
        priority: 'MEDIUM',
        relatedData: [],
        reasoning: '안정적인 고객 관리가 지속 가능한 성장의 기반입니다',
        actionItems: ['주간 목표 설정', '우선순위 고객사 선정', '활동 계획 수립'],
        generatedAt: new Date().toISOString(),
        isAIGenerated: false
    }
}

/**
 * Cache key generator
 * @param {string} date - YYYY-MM-DD
 * @returns {string}
 */
export function getAdviceCacheKey(date) {
    return `ai-sales-advice-${date}`
}

/**
 * Get cached advice
 * @param {string} date - YYYY-MM-DD
 * @returns {object|null}
 */
export function getCachedAdvice(date) {
    try {
        const key = getAdviceCacheKey(date)
        const cached = localStorage.getItem(key)
        if (cached) {
            const parsed = JSON.parse(cached)
            // Check if cache is from today
            if (parsed.generatedAt && new Date(parsed.generatedAt).toDateString() === new Date(date).toDateString()) {
                return parsed
            }
        }
    } catch (error) {
        console.error('[AI Sales Coach] Cache read error:', error)
    }
    return null
}

/**
 * Save advice to cache
 * @param {string} date - YYYY-MM-DD
 * @param {object} advice 
 */
export function cacheAdvice(date, advice) {
    try {
        const key = getAdviceCacheKey(date)
        localStorage.setItem(key, JSON.stringify(advice))
    } catch (error) {
        console.error('[AI Sales Coach] Cache write error:', error)
    }
}
