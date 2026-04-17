import { useEffect, useMemo, useState } from 'react';
import { Save, UserRound, X } from 'lucide-react';

const INITIAL_FORM = {
  tipoUsuario: 'vendedor',
  status: 'ativo',
  nome: '',
  email: '',
  login: '',
  senha: '',
  isVendedor: false,
};

function buildInitialForm(initialData) {
  if (!initialData) return INITIAL_FORM;

  const fullName = [initialData.first_name, initialData.last_name]
    .filter(Boolean)
    .join(' ')
    .trim();

  return {
    tipoUsuario: initialData.role || 'vendedor',
    status: initialData.status || 'ativo',
    nome: fullName,
    email: initialData.email || '',
    login: initialData.username || '',
    senha: '',
    isVendedor: Boolean(initialData.is_vendedor),
  };
}

export default function UserModal({ isOpen, onClose, onSave, initialData, isDark = true }) {
  const [form, setForm] = useState(INITIAL_FORM);
  const [errors, setErrors] = useState({});

  const isEdit = useMemo(() => Boolean(initialData), [initialData]);

  // Auto-gera o login a partir do nome (primeiro.ultimo)
  const autoLogin = useMemo(() => {
    const parts = String(form.nome || '').trim().split(/\s+/).filter(Boolean);
    if (parts.length < 2) return '';
    const first = parts[0];
    const last = parts[parts.length - 1];
    return `${first}.${last}`.toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9.]/g, '');
  }, [form.nome]);

  useEffect(() => {
    if (!isOpen) return;
    setForm(buildInitialForm(initialData));
    setErrors({});
  }, [isOpen, initialData]);

  // Sincroniza o login auto-gerado sempre que o nome muda (apenas em criação)
  useEffect(() => {
    if (isEdit) return;
    setForm((prev) => ({ ...prev, login: autoLogin }));
  }, [autoLogin, isEdit]);

  if (!isOpen) return null;

  const validate = () => {
    const nextErrors = {};

    if (!String(form.tipoUsuario || '').trim()) {
      nextErrors.tipoUsuario = 'Selecione o tipo de usuário.';
    }
    if (!String(form.nome || '').trim()) {
      nextErrors.nome = 'Informe o nome.';
    }
    if (!String(form.login || '').trim()) {
      nextErrors.login = 'Informe o login.';
    }

    if (!isEdit && !String(form.senha || '').trim()) {
      nextErrors.senha = 'Informe a senha para criar o usuário.';
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!validate()) return;
    onSave?.(form);
  };

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center px-4 backdrop-blur-sm ${isDark ? 'bg-black/75' : 'bg-black/40'}`}
      onClick={onClose}
      role="presentation"
    >
      <div
        className={`w-full max-w-lg rounded-2xl border p-6 shadow-2xl ${isDark ? 'border-white/10 bg-[#121212] text-white shadow-black/40' : 'border-neutral-200 bg-white text-neutral-900 shadow-neutral-300/30'}`}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="mb-5 flex items-start justify-between">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-brand-orange/15 text-brand-orange">
              <UserRound size={18} />
            </span>
            <div>
              <h3 className={`text-lg font-bold ${isDark ? 'text-white' : 'text-neutral-900'}`}>{isEdit ? 'Editar Usuário' : 'Novo Usuário'}</h3>
              <p className={`text-xs ${isDark ? 'text-brand-gray-500' : 'text-neutral-500'}`}>Preencha os dados e confirme para salvar.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={`rounded-lg p-1.5 transition-colors ${isDark ? 'text-brand-gray-500 hover:bg-white/10 hover:text-white' : 'text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700'}`}
            aria-label="Fechar modal"
          >
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Tipo de Usuário" required error={errors.tipoUsuario} isDark={isDark}>
              <select
                value={form.tipoUsuario}
                onChange={(event) => setForm((prev) => ({ ...prev, tipoUsuario: event.target.value }))}
                className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none ${isDark ? 'border-white/10 bg-white/5 text-white focus:border-brand-orange/40' : 'border-neutral-300 bg-neutral-50 text-neutral-900 focus:border-brand-orange/60'}`}
              >
                <option value="admin">Admin</option>
                <option value="gerente_comercial">Gerente Comercial</option>
                <option value="vendedor">Vendedor</option>
              </select>
            </Field>

            <Field label="Status" error={errors.status} isDark={isDark}>
              <select
                value={form.status}
                onChange={(event) => setForm((prev) => ({ ...prev, status: event.target.value }))}
                className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none ${isDark ? 'border-white/10 bg-white/5 text-white focus:border-brand-orange/40' : 'border-neutral-300 bg-neutral-50 text-neutral-900 focus:border-brand-orange/60'}`}
              >
                <option value="ativo">Ativo</option>
                <option value="inativo">Inativo</option>
              </select>
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Nome" required error={errors.nome} isDark={isDark}>
              <input
                type="text"
                value={form.nome}
                onChange={(event) => setForm((prev) => ({ ...prev, nome: event.target.value }))}
                className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none ${isDark ? 'border-white/10 bg-white/5 text-white placeholder:text-brand-gray-600 focus:border-brand-orange/40' : 'border-neutral-300 bg-neutral-50 text-neutral-900 placeholder:text-neutral-400 focus:border-brand-orange/60'}`}
              />
            </Field>

            <Field label="E-mail" error={errors.email} isDark={isDark}>
              <input
                type="email"
                value={form.email}
                onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
                className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none ${isDark ? 'border-white/10 bg-white/5 text-white placeholder:text-brand-gray-600 focus:border-brand-orange/40' : 'border-neutral-300 bg-neutral-50 text-neutral-900 placeholder:text-neutral-400 focus:border-brand-orange/60'}`}
              />
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Login" required error={errors.login} isDark={isDark}>
              <input
                type="text"
                value={form.login}
                readOnly={!isEdit}
                onChange={isEdit ? (event) => setForm((prev) => ({ ...prev, login: event.target.value })) : undefined}
                title={!isEdit ? 'Gerado automaticamente a partir do nome' : undefined}
                className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none ${isEdit ? (isDark ? 'border-white/10 bg-white/5 text-white focus:border-brand-orange/40' : 'border-neutral-300 bg-neutral-50 text-neutral-900 focus:border-brand-orange/60') : (isDark ? 'border-white/10 bg-white/[0.02] text-white cursor-default opacity-70' : 'border-neutral-200 bg-neutral-100 text-neutral-500 cursor-default opacity-70')}`}
              />
              {!isEdit && form.login && (
                <span className={`mt-1 block text-[11px] ${isDark ? 'text-brand-gray-500' : 'text-neutral-400'}`}>Gerado automaticamente a partir do nome</span>
              )}
            </Field>

            <Field label="Senha" error={errors.senha} isDark={isDark}>
              <input
                type="password"
                value={form.senha}
                onChange={(event) => setForm((prev) => ({ ...prev, senha: event.target.value }))}
                placeholder="Deixe em branco para manter"
                className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none ${isDark ? 'border-white/10 bg-white/5 text-white placeholder:text-brand-gray-600 focus:border-brand-orange/40' : 'border-neutral-300 bg-neutral-50 text-neutral-900 placeholder:text-neutral-400 focus:border-brand-orange/60'}`}
              />
            </Field>
          </div>

          <label className={`flex items-center gap-3 cursor-pointer rounded-lg border px-4 py-3 transition-colors ${isDark ? 'border-white/10 bg-white/[0.03] hover:bg-white/[0.06]' : 'border-neutral-200 bg-neutral-50 hover:bg-neutral-100'}`}>
            <input
              type="checkbox"
              checked={form.isVendedor}
              onChange={(event) => setForm((prev) => ({ ...prev, isVendedor: event.target.checked }))}
              className="h-4 w-4 rounded border-white/20 accent-brand-orange"
            />
            <div>
              <span className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-neutral-800'}`}>É vendedor (Gestão Comercial)</span>
              <p className={`text-xs ${isDark ? 'text-brand-gray-500' : 'text-neutral-500'}`}>Marcar esta opção faz este usuário aparecer como vendedor na planilha de gestão comercial, independente do cargo.</p>
            </div>
          </label>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className={`rounded-lg border px-4 py-2 text-sm font-semibold transition-colors ${isDark ? 'border-white/15 bg-white/5 text-white hover:bg-white/10' : 'border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-100'}`}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="inline-flex items-center gap-2 rounded-lg bg-brand-orange px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-orange-hover"
            >
              <Save size={14} />
              Salvar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({ label, required = false, error, children, isDark = true }) {
  return (
    <label className="block">
      <span className={`mb-1 block text-xs font-semibold uppercase tracking-wide ${isDark ? 'text-brand-gray-400' : 'text-neutral-500'}`}>
        {label} {required ? <span className="text-brand-orange">*</span> : null}
      </span>
      {children}
      {error ? <span className={`mt-1 block text-xs ${isDark ? 'text-red-300' : 'text-red-500'}`}>{error}</span> : null}
    </label>
  );
}
