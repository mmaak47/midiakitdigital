# MidiaKit Digital - Project Structure Overview

**Last Updated:** March 30, 2026  
**Project Type:** Full-stack DOOH (Digital Out-of-Home) Media Kit Platform

---

## 1. BACKEND API ENDPOINTS

### Base URL: `/api`

#### **Points/Locations Management**

| Method | Path | Description |
|--------|------|-------------|
| GET | `/pontos` | List all active points with optional filters (cidade, tipo, publico, search) |
| GET | `/pontos/:id` | Retrieve single point details |
| GET | `/publicos` | Get distinct audience types (A, B, A/B) |
| GET | `/stats` | Get dashboard stats (total points, cities, screens, total flow) |
| POST | `/pontos` | Create new point (supports image upload) |
| PUT | `/pontos/:id` | Update point details and images |
| DELETE | `/pontos/:id` | Soft delete point (sets ativo=0) |

#### **Authentication**

| Method | Path | Description |
|--------|------|-------------|
| POST | `/auth/login` | Admin login (username/email + password) |

#### **Surrounding/Entorno Analysis** (Geo-intelligence)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/entorno/categories` | Get segment categories and default radius |
| POST | `/entorno/analyze` | Queue async entorno analysis job |
| GET | `/entorno/jobs/:id` | Get specific job status |
| GET | `/entorno/jobs` | List recent jobs with filters |
| GET | `/entorno/auto` | Get auto-refresh scheduler config & state |
| POST | `/entorno/auto/run-now` | Trigger immediate auto-refresh cycle |
| GET | `/entorno/scores` | Get cached entorno scores and coverage info |
| POST | `/entorno/client-address` | Geocode client address and rank nearby points by distance |

#### **Admin Management**

| Method | Path | Description |
|--------|------|-------------|
| GET | `/admin/pontos` | List all points (including inactive) |
| GET | `/admin/users` | List all admin users |
| POST | `/admin/users` | Create new admin user |
| DELETE | `/admin/users/:id` | Delete admin user (prevent if last user) |
| PUT | `/admin/users/:id` | Update user role (admin, gerente_comercial, vendedor) |
| GET | `/admin/pdf-layout` | Get PDF layout overrides settings |
| GET | `/admin/settings` | Get all app settings |
| PUT | `/admin/settings` | Update specific settings (e.g., lucro_minimo_percentual) |

#### **Proposals/Quotations**

| Method | Path | Description |
|--------|------|-------------|
| GET | `/propostas` | List proposals (filtered by user role) |
| GET | `/propostas/:id` | Get specific proposal with point details |
| POST | `/propostas` | Create new proposal with discount calculation |
| PUT | `/propostas/:id` | Update proposal (recalculates approval requirements) |
| DELETE | `/propostas/:id` | Delete proposal |

---

## 2. BACKEND SERVICES & FUNCTIONS

### **database.js** - SQLite Database Layer
**Location:** [backend/database.js](backend/database.js)

**Main Tables:**
1. **pontos** - Display locations/screens
   - Core fields: nome, cidade, tipo, endereco, lat, lng, fluxo, insercoes
   - Display config: tempo, loop, veiculacao, publico, telas
   - Pricing: preco, custo_operacional
   - Media: imagem, imagem2, arte_largura, arte_altura, imagem_foco_*
   - Simulation: simulacao_tela, simulacao_arte, simulacao_preview
   - Status: ativo (1/0)

2. **admin_users** - Admin/sales team access
   - Fields: first_name, last_name, username, email, whatsapp, password, role
   - Roles: admin, gerente_comercial, vendedor

3. **entorno_cache** - Geographical analysis results
   - Stores nearby business locations by segment, radius, city
   - Fields: ponto_id, latitude, longitude, segmento_analisado, raio_m
   - Results: total_estabelecimentos_relacionados, categorias_encontradas, score_relevancia
   - TTL: 72 hours (configurable)

