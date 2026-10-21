require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');
const crypto = require('crypto');
const zlib = require('zlib');

const app = express();
const PORT = process.env.PORT || 3000;

// ──────────────────────────────────────────────
// Configuration & Limits (Sections 1-4)
// ──────────────────────────────────────────────
const SEARCH_SECRET = (process.env.SEARCH_SECRET || 'locfinder_hmac_secret_2026').trim();
const SEARCH_REQUEST_CAP = parseInt(process.env.SEARCH_REQUEST_CAP, 10) || 300;
const DAILY_REQUEST_CAP = parseInt(process.env.DAILY_REQUEST_CAP, 10) || 1500;

// Load aliases.json (typed legacy name -> official name)
let ALIASES = {};
try {
  const aliasesPath = path.join(__dirname, 'aliases.json');
  if (fs.existsSync(aliasesPath)) {
    ALIASES = JSON.parse(fs.readFileSync(aliasesPath, 'utf8'));
  }
} catch (e) {
  console.error('[Server] Failed to load aliases.json:', e.message);
}

// Famous ambiguous city names across different Indian states
const KNOWN_AMBIGUOUS_NAMES = {
  'aurangabad': [
    { query: 'Chhatrapati Sambhajinagar, Maharashtra', name: 'Chhatrapati Sambhajinagar (Aurangabad)', district: 'Chhatrapati Sambhajinagar', state: 'Maharashtra' },
    { query: 'Aurangabad, Bihar', name: 'Aurangabad', district: 'Aurangabad', state: 'Bihar' }
  ],
  'bilaspur': [
    { query: 'Bilaspur, Chhattisgarh', name: 'Bilaspur', district: 'Bilaspur', state: 'Chhattisgarh' },
    { query: 'Bilaspur, Himachal Pradesh', name: 'Bilaspur', district: 'Bilaspur', state: 'Himachal Pradesh' }
  ],
  'rampur': [
    { query: 'Rampur, Uttar Pradesh', name: 'Rampur', district: 'Rampur', state: 'Uttar Pradesh' },
    { query: 'Rampur, Himachal Pradesh', name: 'Rampur', district: 'Shimla', state: 'Himachal Pradesh' }
  ],
  'pratapgarh': [
    { query: 'Pratapgarh, Uttar Pradesh', name: 'Pratapgarh', district: 'Pratapgarh', state: 'Uttar Pradesh' },
    { query: 'Pratapgarh, Rajasthan', name: 'Pratapgarh', district: 'Pratapgarh', state: 'Rajasthan' }
  ]
};

// ──────────────────────────────────────────────
// Key Loading (log presence only, never values)
// ──────────────────────────────────────────────
const GOOGLE_KEY = (process.env.GOOGLE_PLACES_API_KEY || '').trim().replace(/^["']|["']$/g, '');
const TOMTOM_KEY = (process.env.TOMTOM_API_KEY || '').trim().replace(/^["']|["']$/g, '');
const VERCEL_BLOB_TOKEN = (process.env.BLOB_READ_WRITE_TOKEN || '').trim().replace(/^["']|["']$/g, '');

console.log(`[Server] Google key loaded: ${GOOGLE_KEY ? 'yes' : 'no'}`);
console.log(`[Server] TomTom key loaded: ${TOMTOM_KEY ? 'yes' : 'no'}`);
console.log(`[Server] Vercel Blob configured: ${VERCEL_BLOB_TOKEN ? 'yes' : 'no'}`);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// ──────────────────────────────────────────────
// In-memory caches & Upload Store (with 30-day expiry)
// ──────────────────────────────────────────────
const searchCache = new Map();   // search results
const previewStore = new Map();  // token → enriched data
const uploadStore = new Map();   // storageId → { buffer, contentType, uploadedAt, filename }
const CACHE_TTL_MS = 10 * 60 * 1000;
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

// ──────────────────────────────────────────────
// Social / listing platform detection
// ──────────────────────────────────────────────
const SOCIAL_PLATFORMS = [
  { pattern: /facebook\.com|fb\.me/i,           label: 'Facebook' },
  { pattern: /instagram\.com/i,                 label: 'Instagram' },
  { pattern: /zomato\.com/i,                    label: 'Zomato' },
  { pattern: /swiggy\.com/i,                    label: 'Swiggy' },
  { pattern: /justdial\.com/i,                  label: 'JustDial' },
  { pattern: /tripadvisor\./i,                  label: 'TripAdvisor' },
  { pattern: /booking\.com/i,                   label: 'Booking.com' },
  { pattern: /makemytrip\.com/i,                label: 'MakeMyTrip' },
  { pattern: /goibibo\.com/i,                   label: 'Goibibo' },
  { pattern: /airbnb\./i,                       label: 'Airbnb' },
  { pattern: /linktr\.ee/i,                     label: 'Linktree' },
  { pattern: /yelp\.com/i,                      label: 'Yelp' },
  { pattern: /urbanspoon\.com/i,                label: 'Urbanspoon' },
  { pattern: /burrp\.com/i,                     label: 'Burrp' },
  { pattern: /magicpin\.in/i,                   label: 'Magicpin' },
  { pattern: /dineout\.co\.in/i,                label: 'Dineout' },
  { pattern: /eazydiner\.com/i,                 label: 'EazyDiner' },
  { pattern: /maps\.google\.com|google\.com\/maps|maps\.app\.goo\.gl|business\.google\.com|g\.page/i, label: 'Google Maps' },
  { pattern: /sitch\.app/i,                     label: 'Sitch' },
  { pattern: /dotpe\.in/i,                      label: 'DotPe' },
  { pattern: /petpooja\.com/i,                  label: 'PetPooja' },
  { pattern: /thrivenow\.in/i,                  label: 'Thrive' }
];

function detectSocialPlatform(url) {
  if (!url) return null;
  for (const { pattern, label } of SOCIAL_PLATFORMS) {
    if (pattern.test(url)) return label;
  }
  return null;
}

// ──────────────────────────────────────────────
// URL Shortener detection & Redirect Follower (Sec 3)
// ──────────────────────────────────────────────
const SHORTENER_DOMAINS = new Set([
  'cutt.ly', 'bit.ly', 'tinyurl.com', 'rb.gy', 't.co', 'goo.gl',
  'linktr.ee', 'rotf.lol', 'is.gd', 'buff.ly', 'ow.ly', 'rebrand.ly',
  't.ly', 'shorturl.at', 'qrco.de', 'page.link', 'app.link', 'lnkd.in'
]);

function isUrlShortener(urlStr) {
  if (!urlStr || typeof urlStr !== 'string') return false;
  try {
    const parsed = new URL(urlStr.startsWith('http') ? urlStr : 'https://' + urlStr);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
    if (SHORTENER_DOMAINS.has(host)) return true;
    for (const d of SHORTENER_DOMAINS) {
      if (host.endsWith('.' + d)) return true;
    }
  } catch {}
  return false;
}

async function followRedirects(initialUrl, maxHops = 5, timeoutMs = 5000) {
  if (!initialUrl || typeof initialUrl !== 'string') {
    return { finalUrl: null, finalStatus: null, hops: 0 };
  }
  let currentUrl = initialUrl.trim();
  if (!/^https?:\/\//i.test(currentUrl)) currentUrl = 'https://' + currentUrl;
  let hops = 0;

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
  };

  while (hops < maxHops) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
      let res = await fetch(currentUrl, { method: 'HEAD', headers, signal: controller.signal, redirect: 'manual' });
      if (res.status === 405 || res.status === 501) {
        res = await fetch(currentUrl, { method: 'GET', headers, signal: controller.signal, redirect: 'manual' });
      }
      clearTimeout(timeoutId);

      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get('location');
        if (location) {
          try {
            const nextUrl = new URL(location, currentUrl).href;
            currentUrl = nextUrl;
            hops++;
            continue;
          } catch {
            break;
          }
        }
      }
      return { finalUrl: currentUrl, finalStatus: res.status, hops };
    } catch {
      clearTimeout(timeoutId);
      break;
    }
  }
  return { finalUrl: currentUrl, finalStatus: null, hops };
}

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────
function sanitizeUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return null;
  let trimmed = rawUrl.trim();
  if (!trimmed) return null;
  const parts = trimmed.split(/[\s,;\n]+/);
  if (parts.length > 0 && parts[0]) trimmed = parts[0];
  if (!/^https?:\/\//i.test(trimmed)) trimmed = 'https://' + trimmed;
  return trimmed;
}

async function checkWebsiteStatus(url) {
  if (!url || url === 'Not available') return 'Not listed';

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
  };

  async function tryFetch(method) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    try {
      const res = await fetch(url, { method, headers, signal: controller.signal, redirect: 'follow' });
      clearTimeout(timeoutId);
      return res;
    } catch {
      clearTimeout(timeoutId);
      return null;
    }
  }

  let res = await tryFetch('HEAD');
  if (res) {
    if (res.status >= 200 && res.status < 400) return 'Active';
    if (res.status === 403 || res.status === 429) return 'Active (restricted)';
  }
  res = await tryFetch('GET');
  if (res) {
    if (res.status >= 200 && res.status < 400) return 'Active';
    if (res.status === 403 || res.status === 429) return 'Active (restricted)';
  }
  return 'Inactive';
}

function formatOpeningHours(openingHours) {
  if (!openingHours) return 'Not available';
  if (typeof openingHours === 'string') return openingHours;

  // Google Places format: { weekdayDescriptions: [...] }
  if (Array.isArray(openingHours.weekdayDescriptions) && openingHours.weekdayDescriptions.length > 0) {
    return openingHours.weekdayDescriptions.join(' | ');
  }
  if (openingHours.mode) return `Mode: ${openingHours.mode}`;
  if (Array.isArray(openingHours.timeRanges) && openingHours.timeRanges.length > 0) {
    return openingHours.timeRanges.map(tr => `${tr.startTime} - ${tr.endTime}`).join(', ');
  }
  return 'Not available';
}

// ──────────────────────────────────────────────
// Phone normalisation
// Priority: whatsappNumber override → nationalPhoneNumber → internationalPhoneNumber
// Strips spaces, dashes and a leading 0 from nationalPhoneNumber, or uses internationalPhoneNumber.
// ──────────────────────────────────────────────
function cleanPhoneDigits(raw) {
  if (!raw || typeof raw !== 'string' || raw === 'Not available') return null;
  let s = raw.trim();
  if (!s) return null;
  // Strip spaces and dashes
  s = s.replace(/[\s\-]/g, '');
  // Strip leading 0 (e.g. 09876543210 -> 9876543210)
  s = s.replace(/^0+/, '');
  // Extract all digits
  let digits = s.replace(/\D/g, '');
  if (!digits) return null;
  // Strip +91 / 91 country code prefix if 12 or 11 digits
  if ((digits.length === 12 || digits.length === 11) && digits.startsWith('91')) {
    digits = digits.slice(2);
  }
  return digits || null;
}

function normalisePhone(national, international) {
  // Strip spaces, dashes and a leading 0 from nationalPhoneNumber, or use internationalPhoneNumber
  const fromNat = cleanPhoneDigits(national);
  if (fromNat) return fromNat;
  const fromInt = cleanPhoneDigits(international);
  if (fromInt) return fromInt;
  return null;
}

// Indian mobile: 10 digits starting with 6, 7, 8 (except 80 which is Bengaluru landline) or 9
function isIndianMobile(digits) {
  if (!digits || digits.length !== 10) return false;
  if (digits.startsWith('80')) return false;
  return /^[6-9]/.test(digits);
}

// Returns 91XXXXXXXXXX for WhatsApp (null if not Indian mobile)
function getWhatsAppNumber(whatsappOverride, national, international) {
  if (whatsappOverride) {
    const d = cleanPhoneDigits(whatsappOverride);
    if (d && isIndianMobile(d)) return '91' + d;
  }
  const d = normalisePhone(national, international);
  if (d && isIndianMobile(d)) return '91' + d;
  return null;
}

// Display format:
// Indian mobile: +91 XXXXX XXXXX
// Landlines with 2-digit STD code (e.g. 80 for Bengaluru): +91 80 XXXX XXXX
// Landlines with 3-digit STD code (e.g. 821 for Mysuru): +91 821 XXX XXXX
function formatIndianPhoneNumber(raw) {
  if (!raw || typeof raw !== 'string' || raw === 'Not available') return 'Not available';
  const s = raw.trim().replace(/[\s\-]/g, '');
  let digits = s.replace(/\D/g, '');
  if (!digits) return raw;

  // Strip +91 / 91 country code prefix if 12 or 11 digits
  if ((digits.length === 12 || digits.length === 11) && digits.startsWith('91')) {
    digits = digits.slice(2);
  }
  // Strip leading 0 (STD trunk prefix e.g. 080... or 098...)
  if (digits.length === 11 && digits.startsWith('0')) {
    digits = digits.slice(1);
  } else if (digits.length > 10 && digits.startsWith('0')) {
    digits = digits.slice(1);
  }

  if (digits.length === 10) {
    // 2-digit STD codes: 80, 11, 22, 33, 44, 20, 40, 79
    if (/^(80|11|22|33|44|20|40|79)/.test(digits)) {
      const std = digits.slice(0, 2);
      const part1 = digits.slice(2, 6);
      const part2 = digits.slice(6, 10);
      return `+91 ${std} ${part1} ${part2}`;
    }
    // 3-digit STD codes (e.g. 821 for Mysuru, 824 for Mangaluru, 836, etc.)
    if (/^(821|824|836|816|820|831|832|847|825|838|839|848|818|819|817|827|822|823)/.test(digits)) {
      const std = digits.slice(0, 3);
      const part1 = digits.slice(3, 6);
      const part2 = digits.slice(6, 10);
      return `+91 ${std} ${part1} ${part2}`;
    }
    // Mobile number: +91 XXXXX XXXXX
    return `+91 ${digits.slice(0, 5)} ${digits.slice(5, 10)}`;
  }

  // 8-digit landline without STD code (e.g. 23456789)
  if (digits.length === 8) {
    return `+91 80 ${digits.slice(0, 4)} ${digits.slice(4, 8)}`;
  }

  if (digits.length >= 7) {
    return `+91 ${digits}`;
  }

  return raw;
}

function formatPhoneDisplay(digits) {
  if (!digits) return null;
  return formatIndianPhoneNumber(digits);
}

// tel: URI — tel:+91XXXXXXXXXX without spaces
function buildTelUri(digitsOrRaw) {
  if (!digitsOrRaw) return null;
  const digits = cleanPhoneDigits(digitsOrRaw);
  if (!digits) return null;
  if (digits.length === 10 || digits.length >= 7) {
    return `tel:+91${digits}`;
  }
  return `tel:${digits}`;
}

// HTML escape
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Price level → ₹ symbols
function formatPriceLevel(level) {
  if (!level || level === 'PRICE_LEVEL_UNSPECIFIED') return null;
  const map = {
    PRICE_LEVEL_FREE: '₹',
    PRICE_LEVEL_INEXPENSIVE: '₹',
    PRICE_LEVEL_MODERATE: '₹₹',
    PRICE_LEVEL_EXPENSIVE: '₹₹₹',
    PRICE_LEVEL_VERY_EXPENSIVE: '₹₹₹₹'
  };
  return map[level] || null;
}

// ──────────────────────────────────────────────
// Google Places (New) — Text Search
// ──────────────────────────────────────────────
const GOOGLE_SEARCH_FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.location',
  'places.nationalPhoneNumber',
  'places.internationalPhoneNumber',
  'places.websiteUri',
  'places.rating',
  'places.userRatingCount',
  'places.regularOpeningHours',
  'places.googleMapsUri',
  'places.types',
  'places.primaryType',
  'places.businessStatus',
  'nextPageToken'
].join(',');

