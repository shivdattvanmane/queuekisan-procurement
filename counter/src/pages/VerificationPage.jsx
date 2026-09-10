import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  QrCode,
  Scan,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  UserCheck,
  XOctagon,
  UserMinus,
  Check,
  Upload,
  CameraOff,
} from 'lucide-react'
import { Html5Qrcode } from 'html5-qrcode'
import jsQR from 'jsqr'
import { useToast } from '../context/ToastContext'
import { useLanguage } from '../context/LanguageContext'
import { socketService } from '../services/socketService'
import { applyQueueAction, getQueue, verifyFarmer } from '../services/queueApi'
import { Skeleton } from '../components/common/Skeleton'
import './VerificationPage.css'

async function decodeQrImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d', { willReadFrequently: true })

        canvas.width = img.naturalWidth || img.width
        canvas.height = img.naturalHeight || img.height
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)

        let imgData = ctx.getImageData(0, 0, canvas.width, canvas.height)
        let code = jsQR(imgData.data, imgData.width, imgData.height, {
          inversionAttempts: 'attemptBoth',
        })

        if (code && code.data) return resolve(code.data)

        // Try scaled attempts for high-res / compressed screenshots
        const targetSizes = [800, 500, 300, 1200]
        for (const target of targetSizes) {
          if (Math.max(img.width, img.height) !== target) {
            const scale = target / Math.max(img.width, img.height)
            canvas.width = Math.round(img.width * scale)
            canvas.height = Math.round(img.height * scale)
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
            imgData = ctx.getImageData(0, 0, canvas.width, canvas.height)
            code = jsQR(imgData.data, imgData.width, imgData.height, {
              inversionAttempts: 'attemptBoth',
            })
            if (code && code.data) return resolve(code.data)
          }
        }

        reject(new Error('No QR code detected in image'))
      }
      img.onerror = () => reject(new Error('Could not read image file'))
      img.src = reader.result
    }
    reader.onerror = () => reject(new Error('Could not read image file'))
    reader.readAsDataURL(file)
  })
}

function parseQrPayload(value) {
  const text = String(value || '').trim()
  if (!text) return null

  try {
    const parsed = JSON.parse(text)
    return {
      bookingId: parsed.bookingId || parsed.booking_id || parsed.bid || parsed.id || '',
      token: parsed.token || parsed.tokenNumber || '',
      farmerId: parsed.farmerId || '',
      farmerName: parsed.farmerName || '',
      mobile: parsed.mobile || '',
      village: parsed.village || '',
      crop: parsed.crop || '',
      quantityKg: parsed.quantityKg || parsed.quantity || 0,
      slotDate: parsed.date || parsed.slotDate || '',
      slotTime: parsed.slot || parsed.slotTime || '',
      centreId: parsed.centreId || '',
      centreName: parsed.centreName || '',
      bankDetails: parsed.bankDetails || null,
      raw: text,
      isRichPayload: true,
    }
  } catch {
    // Compact farmer QR payloads use QK:BOOKING:TOKEN or plain token.
  }

  const compact = /^QK:([^:]+):([^:]+)$/i.exec(text)
  if (compact) return { bookingId: compact[1], token: compact[2], raw: text }
  return { bookingId: text, token: text, raw: text }
}

function matchesQrPayload(row, parsed) {
  if (!row || !parsed) return false
  const bookingId = String(parsed.bookingId || '').trim().toLowerCase()
  const token = String(parsed.token || '').trim().toLowerCase()
  const farmerId = String(parsed.farmerId || '').trim().toLowerCase()
  const rowIds = [row.id, row.bookingId, row.bookingRowId].filter(Boolean).map((v) => String(v).trim().toLowerCase())
  const rowToken = String(row.token || '').trim().toLowerCase()
  const rowFarmerId = String(row.farmerId || '').trim().toLowerCase()

  if (token && rowToken === token) return true
  if (bookingId && rowIds.includes(bookingId)) return true
  if (farmerId && rowFarmerId === farmerId) return true

  return false
}

