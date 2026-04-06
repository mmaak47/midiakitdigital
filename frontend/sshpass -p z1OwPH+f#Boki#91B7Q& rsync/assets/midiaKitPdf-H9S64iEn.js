import{aj as Me,a as G,d as Se,b as xe,ak as je}from"./index-SlsIo-pA.js";const fe={midiaKit:{cover:{outOfHomeMinHeight:48,outOfHomePaddingX:18,showAllCitiesOnConsolidated:!0},formatDivider:{leftRailWidth:170,cityVerticalTop:240,cityVerticalBottom:40,cityVerticalFontSize:26,cityVerticalLetterSpacing:.08,titleFontSize:96,backgroundImageOpacity:.18},pointPage:{leftRailWidth:56,imagePanelWidth:670,contentLeft:76,contentRight:710,typeFontSize:62,nameTop:156,nameFontSize:52,nameMaxWidthOffset:110,addressTop:286,metricsBoxTop:352,metricsGridTop:378,metricIconSize:20,metricIconOffsetX:0,metricIconOffsetY:0,metricLabelFontSize:18,metricValueFontSize:30,footerLineBottom:168,footerBottom:54,priceLabelMarginBottom:10,priceValueFontSize:68}},proposal:{cover:{badgeMinHeight:48,badgePaddingX:20,chipMinHeight:58,chipPaddingX:24,metricLabelSize:14,metricValueSize:22,metricIconSize:36,metricGap:14,metricPadding:"22px 18px",strategicHeaderIconSize:34,strategicDotSize:8},point:{counterMinWidth:102,counterMinHeight:56,counterPaddingX:16,counterGap:8,rightWallpaperOpacity:.08}}},me="intermidia-pdf-layout-overrides";function Ae(e){return JSON.parse(JSON.stringify(e))}function le(e){return e&&typeof e=="object"&&!Array.isArray(e)}function be(e,t){const i=Ae(e);function r(a,d){Object.entries(d||{}).forEach(([o,c])=>{if(le(c)&&le(a[o])){r(a[o],c);return}a[o]=c})}return r(i,t),i}function Ce(){if(typeof window>"u")return{};try{const e=window.localStorage.getItem(me);return e?JSON.parse(e):{}}catch{return{}}}function Le(){return be(fe,Ce())}async function Ne(){return Me()}async function ue(){try{const e=await Ne(),t=(e==null?void 0:e.overrides)||{};return Ee(t),be(fe,t)}catch{return Le()}}function Ee(e){typeof window>"u"||window.localStorage.setItem(me,JSON.stringify(e))}const he=1366,q=768,ot={width:he,height:q},Q="#E8591A",R="#0A0A0A",ie="rgba(255,255,255,0.08)",f="#FF5A1F",U="#000000",M="#111111",W="#161616",h="rgba(255,255,255,0.08)",T="rgba(255,255,255,0.35)",Y="rgba(255,255,255,0.55)",pe={londrina:"Paraná",maringá:"Paraná",maringa:"Paraná","balneário camboriú":"Santa Catarina","balneario camboriu":"Santa Catarina",itajaí:"Santa Catarina",itajai:"Santa Catarina",curitiba:"Paraná",florianópolis:"Santa Catarina",florianopolis:"Santa Catarina"};function Fe(e){const t=String(e||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,""),i=String(e||"").toLowerCase();return pe[i]||pe[t]||""}const te=new Map;let oe=null;function ve(){return oe}function k(e){return new Intl.NumberFormat("pt-BR").format(Number(e)||0)}function _e(e){return String((e==null?void 0:e.elevador_categoria)||"").trim().toLowerCase()==="residencial"?"Residencial":"Comercial"}function V(e){const t=String((e==null?void 0:e.tipo)||"").trim();return t==="Elevador"?`Elevador - ${_e(e)}`:t||"Formato"}function ce(e){return String(e||"").split(" - ")[0].trim()}function F(e){return new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL",maximumFractionDigits:0}).format(Number(e)||0)}function Te(e){return new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL",minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(e)||0)}function Re(e){const t=Number(e)||0;return!Number.isFinite(t)||t<=0?"-":t<.01?`R$ ${t.toFixed(4).replace(".",",")}`:`R$ ${t.toFixed(2).replace(".",",")}`}function K(e){return(e||"praca").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"")}function l(e){return String(e??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;")}async function Be(e){if(!e||!e.startsWith("blob:"))return e;try{const i=await(await fetch(e)).blob();return new Promise(r=>{const a=new FileReader;a.onloadend=()=>r(a.result),a.onerror=()=>r(e),a.readAsDataURL(i)})}catch{return e}}function Ie(e,t={}){const i=String(e).trim().toUpperCase();if(!i)return"PONTO SEM NOME";const r=t.innerStyle||"font-size:0.62em;font-weight:600;letter-spacing:-0.01em;",a=s=>String(s||"").replace(/([./-])/g,"$1<wbr>").replace(/\s+\(/g," <wbr>(").replace(/\)(\s+)/g,")<wbr>$1"),d=/\(([^)]+)\)/g;let o="",c=0,n=d.exec(i);for(;n;)o+=a(l(i.slice(c,n.index))),o+=`<span style="${r}">(${l(n[1])})</span>`,c=d.lastIndex,n=d.exec(i);return o+=a(l(i.slice(c))),o}function ye(e){const t=String((e==null?void 0:e.pdf_image_source)||"imagem2").trim().toLowerCase();if(t==="imagem"&&(e!=null&&e.imagem||e!=null&&e.imagem2))return(e==null?void 0:e.imagem)||(e==null?void 0:e.imagem2)||"";if(t==="imagem2"&&(e!=null&&e.imagem2||e!=null&&e.imagem))return(e==null?void 0:e.imagem2)||(e==null?void 0:e.imagem)||"";if(Array.isArray(e==null?void 0:e.imagens)&&e.imagens.length>0){const i=e.imagens[0];if(typeof i=="string")return i;if(i!=null&&i.url)return i.url}return(e==null?void 0:e.imagem2)||(e==null?void 0:e.imagem)||""}function Oe(e){return(e==null?void 0:e.proposalSimulationPreview)||(e==null?void 0:e.simulacao_preview)||ye(e)}function He(e){const t=String((e==null?void 0:e.tipo_fluxo)||"").toLowerCase().trim();if(t==="veiculos")return!0;if(t==="pessoas"){const r=String((e==null?void 0:e.tipo)||"").toLowerCase();return!!(r.includes("painel")&&r.includes("led"))}const i=String((e==null?void 0:e.tipo)||"").toLowerCase();return i.includes("painel")&&i.includes("led")}function De(e){const t=e.reduce((r,a)=>(r.telas+=Number(a.telas)||0,r.fluxo+=Number(a.fluxo)||0,r.preco+=Number(a.preco)||0,r),{telas:0,fluxo:0,preco:0}),i=e.length?Math.round(t.preco/e.length):0;return{...t,ticketMedio:i}}function ge(e,t=6){return(Array.isArray(e)?e:String(e||"").split(/\n+/).flatMap(r=>r.split(new RegExp("(?<=[.!?])\\s+")))).map(r=>String(r||"").trim()).filter(Boolean).slice(0,t)}function B(e,t="#050505"){const i=document.createElement("section");return Object.assign(i.style,{display:"block",width:`${he}px`,height:`${q}px`,minHeight:`${q}px`,maxHeight:`${q}px`,position:"relative",overflow:"hidden",background:t,color:"#ffffff",fontFamily:"Poppins, system-ui, sans-serif",boxSizing:"border-box",pageBreakAfter:"always",breakAfter:"page"}),i.innerHTML=e,i}async function $e(e,t,i={}){const r=window.location.origin,a=String(t||"documento.pdf").replace(/\.pdf$/i,"").trim()||"Documento",d=e.map(m=>m.outerHTML).join(`
`),o=`<!DOCTYPE html><html lang="pt-BR"><head>
<meta charset="utf-8">
<base href="${r}">
<title>${l(a)}</title>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; -webkit-print-color-adjust: exact !important; }
html, body { margin: 0; padding: 0; background: #000; }
@page { size: 1366px 768px; margin: 0; }
section {
  display: block;
  width: 1366px !important;
  height: 768px !important;
  overflow: hidden !important;
  page-break-after: always;
  break-after: page;
}
section:last-child {
  page-break-after: avoid;
  break-after: avoid;
}
@media print {
  html, body {
    width: 1366px;
    height: auto;
    margin: 0;
    padding: 0;
    overflow: visible;
  }
}
</style>
</head>
<body>${d}</body></html>`,c=await fetch("/api/pdf/render",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({html:o,fileName:t,citySlugs:Array.isArray(i.citySlugs)?i.citySlugs:[],noCache:i.noCache===!0}),credentials:"same-origin"});if(!c.ok){const m=await c.json().catch(()=>({}));throw new Error(m.error||"Erro ao gerar PDF no servidor")}const s=String(c.headers.get("Content-Disposition")||"").match(/filename\*?=(?:UTF-8''|\")?([^\";]+)/i),x=decodeURIComponent(((s==null?void 0:s[1])||t).replace(/\"/g,"").trim()),u=await c.blob(),p=URL.createObjectURL(u),v=document.createElement("a");v.href=p,v.download=x,document.body.appendChild(v),v.click(),document.body.removeChild(v),URL.revokeObjectURL(p)}function J(e,t={}){return`
    <div style="display:grid;grid-template-columns:repeat(${t.columns||e.length},minmax(0,1fr));gap:${t.gap||18}px;">
      ${e.map(r=>`
        ${(()=>{const a=String(r.value??""),d=Number(t.valueSize||36);let o=d;return a.length>=16?o=Math.max(20,d-14):a.length>=12?o=Math.max(24,d-10):a.length>=10&&(o=Math.max(28,d-6)),`
        <div style="border:1px solid ${t.borderColor||ie};background:${t.background||"rgba(255,255,255,0.06)"};border-radius:${t.radius||26}px;padding:${t.padding||"24px 26px"};backdrop-filter:blur(10px);min-height:${t.minHeight||0}px;box-sizing:border-box;">
          <div style="display:flex;align-items:center;gap:12px;color:${t.labelColor||"rgba(255,255,255,0.72)"};font-size:${t.labelSize||16}px;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;">
            <span style="display:inline-flex;align-items:center;justify-content:center;width:${t.iconSize||36}px;height:${t.iconSize||36}px;border-radius:999px;background:rgba(254,92,43,0.18);color:${Q};font-weight:700;line-height:1;flex:0 0 auto;">${r.iconHtml||l(r.icon||"•")}</span>
            <span style="line-height:1.2;">${l(r.label)}</span>
          </div>
          <div style="margin-top:18px;padding-bottom:4px;font-family:Poppins, system-ui, sans-serif;font-size:${o}px;line-height:1.16;font-weight:700;color:${t.valueColor||"#ffffff"};letter-spacing:-0.03em;word-break:${t.valueWordBreak||"break-word"};white-space:${t.valueWhiteSpace||"normal"};max-width:100%;overflow:visible;">${l(a)}</div>
        </div>
          `})()}
      `).join("")}
    </div>
  `}function O(e){const t='style="display:block;flex-shrink:0;"';return e==="target"?`<span style="display:block;flex-shrink:0;width:16px;height:16px;position:relative;"><span style="position:absolute;inset:0;border:2px solid ${f};border-radius:999px;opacity:0.85;"></span><span style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:6px;height:6px;border-radius:999px;background:${f};"></span></span>`:e==="flow"?`<svg viewBox="0 0 24 24" width="16" height="16" ${t} fill="none" stroke="${f}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 7a8 8 0 0 0-13.7-2.5"></path><path d="M17 7h3V4"></path><path d="M4 17a8 8 0 0 0 13.7 2.5"></path><path d="M7 17H4v3"></path></svg>`:e==="money"?`<svg viewBox="0 0 24 24" width="16" height="16" ${t} fill="none" stroke="${f}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8"></circle><path d="M9.2 10.2c0-1.1 1-2 2.2-2h1.2c1.1 0 2 .8 2 1.9 0 .9-.6 1.6-1.5 1.9l-2.1.6c-.9.3-1.5 1-1.5 1.9 0 1.1.9 1.9 2 1.9h1.3c1.2 0 2.2-.9 2.2-2"></path></svg>`:e==="cpm"?`<svg viewBox="0 0 24 24" width="16" height="16" ${t} fill="none" stroke="${f}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 15a7 7 0 1 1 14 0"></path><path d="M12 11.5 15.8 9"></path><circle cx="12" cy="15" r="1.3" fill="${f}" stroke="none"></circle><path d="M7.5 17h9"></path></svg>`:`<span style="display:block;flex-shrink:0;width:8px;height:8px;border-radius:999px;background:${f};"></span>`}function we(e){return`${e} ${e===1?"ponto":"pontos"}`}function We(e,t={}){if(!e)return`
      <div style="height:100%;border-radius:${t.radius||30}px;border:1px solid ${ie};background:linear-gradient(135deg,#121212,#1B1B1B);display:flex;align-items:center;justify-content:center;color:rgba(255,255,255,0.62);font-size:28px;font-weight:600;">
        Imagem indisponível
      </div>
    `;const i=String(t.focalPoint||"center center").trim()||"center center",r=t.fit==="cover"?`display:block;width:100%;height:100%;object-fit:cover;object-position:${l(i)};`:"display:block;max-width:100%;max-height:100%;width:auto;height:auto;";return`
    <div style="position:relative;height:100%;border-radius:${t.radius||30}px;overflow:hidden;border:1px solid ${ie};background:#050505;">
      <img src="${e}" alt="" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;filter:blur(26px) saturate(1.1);transform:scale(1.08);opacity:0.45;" />
      <div style="position:absolute;inset:0;background:linear-gradient(180deg,rgba(7,7,7,0.12),rgba(7,7,7,0.62));"></div>
      <div style="position:absolute;left:28px;top:28px;right:28px;bottom:28px;display:flex;align-items:center;justify-content:center;overflow:hidden;">
        <img src="${e}" alt="" style="${r}filter:drop-shadow(0 24px 44px rgba(0,0,0,0.45));" />
      </div>
    </div>
  `}function Ve({cidade:e,pontos:t,resumo:i,assets:r,selectedCities:a=[]}){Fe(e);const d=new Set(t.map(n=>n.tipo).filter(Boolean)).size;new Set(t.map(n=>n.publico).filter(Boolean)).size,new Set(t.map(n=>`${n.cidade||""}-${n.endereco||""}`.trim()).filter(Boolean)).size,r.cityBg||r.heroBg||r.showcase;const o=Array.from(new Set((Array.isArray(a)?a:[]).map(n=>String(n||"").trim()).filter(Boolean)));o.join(" · "),o.length>1;const c=[{label:"Pontos ativos",value:k(t.length),icon:"type"},{label:"Telas disponíveis",value:k(i.telas),icon:"type"},{label:"Fluxo mensal",value:k(i.fluxo),icon:"coordinates"},{label:"Formatos no kit",value:k(d),icon:"city"}];return B(`
    <div style="position:absolute;inset:0;background:#000;"></div>
    <div style="position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,0.16) 0%,rgba(0,0,0,0.42) 45%,rgba(0,0,0,0.58) 100%);"></div>
    <div style="position:absolute;inset:auto auto -180px -60px;width:560px;height:560px;border-radius:999px;background:radial-gradient(circle,rgba(255,90,31,0.28) 0%,rgba(255,90,31,0.06) 48%,rgba(255,90,31,0) 72%);"></div>
    <div style="position:relative;z-index:1;display:grid;grid-template-columns:1.04fr 0.96fr;height:768px;max-height:768px;padding:58px 64px 50px;gap:22px;box-sizing:border-box;overflow:hidden;font-family:Poppins, system-ui, sans-serif;">
      <div style="display:flex;flex-direction:column;min-width:0;">
        <div style="display:flex;align-items:center;gap:18px;">
          <img src="${r.logo||""}" alt="" style="height:48px;width:auto;object-fit:contain;" />
          <div data-calibration-id="proposal.cover.badge" style="display:inline-flex;align-items:center;justify-content:center;height:${layout.badgeMinHeight}px;padding:0 ${layout.badgePaddingX}px;border-radius:100px;background:${f};border:1px solid ${f};font-size:12px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:#fff;line-height:1;text-align:center;">
            <span style="display:block;">Proposta comercial</span>
          </div>
        </div>

        <div style="margin-top:28px;font-family:Poppins, system-ui, sans-serif;font-size:68px;line-height:0.92;font-weight:700;letter-spacing:-0.05em;max-width:680px;max-height:190px;overflow:hidden;">${l(e)}</div>
        <div style="margin-top:14px;font-size:20px;line-height:1.35;color:rgba(255,255,255,0.74);max-width:620px;max-height:112px;overflow:hidden;">${l(subtitleText)}</div>

        <div data-calibration-id="proposal.cover.chips" style="display:flex;gap:10px;flex-wrap:wrap;margin-top:16px;">
          ${[proposalCity,we(proposalPoints.length||0),segmentLabel,`Gerado em ${new Date().toLocaleDateString("pt-BR")}`].map(n=>`
            <div style="display:inline-flex;align-items:center;justify-content:center;height:36px;padding:0 16px;border-radius:100px;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.12);font-size:12px;font-weight:600;color:${Y};line-height:1;text-align:center;">
              <span style="display:block;">${l(n)}</span>
            </div>
          `).join("")}
        </div>

        <div data-calibration-id="proposal.cover.metricCards" style="margin-top:auto;">
          ${J(c,{valueSize:layout.metricValueSize,labelSize:layout.metricLabelSize,iconSize:layout.metricIconSize,minHeight:146,gap:layout.metricGap,padding:layout.metricPadding,valueWhiteSpace:"normal",valueWordBreak:"break-word"})}
        </div>
      </div>

      <div style="display:grid;grid-template-rows:1fr;gap:20px;min-width:0;">
        <div style="padding:20px 22px;border-radius:12px;background:${M};border:1px solid ${h};display:flex;flex-direction:column;overflow:hidden;">
          <div data-calibration-id="proposal.cover.strategicHeader" style="display:flex;align-items:center;gap:10px;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${f};border-top:2px solid ${f};padding-top:8px;"><span style="display:inline-flex;align-items:center;justify-content:center;width:${layout.strategicHeaderIconSize}px;height:${layout.strategicHeaderIconSize}px;border-radius:999px;background:rgba(255,90,31,0.16);">${O("target")}</span>Direcionamento estratégico</div>
          <div data-calibration-id="proposal.cover.strategicCards" style="margin-top:14px;display:grid;gap:10px;">
            ${strategicItems.map(n=>`
              <div style="display:grid;grid-template-columns:32px 1fr;gap:10px;align-items:flex-start;padding:12px 14px;border-radius:12px;background:${W};border:1px solid ${h};">
                <div style="display:flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:999px;background:rgba(254,92,43,0.16);">
                  <span style="display:block;width:${layout.strategicDotSize}px;height:${layout.strategicDotSize}px;border-radius:999px;background:${f};"></span>
                </div>
                <div style="font-size:17px;line-height:1.35;color:#fff;word-break:break-word;max-height:4.1em;overflow:hidden;">${l(n)}</div>
              </div>
            `).join("")}
          </div>
          <div style="margin-top:auto;display:grid;grid-template-columns:1fr 1fr;gap:12px;">
            <div style="padding:10px 12px;border-radius:12px;background:${W};border:1px solid ${h};">
              <div style="font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${T};">Segmento priorizado</div>
              <div style="margin-top:6px;font-size:18px;line-height:1.2;color:#fff;font-weight:700;word-break:break-word;">${l(segmentLabel)}</div>
            </div>
            ${hasEntornoData?`
              <div style="padding:10px 12px;border-radius:12px;background:${W};border:1px solid ${h};">
                <div style="font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${T};">Entorno aderente</div>
                <div style="margin-top:6px;font-size:18px;line-height:1.2;color:#fff;font-weight:700;word-break:break-word;">${l(`${k(pointsWithEntorno)} ponto${pointsWithEntorno===1?"":"s"}`)}</div>
              </div>
            `:""}
          </div>
        </div>
      </div>
    </div>
  `,R)}function Ge({proposalClient:e,proposalCity:t,proposalPoints:i,proposalTotals:r,pricingSummary:a,highlights:d,strategicTopics:o,strategicSubtitle:c,simulationSummary:n,segmento:s,assets:x,showMetricsMethodology:u=!0}){const p=ve().proposal.cover,v=G(s),m=i.filter(L=>{var I;return Number((I=L==null?void 0:L.entornoMetrics)==null?void 0:I.total_estabelecimentos_relacionados)>0}).length,P=m>0,$=(a==null?void 0:a.originalTotal)??r.valorTotal,z=(a==null?void 0:a.finalTotal)??r.valorTotal,b=[{iconHtml:O("target"),label:"Pontos",value:k(i.length)},{iconHtml:O("flow"),label:"Fluxo total",value:k(r.fluxoTotal)},{iconHtml:O("money"),label:"Valor Tabela",value:F($)},{iconHtml:O("money"),label:"Valor Negociado",value:F(z)},{iconHtml:O("cpm"),label:"CPM estimado",value:Te(r.cpmEstimado)}],y=o.length?o:d.length?d:["Argumentos estratégicos serão definidos na reunião comercial."],C=String(c||"").trim()||`Planejamento comercial para ${t} com foco em cobertura, frequência e presença de marca.`;return B(`
    <div style="position:absolute;inset:0;background:${U};"></div>
    <div style="position:absolute;inset:0;background:linear-gradient(105deg,rgba(0,0,0,0.95) 0%,rgba(0,0,0,0.88) 52%,rgba(0,0,0,0.76) 100%);"></div>
    <div style="position:absolute;inset:auto auto -180px -60px;width:560px;height:560px;border-radius:999px;background:radial-gradient(circle,rgba(255,90,31,0.28) 0%,rgba(255,90,31,0.06) 48%,rgba(255,90,31,0) 72%);"></div>
    <div style="position:relative;z-index:1;display:grid;grid-template-columns:1.04fr 0.96fr;height:768px;max-height:768px;padding:58px 64px 50px;gap:22px;box-sizing:border-box;overflow:hidden;font-family:Poppins, system-ui, sans-serif;">
      <div style="display:flex;flex-direction:column;min-width:0;">
        <div style="display:flex;align-items:center;gap:18px;">
          <img src="${x.logo||""}" alt="" style="height:48px;width:auto;object-fit:contain;" />
          <div data-calibration-id="proposal.cover.badge" style="display:inline-flex;align-items:center;justify-content:center;height:${p.badgeMinHeight}px;padding:0 ${p.badgePaddingX}px;border-radius:100px;background:${f};border:1px solid ${f};font-size:12px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:#fff;line-height:1;text-align:center;">
            <span style="display:block;">Proposta comercial</span>
          </div>
        </div>

        <div style="margin-top:28px;font-family:Poppins, system-ui, sans-serif;font-size:68px;line-height:0.92;font-weight:700;letter-spacing:-0.05em;max-width:680px;max-height:190px;overflow:hidden;">${l(e)}</div>
        <div style="margin-top:14px;font-size:20px;line-height:1.35;color:rgba(255,255,255,0.74);max-width:620px;max-height:112px;overflow:hidden;">${l(C)}</div>

        <div data-calibration-id="proposal.cover.chips" style="display:flex;gap:10px;flex-wrap:wrap;margin-top:16px;">
          ${[t,we(i.length||0),v,`Gerado em ${new Date().toLocaleDateString("pt-BR")}`].map(L=>`
            <div style="display:inline-flex;align-items:center;justify-content:center;height:36px;padding:0 16px;border-radius:100px;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.12);font-size:12px;font-weight:600;color:${Y};line-height:1;text-align:center;">
              <span style="display:block;">${l(L)}</span>
            </div>
          `).join("")}
        </div>

        <div data-calibration-id="proposal.cover.metricCards" style="margin-top:auto;">
          ${u?J(b,{valueSize:p.metricValueSize,labelSize:p.metricLabelSize,iconSize:p.metricIconSize,minHeight:146,gap:p.metricGap,padding:p.metricPadding,valueWhiteSpace:"normal",valueWordBreak:"break-word"}):`${J(b.slice(0,2),{columns:2,valueSize:p.metricValueSize,labelSize:p.metricLabelSize,iconSize:p.metricIconSize,minHeight:100,gap:p.metricGap,padding:p.metricPadding,valueWhiteSpace:"normal",valueWordBreak:"break-word"})}
              <div style="margin-top:${p.metricGap||18}px;">
                ${J(b.slice(2),{columns:3,valueSize:Math.max(p.metricValueSize,32),labelSize:p.metricLabelSize,iconSize:p.metricIconSize,minHeight:100,gap:p.metricGap,padding:p.metricPadding,borderColor:f,valueWhiteSpace:"normal",valueWordBreak:"break-word"})}
              </div>`}
        </div>
      </div>

      <div style="display:grid;grid-template-rows:1fr;gap:20px;min-width:0;">
        <div style="padding:20px 22px;border-radius:12px;background:${M};border:1px solid ${h};display:flex;flex-direction:column;overflow:hidden;">
          <div data-calibration-id="proposal.cover.strategicHeader" style="display:flex;align-items:center;gap:10px;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${f};border-top:2px solid ${f};padding-top:8px;"><span style="display:inline-flex;align-items:center;justify-content:center;width:${p.strategicHeaderIconSize}px;height:${p.strategicHeaderIconSize}px;border-radius:999px;background:rgba(255,90,31,0.16);">${O("target")}</span>Direcionamento estratégico</div>
          <div data-calibration-id="proposal.cover.strategicCards" style="margin-top:14px;display:grid;gap:10px;">
            ${y.map(L=>`
              <div style="display:grid;grid-template-columns:32px 1fr;gap:10px;align-items:flex-start;padding:12px 14px;border-radius:12px;background:${W};border:1px solid ${h};">
                <div style="display:flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:999px;background:rgba(254,92,43,0.16);">
                  <span style="display:block;width:${p.strategicDotSize}px;height:${p.strategicDotSize}px;border-radius:999px;background:${f};"></span>
                </div>
                <div style="font-size:17px;line-height:1.35;color:#fff;word-break:break-word;max-height:4.1em;overflow:hidden;">${l(L)}</div>
              </div>
            `).join("")}
          </div>
          <div style="margin-top:auto;display:grid;grid-template-columns:1fr 1fr;gap:12px;">
            <div style="padding:10px 12px;border-radius:12px;background:${W};border:1px solid ${h};">
              <div style="font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${T};">Segmento priorizado</div>
              <div style="margin-top:6px;font-size:18px;line-height:1.2;color:#fff;font-weight:700;word-break:break-word;">${l(v)}</div>
            </div>
            ${P?`
              <div style="padding:10px 12px;border-radius:12px;background:${W};border:1px solid ${h};">
                <div style="font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${T};">Entorno aderente</div>
                <div style="margin-top:6px;font-size:18px;line-height:1.2;color:#fff;font-weight:700;word-break:break-word;">${l(`${k(m)} ponto${m===1?"":"s"}`)}</div>
              </div>
            `:""}
          </div>
        </div>
      </div>
    </div>
  `,R)}function Ue({proposalPoints:e,proposalTotals:t,pricingSummary:i,segmento:r,assets:a}){const d=G(r),o=e.length,c=Number(t==null?void 0:t.fluxoTotal)||0,n=Number(t==null?void 0:t.insercoesTotal)||0,s=Number((i==null?void 0:i.originalTotal)??(t==null?void 0:t.valorTotal))||0,x=Number((i==null?void 0:i.finalTotal)??(t==null?void 0:t.valorTotal))||0,u=o>0?x/o:0,p=c>0?x/(c/1e3):0,v=c>0?x/c:0,m=e.filter(b=>{var y;return Number((y=b==null?void 0:b.entornoMetrics)==null?void 0:y.total_estabelecimentos_relacionados)>0}).length,P=m>0,$=o>0?e.reduce((b,y)=>{var C;return b+(Number((C=y==null?void 0:y.entornoMetrics)==null?void 0:C.score_relevancia)||0)},0)/o:0,z=[{name:"Valor Tabela",meaning:"Soma dos valores mensais dos pontos sem desconto.",howToRead:"Soma dos valores mensais de todos os pontos, antes de qualquer negociação.",value:F(s)},{name:"Valor Negociado",meaning:"Valor final da proposta após políticas comerciais.",howToRead:"Valor final considerado para a campanha após condições comerciais aplicadas.",value:F(x)},{name:"Ticket Médio",meaning:"Investimento médio por ponto selecionado.",howToRead:"Média de investimento por ponto selecionado.",value:F(u)},{name:"CPM Estimado",meaning:"Custo estimado para mil impactos (1.000).",howToRead:"Quanto custa, em média, gerar mil impactos dentro deste plano.",value:`R$ ${p.toFixed(2).replace(".",",")}`},{name:"Custo por Impacto",meaning:"Custo unitário estimado por impacto mensal.",howToRead:"Custo estimado de cada impacto mensal, considerando todo o fluxo da campanha.",value:Re(v)},{name:"Inserções Mensais",meaning:"Volume mínimo de inserções previstas no plano.",howToRead:"Quantidade mínima de inserções mensais planejadas para execução da campanha.",value:`Mínimo de ${k(n)}`}];return B(`
    <div style="position:absolute;inset:0;background:${U};"></div>
    <img src="${a.wallpaper||a.heroBg||""}" alt="" style="position:absolute;inset:-80px;width:calc(100% + 160px);height:calc(100% + 160px);object-fit:cover;filter:blur(18px) saturate(1.1);opacity:0.12;" />
    <div style="position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,0.7),rgba(0,0,0,0.92));"></div>

    <div style="position:relative;z-index:1;height:768px;max-height:768px;padding:38px 48px;box-sizing:border-box;display:grid;grid-template-rows:auto auto 1fr;gap:12px;overflow:hidden;font-family:Poppins, system-ui, sans-serif;">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:16px;">
        <div style="display:flex;align-items:center;gap:14px;">
          <img src="${a.logoHorizontal||a.logo||""}" alt="" style="height:40px;width:auto;object-fit:contain;" />
          <div style="display:inline-flex;align-items:center;justify-content:center;height:38px;padding:0 16px;border-radius:100px;background:rgba(255,90,31,0.12);border:1px solid rgba(255,90,31,0.24);font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${f};">Como ler as métricas</div>
        </div>
        <div style="font-size:13px;letter-spacing:0.08em;text-transform:uppercase;color:rgba(255,255,255,0.62);">${l(d)} • ${k(o)} pontos</div>
      </div>

      <div style="padding:16px 20px;border-radius:12px;background:${M};border:1px solid ${h};font-size:13px;line-height:1.45;color:rgba(255,255,255,0.85);">
        As métricas abaixo resumem eficiência comercial e escala de entrega da campanha. Os valores exibidos já refletem esta proposta.
      </div>

      <div style="display:grid;grid-template-columns:1.06fr 0.94fr;gap:12px;min-height:0;">
        <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));grid-template-rows:repeat(3,minmax(0,1fr));gap:10px;align-content:stretch;">
          ${z.map(b=>`
            <div style="padding:12px 12px;border-radius:12px;background:${M};border:1px solid ${h};display:grid;grid-template-rows:auto auto auto 1fr auto;gap:6px;height:100%;box-sizing:border-box;">
              <div style="font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${T};">${l(b.name)}</div>
              <div style="font-size:12px;line-height:1.32;color:${Y};word-break:break-word;">${l(b.meaning)}</div>
              <div style="padding:6px 8px;border-radius:8px;background:rgba(255,255,255,0.05);border:1px solid ${h};font-size:10px;line-height:1.3;color:rgba(255,255,255,0.85);word-break:break-word;">${l(b.howToRead)}</div>
              <div style="margin-top:4px;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:${T};">Resultado</div>
              <div style="font-family:Poppins, system-ui, sans-serif;font-size:30px;line-height:1.02;font-weight:800;color:#fff;word-break:break-word;">${l(b.value)}</div>
            </div>
          `).join("")}
        </div>

        <div style="display:grid;gap:8px;align-content:start;">
          <div style="padding:18px 20px;border-radius:12px;background:${M};border:1px solid ${h};border-left:3px solid ${f};">
            <div style="font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${f};">Score da campanha</div>
            <div style="margin-top:8px;font-size:12px;line-height:1.45;color:rgba(255,255,255,0.78);">
              Índice de 0 a 10 que combina diversidade de formatos, volume de fluxo, cobertura, presença e aderência ao público/objetivo.
            </div>
            <div style="margin-top:10px;padding:10px;border-radius:10px;background:rgba(0,0,0,0.22);border:1px solid rgba(255,255,255,0.08);font-size:11px;line-height:1.4;color:rgba(255,255,255,0.85);">Leitura prática: quanto maior a diversidade, o fluxo e a presença, maior o score final da campanha.</div>
          </div>

          ${P?`
            <div style="padding:18px 20px;border-radius:12px;background:${M};border:1px solid ${h};border-left:3px solid ${f};">
              <div style="font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${f};">Score do entorno</div>
              <div style="margin-top:8px;font-size:12px;line-height:1.45;color:rgba(255,255,255,0.78);">
                Mede relevância comercial local por ponto para o segmento priorizado, considerando proximidade e categorias relacionadas.
              </div>
              <div style="margin-top:10px;padding:10px;border-radius:10px;background:rgba(0,0,0,0.22);border:1px solid rgba(255,255,255,0.08);font-size:11px;line-height:1.35;color:rgba(255,255,255,0.85);">Leitura prática: mais locais aderentes e mais proximidade tendem a elevar o score de entorno.</div>
              <div style="margin-top:10px;display:grid;grid-template-columns:1fr 1fr;gap:8px;">
                <div style="padding:10px;border-radius:10px;background:rgba(0,0,0,0.18);border:1px solid rgba(255,255,255,0.07);">
                  <div style="font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:rgba(255,255,255,0.5);">Score médio</div>
                  <div style="margin-top:6px;font-size:22px;font-weight:700;color:#fff;font-family:Poppins, system-ui, sans-serif;">${$.toFixed(1).replace(".",",")}</div>
                </div>
                <div style="padding:10px;border-radius:10px;background:rgba(0,0,0,0.18);border:1px solid rgba(255,255,255,0.07);">
                  <div style="font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:rgba(255,255,255,0.5);">Pontos com dados</div>
                  <div style="margin-top:6px;font-size:22px;font-weight:700;color:#fff;font-family:Poppins, system-ui, sans-serif;">${k(m)}</div>
                </div>
              </div>
            </div>
          `:""}

          <div style="padding:10px 12px;border-radius:12px;background:rgba(255,90,31,0.06);border:1px solid rgba(255,90,31,0.3);font-size:11px;line-height:1.35;color:rgba(255,255,255,0.9);">
            Observação: as métricas são estimativas com base no inventário e nos dados cadastrais da campanha. Valores podem variar conforme filtros, objetivo e seleção de pontos.
          </div>
        </div>
      </div>
    </div>
  `,R)}function Xe({point:e,index:t,total:i,image:r,mapImage:a,segmento:d,assets:o}){var b;const c=ve().proposal.point,n=Math.max(Number(c.counterMinWidth)||0,110),s=Math.max(Number(c.counterPaddingX)||0,14),x=Se(e);xe(e==null?void 0:e.entornoMetrics,d);const u=Number((b=e==null?void 0:e.entornoMetrics)==null?void 0:b.total_estabelecimentos_relacionados)||0,p=u>0,v=He(e)?"veículos/mês":"pessoas/mês",m=(()=>{const y=Number(e.lat),C=Number(e.lng);return Number.isFinite(y)&&Number.isFinite(C)&&Math.abs(y)>1e-4?`${y.toFixed(6)}, ${C.toFixed(6)}`:null})(),P=[{label:"Fluxo",value:`${k(e.fluxo)} ${v}`},{label:"Telas",value:k(e.telas)},{label:"Inserções",value:`Mínimo de ${k(e.insercoes)}`},{label:"Valor Negociado",value:F(e.preco)}],$=String((e==null?void 0:e.foto_focal_point)||"center center").trim()||"center center",z=We(r,{fit:"contain",radius:28,focalPoint:$});return B(`
    <div style="position:absolute;inset:0;background:linear-gradient(135deg,#000000 0%,#050505 38%,#101010 100%);"></div>
    <div style="position:absolute;top:0;right:0;bottom:0;width:34%;background:url('${o.wallpaper||o.cityBg||""}') center/cover no-repeat;opacity:${c.rightWallpaperOpacity};"></div>
    <div style="position:relative;z-index:1;height:768px;max-height:768px;padding:24px 28px;box-sizing:border-box;display:grid;grid-template-rows:auto 1fr;gap:10px;overflow:hidden;font-family:Poppins, system-ui, sans-serif;">
      <div data-calibration-id="proposal.point.header" style="display:flex;justify-content:space-between;align-items:center;gap:12px;padding:10px 12px;border-radius:12px;background:${M};border:1px solid ${h};">
        <div style="display:flex;align-items:center;gap:16px;min-width:0;">
          <img src="${o.logo||""}" alt="" style="height:34px;width:auto;object-fit:contain;" />
          <div style="min-width:0;">
            <div style="font-family:Poppins, system-ui, sans-serif;font-size:24px;line-height:1.03;font-weight:700;letter-spacing:-0.03em;color:#fff;white-space:normal;word-break:break-word;max-height:2.1em;overflow:hidden;">${Ie(e.nome||"PONTO SEM NOME",{innerStyle:"font-size:0.66em;font-weight:600;letter-spacing:-0.01em;"})}</div>
            <div style="margin-top:4px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:13px;line-height:1.25;color:${Y};">
              <span style="display:inline-flex;align-items:center;justify-content:center;height:24px;padding:0 10px;border-radius:100px;background:${f};font-size:11px;font-weight:700;color:#fff;text-transform:uppercase;letter-spacing:0.08em;">${l(V(e)||"-")}</span>
              <span>${l(e.cidade||"-")}</span>
              ${m?`<span style="display:inline-flex;align-items:center;justify-content:center;min-height:22px;padding:0 10px;border-radius:999px;border:1px solid rgba(255,255,255,0.12);background:rgba(255,255,255,0.04);font-size:12px;line-height:1;color:rgba(255,255,255,0.58);">${l(m)}</span>`:""}
            </div>
          </div>
        </div>
        <div data-calibration-id="proposal.point.counter" style="display:inline-flex;align-items:center;justify-content:center;gap:${c.counterGap}px;min-width:${n}px;height:${c.counterMinHeight}px;padding:0 ${s}px;border-radius:100px;background:rgba(255,255,255,0.08);font-size:13px;font-weight:700;color:#fff;line-height:1;font-family:Poppins, system-ui, sans-serif;white-space:nowrap;text-align:center;letter-spacing:0;box-sizing:border-box;">
          <span style="display:block;color:${f};">${t}</span>
          <span style="display:block;color:rgba(255,255,255,0.56);">/</span>
          <span style="display:block;color:rgba(255,255,255,0.86);">${i}</span>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1.2fr 0.8fr;gap:12px;min-height:0;overflow:hidden;">
        <div data-calibration-id="proposal.point.imageFrame" style="position:relative;min-width:0;">
          <div style="position:absolute;inset:0;padding:14px;border-radius:12px;background:${M};border:1px solid ${h};box-sizing:border-box;">
            ${z}
            <div style="position:absolute;left:14px;right:14px;bottom:14px;height:72px;background:linear-gradient(to top,rgba(0,0,0,0.62),transparent);pointer-events:none;"></div>
          </div>
        </div>

        <div style="display:flex;flex-direction:column;gap:8px;min-width:0;overflow:hidden;">
          ${p?`
            <div data-calibration-id="proposal.point.addressBox" style="padding:12px 14px;border-radius:12px;background:${M};border:1px solid ${h};">
              <div style="font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${f};border-top:2px solid ${f};padding-top:8px;">Entorno relevante</div>
              <div style="margin-top:4px;font-size:24px;line-height:1;font-weight:700;color:#fff;font-family:Poppins, system-ui, sans-serif;">${k(u)}</div>
              <div style="margin-top:4px;font-size:11px;line-height:1.3;color:rgba(255,255,255,0.72);">${l(u===1?"local relevante no raio analisado.":"locais relevantes no raio analisado.")}</div>
            </div>
          `:""}

          <div style="padding:12px 14px;border-radius:12px;background:${M};border:1px solid ${h};">
            <div style="font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${f};border-top:2px solid ${f};padding-top:8px;">Qualificação do público</div>
            <div style="margin-top:8px;display:inline-flex;align-items:center;justify-content:center;height:30px;padding:0 12px;border-radius:100px;background:rgba(255,90,31,0.15);border:1px solid rgba(255,90,31,0.24);font-size:12px;font-weight:700;color:${f};">${l(x.badge)}</div>
            <div style="margin-top:6px;font-size:16px;line-height:1.3;color:#fff;font-weight:700;word-break:break-word;max-height:2.6em;overflow:hidden;">${l(x.headline)}</div>
            <div style="margin-top:4px;font-size:12px;line-height:1.32;color:${Y};word-break:break-word;max-height:2.6em;overflow:hidden;">${l(x.summary)}</div>
          </div>

          ${a?`
            <div style="padding:10px 12px;border-radius:12px;background:${M};border:1px solid ${h};">
              <div style="font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${f};">Localização no mapa</div>
              <div style="margin-top:6px;height:72px;border-radius:10px;overflow:hidden;border:1px solid ${h};background:rgba(255,255,255,0.02);">
                <img src="${a}" alt="Mapa do ponto" style="width:100%;height:100%;object-fit:cover;filter:brightness(0.85) contrast(1.1);" />
              </div>
              <div style="margin-top:2px;font-size:9px;line-height:1.1;color:rgba(255,255,255,0.62);">Fonte cartográfica: OpenStreetMap/Carto.</div>
            </div>
          `:""}

          <div data-calibration-id="proposal.point.statsList" style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;">
            ${P.map(y=>`
              <div style="padding:10px 12px;border-radius:8px;background:rgba(255,255,255,0.05);border:1px solid ${h};">
                <div style="font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${T};">${l(y.label)}</div>
                <div style="margin-top:2px;font-size:${y.label==="Valor Negociado"?"22px":"16px"};line-height:1.2;color:${y.label==="Valor Negociado"?f:"#fff"};font-weight:800;word-break:break-word;">${l(y.value)}</div>
              </div>
            `).join("")}
          </div>

        </div>
      </div>
    </div>
  `,R)}function Ye(e){var i,r;const t=[{lat:e==null?void 0:e.lat,lng:e==null?void 0:e.lng},{lat:e==null?void 0:e.latitude,lng:e==null?void 0:e.longitude},{lat:(i=e==null?void 0:e.entornoMetrics)==null?void 0:i.latitude,lng:(r=e==null?void 0:e.entornoMetrics)==null?void 0:r.longitude}];for(const a of t){const d=Number(a.lat),o=Number(a.lng);if(Number.isFinite(d)&&Number.isFinite(o)&&Math.abs(d)>1e-4&&Math.abs(o)>1e-4)return{lat:d,lng:o}}return null}function Ke(e){const t=String(e||"seed");let i=0;for(let a=0;a<t.length;a+=1)i=(i<<5)-i+t.charCodeAt(a),i|=0;return Math.abs(i%360)*Math.PI/180}function qe(e){return Math.max(-85.05112878,Math.min(85.05112878,e))}function ae(e,t,i){const r=qe(e),a=Math.sin(r*Math.PI/180),d=256*2**i,o=(t+180)/360*d,c=(.5-Math.log((1+a)/(1-a))/(4*Math.PI))*d;return{x:o,y:c}}function Je(e,t,i,r=28){for(let a=15;a>=9;a-=1){const d=e.map(p=>ae(p.lat,p.lng,a)),o=Math.min(...d.map(p=>p.x)),c=Math.max(...d.map(p=>p.x)),n=Math.min(...d.map(p=>p.y)),s=Math.max(...d.map(p=>p.y)),x=Math.max(c-o,1),u=Math.max(s-n,1);if(x<=(t-r*2)*.92&&u<=(i-r*2)*.92)return a}return 9}function Qe(e){const a=e.map((g,S)=>{const w=Ye(g.point);return w?{...w,index:S+1,row:g}:null}).filter(Boolean),d=[];if(a.forEach(g=>{(Array.isArray(g.row.rawPlaces)?g.row.rawPlaces.slice(0,8):[]).forEach((w,j)=>{const H=Number(w==null?void 0:w.lat),D=Number(w==null?void 0:w.lng);Number.isFinite(H)&&Number.isFinite(D)&&Math.abs(H)>1e-4&&Math.abs(D)>1e-4&&d.push({lat:H,lng:D,label:(w==null?void 0:w.name)||`Local ${j+1}`,category:(w==null?void 0:w.category)||"",distance:Number(w==null?void 0:w.distance)||0,pointEntry:g})})}),!a.length)return`
      <div style="height:100%;display:flex;align-items:center;justify-content:center;color:rgba(255,255,255,0.62);font-size:15px;">
        Sem coordenadas válidas para montar o mapa de evidências.
      </div>
    `;const o=[...a.map(g=>({lat:g.lat,lng:g.lng})),...d.map(g=>({lat:g.lat,lng:g.lng}))],c=Je(o,980,380,34),n=o.map(g=>ae(g.lat,g.lng,c)),s=Math.min(...n.map(g=>g.x)),x=Math.max(...n.map(g=>g.x)),u=Math.min(...n.map(g=>g.y)),p=Math.max(...n.map(g=>g.y)),v=Math.max(x-s,1),m=Math.max(p-u,1),z=Math.min(912/v,312/m,1),b=(s+x)/2,y=(u+p)/2,C=980/z,L=380/z,I=b-C/2,_=y-L/2,X=(g,S)=>{const w=ae(g,S,c);return{x:(w.x-I)*z,y:(w.y-_)*z}},N=d.map(g=>{const S=X(g.lat,g.lng);return{x:S.x,y:S.y,label:g.label,category:g.category,distance:g.distance}});N.length>0||a.forEach(g=>{const S=X(g.lat,g.lng);(Array.isArray(g.row.rawPlaces)?g.row.rawPlaces.slice(0,5):[]).forEach((j,H)=>{var de;const D=Math.max(70,Math.min(1e3,Number(j==null?void 0:j.distance)||220)),ne=Ke(`${((de=g.row.point)==null?void 0:de.id)||g.index}-${(j==null?void 0:j.name)||H}`),se=14+D/1e3*62,ke=Math.max(34,Math.min(946,S.x+Math.cos(ne)*se)),Pe=Math.max(34,Math.min(346,S.y+Math.sin(ne)*se));N.push({x:ke,y:Pe,label:(j==null?void 0:j.name)||`Local ${H+1}`,category:(j==null?void 0:j.category)||"",distance:D})})});const Z=a.map(g=>{const{x:S,y:w}=X(g.lat,g.lng);return`
      <div style="position:absolute;left:${(S-10).toFixed(1)}px;top:${(w-10).toFixed(1)}px;width:20px;height:20px;border-radius:999px;border:1px solid rgba(254,92,43,0.56);background:rgba(254,92,43,0.3);"></div>
      <div style="position:absolute;left:${(S-6).toFixed(1)}px;top:${(w-6).toFixed(1)}px;width:12px;height:12px;border-radius:999px;background:${Q};"></div>
      <div style="position:absolute;left:${(S-7).toFixed(1)}px;top:${(w-6).toFixed(1)}px;min-width:14px;text-align:center;font-size:9px;font-weight:700;color:#0a0a0a;line-height:12px;">${g.index}</div>
    `}).join(""),A=N.map(g=>`
    <div title="${l(`${g.label} • ${Math.round(g.distance)} m`)}" style="position:absolute;left:${(g.x-4).toFixed(1)}px;top:${(g.y-4).toFixed(1)}px;width:8px;height:8px;border-radius:999px;background:rgba(255,255,255,0.8);border:1px solid rgba(255,255,255,0.32);"></div>
  `).join(""),E=110,ee=[];for(let g=E;g<980;g+=E)ee.push(`<line x1="${g}" y1="0" x2="${g}" y2="380" stroke="rgba(255,255,255,0.12)" stroke-width="1"/>`);for(let g=E;g<380;g+=E)ee.push(`<line x1="0" y1="${g}" x2="980" y2="${g}" stroke="rgba(255,255,255,0.12)" stroke-width="1"/>`);return`
    <div style="position:relative;width:100%;height:100%;border-radius:16px;overflow:hidden;background:#0b0b0b;" role="img" aria-label="Mapa geográfico de pontos e entorno">
      <svg viewBox="0 0 980 380" width="100%" height="100%" preserveAspectRatio="none" style="position:absolute;inset:0;">
        <rect x="0" y="0" width="980" height="380" fill="#0a0a0a"/>
        <rect x="0" y="0" width="980" height="380" fill="url(#env-grid-grad)"/>
        <defs>
          <linearGradient id="env-grid-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="rgba(255,90,31,0.07)"/>
            <stop offset="100%" stop-color="rgba(255,255,255,0.02)"/>
          </linearGradient>
        </defs>
        ${ee.join("")}
      </svg>
      <div style="position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,0.05),rgba(0,0,0,0.16));"></div>
      ${A}
      ${Z}
    </div>
  `}function Ze({proposalCity:e,proposalPoints:t,segmento:i,assets:r}){const a=G(i),d=t.filter(n=>{var s;return Number((s=n==null?void 0:n.entornoMetrics)==null?void 0:s.total_estabelecimentos_relacionados)>0}).sort((n,s)=>{var p,v;const x=Number((p=n==null?void 0:n.entornoMetrics)==null?void 0:p.score_relevancia)||0;return(Number((v=s==null?void 0:s.entornoMetrics)==null?void 0:v.score_relevancia)||0)-x}),o=(d.length?d:t).slice(0,5).map(n=>{const s=xe(n==null?void 0:n.entornoMetrics,i),x=(n==null?void 0:n.entornoMetrics)||{},u=Number(x.total_estabelecimentos_relacionados)||0,p=Number(x.score_relevancia)||0,v=s.places.slice(0,2).map(m=>`${m.name} (${m.distanceLabel})`);return{point:n,totalLocais:u,score:p,places:v,summary:s,rawPlaces:Array.isArray(x.places)?x.places:[]}}),c=Qe(o);return B(`
    <div style="position:absolute;inset:0;background:${U};"></div>
    <img src="${r.wallpaper||r.heroBg||""}" alt="" style="position:absolute;inset:-80px;width:calc(100% + 160px);height:calc(100% + 160px);object-fit:cover;filter:blur(18px) saturate(1.1);opacity:0.12;" />
    <div style="position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,0.68),rgba(0,0,0,0.9));"></div>

    <div style="position:relative;z-index:1;height:768px;max-height:768px;padding:42px 56px;box-sizing:border-box;display:grid;grid-template-rows:auto auto auto 1fr;gap:12px;overflow:hidden;font-family:Poppins, system-ui, sans-serif;">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:16px;">
        <div style="display:flex;align-items:center;gap:14px;">
          <img src="${r.logoHorizontal||r.logo||""}" alt="" style="height:40px;width:auto;object-fit:contain;" />
          <div style="display:inline-flex;align-items:center;justify-content:center;height:38px;padding:0 16px;border-radius:100px;background:rgba(255,90,31,0.12);border:1px solid rgba(255,90,31,0.24);font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${f};">Evidências de entorno</div>
        </div>
        <div style="font-size:13px;letter-spacing:0.08em;text-transform:uppercase;color:rgba(255,255,255,0.62);">${l(e||"Múltiplas praças")} • ${l(a)}</div>
      </div>

      <div style="padding:14px 18px;border-radius:18px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.08);display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;">
        <div>
          <div style="font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:rgba(255,255,255,0.5);">Pontos com aderência</div>
          <div style="margin-top:6px;font-size:30px;line-height:1;font-weight:700;color:#fff;font-family:Poppins, system-ui, sans-serif;">${k(d.length)}</div>
        </div>
        <div>
          <div style="font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:rgba(255,255,255,0.5);">Total de pontos da proposta</div>
          <div style="margin-top:6px;font-size:30px;line-height:1;font-weight:700;color:#fff;font-family:Poppins, system-ui, sans-serif;">${k(t.length)}</div>
        </div>
        <div>
          <div style="font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:rgba(255,255,255,0.5);">Foco do segmento</div>
            <div style="margin-top:6px;font-size:22px;line-height:1.2;font-weight:700;color:#fff;font-family:Poppins, system-ui, sans-serif;word-break:break-word;">${l(a)}</div>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1.05fr 0.95fr;gap:10px;height:280px;">
        <div style="border-radius:12px;border:1px solid ${h};background:${M};overflow:hidden;position:relative;">
          <div style="position:absolute;top:10px;left:12px;z-index:2;padding:5px 10px;border-radius:100px;border:1px solid rgba(255,90,31,0.26);background:rgba(255,90,31,0.14);font-size:11px;font-weight:700;letter-spacing:0.07em;text-transform:uppercase;color:${f};">Mapa geográfico de evidências</div>
          <div style="position:absolute;right:12px;bottom:10px;z-index:2;display:flex;gap:10px;align-items:center;font-size:11px;color:rgba(255,255,255,0.68);">
            <span style="display:inline-flex;align-items:center;gap:6px;"><span style="width:12px;height:12px;border-radius:999px;background:${Q};display:inline-block;"></span>Pontos</span>
            <span style="display:inline-flex;align-items:center;gap:6px;"><span style="width:8px;height:8px;border-radius:999px;background:rgba(255,255,255,0.8);display:inline-block;"></span>Entorno</span>
          </div>
          <div style="position:absolute;inset:0;padding:10px;box-sizing:border-box;">${c}</div>
        </div>

        <div style="display:grid;gap:8px;align-content:start;">
          ${o.slice(0,3).map(({point:n,totalLocais:s,score:x})=>`
            <div style="padding:12px 12px;border-radius:12px;background:${M};border:1px solid ${h};border-left:3px solid ${f};">
              <div style="font-size:14px;line-height:1.2;font-weight:700;color:#fff;font-family:Poppins, system-ui, sans-serif;word-break:break-word;">${l(n.nome||"Ponto sem nome")}</div>
              <div style="margin-top:5px;font-size:12px;color:rgba(255,255,255,0.68);">${l(n.cidade||"-")} • ${l(V(n)||"-")}</div>
              <div style="margin-top:8px;display:flex;align-items:center;justify-content:space-between;gap:12px;">
                <div style="font-size:12px;color:rgba(255,255,255,0.62);">Locais relevantes</div>
                <div style="font-size:18px;font-weight:700;color:#fff;font-family:Poppins, system-ui, sans-serif;">${k(s)}</div>
              </div>
              <div style="margin-top:4px;font-size:32px;color:${f};font-weight:800;line-height:1;">${x.toFixed(1).replace(".",",")}</div>
            </div>
          `).join("")}
        </div>
      </div>

      <div style="display:grid;gap:8px;align-content:start;overflow:hidden;">
        ${o.slice(0,3).map(({point:n,totalLocais:s,score:x,places:u,summary:p})=>`
          <div style="padding:10px 12px;border-radius:12px;background:${M};border:1px solid ${h};display:grid;grid-template-columns:2fr 0.8fr 1.5fr;gap:10px;align-items:start;">
            <div>
              <div style="font-size:14px;line-height:1.2;font-weight:700;color:#fff;font-family:Poppins, system-ui, sans-serif;word-break:break-word;">${l(n.nome||"Ponto sem nome")}</div>
              <div style="margin-top:3px;font-size:12px;color:rgba(255,255,255,0.65);">${l(n.cidade||"-")} • ${l(V(n)||"-")}</div>
              <div style="margin-top:6px;font-size:11px;line-height:1.35;color:rgba(255,255,255,0.78);max-height:2.7em;overflow:hidden;">${l(p.summary)}</div>
            </div>
            <div>
              <div style="font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:rgba(255,255,255,0.5);">Locais / score</div>
              <div style="margin-top:6px;font-size:17px;line-height:1;font-weight:700;color:#fff;font-family:Poppins, system-ui, sans-serif;">${k(s)}</div>
              <div style="margin-top:4px;font-size:12px;color:${f};font-weight:700;">score ${x.toFixed(1).replace(".",",")}</div>
            </div>
            <div style="display:grid;gap:6px;">
              ${(u.length?u:["Sem locais próximos listados no cache atual."]).map(v=>`
                <div style="padding:6px 8px;border-radius:10px;background:rgba(0,0,0,0.18);border:1px solid rgba(255,255,255,0.06);font-size:10px;color:rgba(255,255,255,0.82);line-height:1.3;word-break:break-word;">${l(v)}</div>
              `).join("")}
            </div>
          </div>
        `).join("")}
      </div>
    </div>
  `,R)}async function ze(e=""){const t=K(e||""),i=t||"__default__";if(te.has(i))return te.get(i);const r=(async()=>{const a={logo:"/logo.png",logoLight:"/logo-light.png",logoHorizontal:"/logo-deitado.png",logo07:"/logo-07.png",heroBg:"/hero-bg.jpg",cityBg:"/city-bg.jpg",about1:"/about-1.jpg",about2:"/about-2.jpg",audience:"/audience.jpg",showcase:"/showcase.png",wallpaper:"/wallpaper.jpg",pattern:"/patterns/INTERMIDIA_PATTERN_ID.VISUAL_2024_INTERMIDIA_PATTERN_ID.VISUAL-4.png"};if(!t)return a;try{const d=await fetch(`/api/cidade-fotos/${encodeURIComponent(t)}`);if(!d.ok)return a;const o=await d.json();return o!=null&&o.imagem_url?{...a,cityBg:o.imagem_url}:a}catch{return a}})();return te.set(i,r),r}function et({proposalPoints:e,segmento:t,assets:i}){const r=G(t),a=e.map(o=>{var s,x;const c=Number((s=o==null?void 0:o.entornoMetrics)==null?void 0:s.score_relevancia)||0,n=Number((x=o==null?void 0:o.entornoMetrics)==null?void 0:x.total_estabelecimentos_relacionados)||0;return{nome:o.nome||"Ponto sem nome",cidade:o.cidade||"-",score:c,total:n}}).sort((o,c)=>c.score-o.score),d=Math.max(...a.map(o=>o.score),1);return B(`
    <div style="position:absolute;inset:0;background:${U};"></div>
    <div style="position:absolute;inset:0;background:linear-gradient(135deg,rgba(254,92,43,0.08) 0%,transparent 40%);"></div>
    <div style="position:relative;z-index:1;height:768px;max-height:768px;padding:52px 62px;box-sizing:border-box;display:flex;flex-direction:column;gap:24px;overflow:hidden;font-family:Poppins, system-ui, sans-serif;">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:16px;">
        <div style="display:flex;align-items:center;gap:16px;">
          <img src="${i.logoHorizontal||i.logo||""}" alt="" style="height:40px;width:auto;object-fit:contain;" />
          <div style="display:inline-flex;align-items:center;justify-content:center;height:38px;padding:0 18px;border-radius:100px;background:rgba(255,90,31,0.12);border:1px solid rgba(255,90,31,0.24);font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${f};">Score da campanha</div>
        </div>
        <div style="font-size:13px;letter-spacing:0.08em;text-transform:uppercase;color:rgba(255,255,255,0.5);">${l(r)}</div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
        <div style="padding:22px 26px;border-radius:12px;background:${M};border:1px solid ${h};">
          <div style="font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:rgba(255,255,255,0.5);">Pontos com score</div>
          <div style="margin-top:10px;font-size:42px;line-height:1;font-weight:700;color:#fff;font-family:Poppins, system-ui, sans-serif;">${a.filter(o=>o.score>0).length}</div>
        </div>
        <div style="padding:22px 26px;border-radius:24px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.08);">
          <div style="font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:rgba(255,255,255,0.5);">Score médio</div>
          <div style="margin-top:10px;font-size:64px;line-height:1;font-weight:800;color:${f};font-family:Poppins, system-ui, sans-serif;">${a.length?(a.reduce((o,c)=>o+c.score,0)/a.length).toFixed(1).replace(".",","):"0,0"}</div>
        </div>
      </div>

      <div style="flex:1;display:grid;gap:12px;align-content:start;overflow:hidden;">
        ${a.map(o=>{const c=Math.max(2,Math.round(o.score/d*100)),n=o.score>=7?Q:o.score>=4?"#fff":"rgba(255,255,255,0.45)";return`
            <div style="display:grid;grid-template-columns:minmax(0,2fr) 112px minmax(0,1.4fr);gap:14px;align-items:center;padding:16px 20px;border-radius:12px;background:${M};border:1px solid ${h};">
              <div>
                <div style="font-size:18px;font-weight:700;color:#fff;font-family:Poppins, system-ui, sans-serif;">${l(o.nome)}</div>
                <div style="margin-top:3px;font-size:13px;color:rgba(255,255,255,0.55);">${l(o.cidade)} · ${o.total} locais relevantes</div>
              </div>
              <div style="text-align:center;font-size:28px;font-weight:700;line-height:1;color:${o.score<=0?"rgba(255,255,255,0.25)":n};font-family:Poppins, system-ui, sans-serif;">${o.score.toFixed(1).replace(".",",")}</div>
              <div style="display:flex;align-items:center;height:8px;border-radius:100px;background:rgba(255,255,255,0.08);overflow:hidden;">
                <div style="height:100%;width:${c}%;border-radius:100px;background:${o.score>=6?f:"rgba(255,255,255,0.4)"};"></div>
              </div>
            </div>
          `}).join("")}
      </div>
    </div>
  `,R)}function tt({proposalPoints:e,segmento:t,proposalTotals:i,assets:r}){const a=G(t),d=e.filter(s=>{var x;return Number((x=s==null?void 0:s.entornoMetrics)==null?void 0:x.total_estabelecimentos_relacionados)>0}),o=Math.max(1,...e.map(s=>{var x;return Number((x=s==null?void 0:s.entornoMetrics)==null?void 0:x.score_relevancia)||0})),c=e.length?Math.round(d.length/e.length*100):0,n=e.reduce((s,x)=>{var u;return s+(Number((u=x==null?void 0:x.entornoMetrics)==null?void 0:u.total_estabelecimentos_relacionados)||0)},0);return B(`
    <div style="position:absolute;inset:0;background:${U};"></div>
    <div style="position:absolute;inset:0;background:linear-gradient(135deg,rgba(254,92,43,0.06) 0%,transparent 40%);"></div>
    <div style="position:relative;z-index:1;height:768px;max-height:768px;padding:52px 62px;box-sizing:border-box;display:flex;flex-direction:column;gap:24px;overflow:hidden;font-family:Poppins, system-ui, sans-serif;">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:16px;">
        <div style="display:flex;align-items:center;gap:16px;">
          <img src="${r.logoHorizontal||r.logo||""}" alt="" style="height:40px;width:auto;object-fit:contain;" />
          <div style="display:inline-flex;align-items:center;justify-content:center;height:38px;padding:0 18px;border-radius:100px;background:rgba(255,90,31,0.12);border:1px solid rgba(255,90,31,0.24);font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${f};">Cobertura e presença</div>
        </div>
        <div style="font-size:13px;letter-spacing:0.08em;text-transform:uppercase;color:rgba(255,255,255,0.5);">${l(a)}</div>
      </div>

      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:14px;">
        ${[{label:"Pontos na proposta",value:k(e.length)},{label:"Com entorno analisado",value:k(d.length)},{label:"Cobertura do segmento",value:`${c}%`},{label:"Total de locais mapeados",value:k(n)}].map(s=>`
          <div style="padding:22px 20px;border-radius:12px;background:${M};border:1px solid ${h};">
            <div style="font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${T};">${l(s.label)}</div>
            <div style="margin-top:10px;font-size:${s.label==="Cobertura do segmento"?"56px":"36px"};line-height:1;font-weight:800;color:${s.label==="Cobertura do segmento"?f:"#fff"};font-family:Poppins, system-ui, sans-serif;">${l(s.value)}</div>
          </div>
        `).join("")}
      </div>

      <div style="flex:1;display:grid;gap:12px;align-content:start;overflow:hidden;">
        <div style="font-size:13px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:rgba(255,255,255,0.5);padding-bottom:8px;border-bottom:1px solid rgba(255,255,255,0.08);">Presença por ponto</div>
        ${e.map(s=>{var m,P;const x=Number((m=s==null?void 0:s.entornoMetrics)==null?void 0:m.total_estabelecimentos_relacionados)||0,u=Number((P=s==null?void 0:s.entornoMetrics)==null?void 0:P.score_relevancia)||0,p=x>0,v=p?Math.max(2,Math.round(u/o*100)):0;return`
            <div style="display:grid;grid-template-columns:minmax(0,1.8fr) 88px 92px minmax(0,1.2fr);gap:14px;align-items:center;padding:14px 18px;border-radius:12px;background:${M};border:1px solid ${h};">
              <div>
                <div style="font-size:16px;font-weight:700;color:#fff;">${l(s.nome||"Ponto")}</div>
                <div style="margin-top:2px;font-size:12px;color:rgba(255,255,255,0.5);">${l(s.cidade||"-")} · ${l(V(s)||"-")}</div>
              </div>
              <div style="text-align:center;font-size:22px;font-weight:700;line-height:1;color:${p?"#fff":"rgba(255,255,255,0.3)"};font-family:Poppins;">${k(x)}</div>
              <div style="text-align:center;font-size:18px;font-weight:700;line-height:1;color:${u>=6?f:"rgba(255,255,255,0.4)"};font-family:Poppins;">${u.toFixed(1).replace(".",",")}</div>
              <div style="display:flex;align-items:center;height:8px;border-radius:100px;background:rgba(255,255,255,0.08);overflow:hidden;">
                <div style="height:100%;width:${v}%;border-radius:100px;background:${u>=6?f:"rgba(255,255,255,0.4)"};"></div>
              </div>
            </div>
          `}).join("")}
      </div>
    </div>
  `,R)}function it({proposalPoints:e,proposalTotals:t,pricingSummary:i,simulationSummary:r,segmento:a,proposalClient:d,proposalCity:o,publico:c,assets:n}){const s=G(a),x=e.length,u=(i==null?void 0:i.finalTotal)??(t==null?void 0:t.valorTotal)??0,p=(i==null?void 0:i.originalTotal)??u,v=(i==null?void 0:i.hasDiscount)&&(i==null?void 0:i.discountTotal)>0,m=(i==null?void 0:i.discountTotal)??0,P=Array.isArray(c)?c.filter(Boolean).join(", "):c||"—",$=Array.isArray(o)?o.join(", "):o||"—",z=e.map(b=>`
    <tr>
      <td style="padding:10px 14px;font-size:13px;font-weight:600;color:#fff;border-bottom:1px solid rgba(255,255,255,0.06);max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${l(b.nome||"Ponto")}</td>
      <td style="padding:10px 14px;font-size:12px;color:rgba(255,255,255,0.6);border-bottom:1px solid rgba(255,255,255,0.06);">${l(b.cidade||"—")}</td>
      <td style="padding:10px 14px;font-size:12px;color:rgba(255,255,255,0.6);border-bottom:1px solid rgba(255,255,255,0.06);">${l(V(b)||"—")}</td>
      <td style="padding:10px 14px;font-size:13px;font-weight:700;color:${f};border-bottom:1px solid rgba(255,255,255,0.06);text-align:right;white-space:nowrap;">${F(b.precoFinal??b.preco??0)}</td>
    </tr>
  `).join("");return B(`
    <div style="position:absolute;inset:0;background:${U};"></div>
    <div style="position:absolute;inset:0;background:linear-gradient(135deg,rgba(254,92,43,0.08) 0%,transparent 50%);"></div>
    <div style="position:relative;z-index:1;height:768px;max-height:768px;padding:42px 52px;box-sizing:border-box;display:flex;flex-direction:column;gap:18px;overflow:hidden;font-family:Poppins, system-ui, sans-serif;">

      <!-- Header -->
      <div style="display:flex;align-items:center;justify-content:space-between;gap:16px;">
        <div style="display:flex;align-items:center;gap:14px;">
          <img src="${n.logoHorizontal||n.logo||""}" alt="" style="height:36px;width:auto;object-fit:contain;" />
          <div style="display:inline-flex;align-items:center;justify-content:center;height:34px;padding:0 16px;border-radius:100px;background:rgba(255,90,31,0.12);border:1px solid rgba(255,90,31,0.24);font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${f};">Resumo da Proposta</div>
        </div>
        <div style="display:flex;align-items:center;gap:8px;">
          <div style="padding:6px 14px;border-radius:100px;background:${M};border:1px solid ${h};font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:rgba(255,255,255,0.5);">Pontos</div>
          <div style="padding:6px 14px;border-radius:100px;background:rgba(255,90,31,0.15);border:1px solid rgba(255,90,31,0.3);font-size:16px;font-weight:800;color:${f};font-family:Poppins, system-ui, sans-serif;">${x}</div>
        </div>
      </div>

      <!-- Summary cards -->
      <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:10px;">
        ${[{label:"Cliente",value:d||"—"},{label:"Cidades",value:$},{label:"Segmento",value:s},{label:"Públicos",value:P},{label:"Pontos",value:String(x)}].map(b=>`
          <div style="padding:14px 16px;border-radius:12px;background:${M};border:1px solid ${h};">
            <div style="font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:${f};">${l(b.label)}</div>
            <div style="margin-top:6px;font-size:14px;font-weight:600;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${l(b.value)}">${l(b.value)}</div>
          </div>
        `).join("")}
      </div>

      <!-- Points table header -->
      <div style="font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:rgba(255,255,255,0.45);border-bottom:2px solid ${f};padding-bottom:6px;">Pontos da campanha</div>

      <!-- Points table -->
      <div style="flex:1;overflow:hidden;border-radius:12px;background:${M};border:1px solid ${h};">
        <table style="width:100%;border-collapse:collapse;">
          <thead>
            <tr>
              <th style="padding:10px 14px;font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:rgba(255,255,255,0.4);text-align:left;border-bottom:1px solid rgba(255,255,255,0.1);">Ponto</th>
              <th style="padding:10px 14px;font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:rgba(255,255,255,0.4);text-align:left;border-bottom:1px solid rgba(255,255,255,0.1);">Cidade</th>
              <th style="padding:10px 14px;font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:rgba(255,255,255,0.4);text-align:left;border-bottom:1px solid rgba(255,255,255,0.1);">Tipo</th>
              <th style="padding:10px 14px;font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:rgba(255,255,255,0.4);text-align:right;border-bottom:1px solid rgba(255,255,255,0.1);">Valor</th>
            </tr>
          </thead>
          <tbody>
            ${z}
          </tbody>
        </table>
      </div>

      <!-- Total footer -->
      <div style="display:flex;align-items:center;justify-content:flex-end;gap:20px;padding:14px 20px;border-radius:12px;background:rgba(255,90,31,0.08);border:1px solid rgba(255,90,31,0.25);">
        ${v?`
          <div style="text-align:right;">
            <div style="font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:rgba(255,255,255,0.4);">Valor original</div>
            <div style="margin-top:4px;font-size:16px;font-weight:600;color:rgba(255,255,255,0.45);text-decoration:line-through;font-family:Poppins, system-ui, sans-serif;">${F(p)}</div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:rgba(255,255,255,0.4);">Desconto</div>
            <div style="margin-top:4px;font-size:16px;font-weight:600;color:#facc15;font-family:Poppins, system-ui, sans-serif;">-${F(m)}</div>
          </div>
        `:""}
        <div style="text-align:right;">
          <div style="font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:${f};">Total mensal</div>
          <div style="margin-top:4px;font-size:28px;font-weight:800;color:#fff;font-family:Poppins, system-ui, sans-serif;">${F(u)}</div>
        </div>
      </div>
    </div>
  `,R)}async function rt({praca:e,pracas:t,pontos:i}){oe=await ue();const r=e&&e!=="Todas as praças"?e:"Consolidado",a=Array.from(new Set((Array.isArray(t)?t:[]).map(m=>String(m||"").trim()).filter(Boolean))),d=Array.isArray(i)?i:[],o=De(d),c=await ze(r),n={cidade:r,totalTelas:o.telas,totalEnderecos:new Set(d.map(m=>`${m.cidade||""}-${m.endereco||""}`.trim())).size},s=d.map(m=>ye(m)),x=[Ve({cidade:r,pontos:d,resumo:o,assets:c,selectedCities:a}),buildMidiaKitManifestoPage({assets:c}),buildMidiaKitSummaryPage({cidade:r,pontos:d,assets:c})],u=d.reduce((m,P,$)=>{const z=V(P);return m[z]||(m[z]=[]),m[z].push({ponto:P,index:$}),m},{});Object.entries(u).sort(([m],[P])=>{const $=ce(m),z=ce(P);return je([$,z]).indexOf($)===0?-1:1}).forEach(([m,P])=>{const $=P.reduce((b,{ponto:y})=>b+(Number(y.telas)||0),0),z=new Set(P.map(({ponto:b})=>`${b.cidade||""}-${b.endereco||""}`.trim())).size;x.push(buildMidiaKitFormatDividerPage({tipo:m,formatStats:{telas:$,enderecos:z},cityStats:n,assets:c})),P.forEach(({ponto:b,index:y})=>{x.push(buildMidiaKitPointPage({ponto:b,index:y+1,total:d.length,image:s[y],assets:c}))})}),x.push(buildMidiaKitEndingPage({assets:c}));const p=`midia-kit-${K(r)}-${new Date().toISOString().slice(0,10)}.pdf`,v=Array.from(new Set([...Array.isArray(t)?t:[],...d.map(m=>m==null?void 0:m.cidade).filter(Boolean)].map(m=>K(m)).filter(Boolean)));await $e(x,p,{citySlugs:v})}async function nt({clientName:e,city:t,points:i,totals:r,segmento:a,strategicText:d,strategicTopics:o,strategicSubtitle:c,simulationSummary:n,pricingSummary:s,publico:x,pointMapImages:u=[],showMetricsMethodology:p=!0,showCampaignScore:v=!0,showCoverageLayer:m=!0,showImpactSection:P=!0}){oe=await ue();const $=Array.isArray(i)?i:[],z=r||{valorTotal:0,fluxoTotal:0,cpmEstimado:0,insercoesTotal:0},b=t||"Múltiplas praças",y=e||"Cliente não informado",C=ge(d,4),L=ge(o,6),I=$.some(A=>{var E;return Number((E=A==null?void 0:A.entornoMetrics)==null?void 0:E.total_estabelecimentos_relacionados)>0}),_=await ze(),X=await Promise.all($.map(async A=>Be(Oe(A)))),N=[Ge({proposalClient:y,proposalCity:b,proposalPoints:$,proposalTotals:z,pricingSummary:s,highlights:C,strategicTopics:L,strategicSubtitle:c,simulationSummary:n,segmento:a,assets:_,showMetricsMethodology:p})];p&&N.push(Ue({proposalPoints:$,proposalTotals:z,pricingSummary:s,segmento:a,assets:_})),$.forEach((A,E)=>{N.push(Xe({point:A,index:E+1,total:$.length,image:X[E],mapImage:u[E]||null,segmento:a,assets:_}))}),I&&N.push(Ze({proposalCity:b,proposalPoints:$,segmento:a,assets:_})),v&&N.push(et({proposalPoints:$,segmento:a,assets:_})),m&&I&&N.push(tt({proposalPoints:$,segmento:a,proposalTotals:z,assets:_})),P&&N.push(it({proposalPoints:$,proposalTotals:z,pricingSummary:s,simulationSummary:n,segmento:a,proposalClient:y,proposalCity:b,publico:x,assets:_}));const re=`proposta-${K(y)}-${new Date().toISOString().slice(0,10)}.pdf`,Z=Array.from(new Set($.map(A=>K((A==null?void 0:A.cidade)||b)).filter(Boolean)));await $e(N,re,{citySlugs:Z,noCache:!0})}export{ot as PDF_PAGE_SIZE,rt as generateMidiaKitPdf,nt as generateProposalPdf};
