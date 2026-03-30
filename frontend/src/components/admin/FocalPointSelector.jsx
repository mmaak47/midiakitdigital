const FOCAL_OPTIONS = [
  ['top left', 'top center', 'top right'],
  ['center left', 'center center', 'center right'],
  ['bottom left', 'bottom center', 'bottom right']
];

const LABELS_PT = {
  'top left': 'superior esquerdo',
  'top center': 'superior centro',
  'top right': 'superior direito',
  'center left': 'centro esquerdo',
  'center center': 'centro',
  'center right': 'centro direito',
  'bottom left': 'inferior esquerdo',
  'bottom center': 'inferior centro',
  'bottom right': 'inferior direito'
};

export default function FocalPointSelector({ value = 'center center', onChange, imageUrl = '' }) {
  const current = LABELS_PT[value] ? value : 'center center';

  return (
    <div>
      <label className="mb-2 block text-sm font-medium text-gray-700">Ponto focal da foto</label>

      <div className="mb-3 h-[135px] w-[240px] overflow-hidden rounded-lg border border-gray-200 bg-gray-100">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt="Preview do ponto focal"
            className="h-full w-full object-cover"
            style={{ objectPosition: current }}
            loading="lazy"
            width="240"
            height="135"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-sm text-gray-500">Sem foto</div>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2 w-fit">
        {FOCAL_OPTIONS.flatMap((row) => row).map((option) => {
          const selected = option === current;
          return (
            <button
              key={option}
              type="button"
              onClick={() => onChange?.(option)}
              className={`flex h-8 w-8 items-center justify-center rounded border transition-colors ${
                selected
                  ? 'bg-[#E8591A] border-[#E8591A] hover:bg-orange-600'
                  : 'bg-gray-100 border-gray-200 hover:bg-gray-200'
              }`}
              aria-label={`Selecionar ${LABELS_PT[option] || option}`}
              title={LABELS_PT[option] || option}
            >
              <span className={`h-2 w-2 rounded-full ${selected ? 'bg-white' : 'bg-gray-400'}`} />
            </button>
          );
        })}
      </div>

      <p className="mt-2 text-xs text-gray-400">Posição: {LABELS_PT[current] || 'centro'}</p>
    </div>
  );
}
