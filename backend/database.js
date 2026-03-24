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
    insercoes: Math.round((typeof p.fluxo === 'number' ? p.fluxo : (parseInt(String(p.fluxo).replace(/\./g, '')) || 0)) * 0.64),
    tempo: '15s',
    loop: '3 min',
    veiculacao: 'Vídeo sem áudio',
    publico: 'A/B',
    telas: p.faces || 1,
    preco: p.valor,
    descricao: p.detalhes || null,
  });

  const seed = [
    // ==================== LONDRINA - Elevadores ====================
    { nome: 'DUQUE HALL', ...defaults({ endereco: 'Av. Duque de Caxias, 1726', faces: 2, fluxo: 30000, lat: -23.3102, lng: -51.1597, valor: 700 }, 'Elevador', 'Londrina') },
    { nome: 'Ed. GENÉVE', ...defaults({ endereco: 'R. Ernâni Lacerda de Athayde, 350', faces: 2, fluxo: 30000, lat: -23.3185, lng: -51.1725, valor: 900 }, 'Elevador', 'Londrina') },
    { nome: 'PALHANO PREMIUM', ...defaults({ endereco: 'Av. Me. Leônia Milito, 1377', faces: 7, fluxo: 39000, lat: -23.3357, lng: -51.1768, valor: 803 }, 'Elevador', 'Londrina') },
    { nome: 'PALHANO BUSINESS T.1', ...defaults({ endereco: 'Av. Ayrton Senna da Silva, 300', faces: 4, fluxo: 39000, lat: -23.3280, lng: -51.1776, valor: 803 }, 'Elevador', 'Londrina') },
    { nome: 'PALHANO BUSINESS T.2', ...defaults({ endereco: 'Av. Ayrton Senna da Silva, 200', faces: 4, fluxo: 39000, lat: -23.3275, lng: -51.1780, valor: 803 }, 'Elevador', 'Londrina') },
    { nome: 'COMERCIAL SENADOR', ...defaults({ endereco: 'Rua Senador Souza Naves, 771', faces: 1, fluxo: 39000, lat: -23.3058, lng: -51.1635, valor: 803 }, 'Elevador', 'Londrina') },
    { nome: 'Ed. NYC PALHANO', ...defaults({ endereco: 'R. Caracas, 1255', faces: 4, fluxo: 17100, lat: -23.3320, lng: -51.1790, valor: 800 }, 'Elevador', 'Londrina') },
    { nome: 'Ed. MORADA SHANGRI LÁ', ...defaults({ endereco: 'R. Euclides da Cunha, 374-628', faces: 2, fluxo: 14300, lat: -23.3145, lng: -51.1580, valor: 800 }, 'Elevador', 'Londrina') },
    { nome: 'DUETTO RESIDENCE', ...defaults({ endereco: 'R. dos Coqueiros, 305A', faces: 4, fluxo: 17100, lat: -23.3250, lng: -51.1850, valor: 700 }, 'Elevador', 'Londrina') },
    { nome: 'GARDEN PALHANO', ...defaults({ endereco: 'R. Ulrico Zuinglio, 500', faces: 6, fluxo: 70000, lat: -23.3380, lng: -51.1755, valor: 800 }, 'Elevador', 'Londrina') },
    { nome: 'Ed. BRISAS ALTO DO ARAXÁ', ...defaults({ endereco: 'Av. Voluntários da Pátria, 888 - Jardim Andrade', faces: 3, fluxo: 27300, lat: -23.3066, lng: -51.1803, valor: 800 }, 'Elevador', 'Londrina') },
    { nome: 'Ed. STUDIO D', ...defaults({ endereco: 'R. Pio XII, 626 - Jardins - Centro', faces: 2, fluxo: 8000, lat: -23.3120, lng: -51.1675, valor: 800 }, 'Elevador', 'Londrina') },
    { nome: 'Ed. PIONEIROS DO CAFÉ', ...defaults({ endereco: 'Av. Higienópolis, 1100 - Jardim Higienopolis', faces: 2, fluxo: 17100, lat: -23.3194, lng: -51.1663, valor: 800 }, 'Elevador', 'Londrina') },
    { nome: 'Ed. PALHANO RESIDENCE', ...defaults({ endereco: 'Rua Antonio Pisicchio, 100 - Guanabara', faces: 2, fluxo: 19500, lat: -23.3338, lng: -51.1759, valor: 800 }, 'Elevador', 'Londrina') },
    { nome: 'Ed. PREMIATTO RESIDENCE', ...defaults({ endereco: 'Rua Eurico Hummig, 300 - Palhano 1', faces: 3, fluxo: 28100, lat: -23.3325, lng: -51.1794, valor: 800 }, 'Elevador', 'Londrina') },
    { nome: 'Ed. MAISON TUSCANY', ...defaults({ endereco: 'Rua Eurico Hummig, 89 - Palhano 1', faces: 4, fluxo: 32600, lat: -23.3351, lng: -51.1797, valor: 800 }, 'Elevador', 'Londrina') },
    { nome: 'Ed. TERRANOBLE', ...defaults({ endereco: 'R. Silvio Pegoraro, 599 - Petrópolis', faces: 2, fluxo: 25200, lat: -23.3335, lng: -51.1537, valor: 800 }, 'Elevador', 'Londrina') },
    { nome: 'Ed. TORRE SANTORINI', ...defaults({ endereco: 'R. Frederico Balan, 80 - Inglaterra', faces: 3, fluxo: 26300, lat: -23.3497, lng: -51.1500, valor: 800 }, 'Elevador', 'Londrina') },

    // ==================== LONDRINA - Tela Indoor ====================
    { nome: 'STRASSBERG', ...defaults({ endereco: 'Rod. Celso Garcia Cid, Warta', faces: 2, fluxo: 10000, lat: -23.2850, lng: -51.1120, valor: 803 }, 'Tela Indoor', 'Londrina') },
    { nome: 'HACHIMITSU JK', ...defaults({ endereco: 'Av Juscelino Kubitschek, 3216', faces: 2, fluxo: 10400, lat: -23.3180, lng: -51.1420, valor: 935 }, 'Tela Indoor', 'Londrina') },
    { nome: 'HACHIMITSU BAKERY', ...defaults({ endereco: 'Alameda Jardino, R. João Wyclif, 500', faces: 2, fluxo: 10400, lat: -23.3340, lng: -51.1810, valor: 935 }, 'Tela Indoor', 'Londrina') },
    { nome: 'HACHIMITSU BELA SUIÇA', ...defaults({ endereco: 'Rua Assunção, 331', faces: 1, fluxo: 10400, lat: -23.3365, lng: -51.1745, valor: 935 }, 'Tela Indoor', 'Londrina') },
    { nome: "ARNALDO'S", ...defaults({ endereco: 'Av Maringá, 430', faces: 1, fluxo: 19700, lat: -23.3095, lng: -51.1510, valor: 759 }, 'Tela Indoor', 'Londrina') },
    { nome: 'FRUTTARIA ALPHAVILLE', ...defaults({ endereco: 'Rua das Palmeiras, 88', faces: 1, fluxo: 39000, lat: -23.3420, lng: -51.1920, valor: 759 }, 'Tela Indoor', 'Londrina') },
    { nome: 'POSTO ALPHA (Tela Conveniência)', ...defaults({ endereco: 'Rod. Mabio Gonçalves Palhano, 1377', faces: 1, fluxo: 36000, lat: -23.3450, lng: -51.1880, valor: 800 }, 'Tela Indoor', 'Londrina') },
    { nome: 'O CASARÃO', ...defaults({ endereco: 'Av. Maringá, 899', faces: 1, fluxo: 33000, lat: -23.3088, lng: -51.1525, valor: 1200 }, 'Tela Indoor', 'Londrina') },
    { nome: 'PANETTERIA PALHANO', ...defaults({ endereco: 'Av. Ayrton Senna da Silva, 740', faces: 1, fluxo: 15600, lat: -23.3310, lng: -51.1765, valor: 1210 }, 'Tela Indoor', 'Londrina') },
    { nome: 'LDN GRILL', ...defaults({ endereco: 'Av Maringá, 430', faces: 1, fluxo: 18200, lat: -23.3092, lng: -51.1508, valor: 803 }, 'Tela Indoor', 'Londrina') },
    { nome: 'ZANONI', ...defaults({ endereco: 'Av Maringá, 430', faces: 1, fluxo: 18200, lat: -23.3090, lng: -51.1510, valor: 803 }, 'Tela Indoor', 'Londrina') },
    { nome: 'LAB. OSWALDO CRUZ (Gleba)', ...defaults({ endereco: 'Av. Ayrton Senna da Silva, 850 - Palhano 1', faces: 1, fluxo: 65900, lat: -23.3345, lng: -51.1779, valor: 1600 }, 'Tela Indoor', 'Londrina') },
    { nome: 'LAB. OSWALDO CRUZ (Saul Elkind)', ...defaults({ endereco: 'Av. Saul Elkind, 2195 - Zona Norte', faces: 1, fluxo: 41600, lat: -23.2594, lng: -51.1596, valor: 1200 }, 'Tela Indoor', 'Londrina') },
    { nome: 'LAB. OSWALDO CRUZ (Souza Naves)', ...defaults({ endereco: 'R. Sen. Souza Naves, 1000 - Centro', faces: 1, fluxo: 170800, lat: -23.3213, lng: -51.1578, valor: 1600 }, 'Tela Indoor', 'Londrina') },
    { nome: 'MERKAVA CLUBE DE TIRO', ...defaults({ endereco: 'R. Ronald Tkotz, 3377 - Jardim Taroba, Cambé', faces: 1, fluxo: 28900, lat: -23.2901, lng: -51.2624, valor: 500 }, 'Tela Indoor', 'Londrina') },
    { nome: 'UNIORTE PRIME', ...defaults({ endereco: 'R. Valparaíso, 36 - Guanabara', faces: 1, fluxo: 44200, lat: -23.3332, lng: -51.1684, valor: 800 }, 'Tela Indoor', 'Londrina') },
    { nome: 'HOSPITAL UNIORTE', ...defaults({ endereco: 'Av. Higienópolis, 2600 - Jardim do Lago', faces: 1, fluxo: 141800, lat: -23.3327, lng: -51.1680, valor: 1600 }, 'Tela Indoor', 'Londrina') },
    { nome: 'UNIORTE FISIO', ...defaults({ endereco: 'Av. Higienópolis, 2554 - Guanabara', faces: 1, fluxo: 22800, lat: -23.3324, lng: -51.1680, valor: 800 }, 'Tela Indoor', 'Londrina') },

    // ==================== LONDRINA - Painel LED ====================
    { nome: 'POSTO IPIRANGA (TIRADENTES)', ...defaults({ endereco: 'Av Tiradentes, 1592', faces: 3, fluxo: 80000, lat: -23.2986, lng: -51.1907, valor: 3000 }, 'Painel LED', 'Londrina') },
    { nome: 'POSTO MEDITERRÂNEO', ...defaults({ endereco: 'Av Harry Prochet, 369', faces: 3, fluxo: 60000, lat: -23.3420, lng: -51.1587, valor: 3500 }, 'Painel LED', 'Londrina') },
    { nome: 'POSTO ALPHA (LED)', ...defaults({ endereco: 'Rod. Mabio Gonçalves Palhano, 1377', faces: 1, fluxo: 35000, lat: -23.3448, lng: -51.1885, valor: 3500 }, 'Painel LED', 'Londrina') },
    { nome: 'POSTO GASTECH', ...defaults({ endereco: 'Av. Winston Churchill - Andes', faces: 1, fluxo: 42000, lat: -23.2919, lng: -51.1731, valor: 3000 }, 'Painel LED', 'Londrina') },

    // ==================== LONDRINA - Backlight ====================
    { nome: 'WALDEMAR SPRANGER', ...defaults({ endereco: 'Rua Waldemar Spranger - Posto Shell', faces: 1, fluxo: 9400, lat: -23.3150, lng: -51.1650, valor: 5600 }, 'Backlight', 'Londrina') },
    { nome: 'GIL DE ABREU E SOUZA', ...defaults({ endereco: 'Rua Gil de Abreu, 243', faces: 1, fluxo: 14000, lat: -23.3120, lng: -51.1580, valor: 5600 }, 'Backlight', 'Londrina') },
    { nome: 'PANETTERIA PALHANO (Backlight)', ...defaults({ endereco: 'Av Ayrton Senna da Silva, 740', faces: 1, fluxo: 15000, lat: -23.3312, lng: -51.1763, valor: 5600 }, 'Backlight', 'Londrina') },
    { nome: 'BAR VALENTINO', ...defaults({ endereco: 'Av. Prefeito Faria Lima, 486', faces: 1, fluxo: 23000, lat: -23.3200, lng: -51.1720, valor: 5500 }, 'Backlight', 'Londrina') },
    { nome: 'BENTO MUNHOZ', ...defaults({ endereco: 'Rua Bento Munhoz, 812', faces: 1, fluxo: 19000, lat: -23.3075, lng: -51.1555, valor: 5400 }, 'Backlight', 'Londrina') },

    // ==================== LONDRINA - Frontlight ====================
    { nome: 'ROD. CELSO GARCIA CID', ...defaults({ endereco: 'Rod. Celso Garcia Cid, KM 378', faces: 1, fluxo: 26000, lat: -23.2870, lng: -51.1150, valor: 5500 }, 'Frontlight', 'Londrina') },
    { nome: 'JOAQUIM DE MATOS BARRETO', ...defaults({ endereco: 'Rua Joaquim de Matos Barreto, 990', faces: 1, fluxo: 18000, lat: -23.3025, lng: -51.1480, valor: 5500 }, 'Frontlight', 'Londrina') },
    { nome: 'STRASSBERG (Frontlight)', ...defaults({ endereco: 'Rodovia Celso Garcia Cid PR 323', faces: 2, fluxo: 18000, lat: -23.2855, lng: -51.1125, valor: 3800 }, 'Frontlight', 'Londrina') },

    // ==================== LONDRINA - Totem Digital ====================
    { nome: 'TOTEM LED CABA MALL', ...defaults({ endereco: 'Rod. Mabio Gonçalves Palhano, 200', faces: 1, fluxo: 0, lat: -23.3598, lng: -51.1974, valor: 1200 }, 'Totem Digital', 'Londrina') },

    // ==================== LONDRINA - Circuito Muffato ====================
    { nome: 'VIDEOWALL MUFFATO MADRE', ...defaults({ endereco: 'Av. Me. Leônia Milito, 1175', faces: 1, fluxo: 0, lat: -23.3348, lng: -51.1738, valor: 1200 }, 'Circuito Muffato', 'Londrina') },
    { nome: 'TOTEM DIGITAL MUFFATO DUQUE', ...defaults({ endereco: 'Av. Duque de Caxias, 1200', faces: 1, fluxo: 0, lat: -23.3268, lng: -51.1546, valor: 1200 }, 'Circuito Muffato', 'Londrina') },
    { nome: 'VIDEOWALL MUFFATO AEROPORTO', ...defaults({ endereco: 'Av. Robert Koch, 20', faces: 1, fluxo: 0, lat: -23.3045, lng: -51.1550, valor: 1200 }, 'Circuito Muffato', 'Londrina') },
    { nome: 'TOTEM DIGITAL MUFFATO SAUL ELKIND', ...defaults({ endereco: 'Av. Saul Elkind, 2177', faces: 1, fluxo: 0, lat: -23.2600, lng: -51.1588, valor: 1200 }, 'Circuito Muffato', 'Londrina') },
    { nome: 'TOTEM DIGITAL MUFFATO CAFEZAL', ...defaults({ endereco: 'Av. Pres. Euríco Gáspar Dutra, 55', faces: 1, fluxo: 0, lat: -23.3655, lng: -51.1521, valor: 1200 }, 'Circuito Muffato', 'Londrina') },
    { nome: 'TOTEM DIGITAL MUFFATO IBIPORÃ', ...defaults({ endereco: 'R. Ronat Valter Sodré, 300 - Ibiporã', faces: 1, fluxo: 0, lat: -23.2690, lng: -51.0480, valor: 1200 }, 'Circuito Muffato', 'Londrina') },
    { nome: 'TOTEM MUFFATO CAMBÉ', ...defaults({ endereco: 'R. Carlos Sawade, 408 - Cambé', faces: 1, fluxo: 0, lat: -23.2770, lng: -51.2702, valor: 1200 }, 'Circuito Muffato', 'Londrina') },

    // ==================== LONDRINA - Painéis LED em Postos ====================
    { nome: 'POSTO IPIRANGA LESTE OESTE', ...defaults({ endereco: 'R. Maranhão, 703', faces: 1, fluxo: 0, lat: -23.3100, lng: -51.1670, valor: 2000 }, 'LED Posto', 'Londrina') },
    { nome: 'POSTO IPIRANGA SUN LAKE', ...defaults({ endereco: 'R. Alcides Turini, 200', faces: 1, fluxo: 0, lat: -23.3656, lng: -51.2074, valor: 2000 }, 'LED Posto', 'Londrina') },
    { nome: 'POSTO BR VIA EXPRESSA', ...defaults({ endereco: 'Av. Dez de Dezembro, 7340', faces: 1, fluxo: 0, lat: -23.3105, lng: -51.1489, valor: 2000 }, 'LED Posto', 'Londrina') },
    { nome: 'POSTO IPIRANGA QUINTINO', ...defaults({ endereco: 'R. Quintino Bocaiúva, 460', faces: 1, fluxo: 0, lat: -23.3074, lng: -51.1664, valor: 2000 }, 'LED Posto', 'Londrina') },
    { nome: 'POSTO IPIRANGA AV MARINGÁ', ...defaults({ endereco: 'Av. Maringá, 346', faces: 1, fluxo: 0, lat: -23.3188, lng: -51.1766, valor: 2000 }, 'LED Posto', 'Londrina') },
    { nome: 'POSTO IPIRANGA TIRADENTES X RIO BRANCO', ...defaults({ endereco: 'Av. Rio Branco, 50', faces: 1, fluxo: 0, lat: -23.2989, lng: -51.1914, valor: 2000 }, 'LED Posto', 'Londrina') },

    // ==================== MARINGÁ - Video Wall ====================
    { nome: 'MERCADÃO DE MARINGÁ', ...defaults({ endereco: 'Av. Prudente de Morais, 601', faces: 2, fluxo: 33000, lat: -23.4205, lng: -51.9330, valor: 1540 }, 'Video Wall', 'Maringá') },
    { nome: 'BOTECO DO NECO', ...defaults({ endereco: 'Av. Tiradentes, 133 - Zona II', faces: 1, fluxo: 10400, lat: -23.4259, lng: -51.9344, valor: 1000 }, 'Video Wall', 'Maringá') },
    { nome: 'SR. ZANONI', ...defaults({ endereco: 'R. José do Patrocínio, 673 - Zona 04', faces: 1, fluxo: 39100, lat: -23.4299, lng: -51.9519, valor: 1500 }, 'Video Wall', 'Maringá') },

    // ==================== MARINGÁ - Totem Digital ====================
    { nome: 'MERCADÃO FRATELLO', ...defaults({ endereco: 'Av. Herval, 969', faces: 2, fluxo: 33000, lat: -23.4150, lng: -51.9280, valor: 1210 }, 'Totem Digital', 'Maringá') },

    // ==================== MARINGÁ - Tela Indoor ====================
    { nome: 'HACHIMITSU MARINGÁ', ...defaults({ endereco: 'Av. São Paulo, 1700 - Zona 02', faces: 2, fluxo: 10400, lat: -23.4281, lng: -51.9329, valor: 1100 }, 'Tela Indoor', 'Maringá') },

    // ==================== MARINGÁ - Elevadores ====================
    { nome: 'MAISON LUMINI', ...defaults({ endereco: 'Av. Laguna, 733 - Zona 01', faces: 2, fluxo: 10500, lat: -23.4278, lng: -51.9270, valor: 990 }, 'Elevador', 'Maringá') },
    { nome: 'MAISON MONTALCINO', ...defaults({ endereco: 'Av. Guedner, 683 - Zona 08', faces: 2, fluxo: 8500, lat: -23.4361, lng: -51.9133, valor: 990 }, 'Elevador', 'Maringá') },
    { nome: 'MAISON PORTO FINO', ...defaults({ endereco: 'Av. Guedner, 891 - Zona 08', faces: 2, fluxo: 8400, lat: -23.4380, lng: -51.9136, valor: 990 }, 'Elevador', 'Maringá') },
    { nome: 'NEW TOWER PLAZA (Torre 1)', ...defaults({ endereco: 'Av. Duque de Caxias, 882 - Zona 7', faces: 9, fluxo: 30000, lat: -23.4179, lng: -51.9393, valor: 1540 }, 'Elevador', 'Maringá') },
    { nome: 'NEW TOWER PLAZA (Torre 2)', ...defaults({ endereco: 'Av. Duque de Caxias, 882 - Zona 7', faces: 9, fluxo: 30000, lat: -23.4182, lng: -51.9396, valor: 1540 }, 'Elevador', 'Maringá') },
    { nome: 'Ed. MARCELINO CHAMPAGNAT', ...defaults({ endereco: 'Av. Itororó, 1109 - Zona 02', faces: 1, fluxo: 8500, lat: -23.4195, lng: -51.9350, valor: 800 }, 'Elevador', 'Maringá') },
    { nome: 'NYC MARINGÁ', ...defaults({ endereco: 'Av. Londrina, 1768 - Zona 08', faces: 2, fluxo: 8500, lat: -23.4445, lng: -51.9135, valor: 800 }, 'Elevador', 'Maringá') },
    { nome: 'Ed. SOLAR DO BOSQUE', ...defaults({ endereco: 'R. Monsenhor Kimura, 445 - Vila Cleopatra', faces: 1, fluxo: 7500, lat: -23.4385, lng: -51.9382, valor: 700 }, 'Elevador', 'Maringá') },
    { nome: 'IMPERIUM RESIDENCE', ...defaults({ endereco: 'Av. Dr. Alexandre Rasgulaeff, 3342 - Parque Res. Cidade Nova', faces: 1, fluxo: 8500, lat: -23.3986, lng: -51.9279, valor: 800 }, 'Elevador', 'Maringá') },
    { nome: 'SPAZIO MISATO', ...defaults({ endereco: 'Av. Pioneiro Antônio Ruíz Saldanha, 1826 - Jardim das Estações', faces: 3, fluxo: 8500, lat: -23.4460, lng: -51.9799, valor: 800 }, 'Elevador', 'Maringá') },
    { nome: 'RESIDENCIAL ALTA FLORESTA', ...defaults({ endereco: 'R. Mal. Floriano Peixoto, 644 - Zona 7', faces: 1, fluxo: 7000, lat: -23.4160, lng: -51.9274, valor: 700 }, 'Elevador', 'Maringá') },
    { nome: 'Ed. TORRE ALVOREAR', ...defaults({ endereco: 'R. Vítor do Amaral, 776 - Jardim Alvorada', faces: 1, fluxo: 8500, lat: -23.3899, lng: -51.9109, valor: 800 }, 'Elevador', 'Maringá') },

    // ==================== MARINGÁ - Backlight ====================
    { nome: 'AEROPORTO DE MARINGÁ', ...defaults({ endereco: 'Av. Dr. Vladimir Babkov, SN', faces: 2, fluxo: 73000, lat: -23.4805, lng: -52.0084, valor: 6000, detalhes: 'Painel backlight dupla face 15m x 2,5m' }, 'Backlight', 'Maringá') },

    // ==================== BALNEÁRIO CAMBORIÚ - Tela Indoor ====================
    { nome: 'BIG WHEEL - Cabines', ...defaults({ endereco: 'Av. Estrada Da Rainha, 1009 - Pioneiros', faces: 36, fluxo: 42500, lat: -26.9710, lng: -48.6319, valor: 4900, detalhes: '1 tela horizontal de 24" em cada cabine (36 Cabines)' }, 'Tela Indoor', 'Balneário Camboriú') },
    { nome: 'BIG WHEEL - Painel Bilheteria', ...defaults({ endereco: 'Av. Estrada Da Rainha, 1009 - Pioneiros', faces: 1, fluxo: 62350, lat: -26.9710, lng: -48.6319, valor: 3500, detalhes: '1 tela horizontal de aproximadamente 239"' }, 'Tela Indoor', 'Balneário Camboriú') },
    { nome: 'CAFETERIA DA PRAÇA', ...defaults({ endereco: '3ª Avenida, 1401 - Centro', faces: 1, fluxo: 18000, lat: -26.9985, lng: -48.6320, valor: 820, detalhes: '1 tela vertical 55"' }, 'Tela Indoor', 'Balneário Camboriú') },

    // ==================== BALNEÁRIO CAMBORIÚ - Backlight ====================
    { nome: 'MARTIN LUTHER - Painel 1', ...defaults({ endereco: 'Av. Martin Luther, 300 - Nações', faces: 1, fluxo: 362000, lat: -26.9755, lng: -48.6423, valor: 6000, detalhes: 'Painel backlight 15m x 2,5m' }, 'Backlight', 'Balneário Camboriú') },
    { nome: 'MARTIN LUTHER - Painel 2', ...defaults({ endereco: 'Av. Martin Luther, 300 - Nações', faces: 1, fluxo: 362000, lat: -26.9755, lng: -48.6423, valor: 6000, detalhes: 'Painel backlight 15m x 2,5m' }, 'Backlight', 'Balneário Camboriú') },

    // ==================== BALNEÁRIO CAMBORIÚ - Elevadores ====================
    { nome: 'Ed. SEAS TOWER', ...defaults({ endereco: 'Av. Atlântica, 3950 - Centro', faces: 1, fluxo: 0, lat: -27.0013, lng: -48.6207, valor: 700, detalhes: '1 tela vertical 24"' }, 'Elevador', 'Balneário Camboriú') },
    { nome: 'Ed. CENTRAL PARK', ...defaults({ endereco: 'R. 901, 431 - Centro', faces: 1, fluxo: 26500, lat: -26.9869, lng: -48.6392, valor: 700, detalhes: '1 tela vertical 24"' }, 'Elevador', 'Balneário Camboriú') },
    { nome: 'Ed. VILLE DE LEON', ...defaults({ endereco: 'Av. Itaipava, 1255 - Itaipava, Itajaí', faces: 8, fluxo: 38000, lat: -26.9395, lng: -48.7140, valor: 900, detalhes: '1 tela vertical de 24" em cada elevador (8 Elevadores)' }, 'Elevador', 'Balneário Camboriú') },
    { nome: 'Ed. SEIXAS BUSINESS TOWER', ...defaults({ endereco: 'R. Dr. Nereu Ramos, 197 - Centro, Itajaí', faces: 3, fluxo: 15500, lat: -26.9097, lng: -48.6600, valor: 700, detalhes: '1 tela vertical de 24" em cada elevador (3 Elevadores)' }, 'Elevador', 'Balneário Camboriú') },
    { nome: 'LONDON HUB', ...defaults({ endereco: 'R. Franklin Máximo Pereira, 96 - Centro, Itajaí', faces: 2, fluxo: 6300, lat: -26.9113, lng: -48.6640, valor: 500, detalhes: '2 telas verticais de 24"' }, 'Elevador', 'Balneário Camboriú') },

    // ==================== ITAJAÍ - Elevadores ====================
    { nome: 'Ed. VILLE DE LEON (Itajaí)', ...defaults({ endereco: 'Av. Itaipava, 1255 - Itaipava', faces: 8, fluxo: 38000, lat: -26.9395, lng: -48.7140, valor: 900 }, 'Elevador', 'Itajaí') },
    { nome: 'Ed. SEIXAS BUSINESS TOWER (Itajaí)', ...defaults({ endereco: 'R. Dr. Nereu Ramos, 197 - Centro', faces: 3, fluxo: 15500, lat: -26.9097, lng: -48.6600, valor: 700 }, 'Elevador', 'Itajaí') },
    { nome: 'LONDON HUB (Itajaí)', ...defaults({ endereco: 'R. Franklin Máximo Pereira, 96 - Centro', faces: 2, fluxo: 6300, lat: -26.9113, lng: -48.6640, valor: 500 }, 'Elevador', 'Itajaí') },
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
