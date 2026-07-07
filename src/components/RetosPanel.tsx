import React from 'react';
import { Player, Challenge, Match } from '../types';
import { db } from '../firebase';
import { doc, updateDoc, setDoc, collection } from 'firebase/firestore';
import { Sword, Check, X, Users, Clock, Inbox, Send, AlertTriangle, RefreshCw, MessageCircle, Calendar } from 'lucide-react';
import { notifyRetoAceptado, notifyRetoCancelado, sendWhatsApp } from '../utils/notifications';

interface RetosPanelProps {
  challenges: Challenge[];
  players: Player[];
  myProfile: Player | null;
  adminIds?: string[];
  onRefreshData?: () => void;
}

function formatDateTime(isoString: string | undefined) {
  if (!isoString) return '';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return '';
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${day}/${month}/${year} ${hours}:${minutes}`;
  } catch {
    return '';
  }
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

export default function RetosPanel({ challenges, players, myProfile, adminIds = [], onRefreshData }: RetosPanelProps) {
  const [acceptingId, setAcceptingId] = React.useState<string | null>(null);
  const [selectedPartnerId, setSelectedPartnerId] = React.useState('');
  const [loadingId, setLoadingId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  if (!myProfile) {
    return (
      <div className="glass-card rounded-2xl border border-[var(--border-subtle)] p-8 text-center text-ink-muted text-sm">
        Necesitas tener una ficha de jugador para ver tus retos.
      </div>
    );
  }

  const recibidos = challenges.filter(c => c.challengedB1Id === myProfile.id && c.status === 'pending');
  const enviados = challenges.filter(c => c.challengerA1Id === myProfile.id && c.status === 'pending');
  const historial = challenges
    .filter(c =>
      (c.challengerA1Id === myProfile.id || c.challengedB1Id === myProfile.id) &&
      c.status !== 'pending'
    )
    .sort((a, b) => new Date(b.acceptedAt || b.declinedAt || b.createdAt).getTime() - new Date(a.acceptedAt || a.declinedAt || a.createdAt).getTime())
    .slice(0, 10);

  const eligiblePartnersFor = (challenge: Challenge) => {
    const isA = (p: Player) =>
      p.email === 'alvaroestradacabello@gmail.com' ||
      (p as any).esAdmin ||
      (p as any).role === 'admin' ||
      adminIds.includes(p.id);

    return players
      .filter(p =>
        !isA(p) &&
        p.division === challenge.division &&
        p.id !== myProfile.id &&
        p.id !== challenge.challengerA1Id &&
        p.id !== challenge.challengerA2Id
      )
      .sort((a, b) => a.nombre.localeCompare(b.nombre));
  };

  const handleStartAccept = (challenge: Challenge) => {
    setAcceptingId(challenge.id);
    setSelectedPartnerId('');
    setError(null);
  };

  const handleConfirmAccept = async (challenge: Challenge) => {
    if (!selectedPartnerId) {
      setError('Selecciona tu compañero para confirmar el reto.');
      return;
    }
    setLoadingId(challenge.id);
    setError(null);
    try {
      const partner = players.find(p => p.id === selectedPartnerId);
      if (!partner) throw new Error('Compañero no encontrado');

      // 1. Crear el partido ya con los 4 jugadores confirmados
      const matchId = doc(collection(db, 'matches')).id;
      const newMatch: Partial<Match> = {
        id: matchId,
        type: '2vs2',
        playerA1Id: challenge.challengerA1Id,
        playerA1Name: challenge.challengerA1Name,
        playerA2Id: challenge.challengerA2Id,
        playerA2Name: challenge.challengerA2Name,
        playerB1Id: myProfile.id,
        playerB1Name: `${myProfile.nombre} ${myProfile.apellidos}`,
        playerB2Id: partner.id,
        playerB2Name: `${partner.nombre} ${partner.apellidos}`,
        categoria: challenge.categoria,
        division: challenge.division,
        set1A: 0, set1B: 0, set2A: 0, set2B: 0,
        winner: 'playing',
        pointsChange: 0,
        isReto: 'A', // El equipo retador es el A
        challengeId: challenge.id,
        playedAt: challenge.scheduledAt || new Date().toISOString().substring(0, 10),
        scheduledAt: challenge.scheduledAt && challenge.scheduledTime
          ? `${challenge.scheduledAt}T${challenge.scheduledTime}:00`
          : challenge.scheduledAt
            ? `${challenge.scheduledAt}T00:00:00`
            : undefined,
        createdAt: new Date().toISOString(),
      };
      await setDoc(doc(db, 'matches', matchId), newMatch);

      // 2. Marcar el reto como aceptado
      await updateDoc(doc(db, 'challenges', challenge.id), {
        status: 'accepted',
        partnerB2Id: partner.id,
        partnerB2Name: `${partner.nombre} ${partner.apellidos}`,
        acceptedAt: new Date().toISOString(),
      });

      // 3. Notificar al retador
      const challenger = players.find(p => p.id === challenge.challengerA1Id);
      if (challenger) {
        notifyRetoAceptado(challenger, `${myProfile.nombre} ${myProfile.apellidos}`);
      }

      setAcceptingId(null);
      setSelectedPartnerId('');
      if (onRefreshData) onRefreshData();
    } catch (err: any) {
      console.error('Error aceptando reto:', err);
      setError('Error al aceptar el reto: ' + (err.message || err));
    } finally {
      setLoadingId(null);
    }
  };

  const handleDecline = async (challenge: Challenge) => {
    setLoadingId(challenge.id);
    try {
      await updateDoc(doc(db, 'challenges', challenge.id), {
        status: 'declined',
        declinedAt: new Date().toISOString(),
      });
      const challenger = players.find(p => p.id === challenge.challengerA1Id);
      if (challenger) {
        notifyRetoCancelado(challenger, `${myProfile.nombre} ${myProfile.apellidos}`);
      }
      if (onRefreshData) onRefreshData();
    } catch (err) {
      console.error('Error rechazando reto:', err);
    } finally {
      setLoadingId(null);
    }
  };

  // Aviso manual por WhatsApp: se dispara directamente en el click (sin await
  // antes), para que el navegador no lo bloquee como pop-up. Le da además al
  // retador control explícito sobre cuándo avisar, sin que se le muestre el
  // número de teléfono del rival en ningún sitio de la interfaz.
  const handleNotifyByWhatsApp = (challenge: Challenge) => {
    const challenged = players.find(p => p.id === challenge.challengedB1Id);
    if (!challenged || !myProfile) return;
    sendWhatsApp(
      challenged.telefono,
      `Hola ${challenged.nombre} 👋\n` +
      `*${myProfile.nombre} ${myProfile.apellidos}* te ha retado a un partido en la Escalera de Pádel.\n\n` +
      `Entra en la app para aceptarlo o rechazarlo.`
    );
  };

  const handleCancelSent = async (challenge: Challenge) => {
    setLoadingId(challenge.id);
    try {
      await updateDoc(doc(db, 'challenges', challenge.id), {
        status: 'declined',
        declinedAt: new Date().toISOString(),
      });
      const challenged = players.find(p => p.id === challenge.challengedB1Id);
      if (challenged) {
        notifyRetoCancelado(challenged, `${myProfile.nombre} ${myProfile.apellidos}`);
      }
      if (onRefreshData) onRefreshData();
    } catch (err) {
      console.error('Error cancelando reto:', err);
    } finally {
      setLoadingId(null);
    }
  };

  return (
    <div className="space-y-6">

      {/* ── Retos Recibidos ─────────────────────────────────────────────── */}
      <div className="glass-card rounded-2xl border border-ball/15 bg-lime-950/5 shadow-2xl p-5 sm:p-6 text-ink">
        <h2 className="font-display text-lg font-black flex items-center gap-2.5 mb-4 pb-3 border-b border-[var(--border-subtle)]">
          <Inbox className="h-5 w-5 text-ball-safe" />
          <span>Retos Recibidos</span>
          {recibidos.length > 0 && (
            <span className="bg-ball text-black text-[10px] font-black px-1.5 py-0.5 rounded-full">{recibidos.length}</span>
          )}
        </h2>

        {recibidos.length === 0 ? (
          <p className="text-ink-faint text-xs italic">No tienes retos pendientes por responder.</p>
        ) : (
          <div className="space-y-3">
            {recibidos.map(challenge => (
              <div key={challenge.id} className="bg-[var(--surface-input)] border border-[var(--border-subtle)] rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 text-sm">
                    <Sword className="h-4 w-4 text-ball-safe" />
                    <span className="font-bold">{challenge.challengerA1Name}</span>
                    <span className="text-ink-faint">&</span>
                    <span className="font-bold">{challenge.challengerA2Name}</span>
                  </div>
                  <span className="text-[10px] text-ink-faint font-mono">{challenge.categoria} · {challenge.division}</span>
                </div>

                {/* Proposed Conditions (Date & Time) */}
                <div className="bg-ball/10 border border-ball/20 text-[11px] text-ink rounded-lg p-2.5 mb-3 flex flex-wrap items-center gap-4">
                  <div className="flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5 text-ball-safe animate-pulse" />
                    <span><strong>Fecha propuesta:</strong> {invertDate(challenge.scheduledAt) || 'Sin fecha'}</span>
                  </div>
                  {challenge.scheduledTime && (
                    <div className="flex items-center gap-1.5 sm:border-l border-[var(--border-subtle)] sm:pl-4">
                      <Clock className="h-3.5 w-3.5 text-ball-safe" />
                      <span><strong>Hora propuesta:</strong> {challenge.scheduledTime}</span>
                    </div>
                  )}
                </div>

                {acceptingId === challenge.id ? (
                  <div className="mt-3 bg-[var(--surface-2)] border border-[var(--border-subtle)] rounded-xl p-3 space-y-2.5">
                    {error && (
                      <div className="bg-rose-500/10 border border-rose-500/20 text-rose-300 p-2 rounded-lg text-[11px] flex items-center gap-1.5">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                        <span>{error}</span>
                      </div>
                    )}
                    <label className="block text-[9px] font-bold text-ink-faint uppercase tracking-wider font-mono">
                      Elige tu compañero para este partido
                    </label>
                    <select
                      value={selectedPartnerId}
                      onChange={(e) => setSelectedPartnerId(e.target.value)}
                      className="w-full bg-[var(--surface-input)] border border-[var(--border-subtle)] text-ink text-xs py-2 px-2.5 rounded-xl focus:outline-none focus:border-ball/50 cursor-pointer"
                    >
                      <option value="">-- Selecciona un compañero --</option>
                      {eligiblePartnersFor(challenge).map(p => (
                        <option key={p.id} value={p.id} className="bg-slate-900 text-ink">
                          {p.nombre} {p.apellidos}
                        </option>
                      ))}
                    </select>
                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={() => handleConfirmAccept(challenge)}
                        disabled={loadingId === challenge.id}
                        className="flex-1 flex items-center justify-center gap-1.5 bg-ball hover:bg-ball-hover text-black font-black text-[11px] uppercase py-2 rounded-lg cursor-pointer disabled:opacity-50"
                      >
                        {loadingId === challenge.id ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                        <span>Confirmar Reto</span>
                      </button>
                      <button
                        onClick={() => { setAcceptingId(null); setError(null); }}
                        className="px-3 py-2 bg-[var(--surface-2)] hover:bg-[var(--surface-2)] text-ink text-[11px] font-bold rounded-lg cursor-pointer"
                      >
                        Atrás
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2 mt-2">
                    <button
                      onClick={() => handleStartAccept(challenge)}
                      className="flex-1 flex items-center justify-center gap-1.5 bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-400 font-bold text-[11px] uppercase py-2 rounded-lg cursor-pointer"
                    >
                      <Check className="h-3.5 w-3.5" />
                      <span>Aceptar</span>
                    </button>
                    <button
                      onClick={() => handleDecline(challenge)}
                      disabled={loadingId === challenge.id}
                      className="flex-1 flex items-center justify-center gap-1.5 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/25 text-rose-400 font-bold text-[11px] uppercase py-2 rounded-lg cursor-pointer disabled:opacity-50"
                    >
                      <X className="h-3.5 w-3.5" />
                      <span>Rechazar</span>
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Retos Enviados ──────────────────────────────────────────────── */}
      <div className="glass-card rounded-2xl border border-[var(--border-subtle)] p-5 sm:p-6 text-ink">
        <h2 className="font-display text-lg font-black flex items-center gap-2.5 mb-4 pb-3 border-b border-[var(--border-subtle)]">
          <Send className="h-5 w-5 text-sky-400" />
          <span>Retos Enviados</span>
          {enviados.length > 0 && (
            <span className="bg-sky-500 text-black text-[10px] font-black px-1.5 py-0.5 rounded-full">{enviados.length}</span>
          )}
        </h2>

        {enviados.length === 0 ? (
          <p className="text-ink-faint text-xs italic">No tienes retos enviados a la espera de respuesta.</p>
        ) : (
          <div className="space-y-2.5">
            {enviados.map(challenge => (
              <div key={challenge.id} className="bg-[var(--surface-input)] border border-[var(--border-subtle)] rounded-xl p-3 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs">
                    <Clock className="h-3.5 w-3.5 text-amber-400 animate-pulse" />
                    <span>Esperando respuesta de <strong>{challenge.challengedB1Name}</strong></span>
                  </div>
                  <button
                    onClick={() => handleCancelSent(challenge)}
                    disabled={loadingId === challenge.id}
                    className="text-rose-400/70 hover:text-rose-400 text-[10px] font-bold uppercase px-2 py-1 rounded-lg hover:bg-rose-500/10 cursor-pointer disabled:opacity-50 shrink-0"
                  >
                    Cancelar
                  </button>
                </div>

                {/* Proposed Conditions for Outgoing Challenges */}
                <div className="text-[11px] text-ink-muted flex flex-wrap items-center gap-3 bg-black/10 p-2.5 rounded-lg border border-[var(--border-subtle)]">
                  <span className="flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5 text-sky-400" />
                    <strong>Fecha:</strong> {invertDate(challenge.scheduledAt) || 'Sin fecha'}
                  </span>
                  {challenge.scheduledTime && (
                    <span className="flex items-center gap-1.5 sm:border-l border-[var(--border-subtle)] sm:pl-3">
                      <Clock className="h-3.5 w-3.5 text-sky-400" />
                      <strong>Hora:</strong> {challenge.scheduledTime}
                    </span>
                  )}
                </div>
                <button
                  onClick={() => handleNotifyByWhatsApp(challenge)}
                  disabled={!players.find(p => p.id === challenge.challengedB1Id)?.telefono}
                  title={!players.find(p => p.id === challenge.challengedB1Id)?.telefono ? `${challenge.challengedB1Name} no tiene teléfono registrado` : undefined}
                  className="w-full flex items-center justify-center gap-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/25 text-emerald-400 font-bold text-[11px] uppercase py-2 rounded-lg cursor-pointer transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <MessageCircle className="h-3.5 w-3.5" />
                  <span>Avisar por WhatsApp</span>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Historial reciente ──────────────────────────────────────────── */}
      {historial.length > 0 && (
        <div className="glass-card rounded-2xl border border-[var(--border-subtle)] p-5 sm:p-6 text-ink">
          <h2 className="font-display text-sm font-black text-ink-muted uppercase tracking-wider mb-3">Historial reciente</h2>
          <div className="space-y-1.5">
            {historial.map(c => (
              <div key={c.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 py-2.5 border-b border-[var(--border-subtle)] last:border-0 text-[11px] text-ink-muted">
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-ink">{c.challengerA1Name} & {c.challengerA2Name}</span>
                    <span className="text-ink-faint">vs</span>
                    <span className="font-bold text-ink">{c.challengedB1Name}</span>
                  </div>
                  <div className="text-[10px] text-ink-faint mt-0.5">
                    Enviado el {formatDateTime(c.createdAt)} · {c.categoria} ({c.division})
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${c.status === 'accepted' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'}`}>
                    {c.status === 'accepted' ? 'Aceptado' : 'Rechazado/Cancelado'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
