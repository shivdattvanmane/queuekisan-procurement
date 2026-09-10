/**
 * QueueKisan — Select Crop Logic
 */

const DEFAULT_CROPS = [
  { id: 'crop-wheat', name: 'Wheat (गहू)', category: 'grains', icon: '🌾', available: true },
  { id: 'crop-rice', name: 'Rice / Paddy (भात)', category: 'grains', icon: '🌾', available: true },
  { id: 'crop-cotton', name: 'Cotton (कापूस)', category: 'grains', icon: '☁️', available: true },
  { id: 'crop-soybean', name: 'Soybean (सोयाबीन)', category: 'oilseeds', icon: '🌱', available: true },
  { id: 'crop-maize', name: 'Maize (मका)', category: 'grains', icon: '🌽', available: true },
  { id: 'crop-gram', name: 'Gram / Chana (हरभरा)', category: 'pulses', icon: '🫘', available: true },
  { id: 'crop-tur', name: 'Tur / Arhar (तूर)', category: 'pulses', icon: '🫘', available: true },
  { id: 'crop-moong', name: 'Moong (मूग)', category: 'pulses', icon: '🫘', available: true },
  { id: 'crop-urad', name: 'Urad (उडीद)', category: 'pulses', icon: '🫘', available: true },
  { id: 'crop-mustard', name: 'Mustard (मोहरी)', category: 'oilseeds', icon: '🌻', available: true },
  { id: 'crop-groundnut', name: 'Groundnut (भुईमूग)', category: 'oilseeds', icon: '🥜', available: true },
  { id: 'crop-sugarcane', name: 'Sugarcane (ऊस)', category: 'grains', icon: '🎋', available: true },
  { id: 'crop-onion', name: 'Onion (कांदा)', category: 'vegetables', icon: '🧅', available: true },
  { id: 'crop-tomato', name: 'Tomato (टोमॅटो)', category: 'vegetables', icon: '🍅', available: true },
  { id: 'crop-bajra', name: 'Bajra (बाजरी)', category: 'grains', icon: '🌾', available: true },
  { id: 'crop-jowar', name: 'Jowar (ज्वारी)', category: 'grains', icon: '🌾', available: true },
  { id: 'crop-grapes', name: 'Grapes (द्राक्षे)', category: 'fruits', icon: '🍇', available: true },
  { id: 'crop-pomegranate', name: 'Pomegranate (डाळिंब)', category: 'fruits', icon: '🍎', available: true },
  { id: 'crop-chilli', name: 'Chilli (मिरची)', category: 'spices', icon: '🌶️', available: true },
  { id: 'crop-turmeric', name: 'Turmeric (हळद)', category: 'spices', icon: '🌿', available: true },
];

let CROPS = [...DEFAULT_CROPS];

const CROP_ICONS = {
  wheat: '🌾', rice: '🌾', paddy: '🌾', maize: '🌽', onion: '🧅', tomato: '🍅',
  soybean: '🌱', sugarcane: '🎋', grapes: '🍇', pomegranate: '🍎', bajra: '🌾',
  jowar: '🌾', cotton: '☁️', gram: '🫘', chana: '🫘', tur: '🫘', moong: '🫘',
  urad: '🫘', mustard: '🌻', groundnut: '🥜', chilli: '🌶️', turmeric: '🌿',
};

function iconForCrop(name) {
  const key = Object.keys(CROP_ICONS).find((k) => String(name || '').toLowerCase().includes(k));
  return key ? CROP_ICONS[key] : '🌱';
}

function categoryForCrop(name) {
  const n = String(name || '').toLowerCase();
  if (n.includes('wheat') || n.includes('rice') || n.includes('paddy') || n.includes('maize') || n.includes('bajra') || n.includes('jowar') || n.includes('sugarcane') || n.includes('cotton')) return 'grains';
  if (n.includes('gram') || n.includes('chana') || n.includes('tur') || n.includes('moong') || n.includes('urad')) return 'pulses';
  if (n.includes('soybean') || n.includes('mustard') || n.includes('groundnut')) return 'oilseeds';
  if (n.includes('onion') || n.includes('tomato')) return 'vegetables';
  if (n.includes('grapes') || n.includes('pomegranate')) return 'fruits';
  if (n.includes('chilli') || n.includes('turmeric')) return 'spices';
  return 'grains';
}

