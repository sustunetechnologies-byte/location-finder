document.addEventListener('DOMContentLoaded', () => {
  // DOM Elements
  const searchForm = document.getElementById('search-form');
  const locationInput = document.getElementById('location-input');
  const categorySelect = document.getElementById('category-select');
  const searchBtn = document.getElementById('search-btn');

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

  // Application State
  let rawPlaces = [];
  let currentSearchQuery = '';
  let sortColumn = 'name';
  let sortDirection = 'asc'; // 'asc' or 'desc'

  // Event Listeners
  searchForm.addEventListener('submit', handleSearchSubmit);
  activeOnlyCheckbox.addEventListener('change', renderTableAndSummary);
  downloadExcelBtn.addEventListener('click', handleExcelDownload);

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

  // Handle Search Submission
  async function handleSearchSubmit(e) {
    e.preventDefault();
    const query = locationInput.value.trim();
    const category = categorySelect.value;

    if (!query) return;

    currentSearchQuery = query;
    showState('loading');
    searchBtn.disabled = true;

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
      searchBtn.disabled = false;
    }
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

    // Filter checkbox: Show only active websites
    if (activeOnlyCheckbox.checked) {
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

    // Calculate Summary Statistics
    const totalCount = displayedPlaces.length;
    const phoneCount = displayedPlaces.filter(p => p.phone && p.phone !== 'Not available').length;
    const websiteCount = displayedPlaces.filter(p => p.website && p.website !== 'Not available').length;

    if (activeOnlyCheckbox.checked) {
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
          <td colspan="8" style="text-align: center; padding: 2rem; color: var(--text-muted);">
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

      tr.innerHTML = `
        <td><strong>${escapeHtml(place.name)}</strong></td>
        <td>${typeBadge}</td>
        <td>${escapeHtml(place.address)}</td>
        <td>${phoneContent}</td>
        <td>${websiteCellContent}</td>
        <td>${statusBadge}</td>
        <td>${hoursContent}</td>
        <td>${mapCellContent}</td>
      `;

      placesTbody.appendChild(tr);
    });
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

  // Handle Excel Download
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
