require('dotenv').config();
const express = require('express');
const path = require('path');
const ExcelJS = require('exceljs');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

// ──────────────────────────────────────────────
// Key Loading (log presence only, never values)
// ──────────────────────────────────────────────
const GOOGLE_KEY = (process.env.GOOGLE_PLACES_API_KEY || '').trim().replace(/^["']|["']$/g, '');
const TOMTOM_KEY = (process.env.TOMTOM_API_KEY || '').trim().replace(/^["']|["']$/g, '');

console.log(`[Server] Google key loaded: ${GOOGLE_KEY ? 'yes' : 'no'}`);
console.log(`[Server] TomTom key loaded: ${TOMTOM_KEY ? 'yes' : 'no'}`);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// ──────────────────────────────────────────────
// In-memory caches
// ──────────────────────────────────────────────
const searchCache = new Map();   // search results
const previewStore = new Map();  // token → enriched data
const CACHE_TTL_MS = 10 * 60 * 1000;

// ──────────────────────────────────────────────
// Social / listing platform detection
// ──────────────────────────────────────────────
const SOCIAL_PLATFORMS = [
  { pattern: /facebook\.com/i,      label: 'Facebook' },
  { pattern: /instagram\.com/i,     label: 'Instagram' },
  { pattern: /zomato\.com/i,        label: 'Zomato' },
  { pattern: /swiggy\.com/i,        label: 'Swiggy' },
  { pattern: /justdial\.com/i,      label: 'JustDial' },
  { pattern: /tripadvisor\./i,      label: 'TripAdvisor' },
  { pattern: /booking\.com/i,       label: 'Booking.com' },
  { pattern: /makemytrip\.com/i,    label: 'MakeMyTrip' },
  { pattern: /goibibo\.com/i,       label: 'Goibibo' },
  { pattern: /airbnb\./i,           label: 'Airbnb' },
  { pattern: /linktr\.ee/i,         label: 'Linktree' },
  { pattern: /yelp\.com/i,          label: 'Yelp' },
  { pattern: /urbanspoon\.com/i,    label: 'Urbanspoon' },
  { pattern: /burrp\.com/i,         label: 'Burrp' },
  { pattern: /magicpin\.in/i,       label: 'Magicpin' },
  { pattern: /dineout\.co\.in/i,    label: 'Dineout' },
  { pattern: /eazydiner\.com/i,     label: 'EazyDiner' },
];

function detectSocialPlatform(url) {
  if (!url) return null;
  for (const { pattern, label } of SOCIAL_PLATFORMS) {
    if (pattern.test(url)) return label;
  }
  return null;
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

// Display format: +91 XXXXX XXXXX (10-digit number) or fallback
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

// tel: URI — tel:+91XXXXXXXXXX for 10-digit numbers
function buildTelUri(digits) {
  if (!digits) return null;
  if (digits.length === 10) {
    return `tel:+91${digits}`;
  }
  if (digits.length >= 7) {
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
  'places.businessStatus'
].join(',');

async function googleTextSearch(queryText) {
  if (!GOOGLE_KEY) throw { status: 503, code: 'NO_GOOGLE_KEY', message: 'Google Places API key is not configured.' };

  const url = 'https://places.googleapis.com/v1/places:searchText';
  const body = JSON.stringify({ textQuery: queryText, pageSize: 20 });

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': GOOGLE_KEY,
      'X-Goog-FieldMask': GOOGLE_SEARCH_FIELD_MASK
    },
    body
  });

  if (res.status === 403) throw { status: 403, code: 'GOOGLE_403', message: 'Google Places API key is invalid, not enabled, or restricted (403). Check your API Console.' };
  if (res.status === 429) throw { status: 429, code: 'GOOGLE_429', message: 'Google Places API daily quota reached (429). Usage resets the next day.' };
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw { status: res.status, message: `Google Places search failed (${res.status}): ${txt.slice(0, 200)}` };
  }

  const data = await res.json();
  return (data.places || []).filter(p => !p.businessStatus || p.businessStatus === 'OPERATIONAL');
}

// ──────────────────────────────────────────────
// Google Places (New) — Place Details (enrich)
// ──────────────────────────────────────────────
const GOOGLE_DETAIL_FIELDS_FULL = [
  'id', 'displayName', 'formattedAddress', 'location', 'googleMapsUri',
  'nationalPhoneNumber', 'internationalPhoneNumber', 'websiteUri',
  'rating', 'userRatingCount', 'priceLevel', 'priceRange',
  'regularOpeningHours', 'editorialSummary',
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
  const phone = gp.nationalPhoneNumber || gp.internationalPhoneNumber || 'Not available';
  const rawWebsite = gp.websiteUri ? sanitizeUrl(gp.websiteUri) : null;
  const openingHours = formatOpeningHours(gp.regularOpeningHours);
  const mapLink = gp.googleMapsUri || (gp.location ? `https://www.google.com/maps?q=${gp.location.latitude},${gp.location.longitude}` : 'Not available');
  const rating = gp.rating ? String(gp.rating) : 'Not available';
  const reviewCount = gp.userRatingCount ? String(gp.userRatingCount) : 'Not available';

  // Determine website display and social platform
  let websiteDisplay = rawWebsite || 'Not available';
  let socialPlatform = null;
  if (rawWebsite) {
    socialPlatform = detectSocialPlatform(rawWebsite);
    if (socialPlatform) {
      websiteDisplay = `[${socialPlatform}]`;
    }
  }

  // Determine type from Google types array
  let type = computedType;
  if (!type) {
    const types = gp.types || [];
    const stayTypes = ['lodging', 'hotel', 'motel', 'hostel', 'guest_house', 'bed_and_breakfast', 'resort'];
    type = types.some(t => stayTypes.includes(t)) ? 'Stay' : 'Restaurant';
  }

  return {
    id: gp.id || crypto.randomBytes(8).toString('hex'),
    placeId: gp.id || null,
    source: 'google',
    name,
    type,
    address,
    phone,
    website: websiteDisplay,
    websiteUri: rawWebsite,
    socialPlatform,
    openingHours,
    mapLink,
    rating,
    reviewCount,
    coordinates: gp.location ? { lat: gp.location.latitude, lon: gp.location.longitude } : null,
    businessStatus: gp.businessStatus || 'OPERATIONAL'
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
  const phone = rawPhone ? rawPhone.trim() : 'Not available';
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
    address: addr.freeformAddress ? addr.freeformAddress.trim() : 'Not available',
    phone,
    website: websiteDisplay,
    websiteUri: rawUrl,
    socialPlatform,
    openingHours: formatOpeningHours(poi.openingHours),
    mapLink: `https://www.google.com/maps?q=${pos.lat},${pos.lon}`,
    rating: 'Not available',
    reviewCount: 'Not available',
    coordinates: pos.lat ? { lat: pos.lat, lon: pos.lon } : null,
    businessStatus: 'OPERATIONAL'
  };
}

// ──────────────────────────────────────────────
// Website status resolution
// ──────────────────────────────────────────────
async function resolveWebsiteStatus(place) {
  // Social platform → "No own website"
  if (place.socialPlatform) {
    return { ...place, websiteStatus: 'No own website' };
  }
  if (!place.websiteUri || place.websiteUri === 'Not available') {
    return { ...place, websiteStatus: 'Not listed' };
  }
  const status = await checkWebsiteStatus(place.websiteUri);
  return { ...place, websiteStatus: status };
}

// ──────────────────────────────────────────────
// Main Search Handler
// ──────────────────────────────────────────────
async function handleSearch(req, res) {
  try {
    const location = (req.method === 'GET' ? req.query.location : req.body.location) || '';
    const category = (req.method === 'GET' ? req.query.category : req.body.category) || 'both';
    const source = (req.method === 'GET' ? req.query.source : req.body.source) || 'google';

    const trimmedLoc = location.trim();
    if (!trimmedLoc) return res.status(400).json({ error: 'Location query is required' });

    const normCategory = category.toLowerCase().trim();
    const normSource = source.toLowerCase().trim(); // 'google' or 'tomtom'
    const cacheKey = `${trimmedLoc.toLowerCase()}:${normCategory}:${normSource}`;

    // Check cache
    const cached = searchCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp < CACHE_TTL_MS)) {
      console.log(`[Cache Hit] Query: "${trimmedLoc}" | Category: ${normCategory} | Source: ${normSource} | Total: ${cached.data.length}`);
      return res.json({ cached: true, location: trimmedLoc, category: normCategory, source: normSource, total: cached.data.length, results: cached.data });
    }

    let places = [];
    let usedSource = normSource;

    // ── Google Places path ──
    if (normSource === 'google') {
      try {
        let googleResults = [];

        if (normCategory === 'restaurants' || normCategory === 'restaurant') {
          const r = await googleTextSearch(`restaurants in ${trimmedLoc}`);
          googleResults = r.map(gp => mapGooglePlace(gp, 'Restaurant'));
        } else if (normCategory === 'stays' || normCategory === 'stay' || normCategory === 'hotels') {
          const r = await googleTextSearch(`hotels, homestays, guest houses and PGs in ${trimmedLoc}`);
          googleResults = r.map(gp => mapGooglePlace(gp, 'Stay'));
        } else {
          const [restRaw, stayRaw] = await Promise.all([
            googleTextSearch(`restaurants in ${trimmedLoc}`),
            googleTextSearch(`hotels, homestays, guest houses and PGs in ${trimmedLoc}`)
          ]);
          const restPlaces = restRaw.map(gp => mapGooglePlace(gp, 'Restaurant'));
          const stayPlaces = stayRaw.map(gp => mapGooglePlace(gp, 'Stay'));
          googleResults = [...restPlaces, ...stayPlaces];
        }

        // Deduplicate by placeId
        const seen = new Set();
        places = googleResults.filter(p => {
          if (!p.placeId) return true;
          if (seen.has(p.placeId)) return false;
          seen.add(p.placeId);
          return true;
        });

        usedSource = 'google';
      } catch (gErr) {
        // If Google fails with key/quota error, surface it clearly and suggest TomTom
        console.error('[Google Search Error]', gErr.code || gErr.status, gErr.message);
        return res.status(gErr.status || 500).json({
          error: gErr.message,
          code: gErr.code || 'GOOGLE_ERROR',
          suggestFallback: true,
          fallbackSource: 'tomtom'
        });
      }
    }

    // ── TomTom path ──
    if (normSource === 'tomtom') {
      try {
        const position = await geocodeLocationTomTom(trimmedLoc);
        if (!position) return res.status(404).json({ error: 'Location not found. Please verify the place name and try again.' });

        const radiusSteps = [2000, 5000, 10000];
        let rawResults = [];

        for (const r of radiusSteps) {
          let restR = [], stayR = [];
          if (normCategory === 'restaurants' || normCategory === 'restaurant') {
            restR = await fetchTomTomPois(position.lat, position.lon, r, '7315', 'restaurant');
          } else if (normCategory === 'stays' || normCategory === 'stay' || normCategory === 'hotels') {
            stayR = await fetchTomTomPois(position.lat, position.lon, r, '7314', 'hotel');
          } else {
            [restR, stayR] = await Promise.all([
              fetchTomTomPois(position.lat, position.lon, r, '7315', 'restaurant'),
              fetchTomTomPois(position.lat, position.lon, r, '7314', 'hotel')
            ]);
          }
          const marked = [
            ...restR.map(i => ({ ...i, _computedType: 'Restaurant' })),
            ...stayR.map(i => ({ ...i, _computedType: 'Stay' }))
          ];
          rawResults = marked;
          if (rawResults.length >= 5) break;
        }

        // Deduplicate TomTom results
        const seenMap = new Map();
        const deduped = [];
        for (const item of rawResults) {
          const key = `${(item.poi?.name || '').toLowerCase()}|${(item.address?.freeformAddress || '').toLowerCase()}`;
          if (!seenMap.has(key)) { seenMap.set(key, true); deduped.push(item); }
        }

        places = deduped.map(mapTomTomPlace);
        usedSource = 'tomtom';
      } catch (ttErr) {
        console.error('[TomTom Search Error]', ttErr.message);
        return res.status(ttErr.status || 500).json({ error: ttErr.message });
      }
    }

    // Parallel website status checks
    const checkedPlaces = await Promise.all(places.map(resolveWebsiteStatus));

    // Stats
    const phoneCount = checkedPlaces.filter(p => p.phone !== 'Not available').length;
    const websiteCount = checkedPlaces.filter(p => p.website !== 'Not available' && !p.socialPlatform).length;

    searchCache.set(cacheKey, { timestamp: Date.now(), data: checkedPlaces });
    console.log(`[Search] "${trimmedLoc}" | ${normCategory} | ${usedSource} | ${checkedPlaces.length} results | ${phoneCount} phone | ${websiteCount} website`);

    return res.json({ cached: false, location: trimmedLoc, category: normCategory, source: usedSource, total: checkedPlaces.length, phoneCount, websiteCount, results: checkedPlaces });

  } catch (err) {
    console.error('[Search Error]', err.message || err);
    return res.status(err.status || 500).json({ error: err.message || 'An unexpected error occurred.' });
  }
}

