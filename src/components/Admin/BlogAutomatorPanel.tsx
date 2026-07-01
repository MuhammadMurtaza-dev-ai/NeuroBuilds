import { useState, useEffect, useCallback } from 'react';
import { auth } from '../../Firebase';

const AI_SERVICE =
  (import.meta.env.VITE_AI_SERVICE_URL as string | undefined) ?? 'http://localhost:8000';

interface Job {
  jobId: string;
  topic: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  stage: string;
  draftIteration?: number;
  createdAt?: { _seconds: number } | string;
  critiqueScore?: number;
  blogId?: string;
  error?: string;
  mock?: boolean;
}

interface Prompts {
  writerSystem: string;
  criticSystem: string;
  isCustom: boolean;
  updatedAt?: string | null;
  updatedBy?: string | null;
}

const STATUS_STYLES: Record<string, string> = {
  queued:    'text-yellow-400 border-yellow-600/40 bg-yellow-400/5',
  running:   'text-blue-400  border-blue-600/40  bg-blue-400/5',
  completed: 'text-green-400 border-green-600/40 bg-green-400/5',
  failed:    'text-red-400   border-red-600/40   bg-red-400/5',
};

const STAGE_LABELS: Record<string, string> = {
  queued:      'Queued',
  researching: 'Researching…',
  drafting:    'Drafting…',
  reviewing:   'Reviewing…',
  publishing:  'Publishing…',
  completed:   'Completed',
  failed:      'Failed',
};

function fmtDate(ts: unknown): string {
  if (!ts) return '—';
  if (typeof ts === 'object' && ts !== null && '_seconds' in ts) {
    return new Date((ts as { _seconds: number })._seconds * 1_000).toLocaleString();
  }
  if (typeof ts === 'string') return new Date(ts).toLocaleString();
  return String(ts);
}

async function getIdToken(): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new Error('Not signed in — please refresh the page.');
  return user.getIdToken();
}

