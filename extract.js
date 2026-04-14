const fs = require('fs');
const path = 'src/lib/midiaKitPdf.js';
const text = fs.readFileSync(path, 'utf8');

const startStr = '<div style="display:flex;flex-direction:column;gap:8px;min-width:0;overflow:hidden;">';
const idxStart = text.indexOf(startStr);
if (idxStart === -1) { console.log('start error'); process.exit(1); }

const endStr = '</div>\n        </div>\n      </div>\n    `, PROPOSAL_BG);\n  }';
const idxEnd = text.indexOf(endStr, idxStart);
if (idxEnd === -1) {
  // Try CRLF
  const endStrCRLF = '</div>\r\n        </div>\r\n      </div>\r\n    `, PROPOSAL_BG);\r\n  }';
  const idxEndCRLF = text.indexOf(endStrCRLF, idxStart);
  if (idxEndCRLF === -1) {
      console.log('end error'); process.exit(1); 
  } else {
      fs.writeFileSync('old_layout.txt', text.substring(idxStart, idxEndCRLF), 'utf8');
      console.log('saved old CRLF');
  }
} else {
  fs.writeFileSync('old_layout.txt', text.substring(idxStart, idxEnd), 'utf8');
  console.log('saved old LF');
}