const GOOGLE_NEARBY_FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.location',
  'places.nationalPhoneNumber',
  'places.internationalPhoneNumber',
  'places.websiteUri',
  'places.rating',
  'places.userRatingCount',
  'places.regularOpeningHours',
  'places.googleMapsUri',
  'places.types',
  'places.primaryType',
  'places.businessStatus'
].join(',');

// Daily counter for Google Places requests (Section 2 & 4)
// Daily counter for Google Places requests (best-effort counter against DAILY_REQUEST_CAP)
let dailyRequestCount = 0;
let dailyCounterDate = new Date().toISOString().split('T')[0];

function checkDailyLimit(requestsNeeded = 1) {
  const today = new Date().toISOString().split('T')[0];
  if (today !== dailyCounterDate) {
    dailyCounterDate = today;
    dailyRequestCount = 0;
  }
  if (dailyRequestCount + requestsNeeded > DAILY_REQUEST_CAP) {
    throw {
      status: 429,
      code: 'DAILY_LIMIT_EXCEEDED',
      message: `Daily request cap of ${DAILY_REQUEST_CAP} Google Places requests reached (${dailyRequestCount}/${DAILY_REQUEST_CAP} used today). Usage resets tomorrow.`
    };
  }
}

function incrementDailyCounter(count = 1) {
  dailyRequestCount += count;
}

// Exact wordings required by Section 3:
// Restaurants: "restaurant", "cafe", "bakery", "fast food", "dhaba", "mess", "tiffin", "biryani"
const RESTAURANT_WORDINGS = [
  'restaurant', 'cafe', 'bakery', 'fast food', 'dhaba', 'mess', 'tiffin', 'biryani'
];

// Stays: "hotel", "lodge", "guest house", "homestay", "resort", "PG hostel", "service apartment"
const STAY_WORDINGS = [
  'hotel', 'lodge', 'guest house', 'homestay', 'resort', 'PG hostel', 'service apartment'
];

// Area Types for Google Places location resolution
const AREA_TYPES = new Set([
  'locality', 'sublocality', 'sublocality_level_1', 'sublocality_level_2', 'sublocality_level_3',
  'neighbourhood', 'administrative_area_level_1', 'administrative_area_level_2', 'administrative_area_level_3',
  'administrative_area_level_4', 'colloquial_area', 'postal_code', 'political'
]);

function isAreaResult(types) {
  if (!Array.isArray(types) || types.length === 0) return false;
  return types.some(t => AREA_TYPES.has(t));
}

function extractState(formattedAddress) {
  if (!formattedAddress || typeof formattedAddress !== 'string') return '';
  const parts = formattedAddress.split(',').map(s => s.trim());
  if (parts.length === 0) return '';
  let candidate = parts[parts.length - 1];
  if (/india/i.test(candidate) && parts.length >= 2) {
    candidate = parts[parts.length - 2];
  }
  return candidate.replace(/\b\d{6}\b/g, '').replace(/\d+/g, '').trim();
}

function extractDistrict(formattedAddress) {
  if (!formattedAddress || typeof formattedAddress !== 'string') return '';
  const parts = formattedAddress.split(',').map(s => s.trim());
  if (parts.length >= 3) {
    return parts[parts.length - 3];
  }
  return parts[0] || '';
}

