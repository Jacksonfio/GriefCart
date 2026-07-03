import { useState } from 'react';
import { ArrowRight, Shield, Brain, FileText, Search, Users, Heart, Sparkles, Info } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Auth } from '@/services/griefcart-client';
import { PageTitle } from '@/components/layout/PageTitle';
import { LogoMark } from '@/components/charts/LogoMark';

const features = [
  { icon: Shield, title: 'Continuity Score', desc: 'See how prepared you are', to: '/dashboard', color: 'gradient-red' },
  { icon: Brain, title: 'Financial Twin', desc: 'AI model of your financial life', to: '/twin', color: 'gradient-gold' },
  { icon: FileText, title: 'Document Vault', desc: 'Encrypted document storage', to: '/documents', color: 'gradient-red' },
  { icon: Search, title: 'AI Detective', desc: 'Finds missing assets & subscriptions', to: '/detective', color: 'gradient-gold' },
  { icon: Users, title: 'Trusted Persons', desc: 'Who to contact in emergencies', to: '/trusted', color: 'gradient-red' },
  { icon: Heart, title: 'Recovery Guide', desc: 'Step-by-step plan for loved ones', to: '/recovery', color: 'gradient-gold' },
];

export function HomePage() {
  const navigate = useNavigate();
  const authed = Auth.isAuthenticated();
  const [showGuide, setShowGuide] = useState(false);

  if (!authed) {
    return (
      <div className="flex min-h-[calc(100vh-3.5rem)] items-center justify-center p-4">
        <div className="card p-12 max-w-sm w-full text-center animate-slide-up">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-xl gradient-red glow-red">
            <LogoMark size={36} />
          </div>
          <h1 className="text-3xl font-bold gradient-text-purple-400">GriefCart</h1>
          <p className="mt-2 text-xs text-text-secondary">Automated financial administrator for life's unexpected moments.</p>
          <div className="mt-6 flex flex-col gap-3">
            <button
              onClick={() => navigate('/auth')}
              className="inline-flex items-center justify-center gap-2 text-sm rounded-md px-5 py-2.5 font-semibold text-black shadow-lg transition-all hover:brightness-110"
              style={{ background: 'linear-gradient(135deg, #d4a017, #b8860b)' }}
            >
              Get Started <ArrowRight className="h-4 w-4" />
            </button>
            <button
              onClick={() => setShowGuide(!showGuide)}
              className="inline-flex items-center justify-center gap-2 text-xs text-purple-400 hover:text-purple-300 transition-colors"
            >
              <Info className="h-3.5 w-3.5" /> {showGuide ? 'Hide Guide' : 'How it Works'}
            </button>
          </div>

          {showGuide && (
            <div className="mt-5 rounded-xl bg-bg-elevated border border-border p-4 text-left text-xs text-text-secondary space-y-2.5 animate-fade-in">
              <p><span className="text-purple-400 font-medium">1. Upload</span> — Add your financial documents, accounts, and trusted contacts.</p>
              <p><span className="text-purple-400 font-medium">2. Detect</span> — AI scans for missing assets, hidden subscriptions, and gaps in your plan.</p>
              <p><span className="text-purple-400 font-medium">3. Plan</span> — Build a staged incapacity plan (Alert → Intervention → Stewardship → Legacy).</p>
              <p><span className="text-purple-400 font-medium">4. Protect</span> — Your data is encrypted with KMS and audited via CloudTrail.</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-6 space-y-6 animate-fade-in">
      <div className="card p-6 flex items-center gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-lg gradient-red glow-red">
          <Shield className="h-6 w-6 text-white" />
        </div>
        <div>
          <PageTitle title="Your Financial Continuity" subtitle="Everything organized for the people you trust." accent="red" />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {features.map((f) => (
          <button key={f.to} onClick={() => navigate(f.to)}
            className="card p-5 text-left card-hover"
          >
            <div className={`mb-3 flex h-10 w-10 items-center justify-center rounded-lg ${f.color}`}>
              <f.icon className="h-5 w-5 text-white" />
            </div>
            <h3 className="font-semibold text-text text-sm">{f.title}</h3>
            <p className="mt-1 text-xs text-text-secondary">{f.desc}</p>
          </button>
        ))}
      </div>

      <div className="card p-6 text-center">
        <Sparkles className="mx-auto h-6 w-6 text-purple-400 mb-2" />
        <h2 className="font-bold gradient-text-purple-400">AI Financial Detective</h2>
        <p className="mt-1 text-xs text-text-secondary max-w-md mx-auto">
          Upload documents to detect missing assets, hidden subscriptions, and generate your continuity plan.
        </p>
        <button onClick={() => navigate('/detective')} className="mt-4 inline-flex items-center gap-2 text-xs rounded-md px-4 py-2 font-semibold text-black shadow transition-all hover:brightness-110"
          style={{ background: 'linear-gradient(135deg, #d4a017, #b8860b)' }}>
          Run Scan <Search className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