4. **entorno_jobs** - Async job queue for analysis
   - Tracks segment analysis job status: queued, running, completed, failed
   - Fields: segmento_analisado, raio_m, cidade, status, progress, timestamps

5. **propostas** - Commercial quotations
   - Fields: usuario_id, titulo, descricao, pontos_json, desconto_percentual, desconto_tipo
   - Pricing: valor_total_original, valor_total_desconto, valor_total_final
   - Approval: status (rascunho/enviado/aprovado/rejeitado), requer_aprovacao

6. **app_settings** - Configuration key-value store
   - Examples: lucro_minimo_percentual, pdf_layout_overrides

### **entornoAnalysis.js** - Geo-Intelligence & Surrounding Analysis
**Location:** [backend/entornoAnalysis.js](backend/entornoAnalysis.js)

**Key Functions:**
- `getSegmentCategories(segment)` - Get business categories for segment (clinica, hospital, restaurant, etc)
- `normalizeSegment(segment)` - Standardize segment names
- `normalizeRadius(value)` - Clamp radius to 200-2000 meters
- `geocodeAddress(address)` - Convert address to coordinates via Nominatim
- `enqueueJob(options)` - Queue analysis job for segment/radius/city
- `getJob(jobId)` - Get job status
- `listJobs(filters)` - List recent jobs with status filters
- `getScoresWithCoverage()` - Get cached metrics for points
- `invalidatePointCache(pointId)` - Clear cache when point location changes
- `getProviderRuntimeInfo()` - Check available data providers (Google, Foursquare, OSM)
- `startAutoRefreshScheduler()` - Initialize background refresh for configured segments
- `getAutoRefreshConfig()` - Get auto-refresh settings
- `getAutoRefreshState()` - Get last execution timestamp and status
- `runAutoRefreshCycle()` - Manually trigger auto-refresh

**Segment Categories:** clinica, hospital, educacao, escola, faculdade, automotivo, varejo, restaurante, imobiliaria, construtora, contabilidade, advocacia, industria, outro

**Data Providers:**
- OpenStreetMap (OSM) - Primary (free)
- Google Places API - Fallback 1
- Foursquare Places API - Fallback 2

### **backupService.js** - Database Backups
**Location:** [backend/backupService.js](backend/backupService.js)

**Key Functions:**
- `createBackupScheduler(db, options)` - Initialize scheduled backups
  - Default interval: 360 minutes (6 hours)
  - Retention: 14 days
  - Uses WAL checkpoint before backup
  - Auto-cleanup old backups

**Output:** SQLite snapshots in `backend/backups/` directory

---

## 3. FRONTEND COMPONENTS

**Location:** [frontend/src/components/](frontend/src/components/)

### **Core Display Components**

| Component | Purpose |
|-----------|---------|
| [Navbar.jsx](frontend/src/components/Navbar.jsx) | Top navigation bar with theme toggle, login/logout, mobile menu |
| [PointCard.jsx](frontend/src/components/PointCard.jsx) | Grid card displaying single point with image, metrics, action buttons |
| [PointModal.jsx](frontend/src/components/PointModal.jsx) | Detail modal for point with full specs, simulation preview, focus controls |
| [MapView.jsx](frontend/src/components/MapView.jsx) | Leaflet interactive map showing point locations, selectable on click |

### **Search & Filtering**

| Component | Purpose |
|-----------|---------|
| [FilterSidebar.jsx](frontend/src/components/FilterSidebar.jsx) | Sidebar filters: city, tipo (display type), publico, search text |
| [CustomSelect.jsx](frontend/src/components/CustomSelect.jsx) | Custom multi-select dropdown component |

### **Favorites & History**

| Component | Purpose |
|-----------|---------|
| [FavoritesBar.jsx](frontend/src/components/FavoritesBar.jsx) | Display saved favorite points with quick access |

### **Campaign Analysis & Strategy**

