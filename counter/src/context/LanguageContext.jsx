import { createContext, useContext, useState, useEffect } from 'react'
import en from '../i18n/en.json'
import mr from '../i18n/mr.json'
import hi from '../i18n/hi.json'

const LanguageContext = createContext(null)

const translations = {
  en,
  mr,
  hi,
}

const LANGUAGE_STORAGE_KEY = 'krushidarpan_language'
const DEFAULT_LANGUAGE = 'en'

export function LanguageProvider({ children }) {
  const [language, setLanguage] = useState(() => {
    // Load from localStorage or use default
    try {
      const saved = localStorage.getItem(LANGUAGE_STORAGE_KEY)
      return saved && Object.keys(translations).includes(saved) ? saved : DEFAULT_LANGUAGE
    } catch {
      return DEFAULT_LANGUAGE
    }
  })

  // Save language preference to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(LANGUAGE_STORAGE_KEY, language)
    } catch {
      console.warn('Failed to save language preference to localStorage')
    }
  }, [language])

  const changeLanguage = (lang) => {
    if (Object.keys(translations).includes(lang)) {
      setLanguage(lang)
    }
  }

  // Translation function with fallback to English
  const t = (key) => {
    const keys = key.split('.')
    let value = translations[language]

    for (const k of keys) {
      if (value && typeof value === 'object' && k in value) {
        value = value[k]
      } else {
        // Fallback to English if translation not found
        value = translations.en
        for (const fallbackKey of keys) {
          if (value && typeof value === 'object' && fallbackKey in value) {
            value = value[fallbackKey]
          } else {
            return key // Return the key itself if not found
          }
        }
        return value
      }
    }

    return value
  }

  const value = {
    language,
    changeLanguage,
    t,
    availableLanguages: [
      { code: 'en', name: 'English', nativeName: 'English' },
      { code: 'mr', name: 'Marathi', nativeName: 'मराठी' },
      { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी' },
    ],
  }

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useLanguage() {
  const context = useContext(LanguageContext)
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider')
  }
  return context
}
