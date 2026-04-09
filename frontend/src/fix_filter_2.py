import re

with open('pages/Landing.jsx', 'r', encoding='utf-8') as f:
    text = f.read()

start_str = """          <motion.div
            variants={fadeUp}
            initial="hidden"
            animate="visible"
            custom={3}
            className="p-6 rounded-[16px] backdrop-blur-xl sticky top-20 z-40 transition-shadow duration-300"
            style={{
              background: isDark
                ? 'linear-gradient(135deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.03) 100%)'
                : '#FFFFFF',
              border: `1px solid ${isDark ? 'rgba(255,107,53,0.15)' : '#EFE0D8'}`,
              boxShadow: isDark
                ? '0 24px 64px rgba(0,0,0,0.50), inset 0 1px 0 rgba(255,255,255,0.08)'
                : '0 4px 24px rgba(0,0,0,0.06)',
            }}
          >"""

end_str = """                Abrir mapa
              </button>
              </div>
            </div>
          </motion.div>"""

start_idx = text.find(start_str)
end_idx = text.find(end_str) + len(end_str)

if start_idx == -1:
    print("Filter block not found")
    exit(1)

filter_box_code = text[start_idx:end_idx]
print('Found filter block')

modified_filter_box_code = filter_box_code.replace('sticky top-20 z-40 ', 'shadow-2xl ')

text = text.replace(filter_box_code, '<div className="h-[210px] w-full" /* Spacer for floating filter */ />')

end_hero = """          )}
        </div>
      </section>"""

floating_filter = "\n      {/* ── Floating Sticky Filter ── */}\n"
floating_filter += "      <div className=\"sticky top-6 z-[60] w-full mt-[-234px] pointer-events-none mb-6\">\n"
floating_filter += "        <div className=\"relative max-w-7xl mx-auto px-6 pointer-events-auto\">\n"
floating_filter += modified_filter_box_code + "\n"
floating_filter += "        </div>\n      </div>\n"

text = text.replace(end_hero, end_hero + floating_filter)

with open('pages/Landing.jsx', 'w', encoding='utf-8') as f:
    f.write(text)

print("Done replacing.")
