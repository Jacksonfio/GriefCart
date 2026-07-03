import { useEffect, useState } from 'react';
import { getLegacyAnswers, saveLegacyAnswers, generateLegacyDocument, getTrustedPersons } from '@/services/griefcart-client';
import { Heart, PenLine, FileText, Users, Sparkles, Loader2, CheckCircle, ChevronRight, ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PageTitle } from '@/components/layout/PageTitle';
import type { LegacyAnswers, LegacyPersonalMessage, TrustedPerson } from '@/types';

const sections = [
  { id: 'messages', label: 'Personal Messages', icon: Heart, desc: 'What you want to say to each trusted person' },
  { id: 'wishes', label: 'Financial Wishes', icon: FileText, desc: 'How your assets should be handled' },
  { id: 'funeral', label: 'Memorial Preferences', icon: Heart, desc: 'Your wishes for final arrangements' },
  { id: 'digital', label: 'Digital Legacy', icon: Users, desc: 'Social media, crypto, online accounts' },
  { id: 'final', label: 'Final Words', icon: PenLine, desc: 'Anything else you want to leave behind' },
  { id: 'preview', label: 'Legacy Letter', icon: Sparkles, desc: 'AI-composed legacy document' },
];

export function LegacyPage() {
  const [answers, setAnswers] = useState<LegacyAnswers | null>(null);
  const [trusted, setTrusted] = useState<TrustedPerson[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [legacyDoc, setLegacyDoc] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState('messages');
  const [dirty, setDirty] = useState(false);

  const [personalMessages, setPersonalMessages] = useState<LegacyPersonalMessage[]>([]);
  const [financialWishes, setFinancialWishes] = useState('');
  const [funeralPreferences, setFuneralPreferences] = useState('');
  const [digitalLegacy, setDigitalLegacy] = useState('');
  const [finalWords, setFinalWords] = useState('');

  useEffect(() => {
    Promise.all([
      getLegacyAnswers().catch(() => null),
      getTrustedPersons().catch(() => ({ trustedPersons: [] })),
    ]).then(([a, p]: any) => {
      if (a?.legacyId) {
        setAnswers(a);
        setPersonalMessages(a.personalMessages || []);
        setFinancialWishes(a.financialWishes || '');
        setFuneralPreferences(a.funeralPreferences || '');
        setDigitalLegacy(a.digitalLegacy || '');
        setFinalWords(a.finalWords || '');
      }
      setTrusted(p?.trustedPersons || []);
      setLoading(false);
    });
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await saveLegacyAnswers({
        legacyId: answers?.legacyId,
        status: 'draft',
        personalMessages,
        financialWishes,
        funeralPreferences,
        digitalLegacy,
        finalWords,
      });
      setAnswers(prev => prev ? { ...prev, ...res as any } : null);
      setDirty(false);
    } catch {}
    setSaving(false);
  };

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      await handleSave();
      const res = await generateLegacyDocument(answers?.legacyId);
      setLegacyDoc(res.content);
    } catch {}
    setGenerating(false);
  };

  const handleComplete = async () => {
    setSaving(true);
    try {
      await saveLegacyAnswers({
        legacyId: answers?.legacyId,
        status: 'complete',
        personalMessages,
        financialWishes,
        funeralPreferences,
        digitalLegacy,
        finalWords,
      });
      setDirty(false);
    } catch {}
    setSaving(false);
  };

  const updateMessage = (personId: string, message: string) => {
    setPersonalMessages(prev => prev.map(m => m.personId === personId ? { ...m, message } : m));
    setDirty(true);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-3.5rem)]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-orange border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-6 animate-fade-in">
      <PageTitle title="Legacy Letters" subtitle="Words, wishes, and wisdom for the people you trust — delivered when you can no longer speak" accent="gold" />

      {/* Progress bar */}
      <div className="flex items-center gap-2 mb-8">
        {sections.slice(0, 5).map((s, i) => (
          <div key={s.id} className="flex items-center gap-2 flex-1">
            <button
              onClick={() => setActiveSection(s.id)}
              className={cn(
                'flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border',
                activeSection === s.id
                  ? 'bg-gold-subtle border-gold/30 text-purple-400'
                  : 'border-transparent text-text-muted hover:text-text-secondary'
              )}
            >
              <s.icon className="h-3 w-3" />
              <span className="hidden sm:inline">{s.label}</span>
            </button>
            {i < 4 && <div className="h-px flex-1 bg-border" />}
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main content */}
        <div className="lg:col-span-2 space-y-5">
          {/* Section: Personal Messages */}
          {activeSection === 'messages' && (
            <div className="card p-6 animate-fade-in">
              <div className="flex items-center gap-3 mb-5">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg gradient-gold">
                  <Heart className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-text">Personal Messages</h2>
                  <p className="text-[11px] text-text-secondary">Write a personal message for each trusted person</p>
                </div>
              </div>

              {trusted.length === 0 ? (
                <div className="rounded-xl bg-bg-elevated p-6 text-center">
                  <Users className="mx-auto h-6 w-6 text-text-muted mb-2" />
                  <p className="text-xs text-text-secondary">Add trusted persons first to write personal messages.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {trusted.map(p => {
                    const msg = personalMessages.find(m => m.personId === p.personId) || { personId: p.personId, personName: p.name, message: '' };
                    return (
                      <div key={p.personId} className="rounded-xl bg-bg-elevated p-4 border border-border">
                        <div className="flex items-center gap-2 mb-2">
                          <div className="h-6 w-6 rounded-full bg-subtle flex items-center justify-center">
                            <span className="text-[10px] font-bold text-purple-400">{p.name[0]}</span>
                          </div>
                          <span className="text-xs font-semibold text-text">{p.name}</span>
                          <span className="text-[9px] text-text-muted">{p.relationship}</span>
                        </div>
                        <textarea
                          value={msg.message}
                          onChange={e => updateMessage(p.personId, e.target.value)}
                          placeholder={`Dear ${p.name}, I want you to know...`}
                          rows={3}
                          className="w-full rounded-lg border border-border bg-black/30 px-3 py-2 text-xs text-text placeholder:text-text-muted/50 outline-none focus:border-gold/30 focus:ring-1 focus:ring-gold/10 transition-all resize-none"
                        />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Section: Financial Wishes */}
          {activeSection === 'wishes' && (
            <div className="card p-6 animate-fade-in">
              <div className="flex items-center gap-3 mb-5">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg gradient-red">
                  <FileText className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-text">Financial Wishes</h2>
                  <p className="text-[11px] text-text-secondary">How should your assets, accounts, and policies be handled?</p>
                </div>
              </div>
              <textarea
                value={financialWishes}
                onChange={e => { setFinancialWishes(e.target.value); setDirty(true); }}
                placeholder="My savings account should go to... My life insurance policy is with... I want my investment portfolio to be handled by..."
                rows={8}
                className="w-full rounded-xl border border-border bg-black/30 px-4 py-3 text-sm text-text placeholder:text-text-muted/40 outline-none focus:border-orange/30 focus:ring-1 focus:ring-orange/10 transition-all resize-none leading-relaxed"
              />
            </div>
          )}

          {/* Section: Funeral Preferences */}
          {activeSection === 'funeral' && (
            <div className="card p-6 animate-fade-in">
              <div className="flex items-center gap-3 mb-5">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg gradient-gold">
                  <Heart className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-text">Memorial Preferences</h2>
                  <p className="text-[11px] text-text-secondary">Your wishes for final arrangements and memorial</p>
                </div>
              </div>
              <textarea
                value={funeralPreferences}
                onChange={e => { setFuneralPreferences(e.target.value); setDirty(true); }}
                placeholder="I would prefer a small gathering... My favorite songs are... Donations can be made to... I would like to be remembered as..."
                rows={8}
                className="w-full rounded-xl border border-border bg-black/30 px-4 py-3 text-sm text-text placeholder:text-text-muted/40 outline-none focus:border-gold/30 focus:ring-1 focus:ring-gold/10 transition-all resize-none leading-relaxed"
              />
            </div>
          )}

          {/* Section: Digital Legacy */}
          {activeSection === 'digital' && (
            <div className="card p-6 animate-fade-in">
              <div className="flex items-center gap-3 mb-5">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg gradient-red">
                  <Users className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-text">Digital Legacy</h2>
                  <p className="text-[11px] text-text-secondary">Social media, crypto wallets, online accounts, digital assets</p>
                </div>
              </div>
              <textarea
                value={digitalLegacy}
                onChange={e => { setDigitalLegacy(e.target.value); setDirty(true); }}
                placeholder="My Facebook account should be memorialized at... I have crypto in... My domain names are registered with... My cloud storage contains..."
                rows={8}
                className="w-full rounded-xl border border-border bg-black/30 px-4 py-3 text-sm text-text placeholder:text-text-muted/40 outline-none focus:border-orange/30 focus:ring-1 focus:ring-orange/10 transition-all resize-none leading-relaxed"
              />
            </div>
          )}

          {/* Section: Final Words */}
          {activeSection === 'final' && (
            <div className="card p-6 animate-fade-in">
              <div className="flex items-center gap-3 mb-5">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg gradient-gold">
                  <PenLine className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-text">Final Words</h2>
                  <p className="text-[11px] text-text-secondary">Anything else you want to leave behind for your loved ones</p>
                </div>
              </div>
              <textarea
                value={finalWords}
                onChange={e => { setFinalWords(e.target.value); setDirty(true); }}
                placeholder="To my family, if you are reading this... I want you to know that... The most important thing to me is... Please take care of each other..."
                rows={10}
                className="w-full rounded-xl border border-border bg-black/30 px-4 py-3 text-sm text-text placeholder:text-text-muted/40 outline-none focus:border-gold/30 focus:ring-1 focus:ring-gold/10 transition-all resize-none leading-relaxed"
              />
            </div>
          )}

          {/* Section: Preview / Generate */}
          {activeSection === 'preview' && (
            <div className="card p-6 animate-fade-in">
              <div className="flex items-center gap-3 mb-5">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg gradient-gold">
                  <Sparkles className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-text">Your Legacy Letter</h2>
                  <p className="text-[11px] text-text-secondary">AI-composed from all your answers</p>
                </div>
              </div>

              {!legacyDoc ? (
                <div className="rounded-xl bg-bg-elevated p-8 text-center border border-border">
                  <Sparkles className="mx-auto h-8 w-8 text-purple-400 mb-3" />
                  <p className="text-sm text-text-secondary mb-4">Generate your legacy letter when ready.</p>
                  <button onClick={handleGenerate} disabled={generating}
                    className="inline-flex items-center gap-2 text-xs rounded-md px-4 py-2 font-semibold text-black shadow transition-all hover:brightness-110 disabled:opacity-50 bg-[linear-gradient(135deg,_#d4a017,_#b8860b)]">
                    {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                    {generating ? 'Composing...' : 'Generate Legacy Letter'}
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="rounded-xl bg-bg-elevated p-6 border border-gold/10 whitespace-pre-wrap text-xs text-text leading-relaxed font-[inherit]">
                    {legacyDoc}
                  </div>
                  <button onClick={handleGenerate} disabled={generating}
                    className="inline-flex items-center gap-2 text-xs rounded-md px-4 py-2 font-semibold text-black shadow transition-all hover:brightness-110 disabled:opacity-50 bg-[linear-gradient(135deg,_#d4a017,_#b8860b)]">
                    {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                    Regenerate
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Navigation buttons */}
          <div className="flex items-center justify-between">
            <button
              onClick={() => {
                const idx = sections.findIndex(s => s.id === activeSection);
                if (idx > 0) setActiveSection(sections[idx - 1].id);
              }}
              disabled={activeSection === sections[0].id}
              className="flex items-center gap-1.5 text-xs text-text-secondary hover:text-text disabled:opacity-30 transition-all"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Previous
            </button>

            <div className="flex items-center gap-2">
              <button onClick={handleSave} disabled={saving || !dirty}
                className="px-4 py-2 text-xs font-medium rounded-lg border border-border text-text-secondary hover:text-text hover:border-orange/30 disabled:opacity-30 transition-all">
                {saving ? 'Saving...' : 'Save Draft'}
              </button>

              {activeSection !== 'preview' ? (
                <button
                  onClick={() => {
                    const idx = sections.findIndex(s => s.id === activeSection);
                    if (idx < sections.length - 1) setActiveSection(sections[idx + 1].id);
                  }}
                  className="inline-flex items-center gap-1.5 text-xs rounded-md px-4 py-2 font-semibold text-black shadow transition-all hover:brightness-110 bg-[linear-gradient(135deg,_#d4a017,_#b8860b)]"
                >
                  Next <ChevronRight className="h-3.5 w-3.5" />
                </button>
              ) : (
                <button type="button" onClick={handleComplete} disabled={saving}
                  className="btn-primary inline-flex items-center gap-2 text-xs rounded-md px-4 py-2 font-semibold shadow transition-all hover:brightness-110 disabled:opacity-50">
                  <CheckCircle className="h-3.5 w-3.5" /> Mark Complete
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Sidebar: progress & tips */}
        <div className="space-y-4">
          <div className="card p-5">
            <h3 className="text-xs font-bold text-text mb-3 flex items-center gap-2">
              <CheckCircle className="h-3.5 w-3.5 text-purple-400" /> Sections
            </h3>
            <div className="space-y-2">
              {sections.slice(0, 5).map(s => {
                const filled = s.id === 'messages'
                  ? personalMessages.some(m => m.message.trim())
                  : s.id === 'wishes' ? financialWishes.trim()
                  : s.id === 'funeral' ? funeralPreferences.trim()
                  : s.id === 'digital' ? digitalLegacy.trim()
                  : s.id === 'final' ? finalWords.trim()
                  : false;
                return (
                  <button
                    key={s.id}
                    onClick={() => setActiveSection(s.id)}
                    className={cn(
                      'flex items-center gap-2 w-full px-3 py-2 rounded-lg text-xs transition-all text-left',
                      activeSection === s.id ? 'bg-gold-subtle' : 'hover:bg-white/[0.03]'
                    )}
                  >
                    <div className={cn('h-2 w-2 rounded-full shrink-0', filled ? 'bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.3)]' : 'bg-text-muted/30')} />
                    <span className={cn(activeSection === s.id ? 'text-purple-400 font-medium' : 'text-text-secondary')}>{s.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="card-gold card p-5">
            <h3 className="text-xs font-bold text-text mb-2 flex items-center gap-2">
              <Heart className="h-3.5 w-3.5 text-purple-400" /> Why this matters
            </h3>
            <p className="text-[11px] text-text-secondary/80 leading-relaxed">
              Your legacy letters are released to your trusted persons only when your financial administrator activates — whether from death, hospitalization, dementia, or prolonged inactivity. 
              Encrypted and securely stored until then.
            </p>
          </div>

          {answers?.status === 'complete' && (
            <div className="card p-5 border-emerald-500/20 bg-emerald-950/10">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-purple-400" />
                <span className="text-xs font-semibold text-purple-400">Legacy Complete</span>
              </div>
              <p className="text-[10px] text-text-secondary mt-1">Your legacy letter is ready and will be released on emergency.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
