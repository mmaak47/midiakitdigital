const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'midiakit.db'));

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS pontos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    cidade TEXT NOT NULL,
    tipo TEXT NOT NULL,
    endereco TEXT,
    lat REAL,
    lng REAL,
    horario TEXT,
    fluxo INTEGER DEFAULT 0,
    insercoes INTEGER DEFAULT 0,
    tempo TEXT DEFAULT '15s',
    loop TEXT DEFAULT '3 min',
    veiculacao TEXT DEFAULT 'Vídeo sem áudio',
    publico TEXT DEFAULT 'A/B',
    telas INTEGER DEFAULT 1,
    preco REAL DEFAULT 0,
    descricao TEXT,
    imagem TEXT,
    arte_largura INTEGER DEFAULT 1920,
    arte_altura INTEGER DEFAULT 1080,
    ativo INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS admin_users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL
  )
`);

function ensureColumn(table, column, definition) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

ensureColumn('pontos', 'simulacao_tela', 'TEXT');
ensureColumn('pontos', 'simulacao_arte', 'TEXT');
ensureColumn('pontos', 'simulacao_preview', 'TEXT');
ensureColumn('pontos', 'arte_largura', 'INTEGER DEFAULT 1920');
ensureColumn('pontos', 'arte_altura', 'INTEGER DEFAULT 1080');

db.exec(`
  UPDATE pontos
  SET
    arte_largura = COALESCE(arte_largura, 1920),
    arte_altura = COALESCE(arte_altura, 1080)
`);

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_pontos_ativo_cidade_nome
  ON pontos (ativo, cidade, nome)
`);

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_pontos_ativo_tipo
  ON pontos (ativo, tipo)
`);

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_pontos_ativo_publico
  ON pontos (ativo, publico)
`);

