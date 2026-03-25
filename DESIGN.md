# Intermidia — Mídia Kit Digital: Design System & Guidelines

> Documento de referência para qualquer agente ou desenvolvedor que trabalhe neste projeto.

---

## 🎨 Identidade Visual

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

- Arquivo: `/logo.png` (fundo transparente)
- Usado no Navbar (`<img>` com `h-8`) e no Footer (`h-6`)
- Não usar texto alternativo — sempre usar a imagem oficial

---

## 🏗️ Arquitetura de Páginas (Jornada do Mídia Kit)

A Landing Page segue a jornada estratégica de um mídia kit profissional:

### 1. CAPA / HERO — Impacto + Posicionamento
**Objetivo:** Criar desejo e autoridade antes de qualquer dado.

- Visual forte com rosto, luz e contraste (foto hero em tela cheia)
- Background: `/hero-bg.jpg` (mulher com luzes LED coloridas)
- Overlay escuro (`bg-black/60`) para legibilidade
- Glow laranja com blur no centro
- Badge "Mídia Kit Digital 2026" com pulsação
- Headline: conceitual, sobre posicionamento (não vende mídia diretamente)
- CTA primário (laranja) + CTA secundário (outline)
- Indicador de scroll animado

### 2. STATS — Prova Social em Números
**Objetivo:** Impactar com escala antes do conteúdo detalhado.

- Grid 4 colunas: Pontos, Cidades, Telas, Fluxo Mensal
- Dados vindos da API (`/api/stats`) — dinâmicos
- Ícones laranja + números grandes (Poppins bold)
- Animação fadeUp ao entrar no viewport

### 3. MANIFESTO / SOBRE — Autoridade Institucional
**Objetivo:** Transformar a empresa em especialista confiável.

- Layout: texto à esquerda + grid 2 fotos à direita (escalonadas)
- Fotos: `/about-1.jpg` e `/about-2.jpg` (fotos reais Intermidia)
- Texto: quem é a Intermidia, cobertura, expertise
- "Desde 2007" — construir confiança temporal

### 4. PORTFÓLIO DE FORMATOS — Ecossistema de Presença
**Objetivo:** Mostrar que se vende ecossistema, não pontos isolados.

- Grid 5 cards com ícone laranja + label + descrição
- **5 formatos exibidos na landing:**
  - Elevadores (Building2)
  - Telas Indoor (Tv)
  - Painéis LED (Columns3)
  - Backlights (Lightbulb)
  - Frontlights (Sun)
- Cards com `bg-white/[0.02]`, border sutil, hover com borda laranja
- Nota: existem 9 tipos no sistema (+ Totem Digital, Circuito Muffato, LED Posto, Video Wall) mas na landing mostramos apenas 5 para não poluir

### 5. SHOWCASE / TECNOLOGIA — Produto como Protagonista
**Objetivo:** Destacar a infraestrutura e tecnologia.

- Layout: totem triplaface à esquerda + texto à direita
- `/totem-sample.png` = PNG com fundo transparente, exibido flutuando
- Efeito: glow laranja por trás (blur), drop-shadow laranja, hover scale
- Lista de benefícios com bullet points laranja
- Sem container/box ao redor da imagem — ela "flutua" no fundo escuro

### 6. PÚBLICO ENGAJADO — Audiência e Números
**Objetivo:** Provar que o público é real e engajado.

- Background sutil de textura (wallpaper, opacity-15)
- Grid: texto + mini-cards de números à esquerda / foto à direita
- Foto: `/audience.jpg` (público interagindo com conteúdo)
- Mini-cards: fluxo, telas, pontos, cidades (dados estáticos de referência)

### 7. GALERIA — Presença Visual
**Objetivo:** Reforçar credibilidade com fotos reais.

- Grid 3 colunas com hover zoom
- Fotos: showcase, about-1, about-2
- Gradient overlay de baixo pra cima com label
- Transição de escala no hover (1.05x)

### 8. CTA FINAL — Conversão
**Objetivo:** Fechar a jornada com ação clara.

- Background: `/city-bg.jpg` (bokeh noturno, opacity-20)
- Gradient overlay para legibilidade
- Headline + parágrafo + botão laranja
- Simplicidade total — sem distrações

### 9. FOOTER
- Logo oficial + copyright
- Links: Pontos, Sobre
- Minimalista, sem excesso

---

## 📐 Padrões de Componentes

### Animações (Framer Motion)

```javascript
// fadeUp padrão para seções
const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: (i = 0) => ({
    opacity: 1, y: 0,
    transition: { delay: i * 0.1, duration: 0.6, ease: [0.22, 1, 0.36, 1] }
  })
};
```

