# Location Finder & Hospitality Website Preview Generator

A full-stack Node.js + Express web application that discovers hospitality businesses (Restaurants, Stays, or Both) using the **Google Places (New) API** and **TomTom Search API**, evaluates website availability, verifies business facts, allows structured extra data entry and photo uploads, and generates professional, hospitality-grade website previews for businesses without an active web presence.

---

## 🌟 Architecture & Features (Sections 1 – 8)

### 1. Streamlined Search Interface (Section 1)
- **Simplified Controls**: The search bar contains only 4 essential controls:
  - **Location**: City or town name input with automatic resolution.
  - **Category**: Restaurants, Stays, or Both.
  - **Data source**: Google Places or TomTom.
  - Two search buttons: **"Search Places"** and **"Search Places (without website)"**.
- **Removed Distractions**: Removed legacy business name search, manual "add missing place" box, search radius selectors (Small/Medium/Large/City-wide), confirmation alert dialogs, and sticky table columns.

---

### 2. Location Resolution: Any Spelling Gives the Same Results (Section 2)
- **Places Text Search (New) Resolution**: Before searching for businesses, the typed location is resolved with Google Places Text Search (New) with `regionCode: "IN"`, `languageCode: "en"`, `pageSize: 5`, and area filtering.
- **Area-Only Matching**: Accepts only geographical administrative areas (`locality`, `sublocality`, `neighbourhood`, `administrative_area_level_2/3`, `colloquial_area`, `postal_code`, `political`). Businesses with similar names are ignored.
- **Multi-Level Fallback**:
  1. Searches typed text.
  2. If no area found, retries with `", India"` appended.
  3. If still nothing found, checks `aliases.json`.
- **Ambiguous Resolution ("Did you mean...?")**:
  - If several plausible areas with different place IDs are returned (e.g. "Aurangabad" in Maharashtra vs Bihar), a *"Did you mean...?"* prompt displays up to 5 candidates (name, district, and state) for the user to choose.
  - The selection is remembered for that typed text in `sessionStorage` for the entire session.
- **Shared Cache & Banner**:
  - Displays above the table: `"Showing results for {official name}, {state}"` and `"You typed: {typed text}"` if they differ.
  - Results are cached by the resolved place ID and category, ensuring that searching "Mysore" and "Mysuru" share the identical cache and return identical results.
- **Alias Management (`aliases.json`)**:
  - Contains 27+ historical and alternate spellings (e.g., Mysore/Mysuru, Bangalore/Bengaluru, Mangalore/Mangaluru, Kumata/Kumta, Bombay/Mumbai, Madras/Chennai, Poona/Pune, etc.).
  - Whenever typed text and resolved name differ, it is logged to the server console (without keys).
  - **How to add more aliases**: Add a key-value pair to `aliases.json`:
    ```json
    {
      "old_or_alternate_spelling": "Official Google Name"
    }
    ```

---

### 3. Automatic City-Wide Search & Vercel Stepped Execution (Section 3)
- **Automatic City-Wide Coverage**: Searching a city returns places for the whole city automatically.
- **Viewport Bounds Filtering**: Uses the resolved area viewport as a `locationRestriction` rectangle. The typed city name is not appended to the place queries.
- **Adaptive Tiling**:
  - Starts with the whole viewport as tile depth 0.
  - Runs Text Search with category wordings:
    - **Restaurants**: `restaurant`, `cafe`, `bakery`, `fast food`, `dhaba`, `mess`, `tiffin`, `biryani`.
    - **Stays**: `hotel`, `lodge`, `guest house`, `homestay`, `resort`, `PG hostel`, `service apartment`.
  - Up to 3 pages fetched with `nextPageToken`.
  - When a tile and wording reach the 60-result cap, it automatically splits the tile into 4 sub-tiles and repeats recursively up to depth 4.
- **Vercel Timeout Mitigation (`POST /api/search/step`)**:
  - The search executes in short steps initiated by the frontend.
  - Each step makes at most 15 Google Places requests, run 5 at a time, finishing in under 8 seconds to stay safely within Vercel's serverless function timeout limits.
  - Returns new places and an HMAC-SHA256 signed cursor (`SEARCH_SECRET`) preventing client tampering.
  - Handles HTTP 429 rate limits with exponential backoff and retries.
- **Live Progress & Background Health Checks**:
  - Progress bar shows live count: *"Searching... 142 places found"*.
  - Places are rendered immediately on the screen as they arrive in each step.
  - Website status checks and shortener redirection run in the background via `POST /api/check-websites-batch`, updating each row as checks finish.
- **Cost Safety Limits**:
  - `SEARCH_REQUEST_CAP` (default 300) per search stops the search safely if reached, displaying *"Search stopped at the request limit, results may be incomplete"*.
  - `DAILY_REQUEST_CAP` (default 1500) provides a daily best-effort safety counter.
  - Displays requests used: `"Used 118 Google requests"`.

---

### 4. Pagination & Complete Excel Export (Section 4)
- **Client-Side Pagination**:
  - Displays 20 places per page.
  - Previous / Next buttons and page numbers with ellipsis.
  - Summary label: `"Showing 21 to 40 of 361"`.
  - Table scrolls smoothly to the top whenever the page changes.
  - Sorting and filters apply to the entire dataset before paging; changing filters or sorting resets to page 1.
- **Excel Export**:
  - Exports **ALL** rows matching current filters (across every page).
  - Includes: Name, Type, Address, Phone, Rating, Website, Website Status, Opening Hours, Map Link, Business Status, Place ID, Google Types, and Date Fetched.

