const API_BASE = '/api';

export async function fetchPontos(filters = {}) {
  const params = new URLSearchParams();
  if (filters.cidade) params.set('cidade', filters.cidade);
  if (filters.tipo) params.set('tipo', filters.tipo);
  if (filters.publico) params.set('publico', filters.publico);
  if (filters.search) params.set('search', filters.search);
  const res = await fetch(`${API_BASE}/pontos?${params}`);
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
