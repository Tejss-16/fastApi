import React, { useState } from 'react';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import FileInput from './components/FileInput';
import PromptInput from './components/PromptInput';
import AnalysisOutput from './components/AnalysisOutput';
import { Zap, Loader2, AlertCircle } from 'lucide-react';

function App() {
    const [file, setFile] = useState(null);
    const [prompt, setPrompt] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [analysisData, setAnalysisData] = useState(null);

    const handleAnalyze = async () => {
        if (!file) {
            alert('Please upload a file first!');
            return;
        }
        if (!prompt) {
            alert('Please enter an analysis prompt!');
            return;
        }

        setLoading(true);
        setError(null);
        setAnalysisData(null);

        const formData = new FormData();
        formData.append('file', file);
        formData.append('query', prompt);

        try {
            const isDev = import.meta.env.DEV;
            // const apiUrl = isDev ? '/api' : (import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000');
            const apiUrl = "http://127.0.0.1:8000";
            const response = await fetch(`${apiUrl}/generate-code`, {
                method: 'POST',
                body: formData,
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(errorText || `Server error: ${response.status}`);
            }

            const data = await response.json();
            console.log('Backend response:', JSON.stringify(data, null, 2));
            setAnalysisData(data);
        } catch (err) {
            setError(err.message || 'Failed to connect to the analysis engine');
            console.error('API Error:', err);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex min-h-screen bg-[#0b0f19] text-white">
            <Sidebar />
            <div className="flex-1 ml-[220px] flex flex-col min-h-screen">
                <Header />

                <main className="p-10 flex-1 flex flex-col">
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

                        {/* Analyze Button */}
                        <div className="flex justify-center mb-12">
                            <button
                                onClick={handleAnalyze}
                                disabled={loading}
                                className={`btn-gradient px-12 py-5 rounded-2xl font-black text-xl flex items-center gap-3 active:scale-95 group transition-all ${loading ? 'opacity-70 cursor-not-allowed grayscale' : 'hover:scale-105 shadow-glow'
                                    }`}
                            >
                                {loading ? (
                                    <Loader2 size={24} className="animate-spin" />
                                ) : (
                                    <Zap size={24} className="group-hover:fill-current transition-all" />
                                )}
                                {loading ? 'Analyzing Data...' : 'Execute Analysis'}
                            </button>
                        </div>

                        {/* Subtle separator */}
                        <div className="h-[1px] w-full bg-gradient-to-r from-transparent via-white/5 to-transparent mb-10"></div>

                        {/* Analysis Viewport Area */}
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
