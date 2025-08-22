# V3-S2 Test Guide: Cart/Checkout v2

## 🧪 Automated Verification

Run the comprehensive test script:

```bash
npx tsx scripts/verify-v3-s2.ts
```

**Expected Output:**

- ✅ All 9 test sections pass
- ✅ Address CRUD operations working
- ✅ Multi-step checkout flow validated
- ✅ Shipping methods tested (Standard/Express/Pickup)
- ✅ Order relations verified
- ✅ Data migration confirmed
- ✅ Foreign key protection working

---

## 🖱️ Manual UI Testing

### Test 1: Address Management

1. **Login** as buyer account
2. **Go to Checkout** with items in cart
3. **Step 1 - Addresses:**
   - ✅ Click "Add Address"
   - ✅ Fill form: Name, Phone, Country (IR), Province, City, Address Line 1, Optional Line 2, Postal Code
   - ✅ Check "Set as default"
   - ✅ Click "Add Address" - should save and auto-select
   - ✅ Add second address (uncheck default)
   - ✅ Test address selection (click different addresses)
   - ✅ Test edit address (pencil icon)
   - ✅ Test delete address (trash icon) - should confirm first

### Test 2: Shipping Method Selection

1. **Proceed to Step 2:**
   - ✅ Should show 3 shipping options:
     - **Standard**: 50,000 TMN (5-7 days)
     - **Express**: 120,000 TMN (2-3 days)
     - **Pickup**: Free (Same day)
   - ✅ Click each method - should update selection
   - ✅ Verify icons and descriptions show correctly
   - ✅ Confirm "Selected" indicator appears

### Test 3: Payment & Review

1. **Proceed to Step 3:**
   - ✅ Should show payment methods dropdown
   - ✅ Order review section should display:
     - Selected address details
     - Selected shipping method
   - ✅ Order summary should show updated totals:
     - Subtotal: Product prices
     - Shipping: Selected method price
     - Total: Subtotal + Shipping

### Test 4: Order Completion

1. **Place Order:**
   - ✅ Should validate all steps completed
   - ✅ Should create order with addressId reference
   - ✅ Should create OrderShipping record
   - ✅ Should redirect to order confirmation
   - ✅ Order page should show address from relation (not embedded fields)

---

## 📊 Database Verification

### Check Order Structure:

```sql
-- Verify orders have addressId (not embedded address fields)
SELECT id, "addressId", "totalToman", status, "createdAt"
FROM "Order"
ORDER BY "createdAt" DESC
LIMIT 5;

-- Verify addresses exist and are linked
SELECT a."fullName", a."city", a."isDefault", COUNT(o.id) as order_count
FROM "Address" a
LEFT JOIN "Order" o ON o."addressId" = a.id
GROUP BY a.id, a."fullName", a."city", a."isDefault";

-- Verify shipping records
SELECT os."method", os."priceToman", os."status", os."trackingNo"
FROM "OrderShipping" os
JOIN "Order" o ON o.id = os."orderId"
ORDER BY os."createdAt" DESC
LIMIT 5;
```

### Expected Results:

- ✅ Orders have `addressId` field (no `fullName`, `address1` etc.)
- ✅ Address table has user addresses
- ✅ OrderShipping table has method/price records
- ✅ Foreign key relationships working

---

## 🔍 API Endpoint Testing

### Test Address API:

```bash
# Get addresses (requires auth)
curl -X GET "http://localhost:3000/api/addresses" \
  -H "Cookie: next-auth.session-token=..."

# Create address
curl -X POST "http://localhost:3000/api/addresses" \
  -H "Content-Type: application/json" \
  -H "Cookie: next-auth.session-token=..." \
  -d '{
    "fullName": "Test User",
    "phone": "+98-912-123-4567",
    "country": "IR",
    "province": "Tehran",
    "city": "Tehran",
    "line1": "123 Test St",
    "postal": "1234567890",
    "isDefault": false
  }'
```

### Test Order API:

```bash
# Get order with relations
curl -X GET "http://localhost:3000/api/orders/ORDER_ID" \
  -H "Cookie: next-auth.session-token=..."
```

**Expected Order Response:**

```json
{
  "id": "order_id",
  "addressId": "addr_id",
  "totalToman": 150000,
  "address": {
    "fullName": "Test User",
    "line1": "123 Test St",
    "city": "Tehran"
  },
  "shipping": {
    "method": "STANDARD",
    "priceToman": 50000,
    "status": "PROCESSING"
  },
  "items": [...]
}
```

---

## 🚨 Error Testing

### Test Validation:

1. **Try checkout without selecting address** - should prevent proceeding
2. **Try checkout without selecting shipping** - should prevent proceeding
3. **Try deleting address used by orders** - should fail gracefully
4. **Try invalid address data** - should show validation errors

### Test Edge Cases:

1. **No addresses yet** - should force address creation
2. **Multiple addresses** - should sort by default first
3. **Free shipping (Pickup)** - should show "Free" correctly
4. **Very long address lines** - should handle gracefully

---

## ✅ Success Criteria

**V3-S2 is working correctly if:**

1. ✅ **Multi-step checkout works** - Address → Shipping → Payment
2. ✅ **Address CRUD operations** - Create, read, update, delete with validation
3. ✅ **Shipping methods** - All 3 methods with correct pricing
4. ✅ **Order structure** - Uses addressId reference, not embedded fields
5. ✅ **Database relations** - Address and OrderShipping properly linked
6. ✅ **Data integrity** - Cannot delete addresses used by orders
7. ✅ **API responses** - Include full address/shipping relations
8. ✅ **Translation support** - All new UI text translated (FA/EN)
9. ✅ **Build success** - No TypeScript errors, clean production build
10. ✅ **Migration success** - All existing orders have addressId

---

## 📈 Performance Notes

**Expected Bundle Sizes:**

- Checkout page: ~7.31 kB (includes new components)
- Address APIs: Server-side only (0 B client bundle)
- New DB queries: Should be efficient with proper indexing

**Database Queries:**

- Address selection: Single query with user filter
- Order creation: Transaction with order + shipping + items
- Order display: Single query with includes for all relations
