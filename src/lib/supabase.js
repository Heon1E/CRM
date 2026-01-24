import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// 로그 추가: 현재 로드된 환경 변수 상태 확인 (디버깅용)
console.log('[Supabase] Initializing with URL:', supabaseUrl?.substring(0, 15) + '...')
if (supabaseUrl?.includes('placeholder')) {
  console.warn('[Supabase] CRITICAL: Using placeholder URL! Check .env.local')
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





