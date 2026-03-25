import { useEffect, useMemo, useState } from 'react';
import { Check, Copy, Loader2, RotateCcw, Server, SlidersHorizontal, Upload } from 'lucide-react';
import {
  PDF_CALIBRATION_GROUPS,
  PDF_LAYOUT_STORAGE_KEY,
  getDefaultPdfLayoutConfig,
  getStoredPdfLayoutOverrides,
  savePdfLayoutOverrides,
  resetPdfLayoutOverrides
} from '../../lib/pdfLayoutConfig';
import {
  fetchAdminPdfLayout,
  saveAdminPdfLayout,
  resetAdminPdfLayout
} from '../../lib/api';

function getValueByPath(source, path) {
  return path.split('.').reduce((acc, key) => acc?.[key], source);
}

function setValueByPath(source, path, value) {
  const clone = JSON.parse(JSON.stringify(source));
  const keys = path.split('.');
  let current = clone;

  for (let index = 0; index < keys.length - 1; index += 1) {
    const key = keys[index];
    current[key] = current[key] || {};
    current = current[key];
  }

  current[keys[keys.length - 1]] = value;
  return clone;
}

function buildOverrideObject(defaults, current) {
  const result = {};

  function walk(defaultNode, currentNode, targetNode) {
    Object.entries(currentNode || {}).forEach(([key, value]) => {
      const defaultValue = defaultNode?.[key];
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        const next = {};
        walk(defaultValue || {}, value, next);
        if (Object.keys(next).length > 0) {
          targetNode[key] = next;
        }
        return;
      }
      if (value !== defaultValue) {
        targetNode[key] = value;
      }
    });
  }

  walk(defaults, current, result);
  return result;
}

