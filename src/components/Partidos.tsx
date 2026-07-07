import React from 'react';
import { Player, Match, Category } from '../types';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { doc, updateDoc, writeBatch, getDoc } from 'firebase/firestore';
import { Calendar, Users, SquareCheck, RefreshCw, Plus, Trash2, Trophy, Clock, Medal, RotateCcw, Search, X, CheckCircle2, XCircle, AlertTriangle, ThumbsUp, ThumbsDown, Send, Swords } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { calculateMatchPoints, getPlayerRankingIndex, computeIndividualPlayerPoints } from '../utils/points';
import { calcularMovimientoReto } from '../utils/escalera';
import { Challenge } from '../types';
import {
  notifyResultadoPendiente,
  notifyResultadoAprobado,
  notifyResultadoDisputado,
} from '../utils/notifications';
import { User } from 'firebase/auth';

interface PartidosProps {
  matches: Match[];
  players: Player[];
  categories?: Category[];
  isAdminMode: boolean;
  currentUser?: User | null;
  myProfile?: Player | null;
  adminEmail?: string;
  onDeleteMatch?: (id: string) => void;
  onRestartMatch?: (id: string) => Promise<void>;
  onRefreshData?: () => void;
}

export default function Partidos({
  matches,
  players,
  categories = [],
  isAdminMode,
  currentUser,
  myProfile,
  adminEmail,
  onDeleteMatch,
  onRestartMatch,
  onRefreshData,
}: PartidosProps) {
  // ── Estado de aprobación de resultados ───────────────────────────────────
  const [disputeMatchId, setDisputeMatchId] = React.useState<string | null>(null);
  const [disputeReason, setDisputeReason] = React.useState('');
  const [approvalLoading, setApprovalLoading] = React.useState<string | null>(null);

  // Auto-aprobación de partidos pendientes con más de 24h
  React.useEffect(() => {
    const autoApproveExpired = async () => {
      const now = new Date();
      const pendingExpired = matches.filter(m =>
        m.resultStatus === 'pending_approval' &&
        m.resultSubmittedAt &&
        (now.getTime() - new Date(m.resultSubmittedAt).getTime()) > 24 * 60 * 60 * 1000
      );
      for (const match of pendingExpired) {
        try {
          await applyPendingResult(match, 'auto');
        } catch (err) {
          console.warn('Auto-approve failed for match', match.id, err);
        }
      }
    };
    if (matches.length > 0) autoApproveExpired();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matches]);

  // Aplica el resultado pendiente a Firestore (puntos + estado final)
  const applyPendingResult = async (
    match: Match,
    approvedBy: 'auto' | string,
    approvedByName?: string
  ) => {
    if (!match.pendingWinner) return;

    const playerA1 = players.find(p => p.id === match.playerA1Id);
    const playerB1 = players.find(p => p.id === match.playerB1Id);
    if (!playerA1 || !playerB1) return;

    const playerA2 = match.playerA2Id ? players.find(p => p.id === match.playerA2Id) : null;
    const playerB2 = match.playerB2Id ? players.find(p => p.id === match.playerB2Id) : null;

    const matchWinner = match.pendingWinner;
    const setsA = [match.pendingSet1A ?? 0, match.pendingSet2A ?? 0, match.pendingSet3A ?? 0].filter(s => s > 0).length;
    const setsB = [match.pendingSet1B ?? 0, match.pendingSet2B ?? 0, match.pendingSet3B ?? 0].filter(s => s > 0).length;
    const setsLoserCount = matchWinner === 'A' ? setsB : setsA;

    const gamesA = (match.pendingSet1A ?? 0) + (match.pendingSet2A ?? 0) + (match.pendingSet3A ?? 0);
    const gamesB = (match.pendingSet1B ?? 0) + (match.pendingSet2B ?? 0) + (match.pendingSet3B ?? 0);

    const rankA1 = getPlayerRankingIndex(playerA1.id, players, match.categoria, match.division);
    const rankA2 = playerA2 ? getPlayerRankingIndex(playerA2.id, players, match.categoria, match.division) : 999;
    const rankB1 = getPlayerRankingIndex(playerB1.id, players, match.categoria, match.division);
    const rankB2 = playerB2 ? getPlayerRankingIndex(playerB2.id, players, match.categoria, match.division) : 999;

    const opRanksA = playerB2 ? [rankB1, rankB2] : [rankB1];
    const opRanksB = playerA2 ? [rankA1, rankA2] : [rankA1];

    const pendingIsReto = (match.pendingIsReto ?? 'none') as 'none' | 'A' | 'B';
    const pa1 = match.pendingPosA1 ?? 1;
    const pa2 = match.pendingPosA2 ?? 2;
    const pb1 = match.pendingPosB1 ?? 3;
    const pb2 = match.pendingPosB2 ?? 4;

    const a1Breakdown = computeIndividualPlayerPoints({
      playerRank: rankA1, opponentRanks: opRanksA, assignedPosition: pa1, gamesWon: gamesA,
      isChallengerAndWon: pendingIsReto === 'A' && matchWinner === 'A',
      wonInStraightSets: matchWinner === 'A' && setsLoserCount === 0,
    });
    const a2Breakdown = playerA2 ? computeIndividualPlayerPoints({
      playerRank: rankA2, opponentRanks: opRanksA, assignedPosition: pa2, gamesWon: gamesA,
      isChallengerAndWon: pendingIsReto === 'A' && matchWinner === 'A',
      wonInStraightSets: matchWinner === 'A' && setsLoserCount === 0,
    }) : null;
    const b1Breakdown = computeIndividualPlayerPoints({
      playerRank: rankB1, opponentRanks: opRanksB, assignedPosition: pb1, gamesWon: gamesB,
      isChallengerAndWon: pendingIsReto === 'B' && matchWinner === 'B',
      wonInStraightSets: matchWinner === 'B' && setsLoserCount === 0,
    });
    const b2Breakdown = playerB2 ? computeIndividualPlayerPoints({
      playerRank: rankB2, opponentRanks: opRanksB, assignedPosition: pb2, gamesWon: gamesB,
      isChallengerAndWon: pendingIsReto === 'B' && matchWinner === 'B',
      wonInStraightSets: matchWinner === 'B' && setsLoserCount === 0,
    }) : null;

    const batch = writeBatch(db);

    // Actualizar el partido
    batch.update(doc(db, 'matches', match.id), {
      set1A: match.pendingSet1A ?? 0,
      set1B: match.pendingSet1B ?? 0,
      set2A: match.pendingSet2A ?? 0,
      set2B: match.pendingSet2B ?? 0,
      set3A: match.pendingSet3A ?? null,
      set3B: match.pendingSet3B ?? null,
      winner: matchWinner,
      playedAt: new Date().toISOString(),
      isReto: pendingIsReto,
      pointsA1: a1Breakdown.total,
      pointsA2: playerA2 ? a2Breakdown?.total : null,
      pointsB1: b1Breakdown.total,
      pointsB2: playerB2 ? b2Breakdown?.total : null,
      breakdownA1: a1Breakdown,
      breakdownA2: playerA2 ? a2Breakdown : null,
      breakdownB1: b1Breakdown,
      breakdownB2: playerB2 ? b2Breakdown : null,
      posA1: pa1, posA2: playerA2 ? pa2 : null,
      posB1: pb1, posB2: playerB2 ? pb2 : null,
      pointsChange: matchWinner === 'A' ? a1Breakdown.total : b1Breakdown.total,
      resultStatus: approvedBy === 'auto' ? 'auto_approved' : 'approved',
      resultApprovedBy: approvedBy === 'auto' ? 'sistema' : approvedBy,
      resultApprovedByName: approvedBy === 'auto' ? 'Auto-aprobado (24h)' : approvedByName,
      resultApprovedAt: new Date().toISOString(),
    });

    // Actualizar puntos de jugadores
    batch.update(doc(db, 'players', playerA1.id), {
      puntos: Math.max(0, playerA1.puntos + a1Breakdown.total),
      updatedAt: new Date().toISOString(),
    });
    batch.update(doc(db, 'players', playerB1.id), {
      puntos: Math.max(0, playerB1.puntos + b1Breakdown.total),
      updatedAt: new Date().toISOString(),
    });
    if (playerA2 && a2Breakdown) {
      batch.update(doc(db, 'players', playerA2.id), {
        puntos: Math.max(0, playerA2.puntos + a2Breakdown.total),
        updatedAt: new Date().toISOString(),
      });
    }
    if (playerB2 && b2Breakdown) {
      batch.update(doc(db, 'players', playerB2.id), {
        puntos: Math.max(0, playerB2.puntos + b2Breakdown.total),
        updatedAt: new Date().toISOString(),
      });
    }

    // ── Reglamento 2026, Art. 26: si el partido proviene de un Reto Oficial,
    // el resultado mueve posiciones en la escalera (retador/retado/intermedios),
    // no puntos. El equipo A es siempre el retador (ver RetosPanel.tsx).
    if (match.challengeId) {
      try {
        const challengeSnap = await getDoc(doc(db, 'challenges', match.challengeId));
        if (challengeSnap.exists()) {
          const challenge = challengeSnap.data() as Challenge;
          const retadorPlayer = players.find(p => p.id === challenge.challengerA1Id);
          const retadoPlayer = players.find(p => p.id === challenge.challengedB1Id);

          if (retadorPlayer?.posicion != null && retadoPlayer?.posicion != null) {
            const ganaRetador = matchWinner === 'A';
            const intermedios = players
              .filter(p =>
                p.division === retadorPlayer.division &&
                p.posicion != null &&
                p.posicion > retadoPlayer.posicion! &&
                p.posicion < retadorPlayer.posicion!
              )
              .map(p => ({ playerId: p.id, playerName: `${p.nombre} ${p.apellidos}`, posicion: p.posicion! }));

            const movimientos = calcularMovimientoReto(
              { playerId: retadorPlayer.id, playerName: `${retadorPlayer.nombre} ${retadorPlayer.apellidos}`, posicion: retadorPlayer.posicion },
              { playerId: retadoPlayer.id, playerName: `${retadoPlayer.nombre} ${retadoPlayer.apellidos}`, posicion: retadoPlayer.posicion },
              ganaRetador,
              intermedios
            );

            movimientos.forEach(mov => {
              batch.update(doc(db, 'players', mov.playerId), {
                posicion: mov.posicionDespues,
                updatedAt: new Date().toISOString(),
              });
            });

            batch.update(doc(db, 'challenges', match.challengeId), {
              status: 'completed',
              resultStatus: 'completed',
              ganadorRetador: ganaRetador,
              movimientoAplicado: true,
              matchId: match.id,
            });
          }
        }
      } catch (err) {
        console.error('Error aplicando movimiento de Reto Oficial (Art. 26):', err);
      }
    }

    await batch.commit();
  };

  // Aprobación de resultado por un rival
  const handleApproveResult = async (match: Match) => {
    if (!currentUser || !myProfile) return;
    setApprovalLoading(match.id);
    try {
      await applyPendingResult(match, currentUser.uid, `${myProfile.nombre} ${myProfile.apellidos}`);
      // Notificar a todos los jugadores del partido
      const allPlayers = [
        players.find(p => p.id === match.playerA1Id),
        match.playerA2Id ? players.find(p => p.id === match.playerA2Id) : undefined,
        players.find(p => p.id === match.playerB1Id),
        match.playerB2Id ? players.find(p => p.id === match.playerB2Id) : undefined,
      ].filter(Boolean) as Player[];
      const summary = `${match.pendingSet1A}-${match.pendingSet1B} / ${match.pendingSet2A}-${match.pendingSet2B}${match.pendingSet3A != null ? ` / ${match.pendingSet3A}-${match.pendingSet3B}` : ''}`;
      await notifyResultadoAprobado(allPlayers, `${myProfile.nombre} ${myProfile.apellidos}`, summary);
    } catch (err) {
      console.error('Error aprobando resultado:', err);
    } finally {
      setApprovalLoading(null);
    }
  };

  // Impugnación de resultado por un rival
  const handleDisputeResult = async (match: Match) => {
    if (!currentUser || !myProfile || !disputeReason.trim()) return;
    setApprovalLoading(match.id);
    try {
      await updateDoc(doc(db, 'matches', match.id), {
        resultStatus: 'disputed',
        resultDisputedBy: currentUser.uid,
        resultDisputedByName: `${myProfile.nombre} ${myProfile.apellidos}`,
        resultDisputedAt: new Date().toISOString(),
        resultDisputedReason: disputeReason,
      });
      const allPlayers = [
        players.find(p => p.id === match.playerA1Id),
        match.playerA2Id ? players.find(p => p.id === match.playerA2Id) : undefined,
        players.find(p => p.id === match.playerB1Id),
        match.playerB2Id ? players.find(p => p.id === match.playerB2Id) : undefined,
      ].filter(Boolean) as Player[];
      await notifyResultadoDisputado(
        allPlayers,
        `${myProfile.nombre} ${myProfile.apellidos}`,
        disputeReason
        // adminPhone: añade aquí el teléfono del admin si quieres recibirlo también
      );
      setDisputeMatchId(null);
      setDisputeReason('');
    } catch (err) {
      console.error('Error impugnando resultado:', err);
    } finally {
      setApprovalLoading(null);
    }
  };

  // Helpers para saber si el usuario actual es participante/rival del partido
  const isParticipant = (match: Match) => {
    if (!currentUser) return false;
    return [match.playerA1Id, match.playerA2Id, match.playerB1Id, match.playerB2Id]
      .includes(currentUser.uid);
  };

  const isOpponentOf = (match: Match, submitterId: string | undefined) => {
    if (!currentUser || !submitterId) return false;
    // Es rival si participa pero no es quien envió el resultado
    return isParticipant(match) && currentUser.uid !== submitterId;
  };

  // ── Desglose de puntos por jugador (click para expandir) ─────────────────
  const [expandedBreakdownKey, setExpandedBreakdownKey] = React.useState<string | null>(null);

  const togglePointsBreakdown = (matchId: string, slot: 'A1' | 'A2' | 'B1' | 'B2') => {
    const key = `${matchId}_${slot}`;
    setExpandedBreakdownKey(prev => (prev === key ? null : key));
  };

  const getSlotBreakdown = (match: Match, slot: 'A1' | 'A2' | 'B1' | 'B2') => {
    const breakdown = (match as any)[`breakdown${slot}`];
    const points = (match as any)[`points${slot}`];
    const name = slot === 'A1' ? match.playerA1Name : slot === 'A2' ? match.playerA2Name : slot === 'B1' ? match.playerB1Name : match.playerB2Name;
    if (points == null) return null;
    return { name, points, breakdown };
  };

  const [filterDivision, setFilterDivision] = React.useState<string>('Todas');
  const [filterCategory, setFilterCategory] = React.useState<string>('Todas');
  const [filterStatus, setFilterStatus] = React.useState<string>('Todos');
  const [searchQuery, setSearchQuery] = React.useState<string>('');
  const [deleteConfirmMatchId, setDeleteConfirmMatchId] = React.useState<string | null>(null);
  const [restartConfirmMatchId, setRestartConfirmMatchId] = React.useState<string | null>(null);

  // Recording results modal state
  const [editingMatch, setEditingMatch] = React.useState<Match | null>(null);
  const [set1A, setSet1A] = React.useState<number>(0);
  const [set1B, setSet1B] = React.useState<number>(0);
  const [set2A, setSet2A] = React.useState<number>(0);
  const [set2B, setSet2B] = React.useState<number>(0);
  const [hasSet3, setHasSet3] = React.useState<boolean>(false);
  const [set3A, setSet3A] = React.useState<number>(0);
  const [set3B, setSet3B] = React.useState<number>(0);
  const [loading, setLoading] = React.useState(false);
  const [modalError, setModalError] = React.useState<string | null>(null);

  // New RACKET-specific states
  const [isReto, setIsReto] = React.useState<'none' | 'A' | 'B'>('none');
  const [posA1, setPosA1] = React.useState<number>(1);
  const [posA2, setPosA2] = React.useState<number>(2);
  const [posB1, setPosB1] = React.useState<number>(3);
  const [posB2, setPosB2] = React.useState<number>(4);

  // Computed winner of the current inputs
  const calculatedWinner = React.useMemo(() => {
    let setsA = 0;
    let setsB = 0;
    if (set1A > set1B) setsA++; else if (set1B > set1A) setsB++;
    if (set2A > set2B) setsA++; else if (set2B > set2A) setsB++;
    if (hasSet3) {
      if (set3A > set3B) setsA++; else if (set3B > set3A) setsB++;
    }
    return setsA > setsB ? 'A' : 'B';
  }, [set1A, set1B, set2A, set2B, hasSet3, set3A, set3B]);

  const prevWinnerRef = React.useRef<'A' | 'B' | null>(null);

  // Auto-allocate default positions on winner change to save clicks
  React.useEffect(() => {
    if (!editingMatch) {
      prevWinnerRef.current = null;
      return;
    }
    
    if (prevWinnerRef.current !== calculatedWinner) {
      prevWinnerRef.current = calculatedWinner;
      if (calculatedWinner === 'A') {
        setPosA1(1);
        setPosA2(2);
        setPosB1(3);
        setPosB2(4);
      } else {
        setPosA1(3);
        setPosA2(4);
        setPosB1(1);
        setPosB2(2);
      }
    }
  }, [calculatedWinner, editingMatch]);

  // Live points preview based on inputted scores in the modal according to official RACKET rules
  const livePreview = React.useMemo(() => {
    if (!editingMatch) return null;

    let setsA = 0;
    let setsB = 0;

    if (set1A > set1B) setsA++; else if (set1B > set1A) setsB++;
    if (set2A > set2B) setsA++; else if (set2B > set2A) setsB++;
    if (hasSet3) {
      if (set3A > set3B) setsA++; else if (set3B > set3A) setsB++;
    }

    const isCompleted = (setsA >= 2 && setsA > setsB) || (setsB >= 2 && setsB > setsA);
    if (!isCompleted) {
      return {
        isValid: false,
        message: "Introduce suficientes juegos/sets para decidir un ganador."
      };
    }

    const matchWinner: 'A' | 'B' = setsA > setsB ? 'A' : 'B';
    const setsLoserCount = matchWinner === 'A' ? setsB : setsA;

    const playerA1 = players.find(p => p.id === editingMatch.playerA1Id);
    const playerB1 = players.find(p => p.id === editingMatch.playerB1Id);
    if (!playerA1 || !playerB1) return null;

    const playerA2 = editingMatch.playerA2Id ? players.find(p => p.id === editingMatch.playerA2Id) : null;
    const playerB2 = editingMatch.playerB2Id ? players.find(p => p.id === editingMatch.playerB2Id) : null;

    // Baseline calculation reverting previous points in case it was already played
    const wasPlayed = editingMatch.winner === 'A' || editingMatch.winner === 'B';
    let baseA1Points = playerA1.puntos;
    let baseA2Points = playerA2 ? playerA2.puntos : 0;
    let baseB1Points = playerB1.puntos;
    let baseB2Points = playerB2 ? playerB2.puntos : 0;

    if (wasPlayed) {
      if (editingMatch.pointsA1 !== undefined) {
        baseA1Points = Math.max(0, playerA1.puntos - (editingMatch.pointsA1 || 0));
        if (playerA2) baseA2Points = Math.max(0, playerA2.puntos - (editingMatch.pointsA2 || 0));
        baseB1Points = Math.max(0, playerB1.puntos - (editingMatch.pointsB1 || 0));
        if (playerB2) baseB2Points = Math.max(0, playerB2.puntos - (editingMatch.pointsB2 || 0));
      } else {
        const oldPointsChange = editingMatch.pointsChange || 0;
        if (editingMatch.winner === 'A') {
          baseA1Points = Math.max(0, playerA1.puntos - oldPointsChange);
          if (playerA2) baseA2Points = Math.max(0, playerA2.puntos - oldPointsChange);
          baseB1Points = playerB1.puntos + oldPointsChange;
          if (playerB2) baseB2Points = playerB2.puntos + oldPointsChange;
        } else {
          baseA1Points = playerA1.puntos + oldPointsChange;
          if (playerA2) baseA2Points = playerA2.puntos + oldPointsChange;
          baseB1Points = Math.max(0, playerB1.puntos - oldPointsChange);
          if (playerB2) baseB2Points = playerB2.puntos - oldPointsChange;
        }
      }
    }

    // Cumulative games won by each team
    const gamesA = set1A + set2A + (hasSet3 ? set3A : 0);
    const gamesB = set1B + set2B + (hasSet3 ? set3B : 0);

    // Dynamic ranks before applying points
    const rankA1 = getPlayerRankingIndex(playerA1.id, players, editingMatch.categoria, editingMatch.division);
    const rankA2 = playerA2 ? getPlayerRankingIndex(playerA2.id, players, editingMatch.categoria, editingMatch.division) : 999;
    const rankB1 = getPlayerRankingIndex(playerB1.id, players, editingMatch.categoria, editingMatch.division);
    const rankB2 = playerB2 ? getPlayerRankingIndex(playerB2.id, players, editingMatch.categoria, editingMatch.division) : 999;

    const opRanksA = playerB2 ? [rankB1, rankB2] : [rankB1];
    const opRanksB = playerA2 ? [rankA1, rankA2] : [rankA1];

    // Compute breakdowns
    const a1Breakdown = computeIndividualPlayerPoints({
      playerRank: rankA1,
      opponentRanks: opRanksA,
      assignedPosition: posA1,
      gamesWon: gamesA,
      isChallengerAndWon: isReto === 'A' && matchWinner === 'A',
      wonInStraightSets: matchWinner === 'A' && setsLoserCount === 0,
    });

    const a2Breakdown = playerA2 ? computeIndividualPlayerPoints({
      playerRank: rankA2,
      opponentRanks: opRanksA,
      assignedPosition: posA2,
      gamesWon: gamesA,
      isChallengerAndWon: isReto === 'A' && matchWinner === 'A',
      wonInStraightSets: matchWinner === 'A' && setsLoserCount === 0,
    }) : null;

    const b1Breakdown = computeIndividualPlayerPoints({
      playerRank: rankB1,
      opponentRanks: opRanksB,
      assignedPosition: posB1,
      gamesWon: gamesB,
      isChallengerAndWon: isReto === 'B' && matchWinner === 'B',
      wonInStraightSets: matchWinner === 'B' && setsLoserCount === 0,
    });

    const b2Breakdown = playerB2 ? computeIndividualPlayerPoints({
      playerRank: rankB2,
      opponentRanks: opRanksB,
      assignedPosition: posB2,
      gamesWon: gamesB,
      isChallengerAndWon: isReto === 'B' && matchWinner === 'B',
      wonInStraightSets: matchWinner === 'B' && setsLoserCount === 0,
    }) : null;

    return {
      isValid: true,
      winner: matchWinner,
      a1Breakdown,
      a2Breakdown,
      b1Breakdown,
      b2Breakdown,
      teamAName: playerA2 ? `${playerA1.nombre} & ${playerA2.nombre}` : playerA1.nombre,
      teamBName: playerB2 ? `${playerB1.nombre} & ${playerB2.nombre}` : playerB1.nombre,
      newA1Points: Math.max(0, baseA1Points + a1Breakdown.total),
      newA2Points: playerA2 && a2Breakdown ? Math.max(0, baseA2Points + a2Breakdown.total) : null,
      newB1Points: Math.max(0, baseB1Points + b1Breakdown.total),
      newB2Points: playerB2 && b2Breakdown ? Math.max(0, baseB2Points + b2Breakdown.total) : null,
      baseA1Points,
      baseA2Points: playerA2 ? baseA2Points : null,
      baseB1Points,
      baseB2Points: playerB2 ? baseB2Points : null,
    };
  }, [editingMatch, set1A, set1B, set2A, set2B, hasSet3, set3A, set3B, isReto, posA1, posA2, posB1, posB2, players]);

  const openResultModal = (match: Match) => {
    setEditingMatch(match);
    setModalError(null);
    setSet1A(match.set1A || 0);
    setSet1B(match.set1B || 0);
    setSet2A(match.set2A || 0);
    setSet2B(match.set2B || 0);
    setHasSet3(!!(match.set3A || match.set3B));
    setSet3A(match.set3A || 0);
    setSet3B(match.set3B || 0);

    setIsReto(match.isReto || 'none');
    setPosA1(match.posA1 || (match.winner === 'B' ? 3 : 1));
    setPosA2(match.posA2 || (match.winner === 'B' ? 4 : 2));
    setPosB1(match.posB1 || (match.winner === 'B' ? 1 : 3));
    setPosB2(match.posB2 || (match.winner === 'B' ? 2 : 4));

    // Reset winner ref tracker
    prevWinnerRef.current = match.winner === 'playing' ? null : match.winner;
  };

  const closeResultModal = () => {
    setEditingMatch(null);
  };

  const handleSaveResult = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMatch) return;

    setLoading(true);
    try {
      let setsA = 0;
      let setsB = 0;

      if (set1A > set1B) setsA++; else if (set1B > set1A) setsB++;
      if (set2A > set2B) setsA++; else if (set2B > set2A) setsB++;
      
      if (hasSet3) {
        if (set3A > set3B) setsA++; else if (set3B > set3A) setsB++;
      }

      if (setsA === setsB && !hasSet3) {
        setModalError("El partido está empatado a sets. Activa el tercer set decisivo para desempatar.");
        setLoading(false);
        return;
      }

      // Check for duplicate positions
      const selectedPositions = [posA1, posB1];
      if (editingMatch.playerA2Id) selectedPositions.push(posA2);
      if (editingMatch.playerB2Id) selectedPositions.push(posB2);
      const positionSet = new Set(selectedPositions);
      if (positionSet.size !== selectedPositions.length) {
        setModalError("Error: Cada jugador debe tener un puesto único (1º, 2º, 3º, 4º) asignado.");
        setLoading(false);
        return;
      }

      const matchWinner: 'A' | 'B' = setsA > setsB ? 'A' : 'B';
      const setsLoserCount = matchWinner === 'A' ? setsB : setsA;

      const playerA1 = players.find(p => p.id === editingMatch.playerA1Id);
      const playerB1 = players.find(p => p.id === editingMatch.playerB1Id);
      
      if (!playerA1 || !playerB1) {
        throw new Error("No se pudieron encontrar los jugadores principales en el estado actual.");
      }

      const playerA2 = editingMatch.playerA2Id ? players.find(p => p.id === editingMatch.playerA2Id) : null;
      const playerB2 = editingMatch.playerB2Id ? players.find(p => p.id === editingMatch.playerB2Id) : null;

      // Revert previous points if it was already played
      const wasPlayed = editingMatch.winner === 'A' || editingMatch.winner === 'B';
      let baseA1Points = playerA1.puntos;
      let baseA2Points = playerA2 ? playerA2.puntos : 0;
      let baseB1Points = playerB1.puntos;
      let baseB2Points = playerB2 ? playerB2.puntos : 0;

      if (wasPlayed) {
        if (editingMatch.pointsA1 !== undefined) {
          baseA1Points = Math.max(0, playerA1.puntos - (editingMatch.pointsA1 || 0));
          if (playerA2) baseA2Points = Math.max(0, playerA2.puntos - (editingMatch.pointsA2 || 0));
          baseB1Points = Math.max(0, playerB1.puntos - (editingMatch.pointsB1 || 0));
          if (playerB2) baseB2Points = Math.max(0, playerB2.puntos - (editingMatch.pointsB2 || 0));
        } else {
          const oldPointsChange = editingMatch.pointsChange || 0;
          if (editingMatch.winner === 'A') {
            baseA1Points = Math.max(0, playerA1.puntos - oldPointsChange);
            if (playerA2) baseA2Points = Math.max(0, playerA2.puntos - oldPointsChange);
            baseB1Points = playerB1.puntos + oldPointsChange;
            if (playerB2) baseB2Points = playerB2.puntos + oldPointsChange;
          } else {
            baseA1Points = playerA1.puntos + oldPointsChange;
            if (playerA2) baseA2Points = playerA2.puntos + oldPointsChange;
            baseB1Points = Math.max(0, playerB1.puntos - oldPointsChange);
            if (playerB2) baseB2Points = playerB2.puntos - oldPointsChange;
          }
        }
      }

      // Games won cumulative counts
      const gamesA = set1A + set2A + (hasSet3 ? set3A : 0);
      const gamesB = set1B + set2B + (hasSet3 ? set3B : 0);

      // Pre-match Ranking index positions
      const rankA1 = getPlayerRankingIndex(playerA1.id, players, editingMatch.categoria, editingMatch.division);
      const rankA2 = playerA2 ? getPlayerRankingIndex(playerA2.id, players, editingMatch.categoria, editingMatch.division) : 999;
      const rankB1 = getPlayerRankingIndex(playerB1.id, players, editingMatch.categoria, editingMatch.division);
      const rankB2 = playerB2 ? getPlayerRankingIndex(playerB2.id, players, editingMatch.categoria, editingMatch.division) : 999;

      const opRanksA = playerB2 ? [rankB1, rankB2] : [rankB1];
      const opRanksB = playerA2 ? [rankA1, rankA2] : [rankA1];

      // Computations
      const a1Breakdown = computeIndividualPlayerPoints({
        playerRank: rankA1,
        opponentRanks: opRanksA,
        assignedPosition: posA1,
        gamesWon: gamesA,
        isChallengerAndWon: isReto === 'A' && matchWinner === 'A',
        wonInStraightSets: matchWinner === 'A' && setsLoserCount === 0,
      });

      const a2Breakdown = playerA2 ? computeIndividualPlayerPoints({
        playerRank: rankA2,
        opponentRanks: opRanksA,
        assignedPosition: posA2,
        gamesWon: gamesA,
        isChallengerAndWon: isReto === 'A' && matchWinner === 'A',
        wonInStraightSets: matchWinner === 'A' && setsLoserCount === 0,
      }) : null;

      const b1Breakdown = computeIndividualPlayerPoints({
        playerRank: rankB1,
        opponentRanks: opRanksB,
        assignedPosition: posB1,
        gamesWon: gamesB,
        isChallengerAndWon: isReto === 'B' && matchWinner === 'B',
        wonInStraightSets: matchWinner === 'B' && setsLoserCount === 0,
      });

      const b2Breakdown = playerB2 ? computeIndividualPlayerPoints({
        playerRank: rankB2,
        opponentRanks: opRanksB,
        assignedPosition: posB2,
        gamesWon: gamesB,
        isChallengerAndWon: isReto === 'B' && matchWinner === 'B',
        wonInStraightSets: matchWinner === 'B' && setsLoserCount === 0,
      }) : null;

      const batch = writeBatch(db);

      const matchRef = doc(db, 'matches', editingMatch.id);
      batch.update(matchRef, {
        set1A,
        set1B,
        set2A,
        set2B,
        set3A: hasSet3 ? set3A : null,
        set3B: hasSet3 ? set3B : null,
        winner: matchWinner,
        playedAt: new Date().toISOString(),

        // Individual scoring system fields
        isReto,
        pointsA1: a1Breakdown.total,
        pointsA2: playerA2 ? a2Breakdown?.total : null,
        pointsB1: b1Breakdown.total,
        pointsB2: playerB2 ? b2Breakdown?.total : null,
        breakdownA1: a1Breakdown,
        breakdownA2: playerA2 ? a2Breakdown : null,
        breakdownB1: b1Breakdown,
        breakdownB2: playerB2 ? b2Breakdown : null,
        posA1,
        posA2: playerA2 ? posA2 : null,
        posB1,
        posB2: playerB2 ? posB2 : null,
        pointsChange: matchWinner === 'A' ? a1Breakdown.total : b1Breakdown.total, // For compatibility
      });

      // Update actual players' points
      const pA1Ref = doc(db, 'players', playerA1.id);
      const newA1Points = Math.max(0, baseA1Points + a1Breakdown.total);
      batch.update(pA1Ref, { puntos: newA1Points, updatedAt: new Date().toISOString() });

      const pB1Ref = doc(db, 'players', playerB1.id);
      const newB1Points = Math.max(0, baseB1Points + b1Breakdown.total);
      batch.update(pB1Ref, { puntos: newB1Points, updatedAt: new Date().toISOString() });

      if (playerA2 && a2Breakdown) {
        const pA2Ref = doc(db, 'players', playerA2.id);
        const newA2Points = Math.max(0, baseA2Points + a2Breakdown.total);
        batch.update(pA2Ref, { puntos: newA2Points, updatedAt: new Date().toISOString() });
      }

      if (playerB2 && b2Breakdown) {
        const pB2Ref = doc(db, 'players', playerB2.id);
        const newB2Points = Math.max(0, baseB2Points + b2Breakdown.total);
        batch.update(pB2Ref, { puntos: newB2Points, updatedAt: new Date().toISOString() });
      }

      if (isAdminMode) {
        // Admin: aplicar directamente sin aprobación
        await batch.commit();
        setEditingMatch(null);
        if (onRefreshData) onRefreshData();
      } else {
        // Jugador: guardar en campos pending y esperar aprobación de un rival
        const matchRef = doc(db, 'matches', editingMatch.id);
        await updateDoc(matchRef, {
          resultStatus: 'pending_approval',
          resultSubmittedBy: currentUser?.uid ?? '',
          resultSubmittedByName: myProfile ? `${myProfile.nombre} ${myProfile.apellidos}` : 'Jugador',
          resultSubmittedAt: new Date().toISOString(),
          pendingSet1A: set1A,
          pendingSet1B: set1B,
          pendingSet2A: set2A,
          pendingSet2B: set2B,
          pendingSet3A: hasSet3 ? set3A : null,
          pendingSet3B: hasSet3 ? set3B : null,
          pendingWinner: matchWinner,
          pendingIsReto: isReto,
          pendingPosA1: posA1,
          pendingPosA2: playerA2 ? posA2 : null,
          pendingPosB1: posB1,
          pendingPosB2: playerB2 ? posB2 : null,
        });

        // Notificar a los rivales
        const rivals = [
          matchWinner === 'A'
            ? players.find(p => p.id === editingMatch.playerB1Id)
            : players.find(p => p.id === editingMatch.playerA1Id),
          matchWinner === 'A' && editingMatch.playerB2Id
            ? players.find(p => p.id === editingMatch.playerB2Id)
            : editingMatch.playerA2Id
            ? players.find(p => p.id === editingMatch.playerA2Id)
            : undefined,
        ].filter(Boolean) as Player[];

        const summary = `${set1A}-${set1B} / ${set2A}-${set2B}${hasSet3 ? ` / ${set3A}-${set3B}` : ''}`;
        const submitterName = myProfile ? `${myProfile.nombre} ${myProfile.apellidos}` : 'Un compañero';
        await notifyResultadoPendiente(rivals, submitterName, summary);

        setEditingMatch(null);
        if (onRefreshData) onRefreshData();
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `matches/${editingMatch?.id}`);
    } finally {
      setLoading(false);
    }
  };

  const filteredMatches = React.useMemo(() => {
    let list = [...matches];

    if (filterDivision !== 'Todas') {
      list = list.filter(m => m.division === filterDivision);
    }

    if (filterCategory !== 'Todas') {
      list = list.filter(m => m.categoria === filterCategory);
    }

    if (filterStatus !== 'Todos') {
      if (filterStatus === 'Jugados') {
        list = list.filter(m => m.winner !== 'playing');
      } else if (filterStatus === 'Pendientes') {
        list = list.filter(m => m.winner === 'playing');
      }
    }

    if (searchQuery.trim() !== '') {
      const q = searchQuery.toLowerCase();
      list = list.filter(m => {
        const a1 = m.playerA1Name?.toLowerCase() || '';
        const a2 = m.playerA2Name?.toLowerCase() || '';
        const b1 = m.playerB1Name?.toLowerCase() || '';
        const b2 = m.playerB2Name?.toLowerCase() || '';
        return a1.includes(q) || a2.includes(q) || b1.includes(q) || b2.includes(q);
      });
    }

    return list.sort((a, b) => b.playedAt ? b.playedAt.localeCompare(a.playedAt) : 0);
  }, [matches, filterDivision, filterCategory, filterStatus, searchQuery]);

  return (
    <div className="glass-card rounded-2xl border border-[var(--border-subtle)] shadow-2xl p-5 sm:p-6 text-ink">
      
      {/* Title */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-[var(--border-subtle)] pb-5 mb-6">
        <div>
          <h2 className="font-display text-2xl font-black text-ink flex items-center gap-2.5">
            <Calendar className="h-6 w-6 text-ball-safe filter drop-shadow-[0_0_8px_var(--glow-ball)]" />
            <span>Calendario & Resultados</span>
          </h2>
          <p className="text-ink-muted text-sm mt-1">
            Encuentros planificados y resultados verificados de la temporada.
          </p>
        </div>

        {/* Tab filters with sleek background */}
        <div className="flex flex-wrap gap-2.5">
          {/* Category selection */}
          <div className="flex flex-wrap bg-[var(--surface-input)] border border-[var(--border-subtle)] p-1 rounded-xl gap-0.5">
            <button
              onClick={() => setFilterCategory('Todas')}
              className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                filterCategory === 'Todas' 
                  ? 'bg-ball text-black shadow-md shadow-lime-950/30' 
                  : 'text-ink-muted hover:text-ink hover:bg-[var(--surface-2)]'
              }`}
            >
              Nivel: Todos
            </button>
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setFilterCategory(cat.name)}
                className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                  filterCategory === cat.name 
                    ? 'bg-ball text-black shadow-md shadow-lime-950/30' 
                    : 'text-ink-muted hover:text-ink hover:bg-[var(--surface-2)]'
                }`}
              >
                {cat.name}
              </button>
            ))}
          </div>

          {/* Division selection */}
          <div className="flex bg-[var(--surface-input)] border border-[var(--border-subtle)] p-1 rounded-xl gap-0.5">
            {['Todas', 'Masculina', 'Femenina'].map((div) => (
              <button
                key={div}
                onClick={() => setFilterDivision(div)}
                className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                  filterDivision === div 
                    ? 'bg-ball text-black shadow-md shadow-lime-950/30' 
                    : 'text-ink-muted hover:text-ink hover:bg-[var(--surface-2)]'
                }`}
              >
                {div === 'Todas' ? 'Géneros: Todos' : div}
              </button>
            ))}
          </div>

          {/* Status selection */}
          <div className="flex bg-[var(--surface-input)] border border-[var(--border-subtle)] p-1.2 rounded-xl">
            {['Todos', 'Jugados', 'Pendientes'].map((stat) => (
              <button
                key={stat}
                onClick={() => setFilterStatus(stat)}
                className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                  filterStatus === stat 
                    ? 'bg-ball text-black shadow-md shadow-lime-950/30' 
                    : 'text-ink-muted hover:text-ink'
                }`}
              >
                {stat}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Buscador de jugadores */}
      <div className="mb-6 relative max-w-md">
        <label htmlFor="search-player-input" className="sr-only">Buscar por jugador</label>
        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
          <Search className="h-4 w-4 text-ink-faint" />
        </div>
        <input
          id="search-player-input"
          type="text"
          placeholder="Buscar partidos por jugador..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full bg-[var(--surface-input)] border border-[var(--border-subtle)] text-ink rounded-xl py-2.5 pl-10 pr-10 text-xs font-semibold placeholder-[var(--text-tertiary)] focus:outline-none focus:border-ball/40 focus:ring-1 focus:ring-ball/30 transition-all font-sans"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-ink-faint hover:text-ink transition-colors cursor-pointer"
            aria-label="Limpiar búsqueda"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Match Cards list */}
      {filteredMatches.length === 0 ? (
        <div className="py-20 text-center text-ink-muted border border-dashed border-[var(--border-subtle)] rounded-2xl bg-[var(--surface-input)]">
          <Users className="h-14 w-14 text-ink-faint mx-auto mb-3 stroke-1" />
          <p className="text-sm font-semibold">No se encontraron enfrentamientos en esta sección</p>
          <p className="text-xs text-ink-faint mt-1">Configura nuevos partidos desde el panel de creación.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <AnimatePresence>
            {filteredMatches.map((match) => {
              const isPlayed = match.winner !== 'playing';
              const isEnJuego = !isPlayed && (!match.scheduledAt || new Date().getTime() >= new Date(match.scheduledAt).getTime());
              const isFuture = !isPlayed && match.scheduledAt && (new Date().getTime() < new Date(match.scheduledAt).getTime());
              
              return (
                <motion.div
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.25 }}
                  key={match.id}
                  className={`border rounded-2xl p-5 relative overflow-hidden transition-all duration-300 hover:scale-[1.01] ${
                    isEnJuego
                      ? 'bg-ball/5 border-ball/20 hover:border-ball/40 shadow-[0_0_15px_var(--glow-ball)]' 
                      : isPlayed 
                        ? 'glass-card border-[var(--border-subtle)] hover:border-ball/30 hover:shadow-[0_0_20px_var(--glow-ball)]' 
                        : 'glass-card border-[var(--border-subtle)] opacity-80 hover:opacity-100 hover:border-[var(--border-subtle)]'
                  }`}
                >
                  {/* Category and Division header badges */}
                  <div className="flex justify-between items-center mb-4">
                    <span className={`text-[10px] font-mono flex items-center gap-1.5 uppercase font-bold tracking-widest ${
                      isPlayed 
                        ? 'text-ink-faint' 
                        : isFuture 
                          ? 'text-ink-faint' 
                          : 'text-lime-400 font-extrabold'
                    }`}>
                      <Clock className={`h-3.5 w-3.5 ${isPlayed || isFuture ? 'text-ink-faint' : 'text-ball-safe animate-pulse'}`} />
                      {isPlayed 
                        ? `JUGADO: ${new Date(match.playedAt).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }).toUpperCase()}` 
                        : isFuture
                          ? `PLANIFICADO: ${new Date(match.scheduledAt!).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }).toUpperCase()} - ${new Date(match.scheduledAt!).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`
                          : 'PLANIFICADO / EN JUEGO'}
                    </span>
                    <div className="flex gap-1.5 items-center">
                      {match.isReto && match.isReto !== 'none' && (
                        <span className="px-2 py-0.5 text-[10px] bg-amber-500/10 border border-amber-500/30 text-amber-400 font-extrabold rounded uppercase flex items-center gap-1 shadow-[0_0_8px_rgba(245,158,11,0.15)]">
                          <Swords className="h-3.5 w-3.5 text-amber-400" />
                          <span>RETO DIRECTO</span>
                        </span>
                      )}
                      <span className="px-2 py-0.5 text-[10px] bg-[var(--surface-2)] border border-[var(--border-subtle)] text-ink font-bold rounded uppercase">
                        {match.categoria}
                      </span>
                      <span className={`px-2 py-0.5 text-[10px] font-bold rounded uppercase ${
                        match.division === 'Masculina' 
                          ? 'bg-sky-500/10 text-sky-400 border border-sky-500/20' 
                          : 'bg-pink-500/10 text-pink-400 border border-pink-500/20'
                      }`}>
                        {match.division}
                      </span>
                    </div>
                  </div>

                  {/* Competitors Block */}
                  <div className="grid grid-cols-5 items-center gap-3 py-2">
                    
                    {/* Team A */}
                    <div className="col-span-2 text-right">
                      <div className={`font-semibold truncate text-[13px] text-ink ${match.winner === 'A' ? 'text-ball-safe font-black' : 'opacity-90'}`}>
                        {match.playerA1Name}
                      </div>
                      {isPlayed && match.pointsA1 != null && (
                        <button
                          onClick={() => togglePointsBreakdown(match.id, 'A1')}
                          className="text-[10px] font-mono font-bold text-ink-faint hover:text-ball-safe transition-colors cursor-pointer"
                        >
                          +{match.pointsA1} pts {expandedBreakdownKey === `${match.id}_A1` ? '▴' : '▾'}
                        </button>
                      )}
                      {match.type === '2vs2' && match.playerA2Name && (
                        <div className={`font-semibold truncate text-[13px] text-ink mt-0.5 ${match.winner === 'A' ? 'text-ball-safe font-black' : 'opacity-90'}`}>
                          & {match.playerA2Name}
                        </div>
                      )}
                      {isPlayed && match.pointsA2 != null && (
                        <button
                          onClick={() => togglePointsBreakdown(match.id, 'A2')}
                          className="text-[10px] font-mono font-bold text-ink-faint hover:text-ball-safe transition-colors cursor-pointer"
                        >
                          +{match.pointsA2} pts {expandedBreakdownKey === `${match.id}_A2` ? '▴' : '▾'}
                        </button>
                      )}
                      {match.winner === 'A' && (
                        <div className="flex justify-end mt-2 pt-2 border-t border-[var(--border-subtle)]">
                          <span className="inline-flex items-center gap-1 text-[9px] bg-ball text-black font-black px-2 py-0.5 rounded-full padel-glow">
                            <Trophy className="h-2.5 w-2.5" /> EQUIPO GANADOR
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Scores Center styled like an electronic scoreboard */}
                    <div className="col-span-1 flex flex-col items-center justify-center bg-[var(--surface-input)] p-2.5 rounded-xl border border-[var(--border-subtle)] min-h-[72px] shadow-inner font-mono gap-1">
                      {isPlayed ? (
                        <div className="flex flex-col items-center justify-center text-center gap-1">
                          {/* Set 1 */}
                          <div className="flex items-center space-x-1.5 text-[12px] font-bold">
                            <span className="text-ink-faint text-[9px] font-extrabold uppercase tracking-wider mr-0.5">S1:</span>
                            <span className={match.winner === 'A' ? 'text-ball-safe' : 'text-ink-faint'}>{match.set1A}</span>
                            <span className="text-ink-faint">-</span>
                            <span className={match.winner === 'B' ? 'text-ball-safe' : 'text-ink-faint'}>{match.set1B}</span>
                          </div>
                          
                          {/* Set 2 */}
                          <div className="flex items-center space-x-1.5 text-[12px] font-bold">
                            <span className="text-ink-faint text-[9px] font-extrabold uppercase tracking-wider mr-0.5">S2:</span>
                            <span className={match.winner === 'A' ? 'text-ball-safe' : 'text-ink-faint'}>{match.set2A}</span>
                            <span className="text-ink-faint">-</span>
                            <span className={match.winner === 'B' ? 'text-ball-safe' : 'text-ink-faint'}>{match.set2B}</span>
                          </div>

                          {/* Set 3 */}
                          {(match.set3A !== null && match.set3A !== undefined && match.set3A !== 0 || match.set3B !== null && match.set3B !== undefined && match.set3B !== 0) && (
                            <div className="flex items-center space-x-1.5 text-[12px] font-bold">
                              <span className="text-ink-faint text-[9px] font-extrabold uppercase tracking-wider mr-0.5">S3:</span>
                              <span className={match.winner === 'A' ? 'text-ball-safe' : 'text-ink-faint'}>{match.set3A}</span>
                              <span className="text-ink-faint">-</span>
                              <span className={match.winner === 'B' ? 'text-ball-safe' : 'text-ink-faint'}>{match.set3B}</span>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="text-center flex flex-col items-center justify-center">
                          <span className={`text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider font-sans shadow-lg ${
                            isFuture 
                              ? 'bg-[var(--surface-2)] text-ink-muted border border-[var(--border-subtle)]' 
                              : 'bg-ball text-slate-950 padel-glow'
                          }`}>
                            VS
                          </span>
                          <span className={`text-[9px] block mt-1.5 uppercase tracking-widest font-mono font-black transition-all ${
                            isFuture ? 'text-ink-faint' : 'text-lime-400 animate-pulse'
                          }`}>
                            {isFuture ? 'Pendiente' : 'En Juego'}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Team B */}
                    <div className="col-span-2 text-left">
                      <div className={`font-semibold truncate text-[13px] text-ink ${match.winner === 'B' ? 'text-ball-safe font-black' : 'opacity-90'}`}>
                        {match.playerB1Name}
                      </div>
                      {isPlayed && match.pointsB1 != null && (
                        <button
                          onClick={() => togglePointsBreakdown(match.id, 'B1')}
                          className="text-[10px] font-mono font-bold text-ink-faint hover:text-ball-safe transition-colors cursor-pointer"
                        >
                          +{match.pointsB1} pts {expandedBreakdownKey === `${match.id}_B1` ? '▴' : '▾'}
                        </button>
                      )}
                      {match.type === '2vs2' && match.playerB2Name && (
                        <div className={`font-semibold truncate text-[13px] text-ink mt-0.5 ${match.winner === 'B' ? 'text-ball-safe font-black' : 'opacity-90'}`}>
                          & {match.playerB2Name}
                        </div>
                      )}
                      {isPlayed && match.pointsB2 != null && (
                        <button
                          onClick={() => togglePointsBreakdown(match.id, 'B2')}
                          className="text-[10px] font-mono font-bold text-ink-faint hover:text-ball-safe transition-colors cursor-pointer"
                        >
                          +{match.pointsB2} pts {expandedBreakdownKey === `${match.id}_B2` ? '▴' : '▾'}
                        </button>
                      )}
                      {match.winner === 'B' && (
                        <div className="flex justify-start mt-2 pt-2 border-t border-[var(--border-subtle)]">
                          <span className="inline-flex items-center gap-1 text-[9px] bg-ball text-black font-black px-2 py-0.5 rounded-full padel-glow">
                            <Trophy className="h-2.5 w-2.5" /> EQUIPO GANADOR
                          </span>
                        </div>
                      )}
                    </div>

                  </div>

                  {/* Panel de desglose de puntos (se muestra al hacer click en "+N pts") */}
                  {expandedBreakdownKey?.startsWith(`${match.id}_`) && (() => {
                    const slot = expandedBreakdownKey.split('_')[1] as 'A1' | 'A2' | 'B1' | 'B2';
                    const data = getSlotBreakdown(match, slot);
                    if (!data) return null;
                    const b = data.breakdown;
                    return (
                      <div className="mb-3 bg-[var(--surface-input)] border border-ball/20 rounded-xl p-3 animate-fade-in">
                        <p className="text-[11px] font-black text-ball-safe uppercase tracking-wider mb-2">
                          Desglose de puntos · {data.name}
                        </p>
                        {b ? (
                          <div className="space-y-1 text-[11px] font-mono text-ink-muted">
                            <div className="flex justify-between"><span>Puntos por puesto (base)</span><span className="text-ink font-bold">+{b.base}</span></div>
                            <div className="flex justify-between"><span>Juegos ganados</span><span className="text-ink font-bold">+{b.gamesWonPoints}</span></div>
                            <div className="flex justify-between"><span>Bonus dificultad rival</span><span className="text-ink font-bold">+{b.difficultyBonus}</span></div>
                            <div className="flex justify-between"><span>Bonus reto superado</span><span className="text-ink font-bold">+{b.challengeBonus}</span></div>
                            <div className="flex justify-between"><span>Bonus imbatibilidad (sets corridos)</span><span className="text-ink font-bold">+{b.immacBonus}</span></div>
                            <div className="flex justify-between border-t border-[var(--border-subtle)] pt-1.5 mt-1.5">
                              <span className="text-ball-safe font-bold">Total</span>
                              <span className="text-ball-safe font-black">+{b.total}</span>
                            </div>
                          </div>
                        ) : (
                          <p className="text-[11px] text-ink-faint italic">
                            Este partido se registró antes de activar el desglose detallado, solo se guardó el total: +{data.points} pts.
                          </p>
                        )}
                      </div>
                    );
                  })()}

                  {/* Points exchanged & Actions Footer */}
                  <div className="border-t border-[var(--border-subtle)] mt-4 pt-3 flex justify-between items-center">
                    
                    {/* Points detail */}
                    {isPlayed ? (
                      <div className="flex items-center gap-1.5 bg-ball/10 border border-ball/15 px-2.5 py-1 rounded-lg text-ball-safe font-mono text-[11px] font-bold animate-fade-in">
                        <Medal className="h-3.5 w-3.5" />
                        <span>Puntos sumados: {match.pointsChange ? `+${match.pointsChange}` : 'N/A'}</span>
                      </div>
                    ) : (
                      <span className="text-[11px] text-ink-faint italic font-medium">Esperando resultado...</span>
                    )}

                    {/* Match Actions triggers */}
                    <div className="flex flex-wrap items-center gap-1.5">

                      {/* Jugador participante puede enviar resultado si el partido está pendiente */}
                      {!isAdminMode && !isPlayed && match.resultStatus !== 'pending_approval' && match.resultStatus !== 'disputed' && isParticipant(match) && (
                        <button
                          onClick={() => openResultModal(match)}
                          className="flex items-center gap-1.5 bg-ball hover:bg-ball-hover text-black font-black text-[11px] uppercase tracking-wider px-3 py-1.5 rounded-xl transition-all shadow-md shadow-lime-950/20 cursor-pointer"
                        >
                          <Send className="h-3.5 w-3.5" />
                          <span>Enviar resultado</span>
                        </button>
                      )}

                      {/* Rival puede aprobar o impugnar el resultado pendiente */}
                      {match.resultStatus === 'pending_approval' && isOpponentOf(match, match.resultSubmittedBy) && (
                        <div className="flex flex-col gap-1.5 w-full mt-1">
                          <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 text-xs">
                            <p className="text-amber-400 font-bold mb-1 flex items-center gap-1.5">
                              <AlertTriangle className="h-3.5 w-3.5" />
                              <span>{match.resultSubmittedByName} ha enviado el resultado</span>
                            </p>
                            <p className="text-ink-muted text-[10px] font-mono">
                              {match.pendingSet1A}-{match.pendingSet1B} / {match.pendingSet2A}-{match.pendingSet2B}
                              {match.pendingSet3A != null && ` / ${match.pendingSet3A}-${match.pendingSet3B}`}
                              {' · '}Ganador: Equipo {match.pendingWinner}
                            </p>
                          </div>
                          <div className="flex gap-1.5">
                            <button
                              onClick={() => handleApproveResult(match)}
                              disabled={approvalLoading === match.id}
                              className="flex-1 flex items-center justify-center gap-1.5 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 font-bold text-[11px] uppercase tracking-wider px-3 py-1.5 rounded-xl border border-emerald-500/30 transition-all cursor-pointer disabled:opacity-50"
                            >
                              {approvalLoading === match.id ? <RefreshCw className="h-3 w-3 animate-spin" /> : <ThumbsUp className="h-3.5 w-3.5" />}
                              <span>Aprobar</span>
                            </button>
                            <button
                              onClick={() => setDisputeMatchId(match.id)}
                              disabled={approvalLoading === match.id}
                              className="flex-1 flex items-center justify-center gap-1.5 bg-rose-500/15 hover:bg-rose-500/25 text-rose-400 font-bold text-[11px] uppercase tracking-wider px-3 py-1.5 rounded-xl border border-rose-500/25 transition-all cursor-pointer disabled:opacity-50"
                            >
                              <ThumbsDown className="h-3.5 w-3.5" />
                              <span>Impugnar</span>
                            </button>
                          </div>
                          {/* Formulario de impugnación */}
                          {disputeMatchId === match.id && (
                            <div className="bg-rose-950/30 border border-rose-500/20 rounded-xl p-3 space-y-2 animate-fade-in">
                              <p className="text-rose-400 text-[10px] font-bold uppercase tracking-wider">Motivo de impugnación</p>
                              <textarea
                                value={disputeReason}
                                onChange={e => setDisputeReason(e.target.value)}
                                placeholder="Explica brevemente el motivo..."
                                rows={2}
                                className="w-full bg-[var(--surface-input)] border border-rose-500/20 rounded-lg p-2 text-xs text-ink placeholder-[var(--text-tertiary)] focus:outline-none focus:border-rose-500/50 resize-none"
                              />
                              <div className="flex gap-1.5">
                                <button
                                  onClick={() => handleDisputeResult(match)}
                                  disabled={!disputeReason.trim() || approvalLoading === match.id}
                                  className="flex-1 bg-rose-500 hover:bg-rose-600 text-ink font-bold text-[11px] uppercase px-3 py-1.5 rounded-lg transition-all cursor-pointer disabled:opacity-50"
                                >
                                  Confirmar impugnación
                                </button>
                                <button
                                  onClick={() => { setDisputeMatchId(null); setDisputeReason(''); }}
                                  className="px-3 py-1.5 bg-[var(--surface-2)] hover:bg-[var(--surface-2)] text-ink-muted text-[11px] font-bold rounded-lg cursor-pointer"
                                >
                                  Cancelar
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Estado de resultado pendiente (para quien lo envió) */}
                      {match.resultStatus === 'pending_approval' && currentUser?.uid === match.resultSubmittedBy && (
                        <div className="flex items-center gap-1.5 bg-amber-500/10 border border-amber-500/20 px-2.5 py-1.5 rounded-xl text-amber-400 text-[10px] font-bold font-mono">
                          <Clock className="h-3 w-3 animate-pulse" />
                          <span>Esperando aprobación rival (24h)</span>
                        </div>
                      )}

                      {/* Estado disputado */}
                      {match.resultStatus === 'disputed' && isParticipant(match) && (
                        <div className="flex items-center gap-1.5 bg-rose-500/10 border border-rose-500/20 px-2.5 py-1.5 rounded-xl text-rose-400 text-[10px] font-bold">
                          <XCircle className="h-3.5 w-3.5" />
                          <span>Disputado · Contacta con el admin</span>
                        </div>
                      )}

                      {isAdminMode && (
                        <button
                          id={`btn-record-score-${match.id}`}
                          onClick={() => openResultModal(match)}
                          className={`flex items-center space-x-1.5 font-black text-[11px] uppercase tracking-wider px-3 py-1.5 rounded-xl transition-all shadow-md cursor-pointer ${
                            isPlayed 
                              ? 'bg-[var(--surface-2)] hover:bg-[var(--border-subtle)] text-ink border border-[var(--border-subtle)] hover:border-[var(--border-strong)]' 
                              : 'bg-ball hover:bg-ball-hover text-black shadow-lime-950/20'
                          }`}
                        >
                          <SquareCheck className="h-3.5 w-3.5" />
                          <span>{isPlayed ? 'Modificar Score' : 'Registrar Score'}</span>
                        </button>
                      )}

                      {isAdminMode && isPlayed && (
                        <>
                          {restartConfirmMatchId === match.id ? (
                            <div className="flex items-center gap-1.5 bg-amber-500/10 border border-amber-500/20 p-1.5 rounded-xl">
                              <span className="text-[10px] text-amber-400 font-bold px-1.5 uppercase tracking-wider">¿Reiniciar?</span>
                              <button
                                onClick={async () => {
                                  if (onRestartMatch) {
                                    await onRestartMatch(match.id);
                                  }
                                  setRestartConfirmMatchId(null);
                                }}
                                className="px-2.5 py-1 bg-amber-500 hover:bg-amber-600 text-black text-[10px] font-mono font-bold rounded-lg transition-colors cursor-pointer"
                              >
                                SÍ
                              </button>
                              <button
                                onClick={() => setRestartConfirmMatchId(null)}
                                className="px-2.5 py-1 bg-[var(--surface-2)] hover:bg-[var(--surface-2)] text-ink text-[10px] font-mono font-bold rounded-lg transition-colors cursor-pointer"
                              >
                                NO
                              </button>
                            </div>
                          ) : (
                            <button
                              id={`btn-restart-match-${match.id}`}
                              onClick={() => setRestartConfirmMatchId(match.id)}
                              className="flex items-center space-x-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 font-bold text-[11px] uppercase tracking-wider px-3 py-1.5 rounded-xl border border-amber-500/20 transition-all cursor-pointer"
                              title="Reiniciar partido y volver a Esperando Resultado"
                            >
                              <RotateCcw className="h-3.5 w-3.5" />
                              <span>Reiniciar</span>
                            </button>
                          )}
                        </>
                      )}
                      {isAdminMode && (
                        <>
                          {deleteConfirmMatchId === match.id ? (
                            <div className="flex items-center gap-1 bg-rose-500/10 border border-rose-500/20 p-1.5 rounded-xl">
                              <span className="text-[10px] text-rose-400 font-bold px-1.5 uppercase tracking-wider">¿Eliminar?</span>
                              <button
                                onClick={() => {
                                  onDeleteMatch?.(match.id);
                                  setDeleteConfirmMatchId(null);
                                }}
                                className="px-2.5 py-1 bg-rose-500 hover:bg-rose-600 text-ink text-[10px] font-mono font-bold rounded-lg transition-colors cursor-pointer"
                              >
                                SÍ
                              </button>
                              <button
                                onClick={() => setDeleteConfirmMatchId(null)}
                                className="px-2.5 py-1 bg-[var(--surface-2)] hover:bg-[var(--surface-2)] text-ink text-[10px] font-mono font-bold rounded-lg transition-colors cursor-pointer"
                              >
                                NO
                              </button>
                            </div>
                          ) : (
                            <button
                              id={`btn-delete-match-${match.id}`}
                              onClick={() => setDeleteConfirmMatchId(match.id)}
                              className="p-1.5 text-ink-muted hover:text-rose-400 rounded-lg hover:bg-[var(--surface-2)] transition-colors cursor-pointer"
                              title="Eliminar de la cuadrícula"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </div>

                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}

      {/* Record Match Scores Overlay Modal (Fully customized glass-modal panel) */}
      {editingMatch && (
        <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center bg-slate-950/75 backdrop-blur-md p-4 sm:p-6 animate-fade-in">
          <div className="glass-card rounded-2xl max-w-md w-full shadow-2xl border border-[var(--border-subtle)] overflow-hidden text-ink p-6 relative">
            <div className="border-b border-[var(--border-subtle)] pb-3 mb-5 flex justify-between items-center">
              <h3 className="font-display text-lg font-black text-ink flex items-center gap-2">
                <SquareCheck className="h-5 w-5 text-ball-safe" />
                <span>Registrar Resultados</span>
              </h3>
              <button 
                onClick={closeResultModal}
                className="text-ink-muted hover:text-ink text-sm font-semibold bg-[var(--surface-2)] hover:bg-[var(--surface-2)] p-1.5 rounded-xl cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveResult} className="space-y-4">
              {modalError && (
                <div className="bg-rose-500/10 border border-rose-500/30 text-rose-400 rounded-xl p-3 text-xs font-semibold flex items-center justify-between animate-fade-in">
                  <span>{modalError}</span>
                  <button type="button" onClick={() => setModalError(null)} className="text-ink hover:text-rose-400 ml-2">✕</button>
                </div>
              )}

              <div className="bg-[var(--surface-2)] border border-[var(--border-subtle)] rounded-2xl p-4 mb-4 relative overflow-hidden">
                <div className="text-center mb-3">
                  <span className="text-[9px] uppercase font-bold tracking-widest text-ball-safe bg-ball/10 border border-ball/20 px-3 py-1 rounded-full font-mono">
                    Enfrentamiento Programado
                  </span>
                </div>
                
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 py-2 px-1">
                  {/* Team A */}
                  <div className="w-full sm:w-[42%] text-center sm:text-right space-y-1">
                    <span className="text-[10px] uppercase font-bold tracking-wider text-ink-faint font-mono block">Equipo A</span>
                    <div className="text-sm sm:text-base font-black text-ink tracking-tight leading-tight">
                      <div className="truncate" title={editingMatch.playerA1Name}>{editingMatch.playerA1Name}</div>
                      {editingMatch.type === '2vs2' && editingMatch.playerA2Name && (
                        <div className="truncate text-ink border-t border-[var(--border-subtle)] mt-1 pt-1 font-bold" title={editingMatch.playerA2Name}>
                          {editingMatch.playerA2Name}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* VS Emblem */}
                  <div className="flex-shrink-0 flex items-center justify-center my-1 sm:my-0">
                    <div className="bg-gradient-to-br from-lime-400 to-ball text-slate-950 font-black text-xs uppercase w-8 h-8 rounded-full shadow-lg shadow-ball/15 flex items-center justify-center border-2 border-[var(--surface-1)] z-10">
                      VS
                    </div>
                  </div>

                  {/* Team B */}
                  <div className="w-full sm:w-[42%] text-center sm:text-left space-y-1">
                    <span className="text-[10px] uppercase font-bold tracking-wider text-ink-faint font-mono block">Equipo B</span>
                    <div className="text-sm sm:text-base font-black text-ink tracking-tight leading-tight">
                      <div className="truncate" title={editingMatch.playerB1Name}>{editingMatch.playerB1Name}</div>
                      {editingMatch.type === '2vs2' && editingMatch.playerB2Name && (
                        <div className="truncate text-ink border-t border-[var(--border-subtle)] mt-1 pt-1 font-bold" title={editingMatch.playerB2Name}>
                          {editingMatch.playerB2Name}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Additional Info Badges */}
                <div className="flex items-center justify-center gap-3 mt-3 pt-2.5 border-t border-[var(--border-subtle)] font-mono text-[10px] text-ink-faint uppercase font-black tracking-widest">
                  <div className="flex items-center gap-1">
                    <span>Categoría:</span>
                    <span className="text-ball-safe bg-ball/15 px-1.5 py-0.5 rounded border border-ball/10">{editingMatch.categoria}</span>
                  </div>
                  <div className="w-1.5 h-1.5 bg-[var(--surface-2)] rounded-full" />
                  <div className="flex items-center gap-1">
                    <span>Rama:</span>
                    <span className={`px-1.5 py-0.5 rounded border ${
                      editingMatch.division === 'Masculina' 
                        ? 'text-sky-400 bg-sky-500/10 border-sky-500/10' 
                        : 'text-pink-400 bg-pink-500/10 border-pink-500/10'
                    }`}>{editingMatch.division}</span>
                  </div>
                </div>
              </div>

              {/* Set scoring grid */}
              <div className="space-y-3">
                {/* SET 1 */}
                <div className="grid grid-cols-12 items-center gap-3 bg-[var(--surface-input)] p-3 rounded-xl border border-[var(--border-subtle)]">
                  <span className="col-span-3 text-xs font-mono uppercase font-bold text-ink-muted">Set 1</span>
                  <div className="col-span-4 flex items-center space-x-2">
                    <input
                      id="input-set1a"
                      type="number"
                      min="0"
                      max="20"
                      value={set1A}
                      onChange={(e) => setSet1A(parseInt(e.target.value) || 0)}
                      className="w-12 bg-[var(--surface-input)] border border-[var(--border-subtle)] rounded-lg p-2 text-center text-sm font-bold text-ball-safe focus:outline-hidden focus:border-ball/50 focus:ring-1 focus:ring-ball/30"
                    />
                    <span className="text-[10px] text-ink-faint uppercase">GMS A</span>
                  </div>
                  <div className="col-span-5 flex items-center space-x-2 justify-end">
                    <span className="text-[10px] text-ink-faint uppercase">GMS B</span>
                    <input
                      id="input-set1b"
                      type="number"
                      min="0"
                      max="20"
                      value={set1B}
                      onChange={(e) => setSet1B(parseInt(e.target.value) || 0)}
                      className="w-12 bg-[var(--surface-input)] border border-[var(--border-subtle)] rounded-lg p-2 text-center text-sm font-bold text-ball-safe focus:outline-hidden focus:border-ball/50 focus:ring-1 focus:ring-ball/30"
                    />
                  </div>
                </div>

                {/* SET 2 */}
                <div className="grid grid-cols-12 items-center gap-3 bg-[var(--surface-input)] p-3 rounded-xl border border-[var(--border-subtle)]">
                  <span className="col-span-3 text-xs font-mono uppercase font-bold text-ink-muted">Set 2</span>
                  <div className="col-span-4 flex items-center space-x-2">
                    <input
                      id="input-set2a"
                      type="number"
                      min="0"
                      max="20"
                      value={set2A}
                      onChange={(e) => setSet2A(parseInt(e.target.value) || 0)}
                      className="w-12 bg-[var(--surface-input)] border border-[var(--border-subtle)] rounded-lg p-2 text-center text-sm font-bold text-ball-safe focus:outline-hidden focus:border-ball/50 focus:ring-1 focus:ring-ball/30"
                    />
                    <span className="text-[10px] text-ink-faint uppercase">GMS A</span>
                  </div>
                  <div className="col-span-5 flex items-center space-x-2 justify-end">
                    <span className="text-[10px] text-ink-faint uppercase">GMS B</span>
                    <input
                      id="input-set2b"
                      type="number"
                      min="0"
                      max="20"
                      value={set2B}
                      onChange={(e) => setSet2B(parseInt(e.target.value) || 0)}
                      className="w-12 bg-[var(--surface-input)] border border-[var(--border-subtle)] rounded-lg p-2 text-center text-sm font-bold text-ball-safe focus:outline-hidden focus:border-ball/50 focus:ring-1 focus:ring-ball/30"
                    />
                  </div>
                </div>

                {/* Optional Set 3 Trigger */}
                <div className="flex items-center justify-between p-3 bg-[var(--surface-input)] rounded-xl border border-[var(--border-subtle)]">
                  <label htmlFor="checkbox-has-set3" className="text-xs font-bold text-ink">¿Se jugó tercer set de desempate?</label>
                  <input
                    id="checkbox-has-set3"
                    type="checkbox"
                    checked={hasSet3}
                    onChange={(e) => setHasSet3(e.target.checked)}
                    className="h-4.5 w-4.5 text-ball-safe bg-[var(--surface-input)] rounded border-[var(--border-subtle)] focus:ring-0 cursor-pointer"
                  />
                </div>

                {/* SET 3 (only active if hasSet3 is true) */}
                {hasSet3 && (
                  <div className="grid grid-cols-12 items-center gap-3 bg-[var(--surface-input)] p-3 rounded-xl border border-ball/20">
                    <span className="col-span-3 text-xs font-mono uppercase font-bold text-amber-400">Set 3</span>
                    <div className="col-span-4 flex items-center space-x-2">
                      <input
                        id="input-set3a"
                        type="number"
                        min="0"
                        max="20"
                        value={set3A}
                        onChange={(e) => setSet3A(parseInt(e.target.value) || 0)}
                        className="w-12 bg-[var(--surface-input)] border border-ball/30 rounded-lg p-2 text-center text-sm font-bold text-ball-safe focus:outline-hidden focus:border-ball/70 focus:ring-1 focus:ring-ball/45"
                      />
                      <span className="text-[10px] text-ink-faint uppercase">GMS A</span>
                    </div>
                    <div className="col-span-5 flex items-center space-x-2 justify-end">
                      <span className="text-[10px] text-ink-faint uppercase">GMS B</span>
                      <input
                        id="input-set3b"
                        type="number"
                        min="0"
                        max="20"
                        value={set3B}
                        onChange={(e) => setSet3B(parseInt(e.target.value) || 0)}
                        className="w-12 bg-[var(--surface-input)] border border-ball/30 rounded-lg p-2 text-center text-sm font-bold text-ball-safe focus:outline-hidden focus:border-ball/70 focus:ring-1 focus:ring-ball/45"
                      />
                    </div>
                  </div>
                )}

                {/* Desafío Semanal / Reto */}
                <div className="bg-[var(--surface-input)] p-3 rounded-xl border border-[var(--border-subtle)] space-y-2">
                  <label htmlFor="select-is-reto" className="block text-xs font-bold text-ink">
                    Tipo de Partido (Reto Semanal)
                  </label>
                  <select
                    id="select-is-reto"
                    value={isReto}
                    onChange={(e) => setIsReto(e.target.value as 'none' | 'A' | 'B')}
                    className="w-full bg-[var(--surface-input)] border border-[var(--border-subtle)] rounded-lg p-2 text-xs font-bold text-ball-safe focus:ring-1 focus:ring-ball/40 focus:outline-hidden"
                  >
                    <option value="none">Partido Regular (No es Reto)</option>
                    <option value="A">Equipo A retó al Equipo B</option>
                    <option value="B">Equipo B retó al Equipo A</option>
                  </select>
                </div>

                {/* Asignación de Posición / Clasificación Final del Partido */}
                <div className="bg-[var(--surface-input)] p-3 rounded-xl border border-[var(--border-subtle)] space-y-3">
                  <span className="block text-xs font-mono uppercase font-bold text-ink border-b border-[var(--border-subtle)] pb-1.5">
                    Puestos Finales Asignados (Puntos Base)
                  </span>
                  
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label htmlFor="select-pos-a1" className="block text-[10px] text-ink-muted truncate font-bold font-mono">
                        A1: {editingMatch.playerA1Name}
                      </label>
                      <select
                        id="select-pos-a1"
                        value={posA1}
                        onChange={(e) => setPosA1(parseInt(e.target.value))}
                        className="w-full bg-[var(--surface-input)] border border-[var(--border-subtle)] rounded-lg p-1.5 text-xs text-ball-safe font-mono focus:ring-1 focus:ring-ball/40 focus:outline-hidden"
                      >
                        <option value={1}>1º puesto (25 pts)</option>
                        <option value={2}>2º puesto (20 pts)</option>
                        <option value={3}>3º puesto (16 pts)</option>
                        <option value={4}>4º puesto (13 pts)</option>
                      </select>
                    </div>

                    {editingMatch.playerA2Name && (
                      <div className="space-y-1">
                        <label htmlFor="select-pos-a2" className="block text-[10px] text-ink-muted truncate font-bold font-mono">
                          A2: {editingMatch.playerA2Name}
                        </label>
                        <select
                          id="select-pos-a2"
                          value={posA2}
                          onChange={(e) => setPosA2(parseInt(e.target.value))}
                          className="w-full bg-[var(--surface-input)] border border-[var(--border-subtle)] rounded-lg p-1.5 text-xs text-ball-safe font-mono focus:ring-1 focus:ring-ball/40 focus:outline-hidden"
                        >
                          <option value={1}>1º puesto (25 pts)</option>
                          <option value={2}>2º puesto (20 pts)</option>
                          <option value={3}>3º puesto (16 pts)</option>
                          <option value={4}>4º puesto (13 pts)</option>
                        </select>
                      </div>
                    )}

                    <div className="space-y-1">
                      <label htmlFor="select-pos-b1" className="block text-[10px] text-ink-muted truncate font-bold font-mono">
                        B1: {editingMatch.playerB1Name}
                      </label>
                      <select
                        id="select-pos-b1"
                        value={posB1}
                        onChange={(e) => setPosB1(parseInt(e.target.value))}
                        className="w-full bg-[var(--surface-input)] border border-[var(--border-subtle)] rounded-lg p-1.5 text-xs text-ball-safe font-mono focus:ring-1 focus:ring-ball/40 focus:outline-hidden"
                      >
                        <option value={1}>1º puesto (25 pts)</option>
                        <option value={2}>2º puesto (20 pts)</option>
                        <option value={3}>3º puesto (16 pts)</option>
                        <option value={4}>4º puesto (13 pts)</option>
                      </select>
                    </div>

                    {editingMatch.playerB2Name && (
                      <div className="space-y-1">
                        <label htmlFor="select-pos-b2" className="block text-[10px] text-ink-muted truncate font-bold font-mono">
                          B2: {editingMatch.playerB2Name}
                        </label>
                        <select
                          id="select-pos-b2"
                          value={posB2}
                          onChange={(e) => setPosB2(parseInt(e.target.value))}
                          className="w-full bg-[var(--surface-input)] border border-[var(--border-subtle)] rounded-lg p-1.5 text-xs text-ball-safe font-mono focus:ring-1 focus:ring-ball/40 focus:outline-hidden"
                        >
                          <option value={1}>1º puesto (25 pts)</option>
                          <option value={2}>2º puesto (20 pts)</option>
                          <option value={3}>3º puesto (16 pts)</option>
                          <option value={4}>4º puesto (13 pts)</option>
                        </select>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* LIVE POINTS PREVIEW BLOCK */}
              {livePreview && (
                <div className="bg-[var(--surface-input)] border border-[var(--border-subtle)] rounded-xl p-3.5 space-y-2.5 animate-fade-in">
                  <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-2">
                    <span className="text-[10px] uppercase font-bold tracking-widest text-ink-faint font-mono">Simulando Puntos</span>
                    <span className={`text-[9px] font-extrabold uppercase px-2 py-0.5 rounded ${
                      livePreview.isValid 
                        ? 'bg-ball/10 text-ball-safe border border-ball/20' 
                        : 'bg-[var(--surface-2)] text-ink-faint'
                     }`}>
                      {livePreview.isValid ? 'Cálculo RACKET' : 'Incompleto'}
                    </span>
                  </div>

                  {!livePreview.isValid ? (
                    <p className="text-xs text-ink-muted italic leading-relaxed text-center py-1">
                      {livePreview.message}
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {/* Winning team banner */}
                      <div className="flex items-center gap-1.5 justify-center py-1.5 bg-ball/10 rounded-lg border border-ball/15">
                        <Trophy className="h-4 w-4 text-ball-safe shrink-0" />
                        <span className="text-xs font-bold text-ink">
                          Ganador: <span className="text-ball-safe uppercase font-black font-display">{livePreview.winner === 'A' ? 'Equipo A' : 'Equipo B'}</span>
                        </span>
                      </div>

                      {/* Detailed Player Breakdowns */}
                      <div className="space-y-2 text-xs">
                        <div className="bg-[var(--surface-2)] rounded-lg p-2.5 space-y-2 border border-[var(--border-subtle)]">
                          <span className="font-extrabold text-[10px] text-ink-muted uppercase font-mono block">Detalle de Puntuación:</span>
                          
                          {/* Player A1 */}
                          <div className="flex flex-col text-[11px] border-b border-[var(--border-subtle)] pb-1.5">
                            <span className="font-bold text-ink">{editingMatch.playerA1Name} (Puesto {livePreview.a1Breakdown?.base === 25 ? '1º' : livePreview.a1Breakdown?.base === 20 ? '2º' : livePreview.a1Breakdown?.base === 16 ? '3º' : '4º'}):</span>
                            <div className="flex flex-wrap gap-x-2 text-[10px] text-ink-faint font-mono mt-0.5">
                              <span>Base: {livePreview.a1Breakdown?.base}</span>
                              <span>• Juegos: +{livePreview.a1Breakdown?.gamesWonPoints}</span>
                              {livePreview.a1Breakdown && livePreview.a1Breakdown.difficultyBonus > 0 && <span className="text-lime-400 font-bold">• Dif: +{livePreview.a1Breakdown.difficultyBonus}</span>}
                              {livePreview.a1Breakdown && livePreview.a1Breakdown.challengeBonus > 0 && <span className="text-amber-400 font-bold">• Reto: +{livePreview.a1Breakdown.challengeBonus}</span>}
                              {livePreview.a1Breakdown && livePreview.a1Breakdown.immacBonus > 0 && <span className="text-cyan-400 font-bold">• Imb: +{livePreview.a1Breakdown.immacBonus}</span>}
                              <span className="text-ball-safe font-black ml-auto bg-ball/10 px-1 py-0.2 rounded">+{livePreview.a1Breakdown?.total} pts</span>
                            </div>
                          </div>

                          {/* Player A2 */}
                          {editingMatch.playerA2Name && livePreview.a2Breakdown && (
                            <div className="flex flex-col text-[11px] border-b border-[var(--border-subtle)] pb-1.5">
                              <span className="font-bold text-ink">{editingMatch.playerA2Name} (Puesto {livePreview.a2Breakdown.base === 25 ? '1º' : livePreview.a2Breakdown.base === 20 ? '2º' : livePreview.a2Breakdown.base === 16 ? '3º' : '4º'}):</span>
                              <div className="flex flex-wrap gap-x-2 text-[10px] text-ink-faint font-mono mt-0.5">
                                <span>Base: {livePreview.a2Breakdown.base}</span>
                                <span>• Juegos: +{livePreview.a2Breakdown.gamesWonPoints}</span>
                                {livePreview.a2Breakdown.difficultyBonus > 0 && <span className="text-lime-400 font-bold">• Dif: +{livePreview.a2Breakdown.difficultyBonus}</span>}
                                {livePreview.a2Breakdown.challengeBonus > 0 && <span className="text-amber-400 font-bold">• Reto: +{livePreview.a2Breakdown.challengeBonus}</span>}
                                {livePreview.a2Breakdown.immacBonus > 0 && <span className="text-cyan-400 font-bold">• Imb: +{livePreview.a2Breakdown.immacBonus}</span>}
                                <span className="text-ball-safe font-black ml-auto bg-ball/10 px-1 py-0.2 rounded">+{livePreview.a2Breakdown.total} pts</span>
                              </div>
                            </div>
                          )}

                          {/* Player B1 */}
                          <div className="flex flex-col text-[11px] border-b border-[var(--border-subtle)] pb-1.5">
                            <span className="font-bold text-ink">{editingMatch.playerB1Name} (Puesto {livePreview.b1Breakdown?.base === 25 ? '1º' : livePreview.b1Breakdown?.base === 20 ? '2º' : livePreview.b1Breakdown?.base === 16 ? '3º' : '4º'}):</span>
                            <div className="flex flex-wrap gap-x-2 text-[10px] text-ink-faint font-mono mt-0.5">
                              <span>Base: {livePreview.b1Breakdown?.base}</span>
                              <span>• Juegos: +{livePreview.b1Breakdown?.gamesWonPoints}</span>
                              {livePreview.b1Breakdown && livePreview.b1Breakdown.difficultyBonus > 0 && <span className="text-lime-400 font-bold">• Dif: +{livePreview.b1Breakdown.difficultyBonus}</span>}
                              {livePreview.b1Breakdown && livePreview.b1Breakdown.challengeBonus > 0 && <span className="text-amber-400 font-bold">• Reto: +{livePreview.b1Breakdown.challengeBonus}</span>}
                              {livePreview.b1Breakdown && livePreview.b1Breakdown.immacBonus > 0 && <span className="text-cyan-400 font-bold">• Imb: +{livePreview.b1Breakdown.immacBonus}</span>}
                              <span className="text-ball-safe font-black ml-auto bg-ball/10 px-1 py-0.2 rounded">+{livePreview.b1Breakdown?.total} pts</span>
                            </div>
                          </div>

                          {/* Player B2 */}
                          {editingMatch.playerB2Name && livePreview.b2Breakdown && (
                            <div className="flex flex-col text-[11px] pb-0">
                              <span className="font-bold text-ink">{editingMatch.playerB2Name} (Puesto {livePreview.b2Breakdown.base === 25 ? '1º' : livePreview.b2Breakdown.base === 20 ? '2º' : livePreview.b2Breakdown.base === 16 ? '3º' : '4º'}):</span>
                              <div className="flex flex-wrap gap-x-2 text-[10px] text-ink-faint font-mono mt-0.5">
                                <span>Base: {livePreview.b2Breakdown.base}</span>
                                <span>• Juegos: +{livePreview.b2Breakdown.gamesWonPoints}</span>
                                {livePreview.b2Breakdown.difficultyBonus > 0 && <span className="text-lime-400 font-bold">• Dif: +{livePreview.b2Breakdown.difficultyBonus}</span>}
                                {livePreview.b2Breakdown.challengeBonus > 0 && <span className="text-amber-400 font-bold">• Reto: +{livePreview.b2Breakdown.challengeBonus}</span>}
                                {livePreview.b2Breakdown.immacBonus > 0 && <span className="text-cyan-400 font-bold">• Imb: +{livePreview.b2Breakdown.immacBonus}</span>}
                                <span className="text-ball-safe font-black ml-auto bg-ball/10 px-1 py-0.2 rounded">+{livePreview.b2Breakdown.total} pts</span>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Action buttons */}
              <div className="pt-4 border-t border-[var(--border-subtle)] flex justify-end space-x-3">
                <button
                  type="button"
                  id="btn-cancel-result"
                  onClick={closeResultModal}
                  className="px-4 py-2 hover:bg-[var(--surface-2)] text-ink-muted hover:text-ink rounded-xl font-bold text-xs transition-all cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  id="btn-save-result"
                  type="submit"
                  disabled={loading}
                  className="px-5 py-2.5 text-black bg-ball hover:bg-ball-hover font-extrabold text-xs rounded-xl flex items-center gap-1.5 transition-all shadow-md shadow-lime-950/30 disabled:opacity-50 cursor-pointer"
                >
                  {loading && <RefreshCw className="h-3 w-3 animate-spin text-black" />}
                  <span>Registrar Resultado</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
