/// <reference path="../pb_data/types.d.ts" />

migrate(
  (db) => {
    // ── Categories ───────────────────────────────────────────────────────────
    const categories = new Collection({
      name: "categories",
      type: "base",
      schema: [
        { name: "name", type: "text", required: true },
        { name: "color", type: "text", required: false },
      ],
    });
    db.saveCollection(categories);

    // ── Products ─────────────────────────────────────────────────────────────
    const products = new Collection({
      name: "products",
      type: "base",
      schema: [
        { name: "name", type: "text", required: true },
        { name: "sku", type: "text", required: false },
        { name: "barcode", type: "text", required: false },
        { name: "qr_code", type: "text", required: false },
        { name: "hsn_code", type: "text", required: false },
        { name: "unit", type: "text", required: false, options: { default: "pcs" } },
        { name: "mrp", type: "number", required: false, options: { default: 0 } },
        { name: "cost_price", type: "number", required: false, options: { default: 0 } },
        { name: "sale_price", type: "number", required: false, options: { default: 0 } },
        { name: "current_stock", type: "number", required: false, options: { default: 0 } },
        { name: "reorder_point", type: "number", required: false, options: { default: 10 } },
        { name: "image", type: "file", required: false, options: { maxSelect: 1, maxSize: 5242880 } },
        { name: "is_active", type: "bool", required: false, options: { default: true } },
        { name: "category", type: "relation", required: false, options: { collectionId: categories.id, maxSelect: 1 } },
      ],
      indexes: [
        "CREATE UNIQUE INDEX idx_products_barcode ON products (barcode) WHERE barcode != ''",
        "CREATE UNIQUE INDEX idx_products_sku ON products (sku) WHERE sku != ''",
      ],
    });
    db.saveCollection(products);

    // ── Customers ────────────────────────────────────────────────────────────
    const customers = new Collection({
      name: "customers",
      type: "base",
      schema: [
        { name: "name", type: "text", required: true },
        { name: "phone", type: "text", required: false },
        { name: "credit_limit", type: "number", required: false, options: { default: 0 } },
        { name: "credit_balance", type: "number", required: false, options: { default: 0 } },
      ],
    });
    db.saveCollection(customers);

    // ── Carts ────────────────────────────────────────────────────────────────
    const carts = new Collection({
      name: "carts",
      type: "base",
      schema: [
        { name: "status", type: "select", required: true, options: { values: ["active", "converted", "abandoned"], default: "active" } },
        { name: "customer", type: "relation", required: false, options: { collectionId: customers.id, maxSelect: 1 } },
      ],
    });
    db.saveCollection(carts);

    // ── Cart Items ───────────────────────────────────────────────────────────
    const cartItems = new Collection({
      name: "cart_items",
      type: "base",
      schema: [
        { name: "cart", type: "relation", required: true, options: { collectionId: carts.id, maxSelect: 1 } },
        { name: "product", type: "relation", required: true, options: { collectionId: products.id, maxSelect: 1 } },
        { name: "name", type: "text", required: true },
        { name: "sku", type: "text", required: false },
        { name: "quantity", type: "number", required: true, options: { default: 1, min: 1 } },
        { name: "unit_price", type: "number", required: true, options: { default: 0, min: 0 } },
        { name: "discount", type: "number", required: false, options: { default: 0, min: 0 } },
        { name: "gst_amount", type: "number", required: false, options: { default: 0 } },
        { name: "total", type: "number", required: false, options: { default: 0 } },
      ],
    });
    db.saveCollection(cartItems);

    // ── Orders ───────────────────────────────────────────────────────────────
    const orders = new Collection({
      name: "orders",
      type: "base",
      schema: [
        { name: "order_no", type: "text", required: true },
        { name: "status", type: "select", required: true, options: { values: ["confirmed", "cancelled", "refunded"], default: "confirmed" } },
        { name: "items", type: "json", required: true, options: { default: "[]" } },
        { name: "subtotal", type: "number", required: true, options: { default: 0 } },
        { name: "gst_total", type: "number", required: true, options: { default: 0 } },
        { name: "grand_total", type: "number", required: true, options: { default: 0 } },
        { name: "payment_method", type: "select", required: true, options: { values: ["cash", "mbob", "mpay", "credit", "rtgs"] } },
        { name: "payment_ref", type: "text", required: false },
        { name: "customer", type: "relation", required: false, options: { collectionId: customers.id, maxSelect: 1 } },
        { name: "customer_name", type: "text", required: false },
        { name: "customer_phone", type: "text", required: false },
        { name: "cashier", type: "relation", required: false, options: { collectionId: "_pb_users_auth_", maxSelect: 1 } },
        { name: "digital_signature", type: "text", required: false },
        { name: "cancellation_reason", type: "text", required: false },
        { name: "refund_amount", type: "number", required: false, options: { default: 0 } },
        { name: "refund_reason", type: "text", required: false },
        { name: "receipt_pdf", type: "file", required: false, options: { maxSelect: 1, maxSize: 10485760 } },
      ],
      indexes: [
        "CREATE UNIQUE INDEX idx_orders_order_no ON orders (order_no)",
      ],
    });
    db.saveCollection(orders);

    // ── Inventory Movements ──────────────────────────────────────────────────
    const inventoryMovements = new Collection({
      name: "inventory_movements",
      type: "base",
      schema: [
        { name: "product", type: "relation", required: true, options: { collectionId: products.id, maxSelect: 1 } },
        { name: "type", type: "select", required: true, options: { values: ["sale", "restock", "adjustment", "return", "loss", "damaged"] } },
        { name: "quantity", type: "number", required: true },
        { name: "order", type: "relation", required: false, options: { collectionId: orders.id, maxSelect: 1 } },
        { name: "notes", type: "text", required: false },
      ],
    });
    db.saveCollection(inventoryMovements);

    // ── Khata Transactions ───────────────────────────────────────────────────
    const khataTransactions = new Collection({
      name: "khata_transactions",
      type: "base",
      schema: [
        { name: "customer", type: "relation", required: true, options: { collectionId: customers.id, maxSelect: 1 } },
        { name: "type", type: "select", required: true, options: { values: ["debit", "credit", "adjustment"] } },
        { name: "amount", type: "number", required: true, options: { default: 0 } },
        { name: "order", type: "relation", required: false, options: { collectionId: orders.id, maxSelect: 1 } },
        { name: "notes", type: "text", required: false },
      ],
    });
    db.saveCollection(khataTransactions);

    // ── Settings ─────────────────────────────────────────────────────────────
    const settings = new Collection({
      name: "settings",
      type: "base",
      schema: [
        { name: "store_name", type: "text", required: true, options: { default: "My Store" } },
        { name: "store_address", type: "text", required: false },
        { name: "tpn_gstin", type: "text", required: false },
        { name: "phone", type: "text", required: false },
        { name: "receipt_header", type: "text", required: false },
        { name: "receipt_footer", type: "text", required: false, options: { default: "Thank you for your business!" } },
        { name: "gst_rate", type: "number", required: false, options: { default: 5 } },
      ],
    });
    db.saveCollection(settings);

    // ── Seed default admin user ──────────────────────────────────────────────
    const users = db.findCollectionByNameOrId("_pb_users_auth_");
    if (users) {
      const admin = new Admin();
      admin.setEmail("admin@pos.local");
      admin.setPassword("admin123");
      admin.setVerified(true);
      db.saveAdmin(admin);
    }

    // ── Seed sample categories ───────────────────────────────────────────────
    const catNames = ["Groceries", "Beverages", "Snacks", "Household", "Personal Care"];
    for (const name of catNames) {
      const cat = new Record(categories, { name });
      db.saveRecord(cat);
    }

    // ── Seed sample products ─────────────────────────────────────────────────
    const sampleProducts = [
      { name: "Wai Wai Noodles 75g", sku: "WW001", barcode: "8901234567890", hsn_code: "1902", unit: "pcs", mrp: 15, sale_price: 15, current_stock: 120, reorder_point: 20 },
      { name: "Druk 1104 Beer 500ml", sku: "DK1104", barcode: "8901234567891", hsn_code: "2203", unit: "pcs", mrp: 85, sale_price: 85, current_stock: 48, reorder_point: 10 },
      { name: "Red Bull 250ml", sku: "RB250", barcode: "8901234567892", hsn_code: "2202", unit: "pcs", mrp: 120, sale_price: 120, current_stock: 36, reorder_point: 8 },
      { name: "Coca Cola 1L", sku: "CC1L", barcode: "8901234567893", hsn_code: "2202", unit: "pcs", mrp: 65, sale_price: 65, current_stock: 60, reorder_point: 12 },
      { name: "Sunrise Tea 250g", sku: "ST250", barcode: "8901234567894", hsn_code: "0902", unit: "pcs", mrp: 95, sale_price: 95, current_stock: 25, reorder_point: 5 },
      { name: "Dahlia Soap 100g", sku: "DS100", barcode: "8901234567895", hsn_code: "3401", unit: "pcs", mrp: 35, sale_price: 35, current_stock: 80, reorder_point: 15 },
      { name: "Aashirvaad Atta 5kg", sku: "AA5K", barcode: "8901234567896", hsn_code: "1101", unit: "pcs", mrp: 280, sale_price: 280, current_stock: 18, reorder_point: 4 },
      { name: "Fortune Oil 1L", sku: "FO1L", barcode: "8901234567897", hsn_code: "1508", unit: "pcs", mrp: 145, sale_price: 145, current_stock: 30, reorder_point: 6 },
    ];

    for (const p of sampleProducts) {
      const prod = new Record(products, p);
      db.saveRecord(prod);
    }

    // ── Seed settings ────────────────────────────────────────────────────────
    const settingsRecord = new Record(settings, {
      store_name: "Demo Store",
      store_address: "Thimphu, Bhutan",
      tpn_gstin: "BT123456789",
      phone: "+975-12345678",
      receipt_footer: "Thank you for shopping with us!",
    });
    db.saveRecord(settingsRecord);
  },
  (db) => {
    // Rollback
    db.deleteCollection("khata_transactions");
    db.deleteCollection("inventory_movements");
    db.deleteCollection("orders");
    db.deleteCollection("cart_items");
    db.deleteCollection("carts");
    db.deleteCollection("customers");
    db.deleteCollection("products");
    db.deleteCollection("categories");
    db.deleteCollection("settings");
  }
);
