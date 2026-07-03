import { useNavigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, FolderLock, Brain, Search, Users, ClipboardList, HeartHandshake, Heart, Clock
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { LogoMark } from '@/components/charts/LogoMark';

const navItems = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/documents', label: 'Vault', icon: FolderLock },
  { to: '/twin', label: 'Twin', icon: Brain },
  { to: '/detective', label: 'Detective', icon: Search },
  { to: '/legacy', label: 'Legacy', icon: Heart },
  { to: '/trusted', label: 'People', icon: Users },
  { to: '/plan', label: 'Plan', icon: ClipboardList },
  { to: '/timeline', label: 'Timeline', icon: Clock },
  { to: '/recovery', label: 'Recovery', icon: HeartHandshake },
];

export function Navbar() {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <header className="fixed top-0 left-64 right-0 z-20 h-14 border-b border-glass-border glass">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-300/50 to-transparent" />

      <div className="flex h-full items-center justify-between px-5">
        <nav className="flex items-center gap-0.5">
          {navItems.map(({ to, label, icon: Icon }) => {
            const isActive = location.pathname === to;
            return (
              <button
                key={to}
                onClick={() => navigate(to)}
                className={cn(
                  'group relative flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-md transition-all duration-200',
                  isActive
                    ? 'text-purple-400'
                    : 'text-text-secondary/50 hover:text-text'
                )}
              >
                {isActive && (
                  <div className="absolute inset-0 rounded-md bg-gradient-to-r from-green-50/80 to-green-50/20 border border-green-200/30" />
                )}
                <Icon className={cn(
                  'relative h-3.5 w-3.5 transition-all',
                  isActive && 'text-purple-400'
                )} />
                <span className="relative">{label}</span>
                {isActive && (
                  <div className="absolute -bottom-[6.5px] left-1/2 h-px w-8 -translate-x-1/2 bg-gradient-to-r from-transparent via-green-400 to-transparent" />
                )}
              </button>
            );
          })}
        </nav>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-white/50 border border-amber-200/20">
            <div className="h-1.5 w-1.5 rounded-full bg-amber-400" />
            <span className="text-[9px] font-medium text-text-muted/60 tracking-wider uppercase">Secured</span>
          </div>
          <LogoMark size={20} />
        </div>
      </div>
    </header>
  );
}
