'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { FiClock, FiUsers, FiChevronLeft, FiEdit, FiTrash2 } from 'react-icons/fi'
import { useAuthStore } from '@/store/authStore'
import Rating from '@/components/Rating'
import { Recipe } from '@/components/RecipeCard'

export default function RecipeDetail() {
  const params = useParams()
  const router = useRouter()
  const { user } = useAuthStore()
  const [recipe, setRecipe] = useState<Recipe | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [userRating, setUserRating] = useState<number | undefined>()

  useEffect(() => {
    fetchRecipe()
  }, [params.id])

  const fetchRecipe = async () => {
    try {
      // Placeholder API call - replace with actual MySQL backend integration
      const response = await fetch(`/api/recipes/${params.id}`)
      const data = await response.json()

      if (response.ok) {
        setRecipe(data.recipe)
        setUserRating(data.userRating)
      }
    } catch (error) {
      console.error('Error fetching recipe:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this recipe?')) return

    try {
      const response = await fetch(`/api/recipes/${params.id}`, {
        method: 'DELETE',
      })

      if (response.ok) {
        router.push('/cook/recipes')
      }
    } catch (error) {
      console.error('Error deleting recipe:', error)
    }
  }

  const handleRate = (rating: number) => {
    setUserRating(rating)
    if (recipe) {
      // Update average rating (simplified - in real app, recalculate from backend)
      const newRatingCount = recipe.ratingCount + (userRating ? 0 : 1)
      const newAverageRating = userRating
        ? ((recipe.averageRating * recipe.ratingCount - userRating + rating) / recipe.ratingCount)
        : ((recipe.averageRating * recipe.ratingCount + rating) / newRatingCount)
      
      setRecipe({
        ...recipe,
        averageRating: newAverageRating,
        ratingCount: newRatingCount,
      })
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading recipe...</p>
        </div>
      </div>
    )
  }

  if (!recipe) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600 text-lg">Recipe not found</p>
          <button
            onClick={() => router.push('/cook/recipes')}
            className="mt-4 text-primary-600 hover:text-primary-700"
          >
            Back to Recipes
          </button>
        </div>
      </div>
    )
  }

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case 'easy':
        return 'bg-green-100 text-green-800'
      case 'medium':
        return 'bg-yellow-100 text-yellow-800'
      case 'hard':
        return 'bg-red-100 text-red-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <button
        onClick={() => router.back()}
        className="flex items-center space-x-2 text-gray-600 hover:text-gray-900 mb-6"
      >
        <FiChevronLeft />
        <span>Back</span>
      </button>

      <div className="bg-white rounded-lg shadow-lg overflow-hidden">
        {/* Image */}
        <div className="relative h-64 md:h-96 bg-gray-200">
          {recipe.image ? (
            <img
              src={recipe.image}
              alt={recipe.title}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-primary-100">
              <span className="text-8xl">🍳</span>
            </div>
          )}
        </div>

        <div className="p-6 md:p-8">
          {/* Header */}
          <div className="mb-6">
            <div className="flex flex-wrap items-start justify-between mb-4">
              <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-2">
                {recipe.title}
              </h1>
              {user && user.id === recipe.authorId && (
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => router.push(`/cook/recipes/${recipe.id}/edit`)}
                    className="text-primary-600 hover:text-primary-700 p-2"
                  >
                    <FiEdit size={20} />
                  </button>
                  <button
                    onClick={handleDelete}
                    className="text-red-600 hover:text-red-700 p-2"
                  >
                    <FiTrash2 size={20} />
                  </button>
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-4 mb-4">
              <span className={`px-3 py-1 rounded-full text-sm font-semibold ${getDifficultyColor(recipe.difficulty)}`}>
                {recipe.difficulty}
              </span>
              <span className="text-gray-600 capitalize">{recipe.category}</span>
              <div className="flex items-center space-x-1 text-gray-600">
                <FiClock />
                <span>{recipe.prepTime + recipe.cookTime} min</span>
              </div>
              <div className="flex items-center space-x-1 text-gray-600">
                <FiUsers />
                <span>{recipe.servings} servings</span>
              </div>
            </div>

            <div className="mb-4">
              <Rating
                recipeId={recipe.id}
                currentRating={recipe.averageRating}
                userRating={userRating}
                onRate={handleRate}
              />
            </div>

            <p className="text-gray-600 text-sm">
              by <span className="font-semibold">{recipe.authorName}</span>
            </p>
          </div>

          {/* Description */}
          <div className="mb-8">
            <h2 className="text-2xl font-semibold mb-3">Description</h2>
            <p className="text-gray-700 leading-relaxed">{recipe.description}</p>
          </div>

          {/* Ingredients */}
          <div className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">Ingredients</h2>
            <ul className="space-y-2">
              {recipe.ingredients.map((ingredient, index) => (
                <li key={index} className="flex items-start space-x-3">
                  <span className="text-primary-600 mt-1">•</span>
                  <span className="text-gray-700">{ingredient}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Instructions */}
          <div>
            <h2 className="text-2xl font-semibold mb-4">Instructions</h2>
            <ol className="space-y-4">
              {recipe.instructions.map((instruction, index) => (
                <li key={index} className="flex items-start space-x-4">
                  <span className="flex-shrink-0 w-8 h-8 bg-primary-600 text-white rounded-full flex items-center justify-center font-semibold">
                    {index + 1}
                  </span>
                  <span className="text-gray-700 leading-relaxed flex-1">{instruction}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </div>
  )
}

