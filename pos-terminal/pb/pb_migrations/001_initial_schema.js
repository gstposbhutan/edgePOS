/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    // ── Categories ───────────────────────────────────────────────────────────
    const categories = new Collection({
      name: "categories",
      type: "base",
      fields: [
        { name: "name", type: "text", required: true },
        { name: "color", type: "text", required: false },
        { name: "created", type: "autodate", onCreate: true },
        { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
      ],
    });
    app.save(categories);

    // ── Products ─────────────────────────────────────────────────────────────
    const products = new Collection({
      name: "products",
      type: "base",
      fields: [
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
        { name: "image", type: "file", required: false, maxSelect: 1, maxSize: 5242880 },
        { name: "is_active", type: "bool", required: false, options: { default: true } },
        { name: "category", type: "relation", required: false, collectionId: categories.id, maxSelect: 1 },
        { name: "created", type: "autodate", onCreate: true },
        { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
      ],
    });
    app.save(products);

    // ── Customers ────────────────────────────────────────────────────────────
    const customers = new Collection({
      name: "customers",
      type: "base",
      fields: [
        { name: "name", type: "text", required: true },
        { name: "phone", type: "text", required: false },
        { name: "credit_limit", type: "number", required: false, options: { default: 0 } },
        { name: "credit_balance", type: "number", required: false, options: { default: 0 } },
        { name: "created", type: "autodate", onCreate: true },
        { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
      ],
    });
    app.save(customers);

    // ── Carts ────────────────────────────────────────────────────────────────
    const carts = new Collection({
      name: "carts",
      type: "base",
      fields: [
        { name: "status", type: "select", required: true, values: ["active", "converted", "abandoned"], options: { default: "active" } },
        { name: "customer", type: "relation", required: false, collectionId: customers.id, maxSelect: 1 },
        { name: "created", type: "autodate", onCreate: true },
        { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
      ],
    });
    app.save(carts);

    // ── Cart Items ───────────────────────────────────────────────────────────
    const cartItems = new Collection({
      name: "cart_items",
      type: "base",
      fields: [
        { name: "cart", type: "relation", required: true, collectionId: carts.id, maxSelect: 1 },
        { name: "product", type: "relation", required: true, collectionId: products.id, maxSelect: 1 },
        { name: "name", type: "text", required: true },
        { name: "sku", type: "text", required: false },
        { name: "quantity", type: "number", required: true, min: 1, options: { default: 1 } },
        { name: "unit_price", type: "number", required: true, min: 0, options: { default: 0 } },
        { name: "discount", type: "number", required: false, min: 0, options: { default: 0 } },
        { name: "gst_amount", type: "number", required: false, options: { default: 0 } },
        { name: "total", type: "number", required: false, options: { default: 0 } },
        { name: "created", type: "autodate", onCreate: true },
        { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
      ],
    });
    app.save(cartItems);

    // ── Orders ───────────────────────────────────────────────────────────────
    const orders = new Collection({
      name: "orders",
      type: "base",
      fields: [
        { name: "order_no", type: "text", required: true },
        { name: "status", type: "select", required: true, values: ["confirmed", "cancelled", "refunded"], options: { default: "confirmed" } },
        { name: "items", type: "json", required: false, options: { default: "[]" } },
        { name: "subtotal", type: "number", required: true, options: { default: 0 } },
        { name: "gst_total", type: "number", required: true, options: { default: 0 } },
        { name: "grand_total", type: "number", required: true, options: { default: 0 } },
        { name: "payment_method", type: "select", required: true, values: ["cash", "mbob", "mpay", "credit", "rtgs"] },
        { name: "payment_ref", type: "text", required: false },
        { name: "customer", type: "relation", required: false, collectionId: customers.id, maxSelect: 1 },
        { name: "customer_name", type: "text", required: false },
        { name: "customer_phone", type: "text", required: false },
        { name: "cashier", type: "relation", required: false, collectionId: "_pb_users_auth_", maxSelect: 1 },
        { name: "digital_signature", type: "text", required: false },
        { name: "cancellation_reason", type: "text", required: false },
        { name: "refund_amount", type: "number", required: false, options: { default: 0 } },
        { name: "refund_reason", type: "text", required: false },
        { name: "receipt_pdf", type: "file", required: false, maxSelect: 1, maxSize: 10485760 },
        { name: "is_synced", type: "bool", required: false, options: { default: false } },
        { name: "created", type: "autodate", onCreate: true },
        { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
      ],
    });
    app.save(orders);

    // ── Inventory Movements ──────────────────────────────────────────────────
    const inventoryMovements = new Collection({
      name: "inventory_movements",
      type: "base",
      fields: [
        { name: "product", type: "relation", required: true, collectionId: products.id, maxSelect: 1 },
        { name: "type", type: "select", required: true, values: ["sale", "restock", "adjustment", "return", "loss", "damaged"] },
        { name: "quantity", type: "number", required: true },
        { name: "order", type: "relation", required: false, collectionId: orders.id, maxSelect: 1 },
        { name: "notes", type: "text", required: false },
        { name: "created", type: "autodate", onCreate: true },
        { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
      ],
    });
    app.save(inventoryMovements);

    // ── Khata Transactions ───────────────────────────────────────────────────
    const khataTransactions = new Collection({
      name: "khata_transactions",
      type: "base",
      fields: [
        { name: "customer", type: "relation", required: true, collectionId: customers.id, maxSelect: 1 },
        { name: "type", type: "select", required: true, values: ["debit", "credit", "adjustment"] },
        { name: "amount", type: "number", required: true, options: { default: 0 } },
        { name: "order", type: "relation", required: false, collectionId: orders.id, maxSelect: 1 },
        { name: "notes", type: "text", required: false },
        { name: "created", type: "autodate", onCreate: true },
        { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
      ],
    });
    app.save(khataTransactions);

    // ── Settings ─────────────────────────────────────────────────────────────
    const settings = new Collection({
      name: "settings",
      type: "base",
      fields: [
        { name: "store_name", type: "text", required: true, options: { default: "My Store" } },
        { name: "store_address", type: "text", required: false },
        { name: "tpn_gstin", type: "text", required: false },
        { name: "phone", type: "text", required: false },
        { name: "receipt_header", type: "text", required: false },
        { name: "receipt_footer", type: "text", required: false, options: { default: "Thank you for your business!" } },
        { name: "gst_rate", type: "number", required: false, options: { default: 5 } },
        { name: "created", type: "autodate", onCreate: true },
        { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
      ],
    });
    app.save(settings);

    // ── Seed sample categories ───────────────────────────────────────────────
    const catData = [
      { name: "Groceries", color: "#22c55e" },
      { name: "Beverages", color: "#3b82f6" },
      { name: "Snacks", color: "#f59e0b" },
      { name: "Household", color: "#8b5cf6" },
      { name: "Personal Care", color: "#ec4899" },
    ];
    const savedCats = [];
    for (const c of catData) {
      const cat = new Record(categories, c);
      app.save(cat);
      savedCats.push(cat);
    }

    // ── Seed sample products (all fields explicit — PB 0.37.3 JSVM ignores defaults on Record create)
    const sampleProducts = [
      { name: "Wai Wai Noodles 75g", sku: "WW001", barcode: "8901234567890", qr_code: "", hsn_code: "1902", unit: "pcs", mrp: 15, cost_price: 10, sale_price: 15, current_stock: 120, reorder_point: 20, is_active: true, category: savedCats[0].id },
      { name: "Druk 1104 Beer 500ml", sku: "DK1104", barcode: "8901234567891", qr_code: "", hsn_code: "2203", unit: "pcs", mrp: 85, cost_price: 65, sale_price: 85, current_stock: 48, reorder_point: 10, is_active: true, category: savedCats[1].id },
      { name: "Red Bull 250ml", sku: "RB250", barcode: "8901234567892", qr_code: "", hsn_code: "2202", unit: "pcs", mrp: 120, cost_price: 95, sale_price: 120, current_stock: 36, reorder_point: 8, is_active: true, category: savedCats[1].id },
      { name: "Coca Cola 1L", sku: "CC1L", barcode: "8901234567893", qr_code: "", hsn_code: "2202", unit: "pcs", mrp: 65, cost_price: 50, sale_price: 65, current_stock: 60, reorder_point: 12, is_active: true, category: savedCats[1].id },
      { name: "Sunrise Tea 250g", sku: "ST250", barcode: "8901234567894", qr_code: "", hsn_code: "0902", unit: "pcs", mrp: 95, cost_price: 70, sale_price: 95, current_stock: 25, reorder_point: 5, is_active: true, category: savedCats[0].id },
      { name: "Dahlia Soap 100g", sku: "DS100", barcode: "8901234567895", qr_code: "", hsn_code: "3401", unit: "pcs", mrp: 35, cost_price: 22, sale_price: 35, current_stock: 80, reorder_point: 15, is_active: true, category: savedCats[4].id },
      { name: "Aashirvaad Atta 5kg", sku: "AA5K", barcode: "8901234567896", qr_code: "", hsn_code: "1101", unit: "pcs", mrp: 280, cost_price: 220, sale_price: 280, current_stock: 18, reorder_point: 4, is_active: true, category: savedCats[0].id },
      { name: "Fortune Oil 1L", sku: "FO1L", barcode: "8901234567897", qr_code: "", hsn_code: "1508", unit: "pcs", mrp: 145, cost_price: 110, sale_price: 145, current_stock: 30, reorder_point: 6, is_active: true, category: savedCats[0].id },
    ];

    for (const p of sampleProducts) {
      const prod = new Record(products, p);
      app.save(prod);
    }

    // ── Seed demo customers ──────────────────────────────────────────────────
    const demoCustomers = [
      { name: "Karma Dorji", phone: "+975-17123456", credit_limit: 5000, credit_balance: 0 },
      { name: "Pema Wangchuk", phone: "+975-17765432", credit_limit: 10000, credit_balance: 1250 },
      { name: "Sonam Choden", phone: "+975-17654321", credit_limit: 3000, credit_balance: 0 },
    ];
    for (const c of demoCustomers) {
      const cust = new Record(customers, c);
      app.save(cust);
    }

    // ── Seed settings ────────────────────────────────────────────────────────
    const settingsRecord = new Record(settings, {
      store_name: "Nexus Bhutan POS",
      store_address: "Thimphu, Bhutan",
      tpn_gstin: "BT123456789",
      phone: "+975-12345678",
      receipt_header: "",
      receipt_footer: "Thank you for shopping with us!",
      gst_rate: 5,
    });
    app.save(settingsRecord);
  },
  (app) => {
    // Rollback — delete in reverse dependency order
    const names = [
      "khata_transactions",
      "inventory_movements",
      "orders",
      "cart_items",
      "carts",
      "customers",
      "products",
      "categories",
      "settings",
    ];
    for (const name of names) {
      const c = app.findCollectionByNameOrId(name);
      if (c) app.delete(c);
    }
  }
);
