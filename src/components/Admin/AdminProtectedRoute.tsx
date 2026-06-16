import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { useUserRole } from '../../hooks/useUserRole'

/**
 * Wraps any routes that require admin access.
 * Renders child routes via <Outlet /> when the session is confirmed admin,
 * redirects to "/" otherwise, and shows a terminal-style loading state while
 * Firebase Auth + the Firestore role document are resolving.
 *
 * Usage in App.tsx:
 *   <Route element={<AdminProtectedRoute />}>
 *     <Route path="/admin" element={<AdminPage />} />
 *   </Route>
 */
export default function AdminProtectedRoute() {
  const { user, loading: authLoading } = useAuth()
  const { isAdmin, loading: roleLoading } = useUserRole(user?.uid)

  // Wait for both the auth session AND the Firestore role document to settle
  const loading = authLoading || (!!user && roleLoading)


  if (loading) {
    return (
      <div className="min-h-screen bg-bg-dark flex items-center justify-center">
        <div className="glass-panel p-10 rounded-bento flex flex-col items-center gap-5">
          <p className="font-mono text-xs tracking-[0.3em] text-primary uppercase animate-pulse">
            Verifying credentials...
          </p>
          <div className="flex gap-2">
            {[0, 1, 2].map(i => (
              <span
                key={i}
                className="w-2 h-2 rounded-full bg-primary animate-bounce"
                style={{ animationDelay: `${i * 0.15}s` }}
              />
            ))}
          </div>
        </div>
      </div>
    )
  }

  // Not authenticated, or authenticated but not an admin → eject to home page.
  // `replace` prevents the admin URL from polluting the browser history stack.
  if (!user || !isAdmin) {
    return <Navigate to="/" replace />
  }

  return <Outlet />
}
