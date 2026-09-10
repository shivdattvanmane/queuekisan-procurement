import { useLanguage } from '../../context/LanguageContext';

export default function LanguageSelector() {
  const { language, setLanguage, t } = useLanguage();

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      padding: '8px 12px',
      background: 'var(--color-bg)',
      borderRadius: 'var(--radius-md)',
      border: '1px solid var(--color-border)'
    }}>
      <label style={{
        fontSize: '0.75rem',
        fontWeight: '600',
        color: 'var(--color-text-secondary)',
        textTransform: 'uppercase',
        marginRight: '4px'
      }}>
        {t('common.language')}:
      </label>
      <select
        value={language}
        onChange={(e) => setLanguage(e.target.value)}
        style={{
          padding: '6px 8px',
          fontSize: '0.875rem',
          fontWeight: '500',
          background: 'white',
          border: '1px solid var(--color-border)',
          borderRadius: '4px',
          color: 'var(--color-text-primary)',
          cursor: 'pointer',
          outline: 'none',
          transition: 'all 150ms ease'
        }}
        onFocus={(e) => e.target.style.borderColor = 'var(--krushi-green)'}
        onBlur={(e) => e.target.style.borderColor = 'var(--color-border)'}
      >
        <option value="en">{t('common.english')}</option>
        <option value="mr">{t('common.marathi')}</option>
        <option value="hi">{t('common.hindi')}</option>
      </select>
    </div>
  );
}
