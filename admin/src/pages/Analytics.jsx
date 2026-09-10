import { useEffect, useState } from 'react'
import { Line, Bar, Doughnut } from 'react-chartjs-2'
import { adminSocketService } from '../services/socketService'
import ChartCard from '../components/common/ChartCard'
import { getAnalyticsBundle } from '../services/adminApi'
import { FiTrendingUp, FiClock, FiUsers, FiMapPin, FiCalendar } from 'react-icons/fi'
import { useLanguage } from '../context/LanguageContext'

const EMPTY = {
  analyticsData: {
    farmerRegistrations: { labels: [], data: [] },
    villageDistribution: { labels: [], data: [] },
    dailyProcurements: { labels: [], data: [] },
    cropDistribution: { labels: [], data: [] },
    avgWaitTimes: { labels: [], data: [] },
    centrePerformance: { labels: [], utilization: [], throughput: [] },
  },
  predictions: {
    expectedCrowdLevel: { value: '-', confidence: '-', description: '' },
    estimatedWaitTime: { value: '-', confidence: '-', description: '' },
    peakHourPrediction: { value: '-', confidence: '-', description: '' },
    noShowPatterns: { value: '-', confidence: '-', description: '' },
    recommendedSlots: [],
  },
  mlDiagnostics: {},
}

