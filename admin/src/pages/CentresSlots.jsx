import { useMemo, useState, useEffect } from 'react'
import DataTable from '../components/common/DataTable'
import StatusBadge from '../components/common/StatusBadge'
import Modal from '../components/common/Modal'
import {
  getCentres,
  getSlots,
  getOfficers,
  getCounters,
  getOperators,
  getCentreStats,
  getCounterPerformance,
  createCentre,
  updateCentre,
  deleteCentre,
  toggleCentreStatus,
  createCounter,
  updateCounter,
  deleteCounter,
  toggleCounterStatus,
  createOperator,
  updateOperator,
  deleteOperator,
  generateSlots,
} from '../services/adminApi'
import {
  FiPlus,
  FiEdit2,
  FiPower,
  FiTrash2,
  FiMapPin,
  FiCalendar,
  FiUsers,
  FiGrid,
  FiBarChart2,
  FiTrendingUp,
  FiKey,
  FiEye,
  FiEyeOff,
  FiCheckCircle,
  FiActivity,
} from 'react-icons/fi'
import { useLanguage } from '../context/LanguageContext'

const EMPTY_CENTRE = {
  name: '',
  taluka: '',
  district: 'Ahmednagar',
  address: '',
  capacity: 20,
  status: 'active',
  contact: '',
  coordinates: '',
}

const EMPTY_COUNTER_FORM = {
  centreId: '',
  counterNumber: 'C1',
  officerId: '',
  status: 'active',
}

const EMPTY_OPERATOR_FORM = {
  name: '',
  email: '',
  phone: '',
  password: '',
  centreId: '',
  counterId: '',
}

const EMPTY_SLOT_FORM = {
  centreId: '',
  startDate: '',
  endDate: '',
  startTime: '09:00',
  endTime: '18:00',
  duration: '60',
  capacity: '20',
}

