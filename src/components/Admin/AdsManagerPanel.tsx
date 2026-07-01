import { useState, useMemo, useRef } from 'react'
import CyberSelect from '../CyberSelect'
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore'
import { db } from '../../Firebase'
import { useAllAdvertisements, isFeaturedActive } from '../../hooks/useAdvertisements'
import type { Advertisement } from '../../hooks/useAdvertisements'
import { uploadImageToImgBB } from '../../utils/imageUploader'

const FEATURE_DURATIONS = [7, 14, 30]

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
}

type FormState = typeof EMPTY_FORM

export default function AdsManagerPanel() {
  const { ads, loading } = useAllAdvertisements()
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [error, setError] = useState('')

  // Image upload state (separate from FormState — not persisted directly)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string>('')
  const [imgUploading, setImgUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Search & Feature panel
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  function resetImageState() {
    if (imagePreview && imagePreview.startsWith('blob:')) URL.revokeObjectURL(imagePreview)
    setImageFile(null)
    setImagePreview('')
  }

  function openNew() {
    setEditingId(null)
    setForm(EMPTY_FORM)
    resetImageState()
    setFormOpen(true)
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
    })
    // Show existing image as preview without re-uploading
    if (imagePreview.startsWith('blob:')) URL.revokeObjectURL(imagePreview)
    setImageFile(null)
    setImagePreview(ad.imageUrl ?? '')
    setFormOpen(true)
    setError('')
  }

  function cancelEdit() {
    setEditingId(null)
    setForm(EMPTY_FORM)
    resetImageState()
    setFormOpen(false)
    setError('')
  }

  function handleImagePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (imagePreview.startsWith('blob:')) URL.revokeObjectURL(imagePreview)
    setImageFile(file)
    setImagePreview(URL.createObjectURL(file))
    e.target.value = ''
  }

  function removeImage() {
    resetImageState()
    setForm(f => ({ ...f, imageUrl: '' }))
  }

  async function save() {
    if (!form.sponsorName.trim() || !form.tagline.trim() || !form.targetUrl.trim()) {
      setError('Sponsor name, tagline, and target URL are required.')
      return
    }
    setSaving(true)
    setError('')
    try {
      let resolvedImageUrl = form.imageUrl.trim()

      if (imageFile) {
        setImgUploading(true)
        try {
          resolvedImageUrl = await uploadImageToImgBB(imageFile)
        } catch {
          setError('Image upload failed. Check VITE_IMGBB_API_KEY and try again.')
          setSaving(false)
          setImgUploading(false)
          return
        }
        setImgUploading(false)
      }

      const payload = {
        sponsorName: form.sponsorName.trim(),
        title: form.tagline.trim(),
        tagline: form.tagline.trim(),
        targetUrl: form.targetUrl.trim(),
        imageUrl: resolvedImageUrl,
        placement: form.placement,
        accent: form.accent,
        status: form.status,
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
      setImgUploading(false)
    }
  }

  async function toggleStatus(ad: Advertisement) {
    await updateDoc(doc(db, 'advertisements', ad.id), {
      status: ad.status === 'active' ? 'inactive' : 'active',
    })
  }

  // Featuring always sets a fixed 7/14/30-day run (`days` required to turn on);
  // unfeaturing clears the window. Expiry is enforced client-side via
  // isFeaturedActive() — no backend sweep needed for this scope.
  async function toggleFeatured(ad: Advertisement, days?: number) {
    if (ad.featured) {
      await updateDoc(doc(db, 'advertisements', ad.id), { featured: false, featuredUntil: null })
    } else {
      await updateDoc(doc(db, 'advertisements', ad.id), {
        featured: true,
        featuredUntil: Timestamp.fromDate(new Date(Date.now() + (days ?? 7) * 86_400_000)),
      })
    }
  }

  async function deleteAd(id: string) {
    await deleteDoc(doc(db, 'advertisements', id))
    setConfirmDelete(null)
  }

  const placementLabel = (p: string) =>
    PLACEMENTS.find(pl => pl.value === p)?.label ?? p

  // Search results across all ads (by ID, sponsor, tagline)
  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return []
    return ads.filter(a =>
      a.id.toLowerCase().includes(q) ||
      a.sponsorName.toLowerCase().includes(q) ||
      (a.tagline ?? a.title ?? '').toLowerCase().includes(q),
    )
  }, [ads, searchQuery])

  // Group by placement; marketplace_grid split into featured / standard
  const grouped = PLACEMENTS.map(pl => ({
    ...pl,
    ads: ads.filter(a => a.placement === pl.value),
  })).filter(g => g.ads.length > 0 || (formOpen && g.value === form.placement))

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
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setSearchOpen(v => !v); setSearchQuery('') }}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-bold transition-colors ${
              searchOpen
                ? 'bg-accent-purple/10 border-accent-purple/30 text-accent-purple'
                : 'bg-white/5 border-white/10 text-gray-400 hover:text-white'
            }`}
          >
            <span className="material-symbols-outlined text-[16px]">search</span>
            Search & Feature
          </button>
          <button
            onClick={openNew}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary/10 border border-primary/30 text-primary text-sm font-bold hover:bg-primary/20 transition-colors"
          >
            <span className="material-symbols-outlined text-[16px]">add</span>
            New Ad
          </button>
        </div>
      </div>

      {/* Search & Feature panel */}
      {searchOpen && (
        <div className="glass-panel rounded-bento border border-accent-purple/20 p-5 space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <span className="material-symbols-outlined text-accent-purple text-[18px]">star</span>
            <h3 className="text-sm font-bold text-accent-purple font-mono uppercase tracking-widest">
              Search & Feature
            </h3>
            <span className="text-[10px] font-mono text-gray-600 ml-1">
              search by ad ID, sponsor name, or tagline
            </span>
          </div>

          <div className="relative">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-[16px]">
              search
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Paste ad ID or type sponsor name…"
              className="w-full pl-9 pr-4 py-2.5 bg-black/40 border border-white/10 rounded-xl text-sm text-white placeholder-gray-600 focus:outline-none focus:border-accent-purple/50 font-mono transition-colors"
              autoFocus
            />
          </div>

          {searchQuery.trim() && (
            searchResults.length === 0 ? (
              <p className="text-xs text-gray-600 font-mono py-2 text-center">
                No ads match "{searchQuery.trim()}"
              </p>
            ) : (
              <div className="space-y-2">
                {searchResults.map(ad => (
                  <div
                    key={ad.id}
                    className="flex items-center gap-3 rounded-xl border border-white/8 px-4 py-3 bg-white/2"
                  >
                    {/* Status dot */}
                    <div className={`w-2 h-2 rounded-full shrink-0 ${ad.status === 'active' ? 'bg-green-400' : 'bg-gray-600'}`} />

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm font-semibold truncate">{ad.sponsorName}</p>
                      <p className="text-[10px] font-mono text-gray-600 truncate">{ad.id}</p>
                    </div>

                    {/* Placement badge */}
                    <span className="hidden sm:block text-[10px] font-mono text-gray-500 shrink-0 px-2 py-0.5 rounded border border-white/8">
                      {placementLabel(ad.placement)}
                    </span>

                    {/* Featured toggle — prominent */}
                    <FeaturedControl ad={ad} onToggleFeatured={toggleFeatured} />

                    {/* Edit shortcut */}
                    <button
                      onClick={() => { openEdit(ad); setSearchOpen(false) }}
                      title="Edit"
                      className="p-1.5 rounded-lg border border-white/10 text-gray-400 hover:text-white transition-colors shrink-0"
                    >
                      <span className="material-symbols-outlined text-[15px]">edit</span>
                    </button>
                  </div>
                ))}
              </div>
            )
          )}
        </div>
      )}

      {/* Create / Edit form */}
      {formOpen && (
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

            <Field label="Ad Image">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleImagePick}
              />
              {imagePreview ? (
                <div className="relative w-full aspect-video rounded-xl overflow-hidden bg-black/40 border border-white/10 group">
                  <img src={imagePreview} alt="preview" className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={removeImage}
                    className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/70 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500/80"
                    title="Remove image"
                  >
                    <span className="material-symbols-outlined text-white text-[14px]">close</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="absolute bottom-2 right-2 flex items-center gap-1 px-2 py-1 rounded bg-black/70 text-[11px] text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity hover:text-white"
                  >
                    <span className="material-symbols-outlined text-[13px]">upload</span>
                    Replace
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full aspect-video rounded-xl border border-dashed border-white/15 flex flex-col items-center justify-center gap-2 hover:border-primary/40 hover:bg-primary/5 transition-all text-gray-500 hover:text-gray-300"
                >
                  <span className="material-symbols-outlined text-3xl">add_photo_alternate</span>
                  <span className="text-xs font-mono">Click to upload image</span>
                  <span className="text-[10px] text-gray-600">Leave empty for icon fallback</span>
                </button>
              )}
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

          <p className="text-xs text-gray-600 font-mono">
            To feature this ad in the Marketplace Grid, save it first, then use "Search &amp; Feature" above
            with its ad ID to set a 7/14/30-day featured run.
          </p>

          {error && (
            <p className="text-red-400 text-xs font-mono">{error}</p>
          )}

          <div className="flex gap-3">
            <button
              onClick={save}
              disabled={saving || imgUploading}
              className="px-5 py-2 rounded-lg bg-primary/10 border border-primary/30 text-primary text-sm font-bold hover:bg-primary/20 transition-colors disabled:opacity-40"
            >
              {imgUploading ? 'Uploading image…' : saving ? 'Saving…' : editingId ? 'Save Changes' : 'Create Ad'}
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
          {grouped.map(group => {
            const isMarketplace = group.value === 'marketplace_grid'
            const featuredAds = isMarketplace ? group.ads.filter(isFeaturedActive) : []
            const standardAds = isMarketplace ? group.ads.filter(a => !isFeaturedActive(a)) : group.ads

            return (
              <div key={group.value}>
                {/* Section header */}
                <div className="flex items-center gap-3 mb-3 px-1">
                  <p className="text-xs font-mono text-gray-500 uppercase tracking-widest">
                    {group.label}
                  </p>
                  {isMarketplace && (
                    <span className="text-[10px] font-mono text-gray-700">
                      {featuredAds.length} featured · {standardAds.length} standard
                    </span>
                  )}
                </div>

                {isMarketplace ? (
                  <div className="space-y-4">
                    {/* Featured subsection */}
                    {(featuredAds.length > 0) && (
                      <div>
                        <div className="flex items-center gap-2 mb-2 px-1">
                          <span className="material-symbols-outlined text-amber-400 text-[14px]" style={{ fontVariationSettings: "'FILL' 1" }}>star</span>
                          <span className="text-[10px] font-mono text-amber-400/70 uppercase tracking-widest">Featured — top block</span>
                        </div>
                        <div className="space-y-2">
                          {featuredAds.map(ad => <AdRow key={ad.id} ad={ad} placementLabel={placementLabel} onEdit={openEdit} onToggleStatus={toggleStatus} onToggleFeatured={toggleFeatured} onDelete={id => setConfirmDelete(id)} confirmDelete={confirmDelete} onDeleteConfirm={deleteAd} onDeleteCancel={() => setConfirmDelete(null)} />)}
                        </div>
                      </div>
                    )}

                    {/* Standard subsection */}
                    {(standardAds.length > 0) && (
                      <div>
                        <div className="flex items-center gap-2 mb-2 px-1">
                          <span className="text-[10px] font-mono text-gray-600 uppercase tracking-widest">Standard</span>
                        </div>
                        <div className="space-y-2">
                          {standardAds.map(ad => <AdRow key={ad.id} ad={ad} placementLabel={placementLabel} onEdit={openEdit} onToggleStatus={toggleStatus} onToggleFeatured={toggleFeatured} onDelete={id => setConfirmDelete(id)} confirmDelete={confirmDelete} onDeleteConfirm={deleteAd} onDeleteCancel={() => setConfirmDelete(null)} />)}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {group.ads.map(ad => <AdRow key={ad.id} ad={ad} placementLabel={placementLabel} onEdit={openEdit} onToggleStatus={toggleStatus} onToggleFeatured={toggleFeatured} onDelete={id => setConfirmDelete(id)} confirmDelete={confirmDelete} onDeleteConfirm={deleteAd} onDeleteCancel={() => setConfirmDelete(null)} />)}
                  </div>
                )}
              </div>
            )
          })}
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

// ─── Feature toggle with a 7/14/30-day duration picker ───────────────────────
// Not featured: pick a duration, then click Feature to write featured:true +
// featuredUntil. Featured: shows the expiry date; click again to unfeature.

function FeaturedControl({
  ad,
  onToggleFeatured,
  compact = false,
}: {
  ad: Advertisement
  onToggleFeatured: (ad: Advertisement, days?: number) => void
  compact?: boolean
}) {
  const [days, setDays] = useState(7)
  const active = isFeaturedActive(ad)

  if (active) {
    return (
      <div className="flex items-center gap-1.5 shrink-0">
        {ad.featuredUntil && !compact && (
          <span className="text-[10px] font-mono text-amber-400/70 whitespace-nowrap">
            until {ad.featuredUntil.toDate().toLocaleDateString()}
          </span>
        )}
        <button
          onClick={() => onToggleFeatured(ad)}
          title={ad.featuredUntil ? `Featured until ${ad.featuredUntil.toDate().toLocaleDateString()} — click to unfeature` : 'Unfeature this ad'}
          className={`flex items-center gap-1.5 rounded-lg border text-xs font-bold font-mono transition-colors text-amber-300 border-amber-400/30 bg-amber-400/10 hover:bg-amber-400/20 ${compact ? 'p-1.5' : 'px-3 py-1.5'}`}
        >
          <span className="material-symbols-outlined text-[15px]" style={{ fontVariationSettings: "'FILL' 1" }}>star</span>
          {!compact && 'Featured'}
        </button>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-1.5 shrink-0">
      <select
        value={days}
        onChange={e => setDays(Number(e.target.value))}
        title="Feature duration"
        className="bg-black/40 border border-white/10 rounded-lg text-[11px] font-mono text-gray-300 px-1.5 py-1.5 focus:outline-none focus:border-amber-400/40"
      >
        {FEATURE_DURATIONS.map(d => (
          <option key={d} value={d}>{d}d</option>
        ))}
      </select>
      <button
        onClick={() => onToggleFeatured(ad, days)}
        title="Feature this ad"
        className={`flex items-center gap-1.5 rounded-lg border text-xs font-bold font-mono transition-colors text-gray-500 border-white/10 hover:text-amber-300 hover:border-amber-400/30 hover:bg-amber-400/5 ${compact ? 'p-1.5' : 'px-3 py-1.5'}`}
      >
        <span className="material-symbols-outlined text-[15px]" style={{ fontVariationSettings: "'FILL' 0" }}>star</span>
        {!compact && 'Feature'}
      </button>
    </div>
  )
}

// ─── Extracted ad row so marketplace split doesn't duplicate JSX ─────────────

interface AdRowProps {
  ad: Advertisement
  placementLabel: (p: string) => string
  onEdit: (ad: Advertisement) => void
  onToggleStatus: (ad: Advertisement) => void
  onToggleFeatured: (ad: Advertisement, days?: number) => void
  onDelete: (id: string) => void
  confirmDelete: string | null
  onDeleteConfirm: (id: string) => void
  onDeleteCancel: () => void
}

function AdRow({ ad, placementLabel, onEdit, onToggleStatus, onToggleFeatured, onDelete, confirmDelete, onDeleteConfirm, onDeleteCancel }: AdRowProps) {
  return (
    <div className="glass-panel rounded-xl border border-white/8 px-4 py-3 flex items-center gap-4">
      {/* Status indicator */}
      <div className={`w-2 h-2 rounded-full shrink-0 ${ad.status === 'active' ? 'bg-green-400' : 'bg-gray-600'}`} />

      {/* Accent chip */}
      <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border shrink-0 ${
        ad.accent === 'purple'
          ? 'text-accent-purple/70 border-accent-purple/30 bg-accent-purple/5'
          : 'text-primary/70 border-primary/30 bg-primary/5'
      }`}>
        {ad.accent}
      </span>

      {/* Featured chip */}
      {isFeaturedActive(ad) && (
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
        <FeaturedControl ad={ad} onToggleFeatured={onToggleFeatured} compact />

        <button
          onClick={() => onToggleStatus(ad)}
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
          onClick={() => onEdit(ad)}
          title="Edit"
          className="p-1.5 rounded-lg border border-white/10 text-gray-400 hover:text-white transition-colors"
        >
          <span className="material-symbols-outlined text-[16px]">edit</span>
        </button>

        {confirmDelete === ad.id ? (
          <div className="flex items-center gap-1">
            <button
              onClick={() => onDeleteConfirm(ad.id)}
              className="px-2 py-1 rounded text-[11px] font-bold text-red-400 border border-red-400/30 hover:bg-red-400/10 transition-colors"
            >
              Confirm
            </button>
            <button
              onClick={onDeleteCancel}
              className="px-2 py-1 rounded text-[11px] text-gray-500 hover:text-white transition-colors"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={() => onDelete(ad.id)}
            title="Delete"
            className="p-1.5 rounded-lg border border-white/10 text-gray-500 hover:text-red-400 hover:border-red-400/20 transition-colors"
          >
            <span className="material-symbols-outlined text-[16px]">delete</span>
          </button>
        )}
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
