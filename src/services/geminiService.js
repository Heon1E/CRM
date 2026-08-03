import { GoogleGenerativeAI } from '@google/generative-ai'

const API_KEY = import.meta.env.VITE_GEMINI_API_KEY

// 모델명은 구글이 주기적으로 단종시키므로 환경변수로 바꿀 수 있게 둔다.
// - gemini-1.5-flash : 단종됨 (모델 목록에 없음 -> 404)
// - gemini-2.0-flash : 무료 등급 할당량이 0이라 429가 난다
// - gemini-2.5-flash : 무료 등급에서 정상 동작 (실측 확인)
const DEFAULT_MODEL = import.meta.env.VITE_GEMINI_MODEL || 'gemini-2.5-flash'

if (!API_KEY) {
    console.warn('[Gemini Service] API key not found. AI features will be disabled.')
}

const genAI = API_KEY ? new GoogleGenerativeAI(API_KEY) : null

/**
 * 재시도해도 절대 성공할 수 없는 오류들.
 * 키가 무효인데 계속 재시도하면 콘솔이 같은 에러로 도배되고 네트워크만 낭비된다.
 */
const UNRECOVERABLE_PATTERN = /API key not valid|API_KEY_INVALID|API key expired|PERMISSION_DENIED|is not found for API version|models\/[\w.-]+ is not found/i

const isUnrecoverable = (error) => UNRECOVERABLE_PATTERN.test(error?.message || '')

// 복구 불가능한 오류가 한 번 확인되면 이후 호출을 아예 막는다 (경고는 1회만)
let disabledReason = null

const disableGemini = (error) => {
    if (disabledReason) return
    disabledReason = error?.message || 'unknown error'
    console.warn(
        '[Gemini Service] AI 기능을 비활성화합니다. 재시도해도 해결되지 않는 오류입니다.\n' +
        `  사유: ${disabledReason}\n` +
        '  조치: .env.local의 VITE_GEMINI_API_KEY를 확인하세요. ' +
        '키는 https://aistudio.google.com/apikey 에서 발급합니다. ' +
        `모델을 바꾸려면 VITE_GEMINI_MODEL을 지정하세요 (현재: ${DEFAULT_MODEL}).`
    )
}

/**
 * Call Gemini API with a prompt and return parsed JSON response
 * @param {string} prompt - The prompt to send to Gemini
 * @param {object} options - Optional configuration
 * @returns {Promise<object>} - Parsed JSON response
 */
export async function callGemini(prompt, options = {}) {
    if (!genAI) {
        throw new Error('Gemini API key not configured')
    }
    if (disabledReason) {
        // 이미 무효로 확인된 상태 - 네트워크 호출 없이 즉시 실패시킨다
        throw new Error(`Gemini disabled: ${disabledReason}`)
    }

    try {
        const model = genAI.getGenerativeModel({
            model: options.model || DEFAULT_MODEL,
            generationConfig: {
                temperature: options.temperature || 0.7,
                maxOutputTokens: options.maxOutputTokens || 500,
            }
        })

        const result = await model.generateContent(prompt)
        const response = await result.response
        const text = response.text()

        // Try to extract JSON from response (handle markdown code blocks)
        const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/) || text.match(/\{[\s\S]*\}/)

        if (jsonMatch) {
            const jsonText = jsonMatch[1] || jsonMatch[0]
            return JSON.parse(jsonText)
        }

        // If no JSON found, return raw text wrapped in object
        return { text, raw: true }

    } catch (error) {
        if (isUnrecoverable(error)) {
            disableGemini(error)
        } else {
            console.error('[Gemini Service] API call failed:', error)
        }
        throw new Error(`Gemini API error: ${error.message}`)
    }
}

/**
 * Check if Gemini API is available
 * @returns {boolean}
 */
export function isGeminiAvailable() {
    return !!genAI && !disabledReason
}

/** AI 기능이 꺼져 있다면 그 사유를 돌려준다 (UI 안내용). 정상이면 null */
export function getGeminiDisabledReason() {
    if (!genAI) return 'API 키가 설정되지 않았습니다.'
    return disabledReason
}

/**
 * Call Gemini with retry logic
 * @param {string} prompt 
 * @param {object} options 
 * @param {number} maxRetries 
 * @returns {Promise<object>}
 */
export async function callGeminiWithRetry(prompt, options = {}, maxRetries = 2) {
    let lastError

    for (let i = 0; i <= maxRetries; i++) {
        try {
            return await callGemini(prompt, options)
        } catch (error) {
            lastError = error

            // 키가 무효하거나 모델이 없는 경우는 몇 번을 더 불러도 결과가 같다.
            // 재시도하면 콘솔만 같은 에러로 도배된다.
            if (isUnrecoverable(error) || disabledReason) break

            if (i < maxRetries) {
                // Wait before retry (exponential backoff)
                await new Promise(resolve => setTimeout(resolve, Math.pow(2, i) * 1000))
            }
        }
    }

    throw lastError
}
