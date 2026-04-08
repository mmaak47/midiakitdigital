const API_BASE = '/api';
const MUTATION_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function getAdminToken() {
  if (typeof window === 'undefined') return null;
  const raw = window.sessionStorage.getItem('admin_token');
  return raw ? String(raw).trim() : null;
}

function isAdminContext() {
  if (typeof window === 'undefined') return true;
  const pathname = window.location.pathname;
  return pathname === '/comercial' || pathname.startsWith('/comercial/');
}

function isAdminOrSensitivePath(pathname) {
  return pathname.startsWith('/admin')
    || pathname.startsWith('/propostas')
    || pathname.startsWith('/geocode')
    || pathname === '/entorno/analyze'
    || pathname === '/entorno/client-address';
}

function ensureRequestPolicy(pathname, method) {
  const normalizedMethod = String(method || 'GET').toUpperCase();
  if (pathname === '/auth/login') return;

  const token = getAdminToken();
  const requiresToken = isAdminOrSensitivePath(pathname) || MUTATION_METHODS.has(normalizedMethod);

  if (requiresToken && !token) {
    throw new Error('Operação bloqueada no frontend: autenticação obrigatória.');
  }

  if (requiresToken && !isAdminContext()) {
    throw new Error('Operação bloqueada no frontend fora do contexto administrativo.');
  }
}

async function parseErrorResponse(res) {
  const data = await res.json().catch(() => ({}));
  return data?.error || data?.message || null;
}

