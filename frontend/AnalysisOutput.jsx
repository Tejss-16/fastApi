import React, { useState, Component } from 'react';
import Plot from 'react-plotly.js';
import { TrendingUp, Copy, Check, FileJson } from 'lucide-react';

// ─────────────────────────────────────────────
// 1. THEME  (single source of truth for colors)
// ─────────────────────────────────────────────

const THEME = {
  colors: {
    line:      '#22C55E',
    bar:       '#6366F1',
    scatter:   '#A855F7',
    pie:       ['#6366F1', '#22C55E', '#F59E0B', '#EC4899', '#14B8A6', '#F97316'],
    histogram: '#38BDF8',
    series:    ['#6366F1', '#22C55E', '#F59E0B', '#EC4899', '#14B8A6', '#F97316'],
  },
  bg: {
    paper: '#111827',
    plot:  '#111827',
  },
  font: {
    color: '#F9FAFB',
    size:  { title: 16, axis: 12 },
  },
};

// ─────────────────────────────────────────────
// 2. LAYOUT SIZE → dimensions
// ─────────────────────────────────────────────

const SIZE_MAP = {
  small:  { gridSpan: 'lg:col-span-1', height: 280, aspect: null },
  medium: { gridSpan: 'lg:col-span-1', height: 320, aspect: null },
  large:  { gridSpan: 'lg:col-span-2', height: 420, aspect: null },
};

function getSize(size) {
  return SIZE_MAP[size] ?? SIZE_MAP.medium;
}

// ─────────────────────────────────────────────
// 3. CHART VALIDATION  (strict, not just truthy checks)
// ─────────────────────────────────────────────

function validateChart(chart) {
  if (!chart || typeof chart !== 'object') return 'Chart is null or not an object';
  if (!chart.type || typeof chart.type !== 'string') return 'Missing or invalid chart.type';

  const type = chart.type;

  if (type === 'histogram') {
    const vals = chart.values ?? chart.x;
    if (!Array.isArray(vals) || vals.length === 0) return 'histogram: values/x is empty or not an array';
    return null;
  }

  if (['line', 'scatter', 'bar', 'pie'].includes(type)) {
    if (chart.series !== undefined) {
      if (!Array.isArray(chart.series) || chart.series.length === 0)
        return `${type}: series must be a non-empty array`;
      for (const [i, s] of chart.series.entries()) {
        if (!Array.isArray(s.x) || !Array.isArray(s.y))
          return `${type}: series[${i}] missing x or y array`;
        if (s.x.length === 0 || s.y.length === 0)
          return `${type}: series[${i}] x or y is empty`;
        if (s.x.length !== s.y.length)
          return `${type}: series[${i}] x/y length mismatch (${s.x.length} vs ${s.y.length})`;
      }
      return null;
    }

    if (!Array.isArray(chart.x) || chart.x.length === 0) return `${type}: x is missing or empty`;
    if (!Array.isArray(chart.y) || chart.y.length === 0) return `${type}: y is missing or empty`;
    if (chart.x.length !== chart.y.length)
      return `${type}: x/y length mismatch (${chart.x.length} vs ${chart.y.length})`;
    return null;
  }

  return `Unsupported chart type: "${type}"`;
}

// ─────────────────────────────────────────────
// 4. ERROR BOUNDARY  (Plotly crash isolation)
// ─────────────────────────────────────────────

class ChartErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(err) {
    return { hasError: true, message: err?.message ?? 'Unknown render error' };
  }

  componentDidCatch(err, info) {
    console.error('[ChartErrorBoundary]', err, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-full min-h-[160px] rounded-xl border border-red-500/30 bg-red-950/20 text-red-400 p-4 text-sm gap-2">
          <span className="font-semibold">Chart failed to render</span>
          <span className="text-red-500/70 text-xs font-mono">{this.state.message}</span>
        </div>
      );
    }
    return this.props.children;
  }
}

// ─────────────────────────────────────────────
// 5. CHART SKELETON  (per-chart loading state)
// ─────────────────────────────────────────────

