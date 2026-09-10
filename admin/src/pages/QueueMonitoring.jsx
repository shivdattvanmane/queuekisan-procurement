import { useState, useEffect } from 'react';
import { getQueueData } from '../services/adminApi';
import { adminSocketService } from '../services/socketService';
import StatusBadge from '../components/common/StatusBadge';
import { FiMonitor, FiClock, FiUsers, FiCheckCircle } from 'react-icons/fi';
import { useLanguage } from '../context/LanguageContext';

export default function QueueMonitoring() {
  const { t } = useLanguage();
  const [queueData, setQueueData] = useState([]);

  useEffect(() => {
    const load = () => getQueueData().then(setQueueData).catch(console.error);
    load();
    adminSocketService.connect();
    const unsubscribe = adminSocketService.onUpdate(() => load());
    const interval = setInterval(load, 15000);
    return () => {
      unsubscribe();
      clearInterval(interval);
    };
  }, []);

  return (
    <div>
      <div className="section-header">
        <div>
          <h2 className="section-title">{t('queue.title')}</h2>
          <p className="section-subtitle">{t('queue.subtitle')}</p>
        </div>
        <div className="live-indicator" style={{ background: 'var(--color-surface)', padding: '8px 16px', borderRadius: 'var(--radius-full)', border: '1px solid var(--color-border)' }}>
          <span className="live-dot" /> {t('queue.liveUpdates')}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {queueData.map(queue => (
          <div key={queue.centreId} className="card" style={{ padding: '0', overflow: 'hidden' }}>
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'space-between',
              padding: '16px 24px',
              borderBottom: '1px solid var(--color-border)',
              background: queue.status === 'active' ? 'var(--krushi-lighter)' : 'var(--color-surface-hover)'
            }}>
              <div>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {queue.centreName}
                  {queue.status === 'active' && <span className="live-dot" style={{ width: '6px', height: '6px' }} />}
                </h3>
                <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)', marginTop: '4px' }}>
                  {t('queue.centreId')}: {queue.centreId}
                </div>
              </div>
              <StatusBadge status={queue.status === 'active' ? 'processing' : 'closed'} />
            </div>

            <div style={{ padding: '24px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '24px' }}>
              
              <div style={{ borderRight: '1px solid var(--color-border)' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <FiMonitor /> {t('queue.currentToken')}
                </div>
                <div style={{ fontSize: '2rem', fontWeight: 800, color: queue.status === 'active' ? 'var(--krushi-green)' : 'var(--color-text-muted)', lineHeight: 1 }}>
                  {queue.currentToken}
                </div>
                {queue.status === 'active' && (
                  <div style={{ fontSize: '0.875rem', fontWeight: 600, marginTop: '8px' }}>
                    {t('queue.serving')}: {queue.servingFarmer}
                  </div>
                )}
              </div>

              <div style={{ borderRight: '1px solid var(--color-border)' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <FiUsers /> {t('queue.waitingFarmers')}
                </div>
                <div style={{ fontSize: '2rem', fontWeight: 800, color: queue.waitingFarmers > 10 ? 'var(--color-danger)' : 'var(--color-text-primary)', lineHeight: 1 }}>
                  {queue.waitingFarmers}
                </div>
                {queue.waitingFarmers > 10 && (
                  <div style={{ fontSize: '0.75rem', color: 'var(--color-danger)', fontWeight: 600, marginTop: '8px', background: 'rgba(239, 68, 68, 0.1)', padding: '2px 8px', borderRadius: '4px', display: 'inline-block' }}>
                    {t('queue.highLoadAlert')}
                  </div>
                )}
              </div>

              <div style={{ borderRight: '1px solid var(--color-border)' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <FiClock /> {t('queue.estWaitTime')}
                </div>
                <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--color-text-primary)', lineHeight: 1 }}>
                  {queue.estimatedWait}
                </div>
              </div>

              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <FiCheckCircle /> {t('queue.tokensCompleted')}
                </div>
                <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--color-text-primary)', lineHeight: 1 }}>
                  {queue.completedTokens}
                </div>
              </div>

            </div>

            <div style={{ borderTop: '1px solid var(--color-border)', padding: '16px 24px 24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                <h4 style={{ fontSize: '0.95rem', fontWeight: 700, margin: 0 }}>{t('queue.bookedSlots')}</h4>
                <span style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>
                  {queue.totalBookings || 0} {t('queue.bookings')}
                </span>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>{t('queue.token')}</th>
                      <th>{t('queue.farmer')}</th>
                      <th>{t('queue.crop')}</th>
                      <th>{t('queue.date')}</th>
                      <th>{t('queue.slot')}</th>
                      <th>{t('queue.checkIn')}</th>
                      <th>{t('queue.status')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(queue.bookedSlots || []).slice(0, 8).map((slot) => (
                      <tr key={slot.bookingId}>
                        <td style={{ fontWeight: 700 }}>{slot.token}</td>
                        <td>
                          <div style={{ fontWeight: 600 }}>{slot.farmerName}</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>{slot.bookingId}</div>
                        </td>
                        <td>{slot.crop}</td>
                        <td>{slot.date}</td>
                        <td>{slot.slot}</td>
                        <td>{slot.checkIn}</td>
                        <td><StatusBadge status={slot.status} /></td>
                      </tr>
                    ))}
                    {(!queue.bookedSlots || queue.bookedSlots.length === 0) && (
                      <tr>
                        <td colSpan="7" style={{ textAlign: 'center', color: 'var(--color-text-secondary)' }}>
                          {t('queue.noBookedSlots')}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
