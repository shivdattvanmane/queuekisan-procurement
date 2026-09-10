export default function KPICard({ icon, iconColor = 'green', label, value, trend, trendDirection }) {
  return (
    <div className="kpi-card">
      <div className={`kpi-icon ${iconColor}`}>
        {icon}
      </div>
      <div className="kpi-content">
        <div className="kpi-label">{label}</div>
        <div className="kpi-value">{value}</div>
        {trend && (
          <div className={`kpi-trend ${trendDirection || 'up'}`}>
            {trendDirection === 'down' ? '↓' : '↑'} {trend}
          </div>
        )}
      </div>
    </div>
  );
}
