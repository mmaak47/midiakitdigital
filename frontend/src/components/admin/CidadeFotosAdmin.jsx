import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Camera, Loader2, RefreshCcw, Trash2, UploadCloud } from 'lucide-react';
import { deleteCidadeFoto, fetchAdminPontos, fetchCidadeFotos, uploadCidadeFoto } from '../../lib/api';

const ACCEPTED_MIME = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_FILE_SIZE = 15 * 1024 * 1024;

function slugify(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function uniqueCitiesFromPoints(points) {
  const unique = new Map();
  (Array.isArray(points) ? points : []).forEach((point) => {
    const cityName = String(point?.cidade || '').trim();
    const citySlug = slugify(cityName);
    if (!cityName || !citySlug) return;
    if (!unique.has(citySlug)) {
      unique.set(citySlug, cityName);
    }
  });
  return Array.from(unique.entries())
    .map(([slug, cidade]) => ({ slug, cidade }))
    .sort((a, b) => a.cidade.localeCompare(b.cidade, 'pt-BR', { sensitivity: 'base' }));
}

function formatDateLabel(value) {
  if (!value) return 'Sem atualização';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Sem atualização';
  return parsed.toLocaleString('pt-BR');
}

export default function CidadeFotosAdmin() {
  const [cities, setCities] = useState([]);
  const [photoMap, setPhotoMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [uploadingSlug, setUploadingSlug] = useState('');
  const [deletingSlug, setDeletingSlug] = useState('');
  const [confirmDeleteSlug, setConfirmDeleteSlug] = useState('');
  const [toast, setToast] = useState(null);
  const fileInputRefs = useRef({});

  const cardList = useMemo(() => {
    return cities.map((city) => ({
      ...city,
      photo: photoMap[city.slug] || null
    }));
  }, [cities, photoMap]);

  useEffect(() => {
    const timer = toast ? setTimeout(() => setToast(null), 3000) : null;
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [toast]);

  const loadData = async ({ showRefreshing = false } = {}) => {
    if (showRefreshing) setRefreshing(true);
    else setLoading(true);

    setError('');

    try {
      const [points, photos] = await Promise.all([
        fetchAdminPontos(),
        fetchCidadeFotos()
      ]);

      const cityList = uniqueCitiesFromPoints(points);
      const photoBySlug = {};
      (Array.isArray(photos) ? photos : []).forEach((item) => {
        const slug = slugify(item?.cidade_slug || item?.cidade);
        if (!slug) return;
        photoBySlug[slug] = {
          cidade: item?.cidade || '',
          cidade_slug: slug,
          imagem_url: item?.imagem_url || '',
          updated_at: item?.updated_at || ''
        };
      });

      setCities(cityList);
      setPhotoMap(photoBySlug);
    } catch (loadError) {
      setError(loadError?.message || 'Falha ao carregar cidades e fotos.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const openPicker = (slug) => {
    const input = fileInputRefs.current[slug];
    if (input) input.click();
  };

  const showErrorToast = (message) => {
    setToast({ type: 'error', message });
  };

  const handleFileSelected = async (city, slug, file) => {
    if (!file) return;

    if (!ACCEPTED_MIME.includes(file.type)) {
      showErrorToast('Formato inválido. Envie JPG, PNG ou WEBP.');
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      showErrorToast('A imagem deve ter no máximo 15MB.');
      return;
    }

    setUploadingSlug(slug);
    setConfirmDeleteSlug('');

    try {
      const saved = await uploadCidadeFoto(city, file);
      const normalizedSlug = slugify(saved?.cidade_slug || slug);
      setPhotoMap((prev) => ({
        ...prev,
        [normalizedSlug]: {
          cidade: saved?.cidade || city,
          cidade_slug: normalizedSlug,
          imagem_url: saved?.imagem_url || '',
          updated_at: saved?.updated_at || new Date().toISOString()
        }
      }));
      setToast({ type: 'success', message: `Foto de ${city} atualizada.` });
    } catch (uploadError) {
      showErrorToast(uploadError?.message || 'Não foi possível fazer upload da imagem.');
    } finally {
      setUploadingSlug('');
      const input = fileInputRefs.current[slug];
      if (input) input.value = '';
    }
  };

  const handleDelete = async (slug, cityName) => {
    if (confirmDeleteSlug !== slug) {
      setConfirmDeleteSlug(slug);
      return;
    }

    setDeletingSlug(slug);

    try {
      await deleteCidadeFoto(slug);
      setPhotoMap((prev) => {
        const next = { ...prev };
        delete next[slug];
        return next;
      });
      setToast({ type: 'success', message: `Foto de ${cityName} removida.` });
    } catch (deleteError) {
      showErrorToast(deleteError?.message || 'Erro ao remover imagem da cidade.');
    } finally {
      setConfirmDeleteSlug('');
      setDeletingSlug('');
    }
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 text-slate-900 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-800">Fotos das cidades (capa PDF)</h3>
          <p className="mt-1 text-xs text-slate-500">Envie uma imagem por cidade. Essa foto preenche metade direita da capa do mídia kit.</p>
        </div>
        <button
          type="button"
          onClick={() => loadData({ showRefreshing: true })}
          disabled={loading || refreshing}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          <RefreshCcw size={14} className={refreshing ? 'animate-spin' : ''} />
          Atualizar
        </button>
      </div>

      {error ? <p className="mt-3 text-xs text-red-600">{error}</p> : null}

      {loading ? (
        <div className="mt-4 flex min-h-28 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-500">
          <Loader2 size={18} className="mr-2 animate-spin" /> Carregando cidades...
        </div>
      ) : !cardList.length ? (
        <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-500">
          Nenhuma cidade encontrada na base de pontos.
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
          {cardList.map((card) => {
            const hasPhoto = Boolean(card.photo?.imagem_url);
            const isUploading = uploadingSlug === card.slug;
            const isDeleting = deletingSlug === card.slug;
            const isConfirmingDelete = confirmDeleteSlug === card.slug;

            return (
              <div
                key={card.slug}
                className="group relative overflow-hidden rounded-xl border border-slate-200 bg-white"
              >
                <button
                  type="button"
                  onClick={() => openPicker(card.slug)}
                  className="relative block h-48 w-full bg-slate-100 text-left"
                >
                  {hasPhoto ? (
                    <img
                      src={card.photo.imagem_url}
                      alt={`Foto de ${card.cidade}`}
                      className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]"
                    />
                  ) : (
                    <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-slate-500">
                      <Camera size={28} />
                      <span className="text-sm">Sem foto enviada</span>
                    </div>
                  )}
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/35 via-black/10 to-transparent" />
                  {isUploading ? (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/50 text-white">
                      <Loader2 size={24} className="animate-spin" />
                    </div>
                  ) : null}
                </button>

                <input
                  ref={(node) => {
                    if (!node) {
                      delete fileInputRefs.current[card.slug];
                      return;
                    }
                    fileInputRefs.current[card.slug] = node;
                  }}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    handleFileSelected(card.cidade, card.slug, file);
                  }}
                />

                <div className="flex items-start justify-between gap-3 p-3">
                  <div>
                    <h4 className="text-sm font-semibold text-slate-800">{card.cidade}</h4>
                    <p className="text-xs text-slate-500">{hasPhoto ? `Atualizada em ${formatDateLabel(card.photo.updated_at)}` : 'Use JPG, PNG ou WEBP (máx. 15MB)'}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => openPicker(card.slug)}
                      disabled={isUploading || isDeleting}
                      className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                    >
                      <UploadCloud size={14} />
                      {hasPhoto ? 'Trocar' : 'Enviar'}
                    </button>
                    {hasPhoto ? (
                      <button
                        type="button"
                        onClick={() => handleDelete(card.slug, card.cidade)}
                        disabled={isUploading || isDeleting}
                        className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium transition ${isConfirmingDelete
                          ? 'border border-red-300 bg-red-50 text-red-700 hover:bg-red-100'
                          : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'} disabled:opacity-50`}
                      >
                        {isDeleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                        {isConfirmingDelete ? 'Confirmar' : 'Excluir'}
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <AnimatePresence>
        {toast ? (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className={`fixed bottom-5 right-5 z-[90] rounded-lg border px-4 py-3 text-sm shadow-lg ${toast.type === 'error'
              ? 'border-red-300 bg-red-600 text-white'
              : 'border-emerald-300 bg-emerald-600 text-white'}`}
          >
            {toast.message}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </section>
  );
}
