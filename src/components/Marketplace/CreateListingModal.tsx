import { useState, useRef } from 'react';
import { uploadImageToImgBB } from '../../utils/imageUploader';
import { COUNTRY_LIST } from '../../data/globalLocations';
import { useCountry } from '../../context/CountryContext';
import type { Listing } from '../../hooks/useStorage';
import SellerVerificationModal from './SellerVerificationModal';
import LocationSelector from './LocationSelector';
import type { LocationValue } from './LocationSelector';

interface Props {
  onClose: () => void;
  onSubmit: (listing: Omit<Listing, 'id' | 'views' | 'savedBy' | 'postedDate'>) => Promise<void> | void;
  sellerId: string;
  sellerName: string;
  sellerContact: string;
  isVerified: boolean;
  initialListing?: Listing;
}

function parseLocation(locationStr: string): { country: string; city: string; area: string } {
  const parts = locationStr.split(', ');
  if (parts.length >= 3) return { area: parts[0], city: parts[1], country: parts.slice(2).join(', ') };
  if (parts.length === 2) return { area: '', city: parts[0], country: parts[1] };
  return { area: '', city: '', country: locationStr };
}

const CATEGORIES = [
  { id: 'components', name: 'Components' },
  { id: 'laptops', name: 'Laptops' },
  { id: 'peripherals', name: 'Peripherals' },
  { id: 'consoles', name: 'Consoles' },
  { id: 'monitors', name: 'Monitors' },
];

const MAX_IMAGES = 6;

type Condition = 'new' | 'used' | 'refurbished';
type ListingType = 'sell' | 'buy' | 'exchange';

interface FormState {
  title: string;
  description: string;
  price: string;
  negotiable: boolean;
  category: string;
  condition: Condition;
  listingType: ListingType;
  country: string;
  province: string;
  city: string;
  area: string;
  existingImageUrls: string[];
  imageFiles: File[];
  imagePreviews: string[];
  tags: string;
  specKey: string;
  specValue: string;
  specs: Record<string, string>;
}

const INPUT_CLS = 'w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-500 focus:border-primary/50 focus:outline-none';
const SELECT_CLS = 'bg-black/40 border border-white/10 rounded-xl px-3 py-3 text-sm text-white focus:border-primary/50 focus:outline-none cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed';