async function apiRequest(pathname, options = {}) {
  const method = String(options.method || 'GET').toUpperCase();
  ensureRequestPolicy(pathname, method);

  const token = getAdminToken();
  const headers = { ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;

  const shouldSetJson = options.body && !(options.body instanceof FormData);
  if (shouldSetJson && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  return fetch(`${API_BASE}${pathname}`, {
    ...options,
    method,
    headers,
    credentials: 'same-origin'
  });
}

function appendParamValues(params, key, value) {
  if (Array.isArray(value)) {
    value.filter(Boolean).forEach((item) => params.append(key, item));
    return;
  }

  if (value) {
    params.set(key, value);
  }
}

export async function fetchPontos(filters = {}) {
  const params = new URLSearchParams();
  appendParamValues(params, 'cidade', filters.cidade);
  if (filters.tipo) params.set('tipo', filters.tipo);
  if (filters.elevador_categoria) params.set('elevador_categoria', filters.elevador_categoria);
  appendParamValues(params, 'publico', filters.publico);
  appendParamValues(params, 'audience_tag', filters.audience_tag);
  if (filters.availabilityPreference) params.set('availability_preference', filters.availabilityPreference);
  if (filters.search) params.set('search', filters.search);
  const query = params.toString();
  const res = await apiRequest(`/pontos${query ? `?${query}` : ''}`);
  if (!res.ok) throw new Error('Erro ao carregar pontos');
  return res.json();
}

export async function fetchPonto(id) {
  const res = await apiRequest(`/pontos/${id}`);
  if (!res.ok) throw new Error('Ponto não encontrado');
  return res.json();
}

export async function fetchStats() {
  const res = await apiRequest('/stats');
  if (!res.ok) throw new Error('Erro ao carregar estatísticas');
  return res.json();
}

export async function fetchPublicos() {
  const res = await apiRequest('/publicos');
  if (!res.ok) throw new Error('Erro ao carregar públicos');
  return res.json();
}

export async function login(username, password) {
  const res = await apiRequest('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password })
  });
  if (!res.ok) {
    const message = await parseErrorResponse(res);
    throw new Error(message || 'Erro ao fazer login');
  }
  return res.json();
}

export async function fetchAdminPontos() {
  const res = await apiRequest('/admin/pontos');
  if (!res.ok) {
    const message = await parseErrorResponse(res);
    throw new Error(message || 'Erro ao carregar pontos');
  }
  return res.json();
}

export async function fetchAdminUsers() {
  const res = await apiRequest('/admin/users');
  if (!res.ok) {
    const message = await parseErrorResponse(res);
    throw new Error(message || 'Erro ao carregar usuários');
  }
  return res.json();
}

export async function createAdminUser({ firstName, lastName, whatsapp, email, password, role }) {
  const res = await apiRequest('/admin/users', {
    method: 'POST',
    body: JSON.stringify({ firstName, lastName, whatsapp, email, password, role })
  });
  if (!res.ok) {
    const message = await parseErrorResponse(res);
    throw new Error(message || 'Erro ao criar usuário');
  }
  return res.json();
}

export async function deleteAdminUser(id) {
  const res = await apiRequest(`/admin/users/${id}`, {
    method: 'DELETE'
  });
  if (!res.ok) {
    const message = await parseErrorResponse(res);
    throw new Error(message || 'Erro ao remover usuário');
  }
  return res.json();
}

export async function fetchAdminPdfLayout() {
  const res = await apiRequest('/admin/pdf-layout');
  if (!res.ok) throw new Error('Erro ao carregar layout PDF');
  return res.json();
}

export async function saveAdminPdfLayout(overrides) {
  const res = await apiRequest('/admin/pdf-layout', {
    method: 'PUT',
    body: JSON.stringify({ overrides })
  });
  if (!res.ok) throw new Error('Erro ao salvar layout PDF');
  return res.json();
}

export async function resetAdminPdfLayout() {
  const res = await apiRequest('/admin/pdf-layout', {
    method: 'DELETE'
  });
  if (!res.ok) throw new Error('Erro ao resetar layout PDF');
  return res.json();
}

export async function createPonto(formData) {
  const res = await apiRequest('/pontos', {
    method: 'POST',
    body: formData
  });
  if (!res.ok) {
    const message = await parseErrorResponse(res);
    throw new Error(message || 'Erro ao criar ponto');
  }
  return res.json();
}

export async function updatePonto(id, formData) {
  const res = await apiRequest(`/pontos/${id}`, {
    method: 'PUT',
    body: formData
  });
  if (!res.ok) {
    const message = await parseErrorResponse(res);
    throw new Error(message || 'Erro ao atualizar ponto');
  }
  return res.json();
}

export async function deletePonto(id) {
  const res = await apiRequest(`/pontos/${id}`, {
    method: 'DELETE'
  });
  if (!res.ok) {
    const message = await parseErrorResponse(res);
    throw new Error(message || 'Erro ao deletar ponto');
  }
  return res.json();
}

export async function fetchEntornoScores({ segmento, raio = 800, cidade, force = false }) {
  const params = new URLSearchParams();
  if (segmento) params.set('segmento', segmento);
  if (raio) params.set('raio', String(raio));
  appendParamValues(params, 'cidade', cidade && cidade !== 'Todas' ? cidade : []);
  if (force) params.set('force', 'true');

  const res = await apiRequest(`/entorno/scores?${params.toString()}`);
  if (!res.ok) throw new Error('Erro ao carregar scores de entorno');
  return res.json();
}

export async function requestEntornoAnalysis({ segmento, raio = 800, cidade }) {
  const res = await apiRequest('/entorno/analyze', {
    method: 'POST',
    body: JSON.stringify({ segmento, raio, cidade })
  });
  if (!res.ok) throw new Error('Erro ao enfileirar analise de entorno');
  return res.json();
}

export async function fetchEntornoJobStatus(jobId) {
  const res = await apiRequest(`/entorno/jobs/${jobId}`);
  if (!res.ok) throw new Error('Erro ao consultar status da analise de entorno');
  return res.json();
}

export async function fetchEntornoCategories(segmento) {
  const params = new URLSearchParams();
  if (segmento) params.set('segmento', segmento);

  const query = params.toString();
  const res = await apiRequest(`/entorno/categories${query ? `?${query}` : ''}`);
  if (!res.ok) throw new Error('Erro ao carregar categorias de entorno');
  return res.json();
}

export async function fetchEntornoJobs({ limit = 20, status, segmento, cidade } = {}) {
  const params = new URLSearchParams();
  if (limit) params.set('limit', String(limit));
  if (status) params.set('status', status);
  if (segmento) params.set('segmento', segmento);
  appendParamValues(params, 'cidade', cidade && cidade !== 'Todas' ? cidade : []);

  const res = await apiRequest(`/entorno/jobs?${params.toString()}`);
  if (!res.ok) throw new Error('Erro ao carregar jobs de entorno');
  return res.json();
}

export async function fetchClientAddressAnalysis({ address, pointIds = [], cidade = [] }) {
  const res = await apiRequest('/entorno/client-address', {
    method: 'POST',
    body: JSON.stringify({ address, pointIds, cidade })
  });

  if (!res.ok) {
    const message = await parseErrorResponse(res);
    throw new Error(message || 'Erro ao analisar endereço do cliente');
  }

  return res.json();
}

export async function geocodePoint(address) {
  const res = await apiRequest(`/geocode?q=${encodeURIComponent(address)}`);
  if (!res.ok) {
    const message = await parseErrorResponse(res);
    throw new Error(message || 'Endereço não encontrado');
  }
  return res.json(); // { lat, lng }
}

// ============== GEO-AUDIENCE INTELLIGENCE ==============

export async function fetchGeoAudienceProfiles({ cidade } = {}) {
  const params = new URLSearchParams();
  if (cidade) params.set('cidade', cidade);
  const qs = params.toString();
  const res = await apiRequest(`/geoaudience/profiles${qs ? `?${qs}` : ''}`);
  if (!res.ok) {
    const message = await parseErrorResponse(res);
    throw new Error(message || 'Erro ao carregar perfis GeoAudience');
  }
  return res.json(); // { profiles: { [pontoId]: profile }, summary }
}

export async function fetchGeoAudienceProfile(pontoId) {
  const res = await apiRequest(`/geoaudience/profile/${pontoId}`);
  if (!res.ok) {
    const message = await parseErrorResponse(res);
    throw new Error(message || 'Perfil GeoAudience não encontrado');
  }
  return res.json();
}

export async function fetchGeoAudienceCoverage({ cidade } = {}) {
  const params = new URLSearchParams();
  if (cidade) params.set('cidade', cidade);
  const qs = params.toString();
  const res = await apiRequest(`/geoaudience/coverage${qs ? `?${qs}` : ''}`);
  if (!res.ok) {
    const message = await parseErrorResponse(res);
    throw new Error(message || 'Erro ao carregar cobertura GeoAudience');
  }
  return res.json();
}

export async function fetchGeoAudienceTypes() {
  const res = await apiRequest('/geoaudience/types');
  if (!res.ok) {
    const message = await parseErrorResponse(res);
    throw new Error(message || 'Erro ao carregar tipos de bairro');
  }
  return res.json();
}

export async function requestGeoAudienceAnalysis({ cidade, force = false } = {}) {
  const res = await apiRequest('/geoaudience/analyze', {
    method: 'POST',
    body: JSON.stringify({ cidade: cidade || null, force })
  });
  if (!res.ok) {
    const message = await parseErrorResponse(res);
    throw new Error(message || 'Erro ao iniciar análise GeoAudience');
  }
  return res.json();
}

// ============== CENSUS AUDIENCE CLASSIFICATION ==============

export async function fetchCensusProfiles({ municipio, perfil, minScore } = {}) {
  const params = new URLSearchParams();
  if (municipio) params.set('municipio', municipio);
  if (perfil) params.set('perfil', perfil);
  if (minScore) params.set('min_score', minScore);
  const qs = params.toString();
  const res = await apiRequest(`/census/profiles${qs ? `?${qs}` : ''}`);
  if (!res.ok) {
    const message = await parseErrorResponse(res);
    throw new Error(message || 'Erro ao carregar perfis censitários');
  }
  return res.json();
}

export async function fetchCensusProfile(pontoId) {
  const res = await apiRequest(`/census/profile/${pontoId}`);
  if (!res.ok) {
    const message = await parseErrorResponse(res);
    throw new Error(message || 'Perfil censitário não encontrado');
  }
  return res.json();
}

export async function fetchCensusGeoJSON({ municipio, perfil, minScore } = {}) {
  const params = new URLSearchParams();
  if (municipio) params.set('municipio', municipio);
  if (perfil) params.set('perfil', perfil);
  if (minScore) params.set('min_score', minScore);
  const qs = params.toString();
  const res = await apiRequest(`/census/geojson${qs ? `?${qs}` : ''}`);
  if (!res.ok) {
    const message = await parseErrorResponse(res);
    throw new Error(message || 'Erro ao gerar GeoJSON censitário');
  }
  return res.json();
}

export async function fetchCensusTypes() {
  const res = await apiRequest('/census/types');
  if (!res.ok) throw new Error('Erro ao carregar tipos de perfil censitário');
  return res.json();
}

export async function requestCensusAnalysis({ municipio, force = false } = {}) {
  const res = await apiRequest('/census/analyze', {
    method: 'POST',
    body: JSON.stringify({ municipio: municipio || null, force })
  });
  if (!res.ok) {
    const message = await parseErrorResponse(res);
    throw new Error(message || 'Erro ao iniciar análise censitária');
  }
  return res.json();
}

// ============== ADMIN SETTINGS ==============

export async function fetchAdminSettings() {
  const res = await apiRequest('/admin/settings');
  if (!res.ok) {
    const message = await parseErrorResponse(res);
    throw new Error(message || 'Erro ao carregar configurações');
  }
  return res.json();
}

export async function fetchAdminPdfCache() {
  const res = await apiRequest('/admin/pdf-cache');
  if (!res.ok) {
    const message = await parseErrorResponse(res);
    throw new Error(message || 'Erro ao carregar cache de PDFs');
  }
  return res.json();
}

export async function invalidateAdminPdfCache(id) {
  const res = await apiRequest(`/admin/pdf-cache/${id}`, {
    method: 'DELETE'
  });
  if (!res.ok) {
    const message = await parseErrorResponse(res);
    throw new Error(message || 'Erro ao invalidar cache de PDF');
  }
  return res.json();
}

export async function updateAdminSettings(settings) {
  const res = await apiRequest('/admin/settings', {
    method: 'PUT',
    body: JSON.stringify(settings)
  });
  if (!res.ok) {
    const message = await parseErrorResponse(res);
    throw new Error(message || 'Erro ao atualizar configurações');
  }
  return res.json();
}

// Retorna o usuário autenticado atual
export async function fetchCurrentUser() {
  const res = await apiRequest('/users/me');
  if (!res.ok) {
    const message = await parseErrorResponse(res);
    throw new Error(message || 'Erro ao carregar usuário');
  }
  return res.json();
}

// Listagem de vendas
export async function fetchVendas({ status, q } = {}) {
  const params = new URLSearchParams();
  if (status && status !== 'todas') params.set('status', status);
  if (q) params.set('q', q);
  const res = await apiRequest(`/vendas?${params}`);
  if (!res.ok) throw new Error('Erro ao buscar vendas');
  return res.json();
}

// Etapas pós-venda de uma venda (checklist validado por reação emoji)
export async function fetchVendaEtapas(vendaId) {
  const res = await apiRequest(`/vendas/${vendaId}/etapas`);
  if (!res.ok) throw new Error('Erro ao buscar etapas');
  return res.json();
}

// Deleta uma venda e suas etapas
export async function deleteVenda(id) {
  const res = await apiRequest(`/vendas/${id}`, {
    method: 'DELETE'
  });
  if (!res.ok) {
    const message = await parseErrorResponse(res);
    throw new Error(message || 'Erro ao deletar venda');
  }
  return res.json();
}

// Atualiza status de uma venda
export async function updateVendaStatus(id, { status, obs }) {
  const res = await apiRequest(`/vendas/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status, obs })
  });
  if (!res.ok) throw new Error('Erro ao atualizar venda');
  return res.json();
}

// Registra uma nova venda e dispara notificação WhatsApp
// Aceita FormData (multipart) para suportar upload do P.I. em PDF
export async function submitNovaVenda(formData) {
  const res = await apiRequest('/vendas', {
    method: 'POST',
    body: formData
  });
  if (!res.ok) {
    const message = await parseErrorResponse(res);
    throw new Error(message || 'Erro ao registrar venda');
  }
  return res.json();
}

export async function fetchCidadeFotos() {
  const res = await apiRequest('/cidade-fotos');
  if (!res.ok) throw new Error('Erro ao carregar fotos das cidades');
  return res.json();
}

export async function uploadCidadeFoto(cidade, imageFile) {
  const body = new FormData();
  body.append('cidade', cidade);
  body.append('image', imageFile);

  const res = await apiRequest('/cidade-fotos/upload', {
    method: 'POST',
    body
  });

  if (!res.ok) {
    const message = await parseErrorResponse(res);
    throw new Error(message || 'Erro ao fazer upload da foto da cidade');
  }

  return res.json();
}

export async function deleteCidadeFoto(slug) {
  const res = await apiRequest(`/cidade-fotos/${encodeURIComponent(slug)}`, {
    method: 'DELETE'
  });

  if (!res.ok) {
    const message = await parseErrorResponse(res);
    throw new Error(message || 'Erro ao remover foto da cidade');
  }

  return res.json();
}

// ============== PROPOSTAS ==============

export async function fetchPropostas(filters = {}) {
  const params = new URLSearchParams();
  if (filters.usuario_id) params.set('usuario_id', filters.usuario_id);
  if (filters.status) params.set('status', filters.status);
  if (filters.role) params.set('role', filters.role);

  const res = await apiRequest(`/propostas?${params.toString()}`);
  if (!res.ok) throw new Error('Erro ao carregar propostas');
  return res.json();
}

export async function fetchProposta(id) {
  const res = await apiRequest(`/propostas/${id}`);
  if (!res.ok) throw new Error('Proposta não encontrada');
  return res.json();
}

export async function createProposta(data) {
  const res = await apiRequest('/propostas', {
    method: 'POST',
    body: JSON.stringify(data)
  });
  if (!res.ok) {
    const message = await parseErrorResponse(res);
    throw new Error(message || 'Erro ao criar proposta');
  }
  return res.json();
}

export async function updateProposta(id, data) {
  const res = await apiRequest(`/propostas/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data)
  });
  if (!res.ok) {
    const message = await parseErrorResponse(res);
    throw new Error(message || 'Erro ao atualizar proposta');
  }
  return res.json();
}

