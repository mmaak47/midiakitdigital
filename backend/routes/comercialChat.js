/**
 * comercialChat.js
 * Chatbot de Gestão Comercial — motor baseado em pontuação de intenções, sem IA.
 * Endpoint: POST /api/comercial/chat
 *
 * Funciona com linguagem informal, erros de digitação e perguntas vagas.
 * Em vez de "primeiro match ganha", cada intenção acumula pontos e a
 * de maior pontuação vence.
 */

const express = require('express');
const router = express.Router();

const MESES_NUM = {
  janeiro:1, fevereiro:2, marco:3, marco:3, abril:4, maio:5, junho:6,
  julho:7, agosto:8, setembro:9, outubro:10, novembro:11, dezembro:12,
  jan:1, fev:2, mar:3, abr:4, mai:5, jun:6, jul:7, ago:8, set:9, out:10, nov:11, dez:12
};

// ─── Normaliza texto: remove acentos, pontuação, lowercase ───────────────────
function norm(str) {
  return String(str || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function fmtBRL(val) {
  const n = Number(val) || 0;
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function fmtPct(val, total) {
  if (!total) return '0%';
  return ((val / total) * 100).toFixed(1) + '%';
}

function mesLabel(m) {
  return ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'][m - 1] || m;
}

function nowBR() {
  const d = new Date();
  return { mes: d.getMonth() + 1, ano: d.getFullYear() };
}

// ─── Detecta mês/ano na mensagem ─────────────────────────────────────────────
function detectarPeriodo(txt) {
  const n = norm(txt);
  const { mes: mesCurrent, ano: anoCurrent } = nowBR();
  let mes = mesCurrent;
  let ano = anoCurrent;

  if (/\b(esse|este|atual|corrente|agora|hoje|nesse|neste)\b.*\bmes\b|\bmes\b.*\b(esse|este|atual|corrente)\b|\bmes\b$/.test(n)) {
    return { mes, ano };
  }
  if (/\b(mes\s*passado|ultimo\s*mes|mes\s*anterior|passado)\b/.test(n)) {
    mes = mes === 1 ? 12 : mes - 1;
    if (mes === 12) ano -= 1;
    return { mes, ano };
  }
  if (/\b(proximo\s*mes|mes\s*que\s*vem|mes\s*seguinte)\b/.test(n)) {
    mes = mes === 12 ? 1 : mes + 1;
    if (mes === 1) ano += 1;
    return { mes, ano };
  }

  // Nome do mês (com variações de digitação)
  for (const [nome, num] of Object.entries(MESES_NUM)) {
    if (nome.length >= 3 && n.includes(nome)) {
      mes = num;
      const yearMatch = n.match(/\b(202\d)\b/);
      if (yearMatch) ano = Number(yearMatch[1]);
      return { mes, ano };
    }
  }

  // Q1..Q4
  const qMatch = n.match(/\bq([1-4])\b/);
  if (qMatch) return { trimestre: Number(qMatch[1]), ano };

  // "esse ano", "ano todo", "2026", "anual", "ano inteiro"
  if (/\b(esse|este|todo|inteiro)\b.*\bano\b|\bano\b.*\b(todo|inteiro)\b|\banual\b/.test(n)) {
    return { ano, tudo: true };
  }
  const soAno = n.match(/\b(202\d)\b/);
  if (soAno) return { ano: Number(soAno[1]), tudo: true };

  return { mes, ano };
}

// ─── Detecta nome de vendedor na mensagem ────────────────────────────────────
function detectarVendedor(txt, vendedores) {
  const n = norm(txt);
  // Tenta match completo primeiro, depois primeiro nome
  for (const v of vendedores) {
    if (norm(v).length >= 3 && n.includes(norm(v))) return v;
  }
  for (const v of vendedores) {
    const primeiro = norm(v).split(' ')[0];
    if (primeiro.length >= 3 && n.includes(primeiro)) return v;
  }
  return null;
}

// ─── Detecta se a pergunta é sobre o PIOR (menor) ─────────────────────────────
function detectarPior(txt) {
  const n = norm(txt);
  return /\b(menos|pior|ultimo|lanterna|baixo|mal|fraco|menos.*vendeu|vendeu.*menos|ruim|devagar|atr[ae]sado|perdendo)\b/.test(n);
}

// ─── Detecta se pergunta é sobre o usuário logado ────────────────────────────
function detectarPessoal(txt) {
  const n = norm(txt);
  return /\b(meu|minha|eu|meu resultado|como estou|como to|to bem|como estou indo|minha meta|meu mes)\b/.test(n);
}

// ─── MOTOR DE INTENÇÕES: baseado em pontuação ────────────────────────────────
// Cada grupo de sinais vale pontos. A intenção com maior score vence.
// Isso permite que perguntas vagas como "como ta o time?" sejam entendidas.

const INTENCOES_CONFIG = [
  {
    id: 'ajuda',
    sinais: [
      { peso: 5, regex: /^(ajuda|help|oi|ola|bom dia|boa tarde|boa noite|e ai|eai)\b/ },
      { peso: 4, regex: /\b(o que (voce|vc) (faz|sabe|pode)|que (perguntas|comandos|coisas) (posso|da|pode)|menu|opcoes|como (usar|funciona)|o que posso)\b/ },
      { peso: 3, regex: /\b(nao sei|nao entendo|como|explica)\b/ },
    ]
  },
  {
    id: 'meta_restante',
    sinais: [
      { peso: 5, regex: /\b(falt(a|am|ou)|restante|restam|preciso vender|precisa vender|ainda falta|quanto falta|quanto precisa)\b/ },
      // "vai bater a meta" → NÃO é meta_restante, é projeção — penalizar padrões futuros
      { peso: 4, regex: /\b(bater|atingir|chegar|alcançar)\b.*\bmeta\b(?!.*\b(vai|vamos|vai dar)\b)|\bmeta\b.*\b(bater|atingir|chegar)\b(?!.*\b(vai|vamos)\b)/ },
      { peso: 3, regex: /\bmeta\b/ },
      { peso: 2, regex: /\b(mes|semana|hoje)\b/ },
      { peso: 2, regex: /\b(falta|precisa)\b/ },
    ]
  },
  {
    id: 'ranking',
    sinais: [
      { peso: 6, regex: /\b(ranking|classificacao|placar|lideranca|lider)\b/ },
      // "quem vendeu mais" ou "quem mais vendeu"
      { peso: 7, regex: /\bquem\b.{0,25}\b(mais|melhor)\b.{0,25}\b(vendeu|vendendo|fechou|fez)\b/ },
      { peso: 7, regex: /\bquem\b.{0,25}\b(vendeu|fechou|fez)\b.{0,25}\b(mais|melhor)\b/ },
      { peso: 5, regex: /\b(melhor\s*vendedor|top\s*vendedor|campeao|numero\s*um|primeiro\s*lugar|quem\s*t[aá]\s*na\s*frente)\b/ },
      { peso: 3, regex: /\b(vendedores|time|equipe|todos)\b.*\b(vendeu|venderam|estao|ta|tao)\b/ },
      { peso: 2, regex: /\b(comparar|versus|vs)\b/ },
    ]
  },
  {
    id: 'pior_vendedor',
    sinais: [
      // "quem menos vendeu" ou "quem vendeu menos"
      { peso: 8, regex: /\bquem\b.{0,25}\b(menos|pior)\b.{0,25}\b(vendeu|vendendo|fechou|fez)\b/ },
      { peso: 8, regex: /\bquem\b.{0,25}\b(vendeu|fechou|fez)\b.{0,25}\b(menos)\b/ },
      { peso: 7, regex: /\b(menos|pior)\b.{0,20}\b(vendeu|vendendo)\b|\b(vendeu|vendendo)\b.{0,20}\b(menos)\b/ },
      { peso: 6, regex: /\b(pior\s*vendedor|ultimo\s*lugar|lanterna|pior\s*resultado)\b/ },
      { peso: 5, regex: /\bquem\b.{0,20}\b(ta|esta|tao)\b.{0,20}\b(mal|ruim|fraco|atrasado|devagar|travado)\b/ },
      { peso: 5, regex: /\b(quem.*precisa.*melhorar|quem.*nao.*ta.*bem)\b/ },
      { peso: 4, regex: /\b(pior|menos)\b.*\b(vendedor|vendendo|resultado)\b/ },
    ]
  },
  {
    id: 'total_vendedor',
    sinais: [
      // Somente quando há vendedor específico implícito (não "quem")
      { peso: 5, regex: /\b(quanto|total|resultado|performance)\b.*\b(vendeu|vendendo|fez|fechou)\b(?!.*\bquem\b)/ },
      { peso: 5, regex: /\b(vendeu|fechou|fez)\b.*\b(quanto|total|esse\s*mes|esse\s*ano)\b/ },
      { peso: 4, regex: /\b(resultado\s+d[oa]|vendas?\s+d[oa]|números\s+d[oa]|quanto\s+d[oa])\b/ },
      { peso: 3, regex: /\b(como\s*t[aá]\s*(o|a)\s+\w{3,})\b/ },
      { peso: 2, regex: /\b(vendeu|vendendo|resultado|fechou)\b/ },
    ]
  },
  {
    id: 'total_mes',
    sinais: [
      { peso: 5, regex: /\b(total\s*(do|de|esse|este)\s*mes|vendemos\s*esse\s*mes|quanto\s*(vendemos|faturamos)|receita\s*(do|de|esse)\s*mes)\b/ },
      { peso: 4, regex: /\b(faturamento|receita|quanto\s*entrou|quanto\s*fechamos|total\s*geral)\b/ },
      { peso: 3, regex: /\b(total|geral|soma)\b.*\b(vendas?|mes)\b|\b(vendas?|mes)\b.*\b(total|geral|soma)\b/ },
      { peso: 2, regex: /\b(mes|abril|janeiro|fevereiro|março|marco)\b.*\b(total|quanto)\b/ },
    ]
  },
  {
    id: 'atingimento',
    sinais: [
      { peso: 6, regex: /\b(atingimento|percentual|porcentagem|pct)\b/ },
      { peso: 6, regex: /\b(todo\s*mundo|todos)\b.{0,25}\b(batendo|bateu|bate|atingiu|atingindo|meta)\b/ },
      { peso: 5, regex: /\b(como\s*(ta|esta|tao)\s*(a\s*)?meta|meta\s*(ta|esta|atingida|batida)|batemos\s*a\s*meta)\b/ },
      { peso: 5, regex: /\b(como\s*t[aá]\s*o\s*time|como\s*t[aá]\s*a\s*equipe|como\s*estamos|como\s*ta\s*o\s*time)\b/ },
      { peso: 4, regex: /\b(quanto\s*por\s*cento|quantos?\s*%|ta\s*(bem|longe|perto|mal)\s*(da\s*)?meta)\b/ },
      { peso: 3, regex: /\bmeta\b.*\b(chegamos|chegou|atingimos|atingiu)\b|\b(chegamos|chegou|atingimos|atingiu)\b.*\bmeta\b/ },
      { peso: 2, regex: /\bmeta\b/ },
    ]
  },
  {
    id: 'historico',
    sinais: [
      { peso: 5, regex: /\b(historico|tendencia|evolucao|crescimento|comparativo|ultimos\s*meses|mes\s*a\s*mes)\b/ },
      { peso: 4, regex: /\b(como\s*(foi|foram)\s*(o\s*)?(ano|semestre)|como\s*evoluiu|como\s*cresceu|subiu|caiu|variacao)\b/ },
      { peso: 3, regex: /\b(comparar|versus|vs|antes|depois|antes\s*e\s*depois|meses\s*anteriores)\b/ },
      { peso: 3, regex: /\bano\s*todo\b|\btodo\s*o?\s*ano\b|\bano\s*inteiro\b/ },
    ]
  },
  {
    id: 'contratos_ativos',
    sinais: [
      { peso: 5, regex: /\b(contratos?\s*ativo|ativo.*contrato|carteira\s*(ativa|de\s*clientes?)|clientes?\s*ativo)\b/ },
      { peso: 4, regex: /\b(quantos?\s*(clientes?|contratos?|contas?)|total\s*(de\s*)?(clientes?|contratos?))\b/ },
      { peso: 4, regex: /\b(mrr|recorrencia|receita\s*recorrente|receita\s*mensal)\b/ },
      { peso: 3, regex: /\b(veiculando|ativo|vigente|rodando|no\s*ar)\b/ },
    ]
  },
  {
    id: 'ticket_medio',
    sinais: [
      { peso: 5, regex: /\b(ticket\s*medio|valor\s*medio|media\s*(das?\s*)?(vendas?|contratos?)|preco\s*medio)\b/ },
      { peso: 4, regex: /\b(media\s*(de\s*)?(valor|preco|contrato|venda))\b/ },
      { peso: 3, regex: /\b(em\s*media|quanto\s*cada|por\s*venda|por\s*contrato)\b/ },
    ]
  },
  {
    id: 'projecao',
    sinais: [
      { peso: 7, regex: /\b(projecao|projetado|previsao)\b/ },
      // "vai dar pra bater", "vai dar para fechar" etc.
      { peso: 8, regex: /\bvai\s*dar\s*(pra|para)\s*(bater|atingir|chegar|fechar)\b/ },
      { peso: 7, regex: /\bvai\s*dar\s*(certo|bem)\b/ },
      // "vai bater a meta", "vamos bater a meta"
      { peso: 7, regex: /\b(vai|vamos)\s*(bater|atingir|fechar)\s*(a\s*)?meta\b/ },
      { peso: 6, regex: /\b(no\s*ritmo\s*atual|se\s*continuar|se\s*mantiver|fim\s*do\s*mes\s*vai)\b/ },
      { peso: 5, regex: /\bfim\s*do\s*mes\b.*\b(bater|fechar|atingir)\b|\b(bater|fechar|atingir)\b.*\bfim\s*do\s*mes\b/ },
      { peso: 3, regex: /\b(futuro|estimativa|proximo)\b.*\b(mes|fechamento)\b/ },
    ]
  },
  {
    id: 'ultimas_vendas',
    sinais: [
      { peso: 5, regex: /\b(ultimas?\s*vendas?|vendas?\s*recentes?|novos?\s*clientes?|ultimos?\s*negocios?|ultimas?\s*fechamentos?)\b/ },
      { peso: 4, regex: /\b(quem\s*(fechou|vendeu)\s*(ultimo|recentemente|agora|hoje|ontem))\b/ },
      { peso: 4, regex: /\b(o\s*que\s*(fechamos?|vendemos?)\s*(recentemente|ultimamente|essa\s*semana))\b/ },
      { peso: 3, regex: /\b(recente|ultimamente|agora\s*pouco|acabou\s*de)\b/ },
    ]
  },
  {
    id: 'sem_venda',
    sinais: [
      { peso: 6, regex: /\b(sem\s*venda|nao\s*vendeu|quem\s*nao\s*vendeu|sem\s*nenhuma\s*venda|sem\s*fechar|nao\s*ta\s*vendendo|nao\s*vendendo)\b/ },
      { peso: 6, regex: /\b(zerado|zerando)\b/ }, // "zerado" quase sempre = sem venda
      { peso: 5, regex: /\b(vendedor\s*(parado|zerado|sem\s*venda)|quem\s*ta\s*zerado|zerado\s*no\s*mes)\b/ },
      { peso: 5, regex: /\b(alguem|algum\s*vendedor)\b.{0,30}\b(parado|travado|zerado|sem\s*venda|sem\s*fechar)\b/ },
      { peso: 4, regex: /\b(parado|travado|sem\s*fechar|sem\s*resultado|sem\s*nada)\b.*\b(vendedor|vendendo|mes)\b/ },
    ]
  },
  {
    id: 'comparar_vendedores',
    sinais: [
      { peso: 5, regex: /\b(\w+\s+(versus|vs|contra|x|ou)\s+\w+)\b/ },
      { peso: 4, regex: /\b(diferenca\s*entre|comparar?\s+\w+\s+(e|com)\s+\w+)\b/ },
      { peso: 4, regex: /\b(quem\s*(vendeu|fez)\s*mais\s*entre|qual\s*(dos|deles|delas)\s*(foi|ta|esta)\s*melhor)\b/ },
    ]
  },
];

function classificarIntencao(txt) {
  const n = norm(txt);
  const scores = {};

  for (const { id, sinais } of INTENCOES_CONFIG) {
    scores[id] = 0;
    for (const { peso, regex } of sinais) {
      if (regex.test(n)) scores[id] += peso;
    }
  }

  // Encontra a intenção com maior pontuação
  const melhor = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
  if (!melhor || melhor[1] === 0) return 'desconhecido';

  // Se dois empatados com pontuação alta, usa lógica de desempate
  const [id, score] = melhor;
  if (score < 3) return 'desconhecido'; // pontuação muito baixa = não entendeu

  return id;
}

// ─── Sugestão inteligente quando não entende ─────────────────────────────────
function sugerirComandoProximo(txt) {
  const n = norm(txt);
  const sugestoes = [
    { match: /meta|quanto falt|bater/, sug: '*Quanto falta pra meta esse mês?*' },
    { match: /melhor|mais.*vend|top|lider/, sug: '*Quem mais vendeu esse mês?*' },
    { match: /pior|menos.*vend|ruim|mal/, sug: '*Quem menos vendeu esse mês?*' },
    { match: /total|faturamento|receita/, sug: '*Qual o total de vendas esse mês?*' },
    { match: /porcentagem|percentual|pct/, sug: '*Qual o atingimento da meta?*' },
    { match: /historico|tendencia|evolucao/, sug: '*Mostre o histórico de 2026*' },
    { match: /ticket|media/, sug: '*Qual o ticket médio?*' },
    { match: /projecao|vai bater|previsao/, sug: '*Qual a projeção para o mês?*' },
    { match: /sem venda|parado|zerado/, sug: '*Quem está sem venda esse mês?*' },
    { match: /contrato|ativo|carteira/, sug: '*Quantos contratos ativos temos?*' },
    { match: /vendedor|performance|resultado/, sug: '*Como está o time esse mês?*' },
  ];
  for (const { match, sug } of sugestoes) {
    if (match.test(n)) return `\n\n💡 Talvez você quis perguntar: ${sug}`;
  }
  return '';
}

// ─── Handler principal ───────────────────────────────────────────────────────
router.post('/', (req, res) => {
  const db = req.app.get('db');
  if (!db) return res.status(500).json({ error: 'DB não disponível' });

  const { mensagem } = req.body;
  if (!mensagem || !String(mensagem).trim()) {
    return res.json({
      resposta: 'Digite uma pergunta! Tente: *Quanto falta pra meta?* ou *Quem mais vendeu esse mês?*',
      intencao: 'ajuda'
    });
  }

  const txt = String(mensagem).trim();
  const intencao = classificarIntencao(txt);
  const periodo = detectarPeriodo(txt);
  const ehPior = detectarPior(txt);

  // Lista de vendedores únicos do banco
  let vendedores = [];
  try {
    const rows = db.prepare(`
      SELECT DISTINCT vc.vendedor_nome FROM vendas_comercial vc WHERE vc.vendedor_nome IS NOT NULL
      UNION
      SELECT DISTINCT mv.vendedor_nome FROM metas_vendedor mv WHERE mv.vendedor_nome IS NOT NULL
    `).all();
    vendedores = rows.map(r => r.vendedor_nome).filter(Boolean);
  } catch (e) { /* ignora */ }

  const vendedorAlvo = detectarVendedor(txt, vendedores);

  try {
    let resposta = '';
    let dados = null;

    switch (intencao) {

      // ── Ajuda ────────────────────────────────────────────────────────────
      case 'ajuda': {
        resposta =
          `👋 Olá! Sou o assistente de Gestão Comercial.\n\n` +
          `Você pode me perguntar coisas como:\n\n` +
          `• *Quanto falta pra meta esse mês?*\n` +
          `• *Quem mais vendeu em março?*\n` +
          `• *Quem menos vendeu esse mês?*\n` +
          `• *Como tá o atingimento da meta?*\n` +
          `• *Como foi o ano todo?*\n` +
          `• *Quantos contratos ativos temos?*\n` +
          `• *Qual o ticket médio?*\n` +
          `• *Vai dar pra bater a meta?*\n` +
          `• *Quem está sem venda esse mês?*\n` +
          `• *Mostre as últimas vendas*\n\n` +
          `Pode escrever do jeito que quiser, eu entendo! 😊`;
        break;
      }

      // ── Meta restante ────────────────────────────────────────────────────
      case 'meta_restante': {
        const { mes, ano } = periodo.tudo ? nowBR() : periodo;
        if (vendedorAlvo) {
          const meta = db.prepare(`SELECT mv.valor_meta FROM metas_vendedor mv WHERE mv.vendedor_nome = ? AND mv.mes = ? AND mv.ano = ?`).get(vendedorAlvo, mes, ano);
          const realizado = db.prepare(`SELECT COALESCE(SUM(vc.total_contrato), 0) as total FROM vendas_comercial vc WHERE vc.vendedor_nome = ? AND vc.mes = ? AND vc.ano = ?`).get(vendedorAlvo, mes, ano);
          const metaVal = meta?.valor_meta || 0;
          const realizadoVal = realizado?.total || 0;
          const faltam = Math.max(0, metaVal - realizadoVal);
          if (!metaVal) {
            resposta = `Não encontrei meta cadastrada para *${vendedorAlvo}* em ${mesLabel(mes)}/${ano}.\nCadastre as metas na aba de Gestão Comercial.`;
          } else if (faltam === 0) {
            const excesso = realizadoVal - metaVal;
            resposta = `🎯 *${vendedorAlvo}* já bateu a meta de ${mesLabel(mes)}/${ano}!` +
              `\n• Meta: ${fmtBRL(metaVal)}` +
              `\n• Realizado: ${fmtBRL(realizadoVal)} (${fmtPct(realizadoVal, metaVal)})` +
              (excesso > 0 ? `\n• Ultrapassou em: ${fmtBRL(excesso)} 🚀` : '');
          } else {
            resposta = `📊 *${vendedorAlvo}* em ${mesLabel(mes)}/${ano}:\n• Meta: ${fmtBRL(metaVal)}\n• Realizado: ${fmtBRL(realizadoVal)} (${fmtPct(realizadoVal, metaVal)})\n• Faltam: *${fmtBRL(faltam)}*`;
          }
        } else {
          const metaGeral = db.prepare(`SELECT COALESCE(SUM(mv.valor_meta), 0) as total FROM metas_vendedor mv WHERE mv.mes = ? AND mv.ano = ?`).get(mes, ano);
          const realizadoGeral = db.prepare(`SELECT COALESCE(SUM(vc.total_contrato), 0) as total FROM vendas_comercial vc WHERE vc.mes = ? AND vc.ano = ?`).get(mes, ano);
          const metaVal = metaGeral?.total || 0;
          const realizadoVal = realizadoGeral?.total || 0;
          const faltam = Math.max(0, metaVal - realizadoVal);

          if (!metaVal) {
            resposta = `Não há metas cadastradas para ${mesLabel(mes)}/${ano}.\nCadastre as metas na aba de Gestão Comercial.`;
          } else if (faltam === 0) {
            resposta = `🎉 A equipe já bateu a meta de ${mesLabel(mes)}/${ano}!\nMeta: ${fmtBRL(metaVal)} | Realizado: ${fmtBRL(realizadoVal)} (${fmtPct(realizadoVal, metaVal)})`;
          } else {
            resposta = `📊 Situação da equipe em ${mesLabel(mes)}/${ano}:\n• Meta: ${fmtBRL(metaVal)}\n• Realizado: ${fmtBRL(realizadoVal)} (${fmtPct(realizadoVal, metaVal)})\n• Faltam: *${fmtBRL(faltam)}*`;
          }

          // Breakdown por vendedor
          const breakdown = db.prepare(`
            SELECT vc.vendedor_nome,
                   COALESCE(SUM(vc.total_contrato), 0) as realizado,
                   COALESCE(MAX(mv.valor_meta), 0) as meta
            FROM vendas_comercial vc
            LEFT JOIN metas_vendedor mv ON mv.vendedor_nome = vc.vendedor_nome AND mv.mes = ? AND mv.ano = ?
            WHERE vc.mes = ? AND vc.ano = ?
            GROUP BY vc.vendedor_nome
          `).all(mes, ano, mes, ano);

          if (breakdown.length > 0) {
            resposta += '\n\n*Por vendedor:*';
            for (const row of breakdown) {
              const pct = row.meta > 0 ? fmtPct(row.realizado, row.meta) : '—';
              const emoji = row.meta > 0 && row.realizado >= row.meta ? '✅' : row.meta > 0 ? '⏳' : '•';
              resposta += `\n${emoji} ${row.vendedor_nome}: ${fmtBRL(row.realizado)}${row.meta ? ` / ${fmtBRL(row.meta)} (${pct})` : ''}`;
            }
          }
          dados = breakdown;
        }
        break;
      }

      // ── Ranking / Pior vendedor ───────────────────────────────────────────
      case 'ranking':
      case 'pior_vendedor': {
        const { mes, ano, tudo } = periodo;
        const ordemAsc = ehPior || intencao === 'pior_vendedor';
        const whereExtra = tudo ? 'AND vc.ano = ?' : 'AND vc.mes = ? AND vc.ano = ?';
        const params = tudo ? [ano] : [mes, ano];
        const labelPeriodo = tudo ? `${ano}` : `${mesLabel(mes)}/${ano}`;

        // Busca todos os vendedores que tiveram vendas OU têm meta
        const rows = db.prepare(`
          SELECT vc.vendedor_nome,
                 COALESCE(SUM(vc.total_contrato), 0) as realizado,
                 COUNT(*) as qtd_vendas,
                 COALESCE(MAX(mv.valor_meta), 0) as meta
          FROM vendas_comercial vc
          LEFT JOIN metas_vendedor mv ON mv.vendedor_nome = vc.vendedor_nome
            AND mv.mes = ? AND mv.ano = ?
          WHERE 1=1 ${whereExtra}
          GROUP BY vc.vendedor_nome
          ORDER BY realizado ${ordemAsc ? 'ASC' : 'DESC'}
        `).all(...(tudo ? [0, ano, ...params] : [mes, ano, ...params]));

        if (rows.length === 0) {
          resposta = `Nenhum dado de vendas encontrado para ${labelPeriodo}.`;
        } else {
          if (ordemAsc) {
            resposta = `📉 Quem vendeu menos — ${labelPeriodo}:`;
            rows.forEach((r, i) => {
              const emoji = i === 0 ? '🔴' : i === 1 ? '🟡' : '🟢';
              const pct = r.meta > 0 ? ` (${fmtPct(r.realizado, r.meta)} da meta)` : '';
              resposta += `\n${emoji} ${i+1}º ${r.vendedor_nome}: ${fmtBRL(r.realizado)}${pct}`;
            });
            if (rows.length > 0) {
              resposta += `\n\n⚠️ Atenção: *${rows[0].vendedor_nome}* com menor resultado — ${fmtBRL(rows[0].realizado)}`;
            }
          } else {
            resposta = `🏆 Ranking de vendas — ${labelPeriodo}:`;
            rows.forEach((r, i) => {
              const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i+1}º`;
              const pct = r.meta > 0 ? ` (${fmtPct(r.realizado, r.meta)} da meta)` : '';
              resposta += `\n${medal} ${r.vendedor_nome}: ${fmtBRL(r.realizado)}${pct}`;
            });
            resposta += `\n\n🏅 Líder: *${rows[0].vendedor_nome}* com ${fmtBRL(rows[0].realizado)}`;
          }
        }
        dados = rows;
        break;
      }

      // ── Total por vendedor ───────────────────────────────────────────────
      case 'total_vendedor': {
        const { mes, ano, tudo, trimestre } = periodo;
        let whereExtra = '';
        let params = [];
        let labelPeriodo = '';

        if (tudo) {
          whereExtra = 'AND vc.ano = ?'; params = [ano]; labelPeriodo = `${ano}`;
        } else if (trimestre) {
          const meses = [trimestre*3-2, trimestre*3-1, trimestre*3];
          whereExtra = `AND vc.ano = ? AND vc.mes IN (${meses.join(',')})`; params = [ano]; labelPeriodo = `Q${trimestre}/${ano}`;
        } else {
          whereExtra = 'AND vc.mes = ? AND vc.ano = ?'; params = [mes, ano]; labelPeriodo = `${mesLabel(mes)}/${ano}`;
        }

        if (vendedorAlvo) {
          const rows = db.prepare(`SELECT vc.total_contrato, vc.cliente, vc.mes, vc.data_venda FROM vendas_comercial vc WHERE vc.vendedor_nome = ? ${whereExtra} ORDER BY vc.data_venda DESC`).all(vendedorAlvo, ...params);
          const total = rows.reduce((s, r) => s + (r.total_contrato || 0), 0);
          if (rows.length === 0) {
            resposta = `Não encontrei vendas de *${vendedorAlvo}* em ${labelPeriodo}.`;
          } else {
            resposta = `💼 *${vendedorAlvo}* em ${labelPeriodo}:\n• Total: *${fmtBRL(total)}* (${rows.length} venda${rows.length > 1 ? 's' : ''})`;
            if (rows.length <= 8) {
              resposta += '\n\n*Detalhes:*';
              for (const r of rows) resposta += `\n• ${r.cliente}: ${fmtBRL(r.total_contrato)}`;
            }
          }
          dados = { vendedor: vendedorAlvo, total, vendas: rows };
        } else {
          const rows = db.prepare(`SELECT vc.vendedor_nome, COALESCE(SUM(vc.total_contrato),0) as total, COUNT(*) as qtd FROM vendas_comercial vc WHERE 1=1 ${whereExtra} GROUP BY vc.vendedor_nome ORDER BY total DESC`).all(...params);
          if (rows.length === 0) {
            resposta = `Não encontrei vendas em ${labelPeriodo}.`;
          } else {
            resposta = `📊 Vendas por vendedor em ${labelPeriodo}:`;
            rows.forEach((r, i) => {
              const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i+1}º`;
              resposta += `\n${medal} ${r.vendedor_nome}: ${fmtBRL(r.total)} (${r.qtd} venda${r.qtd > 1 ? 's' : ''})`;
            });
          }
          dados = rows;
        }
        break;
      }

      // ── Total do mês ─────────────────────────────────────────────────────
      case 'total_mes': {
        const { mes, ano, tudo, trimestre } = periodo;

        if (tudo) {
          const rows = db.prepare(`SELECT vc.mes, COALESCE(SUM(vc.total_contrato), 0) as total, COUNT(*) as qtd FROM vendas_comercial vc WHERE vc.ano = ? GROUP BY vc.mes ORDER BY vc.mes`).all(ano);
          const totalAno = rows.reduce((s, r) => s + r.total, 0);
          resposta = `📅 Total de vendas em ${ano}: *${fmtBRL(totalAno)}*`;
          for (const r of rows) resposta += `\n• ${mesLabel(r.mes)}: ${fmtBRL(r.total)} (${r.qtd} venda${r.qtd > 1 ? 's' : ''})`;
          dados = rows;
        } else if (trimestre) {
          const meses = [trimestre*3-2, trimestre*3-1, trimestre*3];
          const rows = db.prepare(`SELECT vc.mes, COALESCE(SUM(vc.total_contrato), 0) as total, COUNT(*) as qtd FROM vendas_comercial vc WHERE vc.ano = ? AND vc.mes IN (${meses.join(',')}) GROUP BY vc.mes ORDER BY vc.mes`).all(ano);
          const totalQ = rows.reduce((s, r) => s + r.total, 0);
          resposta = `📅 Q${trimestre}/${ano}: *${fmtBRL(totalQ)}*`;
          for (const r of rows) resposta += `\n• ${mesLabel(r.mes)}: ${fmtBRL(r.total)}`;
          dados = rows;
        } else {
          const result = db.prepare(`SELECT COALESCE(SUM(vc.total_contrato), 0) as total, COUNT(*) as qtd FROM vendas_comercial vc WHERE vc.mes = ? AND vc.ano = ?`).get(mes, ano);
          const meta = db.prepare(`SELECT COALESCE(SUM(mv.valor_meta), 0) as total FROM metas_vendedor mv WHERE mv.mes = ? AND mv.ano = ?`).get(mes, ano);
          const t = result?.total || 0;
          const m = meta?.total || 0;
          resposta = `📅 Total de vendas em ${mesLabel(mes)}/${ano}:\n• Realizado: *${fmtBRL(t)}* (${result?.qtd || 0} venda${result?.qtd !== 1 ? 's' : ''})`;
          if (m > 0) resposta += `\n• Meta: ${fmtBRL(m)} (${fmtPct(t, m)})`;
          dados = { total: t, meta: m };
        }
        break;
      }

      // ── Atingimento da meta ──────────────────────────────────────────────
      case 'atingimento': {
        const { mes, ano } = periodo.tudo ? nowBR() : periodo;
        const metas = db.prepare(`
          SELECT mv.vendedor_nome, mv.valor_meta,
                 COALESCE(SUM(vc.total_contrato), 0) as realizado
          FROM metas_vendedor mv
          LEFT JOIN vendas_comercial vc ON vc.vendedor_nome = mv.vendedor_nome AND vc.mes = mv.mes AND vc.ano = mv.ano
          WHERE mv.mes = ? AND mv.ano = ?
          GROUP BY mv.vendedor_nome
          ORDER BY (COALESCE(SUM(vc.total_contrato), 0) * 1.0 / mv.valor_meta) DESC
        `).all(mes, ano);

        if (metas.length === 0) {
          resposta = `Não há metas cadastradas para ${mesLabel(mes)}/${ano}.\nCadastre as metas na aba de Gestão Comercial.`;
        } else {
          const totalMeta = metas.reduce((s, r) => s + r.valor_meta, 0);
          const totalRealizado = metas.reduce((s, r) => s + r.realizado, 0);
          resposta = `🎯 Atingimento da meta — ${mesLabel(mes)}/${ano}:\n• Equipe: *${fmtPct(totalRealizado, totalMeta)}* (${fmtBRL(totalRealizado)} / ${fmtBRL(totalMeta)})\n`;
          for (const r of metas) {
            const pct = ((r.realizado / r.valor_meta) * 100).toFixed(0);
            const bar = buildProgressBar(Number(pct));
            const status = Number(pct) >= 100 ? '✅' : Number(pct) >= 70 ? '⚡' : Number(pct) >= 40 ? '⏳' : '🔴';
            resposta += `\n${status} ${r.vendedor_nome}: ${bar} ${pct}%`;
          }
        }
        dados = metas;
        break;
      }

      // ── Histórico ────────────────────────────────────────────────────────
      case 'historico': {
        const { ano } = periodo;
        const rows = db.prepare(`SELECT vc.mes, COALESCE(SUM(vc.total_contrato), 0) as realizado, COUNT(*) as qtd FROM vendas_comercial vc WHERE vc.ano = ? GROUP BY vc.mes ORDER BY vc.mes`).all(ano);
        const metas = db.prepare(`SELECT mv.mes, COALESCE(SUM(mv.valor_meta), 0) as meta FROM metas_vendedor mv WHERE mv.ano = ? GROUP BY mv.mes ORDER BY mv.mes`).all(ano);
        const metaMap = {};
        for (const m of metas) metaMap[m.mes] = m.meta;

        if (rows.length === 0) {
          resposta = `Nenhum dado encontrado para ${ano}.`;
        } else {
          resposta = `📈 Histórico de vendas — ${ano}:`;
          let acumulado = 0;
          for (const r of rows) {
            acumulado += r.realizado;
            const meta = metaMap[r.mes] || 0;
            const pctStr = meta > 0 ? ` (${fmtPct(r.realizado, meta)})` : '';
            resposta += `\n• ${mesLabel(r.mes)}: ${fmtBRL(r.realizado)}${pctStr}`;
          }
          resposta += `\n\nAcumulado ${ano}: *${fmtBRL(acumulado)}*`;
          if (rows.length >= 2) {
            const ultimos = rows.slice(-3);
            const primeiro = ultimos[0].realizado;
            const ultimo = ultimos[ultimos.length - 1].realizado;
            if (ultimo > primeiro * 1.1) resposta += '\n📈 Tendência: *crescimento*';
            else if (ultimo < primeiro * 0.9) resposta += '\n📉 Tendência: *queda*';
            else resposta += '\n➡️ Tendência: *estável*';
          }
        }
        dados = rows;
        break;
      }

      // ── Contratos ativos ─────────────────────────────────────────────────
      case 'contratos_ativos': {
        const rows = db.prepare(`SELECT COUNT(*) as total, COALESCE(SUM(v.valor_mensal), 0) as mrr FROM vendas v WHERE v.status = 'ativa'`).get();
        const porVendedor = db.prepare(`SELECT v.vendedor_nome, COUNT(*) as qtd FROM vendas v WHERE v.status = 'ativa' GROUP BY v.vendedor_nome ORDER BY qtd DESC`).all();
        resposta = `📋 Contratos ativos:\n• Total: *${rows?.total || 0}* contratos\n• MRR: *${fmtBRL(rows?.mrr || 0)}*`;
        if (porVendedor.length > 0) {
          resposta += '\n\n*Por vendedor:*';
          for (const r of porVendedor) resposta += `\n• ${r.vendedor_nome}: ${r.qtd} contrato${r.qtd > 1 ? 's' : ''}`;
        }
        dados = { total: rows?.total, mrr: rows?.mrr, porVendedor };
        break;
      }

      // ── Ticket médio ─────────────────────────────────────────────────────
      case 'ticket_medio': {
        const { mes, ano, tudo } = periodo;
        const whereExtra = tudo ? 'WHERE vc.ano = ?' : 'WHERE vc.mes = ? AND vc.ano = ?';
        const params = tudo ? [ano] : [mes, ano];
        const labelPeriodo = tudo ? `${ano}` : `${mesLabel(mes)}/${ano}`;
        const result = db.prepare(`SELECT AVG(NULLIF(vc.total_contrato, 0)) as media, COUNT(*) as qtd FROM vendas_comercial vc ${whereExtra} AND vc.total_contrato > 0`).get(...params);
        const geral = result?.media || 0;
        resposta = `💰 Ticket médio em ${labelPeriodo}:\n• Ticket médio: *${fmtBRL(geral)}*\n• Baseado em ${result?.qtd || 0} venda${result?.qtd !== 1 ? 's' : ''}`;
        const porVendedor = db.prepare(`SELECT vc.vendedor_nome, AVG(NULLIF(vc.total_contrato, 0)) as media, COUNT(*) as qtd FROM vendas_comercial vc ${whereExtra} AND vc.total_contrato > 0 GROUP BY vc.vendedor_nome ORDER BY media DESC`).all(...params);
        if (porVendedor.length > 1) {
          resposta += '\n\n*Por vendedor:*';
          for (const r of porVendedor) resposta += `\n• ${r.vendedor_nome}: ${fmtBRL(r.media)} (${r.qtd} venda${r.qtd > 1 ? 's' : ''})`;
        }
        dados = { media: geral, porVendedor };
        break;
      }

      // ── Projeção ─────────────────────────────────────────────────────────
      case 'projecao': {
        const { mes, ano } = nowBR();
        const hoje = new Date();
        const diasNoMes = new Date(ano, mes, 0).getDate();
        const diasPassados = Math.min(hoje.getDate(), diasNoMes);
        const diasRestantes = diasNoMes - diasPassados;
        const realizadoAtual = db.prepare(`SELECT COALESCE(SUM(vc.total_contrato), 0) as total, COUNT(*) as qtd FROM vendas_comercial vc WHERE vc.mes = ? AND vc.ano = ?`).get(mes, ano);
        const metaAtual = db.prepare(`SELECT COALESCE(SUM(mv.valor_meta), 0) as total FROM metas_vendedor mv WHERE mv.mes = ? AND mv.ano = ?`).get(mes, ano);
        const realizado = realizadoAtual?.total || 0;
        const meta = metaAtual?.total || 0;
        const taxaDiaria = diasPassados > 0 ? realizado / diasPassados : 0;
        const projecao = realizado + (taxaDiaria * diasRestantes);
        resposta = `🔮 Projeção para ${mesLabel(mes)}/${ano}:\n• Realizado até dia ${diasPassados}: ${fmtBRL(realizado)}\n• Ritmo atual: ${fmtBRL(taxaDiaria)}/dia\n• Projeção fim do mês: *${fmtBRL(projecao)}*`;
        if (meta > 0) {
          const pctProjecao = (projecao / meta) * 100;
          resposta += `\n• Meta: ${fmtBRL(meta)}`;
          if (pctProjecao >= 100) {
            resposta += `\n✅ No ritmo atual, a equipe *vai bater a meta* (${pctProjecao.toFixed(0)}%)! 🚀`;
          } else {
            const diasUteis = Math.round(diasRestantes * 5 / 7);
            const faltaExtra = meta - projecao;
            resposta += `\n⚡ Precisa de mais *${fmtBRL(faltaExtra / Math.max(1, diasUteis))}/dia útil* para bater a meta`;
          }
        }
        dados = { realizado, meta, projecao, taxaDiaria };
        break;
      }

      // ── Últimas vendas ───────────────────────────────────────────────────
      case 'ultimas_vendas': {
        const whereVendedor = vendedorAlvo ? 'AND vc.vendedor_nome = ?' : '';
        const params = vendedorAlvo ? [vendedorAlvo] : [];
        const rows = db.prepare(`SELECT vc.cliente, vc.vendedor_nome, vc.total_contrato, vc.data_venda, vc.mes, vc.ano FROM vendas_comercial vc WHERE 1=1 ${whereVendedor} ORDER BY COALESCE(vc.data_venda, vc.created_at) DESC LIMIT 8`).all(...params);
        if (rows.length === 0) {
          resposta = `Nenhuma venda recente encontrada${vendedorAlvo ? ` para ${vendedorAlvo}` : ''}.`;
        } else {
          resposta = `🕒 Últimas ${rows.length} vendas${vendedorAlvo ? ` de *${vendedorAlvo}*` : ''}:`;
          for (const r of rows) {
            const data = r.data_venda ? new Date(r.data_venda).toLocaleDateString('pt-BR') : `${mesLabel(r.mes)}/${r.ano}`;
            resposta += `\n• ${r.cliente} — ${fmtBRL(r.total_contrato)} (${r.vendedor_nome}, ${data})`;
          }
        }
        dados = rows;
        break;
      }

      // ── Sem venda ────────────────────────────────────────────────────────
      case 'sem_venda': {
        const { mes, ano } = periodo.tudo ? nowBR() : periodo;
        const comVenda = db.prepare(`SELECT DISTINCT vc.vendedor_nome FROM vendas_comercial vc WHERE vc.mes = ? AND vc.ano = ?`).all(mes, ano).map(r => r.vendedor_nome);
        const todosVendedores = db.prepare(`SELECT DISTINCT mv.vendedor_nome FROM metas_vendedor mv WHERE mv.ano = ?`).all(ano).map(r => r.vendedor_nome);
        const semVenda = todosVendedores.filter(v => !comVenda.includes(v));
        if (semVenda.length === 0) {
          resposta = `✅ Todos os vendedores realizaram pelo menos uma venda em ${mesLabel(mes)}/${ano}!`;
        } else {
          resposta = `⚠️ Vendedores sem venda em ${mesLabel(mes)}/${ano}:`;
          for (const v of semVenda) {
            const meta = db.prepare(`SELECT mv.valor_meta FROM metas_vendedor mv WHERE mv.vendedor_nome = ? AND mv.mes = ? AND mv.ano = ?`).get(v, mes, ano);
            resposta += `\n• ${v}${meta ? ` (meta: ${fmtBRL(meta.valor_meta)})` : ''}`;
          }
        }
        dados = semVenda;
        break;
      }

      // ── Comparar vendedores ──────────────────────────────────────────────
      case 'comparar_vendedores': {
        // Tenta extrair dois nomes da mensagem
        const { mes, ano, tudo } = periodo;
        const labelPeriodo = tudo ? `${ano}` : `${mesLabel(mes)}/${ano}`;
        const whereExtra = tudo ? 'AND vc.ano = ?' : 'AND vc.mes = ? AND vc.ano = ?';
        const params = tudo ? [ano] : [mes, ano];
        const todos = db.prepare(`SELECT vc.vendedor_nome, COALESCE(SUM(vc.total_contrato),0) as total, COUNT(*) as qtd FROM vendas_comercial vc WHERE 1=1 ${whereExtra} GROUP BY vc.vendedor_nome ORDER BY total DESC`).all(...params);
        if (todos.length === 0) {
          resposta = `Não encontrei vendas em ${labelPeriodo}.`;
        } else {
          resposta = `📊 Comparativo de vendedores — ${labelPeriodo}:`;
          todos.forEach((r, i) => {
            const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i+1}º`;
            resposta += `\n${medal} ${r.vendedor_nome}: ${fmtBRL(r.total)} (${r.qtd} venda${r.qtd > 1 ? 's' : ''})`;
          });
        }
        dados = todos;
        break;
      }

      // ── Não entendeu ─────────────────────────────────────────────────────
      default: {
        const sugestao = sugerirComandoProximo(txt);
        if (sugestao) {
          resposta = `🤔 Não entendi bem o que você quis dizer.${sugestao}\n\nOu digite *ajuda* para ver tudo que posso responder!`;
        } else {
          resposta = `🤔 Não entendi essa pergunta.\n\nTente algo como:\n• *Quanto falta pra meta?*\n• *Quem mais vendeu esse mês?*\n• *Como tá o atingimento da meta?*\n\nDigite *ajuda* para ver todos os exemplos.`;
        }
        break;
      }
    }

    return res.json({ resposta, intencao, dados });

  } catch (err) {
    console.error('[comercialChat] erro:', err);
    return res.status(500).json({ resposta: `⚠️ Erro ao consultar os dados: ${err.message}`, intencao: 'erro' });
  }
});

// ── Barra de progresso visual ─────────────────────────────────────────────────
function buildProgressBar(pct) {
  const filled = Math.min(10, Math.round(pct / 10));
  return '█'.repeat(filled) + '░'.repeat(10 - filled);
}

module.exports = router;
