import React, { createContext, useContext, useState, useEffect } from 'react'
import { supabase } from '../lib/supabase' // ★ 본인의 supabase 클라이언트 경로로 수정 필요

const AuthContext = createContext()

export function useAuth() {
  return useContext(AuthContext)
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  // 초기값을 true로 두어, 확인 전까지는 무조건 '로딩 화면'을 유지하게 함 (안전장치)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // 1. [핵심] 앱 켜지자마자 현재 세션 확인 (새로고침 시 데이터 복구의 핵심)
    const checkSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        setUser(session?.user ?? null)
      } catch (error) {
        console.error('세션 확인 실패:', error)
      } finally {
        // 세션이 있든 없든 확인이 끝났으니 로딩 해제
        setLoading(false)
      }
    }

    checkSession()

    // 2. [핵심] 로그인/로그아웃 상태 변화 실시간 감지 (Auth Observer)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setUser(session?.user ?? null)
      setLoading(false) // 상태가 변하면 로딩은 무조건 끝난 것
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  // 3. 구글 로그인 함수 (달력 권한 포함)
  const signInWithGoogle = async () => {
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          // 달력 연동을 위한 필수 스코프
          scopes: 'https://www.googleapis.com/auth/calendar',
          redirectTo: window.location.origin // 로그인 후 현재 페이지로 복귀
        }
      })
      if (error) throw error
    } catch (error) {
      console.error('구글 로그인 에러:', error)
      alert('로그인에 실패했습니다.')
    }
  }

  const signOut = async () => {
    try {
      await supabase.auth.signOut()
    } catch (error) {
      console.error('로그아웃 에러:', error)
    }
  }

  const value = {
    user,
    signInWithGoogle,
    signOut,
    loading
  }

  return (
    <AuthContext.Provider value={value}>
      {/* 로딩 중일 때는 아예 자식 컴포넌트를 렌더링하지 않음 (선택사항, App.js에서 처리중이라 여기선 패스) */}
      {!loading && children} 
    </AuthContext.Provider>
  )
}