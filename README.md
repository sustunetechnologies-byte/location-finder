# Location Finder & Hospitality Website Preview Generator

A full-stack Node.js + Express web application that discovers hospitality businesses (Restaurants, Stays, or Both) using the **Google Places (New) API** and **TomTom Search API**, evaluates website availability, verifies business facts, allows structured extra data entry and photo uploads, and generates professional, hospitality-grade website previews for businesses without an active web presence.

---

## 🌟 Key Features & Implementation Details (Sections 1 – 5)

### 1. Table Layout: No Horizontal Scrolling for Actions (Section 1)
- **Sticky Columns with Solid Backgrounds**:
  - **Name Column** is sticky on the left edge (`left: 0`).
  - **Action Column** (Generate Website, Details, Refresh) is sticky on the right edge (`right: 0`).
  - Solid background colors prevent content from showing through during scrolling (`#1F2937` on table headers, `var(--bg-card)` on table cells).
- **Narrow & Compact Layout**:
  - Truncated addresses (`.address-cell`) with ellipsis and full address in tooltip and Details drawer.
  - Compact opening hours (`.hours-compact`): displays "Today: 10:00 AM–10:00 PM" with the full 7-day schedule visible in a hover tooltip.
  - Rating and review count combined in a single narrow column (`4.2 ★ (120)`).
  - Compact phone number and map link columns.
- **Mobile Card Layout (under 900 px)**:
  - Automatically switches each place into a responsive card layout displaying name, type, phone, rating, website status, and action buttons.
  - `overflow-x: hidden !important` eliminates horizontal scrolling completely.
- **Filters & Excel Export**:
  - Keeps sorting, category filters, website status filters, and Excel export intact.

---

### 2. Warning Icon Logic (Section 2)
- **Exact Warning Criteria**:
  - **Amber "Verify" Warnings**:
    1. Missing phone number.
    2. Phone not in valid Indian 10-digit mobile/landline format.
    3. Missing opening hours.
    4. Business marked `CLOSED_TEMPORARILY` on Google Maps.
    5. Name contains a phone number or promotional text (e.g., `"call 80882..."`).
    6. Address is missing a 6-digit postal pincode.
  - **Grey "Info" Flag**:
    - No rating or reviews on Google.
  - **No Warning for Missing Website**:
    - Finding places without websites is the core objective of the tool, so missing websites are never flagged as warnings.
- **Interactive Warning Popover**:
  - Hover, click, or keyboard focus opens an accessible popover detailing each verification issue and info item.
- **Legend & Filter**:
  - Legend added above the results table: `⚠ = data to verify before generating`.
  - Filter checkbox: **"Hide places with warnings"**.

---

### 3. Review Window: Editable Fields & Photo Uploads (Section 3)
- **Zero-Photo Messaging**:
  - Shows `"No photos found on this place's Google pin. You can upload owner-provided photos below."` when Google returns zero photos.
- **Editable Fields with Mandatory Verification**:
  - **Display Name**: Editable, displays original Google name alongside it.
  - **Phone Number**: Editable in `+91` format.
  - **WhatsApp Number**: Editable with Indian mobile validation.
  - **Opening Hours**: Editable custom hours text (verification checkbox only appears when text is entered).
  - **Short Description**: Editable editorial summary.
  - Each field has a required **"Verified"** checkbox. "Generate Website" remains disabled until all active fields are confirmed.
- **Phone Number in Name Detection**:
  - If a phone number or promo text is detected in the Google name, a banner suggests a cleaned business name and offers to automatically move the extracted number into the Phone field (requires confirmation).
- **Owner-Provided Photo Uploads**:
  - **"+ Add photo" button** is always accessible, even when Google returns 0 photos.
  - Supported formats: **JPEG, PNG, WebP** (max 5 MB each).
  - Resized client-side to max 1600 px via HTML5 Canvas with EXIF metadata stripped.
  - Total photo count capped at 12 photos (Google + uploaded photos combined).
  - Mandatory permission checkbox: *"This photo was provided by the owner or taken by us, and is used with the owner's permission."*
  - Marked with an **"Owner-provided"** badge with no Google Maps Contributor attribution.
  - Includes a **Delete** action for uploads.
  - **Existing photo picker selection logic preserved**: removed photos are never used; if any are ticked only those are used; if none are ticked all non-removed photos are used.

