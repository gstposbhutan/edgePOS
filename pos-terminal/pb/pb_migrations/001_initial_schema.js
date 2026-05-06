/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    // ── Entities (store/tenant scoping — aligns with Supabase entities) ──────
    const entities = new Collection({
      name: "entities",
      type: "base",
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      deleteRule: "@request.auth.id != ''",
      fields: [
        { name: "name", type: "text", required: true },
        { name: "role", type: "select", required: true, values: ["RETAILER", "WHOLESALER", "DISTRIBUTOR"], options: { default: "RETAILER" } },
        { name: "tpn_gstin", type: "text", required: false },
        { name: "whatsapp_no", type: "text", required: false },
        { name: "shop_slug", type: "text", required: false },
        { name: "is_active", type: "bool", required: false, options: { default: true } },
        { name: "created_at", type: "autodate", onCreate: true },
        { name: "updated_at", type: "autodate", onCreate: true, onUpdate: true },
      ],
    });
    app.save(entities);

    // ── Categories ───────────────────────────────────────────────────────────
    const categories = new Collection({
      name: "categories",
      type: "base",
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      deleteRule: "@request.auth.id != ''",
      fields: [
        { name: "name", type: "text", required: true },
        { name: "color", type: "text", required: false },
        { name: "created_at", type: "autodate", onCreate: true },
        { name: "updated_at", type: "autodate", onCreate: true, onUpdate: true },
      ],
    });
    app.save(categories);

    // ── Products ─────────────────────────────────────────────────────────────
    const products = new Collection({
      name: "products",
      type: "base",
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      deleteRule: "@request.auth.id != ''",
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
        { name: "wholesale_price", type: "number", required: false, options: { default: 0 } },
        { name: "current_stock", type: "number", required: false, options: { default: 0 } },
        { name: "reorder_point", type: "number", required: false, options: { default: 10 } },
        { name: "image_url", type: "text", required: false },
        { name: "image_embedding", type: "text", required: false },
        { name: "is_active", type: "bool", required: false, options: { default: true } },
        { name: "category", type: "relation", required: false, collectionId: categories.id, maxSelect: 1 },
        { name: "entity_id", type: "relation", required: false, collectionId: entities.id, maxSelect: 1 },
        { name: "created_by", type: "relation", required: false, collectionId: "_pb_users_auth_", maxSelect: 1 },
        { name: "created_at", type: "autodate", onCreate: true },
        { name: "updated_at", type: "autodate", onCreate: true, onUpdate: true },
      ],
    });
    app.save(products);

    // ── Khata Accounts (formerly customers — aligns with Supabase khata_accounts)
    const khataAccounts = new Collection({
      name: "khata_accounts",
      type: "base",
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      deleteRule: "@request.auth.id != ''",
      fields: [
        { name: "debtor_name", type: "text", required: true },
        { name: "debtor_phone", type: "text", required: false },
        { name: "credit_limit", type: "number", required: false, options: { default: 0 } },
        { name: "outstanding_balance", type: "number", required: false, options: { default: 0 } },
        { name: "creditor_entity_id", type: "relation", required: false, collectionId: entities.id, maxSelect: 1 },
        { name: "party_type", type: "select", required: false, values: ["CONSUMER", "RETAILER", "WHOLESALER"], options: { default: "CONSUMER" } },
        { name: "debtor_entity_id", type: "relation", required: false, collectionId: entities.id, maxSelect: 1 },
        { name: "debtor_face_id_hash", type: "text", required: false },
        { name: "credit_term_days", type: "number", required: false, options: { default: 30 } },
        { name: "status", type: "select", required: false, values: ["ACTIVE", "FROZEN", "CLOSED"], options: { default: "ACTIVE" } },
        { name: "last_payment_at", type: "date", required: false },
        { name: "created_by", type: "relation", required: false, collectionId: "_pb_users_auth_", maxSelect: 1 },
        { name: "created_at", type: "autodate", onCreate: true },
        { name: "updated_at", type: "autodate", onCreate: true, onUpdate: true },
      ],
    });
    app.save(khataAccounts);

    // ── Carts ────────────────────────────────────────────────────────────────
    const carts = new Collection({
      name: "carts",
      type: "base",
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      deleteRule: "@request.auth.id != ''",
      fields: [
        { name: "status", type: "select", required: true, values: ["ACTIVE", "CONVERTED", "ABANDONED"], options: { default: "ACTIVE" } },
        { name: "entity_id", type: "relation", required: false, collectionId: entities.id, maxSelect: 1 },
        { name: "customer_whatsapp", type: "text", required: false },
        { name: "buyer_hash", type: "text", required: false },
        { name: "created_by", type: "relation", required: false, collectionId: "_pb_users_auth_", maxSelect: 1 },
        { name: "created_at", type: "autodate", onCreate: true },
        { name: "updated_at", type: "autodate", onCreate: true, onUpdate: true },
      ],
    });
    app.save(carts);

    // ── Cart Items ───────────────────────────────────────────────────────────
    const cartItems = new Collection({
      name: "cart_items",
      type: "base",
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      deleteRule: "@request.auth.id != ''",
      fields: [
        { name: "cart", type: "relation", required: true, collectionId: carts.id, maxSelect: 1 },
        { name: "product", type: "relation", required: true, collectionId: products.id, maxSelect: 1 },
        { name: "name", type: "text", required: true },
        { name: "sku", type: "text", required: false },
        { name: "quantity", type: "number", required: true, min: 1, options: { default: 1 } },
        { name: "unit_price", type: "number", required: true, min: 0, options: { default: 0 } },
        { name: "discount", type: "number", required: false, min: 0, options: { default: 0 } },
        { name: "gst_5", type: "number", required: false, options: { default: 0 } },
        { name: "total", type: "number", required: false, options: { default: 0 } },
        { name: "created_at", type: "autodate", onCreate: true },
        { name: "updated_at", type: "autodate", onCreate: true, onUpdate: true },
      ],
    });
    app.save(cartItems);

    // ── Orders ───────────────────────────────────────────────────────────────
    const orders = new Collection({
      name: "orders",
      type: "base",
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      deleteRule: "@request.auth.id != ''",
      fields: [
        { name: "order_type", type: "select", required: true, values: ["POS_SALE", "WHOLESALE", "MARKETPLACE"], options: { default: "POS_SALE" } },
        { name: "order_no", type: "text", required: true },
        { name: "status", type: "select", required: true, values: [
          "DRAFT", "PENDING_PAYMENT", "PAYMENT_VERIFYING", "CONFIRMED", "PROCESSING",
          "DISPATCHED", "DELIVERED", "COMPLETED", "PAYMENT_FAILED", "CANCELLATION_REQUESTED",
          "CANCELLED", "REFUND_REQUESTED", "REFUND_APPROVED", "REFUND_REJECTED",
          "REFUND_PROCESSING", "REFUNDED", "REPLACEMENT_REQUESTED", "REPLACEMENT_DISPATCHED",
          "REPLACEMENT_DELIVERED"
        ], options: { default: "DRAFT" } },
        { name: "items", type: "json", required: false, options: { default: "[]" } },
        { name: "subtotal", type: "number", required: true, options: { default: 0 } },
        { name: "gst_total", type: "number", required: true, options: { default: 0 } },
        { name: "grand_total", type: "number", required: true, options: { default: 0 } },
        { name: "payment_method", type: "select", required: true, values: ["cash", "mbob", "mpay", "credit", "rtgs"] },
        { name: "payment_ref", type: "text", required: false },
        { name: "seller_id", type: "relation", required: false, collectionId: entities.id, maxSelect: 1 },
        { name: "buyer_id", type: "relation", required: false, collectionId: entities.id, maxSelect: 1 },
        { name: "buyer_whatsapp", type: "text", required: false },
        { name: "buyer_hash", type: "text", required: false },
        { name: "created_by", type: "relation", required: false, collectionId: "_pb_users_auth_", maxSelect: 1 },
        { name: "customer_name", type: "text", required: false },
        { name: "customer_phone", type: "text", required: false },
        { name: "digital_signature", type: "text", required: false },
        { name: "payment_verified_at", type: "date", required: false },
        { name: "ocr_verify_id", type: "text", required: false },
        { name: "retry_count", type: "number", required: false, options: { default: 0 } },
        { name: "max_retries", type: "number", required: false, options: { default: 3 } },
        { name: "whatsapp_status", type: "select", required: false, values: ["PENDING", "SENT", "DELIVERED", "READ", "FAILED"], options: { default: "PENDING" } },
        { name: "cancellation_reason", type: "text", required: false },
        { name: "refund_amount", type: "number", required: false, options: { default: 0 } },
        { name: "refund_reason", type: "text", required: false },
        { name: "completed_at", type: "date", required: false },
        { name: "cancelled_at", type: "date", required: false },
        { name: "cart_id", type: "relation", required: false, collectionId: carts.id, maxSelect: 1 },
        { name: "receipt_pdf", type: "file", required: false, maxSelect: 1, maxSize: 10485760 },
        { name: "is_synced", type: "bool", required: false, options: { default: false } },
        { name: "created_at", type: "autodate", onCreate: true },
        { name: "updated_at", type: "autodate", onCreate: true, onUpdate: true },
      ],
    });
    app.save(orders);

    // ── Inventory Movements ──────────────────────────────────────────────────
    const inventoryMovements = new Collection({
      name: "inventory_movements",
      type: "base",
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      deleteRule: "@request.auth.id != ''",
      fields: [
        { name: "product", type: "relation", required: true, collectionId: products.id, maxSelect: 1 },
        { name: "movement_type", type: "select", required: true, values: ["SALE", "RESTOCK", "TRANSFER", "RETURN", "LOSS", "DAMAGED"] },
        { name: "quantity", type: "number", required: true },
        { name: "reference_id", type: "relation", required: false, collectionId: orders.id, maxSelect: 1 },
        { name: "notes", type: "text", required: false },
        { name: "entity_id", type: "relation", required: false, collectionId: entities.id, maxSelect: 1 },
        { name: "created_by", type: "relation", required: false, collectionId: "_pb_users_auth_", maxSelect: 1 },
        { name: "created_at", type: "autodate", onCreate: true },
        { name: "updated_at", type: "autodate", onCreate: true, onUpdate: true },
      ],
    });
    app.save(inventoryMovements);

    // ── Khata Transactions ───────────────────────────────────────────────────
    const khataTransactions = new Collection({
      name: "khata_transactions",
      type: "base",
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      deleteRule: "@request.auth.id != ''",
      fields: [
        { name: "khata_account", type: "relation", required: true, collectionId: khataAccounts.id, maxSelect: 1 },
        { name: "transaction_type", type: "select", required: true, values: ["DEBIT", "CREDIT", "ADJUSTMENT"] },
        { name: "amount", type: "number", required: true, options: { default: 0 } },
        { name: "balance_after", type: "number", required: false, options: { default: 0 } },
        { name: "reference_id", type: "relation", required: false, collectionId: orders.id, maxSelect: 1 },
        { name: "payment_method", type: "text", required: false },
        { name: "notes", type: "text", required: false },
        { name: "entity_id", type: "relation", required: false, collectionId: entities.id, maxSelect: 1 },
        { name: "created_by", type: "relation", required: false, collectionId: "_pb_users_auth_", maxSelect: 1 },
        { name: "created_at", type: "autodate", onCreate: true },
        { name: "updated_at", type: "autodate", onCreate: true, onUpdate: true },
      ],
    });
    app.save(khataTransactions);

    // ── Settings ─────────────────────────────────────────────────────────────
    const settings = new Collection({
      name: "settings",
      type: "base",
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      deleteRule: "@request.auth.id != ''",
      fields: [
        { name: "store_name", type: "text", required: true, options: { default: "My Store" } },
        { name: "store_address", type: "text", required: false },
        { name: "tpn_gstin", type: "text", required: false },
        { name: "phone", type: "text", required: false },
        { name: "receipt_header", type: "text", required: false },
        { name: "receipt_footer", type: "text", required: false, options: { default: "Thank you for your business!" } },
        { name: "gst_rate", type: "number", required: false, options: { default: 5 } },
        { name: "entity_id", type: "relation", required: false, collectionId: entities.id, maxSelect: 1 },
        { name: "created_at", type: "autodate", onCreate: true },
        { name: "updated_at", type: "autodate", onCreate: true, onUpdate: true },
      ],
    });
    app.save(settings);

    // ── Seed default entity ──────────────────────────────────────────────────
    const defaultEntity = new Record(entities, {
      name: "Nexus Bhutan POS",
      role: "RETAILER",
      tpn_gstin: "BT123456789",
      whatsapp_no: "+975-12345678",
      shop_slug: "nexus-bhutan",
      is_active: true,
    });
    app.save(defaultEntity);

    // ── Seed sample categories ───────────────────────────────────────────────
    const catData = [
      { name: "Groceries", color: "#22c55e" },
      { name: "Beverages", color: "#3b82f6" },
      { name: "Snacks", color: "#f59e0b" },
      { name: "Household", color: "#8b5cf6" },
      { name: "Personal Care", color: "#ec4899" },
      { name: "Dairy & Bread", color: "#06b6d4" },
      { name: "Frozen Foods", color: "#84cc16" },
      { name: "Confectionery", color: "#f43f5e" },
    ];
    const savedCats = [];
    for (const c of catData) {
      const cat = new Record(categories, c);
      app.save(cat);
      savedCats.push(cat);
    }

    // ── Seed sample products ─────────────────────────────────────────────────
    const sampleProducts = [
      // Groceries (savedCats[0])
      { name: "Wai Wai Noodles 75g", sku: "WW001", barcode: "8901234567890", qr_code: "", hsn_code: "1902", unit: "pcs", mrp: 15, cost_price: 10, sale_price: 15, wholesale_price: 8, current_stock: 120, reorder_point: 20, is_active: true, category: savedCats[0].id, entity_id: defaultEntity.id },
      { name: "Sunrise Tea 250g", sku: "ST250", barcode: "8901234567894", qr_code: "", hsn_code: "0902", unit: "pcs", mrp: 95, cost_price: 70, sale_price: 95, wholesale_price: 55, current_stock: 25, reorder_point: 5, is_active: true, category: savedCats[0].id, entity_id: defaultEntity.id },
      { name: "Aashirvaad Atta 5kg", sku: "AA5K", barcode: "8901234567896", qr_code: "", hsn_code: "1101", unit: "pcs", mrp: 280, cost_price: 220, sale_price: 280, wholesale_price: 180, current_stock: 18, reorder_point: 4, is_active: true, category: savedCats[0].id, entity_id: defaultEntity.id },
      { name: "Fortune Oil 1L", sku: "FO1L", barcode: "8901234567897", qr_code: "", hsn_code: "1508", unit: "pcs", mrp: 145, cost_price: 110, sale_price: 145, wholesale_price: 90, current_stock: 30, reorder_point: 6, is_active: true, category: savedCats[0].id, entity_id: defaultEntity.id },
      { name: "Druk Basmati Rice 5kg", sku: "DBR500", barcode: "8901234567901", qr_code: "", hsn_code: "1006", unit: "pcs", mrp: 360, cost_price: 280, sale_price: 360, wholesale_price: 240, current_stock: 22, reorder_point: 5, is_active: true, category: savedCats[0].id, entity_id: defaultEntity.id },
      { name: "Tata Salt 1kg", sku: "TS001", barcode: "8901234567902", qr_code: "", hsn_code: "2501", unit: "pcs", mrp: 25, cost_price: 18, sale_price: 25, wholesale_price: 14, current_stock: 200, reorder_point: 30, is_active: true, category: savedCats[0].id, entity_id: defaultEntity.id },
      { name: "Everest Masala 100g", sku: "EM100", barcode: "8901234567903", qr_code: "", hsn_code: "0910", unit: "pcs", mrp: 55, cost_price: 40, sale_price: 55, wholesale_price: 32, current_stock: 45, reorder_point: 10, is_active: true, category: savedCats[0].id, entity_id: defaultEntity.id },
      { name: "Sugar White 1kg", sku: "SW001", barcode: "8901234567904", qr_code: "", hsn_code: "1701", unit: "pcs", mrp: 48, cost_price: 38, sale_price: 48, wholesale_price: 32, current_stock: 80, reorder_point: 15, is_active: true, category: savedCats[0].id, entity_id: defaultEntity.id },

      // Beverages (savedCats[1])
      { name: "Druk 1104 Beer 500ml", sku: "DK1104", barcode: "8901234567891", qr_code: "", hsn_code: "2203", unit: "pcs", mrp: 85, cost_price: 65, sale_price: 85, wholesale_price: 50, current_stock: 48, reorder_point: 10, is_active: true, category: savedCats[1].id, entity_id: defaultEntity.id },
      { name: "Red Bull 250ml", sku: "RB250", barcode: "8901234567892", qr_code: "", hsn_code: "2202", unit: "pcs", mrp: 120, cost_price: 95, sale_price: 120, wholesale_price: 80, current_stock: 36, reorder_point: 8, is_active: true, category: savedCats[1].id, entity_id: defaultEntity.id },
      { name: "Coca Cola 1L", sku: "CC1L", barcode: "8901234567893", qr_code: "", hsn_code: "2202", unit: "pcs", mrp: 65, cost_price: 50, sale_price: 65, wholesale_price: 40, current_stock: 60, reorder_point: 12, is_active: true, category: savedCats[1].id, entity_id: defaultEntity.id },
      { name: "Sprite 500ml", sku: "SP500", barcode: "8901234567905", qr_code: "", hsn_code: "2202", unit: "pcs", mrp: 35, cost_price: 28, sale_price: 35, wholesale_price: 22, current_stock: 72, reorder_point: 15, is_active: true, category: savedCats[1].id, entity_id: defaultEntity.id },
      { name: "Fanta Orange 500ml", sku: "FO500", barcode: "8901234567906", qr_code: "", hsn_code: "2202", unit: "pcs", mrp: 35, cost_price: 28, sale_price: 35, wholesale_price: 22, current_stock: 55, reorder_point: 12, is_active: true, category: savedCats[1].id, entity_id: defaultEntity.id },
      { name: "Pepsi 500ml", sku: "PE500", barcode: "8901234567907", qr_code: "", hsn_code: "2202", unit: "pcs", mrp: 35, cost_price: 28, sale_price: 35, wholesale_price: 22, current_stock: 48, reorder_point: 12, is_active: true, category: savedCats[1].id, entity_id: defaultEntity.id },
      { name: "Druk Supreme Beer 650ml", sku: "DSP650", barcode: "8901234567908", qr_code: "", hsn_code: "2203", unit: "pcs", mrp: 110, cost_price: 85, sale_price: 110, wholesale_price: 65, current_stock: 40, reorder_point: 8, is_active: true, category: savedCats[1].id, entity_id: defaultEntity.id },

      // Snacks (savedCats[2])
      { name: "Lays Classic 52g", sku: "LC052", barcode: "8901234567909", qr_code: "", hsn_code: "2005", unit: "pcs", mrp: 25, cost_price: 18, sale_price: 25, wholesale_price: 14, current_stock: 150, reorder_point: 25, is_active: true, category: savedCats[2].id, entity_id: defaultEntity.id },
      { name: "Kurkure Masala 80g", sku: "KM080", barcode: "8901234567910", qr_code: "", hsn_code: "2005", unit: "pcs", mrp: 30, cost_price: 22, sale_price: 30, wholesale_price: 18, current_stock: 95, reorder_point: 20, is_active: true, category: savedCats[2].id, entity_id: defaultEntity.id },
      { name: "Doritos Nacho Cheese 65g", sku: "DNC65", barcode: "8901234567911", qr_code: "", hsn_code: "2005", unit: "pcs", mrp: 50, cost_price: 38, sale_price: 50, wholesale_price: 30, current_stock: 38, reorder_point: 8, is_active: true, category: savedCats[2].id, entity_id: defaultEntity.id },
      { name: "Bhujia Sev 200g", sku: "BS200", barcode: "8901234567912", qr_code: "", hsn_code: "2106", unit: "pcs", mrp: 55, cost_price: 42, sale_price: 55, wholesale_price: 35, current_stock: 40, reorder_point: 8, is_active: true, category: savedCats[2].id, entity_id: defaultEntity.id },
      { name: "Peanuts Roasted 200g", sku: "PN200", barcode: "8901234567913", qr_code: "", hsn_code: "2008", unit: "pcs", mrp: 60, cost_price: 45, sale_price: 60, wholesale_price: 38, current_stock: 28, reorder_point: 6, is_active: true, category: savedCats[2].id, entity_id: defaultEntity.id },

      // Household (savedCats[3])
      { name: "Vim Dishwash Bar 200g", sku: "VDB200", barcode: "8901234567914", qr_code: "", hsn_code: "3402", unit: "pcs", mrp: 20, cost_price: 14, sale_price: 20, wholesale_price: 10, current_stock: 100, reorder_point: 20, is_active: true, category: savedCats[3].id, entity_id: defaultEntity.id },
      { name: "Surf Excel 1kg", sku: "SE001", barcode: "8901234567915", qr_code: "", hsn_code: "3402", unit: "pcs", mrp: 120, cost_price: 95, sale_price: 120, wholesale_price: 75, current_stock: 35, reorder_point: 8, is_active: true, category: savedCats[3].id, entity_id: defaultEntity.id },
      { name: "Harpic Toilet Cleaner 500ml", sku: "HTC500", barcode: "8901234567916", qr_code: "", hsn_code: "3402", unit: "pcs", mrp: 85, cost_price: 65, sale_price: 85, wholesale_price: 50, current_stock: 42, reorder_point: 8, is_active: true, category: savedCats[3].id, entity_id: defaultEntity.id },
      { name: "Odonil Room Freshener 50g", sku: "ORF50", barcode: "8901234567917", qr_code: "", hsn_code: "3307", unit: "pcs", mrp: 45, cost_price: 35, sale_price: 45, wholesale_price: 25, current_stock: 55, reorder_point: 10, is_active: true, category: savedCats[3].id, entity_id: defaultEntity.id },
      { name: "Matches Box", sku: "MB001", barcode: "8901234567918", qr_code: "", hsn_code: "3605", unit: "pcs", mrp: 2, cost_price: 1, sale_price: 2, wholesale_price: 1, current_stock: 500, reorder_point: 50, is_active: true, category: savedCats[3].id, entity_id: defaultEntity.id },

      // Personal Care (savedCats[4])
      { name: "Dahlia Soap 100g", sku: "DS100", barcode: "8901234567895", qr_code: "", hsn_code: "3401", unit: "pcs", mrp: 35, cost_price: 22, sale_price: 35, wholesale_price: 15, current_stock: 80, reorder_point: 15, is_active: true, category: savedCats[4].id, entity_id: defaultEntity.id },
      { name: "Colgate Toothpaste 200g", sku: "CT200", barcode: "8901234567919", qr_code: "", hsn_code: "3306", unit: "pcs", mrp: 75, cost_price: 58, sale_price: 75, wholesale_price: 45, current_stock: 50, reorder_point: 10, is_active: true, category: savedCats[4].id, entity_id: defaultEntity.id },
      { name: "Clinic Plus Shampoo 200ml", sku: "CP200", barcode: "8901234567920", qr_code: "", hsn_code: "3305", unit: "pcs", mrp: 95, cost_price: 72, sale_price: 95, wholesale_price: 55, current_stock: 30, reorder_point: 6, is_active: true, category: savedCats[4].id, entity_id: defaultEntity.id },
      { name: "Nivea Body Lotion 200ml", sku: "NBL200", barcode: "8901234567921", qr_code: "", hsn_code: "3304", unit: "pcs", mrp: 160, cost_price: 120, sale_price: 160, wholesale_price: 90, current_stock: 20, reorder_point: 5, is_active: true, category: savedCats[4].id, entity_id: defaultEntity.id },
      { name: "Gillette Razor", sku: "GR001", barcode: "8901234567922", qr_code: "", hsn_code: "8212", unit: "pcs", mrp: 55, cost_price: 40, sale_price: 55, wholesale_price: 30, current_stock: 45, reorder_point: 10, is_active: true, category: savedCats[4].id, entity_id: defaultEntity.id },

      // Dairy & Bread (savedCats[5])
      { name: "Amul Butter 100g", sku: "AB100", barcode: "8901234567923", qr_code: "", hsn_code: "0405", unit: "pcs", mrp: 55, cost_price: 42, sale_price: 55, wholesale_price: 35, current_stock: 40, reorder_point: 8, is_active: true, category: savedCats[5].id, entity_id: defaultEntity.id },
      { name: "Amul Cheese 200g", sku: "AC200", barcode: "8901234567924", qr_code: "", hsn_code: "0406", unit: "pcs", mrp: 110, cost_price: 85, sale_price: 110, wholesale_price: 65, current_stock: 25, reorder_point: 5, is_active: true, category: savedCats[5].id, entity_id: defaultEntity.id },
      { name: "Modern Bread 400g", sku: "MB400", barcode: "8901234567925", qr_code: "", hsn_code: "1905", unit: "pcs", mrp: 40, cost_price: 30, sale_price: 40, wholesale_price: 22, current_stock: 35, reorder_point: 8, is_active: true, category: savedCats[5].id, entity_id: defaultEntity.id },
      { name: "Druk Fresh Milk 1L", sku: "DFM001", barcode: "8901234567926", qr_code: "", hsn_code: "0401", unit: "pcs", mrp: 45, cost_price: 35, sale_price: 45, wholesale_price: 28, current_stock: 50, reorder_point: 10, is_active: true, category: savedCats[5].id, entity_id: defaultEntity.id },
      { name: "Yoghurt Plain 200ml", sku: "YP200", barcode: "8901234567927", qr_code: "", hsn_code: "0403", unit: "pcs", mrp: 30, cost_price: 22, sale_price: 30, wholesale_price: 18, current_stock: 60, reorder_point: 12, is_active: true, category: savedCats[5].id, entity_id: defaultEntity.id },

      // Frozen Foods (savedCats[6])
      { name: "Frozen Peas 500g", sku: "FP500", barcode: "8901234567928", qr_code: "", hsn_code: "0710", unit: "pcs", mrp: 85, cost_price: 65, sale_price: 85, wholesale_price: 50, current_stock: 28, reorder_point: 6, is_active: true, category: savedCats[6].id, entity_id: defaultEntity.id },
      { name: "Chicken Nuggets 400g", sku: "CN400", barcode: "8901234567929", qr_code: "", hsn_code: "1602", unit: "pcs", mrp: 180, cost_price: 135, sale_price: 180, wholesale_price: 100, current_stock: 15, reorder_point: 4, is_active: true, category: savedCats[6].id, entity_id: defaultEntity.id },
      { name: "French Fries 500g", sku: "FF500", barcode: "8901234567930", qr_code: "", hsn_code: "2004", unit: "pcs", mrp: 95, cost_price: 72, sale_price: 95, wholesale_price: 55, current_stock: 20, reorder_point: 5, is_active: true, category: savedCats[6].id, entity_id: defaultEntity.id },
      { name: "Ice Cream Vanilla 1L", sku: "ICV001", barcode: "8901234567931", qr_code: "", hsn_code: "2105", unit: "pcs", mrp: 150, cost_price: 110, sale_price: 150, wholesale_price: 85, current_stock: 18, reorder_point: 4, is_active: true, category: savedCats[6].id, entity_id: defaultEntity.id },

      // Confectionery (savedCats[7])
      { name: "Dairy Milk Silk 150g", sku: "DMS150", barcode: "8901234567932", qr_code: "", hsn_code: "1806", unit: "pcs", mrp: 150, cost_price: 115, sale_price: 150, wholesale_price: 90, current_stock: 35, reorder_point: 8, is_active: true, category: savedCats[7].id, entity_id: defaultEntity.id },
      { name: "KitKat 4 Finger 42g", sku: "KK042", barcode: "8901234567933", qr_code: "", hsn_code: "1806", unit: "pcs", mrp: 35, cost_price: 25, sale_price: 35, wholesale_price: 18, current_stock: 80, reorder_point: 15, is_active: true, category: savedCats[7].id, entity_id: defaultEntity.id },
      { name: "Mentos Mint Roll", sku: "MMR01", barcode: "8901234567934", qr_code: "", hsn_code: "1704", unit: "pcs", mrp: 10, cost_price: 7, sale_price: 10, wholesale_price: 5, current_stock: 200, reorder_point: 30, is_active: true, category: savedCats[7].id, entity_id: defaultEntity.id },
      { name: "Halls Cough Drops", sku: "HCD01", barcode: "8901234567935", qr_code: "", hsn_code: "1704", unit: "pcs", mrp: 5, cost_price: 3, sale_price: 5, wholesale_price: 2, current_stock: 300, reorder_point: 40, is_active: true, category: savedCats[7].id, entity_id: defaultEntity.id },
    ];
    for (const p of sampleProducts) {
      const prod = new Record(products, p);
      app.save(prod);
    }

    // ── Seed demo khata accounts ─────────────────────────────────────────────
    const demoAccounts = [
      { debtor_name: "Karma Dorji", debtor_phone: "+975-17123456", credit_limit: 5000, outstanding_balance: 0, party_type: "CONSUMER", status: "ACTIVE", credit_term_days: 30, creditor_entity_id: defaultEntity.id },
      { debtor_name: "Pema Wangchuk", debtor_phone: "+975-17765432", credit_limit: 10000, outstanding_balance: 1250, party_type: "CONSUMER", status: "ACTIVE", credit_term_days: 30, creditor_entity_id: defaultEntity.id },
      { debtor_name: "Sonam Choden", debtor_phone: "+975-17654321", credit_limit: 3000, outstanding_balance: 0, party_type: "CONSUMER", status: "FROZEN", credit_term_days: 30, creditor_entity_id: defaultEntity.id },
    ];
    for (const a of demoAccounts) {
      const acct = new Record(khataAccounts, a);
      app.save(acct);
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
      entity_id: defaultEntity.id,
    });
    app.save(settingsRecord);
  },
  (app) => {
    const names = [
      "khata_transactions",
      "inventory_movements",
      "orders",
      "cart_items",
      "carts",
      "khata_accounts",
      "products",
      "categories",
      "settings",
      "entities",
    ];
    for (const name of names) {
      const c = app.findCollectionByNameOrId(name);
      if (c) app.delete(c);
    }
  }
);
