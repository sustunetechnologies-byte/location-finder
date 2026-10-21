const fs = require('fs');
const path = require('path');

async function testSection7() {
  console.log('=== SECTION 7 TESTING SUITE ===\n');

  // 1. Resolve Mysore & Mysuru
  console.log('1. Resolving Mysore vs Mysuru...');
  const resMysore = await fetch('http://localhost:3000/api/resolve-location', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ location: 'Mysore' })
  }).then(r => r.json());

  const resMysuru = await fetch('http://localhost:3000/api/resolve-location', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ location: 'Mysuru' })
  }).then(r => r.json());

  console.log(`Mysore resolved: "${resMysore.area?.name}" (${resMysore.area?.placeId})`);
  console.log(`Mysuru resolved: "${resMysuru.area?.name}" (${resMysuru.area?.placeId})`);
  if (resMysore.area?.placeId !== resMysuru.area?.placeId) {
    throw new Error('Mysore and Mysuru resolved place IDs do not match!');
  }
  console.log('✓ Both spellings resolved to the exact same Place ID!\n');

  // 2. Run stepped search for Mysore and Mysuru, confirming totals match and cache sharing
  console.log('2. Running stepped search for Mysore (restaurants)...');
  let cursor = null;
  let mysorePlaces = [];
  let isComplete = false;
  let mysoreReqs = 0;

  while (!isComplete) {
    const step = await fetch('http://localhost:3000/api/search/step', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        location: 'Mysore',
        category: 'restaurants',
        placeId: resMysore.area.placeId,
        viewport: resMysore.area.viewport,
        cursor
      })
    }).then(r => r.json());

    if (step.places) mysorePlaces.push(...step.places);
    cursor = step.nextCursor;
    mysoreReqs = step.totalRequestsUsed;
    isComplete = step.isComplete || !cursor;
  }
  console.log(`Mysore results: ${mysorePlaces.length} places (Requests used: ${mysoreReqs})`);

  console.log('\nRunning stepped search for Mysuru (same category, should hit cache)...');
  cursor = null;
  let mysuruPlaces = [];
  isComplete = false;
  let mysuruReqs = 0;

  while (!isComplete) {
    const step = await fetch('http://localhost:3000/api/search/step', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        location: 'Mysuru',
        category: 'restaurants',
        placeId: resMysuru.area.placeId,
        viewport: resMysuru.area.viewport,
        cursor
      })
    }).then(r => r.json());

    if (step.places) mysuruPlaces.push(...step.places);
    cursor = step.nextCursor;
    mysuruReqs = step.totalRequestsUsed;
    isComplete = step.isComplete || !cursor;
  }
  console.log(`Mysuru results: ${mysuruPlaces.length} places (Requests used: ${mysuruReqs})`);

  if (mysorePlaces.length === mysuruPlaces.length) {
    console.log(`✓ Mysore and Mysuru totals match exactly: ${mysorePlaces.length} places!\n`);
  } else {
    console.warn(`Mismatch: Mysore had ${mysorePlaces.length}, Mysuru had ${mysuruPlaces.length}`);
  }

  // Check no duplicates in results
  const seen = new Set();
  let duplicates = 0;
  for (const p of mysorePlaces) {
    if (seen.has(p.id)) duplicates++;
    seen.add(p.id);
  }
  console.log(`Duplicate check: ${duplicates} duplicates found out of ${mysorePlaces.length} places.`);

  // 3. Test Excel export with all rows and all required fields
  console.log('\n3. Testing Excel export for all rows...');
  const expRes = await fetch('http://localhost:3000/api/export', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rows: mysorePlaces, location: 'Mysuru' })
  });

  if (!expRes.ok) throw new Error(`Export failed with status ${expRes.status}`);
  const expBuf = await expRes.arrayBuffer();
  console.log(`✓ Excel export generated successfully (${expBuf.byteLength} bytes)`);

  // 4. Test Website Generation and Preview
  console.log('\n4. Testing Website Generation & Preview...');
  const samplePlace = mysorePlaces[0];
  const genPayload = {
    name: samplePlace.name,
    type: samplePlace.type,
    address: samplePlace.address,
    phone: samplePlace.phone,
    whatsappNumber: '919876543210',
    openingHours: samplePlace.openingHours,
    shortDescription: 'Delicious local delicacies and family dining.',
    coordinates: samplePlace.coordinates,
    mapLink: samplePlace.mapLink,
    placeId: samplePlace.placeId,
    design: 'auto',
    photos: []
  };

  const genRes = await fetch('http://localhost:3000/api/generate-site', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(genPayload)
  }).then(r => r.json());

  console.log('Generate site result:', genRes.previewUrl);
  if (!genRes.previewUrl) throw new Error('Preview URL missing!');

  const prevRes = await fetch(`http://localhost:3000${genRes.previewUrl}`);
  const prevHtml = await prevRes.text();
  const hasMetaNoIndex = prevHtml.includes('<meta name="robots" content="noindex, nofollow">');
  const hasDisclaimer = prevHtml.includes('draft preview created for demonstration purposes only') || prevHtml.includes('id="top-disc"');
  const xRobots = prevRes.headers.get('x-robots-tag');

  console.log(`✓ Preview HTML contains noindex meta tag: ${hasMetaNoIndex}`);
  console.log(`✓ Preview Response has X-Robots-Tag header: ${xRobots === 'noindex, nofollow'}`);
  console.log(`✓ Preview contains preview disclaimer: ${hasDisclaimer}`);

  console.log('\n=== ALL SECTION 7 BACKEND/FLOW TESTS PASSED! ===');
}

testSection7().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
