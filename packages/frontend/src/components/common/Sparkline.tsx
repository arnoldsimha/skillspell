import React, { useMemo } from 'react';

export interface SparklineProps {
  /** Data points to plot. */
  data: number[];
  /** Width of the SVG in pixels. Default: 200. */
  width?: number;
  /** Height of the SVG in pixels. Default: 48. */
  height?: number;
  /** Stroke color. If not provided, auto-selects green (improving) or red (declining). */
  color?: string;
  /** Opacity of the area fill below the line. Default: 0.15. */
  fillOpacity?: number;
  /** Show dots on each data point. Default: true. */
  showDots?: boolean;
  /** Labels for each data point (shown on hover). */
  labels?: string[];
  /** Format function for tooltip values. Default: (v) => v.toFixed(1). */
  formatValue?: (value: number) => string;
  /** Minimum Y value for the scale. Default: auto from data. */
  minY?: number;
  /** Maximum Y value for the scale. Default: auto from data. */
  maxY?: number;
}

/**
 * Lightweight SVG sparkline chart with CSS-only tooltips.
 * No external chart library — pure inline SVG.
 *
 * Performance: Wrapped in React.memo with stable data arrays.
 * Tooltips use data-* attributes + CSS ::after to avoid React state on hover.
 */
export const Sparkline = React.memo(function Sparkline({
  data,
  width = 200,
  height = 48,
  color,
  fillOpacity = 0.15,
  showDots = true,
  labels,
  formatValue = (v) => v.toFixed(1),
  minY: minYProp,
  maxY: maxYProp,
}: SparklineProps) {
  // Compute layout
  const padding = { top: 4, right: 8, bottom: 4, left: 8 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  const { points, polylinePoints, areaPoints, trend, autoColor } = useMemo(() => {
    if (data.length === 0) return { points: [], polylinePoints: '', areaPoints: '', trend: 'flat' as const, autoColor: '#94a3b8' };

    const minVal = minYProp ?? Math.min(...data);
    const maxVal = maxYProp ?? Math.max(...data);
    const range = maxVal - minVal || 1;

    const pts = data.map((value, i) => {
      const x = padding.left + (data.length > 1 ? (i / (data.length - 1)) * chartWidth : chartWidth / 2);
      const y = padding.top + chartHeight - ((value - minVal) / range) * chartHeight;
      return { x, y, value, index: i };
    });

    const polyline = pts.map((p) => `${p.x},${p.y}`).join(' ');

    // Area fill: polyline + bottom-right + bottom-left
    const area = polyline + ` ${pts[pts.length - 1].x},${padding.top + chartHeight} ${pts[0].x},${padding.top + chartHeight}`;

    // Determine trend
    const first = data[0];
    const last = data[data.length - 1];
    const t = last > first + 0.5 ? 'up' as const : last < first - 0.5 ? 'down' as const : 'flat' as const;

    // Auto color: green for up, red for down, slate for flat
    const ac = t === 'up' ? '#10b981' : t === 'down' ? '#ef4444' : '#94a3b8';

    return { points: pts, polylinePoints: polyline, areaPoints: area, trend: t, autoColor: ac };
  }, [data, chartWidth, chartHeight, padding.left, padding.top, minYProp, maxYProp]);

  const strokeColor = color || autoColor;
  const isLastPoint = (i: number) => i === data.length - 1;

  if (data.length < 2) {
    return (
      <svg width={width} height={height} className="opacity-50">
        <text x={width / 2} y={height / 2} textAnchor="middle" dominantBaseline="middle" className="fill-slate-400 text-[10px]">
          —
        </text>
      </svg>
    );
  }

  return (
    <svg
      width={width}
      height={height}
      className="sparkline-chart"
      role="img"
      aria-label={`Sparkline chart showing ${data.length} data points. Trend: ${trend === 'up' ? 'improving' : trend === 'down' ? 'declining' : 'stable'}`}
    >
      {/* Area fill */}
      <polygon
        points={areaPoints}
        fill={strokeColor}
        opacity={fillOpacity}
      />

      {/* Line */}
      <polyline
        points={polylinePoints}
        fill="none"
        stroke={strokeColor}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Dots and invisible hit areas for tooltips */}
      {showDots && points.map((pt) => (
        <g key={pt.index} className="sparkline-dot-group">
          {/* Invisible hit area for hover */}
          <rect
            x={pt.x - 12}
            y={0}
            width={24}
            height={height}
            fill="transparent"
            className="sparkline-hit-area"
            data-tooltip={`${labels?.[pt.index] ? labels[pt.index] + ': ' : ''}${formatValue(pt.value)}`}
          />
          {/* Visible dot */}
          <circle
            cx={pt.x}
            cy={pt.y}
            r={isLastPoint(pt.index) ? 3 : 2}
            fill={strokeColor}
            stroke="white"
            strokeWidth={1.5}
            className="sparkline-dot"
          />
        </g>
      ))}

      <style>{`
        .sparkline-chart .sparkline-dot { opacity: 0.7; transition: opacity 0.15s, r 0.15s; }
        .sparkline-chart .sparkline-dot-group:hover .sparkline-dot { opacity: 1; r: 3.5; }
        .sparkline-chart .sparkline-hit-area { cursor: default; }
        .sparkline-chart .sparkline-dot-group { position: relative; }
        .sparkline-chart .sparkline-dot-group:hover .sparkline-hit-area + circle { r: 4; }
      `}</style>
    </svg>
  );
});

/**
 * Inline wrapper that shows a sparkline with label and legend.
 * Used in the benchmark iteration history section.
 */
export const SparklineWithLabel = React.memo(function SparklineWithLabel({
  label,
  data,
  labels,
  formatValue,
  color,
  minY,
  maxY,
}: {
  label: string;
  data: number[];
  labels?: string[];
  formatValue?: (v: number) => string;
  color?: string;
  minY?: number;
  maxY?: number;
}) {
  if (data.length < 2) return null;

  const first = data[0];
  const last = data[data.length - 1];
  const delta = last - first;
  const improving = delta > 0.5;
  const declining = delta < -0.5;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{label}</span>
        <span className={`text-[10px] font-semibold font-mono ${
          improving ? 'text-emerald-600' : declining ? 'text-red-600' : 'text-slate-500'
        }`}>
          {improving ? '↑' : declining ? '↓' : '→'} {delta > 0 ? '+' : ''}{(formatValue ?? ((v) => v.toFixed(1)))(delta)}
        </span>
      </div>
      <div className="relative group">
        <Sparkline
          data={data}
          width={280}
          height={40}
          labels={labels}
          formatValue={formatValue}
          color={color}
          minY={minY}
          maxY={maxY}
          showDots
        />
        {/* CSS-only tooltip container — uses title attributes on hit areas */}
      </div>
    </div>
  );
});
