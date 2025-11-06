'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import RecipeCard, { Recipe } from '@/components/RecipeCard'
import RecipeFilters from '@/components/RecipeFilters'

export default function RecipesPage() {
  const router = useRouter()
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [filteredRecipes, setFilteredRecipes] = useState<Recipe[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    fetchRecipes()
  }, [])

  const fetchRecipes = async () => {
    try {
      // Placeholder API call - replace with actual MySQL backend integration
      const response = await fetch('/api/recipes')
      const data = await response.json()
      
      if (response.ok) {
        setRecipes(data.recipes || [])
        setFilteredRecipes(data.recipes || [])
      } else {
        // For demo purposes, use sample data if API fails
        const sampleRecipes: Recipe[] = [
          {
            id: '1',
            title: 'Classic Chocolate Chip Cookies',
            description: 'Soft and chewy chocolate chip cookies that are perfect for any occasion.',
            prepTime: 15,
            cookTime: 12,
            servings: 24,
            difficulty: 'easy',
            category: 'dessert',
            ingredients: ['Flour', 'Butter', 'Sugar', 'Chocolate chips'],
            instructions: ['Mix ingredients', 'Bake at 350°F'],
            averageRating: 4.5,
            ratingCount: 120,
            authorId: '1',
            authorName: 'Chef John',
            createdAt: new Date().toISOString(),
          },
          {
            id: '2',
            title: 'Grilled Salmon with Vegetables',
            description: 'Healthy and delicious grilled salmon served with seasonal vegetables.',
            prepTime: 20,
            cookTime: 15,
            servings: 4,
            difficulty: 'medium',
            category: 'dinner',
            ingredients: ['Salmon', 'Vegetables', 'Olive oil', 'Lemon'],
            instructions: ['Season salmon', 'Grill for 15 minutes'],
            averageRating: 4.8,
            ratingCount: 89,
            authorId: '2',
            authorName: 'Chef Maria',
            createdAt: new Date().toISOString(),
          },
        ]
        setRecipes(sampleRecipes)
        setFilteredRecipes(sampleRecipes)
      }
    } catch (error) {
      console.error('Error fetching recipes:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleFilterChange = (filters: any) => {
    let filtered = [...recipes]

    // Search filter
    if (filters.search) {
      const searchLower = filters.search.toLowerCase()
      filtered = filtered.filter(
        (recipe) =>
          recipe.title.toLowerCase().includes(searchLower) ||
          recipe.description.toLowerCase().includes(searchLower)
      )
    }

    // Category filter
    if (filters.category) {
      filtered = filtered.filter((recipe) => recipe.category === filters.category)
    }

    // Difficulty filter
    if (filters.difficulty) {
      filtered = filtered.filter((recipe) => recipe.difficulty === filters.difficulty)
    }

    // Rating filter
    if (filters.minRating > 0) {
      filtered = filtered.filter((recipe) => recipe.averageRating >= filters.minRating)
    }

    setFilteredRecipes(filtered)
  }

  const handleDelete = (id: string) => {
    setRecipes(recipes.filter((r) => r.id !== id))
    setFilteredRecipes(filteredRecipes.filter((r) => r.id !== id))
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading recipes...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8 hidden md:block">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Browse Recipes</h1>
        <p className="text-gray-600">Discover amazing recipes from our community</p>
      </div>

      <RecipeFilters onFilterChange={handleFilterChange} />

      {filteredRecipes.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-600 text-lg">No recipes found. Try adjusting your filters.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredRecipes.map((recipe) => (
            <RecipeCard key={recipe.id} recipe={recipe} onDelete={handleDelete} />
          ))}
        </div>
      )}
    </div>
  )
}

