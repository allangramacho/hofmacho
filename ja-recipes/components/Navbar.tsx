'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useAuthStore } from '@/store/authStore'
import { FiHome, FiSearch, FiPlusCircle, FiUser, FiLogOut, FiMenu, FiX } from 'react-icons/fi'

export default function Navbar() {
  const { user, isAuthenticated, logout } = useAuthStore()
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)

  const handleLogout = () => {
    localStorage.removeItem('auth_token')
    logout()
    setIsMobileMenuOpen(false)
  }

  const toggleMobileMenu = () => {
    setIsMobileMenuOpen(!isMobileMenuOpen)
  }

  const closeMobileMenu = () => {
    setIsMobileMenuOpen(false)
  }

  return (
    <nav className="bg-white shadow-md sticky top-0 z-50 border-b border-accent-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <Link href="/cook" className="flex items-center space-x-2" onClick={closeMobileMenu}>
            <span className="text-2xl font-bold text-primary-400">J&A Recipes</span>
          </Link>

          {/* Desktop Menu */}
          <div className="hidden md:flex items-center space-x-6">
            <Link href="/cook" className="text-text/70 hover:text-primary-400 flex items-center space-x-1">
              <FiHome />
              <span>Home</span>
            </Link>
            <Link href="/cook/recipes" className="text-text/70 hover:text-primary-400 flex items-center space-x-1">
              <FiSearch />
              <span>Browse</span>
            </Link>
            {isAuthenticated && (
              <Link href="/cook/recipes/new" className="text-text/70 hover:text-primary-400 flex items-center space-x-1">
                <FiPlusCircle />
                <span>Create Recipe</span>
              </Link>
            )}
          </div>

          {/* Desktop Auth Buttons */}
          <div className="hidden md:flex items-center space-x-4">
            {isAuthenticated ? (
              <>
                <Link href="/cook/profile" className="text-text/70 hover:text-primary-400 flex items-center space-x-1">
                  <FiUser />
                  <span>{user?.name}</span>
                </Link>
                <button
                  onClick={handleLogout}
                  className="text-text/70 hover:text-primary-400 flex items-center space-x-1"
                >
                  <FiLogOut />
                  <span>Logout</span>
                </button>
              </>
            ) : (
              <>
                <Link href="/cook/login" className="text-text/70 hover:text-primary-400">
                  Login
                </Link>
                <Link
                  href="/cook/register"
                  className="bg-primary-400 text-white px-4 py-2 rounded-lg hover:bg-primary-500 transition"
                >
                  Sign Up
                </Link>
              </>
            )}
          </div>

          {/* Mobile Hamburger Button */}
          <button
            onClick={toggleMobileMenu}
            className="md:hidden p-2 rounded-md text-text/70 hover:text-primary-400 hover:bg-accent-100"
            aria-label="Toggle menu"
          >
            {isMobileMenuOpen ? <FiX size={24} /> : <FiMenu size={24} />}
          </button>
        </div>
      </div>

      {/* Mobile Menu */}
      {isMobileMenuOpen && (
        <div className="md:hidden border-t border-accent-200 bg-white">
          <div className="px-2 pt-2 pb-3 space-y-1">
            <Link 
              href="/cook" 
              className="block px-3 py-2 text-text/70 hover:bg-accent-100 rounded-md"
              onClick={closeMobileMenu}
            >
              <div className="flex items-center space-x-2">
                <FiHome />
                <span>Home</span>
              </div>
            </Link>
            <Link 
              href="/cook/recipes" 
              className="block px-3 py-2 text-text/70 hover:bg-accent-100 rounded-md"
              onClick={closeMobileMenu}
            >
              <div className="flex items-center space-x-2">
                <FiSearch />
                <span>Browse Recipes</span>
              </div>
            </Link>
            {isAuthenticated && (
              <>
                <Link 
                  href="/cook/recipes/new" 
                  className="block px-3 py-2 text-text/70 hover:bg-accent-100 rounded-md"
                  onClick={closeMobileMenu}
                >
                  <div className="flex items-center space-x-2">
                    <FiPlusCircle />
                    <span>Create Recipe</span>
                  </div>
                </Link>
                <Link 
                  href="/cook/profile" 
                  className="block px-3 py-2 text-text/70 hover:bg-accent-100 rounded-md"
                  onClick={closeMobileMenu}
                >
                  <div className="flex items-center space-x-2">
                    <FiUser />
                    <span>Profile</span>
                  </div>
                </Link>
                <button
                  onClick={handleLogout}
                  className="w-full text-left block px-3 py-2 text-text/70 hover:bg-accent-100 rounded-md"
                >
                  <div className="flex items-center space-x-2">
                    <FiLogOut />
                    <span>Logout</span>
                  </div>
                </button>
              </>
            )}
            {!isAuthenticated && (
              <>
                <Link 
                  href="/cook/login" 
                  className="block px-3 py-2 text-text/70 hover:bg-accent-100 rounded-md"
                  onClick={closeMobileMenu}
                >
                  Login
                </Link>
                <Link 
                  href="/cook/register" 
                  className="block px-3 py-2 bg-primary-400 text-white rounded-md hover:bg-primary-500 text-center"
                  onClick={closeMobileMenu}
                >
                  Sign Up
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </nav>
  )
}

