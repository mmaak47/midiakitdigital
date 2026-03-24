import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown } from 'lucide-react';

export default function CustomSelect({ value, onChange, options, label, placeholder = 'Selecione' }) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedLabel = options.find(opt => opt === value) || placeholder;

  return (
    <div ref={dropdownRef} className="relative">
      {label && (
        <label className="text-xs text-brand-gray-500 uppercase tracking-wide font-semibold block mb-2">
          {label}
        </label>
      )}
      
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-4 py-3 rounded-xl bg-gradient-to-r from-white/10 to-white/5 border border-white/15 text-white text-sm font-medium flex items-center justify-between hover:border-white/25 hover:bg-gradient-to-r hover:from-white/12 hover:to-white/7 transition-all duration-200 focus:outline-none focus:border-brand-orange/40"
      >
        <span className={selectedLabel === placeholder ? 'text-brand-gray-400' : 'text-white'}>
          {selectedLabel}
        </span>
        <ChevronDown 
          size={16} 
          className={`text-brand-gray-500 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.15 }}
            className="absolute top-full left-0 right-0 mt-2 bg-gradient-to-b from-[#1a1a1a] to-[#121212] border border-white/15 rounded-xl shadow-2xl shadow-black/50 overflow-hidden z-50 max-h-96"
          >
            <div className="max-h-96 overflow-y-auto scrollbar-thin scrollbar-thumb-white/20 scrollbar-track-transparent">
              {options.map((option, i) => (
                <motion.button
                  key={option}
                  initial={{ opacity: 0, x: -4 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.02 }}
                  onClick={() => {
                    onChange(option);
                    setIsOpen(false);
                  }}
                  className={`w-full px-4 py-3 text-sm font-medium text-left transition-all duration-150 flex items-center justify-between group ${
                    value === option
                      ? 'bg-gradient-to-r from-brand-orange to-brand-orange-hover text-white'
                      : 'text-brand-gray-200 hover:bg-gradient-to-r hover:from-white/10 hover:to-white/5 hover:border-l-2 hover:border-brand-orange'
                  }`}
                >
                  <span>{option}</span>
                  {value === option && (
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
