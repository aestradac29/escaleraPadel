import React, { useState } from 'react';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signInWithPopup
} from 'firebase/auth';
import { auth, googleProvider } from '../firebase';
import { X, Mail, Lock, User as UserIcon, AlertCircle, RefreshCw } from 'lucide-react';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function AuthModal({ isOpen, onClose }: AuthModalProps) {
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  React.useEffect(() => {
    if (!isOpen) {
      setEmail('');
      setPassword('');
      setError(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleGoogleLogin = async () => {
    setError(null);
    setLoading(true);
    try {
      await signInWithPopup(auth, googleProvider);
      onClose();
    } catch (err: any) {
      console.error("Error signing in with Google:", err);
      // Give clear descriptive helpful Spanish errors for common domain whitelist errors
      if (err.code === 'auth/unauthorized-domain') {
        setError(
          "El dominio actual no está autorizado en la consola de Firebase. " +
          "Por favor, añade 'escalera-padel.vercel.app' a la lista de Dominios Autorizados " +
          "en Firebase Console -> Authentication -> Configuración -> Dominios autorizados."
        );
      } else {
        setError(err.message || "Error al iniciar sesión con Google.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    if (!email || !password) {
      setError("Por favor, rellena todos los campos.");
      setLoading(false);
      return;
    }

    try {
      if (isRegister) {
        // Create new user account with email and password
        await createUserWithEmailAndPassword(auth, email, password);
      } else {
        // Sign in existing user
        await signInWithEmailAndPassword(auth, email, password);
      }
      onClose();
    } catch (err: any) {
      console.error("Email auth error:", err);
      // Beautiful Spanish translations for Firebase Auth error codes
      switch (err.code) {
        case 'auth/invalid-email':
          setError("El formato del correo electrónico no es válido.");
          break;
        case 'auth/user-disabled':
          setError("Esta cuenta de usuario ha sido deshabilitada.");
          break;
        case 'auth/user-not-found':
          setError("No se encontró ningún usuario con este correo electrónico. Puedes registrarte cambiando de pestaña.");
          break;
        case 'auth/wrong-password':
          setError("La contraseña es incorrecta.");
          break;
        case 'auth/email-already-in-use':
          setError("Este correo electrónico ya está registrado. Intenta iniciar sesión.");
          break;
        case 'auth/weak-password':
          setError("La contraseña debe tener al menos 6 caracteres.");
          break;
        case 'auth/operation-not-allowed':
          setError("El inicio de sesión con correo y contraseña no está habilitado en tu Firebase. Habilítalo en la consola de Firebase -> Authentication -> Método de acceso.");
          break;
        default:
          setError(err.message || "Ocurrió un error inesperado al procesar tu solicitud.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-slate-950/75 backdrop-blur-md transition-opacity"
        onClick={onClose}
      />

      {/* Modal Card */}
      <div className="relative w-full max-w-md glass-card border border-[var(--border-subtle)] rounded-2xl shadow-2xl p-6 overflow-hidden text-ink z-10 animate-in fade-in zoom-in-95 duration-150">
        
        {/* Glow Element */}
        <div className="absolute top-0 left-1/4 right-1/4 h-[1px] bg-gradient-to-r from-transparent via-ball/40 to-transparent" />

        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <div>
            <h3 className="font-display text-xl font-black uppercase tracking-tight text-ink">
              {isRegister ? 'Crear Cuenta' : 'Iniciar Sesión'}
            </h3>
            <p className="text-xs text-ink-muted mt-1">
              {isRegister ? 'Únete a la Liga Escalera Racket 2026' : 'Accede a tu cuenta de jugador'}
            </p>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 hover:bg-[var(--surface-2)] rounded-lg text-ink-muted hover:text-ink transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Error Banner */}
        {error && (
          <div className="mb-4 p-3.5 bg-rose-500/10 border border-rose-500/20 text-rose-200 text-xs rounded-xl flex items-start space-x-2.5">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <span className="leading-normal">{error}</span>
          </div>
        )}

        {/* Auth Form */}
        <form onSubmit={handleEmailAuth} className="space-y-4">
          
          {/* Email Input */}
          <div className="space-y-1.5">
            <label className="text-xs font-mono uppercase tracking-wider text-ink-muted">Correo Electrónico</label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-ink-muted">
                <Mail className="h-4 w-4" />
              </span>
              <input 
                type="email"
                placeholder="ejemplo@correo.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-[var(--surface-2)] border border-[var(--border-subtle)] rounded-xl pl-10 pr-4 py-2.5 text-sm text-ink placeholder-[var(--text-tertiary)] focus:outline-none focus:border-ball transition-colors"
                required
              />
            </div>
          </div>

          {/* Password Input */}
          <div className="space-y-1.5">
            <label className="text-xs font-mono uppercase tracking-wider text-ink-muted font-medium">Contraseña</label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-ink-muted">
                <Lock className="h-4 w-4" />
              </span>
              <input 
                type="password"
                placeholder="Mínimo 6 caracteres"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-[var(--surface-2)] border border-[var(--border-subtle)] rounded-xl pl-10 pr-4 py-2.5 text-sm text-ink placeholder-[var(--text-tertiary)] focus:outline-none focus:border-ball transition-colors"
                required
              />
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-ball hover:bg-ball-hover disabled:bg-slate-700 disabled:text-ink-muted text-black text-xs font-black uppercase tracking-wider py-3 rounded-xl transition-all cursor-pointer flex items-center justify-center space-x-2 shadow-lg shadow-lime-950/20"
          >
            {loading ? (
              <RefreshCw className="h-4 w-4 animate-spin text-black" />
            ) : (
              <span>{isRegister ? 'Crear Cuenta' : 'Acceder'}</span>
            )}
          </button>
        </form>

        {/* Divider */}
        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-[var(--border-subtle)]" />
          </div>
          <div className="relative flex justify-center text-xs">
            <span className="bg-[var(--surface-1)] px-3 text-ink-faint font-mono uppercase">O continuar con</span>
          </div>
        </div>

        {/* Google Authentication Option */}
        <button
          type="button"
          onClick={handleGoogleLogin}
          disabled={loading}
          className="w-full flex items-center justify-center space-x-2.5 bg-[var(--surface-2)] border border-[var(--border-subtle)] hover:bg-[var(--surface-2)] text-ink font-semibold text-xs uppercase tracking-wider py-3 px-4 rounded-xl transition-all cursor-pointer disabled:opacity-55"
        >
          {/* Custom vector Google colored icon */}
          <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="currentColor">
            <path
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              fill="#4285F4"
            />
            <path
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              fill="#34A853"
            />
            <path
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
              fill="#FBBC05"
            />
            <path
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
              fill="#EA4335"
            />
          </svg>
          <span>Acceder con Google</span>
        </button>

        {/* Footer Toggle Switch */}
        <div className="mt-6">
          {isRegister ? (
            <button
              type="button"
              onClick={() => {
                setIsRegister(false);
                setError(null);
              }}
              className="w-full flex items-center justify-center gap-2 bg-ball/10 hover:bg-ball/20 border-2 border-ball/50 hover:border-ball text-ball-safe font-black text-xs uppercase tracking-wider py-3 rounded-xl transition-all cursor-pointer"
            >
              <UserIcon className="h-4 w-4" />
              <span>¿Ya tienes una cuenta? Inicia sesión</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                setIsRegister(true);
                setError(null);
              }}
              className="w-full flex items-center justify-center gap-2 bg-ball/10 hover:bg-ball/20 border-2 border-ball/50 hover:border-ball text-ball-safe font-black text-xs uppercase tracking-wider py-3 rounded-xl transition-all cursor-pointer"
            >
              <UserIcon className="h-4 w-4" />
              <span>¿No tienes cuenta? Regístrate Gratis</span>
            </button>
          )}
        </div>

      </div>
    </div>
  );
}
