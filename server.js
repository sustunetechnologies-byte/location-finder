require('dotenv').config();
const express = require('express');
const path = require('path');
const ExcelJS = require('exceljs');

const app = express();
const PORT = process.env.PORT || 3000;
const TOMTOM_API_KEY = process.env.TOMTOM_API_KEY;

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
  const geoUrl = `https://api.tomtom.com/search/2/geocode/${encodeURIComponent(locationStr)}.json?countrySet=IN&limit=1&key=${TOMTOM_API_KEY}`;
  const response = await fetch(geoUrl);
  
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
  const url = `https://api.tomtom.com/search/2/poiSearch/${encodeURIComponent(queryText)}.json?lat=${lat}&lon=${lon}&radius=${radius}&countrySet=IN&limit=50&categorySet=${categorySet}&key=${TOMTOM_API_KEY}`;
  const res = await fetch(url);
  if (!res.ok) {
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

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`[Server] Location Finder server listening at http://localhost:${PORT}`);
  });
}

module.exports = app;

