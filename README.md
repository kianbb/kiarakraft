# Kiara Kraft (کیارا کرفت)

A modern Iranian handmade marketplace inspired by Etsy, built with Next.js 14 and TypeScript. Features bilingual support (Persian/English) with full RTL/LTR layout switching.

## 🚀 Features

- **Bilingual Support**: Persian (default, RTL) and English (LTR) with next-intl
- **Authentication**: Email/password auth with NextAuth.js and role-based access
- **Product Management**: Full CRUD for sellers with image galleries
- **Shopping Experience**: Browse, filter, cart, and checkout functionality
- **Responsive Design**: Mobile-first with Tailwind CSS and shadcn/ui
- **SEO Optimized**: Metadata, structured data, and semantic HTML
- **Accessible**: WCAG compliant with keyboard navigation and screen reader support

## 🛠 Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript (strict mode)
- **Styling**: Tailwind CSS + shadcn/ui components
- **Database**: Prisma ORM with PostgreSQL (Neon) 
- **Authentication**: NextAuth.js with Credentials provider
- **Internationalization**: next-intl with RTL/LTR support
- **Forms**: react-hook-form + Zod validation
- **Icons**: Lucide React
- **Deployment**: Vercel (production) with Neon PostgreSQL

## 🏗 Project Structure

```
kiarakraft/
├── app/                    # Next.js App Router
│   ├── [locale]/          # Internationalized routes
│   │   ├── auth/          # Login/register pages
│   │   ├── cart/          # Shopping cart
│   │   ├── checkout/      # Checkout flow
│   │   ├── explore/       # Product catalog
│   │   ├── product/       # Product detail pages
│   │   └── seller/        # Seller dashboard
│   ├── api/               # API routes
│   └── globals.css        # Global styles
├── components/            # Reusable UI components
│   ├── layout/           # Header, footer, navigation
│   ├── products/         # Product-related components
│   ├── providers/        # Context providers
│   ├── seo/             # SEO components
│   └── ui/              # shadcn/ui components
├── lib/                  # Utilities and configurations
├── locales/             # Translation files (fa.json, en.json)
├── prisma/              # Database schema and migrations
└── types/               # TypeScript type definitions
```

## 🚀 Getting Started

### Prerequisites

- Node.js 20+
- npm, yarn, pnpm, or bun

### Installation

1. **Clone and install dependencies**
   ```bash
   git clone <repository-url>
   cd kiarakraft
   npm install
   ```

2. **Set up environment variables**
   ```bash
   cp .env.example .env
   ```
   Edit `.env` and set your values (see `.env.example`):
   ```env
   DATABASE_URL="postgresql://user:pass@host-pooler.region.neon.tech/db?sslmode=require&pgbouncer=true&connection_limit=1"
   DIRECT_URL="postgresql://user:pass@host.region.neon.tech/db?sslmode=require"
   NEXTAUTH_SECRET="your-secret-key"
   NEXTAUTH_URL="http://localhost:3000"
   ```

3. **Initialize database**
   ```bash
   npx prisma migrate dev
   npm run db:seed
   ```

4. **Start development server**
   ```bash
   npm run dev
   ```

