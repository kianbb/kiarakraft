import { Badge } from '@/components/ui/badge';
import { Shield } from 'lucide-react';

export async function generateMetadata() {
  return {
    title: 'Privacy Policy - Kiara Kraft',
    description: 'Privacy Policy for Kiara Kraft handcrafted marketplace',
    robots: 'index, follow',
  };
}

export default function PrivacyPolicyPage() {
  const lastUpdated = '2025-08-18';

  return (
    <div className="min-h-screen py-8">
      <div className="container mx-auto px-4 max-w-4xl">
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-4 flex items-center gap-3">
            <Shield className="h-10 w-10 text-primary" />
            Privacy Policy
          </h1>
          <div className="flex items-center gap-4 text-muted-foreground">
            <Badge variant="secondary">Last Updated: {lastUpdated}</Badge>
            <span>Effective Date: {lastUpdated}</span>
          </div>
        </div>

        <div className="prose prose-lg max-w-none">
          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">1. Information We Collect</h2>
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-medium mb-2">Personal Information</h3>
                <p>Name, email address, phone number, shipping address, and payment information when you create an account or make a purchase.</p>
              </div>
              <div>
                <h3 className="text-lg font-medium mb-2">Usage Information</h3>
                <p>How you interact with our platform, including pages visited, products viewed, and search queries.</p>
              </div>
              <div>
                <h3 className="text-lg font-medium mb-2">Device Information</h3>
                <p>IP address, browser type, device type, and operating system for security and analytics purposes.</p>
              </div>
            </div>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">2. How We Use Your Information</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>Process orders and payments</li>
              <li>Communicate about your account and orders</li>
              <li>Improve our platform and services</li>
              <li>Prevent fraud and ensure security</li>
              <li>Send marketing communications (with your consent)</li>
              <li>Comply with legal obligations</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">3. Information Sharing</h2>
            <p className="mb-4">We may share your information with:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>Sellers:</strong> Order and shipping information necessary to fulfill purchases</li>
              <li><strong>Service Providers:</strong> Payment processors, shipping companies, and analytics services</li>
              <li><strong>Legal Authorities:</strong> When required by law or to protect our rights</li>
              <li><strong>Business Transfers:</strong> In the event of a merger, acquisition, or sale</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">4. Data Security</h2>
            <p className="mb-4">We implement industry-standard security measures to protect your information:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>SSL encryption for data transmission</li>
              <li>Secure data storage with access controls</li>
              <li>Regular security monitoring and updates</li>
              <li>Employee training on data protection</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">5. Your Rights</h2>
            <p className="mb-4">You have the right to:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Access your personal information</li>
              <li>Correct inaccurate information</li>
              <li>Request deletion of your information</li>
              <li>Export your data</li>
              <li>Opt out of marketing communications</li>
              <li>Restrict processing of your information</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">6. Cookies and Tracking</h2>
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-medium mb-2">Essential Cookies</h3>
                <p>Required for the platform to function properly, including authentication and security.</p>
              </div>
              <div>
                <h3 className="text-lg font-medium mb-2">Analytics Cookies</h3>
                <p>Help us understand how users interact with our platform to improve the user experience.</p>
              </div>
              <div>
                <h3 className="text-lg font-medium mb-2">Marketing Cookies</h3>
                <p>Used to deliver personalized advertisements and track campaign effectiveness.</p>
              </div>
            </div>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">7. Children&apos;s Privacy</h2>
            <p>
              Our platform is not intended for children under 13 years of age. We do not knowingly 
              collect personal information from children under 13.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">8. International Transfers</h2>
            <p>
              Your information may be transferred to and processed in countries other than Iran. 
              We ensure appropriate safeguards are in place to protect your information.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">9. Changes to This Policy</h2>
            <p>
              We may update this Privacy Policy from time to time. We will notify you of any 
              material changes via email or platform notification.
            </p>
          </section>
        </div>

        <div className="mt-12 p-6 bg-muted/50 border rounded-lg">
          <h2 className="text-xl font-semibold mb-4">Contact Our Data Protection Officer</h2>
          <p className="text-muted-foreground mb-4">
            For questions about this Privacy Policy or your personal information:
          </p>
          <div className="space-y-2 text-sm">
            <p><strong>Email:</strong> privacy@kiarakraft.com</p>
            <p><strong>Phone:</strong> +98 21 1234 5678</p>
            <p><strong>Address:</strong> Tehran, Islamic Republic of Iran</p>
            <p><strong>Response Time:</strong> Within 30 days</p>
          </div>
        </div>
      </div>
    </div>
  );
}