async function queryGoogleArea(textQuery) {
  if (!GOOGLE_KEY) throw { status: 503, message: 'Google Places API key is not configured.' };
  checkDailyLimit(1);
  const url = 'https://places.googleapis.com/v1/places:searchText';
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': GOOGLE_KEY,
      'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location,places.viewport,places.types'
    },
    body: JSON.stringify({
      textQuery,
      regionCode: 'IN',
      languageCode: 'en',
      pageSize: 5
    })
  });
  incrementDailyCounter(1);
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw { status: res.status, message: `Area search failed (${res.status}): ${txt.slice(0, 150)}` };
  }
  const data = await res.json();
  const places = (data.places || []).filter(p => isAreaResult(p.types));
  return places;
}

async function resolveLocation(rawText) {
  const typed = (rawText || '').trim();
  if (!typed) throw { status: 400, message: 'Location query is required.' };
  const typedLower = typed.toLowerCase();

  // 1. Check known ambiguous names (e.g. "Aurangabad", "Bilaspur", etc.)
  if (KNOWN_AMBIGUOUS_NAMES[typedLower]) {
    const list = KNOWN_AMBIGUOUS_NAMES[typedLower];
    const candidates = [];
    for (const item of list) {
      try {
        const places = await queryGoogleArea(item.query);
        if (places && places.length > 0) {
          const p = places[0];
          candidates.push({
            placeId: p.id,
            name: p.displayName?.text || item.name,
            district: item.district || extractDistrict(p.formattedAddress),
            state: item.state || extractState(p.formattedAddress),
            formattedAddress: p.formattedAddress,
            location: { lat: p.location?.latitude, lon: p.location?.longitude },
            viewport: p.viewport || null
          });
        }
      } catch (err) {
        console.warn(`[Ambiguous Candidate Error] "${item.query}":`, err.message);
      }
    }
    if (candidates.length > 1) {
      return { status: 'ambiguous', candidates: candidates.slice(0, 5), typedText: typed };
    }
  }

  // 2. Query Google Places Text Search (New)
  let places = await queryGoogleArea(typed);

  // 3. If no area is found, retry once with ", India" appended
  if (!places || places.length === 0) {
    places = await queryGoogleArea(`${typed}, India`);
  }

  // 4. If still no area, try backup alias from aliases.json
  if ((!places || places.length === 0) && ALIASES[typedLower]) {
    const officialAlias = ALIASES[typedLower];
    places = await queryGoogleArea(officialAlias);
    if (!places || places.length === 0) {
      places = await queryGoogleArea(`${officialAlias}, India`);
    }
  }

  if (!places || places.length === 0) {
    throw { status: 404, message: `Could not resolve any town, city, or area for "${typed}". Please check spelling.` };
  }

  // 5. If several plausible areas with different place ids are found
  const uniqueCandidates = [];
  const seenIds = new Set();
  for (const p of places) {
    if (!seenIds.has(p.id)) {
      seenIds.add(p.id);
      uniqueCandidates.push({
        placeId: p.id,
        name: p.displayName?.text || typed,
        district: extractDistrict(p.formattedAddress),
        state: extractState(p.formattedAddress),
        formattedAddress: p.formattedAddress,
        location: { lat: p.location?.latitude, lon: p.location?.longitude },
        viewport: p.viewport || null
      });
    }
  }

  if (uniqueCandidates.length > 1) {
    return {
      status: 'ambiguous',
      candidates: uniqueCandidates.slice(0, 5),
      typedText: typed
    };
  }

  // 6. Exactly one clear area found
  const best = uniqueCandidates[0];
  const officialName = best.name;
  const state = best.state;

  // Log to server console (without keys) whenever typed text and resolved name differ
  if (typedLower !== officialName.toLowerCase()) {
    console.log(`[Location Resolver] Typed: "${typed}" -> Resolved: "${officialName}", ${state} (${best.placeId})`);
  }

  return {
    status: 'resolved',
    area: best,
    typedText: typed
  };
}

// HMAC cursor signing & verification
function signCursor(payload) {
  const jsonStr = JSON.stringify(payload);
  const b64 = Buffer.from(jsonStr, 'utf8').toString('base64url');
  const hmac = crypto.createHmac('sha256', SEARCH_SECRET).update(b64).digest('hex');
  return `${b64}.${hmac}`;
}

function verifyCursor(token) {
  if (!token || typeof token !== 'string') return null;
  const dotIdx = token.indexOf('.');
  if (dotIdx === -1) return null;
  const b64 = token.slice(0, dotIdx);
  const sig = token.slice(dotIdx + 1);
  const expectedSig = crypto.createHmac('sha256', SEARCH_SECRET).update(b64).digest('hex');
  if (sig.length !== expectedSig.length || !crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expectedSig, 'hex'))) {
    return null;
  }
  try {
    const jsonStr = Buffer.from(b64, 'base64url').toString('utf8');
    return JSON.parse(jsonStr);
  } catch {
    return null;
  }
}

// Single Google Places search with retry and backoff
async function googleTextSearchSingle(wording, tile, pageToken = null, maxRetries = 2) {
  if (!GOOGLE_KEY) throw { status: 503, message: 'Google Places API key is not configured.' };
  const url = 'https://places.googleapis.com/v1/places:searchText';

  const bodyObj = {
    textQuery: wording,
    pageSize: 20,
    locationRestriction: {
      rectangle: {
        low: { latitude: tile.latMin, longitude: tile.lngMin },
        high: { latitude: tile.latMax, longitude: tile.lngMax }
      }
    }
  };
  if (pageToken) bodyObj.pageToken = pageToken;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      checkDailyLimit(1);
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': GOOGLE_KEY,
          'X-Goog-FieldMask': GOOGLE_SEARCH_FIELD_MASK
        },
        body: JSON.stringify(bodyObj)
      });
      incrementDailyCounter(1);

      if (res.status === 429) {
        if (attempt < maxRetries) {
          await new Promise(r => setTimeout(r, (attempt + 1) * 800));
          continue;
        }
        throw { status: 429, code: 'GOOGLE_429', message: 'Google Places API quota/rate limit reached (429).' };
      }
      if (res.status === 403) {
        throw { status: 403, code: 'GOOGLE_403', message: 'Google Places API key is invalid or restricted (403).' };
      }
      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        throw { status: res.status, message: `Places search failed (${res.status}): ${txt.slice(0, 150)}` };
      }
      const data = await res.json();
      const places = (data.places || []).filter(p => p.businessStatus !== 'CLOSED_PERMANENTLY');
      return { places, nextPageToken: data.nextPageToken || null };
    } catch (err) {
      if (err.status === 429 && attempt < maxRetries) {
        await new Promise(r => setTimeout(r, (attempt + 1) * 800));
        continue;
      }
      if (attempt < maxRetries && (!err.status || err.status >= 500)) {
        await new Promise(r => setTimeout(r, 400));
        continue;
      }
      throw err;
    }
  }
}

async function runInBatches(tasks, batchSize = 5, delayMs = 100) {
  const results = [];
  for (let i = 0; i < tasks.length; i += batchSize) {
    const batch = tasks.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(fn => fn()));
    results.push(...batchResults);
    if (i + batchSize < tasks.length && delayMs > 0) {
      await new Promise(r => setTimeout(r, delayMs));
    }
  }
  return results;
}

// ──────────────────────────────────────────────
// Google Places (New) — Place Details (enrich)
// ──────────────────────────────────────────────
const GOOGLE_DETAIL_FIELDS_FULL = [
  'id', 'displayName', 'formattedAddress', 'location', 'googleMapsUri',
  'nationalPhoneNumber', 'internationalPhoneNumber', 'websiteUri',
  'rating', 'userRatingCount', 'priceLevel', 'priceRange',
  'regularOpeningHours', 'editorialSummary', 'businessStatus', 'types',
  'servesBrunch', 'servesBreakfast', 'servesLunch', 'servesDinner',
  'servesVegetarianFood', 'dineIn', 'takeout', 'delivery',
  'reservable', 'outdoorSeating', 'goodForGroups', 'goodForChildren',
  'allowsDogs', 'parkingOptions', 'paymentOptions', 'accessibilityOptions',
  'photos', 'reviews'
];

async function googlePlaceDetails(placeId, fieldsToTry) {
  if (!GOOGLE_KEY) throw { status: 503, message: 'Google Places API key is not configured.' };

  const fieldMask = fieldsToTry.join(',');
  const url = `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`;

  const res = await fetch(url, {
    headers: {
      'X-Goog-Api-Key': GOOGLE_KEY,
      'X-Goog-FieldMask': fieldMask
    }
  });

  if (res.status === 403) throw { status: 403, message: 'Google Places API: 403 – key may not have Places API (New) enabled.' };
  if (res.status === 429) throw { status: 429, message: 'Google Places API daily quota reached. Try again tomorrow.' };
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw { status: res.status, message: `Google Places Details failed (${res.status}): ${txt.slice(0, 200)}` };
  }
  return res.json();
}

async function googlePlaceDetailsWithRetry(placeId) {
  let fields = [...GOOGLE_DETAIL_FIELDS_FULL];
  try {
    return await googlePlaceDetails(placeId, fields);
  } catch (err) {
    // If it's a field-level error (not quota/auth), retry without photos/reviews
    if (err.status !== 403 && err.status !== 429) {
      const reducedFields = fields.filter(f => f !== 'photos' && f !== 'reviews');
      try {
        const data = await googlePlaceDetails(placeId, reducedFields);
        data._photosUnavailable = true;
        return data;
      } catch (err2) {
        throw err2;
      }
    }
    throw err;
  }
}

