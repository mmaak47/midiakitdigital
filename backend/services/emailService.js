/**
 * emailService.js
 *
 * Serviço de envio de e-mail via SMTP (nodemailer).
 * Usado para enviar a proposta técnica em PDF ao cliente quando há e-mail cadastrado.
 */

const nodemailer = require('nodemailer');

// ── Configuração SMTP ────────────────────────────────────────────────────────
const SMTP_HOST = process.env.SMTP_HOST || 'mail.redeintermidia.com';
const SMTP_PORT = Number(process.env.SMTP_PORT || 465);
const SMTP_USER = process.env.SMTP_USER || 'criacao@redeintermidia.com';
const SMTP_PASS = process.env.SMTP_PASS || 'M1dia-2023';
const SMTP_FROM_NAME = process.env.SMTP_FROM_NAME || 'Intermidia - Criação';
const SMTP_FROM = `"${SMTP_FROM_NAME}" <${SMTP_USER}>`;

let _transporter = null;

function getTransporter() {
  if (!_transporter) {
    _transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_PORT === 465, // true for 465 (SSL), false for 587 (STARTTLS)
      auth: {
        user: SMTP_USER,
        pass: SMTP_PASS,
      },
      tls: {
        // Aceita certificados auto-assinados (comum em servidores cPanel)
        rejectUnauthorized: false,
      },
      connectionTimeout: 15000,
      greetingTimeout: 10000,
      socketTimeout: 30000,
    });
  }
  return _transporter;
}

/**
 * Envia a proposta técnica por e-mail com PDFs anexados.
 *
 * @param {object} opts
 * @param {string} opts.to - e-mail do destinatário
 * @param {string} opts.nomeDestinatario - nome do destinatário
 * @param {string} opts.nomeVendedor - nome do vendedor
 * @param {string} opts.nomeEmpresa - nome fantasia ou razão social da empresa
 * @param {Buffer} opts.desktopPdf - buffer do PDF desktop
 * @param {string} opts.desktopFileName - nome do arquivo desktop
 * @param {Buffer} opts.mobilePdf - buffer do PDF mobile
 * @param {string} opts.mobileFileName - nome do arquivo mobile
 * @param {string[]} [opts.pontosNomes] - nomes dos pontos para exibir no e-mail
 * @returns {Promise<{ok: boolean, messageId?: string, error?: string}>}
 */
