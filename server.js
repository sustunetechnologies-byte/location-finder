require('dotenv').config();
const express = require('express');
const path = require('path');
const ExcelJS = require('exceljs');
const crypto = require('crypto');
const zlib = require('zlib');

const app = express();
const PORT = process.env.PORT || 3000;

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
let dailyRequestCount = 0;
let dailyCounterDate = new Date().toISOString().split('T')[0];

function checkDailyLimit(requestsNeeded = 1) {
  const today = new Date().toISOString().split('T')[0];
  if (today !== dailyCounterDate) {
    dailyCounterDate = today;
    dailyRequestCount = 0;
  }
  if (dailyRequestCount + requestsNeeded > 400) {
    throw {
      status: 429,
      code: 'DAILY_LIMIT_EXCEEDED',
      message: `Daily limit of 400 Google Places API requests reached (${dailyRequestCount}/400 used today). Usage resets tomorrow.`
    };
  }
}

function incrementDailyCounter(count = 1) {
  dailyRequestCount += count;
}

const RESTAURANT_WORDINGS = [
  'restaurant', 'cafe', 'bakery', 'hotel restaurant', 'dhaba',
  'fast food', 'juice and snacks', 'veg restaurant', 'non veg restaurant', 'bar and restaurant',
  'family restaurant', 'mess', 'tiffin', 'biryani', 'meals', 'military hotel', 'darshini', 'hotel'
];

const STAY_WORDINGS = [
  'hotel', 'lodge', 'guest house', 'homestay', 'resort',
  'PG hostel', 'farm stay', 'rooms for rent', 'budget hotel',
  'dormitory', 'service apartment'
];

const RESTAURANT_NEARBY_TYPES = [
  'restaurant', 'cafe', 'bakery', 'meal_takeaway', 'fast_food_restaurant'
];

const STAY_NEARBY_TYPES = [
  'lodging', 'hotel', 'guest_house', 'bed_and_breakfast', 'hostel', 'resort_hotel'
];

async function runInBatches(tasks, batchSize = 5, delayMs = 150) {
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

async function googleTextSearch(queryText, restriction = null, maxPages = 3) {
  if (!GOOGLE_KEY) throw { status: 503, code: 'NO_GOOGLE_KEY', message: 'Google Places API key is not configured.' };

  const url = 'https://places.googleapis.com/v1/places:searchText';
  let allPlaces = [];
  let nextPageToken = null;
  let pagesFetched = 0;
  let closedCount = 0;

  for (let page = 0; page < maxPages; page++) {
    try {
      checkDailyLimit(1);
    } catch (limErr) {
      if (allPlaces.length > 0) break;
      throw limErr;
    }

    const bodyObj = { textQuery: queryText, pageSize: 20 };
    if (nextPageToken) {
      bodyObj.pageToken = nextPageToken;
    }
    if (restriction && restriction.rectangle) {
      bodyObj.locationRestriction = restriction;
    } else if (restriction && restriction.circle) {
      bodyObj.locationBias = restriction;
    }

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
    pagesFetched++;

    if (res.status === 403) throw { status: 403, code: 'GOOGLE_403', message: 'Google Places API key is invalid, not enabled, or restricted (403). Check your API Console.' };
    if (res.status === 429) throw { status: 429, code: 'GOOGLE_429', message: 'Google Places API daily quota reached (429). Usage resets the next day.' };
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw { status: res.status, message: `Google Places search failed (${res.status}): ${txt.slice(0, 200)}` };
    }

    const data = await res.json();
    // Exclude ONLY CLOSED_PERMANENTLY; keep count of permanently closed
    const places = (data.places || []).filter(p => {
      if (p.businessStatus === 'CLOSED_PERMANENTLY') {
        closedCount++;
        return false;
      }
      return true;
    });
    allPlaces.push(...places);

    nextPageToken = data.nextPageToken || null;
    if (!nextPageToken) break;
  }

  return { places: allPlaces, pagesFetched, closedCount };
}

async function googleNearbySearch(center, radiusMeters, includedTypes, rankPreference = 'POPULARITY') {
  if (!GOOGLE_KEY) throw { status: 503, code: 'NO_GOOGLE_KEY', message: 'Google Places API key is not configured.' };

  checkDailyLimit(1);

  const url = 'https://places.googleapis.com/v1/places:searchNearby';
  const body = JSON.stringify({
    includedTypes,
    maxResultCount: 20,
    rankPreference,
    locationRestriction: {
      circle: {
        center: { latitude: center.lat, longitude: center.lon },
        radius: radiusMeters
      }
    }
  });

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': GOOGLE_KEY,
      'X-Goog-FieldMask': GOOGLE_NEARBY_FIELD_MASK
    },
    body
  });

  incrementDailyCounter(1);

  if (res.status === 403) throw { status: 403, code: 'GOOGLE_403', message: 'Google Places API key is invalid, not enabled, or restricted (403). Check your API Console.' };
  if (res.status === 429) throw { status: 429, code: 'GOOGLE_429', message: 'Google Places API daily quota reached (429). Usage resets the next day.' };
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw { status: res.status, message: `Google Places Nearby search failed (${res.status}): ${txt.slice(0, 200)}` };
  }

  const data = await res.json();
  let closedCount = 0;
  const places = (data.places || []).filter(p => {
    if (p.businessStatus === 'CLOSED_PERMANENTLY') {
      closedCount++;
      return false;
    }
    return true;
  });
  return { places, closedCount };
}