// Seed data if empty
const count = db.prepare('SELECT COUNT(*) as c FROM pontos').get();
if (count.c === 0) {
  const insert = db.prepare(`
    INSERT INTO pontos (nome, cidade, tipo, endereco, lat, lng, horario, fluxo, insercoes, tempo, loop, veiculacao, publico, telas, preco, descricao)
    VALUES (@nome, @cidade, @tipo, @endereco, @lat, @lng, @horario, @fluxo, @insercoes, @tempo, @loop, @veiculacao, @publico, @telas, @preco, @descricao)
  `);

  const defaults = (p, tipo, cidade) => ({
    cidade,
    tipo,
    endereco: p.endereco,
    lat: p.lat,
    lng: p.lng,
    horario: tipo.includes('LED') || tipo === 'Frontlight' || tipo === 'Backlight' ? '24 horas' : '06:00 às 22:00',
    fluxo: typeof p.fluxo === 'number' ? p.fluxo : (parseInt(String(p.fluxo).replace(/\./g, '')) || 0),
    insercoes: p.insercoes || Math.round((typeof p.fluxo === 'number' ? p.fluxo : (parseInt(String(p.fluxo).replace(/\./g, '')) || 0)) * 0.64),
    tempo: '15s',
    loop: '3 min',
    veiculacao: tipo === 'Backlight' || tipo === 'Frontlight' ? 'Impressão em tecido' : 'Vídeo sem áudio',
    publico: p.publico || 'A/B',
    telas: p.faces || 1,
    preco: p.valor,
    descricao: p.detalhes || null,
  });

  const seed = [
    // ==================== LONDRINA - Elevadores ====================
    { nome: 'Ed. GENÉVE', ...defaults({ endereco: 'R. Ernâni Lacerda de Athayde, 350', faces: 2, fluxo: 30000, insercoes: 19200, lat: -23.329950, lng: -51.178355, valor: 900, publico: 'A/B+', detalhes: '1 tela vertical de 24" em cada elevador (2 Elevadores) - Comercial' }, 'Elevador', 'Londrina') },
    { nome: 'PALHANO PREMIUM', ...defaults({ endereco: 'Av. Madre Leônia Milito, 1377', faces: 7, fluxo: 42000, insercoes: 54600, lat: -23.335177, lng: -51.176956, valor: 800, publico: 'A/B', detalhes: '1 tela vertical de 24" em cada elevador (7 Elevadores) - Comercial' }, 'Elevador', 'Londrina') },
    { nome: 'PALHANO BUSINESS T.1', ...defaults({ endereco: 'Av. Ayrton Senna da Silva, 300', faces: 4, fluxo: 39000, insercoes: 38400, lat: -23.327921, lng: -51.177470, valor: 800, publico: 'A/B', detalhes: '1 tela vertical de 24" em cada elevador (4 Elevadores) - Comercial' }, 'Elevador', 'Londrina') },
    { nome: 'PALHANO BUSINESS T.2', ...defaults({ endereco: 'Av. Ayrton Senna da Silva, 200', faces: 4, fluxo: 38000, insercoes: 38400, lat: -23.327174, lng: -51.177533, valor: 800, publico: 'A/B', detalhes: '1 tela vertical de 24" em cada elevador (4 Elevadores) - Comercial' }, 'Elevador', 'Londrina') },
    { nome: 'COMERCIAL SENADOR', ...defaults({ endereco: 'Rua Senador Souza Naves, 771', faces: 1, fluxo: 30000, lat: -23.319087, lng: -51.157303, valor: 750, publico: 'A/B', detalhes: '1 tela vertical 24" - Comercial' }, 'Elevador', 'Londrina') },
    { nome: 'Ed. MORADA SHANGRI-LÁ', ...defaults({ endereco: 'R. Euclides da Cunha, 530', faces: 1, fluxo: 14300, insercoes: 14600, lat: -23.298852, lng: -51.180159, valor: 700, publico: 'A/B', detalhes: '1 tela vertical de 24" - Residencial' }, 'Elevador', 'Londrina') },
    { nome: 'DUQUE HALL', ...defaults({ endereco: 'Av. Duque de Caxias, 1726', faces: 2, fluxo: 30000, insercoes: 19200, lat: -23.326553, lng: -51.154402, valor: 800, publico: 'A/B', detalhes: '1 tela vertical de 24" em cada elevador (2 Elevadores) - Residencial' }, 'Elevador', 'Londrina') },
    { nome: 'DUETTO RESIDENCE', ...defaults({ endereco: 'R. dos Coqueiros, 305A - Morumbi', faces: 3, fluxo: 17100, insercoes: 43800, lat: -23.315208, lng: -51.139191, valor: 800, publico: 'A/B', detalhes: '1 tela vertical de 24" em cada elevador (3 Elevadores) - Residencial' }, 'Elevador', 'Londrina') },
    { nome: 'Ed. NYC PALHANO', ...defaults({ endereco: 'R. Caracas, 1255', faces: 4, fluxo: 17100, insercoes: 57600, lat: -23.332475, lng: -51.182589, valor: 800, publico: 'A/B', detalhes: '1 tela vertical de 24" em cada elevador (4 Elevadores) - Residencial' }, 'Elevador', 'Londrina') },
    { nome: 'GARDEN PALHANO', ...defaults({ endereco: 'R. Ulrico Zuinglio, 500', faces: 6, fluxo: 45000, insercoes: 57600, lat: -23.333580, lng: -51.182876, valor: 900, publico: 'A/B', detalhes: '1 tela vertical de 24" em cada elevador (6 Elevadores) - Residencial' }, 'Elevador', 'Londrina') },
    { nome: 'Ed. BRISAS ALTO DO ARAXÁ', ...defaults({ endereco: 'Av. Voluntários da Pátria, 888 - Jardim Andrade', faces: 3, fluxo: 27300, insercoes: 43200, lat: -23.306650, lng: -51.180307, valor: 800, publico: 'A/B', detalhes: '1 tela vertical de 24" em cada elevador (3 Elevadores)' }, 'Elevador', 'Londrina') },
    { nome: 'Ed. STUDIO D', ...defaults({ endereco: 'R. Pio XII, 626 - Jardins - Centro', faces: 2, fluxo: 8000, insercoes: 28800, lat: -23.311963, lng: -51.167510, valor: 800, publico: 'A/B', detalhes: '1 tela vertical de 24" em cada elevador (2 Elevadores)' }, 'Elevador', 'Londrina') },
    { nome: 'Ed. PIONEIROS DO CAFÉ', ...defaults({ endereco: 'Av. Higienópolis, 1100 - Jardim Higienopolis', faces: 2, fluxo: 17100, insercoes: 28800, lat: -23.319406, lng: -51.166336, valor: 800, publico: 'A/B', detalhes: '1 tela vertical de 24" em cada elevador (2 Elevadores)' }, 'Elevador', 'Londrina') },
    { nome: 'Ed. FIT TERRA BONITA', ...defaults({ endereco: 'R. Luís Lerco, 209 - Jardim Terra Bonita', faces: 8, fluxo: 39500, insercoes: 115200, lat: -23.346651, lng: -51.181229, valor: 800, publico: 'A/B', detalhes: '1 tela vertical de 24" em cada elevador (8 Elevadores)' }, 'Elevador', 'Londrina') },
    { nome: 'Ed. PALHANO RESIDENCE', ...defaults({ endereco: 'Rua Antonio Pisicchio, 100 - Guanabara', faces: 2, fluxo: 19500, insercoes: 28800, lat: -23.333811, lng: -51.175878, valor: 800, publico: 'A/B', detalhes: '1 tela vertical de 24" em cada elevador (2 Elevadores)' }, 'Elevador', 'Londrina') },
    { nome: 'Ed. PREMIATTO RESIDENCE', ...defaults({ endereco: 'Rua Eurico Hummig, 300 - Palhano 1', faces: 3, fluxo: 28100, insercoes: 43200, lat: -23.332514, lng: -51.179353, valor: 800, publico: 'A/B+', detalhes: '1 tela vertical de 24" em cada elevador (3 Elevadores)' }, 'Elevador', 'Londrina') },
    { nome: 'Ed. MAISON TUSCANY', ...defaults({ endereco: 'Rua Eurico Hummig, 89 - Palhano 1', faces: 4, fluxo: 32600, insercoes: 54600, lat: -23.335065, lng: -51.179724, valor: 800, publico: 'A/B', detalhes: '1 tela vertical de 24" em cada elevador (4 Elevadores)' }, 'Elevador', 'Londrina') },
    { nome: 'Ed. TERRANOBLE', ...defaults({ endereco: 'R. Silvio Pegoraro, 599 - Petrópolis', faces: 2, fluxo: 25200, insercoes: 28800, lat: -23.333534, lng: -51.153719, valor: 800, publico: 'A/B', detalhes: '1 tela vertical de 24" em cada elevador (2 Elevadores)' }, 'Elevador', 'Londrina') },
    { nome: 'Ed. TORRE SANTORINI', ...defaults({ endereco: 'R. Frederico Balan, 80 - Inglaterra', faces: 3, fluxo: 26300, insercoes: 43200, lat: -23.349717, lng: -51.150007, valor: 800, publico: 'A/B', detalhes: '1 tela vertical de 24" em cada elevador (3 Elevadores)' }, 'Elevador', 'Londrina') },

    // ==================== LONDRINA - Tela Indoor ====================
    { nome: 'STRASSBERG', ...defaults({ endereco: 'Rod. Celso Garcia Cid, PR-323', faces: 2, fluxo: 26000, insercoes: 16200, lat: -23.184952, lng: -51.193214, valor: 980, publico: 'A/B+', detalhes: '2 telas verticais 55"' }, 'Tela Indoor', 'Londrina') },
    { nome: 'HACHIMITSU JK', ...defaults({ endereco: 'Av. Juscelino Kubitschek, 3216', faces: 2, fluxo: 10400, insercoes: 9900, lat: -23.320053, lng: -51.157305, valor: 1090, publico: 'A/B+', detalhes: '2 telas verticais 55"' }, 'Tela Indoor', 'Londrina') },
    { nome: 'HACHIMITSU ALAMEDA JARDINO', ...defaults({ endereco: 'Alameda Jardino / R. João Wyclif, 500', faces: 2, fluxo: 10400, insercoes: 11700, lat: -23.330302, lng: -51.174233, valor: 1190, publico: 'A/B+', detalhes: '2 telas verticais 46"' }, 'Tela Indoor', 'Londrina') },
    { nome: 'HACHIMITSU BELA SUÍÇA', ...defaults({ endereco: 'Rua Assunção, 331', faces: 1, fluxo: 10400, insercoes: 5460, lat: -23.333709, lng: -51.166728, valor: 1090, publico: 'A/B+', detalhes: '1 tela vertical 46"' }, 'Tela Indoor', 'Londrina') },
    { nome: "ARNALDO'S", ...defaults({ endereco: 'Av. Maringá, 430', faces: 2, fluxo: 19700, insercoes: 3520, lat: -23.305070, lng: -51.178832, valor: 800, publico: 'A/B', detalhes: '2 telas verticais 24"' }, 'Tela Indoor', 'Londrina') },
    { nome: 'FRUTTARIA ALPHAVILLE', ...defaults({ endereco: 'Rua das Palmeiras, 88', faces: 1, fluxo: 9800, insercoes: 11440, lat: -23.348083, lng: -51.189826, valor: 900, publico: 'A/B+', detalhes: '1 tela vertical 46"' }, 'Tela Indoor', 'Londrina') },
    { nome: 'POSTO ALPHA (Tela Conveniência)', ...defaults({ endereco: 'Rod. Mabio Gonçalves Palhano, 1377', faces: 1, fluxo: 36000, insercoes: 9600, lat: -23.349884, lng: -51.190534, valor: 900, publico: 'A/B', detalhes: '1 tela vertical 46"' }, 'Tela Indoor', 'Londrina') },
    { nome: 'O CASARÃO', ...defaults({ endereco: 'Av. Maringá, 899', faces: 3, fluxo: 33000, insercoes: 7200, lat: -23.309448, lng: -51.177831, valor: 1900, publico: 'A/B', detalhes: '1 Vídeo Wall com 3 Telas de 49"' }, 'Tela Indoor', 'Londrina') },
    { nome: 'PANETTERIA PALHANO', ...defaults({ endereco: 'Av. Ayrton Senna da Silva, 740', faces: 6, fluxo: 15900, insercoes: 7940, lat: -23.332850, lng: -51.177733, valor: 2100, publico: 'A/B', detalhes: 'Video Wall com 6 telas horizontais de 49"' }, 'Tela Indoor', 'Londrina') },
    { nome: 'LDN GRILL', ...defaults({ endereco: 'Av. Higienópolis, 964 - Centro', faces: 4, fluxo: 18200, insercoes: 21600, lat: -23.318397, lng: -51.165858, valor: 900, publico: 'A/B', detalhes: 'Vídeo Wall com 4 telas horizontais de 36"' }, 'Tela Indoor', 'Londrina') },
    { nome: 'LAB. OSWALDO CRUZ (Gleba)', ...defaults({ endereco: 'Av. Ayrton Senna da Silva, 850 - Palhano 1', faces: 1, fluxo: 65900, insercoes: 7940, lat: -23.334457, lng: -51.177949, valor: 1600, publico: 'A/B', detalhes: '1 tela vertical de 24"' }, 'Tela Indoor', 'Londrina') },
    { nome: 'LAB. OSWALDO CRUZ (Saul Elkind)', ...defaults({ endereco: 'Av. Saul Elkind, 2195 - Zona Norte', faces: 1, fluxo: 41600, insercoes: 7940, lat: -23.259354, lng: -51.159562, valor: 1200, publico: 'B/C+', detalhes: '1 tela vertical de 24"' }, 'Tela Indoor', 'Londrina') },
    { nome: 'LAB. OSWALDO CRUZ (Souza Naves)', ...defaults({ endereco: 'R. Sen. Souza Naves, 1000 - Centro', faces: 1, fluxo: 170800, insercoes: 7940, lat: -23.321322, lng: -51.157795, valor: 1600, publico: 'A/B', detalhes: '1 tela vertical de 24"' }, 'Tela Indoor', 'Londrina') },
    { nome: 'MERKAVA CLUBE DE TIRO', ...defaults({ endereco: 'R. Ronald Tkotz, 3377 - Jardim Taroba, Cambé', faces: 1, fluxo: 28900, insercoes: 6250, lat: -23.290131, lng: -51.262408, valor: 500, publico: 'A/B+', detalhes: '1 tela vertical de 24"' }, 'Tela Indoor', 'Londrina') },
    { nome: 'UNIORTE PRIME', ...defaults({ endereco: 'R. Valparaíso, 36 - Guanabara', faces: 1, fluxo: 44200, insercoes: 7940, lat: -23.333189, lng: -51.168363, valor: 800, publico: 'A/B', detalhes: '1 tela vertical de 24"' }, 'Tela Indoor', 'Londrina') },
    { nome: 'HOSPITAL UNIORTE', ...defaults({ endereco: 'Av. Higienópolis, 2600 - Jardim do Lago', faces: 1, fluxo: 141800, insercoes: 7940, lat: -23.332691, lng: -51.167987, valor: 1600, publico: 'A/B', detalhes: '1 tela vertical de 24"' }, 'Tela Indoor', 'Londrina') },
    { nome: 'UNIORTE FISIO', ...defaults({ endereco: 'Av. Higienópolis, 2554 - Guanabara', faces: 1, fluxo: 22800, insercoes: 7940, lat: -23.332392, lng: -51.167996, valor: 800, publico: 'A/B', detalhes: '1 tela vertical de 24"' }, 'Tela Indoor', 'Londrina') },

    // ==================== LONDRINA - Painel LED ====================
    { nome: 'POSTO IPIRANGA (TIRADENTES)', ...defaults({ endereco: 'Av. Tiradentes, 1592', faces: 3, fluxo: 1920000, insercoes: 45900, lat: -23.298833, lng: -51.190554, valor: 3500, publico: 'A/B/C', detalhes: 'Painel Tripla Face com 3 telas de Led P3.9, 2.50m x 7m cada' }, 'Painel LED', 'Londrina') },
    { nome: 'POSTO MEDITERRÂNEO', ...defaults({ endereco: 'Av. Harry Prochet, 369', faces: 3, fluxo: 1560000, insercoes: 45900, lat: -23.342033, lng: -51.158712, valor: 3000, publico: 'A/B/C', detalhes: 'Painel Tripla Face com 3 telas de Led P3.9, 2m x 4m cada' }, 'Painel LED', 'Londrina') },
    { nome: 'POSTO ALPHA (LED)', ...defaults({ endereco: 'Rod. Mabio Gonçalves Palhano, 1377', faces: 1, fluxo: 910000, insercoes: 15300, lat: -23.349884, lng: -51.190534, valor: 3500, publico: 'A/B+', detalhes: '1 Tela de Led P3.9, 3m x 7m' }, 'Painel LED', 'Londrina') },
    { nome: 'POSTO GASTECH', ...defaults({ endereco: 'Av. Winston Churchill - Andes', faces: 1, fluxo: 1092000, insercoes: 15300, lat: -23.291945, lng: -51.173083, valor: 3000, publico: 'A/B', detalhes: '1 Tela de Led P3.9, 3m x 7m' }, 'Painel LED', 'Londrina') },

    // ==================== LONDRINA - Backlight ====================
    { nome: 'WALDEMAR SPRANGER', ...defaults({ endereco: 'Rua Waldemar Spranger - Posto Shell', faces: 1, fluxo: 9400, lat: -23.3150, lng: -51.1650, valor: 5600, publico: 'A/B' }, 'Backlight', 'Londrina') },
    { nome: 'GIL DE ABREU E SOUZA', ...defaults({ endereco: 'Rua Gil de Abreu, 243', faces: 1, fluxo: 14000, lat: -23.3120, lng: -51.1580, valor: 5600, publico: 'A/B' }, 'Backlight', 'Londrina') },
    { nome: 'PANETTERIA PALHANO (Backlight)', ...defaults({ endereco: 'Av. Ayrton Senna da Silva, 740', faces: 1, fluxo: 15000, lat: -23.3312, lng: -51.1763, valor: 5600, publico: 'A/B' }, 'Backlight', 'Londrina') },
    { nome: 'BAR VALENTINO', ...defaults({ endereco: 'Av. Prefeito Faria Lima, 486', faces: 1, fluxo: 23000, lat: -23.3200, lng: -51.1720, valor: 5500, publico: 'A/B' }, 'Backlight', 'Londrina') },
    { nome: 'BENTO MUNHOZ', ...defaults({ endereco: 'Rua Bento Munhoz, 812', faces: 1, fluxo: 19000, lat: -23.3075, lng: -51.1555, valor: 5400, publico: 'A/B' }, 'Backlight', 'Londrina') },

    // ==================== LONDRINA - Frontlight ====================
    { nome: 'ROD. CELSO GARCIA CID', ...defaults({ endereco: 'Rod. Celso Garcia Cid, KM 378', faces: 1, fluxo: 26000, lat: -23.2870, lng: -51.1150, valor: 5500, publico: 'A/B/C' }, 'Frontlight', 'Londrina') },
    { nome: 'JOAQUIM DE MATOS BARRETO', ...defaults({ endereco: 'Rua Joaquim de Matos Barreto, 990', faces: 1, fluxo: 18000, lat: -23.3025, lng: -51.1480, valor: 5500, publico: 'A/B' }, 'Frontlight', 'Londrina') },
    { nome: 'STRASSBERG (Frontlight)', ...defaults({ endereco: 'Rodovia Celso Garcia Cid PR 323', faces: 2, fluxo: 18000, lat: -23.2855, lng: -51.1125, valor: 3800, publico: 'A/B/C' }, 'Frontlight', 'Londrina') },

    // ==================== LONDRINA - Totem Digital ====================
    { nome: 'TOTEM LED CABA MALL', ...defaults({ endereco: 'Rod. Mabio Gonçalves Palhano, 200', faces: 1, fluxo: 0, lat: -23.3598, lng: -51.1974, valor: 1200, publico: 'A/B' }, 'Totem Digital', 'Londrina') },

    // ==================== LONDRINA - Circuito Muffato ====================
    { nome: 'VIDEOWALL MUFFATO MADRE', ...defaults({ endereco: 'Av. Me. Leônia Milito, 1175', faces: 1, fluxo: 0, lat: -23.3348, lng: -51.1738, valor: 1200, publico: 'A/B/C' }, 'Circuito Muffato', 'Londrina') },
    { nome: 'TOTEM DIGITAL MUFFATO DUQUE', ...defaults({ endereco: 'Av. Duque de Caxias, 1200', faces: 1, fluxo: 0, lat: -23.3268, lng: -51.1546, valor: 1200, publico: 'A/B/C' }, 'Circuito Muffato', 'Londrina') },
    { nome: 'VIDEOWALL MUFFATO AEROPORTO', ...defaults({ endereco: 'Av. Robert Koch, 20', faces: 1, fluxo: 0, lat: -23.3045, lng: -51.1550, valor: 1200, publico: 'A/B/C' }, 'Circuito Muffato', 'Londrina') },
    { nome: 'TOTEM DIGITAL MUFFATO SAUL ELKIND', ...defaults({ endereco: 'Av. Saul Elkind, 2177', faces: 1, fluxo: 0, lat: -23.2600, lng: -51.1588, valor: 1200, publico: 'B/C' }, 'Circuito Muffato', 'Londrina') },
    { nome: 'TOTEM DIGITAL MUFFATO CAFEZAL', ...defaults({ endereco: 'Av. Pres. Euríco Gáspar Dutra, 55', faces: 1, fluxo: 0, lat: -23.3655, lng: -51.1521, valor: 1200, publico: 'A/B/C' }, 'Circuito Muffato', 'Londrina') },
    { nome: 'TOTEM DIGITAL MUFFATO IBIPORÃ', ...defaults({ endereco: 'R. Ronat Valter Sodré, 300 - Ibiporã', faces: 1, fluxo: 0, lat: -23.2690, lng: -51.0480, valor: 1200, publico: 'A/B/C' }, 'Circuito Muffato', 'Londrina') },
    { nome: 'TOTEM MUFFATO CAMBÉ', ...defaults({ endereco: 'R. Carlos Sawade, 408 - Cambé', faces: 1, fluxo: 0, lat: -23.2770, lng: -51.2702, valor: 1200, publico: 'A/B/C' }, 'Circuito Muffato', 'Londrina') },

    // ==================== LONDRINA - LED Posto ====================
    { nome: 'POSTO IPIRANGA LESTE OESTE', ...defaults({ endereco: 'R. Maranhão, 703', faces: 1, fluxo: 0, lat: -23.3100, lng: -51.1670, valor: 2000, publico: 'A/B/C' }, 'LED Posto', 'Londrina') },
    { nome: 'POSTO IPIRANGA SUN LAKE', ...defaults({ endereco: 'R. Alcides Turini, 200', faces: 1, fluxo: 0, lat: -23.3656, lng: -51.2074, valor: 2000, publico: 'A/B' }, 'LED Posto', 'Londrina') },
    { nome: 'POSTO BR VIA EXPRESSA', ...defaults({ endereco: 'Av. Dez de Dezembro, 7340', faces: 1, fluxo: 0, lat: -23.3105, lng: -51.1489, valor: 2000, publico: 'A/B/C' }, 'LED Posto', 'Londrina') },
    { nome: 'POSTO IPIRANGA QUINTINO', ...defaults({ endereco: 'R. Quintino Bocaiúva, 460', faces: 1, fluxo: 0, lat: -23.3074, lng: -51.1664, valor: 2000, publico: 'A/B/C' }, 'LED Posto', 'Londrina') },
    { nome: 'POSTO IPIRANGA AV MARINGÁ', ...defaults({ endereco: 'Av. Maringá, 346', faces: 1, fluxo: 0, lat: -23.3188, lng: -51.1766, valor: 2000, publico: 'A/B' }, 'LED Posto', 'Londrina') },
    { nome: 'POSTO IPIRANGA TIRADENTES X RIO BRANCO', ...defaults({ endereco: 'Av. Rio Branco, 50', faces: 1, fluxo: 0, lat: -23.2989, lng: -51.1914, valor: 2000, publico: 'A/B/C' }, 'LED Posto', 'Londrina') },

    // ==================== MARINGÁ - Tela Indoor / Video Wall ====================
    { nome: 'BOTECO DO NECO', ...defaults({ endereco: 'Av. Tiradentes, 133 - Zona II', faces: 2, fluxo: 10400, insercoes: 6396, lat: -23.425909, lng: -51.934398, valor: 1000, publico: 'A', detalhes: '1 Vídeo Wall Vertical com 2 Telas de 46" - Comercial' }, 'Video Wall', 'Maringá') },
    { nome: 'SR. ZANONI', ...defaults({ endereco: 'R. José do Patrocínio, 673 - Zona 04', faces: 2, fluxo: 39100, insercoes: 6396, lat: -23.429903, lng: -51.951912, valor: 1500, publico: 'A/B/C', detalhes: '1 Vídeo Wall Horizontal com 2 telas de 49" - Comercial' }, 'Video Wall', 'Maringá') },
    { nome: 'HACHIMITSU MARINGÁ', ...defaults({ endereco: 'Av. São Paulo, 1700 - Zona 02', faces: 2, fluxo: 10400, insercoes: 14400, lat: -23.428051, lng: -51.932893, valor: 1100, publico: 'A', detalhes: '2 Telas Verticais de 55"' }, 'Tela Indoor', 'Maringá') },

    // ==================== MARINGÁ - Totem Digital ====================
    { nome: 'MERCADÃO FRATELLO', ...defaults({ endereco: 'Av. Herval, 969', faces: 2, fluxo: 33000, lat: -23.4150, lng: -51.9280, valor: 1210, publico: 'A/B/C' }, 'Totem Digital', 'Maringá') },
    { nome: 'MERCADÃO DE MARINGÁ', ...defaults({ endereco: 'Av. Prudente de Morais, 601', faces: 2, fluxo: 33000, lat: -23.4205, lng: -51.9330, valor: 1540, publico: 'A/B/C' }, 'Video Wall', 'Maringá') },

    // ==================== MARINGÁ - Elevadores ====================
    { nome: 'MAISON LUMINI', ...defaults({ endereco: 'Av. Laguna, 733 - Zona 01', faces: 4, fluxo: 10500, insercoes: 38400, lat: -23.427848, lng: -51.926985, valor: 990, publico: 'A/B', detalhes: '1 tela vertical de 24" em cada elevador (2 Elevadores em cada torre)' }, 'Elevador', 'Maringá') },
    { nome: 'MAISON MONTALCINO', ...defaults({ endereco: 'Av. Guedner, 683 - Zona 08', faces: 2, fluxo: 8500, insercoes: 19200, lat: -23.436095, lng: -51.913316, valor: 990, publico: 'A', detalhes: '1 tela vertical de 24" em cada elevador (2 Elevadores)' }, 'Elevador', 'Maringá') },
    { nome: 'MAISON PORTO FINO', ...defaults({ endereco: 'Av. Guedner, 891 - Zona 08', faces: 2, fluxo: 8400, insercoes: 19200, lat: -23.437976, lng: -51.913640, valor: 990, publico: 'A/B', detalhes: '1 tela vertical de 24" em cada elevador (2 Elevadores)' }, 'Elevador', 'Maringá') },
    { nome: 'NEW TOWER PLAZA (Torre 1)', ...defaults({ endereco: 'Av. Duque de Caxias, 882 - Zona 7', faces: 13, fluxo: 30000, insercoes: 67200, lat: -23.417872, lng: -51.939325, valor: 1540, publico: 'A/B', detalhes: '9 Telas verticais de 24" + 4 Panorâmicos' }, 'Elevador', 'Maringá') },
    { nome: 'NEW TOWER PLAZA (Torre 2)', ...defaults({ endereco: 'Av. Duque de Caxias, 882 - Zona 7', faces: 13, fluxo: 30000, insercoes: 67200, lat: -23.417872, lng: -51.939325, valor: 1540, publico: 'A/B', detalhes: '9 Telas verticais de 24" + 4 Panorâmicos' }, 'Elevador', 'Maringá') },
    { nome: 'Ed. MARCELINO CHAMPAGNAT', ...defaults({ endereco: 'Av. Itororó, 1109 - Zona 02', faces: 1, fluxo: 8500, insercoes: 9600, lat: -23.436905, lng: -51.939136, valor: 800, publico: 'A/B', detalhes: '1 tela vertical de 24"' }, 'Elevador', 'Maringá') },
    { nome: 'NYC MARINGÁ', ...defaults({ endereco: 'Av. Londrina, 1768 - Zona 08', faces: 2, fluxo: 8500, insercoes: 19200, lat: -23.444546, lng: -51.913475, valor: 800, publico: 'A/B', detalhes: '1 tela vertical de 24" em cada elevador (2 Elevadores)' }, 'Elevador', 'Maringá') },
    { nome: 'Ed. SOLAR DO BOSQUE', ...defaults({ endereco: 'R. Monsenhor Kimura, 445 - Vila Cleopatra', faces: 1, fluxo: 7500, insercoes: 9600, lat: -23.438543, lng: -51.938198, valor: 700, publico: 'A/B', detalhes: '1 tela vertical de 24"' }, 'Elevador', 'Maringá') },
    { nome: 'IMPERIUM RESIDENCE', ...defaults({ endereco: 'Av. Dr. Alexandre Rasgulaeff, 3342 - Parque Res. Cidade Nova', faces: 1, fluxo: 8500, insercoes: 9600, lat: -23.398647, lng: -51.927864, valor: 800, publico: 'A/B', detalhes: '1 tela vertical de 24"' }, 'Elevador', 'Maringá') },
    { nome: 'SPAZIO MISATO', ...defaults({ endereco: 'Av. Pioneiro Antônio Ruíz Saldanha, 1826 - Jardim das Estações', faces: 3, fluxo: 8500, insercoes: 28800, lat: -23.446007, lng: -51.979927, valor: 800, publico: 'A/B', detalhes: '1 tela vertical de 24" em cada elevador (3 Elevadores)' }, 'Elevador', 'Maringá') },
    { nome: 'RESIDENCIAL ALTA FLORESTA', ...defaults({ endereco: 'R. Mal. Floriano Peixoto, 644 - Zona 7', faces: 1, fluxo: 7000, insercoes: 9600, lat: -23.416043, lng: -51.927413, valor: 700, publico: 'A/B', detalhes: '1 tela vertical de 24"' }, 'Elevador', 'Maringá') },
    { nome: 'Ed. TORRE ALVOREAR', ...defaults({ endereco: 'R. Vítor do Amaral, 776 - Jardim Alvorada', faces: 1, fluxo: 8500, insercoes: 9600, lat: -23.389875, lng: -51.910935, valor: 800, publico: 'A/B', detalhes: '1 tela vertical de 24"' }, 'Elevador', 'Maringá') },

    // ==================== MARINGÁ - Backlight ====================
    { nome: 'AEROPORTO DE MARINGÁ', ...defaults({ endereco: 'Av. Dr. Vladimir Babkov, SN', faces: 2, fluxo: 180000, lat: -23.480501, lng: -52.008384, valor: 8000, publico: 'A/B', detalhes: 'Painel backlight dupla face 15m x 2,5m. 73.000 veículos/mês' }, 'Backlight', 'Maringá') },

    // ==================== BALNEÁRIO CAMBORIÚ - Tela Indoor ====================
    { nome: 'BIG WHEEL - Cabines', ...defaults({ endereco: 'Av. Estrada Da Rainha, 1009 - Pioneiros', faces: 36, fluxo: 42500, insercoes: 336960, lat: -26.971020, lng: -48.631869, valor: 4900, publico: 'A/B', detalhes: '1 tela horizontal de 24" em cada cabine (36 Cabines)' }, 'Tela Indoor', 'Balneário Camboriú') },
    { nome: 'BIG WHEEL - Painel Bilheteria', ...defaults({ endereco: 'Av. Estrada Da Rainha, 1009 - Pioneiros', faces: 1, fluxo: 62350, insercoes: 9360, lat: -26.971020, lng: -48.631869, valor: 3500, publico: 'A/B', detalhes: '1 tela horizontal de aproximadamente 239"' }, 'Tela Indoor', 'Balneário Camboriú') },
    { nome: 'CAFETERIA DA PRAÇA', ...defaults({ endereco: '3ª Avenida, 1401 - Centro', faces: 1, fluxo: 18000, insercoes: 8580, lat: -26.998480, lng: -48.631959, valor: 820, publico: 'A/B', detalhes: '1 tela vertical de 55"' }, 'Tela Indoor', 'Balneário Camboriú') },

    // ==================== BALNEÁRIO CAMBORIÚ - Backlight ====================
    { nome: 'MARTIN LUTHER - Painel 1', ...defaults({ endereco: 'Av. Martin Luther, 300 - Nações', faces: 1, fluxo: 362000, lat: -26.975521, lng: -48.642297, valor: 6000, publico: 'A/B/C', detalhes: 'Painel backlight 15m x 2,5m - 37,5 m²' }, 'Backlight', 'Balneário Camboriú') },
    { nome: 'MARTIN LUTHER - Painel 2', ...defaults({ endereco: 'Av. Martin Luther, 300 - Nações', faces: 1, fluxo: 362000, lat: -26.975521, lng: -48.642297, valor: 6000, publico: 'A/B/C', detalhes: 'Painel backlight 15m x 2,5m - 37,5 m²' }, 'Backlight', 'Balneário Camboriú') },

    // ==================== BALNEÁRIO CAMBORIÚ / ITAJAÍ - Elevadores ====================
    { nome: 'Ed. SEAS TOWER', ...defaults({ endereco: 'Av. Atlântica, 3950 - Centro, Balneário Camboriú', faces: 1, fluxo: 9000, insercoes: 9600, lat: -27.001308, lng: -48.620727, valor: 700, publico: 'A', detalhes: '1 tela vertical de 24"' }, 'Elevador', 'Balneário Camboriú') },
    { nome: 'Ed. CENTRAL PARK', ...defaults({ endereco: 'R. 901, 431 - Centro, Balneário Camboriú', faces: 1, fluxo: 26500, insercoes: 9600, lat: -26.986947, lng: -48.639222, valor: 700, publico: 'A/B', detalhes: '1 tela vertical de 24"' }, 'Elevador', 'Balneário Camboriú') },
    { nome: 'Ed. VILLE DE LEON', ...defaults({ endereco: 'Av. Itaipava, 1255 - Itaipava, Itajaí', faces: 8, fluxo: 38000, insercoes: 76800, lat: -26.939492, lng: -48.713986, valor: 900, publico: 'A/B+', detalhes: '1 tela vertical de 24" em cada elevador (8 Elevadores)' }, 'Elevador', 'Itajaí') },
    { nome: 'LONDON HUB', ...defaults({ endereco: 'R. Franklin Máximo Pereira, 96 - Centro, Itajaí', faces: 2, fluxo: 6300, insercoes: 9600, lat: -26.911338, lng: -48.663964, valor: 500, publico: 'A/B', detalhes: '2 telas verticais de 24"' }, 'Elevador', 'Itajaí') },
  ];

  const insertMany = db.transaction((items) => {
    for (const item of items) insert.run(item);
  });
  insertMany(seed);
  console.log(`Seeded ${seed.length} pontos.`);
}

// Seed admin if empty
const adminCount = db.prepare('SELECT COUNT(*) as c FROM admin_users').get();
if (adminCount.c === 0) {
  db.prepare('INSERT INTO admin_users (username, password) VALUES (?, ?)').run('admin', 'intermidia2025');
  console.log('Admin user created: admin / intermidia2025');
}

module.exports = db;