export default function BlogAutomatorPanel() {
  // ── Trigger ──────────────────────────────────────────────────────────────
  const [topic, setTopic] = useState('');
  const [mock, setMock] = useState(false);
  const [force, setForce] = useState(false);
  const [triggering, setTriggering] = useState(false);
  const [triggerMsg, setTriggerMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // ── Jobs ─────────────────────────────────────────────────────────────────
  const [jobs, setJobs] = useState<Job[]>([]);
  const [jobsLoading, setJobsLoading] = useState(false);
  const [jobsError, setJobsError] = useState<string | null>(null);

  // ── Prompts ──────────────────────────────────────────────────────────────
  const [prompts, setPrompts] = useState<Prompts | null>(null);
  const [writerDraft, setWriterDraft] = useState('');
  const [criticDraft, setCriticDraft] = useState('');
  const [promptsLoading, setPromptsLoading] = useState(false);
  const [promptsSaving, setPromptsSaving] = useState(false);
  const [promptsMsg, setPromptsMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [promptsDirty, setPromptsDirty] = useState(false);

  // ── Data fetchers ─────────────────────────────────────────────────────────

  const loadJobs = useCallback(async () => {
    setJobsLoading(true);
    setJobsError(null);
    try {
      const token = await getIdToken();
      const resp = await fetch(`${AI_SERVICE}/api/admin/blog-automator/jobs?limit=10`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(12_000),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      setJobs(await resp.json() as Job[]);
    } catch (err) {
      const name = err instanceof Error ? err.name : '';
      if (name === 'TimeoutError' || name === 'AbortError') {
        setJobsError('Could not reach the AI backend — is it running on ' + AI_SERVICE + '?');
      } else {
        setJobsError(err instanceof Error ? err.message : 'Failed to load jobs.');
      }
    } finally {
      setJobsLoading(false);
    }
  }, []);

  const loadPrompts = useCallback(async () => {
    setPromptsLoading(true);
    setPromptsMsg(null);
    try {
      const token = await getIdToken();
      const resp = await fetch(`${AI_SERVICE}/api/admin/blog-automator/prompts`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(12_000),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json() as Prompts;
      setPrompts(data);
      setWriterDraft(data.writerSystem);
      setCriticDraft(data.criticSystem);
      setPromptsDirty(false);
    } catch (err) {
      setPromptsMsg({
        ok: false,
        text: `Failed to load prompts: ${err instanceof Error ? err.message : 'unknown error'}`,
      });
    } finally {
      setPromptsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadJobs();
    loadPrompts();
  }, [loadJobs, loadPrompts]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleTrigger = async () => {
    if (!topic.trim()) return;
    setTriggering(true);
    setTriggerMsg(null);
    try {
      const token = await getIdToken();
      const resp = await fetch(`${AI_SERVICE}/api/admin/blog-automator/trigger`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ topic: topic.trim(), mock, force }),
        signal: AbortSignal.timeout(20_000),
      });
      const data = await resp.json().catch(() => ({})) as { job_id?: string; detail?: string };
      if (!resp.ok) throw new Error(data.detail ?? `Server error ${resp.status}`);
      setTriggerMsg({ ok: true, text: `Queued — Job ID: ${data.job_id ?? '?'}` });
      setTopic('');
      await loadJobs();
    } catch (err) {
      setTriggerMsg({ ok: false, text: err instanceof Error ? err.message : 'Trigger failed.' });
    } finally {
      setTriggering(false);
    }
  };

  const handleSavePrompts = async () => {
    setPromptsSaving(true);
    setPromptsMsg(null);
    try {
      const token = await getIdToken();
      const resp = await fetch(`${AI_SERVICE}/api/admin/blog-automator/prompts`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ writerSystem: writerDraft.trim(), criticSystem: criticDraft.trim() }),
        signal: AbortSignal.timeout(15_000),
      });
      const data = await resp.json().catch(() => ({})) as { message?: string; detail?: string };
      if (!resp.ok) throw new Error(data.detail ?? `Server error ${resp.status}`);
      setPromptsMsg({ ok: true, text: data.message ?? 'Prompts saved.' });
      await loadPrompts();
    } catch (err) {
      setPromptsMsg({ ok: false, text: err instanceof Error ? err.message : 'Save failed.' });
    } finally {
      setPromptsSaving(false);
    }
  };

  const handleResetPrompts = () => {
    if (!prompts) return;
    setWriterDraft(prompts.writerSystem);
    setCriticDraft(prompts.criticSystem);
    setPromptsDirty(false);
    setPromptsMsg(null);
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">

      {/* ── Top row: trigger + recent jobs ───────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Trigger form */}
        <div className="glass-panel rounded-bento border border-white/10 p-4 sm:p-6">
          <div className="flex items-center gap-2 mb-5">
            <span className="material-symbols-outlined text-primary text-[20px]">auto_awesome</span>
            <h2 className="text-base font-bold text-white">Generate Blog Post</h2>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-[10px] font-mono text-gray-500 uppercase tracking-widest mb-1.5">
                Topic
              </label>
              <input
                type="text"
                value={topic}
                onChange={e => setTopic(e.target.value)}
                placeholder="e.g. Best budget GPUs for 1080p gaming in 2025"
                className="w-full bg-bg-dark border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-primary/50 transition-colors"
                onKeyDown={e => { if (e.key === 'Enter' && !triggering) handleTrigger(); }}
              />
            </div>

            {/* Mock toggle */}
            <button
              type="button"
              onClick={() => setMock(m => !m)}
              className="flex items-center gap-3 group"
            >
              <div className={`w-9 h-5 rounded-full relative transition-colors border ${
                mock
                  ? 'bg-accent-purple/30 border-accent-purple/50'
                  : 'bg-white/10 border-white/20'
              }`}>
                <span className={`absolute top-0.5 w-4 h-4 rounded-full transition-transform ${
                  mock ? 'bg-accent-purple translate-x-4' : 'bg-gray-500 translate-x-0.5'
                }`} />
              </div>
              <span className="text-sm text-gray-400 group-hover:text-gray-200 transition-colors">
                Mock mode
                <span className="ml-1.5 text-[10px] text-gray-600 font-mono">(dry-run, no LLM calls)</span>
              </span>
            </button>

            {/* Force override toggle */}
            <button
              type="button"
              onClick={() => setForce(f => !f)}
              className="flex items-center gap-3 group"
            >
              <div className={`w-9 h-5 rounded-full relative transition-colors border ${
                force
                  ? 'bg-red-500/30 border-red-500/50'
                  : 'bg-white/10 border-white/20'
              }`}>
                <span className={`absolute top-0.5 w-4 h-4 rounded-full transition-transform ${
                  force ? 'bg-red-400 translate-x-4' : 'bg-gray-500 translate-x-0.5'
                }`} />
              </div>
              <span className="text-sm text-gray-400 group-hover:text-gray-200 transition-colors">
                Force run
                <span className="ml-1.5 text-[10px] text-gray-600 font-mono">(bypass 12h anti-spam limit)</span>
              </span>
            </button>

            <button
              onClick={handleTrigger}
              disabled={triggering || !topic.trim()}
              className="w-full min-h-11 py-2.5 rounded-xl font-bold text-sm transition-all bg-primary/10 text-primary border border-primary/30 hover:bg-primary/20 hover:shadow-neon disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {triggering ? 'Queuing…' : 'Queue Pipeline'}
            </button>

            {triggerMsg && (
              <p className={`text-xs font-mono ${triggerMsg.ok ? 'text-green-400' : 'text-red-400'}`}>
                {triggerMsg.ok ? '✓ ' : '✗ '}{triggerMsg.text}
              </p>
            )}
          </div>
        </div>

        {/* Recent jobs */}
        <div className="glass-panel rounded-bento border border-white/10 p-4 sm:p-6">
          <div className="flex items-center justify-between gap-3 mb-5">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-primary text-[20px]">history</span>
              <h2 className="text-base font-bold text-white">Recent Jobs</h2>
            </div>
            <button
              onClick={loadJobs}
              disabled={jobsLoading}
              className="min-h-10 px-2 text-[11px] font-mono text-gray-500 hover:text-primary transition-colors disabled:opacity-40"
            >
              {jobsLoading ? 'loading…' : 'refresh'}
            </button>
          </div>

          {jobsLoading && jobs.length === 0 ? (
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-14 rounded-xl bg-white/5 animate-pulse" />
              ))}
            </div>
          ) : jobsError ? (
            <div className="flex items-start gap-2 rounded-xl border border-red-400/20 bg-red-400/5 px-3 py-2.5">
              <span className="material-symbols-outlined text-red-400 text-[16px] mt-0.5 shrink-0">warning</span>
              <p className="text-xs font-mono text-red-400">{jobsError}</p>
            </div>
          ) : jobs.length === 0 ? (
            <p className="text-sm text-gray-600 font-mono">No jobs yet.</p>
          ) : (
            <div className="space-y-2 max-h-72 overflow-y-auto pr-0.5">
              {jobs.map(job => (
                <div key={job.jobId} className="rounded-xl border border-white/5 bg-white/[0.03] p-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm text-white truncate max-w-[70%]">{job.topic}</p>
                    <span className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold border font-mono uppercase ${
                      STATUS_STYLES[job.status] ?? STATUS_STYLES.queued
                    }`}>
                      {job.status}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] font-mono text-gray-600">
                    <span>{fmtDate(job.createdAt)}</span>
                    {job.mock && <span className="text-accent-purple/70">MOCK</span>}
                    {typeof job.critiqueScore === 'number' && (
                      <span>score={job.critiqueScore}</span>
                    )}
                    {job.status === 'running' && job.stage && (
                      <span className="text-primary/70">{STAGE_LABELS[job.stage] ?? job.stage}</span>
                    )}
                    {job.status === 'running' && typeof job.draftIteration === 'number' && (
                      <span>iter={job.draftIteration}</span>
                    )}
                    {job.blogId && (
                      <span className="text-green-400/60">blog={job.blogId.slice(0, 8)}…</span>
                    )}
                    {job.error && (
                      <span className="text-red-400/80 truncate max-w-[160px]" title={job.error}>
                        ⚠ {job.error}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Prompt editor ────────────────────────────────────────────────────── */}
      <div className="glass-panel rounded-bento border border-white/10 p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="material-symbols-outlined text-accent-purple text-[20px]">edit_note</span>
            <h2 className="text-base font-bold text-white">System Prompts</h2>
            {prompts && (
              <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border uppercase ${
                prompts.isCustom
                  ? 'bg-accent-purple/10 border-accent-purple/30 text-accent-purple'
                  : 'bg-white/5 border-white/10 text-gray-500'
              }`}>
                {prompts.isCustom ? 'Custom' : 'Default'}
              </span>
            )}
            {prompts?.isCustom && prompts.updatedAt && (
              <span className="text-[10px] font-mono text-gray-600">
                saved {fmtDate(prompts.updatedAt)}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            {promptsDirty && (
              <button
                onClick={handleResetPrompts}
                className="min-h-10 px-2 text-[11px] font-mono text-gray-500 hover:text-gray-300 transition-colors"
              >
                discard
              </button>
            )}
            <button
              onClick={handleSavePrompts}
              disabled={promptsSaving || !promptsDirty}
              className="min-h-10 px-4 py-1.5 rounded-full text-xs font-bold transition-all bg-accent-purple/10 text-accent-purple border border-accent-purple/30 hover:bg-accent-purple/20 hover:shadow-glow-purple disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {promptsSaving ? 'Saving…' : 'Save Prompts'}
            </button>
          </div>
        </div>

        {promptsLoading ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="h-64 rounded-xl bg-white/5 animate-pulse" />
            <div className="h-64 rounded-xl bg-white/5 animate-pulse" />
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div>
              <label className="block text-[10px] font-mono text-gray-500 uppercase tracking-widest mb-1.5">
                Writer System Prompt
              </label>
              <textarea
                value={writerDraft}
                onChange={e => { setWriterDraft(e.target.value); setPromptsDirty(true); }}
                rows={16}
                spellCheck={false}
                className="w-full bg-bg-dark border border-white/10 rounded-xl px-4 py-3 text-xs font-mono text-gray-200 leading-relaxed resize-y focus:outline-none focus:border-primary/50 transition-colors"
              />
            </div>
            <div>
              <label className="block text-[10px] font-mono text-gray-500 uppercase tracking-widest mb-1.5">
                Critic System Prompt
              </label>
              <textarea
                value={criticDraft}
                onChange={e => { setCriticDraft(e.target.value); setPromptsDirty(true); }}
                rows={16}
                spellCheck={false}
                className="w-full bg-bg-dark border border-white/10 rounded-xl px-4 py-3 text-xs font-mono text-gray-200 leading-relaxed resize-y focus:outline-none focus:border-accent-purple/50 transition-colors"
              />
            </div>
          </div>
        )}

        {promptsMsg && (
          <p className={`mt-3 text-xs font-mono ${promptsMsg.ok ? 'text-green-400' : 'text-red-400'}`}>
            {promptsMsg.ok ? '✓ ' : '✗ '}{promptsMsg.text}
          </p>
        )}

        <p className="mt-4 text-[10px] font-mono text-gray-600">
          Stored in Firestore <code className="text-gray-500">blog_automator_meta/prompts</code>.
          Changes take effect on the next pipeline run. Leave at defaults unless you need to tune tone/SEO requirements.
          To revert to hardcoded defaults, delete the Firestore document.
        </p>
      </div>
    </div>
  );
}
