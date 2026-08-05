/**
 * KPI 카테고리 오버라이드 관리
 * 
 * 거래처별 KPI 분류를 수동으로 오버라이드할 수 있는 유틸리티
 * 
 * 카테고리 옵션:
 * - null / 'auto'  : 자동 판정 (기본값)
 * - '신규'         : 신규 고객으로 인정
 * - '단절복구'     : 단절고객 복구로 분류
 * - '미산정'       : KPI 산정에서 제외
 */

const STORAGE_KEY = 'kpi_category_overrides'

// ---------------------------------------------------------------------------
// KPI별 개별 제외
//
// '미산정'(위 STORAGE_KEY)은 거래처를 KPI 전체에서 빼버린다.
// 그런데 실무에서는 항목별로 빼야 하는 경우가 있다:
//   - 기존 거래처에서 자회사로 파생된 곳 -> '신규고객 발굴'에서만 제외.
//     매출은 정상 실적이므로 수익성·부문기여 KPI에는 그대로 잡혀야 한다.
//   - 폐업/상호변경으로 복구 불가능한 곳  -> '단절고객 편입'에서만 제외.
// 그래서 전체 제외와 별도로 항목별 제외를 둔다.
// ---------------------------------------------------------------------------
const EXCLUSION_KEY = 'kpi_exclusions'

/** 제외 대상 KPI 종류 */
export const KPI_EXCLUSION_KINDS = {
    NEW: 'new',     // 신규고객 발굴
    CHURN: 'churn', // 단절고객 편입
}

/**
 * KPI별 제외 목록 전체 조회
 * @returns {Object} clientId → { new?: boolean, churn?: boolean }
 */
export function getKpiExclusions() {
    try {
        const stored = localStorage.getItem(EXCLUSION_KEY)
        return stored ? JSON.parse(stored) : {}
    } catch {
        return {}
    }
}

/**
 * 특정 거래처가 해당 KPI에서 제외되었는지
 * @param {Object} exclusions - getKpiExclusions() 결과
 * @param {string} clientId
 * @param {string} kind - 'new' | 'churn'
 */
export function isExcludedFrom(exclusions, clientId, kind) {
    return Boolean(exclusions?.[clientId]?.[kind])
}

/**
 * 제외 상태를 토글하고 갱신된 전체 목록을 돌려준다.
 * @param {string} clientId
 * @param {string} kind - 'new' | 'churn'
 * @returns {Object} 갱신된 제외 목록
 */
export function toggleKpiExclusion(clientId, kind) {
    const exclusions = getKpiExclusions()
    const current = { ...(exclusions[clientId] || {}) }

    if (current[kind]) {
        delete current[kind]
    } else {
        current[kind] = true
    }

    if (Object.keys(current).length === 0) {
        delete exclusions[clientId]
    } else {
        exclusions[clientId] = current
    }

    localStorage.setItem(EXCLUSION_KEY, JSON.stringify(exclusions))
    return exclusions
}

export const KPI_CATEGORIES = [
    { value: 'auto', label: '자동', color: 'text-gray-400', bg: 'bg-gray-100' },
    { value: '신규', label: '신규', color: 'text-blue-600', bg: 'bg-blue-50' },
    { value: '단절복구', label: '단절복구', color: 'text-amber-600', bg: 'bg-amber-50' },
    { value: '미산정', label: '미산정', color: 'text-red-500', bg: 'bg-red-50' },
]

/**
 * 모든 KPI 오버라이드 가져오기
 * @returns {Object} clientId → category 매핑
 */
export function getKpiOverrides() {
    try {
        const stored = localStorage.getItem(STORAGE_KEY)
        return stored ? JSON.parse(stored) : {}
    } catch {
        return {}
    }
}

/**
 * 특정 거래처의 KPI 카테고리 가져오기
 * @param {string} clientId 
 * @returns {string|null} 카테고리 ('auto', '신규', '단절복구', '미산정') 또는 null
 */
export function getKpiCategory(clientId) {
    const overrides = getKpiOverrides()
    return overrides[clientId] || null
}

/**
 * 특정 거래처의 KPI 카테고리 설정
 * @param {string} clientId 
 * @param {string} category - 'auto', '신규', '단절복구', '미산정'
 */
export function setKpiCategory(clientId, category) {
    const overrides = getKpiOverrides()
    if (!category || category === 'auto') {
        delete overrides[clientId]
    } else {
        overrides[clientId] = category
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides))
}

/**
 * KPI 카테고리별 거래처 ID 목록 반환
 * @param {string[]} managedClientIds - 내 담당 거래처 ID 목록
 * @param {Object[]} clients - 전체 클라이언트 데이터
 * @param {Object[]} rawSalesData - 전체 매출 데이터
 * @param {number} currentYear - 현재 연도
 * @param {number} previousYear - 전년도
 * @returns {{ newClients: string[], reactivated: string[], excluded: string[], autoNew: string[], autoReactivated: string[] }}
 */
export function categorizeClients(managedClientIds, clients, rawSalesData, currentYear, previousYear) {
    const overrides = getKpiOverrides()

    const result = {
        // 최종 분류 결과
        newClients: [],       // 신규로 인정된 거래처
        reactivated: [],      // 단절복구로 분류된 거래처
        excluded: [],         // 미산정 (KPI 제외)

        // 자동 판정 결과 (오버라이드 전)
        autoDetected: {},     // clientId → 자동 판정 결과 ('신규', '단절복구', '해당없음')
    }

    managedClientIds.forEach(clientId => {
        const override = overrides[clientId]

        // 자동 판정
        const hadSalesLastYear = (rawSalesData || []).some(s => {
            const d = new Date(s.sale_date || s.date)
            return s.client_id === clientId && d.getFullYear() === previousYear
        })

        const hasSalesThisYear = (rawSalesData || []).some(s => {
            const d = new Date(s.sale_date || s.date)
            return s.client_id === clientId && d.getFullYear() === currentYear
        })

        // 자동 판정 결과 저장
        if (!hadSalesLastYear && hasSalesThisYear) {
            result.autoDetected[clientId] = '신규'
        } else if (hadSalesLastYear && hasSalesThisYear) {
            // 단절 여부 체크 (6개월 이상 공백)
            const thisYearStart = new Date(currentYear, 0, 1)
            const clientSalesBefore = (rawSalesData || [])
                .filter(s => s.client_id === clientId && new Date(s.sale_date || s.date) < thisYearStart)
                .sort((a, b) => new Date(b.sale_date || b.date) - new Date(a.sale_date || a.date))

            if (clientSalesBefore.length > 0) {
                const lastSaleDate = new Date(clientSalesBefore[0].sale_date || clientSalesBefore[0].date)
                const gapMonths = (thisYearStart - lastSaleDate) / (30 * 24 * 60 * 60 * 1000)
                if (gapMonths >= 6) {
                    result.autoDetected[clientId] = '단절복구'
                } else {
                    result.autoDetected[clientId] = '기존'
                }
            } else {
                result.autoDetected[clientId] = '기존'
            }
        } else {
            result.autoDetected[clientId] = '기존'
        }

        // 오버라이드 적용
        const finalCategory = override || result.autoDetected[clientId]

        if (finalCategory === '미산정') {
            result.excluded.push(clientId)
        } else if (finalCategory === '신규') {
            result.newClients.push(clientId)
        } else if (finalCategory === '단절복구') {
            result.reactivated.push(clientId)
        }
    })

    return result
}
