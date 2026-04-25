# NEXUS BHUTAN — User Flow Diagrams

**Last Updated**: 2026-04-25
**Scope**: All vendor (POS staff) and consumer flows including WhatsApp interactions.

---

## VENDOR FLOWS

### V1. Authentication

```mermaid
flowchart TD
    START([User opens app]) --> LOGIN[Login Page]
    
    LOGIN --> |Email/Password| EP[Enter email + password]
    LOGIN --> |WhatsApp OTP| WP[Enter phone number]
    
    EP --> SUPA{Supabase Auth}
    SUPA --> |Success| ROLE{Check role}
    SUPA --> |Fail| ERR1[Show error]
    ERR1 --> LOGIN
    
    WP --> SEND_OTP["POST /api/auth/whatsapp/send"]
    SEND_OTP --> META1["Gateway -> Meta Cloud API"]
    META1 --> |OTP delivered| ENTER_OTP[Enter 6-digit code]
    META1 --> |Dev mode| LOG_OTP[Log OTP to console]
    LOG_OTP --> ENTER_OTP
    
    ENTER_OTP --> VERIFY["POST /api/auth/whatsapp/verify"]
    VERIFY --> |Verified| ROLE
    VERIFY --> |Invalid code| RETRY{"Attempts < 3?"}
    RETRY --> |Yes| ENTER_OTP
    RETRY --> |No| LOGIN
    
    ROLE --> |SUPER_ADMIN / DISTRIBUTOR| ADMIN["/admin hub - future"]
    ROLE --> |RETAILER / WHOLESALER| POS["/pos terminal"]
```

---

### V2. POS Sale (Main Checkout)

```mermaid
flowchart TD
    POS([POS Terminal]) --> IDENTIFY[Identify Customer]
    
    IDENTIFY --> |Face-ID camera| FACE{Face recognized?}
    IDENTIFY --> |Manual entry| PHONE[Enter WhatsApp number]
    IDENTIFY --> |Skip| WALKIN[Walk-in customer]
    
    FACE --> |Yes| AUTO_POP[Auto-populate customer]
    FACE --> |No| PHONE
    AUTO_POP --> ADD_ITEMS
    
    PHONE --> VALIDATE{"E.164 valid?"}
    VALIDATE --> |Yes| ADD_ITEMS[Add Products to Cart]
    VALIDATE --> |No| PHONE
    
    WALKIN --> ADD_ITEMS
    
    ADD_ITEMS --> MORE{More items?}
    MORE --> |Yes| ADD_ITEMS
    MORE --> |No| PAYMENT[Select Payment Method]
    
    PAYMENT --> |CASH| STOCK_CHECK
    PAYMENT --> |MBOB / MPAY / RTGS| SCAN_PAY[Payment Scanner Modal]
    PAYMENT --> |CREDIT - Khata| KHATA_LOOK[Lookup Khata Account]
    
    SCAN_PAY --> CAPTURE[Camera captures screenshot]
    CAPTURE --> GEMINI_PAY[Gemini Vision verifies amount]
    GEMINI_PAY --> |"Verified"| STOCK_CHECK
    GEMINI_PAY --> |Failed| RETRY_PAY{"Retries < 3?"}
    RETRY_PAY --> |Yes| CAPTURE
    RETRY_PAY --> |No| PAYMENT
    
    KHATA_LOOK --> KHANA_FOUND{Account found?}
    KHANA_FOUND --> |No| ROLE_CHECK1{"Manager+?"}
    ROLE_CHECK1 --> |Yes| CREATE_ACCT[Create Account Modal]
    ROLE_CHECK1 --> |No - Cashier| ERR_KHATA[Error: cannot proceed]
    ERR_KHATA --> PAYMENT
    CREATE_ACCT --> LIMIT_CHECK
    KHANA_FOUND --> |Yes| LIMIT_CHECK{Within credit limit?}
    
    LIMIT_CHECK --> |Yes| STOCK_CHECK
    LIMIT_CHECK --> |No| ROLE_CHECK2{"Owner/Admin?"}
    ROLE_CHECK2 --> |Yes - Override| STOCK_CHECK
    ROLE_CHECK2 --> |No| ERR_LIMIT[Error: limit exceeded]
    ERR_LIMIT --> PAYMENT
    
    STOCK_CHECK{All items in stock?}
    STOCK_CHECK --> |Yes| CREATE_ORDER[Create Order]
    STOCK_CHECK --> |No| GATE[Stock Gate Modal]
    GATE --> |Remove short items| CREATE_ORDER
    GATE --> |Cancel| POS
    
    CREATE_ORDER --> CONFIRM[Status: CONFIRMED]
    CONFIRM --> TRIGGER1[Stock deducted via trigger]
    CONFIRM --> TRIGGER2["GST 5% recorded"]
    CONFIRM --> TRIGGER3["Digital signature SHA-256"]
    CONFIRM --> TRIGGER4[Khata DEBIT - if CREDIT]
    CONFIRM --> TRIGGER5[WhatsApp receipt sent]
    CONFIRM --> CONFIRM_PAGE["/pos/order/id success=true"]
    
    CONFIRM_PAGE --> |Download PDF| PDF["jsPDF + html2canvas"]
    CONFIRM_PAGE --> |Send WhatsApp| WA_SEND["Gateway /api/send-receipt"]
    CONFIRM_PAGE --> |New Sale| POS
```