| Component | Purpose |
|-----------|---------|
| [CampaignMetrics.jsx](frontend/src/components/CampaignMetrics.jsx) | Display totals: total cost, screens, daily flow, insertion count |
| [CampaignScore.jsx](frontend/src/components/CampaignScore.jsx) | Show strategic alignment score for selected points |
| [CoverageMeter.jsx](frontend/src/components/CoverageMeter.jsx) | Visual gauge showing coverage percentage of coverage_level |
| [RecommendationEngine.jsx](frontend/src/components/RecommendationEngine.jsx) | Show historical combos and suggest popular point combinations |
| [StrategicPlanner.jsx](frontend/src/components/StrategicPlanner.jsx) | Strategic zone selector (Premium, Alto-Fluxo, Comercial) with recommendations |

### **Simulation & Visualization**

| Component | Purpose |
|-----------|---------|
| [ImpactSimulator.jsx](frontend/src/components/ImpactSimulator.jsx) | Simulate screen display settings and LED effects on mock media |
| [SmartMap.jsx](frontend/src/components/SmartMap.jsx) | Enhanced map with strategic zones, point clusters, interaction |

### **Proposals & Quotes**

| Component | Purpose |
|-----------|---------|
| [ProposalBuilder.jsx](frontend/src/components/ProposalBuilder.jsx) | Review proposal summary, point table, pricing, discount application |
| [ProposalModal.jsx](frontend/src/components/ProposalModal.jsx) | Create/edit proposal modal with client info, discount config, PDF export |
| [PresentationMode.jsx](frontend/src/components/PresentationMode.jsx) | Full-screen presentation mode showing maps, metrics, geo-analysis for each point |
| [QuickPresentationMode.jsx](frontend/src/components/QuickPresentationMode.jsx) | Simplified presentation view for quick demos |

### **Surrounding/Entorno Analysis**

| Component | Purpose |
|-----------|---------|
| [AutoArgumentGenerator.jsx](frontend/src/components/AutoArgumentGenerator.jsx) | Display auto-generated arguments for campaign based on segment analysis |

### **Loading States**

| Component | Purpose |
|-----------|---------|
| [SkeletonCard.jsx](frontend/src/components/SkeletonCard.jsx) | Loading placeholder for point cards |

### **Admin Components** (subfolder: [frontend/src/components/admin/](frontend/src/components/admin/))

| Component | Purpose |
|-----------|---------|
| [ScreenAreaEditor.jsx](frontend/src/components/admin/ScreenAreaEditor.jsx) | Editor for point image focus zone (corners & zoom level) |
| [PdfCalibrationPanel.jsx](frontend/src/components/admin/PdfCalibrationPanel.jsx) | Calibration controls for PDF export layout |
| [PdfCalibrationPreview.jsx](frontend/src/components/admin/PdfCalibrationPreview.jsx) | Live preview of PDF calibration changes |
| [FocalPointSelector.jsx](frontend/src/components/admin/FocalPointSelector.jsx) | Visual selector for image focal point (X%, Y%) and zoom |
| [CidadeFotosAdmin.jsx](frontend/src/components/admin/CidadeFotosAdmin.jsx) | Admin panel for city photo/image management |
| [UserModal.jsx](frontend/src/components/admin/UserModal.jsx) | Modal for creating/editing admin users |

---

## 4. FRONTEND PAGES

**Location:** [frontend/src/pages/](frontend/src/pages/)

| Page | Route | Purpose |
|------|-------|---------|
| [Landing.jsx](frontend/src/pages/Landing.jsx) | `/` | Public landing page with stats, testimonials, point gallery |
| [Explorer.jsx](frontend/src/pages/Explorer.jsx) | `/comercial/explorar` | Main commercial tool - browse points, manage favorites, build proposals, view metrics |
| [Admin.jsx](frontend/src/pages/Admin.jsx) | `/comercial/admin` | Admin dashboard with tabs for managing points, entorno analysis, users, settings |

---

