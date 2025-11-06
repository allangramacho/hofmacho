'use client'

import Navbar from '@/components/Navbar'
import { AuthProvider } from '@/contexts/AuthContext'

export function ClientLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <Navbar />
      <main className="min-h-screen bg-gray-50">
        {children}
      </main>
    </AuthProvider>
  )
}

