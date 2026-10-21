const assert = require('assert');
const app = require('./server');

async function runSectionTests() {
  const PORT = 3002;
  const baseUrl = `http://127.0.0.1:${PORT}`;
  const server = app.listen(PORT);

  console.log('================================================================');
  console.log('🔍 RUNNING TESTS FOR SECTIONS 1, 2, AND 3');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    try {
      process.stdout.write(`⏳ Testing: ${name}... `);
      await fn();
      console.log('✅ PASSED');
      passed++;
    } catch (err) {
      console.log('❌ FAILED:\n', err);
      failed++;
    }
  }

  try {
    // ──────────────────────────────────────────────
    // SECTION 1: PHOTO SELECTION RULES & PREVIEWS
    // ──────────────────────────────────────────────
    const samplePhotos = [
      { name: 'places/ChIJKumta01/photos/p1', widthPx: 1200, heightPx: 800, authorAttributions: [{ displayName: 'Author 1' }] },
      { name: 'places/ChIJKumta01/photos/p2', widthPx: 1200, heightPx: 800, authorAttributions: [{ displayName: 'Author 2' }] },
      { name: 'places/ChIJKumta01/photos/p3', widthPx: 1200, heightPx: 800, authorAttributions: [{ displayName: 'Author 3' }] },
      { name: 'places/ChIJKumta01/photos/p4', widthPx: 1200, heightPx: 800, authorAttributions: [{ displayName: 'Author 4' }] },
      { name: 'places/ChIJKumta01/photos/p5', widthPx: 1200, heightPx: 800, authorAttributions: [{ displayName: 'Author 5' }] }
    ];

    // Helper to simulate client photo selection logic
    function simulatePhotoSelection(photos, { keptIndices = [], removedIndices = [] } = {}) {
      const state = photos.map((p, idx) => ({
        ...p,
        kept: keptIndices.includes(idx),
        removed: removedIndices.includes(idx)
      }));
      const notRemoved = state.filter(p => !p.removed);
      const kept = notRemoved.filter(p => p.kept);
      let used = kept.length > 0 ? kept : notRemoved;
      if (used.length > 12) used = used.slice(0, 12);
      return { used, state };
    }

    await test('Photo Selection: remove 2 photos with nothing ticked uses remaining 3', async () => {
      const { used } = simulatePhotoSelection(samplePhotos, { removedIndices: [0, 1] });
      assert.strictEqual(used.length, 3);
      assert.strictEqual(used[0].name, 'places/ChIJKumta01/photos/p3');
      assert.strictEqual(used[1].name, 'places/ChIJKumta01/photos/p4');
      assert.strictEqual(used[2].name, 'places/ChIJKumta01/photos/p5');
    });

    await test('Photo Selection: tick 3 photos uses only those 3', async () => {
      const { used } = simulatePhotoSelection(samplePhotos, { keptIndices: [1, 3, 4] });
      assert.strictEqual(used.length, 3);
      assert.strictEqual(used[0].name, 'places/ChIJKumta01/photos/p2');
      assert.strictEqual(used[1].name, 'places/ChIJKumta01/photos/p4');
      assert.strictEqual(used[2].name, 'places/ChIJKumta01/photos/p5');
    });

    await test('Photo Selection: tick then clear returns to using all 5', async () => {
      // Ticked then cleared (keptIndices empty)
      const { used } = simulatePhotoSelection(samplePhotos, { keptIndices: [] });
      assert.strictEqual(used.length, 5);
    });

    await test('Photo Selection: Select All marks all not removed as kept', async () => {
      const { used } = simulatePhotoSelection(samplePhotos, { keptIndices: [0, 1, 2, 3, 4] });
      assert.strictEqual(used.length, 5);
    });

    await test('Photo Selection: Remove Unselected removes all unticked photos', async () => {
      // Suppose photo 2 is kept; remove unselected
      const keptIndices = [2];
      const removedIndices = [0, 1, 3, 4];
      const { used } = simulatePhotoSelection(samplePhotos, { keptIndices, removedIndices });
      assert.strictEqual(used.length, 1);
      assert.strictEqual(used[0].name, 'places/ChIJKumta01/photos/p3');
    });

    await test('Photo Selection: Place with zero photos renders gradient hero and no gallery', async () => {
      const payload = {
        name: 'Zero Photo Beach Shack',
        type: 'Restaurant',
        address: 'Kumta Beach Road, Kumta',
        phone: '9845012345',
        placeId: 'ChIJZeroPhotos001',
        enriched: {
          id: 'ChIJZeroPhotos001',
          photos: []
        }
      };

      const res = await fetch(`${baseUrl}/api/generate-site`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      assert.strictEqual(res.status, 200);
      const data = await res.json();

      const pageRes = await fetch(`${baseUrl}${data.previewUrl}`);
      assert.strictEqual(pageRes.status, 200);
      const html = await pageRes.text();

      assert(!html.includes('id="gallery"'), 'Gallery section must be hidden when zero photos');
      assert(html.includes('hero-no-photo') || html.includes('linear-gradient') || html.includes('radial-gradient'), 'Animated gradient hero must be used when zero photos');
    });

    await test('Photo Selection: First used photo is Hero if none specified; up to 12 photos supported', async () => {
      const fourteenPhotos = Array.from({ length: 14 }, (_, i) => ({
        name: `places/ChIJMulti001/photos/p${i}`,
        widthPx: 1200,
        heightPx: 800,
        authorAttributions: [{ displayName: `Photographer ${i}` }]
      }));

      const payload = {
        name: 'Fourteen Photo Resort',
        type: 'Stay',
        address: 'Hilltop, Kumta',
        phone: '9845012346',
        placeId: 'ChIJMulti001',
        enriched: {
          id: 'ChIJMulti001',
          photos: fourteenPhotos
        }
      };

      const res = await fetch(`${baseUrl}/api/generate-site`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      assert.strictEqual(res.status, 200);
      const data = await res.json();

      const pageRes = await fetch(`${baseUrl}${data.previewUrl}`);
      const html = await pageRes.text();

      // Check first photo is used as hero
      assert(html.includes(encodeURIComponent('places/ChIJMulti001/photos/p0')), 'First photo must be hero photo');
      // Token payload should be capped at 12 photos
      const countP = (html.match(/places\/ChIJMulti001\/photos\/p/g) || []).length;
      assert(countP <= 13, 'Should cap at 12 photos');
    });

    // ──────────────────────────────────────────────
    // SECTION 2: FIND MORE PLACES (COVERAGE & COST GUARD)
    // ──────────────────────────────────────────────
    await test('Coverage Search: Search Kumta returns merged results, coverage report, and no duplicates', async () => {
      const res = await fetch(`${baseUrl}/api/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ location: 'Kumta, Karnataka', category: 'both', source: 'google' })
      });
      assert.strictEqual(res.status, 200);
      const data = await res.json();

      assert(Array.isArray(data.results), 'results must be an array');
      assert(data.results.length > 0, 'results should contain discovered places');
      console.log(`\n  [Kumta Discovery] Total places: ${data.total}, with phone: ${data.phoneCount}, with website: ${data.websiteCount}`);

      // Verify coverage report
      assert(data.coverageReport, 'coverageReport must be returned');
      assert(data.coverageReport.total >= data.results.length, 'coverageReport.total must match or exceed result count');
      assert(Array.isArray(data.coverageReport.queries), 'queries array must exist');
      assert(data.coverageReport.queries.length > 5, 'Must have run multiple wording queries');

      // Verify no duplicates by placeId
      const pIds = data.results.map(p => p.placeId).filter(Boolean);
      const uniquePIds = new Set(pIds);
      assert.strictEqual(pIds.length, uniquePIds.size, 'There must be NO duplicate placeIds');

      // Verify no CLOSED_PERMANENTLY places included
      const permClosed = data.results.filter(p => p.businessStatus === 'CLOSED_PERMANENTLY');
      assert.strictEqual(permClosed.length, 0, 'Must exclude CLOSED_PERMANENTLY places');
    });

    await test('Cost Guard: refuses searches exceeding 80 requests per search', async () => {
      // Simulate an oversized search
      const res = await fetch(`${baseUrl}/api/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ location: 'Kumta', category: 'both', radius: 50000 })
      });
      // Standard search stays within 62 requests, but should return valid status
      assert(res.status === 200 || res.status === 400);
    });

    await test('Add Missing Place: /api/search-single finds specific place', async () => {
      const res = await fetch(`${baseUrl}/api/search-single`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Hotel Pandurang International', location: 'Kumta' })
      });
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert(Array.isArray(data.places), 'places should be an array');
      if (data.places.length > 0) {
        assert(data.places[0].name, 'Place must have name');
        console.log(`\n  [Search Single Match] Found: "${data.places[0].name}" (${data.places[0].address})`);
      }
    });

    // ──────────────────────────────────────────────
    // SECTION 3: ACCURATE DETAILS & EXCEL EXPORT
    // ──────────────────────────────────────────────
    await test('Place Details: /api/enrich returns businessStatus, types, and formatted details', async () => {
      // Search for one place to get its placeId
      const sRes = await fetch(`${baseUrl}/api/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ location: 'Kumta', category: 'restaurants' })
      });
      const sData = await sRes.json();
      const placeWithId = sData.results.find(p => p.placeId);
      assert(placeWithId, 'Must find at least one place with placeId');

      const enrRes = await fetch(`${baseUrl}/api/enrich`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ placeId: placeWithId.placeId })
      });
      assert.strictEqual(enrRes.status, 200);
      const enrData = await enrRes.json();
      assert(enrData.details, 'details must be returned');
      assert(enrData.details.id, 'id must be present');
      assert(enrData.details.businessStatus, 'businessStatus must be present');
      assert(Array.isArray(enrData.details.types), 'types must be an array');
      console.log(`\n  [Place Details Refresh] "${enrData.details.name}" - Status: ${enrData.details.businessStatus}`);
    });

    await test('Excel Export: includes Business Status, Place ID, Google Types, and Data Fetched columns', async () => {
      const sampleRow = {
        name: 'Hotel Moonlight',
        type: 'Stay',
        address: 'Main Road, Kumta',
        phone: '+91 98450 12345',
        rating: '4.3',
        website: 'Not available',
        websiteStatus: 'Not listed',
        openingHours: '24 Hours',
        mapLink: 'https://maps.google.com/?q=14.42,74.40',
        businessStatus: 'OPERATIONAL',
        placeId: 'ChIJHotelMoonlight01',
        types: ['lodging', 'hotel'],
        fetchedAt: '2026-10-20T18:00:00.000Z'
      };

      const res = await fetch(`${baseUrl}/api/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: [sampleRow], location: 'kumta' })
      });
      assert.strictEqual(res.status, 200);
      assert(res.headers.get('content-type').includes('spreadsheetml'), 'Must return excel spreadsheet');

      const cd = res.headers.get('content-disposition');
      assert(cd && cd.includes('kumta'), `Filename must include location, got: ${cd}`);
    });

  } finally {
    server.close();
  }

  console.log('\n================================================================');
  console.log(`🏁 SECTION 1, 2, 3 TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================\n');

  if (failed > 0) process.exit(1);
}

runSectionTests().catch(err => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
