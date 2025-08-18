import { Badge } from '@/components/ui/badge';
import { RefreshCw, AlertTriangle } from 'lucide-react';

export async function generateMetadata() {
  return {
    title: 'Refund Policy - Kiara Kraft',
    description: 'Refund and Return Policy for Kiara Kraft handcrafted marketplace',
    robots: 'index, follow',
  };
}

export default function RefundPolicyPage() {
  const lastUpdated = '2025-08-18';

  return (
    <div className="min-h-screen py-8">
      <div className="container mx-auto px-4 max-w-4xl">
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-4 flex items-center gap-3">
            <RefreshCw className="h-10 w-10 text-primary" />
            Refund Policy
          </h1>
          <div className="flex items-center gap-4 text-muted-foreground">
            <Badge variant="secondary">Last Updated: {lastUpdated}</Badge>
            <span>Effective Date: {lastUpdated}</span>
          </div>
        </div>

        <div className="mb-8 p-4 bg-amber-50 border border-amber-200 rounded-lg">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5" />
            <p className="text-amber-700">
              All refund requests must be initiated within 7 days of delivery. Due to the handcrafted nature of our products, each request is reviewed individually.
            </p>
          </div>
        </div>

        <div className="prose prose-lg max-w-none">
          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">Refund Timeline</h2>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
              <div className="p-4 border border-blue-200 bg-blue-50 rounded-lg text-center">
                <h3 className="font-semibold mb-2">1. Request</h3>
                <p className="text-sm">0-7 days after delivery</p>
              </div>
              <div className="p-4 border border-yellow-200 bg-yellow-50 rounded-lg text-center">
                <h3 className="font-semibold mb-2">2. Review</h3>
                <p className="text-sm">1-3 business days</p>
              </div>
              <div className="p-4 border border-green-200 bg-green-50 rounded-lg text-center">
                <h3 className="font-semibold mb-2">3. Decision</h3>
                <p className="text-sm">3-5 business days</p>
              </div>
              <div className="p-4 border border-purple-200 bg-purple-50 rounded-lg text-center">
                <h3 className="font-semibold mb-2">4. Processing</h3>
                <p className="text-sm">5-14 business days</p>
              </div>
            </div>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">Eligible for Refund</h2>
            <div className="space-y-3">
              <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                <h3 className="font-semibold text-green-800 mb-1">Defective Products</h3>
                <p className="text-sm text-green-700">Items with manufacturing defects or damage during production.</p>
              </div>
              <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                <h3 className="font-semibold text-green-800 mb-1">Shipping Damage</h3>
                <p className="text-sm text-green-700">Products damaged during shipping or handling.</p>
              </div>
              <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                <h3 className="font-semibold text-green-800 mb-1">Significantly Misdescribed</h3>
                <p className="text-sm text-green-700">Items that differ substantially from their description or photos.</p>
              </div>
              <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                <h3 className="font-semibold text-green-800 mb-1">Not Received</h3>
                <p className="text-sm text-green-700">Orders that were never delivered after confirmed shipping.</p>
              </div>
            </div>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">Not Eligible for Refund</h2>
            <div className="space-y-3">
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                <h3 className="font-semibold text-red-800 mb-1">Custom Orders</h3>
                <p className="text-sm text-red-700">Personalized or made-to-order items cannot be returned.</p>
              </div>
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                <h3 className="font-semibold text-red-800 mb-1">Used Items</h3>
                <p className="text-sm text-red-700">Products that show signs of use beyond inspection.</p>
              </div>
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                <h3 className="font-semibold text-red-800 mb-1">Final Sale Items</h3>
                <p className="text-sm text-red-700">Items marked as final sale during purchase.</p>
              </div>
            </div>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">How to Request a Refund</h2>
            <div className="space-y-4">
              <div className="flex gap-4 p-4 border rounded-lg">
                <div className="w-8 h-8 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-sm font-bold">1</div>
                <div>
                  <h4 className="font-semibold mb-2">Contact Customer Service</h4>
                  <p className="text-sm text-muted-foreground">Email refunds@kiarakraft.com with your order number and reason for refund.</p>
                </div>
              </div>
              <div className="flex gap-4 p-4 border rounded-lg">
                <div className="w-8 h-8 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-sm font-bold">2</div>
                <div>
                  <h4 className="font-semibold mb-2">Provide Documentation</h4>
                  <p className="text-sm text-muted-foreground">Include photos of the product and any relevant documentation.</p>
                </div>
              </div>
              <div className="flex gap-4 p-4 border rounded-lg">
                <div className="w-8 h-8 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-sm font-bold">3</div>
                <div>
                  <h4 className="font-semibold mb-2">Wait for Review</h4>
                  <p className="text-sm text-muted-foreground">Our team will review your request within 1-3 business days.</p>
                </div>
              </div>
              <div className="flex gap-4 p-4 border rounded-lg">
                <div className="w-8 h-8 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-sm font-bold">4</div>
                <div>
                  <h4 className="font-semibold mb-2">Return if Approved</h4>
                  <p className="text-sm text-muted-foreground">If approved, package the item securely and ship to our returns center.</p>
                </div>
              </div>
            </div>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">Special Conditions</h2>
            <div className="space-y-4">
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <h4 className="font-semibold text-blue-800 mb-2">Handmade Variations</h4>
                <p className="text-sm text-blue-700">Minor variations in handcrafted items are normal and not grounds for return.</p>
              </div>
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
                <h4 className="font-semibold text-amber-800 mb-2">International Orders</h4>
                <p className="text-sm text-amber-700">International customers are responsible for return shipping costs and any customs fees.</p>
              </div>
            </div>
          </section>
        </div>

        <div className="mt-12 p-6 bg-muted/50 border rounded-lg">
          <h2 className="text-xl font-semibold mb-4">Need Help?</h2>
          <p className="text-muted-foreground mb-4">
            Contact our customer service team for assistance with refunds and returns:
          </p>
          <div className="space-y-2 text-sm">
            <p><strong>Email:</strong> refunds@kiarakraft.com</p>
            <p><strong>Phone:</strong> +98 21 1234 5678</p>
            <p><strong>Hours:</strong> Sunday-Thursday, 9 AM - 6 PM (Tehran Time)</p>
            <p><strong>Response Time:</strong> Within 24 hours</p>
          </div>
        </div>
      </div>
    </div>
  );
}