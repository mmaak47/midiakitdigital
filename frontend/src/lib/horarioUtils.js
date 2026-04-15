/**
 * normalizeHorarioForPdf(horario)
 *
 * Takes any horario format stored in the DB and returns a compact string
 * suitable for PDF rendering (one or two lines max).
 *
 * Supported inputs:
 *  - null / '' / '-'                 → fallback
 *  - '24 horas' / '24/7'            → '24 horas'
 *  - '06:00 às 22:00'               → '06:00 às 22:00'
 *  - Google weekday_text joined:     'segunda-feira: 08:00 – 18:00 | terça-feira: ...'
 *  - OSM opening_hours:             'Mo-Fr 08:00-18:00; Sa 08:00-12:00'
 *  - Scraper per-day text
 *
 * Output example: 'Seg-Sex 08:00–18:00 · Sáb 08:00–12:00'
 */

const DAY_ORDER = ['segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado', 'domingo'];
const DAY_ABBREV = { segunda: 'Seg', terca: 'Ter', quarta: 'Qua', quinta: 'Qui', sexta: 'Sex', sabado: 'Sáb', domingo: 'Dom' };

const PT_DAY_MAP = {
  'segunda-feira': 'segunda', 'segunda': 'segunda', 'seg': 'segunda',
  'terça-feira': 'terca', 'terca-feira': 'terca', 'terça': 'terca', 'terca': 'terca', 'ter': 'terca',
  'quarta-feira': 'quarta', 'quarta': 'quarta', 'qua': 'quarta',
  'quinta-feira': 'quinta', 'quinta': 'quinta', 'qui': 'quinta',
  'sexta-feira': 'sexta', 'sexta': 'sexta', 'sex': 'sexta',
  'sábado': 'sabado', 'sabado': 'sabado', 'sáb': 'sabado', 'sab': 'sabado',
  'domingo': 'domingo', 'dom': 'domingo',
};

const EN_DAY_MAP = {
  mo: 'segunda', tu: 'terca', we: 'quarta', th: 'quinta', fr: 'sexta', sa: 'sabado', su: 'domingo',
  monday: 'segunda', tuesday: 'terca', wednesday: 'quarta', thursday: 'quinta',
  friday: 'sexta', saturday: 'sabado', sunday: 'domingo',
};

