import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  CheckCircle2,
  CircleDollarSign,
  CreditCard,
  FileText,
  User,
  BadgeCheck,
  AlertCircle,
} from 'lucide-react'
import { useToast } from '../context/ToastContext'
import { socketService } from '../services/socketService'
import { getQueue, updatePayment } from '../services/queueApi'

export default function PaymentStatusPage() {
  const navigate = useNavigate()
  const { showToast } = useToast()

  const [queue, setQueue] = useState([])
  const [selectedBookingId, setSelectedBookingId] = useState('')
  const [paymentStatus, setPaymentStatus] = useState('pending')
  const [referenceId, setReferenceId] = useState('')
  const [loading, setLoading] = useState(false)

  const syncQueue = async (isInitial = false) => {
    try {
      const data = await getQueue()
      const nextQueue = Array.isArray(data?.queue) ? data.queue : []
      setQueue(nextQueue)
      if (isInitial || !selectedBookingId) {
        const paymentCandidate = nextQueue.find((item) => item.procurementStatus === 'completed' && item.paymentStatus !== 'completed') || nextQueue[0] || null
        if (paymentCandidate) {
          setSelectedBookingId(paymentCandidate.id)
          setPaymentStatus(paymentCandidate.paymentStatus || 'pending')
          setReferenceId(paymentCandidate.referenceId || '')
        }
      }
    } catch (error) {
      console.error('[Payment] Unable to sync payment queue.', error)
    }
  }

  useEffect(() => {
    syncQueue(true)
    socketService.connect()

    const unsubscribeQueue = socketService.onQueueUpdated(() => {
      syncQueue(false)
    })
    const interval = setInterval(() => {
      syncQueue(false)
    }, 8000)

    return () => {
      clearInterval(interval)
      unsubscribeQueue()
    }
  }, [])

  const paymentRecords = useMemo(() => queue.filter((farmer) => farmer.procurementStatus === 'completed' || farmer.paymentStatus), [queue])
  const selectedFarmer = useMemo(() => {
    if (!selectedBookingId) return paymentRecords[0] || null
    return paymentRecords.find((item) => String(item.id) === String(selectedBookingId)) || paymentRecords[0] || null
  }, [selectedBookingId, paymentRecords])

  const handleUpdateStatus = async () => {
    if (!selectedFarmer) return
    try {
      setLoading(true)
      const payload = {
        status: paymentStatus,
        referenceId: referenceId || selectedFarmer.referenceId || `PAY-${selectedFarmer.token}`,
        amount: Number(selectedFarmer.amount || 0),
        paymentDate: new Date().toISOString(),
      }
      const result = await updatePayment(selectedFarmer.id, payload)
      setQueue(Array.isArray(result?.queue) ? result.queue : [])
      setPaymentStatus(result?.farmer?.paymentStatus || paymentStatus)
      setReferenceId(result?.farmer?.referenceId || referenceId || `PAY-${selectedFarmer.token}`)
      showToast('Payment status updated', 'success')
      socketService.emitPaymentUpdated({ ...result.farmer, farmerId: result.farmer.farmerId })
    } catch (error) {
      console.error('[Payment] Unable to update payment status:', error)
      showToast(error.message || 'Unable to update payment status.', 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleMarkCompleted = async () => {
    if (!selectedFarmer) return
    try {
      setLoading(true)
      const payload = {
        status: 'completed',
        referenceId: referenceId || `PAY-${selectedFarmer.token}`,
        amount: Number(selectedFarmer.amount || 0),
        paymentDate: new Date().toISOString(),
      }
      const result = await updatePayment(selectedFarmer.id, payload)
      setQueue(Array.isArray(result?.queue) ? result.queue : [])
      setPaymentStatus('completed')
      setReferenceId(result?.farmer?.referenceId || referenceId || `PAY-${selectedFarmer.token}`)
      showToast('Payment completed successfully.', 'success')
      socketService.emitPaymentUpdated({ ...result.farmer, farmerId: result.farmer.farmerId })
    } catch (error) {
      console.error('[Payment] Unable to mark payment completed:', error)
      showToast(error.message || 'Unable to complete payment.', 'error')
    } finally {
      setLoading(false)
    }
  }

  const getStatusColor = (status) => {
    const normalized = (status || 'pending').toLowerCase()
    if (normalized === 'completed') return 'var(--color-primary)'
    if (normalized === 'processing') return 'var(--color-warning)'
    if (normalized === 'failed') return 'var(--color-error)'
    return 'var(--color-text-muted)'
  }

  if (!selectedFarmer) {
    return <div style={{ padding: 24 }}>No payment records available.</div>
  }

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--color-primary-dark)' }}>Payment Status</h1>
          <p style={{ color: 'var(--color-text-muted)' }}>Track procurement settlement and complete payment for verified farmers.</p>
        </div>
        <button className="action-btn secondary" onClick={() => navigate('/acc/dashboard')}>
          <ArrowLeft size={16} /> Back
        </button>
      </div>

      {paymentStatus === 'completed' && (
        <div className="success-banner" style={{ marginBottom: 18 }}>
          <CheckCircle2 size={24} color="var(--color-primary)" />
          <div className="success-banner-content">
            <h4>Payment completed successfully.</h4>
            <p>Farmer dashboard updated and the task is complete.</p>
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '0.9fr 1.5fr', gap: 20 }}>
        <div style={{ background: '#fff', borderRadius: 14, border: '1px solid var(--color-border)', padding: 18, boxShadow: 'var(--shadow-card)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <CreditCard size={18} color="var(--color-primary)" />
            <h2 style={{ fontSize: '1rem', fontWeight: 700 }}>Payment Queue</h2>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {paymentRecords.map((item) => (
              <button
                key={item.id}
                onClick={() => {
                  setSelectedBookingId(item.id)
                  setPaymentStatus(item.paymentStatus || 'pending')
                  setReferenceId(item.referenceId || '')
                }}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  padding: '14px 12px',
                  borderRadius: 12,
                  border: selectedFarmer?.id === item.id ? '1px solid var(--color-primary)' : '1px solid var(--color-border)',
                  background: selectedFarmer?.id === item.id ? 'var(--color-soft-green)' : '#fff',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <div>
                  <div style={{ fontWeight: 700 }}>{item.farmerName}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{item.bookingId || item.farmerId}</div>
                </div>
                <span className="status-badge" style={{ background: item.paymentStatus === 'completed' ? 'var(--color-soft-green)' : item.paymentStatus === 'processing' ? '#fff3d6' : '#f3f4f6', color: getStatusColor(item.paymentStatus || 'pending') }}>
                  {item.paymentStatus || 'pending'}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div style={{ background: '#fff', borderRadius: 14, border: '1px solid var(--color-border)', padding: 22, boxShadow: 'var(--shadow-card)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18 }}>
            <FileText size={18} color="var(--color-primary)" />
            <h2 style={{ fontSize: '1rem', fontWeight: 700 }}>Payment Card</h2>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>Farmer Name</div>
              <div style={{ fontWeight: 700 }}><User size={14} style={{ verticalAlign: 'middle', marginRight: 6 }} />{selectedFarmer.farmerName}</div>
            </div>
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>Procurement ID</div>
              <div style={{ fontWeight: 700 }}>{selectedFarmer.bookingId || selectedFarmer.farmerId}</div>
            </div>
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>Procurement Amount</div>
              <div style={{ fontWeight: 700 }}>₹ {Number(selectedFarmer.amount || 0).toLocaleString('en-IN')}</div>
            </div>
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>Payment Status</div>
              <span className="status-badge" style={{ background: paymentStatus === 'completed' ? 'var(--color-soft-green)' : paymentStatus === 'processing' ? '#fff3d6' : '#f3f4f6', color: getStatusColor(paymentStatus) }}>{paymentStatus}</span>
            </div>
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>Payment / Reference ID</div>
              <div style={{ fontWeight: 700 }}>{referenceId || selectedFarmer.referenceId || `PAY-${selectedFarmer.token}`}</div>
            </div>
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>Payment Date</div>
              <div style={{ fontWeight: 700 }}>{selectedFarmer.paymentDate ? new Date(selectedFarmer.paymentDate).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : 'Not started'}</div>
            </div>
          </div>

          <div style={{ marginTop: 22, padding: '14px 16px', borderRadius: 12, border: '1px solid var(--color-border)', background: 'var(--color-surface)' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', marginBottom: 10 }}>Farmer Payment Details</div>
            {(selectedFarmer.paymentProfile || selectedFarmer.bankDetails) ? (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div><div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>Account Holder</div><strong>{(selectedFarmer.paymentProfile || selectedFarmer.bankDetails).accountHolder || '-'}</strong></div>
                <div><div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>Bank</div><strong>{(selectedFarmer.paymentProfile || selectedFarmer.bankDetails).bankName || '-'}</strong></div>
                <div><div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>Account No.</div><strong>{(selectedFarmer.paymentProfile || selectedFarmer.bankDetails).accountNumber || '-'}</strong></div>
                <div><div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>IFSC / UPI</div><strong>{(selectedFarmer.paymentProfile || selectedFarmer.bankDetails).ifscCode || '-'}{(selectedFarmer.paymentProfile || selectedFarmer.bankDetails).upiId ? ` / ${(selectedFarmer.paymentProfile || selectedFarmer.bankDetails).upiId}` : ''}</strong></div>
              </div>
            ) : (
              <div style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>Farmer has not added payment details yet.</div>
            )}
          </div>

          <div style={{ marginTop: 24, display: 'grid', gap: 16 }}>
            <div>
              <label style={{ display: 'block', marginBottom: 8, fontWeight: 600 }}>Update Payment Status</label>
              <select value={paymentStatus} onChange={(e) => setPaymentStatus(e.target.value)} style={{ width: '100%', padding: '12px 14px', borderRadius: 10, border: '1px solid var(--color-border)', background: '#fff' }}>
                <option value="pending">Pending</option>
                <option value="processing">Processing</option>
                <option value="completed">Completed</option>
                <option value="failed">Failed</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: 8, fontWeight: 600 }}>Reference ID</label>
              <input value={referenceId} onChange={(e) => setReferenceId(e.target.value)} placeholder="Enter payment reference ID" style={{ width: '100%', padding: '12px 14px', borderRadius: 10, border: '1px solid var(--color-border)' }} />
            </div>

            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <button className="action-btn primary" onClick={handleUpdateStatus} disabled={loading}>
                <CircleDollarSign size={18} /> Update Payment Status
              </button>
              <button className="action-btn primary" onClick={handleMarkCompleted} disabled={loading || paymentStatus === 'completed'}>
                <BadgeCheck size={18} /> Mark Payment Completed
              </button>
            </div>

            {paymentStatus === 'completed' && (
              <div style={{ padding: '12px 14px', borderRadius: 10, background: '#edf9f0', border: '1px solid #c4e7cf', color: 'var(--color-primary-dark)', display: 'flex', alignItems: 'center', gap: 10 }}>
                <AlertCircle size={18} />
                Payment completed successfully.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