// ──────────────────────────────────────────────
// Map Google Place → unified place object
// ──────────────────────────────────────────────
function mapGooglePlace(gp, computedType) {
  const name = gp.displayName?.text || 'Unknown Place';
  const address = gp.formattedAddress || 'Not available';
  const rawPhone = gp.nationalPhoneNumber || gp.internationalPhoneNumber || 'Not available';
  const rawWebsite = gp.websiteUri ? sanitizeUrl(gp.websiteUri) : null;
  const openingHours = formatOpeningHours(gp.regularOpeningHours);
  const mapLink = gp.googleMapsUri || (gp.location ? `https://www.google.com/maps?q=${gp.location.latitude},${gp.location.longitude}` : 'Not available');
  const rating = gp.rating ? String(gp.rating) : 'Not available';
  const reviewCount = gp.userRatingCount ? String(gp.userRatingCount) : 'Not available';

  // Format phone (+91 for Indian numbers, keeping original digits)
  const phone = formatIndianPhoneNumber(rawPhone);

  // Determine website display and social platform
  let websiteDisplay = rawWebsite || 'Not available';
  let socialPlatform = null;
  if (rawWebsite) {
    socialPlatform = detectSocialPlatform(rawWebsite);
    if (socialPlatform) {
      websiteDisplay = `[${socialPlatform}]`;
    }
  }

  // Determine type from Google primaryType and types array (never from words in the name)
  let type = computedType;
  if (!type) {
    const RESTAURANT_TYPES = new Set([
      'restaurant', 'food', 'cafe', 'bakery', 'meal_takeaway', 'meal_delivery',
      'fast_food_restaurant', 'bar', 'pub', 'bistro', 'diner', 'ice_cream_shop',
      'coffee_shop', 'tea_house', 'south_indian_restaurant', 'indian_restaurant',
      'chicken_restaurant', 'vegetarian_restaurant'
    ]);
    const STAY_TYPES = new Set([
      'lodging', 'hotel', 'motel', 'hostel', 'guest_house', 'bed_and_breakfast',
      'resort_hotel', 'extended_stay_hotel', 'farmstay', 'campground'
    ]);

    const pType = (gp.primaryType || '').toLowerCase();
    if (RESTAURANT_TYPES.has(pType)) {
      type = 'Restaurant';
    } else if (STAY_TYPES.has(pType)) {
      type = 'Stay';
    } else {
      const types = (gp.types || []).map(t => t.toLowerCase());
      const hasRest = types.some(t => RESTAURANT_TYPES.has(t));
      const hasStay = types.some(t => STAY_TYPES.has(t));
      if (hasRest) type = 'Restaurant';
      else if (hasStay) type = 'Stay';
      else type = 'Restaurant';
    }
  }

  return {
    id: gp.id || crypto.randomBytes(8).toString('hex'),
    placeId: gp.id || null,
    source: 'google',
    name,
    type,
    originalType: type,
    address,
    phone,
    rawPhone,
    website: websiteDisplay,
    websiteUri: rawWebsite,
    finalWebsiteUri: rawWebsite,
    socialPlatform,
    openingHours,
    mapLink,
    rating,
    reviewCount,
    coordinates: gp.location ? { lat: gp.location.latitude, lon: gp.location.longitude } : null,
    businessStatus: gp.businessStatus || 'OPERATIONAL',
    types: gp.types || [],
    primaryType: gp.primaryType || null,
    fetchedAt: new Date().toISOString()
  };
}

// ──────────────────────────────────────────────
// TomTom geocode + POI (kept as fallback)
// ──────────────────────────────────────────────
async function geocodeLocationTomTom(locationStr) {
  if (!TOMTOM_KEY) throw { status: 500, message: 'TomTom API key is not configured.' };
  const geoUrl = `https://api.tomtom.com/search/2/geocode/${encodeURIComponent(locationStr)}.json?countrySet=IN&limit=1&key=${TOMTOM_KEY}`;
  const response = await fetch(geoUrl);
  if (response.status === 401) throw { status: 401, message: 'Invalid TomTom API key (401).' };
  if (response.status === 403) throw { status: 403, message: 'TomTom API key or service not enabled (403).' };
  if (response.status === 429) throw { status: 429, message: 'TomTom API rate limit exceeded.' };
  if (!response.ok) throw { status: response.status, message: `TomTom geocode failed (${response.status})` };
  const data = await response.json();
  return data.results?.[0]?.position || null;
}

async function fetchTomTomPois(lat, lon, radius, categorySet, queryText) {
  if (!TOMTOM_KEY) return [];
  const url = `https://api.tomtom.com/search/2/poiSearch/${encodeURIComponent(queryText)}.json?lat=${lat}&lon=${lon}&radius=${radius}&countrySet=IN&limit=50&categorySet=${categorySet}&key=${TOMTOM_KEY}`;
  const res = await fetch(url);
  if (!res.ok) {
    if (res.status === 401) throw { status: 401, message: 'Invalid TomTom API key (401).' };
    if (res.status === 403) throw { status: 403, message: 'TomTom API key or service not enabled (403).' };
    if (res.status === 429) throw { status: 429, message: 'TomTom API rate limit exceeded.' };
    return [];
  }
  const data = await res.json();
  return data.results || [];
}

function mapTomTomPlace(item) {
  const poi = item.poi || {};
  const addr = item.address || {};
  const pos = item.position || {};
  const rawPhone = poi.phone || (Array.isArray(poi.phoneNumbers) && poi.phoneNumbers[0] ? poi.phoneNumbers[0].phone : null);
  const phone = formatIndianPhoneNumber(rawPhone ? rawPhone.trim() : 'Not available');
  const rawUrl = poi.url ? sanitizeUrl(poi.url) : null;

  let websiteDisplay = rawUrl || 'Not available';
  let socialPlatform = null;
  if (rawUrl) {
    socialPlatform = detectSocialPlatform(rawUrl);
    if (socialPlatform) websiteDisplay = `[${socialPlatform}]`;
  }

  const type = item._computedType || (poi.categorySet?.some(c => c.id === 7314) ? 'Stay' : 'Restaurant');

  return {
    id: item.id || crypto.randomBytes(8).toString('hex'),
    placeId: null,
    source: 'tomtom',
    name: poi.name ? poi.name.trim() : 'Unknown Place',
    type,
    originalType: type,
    address: addr.freeformAddress ? addr.freeformAddress.trim() : 'Not available',
    phone,
    rawPhone: phone,
    website: websiteDisplay,
    websiteUri: rawUrl,
    finalWebsiteUri: rawUrl,
    socialPlatform,
    openingHours: formatOpeningHours(poi.openingHours),
    mapLink: `https://www.google.com/maps?q=${pos.lat},${pos.lon}`,
    rating: 'Not available',
    reviewCount: 'Not available',
    coordinates: pos.lat ? { lat: pos.lat, lon: pos.lon } : null,
    businessStatus: 'OPERATIONAL',
    types: poi.categorySet ? poi.categorySet.map(c => c.name || String(c.id)) : [],
    fetchedAt: new Date().toISOString()
  };
}

// ──────────────────────────────────────────────
// Website status resolution with shortener redirect following (Sec 3)
// ──────────────────────────────────────────────
async function resolveWebsiteStatus(place) {
  let targetUrl = place.websiteUri;
  if (!targetUrl || targetUrl === 'Not available') {
    return { ...place, websiteStatus: 'Not listed', finalWebsiteUri: null };
  }

  let finalUrl = targetUrl;
  let socialPlatform = detectSocialPlatform(targetUrl);

  // If shortener, or potential redirect, follow redirects up to 5 hops with 5-second timeout
  if (isUrlShortener(targetUrl) || /cutt\.ly|bit\.ly|tinyurl|rb\.gy|t\.co|goo\.gl|linktr\.ee/i.test(targetUrl)) {
    const redir = await followRedirects(targetUrl, 5, 5000);
    if (redir.finalUrl) {
      finalUrl = redir.finalUrl;
      const detected = detectSocialPlatform(finalUrl);
      if (detected) {
        socialPlatform = detected;
      }
    }
  }

  // If final address is social or listing platform, mark "No own website" and show platform name
  if (socialPlatform) {
    return {
      ...place,
      finalWebsiteUri: finalUrl,
      websiteStatus: 'No own website',
      socialPlatform: socialPlatform,
      website: `[${socialPlatform}]`
    };
  }

  // Follow general redirects to capture final URL if not already followed
  if (finalUrl === targetUrl) {
    const redir = await followRedirects(finalUrl, 5, 5000);
    if (redir.finalUrl) {
      finalUrl = redir.finalUrl;
      const detected = detectSocialPlatform(finalUrl);
      if (detected) {
        return {
          ...place,
          finalWebsiteUri: finalUrl,
          websiteStatus: 'No own website',
          socialPlatform: detected,
          website: `[${detected}]`
        };
      }
    }
  }

  const status = await checkWebsiteStatus(finalUrl);
  return {
    ...place,
    finalWebsiteUri: finalUrl,
    websiteStatus: status,
    website: (place.website && !place.website.startsWith('http')) ? place.website : finalUrl
  };
}

// ──────────────────────────────────────────────
// POST /api/resolve-location (Section 2)
// ──────────────────────────────────────────────
app.post('/api/resolve-location', async (req, res) => {
  try {
    const text = (req.body?.text || req.body?.location || '').trim();
    if (!text) return res.status(400).json({ error: 'Location text is required.' });
    const result = await resolveLocation(text);
    return res.json(result);
  } catch (err) {
    console.error('[Resolve Location Error]', err.message || err);
    return res.status(err.status || 500).json({ error: err.message || 'Location resolution failed.' });
  }
});

// ──────────────────────────────────────────────
// Session store for stepped search (Section 3)
// ──────────────────────────────────────────────
const searchSessionStore = new Map();
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of searchSessionStore.entries()) {
    if (now - v.timestamp > 30 * 60 * 1000) searchSessionStore.delete(k);
  }
}, 5 * 60 * 1000);

