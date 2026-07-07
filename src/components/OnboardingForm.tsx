import React, { useState } from 'react';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { User } from 'firebase/auth';
import { Player, Category, DivisionType } from '../types';
import { Check, RefreshCw, AlertCircle, Sparkles, Phone, Info } from 'lucide-react';

interface OnboardingFormProps {
  currentUser: User;
  categories: Category[];
  players: Player[];
  adminIds?: string[];
}

function formatPhone(raw: string): string {
  // Quita todo menos dígitos y el + inicial
  return raw.replace(/[^\d+]/g, '');
}

function isValidPhone(phone: string): boolean {
  const clean = phone.replace(/\D/g, '');
  // Acepta 9 dígitos (España) o con prefijo internacional (9-15 dígitos)
  return clean.length >= 9 && clean.length <= 15;
}

// La categoría inicial de un jugador nuevo es siempre la más baja (mayor "order").
// El admin la reajustará manualmente o mediante el cierre de temporada.
function getLowestTierCategory(categories: Category[]): string {
  if (categories.length === 0) return 'Cuarta';
  const sorted = [...categories].sort((a, b) => (b.order ?? 0) - (a.order ?? 0));
  return sorted[0].name;
}

export default function OnboardingForm({ currentUser, categories, players, adminIds = [] }: OnboardingFormProps) {
  const [nombre, setNombre] = useState(
    currentUser.displayName ? currentUser.displayName.split(' ')[0] : ''
  );
  const [apellidos, setApellidos] = useState(
    currentUser.displayName ? currentUser.displayName.split(' ').slice(1).join(' ') : ''
  );
  const [telefono, setTelefono] = useState('');
  const [consentimientoTelefono, setConsentimientoTelefono] = useState(false);
  const [division, setDivision] = useState<DivisionType>('Masculina');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!nombre.trim() || !apellidos.trim()) {
      setError('Por favor, introduce tu nombre y apellidos.');
      return;
    }

    if (!telefono.trim()) {
      setError('El número de teléfono es obligatorio para recibir notificaciones de WhatsApp.');
      return;
    }

    if (!isValidPhone(telefono)) {
      setError('Introduce un número de teléfono válido (ej: 612 345 678 o +34 612 345 678).');
      return;
    }

    if (!consentimientoTelefono) {
      setError('Debes aceptar el uso de tu teléfono para notificaciones de retos y resultados.');
      return;
    }

    setLoading(true);
    try {
      // Posición inicial: al final del Ranking Oficial de su división (Art. 9-10).
      // Un admin podrá reubicarlo manualmente si su nivel previo lo justifica (Art. 8).
      const isA = (p: Player) => 
        p.email === 'alvaroestradacabello@gmail.com' ||
        (p as any).esAdmin ||
        (p as any).role === 'admin' ||
        adminIds.includes(p.id);

      const ultimaPosicionDivision = players
        .filter(p => !isA(p) && p.division === division && p.posicion != null)
        .reduce((max, p) => Math.max(max, p.posicion!), 0);

      const playerRef = doc(db, 'players', currentUser.uid);
      await setDoc(playerRef, {
        id: currentUser.uid,
        nombre: nombre.trim(),
        apellidos: apellidos.trim(),
        telefono: formatPhone(telefono),
        telefonoConsentimiento: true,
        telefonoConsentimientoAt: new Date().toISOString(),
        categoria: getLowestTierCategory(categories),
        division,
        puntos: 1000,
        posicion: ultimaPosicionDivision + 1,
        email: currentUser.email,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      localStorage.setItem('just_registered_rules', 'true');
    } catch (err: any) {
      console.error('Error creando ficha de jugador:', err);
      setError('Error al crear ficha de jugador: ' + (err.message || err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="mt-5 space-y-4 text-left">

      {error && (
        <div className="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs rounded-xl flex items-start gap-2">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <span className="leading-normal">{error}</span>
        </div>
      )}

      {/* Nombre */}
      <div className="space-y-1.5">
        <label className="text-[10px] font-mono uppercase tracking-wider text-ink-muted font-bold">
          Nombre
        </label>
        <input
          type="text"
          placeholder="Ej: Carlos"
          value={nombre}
          onChange={e => setNombre(e.target.value)}
          className="w-full bg-[var(--surface-2)] border border-[var(--border-subtle)] rounded-xl px-4 py-2.5 text-sm text-ink placeholder-[var(--text-tertiary)] focus:outline-none focus:border-ball transition-colors"
          required
        />
      </div>

      {/* Apellidos */}
      <div className="space-y-1.5">
        <label className="text-[10px] font-mono uppercase tracking-wider text-ink-muted font-bold">
          Apellidos
        </label>
        <input
          type="text"
          placeholder="Ej: Alcaraz"
          value={apellidos}
          onChange={e => setApellidos(e.target.value)}
          className="w-full bg-[var(--surface-2)] border border-[var(--border-subtle)] rounded-xl px-4 py-2.5 text-sm text-ink placeholder-[var(--text-tertiary)] focus:outline-none focus:border-ball transition-colors"
          required
        />
      </div>

      {/* Teléfono — obligatorio */}
      <div className="space-y-1.5">
        <label className="text-[10px] font-mono uppercase tracking-wider text-ink-muted font-bold flex items-center gap-1.5">
          <Phone className="h-3 w-3 text-ball-safe" />
          Teléfono
          <span className="text-rose-400">*</span>
        </label>
        <input
          type="tel"
          placeholder="Ej: 612 345 678 o +34 612 345 678"
          value={telefono}
          onChange={e => setTelefono(e.target.value)}
          className={`w-full bg-[var(--surface-2)] border rounded-xl px-4 py-2.5 text-sm text-ink placeholder-[var(--text-tertiary)] focus:outline-none transition-colors ${
            telefono && !isValidPhone(telefono)
              ? 'border-rose-500/50 focus:border-rose-500'
              : 'border-[var(--border-subtle)] focus:border-ball'
          }`}
          required
        />
        <p className="text-[10px] text-ink-faint leading-snug flex items-start gap-1">
          <span className="text-ball-safe mt-0.5">●</span>
          Necesario para recibir notificaciones de retos y resultados por WhatsApp.
        </p>
      </div>

      {/* Consentimiento explícito de uso del teléfono */}
      <label className="flex items-start gap-2.5 bg-[var(--surface-2)] border border-[var(--border-subtle)] rounded-xl p-3 cursor-pointer hover:bg-[var(--surface-2)] transition-all">
        <input
          type="checkbox"
          checked={consentimientoTelefono}
          onChange={e => setConsentimientoTelefono(e.target.checked)}
          className="mt-0.5 accent-ball cursor-pointer shrink-0"
          required
        />
        <span className="text-[10px] text-ink-muted leading-relaxed">
          <strong className="text-ink">Acepto</strong> que mi teléfono se use para recibir avisos de retos y resultados por WhatsApp, y que el jugador con quien tenga un reto activo pueda abrir un chat de WhatsApp conmigo desde la app para coordinar el partido. No se publica en ninguna lista ni es visible para el resto de jugadores.
        </span>
      </label>

      {/* División / Sexo */}
      <div className="space-y-1.5">
        <label className="text-[10px] font-mono uppercase tracking-wider text-ink-muted font-bold">
          División / Sexo
        </label>
        <select
          value={division}
          onChange={e => setDivision(e.target.value as DivisionType)}
          className="w-full bg-[var(--surface-2)] border border-[var(--border-subtle)] rounded-xl px-3 py-2.5 text-sm text-ink focus:outline-none focus:border-ball cursor-pointer"
        >
          <option value="Masculina" className="bg-slate-900">Masculina</option>
          <option value="Femenina" className="bg-slate-900">Femenina</option>
        </select>
      </div>

      {/* Info posición inicial asignada automáticamente */}
      <div className="bg-[var(--surface-2)] border border-[var(--border-subtle)] p-3 rounded-xl text-[10px] text-ink-muted leading-relaxed flex items-start gap-2">
        <Info className="h-3.5 w-3.5 text-ball-safe shrink-0 mt-0.5" />
        <span>
          Empezarás en el <strong className="text-ink-muted">último peldaño</strong> de tu división. El equipo de organización podrá reubicarte al principio si tu nivel previo lo requiere para equilibrar los grupos. ¡Subirás peldaños jugando tus partidos semanales y Retos Directos!
        </span>
      </div>

      <button
        type="submit"
        disabled={loading || !consentimientoTelefono}
        className="w-full bg-ball hover:bg-ball-hover disabled:bg-slate-700 disabled:text-ink-muted text-black text-xs font-black uppercase tracking-wider py-3.5 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-2 shadow-lg shadow-lime-950/20"
      >
        {loading ? (
          <RefreshCw className="h-4 w-4 animate-spin text-black" />
        ) : (
          <>
            <Check className="h-4 w-4" />
            <span>Crear Ficha de Jugador</span>
          </>
        )}
      </button>
    </form>
  );
}
