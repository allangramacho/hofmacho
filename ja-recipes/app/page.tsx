'use client'

import Link from 'next/link'
import { FiCoffee, FiSearch, FiPlusCircle } from 'react-icons/fi'

export default function Home() {
  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section className="bg-primary-500 text-white py-20 px-4">
        <div className="max-w-7xl mx-auto text-center">
          <div className="flex justify-center mb-6">
            <FiCoffee size={64} />
          </div>
          <h1 className="text-4xl md:text-6xl font-bold mb-6">
            Welcome to J&A Recipes
          </h1>
          <p className="text-xl md:text-2xl mb-8 text-white">
            Share your favorite family recipes and discover new ones
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/recipes"
              className="bg-white text-primary-600 px-8 py-3 rounded-lg font-semibold hover:bg-gray-100 transition flex items-center justify-center space-x-2"
            >
              <FiSearch />
              <span>Browse Recipes</span>
            </Link>
            <Link
              href="/register"
              className="bg-primary-600 text-white px-8 py-3 rounded-lg font-semibold hover:bg-primary-700 transition flex items-center justify-center space-x-2"
            >
              <FiPlusCircle />
              <span>Get Started</span>
            </Link>
          </div>
        </div>
      </section>

      {/* Simple CTA Section */}
      <section className="bg-gray-50 py-16 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl font-bold mb-4 text-gray-900">
            Start Sharing Your Recipes
          </h2>
          <p className="text-xl text-gray-600 mb-8">
            Join our family recipe collection and share your favorite dishes
          </p>
          <Link
            href="/register"
            className="inline-block bg-primary-600 text-white px-8 py-3 rounded-lg font-semibold hover:bg-primary-700 transition"
          >
            Create Free Account
          </Link>
        </div>
      </section>
    </div>
  )
}
