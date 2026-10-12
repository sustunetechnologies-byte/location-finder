require('dotenv').config();
const express = require('express');
const path = require('path');
const ExcelJS = require('exceljs');

const app = express();
const PORT = process.env.PORT || 3000;
const TOMTOM_API_KEY = (process.env.TOMTOM_API_KEY || '').trim().replace(/^["']|["']$/g, '');

if (!TOMTOM_API_KEY) {
  console.error('[ERROR] TOMTOM_API_KEY is not defined in environment or .env file!');
}

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Simple in-memory cache for queries (10 minutes TTL)
const searchCache = new Map();
const CACHE_TTL_MS = 10 * 60 * 1000;

// Helper to format website URL
function sanitizeUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return null;
  let trimmed = rawUrl.trim();
  if (!trimmed) return null;
  
  // Take first URL if multiple separated by space, comma, semicolon, or newline
  const parts = trimmed.split(/[\s,;\n]+/);
  if (parts.length > 0 && parts[0]) {
    trimmed = parts[0];
  }
  
  if (!/^https?:\/\//i.test(trimmed)) {
    trimmed = 'https://' + trimmed;
  }
  return trimmed;
}

// Helper to check website status with 5s timeout & fallback
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
      const res = await fetch(url, {
        method,
        headers,
        signal: controller.signal,
        redirect: 'follow'
      });
      clearTimeout(timeoutId);
      return res;
    } catch (err) {
      clearTimeout(timeoutId);
      return null;
    }
  }

  // Try HEAD request first
  let res = await tryFetch('HEAD');
  if (res) {
    if (res.status >= 200 && res.status < 400) return 'Active';
    if (res.status === 403 || res.status === 429) return 'Active (restricted)';
  }

  // Try GET if HEAD failed, timed out, or returned other error codes (e.g. 403/405/500)
  res = await tryFetch('GET');
  if (res) {
    if (res.status >= 200 && res.status < 400) return 'Active';
    if (res.status === 403 || res.status === 429) return 'Active (restricted)';
  }

  return 'Inactive';
}

// Helper to format opening hours
function formatOpeningHours(openingHours) {
  if (!openingHours) return 'Not available';
  if (typeof openingHours === 'string') return openingHours;
  if (openingHours.mode) return `Mode: ${openingHours.mode}`;
  if (Array.isArray(openingHours.timeRanges) && openingHours.timeRanges.length > 0) {
    return openingHours.timeRanges.map(tr => `${tr.startTime} - ${tr.endTime}`).join(', ');
  }
  return 'Not available';
}

// Geocode endpoint logic
async function geocodeLocation(locationStr) {
  if (!TOMTOM_API_KEY) {
    throw { status: 500, message: 'TOMTOM_API_KEY is missing on Vercel. Please add it under Vercel Project Settings > Environment Variables and redeploy.' };
  }

  const geoUrl = `https://api.tomtom.com/search/2/geocode/${encodeURIComponent(locationStr)}.json?countrySet=IN&limit=1&key=${TOMTOM_API_KEY}`;
  const response = await fetch(geoUrl);
  
  if (response.status === 401) {
    throw { status: 401, message: 'Invalid or missing TomTom API key (401 Unauthorized). Please check your TOMTOM_API_KEY environment variable in Vercel.' };
  }
  if (response.status === 403) {
    throw { status: 403, message: 'Invalid TomTom API key or API service not enabled' };
  }
  if (response.status === 429) {
    throw { status: 429, message: 'TomTom API rate limit exceeded. Please try again later.' };
  }
  if (!response.ok) {
    throw { status: response.status, message: `Geocoding request failed with status ${response.status}` };
  }

  const data = await response.json();
  if (!data.results || data.results.length === 0) {
    return null;
  }
  return data.results[0].position;
}

