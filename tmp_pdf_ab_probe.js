const https = require('https');
const zlib = require('zlib');

function postPdf(html, fileName){
  return new Promise((resolve,reject)=>{
    const data = JSON.stringify({ html, fileName, noCache: true });
    const req = https.request({
      hostname: 'midiakit.redeintermidia.com',
      path: '/api/pdf/render',
      method: 'POST',
      rejectUnauthorized: false,
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
    }, (res)=>{
      const chunks=[];
      res.on('data',c=>chunks.push(c));
      res.on('end',()=>{
        if(res.statusCode !== 200){
          return reject(new Error('status '+res.statusCode+' body='+Buffer.concat(chunks).toString('utf8')));
        }
        resolve(Buffer.concat(chunks));
      });
    });
    req.on('error',reject);
    req.write(data);
    req.end();
  });
}

function analyzeMaxX(pdfBuf){
  const sTok = Buffer.from('stream\n');
  const eTok = Buffer.from('\nendstream');
  let idx=0;
  let maxX = 0;
  let scaleX = 1;
  while(true){
    const s = pdfBuf.indexOf(sTok, idx);
    if(s<0) break;
    const e = pdfBuf.indexOf(eTok, s);
    if(e<0) break;
    const raw = pdfBuf.slice(s + sTok.length, e);
    let txt = '';
    try { txt = zlib.inflateSync(raw).toString('latin1'); }
    catch { txt = raw.toString('latin1'); }

    const cm = txt.match(/q\s+([0-9.\-]+)\s+0\s+0\s+([0-9.\-]+)\s+0\s+0\s+cm/);
    if(cm){
      scaleX = Number(cm[1]) || 1;
    }

    const reRegex = /([0-9.\-]+)\s+([0-9.\-]+)\s+([0-9.\-]+)\s+([0-9.\-]+)\s+re/g;
    let m;
    while((m = reRegex.exec(txt))){
      const x = Number(m[1]);
      const w = Number(m[3]);
      const right = (x + w) * scaleX;
      if(Number.isFinite(right) && right > maxX) maxX = right;
    }

    idx = e + eTok.length;
  }
  return maxX;
}

function buildHtml(wrapperStyle){
  return `<!doctype html><html><head><meta charset="utf-8"><style>
*{margin:0;padding:0;box-sizing:border-box;-webkit-print-color-adjust:exact!important;}
html,body{margin:0;padding:0;background:#fff;width:1366px;}body{margin:0 auto;}
@page{size:1366px 768px;margin:0;}
section{display:block;width:1366px !important;height:768px !important;overflow:hidden !important;margin:0 auto;page-break-after:always;break-after:page;}
section:last-child{page-break-after:avoid;break-after:avoid;}
</style></head><body>
<section>
  <div style="position:absolute;inset:0;background:#fff"></div>
  <div style="${wrapperStyle}">
    <div style="background:#f97316;border:2px solid #111"></div>
    <div style="background:#cbd5e1;border:2px solid #111"></div>
  </div>
</section>
</body></html>`;
}

(async()=>{
  const noWidthStyle = 'position:relative;z-index:1;display:grid;grid-template-columns:1.04fr 0.96fr;height:768px;max-height:768px;padding:58px 64px 50px;gap:22px;box-sizing:border-box;overflow:hidden;font-family:Poppins,system-ui,sans-serif;color:#1A1A2E;';
  const withWidthStyle = 'position:relative;z-index:1;width:100%;display:grid;grid-template-columns:1.04fr 0.96fr;height:768px;max-height:768px;padding:58px 64px 50px;gap:22px;box-sizing:border-box;overflow:hidden;font-family:Poppins,system-ui,sans-serif;color:#1A1A2E;';

  const pdfA = await postPdf(buildHtml(noWidthStyle), 'probe-no-width.pdf');
  const pdfB = await postPdf(buildHtml(withWidthStyle), 'probe-with-width.pdf');

  const maxXA = analyzeMaxX(pdfA);
  const maxXB = analyzeMaxX(pdfB);

  console.log('maxX noWidth  :', maxXA.toFixed(2));
  console.log('maxX withWidth:', maxXB.toFixed(2));
})();
