import { useEffect, useMemo, useState } from 'react'
import { Search, Phone, MapPin, Ticket } from 'lucide-react'
import { getQueue } from '../services/queueApi'
import { Skeleton } from '../components/common/Skeleton'

export default function FarmersRecordsPage() {
  const [queue, setQueue] = useState([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      try {
        const data = await getQueue()
        setQueue(data.queue || [])
      } catch (error) {
        console.error('[FarmersRecords] Unable to load farmer records.', error)
      } finally {
        setLoading(false)
      }
    }
    load()
    const interval = setInterval(load, 8000)
    return () => clearInterval(interval)
  }, [])

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return queue
    return queue.filter((item) =>
      item.farmerName.toLowerCase().includes(query)
      || String(item.farmerId).toLowerCase().includes(query)
      || String(item.mobile || '').includes(query)
      || String(item.bookingId || '').toLowerCase().includes(query)
    )
  }, [queue, search])

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--color-primary-dark)' }}>Farmer Records</h1>
          <p style={{ color: 'var(--color-text-muted)' }}>View farmer and booking details for your assigned centre.</p>
        </div>
        <div style={{ position: 'relative', minWidth: 280 }}>
          <Search size={16} style={{ position: 'absolute', top: 14, left: 14, color: 'var(--color-text-muted)' }} />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search farmer, booking or mobile" style={{ width: '100%', padding: '12px 14px 12px 38px', borderRadius: 12, border: '1px solid var(--color-border)' }} />
        </div>
      </div>

      <div style={{ background: '#fff', borderRadius: 16, border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-card)', overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--color-soft-green)' }}>
                <th style={th}>Farmer</th>
                <th style={th}>Mobile</th>
                <th style={th}>Village</th>
                <th style={th}>Booking</th>
                <th style={th}>Token</th>
                <th style={th}>Crop</th>
                <th style={th}>Status</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={`skel-${i}`} style={{ borderTop: '1px solid var(--color-border)' }}>
                    <td style={td}><Skeleton width="120px" height="18px" /><Skeleton width="70px" height="12px" style={{ marginTop: 4 }} /></td>
                    <td style={td}><Skeleton width="90px" height="16px" /></td>
                    <td style={td}><Skeleton width="80px" height="16px" /></td>
                    <td style={td}><Skeleton width="70px" height="16px" /></td>
                    <td style={td}><Skeleton width="50px" height="16px" /></td>
                    <td style={td}><Skeleton width="60px" height="16px" /></td>
                    <td style={td}><Skeleton width="70px" height="16px" /></td>
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan="7" style={{ padding: 28, textAlign: 'center', color: 'var(--color-text-muted)' }}>No farmer records found.</td>
                </tr>
              ) : (
                filtered.map((item) => (
                  <tr key={item.id} style={{ borderTop: '1px solid var(--color-border)' }}>
                    <td style={td}><strong>{item.farmerName}</strong><div style={meta}>{item.farmerId}</div></td>
                    <td style={td}><Phone size={14} style={{ verticalAlign: 'middle', marginRight: 6 }} />{item.mobile || '—'}</td>
                    <td style={td}><MapPin size={14} style={{ verticalAlign: 'middle', marginRight: 6 }} />{item.village || '—'}</td>
                    <td style={td}>{item.bookingId}</td>
                    <td style={td}><Ticket size={14} style={{ verticalAlign: 'middle', marginRight: 6 }} />{item.token}</td>
                    <td style={td}>{item.crop}</td>
                    <td style={td}><span className={`status-badge ${item.queueStatus}`}>{item.queueStatus}</span></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

const th = { textAlign: 'left', padding: '14px 16px', fontSize: '0.85rem', color: 'var(--color-text-secondary)' }
const td = { padding: '16px', fontSize: '0.95rem', verticalAlign: 'top' }
const meta = { fontSize: '0.78rem', color: 'var(--color-text-muted)', marginTop: 4 }
