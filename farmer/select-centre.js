/* QueueKisan — Select Centre Logic */

const DEFAULT_CENTRES = [
  {
    id: 'cntr-pune-apmc',
    name: 'Pune Main APMC Market Yard',
    location: 'Gultekdi, Pune, Maharashtra',
    distance: '3.2 km away',
    status: 'open',
    crowdLevel: 'Moderate',
    availableSlots: 18,
  },
  {
    id: 'cntr-baramati-apmc',
    name: 'Baramati APMC Sub-Centre',
    location: 'MIDC Road, Baramati, Pune',
    distance: '8.5 km away',
    status: 'open',
    crowdLevel: 'Low',
    availableSlots: 24,
  },
  {
    id: 'cntr-nashik-apmc',
    name: 'Nashik Agriculture Grain Yard',
    location: 'Dindori Road, Nashik',
    distance: '12.0 km away',
    status: 'open',
    crowdLevel: 'Moderate',
    availableSlots: 14,
  },
  {
    id: 'cntr-kolhapur-apmc',
    name: 'Kolhapur Shahu Market Yard',
    location: 'Laxmipuri, Kolhapur',
    distance: '15.4 km away',
    status: 'open',
    crowdLevel: 'Low',
    availableSlots: 20,
  },
]

let CENTRES = [...DEFAULT_CENTRES]
let selectedCentreId = null

document.addEventListener('DOMContentLoaded', async () => {
  // Check if previously selected
  const storedCentreStr = sessionStorage.getItem('booking_centre')
  if (storedCentreStr) {
    try {
      const stored = JSON.parse(storedCentreStr)
      if (stored?.id) selectedCentreId = stored.id
    } catch {
      // Ignore
    }
  }

  try {
    const rows = await window.KrushiAPI.getCentres()
    if (Array.isArray(rows) && rows.length > 0) {
      CENTRES = rows.map((c) => ({
        id: c.id,
        name: c.name,
        location: c.location || '',
        distance: 'Available',
        status: c.status === 'closed' ? 'closed' : 'open',
        crowdLevel: c.crowdLevel || 'Low',
        availableSlots: c.availableSlots ?? 15,
      }))
    }
  } catch (e) {
    console.warn('[SelectCentre] Using default centres:', e)
  }

  renderCentres(CENTRES)
  setupSearch()
  updateBottomBar()

  document.getElementById('backBtn').addEventListener('click', () => {
    window.location.href = 'select-crop.html'
  })

  document.getElementById('continueBtn').addEventListener('click', (e) => {
    if (e.currentTarget.classList.contains('disabled') || e.currentTarget.disabled) return
    const centre = CENTRES.find((c) => c.id === selectedCentreId)
    if (!centre) return
    sessionStorage.setItem('booking_centre', JSON.stringify(centre))
    window.location.href = 'book-slot.html'
  })

  window.addEventListener('languageChanged', () => {
    const searchTerm = (document.getElementById('centreSearch')?.value || '').toLowerCase()
    filterAndRender(searchTerm)
    updateBottomBar()
  })
})

function renderCentres(centres) {
  const list = document.getElementById('centreList')
  const emptyState = document.getElementById('emptyState')
  if (!list) return
  list.innerHTML = ''

  if (!centres || centres.length === 0) {
    list.style.display = 'none'
    if (emptyState) emptyState.style.display = 'block'
    return
  }

  list.style.display = 'flex'
  if (emptyState) emptyState.style.display = 'none'

  const viewDetailsText = window.t ? window.t('common.view', 'View Details') : 'View Details'

  centres.forEach((centre) => {
    const isClosed = centre.status === 'closed'
    const isSelected = selectedCentreId === centre.id
    const card = document.createElement('div')
    card.className = `sc-centre-card ${isClosed ? 'disabled' : ''} ${isSelected ? 'selected' : ''}`

    card.innerHTML = `
      <div class="sc-card-header">
        <div class="sc-card-title-group">
          <span class="sc-centre-name">${centre.name}</span>
          <div class="sc-centre-location">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
            ${centre.location}
          </div>
        </div>
        <div class="sc-status-badge ${centre.status}">${centre.status}</div>
      </div>
      <div class="sc-centre-distance">${centre.distance}</div>
      <div class="sc-card-info-grid">
        <div class="sc-info-item">
          <div class="sc-info-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg></div>
          <div class="sc-info-text">
            <span class="sc-info-label">Crowd</span>
            <span class="sc-info-val">${centre.crowdLevel}</span>
          </div>
        </div>
        <div class="sc-info-item">
          <div class="sc-info-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg></div>
          <div class="sc-info-text">
            <span class="sc-info-label">Open slots</span>
            <span class="sc-info-val">${centre.availableSlots}</span>
          </div>
        </div>
      </div>
      <div class="sc-card-actions">
        <button class="sc-view-details-btn" onclick="event.stopPropagation(); alert('${centre.name}\\n${centre.location}');">${viewDetailsText}</button>
      </div>
    `

    if (!isClosed) card.addEventListener('click', () => selectCentre(centre.id))
    list.appendChild(card)
  })
}

function selectCentre(id) {
  selectedCentreId = id
  const searchTerm = (document.getElementById('centreSearch')?.value || '').toLowerCase()
  filterAndRender(searchTerm)
  updateBottomBar()
}

function updateBottomBar() {
  const infoEl = document.getElementById('selectedInfo')
  const btn = document.getElementById('continueBtn')
  const selectedCentre = CENTRES.find((c) => c.id === selectedCentreId)

  if (selectedCentre) {
    const selectedLabel = window.t ? window.t('centre.selectedCentre', 'Selected Centre:') : 'Selected Centre:'
    infoEl.innerHTML = `<span class="sc-selected-label">${selectedLabel}</span><span class="sc-selected-val">${selectedCentre.name}</span>`
    btn.classList.remove('disabled')
    btn.removeAttribute('disabled')
  } else {
    const noCentreLabel = window.t ? window.t('centre.noCentreSelected', 'No centre selected') : 'No centre selected'
    infoEl.innerHTML = `<span class="sc-selected-label">${noCentreLabel}</span>`
    btn.classList.add('disabled')
    btn.setAttribute('disabled', 'disabled')
  }
}

function setupSearch() {
  const searchInput = document.getElementById('centreSearch')
  if (searchInput) {
    searchInput.addEventListener('input', (e) => filterAndRender(e.target.value.toLowerCase()))
  }
}

function filterAndRender(searchTerm) {
  const filtered = CENTRES.filter((centre) => centre.name.toLowerCase().includes(searchTerm) || centre.location.toLowerCase().includes(searchTerm))
  renderCentres(filtered)
}
