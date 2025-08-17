'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { 
  Shield, 
  CheckCircle, 
  XCircle, 
  Eye, 
  Search,
  Clock,
  MapPin,
  Phone,
  Globe,
  FileText
} from 'lucide-react';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';

interface SellerProfile {
  id: string;
  shopName: string;
  displayName: string;
  bio: string;
  phone: string | null;
  province: string | null;
  city: string | null;
  address: string | null;
  website: string | null;
  verified: boolean;
  verificationNotes: string | null;
  verifiedAt: string | null;
  verifiedBy: string | null;
  docsFolder: string | null;
  createdAt: string;
  user: {
    email: string;
    name: string | null;
  };
}

export default function AdminSellersPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [isHydrated, setIsHydrated] = useState(false);
  useEffect(() => setIsHydrated(true), []);
  const _t = useTranslations('admin');
  const t = isHydrated ? _t : ((k: string) => k) as (k: string) => string;

  const [sellers, setSellers] = useState<SellerProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState<'all' | 'pending' | 'verified'>('all');
  const [selectedSeller, setSelectedSeller] = useState<SellerProfile | null>(null);
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    if (status === 'loading') return;
    
    if (!session) {
      router.push('/auth/login');
      return;
    }

    if (session.user?.role !== 'ADMIN') {
      router.push('/');
      return;
    }

    fetchSellers();
  }, [session, status, router]);

  const fetchSellers = async () => {
    try {
      const response = await fetch('/api/admin/sellers');
      if (response.ok) {
        const data = await response.json();
        setSellers(data.sellers);
      } else {
        toast.error('Failed to load sellers');
      }
    } catch (error) {
      console.error('Error fetching sellers:', error);
      toast.error('Failed to load sellers');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyAction = async (sellerId: string, action: 'verify' | 'reject', notes: string) => {
    setVerifying(true);
    try {
      const response = await fetch('/api/admin/sellers/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sellerId,
          action,
          notes: notes.trim()
        })
      });

      if (response.ok) {
        toast.success(action === 'verify' ? 'Seller verified successfully' : 'Seller verification rejected');
        await fetchSellers();
        setSelectedSeller(null);
      } else {
        const error = await response.json();
        toast.error(error.message || `Failed to ${action} seller`);
      }
    } catch (error) {
      console.error(`Error ${action}ing seller:`, error);
      toast.error(`Failed to ${action} seller`);
    } finally {
      setVerifying(false);
    }
  };

  const filteredSellers = sellers
    .filter(seller => {
      const matchesSearch = 
        seller.shopName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        seller.displayName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        seller.user.email.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesFilter = 
        filter === 'all' || 
        (filter === 'pending' && !seller.verified) ||
        (filter === 'verified' && seller.verified);
      
      return matchesSearch && matchesFilter;
    })
    .sort((a, b) => {
      // Pending verification first
      if (!a.verified && b.verified) return -1;
      if (a.verified && !b.verified) return 1;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

  if (status === 'loading' || loading) {
    return (
      <div className="min-h-screen py-8">
        <div className="container mx-auto px-4">
          <div className="animate-pulse">
            <div className="bg-gray-200 h-8 rounded mb-8"></div>
            <div className="space-y-4">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="bg-gray-200 h-24 rounded"></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!session || session.user?.role !== 'ADMIN') {
    return null;
  }

  return (
    <div className="min-h-screen py-8">
      <div className="container mx-auto px-4">
        <div className="flex items-center gap-3 mb-8">
          <Shield className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-3xl font-bold">{t('sellerVerification')}</h1>
            <p className="text-muted-foreground">{t('verificationDescription')}</p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={t('searchSellers')}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
          
          <div className="flex gap-2">
            <Button
              variant={filter === 'all' ? 'default' : 'outline'}
              onClick={() => setFilter('all')}
              size="sm"
            >
              {t('all')} ({sellers.length})
            </Button>
            <Button
              variant={filter === 'pending' ? 'default' : 'outline'}
              onClick={() => setFilter('pending')}
              size="sm"
            >
              {t('pending')} ({sellers.filter(s => !s.verified).length})
            </Button>
            <Button
              variant={filter === 'verified' ? 'default' : 'outline'}
              onClick={() => setFilter('verified')}
              size="sm"
            >
              {t('verified')} ({sellers.filter(s => s.verified).length})
            </Button>
          </div>
        </div>

        {/* Sellers List */}
        <div className="space-y-4">
          {filteredSellers.map((seller) => (
            <div key={seller.id} className="bg-white border rounded-lg p-6">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-lg font-semibold">{seller.shopName}</h3>
                    <Badge variant={seller.verified ? 'default' : 'secondary'}>
                      {seller.verified ? (
                        <>
                          <CheckCircle className="h-3 w-3 mr-1" />
                          {t('verified')}
                        </>
                      ) : (
                        <>
                          <Clock className="h-3 w-3 mr-1" />
                          {t('pending')}
                        </>
                      )}
                    </Badge>
                  </div>
                  
                  <p className="text-muted-foreground mb-3">{seller.displayName}</p>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{t('email')}:</span>
                      {seller.user.email}
                    </div>
                    {seller.phone && (
                      <div className="flex items-center gap-2">
                        <Phone className="h-4 w-4" />
                        {seller.phone}
                      </div>
                    )}
                    {seller.province && seller.city && (
                      <div className="flex items-center gap-2">
                        <MapPin className="h-4 w-4" />
                        {seller.city}, {seller.province}
                      </div>
                    )}
                    {seller.website && (
                      <div className="flex items-center gap-2">
                        <Globe className="h-4 w-4" />
                        <a href={seller.website} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                          {t('website')}
                        </a>
                      </div>
                    )}
                  </div>
                  
                  <p className="text-xs text-muted-foreground mt-3">
                    {t('registered')} {formatDistanceToNow(new Date(seller.createdAt))} {t('ago')}
                  </p>
                </div>
                
                <div className="flex flex-col gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSelectedSeller(seller)}
                  >
                    <Eye className="h-4 w-4 mr-2" />
                    {t('review')}
                  </Button>
                  
                  {seller.docsFolder && (
                    <Button variant="outline" size="sm">
                      <FileText className="h-4 w-4 mr-2" />
                      {t('documents')}
                    </Button>
                  )}
                </div>
              </div>
            </div>
          ))}
          
          {filteredSellers.length === 0 && (
            <div className="text-center py-12">
              <Shield className="h-12 w-12 mx-auto text-muted-foreground opacity-50 mb-4" />
              <h3 className="text-lg font-semibold mb-2">{t('noSellers')}</h3>
              <p className="text-muted-foreground">{t('noSellersDescription')}</p>
            </div>
          )}
        </div>

        {/* Review Modal */}
        {selectedSeller && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <div className="p-6">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-xl font-semibold">{t('reviewSeller')}</h2>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedSeller(null)}
                  >
                    <XCircle className="h-4 w-4" />
                  </Button>
                </div>
                
                <div className="space-y-4">
                  <div>
                    <h3 className="font-medium mb-2">{t('basicInformation')}</h3>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="font-medium">{t('shopName')}:</span> {selectedSeller.shopName}
                      </div>
                      <div>
                        <span className="font-medium">{t('displayName')}:</span> {selectedSeller.displayName}
                      </div>
                      <div className="col-span-2">
                        <span className="font-medium">{t('bio')}:</span> {selectedSeller.bio}
                      </div>
                    </div>
                  </div>
                  
                  <div>
                    <h3 className="font-medium mb-2">{t('contactInformation')}</h3>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="font-medium">{t('email')}:</span> {selectedSeller.user.email}
                      </div>
                      <div>
                        <span className="font-medium">{t('phone')}:</span> {selectedSeller.phone || 'N/A'}
                      </div>
                      <div>
                        <span className="font-medium">{t('location')}:</span> 
                        {selectedSeller.city && selectedSeller.province 
                          ? `${selectedSeller.city}, ${selectedSeller.province}`
                          : 'N/A'}
                      </div>
                      <div>
                        <span className="font-medium">{t('website')}:</span> 
                        {selectedSeller.website ? (
                          <a href={selectedSeller.website} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                            {selectedSeller.website}
                          </a>
                        ) : 'N/A'}
                      </div>
                    </div>
                    
                    {selectedSeller.address && (
                      <div className="mt-2 text-sm">
                        <span className="font-medium">{t('address')}:</span> {selectedSeller.address}
                      </div>
                    )}
                  </div>
                  
                  {selectedSeller.verificationNotes && (
                    <div>
                      <h3 className="font-medium mb-2">{t('notes')}</h3>
                      <p className="text-sm bg-gray-50 p-3 rounded">{selectedSeller.verificationNotes}</p>
                    </div>
                  )}
                  
                  {!selectedSeller.verified && (
                    <div className="flex gap-3 pt-4 border-t">
                      <Button
                        onClick={() => {
                          const notes = prompt(t('verificationNotes'));
                          if (notes !== null) {
                            handleVerifyAction(selectedSeller.id, 'verify', notes);
                          }
                        }}
                        disabled={verifying}
                        className="flex-1"
                      >
                        <CheckCircle className="h-4 w-4 mr-2" />
                        {verifying ? t('verifying') : t('verify')}
                      </Button>
                      
                      <Button
                        variant="destructive"
                        onClick={() => {
                          const notes = prompt(t('rejectionReason'));
                          if (notes !== null && notes.trim()) {
                            handleVerifyAction(selectedSeller.id, 'reject', notes);
                          }
                        }}
                        disabled={verifying}
                        className="flex-1"
                      >
                        <XCircle className="h-4 w-4 mr-2" />
                        {t('reject')}
                      </Button>
                    </div>
                  )}
                  
                  {selectedSeller.verified && selectedSeller.verifiedAt && (
                    <div className="bg-green-50 border border-green-200 p-3 rounded">
                      <p className="text-sm text-green-800">
                        {t('verifiedOn')} {new Date(selectedSeller.verifiedAt).toLocaleDateString()}
                        {selectedSeller.verifiedBy && ` ${t('by')} ${selectedSeller.verifiedBy}`}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}