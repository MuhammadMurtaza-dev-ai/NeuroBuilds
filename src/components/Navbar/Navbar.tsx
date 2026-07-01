import React, { useState, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Sun, Moon } from "lucide-react";
import { useTheme } from "../../context/ThemeContext";
import { useStorage } from "../../hooks/useStorage";
import { useAuth } from "../../hooks/useAuth";
import { useCountry } from "../../context/CountryContext";
import { useChatContext } from "../../context/ChatContext";
import { COUNTRY_LIST } from "../../data/globalLocations";
import { useNotifications } from "../../hooks/useNotifications";
import { NotificationBell } from "../Notifications/NotificationBell";
import favicon from "../../assets/favicon.png";

interface NavbarProps {
  onAuthClick?: (mode?: "login" | "register") => void;
}

const Navbar: React.FC<NavbarProps> = ({ onAuthClick }) => {
  const { data } = useStorage();
  const { user, logout } = useAuth();
  const { selectedCountry, setSelectedCountry } = useCountry();
  const { setIsChatOpen, unreadCount } = useChatContext();
  const notif = useNotifications(user?.uid);
  const navigate = useNavigate();
  const { brandName } = data.appConfig || { brandName: "NEURO BUILDS" };
  const defaultLinks = [
    { label: "AI Builder", path: "/chat" },
    { label: "Blog", path: "/blog" },
    { label: "Marketplace", path: "/marketplace" },
    { label: "Community", path: "/community" },
  ];
  const links =
    data.navLinks && data.navLinks.length > 0 ? data.navLinks : defaultLinks;
  const { theme, toggleTheme } = useTheme();
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isCountryOpen, setIsCountryOpen] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const location = useLocation();

  const isActiveLink = (path: string) => {
    if (path === "/" && location.pathname === "/") return true;
    return location.pathname.startsWith(path) && path !== "/";
  };

  // Close drawer on Esc key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsDrawerOpen(false);
    };
    if (isDrawerOpen) {
      document.addEventListener("keydown", handleKeyDown);
    }
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isDrawerOpen]);

  return (
    <>
      <div className="fixed top-6 left-0 right-0 z-50 flex justify-center px-4">
        <nav className="glass-nav rounded-pill px-2 py-2 flex items-center gap-2 shadow-2xl shadow-black/50 max-w-6xl w-full justify-between">
          {/* Logo / Brand */}
          <Link
            to="/"
            className="flex items-center gap-3 pl-4 hover:opacity-80 transition-opacity"
          >
            <img
              src={favicon}
              alt={brandName}
              className="size-8 object-contain"
            />
            <span className="font-bold tracking-tight text-lg text-white">
              {brandName}
            </span>
          </Link>
          {/* Desktop Navigation Links */}
          <div className="hidden md:flex items-center gap-1 bg-black/8 dark:bg-black/20 rounded-pill p-1 border border-border-glass">
            {links.map((link) => (
              <Link
                key={link.path}
                to={link.path}
                className={`px-5 py-2 rounded-pill text-sm font-medium transition-colors ${
                  isActiveLink(link.path)
                    ? "bg-black/10 dark:bg-white/10 shadow-sm"
                    : "hover:bg-black/8 dark:hover:bg-white/10"
                }`}
              >
                {link.label}
              </Link>
            ))}
          </div>

          {/* Country Selector - desktop only */}
          <div className="relative hidden md:block">
            <button
              type="button"
              onClick={() => setIsCountryOpen((prev) => !prev)}
              aria-haspopup="listbox"
              aria-expanded={isCountryOpen}
              className="flex items-center gap-1.5 h-10 bg-black/8 dark:bg-black/20 border border-border-glass rounded-pill px-4 hover:border-primary/40 transition-colors"
            >
              <span className="material-symbols-outlined text-primary text-[16px]">
                public
              </span>
              <span className="text-white text-xs font-medium">
                {selectedCountry}
              </span>
              <span
                className={`material-symbols-outlined text-gray-500 text-[14px] transition-transform ${
                  isCountryOpen ? "rotate-180" : ""
                }`}
              >
                expand_more
              </span>
            </button>

            {isCountryOpen && (
              <>
                <div
                  className="fixed inset-0 z-30"
                  onClick={() => setIsCountryOpen(false)}
                />
                <div
                  role="listbox"
                  className="absolute right-0 top-11 w-48 max-h-72 overflow-y-auto glass-panel rounded-2xl border border-black/10 dark:border-white/10 shadow-2xl z-40 p-1.5"
                >
                  {COUNTRY_LIST.map((c) => (
                    <button
                      key={c}
                      type="button"
                      role="option"
                      aria-selected={c === selectedCountry}
                      onClick={() => {
                        setSelectedCountry(c);
                        setIsCountryOpen(false);
                      }}
                      className={`w-full px-3 py-2 text-left text-xs rounded-lg transition-colors flex items-center justify-between gap-2 ${
                        c === selectedCountry
                          ? "bg-primary/10 text-primary"
                          : "text-gray-300 hover:bg-black/5 dark:hover:bg-white/5 hover:text-white"
                      }`}
                    >
                      {c}
                      {c === selectedCountry && (
                        <span className="material-symbols-outlined text-[16px]">
                          check
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Right Side Actions */}
          <div className="flex items-center gap-2 pr-2">
            {/* Divider - desktop only */}
            <div className="w-px h-6 bg-black/10 dark:bg-white/10 mx-1 hidden md:block" />

            {/* Chat Button */}
            <button
              onClick={() => setIsChatOpen(true)}
              className="size-10 flex items-center justify-center rounded-full hover:bg-black/8 dark:hover:bg-white/10 transition-colors relative group"
              aria-label="Open messages"
            >
              <span className="material-symbols-outlined text-gray-400 text-[20px] group-hover:text-white transition-colors">
                chat
              </span>
              {unreadCount > 0 && (
                <span className="absolute top-1.5 right-1.5 size-2.5 bg-primary rounded-full shadow-[0_0_8px_#0df2f2] animate-pulse" />
              )}
            </button>

            {/* Theme Toggle - desktop only, moved to drawer on mobile */}
            <button
              onClick={toggleTheme}
              className="size-10 hidden md:flex items-center justify-center rounded-full dark:hover:bg-white/10 hover:bg-black/5 transition-colors"
              aria-label={
                theme === "dark"
                  ? "Switch to light mode"
                  : "Switch to dark mode"
              }
            >
              {theme === "dark" ? (
                <Sun size={18} className="text-gray-400" />
              ) : (
                <Moon size={18} className="text-gray-500" />
              )}
            </button>

            {/* Notifications Bell - visible on all screens */}
            {user && <NotificationBell notif={notif} />}

            {/* User Profile Avatar - desktop only, moved to drawer on mobile */}
            {user ? (
              <div className="relative hidden md:block">
                <button
                  onClick={() => setIsProfileOpen(!isProfileOpen)}
                  className="size-10 rounded-full bg-gradient-to-tr from-primary to-accent-purple p-[2px] ml-1 cursor-pointer hover:shadow-[0_0_20px_rgba(13,242,242,0.3)] transition-shadow overflow-hidden"
                >
                  {user.photoURL ? (
                    <img
                      src={user.photoURL}
                      alt={user.displayName || "User"}
                      className="w-full h-full rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full bg-bg-dark rounded-full flex items-center justify-center">
                      <span className="material-symbols-outlined text-white text-[20px]">
                        person
                      </span>
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
                    <div className="absolute right-0 top-12 w-64 glass-panel rounded-bento border border-black/10 dark:border-white/10 shadow-2xl z-40 overflow-hidden">
                      <div className="p-4 border-b border-border-glass bg-black/5 dark:bg-black/20">
                        <div className="flex items-center gap-3">
                          {user.photoURL ? (
                            <img
                              src={user.photoURL}
                              alt={user.displayName || "User"}
                              className="w-12 h-12 rounded-full object-cover"
                            />
                          ) : (
                            <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-primary to-accent-purple flex items-center justify-center">
                              <span className="material-symbols-outlined text-white">
                                person
                              </span>
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="font-bold text-white truncate">
                              {user.displayName || "User"}
                            </p>
                            <p className="text-xs text-gray-400 truncate">
                              {user.email}
                            </p>
                          </div>
                        </div>
                      </div>
                      <div className="p-2">
                        <button
                          onClick={() => {
                            navigate("/profile");
                            setIsProfileOpen(false);
                          }}
                          className="w-full px-4 py-2 text-left text-sm hover:bg-black/5 dark:hover:bg-white/5 rounded-lg transition-colors flex items-center gap-2"
                        >
                          <span className="material-symbols-outlined text-[18px]">
                            person
                          </span>
                          Profile Settings
                        </button>
                        <button className="w-full px-4 py-2 text-left text-sm hover:bg-black/5 dark:hover:bg-white/5 rounded-lg transition-colors flex items-center gap-2">
                          <span className="material-symbols-outlined text-[18px]">
                            settings
                          </span>
                          Preferences
                        </button>
                      </div>
                      <div className="p-2 border-t border-border-glass">
                        <button
                          onClick={() => {
                            logout();
                            setIsProfileOpen(false);
                          }}
                          className="w-full px-4 py-2 text-left text-sm text-red-400 hover:bg-red-500/10 rounded-lg transition-colors flex items-center gap-2"
                        >
                          <span className="material-symbols-outlined text-[18px]">
                            logout
                          </span>
                          Logout
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            ) : (
              /* Sign In - desktop only, moved to drawer on mobile */
              <button
                onClick={() => onAuthClick?.("login")}
                className="size-10 hidden md:flex rounded-full bg-gradient-to-tr from-primary to-accent-purple p-[2px] ml-1 cursor-pointer hover:shadow-[0_0_20px_rgba(13,242,242,0.3)] transition-shadow"
              >
                <div className="w-full h-full bg-bg-dark rounded-full flex items-center justify-center overflow-hidden">
                  <span className="material-symbols-outlined text-white text-[20px]">
                    person
                  </span>
                </div>
              </button>
            )}

            {/* Hamburger - mobile only */}
            <button
              className="md:hidden flex items-center justify-center size-10 rounded-full hover:bg-black/8 dark:hover:bg-white/10 transition-colors"
              onClick={() => setIsDrawerOpen(true)}
              aria-label="Open navigation menu"
              aria-expanded={isDrawerOpen}
            >
              <span className="material-symbols-outlined text-[22px]">
                menu
              </span>
            </button>
          </div>
        </nav>
      </div>

      {/* Mobile drawer backdrop */}
      <div
        className={`fixed inset-0 bg-black/60 z-[74] md:hidden transition-opacity duration-300 ${
          isDrawerOpen
            ? "opacity-100 pointer-events-auto"
            : "opacity-0 pointer-events-none"
        }`}
        onClick={() => setIsDrawerOpen(false)}
        aria-hidden="true"
      />

      {/* Mobile slide-in drawer */}
      <div
        className={`fixed inset-y-0 right-0 w-[80%] max-w-xs z-[75] md:hidden flex flex-col glass-panel border-l border-border-glass shadow-2xl transition-transform duration-300 ease-in-out ${
          isDrawerOpen ? "translate-x-0" : "translate-x-full"
        }`}
        role="dialog"
        aria-modal="true"
        aria-label="Navigation menu"
      >
        {/* Drawer header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border-glass flex-shrink-0">
          <div className="flex items-center gap-2">
            <img
              src={favicon}
              alt={brandName}
              className="size-6 object-contain"
            />
            <span className="font-bold text-sm text-white">{brandName}</span>
          </div>
          <button
            onClick={() => setIsDrawerOpen(false)}
            className="size-10 flex items-center justify-center rounded-full hover:bg-white/10 transition-colors"
            aria-label="Close menu"
          >
            <span className="material-symbols-outlined text-[20px] text-gray-400">
              close
            </span>
          </button>
        </div>

        {/* Scrollable drawer content */}
        <div className="flex-1 overflow-y-auto py-3">
          {/* Navigation links */}
          <nav className="px-3 space-y-1">
            {links.map((link) => (
              <Link
                key={link.path}
                to={link.path}
                onClick={() => setIsDrawerOpen(false)}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors ${
                  isActiveLink(link.path)
                    ? "bg-primary/10 text-primary"
                    : "text-gray-300 hover:bg-white/5 hover:text-white"
                }`}
              >
                {link.label}
              </Link>
            ))}
          </nav>

          <div className="mx-4 my-3 h-px bg-border-glass" />

          {/* Region / Country */}
          <div className="px-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
              Region
            </p>
            <select
              value={selectedCountry}
              onChange={(e) => setSelectedCountry(e.target.value)}
              className="select-cyber w-full text-sm"
            >
              {COUNTRY_LIST.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div className="mx-4 my-3 h-px bg-border-glass" />

          {/* Theme toggle */}
          <div className="px-4">
            <button
              onClick={toggleTheme}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-white/5 transition-colors text-left"
            >
              {theme === "dark" ? (
                <Sun size={18} className="text-gray-400 flex-shrink-0" />
              ) : (
                <Moon size={18} className="text-gray-500 flex-shrink-0" />
              )}
              <span className="text-sm text-gray-300">
                {theme === "dark" ? "Light mode" : "Dark mode"}
              </span>
            </button>
          </div>

          <div className="mx-4 my-3 h-px bg-border-glass" />

          {/* Profile section */}
          <div className="px-4">
            {user ? (
              <>
                <div className="flex items-center gap-3 px-2 py-2 mb-1">
                  {user.photoURL ? (
                    <img
                      src={user.photoURL}
                      alt={user.displayName || "User"}
                      className="w-10 h-10 rounded-full object-cover flex-shrink-0"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-primary to-accent-purple flex items-center justify-center flex-shrink-0">
                      <span className="material-symbols-outlined text-white text-[18px]">
                        person
                      </span>
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-white truncate">
                      {user.displayName || "User"}
                    </p>
                    <p className="text-xs text-gray-500 truncate">
                      {user.email}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    navigate("/profile");
                    setIsDrawerOpen(false);
                  }}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-white/5 transition-colors"
                >
                  <span className="material-symbols-outlined text-[18px] text-gray-400">
                    person
                  </span>
                  <span className="text-sm text-gray-300">
                    Profile Settings
                  </span>
                </button>
                <button
                  onClick={() => {
                    logout();
                    setIsDrawerOpen(false);
                  }}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-red-500/10 transition-colors"
                >
                  <span className="material-symbols-outlined text-[18px] text-red-400">
                    logout
                  </span>
                  <span className="text-sm text-red-400">Logout</span>
                </button>
              </>
            ) : (
              <button
                onClick={() => {
                  onAuthClick?.("login");
                  setIsDrawerOpen(false);
                }}
                className="w-full py-3 px-4 bg-primary hover:bg-cyan-300 text-bg-dark font-bold rounded-pill text-sm transition-all shadow-[0_0_15px_rgba(13,242,242,0.3)]"
              >
                Sign In
              </button>
            )}
          </div>
        </div>
      </div>

    </>
  );
};

export default Navbar;
