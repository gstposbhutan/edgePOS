# NEXUS BHUTAN: 4K Edge-AI POS System

Local-First AI POS & Multi-Tier Supply Chain Ecosystem for Bhutan 2026 GST Compliance.

## 🏔️ Overview

NEXUS BHUTAN is a sophisticated Point of Sale system designed specifically for Bhutan's retail ecosystem, featuring:

- **4K Vision AI**: YOLO26-powered product recognition with zero keyboard interface
- **GST 2026 Compliance**: 5% flat rate with Input Tax Credit (ITC) tracking
- **Offline-First**: PouchDB + IndexedDB for uninterrupted operations in rural areas
- **WhatsApp Integration**: Automated PDF receipts and supply chain notifications
- **Multi-Tier Supply Chain**: Seamless integration between Distributors → Wholesalers → Retailers

## 🚀 Tech Stack

- **Frontend**: Next.js 15 with TypeScript, App Router, and Tailwind CSS
- **UI Components**: Shadcn/UI with Royal Bhutan design tokens
- **Database**: Supabase (PostgreSQL) with pgvector for AI embeddings
- **Offline Storage**: PouchDB with incremental sync
- **AI/ML**: YOLO26 ONNX runtime + MobileNet-V3 for local inference
- **State Management**: Zustand for cart and transaction handling
- **Authentication**: Row-Level Security (RLS) for multi-tenant isolation

## 🎯 Key Features

### Vision AI Pipeline
- **4K Camera Processing**: WebGPU-accelerated inference with adaptive fallback
- **Product Recognition**: Two-stage YOLO + MobileNet pipeline for 99.9% accuracy
- **Face-ID Loyalty**: Privacy-first customer recognition with encrypted embeddings

### GST Compliance
- **Automated Calculations**: 5% flat rate with precise ITC tracking
- **Digital Signatures**: SHA-256 hash-based invoice authentication
- **Government Integration**: One-click GST report generation for Ministry of Finance

### Supply Chain Management
- **Credit Limit Enforcement**: Automated checks to prevent overspending
- **Inventory Tracking**: Movement history with theft detection
- **Predictive Restocking**: ML-based forecasting at 15% stock threshold

## 🛠️ Getting Started

### Prerequisites
- Node.js 18+ 
- npm or yarn package manager
- Supabase account (for database backend)

### Installation

```bash
# Clone the repository
git clone https://github.com/gstposbhutan/edgePOS.git
cd edgePOS/pos-terminal

# Install dependencies
npm install

# Run development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the application.

## 📱 Responsive Design

The system is optimized for:
- **4K Desktop Displays**: Full POS interface with camera canvas and product grid
- **Tablet Devices**: Touch-optimized layout with slide-up cart drawer
- **Mobile Phones**: Lite mode for budget Android devices common in rural Bhutan

## 🔒 Security & Compliance

- **Data Isolation**: Row-Level Security ensures tenant privacy
- **Audit Trails**: Comprehensive logging for compliance and fraud detection
- **Payment Verification**: Integration with mBoB/mPay banking APIs
- **Data Residency**: Encryption at rest and in transit per Bhutanese regulations

## 🌐 Offline Capabilities

- **Local Processing**: All AI inference runs on-device
- **Offline Transactions**: Queue and sync when connectivity restores
- **Conflict Resolution**: Operational transformation for simultaneous edits
- **Low-Bandwidth Mode**: Optimized for 2G connections

## 🎨 Design System

**Royal Bhutan Theme**:
- Primary Background: `#0F172A` (Obsidian Deep Slate)
- Primary Accent: `#D4AF37` (Royal Bhutan Gold)
- Secondary Accent: `#10B981` (Emerald Green)
- System Danger: `#EF4444` (Tibetan Red)

## 📊 Architecture

This monorepo uses Turborepo for efficient code sharing:

```
/nexus-bhutan
├── /apps
│   ├── /pos-terminal      # Main POS application (this directory)
│   ├── /admin-hub         # SaaS management dashboard
│   └── /marketplace       # Consumer ordering portal
├── /packages
│   ├── /database          # Shared schemas and migrations
│   ├── /ai-core           # YOLO26 models and vision utilities
│   ├── /accounting        # GST calculation engine
│   └── /ui                # Royal Bhutan design system
```

## 🤝 Contributing

This is an active development project for Bhutan's 2026 GST compliance initiative.

**Repository**: https://github.com/gstposbhutan/edgePOS  
**Organization**: GST POS Bhutan  

## 📄 License

Proprietary - Copyright © 2026 btGST-edgePOS

## 🙏 Acknowledgments

- Royal Bhutanese design inspiration
- YOLO26 computer vision model
- Supabase for database infrastructure
- Shadcn/UI for component foundation

---

**Built with for Bhutan's Digital Transformation**