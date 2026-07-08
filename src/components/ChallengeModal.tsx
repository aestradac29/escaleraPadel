import React, { useState, useMemo } from 'react';
import { Player, Challenge } from '../types';
import { db } from '../firebase';
import { collection, doc, setDoc } from 'firebase/firestore';
import { X, Sword, Check, AlertTriangle, Users, RefreshCw, MessageCircle, Calendar, Clock } from 'lucide-react';
import { notifyRetoRecibido, sendWhatsApp } from '../utils/notifications';

interface ChallengeModalProps {
  isOpen: boolean;
  onClose: () => void;
  myProfile: Player | null;
  otherPlayer: Player | null;
  players: Player[];
  challenges: Challenge[];
  adminIds?: string[];
  onChallengeScheduled?: () => void;
}

const MAX_SALTO_PUESTOS = 3;     // Desafío de posiciones
const DIAS_ANTELACION_MIN = 6;   // Margen de antelación
const DIAS_COOLDOWN = 14;        // Frecuencia de retos

function minDateString(daysFromNow: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString().split('T')[0];
}

export function invertDate(dateStr: string | undefined): string {
  if (!dateStr) return '';
  const parts = dateStr.split('T')[0].split('-');
  if (parts.length === 3) {
    const [year, month, day] = parts;
    return `${day}/${month}/${year}`;
  }
  return dateStr;
}

