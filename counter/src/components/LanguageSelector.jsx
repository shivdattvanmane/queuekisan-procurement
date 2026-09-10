import { useState } from 'react'
import { useLanguage } from '../context/LanguageContext'
import { Globe } from 'lucide-react'
import './LanguageSelector.css'

export default function LanguageSelector({ variant = 'default' }) {
  const { language, changeLanguage, availableLanguages } = useLanguage()
  const [isOpen, setIsOpen] = useState(false)

  return (
    <div className={`language-selector language-selector--${variant}`}>
      <button
        type="button"
        className="language-selector-btn"
        title="Change language"
        aria-label="Change language"
        aria-expanded={isOpen}
        aria-haspopup="menu"
        onClick={() => setIsOpen((open) => !open)}
      >
        <Globe size={18} />
        <span className="language-code">{language.toUpperCase()}</span>
      </button>
      <div className={`language-dropdown${isOpen ? ' is-open' : ''}`} role="menu">
        {availableLanguages.map((lang) => (
          <button
            key={lang.code}
            className={`language-option ${language === lang.code ? 'active' : ''}`}
            onClick={() => {
              changeLanguage(lang.code)
              setIsOpen(false)
            }}
            title={lang.name}
          >
            <span className="language-native">{lang.nativeName}</span>
            <span className="language-english">({lang.name})</span>
          </button>
        ))}
      </div>
    </div>
  )
}