---

### V3. Order Management

```mermaid
flowchart TD
    ORDERS([Orders Page]) --> FILTER["Filter: ALL WHATSAPP ACTIVE COMPLETED CANCELLED REFUNDS"]
    FILTER --> LIST[Order List]
    LIST --> SEARCH["Search by order no. / phone"]
    LIST --> CLICK[Click order]
    CLICK --> DETAIL["Order Detail /pos/orders/id"]
    
    DETAIL --> VIEW_STATUS[Status badge + timeline]
    DETAIL --> VIEW_ITEMS[Items list]
    DETAIL --> VIEW_WA{WhatsApp order?}
    
    VIEW_WA --> |Yes| SHOW_UNMATCH[Show unmatched items in amber]
    VIEW_WA --> |No| SHOW_NORMAL[Standard item display]
    
    DETAIL --> ACTIONS{Actions available?}
    ACTIONS --> |View Receipt| RECEIPT["/pos/order/id"]
    
    ACTIONS --> |Cancel| CAN_CHECK{"Status <= DISPATCHED?"}
    CAN_CHECK --> |Yes| CAN_REASON[Enter cancellation reason]
    CAN_REASON --> CANCELLED[Status: CANCELLED]
    CANCELLED --> RESTORE[Stock restored by trigger]
    CAN_CHECK --> |No| NO_ACTION[No cancel available]
    
    ACTIONS --> |Request Refund| REF_CHECK{"Status >= CONFIRMED?"}
    REF_CHECK --> |Yes| REF_SELECT[Select items + reason]
    REF_SELECT --> REF_REQ[Status: REFUND_REQUESTED]
    REF_CHECK --> |No| NO_ACTION
    
    ACTIONS --> |Approve Refund| APPROV{"Manager+ AND REQUESTED?"}
    APPROV --> |Yes| REF_APP[Status: REFUND_APPROVED]
    REF_APP --> REF_PROC[Status: REFUND_PROCESSING]
    REF_PROC --> REFUNDED[Status: REFUNDED]
    REFUNDED --> REF_STOCK[Stock restored]
    APPROV --> |No| NO_ACTION
```

---

### V4. Inventory Management