export async function deleteProposta(id) {
  const res = await apiRequest(`/propostas/${id}`, {
    method: 'DELETE'
  });
  if (!res.ok) throw new Error('Erro ao deletar proposta');
  return res.json();
}

export async function aprovarProposta(id, { gerente_id, motivo }) {
  const res = await apiRequest(`/propostas/${id}/aprovar`, {
    method: 'POST',
    body: JSON.stringify({ gerente_id, motivo })
  });
  if (!res.ok) {
    const message = await parseErrorResponse(res);
    throw new Error(message || 'Erro ao aprovar proposta');
  }
  return res.json();
}

export async function rejeitarProposta(id, { gerente_id, motivo_rejeicao }) {
  const res = await apiRequest(`/propostas/${id}/rejeitar`, {
    method: 'POST',
    body: JSON.stringify({ gerente_id, motivo_rejeicao })
  });
  if (!res.ok) {
    const message = await parseErrorResponse(res);
    throw new Error(message || 'Erro ao rejeitar proposta');
  }
  return res.json();
}

// ============== ADMIN USERS WITH ROLES ==============

export async function updateAdminUserRole(id, role) {
  const res = await apiRequest(`/admin/users/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ role })
  });
  if (!res.ok) {
    const message = await parseErrorResponse(res);
    throw new Error(message || 'Erro ao atualizar role do usuário');
  }
  return res.json();
}

// ============== AUDIENCE INTELLIGENCE ==============

export async function fetchAudienceProfiles() {
  const res = await apiRequest('/audience-intel/profiles');
  if (!res.ok) throw new Error('Erro ao buscar perfis de audiência');
  return res.json();
}

export async function upsertAudienceProfile(name, { label, description, weights }) {
  const res = await apiRequest(`/audience-intel/profiles/${encodeURIComponent(name)}`, {
    method: 'PUT',
    body: JSON.stringify({ label, description, weights })
  });
  if (!res.ok) {
    const message = await parseErrorResponse(res);
    throw new Error(message || 'Erro ao salvar perfil');
  }
  return res.json();
}

export async function deleteAudienceProfile(name) {
  const res = await apiRequest(`/audience-intel/profiles/${encodeURIComponent(name)}`, {
    method: 'DELETE'
  });
  if (!res.ok) {
    const message = await parseErrorResponse(res);
    throw new Error(message || 'Erro ao excluir perfil');
  }
  return res.json();
}

export async function fetchAudienceScores({ cidade, profile, minScore } = {}) {
  const params = new URLSearchParams();
  if (cidade) params.set('cidade', cidade);
  if (profile) params.set('profile', profile);
  if (minScore) params.set('minScore', minScore);
  const qs = params.toString();
  const res = await apiRequest(`/audience-intel/scores${qs ? '?' + qs : ''}`);
  if (!res.ok) throw new Error('Erro ao buscar scores');
  return res.json();
}

export async function fetchAudiencePointScores(pontoId) {
  const res = await apiRequest(`/audience-intel/scores/${pontoId}`);
  if (!res.ok) throw new Error('Erro ao buscar scores do ponto');
  return res.json();
}

export async function fetchAudienceRanking({ profile, cidade, limit } = {}) {
  const params = new URLSearchParams();
  if (profile) params.set('profile', profile);
  if (cidade) params.set('cidade', cidade);
  if (limit) params.set('limit', String(limit));
  const qs = params.toString();
  const res = await apiRequest(`/audience-intel/ranking${qs ? '?' + qs : ''}`);
  if (!res.ok) throw new Error('Erro ao buscar ranking');
  return res.json();
}

export async function requestAudienceAnalysis(pontoId, { force = false } = {}) {
  const res = await apiRequest(`/audience-intel/analyze/${pontoId}${force ? '?force=1' : ''}`, {
    method: 'POST'
  });
  if (!res.ok) {
    const message = await parseErrorResponse(res);
    throw new Error(message || 'Erro ao analisar ponto');
  }
  return res.json();
}

export async function requestAudienceCityAnalysis({ cidade, force = false } = {}) {
  const res = await apiRequest('/audience-intel/analyze-city', {
    method: 'POST',
    body: JSON.stringify({ cidade, force })
  });
  if (!res.ok) {
    const message = await parseErrorResponse(res);
    throw new Error(message || 'Erro ao iniciar análise');
  }
  return res.json();
}

export async function fetchAudienceJob(jobId) {
  const res = await apiRequest(`/audience-intel/jobs/${jobId}`);
  if (!res.ok) throw new Error('Erro ao buscar status do job');
  return res.json();
}

export async function fetchAudienceHeatmap({ profile, cidade, bounds, cellSize } = {}) {
  const params = new URLSearchParams();
  if (profile) params.set('profile', profile);
  if (cidade) params.set('cidade', cidade);
  if (bounds) params.set('bounds', bounds.join(','));
  if (cellSize) params.set('cellSize', String(cellSize));
  const qs = params.toString();
  const res = await apiRequest(`/audience-intel/heatmap${qs ? '?' + qs : ''}`);
  if (!res.ok) throw new Error('Erro ao buscar heatmap');
  return res.json();
}

export async function simulateCampaign({ selectedPoints, investment, periodDays }) {
  const res = await apiRequest('/audience-intel/simulate', {
    method: 'POST',
    body: JSON.stringify({ selectedPoints, investment, periodDays })
  });
  if (!res.ok) {
    const message = await parseErrorResponse(res);
    throw new Error(message || 'Erro na simulação');
  }
  return res.json();
}

// ============== ARTE IA (Replicate / Flux 1.1 Pro) ==============

/**
 * Verifica se o REPLICATE_API_TOKEN está configurado no backend.
 */
export async function fetchArteConfig() {
  const res = await apiRequest('/arte/config');
  if (!res.ok) throw new Error('Erro ao verificar config de arte IA');
  return res.json(); // { configured: boolean, provider: string }
}

export async function uploadArteLogo(file) {
  const body = new FormData();
  body.append('logo', file);

  const res = await apiRequest('/arte/upload-logo', {
    method: 'POST',
    body
  });

  if (!res.ok) {
    const message = await parseErrorResponse(res);
    throw new Error(message || 'Erro ao fazer upload do logo do cliente');
  }

  return res.json(); // { ok, url, filename }
}

/**
 * Retorna o prompt que seria gerado para um ponto sem chamar a API.
 */
export async function previewPromptArte({ ponto, contexto = {} }) {
  const res = await apiRequest('/arte/preview-prompt', {
    method: 'POST',
    body: JSON.stringify({ ponto, contexto })
  });
  if (!res.ok) {
    const message = await parseErrorResponse(res);
    throw new Error(message || 'Erro ao gerar preview do prompt');
  }
  return res.json(); // { prompt: string }
}

/**
 * Gera arte IA para um único ponto.
 * @param {Object} params
 * @param {number} params.ponto_id
 * @param {number|null} params.proposta_id
 * @param {Object} params.contexto - { segmento, cidade }
 * @param {string|null} params.prompt_customizado
 */
export async function gerarArteIA({ ponto_id, proposta_id, contexto, prompt_customizado }) {
  const res = await apiRequest('/arte/gerar', {
    method: 'POST',
    body: JSON.stringify({ ponto_id, proposta_id, contexto, prompt_customizado })
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const err = new Error(data.error || 'Erro ao gerar arte');
    err.retry = data.retry || false;
    err.status = res.status;
    throw err;
  }
  return res.json();
  // { geracao_id, ponto_id, ponto_nome, variacoes, prompt, resolucao_nativa, resolucao_geracao, normalizado, orientacao, duracao_ms }
}

/**
 * Gera arte IA para múltiplos pontos em paralelo.
 * @param {Object} params
 * @param {number[]} params.ponto_ids
 * @param {number|null} params.proposta_id
 * @param {Object} params.contexto - { segmento, cidade }
 * @param {boolean} params.agrupar_por_resolucao - default true
 */
export async function gerarArteLoteIA({ ponto_ids, proposta_id, contexto, agrupar_por_resolucao = true }) {
  const res = await apiRequest('/arte/gerar-lote', {
    method: 'POST',
    body: JSON.stringify({ ponto_ids, proposta_id, contexto, agrupar_por_resolucao })
  });
  if (!res.ok) {
    const message = await parseErrorResponse(res);
    throw new Error(message || 'Erro ao gerar arte em lote');
  }
  return res.json();
  // { total_pontos, total_geracoes, total_erros, resultados, erros }
}

/**
 * Busca histórico de gerações de arte de uma proposta.
 */
export async function fetchArteGeracoes(propostaId) {
  const res = await apiRequest(`/arte/geracoes/${propostaId}`);
  if (!res.ok) throw new Error('Erro ao buscar gerações de arte');
  return res.json();
}

/**
 * Marca qual variação foi escolhida para uma geração.
 */
export async function escolherVariacaoArte(geracaoId, variacaoEscolhida) {
  const res = await apiRequest(`/arte/geracoes/${geracaoId}/escolha`, {
    method: 'PATCH',
    body: JSON.stringify({ variacao_escolhida: variacaoEscolhida })
  });
  if (!res.ok) throw new Error('Erro ao registrar escolha de variação');
  return res.json();
}

/**
 * Busca métricas de geração de arte (admin).
 */
export async function fetchArteStats() {
  const res = await apiRequest('/arte/stats');
  if (!res.ok) throw new Error('Erro ao buscar stats de arte IA');
  return res.json();
}
