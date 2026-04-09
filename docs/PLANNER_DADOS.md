# Planner Comercial - Origem e Tratamento de Dados

Este documento explica como os novos dados do planner sao criados, de onde vem e como sao usados no sistema.

## Escopo

As funcionalidades cobertas aqui sao:
- Audience tags estruturadas
- Calendario de disponibilidade
- Otimizador de orcamento
- Reach & Frequency (R&F) engine

## Origem dos Dados

### 1) Base de pontos

Fonte principal: tabela `pontos` no SQLite.

Campos usados pelo planner:
- `preco`, `fluxo`, `insercoes`, `tipo`, `cidade`, `publico`, `horario`
- `audience_tags` (novo)
- `availability_calendar` (novo)

Criacao/migracao dos novos campos:
- arquivo: `backend/database.js`

### 2) Audience tags

Entrada aceita no backend:
- JSON de tags via payload (`audience_tags`)
- string separada por virgula
- sem entrada explicita: fallback automatico a partir de `publico`

Fallback automatico atual:
- se `publico` contem `A` -> inclui `classe-a`
- se `publico` contem `B` -> inclui `classe-b`

Normalizacao aplicada:
- chave em slug (minusculo, sem acento, separador `-`)
- deduplicacao
- peso limitado no intervalo seguro

Onde acontece:
- arquivo: `backend/server.js`
- funcoes: normalizacao de chave, parser de tags e hidratacao de resposta

### 3) Calendario de disponibilidade

Entrada aceita no backend:
- objeto JSON com:
  - `defaultPct`
  - `dayFactors`
  - `blockFactors`
- sem entrada explicita: fallback automatico por `horario`

Fallback automatico atual:
- horario com `24` -> disponibilidade base mais alta
- demais horarios -> disponibilidade base comercial
- fatores padrao por dia da semana e bloco horario (manha, tarde, noite)

Normalizacao aplicada:
- limites min/max para evitar valores fora de faixa
- preenchimento de faltantes com baseline

Onde acontece:
- arquivo: `backend/server.js`
- funcoes: parser/calibracao de calendario e hidratacao de resposta

### 4) Entorno (dado auxiliar)

Aderencia por entorno vem de cache analitico:
- tabela `entorno_cache`
- API: `/api/entorno/scores`

Esse dado e opcional no planner e entra como ganho adicional de score por ponto quando disponivel.

## Fluxo de Tratamento (Backend -> Frontend)

1. CRUD de ponto recebe payload
2. Backend normaliza `audience_tags` e `availability_calendar`
3. Dados sao persistidos na tabela `pontos`
4. Leitura de pontos (`/api/pontos`, `/api/admin/pontos`, `/api/pontos/:id`) devolve dados hidratados e consistentes
5. Frontend consome os dados e calcula recomendacao no planner

## APIs Relacionadas

- `GET /api/pontos`
  - retorna pontos com `audience_tags` e `availability_calendar`
  - aceita filtro `audience_tag`
- `GET /api/audience-tags`
  - retorna catalogo agregado de tags com contagem
- `GET /api/entorno/scores`
  - retorna aderencia por ponto para o segmento selecionado

Implementacao:
- arquivo: `backend/server.js`

## Motor de Estrategia (Frontend)

Arquivo principal:
- `frontend/src/lib/strategy.js`

### 1) Score por audience tags

- compara tags alvo selecionadas no planner com as tags de cada ponto
- aplica peso por tag
- pontuacao limitada para manter estabilidade

### 2) Score por disponibilidade

- aplica preset de disponibilidade selecionado no planner
- cruza preset com `availability_calendar` do ponto
- gera score de ajuste temporal da campanha

### 3) Otimizador de orcamento

- funcao: `optimizeBudgetAllocation`
- objetivo: selecionar combinacao com melhor eficiencia respeitando budget
- regras atuais:
  - limite de concentracao por formato
  - tolerancia controlada de uso de budget
  - expansao orientada por objetivo (ex.: cobertura regional)

### 4) Reach & Frequency

- funcao: `estimateReachFrequency`
- saidas principais:
  - `grossReachPct`
  - `effectiveReachPct`
  - `avgFrequency`
  - `grps`
  - `estimatedUnique`

A estimativa usa:
- share de fluxo da selecao vs inventario da praca
- diversidade de formatos e cidades como multiplicador de qualidade
- base estimada de universo unico para evitar distorcoes

### 5) Integracao no plano ideal

- funcao: `suggestIdealPlan`
- consolida:
  - selecao de pontos
  - totais de campanha
  - saida de R&F
  - saida do otimizador (uso de budget e distribuicao por formato)
  - justificativa textual explicativa

## Onde aparece na Interface

Painel de planejamento:
- arquivo: `frontend/src/components/StrategicPlanner.jsx`
- novos controles visiveis:
  - Audience tags
  - Disponibilidade
- novos indicadores visiveis:
  - Reach efetivo
  - Freq media
  - GRPs
  - Uso de budget

## Validacao Rapida em Producao

1. Abrir `/api/pontos`
2. Confirmar que cada ponto tem:
- `audience_tags`
- `availability_calendar`

3. Abrir `/comercial/explorar`
4. No card "Sugestao de plano ideal", confirmar:
- seletor Audience tags
- seletor Disponibilidade
- metricas de R&F e uso de budget

## Limites e Premissas Atuais

- Audience tags ainda pode vir por fallback de `publico` quando nao informada manualmente
- Calendario de disponibilidade usa baseline quando nao informado manualmente
- R&F e estimativo comercial (nao mede audiencia censitaria real)
- Otimizador atual e heuristico e pode evoluir para modelos multiobjetivo

## Evolucao Recomendada

- editar audience tags e disponibilidade diretamente no formulario de ponto no admin
- versionar pesos/presets por configuracao administrativa
- adicionar testes automatizados para cenarios de orcamento e estabilidade do R&F
