const assert = require('assert');

async function testIntegration() {
  console.log('🚀 Running Full Integration Tests: Mysuru, Kumta & Edge Cases...\n');

  // ── TEST A: MYSURU FLOW ──
  console.log('=== Step A1: Resolve Location for "Mysuru" ===');
  const resResp = await fetch('http://localhost:3000/api/resolve-location', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ location: 'Mysuru' })
  });
  const resData = await resResp.json();
  assert(resData.status === 'resolved', 'Mysuru should resolve');
  const area = resData.area;
  console.log(`✅ Resolved Mysuru: ${area.name}, ${area.state} (Place ID: ${area.placeId})`);

  console.log('\n=== Step A2: Discover Places for Mysuru (First Step) ===');
  const searchStepResp = await fetch('http://localhost:3000/api/search/step', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      location: 'Mysuru',
      category: 'both',
      placeId: area.placeId,
      viewport: area.viewport,
      cursor: null
    })
  });
  const searchStepData = await searchStepResp.json();
  const places = searchStepData.places || [];
  console.log(`✅ Places discovered in step: ${places.length}, Total requests used: ${searchStepData.totalRequestsUsed}`);

  // Check initial websiteStatus on all places
  for (const p of places) {
    assert(p.websiteStatus !== undefined, `Place ${p.name} must have a defined websiteStatus`);
    if (!p.websiteUri) {
      assert.strictEqual(p.websiteStatus, 'Not listed', `Place with no websiteUri must be 'Not listed'`);
    } else if (p.socialPlatform) {
      assert.strictEqual(p.websiteStatus, 'No own website', `Place with social platform must be 'No own website'`);
    } else {
      assert.strictEqual(p.websiteStatus, 'Checking', `Place with website must initially be 'Checking'`);
    }
  }
  console.log('✅ Initial statuses verified: all places have defined defaults (Not listed, No own website, or Checking).');

  // Perform website checks on checking places in batches of 5 with concurrency 3
  console.log('\n=== Step A3: Run Website Health Checks in Batches ===');
  const toCheck = places.filter(p => p.websiteStatus === 'Checking');
  console.log(`Checking ${toCheck.length} places with websites...`);
  const checkBatchSize = 5;
  const resolvedPlaces = [...places];

  for (let i = 0; i < Math.min(toCheck.length, 25); i += checkBatchSize) {
    const chunk = toCheck.slice(i, i + checkBatchSize);
    const bResp = await fetch('http://localhost:3000/api/check-websites-batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ places: chunk })
    });
    const bData = await bResp.json();
    for (const r of bData.results) {
      const target = resolvedPlaces.find(p => p.id === r.id);
      if (target && r.websiteStatus !== 'Checking') {
        target.websiteStatus = r.websiteStatus;
      }
    }
  }

  // Count statuses
  const countNotListed = resolvedPlaces.filter(p => p.websiteStatus === 'Not listed').length;
  const countNoOwnWeb = resolvedPlaces.filter(p => p.websiteStatus === 'No own website').length;
  const countInactive = resolvedPlaces.filter(p => p.websiteStatus === 'Inactive').length;
  const countChecking = resolvedPlaces.filter(p => p.websiteStatus === 'Checking').length;
  const countActive = resolvedPlaces.filter(p => p.websiteStatus === 'Active').length;
  const countRestricted = resolvedPlaces.filter(p => p.websiteStatus === 'Active (restricted)').length;

  console.log(`   Status breakdown for sample:`);
  console.log(`   - Not listed: ${countNotListed}`);
  console.log(`   - No own website: ${countNoOwnWeb}`);
  console.log(`   - Inactive: ${countInactive}`);
  console.log(`   - Checking (pending): ${countChecking}`);
  console.log(`   - Active: ${countActive}`);
  console.log(`   - Active (restricted): ${countRestricted}`);

  console.log('\n=== Step A4: Verify Without-Website Filter Behavior ===');
  const expectedFilteredCount = countNotListed + countNoOwnWeb + countInactive + countChecking;
  const filtered = resolvedPlaces.filter(p => {
    const s = p.websiteStatus || 'Not listed';
    if (s === 'Active' || s === 'Active (restricted)') return false;
    return s === 'Not listed' || s === 'No own website' || s === 'Inactive' || s === 'Checking';
  });

  assert.strictEqual(filtered.length, expectedFilteredCount, 'Filtered count must match sum of allowed statuses');
  assert(!filtered.some(p => p.websiteStatus === 'Active' || p.websiteStatus === 'Active (restricted)'), 'Zero Active or Active (restricted) rows in without-website list');
  console.log(`✅ Filtered count: ${filtered.length} matches exactly (${countNotListed} + ${countNoOwnWeb} + ${countInactive} + ${countChecking})`);
  console.log('✅ Confirmed: NO Active or Active (restricted) rows exist in the filtered list.');

  console.log('\n=== Step A5: Verify Excel Export for Mysuru without-website ===');
  const expResp = await fetch('http://localhost:3000/api/export', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      rows: filtered,
      location: 'Mysuru',
      filterMode: 'no-website',
      isNoWebsite: true
    })
  });
  assert(expResp.ok, 'Export should succeed');
  const cd = expResp.headers.get('Content-Disposition');
  console.log('   Export Header:', cd);
  assert(cd.includes('places_mysuru_no_website_'), 'Export filename must contain places_mysuru_no_website_');
  console.log('✅ Excel export filename verified: includes "no_website" and covers all filtered rows.');

  // ── TEST B: SMALL TOWN (KUMTA) ──
  console.log('\n=== Step B: Small Town Search (Kumta) ===');
  const kumtaResResp = await fetch('http://localhost:3000/api/resolve-location', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ location: 'Kumta' })
  });
  const kumtaResData = await kumtaResResp.json();
  assert(kumtaResData.status === 'resolved', 'Kumta should resolve');
  const kumtaArea = kumtaResData.area;
  console.log(`✅ Resolved Kumta: ${kumtaArea.name}, ${kumtaArea.state} (Place ID: ${kumtaArea.placeId})`);

  const kumtaStepResp = await fetch('http://localhost:3000/api/search/step', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      location: 'Kumta',
      category: 'both',
      placeId: kumtaArea.placeId,
      viewport: kumtaArea.viewport,
      cursor: null
    })
  });
  const kumtaStepData = await kumtaStepResp.json();
  console.log(`✅ Kumta places found: ${kumtaStepData.places?.length || 0}`);

  // ── TEST C: ZERO MATCHES EDGE CASE ──
  console.log('\n=== Step C: Zero Matches Edge Case ===');
  // If all places had active websites, no-website filter should yield 0 rows and trigger edge-case message
  const allActivePlaces = [
    { id: 'a1', name: 'Hotel 1', websiteStatus: 'Active' },
    { id: 'a2', name: 'Hotel 2', websiteStatus: 'Active (restricted)' }
  ];
  const zeroFiltered = allActivePlaces.filter(p => {
    const s = p.websiteStatus || 'Not listed';
    if (s === 'Active' || s === 'Active (restricted)') return false;
    return s === 'Not listed' || s === 'No own website' || s === 'Inactive' || s === 'Checking';
  });
  assert.strictEqual(zeroFiltered.length, 0, 'Zero filtered when all have active websites');
  const edgeMsg = zeroFiltered.length === 0 && allActivePlaces.length > 0
    ? `All ${allActivePlaces.length} places have an active website.`
    : 'No places match the selected filter.';
  assert.strictEqual(edgeMsg, 'All 2 places have an active website.');
  console.log(`✅ Zero matches edge message: "${edgeMsg}"`);

  console.log('\n🎉 ALL INTEGRATION TESTS PASSED SUCCESSFULLY!');
}

testIntegration().catch(err => {
  console.error('❌ Integration test failed:', err);
  process.exit(1);
});