```mermaid
flowchart TD
    INV([Inventory Page]) --> TABS{Select Tab}
    
    TABS --> |Stock Levels| STOCK_TAB[Stock Table]
    TABS --> |Draft Purchases| DRAFT_TAB[Draft Purchases]
    TABS --> |Predictions| PRED_TAB[Predictions]
    TABS --> |Movement History| HIST_TAB[History]
    
    STOCK_TAB --> ALERTS{Low/Out of stock?}
    ALERTS --> |Yes| BANNER[Show alert banners]
    ALERTS --> |No| TABLE
    BANNER --> TABLE[Product stock table]
    TABLE --> FILTER_STOCK[Filter: ALL LOW OUT]
    TABLE --> SCAN_BTN[Scan Bill button]
    TABLE --> ADJUST["Adjust Stock - Manager+"]
    ADJUST --> ADJ_TYPE["Type: RESTOCK SALE DAMAGE LOSS RETURN"]
    ADJ_TYPE --> MOVEMENT[Create inventory movement]
    MOVEMENT --> UPDATE_STOCK[Trigger updates current_stock]
    
    SCAN_BTN --> SCAN_MODAL[Scan Bill Modal]
    
    DRAFT_TAB --> DRAFT_LIST[Draft List]
    DRAFT_TAB --> SCAN_BTN2[Scan Bill Button]
    
    DRAFT_LIST --> |Click DRAFT or REVIEWED| REVIEW[Draft Review Panel]
    DRAFT_LIST --> |Click CONFIRMED or CANCELLED| VIEW_ONLY[Read-only view]
    
    REVIEW --> CONF_TIERS{Confidence Tier}
    CONF_TIERS --> |85%+ MATCHED| GREEN["Green - auto accepted"]
    CONF_TIERS --> |70-84% PARTIAL| AMBER["Amber - review suggested"]
    CONF_TIERS --> |60-69% PARTIAL| YELLOW["Yellow - likely wrong"]
    CONF_TIERS --> |60% or less UNMATCHED| RED["Red - pick product manually"]
    
    REVIEW --> EDIT_ITEMS["Edit qty / price / assign product"]
    REVIEW --> |Confirm Restock| CONFIRM_D[Create RESTOCK movements]
    CONFIRM_D --> STOCK_UP[Stock updated]
    REVIEW --> |Cancel Draft| CANCEL_D[Status: CANCELLED]
    
    PRED_TAB --> SUMMARY[Summary Cards]
    SUMMARY --> CRIT[Critical]
    SUMMARY --> RISK[At Risk]
    SUMMARY --> HEALTHY[Healthy]
    SUMMARY --> DEAD[Dead Stock]
    PRED_TAB --> PRED_TABLE[Prediction Table]
    PRED_TABLE --> LEAD_TIME[Set Lead Time]
    PRED_TAB --> REFRESH_P[Refresh Predictions]
    
    HIST_TAB --> MOV_LIST[Movement History List]
    MOV_LIST --> MOV_TYPES["RESTOCK SALE DAMAGE LOSS RETURN ADJUSTMENT"]
```

---

### V5. Photo-to-Stock Detail Flow

```mermaid
flowchart TD
    START([Scan Bill button]) --> MODAL[ScanBillModal]
    MODAL --> CHOOSE{Choose input}
    
    CHOOSE --> |Camera - PWA| CAM_START["getUserMedia facingMode environment"]
    CHOOSE --> |Upload - Desktop| FILE_PICK[File picker]
    
    CAM_START --> |Success| VIEWFINDER[Camera viewfinder]
    CAM_START --> |Denied| CAM_ERR[Error: use file upload]
    CAM_ERR --> MODAL
    
    VIEWFINDER --> CAPTURE[Capture frame]
    CAPTURE --> TO_BASE64_1[Convert to base64 JPEG]
    
    FILE_PICK --> FILE_SEL[Select image file]
    FILE_SEL --> TO_BASE64_2[FileReader to base64]
    
    TO_BASE64_1 --> API_CALL
    TO_BASE64_2 --> API_CALL
    
    API_CALL["POST /api/bill-parse"] --> HASH["Compute SHA-256 hash"]
    HASH --> DUP_CHECK{Duplicate hash?}
    
    DUP_CHECK --> |Yes - existing DRAFT| RETURN_DUP[Return existing draft]
    DUP_CHECK --> |No| OCR_CALL
    
    OCR_CALL["extractBillItems - Gemini Vision"] --> PARSE[Parse structured JSON]
    PARSE --> |Success| MATCH["fuzzyMatchItems - pg_trgm 0.6 threshold"]
    PARSE --> |Fail - no items| ERR_PARSE[Error: No items found]
    PARSE --> |Fail - API error| ERR_API[Error: OCR failed]
    
    MATCH --> UPLOAD[Upload photo to Supabase Storage]
    UPLOAD --> INSERT_DRAFT["Create draft_purchases row - DRAFT"]
    INSERT_DRAFT --> INSERT_ITEMS[Create draft_purchase_items rows]
    INSERT_ITEMS --> SUCCESS[Return draft + items]
    
    RETURN_DUP --> REVIEW[Open Draft Review]
    SUCCESS --> REVIEW
    
    ERR_PARSE --> RETRY{Retry?}
    ERR_API --> RETRY
    RETRY --> |Yes| MODAL
    RETRY --> |No| CLOSE([Close modal])
    
    REVIEW --> ITEMS[Items with confidence badges]
    ITEMS --> EDIT["Edit qty / price / reassign product"]
    EDIT --> |Confirm| CONFIRM_DTL["POST confirm draft"]
    EDIT --> |Cancel| CANCEL_DTL["POST cancel draft"]
    
    CONFIRM_DTL --> RESTOCK["Insert inventory_movements RESTOCK"]
    RESTOCK --> TRIGGER["Trigger updates products.current_stock"]
    TRIGGER --> DONE([Draft confirmed - stock updated])
    CANCEL_DTL --> CANCELLED_END([Draft cancelled - no changes])
```

