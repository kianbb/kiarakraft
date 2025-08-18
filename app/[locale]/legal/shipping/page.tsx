import { Badge } from '@/components/ui/badge';
import { Truck, Package, Globe, MapPin } from 'lucide-react';

export async function generateMetadata() {
  return {
    title: 'Shipping Policy - Kiara Kraft',
    description: 'Shipping and Delivery Policy for Kiara Kraft handcrafted marketplace',
    robots: 'index, follow',
  };
}

export default function ShippingPolicyPage() {
  const lastUpdated = '2025-08-18';

  return (
    <div className="min-h-screen py-8">
      <div className="container mx-auto px-4 max-w-4xl">
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-4 flex items-center gap-3">
            <Truck className="h-10 w-10 text-primary" />
            Shipping Policy
          </h1>
          <div className="flex items-center gap-4 text-muted-foreground">
            <Badge variant="secondary">Last Updated: {lastUpdated}</Badge>
            <span>Effective Date: {lastUpdated}</span>
          </div>
        </div>

        <div className="mb-8 p-4 bg-primary/10 border border-primary/20 rounded-lg">
          <div className="flex items-start gap-2">
            <Package className="h-4 w-4 text-primary mt-0.5" />
            <p className="text-primary-foreground">
              We ship handcrafted products worldwide with care and protection. Processing times vary based on artisan availability and product complexity.
            </p>
          </div>
        </div>

        <div className="prose prose-lg max-w-none">
          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4 flex items-center gap-2">
              <MapPin className="h-5 w-5" />
              Domestic Shipping (Iran)
            </h2>
            <p className="mb-6">Available throughout Iran with multiple delivery options:</p>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div className="p-4 border rounded-lg text-center">
                <Truck className="h-8 w-8 mx-auto mb-3 text-primary" />
                <h3 className="font-semibold mb-2">Express Delivery</h3>
                <p className="text-sm text-muted-foreground mb-3">Next-day delivery in major cities</p>
                <Badge variant="secondary" className="block mb-2">1-2 business days</Badge>
                <Badge variant="outline">50,000 Toman</Badge>
              </div>
              <div className="p-4 border rounded-lg text-center">
                <Package className="h-8 w-8 mx-auto mb-3 text-primary" />
                <h3 className="font-semibold mb-2">Standard Delivery</h3>
                <p className="text-sm text-muted-foreground mb-3">Regular delivery service</p>
                <Badge variant="secondary" className="block mb-2">3-5 business days</Badge>
                <Badge variant="outline">30,000 Toman</Badge>
              </div>
              <div className="p-4 border rounded-lg text-center">
                <MapPin className="h-8 w-8 mx-auto mb-3 text-primary" />
                <h3 className="font-semibold mb-2">Economy Delivery</h3>
                <p className="text-sm text-muted-foreground mb-3">Budget-friendly option</p>
                <Badge variant="secondary" className="block mb-2">5-7 business days</Badge>
                <Badge variant="outline">20,000 Toman</Badge>
              </div>
            </div>

            <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
              <p className="text-green-700">
                <strong>Free shipping</strong> on orders over 500,000 Toman within Iran!
              </p>
            </div>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4 flex items-center gap-2">
              <Globe className="h-5 w-5" />
              International Shipping
            </h2>
            <p className="mb-6">We deliver handcrafted Iranian products worldwide:</p>
            
            <div className="space-y-4">
              <div className="flex justify-between items-center p-4 border rounded-lg">
                <div>
                  <h4 className="font-semibold mb-1">Middle East & Central Asia</h4>
                  <p className="text-sm text-muted-foreground">UAE, Turkey, Afghanistan, Pakistan, etc.</p>
                </div>
                <div className="text-right">
                  <Badge variant="secondary" className="mb-2 block">7-14 days</Badge>
                  <Badge variant="outline">150,000 Toman</Badge>
                </div>
              </div>
              <div className="flex justify-between items-center p-4 border rounded-lg">
                <div>
                  <h4 className="font-semibold mb-1">Europe</h4>
                  <p className="text-sm text-muted-foreground">Germany, France, UK, Netherlands, etc.</p>
                </div>
                <div className="text-right">
                  <Badge variant="secondary" className="mb-2 block">10-21 days</Badge>
                  <Badge variant="outline">250,000 Toman</Badge>
                </div>
              </div>
              <div className="flex justify-between items-center p-4 border rounded-lg">
                <div>
                  <h4 className="font-semibold mb-1">North America</h4>
                  <p className="text-sm text-muted-foreground">USA, Canada, Mexico</p>
                </div>
                <div className="text-right">
                  <Badge variant="secondary" className="mb-2 block">14-28 days</Badge>
                  <Badge variant="outline">300,000 Toman</Badge>
                </div>
              </div>
              <div className="flex justify-between items-center p-4 border rounded-lg">
                <div>
                  <h4 className="font-semibold mb-1">Rest of World</h4>
                  <p className="text-sm text-muted-foreground">Australia, Asia, Africa, South America</p>
                </div>
                <div className="text-right">
                  <Badge variant="secondary" className="mb-2 block">21-35 days</Badge>
                  <Badge variant="outline">350,000 Toman</Badge>
                </div>
              </div>
            </div>

            <div className="mt-6 p-4 bg-amber-50 border border-amber-200 rounded-lg">
              <p className="text-amber-800">
                <strong>Note:</strong> International customers are responsible for any customs duties, taxes, or import fees imposed by their country.
              </p>
            </div>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">Processing Times</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h4 className="font-semibold mb-3">Standard Processing</h4>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li><strong>Ready-made items:</strong> 1-2 business days</li>
                  <li><strong>Custom orders:</strong> 5-14 business days</li>
                  <li><strong>Bulk orders (10+ items):</strong> 7-21 business days</li>
                </ul>
              </div>
              
              <div>
                <h4 className="font-semibold mb-3">Factors Affecting Processing</h4>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li>Artisan availability and schedule</li>
                  <li>Product complexity and customization</li>
                  <li>Material sourcing and availability</li>
                  <li>Seasonal demand and holidays</li>
                </ul>
              </div>
            </div>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">Packaging & Protection</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h4 className="font-semibold mb-3">Product Protection</h4>
                <ul className="space-y-1 text-sm text-muted-foreground">
                  <li>High-quality packaging materials</li>
                  <li>Cushioning for fragile items</li>
                  <li>Waterproof wrapping when needed</li>
                  <li>Clear labeling and handling instructions</li>
                </ul>
              </div>
              
              <div>
                <h4 className="font-semibold mb-3">Sustainable Packaging</h4>
                <ul className="space-y-1 text-sm text-muted-foreground">
                  <li>🌱 Recycled and recyclable materials</li>
                  <li>🌱 Biodegradable packaging when possible</li>
                  <li>🌱 Minimal packaging approach</li>
                  <li>🌱 Reusable containers for premium items</li>
                </ul>
              </div>
            </div>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">Tracking & Delivery</h2>
            <div className="space-y-4">
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <h4 className="font-semibold text-blue-800 mb-2">Domestic Tracking</h4>
                <p className="text-sm text-blue-700">All domestic orders include tracking numbers. You&apos;ll receive updates via SMS and email.</p>
              </div>
              
              <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                <h4 className="font-semibold text-green-800 mb-2">International Tracking</h4>
                <p className="text-sm text-green-700">International orders are tracked until they reach the destination country&apos;s postal service.</p>
              </div>

              <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
                <h4 className="font-semibold text-amber-800 mb-2">Delivery Attempts</h4>
                <p className="text-sm text-amber-700">If delivery fails, we&apos;ll make 2-3 attempts. Items may be held at local post office for pickup.</p>
              </div>
            </div>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">Shipping Restrictions</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h4 className="font-semibold mb-3 text-red-600">Prohibited Items</h4>
                <ul className="space-y-1 text-sm text-muted-foreground">
                  <li>Antiques over 100 years old</li>
                  <li>Precious metals and gems (except jewelry)</li>
                  <li>Cultural heritage items</li>
                  <li>Hazardous materials</li>
                  <li>Items requiring special permits</li>
                </ul>
              </div>
              
              <div>
                <h4 className="font-semibold mb-3 text-amber-600">Restricted Items</h4>
                <ul className="space-y-1 text-sm text-muted-foreground">
                  <li>⚠️ Large textiles (may require folding)</li>
                  <li>⚠️ Ceramic items (extra packaging fees)</li>
                  <li>⚠️ Food products (limited countries)</li>
                  <li>⚠️ Plant-based materials (documentation required)</li>
                </ul>
              </div>
            </div>
          </section>
        </div>

        <div className="mt-12 p-6 bg-muted/50 border rounded-lg">
          <h2 className="text-xl font-semibold mb-4">Shipping Support</h2>
          <p className="text-muted-foreground mb-4">
            Questions about shipping or need to track your order?
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2 text-sm">
              <p><strong>General Inquiries:</strong> shipping@kiarakraft.com</p>
              <p><strong>Order Tracking:</strong> track@kiarakraft.com</p>
              <p><strong>International Support:</strong> +98 21 1234 5678</p>
            </div>
            <div className="space-y-2 text-sm">
              <p><strong>Hours:</strong> Sunday-Thursday, 9 AM - 6 PM</p>
              <p><strong>Response Time:</strong> Within 6 hours</p>
              <p><strong>Emergency:</strong> +98 912 345 6789</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}