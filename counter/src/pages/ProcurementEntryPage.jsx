import { useMemo, useState, useEffect, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  CheckCircle2,
  CircleDollarSign,
  ClipboardCheck,
  PackageCheck,
  User,
  Wheat,
  BadgeCheck,
  AlertCircle,
  Calculator,
  ArrowRight,
  Printer,
  Scale,
  CreditCard,
  RefreshCw,
  Building2,
  FileCheck,
  X,
  Layers,
  Percent,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { useLanguage } from '../context/LanguageContext'
import { socketService } from '../services/socketService'
import { getQueue, startProcurement, confirmAmount, completeProcurement } from '../services/queueApi'
import './ProcurementEntryPage.css'

// Official MSP rates for 2025-2026 Kharif/Rabi seasons (₹ per kg)
const MSP_RATES = {
  Wheat: 22.75,
  Paddy: 23.00,
  Rice: 23.00,
  Cotton: 70.20,
  Soybean: 48.92,
  Maize: 20.90,
  Gram: 54.40,
  Chana: 54.40,
  Tur: 75.50,
  Moong: 86.82,
  Urad: 74.00,
  Groundnut: 67.83,
  Mustard: 59.50,
  Bajra: 26.25,
  Jowar: 33.71,
  Barley: 18.50,
  Sunflower: 67.60,
  Onion: 24.50,
}

// Helper: Convert Indian Number to Words for Rupees
function numberToIndianWords(num) {
  const n = Math.round(Number(num) || 0)
  if (n <= 0) return 'Zero Rupees Only'

  const units = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen']
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']

  function convertChunk(val) {
    let str = ''
    if (val >= 100) {
      str += units[Math.floor(val / 100)] + ' Hundred '
      val %= 100
    }
    if (val >= 20) {
      str += tens[Math.floor(val / 10)] + ' '
      val %= 10
    }
    if (val > 0) {
      str += units[val] + ' '
    }
    return str.trim()
  }

  const crore = Math.floor(n / 10000000)
  const lakh = Math.floor((n % 10000000) / 100000)
  const thousand = Math.floor((n % 100000) / 1000)
  const remainder = n % 1000

  let res = ''
  if (crore > 0) res += convertChunk(crore) + ' Crore '
  if (lakh > 0) res += convertChunk(lakh) + ' Lakh '
  if (thousand > 0) res += convertChunk(thousand) + ' Thousand '
  if (remainder > 0) res += convertChunk(remainder) + ' '

  return (res.trim() + ' Rupees Only').replace(/\s+/g, ' ')
}

export default function ProcurementEntryPage() {
  const navigate = useNavigate()
  const { id } = useParams()
  const { officer } = useAuth()
  const { showToast } = useToast()
  const { t, language } = useLanguage()

  const [farmer, setFarmer] = useState(null)
  const [loading, setLoading] = useState(false)
  const [initialLoading, setInitialLoading] = useState(true)

  // ── Form State (counter person inputs) ──
  const [grossWeight, setGrossWeight] = useState('')
  const [tareWeight, setTareWeight] = useState('0')
  const [ratePerKg, setRatePerKg] = useState('')
  const [qualityGrade, setQualityGrade] = useState('Grade A')
  const [moisture, setMoisture] = useState('')
  const [bonusAmount, setBonusAmount] = useState('0')
  const [deductionAmount, setDeductionAmount] = useState('0')
  const [remarks, setRemarks] = useState('')

  // Lifecycle status
  const [status, setStatus] = useState('pending')
  const [amountConfirmed, setAmountConfirmed] = useState(false)
  const [completed, setCompleted] = useState(false)

  // Receipt modal state
  const [showReceiptModal, setShowReceiptModal] = useState(false)

  // Track loaded farmer to prevent background polling from erasing active inputs
  const loadedFarmerIdRef = useRef(null)

  // ── Compute Default MSP for current farmer crop ──
  const mspRate = useMemo(() => {
    if (!farmer?.crop) return 25.0
    const cropKey = Object.keys(MSP_RATES).find((k) => farmer.crop.toLowerCase().includes(k.toLowerCase()))
    return cropKey ? MSP_RATES[cropKey] : 25.0
  }, [farmer?.crop])

  // ── Stable Farmer Sync (Does NOT overwrite user keystrokes) ──
  const syncFarmerData = async (isInitial = false) => {
    try {
      const data = await getQueue()
      const queue = Array.isArray(data?.queue) ? data.queue : []
      const found = (id ? queue.find((item) => item.id === id || item.farmerId === id || item.token === id || item.bookingId === id) : null) || queue[0] || null

      if (!found) {
        setFarmer(null)
        setInitialLoading(false)
        return
      }

      setFarmer(found)

      // Only populate form inputs on initial mount or when user selects a different farmer
      const isNewFarmer = loadedFarmerIdRef.current !== found.id
      if (isInitial || isNewFarmer) {
        loadedFarmerIdRef.current = found.id

        const initialQty = found.quantityKg || found.quantity || ''
        setGrossWeight(initialQty ? String(initialQty) : '')
        setTareWeight('0')

        // Default rate to MSP if crop known, else default rate
        const initialCropKey = Object.keys(MSP_RATES).find((k) => (found.crop || '').toLowerCase().includes(k.toLowerCase()))
        const defaultRate = initialCropKey ? MSP_RATES[initialCropKey] : 25.0

        // If procurement has previous amount & quantity, back-calculate rate or use default
        if (found.amount && initialQty && Number(initialQty) > 0) {
          const calculatedRate = (Number(found.amount) / Number(initialQty)).toFixed(2)
          setRatePerKg(String(calculatedRate))
        } else {
          setRatePerKg(String(defaultRate))
        }

        setQualityGrade(found.quality || 'Grade A')
        setMoisture(found.moisture ? String(found.moisture) : '')
        setRemarks(found.remarks || '')
        setBonusAmount('0')
        setDeductionAmount('0')
        setStatus(found.procurementStatus || 'pending')
        setAmountConfirmed(Boolean(found.amount && found.amount > 0))
        setCompleted(found.procurementStatus === 'completed')
      } else {
        // Background sync: only update server status flags without wiping user-typed text
        if (found.procurementStatus === 'completed' && !completed) {
          setStatus('completed')
          setCompleted(true)
        }
      }
    } catch (error) {
      console.error('[Procurement] Error loading farmer data:', error)
    } finally {
      setInitialLoading(false)
    }
  }

  // Handle route change / initial load
  useEffect(() => {
    loadedFarmerIdRef.current = null
    setInitialLoading(true)
    syncFarmerData(true)
    socketService.connect()

    const unsubscribe = socketService.onQueueUpdated(() => {
      syncFarmerData(false)
    })

    // Poll every 8 seconds for background stats without erasing user input
    const interval = setInterval(() => {
      syncFarmerData(false)
    }, 8000)

    return () => {
      clearInterval(interval)
      unsubscribe()
    }
  }, [id])

  // ── Live Calculation: Net Quantity, Base Amount, Net Payable ──
  const netQuantity = useMemo(() => {
    const gross = Number(grossWeight) || 0
    const tare = Number(tareWeight) || 0
    return Math.max(0, gross - tare)
  }, [grossWeight, tareWeight])

  const baseAmount = useMemo(() => {
    const rate = Number(ratePerKg) || 0
    return Math.round(netQuantity * rate)
  }, [netQuantity, ratePerKg])

  const totalPayableAmount = useMemo(() => {
    const bonus = Number(bonusAmount) || 0
    const deduction = Number(deductionAmount) || 0
    return Math.max(0, baseAmount + bonus - deduction)
  }, [baseAmount, bonusAmount, deductionAmount])

  const amountInWords = useMemo(() => {
    return numberToIndianWords(totalPayableAmount)
  }, [totalPayableAmount])

  // Moisture level analysis
  const moistureLevel = useMemo(() => {
    const val = Number(moisture)
    if (!moisture || isNaN(val)) return null
    if (val <= 12.0) return { label: 'Standard / Optimal (≤12%)', type: 'good' }
    if (val <= 14.0) return { label: 'Acceptable (12.1%–14%)', type: 'acceptable' }
    return { label: 'High Moisture (>14% – Deduction Recommended)', type: 'high' }
  }, [moisture])

  // ── Quick Handlers ──
  const handleApplyGovtMsp = () => {
    setRatePerKg(String(mspRate))
    showToast(`Applied Govt MSP Rate: ₹${mspRate}/kg for ${farmer?.crop || 'Crop'}`, 'info')
  }

  const handleResetToBackend = () => {
    if (farmer) {
      const q = farmer.quantityKg || farmer.quantity || ''
      setGrossWeight(q ? String(q) : '')
      setTareWeight('0')
      setRatePerKg(String(mspRate))
      setQualityGrade(farmer.quality || 'Grade A')
      setMoisture(farmer.moisture ? String(farmer.moisture) : '')
      setBonusAmount('0')
      setDeductionAmount('0')
      setRemarks(farmer.remarks || '')
      showToast('Form reset to recorded booking values.', 'info')
    }
  }

  // ── Stage 1: Start Procurement ──
  const handleStartProcessing = async () => {
    if (!farmer) return

    try {
      setLoading(true)
      const result = await startProcurement(farmer.id)
      const nextStatus = result.farmer?.procurementStatus || 'in-progress'
      setStatus(nextStatus)
      showToast('Procurement process initiated. Token moved to Active Serving.', 'success')
      socketService.emitProcurementStarted({ ...result.farmer, farmerId: result.farmer.farmerId })
    } catch (error) {
      console.error('[Procurement] Unable to start processing:', error)
      showToast(error.message || 'Failed to start procurement process.', 'error')
    } finally {
      setLoading(false)
    }
  }

  // ── Stage 2: Confirm & Lock Amount ──
  const handleAmountConfirm = async () => {
    if (!farmer) return

    if (netQuantity <= 0) {
      showToast('Please enter a valid Gross Quantity (> 0 kg).', 'error')
      return
    }

    if (!ratePerKg || Number(ratePerKg) <= 0) {
      showToast('Please enter a valid Rate per KG (₹/kg).', 'error')
      return
    }

    if (totalPayableAmount <= 0) {
      showToast('Calculated procurement amount must be greater than ₹0.', 'error')
      return
    }

    try {
      setLoading(true)
      const result = await confirmAmount(farmer.id, {
        quantity: netQuantity,
        amount: totalPayableAmount,
        quality: qualityGrade,
        moisture: moisture || undefined,
        ratePerKg: Number(ratePerKg),
        remarks: remarks || undefined,
      })
      setStatus(result.farmer?.procurementStatus || 'in-progress')
      setAmountConfirmed(true)
      showToast(`Calculation Confirmed: ${netQuantity} kg @ ₹${ratePerKg}/kg = ₹${totalPayableAmount.toLocaleString('en-IN')} ✓`, 'success')
      socketService.emitProcurementAmountConfirmed({ ...result.farmer, farmerId: result.farmer.farmerId })
    } catch (error) {
      console.error('[Procurement] Unable to confirm amount:', error)
      showToast(error.message || 'Unable to confirm procurement amount.', 'error')
    } finally {
      setLoading(false)
    }
  }

  // ── Stage 3: Complete Procurement & Dispatch to Payment ──
  const handleCompleteProcurement = async () => {
    if (!farmer) return

    if (netQuantity <= 0 || Number(ratePerKg) <= 0 || totalPayableAmount <= 0) {
      showToast('Please enter valid quantity and per-kg rate before completing.', 'error')
      return
    }

    try {
      setLoading(true)
      const result = await completeProcurement(farmer.id, {
        quantity: netQuantity,
        amount: totalPayableAmount,
        quality: qualityGrade,
        moisture: moisture || undefined,
        ratePerKg: Number(ratePerKg),
        remarks: remarks || undefined,
      })
      setStatus('completed')
      setCompleted(true)
      setAmountConfirmed(true)
      showToast(`Procurement completed! ₹${totalPayableAmount.toLocaleString('en-IN')} dispatched for DBT payment.`, 'success')

      socketService.emitProcurementCompleted({ ...result.farmer, farmerId: result.farmer.farmerId })
      socketService.emitPaymentUpdated({
        farmerId: result.farmer.farmerId,
        status: 'processing',
        amount: totalPayableAmount,
        referenceId: `PAY-${result.farmer.token}`,
      })

      // Open receipt modal automatically upon completion
      setShowReceiptModal(true)
    } catch (error) {
      console.error('[Procurement] Unable to complete procurement:', error)
      showToast(error.message || 'Unable to complete procurement.', 'error')
    } finally {
      setLoading(false)
    }
  }

  const handlePrintReceipt = () => {
    window.print()
  }

  const handleBack = () => navigate('/acc/queue')

  // Date locale
  const dateLocale = language === 'hi' ? 'hi-IN' : language === 'mr' ? 'mr-IN' : 'en-IN'
  const formattedDate = useMemo(() => new Date().toLocaleDateString(dateLocale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }), [dateLocale])

  const formattedTime = useMemo(() => new Date().toLocaleTimeString(dateLocale, {
    hour: '2-digit',
    minute: '2-digit',
  }), [dateLocale])

  if (initialLoading) {
    return (
      <div className="procurement-container">
        <div style={{ padding: 48, textAlign: 'center', color: 'var(--color-text-muted)' }}>
          <Scale size={36} className="skeleton" style={{ margin: '0 auto 16px', display: 'block' }} />
          <h3>Loading Procurement Details...</h3>
        </div>
      </div>
    )
  }

  if (!farmer) {
    return (
      <div className="procurement-container">
        <div style={{ padding: 48, textAlign: 'center', background: 'var(--color-card)', borderRadius: 14 }}>
          <AlertCircle size={40} color="var(--color-warning)" style={{ margin: '0 auto 12px' }} />
          <h2>No Active Farmer Selected</h2>
          <p style={{ color: 'var(--color-text-muted)', marginBottom: 20 }}>Please select a verified farmer from the queue to process procurement.</p>
          <button className="btn-procure primary" onClick={handleBack}>
            <ArrowLeft size={16} /> Return to Queue
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="procurement-container">
      {/* ── Top Header ── */}
      <div className="procurement-header">
        <div className="procurement-header-left">
          <h1>
            <Scale size={26} color="var(--color-primary)" />
            {t('procurement.title') || 'Procurement Entry & Settlement'}
          </h1>
          <p>
            {officer?.centreName || 'Procurement Centre'} &middot; Record verified produce weighment, per-kg rate, and settle DBT payments.
          </p>
        </div>
        <div className="procurement-header-actions">
          <button className="btn-procure secondary" onClick={handleResetToBackend} title="Reload initial scale reading from booking">
            <RefreshCw size={15} /> Reset Form
          </button>
          <button className="btn-procure secondary" onClick={handleBack}>
            <ArrowLeft size={16} /> {t('common.back')}
          </button>
        </div>
      </div>

      {/* ── Success Banner when Completed ── */}
      {(completed || status === 'completed') && (
        <div className="success-banner" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <CheckCircle2 size={32} color="var(--color-primary)" />
            <div>
              <h4 style={{ margin: 0, fontSize: '1.0625rem', fontWeight: 700, color: 'var(--color-primary-dark)' }}>
                {t('procurement.completedSuccess') || 'Procurement Completed & Dispatched for Payment'}
              </h4>
              <p style={{ margin: '2px 0 0', fontSize: '0.875rem' }}>
                Procurement of <strong>{netQuantity} kg</strong> at <strong>₹{ratePerKg}/kg</strong> (Total: <strong>₹{totalPayableAmount.toLocaleString('en-IN')}</strong>) is recorded.
              </p>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn-procure accent" onClick={() => setShowReceiptModal(true)} style={{ height: 40, padding: '0 16px' }}>
              <Printer size={16} /> Print Receipt
            </button>
            <button className="btn-procure primary" onClick={() => navigate('/acc/payments')} style={{ height: 40, padding: '0 16px' }}>
              View Payments <ArrowRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* ── Process Stepper ── */}
      <div className="procurement-stepper">
        <div className={`step-item ${status !== 'pending' ? 'completed' : 'active'}`}>
          <div className="step-number">1</div>
          <div className="step-text">
            <span className="step-title">Weighment</span>
            <span className="step-desc">Gross & Tare kg</span>
          </div>
        </div>
        <div className={`step-item ${amountConfirmed ? 'completed' : status === 'in-progress' || status === 'serving' ? 'active' : ''}`}>
          <div className="step-number">2</div>
          <div className="step-text">
            <span className="step-title">Per-KG Rate & Quality</span>
            <span className="step-desc">Govt MSP & Grade</span>
          </div>
        </div>
        <div className={`step-item ${completed ? 'completed' : amountConfirmed ? 'active' : ''}`}>
          <div className="step-number">3</div>
          <div className="step-text">
            <span className="step-title">Live Bill Calculation</span>
            <span className="step-desc">Total Net Payable</span>
          </div>
        </div>
        <div className={`step-item ${completed ? 'completed' : ''}`}>
          <div className="step-number">4</div>
          <div className="step-text">
            <span className="step-title">Settlement & DBT</span>
            <span className="step-desc">Slip & Payments</span>
          </div>
        </div>
      </div>

      {/* ── 2-Column Main Workspace ── */}
      <div className="procurement-grid">
        {/* ── Left Sidebar (Farmer Info, DBT Bank, MSP Guide) ── */}
        <div className="left-sidebar">
          {/* Farmer & Token Card */}
          <div className="farmer-summary-card">
            <div className="card-heading">
              <span className="card-heading-title">
                <User size={18} color="var(--color-primary)" />
                {t('procurement.farmerDetails') || 'Farmer Profile'}
              </span>
              <span className="token-pill">{farmer.token}</span>
            </div>
            <div className="data-rows">
              <div className="data-row">
                <span className="data-label">{t('common.name') || 'Farmer Name'}</span>
                <span className="data-val">{farmer.farmerName}</span>
              </div>
              <div className="data-row">
                <span className="data-label">Farmer ID</span>
                <span className="data-val" style={{ fontFamily: 'monospace' }}>{farmer.farmerId}</span>
              </div>
              <div className="data-row">
                <span className="data-label">Contact / Mobile</span>
                <span className="data-val">{farmer.mobile || '—'}</span>
              </div>
              <div className="data-row">
                <span className="data-label">Village / Location</span>
                <span className="data-val">{farmer.village || '—'}</span>
              </div>
              <div className="data-row">
                <span className="data-label">{t('procurement.cropLabel') || 'Crop Commodity'}</span>
                <span className="data-val crop">{farmer.crop || 'Grain'}</span>
              </div>
              <div className="data-row">
                <span className="data-label">Procurement Date</span>
                <span className="data-val">{formattedDate}</span>
              </div>
            </div>
          </div>

          {/* DBT Bank Account Details Card */}
          <div className="bank-summary-card">
            <div className="card-heading">
              <span className="card-heading-title">
                <CreditCard size={18} color="var(--color-primary)" />
                DBT Bank Account
              </span>
              <span style={{ fontSize: '0.75rem', color: '#16a34a', fontWeight: 700 }}>Direct Settlement</span>
            </div>
            <div className="data-rows">
              <div className="data-row">
                <span className="data-label">Bank Name</span>
                <span className="data-val">{farmer.paymentProfile?.bankName || 'State Bank of India'}</span>
              </div>
              <div className="data-row">
                <span className="data-label">Account No.</span>
                <span className="data-val" style={{ fontFamily: 'monospace' }}>
                  {farmer.paymentProfile?.accountNumber
                    ? `•••• •••• ${farmer.paymentProfile.accountNumber.slice(-4)}`
                    : '•••• •••• 4892'}
                </span>
              </div>
              <div className="data-row">
                <span className="data-label">IFSC Code</span>
                <span className="data-val" style={{ fontFamily: 'monospace' }}>{farmer.paymentProfile?.ifscCode || 'SBIN0001234'}</span>
              </div>
              {farmer.paymentProfile?.upiId && (
                <div className="data-row">
                  <span className="data-label">UPI ID</span>
                  <span className="data-val">{farmer.paymentProfile.upiId}</span>
                </div>
              )}
            </div>
            <div className="bank-verified-tag">
              <FileCheck size={14} /> Aadhaar & Bank DBT Linked (Direct Transfer)
            </div>
          </div>

          {/* Quick Govt MSP Reference Card */}
          <div className="msp-reference-card">
            <div className="card-heading" style={{ marginBottom: 8, paddingBottom: 8 }}>
              <span className="card-heading-title">
                <Wheat size={18} color="var(--color-primary)" />
                Govt MSP Benchmark (2025-26)
              </span>
            </div>
            <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', marginBottom: 8 }}>
              Click any benchmark rate below to auto-fill the <strong>Rate per KG</strong> field:
            </div>
            <div className="msp-chips">
              {Object.entries(MSP_RATES).slice(0, 10).map(([cropName, rate]) => {
                const isCurrentCrop = farmer?.crop && farmer.crop.toLowerCase().includes(cropName.toLowerCase())
                const isSelected = Number(ratePerKg) === rate
                return (
                  <button
                    key={cropName}
                    type="button"
                    className={`msp-chip ${isSelected ? 'active' : ''}`}
                    onClick={() => {
                      setRatePerKg(String(rate))
                      showToast(`Filled Rate: ₹${rate}/kg for ${cropName}`, 'info')
                    }}
                    title={`Apply ₹${rate}/kg for ${cropName}`}
                  >
                    <span>{cropName}</span>
                    <strong>₹{rate}/kg</strong>
                    {isCurrentCrop && <span style={{ fontSize: '0.6875rem', opacity: 0.8 }}>(Farmer Crop)</span>}
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        {/* ── Right Column: Procurement Entry & Live Calculation Workspace ── */}
        <div className="procurement-form-card">
          {/* Section 1: Weighment & Quantity */}
          <div>
            <div className="form-section-title">
              <Scale size={20} color="var(--color-primary)" />
              1. Produce Weighment & Net Quantity
            </div>
            <div className="form-3col">
              {/* Gross Weight Input */}
              <div className="field-group">
                <label className="field-label">
                  <span>Gross Quantity (Weight) <span style={{ color: 'var(--color-error)' }}>*</span></span>
                  <span style={{ color: 'var(--color-text-muted)', fontWeight: 400, fontSize: '0.75rem' }}>Scale reading</span>
                </label>
                <div className="field-input-wrapper">
                  <input
                    className="field-input has-addon-right"
                    type="number"
                    min="0"
                    step="any"
                    value={grossWeight}
                    onChange={(e) => setGrossWeight(e.target.value)}
                    placeholder="e.g. 500"
                    disabled={status === 'completed'}
                  />
                  <span className="input-unit">kg</span>
                </div>
              </div>

              {/* Tare Deduction Input */}
              <div className="field-group">
                <label className="field-label">
                  <span>Tare / Bag Deduction</span>
                  <span style={{ color: 'var(--color-text-muted)', fontWeight: 400, fontSize: '0.75rem' }}>Bags weight</span>
                </label>
                <div className="field-input-wrapper">
                  <input
                    className="field-input has-addon-right"
                    type="number"
                    min="0"
                    step="any"
                    value={tareWeight}
                    onChange={(e) => setTareWeight(e.target.value)}
                    placeholder="0"
                    disabled={status === 'completed'}
                  />
                  <span className="input-unit">kg</span>
                </div>
              </div>

              {/* Net Payable Weight (Live Computed) */}
              <div className="field-group">
                <label className="field-label">
                  <span>Net Payable Weight</span>
                  <span style={{ color: 'var(--color-primary)', fontWeight: 700, fontSize: '0.75rem' }}>Gross - Tare</span>
                </label>
                <div className="field-input-wrapper">
                  <input
                    className="field-input has-addon-right"
                    type="text"
                    value={netQuantity > 0 ? `${netQuantity.toLocaleString('en-IN')} kg` : '0 kg'}
                    readOnly
                    disabled
                    style={{ background: 'var(--color-soft-green)', color: 'var(--color-primary-dark)', fontWeight: 800, fontSize: '1.0625rem' }}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="form-section-divider" />

          {/* Section 2: Per KG Rate & Quality Grade */}
          <div>
            <div className="form-section-title">
              <CircleDollarSign size={20} color="var(--color-primary)" />
              2. Per-KG Rate & Quality Assessment
            </div>

            <div className="form-2col">
              {/* Rate per KG (₹/kg) Field with 1-Click MSP Button */}
              <div className="field-group">
                <div className="field-label">
                  <span>Rate per KG (₹ / kg) <span style={{ color: 'var(--color-error)' }}>*</span></span>
                  <button type="button" className="helper-btn" onClick={handleApplyGovtMsp}>
                    <Percent size={13} /> Apply Govt MSP (₹{mspRate}/kg)
                  </button>
                </div>
                <div className="field-input-wrapper">
                  <span className="input-prefix">₹</span>
                  <input
                    className="field-input has-addon-left has-addon-right"
                    type="number"
                    min="0"
                    step="0.01"
                    value={ratePerKg}
                    onChange={(e) => setRatePerKg(e.target.value)}
                    placeholder={String(mspRate)}
                    disabled={status === 'completed'}
                    style={{ fontSize: '1.0625rem', fontWeight: 700 }}
                  />
                  <span className="input-unit">/ kg</span>
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
                  <span>Govt Standard MSP: <strong>₹{mspRate}/kg</strong></span>
                  {Number(ratePerKg) > 0 && (
                    <span style={{ color: Number(ratePerKg) >= mspRate ? '#16a34a' : '#d97706', fontWeight: 600 }}>
                      {Number(ratePerKg) >= mspRate ? '✓ At/Above MSP' : '⚠ Below MSP'}
                    </span>
                  )}
                </div>
              </div>

              {/* Quality Grade Selector */}
              <div className="field-group">
                <label className="field-label">
                  <span>Quality Grade</span>
                  <span style={{ color: 'var(--color-text-muted)', fontWeight: 400, fontSize: '0.75rem' }}>Visual inspection</span>
                </label>
                <select
                  className="field-input"
                  value={qualityGrade}
                  onChange={(e) => setQualityGrade(e.target.value)}
                  disabled={status === 'completed'}
                >
                  <option value="Grade A">Grade A (Premium Quality)</option>
                  <option value="Grade B">Grade B (Standard Commercial)</option>
                  <option value="Grade C">Grade C (Fair Average Quality)</option>
                  <option value="FAQ">FAQ (Fair Average Quality)</option>
                </select>
              </div>
            </div>

            {/* Moisture Content & Adjustments Grid */}
            <div className="form-3col" style={{ marginTop: 16 }}>
              {/* Moisture % */}
              <div className="field-group">
                <label className="field-label">
                  <span>Moisture Content (%)</span>
                  <span style={{ color: 'var(--color-text-muted)', fontWeight: 400, fontSize: '0.75rem' }}>Optimal ≤ 12%</span>
                </label>
                <div className="field-input-wrapper">
                  <input
                    className="field-input has-addon-right"
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    value={moisture}
                    onChange={(e) => setMoisture(e.target.value)}
                    placeholder="e.g. 11.5"
                    disabled={status === 'completed'}
                  />
                  <span className="input-unit">%</span>
                </div>
                {moistureLevel && (
                  <span className={`moisture-status-tag ${moistureLevel.type}`}>
                    {moistureLevel.label}
                  </span>
                )}
              </div>

              {/* Bonus / State Incentive */}
              <div className="field-group">
                <label className="field-label">
                  <span>Quality Bonus / Incentive</span>
                  <span style={{ color: '#16a34a', fontWeight: 600, fontSize: '0.75rem' }}>(+) Addition</span>
                </label>
                <div className="field-input-wrapper">
                  <span className="input-prefix" style={{ color: '#16a34a' }}>+₹</span>
                  <input
                    className="field-input has-addon-left"
                    type="number"
                    min="0"
                    step="1"
                    value={bonusAmount}
                    onChange={(e) => setBonusAmount(e.target.value)}
                    placeholder="0"
                    disabled={status === 'completed'}
                  />
                </div>
              </div>

              {/* Deductions (Moisture/Cleaning) */}
              <div className="field-group">
                <label className="field-label">
                  <span>Deductions / Cuts</span>
                  <span style={{ color: 'var(--color-error)', fontWeight: 600, fontSize: '0.75rem' }}>(-) Subtraction</span>
                </label>
                <div className="field-input-wrapper">
                  <span className="input-prefix" style={{ color: 'var(--color-error)' }}>-₹</span>
                  <input
                    className="field-input has-addon-left"
                    type="number"
                    min="0"
                    step="1"
                    value={deductionAmount}
                    onChange={(e) => setDeductionAmount(e.target.value)}
                    placeholder="0"
                    disabled={status === 'completed'}
                  />
                </div>
              </div>
            </div>

            {/* Remarks / Lot notes */}
            <div className="field-group" style={{ marginTop: 14 }}>
              <label className="field-label">
                <span>Officer Remarks / Lot Identification (Optional)</span>
              </label>
              <input
                className="field-input"
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                placeholder="e.g. Clean dry lot, Weighbridge Scale #02, Sample Tested OK"
                disabled={status === 'completed'}
              />
            </div>
          </div>

          <div className="form-section-divider" />

          {/* Section 3: Live Calculation Summary Card */}
          <div>
            <div className="form-section-title">
              <Calculator size={20} color="var(--color-primary)" />
              3. Dynamic Bill Calculation Summary
            </div>

            <div className="calc-summary-card">
              <div className="calc-header">
                <span className="calc-title">
                  <PackageCheck size={20} />
                  Procurement Settlement Voucher
                </span>
                <span className="calc-formula-badge">
                  {netQuantity} kg × ₹{ratePerKg || 0}/kg = ₹{baseAmount.toLocaleString('en-IN')}
                </span>
              </div>

              <div className="calc-items-grid">
                <div className="calc-item">
                  <span className="calc-item-label">Net Payable Weight</span>
                  <span className="calc-item-value">{netQuantity.toLocaleString('en-IN')} kg</span>
                </div>
                <div className="calc-item">
                  <span className="calc-item-label">Applied Rate</span>
                  <span className="calc-item-value">₹{Number(ratePerKg || 0).toFixed(2)} / kg</span>
                </div>
                <div className="calc-item">
                  <span className="calc-item-label">Base Crop Value</span>
                  <span className="calc-item-value">₹{baseAmount.toLocaleString('en-IN')}</span>
                </div>
              </div>

              {/* Adjustments line if any */}
              {(Number(bonusAmount) > 0 || Number(deductionAmount) > 0) && (
                <div style={{ display: 'flex', gap: 20, fontSize: '0.8125rem', color: 'rgba(255,255,255,0.85)', background: 'rgba(0,0,0,0.15)', padding: '6px 12px', borderRadius: 6 }}>
                  {Number(bonusAmount) > 0 && <span>Incentive: <strong style={{ color: '#4ade80' }}>+₹{Number(bonusAmount).toLocaleString('en-IN')}</strong></span>}
                  {Number(deductionAmount) > 0 && <span>Deduction: <strong style={{ color: '#f87171' }}>-₹{Number(deductionAmount).toLocaleString('en-IN')}</strong></span>}
                </div>
              )}

              {/* Big Highlight Total Box */}
              <div className="calc-total-box">
                <div>
                  <span className="calc-total-label">Total Net Payable Amount</span>
                  <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.7)', marginTop: 2 }}>
                    Direct Benefit Transfer to Farmer Account
                  </div>
                </div>
                <div className="calc-total-amount">
                  ₹{totalPayableAmount.toLocaleString('en-IN')}
                </div>
              </div>

              {/* Amount in words */}
              <div className="calc-in-words">
                In Words: <strong>{amountInWords}</strong>
              </div>
            </div>
          </div>

          {/* Section 4: Workflow Action Buttons */}
          <div className="form-actions-toolbar">
            {status !== 'completed' ? (
              <>
                <button
                  className="btn-procure secondary"
                  onClick={handleStartProcessing}
                  disabled={loading || status === 'in-progress' || status === 'serving'}
                  title="Mark token in service"
                >
                  <ClipboardCheck size={18} />
                  {status === 'in-progress' || status === 'serving' ? 'In Progress' : 'Start Procurement'}
                </button>

                <button
                  className="btn-procure secondary"
                  onClick={handleAmountConfirm}
                  disabled={loading || netQuantity <= 0 || Number(ratePerKg) <= 0}
                  title="Save verified rate & quantity"
                >
                  <CircleDollarSign size={18} />
                  {amountConfirmed ? 'Re-confirm Amount' : 'Confirm Amount'}
                </button>

                <button
                  className="btn-procure primary"
                  onClick={handleCompleteProcurement}
                  disabled={loading || netQuantity <= 0 || Number(ratePerKg) <= 0}
                  title="Finalize procurement and initiate DBT payment"
                >
                  <BadgeCheck size={18} />
                  Complete Procurement & Settle
                </button>
              </>
            ) : (
              <>
                <button className="btn-procure accent" onClick={() => setShowReceiptModal(true)}>
                  <Printer size={18} /> Print APMC Receipt
                </button>
                <button className="btn-procure primary" onClick={() => navigate('/acc/payments')}>
                  View In Payments <ArrowRight size={18} />
                </button>
                <button className="btn-procure secondary" onClick={handleBack}>
                  Next Farmer in Queue
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── Official APMC Printable Receipt Slip Modal ── */}
      {showReceiptModal && (
        <div className="receipt-modal-backdrop" onClick={() => setShowReceiptModal(false)}>
          <div className="receipt-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="receipt-modal-header">
              <span style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--color-text)' }}>
                APMC Procurement Slip Preview
              </span>
              <button
                onClick={() => setShowReceiptModal(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)' }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Printable Receipt Content */}
            <div className="receipt-content-printable">
              <div className="receipt-header-branding">
                <div className="receipt-org">Government of India &middot; Department of Agriculture & Food Supplies</div>
                <h2 className="receipt-title">AGRICULTURAL PRODUCE PROCUREMENT ACKNOWLEDGEMENT</h2>
                <div className="receipt-centre">{officer?.centreName || 'APMC Principal Market Yard'}</div>
              </div>

              <div className="receipt-meta-grid">
                <div><strong>Procurement ID:</strong> PRC-{farmer.id.slice(0, 8).toUpperCase()}</div>
                <div><strong>Token No:</strong> <span style={{ color: 'var(--color-primary)', fontWeight: 800 }}>{farmer.token}</span></div>
                <div><strong>Date & Time:</strong> {formattedDate} {formattedTime}</div>
                <div><strong>Weighbridge Counter:</strong> {officer?.fullName || 'Counter 1'}</div>
                <div><strong>Farmer Name:</strong> {farmer.farmerName}</div>
                <div><strong>Farmer ID:</strong> {farmer.farmerId}</div>
                <div><strong>Village:</strong> {farmer.village || 'N/A'}</div>
                <div><strong>Contact:</strong> {farmer.mobile || 'N/A'}</div>
              </div>

              <table className="receipt-table">
                <thead>
                  <tr>
                    <th>Commodity / Item</th>
                    <th>Grade / Moisture</th>
                    <th className="num-cell">Net Qty (kg)</th>
                    <th className="num-cell">Rate (₹/kg)</th>
                    <th className="num-cell">Amount (₹)</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td><strong>{farmer.crop || 'Produce'}</strong></td>
                    <td>{qualityGrade} {moisture ? `(${moisture}% Moisture)` : ''}</td>
                    <td className="num-cell">{netQuantity.toLocaleString('en-IN')} kg</td>
                    <td className="num-cell">₹{Number(ratePerKg).toFixed(2)}</td>
                    <td className="num-cell">₹{baseAmount.toLocaleString('en-IN')}</td>
                  </tr>
                  {Number(bonusAmount) > 0 && (
                    <tr>
                      <td colSpan={4} style={{ color: '#16a34a' }}>Quality Incentive / State Bonus</td>
                      <td className="num-cell" style={{ color: '#16a34a' }}>+₹{Number(bonusAmount).toLocaleString('en-IN')}</td>
                    </tr>
                  )}
                  {Number(deductionAmount) > 0 && (
                    <tr>
                      <td colSpan={4} style={{ color: 'var(--color-error)' }}>Deduction / Moisture Cut</td>
                      <td className="num-cell" style={{ color: 'var(--color-error)' }}>-₹{Number(deductionAmount).toLocaleString('en-IN')}</td>
                    </tr>
                  )}
                </tbody>
              </table>

              <div className="receipt-total-highlight">
                <div>
                  <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>
                    Net Payable to Farmer (DBT)
                  </div>
                  <div style={{ fontSize: '0.8125rem', color: '#166534', fontWeight: 600, marginTop: 2 }}>
                    Bank: {farmer.paymentProfile?.bankName || 'Direct Benefit Transfer'} &middot; A/C: {farmer.paymentProfile?.accountNumber ? `•••• ${farmer.paymentProfile.accountNumber.slice(-4)}` : 'Verified DBT'}
                  </div>
                </div>
                <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#15803d' }}>
                  ₹{totalPayableAmount.toLocaleString('en-IN')}
                </div>
              </div>

              <div style={{ fontSize: '0.8125rem', color: '#334155', fontStyle: 'italic', background: '#f8fafc', padding: '8px 12px', borderRadius: 6 }}>
                Amount in Words: <strong>{amountInWords}</strong>
              </div>

              <div className="receipt-signatures">
                <div className="sig-box">
                  Authorized Weighbridge Officer
                  <div style={{ marginTop: 4, fontWeight: 700, color: '#0f172a' }}>{officer?.fullName || 'KrushiDarpan Officer'}</div>
                </div>
                <div className="sig-box">
                  Farmer Acceptance Signature
                  <div style={{ marginTop: 4, fontWeight: 700, color: '#0f172a' }}>{farmer.farmerName}</div>
                </div>
              </div>
            </div>

            <div className="receipt-modal-footer">
              <button className="btn-procure secondary" onClick={() => setShowReceiptModal(false)}>
                Close Preview
              </button>
              <button className="btn-procure primary" onClick={handlePrintReceipt}>
                <Printer size={16} /> Print / Save PDF
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