export default function Analytics() {
  const { t } = useLanguage()
  const [activeTab, setActiveTab] = useState('farmer')
  const [bundle, setBundle] = useState(EMPTY)

  useEffect(() => {
    const load = () => getAnalyticsBundle().then(setBundle).catch(console.error)
    load()
    adminSocketService.connect()
    const unsubscribe = adminSocketService.onUpdate((payload) => {
      if (payload?.event === 'analytics:updated' || payload?.event === 'queue:updated' || payload?.event === 'payment:updated' || payload?.event === 'procurement:completed') {
        load()
      }
    })
    return () => unsubscribe()
  }, [])

  const { analyticsData, predictions, mlDiagnostics = {} } = bundle

  const lineOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.05)' } },
      x: { grid: { display: false } },
    },
    elements: { line: { tension: 0.4 } },
  }

  const barOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.05)' } },
      x: { grid: { display: false } },
    },
  }

  const doughnutOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { position: 'bottom' } },
    cutout: '70%',
  }

  const clusterEntries = Object.entries(mlDiagnostics.clusters || {})
  const regressionReady = !!mlDiagnostics.regressionReady
  const fallbackReason = mlDiagnostics.fallbackReason || ''

  return (
    <div>
      <div className="section-header">
        <div>
          <h2 className="section-title">{t('analytics.title')}</h2>
          <p className="section-subtitle">{t('analytics.subtitle')}</p>
        </div>
      </div>

      <div className="section-header">
        <h3 className="section-title" style={{ fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <FiTrendingUp style={{ color: 'var(--krushi-green)' }} /> {t('analytics.aiPredictions')}
        </h3>
      </div>

      <div className="grid-4" style={{ marginBottom: '32px' }}>
        <div className="prediction-card">
          <div className="prediction-label">{t('analytics.predicted')}</div>
          <div className="prediction-value">{predictions.expectedCrowdLevel.value}</div>
          <div className="prediction-title">{t('analytics.expectedCrowd')}</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '8px' }}>
            {t('analytics.confidence')}: {predictions.expectedCrowdLevel.confidence} | {predictions.expectedCrowdLevel.description}
          </div>
        </div>

        <div className="prediction-card">
          <div className="prediction-label">{t('analytics.predicted')}</div>
          <div className="prediction-value">{predictions.estimatedWaitTime.value}</div>
          <div className="prediction-title">{t('analytics.avgEstWait')}</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '8px' }}>
            {t('analytics.confidence')}: {predictions.estimatedWaitTime.confidence} | {predictions.estimatedWaitTime.description}
          </div>
        </div>

        <div className="prediction-card">
          <div className="prediction-label">{t('analytics.predicted')}</div>
          <div className="prediction-value">{predictions.peakHourPrediction.value}</div>
          <div className="prediction-title">{t('analytics.peakWindow')}</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '8px' }}>
            {t('analytics.confidence')}: {predictions.peakHourPrediction.confidence} | {predictions.peakHourPrediction.description}
          </div>
        </div>

        <div className="prediction-card">
          <div className="prediction-label" style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#EF4444' }}>{t('analytics.predicted')}</div>
          <div className="prediction-value">{predictions.noShowPatterns.value}</div>
          <div className="prediction-title">{t('analytics.expectedNoShow')}</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '8px' }}>
            {t('analytics.confidence')}: {predictions.noShowPatterns.confidence} | {predictions.noShowPatterns.description}
          </div>
        </div>

        <div className="prediction-card">
          <div className="prediction-label">{t('analytics.predicted')}</div>
          <div className="prediction-value">{predictions.averageProcessingTime || '-'}</div>
          <div className="prediction-title">Average Processing Time</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '8px' }}>
            Rolling historical service estimate across completed procurements.
          </div>
        </div>

        <div className="prediction-card">
          <div className="prediction-label">{t('analytics.predicted')}</div>
          <div className="prediction-value">{predictions.congestionScore != null ? `${predictions.congestionScore}%` : '-'}</div>
          <div className="prediction-title">Queue Congestion Score</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '8px' }}>
            Composite live congestion signal from waiting load and centre capacity.
          </div>
        </div>

        <div className="prediction-card">
          <div className="prediction-label">MODEL</div>
          <div className="prediction-value" style={{ fontSize: '1.2rem' }}>{String(mlDiagnostics.model || 'historical-heuristic').replace(/_/g, ' ')}</div>
          <div className="prediction-title">Prediction Engine</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '8px' }}>
            cluster samples: {mlDiagnostics.clusterSamples ?? 0} | labeled runs: {mlDiagnostics.regressionSamples ?? 0}{mlDiagnostics.trainR2 != null ? ` | train R²: ${mlDiagnostics.trainR2}` : ''}
          </div>
        </div>
      </div>

      <div className="tabs" style={{ marginBottom: '24px' }}>
        <div className={`tab ${activeTab === 'farmer' ? 'active' : ''}`} onClick={() => setActiveTab('farmer')}>
          <FiUsers style={{ marginRight: '6px' }} /> {t('analytics.tabFarmer')}
        </div>
        <div className={`tab ${activeTab === 'procurement' ? 'active' : ''}`} onClick={() => setActiveTab('procurement')}>
          <FiTrendingUp style={{ marginRight: '6px' }} /> {t('analytics.tabProcurement')}
        </div>
        <div className={`tab ${activeTab === 'queue' ? 'active' : ''}`} onClick={() => setActiveTab('queue')}>
          <FiClock style={{ marginRight: '6px' }} /> {t('analytics.tabQueue')}
        </div>
      </div>

      <div style={{ display: activeTab === 'farmer' ? 'block' : 'none' }}>
        <div className="grid-2">
          <ChartCard title={t('analytics.farmerReg')}>
            <div style={{ height: '300px' }}>
              <Line
                data={{
                  labels: analyticsData.farmerRegistrations.labels,
                  datasets: [{
                    label: t('analytics.lblRegistrations'),
                    data: analyticsData.farmerRegistrations.data,
                    borderColor: 'rgb(32, 122, 64)',
                    backgroundColor: 'rgba(32, 122, 64, 0.1)',
                    fill: true,
                  }],
                }}
                options={lineOptions}
              />
            </div>
          </ChartCard>
          <ChartCard title={t('analytics.villageDist')}>
            <div style={{ height: '300px' }}>
              <Bar
                data={{
                  labels: analyticsData.villageDistribution.labels,
                  datasets: [{
                    label: t('analytics.lblFarmers'),
                    data: analyticsData.villageDistribution.data,
                    backgroundColor: 'rgba(46, 155, 90, 0.8)',
                    borderRadius: 4,
                  }],
                }}
                options={barOptions}
              />
            </div>
          </ChartCard>
        </div>
      </div>

      <div style={{ display: activeTab === 'procurement' ? 'block' : 'none' }}>
        <div className="grid-2">
          <ChartCard title={t('analytics.dailyVol')}>
            <div style={{ height: '300px' }}>
              <Bar
                data={{
                  labels: analyticsData.dailyProcurements.labels,
                  datasets: [{
                    label: t('analytics.lblProcurementsCompleted'),
                    data: analyticsData.dailyProcurements.data,
                    backgroundColor: 'rgba(32, 122, 64, 0.8)',
                    borderRadius: 4,
                  }],
                }}
                options={barOptions}
              />
            </div>
          </ChartCard>
          <ChartCard title={t('analytics.cropDist')}>
            <div style={{ height: '300px' }}>
              <Doughnut
                data={{
                  labels: analyticsData.cropDistribution.labels,
                  datasets: [{
                    data: analyticsData.cropDistribution.data,
                    backgroundColor: ['#207A40', '#3A9A55', '#E0F0E0', '#D9A441', '#3B82F6', '#8B5CF6', '#F43F5E', '#14B8A6', '#64748B'],
                  }],
                }}
                options={doughnutOptions}
              />
            </div>
          </ChartCard>
        </div>
      </div>

      <div style={{ display: activeTab === 'queue' ? 'block' : 'none' }}>
        <div className="grid-2">
          <ChartCard title={t('analytics.avgWait')}>
            <div style={{ height: '300px' }}>
              <Line
                data={{
                  labels: analyticsData.avgWaitTimes.labels,
                  datasets: [{
                    label: t('analytics.lblWaitTime'),
                    data: analyticsData.avgWaitTimes.data,
                    borderColor: '#F97316',
                    backgroundColor: 'rgba(249, 115, 22, 0.1)',
                    fill: true,
                  }],
                }}
                options={lineOptions}
              />
            </div>
          </ChartCard>
          <ChartCard title={t('analytics.centreCap')}>
            <div style={{ height: '300px' }}>
              <Bar
                data={{
                  labels: analyticsData.centrePerformance.labels,
                  datasets: [{
                    label: t('analytics.lblUtilization'),
                    data: analyticsData.centrePerformance.utilization,
                    backgroundColor: 'rgba(32, 122, 64, 0.8)',
                    borderRadius: 4,
                  }],
                }}
                options={{ ...barOptions, scales: { y: { beginAtZero: true, max: 100 } } }}
              />
            </div>
          </ChartCard>
        </div>

        <div className="card" style={{ marginTop: '24px' }}>
          <div className="card-header">
            <h3 className="card-title">ML Diagnostics</h3>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px' }}>
            <div style={{ padding: '16px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', background: 'var(--white)' }}>
              <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>Regression readiness</div>
              <div style={{ fontWeight: 700, marginTop: '6px', color: regressionReady ? 'var(--krushi-green)' : '#D97706' }}>
                {regressionReady ? 'Ready' : 'Collecting labels'}
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginTop: '8px' }}>
                minimum: {mlDiagnostics.regressionMinimum ?? 5} labeled runs
              </div>
            </div>
            <div style={{ padding: '16px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', background: 'var(--white)' }}>
              <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>Recorded lifecycle samples</div>
              <div style={{ fontWeight: 700, marginTop: '6px' }}>{mlDiagnostics.recordedLifecycleSamples ?? mlDiagnostics.lifecycleSamples ?? 0}</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginTop: '8px' }}>
                completed tokens with real service duration
              </div>
            </div>
            <div style={{ padding: '16px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', background: 'var(--white)' }}>
              <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>Queue events captured</div>
              <div style={{ fontWeight: 700, marginTop: '6px' }}>{mlDiagnostics.queueEventCount ?? 0}</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginTop: '8px' }}>
                live history rows for training and audit
              </div>
            </div>
            <div style={{ padding: '16px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', background: 'var(--white)' }}>
              <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>Active ETA predictions</div>
              <div style={{ fontWeight: 700, marginTop: '6px' }}>{mlDiagnostics.activePredictionCount ?? 0}</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginTop: '8px' }}>
                current waiting or serving tokens
              </div>
            </div>
          </div>
          <div style={{ marginTop: '16px', padding: '14px 16px', borderRadius: 'var(--radius-md)', background: regressionReady ? 'rgba(32,122,64,0.08)' : 'rgba(217,119,6,0.08)', color: regressionReady ? 'var(--krushi-green)' : '#92400E', border: `1px solid ${regressionReady ? 'rgba(32,122,64,0.18)' : 'rgba(217,119,6,0.18)'}` }}>
            {regressionReady
              ? `RandomForest regression is active with ${mlDiagnostics.regressionSamples ?? 0} labeled runs${mlDiagnostics.trainR2 != null ? ` and train R² ${mlDiagnostics.trainR2}` : ''}.`
              : (fallbackReason || 'Regression model is waiting for more labeled lifecycle data; cluster ML and heuristic fallback remain active.')}
          </div>
          {clusterEntries.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginTop: '16px' }}>
              {clusterEntries.map(([clusterId, cluster]) => (
                <div key={clusterId} style={{ padding: '16px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', background: 'var(--krushi-lighter)' }}>
                  <div style={{ fontWeight: 700, color: 'var(--krushi-green)' }}>Cluster {clusterId}</div>
                  <div style={{ fontSize: '0.875rem', marginTop: '8px' }}>avg bookings: {cluster.bookings_avg}</div>
                  <div style={{ fontSize: '0.875rem', marginTop: '4px' }}>avg completed: {cluster.completed_avg}</div>
                  <div style={{ fontSize: '0.875rem', marginTop: '4px' }}>avg quantity: {cluster.avg_quantity_kg} kg</div>
                  <div style={{ fontSize: '0.875rem', marginTop: '4px' }}>completion rate: {cluster.completion_rate}</div>
                  <div style={{ fontSize: '0.875rem', marginTop: '4px' }}>base service: {cluster.base_service_minutes} min</div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card" style={{ marginTop: '24px' }}>
          <div className="card-header">
            <h3 className="card-title">{t('analytics.aiRecommendations')}</h3>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '16px' }}>
            {predictions.recommendedSlots.map((rec, idx) => (
              <div key={idx} style={{ padding: '16px', background: 'var(--krushi-lighter)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
                <div style={{ fontWeight: 600, color: 'var(--krushi-green)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <FiMapPin /> {rec.centre}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px', fontSize: '0.875rem' }}>
                  <FiCalendar /> {rec.date} | {rec.time}
                </div>
                <div style={{ marginTop: '12px' }}>
                  <span className="status-badge success">{t('analytics.predictedLoad')}: {rec.expectedLoad}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
