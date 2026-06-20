import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useStorage } from '../../hooks/useStorage';
import { useCountry } from '../../context/CountryContext';

interface FooterProps {
  sectionId?: string;
}

const Footer: React.FC<FooterProps> = ({
  sectionId = 'footer',
}) => {
  const { data } = useStorage();
  const { footerBrandName } = data.appConfig || { footerBrandName: 'NEURO BUILDS' };
  const { selectedCountry } = useCountry();
  const currentYear = new Date().getFullYear();

  const [online, setOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  );

  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  return (
    <footer
      id={sectionId}
      className="fixed bottom-0 left-0 w-full bg-[#111] border-t border-white/5 py-1 px-4 z-50 text-[10px] md:text-xs font-mono text-gray-500 flex justify-between items-center select-none"
    >
      <div className="flex items-center gap-4">
        <span
          className={`flex items-center gap-2 transition-colors ${
            online ? 'text-primary' : 'text-red-400'
          }`}
        >
          <span className="material-symbols-outlined text-[14px]">
            {online ? 'wifi' : 'wifi_off'}
          </span>
          {online ? 'CONNECTED' : 'OFFLINE'}
        </span>
        <span className="hidden md:inline">REGION: {selectedCountry || 'GLOBAL'}</span>
        <Link to="/marketplace" className="hidden md:inline hover:text-white transition-colors">
          MARKETPLACE
        </Link>
        <Link to="/community" className="hidden md:inline hover:text-white transition-colors">
          COMMUNITY
        </Link>
      </div>
      <div className="flex items-center gap-4">
        <span>{footerBrandName} © {currentYear}</span>
        <Link to="/chat" className="hidden md:inline hover:text-white transition-colors">
          NEURO AI
        </Link>
        <a
          href="https://github.com"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 hover:text-white cursor-pointer transition-colors"
        >
          <span className="material-symbols-outlined text-[14px]">code</span>
          SOURCE
        </a>
      </div>
    </footer>
  );
};

export default Footer;
