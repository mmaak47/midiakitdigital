# Intermidia — Mídia Kit Digital: Design System & Guidelines

> Guia de referência pra qualquer dev que mexa neste projeto.

---

## Identidade Visual

### Cores

| Token                   | Hex       | Uso                                      |
|-------------------------|-----------|------------------------------------------|
| `brand-orange`          | `#FE5C2B` | Cor primária, CTAs, destaques, ícones     |
| `brand-orange-hover`    | `#e5491f` | Hover de botões primários                |
| `brand-black`           | `#000000` | Background principal                      |
| `brand-dark`            | `#0A0A0A` | Background de componentes, mapa           |
| `brand-gray-900`        | `#171717` | Cards, popups, painéis elevados           |
| `brand-gray-800`        | `#262626` | Bordas sutis, shimmer                     |
| `brand-gray-700`        | `#404040` | Elementos secundários                     |
| `brand-gray-500`        | `#737373` | Texto terciário, labels, descrições       |
| `brand-gray-400`        | `#A3A3A3` | Texto secundário, parágrafos              |
| `brand-gray-300`        | `#D4D4D4` | Texto claro sobre escuro                  |
| `brand-white`           | `#FFFFFF` | Texto primário, headings                  |

**Princípio:** Fundo escuro total (preto) com laranja vibrante como único acento cromático. Toda a UI é construída em escala de cinza com o laranja como cor de ação/destaque.

### Tipografia

| Família      | Uso                                  | Pesos disponíveis      |
|--------------|--------------------------------------|------------------------|
| **Poppins**  | Títulos (`h1`–`h6`), classe `font-heading` | 300, 400, 500, 600, 700, 800 |
| **Montserrat** | Corpo de texto, UI geral (padrão `body`) | 300, 400, 500, 600, 700 |
| **Bicyclette** | Logo (classe `font-logo`, necessita Adobe Fonts) | — |

Importação via Google Fonts no `<head>` do HTML. CSS global em `index.css` define `body { font-family: Montserrat }` e `h1-h6 { font-family: Poppins }`.

### Logo

- Arq: `/logo.png` (fundo transparente)
- Usa no Navbar (`<img>` com `h-8`) e no Footer (`h-6`)
- Sem alt text — só a imagem oficial mesmo

---

## Arquitetura de Páginas (Jornada do Mídia Kit)

A Landing Page segue a jornada estratégica de um mídia kit profissional:

### 1. CAPA / HERO — Impacto + Posicionamento
**Objetivo:** Criar desejo e autoridade antes de qualquer dado.

- Visual forte com rosto, luz e contraste (foto hero full)
- BG: `/hero-bg.jpg` (mulher com LEDs coloridos)
- Overlay escuro (`bg-black/60`) pra legib
- Glow laranja com blur no meio
- Badge "Mídia Kit Digital 2026" com pulse
- Headline: conceitual, sobre posição (n vende mídia direto)
- CTA primário (laranja) + CTA sec (outline)
- Indicador scroll com anim

### 2. STATS — Prova Social em Números
**Objetivo:** Impactar com escala antes do conteúdo detalhado.

- Grid 4 colunas: Pontos, Cidades, Telas, Fluxo Mensal
- Dados via API (`/api/stats`) — dinâmicos
- Ícones laranja + números grandes (Poppins bold)
- FadeUp anim ao entrar no viewport

### 3. MANIFESTO / SOBRE — Autoridade Institucional
**Objetivo:** Transformar a empresa em especialista confiável.

- Layout: texto left + grid 2 fotos right (escalonadas)
- Fotos: `/about-1.jpg` e `/about-2.jpg` (reais mesmo)
- Texto: quem é a Intermidia, cobertura, expertise
- "Desde 2007" — pra construir confiança

### 4. PORTFÓLIO DE FORMATOS — Ecossistema de Presença
**Objetivo:** Mostrar que se vende ecossistema, não pontos isolados.

- Grid 5 cards com ícone laranja + label + desc
- **5 formatos na landing:**
  - Elevadores (Building2)
  - Telas Indoor (Tv)
  - Painéis LED (Columns3)
  - Backlights (Lightbulb)
  - Frontlights (Sun)
