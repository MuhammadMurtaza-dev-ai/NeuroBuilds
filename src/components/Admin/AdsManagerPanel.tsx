import { useState } from 'react'
import CyberSelect from '../CyberSelect'
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
} from 'firebase/firestore'
import { db } from '../../Firebase'
import { useAllAdvertisements } from '../../hooks/useAdvertisements'
import type { Advertisement } from '../../hooks/useAdvertisements'

const PLACEMENTS = [
  { value: 'banner',           label: 'Homepage Banner' },
  { value: 'homepage_feed',    label: 'Homepage Feed Slot' },
  { value: 'marketplace_grid', label: 'Marketplace Grid' },
  { value: 'listing_card',     label: 'Listing Card (Micro)' },
  { value: 'thread_card',      label: 'Thread Card (Micro)' },
]

const EMPTY_FORM = {
  sponsorName: '',
  tagline: '',
  targetUrl: '',
  imageUrl: '',
  placement: 'banner',
  accent: 'cyan' as 'cyan' | 'purple',
  status: 'active' as 'active' | 'inactive',
  featured: false,
}

type FormState = typeof EMPTY_FORM

export default function AdsManagerPanel() {
  const { ads, loading } = useAllAdvertisements()
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [error, setError] = useState('')

  function openNew() {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setError('')
  }

  function openEdit(ad: Advertisement) {
    setEditingId(ad.id)
    setForm({
      sponsorName: ad.sponsorName,
      tagline: ad.tagline || ad.title,
      targetUrl: ad.targetUrl,
      imageUrl: ad.imageUrl ?? '',
      placement: ad.placement,
      accent: ad.accent,
      status: ad.status,
      featured: ad.featured ?? false,
    })
    setError('')
  }

  function cancelEdit() {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setError('')
  }

  async function save() {
    if (!form.sponsorName.trim() || !form.tagline.trim() || !form.targetUrl.trim()) {
      setError('Sponsor name, tagline, and target URL are required.')
      return
    }
    setSaving(true)
    setError('')
    try {
      const payload = {
        sponsorName: form.sponsorName.trim(),
        title: form.tagline.trim(),
        tagline: form.tagline.trim(),
        targetUrl: form.targetUrl.trim(),
        imageUrl: form.imageUrl.trim(),
        placement: form.placement,
        accent: form.accent,
        status: form.status,
        featured: form.featured,
      }
      if (editingId) {
        await updateDoc(doc(db, 'advertisements', editingId), payload)
      } else {
        await addDoc(collection(db, 'advertisements'), {
          ...payload,
          createdAt: serverTimestamp(),
        })
      }
      cancelEdit()
    } catch {
      setError('Failed to save. Check your connection and try again.')
    } finally {
      setSaving(false)
    }
  }

  async function toggleStatus(ad: Advertisement) {
    await updateDoc(doc(db, 'advertisements', ad.id), {
      status: ad.status === 'active' ? 'inactive' : 'active',
    })
  }

  async function toggleFeatured(ad: Advertisement) {
    await updateDoc(doc(db, 'advertisements', ad.id), {
      featured: !ad.featured,
    })
  }

  async function deleteAd(id: string) {
    await deleteDoc(doc(db, 'advertisements', id))
    setConfirmDelete(null)
  }

  const placementLabel = (p: string) =>
    PLACEMENTS.find(pl => pl.value === p)?.label ?? p

  const grouped = PLACEMENTS.map(pl => ({
    ...pl,
    ads: ads.filter(a => a.placement === pl.value),
  })).filter(g => g.ads.length > 0 || g.value === form.placement)

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight">Ads Manager</h2>
          <p className="text-xs text-gray-500 mt-0.5 font-mono">
            Manage sponsored ad slots across all placements
          </p>
        </div>
        <button
          onClick={openNew}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary/10 border border-primary/30 text-primary text-sm font-bold hover:bg-primary/20 transition-colors"
        >
          <span className="material-symbols-outlined text-[16px]">add</span>
          New Ad
        </button>
      </div>

      {/* Create / Edit form */}
      {(editingId !== null || form !== EMPTY_FORM) && (
        <div className="glass-panel rounded-bento border border-primary/20 p-5 space-y-4">
          <h3 className="text-sm font-bold text-primary font-mono uppercase tracking-widest">
            {editingId ? 'Edit Ad' : 'Create Ad'}
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Sponsor Name *">
              <input
                value={form.sponsorName}
                onChange={e => setForm(f => ({ ...f, sponsorName: e.target.value }))}
                placeholder="e.g. ASUS ROG"
                className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-primary/50 transition-colors"
              />
            </Field>

            <Field label="Tagline *">
              <input
                value={form.tagline}
                onChange={e => setForm(f => ({ ...f, tagline: e.target.value }))}
                placeholder="Short promotional copy"
                className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-primary/50 transition-colors"
              />
            </Field>

            <Field label="Target URL *">
              <input
                value={form.targetUrl}
                onChange={e => setForm(f => ({ ...f, targetUrl: e.target.value }))}
                placeholder="https://..."
                className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-primary/50 transition-colors"
              />
            </Field>

            <Field label="Image URL">
              <input
                value={form.imageUrl}
                onChange={e => setForm(f => ({ ...f, imageUrl: e.target.value }))}
                placeholder="Leave blank for icon fallback"
                className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-primary/50 transition-colors"
              />
            </Field>

            <Field label="Placement">
              <CyberSelect
                value={form.placement}
                onChange={v => setForm(f => ({ ...f, placement: v }))}
                options={PLACEMENTS}
                className="w-full"
              />
            </Field>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Accent">
                <CyberSelect
                  value={form.accent}
                  onChange={v => setForm(f => ({ ...f, accent: v as 'cyan' | 'purple' }))}
                  options={[{ value: 'cyan', label: 'Cyan' }, { value: 'purple', label: 'Purple' }]}
                  className="w-full"
                />
              </Field>
              <Field label="Status">
                <CyberSelect
                  value={form.status}
                  onChange={v => setForm(f => ({ ...f, status: v as 'active' | 'inactive' }))}
                  options={[{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }]}
                  className="w-full"
                />
              </Field>
            </div>
          </div>

          {/* Featured toggle — promotes the ad to the premium top block (Marketplace Grid) */}
          <label className="flex items-center gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={form.featured}
              onChange={e => setForm(f => ({ ...f, featured: e.target.checked }))}
              className="accent-primary w-4 h-4"
            />
            <span className="text-sm text-gray-300">
              Featured
              <span className="text-gray-500 text-xs ml-2 font-mono">
                top block of the Marketplace Grid
              </span>
            </span>
          </label>

          {error && (
            <p className="text-red-400 text-xs font-mono">{error}</p>
          )}

          <div className="flex gap-3">
            <button
              onClick={save}
              disabled={saving}
              className="px-5 py-2 rounded-lg bg-primary/10 border border-primary/30 text-primary text-sm font-bold hover:bg-primary/20 transition-colors disabled:opacity-40"
            >
              {saving ? 'Saving…' : editingId ? 'Save Changes' : 'Create Ad'}
            </button>
            <button
              onClick={cancelEdit}
              className="px-5 py-2 rounded-lg border border-white/10 text-gray-400 text-sm hover:text-white transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Ad list */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-16 rounded-xl bg-white/5 animate-pulse" />
          ))}
        </div>
      ) : ads.length === 0 ? (
        <div className="glass-panel rounded-bento border border-white/10 p-10 text-center">
          <span className="material-symbols-outlined text-gray-600 text-5xl mb-3 block">campaign</span>
          <p className="text-gray-500 text-sm">No ads yet. Create one to get started.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.map(group => (
            <div key={group.value}>
              <p className="text-xs font-mono text-gray-500 uppercase tracking-widest mb-3 px-1">
                {group.label}
              </p>
              <div className="space-y-2">
                {group.ads.map(ad => (
                  <div
                    key={ad.id}
                    className="glass-panel rounded-xl border border-white/8 px-4 py-3 flex items-center gap-4"
                  >
                    {/* Status indicator */}
                    <div
                      className={`w-2 h-2 rounded-full shrink-0 ${
                        ad.status === 'active' ? 'bg-green-400' : 'bg-gray-600'
                      }`}
                    />

                    {/* Accent chip */}
                    <span
                      className={`text-[10px] font-mono px-1.5 py-0.5 rounded border shrink-0 ${
                        ad.accent === 'purple'
                          ? 'text-accent-purple/70 border-accent-purple/30 bg-accent-purple/5'
                          : 'text-primary/70 border-primary/30 bg-primary/5'
                      }`}
                    >
                      {ad.accent}
                    </span>

                    {/* Featured chip */}
                    {ad.featured && (
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded border shrink-0 text-amber-300/80 border-amber-400/30 bg-amber-400/5">
                        ★ featured
                      </span>
                    )}

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm font-semibold truncate">{ad.sponsorName}</p>
                      <p className="text-gray-500 text-xs truncate">{ad.tagline || ad.title}</p>
                    </div>

                    {/* Placement badge */}
                    <span className="hidden md:block text-[10px] font-mono text-gray-600 shrink-0">
                      {placementLabel(ad.placement)}
                    </span>

                    {/* Actions */}
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => toggleFeatured(ad)}
                        title={ad.featured ? 'Unfeature' : 'Mark featured'}
                        className={`p-1.5 rounded-lg border transition-colors ${
                          ad.featured
                            ? 'text-amber-300 border-amber-400/30 hover:bg-amber-400/10'
                            : 'text-gray-500 border-white/10 hover:text-white'
                        }`}
                      >
                        <span
                          className="material-symbols-outlined text-[16px]"
                          style={{ fontVariationSettings: ad.featured ? "'FILL' 1" : "'FILL' 0" }}
                        >
                          star
                        </span>
                      </button>

                      <button
                        onClick={() => toggleStatus(ad)}
                        title={ad.status === 'active' ? 'Deactivate' : 'Activate'}
                        className={`p-1.5 rounded-lg border transition-colors ${
                          ad.status === 'active'
                            ? 'text-green-400 border-green-400/20 hover:bg-green-400/10'
                            : 'text-gray-500 border-white/10 hover:text-white'
                        }`}
                      >
                        <span className="material-symbols-outlined text-[16px]">
                          {ad.status === 'active' ? 'toggle_on' : 'toggle_off'}
                        </span>
                      </button>

                      <button
                        onClick={() => openEdit(ad)}
                        title="Edit"
                        className="p-1.5 rounded-lg border border-white/10 text-gray-400 hover:text-white transition-colors"
                      >
                        <span className="material-symbols-outlined text-[16px]">edit</span>
                      </button>

                      {confirmDelete === ad.id ? (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => deleteAd(ad.id)}
                            className="px-2 py-1 rounded text-[11px] font-bold text-red-400 border border-red-400/30 hover:bg-red-400/10 transition-colors"
                          >
                            Confirm
                          </button>
                          <button
                            onClick={() => setConfirmDelete(null)}
                            className="px-2 py-1 rounded text-[11px] text-gray-500 hover:text-white transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmDelete(ad.id)}
                          title="Delete"
                          className="p-1.5 rounded-lg border border-white/10 text-gray-500 hover:text-red-400 hover:border-red-400/20 transition-colors"
                        >
                          <span className="material-symbols-outlined text-[16px]">delete</span>
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Placement guide */}
      <div className="glass-panel rounded-bento border border-white/5 p-4">
        <p className="text-xs font-mono text-gray-600 uppercase tracking-widest mb-3">Placement Guide</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {PLACEMENTS.map(p => (
            <div key={p.value} className="flex items-start gap-2">
              <span className="font-mono text-[10px] text-primary/50 mt-0.5 shrink-0">{p.value}</span>
              <span className="text-xs text-gray-500">{p.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-mono text-gray-400">{label}</label>
      {children}
    </div>
  )
}
