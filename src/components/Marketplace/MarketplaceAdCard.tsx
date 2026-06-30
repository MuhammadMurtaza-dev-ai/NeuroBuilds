import { useState } from 'react';
import type { Advertisement } from '../../hooks/useAdvertisements';

interface Props {
  ad: Advertisement;
}

export default function MarketplaceAdCard({ ad }: Props) {
  const isPurple = ad.accent === 'purple';
  const accentText = isPurple ? 'text-accent-purple' : 'text-primary';
  const accentBorder = isPurple ? 'hover:border-accent-purple/50' : 'hover:border-primary/50';
  const accentGlow = isPurple
    ? 'from-accent-purple/15 to-transparent'
    : 'from-primary/15 to-transparent';

  const [copied, setCopied] = useState(false);

  function copyId(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    navigator.clipboard.writeText(ad.id).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  }

  return (
    <a
      href={ad.targetUrl}
      target="_blank"
      rel="noopener noreferrer sponsored"
      className={`glass-panel rounded-[2rem] border border-border-glass ${accentBorder} transition-all group flex flex-col cursor-pointer relative overflow-hidden`}
    >
      {/* Sponsored badge */}
      <div className={`absolute top-4 right-4 z-10 px-2.5 py-1 rounded-full text-[10px] font-bold tracking-widest font-mono backdrop-blur-sm border ${
        isPurple
          ? 'text-accent-purple border-accent-purple/40 bg-accent-purple/10'
          : 'text-primary border-primary/40 bg-primary/10'
      }`}>
        SPONSORED
      </div>

      {/* Image / gradient fallback */}
      <div className="aspect-[4/3] bg-bg-panel overflow-hidden relative">
        {ad.imageUrl ? (
          <img
            src={ad.imageUrl}
            alt={ad.sponsorName}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          />
        ) : (
          <div className={`w-full h-full flex items-center justify-center bg-gradient-to-br ${accentGlow}`}>
            <span className={`material-symbols-outlined text-5xl ${accentText}`}>campaign</span>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-4 flex flex-col gap-2.5 flex-grow">
        <h4 className={`font-bold text-base leading-tight transition-colors line-clamp-1 group-hover:${accentText}`}>
          {ad.sponsorName}
        </h4>
        <p className="text-sm text-[var(--text-muted)] line-clamp-2 flex-grow">
          {ad.tagline || ad.title}
        </p>
        <div className={`flex items-center gap-1.5 text-xs font-bold ${accentText} border-t border-border-glass pt-2.5 mt-auto`}>
          Learn more
          <span className="material-symbols-outlined text-base leading-none group-hover:translate-x-0.5 transition-transform">arrow_forward</span>
        </div>

        {/* Ad ID — copyable for use in Ad Manager Search & Feature */}
        <button
          onClick={copyId}
          title={`Ad ID: ${ad.id} — click to copy`}
          className="flex items-center gap-1.5 mt-1 w-full text-left group/id"
        >
          <span className="material-symbols-outlined text-[11px] text-gray-700 group-hover/id:text-gray-500 transition-colors shrink-0">
            {copied ? 'check' : 'content_copy'}
          </span>
          <span className="font-mono text-[9px] text-gray-700 group-hover/id:text-gray-500 transition-colors truncate">
            {copied ? 'copied!' : ad.id}
          </span>
        </button>
      </div>
    </a>
  );
}
