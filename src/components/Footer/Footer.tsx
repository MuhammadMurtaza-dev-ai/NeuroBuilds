import React from 'react';
import { Link } from 'react-router-dom';
import { useStorage } from '../../hooks/useStorage';

interface FooterProps {
  sectionId?: string;
}

const Footer: React.FC<FooterProps> = ({
  sectionId = 'footer',
}) => {
  const { data } = useStorage();
  const { footerBrandName } = data.appConfig || { footerBrandName: 'NEURO BUILDS' };
  const columns = data.footerColumns || [];
  const currentYear = new Date().getFullYear();

  return (
    <footer id={sectionId} className="border-t border-white/10 bg-bg-dark">
      <div className="max-w-[1440px] mx-auto px-4 md:px-8 py-16">
        {/* Top Section */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-12 mb-16">
          {/* Brand & Social */}
          <div className="lg:col-span-1">
            <Link to="/" className="flex items-center gap-2 mb-4 hover:opacity-80 transition-opacity">
              <span className="material-symbols-outlined text-primary text-2xl">terminal</span>
              <span className="font-bold text-lg text-white">{footerBrandName}</span>
            </Link>
            <p className="text-gray-400 text-sm mb-6">
              Build your perfect PC with AI-powered recommendations and community support.
            </p>
            {/* Social Links */}
            <div className="flex gap-4">
              <a href="https://github.com" className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center hover:bg-primary/20 hover:text-primary transition-all" aria-label="GitHub">
                <span className="material-symbols-outlined">code</span>
              </a>
              <a href="https://twitter.com" className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center hover:bg-primary/20 hover:text-primary transition-all" aria-label="Twitter">
                <span className="material-symbols-outlined">share</span>
              </a>
              <a href="https://linkedin.com" className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center hover:bg-primary/20 hover:text-primary transition-all" aria-label="LinkedIn">
                <span className="material-symbols-outlined">business_center</span>
              </a>
              <a href="mailto:hello@neurobuilds.com" className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center hover:bg-primary/20 hover:text-primary transition-all" aria-label="Email">
                <span className="material-symbols-outlined">mail</span>
              </a>
            </div>
          </div>

          {/* Links Columns */}
          {columns.map((column) => (
            <div key={column.title} className="lg:col-span-1">
              <h4 className="font-bold text-white mb-6 text-sm uppercase tracking-wider">{column.title}</h4>
              <ul className="space-y-3">
                {column.links.map((link) => (
                  <li key={link.path}>
                    <Link
                      to={link.path}
                      className="text-gray-400 hover:text-primary transition-colors text-sm"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom Section */}
        <div className="border-t border-white/5 pt-8 flex flex-col md:flex-row items-center justify-between">
          <p className="text-gray-500 text-sm text-center md:text-left mb-4 md:mb-0">
            © {currentYear} {footerBrandName}. All rights reserved.
          </p>
          <div className="flex gap-6">
            <a href="/privacy" className="text-gray-500 hover:text-primary transition-colors text-sm">
              Privacy Policy
            </a>
            <a href="/terms" className="text-gray-500 hover:text-primary transition-colors text-sm">
              Terms of Service
            </a>
            <a href="/cookies" className="text-gray-500 hover:text-primary transition-colors text-sm">
              Cookie Settings
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;