// ──────────────────────────────────────────────
// POST /api/search/step — Adaptive tiling with HMAC cursor (Section 3)
// ──────────────────────────────────────────────
app.post('/api/search/step', async (req, res) => {
  try {
    const { placeId, category = 'both', viewport, cursor } = req.body || {};
    if (!placeId && !cursor) {
      return res.status(400).json({ error: 'placeId and viewport are required to start a search.' });
    }

    const normCategory = (category || 'both').toLowerCase().trim();

    // Check cache by resolved placeId and category first
    const cacheKey = `resolved_${placeId}_${normCategory}`;
    const cached = searchCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp < CACHE_TTL_MS)) {
      console.log(`[Cache Hit] placeId: ${placeId} (${normCategory}) -> ${cached.places.length} places`);
      return res.json({
        places: cached.places,
        requestsInStep: 0,
        totalRequestsUsed: cached.totalRequestsUsed || 0,
        nextCursor: null,
        isComplete: true,
        cached: true
      });
    }

    let sessionId;
    let queue = [];
    let vp = viewport;

    if (!cursor) {
      // Start a brand new search
      sessionId = crypto.randomBytes(8).toString('hex');
      let wordings = [];
      if (normCategory === 'restaurants' || normCategory === 'restaurant') {
        wordings = [...RESTAURANT_WORDINGS];
      } else if (normCategory === 'stays' || normCategory === 'stay' || normCategory === 'hotels') {
        wordings = [...STAY_WORDINGS];
      } else {
        wordings = [...RESTAURANT_WORDINGS, ...STAY_WORDINGS];
      }

      if (!vp || !vp.low || !vp.high) {
        return res.status(400).json({ error: 'Valid viewport rectangle is required.' });
      }

      const initialTile = {
        latMin: vp.low.latitude,
        latMax: vp.high.latitude,
        lngMin: vp.low.longitude,
        lngMax: vp.high.longitude,
        depth: 1
      };

      queue = wordings.map(w => ({
        tile: initialTile,
        wording: w,
        pageToken: null,
        pageIndex: 0
      }));

      searchSessionStore.set(sessionId, {
        seenIds: new Set(),
        places: [],
        totalRequestsUsed: 0,
        timestamp: Date.now()
      });
    } else {
      // Resume from verified HMAC cursor
      const payload = verifyCursor(cursor);
      if (!payload || !payload.sessionId) {
        return res.status(400).json({ error: 'Invalid or expired cursor.' });
      }
      sessionId = payload.sessionId;
      queue = payload.queue || [];
      vp = payload.viewport || viewport;

      if (!searchSessionStore.has(sessionId)) {
        searchSessionStore.set(sessionId, {
          seenIds: new Set(payload.seenIds || []),
          places: [],
          totalRequestsUsed: payload.totalRequestsUsed || 0,
          timestamp: Date.now()
        });
      }
    }

    const session = searchSessionStore.get(sessionId);
    const MAX_STEP_REQUESTS = 15;
    let requestsInStep = 0;
    const newPlacesInStep = [];

    // Process queue up to MAX_STEP_REQUESTS in parallel batches of up to 5
    while (queue.length > 0 && requestsInStep < MAX_STEP_REQUESTS && session.totalRequestsUsed < SEARCH_REQUEST_CAP) {
      const batchSize = Math.min(5, MAX_STEP_REQUESTS - requestsInStep, SEARCH_REQUEST_CAP - session.totalRequestsUsed, queue.length);
      const currentBatch = queue.splice(0, batchSize);

      const batchPromises = currentBatch.map(async (item) => {
        try {
          const resSingle = await googleTextSearchSingle(item.wording, item.tile, item.pageToken);
          return { item, res: resSingle, error: null };
        } catch (err) {
          return { item, res: { places: [], nextPageToken: null }, error: err };
        }
      });

      const batchResults = await Promise.all(batchPromises);
      requestsInStep += batchResults.length;
      session.totalRequestsUsed += batchResults.length;

      for (const { item, res: resSingle, error } of batchResults) {
        if (error) {
          console.warn(`[Step Request Error] "${item.wording}":`, error.message);
          continue;
        }

        for (const gp of resSingle.places) {
          // Keep only places whose coordinates are inside the resolved overall viewport
          if (gp.location && vp && vp.low && vp.high) {
            const { latitude, longitude } = gp.location;
            if (latitude < vp.low.latitude || latitude > vp.high.latitude ||
                longitude < vp.low.longitude || longitude > vp.high.longitude) {
              continue;
            }
          }

          if (gp.id && !session.seenIds.has(gp.id)) {
            session.seenIds.add(gp.id);
            const mapped = mapGooglePlace(gp);
            newPlacesInStep.push(mapped);
            session.places.push(mapped);
          }
        }

        // Pagination: fetch up to 3 pages (pageIndex 0, 1, 2)
        if (resSingle.nextPageToken && item.pageIndex < 2) {
          queue.push({
            tile: item.tile,
            wording: item.wording,
            pageToken: resSingle.nextPageToken,
            pageIndex: item.pageIndex + 1
          });
        } else if (resSingle.nextPageToken && item.pageIndex === 2) {
          // Reached 60-result cap for this tile and wording!
          // If depth < 4, split tile into 4 sub-tiles and repeat
          if (item.tile.depth < 4) {
            const latMid = (item.tile.latMin + item.tile.latMax) / 2;
            const lngMid = (item.tile.lngMin + item.tile.lngMax) / 2;
            const subTiles = [
              { latMin: latMid, latMax: item.tile.latMax, lngMin: item.tile.lngMin, lngMax: lngMid, depth: item.tile.depth + 1 },
              { latMin: latMid, latMax: item.tile.latMax, lngMin: lngMid, lngMax: item.tile.lngMax, depth: item.tile.depth + 1 },
              { latMin: item.tile.latMin, latMax: latMid, lngMin: item.tile.lngMin, lngMax: lngMid, depth: item.tile.depth + 1 },
              { latMin: item.tile.latMin, latMax: latMid, lngMin: lngMid, lngMax: item.tile.lngMax, depth: item.tile.depth + 1 }
            ];
            for (const st of subTiles) {
              queue.push({
                tile: st,
                wording: item.wording,
                pageToken: null,
                pageIndex: 0
              });
            }
          }
        }
      }
    }

    const isCapped = session.totalRequestsUsed >= SEARCH_REQUEST_CAP;
    const isComplete = queue.length === 0 || isCapped;

    if (isComplete) {
      // Cache results by resolved placeId and category
      searchCache.set(cacheKey, {
        timestamp: Date.now(),
        places: session.places,
        totalRequestsUsed: session.totalRequestsUsed
      });
      searchSessionStore.delete(sessionId);
      return res.json({
        places: newPlacesInStep,
        requestsInStep,
        totalRequestsUsed: session.totalRequestsUsed,
        nextCursor: null,
        isComplete: true,
        capped: isCapped
      });
    } else {
      session.timestamp = Date.now();
      const nextCursor = signCursor({
        sessionId,
        placeId,
        category: normCategory,
        viewport: vp,
        queue,
        seenIds: Array.from(session.seenIds).slice(0, 500),
        totalRequestsUsed: session.totalRequestsUsed,
        timestamp: Date.now()
      });
      return res.json({
        places: newPlacesInStep,
        requestsInStep,
        totalRequestsUsed: session.totalRequestsUsed,
        nextCursor,
        isComplete: false,
        capped: false
      });
    }
  } catch (err) {
    console.error('[Search Step Error]', err.message || err);
    return res.status(err.status || 500).json({ error: err.message || 'Search step failed.' });
  }
});

// ──────────────────────────────────────────────
// POST /api/check-websites-batch (Section 3)
// ──────────────────────────────────────────────
app.post('/api/check-websites-batch', async (req, res) => {
  try {
    const { places = [] } = req.body || {};
    if (!Array.isArray(places)) {
      return res.status(400).json({ error: 'places array is required.' });
    }
    const tasks = places.map(p => async () => {
      try {
        const resolved = await resolveWebsiteStatus(p);
        return {
          id: p.id,
          websiteStatus: resolved.websiteStatus,
          finalWebsiteUri: resolved.finalWebsiteUri,
          socialPlatform: resolved.socialPlatform,
          website: resolved.website
        };
      } catch {
        return {
          id: p.id,
          websiteStatus: 'Not listed',
          finalWebsiteUri: p.websiteUri || null,
          socialPlatform: null,
          website: p.website || 'Not available'
        };
      }
    });
    const results = await runInBatches(tasks, 10, 50);
    return res.json({ results });
  } catch (err) {
    console.error('[Check Websites Batch Error]', err.message || err);
    return res.status(500).json({ error: 'Failed to check websites.' });
  }
});

