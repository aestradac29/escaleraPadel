import React from 'react';
import { Player, Match, Category, Sanction, JornadaOficial } from '../types';
import { Award, Search, HelpCircle, Trophy, User as UserIcon, Activity, Flame, Edit2, Trash2, Gavel, Sword, RotateCcw } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { getGrupo } from '../utils/escalera';

interface RankingProps {
  players: Player[];
  matches: Match[];
  jornadas?: JornadaOficial[];
  categories?: Category[];
  isAdminMode: boolean;
  onEditPlayer?: (player: Player) => void;
  onDeletePlayer?: (id: string) => void;
  onResetChallengeCooldown?: (id: string) => Promise<void>;
  sanctions?: Sanction[];
  myProfile?: Player | null;
  onChallengePlayer?: (player: Player) => void;
  adminIds?: string[];
}

export default function Ranking({
  players,
  matches,
  jornadas = [],
  categories = [],
  isAdminMode,
  onEditPlayer,
  onDeletePlayer,
  onResetChallengeCooldown,
  sanctions = [],
  myProfile,
  onChallengePlayer,
  adminIds = [],
}: RankingProps) {
  const [filterGrupo, setFilterGrupo] = React.useState<number | 'Todas'>('Todas');
  const [filterDivision, setFilterDivision] = React.useState<string>('Todas');
  const [searchQuery, setSearchQuery] = React.useState<string>('');
  const [deleteConfirmPlayerId, setDeleteConfirmPlayerId] = React.useState<string | null>(null);
  const [resetCooldownConfirmPlayerId, setResetCooldownConfirmPlayerId] = React.useState<string | null>(null);
  const [showTiebreakerRules, setShowTiebreakerRules] = React.useState(false);

  // Pre-calculate user stats from match history including all tiebreaker criteria
  const statsMap = React.useMemo(() => {
    const map: {
      [playerId: string]: {
        played: number;
        won: number;
        lost: number;
        primerosPuestos: number;
        segundosPuestos: number;
        juegosGanados: number;
        sancionesCount: number;
        retosSuperados: number;
      }
    } = {};
    
    // Initialize for all players
    players.forEach(p => {
      const playerSanctions = sanctions.filter(s => s.playerId === p.id);
      map[p.id] = {
        played: 0,
        won: 0,
        lost: 0,
        primerosPuestos: 0,
        segundosPuestos: 0,
        juegosGanados: 0,
        sancionesCount: playerSanctions.length,
        retosSuperados: 0
      };
    });

    // Populate from completed matches
    matches.forEach(m => {
      if (m.winner === 'playing') return; // Skip unfinished matches
      
      const isWinnerA = m.winner === 'A';
      
      const pA1 = m.playerA1Id;
      const pA2 = m.playerA2Id;
      const pB1 = m.playerB1Id;
      const pB2 = m.playerB2Id;

      // Calculate games won
      const gamesA = (m.set1A || 0) + (m.set2A || 0) + (m.set3A || 0);
      const gamesB = (m.set1B || 0) + (m.set2B || 0) + (m.set3B || 0);

      const playersA = [pA1, pA2].filter(Boolean) as string[];
      const playersB = [pB1, pB2].filter(Boolean) as string[];

      // Team A
      playersA.forEach(pid => {
        if (!map[pid]) return;
        map[pid].played++;
        if (isWinnerA) map[pid].won++;
        else map[pid].lost++;

        // Juegos ganados
        map[pid].juegosGanados += gamesA;

        // Retos superados: if isReto is 'A' (A challenged B) and team A won
        if (m.isReto === 'A' && isWinnerA) {
          map[pid].retosSuperados++;
        }
      });

      // Team B
      playersB.forEach(pid => {
        if (!map[pid]) return;
        map[pid].played++;
        if (!isWinnerA) map[pid].won++;
        else map[pid].lost++;

        // Juegos ganados
        map[pid].juegosGanados += gamesB;

        // Retos superados: if isReto is 'B' (B challenged A) and team B won
        if (m.isReto === 'B' && !isWinnerA) {
          map[pid].retosSuperados++;
        }
      });
    });

    // Populate primeros/segundos puestos from completed official Jornadas (Art. 17 desempates)
    jornadas.forEach(j => {
      if (j.jugadores && j.jugadores.length > 0) {
        // Encontrar puntuaciones de juegos ganados únicas de mayor a menor
        const uniqueScores = Array.from(new Set(j.jugadores.map(jg => jg.juegosGanados))).sort((a, b) => b - a);
        const firstScore = uniqueScores[0];
        const secondScore = uniqueScores[1];

        j.jugadores.forEach(jg => {
          if (map[jg.playerId]) {
            if (jg.juegosGanados === firstScore) {
              map[jg.playerId].primerosPuestos++;
            } else if (secondScore !== undefined && jg.juegosGanados === secondScore) {
              map[jg.playerId].segundosPuestos++;
            }
          }
        });
      } else if (j.clasificacion && j.clasificacion.length > 0) {
        // Fallback si no hay listado de jugadores con juegos ganados detallados
        const p1 = j.clasificacion[0];
        const p2 = j.clasificacion[1];
        if (p1 && map[p1]) {
          map[p1].primerosPuestos++;
        }
        if (p2 && map[p2]) {
          map[p2].segundosPuestos++;
        }
      }
    });

    return map;
  }, [players, matches, jornadas, sanctions]);

  // Filter and sort players with custom tiebreaker protocol
  const processedPlayers = React.useMemo(() => {
    // Filter out administrators
    let list = players.filter(p => {
      const isA = p.email === 'alvaroestradacabello@gmail.com' || 
                  adminIds.includes(p.id) || 
                  (p as any).esAdmin || 
                  (p as any).role === 'admin';
      return !isA;
    });

    // Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(p => 
        p.nombre.toLowerCase().includes(q) || 
        p.apellidos.toLowerCase().includes(q)
      );
    }

    // Category filter
    if (filterGrupo !== 'Todas') {
      list = list.filter(p => p.posicion != null && getGrupo(p.posicion) === filterGrupo);
    }

    // Division filter
    if (filterDivision !== 'Todas') {
      list = list.filter(p => p.division === filterDivision);
    }

    // Ordenación oficial: por posición en la escalera (Reglamento 2026, Art. 9).
    // Los jugadores sin posición asignada todavía (pendientes de migración) se
    // muestran al final, ordenados por su puntuación histórica como referencia.
    return list.sort((a, b) => {
      const posA = a.posicion ?? Infinity;
      const posB = b.posicion ?? Infinity;
      if (posA !== posB) return posA - posB;
      if (posA === Infinity) return b.puntos - a.puntos; // fallback para no migrados
      return a.nombre.localeCompare(b.nombre);
    });
  }, [players, searchQuery, filterGrupo, filterDivision, statsMap, adminIds]);

  // Total de jugadores registrados, excluyendo administradores (no son competidores)
  const registeredPlayersCount = React.useMemo(() => {
    return players.filter(p => {
      const isA = p.email === 'alvaroestradacabello@gmail.com' ||
                  adminIds.includes(p.id) ||
                  (p as any).esAdmin ||
                  (p as any).role === 'admin';
      return !isA;
    }).length;
  }, [players, adminIds]);

  // Número de grupos de 4 jugadores reales disponibles para la división seleccionada
  const totalGrupos = React.useMemo(() => {
    const isA = (p: Player) => 
      p.email === 'alvaroestradacabello@gmail.com' ||
      adminIds.includes(p.id) ||
      (p as any).esAdmin ||
      (p as any).role === 'admin';

    if (filterDivision === 'Todas') {
      const mascCount = players.filter(p => !isA(p) && p.division === 'Masculina').length;
      const femCount = players.filter(p => !isA(p) && p.division === 'Femenina').length;
      return Math.max(1, Math.max(Math.ceil(mascCount / 4), Math.ceil(femCount / 4)));
    } else {
      const count = players.filter(p => !isA(p) && p.division === filterDivision).length;
      return Math.max(1, Math.ceil(count / 4));
    }
  }, [players, filterDivision, adminIds]);

  return (
    <div className="glass-card rounded-2xl border border-[var(--border-subtle)] shadow-2xl p-5 sm:p-6 text-ink overflow-hidden">
      
      {/* Header with quick stats */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[var(--border-subtle)] pb-5 mb-6">
        <div>
          <h2 className="font-display text-2xl font-black text-ink flex items-center gap-2.5">
            <Trophy className="h-6 w-6 text-ball-safe filter drop-shadow-[0_0_8px_var(--glow-ball)]" />
            <span>Clasificación General</span>
          </h2>
          <p className="text-ink-muted text-sm mt-1 leading-relaxed">
            Puntuaciones en tiempo real por rendimiento deportivo y desempate oficial.
          </p>
        </div>
        
        {/* Simple count cards */}
        <div className="flex gap-3 text-xs font-semibold">
          <div className="bg-ball/10 text-ball-safe px-3.5 py-2 rounded-xl border border-ball/20 flex items-center gap-1.5">
            <Activity className="h-4 w-4 animate-spin" />
            <span>{registeredPlayersCount} Registrados</span>
          </div>
          <div className="bg-amber-500/10 text-amber-500 px-3.5 py-2 rounded-xl border border-amber-500/20 flex items-center gap-1.5">
            <Flame className="h-4 w-4" />
            <span>{matches.filter(m => m.winner !== 'playing').length} Partidos jugados</span>
          </div>
        </div>
      </div>

      {/* Accordion Explanation: cómo funciona la escalera */}
      <div className="mb-6 bg-[var(--surface-2)] border border-[var(--border-subtle)] rounded-xl p-4 text-xs space-y-2">
        <button
          type="button"
          onClick={() => setShowTiebreakerRules(!showTiebreakerRules)}
          className="flex items-center justify-between font-bold text-ball-safe hover:text-ball-hover transition-colors w-full cursor-pointer text-left"
        >
          <span className="flex items-center gap-2">
            <HelpCircle className="h-4 w-4" />
            <span>¿Cómo funciona la Escalera Racket?</span>
          </span>
          <span className="text-ink-faint font-mono text-[10px]">{showTiebreakerRules ? '[- Ocultar]' : '[+ Ver detalle]'}</span>
        </button>
        {showTiebreakerRules && (
          <div className="mt-2 text-ink-muted space-y-2 border-t border-[var(--border-subtle)] pt-3 leading-relaxed animate-in fade-in duration-150">
            <p>En nuestra Liga <strong className="text-ink">no dependes de acumular puntos</strong>: cada jugador tiene un puesto exacto en la escalera y nos organizamos en <strong className="text-ink">grupos de 4 personas</strong> para jugar.</p>
            <ol className="list-decimal pl-5 space-y-1.5 font-sans">
              <li>🎾 <strong>Partido semanal de grupo:</strong> juegas un divertido partido contra tus 3 compañeros de grupo. Según el resultado (quien quede 1º, 2º, 3º o 4º), se reajustan vuestros puestos dentro del grupo.</li>
              <li>⬆️ <strong>Subir y bajar de grupo:</strong> si ganas en tu grupo, ¡felicidades, asciendes! Te colocarás en el último puesto de la planta superior. En cambio, quien quede último en ese grupo de arriba bajará al primer puesto del tuyo.</li>
              <li>⚔️ <strong>Reto Directo:</strong> ¿quieres acelerar tu subida? Puedes retar directamente a cualquier jugador que esté hasta 3 puestos por encima de ti. Si le ganas el partido, ¡os intercambiáis las posiciones en la escalera!</li>
            </ol>
            <p className="text-[10px] text-ink-faint pt-1">El "Grupo" de la tabla se calcula automáticamente según tu posición actual — no es un nivel fijo para siempre.</p>
          </div>
        )}
      </div>

      {/* Filters Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6">
        
        {/* Search Input */}
        <div className="relative w-full lg:max-w-xs animate-fade-in">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-faint" />
          <input
            id="input-search-player"
            type="text"
            placeholder="Buscar jugador..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[var(--surface-input)] border border-[var(--border-subtle)] text-ink rounded-xl py-2.5 pl-10 pr-4 text-sm focus:outline-none focus:border-ball/50 focus:ring-2 focus:ring-ball/10 transition-all placeholder:text-ink-faint"
          />
        </div>

        {/* Pill Buttons for Categories & Genders */}
        <div className="flex flex-wrap gap-2.5 items-center">
          
          {/* Grupos Selection Bar (tramos de 4 posiciones) */}
          <div className="flex flex-wrap bg-[var(--surface-input)] border border-[var(--border-subtle)] p-1 rounded-xl gap-0.5">
            <button
              onClick={() => setFilterGrupo('Todas')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                filterGrupo === 'Todas'
                  ? 'bg-ball text-black shadow-md'
                  : 'text-ink-muted hover:text-ink hover:bg-[var(--surface-2)]'
              }`}
            >
              Grupos: Todos
            </button>
            {categories.map((cat, idx) => {
              const g = idx + 1;
              return (
                <button
                  key={cat.id}
                  onClick={() => setFilterGrupo(g)}
                  className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                    filterGrupo === g
                      ? 'bg-ball text-black shadow-md'
                      : 'text-ink-muted hover:text-ink hover:bg-[var(--surface-2)]'
                  }`}
                >
                  {cat.name}
                </button>
              );
            })}
          </div>

          {/* Division (Gender) Selection Bar */}
          <div className="flex flex-wrap bg-[var(--surface-input)] border border-[var(--border-subtle)] p-1 rounded-xl gap-0.5">
            <button
              onClick={() => setFilterDivision('Todas')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                filterDivision === 'Todas'
                  ? 'bg-ball text-black shadow-md'
                  : 'text-ink-muted hover:text-ink hover:bg-[var(--surface-2)]'
              }`}
            >
              Géneros: Todos
            </button>
            <button
              onClick={() => setFilterDivision('Masculina')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                filterDivision === 'Masculina'
                  ? 'bg-ball text-black shadow-md'
                  : 'text-ink-muted hover:text-ink hover:bg-[var(--surface-2)]'
              }`}
            >
              Masculino
            </button>
            <button
              onClick={() => setFilterDivision('Femenina')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                filterDivision === 'Femenina'
                  ? 'bg-ball text-black shadow-md'
                  : 'text-ink-muted hover:text-ink hover:bg-[var(--surface-2)]'
              }`}
            >
              Femenino
            </button>
          </div>

        </div>
      </div>

      {/* Leaderboard Table */}
      <div className="overflow-hidden border border-[var(--border-subtle)] rounded-2xl bg-[var(--surface-2)] font-sans">
        <div className="overflow-x-auto">
          {processedPlayers.length === 0 ? (
            <div className="py-16 text-center text-ink-faint">
              <Award className="h-12 w-12 text-ink-faint mx-auto mb-3 stroke-1" />
              <p className="text-sm">No se encontraron jugadores que coincidan con los filtros.</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-[var(--border-subtle)]">
              <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[var(--surface-2)] border-b border-[var(--border-subtle)] text-ink-faint text-[10px] uppercase font-mono tracking-widest font-bold">
                  <th className="py-3 px-4 w-12 text-center">Pos</th>
                  <th className="py-3 px-4">Jugador</th>
                  <th className="py-3 px-4 text-center hidden sm:table-cell">Grupo</th>
                  <th className="py-3 px-4 text-center hidden sm:table-cell">División</th>
                  <th className="py-3 px-4 text-center hidden sm:table-cell">P. Jugados</th>
                  <th className="py-3 px-4 text-center">V / D</th>
                  <th className="py-3 px-4 text-center hidden lg:table-cell">Rendimiento</th>
                  <th className="py-3 px-4 text-right">Posición</th>
                  {(isAdminMode || (myProfile && onChallengePlayer)) && (
                    <th className="py-3 px-4 w-28 text-center">Acciones</th>
                  )}
                </tr>
              </thead>
              <tbody>
                <AnimatePresence mode="popLayout animate">
                  {processedPlayers.map((player, index) => {
                    const pStats = statsMap[player.id] || { played: 0, won: 0, lost: 0, primerosPuestos: 0, segundosPuestos: 0, juegosGanados: 0, sancionesCount: 0, retosSuperados: 0 };
                    const winRate = pStats.played > 0 ? Math.round((pStats.won / pStats.played) * 100) : 0;
                    
                    const pos = player.posicion ?? (index + 1);
                    let posBadge = '';
                    if (pos === 1) posBadge = 'bg-gold text-black font-extrabold shadow-[0_0_14px_rgba(242,184,7,0.45)]';
                    else if (pos === 2) posBadge = 'bg-slate-300 text-black font-extrabold';
                    else if (pos === 3) posBadge = 'bg-amber-700/80 text-white font-extrabold';
                    else posBadge = 'text-ink-muted bg-[var(--surface-2)] font-semibold';

                    return (
                      <motion.tr
                        layout
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        transition={{ duration: 0.2 }}
                        key={player.id}
                        className="bg-transparent hover:bg-[var(--surface-2)] border-b border-[var(--border-subtle)] text-xs sm:text-sm text-ink group transition-all"
                      >
                        {/* Position */}
                        <td className="py-3 px-4 text-center">
                          <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-mono ${posBadge}`}>
                            {pos}
                          </span>
                        </td>
                        
                        {/* Player name */}
                        <td className="py-3 px-4 font-semibold text-ink">
                          {(() => {
                            const playerSanctions = sanctions.filter(s => s.playerId === player.id);
                            const totalDeducted = playerSanctions.reduce((total, s) => total + s.pointsDeduction, 0);
                            return (
                              <div className="flex flex-col justify-center">
                                <span className="truncate group-hover:text-ball-safe transition-colors text-xs sm:text-sm flex items-center gap-1.5 flex-wrap">
                                  <span>{player.nombre} {player.apellidos}</span>
                                  {totalDeducted > 0 && (
                                    <span 
                                      className="inline-flex items-center gap-0.5 bg-rose-500/15 text-rose-500 text-[10px] font-black uppercase tracking-tight px-1.5 py-0.5 rounded border border-rose-500/30"
                                      title={`Penalizaciones aplicadas: ${playerSanctions.map(s => `-${s.pointsDeduction} (${s.reason})`).join(', ')}`}
                                    >
                                      <Gavel className="h-2.5 w-2.5 shrink-0" />
                                      <span>-{totalDeducted} pts</span>
                                    </span>
                                  )}
                                </span>

                                {/* REFLECTED TIEBREAKER CRITERIA BADGES IN LIVE VIEW */}
                                <div className="flex flex-wrap items-center gap-1.5 mt-1.5 text-[9px] text-ink-faint">
                                  <span className="bg-[var(--surface-2)] text-ink-muted px-1.5 py-0.5 rounded border border-[var(--border-subtle)]" title="Criterio 1: Primeros puestos">
                                    🥇 <span className="text-ink font-mono font-bold">{pStats.primerosPuestos}</span> <span className="text-ink-faint">1º</span>
                                  </span>
                                  <span className="bg-[var(--surface-2)] text-ink-muted px-1.5 py-0.5 rounded border border-[var(--border-subtle)]" title="Criterio 2: Segundos puestos">
                                    🥈 <span className="text-ink font-mono font-bold">{pStats.segundosPuestos}</span> <span className="text-ink-faint">2º</span>
                                  </span>
                                  <span className="bg-[var(--surface-2)] text-ink-muted px-1.5 py-0.5 rounded border border-[var(--border-subtle)]" title="Criterio 3: Juegos ganados acumulados">
                                    🎾 <span className="text-ink font-mono font-bold">{pStats.juegosGanados}</span> <span className="text-ink-faint">jg</span>
                                  </span>
                                  {pStats.retosSuperados > 0 && (
                                    <span className="bg-[var(--surface-2)] text-ink-muted px-1.5 py-0.5 rounded border border-[var(--border-subtle)]" title="Criterio 5: Retos semanales superados">
                                      ⚔️ <span className="text-ball-safe font-mono font-bold">{pStats.retosSuperados}</span> <span className="text-ink-faint">retos</span>
                                    </span>
                                  )}
                                </div>

                                <div className="flex flex-wrap items-center gap-1 mt-1.5 sm:hidden">
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[8px] font-extrabold bg-court/10 text-court border border-court/20 uppercase tracking-wider leading-none">
                                    {player.posicion ? (categories[getGrupo(player.posicion) - 1]?.name || `GRUPO ${getGrupo(player.posicion)}`) : 'SIN POSICIÓN'}
                                  </span>
                                  <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[8px] font-extrabold uppercase tracking-wider leading-none ${
                                    player.division === 'Masculina' 
                                      ? 'bg-sky-500/10 text-sky-500 border border-sky-500/20' 
                                      : 'bg-pink-500/10 text-pink-500 border border-pink-500/20'
                                  }`}>
                                    {player.division === 'Masculina' ? 'MASC' : 'FEM'}
                                  </span>
                                </div>
                              </div>
                            );
                          })()}
                        </td>

                        {/* Grupo (Reglamento 2026: tramos de 4 posiciones, no categorías) */}
                        <td className="py-3 px-4 text-center hidden sm:table-cell">
                          {player.posicion ? (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-court/10 text-court border border-court/20 uppercase">
                              {categories[getGrupo(player.posicion) - 1]?.name || `GRUPO ${getGrupo(player.posicion)}`}
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-500 border border-amber-500/20 uppercase">
                              SIN POSICIÓN
                            </span>
                          )}
                        </td>

                        {/* Division */}
                        <td className="py-3 px-4 text-center hidden sm:table-cell">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                            player.division === 'Masculina' 
                              ? 'bg-sky-500/10 text-sky-500 border border-sky-500/20' 
                              : 'bg-pink-500/10 text-pink-500 border border-pink-500/20'
                          }`}>
                            {player.division}
                          </span>
                        </td>

                        {/* Played matches */}
                        <td className="py-3 px-4 text-center font-mono text-ink-muted font-medium hidden sm:table-cell">
                          {pStats.played}
                        </td>

                        {/* Win/Loss ratios */}
                        <td className="py-3 px-4 text-center">
                          <span className="text-xs font-mono">
                            <span className="text-emerald-500 font-bold">{pStats.won}</span>
                            <span className="text-ink-faint mx-1">/</span>
                            <span className="text-rose-500 font-bold">{pStats.lost}</span>
                          </span>
                        </td>

                        {/* Efficiency progression rate bar */}
                        <td className="py-3 px-4 text-center w-32 hidden lg:table-cell">
                          <div className="flex items-center gap-2 justify-center">
                            <span className="text-xs font-bold text-ink-muted font-mono w-8 text-right">{winRate}%</span>
                            <div className="w-16 bg-[var(--surface-2)] rounded-full h-1.5 overflow-hidden border border-[var(--border-subtle)]">
                              <div 
                                className="bg-ball h-full rounded-full transition-all duration-500" 
                                style={{ width: `${winRate}%` }} 
                              />
                            </div>
                          </div>
                        </td>

                        {/* Posición oficial (Reglamento 2026, Art. 9 — ya no hay puntuación) */}
                        <td className="py-3 px-4 text-right font-mono text-base font-black text-court tracking-tight">
                          {player.posicion ? (
                            <>#{player.posicion} <span className="text-[10px] text-ink-faint font-sans font-normal uppercase tracking-wider">puesto</span></>
                          ) : (
                            <span className="text-[11px] text-amber-500 font-sans font-bold uppercase">Pendiente</span>
                          )}
                        </td>

                        {/* Custom player challenge / admin actions trigger column */}
                        {(isAdminMode || (myProfile && onChallengePlayer)) && (
                          <td className="py-3 px-4 text-center">
                            <div className="flex items-center justify-center space-x-1">
                              
                              {/* Botón Retar: elegible si está hasta 3 puestos por encima en su división (Art. 22) */}
                              {myProfile && onChallengePlayer && (() => {
                                const isSelf = player.id === myProfile.id;
                                const sameDivision = player.division === myProfile.division;

                                if (isSelf || !sameDivision || myProfile.posicion == null || player.posicion == null) return null;

                                const salto = myProfile.posicion - player.posicion;
                                const eligibilityCheck = salto > 0 && salto <= 3;

                                if (eligibilityCheck) {
                                  return (
                                    <button
                                      type="button"
                                      onClick={() => onChallengePlayer(player)}
                                      className="p-1 px-2.5 text-ball-safe hover:text-black hover:bg-ball rounded-lg transition-all cursor-pointer flex items-center gap-1 bg-ball/10 border border-ball/20 font-sans font-bold text-[10px] uppercase shadow-xs select-none"
                                      title={`Retar a ${player.nombre}`}
                                    >
                                      <Sword className="h-3 w-3" />
                                      <span>Retar</span>
                                    </button>
                                  );
                                }
                                return null;
                              })()}

                              {/* Admin triggers */}
                              {isAdminMode && (
                                <div className="flex items-center space-x-0.5 border-l border-[var(--border-subtle)] pl-1.5">
                                  {deleteConfirmPlayerId === player.id ? (
                                    <div className="flex items-center gap-1 bg-rose-500/10 border border-rose-500/20 p-1 rounded-lg">
                                      <span className="text-[9px] text-rose-500 font-bold px-1 uppercase tracking-wider">¿Borrar?</span>
                                      <button
                                        onClick={() => {
                                          onDeletePlayer?.(player.id);
                                          setDeleteConfirmPlayerId(null);
                                        }}
                                        className="px-1.5 py-0.5 bg-rose-500 hover:bg-rose-600 text-white text-[9px] font-mono font-bold rounded transition-colors cursor-pointer"
                                      >
                                        SÍ
                                      </button>
                                      <button
                                        onClick={() => setDeleteConfirmPlayerId(null)}
                                        className="px-1.5 py-0.5 bg-[var(--surface-2)] hover:bg-[var(--border-strong)] text-ink text-[9px] font-mono font-bold rounded transition-colors cursor-pointer"
                                      >
                                        NO
                                      </button>
                                    </div>
                                  ) : resetCooldownConfirmPlayerId === player.id ? (
                                    <div className="flex items-center gap-1 bg-amber-500/10 border border-amber-500/20 p-1 rounded-lg">
                                      <span className="text-[9px] text-amber-500 font-bold px-1 uppercase tracking-wider">¿Reset Reto?</span>
                                      <button
                                        onClick={async () => {
                                          if (onResetChallengeCooldown) {
                                            await onResetChallengeCooldown(player.id);
                                          }
                                          setResetCooldownConfirmPlayerId(null);
                                        }}
                                        className="px-1.5 py-0.5 bg-amber-500 hover:bg-amber-600 text-black text-[9px] font-mono font-bold rounded transition-colors cursor-pointer"
                                      >
                                        SÍ
                                      </button>
                                      <button
                                        onClick={() => setResetCooldownConfirmPlayerId(null)}
                                        className="px-1.5 py-0.5 bg-[var(--surface-2)] hover:bg-[var(--border-strong)] text-ink text-[9px] font-mono font-bold rounded transition-colors cursor-pointer"
                                      >
                                        NO
                                      </button>
                                    </div>
                                  ) : (
                                    <>
                                      <button
                                        onClick={() => onEditPlayer?.(player)}
                                        className="p-1 text-ink-faint hover:text-amber-500 hover:bg-[var(--surface-2)] rounded-lg transition-colors cursor-pointer"
                                        title="Editar Jugador"
                                      >
                                        <Edit2 className="h-3 w-3" />
                                      </button>
                                      {onResetChallengeCooldown && (
                                        <button
                                          onClick={() => setResetCooldownConfirmPlayerId(player.id)}
                                          className="p-1 text-ink-faint hover:text-emerald-500 hover:bg-[var(--surface-2)] rounded-lg transition-colors cursor-pointer"
                                          title="Reiniciar tiempo de reto (habilitar reto)"
                                        >
                                          <RotateCcw className="h-3 w-3" />
                                        </button>
                                      )}
                                      <button
                                        onClick={() => setDeleteConfirmPlayerId(player.id)}
                                        className="p-1 text-ink-faint hover:text-rose-500 hover:bg-[var(--surface-2)] rounded-lg transition-colors cursor-pointer"
                                        title="Eliminar Jugador"
                                      >
                                        <Trash2 className="h-3 w-3" />
                                      </button>
                                    </>
                                  )}
                                </div>
                              )}
                            </div>
                          </td>
                        )}
                      </motion.tr>
                    );
                  })}
                </AnimatePresence>
              </tbody>
            </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}