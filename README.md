# 🎬 MidiaKit Digital — DOOH Media Kit Platform

**Full-stack application for Digital Out-of-Home (DOOH) advertising** — Manage display locations (elevadores, escaleras, points), plan campaigns, analyze surrounding demographics, and generate professional quotations.

[![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?logo=node.js)](https://nodejs.org)
[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react)](https://react.dev)
[![SQLite](https://img.shields.io/badge/SQLite-3-003B57?logo=sqlite)](https://www.sqlite.org)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind%20CSS-3-38B2AC?logo=tailwindcss)](https://tailwindcss.com)

---

## 📋 Quick Overview

| Aspect | Details |
|--------|---------|
| **Purpose** | Manage DOOH advertising points, plan strategic campaigns, analyze geo-demographics, generate & approve quotations |
| **Users** | Vendedores (sales) → Gerentes Comerciais (managers) → Admin (approval) |
| **Database** | SQLite with async job queue for background analysis |
| **Deployment** | VPS (PM2) or cPanel Shared Hosting (Phusion Passenger) |
| **Development** | React 18 + Vite frontend, Node.js/Express backend |

---

## ✨ Core Features

- 🗺️ **Interactive Point Management** — Browse, create, manage DOOH locations
- 📍 **Geo-Intelligence (Entorno)** — Analyze surrounding businesses by segment
- 🎯 **Campaign Planning** — Strategic zones with scoring & recommendations
- 💰 **Proposal Builder** — Generate quotations with discount policies
- 🎨 **Media Simulation** — Preview screens with effects & focal points
- 📊 **Dashboard Analytics** — Real-time metrics on points, flow, investment
- 🔒 **Multi-level Access** — Admin / Gerente Comercial / Vendedor roles
- 📄 **PDF Export** — Professional media kits with customizable branding
- ✅ **Approval Workflows** — Auto-route proposals by discount thresholds
- 🔄 **Auto-Refresh** — Background job queue for periodic updates

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|------------|
| **Backend** | Node.js 18+ • Express • SQLite • Multer • Compression |
| **Frontend** | React 18 • Vite • Tailwind CSS • Framer Motion • Leaflet |
| **Database** | SQLite WAL mode • async job queue for Entorno analysis |
| **PDF Export** | PDFKit + custom templates for media kits |
| **Authentication** | Username/Email + Password • request-based (vendedor/gerente/admin) |
| **Geolocation** | OpenStreetMap (primary) / Google Places / Foursquare (fallbacks) |
| **File Storage** | Local disk (uploads/) — suitable for shared hosting |

---

## 📂 Project Structure

```
midiakitdigital/
├── backend/
│   ├── server.js                  # Express app • Passenger-compatible
│   ├── passenger_app.js           # Phusion Passenger entry (cPanel)
│   ├── database.js                # SQLite schema & migrations
│   ├── auth.js                    # User authentication & roles
│   ├── license.js                 # Remote license verification
│   ├── backupService.js           # Automated SQLite backups
│   ├── pdfService.js              # PDF generation engine
│   ├── entornoAnalysis.js         # Geo-intelligence & job queue
│   ├── routes/
│   │   └── cidadeFotos.js         # City photos endpoint
│   ├── services/
│   │   └── pdfCacheService.js     # PDF cache management
│   ├── uploads/                   # Point images (served via /uploads)
│   ├── backups/                   # SQLite backup snapshots
│   ├── .env.example               # Environment template
│   ├── DEPLOY.md                  # cPanel/Passenger setup guide
│   └── package.json
│
├── frontend/
│   ├── src/
│   │   ├── App.jsx                # Root component & routing
│   │   ├── main.jsx               # Vite entry point
│   │   ├── pages/
│   │   │   ├── Landing.jsx        # Public landing page
│   │   │   ├── Explorer.jsx       # Point browser & proposal tool
│   │   │   └── Admin.jsx          # Admin dashboard (points, users, analysis)
│   │   ├── components/
│   │   │   ├── Navbar.jsx         # Top navigation
│   │   │   ├── PointCard.jsx      # Grid card preview
│   │   │   ├── PointModal.jsx     # Detail drawer + simulation
│   │   │   ├── MapView.jsx        # Leaflet map
│   │   │   ├── FilterSidebar.jsx  # Search filters
│   │   │   ├── CampaignMetrics.jsx
│   │   │   ├── CampaignScore.jsx
│   │   │   ├── StrategicPlanner.jsx
│   │   │   ├── ProposalBuilder.jsx
│   │   │   ├── PresentationMode.jsx
│   │   │   ├── ImpactSimulator.jsx
│   │   │   ├── RecommendationEngine.jsx
│   │   │   ├── admin/
│   │   │   │   ├── ScreenAreaEditor.jsx
│   │   │   │   ├── PdfCalibrationPanel.jsx
│   │   │   │   ├── FocalPointSelector.jsx
│   │   │   │   ├── UserModal.jsx
│   │   │   │   └── CidadeFotosAdmin.jsx
│   │   │   └── ...
│   │   ├── lib/
│   │   │   ├── api.js             # API client wrapper (20+ functions)
│   │   │   ├── proposal.js        # Proposal pricing & discounts
│   │   │   ├── simulation.js      # Screen display simulation
│   │   │   ├── strategy.js        # Campaign scoring & zones
│   │   │   ├── geo.js             # Geolocation utilities
│   │   │   ├── ibge.js            # IBGE data integration
│   │   │   ├── pointImages.js     # Image processing
│   │   │   ├── midiaKitPdf.js     # PDF generation (frontend)
│   │   │   └── technicalInfoPdf.js
│   │   ├── services/
│   │   │   └── ibgeService.js
│   │   └── context/
│   │       └── FavoritesContext.jsx
│   ├── package.json
│   ├── vite.config.js
│   ├── tailwind.config.js
│   └── public/
│       └── patterns/
│
├── docs/
│   ├── PLANNER_DADOS.md          # Audience tags, availability, optimization
│   └── DESIGN.md                 # Design system, colors, typography
│
├── ecosystem.config.js            # PM2 config for VPS deployment
├── DEPLOY.md                      # Deployment guide (cPanel + VPS)
└── PROJECT_STRUCTURE.md           # Detailed structure reference
```

---

## 🚀 Installation

### Prerequisites

- **Node.js 18+** and **npm**
- **Git**

### Setup

```bash
# Clone repository
git clone https://github.com/mmaak47/midiakitdigital.git
cd midiakitdigital

# Backend
cd backend
npm install --production
cp .env.example .env
# Edit .env with your settings
cd ..

# Frontend
cd frontend
npm install
cd ..
```

---

## ⚡ Quick Start

### Development

```bash
# Terminal 1: Backend (auto-reload)
cd backend
npm run dev

# Terminal 2: Frontend (Vite HMR)
cd frontend
npm run dev
```

Visit: `http://localhost:5173`

### Production

```bash
# Build frontend
cd frontend && npm run build

# Start backend
cd backend && NODE_ENV=production npm start
```

Backend runs on port `3002` (or `$PORT` if provided)

---

## 📡 32 API Endpoints

**Base URL:** `/api`

### Points Management (7 endpoints)
- `GET /pontos` — List with filters
- `GET /pontos/:id` — Get one point
- `POST /pontos` — Create (multipart with image)
- `PUT /pontos/:id` — Update
- `DELETE /pontos/:id` — Soft delete

### Authentication (1)
- `POST /auth/login` — User login

### Geo-Intelligence / Entorno (8)
- `GET /entorno/categories` — Segment categories & radius
- `POST /entorno/analyze` — Queue analysis job
- `GET /entorno/jobs` — List jobs
- `GET /entorno/jobs/:id` — Job status
- `GET /entorno/auto` — Scheduler config
- `POST /entorno/auto/run-now` — Trigger refresh
- `GET /entorno/scores` — Cached scores
- `POST /entorno/client-address` — Geocode & rank

### Admin (11)
- `GET /admin/pontos` — All points (incl. inactive)
- `GET /admin/users` — List users
- `POST /admin/users` — Create user
- `PUT /admin/users/:id` — Update user role
- `DELETE /admin/users/:id` — Delete user
- `GET /admin/settings` — Get settings
- `PUT /admin/settings` — Update settings
- `GET /admin/pdf-layout` — PDF overrides
- `PUT /admin/pdf-layout` — Update PDF layout
- `POST /admin/export-data` — Export to PDF

### Proposals (5)
- `GET /propostas` — List (filtered by role)
- `GET /propostas/:id` — Get proposal
- `POST /propostas` — Create with pricing
- `PUT /propostas/:id` — Update
- `DELETE /propostas/:id` — Delete

---

## 🧩 Frontend Components Summary

### Pages (3)
- **Landing** (`/`) — Public homepage
- **Explorer** (`/comercial/explorar`) — Main tool for browsing & proposals
- **Admin** (`/comercial/admin`) — Admin dashboard

### Core Components (20+)
**Display:** Navbar • PointCard • PointModal • MapView • FilterSidebar  
**Campaign:** CampaignMetrics • CampaignScore • StrategicPlanner • RecommendationEngine  
**Proposals:** ProposalBuilder • ProposalModal • PresentationMode  
**Simulation:** ImpactSimulator • SmartMap  
**Admin:** UserModal • ScreenAreaEditor • PdfCalibrationPanel • FocalPointSelector • CidadeFotosAdmin

### Frontend Libraries (8 modules)
- `api.js` — 20+ API wrapper functions
- `proposal.js` — Pricing & discount calculation
- `simulation.js` — Screen display effects
- `strategy.js` — Campaign scoring & zones
- `geo.js` • `ibge.js` • `pointImages.js` • `technicalInfoPdf.js`

---

## 🗄️ Database (6 Tables)

| Table | Purpose | Key Fields |
|-------|---------|-----------|
| **pontos** | Display locations | id, nome, cidade, tipo, lat, lng, preco, fluxo, arte_* |
| **admin_users** | Team members | id, username, email, role (admin/gerente/vendedor) |
| **entorno_cache** | Geo analysis results | ponto_id, segmento, raio_m, score_relevancia, expires_at |
| **entorno_jobs** | Async job queue | id, segmento, radius, status, processed_points |
| **propostas** | Quotations | id, usuario_id, pontos_json, valor_total_*, status |
| **app_settings** | Config key-value | key, value |

---

## 🔐 Environment Variables

Create `.env` in `backend/`:

```env
NODE_ENV=production
FRONTEND_ORIGINS=https://yourdomain.com
LICENSE_URL=https://...
LICENSE_CLIENT=your-client-id
SQLITE_BACKUP_ENABLED=true
ENTORNO_AUTO_REFRESH_ENABLED=false
```

See [backend/.env.example](backend/.env.example) for all options.

---

## 🌐 Deployment

### VPS (PM2)
```bash
npm install --production
pm2 start ecosystem.config.js
pm2 save && pm2 startup
```

### cPanel Shared Hosting (Phusion Passenger)
See [backend/DEPLOY.md](backend/DEPLOY.md):
1. Upload via FTP
2. Run `npm install --production`
3. Register in cPanel → Startup File: `passenger_app.js`
4. Set env vars in cPanel
5. Restart app

---

## 🏗️ Strategic Zones

- **Premium** — High-value central locations
- **Alto-Fluxo** — High foot traffic areas
- **Comercial** — Commercial/B2B zones

---

## 📊 Business Segments

Clinica • Hospital • Educacao • Escola • Faculdade • Automotivo • Varejo • Restaurante • Imobiliaria • Construtora • Contabilidade • Advocacia • Industria

---

## 📚 Additional Documentation

- **DESIGN.md** — Design system, colors, typography
- **PLANNER_DADOS.md** — Audience tags, availability, optimization
- **PROJECT_STRUCTURE.md** — Detailed API reference & schema
- **DEPLOY.md** — Deployment guide for cPanel & VPS

---

## 👥 Roles & Permissions

| Role | Permissions |
|------|-------------|
| **Admin** | All operations, approve discounts > 50%, manage users |
| **Gerente Comercial** | Create/edit proposals, approve discounts 20-50% |
| **Vendedor** | Browse points, create proposals (requires approval if discount > 20%) |

---

## 🔧 Development

### Backend Dev
```bash
cd backend && npm run dev    # Auto-reload on file changes
```

### Frontend Dev
```bash
cd frontend && npm run dev   # Vite HMR enabled
```

### Build
```bash
cd frontend && npm run build  # Output: dist/
```

---

## 📞 Support & Contributing

- **Issues:** [GitHub Issues](https://github.com/mmaak47/midiakitdigital/issues)
- **Contact:** Intermidia Digital Team
- **License:** Proprietary

---

## 👨‍💻 Developed by

**Maitê Doin** — Lead Developer  
**Intermidia Digital** — 2024-2026

---

**Last Updated:** March 30, 2026  
**Version:** 1.0.0  
**Status:** Production Ready
