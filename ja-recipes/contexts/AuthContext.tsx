'use client'

import { createContext, useContext, useEffect } from 'react'
import { useAuthStore } from '@/store/authStore'

const AuthContext = createContext<{}>({})

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore()

  useEffect(() => {
    // Check for stored auth token on mount
    const token = localStorage.getItem('auth_token')
    if (token) {
      // In a real app, validate token with backend
      // For now, we'll just check if it exists
    }
  }, [])

  return (
    <AuthContext.Provider value={{}}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)

