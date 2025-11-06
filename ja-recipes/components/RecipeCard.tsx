'use client'

import { useState } from 'react'
import Link from 'next/link'
import { FiClock, FiUsers, FiStar, FiEdit, FiTrash2 } from 'react-icons/fi'
import { useAuthStore } from '@/store/authStore'

export interface Recipe {
  id: string
  title: string
  description: string
  image?: string
  prepTime: number
  cookTime: number
  servings: number
  difficulty: 'easy' | 'medium' | 'hard'
  category: string
  ingredients: string[]
  instructions: string[]
  averageRating: number
  ratingCount: number
  authorId: string
  authorName: string
  createdAt: string
}

interface RecipeCardProps {
  recipe: Recipe
  onDelete?: (id: string) => void
}

export default function RecipeCard({ recipe, onDelete }: RecipeCardProps) {
  const { user } = useAuthStore()
  const [isDeleting, setIsDeleting] = useState(false)

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this recipe?')) return
    
    setIsDeleting(true)
    try {
      // Placeholder API call
      const response = await fetch(`/api/recipes/${recipe.id}`, {
        method: 'DELETE',
      })
      
      if (response.ok && onDelete) {
        onDelete(recipe.id)
      }
    } catch (error) {
      console.error('Error deleting recipe:', error)
    } finally {
      setIsDeleting(false)
    }
  }

  const renderStars = (rating: number) => {
    const fullStars = Math.floor(rating)
    const hasHalfStar = rating % 1 >= 0.5
    
    return (
      <div className="flex items-center space-x-1">
        {[...Array(5)].map((_, i) => (
          <FiStar
            key={i}
            className={`${
              i < fullStars
                ? 'fill-yellow-400 text-yellow-400'
                : i === fullStars && hasHalfStar
                ? 'fill-yellow-400 text-yellow-400 opacity-50'
                : 'text-gray-300'
            }`}
            size={16}
          />
        ))}
        <span className="text-sm text-gray-600 ml-1">
          ({recipe.ratingCount})
        </span>
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
    <div className="bg-white rounded-lg shadow-md overflow-hidden hover:shadow-lg transition-shadow">
      <Link href={`/cook/recipes/${recipe.id}`}>
        <div className="relative h-48 bg-gray-200">
          {recipe.image ? (
            <img
              src={recipe.image}
              alt={recipe.title}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-primary-100">
              <span className="text-4xl text-primary-600">🍳</span>
            </div>
          )}
          <div className="absolute top-2 right-2">
            <span className={`px-2 py-1 rounded-full text-xs font-semibold ${getDifficultyColor(recipe.difficulty)}`}>
              {recipe.difficulty}
            </span>
          </div>
        </div>
      </Link>

      <div className="p-4">
        <Link href={`/cook/recipes/${recipe.id}`}>
          <h3 className="text-xl font-semibold text-gray-900 mb-2 hover:text-primary-600 transition">
            {recipe.title}
          </h3>
        </Link>
        
        <p className="text-gray-600 text-sm mb-4 line-clamp-2">
          {recipe.description}
        </p>

        <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600 mb-4">
          <div className="flex items-center space-x-1">
            <FiClock />
            <span>{recipe.prepTime + recipe.cookTime} min</span>
          </div>
          <div className="flex items-center space-x-1">
            <FiUsers />
            <span>{recipe.servings} servings</span>
          </div>
        </div>

        <div className="mb-4">
          {renderStars(recipe.averageRating)}
        </div>

        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-500">
            by {recipe.authorName}
          </span>
          
          {user && user.id === recipe.authorId && (
            <div className="flex items-center space-x-2">
              <Link
                href={`/cook/recipes/${recipe.id}/edit`}
                className="text-primary-600 hover:text-primary-700 p-1"
                onClick={(e) => e.stopPropagation()}
              >
                <FiEdit size={18} />
              </Link>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  handleDelete()
                }}
                disabled={isDeleting}
                className="text-red-600 hover:text-red-700 p-1 disabled:opacity-50"
              >
                <FiTrash2 size={18} />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

