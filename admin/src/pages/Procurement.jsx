import { useState, useMemo, useEffect } from 'react';
import DataTable from '../components/common/DataTable';
import StatusBadge from '../components/common/StatusBadge';
import SearchBar from '../components/common/SearchBar';
import { getProcurements, getCentres } from '../services/adminApi';
import { useLanguage } from '../context/LanguageContext';

export default function Procurement() {
  const { t } = useLanguage();
  const [searchTerm, setSearchTerm] = useState('');
  const [centreFilter, setCentreFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [cropFilter, setCropFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [procurements, setProcurements] = useState([]);
  const [centres, setCentres] = useState([]);

  useEffect(() => {
    Promise.all([
      getProcurements().catch(() => []),
      getCentres().catch(() => [])
    ]).then(([p, c]) => {
      setProcurements(p);
      setCentres(c);
    }).finally(() => {
      setLoading(false);
    });
  }, []);

  const filteredProcurements = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return procurements.filter(p => {
      const matchSearch = !term ||
        p.id?.toLowerCase().includes(term) ||
        p.farmerName?.toLowerCase().includes(term) ||
        p.centreName?.toLowerCase().includes(term) ||
        p.crop?.toLowerCase().includes(term);
      const matchCentre = centreFilter === 'all' || p.centreId === centreFilter;
      const matchStatus = statusFilter === 'all' || p.status === statusFilter;
      const matchCrop = cropFilter === 'all' || p.crop === cropFilter;
      return matchSearch && matchCentre && matchStatus && matchCrop;
    });
  }, [searchTerm, centreFilter, statusFilter, cropFilter, procurements]);

  const uniqueCrops = [...new Set(procurements.map(p => p.crop))];

  const columns = [
    { key: 'id', label: t('procurement.colId'), width: '120px' },
    { key: 'date', label: t('procurement.colDate'), width: '100px' },
    { key: 'centreName', label: t('procurement.colCentre') },
    { key: 'farmerName', label: t('procurement.colFarmer') },
    { key: 'crop', label: t('procurement.colCrop') },
    { key: 'quantity', label: t('procurement.colQty') },
    { key: 'qualityGrade', label: t('procurement.colGrade'), render: (val) => <strong style={{color: 'var(--krushi-green)'}}>{val}</strong> },
    { key: 'amount', label: t('procurement.colAmount'), render: (val) => `₹${val.toLocaleString()}` },
    { key: 'status', label: t('procurement.colStatus'), render: (val) => <StatusBadge status={val} /> }
  ];

  return (
    <div>
      <div className="section-header">
        <div>
          <h2 className="section-title">{t('procurement.title')}</h2>
          <p className="section-subtitle">{t('procurement.subtitle')}</p>
        </div>
      </div>

      <div className="card" style={{ padding: 0 }}>
        <div className="data-table-toolbar">
          <div className="toolbar-left">
            <SearchBar
              value={searchTerm}
              onChange={setSearchTerm}
              placeholder={t('procurement.searchPlaceholder') || 'Search by ID, Farmer, Centre...'}
            />
            <select className="filter-select" value={centreFilter} onChange={(e) => setCentreFilter(e.target.value)}>
              <option value="all">{t('procurement.allCentres')}</option>
              {centres.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            
            <select className="filter-select" value={cropFilter} onChange={(e) => setCropFilter(e.target.value)}>
              <option value="all">{t('procurement.allCrops')}</option>
              {uniqueCrops.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            
            <select className="filter-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="all">{t('procurement.allStatuses')}</option>
              <option value="completed">{t('procurement.completed')}</option>
              <option value="in-progress">{t('procurement.processing')}</option>
              <option value="pending">{t('procurement.pending')}</option>
            </select>
          </div>
          <div className="toolbar-right">
            <button className="btn btn-outline btn-sm">{t('procurement.exportData')}</button>
          </div>
        </div>
        
        <DataTable columns={columns} data={filteredProcurements} loading={loading} />
      </div>
    </div>
  );
}
