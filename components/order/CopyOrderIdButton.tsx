'use client';

import { Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function CopyOrderIdButton({
  orderId,
  label,
}: {
  orderId: string;
  label: string;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={() => navigator.clipboard.writeText(orderId)}
    >
      <Copy className="h-3 w-3 mr-1" />
      {label}
    </Button>
  );
}
