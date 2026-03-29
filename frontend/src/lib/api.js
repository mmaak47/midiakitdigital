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
  if (!res.ok) throw new Error('Erro ao carregar pontos');
  return res.json();
}

export async function fetchAdminUsers() {
  const res = await apiRequest('/admin/users');
  if (!res.ok) throw new Error('Erro ao carregar usuários');
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

// ============== ADMIN SETTINGS ==============

export async function fetchAdminSettings() {
  const res = await apiRequest('/admin/settings');
  if (!res.ok) throw new Error('Erro ao carregar configurações');
  return res.json();
}

export async function fetchAdminPdfCache() {
  const res = await apiRequest('/admin/pdf-cache');
  if (!res.ok) throw new Error('Erro ao carregar cache de PDFs');
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
