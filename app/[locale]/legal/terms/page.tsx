import { getTranslations } from 'next-intl/server';
import { Badge } from '@/components/ui/badge';

export async function generateMetadata() {
  const t = await getTranslations('legal.terms');
  
  return {
    title: t('metaTitle') || 'Terms of Service - Kiara Kraft',
    description: t('metaDescription') || 'Terms of Service for Kiara Kraft handcrafted marketplace',
    robots: 'index, follow',
  };
}

export default function TermsOfServicePage() {
  const lastUpdated = '2025-08-18';

  return (
    <div className="min-h-screen py-8">
      <div className="container mx-auto px-4 max-w-4xl">
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-4">Terms of Service</h1>
          <div className="flex items-center gap-4 text-muted-foreground">
            <Badge variant="secondary">Last Updated: {lastUpdated}</Badge>
            <span>Effective Date: {lastUpdated}</span>
          </div>
        </div>

        <div className="prose prose-lg max-w-none">
          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">1. Acceptance of Terms</h2>
            <p>
              By accessing and using Kiara Kraft, you accept and agree to be bound by the terms 
              and provision of this agreement. If you do not agree to abide by the above, please 
              do not use this service.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">2. Definitions</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>Platform:</strong> Kiara Kraft marketplace and all related services</li>
              <li><strong>User:</strong> Any person who accesses or uses the platform</li>
              <li><strong>Seller:</strong> Verified artisan who lists products on the platform</li>
              <li><strong>Buyer:</strong> User who purchases products through the platform</li>
              <li><strong>Content:</strong> All text, images, and other materials on the platform</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">3. Seller Terms</h2>
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-medium mb-2">Verification Process</h3>
                <p>All sellers must complete our verification process, including identity verification and quality assessment of their crafts.</p>
              </div>
              <div>
                <h3 className="text-lg font-medium mb-2">Product Quality</h3>
                <p>Sellers must ensure all products meet our quality standards and accurately represent handcrafted Iranian items.</p>
              </div>
              <div>
                <h3 className="text-lg font-medium mb-2">Commission Structure</h3>
                <p>Platform commission is deducted from successful sales as outlined in the seller agreement.</p>
              </div>
            </div>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">4. Payment Terms</h2>
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-medium mb-2">Payment Methods</h3>
                <p>We accept bank transfers, cash on delivery, and approved online payment gateways.</p>
              </div>
              <div>
                <h3 className="text-lg font-medium mb-2">Processing Time</h3>
                <p>Payments are processed within 1-3 business days of order confirmation.</p>
              </div>
              <div>
                <h3 className="text-lg font-medium mb-2">Refunds</h3>
                <p>Refund eligibility is subject to our refund policy and must be initiated within 7 days of delivery.</p>
              </div>
            </div>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">5. User Conduct</h2>
            <p className="mb-4">Users agree not to engage in:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Fraudulent activities or false representations</li>
              <li>Copyright or trademark infringement</li>
              <li>Harassment or inappropriate behavior</li>
              <li>Spam or unauthorized marketing</li>
              <li>Any illegal activities</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">6. Intellectual Property</h2>
            <p>
              All content on Kiara Kraft, including logos, designs, and text, is protected by 
              intellectual property laws. Users may not reproduce, distribute, or create 
              derivative works without explicit permission.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">7. Privacy Policy</h2>
            <p>
              Your privacy is important to us. Please review our Privacy Policy, which also 
              governs your use of the platform, to understand our practices.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">8. Limitation of Liability</h2>
            <p>
              Kiara Kraft shall not be liable for any indirect, incidental, special, or 
              consequential damages resulting from your use of the platform.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">9. Governing Law</h2>
            <p>
              These terms shall be governed by and construed in accordance with the laws of 
              the Islamic Republic of Iran.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">10. Changes to Terms</h2>
            <p>
              We reserve the right to modify these terms at any time. Users will be notified 
              of significant changes via email or platform notification.
            </p>
          </section>
        </div>

        <div className="mt-12 p-6 bg-muted/50 border rounded-lg">
          <h2 className="text-xl font-semibold mb-4">Contact Information</h2>
          <p className="text-muted-foreground mb-4">
            For questions about these Terms of Service, please contact us:
          </p>
          <div className="space-y-2 text-sm">
            <p><strong>Email:</strong> legal@kiarakraft.com</p>
            <p><strong>Address:</strong> Tehran, Islamic Republic of Iran</p>
            <p><strong>Response Time:</strong> Within 48 hours during business days</p>
          </div>
        </div>
      </div>
    </div>
  );
}