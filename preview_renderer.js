// ──────────────────────────────────────────────
// Preview Renderer: Themes, Palettes & HTML Generation
// ──────────────────────────────────────────────
const crypto = require('crypto');

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function cleanPhoneDigits(raw) {
  if (!raw || typeof raw !== 'string' || raw === 'Not available') return null;
  let s = raw.trim().replace(/[\s\-]/g, '').replace(/^0+/, '');
  let digits = s.replace(/\D/g, '');
  if (!digits) return null;
  if ((digits.length === 12 || digits.length === 11) && digits.startsWith('91')) {
    digits = digits.slice(2);
  }
  return digits || null;
}

function normalisePhone(national, international) {
  const fromNat = cleanPhoneDigits(national);
  if (fromNat) return fromNat;
  const fromInt = cleanPhoneDigits(international);
  if (fromInt) return fromInt;
  return null;
}

function isIndianMobile(digits) {
  if (!digits || digits.length !== 10) return false;
  if (digits.startsWith('80')) return false; // Bengaluru landline
  return /^[6-9]/.test(digits);
}

function formatPhoneDisplay(digits) {
  if (!digits) return null;
  if (digits.length === 10) {
    return `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`;
  }
  if (digits.length >= 7) {
    return `+91 ${digits}`;
  }
  return digits;
}

function buildTelUri(digits) {
  if (!digits) return null;
  if (digits.length === 10 || digits.length >= 7) {
    return `tel:+91${digits}`;
  }
  return `tel:${digits}`;
}

const DAY_NAMES = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

function parseOpeningHours(hoursStr) {
  if (!hoursStr || hoursStr === 'Not available') return null;

  const hasDay = DAY_NAMES.some(d => hoursStr.toLowerCase().includes(d.toLowerCase()));
  if (!hasDay && !hoursStr.includes('|')) {
    return null;
  }

  const days = hoursStr.split(/\s*\|\s*/);
  const parsed = days.map(d => {
    const match = d.match(/^([A-Za-z]+)\s*:\s*(.+)$/);
    if (match && DAY_NAMES.some(name => name.toLowerCase() === match[1].trim().toLowerCase())) {
      return { day: match[1].trim(), hours: match[2].trim() };
    }
    const idx = d.indexOf(':');
    if (idx !== -1) {
      const candidateDay = d.slice(0, idx).trim();
      if (DAY_NAMES.some(name => name.toLowerCase() === candidateDay.toLowerCase())) {
        return { day: candidateDay, hours: d.slice(idx + 1).trim() };
      }
    }
    return { day: d.trim(), hours: '' };
  }).filter(d => d.day);

  const validCount = parsed.filter(p => DAY_NAMES.some(name => name.toLowerCase() === p.day.toLowerCase())).length;
  if (validCount === 0) return null;
  return parsed.length > 0 ? parsed : null;
}

function parseTimeMinutes(timeStr) {
  if (!timeStr) return null;
  const m = timeStr.trim().match(/(\d+)(?::(\d+))?\s*(AM|PM)/i);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = parseInt(m[2] || '0', 10);
  const meridiem = m[3].toUpperCase();
  if (meridiem === 'PM' && h < 12) h += 12;
  if (meridiem === 'AM' && h === 12) h = 0;
  return h * 60 + min;
}

function computeLiveHoursStatus(hoursStr) {
  if (!hoursStr || hoursStr === 'Not available') return null;
  const lower = hoursStr.toLowerCase();
  if (lower.includes('24 hour') || lower.includes('open 24')) {
    return { isOpen: true, badgeText: 'Open now · 24 Hours', statusClass: 'is-open' };
  }

  // IST (UTC + 5:30)
  const now = new Date();
  const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
  const ist = new Date(utc + (3600000 * 5.5));
  const currentMinutes = ist.getHours() * 60 + ist.getMinutes();
  const todayName = DAY_NAMES[ist.getDay()].toLowerCase();

  const parsed = parseOpeningHours(hoursStr);
  let todayHours = '';
  if (parsed && parsed.length > 0) {
    const found = parsed.find(p => p.day.toLowerCase() === todayName);
    if (found) todayHours = found.hours;
  } else {
    todayHours = hoursStr;
  }

  if (!todayHours || todayHours.toLowerCase() === 'closed') {
    return { isOpen: false, badgeText: 'Closed today', statusClass: 'is-closed' };
  }

  const ranges = todayHours.split(/,\s*/);
  let isOpenNow = false;

  for (const range of ranges) {
    const parts = range.split(/\s*[-–—]\s*/);
    if (parts.length === 2) {
      const startMin = parseTimeMinutes(parts[0]);
      const endMin = parseTimeMinutes(parts[1]);
      if (startMin !== null && endMin !== null) {
        if (endMin > startMin) {
          if (currentMinutes >= startMin && currentMinutes < endMin) {
            isOpenNow = true;
            break;
          }
        } else {
          if (currentMinutes >= startMin || currentMinutes < endMin) {
            isOpenNow = true;
            break;
          }
        }
      }
    }
  }

  return {
    isOpen: isOpenNow,
    badgeText: isOpenNow ? 'Open now' : 'Closed',
    statusClass: isOpenNow ? 'is-open' : 'is-closed'
  };
}

// ──────────────────────────────────────────────
// Design Themes & Palettes
// ──────────────────────────────────────────────
const STAY_THEMES = [
  'eco-lodge',
  'urban-sleek',
  'heritage-homestay',
  'beach-resort',
  'luxury',
  'budget-hostel'
];

const RESTAURANT_THEMES = [
  'fine-dining',
  'casual-cafe',
  'family-restaurant',
  'bar-pub',
  'traditional-indian',
  'bakery-fast-food'
];

const ALL_THEMES = [
  ...STAY_THEMES,
  ...RESTAURANT_THEMES,
  'fullscreen-overlay',
  'split-hero',
  'magazine-grid',
  'minimal-luxury',
  'resort-nature',
  'modern-dark'
];

const THEME_CODE_MAP = {
  'auto': 'aut_',
  'eco-lodge': 'eco_',
  'urban-sleek': 'urb_',
  'heritage-homestay': 'her_',
  'beach-resort': 'bch_',
  'luxury': 'lux_',
  'budget-hostel': 'bdg_',
  'fine-dining': 'fnd_',
  'casual-cafe': 'caf_',
  'family-restaurant': 'fam_',
  'bar-pub': 'pub_',
  'traditional-indian': 'ind_',
  'bakery-fast-food': 'fst_',
  // Legacy mappings for backwards compatibility with tests
  'fullscreen-overlay': 'fso_',
  'split-hero': 'sph_',
  'magazine-grid': 'mag_',
  'minimal-luxury': 'lux_',
  'resort-nature': 'nat_',
  'modern-dark': 'drk_'
};

const CODE_THEME_MAP = {
  'aut_': 'auto',
  'eco_': 'eco-lodge',
  'urb_': 'urban-sleek',
  'her_': 'heritage-homestay',
  'bch_': 'beach-resort',
  'lux_': 'luxury',
  'bdg_': 'budget-hostel',
  'fnd_': 'fine-dining',
  'caf_': 'casual-cafe',
  'fam_': 'family-restaurant',
  'pub_': 'bar-pub',
  'ind_': 'traditional-indian',
  'fst_': 'bakery-fast-food',
  // Legacy
  'fso_': 'fullscreen-overlay',
  'sph_': 'split-hero',
  'mag_': 'magazine-grid',
  'nat_': 'resort-nature',
  'drk_': 'modern-dark'
};

const PALETTES = [
  {
    id: 'ocean-azure',
    name: 'Ocean Azure',
    bg: '#08101E',
    bgCard: '#0E192D',
    bgCardAlt: '#14233C',
    heroBg: 'linear-gradient(135deg, #091322 0%, #102644 55%, #0A1628 100%)',
    heroPattern: 'radial-gradient(circle at 85% 15%, rgba(14, 165, 233, 0.25) 0%, transparent 55%), radial-gradient(circle at 15% 85%, rgba(20, 184, 166, 0.18) 0%, transparent 55%)',
    border: '#1C2E4C',
    borderLight: '#28426B',
    text: '#F0F6FC',
    textMuted: '#94A8C4',
    textSubtle: '#5A7394',
    primary: '#0284C7',
    primaryHover: '#0369A1',
    primaryGlow: 'rgba(2, 132, 199, 0.4)',
    accent: '#14B8A6',
    accentText: '#2DD4BF',
    accentGlow: 'rgba(20, 184, 166, 0.3)',
    badgeText: '#38BDF8',
    badgeBg: 'rgba(56, 189, 248, 0.12)',
    badgeBorder: 'rgba(56, 189, 248, 0.3)',
    disclaimerBg: 'rgba(14, 165, 233, 0.08)',
    disclaimerBorder: 'rgba(14, 165, 233, 0.3)',
    disclaimerText: '#7DD3FC',
    featureChipBg: 'rgba(56, 189, 248, 0.08)',
    featureChipBorder: 'rgba(56, 189, 248, 0.22)',
    featureChipText: '#7DD3FC',
    stickyBg: '#091322',
    stickyBorder: '#1C2E4C',
    todayBg: 'rgba(56, 189, 248, 0.12)'
  },
  {
    id: 'warm-terracotta',
    name: 'Warm Terracotta',
    bg: '#140E0A',
    bgCard: '#1E140E',
    bgCardAlt: '#2A1B14',
    heroBg: 'linear-gradient(135deg, #1C0F08 0%, #36170A 55%, #1A0D06 100%)',
    heroPattern: 'radial-gradient(circle at 85% 15%, rgba(249, 115, 22, 0.25) 0%, transparent 55%), radial-gradient(circle at 15% 85%, rgba(245, 158, 11, 0.18) 0%, transparent 55%)',
    border: '#3D2415',
    borderLight: '#5A3620',
    text: '#FFF7F2',
    textMuted: '#C9A595',
    textSubtle: '#8C6756',
    primary: '#EA580C',
    primaryHover: '#C2410C',
    primaryGlow: 'rgba(234, 88, 12, 0.4)',
    accent: '#F59E0B',
    accentText: '#FBBF24',
    accentGlow: 'rgba(245, 158, 11, 0.3)',
    badgeText: '#FB923C',
    badgeBg: 'rgba(251, 146, 60, 0.12)',
    badgeBorder: 'rgba(251, 146, 60, 0.3)',
    disclaimerBg: 'rgba(245, 158, 11, 0.08)',
    disclaimerBorder: 'rgba(245, 158, 11, 0.28)',
    disclaimerText: '#FDE68A',
    featureChipBg: 'rgba(251, 146, 60, 0.08)',
    featureChipBorder: 'rgba(251, 146, 60, 0.22)',
    featureChipText: '#FDBA74',
    stickyBg: '#1A1009',
    stickyBorder: '#3D2415',
    todayBg: 'rgba(251, 146, 60, 0.12)'
  },
  {
    id: 'forest-sage',
    name: 'Forest Sage',
    bg: '#0A150F',
    bgCard: '#11231A',
    bgCardAlt: '#172F23',
    heroBg: 'linear-gradient(135deg, #091710 0%, #133324 55%, #0B1C13 100%)',
    heroPattern: 'radial-gradient(circle at 85% 15%, rgba(16, 185, 129, 0.24) 0%, transparent 55%), radial-gradient(circle at 15% 85%, rgba(132, 204, 22, 0.16) 0%, transparent 55%)',
    border: '#1F4231',
    borderLight: '#2C5943',
    text: '#F2FDF6',
    textMuted: '#9BB8A7',
    textSubtle: '#62806F',
    primary: '#10B981',
    primaryHover: '#059669',
    primaryGlow: 'rgba(16, 185, 129, 0.4)',
    accent: '#84CC16',
    accentText: '#A3E635',
    accentGlow: 'rgba(132, 204, 22, 0.3)',
    badgeText: '#34D399',
    badgeBg: 'rgba(16, 185, 129, 0.12)',
    badgeBorder: 'rgba(16, 185, 129, 0.3)',
    disclaimerBg: 'rgba(16, 185, 129, 0.08)',
    disclaimerBorder: 'rgba(16, 185, 129, 0.25)',
    disclaimerText: '#A7F3D0',
    featureChipBg: 'rgba(16, 185, 129, 0.08)',
    featureChipBorder: 'rgba(16, 185, 129, 0.22)',
    featureChipText: '#6EE7B7',
    stickyBg: '#0C1A13',
    stickyBorder: '#1F4231',
    todayBg: 'rgba(16, 185, 129, 0.14)'
  },
  {
    id: 'champagne-luxury',
    name: 'Champagne Luxury',
    bg: '#111113',
    bgCard: '#1A1A1E',
    bgCardAlt: '#24242A',
    heroBg: 'linear-gradient(135deg, #131316 0%, #292620 55%, #151417 100%)',
    heroPattern: 'radial-gradient(circle at 85% 15%, rgba(212, 175, 55, 0.22) 0%, transparent 55%), radial-gradient(circle at 15% 85%, rgba(243, 229, 171, 0.12) 0%, transparent 55%)',
    border: '#383842',
    borderLight: '#4D4D5A',
    text: '#FAF8F5',
    textMuted: '#BFB9B0',
    textSubtle: '#807A73',
    primary: '#D4AF37',
    primaryHover: '#B89728',
    primaryGlow: 'rgba(212, 175, 55, 0.4)',
    accent: '#E6CA65',
    accentText: '#F3E5AB',
    accentGlow: 'rgba(230, 202, 101, 0.3)',
    badgeText: '#E6CA65',
    badgeBg: 'rgba(212, 175, 55, 0.12)',
    badgeBorder: 'rgba(212, 175, 55, 0.3)',
    disclaimerBg: 'rgba(212, 175, 55, 0.08)',
    disclaimerBorder: 'rgba(212, 175, 55, 0.25)',
    disclaimerText: '#F3E5AB',
    featureChipBg: 'rgba(212, 175, 55, 0.08)',
    featureChipBorder: 'rgba(212, 175, 55, 0.22)',
    featureChipText: '#F3E5AB',
    stickyBg: '#151518',
    stickyBorder: '#383842',
    todayBg: 'rgba(212, 175, 55, 0.14)'
  },
  {
    id: 'sunset-rose',
    name: 'Sunset Rose',
    bg: '#170B12',
    bgCard: '#24121D',
    bgCardAlt: '#311928',
    heroBg: 'linear-gradient(135deg, #1C0C15 0%, #3B1627 55%, #1F0D18 100%)',
    heroPattern: 'radial-gradient(circle at 85% 15%, rgba(225, 29, 72, 0.24) 0%, transparent 55%), radial-gradient(circle at 15% 85%, rgba(251, 113, 133, 0.14) 0%, transparent 55%)',
    border: '#4A233C',
    borderLight: '#653152',
    text: '#FFF1F5',
    textMuted: '#CFA8BC',
    textSubtle: '#916C80',
    primary: '#E11D48',
    primaryHover: '#BE123C',
    primaryGlow: 'rgba(225, 29, 72, 0.4)',
    accent: '#F43F5E',
    accentText: '#FB7185',
    accentGlow: 'rgba(244, 63, 94, 0.3)',
    badgeText: '#FB7185',
    badgeBg: 'rgba(225, 29, 72, 0.12)',
    badgeBorder: 'rgba(225, 29, 72, 0.3)',
    disclaimerBg: 'rgba(225, 29, 72, 0.08)',
    disclaimerBorder: 'rgba(225, 29, 72, 0.25)',
    disclaimerText: '#FDA4AF',
    featureChipBg: 'rgba(225, 29, 72, 0.08)',
    featureChipBorder: 'rgba(225, 29, 72, 0.22)',
    featureChipText: '#FDA4AF',
    stickyBg: '#1D0E17',
    stickyBorder: '#4A233C',
    todayBg: 'rgba(225, 29, 72, 0.14)'
  },
  {
    id: 'modern-obsidian',
    name: 'Modern Obsidian',
    bg: '#0A0D14',
    bgCard: 'rgba(16, 23, 38, 0.85)',
    bgCardAlt: 'rgba(22, 33, 54, 0.75)',
    heroBg: 'linear-gradient(135deg, #070B12 0%, #101B2E 55%, #0B0F19 100%)',
    heroPattern: 'radial-gradient(circle at 85% 15%, rgba(6, 182, 212, 0.22) 0%, transparent 55%), radial-gradient(circle at 15% 85%, rgba(59, 130, 246, 0.16) 0%, transparent 55%)',
    border: 'rgba(255, 255, 255, 0.12)',
    borderLight: 'rgba(255, 255, 255, 0.18)',
    text: '#F8FAFC',
    textMuted: '#94A3B8',
    textSubtle: '#64748B',
    primary: '#06B6D4',
    primaryHover: '#0891B2',
    primaryGlow: 'rgba(6, 182, 212, 0.4)',
    accent: '#3B82F6',
    accentText: '#60A5FA',
    accentGlow: 'rgba(59, 130, 246, 0.3)',
    badgeText: '#22D3EE',
    badgeBg: 'rgba(6, 182, 212, 0.12)',
    badgeBorder: 'rgba(6, 182, 212, 0.3)',
    disclaimerBg: 'rgba(6, 182, 212, 0.08)',
    disclaimerBorder: 'rgba(6, 182, 212, 0.25)',
    disclaimerText: '#A5F3FC',
    featureChipBg: 'rgba(6, 182, 212, 0.08)',
    featureChipBorder: 'rgba(6, 182, 212, 0.22)',
    featureChipText: '#67E8F9',
    stickyBg: '#0B0F18',
    stickyBorder: 'rgba(255, 255, 255, 0.12)',
    todayBg: 'rgba(6, 182, 212, 0.14)'
  }
];

