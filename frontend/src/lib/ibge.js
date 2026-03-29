// AUDITORIA IBGE
// Endpoint utilizado neste arquivo:
// - https://servicodados.ibge.gov.br/api/v1/localidades/municipios?nome={cidade}&orderBy=nome
// Dados retornados: codigo do municipio, UF, regiao, micro e mesorregiao.
// Consumo atual: StrategicPlanner (contexto territorial basico por cidade selecionada).
// Este arquivo nao consulta populacao nem PIB per capita.

const IBGE_BASE_URL = 'https://servicodados.ibge.gov.br/api/v1/localidades/municipios';
const IBGE_TIMEOUT_MS = 10000;

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function pickBestMunicipioMatch(items, cityName) {
  if (!Array.isArray(items) || !items.length) {
    return null;
  }

  const normalizedTarget = normalizeText(cityName);
  return items.find((item) => normalizeText(item?.nome) === normalizedTarget) || items[0];
}

function mapMunicipioToProfile(cityName, municipio) {
  if (!municipio) return null;

  const uf = municipio?.microrregiao?.mesorregiao?.UF;
  return {
    city: cityName,
    ibgeCode: municipio.id || null,
    municipality: municipio.nome || cityName,
    state: uf?.nome || '',
    stateCode: uf?.sigla || '',
    region: uf?.regiao?.nome || '',
    mesoregion: municipio?.microrregiao?.mesorregiao?.nome || '',
    microregion: municipio?.microrregiao?.nome || '',
    source: 'IBGE'
  };
}

export async function fetchIbgeCityProfile(cityName) {
  const cleaned = String(cityName || '').trim();
  if (!cleaned) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), IBGE_TIMEOUT_MS);

  try {
    const url = `${IBGE_BASE_URL}?nome=${encodeURIComponent(cleaned)}&orderBy=nome`;
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Falha ao consultar IBGE (${response.status})`);
    }

    const data = await response.json();
    const match = pickBestMunicipioMatch(data, cleaned);
    return mapMunicipioToProfile(cleaned, match);
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchIbgeCityProfiles(cityNames = []) {
  const uniqueCities = Array.from(new Set(
    (Array.isArray(cityNames) ? cityNames : [])
      .map((city) => String(city || '').trim())
      .filter(Boolean)
  ));

  if (!uniqueCities.length) {
    return { profiles: {}, errors: {} };
  }

  const results = await Promise.allSettled(uniqueCities.map((city) => fetchIbgeCityProfile(city)));

  const profiles = {};
  const errors = {};

  results.forEach((result, index) => {
    const city = uniqueCities[index];
    if (result.status === 'fulfilled' && result.value) {
      profiles[city] = result.value;
      return;
    }

    errors[city] = result.status === 'rejected'
      ? (result.reason?.message || 'Erro ao consultar dados do IBGE')
      : 'Cidade nao encontrada no IBGE';
  });

  return { profiles, errors };
}
