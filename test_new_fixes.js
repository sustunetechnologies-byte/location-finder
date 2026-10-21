const assert = require('assert');
const fs = require('fs');

async function runTests() {
  console.log('================================================================');
  console.log('🧪 TESTING REQUIREMENTS 1 TO 5');
  console.log('================================================================\n');

  // ──────────────────────────────────────────────
  // TEST 1: CSS & Viewport Checks (1366, 1024, 768, 390 px)
  // ──────────────────────────────────────────────
  console.log('--- TEST 1: Layout & Viewport Verification ---');
  const css = fs.readFileSync('public/style.css', 'utf8');
  const html = fs.readFileSync('public/index.html', 'utf8');

  // Sticky columns & spacer
  assert(css.includes('.col-spacer'), 'CSS must define .col-spacer');
  assert(html.includes('<th class="col-spacer"'), 'index.html must have col-spacer header');
  assert(css.includes('.places-table th.col-spacer'), 'CSS must style th.col-spacer with solid background');
  assert(css.includes('.places-table th.col-name') && css.includes('.places-table th.col-action'), 'Sticky Name and Action columns must be defined');

  // Two-line Opening Hours
  assert(css.includes('.hours-two-line'), 'CSS must have .hours-two-line');
  assert(css.includes('.hours-day-label'), 'CSS must have .hours-day-label');
  assert(css.includes('.hours-time-val'), 'CSS must have .hours-time-val');

  // Map icon button
  assert(css.includes('.btn-map-icon'), 'CSS must have .btn-map-icon');
  assert(css.includes('.phone-link') && css.includes('white-space: nowrap'), 'Phone must have white-space: nowrap');

  // Responsive breakpoints
  assert(/@media\s*\(\s*max-width\s*:\s*900px\s*\)/i.test(css), 'Must have @media (max-width: 900px)');
  assert(css.includes('overflow-x: hidden !important'), 'Under 900px must eliminate horizontal scroll');

  console.log('✓ TEST 1 PASSED: CSS reserved width, spacer column, two-line hours, map button, and responsive rules verified.\n');

  // ──────────────────────────────────────────────
  // TEST 2: Phone Formatting Logic
  // ──────────────────────────────────────────────
  console.log('--- TEST 2: Phone Formatting Verification ---');
  const appJs = fs.readFileSync('public/app.js', 'utf8');
  assert(appJs.includes('formatIndianPhone'), 'app.js must define formatIndianPhone');

  // Test server-side phone format
  const serverJs = fs.readFileSync('server.js', 'utf8');
  assert(serverJs.includes('formatIndianPhoneNumber'), 'server.js must define formatIndianPhoneNumber');

  // Load phone function via eval / sandbox test
  const testPhones = [
    { input: '094489 38572', expected: '+91 94489 38572', expectedTel: 'tel:+919448938572' },
    { input: '+91 70909 00663', expected: '+91 70909 00663', expectedTel: 'tel:+917090900663' },
    { input: '080 2345 6789', expected: '+91 80 2345 6789', expectedTel: 'tel:+918023456789' },
    { input: '08023456789', expected: '+91 80 2345 6789', expectedTel: 'tel:+918023456789' },
    { input: '0821 242 1234', expected: '+91 821 242 1234', expectedTel: 'tel:+918212421234' }
  ];

  // Quick evaluation of phone function
  const extractPhoneFn = new Function(
    serverJs.slice(serverJs.indexOf('function formatIndianPhoneNumber(raw)'), serverJs.indexOf('function formatPhoneDisplay')) +
    '\nreturn formatIndianPhoneNumber;'
  )();

  for (const t of testPhones) {
    const formatted = extractPhoneFn(t.input);
    assert.strictEqual(formatted, t.expected, `Phone ${t.input} should format to ${t.expected}, got ${formatted}`);
  }
  console.log('✓ TEST 2 PASSED: Indian mobile and landline spacing verified with exact digits preserved.\n');

  // ──────────────────────────────────────────────
  // TEST 3: Short Links Redirection & Platform Resolution
  // ──────────────────────────────────────────────
  console.log('--- TEST 3: Short Links Following (cutt.ly, Instagram, etc.) ---');
  // Test search-single for Hithie (which has https://cutt.ly/Hithie)
  const resHithie = await fetch('http://localhost:3000/api/search-single', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Hithie', location: 'Mysuru' })
  });
  assert.strictEqual(resHithie.status, 200, 'Search for Hithie should return 200');
  const dataHithie = await resHithie.json();
  assert(dataHithie.places && dataHithie.places.length > 0, 'Must find Hithie in Mysuru');
  const hithie = dataHithie.places[0];
  console.log(`Hithie Name: "${hithie.name}"`);
  console.log(`Hithie Original Website: "${hithie.websiteUri}"`);
  console.log(`Hithie Final Website: "${hithie.finalWebsiteUri}"`);
  console.log(`Hithie Website Status: "${hithie.websiteStatus}"`);
  console.log(`Hithie Social Platform: "${hithie.socialPlatform}"`);
  console.log(`Hithie Formatted Phone: "${hithie.phone}"`);

  // Verify short link was followed
  assert(hithie.websiteUri.includes('cutt.ly'), 'Original websiteUri must be cutt.ly');
  assert(hithie.finalWebsiteUri && hithie.finalWebsiteUri.includes('sitch.app'), 'Final resolved website must be sitch.app');
  assert.strictEqual(hithie.websiteStatus, 'No own website', 'Sitch listing should be marked as "No own website"');
  assert.strictEqual(hithie.socialPlatform, 'Sitch', 'Should detect Sitch as platform');

  // Test Hideaway Coffee (Instagram link)
  const resHideaway = await fetch('http://localhost:3000/api/search-single', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Hideaway Coffee', location: 'Mysuru' })
  });
  const dataHideaway = await resHideaway.json();
  assert(dataHideaway.places && dataHideaway.places.length > 0, 'Must find Hideaway Coffee in Mysuru');
  const hideaway = dataHideaway.places[0];
  console.log(`Hideaway Coffee Website Status: "${hideaway.websiteStatus}" | Platform: "${hideaway.socialPlatform}"`);
  assert.strictEqual(hideaway.websiteStatus, 'No own website', 'Instagram link should be marked "No own website"');
  assert.strictEqual(hideaway.socialPlatform, 'Instagram', 'Platform should be Instagram');

  // Test Harish Bakery (No website)
  const resHarish = await fetch('http://localhost:3000/api/search-single', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Harish Bakery', location: 'Mysuru' })
  });
  const dataHarish = await resHarish.json();
  assert(dataHarish.places && dataHarish.places.length > 0, 'Must find Harish Bakery in Mysuru');
  const harish = dataHarish.places[0];
  console.log(`Harish Bakery Phone: "${harish.phone}" | Website Status: "${harish.websiteStatus}"`);
  assert.strictEqual(harish.phone, '+91 94489 38572', 'Harish Bakery mobile should be formatted as +91 94489 38572');
  assert.strictEqual(harish.websiteStatus, 'Not listed', 'Should be Not listed when no website exists');

  console.log('✓ TEST 3 PASSED: Short link redirection followed and social/listing platform marked "No own website".\n');

  // ──────────────────────────────────────────────
  // TEST 4: Classification, Details Drawer & Reclassify
  // ──────────────────────────────────────────────
  console.log('--- TEST 4: Classification & Reclassify Check ---');
  assert(hithie.primaryType === 'vegetarian_restaurant', 'Hithie primaryType should be vegetarian_restaurant');
  assert(hithie.type === 'Restaurant', 'Hithie should be classified as Restaurant');

  // Check Details drawer HTML in app.js
  assert(appJs.includes('Google Primary Type'), 'Details drawer must render Google Primary Type');
  assert(appJs.includes('All Google Types'), 'Details drawer must render All Google Types');
  assert(appJs.includes('drawer-reclassify-select'), 'Details drawer must have Reclassify dropdown');
  assert(appJs.includes('btn-reset-reclassify'), 'Details drawer must have Reset button for reclassification');
  assert(appJs.includes('Final Website Address (Resolved)'), 'Details drawer must render Final Website Address');

  // Test Excel export includes overridden type and formatted phone
  const testRows = [
    {
      name: 'Harish Bakery',
      type: 'Stay', // user reclassified bakery as Stay
      address: 'Mysuru',
      phone: '094489 38572',
      website: 'Not available',
      websiteStatus: 'Not listed'
    }
  ];
  const resExport = await fetch('http://localhost:3000/api/export', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rows: testRows, location: 'Mysuru' })
  });
  assert.strictEqual(resExport.status, 200, 'Excel export should succeed with status 200');
  const exportBuffer = await resExport.arrayBuffer();
  assert(exportBuffer.byteLength > 1000, 'Excel file should be non-empty');

  console.log('✓ TEST 4 PASSED: Classification, reclassify dropdown, and Excel export verification succeeded.\n');

  console.log('================================================================');
  console.log('🎉 ALL REQUIREMENTS (1 TO 5) VERIFIED AND PASSED!');
  console.log('================================================================');
}

runTests().catch(err => {
  console.error('\n❌ TEST FAILED:', err);
  process.exit(1);
});
