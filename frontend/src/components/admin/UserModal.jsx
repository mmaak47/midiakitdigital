import { useEffect, useMemo, useState } from 'react';
import { Save, UserRound, X } from 'lucide-react';

const INITIAL_FORM = {
  tipoUsuario: 'vendedor',
  status: 'ativo',
  nome: '',
  email: '',
  login: '',
  senha: '',
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
  };
}

export default function UserModal({ isOpen, onClose, onSave, initialData }) {
  const [form, setForm] = useState(INITIAL_FORM);
  const [errors, setErrors] = useState({});

  const isEdit = useMemo(() => Boolean(initialData), [initialData]);

  useEffect(() => {
    if (!isOpen) return;
    setForm(buildInitialForm(initialData));
    setErrors({});
  }, [isOpen, initialData]);

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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="mb-5 flex items-start justify-between">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-orange-100 text-[#E8591A]">
              <UserRound size={18} />
            </span>
            <div>
              <h3 className="text-lg font-bold text-gray-900">Novo Usuário</h3>
              <p className="text-xs text-gray-500">Preencha os dados e confirme para salvar.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
            aria-label="Fechar modal"
          >
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Tipo de Usuário" required error={errors.tipoUsuario}>
              <select
                value={form.tipoUsuario}
                onChange={(event) => setForm((prev) => ({ ...prev, tipoUsuario: event.target.value }))}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-orange-500"
              >
                <option value="admin">Admin</option>
                <option value="gerente_comercial">Gerente Comercial</option>
                <option value="vendedor">Vendedor</option>
              </select>
            </Field>

            <Field label="Status" error={errors.status}>
              <select
                value={form.status}
                onChange={(event) => setForm((prev) => ({ ...prev, status: event.target.value }))}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-orange-500"
              >
                <option value="ativo">Ativo</option>
                <option value="inativo">Inativo</option>
              </select>
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Nome" required error={errors.nome}>
              <input
                type="text"
                value={form.nome}
                onChange={(event) => setForm((prev) => ({ ...prev, nome: event.target.value }))}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </Field>

            <Field label="E-mail" error={errors.email}>
              <input
                type="email"
                value={form.email}
                onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Login" required error={errors.login}>
              <input
                type="text"
                value={form.login}
                onChange={(event) => setForm((prev) => ({ ...prev, login: event.target.value }))}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </Field>

            <Field label="Senha" error={errors.senha}>
              <input
                type="password"
                value={form.senha}
                onChange={(event) => setForm((prev) => ({ ...prev, senha: event.target.value }))}
                placeholder="Deixe em branco para manter"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </Field>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-600 transition-colors hover:bg-gray-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-green-700"
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

function Field({ label, required = false, error, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">
        {label} {required ? <span className="text-red-500">*</span> : null}
      </span>
      {children}
      {error ? <span className="mt-1 block text-xs text-red-500">{error}</span> : null}
    </label>
  );
}
