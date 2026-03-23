import React, { useState } from 'react';
import Plot from "react-plotly.js";
import { TrendingUp, Copy, Check, FileJson } from 'lucide-react';

const AnalysisOutput = ({ data, loading }) => {
    const [copied, setCopied] = useState(false);

    const hasCharts = data?.charts && Array.isArray(data.charts) && data.charts.length > 0;
    const hasText = data?.type === 'text' && data?.content;
    const hasCode = data?.generated_code;
    const hasTables = data?.tables && Array.isArray(data.tables) && data.tables.length > 0;
    const copyToClipboard = (text) => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };
    
    const downloadCSV = (data, filename = "table.csv") => {
    if (!data || data.length === 0) return;

    const headers = Object.keys(data[0]);

    const csvRows = [
        headers.join(","), // header row
        ...data.map(row =>
            headers.map(field => `"${row[field] ?? ""}"`).join(",")
        )
    ];

    const csvContent = csvRows.join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    };

    // ===== LOADING =====
    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center p-20 animate-pulse text-slate-500">
                <div className="mb-6">
                    <TrendingUp size={60} className="animate-bounce" />
                </div>
                <h3 className="text-xl text-white font-bold">Analyzing your dataset...</h3>
                <p className="text-slate-400">Generating interactive charts</p>
            </div>
        );
    }

    // ===== EMPTY =====
    if (!data) {
        return (
            <div className="h-full flex flex-col items-center justify-center text-center p-10">
                <h3 className="text-lg text-slate-400 mb-2">No Analysis Yet</h3>
                <p className="text-slate-500 text-sm">
                    Upload file and enter prompt to generate charts
                </p>
            </div>
        );
    }

    return (
        <div className="h-full p-6 overflow-y-auto">

            {/* ===== HEADER ===== */}
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold text-white">Analysis Output</h2>

                {hasCode && (
                    <button
                        onClick={() => copyToClipboard(hasCode)}
                        className="flex items-center gap-2 px-3 py-2 bg-white/5 hover:bg-white/10 rounded-lg text-sm"
                    >
                        {copied ? <Check size={16} /> : <Copy size={16} />}
                        {copied ? 'Copied' : 'Copy Code'}
                    </button>
                )}
            </div>

            {/* ===== CHARTS ===== */}
            {hasCharts && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {data.charts.map((chart, index) => (
                        <div
                            key={index}
                            className="bg-transparent p-0" >
                            <Plot
                                data={chart.data}
                                layout={{
                                    ...chart.layout,
                                    autosize: true
                                }}
                                config={{ responsive: true,
                                     displayModeBar: false}}
                                style={{ width: "100%", height: "100%" }}
                            />
                        </div>
                    ))}
                </div>
            )}

            {/* ===== TABLES ===== */}
            {hasTables && (
                <div className="mt-8 space-y-6">
                    {data.tables.map((table, index) => (
                        <div
                            key={index}
                            className="bg-[#111827] rounded-2xl p-4 border border-white/10 shadow-lg"
                        >
                            <h3 className="text-white font-semibold mb-3">
                                {table.title || "Table"}
                            </h3>
                            <button onClick={() =>
                                    downloadCSV(
                                        table.data,
                                        `${table.title || "table"}.csv`
                                    )
                                }
                                className="text-xs px-3 py-1 bg-white/10 hover:bg-white/20 rounded-lg">
                                CSV ⬇️
                            </button>

                            <div className="overflow-x-auto">
                                <table className="min-w-full text-sm text-white">
                                    <thead>
                                        <tr>
                                            {Object.keys(table.data[0] || {}).map((col, i) => (
                                                <th
                                                    key={i}
                                                    className="px-3 py-2 text-left border-b border-white/10 text-slate-300"
                                                >
                                                    {col}
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>

                                    <tbody>
                                        {table.data.map((row, rIdx) => (
                                            <tr
                                                key={rIdx}
                                                className="hover:bg-white/5 transition"
                                            >
                                                {Object.values(row).map((val, cIdx) => (
                                                    <td
                                                        key={cIdx}
                                                        className="px-3 py-2 border-b border-white/5"
                                                    >
                                                        {typeof val === "number"
                                                            ? val.toLocaleString()
                                                            : val}
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


            {/* ===== TEXT ===== */}
            {!hasCharts && hasText && (
                <div className="bg-[#1a2333]/40 rounded-xl p-6 text-slate-300 whitespace-pre-wrap">
                    {data.content}
                </div>
            )}

            {/* ===== CODE ===== */}
            {!hasCharts && !hasText && hasCode && (
                <div className="bg-black/70 rounded-xl p-4 text-sm text-blue-400 font-mono whitespace-pre-wrap">
                    {hasCode}
                </div>
            )}

            {/* ===== FALLBACK ===== */}
            {!hasCharts && !hasTables && !hasText && !hasCode && (
                <div className="flex flex-col items-center justify-center p-10 text-slate-500">
                    <FileJson size={40} className="mb-3" />
                    <p>No valid output to display</p>
                </div>
            )}
        </div>
    );
};

export default AnalysisOutput;