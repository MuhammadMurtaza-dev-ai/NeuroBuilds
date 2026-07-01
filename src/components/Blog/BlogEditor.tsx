import { useState } from 'react';
import type { BlogPost, BlogPostInput, BlogStatus, AuthorType } from '../../hooks/useBlogCMS';
import { useBlogCMS } from '../../hooks/useBlogCMS';
import { Timestamp } from 'firebase/firestore';
import CyberSelect from '../CyberSelect';
import { uploadImageToImgBB } from '../../utils/imageUploader';

interface BlogEditorProps {
  isAdmin: boolean;
  authorId: string;
  authorName: string;
  editingPost?: BlogPost | null;
  onClose: () => void;
}

const CATEGORIES: BlogPost['category'][] = ['Tutorial', 'Hardware', 'Industry'];

const ADMIN_STATUS_OPTIONS: { value: BlogStatus; label: string }[] = [
  { value: 'draft',          label: 'Draft' },
  { value: 'pending_review', label: 'Submit for Review' },
  { value: 'scheduled',      label: 'Scheduled' },
  { value: 'published',      label: 'Publish Now' },
];

const INPUT_CLS =
  'w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-primary/60 transition-colors';
const LABEL_CLS =
  'block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2';

export default function BlogEditor({
  isAdmin,
  authorId,
  authorName,
  editingPost,
  onClose,
}: BlogEditorProps) {
  const { createBlogPost, updateBlogPost } = useBlogCMS();

  const [form, setForm] = useState({
    title:        editingPost?.title        ?? '',
    thumbnailUrl: editingPost?.thumbnailUrl ?? '',
    category:     (editingPost?.category    ?? 'Hardware') as BlogPost['category'],
    content:      editingPost?.content      ?? '',
    videoUrl:     editingPost?.videoUrl     ?? '',
    // Admins default to 'draft'; regular users always target 'pending_review'
    status:       (editingPost?.status      ?? (isAdmin ? 'draft' : 'pending_review')) as BlogStatus,
    authorType:   (editingPost?.authorType  ?? 'user') as AuthorType,
    publishAt:    editingPost?.publishAt
      ? editingPost.publishAt.toDate().toISOString().slice(0, 16)
      : '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const handleThumbnailUpload = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const url = await uploadImageToImgBB(file);
      setForm((prev) => ({ ...prev, thumbnailUrl: url }));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Image upload failed.');
    } finally {
      setUploading(false);
    }
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  // overrideStatus: when provided, always wins over form.status.
  // Non-admins always end up in 'draft' or 'pending_review' — never 'published'.
  const submit = async (overrideStatus?: BlogStatus) => {
    if (!form.title.trim() || !form.content.trim()) {
      setError('Title and Content are required.');
      return;
    }

    const resolvedStatus: BlogStatus =
      overrideStatus !== undefined
        ? overrideStatus
        : isAdmin
          ? form.status
          : 'pending_review';

    if (isAdmin && resolvedStatus === 'scheduled' && !form.publishAt) {
      setError('A publish date is required for scheduled posts.');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      let publishAt: Timestamp | undefined;
      if (resolvedStatus === 'scheduled' && form.publishAt) {
        publishAt = Timestamp.fromDate(new Date(form.publishAt));
      }

      const payload: BlogPostInput = {
        title:        form.title,
        thumbnailUrl: form.thumbnailUrl,
        category:     form.category,
        content:      form.content,
        authorId,
        authorName,
        isPublished:  resolvedStatus === 'published',
        status:       resolvedStatus,
        authorType:   isAdmin ? form.authorType : 'user',
        ...(form.videoUrl.trim() ? { videoUrl: form.videoUrl.trim() } : {}),
        ...(publishAt ? { publishAt } : {}),
      };

      if (editingPost) {
        // Clear any stale rejection note when the author resubmits for review
        await updateBlogPost(editingPost.id, {
          ...payload,
          ...(resolvedStatus === 'pending_review' ? { rejectionNote: '' } : {}),
        });
      } else {
        await createBlogPost(payload);
      }
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save post.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 backdrop-blur-md p-4">
      <div className="glass-panel rounded-bento w-full max-w-[calc(100vw-1.5rem)] sm:max-w-3xl max-h-[90vh] flex flex-col border border-white/10 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-8 py-4 sm:py-5 border-b border-white/10 shrink-0">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <span className="material-symbols-outlined text-primary">edit_note</span>
            {editingPost
              ? 'Edit Post'
              : isAdmin
                ? 'New Blog Post'
                : 'Write a Post'}
          </h2>
          <button
            onClick={onClose}
            className="size-10 flex items-center justify-center rounded-full text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
            aria-label="Close"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {/* Form body */}
        <div className="overflow-y-auto flex-grow px-4 sm:px-8 py-5 sm:py-6 space-y-5">
          {/* Rejection note — shown when the author is editing a post that was sent back */}
          {!isAdmin && editingPost?.rejectionNote && (
            <div className="px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm flex items-start gap-2">
              <span className="material-symbols-outlined text-[16px] mt-0.5 shrink-0">cancel</span>
              <div>
                <p className="font-bold mb-0.5">Your post was returned by an admin</p>
                <p className="text-red-300/80">{editingPost.rejectionNote}</p>
              </div>
            </div>
          )}

          {/* Pending-review info banner for regular users */}
          {!isAdmin && (
            <div className="px-4 py-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 text-sm flex items-center gap-2">
              <span className="material-symbols-outlined text-[16px] shrink-0">info</span>
              Your post will be reviewed by an admin before it is published.
            </div>
          )}

          {error && (
            <div className="px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
              {error}
            </div>
          )}

          <div>
            <label className={LABEL_CLS}>Title</label>
            <input name="title" value={form.title} onChange={handleChange}
              placeholder="Enter post title…" className={INPUT_CLS} />
          </div>

          <div>
            <label className={LABEL_CLS}>Thumbnail</label>
            <div className="flex flex-col sm:flex-row sm:items-start gap-4">
              {form.thumbnailUrl ? (
                <div className="relative shrink-0">
                  <img
                    src={form.thumbnailUrl}
                    alt="Thumbnail preview"
                    className="w-28 h-28 object-cover rounded-lg border border-white/10"
                  />
                  <button
                    type="button"
                    onClick={() => setForm((prev) => ({ ...prev, thumbnailUrl: '' }))}
                    className="absolute -top-2 -right-2 size-8 flex items-center justify-center rounded-full bg-red-500/90 text-white hover:bg-red-500 transition-colors"
                    aria-label="Remove thumbnail"
                  >
                    <span className="material-symbols-outlined text-[16px]">close</span>
                  </button>
                </div>
              ) : (
                <label
                  className={`w-28 h-28 shrink-0 flex flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-white/20 cursor-pointer hover:border-primary/60 transition-colors text-gray-500 ${uploading ? 'pointer-events-none opacity-60' : ''}`}
                >
                  <span className="material-symbols-outlined">
                    {uploading ? 'progress_activity' : 'add_photo_alternate'}
                  </span>
                  <span className="text-xs font-bold uppercase tracking-wider">
                    {uploading ? 'Uploading…' : 'Upload'}
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleThumbnailUpload}
                    disabled={uploading}
                    className="hidden"
                  />
                </label>
              )}
              <div className="flex-grow">
                <input name="thumbnailUrl" value={form.thumbnailUrl} onChange={handleChange}
                  placeholder="…or paste an image URL" className={INPUT_CLS} />
                <p className="text-xs text-gray-600 mt-2">
                  Upload from your device (via ImgBB) or paste a direct image URL.
                </p>
              </div>
            </div>
          </div>

          {/* Category is useful for all authors; AuthorType is admin-only */}
          <div className={isAdmin ? 'grid grid-cols-1 sm:grid-cols-2 gap-4' : ''}>
            <div>
              <label className={LABEL_CLS}>Category</label>
              <CyberSelect
                value={form.category}
                onChange={v => setForm(prev => ({ ...prev, category: v as BlogPost['category'] }))}
                options={CATEGORIES.map(cat => ({ value: cat, label: cat }))}
                className="w-full"
              />
            </div>
            {isAdmin && (
              <div>
                <label className={LABEL_CLS}>Author Type</label>
                <CyberSelect
                  value={form.authorType}
                  onChange={v => setForm(prev => ({ ...prev, authorType: v as AuthorType }))}
                  options={[
                    { value: 'user', label: 'Human Author' },
                    { value: 'ai_agent', label: 'AI Agent' },
                  ]}
                  className="w-full"
                />
              </div>
            )}
          </div>

          <div>
            <label className={LABEL_CLS}>
              Video URL <span className="normal-case text-gray-600 font-normal">(YouTube — optional)</span>
            </label>
            <input name="videoUrl" value={form.videoUrl} onChange={handleChange}
              placeholder="https://youtube.com/watch?v=…" className={INPUT_CLS} />
          </div>

          {/* Status + Publish At — admin-only controls */}
          {isAdmin && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={LABEL_CLS}>Status</label>
                <CyberSelect
                  value={form.status}
                  onChange={v => setForm(prev => ({ ...prev, status: v as BlogStatus }))}
                  options={ADMIN_STATUS_OPTIONS.map(opt => ({ value: opt.value, label: opt.label }))}
                  className="w-full"
                />
              </div>
              {form.status === 'scheduled' && (
                <div>
                  <label className={LABEL_CLS}>Publish At</label>
                  <input type="datetime-local" name="publishAt" value={form.publishAt}
                    onChange={handleChange} className={INPUT_CLS} />
                </div>
              )}
            </div>
          )}

          <div>
            <label className={LABEL_CLS}>
              Content <span className="normal-case text-gray-600 font-normal">(Markdown supported)</span>
            </label>
            <textarea
              name="content"
              value={form.content}
              onChange={handleChange}
              rows={16}
              placeholder="Write your article in Markdown…"
              className={`${INPUT_CLS} resize-none font-mono text-sm leading-relaxed`}
            />
          </div>
        </div>

        {/* Footer actions */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-end gap-3 px-4 sm:px-8 py-4 sm:py-5 border-t border-white/10 shrink-0">
          <button
            onClick={onClose}
            disabled={saving}
            className="min-h-11 px-5 py-2 bg-white/5 hover:bg-white/10 border border-white/10 text-white rounded-full transition-all text-sm font-bold disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={() => submit('draft')}
            disabled={saving || uploading}
            className="min-h-11 px-5 py-2 bg-accent-purple/10 hover:bg-accent-purple/20 border border-accent-purple/30 text-accent-purple rounded-full transition-all text-sm font-bold disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <span className="material-symbols-outlined text-[16px]">save</span>
            {saving ? 'Saving…' : 'Save Draft'}
          </button>
          {isAdmin ? (
            <button
              onClick={() => submit()}
              disabled={saving || uploading}
              className="min-h-11 px-5 py-2 bg-primary/10 hover:bg-primary/20 border border-primary/30 text-primary rounded-full transition-all text-sm font-bold disabled:opacity-50 flex items-center justify-center gap-2 shadow-neon"
            >
              <span className="material-symbols-outlined text-[16px]">publish</span>
              {saving ? 'Saving…' : 'Save Post'}
            </button>
          ) : (
            <button
              onClick={() => submit('pending_review')}
              disabled={saving || uploading}
              className="min-h-11 px-5 py-2 bg-primary/10 hover:bg-primary/20 border border-primary/30 text-primary rounded-full transition-all text-sm font-bold disabled:opacity-50 flex items-center justify-center gap-2 shadow-neon"
            >
              <span className="material-symbols-outlined text-[16px]">send</span>
              {saving ? 'Submitting…' : 'Submit for Review'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
