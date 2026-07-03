import { useState } from 'react';
import { runDetectiveScan } from '@/services/griefcart-client';
import { Search, Lightbulb, AlertTriangle, CreditCard, FileText, Loader2, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PageTitle } from '@/components/layout/PageTitle';
import type { DetectiveResult } from '@/types';

export function DetectivePage() {
  const [result, setResult] = useState<DetectiveResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleScan = async () => {
    setLoading(true); setError('');
    try { const res = await runDetectiveScan(); setResult(res); } catch (err) { setError((err as Error).message); }
    setLoading(false);
  };

  return (
    <div className="mx-auto max-w-6xl px-6 py-6 space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <PageTitle title="AI Detective" subtitle="Uncover missing assets, hidden subscriptions, and document gaps" accent="gold" />
        <button type="button" onClick={handleScan} disabled={loading}
          className="btn-primary inline-flex items-center gap-1.5 text-xs rounded-md px-4 py-2 font-semibold shadow transition-all hover:brightness-110 disabled:opacity-50">
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
          {loading ? 'Scanning...' : 'Run Scan'}
        </button>
      </div>

      {!result && !loading && !error && (
        <div className="card p-10 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-lg gradient-gold">
            <Search className="h-6 w-6 text-purple-400" />
          </div>
          <h2 className="font-bold gradient-text-purple-400">Find What's Missing</h2>
          <p className="mt-2 text-xs text-text-secondary max-w-md mx-auto">
            Scans your documents for missing assets, hidden subscriptions, and risks.
          </p>
        </div>
      )}

      {error && <div className="card p-4 border border-orange/20"><p className="text-xs text-purple-400">{error}</p></div>}

      {result && (
        <>
          {result.summary && (
            <div className="card p-5">
              <div className="flex items-center gap-2 mb-2"><Lightbulb className="h-4 w-4 text-purple-400" /><p className="text-sm font-semibold text-text">Assessment</p></div>
              <p className="text-xs text-text-secondary leading-relaxed">{result.summary}</p>
            </div>
          )}
          <div className="grid gap-4 md:grid-cols-2">
            {result.missingAssets?.length > 0 && (
              <div className="card p-5">
                <p className="text-xs font-semibold text-purple-400 mb-3 flex items-center gap-1.5"><AlertTriangle className="h-3.5 w-3.5" /> Missing Assets ({result.missingAssets.length})</p>
                <div className="space-y-2">{result.missingAssets.map((m, i) => (
                  <div key={i} className="bg-bg-elevated rounded-lg p-3">
                    <p className="text-xs font-medium text-text">{m.type}</p>
                    <p className="text-[10px] text-text-secondary mt-0.5">{m.reason}</p>
                    <p className="text-[9px] text-text-muted mt-1">Suggested: {m.suggested} · {m.confidence}%</p>
                  </div>
                ))}</div>
              </div>
            )}
            {result.hiddenSubscriptions?.length > 0 && (
              <div className="card p-5">
                <p className="text-xs font-semibold text-purple-400 mb-3 flex items-center gap-1.5"><CreditCard className="h-3.5 w-3.5" /> Hidden Subscriptions ({result.hiddenSubscriptions.length})</p>
                <div className="space-y-2">{result.hiddenSubscriptions.map((s, i) => (
                  <div key={i} className="bg-bg-elevated rounded-lg p-3">
                    <p className="text-xs font-medium text-text">{s.name}</p>
                    <p className="text-[10px] text-text-secondary mt-0.5">{s.reason}</p>
                    <p className="text-[9px] text-text-muted mt-1">Est. {s.estimatedAmount} · {s.confidence}%</p>
                  </div>
                ))}</div>
              </div>
            )}
          </div>
          {result.documentGaps?.length > 0 && (
            <div className="card p-5">
              <p className="text-xs font-semibold text-purple-400 mb-3"><FileText className="h-3.5 w-3.5 inline mr-1" /> Document Gaps ({result.documentGaps.length})</p>
              <div className="grid gap-2 md:grid-cols-2">{result.documentGaps.map((g, i) => (
                <div key={i} className={cn('bg-bg-elevated rounded-lg p-3 border-l-2', g.importance === 'critical' ? 'border-orange' : g.importance === 'high' ? 'border-gold' : 'border-text-muted')}>
                  <p className="text-xs font-medium text-text">{g.documentType}</p>
                  <span className={cn('text-[9px] px-1.5 py-0.5 rounded mt-1 inline-block', g.importance === 'critical' ? 'bg-subtle text-purple-400' : g.importance === 'high' ? 'bg-gold-subtle text-purple-400' : 'bg-bg-elevated text-text-muted')}>{g.importance}</span>
                </div>
              ))}</div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
