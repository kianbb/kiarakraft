import NextAuth from 'next-auth'

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      email: string
      name?: string | null
      image?: string | null
      role: string
      sellerProfile?: {
        id: string
        shopName: string
        displayName: string
        bio?: string | null
        region?: string | null
        avatarUrl?: string | null
      } | null
    }
  }

  interface User {
    id: string
    email: string
    name?: string | null
    image?: string | null
    role: string
    sellerProfile?: {
      id: string
      shopName: string
      displayName: string
      bio?: string | null
      region?: string | null
      avatarUrl?: string | null
    } | null
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    role: string
    sellerProfile?: {
      id: string
      shopName: string
      displayName: string
      bio?: string | null
      region?: string | null
      avatarUrl?: string | null
    } | null
  }
}