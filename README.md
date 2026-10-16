# Location Finder & Hospitality Website Preview Generator

A full-stack Node.js + Express web application that discovers nearby hospitality businesses (Restaurants, Stays, or Both) using the **Google Places (New) API** and **TomTom Search API**, evaluates website availability, verifies business facts, allows structured extra data entry, and generates professional, hospitality-grade website previews for businesses without an active web presence.

---

## 🌟 Key Features

### 1. Smart Place Search & Verification
- **Dual Providers**: Google Places (New) Text Search with automatic fallback to TomTom POI Category API.
- **Auto-Expanding Radius**: Dynamically expands search radius (2 km → 5 km → 10 km) if initial search yields fewer than 5 places.
- **Parallel Website Availability Check**: Rapid HEAD/GET verification classifying sites into *Active*, *Active (restricted)*, *Inactive*, or *Not listed*.
- **10-Minute Query Cache**: In-memory caching for duplicate searches to preserve quota.
- **Excel Export**: Clean spreadsheet export formatted with ExcelJS including places, health status, ratings, and map links.

---

### 2. Review Window: Extra Data Entry & Verification
Every preview undergoes intern verification in the review modal before generation:
- **Photo Assignment (up to 12 photos)**:
  - Fetched via Google Maps pin thumbnails (through the secure `/api/photo` proxy).
  - Interns can tag each photo as **Hero** (rendered at max width 1200px), **Gallery** (width 800px), **Room Photo** (assigned to a specific room), or **Menu/Food**.
  - All images are lazy-loaded to optimize browser performance and API credits.
- **Rooms Editor (Stays)**:
  - Add room types with: Room Name, Size (sq ft), Capacity, Bed Type, Rate / Tariff per night, Amenities, Short Description, and citation source note (*Owner confirmed* / *Pin photo*).
- **Menu Editor (Restaurants)**:
  - Manual entry: Category, Item Name, Price, Veg/Non-Veg/Egg tag, Description, and citation source note (*Owner confirmed* / *Pin photo*).
  - **Bulk Paste Tool**: Paste multiple menu lines in the standard pipe-delimited format:
    ```text
    Category | Item | Price | Veg/Non-veg | Description (optional)
    ```
    Parses lines into an interactive preview table where interns can edit or delete items before accepting all into the menu.
- **Optional Hospitality Fields**:
  - Online Ordering Link (Zomato / Swiggy / direct)
  - Table Reservation Link (EazyDiner / Dineout / partner portal)
  - Direct Booking Link (Booking.com / property booking engine)
  - Instagram handle or profile URL
  - Check-in and Check-out timings
  - Property House Rules & Policies
  - *Rule*: Buttons or sections appear on the page **only if** their respective field has a value.
- **Dynamic Verification Checkboxes**:
  - The "Generate Website" button remains disabled until every shown field (read-only fetched fields, photo assignments, room types, menu items, and optional links) is individually verified and checked.
- **WhatsApp Mobile Validation**:
  - Validates Indian mobile numbers (10 digits starting with 6, 7, 8, or 9 formatted as `+91`).
  - Landlines (e.g. `080` Bengaluru) receive phone Call buttons only; WhatsApp is omitted.

---

### 3. Preview Link Compression & URL Size Enforcement
- URL tokens carry all business and entered data directly in the URL using **zlib deflate** compression and **base64url** encoding.
- Hard limit of **12000 characters** enforced on token length (with payload review & room description optimization).
- If entered data exceeds the limit, the server rejects generation with HTTP 400 and the review modal displays a clear warning prompting the intern to reduce photos, trim descriptions, or reduce menu items.
- Tested and verified with 40 menu items and 6 detailed rooms (< 1500 chars).

---

### 4. 6 Stay Layout Themes (Hospitality Grade)
Layouts differ fundamentally in structure, section hierarchy, hero type, and components:
1. **Eco-lodge / Nature (`eco-lodge`)**: Organic rounded accents, earthy forest tones, full-bleed hero with Ken Burns zoom, and focus on sustainability amenities.
2. **Urban Sleek (`urban-sleek`)**: Modern two-column grid layout, high-contrast monochrome aesthetic, split hero with typography on left and media stage on right.
3. **Heritage / Homestay (`heritage-homestay`)**: Warm serif editorial typography, textured story sections, magazine-style quote highlights, and traditional hospitality layout.
4. **Beach / Resort (`beach-resort`)**: Bright and airy ocean tones, fluid wave dividers, full-viewport hero backdrop, and horizontal photo showcase.
5. **Luxury (`luxury`)**: Dark obsidian with champagne gold accents, cinematic minimal hero with hairline dividers, and large room showcases.
6. **Budget / PG / Hostel (`budget-hostel`)**: Information-first layout, practical cards highlighting room tariff, rules, and facilities.

#### Automatic Determinism & Manual Override:
- Selected automatically based on Google place types, name keywords, and an FNV-1a hash of the Place ID. The same place ID always gets the exact same layout.
- Review window dropdown allows overriding with any theme.