- Todos os blocos usam `whileInView` com `viewport={{ once: true }}`
- Delay incremental entre items: `delay: i * 0.08` a `i * 0.1`
- Scroll indicator: `animate={{ y: [0, 8, 0] }}` infinito

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

- Sempre com `rounded-2xl overflow-hidden`
- Gradient overlay: `bg-gradient-to-t from-black/40 to-transparent` (ou variações)
- Fotos reais, nunca ilustrações genéricas

### Seções

- Separadas por `border-t border-white/5`
- Padding vertical: `py-24` (seções) ou `py-20` (stats)
- Container: `max-w-6xl mx-auto px-6`

---

## 🖼️ Assets (frontend/public/)

| Arquivo              | Descrição                                   | Uso na Landing           |
|----------------------|---------------------------------------------|--------------------------|
| `hero-bg.jpg`        | Mulher com luzes LED coloridas (stock)       | Hero background          |
| `about-1.jpg`        | Foto real Intermidia (equipe/instalação)     | Seção Sobre + Galeria    |
| `about-2.jpg`        | Foto real Intermidia (mídia exterior)        | Seção Sobre + Galeria    |
| `totem-sample.png`   | Totem triplaface (PNG transparente)          | Seção Tecnologia         |
| `audience.jpg`       | Público interagindo com conteúdo             | Seção Público Engajado   |
| `showcase.png`       | Mídia em elevadores                          | Galeria                  |
| `city-bg.jpg`        | Bokeh noturno abstrato de cidade             | CTA background           |
| `stock-wallpaper.jpg`| Textura/wallpaper (stock)                    | Seção Engajamento (bg)   |
| `wallpaper.jpg`      | Wallpaper alternativo                        | Disponível               |
| `logo.png`           | Logo oficial Intermidia (transparente)       | Navbar + Footer          |
| `favicon.svg`        | Favicon SVG                                  | Browser tab              |

---

## 🗺️ Componentes do Sistema

## ✍️ Ajuste Manual de PDF

- Arquivo central de ajuste: `frontend/src/lib/pdfLayoutConfig.js`
- Midia Kit: seção `PDF_LAYOUT.midiaKit`
- Proposta Comercial: seção `PDF_LAYOUT.proposal`
- Fluxo recomendado:
  - Ajuste um valor numérico no config
  - Gere o PDF para validar visualmente
  - Repita microajustes até ficar no ponto
- Modo calibração no app:
  - Acesse `/admin`
  - Use o painel `Modo calibração PDF`
  - Os valores são salvos no navegador e aplicados automaticamente na próxima geração do PDF

Exemplos de campos úteis para ajuste fino:

- `midiaKit.pointPage.nameFontSize` e `midiaKit.pointPage.nameTop`
- `midiaKit.pointPage.metricLabelFontSize` e `midiaKit.pointPage.metricValueFontSize`
- `midiaKit.pointPage.priceValueFontSize` e `midiaKit.pointPage.footerBottom`
- `proposal.cover.chipMinHeight` e `proposal.cover.badgeMinHeight`
- `proposal.point.counterMinWidth` e `proposal.point.counterMinHeight`

### Explorer (`/explorar`)
- Sidebar de filtros: cidade, tipo (9 tipos), público, busca por nome
- Grid de cards (`PointCard`) com cores por tipo
- Mapa interativo (React Leaflet) com marcadores custom laranja
- Sistema de favoritos (localStorage)

### Mapa (`/mapa`)
- Tela cheia com Leaflet
- Estilo dark (tiles dark)
- Marcadores com cluster
- Popup com dados do ponto

### Favoritos + Propostas
- Seleção de pontos favoritos
- Geração de proposta (resumo dos pontos selecionados)

### Admin (`/admin`)
- Login com autenticação
- CRUD completo de pontos
- Upload de imagens
- 9 tipos de mídia no dropdown
- 4 cidades disponíveis

---

## 🎯 Princípios de Design

1. **Dark-first:** Todo o design parte do preto absoluto. A luz vem dos acentos.
2. **Laranja como ação:** Só a cor primária (#FE5C2B) direciona o olhar.
3. **Fotos reais > Ícones genéricos:** Priorizar fotografia real da empresa.
4. **Jornada de conversão:** Impacto → Autoridade → Escala → Clareza → Números → CTA
5. **Minimalismo funcional:** Menos é mais. Cada elemento tem propósito.
6. **Animação sutil:** fadeUp e scale, nunca rotação ou bounce excessivo.
7. **Espaço negativo:** Usar padding generoso entre seções (py-24).
8. **Tipografia hierárquica:** Poppins bold para títulos, Montserrat regular para corpo.

---

## ⚙️ Stack Técnica

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

## 📊 Dados Reais (Seed)

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
