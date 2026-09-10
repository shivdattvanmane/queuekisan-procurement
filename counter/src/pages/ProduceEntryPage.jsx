import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import {
  ArrowLeft,
  Save,
  CheckCircle2,
  AlertCircle,
  FileText,
  User,
  MapPin,
  Scale
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { useLanguage } from '../context/LanguageContext'
import { socketService } from '../services/socketService'
import { getQueue, submitProduceEntry } from '../services/queueApi'
import './ProduceEntryPage.css'

export default function ProduceEntryPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const { officer } = useAuth()
  const { showToast } = useToast()
  const { t } = useLanguage()

  const initialFarmer = location.state?.farmer || null
  const [farmer, setFarmer] = useState(initialFarmer)

  const [formData, setFormData] = useState({
    cropName: initialFarmer?.crop || '',
    quantity: initialFarmer?.quantityKg ? String(initialFarmer.quantityKg) : (initialFarmer?.quantity ? String(initialFarmer.quantity) : ''),
    unit: 'kg',
    qualityGrade: initialFarmer?.quality || 'Grade A',
    moisture: '',
    remarks: initialFarmer?.remarks || ''
  })

  const [errors, setErrors] = useState({})
  const [isSaved, setIsSaved] = useState(false)
  const [isConfirmed, setIsConfirmed] = useState(false)

  const loadedFarmerIdRef = useRef(null)

  const syncFarmer = async (isInitial = false) => {
    try {
      const data = await getQueue()
      const queue = Array.isArray(data?.queue) ? data.queue : []
      const nextFarmer = (id ? queue.find((q) => q.id === id || q.farmerId === id || q.token === id || q.bookingId === id) : null) || queue[0] || null
      setFarmer(nextFarmer)

      const isNewFarmer = loadedFarmerIdRef.current !== nextFarmer?.id
      if (nextFarmer && (isInitial || isNewFarmer)) {
        loadedFarmerIdRef.current = nextFarmer.id
        setFormData({
          cropName: nextFarmer.crop || '',
          quantity: nextFarmer.quantityKg ? String(nextFarmer.quantityKg) : (nextFarmer.quantity ? String(nextFarmer.quantity) : ''),
          unit: 'kg',
          qualityGrade: nextFarmer.quality || 'Grade A',
          moisture: nextFarmer.moisture ? String(nextFarmer.moisture) : '',
          remarks: nextFarmer.remarks || ''
        })
      }
    } catch (error) {
      console.error('[Produce] Unable to load farmer details.', error)
    }
  }

  useEffect(() => {
    loadedFarmerIdRef.current = null
    syncFarmer(true)
    socketService.connect()

    const unsubscribe = socketService.onQueueUpdated((payload) => {
      syncFarmer(false)
    })
    const interval = setInterval(() => {
      syncFarmer(false)
    }, 8000)

    return () => {
      clearInterval(interval)
      unsubscribe()
    }
  }, [id])

  // ── Handlers ──
  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
    // Clear error on type
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }))
    }
  }

  const validate = () => {
    const newErrors = {}
    
    if (!formData.cropName.trim()) newErrors.cropName = t('produce.cropNameRequired')
    
    if (!formData.quantity) {
      newErrors.quantity = t('produce.quantityRequired')
    } else if (isNaN(formData.quantity) || Number(formData.quantity) <= 0) {
      newErrors.quantity = t('produce.quantityValidation')
    }
    
    if (!formData.qualityGrade.trim()) newErrors.qualityGrade = t('produce.qualityRequired')
    
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSave = () => {
    if (validate()) {
      setIsSaved(true)
    }
  }

  const handleEdit = () => {
    setIsSaved(false)
  }

  const handleConfirm = async () => {
    if (!isSaved) return

    try {
      const produceData = {
        crop: formData.cropName,
        quantity: Number(formData.quantity),
        unit: formData.unit,
        quality: formData.qualityGrade,
        moisture: formData.moisture || undefined,
        remarks: formData.remarks || '',
        farmerId: farmer.farmerId,
        officerId: officer?.officerId,
      }

      const result = await submitProduceEntry(farmer.id, {
        crop: produceData.crop,
        quantity: produceData.quantity,
        unit: produceData.unit,
        quality: produceData.quality,
        moisture: produceData.moisture,
        remarks: produceData.remarks,
      })
      setIsConfirmed(true)
      setFarmer(result?.farmer || farmer)
      showToast(`${t('produce.produceEntered')} — ${result?.farmer?.token || farmer.token}`, 'success')
      socketService.emitProduceEntered({ ...produceData, ...result?.farmer })
    } catch (error) {
      console.error('[Produce] Unable to confirm produce entry:', error)
      showToast(error.message || t('produce.produceFailed'), 'error')
    }
  }

  const handleBackToQueue = () => {
    navigate('/acc/queue')
  }

  if (!farmer) return <div style={{ padding: 24 }}>{t('common.loading')}</div>

  // Safety check: Prevent entry if not checked in
  const canEnterProduce = farmer.checkIn === 'checked-in'

  return (
    <div className="produce-container">
      {/* ── Header ── */}
      <div className="produce-header">
        <div>
          <h1 className="produce-title">{t('produce.title')}</h1>
          <p className="produce-subtitle">{t('produce.subtitle')}</p>
        </div>
        <button className="action-btn secondary" style={{ height: 38, padding: '0 16px' }} onClick={handleBackToQueue}>
          <ArrowLeft size={16} />
          {t('common.back')}
        </button>
      </div>

      {!canEnterProduce && (
        <div className="success-banner" style={{ background: '#fef2f2', borderColor: '#fecaca' }}>
          <AlertCircle size={24} color="var(--color-error)" />
          <div className="success-banner-content">
            <h4 style={{ color: 'var(--color-error)' }}>{t('produce.farmerNotCheckedIn')}</h4>
            <p style={{ color: 'var(--color-text-muted)' }}>
              {t('produce.farmerNotCheckedInMsg')}
            </p>
          </div>
        </div>
      )}

      {isConfirmed && (
        <div className="success-banner">
          <CheckCircle2 size={24} color="var(--color-primary)" />
          <div className="success-banner-content">
            <h4>{t('produce.produceSuccessTitle')}</h4>
            <p>{t('produce.produceSuccessMsg')}</p>
          </div>
        </div>
      )}

      {/* ── Farmer Info Card ── */}
      <div className="farmer-info-card">
        <div className="info-header">
          <h2 className="info-title">
            <User size={20} color="var(--color-primary)" />
            {t('produce.farmerDetails')}
          </h2>
          <div style={{ background: 'var(--color-primary-dark)', color: '#fff', padding: '4px 12px', borderRadius: 6, fontWeight: 700 }}>
            {farmer.token}
          </div>
        </div>
        <div className="info-grid">
          <div>
            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>{t('common.name')}</div>
            <div style={{ fontWeight: 600 }}>{farmer.farmerName}</div>
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>{t('produce.bookingIdLabel')}</div>
            <div style={{ fontFamily: 'monospace' }}>{farmer.bookingId}</div>
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', marginBottom: 4 }}><MapPin size={12} style={{ display:'inline', verticalAlign:'middle' }}/> {t('produce.villageLabel')}</div>
            <div>{farmer.village}</div>
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>{t('produce.procurementCentre')}</div>
            <div>{officer?.centreName}</div>
          </div>
        </div>
      </div>

      {/* ── Produce Form Card ── */}
      <div className="form-wrapper">
        {(!canEnterProduce || isConfirmed) && <div className="read-only-overlay" />}
        
        <div className="produce-form-card">
          <h2 className="form-title">
            <Scale size={20} color="var(--color-primary)" />
            {t('produce.cropAssessment')}
          </h2>
          
          <div className="form-grid">
            {/* Crop Name */}
            <div className="form-group">
              <label className="form-label">
                {t('produce.cropName')} <span className="required-asterisk">*</span>
              </label>
              <input 
                type="text" 
                name="cropName"
                className={`form-input ${errors.cropName ? 'error' : ''}`}
                value={formData.cropName}
                onChange={handleChange}
                disabled={isSaved}
                placeholder={t('produce.cropNamePlaceholder')}
              />
              {errors.cropName && <div className="error-msg"><AlertCircle size={12}/> {errors.cropName}</div>}
            </div>

            {/* Quantity */}
            <div className="form-group">
              <label className="form-label">
                {t('produce.quantityWeight')} <span className="required-asterisk">*</span>
              </label>
              <div className="input-with-addon">
                <input 
                  type="text" 
                  name="quantity"
                  className={`form-input ${errors.quantity ? 'error' : ''}`}
                  value={formData.quantity}
                  onChange={handleChange}
                  disabled={isSaved}
                  placeholder="0.00"
                />
                <span className="input-addon">kg</span>
              </div>
              {errors.quantity && <div className="error-msg"><AlertCircle size={12}/> {errors.quantity}</div>}
            </div>

            {/* Quality Grade */}
            <div className="form-group">
              <label className="form-label">
                {t('produce.qualityGrade')} <span className="required-asterisk">*</span>
              </label>
              <select 
                name="qualityGrade" 
                className={`form-select ${errors.qualityGrade ? 'error' : ''}`}
                value={formData.qualityGrade}
                onChange={handleChange}
                disabled={isSaved}
              >
                <option value="">{t('produce.selectGrade')}</option>
                <option value="Grade A">{t('produce.gradeA')}</option>
                <option value="Grade B">{t('produce.gradeB')}</option>
                <option value="Grade C">{t('produce.gradeC')}</option>
                <option value="FAQ">{t('produce.gradeFAQ')}</option>
              </select>
              {errors.qualityGrade && <div className="error-msg"><AlertCircle size={12}/> {errors.qualityGrade}</div>}
            </div>

            {/* Moisture / Parameters */}
            <div className="form-group">
              <label className="form-label">
                {t('produce.moisturePercent')} <span style={{ color: 'var(--color-text-muted)', fontWeight: 400, marginLeft: 4 }}>{t('produce.moistureOptional')}</span>
              </label>
              <div className="input-with-addon">
                <input 
                  type="text" 
                  name="moisture"
                  className="form-input"
                  value={formData.moisture}
                  onChange={handleChange}
                  disabled={isSaved}
                  placeholder={t('produce.moisturePlaceholder')}
                />
                <span className="input-addon">%</span>
              </div>
            </div>

            {/* Remarks */}
            <div className="form-group full-width">
              <label className="form-label">
                {t('produce.remarksVisual')}
              </label>
              <textarea 
                name="remarks"
                className="form-textarea"
                value={formData.remarks}
                onChange={handleChange}
                disabled={isSaved}
                placeholder={t('produce.remarksPlaceholder')}
              />
            </div>
          </div>

          <div className="form-actions" style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {isConfirmed ? (
              <button className="action-btn primary" onClick={() => navigate(`/acc/procurement/${farmer.id}`)}>
                <FileText size={18} /> Proceed to Procurement (Amount & Quality) &rarr;
              </button>
            ) : !isSaved ? (
              <button className="action-btn primary" onClick={handleSave}>
                <Save size={18} />
                {t('produce.saveProduce')}
              </button>
            ) : (
              <>
                <button className="action-btn secondary" onClick={handleEdit}>
                  {t('produce.editDetails')}
                </button>
                <button className="action-btn primary" onClick={handleConfirm}>
                  <FileText size={18} />
                  {t('produce.confirmEntry')}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
