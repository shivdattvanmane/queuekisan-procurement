import { useEffect, useMemo, useState } from 'react'
import DataTable from '../components/common/DataTable'
import { Skeleton } from '../components/common/Skeleton'
import { getReportBundle } from '../services/adminApi'
import { FiDownload, FiFileText } from 'react-icons/fi'
import Papa from 'papaparse'
import jsPDF from 'jspdf'
import 'jspdf-autotable'
import { useLanguage } from '../context/LanguageContext'

export default function Reports() {
  const { t } = useLanguage()
  const [reportMonth, setReportMonth] = useState(new Date().toISOString().slice(0, 7))
  const [loading, setLoading] = useState(true)
  const [report, setReport] = useState({ summary: { totalFarmersServed: 0, totalProcurement: '0 kg', totalAmount: 0, avgWaitTime: '0 min' }, centrePerformance: [] })

  useEffect(() => {
    setLoading(true)
    getReportBundle(reportMonth)
      .then(setReport)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [reportMonth])

  const centrePerformanceColumns = useMemo(() => ([
    { key: 'name', label: t('reports.colName') },
    { key: 'capacity', label: t('reports.colCapacity') },
    { key: 'utilization', label: t('reports.colUtilization') },
    { key: 'throughput', label: t('reports.colThroughput') },
    { key: 'waitTime', label: t('reports.colWaitTime') },
  ]), [t])

  const centrePerformanceData = report.centrePerformance || []

  const exportCSV = () => {
    const csv = Papa.unparse(centrePerformanceData)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `centre_performance_${reportMonth}.csv`
    link.click()
  }

  const exportPDF = () => {
    const doc = new jsPDF()
    doc.text(`QueueKisan Centre Performance - ${reportMonth}`, 14, 15)
    doc.autoTable({
      head: [[t('reports.colName'), t('reports.colCapacity'), t('reports.colUtilization'), t('reports.colThroughput'), t('reports.colWaitTime')]],
      body: centrePerformanceData.map((d) => [d.name, d.capacity, d.utilization, d.throughput, d.waitTime]),
      startY: 25,
      styles: { fontSize: 10, cellPadding: 4 },
      headStyles: { fillColor: [32, 122, 64] },
    })
    doc.save(`centre_performance_${reportMonth}.pdf`)
  }

  return (
    <div>
      <div className="section-header">
        <div>
          <h2 className="section-title">{t('reports.title')}</h2>
          <p className="section-subtitle">{t('reports.subtitle')}</p>
        </div>
      </div>

      <div className="card" style={{ marginBottom: '32px' }}>
        <div className="card-header">
          <h3 className="card-title">{t('reports.monthlySummary')}</h3>
          <div style={{ display: 'flex', gap: '12px' }}>
            <input type="month" className="form-input" value={reportMonth} onChange={(e) => setReportMonth(e.target.value)} style={{ padding: '6px 12px' }} />
            <button className="btn btn-outline" onClick={exportPDF}><FiDownload /> {t('reports.exportPdf')}</button>
          </div>
        </div>

        <div className="grid-4" style={{ marginBottom: '24px' }}>
          <div style={{ padding: '16px', background: 'var(--color-bg)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', marginBottom: '4px' }}>{t('reports.totalFarmers')}</div>
            {loading ? <Skeleton width="60px" height="28px" /> : <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{report.summary.totalFarmersServed}</div>}
          </div>
          <div style={{ padding: '16px', background: 'var(--color-bg)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', marginBottom: '4px' }}>{t('reports.totalProcurement')}</div>
            {loading ? <Skeleton width="70px" height="28px" /> : <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{report.summary.totalProcurement}</div>}
          </div>
          <div style={{ padding: '16px', background: 'var(--color-bg)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', marginBottom: '4px' }}>{t('reports.totalAmount')}</div>
            {loading ? <Skeleton width="90px" height="28px" /> : <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>₹{Number(report.summary.totalAmount || 0).toLocaleString()}</div>}
          </div>
          <div style={{ padding: '16px', background: 'var(--color-bg)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', marginBottom: '4px' }}>{t('reports.avgWaitTime')}</div>
            {loading ? <Skeleton width="60px" height="28px" /> : <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{report.summary.avgWaitTime}</div>}
          </div>
        </div>

        <h4 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <FiFileText style={{ color: 'var(--krushi-green)' }} /> {t('reports.centrePerformance')}
        </h4>

        <div style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '12px 16px', background: 'var(--color-bg)', borderBottom: '1px solid var(--color-border)' }}>
            <button className="btn btn-sm btn-secondary" onClick={exportCSV}><FiDownload /> {t('reports.exportCsv')}</button>
          </div>
          <DataTable columns={centrePerformanceColumns} data={centrePerformanceData} loading={loading} />
        </div>
      </div>
    </div>
  )
}
