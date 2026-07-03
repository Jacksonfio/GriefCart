import { useNavigate, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard, FolderLock, Brain, Search, Users, ClipboardList, HeartHandshake, LogOut, Heart, Clock
} from 'lucide-react';
import { LogoMark } from '@/components/charts/LogoMark';

const navItems = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/documents', label: 'Document Vault', icon: FolderLock },
  { to: '/twin', label: 'Financial Twin', icon: Brain },
  { to: '/detective', label: 'AI Detective', icon: Search },
  { to: '/legacy', label: 'Legacy Letters', icon: Heart },
  { to: '/trusted', label: 'Trusted Persons', icon: Users },
  { to: '/plan', label: 'Administration', icon: ClipboardList },
  { to: '/timeline', label: 'Incapacity Timeline', icon: Clock },  { to: '/recovery', label: 'Recovery Guide', icon: HeartHandshake },
];

export function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <aside className="fixed top-0 left-0 z-30 flex h-full w-64 flex-col glass border-r border-glass-border">
      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-green-400 via-amber-400 to-green-400 opacity-40" />

      <div className="relative px-5 pt-6 pb-5 overflow-hidden">
        <div className="absolute -top-8 -right-8 h-24 w-24 rounded-full border border-amber-300/30 opacity-30" />
        <div className="absolute -top-4 -right-4 h-16 w-16 rounded-full border border-green-300/20 opacity-20" />

        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="absolute -inset-1.5 bg-gradient-to-br from-green-300/20 to-amber-300/20 rounded-xl blur-md" />
            <div className="relative flex h-11 w-11 items-center justify-center rounded-xl bg-white border border-green-200/30 shadow-sm">
              <LogoMark size={30} />
            </div>
          </div>
          <div className="flex flex-col">
            <span className="text-lg font-bold tracking-tight gradient-text-purple-400 leading-none">GriefCart</span>
          </div>
        </div>
      </div>

      <div className="relative px-5 mb-2">
        <div className="accent-line" />
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-3 w-3 rotate-45 border border-amber-200/40 bg-white" />
      </div>

      <nav className="flex-1 px-3 py-1 space-y-0.5">
        {navItems.map(({ to, label, icon: Icon }) => {
          const isActive = location.pathname === to;
          return (
            <button
              key={to}
              onClick={() => navigate(to)}
              className={cn(
                'group relative flex w-full items-center gap-3.5 rounded-lg px-3.5 py-2.5 text-sm font-medium tracking-wide transition-all duration-200',
                isActive
                  ? 'text-purple-400'
                  : 'text-text-secondary/70 hover:text-text'
              )}
            >
              {isActive && (
                <>
                  <div className="absolute inset-0 rounded-lg bg-gradient-to-r from-green-50 via-green-50/50 to-transparent border border-green-200/40" />
                  <div className="absolute inset-0 rounded-lg shadow-inner shadow-green-200/20" />
                  <div className="absolute left-0 top-1 bottom-1 w-0.5 rounded-full bg-gradient-to-b from-green-400 via-amber-400 to-green-400 shadow-[0_0_6px_rgba(185,28,28,0.2)]" />
                </>
              )}

              <div className={cn(
                'relative flex h-8 w-8 items-center justify-center rounded-lg transition-all duration-200',
                isActive
                  ? 'bg-green-100/60'
                  : 'bg-black/[0.02] group-hover:bg-black/[0.04]'
              )}>
                <Icon className={cn(
                  'h-4 w-4 transition-all',
                  isActive ? 'text-purple-400' : 'text-text-secondary/50 group-hover:text-text'
                )} />
              </div>

              <span className={cn(
                'relative text-[13px]',
                isActive && 'font-semibold'
              )}>{label}</span>

              {isActive && (
                <div className="relative ml-auto flex items-center gap-1.5">
                  <div className="h-1 w-1 rounded-full bg-amber-400 shadow-[0_0_6px_rgba(217,119,6,0.3)]" />
                  <span className="text-[7px] text-purple-400/60 font-medium tracking-[0.15em] uppercase">Now</span>
                </div>
              )}
            </button>
          );
        })}
      </nav>

      <div className="relative px-3 pb-4 pt-2">
        <div className="accent-line mb-3" />
        <button
          onClick={() => { localStorage.removeItem('griefcart_token'); navigate('/auth'); }}
          className="flex w-full items-center gap-3 rounded-lg px-3.5 py-2.5 text-sm font-medium text-text-secondary/50 hover:text-purple-400 hover:bg-orange-50/50 transition-all border border-transparent hover:border-orange-200/20 group"
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-black/[0.02] group-hover:bg-orange-50 transition-all">
            <LogOut className="h-4 w-4" />
          </div>
          Sign Out
          <span className="ml-auto text-[8px] text-text-muted/30 tracking-[0.15em] uppercase">Esc</span>
        </button>
      </div>
    </aside>
  );
}