export default function CreateListingModal({ onClose, onSubmit, sellerId, sellerName, sellerContact, isVerified, initialListing }: Props) {
  const { selectedCountry } = useCountry();
  const isEditMode = !!initialListing;

  const seedFromListing = (listing: Listing): FormState => {
    const loc = parseLocation(listing.location);
    return {
      title: listing.title,
      description: listing.description,
      price: listing.listingType === 'exchange' ? '' : String(listing.price),
      negotiable: listing.negotiable,
      category: listing.category,
      condition: listing.condition,
      listingType: listing.listingType,
      country: loc.country || selectedCountry,
      province: listing.province ?? '',
      city: loc.city,
      area: loc.area,
      existingImageUrls: listing.images,
      imageFiles: [],
      imagePreviews: [],
      tags: listing.tags.join(', '),
      specKey: '',
      specValue: '',
      specs: listing.specs ?? {},
    };
  };

  const [form, setForm] = useState<FormState>(
    initialListing
      ? seedFromListing(initialListing)
      : {
          title: '',
          description: '',
          price: '',
          negotiable: false,
          category: 'components',
          condition: 'used',
          listingType: 'sell',
          country: selectedCountry,
          province: '',
          city: '',
          area: '',
          existingImageUrls: [],
          imageFiles: [],
          imagePreviews: [],
          tags: '',
          specKey: '',
          specValue: '',
          specs: {},
        }
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [showVerifyModal, setShowVerifyModal] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const set = <K extends keyof FormState>(field: K, value: FormState[K]) =>
    setForm(prev => ({ ...prev, [field]: value }));

  const countries = COUNTRY_LIST;

  const handleCountryChange = (country: string) =>
    setForm(prev => ({ ...prev, country, province: '', city: '', area: '' }));

  const handleLocationChange = (loc: LocationValue) =>
    setForm(prev => ({ ...prev, province: loc.province, city: loc.city, area: loc.area }));

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    const remaining = MAX_IMAGES - form.existingImageUrls.length - form.imageFiles.length;
    const toAdd = files.slice(0, remaining);
    const newPreviews = toAdd.map(f => URL.createObjectURL(f));
    setForm(prev => ({
      ...prev,
      imageFiles: [...prev.imageFiles, ...toAdd],
      imagePreviews: [...prev.imagePreviews, ...newPreviews],
    }));
    e.target.value = '';
  };

  const removeExistingImage = (i: number) => {
    setForm(prev => ({
      ...prev,
      existingImageUrls: prev.existingImageUrls.filter((_, idx) => idx !== i),
    }));
  };

  const removeImage = (i: number) => {
    URL.revokeObjectURL(form.imagePreviews[i]);
    setForm(prev => ({
      ...prev,
      imageFiles: prev.imageFiles.filter((_, idx) => idx !== i),
      imagePreviews: prev.imagePreviews.filter((_, idx) => idx !== i),
    }));
  };

  const addSpec = () => {
    const k = form.specKey.trim();
    const v = form.specValue.trim();
    if (!k || !v) return;
    setForm(prev => ({ ...prev, specs: { ...prev.specs, [k]: v }, specKey: '', specValue: '' }));
  };

  const removeSpec = (key: string) => {
    const { [key]: _removed, ...rest } = form.specs;
    set('specs', rest);
  };

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.title.trim()) e.title = 'Title is required';
    if (!form.description.trim()) e.description = 'Description is required';
    if (!form.city) e.location = 'Please select a city';
    if (
      form.listingType !== 'exchange' &&
      (!form.price || isNaN(Number(form.price)) || Number(form.price) < 0)
    ) {
      e.price = 'Enter a valid price';
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setUploading(true);
    setUploadError(null);

    try {
      const newImageUrls: string[] = [];
      for (const file of form.imageFiles) {
        newImageUrls.push(await uploadImageToImgBB(file));
      }

      const locationStr = [form.area, form.city, form.country].filter(Boolean).join(', ');

      await Promise.resolve(onSubmit({
        title: form.title.trim(),
        description: form.description.trim(),
        price: form.listingType === 'exchange' ? 0 : Number(form.price),
        negotiable: form.negotiable,
        category: form.category,
        condition: form.condition,
        listingType: form.listingType,
        images: [...form.existingImageUrls, ...newImageUrls],
        country: form.country,
        province: form.province || undefined,
        location: locationStr,
        sellerId,
        sellerName,
        sellerContact,
        status: 'active',
        tags: form.tags.split(',').map(t => t.trim()).filter(Boolean),
        specs: form.specs,
      }));

      form.imagePreviews.forEach(url => URL.revokeObjectURL(url));
      onClose();
    } catch {
      setUploadError('Failed to save listing. Check your connection and try again.');
    } finally {
      setUploading(false);
    }
  };

  const handleClose = () => {
    form.imagePreviews.forEach(url => URL.revokeObjectURL(url));
    onClose();
  };

  return (
    <>
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) handleClose(); }}
    >
      <div className="glass-panel rounded-[2rem] border border-white/10 w-full max-w-2xl max-h-[90vh] overflow-y-auto">

        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-white/5 sticky top-0 bg-bg-panel/90 backdrop-blur-md z-10 rounded-t-[2rem]">
          <div className="flex items-center gap-3">
              <h2 className="font-bold text-xl">{isEditMode ? 'Edit Listing' : 'Post a Listing'}</h2>
              {isVerified && (
                <span className="flex items-center gap-1 text-xs font-semibold text-emerald-400 bg-emerald-400/10 border border-emerald-400/30 rounded-full px-2.5 py-1">
                  <span className="material-symbols-outlined text-xs leading-none">verified</span>
                  Verified Seller
                </span>
              )}
            </div>
          <button onClick={handleClose} className="p-2 rounded-full hover:bg-white/10 transition-colors">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="p-6 flex flex-col gap-5 relative">

          {/* Verification gate — overlays all form inputs when seller is unverified (skip in edit mode) */}
          {!isVerified && !isEditMode && (
            <div className="absolute inset-0 z-10 backdrop-blur-sm bg-bg-dark/70 flex items-center justify-center rounded-b-[2rem]">
              <div className="glass-panel border border-amber-500/20 rounded-2xl p-8 flex flex-col items-center gap-4 text-center mx-6 shadow-[0_0_30px_rgba(245,158,11,0.08)]">
                <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
                  <span className="material-symbols-outlined text-4xl text-amber-400">security</span>
                </div>
                <div>
                  <h3 className="font-bold text-lg mb-1">Seller Verification Required</h3>
                  <p className="text-gray-400 text-sm max-w-xs leading-relaxed">
                    Verify your phone number to unlock listing creation and build buyer trust.
                  </p>
                </div>
                <button
                  onClick={() => setShowVerifyModal(true)}
                  className="px-6 py-3 bg-primary text-bg-dark font-bold rounded-xl text-sm hover:bg-cyan-300 transition-all shadow-[0_0_15px_rgba(13,242,242,0.3)] flex items-center gap-2"
                >
                  <span className="material-symbols-outlined text-base leading-none">phone_iphone</span>
                  Verify Phone Number
                </button>
              </div>
            </div>
          )}

          {/* Listing Type */}
          <div>
            <label className="text-sm text-gray-400 mb-2 block">Listing Type</label>
            <div className="flex gap-2">
              {(['sell', 'buy', 'exchange'] as const).map(type => (
                <button
                  key={type}
                  onClick={() => set('listingType', type)}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-medium capitalize transition-all ${form.listingType === type ? 'bg-primary text-bg-dark' : 'bg-white/5 text-gray-300 hover:bg-white/10'}`}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>

          {/* Title */}
          <div>
            <label className="text-sm text-gray-400 mb-2 block">Title *</label>
            <input
              type="text"
              value={form.title}
              onChange={e => set('title', e.target.value)}
              placeholder="e.g. NVIDIA RTX 4090 — Lightly Used"
              className={INPUT_CLS}
            />
            {errors.title && <p className="text-red-400 text-xs mt-1">{errors.title}</p>}
          </div>

          {/* Category & Condition */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-gray-400 mb-2 block">Category</label>
              <select
                value={form.category}
                onChange={e => set('category', e.target.value)}
                className={`w-full ${SELECT_CLS}`}
              >
                {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-sm text-gray-400 mb-2 block">Condition</label>
              <select
                value={form.condition}
                onChange={e => set('condition', e.target.value as Condition)}
                className={`w-full ${SELECT_CLS}`}
              >
                <option value="new">New</option>
                <option value="used">Used</option>
                <option value="refurbished">Refurbished</option>
              </select>
            </div>
          </div>

          {/* Price */}
          {form.listingType !== 'exchange' && (
            <div>
              <label className="text-sm text-gray-400 mb-2 block">Price (PKR) *</label>
              <div className="flex gap-3">
                <div className="flex-1 flex items-center bg-black/40 border border-white/10 rounded-xl overflow-hidden focus-within:border-primary/50 transition-colors">
                  <span className="px-3 text-sm text-gray-400 shrink-0 border-r border-white/10 py-3">Rs.</span>
                  <input
                    type="number"
                    value={form.price}
                    onChange={e => set('price', e.target.value)}
                    placeholder="e.g. 150000"
                    min="0"
                    className="flex-1 bg-transparent px-3 py-3 text-sm text-white placeholder-gray-500 focus:outline-none"
                  />
                </div>
                <label className="flex items-center gap-2 px-4 py-3 bg-black/40 border border-white/10 rounded-xl cursor-pointer hover:border-primary/30 transition-colors shrink-0">
                  <input
                    type="checkbox"
                    checked={form.negotiable}
                    onChange={e => set('negotiable', e.target.checked)}
                    className="accent-primary"
                  />
                  <span className="text-sm text-gray-300">Negotiable</span>
                </label>
              </div>
              {errors.price && <p className="text-red-400 text-xs mt-1">{errors.price}</p>}
            </div>
          )}

          {/* Location — country selector + cascading Province/City/Area */}
          <div>
            <label className="text-sm text-gray-400 mb-2 block">Location *</label>

            {/* Country */}
            <select
              value={form.country}
              onChange={e => handleCountryChange(e.target.value)}
              className={`${SELECT_CLS} w-full mb-3`}
            >
              <option value="">Select Country</option>
              {countries.map(c => <option key={c} value={c}>{c}</option>)}
            </select>

            {/* Province → City → Area (cascading, country-aware) */}
            {form.country && (
              <LocationSelector
                country={form.country}
                value={{ province: form.province, city: form.city, area: form.area }}
                onChange={handleLocationChange}
                selectClassName={SELECT_CLS}
              />
            )}

            {errors.location && <p className="text-red-400 text-xs mt-1">{errors.location}</p>}
          </div>

          {/* Description */}
          <div>
            <label className="text-sm text-gray-400 mb-2 block">Description *</label>
            <textarea
              value={form.description}
              onChange={e => set('description', e.target.value)}
              placeholder="Describe your item — condition, usage history, included accessories..."
              rows={4}
              className={`${INPUT_CLS} resize-none`}
            />
            {errors.description && <p className="text-red-400 text-xs mt-1">{errors.description}</p>}
          </div>

          {/* Photos — file upload */}
          <div>
            <label className="text-sm text-gray-400 mb-2 block">
              Photos <span className="text-gray-600">({form.existingImageUrls.length + form.imageFiles.length}/{MAX_IMAGES})</span>
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleFileChange}
              className="hidden"
            />
            <div className="flex flex-wrap gap-2">
              {form.existingImageUrls.map((url, i) => (
                <div key={`existing-${i}`} className="relative w-20 h-16 rounded-lg overflow-hidden border border-white/10 group/img">
                  <img src={url} alt="" className="w-full h-full object-cover" />
                  <button
                    onClick={() => removeExistingImage(i)}
                    className="absolute inset-0 bg-black/70 opacity-0 group-hover/img:opacity-100 flex items-center justify-center transition-opacity"
                  >
                    <span className="material-symbols-outlined text-white text-sm">close</span>
                  </button>
                </div>
              ))}
              {form.imagePreviews.map((preview, i) => (
                <div key={`new-${i}`} className="relative w-20 h-16 rounded-lg overflow-hidden border border-primary/30 group/img">
                  <img src={preview} alt="" className="w-full h-full object-cover" />
                  <button
                    onClick={() => removeImage(i)}
                    className="absolute inset-0 bg-black/70 opacity-0 group-hover/img:opacity-100 flex items-center justify-center transition-opacity"
                  >
                    <span className="material-symbols-outlined text-white text-sm">close</span>
                  </button>
                </div>
              ))}
              {form.existingImageUrls.length + form.imageFiles.length < MAX_IMAGES && (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-20 h-16 rounded-lg border border-dashed border-white/20 flex flex-col items-center justify-center gap-1 hover:border-primary/50 hover:bg-primary/5 transition-all"
                >
                  <span className="material-symbols-outlined text-gray-400 text-xl leading-none">add_photo_alternate</span>
                  <span className="text-gray-500 text-[10px]">Add photo</span>
                </button>
              )}
            </div>
          </div>

          {/* Tags */}
          <div>
            <label className="text-sm text-gray-400 mb-2 block">Tags <span className="text-gray-600">(comma-separated)</span></label>
            <input
              type="text"
              value={form.tags}
              onChange={e => set('tags', e.target.value)}
              placeholder="e.g. GPU, NVIDIA, Gaming"
              className={INPUT_CLS}
            />
          </div>

          {/* Specs */}
          <div>
            <label className="text-sm text-gray-400 mb-2 block">Specifications <span className="text-gray-600">(optional)</span></label>
            <div className="flex gap-2 mb-2">
              <input
                type="text"
                value={form.specKey}
                onChange={e => set('specKey', e.target.value)}
                placeholder="Label (e.g. VRAM)"
                className="flex-1 bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:border-primary/50 focus:outline-none"
              />
              <input
                type="text"
                value={form.specValue}
                onChange={e => set('specValue', e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addSpec(); } }}
                placeholder="Value (e.g. 24GB)"
                className="flex-1 bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:border-primary/50 focus:outline-none"
              />
              <button
                onClick={addSpec}
                className="px-4 py-2.5 rounded-xl bg-primary/20 text-primary border border-primary/30 text-sm hover:bg-primary/30 transition-colors"
              >
                Add
              </button>
            </div>
            {Object.entries(form.specs).map(([k, v]) => (
              <div key={k} className="flex items-center gap-3 text-sm py-2 border-b border-white/5 last:border-0">
                <span className="text-gray-400 flex-1">{k}</span>
                <span className="text-white">{v}</span>
                <button onClick={() => removeSpec(k)} className="text-gray-600 hover:text-red-400 transition-colors">
                  <span className="material-symbols-outlined text-base leading-none">close</span>
                </button>
              </div>
            ))}
          </div>

          {/* Upload error */}
          {uploadError && (
            <div className="flex items-center gap-2 text-red-400 text-sm bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3">
              <span className="material-symbols-outlined text-base leading-none">error</span>
              {uploadError}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              onClick={handleClose}
              disabled={uploading}
              className="flex-1 py-3 rounded-xl border border-white/10 text-gray-300 hover:bg-white/5 transition-colors text-sm font-medium disabled:opacity-40"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={uploading}
              className="flex-1 py-3 rounded-xl bg-primary text-bg-dark font-bold text-sm hover:bg-cyan-300 transition-all shadow-[0_0_15px_rgba(13,242,242,0.3)] disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {uploading ? (
                <>
                  <span className="material-symbols-outlined text-base leading-none animate-spin">progress_activity</span>
                  Uploading...
                </>
              ) : isEditMode ? 'Save Changes' : 'Post Listing'}
            </button>
          </div>

        </div>
      </div>
    </div>

      {showVerifyModal && (
        <SellerVerificationModal
          onClose={() => setShowVerifyModal(false)}
          onSuccess={() => setShowVerifyModal(false)}
        />
      )}
    </>
  );
}
