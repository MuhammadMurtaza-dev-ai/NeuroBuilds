import { Routes, Route, useLocation } from 'react-router-dom'
import { useState } from 'react'
import './App.css'

// Layout Components
import Navbar from './components/Navbar/Navbar'
import Footer from './components/Footer/Footer'
import AuthModal from './components/AuthModal/AuthModal'

// Page Components
import HomePage from './pages/HomePage'
import BlogPage from './pages/BlogPage'
import MarketplacePage from './pages/MarketplacePage'
import CommunityPage from './pages/CommunityPage'
import ChatPage from './pages/ChatPage'
import Dashboard from './components/Dashboard/Dashboard'

function App() {
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false)
  const [authModalMode, setAuthModalMode] = useState<'login' | 'register'>('login')
  const location = useLocation()

  const openAuthModal = (mode: 'login' | 'register' = 'login') => {
    setAuthModalMode(mode)
    setIsAuthModalOpen(true)
  }

  const closeAuthModal = () => {
    setIsAuthModalOpen(false)
  }

  return (
    <>
      <Navbar onAuthClick={openAuthModal} />
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={closeAuthModal}
        initialMode={authModalMode}
      />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/chat" element={<ChatPage />} />
        <Route path="/blog" element={<BlogPage />} />
        <Route path="/marketplace" element={<MarketplacePage />} />
        <Route path="/community" element={<CommunityPage />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/pricing" element={<div style={{ padding: '4rem 2rem', textAlign: 'center', color: 'white' }}><h1>Pricing Page (Coming Soon)</h1></div>} />
      </Routes>
      <Footer />
    </>
  )
}

export default App