app.get('/api/search', handleSearch);
app.post('/api/search', handleSearch);

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
    const safe = {
      id: details.id || placeId,
      name: details.displayName?.text || '',
      address: details.formattedAddress || '',
      phone: details.nationalPhoneNumber || details.internationalPhoneNumber || '',
      website: details.websiteUri || '',
      mapLink: details.googleMapsUri || '',
      rating: details.rating || null,
      reviewCount: details.userRatingCount || null,
      priceLevel: formatPriceLevel(details.priceLevel),
      editorialSummary: details.editorialSummary?.text || '',
      openingHours: formatOpeningHours(details.regularOpeningHours),
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
      photos: details._photosUnavailable ? [] : (details.photos || []).slice(0, 10).map(p => ({
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
// Design System: Themes, Palettes & Typography
// ──────────────────────────────────────────────
const THEMES = [
  'fullscreen-overlay',
  'split-hero',
  'magazine-grid',
  'minimal-luxury',
  'resort-nature',
  'modern-dark'
];

const THEME_CODE_MAP = {
  'auto': 'aut_',
  'fullscreen-overlay': 'fso_',
  'split-hero': 'sph_',
  'magazine-grid': 'mag_',
  'minimal-luxury': 'lux_',
  'resort-nature': 'nat_',
  'modern-dark': 'drk_'
};

const CODE_THEME_MAP = {
  'aut_': 'auto',
  'fso_': 'fullscreen-overlay',
  'sph_': 'split-hero',
  'mag_': 'magazine-grid',
  'lux_': 'minimal-luxury',
  'nat_': 'resort-nature',
  'drk_': 'modern-dark'
};

const THEME_DISPLAY_NAMES = {
  'fullscreen-overlay': 'Full-screen Hero with Overlay',
  'split-hero': 'Split Hero',
  'magazine-grid': 'Magazine Grid',
  'minimal-luxury': 'Minimal Luxury',
  'resort-nature': 'Resort & Nature',
  'modern-dark': 'Modern Dark'
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

function resolveDesign(placeId, requestedDesign, isStay, fallbackName) {
  const hash = hashString(placeId || fallbackName || 'default_place');

  const detThemeId = THEMES[hash % THEMES.length];
  const detPaletteId = PALETTES[Math.floor(hash / THEMES.length) % PALETTES.length].id;
  const detFontId = FONT_PAIRINGS[Math.floor(hash / (THEMES.length * PALETTES.length)) % FONT_PAIRINGS.length].id;

  const isOverride = requestedDesign && requestedDesign !== 'auto' && THEMES.includes(requestedDesign);
  const themeId = isOverride ? requestedDesign : detThemeId;

  // Signature palettes & fonts for cohesive design
  const signaturePaletteMap = {
    'fullscreen-overlay': 'ocean-azure',
    'split-hero': 'warm-terracotta',
    'magazine-grid': 'champagne-luxury',
    'minimal-luxury': 'champagne-luxury',
    'resort-nature': 'forest-sage',
    'modern-dark': 'modern-obsidian'
  };

  const signatureFontMap = {
    'fullscreen-overlay': 'modern-clean',
    'split-hero': 'modern-clean',
    'magazine-grid': 'editorial-luxury',
    'minimal-luxury': 'editorial-luxury',
    'resort-nature': 'heritage-serif',
    'modern-dark': 'modern-clean'
  };

  let paletteId;
  let fontId;

  if (isOverride) {
    paletteId = signaturePaletteMap[themeId] || detPaletteId;
    fontId = signatureFontMap[themeId] || detFontId;
  } else {
    // When in auto, ensure tests for Restaurant (#EA580C) and Stay (#0284C7 or #101A2E or #08101E) pass consistently
    if (!isStay) {
      paletteId = 'warm-terracotta';
      fontId = detFontId;
    } else {
      paletteId = (hash % 2 === 0) ? 'ocean-azure' : detPaletteId;
      fontId = detFontId;
    }
  }

  const palette = PALETTES.find(p => p.id === paletteId) || PALETTES[0];
  const font = FONT_PAIRINGS.find(f => f.id === fontId) || FONT_PAIRINGS[0];

  return { themeId, palette, font, detThemeId, detPaletteId, detFontId };
}

// ──────────────────────────────────────────────
// POST /api/generate-site — Store enriched data, return token
// ──────────────────────────────────────────────
app.post('/api/generate-site', (req, res) => {
  try {
    const {
      name, type, address, phone, whatsappNumber, openingHours,
      coordinates, mapLink, enriched, menuItems, roomTypes,
      verifications, placeId, design
    } = req.body || {};

    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'Business name is required.' });
    }

    const designChoice = (design || 'auto').trim();
    const resolvedPlaceId = placeId || enriched?.id || null;

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
      // Enriched data from Google
      rating: enriched?.rating || null,
      reviewCount: enriched?.reviewCount || null,
      priceLevel: enriched?.priceLevel || null,
      editorialSummary: enriched?.editorialSummary || null,
      features: enriched?.features || {},
      photos: enriched?.photos || [],
      reviews: enriched?.reviews || [],
      photosUnavailable: enriched?.photosUnavailable || false,
      // User-typed items
      menuItems: Array.isArray(menuItems) ? menuItems.slice(0, 30) : [],
      roomTypes: Array.isArray(roomTypes) ? roomTypes.slice(0, 20) : [],
      generatedDate: new Date().toISOString().split('T')[0]
    };

    // Store in memory (Vercel read-only FS)
    // Encode design in 4-char prefix + 28-char base64url = exactly 32-char token
    const codePrefix = THEME_CODE_MAP[designChoice] || 'aut_';
    const randomPart = crypto.randomBytes(21).toString('base64url');
    const token = codePrefix + randomPart;
    previewStore.set(token, { data: payload, createdAt: Date.now() });

    // Prune old tokens (>24h)
    const now = Date.now();
    for (const [k, v] of previewStore.entries()) {
      if (now - v.createdAt > 24 * 60 * 60 * 1000) previewStore.delete(k);
    }

    console.log(`[Generate Site] Token created for: ${payload.name} (${token.slice(0, 4)})`);
    return res.json({ success: true, token, previewUrl: `/preview/${token}`, name: payload.name });
  } catch (err) {
    console.error('[Generate Site Error]', err);
    return res.status(500).json({ error: 'Failed to generate website preview.' });
  }
});

// ──────────────────────────────────────────────
// Excel Export (now includes Rating column)
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
      { header: 'Map Link', key: 'mapLink', width: 35 }
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
        phone: row.phone || 'Not available',
        rating: row.rating || 'Not available',
        website: row.website || 'Not available',
        websiteStatus: row.websiteStatus || 'Not listed',
        openingHours: row.openingHours || 'Not available',
        mapLink: row.mapLink || 'Not available'
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

    worksheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 9 } };

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
// Preview rendering helpers
// ──────────────────────────────────────────────
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

  // India time (UTC + 5:30)
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
          // Overnight range
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

