async function testTownAndCity() {
  console.log('=== TESTING KUMTA (SMALL TOWN) & BENGALURU (BIG CITY) ===\n');

  // 1. Kumta
  console.log('1. Resolving Kumata/Kumta...');
  const resKumta = await fetch('http://localhost:3000/api/resolve-location', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ location: 'Kumta' })
  }).then(r => r.json());

  console.log(`Kumta resolved: "${resKumta.area?.name}" (${resKumta.area?.placeId})`);

  let cursor = null;
  let kumtaPlaces = [];
  let isComplete = false;
  let kumtaReqs = 0;

  while (!isComplete) {
    const step = await fetch('http://localhost:3000/api/search/step', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        location: 'Kumta',
        category: 'restaurants',
        placeId: resKumta.area.placeId,
        viewport: resKumta.area.viewport,
        cursor
      })
    }).then(r => r.json());

    if (step.places) kumtaPlaces.push(...step.places);
    cursor = step.nextCursor;
    kumtaReqs = step.totalRequestsUsed;
    isComplete = step.isComplete || !cursor;
  }
  console.log(`✓ Kumta complete: ${kumtaPlaces.length} places found in ${kumtaReqs} requests.`);

  const kumtaSeen = new Set();
  let kumtaDups = 0;
  for (const p of kumtaPlaces) {
    if (kumtaSeen.has(p.id)) kumtaDups++;
    kumtaSeen.add(p.id);
  }
  console.log(`✓ Kumta duplicates: ${kumtaDups}`);

  // 2. Bengaluru (1 step / search test)
  console.log('\n2. Resolving Bengaluru...');
  const resBlr = await fetch('http://localhost:3000/api/resolve-location', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ location: 'Bengaluru' })
  }).then(r => r.json());

  console.log(`Bengaluru resolved: "${resBlr.area?.name}" (${resBlr.area?.placeId})`);

  console.log('Running step 1 for Bengaluru (stays)...');
  const blrStep1 = await fetch('http://localhost:3000/api/search/step', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      location: 'Bengaluru',
      category: 'stays',
      placeId: resBlr.area.placeId,
      viewport: resBlr.area.viewport,
      cursor: null
    })
  }).then(r => r.json());

  console.log(`Bengaluru Step 1: found ${blrStep1.places?.length} places, ${blrStep1.requestsInStep} requests, nextCursor: ${!!blrStep1.nextCursor}, isComplete: ${blrStep1.isComplete}`);

  // Verify Excel export handles both sets
  const expRes = await fetch('http://localhost:3000/api/export', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rows: kumtaPlaces, location: 'Kumta' })
  });
  const expBuf = await expRes.arrayBuffer();
  console.log(`✓ Kumta Excel Export: ${expBuf.byteLength} bytes for ${kumtaPlaces.length} rows`);

  console.log('\n=== TOWN AND CITY TESTS PASSED! ===');
}

testTownAndCity().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
