import { useMemo, useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, X } from 'lucide-react';

function normalizeOption(option) {
  if (typeof option === 'string') {
    return { value: option, label: option };
  }

  return {
    value: option?.value ?? option?.label ?? '',
    label: option?.label ?? option?.value ?? ''
  };
}

export default function CustomSelect({
  value,
  onChange,
  options,
  label,
  isDark = true,
  placeholder = 'Selecione',
  multiple = false,
  allowCustom = false,
  customPlaceholder = 'Digite e pressione Enter'
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [draftValue, setDraftValue] = useState('');
  const dropdownRef = useRef(null);

  const normalizedOptions = useMemo(() => {
    return (options || []).map(normalizeOption).filter((option) => option.value);
  }, [options]);

  const normalizedValue = useMemo(() => {
    if (multiple) {
      return Array.isArray(value) ? value.filter(Boolean) : [];
    }
    return value || '';
  }, [multiple, value]);

  const selectedValues = multiple ? normalizedValue : (normalizedValue ? [normalizedValue] : []);

  const selectedLabels = useMemo(() => {
    return selectedValues.map((selected) => {
      const matched = normalizedOptions.find((option) => option.value === selected);
      return matched?.label || selected;
    });
  }, [normalizedOptions, selectedValues]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const commitCustomValue = () => {
    const nextValue = draftValue.trim();
    if (!nextValue) return;

    if (multiple) {
      const next = selectedValues.includes(nextValue)
        ? selectedValues
        : [...selectedValues, nextValue];
      onChange(next);
    } else {
      onChange(nextValue);
      setIsOpen(false);
    }

    setDraftValue('');
  };

  const handleSelect = (optionValue) => {
    if (multiple) {
      const exists = selectedValues.includes(optionValue);
      onChange(exists
        ? selectedValues.filter((item) => item !== optionValue)
        : [...selectedValues, optionValue]);
      return;
    }

    onChange(optionValue);
    setIsOpen(false);
  };

  const handleRemove = (optionValue) => {
    if (!multiple) {
      onChange('');
      return;
    }
    onChange(selectedValues.filter((item) => item !== optionValue));
  };

  const triggerLabel = useMemo(() => {
    if (!selectedValues.length) return placeholder;
    if (!multiple) return selectedLabels[0] || placeholder;
    if (selectedLabels.length <= 2) return selectedLabels.join(', ');
    return `${selectedLabels.slice(0, 2).join(', ')} +${selectedLabels.length - 2}`;
  }, [multiple, placeholder, selectedLabels, selectedValues.length]);

  return (
    <div ref={dropdownRef} className="relative">
      {label && (
        <label className={`text-xs uppercase tracking-wide font-semibold block mb-2 ${isDark ? 'text-brand-gray-500' : 'text-neutral-500'}`}>
          {label}
        </label>
      )}
      
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full px-4 py-3 rounded-xl text-sm font-medium flex items-center justify-between transition-all duration-200 focus:outline-none focus:border-brand-orange/40 ${isDark ? 'bg-gradient-to-r from-white/10 to-white/5 border border-white/15 text-white hover:border-white/25 hover:bg-gradient-to-r hover:from-white/12 hover:to-white/7' : 'bg-white border border-neutral-300 text-neutral-900 hover:border-neutral-400 hover:bg-neutral-50'}`}
      >
        <span className={`${selectedValues.length === 0 ? (isDark ? 'text-brand-gray-400' : 'text-neutral-400') : (isDark ? 'text-white' : 'text-neutral-900')} truncate text-left`}>
          {triggerLabel}
        </span>
        <ChevronDown 
          size={16} 
          className={`${isDark ? 'text-brand-gray-500' : 'text-neutral-500'} transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {multiple && selectedValues.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {selectedValues.map((selected) => {
            const matched = normalizedOptions.find((option) => option.value === selected);
            const chipLabel = matched?.label || selected;
            return (
              <span
                key={selected}
                className="inline-flex items-center gap-1.5 rounded-full border border-brand-orange/25 bg-brand-orange/10 px-2.5 py-1 text-[11px] font-medium leading-none text-brand-orange"
              >
                {chipLabel}
                <button
                  type="button"
                  onClick={() => handleRemove(selected)}
                  className="text-brand-orange/70 transition-colors hover:text-brand-orange"
                  aria-label={`Remover ${chipLabel}`}
                >
                  <X size={12} />
                </button>
              </span>
            );
          })}
        </div>
      )}

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.15 }}
            className={`absolute top-full left-0 right-0 mt-2 rounded-xl overflow-hidden z-50 max-h-96 ${isDark ? 'bg-gradient-to-b from-[#1a1a1a] to-[#121212] border border-white/15 shadow-2xl shadow-black/50' : 'bg-white border border-neutral-200 shadow-xl shadow-neutral-200/80'}`}
          >
            {allowCustom && (
              <div className={`border-b p-3 ${isDark ? 'border-white/10' : 'border-neutral-200'}`}>
                <input
                  type="text"
                  value={draftValue}
                  onChange={(e) => setDraftValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      commitCustomValue();
                    }
                  }}
                  placeholder={customPlaceholder}
                  className={`w-full rounded-lg px-3 py-2 text-sm outline-none transition-colors focus:border-brand-orange/35 ${isDark ? 'border border-white/10 bg-white/5 text-white' : 'border border-neutral-300 bg-neutral-50 text-neutral-900'}`}
                />
                <div className="mt-2 flex justify-end">
                  <button
                    type="button"
                    onClick={commitCustomValue}
                    disabled={!draftValue.trim()}
                    className={`rounded-lg px-3 py-1.5 text-xs transition-colors disabled:opacity-40 ${isDark ? 'border border-white/10 bg-white/5 text-brand-gray-300 hover:bg-white/10' : 'border border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50'}`}
                  >
                    Adicionar
                  </button>
                </div>
              </div>
            )}
            <div className={`max-h-96 overflow-y-auto scrollbar-thin scrollbar-track-transparent ${isDark ? 'scrollbar-thumb-white/20' : 'scrollbar-thumb-neutral-300'}`}>
              {normalizedOptions.map((option, i) => (
                <motion.button
                  key={option.value}
                  type="button"
                  initial={{ opacity: 0, x: -4 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.02 }}
                  onClick={() => handleSelect(option.value)}
                  className={`w-full px-4 py-3 text-sm font-medium text-left transition-all duration-150 flex items-center justify-between group ${
                    selectedValues.includes(option.value)
                      ? 'bg-gradient-to-r from-brand-orange to-brand-orange-hover text-white'
                      : (isDark
                        ? 'text-brand-gray-200 hover:bg-gradient-to-r hover:from-white/10 hover:to-white/5 hover:border-l-2 hover:border-brand-orange'
                        : 'text-neutral-700 hover:bg-neutral-100 hover:border-l-2 hover:border-brand-orange')
                  }`}
                >
                  <span>{option.label}</span>
                  {selectedValues.includes(option.value) && (
                    <span className="text-lg">✓</span>
                  )}
                </motion.button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
