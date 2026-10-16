document.addEventListener('DOMContentLoaded', () => {
  // ──────────────────────────────────────────────
  // DOM Elements
  // ──────────────────────────────────────────────
  const searchForm = document.getElementById('search-form');
  const locationInput = document.getElementById('location-input');
  const categorySelect = document.getElementById('category-select');
  const sourceSelect = document.getElementById('source-select');
  const searchBtn = document.getElementById('search-btn');
  const searchNoWebsiteBtn = document.getElementById('search-no-website-btn');

  const loadingState = document.getElementById('loading-state');
  const errorState = document.getElementById('error-state');
  const initialState = document.getElementById('initial-state');
  const emptyState = document.getElementById('empty-state');
  const resultsWrapper = document.getElementById('results-wrapper');

  const errorMessage = document.getElementById('error-message');
  const errorTitle = document.getElementById('error-title');
  const fallbackBanner = document.getElementById('fallback-banner');
  const fallbackBtn = document.getElementById('fallback-btn');
  const fallbackMsg = document.getElementById('fallback-msg');

  const summaryLine = document.getElementById('summary-line');
  const cacheBadge = document.getElementById('cache-badge');
  const sourceBadge = document.getElementById('source-badge');
  const activeOnlyCheckbox = document.getElementById('active-only-checkbox');
  const downloadExcelBtn = document.getElementById('download-excel-btn');
  const placesTbody = document.getElementById('places-tbody');

  const previewAlert = document.getElementById('preview-alert');
  const previewAlertMessage = document.getElementById('preview-alert-message');
  const previewAlertLink = document.getElementById('preview-alert-link');
  const previewAlertClose = document.getElementById('preview-alert-close');

  // Modal
  const enrichModal = document.getElementById('enrich-modal');
  const modalClose = document.getElementById('modal-close');
  const modalLoading = document.getElementById('modal-loading');
  const modalError = document.getElementById('modal-error');
  const modalErrorMsg = document.getElementById('modal-error-msg');
  const enrichForm = document.getElementById('enrich-form');
  const opsWarning = document.getElementById('ops-warning');
  const hasWebsiteWarning = document.getElementById('has-website-warning');
  const reviewFields = document.getElementById('review-fields');
  const noPhotosNote = document.getElementById('no-photos-note');
  const userItemsSection = document.getElementById('user-items-section');
  const userItemsLabel = document.getElementById('user-items-label');
  const userItemsList = document.getElementById('user-items-list');
  const addItemBtn = document.getElementById('add-item-btn');
  const whatsappInput = document.getElementById('whatsapp-input');
  const whatsappValidation = document.getElementById('whatsapp-validation');
  const designSelect = document.getElementById('design-select');
  const designAutoInfo = document.getElementById('design-auto-info');
  const verificationChecks = document.getElementById('verification-checks');
  const modalGenerateBtn = document.getElementById('modal-generate-btn');
  const modalCancelBtn = document.getElementById('modal-cancel-btn');

  // Section 1: Extra Data Entry Elements
  const photoAssignmentSection = document.getElementById('photo-assignment-section');
  const photosAssignmentGrid = document.getElementById('photos-assignment-grid');

  const roomsEditorSection = document.getElementById('rooms-editor-section');
  const roomsList = document.getElementById('rooms-list');
  const addRoomBtn = document.getElementById('add-room-btn');

  const menuEditorSection = document.getElementById('menu-editor-section');
  const menuItemsList = document.getElementById('menu-items-list');
  const addMenuItemBtn = document.getElementById('add-menu-item-btn');

  const toggleBulkPasteBtn = document.getElementById('toggle-bulk-paste-btn');
  const bulkPasteBox = document.getElementById('bulk-paste-box');
  const bulkMenuText = document.getElementById('bulk-menu-text');
  const parseBulkBtn = document.getElementById('parse-bulk-btn');
  const bulkParseStatus = document.getElementById('bulk-parse-status');
  const bulkPreviewWrapper = document.getElementById('bulk-preview-wrapper');
  const bulkPreviewTableContainer = document.getElementById('bulk-preview-table-container');
  const acceptBulkBtn = document.getElementById('accept-bulk-btn');

  const optOrderingLink = document.getElementById('opt-ordering-link');
  const optReservationLink = document.getElementById('opt-reservation-link');
  const optBookingLink = document.getElementById('opt-booking-link');
  const optInstagram = document.getElementById('opt-instagram');
  const optCheckinOut = document.getElementById('opt-checkin-out');
  const optHouseRules = document.getElementById('opt-house-rules');
  const tokenSizeWarning = document.getElementById('token-size-warning');

  const STAY_THEMES = {
    'eco-lodge': 'Eco-lodge / Nature (Organic shapes, earthy tones, Ken Burns zoom)',
    'urban-sleek': 'Urban Sleek (Grid layout, monochrome, split hero)',
    'heritage-homestay': 'Heritage / Homestay (Warm serif, textured, story-style)',
    'beach-resort': 'Beach / Resort (Airy, wave dividers, photo strip)',
    'luxury': 'Luxury (Dark mode, gold accents, cinematic hero)',
    'budget-hostel': 'Budget / PG / Hostel (Info-first, practical cards)'
  };

  const RESTAURANT_THEMES = {
    'fine-dining': 'Fine Dining / Steakhouse (Dark, warm lighting, cinematic)',
    'casual-cafe': 'Casual Cafe (Bright, clean typography, playful)',
    'family-restaurant': 'Family Restaurant (Warm colors, friendly, combos)',
    'bar-pub': 'Bar / Pub (Dark, neon accents, energetic nightlife)',
    'traditional-indian': 'Traditional Indian / South Indian (Earthy, motifs)',
    'bakery-fast-food': 'Bakery / Fast Food (Colorful, quick-order focus)'
  };

  // Legacy mappings for backwards compatibility with test suites
  const THEME_NAMES = {
    ...STAY_THEMES,
    ...RESTAURANT_THEMES,
    'fullscreen-overlay': 'Beach / Resort (Full-screen Overlay)',
    'split-hero': 'Urban Sleek (Split Hero)',
    'magazine-grid': 'Heritage / Homestay (Magazine Grid)',
    'minimal-luxury': 'Luxury (Minimal Luxury)',
    'resort-nature': 'Eco-lodge / Nature',
    'modern-dark': 'Budget / PG / Hostel (Modern Dark)'
  };

  function getAutoThemeName(placeId, name, isStay, types) {
    const typeStr = Array.isArray(types) ? types.join(' ').toLowerCase() : String(types || '').toLowerCase();
    const nameStr = String(name || '').toLowerCase();
    const combined = `${nameStr} ${typeStr}`;

    if (isStay) {
      if (/eco|resort|nature|camp|lodge|treehouse|plantation|farm/i.test(combined)) return { key: 'eco-lodge', name: STAY_THEMES['eco-lodge'] };
      if (/apartment|urban|city|studio|pod|tech|suites|business/i.test(combined)) return { key: 'urban-sleek', name: STAY_THEMES['urban-sleek'] };
      if (/heritage|homestay|palace|haveli|manor|estate|colonial|vintage/i.test(combined)) return { key: 'heritage-homestay', name: STAY_THEMES['heritage-homestay'] };
      if (/beach|coast|ocean|island|sea|bay|cove|haven/i.test(combined)) return { key: 'beach-resort', name: STAY_THEMES['beach-resort'] };
      if (/luxury|grand|royal|boutique|5_star|marquis|villas/i.test(combined)) return { key: 'luxury', name: STAY_THEMES['luxury'] };
      if (/hostel|budget|pg|dorm|inn|motel|backpacker|guest_house/i.test(combined)) return { key: 'budget-hostel', name: STAY_THEMES['budget-hostel'] };

      // Hash fallback
      const keys = Object.keys(STAY_THEMES);
      let hash = 5381;
      const str = String(placeId || name || 'stay');
      for (let i = 0; i < str.length; i++) hash = (((hash << 5) + hash) + str.charCodeAt(i)) & 0x7FFFFFFF;
      const key = keys[Math.abs(hash) % keys.length];
      return { key, name: STAY_THEMES[key] };
    } else {
      if (/fine_dining|steak|wine|french|italian|gourmet|bistro/i.test(combined)) return { key: 'fine-dining', name: RESTAURANT_THEMES['fine-dining'] };
      if (/cafe|coffee|tea|bakery|espresso|roaster|breakfast|brunch/i.test(combined)) return { key: 'casual-cafe', name: RESTAURANT_THEMES['casual-cafe'] };
      if (/family|dhaba|buffet|thali|multi_cuisine|grand/i.test(combined)) return { key: 'family-restaurant', name: RESTAURANT_THEMES['family-restaurant'] };
      if (/bar|pub|brewery|lounge|club|cocktail|beer|taproom/i.test(combined)) return { key: 'bar-pub', name: RESTAURANT_THEMES['bar-pub'] };
      if (/indian|south_indian|north_indian|bhatura|tandoori|dosa|biryani/i.test(combined)) return { key: 'traditional-indian', name: RESTAURANT_THEMES['traditional-indian'] };
      if (/pizza|burger|fast_food|takeaway|bakery|pastry|dessert|chaat/i.test(combined)) return { key: 'bakery-fast-food', name: RESTAURANT_THEMES['bakery-fast-food'] };

      // Hash fallback
      const keys = Object.keys(RESTAURANT_THEMES);
      let hash = 5381;
      const str = String(placeId || name || 'restaurant');
      for (let i = 0; i < str.length; i++) hash = (((hash << 5) + hash) + str.charCodeAt(i)) & 0x7FFFFFFF;
      const key = keys[Math.abs(hash) % keys.length];
      return { key, name: RESTAURANT_THEMES[key] };
    }
  }

  // ──────────────────────────────────────────────
  // Application State
  // ──────────────────────────────────────────────
  let rawPlaces = [];
  let currentSearchQuery = '';
  let currentCategory = 'both';
  let currentSource = 'google';
  let filterMode = 'all';
  let sortColumn = 'name';
  let sortDirection = 'asc';

  // Modal state
  let modalPlace = null;          // Row data from table
  let modalEnriched = null;       // Enriched Google data
  let userItems = [];             // Legacy user items
  let assignedPhotos = [];        // Assigned photos [{ name, authorAttributions, role, roomIndex }]
  let roomsState = [];            // [{ name, tariff, size, capacity, bed, amenities, desc, source }]
  let menuState = [];             // [{ category, name, price, isVeg, desc, source }]
  let bulkParsedItems = [];       // Temp parsed items from bulk paste
  let verificationDefs = [];      // Array of { id, label } for checkboxes

  // ──────────────────────────────────────────────
  // Event Listeners
  // ──────────────────────────────────────────────
  searchForm.addEventListener('submit', handleSearchSubmit);
  searchNoWebsiteBtn.addEventListener('click', handleSearchNoWebsiteClick);
  activeOnlyCheckbox.addEventListener('change', () => { filterMode = 'all'; renderTableAndSummary(); });
  downloadExcelBtn.addEventListener('click', handleExcelDownload);
  previewAlertClose?.addEventListener('click', () => previewAlert.classList.add('hidden'));

  designSelect?.addEventListener('change', () => {
    if (!designAutoInfo) return;
    const isStay = !!(modalPlace?.type || '').toLowerCase().match(/stay|hotel|motel|hostel|lodge|inn|guest|resort/);
    if (designSelect.value === 'auto') {
      const pId = modalEnriched?.id || modalPlace?.placeId || modalPlace?.id;
      const autoTheme = getAutoThemeName(pId, modalEnriched?.name || modalPlace?.name, isStay, modalEnriched?.types);
      designAutoInfo.textContent = `Auto will apply: ${autoTheme.name}`;
    } else {
      designAutoInfo.textContent = `Manual override: ${THEME_NAMES[designSelect.value] || designSelect.value}`;
    }
  });

  // Fallback to TomTom
  fallbackBtn?.addEventListener('click', () => {
    sourceSelect.value = 'tomtom';
    currentSource = 'tomtom';
    fallbackBanner.classList.add('hidden');
    executeSearch();
  });

  // Sort headers
  document.querySelectorAll('th.sortable').forEach(th => {
    th.addEventListener('click', () => {
      const colKey = th.getAttribute('data-sort');
      if (sortColumn === colKey) {
        sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
      } else {
        sortColumn = colKey;
        sortDirection = 'asc';
      }
      updateSortHeaderIcons();
      renderTableAndSummary();
    });
  });

  // Table delegation
  placesTbody.addEventListener('click', handleTbodyClick);

  // Modal close
  modalClose?.addEventListener('click', closeModal);
  modalCancelBtn?.addEventListener('click', closeModal);
  enrichModal?.addEventListener('click', (e) => { if (e.target === enrichModal) closeModal(); });

  // Enrich form submit
  enrichForm?.addEventListener('submit', handleGenerateSubmit);

  // WhatsApp validation
  whatsappInput?.addEventListener('input', validateWhatsApp);

  // Add item button
  addItemBtn?.addEventListener('click', () => {
    userItems.push({ name: '', price: '', source: '' });
    renderUserItems();
  });

  // Verification checkboxes
  verificationChecks?.addEventListener('change', updateGenerateButtonState);

  // ──────────────────────────────────────────────
  // Search Handlers
  // ──────────────────────────────────────────────
  async function handleSearchSubmit(e) {
    if (e) e.preventDefault();
    filterMode = 'all';
    currentSource = sourceSelect.value;
    await executeSearch();
  }

  async function handleSearchNoWebsiteClick() {
    const query = locationInput.value.trim();
    const category = categorySelect.value;
    if (!query) { locationInput.focus(); return; }

    filterMode = 'no-website';
    activeOnlyCheckbox.checked = false;
    currentSource = sourceSelect.value;

    if (rawPlaces.length > 0 &&
        query.toLowerCase() === currentSearchQuery.toLowerCase() &&
        category === currentCategory &&
        sourceSelect.value === currentSource) {
      renderTableAndSummary();
      return;
    }
    await executeSearch();
  }

  async function executeSearch() {
    const query = locationInput.value.trim();
    const category = categorySelect.value;
    const source = sourceSelect.value;
    if (!query) return;

    currentSearchQuery = query;
    currentCategory = category;
    currentSource = source;

    showState('loading');
    setButtonsDisabled(true);
    fallbackBanner.classList.add('hidden');

    try {
      const response = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ location: query, category, source })
      });

      const data = await response.json();

      if (!response.ok) {
        // Google quota/key errors → offer TomTom fallback
        if (data.suggestFallback && source === 'google') {
          errorTitle.textContent = 'Google Places Error';
          errorMessage.textContent = data.error || 'Google Places search failed.';
          fallbackMsg.textContent = 'Would you like to switch to TomTom and retry?';
          fallbackBanner.classList.remove('hidden');
          showState('error');
        } else {
          throw new Error(data.error || 'Failed to fetch search results.');
        }
        return;
      }

      rawPlaces = data.results || [];

      cacheBadge.classList.toggle('hidden', !data.cached);
      sourceBadge.textContent = data.source === 'google' ? 'Google Places' : 'TomTom';
      sourceBadge.className = `badge ${data.source === 'google' ? 'badge-google' : 'badge-tomtom'}`;
      sourceBadge.classList.remove('hidden');

      if (rawPlaces.length === 0) {
        showState('empty');
      } else {
        showState('results');
        renderTableAndSummary();
      }

    } catch (err) {
      console.error('[Client Search Error]', err);
      errorTitle.textContent = 'Unable to complete search';
      errorMessage.textContent = err.message || 'An error occurred while fetching location data.';
      showState('error');
    } finally {
      setButtonsDisabled(false);
    }
  }

  function setButtonsDisabled(disabled) {
    searchBtn.disabled = disabled;
    searchNoWebsiteBtn.disabled = disabled;
  }

  // ──────────────────────────────────────────────
  // UI State Manager
  // ──────────────────────────────────────────────
  function showState(state) {
    [loadingState, errorState, initialState, emptyState, resultsWrapper].forEach(el => el.classList.add('hidden'));
    if (state === 'loading') loadingState.classList.remove('hidden');
    else if (state === 'error') errorState.classList.remove('hidden');
    else if (state === 'initial') initialState.classList.remove('hidden');
    else if (state === 'empty') emptyState.classList.remove('hidden');
    else if (state === 'results') resultsWrapper.classList.remove('hidden');
  }

  // ──────────────────────────────────────────────
  // Filter & Sort
  // ──────────────────────────────────────────────
  function getFilteredAndSortedPlaces() {
    let filtered = [...rawPlaces];

    if (filterMode === 'no-website') {
      filtered = filtered.filter(p =>
        p.websiteStatus === 'Not listed' ||
        p.websiteStatus === 'Inactive' ||
        p.websiteStatus === 'No own website'
      );
    } else if (activeOnlyCheckbox.checked) {
      filtered = filtered.filter(p =>
        p.websiteStatus === 'Active' || p.websiteStatus === 'Active (restricted)'
      );
    }

    filtered.sort((a, b) => {
      let valA = (a[sortColumn] || '').toString().toLowerCase();
      let valB = (b[sortColumn] || '').toString().toLowerCase();
      if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
      if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    return filtered;
  }

  // ──────────────────────────────────────────────
  // Table Render
  // ──────────────────────────────────────────────
  function renderTableAndSummary() {
    const displayedPlaces = getFilteredAndSortedPlaces();
    const totalCount = displayedPlaces.length;
    const phoneCount = displayedPlaces.filter(p => p.phone && p.phone !== 'Not available').length;
    const websiteCount = displayedPlaces.filter(p =>
      p.websiteStatus === 'Active' || p.websiteStatus === 'Active (restricted)'
    ).length;

    if (filterMode === 'no-website') {
      summaryLine.textContent = `${totalCount} of ${rawPlaces.length} places have no active website`;
    } else if (activeOnlyCheckbox.checked) {
      summaryLine.textContent = `${totalCount} places with active websites found`;
    } else {
      summaryLine.textContent = `${totalCount} places found: ${phoneCount} with phone, ${websiteCount} with active website`;
    }

    downloadExcelBtn.disabled = totalCount === 0;
    placesTbody.innerHTML = '';

    if (totalCount === 0) {
      placesTbody.innerHTML = `<tr><td colspan="10" style="text-align:center;padding:2.5rem 1rem;color:var(--text-muted);">No places match the selected filter.</td></tr>`;
      return;
    }

    displayedPlaces.forEach(place => {
      const tr = document.createElement('tr');

      const typeBadgeClass = place.type === 'Stay' ? 'badge-stay' : 'badge-restaurant';
      const typeBadge = `<span class="badge ${typeBadgeClass}">${escapeHtml(place.type)}</span>`;

      // Website Status badge
      let statusBadgeClass = 'status-none';
      if (place.websiteStatus === 'Active') statusBadgeClass = 'status-active';
      else if (place.websiteStatus === 'Active (restricted)') statusBadgeClass = 'status-restricted';
      else if (place.websiteStatus === 'Inactive') statusBadgeClass = 'status-inactive';
      else if (place.websiteStatus === 'No own website') statusBadgeClass = 'status-social';
      const statusBadge = `<span class="badge ${statusBadgeClass}">${escapeHtml(place.websiteStatus)}</span>`;

      // Website cell — show platform name or link
      let websiteCellContent = '<span class="text-muted-cell">Not available</span>';
      if (place.websiteUri && !place.socialPlatform) {
        websiteCellContent = `<a href="${escapeHtml(place.websiteUri)}" target="_blank" rel="noopener noreferrer" class="table-link">${escapeHtml(place.website)}<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg></a>`;
      } else if (place.socialPlatform) {
        websiteCellContent = `<span class="badge badge-social">${escapeHtml(place.website)}</span>`;
      }

      // Map link
      let mapCellContent = '<span class="text-muted-cell">Not available</span>';
      if (place.mapLink && place.mapLink !== 'Not available') {
        mapCellContent = `<a href="${escapeHtml(place.mapLink)}" target="_blank" rel="noopener noreferrer" class="table-link">Google Maps<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg></a>`;
      }

      const phoneContent = place.phone && place.phone !== 'Not available'
        ? escapeHtml(place.phone)
        : '<span class="text-muted-cell">Not available</span>';

      const hoursContent = place.openingHours && place.openingHours !== 'Not available'
        ? `<span class="hours-cell" title="${escapeHtml(place.openingHours)}">${escapeHtml(place.openingHours.split('|')[0].trim())}${place.openingHours.includes('|') ? '…' : ''}</span>`
        : '<span class="text-muted-cell">Not available</span>';

      const ratingContent = place.rating && place.rating !== 'Not available'
        ? `<span class="rating-chip">★ ${escapeHtml(place.rating)}</span>`
        : '<span class="text-muted-cell">—</span>';

      // Action cell
      const hasActiveWebsite = place.websiteStatus === 'Active' || place.websiteStatus === 'Active (restricted)';
      let actionCellContent = '';
      if (hasActiveWebsite) {
        actionCellContent = `<span class="badge badge-has-website">Has website</span>`;
      } else {
        actionCellContent = `
          <div class="action-cell-container">
            <button type="button" class="btn-action-generate" data-place-id="${escapeHtml(String(place.id))}">
              <span>Generate Website</span>
            </button>
            <a href="#" target="_blank" rel="noopener noreferrer" class="preview-row-link hidden" data-preview-link="${escapeHtml(String(place.id))}">
              Open Preview ↗
            </a>
          </div>`;
      }

      tr.innerHTML = `
        <td><strong>${escapeHtml(place.name)}</strong></td>
        <td>${typeBadge}</td>
        <td>${escapeHtml(place.address)}</td>
        <td>${phoneContent}</td>
        <td>${ratingContent}</td>
        <td>${websiteCellContent}</td>
        <td>${statusBadge}</td>
        <td>${hoursContent}</td>
        <td>${mapCellContent}</td>
        <td>${actionCellContent}</td>
      `;

      placesTbody.appendChild(tr);
    });
  }

  // ──────────────────────────────────────────────
  // Generate Website → open modal
  // ──────────────────────────────────────────────
  async function handleTbodyClick(e) {
    const btn = e.target.closest('.btn-action-generate');
    if (!btn) return;

    const placeId = btn.getAttribute('data-place-id');
    const place = rawPlaces.find(p => String(p.id) === String(placeId));
    if (!place) return;

    openModal(place);
  }

  async function openModal(place) {
    modalPlace = place;
    modalEnriched = null;
    userItems = [];

    enrichModal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';

    // Show loading, hide form
    modalLoading.classList.remove('hidden');
    enrichForm.classList.add('hidden');
    modalError.classList.add('hidden');
    opsWarning.classList.add('hidden');
    hasWebsiteWarning.classList.add('hidden');

    // Attempt enrichment if Google source and placeId available
    if (place.source === 'google' && place.placeId) {
      try {
        const resp = await fetch('/api/enrich', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ placeId: place.placeId })
        });
        const data = await resp.json();
        if (!resp.ok) throw new Error(data.error || 'Enrich failed.');
        modalEnriched = data.details;
      } catch (err) {
        console.warn('[Enrich Warning]', err.message);
        // Non-fatal: fall through with row data
        modalEnriched = null;
      }
    }

    modalLoading.classList.add('hidden');
    populateModal();
    enrichForm.classList.remove('hidden');
  }

  function populateModal() {
    const place = modalPlace;
    const details = modalEnriched;

    // Business status check
    const bStatus = details?.businessStatus || place.businessStatus || 'OPERATIONAL';
    if (bStatus !== 'OPERATIONAL') {
      opsWarning.classList.remove('hidden');
    }

    // Existing website warning
    const hasOwnWebsite = place.websiteStatus === 'Active' || place.websiteStatus === 'Active (restricted)';
    if (hasOwnWebsite) {
      hasWebsiteWarning.classList.remove('hidden');
    }

    // Missing photos note
    if (details?.photosUnavailable || !details?.photos?.length) {
      noPhotosNote.classList.remove('hidden');
    } else {
      noPhotosNote.classList.add('hidden');
    }

    // Build review fields
    const reviewData = [
      { label: 'Business Name', value: details?.name || place.name, fieldKey: 'name' },
      { label: 'Address', value: details?.address || place.address, fieldKey: 'address' },
      { label: 'Phone', value: details?.phone || place.phone, fieldKey: 'phone' },
      { label: 'Rating', value: details?.rating ? `★ ${details.rating}` : place.rating, fieldKey: 'rating' },
      { label: 'Opening Hours', value: details?.openingHours || place.openingHours, fieldKey: 'hours' },
      { label: 'Price Level', value: details?.priceLevel || '—', fieldKey: 'price' },
      { label: 'Map Link', value: details?.mapLink || place.mapLink, fieldKey: 'map', isLink: true },
    ];

    reviewFields.innerHTML = reviewData.map(f => `
      <div class="review-field">
        <div class="review-field-label">${escapeHtml(f.label)}</div>
        <div class="review-field-value">${f.isLink
          ? `<a href="${escapeHtml(f.value || '#')}" target="_blank" rel="noopener noreferrer" class="table-link">View on Google Maps ↗</a>`
          : escapeHtml(f.value || 'Not available')}</div>
      </div>
    `).join('');

    // Section 1: Setup Photos Assignment
    assignedPhotos = [];
    if (details?.photos && Array.isArray(details.photos) && details.photos.length > 0) {
      photoAssignmentSection.classList.remove('hidden');
      assignedPhotos = details.photos.slice(0, 12).map((p, idx) => ({
        name: p.name,
        widthPx: p.widthPx,
        heightPx: p.heightPx,
        authorAttributions: p.authorAttributions || [],
        role: idx === 0 ? 'hero' : 'gallery',
        roomIndex: 0
      }));
      renderPhotoAssignment();
    } else {
      photoAssignmentSection.classList.add('hidden');
    }

    // Section 1: Setup Stays vs Restaurant Editors
    const isStay = !!(place.type || '').toLowerCase().match(/stay|hotel|motel|hostel|lodge|inn|guest|resort|pg/);
    roomsState = [];
    menuState = [];
    bulkParsedItems = [];
    if (bulkPasteBox) bulkPasteBox.classList.add('hidden');
    if (bulkPreviewWrapper) bulkPreviewWrapper.classList.add('hidden');

    const fieldOrderLinkWrap = document.getElementById('field-order-link-wrap');
    const fieldReserveLinkWrap = document.getElementById('field-reserve-link-wrap');
    const fieldBookingLinkWrap = document.getElementById('field-booking-link-wrap');

    if (isStay) {
      roomsEditorSection.classList.remove('hidden');
      menuEditorSection.classList.add('hidden');
      if (fieldOrderLinkWrap) fieldOrderLinkWrap.classList.add('hidden');
      if (fieldReserveLinkWrap) fieldReserveLinkWrap.classList.add('hidden');
      if (fieldBookingLinkWrap) fieldBookingLinkWrap.classList.remove('hidden');
      renderRoomsEditor();
    } else {
      roomsEditorSection.classList.add('hidden');
      menuEditorSection.classList.remove('hidden');
      if (fieldOrderLinkWrap) fieldOrderLinkWrap.classList.remove('hidden');
      if (fieldReserveLinkWrap) fieldReserveLinkWrap.classList.remove('hidden');
      if (fieldBookingLinkWrap) fieldBookingLinkWrap.classList.add('hidden');
      renderMenuEditor();
    }

    // Reset optional fields
    if (optOrderingLink) optOrderingLink.value = '';
    if (optReservationLink) optReservationLink.value = '';
    if (optBookingLink) optBookingLink.value = '';
    if (optInstagram) optInstagram.value = '';
    if (optCheckinOut) optCheckinOut.value = '';
    if (optHouseRules) optHouseRules.value = '';
    if (tokenSizeWarning) tokenSizeWarning.classList.add('hidden');

    // Populate Design dropdown based on Stay vs Restaurant
    if (designSelect) {
      const themesObj = isStay ? STAY_THEMES : RESTAURANT_THEMES;
      const themeKeys = Object.keys(themesObj);
      designSelect.innerHTML = `<option value="auto">Auto (Deterministic from Place ID &amp; Type)</option>` +
        themeKeys.map(k => `<option value="${escapeHtml(k)}">${escapeHtml(themesObj[k])}</option>`).join('');
      designSelect.value = 'auto';

      const pId = details?.id || place.placeId || place.id;
      const autoTheme = getAutoThemeName(pId, details?.name || place.name, isStay, details?.types);
      if (designAutoInfo) {
        designAutoInfo.textContent = `Auto will apply: ${autoTheme.name}`;
      }
    }

    // Reset WhatsApp & buttons
    modalGenerateBtn.disabled = true;
    whatsappInput.value = '';
    whatsappValidation.textContent = '';

    // Rebuild verification checkboxes
    updateVerificationCheckboxes();
  }

  // ──────────────────────────────────────────────
  // Section 1: Photo Assignment Rendering
  // ──────────────────────────────────────────────
  function renderPhotoAssignment() {
    if (!photosAssignmentGrid) return;
    const isStay = !!(modalPlace?.type || '').toLowerCase().match(/stay|hotel|motel|hostel|lodge|inn|guest|resort|pg/);

    photosAssignmentGrid.innerHTML = assignedPhotos.map((p, i) => {
      const isHero = p.role === 'hero';
      const author = p.authorAttributions && p.authorAttributions[0] ? p.authorAttributions[0].displayName : 'Google Maps';
      const roleOptions = [
        { value: 'gallery', label: 'Gallery' },
        { value: 'hero', label: '★ Hero Banner' },
        isStay ? { value: 'room', label: 'Room Photo' } : { value: 'food', label: 'Menu / Food' }
      ];

      return `
        <div class="photo-assign-card ${isHero ? 'is-hero' : ''}" data-index="${i}">
          <span class="photo-role-badge">${isHero ? 'HERO' : (p.role.toUpperCase())}</span>
          <img class="photo-assign-thumb"
            src="/api/photo?name=${encodeURIComponent(p.name)}&maxWidth=200"
            alt="Photo ${i + 1} by ${escapeHtml(author)}"
            loading="lazy">
          <select class="photo-role-select" data-index="${i}" aria-label="Photo ${i + 1} role">
            ${roleOptions.map(opt => `<option value="${opt.value}" ${p.role === opt.value ? 'selected' : ''}>${opt.label}</option>`).join('')}
          </select>
          ${(isStay && p.role === 'room') ? `
            <select class="photo-room-select" data-index="${i}" aria-label="Assign to room">
              ${roomsState.length === 0 ? `<option value="0">Room 1</option>` : roomsState.map((r, rIdx) => `<option value="${rIdx}" ${p.roomIndex === rIdx ? 'selected' : ''}>${escapeHtml(r.name || `Room ${rIdx + 1}`)}</option>`).join('')}
            </select>
          ` : ''}
        </div>
      `;
    }).join('');

    photosAssignmentGrid.querySelectorAll('.photo-role-select').forEach(sel => {
      sel.addEventListener('change', (e) => {
        const idx = parseInt(e.target.dataset.index, 10);
        const newRole = e.target.value;
        if (newRole === 'hero') {
          // Exactly one hero allowed; unmark any other photo
          assignedPhotos.forEach((item, i) => {
            if (i !== idx && item.role === 'hero') item.role = 'gallery';
          });
        }
        assignedPhotos[idx].role = newRole;
        renderPhotoAssignment();
        updateVerificationCheckboxes();
      });
    });

    photosAssignmentGrid.querySelectorAll('.photo-room-select').forEach(sel => {
      sel.addEventListener('change', (e) => {
        const idx = parseInt(e.target.dataset.index, 10);
        assignedPhotos[idx].roomIndex = parseInt(e.target.value, 10) || 0;
      });
    });
  }

  // ──────────────────────────────────────────────
  // Section 1: Rooms Editor Rendering (Stays)
  // ──────────────────────────────────────────────
  function renderRoomsEditor() {
    if (!roomsList) return;
    roomsList.innerHTML = roomsState.map((r, i) => `
      <div class="room-card" data-index="${i}">
        <div class="card-top-row">
          <span class="card-num-badge">Room ${i + 1}</span>
          <button type="button" class="btn-remove-item btn-remove-room" data-index="${i}" title="Remove Room">×</button>
        </div>
        <div class="form-grid-2">
          <input type="text" class="modal-input room-field" data-field="name" data-index="${i}" placeholder="Room Name (e.g. Deluxe Balcony Suite)" value="${escapeHtml(r.name || '')}">
          <input type="text" class="modal-input room-field" data-field="tariff" data-index="${i}" placeholder="Tariff / Rate (e.g. ₹4,500/night)" value="${escapeHtml(r.tariff || '')}">
        </div>
        <div class="form-grid-3">
          <input type="text" class="modal-input room-field" data-field="size" data-index="${i}" placeholder="Size (e.g. 350 sq ft)" value="${escapeHtml(r.size || '')}">
          <input type="text" class="modal-input room-field" data-field="capacity" data-index="${i}" placeholder="Capacity (e.g. 2 Adults, 1 Child)" value="${escapeHtml(r.capacity || '')}">
          <input type="text" class="modal-input room-field" data-field="bed" data-index="${i}" placeholder="Bed (e.g. 1 King Bed)" value="${escapeHtml(r.bed || '')}">
        </div>
        <div class="form-grid-2">
          <input type="text" class="modal-input room-field" data-field="amenities" data-index="${i}" placeholder="Amenities (e.g. AC, Balcony, WiFi, Mini-fridge)" value="${escapeHtml(r.amenities || '')}">
          <select class="modal-select room-field" data-field="source" data-index="${i}">
            <option value="owner confirmed" ${r.source === 'owner confirmed' ? 'selected' : ''}>Source: Owner confirmed</option>
            <option value="pin photo" ${r.source === 'pin photo' ? 'selected' : ''}>Source: Pin photo</option>
          </select>
        </div>
        <textarea class="modal-input room-field" data-field="desc" data-index="${i}" rows="2" placeholder="Short description of this room type...">${escapeHtml(r.desc || '')}</textarea>
      </div>
    `).join('');

    // Bind inputs
    roomsList.querySelectorAll('.room-field').forEach(el => {
      const handler = (e) => {
        const idx = parseInt(e.target.dataset.index, 10);
        const field = e.target.dataset.field;
        if (!isNaN(idx) && field && roomsState[idx]) {
          roomsState[idx][field] = e.target.value;
          updateVerificationCheckboxes();
        }
      };
      el.addEventListener('input', handler);
      el.addEventListener('change', handler);
    });

    roomsList.querySelectorAll('.btn-remove-room').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.index, 10);
        roomsState.splice(idx, 1);
        renderRoomsEditor();
        updateVerificationCheckboxes();
      });
    });
  }

  // ──────────────────────────────────────────────
  // Section 1: Menu Editor & Bulk Paste (Restaurants)
  // ──────────────────────────────────────────────
  function renderMenuEditor() {
    if (!menuItemsList) return;
    menuItemsList.innerHTML = menuState.map((m, i) => `
      <div class="menu-card" data-index="${i}">
        <div class="card-top-row">
          <span class="card-num-badge">Item ${i + 1}</span>
          <button type="button" class="btn-remove-item btn-remove-menu" data-index="${i}" title="Remove Item">×</button>
        </div>
        <div class="form-grid-3">
          <input type="text" class="modal-input menu-field" data-field="category" data-index="${i}" placeholder="Category (e.g. Starters)" value="${escapeHtml(m.category || '')}">
          <input type="text" class="modal-input menu-field" data-field="name" data-index="${i}" placeholder="Item Name (e.g. Paneer Tikka)" value="${escapeHtml(m.name || '')}">
          <input type="text" class="modal-input menu-field" data-field="price" data-index="${i}" placeholder="Price (e.g. ₹260)" value="${escapeHtml(m.price || '')}">
        </div>
        <div class="form-grid-3">
          <select class="modal-select menu-field" data-field="isVeg" data-index="${i}">
            <option value="veg" ${m.isVeg === true || m.isVeg === 'veg' ? 'selected' : ''}>🟢 Veg</option>
            <option value="non-veg" ${m.isVeg === false || m.isVeg === 'non-veg' ? 'selected' : ''}>🔴 Non-Veg</option>
            <option value="egg" ${m.isVeg === 'egg' ? 'selected' : ''}>🟡 Contains Egg</option>
          </select>
          <input type="text" class="modal-input menu-field" data-field="desc" data-index="${i}" placeholder="Description (optional)" value="${escapeHtml(m.desc || '')}">
          <select class="modal-select menu-field" data-field="source" data-index="${i}">
            <option value="owner confirmed" ${m.source === 'owner confirmed' ? 'selected' : ''}>Source: Owner confirmed</option>
            <option value="pin photo" ${m.source === 'pin photo' ? 'selected' : ''}>Source: Pin photo</option>
          </select>
        </div>
      </div>
    `).join('');

    // Bind inputs
    menuItemsList.querySelectorAll('.menu-field').forEach(el => {
      const handler = (e) => {
        const idx = parseInt(e.target.dataset.index, 10);
        const field = e.target.dataset.field;
        if (!isNaN(idx) && field && menuState[idx]) {
          menuState[idx][field] = e.target.value;
          updateVerificationCheckboxes();
        }
      };
      el.addEventListener('input', handler);
      el.addEventListener('change', handler);
    });

    menuItemsList.querySelectorAll('.btn-remove-menu').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.index, 10);
        menuState.splice(idx, 1);
        renderMenuEditor();
        updateVerificationCheckboxes();
      });
    });
  }

  // Bulk Paste Handlers
  toggleBulkPasteBtn?.addEventListener('click', () => {
    if (bulkPasteBox) bulkPasteBox.classList.toggle('hidden');
  });

  parseBulkBtn?.addEventListener('click', () => {
    if (!bulkMenuText) return;
    const raw = bulkMenuText.value || '';
    const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);
    bulkParsedItems = [];

    lines.forEach(line => {
      const parts = line.split('|').map(p => p.trim());
      if (parts.length >= 2) {
        const category = parts[0] || 'General';
        const name = parts[1] || '';
        const price = parts[2] || '';
        const vegRaw = (parts[3] || '').toLowerCase();
        let isVeg = 'veg';
        if (vegRaw.includes('non')) isVeg = 'non-veg';
        else if (vegRaw.includes('egg')) isVeg = 'egg';
        else if (vegRaw.includes('veg')) isVeg = 'veg';

        const desc = parts[4] || '';
        if (name) {
          bulkParsedItems.push({ category, name, price, isVeg, desc, source: 'owner confirmed' });
        }
      }
    });

    if (bulkParseStatus) {
      bulkParseStatus.textContent = `Parsed ${bulkParsedItems.length} items.`;
    }

    if (bulkParsedItems.length > 0 && bulkPreviewWrapper && bulkPreviewTableContainer) {
      bulkPreviewWrapper.classList.remove('hidden');
      bulkPreviewTableContainer.innerHTML = `
        <table class="bulk-table">
          <thead>
            <tr>
              <th>Category</th>
              <th>Item</th>
              <th>Price</th>
              <th>Type</th>
              <th>Description</th>
            </tr>
          </thead>
          <tbody>
            ${bulkParsedItems.map((item, idx) => `
              <tr>
                <td><input type="text" class="modal-input bulk-prev-field" data-field="category" data-index="${idx}" value="${escapeHtml(item.category)}"></td>
                <td><input type="text" class="modal-input bulk-prev-field" data-field="name" data-index="${idx}" value="${escapeHtml(item.name)}"></td>
                <td><input type="text" class="modal-input bulk-prev-field" data-field="price" data-index="${idx}" value="${escapeHtml(item.price)}"></td>
                <td>
                  <select class="modal-select bulk-prev-field" data-field="isVeg" data-index="${idx}">
                    <option value="veg" ${item.isVeg === 'veg' ? 'selected' : ''}>Veg</option>
                    <option value="non-veg" ${item.isVeg === 'non-veg' ? 'selected' : ''}>Non-Veg</option>
                    <option value="egg" ${item.isVeg === 'egg' ? 'selected' : ''}>Egg</option>
                  </select>
                </td>
                <td><input type="text" class="modal-input bulk-prev-field" data-field="desc" data-index="${idx}" value="${escapeHtml(item.desc)}"></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;

      bulkPreviewTableContainer.querySelectorAll('.bulk-prev-field').forEach(el => {
        el.addEventListener('input', (e) => {
          const idx = parseInt(e.target.dataset.index, 10);
          const field = e.target.dataset.field;
          if (!isNaN(idx) && bulkParsedItems[idx]) {
            bulkParsedItems[idx][field] = e.target.value;
          }
        });
      });
    }
  });

  acceptBulkBtn?.addEventListener('click', () => {
    if (bulkParsedItems.length > 0) {
      menuState = menuState.concat(bulkParsedItems);
      bulkParsedItems = [];
      if (bulkPreviewWrapper) bulkPreviewWrapper.classList.add('hidden');
      if (bulkPasteBox) bulkPasteBox.classList.add('hidden');
      if (bulkMenuText) bulkMenuText.value = '';
      if (bulkParseStatus) bulkParseStatus.textContent = '';
      renderMenuEditor();
      updateVerificationCheckboxes();
    }
  });

  addRoomBtn?.addEventListener('click', () => {
    roomsState.push({
      name: '',
      tariff: '',
      size: '',
      capacity: '',
      bed: '',
      amenities: '',
      desc: '',
      source: 'owner confirmed'
    });
    renderRoomsEditor();
    updateVerificationCheckboxes();
  });

  addMenuItemBtn?.addEventListener('click', () => {
    menuState.push({
      category: 'General',
      name: '',
      price: '',
      isVeg: 'veg',
      desc: '',
      source: 'owner confirmed'
    });
    renderMenuEditor();
    updateVerificationCheckboxes();
  });

  // ──────────────────────────────────────────────
  // Verification Checkboxes Generator
  // ──────────────────────────────────────────────
  function updateVerificationCheckboxes() {
    const place = modalPlace;
    const details = modalEnriched;
    const mapLink = details?.mapLink || place?.mapLink || '#';

    verificationDefs = [
      { id: 'v-pin', label: `I confirmed this is the correct business on <a href="${escapeHtml(mapLink)}" target="_blank" rel="noopener noreferrer">Google Maps ↗</a>` },
      { id: 'v-name', label: 'Verified: Business Name' },
      { id: 'v-address', label: 'Verified: Address' },
      { id: 'v-phone', label: 'Verified: Phone number' },
    ];

    if (details?.openingHours || place?.openingHours !== 'Not available') {
      verificationDefs.push({ id: 'v-hours', label: 'Verified: Opening Hours' });
    }

    if (assignedPhotos.length > 0) {
      verificationDefs.push({ id: 'v-photos', label: 'Verified: Photo assignments (Source: pin photo)' });
    }

    const isStay = !!(place?.type || '').toLowerCase().match(/stay|hotel|motel|hostel|lodge|inn|guest|resort|pg/);
    if (isStay && roomsState.length > 0) {
      const anyOwner = roomsState.some(r => r.source === 'owner confirmed');
      verificationDefs.push({ id: 'v-rooms', label: `Verified: Room types & rates (Source: ${anyOwner ? 'owner confirmed' : 'pin photo'})` });
    }

    if (!isStay && menuState.length > 0) {
      const anyOwner = menuState.some(m => m.source === 'owner confirmed');
      verificationDefs.push({ id: 'v-menu', label: `Verified: Menu items & prices (Source: ${anyOwner ? 'owner confirmed' : 'pin photo'})` });
    }

    const hasOptional = !!(optOrderingLink?.value?.trim() || optReservationLink?.value?.trim() || optBookingLink?.value?.trim() || optInstagram?.value?.trim() || optCheckinOut?.value?.trim() || optHouseRules?.value?.trim());
    if (hasOptional) {
      verificationDefs.push({ id: 'v-optional', label: 'Verified: Additional links & policies (Source: owner confirmed)' });
    }

    verificationChecks.innerHTML = verificationDefs.map(v => `
      <label class="verification-item" for="${escapeHtml(v.id)}">
        <input type="checkbox" id="${escapeHtml(v.id)}" class="verification-checkbox">
        <span>${v.label}</span>
      </label>
    `).join('');

    verificationChecks.querySelectorAll('.verification-checkbox').forEach(cb => {
      cb.addEventListener('change', updateGenerateButtonState);
    });

    updateGenerateButtonState();
  }

  // Bind inputs in optional fields to update verification
  [optOrderingLink, optReservationLink, optBookingLink, optInstagram, optCheckinOut, optHouseRules].forEach(input => {
    input?.addEventListener('input', updateVerificationCheckboxes);
  });

  function validateWhatsApp() {
    const val = whatsappInput.value.trim().replace(/\D/g, '');
    if (!val) { whatsappValidation.textContent = ''; return; }
    if (/^[6-9]\d{9}$/.test(val)) {
      whatsappValidation.textContent = `✓ Valid Indian mobile: +91 ${val}`;
      whatsappValidation.className = 'validation-msg valid';
    } else {
      whatsappValidation.textContent = '✗ Must be 10 digits starting with 6, 7, 8 or 9';
      whatsappValidation.className = 'validation-msg invalid';
    }
  }

  function updateGenerateButtonState() {
    if (!enrichForm) return;
    const bStatus = modalEnriched?.businessStatus || modalPlace?.businessStatus || 'OPERATIONAL';
    if (bStatus !== 'OPERATIONAL') { modalGenerateBtn.disabled = true; return; }

    const allChecked = verificationDefs.every(v => {
      const el = document.getElementById(v.id);
      return el && el.checked;
    });
    modalGenerateBtn.disabled = !allChecked;
  }

  function closeModal() {
    enrichModal.classList.add('hidden');
    document.body.style.overflow = '';
    modalPlace = null;
    modalEnriched = null;
    userItems = [];
    assignedPhotos = [];
    roomsState = [];
    menuState = [];
    bulkParsedItems = [];
  }

  // ──────────────────────────────────────────────
  // Generate Site Submit
  // ──────────────────────────────────────────────
  async function handleGenerateSubmit(e) {
    e.preventDefault();
    if (modalGenerateBtn.disabled) return;

    const place = modalPlace;
    const details = modalEnriched;
    const waRaw = whatsappInput.value.trim().replace(/\D/g, '');
    const whatsappNumber = /^[6-9]\d{9}$/.test(waRaw) ? waRaw : null;

    modalGenerateBtn.disabled = true;
    modalGenerateBtn.querySelector('span').textContent = 'Generating…';

    try {
      const payload = {
        name: details?.name || place.name,
        type: place.type,
        address: details?.address || place.address,
        phone: details?.phone || place.phone,
        whatsappNumber,
        openingHours: details?.openingHours || place.openingHours,
        coordinates: details?.location || place.coordinates,
        mapLink: details?.mapLink || place.mapLink,
        enriched: details || null,
        placeId: details?.id || place.placeId || place.id || null,
        design: designSelect ? designSelect.value : 'auto',
        assignedPhotos: assignedPhotos,
        roomTypes: roomsState.filter(r => r.name),
        menuItems: menuState.filter(m => m.name),
        optionalFields: {
          orderingLink: optOrderingLink?.value?.trim() || null,
          reservationLink: optReservationLink?.value?.trim() || null,
          bookingLink: optBookingLink?.value?.trim() || null,
          instagram: optInstagram?.value?.trim() || null,
          checkInOut: optCheckinOut?.value?.trim() || null,
          houseRules: optHouseRules?.value?.trim() || null
        }
      };

      const response = await fetch('/api/generate-site', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await response.json();
      if (!response.ok) {
        if (response.status === 400 && data.error && data.error.includes('too large')) {
          if (tokenSizeWarning) {
            tokenSizeWarning.textContent = `⚠️ ${data.error}`;
            tokenSizeWarning.classList.remove('hidden');
          }
        }
        throw new Error(data.error || 'Generation failed.');
      }

      closeModal();

      // Update row preview link
      const rowLink = placesTbody.querySelector(`[data-preview-link="${CSS.escape(String(place.id))}"]`);
      if (rowLink) {
        rowLink.href = data.previewUrl;
        rowLink.classList.remove('hidden');
      }
      const genBtn = placesTbody.querySelector(`[data-place-id="${CSS.escape(String(place.id))}"]`);
      if (genBtn) genBtn.innerHTML = `<span>Regenerate</span>`;

      const newWindow = window.open(data.previewUrl, '_blank');
      const popupBlocked = !newWindow || newWindow.closed || typeof newWindow.closed === 'undefined';
      showPreviewAlert(place.name, data.previewUrl, popupBlocked);

    } catch (err) {
      console.error('[Generate Error]', err);
      modalErrorMsg.textContent = err.message || 'Failed to generate website preview.';
      modalError.classList.remove('hidden');
      modalGenerateBtn.disabled = false;
      modalGenerateBtn.querySelector('span').textContent = 'Generate Website';
    }
  }

  // ──────────────────────────────────────────────
  // Preview Alert
  // ──────────────────────────────────────────────
  function showPreviewAlert(placeName, previewUrl, popupBlocked) {
    if (!previewAlert) return;
    previewAlertMessage.textContent = popupBlocked
      ? `Popup was blocked. Preview ready for "${placeName}":`
      : `Website preview generated for "${placeName}"!`;
    previewAlertLink.href = previewUrl;
    previewAlert.classList.remove('hidden');
  }

  // ──────────────────────────────────────────────
  // Sort icons
  // ──────────────────────────────────────────────
  function updateSortHeaderIcons() {
    document.querySelectorAll('th.sortable').forEach(th => {
      const colKey = th.getAttribute('data-sort');
      const iconSpan = th.querySelector('.sort-icon');
      if (colKey === sortColumn) {
        iconSpan.textContent = sortDirection === 'asc' ? '▲' : '▼';
        th.style.color = 'var(--text-primary)';
      } else {
        iconSpan.textContent = '↕';
        th.style.color = '';
      }
    });
  }

  // ──────────────────────────────────────────────
  // Excel Download
  // ──────────────────────────────────────────────
  async function handleExcelDownload() {
    const displayedRows = getFilteredAndSortedPlaces();
    if (displayedRows.length === 0) return;

    downloadExcelBtn.disabled = true;
    const origText = downloadExcelBtn.querySelector('span').textContent;
    downloadExcelBtn.querySelector('span').textContent = 'Exporting…';

    try {
      const response = await fetch('/api/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: displayedRows, location: currentSearchQuery || 'places' })
      });

      if (!response.ok) throw new Error('Failed to generate Excel file.');

      const contentDisposition = response.headers.get('Content-Disposition');
      let filename = `places_${currentSearchQuery || 'results'}.xlsx`;
      if (contentDisposition) {
        const match = contentDisposition.match(/filename="?([^"]+)"?/);
        if (match?.[1]) filename = match[1];
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);

    } catch (err) {
      console.error('[Export Error]', err);
      alert('Error downloading Excel file: ' + err.message);
    } finally {
      downloadExcelBtn.disabled = false;
      downloadExcelBtn.querySelector('span').textContent = origText;
    }
  }

  // ──────────────────────────────────────────────
  // HTML Escape Utility
  // ──────────────────────────────────────────────
  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
});
