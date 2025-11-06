'use client'

import Navbar from '@/components/Navbar'
import { AuthProvider } from '@/contexts/AuthContext'

export default function CookLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <Navbar />
      <main className="min-h-[calc(100vh-4rem)] bg-background">
        {children}
      </main>
    </AuthProvider>
  )
}