---

### V6. Khata Credit Management

```mermaid
flowchart TD
    KHATA([Khata Page]) --> LIST[Account List]
    LIST --> SEARCH["Search by name / phone"]
    LIST --> |Manager+| CREATE[Create Account]
    
    CREATE --> FORM["Party type + Name + Phone + Limit + Term"]
    FORM --> SAVE["Save khata_accounts"]
    SAVE --> LIST
    
    LIST --> CLICK[Click account]
    CLICK --> DETAIL["Account Detail /pos/khata/id"]
    
    DETAIL --> SUMMARY["Outstanding - Limit - Available"]
    
    DETAIL --> ACTIONS{Role-gated actions}
    
    ACTIONS --> |"Record Payment - Manager+"| PAY_FORM["Amount + Method + Reference"]
    PAY_FORM --> PAY_SAVE["Status: PAYMENT_MADE"]
    PAY_SAVE --> TRIGGER_CREDIT["Trigger: CREDIT transaction"]
    TRIGGER_CREDIT --> BAL_DOWN[Balance decreased]
    
    ACTIONS --> |"Set Limit - Owner+"| LIMIT_FORM[New limit amount]
    LIMIT_FORM --> LIMIT_SAVE[Update credit_limit]
    LIMIT_SAVE --> ADJUST_TXN[ADJUSTMENT transaction logged]
    
    ACTIONS --> |"Adjust Balance - Owner+"| ADJ_FORM["WRITE_OFF or CORRECTION + Reason"]
    ADJ_FORM --> ADJ_SAVE["Update outstanding_balance"]
    ADJ_SAVE --> ADJUST_TXN2[ADJUSTMENT transaction logged]
    
    ACTIONS --> |"Freeze/Unfreeze - Owner+"| FREEZE["Toggle ACTIVE and FROZEN"]
    FREEZE --> FREEZE_SAVE[Status updated]
    FREEZE_SAVE --> BLOCK[Blocks new CREDIT sales at checkout]
    
    DETAIL --> LEDGER[Transaction Ledger]
    LEDGER --> TXN_TYPES["DEBIT sale / CREDIT payment / ADJUSTMENT"]
```

---

## CONSUMER FLOWS

### C1. Marketplace Browsing

```mermaid
flowchart LR
    CONSUMER([Consumer]) --> BROWSE["/shop/store-slug"]
    BROWSE --> STORE["Store header: name + logo + bio"]
    STORE --> CATS[Products by category]
    CATS --> PRODUCT["Product card: image + name + price"]
    PRODUCT --> ORDER_BTN["Order via WhatsApp - gold button"]
    ORDER_BTN --> WA_LINK[wa.me deep link opens]
    WA_LINK --> MSG["Hi, order Product from Store. Ref: slug"]
    MSG --> WHATSAPP([WhatsApp chat])
```

---