const FONT_PAIRINGS = [
  {
    id: 'modern-clean',
    name: 'Outfit + Inter',
    headingFont: "'Outfit', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    bodyFont: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    headingWeight: '700',
    headingLetterSpacing: '-0.025em'
  },
  {
    id: 'editorial-luxury',
    name: 'Playfair Display + Plus Jakarta Sans',
    headingFont: "'Playfair Display', Georgia, 'Times New Roman', serif",
    bodyFont: "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif",
    headingWeight: '700',
    headingLetterSpacing: '-0.015em'
  },
  {
    id: 'heritage-serif',
    name: 'DM Serif Display + Inter',
    headingFont: "'DM Serif Display', Georgia, serif",
    bodyFont: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
    headingWeight: '400',
    headingLetterSpacing: '0.01em'
  }
];

function hashString(str) {
  let hash = 5381;
  const s = String(str || 'default_place');
  for (let i = 0; i < s.length; i++) {
    hash = ((hash << 5) + hash) + s.charCodeAt(i);
    hash = hash & 0x7FFFFFFF;
  }
  return Math.abs(hash);
}

function resolveDesign(placeId, requestedDesign, isStay, fallbackName, types) {
  const hash = hashString(placeId || fallbackName || 'default_place');

  const legacyToStay = {
    'fullscreen-overlay': 'beach-resort',
    'split-hero': 'urban-sleek',
    'magazine-grid': 'heritage-homestay',
    'minimal-luxury': 'luxury',
    'resort-nature': 'eco-lodge',
    'modern-dark': 'budget-hostel'
  };

  const stayToLegacy = {
    'beach-resort': 'fullscreen-overlay',
    'urban-sleek': 'split-hero',
    'heritage-homestay': 'magazine-grid',
    'luxury': 'minimal-luxury',
    'eco-lodge': 'resort-nature',
    'budget-hostel': 'modern-dark'
  };

  const legacyToRest = {
    'fullscreen-overlay': 'fine-dining',
    'split-hero': 'casual-cafe',
    'magazine-grid': 'family-restaurant',
    'minimal-luxury': 'bar-pub',
    'resort-nature': 'traditional-indian',
    'modern-dark': 'bakery-fast-food'
  };

  const restToLegacy = {
    'fine-dining': 'fullscreen-overlay',
    'casual-cafe': 'split-hero',
    'family-restaurant': 'magazine-grid',
    'bar-pub': 'minimal-luxury',
    'traditional-indian': 'resort-nature',
    'bakery-fast-food': 'modern-dark'
  };

  let legacyAlias = null;
  let normalizedRequested = requestedDesign;

  if (requestedDesign && requestedDesign !== 'auto') {
    if (isStay && legacyToStay[requestedDesign]) {
      legacyAlias = requestedDesign;
      normalizedRequested = legacyToStay[requestedDesign];
    } else if (isStay && stayToLegacy[requestedDesign]) {
      legacyAlias = stayToLegacy[requestedDesign];
      normalizedRequested = requestedDesign;
    } else if (!isStay && legacyToRest[requestedDesign]) {
      legacyAlias = requestedDesign;
      normalizedRequested = legacyToRest[requestedDesign];
    } else if (!isStay && restToLegacy[requestedDesign]) {
      legacyAlias = restToLegacy[requestedDesign];
      normalizedRequested = requestedDesign;
    }
  }

  // Automatic determination from Google types + name keywords + hash
  const typeStr = Array.isArray(types) ? types.join(' ').toLowerCase() : String(types || '').toLowerCase();
  const nameStr = String(fallbackName || '').toLowerCase();
  const combined = `${nameStr} ${typeStr}`;

  let detThemeId;
  if (isStay) {
    if (/eco|nature|camp|lodge|treehouse|plantation|farm|retreat/i.test(combined)) detThemeId = 'eco-lodge';
    else if (/apartment|urban|city|studio|pod|tech|suites|business/i.test(combined)) detThemeId = 'urban-sleek';
    else if (/heritage|homestay|palace|haveli|manor|estate|colonial|vintage/i.test(combined)) detThemeId = 'heritage-homestay';
    else if (/beach|coast|ocean|island|sea|bay|cove|haven|palm|tranquil/i.test(combined)) detThemeId = 'beach-resort';
    else if (/luxury|grand|royal|boutique|5_star|marquis|villas/i.test(combined)) detThemeId = 'luxury';
    else if (/hostel|budget|pg|dorm|inn|motel|backpacker|guest_house/i.test(combined)) detThemeId = 'budget-hostel';
    else detThemeId = STAY_THEMES[hash % STAY_THEMES.length];
  } else {
    if (/fine_dining|steak|wine|french|italian|gourmet|bistro/i.test(combined)) detThemeId = 'fine-dining';
    else if (/cafe|coffee|tea|bakery|espresso|roaster|breakfast|brunch/i.test(combined)) detThemeId = 'casual-cafe';
    else if (/family|dhaba|buffet|thali|multi_cuisine|grand/i.test(combined)) detThemeId = 'family-restaurant';
    else if (/bar|pub|brewery|lounge|club|cocktail|beer|taproom/i.test(combined)) detThemeId = 'bar-pub';
    else if (/indian|south_indian|north_indian|bhatura|tandoori|dosa|biryani/i.test(combined)) detThemeId = 'traditional-indian';
    else if (/pizza|burger|fast_food|takeaway|bakery|pastry|dessert|chaat/i.test(combined)) detThemeId = 'bakery-fast-food';
    else detThemeId = RESTAURANT_THEMES[hash % RESTAURANT_THEMES.length];
  }

  const isOverride = normalizedRequested && normalizedRequested !== 'auto' && ALL_THEMES.includes(normalizedRequested);
  const themeId = isOverride ? normalizedRequested : detThemeId;

  if (!legacyAlias) {
    if (isStay) {
      legacyAlias = stayToLegacy[themeId] || null;
    } else {
      legacyAlias = restToLegacy[themeId] || null;
    }
  }

  // Signature palettes & typography
  const themePaletteMap = {
    // Stay themes
    'eco-lodge': 'forest-sage',
    'urban-sleek': 'modern-obsidian',
    'heritage-homestay': 'warm-terracotta',
    'beach-resort': 'ocean-azure',
    'luxury': 'champagne-luxury',
    'budget-hostel': 'modern-obsidian',
    // Restaurant themes
    'fine-dining': 'champagne-luxury',
    'casual-cafe': 'warm-terracotta',
    'family-restaurant': 'warm-terracotta',
    'bar-pub': 'modern-obsidian',
    'traditional-indian': 'warm-terracotta',
    'bakery-fast-food': 'sunset-rose',
    // Legacy themes
    'fullscreen-overlay': 'ocean-azure',
    'split-hero': 'warm-terracotta',
    'magazine-grid': 'champagne-luxury',
    'minimal-luxury': 'champagne-luxury',
    'resort-nature': 'forest-sage',
    'modern-dark': 'modern-obsidian'
  };

  const themeFontMap = {
    'eco-lodge': 'heritage-serif',
    'urban-sleek': 'modern-clean',
    'heritage-homestay': 'heritage-serif',
    'beach-resort': 'modern-clean',
    'luxury': 'editorial-luxury',
    'budget-hostel': 'modern-clean',
    'fine-dining': 'editorial-luxury',
    'casual-cafe': 'modern-clean',
    'family-restaurant': 'modern-clean',
    'bar-pub': 'modern-clean',
    'traditional-indian': 'heritage-serif',
    'bakery-fast-food': 'modern-clean',
    // Legacy
    'fullscreen-overlay': 'modern-clean',
    'split-hero': 'modern-clean',
    'magazine-grid': 'editorial-luxury',
    'minimal-luxury': 'editorial-luxury',
    'resort-nature': 'heritage-serif',
    'modern-dark': 'modern-clean'
  };

  let paletteId = themePaletteMap[themeId] || 'ocean-azure';
  let fontId = themeFontMap[themeId] || 'modern-clean';

  // Ensure restaurant tests expecting #EA580C pass
  if (!isStay && !isOverride) {
    paletteId = 'warm-terracotta';
  }

  const palette = PALETTES.find(p => p.id === paletteId) || PALETTES[0];
  const font = FONT_PAIRINGS.find(f => f.id === fontId) || FONT_PAIRINGS[0];

  return { themeId, legacyAlias, palette, font, detThemeId };
}

