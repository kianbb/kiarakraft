# Kiara Kraft - Project Guide

## Project Overview

**Kiara Kraft (کیارا کرفت)** is a modern Iranian handmade marketplace inspired by Etsy. It connects Iranian artisans with buyers through a bilingual platform supporting both Persian (RTL, default) and English (LTR).

### Core Features

- **Bilingual marketplace**: Persian (default) + English with full RTL/LTR support
- **User roles**: Buyers, Sellers, Admins with role-based access
- **Product management**: CRUD operations, image galleries, categories
- **Dual submission options**: Products can be submitted with AI enhancement or without
- **Commerce**: Shopping cart, checkout, payment processing (offline/ZarinPal/IDPay)
- **Seller system**: Verification workflow, seller dashboard, order management
- **Admin tools**: Order management, payment tracking, seller verification

### Tech Stack

- **Frontend**: Next.js 14 (App Router), TypeScript, Tailwind CSS, shadcn/ui
- **Backend**: Next.js API routes, Prisma ORM, PostgreSQL (Neon)
- **Auth**: NextAuth.js with credentials provider
- **i18n**: next-intl with RTL/LTR support
- **Images**: Cloudinary integration with optimization
- **AI Services**: OpenAI GPT-5 mini for product enhancement
- **Translation**: Azure Translator for Persian ↔ English translations
- **Image Processing**: Sharp for image resizing and optimization
- **Deployment**: Vercel with custom domain (www.kiarakraft.com)

---

## Git Workflow

**IMPORTANT: Never commit directly to main. Always use feature branches and PRs.**

### Standard Workflow Steps

1. **Update local main**:

   ```bash
   git fetch origin
   git switch main
   git pull
   ```

2. **Create feature branch**:

   ```bash
   git switch -c feature/my-change
   # or for bug fixes:
   git switch -c hotfix/bug-123
   ```

3. **Make changes, stage and commit**:

   ```bash
   git add .
   git commit -m "feat: descriptive commit message"
   ```

4. **Push branch**:

   ```bash
   git push -u origin HEAD
   ```

5. **Open PR** (GitHub will show link), get 1 review, wait for green checks

6. **Merge** using "Squash and merge" or "Rebase and merge"

7. **Update local main**:

   ```bash
   git switch main
   git pull
   ```

8. **Clean up** (optional):
   ```bash
   git branch -d feature/my-change
   git push origin --delete feature/my-change
   ```

### Emergency Recovery

If you accidentally commit to main:

```bash
git switch -c hotfix/move-commits
git push -u origin HEAD
# Then open PR from this branch
```

---

## Deployment

### Vercel Integration

- **Production**: Automatically deploys from `main` branch
- **Preview**: Each PR gets a preview deployment
- **Domain**: www.kiarakraft.com (primary), redirects from kiarakraft.com and kiarakraft.ir

### Deployment Flow

1. PR merged to main → Vercel auto-deploys to production
2. Each PR → Gets preview URL for testing
3. Manual deploys possible via Vercel dashboard or CLI

---

## Development Commands

### Essential Commands

```bash
# Development
npm run dev                    # Start dev server
npm run build                  # Production build
npm run start                  # Start production server

# Code Quality
npm run lint                   # ESLint check
npm run lint:fix              # Fix ESLint issues + format
npm run typecheck             # TypeScript check
npm run format                # Prettier formatting

# Database
npm run db:seed               # Seed with demo data
npm run db:reset              # Reset DB (destructive!)
npx prisma studio            # Database GUI
npx prisma migrate dev       # Create migration

# ⚠️ CRITICAL DATABASE WARNING ⚠️
# NEVER run `npx prisma migrate reset` or `npm run db:reset` on this project!
# This database contains 90+ real products, 57 users, order history, and seller data.
# Any reset will require Point-in-Time Recovery from Neon backup (complex process).
# For migrations, ALWAYS use `npx prisma migrate dev` instead of reset.

# Testing & Verification
npm run test                  # Run test suite
npm run test:i18n            # i18n smoke tests
npm run verify:i18n          # Check translation completeness
```

### Pre-deployment Checklist

Always run before pushing:

1. `npm run typecheck` - No TypeScript errors
2. `npm run lint` - No ESLint errors
3. `npm run build` - Successful build
4. `npm run test` - All tests passing

---

## Project Structure

```
kiarakraft/
├── app/[locale]/            # Internationalized routes (fa/en)
│   ├── (public)/           # Public pages (product, explore)
│   ├── admin/              # Admin dashboard
│   ├── auth/               # Authentication pages
│   ├── seller/             # Seller dashboard
│   └── api/                # API routes
├── components/             # Reusable components
│   ├── layout/             # Header, footer, navbar
│   ├── products/           # Product-related components
│   ├── ui/                 # shadcn/ui components
├── lib/                    # Utilities, database, auth config
├── locales/                # i18n translations (fa.json, en.json)
├── prisma/                 # Database schema & migrations
└── types/                  # TypeScript definitions
```

---

## Key Conventions

### Code Style

- **TypeScript**: Strict mode enabled
- **Components**: Server Components by default, Client only when needed
- **Mutations**: Use Server Actions for form submissions
- **API**: REST endpoints in `app/api/` for external integrations
- **Styling**: Tailwind CSS with shadcn/ui components
- **i18n**: All user-facing text must be translated (fa.json + en.json)

