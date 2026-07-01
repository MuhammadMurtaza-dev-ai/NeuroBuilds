import { useState, useRef } from 'react';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../../Firebase';
import { useSellerVerification } from '../../hooks/useSellerVerification';
import { MARKETPLACE_RULES } from '../../data/marketplaceRules';

interface Props {
  onClose: () => void;
  onSuccess: () => void;
}

export default function SellerVerificationModal({ onClose, onSuccess }: Props) {
  const { loading, statusMessage, step, timer, error, phone, sendVerificationCode, verifyOTP, resetToPhone } = useSellerVerification();
  const [rulesAccepted, setRulesAccepted] = useState(false);
  const [agreeChecked, setAgreeChecked] = useState(false);
  const [phoneInput, setPhoneInput] = useState('');
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const otpRefs = useRef<(HTMLInputElement | null)[]>([null, null, null, null, null, null]);

  const handleAcceptRules = () => {
    if (!agreeChecked) return;
    setRulesAccepted(true);
    const uid = auth.currentUser?.uid;
    if (uid) {
      // Record acceptance (not a trust field — self-write is allowed by rules).
      setDoc(doc(db, 'users', uid), { rulesAcceptedAt: serverTimestamp() }, { merge: true }).catch(() => {});
    }
  };

  const handleSend = () => {
    const cleaned = phoneInput.replace(/\D/g, '').replace(/^0/, '');
    if (cleaned.length < 10) return;
    sendVerificationCode('+92' + cleaned);
  };

  const handleOtpChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;
    const newOtp = [...otp];
    newOtp[index] = value.slice(-1);
    setOtp(newOtp);
    if (value && index < 5) otpRefs.current[index + 1]?.focus();
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
  };

  const handleVerify = async () => {
    const code = otp.join('');
    if (code.length < 6) return;
    const success = await verifyOTP(code);
    if (success) onSuccess();
  };

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="glass-panel rounded-[2rem] border border-white/10 w-full max-w-[calc(100vw-1.5rem)] sm:max-w-md max-h-[90vh] overflow-y-auto p-5 sm:p-8 flex flex-col gap-6 relative">
        <div id="recaptcha-container" className="hidden" />

        {/* Ambient glow */}
        <div className="absolute -top-16 left-1/2 -translate-x-1/2 w-56 h-56 bg-primary/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-16 right-0 w-40 h-40 bg-accent-purple/10 rounded-full blur-3xl pointer-events-none" />

        {/* Header */}
        <div className="flex items-start justify-between relative">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/15 border border-primary/30 flex items-center justify-center shrink-0 shadow-[0_0_12px_rgba(13,242,242,0.2)]">
                <span className="material-symbols-outlined text-primary text-xl leading-none">verified_user</span>
              </div>
              <h2 className="font-bold text-xl leading-tight">Seller Verification</h2>
            </div>
            <p className="text-gray-500 text-sm mt-1 ml-[52px]">
              {!rulesAccepted
                ? 'Review and accept the marketplace rules to continue.'
                : step === 'phone'
                  ? 'Enter your phone number to receive a verification code.'
                  : `Code sent to +92 ${phone}. Enter it below.`}
            </p>
          </div>
          <button onClick={onClose} className="size-10 flex items-center justify-center rounded-full hover:bg-white/10 transition-colors shrink-0" aria-label="Close seller verification">
            <span className="material-symbols-outlined text-base leading-none">close</span>
          </button>
        </div>

        {/* Step 0 — Rules & Regulations agreement */}
        {!rulesAccepted && (
          <div className="flex flex-col gap-4 relative">
            <div className="rounded-xl border border-white/10 bg-black/30 max-h-64 overflow-y-auto p-4 flex flex-col gap-3">
              {MARKETPLACE_RULES.map((rule, i) => (
                <div key={i} className="flex gap-3">
                  <span className="text-primary font-mono text-xs shrink-0 mt-0.5">{String(i + 1).padStart(2, '0')}</span>
                  <div>
                    <p className="text-sm font-semibold text-white">{rule.title}</p>
                    <p className="text-xs text-gray-400 leading-relaxed mt-0.5">{rule.body}</p>
                  </div>
                </div>
              ))}
            </div>
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={agreeChecked}
                onChange={e => setAgreeChecked(e.target.checked)}
                className="accent-primary w-4 h-4 mt-0.5 shrink-0"
              />
              <span className="text-xs text-gray-300 leading-relaxed">
                I have read and agree to the marketplace rules. I understand that scams or dishonest
                conduct confirmed by a valid report will result in my listings and account being disabled.
              </span>
            </label>
            <button
              onClick={handleAcceptRules}
              disabled={!agreeChecked}
              className="w-full py-3 rounded-xl bg-primary text-bg-dark font-bold text-sm hover:bg-cyan-300 transition-all shadow-[0_0_15px_rgba(13,242,242,0.3)] disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none flex items-center justify-center gap-2"
            >
              <span className="material-symbols-outlined text-base leading-none">gavel</span>
              Agree &amp; Continue
            </button>
          </div>
        )}

        {rulesAccepted && (<>
        {/* Step indicators */}
        <div className="flex items-center gap-2 relative">
          <div className={`w-7 h-7 rounded-full text-xs font-bold flex items-center justify-center border transition-all ${
            step === 'phone'
              ? 'bg-primary text-bg-dark border-primary shadow-[0_0_10px_rgba(13,242,242,0.4)]'
              : 'bg-primary/20 border-primary/40 text-primary'
          }`}>
            {step === 'otp'
              ? <span className="material-symbols-outlined text-xs leading-none">check</span>
              : '1'}
          </div>
          <div className={`flex-1 h-px max-w-[2rem] transition-colors ${step === 'otp' ? 'bg-primary/40' : 'bg-white/10'}`} />
          <div className={`w-7 h-7 rounded-full text-xs font-bold flex items-center justify-center border transition-all ${
            step === 'otp'
              ? 'bg-primary text-bg-dark border-primary shadow-[0_0_10px_rgba(13,242,242,0.4)]'
              : 'bg-white/5 border-white/10 text-gray-500'
          }`}>2</div>
          <span className="text-xs text-gray-500 ml-1">
            {step === 'phone' ? 'Phone Number' : 'Verify Code'}
          </span>
        </div>

        {/* Step 1 — Phone input */}
        {step === 'phone' && (
          <div className="flex flex-col gap-4 relative">
            <div>
              <label className="text-sm text-gray-400 mb-2 block">Phone Number</label>
              <div className="flex items-stretch bg-black/40 border border-white/10 rounded-xl overflow-hidden focus-within:border-primary/50 transition-colors">
                <select
                  disabled
                  className="bg-transparent px-4 py-3 text-sm text-gray-400 border-r border-white/10 cursor-not-allowed shrink-0 appearance-none focus:outline-none"
                >
                  <option>+92</option>
                </select>
                <input
                  type="tel"
                  value={phoneInput}
                  onChange={e => setPhoneInput(e.target.value.replace(/\D/g, '').slice(0, 11))}
                  onKeyDown={e => { if (e.key === 'Enter') handleSend(); }}
                  placeholder="3001234567"
                  className="flex-1 bg-transparent px-4 py-3 text-sm text-white placeholder-gray-500 focus:outline-none"
                />
              </div>
            </div>
            {statusMessage && (
              <div className="flex items-center gap-2 text-primary text-sm bg-primary/10 border border-primary/30 rounded-xl px-4 py-3 font-mono">
                <span className="material-symbols-outlined text-base leading-none animate-spin">progress_activity</span>
                {statusMessage}
              </div>
            )}
            {error && (
              <div className="flex items-center gap-2 text-red-400 text-sm bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3">
                <span className="material-symbols-outlined text-base leading-none">error</span>
                {error}
              </div>
            )}
            <button
              onClick={handleSend}
              disabled={loading || phoneInput.replace(/\D/g, '').length < 10}
              className="w-full py-3 rounded-xl bg-primary text-bg-dark font-bold text-sm hover:bg-cyan-300 transition-all shadow-[0_0_15px_rgba(13,242,242,0.3)] disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <span className="material-symbols-outlined text-base leading-none animate-spin">progress_activity</span>
                  Sending...
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-base leading-none">send</span>
                  Send Verification Code
                </>
              )}
            </button>
          </div>
        )}

        {/* Step 2 — OTP entry */}
        {step === 'otp' && (
          <div className="flex flex-col gap-5 relative">
            <div>
              <label className="text-sm text-gray-400 mb-3 block text-center">Enter 6-digit code</label>
              <div className="flex flex-wrap gap-1.5 sm:gap-2 justify-center">
                {otp.map((digit, i) => (
                  <input
                    key={i}
                    ref={el => { otpRefs.current[i] = el; }}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={e => handleOtpChange(i, e.target.value)}
                    onKeyDown={e => handleOtpKeyDown(i, e)}
                    className="w-10 h-12 sm:w-11 sm:h-14 text-center text-lg sm:text-xl font-bold bg-black/40 border border-white/10 rounded-xl text-white caret-primary focus:border-primary focus:shadow-[0_0_12px_rgba(13,242,242,0.2)] focus:outline-none transition-all"
                  />
                ))}
              </div>
            </div>

            {/* Countdown / resend */}
            <div className="text-center text-sm">
              {timer > 0 ? (
                <span className="text-gray-500">
                  Resend code in <span className="text-primary font-mono font-bold tabular-nums">{timer}s</span>
                </span>
              ) : (
                <button
                  onClick={() => { setOtp(['', '', '', '', '', '']); sendVerificationCode(phone); }}
                  className="text-primary hover:text-cyan-300 transition-colors font-medium underline"
                >
                  Resend code
                </button>
              )}
            </div>

            {/* Error */}
            {error && (
              <div className="flex items-center gap-2 text-red-400 text-sm bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3">
                <span className="material-symbols-outlined text-base leading-none">error</span>
                {error}
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={resetToPhone}
                className="flex-1 py-3 rounded-xl border border-white/10 text-gray-300 hover:bg-white/5 transition-colors text-sm font-medium"
              >
                Back
              </button>
              <button
                onClick={handleVerify}
                disabled={otp.join('').length < 6 || loading}
                className="flex-1 py-3 rounded-xl bg-primary text-bg-dark font-bold text-sm hover:bg-cyan-300 transition-all shadow-[0_0_15px_rgba(13,242,242,0.3)] disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <span className="material-symbols-outlined text-base leading-none animate-spin">progress_activity</span>
                    Verifying...
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-base leading-none">check_circle</span>
                    Verify & Activate
                  </>
                )}
              </button>
            </div>
          </div>
        )}
        </>)}

      </div>
    </div>
  );
}
