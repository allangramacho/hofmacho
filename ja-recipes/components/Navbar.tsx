'use client'

import Link from 'next/link'
import { useAuthStore } from '@/store/authStore'
import { FiHome, FiSearch, FiPlusCircle, FiUser, FiLogOut } from 'react-icons/fi'

export default function Navbar() {
  const { user, isAuthenticated, logout } = useAuthStore()

  const handleLogout = () => {
    localStorage.removeItem('auth_token')
    logout()
  }

  return (
    <nav className="bg-white shadow-md sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <Link href="/" className="flex items-center space-x-2">
            <span className="text-2xl font-bold text-primary-600">J&A Recipes</span>
          </Link>

          <div className="hidden md:flex items-center space-x-6">
            <Link href="/" className="text-gray-700 hover:text-primary-600 flex items-center space-x-1">
              <FiHome />
              <span>Home</span>
            </Link>
            <Link href="/recipes" className="text-gray-700 hover:text-primary-600 flex items-center space-x-1">
              <FiSearch />
              <span>Browse</span>
            </Link>
            {isAuthenticated && (
              <Link href="/recipes/new" className="text-gray-700 hover:text-primary-600 flex items-center space-x-1">
                <FiPlusCircle />
                <span>Create Recipe</span>
              </Link>
            )}
          </div>

          <div className="flex items-center space-x-4">
            {isAuthenticated ? (
              <>
                <Link href="/profile" className="text-gray-700 hover:text-primary-600 flex items-center space-x-1">
                  <FiUser />
                  <span className="hidden sm:inline">{user?.name}</span>
                </Link>
                <button
                  onClick={handleLogout}
                  className="text-gray-700 hover:text-primary-600 flex items-center space-x-1"
                >
                  <FiLogOut />
                  <span className="hidden sm:inline">Logout</span>
                </button>
              </>
            ) : (
              <>
                <Link href="/login" className="text-gray-700 hover:text-primary-600">
                  Login
                </Link>
                <Link
                  href="/register"
                  className="bg-primary-600 text-white px-4 py-2 rounded-lg hover:bg-primary-700 transition"
                >
                  Sign Up
                </Link>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Mobile menu */}
      <div className="md:hidden border-t border-gray-200">
        <div className="px-2 pt-2 pb-3 space-y-1">
          <Link href="/" className="block px-3 py-2 text-gray-700 hover:bg-gray-100 rounded-md">
            Home
          </Link>
          <Link href="/recipes" className="block px-3 py-2 text-gray-700 hover:bg-gray-100 rounded-md">
            Browse Recipes
          </Link>
          {isAuthenticated && (
            <Link href="/recipes/new" className="block px-3 py-2 text-gray-700 hover:bg-gray-100 rounded-md">
              Create Recipe
            </Link>
          )}
        </div>
      </div>
    </nav>
  )
}

