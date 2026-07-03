import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogoMark } from '@/components/charts/LogoMark';
import { LogIn, UserPlus, Sparkles, Loader2 } from 'lucide-react';

const COGNITO_DOMAIN = import.meta.env.VITE_COGNITO_DOMAIN || 'https://griefcart-dev.auth.us-east-1.amazoncognito.com';
const CLIENT_ID = import.meta.env.VITE_COGNITO_CLIENT_ID || '61ho55j2698boup2aq6j5gkhel';
const REDIRECT_URI = import.meta.env.VITE_REDIRECT_URI || window.location.origin;

function cognitoLoginUrl() {
  return `${COGNITO_DOMAIN}/login?client_id=${CLIENT_ID}&response_type=token&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&scope=openid+profile+email`;
}

function cognitoRegisterUrl() {
  return `${COGNITO_DOMAIN}/signup?client_id=${CLIENT_ID}&response_type=token&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&scope=openid+profile+email`;
}

function parseTokenFromHash() {
  const hash = window.location.hash;
  if (!hash || !hash.includes('access_token=')) return null;
  const params = new URLSearchParams(hash.replace('#', '?'));
  const accessToken = params.get('access_token');
  const idToken = params.get('id_token');
  const token = idToken || accessToken;
  if (token) {
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      localStorage.setItem('griefcart_token', token);
      localStorage.setItem('griefcart_user', JSON.stringify({
        userId: payload.sub,
        email: payload.email || payload['cognito:username'] || '',
        name: payload.name || '',
      }));
    } catch {}
  }
  return token;
}

export function AuthPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const token = parseTokenFromHash();
    if (token) {
      window.location.hash = '';
      navigate('/', { replace: true });
    }
  }, [navigate]);

  async function handleDemo() {
    setError('');
    setLoading(true);
    try {
      const client = await import('@/services/griefcart-client');
      await client.Auth.demoLogin();
      navigate('/');
    } catch (err: any) {
      setError(err.message || 'Demo login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4 bg-gradient-to-b from-gray-950 via-gray-900 to-gray-950">
      <div className="card p-8 max-w-sm w-full text-center animate-scale-in">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl gradient-red glow-red">
          <LogoMark size={32} />
        </div>
        <h1 className="text-2xl font-bold gradient-text-purple-400">GriefCart</h1>
        <p className="mt-1 text-[11px] text-text-secondary/70">
          Your AI Financial Continuity Platform
        </p>

        {error && (
          <div className="mt-4 rounded-lg bg-red-900/30 border border-red-800/50 p-3 text-xs text-red-400">
            {error}
          </div>
        )}

        <div className="mt-6 space-y-3">
          <a
            href={cognitoLoginUrl()}
            className="btn-primary w-full text-sm rounded-md px-4 py-2.5 font-semibold shadow transition-all hover:brightness-110 inline-flex items-center justify-center gap-2"
          >
            <LogIn className="h-4 w-4" />
            Sign In
          </a>

          <a
            href={cognitoRegisterUrl()}
            className="w-full text-xs rounded-md px-4 py-2 font-medium text-purple-300 border border-purple-800/50 hover:bg-purple-900/30 transition-all inline-flex items-center justify-center gap-2"
          >
            <UserPlus className="h-3.5 w-3.5" />
            Create Account
          </a>
        </div>

        <div className="mt-4 flex items-center gap-2">
          <div className="flex-1 h-px bg-border" />
          <span className="text-[10px] text-text-muted">OR</span>
          <div className="flex-1 h-px bg-border" />
        </div>

        <button
          onClick={handleDemo} disabled={loading}
          className="mt-4 w-full text-xs rounded-md px-4 py-2 font-medium text-purple-300 border border-purple-800/50 hover:bg-purple-900/30 transition-all inline-flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
          Try Demo (pre-loaded with sample data)
        </button>
      </div>
    </div>
  );
}