import { useEffect, useState } from 'react';
import { getRecoveryGuide } from '@/services/griefcart-client';
import { Shield, FileText, Users, CheckCircle, Heart } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PageTitle } from '@/components/layout/PageTitle';
import type { RecoveryGuide } from '@/types';

export function RecoveryPage() {
  const [guide, setGuide] = useState<RecoveryGuide | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { getRecoveryGuide().then(setGuide).catch(() => {}).finally(() => setLoading(false)); }, []);

  if (loading) return <div className="flex justify-center pt-20"><div className="h-6 w-6 animate-spin rounded-full border-2 border-orange border-t-transparent" /></div>;

  return (
    <div className="mx-auto max-w-6xl px-6 py-6 space-y-6 animate-fade-in">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg gradient-red glow-red">
          <Heart className="h-5 w-5 text-white" />
        </div>
        <PageTitle title="Recovery Guide" subtitle="A compassionate step-by-step guide for your trusted persons" accent="red" />
      </div>

      {!guide ? (
        <div className="card p-10 text-center"><Heart className="mx-auto h-8 w-8 text-text-muted" /><p className="mt-2 text-xs text-text-secondary">Upload documents and add trusted persons first.</p></div>
      ) : (
        <>
          <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
            <div className="card p-4 text-center"><FileText className="h-4 w-4 text-purple-400 mx-auto mb-1" /><p className="text-lg font-bold text-text">{guide.documentCount}</p><p className="text-[10px] text-text-secondary">Documents</p></div>
            <div className="card p-4 text-center"><Users className="h-4 w-4 text-purple-400 mx-auto mb-1" /><p className="text-lg font-bold text-text">{guide.trustedPersonCount}</p><p className="text-[10px] text-text-secondary">Trusted</p></div>
            <div className="card p-4 text-center"><Shield className="h-4 w-4 text-purple-400 mx-auto mb-1" /><p className="text-lg font-bold text-text">{guide.hasPlan ? 1 : 0}</p><p className="text-[10px] text-text-secondary">Plan</p></div>
            <div className="card p-4 text-center"><CheckCircle className={cn('h-4 w-4 mx-auto mb-1', guide.hasPlan ? 'text-purple-400' : 'text-purple-400')} /><p className={cn('text-lg font-bold', guide.hasPlan ? 'text-purple-400' : 'text-purple-400')}>{guide.hasPlan ? 'Ready' : 'Pending'}</p></div>
          </div>
          <div className="card p-6">
            <div className="text-xs text-text-secondary leading-relaxed space-y-2">
              {guide.guide.split('\n').map((line, i) => {
                if (line.startsWith('# ')) return <p key={i} className="text-sm font-bold text-text mt-4">{line.slice(2)}</p>;
                if (line.match(/^\d+\./)) return <div key={i} className="flex gap-2 p-3 rounded-lg bg-bg-elevated"><span className="text-purple-400 font-bold shrink-0 text-[10px]">{line.match(/^\d+/)?.[0]}</span><span>{line.replace(/^\d+\.\s*/, '')}</span></div>;
                if (line.trim() === '') return <div key={i} className="h-1" />;
                return <p key={i}>{line}</p>;
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
