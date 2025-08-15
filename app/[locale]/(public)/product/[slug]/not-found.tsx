export default function NotFound() {
  return (
    <main className="container py-10">
      <h1 className="text-xl font-semibold">این محصول یافت نشد</h1>
      <p className="mt-2">Product not found.</p>
      <a href="/fa/explore" className="underline mt-4 inline-block">بازگشت به فروشگاه</a>
    </main>
  );
}