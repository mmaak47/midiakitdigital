# Dados do Sistema — MidiaKit Digital

Documentação completa de todos os dados utilizados no sistema, suas origens, transformações e como são consumidos.

---

## Índice

1. [Banco de Dados (Schema Completo)](#1-banco-de-dados)
2. [APIs Externas Consumidas](#2-apis-externas)
3. [Processamento de Dados (Backend)](#3-processamento-backend)
4. [Motor de Recomendação (Frontend)](#4-motor-de-recomendação)
5. [Endpoints da API Interna](#5-endpoints-api)
6. [Upload de Arquivos](#6-uploads)
7. [Autenticação e Segurança](#7-autenticação)
8. [Configurações e Variáveis de Ambiente](#8-configurações)
9. [Backup e Cache](#9-backup-e-cache)
10. [Fluxo de Dados Completo](#10-fluxo-de-dados)

---

## 1. Banco de Dados

**Engine:** SQLite (WAL mode, foreign_keys ON) — arquivo `backend/midiakit.db`  
**Alternativa:** PostgreSQL via `DATABASE_URL` (Prisma configurado mas não utilizado atualmente)

### 1.1 `pontos` — Pontos de Mídia DOOH

Tabela principal com cadastro de todos os pontos de mídia exterior.

| Coluna | Tipo | Default | Descrição |
|--------|------|---------|-----------|
| `id` | INTEGER | AUTOINCREMENT | PK — identificador único |
| `nome` | TEXT | NOT NULL | Nome do ponto |
| `cidade` | TEXT | NOT NULL | Cidade onde está instalado |
| `tipo` | TEXT | NOT NULL | Formato de mídia: LED, Backlight, Frontlight, Elevador, Indoor, Painel, etc. |
| `endereco` | TEXT | — | Endereço completo |
| `lat` | REAL | — | Latitude (-90 a 90) |
| `lng` | REAL | — | Longitude (-180 a 180) |
| `horario` | TEXT | — | Horário de funcionamento (ex: "06:00 às 22:00", "24 horas") |
| `fluxo` | INTEGER | 0 | Fluxo mensal estimado (impressões/pessoas) |
| `insercoes` | INTEGER | 0 | Número de inserções por período |
| `tempo` | TEXT | '15s' | Duração do spot padrão |
| `loop` | TEXT | '3 min' | Duração do loop |
| `veiculacao` | TEXT | 'Vídeo sem áudio' | Tipo de veiculação (Vídeo sem áudio, Impressão em tecido, etc.) |
| `publico` | TEXT | 'A/B' | Classe de público-alvo (A, B, A/B, C) |
| `telas` | INTEGER | 1 | Número de telas/faces |
| `preco` | REAL | 0 | Preço base em R$ |
| `custo_operacional` | REAL | 0 | Custo operacional |
| `descricao` | TEXT | — | Descrição do ponto |
| `imagem` | TEXT | — | Caminho da imagem principal (upload) |
| `imagem2` | TEXT | — | Caminho da imagem secundária (backdrop) |
| `imagem_foco_x` | REAL | 50 | Ponto focal X para crop (0-100%) |
| `imagem_foco_y` | REAL | 50 | Ponto focal Y para crop (0-100%) |
| `imagem_foco_zoom` | REAL | 100 | Zoom da imagem (100-220%) |
| `foto_focal_point` | TEXT | 'center center' | Ponto focal CSS (top/center/bottom left/center/right) |
| `pdf_image_source` | TEXT | 'imagem2' | Qual imagem usar no PDF (imagem ou imagem2) |
| `arte_largura` | INTEGER | 1920 | Largura da arte em pixels |
| `arte_altura` | INTEGER | 1080 | Altura da arte em pixels |
| `midia_largura_m` | REAL | — | Largura da mídia física em metros (Backlight/Frontlight) |
| `midia_altura_m` | REAL | — | Altura da mídia física em metros (Backlight/Frontlight) |
| `elevador_categoria` | TEXT | — | Categoria do elevador (Residencial, Comercial) — só para tipo Elevador |
| `tipo_fluxo` | TEXT | 'pessoas' | Tipo de fluxo (pessoas, veículos) |
| `audience_tags` | TEXT | '[]' | JSON array de tags de audiência |
| `availability_calendar` | TEXT | '{}' | JSON de disponibilidade por dia/horário |
| `simulacao_tela` | TEXT | — | Imagem de simulação da tela |
| `simulacao_arte` | TEXT | — | Imagem de simulação da arte |
| `simulacao_preview` | TEXT | — | Preview da simulação |
| `ativo` | INTEGER | 1 | Flag ativo/inativo (1=ativo) |
| `created_at` | TEXT | datetime('now') | Criação |
| `updated_at` | TEXT | datetime('now') | Última atualização |

**Índices:** `(ativo, cidade, nome)`, `(ativo, tipo)`, `(ativo, publico)`

**Tags de audiência válidas:** `classe-a`, `classe-b`, `premium`, `familias`, `jovens`, `executivos`, `motoristas`, `shopper`, `moradores`, `turistas`

---

### 1.2 `admin_users` — Usuários do Sistema

| Coluna | Tipo | Default | Descrição |
|--------|------|---------|-----------|
| `id` | INTEGER | AUTOINCREMENT | PK |
| `first_name` | TEXT | — | Nome |
| `last_name` | TEXT | — | Sobrenome |
| `username` | TEXT | NOT NULL UNIQUE | Login |
| `email` | TEXT | — | Email |
| `whatsapp` | TEXT | — | WhatsApp |
| `password` | TEXT | NOT NULL | Senha hash (scrypt com salt) |
| `role` | TEXT | 'vendedor' | Papel: `vendedor`, `gerente_comercial`, `admin` |
| `created_at` | TEXT | datetime('now') | Criação |
| `updated_at` | TEXT | datetime('now') | Atualização |

**Papéis e permissões:**
- `vendedor` — Acesso a visualização e criação de propostas
- `gerente_comercial` — Pode aprovar/rejeitar propostas que requerem aprovação
- `admin` — Acesso total (CRUD de pontos, usuários, configurações)

---

### 1.3 `entorno_cache` — Cache de Análise de Entorno

Armazena resultados de análise de afinidade de segmento por ponto (ex: quantas clínicas existem perto de cada ponto).

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | INTEGER | PK |
| `ponto_id` | INTEGER | FK → pontos, ON DELETE CASCADE |
| `latitude` | REAL | Latitude do ponto analisado |
| `longitude` | REAL | Longitude do ponto analisado |
| `segmento_analisado` | TEXT | Segmento de negócio analisado (clinica, hospital, escola, etc.) |
| `raio_m` | INTEGER | Raio de busca em metros (200–2000) |
| `total_estabelecimentos_relacionados` | INTEGER | Quantidade de estabelecimentos encontrados |
| `categorias_encontradas` | TEXT | JSON — categorias OSM encontradas |
| `distancia_media` | REAL | Distância média até os POIs encontrados |
| `score_relevancia` | REAL | Score de relevância (0–100) |
| `affinity_score` | REAL | Score de afinidade composto |
| `raw_result` | TEXT | JSON — resultado bruto da API |
| `updated_at` | TEXT | Última atualização |
| `expires_at` | TEXT | Expiração do cache (TTL: 72 horas) |

**Constraint único:** `(ponto_id, segmento_analisado, raio_m)`  
**Índices:** `(segmento_analisado, raio_m)`, `(expires_at)`

**Como é usado:** O motor de recomendação usa `score_relevancia` e `affinity_score` para bonificar pontos que estão próximos de estabelecimentos relevantes ao segmento do anunciante. Ex: um ponto perto de 5 clínicas recebe score alto quando o segmento é "clínica".

---

### 1.4 `entorno_jobs` — Fila de Jobs de Análise de Entorno

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | INTEGER | PK |
| `segmento_analisado` | TEXT | Segmento sendo analisado |
| `raio_m` | INTEGER | Raio de busca |
| `cidade` | TEXT | Filtro de cidade ('' = todas) |
| `status` | TEXT | `queued`, `running`, `completed`, `failed` |
| `total_points` | INTEGER | Total de pontos a processar |
| `processed_points` | INTEGER | Pontos já processados |
| `error_count` | INTEGER | Erros encontrados |
| `last_error` | TEXT | Último erro |
| `started_at` / `finished_at` | TEXT | Timestamps |
| `created_at` / `updated_at` | TEXT | Timestamps |

**Índice:** `(segmento_analisado, raio_m, status)`

---

### 1.5 `geo_audience_profiles` — Classificação de Bairros (GeoAudiência)

Classifica cada ponto em 1 dos 9 tipos de bairro com base nos POIs no raio de 400m.

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | INTEGER | PK |
| `ponto_id` | INTEGER | FK → pontos, UNIQUE, CASCADE |
| `neighborhood_type` | TEXT | Tipo de bairro (9 tipos — ver abaixo) |
| `neighborhood_label` | TEXT | Label legível (ex: "Centro Corporativo") |
| `confidence` | REAL | Confiança da classificação (0–1) |
| `socioeconomic_level` | TEXT | Nível socioeconômico: `alto`, `medio-alto`, `medio`, `medio-baixo` |
| `socioeconomic_score` | REAL | Score socioeconômico (0–100) |
| `environment_type` | TEXT | Descrição do ambiente |
| `dominant_activity` | TEXT | Atividade dominante |
| `urban_density` | TEXT | Nível de densidade urbana |
| `pois_per_km2` | INTEGER | Densidade de POIs por km² |
| `lifestyle_indicators` | TEXT | JSON — indicadores de estilo de vida |
| `poi_summary` | TEXT | Resumo dos POIs encontrados |
| `total_pois` | INTEGER | Total de POIs no raio de 400m |
| `radius_m` | INTEGER | Raio usado (default 400m) |
| `demographic_data` | TEXT | JSON — dados demográficos |
| `audience_narrative` | TEXT | Narrativa de audiência gerada |
| `premium_count` | INTEGER | Contagem de POIs premium |
| `raw_data` | TEXT | JSON — dados brutos da análise |
| `updated_at` | TEXT | Atualização |
| `expires_at` | TEXT | Expiração (TTL: 7 dias) |

**9 tipos de bairro:**

| Tipo | Label | Descrição |
|------|-------|-----------|
| `centro_corporativo` | Centro Corporativo | Área c/ escritórios, bancos, coworkings |
| `zona_comercial` | Zona Comercial | Comércio, lojas, serviços variados |
| `residencial_premium` | Residencial Premium | Moradia alto padrão, spas, joalherias |
| `residencial_medio` | Residencial Médio | Moradia classe média, supermercados |
| `zona_universitaria` | Zona Universitária | Faculdades, bares, livrarias |
| `zona_lazer` | Zona de Lazer | Restaurantes, cinemas, shopping |
| `zona_popular_densa` | Zona Popular Densa | Alta densidade, lotéricas, comércio popular |
| `polo_saude` | Polo de Saúde | Clínicas, hospitais, farmácias |
| `polo_educacional` | Polo Educacional | Escolas, creches, cursos |

**Como é usado:** O `neighborhood_type` e `socioeconomic_level` são utilizados pelo scoring de Geoaudiência no motor de recomendação (dimensão "geoaudience" com peso 10/100).

---

### 1.6 `census_audience_profiles` — Classificação Demográfica (Censo IBGE)

Classifica cada ponto em 4 perfis demográficos usando dados do Censo IBGE 2022 + POIs do OSM em 500m.

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | INTEGER | PK |
| `ponto_id` | INTEGER | FK → pontos, UNIQUE, CASCADE |
| `municipio` | TEXT | Nome do município |
| `municipio_ibge_code` | TEXT | Código IBGE do município |
| `setor_censitario` | TEXT | Código do setor censitário (quando identificado) |
| `perfil_alta_renda` | REAL | Score perfil Alta Renda (0–1) |
| `perfil_massa_varejo` | REAL | Score perfil Massa/Varejo (0–1) |
| `perfil_jovem_universitario` | REAL | Score perfil Jovem Universitário (0–1) |
| `perfil_terceira_idade` | REAL | Score perfil Terceira Idade (0–1) |
| `perfil_dominante` | TEXT | Perfil com maior score |
| `score_geral` | REAL | Score geral combinado (0–1) |
| `pois_proximos` | TEXT | JSON — array de POIs próximos com nome e tipo |
| `fontes_dados` | TEXT | JSON — fontes de dados utilizadas |
| `dados_censitarios` | TEXT | JSON — dados brutos do censo (renda, idade, educação) |
| `dados_pois` | TEXT | JSON — contagens de POIs por perfil |
| `total_pois` | INTEGER | Total de POIs encontrados no raio de 500m |
| `updated_at` | TEXT | Atualização |
| `expires_at` | TEXT | Expiração (TTL: 7 dias) |

**Índices:** `(perfil_dominante)`, `(municipio)`

**4 perfis demográficos:**

| Perfil | Label | Critérios de Scoring |
|--------|-------|---------------------|
| `alta_renda` | Alta Renda | Renda média ≥ R$5.000, % superior completo > 40%, POIs premium (joalheria, spa, concessionária) |
| `massa_varejo` | Massa / Varejo | Renda R$1.500–5.000, alta densidade, POIs de comércio popular, supermercados, lotéricas |
| `jovem_universitario` | Jovem Universitário | % população 18–29 > 35%, POIs: universidades, bares, coworkings, academias |
| `terceira_idade` | Terceira Idade | % população 60+ > 25%, POIs: farmácias, igrejas, praças, clínicas |

**Como é usado:** O `perfil_dominante` e scores individuais alimentam a dimensão "censusProfile" no motor de recomendação (peso 10/100). Também permite filtrar pontos via `GET /api/pontos?perfil=alta_renda`.

---

### 1.7 `propostas` — Propostas Comerciais

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | INTEGER | PK |
| `usuario_id` | INTEGER | FK → admin_users, CASCADE |
| `titulo` | TEXT | Título da proposta |
| `descricao` | TEXT | Descrição |
| `pontos_json` | TEXT | JSON — pontos selecionados com preços e config |
| `desconto_percentual` | REAL | Percentual de desconto |
| `desconto_tipo` | TEXT | Tipo: `nenhum`, `percentual`, `fixo` |
| `valor_total_original` | REAL | Valor antes do desconto |
| `valor_total_desconto` | REAL | Valor do desconto |
| `valor_total_final` | REAL | Valor final |
| `status` | TEXT | `rascunho`, `enviado`, `aprovado`, `rejeitado` |
| `requer_aprovacao` | INTEGER | Flag se requer aprovação do gerente |
| `aprovado_por` | INTEGER | FK → admin_users (gerente que aprovou) |
| `motivo_rejeicao` | TEXT | Razão da rejeição |
| `created_at` / `updated_at` | TEXT | Timestamps |

**Índices:** `(usuario_id, status)`, `(requer_aprovacao, status)`

---

### 1.8 `propostas_aprovacoes` — Fluxo de Aprovação

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | INTEGER | PK |
| `proposta_id` | INTEGER | FK → propostas, CASCADE |
| `gerente_id` | INTEGER | FK → admin_users, CASCADE |
| `status` | TEXT | `pendente`, `aprovado`, `rejeitado` |
| `motivo` | TEXT | Justificativa |
| `created_at` / `atualizado_em` | TEXT | Timestamps |

---

### 1.9 `pdf_cache` + `pdf_cache_snapshot` — Cache de PDFs Renderizados

**pdf_cache:**

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | INTEGER | PK |
| `combination_key` | TEXT | UNIQUE — hash composto dos slugs das cidades |
| `city_slugs` | TEXT | JSON — array de slugs de cidades incluídas |
| `file_path` | TEXT | Caminho do arquivo PDF no disco |
| `file_size_kb` | INTEGER | Tamanho em KB |
| `generated_at` | TEXT | Quando foi gerado |
| `generated_by` | TEXT | Usuário que gerou |
| `download_count` | INTEGER | Quantidade de downloads |
| `is_valid` | INTEGER | 1=válido, 0=invalidado |

**pdf_cache_snapshot:** Snapshots dos dados no momento da geração do PDF para detectar invalidações.

---

### 1.10 `segment_target_categories` — Modelo de Afinidade Segmento ↔ POI

Define quais categorias de estabelecimento são relevantes para cada segmento de negócio.

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | INTEGER | PK |
| `segment_id` | TEXT | Segmento (clinica, hospital, escola, restaurante, varejo, etc.) |
| `place_category` | TEXT | Categoria de POI (pharmacy, gym, school, shopping_mall, etc.) |
| `weight` | INTEGER | Peso de afinidade (1–10) |

**Unique:** `(segment_id, place_category)`

**Exemplos de afinidade pré-configurada (12 segmentos × ~10 categorias):**

| Segmento | Categorias de Alta Afinidade (peso 8-10) |
|----------|------------------------------------------|
| clinica | farmácia (10), residencial (9), academia (8), escola (7) |
| hospital | farmácia (10), clínica (9), estacionamento (8) |
| restaurante | escritório (9), shopping (8), residencial (7) |
| varejo | residencial (9), transporte (8), mercado (7) |
| escola | residencial (10), parque (7), comércio (6) |

**Como é usado:** O `entornoAnalysis.js` usa esses pesos para calcular o `affinity_score` de cada ponto em relação ao segmento do anunciante.

---

### 1.11 `ciudad_fotos` — Fotos de Banner das Cidades

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `cidade` | TEXT | Nome da cidade |
| `cidade_slug` | TEXT | UNIQUE — slug para URL |
| `imagem_path` | TEXT | Caminho da imagem |
| `original_name` | TEXT | Nome original do arquivo |
| `mime_type` | TEXT | Tipo MIME |
| `size_bytes` | INTEGER | Tamanho |

### 1.12 `app_settings` — Configurações Chave-Valor

| Chave Conhecida | Formato | Uso |
|-----------------|---------|-----|
| `pdf_layout_overrides` | JSON | Customizações do layout do PDF |

---

## 2. APIs Externas

### 2.1 OpenStreetMap — Overpass API

**URL:** `https://overpass-api.de/api/interpreter`  
**Método:** POST com query OverpassQL

**Usado por 3 serviços com raios diferentes:**

| Serviço | Raio | Tags Consultadas | Finalidade |
|---------|------|-------------------|-----------|
| `entornoAnalysis.js` | 800m (configurável) | amenity, shop, healthcare, office, tourism, leisure | Afinidade do segmento de negócio |
| `geoAudienceService.js` | 400m | amenity, shop, healthcare, office, tourism, leisure, building | Classificação de tipo de bairro |
| `censusAudienceService.js` | 500m | amenity, shop, healthcare, office, tourism, leisure | Validação de perfil demográfico |

**Query OverpassQL enviada:**
```
[out:json][timeout:25];
(
  node(around:{raio},{lat},{lng})[amenity];
  way(around:{raio},{lat},{lng})[amenity];
  node(around:{raio},{lat},{lng})[shop];
  way(around:{raio},{lat},{lng})[shop];
  node(around:{raio},{lat},{lng})[healthcare];
  way(around:{raio},{lat},{lng})[healthcare];
  node(around:{raio},{lat},{lng})[office];
  way(around:{raio},{lat},{lng})[office];
  node(around:{raio},{lat},{lng})[tourism];
  way(around:{raio},{lat},{lng})[tourism];
  node(around:{raio},{lat},{lng})[leisure];
  way(around:{raio},{lat},{lng})[leisure];
);
out center tags;
```

**Resposta recebida:**
```json
{
  "elements": [
    {
      "type": "node",
      "id": 123456,
      "lat": -23.310,
      "lon": -51.170,
      "tags": {
        "amenity": "bank",
        "name": "Banco do Brasil"
      }
    }
  ]
}
```

**Processamento:**
1. Extrai nome, tipo (amenity/shop/office), coordenadas de cada elemento
2. Calcula distância haversine do ponto ao POI
3. Classifica em grupo funcional (corporate, commercial, food, health, education, leisure, fitness, transport, residential, beauty, hospitality, religious, green)
4. Compara com categorias-alvo do segmento (`segment_target_categories`)
5. Calcula score de afinidade ponderado

**Cache:** TTL 72h (entorno), 7 dias (geoaudience, census)

---

### 2.2 IBGE Agregados API — Dados Censitários

**URL base:** `https://servicodados.ibge.gov.br/api/v3/agregados`

**Tabelas consumidas:**

| Tabela | Dados | Variáveis | Uso |
|--------|-------|-----------|-----|
| **4714** | População total | V1 (pop residente) | Estimativa de densidade |
| **5938** | PIB per capita | V37 (PIB) + V260 (pop) | Proxy de renda quando tabela 9606 falha |
| **9606** | Faixas de renda | Distribuição por faixa salarial (até ¼ SM, ¼-½ SM, ... 20+ SM) | Renda média estimada do município |
| **9529** | Nível de instrução | % com superior completo | Perfil educacional |
| **9514** | Faixas etárias | Distribuição por idade (0-4, 5-9, ..., 80+) | % jovens 18-29, % idosos 60+ |

**Exemplo de chamada:**
```
GET /api/v3/agregados/9606/periodos/2022/variaveis?localidades=N6[4115200]
```

**Processamento da tabela 9606 (Renda):**
- Parseia labels em português dos brackets de renda (ex: "Mais de 1 a 2 salários mínimos")
- Mapeia cada bracket para valor médio em R$ usando SM_2022 = R$ 1.212
- Calcula renda média ponderada: `Σ(valor_medio × quantidade) / Σ(quantidade)`

**Processamento da tabela 9514 (Idade):**
- Parseia brackets de idade do formato "X a Y anos"
- Calcula % jovem (18-29 anos) e % idoso (60+ anos)
- Usado para classificar perfis `jovem_universitario` e `terceira_idade`

**Fallback:** Se tabelas 9606/9529/9514 falharem (dados não disponíveis para o período), usa-se PIB per capita (tabela 5938) como proxy de renda, e o peso do sinal de POIs aumenta na classificação.

---

### 2.3 IBGE Localidades API — Resolução de Código Municipal

**URL:** `https://servicodados.ibge.gov.br/api/v1/localidades/municipios?orderBy=nome`

**Uso:** Mapeia nome de cidade (ex: "Londrina") para código IBGE (ex: 4115200)

**Cache:** In-memory `cityCodeCache`, TTL 24 horas

---

### 2.4 IBGE Malhas API — Geometria dos Setores Censitários

**URL:** `https://servicodados.ibge.gov.br/api/v3/malhas/municipios/{codMunicipio}`

**Parâmetros:**
- `formato=application/vnd.geo+json`
- `qualidade=maxima`
- `intrarregiao=setor` (fallback: `distrito`)

**Resposta:** GeoJSON `FeatureCollection` com polígonos dos setores censitários

**Processamento:**
1. Pré-computa bounding boxes de cada feature para rejeição rápida
2. Para cada ponto, testa point-in-polygon usando algoritmo ray-casting
3. Identifica o setor censitário que contém o ponto

**Cache:** In-memory `meshCache`, TTL 24 horas

---

### 2.5 Nominatim API — Geocodificação de Endereços

**URL:** `https://nominatim.openstreetmap.org/search`  
**Parâmetros:** `q={endereço}`, `format=jsonv2`, `countrycodes=br`  
**Uso:** Quando ponto não tem lat/lng, geocodifica o endereço

---

### 2.6 Google Places e Foursquare (opcionais)

Configuráveis via `ENTORNO_PLACES_PROVIDER`. Se as API keys estiverem presentes, podem ser usados como alternativa ou complemento ao Overpass para a análise de entorno.

- **Google Places:** `https://maps.googleapis.com/maps/api/place/nearbysearch/json`
- **Foursquare:** `https://api.foursquare.com/v3/places/search`

---

## 3. Processamento Backend

### 3.1 `entornoAnalysis.js` — Análise de Afinidade de Segmento

**Fluxo:**
```
Ponto (lat,lng) + Segmento → Overpass API (800m) → Classificação POIs
→ Match com segment_target_categories → Cálculo de scores → Upsert entorno_cache
```

**Entrada:** `ponto_id`, `segmento` (ex: "clinica"), `raio` (default 800m)

**Scores produzidos:**
- `total_estabelecimentos_relacionados` — contagem de matches
- `score_relevancia` (0-100) — baseado em diversidade e presença
- `affinity_score` — `Σ(contagem_categoria × peso_categoria)`, normalizado
- `distancia_media` — média da distância haversine

**Auto-refresh:** Scheduler a cada 90 minutos (configurável) reprocessa pontos com cache expirado.

---

### 3.2 `geoAudienceService.js` — Inteligência de Bairro

**Fluxo:**
```
Ponto (lat,lng) → Overpass API (400m) → Classificação 13 grupos funcionais
→ Dot-product c/ vetores dos 9 tipos de bairro → Tipo + confiança + nível socioeconômico
→ Upsert geo_audience_profiles
```

**13 grupos funcionais:** corporate, commercial, food, health, education, leisure, fitness, transport, residential, beauty, hospitality, religious, green

**Scoring socioeconômico:**
- Contagem de POIs "premium" (spa, joalheria, perfumaria, academia boutique, vinho)
- Ratio premium/total → nível: alto (>15%), medio-alto (>8%), medio (>3%), medio-baixo

**Saída armazenada:** `neighborhood_type`, `confidence`, `socioeconomic_level`, `audience_narrative`, `lifestyle_indicators`

---

### 3.3 `censusAudienceService.js` — Classificação Demográfica

**Fluxo completo:**
```
Ponto (lat,lng,cidade) → IBGE Localidades (nome→código)
→ IBGE Malhas (GeoJSON setores) → Point-in-polygon (identifica setor)
→ IBGE Agregados (5 tabelas: pop, PIB, renda, educação, idade)
→ Overpass API (500m, POI analysis)
→ Score 4 perfis → Upsert census_audience_profiles
```

**Scoring de cada perfil (0–1):**

| Perfil | Sinal do Censo (50-70%) | Sinal de POIs (30-50%) |
|--------|-------------------------|------------------------|
| `alta_renda` | Renda alta + PIB alto + educação > 40% sup. completo | Joalheria, spa, concessionária, restaurante premium |
| `massa_varejo` | Renda média (bell curve em torno de R$2.500) + pop alta | Supermercado, lotérica, transporte público, lojas populares |
| `jovem_universitario` | % jovem 18-29 > 35% | Universidade, bar, coworking, academia |
| `terceira_idade` | % idoso 60+ > 25% | Farmácia, igreja, praça, clínica |

**Score geral:** `max(4 perfis) × 0.6 + média(4 perfis) × 0.4`

**Quando dados censitários faltam:** Peso do sinal de POIs aumenta para compensar (até 100% se nenhum dado IBGE disponível).

---

### 3.4 `pdfService.js` — Geração de PDF

**Entrada:** HTML completo com layout do MidiaKit  
**Processo:** Puppeteer headless → Chromium → PDF  
**Config:** Viewport 1366×900, fontes Poppins injetadas, request policy restritiva (whitelist de hosts)  
**Saída:** Buffer PDF armazenado em `backend/pdf-cache/{combinationKey}.pdf`  
**Fila:** Máximo 1 render simultâneo para gerenciar memória

---

## 4. Motor de Recomendação (Frontend)

### 4.1 Dimensões de Scoring

O motor de recomendação em `strategy.js` calcula uma pontuação de compatibilidade 0–100 para cada ponto usando **9 dimensões** ponderadas:

| Dimensão | Peso | Função | Dados de Entrada |
|----------|------|--------|------------------|
| `objetivo` | 20% | `scorePointByObjective()` | `tipo`, `fluxo`, `telas`, `loop`, `horario` × objetivo da campanha |
| `publico` | 16% | `scorePublicoAffinity()` + `scoreAudienceTagAffinity()` | `publico` do ponto × público-alvo selecionado; `audience_tags` × tags da campanha |
| `eficiencia` | 12% | `scoreCostEfficiency()` | `preco`, `fluxo`, `insercoes` → CPM, custo por inserção |
| `entorno` | 11% | `scoreSegmentEnvironment()` | `entorno_cache.affinity_score` por segmento |
| `geoaudience` | 10% | `scoreGeoAudienceAffinity()` | `geo_audience_profiles.neighborhood_type` × segmento do anunciante |
| `censusProfile` | 10% | `scoreCensusProfileAffinity()` | `census_audience_profiles` × tags de audiência + público selecionado |
| `segmento` | 8% | `scoreSegmentAffinity()` | `tipo` do ponto × segmento do anunciante (matches ideais: LED→varejo, Elevador→clínica) |
| `formato` | 8% | `getObjectiveFormatBoost()` | `tipo` × objetivo (ex: LED alto para "reconhecimento de marca") |
| `disponibilidade` | 5% | `scoreAvailabilityFit()` | `availability_calendar` × preferência de horário |

### 4.2 Funções de Scoring — Detalhamento

**`scorePointByObjective(point, objetivo)`**
- Entrada: ponto completo + objetivo da campanha
- Retorna: 0–40 (raw score)
- Lógica: Cada objetivo tem critérios — ex: "reconhecimento de marca" favorece alto fluxo e múltiplas telas; "presença premium" favorece tipo LED em locais A/B

**`scoreCostEfficiency(point)`**
- Entrada: `preco`, `fluxo`, `insercoes`
- Retorna: 0–30
- Lógica: CPM = preço/(fluxo/1000); menor CPM = maior score

**`scorePublicoAffinity(point, publicoNormalizado)`**
- Entrada: `publico` do ponto ("A/B"), público-alvo selecionado (["A", "B"])
- Retorna: 0–20
- Lógica: Match exato = 20; parcial = 10-15; sem match = 0

**`scoreAudienceTagAffinity(point, audienceTags)`**
- Entrada: `audience_tags` do ponto, tags selecionadas com pesos
- Retorna: 0–15
- Lógica: Proporção de tags em comum × peso de cada tag

**`scoreSegmentEnvironment(point, entornoByPoint)`**
- Entrada: `entorno_cache` scores indexados por ponto_id
- Retorna: 0–25
- Lógica: `affinity_score` normalizado para 0–25

**`scoreGeoAudienceAffinity(point, { segmento, publico, geoProfilesByPoint })`**
- Entrada: `geo_audience_profiles` indexado por ponto_id
- Retorna: 0–30
- Lógica: Matriz de afinidade bairro×segmento (ex: `polo_saude` × `clinica` = 1.8×, `zona_comercial` × `varejo` = 1.6×)

**`scoreCensusProfileAffinity(point, { publico, audienceTags, censusProfilesByPoint })`**
- Entrada: `census_audience_profiles` indexado por ponto_id
- Retorna: 0–40
- Lógica: Afinidade tag→perfil (0–20) + afinidade público→perfil (0–12) + bônus qualidade geral (0–8)
- Mapeamento tag→perfil: `classe-a` → `alta_renda`; `jovens` → `jovem_universitario`; `familias` → `massa_varejo`/`terceira_idade`; etc.

### 4.3 Fluxo do CampaignPlanner

**Dados carregados ao montar (useEffect):**
1. `fetchPontos()` → todos os pontos ativos
2. `fetchGeoAudienceProfiles()` → perfis de bairro de todos os pontos
3. `fetchCensusProfiles()` → perfis demográficos de todos os pontos

**Wizard de 5 passos:**
1. **Empresa** — nome, segmento (12 opções), contato
2. **Objetivo** — 5 objetivos de campanha
3. **Público** — seleção de audience tags + classe
4. **Praça e Investimento** — cidade, orçamento (4 faixas), período (2/4/8/12 semanas)
5. **Resultado** — ranking, mapa, estratégia

**Ao clicar "Gerar Recomendação":**
1. `suggestIdealPlan()` — seleciona os melhores pontos dentro do orçamento
2. `rankPointsWithScore()` — ranqueia todos os pontos 0–100 com breakdown por dimensão
3. `calculateCampaignScore()` — score geral da campanha
4. `generateStrategicJustification()` — texto estratégico
5. `estimateReachFrequency()` — alcance e frequência estimados

**Exibição dos resultados:**
- Card de cada ponto com score 0–100 e barras das 4 dimensões mais fortes
- Badge de GeoAudiência (tipo de bairro + nível socioeconômico)
- Badge de Perfil Census (perfil dominante + score %)
- Mapa interativo (SmartMap com Leaflet)
- Justificativa estratégica textual
- Totais: valor total, fluxo total, alcance estimado, frequência

---

## 5. Endpoints API

### 5.1 Pontos de Mídia

| Método | Rota | Auth | Parâmetros | Retorno |
|--------|------|------|-----------|---------|
| GET | `/api/pontos` | — | `cidade`, `tipo`, `publico`, `audience_tag`, `availabilityPreference`, `search`, `perfil`, `elevador_categoria` | Array de pontos (campos hidratados) |
| GET | `/api/pontos/:id` | — | `id` | Ponto único |
| POST | `/api/pontos` | admin | FormData (imagem, imagem2, simulacao_arte, simulacao_preview + campos texto) | Novo ponto |
| PUT | `/api/pontos/:id` | admin | FormData | Ponto atualizado |
| DELETE | `/api/pontos/:id` | admin | `id` | Confirmação |

### 5.2 Stats e Metadados

| Método | Rota | Retorno |
|--------|------|---------|
| GET | `/api/stats` | `{ total, cidades, telas, fluxo }` |
| GET | `/api/publicos` | Array de públicos distintos |
| GET | `/api/cidades` | Array de cidades disponíveis |

### 5.3 Autenticação

| Método | Rota | Parâmetros | Retorno |
|--------|------|-----------|---------|
| POST | `/api/auth/login` | `username`, `password` | `{ success, token, user }` |

### 5.4 Entorno (Análise de Segmento)

| Método | Rota | Auth | Parâmetros | Retorno |
|--------|------|------|-----------|---------|
| GET | `/api/entorno/scores` | roles | `segmento`, `raio`, `cidade`, `force` | `{ metrics[], byPoint, coverage }` |
| POST | `/api/entorno/analyze` | roles | `segmento`, `raio`, `cidade` | `{ jobId, segment, radius }` |
| GET | `/api/entorno/jobs/:jobId` | roles | `jobId` | Status do job |
| GET | `/api/entorno/categories` | roles | `segmento` | Categorias com pesos |

### 5.5 GeoAudiência (Classificação de Bairro)

| Método | Rota | Auth | Parâmetros | Retorno |
|--------|------|------|-----------|---------|
| GET | `/api/geoaudience/profiles` | roles | `cidade` | `{ profiles: {[id]: perfil}, summary }` |
| GET | `/api/geoaudience/profile/:id` | roles | `pontoId` | Perfil único |
| GET | `/api/geoaudience/coverage` | roles | `cidade` | Cobertura e distribuição |
| GET | `/api/geoaudience/types` | — | — | Definições dos 9 tipos de bairro |
| GET | `/api/geoaudience/geojson` | roles | `cidade`, `tipo` | GeoJSON FeatureCollection |
| POST | `/api/geoaudience/analyze` | roles | `cidade`, `force` | Disparo de análise batch |
| POST | `/api/geoaudience/analyze/:id` | roles | `pontoId` | Análise de ponto único |

### 5.6 Census (Classificação Demográfica)

| Método | Rota | Auth | Parâmetros | Retorno |
|--------|------|------|-----------|---------|
| GET | `/api/census/profiles` | roles | `municipio`, `perfil`, `min_score` | Array de perfis |
| GET | `/api/census/profile/:id` | roles | `pontoId` | Perfil único |
| GET | `/api/census/coverage` | roles | `municipio` | Cobertura e distribuição |
| GET | `/api/census/types` | — | — | Definições dos 4 perfis |
| GET | `/api/census/geojson` | roles | `municipio`, `perfil`, `min_score` | GeoJSON FeatureCollection |
| POST | `/api/census/analyze` | roles | `municipio`, `force` | Análise batch (202 async) |
| POST | `/api/census/analyze/:id` | roles | `pontoId` | Análise de ponto único |

### 5.7 PDF

| Método | Rota | Auth | Parâmetros | Retorno |
|--------|------|------|-----------|---------|
| POST | `/api/pdf/render` | roles | body HTML + config | Buffer PDF |
| GET | `/api/pdf/cache` | roles | `combinationKey` | PDF cacheado |

### 5.8 Propostas

| Método | Rota | Auth | Parâmetros | Retorno |
|--------|------|------|-----------|---------|
| GET | `/api/propostas` | roles | — | Lista de propostas do usuário |
| POST | `/api/propostas` | roles | `titulo`, `pontos_json`, `desconto_*` | Nova proposta |
| PUT | `/api/propostas/:id` | roles | Campos a atualizar | Proposta atualizada |
| POST | `/api/propostas/:id/aprovar` | gerente+ | `motivo` | Aprovação |
| POST | `/api/propostas/:id/rejeitar` | gerente+ | `motivo` | Rejeição |

---

## 6. Uploads

**Middleware:** Multer (disk storage)  
**Diretório:** `backend/uploads/`  
**Nomenclatura:** `{UUID}.{ext}`  
**Tipos aceitos:** `image/jpeg`, `image/png`, `image/webp`  
**Tamanho máximo:** 50 MB por arquivo

**4 campos de upload por ponto:**

| Campo | Descrição | Max arquivos |
|-------|-----------|-------------|
| `imagem` | Foto principal do ponto | 1 |
| `imagem2` | Foto secundária/backdrop | 1 |
| `simulacao_arte` | Arte de simulação | 1 |
| `simulacao_preview` | Preview da simulação | 1 |

**Servidos como estáticos:** `GET /uploads/{arquivo}` — cache 7 dias, ETag habilitado

---

## 7. Autenticação

**Módulo:** `backend/auth.js`

**Hash de senha:** `scrypt` com salt aleatório de 16 bytes, `N=16384`, key len 64, digest SHA-512  
**Formato armazenado:** `scrypt$16384${salt_hex}${hash_hex}`

**Token de autenticação:**
- Formato custom: `{base64url_payload}.{hmac_sha256_signature}`
- Payload: `{ sub: userId, username, role, iat, exp }`
- Segredo: `AUTH_SECRET` (env) ou efêmero se não configurado
- TTL: 12 horas (configurável via `AUTH_TOKEN_TTL_SECONDS`)
- Verificação com `crypto.timingSafeEqual` contra timing attacks

**Middleware de rotas:**
- `requireAuth` — valida token Bearer no header Authorization
- `requireRoles(['admin', 'gerente_comercial'])` — valida papel do usuário

**Rate limiting:**
- Login: 15 tentativas em 15 minutos
- API geral: 600 requests em 15 minutos
- PDF render: 50 em 15 minutos

---

## 8. Configurações

### Variáveis de Ambiente Principais

| Variável | Default | Uso |
|----------|---------|-----|
| `PORT` | 3002 | Porta do Express |
| `DB_ENGINE` | sqlite | Engine do DB (sqlite ou postgres) |
| `DATABASE_URL` | — | String de conexão PostgreSQL |
| `AUTH_SECRET` | (efêmero) | Segredo para assinatura de tokens |
| `AUTH_TOKEN_TTL_SECONDS` | 43200 (12h) | Duração dos tokens |
| `FRONTEND_ORIGINS` | localhost + prod | Origens CORS permitidas |
| `OVERPASS_API_URL` | overpass-api.de | URL do Overpass |
| `GOOGLE_PLACES_API_KEY` | — | Chave Google Places (opcional) |
| `FOURSQUARE_API_KEY` | — | Chave Foursquare (opcional) |
| `ENTORNO_PLACES_PROVIDER` | auto | Provedor de POIs |
| `ENTORNO_DEFAULT_RADIUS_METERS` | 800 | Raio padrão do entorno |
| `ENTORNO_CACHE_TTL_HOURS` | 72 | TTL cache entorno |
| `ENTORNO_AUTO_REFRESH_ENABLED` | true | Ativar auto-refresh |
| `ENTORNO_AUTO_REFRESH_INTERVAL_MINUTES` | 90 | Intervalo do refresh |
| `GEOAUDIENCE_RADIUS` | 400 | Raio geoaudiência |
| `GEOAUDIENCE_CACHE_TTL_HOURS` | 168 (7d) | TTL cache geoaudiência |
| `CENSUS_ANALYSIS_RADIUS` | 500 | Raio análise census |
| `CENSUS_CACHE_TTL_HOURS` | 168 (7d) | TTL cache census |
| `LICENSE_URL` | — | URL do JSON de licença |
| `LICENSE_CLIENT` | — | ID do cliente na licença |
| `SQLITE_BACKUP_INTERVAL_MINUTES` | 360 (6h) | Intervalo de backup |
| `SQLITE_BACKUP_RETENTION_DAYS` | 14 | Retenção de backups |

### Licenciamento

O módulo `backend/license.js` faz verificação remota da licença:
- Busca JSON em `LICENSE_URL`
- Valida `LICENSE_CLIENT` no JSON
- Verifica: flag `active`, data de expiração
- Grace period de 24h se servidor offline
- Se inválida pós-grace, processo encerra

---

## 9. Backup e Cache

### 9.1 Backup do SQLite

**Módulo:** `backend/backupService.js`  
**Diretório:** `backend/backups/`  
**Intervalo:** 6 horas (configurável)  
**Retenção:** 14 dias (configurável)  
**Método:** Cópia do arquivo `.db` com nomeação timestamped

### 9.2 Estratégias de Cache

| Dado | Local | TTL | Invalidação |
|------|-------|-----|-------------|
| Entorno (POIs de segmento) | `entorno_cache` (DB) | 72 horas | `expires_at` + auto-refresh |
| GeoAudiência (bairro) | `geo_audience_profiles` (DB) | 7 dias | `expires_at` |
| Census (demográfico) | `census_audience_profiles` (DB) | 7 dias | `expires_at` |
| Código IBGE do município | In-memory `cityCodeCache` | 24 horas | Automático |
| Malha censitária (GeoJSON) | In-memory `meshCache` | 24 horas | Automático |
| PDF renderizado | `pdf_cache` (DB) + arquivo em disco | Indefinido | Invalidação manual (`is_valid=0`) |
| Imagens de pontos | Arquivos estáticos | 7 dias (HTTP cache) | Substituição por upload |

---

## 10. Fluxo de Dados Completo

```
╔══════════════════════════════════════════════════════════════════╗
║                     FONTES DE DADOS EXTERNAS                     ║
╠══════════════════════════════════════════════════════════════════╣
║                                                                  ║
║  ┌──────────────┐  ┌────────────────┐  ┌─────────────────────┐  ║
║  │  Overpass API │  │ IBGE Agregados │  │ IBGE Malhas/Locais  │  ║
║  │  (OSM POIs)  │  │ (Censo 2022)   │  │ (GeoJSON setores)   │  ║
║  └──────┬───────┘  └───────┬────────┘  └──────────┬──────────┘  ║
║         │                  │                       │             ║
╚═════════╪══════════════════╪═══════════════════════╪═════════════╝
          │                  │                       │
          ▼                  ▼                       ▼
  ┌───────────────────────────────────────────────────────────┐
  │                    BACKEND (Express/Node)                  │
  │                                                           │
  │  ┌─────────────────┐ ┌──────────────────┐ ┌────────────┐ │
  │  │ entornoAnalysis  │ │ geoAudienceServ. │ │ censusAud. │ │
  │  │ (800m, segmento) │ │ (400m, bairro)   │ │ (500m,IBGE)│ │
  │  └────────┬────────┘ └────────┬─────────┘ └─────┬──────┘ │
  │           │                   │                  │        │
  │           ▼                   ▼                  ▼        │
  │  ┌─────────────┐  ┌──────────────────┐  ┌─────────────┐  │
  │  │entorno_cache│  │geo_audience_prof.│  │census_aud.  │  │
  │  │ TTL: 72h    │  │ TTL: 7 dias      │  │ TTL: 7 dias │  │
  │  └─────────────┘  └──────────────────┘  └─────────────┘  │
  │           │                   │                  │        │
  │           └───────────────────┼──────────────────┘        │
  │                               │                           │
  │                    ┌──────────▼──────────┐                │
  │                    │   API REST Routes   │                │
  │                    │  /pontos, /entorno,  │                │
  │                    │  /geoaudience,       │                │
  │                    │  /census, /pdf       │                │
  │                    └──────────┬──────────┘                │
  └───────────────────────────────┼───────────────────────────┘
                                  │
                                  ▼
  ┌───────────────────────────────────────────────────────────┐
  │                    FRONTEND (React/Vite)                   │
  │                                                           │
  │  ┌──────────┐  ┌─────────────┐  ┌──────────────────────┐ │
  │  │ api.js   │  │ strategy.js │  │ CampaignPlanner.jsx  │ │
  │  │ (fetches)│─▶│ (9 scoring  │─▶│ (wizard 5 passos     │ │
  │  │          │  │  dimensions) │  │  + ranking + mapa)   │ │
  │  └──────────┘  └─────────────┘  └──────────────────────┘ │
  │                                                           │
  │  Dados consumidos pelo motor:                             │
  │  • pontos[] — cadastro completo                           │
  │  • entornoByPoint — {[pontoId]: scores}                   │
  │  • geoProfilesByPoint — {[pontoId]: perfil de bairro}     │
  │  • censusProfilesByPoint — {[pontoId]: perfil demográfico}│
  │                                                           │
  │  Saída para o usuário:                                    │
  │  • Ranking 0–100 com breakdown por dimensão               │
  │  • Plano ideal (pontos + orçamento otimizado)             │
  │  • Score da campanha                                      │
  │  • Justificativa estratégica                              │
  │  • Estimativa de alcance e frequência                     │
  │  • Mapa interativo com GeoJSON                            │
  └───────────────────────────────────────────────────────────┘
```

### Ciclo de vida de um dado

**Cadastro de ponto:**
```
Admin cria ponto (formulário) → POST /api/pontos → INSERT pontos
→ Scheduler detecta novo ponto → entornoAnalysis (800m) → INSERT entorno_cache
→ Trigger manual ou auto → geoAudienceService (400m) → INSERT geo_audience_profiles
→ Trigger manual ou auto → censusAudienceService (500m) → INSERT census_audience_profiles
```

**Consumo no motor de recomendação:**
```
Usuário abre CampaignPlanner → Fetch paralelo: pontos + geoProfiles + censusProfiles
→ Preenche wizard (empresa, objetivo, público, praça, orçamento)
→ Clica "Gerar Recomendação"
→ strategy.js calcula 9 dimensões × N pontos
→ Ranking + plano ideal + justificativa
→ Renderiza cards com badges de GeoAudiência e Census
```

**Expiração e refresh:**
```
TTL expirou? →
  entorno_cache: auto-refresh scheduler (90min interval)
  geoaudience: manual trigger via POST /geoaudience/analyze
  census: manual trigger via POST /census/analyze
→ Overpass + IBGE APIs re-consultados → DB atualizado
```
