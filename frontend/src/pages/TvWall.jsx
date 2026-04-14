import { useEffect, useMemo, useState } from 'react';
import { Activity, BadgeDollarSign, FileWarning, Newspaper, StickyNote, Tv, CalendarClock, TrendingUp } from 'lucide-react';

const POLL_MS = 15000;

function fmtMoney(value) {
  const num = Number(value || 0);
  return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
}

function fmtDateTime(iso) {
  const d = new Date(iso || Date.now());
  return d.toLocaleString('pt-BR', { hour12: false });
}

function statusTone(pct) {
  if (pct >= 100) return 'critical';
  if (pct >= 90) return 'high';
  if (pct >= 75) return 'medium';
  return 'low';
}

function toneColors(tone) {
  switch(tone) {
    case 'critical': return 'border-red-500 text-red-500 bg-red-500/10';
    case 'high': return 'border-orange-500 text-orange-500 bg-orange-500/10';
    case 'medium': return 'border-yellow-500 text-yellow-500 bg-yellow-500/10';
    default: return 'border-emerald-500 text-emerald-400 bg-emerald-500/10';
  }
}

export default function TvWall() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [updatedAt, setUpdatedAt] = useState('');

  useEffect(() => {
    let alive = true;

    async function load() {
      try {
        const res = await fetch('/api/tv/dashboard', { credentials: 'include' });
        if (!res.ok) throw new Error(\HTTP \\);
        const json = await res.json();
        if (!alive) return;
        setData(json);
        setUpdatedAt(fmtDateTime(json.generated_at));
        setError('');
      } catch (err) {
        if (!alive) return;
        setError(err.message || 'Falha ao atualizar painel');
      }
    }

    load();
    const id = setInterval(load, POLL_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  const warnings = useMemo(() => data?.warnings || [], [data]);
  const tickerText = (data?.ticker_message || '').trim() || 'Painel Intermidia ao vivo. Configure o texto no CRM.';
  const loop = data?.loop || {};
  const contracts = data?.contracts || { items: [] };
  const ranking = data?.ranking || [];
  const postits = data?.postits || [];

  return (
    <div className="relative min-h-screen h-screen w-screen overflow-hidden bg-[#0A0A0A] text-slate-100 font-sans">
      {/* Background Elements */}
      <div className="absolute -top-40 -left-40 w-[500px] h-[500px] bg-[#FE5C2B]/10 rounded-full blur-[120px] pointer-events-none"></div>
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-1/3 h-1/3 bg-blue-500/5 rounded-full blur-[150px] pointer-events-none"></div>
      <div className="absolute -bottom-40 -right-40 w-[500px] h-[500px] bg-[#FE5C2B]/5 rounded-full blur-[120px] pointer-events-none"></div>

      <style>{\
        .tv-grid {
          display: grid;
          grid-template-columns: 1.15fr 1fr 1fr;
          grid-template-rows: 1fr 1.05fr;
          grid-template-areas:
            "loop contracts ranking"
            "loop postits ranking";
          gap: 1.5rem;
          height: 100%;
          min-height: 0;
        }
        .ga-loop { grid-area: loop; }
        .ga-contracts { grid-area: contracts; }
        .ga-ranking { grid-area: ranking; }
        .ga-postits { grid-area: postits; }

        .hide-scroll::-webkit-scrollbar { width: 4px; }
        .hide-scroll::-webkit-scrollbar-track { background: transparent; }
        .hide-scroll::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.1); border-radius: 4px; }

        .tv-ticker-track {
          display: inline-block;
          padding-left: 100%;
          animation: ticker-move 35s linear infinite;
        }
        @keyframes ticker-move {
          0% { transform: translateX(0); }
          100% { transform: translateX(-100%); }
        }
        @media (max-aspect-ratio: 1/1) {
          .tv-grid {
            grid-template-columns: 1fr 1fr;
            grid-template-rows: auto auto 1fr;
            grid-template-areas:
              "loop loop"
              "contracts ranking"
              "postits ranking";
          }
        }
      \}</style>

      <div className="relative z-10 flex flex-col h-full p-4 md:p-6 gap-4">
        {/* HEADER */}
        <header className="flex items-center justify-between bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl px-6 py-4 shadow-xl shrink-0">
          <div className="flex items-center gap-4">
            <div className="bg-[#FE5C2B] text-black p-3 rounded-xl">
              <Tv size={28} className="stroke-[2.5]" />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-black tracking-tight text-white uppercase flex items-center gap-2">
                Painel <span className="text-[#FE5C2B] drop-shadow-md">Intermidia</span>
              </h1>
              <div className="text-sm text-slate-400 font-medium tracking-wide">
                OPERAÇÃO TÁTICA E COMERCIAL • AO VIVO
              </div>
            </div>
          </div>
          <div className="text-right flex flex-col justify-center">
            <div className="text-xs text-slate-400 font-semibold tracking-wider uppercase mb-1">Última Atualização</div>
            <div className="text-lg font-bold text-[#FE5C2B] bg-white/5 px-4 py-1.5 rounded-lg tabular-nums shadow-inner border border-white/5">
              {updatedAt || '--/--/---- --:--:--'}
            </div>
          </div>
        </header>

        {/* MAIN GRID */}
        <main className="tv-grid flex-1">
          {/* LOOPS */}
          <article className="ga-loop flex flex-col bg-black/40 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl overflow-hidden p-5">
            <h2 className="flex items-center gap-3 text-[#FE5C2B] font-bold text-xl mb-5 uppercase tracking-wide">
              <Activity size={24} className="stroke-[2.5]" /> Auditoria de Loop
            </h2>
            <div className="grid grid-cols-4 gap-3 mb-5 shrink-0">
              <div className="bg-white/5 border border-white/5 rounded-xl p-3 text-center">
                <div className="text-2xl 2xl:text-3xl font-black text-white">{loop.total || 0}</div>
                <div className="text-[10px] 2xl:text-xs text-slate-400 font-bold uppercase mt-1">Locais</div>
              </div>
              <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3 text-center">
                <div className="text-2xl 2xl:text-3xl font-black text-emerald-400">{loop.online || 0}</div>
                <div className="text-[10px] 2xl:text-xs text-emerald-400/70 font-bold uppercase mt-1">Online</div>
              </div>
              <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-center">
                <div className="text-2xl 2xl:text-3xl font-black text-red-500">{loop.lotados || 0}</div>
                <div className="text-[10px] 2xl:text-xs text-red-500/70 font-bold uppercase mt-1">Lotados</div>
              </div>
              <div className="bg-[#FE5C2B]/10 border border-[#FE5C2B]/20 rounded-xl p-3 text-center">
                <div className="text-2xl 2xl:text-3xl font-black text-[#FE5C2B]">{loop.totalCotasLivres || 0}</div>
                <div className="text-[10px] 2xl:text-xs text-[#FE5C2B]/70 font-bold uppercase mt-1">Cotas Livres</div>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto hide-scroll pr-2 flex flex-col gap-3">
              {(loop.itensCriticos || []).map((item) => {
                const colors = toneColors(statusTone(item.pct_ocupado));
                return (
                  <div key={String(item.id)} className={\lex items-center justify-between p-3.5 rounded-xl bg-white/5 border border-white/5 border-l-4 \\}>
                    <div className="min-w-0 pr-2">
                      <div className="font-bold text-sm 2xl:text-base text-white truncate">{item.local || item.nome || 'Monitor'}</div>
                      <div className="text-xs 2xl:text-sm text-slate-400 truncate mt-0.5">{item.cidade || 'Sem cidade'}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-lg 2xl:text-xl font-black leading-none">{item.pct_ocupado}%</div>
                      <div className="text-[10px] text-slate-400 font-bold uppercase mt-0.5">ocupado</div>
                    </div>
                  </div>
                );
              })}
              {!loop.itensCriticos?.length && <div className="text-slate-400 italic text-sm text-center py-8">Nenhum ponto crítico detectado.</div>}
            </div>
          </article>

          {/* CONTRACTS */}
          <article className="ga-contracts flex flex-col bg-black/40 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl overflow-hidden p-5">
            <h2 className="flex items-center gap-3 text-[#FE5C2B] font-bold text-lg 2xl:text-xl mb-4 uppercase tracking-wide">
              <CalendarClock size={22} className="stroke-[2.5]" /> Vencimento
            </h2>
            <div className="grid grid-cols-3 gap-3 mb-4 shrink-0">
              <div className="bg-white/5 border border-white/5 rounded-xl p-3 text-center">
                <div className="text-xl 2xl:text-2xl font-black text-white">{contracts.total || 0}</div>
                <div className="text-[9px] 2xl:text-[10px] text-slate-400 font-bold uppercase mt-1">Total</div>
              </div>
              <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-3 text-center">
                <div className="text-xl 2xl:text-2xl font-black text-yellow-500">{contracts.expiring_15d || 0}</div>
                <div className="text-[9px] 2xl:text-[10px] text-yellow-500/70 font-bold uppercase mt-1">15 Dias</div>
              </div>
              <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 text-center">
                <div className="text-xl 2xl:text-2xl font-black text-red-500">{contracts.expiring_5d || 0}</div>
                <div className="text-[9px] 2xl:text-[10px] text-red-500/70 font-bold uppercase mt-1">5 Dias</div>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto hide-scroll pr-2 flex flex-col gap-3">
              {(contracts.items || []).map((c, idx) => {
                const isCrit = c.daysRemaining <= 5;
                const isWarn = c.daysRemaining <= 15;
                return (
                  <div key={\\-\-\\} className={\p-3.5 rounded-xl bg-white/5 border border-white/5 border-l-4 \\}>
                    <div className="font-bold text-sm 2xl:text-base text-white truncate">{c.advertiser}</div>
                    <div className="flex items-center justify-between mt-1.5">
                      <div className="text-xs text-slate-400 truncate pr-2">{c.vendorName || 'N/A'}</div>
                      <div className={\	ext-xs font-black px-2.5 py-1 rounded-md \\}>
                        {c.daysRemaining} dias
                      </div>
                    </div>
                  </div>
                );
              })}
              {!contracts.items?.length && <div className="text-slate-400 italic text-sm text-center py-6">Sem dados de contrato.</div>}
            </div>
          </article>

          {/* RANKING */}
          <article className="ga-ranking flex flex-col bg-black/40 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl overflow-hidden p-5">
            <h2 className="flex items-center gap-3 text-[#FE5C2B] font-bold text-lg 2xl:text-xl mb-4 uppercase tracking-wide">
              <TrendingUp size={22} className="stroke-[2.5]" /> Top Vendas (Mês)
            </h2>
            <div className="flex-1 overflow-y-auto hide-scroll pr-2 flex flex-col gap-3">
              {ranking.map((r, idx) => (
                <div key={r.vendedor} className={\elative flex flex-col p-4 rounded-xl border \\}>
                  {idx === 0 && <div className="absolute top-0 right-4 -translate-y-1/2 bg-amber-500 text-black text-[10px] font-black px-3 py-0.5 rounded-full uppercase shadow-lg">Líder</div>}
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <div className={\ont-bold text-sm 2xl:text-base truncate flex items-center gap-2 \\}>
                      <span className="opacity-40 text-xs w-4">{r.posicao}º</span> {r.vendedor}
                    </div>
                    <div className="font-black text-sm 2xl:text-base text-emerald-400 tracking-tight">{fmtMoney(r.total)}</div>
                  </div>
                  <div className="text-xs text-slate-400">{r.vendas} negócio(s) fechado(s)</div>
                </div>
              ))}
              {!ranking.length && <div className="text-slate-400 italic text-sm text-center py-8">Nenhuma venda faturada no mês.</div>}
            </div>
          </article>

          {/* POST-ITS */}
          <article className="ga-postits flex flex-col bg-black/40 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl overflow-hidden p-5">
            <h2 className="flex items-center gap-3 text-[#FE5C2B] font-bold text-lg 2xl:text-xl mb-4 uppercase tracking-wide">
              <StickyNote size={22} className="stroke-[2.5]" /> Mural
            </h2>
            <div className="flex-1 overflow-y-auto hide-scroll pr-2 flex flex-col gap-4">
              {postits.map((p) => (
                <div key={p.id} className="relative p-4 rounded-xl bg-gradient-to-br from-[#FE5C2B] to-[#da4e23] border border-[#ff7b52] text-white shadow-xl shadow-brand-orange/10 rotate-[-1deg]">
                  <div className="absolute top-2 left-1/2 -translate-x-1/2 w-10 h-2 bg-white/20 rounded-full"></div>
                  <div className="font-black text-[10px] uppercase tracking-widest text-black/60 mb-2 truncate mt-1">
                    {p.author || 'Equipe'}
                  </div>
                  <div className="text-sm 2xl:text-base font-semibold leading-snug whitespace-pre-wrap drop-shadow-sm">
                    {p.text}
                  </div>
                </div>
              ))}
              {!postits.length && (
                <div className="flex flex-col items-center justify-center h-full text-center opacity-50 p-4">
                  <StickyNote size={32} className="mb-3 text-slate-500" />
                  <div className="text-sm font-medium text-slate-400">Mural limpo.<br/>Fixe mensagens enviando no WhatsApp.</div>
                </div>
              )}
            </div>
          </article>
        </main>

        {/* TICKER DE NOTÍCIAS */}
        <footer className="bg-[#FE5C2B] rounded-xl overflow-hidden shrink-0 mt-2 relative z-20 shadow-xl shadow-[#FE5C2B]/20">
          <div className="flex items-center text-black">
            <div className="bg-black/10 backdrop-blur-md px-5 py-3 z-10 font-black tracking-widest uppercase flex items-center gap-2 border-r border-black/10">
              <Newspaper size={20} className="stroke-[2.5]" /> Destaque
            </div>
            <div className="flex-1 overflow-hidden">
              <div className="tv-ticker-track whitespace-nowrap py-3 font-bold text-lg tracking-wide text-black/90">
                <span>{tickerText}</span>
                <span className="mx-8 opacity-40">•</span>
                <span>{tickerText}</span>
                <span className="mx-8 opacity-40">•</span>
                <span>{tickerText}</span>
              </div>
            </div>
          </div>
        </footer>
      </div>

      {warnings.length > 0 || error ? (
        <div className="absolute right-6 top-6 z-50 text-xs font-bold text-red-200 bg-red-950/90 border border-red-500/30 rounded-lg px-4 py-3 shadow-2xl backdrop-blur-md flex items-start gap-3">
          <FileWarning size={16} className="shrink-0 mt-0.5 text-red-500" />
          <div>
            {[...(error ? [\ERRO: \Falha na execução do programa 'python.exe': O nome do arquivo ou a extensão é muito grandeNo linha:1 caractere:1
+ python -c "import codecs; content='''import { useEffect, useMemo, use ...
+ ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~. O termo 'EOF' não é reconhecido como nome de cmdlet, função, arquivo de script ou programa operável. Verifique a grafia do nome ou, se um caminho tiver sido incluído, veja se o caminho está correto e tente novamente. System.Management.Automation.ParseException: No linha:1 caractere:1
+ }
+ ~
Token '}' inesperado na expressão ou instrução.
   em System.Management.Automation.Runspaces.PipelineBase.Invoke(IEnumerable input)
   em Microsoft.PowerShell.Executor.ExecuteCommandHelper(Pipeline tempPipeline, Exception& exceptionThrown, ExecutionOptions options) System.Management.Automation.ParseException: No linha:1 caractere:3
+   );
+   ~
Token ')' inesperado na expressão ou instrução.
   em System.Management.Automation.Runspaces.PipelineBase.Invoke(IEnumerable input)
   em Microsoft.PowerShell.Executor.ExecuteCommandHelper(Pipeline tempPipeline, Exception& exceptionThrown, ExecutionOptions options) O termo '<' não é reconhecido como nome de cmdlet, função, arquivo de script ou programa operável. Verifique a grafia do nome ou, se um caminho tiver sido incluído, veja se o caminho está correto e tente novamente. System.Management.Automation.ParseException: No linha:2 caractere:213
+ ... y-2 max-w-[30vw] shadow-2xl backdrop-blur-md flex items-start gap-2">
+                                                                          ~
')' de fechamento ausente na expressão.

No linha:3 caractere:11
+           <FileWarning size={14} className="shrink-0 mt-0.5 text-red- ...
+           ~
Operador '<' reservado para uso futuro.

No linha:5 caractere:15
+             {[...(error ? [`ERRO: ${error}`] : []), ...warnings].map( ...
+               ~
Nome de tipo ausente depois de '['.

No linha:5 caractere:74
+ ... [...(error ? [`ERRO: ${error}`] : []), ...warnings].map((msg, i) => < ...
+                                                                 ~
Argumento ausente na lista de parâmetros.

No linha:5 caractere:82
+ ... or ? [`ERRO: ${error}`] : []), ...warnings].map((msg, i) => <div key= ...
+                                                                 ~
Operador '<' reservado para uso futuro.

No linha:5 caractere:100
+ ... ror}`] : []), ...warnings].map((msg, i) => <div key={i}>{msg}</div>)}
+                                                                  ~
Operador '<' reservado para uso futuro.

No linha:1 caractere:7
+       {warnings.length > 0 ; error ? (
+       ~
'}' de fechamento ausente no bloco de instrução ou na definição de tipo.

No linha:8 caractere:7
+       ) : null}
+       ~
Token ')' inesperado na expressão ou instrução.

No linha:8 caractere:15
+       ) : null}
+               ~
Token '}' inesperado na expressão ou instrução.

No linha:5 caractere:71
+ ... ..(error ? [`ERRO: ${error}`] : []), ...warnings].map((msg, i) => <di ...
+                                                            ~~~~~~
A expressão de atribuição não é válida. A entrada para um operador de atribuição deve ser um objeto que seja capaz de aceitar atribuições, como uma variável ou uma propriedade.
   em System.Management.Automation.Runspaces.PipelineBase.Invoke(IEnumerable input)
   em Microsoft.PowerShell.Executor.ExecuteCommandHelper(Pipeline tempPipeline, Exception& exceptionThrown, ExecutionOptions options) O termo '<' não é reconhecido como nome de cmdlet, função, arquivo de script ou programa operável. Verifique a grafia do nome ou, se um caminho tiver sido incluído, veja se o caminho está correto e tente novamente. O termo '<' não é reconhecido como nome de cmdlet, função, arquivo de script ou programa operável. Verifique a grafia do nome ou, se um caminho tiver sido incluído, veja se o caminho está correto e tente novamente. O termo '<' não é reconhecido como nome de cmdlet, função, arquivo de script ou programa operável. Verifique a grafia do nome ou, se um caminho tiver sido incluído, veja se o caminho está correto e tente novamente. O termo '<' não é reconhecido como nome de cmdlet, função, arquivo de script ou programa operável. Verifique a grafia do nome ou, se um caminho tiver sido incluído, veja se o caminho está correto e tente novamente. O termo '<' não é reconhecido como nome de cmdlet, função, arquivo de script ou programa operável. Verifique a grafia do nome ou, se um caminho tiver sido incluído, veja se o caminho está correto e tente novamente. System.Management.Automation.ParseException: No linha:1 caractere:35
+                 <span>{tickerText}</span>
+                                   ~
Operador '<' reservado para uso futuro.
   em System.Management.Automation.Runspaces.PipelineBase.Invoke(IEnumerable input)
   em Microsoft.PowerShell.Executor.ExecuteCommandHelper(Pipeline tempPipeline, Exception& exceptionThrown, ExecutionOptions options) O termo '<' não é reconhecido como nome de cmdlet, função, arquivo de script ou programa operável. Verifique a grafia do nome ou, se um caminho tiver sido incluído, veja se o caminho está correto e tente novamente. System.Management.Automation.ParseException: No linha:1 caractere:35
+                 <span>{tickerText}</span>
+                                   ~
Operador '<' reservado para uso futuro.
   em System.Management.Automation.Runspaces.PipelineBase.Invoke(IEnumerable input)
   em Microsoft.PowerShell.Executor.ExecuteCommandHelper(Pipeline tempPipeline, Exception& exceptionThrown, ExecutionOptions options) O termo '<' não é reconhecido como nome de cmdlet, função, arquivo de script ou programa operável. Verifique a grafia do nome ou, se um caminho tiver sido incluído, veja se o caminho está correto e tente novamente. System.Management.Automation.ParseException: No linha:1 caractere:35
+                 <span>{tickerText}</span>
+                                   ~
Operador '<' reservado para uso futuro.
   em System.Management.Automation.Runspaces.PipelineBase.Invoke(IEnumerable input)
   em Microsoft.PowerShell.Executor.ExecuteCommandHelper(Pipeline tempPipeline, Exception& exceptionThrown, ExecutionOptions options) O termo '<' não é reconhecido como nome de cmdlet, função, arquivo de script ou programa operável. Verifique a grafia do nome ou, se um caminho tiver sido incluído, veja se o caminho está correto e tente novamente. O termo '<' não é reconhecido como nome de cmdlet, função, arquivo de script ou programa operável. Verifique a grafia do nome ou, se um caminho tiver sido incluído, veja se o caminho está correto e tente novamente. O termo '<' não é reconhecido como nome de cmdlet, função, arquivo de script ou programa operável. Verifique a grafia do nome ou, se um caminho tiver sido incluído, veja se o caminho está correto e tente novamente. O termo '<' não é reconhecido como nome de cmdlet, função, arquivo de script ou programa operável. Verifique a grafia do nome ou, se um caminho tiver sido incluído, veja se o caminho está correto e tente novamente. O termo '<' não é reconhecido como nome de cmdlet, função, arquivo de script ou programa operável. Verifique a grafia do nome ou, se um caminho tiver sido incluído, veja se o caminho está correto e tente novamente. O termo '<' não é reconhecido como nome de cmdlet, função, arquivo de script ou programa operável. Verifique a grafia do nome ou, se um caminho tiver sido incluído, veja se o caminho está correto e tente novamente. O termo '<' não é reconhecido como nome de cmdlet, função, arquivo de script ou programa operável. Verifique a grafia do nome ou, se um caminho tiver sido incluído, veja se o caminho está correto e tente novamente. O termo '<' não é reconhecido como nome de cmdlet, função, arquivo de script ou programa operável. Verifique a grafia do nome ou, se um caminho tiver sido incluído, veja se o caminho está correto e tente novamente. O termo '<' não é reconhecido como nome de cmdlet, função, arquivo de script ou programa operável. Verifique a grafia do nome ou, se um caminho tiver sido incluído, veja se o caminho está correto e tente novamente. O termo '<' não é reconhecido como nome de cmdlet, função, arquivo de script ou programa operável. Verifique a grafia do nome ou, se um caminho tiver sido incluído, veja se o caminho está correto e tente novamente. System.Management.Automation.ParseException: No linha:1 caractere:32
+               {!postits.length && (
+                                ~~
O token '&&' não é um separador de instruções válido nesta versão.

No linha:2 caractere:110
+ ... x-col items-center justify-center h-full text-center opacity-50 p-4">
+                                                                          ~
')' de fechamento ausente na expressão.

No linha:1 caractere:35
+               {!postits.length && (
+                                   ~
Expressões são permitidas apenas como o primeiro elemento de um pipeline.

No linha:3 caractere:19
+                   <StickyNote size={32} className="mb-2" />
+                   ~
Operador '<' reservado para uso futuro.

No linha:3 caractere:31
+                   <StickyNote size={32} className="mb-2" />
+                               ~~~~~
Token 'size=' inesperado na expressão ou instrução.

No linha:1 caractere:15
+               {!postits.length && (
+               ~
'}' de fechamento ausente no bloco de instrução ou na definição de tipo.

No linha:6 caractere:15
+               )}
+               ~
Token ')' inesperado na expressão ou instrução.

No linha:6 caractere:16
+               )}
+                ~
Token '}' inesperado na expressão ou instrução.
   em System.Management.Automation.Runspaces.PipelineBase.Invoke(IEnumerable input)
   em Microsoft.PowerShell.Executor.ExecuteCommandHelper(Pipeline tempPipeline, Exception& exceptionThrown, ExecutionOptions options) System.Management.Automation.ParseException: No linha:2 caractere:204
+ ... shadow-brand-orange/20 rotate-[-1deg] hover:rotate-0 transition-all">
+                                                                          ~
')' de fechamento ausente na expressão.

No linha:3 caractere:19
+                   <div className="absolute top-2 left-1/2 -translate- ...
+                   ~
Operador '<' reservado para uso futuro.

No linha:3 caractere:129
+ ... translate-x-1/2 w-8 h-2.5 bg-white/30 rounded-full blur-[1px]"></div>
+                                                                          ~
')' de fechamento ausente na expressão.

No linha:4 caractere:19
+                   <div className="font-black text-xs uppercase tracki ...
+                   ~
Operador '<' reservado para uso futuro.

No linha:1 caractere:15
+               {postits.map((p) => (
+               ~
'}' de fechamento ausente no bloco de instrução ou na definição de tipo.

No linha:11 caractere:15
+               ))}
+               ~
Token ')' inesperado na expressão ou instrução.

No linha:11 caractere:16
+               ))}
+                ~
Token ')' inesperado na expressão ou instrução.

No linha:11 caractere:17
+               ))}
+                 ~
Token '}' inesperado na expressão ou instrução.

No linha:1 caractere:29
+               {postits.map((p) => (
+                             ~
A expressão de atribuição não é válida. A entrada para um operador de atribuição deve ser um objeto que seja capaz de aceitar atribuições, como uma variável ou uma propriedade.
   em System.Management.Automation.Runspaces.PipelineBase.Invoke(IEnumerable input)
   em Microsoft.PowerShell.Executor.ExecuteCommandHelper(Pipeline tempPipeline, Exception& exceptionThrown, ExecutionOptions options) O termo '<' não é reconhecido como nome de cmdlet, função, arquivo de script ou programa operável. Verifique a grafia do nome ou, se um caminho tiver sido incluído, veja se o caminho está correto e tente novamente. O termo '<' não é reconhecido como nome de cmdlet, função, arquivo de script ou programa operável. Verifique a grafia do nome ou, se um caminho tiver sido incluído, veja se o caminho está correto e tente novamente. O termo '<' não é reconhecido como nome de cmdlet, função, arquivo de script ou programa operável. Verifique a grafia do nome ou, se um caminho tiver sido incluído, veja se o caminho está correto e tente novamente. O termo '<' não é reconhecido como nome de cmdlet, função, arquivo de script ou programa operável. Verifique a grafia do nome ou, se um caminho tiver sido incluído, veja se o caminho está correto e tente novamente. O termo '<' não é reconhecido como nome de cmdlet, função, arquivo de script ou programa operável. Verifique a grafia do nome ou, se um caminho tiver sido incluído, veja se o caminho está correto e tente novamente. O termo '<' não é reconhecido como nome de cmdlet, função, arquivo de script ou programa operável. Verifique a grafia do nome ou, se um caminho tiver sido incluído, veja se o caminho está correto e tente novamente. O termo '<' não é reconhecido como nome de cmdlet, função, arquivo de script ou programa operável. Verifique a grafia do nome ou, se um caminho tiver sido incluído, veja se o caminho está correto e tente novamente. System.Management.Automation.ParseException: No linha:1 caractere:32
+               {!ranking.length && <div className="text-slate-400 ital ...
+                                ~~
O token '&&' não é um separador de instruções válido nesta versão.
   em System.Management.Automation.Runspaces.PipelineBase.Invoke(IEnumerable input)
   em Microsoft.PowerShell.Executor.ExecuteCommandHelper(Pipeline tempPipeline, Exception& exceptionThrown, ExecutionOptions options) System.Management.Automation.ParseException: No linha:1 caractere:30
+               {ranking.map((r, idx) => (
+                              ~
Argumento ausente na lista de parâmetros.

No linha:3 caractere:30
+                   {idx === 0 && <div className="absolute top-0 right- ...
+                              ~~
O token '&&' não é um separador de instruções válido nesta versão.

No linha:8 caractere:122
+ ... :text-base text-emerald-400 tracking-tight">{fmtMoney(r.total)}</div>
+                                                                    ~
Operador '<' reservado para uso futuro.

No linha:10 caractere:91
+ ... sName="text-xs text-slate-400">{r.vendas} negócio(s) fechado(s)</div>
+                                                                    ~
Operador '<' reservado para uso futuro.

No linha:5 caractere:36
+                     <div className={`font-bold text-sm 2xl:text-base  ...
+                                    ~
'}' de fechamento ausente no bloco de instrução ou na definição de tipo.

No linha:2 caractere:49
+                 <div key={r.vendedor} className={`relative flex flex- ...
+                                                 ~
'}' de fechamento ausente no bloco de instrução ou na definição de tipo.

No linha:1 caractere:29
+               {ranking.map((r, idx) => (
+                             ~~~~~~
A expressão de atribuição não é válida. A entrada para um operador de atribuição deve ser um objeto que seja capaz de aceitar atribuições, como uma variável ou uma propriedade.
   em System.Management.Automation.Runspaces.PipelineBase.Invoke(IEnumerable input)
   em Microsoft.PowerShell.Executor.ExecuteCommandHelper(Pipeline tempPipeline, Exception& exceptionThrown, ExecutionOptions options) O termo '<' não é reconhecido como nome de cmdlet, função, arquivo de script ou programa operável. Verifique a grafia do nome ou, se um caminho tiver sido incluído, veja se o caminho está correto e tente novamente. O termo '<' não é reconhecido como nome de cmdlet, função, arquivo de script ou programa operável. Verifique a grafia do nome ou, se um caminho tiver sido incluído, veja se o caminho está correto e tente novamente. O termo '<' não é reconhecido como nome de cmdlet, função, arquivo de script ou programa operável. Verifique a grafia do nome ou, se um caminho tiver sido incluído, veja se o caminho está correto e tente novamente. O termo '<' não é reconhecido como nome de cmdlet, função, arquivo de script ou programa operável. Verifique a grafia do nome ou, se um caminho tiver sido incluído, veja se o caminho está correto e tente novamente. O termo '<' não é reconhecido como nome de cmdlet, função, arquivo de script ou programa operável. Verifique a grafia do nome ou, se um caminho tiver sido incluído, veja se o caminho está correto e tente novamente. O termo '<' não é reconhecido como nome de cmdlet, função, arquivo de script ou programa operável. Verifique a grafia do nome ou, se um caminho tiver sido incluído, veja se o caminho está correto e tente novamente. O termo '<' não é reconhecido como nome de cmdlet, função, arquivo de script ou programa operável. Verifique a grafia do nome ou, se um caminho tiver sido incluído, veja se o caminho está correto e tente novamente. System.Management.Automation.ParseException: No linha:1 caractere:32
+               {(contracts.items ; []).map((c, idx) => {
+                                ~
')' de fechamento ausente na expressão.

No linha:1 caractere:36
+               {(contracts.items ; []).map((c, idx) => {
+                                    ~
Nome de tipo ausente depois de '['.

No linha:1 caractere:15
+               {(contracts.items ; []).map((c, idx) => {
+               ~
'}' de fechamento ausente no bloco de instrução ou na definição de tipo.

No linha:1 caractere:37
+               {(contracts.items ; []).map((c, idx) => {
+                                     ~
Token ')' inesperado na expressão ou instrução.

No linha:1 caractere:45
+               {(contracts.items ; []).map((c, idx) => {
+                                             ~
Argumento ausente na lista de parâmetros.

No linha:2 caractere:48
+                 const isCrit = c.daysRemaining <= 5;
+                                                ~
Operador '<' reservado para uso futuro.

No linha:3 caractere:48
+                 const isWarn = c.daysRemaining <= 15;
+                                                ~
Operador '<' reservado para uso futuro.

No linha:6 caractere:104
+ ... -bold text-sm 2xl:text-base text-white truncate">{c.advertiser}</div>
+                                                                    ~
Operador '<' reservado para uso futuro.

No linha:8 caractere:94
+ ... ssName="text-xs text-slate-400 truncate">{c.vendorName ; 'N/A'}</div>
+                                                                    ~
Operador '<' reservado para uso futuro.

No linha:10 caractere:42
+                         {c.daysRemaining}d
+                                          ~
Token 'd' inesperado na expressão ou instrução.

Nem todos os erros de análise foram indicados.  Corrija os erros indicados e tente de novo.
   em System.Management.Automation.Runspaces.PipelineBase.Invoke(IEnumerable input)
   em Microsoft.PowerShell.Executor.ExecuteCommandHelper(Pipeline tempPipeline, Exception& exceptionThrown, ExecutionOptions options) O termo '<' não é reconhecido como nome de cmdlet, função, arquivo de script ou programa operável. Verifique a grafia do nome ou, se um caminho tiver sido incluído, veja se o caminho está correto e tente novamente. O termo '<' não é reconhecido como nome de cmdlet, função, arquivo de script ou programa operável. Verifique a grafia do nome ou, se um caminho tiver sido incluído, veja se o caminho está correto e tente novamente. O termo '<' não é reconhecido como nome de cmdlet, função, arquivo de script ou programa operável. Verifique a grafia do nome ou, se um caminho tiver sido incluído, veja se o caminho está correto e tente novamente. O termo '<' não é reconhecido como nome de cmdlet, função, arquivo de script ou programa operável. Verifique a grafia do nome ou, se um caminho tiver sido incluído, veja se o caminho está correto e tente novamente. System.Management.Automation.ParseException: No linha:1 caractere:106
+ ... l:text-2xl font-black text-red-500">{contracts.expiring_5d ; 0}</div>
+                                                                    ~
Operador '<' reservado para uso futuro.
   em System.Management.Automation.Runspaces.PipelineBase.Invoke(IEnumerable input)
   em Microsoft.PowerShell.Executor.ExecuteCommandHelper(Pipeline tempPipeline, Exception& exceptionThrown, ExecutionOptions options) O termo '<' não é reconhecido como nome de cmdlet, função, arquivo de script ou programa operável. Verifique a grafia do nome ou, se um caminho tiver sido incluído, veja se o caminho está correto e tente novamente. O termo '<' não é reconhecido como nome de cmdlet, função, arquivo de script ou programa operável. Verifique a grafia do nome ou, se um caminho tiver sido incluído, veja se o caminho está correto e tente novamente. O termo '<' não é reconhecido como nome de cmdlet, função, arquivo de script ou programa operável. Verifique a grafia do nome ou, se um caminho tiver sido incluído, veja se o caminho está correto e tente novamente. System.Management.Automation.ParseException: No linha:1 caractere:110
+ ... xt-2xl font-black text-yellow-500">{contracts.expiring_15d ; 0}</div>
+                                                                    ~
Operador '<' reservado para uso futuro.
   em System.Management.Automation.Runspaces.PipelineBase.Invoke(IEnumerable input)
   em Microsoft.PowerShell.Executor.ExecuteCommandHelper(Pipeline tempPipeline, Exception& exceptionThrown, ExecutionOptions options) O termo '<' não é reconhecido como nome de cmdlet, função, arquivo de script ou programa operável. Verifique a grafia do nome ou, se um caminho tiver sido incluído, veja se o caminho está correto e tente novamente. O termo '<' não é reconhecido como nome de cmdlet, função, arquivo de script ou programa operável. Verifique a grafia do nome ou, se um caminho tiver sido incluído, veja se o caminho está correto e tente novamente. O termo '<' não é reconhecido como nome de cmdlet, função, arquivo de script ou programa operável. Verifique a grafia do nome ou, se um caminho tiver sido incluído, veja se o caminho está correto e tente novamente. System.Management.Automation.ParseException: No linha:1 caractere:98
+ ... xt-xl 2xl:text-2xl font-black text-white">{contracts.total ; 0}</div>
+                                                                    ~
Operador '<' reservado para uso futuro.
   em System.Management.Automation.Runspaces.PipelineBase.Invoke(IEnumerable input)
   em Microsoft.PowerShell.Executor.ExecuteCommandHelper(Pipeline tempPipeline, Exception& exceptionThrown, ExecutionOptions options) O termo '<' não é reconhecido como nome de cmdlet, função, arquivo de script ou programa operável. Verifique a grafia do nome ou, se um caminho tiver sido incluído, veja se o caminho está correto e tente novamente. O termo '<' não é reconhecido como nome de cmdlet, função, arquivo de script ou programa operável. Verifique a grafia do nome ou, se um caminho tiver sido incluído, veja se o caminho está correto e tente novamente. O termo '<' não é reconhecido como nome de cmdlet, função, arquivo de script ou programa operável. Verifique a grafia do nome ou, se um caminho tiver sido incluído, veja se o caminho está correto e tente novamente. O termo '<' não é reconhecido como nome de cmdlet, função, arquivo de script ou programa operável. Verifique a grafia do nome ou, se um caminho tiver sido incluído, veja se o caminho está correto e tente novamente. O termo '<' não é reconhecido como nome de cmdlet, função, arquivo de script ou programa operável. Verifique a grafia do nome ou, se um caminho tiver sido incluído, veja se o caminho está correto e tente novamente. O termo '<' não é reconhecido como nome de cmdlet, função, arquivo de script ou programa operável. Verifique a grafia do nome ou, se um caminho tiver sido incluído, veja se o caminho está correto e tente novamente. O termo '<' não é reconhecido como nome de cmdlet, função, arquivo de script ou programa operável. Verifique a grafia do nome ou, se um caminho tiver sido incluído, veja se o caminho está correto e tente novamente. O termo '<' não é reconhecido como nome de cmdlet, função, arquivo de script ou programa operável. Verifique a grafia do nome ou, se um caminho tiver sido incluído, veja se o caminho está correto e tente novamente. System.Management.Automation.ParseException: No linha:36 caractere:20
+         @keyframes ticker-move {
+                    ~~~~~~~~~~~
Token 'ticker-move' inesperado na expressão ou instrução.

No linha:38 caractere:45
+           100% { transform: translateX(-100%); }
+                                             ~
É necessário fornecer uma expressão de valor após o operador '%'.

No linha:41 caractere:16
+         @media (max-aspect-ratio: 1/1) {
+                ~
Token '(' inesperado na expressão ou instrução.

No linha:41 caractere:40
+         @media (max-aspect-ratio: 1/1) {
+                                        ~
Token '{' inesperado na expressão ou instrução.

No linha:62 caractere:24
+                 Painel <span className="text-brand-orange drop-shadow ...
+                        ~
Operador '<' reservado para uso futuro.

No linha:86 caractere:90
+ ... ="text-2xl 2xl:text-3xl font-black text-white">{loop.total || 0}</div ...
+                                                                ~~
O token '||' não é um separador de instruções válido nesta versão.

No linha:86 caractere:93
+ ... "text-2xl 2xl:text-3xl font-black text-white">{loop.total || 0}</div>
+                                                                  ~
Expressões são permitidas apenas como o primeiro elemento de um pipeline.

No linha:86 caractere:95
+ ... "text-2xl 2xl:text-3xl font-black text-white">{loop.total || 0}</div>
+                                                                    ~
Operador '<' reservado para uso futuro.

No linha:91 caractere:110
+ ... 2xl 2xl:text-3xl font-black text-emerald-400">{loop.online ; 0}</div>
+                                                                    ~
Operador '<' reservado para uso futuro.

No linha:96 caractere:103
+ ... xt-2xl 2xl:text-3xl font-black text-red-500">{loop.lotados || 0}</div ...
+                                                                ~~
O token '||' não é um separador de instruções válido nesta versão.

Nem todos os erros de análise foram indicados.  Corrija os erros indicados e tente de novo.
   em System.Management.Automation.Runspaces.PipelineBase.Invoke(IEnumerable input)
   em Microsoft.PowerShell.Executor.ExecuteCommandHelper(Pipeline tempPipeline, Exception& exceptionThrown, ExecutionOptions options) O termo '<' não é reconhecido como nome de cmdlet, função, arquivo de script ou programa operável. Verifique a grafia do nome ou, se um caminho tiver sido incluído, veja se o caminho está correto e tente novamente. O termo '<' não é reconhecido como nome de cmdlet, função, arquivo de script ou programa operável. Verifique a grafia do nome ou, se um caminho tiver sido incluído, veja se o caminho está correto e tente novamente. O termo '<' não é reconhecido como nome de cmdlet, função, arquivo de script ou programa operável. Verifique a grafia do nome ou, se um caminho tiver sido incluído, veja se o caminho está correto e tente novamente. System.Management.Automation.ParseException: No linha:2 caractere:117
+ ... een w-screen overflow-hidden bg-brand-dark text-slate-100 font-sans">
+                                                                          ~
')' de fechamento ausente na expressão.

No linha:3 caractere:7
+       {/* Background Orbs */}
+       ~
Token '{' inesperado na expressão ou instrução.
   em System.Management.Automation.Runspaces.PipelineBase.Invoke(IEnumerable input)
   em Microsoft.PowerShell.Executor.ExecuteCommandHelper(Pipeline tempPipeline, Exception& exceptionThrown, ExecutionOptions options) System.Management.Automation.ParseException: No linha:1 caractere:36
+   const postits = data?.postits ; [];
+                                    ~
Nome de tipo ausente depois de '['.
   em System.Management.Automation.Runspaces.PipelineBase.Invoke(IEnumerable input)
   em Microsoft.PowerShell.Executor.ExecuteCommandHelper(Pipeline tempPipeline, Exception& exceptionThrown, ExecutionOptions options) System.Management.Automation.ParseException: No linha:1 caractere:36
+   const ranking = data?.ranking ; [];
+                                    ~
Nome de tipo ausente depois de '['.
   em System.Management.Automation.Runspaces.PipelineBase.Invoke(IEnumerable input)
   em Microsoft.PowerShell.Executor.ExecuteCommandHelper(Pipeline tempPipeline, Exception& exceptionThrown, ExecutionOptions options) O termo 'const' não é reconhecido como nome de cmdlet, função, arquivo de script ou programa operável. Verifique a grafia do nome ou, se um caminho tiver sido incluído, veja se o caminho está correto e tente novamente. System.Management.Automation.ParseException: No linha:1 caractere:27
+   const loop = data?.loop || {};
+                           ~~
O token '||' não é um separador de instruções válido nesta versão.

No linha:1 caractere:30
+   const loop = data?.loop || {};
+                              ~~
Expressões são permitidas apenas como o primeiro elemento de um pipeline.
   em System.Management.Automation.Runspaces.PipelineBase.Invoke(IEnumerable input)
   em Microsoft.PowerShell.Executor.ExecuteCommandHelper(Pipeline tempPipeline, Exception& exceptionThrown, ExecutionOptions options) System.Management.Automation.ParseException: No linha:1 caractere:43
+   const tickerText = (data?.ticker_message ; '').trim() ; 'Painel Int ...
+                                           ~
')' de fechamento ausente na expressão.

No linha:1 caractere:48
+   const tickerText = (data?.ticker_message ; '').trim() ; 'Painel Int ...
+                                                ~
Token ')' inesperado na expressão ou instrução.

No linha:1 caractere:55
+   const tickerText = (data?.ticker_message ; '').trim() ; 'Painel Int ...
+                                                       ~
Uma expressão era esperada após '('.
   em System.Management.Automation.Runspaces.PipelineBase.Invoke(IEnumerable input)
   em Microsoft.PowerShell.Executor.ExecuteCommandHelper(Pipeline tempPipeline, Exception& exceptionThrown, ExecutionOptions options) System.Management.Automation.ParseException: No linha:1 caractere:29
+   const warnings = useMemo(() => data?.warnings ; [], [data]);
+                             ~
Uma expressão era esperada após '('.

No linha:1 caractere:48
+   const warnings = useMemo(() => data?.warnings ; [], [data]);
+                                                ~
')' de fechamento ausente na expressão.

No linha:1 caractere:52
+   const warnings = useMemo(() => data?.warnings ; [], [data]);
+                                                    ~
Nome de tipo ausente depois de '['.

No linha:1 caractere:53
+   const warnings = useMemo(() => data?.warnings ; [], [data]);
+                                                     ~
Argumento ausente na lista de parâmetros.

No linha:1 caractere:61
+   const warnings = useMemo(() => data?.warnings ; [], [data]);
+                                                             ~
Token ')' inesperado na expressão ou instrução.

No linha:1 caractere:29
+   const warnings = useMemo(() => data?.warnings ; [], [data]);
+                             ~
A expressão de atribuição não é válida. A entrada para um operador de atribuição deve ser um objeto que seja capaz de aceitar atribuições, como uma variável ou uma propriedade.
   em System.Management.Automation.Runspaces.PipelineBase.Invoke(IEnumerable input)
   em Microsoft.PowerShell.Executor.ExecuteCommandHelper(Pipeline tempPipeline, Exception& exceptionThrown, ExecutionOptions options) System.Management.Automation.ParseException: No linha:1 caractere:3
+   }, []);
+   ~
Token '}' inesperado na expressão ou instrução.

No linha:1 caractere:7
+   }, []);
+       ~
Nome de tipo ausente depois de '['.

No linha:1 caractere:5
+   }, []);
+     ~
Expressão ausente após operador unário ','.

No linha:1 caractere:6
+   }, []);
+      ~~
Token '[]' inesperado na expressão ou instrução.

No linha:1 caractere:8
+   }, []);
+        ~
Token ')' inesperado na expressão ou instrução.
   em System.Management.Automation.Runspaces.PipelineBase.Invoke(IEnumerable input)
   em Microsoft.PowerShell.Executor.ExecuteCommandHelper(Pipeline tempPipeline, Exception& exceptionThrown, ExecutionOptions options) System.Management.Automation.ParseException: No linha:1 caractere:13
+     return () => {
+             ~
Uma expressão era esperada após '('.

No linha:1 caractere:13
+     return () => {
+             ~
A expressão de atribuição não é válida. A entrada para um operador de atribuição deve ser um objeto que seja capaz de aceitar atribuições, como uma variável ou uma propriedade.
   em System.Management.Automation.Runspaces.PipelineBase.Invoke(IEnumerable input)
   em Microsoft.PowerShell.Executor.ExecuteCommandHelper(Pipeline tempPipeline, Exception& exceptionThrown, ExecutionOptions options) System.Management.Automation.ParseException: No linha:1 caractere:32
+     const id = setInterval(load, POLL_MS);
+                                ~
Argumento ausente na lista de parâmetros.
   em System.Management.Automation.Runspaces.PipelineBase.Invoke(IEnumerable input)
   em Microsoft.PowerShell.Executor.ExecuteCommandHelper(Pipeline tempPipeline, Exception& exceptionThrown, ExecutionOptions options) System.Management.Automation.ParseException: No linha:1 caractere:10
+     load();
+          ~
Uma expressão era esperada após '('.
   em System.Management.Automation.Runspaces.PipelineBase.Invoke(IEnumerable input)
   em Microsoft.PowerShell.Executor.ExecuteCommandHelper(Pipeline tempPipeline, Exception& exceptionThrown, ExecutionOptions options) System.Management.Automation.ParseException: No linha:1 caractere:5
+     }
+     ~
Token '}' inesperado na expressão ou instrução.
   em System.Management.Automation.Runspaces.PipelineBase.Invoke(IEnumerable input)
   em Microsoft.PowerShell.Executor.ExecuteCommandHelper(Pipeline tempPipeline, Exception& exceptionThrown, ExecutionOptions options) System.Management.Automation.ParseException: No linha:1 caractere:32
+ export default function TvWall() {
+                                ~
Uma expressão era esperada após '('.

No linha:6 caractere:14
+   useEffect(() => {
+              ~
Uma expressão era esperada após '('.

No linha:9 caractere:25
+     async function load() {
+                         ~
Uma expressão era esperada após '('.

No linha:12 caractere:20
+         if (!res.ok) throw new Error(`HTTP ${res.status}`);
+                    ~
Bloco de instrução ausente após if ( condição ).

No linha:12 caractere:59
+         if (!res.ok) throw new Error(`HTTP ${res.status}`);
+                                                           ~
')' de fechamento ausente na expressão.

No linha:13 caractere:37
+         const json = await res.json();
+                                     ~
Uma expressão era esperada após '('.

No linha:14 caractere:19
+         if (!alive) return;
+                   ~
Bloco de instrução ausente após if ( condição ).

No linha:18 caractere:14
+       } catch (err) {
+              ~
Bloco de instrução ausente no bloco Catch.

No linha:18 caractere:21
+       } catch (err) {
+                     ~
Token '{' inesperado na expressão ou instrução.

No linha:19 caractere:19
+         if (!alive) return;
+                   ~
Bloco de instrução ausente após if ( condição ).

Nem todos os erros de análise foram indicados.  Corrija os erros indicados e tente de novo.
   em System.Management.Automation.Runspaces.PipelineBase.Invoke(IEnumerable input)
   em Microsoft.PowerShell.Executor.ExecuteCommandHelper(Pipeline tempPipeline, Exception& exceptionThrown, ExecutionOptions options) System.Management.Automation.ParseException: No linha:1 caractere:21
+ function toneColors(tone) {
+                     ~
')' ausente na lista de parâmetros da função.

No linha:1 caractere:25
+ function toneColors(tone) {
+                         ~
Token ')' inesperado na expressão ou instrução.

No linha:3 caractere:9
+     case 'critical': return 'border-red-500 text-red-400';
+         ~
Bloco de instrução ausente na cláusula de instrução switch.

No linha:3 caractere:20
+     case 'critical': return 'border-red-500 text-red-400';
+                    ~
Bloco de instrução ausente na cláusula de instrução switch.

No linha:3 caractere:21
+     case 'critical': return 'border-red-500 text-red-400';
+                     ~
Bloco de instrução ausente na cláusula de instrução switch.

No linha:3 caractere:28
+     case 'critical': return 'border-red-500 text-red-400';
+                            ~
Bloco de instrução ausente na cláusula de instrução switch.

No linha:3 caractere:58
+     case 'critical': return 'border-red-500 text-red-400';
+                                                          ~
Bloco de instrução ausente na cláusula de instrução switch.

No linha:4 caractere:9
+     case 'high': return 'border-orange-500 text-orange-400';
+         ~
Bloco de instrução ausente na cláusula de instrução switch.

No linha:4 caractere:16
+     case 'high': return 'border-orange-500 text-orange-400';
+                ~
Bloco de instrução ausente na cláusula de instrução switch.

No linha:4 caractere:17
+     case 'high': return 'border-orange-500 text-orange-400';
+                 ~
Bloco de instrução ausente na cláusula de instrução switch.

Nem todos os erros de análise foram indicados.  Corrija os erros indicados e tente de novo.
   em System.Management.Automation.Runspaces.PipelineBase.Invoke(IEnumerable input)
   em Microsoft.PowerShell.Executor.ExecuteCommandHelper(Pipeline tempPipeline, Exception& exceptionThrown, ExecutionOptions options) System.Management.Automation.ParseException: No linha:1 caractere:21
+ function statusTone(pct) {
+                     ~
')' ausente na lista de parâmetros da função.

No linha:1 caractere:24
+ function statusTone(pct) {
+                        ~
Token ')' inesperado na expressão ou instrução.

No linha:2 caractere:17
+   if (pct >= 100) return 'critical';
+                 ~
Bloco de instrução ausente após if ( condição ).

No linha:3 caractere:16
+   if (pct >= 90) return 'high';
+                ~
Bloco de instrução ausente após if ( condição ).

No linha:4 caractere:16
+   if (pct >= 75) return 'medium';
+                ~
Bloco de instrução ausente após if ( condição ).
   em System.Management.Automation.Runspaces.PipelineBase.Invoke(IEnumerable input)
   em Microsoft.PowerShell.Executor.ExecuteCommandHelper(Pipeline tempPipeline, Exception& exceptionThrown, ExecutionOptions options) System.Management.Automation.ParseException: No linha:1 caractere:22
+ function fmtDateTime(iso) {
+                      ~
')' ausente na lista de parâmetros da função.

No linha:1 caractere:25
+ function fmtDateTime(iso) {
+                         ~
Token ')' inesperado na expressão ou instrução.

No linha:2 caractere:26
+   const d = new Date(iso || Date.now());
+                          ~~
O token '||' não é um separador de instruções válido nesta versão.

No linha:2 caractere:38
+   const d = new Date(iso || Date.now());
+                                      ~
Uma expressão era esperada após '('.
   em System.Management.Automation.Runspaces.PipelineBase.Invoke(IEnumerable input)
   em Microsoft.PowerShell.Executor.ExecuteCommandHelper(Pipeline tempPipeline, Exception& exceptionThrown, ExecutionOptions options) System.Management.Automation.ParseException: No linha:1 caractere:1
+ }
+ ~
Token '}' inesperado na expressão ou instrução.
   em System.Management.Automation.Runspaces.PipelineBase.Invoke(IEnumerable input)
   em Microsoft.PowerShell.Executor.ExecuteCommandHelper(Pipeline tempPipeline, Exception& exceptionThrown, ExecutionOptions options) O termo 'num.toLocaleString' não é reconhecido como nome de cmdlet, função, arquivo de script ou programa operável. Verifique a grafia do nome ou, se um caminho tiver sido incluído, veja se o caminho está correto e tente novamente. System.Management.Automation.ParseException: No linha:1 caractere:19
+ function fmtMoney(value) {
+                   ~
')' ausente na lista de parâmetros da função.

No linha:1 caractere:24
+ function fmtMoney(value) {
+                        ~
Token ')' inesperado na expressão ou instrução.

No linha:2 caractere:27
+   const num = Number(value ; 0);
+                           ~
')' de fechamento ausente na expressão.

No linha:1 caractere:26
+ function fmtMoney(value) {
+                          ~
'}' de fechamento ausente no bloco de instrução ou na definição de tipo.

No linha:2 caractere:31
+   const num = Number(value ; 0);
+                               ~
Token ')' inesperado na expressão ou instrução.
   em System.Management.Automation.Runspaces.PipelineBase.Invoke(IEnumerable input)
   em Microsoft.PowerShell.Executor.ExecuteCommandHelper(Pipeline tempPipeline, Exception& exceptionThrown, ExecutionOptions options) O termo 'const' não é reconhecido como nome de cmdlet, função, arquivo de script ou programa operável. Verifique a grafia do nome ou, se um caminho tiver sido incluído, veja se o caminho está correto e tente novamente. System.Management.Automation.ParseException: No linha:1 caractere:18
+ import { Activity, BadgeDollarSign, FileWarning, Newspaper, StickyNot ...
+                  ~
Argumento ausente na lista de parâmetros.
   em System.Management.Automation.Runspaces.PipelineBase.Invoke(IEnumerable input)
   em Microsoft.PowerShell.Executor.ExecuteCommandHelper(Pipeline tempPipeline, Exception& exceptionThrown, ExecutionOptions options) System.Management.Automation.ParseException: No linha:1 caractere:19
+ import { useEffect, useMemo, useState } from 'react';
+                   ~
Argumento ausente na lista de parâmetros.
   em System.Management.Automation.Runspaces.PipelineBase.Invoke(IEnumerable input)
   em Microsoft.PowerShell.Executor.ExecuteCommandHelper(Pipeline tempPipeline, Exception& exceptionThrown, ExecutionOptions options) System.Management.Automation.ParseException: No linha:1 caractere:6
+ cat << 'EOF' > "frontend/src/pages/TvWall.jsx"
+      ~
Especificação de arquivo ausente após o operador de redirecionamento.

No linha:1 caractere:5
+ cat << 'EOF' > "frontend/src/pages/TvWall.jsx"
+     ~
Operador '<' reservado para uso futuro.

No linha:1 caractere:6
+ cat << 'EOF' > "frontend/src/pages/TvWall.jsx"
+      ~
Operador '<' reservado para uso futuro.
   em System.Management.Automation.Runspaces.PipelineBase.Invoke(IEnumerable input)
   em Microsoft.PowerShell.Executor.ExecuteCommandHelper(Pipeline tempPipeline, Exception& exceptionThrown, ExecutionOptions options) {"error":"Falha ao montar painel TV."} {"error":"Token de autenticação obrigatório."} System.Management.Automation.ParseException: No linha:7 caractere:135
+ ... idiakit_prod -h 127.0.0.1 -c \"INSERT INTO app_settings (key, value,  ...
+                                                                 ~
Argumento ausente na lista de parâmetros.

No linha:7 caractere:200
+ ... lue, updated_at) VALUES ('evolution_pdf_instance', 'aux adm', now())  ...
+                                                                  ~
Expressão ausente após ','.

No linha:7 caractere:201
+ ...  updated_at) VALUES ('evolution_pdf_instance', 'aux adm', now()) ON C ...
+                                                               ~~~
Token 'now' inesperado na expressão ou instrução.

No linha:7 caractere:200
+ ... lue, updated_at) VALUES ('evolution_pdf_instance', 'aux adm', now())  ...
+                                                                  ~
')' de fechamento ausente na expressão.

No linha:7 caractere:205
+ ... updated_at) VALUES ('evolution_pdf_instance', 'aux adm', now()) ON CO ...
+                                                                  ~
Uma expressão era esperada após '('.

No linha:7 caractere:206
+ ... dated_at) VALUES ('evolution_pdf_instance', 'aux adm', now()) ON CONF ...
+                                                                 ~
Token ')' inesperado na expressão ou instrução.

No linha:7 caractere:281
+ ... T (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()\"'''
+                                                                    ~
Uma expressão era esperada após '('.
   em System.Management.Automation.Runspaces.PipelineBase.Invoke(IEnumerable input)
   em Microsoft.PowerShell.Executor.ExecuteCommandHelper(Pipeline tempPipeline, Exception& exceptionThrown, ExecutionOptions options) O termo '\' não é reconhecido como nome de cmdlet, função, arquivo de script ou programa operável. Verifique a grafia do nome ou, se um caminho tiver sido incluído, veja se o caminho está correto e tente novamente. O termo 'r.key' não é reconhecido como nome de cmdlet, função, arquivo de script ou programa operável. Verifique a grafia do nome ou, se um caminho tiver sido incluído, veja se o caminho está correto e tente novamente. O termo '\\\SELECT key, value FROM settings WHERE key LIKE 'evolution%'\\\' não é reconhecido como nome de cmdlet, função, arquivo de script ou programa operável. Verifique a grafia do nome ou, se um caminho tiver sido incluído, veja se o caminho está correto e tente novamente. Não é possível localizar um parâmetro que coincida com o nome de parâmetro 'Chord'. Não é possível localizar um parâmetro que coincida com o nome de parâmetro 'Chord'. Não é possível localizar um parâmetro que coincida com o nome de parâmetro 'Chord'. Não é possível localizar um parâmetro que coincida com o nome de parâmetro 'Chord'.\] : []), ...warnings].map((msg, i) => <div key={i}>{msg}</div>)}
          </div>
        </div>
      ) : null}
    </div>
  );
}