async function sendPropostaTecnicaEmail({
  to,
  nomeDestinatario,
  nomeVendedor,
  nomeEmpresa,
  desktopPdf,
  desktopFileName,
  mobilePdf,
  mobileFileName,
  pontosNomes = [],
}) {
  if (!to || !to.includes('@')) {
    return { ok: false, error: 'E-mail inválido ou não informado.' };
  }

  const firstName = (nomeDestinatario || '').split(/\s/)[0] || 'Cliente';
  const vendedor = nomeVendedor || 'nosso time';
  const empresa = nomeEmpresa || '';

  const pontosListHtml = pontosNomes.length > 0
    ? `<ul style="margin:8px 0 16px 0;padding-left:20px;color:#444;">
        ${pontosNomes.slice(0, 30).map(n => `<li style="margin:2px 0;">${escapeHtml(n)}</li>`).join('')}
        ${pontosNomes.length > 30 ? `<li style="color:#999;">+${pontosNomes.length - 30} ponto(s)</li>` : ''}
       </ul>`
    : '';

  const empresaLine = empresa ? ` para <strong>${escapeHtml(empresa)}</strong>` : '';

  const htmlBody = `
<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background:#f7f3f0;">
  <div style="max-width:600px;margin:0 auto;padding:24px;">

    <!-- Header -->
    <div style="background:linear-gradient(135deg,#FE5C2B,#E04A1F);border-radius:12px 12px 0 0;padding:28px 32px;text-align:center;">
      <img src="https://redeintermidia.com/images/logo-branca.png" alt="Intermidia" style="height:36px;margin-bottom:12px;" />
      <h1 style="color:#fff;font-size:20px;margin:0;font-weight:600;">Proposta Técnica</h1>
    </div>

    <!-- Body -->
    <div style="background:#fff;padding:28px 32px;border:1px solid #efe0d8;border-top:0;">
      <p style="color:#333;font-size:15px;line-height:1.6;margin:0 0 16px;">
        Olá, <strong>${escapeHtml(firstName)}</strong>! Tudo bem?
      </p>
      <p style="color:#333;font-size:15px;line-height:1.6;margin:0 0 16px;">
        Parabéns pela escolha dos pontos — excelente decisão!
      </p>
      <p style="color:#333;font-size:15px;line-height:1.6;margin:0 0 8px;">
        Segue em anexo a <strong>proposta técnica</strong>${empresaLine} com todos os detalhes dos pontos de mídia selecionados:
      </p>
      ${pontosListHtml}
      <p style="color:#333;font-size:15px;line-height:1.6;margin:0 0 16px;">
        Enviamos duas versões para sua comodidade:<br/>
        📄 <strong>${escapeHtml(desktopFileName)}</strong> — versão completa<br/>
        📱 <strong>${escapeHtml(mobileFileName)}</strong> — otimizada para celular
      </p>
      <p style="color:#333;font-size:15px;line-height:1.6;margin:0 0 16px;">
        Se quiser trocar ideias ou precisar de ajuda com as artes, estamos por aqui!
      </p>
      <p style="color:#666;font-size:14px;line-height:1.6;margin:24px 0 0;">
        Atenciosamente,<br/>
        <strong>Setor de Criação — Intermidia</strong><br/>
        <span style="color:#999;font-size:13px;">Trabalhando com ${escapeHtml(vendedor)}</span>
      </p>
    </div>

    <!-- Footer -->
    <div style="background:#fdf7f4;border:1px solid #efe0d8;border-top:0;border-radius:0 0 12px 12px;padding:16px 32px;text-align:center;">
      <p style="color:#9a8579;font-size:12px;margin:0;">
        Intermidia — Publicidade Out-of-Home<br/>
        <a href="https://redeintermidia.com" style="color:#FE5C2B;text-decoration:none;">redeintermidia.com</a>
        &nbsp;|&nbsp; criacao@redeintermidia.com
      </p>
    </div>

  </div>
</body>
</html>`;

  const textBody = [
    `Olá, ${firstName}! Tudo bem?`,
    '',
    'Parabéns pela escolha dos pontos — excelente decisão!',
    '',
    `Segue em anexo a proposta técnica${empresa ? ` para ${empresa}` : ''} com todos os detalhes dos pontos de mídia selecionados.`,
    '',
    pontosNomes.length > 0 ? `Pontos: ${pontosNomes.slice(0, 15).join(', ')}${pontosNomes.length > 15 ? ` (+${pontosNomes.length - 15})` : ''}` : '',
    '',
    'Se quiser trocar ideias ou precisar de ajuda com as artes, estamos por aqui!',
    '',
    'Atenciosamente,',
    'Setor de Criação — Intermidia',
    `Trabalhando com ${vendedor}`,
    '',
    '---',
    'Intermidia — Publicidade Out-of-Home',
    'https://redeintermidia.com | criacao@redeintermidia.com',
  ].filter(Boolean).join('\n');

  const attachments = [];
  if (desktopPdf) {
    attachments.push({ filename: desktopFileName || 'Proposta-Tecnica.pdf', content: desktopPdf, contentType: 'application/pdf' });
  }
  if (mobilePdf) {
    attachments.push({ filename: mobileFileName || 'Proposta-Tecnica-Mobile.pdf', content: mobilePdf, contentType: 'application/pdf' });
  }

  try {
    const transporter = getTransporter();
    const info = await transporter.sendMail({
      from: SMTP_FROM,
      to,
      subject: `Proposta Técnica${empresa ? ` — ${empresa}` : ''} | Intermidia`,
      text: textBody,
      html: htmlBody,
      attachments,
    });

    console.log(`[email] Proposta enviada para ${to} (messageId: ${info.messageId})`);
    return { ok: true, messageId: info.messageId };
  } catch (err) {
    console.error(`[email] Falha ao enviar proposta para ${to}:`, err.message);
    return { ok: false, error: err.message };
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Verifica a conexão SMTP (útil para testes / health check).
 */
async function verifySmtpConnection() {
  try {
    const transporter = getTransporter();
    await transporter.verify();
    console.log('[email] SMTP connection verified OK');
    return { ok: true };
  } catch (err) {
    console.error('[email] SMTP verification failed:', err.message);
    return { ok: false, error: err.message };
  }
}

module.exports = {
  sendPropostaTecnicaEmail,
  verifySmtpConnection,
};