## 5. FRONTEND UTILITIES & LIBRARIES

**Location:** [frontend/src/lib/](frontend/src/lib/)

### **api.js** - API Client Wrapper
**Functions:**
- `fetchPontos(filters)` - Get filtered points
- `fetchPonto(id)` - Get single point
- `fetchStats()` - Get dashboard stats
- `fetchPublicos()` - Get audience types
- `login(username, password)` - Authenticate
- `fetchAdminPontos()` - Get all points (admin)
- `fetchAdminUsers()` - Get users (admin)
- `createAdminUser(userData)` - New user
- `deleteAdminUser(id)` - Delete user
- `updateAdminUserRole(id, role)` - Change user role
- `createPonto(formData)` - Create point with image uploads
- `updatePonto(id, formData)` - Update point
- `deletePonto(id)` - Delete point
- `fetchEntornoCategories(segment)` - Get geo-intelligence categories
- `fetchEntornoJobs()` - List analysis jobs
- `fetchEntornoJobStatus(jobId)` - Check job progress
- `requestEntornoAnalysis(segment, radius, city)` - Queue analysis
- `getConfiguredEntornoScores(segment, radius, city, force)` - Get cached geo results
- `fetchAdminSettings()` - Get settings
- `updateAdminSettings(settings)` - Update settings
- `fetchAdminPdfLayout()` - Get PDF overrides
- `saveAdminPdfLayout(overrides)` - Update PDF settings
- `resetAdminPdfLayout()` - Reset PDF to defaults
- `createProposal(data)` - Create proposal
- `updateProposal(id, data)` - Update proposal
- `deleteProposal(id)` - Delete proposal
- `fetchProposals(filters)` - List proposals
- `fetchProposal(id)` - Get proposal details

### **proposal.js** - Proposal Building & Pricing
**Key Functions:**
- `buildProposalPricing(points, discountConfig)` - Calculate pricing with discount modes
  - Modes: none, total (all points), specific (selected points), individual (per-point)
  - Returns: original total, discount amount, final total, applied points count
- `buildProposalImagePrompt(...)` - Generate AI prompt for artwork
  - Inputs: clientName, cities, audience types, segment, dimensions, points
  - Output: Formatted prompt for image generation

### **simulation.js** - Screen Display Simulation
**Constants:**
- `defaultSelectionCorners` - Default quad corners (28%, 72%, etc)
- `defaultDisplaySettings` - Default LED/screen effects
  - opacity, brightness, reflection, spill, ledPixelIntensity, ledPixelSize, glare

**Key Functions:**
- `normalizePoint(point, fallback)` - Clamp point to 0-100 range
- `normalizeCorners(corners)` - Validate & normalize quad corners
- `normalizeDisplaySettings(input)` - Clamp display effects to ranges
- `buildDefaultQuadAt(x, y)` - Create quad at position
- `parseScreen(simulacaoTela)` - Parse simulation config string
- `serializeSimulationConfig(config)` - Convert to storage format
- `getSelectionBoundsRaw(corners)` - Calculate bounding box

### **strategy.js** - Campaign Strategy & Scoring
**Constants:**
- `SEGMENTOS` - Business segment types (clinica, hospital, school, etc)
- `OBJETIVOS` - Campaign objectives (brand awareness, premium presence, regional coverage, etc)
- `ZONAS_ESTRATEGICAS` - Geographic strategic zones with center, radius, color

**Key Functions:**
- `calculateCampaignScore(options)` - Compute strategic alignment score
  - Inputs: selected points, objective, desired audience, city inventory
  - Output: score (0-100), reasoning, missing segments, unmet challenges
- `calculateCoverageLevel(favorites, cityInventory)` - Calculate coverage percentage
- `campaignTotals(points)` - Sum total cost, screens, daily flow, insertions
- `buildAudienceQualification(points, targetAudience)` - Evaluate audience match
- `buildEntornoSummary(points, segment)` - Summarize geo-intelligence results
- `getSegmentDisplayName(segment)` - Localized segment name