// ──────────────────────────────────────────────
// Main Search Handler (kept for backward compatibility & TomTom)
// ──────────────────────────────────────────────
async function handleSearch(req, res) {
  try {
    const location = (req.method === 'GET' ? req.query.location : req.body.location) || '';
    const category = (req.method === 'GET' ? req.query.category : req.body.category) || 'both';
    const source = (req.method === 'GET' ? req.query.source : req.body.source) || 'google';

    const trimmedLoc = location.trim();
    if (!trimmedLoc) return res.status(400).json({ error: 'Location query is required.' });

    const normCategory = category.toLowerCase().trim();
    const normSource = source.toLowerCase().trim();

    // ── TomTom path ──
    if (normSource === 'tomtom') {
      try {
        const position = await geocodeLocationTomTom(trimmedLoc);
        if (!position) return res.status(404).json({ error: 'Location not found in TomTom.' });
        const [restR, stayR] = await Promise.all([
          fetchTomTomPois(position.lat, position.lon, 5000, '7315', 'restaurant'),
          fetchTomTomPois(position.lat, position.lon, 5000, '7314', 'hotel')
        ]);
        const rawResults = [
          ...restR.map(i => ({ ...i, _computedType: 'Restaurant' })),
          ...stayR.map(i => ({ ...i, _computedType: 'Stay' }))
        ];
        const deduped = [];
        const seen = new Set();
        for (const item of rawResults) {
          const k = (item.poi?.name || '') + '|' + (item.address?.freeformAddress || '');
          if (!seen.has(k)) { seen.add(k); deduped.push(item); }
        }
        const mapped = deduped.map(mapTomTomPlace);
        const checked = await Promise.all(mapped.map(resolveWebsiteStatus));
        return res.json({
          cached: false,
          location: trimmedLoc,
          category: normCategory,
          source: 'tomtom',
          total: checked.length,
          results: checked
        });
      } catch (ttErr) {
        return res.status(ttErr.status || 500).json({ error: ttErr.message });
      }
    }

    // ── Google Places path ──
    const locRes = await resolveLocation(trimmedLoc);
    if (locRes.status === 'ambiguous') {
      return res.json({ status: 'ambiguous', candidates: locRes.candidates, typedText: trimmedLoc });
    }

    const area = locRes.area;
    const cacheKey = `resolved_${area.placeId}_${normCategory}`;
    const cached = searchCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp < CACHE_TTL_MS)) {
      return res.json({
        cached: true,
        location: area.name,
        category: normCategory,
        source: 'google',
        total: cached.places.length,
        results: cached.places,
        totalRequestsUsed: cached.totalRequestsUsed || 0
      });
    }

    // Perform search across tiles until complete
    let cursor = null;
    const collectedPlaces = [];
    let finalRequests = 0;

    while (true) {
      // Internal step call
      const stepRes = await (async () => {
        const bodyObj = { placeId: area.placeId, category: normCategory, viewport: area.viewport, cursor };
        const mockRes = {
          _data: null,
          status: function() { return this; },
          json: function(d) { this._data = d; return this; }
        };
        // Reuse logic by executing steps
        let sId = cursor ? verifyCursor(cursor)?.sessionId : null;
        let q = [];
        if (!cursor) {
          sId = crypto.randomBytes(8).toString('hex');
          const words = normCategory === 'restaurants' ? RESTAURANT_WORDINGS : normCategory === 'stays' ? STAY_WORDINGS : [...RESTAURANT_WORDINGS, ...STAY_WORDINGS];
          const it = { latMin: area.viewport.low.latitude, latMax: area.viewport.high.latitude, lngMin: area.viewport.low.longitude, lngMax: area.viewport.high.longitude, depth: 1 };
          q = words.map(w => ({ tile: it, wording: w, pageToken: null, pageIndex: 0 }));
          searchSessionStore.set(sId, { seenIds: new Set(), places: [], totalRequestsUsed: 0, timestamp: Date.now() });
        } else {
          const payload = verifyCursor(cursor);
          sId = payload.sessionId;
          q = payload.queue || [];
        }

        const sess = searchSessionStore.get(sId);
        let reqs = 0;
        const newPl = [];

        while (q.length > 0 && reqs < 15 && sess.totalRequestsUsed < SEARCH_REQUEST_CAP) {
          const bSize = Math.min(5, 15 - reqs, SEARCH_REQUEST_CAP - sess.totalRequestsUsed, q.length);
          const cBatch = q.splice(0, bSize);
          const bResults = await Promise.all(cBatch.map(async (item) => {
            try {
              const r = await googleTextSearchSingle(item.wording, item.tile, item.pageToken);
              return { item, res: r };
            } catch {
              return { item, res: { places: [], nextPageToken: null } };
            }
          }));
          reqs += bResults.length;
          sess.totalRequestsUsed += bResults.length;

          for (const { item, res: r } of bResults) {
            for (const gp of r.places) {
              if (gp.id && !sess.seenIds.has(gp.id)) {
                sess.seenIds.add(gp.id);
                const m = mapGooglePlace(gp);
                newPl.push(m);
                sess.places.push(m);
              }
            }
            if (r.nextPageToken && item.pageIndex < 2) {
              q.push({ tile: item.tile, wording: item.wording, pageToken: r.nextPageToken, pageIndex: item.pageIndex + 1 });
            }
          }
        }

        const comp = q.length === 0 || sess.totalRequestsUsed >= SEARCH_REQUEST_CAP;
        if (comp) {
          searchSessionStore.delete(sId);
          return { places: newPl, isComplete: true, totalRequestsUsed: sess.totalRequestsUsed, nextCursor: null };
        } else {
          const nextCur = signCursor({ sessionId: sId, placeId: area.placeId, category: normCategory, viewport: area.viewport, queue: q, totalRequestsUsed: sess.totalRequestsUsed });
          return { places: newPl, isComplete: false, totalRequestsUsed: sess.totalRequestsUsed, nextCursor: nextCur };
        }
      })();

      collectedPlaces.push(...stepRes.places);
      finalRequests = stepRes.totalRequestsUsed;
      if (stepRes.isComplete) break;
      cursor = stepRes.nextCursor;
    }

    const checked = await Promise.all(collectedPlaces.map(resolveWebsiteStatus));
    searchCache.set(cacheKey, { timestamp: Date.now(), places: checked, totalRequestsUsed: finalRequests });

    return res.json({
      cached: false,
      location: area.name,
      category: normCategory,
      source: 'google',
      total: checked.length,
      results: checked,
      totalRequestsUsed: finalRequests
    });
  } catch (err) {
    console.error('[Search Error]', err.message || err);
    return res.status(err.status || 500).json({ error: err.message || 'Search failed.' });
  }
}

app.get('/api/search', handleSearch);
app.post('/api/search', handleSearch);

// ──────────────────────────────────────────────
// POST /api/search-single (Kept for unit tests)
// ──────────────────────────────────────────────
app.post('/api/search-single', async (req, res) => {
  try {
    const { name, location } = req.body || {};
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'Business name is required.' });
    }
    const loc = (location || '').trim();
    const query = loc ? `${name.trim()} in ${loc}` : name.trim();

    checkDailyLimit(1);
    const searchRes = await queryGoogleArea(query);
    let places = [];
    if (searchRes && searchRes.length > 0) {
      places = searchRes.map(gp => mapGooglePlace(gp));
    } else {
      const url = 'https://places.googleapis.com/v1/places:searchText';
      const r = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': GOOGLE_KEY,
          'X-Goog-FieldMask': GOOGLE_SEARCH_FIELD_MASK
        },
        body: JSON.stringify({ textQuery: query, pageSize: 5 })
      });
      incrementDailyCounter(1);
      if (r.ok) {
        const d = await r.json();
        places = (d.places || []).map(gp => mapGooglePlace(gp));
      }
    }
    const resolvedPlaces = await Promise.all(places.map(p => resolveWebsiteStatus(p)));
    return res.json({ places: resolvedPlaces });
  } catch (err) {
    console.error('[Search Single Error]', err.message || err);
    return res.status(err.status || 500).json({ error: err.message || 'Search failed.' });
  }
});

// ──────────────────────────────────────────────
// POST /api/enrich  — Fetch full Place Details
// ──────────────────────────────────────────────
app.post('/api/enrich', async (req, res) => {
  try {
    const { placeId } = req.body || {};
    if (!placeId || typeof placeId !== 'string' || !/^[A-Za-z0-9_\-:]+$/.test(placeId)) {
      return res.status(400).json({ error: 'Valid placeId is required.' });
    }

    if (!GOOGLE_KEY) {
      return res.status(503).json({ error: 'Google Places API key not configured on server. Cannot enrich.' });
    }

    const details = await googlePlaceDetailsWithRetry(placeId);

    // Sanitize and forward safe fields only (never the API key)
    const rawEnrichedPhone = details.nationalPhoneNumber || details.internationalPhoneNumber || '';
    const formattedEnrichedPhone = formatIndianPhoneNumber(rawEnrichedPhone);

    const safe = {
      id: details.id || placeId,
      name: details.displayName?.text || '',
      address: details.formattedAddress || '',
      phone: formattedEnrichedPhone,
      rawPhone: rawEnrichedPhone,
      website: details.websiteUri || '',
      mapLink: details.googleMapsUri || '',
      rating: details.rating || null,
      reviewCount: details.userRatingCount || null,
      priceLevel: formatPriceLevel(details.priceLevel),
      editorialSummary: details.editorialSummary?.text || '',
      openingHours: formatOpeningHours(details.regularOpeningHours),
      businessStatus: details.businessStatus || 'OPERATIONAL',
      types: details.types || [],
      features: {
        servesBreakfast: details.servesBreakfast || false,
        servesLunch: details.servesLunch || false,
        servesDinner: details.servesDinner || false,
        servesVegetarianFood: details.servesVegetarianFood || false,
        dineIn: details.dineIn || false,
        takeout: details.takeout || false,
        delivery: details.delivery || false,
        reservable: details.reservable || false,
        outdoorSeating: details.outdoorSeating || false,
        goodForGroups: details.goodForGroups || false,
        goodForChildren: details.goodForChildren || false,
        allowsDogs: details.allowsDogs || false,
        parkingOptions: details.parkingOptions || {},
        paymentOptions: details.paymentOptions || {},
        accessibilityOptions: details.accessibilityOptions || {}
      },
      // Photo resource names (not full URLs — proxy fetches them)
      photos: details._photosUnavailable ? [] : (details.photos || []).slice(0, 12).map(p => ({
        name: p.name,
        widthPx: p.widthPx,
        heightPx: p.heightPx,
        authorAttributions: (p.authorAttributions || []).map(a => ({ displayName: a.displayName, uri: a.uri }))
      })),
      reviews: details._photosUnavailable ? [] : (details.reviews || []).slice(0, 5).map(r => ({
        authorName: r.authorAttribution?.displayName || 'Anonymous',
        rating: r.rating || null,
        text: r.text?.text || '',
        publishTime: r.publishTime || null
      })),
      photosUnavailable: details._photosUnavailable || false,
      location: details.location ? { lat: details.location.latitude, lon: details.location.longitude } : null
    };

    return res.json({ success: true, details: safe });
  } catch (err) {
    console.error('[Enrich Error]', err.message || err);
    return res.status(err.status || 500).json({ error: err.message || 'Failed to fetch place details.' });
  }
});

