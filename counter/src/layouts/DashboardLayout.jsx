import { useState, useRef, useEffect } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import {
  Sprout,
  LayoutDashboard,
  Users,
  UserSquare2,
  PackageCheck,
  CreditCard,
  Search,
  Bell,
  Menu,
  X,
  LogOut,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useLanguage } from '../context/LanguageContext'
import LanguageSelector from '../components/LanguageSelector'
import { getQueue } from '../services/queueApi'
import { socketService } from '../services/socketService'
import './DashboardLayout.css'

export default function DashboardLayout() {
  const { officer, logout } = useAuth()
  const { t } = useLanguage()
  const navigate = useNavigate()

  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [notifOpen, setNotifOpen] = useState(false)
  const [notifications, setNotifications] = useState([])
  const notifRef = useRef(null)

  const unreadCount = notifications.filter((n) => !n.read).length

  useEffect(() => {
    function handleClickOutside(event) {
      if (notifRef.current && !notifRef.current.contains(event.target)) {
        setNotifOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    const loadNotifications = async () => {
      try {
        const data = await getQueue()
        setNotifications(data.notifications || [])
      } catch (error) {
        console.error('[Counter Layout] Unable to load notifications.', error)
      }
    }
    loadNotifications()
    socketService.connect()
    if (officer?.centreId) socketService.joinCentre(officer.centreId)
    if (officer?.id) socketService.joinUser(officer.id)
    const unsubscribe = socketService.onQueueUpdated(() => loadNotifications())
    const interval = setInterval(loadNotifications, 8000)
    return () => {
      clearInterval(interval)
      unsubscribe()
    }
  }, [officer?.centreId, officer?.id])

  const closeSidebar = () => setSidebarOpen(false)

  const handleLogout = () => {
    logout()
    navigate('/acc/login', { replace: true })
  }

  return (
    <div className="layout">
      <div className={`sidebar-overlay ${sidebarOpen ? 'visible' : ''}`} onClick={closeSidebar} />

      <aside className={`sidebar ${sidebarOpen ? 'open' : ''} ${sidebarCollapsed ? 'collapsed' : ''}`}>
        <div className="sidebar-brand">
          <div className="sidebar-brand-icon">
            <Sprout size={22} strokeWidth={2.5} />
          </div>
          {!sidebarCollapsed && <div className="sidebar-brand-text">Queue<span>Kisan</span></div>}
          {sidebarOpen && (
            <button className="mobile-menu-btn" onClick={closeSidebar} style={{ marginLeft: 'auto', color: '#fff' }}>
              <X size={20} />
            </button>
          )}
        </div>

        <nav className="sidebar-nav">
          {!sidebarCollapsed && <div className="sidebar-nav-label">{t('nav.operations')}</div>}

          <NavLink to="/acc/dashboard" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} onClick={closeSidebar} title={sidebarCollapsed ? t('nav.dashboard') : undefined}>
            <LayoutDashboard size={18} />
            {!sidebarCollapsed && <span>{t('nav.dashboard')}</span>}
          </NavLink>

          <NavLink to="/acc/queue" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} onClick={closeSidebar} title={sidebarCollapsed ? t('nav.queue') : undefined}>
            <Users size={18} />
            {!sidebarCollapsed && <span>{t('nav.queue')}</span>}
          </NavLink>

          <NavLink to="/acc/farmers" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} onClick={closeSidebar} title={sidebarCollapsed ? t('nav.farmers') : undefined}>
            <UserSquare2 size={18} />
            {!sidebarCollapsed && <span>{t('nav.farmers')}</span>}
          </NavLink>

          <NavLink to="/acc/procurement" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} onClick={closeSidebar} title={sidebarCollapsed ? t('nav.procurement') : undefined}>
            <PackageCheck size={18} />
            {!sidebarCollapsed && <span>{t('nav.procurement')}</span>}
          </NavLink>

          <NavLink to="/acc/payments" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} onClick={closeSidebar} title={sidebarCollapsed ? t('nav.payments') : undefined}>
            <CreditCard size={18} />
            {!sidebarCollapsed && <span>{t('nav.payments')}</span>}
          </NavLink>
        </nav>

        <div className="sidebar-footer">
          <button className="sidebar-collapse-btn" onClick={() => setSidebarCollapsed(!sidebarCollapsed)} title={sidebarCollapsed ? t('nav.expandSidebar') : t('nav.collapseSidebar')}>
            {sidebarCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
          </button>

          <div className="sidebar-officer">
            <div className="sidebar-officer-avatar">{officer?.name?.charAt(0) || 'O'}</div>
            {!sidebarCollapsed && (
              <div className="sidebar-officer-info">
                <span className="sidebar-officer-name">{officer?.name}</span>
                <span className="sidebar-officer-id">{officer?.officerId}</span>
              </div>
            )}
            <button className="header-icon-btn logout-btn" style={{ marginLeft: 'auto', width: 32, height: 32 }} onClick={handleLogout} title={t('common.logout')}>
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      <header className="header">
        <div className="header-left">
          <button className="mobile-menu-btn" onClick={() => setSidebarOpen(true)}>
            <Menu size={22} />
          </button>
          <div className="header-centre-name">{officer?.centreName}</div>
          <div className="header-centre-badge">{t('common.active')}</div>
        </div>

        <div className="header-right">
          <div className="header-search">
            <span className="header-search-icon"><Search size={16} /></span>
            <input type="text" placeholder={t('header.searchPlaceholder')} />
          </div>
          <LanguageSelector />

          <div style={{ position: 'relative' }} ref={notifRef}>
            <button className="header-icon-btn" onClick={() => setNotifOpen(!notifOpen)}>
              <Bell size={20} />
              {unreadCount > 0 && <span className="notification-dot" />}
            </button>

            {notifOpen && (
              <div className="notif-dropdown">
                <div className="notif-header">
                  <h3>{t('header.notifications')}</h3>
                  <span>{t('header.markAllAsRead')}</span>
                </div>
                <div className="notif-list">
                  {notifications.length > 0 ? (
                    notifications.map((n) => (
                      <div key={n.id} className={`notif-item ${!n.read ? 'unread' : ''}`}>
                        <div className="notif-dot-col"><div className={`notif-dot ${n.read ? 'read' : ''}`} /></div>
                        <div>
                          <p className="notif-text">{n.text}</p>
                          <p className="notif-time">{n.time}</p>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div style={{ padding: '16px', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.8125rem' }}>
                      {t('header.noNewNotifications')}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="header-avatar" title={officer?.name}>{officer?.name?.charAt(0) || 'O'}</div>
        </div>
      </header>

      <main className="main-content">
        <Outlet />
      </main>
    </div>
  )
}
