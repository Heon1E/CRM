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

  useEffect(() => {
    let alive = true

    // 프로필(역할·담당자 이름)까지 같이 읽는다. 이게 있어야 '내 담당'이 잡힌다.
    const loadProfile = async (u) => {
      if (!u) { if (alive) setProfile(null); return }
      const { data, error } = await supabase
        .from('profiles').select('*').eq('id', u.id).maybeSingle()
      if (!alive) return
      if (error) {
        // profiles 표가 아직 없을 수 있다 (마이그레이션 전). 로그인 자체는 막지 않는다.
        console.warn('[Auth] 프로필을 읽지 못했습니다:', error.message)
        setProfile(null)
      } else {
        setProfile(data || null)
      }
    }

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      const u = session?.user ?? null
      if (!alive) return
      setUser(u)
      await loadProfile(u)
      if (alive) setLoading(false)
    })

    // 세션 변경 감지 (로그인/로그아웃)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      const u = session?.user ?? null
      if (!alive) return
      setUser(u)
      await loadProfile(u)
      if (alive) setLoading(false)
    })

    return () => { alive = false; subscription.unsubscribe() }
  }, [])

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

  /** 계정 만들기 — 맨 처음 만들어지는 계정이 관리자가 된다 (SQL 트리거) */
  const signUp = async (idOrEmail, password, fullName) => {
    try {
      const { error } = await supabase.auth.signUp({
        email: toLoginEmail(idOrEmail),
        password,
        options: { data: { full_name: fullName || String(idOrEmail).split('@')[0] } },
      })
      if (error) return { success: false, error: error.message }
      return { success: true }
    } catch (err) {
      return { success: false, error: err.message }
    }
  }

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
    signUp,
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