### C2. WhatsApp Ordering — End to End

```mermaid
sequenceDiagram
    participant C as Consumer
    participant WA as WhatsApp
    participant GW as Gateway :3001
    participant DB as Supabase
    participant S as Store Staff

    C->>WA: Sends order message with items and store ref
    WA->>GW: POST /api/webhook
    
    GW->>DB: Check rate limit 10 orders per day per phone
    alt Rate exceeded
        GW->>WA: Reply: Daily limit reached
        WA->>C: Limit message
    end
    
    GW->>GW: parseOrderMessage Extract items and quantities
    GW->>DB: Resolve store by shop_slug
    GW->>DB: fuzzy_match_product RPC pg_trgm 70pct threshold
    GW->>DB: Create DRAFT order order_source WHATSAPP
    GW->>DB: Insert order_items matched and unmatched
    GW->>DB: Upsert consumer_account
    
    GW->>WA: Reply with order summary
    WA->>C: Order received with matched and unmatched items

    Note over S: Staff reviews in /pos/orders WhatsApp filter
    S->>DB: Edit unmatched items
    S->>DB: Confirm order to CONFIRMED
    DB->>DB: Stock deducted and GST recorded
    S->>GW: POST /api/send-receipt
    GW->>WA: Receipt message
    WA->>C: Receipt from Store with Total and GST amounts
```

---

### C3. WhatsApp OTP Login

```mermaid
sequenceDiagram
    participant C as Consumer
    participant APP as Login Page
    participant API as Auth API
    participant GW as Gateway :3001
    participant META as Meta Cloud API
    participant WA as WhatsApp

    C->>APP: Switch to WhatsApp tab
    C->>APP: Enter phone number
    APP->>API: POST /api/auth/whatsapp/send
    API->>API: Store OTP in whatsapp_otps table
    API->>GW: POST /api/send-otp
    GW->>META: Send template message
    META->>WA: Deliver OTP
    WA->>C: Your code is 482916 Valid for 5 minutes
    
    C->>APP: Enter 6-digit code
    APP->>API: POST /api/auth/whatsapp/verify
    
    alt Valid OTP
        API->>API: Create Supabase session
        API-->>APP: Success and redirect
        APP-->>C: Redirected to /pos
    else Invalid OTP
        API-->>APP: Error
        APP-->>C: Invalid code retry
    else Expired OTP
        API-->>APP: Error
        APP-->>C: Code expired resend
    end
```

---

### C4. WhatsApp Receipt Delivery

```mermaid
sequenceDiagram
    participant S as Store Staff
    participant POS as POS Terminal
    participant GW as Gateway :3001
    participant META as Meta Cloud API
    participant WA as WhatsApp
    participant C as Consumer
    participant DB as Supabase

    S->>POS: Confirm sale
    POS->>DB: Create order CONFIRMED
    
    POS->>GW: POST /api/send-receipt fire and forget
    GW->>META: Send receipt template
    META->>WA: Deliver receipt
    WA->>C: Receipt from Store with Invoice Total and GST
    
    WA->>META: Delivery status callback
    META->>GW: POST /api/webhook status update
    GW->>DB: Update whatsapp_status SENT to DELIVERED to READ
    
    Note over POS: Confirmation page shows WhatsApp sent status
    
    alt Template failed
        GW->>META: Send plain text fallback
    end
    
    alt Gateway unreachable
        POS->>POS: Show WhatsApp Web fallback button
        S->>POS: Click fallback
        POS->>C: Open wa.me with receipt text
    end
```

---

### C5. WhatsApp Credit Alerts

