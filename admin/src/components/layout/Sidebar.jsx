import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { FiGrid, FiUsers, FiShoppingBag, FiCreditCard, FiMapPin, FiMonitor, FiBarChart2, FiFileText, FiChevronLeft, FiChevronRight, FiLogOut } from 'react-icons/fi';
import { GiWheat } from 'react-icons/gi';
import { useLanguage } from '../../context/LanguageContext';
import { useAuth } from '../../context/AuthContext';

const navItemsConfig = [
  { path: '/', labelKey: 'nav.dashboard', icon: FiGrid },
  { path: '/farmers', labelKey: 'nav.farmers', icon: FiUsers },
  { path: '/procurement', labelKey: 'nav.procurement', icon: FiShoppingBag },
  { path: '/payments', labelKey: 'nav.payments', icon: FiCreditCard },
  { path: '/centres-slots', labelKey: 'nav.centres', icon: FiMapPin },
  { path: '/queue', labelKey: 'nav.queue', icon: FiMonitor },
  { path: '/analytics', labelKey: 'nav.analytics', icon: FiBarChart2 },
  { path: '/reports', labelKey: 'nav.reports', icon: FiFileText },
];

export default function Sidebar({ collapsed, onToggle }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { user, logout } = useAuth();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const userName = user?.name || 'Admin';
  const userInitial = userName.charAt(0).toLowerCase();

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <div className="brand-icon">
          <GiWheat />
        </div>
        <div className="brand-text">
          <span className="brand-name">QueueKisan</span>
          <span className="brand-role">Admin Panel</span>
        </div>
      </div>

      <nav className="sidebar-nav">
        {navItemsConfig.map((item) => {
          const Icon = item.icon;
          const isActive = item.path === '/'
            ? location.pathname === '/'
            : location.pathname.startsWith(item.path);
          return (
            <NavLink
              key={item.path}
              to={item.path}
              className={`sidebar-nav-item ${isActive ? 'active' : ''}`}
              title={collapsed ? t(item.labelKey) : undefined}
            >
              <span className="nav-icon"><Icon /></span>
              <span className="nav-label">{t(item.labelKey)}</span>
            </NavLink>
          );
        })}
      </nav>

      <div className="sidebar-bottom">
        <div className="sidebar-collapse-btn">
          <button onClick={onToggle} title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
            {collapsed ? <FiChevronRight /> : <FiChevronLeft />}
          </button>
        </div>

        <div className="sidebar-user">
          <div className="sidebar-user-avatar">
            {userInitial}
          </div>
          {!collapsed && (
            <>
              <span className="sidebar-user-name">{userName}</span>
              <button
                className="sidebar-logout-btn"
                onClick={handleLogout}
                title="Logout"
              >
                <FiLogOut />
              </button>
            </>
          )}
        </div>
      </div>
    </aside>
  );
}