---

### 5. Table Layout That Fits the Screen (Section 5)
- **Screens >= 1280 px**:
  - `table-layout: fixed; width: 100%;` inside a container (`max-width: 1600px`).
  - All 10 columns are fully visible with **zero horizontal scrolling**:
    - **Name**: 16% (clamped to 2 lines)
    - **Type**: 7%
    - **Address**: 17% (2-line clamp with full tooltip and Details drawer access)
    - **Phone**: 11% (formatted as `+91 XXXXX XXXXX` or `+91 80 XXXX XXXX`, `white-space: nowrap`, actionable `tel:` links)
    - **Rating**: 7% (e.g. `4.2 (605)` on one line)
    - **Website**: 12% (1-line ellipsis with hover tooltip)
    - **Website Status**: 8%
    - **Opening Hours**: 10% (`Today: 10 AM - 10 PM` with full 7-day schedule in tooltip)
    - **Map**: 4% (compact icon button with tooltip)
    - **Actions**: 8% (compact "Generate" button or disabled "Has website" button, plus Details `ℹ` and Refresh `↻` icons)
- **Screens < 1100 px**:
  - Switches automatically to a clean card layout per place with zero horizontal scrolling.

---

### 6. Warnings, URL Shorteners & Details Drawer (Section 6)
- **Focused Warning Icon**:
  - **Never warns about missing website** (missing website is the intended target).
  - Warns strictly for:
    1. Missing phone number.
    2. Invalid phone format (not standard 10-digit Indian number).
    3. Missing opening hours.
    4. Business marked `CLOSED_TEMPORARILY`.
    5. Name contains phone number or promotional wording.
    6. Address missing a 6-digit postal pincode.
- **URL Shortener Resolution**:
  - Server follows shorteners (`cutt.ly`, `bit.ly`, `tinyurl.com`, `rb.gy`, `t.co`, `goo.gl`, `linktr.ee`, etc.) up to 5 redirects with a 5-second timeout.
  - If destination is social/listing (Instagram, Facebook, Zomato, Swiggy, JustDial), marks row as `"No own website"` and shows platform name.
- **Details Drawer**:
  - Shows Google's `primaryType` and all `types`.
  - Includes an interactive **Reclassify** dropdown (Restaurant / Stay) that updates the row, the website generator, and Excel export.
- **Review Window**:
  - Shows `"No photos found on this place's Google pin"` only when Google returns zero photos.
  - **"+ Add photo"** button is always accessible.

---

## 🔑 Environment Variables Setup

Configure the following variables in your local `.env` and in your **Vercel Project Settings** (**Settings → Environment Variables**):

| Variable | Required? | Default | Description |
| :--- | :--- | :--- | :--- |
| `GOOGLE_PLACES_API_KEY` | **Yes** | — | Google Places API (New) key with Text Search, Place Details, and Photos enabled. |
| `TOMTOM_API_KEY` | Optional | — | TomTom Search API key for fallback search. |
| `SEARCH_SECRET` | **Yes** | `location_finder_secret_key` | Secret key used to sign and verify HMAC cursors between stepped search calls. |
| `SEARCH_REQUEST_CAP` | Optional | `300` | Maximum Google API requests permitted per search session. |
| `DAILY_REQUEST_CAP` | Optional | `1500` | Daily request quota safety ceiling. |
| `BLOB_READ_WRITE_TOKEN` | Recommended (Vercel) | — | Token from Vercel Blob store for persistent owner photo uploads. |
| `PORT` | Optional | `3000` | Local server port. |

### Example `.env` file:
```env
GOOGLE_PLACES_API_KEY=AIzaSy...
TOMTOM_API_KEY=your_tomtom_key_optional
SEARCH_SECRET=my_ultra_secure_hmac_secret_2026
SEARCH_REQUEST_CAP=300
DAILY_REQUEST_CAP=1500
BLOB_READ_WRITE_TOKEN=vercel_blob_rw_...
PORT=3000
```

---

## ☁️ Deploying to Vercel

1. **Push repository to GitHub**:
   ```bash
   git add .
   git commit -m "Complete Location Finder v2 updates (Sections 1-8)"
   git push origin main
   ```
2. **Connect to Vercel**:
   - Import your GitHub repository in the Vercel Dashboard.
   - Framework Preset: **Other** (Express / Node.js).
3. **Add Environment Variables in Vercel**:
   - Go to **Project Settings → Environment Variables**.
   - Add:
     - `GOOGLE_PLACES_API_KEY`
     - `SEARCH_SECRET`
     - `SEARCH_REQUEST_CAP` (e.g. `300`)
     - `DAILY_REQUEST_CAP` (e.g. `1500`)
     - `BLOB_READ_WRITE_TOKEN` (Create from Vercel Storage → Blob)
     - `TOMTOM_API_KEY` (if used)
4. **Deploy**:
   - The stepped architecture (`/api/search/step`) ensures each step runs within 2–4 seconds, well under the Vercel Hobby 10s serverless timeout.

---

## 🧪 Testing Suites

Run tests locally:
```bash
# Test all 27 alias pairs and ambiguous location resolution
node test_resolve_suite.js

# Test stepped search, Mysore vs Mysuru parity, Excel export, and website previews
node test_section7_flows.js

# Test small town (Kumta) vs big city (Bengaluru) adaptive search
node test_town_and_city.js
```
