import { Routes, Route, useLocation } from 'react-router-dom'
import { useState, lazy, Suspense } from 'react'
import './App.css'
import SplashScreen from './components/SplashScreen'
import { CountryProvider } from './context/CountryContext'
import { ChatProvider } from './context/ChatContext'
import { ThemeProvider } from './context/ThemeContext'
import ErrorBoundary from './components/ErrorBoundary'

// Layout Components (eager — always mounted on the critical paint path)
import Navbar from './components/Navbar/Navbar'
import Footer from './components/Footer/Footer'
import AuthModal from './components/AuthModal/AuthModal'
import ChatSidebar from './components/Chat/ChatSidebar'

// Landing page stays eager so the initial route paints without a chunk round-trip.
import HomePage from './pages/HomePage'
import AdminProtectedRoute from './components/Admin/AdminProtectedRoute'

// Route pages are lazy-loaded so each ships in its own chunk instead of the
// single monolithic bundle. Behaviour is unchanged — the components are identical,
// only their module boundary moves.
const BlogPage = lazy(() => import('./pages/BlogPage'))
const MarketplacePage = lazy(() => import('./pages/MarketplacePage'))
const CommunityPage = lazy(() => import('./pages/CommunityPage'))
const ChatPage = lazy(() => import('./pages/ChatPage'))
const Dashboard = lazy(() => import('./components/Dashboard/Dashboard'))
const ProfilePage = lazy(() => import('./pages/ProfilePage'))
const DevSeedPage = lazy(() => import('./pages/DevSeedPage'))
const PricingPage = lazy(() => import('./pages/PricingPage'))
const SharedBuildPage = lazy(() => import('./pages/SharedBuildPage'))
const AdminPage = lazy(() => import('./pages/AdminPage'))
const SellerProfilePage = lazy(() => import('./pages/SellerProfilePage'))

/** Minimal loader shown while a lazy route chunk is fetched. */
function RouteFallback() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
    </div>
  )
}

function App() {
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false)
  const [authModalMode, setAuthModalMode] = useState<'login' | 'register'>('login')
  const location = useLocation()
  const isSharePage = location.pathname === '/share'

  const openAuthModal = (mode: 'login' | 'register' = 'login') => {
    setAuthModalMode(mode)
    setIsAuthModalOpen(true)
  }

  const closeAuthModal = () => {
    setIsAuthModalOpen(false)
  }

  return (
    <>
    <SplashScreen />
    <ThemeProvider>
    <ErrorBoundary>
    <CountryProvider>
      <ChatProvider>
      {!isSharePage && <Navbar onAuthClick={openAuthModal} />}
      {!isSharePage && <ChatSidebar />}
      {!isSharePage && (
        <AuthModal
          isOpen={isAuthModalOpen}
          onClose={closeAuthModal}
          initialMode={authModalMode}
        />
      )}
      <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/chat" element={<ChatPage />} />
        <Route path="/blog" element={<BlogPage />} />
        <Route path="/marketplace" element={<MarketplacePage onOpenAuth={openAuthModal} />} />
        <Route path="/community" element={<CommunityPage onOpenAuth={openAuthModal} />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/pricing" element={<PricingPage />} />
        <Route path="/share" element={<SharedBuildPage />} />
        <Route path="/seller/:uid" element={<SellerProfilePage onOpenAuth={openAuthModal} />} />
        <Route element={<AdminProtectedRoute />}>
          <Route path="/admin" element={<AdminPage />} />
        </Route>
        {import.meta.env.DEV && <Route path="/dev/seed" element={<DevSeedPage />} />}
      </Routes>
      </Suspense>
      {!isSharePage && <Footer />}
      </ChatProvider>
    </CountryProvider>
    </ErrorBoundary>
    </ThemeProvider>
    </>
  )
}

export default App