function ChartSkeleton({ height }) {
  return (
    <div
      className="rounded-xl bg-white/5 animate-pulse flex items-end gap-2 px-6 pb-6 pt-4"
      style={{ height }}
    >
      {[45, 70, 55, 80, 60, 40, 75, 50].map((h, i) => (
        <div
          key={i}
          className="flex-1 rounded-sm bg-white/10"
          style={{ height: `${h}%` }}
        />
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────
// 6. SCORECARD ROW  (deterministic KPIs, rendered first)
// ─────────────────────────────────────────────

const SCORECARD_ACCENTS = ['#6366F1', '#22C55E', '#F59E0B', '#EC4899', '#14B8A6'];

function ScorecardRow({ scorecards }) {
  if (!Array.isArray(scorecards) || scorecards.length === 0) return null;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
      {scorecards.map((card, i) => (
        <div
          key={i}
          className="rounded-xl bg-[#111827] border border-white/10 px-4 py-4 flex flex-col gap-1 shadow"
          style={{ borderTop: `3px solid ${SCORECARD_ACCENTS[i % SCORECARD_ACCENTS.length]}` }}
        >
          <span className="text-xs text-slate-400 truncate">{card.label}</span>
          <span className="text-2xl font-bold text-white tracking-tight">{card.value}</span>
          <span className="text-[10px] text-slate-500 uppercase tracking-wider">{card.aggregation}</span>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────
// 7. CHART RENDERER
// ─────────────────────────────────────────────

function buildCommonLayout(chart, height) {
  return {
    height,
    autosize: true,
    title: {
      text: chart.title ?? '',
      font: { size: THEME.font.size.title, color: THEME.font.color },
      x: 0.5,
      xanchor: 'center',
    },
    xaxis: {
      title: { text: chart.x_label ?? '', font: { size: THEME.font.size.axis, color: THEME.font.color } },
      tickfont: { color: THEME.font.color },
      gridcolor: 'rgba(255,255,255,0.06)',
    },
    yaxis: {
      title: { text: chart.y_label ?? '', font: { size: THEME.font.size.axis, color: THEME.font.color } },
      tickfont: { color: THEME.font.color },
      gridcolor: 'rgba(255,255,255,0.06)',
    },
    dragmode: false,
    paper_bgcolor: THEME.bg.paper,
    plot_bgcolor: THEME.bg.plot,
    font: { color: THEME.font.color },
    margin: { t: 48, b: 48, l: 56, r: 24 },
    legend: { font: { color: THEME.font.color } },
  };
}

const PLOTLY_CONFIG = {
  responsive: true,
  displayModeBar: false,
  scrollZoom: false,
  doubleClick: false,
  staticPlot: false,
};

function renderChart(chart, height) {
  const type = chart.type;
  const layout = buildCommonLayout(chart, height);
  const hasLongLabels = Array.isArray(chart.x) && chart.x.some((l) => l && String(l).length > 12);

  switch (type) {
    case 'line': {
      const traces = chart.series
        ? chart.series.map((s, i) => ({
            x: s.x, y: s.y, type: 'scatter', mode: 'lines+markers',
            name: s.name,
            line: { width: 2.5, color: THEME.colors.series[i % THEME.colors.series.length] },
          }))
        : [{ x: chart.x, y: chart.y, type: 'scatter', mode: 'lines+markers',
             line: { width: 3, color: THEME.colors.line } }];
      return <Plot data={traces} layout={layout} config={PLOTLY_CONFIG} style={{ width: '100%' }} />;
    }

    case 'bar': {
      const isH = hasLongLabels;
      const traces = chart.series
        ? chart.series.map((s, i) => ({
            x: isH ? s.y : s.x,
            y: isH ? s.x : s.y,
            type: 'bar', name: s.name,
            orientation: isH ? 'h' : 'v',
            marker: { color: THEME.colors.series[i % THEME.colors.series.length] },
          }))
        : [{
            x: isH ? chart.y : chart.x,
            y: isH ? chart.x : chart.y,
            type: 'bar',
            orientation: isH ? 'h' : 'v',
            marker: { color: THEME.colors.bar },
          }];
      return (
        <Plot
          data={traces}
          layout={{
            ...layout,
            barmode: 'group',
            margin: { ...layout.margin, l: isH ? 140 : 56 },
          }}
          config={PLOTLY_CONFIG}
          style={{ width: '100%' }}
        />
      );
    }

    case 'scatter':
      return (
        <Plot
          data={[{ x: chart.x, y: chart.y, type: 'scatter', mode: 'markers',
                   marker: { size: 8, color: THEME.colors.scatter } }]}
          layout={layout}
          config={PLOTLY_CONFIG}
          style={{ width: '100%' }}
        />
      );

    case 'pie':
      return (
        <Plot
          data={[{ labels: chart.x, values: chart.y, type: 'pie', hole: 0.45,
                   marker: { colors: THEME.colors.pie } }]}
          layout={layout}
          config={PLOTLY_CONFIG}
          style={{ width: '100%' }}
        />
      );

    case 'histogram': {
      const vals = chart.values ?? chart.x;
      return (
        <Plot
          data={[{ x: vals, type: 'histogram', nbinsx: 20,
                   marker: { color: THEME.colors.histogram } }]}
          layout={{
            ...layout,
            xaxis: { ...layout.xaxis, title: { text: chart.x_label ?? 'Value',
                       font: { size: THEME.font.size.axis, color: THEME.font.color } } },
            yaxis: { ...layout.yaxis, title: { text: 'Frequency',
                       font: { size: THEME.font.size.axis, color: THEME.font.color } } },
          }}
          config={PLOTLY_CONFIG}
          style={{ width: '100%' }}
        />
      );
    }

    default:
      return <div className="text-yellow-400 text-sm p-4">Unsupported chart type: {type}</div>;
  }
}

// ─────────────────────────────────────────────
// 8. CHART CARD  (validation + skeleton + error boundary)
// ─────────────────────────────────────────────

function ChartCard({ chart, loading }) {
  const { gridSpan, height } = getSize(chart?.layout_size);

  if (loading) {
    return (
      <div className={`${gridSpan}`}>
        <ChartSkeleton height={height} />
      </div>
    );
  }

  const validationError = validateChart(chart);
  if (validationError) {
    return (
      <div className={`${gridSpan} flex items-center justify-center rounded-xl border border-yellow-500/20 bg-yellow-950/10 text-yellow-400 text-xs p-4 min-h-[160px]`}>
        <span>⚠ {validationError}</span>
      </div>
    );
  }

  return (
    <div className={`${gridSpan} bg-transparent`}>
      <ChartErrorBoundary>
        {renderChart(chart, height)}
      </ChartErrorBoundary>
    </div>
  );
}

// ─────────────────────────────────────────────
// 9. MAIN COMPONENT
// ─────────────────────────────────────────────

const AnalysisOutput = ({ data, loading }) => {
  const [copied, setCopied] = useState(false);

  const hasScorecards = Array.isArray(data?.scorecards) && data.scorecards.length > 0;
  const hasCharts     = Array.isArray(data?.charts)     && data.charts.length > 0;
  const hasText       = data?.type === 'text'            && !!data?.content;
  const hasCode       = !!data?.generated_code;
  const hasTables     = Array.isArray(data?.tables)     && data.tables.length > 0;

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadCSV = (rows, filename = 'table.csv') => {
    if (!rows?.length) return;
    const headers = Object.keys(rows[0]);
    const csv = [
      headers.join(','),
      ...rows.map((r) => headers.map((h) => `"${r[h] ?? ''}"`).join(',')),
    ].join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: filename });
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // ── Loading ──────────────────────────────────
  if (loading && !hasCharts) {
    return (
      <div className="flex flex-col items-center justify-center p-20 animate-pulse text-slate-500">
        <TrendingUp size={60} className="animate-bounce mb-6" />
        <h3 className="text-xl text-white font-bold">Analyzing your dataset...</h3>
        <p className="text-slate-400">Generating interactive charts</p>
      </div>
    );
  }

  // ── Empty ────────────────────────────────────
  if (!data && !loading) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center p-10">
        <h3 className="text-lg text-slate-400 mb-2">No Analysis Yet</h3>
        <p className="text-slate-500 text-sm">Upload a file and enter a prompt to generate charts</p>
      </div>
    );
  }

  return (
    <div className="h-full p-4 overflow-y-auto">

      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-bold text-white">Analysis Output</h2>
        {hasCode && (
          <button
            onClick={() => copyToClipboard(data.generated_code)}
            className="flex items-center gap-2 px-3 py-2 bg-white/5 hover:bg-white/10 rounded-lg text-sm transition"
          >
            {copied ? <Check size={16} /> : <Copy size={16} />}
            {copied ? 'Copied' : 'Copy Code'}
          </button>
        )}
      </div>

      {/* Scorecards — always first, before charts and tables */}
      {hasScorecards && <ScorecardRow scorecards={data.scorecards} />}

      {/* Charts */}
      {(hasCharts || loading) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {(data?.charts ?? []).map((chart, i) => (
            <ChartCard key={i} chart={chart} loading={loading} />
          ))}
        </div>
      )}

      {/* Tables */}
      {hasTables && (
        <div className="mt-8 space-y-6">
          {data.tables.map((table, i) => (
            <div key={i} className="bg-[#111827] rounded-2xl p-4 border border-white/10 shadow-lg">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-white font-semibold">{table.title || 'Table'}</h3>
                <button
                  onClick={() => downloadCSV(table.data, `${table.title || 'table'}.csv`)}
                  className="text-xs px-3 py-1 bg-white/10 hover:bg-white/20 rounded-lg transition"
                >
                  CSV ⬇️
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full text-sm text-white">
                  <thead>
                    <tr>
                      {Object.keys(table.data[0] || {}).map((col, j) => (
                        <th key={j} className="px-3 py-2 text-left border-b border-white/10 text-slate-300">
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {table.data.map((row, rIdx) => (
                      <tr key={rIdx} className="hover:bg-white/5 transition">
                        {Object.values(row).map((val, cIdx) => (
                          <td key={cIdx} className="px-3 py-2 border-b border-white/5">
                            {typeof val === 'number' ? val.toLocaleString() : val}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Text */}
      {!hasCharts && hasText && (
        <div className="bg-[#1a2333]/40 rounded-xl p-6 text-slate-300 whitespace-pre-wrap">
          {data.content}
        </div>
      )}

      {/* Code */}
      {!hasCharts && !hasText && hasCode && (
        <div className="bg-black/70 rounded-xl p-4 text-sm text-blue-400 font-mono whitespace-pre-wrap">
          {data.generated_code}
        </div>
      )}

      {/* Fallback — scorecards alone count as valid output */}
      {!hasScorecards && !hasCharts && !hasTables && !hasText && !hasCode && (
        <div className="flex flex-col items-center justify-center p-10 text-slate-500">
          <FileJson size={40} className="mb-3" />
          <p>No valid output to display</p>
        </div>
      )}
    </div>
  );
};

export default AnalysisOutput;