import React, { createContext, useContext, useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { showError } from '../utils/alert'
import { resolveSalesRep, getStoredRep } from '../utils/salesRep'

const AuthContext = createContext()

export function useAuth() {
  return useContext(AuthContext)
}

/**
 * 아이디만 넣어도 되게 도메인을 붙여 준다.
 * Supabase Auth는 이메일을 요구하는데 사람은 'heoniree'처럼 아이디로 기억한다.
 */
const LOGIN_DOMAIN = import.meta.env.VITE_LOGIN_DOMAIN || 'idibc.local'
export const toLoginEmail = (idOrEmail) => {
  const v = String(idOrEmail || '').trim()
  return v.includes('@') ? v : `${v}@${LOGIN_DOMAIN}`
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  /**
   * 세션만 본다. **여기서 DB를 부르면 안 된다.**
   *
   * `onAuthStateChange` 콜백은 Supabase의 auth 잠금 안에서 돈다. 그 안에서
   * `supabase.from(...)`을 await 하면 그 쿼리가 다시 세션을 기다리면서 서로 물려
   * **교착에 빠진다** — 콜백이 끝나지 않으니 `setLoading(false)`도 영영 안 돌고
   * 화면이 '불러오는 중…'에서 멈춘다. 실제로 그렇게 멈췄다.
   * 프로필은 아래 별도 effect에서 읽는다.
   */
  useEffect(() => {
    let alive = true

    supabase.auth.getSession()
      .then(({ data: { session } }) => {
        if (!alive) return
        setUser(session?.user ?? null)
      })
      .catch((e) => console.warn('[Auth] 세션을 읽지 못했습니다:', e?.message))
      .finally(() => { if (alive) setLoading(false) })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!alive) return
      setUser(session?.user ?? null)
      setLoading(false)
    })

    // 네트워크가 응답하지 않아도 화면이 영원히 멈춰 있으면 안 된다.
    // 8초가 지나면 로그인 화면이라도 보여 준다.
    const bail = setTimeout(() => {
      if (alive) setLoading((v) => (v ? false : v))
    }, 8000)

    return () => { alive = false; clearTimeout(bail); subscription.unsubscribe() }
  }, [])

  /** 프로필(역할·담당자 이름) — 화면을 막지 않고 따로 읽는다 */
  useEffect(() => {
    let alive = true
    if (!user?.id) { setProfile(null); return }

    supabase.from('profiles').select('*').eq('id', user.id).maybeSingle()
      .then(({ data, error }) => {
        if (!alive) return
        if (error) {
          // profiles 표가 아직 없을 수 있다 (마이그레이션 전). 로그인 자체는 막지 않는다.
          console.warn('[Auth] 프로필을 읽지 못했습니다:', error.message)
          setProfile(null)
        } else {
          setProfile(data || null)
        }
      })

    return () => { alive = false }
  }, [user?.id])

  const signInWithGoogle = async () => {
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/`,
          scopes: 'https://www.googleapis.com/auth/calendar',
        }
      })
      if (error) {
        console.error('Google OAuth error:', error)
        return { success: false, error: error.message }
      }
      return { success: true }
    } catch (err) {
      console.error('signInWithGoogle unexpected error:', err)
      return { success: false, error: err.message }
    }
  }

  /** 아이디(또는 이메일) + 비밀번호 로그인 */
  const signIn = async (idOrEmail, password) => {
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: toLoginEmail(idOrEmail),
        password,
      })
      if (error) return { success: false, error: error.message }
      return { success: true }
    } catch (err) {
      return { success: false, error: err.message }
    }
  }

  /*
   * **`signUp`을 없앴다.**
   *
   * 스스로 가입하는 길은 보안 때문에 닫았다 — 배포 주소가 공개돼 있어서
   * 가입 한 번으로 거래처 1,150곳과 매출 1.5만 건을 읽을 수 있었다.
   * 화면에서 가입 탭을 지운 뒤에도 이 함수만 남아 있었는데, 남겨 둘 이유가
   * 없다: 부르는 곳이 없고, 브라우저에서 부르면 **만든 계정으로 세션이 바뀌어
   * 관리자가 로그아웃된다**(남을 대신 만들 수 없다).
   *
   * 새 계정은 Supabase 대시보드에서 만든다 (Authentication > Users > Add user).
   * 만들어진 계정은 `pending`으로 들어와 아무것도 못 보고, 설정 > 계정 · 권한
   * 에서 관리자가 역할을 올려 준다.
   */


  const signOut = async () => {
    try {
      await supabase.auth.signOut()
    } catch (err) {
      console.error('signOut error:', err)
    }
  }

  // '내 담당자 이름'의 단일 출처.
  // 1) 프로필에 적힌 값 → 2) 계정 이름에서 유추 → 3) 화면에서 고른 값(로그인 전 임시)
  const salesRep = profile?.sales_rep || resolveSalesRep(user) || getStoredRep() || null

  const value = {
    user,
    profile,
    salesRep,
    role: profile?.role || null,
    isAdmin: profile?.role === 'admin',
    canWrite: profile?.role === 'admin' || profile?.role === 'sales',
    signIn,
    signInWithGoogle,
    signOut,
    loading,
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}