// ──────────────────────────────────────────────
// GET /api/photo  — Proxy Google photo (no key in browser)
// Validates resource name: must match places/{id}/photos/{id}
// ──────────────────────────────────────────────
app.get('/api/photo', async (req, res) => {
  const { name, maxWidth } = req.query;

  // Strict resource name validation
  if (!name || typeof name !== 'string' || !/^places\/[A-Za-z0-9_\-:]+\/photos\/[A-Za-z0-9_\-]+$/.test(name)) {
    return res.status(400).json({ error: 'Invalid photo resource name.' });
  }
  if (!GOOGLE_KEY) return res.status(503).json({ error: 'Google API key not configured.' });

  const width = Math.min(parseInt(maxWidth || '800', 10) || 800, 800);
  const photoUrl = `https://places.googleapis.com/v1/${encodeURIComponent(name).replace(/%2F/g, '/')}/media?maxWidthPx=${width}&key=${GOOGLE_KEY}`;

  try {
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), 10000);
    const upstream = await fetch(photoUrl, { signal: controller.signal });
    clearTimeout(tid);

    if (!upstream.ok) return res.status(upstream.status).json({ error: 'Photo not available.' });

    const contentType = upstream.headers.get('content-type') || 'image/jpeg';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=3600');

    const buffer = await upstream.arrayBuffer();
    return res.send(Buffer.from(buffer));
  } catch (err) {
    console.error('[Photo Proxy Error]', err.message);
    return res.status(502).json({ error: 'Failed to fetch photo.' });
  }
});

// ──────────────────────────────────────────────
// POST /api/upload-photo — Upload owner-provided photos (Section 3)
// Rules: JPEG/PNG/WebP, max 5MB, random unguessable ID, Vercel Blob or local store
// ──────────────────────────────────────────────
app.post('/api/upload-photo', async (req, res) => {
  try {
    const { filename, contentType, base64Data, permissionConfirmed } = req.body || {};
    if (!permissionConfirmed) {
      return res.status(400).json({ error: 'Permission confirmation is required.' });
    }
    if (!base64Data || typeof base64Data !== 'string') {
      return res.status(400).json({ error: 'Image data is required.' });
    }

    const validMimes = ['image/jpeg', 'image/png', 'image/webp'];
    const mime = (contentType || 'image/jpeg').toLowerCase();
    if (!validMimes.includes(mime)) {
      return res.status(400).json({ error: 'Only JPEG, PNG, and WebP images are allowed.' });
    }

    // Clean base64 data prefix if present
    const cleanBase64 = base64Data.replace(/^data:image\/[a-z]+;base64,/, '');
    const buffer = Buffer.from(cleanBase64, 'base64');

    if (buffer.length > 5 * 1024 * 1024) {
      return res.status(400).json({ error: 'Image exceeds maximum size limit of 5 MB.' });
    }

    // Random unguessable ID
    const storageId = crypto.randomBytes(16).toString('hex');
    const safeName = (filename || 'photo.jpg').replace(/[^a-zA-Z0-9._-]/g, '_');
    const blobFilename = `uploads/${storageId}_${safeName}`;

    // If Vercel Blob is configured
    if (VERCEL_BLOB_TOKEN) {
      try {
        const { put } = require('@vercel/blob');
        const blob = await put(blobFilename, buffer, {
          access: 'public',
          token: VERCEL_BLOB_TOKEN,
          contentType: mime
        });
        return res.json({
          success: true,
          url: blob.url,
          storageId,
          name: blobFilename,
          storageType: 'vercel-blob'
        });
      } catch (blobErr) {
        console.warn('[Vercel Blob Upload Warning, falling back to local]', blobErr.message);
      }
    }

    // In-memory / local fallback store with 30-day auto-expiry
    uploadStore.set(storageId, {
      buffer,
      contentType: mime,
      filename: safeName,
      uploadedAt: Date.now()
    });

    // Prune entries older than 30 days
    const now = Date.now();
    for (const [id, item] of uploadStore.entries()) {
      if (now - item.uploadedAt > THIRTY_DAYS_MS) {
        uploadStore.delete(id);
      }
    }

    const localUrl = `/api/uploaded-photo/${storageId}`;
    return res.json({
      success: true,
      url: localUrl,
      storageId,
      name: safeName,
      storageType: 'local'
    });
  } catch (err) {
    console.error('[Upload Photo Error]', err);
    return res.status(500).json({ error: 'Failed to upload photo.' });
  }
});

// GET /api/uploaded-photo/:id
app.get('/api/uploaded-photo/:id', (req, res) => {
  const { id } = req.params;
  const item = uploadStore.get(id);
  if (!item) {
    return res.status(404).json({ error: 'Photo not found or expired.' });
  }
  res.setHeader('Content-Type', item.contentType || 'image/jpeg');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  return res.send(item.buffer);
});

// POST /api/delete-photo
app.post('/api/delete-photo', async (req, res) => {
  try {
    const { storageId, url } = req.body || {};
    if (storageId && uploadStore.has(storageId)) {
      uploadStore.delete(storageId);
    }
    if (url && VERCEL_BLOB_TOKEN && url.includes('.public.blob.vercel-storage.com')) {
      try {
        const { del } = require('@vercel/blob');
        await del(url, { token: VERCEL_BLOB_TOKEN });
      } catch (err) {
        console.warn('[Vercel Blob Delete Warning]', err.message);
      }
    }
    return res.json({ success: true });
  } catch (err) {
    console.error('[Delete Photo Error]', err);
    return res.status(500).json({ error: 'Failed to delete photo.' });
  }
});

// ──────────────────────────────────────────────
// Design System & Preview Renderer Module
// ──────────────────────────────────────────────
const {
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
} = require('./preview_renderer');

const THEMES = ALL_THEMES;

// ──────────────────────────────────────────────
// POST /api/generate-site — Store enriched data, return compressed token
// ──────────────────────────────────────────────
app.post('/api/generate-site', (req, res) => {
  try {
    const {
      name, type, address, phone, whatsappNumber, openingHours,
      coordinates, mapLink, enriched, menuItems, roomTypes,
      verifications, placeId, design,
      photoAssignments, rooms, menu, optionalFields,
      shortDescription, photos
    } = req.body || {};

    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'Business name is required.' });
    }

    const designChoice = (design || 'auto').trim();
    const resolvedPlaceId = placeId || enriched?.id || null;

    const candidatePhotos = (Array.isArray(photos) && photos.length > 0)
      ? photos
      : (Array.isArray(enriched?.photos) ? enriched.photos : []);

    // Build payload — all values HTML-escaped at render time
    const payload = {
      name: name.trim().slice(0, 200),
      type: (type || 'Restaurant').trim().slice(0, 50),
      address: address && address !== 'Not available' ? address.trim().slice(0, 300) : null,
      phone: phone && phone !== 'Not available' ? phone.trim().slice(0, 50) : null,
      whatsappNumber: whatsappNumber || null,
      openingHours: openingHours && openingHours !== 'Not available' ? openingHours.trim().slice(0, 500) : null,
      coordinates: coordinates?.lat && coordinates?.lon ? { lat: Number(coordinates.lat), lon: Number(coordinates.lon) } : null,
      mapLink: mapLink && mapLink !== 'Not available' ? mapLink.trim().slice(0, 500) : null,
      placeId: resolvedPlaceId,
      design: designChoice,
      // Enriched data from Google or editable field
      rating: enriched?.rating || null,
      reviewCount: enriched?.reviewCount || null,
      priceLevel: enriched?.priceLevel || null,
      editorialSummary: (shortDescription || enriched?.editorialSummary) ? String(shortDescription || enriched.editorialSummary).slice(0, 400) : null,
      features: enriched?.features || {},
      photos: candidatePhotos.slice(0, 12).map(p => {
        if (p.isOwnerProvided && p.url) {
          return {
            url: p.url,
            isOwnerProvided: true,
            widthPx: p.widthPx || 1600,
            heightPx: p.heightPx || 1200,
            authorAttributions: []
          };
        }
        return {
          name: p.name,
          widthPx: p.widthPx,
          heightPx: p.heightPx,
          authorAttributions: (p.authorAttributions || []).map(a => ({
            displayName: (a.displayName || 'Google Maps Contributor').slice(0, 60),
            uri: (a.uri || '').slice(0, 150)
          }))
        };
      }),
      reviews: Array.isArray(enriched?.reviews) ? enriched.reviews.slice(0, 5).map(r => ({
        authorName: (r.authorName || 'Guest').slice(0, 60),
        rating: r.rating || null,
        text: (r.text || '').slice(0, 280)
      })) : [],
      photosUnavailable: enriched?.photosUnavailable || false,
      // User-typed and extra items
      rooms: (Array.isArray(rooms) && rooms.length > 0 ? rooms : (Array.isArray(roomTypes) ? roomTypes : [])).slice(0, 12).map(r => ({
        name: (r.name || '').slice(0, 100),
        tariff: (r.tariff || '').slice(0, 50),
        size: (r.size || '').slice(0, 50),
        capacity: (r.capacity || '').slice(0, 50),
        bedType: (r.bedType || r.bed || '').slice(0, 50),
        amenities: (r.amenities || '').slice(0, 200),
        description: (r.description || r.desc || '').slice(0, 300),
        source: r.source || 'owner confirmed',
        photoIndex: typeof r.photoIndex === 'number' ? r.photoIndex : undefined
      })),
      menu: (Array.isArray(menu) && menu.length > 0 ? menu : (Array.isArray(menuItems) ? menuItems : [])).slice(0, 50).map(m => ({
        category: (m.category || 'General').slice(0, 50),
        name: (m.name || m.item || '').slice(0, 100),
        price: (m.price || '').slice(0, 30),
        vegNonVeg: (m.vegNonVeg || m.isVeg || '').slice(0, 20),
        description: (m.description || m.desc || '').slice(0, 200),
        source: m.source || 'owner confirmed'
      })),
      photoAssignments: (photoAssignments && typeof photoAssignments === 'object' && !Array.isArray(photoAssignments))
        ? photoAssignments
        : (Array.isArray(req.body.assignedPhotos)
          ? req.body.assignedPhotos.reduce((acc, p, idx) => { acc[idx] = { role: p.role || 'gallery', roomIndex: p.roomIndex || 0 }; return acc; }, {})
          : {}),
      optionalFields: optionalFields && typeof optionalFields === 'object' ? optionalFields : {},
      generatedDate: new Date().toISOString().split('T')[0]
    };

    // Code prefix encodes design choice
    const codePrefix = THEME_CODE_MAP[designChoice] || 'aut_';

    // Compress payload with zlib deflate then base64url
    const compressed = zlib.deflateSync(Buffer.from(JSON.stringify(payload), 'utf8')).toString('base64url');
    const token = codePrefix + compressed;

    // Enforce URL link length limit (12000 chars)
    if (token.length > 12000) {
      return res.status(400).json({
        error: 'Preview link size limit exceeded (' + token.length + ' chars > 12000). Please reduce photos, room descriptions, or menu items.'
      });
    }

    // Store in memory cache
    previewStore.set(token, { data: payload, createdAt: Date.now() });

    // Prune old tokens (>24h)
    const now = Date.now();
    for (const [k, v] of previewStore.entries()) {
      if (now - v.createdAt > 24 * 60 * 60 * 1000) previewStore.delete(k);
    }

    console.log(`[Generate Site] Token created for: ${payload.name} (${token.slice(0, 4)}, len=${token.length})`);
    return res.json({ success: true, token, previewUrl: `/preview/${token}`, name: payload.name });
  } catch (err) {
    console.error('[Generate Site Error]', err);
    return res.status(500).json({ error: 'Failed to generate website preview.' });
  }
});