async function resolveLocationCenter(locationStr) {
  if (TOMTOM_KEY) {
    try {
      const pos = await geocodeLocationTomTom(locationStr);
      if (pos && pos.lat && pos.lon) return { lat: pos.lat, lon: pos.lon };
    } catch {}
  }
  if (GOOGLE_KEY) {
    try {
      checkDailyLimit(1);
      const url = 'https://places.googleapis.com/v1/places:searchText';
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': GOOGLE_KEY,
          'X-Goog-FieldMask': 'places.location,places.viewport'
        },
        body: JSON.stringify({ textQuery: locationStr, pageSize: 1 })
      });
      incrementDailyCounter(1);
      if (res.ok) {
        const data = await res.json();
        const first = data.places?.[0];
        if (first?.location) {
          return {
            lat: first.location.latitude,
            lon: first.location.longitude,
            viewport: first.viewport || null
          };
        }
      }
    } catch {}
  }
  return null;
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
    let coverageReport = null;

    // ── Google Places path ──
    if (normSource === 'google') {
      try {
        const area = (req.body?.area || req.query?.area || 'small').toLowerCase();
        let radiusMeters = 3000;

        // Resolve location center coordinates
        const center = await resolveLocationCenter(trimmedLoc);

        // Grid cells for multi-cell search
        let gridCells = center ? [center] : [];
        if (center) {
          if (area === 'medium') {
            radiusMeters = 6000;
            const offset = 0.025;
            gridCells = [
              { lat: center.lat - offset, lon: center.lon - offset },
              { lat: center.lat - offset, lon: center.lon + offset },
              { lat: center.lat + offset, lon: center.lon - offset },
              { lat: center.lat + offset, lon: center.lon + offset }
            ];
          } else if (area === 'large') {
            radiusMeters = 12000;
            gridCells = [];
            [-0.05, 0, 0.05].forEach(dLat => {
              [-0.05, 0, 0.05].forEach(dLon => {
                gridCells.push({ lat: center.lat + dLat, lon: center.lon + dLon });
              });
            });
          } else if (area === 'city') {
            radiusMeters = 16000;
            gridCells = [];
            [-0.075, -0.025, 0.025, 0.075].forEach(dLat => {
              [-0.075, -0.025, 0.025, 0.075].forEach(dLon => {
                gridCells.push({ lat: center.lat + dLat, lon: center.lon + dLon });
              });
            });
          }
        }

        // Build list of queries
        const queries = [];
        if (normCategory === 'restaurants' || normCategory === 'restaurant') {
          RESTAURANT_WORDINGS.forEach(w => queries.push({ type: 'Restaurant', wording: w, query: `${w} in ${trimmedLoc}` }));
        } else if (normCategory === 'stays' || normCategory === 'stay' || normCategory === 'hotels') {
          STAY_WORDINGS.forEach(w => queries.push({ type: 'Stay', wording: w, query: `${w} in ${trimmedLoc}` }));
        } else {
          RESTAURANT_WORDINGS.forEach(w => queries.push({ type: 'Restaurant', wording: w, query: `${w} in ${trimmedLoc}` }));
          STAY_WORDINGS.forEach(w => queries.push({ type: 'Stay', wording: w, query: `${w} in ${trimmedLoc}` }));
        }

        // Nearby searches per grid cell
        const nearbyTasks = [];
        if (gridCells.length > 0) {
          const cellsToSearch = gridCells.slice(0, 16);
          const cellRadius = area === 'small' ? 3000 : (area === 'medium' ? 3000 : 4000);
          for (let i = 0; i < cellsToSearch.length; i++) {
            const cell = cellsToSearch[i];
            const cellTag = cellsToSearch.length > 1 ? ` cell ${i + 1}/${cellsToSearch.length}` : '';
            if (normCategory === 'restaurants' || normCategory === 'restaurant' || normCategory === 'both') {
              nearbyTasks.push({ cell, radius: cellRadius, type: 'Restaurant', rank: 'DISTANCE', types: RESTAURANT_NEARBY_TYPES, label: `Nearby restaurants (Distance${cellTag})` });
              if (cellsToSearch.length <= 4) {
                nearbyTasks.push({ cell, radius: cellRadius, type: 'Restaurant', rank: 'POPULARITY', types: RESTAURANT_NEARBY_TYPES, label: `Nearby restaurants (Popularity${cellTag})` });
              }
            }
            if (normCategory === 'stays' || normCategory === 'stay' || normCategory === 'hotels' || normCategory === 'both') {
              nearbyTasks.push({ cell, radius: cellRadius, type: 'Stay', rank: 'DISTANCE', types: STAY_NEARBY_TYPES, label: `Nearby stays (Distance${cellTag})` });
              if (cellsToSearch.length <= 4) {
                nearbyTasks.push({ cell, radius: cellRadius, type: 'Stay', rank: 'POPULARITY', types: STAY_NEARBY_TYPES, label: `Nearby stays (Popularity${cellTag})` });
              }
            }
          }
        }

        // Cost guard check & 150 hard stop (Section 4)
        const pagesPerQuery = gridCells.length > 4 ? 1 : (gridCells.length > 1 ? 2 : 3);
        const maxEstimatedRequests = 1 + (queries.length * pagesPerQuery) + nearbyTasks.length;
        if (maxEstimatedRequests > 150) {
          return res.status(400).json({
            error: `Hard-stop: This search may use up to ${maxEstimatedRequests} Google requests, which exceeds the limit of 150 requests per search. Please select a specific category or reduce search area.`
          });
        }
        checkDailyLimit(maxEstimatedRequests);

        // Location restriction rectangle covering entire search area
        let locationRestriction = null;
        if (center) {
          const latDelta = radiusMeters / 111320;
          const lonDelta = radiusMeters / (111320 * Math.cos(center.lat * Math.PI / 180));
          locationRestriction = {
            rectangle: {
              low: { latitude: center.lat - latDelta, longitude: center.lon - lonDelta },
              high: { latitude: center.lat + latDelta, longitude: center.lon + lonDelta }
            }
          };
        }

        const seenPlaceIds = new Set();
        const mergedPlaces = [];
        const queryReports = [];
        let totalPermanentlyClosed = 0;

        function recordPlaces(queryLabel, rawGooglePlaces, placeType, closedCount = 0) {
          totalPermanentlyClosed += closedCount;
          let newCount = 0;
          for (const gp of rawGooglePlaces) {
            const pId = gp.id;
            if (pId) {
              if (seenPlaceIds.has(pId)) continue;
              seenPlaceIds.add(pId);
            }
            newCount++;
            mergedPlaces.push(mapGooglePlace(gp, placeType));
          }
          queryReports.push({
            query: queryLabel,
            found: rawGooglePlaces.length,
            newCount
          });
        }

        // Execute text search queries in batches of 5 with 150ms delay
        const textTasks = queries.map(q => async () => {
          try {
            const res = await googleTextSearch(q.query, locationRestriction, pagesPerQuery);
            return { q, res: res.places, closedCount: res.closedCount };
          } catch (err) {
            console.warn(`[Text Search Warning] "${q.query}":`, err.message);
            return { q, res: [], closedCount: 0 };
          }
        });

        const textResults = await runInBatches(textTasks, 5, 150);
        for (const item of textResults) {
          recordPlaces(item.q.query, item.res, item.q.type, item.closedCount);
        }

        // Execute nearby searches across grid cells
        if (nearbyTasks.length > 0) {
          const nbTasks = nearbyTasks.map(nb => async () => {
            try {
              const res = await googleNearbySearch(nb.cell, nb.radius, nb.types, nb.rank);
              return { nb, res: res.places, closedCount: res.closedCount };
            } catch (err) {
              console.warn(`[Nearby Search Warning] "${nb.label}":`, err.message);
              return { nb, res: [], closedCount: 0 };
            }
          });
          const nbResults = await runInBatches(nbTasks, 5, 150);
          for (const item of nbResults) {
            recordPlaces(item.nb.label, item.res, item.nb.type, item.closedCount);
          }
        }

        places = mergedPlaces;
        usedSource = 'google';
        coverageReport = {
          total: places.length,
          queryCount: queryReports.length,
          hiddenClosedCount: totalPermanentlyClosed,
          area,
          gridCellCount: gridCells.length,
          queries: queryReports
        };
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
        coverageReport = {
          total: places.length,
          queryCount: 1,
          queries: [{ query: `TomTom POI Search in ${trimmedLoc}`, found: places.length, newCount: places.length }]
        };
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

    searchCache.set(cacheKey, { timestamp: Date.now(), data: checkedPlaces, coverageReport });
    console.log(`[Search] "${trimmedLoc}" | ${normCategory} | ${usedSource} | ${checkedPlaces.length} results | ${phoneCount} phone | ${websiteCount} website`);

    return res.json({
      cached: false,
      location: trimmedLoc,
      category: normCategory,
      source: usedSource,
      total: checkedPlaces.length,
      phoneCount,
      websiteCount,
      coverageReport,
      results: checkedPlaces
    });

  } catch (err) {
    console.error('[Search Error]', err.message || err);
    return res.status(err.status || 500).json({ error: err.message || 'An unexpected error occurred.' });
  }
}

app.get('/api/search', handleSearch);
app.post('/api/search', handleSearch);

// ──────────────────────────────────────────────
// POST /api/search-single — Add missing place search (Section 2)
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
    const searchRes = await googleTextSearch(query, null, 1);
    const places = (searchRes.places || []).map(gp => mapGooglePlace(gp));
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
