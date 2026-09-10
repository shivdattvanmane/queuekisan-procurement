import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Search,
  BellRing,
  User,
  Clock,
  ChevronRight,
  AlertTriangle,
} from 'lucide-react'
import { getQueueStats } from '../data/mockData'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { useLanguage } from '../context/LanguageContext'
import { socketService } from '../services/socketService'
import { getQueue, callNextToken, applyQueueAction, directProcessToken } from '../services/queueApi'
import { Skeleton } from '../components/common/Skeleton'
import './QueuePage.css'

export default function QueuePage() {
  const { officer } = useAuth()
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
  const [searchQuery, setSearchQuery] = useState('')
  const [filter, setFilter] = useState('All')

  const [confirmModal, setConfirmModal] = useState({
    isOpen: false,
    action: null,
    item: null,
    title: '',
    message: '',
    isDanger: false
  })

  const syncQueue = async () => {
    try {
      const data = await getQueue()
      const nextQueue = Array.isArray(data?.queue) ? data.queue : []
      setQueue(nextQueue)
      setStats(data?.stats || getQueueStats(nextQueue))
    } catch (error) {
      console.error('[Queue Sync] Unable to sync queue from backend.', error)
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

  // ── Derived Data ──
  const { serving, nextInQueue, estimatedWaitMinutes } = stats

  const filteredQueue = useMemo(() => {
    return queue.filter(item => {
      // Apply Tab Filter
      if (filter !== 'All') {
        if (item.queueStatus.toLowerCase() !== filter.toLowerCase()) return false;
      }
      // Apply Search Filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase()
        return (
          item.token.toLowerCase().includes(query) ||
          item.farmerName.toLowerCase().includes(query) ||
          item.bookingId.toLowerCase().includes(query)
        )
      }
      return true;
    })
  }, [queue, filter, searchQuery])

  // ── Handlers ──
  const handleCallNextToken = async () => {
    if (serving) {
      showToast('Complete the current token before calling the next one.', 'info')
      return
    }

    if (!nextInQueue) {
      alert(t('queue.noWaitingFarmers'))
      return
    }

    try {
      const result = await callNextToken()
      const nextQueue = Array.isArray(result?.queue) ? result.queue : []
      setQueue(nextQueue)
      setStats(result?.stats || getQueueStats(nextQueue))
      showToast(`Token ${result?.farmer?.token || nextInQueue.token} called successfully`, 'success')
      socketService.emitTokenCalled(result?.farmer || nextInQueue)
    } catch (error) {
      console.error('[Queue] Failed to call next token:', error)
      showToast(error.message || 'Unable to call next token.', 'error')
    }
  }

  const openConfirmModal = (action, item) => {
    let title = ''
    let message = ''
    let isDanger = false

    switch(action) {
      case 'skip':
        title = t('queue.skipToken')
        message = t('queue.skipTokenMsg').replace('{token}', item.token).replace('{name}', item.farmerName)
        isDanger = true
        break;
      case 'no-show':
        title = t('queue.markNoShow')
        message = t('queue.markNoShowMsg').replace('{token}', item.token).replace('{name}', item.farmerName)
        isDanger = true
        break;
      case 'rejoin':
        title = t('queue.rejoinQueue')
        message = t('queue.rejoinQueueMsg').replace('{token}', item.token).replace('{name}', item.farmerName)
        break;
      default:
        return;
    }

    setConfirmModal({
      isOpen: true,
      action,
      item,
      title,
      message,
      isDanger
    })
  }

  const confirmAction = async () => {
    const { action, item } = confirmModal

    try {
      const result = await applyQueueAction(item.id, action)
      const nextQueue = Array.isArray(result?.queue) ? result.queue : []
      setQueue(nextQueue)
      setStats(result?.stats || getQueueStats(nextQueue))
      showToast(`Queue updated for ${result?.farmer?.farmerName || item.farmerName}`, 'success')
      socketService.emitQueueChanged(action, result?.farmer || item)
    } catch (error) {
      console.error('[Queue] Queue action failed:', error)
      showToast(error.message || 'Unable to update queue state.', 'error')
    } finally {
      setConfirmModal({ isOpen: false, action: null, item: null, title: '', message: '', isDanger: false })
    }
  }

  const handleProcessAction = (item) => {
    navigate(`/acc/verification/${item.id}`)
  }

  const handleDirectProcess = async (e, item) => {
    if (e && e.stopPropagation) e.stopPropagation()
    try {
      showToast(`Starting service for Token ${item.token}...`, 'info')
      await directProcessToken(item.id)
      socketService.emitTokenCalled(item)
      navigate(`/acc/verification/${item.id}`)
    } catch (err) {
      console.warn('[Queue] Direct process fallback:', err)
      navigate(`/acc/verification/${item.id}`)
    }
  }

  // Formatting date
  const dateLocale = language === 'hi' ? 'hi-IN' : language === 'mr' ? 'mr-IN' : 'en-IN'
  const today = new Date().toLocaleDateString(dateLocale, {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })

  const tabs = ['All', 'Waiting', 'Serving', 'Completed', 'Skipped', 'No-show']
  const tabLabels = {
    'All': t('queue.all'),
    'Waiting': t('queue.waiting'),
    'Serving': t('queue.serving'),
    'Completed': t('queue.completed'),
    'Skipped': t('queue.skipped'),
    'No-show': t('queue.noShowStatus'),
  }

  return (
    <div className="queue-page-container">
      {/* ── Header ── */}
      <div className="queue-header">
        <div className="queue-title-section">
          <h1 className="queue-title">{t('queue.title')}</h1>
          <p className="queue-subtitle">
            <span style={{ fontWeight: 600 }}>{officer?.centreName}</span>
            <span>&middot;</span>
            <span style={{ color: stats.waiting > 0 ? 'var(--color-warning)' : 'var(--color-primary)' }}>
              {stats.waiting > 0 ? `${stats.waiting} ${t('queue.farmersWaiting')}` : t('queue.queueClear')}
            </span>
          </p>
        </div>
        <div className="queue-header-actions">
          <div className="date-badge">{today}</div>
          <button 
            className="call-next-btn"
            onClick={handleCallNextToken}
            disabled={!nextInQueue}
          >
            <BellRing size={18} />
            {t('queue.callNextToken')}
          </button>
        </div>
      </div>

      {/* ── Summary Cards ── */}
      <div className="queue-summary-grid">
        <div className="q-summary-card">
          <span className="q-summary-label">{t('queue.totalToday')}</span>
          <span className="q-summary-value">{loading ? <Skeleton width="36px" height="24px" /> : stats.total}</span>
        </div>
        <div className="q-summary-card highlight">
          <span className="q-summary-label">{t('queue.waiting')}</span>
          <span className="q-summary-value">{loading ? <Skeleton width="36px" height="24px" /> : stats.waiting}</span>
        </div>
        <div className="q-summary-card">
          <span className="q-summary-label">{t('queue.serving')}</span>
          <span className="q-summary-value" style={{ color: 'var(--color-primary)' }}>{loading ? <Skeleton width="36px" height="24px" /> : (stats.serving ? '1' : '0')}</span>
        </div>
        <div className="q-summary-card">
          <span className="q-summary-label">{t('queue.completed')}</span>
          <span className="q-summary-value">{loading ? <Skeleton width="36px" height="24px" /> : stats.completed}</span>
        </div>
        <div className="q-summary-card">
          <span className="q-summary-label">{t('queue.noShowStatus')}</span>
          <span className="q-summary-value" style={{ color: 'var(--color-error)' }}>{loading ? <Skeleton width="36px" height="24px" /> : stats.noShow}</span>
        </div>
      </div>

      {/* ── Current Token Panel ── */}
      <div className="current-panel">
        <div className="cp-left">
          <div className="cp-token-display">
            <span className="cp-label">{t('queue.currentToken')}</span>
            <span className="cp-token">{serving ? serving.token : '—'}</span>
          </div>
          {serving ? (
            <div className="cp-details">
              <span className="cp-name">{serving.farmerName}</span>
              <div className="cp-meta">
                <span className="cp-meta-item"><User size={14}/> {serving.crop} ({serving.quantity})</span>
                <span className="cp-meta-item"><Clock size={14}/> {t('queue.slot')}: {serving.slot}</span>
              </div>
            </div>
          ) : (
            <div className="cp-details" style={{ color: 'rgba(255,255,255,0.7)' }}>
              {t('queue.noActiveToken')}
            </div>
          )}
        </div>
        <div className="cp-right">
          <span className="cp-status">{serving ? t('queue.servingAtCounter') : t('queue.idle')}</span>
          {nextInQueue && (
            <span className="cp-eta">{t('queue.next')}: {nextInQueue.token} &middot; {t('queue.estWait')}: {estimatedWaitMinutes}m</span>
          )}
        </div>
      </div>

      {/* ── Queue Table Section ── */}
      <div className="q-table-card">
        <div style={{ padding: '20px 20px 0' }}>
          <div className="table-controls">
            <div className="filter-tabs">
              {tabs.map(tab => (
                <button
                  key={tab}
                  className={`filter-tab ${filter === tab ? 'active' : ''}`}
                  onClick={() => setFilter(tab)}
                >
                  {tabLabels[tab] || tab}
                </button>
              ))}
            </div>
            <div className="search-box">
              <span className="search-icon"><Search size={16} /></span>
              <input 
                type="text" 
                placeholder={t('queue.searchPlaceholder')}
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="q-table-wrapper">
          <table className="q-table">
            <thead>
              <tr>
                <th>{t('queue.token')}</th>
                <th>{t('queue.farmer')}</th>
                <th>{t('queue.crop')}</th>
                <th>{t('queue.slot')}</th>
                <th>{t('queue.checkIn')}</th>
                <th>{t('queue.queueStatusColumn')}</th>
                <th>{t('queue.action')}</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={`skel-${i}`}>
                    <td><Skeleton width="50px" height="16px" /></td>
                    <td><Skeleton width="120px" height="16px" /></td>
                    <td><Skeleton width="70px" height="16px" /></td>
                    <td><Skeleton width="90px" height="16px" /></td>
                    <td><Skeleton width="65px" height="16px" /></td>
                    <td><Skeleton width="65px" height="16px" /></td>
                    <td><Skeleton width="80px" height="16px" /></td>
                  </tr>
                ))
              ) : filteredQueue.length > 0 ? (
                filteredQueue.map((item) => (
                  <tr 
                    key={item.id} 
                    style={{ cursor: 'pointer' }}
                    onClick={() => handleProcessAction(item)}
                    title="Click to view & process farmer details"
                  >
                    <td className="q-token">{item.token}</td>
                    <td>
                      <div className="q-farmer">
                        <span className="q-farmer-name">{item.farmerName}</span>
                        <span className="q-farmer-booking">{item.bookingId}</span>
                      </div>
                    </td>
                    <td>{item.crop}</td>
                    <td>{item.slot}</td>
                    <td><span className={`badge ${item.checkIn.toLowerCase().replace(' ','-')}`}>{item.checkIn}</span></td>
                    <td><span className={`badge ${item.queueStatus.toLowerCase()}`}>{item.queueStatus}</span></td>
                    <td>
                      <div className="row-actions" onClick={e => e.stopPropagation()}>
                        {item.queueStatus === 'waiting' && (
                          <>
                            <button className="btn-action primary" title="Directly process this booking" onClick={(e) => handleDirectProcess(e, item)}>
                              {t('queue.process') || 'Process'}
                            </button>
                            <button className="btn-action secondary" title="Skip token" onClick={(e) => { e.stopPropagation(); openConfirmModal('skip', item) }}>
                              {t('queue.skip')}
                            </button>
                            <button className="btn-action danger" title="Mark as no-show" onClick={(e) => { e.stopPropagation(); openConfirmModal('no-show', item) }}>
                              {t('queue.noshow')}
                            </button>
                          </>
                        )}
                        {item.queueStatus === 'serving' && (
                          <button className="btn-action primary" onClick={(e) => { e.stopPropagation(); handleProcessAction(item) }}>
                            {t('queue.process')} <ChevronRight size={14} />
                          </button>
                        )}
                        {(item.queueStatus === 'skipped' || item.queueStatus === 'no-show') && (
                          <>
                            <button className="btn-action secondary" onClick={(e) => { e.stopPropagation(); openConfirmModal('rejoin', item) }}>
                              {t('common.rejoin')}
                            </button>
                            <button className="btn-action primary" style={{ marginLeft: 6 }} onClick={(e) => handleDirectProcess(e, item)}>
                              {t('queue.process') || 'Process'}
                            </button>
                          </>
                        )}
                        {item.queueStatus === 'completed' && (
                          <button className="btn-action secondary" onClick={(e) => { e.stopPropagation(); navigate(`/acc/procurement/${item.id}`) }}>
                            {t('queue.view')}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="7" style={{ textAlign: 'center', padding: '40px', color: 'var(--color-text-muted)' }}>
                    {t('queue.noMatchingFarmers')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Confirmation Modal ── */}
      {confirmModal.isOpen && (
        <div className="modal-overlay" onClick={() => setConfirmModal({...confirmModal, isOpen: false})}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              {confirmModal.isDanger && <AlertTriangle size={18} color="var(--color-error)" style={{ display: 'inline', marginRight: 8, verticalAlign: 'middle' }}/>}
              {confirmModal.title}
            </div>
            <div className="modal-body">
              {confirmModal.message}
            </div>
            <div className="modal-footer">
              <button className="modal-btn cancel" onClick={() => setConfirmModal({...confirmModal, isOpen: false})}>{t('common.cancel')}</button>
              <button 
                className={`modal-btn ${confirmModal.isDanger ? 'confirm-danger' : 'confirm'}`}
                onClick={confirmAction}
              >
                {t('common.confirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
