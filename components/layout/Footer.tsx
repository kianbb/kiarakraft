'use client';

import { useTranslations } from 'next-intl';
import { useLocale } from 'next-intl';
import Link from 'next/link';
import { Mail, Phone, MapPin } from 'lucide-react';

export default function Footer() {
  const t = useTranslations('footer');
  const locale = useLocale();

  const footerLinks = [
    {
      title: 'Kiara Kraft',
      links: [
        { name: t('about'), href: `/${locale}/about` },
        { name: t('contact'), href: `/${locale}/contact` },
        { name: t('help'), href: `/${locale}/help` },
      ]
    },
    {
      title: t('legal'),
      links: [
        { name: t('terms'), href: `/${locale}/terms` },
        { name: t('privacy'), href: `/${locale}/privacy` },
      ]
    },
    {
      title: t('categories'),
      links: [
        { name: t('categoryCeramics'), href: `/${locale}/explore?category=ceramics` },
        { name: t('categoryTextiles'), href: `/${locale}/explore?category=textiles` },
        { name: t('categoryJewelry'), href: `/${locale}/explore?category=jewelry` },
        { name: t('categoryWoodwork'), href: `/${locale}/explore?category=woodwork` },
      ]
    }
  ];

  return (
    <footer className="bg-muted/30 border-t border-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {/* Brand Section */}
          <div className="lg:col-span-1">
            <Link href={`/${locale}`} className="flex items-center space-x-2 mb-4">
              <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                <span className="text-primary-foreground font-bold text-lg">K</span>
              </div>
              <span className="text-xl font-bold text-foreground">
                Kiara Kraft
              </span>
            </Link>
            <p className="text-muted-foreground text-sm mb-4 max-w-xs">
              {t('brandDescription')}
            </p>
            
            {/* Contact Info */}
            <div className="space-y-2 text-sm text-muted-foreground">
              <div className="flex items-center space-x-2">
                <Mail className="w-4 h-4" />
                <span>info@kiarakraft.com</span>
              </div>
              <div className="flex items-center space-x-2">
                <Phone className="w-4 h-4" />
                <span>+98 21 1234 5678</span>
              </div>
              <div className="flex items-center space-x-2">
                <MapPin className="w-4 h-4" />
                <span>Tehran, Iran</span>
              </div>
            </div>
          </div>

          {/* Footer Links */}
          {footerLinks.map((section) => (
            <div key={section.title}>
              <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider mb-4">
                {section.title}
              </h3>
              <ul className="space-y-2">
                {section.links.map((link) => (
                  <li key={link.name}>
                    <Link
                      href={link.href}
                      className="text-sm text-muted-foreground hover:text-primary transition-colors"
                    >
                      {link.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom Section */}
        <div className="mt-8 pt-8 border-t border-border">
          <div className="flex flex-col md:flex-row justify-between items-center">
            <div className="text-sm text-muted-foreground">
              <p className="mb-2 md:mb-0">
                © {new Date().getFullYear()} Kiara Kraft. {t('allRightsReserved')}.
              </p>
            </div>
            
            <div className="flex items-center space-x-1 text-sm text-muted-foreground">
              <span>{t('madeWith')}</span>
            </div>
          </div>
          
          {/* Support Iranian Crafts Message */}
          <div className="mt-4 text-center">
            <p className="text-xs text-muted-foreground">
              {t('supportMessage')}
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}