- Cards com `bg-white/[0.02]`, border sutil, hover laranja
- Note: tem 9 tipos no sistema (+ Totem Digital, Muffato, LED Posto, Video Wall) mas na landing só mostra 5 pra n poluir

### 5. SHOWCASE / TECNOLOGIA — Produto como Protagonista
**Objetivo:** Destacar a infraestrutura e tecnologia.

- Layout: totem triplaface left + texto right
- `/totem-sample.png` = PNG transparente, flutuando
- Efeito: glow laranja atrás (blur), drop-shadow laranja, hover scale
- Lista benefícios com bullets laranja
- Sem container/box — a imagem só "flutua" no escuro

### 6. PÚBLICO ENGAJADO — Audiência e Números
**Objetivo:** Provar que o público é real e engajado.

- BG textura sutil (wallpaper, opacity-15)
- Grid: texto + mini-cards left / foto right
- Foto: `/audience.jpg` (público interagindo)
- Mini-cards: fluxo, telas, pontos, cidades (dados estáticos)

### 7. GALERIA — Presença Visual
**Objetivo:** Reforçar credibilidade com fotos reais.

- Grid 3 colunas com zoom hover
- Fotos: showcase, about-1, about-2
- Gradient overlay bottom-to-top com label
- Scale transition hover (1.05x)

### 8. CTA FINAL — Conversão
**Objetivo:** Fechar a jornada com ação clara.

- BG: `/city-bg.jpg` (bokeh noturno, opacity-20)
- Gradient overlay pra legib
- Headline + parágrafo + btn laranja
- Total simplicidade — sem distrações

### 9. FOOTER
- Logo oficial + copyright
- Links: Pontos, Sobre
- Minimalista, sem excesso

---

## Padrões de Componentes

### Animações (Framer Motion)

```javascript
// fadeUp padrão pra sections
const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: (i = 0) => ({
    opacity: 1, y: 0,
    transition: { delay: i * 0.1, duration: 0.6, ease: [0.22, 1, 0.36, 1] }
  })
};
```

- Tudo usa `whileInView` com `viewport={{ once: true }}`
- Delay incremental entre items: `delay: i * 0.08` a `i * 0.1`
- Scroll indicator: `animate={{ y: [0, 8, 0] }}` loop infinito

### Botões

| Tipo      | Classes                                                                           |
|-----------|-----------------------------------------------------------------------------------|
| Primário  | `bg-brand-orange text-white font-semibold rounded-xl hover:bg-brand-orange-hover hover:scale-[1.02] active:scale-[0.98]` |
| Secundário | `border border-white/10 text-white/70 rounded-xl hover:bg-white/5 hover:text-white` |

### Cards de Tipo

```
bg-white/[0.02] border border-white/5 rounded-2xl p-6
hover:bg-white/[0.04] hover:border-brand-orange/20
transition-all duration-300
```

### Imagens

- Sempre `rounded-2xl overflow-hidden`
- Gradient overlay: `bg-gradient-to-t from-black/40 to-transparent` (ou variações)
- Fotos reais, n ícones genéricos

### Seções

- Separadas por `border-t border-white/5`
- Padding: `py-24` (seções) ou `py-20` (stats)
- Container: `max-w-6xl mx-auto px-6`

---

## Assets (frontend/public/)

| Arq                  | Desc                                        | Uso                      |
|----------------------|---------------------------------------------|--------------------------|
| `hero-bg.jpg`        | Mulher com LEDs (stock)                      | Hero BG                  |
| `about-1.jpg`        | Foto Intermidia real (equipe/install)        | About + Galeria          |
| `about-2.jpg`        | Foto Intermidia real (mídia ext)             | About + Galeria          |
| `totem-sample.png`   | Totem triplaface (PNG transp)                | Seção Tech               |
| `audience.jpg`       | Público interagindo                          | Seção Engajado           |
| `showcase.png`       | Mídia em elevadores                          | Galeria                  |
| `city-bg.jpg`        | Bokeh noturno abstrato                       | CTA BG                   |
| `stock-wallpaper.jpg`| Textura (stock)                              | Seção Engajamento        |
| `wallpaper.jpg`      | Wallpaper alt                                | Disponível               |
| `logo.png`           | Logo oficial (transp)                        | Navbar + Footer          |
| `favicon.svg`        | Favicon SVG                                  | Tab browser              |

