import React, { useState, useRef, useCallback } from 'react';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import FileInput from './components/FileInput';
import PromptInput from './components/PromptInput';
import AnalysisOutput from './components/AnalysisOutput';
import { Zap, Loader2, AlertCircle, StopCircle } from 'lucide-react';

const API_URL = "http://127.0.0.1:8000";
const POLL_INTERVAL_MS = 1000;

function App() {
    const [file, setFile]               = useState(null);
    const [prompt, setPrompt]           = useState('');
    const [loading, setLoading]         = useState(false);
    const [isCancelling, setIsCancelling] = useState(false);  // ← inside component
    const [error, setError]             = useState(null);
    const [analysisData, setAnalysisData] = useState(null);

    // Holds the active task_id so the cancel handler can reference it without
    // a stale closure.
    const taskIdRef   = useRef(null);
    // Allows the polling loop to stop itself when the component unmounts or
    // when a new analysis is started before the old one finishes.
    const pollingRef  = useRef(false);

    // ── helpers ──────────────────────────────────────────────────────────────

    const stopPolling = () => { pollingRef.current = false; };

    const resetState = () => {
        setLoading(false);
        setIsCancelling(false);
        taskIdRef.current  = null;
        pollingRef.current = false;
    };

    // ── start analysis ───────────────────────────────────────────────────────

    const handleAnalyze = useCallback(async () => {
        if (!file) {
            alert('Please upload a file first!');
            return;
        }
        if (!prompt) {
            alert('Please enter an analysis prompt!');
            return;
        }

        // If there is an existing in-flight task, cancel it silently before
        // starting a new one.
        if (taskIdRef.current) {
            await fetch(`${API_URL}/cancel/${taskIdRef.current}`, { method: 'POST' }).catch(() => {});
        }

        stopPolling();
        setIsCancelling(false);
        setLoading(true);
        setError(null);
        setAnalysisData(null);

        const formData = new FormData();
        formData.append('file', file);
        formData.append('query', prompt);

        try {
            // ── 1. kick off analysis, get task_id ────────────────────────────
            const startRes = await fetch(`${API_URL}/start-analysis`, {
                method: 'POST',
                body: formData,
            });

            if (!startRes.ok) {
                const text = await startRes.text();
                throw new Error(text || `Server error: ${startRes.status}`);
            }

            const { task_id } = await startRes.json();
            taskIdRef.current  = task_id;
            pollingRef.current = true;

            // ── 2. poll until done / cancelled / error ───────────────────────
            while (pollingRef.current) {
                await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));

                // If the user cancelled while we were sleeping, stop here —
                // the cancel request has already been sent by handleCancel.
                if (!pollingRef.current) break;

                const statusRes = await fetch(`${API_URL}/status/${task_id}`);

                if (!statusRes.ok) {
                    throw new Error(`Status check failed: ${statusRes.status}`);
                }

                const result = await statusRes.json();

                if (result.status === 'completed') {
                    console.log('Backend response:', JSON.stringify(result.data, null, 2));
                    setAnalysisData(result.data);
                    break;
                }

                if (result.status === 'cancelled') {
                    // User requested cancel — no error, just stop loading.
                    break;
                }

                if (result.status === 'error') {
                    throw new Error(result.error || 'Analysis failed on the server');
                }

                // status === 'running' → keep polling
            }

        } catch (err) {
            // pollingRef.current is false if the user cancelled (stopPolling was
            // called) — in that case swallow the error silently.
            if (pollingRef.current) {
                setError(err.message || 'Failed to connect to the analysis engine');
                console.error('API Error:', err);
            }
        } finally {
            resetState();
        }
    }, [file, prompt]);

    // ── cancel ───────────────────────────────────────────────────────────────

    const handleCancel = useCallback(() => {

        const taskId = taskIdRef.current;
        if (!taskId) return;

         setIsCancelling(true); 

        // // ── UI: stop immediately, don't wait for backend ─────────────────────
        // // The LLM HTTP request cannot be interrupted anyway. Adopt the
        // // ChatGPT model: hide the loading state right now, ignore whatever
        // // the backend eventually produces for this task_id.
        stopPolling();   // stop the poll loop — we don't care about the result
        // setLoading(false);

        // // clear refs manually (NOT resetState)
        // taskIdRef.current = null;
        // pollingRef.current = false;
        // resetState();   // loading → false, taskId → null

        // // ── Backend: fire-and-forget cancel request ───────────────────────────
        // // This sets the cooperative flag so the pipeline aborts after the LLM
        // // returns and doesn't write 'completed' to the result store.
        // // We don't await it — the user already sees a clean UI.
        fetch(`${API_URL}/cancel/${taskId}`, { method: 'POST' }).catch(() => {});
    }, []);

    // ── render ───────────────────────────────────────────────────────────────

    return (
        <div className="flex min-h-screen bg-[#0b0f19] text-white">
            <Sidebar />
            <div className="flex-1 ml-[220px] flex flex-col min-h-screen">
                <Header />

                <main className="p-6 flex-1 flex flex-col">
                    <div className="max-w-6xl mx-auto w-full flex-1 flex flex-col">

                        {/* Inputs Grid */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-10 items-stretch">
                            <FileInput file={file} setFile={setFile} />
                            <PromptInput prompt={prompt} setPrompt={setPrompt} />
                        </div>

                        {/* Error Message */}
                        {error && (
                            <div className="mb-8 p-4 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-center gap-3 text-red-400 animate-in fade-in slide-in-from-top-4">
                                <AlertCircle size={20} />
                                <p className="font-medium">{error}</p>
                            </div>
                        )}

                        {/* Action Buttons */}
                        <div className="flex justify-center gap-4 mb-12">
                            {/* ── Execute / Analyzing button ── */}
                            <button
                                onClick={handleAnalyze}
                                disabled={loading}
                                className={`btn-gradient px-12 py-5 rounded-2xl font-black text-xl flex items-center gap-3 active:scale-95 group transition-all ${
                                    loading
                                        ? 'opacity-70 cursor-not-allowed grayscale'
                                        : 'hover:scale-105 shadow-glow'
                                }`}
                            >
                                {loading ? (
                                    <Loader2 size={24} className="animate-spin" />
                                ) : (
                                    <Zap size={24} className="group-hover:fill-current transition-all" />
                                )}
                                {loading ? 'Analyzing Data...' : 'Execute Analysis'}
                            </button>

                            {/* ── Stop button — only visible while a task is running ── */}
                            {(loading || isCancelling)&& (
                                <button
                                    onClick={handleCancel}
                                    disabled={isCancelling} 
                                    className="px-8 py-5 rounded-2xl font-black text-xl flex items-center gap-3 bg-red-600/20 border border-red-500/40 text-red-400 hover:bg-red-600/30 hover:scale-105 active:scale-95 transition-all"
                                >
                                    {isCancelling ? "Stopping..." : "Stop"}
                                </button>
                            )}
                        </div>

                        {/* Subtle separator */}
                        <div className="h-[1px] w-full bg-gradient-to-r from-transparent via-white/5 to-transparent mb-10" />

                        {/* Analysis Viewport */}
                        <div className="flex-1 rounded-[2rem] border border-white/5 bg-white/[0.02] overflow-hidden min-h-[400px]">
                            <AnalysisOutput data={analysisData} loading={loading} />
                        </div>

                    </div>
                </main>
            </div>
        </div>
    );
}

export default App;