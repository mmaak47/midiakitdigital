/**
 * scheduledMessagesService.js
 *
 * Serviço de mensagens agendadas via Evolution API.
 * - Toda segunda-feira às 08:30 (America/Sao_Paulo) envia lembrete ao financeiro
 *   com a lista de vendas cujo contrato ainda NÃO foi sinalizado como assinado.
 */

const TIMEZONE = 'America/Sao_Paulo';
const CHECK_INTERVAL_MS = 60 * 1000; // verifica a cada 1 minuto

let _db = null;
let _sendTextFn = null;
let _getSettingsFn = null;
let _intervalId = null;
let _lastFiredWeek = null; // evita disparo duplicado na mesma semana

/**
 * Retorna { dayOfWeek, hour, minute } no fuso America/Sao_Paulo
 */
function nowInBrazil() {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE,
    weekday: 'short',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  }).formatToParts(now);

  const get = (type) => parts.find(p => p.type === type)?.value;
  return {
    dayOfWeek: get('weekday'),   // Mon, Tue, ...
    hour: Number(get('hour')),
    minute: Number(get('minute')),
    isoWeek: getISOWeek(now),
  };
}

function getISOWeek(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return `${d.getUTCFullYear()}-W${Math.ceil((((d - yearStart) / 86400000) + 1) / 7)}`;
}

/**
 * Busca vendas ativas sem a etapa "contrato_assinado" confirmada.
 */
function getVendasSemContratoAssinado() {
  const rows = _db.prepare(`
    SELECT v.id, v.razao_social, v.cnpj, v.vendedor_nome, v.valor_mensal,
           v.created_at, v.pontos_nomes
    FROM vendas v
    WHERE v.status = 'ativa'
      AND TRIM(COALESCE(v.responsavel_nome, '')) != ''
      AND v.id NOT IN (
        SELECT ve.venda_id FROM venda_etapas ve
        WHERE ve.etapa_key = 'contrato_assinado'
          AND ve.removido = 0
      )
    ORDER BY v.created_at ASC
  `).all();
  return rows;
}

/**
 * Monta a mensagem de lembrete para o financeiro.
 */
function buildFinanceiroReminderMessage(vendas) {
  const lines = [];
  lines.push('📋 *LEMBRETE SEMANAL — CONTRATOS PENDENTES DE ASSINATURA*');
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━');
  lines.push('');
  lines.push(`Existem *${vendas.length}* venda(s) ativa(s) sem a confirmação de contrato assinado:`);
  lines.push('');

  vendas.forEach((v, i) => {
    const pontos = (() => {
      try { return JSON.parse(v.pontos_nomes || '[]'); } catch { return []; }
    })();
    const pontosStr = pontos.length > 0 ? pontos.join(', ') : '—';

    lines.push(`*${i + 1}. ${v.razao_social || 'Sem nome'}*`);
    if (v.cnpj) lines.push(`   CNPJ: ${v.cnpj}`);
    if (v.vendedor_nome) lines.push(`   Vendedor: ${v.vendedor_nome}`);
    if (v.valor_mensal) lines.push(`   Valor mensal: R$ ${v.valor_mensal}`);
    lines.push(`   Pontos: ${pontosStr}`);
    if (v.created_at) lines.push(`   Criada em: ${v.created_at.slice(0, 10)}`);
    lines.push('');
  });

  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━');
  lines.push('Por favor, verifique e cobre a assinatura dos contratos listados acima.');

  return lines.join('\n');
}

/**
 * Executa a verificação e disparo (se for segunda 08:30).
 */
async function tick() {
  try {
    const { dayOfWeek, hour, minute, isoWeek } = nowInBrazil();

    // Segunda-feira = 'Mon', 08:30
    if (dayOfWeek !== 'Mon' || hour !== 8 || minute !== 30) return;

    // Evita disparo duplicado na mesma semana
    if (_lastFiredWeek === isoWeek) return;

    const settings = _getSettingsFn();
    const financeiroNumber = settings.evolution_financeiro_number;

    if (!financeiroNumber) {
      console.log('[scheduled-msg] Número do financeiro não configurado, pulando lembrete.');
      return;
    }
    if (!settings.evolution_api_url || !settings.evolution_instance || !settings.evolution_api_key) {
      console.log('[scheduled-msg] Evolution API não configurada, pulando lembrete.');
      return;
    }

    const vendas = getVendasSemContratoAssinado();
    if (vendas.length === 0) {
      console.log('[scheduled-msg] Nenhuma venda pendente de assinatura. Lembrete não enviado.');
      _lastFiredWeek = isoWeek;
      return;
    }

    const message = buildFinanceiroReminderMessage(vendas);

    await _sendTextFn({
      apiUrl: settings.evolution_api_url,
      instance: String(settings.evolution_pdf_instance || settings.evolution_instance || 'aux adm').trim(),
      apiKey: settings.evolution_api_key,
      number: financeiroNumber,
      text: message,
    });

    _lastFiredWeek = isoWeek;
    console.log(`[scheduled-msg] Lembrete financeiro enviado com ${vendas.length} venda(s) pendente(s).`);
  } catch (err) {
    console.error('[scheduled-msg] Erro ao enviar lembrete financeiro:', err.message);
  }
}

/**
 * Inicia o agendador de mensagens.
 *
 * @param {object} opts
 * @param {object} opts.db - instância better-sqlite3
 * @param {Function} opts.sendEvolutionText - função para enviar texto via Evolution
 * @param {Function} opts.getEvolutionSettings - função que retorna as settings do Evolution
 */
function startScheduledMessages({ db, sendEvolutionText, getEvolutionSettings }) {
  _db = db;
  _sendTextFn = sendEvolutionText;
  _getSettingsFn = getEvolutionSettings;

  // Dispara a primeira verificação imediatamente
  tick();

  _intervalId = setInterval(tick, CHECK_INTERVAL_MS);
  console.log('[scheduled-msg] Agendador de mensagens iniciado (check a cada 1min).');
  return _intervalId;
}

function stopScheduledMessages() {
  if (_intervalId) {
    clearInterval(_intervalId);
    _intervalId = null;
    console.log('[scheduled-msg] Agendador de mensagens parado.');
  }
}

module.exports = { startScheduledMessages, stopScheduledMessages };