---

## Componentes do Sistema

## Fórmulas Comerciais

As métricas comerciais do app são centralizadas em [frontend/src/lib/strategy.js](/c:/midia%20kit/frontend/src/lib/strategy.js). A documentação abaixo descreve o cálculo real usado pelo sistema hoje.

### Ticket médio

- Fórmula: `valorTotal / quantidadeDePontos`
- Origen: soma preço mensal dos pontos selecionados e divide pela qtd
- Uso: mostra investimento médio por ponto da proposta

### CPM estimado

- Fórmula: `valorTotal / (fluxoTotal / 1000)`
- Onde:
  - `valorTotal` = soma dos preços selecionados
  - `fluxoTotal` = soma do fluxo mensal dos pontos
- Significado: quanto custa gerar 1k impactos estimados
- Proteção: se `fluxoTotal` for `0`, retorna `0` (evita divisão quebrada)

### Score da campanha

Score vai de `0` a `10`, soma de 6 blocos com teto cada um. Depois arredonda 1 casa decimal e limita em 10.

Fórmula consolidada:

```text
scoreRaw =
  min(2.2, formatos / 3) +
  min(2.4, fluxoTotal / 700000) +
  min(2.0, coveragePct / 25) +
  min(1.8, presencePct / 28) +
  min(1.6, aderenciaPublico) +
  min(1.4, aderenciaObjetivo)

scoreFinal = min(10, round(scoreRaw, 1))
```

Componentes:

- Diversidade formatos: `min(2.2, formatos / 3)`
  - + tipos = + robustez rápido
- Volume fluxo: `min(2.4, fluxoTotal / 700000)`
  - Premia planos com + impactos/mês
- Cobertura física: `min(2.0, coveragePct / 25)`
  - Compare qtd selecionada vs inventário da praça
- Presença potencial: `min(1.8, presencePct / 28)`
  - Compare fluxo selecionado vs fluxo total da praça
- Aderência público: `min(1.6, publicoMatches / selected.length * 1.6)`
  - Quantos pontos batem com o público desejado
- Aderência objetivo: `min(1.4, objectiveBoost / selected.length * 1.4)`
  - Quantos pontos pontuaram forte pro objetivo

### Como define cobertura

- `coveragePct = (qtd_selecionada / qtd_total_praça) * 100`
- `presencePct = (fluxo_selecionado / fluxo_total_praça) * 100`

Níveis na interface:

- Essencial: base inicial, abaixo dos cortes
- Estratégico: `coveragePct >= 25` ou `presencePct >= 30`
- Domínio regional: `coveragePct >= 50` ou `presencePct >= 55`

### Score do Entorno

Score do entorno mede qualidade do ambiente comercial ao redor do ponto pra um segmento específico.

**Fórmula:**

```text
scoreEntorno = min(48, relevancia * 0.62 + estabelecimentos * 1.35 + categorias * 2.8)
```

**Componentes:**

- `relevancia` (coef: 0.62)
  - Score de relevância da análise de entorno (0-100)
  - Mede proximidade + compatibilidade do entorno vs segmento
  
- `estabelecimentos_relacionados` (coef: 1.35)
  - Qtd de estabelecimentos que combinam com segmento
  - + estabelecimentos = + valor pra campanhas direcionadas
  
- `categorias_encontradas` (coef: 2.8)
  - Variedade de categorias comerciais no entorno
  - + diversidade = + ecossistema rico + sinergia

**Teto:** máx 48 pts por ponto.

**Uso:** Incorporado no `_baseScore` na recomendação de planos, elevando prioridade de pontos com ambiente comercial rico e relevante pro segmento.

### Observações de produto

