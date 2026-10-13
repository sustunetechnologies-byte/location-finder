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

// Indian mobile: 10 digits starting with 6, 7, 8 or 9
function isIndianMobile(digits) {
  if (!digits) return false;
  return digits.length === 10 && /^[6-9]/.test(digits);
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
// POST /api/generate-site — Store enriched data, return token
// ──────────────────────────────────────────────
app.post('/api/generate-site', (req, res) => {
  try {
    const {
      name, type, address, phone, whatsappNumber, openingHours,
      coordinates, mapLink, enriched, menuItems, roomTypes,
      verifications
    } = req.body || {};

    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'Business name is required.' });
    }

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
    const token = crypto.randomBytes(24).toString('base64url');
    previewStore.set(token, { data: payload, createdAt: Date.now() });

    // Prune old tokens (>24h)
    const now = Date.now();
    for (const [k, v] of previewStore.entries()) {
      if (now - v.createdAt > 24 * 60 * 60 * 1000) previewStore.delete(k);
    }

    console.log(`[Generate Site] Token created for: ${payload.name}`);
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

  // Check if string contains day names or pipes
  const hasDay = DAY_NAMES.some(d => hoursStr.toLowerCase().includes(d.toLowerCase()));
  if (!hasDay && !hoursStr.includes('|')) {
    return null; // General single string like "11:00 AM - 11:00 PM"
  }

  const days = hoursStr.split(/\s*\|\s*/);
  const parsed = days.map(d => {
    // Only split on colon if the left side is a valid day name
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

function buildFeaturesHtml(features, isStay, theme) {
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
    <section class="section-card">
      <h2 class="card-title">✨ Highlights</h2>
      <div class="chips-grid">
        ${highlights.map(h => `<span class="chip">${escapeHtml(h)}</span>`).join('')}
      </div>
    </section>`;
}

function buildReviewsHtml(reviews, theme) {
  if (!reviews || reviews.length === 0) return '';
  const stars = (n) => n ? '★'.repeat(Math.min(5, Math.round(n))) + '☆'.repeat(Math.max(0, 5 - Math.round(n))) : '';

  return `
    <section class="section-card">
      <h2 class="card-title">⭐ Guest Reviews</h2>
      <div class="reviews-list">
        ${reviews.map(r => `
          <div class="review-item">
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

function buildMenuHtml(menuItems, theme) {
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
    <section class="section-card">
      <h2 class="card-title">🍽️ Menu</h2>
      ${body}
    </section>`;
}

function buildRoomsHtml(roomTypes, theme) {
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
    <section class="section-card">
      <h2 class="card-title">🛏️ Rooms &amp; Rates</h2>
      ${body}
    </section>`;
}

function buildHoursTableHtml(hoursStr, theme) {
  const parsed = parseOpeningHours(hoursStr);
  if (!parsed) {
    return `
      <section class="section-card">
        <h2 class="card-title">🕐 Opening Hours</h2>
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
    <section class="section-card">
      <h2 class="card-title">🕐 Opening Hours</h2>
      <table class="hours-table">
        <tbody>${rows}</tbody>
      </table>
    </section>`;
}

function buildMapHtml(coordinates, mapLink, theme) {
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
          width="100%" height="260" style="border:0;display:block;" loading="lazy"
          referrerpolicy="no-referrer-when-downgrade"
          title="Map location"></iframe>
      </div>`;
    }
  }

  const directionsUrl = safeMapUrl || (coordinates && coordinates.lat && coordinates.lon ? `https://www.google.com/maps/dir/?api=1&destination=${coordinates.lat},${coordinates.lon}` : null);

  if (!directionsUrl && !iframeHtml) return '';

  return `
    <section class="section-card">
      <h2 class="card-title">📍 Location</h2>
      ${iframeHtml}
      ${directionsUrl ? `<div class="map-actions">
        <a href="${directionsUrl}" target="_blank" rel="noopener noreferrer" class="btn btn-directions">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg>Get directions on Google Maps ↗
        </a>
      </div>` : ''}
    </section>`;
}

// ──────────────────────────────────────────────
// Main preview HTML renderer
// ──────────────────────────────────────────────
function renderPreviewHtml(data) {
  const isStay = !!(data.type || '').toLowerCase().match(/stay|hotel|motel|hostel|lodge|inn|guest/);

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

  // WhatsApp logic: override if valid mobile override entered, otherwise use normalized phone if mobile
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
  const safePhone = hasPhone ? escapeHtml(phoneDisplay) : null;
  const safeMapUrl = (data.mapLink && data.mapLink !== 'Not available') ? escapeHtml(data.mapLink) : null;
  const safeEditorial = data.editorialSummary ? escapeHtml(data.editorialSummary) : null;
  const safeRating = (data.rating && data.rating !== 'Not available') ? escapeHtml(String(data.rating)) : null;
  const safeReviewCount = (data.reviewCount && data.reviewCount !== 'Not available') ? escapeHtml(String(data.reviewCount)) : null;
  const safePriceLevel = data.priceLevel ? escapeHtml(data.priceLevel) : null;
  const hasHours = !!(data.openingHours && data.openingHours !== 'Not available');
  const generatedDate = data.generatedDate || new Date().toISOString().split('T')[0];
  const disclaimerText = `Preview prepared for ${safeName} by Susunetech. This is a draft preview created for demonstration purposes only. It is not the official website of the business and has not been approved or published by the owner.`;

  // ── Color themes (Warm for Restaurant, Calm Hotel-style for Stay) ──
  const theme = isStay ? {
    name: 'stay',
    bg: '#08101E',
    bgCard: '#0E192D',
    bgCardAlt: '#14233C',
    heroBg: 'linear-gradient(135deg, #091322 0%, #102644 55%, #0A1628 100%)',
    heroPattern: 'radial-gradient(circle at 85% 15%, rgba(14, 165, 233, 0.22) 0%, transparent 55%), radial-gradient(circle at 15% 85%, rgba(20, 184, 166, 0.15) 0%, transparent 55%)',
    border: '#1C2E4C',
    borderLight: '#28426B',
    text: '#F0F6FC',
    textMuted: '#94A8C4',
    textSubtle: '#5A7394',
    primary: '#0284C7',
    primaryHover: '#0369A1',
    primaryGlow: 'rgba(2, 132, 199, 0.35)',
    accent: '#14B8A6',
    accentText: '#2DD4BF',
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
  } : {
    name: 'restaurant',
    bg: '#140E0A',
    bgCard: '#1E140E',
    bgCardAlt: '#2A1B14',
    heroBg: 'linear-gradient(135deg, #1C0F08 0%, #36170A 55%, #1A0D06 100%)',
    heroPattern: 'radial-gradient(circle at 85% 15%, rgba(249, 115, 22, 0.22) 0%, transparent 55%), radial-gradient(circle at 15% 85%, rgba(245, 158, 11, 0.15) 0%, transparent 55%)',
    border: '#3D2415',
    borderLight: '#5A3620',
    text: '#FFF7F2',
    textMuted: '#C9A595',
    textSubtle: '#8C6756',
    primary: '#EA580C',
    primaryHover: '#C2410C',
    primaryGlow: 'rgba(234, 88, 12, 0.35)',
    accent: '#F59E0B',
    accentText: '#FBBF24',
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
  };

  // ── Photo availability check ──
  const hasPhotos = !data.photosUnavailable && Array.isArray(data.photos) && data.photos.length > 0;
  const firstPhoto = hasPhotos ? data.photos[0] : null;
  const heroStyle = firstPhoto
    ? `background: linear-gradient(180deg, rgba(12, 16, 26, 0.45) 0%, rgba(12, 16, 26, 0.8) 55%, ${theme.bg} 100%), url('/api/photo?name=${encodeURIComponent(firstPhoto.name)}&maxWidth=1200') center/cover no-repeat;`
    : `background: ${theme.heroPattern}, ${theme.heroBg};`;

  // ── Sub-sections (Hide any section with no data) ──
  const aboutHtml = (safeEditorial || safeAddress) ? `
    <section class="section-card">
      <h2 class="card-title">${isStay ? '🏨' : '🍽️'} About</h2>
      ${safeEditorial ? `<p class="editorial-text">${safeEditorial}</p>` : ''}
      ${safeAddress ? `<p class="address-text">📍 ${safeAddress}</p>` : ''}
    </section>` : '';

  const featuresHtml = buildFeaturesHtml(data.features, isStay, theme);
  const contentHtml = isStay ? buildRoomsHtml(data.roomTypes, theme) : buildMenuHtml(data.menuItems, theme);
  const hoursHtml = hasHours ? buildHoursTableHtml(data.openingHours, theme) : '';
  const mapSectionHtml = buildMapHtml(data.coordinates, data.mapLink, theme);

  // Photos & Reviews only shown when returned by API
  const galleryHtml = hasPhotos ? `
    <section class="section-card">
      <h2 class="card-title">📷 Photo Gallery</h2>
      <div class="gallery-grid" id="gallery">
        ${data.photos.slice(0, 8).map((p, i) => `
          <div class="gallery-thumb-wrap">
            <img class="gallery-thumb"
              src="/api/photo?name=${encodeURIComponent(p.name)}&maxWidth=400"
              alt="Photo ${i + 1}"
              loading="lazy"
              data-full="/api/photo?name=${encodeURIComponent(p.name)}&maxWidth=1200"
              onerror="this.closest('.gallery-thumb-wrap').remove()">
          </div>
        `).join('')}
      </div>
    </section>` : '';

  const hasReviews = !data.photosUnavailable && Array.isArray(data.reviews) && data.reviews.length > 0;
  const reviewsHtml = hasReviews ? buildReviewsHtml(data.reviews, theme) : '';

  // Contact section
  const contactHtml = (safeAddress || hasPhone) ? `
    <section class="section-card">
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
    </section>` : '';

  const missingDataNote = data.photosUnavailable
    ? `<div style="background:rgba(100,116,139,0.1);border:1px solid rgba(100,116,139,0.22);border-radius:10px;padding:0.875rem 1rem;font-size:0.82rem;color:${theme.textMuted};">No photos or reviews available for this key. Add photos later with a billing-enabled key or use owner-approved photos.</div>`
    : '';

  // ── Sticky bottom action bar on mobile ──
  const stickyBarHtml = (hasPhone || safeMapUrl) ? `
  <nav id="sticky-bar" class="sticky-bar" aria-label="Quick Actions">
    ${hasPhone ? `
      <a href="${escapeHtml(telUri)}" class="sticky-btn sticky-call">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
        <span>Call</span>
      </a>` : ''}
    ${waLink ? `
      <a href="${escapeHtml(waLink)}" target="_blank" rel="noopener noreferrer" class="sticky-btn sticky-wa">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
        <span>WhatsApp</span>
      </a>` : ''}
    ${safeMapUrl ? `
      <a href="${safeMapUrl}" target="_blank" rel="noopener noreferrer" class="sticky-btn sticky-dir">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg>
        <span>Directions</span>
      </a>` : ''}
  </nav>` : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="noindex, nofollow">
  <title>${safeName} – Preview</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0;}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background:${theme.bg};color:${theme.text};line-height:1.6;min-height:100vh;display:flex;flex-direction:column;}
    .disc{background:${theme.disclaimerBg};border-bottom:1px solid ${theme.disclaimerBorder};color:${theme.disclaimerText};padding:0.65rem 1.25rem;font-size:0.78rem;text-align:center;line-height:1.45;}
    .disc-bottom{border-top:1px solid ${theme.disclaimerBorder};border-bottom:none;margin-top:auto;}
    .wrap{max-width:960px;margin:0 auto;padding:1.5rem 1rem 6rem;width:100%;flex:1;display:flex;flex-direction:column;gap:1.5rem;}
    .topbar{display:flex;align-items:center;justify-content:space-between;}
    .brand{font-size:1.15rem;font-weight:700;color:${theme.text};}
    .badge{padding:0.28rem 0.75rem;border-radius:9999px;font-size:0.68rem;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;background:${theme.badgeBg};color:${theme.badgeText};border:1px solid ${theme.badgeBorder};}

    /* Hero */
    .hero{border:1px solid ${theme.border};border-radius:20px;padding:2.25rem 1.5rem;position:relative;overflow:hidden;box-shadow:0 24px 48px rgba(0,0,0,0.5);min-height:300px;display:flex;align-items:flex-end;${heroStyle}}
    .hero-inner{position:relative;z-index:1;display:flex;flex-direction:column;gap:1rem;width:100%;}
    .hero-meta{display:flex;align-items:center;gap:0.75rem;flex-wrap:wrap;}
    .hero-rating{display:inline-flex;align-items:center;gap:0.3rem;background:${theme.featureChipBg};border:1px solid ${theme.featureChipBorder};color:${theme.accentText};font-weight:700;font-size:0.88rem;padding:0.3rem 0.75rem;border-radius:9999px;}
    .hero-reviews{color:${theme.textMuted};font-size:0.82rem;}
    .hero-price{color:${theme.textMuted};font-size:0.9rem;font-weight:600;}
    .hero-h1{font-size:2rem;font-weight:900;letter-spacing:-0.03em;color:${theme.text};line-height:1.2;}
    .hero-intro{font-size:0.98rem;color:${theme.textMuted};max-width:680px;line-height:1.6;}
    .hero-btns{display:flex;flex-direction:column;gap:0.75rem;margin-top:0.25rem;}
    .btn{display:inline-flex;align-items:center;justify-content:center;gap:0.45rem;padding:0.8rem 1.4rem;border-radius:11px;font-size:0.9rem;font-weight:700;text-decoration:none;min-height:48px;transition:opacity .15s,transform .15s;border:none;cursor:pointer;}
    .btn:hover{opacity:.88;transform:translateY(-1px);}
    .btn-call{background:${theme.primary};color:#fff;box-shadow:0 4px 18px ${theme.primaryGlow};}
    .btn-wa{background:#16A34A;color:#fff;}
    .btn-dir{background:${theme.bgCardAlt};color:${theme.text};border:1px solid ${theme.borderLight};}
    .btn-directions{background:${theme.primary};color:#fff;box-shadow:0 4px 18px ${theme.primaryGlow};align-self:flex-start;}

    /* Consistent Section Cards */
    .section-card{background:${theme.bgCard};border:1px solid ${theme.border};border-radius:14px;padding:1.5rem;display:flex;flex-direction:column;gap:1rem;}
    .card-title{font-size:1.1rem;font-weight:700;color:${theme.text};border-bottom:1px solid ${theme.border};padding-bottom:0.75rem;display:flex;align-items:center;gap:0.5rem;}
    .editorial-text{color:${theme.textMuted};font-size:0.95rem;line-height:1.7;}
    .address-text{color:${theme.textMuted};font-size:0.9rem;}

    /* Chips */
    .chips-grid{display:flex;flex-wrap:wrap;gap:0.5rem;}
    .chip{background:${theme.featureChipBg};border:1px solid ${theme.featureChipBorder};color:${theme.featureChipText};padding:0.35rem 0.85rem;border-radius:9999px;font-size:0.82rem;font-weight:500;}

    /* Items List (Menu & Rooms) */
    .items-list{display:flex;flex-direction:column;}
    .item-row{display:flex;align-items:baseline;gap:0.5rem;padding:0.65rem 0;border-bottom:1px solid ${theme.border};flex-wrap:wrap;}
    .item-row:last-child{border-bottom:none;}
    .item-name{font-weight:600;color:${theme.text};flex:1;}
    .item-price{color:${theme.accentText};font-weight:700;white-space:nowrap;}
    .item-source{font-size:0.72rem;color:${theme.textSubtle};}
    .muted-note{color:${theme.textMuted};font-size:0.92rem;font-style:italic;}

    /* Hours Table */
    .hours-table{width:100%;border-collapse:collapse;font-size:0.88rem;}
    .hours-table tr{border-bottom:1px solid ${theme.border};}
    .hours-table tr:last-child{border-bottom:none;}
    .day-cell{padding:0.6rem 0.75rem;color:${theme.textMuted};font-weight:500;}
    .hours-cell{padding:0.6rem 0.75rem;color:${theme.textMuted};text-align:right;}
    .is-today{background:${theme.todayBg};font-weight:700;}
    .is-today .day-cell{color:${theme.accentText};font-weight:700;}
    .is-today .hours-cell{color:${theme.text};font-weight:700;}
    .today-badge{font-size:0.65rem;background:${theme.primary};color:#fff;border-radius:4px;padding:2px 6px;margin-left:0.5rem;vertical-align:middle;font-weight:700;}

    /* Map */
    .map-embed-frame{border-radius:10px;overflow:hidden;border:1px solid ${theme.border};}
    .map-actions{margin-top:0.25rem;}

    /* Contact Grid */
    .contact-grid{display:grid;grid-template-columns:1fr;gap:1rem;}
    .contact-tile{background:${theme.bgCardAlt};border:1px solid ${theme.border};border-radius:10px;padding:1.1rem;display:flex;flex-direction:column;gap:0.45rem;}
    .contact-lbl{font-size:0.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:${theme.textSubtle};}
    .contact-val{font-size:0.92rem;color:${theme.text};font-weight:600;line-height:1.5;}
    .contact-links{display:flex;flex-wrap:wrap;gap:0.75rem;margin-top:0.35rem;}
    .contact-link{color:${theme.accentText};text-decoration:none;font-weight:600;font-size:0.86rem;}
    .contact-link:hover{text-decoration:underline;}
    .contact-wa{color:#4ADE80;}

    /* Reviews */
    .reviews-list{display:flex;flex-direction:column;gap:0.85rem;}
    .review-item{background:${theme.bgCardAlt};border:1px solid ${theme.border};border-radius:10px;padding:1rem;}
    .review-header{display:flex;align-items:center;justify-content:space-between;gap:0.5rem;margin-bottom:0.4rem;}
    .review-author{font-size:0.88rem;font-weight:600;color:${theme.text};}
    .review-stars{color:${theme.accent};font-size:0.85rem;}
    .review-text{font-size:0.85rem;color:${theme.textMuted};line-height:1.55;}

    /* Gallery & Lightbox */
    .gallery-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:0.6rem;}
    .gallery-thumb-wrap{border-radius:8px;overflow:hidden;aspect-ratio:4/3;background:${theme.bgCardAlt};}
    .gallery-thumb{width:100%;height:100%;object-fit:cover;cursor:pointer;border:1px solid ${theme.border};transition:transform .18s;}
    .gallery-thumb:hover{transform:scale(1.04);}
    #lb-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,.9);z-index:200;align-items:center;justify-content:center;padding:1rem;}
    #lb-overlay.open{display:flex;}
    #lb-img{max-width:92vw;max-height:86vh;border-radius:12px;box-shadow:0 12px 48px rgba(0,0,0,.8);object-fit:contain;}
    #lb-close{position:absolute;top:1rem;right:1.25rem;color:#fff;font-size:2.2rem;cursor:pointer;line-height:1;background:none;border:none;}

    /* Sticky Bottom Bar on Mobile */
    .sticky-bar{display:flex;position:fixed;bottom:0;left:0;right:0;z-index:100;background:${theme.stickyBg};border-top:1px solid ${theme.stickyBorder};padding:0.65rem 0.85rem calc(0.65rem + env(safe-area-inset-bottom, 0px));gap:0.5rem;box-shadow:0 -4px 20px rgba(0,0,0,0.5);}
    .sticky-btn{flex:1;display:flex;align-items:center;justify-content:center;gap:0.4rem;padding:0.7rem 0.4rem;border-radius:10px;font-size:0.84rem;font-weight:700;text-decoration:none;min-height:44px;text-align:center;}
    .sticky-call{background:${theme.primary};color:#fff;}
    .sticky-wa{background:#16A34A;color:#fff;}
    .sticky-dir{background:${theme.bgCardAlt};color:${theme.text};border:1px solid ${theme.borderLight};}

    .footer{border-top:1px solid ${theme.border};padding:1.5rem 1.25rem;text-align:center;color:${theme.textSubtle};font-size:0.78rem;display:flex;flex-direction:column;gap:0.4rem;}

    /* Desktop Breakpoint */
    @media (min-width: 641px) {
      .wrap{padding:2.25rem 1.5rem 3.5rem;gap:1.75rem;}
      .hero{padding:2.75rem 2.25rem;min-height:360px;}
      .hero-h1{font-size:2.5rem;}
      .hero-btns{flex-direction:row;}
      .contact-grid{grid-template-columns:repeat(2,1fr);}
      .gallery-grid{grid-template-columns:repeat(4,1fr);}
      .sticky-bar{display:none !important;}
    }
  </style>
</head>
<body>
  <aside class="disc">⚠️ ${disclaimerText}</aside>

  <div class="wrap">
    <header class="topbar">
      <div class="brand">${safeName}</div>
      <span class="badge">${safeType}</span>
    </header>

    <!-- HERO -->
    <main class="hero">
      <div class="hero-inner">
        ${(safeRating || safePriceLevel) ? `<div class="hero-meta">
          ${safeRating ? `<div class="hero-rating">★ ${safeRating}${safeReviewCount ? ` <span class="hero-reviews">(${safeReviewCount})</span>` : ''}</div>` : ''}
          ${safePriceLevel ? `<span class="hero-price">${safePriceLevel}</span>` : ''}
        </div>` : ''}
        <h1 class="hero-h1">${safeName}</h1>
        ${safeEditorial ? `<p class="hero-intro">${safeEditorial}</p>` : safeAddress ? `<p class="hero-intro">📍 ${safeAddress}</p>` : ''}
        <div class="hero-btns">
          ${hasPhone ? `<a href="${escapeHtml(telUri)}" class="btn btn-call"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>Call ${escapeHtml(phoneDisplay)}</a>` : ''}
          ${waLink ? `<a href="${escapeHtml(waLink)}" target="_blank" rel="noopener noreferrer" class="btn btn-wa"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>WhatsApp</a>` : ''}
          ${safeMapUrl ? `<a href="${safeMapUrl}" target="_blank" rel="noopener noreferrer" class="btn btn-dir"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg>Get Directions</a>` : ''}
        </div>
      </div>
    </main>

    ${missingDataNote}

    <!-- ABOUT -->
    ${aboutHtml}

    <!-- HIGHLIGHTS -->
    ${featuresHtml}

    <!-- MENU or ROOMS -->
    ${contentHtml}

    <!-- PHOTO GALLERY -->
    ${galleryHtml}

    <!-- REVIEWS -->
    ${reviewsHtml}

    <!-- OPENING HOURS -->
    ${hoursHtml}

    <!-- LOCATION MAP -->
    ${mapSectionHtml}

    <!-- CONTACT -->
    ${contactHtml}
  </div>

  <aside class="disc disc-bottom">⚠️ ${disclaimerText}</aside>

  <footer class="footer">
    <p>Draft Website Preview · Prepared by Susunetech</p>
    <p>Data last checked: ${escapeHtml(generatedDate)}</p>
  </footer>

  ${stickyBarHtml}

  ${hasPhotos ? `
  <!-- Lightbox -->
  <div id="lb-overlay" role="dialog" aria-modal="true" aria-label="Photo viewer">
    <button id="lb-close" aria-label="Close photo viewer">&times;</button>
    <img id="lb-img" src="" alt="Full size photo">
  </div>

  <script>
  (function(){
    var overlay=document.getElementById('lb-overlay');
    var lbImg=document.getElementById('lb-img');
    var lbClose=document.getElementById('lb-close');
    if(overlay&&lbImg){
      document.querySelectorAll('.gallery-thumb').forEach(function(img){
        img.addEventListener('click',function(){
          lbImg.src=img.dataset.full||img.src;
          overlay.classList.add('open');
        });
      });
      if(lbClose){
        lbClose.addEventListener('click',function(){overlay.classList.remove('open');});
      }
      overlay.addEventListener('click',function(e){if(e.target===overlay)overlay.classList.remove('open');});
      document.addEventListener('keydown',function(e){if(e.key==='Escape')overlay.classList.remove('open');});
    }
  })();
  </script>` : ''}
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
    const html = renderPreviewHtml(entry.data);
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