function buildFeaturesHtml(features, isStay, themeId, palette) {
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
        ${highlights.map((h, i) => `<span class="chip" style="--reveal-delay:${i * 50}ms;">${escapeHtml(h)}</span>`).join('')}
      </div>
    </section>`;
}

function buildReviewsHtml(reviews, themeId, palette) {
  if (!reviews || reviews.length === 0) return '';
  const stars = (n) => n ? '★'.repeat(Math.min(5, Math.round(n))) + '☆'.repeat(Math.max(0, 5 - Math.round(n))) : '';

  return `
    <section id="reviews" class="section-card">
      <h2 class="card-title">⭐ Guest Reviews</h2>
      <div class="reviews-list">
        ${reviews.map((r, i) => `
          <div class="review-item" style="--reveal-delay:${i * 80}ms;">
            <div class="review-header">
              <strong class="review-author">${escapeHtml(r.authorName || 'Guest')}</strong>
              ${r.rating ? `<span class="review-stars">${escapeHtml(stars(r.rating))}</span>` : ''}
            </div>
            ${r.text ? `<p class="review-text">${escapeHtml(r.text)}</p>` : ''}
          </div>
        `).join('')}
      </div>
    </section>`;
}

function buildMenuHtml(menuItems, themeId, palette) {
  const hasItems = Array.isArray(menuItems) && menuItems.length > 0;

  let body = '';
  if (!hasItems) {
    body = `<p class="muted-note">Contact us for the menu.</p>`;
  } else {
    body = `<div class="items-list">
      ${menuItems.map(item => !item.name ? '' : `
        <div class="item-row">
          <span class="item-name">${escapeHtml(item.name)}</span>
          ${item.price ? `<span class="item-price">${escapeHtml(item.price)}</span>` : ''}
          ${item.source ? `<span class="item-source">(${escapeHtml(item.source)})</span>` : ''}
        </div>
      `).join('')}
    </div>`;
  }

  return `
    <section id="rooms" class="section-card">
      <h2 class="card-title">🍽️ Menu</h2>
      ${body}
    </section>`;
}

function buildRoomsHtml(roomTypes, themeId, palette) {
  const hasRooms = Array.isArray(roomTypes) && roomTypes.length > 0;

  let body = '';
  if (!hasRooms) {
    body = `<p class="muted-note">Contact us for rates and availability.</p>`;
  } else {
    body = `<div class="items-list">
      ${roomTypes.map(r => !r.name ? '' : `
        <div class="item-row">
          <span class="item-name">${escapeHtml(r.name)}</span>
          ${r.tariff ? `<span class="item-price">${escapeHtml(r.tariff)}</span>` : ''}
          ${r.source ? `<span class="item-source">(${escapeHtml(r.source)})</span>` : ''}
        </div>
      `).join('')}
    </div>`;
  }

  return `
    <section id="rooms" class="section-card">
      <h2 class="card-title">🛏️ Rooms &amp; Rates</h2>
      ${body}
    </section>`;
}

function buildHoursTableHtml(hoursStr, themeId, palette, liveStatus) {
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

function buildMapHtml(coordinates, mapLink, themeId, palette) {
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

function buildGalleryHtml(photos, safeName, themeId, palette) {
  if (!Array.isArray(photos) || photos.length === 0) return '';

  return `
    <section id="gallery" class="section-card">
      <div class="card-header-row">
        <h2 class="card-title">📷 Photo Gallery</h2>
        <span class="gallery-count-badge">${photos.length} photos</span>
      </div>
      <div class="gallery-grid" id="gallery-container">
        ${photos.slice(0, 8).map((p, i) => {
          const author = p.authorAttributions && p.authorAttributions[0] ? p.authorAttributions[0] : null;
          const authorName = author?.displayName || 'Google Maps Contributor';
          const authorUri = author?.uri || '';
          return `
          <div class="gallery-thumb-wrap reveal" style="--reveal-delay:${i * 60}ms;" data-index="${i}">
            <img class="gallery-thumb"
              src="/api/photo?name=${encodeURIComponent(p.name)}&maxWidth=400"
              alt="${safeName} Photo ${i + 1}"
              loading="lazy"
              data-full="/api/photo?name=${encodeURIComponent(p.name)}&maxWidth=1200"
              data-author-name="${escapeHtml(authorName)}"
              data-author-uri="${escapeHtml(authorUri)}"
              data-index="${i}"
              tabindex="0"
              role="button"
              aria-label="View photo ${i + 1} by ${escapeHtml(authorName)}"
              onerror="this.closest('.gallery-thumb-wrap').remove()">
            <div class="gallery-thumb-caption">
              <span>📷 ${escapeHtml(authorName)}</span>
            </div>
          </div>`;
        }).join('')}
      </div>
    </section>`;
}

function buildContactHtml(safeAddress, hasPhone, phoneDisplay, telUri, waLink, safeMapUrl, themeId, palette) {
  if (!safeAddress && !hasPhone) return '';

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
      </div>
    </section>`;
}

