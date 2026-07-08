/**
 * generateGroupMatches.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Genera los partidos de la Jornada Oficial semanal a partir de los GRUPOS
 * ACTUALES de la escalera (tramos de 4 posiciones, Art. 10), no de la
 * categoría/puntos deprecados.
 *
 * Cada grupo de 4 jugadores (W, X, Y, Z, ordenados por posición) juega 3
 * partidos de dobles rotando de compañero, cruzándose entre todos ellos
 * (Capítulo V del Reglamento):
 *   Rotación 1: W+X vs Y+Z
 *   Rotación 2: W+Y vs X+Z
 *   Rotación 3: W+Z vs X+Y
 *
 * Son partidos "a juegos corridos" (un único marcador, sin sets) — por eso
 * isReto se deja siempre en 'none' y no se les asigna ningún set de partida.
 */

import { Player, DivisionType } from '../types';
import { getGrupo } from './escalera';

export interface GeneratedGroupMatch {
  grupo: number;
  division: DivisionType;
  rotacion: 1 | 2 | 3;
  playerA1: Player;
  playerA2: Player;
  playerB1: Player;
  playerB2: Player;
}

export interface GroupPreview {
  grupo: number;
  division: DivisionType;
  jugadores: Player[]; // 4 jugadores ordenados por posición
  matches: GeneratedGroupMatch[]; // 3 rotaciones
}

// Excluye administradores del reparto de partidos
function isCompetitivePlayer(p: Player, adminIds: string[]) {
  const isA = p.email === 'alvaroestradacabello@gmail.com' || adminIds.includes(p.id);
  return !isA;
}

/**
 * Calcula, para una división, la agrupación de 4 en 4 según la posición
 * actual en la escalera y las 3 rotaciones de cada grupo completo.
 * Los grupos incompletos (menos de 4 jugadores con posición asignada) se
 * omiten y se devuelven aparte para que el admin sepa que no se generó nada.
 */
export function buildGroupPreviews(
  players: Player[],
  division: DivisionType,
  adminIds: string[] = []
): { grupos: GroupPreview[]; incompletos: { grupo: number; jugadores: Player[] }[] } {
  const jugadoresConPosicion = players
    .filter(p => p.division === division && p.posicion != null && isCompetitivePlayer(p, adminIds))
    .sort((a, b) => (a.posicion! - b.posicion!));

  const porGrupo = new Map<number, Player[]>();
  jugadoresConPosicion.forEach(p => {
    const g = getGrupo(p.posicion!);
    if (!porGrupo.has(g)) porGrupo.set(g, []);
    porGrupo.get(g)!.push(p);
  });

  const grupos: GroupPreview[] = [];
  const incompletos: { grupo: number; jugadores: Player[] }[] = [];

  Array.from(porGrupo.keys()).sort((a, b) => a - b).forEach(g => {
    const jugadores = porGrupo.get(g)!;
    if (jugadores.length !== 4) {
      incompletos.push({ grupo: g, jugadores });
      return;
    }
    const [w, x, y, z] = jugadores;
    grupos.push({
      grupo: g,
      division,
      jugadores,
      matches: [
        { grupo: g, division, rotacion: 1, playerA1: w, playerA2: x, playerB1: y, playerB2: z },
        { grupo: g, division, rotacion: 2, playerA1: w, playerA2: y, playerB1: x, playerB2: z },
        { grupo: g, division, rotacion: 3, playerA1: w, playerA2: z, playerB1: x, playerB2: y },
      ],
    });
  });

  return { grupos, incompletos };
}

export function buildAllGroupPreviews(players: Player[], adminIds: string[] = []) {
  const masculina = buildGroupPreviews(players, 'Masculina', adminIds);
  const femenina = buildGroupPreviews(players, 'Femenina', adminIds);
  return {
    grupos: [...masculina.grupos, ...femenina.grupos],
    incompletos: [...masculina.incompletos, ...femenina.incompletos],
  };
}