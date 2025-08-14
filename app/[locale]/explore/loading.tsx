export default function ExploreLoading() {
  return (
    <div className="min-h-screen py-8">
      <div className="container mx-auto px-4">
        {/* Page Header Skeleton */}
        <div className="mb-8">
          <div className="h-10 bg-gray-200 rounded-lg mb-4 w-64 animate-pulse"></div>
          <div className="h-6 bg-gray-200 rounded-lg w-96 animate-pulse"></div>
        </div>

        {/* Search and Filters Skeleton */}
        <div className="mb-8 space-y-4">
          {/* Search Bar */}
          <div className="h-10 bg-gray-200 rounded-lg animate-pulse"></div>
          
          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1 h-10 bg-gray-200 rounded-lg animate-pulse"></div>
            <div className="flex-1 h-10 bg-gray-200 rounded-lg animate-pulse"></div>
          </div>
        </div>

        {/* Results Count Skeleton */}
        <div className="mb-6">
          <div className="h-4 bg-gray-200 rounded w-32 animate-pulse"></div>
        </div>

        {/* Products Grid Skeleton */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {[...Array(12)].map((_, i) => (
            <div key={i} className="animate-pulse">
              {/* Product Image */}
              <div className="bg-gray-200 aspect-square rounded-lg mb-4"></div>
              
              {/* Product Title */}
              <div className="bg-gray-200 h-4 rounded mb-2"></div>
              
              {/* Product Price */}
              <div className="bg-gray-200 h-4 rounded w-2/3 mb-2"></div>
              
              {/* Seller Info */}
              <div className="bg-gray-200 h-3 rounded w-1/2"></div>
            </div>
          ))}
        </div>

        {/* Pagination Skeleton */}
        <div className="flex items-center justify-center space-x-2">
          <div className="h-9 w-20 bg-gray-200 rounded animate-pulse"></div>
          <div className="h-9 w-9 bg-gray-200 rounded animate-pulse"></div>
          <div className="h-9 w-9 bg-gray-200 rounded animate-pulse"></div>
          <div className="h-9 w-9 bg-gray-200 rounded animate-pulse"></div>
          <div className="h-9 w-16 bg-gray-200 rounded animate-pulse"></div>
        </div>
      </div>
    </div>
  );
}