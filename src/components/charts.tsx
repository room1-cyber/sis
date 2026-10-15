import { useId } from 'react';

/* ---------------------------------------------------------------------------
 * Lightweight dependency-free SVG charts.
 * They are intentionally simple: a line/area trend chart, a bar chart and a
 * donut chart – enough for the dashboard and reports without pulling in a
 * charting library.
 * ------------------------------------------------------------------------- */

export const CHART_COLORS = [
  '#275d72',
  '#2f8ea4',
  '#4aacbe',
  '#83ccd7',
  '#f59e0b',
  '#8b5cf6',
  '#10b981',
  '#f43f5e',
  '#0ea5e9',
  '#64748b',
];

export interface ChartPoint {
  label: string;
  value: number;
  secondary?: number;
}

const VIEW_WIDTH = 640;

function niceMax(value: number): number {
  if (value <= 0) return 10;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalized = value / magnitude;
  const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return step * magnitude;
}

export function TrendChart({
  points,
  height = 240,
  formatValue = (value: number) => String(Math.round(value)),
  showSecondary = false,
  secondaryLabel,
  primaryLabel,
}: {
  points: ChartPoint[];
  height?: number;
  formatValue?: (value: number) => string;
  showSecondary?: boolean;
  secondaryLabel?: string;
  primaryLabel?: string;
}) {
  const gradientId = useId();
  const padding = { top: 16, right: 12, bottom: 26, left: 12 };
  const innerWidth = VIEW_WIDTH - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;
  const maxValue = niceMax(
    Math.max(...points.map((point) => Math.max(point.value, showSecondary ? point.secondary ?? 0 : 0)), 0),
  );
  const stepX = points.length > 1 ? innerWidth / (points.length - 1) : 0;

  const toXY = (value: number, index: number): [number, number] => [
    padding.left + index * stepX,
    padding.top + innerHeight - (value / maxValue) * innerHeight,
  ];

  const linePath = (pick: (point: ChartPoint) => number) =>
    points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${toXY(pick(point), index).join(' ')}`).join(' ');

  const areaPath = `${linePath((point) => point.value)} L ${
    padding.left + (points.length - 1) * stepX
  } ${padding.top + innerHeight} L ${padding.left} ${padding.top + innerHeight} Z`;

  const labelStep = Math.max(Math.ceil(points.length / 8), 1);

  return (
    <div className="w-full">
      {(primaryLabel || (showSecondary && secondaryLabel)) && (
        <div className="mb-2 flex flex-wrap items-center gap-4 text-xs font-semibold text-slate-500">
          {primaryLabel && (
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-brand-600" />
              {primaryLabel}
            </span>
          )}
          {showSecondary && secondaryLabel && (
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
              {secondaryLabel}
            </span>
          )}
        </div>
      )}
      <svg viewBox={`0 0 ${VIEW_WIDTH} ${height}`} className="h-auto w-full" role="img">
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#2f8ea4" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#2f8ea4" stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
          const y = padding.top + innerHeight * ratio;
          return (
            <g key={ratio}>
              <line
                x1={padding.left}
                x2={VIEW_WIDTH - padding.right}
                y1={y}
                y2={y}
                stroke="#e2e8f0"
                strokeDasharray={ratio === 1 ? '0' : '4 4'}
              />
              <text x={padding.left + 2} y={y - 3} fontSize="9" fill="#94a3b8">
                {formatValue(maxValue * (1 - ratio))}
              </text>
            </g>
          );
        })}

        <path d={areaPath} fill={`url(#${gradientId})`} />
        <path
          d={linePath((point) => point.value)}
          fill="none"
          stroke="#29728b"
          strokeWidth="2.5"
          strokeLinejoin="round"
        />
        {showSecondary && (
          <path
            d={linePath((point) => point.secondary ?? 0)}
            fill="none"
            stroke="#10b981"
            strokeWidth="2"
            strokeDasharray="5 4"
            strokeLinejoin="round"
          />
        )}

        {points.map((point, index) => {
          const [x, y] = toXY(point.value, index);
          return (
            <g key={`${point.label}-${index}`}>
              <circle cx={x} cy={y} r="3" fill="#ffffff" stroke="#29728b" strokeWidth="2">
                <title>{`${point.label}: ${formatValue(point.value)}`}</title>
              </circle>
              {index % labelStep === 0 && (
                <text x={x} y={height - 8} fontSize="9" fill="#94a3b8" textAnchor="middle">
                  {point.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export function BarChart({
  points,
  height = 220,
  formatValue = (value: number) => String(Math.round(value)),
  color = '#2f8ea4',
}: {
  points: ChartPoint[];
  height?: number;
  formatValue?: (value: number) => string;
  color?: string;
}) {
  const padding = { top: 16, right: 12, bottom: 26, left: 12 };
  const innerWidth = VIEW_WIDTH - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;
  const maxValue = niceMax(Math.max(...points.map((point) => point.value), 0));
  const slot = points.length > 0 ? innerWidth / points.length : innerWidth;
  const barWidth = Math.max(Math.min(slot * 0.6, 44), 4);
  const labelStep = Math.max(Math.ceil(points.length / 10), 1);

  return (
    <svg viewBox={`0 0 ${VIEW_WIDTH} ${height}`} className="h-auto w-full" role="img">
      {[0, 0.5, 1].map((ratio) => {
        const y = padding.top + innerHeight * ratio;
        return (
          <g key={ratio}>
            <line
              x1={padding.left}
              x2={VIEW_WIDTH - padding.right}
              y1={y}
              y2={y}
              stroke="#e2e8f0"
              strokeDasharray={ratio === 1 ? '0' : '4 4'}
            />
            <text x={padding.left + 2} y={y - 3} fontSize="9" fill="#94a3b8">
              {formatValue(maxValue * (1 - ratio))}
            </text>
          </g>
        );
      })}
      {points.map((point, index) => {
        const barHeight = maxValue > 0 ? (point.value / maxValue) * innerHeight : 0;
        const x = padding.left + index * slot + (slot - barWidth) / 2;
        const y = padding.top + innerHeight - barHeight;
        return (
          <g key={`${point.label}-${index}`}>
            <rect x={x} y={y} width={barWidth} height={Math.max(barHeight, 1)} rx="4" fill={color} opacity={0.9}>
              <title>{`${point.label}: ${formatValue(point.value)}`}</title>
            </rect>
            {index % labelStep === 0 && (
              <text x={x + barWidth / 2} y={height - 8} fontSize="9" fill="#94a3b8" textAnchor="middle">
                {point.label}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

export interface DonutSlice {
  label: string;
  value: number;
}

export function DonutChart({
  slices,
  size = 190,
  thickness = 26,
  formatValue = (value: number) => String(Math.round(value)),
  centerLabel,
}: {
  slices: DonutSlice[];
  size?: number;
  thickness?: number;
  formatValue?: (value: number) => string;
  centerLabel?: string;
}) {
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div className="flex flex-wrap items-center gap-5">
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} role="img" className="shrink-0">
        <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
          <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#eef2f6" strokeWidth={thickness} />
          {total > 0 &&
            slices.map((slice, index) => {
              const length = (slice.value / total) * circumference;
              const element = (
                <circle
                  key={slice.label}
                  cx={size / 2}
                  cy={size / 2}
                  r={radius}
                  fill="none"
                  stroke={CHART_COLORS[index % CHART_COLORS.length]}
                  strokeWidth={thickness}
                  strokeDasharray={`${length} ${circumference - length}`}
                  strokeDashoffset={-offset}
                  strokeLinecap="butt"
                >
                  <title>{`${slice.label}: ${formatValue(slice.value)}`}</title>
                </circle>
              );
              offset += length;
              return element;
            })}
        </g>
        <text x="50%" y="50%" textAnchor="middle" fontSize="14" fontWeight="700" fill="#0f172a">
          {centerLabel ?? formatValue(total)}
        </text>
      </svg>
      <ul className="min-w-[150px] flex-1 space-y-1.5">
        {slices.map((slice, index) => (
          <li key={slice.label} className="flex items-center justify-between gap-3 text-sm">
            <span className="flex items-center gap-2 text-slate-600">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }}
              />
              {slice.label}
            </span>
            <span className="font-bold tabular-nums text-slate-800">{formatValue(slice.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

