import { useEffect, useState } from 'react';
import { getContinuityPlan, generateContinuityPlan } from '@/services/griefcart-client';
import { Shield, Loader2, Users, FileText, Building, Scale } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PageTitle } from '@/components/layout/PageTitle';
import type { ContinuityPlan } from '@/types';

export function ContinuityPlanPage() {
  const [plan, setPlan] = useState<ContinuityPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  const load = async () => {
    try { const res = await getContinuityPlan(); setPlan(res.plan); } catch {}
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const handleGenerate = async () => {
    setGenerating(true);
    try { const res = await generateContinuityPlan(); setPlan(res); } catch {}
    setGenerating(false);
  };

  if (loading) return <div className="flex justify-center pt-20"><div className="h-6 w-6 animate-spin rounded-full border-2 border-orange border-t-transparent" /></div>;

  return (
    <div className="mx-auto max-w-6xl px-6 py-6 space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <PageTitle title="Administration Plan" subtitle="Your automated financial steward — activates on death, hospitalization, dementia, or any incapacity" accent="gold" />
      </div>

      {!plan ? (
        <div className="card p-10 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-lg gradient-red glow-red">
            <Shield className="h-6 w-6 text-white" />
          </div>
          <h2 className="font-bold gradient-text-purple-400">No Plan Yet</h2>
          <p className="mt-2 text-xs text-text-secondary max-w-md mx-auto">Generate your continuity plan.</p>
          <button type="button" onClick={handleGenerate} disabled={generating}
            className="btn-primary mt-5 inline-flex items-center gap-1.5 text-xs rounded-md px-4 py-2 font-semibold shadow transition-all hover:brightness-110 disabled:opacity-50">
            {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Shield className="h-3.5 w-3.5" />}
            {generating ? 'Generating...' : 'Generate Plan'}
          </button>
        </div>
      ) : (
        <>
          <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
            <div className="card p-4 text-center"><Scale className="h-4 w-4 text-purple-400 mx-auto mb-1" /><p className="text-lg font-bold text-text">{plan.legalSteps?.length ?? 0}</p><p className="text-[10px] text-text-secondary">Legal Steps</p></div>
            <div className="card p-4 text-center"><Building className="h-4 w-4 text-purple-400 mx-auto mb-1" /><p className="text-lg font-bold text-text">{plan.institutionList?.length ?? 0}</p><p className="text-[10px] text-text-secondary">Institutions</p></div>
            <div className="card p-4 text-center"><Users className="h-4 w-4 text-purple-400 mx-auto mb-1" /><p className="text-lg font-bold text-text">{plan.criticalContacts?.length ?? 0}</p><p className="text-[10px] text-text-secondary">Contacts</p></div>
            <div className="card p-4 text-center"><FileText className="h-4 w-4 text-purple-400 mx-auto mb-1" /><p className="text-lg font-bold text-text">{plan.documentChecklist?.length ?? 0}</p><p className="text-[10px] text-text-secondary">Documents</p></div>
          </div>

          {plan.phases?.map((phase, i) => (
            <div key={i} className="card p-5">
              <div className="flex items-center gap-3 mb-4">
                <div className={cn('flex h-7 w-7 items-center justify-center rounded text-xs font-bold', phase.phase === 'immediate' ? 'bg-subtle text-purple-400' : phase.phase === 'week1' ? 'bg-gold-subtle text-purple-400' : 'bg-bg-elevated text-text-secondary')}>{i + 1}</div>
                <div><p className="font-semibold text-text text-sm">{phase.title}</p><p className="text-[10px] text-text-secondary capitalize">{phase.phase}</p></div>
              </div>
              <div className="space-y-2">
                {phase.actions?.map((action, j) => (
                  <div key={j} className="bg-bg-elevated rounded-lg p-3 flex items-start gap-3">
                    <div className={cn('mt-1 h-1.5 w-1.5 rounded-full shrink-0', action.priority === 'critical' ? 'bg-orange' : action.priority === 'high' ? 'bg-gold' : 'bg-emerald-400')} />
                    <div>
                      <p className="text-xs text-text">{action.action}</p>
                      <div className="flex gap-2 mt-1 text-[10px] text-text-secondary">
                        {action.assignedTo && <span>{action.assignedTo}</span>}
                        <span className={cn('px-1.5 py-0.5 rounded', action.priority === 'critical' ? 'bg-subtle text-purple-400' : 'bg-bg-elevated text-text-muted')}>{action.priority}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}

          <button type="button" onClick={handleGenerate} disabled={generating} className="btn-primary w-full rounded-md py-2.5 text-xs font-semibold shadow transition-all hover:brightness-110 disabled:opacity-50">
            {generating ? 'Regenerating...' : 'Regenerate Plan'}
          </button>
        </>
      )}
    </div>
  );
}
