import { Shield, CheckCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface VerifiedBadgeProps {
  verified: boolean;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'default' | 'outline' | 'compact';
  className?: string;
}

export function VerifiedBadge({ 
  verified, 
  size = 'md', 
  variant = 'default',
  className 
}: VerifiedBadgeProps) {
  if (!verified) return null;

  const sizeClasses = {
    sm: 'text-xs px-2 py-1',
    md: 'text-sm px-3 py-1',
    lg: 'text-base px-4 py-2'
  };

  const iconSizes = {
    sm: 'h-3 w-3',
    md: 'h-4 w-4', 
    lg: 'h-5 w-5'
  };

  if (variant === 'compact') {
    return (
      <div className={cn(
        'inline-flex items-center gap-1 text-green-600',
        className
      )}>
        <CheckCircle className={iconSizes[size]} />
        {size !== 'sm' && <span className="text-xs font-medium">Verified</span>}
      </div>
    );
  }

  return (
    <Badge 
      variant={variant === 'outline' ? 'outline' : 'default'}
      className={cn(
        'bg-green-100 text-green-800 border-green-200 hover:bg-green-200',
        sizeClasses[size],
        variant === 'outline' && 'bg-transparent',
        className
      )}
    >
      <Shield className={cn(iconSizes[size], 'mr-1')} />
      Verified Seller
    </Badge>
  );
}