5. **Open the application**
   Visit [http://localhost:3000](http://localhost:3000)

## 📱 Demo Accounts

After seeding, you can use these accounts:

**Seller Account:**
- Email: `seller@example.com`
- Password: `password123`
- Access: Seller dashboard at `/seller`

**Buyer Account:**
- Email: `buyer@example.com`  
- Password: `password123`
- Access: Shopping and cart features

## 🗄 Database Scripts

## Automatic Translations (fa → en)

This app can automatically translate product title/description from Persian to English and store them:

- Prisma model: `ProductTranslation` with unique `(productId, locale)`.
- On product create, if the text contains Persian characters, a background task translates to English and upserts `ProductTranslation`.
- Explore and product pages prefer the `en` translation when locale is `en`, falling back to the original.

Configure a provider via env vars (Azure Translator recommended):

```
TRANSLATOR_PROVIDER=azure
AZURE_TRANSLATOR_ENDPOINT=https://api.cognitive.microsofttranslator.com
AZURE_TRANSLATOR_KEY=your-key
AZURE_TRANSLATOR_REGION=your-region
```

Backfill existing products:

```
npm run translate:backfill
```

```bash
# Seed the database with demo data
npm run db:seed

# Reset database (careful - deletes all data!)
npm run db:reset

# Generate Prisma client after schema changes
npx prisma generate

# Create new migration
npx prisma migrate dev --name migration-name

# View database in Prisma Studio
npx prisma studio
```

## 🌐 Internationalization

The app supports Persian (fa) and English (en) locales:

- **Default**: Persian (RTL layout)
- **Switch**: Language toggle in navbar
- **URLs**: `/fa/...` and `/en/...`
- **Translation files**: `locales/fa.json` and `locales/en.json`

### Adding New Translations

1. Add keys to both `locales/fa.json` and `locales/en.json`
2. Use in components:
   ```tsx
   import { useTranslations } from 'next-intl';
   
   const t = useTranslations('namespace');
   return <h1>{t('title')}</h1>;
   ```

## 🚀 Production Deployment

### Vercel (Canonical Deployment Platform)

**Live Site:** https://www.kiarakraft.com

1. **Import project** to Vercel dashboard
2. **Configure environment variables** in project settings:
   ```env
   DATABASE_URL="postgresql://neondb_owner:...@ep-host-pooler.region.aws.neon.tech/neondb?sslmode=require&pgbouncer=true&connection_limit=1"
   DIRECT_URL="postgresql://neondb_owner:...@ep-host.region.aws.neon.tech/neondb?sslmode=require"
   NEXTAUTH_SECRET="production-secret-generated-with-openssl-rand-base64-32"
   NEXTAUTH_URL="https://www.kiarakraft.com"
   ```
3. **Deploy** automatically on git push to main
4. **Domain configuration**: Set up custom domain with redirects
5. **SSL/TLS**: Automatic HTTPS via Vercel

### Production Checklist

#### ✅ Environment Variables
- [ ] `DATABASE_URL` - Neon pooled connection string  
- [ ] `DIRECT_URL` - Neon direct connection for migrations
- [ ] `NEXTAUTH_SECRET` - Strong random secret (32+ chars)
- [ ] `NEXTAUTH_URL` - Canonical production domain
- [ ] `PUBLIC_APP_BASE` - Canonical app origin used to build payment callback URLs
- [ ] `ALLOWED_APP_BASE_HOSTS` - Comma-separated host allowlist for selecting PUBLIC_APP_BASE
 - [ ] `NEXT_PUBLIC_PLAUSIBLE_DOMAIN` - Set to enable Plausible analytics script
 - [ ] `SENTRY_DSN` - Sentry DSN for error reporting
 - [ ] `LHCI_BASE_URL` (GitHub Secret) - Base URL for Lighthouse CI (e.g., https://www.kiarakraft.com)

#### ✅ Domain & Redirects  
- [ ] Primary domain: `www.kiarakraft.com`
- [ ] Apex redirect: `kiarakraft.com` → `www.kiarakraft.com`
- [ ] Geographic redirects: `kiarakraft.ir` → `www.kiarakraft.com`
- [ ] SSL/TLS enabled with HTTPS redirects

#### ✅ Database & Migrations
- [ ] Neon PostgreSQL database provisioned
- [ ] Connection pooling enabled (PgBouncer)
- [ ] Production migrations deployed via GitHub Actions
- [ ] Database backups configured

#### ✅ SEO & Performance
- [ ] Robots.txt configured for production indexing
- [ ] XML sitemaps generated and submitted
- [ ] Canonical URLs set correctly
- [ ] OpenGraph/Twitter meta tags present
- [ ] Performance monitoring enabled

#### ✅ Security
- [ ] Security headers configured
- [ ] CORS policies set appropriately  
- [ ] Rate limiting in place
- [ ] Error pages don't leak sensitive info
- [ ] All secrets rotated after git history purge

#### ✅ Monitoring
- [ ] Error tracking configured
- [ ] Performance monitoring setup
- [ ] Database query monitoring
- [ ] Uptime monitoring active

### Manual Production Setup

```bash
# Build for production
npm run build

# Start production server
npm start

# Or export as static files
npm run build && npm run export
```

## 📊 Lighthouse CI (Performance Budgets)

This repo includes Lighthouse CI to track performance/accessibility on `/en` and `/fa`.

- Config: `lighthouserc.json`
- GitHub Action: `.github/workflows/lighthouse-ci.yml`
- Required secret: `LHCI_BASE_URL` (e.g., production preview or prod URL)

Run locally:

```bash
npm i -g @lhci/cli
LHCI_BASE_URL=http://localhost:3000 lhci autorun --config=lighthouserc.json --collect.url="$LHCI_BASE_URL/en" --collect.url="$LHCI_BASE_URL/fa"
```

## 🔧 Development

### Code Style

- **TypeScript**: Strict mode enabled
- **ESLint**: Next.js configuration
- **Prettier**: Code formatting (recommended)
- **Conventions**: 
  - Use Server Components by default
  - Client components only when needed
  - Server Actions for mutations
  - API routes for external integrations

### Adding Features

1. **New pages**: Add to `app/[locale]/` directory
2. **API endpoints**: Add to `app/api/` directory  
3. **Components**: Add to `components/` with proper subfolder
4. **Database changes**: Update `prisma/schema.prisma` and migrate
5. **Translations**: Update both locale JSON files

## 🧪 Testing

```bash
# Type checking
npx tsc --noEmit

# Linting
npm run lint

# Build test
npm run build
```

## 📁 Key Files

- `middleware.ts` - Handles i18n routing and auth protection
- `app/layout.tsx` - Root layout with providers
- `app/[locale]/layout.tsx` - Locale-specific layout
- `lib/auth.ts` - NextAuth configuration
- `prisma/schema.prisma` - Database schema
- `next.config.mjs` - Next.js configuration

## 🔐 Security

- Password hashing with bcrypt
- CSRF protection via NextAuth
- SQL injection prevention via Prisma
- XSS protection via React's built-in escaping
- Security headers in `netlify.toml`

## 🐛 Troubleshooting

### Common Issues

1. **Database connection errors**:
   ```bash
   npx prisma generate
   npx prisma migrate deploy
   ```

2. **Build failures**:
   - Check TypeScript errors: `npx tsc --noEmit`
   - Check environment variables are set

3. **Locale issues**:
   - Verify middleware configuration
   - Check translation key existence

### Getting Help

- Check [Next.js docs](https://nextjs.org/docs)
- Review [Prisma docs](https://www.prisma.io/docs)
- See [next-intl docs](https://next-intl-docs.vercel.app)

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🤝 Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open Pull Request

---

Built with ❤️ for Iranian artisans and craftspeople.
 
## 🖼️ AI Image Generation (optional)

You can generate category-accurate images for all products and categories and upload them to Cloudinary.

Environment variables required:

```
OPENAI_API_KEY=sk-...
NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME=your_cloud
CLOUDINARY_API_KEY=...
CLOUDINARY_API_SECRET=...
```

Scripts:

- Generate product images for all active products:
   - `npm run images:generate:products`
   - Only missing: `npm run images:generate:products:missing`
   - Replace existing: `npm run images:generate:products:replace`
- Generate category tile images:
   - `npm run images:generate:categories`

Curated category fallbacks live in `lib/assets.ts` and are used by the homepage if no product image is available per category.