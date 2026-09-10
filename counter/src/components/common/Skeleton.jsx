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

export function CounterCardSkeleton({ count = 3 }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(240px, 1fr))`, gap: '16px' }}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="skeleton-card" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <Skeleton width="40%" height="14px" />
          <Skeleton width="60%" height="28px" />
          <Skeleton width="80%" height="12px" />
        </div>
      ))}
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
