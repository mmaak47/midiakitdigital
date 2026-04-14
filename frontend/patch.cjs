const fs = require('fs');
const filepath = 'src/lib/midiaKitPdf.js';
let content = fs.readFileSync(filepath, 'utf8');

// Replace the top flex container properties
content = content.replace(
  '<div style="display:flex;flex-direction:column;gap:8px;min-width:0;overflow:hidden;">',
  '<div style="display:flex;flex-direction:column;gap:${hasImage ? \'8px\' : \'16px\'};min-width:0;overflow:hidden;height:100%;justify-content:${hasImage ? \'flex-start\' : \'center\'};">'
);

// Address box paddings and fonts
content = content.replace(
  '<div data-calibration-id="proposal.point.addressBox" style="padding:12px 14px;border-radius:12px;background:${PROPOSAL_SURFACE};border:1px solid ${PROPOSAL_BORDER};">',
  '<div data-calibration-id="proposal.point.addressBox" style="padding:${hasImage ? \'12px 14px\' : \'20px 24px\'};border-radius:12px;background:${PROPOSAL_SURFACE};border:1px solid ${PROPOSAL_BORDER};flex-shrink:0;">'
);
content = content.replace(
  '<div style="font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${PROPOSAL_ACCENT};border-top:2px solid ${PROPOSAL_ACCENT};padding-top:8px;">Entorno relevante</div>',
  '<div style="font-size:${hasImage ? \'11px\' : \'13px\'};font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${PROPOSAL_ACCENT};border-top:2px solid ${PROPOSAL_ACCENT};padding-top:8px;">Entorno relevante</div>'
);
content = content.replace(
  '<div style="margin-top:5px;font-size:26px;line-height:1;font-weight:700;color:${PROPOSAL_TEXT};font-family:Poppins, system-ui, sans-serif;">${formatInt(relevantPlacesCount)}</div>',
  '<div style="margin-top:5px;font-size:${hasImage ? \'26px\' : \'32px\'};line-height:1;font-weight:700;color:${PROPOSAL_TEXT};font-family:Poppins, system-ui, sans-serif;">${formatInt(relevantPlacesCount)}</div>'
);
content = content.replace(
  '<div style="margin-top:4px;font-size:12px;line-height:1.28;color:${PROPOSAL_TEXT_SECONDARY};">${escapeHtml(relevantPlacesCount === 1 ? \'local relevante no raio analisado.\' : \'locais relevantes no raio analisado.\')}</div>',
  '<div style="margin-top:4px;font-size:${hasImage ? \'12px\' : \'14px\'};line-height:1.28;color:${PROPOSAL_TEXT_SECONDARY};">${escapeHtml(relevantPlacesCount === 1 ? \'local relevante no raio analisado.\' : \'locais relevantes no raio analisado.\')}</div>'
);


// Audience box paddings and fonts
content = content.replace(
  '<div style="padding:12px 14px;border-radius:12px;background:${PROPOSAL_SURFACE};border:1px solid ${PROPOSAL_BORDER};">',
  '<div style="padding:${hasImage ? \'12px 14px\' : \'20px 24px\'};border-radius:12px;background:${PROPOSAL_SURFACE};border:1px solid ${PROPOSAL_BORDER};flex-shrink:0;">'
);
content = content.replace(
  '<div style="font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${PROPOSAL_ACCENT};border-top:2px solid ${PROPOSAL_ACCENT};padding-top:8px;">Qualificação do público</div>',
  '<div style="font-size:${hasImage ? \'11px\' : \'13px\'};font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${PROPOSAL_ACCENT};border-top:2px solid ${PROPOSAL_ACCENT};padding-top:8px;">Qualificação do público</div>'
);
content = content.replace(
  '<div style="margin-top:8px;display:inline-flex;align-items:center;justify-content:center;height:32px;padding:0 13px;border-radius:100px;background:rgba(232,89,26,0.12);border:1px solid rgba(232,89,26,0.24);font-size:13px;font-weight:700;color:${PROPOSAL_ACCENT};">${escapeHtml(audience.badge)}</div>',
  '<div style="margin-top:8px;display:inline-flex;align-items:center;justify-content:center;height:${hasImage ? \'32px\' : \'38px\'};padding:0 16px;border-radius:100px;background:rgba(232,89,26,0.12);border:1px solid rgba(232,89,26,0.24);font-size:${hasImage ? \'13px\' : \'15px\'};font-weight:700;color:${PROPOSAL_ACCENT};">${escapeHtml(audience.badge)}</div>'
);
content = content.replace(
  '<div style="margin-top:6px;font-size:18px;line-height:1.3;color:${PROPOSAL_TEXT};font-weight:700;word-break:break-word;max-height:2.7em;overflow:hidden;">${escapeHtml(audience.headline)}</div>',
  '<div style="margin-top:6px;font-size:${hasImage ? \'18px\' : \'26px\'};line-height:1.3;color:${PROPOSAL_TEXT};font-weight:700;word-break:break-word;max-height:${hasImage ? \'2.7em\' : \'3.9em\'};overflow:hidden;">${escapeHtml(audience.headline)}</div>'
);
content = content.replace(
  '<div style="margin-top:4px;font-size:13px;line-height:1.34;color:${PROPOSAL_TEXT_SECONDARY};word-break:break-word;max-height:2.7em;overflow:hidden;">${escapeHtml(audience.summary)}</div>',
  '<div style="margin-top:4px;font-size:${hasImage ? \'13px\' : \'15px\'};line-height:1.34;color:${PROPOSAL_TEXT_SECONDARY};word-break:break-word;max-height:${hasImage ? \'2.7em\' : \'4em\'};overflow:hidden;">${escapeHtml(audience.summary)}</div>'
);


