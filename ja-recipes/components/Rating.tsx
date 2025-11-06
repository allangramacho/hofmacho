'use client'

import { useState } from 'react'
import { FiStar } from 'react-icons/fi'
import { useAuthStore } from '@/store/authStore'

interface RatingProps {
  recipeId: string
  currentRating: number
  userRating?: number
  onRate?: (rating: number) => void
}

export default function Rating({ recipeId, currentRating, userRating, onRate }: RatingProps) {
  const { isAuthenticated } = useAuthStore()
  const [hoverRating, setHoverRating] = useState(0)

  const handleClick = async (rating: number) => {
    if (!isAuthenticated) {
      alert('Please login to rate recipes')
      return
    }

    try {
      // Placeholder API call
      const response = await fetch(`/api/recipes/${recipeId}/rate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ rating }),
      })

      if (response.ok && onRate) {
        onRate(rating)
      }
    } catch (error) {
      console.error('Error rating recipe:', error)
    }
  }

  const displayRating = hoverRating || userRating || currentRating

  return (
    <div className="flex items-center space-x-2">
      <div className="flex items-center space-x-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            onClick={() => handleClick(star)}
            onMouseEnter={() => setHoverRating(star)}
            onMouseLeave={() => setHoverRating(0)}
            disabled={!isAuthenticated}
            className={`${
              star <= displayRating
                ? 'fill-yellow-400 text-yellow-400'
                : 'text-gray-300'
            } ${isAuthenticated ? 'hover:scale-110 cursor-pointer' : 'cursor-not-allowed'} transition-transform`}
          >
            <FiStar size={24} />
          </button>
        ))}
      </div>
      <span className="text-gray-600 font-medium">
        {currentRating.toFixed(1)}
      </span>
    </div>
  )
}

