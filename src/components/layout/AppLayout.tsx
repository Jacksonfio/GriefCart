import { Outlet } from 'react-router-dom';
import { Navbar } from './Navbar';
import { Sidebar } from './Sidebar';
import { ChatOverlay } from '../chat/ChatOverlay';

function Background() {
  return (
    <div aria-hidden="true">
      <div className="topographic-pattern" />
      <div className="glow-orbs">
        <div className="glow-orb glow-orb-1" />
        <div className="glow-orb glow-orb-2" />
        <div className="glow-orb glow-orb-3" />
      </div>
    </div>
  );
}

export function AppLayout() {
  return (
    <div className="min-h-screen">
      <Background />
      <Sidebar />
      <Navbar />
      <main className="relative z-10 pl-64 pt-14">
        <Outlet />
      </main>
      <ChatOverlay />
    </div>
  );
}
