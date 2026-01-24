import React, { createContext, useContext, useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { showError } from '../utils/alert' // ★ 본인의 supabase 클라이언트 경로로 수정 필요

const AuthContext = createContext()

export function useAuth() {
  return useContext(AuthContext)
}

export function AuthProvider({ children }) {
  // Bypassing Google Login for now. Using a hardcoded mock user for development.
  const [user, setUser] = useState({
    id: '00000000-0000-0000-0000-000000000000',
    email: 'admin@example.com',
    user_metadata: { name: 'Admin User' }
  })
  const [loading, setLoading] = useState(false)

  // Empty effect: No actual auth listener needed while in "Mock" mode
  useEffect(() => {
    // No-op
  }, [])

  const signInWithGoogle = async () => {
    console.log('Mock: signInWithGoogle skipped')
  }

  const signOut = async () => {
    console.log('Mock: signOut skipped')
  }

  const value = {
    user,
    signInWithGoogle,
    signOut,
    loading
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}
