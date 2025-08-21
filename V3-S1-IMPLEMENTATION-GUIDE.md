# V3-S1 Seller Storefronts - Implementation Guide

## Current Status: Foundation Ready ✅

This document outlines the V3-S1 Seller Storefronts implementation, including what's been prepared and what needs to be done when database access is available.

## Foundation Completed

### ✅ Enhanced Seller Settings

- **File**: `app/[locale]/seller/settings/page.tsx`
- **Status**: ✅ Working with current schema
- **Features**:
  - Shop identity management (name, display name, bio)
  - Visual branding (profile image with existing `avatarUrl` field)
  - Contact information (phone, website, address)
  - Clear preview notices for upcoming V3-S1 features

### ✅ Translations Added

- **Files**: `locales/en.json`, `locales/fa.json`
- **New Keys**:
  - `seller.shopSettings`, `seller.manageYourStorefront`
  - `seller.shopIdentity`, `seller.visualBranding`
  - `seller.profileImage`, `seller.contactInfo`
  - `shop.verified`, `shop.memberSince`, `shop.products`, etc.

### ✅ API Updates

- **File**: `app/api/seller/profile/route.ts`
- **Status**: ✅ Working with current schema
- **Features**: Enhanced seller profile management with existing fields

## Ready for Migration (Requires Database Access)

### 📋 Database Migration Required

**File**: `prisma/migrations/YYYYMMDDHHMMSS_add_seller_storefront_fields/migration.sql`

```sql
-- Add new fields to SellerProfile safely
ALTER TABLE "SellerProfile"
ADD COLUMN "handle" TEXT,
ADD COLUMN "bannerUrl" TEXT,
ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Modify bio column to TEXT type
ALTER TABLE "SellerProfile"
ALTER COLUMN "bio" TYPE TEXT;

-- Generate unique handles for existing sellers
UPDATE "SellerProfile"
SET "handle" = LOWER(
    REGEXP_REPLACE(
        COALESCE("shopName", 'shop') || '-' || SUBSTRING(id FROM 1 FOR 8),
        '[^a-z0-9-]',
        '',
        'g'
    )
)
WHERE "handle" IS NULL;

-- Make handle NOT NULL and add unique constraint
ALTER TABLE "SellerProfile"
ALTER COLUMN "handle" SET NOT NULL;
ALTER TABLE "SellerProfile"
ADD CONSTRAINT "SellerProfile_handle_key" UNIQUE ("handle");
```

### 📋 Prisma Schema Changes Required

**File**: `prisma/schema.prisma`

```prisma
model SellerProfile {
  id                String           @id @default(cuid())
  userId            String           @unique
  handle            String           @unique      // 🆕 NEW
  shopName          String
  displayName       String
  bio               String?          @db.Text     // 🔄 ENHANCED
  region            String?
  avatarUrl         String?
  bannerUrl         String?                       // 🆕 NEW
  createdAt         DateTime         @default(now())
  updatedAt         DateTime         @updatedAt   // 🆕 NEW
  // ... rest of fields unchanged
}
```

### 📋 Files Ready for Activation

#### Public Shop Pages

- **File**: `app/[locale]/shop/[handle]/page.tsx.v3s1` (rename to `page.tsx`)
- **Route**: `/shop/[handle]` (e.g., `/shop/persian-crafts`)
- **Features**: Public seller storefront with products, seller info, verification badge

#### Handle Availability API

- **Directory**: `app/api/seller/check-handle.v3s1/` (rename to `check-handle/`)
- **Endpoint**: `GET /api/seller/check-handle?handle=myshop`
- **Features**: Real-time handle availability checking

#### Enhanced Settings

- **Updates needed in**: `app/[locale]/seller/settings/page.tsx`
- **Add**: Shop handle management, banner image upload, preview links

## Implementation Steps (When Database Available)

### Step 1: Apply Database Migration

```bash
npx prisma migrate dev --name add_seller_storefront_fields
npx prisma generate
```

### Step 2: Activate Prepared Files

```bash
# Activate shop pages
mv app/[locale]/shop/[handle]/page.tsx.v3s1 app/[locale]/shop/[handle]/page.tsx

# Activate handle check API
mv app/api/seller/check-handle.v3s1 app/api/seller/check-handle
```

### Step 3: Update Settings Page

- Uncomment handle management fields
- Add banner image support
- Enable real-time handle checking
- Add shop preview functionality

### Step 4: Update API Endpoints

- Enable handle validation in `app/api/seller/profile/route.ts`
- Uncomment handle uniqueness checks
- Add banner URL support

### Step 5: Verification

```bash
npm run typecheck && npm run build
npm run test
```

## Expected V3-S1 Features (Post-Migration)

### 🏪 Public Shop Pages

- **URL**: `kiarakraft.com/shop/[handle]`
- **Features**:
  - Seller profile with avatar and banner
  - Verification badge display
  - Product grid with pagination
  - Contact information and links
  - Responsive design (mobile-first)

### ⚙️ Enhanced Seller Settings

- **Shop Handle**: Unique shop URL (`/shop/my-shop`)
- **Banner Images**: 1200x400px shop headers
- **Real-time Validation**: Handle availability checking
- **Preview Links**: Direct links to shop pages

### 🔗 SEO & Discovery

- **Metadata**: Dynamic titles and descriptions
- **Open Graph**: Shop-specific social media cards
- **JSON-LD**: Structured data for search engines

## Migration Rollback Plan

If issues occur during migration:

```bash
# Rollback migration
npx prisma migrate reset

# Revert to foundation state
mv app/[locale]/shop/[handle]/page.tsx app/[locale]/shop/[handle]/page.tsx.v3s1
mv app/api/seller/check-handle app/api/seller/check-handle.v3s1
```

## Notes

- All files are TypeScript-safe and build-ready
- Translations support both Persian (RTL) and English (LTR)
- UI components use shadcn/ui for consistency
- Rate limiting is implemented on all new API endpoints
- All database operations are atomic and safe
