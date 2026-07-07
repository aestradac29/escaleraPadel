export interface Player {
  id: string;
  nombre: string;
  apellidos: string;
  categoria: string; // @deprecated: ya no determina el ranking (Reglamento 2026, Art. 9). Se conserva por compatibilidad.
  division: 'Masculina' | 'Femenina';
  puntos: number; // @deprecated: ya no determina el ranking. Se conserva por compatibilidad/histórico.
  posicion?: number; // Posición oficial en el Ranking RACKET (1 = mejor), por división. Art. 9.
  lastApprovedMatchId?: string; // Último partido a través del cual cambiaron sus puntos/posición (habilita permisos de Firestore, ver firestore.rules)
  email?: string;
  telefono?: string;
  telefonoConsentimiento?: boolean;
  telefonoConsentimientoAt?: string;
  createdAt?: any;
  updatedAt?: any;
}

export type CategoriaType = string;
export type DivisionType = 'Masculina' | 'Femenina';

export interface Category {
  id: string;
  name: string;
  createdAt?: string;
  order?: number;
  // Nº de jugadores que ascienden / descienden al cerrar temporada en esta categoría
  ascendCount?: number;
  descendCount?: number;
}

export interface SeasonMovement {
  playerId: string;
  playerName: string;
  division: 'Masculina' | 'Femenina';
  fromCategoria: string;
  toCategoria: string;
  puntosAlCierre: number;
  tipo: 'ascenso' | 'descenso';
}

export interface Season {
  id: string;
  closedAt: string;
  closedBy: string;
  closedByName: string;
  movimientos: SeasonMovement[];
  puntosReiniciados: boolean;
  totalJugadoresAfectados: number;
}

export interface Sanction {
  id: string;
  playerId: string;
  playerName: string;
  category: string;
  division: DivisionType;
  reason: string;
  pointsDeduction: number; // @deprecated histórico, conservado por compatibilidad
  positionsPenalty?: number; // nº de posiciones que desciende (Reglamento 2026, Art. 30-38)
  movimientos?: { playerId: string; playerName: string; posicionAntes: number; posicionDespues: number }[]; // snapshot exacto para poder anular la sanción con precisión
  appliedAt: string;
  appliedBy: string;
  notes?: string;
}

export interface Match {
  id: string;
  type: '1vs1' | '2vs2';
  playerA1Id: string;
  playerA1Name: string;
  playerA2Id?: string;
  playerA2Name?: string;
  playerB1Id: string;
  playerB1Name: string;
  playerB2Id?: string;
  playerB2Name?: string;
  categoria: CategoriaType;
  division: DivisionType;
  set1A: number;
  set1B: number;
  set2A: number;
  set2B: number;
  set3A?: number;
  set3B?: number;
  winner: 'A' | 'B' | 'playing';
  pointsChange: number;
  playedAt: string;
  scheduledAt?: string;
  createdAt?: any;

  isReto?: 'A' | 'B' | 'none';
  challengeId?: string; // si el partido proviene de un Reto Oficial (Art. 21-26)
  pointsA1?: number;
  pointsA2?: number;
  pointsB1?: number;
  pointsB2?: number;
  posA1?: number;
  posA2?: number;
  posB1?: number;
  posB2?: number;

  // Desglose detallado de los puntos otorgados a cada jugador en este partido
  breakdownA1?: { base: number; gamesWonPoints: number; difficultyBonus: number; challengeBonus: number; immacBonus: number; total: number };
  breakdownA2?: { base: number; gamesWonPoints: number; difficultyBonus: number; challengeBonus: number; immacBonus: number; total: number };
  breakdownB1?: { base: number; gamesWonPoints: number; difficultyBonus: number; challengeBonus: number; immacBonus: number; total: number };
  breakdownB2?: { base: number; gamesWonPoints: number; difficultyBonus: number; challengeBonus: number; immacBonus: number; total: number };

  // ── Flujo de aprobación de resultado ──────────────────────────────
  // 'pending_approval' → jugador envió resultado, esperando confirmación de un rival
  // 'approved'         → rival confirmó (o auto-aprobado tras 24h)
  // 'disputed'         → rival impugnó, admin debe resolver
  // 'auto_approved'    → aprobado automáticamente por expiración de plazo 24h
  resultStatus?: 'pending_approval' | 'approved' | 'disputed' | 'auto_approved';
  resultSubmittedBy?: string;     // uid del jugador que introdujo el resultado
  resultSubmittedByName?: string;
  resultSubmittedAt?: string;     // ISO string
  // Campos pendientes (guardados antes de aplicar puntos)
  pendingSet1A?: number;
  pendingSet1B?: number;
  pendingSet2A?: number;
  pendingSet2B?: number;
  pendingSet3A?: number | null;
  pendingSet3B?: number | null;
  pendingWinner?: 'A' | 'B';
  pendingIsReto?: 'A' | 'B' | 'none';
  pendingPosA1?: number;
  pendingPosA2?: number;
  pendingPosB1?: number;
  pendingPosB2?: number;
  // Aprobación / disputa
  resultApprovedBy?: string;
  resultApprovedByName?: string;
  resultApprovedAt?: string;
  resultDisputedBy?: string;
  resultDisputedByName?: string;
  resultDisputedAt?: string;
  resultDisputedReason?: string;
}

export interface Challenge {
  id: string;
  challengerA1Id: string;
  challengerA1Name: string;
  challengerA2Id: string;
  challengerA2Name: string;
  challengedB1Id: string;
  challengedB1Name: string;
  categoria: string;
  division: 'Masculina' | 'Femenina';
  status: 'pending' | 'accepted' | 'declined' | 'completed';
  createdAt: string;
  scheduledAt?: string; // fecha propuesta por el retador, validada a ≥6 días (Art. 22)
  scheduledTime?: string; // hora propuesta por el retador (Art. 23)
  acceptedAt?: string;
  declinedAt?: string;
  partnerB2Id?: string;
  partnerB2Name?: string;

  // ── Posiciones en el momento del reto (Art. 21-26) ────────────────────────
  posicionRetador: number;
  posicionRetado: number;

  // ── Resultado y movimiento de ranking (Art. 26) ───────────────────────────
  matchId?: string; // partido vinculado, donde se introduce/aprueba el resultado real
  resultStatus?: 'pending' | 'completed';
  ganadorRetador?: boolean;
  movimientoAplicado?: boolean;
}

// ── Jornada Oficial (Reglamento 2026, Capítulos V y VI) ────────────────────
// Partido semanal de grupo de 4 jugadores. Sustituye al sistema de puntos:
// el resultado reordena posiciones dentro del grupo y, si corresponde,
// intercambia al ganador con el último del grupo inmediatamente superior.

export interface JornadaJugador {
  playerId: string;
  playerName: string;
  posicionAntes: number;
  juegosGanados: number;
  juegosPerdidos: number;
}

export interface JornadaMovimiento {
  playerId: string;
  playerName: string;
  posicionAntes: number;
  posicionDespues: number;
}

export interface JornadaOficial {
  id: string;
  division: 'Masculina' | 'Femenina';
  grupo: number;
  jugadores: JornadaJugador[];       // los jugadores que disputaron el partido (normalmente 4)
  clasificacion: string[];           // playerIds en orden 1º a 4º
  movimientos: JornadaMovimiento[];  // incluye también al jugador del grupo superior si hubo ascenso/descenso
  fecha: string;
  registradoPor: string;
  registradoPorNombre: string;
  createdAt: string;
}

