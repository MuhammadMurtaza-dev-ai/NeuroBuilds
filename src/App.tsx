import { Routes, Route, useLocation } from 'react-router-dom'
import { useState } from 'react'
import './App.css'
import { CountryProvider } from './context/CountryContext'
import { ChatProvider } from './context/ChatContext'
import { ThemeProvider } from './context/ThemeContext'
import ErrorBoundary from './components/ErrorBoundary'

// Layout Components
import Navbar from './components/Navbar/Navbar'
import Footer from './components/Footer/Footer'
import AuthModal from './components/AuthModal/AuthModal'
import ChatSidebar from './components/Chat/ChatSidebar'

// Page Components
import HomePage from './pages/HomePage'
import BlogPage from './pages/BlogPage'
import MarketplacePage from './pages/MarketplacePage'
import CommunityPage from './pages/CommunityPage'
import ChatPage from './pages/ChatPage'
import Dashboard from './components/Dashboard/Dashboard'
import ProfilePage from './pages/ProfilePage'
import DevSeedPage from './pages/DevSeedPage'
import PricingPage from './pages/PricingPage'
import SharedBuildPage from './pages/SharedBuildPage'
import AdminPage from './pages/AdminPage'
import AdminProtectedRoute from './components/Admin/AdminProtectedRoute'

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
        <Route element={<AdminProtectedRoute />}>
          <Route path="/admin" element={<AdminPage />} />
        </Route>
        {import.meta.env.DEV && <Route path="/dev/seed" element={<DevSeedPage />} />}
      </Routes>
      {!isSharePage && <Footer />}
      </ChatProvider>
    </CountryProvider>
    </ErrorBoundary>
    </ThemeProvider>
  )
}

export default App
