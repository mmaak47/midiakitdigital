# Dados do Sistema — MidiaKit Digital

Documentação completa de todos os dados utilizados no sistema, suas origens, transformações e como são consumidos.

---

## Índice

1. [Banco de Dados (Schema Completo)](#1-banco-de-dados)
2. [APIs Externas Consumidas](#2-apis-externas)
3. [Processamento de Dados (Backend)](#3-processamento-backend)
4. [Motor de Recomendação (Frontend)](#4-motor-de-recomendação)
   - [4.4 Métricas Estimadas — Como Cada Dado É Calculado](#44-métricas-estimadas--como-cada-dado-é-calculado)
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

Classifica cada ponto em 1 dos 9 tipos de bairro com base nos POIs no raio de 800m.

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

Classifica cada ponto em 4 perfis demográficos usando dados do Censo IBGE 2022 + POIs do OSM em 800m.

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
| `alta_renda` | Alta Renda | Renda média ≥ R$5.000, % superior completo > 40%, POIs premium (joalheria, spa, escritórios de advocacia/financeiro/seguros). Peso: 35% POI / 65% censo |
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
| `geoAudienceService.js` | 800m | amenity, shop, healthcare, office, tourism, leisure, building | Classificação de tipo de bairro |
| `censusAudienceService.js` | 800m | amenity, shop, healthcare, office, tourism, leisure | Validação de perfil demográfico |

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

### 3.2 `geoAudienceService.js` — Inteligência de Bairro (Classificação Completa)

**Fluxo:**
```
Ponto (lat,lng) → Overpass API (800m) → Classificação em 13 grupos funcionais
→ Vetor de proporções observadas → Similaridade cosseno c/ vetores dos 9 tipos de bairro
→ Tipo + confiança + nível socioeconômico + densidade + lifestyle + narrativa
→ Upsert geo_audience_profiles
```

#### 3.2.1 Etapa 1 — Coleta de POIs (Overpass API)

O serviço consulta **todos** os nós e ways num raio de **800m** do ponto, usando as tag keys: `amenity`, `shop`, `healthcare`, `office`, `tourism`, `leisure`, `building`.

#### 3.2.2 Etapa 2 — Classificação Funcional (`classifyElement`)

Cada POI retornado é classificado em **1 dos 13 grupos funcionais**. A classificação percorre os grupos em ordem e retorna o primeiro match (tag key + valor).

| Grupo | Tags OSM aceitas |
|-------|------------------|
| **corporate** | `office: *` (qualquer), `amenity: bank, bureau_de_change, coworking_space` |
| **commercial** | `shop: supermarket, convenience, clothes, shoes, mobile_phone, electronics, department_store, mall, optician, jewelry, gift, toys, variety_store, furniture, hardware, trade, stationery, photo, fabric, watches, bag`; `amenity: marketplace, post_office` |
| **food** | `amenity: restaurant, fast_food, cafe, food_court, ice_cream, bar, pub, biergarten`; `shop: bakery, butcher, confectionery, deli, greengrocer, pastry, coffee, seafood, cheese, beverages, alcohol, wine` |
| **health** | `amenity: hospital, clinic, doctors, dentist, veterinary`; `healthcare: *`; `shop: pharmacy, chemist, medical_supply, hearing_aids, herbalist` |
| **education** | `amenity: school, university, college, kindergarten, library, language_school, music_school, driving_school, training` |
| **leisure** | `amenity: cinema, theatre, casino, arts_centre, nightclub, community_centre`; `tourism: museum, gallery, theme_park, attraction, viewpoint, zoo`; `leisure: dance, escape_game, amusement_arcade, bowling_alley, miniature_golf` |
| **fitness** | `leisure: sports_centre, fitness_centre, swimming_pool, pitch, track, stadium`; `shop: sports` |
| **transport** | `amenity: bus_station, taxi, car_rental, fuel, parking, bicycle_rental, ferry_terminal, car_wash`; `shop: car, car_repair, car_parts, motorcycle, tyres` |
| **residential** | `building: residential, apartments, house, detached, terrace, dormitory`; `amenity: childcare, social_facility` |
| **beauty** | `shop: beauty, hairdresser, cosmetics, perfumery, tattoo`; `amenity: spa` |
| **hospitality** | `tourism: hotel, motel, hostel, guest_house, apartment, camp_site, chalet` |
| **religious** | `amenity: place_of_worship` |
| **green** | `leisure: park, garden, nature_reserve, playground, dog_park`; `amenity: fountain` |

Simultaneamente, conta-se os POIs **premium** — aqueles cujo valor de tag pertence a um destes conjuntos:

- **PREMIUM_INDICATORS:** `coworking_space`, `spa`, `gym`, `fitness_centre`, `sports_centre`, `swimming_pool`
- **PREMIUM_SHOP_INDICATORS:** `beauty`, `cosmetics`, `perfumery`, `jewelry`, `watches`, `wine`

**Saída da etapa:** `groupCounts` (contagem por grupo), `total` (total de POIs classificados), `premiumCount`, `poiDetails` (array com nome, grupo, distância).

#### 3.2.3 Etapa 3 — Classificação de Tipo de Bairro (`classifyNeighborhood`)

O algoritmo usa **similaridade cosseno** entre o vetor de proporções observadas e os vetores de referência de cada tipo de bairro.

**Requisito mínimo:** Se `total < 3`, retorna `type: "indefinido"`.

**Vetor observado:** Para cada grupo `g`, calcula `observed[g] = groupCounts[g] / total`.

**Vetores de referência dos 9 tipos de bairro:**

| Tipo | corporate | commercial | food | health | education | leisure | fitness | transport | residential | beauty | hospitality | green |
|------|-----------|------------|------|--------|-----------|---------|---------|-----------|-------------|--------|-------------|-------|
| `centro_corporativo` | **0.25** | 0.15 | **0.20** | 0.05 | — | — | — | 0.10 | — | — | — | — |
| `zona_comercial` | — | **0.30** | **0.20** | 0.08 | — | — | — | 0.10 | — | — | — | — |
| `residencial_premium` | — | — | 0.15 | — | — | — | **0.12** | — | **0.20** | **0.10** | — | 0.10 |
| `residencial_medio` | — | 0.15 | — | 0.10 | 0.08 | — | — | 0.12 | **0.25** | — | — | — |
| `zona_universitaria` | — | 0.10 | **0.20** | — | **0.30** | 0.10 | — | — | — | — | — | — |
| `zona_lazer` | — | — | **0.25** | — | — | **0.20** | — | — | — | 0.05 | 0.10 | — |
| `zona_popular_densa` | — | **0.20** | 0.15 | — | — | — | — | **0.20** | 0.15 | — | — | — |
| `polo_saude` | — | 0.10 | 0.15 | **0.35** | — | — | — | 0.08 | — | — | — | — |
| `polo_educacional` | — | 0.15 | 0.15 | — | **0.30** | — | — | 0.08 | — | — | — | — |

> Células com `—` = 0. Valores em **negrito** são os componentes dominantes de cada tipo.

**Fórmula da similaridade cosseno:**

$$
\text{similarity}(obs, ref) = \frac{\sum_{g \in \text{grupos}} obs_g \cdot ref_g}{\sqrt{\sum_g obs_g^2} \cdot \sqrt{\sum_g ref_g^2}}
$$

O tipo com maior similaridade é selecionado. A **confiança** é `similarity × 100` (0–100).

**Metadados associados** de cada tipo (armazenados junto com a classificação):

| Tipo | Label | Nível socioeconômico | Ambiente | Atividade dominante |
|------|-------|---------------------|----------|---------------------|
| `centro_corporativo` | Centro Corporativo | alto | corporativo | Escritórios, serviços financeiros e alimentação executiva |
| `zona_comercial` | Zona Comercial | medio-alto | comercial | Comércio varejista, alimentação e serviços |
| `residencial_premium` | Residencial Premium | alto | residencial alto padrão | Moradia de alto padrão, lazer e bem-estar |
| `residencial_medio` | Residencial Médio | medio | residencial | Moradia, comércio local e serviços essenciais |
| `zona_universitaria` | Zona Universitária | medio | universitário | Ensino superior, alimentação e serviços estudantis |
| `zona_lazer` | Zona de Lazer e Entretenimento | medio-alto | entretenimento | Gastronomia, bares, entretenimento e hotelaria |
| `zona_popular_densa` | Zona Popular de Alta Densidade | medio-baixo | popular denso | Transporte público, comércio popular e serviços essenciais |
| `polo_saude` | Polo de Saúde | medio-alto | saúde | Hospitais, clínicas, farmácias e serviços médicos |
| `polo_educacional` | Polo Educacional | medio | educacional | Escolas, cursos, livrarias e serviços educacionais |

#### 3.2.4 Etapa 4 — Inferência Socioeconômica (`inferSocioeconomic`)

Calcula um score 0–100 baseado em 4 componentes ponderados:

$$
\text{rawScore} = (\text{premiumRatio} \times 35) + (\text{fitnessBeautyRatio} \times 30) + (\text{corporateRatio} \times 20) + \min(15, \text{total} \times 0.15)
$$

Onde:
- `premiumRatio` = `premiumCount / total` — proporção de POIs premium (spa, joalheria, perfumaria, academia, vinho)
- `fitnessBeautyRatio` = `(fitness + beauty) / total` — proporção de POIs de fitness + beleza
- `corporateRatio` = `corporate / total` — proporção de POIs corporativos
- `total × 0.15` (máx 15) — bônus de diversidade/volume ("mais POIs = área mais desenvolvida")

**Thresholds de nível:**

| Score | Nível |
|-------|-------|
| ≥ 60 | `alto` |
| 40–59 | `medio-alto` |
| 20–39 | `medio` |
| < 20 | `medio-baixo` |

#### 3.2.5 Etapa 5 — Densidade Urbana (`inferUrbanDensity`)

Calcula POIs por km² dentro do raio de análise:

$$
\text{density} = \frac{\text{total\_pois}}{\pi \times (r/1000)^2}
$$

| Densidade (POIs/km²) | Label |
|----------------------|-------|
| ≥ 300 | `muito alta` |
| 150–299 | `alta` |
| 60–149 | `media` |
| 20–59 | `baixa` |
| < 20 | `muito baixa` |

#### 3.2.6 Etapa 6 — Indicadores de Estilo de Vida (`inferLifestyle`)

Se `total ≥ 3`, analisa a proporção de cada grupo e ativa indicadores:

| Indicador | Condição | Descrição |
|-----------|----------|-----------|
| `fitness_e_saude` | fitness ≥ 8% | Área com academias, esportes, piscinas |
| `estetica_e_beleza` | beauty ≥ 5% | Salões, cosméticos, perfumaria |
| `gastronomia` | food ≥ 25% | Alta concentração gastronômica |
| `entretenimento` | leisure ≥ 10% | Cinemas, teatros, vida noturna |
| `profissional_executivo` | corporate ≥ 15% | Escritórios, bancos, coworkings |
| `educacao` | education ≥ 15% | Escolas, universidades, cursos |
| `saude_e_bem_estar` | health ≥ 15% | Hospitais, clínicas, farmácias |
| `turismo` | hospitality ≥ 5% | Hotéis, hostels, pousadas |
| `ar_livre` | green ≥ 8% | Parques, jardins, praças |
| `alta_mobilidade` | transport ≥ 15% | Estações, combustíveis, estacionamentos |
| `vida_residencial` | residential ≥ 15% | Prédios, casas, serviços familiares |

#### 3.2.7 Etapa 7 — Narrativa de Audiência (`generateNarrative`)

Gera um texto descritivo em Markdown combinando:
1. **Abertura** — tipo de bairro + densidade urbana
2. **POIs dominantes** — top 3 grupos por contagem (com % do total)
3. **Perfil socioeconômico** — descrição textual do nível
4. **Indicadores de lifestyle** — lista dos indicadores ativos
5. **Demografia municipal** — população + PIB per capita (dados IBGE)

#### 3.2.8 Matriz de Afinidade Segmento ↔ Bairro

A matriz `SEGMENT_NEIGHBORHOOD_AFFINITY` aplica **multiplicadores de bônus** ao score de recomendação quando o tipo de bairro é favorável para o segmento do anunciante. Valor `1.0` = neutro (sem bônus).

| Segmento | Bairros com bônus (multiplicador) |
|----------|-----------------------------------|
| `clinica` | polo_saude ×1.8, residencial_premium ×1.4, centro_corporativo ×1.2 |
| `hospital` | polo_saude ×1.9, residencial_medio ×1.2 |
| `escola` | polo_educacional ×1.8, residencial_medio ×1.5, residencial_premium ×1.3 |
| `faculdade` | zona_universitaria ×1.9, polo_educacional ×1.4, zona_lazer ×1.2 |
| `construtora` | residencial_premium ×1.6, centro_corporativo ×1.3, residencial_medio ×1.2 |
| `imobiliaria` | residencial_premium ×1.7, centro_corporativo ×1.3, zona_comercial ×1.2 |
| `varejo` | zona_comercial ×1.8, zona_popular_densa ×1.4, residencial_medio ×1.2 |
| `restaurante` | zona_lazer ×1.7, zona_comercial ×1.4, centro_corporativo ×1.3 |
| `contabilidade` | centro_corporativo ×1.8, zona_comercial ×1.3 |
| `advocacia` | centro_corporativo ×1.8, zona_comercial ×1.2 |
| `industria` | zona_popular_densa ×1.3, zona_comercial ×1.2 |
| `outro` | sem bônus |

**Saída armazenada em `geo_audience_profiles`:** `neighborhood_type`, `neighborhood_label`, `confidence`, `socioeconomic_level`, `socioeconomic_score`, `environment_type`, `dominant_activity`, `urban_density`, `pois_per_km2`, `lifestyle_indicators` (JSON), `poi_summary` (JSON), `total_pois`, `audience_narrative`, `premium_count`, `demographic_data` (JSON), `raw_data` (JSON).

**Cache:** TTL 7 dias. Auto-refresh via scheduler a cada 90 minutos.

---

### 3.3 `censusAudienceService.js` — Classificação Demográfica (Censo IBGE)

**Fluxo completo:**
```
Ponto (lat,lng,cidade) → IBGE Localidades (nome→código)
→ IBGE Malhas (GeoJSON setores) → Point-in-polygon (identifica setor censitário)
→ IBGE Agregados (5 tabelas: pop, PIB, renda, educação, idade)
→ Overpass API (800m, classificação de POIs por perfil)
→ Score combinado (censo + POIs) para 4 perfis → Upsert census_audience_profiles
```

#### 3.3.1 Definição dos 4 Perfis Demográficos

Cada perfil tem uma lista de **POIs indicadores** (tags OSM que sinalizam afinidade) e um `expectedPois` (valor de normalização):

**Alta Renda** (`alta_renda`) — expectedPois: 30
- `amenity`: bank, bureau_de_change, clinic, doctors, dentist, spa, coworking_space
- `shop`: department_store, jewelry, watches, perfumery, wine, cosmetics, beauty, optician, bag
- `leisure`: fitness_centre, sports_centre, swimming_pool
- `office`: lawyer, financial, insurance, consulting, accountant, it, architect, estate_agent, investment
- `tourism`: hotel

> **Nota:** Até commit 8a5fbe4 o perfil `alta_renda` usava `office: ['__any__']` (qualquer escritório), o que causava todos os pontos serem classificados como Alta Renda em raio 800 m. Corrigido no commit 2cf1927 para tipos premium específicos.

**Massa / Varejo** (`massa_varejo`) — expectedPois: 40
- `amenity`: marketplace, post_office, bus_station, fuel, parking, taxi, car_wash, fast_food
- `shop`: supermarket, convenience, clothes, mobile_phone, variety_store, hardware, shoes, electronics, butcher, greengrocer, bakery, lottery, tyres, car_repair
- `building`: commercial
- `office`: qualquer (escritórios genéricos são indicadores comerciais)

**Jovem / Universitário** (`jovem_universitario`) — expectedPois: 20
- `amenity`: university, college, language_school, bar, pub, nightclub, cafe, fast_food, bicycle_rental, library, cinema, coworking_space, food_court
- `shop`: books, computer, mobile_phone, coffee, sports
- `leisure`: dance, escape_game, amusement_arcade, fitness_centre, sports_centre

**Terceira Idade** (`terceira_idade`) — expectedPois: 20
- `amenity`: hospital, clinic, doctors, place_of_worship, social_facility, community_centre, pharmacy
- `healthcare`: qualquer
- `leisure`: park, garden, playground, nature_reserve
- `shop`: pharmacy, chemist, hearing_aids, medical_supply, herbalist

> **Nota:** Um mesmo POI pode contar para múltiplos perfis (ex: farmácia conta para `massa_varejo` se for supermercado e para `terceira_idade` se for farmácia).

#### 3.3.2 Dados Censitários do IBGE

O serviço consulta 5 tabelas do IBGE Agregados para o município:

**Tabela 9606 — Faixas de Renda** → `rendaMediaDomiciliar`
- Parseia os brackets do tipo "Até ¼ de salário mínimo", "Mais de ½ a 1 salário mínimo", etc.
- Mapeia cada bracket para valor médio em R$ (SM 2022 = R$ 1.212):
  - Até ¼ SM → R$ 151,50 | ¼ a ½ SM → R$ 454,50 | ½ a 1 SM → R$ 909,00
  - 1 a 2 SM → R$ 1.818,00 | 2 a 3 SM → R$ 3.030,00 | 3 a 5 SM → R$ 4.848,00
  - 5 a 10 SM → R$ 9.090,00 | 10 a 20 SM → R$ 18.180,00 | 20+ SM → R$ 30.300,00
- Renda média = `Σ(valor_médio × quantidade) / Σ(quantidade)`

**Tabela 9529 — Nível de Instrução** → `pctInstrucaoSuperior`
- Busca variável cujo label contém "Superior completo"
- Calcula: `população com superior completo / população total`

**Tabela 9514 — Faixas Etárias** → `pctJovem18_29`, `pctIdoso60plus`
- Parseia brackets do formato "X a Y anos"
- `pctJovem18_29` = soma das faixas 18-19, 20-24, 25-29 / total
- `pctIdoso60plus` = soma das faixas 60-64, 65-69, 70-74, 75-79, 80+ / total

**Tabela 4714 — População** → `population`

**Tabela 5938 — PIB** → `pibPerCapita` (usado como fallback se tabela 9606 não retornar dados)

#### 3.3.3 Identificação do Setor Censitário

1. Busca a malha GeoJSON do município via IBGE Malhas API (`intrarregiao=setor`)
2. Pré-computa bounding boxes para cada feature (otimização)
3. Para o ponto (lat, lng), realiza **point-in-polygon** via algoritmo ray-casting
4. Se encontrar feature, extrai código do setor (usado como referência)

#### 3.3.4 Motor de Scoring (`scoreProfiles`)

Cada perfil recebe um score final 0–1 combinando **sinal de POIs** e **sinal censitário**, com pesos diferentes por perfil.

**Fórmula genérica:**

$$
\text{score} = \text{poiSignal} \times w_{poi} + \frac{\text{censusSignal}}{\text{censusWeight}} \times w_{census}
$$

Se dados censitários não estiverem disponíveis, `score = poiSignal` (exceto `alta_renda`, que é limitado a `poiSignal × 0.70` para evitar falsos positivos sem dados censitários).

---

**Alta Renda** — `poiWeight = 0.35`, `censusWeight = 0.65`

| Componente censitário | Fórmula | Peso interno |
|-----------------------|---------|-------------|
| Renda média domiciliar | `clamp(renda / 5000)` | 0.45 |
| PIB per capita | `clamp(pib / 50000)` | 0.30 |
| % superior completo | `clamp(pctSuperior / 0.40)` | 0.25 |

`poiSignal = clamp(poiCount / 30)`

> Sem dados censitários: `score = poiSignal × 0.70` (teto de 70% para evitar classificação premium sem confirmação censitária).

---

**Massa / Varejo** — `poiWeight = 0.50`, `censusWeight = 0.50`

| Componente censitário | Fórmula | Peso interno |
|-----------------------|---------|-------------|
| Renda (curva-sino em R$3.000) | `clamp(1 - |renda - 3000| / 3000)` | 0.50 |
| População | `clamp(pop / 200000)` | 0.50 |

`poiSignal = clamp(poiCount / 40)`

> A renda usa uma **curva-sino** com pico em R$ 3.000 — pontuação máxima para classe média, decaindo para rendas muito altas ou baixas.

---

**Jovem / Universitário** — `poiWeight = 0.55`, `censusWeight = 0.45`

| Componente censitário | Fórmula | Peso interno |
|-----------------------|---------|-------------|
| % jovens 18-29 | `clamp(pctJovem / 0.35)` | 1.0 |
| Fallback (pop > 100k) | `clamp(pop / 500000) × 0.3` | 0.3 |

`poiSignal = clamp(poiCount / 20)`

> Fallback: cidades maiores tendem a ter mais jovens; usado quando dados de faixa etária não estão disponíveis.

---

**Terceira Idade** — `poiWeight = 0.50`, `censusWeight = 0.50`

| Componente censitário | Fórmula | Peso interno |
|-----------------------|---------|-------------|
| % idosos 60+ | `clamp(pctIdoso / 0.25)` | 1.0 |

`poiSignal = clamp(poiCount / 20)`

---

#### 3.3.5 Score Geral e Perfil Dominante

Após calcular os 4 scores individuais:

$$
\text{scoreGeral} = \max(\text{4 perfis}) \times 0.6 + \text{média}(\text{4 perfis}) \times 0.4
$$

O **perfil dominante** é aquele com o maior score individual.

**Saída armazenada em `census_audience_profiles`:** `perfil_alta_renda`, `perfil_massa_varejo`, `perfil_jovem_universitario`, `perfil_terceira_idade`, `perfil_dominante`, `score_geral`, `municipio`, `municipio_ibge_code`, `setor_censitario`, `pois_proximos` (JSON), `fontes_dados` (JSON), `dados_censitarios` (JSON), `dados_pois` (JSON), `total_pois`.

**Cache:** TTL 7 dias (168 horas). Auto-refresh via scheduler a cada 90 minutos.

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

## 4.4 Métricas Estimadas — Como Cada Dado É Calculado

Esta seção explica, em linguagem natural com fórmulas matemáticas, como o sistema calcula cada métrica exibida no Planejador de Campanha e demais telas. Nenhum dado de audiência é coletado em tempo real; todos os valores são **estimativas baseadas em modelos estatísticos** amplamente utilizados no mercado DOOH.

---

### Fluxo Mensal

**O que é:** Quantidade total de pessoas que passam pelo ponto de mídia por mês. É a unidade-base de todas as demais estimativas.

**Como é obtido:** O fluxo de cada ponto é informado manualmente no cadastro, podendo ser baseado em dados de concessionária, estudo de tráfego, medição de câmera ou estimativa de mercado. Não há cálculo automático — o sistema usa o valor registrado como campo `fluxo` do ponto.

**Usado como:** Numerador do CPM, base para Share of Voice, soma total de impactos da campanha.

---

### CPM — Custo por Mil Impressões

**O que é:** Quanto custa atingir 1.000 pessoas (impactos) com o plano. É a métrica-padrão de eficiência de mídia.

**Fórmula:**

$$
\text{CPM} = \frac{\text{Investimento total (R\$)}}{\text{Fluxo total} / 1.000}
$$

**Exemplo:** Investimento de R$ 3.000 num ponto com 200.000 impactos/mês → CPM = R$ 15,00.

**Classificação de eficiência usada internamente:**

| CPM | Classe |
|-----|--------|
| ≤ R$ 5,00 | Muito eficiente |
| R$ 5,01 – R$ 15,00 | Eficiente |
| R$ 15,01 – R$ 30,00 | Médio |
| > R$ 30,00 | Alto |

---

### Alcance Estimado (por ponto individual, tela de Ranking)

**O que é:** Estimativa de quantas pessoas únicas são impactadas por um único ponto por mês.

**Raciocínio:** Nem toda pessoa que passa por um painel o vê com atenção, e a mesma pessoa pode passar mais de uma vez (ou seja, o fluxo bruto conta múltiplas passagens da mesma pessoa). O sistema aplica um **fator de alcance único de 38%** — valor conservador calibrado para o perfil de mídia exterior urbana brasileira, onde se estima que cerca de um terço do fluxo corresponde a pessoas distintas que efetivamente notam o anúncio.

**Fórmula:**

$$
\text{Alcance individual} = \text{Fluxo} \times 0{,}38
$$

**Exemplo:** Ponto com 50.000 impactos/mês → 50.000 × 0,38 = **19.000 pessoas únicas alcançadas**.

---

### Alcance Efetivo da Campanha (%)

**O que é:** Porcentagem da audiência total da praça (cidade) que a campanha como um todo consegue atingir ao menos uma vez. É o indicador principal de cobertura de mercado.

**Por que não é simplesmente a soma dos alcances individuais?** Porque pontos de mídia numa mesma cidade compartilham audiência — a mesma pessoa pode passar por múltiplos painéis. Somar os alcances individuais geraria dupla contagem. O sistema usa um modelo de saturação exponencial (baseado na metodologia Metheringham/Agostini, padrão em planejamento de mídia) para estimar o alcance único acumulado.

**Etapa 1 — Share of Voice (SoV):**

O SoV é a fatia do fluxo total da praça que a campanha representa.

$$
\text{SoV} = \frac{\text{Fluxo total dos pontos selecionados}}{\text{Fluxo total do inventário da cidade}}
$$

**Etapa 2 — Alcance bruto:**

Usando a curva exponencial de saturação de mídia:

$$
\text{Alcance bruto (\%)} = 100 \times \left(1 - e^{-2{,}65 \times \text{SoV}}\right)
$$

Onde o coeficiente 2,65 representa a velocidade com que a campanha "esgota" novas pessoas da audiência à medida que aumenta sua presença no mercado. Conforme o SoV cresce, cada novo ponto adiciona proporcionalmente menos pessoas únicas novas (lei dos rendimentos decrescentes).

**Etapa 3 — Multiplicador de qualidade:**

Campanhas com maior diversidade de formatos (LED + backlight + indoor) e/ou presença em múltiplas cidades tendem a atingir audiências diferentes. O sistema aplica um multiplicador para capturar esse efeito:

$$
M_{qualidade} = \min(1{,}15;\; 0{,}72 + N_{formatos} \times 0{,}055 + N_{cidades} \times 0{,}03)
$$

Onde $N_{formatos}$ é o número de tipos de mídia distintos (LED, frontlight, indoor, etc.) e $N_{cidades}$ é o número de cidades distintas na campanha.

**Etapa 4 — Alcance efetivo:**

$$
\text{Alcance efetivo (\%)} = \min(96;\; \text{Alcance bruto} \times M_{qualidade})
$$

O teto de 96% reflete a impossibilidade prática de atingir 100% de uma audiência urbana com mídia exterior.

**Exemplo:** Campanha com SoV de 30%, 2 formatos, 1 cidade:
- Alcance bruto = 100 × (1 − e^−0,795) = 54,9%
- Multiplicador = min(1,15; 0,72 + 0,11) = 0,83
- Alcance efetivo = min(96; 45,6%) = **45,6%**

---

### Frequência Média

**O que é:** Número médio de vezes que cada pessoa alcançada pela campanha viu o anúncio no período.

**Raciocínio:** Uma vez que o sistema estima o número de pessoas únicas (alcance), divide o total de impactos brutos por esse número. O resultado é a frequência média — quanto mais alto, mais "repetitivo" é o plano para o mesmo público.

**Etapas do cálculo:**

**1. Estimar o universo de pessoas únicas da praça:**

O sistema usa o fluxo total da cidade para inferir o tamanho do mercado de audiência única. A premissa é que o fluxo mensal de toda a praça equivale aproximadamente a 6,8 "passagens por pessoa" por mês — ou seja, o habitante típico contribui com cerca de 6 a 7 contatos mensais com a mídia exterior da cidade.

$$
\text{Base do mercado} = \max\left(45.000;\; \frac{\text{Fluxo total da cidade}}{6{,}8}\right)
$$

O mínimo de 45.000 existe para cidades menores, evitando estimativas irrealistas de alcance absoluto.

**2. Estimar pessoas únicas alcançadas pela campanha:**

$$
\text{Pessoas únicas} = \text{Base do mercado} \times \frac{\text{Alcance efetivo}}{100}
$$

**3. Calcular a frequência média:**

$$
\text{Frequência média} = \frac{\text{Fluxo total dos pontos selecionados}}{\text{Pessoas únicas}}
$$

**Exemplo:** Fluxo total da campanha = 500.000 impactos/mês, 80.000 pessoas únicas → **Frequência média = 6,25×** (cada pessoa viu o anúncio, em média, 6,25 vezes no mês).

**Referência de frequência:** No mercado DOOH, frequência entre 2,0× e 6,0× é considerada ótima — abaixo disso pode não fixar a mensagem; acima de 8× pode gerar fadiga de anúncio.

---

### GRPs (Gross Rating Points)

**O que é:** Métrica agregada de pressão de mídia. Combina alcance e frequência numa única grandeza.

**Fórmula:**

$$
\text{GRPs} = \text{Alcance efetivo (\%)} \times \text{Frequência média}
$$

**Exemplo:** Alcance de 45% × Frequência de 6,25× = **281,3 GRPs/mês**.

GRPs altos indicam campanha de alta pressão. Valores típicos no DOOH regional ficam entre 50 e 400 GRPs/mês.

---

### Score da Campanha (0 a 10)

**O que é:** Avaliação geral da qualidade e eficiência do plano gerado. Combina cinco dimensões ponderadas num número de 0 a 10.

**Composição (pesos fixos):**

$$
\text{Score} = Q \times 0{,}30 + A \times 0{,}25 + F \times 0{,}20 + E \times 0{,}15 + C \times 0{,}10 + B
$$

| Dimensão | Símbolo | Peso | O que mede |
|----------|---------|------|------------|
| Qualidade dos pontos | $Q$ | 30% | Média ponderada da compatibilidade individual de cada ponto com o objetivo, ponderada pelo investimento em cada ponto |
| Alcance | $A$ | 25% | Baseado no alcance efetivo (%): quanto maior o alcance da praça, maior a nota |
| Frequência | $F$ | 20% | Avalia se a frequência está na faixa ideal (2–6×): muito baixa ou muito alta penaliza |
| Eficiência de custo | $E$ | 15% | Compara o CPM da campanha com a mediana do CPM do inventário da cidade (benchmark local) |
| Cobertura estratégica | $C$ | 10% | Combina (a) qualidade do formato dos pontos selecionados, (b) diversidade geográfica, (c) porcentagem do inventário coberto, (d) aderência ao público-alvo |
| Bônus de equilíbrio | $B$ | — | Pequeno bônus (máx. 0,5 ponto) se todas as 5 dimensões estiverem acima de 5,0 e próximas entre si (spread < 3 pontos) — campanha equilibrada recebe reconhecimento |

**Escalas internas de cada dimensão:**

*Alcance (A):*

| Alcance efetivo | Nota atribuída |
|-----------------|----------------|
| ≥ 50% | 9,0 a 10,0 |
| 25%–49% | 7,0 a 9,0 |
| 10%–24% | 4,5 a 7,0 |
| 3%–9% | 2,0 a 4,5 |
| < 3% | 0 a 2,0 |

*Frequência (F):*

| Frequência média | Nota atribuída |
|-----------------|----------------|
| 2× a 6× | 7,5 a 9,5 (faixa ótima) |
| 1,5× a 2× | 5,0 a 7,5 |
| < 1,5× | 1,5 a 5,0 |
| > 8× | penalidade progressiva (−0,5 por × extra) |

*Eficiência de custo (E):*

A eficiência usa a razão entre o CPM da campanha e o CPM mediano da cidade ($\text{CPM}_{ref}$):

$$
\text{razão} = \frac{\text{CPM da campanha}}{\text{CPM}_{ref}}
$$

$$
E = \text{clamp}(0{,}5;\; 10;\; 6 + (1 - \text{razão}) \times 6)
$$

Razão 0,5 (CPM 50% abaixo da mediana) → nota 9. Razão 1,0 (CPM igual à mediana) → nota 6. Razão 1,5 → nota 3.

**Interpretação:**

| Score | Classificação |
|-------|--------------|
| 8,5 – 9,8 | Excelente |
| 7,0 – 8,4 | Boa |
| 5,0 – 6,9 | Regular |
| < 5,0 | Fraca |

---

### Compatibilidade do Ponto (0 a 100)

**O que é:** Score individual atribuído a cada ponto do ranking, indicando o quanto aquele ponto é adequado para a campanha com os critérios informados (objetivo, segmento, público, cidade, orçamento).

**Como é calculado:** É a soma ponderada de múltiplos sub-scores de afinidade, com pesos configuráveis (padrão):

| Dimensão | Peso padrão | O que avalia |
|----------|-------------|--------------|
| Objetivo | 28/100 | Aderência do formato/fluxo/tipo ao objetivo da campanha (reconhecimento, presença premium, cobertura, etc.) |
| Público | 18/100 | Correspondência entre o público-alvo do ponto e o público-alvo desejado |
| Eficiência | 16/100 | CPM individual do ponto vs. mediana da praça |
| Entorno | 14/100 | Score de afinidade com o segmento de negócio (calculado via análise da vizinhança 800m) |
| GeoAudiência | 12/100 | Bônus do tipo de bairro para o segmento (ex: polo de saúde para clínica) |
| Segmento | 10/100 | Correspondência lexical entre nome/descrição do ponto e setor do anunciante |
| Formato | 8/100 | Qualidade do formato (LED e outdoor recebem mais que indoor para reconhecimento de marca, por exemplo) |
| Disponibilidade | 6/100 | Adequação do horário de funcionamento à faixa horária desejada |
| Perfil demográfico | 6/100 | Compatibilidade do perfil census (alta renda, jovem universitário, etc.) com o público-alvo |
| Audience Tags | — | Afinidade de etiquetas de audiência (classe A, executivos, motoristas, etc.) com as tags selecionadas |

O resultado final é normalizado ao intervalo [0, 100] e exibido nos cards de ponto.

---

### Nível de Cobertura da Praça

**O que é:** Indicador qualitativo de quanto da oferta de mídia disponível na cidade o plano ocupa.

**Fórmula (% de pontos cobertos):**

$$
\text{Cobertura (\%)} = \frac{\text{Pontos selecionados}}{\text{Total de pontos da cidade}} \times 100
$$

**Classificações:**

| Threshold | Nível |
|-----------|-------|
| ≥ 50% dos pontos ou ≥ 55% do fluxo | Domínio regional |
| ≥ 25% dos pontos ou ≥ 30% do fluxo | Estratégico |
| < 25% dos pontos | Essencial |

---

### Notas Gerais sobre as Estimativas

- Todos os valores de audiência são **projeções baseadas em modelos**, não medições diretas. A precisão depende da qualidade do dado de `fluxo` cadastrado por cada ponto.
- O modelo de alcance exponencial (Etapa 2 acima) é uma adaptação dos modelos clássicos de mídia (Agostini, 1961; Metheringham, 1964) aplicados ao contexto DOOH urbano brasileiro.
- O fator 6,8 passagens/pessoa/mês foi calibrado para características de cidades médias brasileiras (Londrina, Maringá, Balneário Camboriú). Em cidades muito grandes (São Paulo, Curitiba), esse fator seria maior; em cidades pequenas, menor.
- O teto de 96% no alcance efetivo e o fator 0,38 no alcance individual são valores conservadores intencionais — preferindo subestimar a superestimar a audiência.

---



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
- TTL: 12 horas (configurável via `AUTH_TOKEN_TTL_SECONDS`, com mínimo de 3600s / 1 hora)
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
| `AUTH_TOKEN_TTL_SECONDS` | 43200 (12h) | Duração dos tokens (mínimo efetivo: 3600s) |
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