function normDay(raw) {
  const s = String(raw || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  return PT_DAY_MAP[s] || EN_DAY_MAP[s] || null;
}

function cleanTime(t) {
  return String(t || '').replace(/(\d{1,2})h(\d{2})/gi, '$1:$2').replace(/(\d{1,2})h(?!\d)/gi, '$1:00').replace(/\./g, ':').replace(/\s+/g, ' ').replace(/\s*[-–—]\s*/g, '–').replace(/\s*às\s*/gi, '–').trim();
}

/* Parse a single "day: time" entry from Google weekday_text */
function parseGoogleDayEntry(entry) {
  const m = entry.match(/^([^:]+):\s*(.+)$/);
  if (!m) return null;
  const day = normDay(m[1]);
  if (!day) return null;
  return { day, hours: cleanTime(m[2]) };
}

/* Parse OSM opening_hours like "Mo-Fr 08:00-18:00; Sa 08:00-12:00" */
function parseOsmHours(text) {
  const result = {};
  const parts = text.split(';').map((s) => s.trim()).filter(Boolean);
  for (const part of parts) {
    if (/24\s*\/?\s*7/i.test(part)) {
      for (const d of DAY_ORDER) result[d] = '24 horas';
      continue;
    }
    const m = part.match(/^([A-Za-z, -]+)\s+(.+)$/);
    if (!m) continue;
    const daySpec = m[1].trim();
    const timeSpec = cleanTime(m[2]);
    const days = expandOsmDays(daySpec);
    for (const d of days) {
      if (d) result[d] = timeSpec;
    }
  }
  return result;
}

function expandOsmDays(spec) {
  const enShort = ['mo', 'tu', 'we', 'th', 'fr', 'sa', 'su'];
  const rangeMatch = spec.toLowerCase().match(/^(\w{2})\s*-\s*(\w{2})$/);
  if (rangeMatch) {
    const si = enShort.indexOf(rangeMatch[1]);
    const ei = enShort.indexOf(rangeMatch[2]);
    if (si >= 0 && ei >= 0) {
      return enShort.slice(si, ei + 1).map((d) => EN_DAY_MAP[d]);
    }
  }
  // Comma-separated: "Mo,We,Fr"
  return spec.split(',').map((d) => normDay(d.trim())).filter(Boolean);
}

/* Group consecutive days with same hours into ranges */
function groupDays(dayHoursMap) {
  const groups = [];
  let currentGroup = null;

  for (const day of DAY_ORDER) {
    const hours = dayHoursMap[day];
    if (!hours) {
      if (currentGroup) {
        groups.push(currentGroup);
        currentGroup = null;
      }
      continue;
    }

    if (currentGroup && currentGroup.hours === hours) {
      currentGroup.days.push(day);
    } else {
      if (currentGroup) groups.push(currentGroup);
      currentGroup = { days: [day], hours };
    }
  }
  if (currentGroup) groups.push(currentGroup);

  return groups;
}

function formatGroup(group) {
  const days = group.days;
  const hours = group.hours;
  const first = DAY_ABBREV[days[0]];
  const last = DAY_ABBREV[days[days.length - 1]];
  const dayStr = days.length === 1 ? first
    : days.length === 7 ? 'Todos os dias'
    : `${first}-${last}`;
  return `${dayStr} ${hours}`;
}

export function normalizeHorarioForPdf(horario, fallback = '-') {
  const raw = String(horario || '').trim();
  if (!raw || raw === '-') return fallback;

  // Pass through simple formats
  if (/^24\s*h/i.test(raw) || raw === '24/7') return '24 horas';

  // Simple time range without days (e.g. "06:00 às 22:00", "7h30 às 19h30", "7h às 19h")
  if (/^\d{1,2}([:.h]\d{2}|h(?!\d))\s*(às|–|-|a)\s*\d{1,2}([:.h]\d{2}|h(?!\d))$/i.test(raw)) {
    return cleanTime(raw);
  }

  const dayHoursMap = {};

  // Try Google weekday_text format: "segunda-feira: 08:00 – 18:00 | terça-feira: ..."
  if (raw.includes('|') && /feira|segunda|terca|terça|quarta|quinta|sexta|sábado|sabado|domingo/i.test(raw)) {
    const entries = raw.split('|').map((s) => s.trim()).filter(Boolean);
    for (const entry of entries) {
      const parsed = parseGoogleDayEntry(entry);
      if (parsed) dayHoursMap[parsed.day] = parsed.hours;
    }
  }

  // Try OSM format: "Mo-Fr 08:00-18:00; Sa 08:00-12:00"
  if (Object.keys(dayHoursMap).length === 0 && /;/.test(raw) && /\b(Mo|Tu|We|Th|Fr|Sa|Su)\b/i.test(raw)) {
    Object.assign(dayHoursMap, parseOsmHours(raw));
  }

  // Try OSM format without semicolons (single rule): "Mo-Fr 08:00-18:00"
  if (Object.keys(dayHoursMap).length === 0 && /\b(Mo|Tu|We|Th|Fr|Sa|Su)\b/i.test(raw)) {
    Object.assign(dayHoursMap, parseOsmHours(raw));
  }

  // Try generic day-time pattern parsing (with multi-line / split-hours support)
  if (Object.keys(dayHoursMap).length === 0) {
    const lines = raw.split(/[|\n]/).map((s) => s.trim()).filter(Boolean);
    let lastDay = null;

    for (const line of lines) {
      // "Segunda a Sexta: 08:00-18:00" range pattern
      const rangeMatch = line.match(/([\wçãáà-]+)\s*(?:a|à|até)\s*([\wçãáà-]+)\s*[:,-]?\s*(.+)/i);
      if (rangeMatch) {
        const startDay = normDay(rangeMatch[1]);
        const endDay = normDay(rangeMatch[2]);
        if (startDay && endDay) {
          const si = DAY_ORDER.indexOf(startDay);
          const ei = DAY_ORDER.indexOf(endDay);
          if (si >= 0 && ei >= 0) {
            const time = cleanTime(rangeMatch[3]);
            for (let i = si; i <= ei; i++) {
              if (!dayHoursMap[DAY_ORDER[i]]) dayHoursMap[DAY_ORDER[i]] = time;
            }
            lastDay = null;
            continue;
          }
        }
      }

      // Try to find a day name in the line
      let foundDay = null;
      let timeStr = '';

      // Handle tab-separated: "quarta-feira\t11:30–15:00"
      const tabParts = line.split(/\t/);
      if (tabParts.length >= 2) {
        const d = normDay(tabParts[0]);
        if (d) {
          foundDay = d;
          timeStr = tabParts.slice(1).join(' ').trim();
        }
      }

      // Fallback: match day name anywhere in the line
      if (!foundDay) {
        const normalizedLine = line.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        for (const [pattern, dayKey] of Object.entries(PT_DAY_MAP)) {
          const normalizedPattern = pattern.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
          if (normalizedLine.includes(normalizedPattern)) {
            foundDay = dayKey;
            timeStr = normalizedLine.replace(normalizedPattern, '').replace(/^[\s:,\-–—\t]+/, '').trim();
            break;
          }
        }
      }

      if (foundDay) {
        lastDay = foundDay;
        if (timeStr && /\d/.test(timeStr)) {
          const time = cleanTime(timeStr);
          dayHoursMap[foundDay] = dayHoursMap[foundDay]
            ? dayHoursMap[foundDay] + ' e ' + time
            : time;
        }
      } else if (lastDay && /\d{1,2}[:.]\d{2}/.test(line)) {
        // Continuation line: time-only line belongs to the previous day
        const time = cleanTime(line);
        dayHoursMap[lastDay] = dayHoursMap[lastDay]
          ? dayHoursMap[lastDay] + ' e ' + time
          : time;
      }
    }
  }

  // If we parsed per-day hours, group and format compactly
  if (Object.keys(dayHoursMap).length > 0) {
    // Check if all days have the same hours
    const uniqueHours = [...new Set(Object.values(dayHoursMap))];
    if (uniqueHours.length === 1 && Object.keys(dayHoursMap).length === 7) {
      const h = uniqueHours[0];
      return /fechado|closed/i.test(h) ? fallback : h;
    }

    const groups = groupDays(dayHoursMap);
    return groups
      .filter((g) => !/fechado|closed/i.test(g.hours))
      .map(formatGroup)
      .join(' · ') || fallback;
  }

  // Return raw (cleaned) if nothing parsed
  return raw.length > 60 ? raw.substring(0, 57) + '...' : raw;
}
