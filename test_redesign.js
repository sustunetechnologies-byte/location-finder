const assert = require('assert');

async function runRedesignTests() {
  const baseUrl = 'http://127.0.0.1:3000';
  console.log('================================================================');
  console.log('🎨 RUNNING COMPREHENSIVE STAY REDESIGN TESTS');
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
      console.log('❌ FAILED:', err.message);
      failed++;
    }
  }

  // Define 4 stays with distinct placeIds
  const stay1 = {
    name: 'Serene Heritage Palace',
    type: 'Stay',
    address: 'Palace Road, Bengaluru, Karnataka 560001',
    phone: '+91 98450 12345',
    placeId: 'places/ChIJSereneHeritage001',
    openingHours: 'Monday: 12:00 AM – 11:59 PM | Tuesday: 12:00 AM – 11:59 PM | Wednesday: 12:00 AM – 11:59 PM | Thursday: 12:00 AM – 11:59 PM | Friday: 12:00 AM – 11:59 PM | Saturday: 12:00 AM – 11:59 PM | Sunday: 12:00 AM – 11:59 PM',
    coordinates: { lat: 12.9716, lon: 77.5946 },
    mapLink: 'https://maps.google.com/?cid=1001',
    enriched: {
      rating: 4.8,
      reviewCount: 420,
      priceLevel: '₹₹₹₹',
      editorialSummary: 'An exquisite royal retreat nestled in historical gardens with luxury suites.',
      features: {
        parkingOptions: { freeParkingLot: true },
        allowsDogs: true,
        accessibilityOptions: { wheelchairAccessibleEntrance: true },
        paymentOptions: { acceptsCreditCards: true }
      },
      photos: [
        {
          name: 'places/ChIJSereneHeritage001/photos/hero_1',
          widthPx: 1200, heightPx: 800,
          authorAttributions: [{ displayName: 'Rajesh Sharma', uri: 'https://maps.google.com/contrib/101' }]
        },
        {
          name: 'places/ChIJSereneHeritage001/photos/room_2',
          widthPx: 1200, heightPx: 800,
          authorAttributions: [{ displayName: 'Elena Rostova', uri: 'https://maps.google.com/contrib/102' }]
        }
      ],
      reviews: [
        { authorName: 'Vikram Mehta', rating: 5, text: 'Magnificent palace with impeccable concierge.' }
      ]
    },
    roomTypes: [
      { name: 'Royal Maharajah Suite', tariff: '₹14,500/night', source: 'owner confirmed' },
      { name: 'Heritage Courtyard Room', tariff: '₹8,200/night', source: 'pin photo' }
    ]
  };

  const stay2 = {
    name: 'Green Bamboo Eco Retreat',
    type: 'Stay',
    address: 'Hill View Trail, Coorg, Karnataka 571201',
    phone: '+91 87654 32109',
    placeId: 'places/ChIJGreenBamboo002',
    openingHours: 'Open 24 hours',
    coordinates: { lat: 12.3375, lon: 75.8069 },
    mapLink: 'https://maps.google.com/?cid=1002',
    enriched: {
      rating: 4.5,
      reviewCount: 110,
      priceLevel: '₹₹',
      editorialSummary: 'Sustainable eco-cottages surrounded by organic coffee and spice plantations.',
      features: {
        parkingOptions: { freeParkingLot: true },
        allowsDogs: false
      },
      photos: [
        {
          name: 'places/ChIJGreenBamboo002/photos/nature_1',
          widthPx: 1200, heightPx: 800,
          authorAttributions: [{ displayName: 'Coorg Explorer', uri: 'https://maps.google.com/contrib/201' }]
        }
      ],
      reviews: []
    },
    roomTypes: [
      { name: 'Bamboo Treehouse', tariff: '₹3,800/night', source: 'owner confirmed' }
    ]
  };

  const stay3 = {
    name: 'Coastal Haven Boutique Lodge',
    type: 'Stay',
    address: 'Cliff Road, Gokarna, Karnataka 581326',
    phone: 'Not available', // Missing phone
    placeId: 'places/ChIJCoastalHaven003',
    openingHours: 'Not available', // Missing hours
    coordinates: { lat: 14.5479, lon: 74.3188 },
    mapLink: 'https://maps.google.com/?cid=1003',
    enriched: {
      rating: 4.2,
      reviewCount: 65,
      priceLevel: '₹₹₹',
      editorialSummary: 'Perched on cliffs overlooking Om Beach with panoramic sunset vistas.',
      features: {}, // No facilities
      photos: [], // NO PHOTOS
      photosUnavailable: true,
      reviews: []
    },
    roomTypes: []
  };

  const stay4 = {
    name: 'Obsidian Tech Pods',
    type: 'Stay',
    address: 'Electronic City Phase 1, Bengaluru 560100',
    phone: '080 2852 9999', // Landline
    placeId: 'places/ChIJObsidianTech004',
    openingHours: 'Monday: 8:00 AM – 10:00 PM | Tuesday: 8:00 AM – 10:00 PM | Wednesday: 8:00 AM – 10:00 PM | Thursday: 8:00 AM – 10:00 PM | Friday: 8:00 AM – 10:00 PM | Saturday: 8:00 AM – 10:00 PM | Sunday: 8:00 AM – 10:00 PM',
    coordinates: { lat: 12.8399, lon: 77.6770 },
    mapLink: 'https://maps.google.com/?cid=1004',
    enriched: {
      rating: 4.1,
      reviewCount: 88,
      priceLevel: '₹',
      editorialSummary: 'Smart pod hotel with high-speed fiber, workspace booths and robotic room service.',
      features: {
        paymentOptions: { acceptsCreditCards: true, acceptsCashOnly: false },
        accessibilityOptions: { wheelchairAccessibleEntrance: true },
        parkingOptions: { paidParkingLot: true }
      },
      photos: [
        {
          name: 'places/ChIJObsidianTech004/photos/pod_1',
          widthPx: 1200, heightPx: 800,
          authorAttributions: [{ displayName: 'Tech Traveler', uri: '' }]
        }
      ],
      reviews: [
        { authorName: 'Sanjay Nair', rating: 4, text: 'Futuristic pods, very clean and convenient.' }
      ]
    },
    roomTypes: [
      { name: 'Single Cyber Pod', tariff: '₹1,200/night', source: 'owner confirmed' }
    ]
  };

  // Helper to generate preview
  async function genPreview(payload, designOverride = null) {
    const body = { ...payload };
    if (designOverride) body.design = designOverride;
    const res = await fetch(`${baseUrl}/api/generate-site`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    assert.strictEqual(res.status, 200, `POST /api/generate-site failed: ${res.status}`);
    const data = await res.json();
    assert(data.token, 'Must return token');
    assert(data.previewUrl, 'Must return previewUrl');

    const pageRes = await fetch(`${baseUrl}${data.previewUrl}`);
    assert.strictEqual(pageRes.status, 200, `GET preview failed: ${pageRes.status}`);
    const html = await pageRes.text();
    return { token: data.token, url: data.previewUrl, html, res: pageRes };
  }

  // TEST 1: Generate preview pages for 4 stays and confirm they look different
  await test('4 different stays generate distinct designs deterministically', async () => {
    const res1 = await genPreview(stay1);
    const res2 = await genPreview(stay2);
    const res3 = await genPreview(stay3);
    const res4 = await genPreview(stay4);

    // Extract body theme classes
    const getThemeClass = (html) => {
      const m = html.match(/class="[^"]*theme-([^"\s]+)[^"]*"/);
      return m ? m[1] : null;
    };

    const t1 = getThemeClass(res1.html);
    const t2 = getThemeClass(res2.html);
    const t3 = getThemeClass(res3.html);
    const t4 = getThemeClass(res4.html);

    console.log(`\n  Themes generated: [Stay1: ${t1}, Stay2: ${t2}, Stay3: ${t3}, Stay4: ${t4}]`);
    assert(t1, 'Stay 1 must have a theme class');
    assert(t2, 'Stay 2 must have a theme class');
    assert(t3, 'Stay 3 must have a theme class');
    assert(t4, 'Stay 4 must have a theme class');

    // Confirm that not all 4 are identical
    const uniqueThemes = new Set([t1, t2, t3, t4]);
    assert(uniqueThemes.size >= 2, `Different stays must receive diverse designs, got ${uniqueThemes.size} distinct`);
  });

  // TEST 2: Determinism check: Same stay always gets the same design
  await test('Same stay always gets identical design deterministically across regenerations', async () => {
    const firstGen = await genPreview(stay1);
    const secondGen = await genPreview(stay1);

    const getTheme = (h) => (h.match(/class="[^"]*theme-([^"\s]+)[^"]*"/) || [])[1];
    const getPaletteBg = (h) => (h.match(/--bg:\s*([^;]+);/) || [])[1];
    const getFontHeading = (h) => (h.match(/--font-heading:\s*([^;]+);/) || [])[1];

    assert.strictEqual(getTheme(firstGen.html), getTheme(secondGen.html), 'Theme must match for identical placeId');
    assert.strictEqual(getPaletteBg(firstGen.html), getPaletteBg(secondGen.html), 'Palette must match for identical placeId');
    assert.strictEqual(getFontHeading(firstGen.html), getFontHeading(secondGen.html), 'Font pairing must match for identical placeId');
  });

  // TEST 3: Design dropdown override works for all 6 themes and encodes choice in token
  await test('Design override works for all 6 themes and encodes choice in token', async () => {
    const allThemes = [
      { key: 'fullscreen-overlay', prefix: 'fso_' },
      { key: 'split-hero', prefix: 'sph_' },
      { key: 'magazine-grid', prefix: 'mag_' },
      { key: 'minimal-luxury', prefix: 'lux_' },
      { key: 'resort-nature', prefix: 'nat_' },
      { key: 'modern-dark', prefix: 'drk_' }
    ];

    for (const t of allThemes) {
      const res = await genPreview(stay1, t.key);
      assert(res.token.startsWith(t.prefix), `Token ${res.token} must encode choice with prefix ${t.prefix}`);
      assert(res.html.includes(`theme-${t.key}`), `Rendered HTML must include theme-${t.key}`);
    }
  });

  // TEST 4: Hero with photo (Ken Burns + Parallax) vs Hero with NO photo (SVG/Gradient, no <img>)
  await test('Stay with photo has Ken Burns background; stay with NO photo uses SVG gradient and NO <img>', async () => {
    const withPhoto = await genPreview(stay1); // Has photos
    const noPhoto = await genPreview(stay3);   // Has no photos

    // Stay with photo
    assert(withPhoto.html.includes('hero-bg-media'), 'Must have hero-bg-media element for photo');
    assert(withPhoto.html.includes('kenBurns'), 'Must have kenBurns CSS animation');
    assert(withPhoto.html.includes('/api/photo?name=places%2FChIJSereneHeritage001%2Fphotos%2Fhero_1&maxWidth=1200'), 'Must link Google photo proxy');

    // Stay with NO photo
    assert(!noPhoto.html.includes('<img'), 'Stay without photo must contain ZERO <img> tags');
    assert(noPhoto.html.includes('hero-no-photo'), 'Must apply hero-no-photo class');
    assert(noPhoto.html.includes('meshShift') || noPhoto.html.includes('gradient'), 'Must use animated gradient mesh');
    assert(!noPhoto.html.includes('Photo Gallery'), 'Gallery section must be hidden when no photos');
  });

  // TEST 5: Lightbox with Google author attribution and swipe gesture logic
  await test('Photo gallery includes accessible lightbox with Google author attributions and swipe', async () => {
    const res = await genPreview(stay1);
    const html = res.html;

    assert(html.includes('id="lb-overlay"'), 'Must render lb-overlay modal');
    assert(html.includes('id="lb-close"'), 'Must have lb-close button');
    assert(html.includes('id="lb-prev"'), 'Must have lb-prev button');
    assert(html.includes('id="lb-next"'), 'Must have lb-next button');
    assert(html.includes('id="lb-attribution"'), 'Must have attribution container');

    // Attribution data attributes on thumbnails
    assert(html.includes('data-author-name="Rajesh Sharma"'), 'Thumbnail must contain author name');
    assert(html.includes('data-author-uri="https://maps.google.com/contrib/101"'), 'Thumbnail must contain author URI');

    // Touch swipe and keyboard handlers in JS
    assert(html.includes('touchstart') && html.includes('touchend'), 'Must include mobile touch swipe listeners');
    assert(html.includes('Escape') && html.includes('ArrowRight') && html.includes('ArrowLeft'), 'Must include keyboard listeners');
  });

  // TEST 6: Live Opening Hours table with today highlighted and live badge
  await test('Opening hours renders clean table with today highlighted and live Open/Closed badge', async () => {
    const res = await genPreview(stay1);
    const html = res.html;

    assert(html.includes('🕐 Opening Hours'), 'Must have hours section');
    assert(html.includes('class="hours-table"'), 'Must render hours table');
    assert(html.includes('is-today'), 'Must have is-today row class');
    assert(html.includes('today-badge">TODAY</span>'), 'Must highlight today with badge');
    assert(html.includes('live-status-pill'), 'Must render live status pill');
    assert(html.includes('status-pulse'), 'Must render pulsing status dot');
  });

  // TEST 7: Mobile floating action bar and animated enquire section
  await test('Floating action bar on mobile and animated Enquire section', async () => {
    const resMobile = await genPreview(stay1); // Indian mobile
    const resLandline = await genPreview(stay4); // Landline

    // Mobile stay: has Call, WhatsApp and Directions in sticky bar
    assert(resMobile.html.includes('class="sticky-bar"'), 'Must have mobile sticky bar');
    assert(resMobile.html.includes('sticky-call') && resMobile.html.includes('sticky-wa') && resMobile.html.includes('sticky-dir') && resMobile.html.includes('sticky-enquire'), 'Must have all 4 mobile action buttons');
    assert(resMobile.html.includes('.sticky-bar{display:none !important;}'), 'Desktop must hide sticky bar');

    // Landline stay: has Call & Directions, but NO WhatsApp!
    assert(resLandline.html.includes('sticky-call') && resLandline.html.includes('sticky-dir'), 'Landline must have call & directions');
    assert(!resLandline.html.includes('class="sticky-btn sticky-wa"'), 'Landline must NOT have WhatsApp button');

    // Animated Enquire section
    assert(resMobile.html.includes('id="enquire"'), 'Must have enquire section');
    assert(resMobile.html.includes('enquire-glow'), 'Enquire section must have glowing pulse');
    assert(resMobile.html.includes('Direct Enquiry') || resMobile.html.includes('Enquiry'), 'Enquire title badge present');
  });

  // TEST 8: Sticky nav bar positioned below disclaimer so banner is never hidden
  await test('Sticky navbar with scroll-spy positioned below top disclaimer banner', async () => {
    const res = await genPreview(stay1);
    const html = res.html;

    assert(html.includes('id="top-disc"'), 'Top disclaimer banner must exist with id');
    assert(html.includes('id="sticky-nav"'), 'Sticky nav bar must exist with id');
    assert(html.includes('syncNav'), 'JS must sync nav top position with banner height');
    assert(html.includes('scroll-padding-top'), 'HTML must set scroll-padding-top for smooth nav');
    assert(html.includes('nav-links'), 'Nav links must be present');
  });

  // TEST 9: Strict security, robots, and disclaimer checks
  await test('Robots headers, robots meta tag, disclaimer text and XSS safety', async () => {
    const res = await genPreview(stay1);
    const robotsHeader = res.res.headers.get('x-robots-tag');
    assert(robotsHeader && robotsHeader.includes('noindex'), 'Must send X-Robots-Tag: noindex');
    assert(res.html.includes('<meta name="robots" content="noindex, nofollow">'), 'Must contain robots meta tag');

    const expectedDisclaimer = 'Preview prepared for Serene Heritage Palace by Susunetech. This is a draft preview created for demonstration purposes only. It is not the official website of the business and has not been approved or published by the owner.';
    assert(res.html.includes(expectedDisclaimer), 'Must contain exact top disclaimer');
    assert((res.html.match(new RegExp('Preview prepared for Serene Heritage Palace by Susunetech', 'g')) || []).length >= 2, 'Disclaimer must appear top and footer');
  });

  // TEST 10: Responsiveness & accessibility (360, 768, 1024, 1440 px, touch >= 44px, prefers-reduced-motion)
  await test('Responsive CSS rules, touch targets >= 44px, clamp() typography, and prefers-reduced-motion', async () => {
    const res = await genPreview(stay1);
    const html = res.html;

    assert(html.includes('min-height: 44px'), 'Buttons must have min-height: 44px');
    assert(html.includes('clamp('), 'Typography must use fluid clamp()');
    assert(html.includes('prefers-reduced-motion: reduce'), 'Must respect prefers-reduced-motion');
    assert(html.includes('@media (min-width: 641px)'), 'Must include responsive tablet/desktop breakpoint');
    assert(html.includes('@media (min-width: 768px)'), 'Must include 768px breakpoint');
    assert(html.includes('@media (min-width: 1024px)'), 'Must include 1024px breakpoint');
    assert(html.includes('overflow-x: hidden'), 'Must prevent horizontal overflow');
  });

  console.log('\n================================================================');
  console.log(`🏁 STAY REDESIGN TESTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================\n');

  if (failed > 0) process.exit(1);
}

runRedesignTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
