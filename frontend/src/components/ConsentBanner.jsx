/**
 * ConsentBanner.jsx
 * Banner LGPD de consentimento de cookies/rastreamento.
 * Aparece na parte inferior para visitantes que ainda não consentiram.
 * Respeita escolha: "Aceitar" habilita tracking, "Apenas essenciais" desabilita.
 * Decisão fica salva em localStorage — nunca mostra de novo após escolha.
 */

import { useState, useEffect } from 'react';
import { Shield, X } from 'lucide-react';
import { getConsentStatus, setConsentStatus } from '../lib/tracking';

export default function ConsentBanner() {
  const [visible, setVisible] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    // Só mostra se ainda não decidiu
    const status = getConsentStatus();
    if (status === null) {
      // Pequeno delay para não competir com o carregamento da página
      const timer = setTimeout(() => setVisible(true), 1500);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleAccept = () => {
    setConsentStatus('all');
    setVisible(false);
  };

  const handleEssentialOnly = () => {
    setConsentStatus('essential');
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-[10010] animate-slide-up"
      style={{ animation: 'slideUp 0.4s cubic-bezier(0.22, 1, 0.36, 1) forwards' }}
    >
      {/* Backdrop gradient */}
      <div className="pointer-events-none absolute inset-x-0 bottom-full h-16 bg-gradient-to-t from-black/20 to-transparent" />

      <div className="bg-neutral-950/95 backdrop-blur-xl border-t border-white/10 shadow-[0_-8px_40px_rgba(0,0,0,0.4)]">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-4">
          {/* Compact view */}
          <div className="flex items-start sm:items-center gap-3 sm:gap-4 flex-col sm:flex-row">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className="shrink-0 w-9 h-9 rounded-xl bg-gradient-to-br from-[#FE5C2B] to-[#C94A1A] flex items-center justify-center shadow-lg shadow-[#FE5C2B]/20">
                <Shield size={16} className="text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white/90 leading-relaxed">
                  Usamos cookies essenciais para o funcionamento do site e cookies de analytics para melhorar sua experiencia.{' '}
                  <button
                    onClick={() => setExpanded(!expanded)}
                    className="text-[#FE5C2B] hover:text-[#ff7a52] underline underline-offset-2 decoration-[#FE5C2B]/40 transition-colors"
                  >
                    {expanded ? 'Menos detalhes' : 'Saiba mais'}
                  </button>
                </p>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto">
              <button
                onClick={handleEssentialOnly}
                className="flex-1 sm:flex-none px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold text-white/70 border border-white/15 hover:bg-white/10 hover:text-white transition-all"
              >
                Apenas essenciais
              </button>
              <button
                onClick={handleAccept}
                className="flex-1 sm:flex-none px-5 py-2 rounded-lg text-xs sm:text-sm font-bold text-white bg-gradient-to-r from-[#FE5C2B] to-[#E85A1A] shadow-md shadow-[#FE5C2B]/30 hover:shadow-lg hover:shadow-[#FE5C2B]/40 hover:scale-[1.02] active:scale-[0.98] transition-all"
              >
                Aceitar todos
              </button>
            </div>
          </div>

          {/* Expanded details */}
          {expanded && (
            <div className="mt-4 pt-4 border-t border-white/10 grid sm:grid-cols-2 gap-4 text-xs text-white/60 leading-relaxed">
              <div>
                <h4 className="text-white/90 font-semibold text-sm mb-1.5 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-green-400" />
                  Cookies essenciais
                </h4>
                <p>
                  Necessarios para o funcionamento basico do site: autenticacao, preferencias de tema e favoritos salvos localmente.
                  Nao coletam dados pessoais. Sempre ativos.
                </p>
              </div>
              <div>
                <h4 className="text-white/90 font-semibold text-sm mb-1.5 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-[#FE5C2B]" />
                  Cookies de analytics
                </h4>
                <p>
                  Registram eventos anonimos de navegacao (visualizacoes de pagina, cliques) para nos ajudar a melhorar o site.
                  Usam um identificador anonimo (UUID) sem vincular a dados pessoais. Podem ser desativados.
                </p>
              </div>
              <div className="sm:col-span-2 pt-2 border-t border-white/5">
                <p className="text-white/40 text-[11px]">
                  Em conformidade com a Lei Geral de Protecao de Dados (LGPD - Lei 13.709/2018).
                  Seus dados de navegacao sao anonimos e nunca compartilhados com terceiros.
                  Voce pode alterar sua escolha a qualquer momento limpando os cookies do navegador.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes slideUp {
          from { transform: translateY(100%); opacity: 0; }
          to   { transform: translateY(0);    opacity: 1; }
        }
      `}</style>
    </div>
  );
}
