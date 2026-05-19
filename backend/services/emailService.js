/**
 * emailService.js
 *
 * Serviço de envio de e-mail via SMTP (nodemailer).
 * Após enviar, salva uma cópia na pasta "Enviados" via IMAP para controle interno.
 */

const nodemailer = require('nodemailer');
const imapSimple = require('imap-simple');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');

// ── Configuração SMTP ────────────────────────────────────────────────────────
const SMTP_HOST = process.env.SMTP_HOST || 'mail.redeintermidia.com';
const SMTP_PORT = Number(process.env.SMTP_PORT || 465);
const SMTP_USER = process.env.SMTP_USER || 'criacao@redeintermidia.com';
const SMTP_PASS = process.env.SMTP_PASS || 'M1dia-2023';
const SMTP_FROM_NAME = process.env.SMTP_FROM_NAME || 'Intermidia - Criação';
const SMTP_FROM = `"${SMTP_FROM_NAME}" <${SMTP_USER}>`;

// ── Configuração IMAP (para salvar na pasta Enviados) ────────────────────────
const IMAP_HOST = process.env.IMAP_HOST || SMTP_HOST;
const IMAP_PORT = Number(process.env.IMAP_PORT || 993);
const IMAP_USER = SMTP_USER;
const IMAP_PASS = SMTP_PASS;

