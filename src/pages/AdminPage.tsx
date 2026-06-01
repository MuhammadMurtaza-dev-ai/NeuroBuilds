import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useUserRole } from '../hooks/useUserRole';
import GradientBackground from '../components/GradientBackground/GradientBackground';
import ReviewConsole from '../components/Admin/ReviewConsole';
import ModerationDesk from '../components/Admin/ModerationDesk';
import AnalyticsDashboard from '../components/Admin/AnalyticsDashboard';
import { RoleAssignmentMatrix } from '../components/Admin/RoleAssignmentMatrix';
import TelemetryPanel from '../components/Admin/TelemetryPanel';

type AdminTab = 'review' | 'moderation' | 'analytics' | 'roles' | 'telemetry';

const TABS: { key: AdminTab; label: string; icon: string }[] = [
  { key: 'review',     label: 'Review Queue',        icon: 'rate_review' },
  { key: 'moderation', label: 'Platform Moderation', icon: 'shield' },
  { key: 'analytics',  label: 'Analytics',           icon: 'bar_chart' },
  { key: 'roles',      label: 'Role Management',     icon: 'manage_accounts' },
  { key: 'telemetry',  label: 'Telemetry',           icon: 'monitoring' },
];

export default function AdminPage() {
  const { user, loading: authLoading } = useAuth();
  const { isAdmin, loading: adminLoading } = useUserRole(user?.uid ?? null);
  const [activeTab, setActiveTab] = useState<AdminTab>('review');

  if (authLoading) return null;
  if (!user) return <Navigate to="/" replace />;

  if (!adminLoading && !isAdmin) return <Navigate to="/" replace />;

  return (
    <>
      <GradientBackground />
      <main className="relative z-10 flex-grow pt-32 pb-20 px-4 md:px-8 max-w-[1440px] mx-auto w-full">
        {/* Header */}
        <div className="mb-10">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2.5 rounded-xl bg-accent-purple/10 border border-accent-purple/30">
              <span className="material-symbols-outlined text-accent-purple text-[24px]">
                admin_panel_settings
              </span>
            </div>
            <div>
              <p className="text-xs font-mono text-gray-500 uppercase tracking-widest mb-0.5">
                Restricted Area
              </p>
              <h1 className="text-3xl md:text-4xl font-bold text-white tracking-tight">
                Admin{' '}
                <span className="text-accent-purple" style={{ textShadow: '0 0 20px rgba(191,0,255,0.5)' }}>
                  Workspace
                </span>
              </h1>
            </div>
          </div>
          <p className="text-gray-400 text-sm ml-[60px]">
            Platform moderation, content review, and analytics hub.
          </p>
        </div>

        {/* Loading skeleton while admin role confirms */}
        {adminLoading ? (
          <div className="space-y-6">
            <div className="flex gap-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-10 w-40 glass-panel rounded-full animate-pulse border border-white/5" />
              ))}
            </div>
            <div className="glass-panel rounded-bento h-64 animate-pulse border border-white/5" />
          </div>
        ) : (
          <>
            {/* Tab navigation */}
            <div className="flex items-center gap-2 mb-8 border-b border-white/10 pb-4 overflow-x-auto">
              {TABS.map(({ key, label, icon }) => (
                <button
                  key={key}
                  onClick={() => setActiveTab(key)}
                  className={`flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-bold transition-all whitespace-nowrap border ${
                    activeTab === key
                      ? 'bg-accent-purple/10 text-accent-purple border-accent-purple/30 shadow-glow-purple'
                      : 'text-gray-400 hover:text-white border-transparent hover:border-white/10'
                  }`}
                >
                  <span className="material-symbols-outlined text-[16px]">{icon}</span>
                  {label}
                </button>
              ))}
            </div>

            {/* Tab content */}
            <div>
              {activeTab === 'review'     && <ReviewConsole />}
              {activeTab === 'moderation' && <ModerationDesk />}
              {activeTab === 'analytics'  && <AnalyticsDashboard />}
              {activeTab === 'telemetry'  && <TelemetryPanel />}
              {activeTab === 'roles'      && (
                <div className="glass-panel rounded-bento border border-white/10 p-6">
                  <RoleAssignmentMatrix />
                </div>
              )}
            </div>
          </>
        )}
      </main>
    </>
  );
}
