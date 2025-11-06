'use client'

import Link from 'next/link'

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="max-w-4xl mx-auto text-center">
        <h1 className="text-5xl md:text-6xl font-bold text-text mb-4">
          Welcome to Hofmacho
        </h1>
        <p className="text-xl text-text/70 mb-12">
          Choose a site to explore
        </p>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Link
            href="/cook"
            className="bg-primary-400 hover:bg-primary-500 text-white px-8 py-12 rounded-lg shadow-lg hover:shadow-xl transition-all transform hover:scale-105"
          >
            <div className="text-5xl mb-4">🍳</div>
            <h2 className="text-2xl font-bold mb-2">J&A Recipes</h2>
            <p className="text-white/90">
              Share and discover family recipes
            </p>
          </Link>
          
          {/* Placeholder for future sites */}
          <div className="bg-accent-200 px-8 py-12 rounded-lg shadow-lg opacity-50 cursor-not-allowed">
            <div className="text-5xl mb-4">🚧</div>
            <h2 className="text-2xl font-bold mb-2 text-text/60">Coming Soon</h2>
            <p className="text-text/50">
              More sites coming soon
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
