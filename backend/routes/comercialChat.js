/**
 * comercialChat.js
 * Chatbot de Gestão Comercial — motor baseado em regex/intenções, sem IA.
 * Endpoint: POST /api/comercial/chat
 */

const express = require('express');
const router = express.Router();

const MESES_PT = [
  'janeiro','fevereiro','março','marco','abril','maio','junho',
  'julho','agosto','setembro','outubro','novembro','dezembro'
];
const MESES_ABREV = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
const MESES_NUM = {
  janeiro:1, fevereiro:2, março:3, marco:3, abril:4, maio:5, junho:6,
  julho:7, agosto:8, setembro:9, outubro:10, novembro:11, dezembro:12,
  jan:1, fev:2, mar:3, abr:4, mai:5, jun:6, jul:7, ago:8, set:9, out:10, nov:11, dez:12
};

function norm(str) {
  return String(str || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ').trim();
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

  // "esse mês", "mês atual", "mês corrente"
  if (/esse mes|mes atual|mes corrente|this month/.test(n)) return { mes, ano };

  // "mês passado", "ultimo mes"
  if (/mes passado|ultimo mes|last month/.test(n)) {
    mes = mes === 1 ? 12 : mes - 1;
    if (mes === 12) ano -= 1;
    return { mes, ano };
  }

  // "próximo mês"
  if (/proximo mes|next month/.test(n)) {
    mes = mes === 12 ? 1 : mes + 1;
    if (mes === 1) ano += 1;
    return { mes, ano };
  }

  // Nome do mês
  for (const [nome, num] of Object.entries(MESES_NUM)) {
    if (n.includes(nome)) {
      mes = num;
      const yearMatch = n.match(/20(\d{2})/);
      if (yearMatch) ano = Number(yearMatch[0]);
      return { mes, ano };
    }
  }

  // "Q1", "Q2", "Q3", "Q4"
  const qMatch = n.match(/q([1-4])/);
  if (qMatch) {
    const q = Number(qMatch[1]);
    return { trimestre: q, ano };
  }

  // "ano todo", "esse ano", "2026", "anual"
  if (/ano todo|esse ano|ano inteiro|anual/.test(n)) return { ano, tudo: true };
  const soAno = n.match(/\b(202\d)\b/);
  if (soAno) return { ano: Number(soAno[1]), tudo: true };

  return { mes, ano };
}

// ─── Detecta nome de vendedor na mensagem ────────────────────────────────────
function detectarVendedor(txt, vendedores) {
  const n = norm(txt);
  for (const v of vendedores) {
    const nv = norm(v);
    if (n.includes(nv)) return v;
    // primeiro nome
    const primeiro = nv.split(' ')[0];
    if (primeiro.length >= 3 && n.includes(primeiro)) return v;
  }
  return null;
}

// ─── Classifica intenção ─────────────────────────────────────────────────────
function classificarIntencao(txt) {
  const n = norm(txt);

  const intencoes = [
    { id: 'ajuda',           regex: /^(ajuda|help|oi|ola|boa|bom dia|boa tarde|boa noite|o que|comandos|menu|opcoes)/ },
    { id: 'meta_restante',   regex: /falt|restant|quanto falta|quanto precisa|preciso vender|bater a meta|atingir a meta/ },
    { id: 'total_vendedor',  regex: /quanto.*vendeu|vendeu quanto|total.*vendedor|resultado.*vendedor|performance/ },
    { id: 'ranking',         regex: /ranking|melhor.*vendedor|quem mais.*vendeu|top.*vendedor|lider|campeao/ },
    { id: 'total_mes',       regex: /total.*mes|vendemos.*mes|quanto.*vendemos|vendas.*mes|receita.*mes|faturamento/ },
    { id: 'atingimento',     regex: /atingimento|porcentagem|percentual|pct|quanto.*meta|meta.*atingida|batemos/ },
    { id: 'historico',       regex: /historico|tendencia|crescimento|comparativo|comparando|evolucao|ultimos meses/ },
    { id: 'contratos_ativos',regex: /contrato.*ativo|ativo.*contrato|quantos.*cliente|clientes.*ativos|carteira/ },
    { id: 'ticket_medio',    regex: /ticket.*medio|media.*venda|valor.*medio|media.*contrato/ },
    { id: 'projecao',        regex: /projecao|projetado|vai fechar|vai bater|vai atingir|previsao/ },
    { id: 'ultimas_vendas',  regex: /ultima.*venda|recente|novo.*cliente|ultimos.*negocio|historico.*recente/ },
    { id: 'sem_venda',       regex: /sem.*venda|nao.*vendeu|vendedor.*parado|quem.*nao.*vendeu/ },
  ];

  for (const { id, regex } of intencoes) {
    if (regex.test(n)) return id;
  }
  return 'desconhecido';
}

// ─── Handler principal ───────────────────────────────────────────────────────
router.post('/', (req, res) => {
  const db = req.app.get('db');
  if (!db) return res.status(500).json({ error: 'DB não disponível' });

  const { mensagem } = req.body;
  if (!mensagem || !String(mensagem).trim()) {
    return res.json({ resposta: 'Digite uma pergunta sobre as vendas! Tente: *Quanto falta pra meta?* ou *Quem mais vendeu esse mês?*', tipo: 'ajuda' });
  }

  const txt = String(mensagem).trim();
  const intencao = classificarIntencao(txt);
  const periodo = detectarPeriodo(txt);

  // Lista de vendedores únicos
  let vendedores = [];
  try {
    const rows = db.prepare(`
      SELECT DISTINCT vendedor_nome FROM vendas_comercial WHERE vendedor_nome IS NOT NULL
      UNION
      SELECT DISTINCT vendedor_nome FROM metas_vendedor WHERE vendedor_nome IS NOT NULL
    `).all();
    vendedores = rows.map(r => r.vendedor_nome).filter(Boolean);
  } catch (e) { /* ignora */ }

  const vendedorAlvo = detectarVendedor(txt, vendedores);

  try {
    let resposta = '';
    let dados = null;

    switch (intencao) {

      // ── Ajuda / menu ────────────────────────────────────────────────────
      case 'ajuda': {
        resposta = `👋 Olá! Posso responder perguntas sobre as vendas. Exemplos:\n\n` +
          `• *Quanto falta pra meta esse mês?*\n` +
          `• *Quanto o João vendeu em março?*\n` +
          `• *Quem mais vendeu esse mês?*\n` +
          `• *Qual o total de vendas em abril?*\n` +
          `• *Qual o atingimento da meta?*\n` +
          `• *Mostre o histórico dos últimos meses*\n` +
          `• *Qual o ticket médio?*\n` +
          `• *Quem está sem venda esse mês?*\n` +
          `• *Quantos contratos ativos temos?*\n` +
          `• *Qual a projeção para o mês?*`;
        break;
      }

      // ── Meta restante ────────────────────────────────────────────────────
      case 'meta_restante': {
        const { mes, ano } = periodo.tudo ? nowBR() : periodo;
        if (vendedorAlvo) {
          const meta = db.prepare(`SELECT valor_meta FROM metas_vendedor WHERE vendedor_nome = ? AND mes = ? AND ano = ?`).get(vendedorAlvo, mes, ano);
          const realizado = db.prepare(`SELECT COALESCE(SUM(total_contrato), 0) as total FROM vendas_comercial WHERE vendedor_nome = ? AND mes = ? AND ano = ?`).get(vendedorAlvo, mes, ano);
          const metaVal = meta?.valor_meta || 0;
          const realizadoVal = realizado?.total || 0;
          const faltam = Math.max(0, metaVal - realizadoVal);
          if (!metaVal) {
            resposta = `Não encontrei meta cadastrada para *${vendedorAlvo}* em ${mesLabel(mes)}/${ano}.`;
          } else if (faltam === 0) {
            resposta = `🎯 *${vendedorAlvo}* já bateu a meta de ${mesLabel(mes)}/${ano}!\nMeta: ${fmtBRL(metaVal)} | Realizado: ${fmtBRL(realizadoVal)} (${fmtPct(realizadoVal, metaVal)})`;
          } else {
            resposta = `📊 *${vendedorAlvo}* em ${mesLabel(mes)}/${ano}:\n• Meta: ${fmtBRL(metaVal)}\n• Realizado: ${fmtBRL(realizadoVal)} (${fmtPct(realizadoVal, metaVal)})\n• Faltam: ${fmtBRL(faltam)}`;
          }
        } else {
          // Geral: soma de todas as metas vs realizado
          const metaGeral = db.prepare(`SELECT COALESCE(SUM(valor_meta), 0) as total FROM metas_vendedor WHERE mes = ? AND ano = ?`).get(mes, ano);
          const realizadoGeral = db.prepare(`SELECT COALESCE(SUM(total_contrato), 0) as total FROM vendas_comercial WHERE mes = ? AND ano = ?`).get(mes, ano);
          const metaVal = metaGeral?.total || 0;
          const realizadoVal = realizadoGeral?.total || 0;
          const faltam = Math.max(0, metaVal - realizadoVal);

          if (!metaVal) {
            resposta = `Não há metas cadastradas para ${mesLabel(mes)}/${ano}. Cadastre as metas na aba Gestão Comercial.`;
          } else if (faltam === 0) {
            resposta = `🎉 A equipe já bateu a meta de ${mesLabel(mes)}/${ano}!\nMeta: ${fmtBRL(metaVal)} | Realizado: ${fmtBRL(realizadoVal)} (${fmtPct(realizadoVal, metaVal)})`;
          } else {
            resposta = `📊 Situação da equipe em ${mesLabel(mes)}/${ano}:\n• Meta: ${fmtBRL(metaVal)}\n• Realizado: ${fmtBRL(realizadoVal)} (${fmtPct(realizadoVal, metaVal)})\n• Faltam: ${fmtBRL(faltam)}`;
          }

          // Adiciona breakdown por vendedor
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

      // ── Total por vendedor ───────────────────────────────────────────────
      case 'total_vendedor': {
        const { mes, ano, tudo, trimestre } = periodo;
        let whereExtra = '';
        let params = [];
        let labelPeriodo = '';

        if (tudo) {
          whereExtra = 'AND ano = ?';
          params = [ano];
          labelPeriodo = `${ano}`;
        } else if (trimestre) {
          const meses = [trimestre*3-2, trimestre*3-1, trimestre*3];
          whereExtra = `AND ano = ? AND mes IN (${meses.join(',')})`;
          params = [ano];
          labelPeriodo = `Q${trimestre}/${ano}`;
        } else {
          whereExtra = 'AND mes = ? AND ano = ?';
          params = [mes, ano];
          labelPeriodo = `${mesLabel(mes)}/${ano}`;
        }

        if (vendedorAlvo) {
          const rows = db.prepare(`SELECT total_contrato, cliente, mes, data_venda FROM vendas_comercial WHERE vendedor_nome = ? ${whereExtra} ORDER BY data_venda DESC`).all(vendedorAlvo, ...params);
          const total = rows.reduce((s, r) => s + (r.total_contrato || 0), 0);
          if (rows.length === 0) {
            resposta = `Não encontrei vendas de *${vendedorAlvo}* em ${labelPeriodo}.`;
          } else {
            resposta = `💼 *${vendedorAlvo}* em ${labelPeriodo}:\n• Total: ${fmtBRL(total)} (${rows.length} venda${rows.length > 1 ? 's' : ''})`;
            if (rows.length <= 8) {
              resposta += '\n\n*Detalhes:*';
              for (const r of rows) {
                resposta += `\n• ${r.cliente}: ${fmtBRL(r.total_contrato)}`;
              }
            }
          }
          dados = { vendedor: vendedorAlvo, total, vendas: rows };
        } else {
          const rows = db.prepare(`SELECT vendedor_nome, COALESCE(SUM(total_contrato),0) as total, COUNT(*) as qtd FROM vendas_comercial WHERE 1=1 ${whereExtra} GROUP BY vendedor_nome ORDER BY total DESC`).all(...params);
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

      // ── Ranking ──────────────────────────────────────────────────────────
      case 'ranking': {
        const { mes, ano, tudo } = periodo;
        const whereExtra = tudo ? 'AND ano = ?' : 'AND mes = ? AND ano = ?';
        const params = tudo ? [ano] : [mes, ano];
        const labelPeriodo = tudo ? `${ano}` : `${mesLabel(mes)}/${ano}`;

        const rows = db.prepare(`
          SELECT vc.vendedor_nome,
                 COALESCE(SUM(vc.total_contrato), 0) as realizado,
                 COUNT(*) as qtd_vendas,
                 COALESCE(MAX(mv.valor_meta), 0) as meta
          FROM vendas_comercial vc
          LEFT JOIN metas_vendedor mv ON mv.vendedor_nome = vc.vendedor_nome
            AND mv.mes = ${tudo ? 0 : '?'} AND mv.ano = ?
          WHERE 1=1 ${whereExtra}
          GROUP BY vc.vendedor_nome
          ORDER BY realizado DESC
        `).all(...(tudo ? [ano, ...params] : [mes, ano, ...params]));

        if (rows.length === 0) {
          resposta = `Nenhum dado de vendas encontrado para ${labelPeriodo}.`;
        } else {
          resposta = `🏆 Ranking de vendas — ${labelPeriodo}:`;
          rows.forEach((r, i) => {
            const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i+1}º`;
            const pct = r.meta > 0 ? ` (${fmtPct(r.realizado, r.meta)} da meta)` : '';
            resposta += `\n${medal} ${r.vendedor_nome}: ${fmtBRL(r.realizado)}${pct}`;
          });
          resposta += `\n\n🏅 Líder: *${rows[0].vendedor_nome}* com ${fmtBRL(rows[0].realizado)}`;
        }
        dados = rows;
        break;
      }

      // ── Total do mês ─────────────────────────────────────────────────────
      case 'total_mes': {
        const { mes, ano, tudo, trimestre } = periodo;

        if (tudo) {
          const rows = db.prepare(`
            SELECT mes, COALESCE(SUM(total_contrato), 0) as total, COUNT(*) as qtd
            FROM vendas_comercial WHERE ano = ? GROUP BY mes ORDER BY mes
          `).all(ano);
          const totalAno = rows.reduce((s, r) => s + r.total, 0);
          resposta = `📅 Total de vendas em ${ano}: *${fmtBRL(totalAno)}*\n`;
          for (const r of rows) {
            resposta += `\n• ${mesLabel(r.mes)}: ${fmtBRL(r.total)} (${r.qtd} venda${r.qtd > 1 ? 's' : ''})`;
          }
          dados = rows;
        } else if (trimestre) {
          const meses = [trimestre*3-2, trimestre*3-1, trimestre*3];
          const rows = db.prepare(`
            SELECT mes, COALESCE(SUM(total_contrato), 0) as total, COUNT(*) as qtd
            FROM vendas_comercial WHERE ano = ? AND mes IN (${meses.join(',')}) GROUP BY mes ORDER BY mes
          `).all(ano);
          const totalQ = rows.reduce((s, r) => s + r.total, 0);
          resposta = `📅 Q${trimestre}/${ano}: *${fmtBRL(totalQ)}*`;
          for (const r of rows) {
            resposta += `\n• ${mesLabel(r.mes)}: ${fmtBRL(r.total)} (${r.qtd} venda${r.qtd > 1 ? 's' : ''})`;
          }
          dados = rows;
        } else {
          const result = db.prepare(`SELECT COALESCE(SUM(total_contrato), 0) as total, COUNT(*) as qtd FROM vendas_comercial WHERE mes = ? AND ano = ?`).get(mes, ano);
          const meta = db.prepare(`SELECT COALESCE(SUM(valor_meta), 0) as total FROM metas_vendedor WHERE mes = ? AND ano = ?`).get(mes, ano);
          const t = result?.total || 0;
          const m = meta?.total || 0;
          resposta = `📅 Total de vendas em ${mesLabel(mes)}/${ano}:\n• Realizado: *${fmtBRL(t)}* (${result?.qtd || 0} venda${result?.qtd !== 1 ? 's' : ''})`;
          if (m > 0) {
            resposta += `\n• Meta: ${fmtBRL(m)} (${fmtPct(t, m)})`;
          }
          dados = { total: t, meta: m };
        }
        break;
      }

      // ── Atingimento ──────────────────────────────────────────────────────
      case 'atingimento': {
        const { mes, ano } = periodo.tudo ? nowBR() : periodo;
        const metas = db.prepare(`
          SELECT mv.vendedor_nome, MAX(mv.valor_meta) as valor_meta,
                 COALESCE(SUM(vc.total_contrato), 0) as realizado
          FROM metas_vendedor mv
          LEFT JOIN vendas_comercial vc ON vc.vendedor_nome = mv.vendedor_nome AND vc.mes = mv.mes AND vc.ano = mv.ano
          WHERE mv.mes = ? AND mv.ano = ?
          GROUP BY mv.vendedor_nome
          ORDER BY (COALESCE(SUM(vc.total_contrato), 0) / MAX(mv.valor_meta)) DESC
        `).all(mes, ano);

        if (metas.length === 0) {
          resposta = `Não há metas cadastradas para ${mesLabel(mes)}/${ano}.`;
        } else {
          const totalMeta = metas.reduce((s, r) => s + r.valor_meta, 0);
          const totalRealizado = metas.reduce((s, r) => s + r.realizado, 0);
          resposta = `🎯 Atingimento da meta — ${mesLabel(mes)}/${ano}:\n• Equipe: ${fmtPct(totalRealizado, totalMeta)} (${fmtBRL(totalRealizado)} / ${fmtBRL(totalMeta)})\n`;
          for (const r of metas) {
            const pct = ((r.realizado / r.valor_meta) * 100).toFixed(0);
            const bar = buildProgressBar(Number(pct));
            const status = Number(pct) >= 100 ? '✅' : Number(pct) >= 70 ? '⚡' : '⏳';
            resposta += `\n${status} ${r.vendedor_nome}: ${bar} ${pct}%`;
          }
        }
        dados = metas;
        break;
      }

      // ── Histórico ────────────────────────────────────────────────────────
      case 'historico': {
        const { ano } = periodo;
        const rows = db.prepare(`
          SELECT mes,
                 COALESCE(SUM(total_contrato), 0) as realizado,
                 COUNT(*) as qtd
          FROM vendas_comercial WHERE ano = ?
          GROUP BY mes ORDER BY mes
        `).all(ano);
        const metas = db.prepare(`
          SELECT mes, COALESCE(SUM(valor_meta), 0) as meta
          FROM metas_vendedor WHERE ano = ?
          GROUP BY mes ORDER BY mes
        `).all(ano);
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

          // Tendência simples: últimos 3 meses
          if (rows.length >= 2) {
            const ultimos = rows.slice(-3);
            if (ultimos.length >= 2) {
              const primeiro = ultimos[0].realizado;
              const ultimo = ultimos[ultimos.length - 1].realizado;
              if (ultimo > primeiro * 1.1) resposta += '\n📈 Tendência: *crescimento*';
              else if (ultimo < primeiro * 0.9) resposta += '\n📉 Tendência: *queda*';
              else resposta += '\n➡️ Tendência: *estável*';
            }
          }
        }
        dados = rows;
        break;
      }

      // ── Contratos ativos ─────────────────────────────────────────────────
      case 'contratos_ativos': {
        const rows = db.prepare(`SELECT COUNT(*) as total, COALESCE(SUM(valor_mensal), 0) as mrr FROM vendas WHERE status = 'ativa'`).get();
        const porVendedor = db.prepare(`SELECT vendedor_nome, COUNT(*) as qtd FROM vendas WHERE status = 'ativa' GROUP BY vendedor_nome ORDER BY qtd DESC`).all();
        resposta = `📋 Contratos ativos:\n• Total: *${rows?.total || 0}* contratos\n• MRR: *${fmtBRL(rows?.mrr || 0)}*`;
        if (porVendedor.length > 0) {
          resposta += '\n\n*Por vendedor:*';
          for (const r of porVendedor) {
            resposta += `\n• ${r.vendedor_nome}: ${r.qtd} contrato${r.qtd > 1 ? 's' : ''}`;
          }
        }
        dados = { total: rows?.total, mrr: rows?.mrr, porVendedor };
        break;
      }

      // ── Ticket médio ─────────────────────────────────────────────────────
      case 'ticket_medio': {
        const { mes, ano, tudo } = periodo;
        const whereExtra = tudo ? 'WHERE ano = ?' : 'WHERE mes = ? AND ano = ?';
        const params = tudo ? [ano] : [mes, ano];
        const labelPeriodo = tudo ? `${ano}` : `${mesLabel(mes)}/${ano}`;

        const result = db.prepare(`SELECT AVG(NULLIF(total_contrato, 0)) as media, COUNT(*) as qtd FROM vendas_comercial ${whereExtra} AND total_contrato > 0`).get(...params);
        const geral = result?.media || 0;
        resposta = `💰 Ticket médio em ${labelPeriodo}:\n• Ticket médio: *${fmtBRL(geral)}*\n• Baseado em ${result?.qtd || 0} venda${result?.qtd !== 1 ? 's' : ''}`;

        const porVendedor = db.prepare(`
          SELECT vendedor_nome, AVG(NULLIF(total_contrato, 0)) as media, COUNT(*) as qtd
          FROM vendas_comercial ${whereExtra} AND total_contrato > 0
          GROUP BY vendedor_nome ORDER BY media DESC
        `).all(...params);

        if (porVendedor.length > 1) {
          resposta += '\n\n*Por vendedor:*';
          for (const r of porVendedor) {
            resposta += `\n• ${r.vendedor_nome}: ${fmtBRL(r.media)} (${r.qtd} venda${r.qtd > 1 ? 's' : ''})`;
          }
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
        const diasUteis = Math.round(diasRestantes * 5 / 7); // Estimativa

        const realizadoAtual = db.prepare(`SELECT COALESCE(SUM(total_contrato), 0) as total, COUNT(*) as qtd FROM vendas_comercial WHERE mes = ? AND ano = ?`).get(mes, ano);
        const metaAtual = db.prepare(`SELECT COALESCE(SUM(valor_meta), 0) as total FROM metas_vendedor WHERE mes = ? AND ano = ?`).get(mes, ano);

        const realizado = realizadoAtual?.total || 0;
        const meta = metaAtual?.total || 0;
        const taxaDiaria = diasPassados > 0 ? realizado / diasPassados : 0;
        const projecao = realizado + (taxaDiaria * diasRestantes);

        resposta = `🔮 Projeção para ${mesLabel(mes)}/${ano}:\n• Realizado até hoje (dia ${diasPassados}): ${fmtBRL(realizado)}\n• Ritmo diário: ${fmtBRL(taxaDiaria)}/dia\n• Projeção para o fim do mês: *${fmtBRL(projecao)}*`;
        if (meta > 0) {
          const pctProjecao = (projecao / meta) * 100;
          resposta += `\n• Meta: ${fmtBRL(meta)}`;
          if (pctProjecao >= 100) {
            resposta += `\n✅ No ritmo atual, a equipe *vai bater a meta* (${pctProjecao.toFixed(0)}%)`;
          } else {
            const faltaExtra = meta - projecao;
            resposta += `\n⚡ Precisa de mais ${fmtBRL(faltaExtra / Math.max(1, diasUteis))}/dia útil para bater a meta`;
          }
        }
        dados = { realizado, meta, projecao, taxaDiaria };
        break;
      }

      // ── Últimas vendas ───────────────────────────────────────────────────
      case 'ultimas_vendas': {
        const limit = 8;
        const whereVendedor = vendedorAlvo ? 'AND vendedor_nome = ?' : '';
        const params = vendedorAlvo ? [vendedorAlvo] : [];
        const rows = db.prepare(`
          SELECT cliente, vendedor_nome, total_contrato, data_venda, mes, ano
          FROM vendas_comercial WHERE 1=1 ${whereVendedor}
          ORDER BY COALESCE(data_venda, created_at) DESC LIMIT ?
        `).all(...params, limit);

        if (rows.length === 0) {
          resposta = `Nenhuma venda recente encontrada${vendedorAlvo ? ` para ${vendedorAlvo}` : ''}.`;
        } else {
          resposta = `🕒 Últimas ${rows.length} vendas${vendedorAlvo ? ` de ${vendedorAlvo}` : ''}:`;
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
        const comVenda = db.prepare(`SELECT DISTINCT vendedor_nome FROM vendas_comercial WHERE mes = ? AND ano = ?`).all(mes, ano).map(r => r.vendedor_nome);
        const todosVendedores = db.prepare(`SELECT DISTINCT vendedor_nome FROM metas_vendedor WHERE ano = ?`).all(ano).map(r => r.vendedor_nome);
        const semVenda = todosVendedores.filter(v => !comVenda.includes(v));

        if (semVenda.length === 0) {
          resposta = `✅ Todos os vendedores com meta cadastrada realizaram pelo menos uma venda em ${mesLabel(mes)}/${ano}!`;
        } else {
          resposta = `⚠️ Vendedores sem venda em ${mesLabel(mes)}/${ano}:`;
          for (const v of semVenda) {
            const meta = db.prepare(`SELECT valor_meta FROM metas_vendedor WHERE vendedor_nome = ? AND mes = ? AND ano = ?`).get(v, mes, ano);
            resposta += `\n• ${v}${meta ? ` (meta: ${fmtBRL(meta.valor_meta)})` : ''}`;
          }
        }
        dados = semVenda;
        break;
      }

      // ── Desconhecido ─────────────────────────────────────────────────────
      default: {
        resposta = `🤔 Não entendi muito bem. Tente ser mais específico!\n\nExemplos:\n• *Quanto falta pra meta esse mês?*\n• *Quem mais vendeu em março?*\n• *Qual o total de vendas esse ano?*\n\nDigite *ajuda* para ver todos os comandos.`;
        break;
      }
    }

    return res.json({ resposta, intencao, dados });

  } catch (err) {
    console.error('[comercialChat] erro:', err);
    return res.status(500).json({ resposta: `⚠️ Erro ao consultar os dados: ${err.message}`, intencao: 'erro' });
  }
});

// ─── Helpers ──────────────────────────────────────────────────────────────────
function buildProgressBar(pct) {
  const filled = Math.min(10, Math.round(pct / 10));
  return '█'.repeat(filled) + '░'.repeat(10 - filled);
}

module.exports = router;
