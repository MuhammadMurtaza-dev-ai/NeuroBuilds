import { useState, useEffect } from 'react';
import type { User } from 'firebase/auth';
import { auth, firebaseAuth } from '../Firebase';

interface AuthState {
  user: User | null;
  loading: boolean;
  error: string | null;
}

export const useAuth = () => {
  const [authState, setAuthState] = useState<AuthState>({
    user: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(
      (user) => {
        setAuthState({
          user,
          loading: false,
          error: null,
        });
      },
      (error) => {
        setAuthState({
          user: null,
          loading: false,
          error: error.message,
        });
      }
    );

    return () => unsubscribe();
  }, []);

  const register = async (email: string, password: string, displayName: string) => {
    try {
      setAuthState(prev => ({ ...prev, loading: true, error: null }));
      const result = await firebaseAuth.register(email, password);
      await firebaseAuth.updateUserProfile(result.user, displayName);
      setAuthState({
        user: result.user,
        loading: false,
        error: null,
      });
      return result.user;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Registration failed';
      setAuthState(prev => ({ ...prev, loading: false, error: errorMessage }));
      throw error;
    }
  };

  const login = async (email: string, password: string) => {
    try {
      setAuthState(prev => ({ ...prev, loading: true, error: null }));
      const result = await firebaseAuth.login(email, password);
      setAuthState({
        user: result.user,
        loading: false,
        error: null,
      });
      return result.user;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Login failed';
      setAuthState(prev => ({ ...prev, loading: false, error: errorMessage }));
      throw error;
    }
  };

  const googleSignIn = async () => {
    try {
      setAuthState(prev => ({ ...prev, loading: true, error: null }));
      const result = await firebaseAuth.googleSignIn();
      setAuthState({
        user: result.user,
        loading: false,
        error: null,
      });
      return result.user;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Google sign-in failed';
      setAuthState(prev => ({ ...prev, loading: false, error: errorMessage }));
      throw error;
    }
  };

  const githubSignIn = async () => {
    try {
      setAuthState(prev => ({ ...prev, loading: true, error: null }));
      const result = await firebaseAuth.githubSignIn();
      setAuthState({
        user: result.user,
        loading: false,
        error: null,
      });
      return result.user;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'GitHub sign-in failed';
      setAuthState(prev => ({ ...prev, loading: false, error: errorMessage }));
      throw error;
    }
  };

  const logout = async () => {
    try {
      setAuthState(prev => ({ ...prev, loading: true, error: null }));
      await firebaseAuth.logout();
      setAuthState({
        user: null,
        loading: false,
        error: null,
      });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Logout failed';
      setAuthState(prev => ({ ...prev, loading: false, error: errorMessage }));
      throw error;
    }
  };

  return {
    ...authState,
    register,
    login,
    googleSignIn,
    githubSignIn,
    logout,
  };
};
