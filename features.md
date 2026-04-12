🔥 Alta Prioridade — Impacto direto em vendas
FEAT-1: Link público de proposta para o cliente

Hoje a proposta só existe internamente. O vendedor exporta um PDF manualmente e envia.

Gerar um link único (ex: /proposta/abc123) com visualização web da proposta
O cliente vê os pontos no mapa, métricas, valor — sem precisar baixar PDF
Botão "Aprovar proposta" no link → dispara notificação WhatsApp para o vendedor
Expiração configurável (ex: 7 dias)
Backend: tabela proposta_tokens + rota pública GET /p/:token
Frontend: página React sem autenticação com layout da proposta
FEAT-2: Histórico e versões de propostas

Atualmente não há versionamento — uma proposta editada sobrescreve a anterior.

Salvar snapshots de cada versão (pontos, desconto, valor)
Interface de comparação lado a lado: "Versão 1 × Versão 3"
Indicar qual versão foi aprovada ou enviada ao cliente
Backend: tabela propostas_versoes com proposta_id, versao, snapshot_json, criado_em, criado_por
FEAT-3: Pipeline de vendas visual (Kanban)

O módulo "Vendas" atual é uma lista plana. Não há visão de funil.

Kanban com colunas: Proposta → Em Aprovação → Aprovada → Contrato → Veiculando
Arrastar cards entre colunas atualiza o status
Cards mostram: cliente, valor, vendedor, data, pontos
Filtros por vendedor, cidade, período
KPIs no topo: total em cada etapa, valor agregado
Aproveita dados existentes de propostas + vendas + venda_etapas
FEAT-4: Notificações por e-mail

Hoje só existe notificação via WhatsApp (Evolution API), que depende de instância ativa.

E-mail automático quando: proposta precisa de aprovação, proposta foi aprovada/rejeitada, campanha vencendo
Templates simples em HTML (sem dependência externa — nodemailer + SMTP do domínio)
Configurável por usuário (ativo/inativo)
Backend: fila simples de envio (não precisa de Redis — arquivo ou SQLite)
FEAT-5: Comparativo de pontos lado a lado

O usuário seleciona pontos individualmente mas não tem como compará-los diretamente.

Selecionar 2–4 pontos e abrir painel de comparação
Tabela com: fluxo, preço, CPM, tipo, audiência, entorno score, imagem
Gráfico de radar mostrando dimensões para cada ponto
Botão "Adicionar melhor" direto para a proposta
Frontend: componente PointComparison.jsx acessível do Explorer
🟠 Média Prioridade — Completude do produto
FEAT-6: Simulador de ROI para o cliente

O sistema calcula CPM e fluxo, mas não traduz isso em resultado de negócio para o anunciante.

Input: segmento do anunciante, ticket médio de venda, taxa de conversão estimada
Output: quantos leads potenciais, quantas vendas estimadas, payback da campanha
Apresentado visualmente na proposta e no link público
Baseado nos dados já disponíveis (fluxo, audiência, entorno)
FEAT-7: Favoritos na nuvem (sincronizado por usuário)

Atualmente os favoritos ficam no localStorage — perdem ao trocar de dispositivo.

Salvar combinações favoritas no banco vinculadas ao usuario_id
Nomear e descrever cada combinação (ex: "Pack Londrina Fitness")
Compartilhar combinação entre vendedores (link interno)
Backend: tabela user_favorites + endpoints CRUD
Aproveita FavoritesContext.jsx existente como camada de UI
FEAT-8: Relatório de performance pós-campanha

Após a venda (veiculando), não há acompanhamento de entrega.

Formulário para registrar: período executado, número de exibições, incidentes
Relatório PDF automático para o cliente ao final da campanha
Métricas: exibições realizadas × contratadas, uptime dos pontos
Base para renovação: "sua campanha entregou X — veja os pontos disponíveis para renovar"
FEAT-9: Templates de proposta

Cada proposta começa do zero. Não há templates para segmentos comuns.

Criar templates pré-configurados: "Pack Saúde Londrina", "Combo Premium Maringá"
Template define: pontos sugeridos, audiência, argumentos pré-escritos
Vendedor seleciona template e ajusta antes de enviar
Admin gerencia templates via painel
Backend: tabela proposta_templates
FEAT-10: Agenda de campanhas / ocupação de grade

Não há visão de quais pontos estão ocupados em qual período.

Calendário por ponto mostrando períodos contratados
Indicador de disponibilidade na listagem de pontos
Alerta ao criar proposta: "Ponto X já está reservado em Jan/25"
Visão de ocupação geral da grade por cidade
Backend: tabela ocupacao_pontos com ponto_id, inicio, fim, venda_id
🟡 Diferenciação — Features que elevam o produto
FEAT-11: Geração automática de texto da proposta por IA

O vendedor preenche manualmente todos os argumentos da proposta.

Ao selecionar pontos + segmento + objetivo, a IA gera:
Parágrafo de justificativa estratégica
Por que esses pontos foram escolhidos
Argumento de audiência baseado nos dados de entorno/IBGE
Editável pelo vendedor antes de enviar
Usa o endpoint /api/ai/campaign já existente como base
FEAT-12: Modo de apresentação para o cliente (tela cheia)

O PresentationMode.jsx existente é voltado para o vendedor. Não há modo para compartilhar a tela com o cliente de forma elegante.

Modo "Apresentação ao cliente": esconde métricas internas (custo operacional, margem)
QR code que o cliente escaneia para abrir o link público no próprio celular enquanto o vendedor apresenta
Narração automática com timer por slide (útil para apresentações assíncronas)
FEAT-13: Previsão de renovação com IA

O módulo de Renovações é manual — o vendedor preenche status sem suporte preditivo.

Análise dos contratos próximos do vencimento (próximos 60 dias)
Score de propensão a renovar baseado em: histórico do cliente, status da campanha, comportamento de pagamento
Alerta automático para o gerente quando score cair abaixo de threshold
Lista de prioridades de contato sugerida pela IA
FEAT-14: Exportação de dados (CSV/Excel)

Não há export de dados além de PDF.

Exportar lista de pontos com todos os atributos (para análise externa)
Exportar propostas do período (para auditoria/BI)
Exportar vendas por mês/vendedor (para relatório gerencial)
Botão simples na interface Admin → gera download direto
Backend: endpoint /api/admin/export?type=pontos|propostas|vendas&format=csv
FEAT-15: Integração com Google Maps / Street View

O mapa atual usa Leaflet com tiles OpenStreetMap.

Botão "Ver no Street View" no card do ponto
Mostra foto real do local onde a tela está instalada
Ajuda o cliente a reconhecer o ponto sem visita presencial
Implementação: link externo para maps.google.com/maps?q=lat,lng&layer=c (sem API key)
Resumo por esforço de implementação
Esforço	Features
< 1 dia	FEAT-15 (Street View link), FEAT-14 (CSV export)
2–3 dias	FEAT-5 (comparativo), FEAT-7 (favoritos na nuvem), FEAT-4 (e-mail)
1 semana	FEAT-1 (link público), FEAT-9 (templates), FEAT-10 (agenda)
2 semanas	FEAT-3 (Kanban), FEAT-2 (versões), FEAT-11 (IA texto proposta)
Sprint longo	FEAT-6 (ROI), FEAT-8 (performance), FEAT-12 (apresentação cliente), FEAT-13 (previsão renovação)
Quer que eu implemente alguma dessas features? As mais rápidas de entregar com alto impacto são FEAT-1 (link público de proposta) e FEAT-5 (comparativo de pontos).