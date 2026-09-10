import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { FiSearch, FiBell } from 'react-icons/fi';
import { useAuth } from '../../context/AuthContext';
import LanguageSelector from '../common/LanguageSelector';
import { useLanguage } from '../../context/LanguageContext';
import { getNotifications } from '../../services/adminApi';

const pageTitles = {
  '/': { title: 'Dashboard', subtitle: 'System overview & monitoring' },
  '/farmers': { title: 'Farmer Monitoring', subtitle: 'Search, view, and track farmers' },
  '/procurement': { title: 'Procurement Monitoring', subtitle: 'Track procurement records' },
  '/payments': { title: 'Payment Monitoring', subtitle: 'Monitor payment status and history' },
  '/centres-slots': { title: 'Centres & Slots', subtitle: 'Manage procurement centres and slots' },
  '/queue': { title: 'Live Queue Monitoring', subtitle: 'Real-time queue status across centres' },
  '/analytics': { title: 'Analytics', subtitle: 'Insights, trends, and AI/ML predictions' },
  '/reports': { title: 'Reports', subtitle: 'Generate and export reports' },
};

export default function Header() {
  const location = useLocation();
  const { user } = useAuth();
  const { t } = useLanguage();
  const [showNotifications, setShowNotifications] = useState(false);

  const currentPage = pageTitles[location.pathname] || { title: 'QueueKisan', subtitle: '' };
  const [mockNotifications, setMockNotifications] = useState([]);

  useEffect(() => {
    const load = () => getNotifications().then(setMockNotifications).catch(console.error);
    load();
    const interval = setInterval(load, 8000);
    return () => clearInterval(interval);
  }, []);

  const unreadCount = mockNotifications.filter(n => !n.read).length;

  return (
    <header className="header">
      <div className="header-left">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '0.9375rem', fontWeight: '600', color: 'var(--color-text-primary)' }}>
            mumbai
          </span>
          <span style={{
            fontSize: '0.75rem',
            fontWeight: '600',
            color: 'var(--krushi-green)',
            background: 'var(--krushi-pale)',
            padding: '4px 12px',
            borderRadius: 'var(--radius-full)',
            display: 'inline-block'
          }}>
            {t('status.active')}
          </span>
        </div>
      </div>

      <div className="header-right">
        <div className="header-search">
          <FiSearch className="search-icon" />
          <input type="text" placeholder={t('header.search')} />
        </div>

        <LanguageSelector />

        <div style={{ position: 'relative' }}>
          <button
            className="header-btn"
            title="Notifications"
            onClick={() => setShowNotifications(!showNotifications)}
          >
            <FiBell />
            {unreadCount > 0 && <span className="badge">{unreadCount}</span>}
          </button>

          {showNotifications && (
            <div style={{
              position: 'absolute',
              top: '100%',
              right: 0,
              width: '360px',
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-lg)',
              boxShadow: 'var(--shadow-xl)',
              zIndex: 200,
              marginTop: '8px',
              animation: 'slideUp 0.2s ease',
            }}>
              <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--color-border)', fontWeight: 700, fontSize: '0.9375rem' }}>
                {t('header.notifications')}
              </div>
              <div style={{ maxHeight: '320px', overflowY: 'auto' }}>
                {mockNotifications.map(n => (
                  <div key={n.id} style={{
                    padding: '12px 20px',
                    borderBottom: '1px solid var(--color-border-light)',
                    background: n.read ? 'transparent' : 'var(--krushi-lighter)',
                    cursor: 'pointer',
                    transition: 'background 0.15s ease',
                  }}>
                    <div style={{ fontSize: '0.8125rem', fontWeight: 600, marginBottom: '2px' }}>{n.title}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', marginBottom: '4px' }}>{n.message}</div>
                    <div style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)' }}>{n.time}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <button
          className="header-profile"
          style={{
            padding: '0',
            width: '36px',
            height: '36px',
            borderRadius: 'var(--radius-md)',
            background: 'var(--krushi-green)',
            color: 'white',
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: '600',
            fontSize: '0.875rem',
            transition: 'all 150ms ease'
          }}
          onMouseEnter={(e) => e.target.style.opacity = '0.9'}
          onMouseLeave={(e) => e.target.style.opacity = '1'}
          title={user?.name || 'Admin'}
        >
          {(user?.name || 'Admin').charAt(0).toLowerCase()}
        </button>
      </div>
    </header>
  );
}