- Score n mede vendas; mede qualidade estrutural da campanha
- CPM é estimado do fluxo cadastrado, n impressões auditadas
- Ticket médio, CPM e score mudam conforme seleção de pontos, praça, público, objetivo
- Score entorno depende muito da qualidade dos dados; sem análise = score 0

## Ajuste Manual de PDF

- Arq central: `frontend/src/lib/pdfLayoutConfig.js`
- Midia Kit: seção `PDF_LAYOUT.midiaKit`
- Proposta: seção `PDF_LAYOUT.proposal`
- Fluxo:
  - Ajusta valor numérico no config
  - Gera PDF pra validar visualmente
  - Repete microajustes até ficar ok
- Modo calibração no app:
  - Entre `/admin`
  - Use painel `Modo calibração PDF`
  - Valores salvam no servidor (compartilha entre máquinas/admins)
  - Browser guarda cache local só como fallback seguro

Campos pra ajuste fino:

- `midiaKit.pointPage.nameFontSize` e `.nameTop`
- `midiaKit.pointPage.metricLabelFontSize` e `.metricValueFontSize`
- `midiaKit.pointPage.priceValueFontSize` e `.footerBottom`
- `proposal.cover.chipMinHeight` e `.badgeMinHeight`
- `proposal.point.counterMinWidth` e `.counterMinHeight`

### Explorer (`/explorar`)
- Sidebar filters: cidade, tipo (9 tipos), público, busca nome
- Grid cards com cores por tipo
- Mapa interativo (Leaflet) com marcadores laranja
- Favoritos (localStorage)

### Mapa (`/mapa`)
- Tela cheia Leaflet
- Estilo dark
- Marcadores com cluster
- Popup com dados ponto

### Favoritos + Propostas
- Seleção pontos favoritos
- Geração proposta (resumo selecionados)

### Admin (`/admin`)
- Login autenticado
- CRUD completo pontos
- Upload imagens
- 9 tipos mídia dropdown
- 4 cidades

---

## Princípios

1. **Dark-first:** Todo design começa no preto absoluto. Luz dos acentos.
2. **Laranja = ação:** Só cor primária (#FE5C2B) direciona.
3. **Fotos reais > Ícones:** Prioriza fotografia real.
4. **Jornada:** Impacto → Autoridade → Escala → Clareza → Números → CTA
5. **Minimalismo:** Menos é mais. Todo elem tem propósito.
6. **Animação sutil:** fadeUp e scale, nunca rotação ou bounce demais.
7. **Espaço negativo:** Padding generoso entre seções (py-24).
8. **Tipografia:** Poppins bold p/ títulos, Montserrat regular p/ corpo.

---

## Stack Técnica

| Camada    | Tecnologia                        |
|-----------|-----------------------------------|
| Frontend  | React 18 + Vite + Tailwind CSS    |
| Animações | Framer Motion                     |
| Mapa      | React-Leaflet + Leaflet           |
| Ícones    | Lucide React                      |
| Backend   | Express.js + better-sqlite3       |
| Deploy    | Ubuntu 24.04, nginx, PM2          |
| VPS       | Azure `REDACTED_OLD_VPS_IP`             |

---

## Dados Reais (Seed)

- **93 pontos** de mídia
- **4 cidades:** Londrina, Maringá, Balneário Camboriú, Itajaí
- **9 tipos:** Elevador, Tela Indoor, Painel LED, Backlight, Frontlight, Totem Digital, Circuito Muffato, LED Posto, Video Wall
- **221 telas** ativas
- **~2.9M** fluxo mensal total

### Cores por tipo (PointCard)

| Tipo             | Cor             |
|------------------|-----------------|
| Elevador         | Blue 500        |
| Tela Indoor      | Cyan 500        |
| Painel LED       | Purple 500      |
| Backlight        | Amber 500       |
| Frontlight       | Yellow 500      |
| Totem Digital    | Green 500       |
| Circuito Muffato | Rose 500        |
| LED Posto        | Orange 500      |
| Video Wall       | Indigo 500      |

Cada cor usa o padrão: `bg-{color}/10 text-{color}-400 border-{color}/20`

---

*Última atualização: Março 2026*