// Map box padding and fonts. Make it Flex:1 and object-position:center!
content = content.replace(
    '<div style="padding:10px 12px;border-radius:12px;background:${PROPOSAL_SURFACE};border:1px solid ${PROPOSAL_BORDER};">',
    '<div style="padding:${hasImage ? \'10px 12px\' : \'18px 24px\'};border-radius:12px;background:${PROPOSAL_SURFACE};border:1px solid ${PROPOSAL_BORDER};display:flex;flex-direction:column;flex:1;min-height:0;">'
);
content = content.replace(
    '<div style="font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${PROPOSAL_ACCENT};">Localização no mapa</div>',
    '<div style="font-size:${hasImage ? \'11px\' : \'13px\'};font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${PROPOSAL_ACCENT};flex-shrink:0;">Localização no mapa</div>'
);
content = content.replace(
    '<div style="margin-top:6px;height:${hasImage ? \'84px\' : \'118px\'};border-radius:10px;overflow:hidden;border:1px solid ${PROPOSAL_BORDER};background:${PROPOSAL_SURFACE_ALT};">',
    '<div style="margin-top:8px;flex:1;min-height:${hasImage ? \'84px\' : \'200px\'};border-radius:10px;overflow:hidden;border:1px solid ${PROPOSAL_BORDER};background:${PROPOSAL_SURFACE_ALT};">'
);
content = content.replace(
    '<img src="${mapImage}" alt="Mapa do ponto" style="width:100%;height:100%;object-fit:cover;" />',
    '<img src="${mapImage}" alt="Mapa do ponto" style="width:100%;height:100%;object-fit:cover;object-position:center;" />'
);
content = content.replace(
    '<div style="margin-top:3px;font-size:10px;line-height:1.1;color:${PROPOSAL_LABEL};">Fonte cartográfica: OpenStreetMap/Carto.</div>',
    '<div style="margin-top:5px;font-size:${hasImage ? \'10px\' : \'12px\'};line-height:1.1;color:${PROPOSAL_LABEL};flex-shrink:0;">Fonte cartográfica: OpenStreetMap/Carto.</div>'
);


// Stats
content = content.replace(
  '<div data-calibration-id="proposal.point.statsList" style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;">',
  '<div data-calibration-id="proposal.point.statsList" style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:${hasImage ? \'8px\' : \'16px\'};flex-shrink:0;">'
);
content = content.replace(
  '<div style="padding:10px 12px;border-radius:8px;background:${PROPOSAL_SURFACE};border:1px solid ${PROPOSAL_BORDER};">',
  '<div style="padding:${hasImage ? \'10px 12px\' : \'18px 20px\'};border-radius:12px;background:${PROPOSAL_SURFACE};border:1px solid ${PROPOSAL_BORDER};">'
);
content = content.replace(
  '<div style="font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${PROPOSAL_LABEL};">${escapeHtml(item.label)}</div>',
  '<div style="font-size:${hasImage ? \'11px\' : \'13px\'};font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${PROPOSAL_LABEL};">${escapeHtml(item.label)}</div>'
);
content = content.replace(
  '<div style="margin-top:3px;font-size:${item.label === \'Valor Negociado\' ? \'28px\' : \'20px\'};line-height:1.15;color:${item.label === \'Valor Negociado\' ? PROPOSAL_ACCENT : PROPOSAL_TEXT};font-weight:800;word-break:break-word;">${escapeHtml(item.value)}</div>',
  '<div style="margin-top:3px;font-size:${item.label === \'Valor Negociado\' ? (hasImage ? \'28px\' : \'36px\') : (hasImage ? \'20px\' : \'26px\')};line-height:1.15;color:${item.label === \'Valor Negociado\' ? PROPOSAL_ACCENT : PROPOSAL_TEXT};font-weight:800;word-break:break-word;">${escapeHtml(item.value)}</div>'
);


fs.writeFileSync(filepath, content, 'utf8');
console.log('Applied patch successfully');
