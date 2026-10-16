const assert = require('assert');
const app = require('./server');

async function runComprehensiveTests() {
  const PORT = 3001;
  const baseUrl = `http://127.0.0.1:${PORT}`;

  const server = app.listen(PORT);
  console.log('================================================================');
  console.log('🚀 RUNNING COMPREHENSIVE HOSPITALITY REDESIGN SUITE (SECTIONS 1-6)');
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
      console.log('❌ FAILED:\n', err.message);
      failed++;
    }
  }

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

  try {
    // ──────────────────────────────────────────────
    // Test 1: 4 Stays generate structurally distinct themes
    // ──────────────────────────────────────────────
    const stay1 = {
      name: 'Wildwood Eco Lodge & Treehouse',
      type: 'Stay',
      address: 'Kabini River Road, HD Kote, Karnataka',
      phone: '9845123456',
      openingHours: '24 Hours Open',
      placeId: 'ChIJStayEco001',
      enriched: {
        id: 'ChIJStayEco001',
        rating: 4.8,
        reviewCount: 420,
        priceLevel: '₹₹₹',
        photos: [{ name: 'places/ChIJStayEco001/photos/p1', widthPx: 1200, heightPx: 800, authorAttributions: [{ displayName: 'Arun K' }] }]
      },
      rooms: [
        { name: 'Canopy Treehouse', tariff: '₹8,500/night', size: '420 sq ft', capacity: '2 Adults', bedType: '1 King Bed', amenities: 'Balcony, AC, Forest View', source: 'owner confirmed' }
      ]
    };

    const stay2 = {
      name: 'Skyline Urban Loft & Pod Suites',
      type: 'Stay',
      address: 'Koramangala 4th Block, Bengaluru',
      phone: '9845123457',
      placeId: 'ChIJStayUrban002',
      enriched: {
        id: 'ChIJStayUrban002',
        rating: 4.4,
        priceLevel: '₹₹',
        photos: [{ name: 'places/ChIJStayUrban002/photos/p1', widthPx: 1200, heightPx: 800 }]
      }
    };

    const stay3 = {
      name: 'Maharaja Heritage Haveli Homestay',
      type: 'Stay',
      address: 'Old Palace Road, Mysuru',
      phone: '9845123458',
      placeId: 'ChIJStayHeritage003',
      enriched: {
        id: 'ChIJStayHeritage003',
        rating: 4.9,
        photos: [{ name: 'places/ChIJStayHeritage003/photos/p1', widthPx: 1200, heightPx: 800 }]
      }
    };

    const stay4 = {
      name: 'Azure Palm Beach Resort',
      type: 'Stay',
      address: 'Om Beach Road, Gokarna',
      phone: '9845123459',
      placeId: 'ChIJStayBeach004',
      enriched: {
        id: 'ChIJStayBeach004',
        rating: 4.7,
        photos: [{ name: 'places/ChIJStayBeach004/photos/p1', widthPx: 1200, heightPx: 800 }]
      }
    };

    await test('Generate 4 different stays and confirm structurally distinct themes', async () => {
      const r1 = await genPreview(stay1);
      const r2 = await genPreview(stay2);
      const r3 = await genPreview(stay3);
      const r4 = await genPreview(stay4);

      const getThemeClass = (html) => {
        const m = html.match(/class="[^"]*theme-([^"\s]+)[^"]*"/);
        return m ? m[1] : null;
      };

      const t1 = getThemeClass(r1.html);
      const t2 = getThemeClass(r2.html);
      const t3 = getThemeClass(r3.html);
      const t4 = getThemeClass(r4.html);

      console.log(`\n  [Stays Themes] Stay1: ${t1}, Stay2: ${t2}, Stay3: ${t3}, Stay4: ${t4}`);
      assert(t1 && t2 && t3 && t4, 'All stays must have theme classes');
      const unique = new Set([t1, t2, t3, t4]);
      assert(unique.size >= 3, `Expected at least 3 distinct themes, got ${unique.size}`);

      // Verify structural differences (split hero vs magazine hero vs eco hero)
      assert(r2.html.includes('hero-split') || r2.html.includes('hero-split-grid'), 'Urban sleek must use split hero');
      assert(r3.html.includes('hero-magazine') || r3.html.includes('mag-featured-banner'), 'Heritage homestay must use magazine/story hero');
    });

    // ──────────────────────────────────────────────
    // Test 2: 4 Restaurants generate structurally distinct themes
    // ──────────────────────────────────────────────
    const rest1 = {
      name: 'The Charcoal Room & Steakhouse',
      type: 'Restaurant',
      address: 'Lavelle Road, Bengaluru',
      phone: '9740123451',
      openingHours: '6:00 PM – 11:30 PM',
      placeId: 'ChIJRestFine001',
      enriched: {
        id: 'ChIJRestFine001',
        rating: 4.9,
        reviewCount: 380,
        priceLevel: '₹₹₹₹',
        features: { reservable: true, servesDinner: true },
        photos: [{ name: 'places/ChIJRestFine001/photos/p1', widthPx: 1200, heightPx: 800 }]
      },
      menu: [
        { category: 'Prime Steaks', name: 'Filet Mignon', price: '₹1,850', vegNonVeg: 'non-veg', description: 'Grass-fed tenderloin with truffle butter', source: 'owner confirmed' }
      ]
    };

    const rest2 = {
      name: 'Roast & Beans Artisan Cafe & Roastery',
      type: 'Restaurant',
      address: '100 Feet Road, Indiranagar, Bengaluru',
      phone: '9740123452',
      openingHours: '8:00 AM – 9:00 PM',
      placeId: 'ChIJRestCafe002',
      enriched: {
        id: 'ChIJRestCafe002',
        rating: 4.6,
        priceLevel: '₹₹',
        features: { outdoorSeating: true, servesBreakfast: true },
        photos: [{ name: 'places/ChIJRestCafe002/photos/p1', widthPx: 1200, heightPx: 800 }]
      }
    };

    const rest3 = {
      name: 'Udupi Sri Krishna Bhavan Dosa Corner',
      type: 'Restaurant',
      address: 'Gandhi Bazaar, Basavanagudi, Bengaluru',
      phone: '9740123453',
      openingHours: '7:00 AM – 10:00 PM',
      placeId: 'ChIJRestTrad003',
      enriched: {
        id: 'ChIJRestTrad003',
        rating: 4.7,
        priceLevel: '₹',
        features: { servesVegetarianFood: true, dineIn: true, takeout: true },
        photos: [{ name: 'places/ChIJRestTrad003/photos/p1', widthPx: 1200, heightPx: 800 }]
      }
    };

    const rest4 = {
      name: 'Neon Hops Craft Brewery & Taproom',
      type: 'Restaurant',
      address: 'Outer Ring Road, Bellandur, Bengaluru',
      phone: '9740123454',
      openingHours: '12:00 PM – 1:00 AM',
      placeId: 'ChIJRestPub004',
      enriched: {
        id: 'ChIJRestPub004',
        rating: 4.5,
        priceLevel: '₹₹₹',
        features: { goodForGroups: true, reservable: true }
      }
    };

    await test('Generate 4 different restaurants and confirm structurally distinct themes', async () => {
      const r1 = await genPreview(rest1);
      const r2 = await genPreview(rest2);
      const r3 = await genPreview(rest3);
      const r4 = await genPreview(rest4);

      const getThemeClass = (html) => {
        const m = html.match(/class="[^"]*theme-([^"\s]+)[^"]*"/);
        return m ? m[1] : null;
      };

      const t1 = getThemeClass(r1.html);
      const t2 = getThemeClass(r2.html);
      const t3 = getThemeClass(r3.html);
      const t4 = getThemeClass(r4.html);

      console.log(`\n  [Restaurants Themes] Rest1: ${t1}, Rest2: ${t2}, Rest3: ${t3}, Rest4: ${t4}`);
      assert(t1 && t2 && t3 && t4, 'All restaurants must have theme classes');
      const unique = new Set([t1, t2, t3, t4]);
      assert(unique.size >= 3, `Expected at least 3 distinct restaurant themes, got ${unique.size}`);
    });

    // ──────────────────────────────────────────────
    // Test 3: Determinism: Same stay & same restaurant always get identical design
    // ──────────────────────────────────────────────
    await test('Determinism: same place ID always gets same theme & palette across regenerations', async () => {
      const sA = await genPreview(stay1);
      const sB = await genPreview(stay1);
      assert.strictEqual(sA.token.slice(0, 4), sB.token.slice(0, 4), 'Token prefix must match');

      const getTheme = (h) => (h.match(/class="[^"]*theme-([^"\s]+)[^"]*"/) || [])[1];
      const getBg = (h) => (h.match(/--bg:\s*([^;]+);/) || [])[1];
      assert.strictEqual(getTheme(sA.html), getTheme(sB.html), 'Stay theme must be identical');
      assert.strictEqual(getBg(sA.html), getBg(sB.html), 'Stay background palette must be identical');

      const rA = await genPreview(rest1);
      const rB = await genPreview(rest1);
      assert.strictEqual(getTheme(rA.html), getTheme(rB.html), 'Restaurant theme must be identical');
    });

    // ──────────────────────────────────────────────
    // Test 4: Design Override works for all 6 Stay and 6 Restaurant themes
    // ──────────────────────────────────────────────
    await test('Design override works for all 6 Stay themes & 6 Restaurant themes', async () => {
      const stayThemes = ['eco-lodge', 'urban-sleek', 'heritage-homestay', 'beach-resort', 'luxury', 'budget-hostel'];
      for (const t of stayThemes) {
        const res = await genPreview(stay1, t);
        assert(res.html.includes(`theme-${t}`), `HTML must include theme-${t}`);
      }

      const restThemes = ['fine-dining', 'casual-cafe', 'family-restaurant', 'bar-pub', 'traditional-indian', 'bakery-fast-food'];
      for (const t of restThemes) {
        const res = await genPreview(rest1, t);
        assert(res.html.includes(`theme-${t}`), `HTML must include theme-${t}`);
      }
    });

    // ──────────────────────────────────────────────
    // Test 5: Missing data hides sections cleanly
    // ──────────────────────────────────────────────
    await test('Missing data hides sections cleanly (no photos, no phone, no hours, no rooms, no menu)', async () => {
      const bareBones = {
        name: 'Simple Corner Inn',
        type: 'Stay',
        address: 'MG Road, Bengaluru',
        placeId: 'ChIJBareBones001'
      };

      const res = await genPreview(bareBones);
      const html = res.html;

      // No photos: zero <img> tags, no gallery section
      assert(!html.includes('<img'), 'Must have ZERO <img> tags when no photos exist');
      assert(!html.includes('Photo Gallery'), 'Gallery section must be hidden');
      assert(html.includes('hero-no-photo'), 'Must use hero-no-photo class');

      // No phone: no tel: link, no WhatsApp link, no floating buttons
      assert(!html.includes('tel:'), 'Missing phone must not render tel: link');
      assert(!html.includes('https://wa.me'), 'Missing phone must not render WhatsApp link');
      assert(!html.includes('class="floating-btn float-call"'), 'Missing phone must not render floating call button');

      // No hours: no hours table
      assert(!html.includes('class="hours-table"'), 'Hours table must be hidden');

      // No rooms entered: shows fallback or hides details
      assert(html.includes('Contact us for rates and availability'), 'Empty rooms must show graceful fallback');
    });

    // ──────────────────────────────────────────────
    // Test 6: URL Token Compression & Length Limit (40 menu items + 6 rooms)
    // ──────────────────────────────────────────────
    await test('URL token compression handles 40 menu items and 6 rooms within 7500 char limit', async () => {
      const heavyMenu = [];
      for (let i = 1; i <= 40; i++) {
        heavyMenu.push({
          category: i <= 10 ? 'Starters' : i <= 25 ? 'Mains' : i <= 35 ? 'Breads' : 'Desserts',
          name: `Special Delicacy Item ${i}`,
          price: `₹${150 + i * 15}`,
          vegNonVeg: i % 2 === 0 ? 'veg' : 'non-veg',
          description: `Authentic house recipe prepared with fresh herbs and organic spices item ${i}`,
          source: 'owner confirmed'
        });
      }

      const heavyRooms = [];
      for (let i = 1; i <= 6; i++) {
        heavyRooms.push({
          name: `Luxury Suite Category ${i}`,
          tariff: `₹${3500 + i * 800}/night`,
          size: `${300 + i * 40} sq ft`,
          capacity: `${2 + (i % 3)} Guests`,
          bedType: i % 2 === 0 ? '1 King Bed' : '2 Queen Beds',
          amenities: 'High-speed WiFi, Air Conditioning, Balcony, Private Bath, Coffee Machine',
          description: `Spacious contemporary suite overlooking gardens with premium bath amenities and bespoke furnishings room ${i}`,
          source: 'owner confirmed'
        });
      }

      // Test 40-item menu on a Restaurant
      const heavyRestPayload = {
        name: 'The Grand Gourmet Feast',
        type: 'Restaurant',
        address: 'Palace Grounds, Jayamahal Road, Bengaluru, Karnataka 560006',
        phone: '9845199999',
        openingHours: 'Monday: 11:00 AM – 11:00 PM',
        placeId: 'ChIJHeavyRest001',
        menu: heavyMenu
      };

      const resRest = await genPreview(heavyRestPayload);
      console.log(`\n  [Compressed Token Length] with 40 menu items: ${resRest.token.length} chars (Limit: 7500)`);
      assert(resRest.token.length < 7500, `Restaurant token length (${resRest.token.length}) must be < 7500 chars`);
      assert(resRest.html.includes('Special Delicacy Item 40'), 'Rendered HTML must contain menu items');

      // Test 6 rooms on a Stay
      const heavyStayPayload = {
        name: 'The Grand Palace Resort',
        type: 'Stay',
        address: 'Palace Grounds, Jayamahal Road, Bengaluru, Karnataka 560006',
        phone: '9845199999',
        openingHours: '24 Hours Open',
        placeId: 'ChIJHeavyStay001',
        rooms: heavyRooms
      };

      const resStay = await genPreview(heavyStayPayload);
      console.log(`  [Compressed Token Length] with 6 detailed rooms: ${resStay.token.length} chars (Limit: 7500)`);
      assert(resStay.token.length < 7500, `Stay token length (${resStay.token.length}) must be < 7500 chars`);
      assert(resStay.html.includes('Luxury Suite Category 6'), 'Rendered HTML must contain room items');
    });

    // ──────────────────────────────────────────────
    // Test 7: Enforce 7500 limit rejection with 400
    // ──────────────────────────────────────────────
    await test('Server rejects payloads exceeding 7500 chars with HTTP 400 and clear error message', async () => {
      // Create 60 items with high-entropy unique descriptions so compressed token exceeds 7500 chars
      const crypto = require('crypto');
      const overflowMenu = [];
      for (let i = 0; i < 60; i++) {
        overflowMenu.push({
          category: 'Category ' + i,
          name: 'Item ' + i,
          price: '₹' + (100 + i),
          description: crypto.randomBytes(150).toString('hex') // 300 hex chars of uncompressible data
        });
      }

      const res = await fetch(`${baseUrl}/api/generate-site`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Gigantic Overflow Test',
          type: 'Restaurant',
          menu: overflowMenu
        })
      });

      assert.strictEqual(res.status, 400, `Expected 400, got ${res.status}`);
      const data = await res.json();
      assert(data.error && data.error.includes('Preview link size limit exceeded'), `Must explain size limit in error, got: ${data.error}`);
    });

    // ──────────────────────────────────────────────
    // Test 8: Interactive HTML Menu: Category tabs, Search & Veg/Non-Veg filter
    // ──────────────────────────────────────────────
    await test('Interactive HTML Menu renders category tabs, live search input, and veg/non-veg filter', async () => {
      const restWithMenu = {
        name: 'Spice Symphony Bistro',
        type: 'Restaurant',
        address: 'Indiranagar, Bengaluru',
        phone: '9845012345',
        menu: [
          { category: 'Starters', name: 'Crispy Corn Tikki', price: '₹220', vegNonVeg: 'veg', description: 'Sweet corn cakes' },
          { category: 'Starters', name: 'Tandoori Murgh', price: '₹340', vegNonVeg: 'non-veg', description: 'Roasted spring chicken' },
          { category: 'Curries', name: 'Dal Makhani', price: '₹260', vegNonVeg: 'veg', description: 'Slow cooked black lentils' }
        ]
      };

      const res = await genPreview(restWithMenu);
      const html = res.html;

      assert(html.includes('class="menu-categories-tabs"'), 'Must have category tabs wrapper');
      assert(html.includes("filterMenuCategory(this, 'Starters')"), 'Must have Starters tab filter button');
      assert(html.includes('id="menu-search-input"'), 'Must have live search input');
      assert(html.includes('class="veg-filter-toggles"'), 'Must have veg filter toggle buttons');
      assert(html.includes('data-veg="veg"') && html.includes('data-veg="non-veg"'), 'Menu item cards must have data-veg attributes');
      assert(html.includes('applyMenuFilters'), 'Client-side script must implement applyMenuFilters');
    });

    // ──────────────────────────────────────────────
    // Test 9: Stay Booking Widget & Table Reservation Modal
    // ──────────────────────────────────────────────
    await test('Booking widget (Stay) and Table Reservation modal (Restaurant) with prefilled WhatsApp flow', async () => {
      // Stay booking widget
      const resStay = await genPreview(stay1);
      assert(resStay.html.includes('id="booking-widget"'), 'Stay must have booking widget');
      assert(resStay.html.includes('id="stay-booking-form"'), 'Stay must have booking form');
      assert(resStay.html.includes('handleStayBooking'), 'JS must include handleStayBooking logic');
      assert(resStay.html.includes('Booking request: the property will confirm availability and price'), 'Must label booking request disclaimer');

      // Restaurant reservation modal
      const resRest = await genPreview(rest1);
      assert(resRest.html.includes('id="reservation-modal"'), 'Restaurant must include reservation modal');
      assert(resRest.html.includes('handleReservationSubmit'), 'JS must include handleReservationSubmit logic');
      assert(resRest.html.includes('Reservation request: the restaurant will confirm your table and slot'), 'Must label reservation request disclaimer');
    });

    // ──────────────────────────────────────────────
    // Test 10: Room Detail Modal with URL Hash Deep-linking
    // ──────────────────────────────────────────────
    await test('Room Detail modal with URL hash (#room-i) deep linking and drawer open logic', async () => {
      const res = await genPreview(stay1);
      const html = res.html;

      assert(html.includes('id="room-detail-modal"'), 'Must include room-detail-modal');
      assert(html.includes('openRoomModal'), 'Must include openRoomModal function');
      assert(html.includes('#room-'), 'Must check window.location.hash for #room-');
    });

    // ──────────────────────────────────────────────
    // Test 11: Accessible Lightbox with author attribution and touch gestures
    // ──────────────────────────────────────────────
    await test('Accessible Lightbox with Google contributor author link and touch swipe gestures', async () => {
      const res = await genPreview(stay1);
      const html = res.html;

      assert(html.includes('id="lb-overlay"'), 'Must include lb-overlay');
      assert(html.includes('data-author-name="Arun K"'), 'Thumbnail must contain contributor author name');
      assert(html.includes('touchstart') && html.includes('touchend'), 'Must have touch swipe event listeners');
      assert(html.includes('Escape') && html.includes('ArrowRight') && html.includes('ArrowLeft'), 'Must have keyboard listeners');
    });

    // ──────────────────────────────────────────────
    // Test 12: Quick answers FAQ accordion built only from verified facts
    // ──────────────────────────────────────────────
    await test('Quick answers FAQ accordion built strictly from verified facts', async () => {
      const stayWithFacts = {
        name: 'The Oasis Heritage Retreat',
        type: 'Stay',
        address: 'Whitefield, Bengaluru',
        phone: '9845112233',
        openingHours: 'Check-in: 1:00 PM | Check-out: 11:00 AM',
        enriched: {
          features: {
            allowsDogs: true,
            parkingOptions: { freeParkingLot: true },
            paymentOptions: { acceptsCreditCards: true }
          }
        },
        optionalFields: {
          checkinOut: 'Check-in: 1:00 PM | Check-out: 11:00 AM',
          houseRules: 'Quiet hours after 10:00 PM.'
        }
      };

      const res = await genPreview(stayWithFacts);
      const html = res.html;

      assert(html.includes('id="faq"'), 'Must render FAQ section');
      assert(html.includes('What are the check-in and check-out timings?'), 'FAQ must include checkin question');
      assert(html.includes('Is the property pet-friendly?'), 'FAQ must include pet question');
      assert(html.includes('Is vehicle parking available on premises?'), 'FAQ must include parking question');
      assert(html.includes('What payment methods are accepted?'), 'FAQ must include payment question');
      assert(html.includes('What are the property house rules?'), 'FAQ must include house rules question');
    });

    // ──────────────────────────────────────────────
    // Test 13: Indian-mobile WhatsApp validation rule (+91, 10 digits 6-9, 80 landline gets call only)
    // ──────────────────────────────────────────────
    await test('Strict Indian mobile validation (+91 format, 10 digits starting with 6-9, landlines get Call only)', async () => {
      const mobileStay = {
        name: 'Green Villa',
        type: 'Stay',
        phone: '+91 98451 98451' // Valid mobile
      };

      const landlineStay = {
        name: 'Bangalore Club',
        type: 'Stay',
        phone: '080-22223344' // Bengaluru landline
      };

      const resM = await genPreview(mobileStay);
      assert(resM.html.includes('https://wa.me/919845198451'), 'Mobile stay must have WhatsApp button');

      const resL = await genPreview(landlineStay);
      assert(!resL.html.includes('https://wa.me'), 'Landline stay must NOT have WhatsApp button');
      assert(resL.html.includes('tel:+918022223344'), 'Landline stay must have Call button');
    });

    // ──────────────────────────────────────────────
    // Test 14: Strict SEO, Noindex, and Mandatory Disclaimers
    // ──────────────────────────────────────────────
    await test('Strict robots headers, meta noindex, and disclaimer banner top & footer', async () => {
      const res = await genPreview(stay1);
      const robotsHeader = res.res.headers.get('x-robots-tag');
      assert(robotsHeader && robotsHeader.includes('noindex'), 'Must send X-Robots-Tag: noindex header');
      assert(res.html.includes('<meta name="robots" content="noindex, nofollow">'), 'Must contain robots noindex meta tag');

      const expectedText = 'Preview prepared for Wildwood Eco Lodge &amp; Treehouse by Susunetech. This is a draft preview created for demonstration purposes only. It is not the official website of the business and has not been approved or published by the owner.';
      assert(res.html.includes(expectedText), 'Top and footer must contain exact disclaimer text');
      assert((res.html.match(new RegExp('Preview prepared for Wildwood Eco Lodge &amp; Treehouse by Susunetech', 'g')) || []).length >= 2, 'Disclaimer must appear top and footer');
    });

    // ──────────────────────────────────────────────
    // Test 15: Responsive CSS & Accessibility rules
    // ──────────────────────────────────────────────
    await test('Responsive CSS rules, touch targets >= 44px, fluid typography clamp(), prefers-reduced-motion', async () => {
      const res = await genPreview(stay1);
      const html = res.html;

      assert(html.includes('min-height: 44px'), 'Buttons and tap targets must have min-height: 44px');
      assert(html.includes('clamp('), 'Typography must use fluid clamp()');
      assert(html.includes('prefers-reduced-motion: reduce'), 'Must respect prefers-reduced-motion');
      assert(html.includes('@media (min-width: 641px)'), 'Must include 641px tablet breakpoint');
      assert(html.includes('@media (min-width: 768px)'), 'Must include 768px breakpoint');
      assert(html.includes('@media (min-width: 1024px)'), 'Must include 1024px breakpoint');
      assert(html.includes('overflow-x: hidden'), 'Must prevent horizontal scroll');
    });

  } finally {
    server.close();
  }

  console.log('\n================================================================');
  console.log(`🏁 COMPREHENSIVE SUITE RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================\n');

  if (failed > 0) process.exit(1);
}

runComprehensiveTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
