import { useEffect, useState } from 'react';
import { getTrustedPersons, addTrustedPerson, deleteTrustedPerson } from '@/services/griefcart-client';
import { Users, Plus, Mail, Shield, Trash2, CheckCircle, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PageTitle } from '@/components/layout/PageTitle';
import type { TrustedPerson } from '@/types';

export function TrustedPersonsPage() {
  const [persons, setPersons] = useState<TrustedPerson[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', phone: '', relationship: '', accessLevel: 'emergency', canViewDocuments: false, canContactInstitutions: false });

  const load = async () => {
    try { const res = await getTrustedPersons(); setPersons(res.trustedPersons); } catch {}
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const handleAdd = async () => {
    try {
      await addTrustedPerson(form);
      setShowForm(false);
      setForm({ name: '', email: '', phone: '', relationship: '', accessLevel: 'emergency', canViewDocuments: false, canContactInstitutions: false });
      await load();
    } catch (err) { alert((err as Error).message); }
  };
  const handleDelete = async (id: string) => {
    if (!confirm('Remove?')) return;
    try { await deleteTrustedPerson(id); await load(); } catch {}
  };

  return (
    <div className="mx-auto max-w-6xl px-6 py-6 space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <PageTitle title="Trusted Persons" subtitle="Manage who can access your financial data in an emergency" accent="red" />
        <button type="button" onClick={() => setShowForm(!showForm)}
          className="btn-primary inline-flex items-center gap-1.5 text-xs rounded-md px-4 py-2 font-semibold shadow transition-all hover:brightness-110">
          <Plus className="h-3.5 w-3.5" /> Add Person
        </button>
      </div>

      <div className="card p-5 flex items-center gap-3">
        <Shield className="h-5 w-5 text-purple-400 shrink-0" />
        <div>
          <p className="text-xs text-text-secondary">Trusted persons can access your financial data in emergencies.</p>
          <p className="text-[10px] text-text-muted mt-0.5">Each person receives a verification email.</p>
        </div>
      </div>

      {showForm && (
        <div className="card p-5 animate-slide-up">
          <p className="text-sm font-semibold text-text mb-4">Add Trusted Person</p>
          <div className="grid gap-3 md:grid-cols-2">
            <input placeholder="Full Name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
              className="rounded-md border border-border bg-bg-elevated px-3 py-2 text-xs text-text outline-none focus:border-orange/50" />
            <input placeholder="Email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })}
              className="rounded-md border border-border bg-bg-elevated px-3 py-2 text-xs text-text outline-none focus:border-orange/50" />
            <input placeholder="Phone" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })}
              className="rounded-md border border-border bg-bg-elevated px-3 py-2 text-xs text-text outline-none focus:border-orange/50" />
            <label className="sr-only" htmlFor="relationship">Relationship</label>
            <select id="relationship" aria-label="Relationship" value={form.relationship} onChange={e => setForm({ ...form, relationship: e.target.value })}
              className="rounded-md border border-border bg-bg-elevated px-3 py-2 text-xs text-text outline-none">
              <option value="">Relationship</option>
              <option value="spouse">Spouse</option>
              <option value="child">Adult Child</option>
              <option value="parent">Parent</option>
              <option value="sibling">Sibling</option>
              <option value="attorney">Attorney</option>
              <option value="executor">Executor</option>
              <option value="friend">Friend</option>
            </select>
            <label className="sr-only" htmlFor="access-level">Access level</label>
            <select id="access-level" aria-label="Access level" value={form.accessLevel} onChange={e => setForm({ ...form, accessLevel: e.target.value })}
              className="rounded-md border border-border bg-bg-elevated px-3 py-2 text-xs text-text outline-none">
              <option value="emergency">Emergency Only</option>
              <option value="limited">Limited Access</option>
              <option value="full">Full Access</option>
            </select>
          </div>
          <div className="flex gap-4 mt-4">
            <button type="button" onClick={handleAdd} className="btn-primary inline-flex items-center gap-1.5 text-xs rounded-md px-4 py-2 font-semibold shadow transition-all hover:brightness-110">Send Invitation</button>
            <button onClick={() => setShowForm(false)} className="text-xs text-text-secondary hover:text-text transition-colors">Cancel</button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-10"><div className="h-6 w-6 animate-spin rounded-full border-2 border-orange border-t-transparent" /></div>
      ) : persons.length === 0 ? (
        <div className="card p-10 text-center">
          <Users className="mx-auto h-8 w-8 text-text-muted" />
          <p className="mt-2 text-xs text-text-secondary">No trusted persons yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {persons.map(p => (
            <div key={p.personId} className="card p-4 flex items-center gap-4">
              <div className={cn('flex h-10 w-10 items-center justify-center rounded-lg', p.verificationStatus === 'verified' ? 'gradient-red' : 'bg-bg-elevated')}>
                <Users className={cn('h-5 w-5', p.verificationStatus === 'verified' ? 'text-white' : 'text-text-muted')} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-text">{p.name}</p>
                  {p.verificationStatus === 'verified'
                    ? <span className="flex items-center gap-0.5 text-[9px] text-purple-400"><CheckCircle className="h-2.5 w-2.5" />Verified</span>
                    : <span className="flex items-center gap-0.5 text-[9px] text-purple-400"><Clock className="h-2.5 w-2.5" />Pending</span>}
                </div>
                <div className="flex items-center gap-2 mt-0.5 text-[10px] text-text-secondary">
                  <span><Mail className="h-2.5 w-2.5 inline" />{p.email}</span>
                  <span>{p.relationship}</span>
                  <span className={cn('px-1.5 py-0.5 rounded text-[9px]', p.accessLevel === 'full' ? 'bg-subtle text-purple-400' : 'bg-bg-elevated text-text-muted')}>{p.accessLevel}</span>
                </div>
              </div>
              <button type="button" aria-label={`Delete ${p.name}`} onClick={() => handleDelete(p.personId)} className="p-1.5 rounded text-text-muted hover:text-purple-400 transition-colors">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
