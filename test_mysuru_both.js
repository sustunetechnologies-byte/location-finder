const fs = require('fs');

async function runMysuruBothSearch() {
  console.log('=== TEST: Mysuru Search with category "both" ===\n');

  // 1. Resolve Mysuru
  console.log('1. Resolving location "Mysuru"...');
  const resolveRes = await fetch('http://localhost:3000/api/resolve-location', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ location: 'Mysuru' })
  });
  if (!resolveRes.ok) {
    throw new Error(`Resolve location failed: ${resolveRes.statusText}`);
  }
  const resolveData = await resolveRes.json();
  console.log(`Resolved: "${resolveData.area?.name}", ${resolveData.area?.state} (${resolveData.area?.placeId})`);
  const area = resolveData.area;

  // 2. Stepped search loop with category 'both'
  console.log('\n2. Running stepped search for Mysuru with category "both"...');
  let cursor = null;
  let allPlaces = [];
  let isComplete = false;
  let totalRequestsUsed = 0;
  let isCapped = false;
  let stepErrors = [];
  let stepNumber = 0;

  while (!isComplete) {
    stepNumber++;
    process.stdout.write(`  Step ${stepNumber}... `);
    const stepResp = await fetch('http://localhost:3000/api/search/step', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        location: 'Mysuru',
        category: 'both',
        placeId: area.placeId,
        viewport: area.viewport,
        cursor
      })
    });

    if (!stepResp.ok) {
      const errText = await stepResp.text();
      throw new Error(`Step ${stepNumber} failed (${stepResp.status}): ${errText}`);
    }

    const data = await stepResp.json();
    totalRequestsUsed = data.totalRequestsUsed || 0;
    if (data.capped) isCapped = true;
    if (data.errors && data.errors.length > 0) stepErrors.push(...data.errors);
    if (data.places && data.places.length > 0) {
      allPlaces.push(...data.places);
    }
    console.log(`+${data.places?.length || 0} places (total so far: ${allPlaces.length}, reqs: ${totalRequestsUsed})`);

    cursor = data.nextCursor;
    isComplete = data.isComplete || !cursor;
  }

  console.log('\n=== SEARCH COMPLETE ===');
  console.log(`Total places found: ${allPlaces.length}`);
  console.log(`Total Google requests used: ${totalRequestsUsed}`);
  console.log(`Search capped: ${isCapped}`);
  console.log(`Errors encountered: ${stepErrors.length}`);
  console.log(`Comparison to earlier 361 places: Earlier 361 vs Now ${allPlaces.length} (+${allPlaces.length - 361} increase)`);

  // 3. Search for Hanumanthu in the found places
  console.log('\n3. Searching for "Hanumanthu" in collected places...');
  const hanumanthuPlaces = allPlaces.filter(p => p.name.toLowerCase().includes('hanumanthu'));
  console.log(`Found ${hanumanthuPlaces.length} place(s) matching "Hanumanthu":`);
  for (const h of hanumanthuPlaces) {
    console.log(`  - Name: "${h.name}"`);
    console.log(`    Type: "${h.type}"`);
    console.log(`    Address: "${h.address}"`);
    console.log(`    Phone: "${h.phone}"`);
    console.log(`    Place ID: "${h.placeId}"`);
  }

  // 4. Test Excel Export with all rows
  console.log('\n4. Testing Excel export with all collected places...');
  const exportResp = await fetch('http://localhost:3000/api/export', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rows: allPlaces, location: 'Mysuru' })
  });
  if (!exportResp.ok) {
    throw new Error(`Excel export failed: ${exportResp.statusText}`);
  }
  const buffer = await exportResp.arrayBuffer();
  console.log(`✓ Excel export generated successfully (${buffer.byteLength} bytes) containing ${allPlaces.length} rows.`);

  // 5. Test pagination calculation
  console.log('\n5. Testing Pagination...');
  const PAGE_SIZE = 20;
  const totalPages = Math.ceil(allPlaces.length / PAGE_SIZE);
  console.log(`✓ Pagination: ${allPlaces.length} places divided into ${totalPages} pages of ${PAGE_SIZE}.`);
}

runMysuruBothSearch().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
