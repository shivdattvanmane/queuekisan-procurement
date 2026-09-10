import { useState, useMemo, useEffect } from 'react';
import DataTable from '../components/common/DataTable';
import StatusBadge from '../components/common/StatusBadge';
import SearchBar from '../components/common/SearchBar';
import { getPayments, getCentres } from '../services/adminApi';
import { FiDollarSign, FiClock, FiCheckCircle } from 'react-icons/fi';
import { useLanguage } from '../context/LanguageContext';
import { KPISkeleton } from '../components/common/Skeleton';

export default function Payments() {
  const { t } = useLanguage();
  const [searchTerm, setSearchTerm] = useState('');
  const [centreFilter, setCentreFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [payments, setPayments] = useState([]);
  const [centres, setCentres] = useState([]);

  useEffect(() => {
    Promise.all([
      getPayments().catch(() => []),
      getCentres().catch(() => [])
    ]).then(([p, c]) => {
      setPayments(p);
      setCentres(c);
    }).finally(() => {
      setLoading(false);
    });
  }, []);

  const filteredPayments = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return payments.filter(p => {
      const matchSearch = !term ||
        p.referenceId?.toLowerCase().includes(term) ||
        p.farmerName?.toLowerCase().includes(term) ||
        p.procurementId?.toLowerCase().includes(term) ||
        p.centreName?.toLowerCase().includes(term);
      const matchCentre = centreFilter === 'all' || p.centreId === centreFilter;
      const matchStatus = statusFilter === 'all' || p.status === statusFilter;
      return matchSearch && matchCentre && matchStatus;
    });
  }, [searchTerm, centreFilter, statusFilter, payments]);

  const totalAmount = filteredPayments.reduce((sum, p) => sum + p.amount, 0);
  const pendingAmount = filteredPayments.filter(p => p.status === 'pending').reduce((sum, p) => sum + p.amount, 0);
  const completedAmount = filteredPayments.filter(p => p.status === 'completed').reduce((sum, p) => sum + p.amount, 0);

  const columns = [
    { key: 'referenceId', label: t('payments.colRefId') },
    { key: 'farmerName', label: t('payments.colFarmer') },
    { key: 'procurementId', label: t('payments.colProcId') },
    { key: 'centreName', label: t('payments.colCentre') },
    { key: 'amount', label: t('payments.colAmount'), render: (val) => <strong>₹{val.toLocaleString()}</strong> },
    { key: 'method', label: t('payments.colMethod') },
    { key: 'paymentDate', label: t('payments.colDate'), render: (val) => val || '-' },
    { key: 'status', label: t('payments.colStatus'), render: (val) => <StatusBadge status={val} /> }
  ];

  return (
    <div>
      <div className="section-header">
        <div>
          <h2 className="section-title">{t('payments.title')}</h2>
          <p className="section-subtitle">{t('payments.subtitle')}</p>
        </div>
      </div>

      <div className="grid-3" style={{ marginBottom: '24px' }}>
        {loading ? (
          <>
            <KPISkeleton />
            <KPISkeleton />
            <KPISkeleton />
          </>
        ) : (
          <>
            <div className="kpi-card" style={{ borderLeft: '4px solid #3B82F6' }}>
              <div className="kpi-icon blue"><FiDollarSign /></div>
              <div className="kpi-content">
                <div className="kpi-label">{t('payments.totalAmount')}</div>
                <div className="kpi-value">₹{totalAmount.toLocaleString()}</div>
              </div>
            </div>
            <div className="kpi-card" style={{ borderLeft: '4px solid #16A34A' }}>
              <div className="kpi-icon green"><FiCheckCircle /></div>
              <div className="kpi-content">
                <div className="kpi-label">{t('payments.completedPayments')}</div>
                <div className="kpi-value">₹{completedAmount.toLocaleString()}</div>
              </div>
            </div>
            <div className="kpi-card" style={{ borderLeft: '4px solid #F97316' }}>
              <div className="kpi-icon orange"><FiClock /></div>
              <div className="kpi-content">
                <div className="kpi-label">{t('payments.pendingPayments')}</div>
                <div className="kpi-value">₹{pendingAmount.toLocaleString()}</div>
              </div>
            </div>
          </>
        )}
      </div>

      <div className="card" style={{ padding: 0 }}>
        <div className="data-table-toolbar">
          <div className="toolbar-left">
            <SearchBar
              value={searchTerm}
              onChange={setSearchTerm}
              placeholder={t('payments.searchPlaceholder') || 'Search Ref ID, Farmer, Centre...'}
            />
            <select className="filter-select" value={centreFilter} onChange={(e) => setCentreFilter(e.target.value)}>
              <option value="all">{t('payments.allCentres')}</option>
              {centres.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            
            <select className="filter-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="all">{t('payments.allStatuses')}</option>
              <option value="completed">{t('payments.completed')}</option>
              <option value="pending">{t('payments.pending')}</option>
              <option value="failed">{t('payments.failed')}</option>
            </select>
          </div>
        </div>
        
        <DataTable columns={columns} data={filteredPayments} loading={loading} />
      </div>
    </div>
  );
}
