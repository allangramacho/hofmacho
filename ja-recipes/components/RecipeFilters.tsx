'use client'

import { useState } from 'react'
import { FiSearch, FiFilter, FiX } from 'react-icons/fi'

interface RecipeFilters {
  search: string
  category: string
  difficulty: string
  minRating: number
}

interface RecipeFiltersProps {
  onFilterChange: (filters: RecipeFilters) => void
}

export default function RecipeFilters({ onFilterChange }: RecipeFiltersProps) {
  const [filters, setFilters] = useState<RecipeFilters>({
    search: '',
    category: '',
    difficulty: '',
    minRating: 0,
  })
  const [showFilters, setShowFilters] = useState(false)

  const handleChange = (key: keyof RecipeFilters, value: string | number) => {
    const newFilters = { ...filters, [key]: value }
    setFilters(newFilters)
    onFilterChange(newFilters)
  }

  const clearFilters = () => {
    const clearedFilters = {
      search: '',
      category: '',
      difficulty: '',
      minRating: 0,
    }
    setFilters(clearedFilters)
    onFilterChange(clearedFilters)
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-4 mb-6">
      <div className="flex flex-col md:flex-row gap-4">
        {/* Search */}
        <div className="flex-1 relative">
          <FiSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search recipes..."
            value={filters.search}
            onChange={(e) => handleChange('search', e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          />
        </div>

        {/* Filter Toggle Button (Mobile) */}
        <button
          onClick={() => setShowFilters(!showFilters)}
          className="md:hidden flex items-center justify-center space-x-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
        >
          <FiFilter />
          <span>Filters</span>
        </button>
      </div>

      {/* Filter Options */}
      <div className={`mt-4 grid grid-cols-1 md:grid-cols-3 gap-4 ${showFilters ? 'block' : 'hidden md:grid'}`}>
          {/* Category */}
          <select
            value={filters.category}
            onChange={(e) => handleChange('category', e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          >
            <option value="">All Categories</option>
            <option value="breakfast">Breakfast</option>
            <option value="lunch">Lunch</option>
            <option value="dinner">Dinner</option>
            <option value="dessert">Dessert</option>
            <option value="snack">Snack</option>
            <option value="beverage">Beverage</option>
          </select>

          {/* Difficulty */}
          <select
            value={filters.difficulty}
            onChange={(e) => handleChange('difficulty', e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          >
            <option value="">All Difficulties</option>
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
          </select>

          {/* Min Rating */}
          <div className="flex items-center space-x-2">
            <label className="text-sm text-gray-600 whitespace-nowrap">Min Rating:</label>
            <select
              value={filters.minRating}
              onChange={(e) => handleChange('minRating', parseInt(e.target.value))}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            >
              <option value={0}>Any</option>
              <option value={1}>1+ Stars</option>
              <option value={2}>2+ Stars</option>
              <option value={3}>3+ Stars</option>
              <option value={4}>4+ Stars</option>
              <option value={5}>5 Stars</option>
            </select>
          </div>

          {/* Clear Filters */}
          {(filters.category || filters.difficulty || filters.minRating > 0) && (
            <button
              onClick={clearFilters}
              className="md:col-span-3 flex items-center justify-center space-x-2 px-4 py-2 text-gray-600 hover:text-gray-800 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              <FiX />
              <span>Clear Filters</span>
            </button>
          )}
      </div>
    </div>
  )
}