// Search POIs from TomTom
async function fetchPois(lat, lon, radius, categorySet, queryText) {
  if (!TOMTOM_API_KEY) return [];
  const url = `https://api.tomtom.com/search/2/poiSearch/${encodeURIComponent(queryText)}.json?lat=${lat}&lon=${lon}&radius=${radius}&countrySet=IN&limit=50&categorySet=${categorySet}&key=${TOMTOM_API_KEY}`;
  const res = await fetch(url);
  if (!res.ok) {
    if (res.status === 401) throw { status: 401, message: 'Invalid or missing TomTom API key (401 Unauthorized)' };
    if (res.status === 403) throw { status: 403, message: 'Invalid TomTom API key or service not enabled' };
    if (res.status === 429) throw { status: 429, message: 'TomTom API rate limit exceeded' };
    return [];
  }
  const data = await res.json();
  return data.results || [];
}

// Main Search API (Supports both GET and POST)
async function handleSearch(req, res) {
  try {
    const location = (req.method === 'GET' ? req.query.location : req.body.location) || '';
    const category = (req.method === 'GET' ? req.query.category : req.body.category) || 'both';
    let userRadius = parseInt((req.method === 'GET' ? req.query.radius : req.body.radius) || '2000', 10);
    if (isNaN(userRadius) || userRadius <= 0) userRadius = 2000;

    const trimmedLoc = location.trim();
    if (!trimmedLoc) {
      return res.status(400).json({ error: 'Location query is required' });
    }

    const normCategory = category.toLowerCase().trim(); // 'restaurants', 'stays', or 'both'
    const cacheKey = `${trimmedLoc.toLowerCase()}:${normCategory}`;

    // Check cache
    const cached = searchCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp < CACHE_TTL_MS)) {
      console.log(`[Cache Hit] Query: "${trimmedLoc}" | Category: ${normCategory} | Total: ${cached.data.length} | Phone: ${cached.phoneCount} | Website: ${cached.websiteCount}`);
      return res.json({
        cached: true,
        location: trimmedLoc,
        category: normCategory,
        total: cached.data.length,
        phoneCount: cached.phoneCount,
        websiteCount: cached.websiteCount,
        results: cached.data
      });
    }

    // Step 1: Geocode
    const position = await geocodeLocation(trimmedLoc);
    if (!position) {
      return res.status(404).json({ error: 'Location not found' });
    }

    // Step 2: Auto-expanding radius search
    const radiusSteps = [Math.max(userRadius, 2000), 5000, 10000];
    let rawResults = [];
    let usedRadius = 2000;

    for (const r of radiusSteps) {
      usedRadius = r;
      let restResults = [];
      let stayResults = [];

      if (normCategory === 'restaurants' || normCategory === 'restaurant') {
        restResults = await fetchPois(position.lat, position.lon, r, '7315', 'restaurant');
      } else if (normCategory === 'stays' || normCategory === 'stay' || normCategory === 'hotels') {
        stayResults = await fetchPois(position.lat, position.lon, r, '7314', 'hotel');
      } else {
        // Both
        [restResults, stayResults] = await Promise.all([
          fetchPois(position.lat, position.lon, r, '7315', 'restaurant'),
          fetchPois(position.lat, position.lon, r, '7314', 'hotel')
        ]);
      }

      // Mark type
      const markedRest = restResults.map(item => ({ ...item, _computedType: 'Restaurant' }));
      const markedStay = stayResults.map(item => ({ ...item, _computedType: 'Stay' }));

      rawResults = [...markedRest, ...markedStay];

      if (rawResults.length >= 5) {
        break; // Reached target threshold
      }
    }

    // Step 3: Deduplicate (by normalized name + address)
    const seenMap = new Map();
    const deduplicated = [];

    for (const item of rawResults) {
      const poiName = (item.poi && item.poi.name) ? item.poi.name.trim() : '';
      const address = (item.address && item.address.freeformAddress) ? item.address.freeformAddress.trim() : '';
      const key = `${poiName.toLowerCase()}|${address.toLowerCase()}`;

      if (!seenMap.has(key)) {
        seenMap.set(key, true);
        deduplicated.push(item);
      }
    }

    // Step 4: Map properties
    const places = deduplicated.map(item => {
      const poi = item.poi || {};
      const addr = item.address || {};
      const pos = item.position || position;

      const rawPhone = poi.phone || (Array.isArray(poi.phoneNumbers) && poi.phoneNumbers[0] ? poi.phoneNumbers[0].phone : null);
      const phone = rawPhone ? rawPhone.trim() : 'Not available';

      const rawUrl = poi.url ? sanitizeUrl(poi.url) : null;
      const website = rawUrl || 'Not available';

      const type = item._computedType || (poi.categorySet && poi.categorySet.some(c => c.id === 7314) ? 'Stay' : 'Restaurant');
      const openingHours = formatOpeningHours(poi.openingHours);
      const mapLink = `https://www.google.com/maps?q=${pos.lat},${pos.lon}`;

      return {
        id: item.id || Math.random().toString(36).substr(2, 9),
        name: poi.name ? poi.name.trim() : 'Unknown Place',
        type,
        address: addr.freeformAddress ? addr.freeformAddress.trim() : 'Not available',
        phone,
        website,
        openingHours,
        mapLink,
        coordinates: { lat: pos.lat, lon: pos.lon }
      };
    });

    // Step 5: Parallel Website Health Check
    const checkedPlaces = await Promise.all(places.map(async (place) => {
      let status = 'Not listed';
      if (place.website && place.website !== 'Not available') {
        status = await checkWebsiteStatus(place.website);
      }
      return {
        ...place,
        websiteStatus: status
      };
    }));

    // Stats
    const phoneCount = checkedPlaces.filter(p => p.phone !== 'Not available').length;
    const websiteCount = checkedPlaces.filter(p => p.website !== 'Not available').length;

    // Cache results
    searchCache.set(cacheKey, {
      timestamp: Date.now(),
      phoneCount,
      websiteCount,
      data: checkedPlaces
    });

    // Log (WITHOUT API Key)
    console.log(`[Search] Query: "${trimmedLoc}" | Category: ${normCategory} | Radius: ${usedRadius}m | Total: ${checkedPlaces.length} | Phone: ${phoneCount} | Website: ${websiteCount}`);

    return res.json({
      cached: false,
      location: trimmedLoc,
      category: normCategory,
      radius: usedRadius,
      total: checkedPlaces.length,
      phoneCount,
      websiteCount,
      results: checkedPlaces
    });

  } catch (err) {
    console.error('[Search Error]', err.message || err);
    const statusCode = err.status || 500;
    return res.status(statusCode).json({
      error: err.message || 'An unexpected error occurred while searching for places.'
    });
  }
}

