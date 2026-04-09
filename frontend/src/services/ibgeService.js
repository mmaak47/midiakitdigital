// AUDITORIA IBGE
// Endpoints utilizados neste arquivo:
// 1) Municipios: https://servicodados.ibge.gov.br/api/v1/localidades/municipios
//    Retorna a lista de municipios com id IBGE e metadados territoriais.
// 2) Populacao (agregado 4709):
//    https://servicodados.ibge.gov.br/api/v3/agregados/4709/periodos/2022/variaveis/93?localidades=N6[municipio_code]
//    Retorna serie com populacao para o municipio no periodo selecionado.
// 3) PIB per capita (agregado 5938):
//    https://servicodados.ibge.gov.br/api/v3/agregados/5938/periodos/2021/variaveis/37?localidades=N6[municipio_code]
//    Retorna serie com valor de PIB per capita para o municipio no periodo selecionado.
// Consumo atual:
// - StrategicPlanner consulta getMunicipioCode/getPopulacao/getPIBPerCapita
//   para exibir uma linha contextual da praca selecionada.

const BASE_LOCALIDADES = 'https://servicodados.ibge.gov.br/api/v1/localidades/municipios';
const BASE_POPULACAO = 'https://servicodados.ibge.gov.br/api/v3/agregados/4709/periodos/2022/variaveis/93';
const BASE_PIB_PER_CAPITA = 'https://servicodados.ibge.gov.br/api/v3/agregados/5938/periodos/2021/variaveis/37';

const municipioCodeCache = new Map();
const populationCache = new Map();
const gdpCache = new Map();
let municipiosPromise = null;

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function parseIbgeValue(rawValue) {
  if (rawValue === null || rawValue === undefined || rawValue === '-' || rawValue === '') {
    return null;
  }

  const raw = String(rawValue).trim();
  if (!raw) return null;

  const normalized = raw.includes(',')
    ? raw.replace(/\./g, '').replace(',', '.')
    : raw.replace(/,/g, '');

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function extractFirstSeriesValue(payload) {
  const serie = payload?.[0]?.resultados?.[0]?.series?.[0]?.serie;
  if (!serie || typeof serie !== 'object') return null;
  const firstKey = Object.keys(serie)[0];
  if (!firstKey) return null;
  return parseIbgeValue(serie[firstKey]);
}

async function getMunicipiosList() {
  if (!municipiosPromise) {
    municipiosPromise = fetch(BASE_LOCALIDADES, { headers: { Accept: 'application/json' } })
      .then((response) => {
        if (!response.ok) throw new Error('Falha ao buscar municipios do IBGE');
        return response.json();
      })
      .catch((error) => {
        municipiosPromise = null;
        throw error;
      });
  }

  return municipiosPromise;
}

export async function getMunicipioCode(cityName) {
  try {
    const normalized = normalizeText(cityName);
    if (!normalized) return null;

    if (municipioCodeCache.has(normalized)) {
      return municipioCodeCache.get(normalized);
    }

    const municipios = await getMunicipiosList();
    const match = (Array.isArray(municipios) ? municipios : []).find((municipio) => {
      return normalizeText(municipio?.nome) === normalized;
    });

    const code = match?.id ? String(match.id) : null;
    municipioCodeCache.set(normalized, code);
    return code;
  } catch {
    return null;
  }
}

export async function getPopulacao(municipioCode) {
  try {
    const normalizedCode = String(municipioCode || '').trim();
    if (!normalizedCode) return null;

    if (populationCache.has(normalizedCode)) {
      return populationCache.get(normalizedCode);
    }

    const url = `${BASE_POPULACAO}?localidades=N6[${encodeURIComponent(normalizedCode)}]`;
    const response = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error('Falha ao buscar populacao no IBGE');

    const payload = await response.json();
    const value = extractFirstSeriesValue(payload);
    populationCache.set(normalizedCode, value);
    return value;
  } catch {
    return null;
  }
}

export async function getPIBPerCapita(municipioCode) {
  try {
    const normalizedCode = String(municipioCode || '').trim();
    if (!normalizedCode) return null;

    if (gdpCache.has(normalizedCode)) {
      return gdpCache.get(normalizedCode);
    }

    const url = `${BASE_PIB_PER_CAPITA}?localidades=N6[${encodeURIComponent(normalizedCode)}]`;
    const response = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error('Falha ao buscar PIB per capita no IBGE');

    const payload = await response.json();
    const value = extractFirstSeriesValue(payload);
    gdpCache.set(normalizedCode, value);
    return value;
  } catch {
    return null;
  }
}