// ── Logo inline (totalmente branco, redimensionado e cacheado) ───────────────
let _logoBuffer = null;
async function getLogoBuffer() {
  if (_logoBuffer) return _logoBuffer;
  const logoPath = path.resolve(__dirname, '../../frontend/public/logo.png');
  try {
    const raw = fs.readFileSync(logoPath);
    // O logo original tem "intermi" branco e "dia" laranja.
    // Para o header laranja do e-mail, precisamos tudo branco.
    // Estratégia: extrair canal alpha e usar como máscara em imagem toda branca.
    const meta = await sharp(raw).metadata();
    const { width, height } = meta;
    // Cria imagem toda branca do mesmo tamanho
    const whiteBg = await sharp({
      create: { width, height, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 255 } }
    }).png().toBuffer();
    // Extrai alpha do logo original
    const alphaChannel = await sharp(raw).extractChannel(3).toBuffer();
    // Aplica alpha do logo na imagem branca
    const whiteLogo = await sharp(whiteBg)
      .joinChannel(alphaChannel, { raw: { width, height, channels: 1 } })
      .resize(200, null, { withoutEnlargement: true })
      .png({ quality: 85 })
      .toBuffer();

    // Sharp joinChannel com raw alpha substitui o alpha — mas a API varia por versão.
    // Abordagem alternativa e mais robusta: composite com alpha
    const whiteBase = await sharp({
      create: { width, height, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 0 } }
    }).png().toBuffer();

    // Extraímos o alpha do original e criamos um logo todo branco mantendo transparência
    const { data, info } = await sharp(raw).raw().toBuffer({ resolveWithObject: true });
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] > 0) { // pixel visível
        data[i] = 255;     // R -> branco
        data[i + 1] = 255; // G -> branco
        data[i + 2] = 255; // B -> branco
        // alpha inalterado
      }
    }
    _logoBuffer = await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
      .resize(200, null, { withoutEnlargement: true })
      .png()
      .toBuffer();
  } catch (err) {
    console.error('[email] Erro ao gerar logo branco:', err.message);
    _logoBuffer = Buffer.alloc(0);
  }
  return _logoBuffer;
}

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

  // Carrega logo redimensionado para anexar inline (CID)
  const logoBuffer = await getLogoBuffer();
  const hasLogo = logoBuffer && logoBuffer.length > 0;

  const htmlBody = `
<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background:#f7f3f0;">
  <div style="max-width:600px;margin:0 auto;padding:24px;">

    <!-- Header -->
    <div style="background:linear-gradient(135deg,#FE5C2B,#E04A1F);border-radius:12px 12px 0 0;padding:28px 32px;text-align:center;">
      ${hasLogo ? '<img src="cid:intermidia_logo" alt="Intermidia" style="height:36px;margin-bottom:12px;" />' : '<span style="color:#fff;font-size:18px;font-weight:700;">Intermidia</span>'}
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
  // Logo inline (CID) — aparece no corpo do e-mail, não como anexo
  if (hasLogo) {
    attachments.push({
      filename: 'logo-intermidia.png',
      content: logoBuffer,
      cid: 'intermidia_logo',
      contentType: 'image/png',
      contentDisposition: 'inline',
    });
  }
  if (desktopPdf) {
    attachments.push({ filename: desktopFileName || 'Proposta-Tecnica.pdf', content: desktopPdf, contentType: 'application/pdf' });
  }
  if (mobilePdf) {
    attachments.push({ filename: mobileFileName || 'Proposta-Tecnica-Mobile.pdf', content: mobilePdf, contentType: 'application/pdf' });
  }

  const mailOptions = {
    from: SMTP_FROM,
    to,
    subject: `Proposta Técnica${empresa ? ` — ${empresa}` : ''} | Intermidia`,
    text: textBody,
    html: htmlBody,
    attachments,
  };

  try {
    const transporter = getTransporter();
    const info = await transporter.sendMail(mailOptions);

    console.log(`[email] Proposta enviada para ${to} (messageId: ${info.messageId})`);

    // Salvar cópia na pasta Enviados via IMAP (fire-and-forget, não bloqueia resposta)
    appendToSentFolder(mailOptions).catch(imapErr => {
      console.error(`[email/imap] Falha ao salvar na pasta Enviados:`, imapErr.message);
    });

    return { ok: true, messageId: info.messageId };
  } catch (err) {
    console.error(`[email] Falha ao enviar proposta para ${to}:`, err.message);
    return { ok: false, error: err.message };
  }
}

/**
 * Conecta via IMAP e salva a mensagem na pasta "Sent" / "INBOX.Sent".
 * Tenta os nomes mais comuns de pasta de enviados em servidores cPanel/Dovecot.
 */
async function appendToSentFolder(mailOptions) {
  // Compila a mensagem em formato RFC 822 (raw) usando nodemailer MailComposer
  const MailComposer = require('nodemailer/lib/mail-composer');
  const compiler = new MailComposer(mailOptions);
  const rawRfc822 = await new Promise((resolve, reject) => {
    compiler.compile().build((err, message) => {
      if (err) return reject(err);
      resolve(message);
    });
  });

  const imapConfig = {
    imap: {
      user: IMAP_USER,
      password: IMAP_PASS,
      host: IMAP_HOST,
      port: IMAP_PORT,
      tls: true,
      tlsOptions: { rejectUnauthorized: false },
      authTimeout: 10000,
      connTimeout: 15000,
    },
  };

  let connection;
  try {
    connection = await imapSimple.connect(imapConfig);

    // Tenta nomes comuns da pasta Enviados
    const sentFolderCandidates = ['INBOX.Sent', 'Sent', 'Sent Messages', 'INBOX.Sent Messages'];
    let sentFolder = null;

    const boxes = await connection.getBoxes();
    // Busca recursiva nas mailboxes
    const flatBoxes = flattenBoxes(boxes);

    for (const candidate of sentFolderCandidates) {
      if (flatBoxes.includes(candidate)) {
        sentFolder = candidate;
        break;
      }
    }

    if (!sentFolder) {
      // Fallback: procurar qualquer box que contenha "sent" no nome
      sentFolder = flatBoxes.find(b => b.toLowerCase().includes('sent')) || 'INBOX.Sent';
    }

    await connection.append(rawRfc822, { mailbox: sentFolder, flags: ['\\Seen'] });
    console.log(`[email/imap] Cópia salva na pasta "${sentFolder}"`);
  } finally {
    if (connection) {
      try { connection.end(); } catch { /* ignore */ }
    }
  }
}

/**
 * Achata a árvore de mailboxes do IMAP em uma lista plana de nomes.
 */
function flattenBoxes(boxes, prefix = '') {
  const result = [];
  for (const [name, box] of Object.entries(boxes)) {
    const fullName = prefix ? `${prefix}${name}` : name;
    result.push(fullName);
    if (box.children) {
      const delimiter = box.delimiter || '.';
      result.push(...flattenBoxes(box.children, `${fullName}${delimiter}`));
    }
  }
  return result;
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
