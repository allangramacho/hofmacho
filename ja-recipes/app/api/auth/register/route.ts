import { NextRequest, NextResponse } from 'next/server'

// Placeholder API route for user registration
// TODO: Connect to MySQL backend
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { name, email, password } = body

    // Validation
    if (!name || !email || !password) {
      return NextResponse.json(
        { message: 'All fields are required' },
        { status: 400 }
      )
    }

    // TODO: Hash password and save to MySQL database
    // TODO: Generate JWT token
    // TODO: Return user data and token

    // Placeholder response
    return NextResponse.json({
      message: 'User registered successfully',
      token: 'placeholder_token',
      user: {
        id: '1',
        name,
        email,
      },
    })
  } catch (error) {
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    )
  }
}

