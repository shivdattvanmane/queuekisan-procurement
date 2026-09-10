/**
 * KrushiDarpan — Language Manager (QueueKisan Farmer i18n)
 */

const LanguageManager = (() => {
  const STORAGE_KEY = 'krushi_language';
  const DEFAULT_LANGUAGE = 'en';
  const SUPPORTED_LANGUAGES = {
    en: 'English',
    mr: 'मराठी',
    hi: 'हिंदी'
  };

  let currentLanguage = DEFAULT_LANGUAGE;
  let changeCallbacks = [];

  function getTranslationsFor(lang) {
    if (lang === 'mr' && typeof translations_mr !== 'undefined') return translations_mr;
    if (lang === 'hi' && typeof translations_hi !== 'undefined') return translations_hi;
    return typeof translations_en !== 'undefined' ? translations_en : {};
  }

  function init() {
    const saved = localStorage.getItem(STORAGE_KEY);
    const user = getStoredFarmerUser();
    const userLanguage = saved || user?.language || (navigator.language?.startsWith('mr') ? 'mr' :
                                                     navigator.language?.startsWith('hi') ? 'hi' :
                                                     DEFAULT_LANGUAGE);
    setLanguage(userLanguage, false);
    setupLanguageSelectors();
    applyTranslations();
  }

  function getStoredFarmerUser() {
    try {
      const data = localStorage.getItem('krushi_user');
      return data ? JSON.parse(data) : null;
    } catch {
      return null;
    }
  }

  function getCurrentLanguage() {
    return currentLanguage;
  }

  function setLanguage(langCode, shouldDispatch = true) {
    if (!SUPPORTED_LANGUAGES[langCode]) {
      langCode = DEFAULT_LANGUAGE;
    }

    currentLanguage = langCode;
    localStorage.setItem(STORAGE_KEY, langCode);
    updateFarmerLanguage(langCode);

    document.documentElement.lang = langCode;
    document.documentElement.setAttribute('data-lang', langCode);

    applyTranslations();
    updateAllSwitcherDisplays();

    if (shouldDispatch) {
      changeCallbacks.forEach(cb => {
        try { cb(langCode); } catch (err) { console.error(err); }
      });
      window.dispatchEvent(new CustomEvent('languageChanged', { detail: { language: langCode } }));
    }
  }

  function t(key, fallback = null) {
    if (!key) return '';
    const currentTranslations = getTranslationsFor(currentLanguage);
    const translation = currentTranslations[key];
    if (translation !== undefined) return translation;

    const enTranslations = typeof translations_en !== 'undefined' ? translations_en : {};
    if (enTranslations[key] !== undefined) return enTranslations[key];

    return fallback !== null ? fallback : key;
  }

  function getAll() {
    return getTranslationsFor(currentLanguage);
  }

  function getSupportedLanguages() {
    return SUPPORTED_LANGUAGES;
  }

  function onLanguageChange(callback) {
    if (typeof callback === 'function') {
      changeCallbacks.push(callback);
    }
  }

  function updateFarmerLanguage(langCode) {
    try {
      const userData = localStorage.getItem('krushi_user');
      if (userData) {
        const user = JSON.parse(userData);
        user.language = langCode;
        localStorage.setItem('krushi_user', JSON.stringify(user));
      }
    } catch (e) {}
  }

  function getFarmerLanguage() {
    const user = getStoredFarmerUser();
    return user?.language || currentLanguage || DEFAULT_LANGUAGE;
  }

  function applyTranslations() {
    // 1. Explicit data-i18n
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      if (!key) return;
      const attr = el.getAttribute('data-i18n-attr');
      const translated = t(key);

      if (attr) {
        el.setAttribute(attr, translated);
      } else if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
        el.placeholder = translated;
      } else {
        const textTarget = el.querySelector('.i18n-text, .btn-text') || el;
        if (textTarget === el && el.children.length === 0) {
          el.textContent = translated;
        } else if (textTarget !== el) {
          textTarget.textContent = translated;
        } else {
          let foundTextNode = false;
          for (let node of el.childNodes) {
            if (node.nodeType === Node.TEXT_NODE && node.nodeValue.trim()) {
              node.nodeValue = ` ${translated} `;
              foundTextNode = true;
              break;
            }
          }
          if (!foundTextNode) {
            el.textContent = translated;
          }
        }
      }
    });

    // 2. Form labels
    document.querySelectorAll('[data-i18n-label]').forEach(el => {
      const key = el.getAttribute('data-i18n-label');
      if (!key) return;
      const translated = t(key);
      const label = el.querySelector('label') || el;
      if (label) label.textContent = translated;
    });

    // 3. Placeholders
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
      const key = el.getAttribute('data-i18n-placeholder');
      if (!key) return;
      el.placeholder = t(key);
    });

    // 4. Titles
    document.querySelectorAll('[data-i18n-title]').forEach(el => {
      const key = el.getAttribute('data-i18n-title');
      if (key) el.title = t(key);
    });

    // 5. Bottom nav labels
    const navKeyMap = {
      'index.html': 'nav.home',
      'history.html': 'nav.history',
      'token-generated.html': 'nav.scan',
      'notifications.html': 'nav.alerts',
      'profile.html': 'nav.profile',
    };
    document.querySelectorAll('.bottom-nav .bnav-item').forEach(item => {
      const href = item.getAttribute('href') || '';
      const span = item.querySelector('span');
      if (!span) return;
      const key = span.getAttribute('data-i18n') || navKeyMap[href];
      if (key) {
        span.setAttribute('data-i18n', key);
        span.textContent = t(key);
      }
    });
  }

  function updateAllSwitcherDisplays() {
    // 1. Profile / in-page buttons
    document.querySelectorAll('.lang-switcher-btn').forEach(btn => {
      const btnLang = btn.getAttribute('data-lang');
      if (btnLang === currentLanguage) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    // 2. Header and floating selector labels
    document.querySelectorAll('.header-lang-current, #langSelectorText, .lang-current-label').forEach(label => {
      label.textContent = SUPPORTED_LANGUAGES[currentLanguage] || 'English';
    });

    // 3. Dropdown option active states
    document.querySelectorAll('.lang-option-btn, .lang-option').forEach(opt => {
      const optLang = opt.getAttribute('data-lang');
      if (optLang === currentLanguage) {
        opt.classList.add('active');
      } else {
        opt.classList.remove('active');
      }
    });
  }

  function setupLanguageSelectors() {
    // A. Bind existing static language selectors (e.g. on login/register pages)
    const staticBtn = document.getElementById('langSelectorBtn');
    const staticMenu = document.getElementById('langSelectorMenu');
    if (staticBtn && staticMenu) {
      staticBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const isHidden = staticMenu.style.display === 'none' || !staticMenu.style.display;
        staticMenu.style.display = isHidden ? 'block' : 'none';
      });

      staticMenu.querySelectorAll('.lang-option').forEach(opt => {
        opt.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          const lang = opt.getAttribute('data-lang');
          if (lang) {
            setLanguage(lang);
          }
          staticMenu.style.display = 'none';
        });
      });
    }

    // B. Bind profile language switcher options if present
    document.querySelectorAll('.lang-switcher-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const lang = btn.getAttribute('data-lang');
        if (lang) {
          setLanguage(lang);
        }
      });
    });

    // C. Inject header dropdown on pages that have headers/topbars
    injectHeaderLangSelector();

    // D. Global click listener to close all menus
    document.addEventListener('click', (e) => {
      if (staticMenu && !e.target.closest('.lang-selector-container')) {
        staticMenu.style.display = 'none';
      }
      document.querySelectorAll('.header-lang-menu').forEach(menu => {
        if (!e.target.closest('.header-lang-selector')) {
          menu.style.display = 'none';
        }
      });
    });
  }

  function injectHeaderLangSelector() {
    if (document.querySelector('.header-lang-selector') || document.querySelector('.lang-selector-container')) {
      return;
    }

    const header = document.querySelector('.home-header') ||
                   document.querySelector('.sc-topbar') ||
                   document.querySelector('.profile-topbar') ||
                   document.querySelector('.nf-topbar') ||
                   document.querySelector('.checkin-topbar') ||
                   document.querySelector('header');

    if (!header) return;

    const wrapper = document.createElement('div');
    wrapper.className = 'header-lang-selector';
    wrapper.innerHTML = `
      <button type="button" class="header-lang-btn" aria-label="Change Language">
        <span class="lang-icon">🌐</span>
        <span class="header-lang-current">${SUPPORTED_LANGUAGES[currentLanguage] || 'English'}</span>
      </button>
      <div class="header-lang-menu" style="display: none;">
        <button type="button" class="lang-option-btn ${currentLanguage === 'en' ? 'active' : ''}" data-lang="en">English</button>
        <button type="button" class="lang-option-btn ${currentLanguage === 'mr' ? 'active' : ''}" data-lang="mr">मराठी</button>
        <button type="button" class="lang-option-btn ${currentLanguage === 'hi' ? 'active' : ''}" data-lang="hi">हिंदी</button>
      </div>
    `;

    const btn = wrapper.querySelector('.header-lang-btn');
    const menu = wrapper.querySelector('.header-lang-menu');

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      document.querySelectorAll('.header-lang-menu, #langSelectorMenu').forEach(m => {
        if (m !== menu) m.style.display = 'none';
      });
      menu.style.display = menu.style.display === 'block' ? 'none' : 'block';
    });

    wrapper.querySelectorAll('.lang-option-btn').forEach(opt => {
      opt.addEventListener('click', (e) => {
        e.stopPropagation();
        const lang = opt.getAttribute('data-lang');
        if (lang) {
          setLanguage(lang);
        }
        menu.style.display = 'none';
      });
    });

    const headerRight = header.querySelector('.header-right');
    if (headerRight) {
      headerRight.insertBefore(wrapper, headerRight.firstChild);
    } else {
      header.appendChild(wrapper);
    }
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  return {
    init,
    getCurrentLanguage,
    setLanguage,
    t,
    getAll,
    getSupportedLanguages,
    onLanguageChange,
    applyTranslations,
    updateFarmerLanguage,
    getFarmerLanguage,
    setupLanguageSelectors,
  };
})();

window.LanguageManager = LanguageManager;
window.t = LanguageManager.t;
