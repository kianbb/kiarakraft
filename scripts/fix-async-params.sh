#!/bin/bash

# Fix Next.js 15 async params in all API routes
# This script updates route handlers to handle params as Promise

FILES=(
  "app/api/seller/orders/[id]/status/route.ts"
  "app/api/products/[id]/route.ts"
  "app/api/admin/shipping/[id]/route.ts"
  "app/api/admin/returns/[id]/status/route.ts"
  "app/api/admin/orders/[id]/status/route.ts"
  "app/api/admin/sellers/[id]/documents/route.ts"
  "app/api/admin/reviews/[id]/status/route.ts"
  "app/api/addresses/[id]/route.ts"
  "app/api/cart/[id]/route.ts"
  "app/api/orders/[id]/route.ts"
)

for file in "${FILES[@]}"; do
  if [ -f "$file" ]; then
    echo "Fixing $file..."
    # Replace the params type
    sed -i.bak 's/params: { id: string }/params: Promise<{ id: string }> | { id: string }/g' "$file"
    rm "${file}.bak" 2>/dev/null || true
  fi
done

echo "Done! Type definitions updated."
echo "Now you need to manually add 'const resolvedParams = await params; const productId = resolvedParams.id;' at the start of each handler."
