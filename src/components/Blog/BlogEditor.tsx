import { useState } from 'react';
import type { BlogPost, BlogPostInput, BlogStatus, AuthorType } from '../../hooks/useBlogCMS';
import { useBlogCMS } from '../../hooks/useBlogCMS';
import { Timestamp } from 'firebase/firestore';

interface BlogEditorProps {
  isAdmin: boolean;
  authorId: string;
  authorName: string;
  editingPost?: BlogPost | null;
  onClose: () => void;
}

const CATEGORIES: BlogPost['category'][] = ['Tutorial', 'Hardware', 'Industry'];

const STATUS_OPTIONS: { value: BlogStatus; label: string }[] = [
  { value: 'draft',          label: 'Draft' },
  { value: 'pending_review', label: 'Submit for Review' },
  { value: 'scheduled',      label: 'Scheduled' },
  { value: 'published',      label: 'Publish Now' },
];

const INPUT_CLS =
  'w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-primary/60 transition-colors';
const SELECT_CLS =
  'w-full bg-[#252526] border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-primary/60 transition-colors';
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
    status:       (editingPost?.status      ?? 'draft') as BlogStatus,
    authorType:   (editingPost?.authorType  ?? 'user') as AuthorType,
    publishAt:    editingPost?.publishAt
      ? editingPost.publishAt.toDate().toISOString().slice(0, 16)
      : '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isAdmin) {
    return (
      <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 backdrop-blur-md">
        <div className="glass-panel rounded-bento p-12 max-w-md w-full text-center border border-red-500/30 shadow-[0_0_40px_rgba(239,68,68,0.15)]">
          <span className="material-symbols-outlined text-6xl text-red-400 mb-6 block">
            shield_lock
          </span>
          <h2 className="text-2xl font-bold text-white mb-3 tracking-tight">Access Denied</h2>
          <p className="text-gray-400 mb-2">Administrator Credentials Required</p>
          <p className="text-gray-600 text-sm mb-8">
            This module is restricted to verified platform administrators.
          </p>
          <button
            onClick={onClose}
            className="px-6 py-2 bg-white/5 hover:bg-white/10 border border-white/10 text-white rounded-full transition-all text-sm font-bold"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const submit = async (forceDraft = false) => {
    if (!form.title.trim() || !form.content.trim()) {
      setError('Title and Content are required.');
      return;
    }
    if (form.status === 'scheduled' && !form.publishAt) {
      setError('A publish date is required for scheduled posts.');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const resolvedStatus: BlogStatus = forceDraft ? 'draft' : form.status;

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
        authorType:   form.authorType,
        ...(form.videoUrl.trim() ? { videoUrl: form.videoUrl.trim() } : {}),
        ...(publishAt ? { publishAt } : {}),
      };

      if (editingPost) {
        await updateBlogPost(editingPost.id, payload);
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
      <div className="glass-panel rounded-bento w-full max-w-3xl max-h-[90vh] flex flex-col border border-white/10 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-8 py-5 border-b border-white/10 shrink-0">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <span className="material-symbols-outlined text-primary">edit_note</span>
            {editingPost ? 'Edit Post' : 'New Blog Post'}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
            aria-label="Close"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {/* Form body */}
        <div className="overflow-y-auto flex-grow px-8 py-6 space-y-5">
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
            <label className={LABEL_CLS}>Thumbnail URL</label>
            <input name="thumbnailUrl" value={form.thumbnailUrl} onChange={handleChange}
              placeholder="https://example.com/image.jpg" className={INPUT_CLS} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={LABEL_CLS}>Category</label>
              <select name="category" value={form.category} onChange={handleChange} className={SELECT_CLS}>
                {CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={LABEL_CLS}>Author Type</label>
              <select name="authorType" value={form.authorType} onChange={handleChange} className={SELECT_CLS}>
                <option value="user">Human Author</option>
                <option value="ai_agent">AI Agent</option>
              </select>
            </div>
          </div>

          <div>
            <label className={LABEL_CLS}>
              Video URL <span className="normal-case text-gray-600 font-normal">(YouTube — optional)</span>
            </label>
            <input name="videoUrl" value={form.videoUrl} onChange={handleChange}
              placeholder="https://youtube.com/watch?v=…" className={INPUT_CLS} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={LABEL_CLS}>Status</label>
              <select name="status" value={form.status} onChange={handleChange} className={SELECT_CLS}>
                {STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            {form.status === 'scheduled' && (
              <div>
                <label className={LABEL_CLS}>Publish At</label>
                <input type="datetime-local" name="publishAt" value={form.publishAt}
                  onChange={handleChange} className={INPUT_CLS} />
              </div>
            )}
          </div>

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
        <div className="flex items-center justify-end gap-3 px-8 py-5 border-t border-white/10 shrink-0">
          <button
            onClick={onClose}
            disabled={saving}
            className="px-5 py-2 bg-white/5 hover:bg-white/10 border border-white/10 text-white rounded-full transition-all text-sm font-bold disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={() => submit(true)}
            disabled={saving}
            className="px-5 py-2 bg-accent-purple/10 hover:bg-accent-purple/20 border border-accent-purple/30 text-accent-purple rounded-full transition-all text-sm font-bold disabled:opacity-50 flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-[16px]">save</span>
            {saving ? 'Saving…' : 'Save Draft'}
          </button>
          <button
            onClick={() => submit(false)}
            disabled={saving}
            className="px-5 py-2 bg-primary/10 hover:bg-primary/20 border border-primary/30 text-primary rounded-full transition-all text-sm font-bold disabled:opacity-50 flex items-center gap-2 shadow-neon"
          >
            <span className="material-symbols-outlined text-[16px]">publish</span>
            {saving ? 'Saving…' : 'Save Post'}
          </button>
        </div>
      </div>
    </div>
  );
}
