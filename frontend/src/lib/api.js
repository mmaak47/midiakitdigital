const API_BASE = '/api';

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
  appendParamValues(params, 'publico', filters.publico);
  if (filters.search) params.set('search', filters.search);
  const query = params.toString();
  const res = await fetch(`${API_BASE}/pontos${query ? `?${query}` : ''}`);
  if (!res.ok) throw new Error('Erro ao carregar pontos');
  return res.json();
}

export async function fetchPonto(id) {
  const res = await fetch(`${API_BASE}/pontos/${id}`);
  if (!res.ok) throw new Error('Ponto não encontrado');
  return res.json();
}

export async function fetchStats() {
  const res = await fetch(`${API_BASE}/stats`);
  if (!res.ok) throw new Error('Erro ao carregar estatísticas');
  return res.json();
}

export async function fetchPublicos() {
  const res = await fetch(`${API_BASE}/publicos`);
  if (!res.ok) throw new Error('Erro ao carregar públicos');
  return res.json();
}

export async function login(username, password) {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error || 'Erro ao fazer login');
  }
  return res.json();
}

export async function fetchAdminPontos() {
  const res = await fetch(`${API_BASE}/admin/pontos`);
  if (!res.ok) throw new Error('Erro ao carregar pontos');
  return res.json();
}

export async function fetchAdminUsers() {
  const res = await fetch(`${API_BASE}/admin/users`);
  if (!res.ok) throw new Error('Erro ao carregar usuários');
  return res.json();
}

export async function createAdminUser({ username, password }) {
  const res = await fetch(`${API_BASE}/admin/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Erro ao criar usuário');
  }
  return res.json();
}

export async function deleteAdminUser(id) {
  const res = await fetch(`${API_BASE}/admin/users/${id}`, {
    method: 'DELETE'
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Erro ao remover usuário');
  }
  return res.json();
}

export async function fetchAdminPdfLayout() {
  const res = await fetch(`${API_BASE}/admin/pdf-layout`);
  if (!res.ok) throw new Error('Erro ao carregar layout PDF');
  return res.json();
}

export async function saveAdminPdfLayout(overrides) {
  const res = await fetch(`${API_BASE}/admin/pdf-layout`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ overrides })
  });
  if (!res.ok) throw new Error('Erro ao salvar layout PDF');
  return res.json();
}

export async function resetAdminPdfLayout() {
  const res = await fetch(`${API_BASE}/admin/pdf-layout`, {
    method: 'DELETE'
  });
  if (!res.ok) throw new Error('Erro ao resetar layout PDF');
  return res.json();
}

export async function createPonto(formData) {
  const res = await fetch(`${API_BASE}/pontos`, {
    method: 'POST',
    body: formData
  });
  if (!res.ok) throw new Error('Erro ao criar ponto');
  return res.json();
}

export async function updatePonto(id, formData) {
  const res = await fetch(`${API_BASE}/pontos/${id}`, {
    method: 'PUT',
    body: formData
  });
  if (!res.ok) throw new Error('Erro ao atualizar ponto');
  return res.json();
}

export async function deletePonto(id) {
  const res = await fetch(`${API_BASE}/pontos/${id}`, {
    method: 'DELETE'
  });
  if (!res.ok) throw new Error('Erro ao deletar ponto');
  return res.json();
}

export async function fetchEntornoScores({ segmento, raio = 800, cidade, force = false }) {
  const params = new URLSearchParams();
  if (segmento) params.set('segmento', segmento);
  if (raio) params.set('raio', String(raio));
  appendParamValues(params, 'cidade', cidade && cidade !== 'Todas' ? cidade : []);
  if (force) params.set('force', 'true');

  const res = await fetch(`${API_BASE}/entorno/scores?${params.toString()}`);
  if (!res.ok) throw new Error('Erro ao carregar scores de entorno');
  return res.json();
}

export async function requestEntornoAnalysis({ segmento, raio = 800, cidade }) {
  const res = await fetch(`${API_BASE}/entorno/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ segmento, raio, cidade })
  });
  if (!res.ok) throw new Error('Erro ao enfileirar analise de entorno');
  return res.json();
}

export async function fetchEntornoJobStatus(jobId) {
  const res = await fetch(`${API_BASE}/entorno/jobs/${jobId}`);
  if (!res.ok) throw new Error('Erro ao consultar status da analise de entorno');
  return res.json();
}

export async function fetchEntornoCategories(segmento) {
  const params = new URLSearchParams();
  if (segmento) params.set('segmento', segmento);

  const query = params.toString();
  const res = await fetch(`${API_BASE}/entorno/categories${query ? `?${query}` : ''}`);
  if (!res.ok) throw new Error('Erro ao carregar categorias de entorno');
  return res.json();
}

export async function fetchEntornoJobs({ limit = 20, status, segmento, cidade } = {}) {
  const params = new URLSearchParams();
  if (limit) params.set('limit', String(limit));
  if (status) params.set('status', status);
  if (segmento) params.set('segmento', segmento);
  appendParamValues(params, 'cidade', cidade && cidade !== 'Todas' ? cidade : []);

  const res = await fetch(`${API_BASE}/entorno/jobs?${params.toString()}`);
  if (!res.ok) throw new Error('Erro ao carregar jobs de entorno');
  return res.json();
}

export async function fetchClientAddressAnalysis({ address, pointIds = [], cidade = [] }) {
  const res = await fetch(`${API_BASE}/entorno/client-address`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address, pointIds, cidade })
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Erro ao analisar endereço do cliente');
  }

  return res.json();
}
