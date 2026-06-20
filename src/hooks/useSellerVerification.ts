import { useState, useEffect, useRef } from 'react';
import { auth } from '../Firebase';

const AI_SERVICE = (import.meta.env.VITE_AI_SERVICE_URL as string | undefined) ?? 'http://localhost:8000';

export interface UseSellerVerification {
  loading: boolean;
  statusMessage: string | null;
  step: 'phone' | 'otp';
  timer: number;
  error: string | null;
  phone: string;
  sendVerificationCode: (e164Phone: string) => void;
  verifyOTP: (code: string) => Promise<boolean>;
  resetToPhone: () => void;
}

export function useSellerVerification(): UseSellerVerification {
  const [loading, setLoading]             = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [step, setStep]                   = useState<'phone' | 'otp'>('phone');
  const [timer, setTimer]                 = useState(0);
  const [error, setError]                 = useState<string | null>(null);
  const [phone, setPhone]                 = useState('');

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, []);

  const startCountdown = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setTimer(60);
    intervalRef.current = setInterval(() => {
      setTimer(t => {
        if (t <= 1) { clearInterval(intervalRef.current!); return 0; }
        return t - 1;
      });
    }, 1000);
  };

  const sendVerificationCode = async (e164Phone: string) => {
    const user = auth.currentUser;
    if (!user) { setError('You must be logged in to verify.'); return; }

    setError(null);
    setLoading(true);
    setStatusMessage('Generating secure token...');

    let idToken: string;
    try {
      idToken = await user.getIdToken();
    } catch {
      setError('Failed to authenticate. Please sign in again.');
      setLoading(false);
      setStatusMessage(null);
      return;
    }

    setStatusMessage('Transmitting message over WhatsApp network...');

    try {
      const resp = await fetch(`${AI_SERVICE}/api/verify/request`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ phone: e164Phone }),
        signal: AbortSignal.timeout(15_000),
      });

      if (!resp.ok) {
        const data = await resp.json().catch(() => ({})) as { detail?: string };
        throw new Error(data.detail ?? `Server error ${resp.status}`);
      }

      setPhone(e164Phone);
      setStep('otp');
      startCountdown();
    } catch (err: unknown) {
      const name = err instanceof Error ? err.name : '';
      const msg  = err instanceof Error ? err.message : '';
      if (name === 'TimeoutError' || name === 'AbortError') {
        setError('Request timed out. Make sure the backend and WhatsApp gateway are running.');
      } else if (msg === 'Failed to fetch' || msg.includes('NetworkError')) {
        setError('Cannot reach the backend server (port 8000). Run: cd backend && uvicorn main:app --reload --port 8000');
      } else {
        setError(msg || 'Failed to send verification code.');
      }
    } finally {
      setLoading(false);
      setStatusMessage(null);
    }
  };

  const verifyOTP = async (code: string): Promise<boolean> => {
    const user = auth.currentUser;
    if (!user) { setError('You must be logged in to verify.'); return false; }

    setLoading(true);
    setError(null);
    setStatusMessage('Verifying code...');

    let idToken: string;
    try {
      idToken = await user.getIdToken();
    } catch {
      setError('Failed to authenticate. Please sign in again.');
      setLoading(false);
      setStatusMessage(null);
      return false;
    }

    try {
      const resp = await fetch(`${AI_SERVICE}/api/verify/confirm`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ phone, otp: code }),
        signal: AbortSignal.timeout(10_000),
      });

      if (!resp.ok) {
        const data = await resp.json().catch(() => ({})) as { detail?: string };
        throw new Error(data.detail ?? `Server error ${resp.status}`);
      }

      return true;
    } catch (err: unknown) {
      const name = err instanceof Error ? err.name : '';
      if (name === 'TimeoutError' || name === 'AbortError') {
        setError('Request timed out. Please try again.');
      } else {
        setError(err instanceof Error ? err.message : 'Verification failed.');
      }
      return false;
    } finally {
      setLoading(false);
      setStatusMessage(null);
    }
  };

  const resetToPhone = () => {
    setStep('phone');
    setError(null);
    setStatusMessage(null);
    if (intervalRef.current) clearInterval(intervalRef.current);
    setTimer(0);
  };

  return { loading, statusMessage, step, timer, error, phone, sendVerificationCode, verifyOTP, resetToPhone };
}
