import { useState, useEffect } from 'react';

interface PolicyList {
    [key: string]: {
        proprietary: string[];
        standard: string[];
    };
}

export default function App() {
    const [policyCatalog, setPolicyCatalog] = useState<PolicyList>({});
    const [selectedType, setSelectedType] = useState<string>('IAPL');
    const [selectedProprietary, setSelectedProprietary] = useState<string>('');
    const [selectedStandard, setSelectedStandard] = useState<string>('');

    // Tab State
    const [activeTab, setActiveTab] = useState<'mock' | 'custom'>('mock');

    // Content State
    const [proprietaryContent, setProprietaryContent] = useState<string>('');
    const [standardContent, setStandardContent] = useState<string>('');
    const [customProprietary, setCustomProprietary] = useState<string>('');
    const [customStandard, setCustomStandard] = useState<string>('');

    const [status, setStatus] = useState<'idle' | 'normalizing' | 'embedding' | 'comparing' | 'complete'>('idle');
    const [results, setResults] = useState<any>(null);

    // Fetch policy catalog on mount
    useEffect(() => {
        fetch('/api/policies')
            .then(res => res.json())
            .then(data => {
                setPolicyCatalog(data);
                if (data['IAPL']) {
                    setSelectedProprietary(data['IAPL'].proprietary[0]);
                    setSelectedStandard(data['IAPL'].standard[0]);
                }
            });
    }, []);

    // Fetch content when selection changes (only for mock mode)
    useEffect(() => {
        if (activeTab === 'mock' && selectedType && selectedProprietary) {
            fetch(`/api/policy/${selectedType}/${selectedProprietary}`)
                .then(res => res.text())
                .then(setProprietaryContent);
        }
    }, [selectedType, selectedProprietary, activeTab]);

    useEffect(() => {
        if (activeTab === 'mock' && selectedType && selectedStandard) {
            fetch(`/api/policy/${selectedType}/${selectedStandard}`)
                .then(res => res.text())
                .then(setStandardContent);
        }
    }, [selectedType, selectedStandard, activeTab]);

    const handleTypeChange = (type: string) => {
        setSelectedType(type);
        if (policyCatalog[type]) {
            setSelectedProprietary(policyCatalog[type].proprietary[0]);
            setSelectedStandard(policyCatalog[type].standard[0]);
        }
        setResults(null);
        setStatus('idle');
    };

    const handleCompare = async () => {
        if (activeTab === 'custom') {
            setStatus('normalizing');
            // Check if inputs are empty
            if (!customProprietary || !customStandard) {
                alert("Please enter text for both policies.");
                setStatus('idle');
                return;
            }
        } else {
            setStatus('embedding');
        }

        await new Promise(r => setTimeout(r, 1000));

        if (activeTab === 'custom') setStatus('embedding'); // Transition for visual feedback

        try {
            const resp = await fetch('/api/compare', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    proprietaryForm: activeTab === 'custom' ? customProprietary : proprietaryContent,
                    industryStandardForm: activeTab === 'custom' ? customStandard : standardContent,
                    selectedType: selectedType, // Still sending this, effectively ignored in custom mode mostly
                    standardFileName: selectedStandard,
                    customMode: activeTab === 'custom'
                })
            });
            const data = await resp.json();
            setResults(data);
            setStatus('complete');
        } catch (e) {
            console.error(e);
            setStatus('idle');
        }
    };

    return (
        <div className="min-h-screen bg-slate-50 p-8 font-sans">
            <header className="mb-8 border-b pb-6 flex justify-between items-end">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900">Satori Policy Comparison Engine</h1>
                    <p className="text-slate-500 mt-1 uppercase text-xs font-semibold tracking-widest">Standalone Demo Environment</p>
                </div>

                {/* Tab Switcher */}
                <div className="bg-slate-200 p-1 rounded-xl flex gap-1">
                    <button
                        onClick={() => { setActiveTab('mock'); setResults(null); setStatus('idle'); }}
                        disabled={status !== 'idle' && status !== 'complete'}
                        className={`px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-lg transition-all ${activeTab === 'mock'
                            ? 'bg-white text-slate-900 shadow-sm'
                            : 'text-slate-500 hover:text-slate-700 disabled:opacity-50 disabled:cursor-not-allowed'
                            }`}
                    >
                        Mock Data
                    </button>
                    <button
                        onClick={() => { setActiveTab('custom'); setResults(null); setStatus('idle'); }}
                        disabled={status !== 'idle' && status !== 'complete'}
                        className={`px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-lg transition-all ${activeTab === 'custom'
                            ? 'bg-white text-slate-900 shadow-sm'
                            : 'text-slate-500 hover:text-slate-700 disabled:opacity-50 disabled:cursor-not-allowed'
                            }`}
                    >
                        Custom Comparison
                    </button>
                </div>
            </header>

            <main className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-1 gap-12">
                {/* Configuration Panel */}
                <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-200">
                    <div className="flex justify-between items-center mb-6">
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center text-blue-600 font-bold">1</div>
                            <h2 className="text-lg font-bold text-slate-900">
                                {activeTab === 'mock' ? 'Select Policy Data' : 'Input Policy Text'}
                            </h2>
                        </div>
                        {status !== 'idle' && status !== 'complete' && (
                            <div className="flex items-center gap-2 text-blue-600 bg-blue-50 px-3 py-1 rounded-full text-xs font-bold animate-pulse">
                                {status === 'normalizing' && <span>Auto-normalizing structure...</span>}
                                {status === 'embedding' && <span>Vectorizing content...</span>}
                                {status === 'comparing' && <span>Generating gap analysis...</span>}
                            </div>
                        )}
                    </div>

                    {activeTab === 'mock' ? (
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div className="flex flex-col gap-2">
                                <label className="text-xs font-bold text-slate-500 uppercase">Coverage Type</label>
                                <select
                                    className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-semibold focus:ring-2 focus:ring-blue-500 outline-none"
                                    value={selectedType}
                                    onChange={(e) => handleTypeChange(e.target.value)}
                                >
                                    {Object.keys(policyCatalog).map(type => (
                                        <option key={type} value={type}>{type}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="flex flex-col gap-2">
                                <label className="text-xs font-bold text-slate-500 uppercase">Proprietary Form</label>
                                <select
                                    className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-semibold focus:ring-2 focus:ring-blue-500 outline-none"
                                    value={selectedProprietary}
                                    onChange={(e) => { setSelectedProprietary(e.target.value); setResults(null); }}
                                >
                                    {policyCatalog[selectedType]?.proprietary.map(f => (
                                        <option key={f} value={f}>{f}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="flex flex-col gap-2">
                                <label className="text-xs font-bold text-slate-500 uppercase">Industry Standard</label>
                                <select
                                    className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-semibold focus:ring-2 focus:ring-blue-500 outline-none"
                                    value={selectedStandard}
                                    onChange={(e) => { setSelectedStandard(e.target.value); setResults(null); }}
                                >
                                    {policyCatalog[selectedType]?.standard.map(f => (
                                        <option key={f} value={f}>{f}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                    ) : (
                        /* Custom Comparison Inputs */
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="flex flex-col gap-2">
                                <label className="text-xs font-bold text-slate-500 uppercase flex justify-between">
                                    <span>Proprietary Form Text</span>
                                    <span className="text-slate-400 font-normal normal-case">Paste raw policy text</span>
                                </label>
                                <textarea
                                    className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-mono h-64 focus:ring-2 focus:ring-blue-500 outline-none resize-none"
                                    placeholder="Paste the proprietary policy text here..."
                                    value={customProprietary}
                                    onChange={(e) => setCustomProprietary(e.target.value)}
                                />
                            </div>

                            <div className="flex flex-col gap-2">
                                <label className="text-xs font-bold text-slate-500 uppercase flex justify-between">
                                    <span>Industry Standard Text</span>
                                    <span className="text-slate-400 font-normal normal-case">Paste raw policy text</span>
                                </label>
                                <textarea
                                    className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-mono h-64 focus:ring-2 focus:ring-blue-500 outline-none resize-none"
                                    placeholder="Paste the standard policy text or endorsements here..."
                                    value={customStandard}
                                    onChange={(e) => setCustomStandard(e.target.value)}
                                />
                            </div>
                        </div>
                    )}

                    <div className="mt-8 flex justify-end">
                        <button
                            onClick={handleCompare}
                            disabled={status !== 'idle' && status !== 'complete'}
                            className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-xl font-bold shadow-lg shadow-blue-200 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                        >
                            {status === 'idle' || status === 'complete' ? (
                                <>
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                                    {activeTab === 'mock' ? 'Run Policy Comparison' : 'Normalize & Compare'}
                                </>
                            ) : (
                                <>
                                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg>
                                    Processing...
                                </>
                            )}
                        </button>
                    </div>
                </div>

                {/* Policy Preview Section - ONLY VISIBLE IN MOCK MODE */}
                {activeTab === 'mock' && (
                    <div className="grid grid-cols-2 gap-8">
                        {/* Proprietary Preview */}
                        <section className="space-y-4">
                            <div className="flex justify-between items-end">
                                <h2 className="text-lg font-semibold text-slate-700">Proprietary Form Preview</h2>
                            </div>
                            <div className="bg-white p-6 rounded-xl shadow-sm border">
                                <textarea
                                    className="w-full h-96 p-4 font-mono text-xs border-none bg-transparent outline-none resize-none text-slate-500"
                                    value={proprietaryContent}
                                    readOnly
                                    placeholder="Select a policy above to view content..."
                                />
                            </div>
                        </section>

                        {/* Standard Preview */}
                        <section className="space-y-4">
                            <div className="flex justify-between items-end">
                                <h2 className="text-lg font-semibold text-slate-700">Standard Form Preview</h2>
                            </div>
                            <div className="bg-white p-6 rounded-xl shadow-sm border">
                                <textarea
                                    className="w-full h-96 p-4 font-mono text-xs border-none bg-transparent outline-none resize-none text-slate-500"
                                    value={standardContent}
                                    readOnly
                                    placeholder="Select a policy above to view content..."
                                />
                            </div>
                        </section>
                    </div>
                )}

                {results && (
                    <div className="space-y-10 animate-in fade-in slide-in-from-bottom-6 duration-500">
                        {/* Summary Header */}
                        <div className="bg-slate-900 text-white p-8 rounded-3xl shadow-2xl overflow-hidden relative">
                            <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/10 rounded-full -mr-32 -mt-32 blur-3xl"></div>
                            <div className="relative z-10 space-y-6">
                                {/* Executive Summary Label + Detected Type */}
                                <div className="flex items-center gap-4">
                                    <div className="flex items-center gap-2">
                                        <span className="w-2 h-2 bg-blue-400 rounded-full animate-pulse"></span>
                                        <span className="text-[10px] uppercase font-black tracking-widest text-blue-400">Executive Summary</span>
                                    </div>
                                    {results.detected_type && (
                                        <div className="bg-blue-800/50 px-3 py-1 rounded-full border border-blue-500/30">
                                            <span className="text-[10px] uppercase font-bold text-blue-200 tracking-wider">
                                                Detected Type: <span className="text-white">{results.detected_type}</span>
                                            </span>
                                        </div>
                                    )}
                                </div>

                                {/* Summary Text */}
                                <p className="text-lg font-medium leading-relaxed text-slate-200 max-w-4xl">
                                    {results.summary}
                                </p>


                                {/* Verdict Badge */}
                                <div className="inline-flex bg-blue-600 px-6 py-3 rounded-2xl border border-blue-400/30 shadow-lg">
                                    <div className="flex flex-col gap-1">
                                        <span className="text-[10px] uppercase font-black tracking-widest text-blue-100 opacity-60">Verdict</span>
                                        <span className="text-base font-bold text-white">{results.market_position}</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Comparison Sections */}
                        {(() => {
                            const sections = [
                                { title: '1. Insuring Agreements', key: 'insuring_agreements' },
                                { title: '2. Definition Breadth', key: 'definitions' },
                                { title: '3. Exclusion Analysis', key: 'exclusions' }
                            ];

                            // Helper to ensure we have an array
                            const ensureArray = (val: any): any[] => {
                                if (Array.isArray(val)) return val;
                                return [];
                            };

                            // Helper to get bullets from prop/std fields
                            const getBullets = (val: any): string[] => {
                                if (Array.isArray(val)) return val;
                                if (typeof val === 'string' && val) return [val];
                                return [];
                            };

                            return sections.map((section) => {
                                const items = ensureArray(results[section.key]);

                                return (
                                    <section key={section.key} className="space-y-5">
                                        {/* Section Header */}
                                        <div className="flex items-center gap-4 px-1">
                                            <h2 className="text-xs font-black text-slate-500 uppercase tracking-[0.15em] whitespace-nowrap">{section.title}</h2>
                                            <div className="h-px bg-slate-200 flex-grow"></div>
                                        </div>

                                        {/* Topic Cards Grid */}
                                        {items.length > 0 ? (
                                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                                {items.map((item: any, idx: number) => {
                                                    const topic = item.topic || item.title || item.term || item.category || `Item ${idx + 1}`;
                                                    const propBullets = getBullets(item.prop || item.prop_coverage || item.prop_definition || item.prop_treatment);
                                                    const stdBullets = getBullets(item.std || item.std_coverage || item.std_definition || item.std_treatment);
                                                    const gapText = item.gap || item.key_gaps || item.breadth_impact || item.gap_assessment || '';

                                                    return (
                                                        <div key={idx} className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                                                            {/* Topic Header */}
                                                            <div className="bg-slate-800 text-white px-5 py-3 flex items-center gap-3">
                                                                <span className="w-6 h-6 bg-white/20 rounded-lg flex items-center justify-center text-[10px] font-black">{idx + 1}</span>
                                                                <h4 className="font-bold text-sm tracking-tight">{topic}</h4>
                                                            </div>

                                                            {/* Content Body */}
                                                            <div className="p-5 space-y-4">
                                                                {/* PROP vs STD Grid */}
                                                                <div className="grid grid-cols-2 gap-4">
                                                                    {/* PROP Column */}
                                                                    <div className="space-y-2">
                                                                        <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                                                                            <div className="w-2 h-2 bg-blue-500 rounded-sm"></div>
                                                                            <span className="text-[10px] font-black text-blue-600 uppercase tracking-wider">Proprietary</span>
                                                                        </div>
                                                                        <ul className="space-y-2">
                                                                            {propBullets.length > 0 ? propBullets.map((b, i) => (
                                                                                <li key={i} className="text-xs text-slate-700 leading-relaxed pl-3 border-l-2 border-blue-200">
                                                                                    {b}
                                                                                </li>
                                                                            )) : <li className="text-xs text-slate-400 italic">—</li>}
                                                                        </ul>
                                                                    </div>

                                                                    {/* STD Column */}
                                                                    <div className="space-y-2">
                                                                        <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                                                                            <div className="w-2 h-2 bg-slate-400 rounded-sm"></div>
                                                                            <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Standard</span>
                                                                        </div>
                                                                        <ul className="space-y-2">
                                                                            {stdBullets.length > 0 ? stdBullets.map((b, i) => (
                                                                                <li key={i} className="text-xs text-slate-500 leading-relaxed pl-3 border-l-2 border-slate-200">
                                                                                    {b}
                                                                                </li>
                                                                            )) : <li className="text-xs text-slate-400 italic">—</li>}
                                                                        </ul>
                                                                    </div>
                                                                </div>

                                                                {/* Gap Verdict */}
                                                                {gapText && (
                                                                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mt-3">
                                                                        <div className="flex items-start gap-2">
                                                                            <span className="text-amber-600 font-bold text-sm mt-0.5">⚡</span>
                                                                            <div>
                                                                                <span className="text-[9px] font-black text-amber-700 uppercase tracking-wider block mb-1">Gap Verdict</span>
                                                                                <p className="text-xs font-semibold text-amber-900 leading-relaxed">
                                                                                    {typeof gapText === 'string' ? gapText : Array.isArray(gapText) ? gapText.join(' ') : ''}
                                                                                </p>
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        ) : (
                                            <div className="bg-white rounded-xl p-6 border border-slate-100 text-slate-400 text-sm italic text-center">
                                                No comparison data available for this section.
                                            </div>
                                        )}
                                    </section>
                                );
                            });
                        })()}
                    </div>
                )}
            </main>
        </div>
    );
}
