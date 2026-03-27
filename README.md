# Intermidia Mídia Kit Digital

Plataforma web p/ apresentação e gestão de pontos de mídia OOH (out-of-home). Permite explorar, filtrar e montar propostas comerciais com geração de PDF, mapa interativo e modo de apresentação em slides.

---

## Tecnologias

### Backend
- **Runtime:** Node.js 20
- **Framework:** Express 4
- **BD:** SQLite via `better-sqlite3`
- **Upload:** Multer
- **Proc. manager:** PM2 6

### Frontend
- **UI:** React 18 + Vite 6
- **Estilização:** Tailwind CSS 3
- **Roteamento:** React Router 7
- **Animações:** Framer Motion 11
- **Mapas:** Leaflet 1.9 + react-leaflet 4
- **PDF:** jsPDF 4
- **Ícones:** Lucide React + Remix Icons

---

## Estrutura de Pastas

```
/
├── backend/
│   ├── server.js          # Entry point, rotas da API
│   ├── database.js        # Config. e acesso ao SQLite
│   ├── entornoAnalysis.js # Análise de entorno, geocodif., scores
│   ├── backupService.js   # Backup automático do BD
│   └── uploads/           # Imgs dos pontos (servidas via /uploads)
├── frontend/
│   ├── src/
│   │   ├── pages/         # Landing, Explorer, Admin
│   │   ├── components/    # Comp. reutilizáveis (mapa, cards, modais...)
│   │   ├── context/       # FavoritesContext
│   │   └── lib/           # API client, geração de PDF, simulação
│   └── public/            # Ativos estáticos (logo, padrões)
├── ecosystem.config.js    # Config. PM2
└── README.md
```

---

## Config. de Ambiente

Nenhum arquivo `.env` obrigatório. Variáveis via PM2 (`ecosystem.config.js`):

| Var.          | Padrão | Desc.                          |
|---------------|--------|-------------------------------|
| `PORT`        | `3002` | Porta do servidor Express      |
| `NODE_ENV`    | —      | `production` no servidor prod. |

---

## Instalação Local

**Requisitos:** Node.js 20+, npm 10+

```bash
# Clonar o repositório
git clone https://github.com/mmaak47/midiakitdigital.git
cd midiakitdigital

# Instalar deps. do backend
cd backend && npm install

# Instalar deps. do frontend
cd ../frontend && npm install
```

### Dev

Em dois terminais separados:

```bash
# Terminal 1 — backend
cd backend && npm run dev

# Terminal 2 — frontend (Vite dev server c/ proxy p/ :3002)
cd frontend && npm run dev
```

Acesse `http://localhost:5173`.

### Build p/ produção

```bash
cd frontend && npm run build
# Ativos gerados em frontend/dist/ — servidos pelo Express
```

---

## Deploy (VPS)

- **Servidor:** Azure Ubuntu 24.04 — IP `REDACTED_OLD_VPS_IP`
- **App path:** `/home/mmak/midiakit`
- **PM2:** processo `intermidia-midiakit`, porta `3002`, modo `fork`
- **Nginx:** proxy reverso na porta 80

Cmd. completo de deploy:

```bash
ssh -i "$env:USERPROFILE\.ssh\midiakit_key.pem" mmak@REDACTED_OLD_VPS_IP \
  "cd /home/mmak/midiakit && git pull origin main \
  && cd backend && npm install --omit=dev \
  && cd ../frontend && npm install && npm run build \
  && cd .. && pm2 restart intermidia-midiakit \
  && git rev-parse --short HEAD"
```

---

## API — Rotas Principais

Todas prefixadas em `/api/`.

| Método | Rota                        | Desc.                                |
|--------|-----------------------------|-------------------------------------|
| GET    | `/api/pontos`               | Lista todos os pts. c/ filtros       |
| GET    | `/api/pontos/:id`           | Detalhe de um pt.                   |
| POST   | `/api/pontos`               | Cria pt. (autenticado)              |
| PUT    | `/api/pontos/:id`           | Atualiza pt. (autenticado)          |
| DELETE | `/api/pontos/:id`           | Remove pt. (autenticado)            |
| POST   | `/api/upload`               | Upload de img. de pt.               |
| GET    | `/api/entorno/:id`          | Análise de entorno do pt.           |
| GET    | `/api/entorno/job/:jobId`   | Status do job de análise            |
| POST   | `/api/auth/login`           | Autenticação de usuário             |

---

## Funcionalidades Princ.

- **Explorer:** grid de pts. c/ filtros por tipo, cidade e faixa de investimento; busca textual; favoritos; modal detalhado c/ mapa e galeria
- **Mapa interativo:** clusters, círculo de entorno, dark/light mode (Leaflet)
- **Análise de entorno:** geocodificação e scoring automático de PDV próximos via job assíncrono
- **Modo slides:** apresentação full-screen p/ reuniões comerciais, c/ lobby de seleção, slides por formato e mapa p/ cada pt.
- **Geração de PDF:** proposta customizada via jsPDF, c/ layout calibrável pelo admin
- **Planner estratégico:** sugestões de mix de formatos e simulação de alcance
- **Admin (/comercial):** cadastro de pts., upload de imgs., gestão de usuários, painel de análise de entorno e calibração de PDF

---

## Design System

- Paleta escura c/ laranja vibrante (`#FE5C2B`) como único acento cromático
- Tipografia: **Poppins** (títulos) + **Montserrat** (corpo), via Google Fonts
- Tokens Tailwind customizados: `brand-orange`, `brand-dark`, `brand-gray-*` etc.
- Doc. completa em `DESIGN.md`

---

## Credenciais Padrão (Admin)

> Altere imediatamente em produção.

| Campo  | Valor           |
|--------|-----------------|
| Usuário | `admin`        |
| Senha   | `intermidia2025` |

---

## Desenvolvido por Maitê Doin