let selectedCropId = null;
let selectedCustomCrop = null;

document.addEventListener('DOMContentLoaded', async () => {
  // Check if previously selected in this session
  const storedCropStr = sessionStorage.getItem('booking_crop');
  if (storedCropStr) {
    try {
      const stored = JSON.parse(storedCropStr);
      if (stored.isCustom) {
        selectedCustomCrop = stored;
      } else if (stored.id) {
        selectedCropId = stored.id;
      }
    } catch {
      // Ignore parse error
    }
  }

  try {
    const rows = await window.KrushiAPI.getCrops();
    if (Array.isArray(rows) && rows.length > 0) {
      CROPS = rows.map((c) => ({
        id: c.id,
        name: c.name,
        category: categoryForCrop(c.name),
        icon: c.icon || iconForCrop(c.name),
        available: true
      }));
    }
  } catch (e) {
    console.warn('[SelectCrop] Using default curated crops:', e);
  }

  renderCropsWithOther(CROPS);
  setupFilters();
  setupSearch();
  setupModal();
  updateBottomBar();

  document.getElementById('backBtn').addEventListener('click', () => {
    window.location.href = 'index.html';
  });

  document.getElementById('continueBtn').addEventListener('click', (e) => {
    if (e.currentTarget.classList.contains('disabled') || e.currentTarget.disabled) return;
    
    let cropToSave;
    if (selectedCustomCrop) {
      cropToSave = selectedCustomCrop;
    } else {
      cropToSave = CROPS.find(c => c.id === selectedCropId);
    }
    if (!cropToSave) return;
    sessionStorage.setItem('booking_crop', JSON.stringify(cropToSave));
    window.location.href = 'select-centre.html';
  });

  window.addEventListener('languageChanged', () => {
    const activeChip = document.querySelector('.sc-cat-chip.active');
    const activeCategory = activeChip ? activeChip.dataset.category : 'all';
    const searchTerm = (document.getElementById('cropSearch')?.value || '').toLowerCase();
    filterAndRender(activeCategory, searchTerm);
    updateBottomBar();
  });
});

function setupModal() {
  const modal = document.getElementById('otherCropModal');
  const closeBtn = document.getElementById('modalCloseBtn');
  const input = document.getElementById('customCropInput');
  const continueBtn = document.getElementById('modalContinueBtn');

  closeBtn.addEventListener('click', () => {
    modal.style.display = 'none';
  });

  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.style.display = 'none';
    }
  });

  input.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      continueBtn.click();
    }
  });

  continueBtn.addEventListener('click', () => {
    const cropName = input.value.trim();
    if (!cropName) {
      input.focus();
      return;
    }

    selectedCustomCrop = {
      id: `custom-${Date.now()}`,
      name: cropName,
      category: 'custom',
      icon: '🌱',
      available: true,
      isCustom: true
    };

    selectedCropId = null;
    modal.style.display = 'none';
    input.value = '';
    
    const activeCategory = document.querySelector('.sc-cat-chip.active')?.dataset.category || 'all';
    const searchTerm = (document.getElementById('cropSearch')?.value || '').toLowerCase();
    filterAndRender(activeCategory, searchTerm);
    updateBottomBar();
  });
}

function showOtherCropModal() {
  const modal = document.getElementById('otherCropModal');
  const input = document.getElementById('customCropInput');
  modal.style.display = 'flex';
  input.focus();
}

function renderCrops(crops) {
  const grid = document.getElementById('cropGrid');
  const emptyState = document.getElementById('emptyState');
  
  grid.innerHTML = '';

  if (crops.length === 0) {
    grid.style.display = 'none';
    emptyState.style.display = 'block';
    return;
  }

  grid.style.display = 'grid';
  emptyState.style.display = 'none';

  const availText = window.t ? window.t('status.available', 'Available') : 'Available';
  const fullText = window.t ? window.t('status.currentlyFull', 'Currently Full') : 'Currently Full';

  crops.forEach(crop => {
    const isSelected = selectedCropId === crop.id;
    const card = document.createElement('div');
    card.className = `sc-crop-card ${crop.available ? '' : 'disabled'} ${isSelected ? 'selected' : ''}`;
    
    card.innerHTML = `
      <div class="sc-crop-icon-wrap">
        <span class="sc-crop-icon">${crop.icon}</span>
      </div>
      <div class="sc-crop-info">
        <div class="sc-crop-name">${crop.name}</div>
        <div class="sc-crop-avail">${crop.available ? availText : fullText}</div>
      </div>
    `;

    if (crop.available) {
      card.addEventListener('click', () => selectCrop(crop.id));
    }

    grid.appendChild(card);
  });
}