---

### 4. Coverage for Big Cities & Search by Name (Section 4)

#### Root Cause Analysis: Why "Hotel Hanumanthu" in Mysuru Was Missing
1. **Type Classification**: Google Places returns types `['chicken_restaurant', 'south_indian_restaurant', 'hotel', 'indian_restaurant', 'lodging', 'restaurant', ...]`. In India, "Hotel" often refers to a restaurant. The legacy system classified any place with "hotel" or "lodging" as a Stay. Because queries were filtered by category, it was misclassified or filtered out.
2. **Missing `primaryType`**: The legacy API calls omitted Google's `primaryType` field mask. Google Places (New) explicitly provides `primaryType: "restaurant"`.
3. **Query Wordings**: Food queries lacked typical Indian non-veg/military hotel wordings like `"biryani"`, `"mess"`, `"military hotel"`, `"meals"`, `"tiffin"`.
4. **Search Radius**: Hotel Hanumanthu is located in Mandi Mohalla, Mysuru. A single 3 km radius from the city center did not cover all commercial dining clusters.

#### Fixes Implemented:
- Classify places using Google's `primaryType` first, checking restaurant types before stay types.
- Expanded food queries: `"family restaurant"`, `"mess"`, `"tiffin"`, `"biryani"`, `"meals"`, `"military hotel"`, `"darshini"`, `"hotel"`.
- Expanded stay queries: `"lodge"`, `"dormitory"`, `"service apartment"`.
- **Search Area Selector**:
  - **Small (3 km)**: Single center query.
  - **Medium (6 km)**: 4-cell spatial grid.
  - **Large (12 km)**: 9-cell spatial grid.
  - **City-wide**: Up to 16-cell spatial grid with progressive batching (5 requests per batch with 150 ms delays).
- **Search by Name Box**:
  - Search any business name + town (e.g., `"Hotel Hanumanthu, Mysuru"`).
  - Preview name, address, types, and operational status.
  - Add the chosen place directly into the table with all standard columns and actions.
- **Coverage & Safety Guards**:
  - Hard stop above 150 requests per search.
  - Confirmation prompt displaying the estimated request count before running large searches.
  - Daily request counter refuses searches beyond 400 requests/day.
  - Coverage report displays permanently closed counts (e.g., *"3 permanently closed places hidden"*).

---

## ☁️ External Object Storage Setup (Vercel Blob)

For production deployment on Vercel (where the server filesystem is read-only and ephemeral), photo uploads are stored in **Vercel Blob**.

### Environment Variables Required
In your Vercel Project Settings (under **Settings → Environment Variables**), add:

```env
BLOB_READ_WRITE_TOKEN=vercel_blob_rw_****************************
```

### How to Get Your Token:
1. Log in to the [Vercel Dashboard](https://vercel.com).
2. Go to your project and click the **Storage** tab.
3. Click **Create Database** and select **Blob**.
4. Choose a database name and region, then click **Create**.
5. Go to the **Quickstart** or **Settings** tab and copy `BLOB_READ_WRITE_TOKEN`.
6. Add it to your project's Environment Variables for Production, Preview, and Development.

### Local Development Fallback:
If `BLOB_READ_WRITE_TOKEN` is not set (e.g., during local testing), the app automatically falls back to an **in-memory object storage** with random unguessable IDs served via `/api/uploaded-photo/:id` with automatic 30-day time-to-live cleanup.

---

## 🛠️ Automated Testing

Run the automated test suites:

```bash
# Full test suite covering Sections 1 through 5
node test_suite_sections_1_to_5.js

# Viewport responsiveness (1366px, 1024px, 768px, 390px) & warning rules
node test_viewport_and_warnings.js

# Legacy section test suite
node test_sections_1_2_3.js
```

---

## 💻 Tech Stack
- **Backend**: Node.js, Express
- **Cloud Storage**: `@vercel/blob` (Vercel Blob)
- **APIs**: Google Places (New) API, TomTom Search API
- **Export**: ExcelJS
- **Frontend**: Vanilla HTML5, CSS3, Vanilla JavaScript (zero external CDN or framework dependencies)
- **Deployment**: Vercel-ready with stateless preview generation and proxy routing.
