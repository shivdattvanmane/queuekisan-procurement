import React from 'react';

export function Skeleton({ className = '', style = {}, width, height, circle }) {
  return (
    <div
      className={`skeleton ${className}`}
      style={{
        width: width || '100%',
        height: height || '16px',
        borderRadius: circle ? '50%' : undefined,
        ...style,
      }}
    />
  );
}

export function KPISkeleton() {
  return (
    <div className="kpi-card skeleton-kpi" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Skeleton width="40px" height="40px" circle />
        <Skeleton width="45px" height="18px" />
      </div>
      <div>
        <Skeleton width="40%" height="12px" style={{ marginBottom: '8px' }} />
        <Skeleton width="60%" height="24px" />
      </div>
    </div>
  );
}

export function TableSkeleton({ rows = 5, cols = 4 }) {
  return (
    <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} style={{ display: 'flex', gap: '16px' }}>
          {Array.from({ length: cols }).map((_, j) => (
            <Skeleton key={j} height="28px" style={{ flex: 1 }} />
          ))}
        </div>
      ))}
    </div>
  );
}