app.get('/api/search', handleSearch);
app.post('/api/search', handleSearch);

// Excel Export Endpoint
app.post('/api/export', async (req, res) => {
  try {
    const { rows = [], location = 'results' } = req.body;

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Location Finder';
    workbook.created = new Date();

    const worksheet = workbook.addWorksheet('Places');

    // Freeze header row & auto filter
    worksheet.views = [{ state: 'frozen', xSplit: 0, ySplit: 1 }];

    // Columns
    worksheet.columns = [
      { header: 'Name', key: 'name', width: 28 },
      { header: 'Type', key: 'type', width: 14 },
      { header: 'Address', key: 'address', width: 45 },
      { header: 'Phone', key: 'phone', width: 22 },
      { header: 'Website', key: 'website', width: 35 },
      { header: 'Website Status', key: 'websiteStatus', width: 20 },
      { header: 'Opening Hours', key: 'openingHours', width: 25 },
      { header: 'Map Link', key: 'mapLink', width: 35 }
    ];

    // Header styling
    const headerRow = worksheet.getRow(1);
    headerRow.height = 28;
    headerRow.eachCell((cell) => {
      cell.font = { name: 'Calibri', bold: true, color: { argb: 'FFFFFF' }, size: 11 };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: '1E293B' } // Dark Slate Navy
      };
      cell.alignment = { vertical: 'middle', horizontal: 'left' };
    });

    // Data rows
    rows.forEach((row) => {
      const addedRow = worksheet.addRow({
        name: row.name || 'Not available',
        type: row.type || 'Not available',
        address: row.address || 'Not available',
        phone: row.phone || 'Not available',
        website: row.website || 'Not available',
        websiteStatus: row.websiteStatus || 'Not listed',
        openingHours: row.openingHours || 'Not available',
        mapLink: row.mapLink || 'Not available'
      });

      addedRow.height = 22;

      // Cell alignment and borders
      addedRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: colNumber === 3 };
        cell.border = {
          top: { style: 'thin', color: { argb: 'E2E8F0' } },
          bottom: { style: 'thin', color: { argb: 'E2E8F0' } },
          left: { style: 'thin', color: { argb: 'E2E8F0' } },
          right: { style: 'thin', color: { argb: 'E2E8F0' } }
        };
      });

      // Website Status cell coloring
      const statusCell = addedRow.getCell('websiteStatus');
      const statusVal = row.websiteStatus || 'Not listed';

      if (statusVal === 'Active') {
        statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'DCFCE7' } }; // Soft green
        statusCell.font = { color: { argb: '166534' }, bold: true };
      } else if (statusVal === 'Active (restricted)') {
        statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEDD5' } }; // Soft orange
        statusCell.font = { color: { argb: '9A3412' }, bold: true };
      } else if (statusVal === 'Inactive') {
        statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FEE2E2' } }; // Soft red
        statusCell.font = { color: { argb: '991B1B' }, bold: true };
      } else {
        statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F3F4F6' } }; // Soft grey
        statusCell.font = { color: { argb: '4B5563' } };
      }

      // Hyperlink for Website
      const websiteCell = addedRow.getCell('website');
      if (row.website && row.website !== 'Not available') {
        websiteCell.value = { text: row.website, hyperlink: row.website };
        websiteCell.font = { color: { argb: '2563EB' }, underline: true };
      }

      // Hyperlink for Map Link
      const mapCell = addedRow.getCell('mapLink');
      if (row.mapLink && row.mapLink !== 'Not available') {
        mapCell.value = { text: 'View on Google Maps', hyperlink: row.mapLink };
        mapCell.font = { color: { argb: '2563EB' }, underline: true };
      }
    });

    // Auto filter range
    worksheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: 8 }
    };

    // Auto-fit column widths based on data length
    worksheet.columns.forEach((col) => {
      let maxLen = col.header ? col.header.length : 10;
      col.eachCell({ includeEmpty: false }, (cell) => {
        const val = cell.value;
        let strLen = 0;
        if (typeof val === 'string') strLen = val.length;
        else if (val && typeof val === 'object' && val.text) strLen = val.text.length;
        if (strLen > maxLen) maxLen = strLen;
      });
      col.width = Math.min(Math.max(maxLen + 4, 12), 60);
    });

    // File filename generation
    const sanitizedLoc = location.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_').substring(0, 30) || 'places';
    const dateStr = new Date().toISOString().split('T')[0];
    const filename = `places_${sanitizedLoc}_${dateStr}.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    await workbook.xlsx.write(res);
    res.end();

  } catch (err) {
    console.error('[Export Error]', err);
    res.status(500).json({ error: 'Failed to generate Excel file' });
  }
});

// Helper: Escape HTML special characters to prevent XSS
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Helper: Extract international or 10-digit phone digits for WhatsApp link
function getWhatsAppDigits(phoneStr) {
  if (!phoneStr) return null;
  const digits = String(phoneStr).replace(/\D/g, '');
  if (!digits || digits.length < 8) return null;
  // If standard 10-digit Indian phone number, prepend 91 country code
  if (digits.length === 10) return '91' + digits;
  return digits;
}

// Helper: Render Preview Error Page
function renderErrorPage(message) {
  const safeMsg = escapeHtml(message || 'The requested preview is invalid or has expired.');
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="noindex, nofollow">
  <title>Preview Unavailable - Location Finder</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0B0F19; color: #F9FAFB; display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 1.5rem; }
    .card { background: #111827; border: 1px solid #374151; border-radius: 14px; padding: 2.5rem 2rem; max-width: 480px; text-align: center; box-shadow: 0 15px 30px rgba(0,0,0,0.4); }
    .icon { width: 56px; height: 56px; border-radius: 50%; background: rgba(239, 68, 68, 0.12); color: #EF4444; display: inline-flex; align-items: center; justify-content: center; margin-bottom: 1.25rem; font-size: 1.75rem; font-weight: bold; }
    h1 { font-size: 1.35rem; color: #F9FAFB; margin-bottom: 0.75rem; font-weight: 700; }
    p { color: #9CA3AF; font-size: 0.95rem; line-height: 1.55; margin-bottom: 1.75rem; }
    .btn { display: inline-block; background: #3B82F6; color: #FFFFFF; padding: 0.75rem 1.5rem; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 0.9rem; transition: background 0.2s; }
    .btn:hover { background: #2563EB; }
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

// Helper: Render On-Demand Preview HTML (Complete, mobile-friendly, no external images)
function renderPreviewHtml(data) {
  const isStay = (data.type || '').toLowerCase().includes('stay') || (data.type || '').toLowerCase().includes('hotel');
  const safeName = escapeHtml(data.name || 'Business Preview');
  const safeType = escapeHtml(data.type || (isStay ? 'Stay' : 'Restaurant'));
  
  const hasAddress = Boolean(data.address && data.address !== 'Not available');
  const safeAddress = hasAddress ? escapeHtml(data.address) : null;

  const hasPhone = Boolean(data.phone && data.phone !== 'Not available');
  const safePhone = hasPhone ? escapeHtml(data.phone) : null;
  const cleanPhoneTel = hasPhone ? safePhone.replace(/[^\d+]/g, '') : null;
  const waDigits = hasPhone ? getWhatsAppDigits(data.phone) : null;

  const hasHours = Boolean(data.openingHours && data.openingHours !== 'Not available');
  const safeHours = hasHours ? escapeHtml(data.openingHours) : null;

  let mapUrl = data.mapLink && data.mapLink !== 'Not available' ? data.mapLink : null;
  if (!mapUrl && data.coordinates && data.coordinates.lat && data.coordinates.lon) {
    mapUrl = `https://www.google.com/maps?q=${data.coordinates.lat},${data.coordinates.lon}`;
  }
  const safeMapUrl = mapUrl ? escapeHtml(mapUrl) : null;

  const disclaimerText = `Preview prepared for ${safeName} by Susunetech. This is a draft preview created for demonstration purposes only. It is not the official website of the business and has not been approved or published by the owner.`;

  // Color Theme: Restaurant (Warm Terracotta / Gold) vs Stay (Tranquil Azure / Emerald)
  const theme = isStay ? {
    bg: '#0A101D',
    bgCard: '#101A2E',
    bgCardAlt: '#16233B',
    border: '#1E3252',
    borderLight: '#2A436D',
    text: '#F8FAFC',
    textMuted: '#94A3B8',
    textSubtle: '#64748B',
    primary: '#0284C7',
    primaryHover: '#0369A1',
    primaryGlow: 'rgba(2, 132, 199, 0.28)',
    accent: '#14B8A6',
    accentBg: 'rgba(20, 184, 166, 0.15)',
    accentBorder: 'rgba(20, 184, 166, 0.35)',
    accentText: '#2DD4BF',
    badgeText: '#38BDF8',
    badgeBg: 'rgba(56, 189, 248, 0.14)',
    badgeBorder: 'rgba(56, 189, 248, 0.3)',
    disclaimerBg: 'rgba(14, 165, 233, 0.1)',
    disclaimerBorder: 'rgba(14, 165, 233, 0.35)',
    disclaimerText: '#BAE6FD',
    iconColor: '#38BDF8'
  } : {
    bg: '#140E0C',
    bgCard: '#201613',
    bgCardAlt: '#2A1D19',
    border: '#442B22',
    borderLight: '#5C3A2E',
    text: '#FDF8F6',
    textMuted: '#A89993',
    textSubtle: '#786862',
    primary: '#EA580C',
    primaryHover: '#C2410C',
    primaryGlow: 'rgba(234, 88, 12, 0.28)',
    accent: '#F59E0B',
    accentBg: 'rgba(245, 158, 11, 0.15)',
    accentBorder: 'rgba(245, 158, 11, 0.35)',
    accentText: '#FBBF24',
    badgeText: '#FB923C',
    badgeBg: 'rgba(251, 146, 60, 0.14)',
    badgeBorder: 'rgba(251, 146, 60, 0.3)',
    disclaimerBg: 'rgba(245, 158, 11, 0.1)',
    disclaimerBorder: 'rgba(245, 158, 11, 0.35)',
    disclaimerText: '#FDE68A',
    iconColor: '#FB923C'
  };

  // Factual intro built strictly from given fields (never invented)
  const introText = hasAddress 
    ? `Welcome to ${safeName}, a ${safeType.toLowerCase()} situated at ${safeAddress}.`
    : `Welcome to ${safeName}, an established ${safeType.toLowerCase()}.`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="noindex, nofollow">
  <title>${safeName} - Preview Website</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      background-color: ${theme.bg};
      color: ${theme.text};
      line-height: 1.6;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
    }

    /* Disclaimer Banners */
    .disclaimer-banner {
      background-color: ${theme.disclaimerBg};
      border: 1px solid ${theme.disclaimerBorder};
      color: ${theme.disclaimerText};
      padding: 0.875rem 1.25rem;
      font-size: 0.8125rem;
      line-height: 1.5;
      text-align: center;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.625rem;
    }

    .disclaimer-banner strong {
      font-weight: 700;
    }

    .banner-icon {
      flex-shrink: 0;
      width: 16px;
      height: 16px;
    }

    /* Container */
    .site-container {
      max-width: 960px;
      margin: 0 auto;
      padding: 2rem 1.25rem;
      width: 100%;
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 2.25rem;
    }

    /* Top Brand Navigation */
    .brand-nav {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding-bottom: 1.25rem;
      border-bottom: 1px solid ${theme.border};
      gap: 1rem;
    }

    .brand-title {
      font-size: 1.25rem;
      font-weight: 700;
      color: ${theme.text};
      letter-spacing: -0.015em;
    }

    .type-badge {
      display: inline-flex;
      align-items: center;
      gap: 0.375rem;
      padding: 0.35rem 0.85rem;
      border-radius: 9999px;
      font-size: 0.75rem;
      font-weight: 700;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      background-color: ${theme.badgeBg};
      color: ${theme.badgeText};
      border: 1px solid ${theme.badgeBorder};
    }

    /* Hero Section */
    .hero-card {
      background: linear-gradient(145deg, ${theme.bgCard} 0%, ${theme.bgCardAlt} 100%);
      border: 1px solid ${theme.border};
      border-radius: 18px;
      padding: 2.5rem 2rem;
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.4);
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
    }

    .hero-heading {
      font-size: 2.25rem;
      font-weight: 800;
      letter-spacing: -0.025em;
      line-height: 1.2;
      color: ${theme.text};
    }

    .hero-intro {
      font-size: 1.05rem;
      color: ${theme.textMuted};
      max-width: 720px;
      line-height: 1.65;
    }

    /* Action Buttons Row */
    .action-buttons-group {
      display: flex;
      flex-wrap: wrap;
      gap: 0.875rem;
      margin-top: 0.5rem;
    }

    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      padding: 0.85rem 1.5rem;
      border-radius: 10px;
      font-size: 0.9375rem;
      font-weight: 600;
      text-decoration: none;
      cursor: pointer;
      transition: all 0.2s ease;
      min-height: 48px;
    }

    .btn-primary {
      background: ${theme.primary};
      color: #FFFFFF;
      box-shadow: 0 4px 16px ${theme.primaryGlow};
      border: 1px solid transparent;
    }

    .btn-primary:hover {
      background: ${theme.primaryHover};
      transform: translateY(-1px);
    }

    .btn-whatsapp {
      background: #15803D;
      color: #FFFFFF;
      box-shadow: 0 4px 14px rgba(22, 163, 74, 0.28);
      border: 1px solid transparent;
    }

    .btn-whatsapp:hover {
      background: #166534;
      transform: translateY(-1px);
    }

    .btn-directions {
      background: ${theme.bgCardAlt};
      color: ${theme.text};
      border: 1px solid ${theme.borderLight};
    }

    .btn-directions:hover {
      background: ${theme.border};
      border-color: ${theme.borderLight};
      transform: translateY(-1px);
    }

    /* Information Cards Grid */
    .details-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 1.5rem;
    }

    .info-card {
      background-color: ${theme.bgCard};
      border: 1px solid ${theme.border};
      border-radius: 14px;
      padding: 1.75rem;
      display: flex;
      flex-direction: column;
      gap: 1rem;
      transition: border-color 0.2s ease;
    }

    .info-card:hover {
      border-color: ${theme.borderLight};
    }

    .card-header {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }

    .card-icon {
      width: 40px;
      height: 40px;
      border-radius: 10px;
      background-color: ${theme.badgeBg};
      color: ${theme.iconColor};
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }

    .card-title {
      font-size: 1.05rem;
      font-weight: 700;
      color: ${theme.text};
    }

    .card-content {
      color: ${theme.textMuted};
      font-size: 0.9375rem;
      line-height: 1.6;
    }

    .card-link {
      color: ${theme.accentText};
      text-decoration: none;
      font-weight: 600;
      font-size: 0.875rem;
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      margin-top: auto;
      padding-top: 0.5rem;
    }

    .card-link:hover {
      text-decoration: underline;
    }

    /* Footer */
    .site-footer {
      border-top: 1px solid ${theme.border};
      padding: 2rem 1.25rem 1.5rem;
      text-align: center;
      color: ${theme.textSubtle};
      font-size: 0.8125rem;
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
      margin-top: auto;
    }

    @media (max-width: 640px) {
      .hero-heading {
        font-size: 1.75rem;
      }
      .hero-card {
        padding: 1.75rem 1.25rem;
      }
      .action-buttons-group {
        flex-direction: column;
      }
      .btn {
        width: 100%;
      }
    }
  </style>
