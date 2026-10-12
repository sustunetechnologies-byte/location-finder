document.addEventListener('DOMContentLoaded', () => {
  // DOM Elements
  const searchForm = document.getElementById('search-form');
  const locationInput = document.getElementById('location-input');
  const categorySelect = document.getElementById('category-select');
  const searchBtn = document.getElementById('search-btn');
  const searchNoWebsiteBtn = document.getElementById('search-no-website-btn');

  const loadingState = document.getElementById('loading-state');
  const errorState = document.getElementById('error-state');
  const initialState = document.getElementById('initial-state');
  const emptyState = document.getElementById('empty-state');
  const resultsWrapper = document.getElementById('results-wrapper');

  const errorMessage = document.getElementById('error-message');
  const errorTitle = document.getElementById('error-title');
  const summaryLine = document.getElementById('summary-line');
  const cacheBadge = document.getElementById('cache-badge');
  const activeOnlyCheckbox = document.getElementById('active-only-checkbox');
  const downloadExcelBtn = document.getElementById('download-excel-btn');
  const placesTbody = document.getElementById('places-tbody');

  const previewAlert = document.getElementById('preview-alert');
  const previewAlertMessage = document.getElementById('preview-alert-message');
  const previewAlertLink = document.getElementById('preview-alert-link');
  const previewAlertClose = document.getElementById('preview-alert-close');

  // Application State
  let rawPlaces = [];
  let currentSearchQuery = '';
  let currentCategory = 'both';
  let filterMode = 'all'; // 'all' or 'no-website'
  let sortColumn = 'name';
  let sortDirection = 'asc'; // 'asc' or 'desc'

  // Event Listeners
  searchForm.addEventListener('submit', handleSearchSubmit);
  if (searchNoWebsiteBtn) {
    searchNoWebsiteBtn.addEventListener('click', handleSearchNoWebsiteClick);
  }
  activeOnlyCheckbox.addEventListener('change', () => {
    // When manually checking "Show only active websites", reset no-website filter mode
    filterMode = 'all';
    renderTableAndSummary();
  });
  downloadExcelBtn.addEventListener('click', handleExcelDownload);

  if (previewAlertClose) {
    previewAlertClose.addEventListener('click', () => {
      previewAlert.classList.add('hidden');
    });
  }

  // Table Column Header Sort Listeners
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

  // Table Body Event Delegation for "Generate Website" Action
  placesTbody.addEventListener('click', handleTbodyClick);

  // Handle Standard "Search Places" Submit
  async function handleSearchSubmit(e) {
    if (e) e.preventDefault();
    filterMode = 'all';
    await executeSearch();
  }

  // Handle "Search Places (without website)" Button Click
  async function handleSearchNoWebsiteClick() {
    const query = locationInput.value.trim();
    const category = categorySelect.value;

    if (!query) {
      locationInput.focus();
      return;
    }

    filterMode = 'no-website';
    activeOnlyCheckbox.checked = false; // Turn off "active websites" filter

    // If query matches current result set and places already loaded, instantly filter
    if (rawPlaces.length > 0 && query.toLowerCase() === currentSearchQuery.toLowerCase() && category === currentCategory) {
      renderTableAndSummary();
      return;
    }

    await executeSearch();
  }

  // Execute Search API Call
  async function executeSearch() {
    const query = locationInput.value.trim();
    const category = categorySelect.value;

    if (!query) return;

    currentSearchQuery = query;
    currentCategory = category;
    showState('loading');
    setButtonsDisabled(true);

    try {
      const response = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ location: query, category })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch search results.');
      }

      rawPlaces = data.results || [];

      if (data.cached) {
        cacheBadge.classList.remove('hidden');
      } else {
        cacheBadge.classList.add('hidden');
      }

      if (rawPlaces.length === 0) {
        showState('empty');
      } else {
        showState('results');
        renderTableAndSummary();
      }

    } catch (err) {
      console.error('[Client Search Error]', err);
      errorMessage.textContent = err.message || 'An error occurred while fetching location data.';
      showState('error');
    } finally {
      setButtonsDisabled(false);
    }
  }

  function setButtonsDisabled(disabled) {
    searchBtn.disabled = disabled;
    if (searchNoWebsiteBtn) searchNoWebsiteBtn.disabled = disabled;
  }

  // Manage UI States
  function showState(state) {
    loadingState.classList.add('hidden');
    errorState.classList.add('hidden');
    initialState.classList.add('hidden');
    emptyState.classList.add('hidden');
    resultsWrapper.classList.add('hidden');

    if (state === 'loading') loadingState.classList.remove('hidden');
    else if (state === 'error') errorState.classList.remove('hidden');
    else if (state === 'initial') initialState.classList.remove('hidden');
    else if (state === 'empty') emptyState.classList.remove('hidden');
    else if (state === 'results') resultsWrapper.classList.remove('hidden');
  }

  // Sort and Filter Data
  function getFilteredAndSortedPlaces() {
    let filtered = [...rawPlaces];

    // Feature 1: Filter to places without active website (Not listed or Inactive)
    if (filterMode === 'no-website') {
      filtered = filtered.filter(p => p.websiteStatus === 'Not listed' || p.websiteStatus === 'Inactive');
    } else if (activeOnlyCheckbox.checked) {
      // Checkbox filter: Show only active websites
      filtered = filtered.filter(p => p.websiteStatus === 'Active' || p.websiteStatus === 'Active (restricted)');
    }

    // Sorting
    filtered.sort((a, b) => {
      let valA = (a[sortColumn] || '').toString().toLowerCase();
      let valB = (b[sortColumn] || '').toString().toLowerCase();

      if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
      if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    return filtered;
  }

  // Render Table & Summary Line
  function renderTableAndSummary() {
    const displayedPlaces = getFilteredAndSortedPlaces();

    // Summary Line Statistics
    const totalCount = displayedPlaces.length;
    const phoneCount = displayedPlaces.filter(p => p.phone && p.phone !== 'Not available').length;
    const websiteCount = displayedPlaces.filter(p => p.website && p.website !== 'Not available').length;

    if (filterMode === 'no-website') {
      // Feature 1 Requirement: "12 of 19 places have no active website"
      summaryLine.textContent = `${totalCount} of ${rawPlaces.length} places have no active website`;
    } else if (activeOnlyCheckbox.checked) {
      summaryLine.textContent = `${totalCount} active website places found: ${phoneCount} with phone, ${websiteCount} with website`;
    } else {
      summaryLine.textContent = `${totalCount} places found: ${phoneCount} with phone, ${websiteCount} with website`;
    }

    // Enable/Disable Download Button
    downloadExcelBtn.disabled = totalCount === 0;

    // Render Table Rows
    placesTbody.innerHTML = '';

    if (totalCount === 0) {
      placesTbody.innerHTML = `
        <tr>
          <td colspan="9" style="text-align: center; padding: 2.5rem 1rem; color: var(--text-muted);">
            No places match the selected filter.
          </td>
        </tr>
      `;
      return;
    }

    displayedPlaces.forEach(place => {
      const tr = document.createElement('tr');

      // Type Badge
      const typeBadgeClass = place.type === 'Stay' ? 'badge-stay' : 'badge-restaurant';
      const typeBadge = `<span class="badge ${typeBadgeClass}">${escapeHtml(place.type)}</span>`;

      // Website Status Badge
      let statusBadgeClass = 'status-none';
      if (place.websiteStatus === 'Active') statusBadgeClass = 'status-active';
      else if (place.websiteStatus === 'Active (restricted)') statusBadgeClass = 'status-restricted';
      else if (place.websiteStatus === 'Inactive') statusBadgeClass = 'status-inactive';

      const statusBadge = `<span class="badge ${statusBadgeClass}">${escapeHtml(place.websiteStatus)}</span>`;

      // Website Link
      let websiteCellContent = '<span class="text-muted-cell">Not available</span>';
      if (place.website && place.website !== 'Not available') {
        websiteCellContent = `<a href="${escapeHtml(place.website)}" target="_blank" rel="noopener noreferrer" class="table-link">
          ${escapeHtml(place.website)}
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
        </a>`;
      }

      // Map Link
      let mapCellContent = '<span class="text-muted-cell">Not available</span>';
      if (place.mapLink && place.mapLink !== 'Not available') {
        mapCellContent = `<a href="${escapeHtml(place.mapLink)}" target="_blank" rel="noopener noreferrer" class="table-link">
          Google Maps
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
        </a>`;
      }

      // Phone Cell
      const phoneContent = place.phone && place.phone !== 'Not available' 
        ? escapeHtml(place.phone) 
        : '<span class="text-muted-cell">Not available</span>';

      // Opening Hours Cell
      const hoursContent = place.openingHours && place.openingHours !== 'Not available' 
        ? escapeHtml(place.openingHours) 
        : '<span class="text-muted-cell">Not available</span>';

      // Feature 2: Action Cell (Generate Website or Has website badge)
      const hasActiveWebsite = place.websiteStatus === 'Active' || place.websiteStatus === 'Active (restricted)';
      let actionCellContent = '';

      if (hasActiveWebsite) {
        actionCellContent = `<span class="badge badge-has-website">Has website</span>`;
      } else {
        actionCellContent = `
          <div class="action-cell-container">
            <button type="button" class="btn-action-generate" data-place-id="${escapeHtml(place.id)}">
              <span>Generate Website</span>
            </button>
            <a href="#" target="_blank" rel="noopener noreferrer" class="preview-row-link hidden" data-preview-link="${escapeHtml(place.id)}">
              Open Preview ↗
            </a>
          </div>
        `;
      }

      tr.innerHTML = `
        <td><strong>${escapeHtml(place.name)}</strong></td>
        <td>${typeBadge}</td>
        <td>${escapeHtml(place.address)}</td>
        <td>${phoneContent}</td>
        <td>${websiteCellContent}</td>
        <td>${statusBadge}</td>
        <td>${hoursContent}</td>
        <td>${mapCellContent}</td>
        <td>${actionCellContent}</td>
      `;

      placesTbody.appendChild(tr);
    });
  }

  // Handle "Generate Website" Button Click
  async function handleTbodyClick(e) {
    const btn = e.target.closest('.btn-action-generate');
    if (!btn) return;

    const placeId = btn.getAttribute('data-place-id');
    const place = rawPlaces.find(p => String(p.id) === String(placeId));
    if (!place) return;

    // Loading State
    btn.disabled = true;
    const originalHtml = btn.innerHTML;
    btn.innerHTML = `<span class="btn-spinner"></span> <span>Generating...</span>`;

    try {
      const response = await fetch('/api/generate-site', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: place.name,
          type: place.type,
          address: place.address,
          phone: place.phone,
          openingHours: place.openingHours,
          coordinates: place.coordinates,
          mapLink: place.mapLink
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to generate website preview.');
      }

      // Reveal preview link in the table row
      const actionContainer = btn.closest('.action-cell-container');
      const rowLink = actionContainer ? actionContainer.querySelector('[data-preview-link]') : null;
      if (rowLink) {
        rowLink.href = data.previewUrl;
        rowLink.classList.remove('hidden');
      }

      // Open preview in new tab
      const newWindow = window.open(data.previewUrl, '_blank');
      const popupBlocked = !newWindow || newWindow.closed || typeof newWindow.closed === 'undefined';

      // Show alert banner on page in case popup is blocked or for easy access
      showPreviewAlert(place.name, data.previewUrl, popupBlocked);

      btn.disabled = false;
      btn.innerHTML = `<span>Regenerate</span>`;

    } catch (err) {
      console.error('[Generate Preview Error]', err);
      alert('Error generating preview: ' + err.message);
      btn.disabled = false;
      btn.innerHTML = originalHtml;
    }
  }

  // Display Preview Alert Banner
  function showPreviewAlert(placeName, previewUrl, popupBlocked) {
    if (!previewAlert) return;
    previewAlertMessage.textContent = popupBlocked
      ? `Popup was blocked. Preview ready for "${placeName}":`
      : `Website preview generated for "${placeName}"!`;
    previewAlertLink.href = previewUrl;
    previewAlert.classList.remove('hidden');
  }

  // Handle Header Sort Icons
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

  // Handle Excel Download (exports exactly the currently displayed rows)
  async function handleExcelDownload() {
    const displayedRows = getFilteredAndSortedPlaces();
    if (displayedRows.length === 0) return;

    downloadExcelBtn.disabled = true;
    const origText = downloadExcelBtn.querySelector('span').textContent;
    downloadExcelBtn.querySelector('span').textContent = 'Exporting...';

    try {
      const response = await fetch('/api/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rows: displayedRows,
          location: currentSearchQuery || 'places'
        })
      });

      if (!response.ok) {
        throw new Error('Failed to generate Excel file.');
      }

      // Extract filename from header or fallback
      const contentDisposition = response.headers.get('Content-Disposition');
      let filename = `places_${currentSearchQuery || 'results'}.xlsx`;
      if (contentDisposition) {
        const match = contentDisposition.match(/filename="?([^"]+)"?/);
        if (match && match[1]) filename = match[1];
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

  // Utility HTML Escape
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