export default function VerificationPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { showToast } = useToast()
  const { t } = useLanguage()

  const [farmer, setFarmer] = useState(null)
  const [queue, setQueue] = useState([])
  const [qrStatus, setQrStatus] = useState('idle')
  const [qrInput, setQrInput] = useState('')
  const [scanMessage, setScanMessage] = useState('')
  const [workflowStatus, setWorkflowStatus] = useState('pending')
  const qrScannerRef = useRef(null)
  const isStoppingRef = useRef(false)

  const stopScanner = async () => {
    if (qrScannerRef.current && !isStoppingRef.current) {
      isStoppingRef.current = true
      try {
        if (qrScannerRef.current.isScanning) {
          await qrScannerRef.current.stop()
        }
        qrScannerRef.current.clear()
      } catch (err) {
        console.warn('[Verification] Scanner stop cleanup:', err)
      } finally {
        qrScannerRef.current = null
        isStoppingRef.current = false
      }
    }
  }

  const syncFarmer = async () => {
    try {
      const data = await getQueue()
      const nextQueue = Array.isArray(data?.queue) ? data.queue : []
      const nextFarmer = (id ? nextQueue.find((q) => q.id === id || q.farmerId === id || q.token === id || q.bookingId === id) : null) || nextQueue[0] || null
      setQueue(nextQueue)
      setFarmer((current) => current || nextFarmer)
      if (nextFarmer?.checkIn === 'checked-in') setWorkflowStatus('checked-in')
    } catch (error) {
      console.error('[Verification] Unable to load farmer details.', error)
    }
  }

  useEffect(() => {
    syncFarmer()
    socketService.connect()

    const unsubscribe = socketService.onQueueUpdated(() => {
      syncFarmer()
    })
    const interval = setInterval(syncFarmer, 8000)

    return () => {
      clearInterval(interval)
      stopScanner()
      unsubscribe()
    }
  }, [id])

  const validateQrPayload = (value) => {
    const parsed = parseQrPayload(value)
    if (!parsed) {
      setQrStatus('invalid')
      setScanMessage('Invalid QR payload format.')
      return null
    }

    const matchedFarmer = queue.find((item) => matchesQrPayload(item, parsed))

    const resolvedFarmer = matchedFarmer ? {
      ...matchedFarmer,
      farmerName: parsed.farmerName || matchedFarmer.farmerName,
      mobile: parsed.mobile || matchedFarmer.mobile,
      village: parsed.village || matchedFarmer.village,
      crop: parsed.crop || matchedFarmer.crop,
      quantityKg: parsed.quantityKg || matchedFarmer.quantityKg,
      quantityDisplay: parsed.quantityKg ? `${parsed.quantityKg} kg` : matchedFarmer.quantityDisplay,
      paymentProfile: parsed.bankDetails || matchedFarmer.paymentProfile,
      bankDetails: parsed.bankDetails || matchedFarmer.bankDetails,
    } : {
      id: parsed.bookingId || `TMP-${Date.now()}`,
      bookingId: parsed.bookingId || '—',
      token: parsed.token || '—',
      farmerId: parsed.farmerId || 'FARMER-QR',
      farmerName: parsed.farmerName || 'Farmer (from QR)',
      mobile: parsed.mobile || '—',
      village: parsed.village || '—',
      crop: parsed.crop || 'Wheat',
      quantityKg: parsed.quantityKg || 0,
      quantityDisplay: parsed.quantityKg ? `${parsed.quantityKg} kg` : 'Not recorded',
      slot: parsed.slotTime || 'Today',
      date: parsed.slotDate || new Date().toISOString().slice(0, 10),
      checkIn: 'checked-in',
      queueStatus: 'serving',
      paymentProfile: parsed.bankDetails || null,
      bankDetails: parsed.bankDetails || null,
    }

    setFarmer(resolvedFarmer)
    setQrInput(parsed.raw)
    setQrStatus('valid')
    setWorkflowStatus(resolvedFarmer.checkIn === 'checked-in' ? 'checked-in' : 'pending')
    setScanMessage(`Verified Token ${resolvedFarmer.token} for ${resolvedFarmer.farmerName}. Full details loaded from QR.`)
    return resolvedFarmer
  }

  const handleScanQR = async () => {
    if (qrStatus === 'scanning') {
      await stopScanner()
      setQrStatus('idle')
      setScanMessage('')
      return
    }

    try {
      setQrStatus('scanning')
      setScanMessage('Initializing camera...')

      await stopScanner()

      const scanner = new Html5Qrcode('qr-reader-box')
      qrScannerRef.current = scanner

      const config = {
        fps: 10,
        qrbox: { width: 170, height: 170 },
        aspectRatio: 1.0,
      }

      await scanner.start(
        { facingMode: 'environment' },
        config,
        async (decodedText) => {
          await stopScanner()
          validateQrPayload(decodedText)
        },
        () => {
          // Ignored per-frame decoding attempt
        }
      )
      setScanMessage('Point camera at the farmer QR code ticket.')
    } catch (error) {
      console.error('[Verification] QR camera start failed:', error)
      await stopScanner()
      setQrStatus('invalid')
      const msg = String(error?.message || error || '')
      if (msg.includes('NotAllowedError') || msg.includes('Permission')) {
        setScanMessage('Camera permission was denied. Please enable camera permissions in your browser or enter code below.')
      } else if (msg.includes('NotFoundError') || msg.includes('DevicesNotFoundError')) {
        setScanMessage('No camera found on this device. Enter booking ID or token manually below.')
      } else {
        setScanMessage(msg || 'Unable to access camera. Please enter code manually below.')
      }
    }
  }

  const handleFileUpload = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return

    try {
      setScanMessage('Scanning QR image...')
      await stopScanner()

      let decodedText = null
      try {
        decodedText = await decodeQrImage(file)
      } catch (jsQrErr) {
        console.warn('[Verification] jsQR decode attempt failed, trying Html5Qrcode:', jsQrErr)
      }

      if (!decodedText) {
        const scanner = new Html5Qrcode('qr-reader-box')
        decodedText = await scanner.scanFile(file, false)
      }

      if (decodedText) {
        validateQrPayload(decodedText)
      } else {
        throw new Error('No QR code detected')
      }
    } catch (error) {
      console.error('[Verification] QR image file scan failed:', error)
      setQrStatus('invalid')
      setScanMessage('Could not detect a valid QR code in this image. Please upload a clear photo or enter the token/booking ID below.')
    } finally {
      event.target.value = ''
    }
  }

  const handleManualQrSubmit = (event) => {
    event.preventDefault()
    validateQrPayload(qrInput)
  }

  const handleConfirmCheckIn = async () => {
    if (qrStatus !== 'valid') {
      showToast('Please scan or verify the farmer QR first.', 'info')
      return
    }

    try {
      const result = await verifyFarmer(farmer.id)
      setWorkflowStatus('checked-in')
      setFarmer(result?.farmer || farmer)
      showToast(t('verification.verificationSuccess'), 'success')
      socketService.emitVerificationCompleted(result?.farmer || farmer)
    } catch (error) {
      console.error('[Verification] Unable to confirm check-in:', error)
      showToast(error.message || t('verification.verificationFailed'), 'error')
    }
  }

  const handleReject = async () => {
    if (!window.confirm(t('verification.confirmReject'))) return
    try {
      const result = await applyQueueAction(farmer.id, 'skip')
      setWorkflowStatus('rejected')
      setFarmer(result?.farmer || farmer)
      showToast('Booking rejected and marked skipped.', 'success')
      socketService.emitQueueChanged('skip', result?.farmer || farmer)
    } catch (error) {
      showToast(error.message || 'Unable to reject booking.', 'error')
    }
  }

  const handleNoShow = async () => {
    if (!window.confirm(t('verification.confirmNoShow'))) return
    try {
      const result = await applyQueueAction(farmer.id, 'no-show')
      setWorkflowStatus('no-show')
      setFarmer(result?.farmer || farmer)
      showToast('Booking marked as no-show.', 'success')
      socketService.emitQueueChanged('no-show', result?.farmer || farmer)
    } catch (error) {
      showToast(error.message || 'Unable to mark no-show.', 'error')
    }
  }

  const handleBackToQueue = () => {
    stopScanner()
    navigate('/acc/queue')
  }

  if (!farmer) {
    return (
      <div className="verification-container" style={{ padding: '24px' }}>
        <Skeleton width="240px" height="32px" style={{ marginBottom: '12px' }} />
        <Skeleton width="180px" height="18px" style={{ marginBottom: '24px' }} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
          <div className="skeleton-card" style={{ height: '360px' }} />
          <div className="skeleton-card" style={{ height: '360px' }} />
        </div>
      </div>
    )
  }

  const farmerQuantity = farmer.quantityDisplay || (farmer.quantityKg ? `${farmer.quantityKg} kg` : 'Not recorded')

  return (
    <div className="verification-container">
      <div className="ver-header">
        <div>
          <h1 className="ver-title">{t('verification.title')}</h1>
          <p className="ver-subtitle">{t('verification.subtitle')}</p>
        </div>
        <button className="back-btn" onClick={handleBackToQueue}>
          <ArrowLeft size={16} />
          {t('verification.backToQueue')}
        </button>
      </div>

      <div className="ver-grid">
        <div className="qr-card">
          <h2 className="qr-title">{t('verification.qrVerification')}</h2>

          <div className={`qr-placeholder ${qrStatus === 'scanning' ? 'scanning' : ''}`}>
            <div id="qr-reader-box" className="qr-reader-box" style={{ display: qrStatus === 'scanning' ? 'block' : 'none' }} />

            {qrStatus !== 'scanning' && (
              <>
                {qrStatus === 'valid' ? (
                  <CheckCircle2 size={48} color="var(--color-primary)" />
                ) : qrStatus === 'invalid' ? (
                  <XCircle size={48} color="var(--color-error)" />
                ) : (
                  <QrCode size={48} strokeWidth={1.5} />
                )}

                {qrStatus === 'idle' && <span>{t('verification.awaitingScan')}</span>}
                {qrStatus === 'valid' && <span style={{ color: 'var(--color-primary)', fontWeight: 600 }}>{t('verification.validQR')}</span>}
                {qrStatus === 'invalid' && <span style={{ color: 'var(--color-error)', fontWeight: 600 }}>{t('verification.invalidQR')}</span>}
              </>
            )}
          </div>

          {qrStatus === 'idle' && (
            <div className="qr-status pending">
              <AlertTriangle size={16} />
              {t('verification.pendingVerification')}
            </div>
          )}
          {qrStatus === 'valid' && (
            <div className="qr-status valid">
              <CheckCircle2 size={16} />
              {t('verification.bookingAuthenticated')}
            </div>
          )}
          {qrStatus === 'invalid' && (
            <div className="qr-status invalid">
              <XCircle size={16} />
              {t('verification.unrecognizedBooking')}
            </div>
          )}

          <div className="qr-actions-row">
            <button
              className={`qr-action-btn ${qrStatus === 'scanning' ? 'stop' : ''}`}
              onClick={handleScanQR}
              disabled={qrStatus === 'valid'}
            >
              {qrStatus === 'scanning' ? (
                <>
                  <CameraOff size={18} />
                  Stop Camera
                </>
              ) : (
                <>
                  <Scan size={18} />
                  {qrStatus === 'idle' || qrStatus === 'invalid' ? t('verification.scanFarmerQR') : t('verification.scanning')}
                </>
              )}
            </button>
          </div>

          <label className="qr-upload-btn" title="Upload QR image file or photo">
            <Upload size={15} />
            <span>Upload QR Image / Photo</span>
            <input type="file" accept="image/*" onChange={handleFileUpload} style={{ display: 'none' }} />
          </label>

          <form className="qr-manual-form" onSubmit={handleManualQrSubmit}>
            <input
              value={qrInput}
              onChange={(event) => setQrInput(event.target.value)}
              placeholder="Booking ID, token, or QR text"
            />
            <button type="submit">Verify Code</button>
          </form>

          {scanMessage && <div className="qr-scan-message">{scanMessage}</div>}
        </div>

        <div className="details-card" style={{ position: 'relative' }}>
          {workflowStatus === 'checked-in' && (
            <div className="success-overlay">
              <div className="success-icon-wrap">
                <Check size={32} strokeWidth={3} />
              </div>
              <div>
                <h3 className="success-title">{t('verification.verificationSuccess')}</h3>
                <p className="success-desc">{t('verification.verificationSuccessMsg').replace('{name}', farmer.farmerName)}</p>
              </div>
              <button
                className="v-btn confirm"
                onClick={() => navigate(`/acc/procurement/${farmer.id}`)}
                style={{ marginTop: 8 }}
              >
                {t('verification.proceedToProduceEntry')}
              </button>
            </div>
          )}

          <div className="details-header">
            <h2 className="details-title">{t('verification.bookingDetails')}</h2>
            <div className="token-badge">{farmer.token}</div>
          </div>

          <div className="details-grid">
            <div className="detail-item">
              <span className="d-label">{t('verification.farmerName')}</span>
              <span className="d-value">{farmer.farmerName}</span>
            </div>
            <div className="detail-item">
              <span className="d-label">{t('verification.farmerId')}</span>
              <span className="d-value">{String(farmer.farmerId || '').toUpperCase()}</span>
            </div>
            <div className="detail-item">
              <span className="d-label">{t('verification.mobileNumber')}</span>
              <span className="d-value">+91 {farmer.mobile}</span>
            </div>
            <div className="detail-item">
              <span className="d-label">{t('verification.villageLocation')}</span>
              <span className="d-value">{farmer.village}</span>
            </div>
            <div className="detail-item">
              <span className="d-label">{t('verification.bookingId')}</span>
              <span className="d-value" style={{ fontFamily: 'monospace' }}>{farmer.bookingId}</span>
            </div>
            <div className="detail-item">
              <span className="d-label">{t('verification.bookedSlot')}</span>
              <span className="d-value">{farmer.slot}</span>
            </div>
            <div className="detail-item">
              <span className="d-label">{t('verification.cropDeclared')}</span>
              <span className="d-value">{farmer.crop} ({farmerQuantity})</span>
            </div>
            <div className="detail-item">
              <span className="d-label">{t('verification.checkInStatus')}</span>
              <span className="d-value" style={{ textTransform: 'capitalize' }}>
                {workflowStatus === 'pending' ? t('common.pending') : workflowStatus}
              </span>
            </div>
          </div>

          {(farmer.paymentProfile?.accountNumber || farmer.bankDetails?.accountNumber || farmer.paymentProfile?.bankName) && (
            <div style={{ marginTop: '16px', padding: '14px', background: 'var(--krushi-lighter, #f0fdf4)', borderRadius: '12px', border: '1px solid var(--krushi-light, #bbf7d0)' }}>
              <div style={{ fontWeight: 600, color: 'var(--krushi-green, #166534)', fontSize: '0.85rem', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <CheckCircle2 size={16} color="var(--krushi-green)" />
                <span>Bank & Payment Details (Auto-Decoded from Farmer QR)</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '8px', fontSize: '0.82rem' }}>
                <div>
                  <span style={{ color: 'var(--color-text-muted)', display: 'block', fontSize: '0.72rem' }}>Bank Name</span>
                  <strong>{(farmer.paymentProfile || farmer.bankDetails).bankName || '—'}</strong>
                </div>
                <div>
                  <span style={{ color: 'var(--color-text-muted)', display: 'block', fontSize: '0.72rem' }}>Account Number</span>
                  <strong>{(farmer.paymentProfile || farmer.bankDetails).accountNumber || '—'}</strong>
                </div>
                <div>
                  <span style={{ color: 'var(--color-text-muted)', display: 'block', fontSize: '0.72rem' }}>IFSC Code</span>
                  <strong>{(farmer.paymentProfile || farmer.bankDetails).ifscCode || '—'}</strong>
                </div>
                <div>
                  <span style={{ color: 'var(--color-text-muted)', display: 'block', fontSize: '0.72rem' }}>UPI ID</span>
                  <strong>{(farmer.paymentProfile || farmer.bankDetails).upiId || '—'}</strong>
                </div>
              </div>
            </div>
          )}

          <div className="ver-actions-panel">
            <div className="ver-actions-title">{t('verification.verificationActions')}</div>
            <div className="ver-btn-group">
              {workflowStatus === 'checked-in' || farmer.checkIn === 'checked-in' ? (
                <button
                  className="v-btn confirm"
                  onClick={() => navigate(`/acc/produce/${farmer.id}`)}
                >
                  <UserCheck size={18} />
                  Proceed to Produce Entry &rarr;
                </button>
              ) : (
                <button
                  className="v-btn confirm"
                  onClick={handleConfirmCheckIn}
                  disabled={qrStatus !== 'valid' || workflowStatus !== 'pending'}
                  title={qrStatus !== 'valid' ? t('verification.mustValidateQR') : ''}
                >
                  <UserCheck size={18} />
                  {t('verification.confirmCheckIn')}
                </button>
              )}

              <button
                className="v-btn reject"
                onClick={handleReject}
                disabled={workflowStatus !== 'pending' && farmer.checkIn === 'checked-in'}
              >
                <XOctagon size={18} />
                {t('verification.reject')}
              </button>

              <button
                className="v-btn no-show"
                onClick={handleNoShow}
                disabled={workflowStatus !== 'pending' && farmer.checkIn === 'checked-in'}
              >
                <UserMinus size={18} />
                {t('verification.noShow')}
              </button>
            </div>

            {qrStatus !== 'valid' && workflowStatus === 'pending' && (
              <p style={{ fontSize: '0.8125rem', color: 'var(--color-warning)', marginTop: 4 }}>
                <AlertTriangle size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />
                {t('verification.qrWarning')}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
