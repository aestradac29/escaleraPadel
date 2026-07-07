import React from 'react';
import { auth } from '../firebase';
import { signOut, onAuthStateChanged, User } from 'firebase/auth';
import { Shield, LogIn, LogOut, Trophy, Sun, Moon } from 'lucide-react';
import { Player } from '../types';

interface NavbarProps {
  isAdminMode: boolean;
  setIsAdminMode: (admin: boolean) => void;
  adminIds: string[];
  onLoginClick: () => void;
  myProfile: Player | null;
  onProfileClick: () => void;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
}

export default function Navbar({
  isAdminMode,
  setIsAdminMode,
  adminIds,
  onLoginClick,
  myProfile,
  onProfileClick,
  theme,
  onToggleTheme,
}: NavbarProps) {
  const [user, setUser] = React.useState<User | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleLogin = () => {
    onLoginClick();
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setIsAdminMode(false);
    } catch (error) {
      console.error("Error signing out:", error);
    }
  };

  // Admin real: email bootstrap o presente en la colección `admins`.
  // (El estado de permiso real ya viene calculado en isAdminMode desde App.tsx;
  // aquí solo determinamos si se debe mostrar el botón para alternar la vista.)
  const isAuthorizedAdmin = user?.email === 'alvaroestradacabello@gmail.com' || (user && adminIds.includes(user.uid));
  const hasAdminRights = !!isAuthorizedAdmin;

  return (
    <nav className="glass-card border-b border-[var(--border-subtle)] sticky top-0 z-50 shadow-lg text-ink">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          
          {/* Logo Brand */}
          <div className="flex items-center space-x-2 sm:space-x-3 shrink-0">
            <div className="bg-ball p-1.5 sm:p-2.5 rounded-xl text-black padel-glow flex items-center justify-center shrink-0">
              <Trophy className="h-4 w-4 sm:h-5 sm:w-5 font-bold" />
            </div>
            <div className="flex flex-col justify-center">
              <span className="font-display text-[10px] sm:text-lg md:text-xl font-black tracking-tighter uppercase leading-none block text-ink whitespace-nowrap">
                Liga Escalera <span className="text-ball-safe">Racket 2026</span>
              </span>
              <span className="text-[7px] sm:text-[9px] uppercase tracking-widest text-ink-faint font-mono mt-0.5">
                Liga Oficial de Pádel
              </span>
            </div>
          </div>

          {/* Controls Bar */}
          <div className="flex items-center space-x-1.5 sm:space-x-3 md:space-x-4">

            {/* Theme Toggle */}
            <button
              id="btn-toggle-theme"
              onClick={onToggleTheme}
              title={theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
              className="p-2 sm:p-2.5 rounded-xl text-ink-muted hover:text-court border border-[var(--border-subtle)] hover:border-court/40 bg-[var(--surface-2)] hover:bg-court/10 transition-all cursor-pointer"
            >
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>

            {/* Admin View Mode Indicator */}
            {hasAdminRights && (
              <button
                id="btn-toggle-admin-view"
                onClick={() => setIsAdminMode(!isAdminMode)}
                className={`flex items-center space-x-1 sm:space-x-1.5 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  isAdminMode 
                    ? 'bg-amber-500 text-white shadow-md shadow-amber-950/40 border border-amber-400' 
                    : 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-500 border border-amber-500/20'
                }`}
              >
                <Shield className="h-3.5 sm:h-4 w-3.5 sm:w-4" />
                <span className="hidden sm:inline">{isAdminMode ? 'Vista Admin' : 'Habilitar Edición'}</span>
              </button>
            )}

            {/* Google Authentication */}
            {!loading && (
              user ? (
                <div className="flex items-center space-x-2">
                  <div 
                    onClick={onProfileClick}
                    className="flex items-center space-x-2.5 bg-[var(--surface-2)] border border-[var(--border-subtle)] hover:border-ball/40 transition-all pl-3 pr-3 py-1.5 rounded-xl cursor-pointer"
                    title="Ver / Editar mi perfil"
                  >
                    <div className="hidden sm:flex flex-col text-left">
                      <span className="text-[11px] font-black text-ink hover:text-ball-safe transition-colors leading-tight">
                        {myProfile ? `${myProfile.nombre} ${myProfile.apellidos}` : (user.displayName || 'Mi Perfil')}
                      </span>
                      <span className="text-[9px] text-court font-mono leading-none tracking-wider font-semibold">
                        {myProfile ? `${myProfile.puntos} PTS • ${myProfile.categoria}` : 'Completar datos'}
                      </span>
                    </div>
                    {user.photoURL ? (
                      <img
                        src={user.photoURL}
                        alt="Avatar"
                        referrerPolicy="no-referrer"
                        className="w-7 h-7 rounded-full border border-[var(--border-subtle)] shrink-0"
                      />
                    ) : (
                      <div className="w-7 h-7 rounded-full bg-ball text-black flex items-center justify-center font-black text-xs shrink-0 font-mono">
                        {user.email?.charAt(0).toUpperCase()}
                      </div>
                    )}
                  </div>
                  <button
                    id="btn-logout"
                    onClick={handleLogout}
                    title="Cerrar sesión"
                    className="p-1.5 text-ink-faint hover:text-rose-500 rounded-lg hover:bg-[var(--surface-2)] cursor-pointer"
                  >
                    <LogOut className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <button
                  id="btn-login"
                  onClick={handleLogin}
                  className="flex items-center space-x-1.5 px-3.5 py-1.5 bg-ball hover:bg-ball-hover text-black rounded-xl text-xs font-black uppercase tracking-wider shadow-md transition-all cursor-pointer"
                >
                  <LogIn className="h-4 w-4" />
                  <span>Login</span>
                </button>
              )
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