#### Stay Components:
- **Hero**: Atmospheric full-bleed hero with Ken Burns zoom animation. If no photos exist, renders an animated SVG gradient mesh with zero `<img>` tags.
- **Sticky Booking Widget**: Prominent booking form with Check-in, Check-out, Guests, and Room Type. Submits a prefilled WhatsApp booking request to the property or triggers Call for landlines.
- **Rooms & Rates Grid**: Room cards with specs, tariffs, amenities, and photo thumbnail. Clicking a card opens a modal / drawer with complete room specs (also accessible via URL hash `#room-{i}`).
- **Photo Gallery & Lightbox**: Responsive masonry grid with hover zoom, keyboard navigation (`Escape`, `ArrowLeft`, `ArrowRight`), touch swipe support on mobile, and Google author attributions.
- **Verified Amenities**: Highlight chips derived strictly from true Google flags (parking, pet-friendly, wheelchair accessibility, payment methods).
- **Reviews Section**: Authentic Google contributor reviews with star ratings and Google attribution.
- **Opening Hours Table**: Live table with current day highlighted with a `TODAY` badge and live pulsing status pill (`Open now` / `Closed`).
- **Location & Directions**: Embedded Google Maps iframe with direct "Get directions on Google Maps" button.
- **Quick Answers FAQ**: Accessible `<details>` accordion built exclusively from verified facts.
- **Floating Actions**: Desktop floating call/WhatsApp pills and fixed mobile bottom action bar (`<641px`).

---

### 5. 6 Restaurant Layout Themes (Hospitality Grade)
1. **Fine Dining / Steakhouse (`fine-dining`)**: Dark, warm ambient lighting accents, cinematic luxury hero, and reservation-first navigation.
2. **Casual Cafe (`casual-cafe`)**: Bright, clean typography, playful menu cards, and focus on breakfast/coffee highlights.
3. **Family Restaurant (`family-restaurant`)**: Warm terracotta tones, large prominent menu cards, and multi-cuisine highlights.
4. **Bar & Pub (`bar-pub`)**: Dark obsidian mode with electric accents, bold typography, and taproom/craft beverage highlights.
5. **Traditional Indian (`traditional-indian`)**: Earthy palette, heritage serif typography, and tandoor/thali highlights.
6. **Bakery / Fast Food (`bakery-fast-food`)**: Colorful, large touch-friendly buttons, and quick-order CTA focus.

#### Restaurant Components:
- **Hero**: Hero banner with name, rating, review count, price level in ₹ symbols, cuisine type, and live open/closed badge.
- **Sticky Top Navigation**: Persistent navigation with "Reserve a Table", "Order Online", "Call", "Directions", and "Hours" buttons. Positioned below the disclaimer banner so it never covers it.
- **Interactive HTML Menu**:
  - Category tabs ("All", "Starters", "Mains", "Desserts", etc.).
  - Real-time search filter box.
  - Pure Veg / Non-Veg toggle buttons.
  - Fallback to Menu Photos gallery if no typed menu exists, or "Contact us for the menu" if neither is available.
- **Table Reservation Modal**: Interactive reservation form with Date, Time, and Guest selection that opens WhatsApp with a prefilled reservation message or dials reception for landlines.
- **Food & Ambiance Gallery**: Lightbox with hover zoom using only pin photos.
- **Highlights**: Verified features chips (dine-in, takeout, delivery, outdoor seating, reservations, vegetarian food).

---

### 6. Non-Negotiable Rules & Security Controls
- **Never Invent Facts**: All content is strictly derived from Google Maps pin data or typed by the intern. Empty sections are cleanly hidden.
- **No Stock or AI Images**: Zero stock/AI imagery. Photos are served only through the server-side `/api/photo` proxy.
- **Price Levels**: Displayed strictly as `₹` symbols (`₹` to `₹₹₹₹`).
- **Legal Preview Disclaimer**: Pinned top banner (`#top-disc`) and footer disclaimer:
  > *"Preview prepared for {Business Name} by Susunetech. This is a draft preview created for demonstration purposes only. It is not the official website of the business and has not been approved or published by the owner."*
- **SEO & Indexing Guard**: `<meta name="robots" content="noindex, nofollow">`, `X-Robots-Tag: noindex, nofollow` header on `/preview/:token`, and `Disallow: /preview` in `robots.txt`.
- **Zero API Key Leakage**: API keys remain strictly server-side in environment variables and never appear in client-side HTML, URLs, or error messages.
- **HTML Escaping**: All user-provided and API strings are escaped against XSS attacks.
- **Accessibility & Responsiveness**: Fluid typography (`clamp()`), touch targets >= 44px, tested at 360px, 768px, 1024px, and 1440px widths, and full compliance with `prefers-reduced-motion`.

---

## 🛠️ Testing

The project includes automated verification test suites:

```bash
# Run all automated test suites together
node run_all_tests.js
```

Included test suites:
- `test_all_features.js`: Comprehensive suite testing 4 stays, 4 restaurants, determinism, all 12 theme overrides, 40-item menu and 6-room compression within token limit, 12000 char rejection, interactive menu filtering, booking forms, room drawer deep-linking, lightbox, FAQ accordion, landline vs mobile rules, and disclaimers.
- `test_redesign.js`: Redesign suite testing layout themes, Ken Burns hero, SVG gradient fallback, lightbox gestures, live hours table, and mobile floating action bar.
- `test_features.js`: Automated testing for search endpoint, website health status checks, Excel export, and robots headers.
- `test_run.js`: Deep verification of phone normalization, landline vs WhatsApp logic, and templates.

---

## 💻 Tech Stack
- **Backend**: Node.js, Express
- **APIs**: Google Places (New) API, TomTom Search API
- **Export**: ExcelJS
- **Frontend**: Vanilla HTML5, CSS3 (CSS custom properties, CSS Grid, Flexbox), Vanilla JavaScript (no external CDNs or heavy UI libraries)
- **Deployment**: Vercel-ready with stateless in-memory compression and proxy routing.
