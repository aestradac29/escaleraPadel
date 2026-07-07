import { Player } from '../types';

/**
 * Obtener la posición de un jugador en la clasificación por categoría y división.
 * Retorna un índice base 1 (1 para el primero, 2 para el segundo, etc.)
 */
export function getPlayerRankingIndex(
  playerId: string,
  players: Player[],
  categoria: string,
  division: string
): number {
  const filteredSorted = players
    .filter(p => p.categoria === categoria && p.division === division)
    .sort((a, b) => b.puntos - a.puntos);
  
  const index = filteredSorted.findIndex(p => p.id === playerId);
  return index !== -1 ? index + 1 : filteredSorted.length + 1;
}

export interface IndividualPointsBreakdown {
  total: number;
  base: number;
  gamesWonPoints: number;
  difficultyBonus: number;
  challengeBonus: number;
  immacBonus: number;
}

/**
 * Calcula los puntos individuales según el nuevo reglamento oficial RACKET:
 * - Puntos base según puesto (1º=25, 2º=20, 3º=16, 4º=13)
 * - Juegos ganados (+1 por juego)
 * - Bonus por dificultad (+1 si dif de ranking es 1-3, +2 si es 4-7, +3 si es >=8)
 * - Bonus por reto superado (+5 si era retador y ganó el partido)
 * - Bonus de imbatibilidad (+2 si ganó en sets corridos sin perder ningún set)
 */
export function computeIndividualPlayerPoints({
  playerRank,
  opponentRanks,
  assignedPosition,
  gamesWon,
  isChallengerAndWon,
  wonInStraightSets,
}: {
  playerRank: number;
  opponentRanks: number[];
  assignedPosition: number;
  gamesWon: number;
  isChallengerAndWon: boolean;
  wonInStraightSets: boolean;
}): IndividualPointsBreakdown {
  // 1. Puntos base por puesto (1º0=25, 2º=20, 3º=16, 4º=13)
  let base = 13;
  if (assignedPosition === 1) base = 25;
  else if (assignedPosition === 2) base = 20;
  else if (assignedPosition === 3) base = 16;
  else if (assignedPosition === 4) base = 13;

  // 1vs1 fallback: si es una partida individual, el ganador es 1º (25) y el perdedor es 2º (20)
  // Pero para seguridad, dejamos las posiciones asignadas en el formulario.

  // 2. Juegos ganados (+1 por juego ganado)
  const gamesWonPoints = gamesWon;

  // 3. Bonus dificultad: +1 (1-3 puestos superiores), +2 (4-7), +3 (8 o más)
  let difficultyBonus = 0;
  opponentRanks.forEach((oppRank) => {
    const diff = playerRank - oppRank; // Positivo si el oponente está por encima de mí
    if (diff >= 8) {
      difficultyBonus = Math.max(difficultyBonus, 3);
    } else if (diff >= 4) {
      difficultyBonus = Math.max(difficultyBonus, 2);
    } else if (diff >= 1) {
      difficultyBonus = Math.max(difficultyBonus, 1);
    }
  });

  // 4. Bonus por reto superado (+5)
  const challengeBonus = isChallengerAndWon ? 5 : 0;

  // 5. Bonus de imbatibilidad (+2) - solo para los ganadores (puestos 1º y 2º) que ganaron en sets corridos
  const immacBonus = (assignedPosition === 1 || assignedPosition === 2) && wonInStraightSets ? 2 : 0;

  const total = base + gamesWonPoints + difficultyBonus + challengeBonus + immacBonus;

  return {
    total,
    base,
    gamesWonPoints,
    difficultyBonus,
    challengeBonus,
    immacBonus,
  };
}

/**
 * Mantener soporte heredado para evitar roturas inmediatas de código
 */
export function calculateMatchPoints(
  avgPointsWinner: number,
  avgPointsLoser: number,
  setsWinner: number,
  setsLoser: number
): number {
  const K = 40; 
  const ratingDiff = avgPointsLoser - avgPointsWinner;
  const expectedWinnerScore = 1 / (1 + Math.pow(10, ratingDiff / 400));
  let pointsTransferred = Math.round(K * (1 - expectedWinnerScore));
  if (setsWinner === 2 && setsLoser === 0) {
    pointsTransferred = Math.round(pointsTransferred * 1.0);
  } else if (setsWinner === 2 && setsLoser === 1) {
    pointsTransferred = Math.round(pointsTransferred * 0.8);
  }
  return Math.max(1, pointsTransferred);
}

/**
 * Comprobar si dos jugadores son compatibles
 */
export function areCompatible(playerA: Player, playerB: Player): boolean {
  if (playerA.categoria !== playerB.categoria) return false;
  if (playerA.division !== playerB.division) return false;
  const diff = Math.abs(playerA.puntos - playerB.puntos);
  return diff <= 500;
}
