import { useLanguage } from '../../context/LanguageContext';

export default function StatusBadge({ status }) {
  const { t } = useLanguage();

  const statusMap = {
    active: 'active',
    inactive: 'inactive',
    completed: 'completed',
    pending: 'pending',
    failed: 'failed',
    'in-progress': 'processing',
    processing: 'processing',
    confirmed: 'active',
    cancelled: 'inactive',
    closed: 'inactive',
    paused: 'paused',
    disabled: 'inactive',
    success: 'success',
    danger: 'danger',
    warning: 'warning',
    info: 'info',
  };

  const rawStatus = status?.toLowerCase();
  const className = statusMap[rawStatus] || 'info';
  
  let displayLabel = 'Unknown';
  if (status) {
    const key = `status.${className}`; // e.g., status.active
    const translated = t(key);
    
    // Fallback if the translation key returns itself
    if (translated !== key) {
      displayLabel = translated;
    } else {
      displayLabel = status.charAt(0).toUpperCase() + status.slice(1).replace('-', ' ');
    }
  }

  return (
    <span className={`status-badge ${className}`}>
      <span className="dot" />
      {displayLabel}
    </span>
  );
}
