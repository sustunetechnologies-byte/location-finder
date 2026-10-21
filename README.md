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
### 3. Automatic City-Wide Search & Shared Search Engine (`processSearchQueue`)
- **Automatic City-Wide Coverage**: Searching a city returns places for the whole city automatically.
- **Viewport Bounds Filtering**: Uses the resolved area viewport as a `locationRestriction` rectangle.
- **Shared Engine (`processSearchQueue`)**: Both `/api/search/step` and `/api/search` execute the exact same shared queue engine with batching of 5, at most 15 requests per step.
- **Wording Lists**:
  - **Restaurants (13)**: `restaurant`, `hotel`, `cafe`, `south indian restaurant`, `bakery`, `fast food`, `family restaurant`, `vegetarian restaurant`, `dhaba`, `mess`, `tiffin`, `biryani`, `military hotel`.
  - **Stays (7)**: `hotel`, `lodge`, `guest house`, `homestay`, `resort`, `PG hostel`, `service apartment`.
  - **Both**: Union of all 19 unique wordings.
- **Classification**: Places classified from Google's `primaryType` and `types` (never words in name). Places with both food and stay types are labelled `Restaurant and Stay`.
- **Adaptive Tile Splitting**:
  - Splitting evaluates after the third page of a tile and wording (`pageIndex === 2`).
  - Triggers if the page was full (20 raw results) OR a `nextPageToken` was returned, and tile depth is below the max depth for that wording.
  - **Max depth**: **5** for `restaurant`, `hotel`, `cafe`, `lodge`; **2** for all other niche wordings.
  - Sub-tiles are logged without keys (`[Tile Split] Wording: "...", Depth: N`).
- **Resilient Error Handling**:
  - HTTP 429 and 5xx are retried up to 2 times with backoff in the queue.
  - Final failures are recorded in the `errors` array and surfaced to the UI.
  - HTTP 403 or daily limit halts immediately with a clear error.
- **Stateless Cursor**:
  - The HMAC cursor carries all seen place IDs (not capped at 500) and is compressed with `zlib.deflateSync` before base64url encoding.
  - Zero reliance on server memory between steps.
  - Caches for 10 minutes only when complete, uncapped, and error-free.

---

### 4. Pagination & Complete Excel Export (Section 4)
- **Client-Side Pagination**:
  - Displays 20 places per page.
  - Summary label: `"Showing 1 to 20 of 3183"`.
  - Table scrolls smoothly to top on page navigation.
- **Excel Export**:
  - Exports **ALL** rows matching current filters across every page.
  - Formats phone numbers without inventing digits.

---

### 5. Table Layout & Amber Warning Banners
- **Amber Warning Banners**:
  - When search hits the request limit (`capped: true`), displays: *"Search stopped at the request limit, results may be incomplete"*.
  - When search errors occur, displays: *"Some searches failed, results may be incomplete"*.
  - Final summary prominently displays: *"N places found, N Google requests used"*.

---

### 6. Phone Formatting & WhatsApp Detection (Section 7)
- **Zero Invention**: Never invents digits or area codes (e.g. 8-digit numbers like `12345678` are formatted as `+91 12345678`, never adding fake `80`).
- **Google Grouping Preserved**:
  - Indian mobile numbers: `+91 NNNNN NNNNN` (first digit 6, 7, 8, or 9; includes `80xxx` and `79xxx` mobiles).
  - Landlines: `+91 ` + Google's own grouping with trunk `0` stripped (e.g. `080 2345 6789` -> `+91 80 2345 6789`, `0821 2345678` -> `+91 821 2345678`).
- **WhatsApp**:
  - Validated for Indian mobiles starting with 6, 7, 8, 9. Numbers beginning with 80 or 79 are fully valid mobiles for WhatsApp.
  - Intern manual input accepted if 10 digits starting with 6–9.
  - Landlines receive a Call button only.

---

## 🔑 Environment Variables Setup

Configure the following variables in your local `.env` and in your **Vercel Project Settings** (**Settings → Environment Variables**):

| Variable | Required? | Default | Description |
| :--- | :--- | :--- | :--- |
| `GOOGLE_PLACES_API_KEY` | **Yes** | — | Google Places API (New) key with Text Search, Place Details, and Photos enabled. |
| `SEARCH_SECRET` | **Yes** | *None (auto-generated with warning)* | Secret key used to sign HMAC cursors. **Must be explicitly set in Vercel** so multi-instance serverless steps share the identical key! |
| `SEARCH_REQUEST_CAP` | Optional | `600` | Maximum Google API requests permitted per search session (default is 600). |
| `DAILY_REQUEST_CAP` | Optional | `1500` | Daily request quota safety ceiling. |
| `DEBUG_PLACE_NAME` | Optional | — | Place name substring to log diagnostics for (e.g. `Hanumanthu`), tracing which wording/tile found it or why it was dropped. |
| `TOMTOM_API_KEY` | Optional | — | TomTom Search API key for fallback search. |
| `BLOB_READ_WRITE_TOKEN` | Recommended (Vercel) | — | Token from Vercel Blob store for persistent owner photo uploads. |
| `PORT` | Optional | `3000` | Local server port. |

### Example `.env` file:
```env
GOOGLE_PLACES_API_KEY=AIzaSy...
SEARCH_SECRET=my_ultra_secure_hmac_secret_2026
SEARCH_REQUEST_CAP=600
DAILY_REQUEST_CAP=1500
DEBUG_PLACE_NAME=Hanumanthu
TOMTOM_API_KEY=your_tomtom_key_optional
BLOB_READ_WRITE_TOKEN=vercel_blob_rw_...
PORT=3000
```

---

## ☁️ Deploying to Vercel

1. **Push repository to GitHub**:
   ```bash
   git add .
   git commit -m "Fix Google Places search coverage and accuracy bugs (Sections 1-8)"
   git push origin main
   ```
2. **Set Environment Variables in Vercel**:
   - Go to **Project Settings → Environment Variables**:
     - `GOOGLE_PLACES_API_KEY` = your Google Places API key
     - `SEARCH_SECRET` = a random 32+ char string (e.g. `locfinder_hmac_secret_2026_xyz`)
     - `SEARCH_REQUEST_CAP` = `600`
     - `DAILY_REQUEST_CAP` = `1500`
     - `BLOB_READ_WRITE_TOKEN` = (from Vercel Storage → Blob)
     - `TOMTOM_API_KEY` = (optional)
     - `DEBUG_PLACE_NAME` = (optional, e.g. `Hanumanthu`)

---

## 🧪 Testing Suites

Run tests locally:
```bash
# 1. Offline phone formatting and WhatsApp test (zero Google requests)
node test_phone_offline.js

# 2. Mysuru verification search (validates splits, requests, Hanumanthu discovery, Excel export)
node test_mysuru_both.js

# 3. Test alias pairs and ambiguous location resolution
node test_resolve_suite.js
```
