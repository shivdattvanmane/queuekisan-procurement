import { useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import KPICard from '../components/common/KPICard';
import StatusBadge from '../components/common/StatusBadge';
import { KPISkeleton, TableSkeleton } from '../components/common/Skeleton';
import { useLanguage } from '../context/LanguageContext';
import { getDashboardKPIs, getCentres, getQueueData } from '../services/adminApi';
import { adminSocketService } from '../services/socketService';
import { FiUsers, FiCalendar, FiClock, FiCheckCircle, FiCreditCard, FiDollarSign, FiMapPin, FiMonitor, FiBarChart2 } from 'react-icons/fi';

const EMPTY_KPIS = { totalFarmers: 0, todaysBookings: 0, activeQueue: 0, completedProcurements: 0, pendingPayments: 0, totalProcurementAmount: 0 };

export default function Dashboard() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [dashboardKPIs, setDashboardKPIs] = useState(EMPTY_KPIS);
  const [centres, setCentres] = useState([]);
  const [queueData, setQueueData] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const [kpis, cList, qList] = await Promise.all([
          getDashboardKPIs().catch(() => EMPTY_KPIS),
          getCentres().catch(() => []),
          getQueueData().catch(() => []),
        ]);
        setDashboardKPIs(kpis);
        setCentres(cList);
        setQueueData(qList);
      } catch (err) {
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    };
    load();
    adminSocketService.connect();
    const unsubscribe = adminSocketService.onUpdate(() => load());
    return () => unsubscribe();
  }, []);

  return (
    <div>
      <div className="section-header">
        <div>
          <h2 className="section-title">{t('dashboard.overview')}</h2>
          <p className="section-subtitle">{t('dashboard.overview.subtitle')}</p>
        </div>
      </div>

      <div className="kpi-grid">
        {isLoading ? (
          <>
            <KPISkeleton />
            <KPISkeleton />
            <KPISkeleton />
            <KPISkeleton />
            <KPISkeleton />
            <KPISkeleton />
          </>
        ) : (
          <>
            <KPICard
              icon={<FiUsers />}
              iconColor="blue"
              label={t('dashboard.totalFarmers')}
              value={dashboardKPIs.totalFarmers.toLocaleString()}
              trend="12%"
            />
            <KPICard
              icon={<FiCalendar />}
              iconColor="green"
              label={t('dashboard.waiting')}
              value={dashboardKPIs.todaysBookings.toLocaleString()}
              trend="5%"
            />
            <KPICard
              icon={<FiClock />}
              iconColor="orange"
              label={t('dashboard.serving')}
              value={dashboardKPIs.activeQueue.toLocaleString()}
            />
        <KPICard
          icon={<FiCheckCircle />}
          iconColor="green"
          label={t('dashboard.completed')}
          value={dashboardKPIs.completedProcurements.toLocaleString()}
          trend="8%"
        />
        <KPICard
          icon={<FiCreditCard />}
          iconColor="red"
          label={t('dashboard.pendingPayments')}
          value={dashboardKPIs.pendingPayments.toLocaleString()}
          trend="2%"
          trendDirection="down"
        />
            <KPICard
              icon={<FiDollarSign />}
              iconColor="purple"
              label={t('dashboard.totalAmount')}
              value={dashboardKPIs.totalProcurementAmount.toLocaleString()}
              trend="15%"
            />
          </>
        )}
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">{t('dashboard.capacityUtilization')}</h3>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {centres.map(centre => {
              const utilPercent = centre.capacity > 0 ? Math.round((centre.currentOccupancy / centre.capacity) * 100) : 0;
              let barColor = 'green';
              if (utilPercent > 85) barColor = 'danger';
              else if (utilPercent > 60) barColor = 'warning';

              return (
                <div key={centre.id}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '0.875rem' }}>
                    <span style={{ fontWeight: 600 }}>{centre.name}</span>
                    <span>{centre.currentOccupancy} / {centre.capacity} ({utilPercent}%)</span>
                  </div>
                  <div className={`progress-bar ${barColor}`}>
                    <div className="progress-fill" style={{ width: `${utilPercent}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h3 className="card-title">{t('dashboard.liveQueue')}</h3>
            <div className="live-indicator">
              <span className="live-dot" /> {t('dashboard.live')}
            </div>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t('dashboard.centre')}</th>
                  <th>{t('dashboard.currentToken')}</th>
                  <th>{t('dashboard.waitingCol')}</th>
                  <th>{t('dashboard.estWait')}</th>
                </tr>
              </thead>
              <tbody>
                {queueData.slice(0, 5).map(q => (
                  <tr key={q.centreId}>
                    <td style={{ fontWeight: 500 }}>{q.centreName}</td>
                    <td><StatusBadge status={q.status === 'active' ? 'processing' : 'inactive'} /> {q.currentToken !== '-' && q.currentToken}</td>
                    <td>
                      <span style={{ color: q.waitingFarmers > 10 ? 'var(--color-danger)' : 'inherit', fontWeight: q.waitingFarmers > 10 ? 700 : 400 }}>
                        {q.waitingFarmers}
                      </span>
                    </td>
                    <td>{q.estimatedWait}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="section-header" style={{ marginTop: '32px' }}>
        <h2 className="section-title">{t('dashboard.quickActions')}</h2>
      </div>

      <div className="quick-actions">
        <button className="quick-action-btn" onClick={() => navigate('/centres-slots')}>
          <div className="action-icon"><FiMapPin /></div>
          <div>
            <div className="action-label">{t('btn.manageCentres')}</div>
            <div className="action-desc">{t('btn.manageCentres.desc')}</div>
          </div>
        </button>
        <button className="quick-action-btn" onClick={() => navigate('/centres-slots')}>
          <div className="action-icon"><FiCalendar /></div>
          <div>
            <div className="action-label">{t('btn.manageSlots')}</div>
            <div className="action-desc">{t('btn.manageSlots.desc')}</div>
          </div>
        </button>
        <button className="quick-action-btn" onClick={() => navigate('/queue')}>
          <div className="action-icon"><FiMonitor /></div>
          <div>
            <div className="action-label">{t('btn.queueMonitor')}</div>
            <div className="action-desc">{t('btn.queueMonitor.desc')}</div>
          </div>
        </button>
        <button className="quick-action-btn" onClick={() => navigate('/analytics')}>
          <div className="action-icon"><FiBarChart2 /></div>
          <div>
            <div className="action-label">{t('btn.viewAnalytics')}</div>
            <div className="action-desc">{t('btn.viewAnalytics.desc')}</div>
          </div>
        </button>
      </div>
    </div>
  );
}