function renderCropsWithOther(crops) {
  renderCrops(crops);
  addOtherCropCard();
}

function addOtherCropCard() {
  const grid = document.getElementById('cropGrid');
  const card = document.createElement('div');
  const isSelected = Boolean(selectedCustomCrop);
  card.className = `sc-crop-card ${isSelected ? 'selected' : ''}`;
  
  const otherCropText = selectedCustomCrop ? selectedCustomCrop.name : (window.t ? window.t('crop.otherCrop', 'Other Crop') : 'Other Crop');
  const customEntryText = selectedCustomCrop ? 'Selected' : (window.t ? window.t('status.customEntry', 'Custom Entry') : 'Custom Entry');

  card.innerHTML = `
    <div class="sc-crop-icon-wrap">
      <span class="sc-crop-icon">✏️</span>
    </div>
    <div class="sc-crop-info">
      <div class="sc-crop-name">${otherCropText}</div>
      <div class="sc-crop-avail">${customEntryText}</div>
    </div>
  `;

  card.addEventListener('click', () => {
    showOtherCropModal();
  });

  grid.appendChild(card);
}

function selectCrop(id) {
  selectedCropId = id;
  selectedCustomCrop = null;
  
  const activeCategory = document.querySelector('.sc-cat-chip.active')?.dataset.category || 'all';
  const searchTerm = (document.getElementById('cropSearch')?.value || '').toLowerCase();
  
  filterAndRender(activeCategory, searchTerm);
  updateBottomBar();
}

function updateBottomBar() {
  const infoEl = document.getElementById('selectedInfo');
  const btn = document.getElementById('continueBtn');
  let selectedCrop = null;

  if (selectedCustomCrop) {
    selectedCrop = selectedCustomCrop;
  } else if (selectedCropId) {
    selectedCrop = CROPS.find(c => c.id === selectedCropId);
  }

  const selectedLabelText = window.t ? window.t('crop.selectedCrop', 'Selected Crop:') : 'Selected Crop:';
  const noCropText = window.t ? window.t('crop.noCropSelected', 'No crop selected') : 'No crop selected';

  if (selectedCrop) {
    infoEl.innerHTML = `
      <span class="sc-selected-label">${selectedLabelText}</span>
      <span class="sc-selected-val">${selectedCrop.icon} ${selectedCrop.name}</span>
    `;
    btn.classList.remove('disabled');
    btn.removeAttribute('disabled');
  } else {
    infoEl.innerHTML = `<span class="sc-selected-label">${noCropText}</span>`;
    btn.classList.add('disabled');
    btn.setAttribute('disabled', 'disabled');
  }
}

function setupFilters() {
  const chips = document.querySelectorAll('.sc-cat-chip');
  chips.forEach(chip => {
    chip.addEventListener('click', (e) => {
      chips.forEach(c => c.classList.remove('active'));
      e.currentTarget.classList.add('active');
      
      const category = e.currentTarget.dataset.category;
      const searchTerm = (document.getElementById('cropSearch')?.value || '').toLowerCase();
      
      filterAndRender(category, searchTerm);
    });
  });
}

function setupSearch() {
  const searchInput = document.getElementById('cropSearch');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      const searchTerm = e.target.value.toLowerCase();
      const activeCategory = document.querySelector('.sc-cat-chip.active')?.dataset.category || 'all';
      filterAndRender(activeCategory, searchTerm);
    });
  }
}

function filterAndRender(category, searchTerm) {
  const filtered = CROPS.filter(crop => {
    const matchCat = category === 'all' || crop.category === category;
    const matchSearch = crop.name.toLowerCase().includes(searchTerm);
    return matchCat && matchSearch;
  });
  renderCropsWithOther(filtered);
}