</head>
<body>
  <!-- Top Disclaimer Banner -->
  <aside class="disclaimer-banner" role="complementary">
    <svg class="banner-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <circle cx="12" cy="12" r="10"/>
      <line x1="12" y1="8" x2="12" y2="12"/>
      <line x1="12" y1="16" x2="12.01" y2="16"/>
    </svg>
    <span>${disclaimerText}</span>
  </aside>

  <div class="site-container">
    <!-- Top Brand Navigation -->
    <header class="brand-nav">
      <div class="brand-title">${safeName}</div>
      <span class="type-badge">${safeType}</span>
    </header>

    <!-- Hero Section -->
    <main class="hero-card">
      <h1 class="hero-heading">${safeName}</h1>
      <p class="hero-intro">${introText}</p>

      ${(hasPhone || safeMapUrl) ? `
      <div class="action-buttons-group">
        ${hasPhone ? `
          <a href="tel:${cleanPhoneTel}" class="btn btn-primary">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
            </svg>
            <span>Call ${safePhone}</span>
          </a>
        ` : ''}

        ${waDigits ? `
          <a href="https://wa.me/${waDigits}" target="_blank" rel="noopener noreferrer" class="btn btn-whatsapp">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>
            </svg>
            <span>WhatsApp</span>
          </a>
        ` : ''}

        ${safeMapUrl ? `
          <a href="${safeMapUrl}" target="_blank" rel="noopener noreferrer" class="btn btn-directions">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polygon points="3 11 22 2 13 21 11 13 3 11"/>
            </svg>
            <span>Get directions</span>
          </a>
        ` : ''}
      </div>
      ` : ''}
    </main>

    <!-- Factual Detail Sections (Omitted entirely if data is missing) -->
    ${(hasAddress || hasHours || hasPhone) ? `
    <section class="details-grid">
      ${hasAddress ? `
      <div class="info-card">
        <div class="card-header">
          <div class="card-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/>
              <circle cx="12" cy="10" r="3"/>
            </svg>
          </div>
          <h2 class="card-title">Address & Location</h2>
        </div>
        <p class="card-content">${safeAddress}</p>
        ${safeMapUrl ? `
        <a href="${safeMapUrl}" target="_blank" rel="noopener noreferrer" class="card-link">
          <span>View on Google Maps</span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
        </a>
        ` : ''}
      </div>
      ` : ''}

      ${hasHours ? `
      <div class="info-card">
        <div class="card-header">
          <div class="card-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"/>
              <polyline points="12 6 12 12 16 14"/>
            </svg>
          </div>
          <h2 class="card-title">Opening Hours</h2>
        </div>
        <p class="card-content">${safeHours}</p>
      </div>
      ` : ''}

      ${hasPhone ? `
      <div class="info-card">
        <div class="card-header">
          <div class="card-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
            </svg>
          </div>
          <h2 class="card-title">Contact & Phone</h2>
        </div>
        <p class="card-content">${safePhone}</p>
        <a href="tel:${cleanPhoneTel}" class="card-link">
          <span>Call business</span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
        </a>
      </div>
      ` : ''}
    </section>
    ` : ''}
  </div>

  <!-- Bottom Disclaimer Banner -->
  <aside class="disclaimer-banner" role="complementary">
    <svg class="banner-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <circle cx="12" cy="12" r="10"/>
      <line x1="12" y1="8" x2="12" y2="12"/>
      <line x1="12" y1="16" x2="12.01" y2="16"/>
    </svg>
    <span>${disclaimerText}</span>
  </aside>

  <!-- Page Footer -->
  <footer class="site-footer">
    <p>Draft Website Preview &bull; Prepared by Susunetech</p>
  </footer>
