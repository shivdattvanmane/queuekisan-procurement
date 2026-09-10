import { useState, useMemo, useEffect } from 'react';
import DataTable from '../components/common/DataTable';
import SearchBar from '../components/common/SearchBar';
import StatusBadge from '../components/common/StatusBadge';
import Modal from '../components/common/Modal';
import { getFarmers, getBookingHistoryFor, getProcurements, getPayments } from '../services/adminApi';
import { FiUser, FiPhone, FiMapPin, FiCreditCard } from 'react-icons/fi';
import { useLanguage } from '../context/LanguageContext';

export default function Farmers() {
  const { t } = useLanguage();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedFarmer, setSelectedFarmer] = useState(null);
  const [activeTab, setActiveTab] = useState('info');
  const [loading, setLoading] = useState(true);
  const [farmers, setFarmers] = useState([]);
  const [procurements, setProcurements] = useState([]);
  const [payments, setPayments] = useState([]);
  const [bookingHistory, setBookingHistory] = useState({});

  useEffect(() => {
    Promise.all([
      getFarmers().catch(() => []),
      getProcurements().catch(() => []),
      getPayments().catch(() => [])
    ]).then(([f, pr, py]) => {
      setFarmers(f);
      setProcurements(pr);
      setPayments(py);
    }).finally(() => {
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (!selectedFarmer) return;
    getBookingHistoryFor(selectedFarmer.id)
      .then((rows) => setBookingHistory((prev) => ({ ...prev, [selectedFarmer.id]: rows })))
      .catch(console.error);
  }, [selectedFarmer]);

  const filteredFarmers = useMemo(() => {
    return farmers.filter(f => {
      const matchesSearch = 
        f.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        f.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
        f.mobile.includes(searchTerm) ||
        f.village.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesStatus = statusFilter === 'all' || f.status === statusFilter;
      
      return matchesSearch && matchesStatus;
    });
  }, [searchTerm, statusFilter]);

  const columns = [
    { key: 'id', label: t('farmers.colId') },
    { key: 'name', label: t('farmers.colName'), render: (val) => <strong style={{ color: 'var(--krushi-green)' }}>{val}</strong> },
    { key: 'mobile', label: t('farmers.colMobile') },
    { key: 'village', label: t('farmers.colVillage') },
    { key: 'totalBookings', label: t('farmers.colBookings') },
    { key: 'paymentDetails', label: 'Payment Details', render: (val) => <StatusBadge status={val} /> },
    { key: 'status', label: t('farmers.colStatus'), render: (val) => <StatusBadge status={val} /> }
  ];

  const handleRowClick = (farmer) => {
    setSelectedFarmer(farmer);
    setActiveTab('info');
  };

  return (
    <div>
      <div className="section-header">
        <div>
          <h2 className="section-title">{t('farmers.title')}</h2>
          <p className="section-subtitle">{t('farmers.subtitle')}</p>
        </div>
      </div>

      <div className="card" style={{ padding: 0 }}>
        <div className="data-table-toolbar">
          <div className="toolbar-left">
            <SearchBar 
              value={searchTerm} 
              onChange={setSearchTerm} 
              placeholder={t('farmers.searchPlaceholder')} 
            />
            <select 
              className="filter-select" 
              value={statusFilter} 
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="all">{t('farmers.allStatuses')}</option>
              <option value="active">{t('farmers.active')}</option>
              <option value="inactive">{t('farmers.inactive')}</option>
            </select>
          </div>
          <div className="toolbar-right">
            <span style={{ fontSize: 'var(--font-sm)', color: 'var(--color-text-secondary)' }}>
              {t('farmers.total')}: {filteredFarmers.length} {t('farmers.farmers')}
            </span>
          </div>
        </div>
        
        <DataTable 
          columns={columns} 
          data={filteredFarmers} 
          onRowClick={handleRowClick}
          loading={loading}
        />
      </div>

      {selectedFarmer && (
        <Modal 
          isOpen={!!selectedFarmer} 
          onClose={() => setSelectedFarmer(null)} 
          title={`${t('farmers.profile')}: ${selectedFarmer.name}`}
          size="lg"
        >
          <div className="tabs">
            <div className={`tab ${activeTab === 'info' ? 'active' : ''}`} onClick={() => setActiveTab('info')}>{t('farmers.tabInfo')}</div>
            <div className={`tab ${activeTab === 'bookings' ? 'active' : ''}`} onClick={() => setActiveTab('bookings')}>{t('farmers.tabBookings')}</div>
            <div className={`tab ${activeTab === 'procurements' ? 'active' : ''}`} onClick={() => setActiveTab('procurements')}>{t('farmers.tabProcurements')}</div>
            <div className={`tab ${activeTab === 'payments' ? 'active' : ''}`} onClick={() => setActiveTab('payments')}>{t('farmers.tabPayments')}</div>
          </div>

          <div style={{ minHeight: '300px' }}>
            {activeTab === 'info' && (
              <div className="grid-2">
                <div>
                  <div style={{ marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'var(--krushi-light)', color: 'var(--krushi-green)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px', fontWeight: 'bold' }}>
                      {selectedFarmer.name.charAt(0)}
                    </div>
                    <div>
                      <h3 style={{ fontSize: '1.25rem', marginBottom: '4px' }}>{selectedFarmer.name}</h3>
                      <StatusBadge status={selectedFarmer.status} />
                    </div>
                  </div>
                  
                  <div className="form-group">
                    <label className="form-label" style={{ color: 'var(--color-text-secondary)', fontSize: '0.75rem', marginBottom: '2px' }}>{t('farmers.farmerId')}</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 500 }}>
                      <FiUser className="text-muted" /> {selectedFarmer.id}
                    </div>
                  </div>
                  
                  <div className="form-group">
                    <label className="form-label" style={{ color: 'var(--color-text-secondary)', fontSize: '0.75rem', marginBottom: '2px' }}>{t('farmers.mobileNumber')}</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 500 }}>
                      <FiPhone className="text-muted" /> {selectedFarmer.mobile}
                    </div>
                  </div>
                  
                  <div className="form-group">
                    <label className="form-label" style={{ color: 'var(--color-text-secondary)', fontSize: '0.75rem', marginBottom: '2px' }}>{t('farmers.aadhaar')}</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 500 }}>
                      <FiCreditCard className="text-muted" /> {selectedFarmer.aadhaar}
                    </div>
                  </div>
                </div>
                
                <div>
                  <h4 style={{ fontSize: '1rem', marginBottom: '16px', borderBottom: '1px solid var(--color-border)', paddingBottom: '8px' }}>{t('farmers.locationDetails')}</h4>
                  
                  <div className="form-group">
                    <label className="form-label" style={{ color: 'var(--color-text-secondary)', fontSize: '0.75rem', marginBottom: '2px' }}>{t('farmers.village')}</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 500 }}>
                      <FiMapPin className="text-muted" /> {selectedFarmer.village}
                    </div>
                  </div>
                  
                  <div className="form-group">
                    <label className="form-label" style={{ color: 'var(--color-text-secondary)', fontSize: '0.75rem', marginBottom: '2px' }}>{t('farmers.talukaDistrict')}</label>
                    <div style={{ fontWeight: 500 }}>{selectedFarmer.taluka}, {selectedFarmer.district}</div>
                  </div>
                  
                  <div className="form-group" style={{ marginTop: '24px' }}>
                    <label className="form-label" style={{ color: 'var(--color-text-secondary)', fontSize: '0.75rem', marginBottom: '2px' }}>{t('farmers.registrationDate')}</label>
                    <div style={{ fontWeight: 500 }}>{selectedFarmer.registeredDate}</div>
                  </div>

                  <div className="form-group" style={{ marginTop: '24px' }}>
                    <label className="form-label" style={{ color: 'var(--color-text-secondary)', fontSize: '0.75rem', marginBottom: '2px' }}>Payment Details</label>
                    {selectedFarmer.paymentProfile ? (
                      <div style={{ display: 'grid', gap: '6px', fontWeight: 500 }}>
                        <div>{selectedFarmer.paymentProfile.accountHolder || '-'}</div>
                        <div>{selectedFarmer.paymentProfile.bankName || '-'}</div>
                        <div>{selectedFarmer.paymentProfile.accountNumber || '-'}</div>
                        <div>{selectedFarmer.paymentProfile.ifscCode || '-'}{selectedFarmer.paymentProfile.upiId ? ` / ${selectedFarmer.paymentProfile.upiId}` : ''}</div>
                      </div>
                    ) : (
                      <div style={{ color: 'var(--color-text-secondary)' }}>Not added by farmer</div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'bookings' && (
              <DataTable 
                columns={[
                  { key: 'bookingId', label: t('farmers.bookingId') },
                  { key: 'centreName', label: t('farmers.centre') },
                  { key: 'slotDate', label: t('farmers.date') },
                  { key: 'slotTime', label: t('farmers.time') },
                  { key: 'crop', label: t('farmers.crop') },
                  { key: 'status', label: t('farmers.colStatus'), render: (val) => <StatusBadge status={val} /> }
                ]}
                data={bookingHistory[selectedFarmer.id] || []}
              />
            )}

            {activeTab === 'procurements' && (
              <DataTable 
                columns={[
                  { key: 'id', label: t('farmers.id') },
                  { key: 'date', label: t('farmers.date') },
                  { key: 'crop', label: t('farmers.crop') },
                  { key: 'quantity', label: t('farmers.qty') },
                  { key: 'amount', label: t('farmers.amount'), render: (val) => val ? `₹${Number(val).toLocaleString()}` : '-' },
                  { key: 'status', label: t('farmers.colStatus'), render: (val) => <StatusBadge status={val} /> }
                ]}
                data={procurements.filter(p => p.farmerId === selectedFarmer.id)}
              />
            )}

            {activeTab === 'payments' && (
              <DataTable 
                columns={[
                  { key: 'referenceId', label: t('farmers.refId') },
                  { key: 'procurementId', label: t('farmers.procId') },
                  { key: 'amount', label: t('farmers.amount'), render: (val) => val ? `₹${Number(val).toLocaleString()}` : '₹0' },
                  { key: 'paymentDate', label: t('farmers.date'), render: (val) => val || '-' },
                  { key: 'status', label: t('farmers.colStatus'), render: (val) => <StatusBadge status={val} /> }
                ]}
                data={payments.filter(p => p.farmerId === selectedFarmer.id)}
              />
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
