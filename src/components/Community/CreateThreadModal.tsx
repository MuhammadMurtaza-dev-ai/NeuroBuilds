import { useState, useRef } from 'react';
import { X, ImagePlus, Loader } from 'lucide-react';
import { COMMUNITY_CATEGORIES, COMMUNITY_COUNTRIES } from '../../hooks/useCommunity';
import type { Thread } from '../../hooks/useCommunity';
import { uploadImageToImgBB } from '../../utils/imageUploader';
import CyberSelect from '../CyberSelect';

const MAX_IMAGES = 4;

interface AvailablePost {
  id: string;
  title: string;
  category: string;
}

interface Props {
  onClose: () => void;
  onSubmit: (
    title: string,
    body: string,
    category: string,
    country: string,
    linkedBlogId?: string,
    linkedBlogTitle?: string,
    images?: string[]
  ) => Promise<void>;
  initialThread?: Pick<Thread, 'title' | 'body' | 'category' | 'country'>;
  availablePosts?: AvailablePost[];
}

const INPUT_CLS =
  'w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-500 focus:border-primary/50 focus:outline-none transition-colors';

export default function CreateThreadModal({ onClose, onSubmit, initialThread, availablePosts }: Props) {
  const isEditMode = !!initialThread;
  const [title, setTitle]               = useState(initialThread?.title ?? '');
  const [body, setBody]                 = useState(initialThread?.body ?? '');
  const [category, setCategory]         = useState(initialThread?.category ?? COMMUNITY_CATEGORIES[0].id);
  const [country, setCountry]           = useState(initialThread?.country ?? COMMUNITY_COUNTRIES[0]);
  const [linkedBlogId, setLinkedBlogId] = useState('');
  const [submitting, setSubmitting]     = useState(false);
  const [error, setError]               = useState<string | null>(null);

  // Image state
  const [imageUrls, setImageUrls]       = useState<string[]>([]);
  const [uploadingImages, setUploadingImages] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const selectedPost = availablePosts?.find((p) => p.id === linkedBlogId);

  const handleImageFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const remaining = MAX_IMAGES - imageUrls.length;
    if (remaining <= 0) return;
    const toUpload = Array.from(files).slice(0, remaining);
    setUploadingImages(true);
    setError(null);
    try {
      const urls = await Promise.all(toUpload.map(f => uploadImageToImgBB(f)));
      setImageUrls(prev => [...prev, ...urls]);
    } catch {
      setError('One or more images failed to upload. Check your ImgBB API key.');
    } finally {
      setUploadingImages(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const removeImage = (index: number) => {
    setImageUrls(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !body.trim()) {
      setError('Title and body are required.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(
        title.trim(),
        body.trim(),
        category,
        country,
        linkedBlogId || undefined,
        selectedPost?.title || undefined,
        imageUrls.length > 0 ? imageUrls : undefined
      );
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to post thread.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      <div className="relative z-10 w-full max-w-[calc(100vw-1.5rem)] sm:max-w-2xl glass-panel rounded-bento border border-white/10 p-4 sm:p-8 shadow-neon max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <span className="material-symbols-outlined text-primary">{isEditMode ? 'edit' : 'post_add'}</span>
            {isEditMode ? 'Edit Thread' : 'New Thread'}
          </h2>
          <button onClick={onClose} className="size-10 flex items-center justify-center rounded-full text-gray-500 hover:text-white hover:bg-white/10 transition-colors" aria-label="Close thread form">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Title */}
          <div>
            <label className="block text-xs font-mono text-gray-400 mb-1.5 uppercase tracking-wider">
              Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What's your thread about?"
              maxLength={200}
              className={INPUT_CLS}
            />
          </div>

          {/* Category + Country row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-mono text-gray-400 mb-1.5 uppercase tracking-wider">
                Category
              </label>
              <CyberSelect
                value={category}
                onChange={setCategory}
                options={COMMUNITY_CATEGORIES.map(c => ({ value: c.id, label: c.name }))}
                className="w-full"
              />
            </div>
            <div>
              <label className="block text-xs font-mono text-gray-400 mb-1.5 uppercase tracking-wider">
                Country
              </label>
              <CyberSelect
                value={country}
                onChange={setCountry}
                options={COMMUNITY_COUNTRIES.map(c => ({ value: c, label: c }))}
                className="w-full"
              />
            </div>
          </div>

          {/* Body */}
          <div>
            <label className="block text-xs font-mono text-gray-400 mb-1.5 uppercase tracking-wider">
              Body
            </label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Share your thoughts, questions, or build details..."
              rows={6}
              className={`${INPUT_CLS} resize-none`}
            />
          </div>

          {/* Image Attachments (new threads only) */}
          {!isEditMode && (
            <div>
              <label className="block text-xs font-mono text-gray-400 mb-1.5 uppercase tracking-wider">
                Images
                <span className="normal-case ml-1 text-gray-600 font-normal">(optional, max {MAX_IMAGES})</span>
              </label>

              {imageUrls.length > 0 && (
                <div className="flex gap-2 mb-3 overflow-x-auto pb-1 snap-x snap-mandatory mask-gradient">
                  {imageUrls.map((url, i) => (
                    <div key={i} className="relative group shrink-0 snap-start">
                      <img
                        src={url}
                        alt={`Upload ${i + 1}`}
                        className="w-20 h-20 object-cover rounded-lg border border-white/10"
                      />
                      <button
                        type="button"
                        onClick={() => removeImage(i)}
                        className="absolute -top-2 -right-2 size-8 bg-red-500 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
                        aria-label="Remove image"
                      >
                        <X size={11} className="text-white" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {imageUrls.length < MAX_IMAGES && (
                <>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={e => handleImageFiles(e.target.files)}
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadingImages}
                    className="min-h-11 flex items-center gap-2 px-4 py-2.5 bg-white/5 border border-white/10 hover:border-primary/40 rounded-xl text-sm text-gray-400 hover:text-white transition-all disabled:opacity-50"
                  >
                    {uploadingImages ? (
                      <><Loader size={15} className="animate-spin" /> Uploading…</>
                    ) : (
                      <><ImagePlus size={15} /> Add Images ({imageUrls.length}/{MAX_IMAGES})</>
                    )}
                  </button>
                </>
              )}
            </div>
          )}

          {/* Link a Blog Post (optional — only shown if posts are available and not in edit mode) */}
          {!isEditMode && availablePosts && availablePosts.length > 0 && (
            <div>
              <label className="block text-xs font-mono text-gray-400 mb-1.5 uppercase tracking-wider">
                Link a Blog Post
                <span className="normal-case ml-1 text-gray-600 font-normal">(optional)</span>
              </label>
              <CyberSelect
                value={linkedBlogId}
                onChange={setLinkedBlogId}
                options={[
                  { value: '', label: '— None —' },
                  ...availablePosts.map(p => ({ value: p.id, label: `[${p.category}] ${p.title}` })),
                ]}
                className="w-full"
              />
              {selectedPost && (
                <div className="mt-2 flex items-center gap-2 px-3 py-2 rounded-lg border border-primary/30 bg-primary/5 text-xs font-mono text-primary">
                  <span className="material-symbols-outlined text-[14px]">link</span>
                  <span className="truncate">Linked: {selectedPost.title}</span>
                  <button
                    type="button"
                    onClick={() => setLinkedBlogId('')}
                    className="ml-auto size-8 flex items-center justify-center rounded-full text-gray-500 hover:text-white hover:bg-white/10 transition-colors"
                    aria-label="Remove linked blog"
                  >
                    <span className="material-symbols-outlined text-[14px]">close</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {error && (
            <p className="text-red-400 text-sm flex items-center gap-2">
              <span className="material-symbols-outlined text-[16px]">error</span>
              {error}
            </p>
          )}

          {/* Actions */}
          <div className="flex flex-col sm:flex-row sm:justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 text-sm glass-panel rounded-xl text-gray-300 hover:text-white hover:bg-white/10 transition-all border border-white/10"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || uploadingImages}
              className="px-6 py-2.5 text-sm bg-primary hover:bg-cyan-300 text-bg-dark font-bold rounded-xl transition-all shadow-[0_0_15px_rgba(13,242,242,0.4)] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting
                ? (isEditMode ? 'Saving...' : 'Posting...')
                : (isEditMode ? 'Save Changes' : 'Post Thread')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
