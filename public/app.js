document.addEventListener('DOMContentLoaded', () => {
  // DOM Elements
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
  const hideWarningsCheckbox = document.getElementById('hide-warnings-checkbox');
  const downloadExcelBtn = document.getElementById('download-excel-btn');
  const placesTbody = document.getElementById('places-tbody');
  const previewAlert = document.getElementById('preview-alert');
  const previewAlertMessage = document.getElementById('preview-alert-message');
  const previewAlertLink = document.getElementById('preview-alert-link');
  const previewAlertClose = document.getElementById('preview-alert-close');
  // Section 2: Did you mean & Location Banner
  const didYouMeanCard = document.getElementById('did-you-mean-card');
  const didYouMeanList = document.getElementById('did-you-mean-list');
  const locationBanner = document.getElementById('location-banner');
  const locBannerText = document.getElementById('loc-banner-text');
  // Section 3: Live Search Progress & Requests Used
  const searchProgressCard = document.getElementById('search-progress-card');
  const searchProgressFill = document.getElementById('search-progress-fill');
  const searchProgressText = document.getElementById('search-progress-text');
  const requestsUsedLine = document.getElementById('requests-used-line');
  // Section 4: Pagination Controls
  const paginationWrapper = document.getElementById('pagination-wrapper');
  const paginationSummary = document.getElementById('pagination-summary');
  const btnPrevPage = document.getElementById('btn-prev-page');
  const paginationPages = document.getElementById('pagination-pages');
  const btnNextPage = document.getElementById('btn-next-page');
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
  // Sec3 - Editable Details & Verified Checkboxes
  const editDisplayName = document.getElementById('edit-display-name');
  const origGoogleName = document.getElementById('orig-google-name');
  const editPhone = document.getElementById('edit-phone');
  const editPhoneValidation = document.getElementById('edit-phone-validation');
  const editHours = document.getElementById('edit-hours');
  const editDescription = document.getElementById('edit-description');
  const cleanNameBanner = document.getElementById('clean-name-banner');
  const cleanNameText = document.getElementById('clean-name-text');
  const btnApplyCleanedName = document.getElementById('btn-apply-cleaned-name');
  const vEditName = document.getElementById('v-edit-name');
  const vEditPhone = document.getElementById('v-edit-phone');
  const vEditWhatsapp = document.getElementById('v-edit-whatsapp');
  const vEditHours = document.getElementById('v-edit-hours');
  const vEditHoursWrap = document.getElementById('v-edit-hours-wrap');
  const vEditDesc = document.getElementById('v-edit-desc');
  // Sec3 - Photo Upload & Permission
  const btnAddPhoto = document.getElementById('btn-add-photo');
  const photoUploadInput = document.getElementById('photo-upload-input');
  const photoPermModal = document.getElementById('photo-perm-modal');
  const permModalClose = document.getElementById('perm-modal-close');
  const permFileInfo = document.getElementById('perm-file-info');
  const permCheckbox = document.getElementById('perm-checkbox');
  const permUploadStatus = document.getElementById('perm-upload-status');
  const permCancelBtn = document.getElementById('perm-cancel-btn');
  const permConfirmBtn = document.getElementById('perm-confirm-btn');
  const userItemsList = document.getElementById('user-items-list');
  const addItemBtn = document.getElementById('add-item-btn');
  const whatsappInput = document.getElementById('whatsapp-input');
  const whatsappValidation = document.getElementById('whatsapp-validation');
  const designSelect = document.getElementById('design-select');
  const designAutoInfo = document.getElementById('design-auto-info');
  const verificationChecks = document.getElementById('verification-checks');
  const modalGenerateBtn = document.getElementById('modal-generate-btn');
  const modalCancelBtn = document.getElementById('modal-cancel-btn');
  // Sec1 - Photo picker
  const photoAssignmentSection = document.getElementById('photo-assignment-section');
  const photosAssignmentGrid = document.getElementById('photos-assignment-grid');
  const photoPickerStatus = document.getElementById('photo-picker-status');
  const btnSelectAll = document.getElementById('btn-select-all');
  const btnClearSelection = document.getElementById('btn-clear-selection');
  const btnRemoveUnselected = document.getElementById('btn-remove-unselected');
  const btnShowRemoved = document.getElementById('btn-show-removed');
  // Rooms & Menu
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
  // Sec3 - Details drawer
  const detailsDrawer = document.getElementById('details-drawer');
  const detailsDrawerClose = document.getElementById('details-drawer-close');
  const detailsDrawerContent = document.getElementById('details-drawer-content');
  // Lightbox
  const photoLightbox = document.getElementById('photo-lightbox');
  const lightboxImg = document.getElementById('lightbox-img');
  const lightboxAuthor = document.getElementById('lightbox-author');
  const lightboxPrev = document.getElementById('lightbox-prev');
  const lightboxNext = document.getElementById('lightbox-next');
  const lightboxClose = document.getElementById('lightbox-close');
  const lightboxLoading = document.getElementById('lightbox-loading');

  // Theme definitions (keep in sync with preview_renderer.js)
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
  const THEME_NAMES = {
    ...STAY_THEMES, ...RESTAURANT_THEMES,
    'fullscreen-overlay': 'Beach / Resort (Full-screen Overlay)',
    'split-hero': 'Urban Sleek (Split Hero)',
    'magazine-grid': 'Heritage / Homestay (Magazine Grid)',
    'minimal-luxury': 'Luxury (Minimal Luxury)',
    'resort-nature': 'Eco-lodge / Nature',
    'modern-dark': 'Budget / PG / Hostel (Modern Dark)'
  };

  function getAutoThemeName(placeId, name, isStay, types) {
    const typeStr = Array.isArray(types) ? types.join(' ').toLowerCase() : String(types||'').toLowerCase();
    const nameStr = String(name||'').toLowerCase();
    const combined = nameStr + ' ' + typeStr;
    if (isStay) {
      if (/eco|resort|nature|camp|lodge|treehouse|plantation|farm/i.test(combined)) return {key:'eco-lodge',name:STAY_THEMES['eco-lodge']};
      if (/apartment|urban|city|studio|pod|tech|suites|business/i.test(combined)) return {key:'urban-sleek',name:STAY_THEMES['urban-sleek']};
      if (/heritage|homestay|palace|haveli|manor|estate|colonial|vintage/i.test(combined)) return {key:'heritage-homestay',name:STAY_THEMES['heritage-homestay']};
      if (/beach|coast|ocean|island|sea|bay|cove|haven/i.test(combined)) return {key:'beach-resort',name:STAY_THEMES['beach-resort']};
      if (/luxury|grand|royal|boutique|5_star|marquis|villas/i.test(combined)) return {key:'luxury',name:STAY_THEMES['luxury']};
      if (/hostel|budget|pg|dorm|inn|motel|backpacker|guest_house/i.test(combined)) return {key:'budget-hostel',name:STAY_THEMES['budget-hostel']};
      const keys=Object.keys(STAY_THEMES); let hash=5381; const str=String(placeId||name||'stay');
      for(let i=0;i<str.length;i++) hash=(((hash<<5)+hash)+str.charCodeAt(i))&0x7FFFFFFF;
      const key=keys[Math.abs(hash)%keys.length]; return {key,name:STAY_THEMES[key]};
    } else {
      if (/fine_dining|steak|wine|french|italian|gourmet|bistro/i.test(combined)) return {key:'fine-dining',name:RESTAURANT_THEMES['fine-dining']};
      if (/cafe|coffee|tea|bakery|espresso|roaster|breakfast|brunch/i.test(combined)) return {key:'casual-cafe',name:RESTAURANT_THEMES['casual-cafe']};
      if (/family|dhaba|buffet|thali|multi_cuisine|grand/i.test(combined)) return {key:'family-restaurant',name:RESTAURANT_THEMES['family-restaurant']};
      if (/bar|pub|brewery|lounge|club|cocktail|beer|taproom/i.test(combined)) return {key:'bar-pub',name:RESTAURANT_THEMES['bar-pub']};
      if (/indian|south_indian|north_indian|bhatura|tandoori|dosa|biryani/i.test(combined)) return {key:'traditional-indian',name:RESTAURANT_THEMES['traditional-indian']};
      if (/pizza|burger|fast_food|takeaway|bakery|pastry|dessert|chaat/i.test(combined)) return {key:'bakery-fast-food',name:RESTAURANT_THEMES['bakery-fast-food']};
      const keys=Object.keys(RESTAURANT_THEMES); let hash=5381; const str=String(placeId||name||'restaurant');
      for(let i=0;i<str.length;i++) hash=(((hash<<5)+hash)+str.charCodeAt(i))&0x7FFFFFFF;
      const key=keys[Math.abs(hash)%keys.length]; return {key,name:RESTAURANT_THEMES[key]};
    }
  }

  // ── App State ──
  let rawPlaces = [];
  let currentSearchQuery = '';
  let currentCategory = 'both';
  let currentSource = 'google';
  let filterMode = 'all';
  let sortColumn = 'name';
  let sortDirection = 'asc';
  let currentPage = 1;
  const PAGE_SIZE = 20;
  let currentResolvedArea = null;
  let modalPlace = null;
  let modalEnriched = null;
  let userItems = [];
  let roomsState = [];
  let menuState = [];
  let bulkParsedItems = [];
  let verificationDefs = [];
  // Sec1: photo picker state — each: {name,widthPx,heightPx,authorAttributions,role,roomIndex,kept,removed}
  let photoPickerState = [];
  let lightboxIndex = 0;

  // ── Event Listeners ──
  searchForm.addEventListener('submit', handleSearchSubmit);
  searchNoWebsiteBtn.addEventListener('click', handleSearchNoWebsiteClick);
  activeOnlyCheckbox.addEventListener('change', () => { filterMode='all'; currentPage = 1; renderTableAndSummary(); });
  hideWarningsCheckbox?.addEventListener('change', () => { currentPage = 1; renderTableAndSummary(); });
  downloadExcelBtn.addEventListener('click', handleExcelDownload);
  previewAlertClose?.addEventListener('click', () => previewAlert.classList.add('hidden'));

  btnPrevPage?.addEventListener('click', () => {
    if (currentPage > 1) {
      currentPage--;
      renderTableAndSummary();
      scrollTableToTop();
    }
  });
  btnNextPage?.addEventListener('click', () => {
    const all = getFilteredAndSortedPlaces();
    const totalPages = Math.ceil(all.length / PAGE_SIZE) || 1;
    if (currentPage < totalPages) {
      currentPage++;
      renderTableAndSummary();
      scrollTableToTop();
    }
  });

  designSelect?.addEventListener('change', () => {
    if (!designAutoInfo) return;
    const isStay = !!(modalPlace?.type||'').toLowerCase().match(/stay|hotel|motel|hostel|lodge|inn|guest|resort/);
    if (designSelect.value === 'auto') {
      const pId = modalEnriched?.id || modalPlace?.placeId || modalPlace?.id;
      const at = getAutoThemeName(pId, modalEnriched?.name||modalPlace?.name, isStay, modalEnriched?.types);
      designAutoInfo.textContent = 'Auto will apply: ' + at.name;
    } else {
      designAutoInfo.textContent = 'Manual override: ' + (THEME_NAMES[designSelect.value]||designSelect.value);
    }
  });

  fallbackBtn?.addEventListener('click', () => { sourceSelect.value='tomtom'; currentSource='tomtom'; fallbackBanner.classList.add('hidden'); executeSearch(); });

  document.querySelectorAll('th.sortable').forEach(th => {
    th.addEventListener('click', () => {
      const colKey = th.getAttribute('data-sort');
      if (sortColumn===colKey) { sortDirection = sortDirection==='asc'?'desc':'asc'; }
      else { sortColumn=colKey; sortDirection='asc'; }
      currentPage = 1;
      updateSortHeaderIcons(); renderTableAndSummary();
    });
  });

  placesTbody.addEventListener('click', handleTbodyClick);
  modalClose?.addEventListener('click', closeModal);
  modalCancelBtn?.addEventListener('click', closeModal);
  enrichModal?.addEventListener('click', e => { if(e.target===enrichModal) closeModal(); });
  enrichForm?.addEventListener('submit', handleGenerateSubmit);
  whatsappInput?.addEventListener('input', validateWhatsApp);
  addItemBtn?.addEventListener('click', () => { userItems.push({name:'',price:'',source:''}); renderUserItems(); });
  verificationChecks?.addEventListener('change', updateGenerateButtonState);

  // Sec3 Editable field events
  editDisplayName?.addEventListener('input', () => { if (vEditName) vEditName.checked = false; updateGenerateButtonState(); });
  editPhone?.addEventListener('input', () => { validateEditPhone(); if (vEditPhone) vEditPhone.checked = false; updateGenerateButtonState(); });
  whatsappInput?.addEventListener('input', () => { validateWhatsApp(); if (vEditWhatsapp) vEditWhatsapp.checked = false; updateGenerateButtonState(); });
  editHours?.addEventListener('input', () => { toggleHoursVerifyVisibility(); if (vEditHours) vEditHours.checked = false; updateGenerateButtonState(); });
  editDescription?.addEventListener('input', () => { if (vEditDesc) vEditDesc.checked = false; updateGenerateButtonState(); });
  [vEditName, vEditPhone, vEditWhatsapp, vEditHours, vEditDesc].forEach(cb => cb?.addEventListener('change', updateGenerateButtonState));

  // Sec3 Photo upload events
  btnAddPhoto?.addEventListener('click', () => { photoUploadInput?.click(); });
  photoUploadInput?.addEventListener('change', handlePhotoFileSelect);
  permModalClose?.addEventListener('click', closePermModal);
  permCancelBtn?.addEventListener('click', closePermModal);
  permCheckbox?.addEventListener('change', () => { if (permConfirmBtn) permConfirmBtn.disabled = !permCheckbox.checked; });
  permConfirmBtn?.addEventListener('click', handlePhotoUploadConfirm);

  // Photo picker toolbar
  btnSelectAll?.addEventListener('click', () => { photoPickerState.forEach(p => { if (!p.removed) p.kept = true; }); renderPhotoAssignment(); });
  btnClearSelection?.addEventListener('click', () => { photoPickerState.forEach(p => { p.kept = false; }); renderPhotoAssignment(); });
  btnRemoveUnselected?.addEventListener('click', () => {
    photoPickerState.forEach(p => { if (!p.kept && !p.removed) p.removed = true; });
    renderPhotoAssignment();
  });
  btnShowRemoved?.addEventListener('click', () => {
    const panel = document.getElementById('removed-photos-panel');
    if (panel) panel.classList.toggle('hidden');
  });

  // Lightbox
  lightboxClose?.addEventListener('click', closeLightbox);
  photoLightbox?.addEventListener('click', e => { if(e.target===photoLightbox) closeLightbox(); });
  lightboxPrev?.addEventListener('click', () => moveLightbox(-1));
  lightboxNext?.addEventListener('click', () => moveLightbox(1));
  document.addEventListener('keydown', e => {
    if (photoLightbox && !photoLightbox.classList.contains('hidden')) {
      if (e.key==='Escape') closeLightbox();
      if (e.key==='ArrowLeft') moveLightbox(-1);
      if (e.key==='ArrowRight') moveLightbox(1);
    }
  });

  detailsDrawerClose?.addEventListener('click', () => detailsDrawer?.classList.add('hidden'));

  function scrollTableToTop() {
    const el = document.querySelector('.table-container') || resultsWrapper;
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // ── Search & Resolution ──
  async function handleSearchSubmit(e) {
    if (e) e.preventDefault();
    filterMode = 'all';
    currentPage = 1;
    currentSource = sourceSelect.value;
    await executeSearch();
  }

  async function handleSearchNoWebsiteClick() {
    const query = locationInput.value.trim();
    if (!query) { locationInput.focus(); return; }
    filterMode = 'no-website';
    currentPage = 1;
    activeOnlyCheckbox.checked = false;
    currentSource = sourceSelect.value;
    if (rawPlaces.length > 0 && query.toLowerCase() === currentSearchQuery.toLowerCase() && categorySelect.value === currentCategory && sourceSelect.value === currentSource) {
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
    currentPage = 1;

    // Reset UI banners & cards
    if (didYouMeanCard) didYouMeanCard.classList.add('hidden');
    if (locationBanner) locationBanner.classList.add('hidden');
    if (requestsUsedLine) requestsUsedLine.classList.add('hidden');
    fallbackBanner?.classList.add('hidden');

    if (source === 'tomtom') {
      showState('loading');
      setButtonsDisabled(true);
      try {
        const resp = await fetch('/api/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ location: query, category, source: 'tomtom' })
        });
        const data = await resp.json();
        if (!resp.ok) throw new Error(data.error || 'TomTom search failed.');
        rawPlaces = data.results || [];
        cacheBadge.classList.toggle('hidden', !data.cached);
        sourceBadge.textContent = 'TomTom';
        sourceBadge.className = 'badge badge-tomtom';
        sourceBadge.classList.remove('hidden');
        if (rawPlaces.length === 0) showState('empty');
        else {
          showState('results');
          renderTableAndSummary();
          triggerBackgroundWebsiteCheck(rawPlaces);
        }
      } catch (err) {
        console.error('[TomTom Search Error]', err);
        errorTitle.textContent = 'Unable to complete search';
        errorMessage.textContent = err.message || 'An error occurred.';
        showState('error');
      } finally {
        setButtonsDisabled(false);
      }
      return;
    }

    // Google Places Search with Location Resolution (Section 2 & Section 3)
    showState('loading');
    setButtonsDisabled(true);

    try {
      const sessionKey = 'loc_res_' + query.toLowerCase();
      const cachedChoice = sessionStorage.getItem(sessionKey);
      if (cachedChoice) {
        const area = JSON.parse(cachedChoice);
        await runCityWideSearch(area, query, category);
        return;
      }

      // Step 1: Resolve location
      const resResp = await fetch('/api/resolve-location', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ location: query })
      });
      const resData = await resResp.json();
      if (!resResp.ok) throw new Error(resData.error || 'Failed to resolve location.');

      if (resData.status === 'ambiguous') {
        showDidYouMeanPrompt(resData.candidates, query, category);
        showState('initial');
        setButtonsDisabled(false);
        return;
      }

      // Exact single area resolved
      const area = resData.area;
      sessionStorage.setItem(sessionKey, JSON.stringify(area));
      await runCityWideSearch(area, query, category);
    } catch (err) {
      console.error('[Location Search Error]', err);
      errorTitle.textContent = 'Unable to complete search';
      errorMessage.textContent = err.message || 'An error occurred.';
      if (sourceSelect.value === 'google') {
        fallbackMsg.textContent = 'Would you like to switch to TomTom and retry?';
        fallbackBanner.classList.remove('hidden');
      }
      showState('error');
    } finally {
      setButtonsDisabled(false);
    }
  }

  function showDidYouMeanPrompt(candidates, query, category) {
    if (!didYouMeanCard || !didYouMeanList) return;
    const sessionKey = 'loc_res_' + query.toLowerCase();
    didYouMeanList.innerHTML = '';
    candidates.forEach(c => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn-dym-choice';
      const label = c.name + (c.district ? ', ' + c.district : '') + (c.state ? ', ' + c.state : '');
      btn.textContent = label;
      btn.addEventListener('click', async () => {
        sessionStorage.setItem(sessionKey, JSON.stringify(c));
        didYouMeanCard.classList.add('hidden');
        setButtonsDisabled(true);
        try {
          await runCityWideSearch(c, query, category);
        } catch (err) {
          console.error('[DYM Search Error]', err);
          errorTitle.textContent = 'Unable to complete search';
          errorMessage.textContent = err.message || 'An error occurred.';
          showState('error');
        } finally {
          setButtonsDisabled(false);
        }
      });
      didYouMeanList.appendChild(btn);
    });
    didYouMeanCard.classList.remove('hidden');
  }

  async function runCityWideSearch(area, typedQuery, category) {
    currentResolvedArea = area;

    // Show Location Resolution Banner (Section 2)
    if (locationBanner && locBannerText) {
      const isDiff = area.name.toLowerCase() !== typedQuery.toLowerCase();
      locBannerText.innerHTML = 'Showing results for <strong>' + escapeHtml(area.name) + (area.state ? ', ' + escapeHtml(area.state) : '') + '</strong>' +
        (isDiff ? ' <span class="loc-banner-typed" style="margin-left:0.5rem;color:var(--text-muted);font-size:0.85rem;">(You typed: <em>' + escapeHtml(typedQuery) + '</em>)</span>' : '');
      locationBanner.classList.remove('hidden');
    }

    rawPlaces = [];
    currentPage = 1;
    showState('results');

    // Show live progress bar (Section 3)
    if (searchProgressCard && searchProgressFill && searchProgressText) {
      searchProgressCard.classList.remove('hidden');
      searchProgressFill.style.width = '10%';
      searchProgressText.textContent = 'Searching... 0 places found';
    }
    if (requestsUsedLine) requestsUsedLine.classList.add('hidden');

    sourceBadge.textContent = 'Google Places';
    sourceBadge.className = 'badge badge-google';
    sourceBadge.classList.remove('hidden');
    cacheBadge.classList.add('hidden');

    let cursor = null;
    let totalRequestsUsed = 0;
    let isComplete = false;
    let stepCount = 0;
    let isCapped = false;

    while (!isComplete) {
      const resp = await fetch('/api/search/step', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          location: typedQuery,
          category,
          placeId: area.placeId,
          viewport: area.viewport,
          cursor
        })
      });
      const data = await resp.json();
      if (!resp.ok) {
        if (data.code === 'DAILY_LIMIT_EXCEEDED' || resp.status === 429) {
          throw new Error(data.error || data.message || 'Daily Google Places request limit reached.');
        }
        throw new Error(data.error || 'Failed to search places.');
      }

      totalRequestsUsed = data.totalRequestsUsed || 0;
      isCapped = !!data.capped;

      if (data.places && data.places.length > 0) {
        rawPlaces.push(...data.places);
        renderTableAndSummary();
        triggerBackgroundWebsiteCheck(data.places);
      }

      cursor = data.nextCursor;
      isComplete = data.isComplete || !cursor;
      stepCount++;

      const pct = isComplete ? 100 : Math.min(95, 15 + stepCount * 18);
      if (searchProgressFill) searchProgressFill.style.width = pct + '%';
      if (searchProgressText) {
        if (isComplete) {
          searchProgressText.textContent = (isCapped ? 'Search stopped at the request limit, results may be incomplete. ' : 'Complete! ') + rawPlaces.length + ' places found';
        } else {
          searchProgressText.textContent = 'Searching... ' + rawPlaces.length + ' places found';
        }
      }
    }

    // Small line after each search ("Used 118 Google requests")
    if (requestsUsedLine) {
      requestsUsedLine.textContent = 'Used ' + totalRequestsUsed + ' Google requests';
      requestsUsedLine.classList.remove('hidden');
    }

    if (rawPlaces.length === 0) {
      showState('empty');
    } else {
      renderTableAndSummary();
    }
  }

  // Background website status checks (Section 3)
  const checkedWebsitesSet = new Set();
  async function triggerBackgroundWebsiteCheck(placesList) {
    const toCheck = placesList.filter(p => p.websiteUri && !checkedWebsitesSet.has(p.id));
    if (toCheck.length === 0) return;
    toCheck.forEach(p => checkedWebsitesSet.add(p.id));

    const chunkSize = 10;
    for (let i = 0; i < toCheck.length; i += chunkSize) {
      const chunk = toCheck.slice(i, i + chunkSize);
      fetch('/api/check-websites-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ places: chunk })
      })
      .then(r => r.json())
      .then(res => {
        if (!res || !Array.isArray(res.results)) return;
        let changed = false;
        res.results.forEach(item => {
          const target = rawPlaces.find(p => p.id === item.id);
          if (target) {
            target.websiteStatus = item.websiteStatus;
            target.finalWebsiteUri = item.finalWebsiteUri;
            target.socialPlatform = item.socialPlatform;
            target.website = item.website;
            changed = true;
          }
        });
        if (changed) {
          renderTableAndSummary();
        }
      })
      .catch(err => console.warn('[Background Website Check Error]', err.message));
    }
  }

  function setButtonsDisabled(d) { searchBtn.disabled=d; searchNoWebsiteBtn.disabled=d; }

  function showState(state) {
    [loadingState,errorState,initialState,emptyState,resultsWrapper].forEach(el=>el.classList.add('hidden'));
    if(state==='loading') loadingState.classList.remove('hidden');
    else if(state==='error') errorState.classList.remove('hidden');
    else if(state==='initial') initialState.classList.remove('hidden');
    else if(state==='empty') emptyState.classList.remove('hidden');
    else if(state==='results') resultsWrapper.classList.remove('hidden');
  }

  // ── Section 2: Warning Logic ──
  function getPlaceWarnings(place) {
    const verify = [];
    const info = [];

    // 1. Missing phone
    const rawP = place.rawPhone || place.phone;
    if (!rawP || rawP === 'Not available') {
      verify.push('Missing phone number');
    } else {
      // 2. Phone not in a valid format (Indian 10-digit format)
      const digits = rawP.replace(/\D/g, '').replace(/^91/, '').replace(/^0/, '');
      if (digits.length !== 10 || !/^[6-9]/.test(digits)) {
        verify.push('Phone not in valid Indian 10-digit format');
      }
    }

    // 3. Missing opening hours
    if (!place.openingHours || place.openingHours === 'Not available') {
      verify.push('Missing opening hours');
    }

    // 4. Temporarily closed
    if (place.businessStatus === 'CLOSED_TEMPORARILY') {
      verify.push('Temporarily closed on Google Maps');
    }

    // 5. Name containing a phone number or promotional text
    const name = place.name || '';
    const hasPhoneOrPromo = /\b(call|contact|ph|mob|phone|booking|whatsapp|order)[:\s]*\d{5,}/i.test(name) ||
                           /\b[6-9]\d{9}\b/.test(name) ||
                           /\b\d{5}\s*\d{5}\b/.test(name) ||
                           /\b(call\s*now|order\s*now|best\s*rates?|discount)\b/i.test(name);
    if (hasPhoneOrPromo) {
      verify.push('Name contains phone number or promotional text');
    }

    // 6. Address missing a 6-digit postal pincode
    const addr = place.address || '';
    if (!/\b[1-9][0-9]{5}\b/.test(addr)) {
      verify.push('Address is missing a 6-digit postal pincode');
    }

    // Info items (grey): no rating
    if (!place.rating || place.rating === 'Not available') {
      info.push('No rating or reviews on Google');
    }

    return { verify, info };
  }

  function renderWarningIconHtml(place) {
    const { verify, info } = getPlaceWarnings(place);
    if (verify.length === 0 && info.length === 0) return '';

    const isVerify = verify.length > 0;
    const icon = isVerify ? '⚠' : 'ℹ';
    const btnClass = isVerify ? 'warning-icon-btn' : 'info-icon-btn';
    const ariaLabel = isVerify ? 'Warnings to verify' : 'Information';

    let popoverContent = '';
    if (verify.length > 0) {
      popoverContent += '<div class="popover-title-verify">⚠ Verify before generating:</div><ul class="popover-list">' +
        verify.map(w => '<li>' + escapeHtml(w) + '</li>').join('') + '</ul>';
    }
    if (info.length > 0) {
      popoverContent += '<div class="popover-title-info">ℹ Info:</div><ul class="popover-list">' +
        info.map(i => '<li>' + escapeHtml(i) + '</li>').join('') + '</ul>';
    }

    return '<div class="warning-container">' +
      '<button type="button" class="' + btnClass + '" aria-label="' + ariaLabel + '" tabindex="0">' + icon + '</button>' +
      '<div class="warning-popover" role="tooltip">' + popoverContent + '</div>' +
      '</div>';
  }

  // ── Section 2: Phone Formatting Helper ──
  function formatIndianPhone(raw) {
    if (!raw || typeof raw !== 'string' || raw === 'Not available') {
      return { display: 'Not available', tel: null, isValid: false };
    }
    const s = raw.trim().replace(/[\s\-]/g, '');
    let digits = s.replace(/\D/g, '');
    if (!digits) return { display: raw, tel: null, isValid: false };

    if ((digits.length === 12 || digits.length === 11) && digits.startsWith('91')) {
      digits = digits.slice(2);
    }
    if (digits.length === 11 && digits.startsWith('0')) {
      digits = digits.slice(1);
    } else if (digits.length > 10 && digits.startsWith('0')) {
      digits = digits.slice(1);
    }

    if (digits.length === 10) {
      // 2-digit STD codes: 80, 11, 22, 33, 44, 20, 40, 79
      if (/^(80|11|22|33|44|20|40|79)/.test(digits)) {
        const std = digits.slice(0, 2);
        const part1 = digits.slice(2, 6);
        const part2 = digits.slice(6, 10);
        return {
          display: '+91 ' + std + ' ' + part1 + ' ' + part2,
          tel: 'tel:+91' + digits,
          digits,
          isValid: true
        };
      }
      // 3-digit STD codes: e.g. 821 for Mysuru, 824 for Mangaluru, etc.
      if (/^(821|824|836|816|820|831|832|847|825|838|839|848|818|819|817|827|822|823)/.test(digits)) {
        const std = digits.slice(0, 3);
        const part1 = digits.slice(3, 6);
        const part2 = digits.slice(6, 10);
        return {
          display: '+91 ' + std + ' ' + part1 + ' ' + part2,
          tel: 'tel:+91' + digits,
          digits,
          isValid: true
        };
      }
      // Mobile number: +91 XXXXX XXXXX
      return {
        display: '+91 ' + digits.slice(0, 5) + ' ' + digits.slice(5, 10),
        tel: 'tel:+91' + digits,
        digits,
        isValid: true
      };
    }

    // 8-digit landline without STD code (e.g. 23456789)
    if (digits.length === 8) {
      return {
        display: '+91 80 ' + digits.slice(0, 4) + ' ' + digits.slice(4, 8),
        tel: 'tel:+9180' + digits,
        digits: '80' + digits,
        isValid: true
      };
    }

    if (digits.length >= 7) {
      return {
        display: '+91 ' + digits,
        tel: 'tel:+91' + digits,
        digits,
        isValid: true
      };
    }

    return { display: raw, tel: 'tel:' + raw.replace(/\s+/g, ''), isValid: false };
  }

  // ── Section 1: Two-line Today Hours ──
  function formatTwoLineTodayHours(openingHours) {
    if (!openingHours || openingHours === 'Not available') {
      return { day: 'Today:', time: 'Not available' };
    }
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const todayName = dayNames[new Date().getDay()];
    const parts = openingHours.split(/\s*\|\s*/);
    for (const p of parts) {
      const trimmed = p.trim();
      if (trimmed.toLowerCase().startsWith(todayName.toLowerCase())) {
        const timePart = trimmed.replace(new RegExp('^' + todayName + ':\\s*', 'i'), '').trim();
        return { day: 'Today:', time: timePart };
      }
    }
    if (parts.length > 0 && parts[0]) {
      const first = parts[0].trim();
      const colonIdx = first.indexOf(':');
      if (colonIdx !== -1) {
        return { day: 'Today:', time: first.slice(colonIdx + 1).trim() };
      }
      return { day: 'Today:', time: first.slice(0, 30) };
    }
    return { day: 'Today:', time: 'Not available' };
  }

  function getFilteredAndSortedPlaces() {
    let filtered = [...rawPlaces];
    if (filterMode === 'no-website') {
      filtered = filtered.filter(p => p.websiteStatus === 'Not listed' || p.websiteStatus === 'Inactive' || p.websiteStatus === 'No own website');
    } else if (activeOnlyCheckbox && activeOnlyCheckbox.checked) {
      filtered = filtered.filter(p => p.websiteStatus === 'Active' || p.websiteStatus === 'Active (restricted)');
    }
    if (hideWarningsCheckbox && hideWarningsCheckbox.checked) {
      filtered = filtered.filter(p => getPlaceWarnings(p).verify.length === 0);
    }
    filtered.sort((a,b)=>{
      let valA=(a[sortColumn]||'').toString().toLowerCase(), valB=(b[sortColumn]||'').toString().toLowerCase();
      if(valA<valB) return sortDirection==='asc'?-1:1;
      if(valA>valB) return sortDirection==='asc'?1:-1;
      return 0;
    });
    return filtered;
  }

  function getPaginationPageNumbers(current, total) {
    if (total <= 7) {
      return Array.from({ length: total }, (_, i) => i + 1);
    }
    const pages = [];
    if (current <= 4) {
      for (let i = 1; i <= 5; i++) pages.push(i);
      pages.push('...');
      pages.push(total);
    } else if (current >= total - 3) {
      pages.push(1);
      pages.push('...');
      for (let i = total - 4; i <= total; i++) pages.push(i);
    } else {
      pages.push(1);
      pages.push('...');
      pages.push(current - 1);
      pages.push(current);
      pages.push(current + 1);
      pages.push('...');
      pages.push(total);
    }
    return pages;
  }

  // ── Table Render (Section 4 & Section 5) ──
  function renderTableAndSummary() {
    const disp = getFilteredAndSortedPlaces();
    const total = disp.length;
    const phoneCount = disp.filter(p => p.phone && p.phone !== 'Not available').length;
    const webCount = disp.filter(p => p.websiteStatus === 'Active' || p.websiteStatus === 'Active (restricted)').length;

    if (filterMode === 'no-website') summaryLine.textContent = total + ' of ' + rawPlaces.length + ' places have no active website';
    else if (activeOnlyCheckbox && activeOnlyCheckbox.checked) summaryLine.textContent = total + ' places with active websites found';
    else summaryLine.textContent = total + ' places found: ' + phoneCount + ' with phone, ' + webCount + ' with active website';

    downloadExcelBtn.disabled = total === 0;

    const totalPages = Math.ceil(total / PAGE_SIZE) || 1;
    if (currentPage > totalPages) currentPage = totalPages;
    if (currentPage < 1) currentPage = 1;

    const startIndex = total === 0 ? 0 : (currentPage - 1) * PAGE_SIZE;
    const endIndex = Math.min(startIndex + PAGE_SIZE, total);
    const pagePlaces = disp.slice(startIndex, endIndex);

    if (paginationWrapper) {
      if (total <= PAGE_SIZE) {
        paginationWrapper.classList.add('hidden');
      } else {
        paginationWrapper.classList.remove('hidden');
        if (paginationSummary) {
          paginationSummary.textContent = `Showing ${startIndex + 1} to ${endIndex} of ${total}`;
        }
        if (btnPrevPage) btnPrevPage.disabled = currentPage <= 1;
        if (btnNextPage) btnNextPage.disabled = currentPage >= totalPages;

        if (paginationPages) {
          paginationPages.innerHTML = '';
          const pages = getPaginationPageNumbers(currentPage, totalPages);
          pages.forEach(p => {
            if (p === '...') {
              const span = document.createElement('span');
              span.className = 'pagination-ellipsis';
              span.textContent = '…';
              paginationPages.appendChild(span);
            } else {
              const btn = document.createElement('button');
              btn.type = 'button';
              btn.className = 'btn-page' + (p === currentPage ? ' active' : '');
              btn.textContent = String(p);
              btn.addEventListener('click', () => {
                currentPage = p;
                renderTableAndSummary();
                scrollTableToTop();
              });
              paginationPages.appendChild(btn);
            }
          });
        }
      }
    }

    placesTbody.innerHTML = '';
    if (total === 0) {
      placesTbody.innerHTML = '<tr><td colspan="10" style="text-align:center;padding:2.5rem 1rem;color:var(--text-muted);">No places match the selected filter.</td></tr>';
      return;
    }

    pagePlaces.forEach(place => {
      const tr = document.createElement('tr');
      const typeBadge = '<span class="badge ' + (place.type === 'Stay' ? 'badge-stay' : 'badge-restaurant') + '">' + escapeHtml(place.type) + '</span>';
      
      let bizBadge = '';
      if (place.businessStatus === 'CLOSED_TEMPORARILY') bizBadge = '<span class="badge badge-temp-closed">Temp. Closed</span>';
      else if (place.addedManually) bizBadge = '<span class="badge badge-manual">Manual</span>';

      const warnIconHtml = renderWarningIconHtml(place);

      let stClass = 'status-none';
      if (place.websiteStatus === 'Active') stClass = 'status-active';
      else if (place.websiteStatus === 'Active (restricted)') stClass = 'status-restricted';
      else if (place.websiteStatus === 'Inactive') stClass = 'status-inactive';
      else if (place.websiteStatus === 'No own website') stClass = 'status-social';
      const stBadge = '<span class="badge ' + stClass + '">' + escapeHtml(place.websiteStatus) + '</span>';

      let webCell = '<span class="text-muted-cell">Not available</span>';
      if (place.websiteUri && !place.socialPlatform) {
        webCell = '<a href="' + escapeHtml(place.finalWebsiteUri || place.websiteUri) + '" target="_blank" rel="noopener noreferrer" class="table-link website-cell-link" title="' + escapeHtml(place.finalWebsiteUri || place.websiteUri) + '">' + escapeHtml(place.website) + '</a>';
      } else if (place.socialPlatform) {
        webCell = '<span class="badge badge-social" title="' + escapeHtml(place.socialPlatform) + '">' + escapeHtml(place.website) + '</span>';
      }

      // Map Link as small icon button with tooltip
      let mapCell = '<span class="text-muted-cell">—</span>';
      if (place.mapLink && place.mapLink !== 'Not available') {
        mapCell = '<a href="' + escapeHtml(place.mapLink) + '" target="_blank" rel="noopener noreferrer" class="btn-map-icon" title="View on Google Maps" aria-label="View on Google Maps">' +
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
            '<path d="M12 2a8 8 0 0 0-8 8c0 5.25 8 12 8 12s8-6.75 8-12a8 8 0 0 0-8-8z"/>' +
            '<circle cx="12" cy="10" r="3"/>' +
          '</svg>' +
        '</a>';
      }

      // Phone formatting: mobile as +91 XXXXX XXXXX on one line, landline as +91 80 XXXX XXXX
      const pInfo = formatIndianPhone(place.rawPhone || place.phone);
      const phoneCell = pInfo.tel
        ? '<a href="' + escapeHtml(pInfo.tel) + '" class="table-link phone-link" title="' + escapeHtml(pInfo.display) + '">' + escapeHtml(pInfo.display) + '</a>'
        : '<span class="text-muted-cell">Not available</span>';

      // Full week schedule in tooltip & two-line display
      const fullWeekTooltip = place.openingHours && place.openingHours !== 'Not available'
        ? escapeHtml(place.openingHours.replace(/\s*\|\s*/g, '\n'))
        : 'Hours not available';
      const hObj = formatTwoLineTodayHours(place.openingHours);
      const hoursCell = '<div class="hours-compact" title="Full week schedule:&#10;' + fullWeekTooltip + '">' +
        '<span class="hours-day-label">' + escapeHtml(hObj.day) + '</span> ' +
        '<span class="hours-time-val">' + escapeHtml(hObj.time) + '</span>' +
        '</div>';

      // Narrow rating & review count: "4.2 (605)" on one line
      const ratingCell = place.rating && place.rating !== 'Not available'
        ? '<span class="rating-compact">' + escapeHtml(place.rating) + (place.reviewCount && place.reviewCount !== 'Not available' ? ' (' + escapeHtml(place.reviewCount) + ')' : '') + '</span>'
        : '<span class="text-muted-cell">—</span>';

      // Truncated address with full text in tooltip
      const addrCell = '<span class="address-cell" title="' + escapeHtml(place.address) + '">' + escapeHtml(place.address) + '</span>';

      // Actions column (Section 5)
      const hasActiveOwnWeb = place.websiteStatus === 'Active' || place.websiteStatus === 'Active (restricted)';
      const genBtnHtml = hasActiveOwnWeb
        ? '<button type="button" class="btn-has-website" disabled title="Already has active website">Has website</button>'
        : '<button type="button" class="btn-generate-compact btn-action-generate" data-place-id="' + escapeHtml(String(place.id)) + '" title="Generate Website">Generate</button><a href="#" target="_blank" rel="noopener noreferrer" class="preview-row-link hidden" data-preview-link="' + escapeHtml(String(place.id)) + '">Preview ↗</a>';
      const detailsBtn = '<button type="button" class="btn-icon-xs btn-details" data-place-id="' + escapeHtml(String(place.id)) + '" title="Show full details">ℹ</button>';
      const refreshBtn = (place.source === 'google' && place.placeId)
        ? '<button type="button" class="btn-icon-xs btn-refresh-details" data-place-id="' + escapeHtml(String(place.id)) + '" title="Refresh from Google">↻</button>'
        : '';
      const actionCell = '<div class="action-cell-compact">' + genBtnHtml + '<div class="action-icons-row">' + detailsBtn + refreshBtn + '</div></div>';

      tr.innerHTML = '<td class="col-name"><div class="name-clamp"><strong>' + escapeHtml(place.name) + '</strong>' + bizBadge + warnIconHtml + '</div></td>' +
        '<td class="col-type">' + typeBadge + '</td>' +
        '<td class="col-address">' + addrCell + '</td>' +
        '<td class="col-phone">' + phoneCell + '</td>' +
        '<td class="col-rating">' + ratingCell + '</td>' +
        '<td class="col-website">' + webCell + '</td>' +
        '<td class="col-status">' + stBadge + '</td>' +
        '<td class="col-hours">' + hoursCell + '</td>' +
        '<td class="col-map">' + mapCell + '</td>' +
        '<td class="col-action">' + actionCell + '</td>';
      placesTbody.appendChild(tr);
    });
  }

  // Popover toggle listeners
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.warning-icon-btn, .info-icon-btn');
    if (btn) {
      const pop = btn.nextElementSibling;
      if (pop && pop.classList.contains('warning-popover')) {
        pop.classList.toggle('is-open');
      }
      return;
    }
    document.querySelectorAll('.warning-popover.is-open').forEach(p => p.classList.remove('is-open'));
  });

  // ── Table Click Handler ──
  async function handleTbodyClick(e) {
    const genBtn = e.target.closest('.btn-action-generate');
    if (genBtn) {
      const p = rawPlaces.find(p => String(p.id) === String(genBtn.getAttribute('data-place-id')));
      if (p) openModal(p);
      return;
    }
    const detBtn = e.target.closest('.btn-details');
    if (detBtn) {
      const p = rawPlaces.find(p => String(p.id) === String(detBtn.getAttribute('data-place-id')));
      if (p) openDetailsDrawer(p);
      return;
    }
    const refBtn = e.target.closest('.btn-refresh-details');
    if (refBtn) {
      const p = rawPlaces.find(p => String(p.id) === String(refBtn.getAttribute('data-place-id')));
      if (p) await refreshPlaceDetails(p, refBtn);
      return;
    }
  }

  // ── Sec3 & Sec4: Details Drawer ──
  function openDetailsDrawer(place) {
    if (!detailsDrawer || !detailsDrawerContent) return;
    const fetchedAt = place.fetchedAt ? new Date(place.fetchedAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : 'Not recorded';
    const phoneInfo = formatIndianPhone(place.rawPhone || place.phone);
    
    const { verify, info } = getPlaceWarnings(place);
    let warnHtml = '';
    if (verify.length > 0) {
      warnHtml += '<div class="drawer-warnings"><h4 class="drawer-warn-title">⚠ Potential Issues to Verify</h4><ul class="drawer-warn-list">' +
        verify.map(w => '<li>' + escapeHtml(w) + '</li>').join('') + '</ul></div>';
    }
    if (info.length > 0) {
      warnHtml += '<div class="drawer-warnings drawer-info"><h4 class="drawer-warn-title" style="color:#9CA3AF">ℹ Information</h4><ul class="drawer-warn-list">' +
        info.map(i => '<li>' + escapeHtml(i) + '</li>').join('') + '</ul></div>';
    }

    const primaryTypeStr = place.primaryType || 'Not specified';
    const typesStr = Array.isArray(place.types) ? place.types.join(', ') : (place.types || 'Not available');
    const placeIdHtml = place.placeId ? '<div class="drawer-field"><span class="drawer-label">Place ID</span><span class="drawer-value mono">' + escapeHtml(place.placeId) + '</span></div>' : '';
    const mapsLink = place.mapLink && place.mapLink !== 'Not available' ? '<a href="' + escapeHtml(place.mapLink) + '" target="_blank" rel="noopener noreferrer" class="table-link">Verify on Google Maps ↗</a>' : '';
    const bst = place.businessStatus || 'OPERATIONAL';
    const bstClass = bst === 'CLOSED_PERMANENTLY' ? 'drawer-status-closed' : bst === 'CLOSED_TEMPORARILY' ? 'drawer-status-temp' : 'drawer-status-op';

    const finalUrl = place.finalWebsiteUri || place.websiteUri || null;
    let websiteHtml = '<span class="text-muted-cell">Not available</span>';
    if (place.websiteUri) {
      websiteHtml = '<a href="' + escapeHtml(place.websiteUri) + '" target="_blank" rel="noopener noreferrer" class="table-link mono" style="font-size:0.8rem;">' + escapeHtml(place.website || place.websiteUri) + '</a>';
    }

    let finalWebsiteHtml = '';
    if (finalUrl) {
      finalWebsiteHtml = '<div class="drawer-field full"><span class="drawer-label">Final Website Address (Resolved)</span><span class="drawer-value mono"><a href="' + escapeHtml(finalUrl) + '" target="_blank" rel="noopener noreferrer" class="table-link">' + escapeHtml(finalUrl) + ' ↗</a>' + (place.socialPlatform ? ' <span class="badge badge-social">' + escapeHtml(place.socialPlatform) + '</span>' : '') + '</span></div>';
    }

    // Reclassify section
    const isOverridden = !!place.overriddenType;
    const reclassifyHtml = '<div class="drawer-field full drawer-reclassify-field">' +
      '<div class="drawer-reclassify-header">' +
        '<span class="drawer-label">Classification / Override</span>' +
        (isOverridden ? '<span class="badge badge-manual" style="font-size:0.7rem;">Overridden</span>' : '<span class="text-muted" style="font-size:0.7rem;">From Google Type</span>') +
      '</div>' +
      '<div class="drawer-reclassify-controls">' +
        '<label for="drawer-reclassify-select" class="reclassify-lbl">Reclassify as:</label>' +
        '<select id="drawer-reclassify-select" class="drawer-select">' +
          '<option value="Restaurant"' + (place.type === 'Restaurant' ? ' selected' : '') + '>Restaurant</option>' +
          '<option value="Stay"' + (place.type === 'Stay' ? ' selected' : '') + '>Stay</option>' +
        '</select>' +
        (isOverridden ? '<button type="button" id="btn-reset-reclassify" class="btn-reset-type" title="Reset back to Google original type">↺ Reset to Google (' + escapeHtml(place.originalType || 'Restaurant') + ')</button>' : '') +
      '</div>' +
    '</div>';

    detailsDrawerContent.innerHTML = warnHtml + '<div class="drawer-fields">' +
      '<div class="drawer-field full"><span class="drawer-label">Name</span><span class="drawer-value"><strong>' + escapeHtml(place.name) + '</strong></span></div>' +
      reclassifyHtml +
      '<div class="drawer-field"><span class="drawer-label">Current Type</span><span class="drawer-value"><strong>' + escapeHtml(place.type) + '</strong></span></div>' +
      '<div class="drawer-field"><span class="drawer-label">Business Status</span><span class="drawer-value ' + bstClass + '">' + escapeHtml(bst.replace(/_/g, ' ')) + '</span></div>' +
      '<div class="drawer-field full"><span class="drawer-label">Address</span><span class="drawer-value">' + escapeHtml(place.address) + '</span></div>' +
      '<div class="drawer-field"><span class="drawer-label">Phone</span><span class="drawer-value" style="white-space:nowrap;">' + (phoneInfo.tel ? '<a href="' + escapeHtml(phoneInfo.tel) + '" class="table-link phone-link">' + escapeHtml(phoneInfo.display) + '</a>' : escapeHtml(phoneInfo.display)) + '</span></div>' +
      '<div class="drawer-field"><span class="drawer-label">Rating</span><span class="drawer-value">' + (place.rating && place.rating !== 'Not available' ? '★ ' + escapeHtml(place.rating) + ' (' + escapeHtml(String(place.reviewCount || '?')) + ' reviews)' : 'Not available') + '</span></div>' +
      '<div class="drawer-field full"><span class="drawer-label">Opening Hours</span><span class="drawer-value">' + escapeHtml(place.openingHours || 'Not available') + '</span></div>' +
      '<div class="drawer-field"><span class="drawer-label">Website (Original)</span><span class="drawer-value">' + websiteHtml + '</span></div>' +
      '<div class="drawer-field"><span class="drawer-label">Website Status</span><span class="drawer-value">' + escapeHtml(place.websiteStatus || 'Not listed') + '</span></div>' +
      finalWebsiteHtml +
      '<div class="drawer-field"><span class="drawer-label">Google Primary Type</span><span class="drawer-value mono">' + escapeHtml(primaryTypeStr) + '</span></div>' +
      placeIdHtml +
      '<div class="drawer-field full"><span class="drawer-label">All Google Types</span><span class="drawer-value" style="font-size:0.8rem;">' + escapeHtml(typesStr) + '</span></div>' +
      '<div class="drawer-field"><span class="drawer-label">Source</span><span class="drawer-value">' + escapeHtml(place.source || 'unknown') + '</span></div>' +
      '<div class="drawer-field"><span class="drawer-label">Data Fetched</span><span class="drawer-value">' + escapeHtml(fetchedAt) + '</span></div>' +
      (place.mapLink && place.mapLink !== 'Not available' ? '<div class="drawer-field full"><span class="drawer-label">Maps Link</span><span class="drawer-value">' + mapsLink + '</span></div>' : '') +
      '</div>';

    // Wire reclassify events
    const reclassSelect = detailsDrawerContent.querySelector('#drawer-reclassify-select');
    if (reclassSelect) {
      reclassSelect.addEventListener('change', () => {
        const newType = reclassSelect.value;
        if (!place.originalType) place.originalType = place.type;
        place.overriddenType = newType;
        place.type = newType;
        renderTableAndSummary();
        openDetailsDrawer(place);
      });
    }

    const resetBtn = detailsDrawerContent.querySelector('#btn-reset-reclassify');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        place.type = place.originalType || 'Restaurant';
        delete place.overriddenType;
        renderTableAndSummary();
        openDetailsDrawer(place);
      });
    }

    detailsDrawer.classList.remove('hidden');
  }

  async function refreshPlaceDetails(place,btn) {
    if(!place.placeId) return;
    const origText=btn.textContent; btn.disabled=true; btn.textContent='↻ …';
    try {
      const resp=await fetch('/api/enrich',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({placeId:place.placeId})});
      const data=await resp.json();
      if(!resp.ok) throw new Error(data.error||'Refresh failed');
      const d=data.details, idx=rawPlaces.findIndex(p=>String(p.id)===String(place.id));
      if(idx!==-1) rawPlaces[idx]={...rawPlaces[idx],phone:d.phone||rawPlaces[idx].phone,openingHours:d.openingHours||rawPlaces[idx].openingHours,website:d.website||rawPlaces[idx].website,websiteUri:d.websiteUri||rawPlaces[idx].websiteUri,businessStatus:d.businessStatus||rawPlaces[idx].businessStatus,rating:d.rating?String(d.rating):rawPlaces[idx].rating,reviewCount:d.reviewCount?String(d.reviewCount):rawPlaces[idx].reviewCount,fetchedAt:new Date().toISOString()};
      renderTableAndSummary(); btn.textContent='✓ Updated'; setTimeout(()=>{btn.textContent=origText;btn.disabled=false;},2000);
    } catch(err) { btn.textContent='✗ Failed'; setTimeout(()=>{btn.textContent=origText;btn.disabled=false;},2000); }
  }

  // ── Modal ──
  async function openModal(place) {
    modalPlace=place; modalEnriched=null; userItems=[];
    enrichModal.classList.remove('hidden'); document.body.style.overflow='hidden';
    modalLoading.classList.remove('hidden'); enrichForm.classList.add('hidden');
    modalError.classList.add('hidden'); opsWarning.classList.add('hidden'); hasWebsiteWarning.classList.add('hidden');
    if(place.source==='google'&&place.placeId) {
      try {
        const resp=await fetch('/api/enrich',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({placeId:place.placeId})});
        const data=await resp.json();
        if(!resp.ok) throw new Error(data.error||'Enrich failed.');
        modalEnriched=data.details;
      } catch(err) { console.warn('[Enrich Warning]',err.message); modalEnriched=null; }
    }
    modalLoading.classList.add('hidden'); populateModal(); enrichForm.classList.remove('hidden');
  }

  function populateModal() {
    const place=modalPlace, details=modalEnriched;
    const bStatus=details?.businessStatus||place.businessStatus||'OPERATIONAL';
    if(bStatus!=='OPERATIONAL') opsWarning.classList.remove('hidden');
    if(place.websiteStatus==='Active'||place.websiteStatus==='Active (restricted)') hasWebsiteWarning.classList.remove('hidden');

    const googleName = details?.name || place.name || '';
    if (origGoogleName) origGoogleName.textContent = googleName;
    if (editDisplayName) editDisplayName.value = googleName;

    // Detect phone number in Google name (Section 3)
    const phoneInfo = detectPhoneInName(googleName);
    if (phoneInfo && phoneInfo.foundNumber && cleanNameBanner && cleanNameText && btnApplyCleanedName) {
      cleanNameBanner.classList.remove('hidden');
      cleanNameText.innerHTML = `Found phone number <strong>${escapeHtml(phoneInfo.foundNumber)}</strong> in Google pin name.<br>Suggested clean name: <strong>${escapeHtml(phoneInfo.cleanName)}</strong>`;
      btnApplyCleanedName.onclick = () => {
        editDisplayName.value = phoneInfo.cleanName;
        editPhone.value = `+91 ${phoneInfo.foundNumber.slice(0, 5)} ${phoneInfo.foundNumber.slice(5)}`;
        cleanNameBanner.classList.add('hidden');
        validateEditPhone();
        if (vEditName) vEditName.checked = false;
        if (vEditPhone) vEditPhone.checked = false;
        updateGenerateButtonState();
      };
    } else if (cleanNameBanner) {
      cleanNameBanner.classList.add('hidden');
    }

    // Phone (+91 format)
    const rawP = details?.phone || place.phone || '';
    const digits = rawP.replace(/\D/g, '').replace(/^91/, '').replace(/^0/, '');
    if (editPhone) {
      editPhone.value = digits.length === 10 ? `+91 ${digits.slice(0, 5)} ${digits.slice(5)}` : (digits.length >= 7 ? `+91 ${digits}` : rawP);
      validateEditPhone();
    }

    // WhatsApp
    if (whatsappInput) {
      whatsappInput.value = '';
      if (whatsappValidation) whatsappValidation.textContent = '';
    }

    // Opening Hours text
    const hoursVal = details?.openingHours || (place.openingHours !== 'Not available' ? place.openingHours : '');
    if (editHours) editHours.value = hoursVal || '';
    toggleHoursVerifyVisibility();

    // Short Description
    if (editDescription) {
      editDescription.value = details?.editorialSummary || '';
    }

    // Reset editable field verified checkboxes
    if (vEditName) vEditName.checked = false;
    if (vEditPhone) vEditPhone.checked = false;
    if (vEditWhatsapp) vEditWhatsapp.checked = false;
    if (vEditHours) vEditHours.checked = false;
    if (vEditDesc) vEditDesc.checked = false;

    // Readonly Google data
    const revData=[
      {label:'Business Name',value:googleName},
      {label:'Address',value:details?.address||place.address},
      {label:'Phone',value:formatPhoneForDisplay(details?.phone||place.phone)},
      {label:'Rating',value:details?.rating?('★ '+details.rating+' ('+(details.reviewCount||'?')+' reviews)'):place.rating},
      {label:'Opening Hours',value:details?.openingHours||place.openingHours},
      {label:'Price Level',value:details?.priceLevel||'—'},
      {label:'Business Status',value:(details?.businessStatus||place.businessStatus||'OPERATIONAL').replace(/_/g,' ')},
      {label:'Map Link',value:details?.mapLink||place.mapLink,isLink:true}
    ];
    reviewFields.innerHTML=revData.map(f=>'<div class="review-field"><div class="review-field-label">'+escapeHtml(f.label)+'</div><div class="review-field-value">'+(f.isLink?'<a href="'+escapeHtml(f.value||'#')+'" target="_blank" rel="noopener noreferrer" class="table-link">View on Google Maps ↗</a>':escapeHtml(f.value||'Not available'))+'</div></div>').join('');

    // Photo picker init — ALWAYS show photoAssignmentSection!
    photoPickerState=[];
    photoAssignmentSection.classList.remove('hidden');

    if(details?.photos&&Array.isArray(details.photos)&&details.photos.length>0) {
      noPhotosNote.classList.add('hidden');
      photoPickerState=details.photos.slice(0,12).map((p,idx)=>({name:p.name,widthPx:p.widthPx,heightPx:p.heightPx,authorAttributions:p.authorAttributions||[],role:idx===0?'hero':'gallery',roomIndex:0,kept:false,removed:false}));
    } else {
      noPhotosNote.textContent = "No photos found on this place's Google pin. You can upload owner-provided photos below.";
      noPhotosNote.classList.remove('hidden');
    }
    renderPhotoAssignment();

    const isStay=!!(place.type||'').toLowerCase().match(/stay|hotel|motel|hostel|lodge|inn|guest|resort|pg/);
    roomsState=[]; menuState=[]; bulkParsedItems=[];
    if(bulkPasteBox) bulkPasteBox.classList.add('hidden');
    if(bulkPreviewWrapper) bulkPreviewWrapper.classList.add('hidden');
    const fOL=document.getElementById('field-order-link-wrap'), fRL=document.getElementById('field-reserve-link-wrap'), fBL=document.getElementById('field-booking-link-wrap');
    if(isStay){roomsEditorSection.classList.remove('hidden');menuEditorSection.classList.add('hidden');if(fOL)fOL.classList.add('hidden');if(fRL)fRL.classList.add('hidden');if(fBL)fBL.classList.remove('hidden');renderRoomsEditor();}
    else{roomsEditorSection.classList.add('hidden');menuEditorSection.classList.remove('hidden');if(fOL)fOL.classList.remove('hidden');if(fRL)fRL.classList.remove('hidden');if(fBL)fBL.classList.add('hidden');renderMenuEditor();}
    if(optOrderingLink) optOrderingLink.value='';
    if(optReservationLink) optReservationLink.value='';
    if(optBookingLink) optBookingLink.value='';
    if(optInstagram) optInstagram.value='';
    if(optCheckinOut) optCheckinOut.value='';
    if(optHouseRules) optHouseRules.value='';
    if(tokenSizeWarning) tokenSizeWarning.classList.add('hidden');
    if(designSelect){
      const themesObj=isStay?STAY_THEMES:RESTAURANT_THEMES, themeKeys=Object.keys(themesObj);
      designSelect.innerHTML='<option value="auto">Auto (Deterministic from Place ID &amp; Type)</option>'+themeKeys.map(k=>'<option value="'+escapeHtml(k)+'">'+escapeHtml(themesObj[k])+'</option>').join('');
      designSelect.value='auto';
      const pId=details?.id||place.placeId||place.id;
      const at=getAutoThemeName(pId,details?.name||place.name,isStay,details?.types);
      if(designAutoInfo) designAutoInfo.textContent='Auto will apply: '+at.name;
    }
    modalGenerateBtn.disabled=true;
    updateVerificationCheckboxes();
  }

  function formatPhoneForDisplay(phone) {
    if(!phone||phone==='Not available') return 'Not available';
    const digits=phone.replace(/\D/g,'').replace(/^91/,'').replace(/^0/,'');
    if(digits.length===10) return '+91 '+digits.slice(0,5)+' '+digits.slice(5);
    if(digits.length>=7) return '+91 '+digits;
    return phone;
  }

  // ── Sec1 & Sec3: Photo Picker ──
  function getUsedPhotos() {
    const notRemoved=photoPickerState.filter(p=>!p.removed);
    const kept=notRemoved.filter(p=>p.kept);
    let used=kept.length>0?kept:notRemoved;
    if(used.length>12) used=used.slice(0,12);
    return used;
  }

  function updatePhotoPickerStatus() {
    if(!photoPickerStatus) return;
    const notRemoved=photoPickerState.filter(p=>!p.removed).length;
    const removedCount=photoPickerState.filter(p=>p.removed).length;
    const kept=photoPickerState.filter(p=>p.kept&&!p.removed).length;
    const used=getUsedPhotos();
    const orig=photoPickerState.filter(p=>!p.removed);
    const kfl=orig.filter(p=>p.kept);
    const capped = used.length >= 12 && (kfl.length > 12 || orig.length > 12);
    let st='';
    if (kept > 0) st = 'Using ' + used.length + ' selected photo' + (used.length !== 1 ? 's' : '');
    else if (removedCount > 0 && used.length === 0) st = 'Removed ' + removedCount + ' photo' + (removedCount !== 1 ? 's' : '');
    else if (removedCount > 0) st = 'Using all ' + used.length + ' photo' + (used.length !== 1 ? 's' : '') + ' (' + removedCount + ' removed)';
    else st = 'Using all ' + used.length + ' photo' + (used.length !== 1 ? 's' : '') + ' (none selected)';
    if (capped) st += ' — only first 12 used';
    photoPickerStatus.textContent=st;
    if(btnShowRemoved){const rc=removedCount;btnShowRemoved.textContent='Show removed ('+rc+')';btnShowRemoved.disabled=rc===0;}
  }

  function renderPhotoAssignment() {
    if(!photosAssignmentGrid) return;
    const isStay=!!(modalPlace?.type||'').toLowerCase().match(/stay|hotel|motel|hostel|lodge|inn|guest|resort|pg/);
    const active=photoPickerState.filter(p=>!p.removed);
    const removed=photoPickerState.filter(p=>p.removed);
    const cardsHtml=active.map(p=>{
      const oi=photoPickerState.indexOf(p);
      const isOwner = !!(p.isOwnerProvided && p.url);
      const author = isOwner ? 'Owner-provided photo' : (p.authorAttributions&&p.authorAttributions[0]?p.authorAttributions[0].displayName:'Google Maps Contributor');
      const thumbSrc = isOwner ? p.url : ('/api/photo?name='+encodeURIComponent(p.name)+'&maxWidth=300');
      const roleOpts=[{value:'gallery',label:'Gallery'},{value:'hero',label:'★ Hero Banner'},isStay?{value:'room',label:'Room Photo'}:{value:'food',label:'Menu / Food'}];
      return '<div class="photo-assign-card '+(p.role==='hero'?'is-hero':'')+' '+(p.kept?'is-kept':'')+'" data-orig-idx="'+oi+'">' +
        '<label class="photo-keep-checkbox" title="Keep (use this photo)"><input type="checkbox" class="photo-keep-cb" data-orig-idx="'+oi+'" '+(p.kept?'checked':'')+'/></label>' +
        '<button type="button" class="photo-remove-btn" data-orig-idx="'+oi+'" title="Remove this photo">×</button>' +
        (isOwner ? '<span class="photo-owner-badge">Owner-provided</span>' : '') +
        '<span class="photo-role-badge">'+(p.role==='hero'?'HERO':p.role.toUpperCase())+'</span>' +
        '<img class="photo-assign-thumb" src="'+escapeHtml(thumbSrc)+'" alt="'+escapeHtml(author)+'" title="Click to preview · '+escapeHtml(author)+'" loading="lazy" data-orig-idx="'+oi+'" style="cursor:zoom-in">' +
        (isOwner ? '<button type="button" class="photo-delete-upload-btn" data-orig-idx="'+oi+'" title="Delete uploaded photo">🗑 Delete</button>' : '') +
        '<select class="photo-role-select" data-orig-idx="'+oi+'" aria-label="Photo role">'+roleOpts.map(o=>'<option value="'+o.value+'" '+(p.role===o.value?'selected':'')+'>'+o.label+'</option>').join('')+'</select>' +
        (isStay&&p.role==='room'?'<select class="photo-room-select" data-orig-idx="'+oi+'" aria-label="Assign to room">'+(roomsState.length===0?'<option value="0">Room 1</option>':roomsState.map((r,ri)=>'<option value="'+ri+'" '+(p.roomIndex===ri?'selected':'')+'>'+escapeHtml(r.name||('Room '+(ri+1)))+'</option>').join(''))+'</select>':'') +
      '</div>';
    }).join('');
    const removedHtml=removed.length>0?'<div id="removed-photos-panel" class="removed-photos-panel hidden"><h4 class="removed-panel-title">Removed Photos ('+removed.length+')</h4><div class="removed-photos-grid">'+removed.map(p=>{const oi=photoPickerState.indexOf(p);const isOwner=!!(p.isOwnerProvided&&p.url);const author=isOwner?'Owner-provided photo':(p.authorAttributions&&p.authorAttributions[0]?p.authorAttributions[0].displayName:'Google Maps Contributor');const thumbSrc=isOwner?p.url:('/api/photo?name='+encodeURIComponent(p.name)+'&maxWidth=300');return '<div class="removed-photo-item"><img class="photo-assign-thumb removed-thumb" src="'+escapeHtml(thumbSrc)+'" alt="Removed photo" loading="lazy"><button type="button" class="photo-undo-btn" data-orig-idx="'+oi+'" title="Restore this photo">↩ Restore</button><div class="removed-photo-author">'+escapeHtml(author)+'</div></div>';}).join('')+'</div></div>':'';
    photosAssignmentGrid.innerHTML=cardsHtml+removedHtml;
    photosAssignmentGrid.querySelectorAll('.photo-keep-cb').forEach(cb=>{cb.addEventListener('change',e=>{const idx=parseInt(e.target.dataset.origIdx,10);photoPickerState[idx].kept=e.target.checked;updatePhotoPickerStatus();renderPhotoAssignment();updateVerificationCheckboxes();});});
    photosAssignmentGrid.querySelectorAll('.photo-remove-btn').forEach(btn=>{btn.addEventListener('click',()=>{const idx=parseInt(btn.dataset.origIdx,10);photoPickerState[idx].removed=true;photoPickerState[idx].kept=false;updatePhotoPickerStatus();renderPhotoAssignment();updateVerificationCheckboxes();});});
    photosAssignmentGrid.querySelectorAll('.photo-undo-btn').forEach(btn=>{btn.addEventListener('click',()=>{const idx=parseInt(btn.dataset.origIdx,10);photoPickerState[idx].removed=false;updatePhotoPickerStatus();renderPhotoAssignment();updateVerificationCheckboxes();});});
    photosAssignmentGrid.querySelectorAll('.photo-assign-thumb:not(.removed-thumb)').forEach(img=>{img.addEventListener('click',()=>openLightbox(parseInt(img.dataset.origIdx,10)));});
    photosAssignmentGrid.querySelectorAll('.photo-role-select').forEach(sel=>{sel.addEventListener('change',e=>{const idx=parseInt(e.target.dataset.origIdx,10),newRole=e.target.value;if(newRole==='hero') photoPickerState.forEach((it,i)=>{if(i!==idx&&it.role==='hero') it.role='gallery';});photoPickerState[idx].role=newRole;renderPhotoAssignment();updateVerificationCheckboxes();});});
    photosAssignmentGrid.querySelectorAll('.photo-room-select').forEach(sel=>{sel.addEventListener('change',e=>{const idx=parseInt(e.target.dataset.origIdx,10);photoPickerState[idx].roomIndex=parseInt(e.target.value,10)||0;});});
    photosAssignmentGrid.querySelectorAll('.photo-delete-upload-btn').forEach(btn=>{
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const idx = parseInt(btn.dataset.origIdx, 10);
        const p = photoPickerState[idx];
        if (!p) return;
        if (!confirm(`Delete owner photo "${p.name || 'upload'}"?`)) return;
        try {
          await fetch('/api/delete-photo', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ storageId: p.storageId, url: p.url })
          });
        } catch (err) {
          console.warn('[Delete photo warning]', err);
        }
        photoPickerState.splice(idx, 1);
        renderPhotoAssignment();
        updateVerificationCheckboxes();
      });
    });
    updatePhotoPickerStatus();
  }

  function openLightbox(origIdx) { if(!photoLightbox) return; lightboxIndex=origIdx; loadLightboxPhoto(origIdx); photoLightbox.classList.remove('hidden'); document.body.style.overflow='hidden'; }
  function closeLightbox() { photoLightbox?.classList.add('hidden'); if(!enrichModal||enrichModal.classList.contains('hidden')) document.body.style.overflow=''; }
  function moveLightbox(dir) {
    const active=photoPickerState.map((p,i)=>({...p,origIdx:i})).filter(p=>!p.removed);
    if(!active.length) return;
    const cur=active.findIndex(p=>p.origIdx===lightboxIndex);
    lightboxIndex=active[(cur+dir+active.length)%active.length].origIdx;
    loadLightboxPhoto(lightboxIndex);
  }
  function loadLightboxPhoto(origIdx) {
    if(!lightboxImg||!lightboxAuthor) return;
    const p=photoPickerState[origIdx]; if(!p) return;
    if(lightboxLoading) lightboxLoading.classList.remove('hidden');
    lightboxImg.style.opacity='0';
    const isOwner = !!(p.isOwnerProvided && p.url);
    if (isOwner) {
      lightboxAuthor.innerHTML = '<span>Owner-provided photo</span>';
      lightboxImg.src = p.url;
    } else {
      const author=p.authorAttributions&&p.authorAttributions[0]?p.authorAttributions[0].displayName:'Google Maps Contributor';
      const uri=p.authorAttributions&&p.authorAttributions[0]?p.authorAttributions[0].uri:null;
      lightboxAuthor.innerHTML=uri?'Photo by <a href="'+escapeHtml(uri)+'" target="_blank" rel="noopener noreferrer">'+escapeHtml(author)+'</a>':'Photo by '+escapeHtml(author);
      lightboxImg.src='/api/photo?name='+encodeURIComponent(p.name)+'&maxWidth=800';
    }
    lightboxImg.onload=()=>{if(lightboxLoading) lightboxLoading.classList.add('hidden');lightboxImg.style.opacity='1';};
    lightboxImg.onerror=()=>{if(lightboxLoading) lightboxLoading.classList.add('hidden');lightboxImg.style.opacity='1';};
    const aph=photoPickerState.filter(pp=>!pp.removed);
    if(lightboxPrev) lightboxPrev.style.display=aph.length>1?'':'none';
    if(lightboxNext) lightboxNext.style.display=aph.length>1?'':'none';
  }

  // ── Rooms Editor ──
  function renderRoomsEditor() {
    if(!roomsList) return;
    roomsList.innerHTML=roomsState.map((r,i)=>'<div class="room-card" data-index="'+i+'"><div class="card-top-row"><span class="card-num-badge">Room '+(i+1)+'</span><button type="button" class="btn-remove-item btn-remove-room" data-index="'+i+'" title="Remove Room">×</button></div><div class="form-grid-2"><input type="text" class="modal-input room-field" data-field="name" data-index="'+i+'" placeholder="Room Name (e.g. Deluxe Balcony Suite)" value="'+escapeHtml(r.name||'')+'"><input type="text" class="modal-input room-field" data-field="tariff" data-index="'+i+'" placeholder="Tariff / Rate (e.g. ₹4,500/night)" value="'+escapeHtml(r.tariff||'')+'"></div><div class="form-grid-3"><input type="text" class="modal-input room-field" data-field="size" data-index="'+i+'" placeholder="Size (e.g. 350 sq ft)" value="'+escapeHtml(r.size||'')+'"><input type="text" class="modal-input room-field" data-field="capacity" data-index="'+i+'" placeholder="Capacity (e.g. 2 Adults, 1 Child)" value="'+escapeHtml(r.capacity||'')+'"><input type="text" class="modal-input room-field" data-field="bed" data-index="'+i+'" placeholder="Bed (e.g. 1 King Bed)" value="'+escapeHtml(r.bed||'')+'"></div><div class="form-grid-2"><input type="text" class="modal-input room-field" data-field="amenities" data-index="'+i+'" placeholder="Amenities (e.g. AC, Balcony, WiFi, Mini-fridge)" value="'+escapeHtml(r.amenities||'')+'"><select class="modal-select room-field" data-field="source" data-index="'+i+'"><option value="owner confirmed" '+(r.source==='owner confirmed'?'selected':'')+'>Source: Owner confirmed</option><option value="pin photo" '+(r.source==='pin photo'?'selected':'')+'>Source: Pin photo</option></select></div><textarea class="modal-input room-field" data-field="desc" data-index="'+i+'" rows="2" placeholder="Short description of this room type...">'+escapeHtml(r.desc||'')+'</textarea></div>').join('');
    roomsList.querySelectorAll('.room-field').forEach(el=>{const h=(e)=>{const idx=parseInt(e.target.dataset.index,10),field=e.target.dataset.field;if(!isNaN(idx)&&field&&roomsState[idx]){roomsState[idx][field]=e.target.value;updateVerificationCheckboxes();}};el.addEventListener('input',h);el.addEventListener('change',h);});
    roomsList.querySelectorAll('.btn-remove-room').forEach(btn=>{btn.addEventListener('click',()=>{roomsState.splice(parseInt(btn.dataset.index,10),1);renderRoomsEditor();updateVerificationCheckboxes();});});
  }

  // ── Menu Editor ──
  function renderMenuEditor() {
    if(!menuItemsList) return;
    menuItemsList.innerHTML=menuState.map((m,i)=>'<div class="menu-card" data-index="'+i+'"><div class="card-top-row"><span class="card-num-badge">Item '+(i+1)+'</span><button type="button" class="btn-remove-item btn-remove-menu" data-index="'+i+'" title="Remove Item">×</button></div><div class="form-grid-3"><input type="text" class="modal-input menu-field" data-field="category" data-index="'+i+'" placeholder="Category (e.g. Starters)" value="'+escapeHtml(m.category||'')+'"><input type="text" class="modal-input menu-field" data-field="name" data-index="'+i+'" placeholder="Item Name (e.g. Paneer Tikka)" value="'+escapeHtml(m.name||'')+'"><input type="text" class="modal-input menu-field" data-field="price" data-index="'+i+'" placeholder="Price (e.g. ₹260)" value="'+escapeHtml(m.price||'')+'"></div><div class="form-grid-3"><select class="modal-select menu-field" data-field="isVeg" data-index="'+i+'"><option value="veg" '+(m.isVeg===true||m.isVeg==='veg'?'selected':'')+'>🟢 Veg</option><option value="non-veg" '+(m.isVeg===false||m.isVeg==='non-veg'?'selected':'')+'>🔴 Non-Veg</option><option value="egg" '+(m.isVeg==='egg'?'selected':'')+'>🟡 Contains Egg</option></select><input type="text" class="modal-input menu-field" data-field="desc" data-index="'+i+'" placeholder="Description (optional)" value="'+escapeHtml(m.desc||'')+'"><select class="modal-select menu-field" data-field="source" data-index="'+i+'"><option value="owner confirmed" '+(m.source==='owner confirmed'?'selected':'')+'>Source: Owner confirmed</option><option value="pin photo" '+(m.source==='pin photo'?'selected':'')+'>Source: Pin photo</option></select></div></div>').join('');
    menuItemsList.querySelectorAll('.menu-field').forEach(el=>{const h=(e)=>{const idx=parseInt(e.target.dataset.index,10),field=e.target.dataset.field;if(!isNaN(idx)&&field&&menuState[idx]){menuState[idx][field]=e.target.value;updateVerificationCheckboxes();}};el.addEventListener('input',h);el.addEventListener('change',h);});
    menuItemsList.querySelectorAll('.btn-remove-menu').forEach(btn=>{btn.addEventListener('click',()=>{menuState.splice(parseInt(btn.dataset.index,10),1);renderMenuEditor();updateVerificationCheckboxes();});});
  }

  // Bulk paste
  toggleBulkPasteBtn?.addEventListener('click',()=>{ if(bulkPasteBox) bulkPasteBox.classList.toggle('hidden'); });
  parseBulkBtn?.addEventListener('click',()=>{
    if(!bulkMenuText) return;
    const lines=(bulkMenuText.value||'').split('\n').map(l=>l.trim()).filter(Boolean);
    bulkParsedItems=[];
    lines.forEach(line=>{const parts=line.split('|').map(p=>p.trim());if(parts.length>=2){const category=parts[0]||'General',name=parts[1]||'',price=parts[2]||'',vegRaw=(parts[3]||'').toLowerCase();let isVeg='veg';if(vegRaw.includes('non')) isVeg='non-veg';else if(vegRaw.includes('egg')) isVeg='egg';const desc=parts[4]||'';if(name) bulkParsedItems.push({category,name,price,isVeg,desc,source:'owner confirmed'});}});
    if(bulkParseStatus) bulkParseStatus.textContent='Parsed '+bulkParsedItems.length+' items.';
    if(bulkParsedItems.length>0&&bulkPreviewWrapper&&bulkPreviewTableContainer){
      bulkPreviewWrapper.classList.remove('hidden');
      bulkPreviewTableContainer.innerHTML='<table class="bulk-table"><thead><tr><th>Category</th><th>Item</th><th>Price</th><th>Type</th><th>Description</th></tr></thead><tbody>'+bulkParsedItems.map((item,idx)=>'<tr><td><input type="text" class="modal-input bulk-prev-field" data-field="category" data-index="'+idx+'" value="'+escapeHtml(item.category)+'"></td><td><input type="text" class="modal-input bulk-prev-field" data-field="name" data-index="'+idx+'" value="'+escapeHtml(item.name)+'"></td><td><input type="text" class="modal-input bulk-prev-field" data-field="price" data-index="'+idx+'" value="'+escapeHtml(item.price)+'"></td><td><select class="modal-select bulk-prev-field" data-field="isVeg" data-index="'+idx+'"><option value="veg" '+(item.isVeg==='veg'?'selected':'')+'>Veg</option><option value="non-veg" '+(item.isVeg==='non-veg'?'selected':'')+'>Non-Veg</option><option value="egg" '+(item.isVeg==='egg'?'selected':'')+'>Egg</option></select></td><td><input type="text" class="modal-input bulk-prev-field" data-field="desc" data-index="'+idx+'" value="'+escapeHtml(item.desc)+'"></td></tr>').join('')+'</tbody></table>';
      bulkPreviewTableContainer.querySelectorAll('.bulk-prev-field').forEach(el=>{el.addEventListener('input',e=>{const idx=parseInt(e.target.dataset.index,10),field=e.target.dataset.field;if(!isNaN(idx)&&bulkParsedItems[idx]) bulkParsedItems[idx][field]=e.target.value;});});
    }
  });
  acceptBulkBtn?.addEventListener('click',()=>{if(bulkParsedItems.length>0){menuState=menuState.concat(bulkParsedItems);bulkParsedItems=[];if(bulkPreviewWrapper) bulkPreviewWrapper.classList.add('hidden');if(bulkPasteBox) bulkPasteBox.classList.add('hidden');if(bulkMenuText) bulkMenuText.value='';if(bulkParseStatus) bulkParseStatus.textContent='';renderMenuEditor();updateVerificationCheckboxes();}});
  addRoomBtn?.addEventListener('click',()=>{roomsState.push({name:'',tariff:'',size:'',capacity:'',bed:'',amenities:'',desc:'',source:'owner confirmed'});renderRoomsEditor();updateVerificationCheckboxes();});
  addMenuItemBtn?.addEventListener('click',()=>{menuState.push({category:'General',name:'',price:'',isVeg:'veg',desc:'',source:'owner confirmed'});renderMenuEditor();updateVerificationCheckboxes();});

  function renderUserItems() {
    if(!userItemsList) return;
    userItemsList.innerHTML=userItems.map((item,i)=>'<div class="user-item-row"><input type="text" class="modal-input item-name" data-index="'+i+'" placeholder="Item name" value="'+escapeHtml(item.name||'')+'"><input type="text" class="modal-input item-price" data-index="'+i+'" placeholder="Price" value="'+escapeHtml(item.price||'')+'"><button type="button" class="btn-remove-item" data-index="'+i+'">×</button></div>').join('');
  }

  // ── Verification Checkboxes ──
  function updateVerificationCheckboxes() {
    const place=modalPlace, details=modalEnriched;
    const mapLink=details?.mapLink||place?.mapLink||'#';
    verificationDefs=[
      {id:'v-pin',label:'I confirmed this is the correct business on <a href="'+escapeHtml(mapLink)+'" target="_blank" rel="noopener noreferrer">Google Maps ↗</a>'},
      {id:'v-address',label:'Verified: Business Address & Pincode'}
    ];
    const usedPhotos=getUsedPhotos();
    if(usedPhotos.length>0) verificationDefs.push({id:'v-photos',label:'Verified: Photo selection ('+usedPhotos.length+' photo'+(usedPhotos.length!==1?'s':'')+' will be used)'});
    const isStay=!!(place?.type||'').toLowerCase().match(/stay|hotel|motel|hostel|lodge|inn|guest|resort|pg/);
    if(isStay&&roomsState.length>0){const anyOwner=roomsState.some(r=>r.source==='owner confirmed');verificationDefs.push({id:'v-rooms',label:'Verified: Room types & rates (Source: '+(anyOwner?'owner confirmed':'pin photo')+')'});}
    if(!isStay&&menuState.length>0){const anyOwner=menuState.some(m=>m.source==='owner confirmed');verificationDefs.push({id:'v-menu',label:'Verified: Menu items & prices (Source: '+(anyOwner?'owner confirmed':'pin photo')+')'});}
    const hasOpt=!!(optOrderingLink?.value?.trim()||optReservationLink?.value?.trim()||optBookingLink?.value?.trim()||optInstagram?.value?.trim()||optCheckinOut?.value?.trim()||optHouseRules?.value?.trim());
    if(hasOpt) verificationDefs.push({id:'v-optional',label:'Verified: Additional links & policies (Source: owner confirmed)'});
    verificationChecks.innerHTML=verificationDefs.map(v=>'<label class="verification-item" for="'+escapeHtml(v.id)+'"><input type="checkbox" id="'+escapeHtml(v.id)+'" class="verification-checkbox"><span>'+v.label+'</span></label>').join('');
    verificationChecks.querySelectorAll('.verification-checkbox').forEach(cb=>cb.addEventListener('change',updateGenerateButtonState));
    updateGenerateButtonState();
  }

  [optOrderingLink,optReservationLink,optBookingLink,optInstagram,optCheckinOut,optHouseRules].forEach(inp=>inp?.addEventListener('input',updateVerificationCheckboxes));

  function validateWhatsApp() {
    const val=whatsappInput.value.trim().replace(/\D/g,'');
    if(!val){whatsappValidation.textContent='';return;}
    if(/^[6-9]\d{9}$/.test(val)){whatsappValidation.textContent='✓ Valid Indian mobile: +91 '+val;whatsappValidation.className='validation-msg valid';}
    else{whatsappValidation.textContent='✗ Must be 10 digits starting with 6, 7, 8 or 9';whatsappValidation.className='validation-msg invalid';}
  }

  function detectPhoneInName(name) {
    if (!name || typeof name !== 'string') return null;
    const phonePattern = /(?:(?:call|contact|ph|mob|phone|booking|whatsapp|order)[:\s]*)?(\+?91[\s\-]?)?([6-9]\d{4}[\s\-]?\d{5})\b/i;
    const match = name.match(phonePattern);
    if (!match) {
      const m2 = name.match(/\b([6-9]\d{9})\b/);
      if (m2) {
        const cleanName = name.replace(m2[0], '').replace(/[-–—,:|()]+/g, ' ').replace(/\s+/g, ' ').trim();
        return { foundNumber: m2[1], cleanName: cleanName || name };
      }
      return null;
    }
    const rawNumber = match[2].replace(/\D/g, '');
    const cleanName = name.replace(match[0], '').replace(/[-–—,:|()]+/g, ' ').replace(/\s+/g, ' ').trim();
    return { foundNumber: rawNumber, cleanName: cleanName || name };
  }

  function validateEditPhone() {
    if (!editPhone || !editPhoneValidation) return;
    const raw = editPhone.value.trim();
    if (!raw) {
      editPhoneValidation.textContent = '';
      return;
    }
    const digits = raw.replace(/\D/g, '').replace(/^91/, '').replace(/^0/, '');
    if (digits.length === 10 && /^[6-9]/.test(digits)) {
      editPhoneValidation.textContent = `✓ Valid Indian mobile: +91 ${digits.slice(0, 5)} ${digits.slice(5)}`;
      editPhoneValidation.className = 'validation-msg valid';
    } else if (digits.length >= 7) {
      editPhoneValidation.textContent = `✓ Phone: +91 ${digits}`;
      editPhoneValidation.className = 'validation-msg valid';
    } else {
      editPhoneValidation.textContent = '✗ Invalid phone format (must be 10-digit Indian number)';
      editPhoneValidation.className = 'validation-msg invalid';
    }
  }

  function toggleHoursVerifyVisibility() {
    if (!vEditHoursWrap || !editHours) return;
    const hasHours = !!editHours.value.trim();
    vEditHoursWrap.style.display = hasHours ? 'flex' : 'none';
    if (!hasHours && vEditHours) vEditHours.checked = false;
  }

  // ── Photo Upload Helpers ──
  let pendingFilesToUpload = [];

  function handlePhotoFileSelect(e) {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    const currentTotal = photoPickerState.filter(p => !p.removed).length;
    if (currentTotal + files.length > 12) {
      alert(`Maximum 12 photos in total (Google pin photos + uploads). You currently have ${currentTotal} active photos, and cannot add ${files.length} more.`);
      photoUploadInput.value = '';
      return;
    }

    for (const f of files) {
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(f.type)) {
        alert(`Invalid format: ${f.name}. Only JPEG, PNG, and WebP are allowed.`);
        photoUploadInput.value = '';
        return;
      }
      if (f.size > 5 * 1024 * 1024) {
        alert(`File too large: ${f.name} (${(f.size / (1024 * 1024)).toFixed(1)} MB). Maximum allowed is 5 MB.`);
        photoUploadInput.value = '';
        return;
      }
    }

    pendingFilesToUpload = files;
    if (permFileInfo) permFileInfo.textContent = `${files.length} file${files.length > 1 ? 's' : ''} selected: ${files.map(f => f.name).join(', ')}`;
    if (permCheckbox) permCheckbox.checked = false;
    if (permConfirmBtn) permConfirmBtn.disabled = true;
    if (permUploadStatus) permUploadStatus.textContent = '';
    photoPermModal?.classList.remove('hidden');
  }

  function closePermModal() {
    photoPermModal?.classList.add('hidden');
    if (photoUploadInput) photoUploadInput.value = '';
    pendingFilesToUpload = [];
  }

  function resizeAndStripExif(file, maxDimension = 1600) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          let { width, height } = img;
          if (width > maxDimension || height > maxDimension) {
            if (width > height) {
              height = Math.round((height * maxDimension) / width);
              width = maxDimension;
            } else {
              width = Math.round((width * maxDimension) / height);
              height = maxDimension;
            }
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          const outputMime = file.type === 'image/webp' ? 'image/webp' : (file.type === 'image/png' ? 'image/png' : 'image/jpeg');
          const dataUrl = canvas.toDataURL(outputMime, 0.88);
          resolve({ dataUrl, width, height, mime: outputMime });
        };
        img.onerror = () => reject(new Error('Failed to load image for resizing'));
        img.src = e.target.result;
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsDataURL(file);
    });
  }

  async function handlePhotoUploadConfirm() {
    if (!permCheckbox?.checked || !pendingFilesToUpload.length) return;
    permConfirmBtn.disabled = true;
    if (permUploadStatus) permUploadStatus.textContent = 'Resizing & uploading…';

    try {
      for (const f of pendingFilesToUpload) {
        const resized = await resizeAndStripExif(f);
        const resp = await fetch('/api/upload-photo', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            filename: f.name,
            contentType: resized.mime,
            base64Data: resized.dataUrl,
            permissionConfirmed: true
          })
        });
        const data = await resp.json();
        if (!resp.ok) throw new Error(data.error || 'Upload failed');

        photoPickerState.push({
          url: data.url,
          storageId: data.storageId,
          name: data.name,
          isOwnerProvided: true,
          widthPx: resized.width,
          heightPx: resized.height,
          authorAttributions: [],
          role: photoPickerState.filter(p => !p.removed).length === 0 ? 'hero' : 'gallery',
          roomIndex: 0,
          kept: true,
          removed: false
        });
      }

      closePermModal();
      if (noPhotosNote) noPhotosNote.classList.add('hidden');
      renderPhotoAssignment();
      updateVerificationCheckboxes();
    } catch (err) {
      if (permUploadStatus) permUploadStatus.textContent = `Upload error: ${err.message}`;
      if (permConfirmBtn) permConfirmBtn.disabled = false;
    }
  }

  function updateGenerateButtonState() {
    if(!enrichForm) return;
    const bStatus=modalEnriched?.businessStatus||modalPlace?.businessStatus||'OPERATIONAL';
    if(bStatus!=='OPERATIONAL'){modalGenerateBtn.disabled=true;return;}

    // Check bottom verification list
    const allDefChecked=verificationDefs.every(v=>{const el=document.getElementById(v.id);return el&&el.checked;});

    // Check editable fields verified checkboxes
    const nameChecked = !!(vEditName && vEditName.checked);
    const phoneChecked = !!(vEditPhone && vEditPhone.checked);
    const waChecked = !!(vEditWhatsapp && vEditWhatsapp.checked);
    const descChecked = !!(vEditDesc && vEditDesc.checked);
    const hoursNeedCheck = !!(editHours && editHours.value.trim());
    const hoursChecked = !hoursNeedCheck || !!(vEditHours && vEditHours.checked);

    const allEditableChecked = nameChecked && phoneChecked && waChecked && descChecked && hoursChecked;
    modalGenerateBtn.disabled = !(allDefChecked && allEditableChecked);
  }

  function closeModal() {
    enrichModal.classList.add('hidden'); document.body.style.overflow='';
    modalPlace=null; modalEnriched=null; userItems=[]; photoPickerState=[]; roomsState=[]; menuState=[]; bulkParsedItems=[];
    closeLightbox();
  }

  // ── Generate Submit ──
  async function handleGenerateSubmit(e) {
    e.preventDefault();
    if(modalGenerateBtn.disabled) return;
    const place=modalPlace, details=modalEnriched;
    const waRaw=whatsappInput.value.trim().replace(/\D/g,'');
    const whatsappNumber=/^[6-9]\d{9}$/.test(waRaw)?waRaw:null;
    modalGenerateBtn.disabled=true; modalGenerateBtn.querySelector('span').textContent='Generating…';
    try {
      // Build used photos from picker
      const usedPhotos=getUsedPhotos();
      const hasHero=usedPhotos.some(p=>p.role==='hero');
      const finalPhotos=usedPhotos.map((p,i)=>{
        const role = (!hasHero&&i===0)?'hero':p.role;
        if (p.isOwnerProvided && p.url) {
          return {
            url: p.url,
            storageId: p.storageId,
            isOwnerProvided: true,
            name: p.name || 'Owner photo',
            widthPx: p.widthPx || 1600,
            heightPx: p.heightPx || 1200,
            authorAttributions: [],
            role,
            roomIndex: p.roomIndex || 0
          };
        }
        return {
          name: p.name,
          widthPx: p.widthPx,
          heightPx: p.heightPx,
          authorAttributions: p.authorAttributions,
          role,
          roomIndex: p.roomIndex || 0
        };
      });
      const photoAssignments=finalPhotos.reduce((acc,p,idx)=>{acc[idx]={role:p.role,roomIndex:p.roomIndex};return acc;},{});
      const payload={
        name: (editDisplayName?.value?.trim()) || details?.name || place.name,
        type: place.type,
        address: details?.address || place.address,
        phone: (editPhone?.value?.trim()) || details?.phone || place.phone,
        whatsappNumber,
        openingHours: (editHours?.value?.trim()) || details?.openingHours || place.openingHours,
        shortDescription: (editDescription?.value?.trim()) || details?.editorialSummary || null,
        coordinates: details?.location || place.coordinates,
        mapLink: details?.mapLink || place.mapLink,
        enriched: details ? { ...details, photos: finalPhotos } : null,
        photos: finalPhotos,
        placeId: details?.id || place.placeId || place.id || null,
        design: designSelect ? designSelect.value : 'auto',
        photoAssignments,
        rooms: roomsState.filter(r => r.name),
        menu: menuState.filter(m => m.name),
        optionalFields: {
          orderingLink: optOrderingLink?.value?.trim() || null,
          reservationLink: optReservationLink?.value?.trim() || null,
          bookingLink: optBookingLink?.value?.trim() || null,
          instagram: optInstagram?.value?.trim() || null,
          checkInOut: optCheckinOut?.value?.trim() || null,
          houseRules: optHouseRules?.value?.trim() || null
        }
      };
      const resp=await fetch('/api/generate-site',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
      const data=await resp.json();
      if(!resp.ok){
        if(resp.status===400&&data.error&&(data.error.includes('too large')||data.error.includes('limit exceeded')||data.error.includes('size limit'))){if(tokenSizeWarning){tokenSizeWarning.textContent='⚠️ '+data.error;tokenSizeWarning.classList.remove('hidden');}}
        throw new Error(data.error||'Generation failed.');
      }
      closeModal();
      const rowLink=placesTbody.querySelector('[data-preview-link="'+CSS.escape(String(place.id))+'"]');
      if(rowLink){rowLink.href=data.previewUrl;rowLink.classList.remove('hidden');}
      const genBtn=placesTbody.querySelector('[data-place-id="'+CSS.escape(String(place.id))+'"]');
      if(genBtn) genBtn.innerHTML='<span>Regenerate</span>';
      const newWin=window.open(data.previewUrl,'_blank');
      const blocked=!newWin||newWin.closed||typeof newWin.closed==='undefined';
      showPreviewAlert(place.name,data.previewUrl,blocked);
    } catch(err) {
      console.error('[Generate Error]',err);
      modalErrorMsg.textContent=err.message||'Failed to generate website preview.';
      modalError.classList.remove('hidden');
      modalGenerateBtn.disabled=false; modalGenerateBtn.querySelector('span').textContent='Generate Website';
    }
  }

  function showPreviewAlert(name,url,blocked) {
    if(!previewAlert) return;
    previewAlertMessage.textContent=blocked?('Popup was blocked. Preview ready for "'+name+'":'):('Website preview generated for "'+name+'"!');
    previewAlertLink.href=url; previewAlert.classList.remove('hidden');
  }

  function updateSortHeaderIcons() {
    document.querySelectorAll('th.sortable').forEach(th=>{
      const ck=th.getAttribute('data-sort'), icon=th.querySelector('.sort-icon');
      if(ck===sortColumn){icon.textContent=sortDirection==='asc'?'▲':'▼';th.style.color='var(--text-primary)';}
      else{icon.textContent='↕';th.style.color='';}
    });
  }

  async function handleExcelDownload() {
    const rows=getFilteredAndSortedPlaces();
    if(!rows.length) return;
    downloadExcelBtn.disabled=true;
    const origText=downloadExcelBtn.querySelector('span').textContent;
    downloadExcelBtn.querySelector('span').textContent='Exporting…';
    try {
      const resp=await fetch('/api/export',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({rows,location:currentSearchQuery||'places'})});
      if(!resp.ok) throw new Error('Failed to generate Excel file.');
      const cd=resp.headers.get('Content-Disposition');
      let fn='places_'+(currentSearchQuery||'results')+'.xlsx';
      if(cd){const m=cd.match(/filename="?([^"]+)"?/);if(m?.[1]) fn=m[1];}
      const blob=await resp.blob(), url=window.URL.createObjectURL(blob);
      const a=document.createElement('a'); a.href=url; a.download=fn;
      document.body.appendChild(a); a.click(); a.remove(); window.URL.revokeObjectURL(url);
    } catch(err){console.error('[Export Error]',err);alert('Error downloading Excel file: '+err.message);}
    finally{downloadExcelBtn.disabled=false;downloadExcelBtn.querySelector('span').textContent=origText;}
  }

  function escapeHtml(str) {
    if(str===null||str===undefined) return '';
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
  }
});
