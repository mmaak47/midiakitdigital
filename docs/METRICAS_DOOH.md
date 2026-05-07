# Métricas DOOH — Auditoria, Benchmark e Plano de Evolução

> Documento de referência para evolução das métricas comerciais do sistema Mídia Kit Digital (Intermidia).
> Base: práticas públicas 2023–2025 de Geopath, Route, OAAA, DPAA, IAB, Broadsign, Vistar, Hivestack, Place Exchange, JCDecaux, Clear Channel Outdoor, OUTFRONT Media, Lamar Advertising, AdQuick.

---

## Sumário

1. [Diagnóstico das métricas atuais](#1-diagnóstico-das-métricas-atuais)
2. [Benchmark com players globais](#2-benchmark-com-players-globais)
3. [Nova estrutura de métricas](#3-nova-estrutura-de-métricas-em-blocos)
4. [Fórmulas sugeridas](#4-fórmulas-sugeridas)
5. [Métricas proprietárias](#5-métricas-proprietárias-diferenciais-comerciais)
6. [Nomes comerciais (rename map)](#6-nomes-comerciais-rename-map)
7. [Visão Interna × Visão Cliente](#7-visão-interna--visão-cliente)
8. [Sugestões para a interface](#8-sugestões-para-a-interface)
9. [Exemplos práticos](#9-exemplos-práticos)
10. [Textos comerciais automáticos](#10-textos-comerciais-automáticos-templates-por-trigger)
11. [Recomendações finais de implementação](#11-recomendações-finais-de-implementação)

---

## 1. Diagnóstico das métricas atuais

| Métrica atual | Diagnóstico | Ação recomendada |
|---|---|---|
| Fluxo mensal de pessoas | Boa, mas o nome é fraco e ambíguo (passantes? impactados?) | Renomear + qualificar como "potencial" |
| Fluxo mensal de veículos | Útil para LED externo, irrelevante em indoor | Mostrar condicional ao tipo de ponto |
| Quantidade de telas | Técnica, não vende | Renomear "Pontos de Contato" |
| Quantidade de pontos | Confunde com telas | Unificar conceito |
| Inserções/dia | Boa, mas sozinha não significa nada | Cruzar com tempo de inserção e loop |
| Tempo de funcionamento | Bom dado, mal apresentado | Virar "Janela Diária de Exposição" |
| Tempo de exibição (spot) | Crítico para cálculo, ok | Manter, exibir |
| Impactos mensais | **Cálculo precisa ser auditado** — risco de superestimar | Aplicar fator de visibilidade (VAC) |
| Valor mensal | Ok | Renomear "Investimento" |
| CPM | Ok, mas precisa metodologia transparente | Mostrar fórmula curta no rodapé |
| Custo médio por ponto/tela | Interno, pouco vendável | Esconder do cliente |
| Frequência | Conceito presente mas não calculado | Calcular OTS (Opportunity to See) |
| Cobertura geográfica | Subaproveitada | Virar mapa de presença |
| Perfil do público | Existe (audience.bullets), excelente | Destaque maior |
| Tipo de ambiente | Existe (segmento) | Virar "Contexto Premium" |
| Proximidade com polos | Existe (entorno) | Virar score |

### Problemas estruturais detectados

- Falta um **fator de visibilidade/atenção** (VAC — Visibility Adjusted Contacts, padrão Geopath/Route). Hoje "fluxo × inserções" superestima impactos reais.
- Falta separação clara entre **Impressões** (oportunidades) e **Audiência** (pessoas únicas).
- CPM exposto sem metodologia explícita gera desconfiança em compradores experientes (agências).
- Falta **Frequência média** (Audiência ÷ Impressões), métrica básica de mídia.
- Custo por ponto/tela não deveria aparecer ao cliente — vira ponto de pechincha.

---

## 2. Benchmark com players globais

Padrões consolidados no setor (referências públicas 2023–2025):

- **Geopath (US, métrica oficial OOH):** trabalha com `Impressions`, `In-Market Impressions`, `Target Impressions`, `Reach`, `Frequency`, `GRP/TRP`, todos baseados em VAC (probabilidade de ver × oportunidades de ver).
- **Route (UK, equivalente Geopath):** `Visibility Adjusted Contacts` é o pilar — nunca reportam só fluxo bruto.
- **OAAA + DPAA (associações US):** padronizaram `Impressions`, `CPM`, `Share of Voice`, `Dwell Time`, `Reach & Frequency`, `Brand Lift`.
- **IAB DOOH Buyer's Guide:** exige `Viewable Impression`, `Loop Length`, `Spot Duration`, `Share of Time`, `Share of Voice`.
- **Broadsign / Vistar / Hivestack / Place Exchange (SSPs/DSPs programáticos):** unidade de venda é `Impression` (não "inserção"). Métricas chave: `Plays`, `Impressions`, `eCPM`, `Reach`, `Avg Dwell Time`, `Audience Index`, `Contextual Index`.
- **JCDecaux:** comunica em `Audiência`, `Cobertura`, `Frequência`, `Contatos Visualmente Adequados`, `Perfil Sociodemográfico`, `Share of Voice`.
- **Clear Channel Outdoor (RADAR):** `Reach`, `Frequency`, `Impressions`, `Dwell Time`, `Audience Composition Index`, `Path-to-Purchase Proximity`.
- **OUTFRONT (Smart):** `Audience`, `Reach`, `Frequency`, `Mobility Insights`, `Attribution`, `Brand Lift`.
- **Lamar:** `Daily Effective Circulation (DEC)`, `Impressions`, `CPM`, `In-Market Audience`.
- **AdQuick:** simplifica para anunciantes não-OOH: `Impressions`, `CPM`, `Reach`, `Frequency`, `Audience Demographics`.

> **Insight central:** quase ninguém vende mais "fluxo bruto". Vendem **Impressões Visíveis (VAC)** + **Reach & Frequency** + **Contexto**.

---

## 3. Nova estrutura de métricas (em blocos)

### A) ALCANCE
1. **Audiência Potencial Mensal** — pessoas únicas estimadas no entorno.
2. **Impressões Mensais Estimadas** — oportunidades visíveis (com VAC).
3. **Fluxo Urbano Impactado** — veículos/pedestres na via (contextual).
4. **Cobertura Territorial** — nº de bairros/cidades atingidas.
5. **Pontos de Contato Ativos** — telas/painéis simultâneos.

### B) FREQUÊNCIA
6. **Frequência Diária de Presença** — exibições por dia por ponto.
7. **Janela Diária de Exposição** — horas operando/dia.
8. **Repetição Estimada (OTS)** — quantas vezes o mesmo público vê a peça/mês.
9. **Share of Time / SOV** — % do loop dedicado à marca.
10. **Densidade de Inserções** — inserções totais no circuito/mês.

### C) VALOR
11. **Investimento Mensal de Presença** (substitui "valor mensal").
12. **CPM Estimado** — com metodologia transparente.
13. **Custo por Ponto de Contato** (interno).
14. **Investimento Diário Equivalente** — ajuda venda ("R$ X por dia").
15. **Comparativo CPM x mídia digital** (gráfico de venda).

### D) CONTEXTO
16. **Contexto de Impacto** — tipo de ambiente (LED externo, elevador, restaurante…).
17. **Perfil do Público** — classe, idade, comportamento.
18. **Momento de Consumo** — manhã commute, almoço, noite leisure.
19. **Proximidade Estratégica** — distância a polos relevantes.
20. **Score de Aderência ao Segmento** — quão alinhado o entorno está com o segmento da campanha.

### E) PREMIUM / PROPRIETÁRIAS
21. **Índice de Presença Urbana (IPU)**
22. **Score de Visibilidade Comercial (SVC)**
23. **Índice de Dominância Regional (IDR)**
24. **Score de Contexto Premium (SCP)**
25. **Potencial de Lembrança de Marca (PLM)**

---

## 4. Fórmulas sugeridas

> Notação: `fluxo_mensal` = pessoas/veículos passantes/mês; `loop_seg` = duração do loop; `spot_seg` = duração da peça; `horas_dia` = janela operacional; `dias_mes` = 30; `telas` = nº de pontos de contato; `vac` = fator de visibilidade (0 a 1).

### 4.1 Inserções por dia (por ponto)
```
insercoes_dia = floor( (horas_dia * 3600) / loop_seg )
```
Apresentar ao cliente: *"Sua marca aparece N vezes por dia em cada ponto."*

### 4.2 Inserções no circuito/mês
```
insercoes_mes = insercoes_dia * dias_mes * telas
```

### 4.3 Share of Time / SOV
```
SOV = spot_seg / loop_seg          // ex.: 10s / 120s = 8,3%
```
Argumento: *"Sua marca ocupa X% do tempo de tela em cada ponto."*

### 4.4 Impressões Visíveis (padrão Geopath/Route)
```
impressoes_brutas   = fluxo_mensal * SOV
impressoes_visiveis = impressoes_brutas * VAC
```

**VAC sugerido por contexto** (calibrar com o tempo, conservador):

| Contexto | VAC |
|---|---|
| LED externo avenida | 0,30–0,40 |
| LED externo via residencial | 0,20–0,30 |
| Painel indoor restaurante/café | 0,55–0,70 |
| Tela elevador | 0,65–0,80 |
| Padaria/mercado fila | 0,45–0,55 |
| Hospital/laboratório sala de espera | 0,60–0,75 |

### 4.5 CPM Estimado (transparente)
```
CPM = (investimento_mensal / impressoes_visiveis) * 1000
```
Nota de rodapé: *"CPM calculado sobre impressões visíveis estimadas, ajustadas por fator de atenção do contexto, conforme metodologia VAC (Geopath/Route)."*

### 4.6 Frequência (OTS) e Alcance
```
audiencia_unica_mes = fluxo_mensal * fator_unicidade
freq_media          = impressoes_visiveis / audiencia_unica_mes
reach               = audiencia_unica_mes
```

`fator_unicidade` por contexto:

| Contexto | Fator |
|---|---|
| LED externo via principal | 0,15–0,25 |
| Indoor recorrente (academia/padaria) | 0,30–0,45 |
| Elevador residencial | 0,80–0,95 |

### 4.7 Investimento Diário Equivalente
```
investimento_dia = investimento_mensal / 30
```
Frase: *"Apenas R$ X/dia de presença ativa de marca."*

### 4.8 GRP/TRP estimado (opcional avançado)
```
GRP = (impressoes_visiveis / populacao_mercado) * 100
```

### 4.9 Score Comercial do Ponto (interno)
```
SCP_ponto = w1*z(fluxo) + w2*z(VAC) + w3*z(SOV) + w4*z(aderencia_segmento) - w5*z(CPM)
```
(z-score normalizado entre os pontos do circuito.)

---

## 5. Métricas proprietárias (diferenciais comerciais)

### 5.1 Índice de Presença Urbana (IPU) — 0 a 100
**O que é:** quanto a campanha "ocupa" a rotina urbana do público-alvo.
```
IPU = min(100, ((impressoes_visiveis / 1.000.000) * 25)
            + (cobertura_bairros * 5)
            + (freq_media * 8))
```
**Argumento:** *"Sua marca alcança IPU 78/100, presença alta na rotina diária do consumidor da região."*

### 5.2 Score de Visibilidade Comercial (SVC) — 0 a 10
**O que é:** ponderação de VAC, SOV e janela de exposição.
```
SVC = round((VAC * 4) + (SOV * 3) + (horas_dia/24 * 3), 1)
```

### 5.3 Índice de Dominância Regional (IDR) — %
**O que é:** % das telas DOOH disponíveis na região cobertas pela campanha.
```
IDR = telas_contratadas_regiao / telas_totais_regiao * 100
```
**Argumento:** *"Você domina 64% do inventário DOOH desta região."*

### 5.4 Score de Contexto Premium (SCP) — 0 a 10
Tabela fixa por tipo:

| Contexto | SCP |
|---|---|
| Elevador residencial alto padrão | 9,5 |
| Hospital/laboratório premium | 9,0 |
| Café/restaurante | 8,5 |
| LED externo avenida nobre | 8,5 |
| Academia | 8,0 |
| Padaria/mercado | 7,0 |
| LED externo via secundária | 6,5 |

### 5.5 Potencial de Lembrança de Marca (PLM)
```
PLM = (freq_media * SCP * dwell_time_min) / 10
```
Comunicar como **faixas qualitativas** (Baixa/Média/Alta/Muito Alta), nunca como número absoluto.

### 5.6 Índice de Pressão de Marca (IPM) — diário
```
IPM = insercoes_dia * SCP * VAC
```

> ⚠️ **Cuidado ético:** sempre rotular como **"estimado"** e expor metodologia em rodapé/glossário. Compradores profissionais respeitam métrica proprietária *desde que* haja transparência.

---

## 6. Nomes comerciais (rename map)

| Hoje | Novo nome (cliente) | Chave técnica (interno) |
|---|---|---|
| Fluxo mensal de pessoas | **Fluxo Urbano de Pessoas** | `fluxo_pessoas_mes` |
| Fluxo mensal de veículos | **Fluxo Urbano de Veículos** | `fluxo_veiculos_mes` |
| Impactos mensais | **Audiência Potencial Mensal** | `audiencia_estimada_mes` |
| Impressões | **Impressões Visíveis Estimadas** | `impressoes_visiveis` |
| Quantidade de telas | **Pontos de Contato Ativos** | `qtd_telas` |
| Quantidade de pontos | **Presença Territorial** | `qtd_pontos` |
| Inserções/dia | **Frequência Diária de Presença** | `insercoes_dia` |
| Inserções/mês | **Volume Mensal de Exibições** | `insercoes_mes` |
| Tempo funcionamento | **Janela Diária de Exposição** | `janela_exposicao_h` |
| Tempo de exibição | **Duração da Peça** | `spot_seg` |
| Loop | **Ciclo de Tela** | `loop_seg` |
| Valor mensal | **Investimento Mensal de Presença** | `investimento_mes` |
| CPM | **Custo por Mil Impactos Estimados** | `cpm` |
| Custo/ponto | (oculto cliente) | `custo_ponto` |
| Custo/tela | (oculto cliente) | `custo_tela` |
| Frequência | **Repetição Média de Exposição (OTS)** | `freq_media` |
| Cobertura | **Cobertura Geográfica** | `cobertura_regioes` |
| Tipo ambiente | **Contexto de Impacto** | `contexto_tipo` |
| Proximidade | **Proximidade Estratégica** | `proximidade_polos` |

---

## 7. Visão Interna × Visão Cliente

| Bloco | Visão Interna (técnica) | Visão Cliente (comercial) |
|---|---|---|
| Fluxo | `fluxo_pessoas_mes = 720000` | "Até **720 mil pessoas/mês** circulando pela região." |
| Telas | `qtd_telas = 36` | "**Circuito de 36 pontos de contato simultâneos**, ampliando frequência ao longo da jornada do público." |
| Inserções | `insercoes_dia = 480` | "Sua marca aparece **480 vezes por dia** em cada ponto." |
| SOV | `SOV = 0.083` | "Sua marca ocupa **8,3% do tempo de tela** — presença constante no circuito." |
| Impressões | `impressoes_visiveis = 1.940.000` | "**~1,94 milhão de impressões visíveis/mês**, ajustadas por atenção real do público." |
| CPM | `cpm = 5.52` | "**R$ 5,52** por mil impactos visíveis — custo competitivo frente a digital e mídias tradicionais." |
| Investimento | `investimento_mes = 10725` | "**R$ 10.725/mês** — equivalente a **R$ 357/dia** de presença ativa de marca." |
| Custo/tela | `custo_tela = 297.92` | (não exibir) |
| IPU | `IPU = 78` | "**Índice de Presença Urbana: 78/100** — alta presença na rotina do consumidor da região." |
| Frequência | `freq_media = 12.4` | "Cada pessoa do público é impactada em média **12 vezes/mês** — frequência ideal para lembrança de marca." |

---

## 8. Sugestões para a interface

### 8.1 Cadastro do ponto (admin)
Campos novos a adicionar no schema:
- `vac_fator` (numérico 0–1, com sugestão por tipo)
- `dwell_time_min` (tempo médio de permanência)
- `fator_unicidade` (0–1)
- `scp_score` (preenchido automaticamente por `tipo`)
- `peso_comercial` (interno, para ranking)

### 8.2 Card do ponto (Explorer/Planner)
Layout em 3 linhas:
- **Linha 1:** nome + chip Contexto Premium (`SCP 9.0 ★`)
- **Linha 2:** 3 KPIs grandes — Audiência Potencial, Impressões Visíveis, CPM
- **Linha 3:** investimento + investimento/dia equivalente

### 8.3 Proposta comercial (PDF + público)
Hierarquia visual:
1. **Hero**: Investimento + CPM + Audiência Potencial (3 KPIs grandes)
2. **Bloco de Alcance**: Audiência, Impressões, Cobertura, Pontos de Contato
3. **Bloco de Frequência**: OTS, SOV, Janela, Inserções/dia
4. **Bloco de Contexto**: SCP, Perfil, Proximidade, Mapa
5. **Diferenciais Proprietários**: IPU, IDR (com selo)
6. **Rodapé técnico**: glossário curto + metodologia VAC

### 8.4 Modo Apresentação / QuickPresentation
- Substituir `MetricCard "Público A/B"` por **SCP visual com estrelas** + perfil em texto.
- Adicionar slide "Diferenciais Intermidia" com IPU/IDR.
- KPI "Pontos de Impacto" → renomear para "Pontos de Contato Ativos".

### 8.5 Comparativo entre planos
Tabela com linhas: Audiência, Impressões, CPM, OTS, IPU. CPM e OTS ajudam o cliente a escolher entre "mais alcance" vs "mais frequência".

### 8.6 Geração automática de argumentos
Para cada ponto, gerar 1 argumento dinâmico baseado em qual métrica está acima da média do circuito (ver seção 10).

---

## 9. Exemplos práticos

### Exemplo 1 — Painel LED externo
**Dados técnicos:**
- fluxo_veiculos = 720.000/mês
- horas_dia = 16 (6h–22h); spot_seg = 10; loop_seg = 120 → SOV = 8,3%
- VAC = 0,35; fator_unicidade = 0,20
- Investimento = R$ 2.500/mês

**Cálculos:**
- insercoes_dia = 480
- impressoes_visiveis ≈ 720.000 × 0,083 × 0,35 ≈ **20.916/mês**
- CPM ≈ R$ 119,52 (ponto isolado tem CPM ruim — argumento de venda foca em **lembrança visual**)

**Texto comercial:**
> *"Painel LED estratégico em ponto de alto fluxo veicular: até **720 mil veículos/mês** passam pelo seu eixo. Com **480 exibições diárias** e **8,3% de share de tempo**, sua marca se fixa na rotina urbana de quem dirige diariamente pela região. Investimento de **R$ 2.500/mês** — equivalente a **R$ 83/dia** de presença ativa em uma das vias mais movimentadas da cidade."*

**Argumento do vendedor:** LED externo é mídia de **lembrança**, não de cliques. Use quando o cliente quer ser visto pelos mesmos motoristas todos os dias.

### Exemplo 2 — Circuito 36 telas indoor
**Dados:**
- fluxo_pessoas = 8.943.000/mês; VAC = 0,55; SOV = 8,3%; fator_unicidade = 0,30
- Investimento = R$ 10.725/mês
- impressoes_visiveis ≈ **408.250/mês**; CPM ≈ **R$ 26,27**; IPU ≈ 72/100

**Texto comercial:**
> *"**Circuito de 36 pontos de contato simultâneos** com até **8,9 milhões de pessoas/mês** de fluxo urbano. Sua marca ganha **presença territorial** em ambientes premium de classe A/B com público cativo. **R$ 10.725/mês** — apenas **R$ 357/dia** para domínio multiponto da rotina urbana do seu público. **CPM estimado: R$ 26,27** com impressões ajustadas por atenção real."*

**Argumento:** Circuito = pressão de marca. Mesmo público, múltiplos contatos no dia.

### Exemplo 3 — Tela elevador residencial alto padrão
**Dados:**
- fluxo_pessoas = 24.000/mês; VAC = 0,75; SOV = 8,3%; fator_unicidade = 0,90
- Investimento = R$ 600/mês
- impressoes_visiveis ≈ **1.494/mês**; OTS real ≈ 30×/pessoa/mês
- CPM bruto alto (R$ 401), MAS **custo por frequência baixíssimo**; SCP = 9,5

**Texto comercial:**
> *"Tela em condomínio residencial de **alto padrão (Classe A)**, com público cativo de aproximadamente **21,6 mil moradores/mês**. **Score de Contexto Premium: 9,5/10** — público qualificado, atento e em momento receptivo. Cada morador é impactado **em média 30 vezes/mês**, gerando alta lembrança de marca por **R$ 600/mês** — apenas **R$ 20/dia** em mídia ultra-segmentada."*

**Argumento:** Elevador residencial não vende por CPM, vende por **frequência sobre público qualificado**.

---

## 10. Textos comerciais automáticos (templates por trigger)

Pseudo-código de regras (a implementar em `audienceIntelService.js`):

```js
if (point.scp >= 9)              push("Ambiente premium com público cativo e alta receptividade.");
if (point.fluxo_pct > 0.7)       push("Um dos pontos de maior fluxo do circuito — visibilidade máxima.");
if (point.freq_media >= 10)      push("Repetição ideal para construção de lembrança de marca.");
if (point.cpm < cpm_medio*0.8)   push("Custo por mil impactos altamente competitivo neste ponto.");
if (point.dominancia > 0.5)      push("Sua marca passa a dominar o inventário DOOH desta região.");
if (point.proximidade.length>=3) push("Localização estratégica próxima a polos de decisão de compra.");
if (point.tipo === 'elevador')   push("Público cativo, momento de pausa, alta atenção visual.");
if (point.tipo === 'led_externo' && point.fluxo_veiculos > 500000)
                                 push("Avenida de tráfego intenso com lembrança contínua para motoristas.");
```

**Banco de frases-base:**
- "Sua marca presente em uma região de alto fluxo, todos os dias."
- "Campanha pensada para gerar lembrança contínua e presença local."
- "Baixo custo por mil impactos, com exposição recorrente em pontos estratégicos."
- "Mais do que aparecer — sua marca passa a fazer parte da rotina do público."
- "Ideal para marcas que querem fortalecer presença, autoridade e lembrança na cidade."
- "Pressão de marca em múltiplos pontos de contato simultâneos."
- "Mídia de **alta atenção**: público cativo, momento receptivo, mensagem absorvida."
- "Domínio territorial em uma das regiões mais valiosas para o seu público."

---

## 11. Recomendações finais de implementação

### 11.1 Manter
- Fluxo mensal (pessoas/veículos)
- Inserções/dia, loop, spot
- Investimento mensal
- Tipo/segmento do ponto
- Entorno e proximidade
- Geo

### 11.2 Melhorar
- **CPM**: incluir VAC + nota metodológica
- **Impactos mensais**: virar Impressões Visíveis (com VAC)
- **Frequência**: passar a calcular OTS
- **Nomes**: aplicar rename map (seção 6)
- **Apresentação**: hierarquia em 3 KPIs hero (Investimento, CPM, Audiência)

### 11.3 Criar
- Campos no ponto: `vac_fator`, `dwell_time_min`, `fator_unicidade`, `scp_score`
- Métricas proprietárias: **IPU, SVC, IDR, SCP, PLM**
- Glossário/Metodologia (rodapé proposta + página `/metodologia`)
- Geração automática de argumentos comerciais por trigger

### 11.4 Esconder do cliente
- `custo_por_tela`, `custo_por_ponto` (margem/comissão)
- Pesos internos do `SCP_ponto` ranking
- Fatores VAC e unicidade brutos (mostrar só o resultado)

### 11.5 Ranking — Top 10 métricas mais vendáveis

1. **Audiência Potencial Mensal**
2. **Impressões Visíveis Estimadas**
3. **Investimento Diário Equivalente** ("R$/dia")
4. **Repetição Média de Exposição (OTS)**
5. **CPM Estimado** (transparente)
6. **Pontos de Contato Ativos**
7. **Score de Contexto Premium (SCP)**
8. **Índice de Presença Urbana (IPU)**
9. **Cobertura Geográfica**
10. **Share of Time / SOV**

### 11.6 Layout sugerido (slide do ponto)

```
┌──────────────────────────────────────────────────┐
│ HERO: nome do ponto + chip "Contexto Premium 9.0"│
├──────────────────────────────────────────────────┤
│  R$ 2.500/mês     R$ 5,52 CPM    720K Audiência │
│  (R$ 83/dia)                                     │
├──────────────────────────────────────────────────┤
│ ALCANCE                FREQUÊNCIA                │
│ • 1,94M Impressões    • 480 inserções/dia        │
│ • 36 pontos contato   • OTS 12,4×/mês            │
│ • 4 bairros           • 16h janela               │
├──────────────────────────────────────────────────┤
│ CONTEXTO                                         │
│ Perfil: ... • Proximidade: ... • SCP 9.0         │
├──────────────────────────────────────────────────┤
│ DIFERENCIAIS INTERMIDIA                          │
│ IPU 78/100 • IDR 64% • PLM Alta                  │
├──────────────────────────────────────────────────┤
│ Rodapé: "Métricas estimadas com base em VAC..."  │
└──────────────────────────────────────────────────┘
```

### 11.7 Roadmap de implementação

#### Fase 1 — Base
1. Adicionar campos `vac_fator`, `dwell_time_min`, `fator_unicidade`, `scp_score` no schema dos pontos com defaults por `tipo`.
2. Criar helper `calcMetrics(point, plano)` que retorna o objeto canônico (Alcance/Frequência/Valor/Contexto).
3. Aplicar **rename map** no frontend (Explorer, Planner, PresentationMode, QuickPresentation, PropostaPublica, PDF).

#### Fase 2 — Métricas avançadas
4. Implementar **Impressões Visíveis**, **OTS**, **SOV**, **Investimento/dia**.
5. Adicionar nota metodológica curta (rodapé proposta + tooltip "?" nos cards).

#### Fase 3 — Proprietárias
6. Implementar IPU, SVC, IDR, SCP, PLM.
7. Selo visual "Métrica Intermidia ★" + página `/metodologia` explicando.

#### Fase 4 — Inteligência comercial
8. Engine de argumentos automáticos por trigger (seção 10).
9. Comparativo de planos com radar chart (Alcance × Frequência × Contexto).
10. Ranking automático de pontos por `score_comercial` no Explorer.

#### Fase 5 — Diferenciação
11. Brand lift estimado (após histórico) + atribuição (parceria com QR/UTM).
12. Integração programática (eCPM como métrica futura).

---

## Glossário rápido

| Sigla | Significado |
|---|---|
| **VAC** | Visibility Adjusted Contacts — fator de ajuste de visibilidade |
| **OTS** | Opportunity to See — repetição média de exposição |
| **SOV** | Share of Voice — % do loop ocupado pela marca |
| **GRP** | Gross Rating Points — % do mercado-alvo impactado × frequência |
| **CPM** | Custo por Mil Impactos |
| **DEC** | Daily Effective Circulation (Lamar) |
| **IPU** | Índice de Presença Urbana (proprietária) |
| **SVC** | Score de Visibilidade Comercial (proprietária) |
| **IDR** | Índice de Dominância Regional (proprietária) |
| **SCP** | Score de Contexto Premium (proprietária) |
| **PLM** | Potencial de Lembrança de Marca (proprietária) |
| **IPM** | Índice de Pressão de Marca (proprietária) |

---

**Documento mantido por:** equipe Mídia Kit Digital — Intermidia
**Próxima revisão:** ao final da Fase 1 (validar nomenclatura com equipe comercial)
