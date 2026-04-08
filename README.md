# 📚 btGST-edgePOS - Complete SaaS Documentation

**Version**: 2.1  
**Last Updated**: 2026-04-08  
**Repository**: https://github.com/gstposbhutan/edgePOS  

---

## 🎯 Project Overview

**btGST-edgePOS** (Edge-Computing POS & Compliance Hub) is Bhutan's first AI-powered Point of Sale system designed specifically for the 2026 GST compliance framework. This revolutionary system combines:

- **🤖 Zero-Keyboard Interface**: 4K Vision AI for product recognition
- **📱 Face-ID Loyalty**: Privacy-first customer identification
- **💰 GST 2026 Compliance**: Built-in 5% flat rate with ITC tracking
- **📦 Multi-Tier Supply Chain**: Seamless Distributor → Wholesaler → Retailer integration
- **🚴 Taxi & Logistics**: Integrated "Bhutan Uber" for delivery services
- **🛒 Marketplace Platform**: Amazon-style local shopping with daily commissions

---

## 🏗️ System Architecture

### Core Philosophy: "Zero-Storage, Unified Identity"

The system operates on a decentralized model where:
- **Metadata** is centralized in Supabase (PostgreSQL)
- **Heavy Assets** (PDFs) are stored in user-owned Google Drives
- **Identity** is unified through Clerk authentication
- **Processing** happens at the edge (YOLO26 + Face-ID)

### The "Three-Pillar" Economy

```
┌─────────────────────────────────────────────────────────────┐
│                    btGST-edgePOS Ecosystem                    │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  🔷 MERCHANT PILLAR           🔷 TRANSPORT PILLAR          │
│  (edgePOS Terminal)            (Taxi & Logistics)             │
│  • AI Product Recognition       • Real-time Hailing            │
│  • Face-ID Customer Auth       • Inter-district Delivery      │
│  • GST Auto-Calculation        • Package Tracking            │
│  • WhatsApp Receipts           • Driver Verification         │
│                               │                                │
│  🔷 CONSUMER PILLAR            🔷 PLATFORM                   │
│  (Marketplace Portal)          (btGST Hub)                   │
│  • Online Shopping              • Split-Payment Engine        │
│  • Home Delivery               • Commission Revenue          │
│  • Daily Deals                 • RMA Integration             │
└─────────────────────────────────────────────────────────────┘
```

---

## 🚀 Getting Started

### Prerequisites

- Node.js 18+ 
- npm or yarn package manager
- Supabase account
- Clerk account
- Google Cloud Console access

### Installation

```bash
# Clone the repository
git clone https://github.com/gstposbhutan/edgePOS.git
cd edgePOS

# Install dependencies
npm install

# Run development server
npm run dev
```

The POS terminal will be available at: http://localhost:3000

---

## 🔧 Technical Stack

### Frontend
- **Framework**: Next.js 16 (App Router)
- **UI Library**: React 19
- **Language**: JavaScript (JSX) with JSDoc
- **Styling**: Tailwind CSS v4 + Shadcn/UI (Nova Style)
- **Icons**: Lucide React

### Backend & Data
- **Authentication**: Clerk (OAuth 2.0 + Google Drive)
- **Database**: Supabase (PostgreSQL + pgvector)
- **Vector Search**: pgvector for Face-ID embeddings
- **Storage**: User-owned Google Drive (drive.file scope)
- **Offline**: PouchDB + IndexedDB with LWW conflict resolution

### AI & Vision
- **Product Recognition**: YOLO26 ONNX (Edge-native)
- **Face Embeddings**: MobileNet-V3 (512-d vectors)
- **Payment OCR**: Gemini 1.5 Flash Vision (Fallback)
- **WebGPU**: Hardware acceleration for 4K processing

### Integrations
- **WhatsApp**: Meta Cloud API (btGST Official Bot)
- **Payments**: mBoB/mPay APIs with RMA DPG split-payment
- **Maps**: Mapbox GL JS (Custom Bhutan terrain)
- **Storage**: Google Drive API v3

---

## 💡 Key Features

