# Location Finder & Website Health Checker

A full-stack Node.js + Express application that discovers nearby places (Restaurants, Stays, or Both) using the **TomTom Search API**, performs parallel website availability checks, and exports interactive, styled Excel spreadsheets.

---

## 🌟 Key Features

- **TomTom Geocoding & POI Search**: Resolves location queries (e.g., "Indiranagar, Bengaluru", "MG Road, Bengaluru", "Udupi, Karnataka") and fetches nearby places using TomTom POI Category API (`categorySet=7315` for Restaurants, `7314` for Stays).
- **Auto-Expanding Radius**: Automatically retries search starting at 2,000 m, expanding to 5,000 m and 10,000 m if fewer than 5 results are returned.
- **Parallel Website Health Verification**: Tests website URLs with a 5-second timeout, custom User-Agent, HEAD request (with GET fallback), classifying status into:
  - 🟢 **Active**: 2xx/3xx response
  - 🟠 **Active (restricted)**: 403/429 response
  - 🔴 **Inactive**: Error, 404/5xx, or timeout
  - ⚪ **Not listed**: No website URL provided by API
- **10-Minute Query Cache**: In-memory caching for duplicate searches to optimize API rate usage.
- **Interactive UI**:
  - Filter checkbox: *Show only places with an active website*.
  - Sort table columns ascending/descending by clicking table headers.
  - Live summary line detailing total results, count with phone, and count with website.
  - Color-coded status badges and direct clickable links for websites and Google Maps navigation.
- **Excel (.xlsx) Export**:
  - Styled dark header with frozen row and column auto-filters.
  - Auto-fitted column widths and custom cell background colors for Website Status.
  - Clickable hyperlinks for Website and Google Maps location cells.

---

## 🔒 Security & Privacy

- The TomTom API key is stored securely in `.env` as `TOMTOM_API_KEY` and accessed exclusively by the backend server via `dotenv`.
- The key is **never** exposed to client-side JavaScript, API responses, console logs, error messages, or documentation.
- `.env` and `node_modules/` are strictly ignored by `.gitignore`.

---

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or higher recommended)
- TomTom API key

### 1. Installation

Clone or open the project folder and install dependencies:

```bash
npm install
```

### 2. Environment Configuration

Ensure a `.env` file exists in the project root directory containing your TomTom API key:

```env
TOMTOM_API_KEY=your_tomtom_api_key_here
```

### 3. Running the Server

Start the application server:

```bash
npm start
```

The application will launch at: [http://localhost:3000](http://localhost:3000)

---

## ⚠️ Known Limitations

- **Source Data Coverage**: Phone numbers, website URLs, and opening hours depend on TomTom's POI database coverage for the specified region. Some places may return `"Not available"`.
- **Strict Server Protection**: Servers that block automated HTTP checks (even with browser User-Agents) may be classified as `Active (restricted)` or `Inactive`.

---

## 🛠️ Tech Stack

- **Backend**: Node.js, Express, `dotenv`, `exceljs`
- **Frontend**: Plain HTML5, Vanilla CSS3 (custom CSS design system with glassmorphism dark theme), JavaScript (Fetch API)
- **Data Provider**: TomTom Search & Geocoding API
