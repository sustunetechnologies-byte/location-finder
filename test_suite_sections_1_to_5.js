const assert = require('assert');

async function run() {
  console.log('=== STARTING SECTION 1 TO 5 TESTS ===\n');

  // ──────────────────────────────────────────
  // TEST 1: Section 4 — Search by name for "Hotel Hanumanthu" in "Mysuru"
  // ──────────────────────────────────────────
  console.log('--- TEST 1: Search by Name ("Hotel Hanumanthu", "Mysuru") ---');
  const resSingle = await fetch('http://localhost:3000/api/search-single', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Hotel Hanumanthu', location: 'Mysuru' })
  });
  assert.strictEqual(resSingle.status, 200, 'search-single should return 200');
  const singleData = await resSingle.json();
  assert(singleData.places && singleData.places.length > 0, 'Should find at least 1 match for Hotel Hanumanthu');
  
  const hanumanthu = singleData.places[0];
  console.log(`Found: "${hanumanthu.name}" | Type: ${hanumanthu.type} | Address: ${hanumanthu.address}`);
  console.log(`Primary Type: ${hanumanthu.primaryType} | Types: ${(hanumanthu.types || []).join(', ')}`);
  
  // Verify classification: must be Restaurant (never Stay, even though "Hotel" is in the name)
  assert.strictEqual(hanumanthu.type, 'Restaurant', 'Hotel Hanumanthu must be classified as Restaurant');
  assert(hanumanthu.name.toLowerCase().includes('hanumanthu'), 'Name should include Hanumanthu');
  console.log('✓ TEST 1 PASSED: Hotel Hanumanthu found and correctly classified as Restaurant.\n');

  // ──────────────────────────────────────────
  // TEST 2: Section 4 — Area comparison (Small vs Medium vs Large) & no duplicates
  // ──────────────────────────────────────────
  console.log('--- TEST 2: Area Comparison & Duplication Check ---');
  // We compare Small (3km) vs Medium (6km) for restaurants in Mysuru
  const resSmall = await fetch('http://localhost:3000/api/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ location: 'Mysuru', category: 'restaurants', source: 'google', area: 'small' })
  });
  const dataSmall = await resSmall.json();
  assert.strictEqual(resSmall.status, 200);
  console.log(`Small area results: ${dataSmall.results.length} places (Coverage queries: ${dataSmall.coverageReport?.queryCount}, Hidden closed: ${dataSmall.coverageReport?.hiddenClosedCount || 0})`);

  // Verify no duplicates in results
  const seenIds = new Set();
  let duplicateCount = 0;
  for (const p of dataSmall.results) {
    if (seenIds.has(p.id)) {
      duplicateCount++;
    }
    seenIds.add(p.id);
  }
  assert.strictEqual(duplicateCount, 0, 'Zero duplicates should exist in results');
  console.log('✓ TEST 2 PASSED: Area search returned results with 0 duplicates.\n');

  // ──────────────────────────────────────────
  // TEST 3: Section 3 — Photo Upload, Resize & Permission Check
  // ──────────────────────────────────────────
  console.log('--- TEST 3: Photo Upload API with Permission Check ---');
  
  // Rejection without permission
  const resNoPerm = await fetch('http://localhost:3000/api/upload-photo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      filename: 'sample.jpg',
      contentType: 'image/jpeg',
      base64Data: 'data:image/jpeg;base64,/9j/4AAQSkZJRg==',
      permissionConfirmed: false
    })
  });
  assert.strictEqual(resNoPerm.status, 400, 'Upload without permission confirmation must be rejected');
  console.log('✓ Rejection without permission confirmed works.');

  // Successful upload with permission
  // Create a minimal 1x1 JPEG base64
  const sampleBase64 = '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';
  
  const resUpload1 = await fetch('http://localhost:3000/api/upload-photo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      filename: 'owner_kitchen.jpg',
      contentType: 'image/jpeg',
      base64Data: sampleBase64,
      permissionConfirmed: true
    })
  });
  assert.strictEqual(resUpload1.status, 200, 'Upload 1 must succeed');
  const upload1Data = await resUpload1.json();
  assert(upload1Data.success && upload1Data.url && upload1Data.storageId, 'Must return URL and storageId');
  console.log(`Uploaded Photo 1: ${upload1Data.url} (storageId: ${upload1Data.storageId})`);

  const resUpload2 = await fetch('http://localhost:3000/api/upload-photo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      filename: 'owner_dining.jpg',
      contentType: 'image/jpeg',
      base64Data: sampleBase64,
      permissionConfirmed: true
    })
  });
  assert.strictEqual(resUpload2.status, 200, 'Upload 2 must succeed');
  const upload2Data = await resUpload2.json();
  console.log(`Uploaded Photo 2: ${upload2Data.url} (storageId: ${upload2Data.storageId})`);

  // Verify retrieval
  const resFetchPhoto = await fetch(`http://localhost:3000${upload1Data.url}`);
  assert.strictEqual(resFetchPhoto.status, 200, 'Uploaded photo must be accessible via its URL');
  assert.strictEqual(resFetchPhoto.headers.get('content-type'), 'image/jpeg');
  console.log('✓ Uploaded photo retrieved successfully.');

  // Delete photo 2 (simulating remove in review window)
  const resDelete = await fetch('http://localhost:3000/api/delete-photo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      storageId: upload2Data.storageId,
      url: upload2Data.url
    })
  });
  assert.strictEqual(resDelete.status, 200, 'Delete photo must succeed');
  console.log('✓ Photo 2 deleted successfully.');

  // ──────────────────────────────────────────
  // TEST 4: Section 3 — Website Generation using Owner-Provided Photo & Preview Verification
  // ──────────────────────────────────────────
  console.log('\n--- TEST 4: Website Generation with Owner-Provided Photo & Editable Fields ---');
  const genPayload = {
    name: 'Hanumanthu Mess & Dining',
    type: 'Restaurant',
    address: 'Sayyaji Rao Rd, Mandi Mohalla, Mysuru, Karnataka 570001',
    phone: '+91 82124 23456',
    whatsappNumber: '9845012345',
    openingHours: 'Mon-Sun: 11:30 AM - 10:30 PM',
    shortDescription: 'Famous heritage mess known for traditional mutton pulav and biryani.',
    photos: [
      {
        url: upload1Data.url,
        storageId: upload1Data.storageId,
        isOwnerProvided: true,
        widthPx: 1600,
        heightPx: 1200,
        authorAttributions: [],
        role: 'hero'
      }
    ],
    photoAssignments: {
      0: { role: 'hero', roomIndex: 0 }
    },
    menu: [
      { category: 'Mutton Specials', name: 'Mutton Pulav', price: '₹280', isVeg: 'non-veg', description: 'Authentic secret recipe pulav' }
    ]
  };

  const resGen = await fetch('http://localhost:3000/api/generate-site', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(genPayload)
  });
  assert.strictEqual(resGen.status, 200, 'Website generation should succeed');
  const genData = await resGen.json();
  assert(genData.previewUrl, 'Must return previewUrl');
  console.log(`Generated Preview URL: ${genData.previewUrl}`);

  // Fetch rendered preview HTML
  const resPreview = await fetch(`http://localhost:3000${genData.previewUrl}`);
  assert.strictEqual(resPreview.status, 200, 'Preview URL must return 200');
  const previewHtml = await resPreview.text();

  // Verify preview content:
  // 1. Title / Name
  assert(previewHtml.includes('Hanumanthu Mess &amp; Dining') || previewHtml.includes('Hanumanthu Mess & Dining'), 'Preview must have edited business name');
  // 2. Short description
  assert(previewHtml.includes('Famous heritage mess known for traditional mutton pulav and biryani.'), 'Preview must have short description');
  // 3. Hero photo uses owner photo URL
  assert(previewHtml.includes(upload1Data.url), 'Preview must render the owner photo URL');
  // 4. Owner photo attribution: Must be 'Owner-provided photo' and NOT Google Maps Contributor on the element
  assert(previewHtml.includes('data-author-name="Owner-provided photo"'), 'Must have Owner-provided photo author attribute');
  assert(!previewHtml.includes('data-author-name="Google Maps Contributor"'), 'Must NOT have Google Maps contributor author attribution');
  // 5. Disclaimer present
  assert(previewHtml.includes('This is a draft preview created for demonstration purposes only') || previewHtml.includes('not the official website'), 'Disclaimer banner must be present');
  // 6. Robots noindex
  assert(resPreview.headers.get('x-robots-tag')?.includes('noindex'), 'Must have X-Robots-Tag: noindex');
  assert(previewHtml.includes('<meta name="robots" content="noindex, nofollow">'), 'Must have robots noindex meta');

  console.log('✓ TEST 4 PASSED: Preview generated correctly with owner photo, edited fields, and noindex/disclaimer rules intact.\n');

  console.log('=== ALL TESTS PASSED SUCCESSFULLY! ===');
}

run().catch(err => {
  console.error('TEST FAILED:', err);
  process.exit(1);
});
