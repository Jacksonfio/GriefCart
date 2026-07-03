import { useEffect, useState } from 'react';
import { getFinancialTwin, queryTwin, refreshTwin } from '@/services/griefcart-client';
import { Brain, RefreshCw, DollarSign, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PageTitle } from '@/components/layout/PageTitle';
import type { FinancialTwin } from '@/types';

export function TwinPage() {
  const [twin, setTwin] = useState<FinancialTwin | null>(null);
  const [status, setStatus] = useState('loading');
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [asking, setAsking] = useState(false);

  useEffect(() => {
    getFinancialTwin().then(r => { setTwin(r.twin); setStatus(r.status); }).catch(() => setStatus('error'));
  }, []);

  const handleRefresh = async () => {
    setStatus('building');
    try {
      await refreshTwin();
      const r = await getFinancialTwin();
      setTwin(r.twin);
      setStatus(r.twin ? 'active' : 'pending');
    } catch {
      setStatus('error');
    }
  };

  const handleAsk = async () => {
    if (!question.trim()) return;
    setAsking(true);
    try {
      const res = await queryTwin(question);
      setAnswer(res.answer || 'I could not generate an answer right now.');
    } catch {
      setAnswer('I could not process that question right now.');
    } finally {
      setAsking(false);
    }
  };

  if (status === 'loading') return <div className="flex justify-center pt-20"><div className="h-6 w-6 animate-spin rounded-full border-2 border-orange border-t-transparent" /></div>;

  return (
    <div className="mx-auto max-w-6xl px-6 py-6 space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <PageTitle title="Financial Twin" subtitle="Your AI-powered financial digital twin" accent="gold" />
        <button onClick={handleRefresh} disabled={status === 'building'}
          className="inline-flex items-center gap-1.5 rounded-md gradient-gold px-4 py-1.5 text-xs font-semibold text-purple-400 disabled:opacity-50">
          <RefreshCw className={cn('h-3.5 w-3.5', status === 'building' && 'animate-spin')} />
          {status === 'building' ? 'Building...' : 'Rebuild'}
        </button>
      </div>

      {status === 'pending' && (
        <div className="card p-10 text-center">
          <Brain className="mx-auto h-8 w-8 text-text-muted" />
          <p className="mt-2 text-xs text-text-secondary">Upload documents first.</p>
        </div>
      )}

      {twin && (
        <>
          <div className="card p-5">
            <div className="flex items-center gap-4 mb-4">
              <div className="flex h-11 w-11 items-center justify-center rounded-lg gradient-gold">
                <Brain className="h-5 w-5 text-purple-400" />
              </div>
              <div>
                <p className="font-semibold text-text text-sm">{twin.profile?.email ?? 'Your Financial Twin'}</p>
                <p className="text-[10px] text-text-secondary">{twin.profile?.totalDocuments ?? 0} documents · {new Date(twin.generatedAt).toLocaleDateString()}</p>
              </div>
            </div>

            <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
              <div className="bg-bg-elevated rounded-lg p-3 text-center"><p className="text-lg font-bold text-text">{twin.assets?.length ?? 0}</p><p className="text-[10px] text-text-secondary">Assets</p></div>
              <div className="bg-bg-elevated rounded-lg p-3 text-center"><p className="text-lg font-bold text-purple-400">{twin.liabilities?.length ?? 0}</p><p className="text-[10px] text-text-secondary">Liabilities</p></div>
              <div className="bg-bg-elevated rounded-lg p-3 text-center"><p className="text-lg font-bold text-purple-400">{twin.insurance?.length ?? 0}</p><p className="text-[10px] text-text-secondary">Insurance</p></div>
              <div className="bg-bg-elevated rounded-lg p-3 text-center"><p className="text-lg font-bold text-text">{twin.recurringPayments?.length ?? 0}</p><p className="text-[10px] text-text-secondary">Recurring</p></div>
            </div>
          </div>

          {twin.assets && twin.assets.length > 0 && (
            <div>
              <p className="text-sm font-semibold text-text mb-3">Assets</p>
              <div className="space-y-2">
                {twin.assets.map((a, i) => (
                  <div key={i} className="card p-3 flex items-center gap-3">
                    <div className={cn('flex h-7 w-7 items-center justify-center rounded', a.continuityRisk === 'high' ? 'bg-subtle text-purple-400' : 'bg-bg-elevated text-text-secondary')}>
                      <DollarSign className="h-3.5 w-3.5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-text truncate">{a.name}</p>
                      <p className="text-[10px] text-text-secondary">{a.type} · {a.confidence}% confidence</p>
                    </div>
                    <span className={cn('text-[10px] px-2 py-0.5 rounded', a.continuityRisk === 'high' ? 'bg-subtle text-purple-400' : a.continuityRisk === 'medium' ? 'bg-gold-subtle text-purple-400' : 'bg-bg-elevated text-text-muted')}>
                      {a.continuityRisk}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      <div className="card p-5">
        <p className="text-sm font-semibold text-text mb-3">Ask Your Twin</p>
        <div className="flex gap-2">
          <input value={question} onChange={e => setQuestion(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAsk()}
            placeholder="Ask about your finances..."
            className="flex-1 rounded-md border border-border bg-bg-elevated px-3 py-2 text-xs text-text outline-none focus:border-orange/50" />
          <button type="button" onClick={handleAsk} disabled={asking || !question.trim()}
            className="btn-primary inline-flex items-center gap-1.5 text-xs rounded-md px-4 py-2 font-semibold shadow transition-all hover:brightness-110 disabled:opacity-50">
            {asking ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Search className="h-3 w-3" />} Ask
          </button>
        </div>
        {answer && <div className="mt-3 p-3 rounded-md bg-bg-elevated text-xs text-text-secondary leading-relaxed">{answer}</div>}
      </div>
    </div>
  );
}