</body>
</html>`;
}

// POST /api/generate-site - Builds preview token on-demand without writing files
app.post('/api/generate-site', (req, res) => {
  try {
    const { name, type, address, phone, openingHours, coordinates, mapLink } = req.body || {};

    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'Business name is required to generate a website preview.' });
    }

    const payload = {
      name: name.trim().slice(0, 200),
      type: (type || 'Restaurant').trim().slice(0, 50),
      address: address && address !== 'Not available' ? address.trim().slice(0, 300) : null,
      phone: phone && phone !== 'Not available' ? phone.trim().slice(0, 50) : null,
      openingHours: openingHours && openingHours !== 'Not available' ? openingHours.trim().slice(0, 200) : null,
      coordinates: coordinates && typeof coordinates === 'object' && coordinates.lat && coordinates.lon
        ? { lat: Number(coordinates.lat), lon: Number(coordinates.lon) }
        : null,
      mapLink: mapLink && mapLink !== 'Not available' ? mapLink.trim().slice(0, 500) : null
    };

    const jsonStr = JSON.stringify(payload);
    if (Buffer.byteLength(jsonStr, 'utf8') > 4096) {
      return res.status(400).json({ error: 'Payload exceeds allowed size limit.' });
    }

    const token = Buffer.from(jsonStr, 'utf8').toString('base64url');
    const previewUrl = `/preview/${token}`;

    return res.json({
      success: true,
      token,
      previewUrl,
      name: payload.name
    });
  } catch (err) {
    console.error('[Generate Site Error]', err);
    return res.status(500).json({ error: 'Failed to generate website preview.' });
  }
});

// GET /preview/:token - Decodes token, returns self-contained HTML page
app.get('/preview/:token', (req, res) => {
  // Search Engine Rules: Prevent indexing and crawling
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');

  const { token } = req.params;
  if (!token || typeof token !== 'string') {
    return res.status(400).send(renderErrorPage('Missing preview token.'));
  }

  try {
    const jsonStr = Buffer.from(token, 'base64url').toString('utf8');
    if (Buffer.byteLength(jsonStr, 'utf8') > 8192) {
      return res.status(400).send(renderErrorPage('Token payload exceeds allowed size limit.'));
    }

    const data = JSON.parse(jsonStr);
    if (!data || typeof data !== 'object' || !data.name) {
      return res.status(400).send(renderErrorPage('Invalid preview token or missing business data.'));
    }

    const html = renderPreviewHtml(data);
    return res.send(html);
  } catch (err) {
    console.error('[Preview Token Decode Error]', err);
    return res.status(400).send(renderErrorPage('Invalid or corrupted preview token.'));
  }
});

// Explicit robots.txt route with Disallow: /preview
app.get('/robots.txt', (req, res) => {
  res.type('text/plain');
  res.send('User-agent: *\nDisallow: /preview\n');
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`[Server] Location Finder server listening at http://localhost:${PORT}`);
  });
}

module.exports = app;

