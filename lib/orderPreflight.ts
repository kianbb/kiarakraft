export type PreflightIssueReason = 'inactive' | 'insufficient_stock';

export interface PreflightProduct {
  id: string;
  title: string;
  stock: number;
  active: boolean;
}

export interface PreflightItem {
  productId: string;
  quantity: number;
  product: Pick<PreflightProduct, 'title' | 'stock' | 'active'>;
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
    const isActive = it.product?.active ?? false;
    const title = it.product?.title || 'Unknown';
    if (!isActive) {
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