export default function ChallengeModal({
  isOpen,
  onClose,
  myProfile,
  otherPlayer,
  players,
  challenges,
  adminIds = [],
  onChallengeScheduled
}: ChallengeModalProps) {
  const [playerA2Id, setPlayerA2Id] = useState('');
  const [fechaPropuesta, setFechaPropuesta] = useState(minDateString(DIAS_ANTELACION_MIN));
  const [horaPropuesta, setHoraPropuesta] = useState('18:00');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Compañeros elegibles: cualquier jugador de la clasificación (misma división/género) que no sea admin.
  const eligiblePartners = useMemo(() => {
    if (!myProfile) return [];
    const isA = (p: Player) =>
      p.email === 'alvaroestradacabello@gmail.com' ||
      (p as any).esAdmin ||
      (p as any).role === 'admin' ||
      adminIds.includes(p.id);

    return players
      .filter(p =>
        !isA(p) &&
        p.division === myProfile.division &&
        p.id !== myProfile.id &&
        (!otherPlayer || p.id !== otherPlayer.id)
      )
      .sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [players, myProfile, otherPlayer, adminIds]);

  if (!isOpen || !myProfile || !otherPlayer) return null;

  const myPos = myProfile.posicion ?? null;
  const otherPos = otherPlayer.posicion ?? null;
  const salto = myPos != null && otherPos != null ? myPos - otherPos : 0;

  const sinPosicion = myPos == null || otherPos == null;
  const isEligibleByRank = !sinPosicion && otherPos! < myPos!;
  const withinRange = !sinPosicion && salto <= MAX_SALTO_PUESTOS;

  // Art. 22: un reto activo (pendiente o aceptado y no jugado) cada 2 semanas
  const now = Date.now();
  const resetTime = myProfile.lastChallengeReset ? new Date(myProfile.lastChallengeReset).getTime() : 0;
  const misRetosRecientes = challenges.filter(c =>
    c.challengerA1Id === myProfile.id &&
    new Date(c.createdAt).getTime() > resetTime &&
    (now - new Date(c.createdAt).getTime()) < DIAS_COOLDOWN * 24 * 60 * 60 * 1000 &&
    c.status !== 'declined'
  );
  const cooldownActivo = misRetosRecientes.length > 0;

  // No se puede retar dos veces al mismo rival mientras el reto previo siga vivo o reciente
  const yaRetadoReciente = challenges.some(c =>
    c.challengerA1Id === myProfile.id &&
    c.challengedB1Id === otherPlayer.id &&
    new Date(c.createdAt).getTime() > resetTime &&
    (now - new Date(c.createdAt).getTime()) < DIAS_COOLDOWN * 24 * 60 * 60 * 1000 &&
    c.status !== 'declined'
  );

  const fechaValida = fechaPropuesta >= minDateString(DIAS_ANTELACION_MIN);

  const isEligible = isEligibleByRank && withinRange && !cooldownActivo && !yaRetadoReciente;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    if (!playerA2Id) {
      setError("Por favor, selecciona tu compañero de equipo para el reto.");
      return;
    }
    if (!fechaValida) {
      setError(`La fecha debe ser, como mínimo, dentro de ${DIAS_ANTELACION_MIN} días.`);
      return;
    }

    setLoading(true);

    try {
      const comradeA = players.find(p => p.id === playerA2Id);

      const challengeId = doc(collection(db, 'challenges')).id;
      await setDoc(doc(db, 'challenges', challengeId), {
        id: challengeId,
        challengerA1Id: myProfile.id,
        challengerA1Name: `${myProfile.nombre} ${myProfile.apellidos}`,
        challengerA2Id: comradeA!.id,
        challengerA2Name: `${comradeA!.nombre} ${comradeA!.apellidos}`,
        challengedB1Id: otherPlayer.id,
        challengedB1Name: `${otherPlayer.nombre} ${otherPlayer.apellidos}`,
        categoria: myProfile.categoria,
        division: myProfile.division,
        posicionRetador: myPos,
        posicionRetado: otherPos,
        scheduledAt: fechaPropuesta,
        scheduledTime: horaPropuesta,
        status: 'pending',
        createdAt: new Date().toISOString(),
      });

      // Intento automático de notificación (best-effort). Puede ser bloqueado
      // por el navegador al ocurrir tras un `await`, por eso además se ofrece
      // el botón "Avisar por WhatsApp" abajo para que el usuario lo dispare
      // él mismo con un click directo.
      notifyRetoRecibido(otherPlayer, `${myProfile.nombre} ${myProfile.apellidos}`);

      setSuccess(true);
      if (onChallengeScheduled) {
        onChallengeScheduled();
      }
    } catch (err: any) {
      console.error("Error creando el reto:", err);
      setError("Ocurrió un error al enviar el reto: " + (err.message || err));
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
      <div className="relative w-full max-w-lg glass-card border border-[var(--border-subtle)] rounded-2xl shadow-2xl p-6 overflow-hidden text-ink z-10 animate-in fade-in zoom-in-95 duration-150">

        {/* Glow Line */}
        <div className="absolute top-0 left-1/4 right-1/4 h-[1px] bg-gradient-to-r from-transparent via-ball/40 to-transparent" />

        {/* Header */}
        <div className="flex justify-between items-center mb-5 border-b border-[var(--border-subtle)] pb-4">
          <div>
            <h3 className="font-display text-lg font-black uppercase tracking-tight text-ink flex items-center gap-2">
              <Sword className="h-5 w-5 text-ball-safe" />
              <span>Reto Directo Racket</span>
            </h3>
            <p className="text-ink-faint text-[11px] font-sans mt-0.5">Reta de forma amistosa a un rival mejor clasificado en la escalera.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-ink-muted hover:text-ink rounded-lg hover:bg-[var(--surface-2)] transition-all text-sm cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Main Body */}
        <form onSubmit={handleSubmit} className="space-y-4">

          {/* Rank check details */}
          <div className="bg-[var(--surface-input)] border border-[var(--border-subtle)] rounded-xl p-3.5 space-y-2">
            <div className="flex justify-between items-center text-xs">
              <span className="text-ink-muted">Tu posición:</span>
              <span className="font-mono font-bold text-ball-safe">{myPos ? `#${myPos}` : 'Sin asignar'}</span>
            </div>
            <div className="flex justify-between items-center text-xs">
              <span className="text-ink-muted">Posición de {otherPlayer.nombre}:</span>
              <span className="font-mono font-bold text-ball-safe">{otherPos ? `#${otherPos}` : 'Sin asignar'}</span>
            </div>
            {!sinPosicion && (
              <div className="flex justify-between items-center text-xs border-t border-[var(--border-subtle)] pt-2">
                <span className="text-ink-muted">Diferencia de posiciones:</span>
                <span className="font-mono font-bold">+{salto} puesto(s)</span>
              </div>
            )}

            <div className="border-t border-[var(--border-subtle)] pt-2 flex items-start gap-2">
              {sinPosicion ? (
                <div className="flex items-center gap-1.5 text-rose-300 text-xs font-bold w-full bg-rose-500/10 p-2 rounded-lg border border-rose-500/20">
                  <AlertTriangle className="h-4 w-4 text-rose-400 shrink-0" />
                  <span>Alguno de los dos jugadores aún no tiene posición asignada en la escalera.</span>
                </div>
              ) : !isEligibleByRank ? (
                <div className="flex items-center gap-1.5 text-rose-300 text-xs font-bold w-full bg-rose-500/10 p-2 rounded-lg border border-rose-500/20">
                  <AlertTriangle className="h-4 w-4 text-rose-400 shrink-0" />
                  <span>Solo puedes retar a jugadores mejor clasificados que tú.</span>
                </div>
              ) : !withinRange ? (
                <div className="flex items-center gap-1.5 text-rose-300 text-xs font-bold w-full bg-rose-500/10 p-2 rounded-lg border border-rose-500/20">
                  <AlertTriangle className="h-4 w-4 text-rose-400 shrink-0" />
                  <span>El rival que elijas debe estar como máximo a {MAX_SALTO_PUESTOS} puestos por encima.</span>
                </div>
              ) : cooldownActivo ? (
                <div className="flex items-center gap-1.5 text-rose-300 text-xs font-bold w-full bg-rose-500/10 p-2 rounded-lg border border-rose-500/20">
                  <AlertTriangle className="h-4 w-4 text-rose-400 shrink-0" />
                  <span>¡Poco a poco! Ya tienes un reto en marcha; la norma es proponer un reto como máximo cada dos semanas.</span>
                </div>
              ) : yaRetadoReciente ? (
                <div className="flex items-center gap-1.5 text-rose-300 text-xs font-bold w-full bg-rose-500/10 p-2 rounded-lg border border-rose-500/20">
                  <AlertTriangle className="h-4 w-4 text-rose-400 shrink-0" />
                  <span>Ya has retado a {otherPlayer.nombre} recientemente. Espera un poco o consúltalo con Patri.</span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 text-emerald-300 text-xs font-bold w-full bg-emerald-500/15 p-2 rounded-lg border border-emerald-500/20">
                  <Check className="h-4 w-4 text-ball-safe shrink-0 font-bold" />
                  <span>¡Perfecto! Todo listo para lanzar tu reto.</span>
                </div>
              )}
            </div>
          </div>

          {isEligible && (
            <>
              {error && (
                <div className="bg-rose-500/10 border border-rose-500/20 text-rose-300 p-3 rounded-xl text-xs flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-rose-400" />
                  <span>{error}</span>
                </div>
              )}

              {success ? (
                <>
                  <div className="bg-ball/10 border border-ball/20 text-ball-safe p-3 rounded-xl text-xs flex items-center gap-2">
                    <Check className="h-4 w-4 shrink-0 text-ball-safe font-bold" />
                    <span>¡Reto enviado! Ya aparece en "Retos" para que {otherPlayer.nombre} elija día/hora y compañero.</span>
                  </div>

                  <button
                    type="button"
                    onClick={() => sendWhatsApp(
                      otherPlayer.telefono,
                      `Hola ${otherPlayer.nombre} 👋\n*${myProfile.nombre} ${myProfile.apellidos}* te ha enviado un Reto Oficial RACKET, propuesto para el ${invertDate(fechaPropuesta)} a las ${horaPropuesta}.\n\nEntra en la app para aceptarlo o rechazarlo.`
                    )}
                    disabled={!otherPlayer.telefono}
                    title={!otherPlayer.telefono ? `${otherPlayer.nombre} no tiene teléfono registrado` : undefined}
                    className="w-full flex items-center justify-center gap-2 bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-400 font-black uppercase tracking-widest text-[11px] py-3 rounded-xl transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <MessageCircle className="h-4 w-4" />
                    <span>Avisar a {otherPlayer.nombre} por WhatsApp</span>
                  </button>

                  <button
                    type="button"
                    onClick={onClose}
                    className="w-full py-2.5 bg-[var(--surface-2)] hover:bg-[var(--surface-2)] text-ink font-bold text-xs rounded-xl transition-all cursor-pointer"
                  >
                    Cerrar
                  </button>
                </>
              ) : (
                <>
                  {/* Fecha y Hora propuesta (Art. 22: mínimo 6 días de antelación) */}
                  <div className="bg-[var(--surface-2)] border border-[var(--border-subtle)] rounded-xl p-3 space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <label className="flex items-center gap-1.5 text-[10px] font-bold text-ball-safe uppercase font-mono tracking-widest">
                          <Calendar className="h-3.5 w-3.5" />
                          <span>Fecha</span>
                        </label>
                        <input
                          type="date"
                          min={minDateString(DIAS_ANTELACION_MIN)}
                          value={fechaPropuesta}
                          onChange={(e) => setFechaPropuesta(e.target.value)}
                          className="w-full bg-[var(--surface-input)] border border-[var(--border-subtle)] text-ink text-xs py-2 px-2.5 rounded-xl focus:outline-none focus:border-ball/50 transition-all"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="flex items-center gap-1.5 text-[10px] font-bold text-ball-safe uppercase font-mono tracking-widest">
                          <Clock className="h-3.5 w-3.5" />
                          <span>Hora</span>
                        </label>
                        <input
                          type="time"
                          value={horaPropuesta}
                          onChange={(e) => setHoraPropuesta(e.target.value)}
                          className="w-full bg-[var(--surface-input)] border border-[var(--border-subtle)] text-ink text-xs py-2 px-2.5 rounded-xl focus:outline-none focus:border-ball/50 transition-all"
                          required
                        />
                      </div>
                    </div>
                    <p className="text-[10px] text-ink-faint leading-snug">
                      Para que tu rival pueda organizarse bien, indícanos una fecha con un mínimo de {DIAS_ANTELACION_MIN} días de antelación. La reserva de pista corre a cargo del retador.
                    </p>
                  </div>

                  {/* Selección de compañero propio */}
                  <div className="bg-[var(--surface-2)] border border-[var(--border-subtle)] rounded-xl p-3 space-y-3">
                    <div className="flex items-center gap-1.5 text-[10px] font-bold text-ball-safe uppercase font-mono tracking-widest">
                      <Users className="h-4 w-4" />
                      <span>Tu Equipo</span>
                    </div>

                    <div>
                      <label className="block text-[9px] font-bold text-ink-faint uppercase tracking-wider mb-1 font-mono">Tu compañero</label>
                      <select
                        value={playerA2Id}
                        onChange={(e) => setPlayerA2Id(e.target.value)}
                        className="w-full bg-[var(--surface-input)] border border-[var(--border-subtle)] text-ink text-xs py-2 px-2.5 rounded-xl focus:outline-none focus:border-ball/50 transition-all cursor-pointer"
                      >
                        <option value="">-- Selecciona un compañero --</option>
                        {eligiblePartners.map(p => (
                          <option key={p.id} value={p.id} className="bg-slate-900 text-ink">
                            {p.nombre} {p.apellidos}
                          </option>
                        ))}
                      </select>
                    </div>

                    <p className="text-[10px] text-ink-faint leading-snug">
                      {otherPlayer.nombre} elegirá a su propio compañero al aceptar tu propuesta de reto.
                    </p>
                  </div>

                  {/* Form Actions */}
                  <div className="flex gap-2 pt-4 border-t border-[var(--border-subtle)]">
                    <button
                      type="button"
                      onClick={onClose}
                      className="flex-1 py-2.5 bg-[var(--surface-2)] hover:bg-[var(--surface-2)] text-ink font-bold text-xs rounded-xl transition-all cursor-pointer"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={loading || !fechaValida}
                      className="flex-1 bg-ball hover:bg-ball-hover disabled:opacity-50 text-black font-black uppercase tracking-widest text-[11px] py-2.5 rounded-xl flex items-center justify-center gap-1.5 transition-all shadow-md shadow-lime-950/20 cursor-pointer"
                    >
                      {loading ? (
                        <RefreshCw className="h-4 w-4 animate-spin text-black" />
                      ) : (
                        <Sword className="h-4 w-4 text-black font-bold" />
                      )}
                      <span>Enviar Reto</span>
                    </button>
                  </div>
                </>
              )}
            </>
          )}

          {!isEligible && (
            <div className="space-y-4 pt-3 border-t border-[var(--border-subtle)]">
              {(() => {
                const miRetoPendienteMasReciente = challenges
                  .filter(c => c.challengerA1Id === myProfile.id && c.status === 'pending')
                  .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
                const rivalPlayer = miRetoPendienteMasReciente
                  ? players.find(p => p.id === miRetoPendienteMasReciente.challengedB1Id)
                  : null;

                if (!miRetoPendienteMasReciente || !rivalPlayer) return null;

                return (
                  <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl space-y-2 text-xs text-left">
                    <div className="text-emerald-400 font-bold flex items-center gap-1.5">
                      <MessageCircle className="h-4 w-4 shrink-0 text-emerald-400" />
                      <span>¿No pudiste enviar el WhatsApp?</span>
                    </div>
                    <p className="text-ink-muted text-[11px] leading-snug">
                      Tienes un reto activo propuesto para el <strong>{invertDate(miRetoPendienteMasReciente.scheduledAt)}</strong>. Puedes volver a enviar la invitación por WhatsApp a <strong>{miRetoPendienteMasReciente.challengedB1Name}</strong>:
                    </p>
                    <button
                      type="button"
                      onClick={() => sendWhatsApp(
                        rivalPlayer.telefono,
                        `Hola ${rivalPlayer.nombre} 👋\n*${myProfile.nombre} ${myProfile.apellidos}* te ha enviado un Reto Oficial RACKET, propuesto para el ${invertDate(miRetoPendienteMasReciente.scheduledAt)}.\n\nEntra en la app para aceptarlo o rechazarlo.`
                      )}
                      disabled={!rivalPlayer.telefono}
                      className="w-full flex items-center justify-center gap-2 bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-400 font-black uppercase tracking-widest text-[10px] py-2.5 rounded-xl transition-all cursor-pointer disabled:opacity-30"
                    >
                      <MessageCircle className="h-4 w-4" />
                      <span>Enviar Invitación por WhatsApp</span>
                    </button>
                  </div>
                );
              })()}

              <button
                type="button"
                onClick={onClose}
                className="w-full py-2.5 bg-[var(--surface-2)] hover:bg-[var(--surface-2)] text-ink font-bold text-xs rounded-xl transition-all cursor-pointer"
              >
                Cerrar Ventana
              </button>
            </div>
          )}

        </form>
      </div>
    </div>
  );
}