export default function PdfCalibrationPanel() {
  const defaultConfig = useMemo(() => getDefaultPdfLayoutConfig(), []);
  const [config, setConfig] = useState(() => {
    const stored = getStoredPdfLayoutOverrides();
    return Object.keys(stored).length
      ? mergeDefaults(defaultConfig, stored)
      : defaultConfig;
  });
  const [copied, setCopied] = useState(false);
  const [importText, setImportText] = useState('');
  const [importError, setImportError] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');

  useEffect(() => {
    const overrides = buildOverrideObject(defaultConfig, config);
    savePdfLayoutOverrides(overrides);
  }, [config, defaultConfig]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      try {
        const response = await fetchAdminPdfLayout();
        if (cancelled) return;
        const overrides = response?.overrides || {};
        savePdfLayoutOverrides(overrides);
        setConfig(mergeDefaults(defaultConfig, overrides));
        setStatusMessage(response?.updatedAt ? `Carregado do servidor em ${new Date(response.updatedAt).toLocaleString('pt-BR')}` : 'Configuração padrão carregada do servidor');
      } catch {
        if (cancelled) return;
        setStatusMessage('Falha ao carregar do servidor. Mantido cache local deste navegador.');
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [defaultConfig]);

  const overridePreview = useMemo(() => {
    return JSON.stringify(buildOverrideObject(defaultConfig, config), null, 2);
  }, [config, defaultConfig]);

  const updateNumberField = (path, rawValue) => {
    const numericValue = Number(rawValue);
    if (!Number.isFinite(numericValue)) return;
    setConfig((current) => setValueByPath(current, path, numericValue));
  };

  const handleReset = () => {
    void (async () => {
      setSaving(true);
      try {
        await resetAdminPdfLayout();
        resetPdfLayoutOverrides();
        setConfig(getDefaultPdfLayoutConfig());
        setImportText('');
        setImportError('');
        setStatusMessage('Configuração resetada no servidor.');
      } catch {
        setStatusMessage('Não foi possível resetar no servidor.');
      } finally {
        setSaving(false);
      }
    })();
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(overridePreview || '{}');
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  const handleImport = () => {
    try {
      const parsed = JSON.parse(importText || '{}');
      setConfig(mergeDefaults(defaultConfig, parsed));
      setImportError('');
    } catch {
      setImportError('JSON inválido para importação.');
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const overrides = buildOverrideObject(defaultConfig, config);
      const response = await saveAdminPdfLayout(overrides);
      savePdfLayoutOverrides(response?.overrides || overrides);
      setStatusMessage(response?.updatedAt ? `Salvo no servidor em ${new Date(response.updatedAt).toLocaleString('pt-BR')}` : 'Salvo no servidor');
    } catch {
      setStatusMessage('Falha ao salvar no servidor.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="mb-6 rounded-2xl border border-brand-orange/20 bg-gradient-to-br from-brand-orange/10 to-white/[0.02] p-4 sm:p-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-brand-orange/30 bg-brand-orange/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-orange">
            <SlidersHorizontal size={13} />
            Modo calibração PDF
          </div>
          <h3 className="mt-3 text-lg font-semibold text-white">Ajuste fino visual do Midia Kit e da Proposta</h3>
          <p className="mt-1 max-w-3xl text-sm text-brand-gray-400">
            Altere posições, tamanhos e espaçamentos aqui. Salve no servidor para compartilhar a mesma calibração entre máquinas e admins.
          </p>
          <p className="mt-2 text-xs text-brand-gray-500">Cache local de segurança: {PDF_LAYOUT_STORAGE_KEY}</p>
          {statusMessage ? <p className="mt-2 text-xs text-brand-gray-400">{statusMessage}</p> : null}
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || loading}
            className="inline-flex items-center gap-2 rounded-xl border border-brand-orange/30 bg-brand-orange/15 px-3 py-2 text-sm text-brand-orange hover:bg-brand-orange/20 disabled:opacity-50"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Server size={14} />}
            Salvar no servidor
          </button>
          <button
            type="button"
            onClick={handleCopy}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white hover:bg-white/10 disabled:opacity-50"
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
            {copied ? 'JSON copiado' : 'Copiar JSON'}
          </button>
          <button
            type="button"
            onClick={handleReset}
            disabled={saving || loading}
            className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white hover:bg-white/10 disabled:opacity-50"
          >
            <RotateCcw size={14} />
            Resetar
          </button>
        </div>
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-[1.35fr_0.65fr]">
        <div className="grid gap-4 md:grid-cols-2">
          {PDF_CALIBRATION_GROUPS.map((group) => (
            <div key={group.key} className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <h4 className="text-sm font-semibold text-white">{group.title}</h4>
              <div className="mt-4 space-y-3">
                {group.fields.map((field) => {
                  const value = getValueByPath(config, field.path);
                  return (
                    <div key={field.path}>
                      <div className="mb-1.5 flex items-center justify-between gap-3 text-xs text-brand-gray-400">
                        <label>{field.label}</label>
                        <span className="rounded-md bg-white/5 px-2 py-1 text-[11px] text-white">{value}</span>
                      </div>
                      <div className="grid grid-cols-[1fr_88px] gap-2">
                        <input
                          type="range"
                          min={field.min}
                          max={field.max}
                          step={field.step}
                          value={value}
                          onChange={(event) => updateNumberField(field.path, event.target.value)}
                          className="accent-brand-orange"
                        />
                        <input
                          type="number"
                          min={field.min}
                          max={field.max}
                          step={field.step}
                          value={value}
                          onChange={(event) => updateNumberField(field.path, event.target.value)}
                          className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
            <h4 className="text-sm font-semibold text-white">Importar overrides</h4>
            <p className="mt-1 text-xs text-brand-gray-500">Cole um JSON parcial com apenas os campos que deseja sobrescrever.</p>
            <textarea
              value={importText}
              onChange={(event) => setImportText(event.target.value)}
              rows={12}
              placeholder='{"proposal":{"point":{"counterMinWidth":120}}}'
              className="mt-3 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white placeholder:text-brand-gray-600"
            />
            {importError ? <p className="mt-2 text-xs text-red-300">{importError}</p> : null}
            <button
              type="button"
              onClick={handleImport}
              className="mt-3 inline-flex items-center gap-2 rounded-xl border border-brand-orange/30 bg-brand-orange/15 px-3 py-2 text-sm font-medium text-brand-orange hover:bg-brand-orange/20"
            >
              <Upload size={14} />
              Aplicar JSON
            </button>
          </div>

          <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
            <h4 className="text-sm font-semibold text-white">Overrides ativos</h4>
            <pre className="mt-3 max-h-[520px] overflow-auto rounded-xl border border-white/10 bg-black/30 p-3 text-[11px] leading-5 text-brand-gray-300">{overridePreview || '{}'}</pre>
          </div>
        </div>
      </div>
    </section>
  );
}

function mergeDefaults(defaults, overrides) {
  const output = JSON.parse(JSON.stringify(defaults));

  function merge(target, source) {
    Object.entries(source || {}).forEach(([key, value]) => {
      if (value && typeof value === 'object' && !Array.isArray(value) && target[key] && typeof target[key] === 'object') {
        merge(target[key], value);
        return;
      }
      target[key] = value;
    });
  }

  merge(output, overrides || {});
  return output;
}