### Database

- **ORM**: Prisma with PostgreSQL
- **Migrations**: Always create migrations for schema changes
- **Seeds**: Use `npm run db:seed` for consistent test data

### Security

- Strong CSP headers configured
- NextAuth.js for authentication
- Password hashing with bcrypt
- Rate limiting on sensitive endpoints (fail-closed on DB errors)
- CSRF protection with URL validation
- Input sanitization with ReDoS-resistant patterns
- AI cost tracking with monthly limits (fail-closed)
- SSRF protection for image URLs
- XSS prevention via DOMPurify and custom sanitizers

---

## AI Product Assessment Flow

### Overview

Products undergo AI assessment for marketplace eligibility using GPT-5 mini with bilingual support (English/Persian).

### Process Flow

1. **Product Creation/Update**: When a seller creates or updates a product
2. **Immediate PENDING Status**: Product is set to PENDING with progress messages
3. **Background Processing** (3 steps):
   - Step 1: Product validation and initial checks
   - Step 2: Enhancement with AI (improve descriptions, generate tags)
   - Step 3: Eligibility assessment (APPROVED/REJECTED decision)

### Bilingual Support

- AI generates assessment reasons in both English and Persian
- Stored as JSON in `eligibilityReasons` field: `{"en": "...", "fa": "..."}`
- ProductStatusBadge component displays correct language based on locale
- Important: JSON must not be truncated to preserve valid structure

### Key Files

- `/lib/moderation-ai.ts` - AI assessment logic with GPT-5 mini
- `/lib/product-enhancement-openai.ts` - Product enhancement before assessment
- `/app/api/seller/products/route.ts` - POST endpoint for new products
- `/app/api/seller/products/[id]/route.ts` - PUT endpoint for updates
- `/components/products/ProductStatusBadge.tsx` - Status display with bilingual support

### Monitoring

- Use `npx tsx scripts/watch-product-status.ts [productId]` to monitor status changes
- Products poll every 3 seconds when PENDING to get updates
- Check logs for AI processing steps and decisions

---

## Non-AI Product Processing Flow

### Overview

Products can be submitted without AI enhancement, using Azure Translator for bilingual support and automatic image optimization.

### Process Flow

1. **Product Creation/Update**: Seller chooses "Submit without AI" option
2. **Immediate Processing**:
   - Step 1: Azure Translator translates title/description between Persian and English
   - Step 2: Image resizing to 1024x1024 for consistency
   - Step 3: Direct approval (bypasses AI assessment)

### Features

- **Bilingual Translation**: Automatic Persian ↔ English translation using Azure Translator
- **Image Standardization**: All images resized to 1024x1024 with white background
- **Instant Approval**: Products go directly to APPROVED status
- **Cost Efficient**: No AI API costs, only Azure Translator usage

### Key Files

- `/lib/azure-translator.ts` - Azure Translator service integration
- `/lib/image-resizer.ts` - Sharp-based image resizing to 1024x1024
- `/lib/product-enhancement-noai.ts` - Non-AI processing orchestration
- Product API routes support `useAI=false` parameter

### Configuration

Azure Translator requires:

- Global endpoint: `https://api.cognitive.microsofttranslator.com`
- Region: `global`
- API key from Azure Cognitive Services

---

## Recent Security Improvements

### Critical Fixes (Implemented)

1. **Rate Limiter**: Now fails closed - denies requests when database is unavailable
2. **AI Cost Tracking**: Fails closed - denies expensive operations on tracking failure
3. **CSRF Protection**: Enhanced with URL validation to prevent bypass attacks
4. **Input Sanitization**: Optimized patterns to prevent ReDoS attacks

### Remaining Security Tasks

See `/SECURITY-ANALYSIS.md` for comprehensive analysis and remaining risks:

- API key rotation mechanism needed
- Enhanced SSRF protection with DNS validation
- File upload magic number validation
- User-based rate limiting (currently IP-based only)
- Session invalidation on password change

---

## Important Notes

### Demo Accounts (after seeding)

- **Seller**: seller@example.com / seller123
- **Buyer**: buyer@example.com / password123

### Environment Setup

Key environment variables needed:

**Database:**

- `DATABASE_URL` - Neon pooled connection
- `DIRECT_URL` - Neon direct connection

**Authentication:**

- `NEXTAUTH_SECRET` - Authentication secret
- `NEXTAUTH_URL` - App URL for auth callbacks

**AI & Translation Services:**

- `OPENAI_API_KEY` - OpenAI API key for GPT-5 mini
- `AZURE_TRANSLATOR_KEY` - Azure Translator API key
- `AZURE_TRANSLATOR_ENDPOINT` - `https://api.cognitive.microsofttranslator.com`
- `AZURE_TRANSLATOR_REGION` - `global`

**Image Services:**

- `CLOUDINARY_CLOUD_NAME` - Cloudinary cloud name
- `CLOUDINARY_API_KEY` - Cloudinary API key
- `CLOUDINARY_API_SECRET` - Cloudinary API secret

### Troubleshooting

- Database issues: `npx prisma generate && npx prisma migrate deploy`
- Build failures: Check `npm run typecheck` and environment variables
- i18n issues: Verify middleware config and translation keys exist

---