export default function CentresSlots() {
  const { t } = useLanguage()
  const [activeTab, setActiveTab] = useState('centres')
  const [loading, setLoading] = useState(true)

  // Data states
  const [centres, setCentres] = useState([])
  const [slots, setSlots] = useState([])
  const [counters, setCounters] = useState([])
  const [operators, setOperators] = useState([])
  const [centreStats, setCentreStats] = useState([])
  const [counterPerformance, setCounterPerformance] = useState([])

  // Selection & Modal states
  const [selectedCentre, setSelectedCentre] = useState(null)
  const [selectedCounter, setSelectedCounter] = useState(null)
  const [selectedOperator, setSelectedOperator] = useState(null)

  const [isCentreModalOpen, setIsCentreModalOpen] = useState(false)
  const [isCounterModalOpen, setIsCounterModalOpen] = useState(false)
  const [isOperatorModalOpen, setIsOperatorModalOpen] = useState(false)
  const [isSlotModalOpen, setIsSlotModalOpen] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState({ isOpen: false, type: '', id: '', name: '' })

  // Form states
  const [centreForm, setCentreForm] = useState(EMPTY_CENTRE)
  const [counterForm, setCounterForm] = useState(EMPTY_COUNTER_FORM)
  const [operatorForm, setOperatorForm] = useState(EMPTY_OPERATOR_FORM)
  const [slotForm, setSlotForm] = useState(EMPTY_SLOT_FORM)
  const [showPasswords, setShowPasswords] = useState({})

  // Filters
  const [slotCentreFilter, setSlotCentreFilter] = useState('all')
  const [slotDateFilter, setSlotDateFilter] = useState('')
  const [counterCentreFilter, setCounterCentreFilter] = useState('all')
  const [operatorCentreFilter, setOperatorCentreFilter] = useState('all')

  const loadData = async () => {
    try {
      setLoading(true)
      const [
        centresData,
        slotsData,
        countersData,
        operatorsData,
        statsData,
        performanceData,
      ] = await Promise.all([
        getCentres().catch(() => []),
        getSlots().catch(() => []),
        getCounters().catch(() => []),
        getOperators().catch(() => []),
        getCentreStats().catch(() => []),
        getCounterPerformance().catch(() => []),
      ])

      setCentres(centresData)
      setSlots(slotsData)
      setCounters(countersData)
      setOperators(operatorsData)
      setCentreStats(statsData)
      setCounterPerformance(performanceData)

      if (!slotForm.centreId && centresData[0]) {
        setSlotForm((prev) => ({ ...prev, centreId: String(centresData[0].dbId) }))
      }
      if (!counterForm.centreId && centresData[0]) {
        setCounterForm((prev) => ({ ...prev, centreId: String(centresData[0].id) }))
      }
    } catch (error) {
      console.error('[CentresSlots] Error loading data:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  // Sync edit forms
  useEffect(() => {
    if (selectedCentre) {
      setCentreForm({
        name: selectedCentre.name || '',
        taluka: selectedCentre.taluka || '',
        district: selectedCentre.district || 'Ahmednagar',
        address: selectedCentre.address || '',
        capacity: selectedCentre.capacity || 20,
        status: selectedCentre.status || 'active',
        contact: selectedCentre.contact === '—' ? '' : (selectedCentre.contact || ''),
        coordinates: selectedCentre.coordinates === '—' ? '' : (selectedCentre.coordinates || ''),
      })
    } else {
      setCentreForm(EMPTY_CENTRE)
    }
  }, [selectedCentre])

  useEffect(() => {
    if (selectedCounter) {
      setCounterForm({
        centreId: selectedCounter.centreId || (centres[0]?.id || ''),
        counterNumber: selectedCounter.counterNumber || 'C1',
        officerId: selectedCounter.officerId || '',
        status: selectedCounter.status || 'active',
      })
    } else {
      setCounterForm({
        centreId: centres[0]?.id || '',
        counterNumber: `C${(counters.length % 5) + 1}`,
        officerId: '',
        status: 'active',
      })
    }
  }, [selectedCounter, centres, counters])

  useEffect(() => {
    if (selectedOperator) {
      setOperatorForm({
        name: selectedOperator.name || '',
        email: selectedOperator.email || '',
        phone: selectedOperator.phone === '—' ? '' : selectedOperator.phone,
        password: selectedOperator.password === '******' ? '' : selectedOperator.password,
        centreId: selectedOperator.centreId || '',
        counterId: selectedOperator.counterId || '',
      })
    } else {
      setOperatorForm(EMPTY_OPERATOR_FORM)
    }
  }, [selectedOperator])

  // Filters
  const filteredSlots = useMemo(() => slots.filter((slot) => {
    const matchCentre = slotCentreFilter === 'all' || slot.centreId === slotCentreFilter || slot.centreDbId === slotCentreFilter
    const matchDate = !slotDateFilter || slot.date === slotDateFilter
    return matchCentre && matchDate
  }), [slots, slotCentreFilter, slotDateFilter])

  const filteredCounters = useMemo(() => counters.filter((c) => {
    return counterCentreFilter === 'all' || c.centreId === counterCentreFilter
  }), [counters, counterCentreFilter])

  const filteredOperators = useMemo(() => operators.filter((op) => {
    return operatorCentreFilter === 'all' || op.centreId === operatorCentreFilter
  }), [operators, operatorCentreFilter])

  // ── Centre Actions ──
  async function handleToggleCentre(row) {
    try {
      await toggleCentreStatus(row.dbId)
      await loadData()
    } catch (error) {
      console.error(error)
      alert(error.message || 'Unable to update centre status.')
    }
  }

  async function handleSaveCentre() {
    if (!centreForm.name.trim()) {
      alert('Please enter a centre name.')
      return
    }
    try {
      if (selectedCentre?.dbId) {
        await updateCentre(selectedCentre.dbId, { ...centreForm, capacity: Number(centreForm.capacity) })
      } else {
        await createCentre({ ...centreForm, capacity: Number(centreForm.capacity) })
      }
      setIsCentreModalOpen(false)
      setSelectedCentre(null)
      await loadData()
    } catch (error) {
      console.error(error)
      alert(error.message || 'Unable to save centre.')
    }
  }

  async function handleDeleteConfirm() {
    try {
      if (deleteConfirm.type === 'centre') {
        await deleteCentre(deleteConfirm.id)
      } else if (deleteConfirm.type === 'counter') {
        await deleteCounter(deleteConfirm.id)
      } else if (deleteConfirm.type === 'operator') {
        await deleteOperator(deleteConfirm.id)
      }
      setDeleteConfirm({ isOpen: false, type: '', id: '', name: '' })
      await loadData()
    } catch (error) {
      console.error(error)
      alert(error.message || 'Unable to delete record.')
    }
  }

  // ── Counter Actions ──
  async function handleSaveCounter() {
    if (!counterForm.centreId) {
      alert('Please select a centre.')
      return
    }
    try {
      if (selectedCounter?.id) {
        await updateCounter(selectedCounter.id, counterForm)
      } else {
        await createCounter(counterForm)
      }
      setIsCounterModalOpen(false)
      setSelectedCounter(null)
      await loadData()
    } catch (error) {
      console.error(error)
      alert(error.message || 'Unable to save counter.')
    }
  }

  async function handleToggleCounter(row) {
    try {
      await toggleCounterStatus(row.id)
      await loadData()
    } catch (error) {
      console.error(error)
      alert(error.message || 'Unable to toggle counter status.')
    }
  }

  // ── Operator Actions ──
  async function handleSaveOperator() {
    if (!operatorForm.name.trim() || !operatorForm.email.trim()) {
      alert('Please enter operator name and email.')
      return
    }
    try {
      if (selectedOperator?.id) {
        await updateOperator(selectedOperator.id, operatorForm)
      } else {
        await createOperator(operatorForm)
      }
      setIsOperatorModalOpen(false)
      setSelectedOperator(null)
      await loadData()
    } catch (error) {
      console.error(error)
      alert(error.message || 'Unable to save operator account.')
    }
  }

  // ── Slots Actions ──
  async function handleGenerateSlots() {
    if (!slotForm.centreId || !slotForm.startDate || !slotForm.endDate) {
      alert('Please choose a centre and select start and end dates.')
      return
    }
    try {
      await generateSlots({
        centre_id: slotForm.centreId,
        start_date: slotForm.startDate,
        end_date: slotForm.endDate,
        start_time: slotForm.startTime,
        end_time: slotForm.endTime,
        slot_duration_minutes: Number(slotForm.duration),
        capacity: Number(slotForm.capacity),
      })
      setIsSlotModalOpen(false)
      await loadData()
    } catch (error) {
      console.error(error)
      alert(error.message || 'Unable to generate slots.')
    }
  }

  // ── Column Definitions ──
  const centreColumns = [
    { key: 'id', label: t('centres.colCentreId') || 'Centre ID', width: '110px' },
    { key: 'name', label: t('centres.colName') || 'Centre Name', render: (val) => <strong style={{ color: 'var(--krushi-green)' }}>{val}</strong> },
    { key: 'taluka', label: t('centres.colTaluka') || 'Taluka' },
    { key: 'district', label: 'District' },
    { key: 'capacity', label: t('centres.colCapacity') || 'Daily Capacity', render: (val) => <strong>{val}</strong> },
    {
      key: 'currentOccupancy',
      label: t('centres.colCurrentLoad') || 'Load Status',
      render: (val, row) => {
        const occ = val || 0
        const cap = Number(row.capacity || 20)
        const pct = Math.min(100, Math.round((occ / cap) * 100))
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '0.8rem', minWidth: '45px' }}>{occ}/{cap}</span>
            <div className={`progress-bar ${pct > 80 ? 'danger' : 'green'}`} style={{ width: '60px', height: '6px', background: '#e5e7eb', borderRadius: '4px', overflow: 'hidden' }}>
              <div className="progress-fill" style={{ width: `${pct}%`, height: '100%', background: pct > 80 ? '#ef4444' : '#16a34a' }} />
            </div>
          </div>
        )
      },
    },
    { key: 'status', label: t('centres.colStatus') || 'Status', render: (val) => <StatusBadge status={val} /> },
    {
      key: 'actions',
      label: t('centres.colActions') || 'Actions',
      sortable: false,
      render: (_, row) => (
        <div style={{ display: 'flex', gap: '6px' }}>
          <button
            className="btn-icon"
            style={{ background: 'var(--krushi-light)', color: 'var(--krushi-green)', border: 'none', padding: '6px', borderRadius: '6px', cursor: 'pointer' }}
            title="Edit Centre"
            onClick={(e) => { e.stopPropagation(); setSelectedCentre(row); setIsCentreModalOpen(true) }}
          >
            <FiEdit2 size={14} />
          </button>
          <button
            className="btn-icon"
            style={{
              background: row.status === 'active' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(22, 163, 74, 0.1)',
              color: row.status === 'active' ? '#EF4444' : '#16A34A',
              border: 'none',
              padding: '6px',
              borderRadius: '6px',
              cursor: 'pointer',
            }}
            title={row.status === 'active' ? 'Turn Off / Deactivate Centre' : 'Activate Centre'}
            onClick={(e) => { e.stopPropagation(); handleToggleCentre(row) }}
          >
            <FiPower size={14} />
          </button>
          <button
            className="btn-icon"
            style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#EF4444', border: 'none', padding: '6px', borderRadius: '6px', cursor: 'pointer' }}
            title="Delete Centre"
            onClick={(e) => { e.stopPropagation(); setDeleteConfirm({ isOpen: true, type: 'centre', id: row.dbId, name: row.name }) }}
          >
            <FiTrash2 size={14} />
          </button>
        </div>
      ),
    },
  ]

  const counterColumns = [
    { key: 'counterNumber', label: 'Counter #', width: '100px', render: (val) => <strong style={{ color: 'var(--krushi-green)' }}>{val}</strong> },
    { key: 'centreName', label: 'Procurement Centre' },
    { key: 'officerName', label: 'Assigned Operator', render: (val, row) => (
      <div>
        <div style={{ fontWeight: 600 }}>{val}</div>
        <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{row.officerEmail || row.officerMobile}</div>
      </div>
    )},
    { key: 'status', label: 'Counter Status', render: (val) => <StatusBadge status={val} /> },
    {
      key: 'actions',
      label: 'Actions',
      sortable: false,
      render: (_, row) => (
        <div style={{ display: 'flex', gap: '6px' }}>
          <button
            className="btn-icon"
            style={{ background: 'var(--krushi-light)', color: 'var(--krushi-green)', border: 'none', padding: '6px', borderRadius: '6px', cursor: 'pointer' }}
            title="Edit Counter / Assign Operator"
            onClick={(e) => { e.stopPropagation(); setSelectedCounter(row); setIsCounterModalOpen(true) }}
          >
            <FiEdit2 size={14} />
          </button>
          <button
            className="btn-icon"
            style={{
              background: row.status === 'active' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(22, 163, 74, 0.1)',
              color: row.status === 'active' ? '#EF4444' : '#16A34A',
              border: 'none',
              padding: '6px',
              borderRadius: '6px',
              cursor: 'pointer',
            }}
            title={row.status === 'active' ? 'Disable Counter' : 'Enable Counter'}
            onClick={(e) => { e.stopPropagation(); handleToggleCounter(row) }}
          >
            <FiPower size={14} />
          </button>
          <button
            className="btn-icon"
            style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#EF4444', border: 'none', padding: '6px', borderRadius: '6px', cursor: 'pointer' }}
            title="Delete Counter"
            onClick={(e) => { e.stopPropagation(); setDeleteConfirm({ isOpen: true, type: 'counter', id: row.id, name: `${row.counterNumber} (${row.centreName})` }) }}
          >
            <FiTrash2 size={14} />
          </button>
        </div>
      ),
    },
  ]

  const operatorColumns = [
    { key: 'name', label: 'Operator Name', render: (val, row) => (
      <div>
        <div style={{ fontWeight: 600, color: 'var(--krushi-green)' }}>{val}</div>
        <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>ID: {row.id}</div>
      </div>
    )},
    { key: 'email', label: 'Login Email' },
    { key: 'phone', label: 'Phone Number' },
    { key: 'centreName', label: 'Assigned Centre' },
    { key: 'counterNumber', label: 'Assigned Counter', render: (val) => <span className="status-badge green">{val}</span> },
    {
      key: 'password',
      label: 'Credentials / PIN',
      render: (val, row) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontFamily: 'monospace' }}>
          <span>{showPasswords[row.id] ? val : '••••••'}</span>
          <button
            type="button"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', padding: '2px' }}
            onClick={() => setShowPasswords(p => ({ ...p, [row.id]: !p[row.id] }))}
            title={showPasswords[row.id] ? 'Hide PIN' : 'View PIN'}
          >
            {showPasswords[row.id] ? <FiEyeOff size={14} /> : <FiEye size={14} />}
          </button>
        </div>
      ),
    },
    {
      key: 'actions',
      label: 'Actions',
      sortable: false,
      render: (_, row) => (
        <div style={{ display: 'flex', gap: '6px' }}>
          <button
            className="btn-icon"
            style={{ background: 'var(--krushi-light)', color: 'var(--krushi-green)', border: 'none', padding: '6px', borderRadius: '6px', cursor: 'pointer' }}
            title="Edit Operator Profile"
            onClick={(e) => { e.stopPropagation(); setSelectedOperator(row); setIsOperatorModalOpen(true) }}
          >
            <FiEdit2 size={14} />
          </button>
          <button
            className="btn-icon"
            style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#EF4444', border: 'none', padding: '6px', borderRadius: '6px', cursor: 'pointer' }}
            title="Delete Operator Account"
            onClick={(e) => { e.stopPropagation(); setDeleteConfirm({ isOpen: true, type: 'operator', id: row.id, name: row.name }) }}
          >
            <FiTrash2 size={14} />
          </button>
        </div>
      ),
    },
  ]

  const centreStatsColumns = [
    { key: 'centreName', label: 'Procurement Centre', render: (val) => <strong style={{ color: 'var(--krushi-green)' }}>{val}</strong> },
    { key: 'taluka', label: 'Taluka' },
    { key: 'capacity', label: 'Daily Cap' },
    { key: 'todayBookings', label: "Today's Bookings", render: (val) => <span style={{ fontWeight: 600 }}>{val}</span> },
    { key: 'waiting', label: 'Waiting Queue', render: (val) => <span style={{ color: val > 0 ? '#f59e0b' : '#16a34a', fontWeight: 600 }}>{val}</span> },
    { key: 'completed', label: 'Completed Tokens' },
    { key: 'totalWeightKg', label: 'Procured Volume', render: (val) => <strong>{val}</strong> },
    { key: 'totalAmount', label: 'Total Value', render: (val) => <span style={{ color: 'var(--krushi-green)', fontWeight: 600 }}>{val}</span> },
    {
      key: 'loadPct',
      label: 'Capacity Load',
      render: (val) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span>{val}%</span>
          <div style={{ width: '40px', height: '6px', background: '#e5e7eb', borderRadius: '3px', overflow: 'hidden' }}>
            <div style={{ width: `${val}%`, height: '100%', background: val > 80 ? '#ef4444' : '#16a34a' }} />
          </div>
        </div>
      ),
    },
  ]

  const counterPerfColumns = [
    { key: 'counterNumber', label: 'Counter #', render: (val) => <strong style={{ color: 'var(--krushi-green)' }}>{val}</strong> },
    { key: 'centreName', label: 'Centre' },
    { key: 'officerName', label: 'Assigned Operator' },
    { key: 'status', label: 'Status', render: (val) => <StatusBadge status={val} /> },
    { key: 'currentlyServing', label: 'Active Token', render: (val) => <span className="status-badge blue">{val}</span> },
    { key: 'completedToday', label: 'Served Today', render: (val) => <strong style={{ fontSize: '1rem' }}>{val}</strong> },
    { key: 'avgServiceMinutes', label: 'Avg Handling Time' },
    { key: 'performanceScore', label: 'Throughput Score', render: (val) => <span style={{ color: '#16a34a', fontWeight: 700 }}>{val}</span> },
  ]

  const slotColumns = [
    { key: 'centreName', label: t('centres.colName') || 'Centre' },
    { key: 'crop', label: t('common.crop') || 'Crop' },
    { key: 'date', label: t('centres.colDate') || 'Date' },
    { key: 'timeSlot', label: t('centres.colTimeSlot') || 'Time Slot' },
    { key: 'capacity', label: t('centres.colSlotCapacity') || 'Capacity' },
    { key: 'booked', label: t('centres.colBooked') || 'Booked' },
    {
      key: 'remaining',
      label: t('centres.colRemaining') || 'Available',
      render: (_, row) => (
        <strong style={{ color: row.capacity - row.booked <= 2 ? 'var(--color-danger)' : 'var(--krushi-green)' }}>
          {row.capacity - row.booked}
        </strong>
      ),
    },
    { key: 'status', label: t('centres.colStatus') || 'Status', render: (val) => <StatusBadge status={val} /> },
  ]

  const activeCentresCount = centres.filter(c => c.status === 'active').length
  const activeCountersCount = counters.filter(c => c.status === 'active').length

  return (
    <div>
      {/* ── Section Header ── */}
      <div className="section-header">
        <div>
          <h2 className="section-title">Procurement Centre & Counter Operations</h2>
          <p className="section-subtitle">Manage procurement hubs, counters, operator credentials, and live operational stats.</p>
        </div>
      </div>

      {/* ── KPI Stat Row ── */}
      <div className="grid-4" style={{ marginBottom: '24px' }}>
        <div style={{ padding: '16px 20px', background: 'var(--color-card, #fff)', borderRadius: '12px', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-card)' }}>
          <div style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <FiMapPin style={{ color: 'var(--krushi-green)' }} /> Total Centres
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 700, color: 'var(--krushi-green)' }}>
            {centres.length} <span style={{ fontSize: '0.85rem', fontWeight: 500, color: '#16a34a' }}>({activeCentresCount} Active)</span>
          </div>
        </div>

        <div style={{ padding: '16px 20px', background: 'var(--color-card, #fff)', borderRadius: '12px', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-card)' }}>
          <div style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <FiGrid style={{ color: '#3b82f6' }} /> Operational Counters
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 700, color: '#1e40af' }}>
            {counters.length} <span style={{ fontSize: '0.85rem', fontWeight: 500, color: '#3b82f6' }}>({activeCountersCount} Online)</span>
          </div>
        </div>

        <div style={{ padding: '16px 20px', background: 'var(--color-card, #fff)', borderRadius: '12px', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-card)' }}>
          <div style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <FiUsers style={{ color: '#f59e0b' }} /> Counter Operators
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 700, color: '#b45309' }}>
            {operators.length}
          </div>
        </div>

        <div style={{ padding: '16px 20px', background: 'var(--color-card, #fff)', borderRadius: '12px', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-card)' }}>
          <div style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <FiActivity style={{ color: '#8b5cf6' }} /> Active Capacity
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 700, color: '#6d28d9' }}>
            {centres.reduce((sum, c) => sum + (c.status === 'active' ? Number(c.capacity || 0) : 0), 0)} slots/day
          </div>
        </div>
      </div>

      {/* ── Main Navigation Tabs & Data Card ── */}
      <div className="card" style={{ padding: '0 0 var(--space-6) 0' }}>
        <div style={{ padding: 'var(--space-5) var(--space-6) 0', borderBottom: '1px solid var(--color-border)' }}>
          <div className="tabs" style={{ marginBottom: 0 }}>
            <div className={`tab ${activeTab === 'centres' ? 'active' : ''}`} onClick={() => setActiveTab('centres')}>
              <FiMapPin style={{ marginRight: '6px' }} /> Centres Management
            </div>
            <div className={`tab ${activeTab === 'counters' ? 'active' : ''}`} onClick={() => setActiveTab('counters')}>
              <FiGrid style={{ marginRight: '6px' }} /> Counters
            </div>
            <div className={`tab ${activeTab === 'operators' ? 'active' : ''}`} onClick={() => setActiveTab('operators')}>
              <FiKey style={{ marginRight: '6px' }} /> Operators & Credentials
            </div>
            <div className={`tab ${activeTab === 'stats' ? 'active' : ''}`} onClick={() => setActiveTab('stats')}>
              <FiBarChart2 style={{ marginRight: '6px' }} /> Centre Statistics
            </div>
            <div className={`tab ${activeTab === 'performance' ? 'active' : ''}`} onClick={() => setActiveTab('performance')}>
              <FiTrendingUp style={{ marginRight: '6px' }} /> Counter Performance
            </div>
            <div className={`tab ${activeTab === 'slots' ? 'active' : ''}`} onClick={() => setActiveTab('slots')}>
              <FiCalendar style={{ marginRight: '6px' }} /> Slots
            </div>
          </div>
        </div>

        {/* ── Tab 1: Centres Management ── */}
        {activeTab === 'centres' && (
          <div>
            <div className="data-table-toolbar">
              <div className="toolbar-left">
                <span style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
                  Total: {centres.length} Procurement Centres
                </span>
              </div>
              <div className="toolbar-right">
                <button
                  className="btn btn-primary"
                  onClick={() => { setSelectedCentre(null); setIsCentreModalOpen(true) }}
                >
                  <FiPlus /> Add Procurement Centre
                </button>
              </div>
            </div>
            <DataTable columns={centreColumns} data={centres} loading={loading} />
          </div>
        )}

        {/* ── Tab 2: Counters Management ── */}
        {activeTab === 'counters' && (
          <div>
            <div className="data-table-toolbar">
              <div className="toolbar-left">
                <select
                  className="filter-select"
                  value={counterCentreFilter}
                  onChange={(e) => setCounterCentreFilter(e.target.value)}
                >
                  <option value="all">All Centres</option>
                  {centres.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="toolbar-right">
                <button
                  className="btn btn-primary"
                  onClick={() => { setSelectedCounter(null); setIsCounterModalOpen(true) }}
                >
                  <FiPlus /> Add Counter
                </button>
              </div>
            </div>
            <DataTable columns={counterColumns} data={filteredCounters} loading={loading} />
          </div>
        )}

        {/* ── Tab 3: Counter Operators & Credentials ── */}
        {activeTab === 'operators' && (
          <div>
            <div className="data-table-toolbar">
              <div className="toolbar-left">
                <select
                  className="filter-select"
                  value={operatorCentreFilter}
                  onChange={(e) => setOperatorCentreFilter(e.target.value)}
                >
                  <option value="all">All Centres</option>
                  {centres.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="toolbar-right">
                <button
                  className="btn btn-primary"
                  onClick={() => { setSelectedOperator(null); setIsOperatorModalOpen(true) }}
                >
                  <FiPlus /> Create Operator Account
                </button>
              </div>
            </div>
            <DataTable columns={operatorColumns} data={filteredOperators} loading={loading} />
            <div style={{ padding: '14px 20px', background: 'var(--krushi-lighter)', borderTop: '1px solid var(--color-border)', fontSize: '0.85rem', color: 'var(--krushi-green)' }}>
              <strong>Notice:</strong> Counter operators log in to the Counter Application using their email and password/PIN credentials shown above.
            </div>
          </div>
        )}

        {/* ── Tab 4: Centre Statistics ── */}
        {activeTab === 'stats' && (
          <div>
            <div className="data-table-toolbar">
              <div className="toolbar-left">
                <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-text-secondary)' }}>
                  Live Operational Metrics by Centre
                </span>
              </div>
            </div>
            <DataTable columns={centreStatsColumns} data={centreStats} loading={loading} />
          </div>
        )}

        {/* ── Tab 5: Counter Performance ── */}
        {activeTab === 'performance' && (
          <div>
            <div className="data-table-toolbar">
              <div className="toolbar-left">
                <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-text-secondary)' }}>
                  Counter-wise Throughput & Handling Efficiency
                </span>
              </div>
            </div>
            <DataTable columns={counterPerfColumns} data={counterPerformance} loading={loading} />
          </div>
        )}

        {/* ── Tab 6: Slots Generation ── */}
        {activeTab === 'slots' && (
          <div>
            <div className="data-table-toolbar">
              <div className="toolbar-left">
                <select className="filter-select" value={slotCentreFilter} onChange={(e) => setSlotCentreFilter(e.target.value)}>
                  <option value="all">{t('centres.selectCentre') || 'All Centres'}</option>
                  {centres.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <input type="date" className="filter-input" style={{ width: '160px', minWidth: 'auto' }} value={slotDateFilter} onChange={(e) => setSlotDateFilter(e.target.value)} />
              </div>
              <div className="toolbar-right">
                <button className="btn btn-primary" onClick={() => setIsSlotModalOpen(true)}>
                  <FiPlus /> {t('centres.createSlots') || 'Generate Slots'}
                </button>
              </div>
            </div>
            <DataTable columns={slotColumns} data={filteredSlots} loading={loading} />
          </div>
        )}
      </div>

      {/* ── Modal: Add / Edit Centre ── */}
      <Modal
        isOpen={isCentreModalOpen}
        onClose={() => setIsCentreModalOpen(false)}
        title={selectedCentre ? 'Edit Procurement Centre' : 'Add New Procurement Centre'}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label className="form-label">Centre Name *</label>
            <input
              type="text"
              className="form-input"
              value={centreForm.name}
              onChange={(e) => setCentreForm((prev) => ({ ...prev, name: e.target.value }))}
              placeholder="e.g. Rahata APMC Main Yard"
            />
          </div>

          <div className="grid-2">
            <div>
              <label className="form-label">Taluka *</label>
              <input
                type="text"
                className="form-input"
                value={centreForm.taluka}
                onChange={(e) => setCentreForm((prev) => ({ ...prev, taluka: e.target.value }))}
                placeholder="e.g. Rahata"
              />
            </div>
            <div>
              <label className="form-label">District *</label>
              <input
                type="text"
                className="form-input"
                value={centreForm.district}
                onChange={(e) => setCentreForm((prev) => ({ ...prev, district: e.target.value }))}
                placeholder="Ahmednagar"
              />
            </div>
          </div>

          <div>
            <label className="form-label">Full Address</label>
            <input
              type="text"
              className="form-input"
              value={centreForm.address}
              onChange={(e) => setCentreForm((prev) => ({ ...prev, address: e.target.value }))}
              placeholder="e.g. Near Market Yard, Shirdi-Ahmednagar Highway"
            />
          </div>

          <div className="grid-2">
            <div>
              <label className="form-label">Daily Capacity (Farmers / Slots)</label>
              <input
                type="number"
                className="form-input"
                value={centreForm.capacity}
                onChange={(e) => setCentreForm((prev) => ({ ...prev, capacity: e.target.value }))}
                min="1"
              />
            </div>
            <div>
              <label className="form-label">Status</label>
              <select
                className="form-input"
                value={centreForm.status}
                onChange={(e) => setCentreForm((prev) => ({ ...prev, status: e.target.value }))}
              >
                <option value="active">Active / Online</option>
                <option value="inactive">Inactive / Off</option>
                <option value="maintenance">Under Maintenance</option>
              </select>
            </div>
          </div>

          <div className="grid-2">
            <div>
              <label className="form-label">Contact Phone</label>
              <input
                type="text"
                className="form-input"
                value={centreForm.contact}
                onChange={(e) => setCentreForm((prev) => ({ ...prev, contact: e.target.value }))}
                placeholder="e.g. 02422-255123"
              />
            </div>
            <div>
              <label className="form-label">Coordinates</label>
              <input
                type="text"
                className="form-input"
                value={centreForm.coordinates}
                onChange={(e) => setCentreForm((prev) => ({ ...prev, coordinates: e.target.value }))}
                placeholder="19.7042, 74.4842"
              />
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '12px' }}>
            <button className="btn btn-outline" onClick={() => setIsCentreModalOpen(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleSaveCentre}>
              {selectedCentre ? 'Save Changes' : 'Create Centre'}
            </button>
          </div>
        </div>
      </Modal>

      {/* ── Modal: Add / Edit Counter ── */}
      <Modal
        isOpen={isCounterModalOpen}
        onClose={() => setIsCounterModalOpen(false)}
        title={selectedCounter ? 'Edit Counter Assignment' : 'Add Counter to Centre'}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label className="form-label">Procurement Centre *</label>
            <select
              className="form-input"
              value={counterForm.centreId}
              onChange={(e) => setCounterForm((prev) => ({ ...prev, centreId: e.target.value }))}
            >
              {centres.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          <div className="grid-2">
            <div>
              <label className="form-label">Counter Number / Code *</label>
              <input
                type="text"
                className="form-input"
                value={counterForm.counterNumber}
                onChange={(e) => setCounterForm((prev) => ({ ...prev, counterNumber: e.target.value }))}
                placeholder="e.g. C1, C2, C3"
              />
            </div>
            <div>
              <label className="form-label">Counter Status</label>
              <select
                className="form-input"
                value={counterForm.status}
                onChange={(e) => setCounterForm((prev) => ({ ...prev, status: e.target.value }))}
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="maintenance">Maintenance</option>
              </select>
            </div>
          </div>

          <div>
            <label className="form-label">Assign Operator</label>
            <select
              className="form-input"
              value={counterForm.officerId}
              onChange={(e) => setCounterForm((prev) => ({ ...prev, officerId: e.target.value }))}
            >
              <option value="">-- Select Operator (or leave unassigned) --</option>
              {operators.map((op) => (
                <option key={op.id} value={op.id}>{op.name} ({op.email})</option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '12px' }}>
            <button className="btn btn-outline" onClick={() => setIsCounterModalOpen(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleSaveCounter}>
              {selectedCounter ? 'Update Counter' : 'Create Counter'}
            </button>
          </div>
        </div>
      </Modal>

      {/* ── Modal: Add / Edit Operator ── */}
      <Modal
        isOpen={isOperatorModalOpen}
        onClose={() => setIsOperatorModalOpen(false)}
        title={selectedOperator ? 'Edit Operator Account' : 'Create Counter Operator Account'}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label className="form-label">Operator Full Name *</label>
            <input
              type="text"
              className="form-input"
              value={operatorForm.name}
              onChange={(e) => setOperatorForm((prev) => ({ ...prev, name: e.target.value }))}
              placeholder="e.g. Ramesh Patil"
            />
          </div>

          <div className="grid-2">
            <div>
              <label className="form-label">Login Email *</label>
              <input
                type="email"
                className="form-input"
                value={operatorForm.email}
                onChange={(e) => setOperatorForm((prev) => ({ ...prev, email: e.target.value }))}
                placeholder="e.g. operator.rahata@queuekisan.gov.in"
              />
            </div>
            <div>
              <label className="form-label">Phone Number</label>
              <input
                type="text"
                className="form-input"
                value={operatorForm.phone}
                onChange={(e) => setOperatorForm((prev) => ({ ...prev, phone: e.target.value }))}
                placeholder="e.g. 9876543210"
              />
            </div>
          </div>

          <div>
            <label className="form-label">Login Password / PIN *</label>
            <input
              type="text"
              className="form-input"
              value={operatorForm.password}
              onChange={(e) => setOperatorForm((prev) => ({ ...prev, password: e.target.value }))}
              placeholder={selectedOperator ? 'Leave blank to keep unchanged' : 'e.g. 123456'}
            />
          </div>

          <div className="grid-2">
            <div>
              <label className="form-label">Assign Centre</label>
              <select
                className="form-input"
                value={operatorForm.centreId}
                onChange={(e) => setOperatorForm((prev) => ({ ...prev, centreId: e.target.value }))}
              >
                <option value="">-- Choose Centre --</option>
                {centres.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">Assign Counter</label>
              <select
                className="form-input"
                value={operatorForm.counterId}
                onChange={(e) => setOperatorForm((prev) => ({ ...prev, counterId: e.target.value }))}
              >
                <option value="">-- Choose Counter --</option>
                {counters
                  .filter((c) => !operatorForm.centreId || c.centreId === operatorForm.centreId)
                  .map((c) => <option key={c.id} value={c.id}>{c.counterNumber} ({c.centreName})</option>)}
              </select>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '12px' }}>
            <button className="btn btn-outline" onClick={() => setIsOperatorModalOpen(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleSaveOperator}>
              {selectedOperator ? 'Save Operator' : 'Create Operator'}
            </button>
          </div>
        </div>
      </Modal>

      {/* ── Modal: Generate Slots ── */}
      <Modal
        isOpen={isSlotModalOpen}
        onClose={() => setIsSlotModalOpen(false)}
        title="Generate Daily Procurement Slots"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label className="form-label">Target Procurement Centre *</label>
            <select
              className="form-input"
              value={slotForm.centreId}
              onChange={(e) => setSlotForm((prev) => ({ ...prev, centreId: e.target.value }))}
            >
              {centres.map((c) => <option key={c.id} value={c.dbId || c.id}>{c.name}</option>)}
            </select>
          </div>

          <div className="grid-2">
            <div>
              <label className="form-label">Start Date *</label>
              <input
                type="date"
                className="form-input"
                value={slotForm.startDate}
                onChange={(e) => setSlotForm((prev) => ({ ...prev, startDate: e.target.value }))}
              />
            </div>
            <div>
              <label className="form-label">End Date *</label>
              <input
                type="date"
                className="form-input"
                value={slotForm.endDate}
                onChange={(e) => setSlotForm((prev) => ({ ...prev, endDate: e.target.value }))}
              />
            </div>
          </div>

          <div className="grid-2">
            <div>
              <label className="form-label">Start Time</label>
              <input
                type="time"
                className="form-input"
                value={slotForm.startTime}
                onChange={(e) => setSlotForm((prev) => ({ ...prev, startTime: e.target.value }))}
              />
            </div>
            <div>
              <label className="form-label">End Time</label>
              <input
                type="time"
                className="form-input"
                value={slotForm.endTime}
                onChange={(e) => setSlotForm((prev) => ({ ...prev, endTime: e.target.value }))}
              />
            </div>
          </div>

          <div className="grid-2">
            <div>
              <label className="form-label">Slot Duration (Minutes)</label>
              <select
                className="form-input"
                value={slotForm.duration}
                onChange={(e) => setSlotForm((prev) => ({ ...prev, duration: e.target.value }))}
              >
                <option value="30">30 Minutes</option>
                <option value="60">60 Minutes (1 Hour)</option>
                <option value="90">90 Minutes</option>
                <option value="120">120 Minutes (2 Hours)</option>
              </select>
            </div>
            <div>
              <label className="form-label">Capacity Per Slot</label>
              <input
                type="number"
                className="form-input"
                value={slotForm.capacity}
                onChange={(e) => setSlotForm((prev) => ({ ...prev, capacity: e.target.value }))}
                min="1"
              />
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '12px' }}>
            <button className="btn btn-outline" onClick={() => setIsSlotModalOpen(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleGenerateSlots}>Generate Slots</button>
          </div>
        </div>
      </Modal>

      {/* ── Modal: Delete Confirmation ── */}
      <Modal
        isOpen={deleteConfirm.isOpen}
        onClose={() => setDeleteConfirm({ isOpen: false, type: '', id: '', name: '' })}
        title="Confirm Deletion"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <p style={{ color: 'var(--color-text)', fontSize: '0.95rem' }}>
            Are you sure you want to delete <strong>{deleteConfirm.name}</strong>? This action cannot be undone.
          </p>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '8px' }}>
            <button className="btn btn-outline" onClick={() => setDeleteConfirm({ isOpen: false, type: '', id: '', name: '' })}>
              Cancel
            </button>
            <button className="btn btn-primary" style={{ background: '#ef4444', borderColor: '#ef4444' }} onClick={handleDeleteConfirm}>
              Yes, Delete
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
