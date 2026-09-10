import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { BellRing, CheckCircle2, ChevronRight, Play, ScanLine, CreditCard } from 'lucide-react'
import { getQueueStats } from '../data/mockData'
import { socketService } from '../services/socketService'
import { useToast } from '../context/ToastContext'
import { useLanguage } from '../context/LanguageContext'
import { getQueue, callNextToken } from '../services/queueApi'
import { Skeleton } from '../components/common/Skeleton'
import './DashboardPage.css'

export default function DashboardPage() {
  const navigate = useNavigate()
  const { showToast } = useToast()
  const { t, language } = useLanguage()
  const [loading, setLoading] = useState(true)
  const [queue, setQueue] = useState([])
  const [stats, setStats] = useState({
    total: 0,
    waiting: 0,
    serving: null,
    completed: 0,
    skipped: 0,
    noShow: 0,
    nextInQueue: null,
    estimatedWaitMinutes: 0,
    pendingPayments: 0,
  })

  const syncQueue = async () => {
    try {
      const data = await getQueue()
      const nextQueue = Array.isArray(data?.queue) ? data.queue : []
      setQueue(nextQueue)
      setStats(data?.stats || getQueueStats(nextQueue))
    } catch (error) {
      console.error('[Queue Sync] Unable to load queue from backend.', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    syncQueue()
    socketService.connect()

    const unsubscribeQueue = socketService.onQueueUpdated(() => {
      syncQueue()
    })
    const interval = setInterval(syncQueue, 8000)

    return () => {
      clearInterval(interval)
      unsubscribeQueue()
    }
  }, [])

  const { serving, nextInQueue, estimatedWaitMinutes } = stats

  const handleCallNextToken = async () => {
    try {
      const result = await callNextToken()
      const nextQueue = Array.isArray(result?.queue) ? result.queue : []
      setQueue(nextQueue)
      setStats(result?.stats || getQueueStats(nextQueue))
      showToast(`Token ${result?.farmer?.token || nextInQueue?.token || ''} called successfully`, 'success')
      socketService.emitTokenCalled(result?.farmer || nextInQueue)
    } catch (error) {
      showToast(error.message || 'Unable to call next token.', 'error')
    }
  }

  // Helper for status badge class
  const getStatusClass = (status) => {
    if (!status) return ''
    return `status-badge ${status.toLowerCase()}`
  }

  const getCheckInClass = (status) => {
    if (!status) return ''
    return `status-badge ${status.toLowerCase().replace(' ', '-')}`
  }

  // Formatting date for header — use locale-aware formatting
  const dateLocale = language === 'hi' ? 'hi-IN' : language === 'mr' ? 'mr-IN' : 'en-IN'
  const today = new Date().toLocaleDateString(dateLocale, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  return (
    <div className="dashboard-container">
      <div className="dashboard-header">
        <div>
          <h1 className="dashboard-title">{t('dashboard.title')}</h1>
          <p className="dashboard-subtitle">{t('dashboard.subtitle')}</p>
        </div>
        <div className="dashboard-date">{today}</div>
      </div>

      {/* ── KPI Cards ── */}
      <div className="kpi-grid">
        <div className="kpi-card">
          <span className="kpi-label">{t('dashboard.totalFarmersToday')}</span>
          <span className="kpi-value">{loading ? <Skeleton width="40px" height="24px" /> : stats.total}</span>
        </div>
        <div className="kpi-card highlight">
          <span className="kpi-label">{t('dashboard.waiting')}</span>
          <span className="kpi-value">{loading ? <Skeleton width="40px" height="24px" /> : stats.waiting}</span>
        </div>
        <div className="kpi-card highlight">
          <span className="kpi-label">{t('dashboard.currentlyServing')}</span>
          <span className="kpi-value">{loading ? <Skeleton width="50px" height="24px" /> : (stats.serving ? stats.serving.token : '-')}</span>
        </div>
        <div className="kpi-card">
          <span className="kpi-label">{t('dashboard.completedProcurements')}</span>
          <span className="kpi-value">{loading ? <Skeleton width="40px" height="24px" /> : stats.completed}</span>
        </div>
        <div className="kpi-card highlight">
          <span className="kpi-label" style={{ color: 'var(--color-warning)' }}>{t('dashboard.pendingPayments')}</span>
          <span className="kpi-value" style={{ color: 'var(--color-warning)' }}>{loading ? <Skeleton width="40px" height="24px" /> : stats.pendingPayments}</span>
        </div>
      </div>

      <div className="dashboard-grid">
        {/* ── Main Column ── */}
        <div className="dashboard-main-col">
          {/* Current Token Card */}
          <div className="current-token-card">
            <div className="current-token-header">
              <h2 className="current-token-title">
                <BellRing size={20} color="var(--color-primary)" />
                {t('dashboard.currentToken')}
              </h2>
              {serving ? (
                <span className="current-token-badge">{t('dashboard.serving')}</span>
              ) : (
                <span className="current-token-badge" style={{ background: 'var(--color-text-muted)' }}>{t('dashboard.idle')}</span>
              )}
            </div>

            <div className="current-token-content">
              <div className="token-large-display">
                <div className="token-large-label">{t('dashboard.tokenNo')}</div>
                <div className="token-large-number">{loading ? <Skeleton width="70px" height="36px" /> : (serving ? serving.token : '—')}</div>
              </div>

              {serving ? (
                <div className="token-details-grid">
                  <div className="detail-group">
                    <span className="detail-label">{t('dashboard.farmerName')}</span>
                    <span className="detail-value">{serving.farmerName}</span>
                  </div>
                  <div className="detail-group">
                    <span className="detail-label">{t('dashboard.crop')}</span>
                    <span className="detail-value">{serving.crop}</span>
                  </div>
                  <div className="detail-group">
                    <span className="detail-label">{t('dashboard.slotTime')}</span>
                    <span className="detail-value">{serving.slot}</span>
                  </div>
                  <div className="detail-group">
                    <span className="detail-label">{t('dashboard.queueStatus')}</span>
                    <span className="detail-value" style={{ color: 'var(--color-primary)' }}>{t('dashboard.activeAtCounter')}</span>
                  </div>
                </div>
              ) : (
                <div style={{ color: 'var(--color-text-muted)', fontSize: '0.9375rem' }}>
                  {loading ? 'Fetching active queue data...' : t('dashboard.noFarmerServing')}
                </div>
              )}
            </div>
          </div>

          {/* Today's Queue Table */}
          <div className="table-card">
            <h2 className="card-title">{t('dashboard.todayQueue')}</h2>
            <div className="queue-table-wrapper">
              <table className="queue-table">
                <thead>
                  <tr>
                    <th>{t('dashboard.token')}</th>
                    <th>{t('dashboard.farmer')}</th>
                    <th>{t('dashboard.crop')}</th>
                    <th>{t('dashboard.slot')}</th>
                    <th>{t('dashboard.checkIn')}</th>
                    <th>{t('common.status')}</th>
                    <th>{t('common.action')}</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    Array.from({ length: 4 }).map((_, i) => (
                      <tr key={`skel-${i}`}>
                        <td><Skeleton width="50px" height="16px" /></td>
                        <td><Skeleton width="100px" height="16px" /></td>
                        <td><Skeleton width="60px" height="16px" /></td>
                        <td><Skeleton width="80px" height="16px" /></td>
                        <td><Skeleton width="60px" height="16px" /></td>
                        <td><Skeleton width="60px" height="16px" /></td>
                        <td><Skeleton width="40px" height="16px" /></td>
                      </tr>
                    ))
                  ) : queue.length === 0 ? (
                    <tr>
                      <td colSpan={7} style={{ textAlign: 'center', padding: '24px', color: 'var(--color-text-muted)' }}>
                        No farmers in queue for today
                      </td>
                    </tr>
                  ) : (
                    queue.slice(0, 5).map((row) => (
                      <tr key={row.id}>
                        <td className="token-cell">{row.token}</td>
                        <td className="farmer-cell">{row.farmerName}</td>
                        <td>{row.crop}</td>
                        <td>{row.slot}</td>
                        <td>
                          <span className={getCheckInClass(row.checkIn)}>{row.checkIn}</span>
                        </td>
                        <td>
                          <span className={getStatusClass(row.queueStatus)}>{row.queueStatus}</span>
                        </td>
                        <td>
                          {row.queueStatus === 'waiting' && (
                            <button className="table-action-btn" onClick={handleCallNextToken}>{t('common.call')}</button>
                          )}
                          {row.queueStatus === 'serving' && (
                            <button className="table-action-btn" style={{ color: 'var(--color-secondary)' }} onClick={() => navigate(`/acc/verification/${row.id}`)}>{t('common.process')} <ChevronRight size={14} style={{ display: 'inline', verticalAlign: 'middle' }}/></button>
                          )}
                           {row.queueStatus === 'completed' && (
                            <button className="table-action-btn" style={{ color: 'var(--color-text-muted)' }} onClick={() => navigate(`/acc/procurement/${row.id}`)}>{t('common.view')}</button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
              <div style={{ textAlign: 'center', marginTop: '16px' }}>
                <button className="table-action-btn" style={{ fontSize: '0.875rem' }} onClick={() => navigate('/acc/queue')}>{t('dashboard.viewFullQueue')}</button>
              </div>
            </div>
          </div>
        </div>

        {/* ── Side Column ── */}
        <div className="dashboard-side-col">
          {/* Quick Actions */}
          <div className="actions-card">
            <h2 className="card-title">{t('dashboard.quickActions')}</h2>
            <div className="actions-grid">
              <button className="action-btn action-btn-primary" onClick={handleCallNextToken}>
                <Play size={18} />
                {t('dashboard.callNextToken')}
              </button>
              <button className="action-btn action-btn-secondary" onClick={() => navigate('/acc/verification')}>
                <ScanLine size={18} />
                {t('dashboard.verifyFarmerQR')}
              </button>
              <button className="action-btn action-btn-secondary" onClick={() => navigate(serving ? `/acc/procurement/${serving.id}` : '/acc/procurement')}>
                <CheckCircle2 size={18} />
                {t('dashboard.startProcurement')}
              </button>
              <button className="action-btn action-btn-secondary" onClick={() => navigate('/acc/payments')}>
                <CreditCard size={18} />
                {t('dashboard.updatePayment')}
              </button>
            </div>
          </div>

          {/* Queue Summary */}
          <div className="summary-card">
            <h2 className="card-title">{t('dashboard.queueSummary')}</h2>
            <div className="summary-list">
              <div className="summary-item">
                <span className="summary-item-label">{t('dashboard.waitingFarmers')}</span>
                <span className="summary-item-value">{stats.waiting}</span>
              </div>
              <div className="summary-item">
                <span className="summary-item-label">{t('dashboard.currentToken')}</span>
                <span className="summary-item-value" style={{ color: 'var(--color-primary)' }}>
                  {serving ? serving.token : '-'}
                </span>
              </div>
              <div className="summary-item">
                <span className="summary-item-label">{t('dashboard.nextToken')}</span>
                <span className="summary-item-value">{nextInQueue ? nextInQueue.token : '-'}</span>
              </div>
              <div className="summary-item">
                <span className="summary-item-label">{t('dashboard.estWaitingTime')}</span>
                <span className="summary-item-value">{estimatedWaitMinutes} {t('dashboard.mins')}</span>
              </div>
              <div className="summary-item">
                <span className="summary-item-label">{t('dashboard.queueStatus')}</span>
                <span className="summary-item-value" style={{ color: stats.waiting > 0 ? 'var(--color-warning)' : 'var(--color-primary)' }}>
                  {stats.waiting > 0 ? t('common.active') : t('dashboard.clear')}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
