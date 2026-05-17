# Vendor Import Plan — Dawai Tshongkhang (Thimphu)

## Overview
- **Vendor**: Dawai Tshongkhang, Thimphu
- **Products**: 1,165 items across 262 sub-groups
- **Source**: `web/data/Stock Register.xlsx`

---

## Phase 1: HSN Seed Migration (chapters missing from hsn_master)

### Chapter 09 — Coffee, Tea, Spices
- [ ] 0901: Coffee
- [ ] 0902: Tea
- [ ] 0910: Ginger, spices (masala, cardamom, chilli, turmeric, coriander)

### Chapter 10 — Cereals
- [ ] 1006: Rice
- [ ] 1001: Wheat
- [ ] 1008: Buckwheat

### Chapter 11 — Milling products (flour)
- [ ] 1101: Wheat flour (atta, maida)
- [ ] 1103: Cereal groats/meal (sooji)
- [ ] 1104: Cereal flakes (puffed rice)

### Chapter 15 — Fats & Oils
- [ ] 1507-1515: Vegetable oils (cooking oil, refined oil)
- [ ] 1508-1522: Other oils
- [ ] 1501-1503: Lard, ghee, dalda

### Chapter 16 — Prepared meat & fish
- [ ] 1601: Sausages, prepared meat
- [ ] 1602: Other prepared meat (beef, chicken, pork)
- [ ] 1604: Prepared fish (tin fish)
- [ ] 1605: Crustaceans, molluscs prepared

### Chapter 17 — Sugar & Confectionery
- [ ] 1701: Cane/beet sugar
- [ ] 1704: Sugar confectionery (candy, chewing gum, sweets)

### Chapter 18 — Cocoa & Chocolate
- [ ] 1806: Chocolate, kit kat, cocoa products

### Chapter 19 — Cereal & Food Preparations
- [ ] 1901: Malt extract, infant food (cerelac, lactogen, horlicks)
- [ ] 1902: Pasta, noodles
- [ ] 1904: Prepared foods (corn flakes, chocos, snacks, chips)
- [ ] 1905: Bread, pastry, biscuits, cake

### Chapter 20 — Preserved Foods
- [ ] 2001: Preserved vegetables (pickle)
- [ ] 2002: Tomatoes preserved
- [ ] 2005: Other preserved vegetables
- [ ] 2007: Jams, jellies
- [ ] 2008: Fruit, nuts prepared
- [ ] 2009: Fruit juices

### Chapter 21 — Mixed Food Preparations
- [ ] 2101: Coffee/tea extracts, instant coffee
- [ ] 2103: Sauces, ketchup, mixed condiments, masala
- [ ] 2104: Soups
- [ ] 2105: Ice cream
- [ ] 2106: Food preparations (honey products, protein supplements)

### Chapter 22 — Beverages
- [ ] 2201: Waters (mineral water)
- [ ] 2202: Soft drinks, juice drinks
- [ ] 2203: Beer
- [ ] 2204: Wine
- [ ] 2208: Spirits (whisky, vodka)

### Chapter 24 — Tobacco
- [ ] 2401: Tobacco (unmanufactured)
- [ ] 2403: Smoking tobacco, pan masala, doma

### Chapter 25 — Salt
- [ ] 2501: Salt

### Chapter 33 — Cosmetics & Personal Care
- [ ] 3303: Perfumes
- [ ] 3304: Beauty/makeup prep (face wash, facepack, sun cream, serum)
- [ ] 3305: Hair care (shampoo, hair oil, hair colour, lotion)
- [ ] 3306: Oral hygiene (toothpaste, toothbrush)
- [ ] 3307: Shaving prep, deodorants, bath prep (lip balm, roll on)

### Chapter 34 — Soap & Detergents
- [ ] 3401: Soap
- [ ] 3402: Detergents, cleaning (surf, dish soap, liquid wash)
- [ ] 3406: Candles

### Chapter 35 — Albuminoidal substances
- [ ] 3506: Glue

### Chapter 39 — Plastics
- [ ] 3924: Plastic household (container, cup, plate)
- [ ] 3926: Other plastic (bag, garbage bag, cloth clip, zipper)

### Chapter 48 — Paper & Paperboard
- [ ] 4818: Toilet paper, tissues, napkins, wipes
- [ ] 4820: Notebooks, graph books, drawing books
- [ ] 4819: Cartons, paper bags
- [ ] 4823: Other paper (envelopes, stickers, book covers)

### Chapter 55 — Man-made staple fibres
- (Baby products are actually under 9619)
- [ ] Skipped — diapers/pads under Chapter 96

### Chapter 61-63 — Textiles
- [ ] 6115: Hosiery (pants)
- [ ] 6302: Bed linen, table linen (cloth)
- [ ] 6304: Other textile furnishing
- [ ] 6307: Other made-up articles (rope, thread)

### Chapter 73 — Iron/Steel Articles
- [ ] 7323: Steel kitchen articles (spoon, plate, cup)
- [ ] 7310: Steel containers
- [ ] 7326: Other steel articles

### Chapter 82 — Cutlery & Tools
- [ ] 8211: Knives, scissors
- [ ] 8212: Razors, blades
- [ ] 8215: Spoons, forks, ladles

### Chapter 84 — Machinery
- [ ] 8414: Fans
- [ ] 8419: Electric water heaters, motors

### Chapter 85 — Electrical
- [ ] 8506-8507: Batteries
- [ ] 8510: Electric shavers

### Chapter 96 — Miscellaneous Manufactured Articles
- [ ] 9601: Coral, shell articles
- [ ] 9603: Brooms, brushes (toilet brush, scrub)
- [ ] 9608: Pens (ballpoint, marker, gel)
- [ ] 9609: Pencils, crayons, colour pencils
- [ ] 9610: Writing/drawing boards
- [ ] 9612: Typewriter/computer ribbons
- [ ] 9613: Cigarette lighters
- [ ] 9614: Smoking pipes
- [ ] 9615: Combs, hair accessories
- [ ] 9616: Spray dispensers
- [ ] 9617: Vacuum flasks
- [ ] 9619: Baby diapers, sanitary pads, wipes
- [ ] 9618: Tailors' dummies, mannequins

---

## Phase 2: Category Cleanup & Mapping
- [ ] Merge 262 sub-groups into ~180 cleaned categories
- [ ] Map each category to an HSN code
- [ ] Fix spelling errors (Alchool→Alcohol, Mashroom→Mushroom, etc.)

## Phase 3: Vendor & Product Import
- [ ] Create vendor entity: "Dawai Tshongkhang" (role: RETAILER)
- [ ] Create auth user for vendor
- [ ] Create categories from cleaned sub-groups
- [ ] Import 1,165 products into `products` table
- [ ] Import 1,165 entity_products with SKU, barcode, pricing, stock
- [ ] Link products to categories via `product_categories`

---

## Notes
- Tax rates follow Bhutan Trade Classification 2022 patterns
- Food items: typically 0-5% ST, 0% CD (from India)
- Processed food: varies 0-10% ST
- Cosmetics: typically 10-20% ST
- Tobacco: high ST (20-50%)
- Alcohol: high ST (20-50%)
- Stationery: typically 5-10% ST