```mermaid
flowchart TD
    SCHEDULE([Scheduled check]) --> CHECK[Check khata_accounts]
    CHECK --> DUE_CHECK{Payment due?}
    
    DUE_CHECK --> |3 days before| PRE_DUE["Hi Name, payment of Nu. X due in 3 days"]
    DUE_CHECK --> |Due today| DUE_TODAY["Hi Name, payment of Nu. X due today"]
    DUE_CHECK --> |3 days overdue| OVERDUE_3D["Hi Name, payment of Nu. X was due 3 days ago"]
    DUE_CHECK --> |30 days overdue| OVERDUE_30D["Overdue balance of Nu. X, 30+ days past due"]
    DUE_CHECK --> |Monthly| MONTHLY["Hi Name, outstanding balance at Store is Nu. X"]
    
    PRE_DUE --> GW["POST /api/send-credit-alert"]
    DUE_TODAY --> GW
    OVERDUE_3D --> GW
    OVERDUE_30D --> GW
    MONTHLY --> GW
    
    GW --> META[Meta Cloud API]
    META --> PHONE[WhatsApp delivered to debtor]
```

---

### C6. WhatsApp Stock Alerts

```mermaid
flowchart LR
    PRED[Stock Prediction System] --> |Below threshold| API["POST /api/send-stock-alert"]
    API --> GW["Gateway :3001"]
    GW --> META[Meta Cloud API]
    META --> WA[WhatsApp delivered]
    WA --> RETAILER[Retailer phone]
```

---

## ORDER STATE MACHINE

```mermaid
stateDiagram-v2
    [*] --> DRAFT
    DRAFT --> PENDING_PAYMENT : Customer identified plus checkout
    PENDING_PAYMENT --> PAYMENT_VERIFYING : Digital payment selected
    PAYMENT_VERIFYING --> CONFIRMED : Payment verified
    PENDING_PAYMENT --> CONFIRMED : Cash payment
    PENDING_PAYMENT --> CANCELLED : Payment failed or timeout
    PAYMENT_VERIFYING --> CANCELLED : Verification failed or timeout
    
    CONFIRMED --> PROCESSING : Staff begins fulfillment
    PROCESSING --> DISPATCHED : Handed to delivery
    DISPATCHED --> DELIVERED : Customer received
    DELIVERED --> COMPLETED : Sale finalized
    
    DRAFT --> CANCELLED : Staff cancels
    PENDING_PAYMENT --> CANCELLED : Staff cancels
    PAYMENT_VERIFYING --> CANCELLED : Staff cancels
    CONFIRMED --> CANCELLED : Staff cancels stock restored
    PROCESSING --> CANCELLED : Staff cancels stock restored
    DISPATCHED --> CANCELLATION_REQUESTED : Customer requests
    CANCELLATION_REQUESTED --> CANCELLED : Approved
    
    CONFIRMED --> REFUND_REQUESTED : Staff requests refund
    DELIVERED --> REFUND_REQUESTED : Staff requests refund
    COMPLETED --> REFUND_REQUESTED : Staff requests refund
    REFUND_REQUESTED --> REFUND_APPROVED : Manager approves
    REFUND_REQUESTED --> REFUND_REJECTED : Manager rejects
    REFUND_APPROVED --> REFUND_PROCESSING : Processing refund
    REFUND_PROCESSING --> REFUNDED : Refund complete stock restored
    
    CONFIRMED --> REPLACEMENT_REQUESTED : Customer requests replacement
    DELIVERED --> REPLACEMENT_REQUESTED : Customer requests replacement
    COMPLETED --> REPLACEMENT_REQUESTED : Customer requests replacement
    REPLACEMENT_REQUESTED --> REPLACEMENT_APPROVED : Approved
    REPLACEMENT_APPROVED --> REPLACEMENT_SHIPPED : Shipped
    REPLACEMENT_SHIPPED --> REPLACEMENT_DELIVERED : Delivered
    
    CANCELLED --> [*]
    COMPLETED --> [*]
    REFUNDED --> [*]
    REFUND_REJECTED --> [*]
    REPLACEMENT_DELIVERED --> [*]
```

---

## PERMISSIONS MATRIX

```mermaid
graph TD
    subgraph CASHIER_ROLE[CASHIER]
        C1[Process sales]
        C2["View orders and inventory"]
        C3[Cancel orders]
        C4[Request refunds]
    end
    
    subgraph MANAGER_ROLE["MANAGER equals Cashier plus"]
        M1["Create and edit products"]
        M2[Adjust stock]
        M3["Scan bills and confirm drafts"]
        M4["Apply discounts and override prices"]
        M5[Create khata accounts]
        M6[Record khata payments]
        M7[Approve refunds]
        M8[Toggle marketplace visibility]
    end
    
    subgraph OWNER_ROLE["OWNER ADMIN equals Manager plus"]
        O1[Set credit limits]
        O2["Adjust balances and write-off"]
        O3["Freeze and unfreeze accounts"]
        O4[Override credit limit at checkout]
    end
    
    CASHIER_ROLE --> MANAGER_ROLE
    MANAGER_ROLE --> OWNER_ROLE
```

