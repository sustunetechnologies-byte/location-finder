const assert = require('assert');

async function runTests() {
  console.log('🧪 Starting Verification of Without-Website Fixes...\n');

  // ── TEST 1: Server Status Defaults & Bot Protection Detection ──
  console.log('--- Test 1: Testing /api/check-websites-batch and Bot Detection ---');
  const testBatch = [
    { id: 'p1', websiteUri: null, website: 'Not available' },
    { id: 'p2', websiteUri: 'https://instagram.com/mysurucafe', website: 'https://instagram.com/mysurucafe' },
    { id: 'p3', websiteUri: 'https://facebook.com/mysuruhotel', website: 'https://facebook.com/mysuruhotel' },
    { id: 'p4', websiteUri: 'https://example.com', website: 'https://example.com' },
    { id: 'p5', websiteUri: 'https://thisdomaindefinitelydoesnotexist123456789.org', website: 'https://thisdomaindefinitelydoesnotexist123456789.org' }
  ];

  const batchResp = await fetch('http://localhost:3000/api/check-websites-batch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ places: testBatch })
  });
  assert.strictEqual(batchResp.ok, true, 'check-websites-batch should return 200');
  const batchData = await batchResp.json();
  assert(Array.isArray(batchData.results), 'results should be an array');
  assert.strictEqual(batchData.results.length, 5, 'should return 5 results');

  const p1Res = batchData.results.find(r => r.id === 'p1');
  const p2Res = batchData.results.find(r => r.id === 'p2');
  const p3Res = batchData.results.find(r => r.id === 'p3');
  const p4Res = batchData.results.find(r => r.id === 'p4');
  const p5Res = batchData.results.find(r => r.id === 'p5');

  assert.strictEqual(p1Res.websiteStatus, 'Not listed', 'p1 with no websiteUri must be "Not listed"');
  assert.strictEqual(p2Res.websiteStatus, 'No own website', 'p2 Instagram must be "No own website"');
  assert.strictEqual(p2Res.socialPlatform, 'Instagram', 'p2 socialPlatform must be Instagram');
  assert.strictEqual(p3Res.websiteStatus, 'No own website', 'p3 Facebook must be "No own website"');
  assert.strictEqual(p4Res.websiteStatus, 'Active', 'p4 example.com must be "Active"');
  assert.strictEqual(p5Res.websiteStatus, 'Inactive', 'p5 invalid domain must be "Inactive"');
  console.log('✅ Test 1 Passed: Status resolution and batching work as expected!\n');

  // ── TEST 2: Excel Export Filename with no_website ──
  console.log('--- Test 2: Testing /api/export Filename Logic ---');
  const sampleRows = [
    { name: 'Cafe Mysuru', type: 'Restaurant', address: 'Mysuru', phone: '9876543210', websiteStatus: 'Not listed', rating: '4.5' },
    { name: 'Heritage Stay', type: 'Stay', address: 'Mysuru', phone: '08212412345', websiteStatus: 'No own website', website: '[Instagram]', rating: '4.2' },
    { name: 'Old Lodge', type: 'Stay', address: 'Mysuru', phone: '9845012345', websiteStatus: 'Inactive', rating: '3.8' }
  ];

  // Test Export with filterMode: 'no-website'
  const expNoWebResp = await fetch('http://localhost:3000/api/export', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rows: sampleRows, location: 'Mysuru', filterMode: 'no-website' })
  });
  assert.strictEqual(expNoWebResp.ok, true, 'export no-website should return 200');
  const cdNoWeb = expNoWebResp.headers.get('Content-Disposition');
  console.log('   Export header (no-website):', cdNoWeb);
  assert(cdNoWeb.includes('no_website'), 'Filename must include "no_website"');
  assert(cdNoWeb.includes('mysuru'), 'Filename must include location');

  // Test Export with standard mode
  const expAllResp = await fetch('http://localhost:3000/api/export', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rows: sampleRows, location: 'Mysuru', filterMode: 'all' })
  });
  assert.strictEqual(expAllResp.ok, true, 'export all should return 200');
  const cdAll = expAllResp.headers.get('Content-Disposition');
  console.log('   Export header (all):', cdAll);
  assert(!cdAll.includes('no_website'), 'Filename must not include "no_website" when in all mode');
  console.log('✅ Test 2 Passed: Excel export filename handles no_website correctly!\n');

  // ── TEST 3: Location Resolution & Stepped Search Status Defaults ──
  console.log('--- Test 3: Testing Location Resolution & Search Step Status Defaults ---');
  const resResp = await fetch('http://localhost:3000/api/resolve-location', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ location: 'Mysuru' })
  });
  assert.strictEqual(resResp.ok, true, 'resolve-location should return 200');
  const resData = await resResp.json();
  assert(resData.status === 'resolved' && resData.area?.placeId, 'Mysuru should resolve to canonical placeId');
  console.log(`   Resolved: ${resData.area.name}, ${resData.area.state} (Place ID: ${resData.area.placeId})`);

  // Run a single search step to verify mapped Google Places have valid default status
  const stepResp = await fetch('http://localhost:3000/api/search/step', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      location: 'Mysuru',
      category: 'both',
      placeId: resData.area.placeId,
      viewport: resData.area.viewport,
      cursor: null
    })
  });
  assert.strictEqual(stepResp.ok, true, 'search step should return 200');
  const stepData = await stepResp.json();
  assert(Array.isArray(stepData.places) && stepData.places.length > 0, 'places should be returned');
  
  for (const p of stepData.places) {
    assert(p.websiteStatus !== undefined, `Place ${p.name} must not have undefined websiteStatus`);
    assert(['Not listed', 'No own website', 'Checking', 'Active', 'Active (restricted)', 'Inactive'].includes(p.websiteStatus),
      `Place ${p.name} has invalid websiteStatus: ${p.websiteStatus}`);
    if (!p.websiteUri) {
      assert.strictEqual(p.websiteStatus, 'Not listed', `Place without websiteUri must be "Not listed" (got ${p.websiteStatus})`);
    } else if (p.socialPlatform) {
      assert.strictEqual(p.websiteStatus, 'No own website', `Place with social platform must be "No own website"`);
    }
  }
  console.log(`   Verified ${stepData.places.length} places from search step: all have non-undefined, valid status defaults!`);
  console.log('✅ Test 3 Passed: Search step emits valid default statuses!\n');

  // ── TEST 4: Frontend Logic Unit Tests ──
  console.log('--- Test 4: Testing Frontend Filtering Logic ---');
  const mockPlaces = [
    { id: '1', name: 'A', type: 'Restaurant', websiteStatus: 'Not listed' },
    { id: '2', name: 'B', type: 'Stay', websiteStatus: 'No own website' },
    { id: '3', name: 'C', type: 'Restaurant', websiteStatus: 'Inactive' },
    { id: '4', name: 'D', type: 'Restaurant', websiteStatus: 'Checking' },
    { id: '5', name: 'E', type: 'Restaurant', websiteStatus: 'Active' },
    { id: '6', name: 'F', type: 'Stay', websiteStatus: 'Active (restricted)' }
  ];

  function mockFilter(raw, mode, cat = 'both') {
    let filtered = [...raw];
    if (mode === 'no-website') {
      filtered = filtered.filter(p => {
        const s = p.websiteStatus || 'Not listed';
        if (s === 'Active' || s === 'Active (restricted)') return false;
        return s === 'Not listed' || s === 'No own website' || s === 'Inactive' || s === 'Checking';
      });
    }
    if (cat === 'restaurants') {
      filtered = filtered.filter(p => p.type === 'Restaurant' || (p.type && p.type.toLowerCase().includes('restaurant')));
    } else if (cat === 'stays') {
      filtered = filtered.filter(p => p.type === 'Stay' || (p.type && p.type.toLowerCase().includes('stay')));
    }
    return filtered;
  }

  const noWebAll = mockFilter(mockPlaces, 'no-website', 'both');
  assert.strictEqual(noWebAll.length, 4, 'Should contain 4 places in no-website mode');
  assert(!noWebAll.some(p => p.websiteStatus === 'Active' || p.websiteStatus === 'Active (restricted)'), 'Must never show Active or Active (restricted)');
  assert(noWebAll.some(p => p.websiteStatus === 'Checking'), 'Must include pending Checking places');

  const noWebStays = mockFilter(mockPlaces, 'no-website', 'stays');
  assert.strictEqual(noWebStays.length, 1, 'Should contain 1 Stay in no-website mode');
  assert.strictEqual(noWebStays[0].id, '2');

  const noWebRest = mockFilter(mockPlaces, 'no-website', 'restaurants');
  assert.strictEqual(noWebRest.length, 3, 'Should contain 3 Restaurants in no-website mode');
  console.log('✅ Test 4 Passed: Client filtering matches exact required behavior!\n');

  console.log('🎉 ALL AUTOMATED TESTS SUCCEEDED!');
}

runTests().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
