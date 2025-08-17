-- Optimize search performance with additional indexes

-- Add GIN index for full-text search on products
CREATE INDEX idx_product_fts ON "Product" USING GIN (to_tsvector('english', title || ' ' || description));

-- Add trigram indexes for similarity search
CREATE INDEX idx_product_title_trgm ON "Product" USING GIN (title gin_trgm_ops);
CREATE INDEX idx_product_description_trgm ON "Product" USING GIN (description gin_trgm_ops);

-- Add composite indexes for common filter combinations
CREATE INDEX idx_product_active_approved ON "Product" (active, "eligibilityStatus") WHERE active = true AND "eligibilityStatus" = 'APPROVED';
CREATE INDEX idx_product_price_range ON "Product" ("priceToman") WHERE active = true AND "eligibilityStatus" = 'APPROVED';
CREATE INDEX idx_product_category_active ON "Product" ("categoryId", active, "eligibilityStatus") WHERE active = true AND "eligibilityStatus" = 'APPROVED';

-- Add index for seller verification status
CREATE INDEX idx_seller_verified ON "SellerProfile" (verified) WHERE verified = true;

-- Add composite index for product with seller verification
CREATE INDEX idx_product_seller_verified ON "Product" ("sellerId", active, "eligibilityStatus") WHERE active = true AND "eligibilityStatus" = 'APPROVED';

-- Add index for product sorting by creation date
CREATE INDEX idx_product_created_desc ON "Product" ("createdAt" DESC) WHERE active = true AND "eligibilityStatus" = 'APPROVED';

-- Add index for faceted search queries
CREATE INDEX idx_product_facets ON "Product" ("categoryId", "priceToman", active, "eligibilityStatus") WHERE active = true AND "eligibilityStatus" = 'APPROVED';