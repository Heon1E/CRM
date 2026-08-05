import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

/**
 * 환경변수 누락 여부.
 *
 * 예전에는 값이 없으면 조용히 'https://placeholder.supabase.co'로 폴백했다.
 * 그러면 앱은 정상 기동하지만 모든 조회가 실패해서, 화면에는
 * "매출 데이터를 불러오는 중 오류가 발생했습니다" 같은 엉뚱한 메시지만 뜬다.
 * 원인이 환경변수라는 걸 알아채기까지 한참 걸린다.
 *
 * 특히 배포 환경에서 잘 생긴다. `.env.local`은 git에 올라가지 않으므로
 * Vercel/Netlify에는 별도로 환경변수를 등록해야 하는데, 이걸 빠뜨리면
 * 로컬에서는 멀쩡하고 배포본만 깨진다.
 */
export const supabaseConfigError = (() => {
    const missing = []
    if (!supabaseUrl) missing.push('VITE_SUPABASE_URL')
    if (!supabaseAnonKey) missing.push('VITE_SUPABASE_ANON_KEY')
    if (missing.length > 0) return `환경변수 누락: ${missing.join(', ')}`
    if (supabaseUrl.includes('placeholder')) return '환경변수에 placeholder 값이 들어 있습니다.'
    return null
})()

if (supabaseConfigError) {
    console.error(
        `[Supabase] ${supabaseConfigError}\n` +
        '  이 상태에서는 모든 데이터 조회가 실패합니다.\n' +
        '  로컬: .env.local 에 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY 설정\n' +
        '  배포: Vercel 프로젝트 Settings > Environment Variables 에 같은 값 등록 후 재배포\n' +
        '  (VITE_ 접두어가 붙은 값은 빌드 시점에 주입되므로, 등록만 하고 재배포하지 않으면 반영되지 않습니다)'
    )
} else {
    console.log('[Supabase] Initializing with URL:', supabaseUrl.substring(0, 15) + '...')
}

export const supabase = createClient(
    supabaseUrl || 'https://placeholder.supabase.co',
    supabaseAnonKey || 'placeholder-key',
    {
        auth: {
            persistSession: true,
            autoRefreshToken: true
        }
    }
)
