# Location Finder & Website Preview Generator

A full-stack Node.js + Express application that discovers nearby places (Restaurants, Stays, or Both) using the **Google Places (New) API** and **TomTom Search API**, tests website availability, verifies business facts, and generates beautiful, high-converting website previews for businesses without an active web presence.

---

## 🌟 Key Features

### 1. Smart Place Search & Verification
- **Dual Providers**: Google Places (New) Text Search with automatic fallback to TomTom POI Category API.
- **Auto-Expanding Radius**: Dynamically expands search area if initial radius yields fewer than 5 places.
- **Parallel Website Availability Check**: Rapid HEAD/GET verification classifying sites into *Active*, *Active (restricted)*, *Inactive*, or *Not listed*.
- **10-Minute Query Cache**: In-memory caching for duplicate searches to preserve quota.
- **Interactive Review Modal**:
  - Read-only review of verified business data.
  - Optional user-added menu items or room rates with citation sources (`owner confirmed` / `pin photo`).
  - Optional WhatsApp number override (validated for 10-digit Indian mobile starting with 6–9).
  - Intern verification checkboxes required before generation.
  - **Design Theme Selector**: Auto (deterministic from Google Place ID) with manual override for any theme.

### 2. Website Preview Design System (Stays & Restaurants)
Generated previews at `/preview/:token` are self-contained, lightning-fast, and run completely in-memory with zero file writes.

#### Bank of 6 Distinct Layout Themes:
1. **Full-screen Hero with Overlay (`fullscreen-overlay`)**: Immersive full-viewport hero backdrop with frosted glass container and centered storytelling.
2. **Split Hero (`split-hero`)**: Modern editorial two-column layout with left typography and right framed media stage.
3. **Magazine Grid (`magazine-grid`)**: High-end editorial publication style with issue kicker, prominent titles, and structured column blocks.
4. **Minimal Luxury (`minimal-luxury`)**: Spacious, serif-driven aesthetic with generous whitespace and refined hairline dividers.
5. **Resort & Nature (`resort-nature`)**: Soft organic shapes, asymmetrical rounded corners, and relaxing tones.
6. **Modern Dark (`modern-dark`)**: Sleek dark mode with glassmorphic cards, glowing borders, and vibrant ambient highlights.

#### 6 Curated Colour Palettes:
- **Ocean Azure**: `#08101E` midnight background with `#0EA5E9` sky blue accents and `#14B8A6` teal glow.
- **Warm Terracotta**: `#140E0C` dark espresso background with `#EA580C` warm flame orange.
- **Forest Moss**: `#0A130D` deep forest with `#22C55E` fresh leaf green and `#84CC16` lime highlights.
- **Sandstone & Brass**: `#151518` carbon stone with `#D4AF37` royal gold and warm brass borders.
- **Sunset Rose**: `#170B12` dark berry with `#E11D48` vibrant crimson and rose glow.
- **Modern Obsidian**: `#0A0D14` obsidian slate with `#06B6D4` electric cyan and azure glow.

#### 3 Distinct Typography Pairings:
- **Outfit + Inter**: Modern geometric sans-serif for clean, high-tech hospitality.
- **Playfair Display + Plus Jakarta Sans**: Elegant high-contrast serif for luxury resorts and boutique stays.
- **DM Serif Display + Inter**: Rich heritage editorial display pairing.

#### Deterministic Selection & Token Encoding:
- The design theme, colour palette, and font pairing are derived deterministically from a 32-bit FNV-1a hash of the Google Place ID (or business name).
- The same stay **always** receives the exact same cohesive design.
- Different stays automatically receive visually diverse designs.
- Overriding the theme in the review modal encodes the choice into the preview token prefix (`fso_`, `sph_`, `mag_`, `lux_`, `nat_`, `drk_`, or `aut_` + 28 base64url characters = 32 chars).

### 3. Dynamic UI & Animations (No External Libraries)
- **Parallax & Ken Burns**: Subtle zooming parallax animation when Google Maps pin photos are available.
- **Abstract Gradient Mesh**: For places with no photos, renders an animated CSS radial-gradient mesh (never AI or stock photos, no `<img>` tags).
- **Scroll-Reveal Animations**: Native `IntersectionObserver` revealing sections with staggered micro-delays.
- **Micro-Interactions**: Card hover lift & ambient shadow, gallery zoom, button ripple effects, interactive amenity chips, and badge transitions.
- **Sticky Navigation Bar with Scroll-Spy**: Sticky header positioned smoothly below the top disclaimer banner that tracks active sections as you scroll.
- **Accessible Lightbox**: Keyboard-navigable (`Escape`, `ArrowLeft`, `ArrowRight`), touch swipe gesture support for mobile, and required Google author attributions.
- **Live Opening Hours Status**: Parses hours data to display a pulsing `Open now` or `Closed` status badge and highlights the current day of the week.
- **Mobile Floating Action Bar**: Fixed bottom bar on screens `<641px` with Call, WhatsApp (only for valid mobile numbers), Directions, and quick Enquire triggers.
- **Accessibility**: Strict respect for `prefers-reduced-motion` (instantly disables animations) and WCAG AA contrast compliance.

### 4. Strict Content & Security Rules
- **Never Invent Facts**: All content is strictly derived from Google Maps / TomTom data or explicitly entered by the user. If data is absent, the corresponding section is hidden entirely.
- **Price Levels**: Rendered strictly as `₹` symbols (`₹` to `₹₹₹₹`), never fabricated currency amounts.
- **Indian Mobile WhatsApp Rule**: WhatsApp links are generated only for verified 10-digit Indian mobile numbers starting with 6–9. Landlines (e.g. `080`, `022`, etc.) receive Call buttons only.
- **Photos**: Served strictly from the Google Maps pin via `/api/photo` proxy (no API keys exposed to browser).
- **Disclaimer Banners**: Exact legal disclaimer pinned at the top and footer of every preview.
- **SEO & Indexing Guard**: `<meta name="robots" content="noindex, nofollow">`, `X-Robots-Tag: noindex, nofollow`, and `robots.txt` Disallow rule.
- **XSS Protection**: All user-provided and API-returned values are HTML-escaped.

---

## 🚀 Getting Started

### Prerequisites
- Node.js (v18 or higher)
- Google Places API Key (`GOOGLE_PLACES_API_KEY`) and/or TomTom API Key (`TOMTOM_API_KEY`)

### Installation & Run
```bash
npm install
npm start
```
The app will start at `http://localhost:3000`.

### Running Tests
Execute the comprehensive test suites:
```bash
node run_all_tests.js
```
Runs:
- `test_run.js`: Deep verification of phone normalization, WhatsApp logic, and templates.
- `test_features.js`: Automated testing for search, export, and preview endpoints.
- `test_redesign.js`: Redesign tests verifying all 6 themes, deterministic hashing, token encoding, Ken Burns hero, photo lightbox with swipe, live hours, and mobile responsiveness.