### **midiaKitPdf.js** - PDF Report Generation
**Functions:**
- `generateMidiaKitPdf(...)` - Create professional PDF proposal/media kit
  - Includes: cover, point details, metrics, maps, geo-analysis, pricing
  - Custom layout with branding, overridable via settings
  - Chart rendering, image compositing, paginated output

**Constants:**
- PAGE_WIDTH, PAGE_HEIGHT - PDF dimensions (1680x1188)
- BRAND_ORANGE - Primary brand color (#FE5C2B)
- BRAND_DARK - Dark background (#0A0A0A)

### **pdfLayoutConfig.js** - PDF Layout Customization
**Functions:**
- `loadPdfLayoutConfig()` - Fetch current layout overrides

### **pointImages.js** - Image Processing
**Functions:**
- Focus point selection and image cropping utilities
- Handles imagem_foco_x, imagem_foco_y, imagem_foco_zoom

### **services/ibgeService.js** - IBGE Census Data Integration
**Functions:**
- Lookup demographic data by city/municipality
- Integration with IBGE (Brazilian census bureau) API

---

## 6. DATABASE SCHEMA

**Database:** SQLite `backend/midiakit.db`  
**Location:** [backend/database.js](backend/database.js)

### **Table: pontos** - Display Locations/Screens
```sql
id (PRIMARY KEY)
nome TEXT - Display name
cidade TEXT - City name
tipo TEXT - Display type (Elevador, Tela Indoor, Painel LED, etc)
endereco TEXT - Full address
lat REAL - Latitude coordinate
lng REAL - Longitude coordinate
horario TEXT - Operating hours
fluxo INTEGER - Daily traffic/flow count
insercoes INTEGER - Number of ad insertions per day
tempo TEXT - Duration per insertion (e.g., "15s")
loop TEXT - Loop duration (e.g., "3 min")
veiculacao TEXT - Media type (e.g., "Vídeo sem áudio")
publico TEXT - Target audience (A, B, A/B)
telas INTEGER - Number of screens
preco REAL - Price per insertion/month
custo_operacional REAL - Operational cost
descricao TEXT - Description
imagem TEXT - Primary image URL/path
imagem2 TEXT - Secondary image URL
arte_largura INTEGER - Artwork width (default 1920px)
arte_altura INTEGER - Artwork height (default 1080px)
imagem_foco_x REAL - Focal point X% (0-100)
imagem_foco_y REAL - Focal point Y% (0-100)
imagem_foco_zoom REAL - Zoom level (100-220)
simulacao_tela TEXT - Screen simulation config (JSON)
simulacao_arte TEXT - Artwork simulation preview URL
simulacao_preview TEXT - Full simulation preview URL
tipo_fluxo TEXT - Flow type (pessoas, veiculos)
ativo INTEGER - Active status (1=active, 0=inactive)
created_at TEXT - Creation timestamp
updated_at TEXT - Last update timestamp
```

### **Table: admin_users** - Admin & Sales Team
```sql
id (PRIMARY KEY)
first_name TEXT
last_name TEXT
username TEXT UNIQUE - Login username
email TEXT - Contact email
whatsapp TEXT - WhatsApp number
password TEXT - Password hash
role TEXT - admin | gerente_comercial | vendedor
created_at TEXT
updated_at TEXT
```

### **Table: entorno_cache** - Geo-Intelligence Results
```sql
id (PRIMARY KEY)
ponto_id INTEGER FOREIGN KEY - Reference to pontos.id
latitude REAL
longitude REAL
segmento_analisado TEXT - Business segment (clinica, varejo, etc)
raio_m INTEGER - Search radius in meters
total_estabelecimentos_relacionados INTEGER - Count of matching businesses
categorias_encontradas TEXT - JSON array of found categories
distancia_media REAL - Average distance in meters
score_relevancia REAL - 0-100 relevance score
raw_result TEXT - Full API response
updated_at TEXT - Cache refresh timestamp
expires_at TEXT - Cache expiration timestamp
UNIQUE(ponto_id, segmento_analisado, raio_m)
```

### **Table: entorno_jobs** - Analysis Job Queue
```sql
id (PRIMARY KEY)
segmento_analisado TEXT - Segment being analyzed
raio_m INTEGER - Radius in meters
cidade TEXT - City filter (empty = all cities)
status TEXT - queued | running | completed | failed
total_points INTEGER - Total points to process
processed_points INTEGER - Completed count
error_count INTEGER - Failures during run
last_error TEXT - Last error message
started_at TEXT - Job start time
finished_at TEXT - Job completion time
created_at TEXT
updated_at TEXT
```

### **Table: propostas** - Proposals/Quotations
```sql
id (PRIMARY KEY)
usuario_id INTEGER FOREIGN KEY - Reference to admin_users.id
titulo TEXT - Proposal title
descricao TEXT - Description/notes
pontos_json TEXT - JSON array of selected point IDs
desconto_percentual REAL - Discount percentage
desconto_tipo TEXT - Discount type (nenhum, total, especifico, individual)
valor_total_original REAL - Original total before discount
valor_total_desconto REAL - Discount amount
valor_total_final REAL - Final price after discount
status TEXT - rascunho | enviado | aprovado | rejeitado
requer_aprovacao INTEGER - 1 if discount exceeds minimum profit threshold
aprovado_por INTEGER FOREIGN KEY - Approver user ID (if approved)
motivo_rejeicao TEXT - Rejection reason (if rejected)
created_at TEXT
updated_at TEXT
```

### **Table: propostas_aprovacoes** - Approval History
```sql
id (PRIMARY KEY)
proposta_id INTEGER FOREIGN KEY - Reference to propostas.id
gerente_id INTEGER FOREIGN KEY - Manager reviewing
status TEXT - pendente | aprovado | rejeitado
motivo TEXT - Approval/rejection notes
created_at TEXT
atualizado_em TEXT
```

### **Table: app_settings** - Configuration Storage
```sql
key TEXT PRIMARY KEY - Setting name
value TEXT - Setting value (number or text)
updated_at TEXT - Last update
```

**Key Settings:**
- `lucro_minimo_percentual` - Minimum profit margin % (default 15%)
- `pdf_layout_overrides` - JSON with PDF customization settings

### **Indexes** - Performance Optimization
```sql
idx_pontos_ativo_cidade_nome - ON pontos(ativo, cidade, nome)
idx_pontos_ativo_tipo - ON pontos(ativo, tipo)
idx_pontos_ativo_publico - ON pontos(ativo, publico)
idx_entorno_cache_segment_radius - ON entorno_cache(segmento_analisado, raio_m)
idx_entorno_cache_expires - ON entorno_cache(expires_at)
idx_entorno_jobs_segment_radius_status - ON entorno_jobs(segmento_analisado, raio_m, status)
```

---

## KEY FEATURES SUMMARY

✓ **Points Management** - CRUD operations for DOOH display locations  
✓ **Geolocation** - Coordinates, address geocoding, distance calculations  
✓ **Surrounding Analysis** - Auto-discover nearby businesses by segment/category  
✓ **Campaign Planning** - Strategic zone recommendations, coverage metrics, scoring  
✓ **Proposal Builder** - Flexible discounting, automated pricing, PDF export  
✓ **Admin Dashboard** - Multi-level access (Admin, Gerente Comercial, Vendedor)  
✓ **Presentation Mode** - Full-screen client presentation with maps and analytics  
✓ **Theme System** - Dark/light mode persistence  
✓ **Favorites** - Quick access to saved point combinations  
✓ **Job Queue** - Async analysis jobs with status tracking  
✓ **PDF Reports** - Professional branded media kits with customizable layout  
✓ **Backup System** - Automated SQLite backups with 14-day retention

