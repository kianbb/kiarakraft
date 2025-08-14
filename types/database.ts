// Database types for better type safety

export interface User {
  id: string;
  email: string;
  password: string;
  name: string | null;
  role: string;
  image: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface SellerProfile {
  id: string;
  userId: string;
  shopName: string;
  displayName: string;
  bio: string | null;
  region: string | null;
  avatarUrl: string | null;
  createdAt: Date;
}

export interface Category {
  id: string;
  slug: string;
  name: string;
}

export interface Product {
  id: string;
  sellerId: string;
  categoryId: string | null;
  title: string;
  slug: string;
  description: string;
  priceToman: number;
  stock: number;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ListingImage {
  id: string;
  productId: string;
  url: string;
  alt: string | null;
  sortOrder: number;
}

export interface Cart {
  id: string;
  userId: string;
  updatedAt: Date;
  createdAt: Date;
}

export interface CartItem {
  id: string;
  cartId: string;
  productId: string;
  quantity: number;
}

export interface Order {
  id: string;
  userId: string;
  status: string;
  totalToman: number;
  createdAt: Date;
  updatedAt: Date;
  fullName: string;
  phone: string;
  address1: string;
  address2: string | null;
  city: string;
  province: string;
  postalCode: string;
}

export interface OrderItem {
  id: string;
  orderId: string;
  productId: string;
  unitPriceToman: number;
  quantity: number;
}

export interface Review {
  id: string;
  userId: string;
  productId: string;
  rating: number;
  comment: string | null;
  createdAt: Date;
}

// Extended types with relations
export interface ProductWithRelations extends Product {
  seller: SellerProfile;
  category: Category | null;
  images: ListingImage[];
  reviews?: Review[];
}

export interface CartItemWithProduct extends CartItem {
  product: ProductWithRelations;
}

export interface OrderWithItems extends Order {
  items: (OrderItem & { product: ProductWithRelations })[];
}

export interface SellerStats {
  totalProducts: number;
  totalOrders: number;
  totalRevenue: number;
  averageRating: number;
}

// API Response types
export interface PaginatedProducts {
  products: ProductWithRelations[];
  totalCount: number;
  totalPages: number;
  currentPage: number;
}

// Filter types for queries
export interface ProductFilters {
  search?: string;
  category?: string;
  sort?: 'newest' | 'oldest' | 'price_low' | 'price_high' | 'popular';
  page?: number;
}

export interface PrismaWhereClause {
  active?: boolean;
  OR?: Array<{
    title?: { contains: string; mode: 'insensitive' };
    description?: { contains: string; mode: 'insensitive' };
  }>;
  category?: {
    slug: string;
  };
}

export interface PrismaOrderBy {
  createdAt?: 'desc' | 'asc';
  priceToman?: 'desc' | 'asc';
}