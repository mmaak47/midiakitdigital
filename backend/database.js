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

  const seed = [
    {
      nome: 'Duque Hall', cidade: 'Londrina', tipo: 'Elevador',
      endereco: 'Av. Duque de Caxias, 1726 - Centro, Londrina - PR',
      lat: -23.3045, lng: -51.1696,
      horario: '06:00 às 22:00', fluxo: 30000, insercoes: 19200,
      tempo: '15s', loop: '3 min', veiculacao: 'Vídeo sem áudio',
      publico: 'A/B', telas: 2, preco: 800,
      descricao: 'Edifício comercial de alto padrão no centro de Londrina com grande fluxo de executivos e profissionais liberais.'
    },
    {
      nome: 'Edifício Boulevard', cidade: 'Londrina', tipo: 'Elevador',
      endereco: 'Rua Sergipe, 1045 - Centro, Londrina - PR',
      lat: -23.3102, lng: -51.1635,
      horario: '06:00 às 22:00', fluxo: 25000, insercoes: 16000,
      tempo: '15s', loop: '3 min', veiculacao: 'Vídeo sem áudio',
      publico: 'A', telas: 2, preco: 900,
      descricao: 'Edifício residencial de alto padrão com moradores classe A no centro de Londrina.'
    },
    {
      nome: 'Londrina Norte Shopping', cidade: 'Londrina', tipo: 'LED',
      endereco: 'Av. Saul Elkind, 3200 - Zona Norte, Londrina - PR',
      lat: -23.2750, lng: -51.1580,
      horario: '10:00 às 22:00', fluxo: 80000, insercoes: 48000,
      tempo: '15s', loop: '3 min', veiculacao: 'Vídeo sem áudio',
      publico: 'A/B', telas: 4, preco: 2500,
      descricao: 'Painel LED de alta resolução no principal shopping da zona norte de Londrina.'
    },
    {
      nome: 'Padaria Pão Quente', cidade: 'Londrina', tipo: 'Padaria',
      endereco: 'Rua Paranaguá, 450 - Centro, Londrina - PR',
      lat: -23.3060, lng: -51.1710,
      horario: '06:00 às 21:00', fluxo: 15000, insercoes: 9600,
      tempo: '15s', loop: '3 min', veiculacao: 'Vídeo sem áudio',
      publico: 'B', telas: 1, preco: 500,
      descricao: 'Padaria tradicional com alto fluxo de clientes diários no centro de Londrina.'
    },
    {
      nome: 'Restaurante La Pasta', cidade: 'Londrina', tipo: 'Restaurante',
      endereco: 'Av. Higienópolis, 890 - Centro, Londrina - PR',
      lat: -23.3020, lng: -51.1650,
      horario: '11:00 às 23:00', fluxo: 12000, insercoes: 7680,
      tempo: '15s', loop: '3 min', veiculacao: 'Vídeo sem áudio',
      publico: 'A', telas: 1, preco: 600,
      descricao: 'Restaurante premium com público de alto poder aquisitivo.'
    },
    {
      nome: 'Av. Colombo LED', cidade: 'Maringá', tipo: 'Via Pública',
      endereco: 'Av. Colombo, 5790 - Zona 7, Maringá - PR',
      lat: -23.4205, lng: -51.9333,
      horario: '24 horas', fluxo: 120000, insercoes: 57600,
      tempo: '15s', loop: '5 min', veiculacao: 'Vídeo sem áudio',
      publico: 'A/B', telas: 1, preco: 3500,
      descricao: 'Painel LED na principal avenida de Maringá, com visibilidade para mais de 120 mil veículos/mês.'
    },
    {
      nome: 'Edifício Crystal Tower', cidade: 'Maringá', tipo: 'Elevador',
      endereco: 'Av. Brasil, 4200 - Zona 1, Maringá - PR',
      lat: -23.4180, lng: -51.9380,
      horario: '06:00 às 22:00', fluxo: 20000, insercoes: 12800,
      tempo: '15s', loop: '3 min', veiculacao: 'Vídeo sem áudio',
      publico: 'A', telas: 2, preco: 850,
      descricao: 'Torre comercial premium no coração de Maringá com público corporativo de alto nível.'
    },
    {
      nome: 'Maringá Park Shopping', cidade: 'Maringá', tipo: 'LED',
      endereco: 'Av. das Torres, km 3 - Maringá - PR',
      lat: -23.4120, lng: -51.9200,
      horario: '10:00 às 22:00', fluxo: 95000, insercoes: 57600,
      tempo: '15s', loop: '3 min', veiculacao: 'Vídeo sem áudio',
      publico: 'A/B', telas: 6, preco: 3200,
      descricao: 'Painéis digitais premium no maior shopping de Maringá.'
    },
    {
      nome: 'Bistro Gourmet', cidade: 'Maringá', tipo: 'Restaurante',
      endereco: 'Rua Santos Dumont, 1234 - Zona 1, Maringá - PR',
      lat: -23.4150, lng: -51.9350,
      horario: '11:30 às 23:00', fluxo: 10000, insercoes: 6400,
      tempo: '15s', loop: '3 min', veiculacao: 'Vídeo sem áudio',
      publico: 'A', telas: 1, preco: 550,
      descricao: 'Restaurante sofisticado frequentado por executivos e profissionais de alto padrão.'
    },
    {
      nome: 'Barra Sul LED', cidade: 'Balneário Camboriú', tipo: 'Via Pública',
      endereco: 'Av. Atlântica, 3500 - Barra Sul, Balneário Camboriú - SC',
      lat: -26.9906, lng: -48.6348,
      horario: '24 horas', fluxo: 200000, insercoes: 96000,
      tempo: '15s', loop: '5 min', veiculacao: 'Vídeo sem áudio',
      publico: 'A', telas: 2, preco: 5500,
      descricao: 'Mega painel LED na orla mais valorizada do sul do Brasil. Público turístico e residencial de altíssimo padrão.'
    },
    {
      nome: 'Edifício Millennium Tower', cidade: 'Balneário Camboriú', tipo: 'Elevador',
      endereco: 'Av. Brasil, 2000 - Centro, Balneário Camboriú - SC',
      lat: -26.9920, lng: -48.6370,
      horario: '06:00 às 23:00', fluxo: 18000, insercoes: 11520,
      tempo: '15s', loop: '3 min', veiculacao: 'Vídeo sem áudio',
      publico: 'A', telas: 3, preco: 1200,
      descricao: 'Um dos edifícios mais altos da América Latina. Moradores de ultra-alto padrão.'
    },
    {
      nome: 'Balneário Shopping', cidade: 'Balneário Camboriú', tipo: 'LED',
      endereco: 'Av. Santa Catarina, 1 - Municípios, Balneário Camboriú - SC',
      lat: -26.9850, lng: -48.6280,
      horario: '10:00 às 22:00', fluxo: 70000, insercoes: 44800,
      tempo: '15s', loop: '3 min', veiculacao: 'Vídeo sem áudio',
      publico: 'A/B', telas: 3, preco: 2800,
      descricao: 'Shopping premium de Balneário Camboriú com alto fluxo turístico.'
    },
    {
      nome: 'Padaria Villa Pane', cidade: 'Balneário Camboriú', tipo: 'Padaria',
      endereco: 'Rua 3100, 85 - Centro, Balneário Camboriú - SC',
      lat: -26.9880, lng: -48.6350,
      horario: '06:00 às 21:00', fluxo: 12000, insercoes: 7680,
      tempo: '15s', loop: '3 min', veiculacao: 'Vídeo sem áudio',
      publico: 'A/B', telas: 1, preco: 600,
      descricao: 'Padaria artesanal no coração de Balneário Camboriú.'
    },
    {
      nome: 'Porto de Itajaí LED', cidade: 'Itajaí', tipo: 'Via Pública',
      endereco: 'Av. Min. Victor Konder, 300 - Centro, Itajaí - SC',
      lat: -26.9078, lng: -48.6620,
      horario: '24 horas', fluxo: 90000, insercoes: 43200,
      tempo: '15s', loop: '5 min', veiculacao: 'Vídeo sem áudio',
      publico: 'A/B', telas: 1, preco: 2800,
      descricao: 'Painel LED estratégico próximo ao porto de Itajaí, principal hub logístico de SC.'
    },
    {
      nome: 'Edifício Royal Plaza', cidade: 'Itajaí', tipo: 'Elevador',
      endereco: 'Rua Hercílio Luz, 500 - Centro, Itajaí - SC',
      lat: -26.9100, lng: -48.6650,
      horario: '06:00 às 22:00', fluxo: 16000, insercoes: 10240,
      tempo: '15s', loop: '3 min', veiculacao: 'Vídeo sem áudio',
      publico: 'A/B', telas: 2, preco: 750,
      descricao: 'Edifício comercial de alto padrão no centro de Itajaí.'
    },
    {
      nome: 'Itajaí Shopping', cidade: 'Itajaí', tipo: 'LED',
      endereco: 'Rod. BR-101, km 111 - Cordeiros, Itajaí - SC',
      lat: -26.9200, lng: -48.6700,
      horario: '10:00 às 22:00', fluxo: 55000, insercoes: 35200,
      tempo: '15s', loop: '3 min', veiculacao: 'Vídeo sem áudio',
      publico: 'A/B', telas: 3, preco: 2200,
      descricao: 'Principal shopping de Itajaí com grande fluxo diário.'
    },
    {
      nome: 'Restaurante Mar Aberto', cidade: 'Itajaí', tipo: 'Restaurante',
      endereco: 'Rua Beira Rio, 245 - Centro, Itajaí - SC',
      lat: -26.9050, lng: -48.6600,
      horario: '11:00 às 23:30', fluxo: 8000, insercoes: 5120,
      tempo: '15s', loop: '3 min', veiculacao: 'Vídeo sem áudio',
      publico: 'A', telas: 1, preco: 500,
      descricao: 'Restaurante de frutos do mar premium com vista para o rio Itajaí-Açu.'
    },
    {
      nome: 'Av. Higienópolis LED', cidade: 'Londrina', tipo: 'Via Pública',
      endereco: 'Av. Higienópolis, 1400 - Centro, Londrina - PR',
      lat: -23.3010, lng: -51.1620,
      horario: '24 horas', fluxo: 110000, insercoes: 52800,
      tempo: '15s', loop: '5 min', veiculacao: 'Vídeo sem áudio',
      publico: 'A/B', telas: 1, preco: 3200,
      descricao: 'Painel LED de alta visibilidade na avenida mais movimentada de Londrina.'
    }
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
