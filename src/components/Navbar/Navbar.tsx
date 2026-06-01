import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Menu, X, Sun, Moon } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useStorage } from '../../hooks/useStorage';
import { useAuth } from '../../hooks/useAuth';
import { useCountry } from '../../context/CountryContext';
import { useChatContext } from '../../context/ChatContext';
import { COUNTRY_LIST } from '../../data/globalLocations';
import { useNotifications } from '../../hooks/useNotifications';
import { NotificationBell } from '../Notifications/NotificationBell';

interface NavbarProps {
  onAuthClick?: (mode?: 'login' | 'register') => void;
}

const Navbar: React.FC<NavbarProps> = ({
  onAuthClick,
}) => {
  const { data } = useStorage();
  const { user, logout } = useAuth();
  const { selectedCountry, setSelectedCountry } = useCountry();
  const { setIsChatOpen, unreadCount } = useChatContext();
  const notif = useNotifications(user?.uid);
  const navigate = useNavigate();
  const { brandName } = data.appConfig || { brandName: 'NEURO BUILDS' };
  const defaultLinks = [
    { label: 'AI Builder', path: '/chat' },
    { label: 'Blog', path: '/blog' },
    { label: 'Marketplace', path: '/marketplace' },
    { label: 'Community', path: '/community' },
  ];
  const links = data.navLinks && data.navLinks.length > 0 ? data.navLinks : defaultLinks;
  const { theme, toggleTheme } = useTheme();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const location = useLocation();

  const toggleMobileMenu = () => {
    setIsMobileMenuOpen(!isMobileMenuOpen);
  };

  const closeMobileMenu = () => {
    setIsMobileMenuOpen(false);
  };

  const isActiveLink = (path: string) => {
    if (path === '/' && location.pathname === '/') return true;
    return location.pathname.startsWith(path) && path !== '/';
  };

  return (
    <div className="fixed top-6 left-0 right-0 z-50 flex justify-center px-4">
      <nav className="glass-nav rounded-pill px-2 py-2 flex items-center gap-2 shadow-2xl shadow-black/50 max-w-6xl w-full justify-between">
        {/* Logo / Brand */}
        <Link
          to="/"
          className="flex items-center gap-3 pl-4 hover:opacity-80 transition-opacity"
          onClick={closeMobileMenu}
        >
          <span className="material-symbols-outlined text-primary">terminal</span>
          <span className="font-bold tracking-tight text-lg text-white">{brandName}</span>
        </Link>

        {/* Desktop Navigation Links */}
        <div className="hidden md:flex items-center gap-1 bg-black/20 rounded-pill p-1 border border-white/5">
          {links.map((link) => (
            <Link
              key={link.path}
              to={link.path}
              className={`px-5 py-2 rounded-pill text-sm font-medium transition-colors ${
                isActiveLink(link.path)
                  ? 'bg-white/10 text-white shadow-sm ring-1 ring-white/5'
                  : 'hover:bg-white/10 text-gray-300'
              }`}
            >
              {link.label}
            </Link>
          ))}
        </div>

        {/* Country Selector */}
        <div className="hidden md:flex items-center gap-1.5 bg-black/20 border border-white/5 rounded-pill px-3 py-1.5">
          <span className="material-symbols-outlined text-primary text-[16px]">public</span>
          <select
            value={selectedCountry}
            onChange={e => setSelectedCountry(e.target.value)}
            className="bg-transparent border-none text-white text-xs font-medium focus:ring-0 cursor-pointer appearance-none pr-1"
          >
            {COUNTRY_LIST.map(c => (
              <option key={c} value={c} className="bg-bg-panel text-white">{c}</option>
            ))}
          </select>
          <span className="material-symbols-outlined text-gray-500 text-[14px]">expand_more</span>
        </div>

        {/* AI Builder is now part of the main nav links (replaces Home) */}

        {/* Right Side Actions */}
        <div className="flex items-center gap-2 pr-2">
          {/* Divider */}
          <div className="w-px h-6 bg-white/10 mx-1 hidden md:block"></div>

          {/* Chat Button */}
          <button
            onClick={() => setIsChatOpen(true)}
            className="size-10 flex items-center justify-center rounded-full hover:bg-white/10 dark:hover:bg-white/10 hover:bg-black/5 transition-colors relative group"
            aria-label="Open messages"
          >
            <span className="material-symbols-outlined text-gray-400 text-[20px] group-hover:text-white transition-colors">chat</span>
            {unreadCount > 0 && (
              <span className="absolute top-1.5 right-1.5 size-2.5 bg-primary rounded-full shadow-[0_0_8px_#0df2f2] animate-pulse" />
            )}
          </button>

          {/* Theme Toggle */}
          <button
            onClick={toggleTheme}
            className="size-10 flex items-center justify-center rounded-full dark:hover:bg-white/10 hover:bg-black/5 transition-colors"
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {theme === 'dark'
              ? <Sun size={18} className="text-gray-400" />
              : <Moon size={18} className="text-gray-500" />
            }
          </button>

          {/* Notifications Bell */}
          {user && <NotificationBell notif={notif} />}

          {/* User Profile */}
          {user ? (
            <div className="relative">
              <button
                onClick={() => setIsProfileOpen(!isProfileOpen)}
                className="size-10 rounded-full bg-gradient-to-tr from-primary to-accent-purple p-[2px] ml-1 cursor-pointer hover:shadow-[0_0_20px_rgba(13,242,242,0.3)] transition-shadow overflow-hidden"
              >
                {user.photoURL ? (
                  <img
                    src={user.photoURL}
                    alt={user.displayName || 'User'}
                    className="w-full h-full rounded-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full bg-bg-dark rounded-full flex items-center justify-center">
                    <span className="material-symbols-outlined text-white text-[20px]">person</span>
                  </div>
                )}
              </button>

              {/* Profile Dropdown */}
              {isProfileOpen && (
                <>
                  <div
                    className="fixed inset-0 z-30"
                    onClick={() => setIsProfileOpen(false)}
                  />
                  <div className="absolute right-0 top-12 w-64 glass-panel rounded-bento border border-white/10 shadow-2xl z-40 overflow-hidden">
                    {/* User Info */}
                    <div className="p-4 border-b border-white/5 bg-black/20">
                      <div className="flex items-center gap-3">
                        {user.photoURL ? (
                          <img
                            src={user.photoURL}
                            alt={user.displayName || 'User'}
                            className="w-12 h-12 rounded-full object-cover"
                          />
                        ) : (
                          <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-primary to-accent-purple flex items-center justify-center">
                            <span className="material-symbols-outlined text-white">person</span>
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-white truncate">
                            {user.displayName || 'User'}
                          </p>
                          <p className="text-xs text-gray-400 truncate">
                            {user.email}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Menu Items */}
                    <div className="p-2">
                      <button
                        onClick={() => { navigate('/profile'); setIsProfileOpen(false); }}
                        className="w-full px-4 py-2 text-left text-sm text-gray-300 hover:bg-white/5 rounded-lg transition-colors flex items-center gap-2"
                      >
                        <span className="material-symbols-outlined text-[18px]">person</span>
                        Profile Settings
                      </button>
                      <button className="w-full px-4 py-2 text-left text-sm text-gray-300 hover:bg-white/5 rounded-lg transition-colors flex items-center gap-2">
                        <span className="material-symbols-outlined text-[18px]">settings</span>
                        Preferences
                      </button>
                    </div>

                    {/* Logout Button */}
                    <div className="p-2 border-t border-white/5">
                      <button
                        onClick={() => {
                          logout();
                          setIsProfileOpen(false);
                        }}
                        className="w-full px-4 py-2 text-left text-sm text-red-400 hover:bg-red-500/10 rounded-lg transition-colors flex items-center gap-2"
                      >
                        <span className="material-symbols-outlined text-[18px]">logout</span>
                        Logout
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          ) : (
            <button
              onClick={() => {
                onAuthClick?.('login');
                closeMobileMenu();
              }}
              className="size-10 rounded-full bg-gradient-to-tr from-primary to-accent-purple p-[2px] ml-1 cursor-pointer hover:shadow-[0_0_20px_rgba(13,242,242,0.3)] transition-shadow"
            >
              <div className="w-full h-full bg-bg-dark rounded-full flex items-center justify-center overflow-hidden">
                <span className="material-symbols-outlined text-white text-[20px]">person</span>
              </div>
            </button>
          )}

          {/* Mobile Menu Toggle */}
          <button
            className="md:hidden flex items-center justify-center"
            onClick={toggleMobileMenu}
            aria-label="Toggle navigation menu"
            aria-expanded={isMobileMenuOpen}
          >
            {isMobileMenuOpen ? (
              <X size={24} className="text-white" />
            ) : (
              <Menu size={24} className="text-white" />
            )}
          </button>
        </div>
      </nav>

      {/* Mobile Navigation Menu */}
      {isMobileMenuOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/50 z-40 md:hidden"
            onClick={closeMobileMenu}
          />
          <div className="absolute top-full left-4 right-4 mt-4 bg-bg-panel border border-white/10 rounded-bento p-4 z-40 md:hidden">
            {links.map((link) => (
              <Link
                key={link.path}
                to={link.path}
                className={`block px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                  isActiveLink(link.path)
                    ? 'bg-white/10 text-primary'
                    : 'hover:bg-white/5 text-gray-300'
                }`}
                onClick={closeMobileMenu}
              >
                {link.label}
              </Link>
            ))}
            {/* AI Builder is included in the main nav links (replaces Home) */}

            <button
              onClick={() => {
                if (user) {
                  navigate('/profile');
                } else {
                  onAuthClick?.('login');
                }
                closeMobileMenu();
              }}
              className="w-full mt-2 px-4 py-2 bg-primary hover:bg-cyan-300 text-bg-dark font-bold rounded-pill transition-all"
            >
              {user ? 'Profile' : 'Sign In'}
            </button>
          </div>
        </>
      )}
    </div>
  );
};
export default Navbar;