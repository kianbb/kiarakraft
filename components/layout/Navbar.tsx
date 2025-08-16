'use client';

import { useState, useEffect } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useLocale } from 'next-intl';
import { 
  Search, 
  ShoppingCart, 
  User, 
  Menu, 
  X,
  LogOut,
  Settings,
  Package
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import LanguageSwitcher from '@/components/LanguageSwitcher';

export default function Navbar() {
  const { data: session } = useSession();
  const pathname = usePathname();
  const locale = useLocale();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);
  
  // Prevent SSR/hydration mismatch by only rendering after client-side hydration
  useEffect(() => {
    setIsHydrated(true);
  }, []);

  // Don't render until hydrated to prevent locale context issues
  if (!isHydrated) {
    return (
      <nav className="bg-background border-b border-border sticky top-0 z-50" role="navigation" aria-label="Main navigation">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                <span className="text-primary-foreground font-bold text-lg">K</span>
              </div>
              <span className="text-xl font-bold text-foreground hidden sm:block ml-2">Kiara Kraft</span>
            </div>
          </div>
        </div>
      </nav>
    );
  }

  const t = useTranslations('navigation');
  const isRTL = locale === 'fa';

  const navigation = [
    { name: t('home'), href: `/${locale}` },
    { name: t('explore'), href: `/${locale}/explore` },
  ];

  return (
    <nav className="bg-background border-b border-border sticky top-0 z-50" role="navigation" aria-label="Main navigation">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo */}
          <div className="flex items-center">
            <Link href={`/${locale}`} className={`flex items-center ${isRTL ? 'space-x-reverse space-x-2' : 'space-x-2'}`}>
              <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                <span className="text-primary-foreground font-bold text-lg">K</span>
              </div>
              <span className="text-xl font-bold text-foreground hidden sm:block">
                Kiara Kraft
              </span>
            </Link>
          </div>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center space-x-8">
            {navigation.map((item) => (
              <Link
                key={item.name}
                href={item.href}
                className={`text-sm font-medium transition-colors hover:text-primary ${
                  pathname === item.href
                    ? 'text-primary'
                    : 'text-muted-foreground'
                }`}
              >
                {item.name}
              </Link>
            ))}
          </div>

          {/* Search Bar */}
          <div className="hidden lg:flex flex-1 max-w-md mx-8" role="search">
            <div className="relative w-full">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" aria-hidden="true" />
              <Input
                type="search"
                placeholder={t('search') || 'Search...'}
                className="pl-10 pr-4"
                aria-label={t('search') || 'Search products'}
              />
            </div>
          </div>

          {/* Right Side Actions */}
          <div className="flex items-center space-x-4">
            {/* Language Switcher */}
            <div className="hidden sm:block">
              <LanguageSwitcher />
            </div>

            {/* Cart */}
            <Link href={`/${locale}/cart`} className="relative" aria-label={`${t('cart')} (0 items)`}>
              <Button variant="ghost" size="icon">
                <ShoppingCart className="w-5 h-5" aria-hidden="true" />
                <span className="absolute -top-1 -right-1 bg-primary text-primary-foreground text-xs rounded-full w-5 h-5 flex items-center justify-center" aria-label="0 items in cart">
                  0
                </span>
              </Button>
            </Link>

            {/* User Menu */}
            {session ? (
              <div className="relative">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                  className="relative"
                  aria-label="User menu"
                  aria-expanded={isUserMenuOpen}
                >
                  <User className="w-5 h-5" aria-hidden="true" />
                </Button>
                
                {isUserMenuOpen && (
                  <div className="absolute right-0 mt-2 w-48 bg-background border border-border rounded-md shadow-lg py-1 z-50" role="menu">
                    <div className="px-4 py-2 border-b border-border">
                      <p className="text-sm font-medium text-foreground">
                        {session.user.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {session.user.email}
                      </p>
                    </div>
                    
                    {session.user.role === 'SELLER' && (
                      <Link
                        href={`/${locale}/seller`}
                        className="block px-4 py-2 text-sm text-foreground hover:bg-accent flex items-center"
                        onClick={() => setIsUserMenuOpen(false)}
                      >
                        <Package className="w-4 h-4 mr-2" />
                        {t('dashboard')}
                      </Link>
                    )}
                    
                    <Link
                      href={`/${locale}/profile`}
                      className="block px-4 py-2 text-sm text-foreground hover:bg-accent flex items-center"
                      onClick={() => setIsUserMenuOpen(false)}
                    >
                      <Settings className="w-4 h-4 mr-2" />
{t('profile')}
                    </Link>
                    
                    <button
                      onClick={() => {
                        signOut();
                        setIsUserMenuOpen(false);
                      }}
                      className="block w-full text-left px-4 py-2 text-sm text-foreground hover:bg-accent flex items-center"
                    >
                      <LogOut className="w-4 h-4 mr-2" />
                      {t('logout')}
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="hidden sm:flex items-center space-x-2">
                <Link href={`/${locale}/auth/login`}>
                  <Button variant="ghost" size="sm">
                    {t('login')}
                  </Button>
                </Link>
                <Link href={`/${locale}/auth/register`}>
                  <Button size="sm">
                    {t('register')}
                  </Button>
                </Link>
              </div>
            )}

            {/* Mobile Menu Button */}
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              aria-label="Toggle menu"
              aria-expanded={isMenuOpen}
            >
              {isMenuOpen ? <X className="w-5 h-5" aria-hidden="true" /> : <Menu className="w-5 h-5" aria-hidden="true" />}
            </Button>
          </div>
        </div>

        {/* Mobile Menu */}
        {isMenuOpen && (
          <div className="md:hidden border-t border-border">
            <div className="px-2 pt-2 pb-3 space-y-1">
              {/* Search on mobile */}
              <div className="lg:hidden px-3 py-2">
                <div className="relative">
                  <Search className="absolute left-6 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                  <Input
                    type="search"
                    placeholder={t('search') || 'Search...'}
                    className="pl-10 pr-4"
                  />
                </div>
              </div>

              {/* Navigation links */}
              {navigation.map((item) => (
                <Link
                  key={item.name}
                  href={item.href}
                  className={`block px-3 py-2 rounded-md text-base font-medium transition-colors ${
                    pathname === item.href
                      ? 'text-primary bg-accent'
                      : 'text-muted-foreground hover:text-primary hover:bg-accent'
                  }`}
                  onClick={() => setIsMenuOpen(false)}
                >
                  {item.name}
                </Link>
              ))}

              {/* Language switcher on mobile */}
              <div className="sm:hidden px-3 py-2">
                <LanguageSwitcher />
              </div>

              {/* Auth buttons on mobile */}
              {!session && (
                <div className="sm:hidden px-3 py-2 space-y-2">
                  <Link href={`/${locale}/auth/login`} className="block">
                    <Button variant="outline" className="w-full" onClick={() => setIsMenuOpen(false)}>
                      {t('login')}
                    </Button>
                  </Link>
                  <Link href={`/${locale}/auth/register`} className="block">
                    <Button className="w-full" onClick={() => setIsMenuOpen(false)}>
                      {t('register')}
                    </Button>
                  </Link>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Overlay for mobile menu */}
      {isUserMenuOpen && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setIsUserMenuOpen(false)}
        />
      )}
    </nav>
  );
}