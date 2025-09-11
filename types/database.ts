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
  // Handcrafted eligibility moderation
  eligibilityStatus?: 'PENDING' | 'APPROVED' | 'REJECTED' | 'REVIEW';
  eligibilityConfidence?: number | null;
  eligibilityReasons?: string | null;
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
  addressId: string;
  status: string;
  totalToman: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface OrderItem {
  id: string;
  orderId: string;
  productId: string;
  unitPriceToman: number;
  quantity: number;
}

export interface Address {
  id: string;
  userId: string;
  fullName: string;
  phone: string;
  country: string;
  province: string;
  city: string;
  line1: string;
  line2: string | null;
  postal: string | null;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface OrderShipping {
  id: string;
  orderId: string;
  method: 'STANDARD' | 'EXPRESS' | 'PICKUP';
  priceToman: number;
  trackingNo: string | null;
  status: string;
  history: unknown | null;
  createdAt: Date;
  updatedAt: Date;
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
  address: Address;
  items: (OrderItem & { product: ProductWithRelations })[];
  shipping?: OrderShipping;
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
  isTest?: boolean;
  eligibilityStatus?: string;
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
