import { isPublicProduct } from './public-product';

export type PreflightIssueReason = 'inactive' | 'insufficient_stock';

export interface PreflightProduct {
  id: string;
  title: string;
  stock: number;
  active: boolean;
  isTest: boolean;
  eligibilityStatus: string;
}

export interface PreflightItem {
  productId: string;
  quantity: number;
  product: Omit<PreflightProduct, 'id'>;
}

export interface PreflightIssue {
  productId: string;
  title: string;
  requested: number;
  available: number;
  reason: PreflightIssueReason;
}

export function collectPreflightIssues(
  items: PreflightItem[]
): PreflightIssue[] {
  const issues: PreflightIssue[] = [];
  for (const it of items) {
    const available = it.product?.stock ?? 0;
    const isAvailable = it.product ? isPublicProduct(it.product) : false;
    const title = it.product?.title || 'Unknown';
    if (!isAvailable) {
      issues.push({
        productId: it.productId,
        title,
        requested: it.quantity,
        available,
        reason: 'inactive',
      });
    } else if (available < it.quantity) {
      issues.push({
        productId: it.productId,
        title,
        requested: it.quantity,
        available,
        reason: 'insufficient_stock',
      });
    }
  }
  return issues;
}