// ──────────────────────────────────────────────
// Excel Export (now includes Rating, Business Status, Place ID, Types, Fetched At)
// ──────────────────────────────────────────────
app.post('/api/export', async (req, res) => {
  try {
    const { rows = [], location = 'results' } = req.body;

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Location Finder';
    workbook.created = new Date();

    const worksheet = workbook.addWorksheet('Places');
    worksheet.views = [{ state: 'frozen', xSplit: 0, ySplit: 1 }];

    worksheet.columns = [
      { header: 'Name', key: 'name', width: 28 },
      { header: 'Type', key: 'type', width: 14 },
      { header: 'Address', key: 'address', width: 45 },
      { header: 'Phone', key: 'phone', width: 22 },
      { header: 'Rating', key: 'rating', width: 12 },
      { header: 'Website', key: 'website', width: 35 },
      { header: 'Website Status', key: 'websiteStatus', width: 20 },
      { header: 'Opening Hours', key: 'openingHours', width: 25 },
      { header: 'Map Link', key: 'mapLink', width: 35 },
      { header: 'Business Status', key: 'businessStatus', width: 18 },
      { header: 'Place ID', key: 'placeId', width: 30 },
      { header: 'Google Types', key: 'types', width: 30 },
      { header: 'Data Fetched', key: 'fetchedAt', width: 22 }
    ];

    const headerRow = worksheet.getRow(1);
    headerRow.height = 28;
    headerRow.eachCell((cell) => {
      cell.font = { name: 'Calibri', bold: true, color: { argb: 'FFFFFF' }, size: 11 };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '1E293B' } };
      cell.alignment = { vertical: 'middle', horizontal: 'left' };
    });

    rows.forEach((row) => {
      const addedRow = worksheet.addRow({
        name: row.name || 'Not available',
        type: row.type || 'Not available',
        address: row.address || 'Not available',
        phone: row.phone ? formatIndianPhoneNumber(row.phone) : 'Not available',
        rating: row.rating || 'Not available',
        website: row.website || 'Not available',
        websiteStatus: row.websiteStatus || 'Not listed',
        openingHours: row.openingHours || 'Not available',
        mapLink: row.mapLink || 'Not available',
        businessStatus: row.businessStatus || 'Not available',
        placeId: row.placeId || 'Not available',
        types: Array.isArray(row.types) ? row.types.join(', ') : (row.types || 'Not available'),
        fetchedAt: row.fetchedAt || 'Not available'
      });

      addedRow.height = 22;
      addedRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: colNumber === 3 };
        cell.border = {
          top: { style: 'thin', color: { argb: 'E2E8F0' } },
          bottom: { style: 'thin', color: { argb: 'E2E8F0' } },
          left: { style: 'thin', color: { argb: 'E2E8F0' } },
          right: { style: 'thin', color: { argb: 'E2E8F0' } }
        };
      });

      const statusCell = addedRow.getCell('websiteStatus');
      const sv = row.websiteStatus || 'Not listed';
      if (sv === 'Active') {
        statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'DCFCE7' } };
        statusCell.font = { color: { argb: '166534' }, bold: true };
      } else if (sv === 'Active (restricted)') {
        statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEDD5' } };
        statusCell.font = { color: { argb: '9A3412' }, bold: true };
      } else if (sv === 'Inactive') {
        statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FEE2E2' } };
        statusCell.font = { color: { argb: '991B1B' }, bold: true };
      } else {
        statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F3F4F6' } };
        statusCell.font = { color: { argb: '4B5563' } };
      }

      const websiteCell = addedRow.getCell('website');
      if (row.websiteUri && row.websiteUri !== 'Not available') {
        websiteCell.value = { text: row.website || row.websiteUri, hyperlink: row.websiteUri };
        websiteCell.font = { color: { argb: '2563EB' }, underline: true };
      }

      const mapCell = addedRow.getCell('mapLink');
      if (row.mapLink && row.mapLink !== 'Not available') {
        mapCell.value = { text: 'View on Google Maps', hyperlink: row.mapLink };
        mapCell.font = { color: { argb: '2563EB' }, underline: true };
      }
    });

    worksheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 13 } };

    worksheet.columns.forEach((col) => {
      let maxLen = col.header ? col.header.length : 10;
      col.eachCell({ includeEmpty: false }, (cell) => {
        const val = cell.value;
        const strLen = typeof val === 'string' ? val.length : (val?.text?.length || 0);
        if (strLen > maxLen) maxLen = strLen;
      });
      col.width = Math.min(Math.max(maxLen + 4, 12), 60);
    });

    const sanitizedLoc = location.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_').substring(0, 30) || 'places';
    const dateStr = new Date().toISOString().split('T')[0];
    const filename = `places_${sanitizedLoc}_${dateStr}.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    await workbook.xlsx.write(res);
    res.end();

  } catch (err) {
    console.error('[Export Error]', err);
    res.status(500).json({ error: 'Failed to generate Excel file.' });
  }
});

// ──────────────────────────────────────────────
// GET /preview/:token
// ──────────────────────────────────────────────
app.get('/preview/:token', (req, res) => {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');

  const { token } = req.params;
  if (!token || typeof token !== 'string' || !/^[A-Za-z0-9_\-]{16,16000}$/.test(token)) {
    return res.status(400).send(renderErrorPage('Invalid preview token.'));
  }

  let data = null;
  const entry = previewStore.get(token);
  if (entry && entry.data) {
    data = entry.data;
  } else {
    try {
      const codePrefix = token.slice(0, 4);
      const rawToken = CODE_THEME_MAP[codePrefix] ? token.slice(4) : token;
      const inflated = zlib.inflateSync(Buffer.from(rawToken, 'base64url'));
      data = JSON.parse(inflated.toString('utf8'));
    } catch (err) {
      console.warn('[Preview Token Inflate Error]', err.message);
      return res.status(400).send(renderErrorPage('Invalid or malformed preview token. Please generate a new preview.'));
    }
  }

  if (!data) {
    return res.status(404).send(renderErrorPage('Preview not found or has expired. Please generate a new preview.'));
  }

  try {
    const codePrefix = token.slice(0, 4);
    const tokenDesign = CODE_THEME_MAP[codePrefix];
    const designOverride = (data.design && data.design !== 'auto') ? data.design : ((tokenDesign && tokenDesign !== 'auto') ? tokenDesign : 'auto');
    const html = renderPreviewHtml(data, designOverride);
    return res.send(html);
  } catch (err) {
    console.error('[Preview Render Error]', err);
    return res.status(500).send(renderErrorPage('Failed to render preview.'));
  }
});

// ──────────────────────────────────────────────
// robots.txt
// ──────────────────────────────────────────────
app.get('/robots.txt', (req, res) => {
  res.type('text/plain');
  res.send('User-agent: *\nDisallow: /preview\n');
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`[Server] Location Finder listening at http://localhost:${PORT}`);
  });
}

module.exports = app;
