import { useEffect, useState } from 'react';
import { getContinuityScore, getFinancialTwin, getTrustedPersons, getDocuments } from '@/services/griefcart-client';
import { Shield, FileText, Brain, Users, AlertTriangle, CheckCircle, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PageTitle } from '@/components/layout/PageTitle';
import { ChartSparkline } from '@/components/charts/ChartSparkline';

import type { ContinuityScore, FinancialTwin, TrustedPerson, Document } from '@/types';

export function DashboardPage() {
  const [score, setScore] = useState<ContinuityScore | null>(null);
  const [twin, setTwin] = useState<FinancialTwin | null>(null);
  const [docs, setDocs] = useState<Document[]>([]);
  const [persons, setPersons] = useState<TrustedPerson[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      getContinuityScore().catch(() => null),
      getFinancialTwin().catch(() => ({ twin: null })),
      getDocuments().catch(() => ({ documents: [] })),
      getTrustedPersons().catch(() => ({ trustedPersons: [] })),
    ]).then(([s, t, d, p]) => {
      setScore(s);
      setTwin((t as any)?.twin ?? null);
      setDocs((d as any)?.documents ?? []);
      setPersons((p as any)?.trustedPersons ?? []);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-3.5rem)]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-orange border-t-transparent" />
      </div>
    );
  }

  const verifiedPersons = persons.filter(p => p.verificationStatus === 'verified').length;
  const riskCount = twin?.risks?.filter(r => r.severity === 'critical' || r.severity === 'high').length ?? 0;

  const colorForScoreClass = (s: number) => s >= 70 ? 'text-red-600' : s >= 40 ? 'text-amber-500' : 'text-red-400';

  return (
    <div className="mx-auto max-w-6xl px-6 py-6 space-y-6 animate-fade-in">
      <PageTitle title="Dashboard" subtitle="Your automated financial administrator — active whenever you can't be" accent="red" />
      <div className="accent-line" />

      <div className="grid gap-4 md:grid-cols-4">
        <div className="card p-5 md:col-span-2 flex items-center gap-5 relative overflow-hidden">
          <div className="absolute right-0 top-0 opacity-[0.04]">
            <ChartSparkline height={80} width={200} color="#b91c1c" />
          </div>
          <div className="relative flex h-20 w-20 items-center justify-center shrink-0">
            <svg className="h-20 w-20 -rotate-90" viewBox="0 0 100 100">
              <circle cx="50" cy="50" r="42" fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="6" />
              <circle cx="50" cy="50" r="42" fill="none" stroke="currentColor" strokeWidth="6"
                strokeDasharray={`${2 * Math.PI * 42}`} strokeDashoffset={`${2 * Math.PI * 42 * (1 - (score?.score ?? 0) / 100)}`}
                strokeLinecap="round" className={cn('transition-all duration-1000', colorForScoreClass(score?.score ?? 0))} />
            </svg>
            <span className={cn('absolute text-xl font-bold', colorForScoreClass(score?.score ?? 0))}>
              {score?.score ?? '--'}
            </span>
          </div>
          <div>
            <p className="font-semibold text-text text-sm">Administration Readiness</p>
            <p className="text-xs text-text-secondary mt-1">{score?.assessment ?? 'Upload documents to activate your financial administrator'}</p>
          </div>
        </div>

        <div className="card p-5 relative overflow-hidden">
          <div className="absolute -right-4 -top-4 opacity-[0.03]">
            <TrendingUp className="h-24 w-24" />
          </div>
          <div className="flex items-center gap-3 mb-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg gradient-gold">
              <Brain className="h-4 w-4 text-purple-400" />
            </div>
            <p className="text-lg font-bold text-text">{twin?.assets?.length ?? 0}</p>
          </div>
          <p className="text-xs text-text-secondary">Assets Tracked</p>
          <p className="text-[10px] text-text-secondary/60 mt-1">{twin?.liabilities?.length ?? 0} liabilities · {twin?.insurance?.length ?? 0} policies</p>
        </div>

        <div className="card p-5 relative overflow-hidden">
          <div className="absolute -right-4 -top-4 opacity-[0.03]">
            <AlertTriangle className="h-24 w-24" />
          </div>
          <div className="flex items-center gap-3 mb-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg gradient-red">
              <AlertTriangle className="h-4 w-4 text-white" />
            </div>
            <p className={cn('text-lg font-bold', riskCount > 0 ? 'text-purple-400' : 'text-purple-400')}>{riskCount}</p>
          </div>
          <p className="text-xs text-text-secondary">Open Risks</p>
          <div className="mt-2">
            <ChartSparkline height={24} width={100} color={riskCount > 0 ? '#b91c1c' : '#b91c1c'} />
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-3">
            <FileText className="h-3.5 w-3.5 text-purple-400" />
            <span className="text-xs text-text-secondary">Documents</span>
            <span className="ml-auto font-bold text-text">{docs.length}</span>
          </div>
          {docs.slice(0, 4).map(d => (
            <div key={d.documentId} className="flex items-center gap-2 py-1 text-xs text-text-secondary">
              <CheckCircle className="h-3 w-3 text-purple-400 shrink-0" />
              <span className="truncate">{d.fileName}</span>
            </div>
          ))}
        </div>

        <div className="card p-5">
          <div className="flex items-center gap-2 mb-3">
            <Users className="h-3.5 w-3.5 text-purple-400" />
            <span className="text-xs text-text-secondary">Trusted Persons</span>
            <span className="ml-auto font-bold text-text">{verifiedPersons}/{persons.length}</span>
          </div>
          {persons.slice(0, 4).map(p => (
            <div key={p.personId} className="flex items-center gap-2 py-1 text-xs text-text-secondary">
              <div className={cn('h-1.5 w-1.5 rounded-full shrink-0', p.verificationStatus === 'verified' ? 'bg-emerald-500' : 'bg-gold')} />
              <span className="truncate">{p.name}</span>
              <span className="ml-auto text-[10px] text-text-muted">{p.relationship}</span>
            </div>
          ))}
        </div>

        <div className="card p-5">
          <div className="flex items-center gap-2 mb-3">
            <Shield className="h-3.5 w-3.5 text-purple-400" />
            <span className="text-xs text-text-secondary">Plan Status</span>
            <span className={cn('ml-auto font-bold text-xs', score?.breakdown?.hasPlan ? 'text-purple-400' : 'text-purple-400')}>
              {score?.breakdown?.hasPlan ? 'Ready' : 'Missing'}
            </span>
          </div>
          <div className="space-y-1.5 text-xs text-text-secondary">
            <div className="flex justify-between"><span>Legal Docs</span><span className={score?.breakdown?.legalDocs ? 'text-purple-400' : 'text-purple-400'}>{score?.breakdown?.legalDocs ? 'OK' : 'Add'}</span></div>
            <div className="flex justify-between"><span>Insurance</span><span className={score?.breakdown?.insurance ? 'text-purple-400' : 'text-purple-400'}>{score?.breakdown?.insurance ? 'OK' : 'Add'}</span></div>
            <div className="flex justify-between"><span>Financial Records</span><span className={score?.breakdown?.financialDocs ? 'text-purple-400' : 'text-purple-400'}>{score?.breakdown?.financialDocs ? 'OK' : 'Add'}</span></div>
          </div>
        </div>
      </div>
    </div>
  );
}