---

## SYSTEM DATA FLOW

```mermaid
graph TB
    subgraph CONSUMERS[Consumers]
        C1[Marketplace Browser]
        C2[WhatsApp Customer]
    end
    
    subgraph VENDOR[Vendor POS]
        POS[POS Terminal]
        ORD[Orders Page]
        PROD[Products Page]
        INV[Inventory Page]
        KHA[Khata Page]
    end
    
    subgraph BACKEND[Backend Services]
        API[Next.js API Routes]
        GW["WhatsApp Gateway :3001"]
        SUPA["Supabase Database"]
        STORE["Supabase Storage bill-photos"]
    end
    
    subgraph EXTERNAL[External Services]
        META[Meta Cloud API]
        GEMINI[Gemini Vision]
        PGTRGM[pg_trgm Fuzzy Match]
    end
    
    C1 --> |"Browse /shop/slug"| API
    C2 <--> |"Messages + OTP + Receipts"| META
    META <--> GW
    
    POS --> |"Checkout + Stock gate"| API
    POS --> |Payment OCR| GEMINI
    POS --> |Receipt send| GW
    
    ORD --> |CRUD orders| API
    PROD --> |CRUD products| API
    INV --> |Stock adjustments| API
    INV --> |Bill scan| GEMINI
    INV --> |Predictions| API
    KHA --> |Credit management| API
    
    API --> SUPA
    GW --> SUPA
    GW --> META
    API --> GEMINI
    API --> PGTRGM
    API --> STORE
    
    SUPA --> |Triggers| SUPA
    PGTRGM --> SUPA
```

---

## WHATSAPP MESSAGE FLOW — END TO END

```mermaid
sequenceDiagram
    participant C as Consumer Phone
    participant WA as WhatsApp
    participant GW as Gateway :3001
    participant GEM as Gemini Vision
    participant DB as Supabase
    participant ST as Store Staff POS

    Note over C,ST: 1. OTP LOGIN
    C->>WA: Open login page
    C->>GW: POST /api/send-otp
    GW->>WA: OTP delivered
    WA->>C: Your code is 482916
    C->>GW: POST /api/auth/whatsapp/verify
    GW-->>C: Session created

    Note over C,ST: 2. MARKETPLACE ORDER
    C->>WA: Click Order via WhatsApp on /shop/slug
    WA->>C: Opens chat with pre-filled message

    Note over C,ST: 3. WHATSAPP ORDERING
    C->>WA: Sends order message with items and store ref
    WA->>GW: POST /api/webhook
    GW->>GW: Parse message
    GW->>DB: Fuzzy match products
    GW->>DB: Create DRAFT order
    GW->>WA: Reply with matched and unmatched summary
    WA->>C: Order received

    Note over C,ST: 4. STAFF REVIEW
    ST->>DB: View WhatsApp orders in /pos/orders
    ST->>DB: Edit unmatched items
    ST->>DB: Confirm order

    Note over C,ST: 5. RECEIPT DELIVERY
    ST->>GW: POST /api/send-receipt
    GW->>WA: Receipt message
    WA->>C: Receipt from Store with Total amount

    Note over C,ST: 6. DELIVERY STATUS
    WA->>GW: POST /api/webhook status delivered
    GW->>DB: Update whatsapp_status to DELIVERED

    Note over C,ST: 7. CREDIT REMINDERS
    GW->>WA: POST /api/send-credit-alert
    WA->>C: Hi Name your balance is Nu. X

    Note over C,ST: 8. STOCK ALERTS
    GW->>WA: POST /api/send-stock-alert
    WA->>ST: Low Stock Product X equals 3 units
```
