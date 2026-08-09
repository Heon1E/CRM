/**
 * 로그인한 사용자를 영업사원 이름으로 옮긴다.
 *
 * `clients.sales_rep`에는 한글 이름이 들어 있는데 로그인 계정은 이메일이거나
 * 영문 이름이라 그대로는 맞춰볼 수 없다. 그 대응을 한 곳에 모아 둔다.
 * (예전에는 useDashboardData 안에만 있어서, 거래처 목록처럼 다른 화면에서
 *  '내 담당'을 판별할 방법이 없었다.)
 *
 * 영업사원이 늘면 SALES_REP_OPTIONS와 NAME_MAPPING 두 곳을 고친다.
 */

export const SALES_REP_OPTIONS = ['박민철', '송원기', '이헌일']

const NAME_MAPPING = {
    'Heonil Lee': '이헌일',
    'heonil lee': '이헌일',
    'Heonil': '이헌일',
    'heonil': '이헌일',
}

/**
 * @param {object|null} user - Supabase auth user
 * @returns {string|null} 한글 영업사원 이름
 */
export const resolveSalesRep = (user) => {
    if (!user) return null

    const userName = user.user_metadata?.full_name || user.email || ''
    if (NAME_MAPPING[userName]) return NAME_MAPPING[userName]
    if (SALES_REP_OPTIONS.includes(userName)) return userName

    const emailName = user.email?.split('@')[0]?.toLowerCase()
    if (emailName && NAME_MAPPING[emailName]) return NAME_MAPPING[emailName]

    return null
}