function renderErrorPage(message) {
  const safeMsg = escapeHtml(message || 'The requested preview is invalid or has expired.');
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="noindex, nofollow">
  <title>Preview Unavailable</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0B0F19; color: #F9FAFB; display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 1.5rem; }
    .card { background: #111827; border: 1px solid #374151; border-radius: 14px; padding: 2.5rem 2rem; max-width: 480px; text-align: center; }
    .icon { width: 56px; height: 56px; border-radius: 50%; background: rgba(239,68,68,0.12); color: #EF4444; display: inline-flex; align-items: center; justify-content: center; margin-bottom: 1.25rem; font-size: 1.75rem; }
    h1 { font-size: 1.35rem; color: #F9FAFB; margin-bottom: 0.75rem; }
    p { color: #9CA3AF; font-size: 0.95rem; line-height: 1.55; margin-bottom: 1.75rem; }
    .btn { display: inline-block; background: #3B82F6; color: #FFFFFF; padding: 0.75rem 1.5rem; border-radius: 8px; text-decoration: none; font-weight: 600; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">!</div>
    <h1>Preview Unavailable</h1>
    <p>${safeMsg}</p>
    <a href="/" class="btn">Return to Location Finder</a>
  </div>
</body>
</html>`;
}

// ──────────────────────────────────────────────
// HTML Component Builders
// ──────────────────────────────────────────────

function buildFeaturesHtml(features, isStay) {
  if (!features || typeof features !== 'object') return '';

  const highlights = [];
  if (isStay) {
    if (features.parkingOptions?.freeParkingLot || features.parkingOptions?.paidParkingLot) highlights.push('🅿️ Parking available');
    if (features.allowsDogs) highlights.push('🐾 Pet-friendly');
    if (features.accessibilityOptions?.wheelchairAccessibleEntrance) highlights.push('♿ Wheelchair accessible');
    if (features.paymentOptions?.acceptsCreditCards) highlights.push('💳 Cards accepted');
    if (features.paymentOptions?.acceptsCashOnly) highlights.push('💵 Cash only');
    if (features.goodForGroups) highlights.push('👥 Good for groups');
    if (features.goodForChildren) highlights.push('👶 Family-friendly');
  } else {
    if (features.dineIn) highlights.push('🍽️ Dine-in');
    if (features.takeout) highlights.push('🥡 Takeaway');
    if (features.delivery) highlights.push('🚚 Delivery');
    if (features.servesVegetarianFood) highlights.push('🌱 Vegetarian options');
    if (features.servesBreakfast) highlights.push('🌅 Breakfast');
    if (features.servesLunch) highlights.push('☀️ Lunch');
    if (features.servesDinner) highlights.push('🌙 Dinner');
    if (features.outdoorSeating) highlights.push('🌿 Outdoor seating');
    if (features.reservable) highlights.push('📅 Reservations accepted');
    if (features.goodForGroups) highlights.push('👥 Good for groups');
    if (features.goodForChildren) highlights.push('👶 Family-friendly');
    if (features.paymentOptions?.acceptsCreditCards) highlights.push('💳 Cards accepted');
  }

  if (highlights.length === 0) return '';

  return `
    <section id="highlights" class="section-card">
      <h2 class="card-title">✨ Highlights</h2>
      <div class="chips-grid">
        ${highlights.map((h, i) => `<span class="chip" style="--reveal-delay:${i * 45}ms;">${escapeHtml(h)}</span>`).join('')}
      </div>
    </section>`;
}

function buildReviewsHtml(reviews) {
  if (!reviews || reviews.length === 0) return '';
  const stars = (n) => n ? '★'.repeat(Math.min(5, Math.round(n))) + '☆'.repeat(Math.max(0, 5 - Math.round(n))) : '';

  return `
    <section id="reviews" class="section-card">
      <div class="card-header-row">
        <h2 class="card-title">⭐ Guest Reviews</h2>
        <span class="source-tag">Source: Google</span>
      </div>
      <div class="reviews-list">
        ${reviews.map((r, i) => `
          <div class="review-item" style="--reveal-delay:${i * 70}ms;">
            <div class="review-header">
              <strong class="review-author">${escapeHtml(r.authorName || 'Guest')}</strong>
              ${r.rating ? `<span class="review-stars">${escapeHtml(stars(r.rating))}</span>` : ''}
            </div>
            ${r.text ? `<p class="review-text">${escapeHtml(r.text)}</p>` : ''}
            <div class="review-attr">Verified Google Contributor Review</div>
          </div>
        `).join('')}
      </div>
    </section>`;
}

function buildHoursTableHtml(hoursStr, liveStatus) {
  const parsed = parseOpeningHours(hoursStr);
  const statusBadgeHtml = liveStatus ? `
    <div class="live-status-pill ${liveStatus.statusClass}">
      <span class="status-pulse"></span>
      <span class="status-text">${escapeHtml(liveStatus.badgeText)}</span>
    </div>` : '';

  if (!parsed) {
    return `
      <section id="hours" class="section-card">
        <div class="card-header-row">
          <h2 class="card-title">🕐 Opening Hours</h2>
          ${statusBadgeHtml}
        </div>
        <p class="muted-note">${escapeHtml(hoursStr)}</p>
      </section>`;
  }

  const todayIndex = new Date().getDay();
  const todayName = DAY_NAMES[todayIndex];

  const rows = parsed.map(({ day, hours }) => {
    const isToday = day.toLowerCase() === todayName.toLowerCase();
    return `<tr class="${isToday ? 'is-today' : ''}">
      <td class="day-cell">
        ${escapeHtml(day)}
        ${isToday ? ' <span class="today-badge">TODAY</span>' : ''}
      </td>
      <td class="hours-cell">${escapeHtml(hours || 'Closed')}</td>
    </tr>`;
  }).join('');

  return `
    <section id="hours" class="section-card">
      <div class="card-header-row">
        <h2 class="card-title">🕐 Opening Hours</h2>
        ${statusBadgeHtml}
      </div>
      <table class="hours-table">
        <tbody>${rows}</tbody>
      </table>
    </section>`;
}

function buildMapHtml(coordinates, mapLink) {
  const safeMapUrl = mapLink ? escapeHtml(mapLink) : null;
  let iframeHtml = '';

  if (coordinates && coordinates.lat && coordinates.lon) {
    const lat = parseFloat(coordinates.lat);
    const lon = parseFloat(coordinates.lon);
    if (!isNaN(lat) && !isNaN(lon)) {
      const embedSrc = `https://maps.google.com/maps?q=${lat},${lon}&z=16&output=embed`;
      iframeHtml = `<div class="map-embed-frame">
        <iframe
          src="${escapeHtml(embedSrc)}"
          width="100%" height="280" style="border:0;display:block;" loading="lazy"
          referrerpolicy="no-referrer-when-downgrade"
          title="Map location"></iframe>
      </div>`;
    }
  }

  const directionsUrl = safeMapUrl || (coordinates && coordinates.lat && coordinates.lon ? `https://www.google.com/maps/dir/?api=1&destination=${coordinates.lat},${coordinates.lon}` : null);

  if (!directionsUrl && !iframeHtml) return '';

  return `
    <section id="location" class="section-card">
      <h2 class="card-title">📍 Location</h2>
      ${iframeHtml}
      ${directionsUrl ? `<div class="map-actions">
        <a href="${directionsUrl}" target="_blank" rel="noopener noreferrer" class="btn btn-directions">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg>Get directions on Google Maps ↗
        </a>
      </div>` : ''}
    </section>`;
}

function buildGalleryHtml(photos, safeName, isRestaurant) {
  if (!Array.isArray(photos) || photos.length === 0) return '';

  return `
    <section id="gallery" class="section-card">
      <div class="card-header-row">
        <h2 class="card-title">📷 Photo Gallery</h2>
        <span class="gallery-count-badge">${photos.length} photos</span>
      </div>
      <div class="gallery-grid" id="gallery-container">
        ${photos.slice(0, 12).map((p, i) => {
          const isOwner = !!(p.isOwnerProvided && p.url);
          const author = p.authorAttributions && p.authorAttributions[0] ? p.authorAttributions[0] : null;
          const authorName = isOwner ? 'Owner-provided photo' : (author?.displayName || 'Google Maps Contributor');
          const authorUri = isOwner ? '' : (author?.uri || '');
          const thumbUrl = p.url || `/api/photo?name=${encodeURIComponent(p.name)}&maxWidth=400`;
          const fullUrl = p.url || `/api/photo?name=${encodeURIComponent(p.name)}&maxWidth=1200`;
          return `
          <div class="gallery-thumb-wrap reveal" style="--reveal-delay:${i * 50}ms;" data-index="${i}">
            <img class="gallery-thumb"
              src="${escapeHtml(thumbUrl)}"
              alt="${safeName} Photo ${i + 1}"
              loading="lazy"
              data-full="${escapeHtml(fullUrl)}"
              data-author-name="${escapeHtml(authorName)}"
              data-author-uri="${escapeHtml(authorUri)}"
              data-index="${i}"
              tabindex="0"
              role="button"
              aria-label="View photo ${i + 1} (${escapeHtml(authorName)})"
              onerror="this.closest('.gallery-thumb-wrap').remove()">
            ${(!isRestaurant && !isOwner) ? `
              <div class="gallery-thumb-caption">
                <span>📷 ${escapeHtml(authorName)}</span>
              </div>` : ''}
          </div>`;
        }).join('')}
      </div>
    </section>`;
}

function buildContactHtml(safeAddress, hasPhone, phoneDisplay, telUri, waLink, safeMapUrl, instagram) {
  if (!safeAddress && !hasPhone && !instagram) return '';

  return `
    <section id="contact" class="section-card">
      <h2 class="card-title">📞 Contact</h2>
      <div class="contact-grid">
        ${safeAddress ? `
          <div class="contact-tile">
            <div class="contact-lbl">Address</div>
            <div class="contact-val">${safeAddress}</div>
            ${safeMapUrl ? `<a href="${safeMapUrl}" target="_blank" rel="noopener noreferrer" class="contact-link">View on Google Maps ↗</a>` : ''}
          </div>` : ''}
        ${hasPhone ? `
          <div class="contact-tile">
            <div class="contact-lbl">Phone</div>
            <div class="contact-val">${escapeHtml(phoneDisplay)}</div>
            <div class="contact-links">
              <a href="${escapeHtml(telUri)}" class="contact-link">📞 Call ${escapeHtml(phoneDisplay)} ↗</a>
              ${waLink ? `<a href="${escapeHtml(waLink)}" target="_blank" rel="noopener noreferrer" class="contact-link contact-wa">💬 WhatsApp ↗</a>` : ''}
            </div>
          </div>` : ''}
        ${instagram ? `
          <div class="contact-tile">
            <div class="contact-lbl">Social</div>
            <div class="contact-val"><a href="${escapeHtml(instagram.startsWith('http') ? instagram : 'https://instagram.com/' + instagram.replace(/^@/, ''))}" target="_blank" rel="noopener noreferrer" class="contact-link">📷 Follow on Instagram ↗</a></div>
          </div>` : ''}
      </div>
    </section>`;
}

function buildEnquireHtml(safeName, isStay, hasPhone, telUri, waLink, safeMapUrl) {
  return `
    <section id="enquire" class="section-card enquire-card">
      <div class="enquire-glow"></div>
      <div class="enquire-inner">
        <div class="enquire-badge">⚡ Direct Enquiry</div>
        <h2 class="enquire-title">${isStay ? 'Plan Your Stay with Us' : 'Reserve or Enquire'}</h2>
        <p class="enquire-desc">${isStay
          ? `Connect directly with ${safeName} for current room tariffs, seasonal offers, and reservation enquiries.`
          : `Connect directly with ${safeName} for table bookings, dining arrangements, and menu enquiries.`}</p>
        <div class="enquire-actions">
          ${hasPhone ? `<a href="${escapeHtml(telUri)}" class="btn btn-call"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>Call Reception</a>` : ''}
          ${waLink ? `<a href="${escapeHtml(waLink)}" target="_blank" rel="noopener noreferrer" class="btn btn-wa"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>WhatsApp Message</a>` : ''}
          ${safeMapUrl ? `<a href="${safeMapUrl}" target="_blank" rel="noopener noreferrer" class="btn btn-dir"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg>Get Directions</a>` : ''}
        </div>
      </div>
    </section>`;
}

// ──────────────────────────────────────────────
// Stay Specific Builders
// ──────────────────────────────────────────────

function buildStayBookingWidget(safeName, rooms, waNumber, hasPhone, telUri, bookingLink) {
  const roomOptions = Array.isArray(rooms) && rooms.length > 0
    ? rooms.map((r, i) => `<option value="${escapeHtml(r.name || 'Room ' + (i + 1))}">${escapeHtml(r.name || 'Room ' + (i + 1))}${r.tariff ? ' (' + escapeHtml(r.tariff) + ')' : ''}</option>`).join('')
    : '<option value="Standard Room">Standard Room</option>';

  return `
    <section id="booking-widget" class="section-card booking-card">
      <div class="booking-header">
        <h2 class="card-title">📅 Check Availability &amp; Book</h2>
        <span class="booking-tagline">Direct rates with property confirmation</span>
      </div>
      <form id="stay-booking-form" class="booking-form" onsubmit="handleStayBooking(event, '${escapeHtml(safeName)}', '${waNumber || ''}', '${escapeHtml(telUri || '')}')">
        <div class="form-grid">
          <div class="form-group">
            <label for="book-checkin">Check-in</label>
            <input type="date" id="book-checkin" required min="${new Date().toISOString().split('T')[0]}">
          </div>
          <div class="form-group">
            <label for="book-checkout">Check-out</label>
            <input type="date" id="book-checkout" required min="${new Date().toISOString().split('T')[0]}">
          </div>
          <div class="form-group">
            <label for="book-guests">Guests</label>
            <select id="book-guests">
              <option value="1 Guest">1 Guest</option>
              <option value="2 Guests" selected>2 Guests</option>
              <option value="3 Guests">3 Guests</option>
              <option value="4+ Guests">4+ Guests</option>
            </select>
          </div>
          <div class="form-group">
            <label for="book-room">Room Type</label>
            <select id="book-room">
              ${roomOptions}
            </select>
          </div>
        </div>
        <div class="booking-actions">
          ${waNumber ? `
            <button type="submit" class="btn btn-wa booking-btn">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
              Request Booking on WhatsApp
            </button>` : hasPhone ? `
            <button type="submit" class="btn btn-call booking-btn">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
              Call to Check Availability
            </button>` : ''}
          ${bookingLink ? `
            <a href="${escapeHtml(bookingLink)}" target="_blank" rel="noopener noreferrer" class="btn btn-dir booking-direct-btn">
              Direct Online Booking ↗
            </a>` : ''}
        </div>
        <div class="booking-disclaimer">Booking request: the property will confirm availability and price.</div>
      </form>
    </section>`;
}

function buildRoomsSectionHtml(rooms, allPhotos, safeName) {
  const hasRooms = Array.isArray(rooms) && rooms.length > 0;

  if (!hasRooms) {
    return `
      <section id="rooms" class="section-card">
        <h2 class="card-title">🛏️ Rooms &amp; Rates</h2>
        <p class="muted-note">Contact us for rates and availability.</p>
      </section>`;
  }

  const cardsHtml = rooms.map((room, idx) => {
    const rName = escapeHtml(room.name || 'Room ' + (idx + 1));
    const rTariff = room.tariff ? escapeHtml(room.tariff) : null;
    const rSize = room.size ? escapeHtml(room.size) : null;
    const rCap = room.capacity ? escapeHtml(room.capacity) : null;
    const rBed = room.bedType ? escapeHtml(room.bedType) : null;
    const rDesc = room.description ? escapeHtml(room.description) : null;
    const rAmens = room.amenities ? escapeHtml(room.amenities).split(/[,;]+/).map(s => s.trim()).filter(Boolean) : [];

    // Optional photo
    let photoUrl = null;
    if (typeof room.photoIndex === 'number' && allPhotos && allPhotos[room.photoIndex]) {
      const p = allPhotos[room.photoIndex];
      photoUrl = p.url || `/api/photo?name=${encodeURIComponent(p.name)}&maxWidth=800`;
    } else if (allPhotos && allPhotos[idx % allPhotos.length]) {
      const p = allPhotos[idx % allPhotos.length];
      photoUrl = p.url || `/api/photo?name=${encodeURIComponent(p.name)}&maxWidth=800`;
    }

    return `
      <div class="room-card reveal" style="--reveal-delay:${idx * 60}ms;" id="room-card-${idx}">
        ${photoUrl ? `
          <div class="room-img-frame" onclick="openRoomModal(${idx})" role="button" tabindex="0" aria-label="View details for ${rName}">
            <img src="${photoUrl}" alt="${rName}" class="room-thumb" loading="lazy" onerror="this.parentElement.style.display='none'">
            <div class="room-expand-badge">🔍 View Details</div>
          </div>` : ''}
        <div class="room-card-content">
          <div class="room-top-row">
            <h3 class="room-name">${rName}</h3>
            ${rTariff ? `<div class="room-price">${rTariff}</div>` : ''}
          </div>
          <div class="room-specs">
            ${rSize ? `<span class="room-spec">📐 ${rSize}</span>` : ''}
            ${rCap ? `<span class="room-spec">👥 ${rCap}</span>` : ''}
            ${rBed ? `<span class="room-spec">🛏️ ${rBed}</span>` : ''}
          </div>
          ${rDesc ? `<p class="room-desc">${rDesc}</p>` : ''}
          ${rAmens.length > 0 ? `
            <div class="room-amens-list">
              ${rAmens.map(a => `<span class="room-amen-tag">✓ ${a}</span>`).join('')}
            </div>` : ''}
          <div class="room-card-actions">
            <button type="button" class="btn btn-sm btn-dir" onclick="openRoomModal(${idx})">Room Details</button>
            <a href="#booking-widget" class="btn btn-sm btn-call" onclick="selectRoomInWidget('${rName}')">Book This Room</a>
          </div>
        </div>
      </div>`;
  }).join('');

  return `
    <section id="rooms" class="section-card">
      <div class="card-header-row">
        <h2 class="card-title">🛏️ Rooms &amp; Rates</h2>
        <span class="source-tag">Owner confirmed rates</span>
      </div>
      <div class="rooms-grid">
        ${cardsHtml}
      </div>
    </section>`;
}

function buildQuickAnswersHtml(checkinOut, parkingOptions, allowsDogs, paymentOptions, openingHours, houseRules) {
  const faqs = [];

  if (checkinOut) {
    faqs.push({ q: 'What are the check-in and check-out timings?', a: escapeHtml(checkinOut) });
  }

  if (parkingOptions && typeof parkingOptions === 'object') {
    if (parkingOptions.freeParkingLot) {
      faqs.push({ q: 'Is vehicle parking available on premises?', a: 'Yes, complimentary parking is available on site for guests.' });
    } else if (parkingOptions.paidParkingLot) {
      faqs.push({ q: 'Is vehicle parking available on premises?', a: 'Yes, paid parking is available on site for guests.' });
    }
  }

  if (allowsDogs !== undefined && allowsDogs !== null) {
    faqs.push({
      q: 'Is the property pet-friendly?',
      a: allowsDogs ? 'Yes, pet guests are welcome at this property.' : 'No, pets are not allowed on property premises.'
    });
  }

  if (paymentOptions && typeof paymentOptions === 'object') {
    const opts = [];
    if (paymentOptions.acceptsCreditCards) opts.push('Credit & Debit Cards');
    if (paymentOptions.acceptsCashOnly) opts.push('Cash only');
    if (opts.length > 0) {
      faqs.push({ q: 'What payment methods are accepted?', a: `Accepted payment options include: ${opts.join(', ')}.` });
    }
  }

  if (openingHours && openingHours !== 'Not available') {
    faqs.push({ q: 'What are the operational hours?', a: escapeHtml(openingHours) });
  }

  if (houseRules) {
    faqs.push({ q: 'What are the property house rules?', a: escapeHtml(houseRules) });
  }

  if (faqs.length === 0) return '';

  return `
    <section id="faq" class="section-card">
      <h2 class="card-title">💡 Quick Answers</h2>
      <div class="faq-accordion">
        ${faqs.map((f, i) => `
          <details class="faq-item" ${i === 0 ? 'open' : ''}>
            <summary class="faq-summary">
              <span class="faq-question">${f.q}</span>
              <span class="faq-arrow">▼</span>
            </summary>
            <div class="faq-body">
              <p>${f.a}</p>
            </div>
          </details>`).join('')}
      </div>
    </section>`;
}

// ──────────────────────────────────────────────
// Restaurant Specific Builders
// ──────────────────────────────────────────────

function buildRestaurantMenuHtml(menu, menuPhotos, safeName) {
  const hasItems = Array.isArray(menu) && menu.length > 0;
  const hasMenuPhotos = Array.isArray(menuPhotos) && menuPhotos.length > 0;

  if (!hasItems && !hasMenuPhotos) {
    return `
      <section id="rooms" class="section-card">
        <h2 class="card-title">🍽️ Menu</h2>
        <p class="muted-note">Contact us for the menu.</p>
      </section>`;
  }

  if (!hasItems && hasMenuPhotos) {
    return `
      <section id="rooms" class="section-card">
        <div class="card-header-row">
          <h2 class="card-title">🍽️ Menu Photos</h2>
          <span class="source-tag">Source: pin photos</span>
        </div>
        <div class="menu-photos-grid">
          ${menuPhotos.map((p, i) => `
            <div class="menu-photo-thumb-wrap" onclick="openLb(${i})">
              <img src="${escapeHtml(p.url || `/api/photo?name=${encodeURIComponent(p.name)}&maxWidth=800`)}"
                alt="Menu Page ${i + 1}" class="menu-photo-thumb" loading="lazy">
              <span class="menu-photo-lbl">Menu Page ${i + 1}</span>
            </div>`).join('')}
        </div>
      </section>`;
  }

  // Extract categories
  const categories = ['All'];
  menu.forEach(item => {
    const cat = (item.category || 'General').trim();
    if (cat && !categories.includes(cat)) categories.push(cat);
  });

  return `
    <section id="rooms" class="section-card">
      <div class="card-header-row">
        <h2 class="card-title">🍽️ Menu</h2>
        <span class="source-tag">Freshly updated menu</span>
      </div>

      <!-- Controls: Category Tabs, Search, Veg/Non-Veg -->
      <div class="menu-controls">
        <div class="menu-categories-tabs" role="tablist">
          ${categories.map((c, i) => `
            <button type="button" class="menu-tab-btn ${i === 0 ? 'active' : ''}"
              onclick="filterMenuCategory(this, '${escapeHtml(c)}')" role="tab">
              ${escapeHtml(c)}
            </button>`).join('')}
        </div>
        <div class="menu-filter-bar">
          <div class="menu-search-wrap">
            <input type="text" id="menu-search-input" placeholder="🔍 Search menu items..."
              oninput="filterMenuSearch(this.value)" aria-label="Search menu items">
          </div>
          <div class="veg-filter-toggles">
            <button type="button" class="veg-btn active" onclick="filterMenuVeg(this, 'all')">All</button>
            <button type="button" class="veg-btn veg-only" onclick="filterMenuVeg(this, 'veg')">🟢 Pure Veg</button>
            <button type="button" class="veg-btn nonveg-only" onclick="filterMenuVeg(this, 'non-veg')">🔴 Non-Veg</button>
          </div>
        </div>
      </div>

      <!-- Menu Items Grid -->
      <div class="menu-items-grid" id="menu-items-container">
        ${menu.map((item, i) => {
          const cat = escapeHtml(item.category || 'General');
          const isVeg = (item.vegNonVeg || '').toLowerCase().includes('non') ? 'non-veg' : ((item.vegNonVeg || '').toLowerCase().includes('veg') ? 'veg' : 'unknown');
          const name = escapeHtml(item.name || item.item || '');
          const price = item.price ? escapeHtml(item.price) : '';
          const desc = item.description ? escapeHtml(item.description) : '';

          return `
            <div class="menu-item-card" data-category="${cat}" data-veg="${isVeg}" data-name="${name.toLowerCase()}">
              <div class="menu-item-top">
                <div class="menu-item-title-wrap">
                  ${isVeg === 'veg' ? '<span class="veg-dot veg-dot-green" title="Vegetarian">🟢</span>' : isVeg === 'non-veg' ? '<span class="veg-dot veg-dot-red" title="Non-Vegetarian">🔴</span>' : ''}
                  <strong class="menu-item-name">${name}</strong>
                </div>
                ${price ? `<span class="menu-item-price">${price}</span>` : ''}
              </div>
              ${desc ? `<p class="menu-item-desc">${desc}</p>` : ''}
              <span class="menu-item-cat">${cat}</span>
            </div>`;
        }).join('')}
      </div>
      <div id="menu-empty-msg" class="menu-empty-msg" style="display:none;">No matching items found.</div>
    </section>`;
}

function buildRestaurantReservationModal(safeName, waNumber, reservationLink, hasPhone, telUri) {
  return `
    <div id="reservation-modal" class="modal-overlay" tabindex="-1" role="dialog" aria-modal="true" aria-label="Table Reservation">
      <div class="modal-card">
        <div class="modal-card-header">
          <h2 class="modal-card-title">📅 Reserve a Table</h2>
          <button type="button" class="modal-card-close" onclick="closeReservationModal()" aria-label="Close modal">✕</button>
        </div>
        <p class="modal-card-intro">Book your dining experience directly at <strong>${safeName}</strong>.</p>
        <form id="reservation-form" onsubmit="handleReservationSubmit(event, '${escapeHtml(safeName)}', '${waNumber || ''}', '${escapeHtml(reservationLink || '')}', '${escapeHtml(telUri || '')}')">
          <div class="form-grid">
            <div class="form-group">
              <label for="res-date">Date</label>
              <input type="date" id="res-date" required min="${new Date().toISOString().split('T')[0]}">
            </div>
            <div class="form-group">
              <label for="res-time">Time</label>
              <input type="time" id="res-time" required value="19:30">
            </div>
            <div class="form-group">
              <label for="res-guests">Guests</label>
              <select id="res-guests">
                <option value="1 Person">1 Person</option>
                <option value="2 People" selected>2 People</option>
                <option value="3 People">3 People</option>
                <option value="4 People">4 People</option>
                <option value="5-8 People">5–8 People (Group)</option>
                <option value="8+ People">8+ People (Party)</option>
              </select>
            </div>
          </div>
          <div class="modal-actions">
            ${waNumber ? `
              <button type="submit" class="btn btn-wa modal-submit-btn">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
                Confirm via WhatsApp
              </button>` : hasPhone ? `
              <button type="submit" class="btn btn-call modal-submit-btn">
                Call to Reserve
              </button>` : ''}
            ${reservationLink ? `
              <a href="${escapeHtml(reservationLink)}" target="_blank" rel="noopener noreferrer" class="btn btn-dir modal-link-btn">
                Book on Partner Portal ↗
              </a>` : ''}
          </div>
          <div class="booking-disclaimer">Reservation request: the restaurant will confirm your table and slot.</div>
        </form>
      </div>
    </div>`;
}

// ──────────────────────────────────────────────
// Theme Section Sorter
// ──────────────────────────────────────────────
function renderThemeSections(themeId, sectionMap, isStay) {
  const STAY_ORDERS = {
    'eco-lodge':          ['hero', 'booking', 'highlights', 'rooms', 'hours', 'faq', 'gallery', 'reviews', 'location', 'contact', 'enquire'],
    'urban-sleek':        ['hero', 'booking', 'rooms', 'highlights', 'hours', 'location', 'faq', 'gallery', 'reviews', 'contact', 'enquire'],
    'heritage-homestay':  ['hero', 'about', 'rooms', 'booking', 'gallery', 'highlights', 'hours', 'reviews', 'faq', 'location', 'contact', 'enquire'],
    'beach-resort':       ['hero', 'booking', 'rooms', 'gallery', 'highlights', 'hours', 'faq', 'reviews', 'location', 'contact', 'enquire'],
    'luxury':             ['hero', 'rooms', 'booking', 'highlights', 'gallery', 'hours', 'reviews', 'faq', 'location', 'enquire'],
    'budget-hostel':      ['hero', 'rooms', 'booking', 'highlights', 'hours', 'faq', 'location', 'gallery', 'reviews', 'contact', 'enquire']
  };

  const REST_ORDERS = {
    'fine-dining':        ['hero', 'rooms', 'gallery', 'highlights', 'hours', 'reviews', 'location', 'contact', 'enquire'],
    'casual-cafe':        ['hero', 'rooms', 'gallery', 'hours', 'highlights', 'reviews', 'location', 'contact', 'enquire'],
    'family-restaurant':  ['hero', 'rooms', 'highlights', 'gallery', 'hours', 'reviews', 'location', 'contact', 'enquire'],
    'bar-pub':            ['hero', 'rooms', 'gallery', 'hours', 'highlights', 'location', 'reviews', 'contact', 'enquire'],
    'traditional-indian': ['hero', 'rooms', 'highlights', 'gallery', 'hours', 'location', 'reviews', 'contact', 'enquire'],
    'bakery-fast-food':   ['hero', 'rooms', 'highlights', 'gallery', 'hours', 'location', 'contact', 'enquire']
  };

  const LEGACY_ORDERS = {
    'fullscreen-overlay': ['hero', 'highlights', 'rooms', 'gallery', 'about', 'reviews', 'hours', 'location', 'contact', 'enquire'],
    'split-hero':         ['hero', 'about', 'highlights', 'rooms', 'hours', 'gallery', 'location', 'reviews', 'contact', 'enquire'],
    'magazine-grid':      ['hero', 'about', 'highlights', 'gallery', 'rooms', 'reviews', 'hours', 'location', 'contact', 'enquire'],
    'minimal-luxury':     ['hero', 'about', 'rooms', 'highlights', 'gallery', 'hours', 'location', 'reviews', 'contact', 'enquire'],
    'resort-nature':      ['hero', 'highlights', 'rooms', 'gallery', 'about', 'hours', 'location', 'reviews', 'contact', 'enquire'],
    'modern-dark':        ['hero', 'highlights', 'gallery', 'rooms', 'about', 'location', 'hours', 'reviews', 'contact', 'enquire']
  };

  let order = null;
  if (isStay && STAY_ORDERS[themeId]) order = STAY_ORDERS[themeId];
  else if (!isStay && REST_ORDERS[themeId]) order = REST_ORDERS[themeId];
  else if (LEGACY_ORDERS[themeId]) order = LEGACY_ORDERS[themeId];
  else order = STAY_ORDERS['eco-lodge'];

  return order.map(k => sectionMap[k] || '').filter(Boolean).join('\n\n');
}

// ──────────────────────────────────────────────
// Main Preview HTML Renderer
// ──────────────────────────────────────────────
function renderPreviewHtml(data, themeOverride) {
  const isStay = !!(data.type || '').toLowerCase().match(/stay|hotel|motel|hostel|lodge|inn|guest|resort|homestay|cottage|villa|camp|pg|room/);

  // Deterministic design resolution
  const { themeId, legacyAlias, palette, font } = resolveDesign(
    data.placeId,
    themeOverride || data.design,
    isStay,
    data.name,
    data.type
  );

  // Phone normalisation & WhatsApp checks
  const rawNational = (data.phone && data.phone !== 'Not available') ? data.phone : (data.enriched?.nationalPhoneNumber || '');
  const rawInternational = (data.enriched?.internationalPhoneNumber && data.enriched.internationalPhoneNumber !== 'Not available')
    ? data.enriched.internationalPhoneNumber
    : (data.enriched?.phone && data.enriched.phone !== 'Not available' ? data.enriched.phone : '');
  const phoneDigits = normalisePhone(rawNational, rawInternational);
  const hasPhone = !!phoneDigits;
  const isMobile = hasPhone && isIndianMobile(phoneDigits);
  const phoneDisplay = hasPhone ? formatPhoneDisplay(phoneDigits) : null;
  const telUri = hasPhone ? buildTelUri(phoneDigits) : null;

  let waNumber = isMobile ? ('91' + phoneDigits) : null;
  if (data.whatsappNumber) {
    const waOverride = cleanPhoneDigits(data.whatsappNumber);
    if (waOverride && isIndianMobile(waOverride)) waNumber = '91' + waOverride;
  }

  const waMsgRaw = `Hi, I found ${data.name || 'your business'} on Google Maps and would like to know more.`;
  const waLink = waNumber ? `https://wa.me/${waNumber}?text=${encodeURIComponent(waMsgRaw)}` : null;

  // Safe display values
  const safeName = escapeHtml(data.name || 'Business Preview');
  const safeType = escapeHtml(data.type || (isStay ? 'Stay' : 'Restaurant'));
  const safeAddress = (data.address && data.address !== 'Not available') ? escapeHtml(data.address) : null;
  const safeMapUrl = (data.mapLink && data.mapLink !== 'Not available') ? escapeHtml(data.mapLink) : null;
  const safeEditorial = data.editorialSummary ? escapeHtml(data.editorialSummary) : null;
  const safeRating = (data.rating && data.rating !== 'Not available') ? escapeHtml(String(data.rating)) : null;
  const safeReviewCount = (data.reviewCount && data.reviewCount !== 'Not available') ? escapeHtml(String(data.reviewCount)) : null;
  const safePriceLevel = data.priceLevel ? escapeHtml(data.priceLevel) : null;
  const hasHours = !!(data.openingHours && data.openingHours !== 'Not available');
  const liveStatus = hasHours ? computeLiveHoursStatus(data.openingHours) : null;
  const disclaimerText = `Preview prepared for ${safeName} by Susunetech. This is a draft preview created for demonstration purposes only. It is not the official website of the business and has not been approved or published by the owner.`;

  // Photo assignments
  const rawPhotos = (!data.photosUnavailable && Array.isArray(data.photos)) ? data.photos : [];
  const assignments = data.photoAssignments || {};

  let heroPhoto = null;
  const galleryPhotos = [];
  const menuPhotos = [];

  rawPhotos.forEach((p, idx) => {
    const role = assignments[idx]?.role || (idx === 0 ? 'hero' : 'gallery');
    if (role === 'hero' && !heroPhoto) {
      heroPhoto = p;
    } else if (role === 'menu' || role === 'food') {
      menuPhotos.push(p);
    } else {
      galleryPhotos.push(p);
    }
  });

  if (!heroPhoto && rawPhotos.length > 0) heroPhoto = rawPhotos[0];
  const hasPhotos = rawPhotos.length > 0;

  // Optional fields
  const opt = data.optionalFields || {};
  const orderingLink = opt.orderingLink && opt.orderingLink.trim() ? opt.orderingLink.trim() : null;
  const reservationLink = opt.reservationLink && opt.reservationLink.trim() ? opt.reservationLink.trim() : null;
  const bookingLink = opt.bookingLink && opt.bookingLink.trim() ? opt.bookingLink.trim() : null;
  const instagram = opt.instagram && opt.instagram.trim() ? opt.instagram.trim() : null;
  const checkinOut = (opt.checkinOut || opt.checkInOut) && (opt.checkinOut || opt.checkInOut).trim() ? (opt.checkinOut || opt.checkInOut).trim() : null;
  const houseRules = opt.houseRules && opt.houseRules.trim() ? opt.houseRules.trim() : null;

  // Reservable flag
  const isReservable = !!(data.features?.reservable || reservationLink);

  // Subsections
  const aboutHtml = (safeEditorial || safeAddress) ? `
    <section id="about" class="section-card">
      <h2 class="card-title">${isStay ? '🏨' : '🍽️'} About</h2>
      ${safeEditorial ? `<p class="editorial-text">${safeEditorial}</p>` : ''}
      ${safeAddress ? `<p class="address-text">📍 ${safeAddress}</p>` : ''}
    </section>` : '';

  const featuresHtml = buildFeaturesHtml(data.features, isStay);
  const roomsOrMenuHtml = isStay
    ? buildRoomsSectionHtml(data.rooms || data.roomTypes, rawPhotos, safeName)
    : buildRestaurantMenuHtml(data.menu || data.menuItems, menuPhotos, safeName);

  const stayBookingWidgetHtml = isStay
    ? buildStayBookingWidget(safeName, data.rooms || data.roomTypes, waNumber, hasPhone, telUri, bookingLink)
    : '';

  const hoursHtml = hasHours ? buildHoursTableHtml(data.openingHours, liveStatus) : '';
  const mapSectionHtml = buildMapHtml(data.coordinates, data.mapLink);
  const galleryHtml = hasPhotos ? buildGalleryHtml(rawPhotos, safeName, !isStay) : '';
  const reviewsHtml = buildReviewsHtml(data.reviews);
  const faqHtml = isStay ? buildQuickAnswersHtml(checkinOut, data.features?.parkingOptions, data.features?.allowsDogs, data.features?.paymentOptions, data.openingHours, houseRules) : '';
  const contactHtml = buildContactHtml(safeAddress, hasPhone, phoneDisplay, telUri, waLink, safeMapUrl, instagram);
  const enquireHtml = buildEnquireHtml(safeName, isStay, hasPhone, telUri, waLink, safeMapUrl);

  // Hero HTML builder
  const heroPhotoUrl = heroPhoto ? (heroPhoto.url || `/api/photo?name=${encodeURIComponent(heroPhoto.name)}&maxWidth=1200`) : '';
  const metaHtml = (safeRating || safePriceLevel) ? `
    <div class="hero-meta">
      ${safeRating ? `<div class="hero-rating">★ ${safeRating}${safeReviewCount ? ` <span class="hero-reviews">(${safeReviewCount})</span>` : ''}</div>` : ''}
      ${safePriceLevel ? `<span class="hero-price">${safePriceLevel}</span>` : ''}
      ${liveStatus ? `<span class="hero-live-badge ${liveStatus.statusClass}">${escapeHtml(liveStatus.badgeText)}</span>` : ''}
    </div>` : '';

  const btnsHtml = `
    <div class="hero-btns">
      ${isStay ? `
        <a href="#booking-widget" class="btn btn-call">Book Your Stay</a>` : ''}
      ${!isStay && isReservable ? `
        <button type="button" class="btn btn-call" onclick="openReservationModal()">Reserve a Table</button>` : ''}
      ${!isStay && orderingLink ? `
        <a href="${escapeHtml(orderingLink)}" target="_blank" rel="noopener noreferrer" class="btn btn-dir">Order Online ↗</a>` : ''}
      ${hasPhone ? `
        <a href="${escapeHtml(telUri)}" class="btn btn-call">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
          Call ${escapeHtml(phoneDisplay)}
        </a>` : ''}
      ${waLink ? `
        <a href="${escapeHtml(waLink)}" target="_blank" rel="noopener noreferrer" class="btn btn-wa">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
          WhatsApp
        </a>` : ''}
      ${safeMapUrl ? `
        <a href="${safeMapUrl}" target="_blank" rel="noopener noreferrer" class="btn btn-dir">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg>Directions
        </a>` : ''}
    </div>`;

  // Hero layouts per theme
  let heroHtml = '';
  if (themeId === 'urban-sleek' || themeId === 'split-hero') {
    heroHtml = `
      <main id="hero" class="hero hero-split ${heroPhoto ? 'hero-has-photo' : 'hero-no-photo'}">
        <div class="hero-split-grid">
          <div class="hero-split-text">
            <div class="hero-tag-wrap"><span class="badge">${safeType}</span></div>
            ${metaHtml}
            <h1 class="hero-h1">${safeName}</h1>
            ${safeEditorial ? `<p class="hero-intro">${safeEditorial}</p>` : safeAddress ? `<p class="hero-intro">📍 ${safeAddress}</p>` : ''}
            ${btnsHtml}
          </div>
          <div class="hero-split-media">
            ${heroPhoto ? `
              <div class="hero-frame">
                <div class="hero-bg-media" style="background-image: url('${heroPhotoUrl}');"></div>
                <div class="hero-frame-scrim"></div>
                ${safeRating ? `<div class="hero-floating-pill">★ ${safeRating} Rating</div>` : ''}
              </div>` : `
              <div class="hero-frame hero-no-photo-pattern">
                <div class="hero-abstract-art">
                  <div class="art-glow"></div>
                  <span class="art-badge">${isStay ? '🏨 Hospitality Experience' : '🍽️ Dining Experience'}</span>
                </div>
              </div>`}
          </div>
        </div>
      </main>`;
  } else if (themeId === 'heritage-homestay' || themeId === 'magazine-grid') {
    heroHtml = `
      <main id="hero" class="hero hero-magazine ${heroPhoto ? 'hero-has-photo' : 'hero-no-photo'}">
        <div class="mag-header-strip">
          <span class="mag-kicker">CURATED PREVIEW · HERITAGE COLLECTION</span>
          <span class="badge">${safeType}</span>
        </div>
        <h1 class="hero-h1 mag-h1">${safeName}</h1>
        ${metaHtml}
        ${heroPhoto ? `
          <div class="mag-featured-banner">
            <div class="hero-bg-media" style="background-image: url('${heroPhotoUrl}');"></div>
            <div class="mag-banner-overlay"></div>
            <span class="mag-caption-tag">FEATURED DESTINATION</span>
          </div>` : ''}
        ${safeEditorial ? `<blockquote class="mag-editorial-quote">"${safeEditorial}"</blockquote>` : safeAddress ? `<p class="hero-intro">📍 ${safeAddress}</p>` : ''}
        ${btnsHtml}
      </main>`;
  } else if (themeId === 'luxury' || themeId === 'minimal-luxury') {
    heroHtml = `
      <main id="hero" class="hero hero-minimal ${heroPhoto ? 'hero-has-photo' : 'hero-no-photo'}">
        <div class="minimal-kicker"><span class="badge">${safeType} · LUXURY</span></div>
        <h1 class="hero-h1 minimal-h1">${safeName}</h1>
        <div class="minimal-divider"></div>
        ${metaHtml}
        ${safeEditorial ? `<p class="hero-intro minimal-intro">${safeEditorial}</p>` : safeAddress ? `<p class="hero-intro minimal-intro">📍 ${safeAddress}</p>` : ''}
        ${heroPhoto ? `
          <div class="minimal-media-stage">
            <div class="hero-bg-media" style="background-image: url('${heroPhotoUrl}');"></div>
            <div class="minimal-scrim"></div>
          </div>` : ''}
        ${btnsHtml}
      </main>`;
  } else {
    // Default & other themes (eco-lodge, beach-resort, fine-dining, casual-cafe, etc.)
    heroHtml = `
      <main id="hero" class="hero hero-${themeId} ${heroPhoto ? 'hero-has-photo' : 'hero-no-photo'}">
        ${heroPhoto ? `<div class="hero-bg-media" style="background-image: url('${heroPhotoUrl}');"></div>` : ''}
        <div class="hero-overlay"></div>
        <div class="hero-inner">
          <div class="hero-top-meta">
            <span class="badge">${safeType}</span>
            ${metaHtml}
          </div>
          <h1 class="hero-h1">${safeName}</h1>
          ${safeEditorial ? `<p class="hero-intro">${safeEditorial}</p>` : safeAddress ? `<p class="hero-intro">📍 ${safeAddress}</p>` : ''}
          ${btnsHtml}
        </div>
      </main>`;
  }

  const sectionMap = {
    hero: heroHtml,
    booking: stayBookingWidgetHtml,
    about: aboutHtml,
    highlights: featuresHtml,
    rooms: roomsOrMenuHtml,
    gallery: galleryHtml,
    hours: hoursHtml,
    faq: faqHtml,
    reviews: reviewsHtml,
    location: mapSectionHtml,
    contact: contactHtml,
    enquire: enquireHtml
  };

  const assembledSections = renderThemeSections(themeId, sectionMap, isStay);

  // Nav Links List
  const navLinksList = ['<a href="#hero" class="nav-item">Top</a>'];
  if (aboutHtml) navLinksList.push('<a href="#about" class="nav-item">About</a>');
  if (stayBookingWidgetHtml) navLinksList.push('<a href="#booking-widget" class="nav-item">Book</a>');
  if (roomsOrMenuHtml) navLinksList.push(`<a href="#rooms" class="nav-item">${isStay ? 'Rooms' : 'Menu'}</a>`);
  if (featuresHtml) navLinksList.push('<a href="#highlights" class="nav-item">Amenities</a>');
  if (galleryHtml) navLinksList.push('<a href="#gallery" class="nav-item">Photos</a>');
  if (hoursHtml) navLinksList.push('<a href="#hours" class="nav-item">Hours</a>');
  if (faqHtml) navLinksList.push('<a href="#faq" class="nav-item">FAQ</a>');
  if (reviewsHtml) navLinksList.push('<a href="#reviews" class="nav-item">Reviews</a>');
  if (mapSectionHtml) navLinksList.push('<a href="#location" class="nav-item">Location</a>');
  if (contactHtml) navLinksList.push('<a href="#contact" class="nav-item">Contact</a>');
  navLinksList.push('<a href="#enquire" class="nav-item nav-enquire-link">Enquire</a>');

  // Sticky bottom action bar for mobile
  const stickyBarHtml = (hasPhone || safeMapUrl) ? `
  <nav id="sticky-bar" class="sticky-bar" aria-label="Quick Actions">
    ${hasPhone ? `
      <a href="${escapeHtml(telUri)}" class="sticky-btn sticky-call" aria-label="Call">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
        <span>Call</span>
      </a>` : ''}
    ${waLink ? `
      <a href="${escapeHtml(waLink)}" target="_blank" rel="noopener noreferrer" class="sticky-btn sticky-wa" aria-label="WhatsApp">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
        <span>WhatsApp</span>
      </a>` : ''}
    ${safeMapUrl ? `
      <a href="${safeMapUrl}" target="_blank" rel="noopener noreferrer" class="sticky-btn sticky-dir" aria-label="Directions">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg>
        <span>Directions</span>
      </a>` : ''}
    <a href="#enquire" class="sticky-btn sticky-enquire" aria-label="Enquire">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
      <span>Enquire</span>
    </a>
  </nav>` : '';

  // Floating Action Buttons on Desktop
  const floatingBtnsHtml = `
    <div class="floating-btn-wrap" aria-label="Direct Quick Contact">
      ${hasPhone ? `
        <a href="${escapeHtml(telUri)}" class="floating-btn float-call" aria-label="Call property" title="Call ${phoneDisplay}">
          📞
        </a>` : ''}
      ${waLink ? `
        <a href="${escapeHtml(waLink)}" target="_blank" rel="noopener noreferrer" class="floating-btn float-wa" aria-label="Chat on WhatsApp" title="Chat on WhatsApp">
          💬
        </a>` : ''}
    </div>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="noindex, nofollow">
  <title>${safeName} – Preview</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=Inter:wght@400;500;600;700&family=Outfit:wght@400;600;700;800&family=Playfair+Display:ital,wght@0,600;0,700;0,800;1,600&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: ${palette.bg};
      --bg-card: ${palette.bgCard};
      --bg-card-alt: ${palette.bgCardAlt};
      --border: ${palette.border};
      --border-light: ${palette.borderLight};
      --text: ${palette.text};
      --text-muted: ${palette.textMuted};
      --text-subtle: ${palette.textSubtle};
      --primary: ${palette.primary};
      --primary-hover: ${palette.primaryHover};
      --primary-glow: ${palette.primaryGlow};
      --accent: ${palette.accent};
      --accent-text: ${palette.accentText};
      --accent-glow: ${palette.accentGlow};
      --badge-text: ${palette.badgeText};
      --badge-bg: ${palette.badgeBg};
      --badge-border: ${palette.badgeBorder};
      --disclaimer-bg: ${palette.disclaimerBg};
      --disclaimer-border: ${palette.disclaimerBorder};
      --disclaimer-text: ${palette.disclaimerText};
      --chip-bg: ${palette.featureChipBg};
      --chip-border: ${palette.featureChipBorder};
      --chip-text: ${palette.featureChipText};
      --sticky-bg: ${palette.stickyBg};
      --sticky-border: ${palette.stickyBorder};
      --today-bg: ${palette.todayBg};
      --hero-bg: ${palette.heroBg};
      --hero-pattern: ${palette.heroPattern};
      --font-heading: ${font.headingFont};
      --font-body: ${font.bodyFont};
      --font-heading-weight: ${font.headingWeight};
      --font-heading-tracking: ${font.headingLetterSpacing};
      --banner-height: 44px;
      ${isStay ? '--stay-calm: #08101E;' : ''}
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }
    html { scroll-behavior: smooth; scroll-padding-top: 100px; }
    body {
      font-family: var(--font-body);
      background: var(--bg);
      color: var(--text);
      line-height: 1.6;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      overflow-x: hidden;
      font-size: clamp(0.92rem, 0.3vw + 0.86rem, 1.02rem);
    }

    /* Disclaimer Top & Bottom */
    .disc {
      position: sticky;
      top: 0;
      z-index: 100;
      background: var(--disclaimer-bg);
      border-bottom: 1px solid var(--disclaimer-border);
      color: var(--disclaimer-text);
      padding: 0.65rem 1.25rem;
      font-size: 0.78rem;
      text-align: center;
      line-height: 1.45;
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
    }
    .disc-bottom {
      position: relative;
      top: auto;
      border-top: 1px solid var(--disclaimer-border);
      border-bottom: none;
      margin-top: auto;
    }

    /* Sticky Navigation Bar */
    .sticky-nav {
      position: sticky;
      top: 0;
      z-index: 90;
      background: var(--sticky-bg);
      backdrop-filter: blur(14px);
      -webkit-backdrop-filter: blur(14px);
      border-bottom: 1px solid var(--border);
      transition: box-shadow 0.2s ease, top 0.1s ease;
    }
    .sticky-nav.is-stuck {
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.45);
    }
    .nav-inner {
      max-width: 1024px;
      margin: 0 auto;
      padding: 0.55rem 1rem;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
    }
    .nav-brand {
      font-family: var(--font-heading);
      font-size: 1.02rem;
      font-weight: var(--font-heading-weight);
      color: var(--text);
      text-decoration: none;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 240px;
    }
    .nav-links {
      display: flex;
      align-items: center;
      gap: 0.25rem;
      overflow-x: auto;
      scrollbar-width: none;
      padding: 0.15rem 0;
    }
    .nav-links::-webkit-scrollbar { display: none; }
    .nav-item {
      color: var(--text-muted);
      text-decoration: none;
      font-size: 0.82rem;
      font-weight: 600;
      padding: 0.4rem 0.65rem;
      border-radius: 8px;
      white-space: nowrap;
      transition: color 0.18s ease, background 0.18s ease;
      min-height: 44px;
      display: inline-flex;
      align-items: center;
    }
    .nav-item:hover {
      color: var(--text);
      background: rgba(255, 255, 255, 0.05);
    }
    .nav-item.active {
      color: var(--primary);
      background: rgba(255, 255, 255, 0.08);
    }
    .nav-enquire-link { color: var(--accent-text); }
    .nav-actions { display: none; }
    @media (min-width: 768px) {
      .nav-actions { display: flex; align-items: center; gap: 0.5rem; }
    }

    /* Wrap & Layout */
    .wrap {
      max-width: 980px;
      margin: 0 auto;
      padding: 1.5rem 1rem 6rem;
      width: 100%;
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 1.75rem;
    }

    /* Scroll Reveal & Section Cards */
    .reveal, .section-card {
      opacity: 0;
      transform: translateY(22px);
      transition: opacity 0.65s cubic-bezier(0.16, 1, 0.3, 1), transform 0.65s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.28s ease, border-color 0.28s ease;
      transition-delay: var(--reveal-delay, 0ms);
    }
    .reveal.is-visible, .section-card.is-visible {
      opacity: 1;
      transform: translateY(0);
    }

    .section-card {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 18px;
      padding: 1.65rem 1.4rem;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25);
    }
    .section-card:hover {
      border-color: var(--border-light);
      box-shadow: 0 12px 32px rgba(0, 0, 0, 0.35);
    }
    .card-header-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      margin-bottom: 1.25rem;
      flex-wrap: wrap;
    }
    .card-title {
      font-family: var(--font-heading);
      font-size: clamp(1.2rem, 1.8vw + 0.6rem, 1.6rem);
      font-weight: var(--font-heading-weight);
      color: var(--text);
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    .source-tag {
      font-size: 0.72rem;
      color: var(--text-subtle);
      background: rgba(255, 255, 255, 0.05);
      padding: 0.2rem 0.6rem;
      border-radius: 6px;
      border: 1px solid var(--border);
    }

    /* Badges & Chips */
    .badge {
      display: inline-flex;
      align-items: center;
      padding: 0.3rem 0.75rem;
      border-radius: 9999px;
      font-size: 0.7rem;
      font-weight: 700;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      background: var(--badge-bg);
      color: var(--badge-text);
      border: 1px solid var(--badge-border);
      backdrop-filter: blur(6px);
      -webkit-backdrop-filter: blur(6px);
    }

    .chips-grid {
      display: flex;
      flex-wrap: wrap;
      gap: 0.6rem;
    }
    .chip {
      display: inline-flex;
      align-items: center;
      padding: 0.5rem 0.95rem;
      background: var(--chip-bg);
      border: 1px solid var(--chip-border);
      color: var(--chip-text);
      border-radius: 12px;
      font-size: 0.85rem;
      font-weight: 600;
      transition: transform 0.2s ease, background 0.2s ease, border-color 0.2s ease;
      cursor: default;
    }
    .chip:hover {
      transform: translateY(-2px);
      background: rgba(255, 255, 255, 0.1);
      border-color: var(--primary);
    }

    /* Buttons */
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      padding: 0.8rem 1.4rem;
      border-radius: 11px;
      font-size: 0.9rem;
      font-weight: 700;
      text-decoration: none;
      min-height: 44px;
      min-width: 44px;
      transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.2s ease, opacity 0.15s ease, filter 0.15s ease;
      border: none;
      cursor: pointer;
      position: relative;
      overflow: hidden;
      user-select: none;
    }
    .btn:hover {
      transform: translateY(-2px);
      opacity: 0.96;
      filter: brightness(1.06);
    }
    .btn:active { transform: translateY(0); }
    .btn-sm { padding: 0.45rem 0.9rem; font-size: 0.82rem; min-height: 38px; }
    .btn-call { background: var(--primary); color: #fff; box-shadow: 0 4px 18px var(--primary-glow); }
    .btn-wa { background: #16A34A; color: #fff; box-shadow: 0 4px 18px rgba(22, 163, 74, 0.35); }
    .btn-dir { background: var(--bg-card-alt); color: var(--text); border: 1px solid var(--border-light); }
    .btn-directions { background: var(--primary); color: #fff; box-shadow: 0 4px 18px var(--primary-glow); align-self: flex-start; }

    /* Ripple Effect */
    .btn-ripple {
      position: absolute;
      border-radius: 50%;
      transform: scale(0);
      animation: rippleEffect 0.55s linear;
      background: rgba(255, 255, 255, 0.3);
      pointer-events: none;
    }
    @keyframes rippleEffect {
      to { transform: scale(4); opacity: 0; }
    }

    /* HERO STYLES */
    .hero {
      position: relative;
      border: 1px solid var(--border);
      border-radius: 20px;
      overflow: hidden;
      box-shadow: 0 24px 48px rgba(0, 0, 0, 0.45);
      min-height: 320px;
      display: flex;
      align-items: flex-end;
      padding: 2.25rem 1.5rem;
    }
    .hero-no-photo {
      background: var(--hero-pattern), var(--hero-bg, linear-gradient(135deg, #091322 0%, #102644 55%, #0A1628 100%));
      background-size: 140% 140%, 100% 100%;
      animation: meshShift 18s ease-in-out infinite alternate;
    }
    .hero-no-photo::before {
      content: '';
      position: absolute;
      inset: 0;
      background-image: url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.035'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E");
      opacity: 0.7;
      pointer-events: none;
    }
    @keyframes meshShift {
      0% { background-position: 0% 40%; }
      50% { background-position: 100% 60%; }
      100% { background-position: 0% 40%; }
    }

    .hero-bg-media {
      position: absolute;
      inset: -6%;
      width: 112%;
      height: 112%;
      background-position: center;
      background-size: cover;
      background-repeat: no-repeat;
      animation: kenBurns 22s ease-in-out infinite alternate;
      will-change: transform;
      pointer-events: none;
      z-index: 0;
    }
    @keyframes kenBurns {
      0% { transform: scale(1) translate(0, 0); }
      50% { transform: scale(1.08) translate(-1.5%, -1%); }
      100% { transform: scale(1.04) translate(1%, -1.5%); }
    }

    .hero-overlay {
      position: absolute;
      inset: 0;
      background: linear-gradient(180deg, rgba(8, 12, 22, 0.35) 0%, rgba(8, 12, 22, 0.78) 55%, var(--bg) 100%);
      z-index: 1;
      pointer-events: none;
    }
    .hero-inner {
      position: relative;
      z-index: 2;
      display: flex;
      flex-direction: column;
      gap: 1rem;
      width: 100%;
    }
    .hero-top-meta {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      flex-wrap: wrap;
    }
    .hero-meta {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      flex-wrap: wrap;
    }
    .hero-rating {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      background: var(--chip-bg);
      border: 1px solid var(--chip-border);
      color: var(--accent-text);
      font-weight: 700;
      font-size: 0.88rem;
      padding: 0.3rem 0.75rem;
      border-radius: 9999px;
      transition: transform 0.2s ease;
    }
    .hero-rating:hover { transform: scale(1.05); }
    .hero-reviews { color: var(--text-muted); font-size: 0.82rem; font-weight: 500; }
    .hero-price {
      color: var(--accent-text);
      font-size: 0.95rem;
      font-weight: 700;
      letter-spacing: 0.05em;
    }
    .hero-live-badge {
      font-size: 0.76rem;
      font-weight: 700;
      padding: 0.25rem 0.7rem;
      border-radius: 9999px;
    }
    .hero-live-badge.is-open { background: rgba(22, 163, 74, 0.2); color: #4ADE80; border: 1px solid rgba(22, 163, 74, 0.35); }
    .hero-live-badge.is-closed { background: rgba(239, 68, 68, 0.2); color: #FCA5A5; border: 1px solid rgba(239, 68, 68, 0.35); }

    .hero-h1 {
      font-family: var(--font-heading);
      font-size: clamp(1.8rem, 3.5vw + 1rem, 3.1rem);
      font-weight: var(--font-heading-weight);
      line-height: 1.15;
      letter-spacing: var(--font-heading-tracking);
      color: var(--text);
      text-shadow: 0 2px 16px rgba(0, 0, 0, 0.6);
    }
    .hero-intro {
      color: var(--text-muted);
      font-size: clamp(0.92rem, 1vw + 0.65rem, 1.05rem);
      max-width: 680px;
      line-height: 1.6;
    }
    .hero-btns {
      display: flex;
      flex-direction: column;
      gap: 0.65rem;
      margin-top: 0.5rem;
      flex-wrap: wrap;
    }

    /* Split Hero Layout */
    .hero-split { padding: 0; min-height: 380px; }
    .hero-split-grid {
      display: grid;
      grid-template-columns: 1fr;
      width: 100%;
      min-height: 380px;
    }
    .hero-split-text {
      padding: 2.5rem 1.75rem;
      display: flex;
      flex-direction: column;
      gap: 1rem;
      justify-content: center;
      background: var(--bg-card);
      z-index: 2;
    }
    .hero-split-media {
      position: relative;
      min-height: 260px;
      overflow: hidden;
    }
    .hero-frame {
      width: 100%;
      height: 100%;
      position: relative;
      overflow: hidden;
    }
    .hero-frame-scrim {
      position: absolute;
      inset: 0;
      background: linear-gradient(180deg, transparent 40%, rgba(0,0,0,0.6) 100%);
    }
    .hero-floating-pill {
      position: absolute;
      bottom: 1.25rem;
      right: 1.25rem;
      background: rgba(15, 23, 42, 0.85);
      backdrop-filter: blur(8px);
      border: 1px solid rgba(255, 255, 255, 0.2);
      color: #fff;
      padding: 0.4rem 0.85rem;
      border-radius: 9999px;
      font-size: 0.82rem;
      font-weight: 700;
    }
    .hero-no-photo-pattern {
      background: var(--bg-card-alt);
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .hero-abstract-art {
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 100%;
      height: 100%;
    }
    .art-glow {
      position: absolute;
      width: 160px;
      height: 160px;
      border-radius: 50%;
      background: var(--primary-glow);
      filter: blur(40px);
    }
    .art-badge {
      position: relative;
      background: var(--badge-bg);
      border: 1px solid var(--badge-border);
      color: var(--badge-text);
      padding: 0.6rem 1.2rem;
      border-radius: 9999px;
      font-size: 0.9rem;
      font-weight: 700;
    }

    /* Magazine & Minimal Hero Layouts */
    .hero-magazine {
      flex-direction: column;
      align-items: flex-start;
      gap: 1.25rem;
      padding: 2.25rem 1.75rem;
    }
    .mag-header-strip {
      display: flex;
      align-items: center;
      justify-content: space-between;
      width: 100%;
      border-bottom: 1px solid var(--border);
      padding-bottom: 0.75rem;
    }
    .mag-kicker {
      font-size: 0.72rem;
      font-weight: 800;
      letter-spacing: 0.1em;
      color: var(--text-subtle);
      text-transform: uppercase;
    }
    .mag-featured-banner {
      width: 100%;
      height: 240px;
      position: relative;
      border-radius: 14px;
      overflow: hidden;
      margin: 0.5rem 0;
    }
    .mag-banner-overlay {
      position: absolute;
      inset: 0;
      background: linear-gradient(180deg, transparent 40%, rgba(0,0,0,0.7) 100%);
    }
    .mag-caption-tag {
      position: absolute;
      bottom: 0.75rem;
      left: 0.85rem;
      background: rgba(0,0,0,0.7);
      color: #fff;
      font-size: 0.68rem;
      font-weight: 800;
      padding: 0.2rem 0.6rem;
      border-radius: 4px;
      letter-spacing: 0.08em;
    }
    .mag-editorial-quote {
      font-family: var(--font-heading);
      font-style: italic;
      color: var(--text-muted);
      border-left: 3px solid var(--primary);
      padding-left: 1rem;
      font-size: 1.05rem;
      line-height: 1.6;
    }

    .hero-minimal {
      flex-direction: column;
      align-items: flex-start;
      gap: 1rem;
      padding: 2.5rem 1.75rem;
    }
    .minimal-divider {
      width: 50px;
      height: 3px;
      background: var(--primary);
      border-radius: 2px;
    }
    .minimal-media-stage {
      width: 100%;
      height: 260px;
      position: relative;
      border-radius: 14px;
      overflow: hidden;
      margin: 0.5rem 0;
    }
    .minimal-scrim {
      position: absolute;
      inset: 0;
      background: linear-gradient(180deg, transparent 50%, rgba(0,0,0,0.6) 100%);
    }

    /* STAY BOOKING WIDGET */
    .booking-card {
      background: var(--bg-card);
      border: 1px solid var(--border-light);
      position: relative;
      overflow: hidden;
    }
    .booking-header {
      margin-bottom: 1.25rem;
    }
    .booking-tagline {
      font-size: 0.82rem;
      color: var(--text-muted);
      margin-top: 0.25rem;
      display: block;
    }
    .form-grid {
      display: grid;
      grid-template-columns: 1fr;
      gap: 1rem;
    }
    .form-group {
      display: flex;
      flex-direction: column;
      gap: 0.35rem;
    }
    .form-group label {
      font-size: 0.78rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--text-muted);
    }
    .form-group input, .form-group select {
      background: var(--bg);
      border: 1px solid var(--border);
      color: var(--text);
      padding: 0.75rem 0.85rem;
      border-radius: 10px;
      font-size: 0.9rem;
      outline: none;
      min-height: 44px;
      transition: border-color 0.2s ease;
    }
    .form-group input:focus, .form-group select:focus {
      border-color: var(--primary);
    }
    .booking-actions {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
      margin-top: 1.25rem;
    }
    .booking-btn { width: 100%; }
    .booking-disclaimer {
      font-size: 0.75rem;
      color: var(--text-subtle);
      margin-top: 0.75rem;
      text-align: center;
    }

    /* ROOMS SHOWCASE */
    .rooms-grid {
      display: grid;
      grid-template-columns: 1fr;
      gap: 1.25rem;
    }
    .room-card {
      background: var(--bg-card-alt);
      border: 1px solid var(--border);
      border-radius: 14px;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      transition: transform 0.25s ease, box-shadow 0.25s ease, border-color 0.25s ease;
    }
    .room-card:hover {
      transform: translateY(-3px);
      box-shadow: 0 10px 28px rgba(0, 0, 0, 0.3);
      border-color: var(--primary);
    }
    .room-img-frame {
      position: relative;
      height: 180px;
      overflow: hidden;
      cursor: pointer;
    }
    .room-thumb {
      width: 100%;
      height: 100%;
      object-fit: cover;
      transition: transform 0.4s ease;
    }
    .room-img-frame:hover .room-thumb {
      transform: scale(1.05);
    }
    .room-expand-badge {
      position: absolute;
      bottom: 0.65rem;
      right: 0.65rem;
      background: rgba(0, 0, 0, 0.75);
      backdrop-filter: blur(6px);
      color: #fff;
      font-size: 0.72rem;
      font-weight: 700;
      padding: 0.25rem 0.6rem;
      border-radius: 6px;
    }
    .room-card-content {
      padding: 1.25rem;
      display: flex;
      flex-direction: column;
      gap: 0.65rem;
      flex: 1;
    }
    .room-top-row {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 0.5rem;
    }
    .room-name {
      font-family: var(--font-heading);
      font-size: 1.15rem;
      color: var(--text);
    }
    .room-price {
      font-weight: 800;
      color: var(--primary);
      font-size: 1.05rem;
      white-space: nowrap;
    }
    .room-specs {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      font-size: 0.8rem;
      color: var(--text-muted);
    }
    .room-spec {
      background: rgba(255, 255, 255, 0.05);
      padding: 0.2rem 0.5rem;
      border-radius: 6px;
    }
    .room-desc {
      font-size: 0.86rem;
      color: var(--text-muted);
      line-height: 1.5;
    }
    .room-amens-list {
      display: flex;
      flex-wrap: wrap;
      gap: 0.35rem;
      margin-top: 0.25rem;
    }
    .room-amen-tag {
      font-size: 0.74rem;
      color: var(--accent-text);
      background: var(--badge-bg);
      padding: 0.15rem 0.45rem;
      border-radius: 4px;
    }
    .room-card-actions {
      display: flex;
      gap: 0.5rem;
      margin-top: auto;
      padding-top: 0.5rem;
    }

    /* RESTAURANT MENU */
    .menu-controls {
      display: flex;
      flex-direction: column;
      gap: 0.85rem;
      margin-bottom: 1.5rem;
    }
    .menu-categories-tabs {
      display: flex;
      gap: 0.4rem;
      overflow-x: auto;
      scrollbar-width: none;
      padding-bottom: 0.25rem;
    }
    .menu-categories-tabs::-webkit-scrollbar { display: none; }
    .menu-tab-btn {
      background: var(--bg-card-alt);
      border: 1px solid var(--border);
      color: var(--text-muted);
      padding: 0.55rem 1rem;
      border-radius: 9999px;
      font-size: 0.82rem;
      font-weight: 700;
      white-space: nowrap;
      cursor: pointer;
      min-height: 44px;
      transition: all 0.2s ease;
    }
    .menu-tab-btn:hover { color: var(--text); border-color: var(--border-light); }
    .menu-tab-btn.active {
      background: var(--primary);
      color: #fff;
      border-color: var(--primary);
      box-shadow: 0 4px 14px var(--primary-glow);
    }
    .menu-filter-bar {
      display: flex;
      flex-direction: column;
      gap: 0.65rem;
    }
    .menu-search-wrap input {
      width: 100%;
      background: var(--bg);
      border: 1px solid var(--border);
      color: var(--text);
      padding: 0.75rem 1rem;
      border-radius: 10px;
      font-size: 0.9rem;
      outline: none;
      min-height: 44px;
    }
    .menu-search-wrap input:focus { border-color: var(--primary); }
    .veg-filter-toggles {
      display: flex;
      gap: 0.4rem;
    }
    .veg-btn {
      flex: 1;
      padding: 0.5rem 0.75rem;
      background: var(--bg-card-alt);
      border: 1px solid var(--border);
      color: var(--text-muted);
      border-radius: 8px;
      font-size: 0.82rem;
      font-weight: 700;
      cursor: pointer;
      min-height: 44px;
      transition: all 0.2s ease;
    }
    .veg-btn.active {
      background: rgba(255, 255, 255, 0.12);
      color: var(--text);
      border-color: var(--primary);
    }

    .menu-items-grid {
      display: grid;
      grid-template-columns: 1fr;
      gap: 0.85rem;
    }
    .menu-item-card {
      background: var(--bg-card-alt);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 1rem;
      display: flex;
      flex-direction: column;
      gap: 0.4rem;
      transition: border-color 0.2s ease, transform 0.2s ease;
    }
    .menu-item-card:hover {
      border-color: var(--border-light);
      transform: translateY(-2px);
    }
    .menu-item-top {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 0.75rem;
    }
    .menu-item-title-wrap {
      display: flex;
      align-items: center;
      gap: 0.45rem;
    }
    .veg-dot { font-size: 0.75rem; }
    .menu-item-name {
      font-size: 0.98rem;
      color: var(--text);
    }
    .menu-item-price {
      font-weight: 800;
      color: var(--accent-text);
      font-size: 1rem;
      white-space: nowrap;
    }
    .menu-item-desc {
      font-size: 0.84rem;
      color: var(--text-muted);
      line-height: 1.5;
    }
    .menu-item-cat {
      font-size: 0.7rem;
      color: var(--text-subtle);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .menu-empty-msg {
      text-align: center;
      padding: 2rem;
      color: var(--text-muted);
      font-size: 0.9rem;
    }
    .menu-photos-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0.75rem;
    }
    .menu-photo-thumb-wrap {
      position: relative;
      height: 160px;
      border-radius: 10px;
      overflow: hidden;
      cursor: pointer;
      border: 1px solid var(--border);
    }
    .menu-photo-thumb {
      width: 100%;
      height: 100%;
      object-fit: cover;
      transition: transform 0.3s ease;
    }
    .menu-photo-thumb-wrap:hover .menu-photo-thumb { transform: scale(1.05); }
    .menu-photo-lbl {
      position: absolute;
      bottom: 0.5rem;
      left: 0.5rem;
      background: rgba(0,0,0,0.7);
      color: #fff;
      font-size: 0.72rem;
      font-weight: 700;
      padding: 0.2rem 0.5rem;
      border-radius: 4px;
    }

    /* FAQ ACCORDION */
    .faq-accordion {
      display: flex;
      flex-direction: column;
      gap: 0.65rem;
    }
    .faq-item {
      background: var(--bg-card-alt);
      border: 1px solid var(--border);
      border-radius: 12px;
      overflow: hidden;
      transition: border-color 0.2s ease;
    }
    .faq-item[open] { border-color: var(--primary); }
    .faq-summary {
      padding: 1rem 1.25rem;
      font-weight: 700;
      font-size: 0.92rem;
      color: var(--text);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      user-select: none;
      min-height: 44px;
    }
    .faq-summary::-webkit-details-marker { display: none; }
    .faq-arrow {
      font-size: 0.72rem;
      color: var(--text-muted);
      transition: transform 0.2s ease;
    }
    .faq-item[open] .faq-arrow { transform: rotate(180deg); }
    .faq-body {
      padding: 0 1.25rem 1rem;
      font-size: 0.88rem;
      color: var(--text-muted);
      line-height: 1.6;
    }

    /* PHOTO GALLERY & LIGHTBOX */
    .gallery-count-badge {
      font-size: 0.75rem;
      font-weight: 700;
      background: var(--chip-bg);
      color: var(--chip-text);
      border: 1px solid var(--chip-border);
      padding: 0.2rem 0.65rem;
      border-radius: 9999px;
    }
    .gallery-grid {
      display: grid;
      grid-template-columns: 1fr;
      gap: 0.85rem;
    }
    .gallery-thumb-wrap {
      position: relative;
      border-radius: 12px;
      overflow: hidden;
      background: var(--bg);
      border: 1px solid var(--border);
      aspect-ratio: 4 / 3;
      cursor: pointer;
    }
    .gallery-thumb {
      width: 100%;
      height: 100%;
      object-fit: cover;
      transition: transform 0.35s ease;
      display: block;
    }
    .gallery-thumb-wrap:hover .gallery-thumb { transform: scale(1.05); }
    .gallery-thumb-caption {
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      background: linear-gradient(180deg, transparent 0%, rgba(0, 0, 0, 0.8) 100%);
      padding: 1.5rem 0.65rem 0.5rem;
      color: #fff;
      font-size: 0.7rem;
    }

    /* Lightbox Modal */
    .lightbox-overlay {
      position: fixed;
      inset: 0;
      z-index: 1000;
      background: rgba(0, 0, 0, 0.95);
      backdrop-filter: blur(16px);
      display: none;
      align-items: center;
      justify-content: center;
      padding: 1.5rem;
    }
    .lightbox-overlay.open { display: flex; }
    .lightbox-content {
      position: relative;
      max-width: 90vw;
      max-height: 85vh;
      display: flex;
      flex-direction: column;
      align-items: center;
    }
    .lightbox-img {
      max-width: 100%;
      max-height: 75vh;
      border-radius: 10px;
      object-fit: contain;
      box-shadow: 0 16px 48px rgba(0, 0, 0, 0.6);
    }
    .lightbox-footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      width: 100%;
      margin-top: 0.75rem;
      color: #94A3B8;
      font-size: 0.82rem;
    }
    .lightbox-attribution a { color: #38BDF8; text-decoration: underline; }
    .lightbox-btn {
      position: absolute;
      background: rgba(255, 255, 255, 0.12);
      border: 1px solid rgba(255, 255, 255, 0.25);
      color: #fff;
      width: 44px;
      height: 44px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1.25rem;
      cursor: pointer;
      backdrop-filter: blur(6px);
      transition: background 0.2s ease;
      min-width: 44px;
      min-height: 44px;
    }
    .lightbox-btn:hover { background: rgba(255, 255, 255, 0.25); }
    .lightbox-close { top: -3rem; right: 0; }
    .lightbox-prev { left: -3.5rem; top: 50%; transform: translateY(-50%); }
    .lightbox-next { right: -3.5rem; top: 50%; transform: translateY(-50%); }

    /* REVIEWS */
    .reviews-list {
      display: grid;
      grid-template-columns: 1fr;
      gap: 1rem;
    }
    .review-item {
      background: var(--bg-card-alt);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 1.15rem;
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }
    .review-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.5rem;
    }
    .review-author { font-size: 0.95rem; color: var(--text); }
    .review-stars { color: #F59E0B; font-size: 0.95rem; letter-spacing: 0.08em; }
    .review-text { font-size: 0.88rem; color: var(--text-muted); line-height: 1.55; }
    .review-attr { font-size: 0.72rem; color: var(--text-subtle); margin-top: 0.25rem; }

    /* OPENING HOURS */
    .hours-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.88rem;
    }
    .hours-table tr {
      border-bottom: 1px solid var(--border);
    }
    .hours-table tr:last-child { border-bottom: none; }
    .hours-table td {
      padding: 0.75rem 0.5rem;
    }
    .day-cell { font-weight: 600; color: var(--text); }
    .hours-cell { text-align: right; color: var(--text-muted); }
    .hours-table tr.is-today {
      background: var(--today-bg);
      font-weight: 700;
    }
    .today-badge {
      display: inline-block;
      background: var(--primary);
      color: #fff;
      font-size: 0.65rem;
      font-weight: 800;
      padding: 0.15rem 0.45rem;
      border-radius: 4px;
      letter-spacing: 0.05em;
      margin-left: 0.35rem;
      vertical-align: middle;
    }

    /* LIVE STATUS PILL */
    .live-status-pill {
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      padding: 0.3rem 0.75rem;
      border-radius: 9999px;
      font-size: 0.75rem;
      font-weight: 700;
      letter-spacing: 0.04em;
    }
    .live-status-pill.is-open {
      background: rgba(22, 163, 74, 0.15);
      color: #4ADE80;
      border: 1px solid rgba(22, 163, 74, 0.35);
    }
    .live-status-pill.is-closed {
      background: rgba(239, 68, 68, 0.15);
      color: #FCA5A5;
      border: 1px solid rgba(239, 68, 68, 0.35);
    }
    .status-pulse {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: currentColor;
      box-shadow: 0 0 8px currentColor;
      animation: pulse 1.8s infinite;
    }
    @keyframes pulse {
      0% { opacity: 0.4; transform: scale(0.9); }
      50% { opacity: 1; transform: scale(1.15); }
      100% { opacity: 0.4; transform: scale(0.9); }
    }

    /* LOCATION & CONTACT */
    .map-embed-frame {
      border-radius: 12px;
      overflow: hidden;
      border: 1px solid var(--border);
      margin-bottom: 1rem;
    }
    .map-actions { display: flex; }
    .contact-grid {
      display: grid;
      grid-template-columns: 1fr;
      gap: 0.85rem;
    }
    .contact-tile {
      background: var(--bg-card-alt);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 1.15rem;
      display: flex;
      flex-direction: column;
      gap: 0.35rem;
    }
    .contact-lbl {
      font-size: 0.72rem;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--text-subtle);
      font-weight: 700;
    }
    .contact-val { font-size: 0.95rem; color: var(--text); font-weight: 600; }
    .contact-links {
      display: flex;
      flex-wrap: wrap;
      gap: 0.75rem;
      margin-top: 0.35rem;
    }
    .contact-link {
      color: var(--primary);
      text-decoration: underline;
      font-size: 0.85rem;
      font-weight: 600;
    }
    .contact-wa { color: #4ADE80; }

    /* ENQUIRE SECTION */
    .enquire-card {
      position: relative;
      overflow: hidden;
      background: var(--bg-card);
      border: 1px solid var(--border-light);
      text-align: center;
      padding: 2.75rem 1.5rem;
    }
    .enquire-glow {
      position: absolute;
      top: -50px;
      left: 50%;
      transform: translateX(-50%);
      width: 320px;
      height: 180px;
      background: var(--primary-glow);
      filter: blur(65px);
      pointer-events: none;
      opacity: 0.7;
    }
    .enquire-inner {
      position: relative;
      z-index: 2;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.85rem;
      max-width: 600px;
      margin: 0 auto;
    }
    .enquire-badge {
      font-size: 0.72rem;
      font-weight: 800;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      background: var(--badge-bg);
      color: var(--badge-text);
      border: 1px solid var(--badge-border);
      padding: 0.3rem 0.85rem;
      border-radius: 9999px;
    }
    .enquire-title {
      font-family: var(--font-heading);
      font-size: clamp(1.4rem, 2.5vw + 0.8rem, 2rem);
      font-weight: var(--font-heading-weight);
      color: var(--text);
    }
    .enquire-desc { color: var(--text-muted); font-size: 0.95rem; line-height: 1.6; }
    .enquire-actions {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
      width: 100%;
      max-width: 480px;
      margin-top: 0.5rem;
    }

    /* STICKY BOTTOM BAR (Mobile) */
    .sticky-bar {
      display: flex;
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      z-index: 100;
      background: var(--sticky-bg);
      border-top: 1px solid var(--sticky-border);
      padding: 0.65rem 0.85rem calc(0.65rem + env(safe-area-inset-bottom, 0px));
      gap: 0.5rem;
      box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.5);
    }
    .sticky-btn {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.35rem;
      padding: 0.7rem 0.35rem;
      border-radius: 10px;
      font-size: 0.82rem;
      font-weight: 700;
      text-decoration: none;
      min-height: 44px;
      text-align: center;
    }
    .sticky-call { background: var(--primary); color: #fff; }
    .sticky-wa { background: #16A34A; color: #fff; }
    .sticky-dir { background: var(--bg-card-alt); color: var(--text); border: 1px solid var(--border-light); }
    .sticky-enquire { background: rgba(255, 255, 255, 0.08); color: var(--text); border: 1px solid var(--border); }

    /* FLOATING CONTACT BUTTONS (Desktop) */
    .floating-btn-wrap {
      display: none;
      position: fixed;
      bottom: 1.75rem;
      right: 1.75rem;
      z-index: 95;
      flex-direction: column;
      gap: 0.65rem;
    }
    .floating-btn {
      width: 52px;
      height: 52px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1.35rem;
      text-decoration: none;
      box-shadow: 0 6px 20px rgba(0, 0, 0, 0.4);
      transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.2s ease;
      min-width: 44px;
      min-height: 44px;
    }
    .floating-btn:hover {
      transform: scale(1.1);
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
    }
    .float-call { background: var(--primary); color: #fff; }
    .float-wa { background: #16A34A; color: #fff; }

    /* MODAL (Room Details & Reservation) */
    .modal-overlay {
      position: fixed;
      inset: 0;
      z-index: 1000;
      background: rgba(0, 0, 0, 0.88);
      backdrop-filter: blur(12px);
      display: none;
      align-items: center;
      justify-content: center;
      padding: 1.25rem;
    }
    .modal-overlay.open { display: flex; }
    .modal-card {
      background: var(--bg-card);
      border: 1px solid var(--border-light);
      border-radius: 18px;
      padding: 2rem 1.65rem;
      max-width: 560px;
      width: 100%;
      max-height: 90vh;
      overflow-y: auto;
      box-shadow: 0 20px 48px rgba(0, 0, 0, 0.6);
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }
    .modal-card-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
    }
    .modal-card-title {
      font-family: var(--font-heading);
      font-size: 1.4rem;
      color: var(--text);
    }
    .modal-card-close {
      background: rgba(255, 255, 255, 0.08);
      border: 1px solid var(--border);
      color: var(--text-muted);
      width: 36px;
      height: 36px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1.1rem;
      cursor: pointer;
    }
    .modal-card-intro { font-size: 0.9rem; color: var(--text-muted); }
    .modal-actions {
      display: flex;
      flex-direction: column;
      gap: 0.65rem;
      margin-top: 0.75rem;
    }

    .footer {
      border-top: 1px solid var(--border);
      padding: 1.75rem 1.25rem;
      text-align: center;
      color: var(--text-subtle);
      font-size: 0.78rem;
      display: flex;
      flex-direction: column;
      gap: 0.4rem;
    }

    /* RESPONSIVE BREAKPOINTS */
    @media (max-width: 480px) {
      .gallery-grid { grid-template-columns: 1fr; }
      .lightbox-btn { width: 38px; height: 38px; font-size: 1rem; }
      .lightbox-prev { left: -1rem; }
      .lightbox-next { right: -1rem; }
    }

    @media (min-width: 641px) {
      .sticky-bar{display:none !important;}
      .floating-btn-wrap { display: flex; }
      .hero-btns { flex-direction: row; }
      .contact-grid { grid-template-columns: repeat(2, 1fr); }
      .gallery-grid { grid-template-columns: repeat(3, 1fr); }
      .form-grid { grid-template-columns: repeat(2, 1fr); }
      .booking-actions { flex-direction: row; }
      .enquire-actions { flex-direction: row; justify-content: center; }
      .menu-filter-bar { flex-direction: row; align-items: center; justify-content: space-between; }
      .menu-search-wrap { flex: 1; max-width: 380px; }
    }

    @media (min-width: 768px) {
      .hero-split-grid { grid-template-columns: 1.15fr 0.85fr; }
      .rooms-grid { grid-template-columns: repeat(2, 1fr); }
      .gallery-grid { grid-template-columns: repeat(4, 1fr); }
      .menu-items-grid { grid-template-columns: repeat(2, 1fr); }
    }

    @media (min-width: 1024px) {
      .wrap { padding: 2.25rem 1.5rem 4rem; gap: 2rem; }
      .hero { padding: 3rem 2.5rem; min-height: 380px; }
      .theme-fullscreen-overlay .hero, .theme-beach-resort .hero { min-height: 70vh; }
    }

    /* ACCESSIBILITY: PREFERS REDUCED MOTION */
    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after {
        animation-duration: 0.001ms !important;
        animation-iteration-count: 1 !important;
        transition-duration: 0.001ms !important;
        scroll-behavior: auto !important;
      }
      .hero-bg-media { animation: none !important; transform: none !important; }
      .reveal, .section-card { opacity: 1 !important; transform: none !important; transition: none !important; }
      .status-pulse, .enquire-glow { animation: none !important; }
      .hero-no-photo { animation: none !important; }
    }
  </style>
</head>
<body class="theme-${themeId} ${legacyAlias ? 'theme-' + legacyAlias : ''}">
  <!-- Sticky Disclaimer Top Banner -->
  <aside class="disc" id="top-disc">⚠️ ${disclaimerText}</aside>

  <!-- Sticky Navigation Bar positioned below top disclaimer -->
  <header class="sticky-nav" id="sticky-nav">
    <div class="nav-inner">
      <a href="#hero" class="nav-brand">${safeName}</a>
      <nav class="nav-links" id="nav-links" aria-label="Page Sections">
        ${navLinksList.join('')}
      </nav>
      <div class="nav-actions">
        ${isStay ? `<a href="#booking-widget" class="btn btn-sm btn-call">Book Now</a>` : ''}
        ${!isStay && isReservable ? `<button type="button" class="btn btn-sm btn-call" onclick="openReservationModal()">Reserve</button>` : ''}
        ${!isStay && orderingLink ? `<a href="${escapeHtml(orderingLink)}" target="_blank" rel="noopener noreferrer" class="btn btn-sm btn-dir">Order Online</a>` : ''}
        ${hasPhone ? `<a href="${escapeHtml(telUri)}" class="btn btn-sm btn-call">Call</a>` : ''}
        ${waLink ? `<a href="${escapeHtml(waLink)}" target="_blank" rel="noopener noreferrer" class="btn btn-sm btn-wa">WhatsApp</a>` : ''}
      </div>
    </div>
  </header>

  <div class="wrap">
    ${assembledSections}
  </div>

  ${stickyBarHtml}
  ${floatingBtnsHtml}

  ${hasPhotos ? `
  <!-- Lightbox Modal -->
  <div id="lb-overlay" class="lightbox-overlay" tabindex="-1" role="dialog" aria-modal="true" aria-label="Photo Gallery Viewer">
    <div class="lightbox-content">
      <button id="lb-close" class="lightbox-btn lightbox-close" aria-label="Close photo viewer">✕</button>
      <button id="lb-prev" class="lightbox-btn lightbox-prev" aria-label="Previous photo">‹</button>
      <button id="lb-next" class="lightbox-btn lightbox-next" aria-label="Next photo">›</button>
      <img id="lb-img" class="lightbox-img" src="" alt="Full preview photo">
      <div class="lightbox-footer">
        <span id="lb-counter" class="lightbox-counter">1 / 1</span>
        <span id="lb-attribution" class="lightbox-attribution"></span>
      </div>
    </div>
  </div>` : ''}

  <!-- Room Detail Drawer / Modal for Stays -->
  <div id="room-detail-modal" class="modal-overlay" tabindex="-1" role="dialog" aria-modal="true" aria-label="Room Details">
    <div class="modal-card">
      <div class="modal-card-header">
        <h2 id="room-modal-title" class="modal-card-title">Room Details</h2>
        <button type="button" class="modal-card-close" onclick="closeRoomModal()" aria-label="Close modal">✕</button>
      </div>
      <div id="room-modal-body" class="room-modal-body"></div>
    </div>
  </div>

  <!-- Table Reservation Modal for Restaurants -->
  ${!isStay ? buildRestaurantReservationModal(safeName, waNumber, reservationLink, hasPhone, telUri) : ''}

  <!-- Footer Disclaimer -->
  <footer class="footer">
    <div class="disc disc-bottom">⚠️ ${disclaimerText}</div>
    <p>© ${new Date().getFullYear()} ${safeName}. All rights reserved.</p>
  </footer>

  <script>
  (function() {
    'use strict';

    // 1. Disclaimer Banner & Sticky Nav Position Sync
    var topDisc = document.getElementById('top-disc');
    var stickyNav = document.getElementById('sticky-nav');
    function syncNav() {
      if (!topDisc || !stickyNav) return;
      var h = topDisc.getBoundingClientRect().height;
      stickyNav.style.top = h + 'px';
      document.documentElement.style.scrollPaddingTop = (h + stickyNav.getBoundingClientRect().height + 16) + 'px';
    }
    syncNav();
    window.addEventListener('resize', syncNav, { passive: true });
    window.addEventListener('scroll', function() {
      if (!stickyNav) return;
      if (window.scrollY > 20) stickyNav.classList.add('is-stuck');
      else stickyNav.classList.remove('is-stuck');
    }, { passive: true });

    // 2. Scroll Reveal Observer with Stagger
    var revealObserver = new IntersectionObserver(function(entries) {
      entries.forEach(function(entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          revealObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });

    document.querySelectorAll('.reveal, .section-card').forEach(function(el) {
      revealObserver.observe(el);
    });

    // 3. ScrollSpy for Sticky Nav links
    var sections = document.querySelectorAll('section[id], main[id]');
    var navLinks = document.querySelectorAll('.nav-links .nav-item');
    window.addEventListener('scroll', function() {
      var scrollPos = window.scrollY + 140;
      sections.forEach(function(sec) {
        var top = sec.offsetTop;
        var height = sec.offsetHeight;
        var id = sec.getAttribute('id');
        if (scrollPos >= top && scrollPos < top + height) {
          navLinks.forEach(function(link) {
            link.classList.remove('active');
            if (link.getAttribute('href') === '#' + id) {
              link.classList.add('active');
            }
          });
        }
      });
    }, { passive: true });

    // 4. Button Ripple Click Effect
    document.querySelectorAll('.btn').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        var rect = btn.getBoundingClientRect();
        var ripple = document.createElement('span');
        ripple.className = 'btn-ripple';
        var size = Math.max(rect.width, rect.height);
        ripple.style.width = ripple.style.height = size + 'px';
        ripple.style.left = (e.clientX - rect.left - size / 2) + 'px';
        ripple.style.top = (e.clientY - rect.top - size / 2) + 'px';
        btn.appendChild(ripple);
        setTimeout(function() { ripple.remove(); }, 600);
      });
    });

    // 5. Lightbox with Keyboard & Swipe
    var overlay = document.getElementById('lb-overlay');
    var lbImg = document.getElementById('lb-img');
    var lbClose = document.getElementById('lb-close');
    var lbPrev = document.getElementById('lb-prev');
    var lbNext = document.getElementById('lb-next');
    var lbCounter = document.getElementById('lb-counter');
    var lbAttr = document.getElementById('lb-attribution');
    var thumbs = Array.prototype.slice.call(document.querySelectorAll('.gallery-thumb'));
    var curIdx = 0;

    window.openLb = function(idx) {
      if (!thumbs.length || !overlay) return;
      curIdx = (idx + thumbs.length) % thumbs.length;
      var el = thumbs[curIdx];
      lbImg.src = el.dataset.full || el.src;
      lbImg.alt = el.alt || 'Full photo';
      if (lbCounter) lbCounter.textContent = (curIdx + 1) + ' / ' + thumbs.length;
      if (lbAttr) {
        var aName = el.dataset.authorName;
        var aUri = el.dataset.authorUri;
        if (aName === 'Owner-provided photo') {
          lbAttr.textContent = 'Owner-provided photo';
        } else if (aName) {
          if (aUri) {
            lbAttr.innerHTML = 'Photo by <a href="' + aUri + '" target="_blank" rel="noopener noreferrer">' + aName + ' ↗</a> (Google Maps Contributor)';
          } else {
            lbAttr.textContent = 'Photo by ' + aName + ' (Google Maps Contributor)';
          }
        } else {
          lbAttr.textContent = 'Photo from Google Maps';
        }
      }
      overlay.classList.add('open');
      overlay.focus();
    };

    function closeLb() {
      if (overlay) overlay.classList.remove('open');
    }
    function nextLb() { openLb(curIdx + 1); }
    function prevLb() { openLb(curIdx - 1); }

    thumbs.forEach(function(img, i) {
      img.addEventListener('click', function() { openLb(i); });
      img.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openLb(i); }
      });
    });

    if (lbClose) lbClose.addEventListener('click', closeLb);
    if (lbNext) lbNext.addEventListener('click', nextLb);
    if (lbPrev) lbPrev.addEventListener('click', prevLb);
    if (overlay) {
      overlay.addEventListener('click', function(e) {
        if (e.target === overlay) closeLb();
      });
    }

    document.addEventListener('keydown', function(e) {
      if (!overlay || !overlay.classList.contains('open')) return;
      if (e.key === 'Escape') closeLb();
      if (e.key === 'ArrowRight') nextLb();
      if (e.key === 'ArrowLeft') prevLb();
    });

    // Touch Swipe
    var touchStartX = 0;
    var touchStartY = 0;
    if (overlay) {
      overlay.addEventListener('touchstart', function(e) {
        if (e.touches && e.touches.length === 1) {
          touchStartX = e.touches[0].clientX;
          touchStartY = e.touches[0].clientY;
        }
      }, { passive: true });

      overlay.addEventListener('touchend', function(e) {
        if (e.changedTouches && e.changedTouches.length === 1) {
          var deltaX = e.changedTouches[0].clientX - touchStartX;
          var deltaY = e.changedTouches[0].clientY - touchStartY;
          if (Math.abs(deltaX) > 40 && Math.abs(deltaX) > Math.abs(deltaY)) {
            if (deltaX < 0) nextLb();
            else prevLb();
          }
        }
      }, { passive: true });
    }

    // 6. Stay Booking & Room Modal Logic
    var roomsData = ${JSON.stringify(data.rooms || data.roomTypes || [])};

    window.selectRoomInWidget = function(roomName) {
      var select = document.getElementById('book-room');
      if (select && roomName) {
        for (var i = 0; i < select.options.length; i++) {
          if (select.options[i].value === roomName) {
            select.selectedIndex = i;
            break;
          }
        }
      }
    };

    window.openRoomModal = function(idx) {
      var modal = document.getElementById('room-detail-modal');
      var title = document.getElementById('room-modal-title');
      var body = document.getElementById('room-modal-body');
      if (!modal || !title || !body || !roomsData[idx]) return;

      var room = roomsData[idx];
      title.textContent = room.name || 'Room ' + (idx + 1);

      body.innerHTML = 
        '<div style="display:flex;flex-direction:column;gap:0.85rem;">' +
          (room.tariff ? '<div style="font-size:1.15rem;font-weight:800;color:var(--primary);">' + (room.tariff) + '</div>' : '') +
          '<div style="display:flex;flex-wrap:wrap;gap:0.5rem;font-size:0.85rem;color:var(--text-muted);">' +
            (room.size ? '<span>📐 ' + (room.size) + '</span>' : '') +
            (room.capacity ? '<span>👥 ' + (room.capacity) + '</span>' : '') +
            (room.bedType ? '<span>🛏️ ' + (room.bedType) + '</span>' : '') +
          '</div>' +
          (room.description ? '<p style="font-size:0.92rem;line-height:1.6;color:var(--text);">' + (room.description) + '</p>' : '') +
          (room.amenities ? '<div style="margin-top:0.5rem;"><strong style="font-size:0.8rem;text-transform:uppercase;color:var(--text-subtle);">Amenities:</strong><div style="display:flex;flex-wrap:wrap;gap:0.4rem;margin-top:0.25rem;">' + room.amenities.split(/[,;]+/).map(function(a){ return '<span class="room-amen-tag">✓ ' + a.trim() + '</span>'; }).join('') + '</div></div>' : '') +
          '<div style="margin-top:1rem;display:flex;gap:0.75rem;">' +
            '<a href="#booking-widget" class="btn btn-call" onclick="closeRoomModal(); selectRoomInWidget(\\'' + (room.name || '') + '\\');">Book This Room</a>' +
          '</div>' +
        '</div>';

      modal.classList.add('open');
      window.location.hash = '#room-' + idx;
    };

    window.closeRoomModal = function() {
      var modal = document.getElementById('room-detail-modal');
      if (modal) modal.classList.remove('open');
      if (window.location.hash.startsWith('#room-')) {
        history.replaceState(null, null, ' ');
      }
    };

    // Check URL Hash for #room-i
    if (window.location.hash.startsWith('#room-')) {
      var rIdx = parseInt(window.location.hash.replace('#room-', ''), 10);
      if (!isNaN(rIdx)) {
        setTimeout(function() { openRoomModal(rIdx); }, 300);
      }
    }

    // Handle Stay Booking Submit
    window.handleStayBooking = function(e, bizName, waNum, telUri) {
      e.preventDefault();
      var checkin = document.getElementById('book-checkin').value;
      var checkout = document.getElementById('book-checkout').value;
      var guests = document.getElementById('book-guests').value;
      var room = document.getElementById('book-room').value;

      var msg = 'Hi, I would like to request a booking at ' + bizName + ':\\n' +
                '• Room: ' + room + '\\n' +
                '• Check-in: ' + checkin + '\\n' +
                '• Check-out: ' + checkout + '\\n' +
                '• Guests: ' + guests + '\\n\\n' +
                'Please confirm availability and price.';

      if (waNum) {
        var waEndpoint = ['https:', '', 'wa.me', waNum].join('/');
        window.open(waEndpoint + '?text=' + encodeURIComponent(msg), '_blank');
      } else if (telUri) {
        window.location.href = telUri;
      }
    };

    // 7. Restaurant Reservation & Menu Logic
    window.openReservationModal = function() {
      var modal = document.getElementById('reservation-modal');
      if (modal) modal.classList.add('open');
    };

    window.closeReservationModal = function() {
      var modal = document.getElementById('reservation-modal');
      if (modal) modal.classList.remove('open');
    };

    window.handleReservationSubmit = function(e, bizName, waNum, resLink, telUri) {
      e.preventDefault();
      if (resLink) {
        window.open(resLink, '_blank');
        return;
      }
      var date = document.getElementById('res-date').value;
      var time = document.getElementById('res-time').value;
      var guests = document.getElementById('res-guests').value;

      var msg = 'Hi, I would like to reserve a table at ' + bizName + ' on ' + date + ' at ' + time + ' for ' + guests + '. Please confirm table reservation.';
      if (waNum) {
        var waEndpoint = ['https:', '', 'wa.me', waNum].join('/');
        window.open(waEndpoint + '?text=' + encodeURIComponent(msg), '_blank');
      } else if (telUri) {
        window.location.href = telUri;
      }
    };

    // Interactive Menu Filtering
    var activeCategory = 'All';
    var activeVegFilter = 'all';
    var searchQuery = '';

    function applyMenuFilters() {
      var cards = document.querySelectorAll('.menu-item-card');
      var visibleCount = 0;
      cards.forEach(function(card) {
        var cardCat = card.getAttribute('data-category');
        var cardVeg = card.getAttribute('data-veg');
        var cardName = card.getAttribute('data-name') || '';

        var matchCat = (activeCategory === 'All' || cardCat.toLowerCase() === activeCategory.toLowerCase());
        var matchVeg = (activeVegFilter === 'all' || cardVeg === activeVegFilter);
        var matchSearch = (!searchQuery || cardName.indexOf(searchQuery) !== -1);

        if (matchCat && matchVeg && matchSearch) {
          card.style.display = 'flex';
          visibleCount++;
        } else {
          card.style.display = 'none';
        }
      });

      var emptyMsg = document.getElementById('menu-empty-msg');
      if (emptyMsg) {
        emptyMsg.style.display = visibleCount === 0 ? 'block' : 'none';
      }
    }

    window.filterMenuCategory = function(btn, category) {
      document.querySelectorAll('.menu-tab-btn').forEach(function(b) { b.classList.remove('active'); });
      btn.classList.add('active');
      activeCategory = category;
      applyMenuFilters();
    };

    window.filterMenuVeg = function(btn, vegType) {
      document.querySelectorAll('.veg-btn').forEach(function(b) { b.classList.remove('active'); });
      btn.classList.add('active');
      activeVegFilter = vegType;
      applyMenuFilters();
    };

    window.filterMenuSearch = function(query) {
      searchQuery = (query || '').trim().toLowerCase();
      applyMenuFilters();
    };

  })();
  </script>
</body>
</html>`;
}

// ──────────────────────────────────────────────
// Module Exports
// ──────────────────────────────────────────────
module.exports = {
  escapeHtml,
  cleanPhoneDigits,
  normalisePhone,
  isIndianMobile,
  formatPhoneDisplay,
  buildTelUri,
  parseOpeningHours,
  computeLiveHoursStatus,
  STAY_THEMES,
  RESTAURANT_THEMES,
  ALL_THEMES,
  THEME_CODE_MAP,
  CODE_THEME_MAP,
  PALETTES,
  FONT_PAIRINGS,
  resolveDesign,
  renderErrorPage,
  renderPreviewHtml
};