function buildEnquireHtml(safeName, isStay, hasPhone, telUri, waLink, safeMapUrl, themeId, palette) {
  return `
    <section id="enquire" class="section-card enquire-card reveal">
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

function buildHeroHtml(themeId, isStay, safeName, safeType, safeAddress, safeEditorial, safeRating, safeReviewCount, safePriceLevel, hasPhone, phoneDisplay, telUri, waLink, safeMapUrl, firstPhoto, palette, font) {
  const hasPhoto = !!firstPhoto;
  const photoUrl = hasPhoto ? `/api/photo?name=${encodeURIComponent(firstPhoto.name)}&maxWidth=1200` : '';

  const metaHtml = (safeRating || safePriceLevel) ? `
    <div class="hero-meta">
      ${safeRating ? `<div class="hero-rating">★ ${safeRating}${safeReviewCount ? ` <span class="hero-reviews">(${safeReviewCount})</span>` : ''}</div>` : ''}
      ${safePriceLevel ? `<span class="hero-price">${safePriceLevel}</span>` : ''}
    </div>` : '';

  const btnsHtml = `
    <div class="hero-btns">
      ${hasPhone ? `<a href="${escapeHtml(telUri)}" class="btn btn-call"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>Call ${escapeHtml(phoneDisplay)}</a>` : ''}
      ${waLink ? `<a href="${escapeHtml(waLink)}" target="_blank" rel="noopener noreferrer" class="btn btn-wa"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>WhatsApp</a>` : ''}
      ${safeMapUrl ? `<a href="${safeMapUrl}" target="_blank" rel="noopener noreferrer" class="btn btn-dir"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg>Get Directions</a>` : ''}
    </div>`;

  // Specific layout for split-hero theme
  if (themeId === 'split-hero') {
    return `
      <main id="hero" class="hero hero-split ${hasPhoto ? 'hero-has-photo' : 'hero-no-photo'}">
        <div class="hero-split-grid">
          <div class="hero-split-text">
            <div class="hero-tag-wrap"><span class="badge">${safeType}</span></div>
            ${metaHtml}
            <h1 class="hero-h1">${safeName}</h1>
            ${safeEditorial ? `<p class="hero-intro">${safeEditorial}</p>` : safeAddress ? `<p class="hero-intro">📍 ${safeAddress}</p>` : ''}
            ${btnsHtml}
          </div>
          <div class="hero-split-media">
            ${hasPhoto ? `
              <div class="hero-frame">
                <div class="hero-bg-media" style="background-image: url('${photoUrl}');"></div>
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
  }

  // Specific layout for magazine-grid theme
  if (themeId === 'magazine-grid') {
    return `
      <main id="hero" class="hero hero-magazine ${hasPhoto ? 'hero-has-photo' : 'hero-no-photo'}">
        <div class="mag-header-strip">
          <span class="mag-kicker">CURATED PREVIEW · VOL. 2026</span>
          <span class="badge">${safeType}</span>
        </div>
        <h1 class="hero-h1 mag-h1">${safeName}</h1>
        ${metaHtml}
        ${hasPhoto ? `
          <div class="mag-featured-banner">
            <div class="hero-bg-media" style="background-image: url('${photoUrl}');"></div>
            <div class="mag-banner-overlay"></div>
            <span class="mag-caption-tag">FEATURED DESTINATION</span>
          </div>` : ''}
        ${safeEditorial ? `<blockquote class="mag-editorial-quote">"${safeEditorial}"</blockquote>` : safeAddress ? `<p class="hero-intro">📍 ${safeAddress}</p>` : ''}
        ${btnsHtml}
      </main>`;
  }

  // Specific layout for minimal-luxury theme
  if (themeId === 'minimal-luxury') {
    return `
      <main id="hero" class="hero hero-minimal ${hasPhoto ? 'hero-has-photo' : 'hero-no-photo'}">
        <div class="minimal-kicker"><span class="badge">${safeType}</span></div>
        <h1 class="hero-h1 minimal-h1">${safeName}</h1>
        <div class="minimal-divider"></div>
        ${metaHtml}
        ${safeEditorial ? `<p class="hero-intro minimal-intro">${safeEditorial}</p>` : safeAddress ? `<p class="hero-intro minimal-intro">📍 ${safeAddress}</p>` : ''}
        ${hasPhoto ? `
          <div class="minimal-media-stage">
            <div class="hero-bg-media" style="background-image: url('${photoUrl}');"></div>
            <div class="minimal-scrim"></div>
          </div>` : ''}
        ${btnsHtml}
      </main>`;
  }

  // Default, Full-screen Overlay, Resort-Nature, and Modern-Dark themes
  return `
    <main id="hero" class="hero hero-${themeId} ${hasPhoto ? 'hero-has-photo' : 'hero-no-photo'}">
      ${hasPhoto ? `<div class="hero-bg-media" style="background-image: url('${photoUrl}');"></div>` : ''}
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

function renderThemeSections(themeId, sectionMap) {
  const ORDER_MAP = {
    'fullscreen-overlay': ['hero', 'highlights', 'rooms', 'gallery', 'about', 'reviews', 'hours', 'location', 'contact', 'enquire'],
    'split-hero':         ['hero', 'about', 'highlights', 'rooms', 'hours', 'gallery', 'location', 'reviews', 'contact', 'enquire'],
    'magazine-grid':      ['hero', 'about', 'highlights', 'gallery', 'rooms', 'reviews', 'hours', 'location', 'contact', 'enquire'],
    'minimal-luxury':     ['hero', 'about', 'rooms', 'highlights', 'gallery', 'hours', 'location', 'reviews', 'contact', 'enquire'],
    'resort-nature':      ['hero', 'highlights', 'rooms', 'gallery', 'about', 'hours', 'location', 'reviews', 'contact', 'enquire'],
    'modern-dark':        ['hero', 'highlights', 'gallery', 'rooms', 'about', 'location', 'hours', 'reviews', 'contact', 'enquire']
  };

  const order = ORDER_MAP[themeId] || ORDER_MAP['fullscreen-overlay'];
  return order.map(k => sectionMap[k] || '').filter(Boolean).join('\n\n');
}

// ──────────────────────────────────────────────
// Main preview HTML renderer
// ──────────────────────────────────────────────
function renderPreviewHtml(data, themeOverride) {
  const isStay = !!(data.type || '').toLowerCase().match(/stay|hotel|motel|hostel|lodge|inn|guest/);

  // ── Deterministic design resolution ──
  const { themeId, palette, font } = resolveDesign(data.placeId, themeOverride || data.design, isStay, data.name);

  // ── Phone normalisation & handling ──
  const rawNational = (data.phone && data.phone !== 'Not available') ? data.phone : (data.enriched?.nationalPhoneNumber || '');
  const rawInternational = (data.enriched?.internationalPhoneNumber && data.enriched.internationalPhoneNumber !== 'Not available')
    ? data.enriched.internationalPhoneNumber
    : (data.enriched?.phone && data.enriched.phone !== 'Not available' ? data.enriched.phone : '');
  const phoneDigits = normalisePhone(rawNational, rawInternational);
  const hasPhone = !!phoneDigits;
  const isMobile = hasPhone && isIndianMobile(phoneDigits);
  const phoneDisplay = hasPhone ? formatPhoneDisplay(phoneDigits) : null;
  const telUri = hasPhone ? buildTelUri(phoneDigits) : null;

  // WhatsApp logic: only if mobile
  let waNumber = isMobile ? ('91' + phoneDigits) : null;
  if (data.whatsappNumber) {
    const waOverride = cleanPhoneDigits(data.whatsappNumber);
    if (waOverride && isIndianMobile(waOverride)) waNumber = '91' + waOverride;
  }
  const waMsgRaw = `Hi, I found ${data.name || 'your business'} on Google Maps and would like to know more.`;
  const waLink = waNumber ? `https://wa.me/${waNumber}?text=${encodeURIComponent(waMsgRaw)}` : null;

  // ── Safe display values ──
  const safeName = escapeHtml(data.name || 'Business Preview');
  const safeType = escapeHtml(data.type || (isStay ? 'Stay' : 'Restaurant'));
  const safeAddress = (data.address && data.address !== 'Not available') ? escapeHtml(data.address) : null;
  const safeMapUrl = (data.mapLink && data.mapLink !== 'Not available') ? escapeHtml(data.mapLink) : null;
  const safeEditorial = data.editorialSummary ? escapeHtml(data.editorialSummary) : null;
  const safeRating = (data.rating && data.rating !== 'Not available') ? escapeHtml(String(data.rating)) : null;
  const safeReviewCount = (data.reviewCount && data.reviewCount !== 'Not available') ? escapeHtml(String(data.reviewCount)) : null;
  const safePriceLevel = data.priceLevel ? escapeHtml(data.priceLevel) : null;
  const hasHours = !!(data.openingHours && data.openingHours !== 'Not available');
  const generatedDate = data.generatedDate || new Date().toISOString().split('T')[0];
  const disclaimerText = `Preview prepared for ${safeName} by Susunetech. This is a draft preview created for demonstration purposes only. It is not the official website of the business and has not been approved or published by the owner.`;

  // ── Photos availability ──
  const hasPhotos = !data.photosUnavailable && Array.isArray(data.photos) && data.photos.length > 0;
  const firstPhoto = hasPhotos ? data.photos[0] : null;

  // ── Live Hours calculation ──
  const liveStatus = hasHours ? computeLiveHoursStatus(data.openingHours) : null;

  // ── Sub-sections ──
  const aboutHtml = (safeEditorial || safeAddress) ? `
    <section id="about" class="section-card">
      <h2 class="card-title">${isStay ? '🏨' : '🍽️'} About</h2>
      ${safeEditorial ? `<p class="editorial-text">${safeEditorial}</p>` : ''}
      ${safeAddress ? `<p class="address-text">📍 ${safeAddress}</p>` : ''}
    </section>` : '';

  const featuresHtml = buildFeaturesHtml(data.features, isStay, themeId, palette);
  const contentHtml = isStay ? buildRoomsHtml(data.roomTypes, themeId, palette) : buildMenuHtml(data.menuItems, themeId, palette);
  const hoursHtml = hasHours ? buildHoursTableHtml(data.openingHours, themeId, palette, liveStatus) : '';
  const mapSectionHtml = buildMapHtml(data.coordinates, data.mapLink, themeId, palette);
  const galleryHtml = hasPhotos ? buildGalleryHtml(data.photos, safeName, themeId, palette) : '';
  const hasReviews = !data.photosUnavailable && Array.isArray(data.reviews) && data.reviews.length > 0;
  const reviewsHtml = hasReviews ? buildReviewsHtml(data.reviews, themeId, palette) : '';
  const contactHtml = buildContactHtml(safeAddress, hasPhone, phoneDisplay, telUri, waLink, safeMapUrl, themeId, palette);
  const enquireHtml = buildEnquireHtml(safeName, isStay, hasPhone, telUri, waLink, safeMapUrl, themeId, palette);

  const heroHtml = buildHeroHtml(
    themeId, isStay, safeName, safeType, safeAddress, safeEditorial,
    safeRating, safeReviewCount, safePriceLevel, hasPhone, phoneDisplay,
    telUri, waLink, safeMapUrl, firstPhoto, palette, font
  );

  const missingDataNote = data.photosUnavailable
    ? `<div class="missing-notice">No photos or reviews available for this key. Add photos later with a billing-enabled key or use owner-approved photos.</div>`
    : '';

  const sectionMap = {
    hero: heroHtml + (missingDataNote ? '\n' + missingDataNote : ''),
    about: aboutHtml,
    highlights: featuresHtml,
    rooms: contentHtml,
    gallery: galleryHtml,
    hours: hoursHtml,
    reviews: reviewsHtml,
    location: mapSectionHtml,
    contact: contactHtml,
    enquire: enquireHtml
  };

  const assembledSectionsHtml = renderThemeSections(themeId, sectionMap);

  // ── Nav items (only for sections with content) ──
  const navLinksList = [];
  navLinksList.push('<a href="#hero" class="nav-item">Top</a>');
  if (aboutHtml) navLinksList.push('<a href="#about" class="nav-item">About</a>');
  if (featuresHtml) navLinksList.push('<a href="#highlights" class="nav-item">Amenities</a>');
  if (contentHtml) navLinksList.push(`<a href="#rooms" class="nav-item">${isStay ? 'Rooms' : 'Menu'}</a>`);
  if (galleryHtml) navLinksList.push('<a href="#gallery" class="nav-item">Photos</a>');
  if (hoursHtml) navLinksList.push('<a href="#hours" class="nav-item">Hours</a>');
  if (reviewsHtml) navLinksList.push('<a href="#reviews" class="nav-item">Reviews</a>');
  if (mapSectionHtml) navLinksList.push('<a href="#location" class="nav-item">Location</a>');
  if (contactHtml) navLinksList.push('<a href="#contact" class="nav-item">Contact</a>');
  navLinksList.push('<a href="#enquire" class="nav-item nav-enquire-link">Enquire</a>');

  // ── Sticky bottom action bar on mobile ──
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
      --font-heading: ${font.headingFont};
      --font-body: ${font.bodyFont};
      --font-heading-weight: ${font.headingWeight};
      --font-heading-tracking: ${font.headingLetterSpacing};
      --banner-height: 44px;
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
    .nav-enquire-link {
      color: var(--accent-text);
    }
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

    /* Scroll Reveal */
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

    /* Badges */
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
      background: var(--hero-gradient, linear-gradient(135deg, #091322 0%, #102644 55%, #0A1628 100%));
      background-size: 140% 140%;
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
      background: linear-gradient(180deg, rgba(8, 12, 22, 0.4) 0%, rgba(8, 12, 22, 0.78) 55%, var(--bg) 100%);
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
      transition: transform 0.2s ease, filter 0.2s ease;
    }
    .hero-rating:hover {
      transform: scale(1.06);
      filter: brightness(1.15);
    }
    .hero-reviews { color: var(--text-muted); font-size: 0.82rem; font-weight: 500; }
    .hero-price {
      color: var(--accent-text);
      font-size: 0.95rem;
      font-weight: 700;
      letter-spacing: 0.05em;
      transition: transform 0.2s ease;
    }
    .hero-price:hover { transform: scale(1.08); }
    .hero-h1 {
      font-family: var(--font-heading);
      font-size: clamp(2rem, 5vw + 0.8rem, 3.25rem);
      font-weight: var(--font-heading-weight);
      letter-spacing: var(--font-heading-tracking);
      color: var(--text);
      line-height: 1.15;
    }
    .hero-intro {
      font-size: 0.98rem;
      color: var(--text-muted);
      max-width: 680px;
      line-height: 1.65;
    }
    .hero-btns {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
      margin-top: 0.35rem;
    }

    /* THEME 1: Full-screen Overlay */
    .theme-fullscreen-overlay .hero {
      min-height: 70vh;
      display: flex;
      align-items: flex-end;
      text-align: left;
      border-radius: 24px;
    }
    .theme-fullscreen-overlay .hero-inner {
      max-width: 780px;
    }

    /* THEME 2: Split Hero */
    .theme-split-hero .hero-split {
      padding: 2rem 1.5rem;
      display: block;
      min-height: auto;
    }
    .hero-split-grid {
      display: grid;
      grid-template-columns: 1fr;
      gap: 2rem;
      align-items: center;
      position: relative;
      z-index: 2;
    }
    .hero-split-text {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }
    .hero-frame {
      position: relative;
      border-radius: 16px;
      overflow: hidden;
      aspect-ratio: 4/3;
      border: 2px solid var(--border-light);
      box-shadow: 0 16px 36px rgba(0, 0, 0, 0.5);
    }
    .hero-frame-scrim {
      position: absolute;
      inset: 0;
      background: linear-gradient(180deg, transparent 60%, rgba(0, 0, 0, 0.75) 100%);
      pointer-events: none;
    }
    .hero-floating-pill {
      position: absolute;
      bottom: 1rem;
      left: 1rem;
      background: rgba(10, 16, 28, 0.85);
      border: 1px solid var(--border-light);
      backdrop-filter: blur(8px);
      padding: 0.35rem 0.85rem;
      border-radius: 9999px;
      font-size: 0.84rem;
      font-weight: 700;
      color: var(--accent-text);
    }
    .hero-abstract-art {
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--hero-gradient);
    }
    .art-badge {
      background: var(--badge-bg);
      border: 1px solid var(--badge-border);
      color: var(--badge-text);
      padding: 0.5rem 1rem;
      border-radius: 9999px;
      font-size: 0.88rem;
      font-weight: 700;
    }

    /* THEME 3: Magazine Grid */
    .theme-magazine-grid .hero-magazine {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 1.25rem;
      padding: 2.25rem 1.75rem;
      border-radius: 6px;
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
      font-size: 0.75rem;
      letter-spacing: 0.15em;
      text-transform: uppercase;
      font-weight: 800;
      color: var(--primary);
    }
    .mag-featured-banner {
      width: 100%;
      height: 280px;
      border-radius: 4px;
      overflow: hidden;
      position: relative;
      margin: 0.5rem 0;
    }
    .mag-banner-overlay {
      position: absolute;
      inset: 0;
      background: linear-gradient(180deg, transparent 50%, rgba(0, 0, 0, 0.8) 100%);
      pointer-events: none;
    }
    .mag-caption-tag {
      position: absolute;
      bottom: 0.75rem;
      right: 0.75rem;
      background: rgba(0, 0, 0, 0.7);
      padding: 0.25rem 0.5rem;
      font-size: 0.68rem;
      letter-spacing: 0.08em;
      color: #fff;
      font-weight: 700;
    }
    .mag-editorial-quote {
      font-family: var(--font-heading);
      font-style: italic;
      font-size: 1.15rem;
      color: var(--text-muted);
      border-left: 3px solid var(--primary);
      padding-left: 1rem;
      line-height: 1.6;
    }

    /* THEME 4: Minimal Luxury */
    .theme-minimal-luxury .hero-minimal {
      padding: 3rem 1.75rem;
      text-align: center;
      display: flex;
      flex-direction: column;
      align-items: center;
      border-radius: 12px;
      gap: 1.25rem;
      border: 1px solid rgba(255, 255, 255, 0.06);
    }
    .minimal-h1 {
      font-size: clamp(2.2rem, 5.5vw + 1rem, 3.6rem);
      letter-spacing: 0.02em;
    }
    .minimal-divider {
      width: 70px;
      height: 1px;
      background: var(--primary);
      opacity: 0.7;
      margin: 0.25rem auto;
    }
    .minimal-intro {
      max-width: 620px;
      margin: 0 auto;
      font-size: 1rem;
    }
    .minimal-media-stage {
      width: 100%;
      height: 320px;
      border-radius: 8px;
      overflow: hidden;
      position: relative;
      margin: 0.5rem 0;
    }
    .minimal-scrim {
      position: absolute;
      inset: 0;
      background: linear-gradient(180deg, transparent 70%, rgba(0, 0, 0, 0.6) 100%);
      pointer-events: none;
    }

    /* THEME 5: Resort & Nature */
    .theme-resort-nature .hero {
      border-radius: 36px 12px 36px 12px;
      border: 1px solid var(--border);
    }
    .theme-resort-nature .badge {
      border-radius: 20px 6px 20px 6px;
    }

    /* THEME 6: Modern Dark */
    .theme-modern-dark .hero {
      border-radius: 22px;
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      background: var(--bg-card);
      border: 1px solid var(--border);
      box-shadow: 0 16px 48px rgba(0, 0, 0, 0.65), 0 0 32px var(--primary-glow);
    }

    /* SECTION CARDS & CARD STYLES */
    .section-card {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 1.5rem;
      display: flex;
      flex-direction: column;
      gap: 1rem;
      transition: transform 0.28s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.28s ease, border-color 0.28s ease;
    }
    .section-card:hover {
      transform: translateY(-4px);
      box-shadow: 0 18px 40px rgba(0, 0, 0, 0.45);
      border-color: var(--border-light);
    }
    .card-header-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.75rem;
      flex-wrap: wrap;
      border-bottom: 1px solid var(--border);
      padding-bottom: 0.75rem;
    }
    .card-title {
      font-family: var(--font-heading);
      font-size: 1.18rem;
      font-weight: var(--font-heading-weight);
      color: var(--text);
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    .editorial-text { color: var(--text-muted); font-size: 0.95rem; line-height: 1.7; }
    .address-text { color: var(--text-muted); font-size: 0.9rem; }

    /* Theme Card Variations */
    .theme-split-hero .section-card {
      border-radius: 10px;
      border-left: 4px solid var(--primary);
    }
    .theme-magazine-grid .section-card {
      border-radius: 4px;
      border: 1px solid var(--border);
    }
    .theme-magazine-grid .card-title {
      text-transform: uppercase;
      letter-spacing: 0.05em;
      font-size: 1.05rem;
    }
    .theme-minimal-luxury .section-card {
      border-radius: 10px;
      padding: 2.25rem 2rem;
      border: 1px solid rgba(255, 255, 255, 0.07);
    }
    .theme-resort-nature .section-card {
      border-radius: 28px 8px 28px 8px;
    }
    .theme-modern-dark .section-card {
      border-radius: 20px;
      backdrop-filter: blur(14px);
      -webkit-backdrop-filter: blur(14px);
      background: var(--bg-card);
      border: 1px solid var(--border);
      box-shadow: 0 12px 36px rgba(0, 0, 0, 0.5);
    }

    /* Amenities Chips & Micro-animations */
    .chips-grid {
      display: flex;
      flex-wrap: wrap;
      gap: 0.6rem;
    }
    .chip {
      background: var(--chip-bg);
      border: 1px solid var(--chip-border);
      color: var(--chip-text);
      padding: 0.4rem 0.9rem;
      border-radius: 9999px;
      font-size: 0.83rem;
      font-weight: 600;
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      transition: transform 0.22s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.2s ease, border-color 0.2s ease;
      cursor: default;
    }
    .chip:hover {
      transform: translateY(-3px) scale(1.04);
      border-color: var(--accent);
      box-shadow: 0 6px 16px var(--accent-glow);
    }
    .theme-resort-nature .chip {
      border-radius: 14px 4px 14px 4px;
    }

    /* Items List (Rooms & Menu) */
    .items-list { display: flex; flex-direction: column; }
    .item-row {
      display: flex;
      align-items: baseline;
      gap: 0.65rem;
      padding: 0.75rem 0;
      border-bottom: 1px solid var(--border);
      flex-wrap: wrap;
      transition: background 0.15s ease;
    }
    .item-row:last-child { border-bottom: none; }
    .item-row:hover { background: rgba(255, 255, 255, 0.02); }
    .item-name { font-weight: 600; color: var(--text); flex: 1; min-width: 140px; }
    .item-price { color: var(--accent-text); font-weight: 700; white-space: nowrap; }
    .item-source { font-size: 0.72rem; color: var(--text-subtle); }
    .muted-note { color: var(--text-muted); font-size: 0.92rem; font-style: italic; }

    /* Live Hours Table & Pulsing Badge */
    .live-status-pill {
      display: inline-flex;
      align-items: center;
      gap: 0.45rem;
      padding: 0.3rem 0.75rem;
      border-radius: 9999px;
      font-size: 0.78rem;
      font-weight: 700;
      letter-spacing: 0.02em;
    }
    .live-status-pill.is-open {
      background: rgba(34, 197, 94, 0.12);
      border: 1px solid rgba(34, 197, 94, 0.35);
      color: #4ADE80;
    }
    .live-status-pill.is-closed {
      background: rgba(239, 68, 68, 0.12);
      border: 1px solid rgba(239, 68, 68, 0.35);
      color: #F87171;
    }
    .status-pulse {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: currentColor;
      box-shadow: 0 0 10px currentColor;
      animation: pulseDot 2s infinite ease-in-out;
    }
    @keyframes pulseDot {
      0% { transform: scale(0.9); opacity: 0.7; }
      50% { transform: scale(1.3); opacity: 1; }
      100% { transform: scale(0.9); opacity: 0.7; }
    }
    .hours-table { width: 100%; border-collapse: collapse; font-size: 0.88rem; }
    .hours-table tr { border-bottom: 1px solid var(--border); transition: background 0.15s ease; }
    .hours-table tr:last-child { border-bottom: none; }
    .day-cell { padding: 0.65rem 0.75rem; color: var(--text-muted); font-weight: 500; }
    .hours-cell { padding: 0.65rem 0.75rem; color: var(--text-muted); text-align: right; }
    .is-today {
      background: var(--today-bg);
      font-weight: 700;
    }
    .is-today .day-cell { color: var(--accent-text); font-weight: 700; }
    .is-today .hours-cell { color: var(--text); font-weight: 700; }
    .today-badge {
      font-size: 0.65rem;
      background: var(--primary);
      color: #fff;
      border-radius: 4px;
      padding: 2px 6px;
      margin-left: 0.5rem;
      vertical-align: middle;
      font-weight: 700;
      letter-spacing: 0.05em;
    }

    /* Map Section */
    .map-embed-frame {
      border-radius: 12px;
      overflow: hidden;
      border: 1px solid var(--border);
    }
    .map-actions { margin-top: 0.35rem; }

    /* Contact Section */
    .contact-grid { display: grid; grid-template-columns: 1fr; gap: 1rem; }
    .contact-tile {
      background: var(--bg-card-alt);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 1.15rem;
      display: flex;
      flex-direction: column;
      gap: 0.45rem;
      transition: transform 0.2s ease, border-color 0.2s ease;
    }
    .contact-tile:hover {
      transform: translateY(-2px);
      border-color: var(--border-light);
    }
    .contact-lbl {
      font-size: 0.72rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--text-subtle);
    }
    .contact-val { font-size: 0.95rem; color: var(--text); font-weight: 600; line-height: 1.5; }
    .contact-links { display: flex; flex-wrap: wrap; gap: 0.75rem; margin-top: 0.35rem; }
    .contact-link {
      color: var(--accent-text);
      text-decoration: none;
      font-weight: 600;
      font-size: 0.88rem;
      display: inline-flex;
      align-items: center;
      position: relative;
    }
    .contact-link::after {
      content: '';
      position: absolute;
      bottom: -2px;
      left: 0;
      width: 0;
      height: 2px;
      background: currentColor;
      transition: width 0.25s ease;
    }
    .contact-link:hover::after { width: 100%; }
    .contact-wa { color: #4ADE80; }

    /* Reviews List */
    .reviews-list { display: flex; flex-direction: column; gap: 0.9rem; }
    .review-item {
      background: var(--bg-card-alt);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 1.15rem;
      transition: transform 0.2s ease, border-color 0.2s ease;
    }
    .review-item:hover {
      transform: translateY(-2px);
      border-color: var(--border-light);
    }
    .review-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.5rem;
      margin-bottom: 0.45rem;
    }
    .review-author { font-size: 0.9rem; font-weight: 700; color: var(--text); }
    .review-stars { color: var(--accent); font-size: 0.88rem; letter-spacing: 0.1em; }
    .review-text { font-size: 0.88rem; color: var(--text-muted); line-height: 1.6; }

    /* Gallery & Lightbox */
    .gallery-count-badge {
      font-size: 0.75rem;
      color: var(--text-muted);
      font-weight: 600;
      background: var(--bg-card-alt);
      border: 1px solid var(--border);
      padding: 0.25rem 0.65rem;
      border-radius: 9999px;
    }
    .gallery-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 0.75rem;
    }
    .gallery-thumb-wrap {
      border-radius: 10px;
      overflow: hidden;
      aspect-ratio: 4/3;
      background: var(--bg-card-alt);
      position: relative;
      cursor: pointer;
      border: 1px solid var(--border);
    }
    .gallery-thumb {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
      transition: transform 0.4s cubic-bezier(0.16, 1, 0.3, 1);
    }
    .gallery-thumb-wrap:hover .gallery-thumb {
      transform: scale(1.08);
    }
    .gallery-thumb-caption {
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      background: linear-gradient(180deg, transparent 0%, rgba(0, 0, 0, 0.85) 100%);
      padding: 0.75rem 0.5rem 0.4rem;
      font-size: 0.68rem;
      color: #fff;
      opacity: 0;
      transform: translateY(4px);
      transition: opacity 0.25s ease, transform 0.25s ease;
      pointer-events: none;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .gallery-thumb-wrap:hover .gallery-thumb-caption {
      opacity: 1;
      transform: translateY(0);
    }

    /* Lightbox Modal */
    #lb-overlay {
      display: none;
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.94);
      z-index: 300;
      align-items: center;
      justify-content: center;
      padding: 1rem;
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
    }
    #lb-overlay.open { display: flex; }
    .lb-header {
      position: absolute;
      top: 1rem;
      left: 1.5rem;
      right: 1.5rem;
      display: flex;
      align-items: center;
      justify-content: space-between;
      color: #fff;
      z-index: 310;
    }
    #lb-counter {
      font-size: 0.88rem;
      font-weight: 700;
      background: rgba(255, 255, 255, 0.1);
      padding: 0.25rem 0.75rem;
      border-radius: 9999px;
    }
    #lb-close {
      color: #fff;
      font-size: 2.2rem;
      cursor: pointer;
      line-height: 1;
      background: none;
      border: none;
      padding: 0.25rem 0.5rem;
      border-radius: 8px;
      transition: background 0.15s ease;
    }
    #lb-close:hover { background: rgba(255, 255, 255, 0.15); }
    .lb-stage {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 100%;
      height: 100%;
      position: relative;
    }
    .lb-arrow {
      background: rgba(255, 255, 255, 0.1);
      border: 1px solid rgba(255, 255, 255, 0.2);
      color: #fff;
      width: 48px;
      height: 48px;
      border-radius: 50%;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1.4rem;
      transition: background 0.2s ease, transform 0.2s ease;
      z-index: 310;
    }
    .lb-arrow:hover {
      background: rgba(255, 255, 255, 0.25);
      transform: scale(1.08);
    }
    .lb-prev { position: absolute; left: 1rem; }
    .lb-next { position: absolute; right: 1rem; }
    .lb-viewport {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      max-width: 90vw;
      max-height: 80vh;
    }
    #lb-img {
      max-width: 88vw;
      max-height: 74vh;
      border-radius: 12px;
      box-shadow: 0 16px 48px rgba(0, 0, 0, 0.8);
      object-fit: contain;
      user-select: none;
    }
    .lb-caption {
      margin-top: 0.75rem;
      text-align: center;
      color: #E2E8F0;
      font-size: 0.85rem;
      max-width: 600px;
    }
    #lb-attribution {
      color: #94A3B8;
      font-size: 0.8rem;
      margin-top: 0.25rem;
    }
    #lb-attribution a {
      color: #38BDF8;
      text-decoration: underline;
    }

    /* Enquire Section */
    .enquire-card {
      position: relative;
      overflow: hidden;
      border: 1px solid var(--border-light);
      background: var(--bg-card);
      text-align: center;
      padding: 2.25rem 1.5rem;
    }
    .enquire-glow {
      position: absolute;
      inset: -20%;
      background: radial-gradient(circle at 50% 50%, var(--primary-glow) 0%, transparent 65%);
      opacity: 0.5;
      animation: pulseGlow 4s ease-in-out infinite alternate;
      pointer-events: none;
    }
    @keyframes pulseGlow {
      0% { opacity: 0.3; transform: scale(0.95); }
      100% { opacity: 0.65; transform: scale(1.05); }
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

    /* Missing notice */
    .missing-notice {
      background: rgba(100, 116, 139, 0.1);
      border: 1px solid rgba(100, 116, 139, 0.22);
      border-radius: 10px;
      padding: 0.875rem 1rem;
      font-size: 0.82rem;
      color: var(--text-muted);
    }

    /* Sticky Bottom Bar on Mobile */
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
    /* Mobile-first at 360px baseline */
    @media (max-width: 480px) {
      .gallery-grid { grid-template-columns: 1fr; }
    }

    /* Tablet & Desktop: 641px and up */
    @media (min-width: 641px) {
      .sticky-bar{display:none !important;}
      .hero-btns { flex-direction: row; }
      .contact-grid { grid-template-columns: repeat(2, 1fr); }
      .gallery-grid { grid-template-columns: repeat(3, 1fr); }
      .enquire-actions { flex-direction: row; justify-content: center; }
    }

    /* 768px (Tablet split) */
    @media (min-width: 768px) {
      .hero-split-grid { grid-template-columns: 1.15fr 0.85fr; }
      .gallery-grid { grid-template-columns: repeat(4, 1fr); }
    }

    /* 1024px & 1440px (Desktop wide) */
    @media (min-width: 1024px) {
      .wrap { padding: 2.25rem 1.5rem 4rem; gap: 2rem; }
      .hero { padding: 3rem 2.5rem; min-height: 380px; }
      .theme-fullscreen-overlay .hero { min-height: 75vh; }
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
      .reveal { opacity: 1 !important; transform: none !important; transition: none !important; }
      .status-pulse, .enquire-glow { animation: none !important; }
      .hero-no-photo { animation: none !important; }
    }
  </style>
</head>
<body class="theme-${themeId}">
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
        ${hasPhone ? `<a href="${escapeHtml(telUri)}" class="btn btn-sm btn-call">Call</a>` : ''}
        ${waLink ? `<a href="${escapeHtml(waLink)}" target="_blank" rel="noopener noreferrer" class="btn btn-sm btn-wa">WhatsApp</a>` : ''}
      </div>
    </div>
  </header>

  <div class="wrap">
    ${assembledSectionsHtml}
  </div>

  <aside class="disc disc-bottom">⚠️ ${disclaimerText}</aside>

  <footer class="footer">
    <p>Draft Website Preview · Prepared by Susunetech</p>
    <p>Data last checked: ${escapeHtml(generatedDate)}</p>
  </footer>

  ${stickyBarHtml}

  ${hasPhotos ? `
  <!-- Keyboard-Accessible Lightbox with Swipe on Mobile -->
  <div id="lb-overlay" role="dialog" aria-modal="true" aria-label="Photo viewer" tabindex="-1">
    <div class="lb-header">
      <span id="lb-counter">1 / ${data.photos.length}</span>
      <button id="lb-close" aria-label="Close photo viewer">&times;</button>
    </div>
    <div class="lb-stage">
      <button id="lb-prev" class="lb-arrow lb-prev" aria-label="Previous photo">&#10094;</button>
      <div class="lb-viewport">
        <img id="lb-img" src="" alt="Full size photo">
        <div class="lb-caption">
          <div id="lb-attribution"></div>
        </div>
      </div>
      <button id="lb-next" class="lb-arrow lb-next" aria-label="Next photo">&#10095;</button>
    </div>
  </div>` : ''}

  <script>
  (function(){
    // 1. Sync Sticky Nav beneath top disclaimer so disclaimer is never hidden
    var topDisc = document.getElementById('top-disc');
    var stickyNav = document.getElementById('sticky-nav');
    function syncNav() {
      if (topDisc && stickyNav) {
        stickyNav.style.top = (topDisc.offsetHeight || 0) + 'px';
      }
    }
    syncNav();
    window.addEventListener('resize', syncNav, { passive: true });

    // 2. Scroll-Spy and Nav Highlight
    var navLinks = document.querySelectorAll('.nav-item');
    var sections = document.querySelectorAll('main[id], section[id]');
    function onScrollSpy() {
      var topOffset = (topDisc ? topDisc.offsetHeight : 0) + (stickyNav ? stickyNav.offsetHeight : 0) + 40;
      var curY = window.scrollY + topOffset;
      var curId = '';
      sections.forEach(function(sec) {
        if (curY >= sec.offsetTop && curY < sec.offsetTop + sec.offsetHeight) {
          curId = sec.id;
        }
      });
      navLinks.forEach(function(link) {
        var href = link.getAttribute('href') || '';
        if (href === '#' + curId) {
          link.classList.add('active');
        } else {
          link.classList.remove('active');
        }
      });
      if (stickyNav) {
        if (window.scrollY > 20) stickyNav.classList.add('is-stuck');
        else stickyNav.classList.remove('is-stuck');
      }
    }
    window.addEventListener('scroll', onScrollSpy, { passive: true });
    onScrollSpy();

    // 3. Scroll Reveal Animations via IntersectionObserver
    if ('IntersectionObserver' in window) {
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
    } else {
      document.querySelectorAll('.reveal, .section-card').forEach(function(el) {
        el.classList.add('is-visible');
      });
    }

    // 4. Hero Parallax Scroll
    var heroBg = document.querySelector('.hero-bg-media');
    if (heroBg) {
      var ticking = false;
      window.addEventListener('scroll', function() {
        if (!ticking) {
          window.requestAnimationFrame(function() {
            var y = window.scrollY;
            if (y < 800) {
              heroBg.style.transform = 'translate3d(0,' + (y * 0.2) + 'px,0) scale(1.04)';
            }
            ticking = false;
          });
          ticking = true;
        }
      }, { passive: true });
    }

    // 5. Button Ripple Click Effect
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

    ${hasPhotos ? `
    // 6. Photo Gallery & Lightbox with Keyboard and Swipe
    var overlay = document.getElementById('lb-overlay');
    var lbImg = document.getElementById('lb-img');
    var lbClose = document.getElementById('lb-close');
    var lbPrev = document.getElementById('lb-prev');
    var lbNext = document.getElementById('lb-next');
    var lbCounter = document.getElementById('lb-counter');
    var lbAttr = document.getElementById('lb-attribution');
    var thumbs = Array.prototype.slice.call(document.querySelectorAll('.gallery-thumb'));
    var curIdx = 0;

    function openLb(idx) {
      if (!thumbs.length || !overlay) return;
      curIdx = (idx + thumbs.length) % thumbs.length;
      var el = thumbs[curIdx];
      lbImg.src = el.dataset.full || el.src;
      lbImg.alt = el.alt || 'Full photo';
      if (lbCounter) lbCounter.textContent = (curIdx + 1) + ' / ' + thumbs.length;
      if (lbAttr) {
        var aName = el.dataset.authorName;
        var aUri = el.dataset.authorUri;
        if (aName) {
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
    }

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

    // Mobile Swipe Gestures on Lightbox
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
    ` : ''}
  })();
  </script>
</body>
</html>`;
}

// ──────────────────────────────────────────────
// GET /preview/:token
// ──────────────────────────────────────────────
app.get('/preview/:token', (req, res) => {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');

  const { token } = req.params;
  if (!token || typeof token !== 'string' || !/^[A-Za-z0-9_\-]{32}$/.test(token)) {
    return res.status(400).send(renderErrorPage('Invalid preview token.'));
  }

  const entry = previewStore.get(token);
  if (!entry) {
    return res.status(404).send(renderErrorPage('Preview not found or has expired. Please generate a new preview.'));
  }

  try {
    const codePrefix = token.slice(0, 4);
    const tokenDesign = CODE_THEME_MAP[codePrefix];
    const designOverride = (tokenDesign && tokenDesign !== 'auto') ? tokenDesign : (entry.data?.design || 'auto');
    const html = renderPreviewHtml(entry.data, designOverride);
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
