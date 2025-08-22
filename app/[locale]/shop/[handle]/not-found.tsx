import Link from 'next/link';

export default function ShopNotFound() {
  return (
    <div className="container mx-auto px-4 py-16 text-center">
      <div className="max-w-md mx-auto">
        <div className="text-6xl mb-4">🏪</div>
        <h1 className="text-2xl font-bold text-gray-900 mb-4">
          فروشگاه یافت نشد
        </h1>
        <p className="text-gray-600 mb-8">
          فروشگاه مورد نظر شما وجود ندارد یا ممکن است حذف شده باشد.
        </p>
        <div className="space-y-4">
          <Link
            href="/explore"
            className="block w-full bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors"
          >
            مشاهده همه محصولات
          </Link>
          <Link
            href="/"
            className="block w-full text-gray-600 hover:text-gray-900 transition-colors"
          >
            بازگشت به صفحه اصلی
          </Link>
        </div>
      </div>
    </div>
  );
}
