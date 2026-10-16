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

  const THEME_NAMES = {
    'fullscreen-overlay': 'Full-screen Hero with Overlay',
    'split-hero': 'Split Hero',
    'magazine-grid': 'Magazine Grid',
    'minimal-luxury': 'Minimal Luxury',
    'resort-nature': 'Resort & Nature',
    'modern-dark': 'Modern Dark'
  };
  const THEME_KEYS = Object.keys(THEME_NAMES);

  function getAutoThemeName(placeId, name) {
    let hash = 5381;
    const str = String(placeId || name || 'default');
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) + hash) + str.charCodeAt(i);
      hash = hash & 0x7FFFFFFF;
    }
    const idx = Math.abs(hash) % THEME_KEYS.length;
    return { key: THEME_KEYS[idx], name: THEME_NAMES[THEME_KEYS[idx]] };
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
  let modalPlace = null;       // Row data from table
  let modalEnriched = null;    // Enriched Google data
  let userItems = [];          // User-typed menu items / room types
  let verificationDefs = [];   // Array of { id, label } for checkboxes

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
    if (designSelect.value === 'auto') {
      const pId = modalEnriched?.id || modalPlace?.placeId || modalPlace?.id;
      const autoTheme = getAutoThemeName(pId, modalEnriched?.name || modalPlace?.name);
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

    // User items
    const isStay = (place.type || '').toLowerCase().match(/stay|hotel/);
    userItemsLabel.textContent = isStay ? 'Room Types & Tariffs (optional)' : 'Menu Items & Prices (optional)';
    addItemBtn.textContent = isStay ? '+ Add room type' : '+ Add menu item';
    userItems = [];
    renderUserItems();

    // Build verification checkboxes
    const mapLink = details?.mapLink || place.mapLink || '#';
    verificationDefs = [
      { id: 'v-pin', label: `I confirmed this is the correct business on <a href="${escapeHtml(mapLink)}" target="_blank" rel="noopener noreferrer">Google Maps ↗</a>` },
      { id: 'v-name', label: 'Verified: Business Name' },
      { id: 'v-address', label: 'Verified: Address' },
      { id: 'v-phone', label: 'Verified: Phone number' },
    ];
    if (details?.openingHours || place.openingHours !== 'Not available') {
      verificationDefs.push({ id: 'v-hours', label: 'Verified: Opening Hours' });
    }

    verificationChecks.innerHTML = verificationDefs.map(v => `
      <label class="verification-item" for="${escapeHtml(v.id)}">
        <input type="checkbox" id="${escapeHtml(v.id)}" class="verification-checkbox">
        <span>${v.label}</span>
      </label>
    `).join('');

    // Reset button state & design dropdown
    modalGenerateBtn.disabled = true;
    whatsappInput.value = '';
    whatsappValidation.textContent = '';
    if (designSelect) {
      designSelect.value = 'auto';
      const pId = details?.id || place.placeId || place.id;
      const autoTheme = getAutoThemeName(pId, details?.name || place.name);
      if (designAutoInfo) {
        designAutoInfo.textContent = `Auto will apply: ${autoTheme.name}`;
      }
    }
  }

  function renderUserItems() {
    const isStay = (modalPlace?.type || '').toLowerCase().match(/stay|hotel/);
    userItemsList.innerHTML = userItems.map((item, i) => `
      <div class="user-item-row" data-index="${i}">
        <input type="text" class="modal-input item-name" placeholder="${isStay ? 'Room type' : 'Item name'}" value="${escapeHtml(item.name)}" data-field="name" data-index="${i}">
        <input type="text" class="modal-input item-price" placeholder="${isStay ? 'Tariff (e.g. ₹1200/night)' : 'Price (e.g. ₹250)'}" value="${escapeHtml(item.price)}" data-field="price" data-index="${i}">
        <select class="modal-select item-source" data-field="source" data-index="${i}">
          <option value="pin photo" ${item.source === 'pin photo' ? 'selected' : ''}>Pin photo</option>
          <option value="owner confirmed" ${item.source === 'owner confirmed' ? 'selected' : ''}>Owner confirmed</option>
        </select>
        <button type="button" class="btn-remove-item" data-index="${i}" title="Remove">×</button>
      </div>
    `).join('');

    // Bind item input events
    userItemsList.querySelectorAll('[data-index]').forEach(el => {
      el.addEventListener('input', (e) => {
        const idx = parseInt(e.target.dataset.index, 10);
        const field = e.target.dataset.field;
        if (field && !isNaN(idx)) userItems[idx][field] = e.target.value;
      });
      el.addEventListener('change', (e) => {
        const idx = parseInt(e.target.dataset.index, 10);
        const field = e.target.dataset.field;
        if (field && !isNaN(idx)) userItems[idx][field] = e.target.value;
      });
    });

    userItemsList.querySelectorAll('.btn-remove-item').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.index, 10);
        userItems.splice(idx, 1);
        renderUserItems();
      });
    });
  }

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
        menuItems: userItems.filter(i => i.name),
        roomTypes: userItems.filter(i => i.name)
      };

      const response = await fetch('/api/generate-site', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Generation failed.');

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
      modalErrorMsg.textContent = err.message;
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