### 🤖 AI-Powered Product Recognition
- **Zero-Keyboard**: Scan products with 4K camera
- **YOLO26 Engine**: Real-time detection with <100ms latency
- **WebGPU Acceleration**: GPU → WASM → CPU fallback
- **95%+ Accuracy**: Trained on Bhutanese products

### 👤 Face-ID Customer Identification
- **Privacy-First**: 512-d vectors (not photos)
- **Opt-In Consent**: QR code consent flow
- **WhatsApp Linking**: Automatic receipt delivery
- **GDPR Compliant**: Customer data deletion

### 💰 GST 2026 Compliance
- **5% Flat Rate**: Automatic calculation
- **ITC Tracking**: Input Tax Credit for B2B
- **Digital Signatures**: SHA-256 invoice authentication
- **Government Reports**: One-click GST filing

### 🚴 Taxi & Logistics Portal
- **Real-Time Hailing**: Mapbox-based live tracking
- **Face-ID Drivers**: Verified PDL holders only
- **Inter-District**: Pre-book early morning pickups
- **Package Delivery**: Same-day logistics integration

### 🛒 Marketplace Platform
- **Unified Catalog**: All stores in one place
- **Split-Payment**: RMA DPG automated distribution
- **Stock Buffer**: Safety buffer for walk-in/online conflicts
- **Daily Commissions**: 5% on products + 10% on delivery

### 📱 Ghost Mode (Offline-First)
- **Never Freezes**: Local inference when internet drops
- **PouchDB Sync**: Automatic sync when connection restores
- **LWW Resolution**: Last Write Wins conflict strategy
- **100% Uptime**: Critical for rural Bhutan

---

## 📊 Revenue Model

### Fixed Revenue
- **300 Stores** × **Nu. 12,000/year** = **Nu. 3,600,000/year**

### Variable Revenue
- **Marketplace**: 5% commission on all product sales
- **Taxi Bookings**: 10% platform fee on delivery
- **Daily Income**: Generated via RMA DPG split-payment

### Growth Potential
- **Exclusive Delivery**: Become primary delivery partner for all stores
- **Network Effects**: More stores = more taxi demand
- **Data Monetization**: Analytics and insights for merchants

---

## 🔒 Security & Privacy

### Google Drive "Sandbox"
- **Scoped Access**: `drive.file` only (app cannot see personal files)
- **Proxy Links**: All PDFs served via `https://btgst.bt/v/{short_code}`
- **Secure Sharing**: `role: reader` + `type: anyone` for receipts

### Face-ID Privacy
- **No Photos**: Store 512-dimensional numerical vectors only
- **Ecosystem Bound**: Vectors useless outside btGST-edgePOS
- **Consent Required**: Hard-block opt-in modal per phone number
- **GDPR Compliance**: Customer-requested deletion within 24 hours

### Transaction Security
- **Digital Signatures**: SHA-256 hash of order_id + amount + timestamp
- **Idempotency**: Prevents double-charging on retry
- **Encryption**: All data encrypted at rest and in transit
- **Audit Trail**: Complete compliance logging

---

## 📱 Responsive Design

Optimized for all devices:
- **4K Desktop**: Full POS interface with dual camera streams
- **Tablet**: Touch-optimized layout with slide-up cart drawer
- **Mobile**: Lite mode for budget Android devices (rural Bhutan)

---

## 🤝 Contributing

This is an active development project for Bhutan's 2026 GST compliance initiative.

**Repository**: https://github.com/gstposbhutan/edgePOS  
**Organization**: GST POS Bhutan  

For collaboration inquiries, please visit our GitHub repository.

---

## 📄 License

Proprietary - Copyright © 2026 btGST-edgePOS

---

## 🙏 Acknowledgments

- Royal Bhutanese design inspiration
- YOLO26 computer vision model
- Clerk authentication platform
- Supabase database infrastructure
- Shadcn/UI component foundation
- Mapbox mapping services

---

## 📞 Support

For technical support or questions:
- **GitHub Issues**: https://github.com/gstposbhutan/edgePOS/issues
- **Documentation**: See `/docs` folder for detailed technical specs
- **Development Plan**: See `/docs/DEV_PLAN.md` for implementation roadmap

---

**Built with ❤️ for Bhutan's Digital Transformation and GST 2026 Compliance**
