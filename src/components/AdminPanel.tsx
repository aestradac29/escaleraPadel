import React from 'react';
import { Player, Match, Category, CategoriaType, DivisionType, Sanction, Season, SeasonMovement, Challenge, JornadaOficial, JornadaJugador } from '../types';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { collection, addDoc, doc, setDoc, deleteDoc, writeBatch, getDoc, getDocs, query, where, updateDoc } from 'firebase/firestore';
import { UserPlus, CalendarPlus, Check, RefreshCw, AlertTriangle, HelpCircle, Trash2, Plus, ListCollapse, ChevronUp, ChevronDown, Shield, Gavel, TrendingUp, TrendingDown, Minus, History, Eye, Lock, FileSpreadsheet, Download, Upload, CheckCircle2, XCircle, Swords, Flame, ArrowUpDown, ListOrdered, Pencil } from 'lucide-react';
import { generateMatchesTemplate, parseMatchesExcelFile, ParsedMatchRow } from '../utils/excelMatches';
import { buildAllGroupPreviews, GroupPreview } from '../utils/generateGroupMatches';
import { getGrupo, getRangoGrupo, calcularClasificacionPartido, calcularMovimientoEscalera, calcularDescensoSancion, JugadorGrupo, ResultadoMovimiento } from '../utils/escalera';

interface AdminPanelProps {
  players: Player[];
  matches: Match[];
  categories?: Category[];
  onRefreshData?: () => void;
  editingPlayer: Player | null;
  setEditingPlayer: (player: Player | null) => void;
  onResetTournament?: () => Promise<void>;
  onFactoryReset?: () => Promise<void>;
  adminIds: string[];
  sanctions?: Sanction[];
  seasons?: Season[];
  challenges?: Challenge[];
  jornadas?: JornadaOficial[];
  currentUser?: any;
}

export default function AdminPanel({
  players,
  matches,
  categories = [],
  onRefreshData,
  editingPlayer,
  setEditingPlayer,
  onResetTournament,
  onFactoryReset,
  adminIds,
  sanctions = [],
  seasons = [],
  challenges = [],
  jornadas = [],
  currentUser,
}: AdminPanelProps) {
  // Player Creation Form State
  const [nombre, setNombre] = React.useState('');
  const [apellidos, setApellidos] = React.useState('');
  const [telefono, setTelefono] = React.useState('');
  const [categoria, setCategoria] = React.useState<CategoriaType>('Primera');
  const [division, setDivision] = React.useState<DivisionType>('Masculina');
  const [puntos, setPuntos] = React.useState<number>(1000); // @deprecated histórico, ya no rige el ranking
  const [posicion, setPosicion] = React.useState<number>(1);

  // Category Form State
  const [newCategoryName, setNewCategoryName] = React.useState('');
  const [loadingCategory, setLoadingCategory] = React.useState(false);

  // Match Scheduling Form State
  // Default to 2vs2 (doubles) as requested by the user
  const [matchType, setMatchType] = React.useState<'1vs1' | '2vs2'>('2vs2');
  const [matchCategoria, setMatchCategoria] = React.useState<CategoriaType>('Primera');
  const [matchDivision, setMatchDivision] = React.useState<DivisionType>('Masculina');

  // Quick Position & Group Manager State
  const [gestorDivision, setGestorDivision] = React.useState<DivisionType>('Masculina');
  const [gestorCategoria, setGestorCategoria] = React.useState<string>('Todos');
  const [gestorSavingId, setGestorSavingId] = React.useState<string | null>(null);
  
  const [playerA1Id, setPlayerA1Id] = React.useState('');
  const [playerA2Id, setPlayerA2Id] = React.useState('');
  const [playerB1Id, setPlayerB1Id] = React.useState('');
  const [playerB2Id, setPlayerB2Id] = React.useState('');

  // Sanction form and log management states (Reglamento 2026, Art. 30-38:
  // las sanciones descienden posiciones en la escalera, no restan puntos)
  const [sancJugadorId, setSancJugadorId] = React.useState('');
  const [sancTipo, setSancTipo] = React.useState('retraso_10_15');
  const [sancPosiciones, setSancPosiciones] = React.useState<number>(1);
  const [sancMotivo, setSancMotivo] = React.useState('');
  const [loadingSanc, setLoadingSanc] = React.useState(false);

  // Catálogo de incidencias de convivencia con su penalización en posiciones
  const CATALOGO_SANCIONES: Record<string, { label: string; posiciones: number | 'ultima'; articulo: string }> = {
    retraso_10_15: { label: 'Retraso de 10 a 15 minutos', posiciones: 1, articulo: 'Puntualidad' },
    incomparecencia_24h: { label: 'No presentarse (con aviso previo de ≥24h)', posiciones: 1, articulo: 'Asistencia' },
    incomparecencia_menos24h: { label: 'No presentarse (con aviso previo de <24h)', posiciones: 2, articulo: 'Asistencia' },
    incomparecencia_sin_aviso: { label: 'No presentarse (sin dar ningún aviso)', posiciones: 4, articulo: 'Asistencia' },
    no_responde_48h: { label: 'No responder ni proponer fecha en 48h', posiciones: 1, articulo: 'Cortesía' },
    impide_partido: { label: 'Dificultar la organización del encuentro', posiciones: 2, articulo: 'Compañerismo' },
    sin_interes_grupo: { label: 'Falta de respuesta general en el grupo', posiciones: 1, articulo: 'Compromiso' },
    abandono_partido: { label: 'Abandono del encuentro sin motivo justificado', posiciones: 3, articulo: 'Deportividad' },
    manipulacion: { label: 'Modificar resultados incorrectamente', posiciones: 'ultima', articulo: 'Fair Play' },
    antideportiva: { label: 'Conducta poco deportiva', posiciones: 1, articulo: 'Deportividad' },
    custom: { label: 'Otras incidencias del juego', posiciones: 1, articulo: 'Otros' },
  };

  // Pre-configurar nº de posiciones según la infracción elegida
  React.useEffect(() => {
    const info = CATALOGO_SANCIONES[sancTipo];
    if (info && info.posiciones !== 'ultima') {
      setSancPosiciones(info.posiciones);
    }
  }, [sancTipo]);

  // Jugadores de la división afectada, ordenados por posición — base para
  // calcular tanto el descenso como (para 'manipulacion') la última posición.
  const jugadoresDivisionSancion = React.useMemo(() => {
    const jugador = players.find(p => p.id === sancJugadorId);
    if (!jugador) return [];
    return players
      .filter(p => p.division === jugador.division && p.posicion != null)
      .sort((a, b) => (a.posicion ?? 0) - (b.posicion ?? 0));
  }, [players, sancJugadorId]);

  const sancionPreview = React.useMemo(() => {
    const jugador = players.find(p => p.id === sancJugadorId);
    if (!jugador || jugador.posicion == null) return null;

    const info = CATALOGO_SANCIONES[sancTipo];
    const nPosiciones = info?.posiciones === 'ultima'
      ? Math.max(0, jugadoresDivisionSancion.length - jugador.posicion)
      : sancPosiciones;

    const afectados = jugadoresDivisionSancion
      .filter(p => p.id !== jugador.id && (p.posicion ?? 0) > jugador.posicion!)
      .slice(0, nPosiciones)
      .map(p => ({ playerId: p.id, playerName: `${p.nombre} ${p.apellidos}`, posicion: p.posicion! }));

    if (afectados.length === 0) return null;

    return calcularDescensoSancion(
      { playerId: jugador.id, playerName: `${jugador.nombre} ${jugador.apellidos}`, posicion: jugador.posicion },
      afectados
    );
  }, [players, sancJugadorId, sancTipo, sancPosiciones, jugadoresDivisionSancion]);

  const handleSubmitSanction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sancJugadorId) {
      showError("Por favor, selecciona un jugador para aplicar la sanción.");
      return;
    }
    const player = players.find(p => p.id === sancJugadorId);
    if (!player) {
      showError("El jugador seleccionado no es válido.");
      return;
    }
    if (player.posicion == null) {
      showError("Este jugador todavía no tiene posición asignada en la escalera.");
      return;
    }
    if (!sancionPreview || sancionPreview.length === 0) {
      showError("No hay jugadores por debajo a los que aplicar el descenso (¿ya está último?).");
      return;
    }

    setLoadingSanc(true);
    try {
      const info = CATALOGO_SANCIONES[sancTipo];
      const finalMotivo = sancMotivo || `${info.label} (${info.articulo})`;
      const posicionesAplicadas = sancionPreview.length - 1; // el primer movimiento es el del propio sancionado

      const sanctionObj = {
        playerId: player.id,
        playerName: `${player.nombre} ${player.apellidos}`,
        category: sancTipo,
        division: player.division || 'Masculina',
        pointsDeduction: 0, // @deprecated, ya no se usa
        positionsPenalty: posicionesAplicadas,
        movimientos: sancionPreview,
        reason: finalMotivo,
        appliedAt: new Date().toISOString(),
        appliedBy: currentUser?.email || 'admin'
      };

      const batch = writeBatch(db);

      sancionPreview.forEach(mov => {
        batch.update(doc(db, 'players', mov.playerId), {
          posicion: mov.posicionDespues,
          updatedAt: new Date().toISOString(),
        });
      });

      const newSancRef = doc(collection(db, 'sanctions'));
      batch.set(newSancRef, sanctionObj);

      await batch.commit();

      showToast(`¡Sanción aplicada! ${player.nombre} desciende ${posicionesAplicadas} posición(es).`);

      // Reset inputs
      setSancJugadorId('');
      setSancMotivo('');
      setSancTipo('retraso_10_15');
    } catch (err: any) {
      console.error("Error applying sanction:", err);
      showError("Se produjo un error al aplicar la sanción. Revisa las reglas de Firestore.");
    } finally {
      setLoadingSanc(false);
    }
  };

  // Anula una sanción restaurando exactamente las posiciones previas de todos
  // los jugadores afectados (no recalcula: usa el snapshot guardado en la sanción).
  const handleDeleteSanction = async (sanc: Sanction) => {
    try {
      if (sanc.id.startsWith('local_')) {
        const localSancsRaw = localStorage.getItem('padel_sanctions_local') || '[]';
        let localSancs = JSON.parse(localSancsRaw);
        localSancs = localSancs.filter((s: any) => s.id !== sanc.id);
        localStorage.setItem('padel_sanctions_local', JSON.stringify(localSancs));
        window.dispatchEvent(new Event('local-sanctions-updated'));
        showToast(`¡Sanción local anulada!`);
        return;
      }

      const batch = writeBatch(db);

      if (sanc.movimientos && sanc.movimientos.length > 0) {
        // Sanción nueva (por posiciones): restaurar la posición anterior exacta de cada afectado
        sanc.movimientos.forEach(mov => {
          batch.update(doc(db, 'players', mov.playerId), {
            posicion: mov.posicionAntes,
            updatedAt: new Date().toISOString(),
          });
        });
      } else {
        // Sanción histórica (por puntos, sistema anterior): devolver los puntos
        const player = players.find(p => p.id === sanc.playerId);
        if (player) {
          batch.update(doc(db, 'players', player.id), {
            puntos: player.puntos + sanc.pointsDeduction,
            updatedAt: new Date().toISOString(),
          });
        }
      }

      batch.delete(doc(db, 'sanctions', sanc.id));
      await batch.commit();
      showToast(`¡Sanción anulada! Posiciones restauradas para ${sanc.playerName} y afectados.`);
    } catch (err: any) {
      console.error("Error deleting sanction:", err);
      showError("Error al revocar la sanción. Revisa las reglas de Firestore.");
    }
  };

  // Date and Time selection for scheduling a match
  const [matchDate, setMatchDate] = React.useState(() => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  });
  const [matchTime, setMatchTime] = React.useState(() => {
    const today = new Date();
    const hours = String(today.getHours()).padStart(2, '0');
    const minutes = String(today.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
  });

  const [loadingPlayer, setLoadingPlayer] = React.useState(false);
  const [loadingMatch, setLoadingMatch] = React.useState(false);
  const [successMsg, setSuccessMsg] = React.useState<string | null>(null);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [deleteConfirmCatId, setDeleteConfirmCatId] = React.useState<string | null>(null);
  const [editingCategoryId, setEditingCategoryId] = React.useState<string | null>(null);
  const [editingCategoryName, setEditingCategoryName] = React.useState<string>('');
  const [renamingLoading, setRenamingLoading] = React.useState<boolean>(false);
  const [resetConfirm, setResetConfirm] = React.useState(false);
  const [resetLoading, setResetLoading] = React.useState(false);

  // ── Reinicio para Producción (borra todo salvo admins y categorías) ────
  const [factoryResetStep, setFactoryResetStep] = React.useState(0); // 0=oculto, 1=detalle+confirmación escrita
  const [factoryResetText, setFactoryResetText] = React.useState('');
  const [factoryResetLoading, setFactoryResetLoading] = React.useState(false);
  const FACTORY_RESET_PHRASE = 'BORRAR TODO';

  // ── Sub-navegación interna del panel de Admin ───────────────────────────
  const [adminSection, setAdminSection] = React.useState<'jugadores' | 'escalera' | 'categorias' | 'sistema'>('jugadores');

  // ── Cierre de temporada / Ascensos y Descensos ──────────────────────────
  const [seasonPreview, setSeasonPreview] = React.useState<SeasonMovement[] | null>(null);
  const [resetPointsOnClose, setResetPointsOnClose] = React.useState(false);
  const [seasonConfirmStep, setSeasonConfirmStep] = React.useState(0); // 0=nada, 1=preview calculada, 2=confirmando
  const [seasonLoading, setSeasonLoading] = React.useState(false);
  const [showSeasonHistory, setShowSeasonHistory] = React.useState(false);

  // ── Generador de partidos semanales desde Excel ─────────────────────────
  const [excelRows, setExcelRows] = React.useState<ParsedMatchRow[] | null>(null);
  const [excelLoading, setExcelLoading] = React.useState(false);
  const [excelCreating, setExcelCreating] = React.useState(false);
  const [excelFileName, setExcelFileName] = React.useState<string | null>(null);
  const excelFileInputRef = React.useRef<HTMLInputElement>(null);

  // ── Generador de partidos de la Jornada desde los GRUPOS ACTUALES (escalera) ──
  const [groupMatchesPreview, setGroupMatchesPreview] = React.useState<{ grupos: GroupPreview[]; incompletos: { grupo: number; jugadores: Player[] }[] } | null>(null);
  const [groupMatchesCreating, setGroupMatchesCreating] = React.useState(false);
  const [groupMatchesDate, setGroupMatchesDate] = React.useState<string>('');
  const [groupMatchesTime, setGroupMatchesTime] = React.useState<string>('18:00');

  // ── Mover Posiciones Manualmente (desde la administración) ──────────────
  const [moverPlayerId, setMoverPlayerId] = React.useState<string>('');
  const [moverNuevaPosicion, setMoverNuevaPosicion] = React.useState<number>(1);
  const [moverLoading, setMoverLoading] = React.useState<boolean>(false);

  // ── Configuración del Ranking Inicial ──────────────────────────────────
  const [hasInitializedCustomOrder, setHasInitializedCustomOrder] = React.useState(false);
  const [customOrderMasc, setCustomOrderMasc] = React.useState<Player[]>([]);
  const [customOrderFem, setCustomOrderFem] = React.useState<Player[]>([]);
  const [initialRankDivision, setInitialRankDivision] = React.useState<DivisionType>('Masculina');

  const showError = (msg: string) => {
    setErrorMessage(msg);
    setTimeout(() => {
      setErrorMessage(null);
    }, 6000);
  };

  // Auto-sync selectable default category states if current selection is invalid
  React.useEffect(() => {
    if (categories.length > 0) {
      if (!categoria || !categories.some(c => c.name === categoria)) {
        setCategoria(categories[0].name);
      }
      if (!matchCategoria || !categories.some(c => c.name === matchCategoria)) {
        setMatchCategoria(categories[0].name);
      }
    }
  }, [categories]);

  // Sync edits if a player is passed from ranking parent view
  React.useEffect(() => {
    if (editingPlayer) {
      setNombre(editingPlayer.nombre);
      setApellidos(editingPlayer.apellidos);
      setTelefono(editingPlayer.telefono || '');
      setCategoria(editingPlayer.categoria);
      setDivision(editingPlayer.division);
      setPuntos(editingPlayer.puntos);
      setPosicion(editingPlayer.posicion ?? 1);
    }
  }, [editingPlayer]);

  // helper to show notification
  const showToast = (msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => {
      setSuccessMsg(null);
    }, 4500);
  };

  // Add a new Category
  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCategoryName.trim()) {
      showError("Introduce un nombre para la categoría.");
      return;
    }
    setLoadingCategory(true);
    try {
      const name = newCategoryName.trim();
      const catRef = doc(collection(db, 'categories'));
      
      // Calculate next order value
      const maxOrder = categories.reduce((max, c) => (c.order !== undefined && c.order > max ? c.order : max), -1);
      const order = maxOrder + 1;

      await setDoc(catRef, {
        id: catRef.id,
        name,
        order,
        createdAt: new Date().toISOString()
      });
      setNewCategoryName('');
      showToast(`¡Categoría "${name}" creada exitosamente!`);
    } catch (error) {
      console.error("Error creating category:", error);
      showError("Error al intentar crear la categoría");
    } finally {
      setLoadingCategory(false);
    }
  };

  // Move category order up or down
  const handleMoveCategory = async (catId: string, direction: 'up' | 'down') => {
    const index = categories.findIndex(c => c.id === catId);
    if (index === -1) return;

    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= categories.length) return;

    try {
      const batch = writeBatch(db);
      
      // Normalize orders for all categories, swapping the target ones
      categories.forEach((cat, idx) => {
        let orderValue = idx;
        if (idx === index) {
          orderValue = targetIndex;
        } else if (idx === targetIndex) {
          orderValue = index;
        }
        batch.update(doc(db, 'categories', cat.id), { order: orderValue });
      });

      await batch.commit();
      showToast("Se ha cambiado el orden de las categorías correctamente.");
    } catch (error) {
      console.error("Error moving category:", error);
      showError("Error al mover el orden de la categoría");
    }
  };

  const handleRenameCategory = async (catId: string, oldName: string, newNameRaw: string) => {
    const newName = newNameRaw.trim();
    if (!newName) {
      showError("El nombre del grupo no puede estar vacío.");
      return;
    }
    if (newName === oldName) {
      setEditingCategoryId(null);
      return;
    }
    
    // Check if another category already has this name
    const exists = categories.some(c => c.name.toLowerCase() === newName.toLowerCase() && c.id !== catId);
    if (exists) {
      showError("Ya existe un grupo con ese nombre.");
      return;
    }

    setRenamingLoading(true);
    try {
      // 1. Update the category document name in Firestore
      await updateDoc(doc(db, 'categories', catId), { name: newName });

      // We'll update matches, players, and challenges that match the old category name in a batch
      const batch = writeBatch(db);
      let opsCount = 0;

      // 2. Fetch matches with old category name
      const matchesQuery = query(collection(db, 'matches'), where('categoria', '==', oldName));
      const matchesSnap = await getDocs(matchesQuery);
      matchesSnap.forEach((matchDoc) => {
        if (opsCount < 450) {
          batch.update(doc(db, 'matches', matchDoc.id), { categoria: newName });
          opsCount++;
        }
      });

      // 3. Fetch players with old category name
      const playersQuery = query(collection(db, 'players'), where('categoria', '==', oldName));
      const playersSnap = await getDocs(playersQuery);
      playersSnap.forEach((playerDoc) => {
        if (opsCount < 450) {
          batch.update(doc(db, 'players', playerDoc.id), { categoria: newName });
          opsCount++;
        }
      });

      // 4. Fetch challenges with old category name
      const challengesQuery = query(collection(db, 'challenges'), where('categoria', '==', oldName));
      const challengesSnap = await getDocs(challengesQuery);
      challengesSnap.forEach((challengeDoc) => {
        if (opsCount < 450) {
          batch.update(doc(db, 'challenges', challengeDoc.id), { categoria: newName });
          opsCount++;
        }
      });

      if (opsCount > 0) {
        await batch.commit();
      }

      showToast(`¡Grupo "${oldName}" renombrado a "${newName}" con éxito!`);
      setEditingCategoryId(null);
      if (onRefreshData) {
        onRefreshData();
      }
    } catch (error) {
      console.error("Error renaming category:", error);
      showError("Error al intentar renombrar el grupo.");
    } finally {
      setRenamingLoading(false);
    }
  };

  // Update how many players ascend/descend for a given category
  const handleUpdatePromotionCount = async (catId: string, field: 'ascendCount' | 'descendCount', value: number) => {
    const safeValue = Math.max(0, Math.min(20, isNaN(value) ? 0 : value));
    try {
      await updateDoc(doc(db, 'categories', catId), { [field]: safeValue });
    } catch (error) {
      console.error("Error updating promotion count:", error);
      showError("Error al actualizar el nº de ascensos/descensos");
    }
  };

  // Agrupa jugadores por división+categoría, ordenados por posición ascendente en la escalera (Liga RACKET 2026).
  // Nota: a igualdad de posición o si falta, se ordena por puntos/nombre como desempate.
  const groupPlayersByCategoryDivision = React.useCallback(() => {
    const sortedCategories = [...categories].sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
    const divisions: DivisionType[] = ['Masculina', 'Femenina'];
    const groups: { categoria: Category; division: DivisionType; jugadores: Player[] }[] = [];

    sortedCategories.forEach((cat, catIdx) => {
      divisions.forEach(div => {
        const groupNum = catIdx + 1;
        const jugadores = players
          .filter(p => {
            const isA = p.email === 'alvaroestradacabello@gmail.com' || adminIds.includes(p.id);
            if (isA) return false;
            if (p.division !== div) return false;
            
            // Determinado por rango de posiciones (1-4 = Grupo 1, 5-8 = Grupo 2, etc.)
            if (p.posicion != null && p.posicion > 0) {
              return getGrupo(p.posicion) === groupNum;
            }
            // Fallback para jugadores sin posición según su campo categoría guardado
            return p.categoria === cat.name;
          })
          .sort((a, b) => {
            const posA = a.posicion ?? Infinity;
            const posB = b.posicion ?? Infinity;
            if (posA !== posB) return posA - posB;
            return b.puntos - a.puntos;
          });

        if (jugadores.length > 0) {
          groups.push({ categoria: cat, division: div, jugadores });
        }
      });
    });
    return groups;
  }, [players, categories, adminIds]);

  // Calcula la vista previa de ascensos/descensos sin escribir nada en la BBDD
  const handleCalculateSeasonPreview = () => {
    const sortedCategories = [...categories].sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
    const groups = groupPlayersByCategoryDivision();
    const movements: SeasonMovement[] = [];

    groups.forEach(({ categoria, division, jugadores }) => {
      const catIndex = sortedCategories.findIndex(c => c.id === categoria.id);
      const ascendCount = catIndex === 0 ? 0 : 1;
      const descendCount = catIndex === sortedCategories.length - 1 ? 0 : 1;
      const total = jugadores.length;

      const catArriba = catIndex > 0 ? sortedCategories[catIndex - 1] : null;
      const catAbajo = catIndex < sortedCategories.length - 1 ? sortedCategories[catIndex + 1] : null;

      jugadores.forEach((p, idx) => {
        const posicion = idx + 1; // 1-indexado
        if (catArriba && ascendCount > 0 && posicion <= ascendCount) {
          movements.push({
            playerId: p.id,
            playerName: `${p.nombre} ${p.apellidos}`,
            division,
            fromCategoria: categoria.name,
            toCategoria: catArriba.name,
            puntosAlCierre: p.puntos,
            tipo: 'ascenso',
          });
        } else if (catAbajo && descendCount > 0 && posicion > total - descendCount) {
          movements.push({
            playerId: p.id,
            playerName: `${p.nombre} ${p.apellidos}`,
            division,
            fromCategoria: categoria.name,
            toCategoria: catAbajo.name,
            puntosAlCierre: p.puntos,
            tipo: 'descenso',
          });
        }
      });
    });

    setSeasonPreview(movements);
    setSeasonConfirmStep(1);
  };

  // Aplica los movimientos calculados: actualiza categoría de cada jugador,
  // ajusta la posición de los jugadores según la nueva categoría, y guarda un registro en 'seasons'.
  const handleCloseSeason = async () => {
    if (!seasonPreview) return;
    setSeasonLoading(true);
    try {
      const batch = writeBatch(db);
      const sortedCategories = [...categories].sort((a, b) => (a.order ?? 999) - (b.order ?? 999));

      seasonPreview.forEach(mov => {
        const playerRef = doc(db, 'players', mov.playerId);
        const catIdx = sortedCategories.findIndex(c => c.name === mov.toCategoria);
        const newPos = catIdx !== -1 ? (catIdx * 4 + 1) : 1;

        const updates: any = {
          categoria: mov.toCategoria,
          posicion: newPos,
          updatedAt: new Date().toISOString(),
        };
        batch.update(playerRef, updates);
      });

      // Registrar el cierre de temporada en el historial
      const seasonRef = doc(collection(db, 'seasons'));
      const seasonDoc: Omit<Season, 'id'> = {
        closedAt: new Date().toISOString(),
        closedBy: currentUser?.uid ?? 'admin',
        closedByName: currentUser?.displayName || currentUser?.email || 'Administrador',
        movimientos: seasonPreview,
        puntosReiniciados: false,
        totalJugadoresAfectados: seasonPreview.length,
      };
      batch.set(seasonRef, seasonDoc);

      await batch.commit();

      showToast(`¡Jornada cerrada! ${seasonPreview.length} jugador(es) cambiaron de categoría.`);
      setSeasonPreview(null);
      setSeasonConfirmStep(0);
      setResetPointsOnClose(false);
      if (onRefreshData) onRefreshData();
    } catch (error) {
      console.error("Error closing season:", error);
      showError("Error al cerrar la jornada. Revisa las reglas de Firestore.");
    } finally {
      setSeasonLoading(false);
    }
  };

  // ── Generador de partidos semanales desde Excel ─────────────────────────
  const handleDownloadTemplate = () => {
    try {
      generateMatchesTemplate(players, categories, adminIds);
    } catch (error) {
      console.error("Error generating template:", error);
      showError("Error al generar la plantilla Excel.");
    }
  };

  const handleExcelFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setExcelFileName(file.name);
    setExcelLoading(true);
    setExcelRows(null);
    try {
      const parsed = await parseMatchesExcelFile(file, players);
      setExcelRows(parsed);
    } catch (error) {
      console.error("Error parsing Excel file:", error);
      showError("No se pudo leer el archivo. Comprueba que es el .xlsx generado por la plantilla.");
    } finally {
      setExcelLoading(false);
      // Permitir volver a seleccionar el mismo archivo si se corrige y se vuelve a subir
      if (excelFileInputRef.current) excelFileInputRef.current.value = '';
    }
  };

  const handleCreateMatchesFromExcel = async () => {
    if (!excelRows) return;
    const validRows = excelRows.filter(r => r.status === 'ok');
    if (validRows.length === 0) return;

    setExcelCreating(true);
    try {
      const batch = writeBatch(db);

      validRows.forEach(row => {
        const pA1 = players.find(p => p.id === row.playerA1Id)!;
        const pB1 = players.find(p => p.id === row.playerB1Id)!;
        const pA2 = row.playerA2Id ? players.find(p => p.id === row.playerA2Id) : undefined;
        const pB2 = row.playerB2Id ? players.find(p => p.id === row.playerB2Id) : undefined;

        const matchRef = doc(collection(db, 'matches'));
        const newMatch = {
          id: matchRef.id,
          type: pA2 && pB2 ? '2vs2' : '1vs1',
          categoria: row.categoria,
          division: row.division,
          playerA1Id: pA1.id,
          playerA1Name: `${pA1.nombre} ${pA1.apellidos}`,
          playerA2Id: pA2?.id || null,
          playerA2Name: pA2 ? `${pA2.nombre} ${pA2.apellidos}` : null,
          playerB1Id: pB1.id,
          playerB1Name: `${pB1.nombre} ${pB1.apellidos}`,
          playerB2Id: pB2?.id || null,
          playerB2Name: pB2 ? `${pB2.nombre} ${pB2.apellidos}` : null,
          set1A: 0, set1B: 0, set2A: 0, set2B: 0, set3A: null, set3B: null,
          winner: 'playing',
          pointsChange: 0,
          playedAt: null,
          createdAt: new Date().toISOString(),
          scheduledAt: row.fecha
            ? `${row.fecha}T${row.hora || '00:00'}:00`
            : new Date().toISOString(),
        };
        batch.set(matchRef, newMatch);
      });

      await batch.commit();
      showToast(`¡${validRows.length} partido(s) creado(s) correctamente!`);
      setExcelRows(null);
      setExcelFileName(null);
      if (onRefreshData) onRefreshData();
    } catch (error) {
      console.error("Error creating matches from Excel:", error);
      showError("Error al crear los partidos. Revisa las reglas de Firestore.");
    } finally {
      setExcelCreating(false);
    }
  };

  const handlePreviewGroupMatches = () => {
    const preview = buildAllGroupPreviews(players, adminIds);
    setGroupMatchesPreview(preview);
  };

  const handleCreateGroupMatches = async () => {
    if (!groupMatchesPreview || groupMatchesPreview.grupos.length === 0) return;
    setGroupMatchesCreating(true);
    try {
      const batch = writeBatch(db);
      let count = 0;

      groupMatchesPreview.grupos.forEach(g => {
        g.matches.forEach(m => {
          const matchRef = doc(collection(db, 'matches'));
          const newMatch = {
            id: matchRef.id,
            type: '2vs2',
            categoria: '',
            division: m.division,
            grupo: m.grupo,
            playerA1Id: m.playerA1.id,
            playerA1Name: `${m.playerA1.nombre} ${m.playerA1.apellidos}`,
            playerA2Id: m.playerA2.id,
            playerA2Name: `${m.playerA2.nombre} ${m.playerA2.apellidos}`,
            playerB1Id: m.playerB1.id,
            playerB1Name: `${m.playerB1.nombre} ${m.playerB1.apellidos}`,
            playerB2Id: m.playerB2.id,
            playerB2Name: `${m.playerB2.nombre} ${m.playerB2.apellidos}`,
            set1A: 0, set1B: 0, set2A: 0, set2B: 0, set3A: null, set3B: null,
            winner: 'playing',
            isReto: 'none',
            pointsChange: 0,
            playedAt: null,
            createdAt: new Date().toISOString(),
            scheduledAt: groupMatchesDate && groupMatchesTime ? `${groupMatchesDate}T${groupMatchesTime}:00` : new Date().toISOString(),
          };
          batch.set(matchRef, newMatch);
          count += 1;
        });
      });

      await batch.commit();
      showToast(`¡${count} partido(s) de jornada creado(s) a partir de los grupos actuales!`);
      setGroupMatchesPreview(null);
      if (onRefreshData) onRefreshData();
    } catch (error) {
      console.error("Error creating group matches:", error);
      showError("Error al crear los partidos de la jornada. Revisa las reglas de Firestore.");
    } finally {
      setGroupMatchesCreating(false);
    }
  };

  // ── Reinicio para Producción ─────────────────────────────────────────────
  const isProtectedAdminPlayer = (p: Player) =>
    p.email === 'alvaroestradacabello@gmail.com' || adminIds.includes(p.id);

  const factoryResetCounts = React.useMemo(() => ({
    playersToDelete: players.filter(p => !isProtectedAdminPlayer(p)).length,
    playersToKeep: players.filter(isProtectedAdminPlayer).length,
    matches: matches.length,
    challenges: challenges.length,
    sanctions: sanctions.filter(s => !s.id.startsWith('local_')).length,
    seasons: seasons.length,
    jornadas: jornadas.length,
  }), [players, matches, challenges, sanctions, seasons, jornadas, adminIds]);

  const handleConfirmFactoryReset = async () => {
    if (!onFactoryReset || factoryResetText.trim().toUpperCase() !== FACTORY_RESET_PHRASE) return;
    setFactoryResetLoading(true);
    try {
      await onFactoryReset();
      showToast('¡Web reiniciada para producción! Se ha conservado a los administradores y las categorías.');
      setFactoryResetStep(0);
      setFactoryResetText('');
      if (onRefreshData) onRefreshData();
    } catch (error) {
      console.error('Factory reset failed:', error);
      showError('Error al reiniciar la web. Revisa las reglas de Firestore.');
    } finally {
      setFactoryResetLoading(false);
    }
  };

  // ══════════════════════════════════════════════════════════════════════
  // ESCALERA — Ranking por posiciones (Reglamento 2026, Cap. V y VI)
  // ══════════════════════════════════════════════════════════════════════

  const isCompetitivePlayer = (p: Player) =>
    p.email !== 'alvaroestradacabello@gmail.com' && !adminIds.includes(p.id);

  // ¿Hace falta migrar? (hay jugadores competitivos sin posición asignada)
  const playersNeedingMigration = React.useMemo(
    () => players.filter(p => isCompetitivePlayer(p) && (p.posicion == null || p.posicion <= 0)),
    [players, adminIds]
  );

  const [migrationLoading, setMigrationLoading] = React.useState(false);

  // Sincronizar e inicializar el orden personalizado de posiciones iniciales
  React.useEffect(() => {
    if (players.length > 0 && !hasInitializedCustomOrder) {
      const masc = players
        .filter(p => isCompetitivePlayer(p) && p.division === 'Masculina' && (p.posicion == null || p.posicion <= 0))
        .sort((a, b) => (b.puntos - a.puntos) || a.nombre.localeCompare(b.nombre));
      const fem = players
        .filter(p => isCompetitivePlayer(p) && p.division === 'Femenina' && (p.posicion == null || p.posicion <= 0))
        .sort((a, b) => (b.puntos - a.puntos) || a.nombre.localeCompare(b.nombre));
      setCustomOrderMasc(masc);
      setCustomOrderFem(fem);
      setHasInitializedCustomOrder(true);
    }
  }, [players, hasInitializedCustomOrder]);

  const handleMoveInitialPlayer = (division: DivisionType, index: number, direction: 'up' | 'down') => {
    const list = division === 'Masculina' ? [...customOrderMasc] : [...customOrderFem];
    const setList = division === 'Masculina' ? setCustomOrderMasc : setCustomOrderFem;
    
    if (direction === 'up' && index > 0) {
      const temp = list[index];
      list[index] = list[index - 1];
      list[index - 1] = temp;
    } else if (direction === 'down' && index < list.length - 1) {
      const temp = list[index];
      list[index] = list[index + 1];
      list[index + 1] = temp;
    }
    setList(list);
  };

  const handleSetInitialPlayerPosition = (division: DivisionType, index: number, targetPos: number) => {
    const list = division === 'Masculina' ? [...customOrderMasc] : [...customOrderFem];
    const setList = division === 'Masculina' ? setCustomOrderMasc : setCustomOrderFem;
    
    // Clampar targetPos a índices válidos de la lista
    const targetIdx = Math.max(0, Math.min(targetPos - 1, list.length - 1));
    if (targetIdx === index) return;
    
    const [player] = list.splice(index, 1);
    list.splice(targetIdx, 0, player);
    setList(list);
  };

  // Migración única: asigna posición inicial escogida por el admin a todos los jugadores sin ella.
  const handleMigrarAPosiciones = async () => {
    setMigrationLoading(true);
    try {
      const batch = writeBatch(db);
      
      // Procesar Masculina
      const yaConPosicionMasc = players.filter(p => isCompetitivePlayer(p) && p.division === 'Masculina' && p.posicion != null && p.posicion > 0);
      const posicionesOcupadasMasc = new Set(yaConPosicionMasc.map(p => p.posicion));
      let siguienteMasc = 1;
      customOrderMasc.forEach(p => {
        while (posicionesOcupadasMasc.has(siguienteMasc)) siguienteMasc++;
        batch.update(doc(db, 'players', p.id), { posicion: siguienteMasc, updatedAt: new Date().toISOString() });
        posicionesOcupadasMasc.add(siguienteMasc);
        siguienteMasc++;
      });

      // Procesar Femenina
      const yaConPosicionFem = players.filter(p => isCompetitivePlayer(p) && p.division === 'Femenina' && p.posicion != null && p.posicion > 0);
      const posicionesOcupadasFem = new Set(yaConPosicionFem.map(p => p.posicion));
      let siguienteFem = 1;
      customOrderFem.forEach(p => {
        while (posicionesOcupadasFem.has(siguienteFem)) siguienteFem++;
        batch.update(doc(db, 'players', p.id), { posicion: siguienteFem, updatedAt: new Date().toISOString() });
        posicionesOcupadasFem.add(siguienteFem);
        siguienteFem++;
      });

      await batch.commit();
      showToast('¡Ranking por posiciones inicializado correctamente!');
      setHasInitializedCustomOrder(false); // Resetear para permitir recalcular si fuera necesario
      if (onRefreshData) onRefreshData();
    } catch (error) {
      console.error('Error migrando a posiciones:', error);
      showError('Error al inicializar las posiciones. Revisa las reglas de Firestore.');
    } finally {
      setMigrationLoading(false);
    }
  };

  // Pre-calcular el preview de movimiento manual de posiciones
  const moverPreview = React.useMemo(() => {
    if (!moverPlayerId) return null;
    const player = players.find(p => p.id === moverPlayerId);
    if (!player || player.posicion == null) return null;

    const oldPos = player.posicion;
    const targetPos = Math.max(1, moverNuevaPosicion);
    if (oldPos === targetPos) return [];

    const div = player.division;
    const sameDivPlayers = players
      .filter(p => isCompetitivePlayer(p) && p.division === div && p.posicion != null && p.posicion > 0)
      .sort((a, b) => a.posicion! - b.posicion!);

    // Clampar posición objetivo a la cantidad total de jugadores en la división
    const finalTargetPos = Math.min(targetPos, sameDivPlayers.length);
    if (oldPos === finalTargetPos) return [];

    const movements: { playerId: string; playerName: string; posicionAntes: number; posicionDespues: number }[] = [];

    movements.push({
      playerId: player.id,
      playerName: `${player.nombre} ${player.apellidos}`,
      posicionAntes: oldPos,
      posicionDespues: finalTargetPos,
    });

    if (finalTargetPos > oldPos) {
      // Bajar: desplazar hacia arriba todos los jugadores entre oldPos + 1 y finalTargetPos (puestos bajan pero el nº de posición aumenta)
      sameDivPlayers.forEach(p => {
        if (p.id !== player.id && p.posicion! > oldPos && p.posicion! <= finalTargetPos) {
          movements.push({
            playerId: p.id,
            playerName: `${p.nombre} ${p.apellidos}`,
            posicionAntes: p.posicion!,
            posicionDespues: p.posicion! - 1,
          });
        }
      });
    } else {
      // Subir: desplazar hacia abajo todos los jugadores entre finalTargetPos y oldPos - 1
      sameDivPlayers.forEach(p => {
        if (p.id !== player.id && p.posicion! >= finalTargetPos && p.posicion! < oldPos) {
          movements.push({
            playerId: p.id,
            playerName: `${p.nombre} ${p.apellidos}`,
            posicionAntes: p.posicion!,
            posicionDespues: p.posicion! + 1,
          });
        }
      });
    }

    return movements.sort((a, b) => a.posicionDespues - b.posicionDespues);
  }, [players, moverPlayerId, moverNuevaPosicion]);

  // Aplicar reordenamiento manual de posiciones en la escalera
  const handleConfirmarMoverPosicion = async () => {
    if (!moverPlayerId || !moverPreview || moverPreview.length === 0) return;
    setMoverLoading(true);
    try {
      const batch = writeBatch(db);
      moverPreview.forEach(mov => {
        batch.update(doc(db, 'players', mov.playerId), {
          posicion: mov.posicionDespues,
          updatedAt: new Date().toISOString(),
        });
      });
      await batch.commit();
      showToast('¡Posiciones y ranking reordenados exitosamente!');
      setMoverPlayerId('');
      if (onRefreshData) onRefreshData();
    } catch (error) {
      console.error('Error al mover posición:', error);
      showError('Error al guardar las nuevas posiciones. Revisa las reglas de Firestore.');
    } finally {
      setMoverLoading(false);
    }
  };

  // ── Registro de Jornada Oficial (partido de grupo de 4) ─────────────────
  const [jornadaDivision, setJornadaDivision] = React.useState<DivisionType>('Masculina');
  const [jornadaGrupo, setJornadaGrupo] = React.useState<number>(1);
  const [jornadaJuegos, setJornadaJuegos] = React.useState<Record<string, { ganados: string; perdidos: string }>>({});
  const [jornadaPreview, setJornadaPreview] = React.useState<{
    clasificacion: string[];
    movimientos: ResultadoMovimiento[];
  } | null>(null);
  const [jornadaLoading, setJornadaLoading] = React.useState(false);

  const gruposDisponibles = React.useMemo(() => {
    const totalJugadores = players.filter(p => isCompetitivePlayer(p) && p.division === jornadaDivision && p.posicion != null).length;
    const totalGrupos = Math.max(1, Math.ceil(totalJugadores / 4));
    return Array.from({ length: totalGrupos }, (_, i) => i + 1);
  }, [players, jornadaDivision, adminIds]);

  const jugadoresDelGrupo: JugadorGrupo[] = React.useMemo(() => {
    const { desde, hasta } = getRangoGrupo(jornadaGrupo);
    return players
      .filter(p => isCompetitivePlayer(p) && p.division === jornadaDivision && (p.posicion ?? 0) >= desde && (p.posicion ?? 0) <= hasta)
      .sort((a, b) => (a.posicion ?? 0) - (b.posicion ?? 0))
      .map(p => ({ playerId: p.id, playerName: `${p.nombre} ${p.apellidos}`, posicion: p.posicion! }));
  }, [players, jornadaDivision, jornadaGrupo]);

  const partidosJugadosGrupo = React.useMemo(() => {
    return matches.filter(m => 
      m.division === jornadaDivision && 
      m.grupo === jornadaGrupo && 
      m.winner !== 'playing' && 
      (!m.isReto || m.isReto === 'none')
    );
  }, [matches, jornadaDivision, jornadaGrupo]);

  // Autocompletar juegos ganados/perdidos desde partidos de grupo jugados
  React.useEffect(() => {
    if (partidosJugadosGrupo.length > 0 && jugadoresDelGrupo.length > 0) {
      const calculated: Record<string, { ganados: string; perdidos: string }> = {};
      
      jugadoresDelGrupo.forEach(j => {
        calculated[j.playerId] = { ganados: '0', perdidos: '0' };
      });

      partidosJugadosGrupo.forEach(m => {
        if (m.playerA1Id && calculated[m.playerA1Id] !== undefined) {
          const prev = calculated[m.playerA1Id];
          calculated[m.playerA1Id] = {
            ganados: (parseInt(prev.ganados) + (m.set1A || 0)).toString(),
            perdidos: (parseInt(prev.perdidos) + (m.set1B || 0)).toString()
          };
        }
        if (m.playerA2Id && calculated[m.playerA2Id] !== undefined) {
          const prev = calculated[m.playerA2Id];
          calculated[m.playerA2Id] = {
            ganados: (parseInt(prev.ganados) + (m.set1A || 0)).toString(),
            perdidos: (parseInt(prev.perdidos) + (m.set1B || 0)).toString()
          };
        }
        if (m.playerB1Id && calculated[m.playerB1Id] !== undefined) {
          const prev = calculated[m.playerB1Id];
          calculated[m.playerB1Id] = {
            ganados: (parseInt(prev.ganados) + (m.set1B || 0)).toString(),
            perdidos: (parseInt(prev.perdidos) + (m.set1A || 0)).toString()
          };
        }
        if (m.playerB2Id && calculated[m.playerB2Id] !== undefined) {
          const prev = calculated[m.playerB2Id];
          calculated[m.playerB2Id] = {
            ganados: (parseInt(prev.ganados) + (m.set1B || 0)).toString(),
            perdidos: (parseInt(prev.perdidos) + (m.set1A || 0)).toString()
          };
        }
      });

      setJornadaJuegos(calculated);
    } else {
      setJornadaJuegos({});
    }
  }, [partidosJugadosGrupo, jugadoresDelGrupo]);

  const handleCalcularJornada = () => {
    if (jugadoresDelGrupo.length < 2) {
      showError('Este grupo no tiene suficientes jugadores con posición asignada.');
      return;
    }
    const datos = jugadoresDelGrupo.map(j => {
      const input = jornadaJuegos[j.playerId] || { ganados: '0', perdidos: '0' };
      return {
        playerId: j.playerId,
        juegosGanados: parseInt(input.ganados) || 0,
        juegosPerdidos: parseInt(input.perdidos) || 0,
        posicionPrevia: j.posicion,
      };
    });

    const clasificacion = calcularClasificacionPartido(datos);

    // Art. 19/20: ¿hay grupo superior? El Grupo 1 nunca tiene intercambio (Art. 20).
    let jugadorUltimoGrupoSuperior: JugadorGrupo | undefined;
    if (jornadaGrupo > 1) {
      const { desde } = getRangoGrupo(jornadaGrupo);
      const ultimaPosicionGrupoSuperior = desde - 1;
      const jugadorSuperior = players.find(p => isCompetitivePlayer(p) && p.division === jornadaDivision && p.posicion === ultimaPosicionGrupoSuperior);
      if (jugadorSuperior) {
        jugadorUltimoGrupoSuperior = {
          playerId: jugadorSuperior.id,
          playerName: `${jugadorSuperior.nombre} ${jugadorSuperior.apellidos}`,
          posicion: jugadorSuperior.posicion!,
        };
      }
    }

    const movimientos = calcularMovimientoEscalera(jugadoresDelGrupo, clasificacion, jugadorUltimoGrupoSuperior);
    setJornadaPreview({ clasificacion, movimientos });
  };

  const handleConfirmarJornada = async () => {
    if (!jornadaPreview) return;
    setJornadaLoading(true);
    try {
      const batch = writeBatch(db);

      jornadaPreview.movimientos.forEach(mov => {
        batch.update(doc(db, 'players', mov.playerId), {
          posicion: mov.posicionDespues,
          updatedAt: new Date().toISOString(),
        });
      });

      const jornadaRef = doc(collection(db, 'jornadas'));
      const jornadaDoc: Omit<JornadaOficial, 'id'> = {
        division: jornadaDivision,
        grupo: jornadaGrupo,
        jugadores: jugadoresDelGrupo.map(j => ({
          playerId: j.playerId,
          playerName: j.playerName,
          posicionAntes: j.posicion,
          juegosGanados: parseInt(jornadaJuegos[j.playerId]?.ganados) || 0,
          juegosPerdidos: parseInt(jornadaJuegos[j.playerId]?.perdidos) || 0,
        })),
        clasificacion: jornadaPreview.clasificacion,
        movimientos: jornadaPreview.movimientos,
        fecha: new Date().toISOString(),
        registradoPor: currentUser?.uid ?? 'admin',
        registradoPorNombre: currentUser?.displayName || currentUser?.email || 'Administrador',
        createdAt: new Date().toISOString(),
      };
      batch.set(jornadaRef, jornadaDoc);

      await batch.commit();
      showToast('¡Jornada Oficial registrada! Posiciones actualizadas.');
      setJornadaPreview(null);
      setJornadaJuegos({});
      if (onRefreshData) onRefreshData();
    } catch (error) {
      console.error('Error registrando jornada:', error);
      showError('Error al registrar la jornada. Revisa las reglas de Firestore.');
    } finally {
      setJornadaLoading(false);
    }
  };

  // Filter possible contestants by category and division for the matchmaker form
  const eligiblePlayers = React.useMemo(() => {
    return players.filter(p => p.categoria === matchCategoria && p.division === matchDivision);
  }, [players, matchCategoria, matchDivision]);

  // Handle Player Create or Update action
  const handleSubmitPlayer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPlayer) return; // El alta de nuevos jugadores ya no se gestiona desde aquí

    if (!nombre.trim() || !apellidos.trim()) {
      showError("Por favor introduce el nombre y apellidos del jugador");
      return;
    }

    setLoadingPlayer(true);
    try {
      const targetPos = Number(posicion);
      const targetDiv = division;
      const oldPos = editingPlayer.posicion;
      const oldDiv = editingPlayer.division;

      const batch = writeBatch(db);

      // Reordenar posiciones de otros jugadores automáticamente si cambia posición o división
      const positionChanged = targetPos !== oldPos;
      const divisionChanged = targetDiv !== oldDiv;

      if (positionChanged || divisionChanged) {
        if (!divisionChanged) {
          // Misma división, cambia posición
          if (oldPos && oldPos > 0) {
            if (targetPos > oldPos) {
              // Bajar posición: desplazar arriba (restar 1) a los jugadores entre oldPos + 1 y targetPos
              const affected = players.filter(p => 
                isCompetitivePlayer(p) && 
                p.id !== editingPlayer.id &&
                p.division === targetDiv && 
                p.posicion != null && 
                p.posicion > oldPos && 
                p.posicion <= targetPos
              );
              affected.forEach(p => {
                batch.update(doc(db, 'players', p.id), { 
                  posicion: p.posicion! - 1, 
                  updatedAt: new Date().toISOString() 
                });
              });
            } else if (targetPos < oldPos) {
              // Subir posición: desplazar abajo (sumar 1) a los jugadores entre targetPos y oldPos - 1
              const affected = players.filter(p => 
                isCompetitivePlayer(p) && 
                p.id !== editingPlayer.id &&
                p.division === targetDiv && 
                p.posicion != null && 
                p.posicion >= targetPos && 
                p.posicion < oldPos
              );
              affected.forEach(p => {
                batch.update(doc(db, 'players', p.id), { 
                  posicion: p.posicion! + 1, 
                  updatedAt: new Date().toISOString() 
                });
              });
            }
          } else {
            // El jugador no tenía posición previa asignada (ej. nuevo), desplazar abajo a todos a partir de targetPos
            const affected = players.filter(p => 
              isCompetitivePlayer(p) && 
              p.id !== editingPlayer.id &&
              p.division === targetDiv && 
              p.posicion != null && 
              p.posicion >= targetPos
            );
            affected.forEach(p => {
              batch.update(doc(db, 'players', p.id), { 
                posicion: p.posicion! + 1, 
                updatedAt: new Date().toISOString() 
              });
            });
          }
        } else {
          // Cambia de división (caso extremo)
          // 1. En la antigua división, desplazar arriba a todos los que estaban debajo del jugador
          if (oldPos && oldPos > 0) {
            const affectedOld = players.filter(p => 
              isCompetitivePlayer(p) && 
              p.id !== editingPlayer.id &&
              p.division === oldDiv && 
              p.posicion != null && 
              p.posicion > oldPos
            );
            affectedOld.forEach(p => {
              batch.update(doc(db, 'players', p.id), { 
                posicion: p.posicion! - 1, 
                updatedAt: new Date().toISOString() 
              });
            });
          }

          // 2. En la nueva división, desplazar abajo a todos los que estén a partir de targetPos
          const affectedNew = players.filter(p => 
            isCompetitivePlayer(p) && 
            p.id !== editingPlayer.id &&
            p.division === targetDiv && 
            p.posicion != null && 
            p.posicion >= targetPos
          );
          affectedNew.forEach(p => {
            batch.update(doc(db, 'players', p.id), { 
              posicion: p.posicion! + 1, 
              updatedAt: new Date().toISOString() 
            });
          });
        }
      }

      const playerData = {
        nombre: nombre.trim(),
        apellidos: apellidos.trim(),
        telefono: telefono.trim(),
        categoria,
        division,
        puntos: Number(puntos),
        posicion: targetPos,
        updatedAt: new Date().toISOString(),
      };

      const playerRef = doc(db, 'players', editingPlayer.id);
      batch.update(playerRef, playerData);
      
      await batch.commit();
      showToast("¡Jugador y ranking actualizados correctamente!");
      setEditingPlayer(null);

      // Reset Form fields
      setNombre('');
      setApellidos('');
      setTelefono('');
      setCategoria('Primera');
      setDivision('Masculina');
      setPuntos(1000);
      setPosicion(1);

      if (onRefreshData) onRefreshData();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'players');
    } finally {
      setLoadingPlayer(false);
    }
  };

  // Handle scheduling a match
  const handleSubmitMatch = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!playerA1Id || !playerB1Id) {
      showError("Por favor selecciona los competidores principales (Equipo A y Equipo B)");
      return;
    }

    if (playerA1Id === playerB1Id) {
      showError("Un jugador no puede jugar contra sí mismo. Elige contrincantes distintos.");
      return;
    }

    if (!playerA2Id || !playerB2Id) {
      showError("Por favor selecciona todos los integrantes para el partido por parejas (2vs2)");
      return;
    }
    const allSelectedParticipants = [playerA1Id, playerA2Id, playerB1Id, playerB2Id];
    const uniqueParticipants = new Set(allSelectedParticipants);
    if (uniqueParticipants.size !== 4) {
      showError("Hay jugadores duplicados en las selecciones de parejas. Comprueba de nuevo.");
      return;
    }

    setLoadingMatch(true);
    try {
      const pA1 = players.find(p => p.id === playerA1Id)!;
      const pB1 = players.find(p => p.id === playerB1Id)!;
      
      const pA2 = players.find(p => p.id === playerA2Id);
      const pB2 = players.find(p => p.id === playerB2Id);

      const newMatchRef = doc(collection(db, 'matches'));
      const newMatch = {
        id: newMatchRef.id,
        type: matchType,
        categoria: matchCategoria,
        division: matchDivision,
        playerA1Id,
        playerA1Name: `${pA1.nombre} ${pA1.apellidos}`,
        playerA2Id: pA2?.id || null,
        playerA2Name: pA2 ? `${pA2.nombre} ${pA2.apellidos}` : null,
        playerB1Id,
        playerB1Name: `${pB1.nombre} ${pB1.apellidos}`,
        playerB2Id: pB2?.id || null,
        playerB2Name: pB2 ? `${pB2.nombre} ${pB2.apellidos}` : null,
        set1A: 0,
        set1B: 0,
        set2A: 0,
        set2B: 0,
        set3A: null,
        set3B: null,
        winner: 'playing',
        pointsChange: 0,
        playedAt: null,
        createdAt: new Date().toISOString(),
        scheduledAt: matchDate && matchTime ? `${matchDate}T${matchTime}:00` : new Date().toISOString(),
      };

      await setDoc(newMatchRef, newMatch);
      showToast("¡Encuentro agendado correctamente en el calendario!");

      // Reset match state
      setPlayerA1Id('');
      setPlayerA2Id('');
      setPlayerB1Id('');
      setPlayerB2Id('');
      const today = new Date();
      setMatchDate(today.toISOString().split('T')[0]);
      const hours = String(today.getHours()).padStart(2, '0');
      const minutes = String(today.getMinutes()).padStart(2, '0');
      setMatchTime(`${hours}:${minutes}`);

      if (onRefreshData) onRefreshData();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'matches');
    } finally {
      setLoadingMatch(false);
    }
  };

  const handleQuickMoveOneStep = async (player: Player, direction: 'up' | 'down') => {
    if (player.posicion == null) return;
    const oldPos = player.posicion;
    const targetPos = direction === 'up' ? oldPos - 1 : oldPos + 1;
    if (targetPos < 1) return;

    const div = player.division;
    const sameDivPlayers = players
      .filter(p => isCompetitivePlayer(p) && p.division === div && p.posicion != null && p.posicion > 0);

    if (targetPos > sameDivPlayers.length) return;

    setGestorSavingId(player.id);
    try {
      const batch = writeBatch(db);
      const sortedCategories = [...categories].sort((a, b) => (a.order ?? 999) - (b.order ?? 999));

      // Swap positions
      const neighbor = sameDivPlayers.find(p => p.posicion === targetPos);
      if (neighbor) {
        const neighborCat = sortedCategories[getGrupo(oldPos) - 1]?.name || neighbor.categoria;
        batch.update(doc(db, 'players', neighbor.id), {
          posicion: oldPos,
          categoria: neighborCat,
          updatedAt: new Date().toISOString()
        });
      }
      const playerCat = sortedCategories[getGrupo(targetPos) - 1]?.name || player.categoria;
      batch.update(doc(db, 'players', player.id), {
        posicion: targetPos,
        categoria: playerCat,
        updatedAt: new Date().toISOString()
      });
      await batch.commit();
    } catch (err) {
      console.error(err);
      showError('Error al mover de posición.');
    } finally {
      setGestorSavingId(null);
    }
  };

  const handleQuickChangePosition = async (player: Player, newPos: number) => {
    if (player.posicion == null || player.posicion === newPos || newPos < 1) return;
    
    const div = player.division;
    const sameDivPlayers = players
      .filter(p => isCompetitivePlayer(p) && p.division === div && p.posicion != null && p.posicion > 0)
      .sort((a, b) => a.posicion! - b.posicion!);

    if (sameDivPlayers.length === 0) return;

    const playerIndex = sameDivPlayers.findIndex(p => p.id === player.id);
    if (playerIndex === -1) return;

    const finalTargetPos = Math.min(newPos, sameDivPlayers.length);
    const targetIndex = finalTargetPos - 1;

    if (playerIndex === targetIndex) return;

    setGestorSavingId(player.id);
    try {
      const batch = writeBatch(db);
      const sortedCategories = [...categories].sort((a, b) => (a.order ?? 999) - (b.order ?? 999));

      const orderedList = [...sameDivPlayers];
      const [removedPlayer] = orderedList.splice(playerIndex, 1);
      orderedList.splice(targetIndex, 0, removedPlayer);

      orderedList.forEach((p, idx) => {
        const assignedPos = idx + 1;
        const assignedCat = sortedCategories[getGrupo(assignedPos) - 1]?.name || p.categoria;
        if (p.posicion !== assignedPos || p.categoria !== assignedCat) {
          batch.update(doc(db, 'players', p.id), {
            posicion: assignedPos,
            categoria: assignedCat,
            updatedAt: new Date().toISOString()
          });
        }
      });

      await batch.commit();
      showToast(`¡Posición de ${player.nombre} reordenada a #${finalTargetPos}!`);
    } catch (err) {
      console.error(err);
      showError('Error al cambiar la posición.');
    } finally {
      setGestorSavingId(null);
    }
  };

  const handleQuickChangeCategory = async (player: Player, newCatName: string) => {
    if (player.categoria === newCatName) return;
    setGestorSavingId(player.id);
    try {
      const sortedCategories = [...categories].sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
      const catIdx = sortedCategories.findIndex(c => c.name === newCatName);
      const newPos = catIdx !== -1 ? (catIdx * 4 + 1) : (player.posicion || 1);

      await setDoc(doc(db, 'players', player.id), {
        categoria: newCatName,
        posicion: newPos,
        updatedAt: new Date().toISOString()
      }, { merge: true });
      showToast(`¡Grupo de ${player.nombre} cambiado a ${newCatName} (Puesto #${newPos})!`);
    } catch (err) {
      console.error(err);
      showError('Error al cambiar de grupo.');
    } finally {
      setGestorSavingId(null);
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Toast Prompt styled like futuristic HUD notification */}
      {successMsg && (
        <div className="bg-ball/20 border border-ball/40 text-ball-safe rounded-xl py-3.5 px-4 shadow-lg text-xs font-bold leading-none font-mono uppercase tracking-widest flex items-center justify-between animate-fade-in relative overflow-hidden padel-glow">
          <span>{successMsg}</span>
          <button onClick={() => setSuccessMsg(null)} className="text-ink hover:text-ball-safe font-black ml-4 cursor-pointer">✕</button>
        </div>
      )}

      {errorMessage && (
        <div className="bg-rose-500/10 border border-rose-500/30 text-rose-400 rounded-xl py-3.5 px-4 shadow-lg text-xs font-bold leading-none font-mono uppercase tracking-widest flex items-center justify-between animate-fade-in relative overflow-hidden">
          <span>{errorMessage}</span>
          <button onClick={() => setErrorMessage(null)} className="text-ink hover:text-rose-400 font-black ml-4 cursor-pointer">✕</button>
        </div>
      )}

      {/* ── Sub-navegación interna del panel de Admin ──────────────────────── */}
      <div className="flex flex-wrap gap-2 bg-[var(--surface-input)] border border-[var(--border-subtle)] rounded-2xl p-1.5">
        {([
          { id: 'jugadores', label: 'Jugadores y Partidos', icon: UserPlus },
          { id: 'escalera', label: 'Escalera (Jornadas)', icon: ArrowUpDown },
          { id: 'categorias', label: 'Grupos y Niveles', icon: ListCollapse },
          { id: 'sistema', label: 'Sistema y Administración', icon: Shield },
        ] as const).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setAdminSection(id)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
              adminSection === id
                ? 'bg-ball text-black shadow-md shadow-lime-950/20'
                : 'text-ink-muted hover:text-ink hover:bg-[var(--surface-2)]'
            }`}
          >
            <Icon className="h-4 w-4" />
            <span>{label}</span>
          </button>
        ))}
      </div>

      {adminSection === 'jugadores' && (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Form A: Edit Player (el alta de nuevos jugadores se ha retirado de aquí) */}
        {editingPlayer && (
          <div className="glass-card rounded-2xl border border-[var(--border-subtle)] shadow-2xl p-5 sm:p-6 text-ink">
            <h2 className="font-display text-xl font-black text-ink flex items-center gap-2.5 border-b border-[var(--border-subtle)] pb-3 mb-5">
              <UserPlus className="h-5 w-5 text-ball-safe" />
              <span>Actualizar Ficha de Jugador</span>
            </h2>

            <form onSubmit={handleSubmitPlayer} className="space-y-5">
              
              {/* Name/LastName inputs */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="input-nombre" className="block text-[10px] font-bold text-ink-muted uppercase tracking-widest mb-1.5 font-mono">Nombre</label>
                  <input
                    id="input-nombre"
                    type="text"
                    required
                    placeholder="Ej. Carlos"
                    value={nombre}
                    onChange={(e) => setNombre(e.target.value)}
                    className="w-full bg-[var(--surface-input)] hover:bg-[var(--surface-input)] focus:bg-[var(--surface-input)] border border-[var(--border-subtle)] text-ink rounded-xl py-2.5 px-3.5 text-sm focus:outline-hidden focus:border-ball/55 focus:ring-2 focus:ring-ball/10 transition-all placeholder:text-ink-faint"
                  />
                </div>
                
                <div>
                  <label htmlFor="input-apellidos" className="block text-[10px] font-bold text-ink-muted uppercase tracking-widest mb-1.5 font-mono">Apellidos</label>
                  <input
                    id="input-apellidos"
                    type="text"
                    required
                    placeholder="Ej. Alcaraz"
                    value={apellidos}
                    onChange={(e) => setApellidos(e.target.value)}
                    className="w-full bg-[var(--surface-input)] hover:bg-[var(--surface-input)] focus:bg-[var(--surface-input)] border border-[var(--border-subtle)] text-ink rounded-xl py-2.5 px-3.5 text-sm focus:outline-hidden focus:border-ball/55 focus:ring-2 focus:ring-ball/10 transition-all placeholder:text-ink-faint"
                  />
                </div>
              </div>

              {/* Teléfono */}
              <div>
                <label htmlFor="input-telefono" className="block text-[10px] font-bold text-ink-muted uppercase tracking-widest mb-1.5 font-mono">Teléfono</label>
                <input
                  id="input-telefono"
                  type="tel"
                  placeholder="Ej. 612 345 678"
                  value={telefono}
                  onChange={(e) => setTelefono(e.target.value)}
                  className="w-full bg-[var(--surface-input)] hover:bg-[var(--surface-input)] focus:bg-[var(--surface-input)] border border-[var(--border-subtle)] text-ink rounded-xl py-2.5 px-3.5 text-sm focus:outline-hidden focus:border-ball/55 focus:ring-2 focus:ring-ball/10 transition-all placeholder:text-ink-faint"
                />
              </div>

              {/* Classification parameters */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="select-categoria" className="block text-[10px] font-bold text-ink-muted uppercase tracking-widest mb-1.5 font-mono">Grupo / Nivel</label>
                  <select
                    id="select-categoria"
                    value={categoria}
                    onChange={(e) => setCategoria(e.target.value)}
                    className="w-full bg-[var(--surface-input)] border border-[var(--border-subtle)] text-ink text-sm py-2.5 px-3.5 rounded-xl focus:outline-hidden focus:border-ball/55 focus:ring-2 focus:ring-ball/10 transition-all cursor-pointer"
                  >
                    {categories.map((cat) => (
                      <option key={cat.id} value={cat.name} className="bg-slate-900 text-ink">
                        {cat.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="select-division" className="block text-[10px] font-bold text-ink-muted uppercase tracking-widest mb-1.5 font-mono">División / Sexo</label>
                  <select
                    id="select-division"
                    value={division}
                    onChange={(e) => setDivision(e.target.value as DivisionType)}
                    className="w-full bg-[var(--surface-input)] border border-[var(--border-subtle)] text-ink text-sm py-2.5 px-3.5 rounded-xl focus:outline-hidden focus:border-ball/55 focus:ring-2 focus:ring-ball/10 transition-all cursor-pointer"
                  >
                    <option value="Masculina" className="bg-slate-900 text-ink">Masculina</option>
                    <option value="Femenina" className="bg-slate-900 text-ink">Femenina</option>
                  </select>
                </div>
              </div>

              {/* Posición oficial en la escalera (Reglamento 2026, Art. 9) */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="input-posicion" className="block text-[10px] font-bold text-ball-safe uppercase tracking-widest mb-1.5 font-mono">
                    Posición (Ranking)
                  </label>
                  <input
                    id="input-posicion"
                    type="number"
                    min="1"
                    max="999"
                    value={posicion}
                    onChange={(e) => setPosicion(parseInt(e.target.value) || 1)}
                    className="w-full bg-[var(--surface-input)] border border-ball/30 text-ink rounded-xl py-2.5 px-3.5 text-sm focus:outline-hidden focus:border-ball/55 focus:ring-2 focus:ring-ball/10 transition-all font-mono font-bold text-ball-safe"
                  />
                </div>
                <div>
                  <label htmlFor="input-puntos" className="block text-[10px] font-bold text-ink-faint uppercase tracking-widest mb-1.5 font-mono">
                    Puntos <span className="italic">(histórico, no rige)</span>
                  </label>
                  <input
                    id="input-puntos"
                    type="number"
                    min="0"
                    max="10000"
                    value={puntos}
                    onChange={(e) => setPuntos(parseInt(e.target.value) || 0)}
                    className="w-full bg-[var(--surface-input)] border border-[var(--border-subtle)] text-ink-muted rounded-xl py-2.5 px-3.5 text-sm focus:outline-hidden focus:border-[var(--border-strong)] transition-all font-mono"
                  />
                </div>
              </div>

              {/* Option triggers */}
              <div className="pt-3 border-t border-[var(--border-strong)] flex gap-2">
                <button
                  id="btn-submit-player"
                  type="submit"
                  disabled={loadingPlayer}
                  className="flex-1 bg-ball hover:bg-ball-hover text-black font-black uppercase tracking-widest text-[11px] py-3.5 px-4 rounded-xl flex items-center justify-center gap-1.5 transition-all shadow-md shadow-lime-950/20 cursor-pointer"
                >
                  {loadingPlayer ? <RefreshCw className="h-4 w-4 animate-spin text-black" /> : <Check className="h-4 w-4 text-black font-bold" />}
                  <span>Guardar Cambios</span>
                </button>

                <button
                  type="button"
                  id="btn-cancel-edit"
                  onClick={() => {
                    setEditingPlayer(null);
                    setNombre('');
                    setApellidos('');
                    setTelefono('');
                    setPuntos(1000);
      setPosicion(1);
                  }}
                  className="bg-[var(--surface-2)] hover:bg-[var(--surface-2)] text-ink font-bold text-xs py-3.5 px-4 rounded-xl transition-all cursor-pointer"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Generador de Partidos de la Jornada desde los Grupos Actuales de la Escalera */}
        <div className="glass-card rounded-2xl border border-emerald-500/15 bg-emerald-950/5 shadow-2xl p-5 sm:p-6 text-ink">
          <h2 className="font-display text-xl font-black text-ink flex items-center gap-2.5 border-b border-[var(--border-subtle)] pb-3 mb-5">
            <ListOrdered className="h-5 w-5 text-emerald-400" />
            <span>Generar Partidos de la Jornada (Grupos Actuales)</span>
          </h2>

          <p className="text-ink-muted text-[11px] leading-relaxed mb-5">
            Genera automáticamente, a partir de la posición actual de cada jugador en la escalera, los grupos de 4 y sus <strong className="text-ink">3 partidos de rotación</strong> (cruzándose entre los 4 miembros del grupo), sin necesidad de Excel. No se crea nada hasta que confirmes la vista previa.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5 p-4 bg-[var(--surface-2)] rounded-2xl border border-[var(--border-subtle)]">
            <div className="space-y-1.5">
              <label className="text-xs font-mono uppercase tracking-wider text-emerald-400 font-bold">Fecha de la Jornada</label>
              <input
                type="date"
                value={groupMatchesDate}
                onChange={(e) => setGroupMatchesDate(e.target.value)}
                className="w-full bg-[var(--surface-input)] border border-[var(--border-subtle)] rounded-xl px-4 py-2.5 text-sm text-ink focus:outline-hidden focus:border-emerald-500 transition-colors"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-mono uppercase tracking-wider text-emerald-400 font-bold">Hora de Inicio Estimada</label>
              <input
                type="time"
                value={groupMatchesTime}
                onChange={(e) => setGroupMatchesTime(e.target.value)}
                className="w-full bg-[var(--surface-input)] border border-[var(--border-subtle)] rounded-xl px-4 py-2.5 text-sm text-ink focus:outline-hidden focus:border-emerald-500 transition-colors"
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-2.5 mb-4">
            <button
              type="button"
              onClick={handlePreviewGroupMatches}
              className="flex items-center gap-2 bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-400 font-black text-xs uppercase tracking-wider px-4 py-2.5 rounded-xl transition-all cursor-pointer"
            >
              <ListOrdered className="h-4 w-4" />
              <span>Ver Partidos Según Grupos Actuales</span>
            </button>
          </div>

          {groupMatchesPreview && (
            <div className="space-y-3">
              <div className="flex items-center gap-4 text-[11px] font-bold flex-wrap">
                <span className="flex items-center gap-1.5 text-emerald-400">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  {groupMatchesPreview.grupos.length} grupo(s) completo(s) · {groupMatchesPreview.grupos.length * 3} partido(s) a crear
                </span>
                {groupMatchesPreview.incompletos.length > 0 && (
                  <span className="flex items-center gap-1.5 text-amber-400">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    {groupMatchesPreview.incompletos.length} grupo(s) incompleto(s) (se omiten)
                  </span>
                )}
              </div>

              {groupMatchesPreview.grupos.length === 0 && (
                <p className="text-ink-faint text-xs italic">No hay ningún grupo completo de 4 jugadores con posición asignada todavía.</p>
              )}

              <div className="bg-[var(--surface-input)] border border-[var(--border-subtle)] rounded-xl max-h-96 overflow-y-auto divide-y divide-[var(--border-subtle)] custom-scrollbar">
                {groupMatchesPreview.grupos.map((g, gi) => (
                  <div key={gi} className="p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider ${g.division === 'Masculina' ? 'text-sky-400 bg-sky-500/10 border border-sky-500/20' : 'text-pink-400 bg-pink-500/10 border border-pink-500/20'}`}>
                        {g.division}
                      </span>
                      <span className="text-[10px] font-black uppercase tracking-wider text-ink-muted">Grupo {g.grupo}</span>
                      <span className="text-[10px] text-ink-faint">({g.jugadores.map(j => j.nombre).join(', ')})</span>
                    </div>
                    <div className="space-y-1">
                      {g.matches.map((m, mi) => (
                        <div key={mi} className="flex items-center gap-1.5 text-[11px] font-mono text-ink-muted pl-1">
                          <Swords className="h-3 w-3 text-ink-faint shrink-0" />
                          <span className="font-bold text-ink">{m.playerA1.nombre} &amp; {m.playerA2.nombre}</span>
                          <span className="text-ink-faint">vs</span>
                          <span className="font-bold text-ink">{m.playerB1.nombre} &amp; {m.playerB2.nombre}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {groupMatchesPreview.incompletos.length > 0 && (
                <div className="bg-amber-500/5 border border-amber-500/15 rounded-xl p-3 text-[10px] text-amber-400/90 space-y-1">
                  {groupMatchesPreview.incompletos.map((inc, i) => (
                    <p key={i}>Grupo {inc.grupo}: solo {inc.jugadores.length} jugador(es) con posición ({inc.jugadores.map(j => j.nombre).join(', ') || '—'}).</p>
                  ))}
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={handleCreateGroupMatches}
                  disabled={groupMatchesCreating || groupMatchesPreview.grupos.length === 0}
                  className="flex items-center gap-2 bg-ball hover:bg-ball-hover disabled:opacity-30 text-black font-black text-xs uppercase tracking-wider px-5 py-2.5 rounded-xl transition-all cursor-pointer"
                >
                  {groupMatchesCreating ? <RefreshCw className="h-4 w-4 animate-spin" /> : <CalendarPlus className="h-4 w-4" />}
                  <span>Crear {groupMatchesPreview.grupos.length * 3} Partido(s)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setGroupMatchesPreview(null)}
                  className="text-ink-faint hover:text-ink-muted text-xs font-bold uppercase tracking-wider px-3 py-2.5 cursor-pointer"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Form B: Create Match scheduler */}
        <div className="glass-card rounded-2xl border border-[var(--border-subtle)] shadow-2xl p-5 sm:p-6 text-ink">
          <h2 className="font-display text-xl font-black text-ink flex items-center gap-2.5 border-b border-[var(--border-subtle)] pb-3 mb-5">
            <CalendarPlus className="h-5 w-5 text-ball-safe" />
            <span>Programar Enfrentamiento</span>
          </h2>

          <form onSubmit={handleSubmitMatch} className="space-y-4">
            
            {/* Match structural settings inside dark block */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-[var(--surface-input)] p-3 rounded-xl border border-[var(--border-subtle)]">
              <div>
                <label htmlFor="select-match-categoria" className="block text-[9px] font-bold text-ink-muted uppercase tracking-widest mb-1.5">Filtro Grupo</label>
                <select
                  id="select-match-categoria"
                  value={matchCategoria}
                  onChange={(e) => {
                    setMatchCategoria(e.target.value);
                    setPlayerA1Id(''); setPlayerA2Id(''); setPlayerB1Id(''); setPlayerB2Id('');
                  }}
                  className="w-full bg-slate-900 border border-[var(--border-subtle)] text-ink text-xs py-2 px-2.5 rounded-lg font-bold cursor-pointer"
                >
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.name}>
                      {cat.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="select-match-division" className="block text-[9px] font-bold text-ink-muted uppercase tracking-widest mb-1.5">Filtro Sexo</label>
                <select
                  id="select-match-division"
                  value={matchDivision}
                  onChange={(e) => {
                    setMatchDivision(e.target.value as DivisionType);
                    setPlayerA1Id(''); setPlayerA2Id(''); setPlayerB1Id(''); setPlayerB2Id('');
                  }}
                  className="w-full bg-slate-900 border border-[var(--border-subtle)] text-ink text-xs py-2 px-2.5 rounded-lg font-bold cursor-pointer"
                >
                  <option value="Masculina">Masculina</option>
                  <option value="Femenina">Femenina</option>
                </select>
              </div>
            </div>

            {/* Match Date and Time selection */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-[var(--surface-input)] p-3 rounded-xl border border-[var(--border-subtle)]">
              <div>
                <label htmlFor="input-match-date" className="block text-[9px] font-bold text-ink-muted uppercase tracking-widest mb-1.5">Fecha del Partido</label>
                <input
                  id="input-match-date"
                  type="date"
                  required
                  value={matchDate}
                  onChange={(e) => setMatchDate(e.target.value)}
                  className="w-full bg-slate-900 border border-[var(--border-subtle)] text-ink text-xs py-2 px-2.5 rounded-lg font-bold cursor-pointer [color-scheme:dark]"
                />
              </div>

              <div>
                <label htmlFor="input-match-time" className="block text-[9px] font-bold text-ink-muted uppercase tracking-widest mb-1.5">Hora de Inicio</label>
                <input
                  id="input-match-time"
                  type="time"
                  required
                  value={matchTime}
                  onChange={(e) => setMatchTime(e.target.value)}
                  className="w-full bg-slate-900 border border-[var(--border-subtle)] text-ink text-xs py-2 px-2.5 rounded-lg font-bold cursor-pointer [color-scheme:dark]"
                />
              </div>
            </div>

            {/* Validation alert notice */}
            <div className="text-[11px] text-amber-400 bg-amber-500/10 p-3 rounded-xl border border-amber-500/15 flex items-center gap-2 leading-relaxed">
              <AlertTriangle className="h-4.5 w-4.5 text-amber-500 shrink-0" />
              <span>Para el balance de ligabilidad, se filtran combatientes registrados bajo la categoría y división seleccionadas en la base de datos.</span>
            </div>

            {/* Select Competitors layout */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              
              {/* TEAM A selectors Block */}
              <div className="space-y-3.5 bg-[var(--surface-input)] p-3.5 rounded-2xl border border-[var(--border-subtle)]">
                <span className="text-[11px] font-black text-ball-safe tracking-widest block border-b border-[var(--border-subtle)] pb-1 uppercase">EQUIPO A</span>
                
                <div>
                  <label htmlFor="select-playera1" className="block text-[9px] font-bold text-ink-muted uppercase tracking-wider mb-1">Jugador Principal</label>
                  <select
                    id="select-playera1"
                    required
                    value={playerA1Id}
                    onChange={(e) => setPlayerA1Id(e.target.value)}
                    className="w-full bg-slate-900 border border-[var(--border-subtle)] text-ink text-xs py-2 px-2 rounded-lg cursor-pointer"
                  >
                    <option value="">-- Elige jugador --</option>
                    {eligiblePlayers.map(p => (
                      <option key={p.id} value={p.id} className="bg-slate-900">{p.nombre} {p.apellidos} ({p.puntos} pts)</option>
                    ))}
                  </select>
                </div>

                {matchType === '2vs2' && (
                  <div>
                    <label htmlFor="select-playera2" className="block text-[9px] font-bold text-ink-muted uppercase tracking-wider mb-1">Pareja (Segundo)</label>
                    <select
                      id="select-playera2"
                      required
                      value={playerA2Id}
                      onChange={(e) => setPlayerA2Id(e.target.value)}
                      className="w-full bg-slate-900 border border-[var(--border-subtle)] text-ink text-xs py-2 px-2 rounded-lg cursor-pointer"
                    >
                      <option value="">-- Elige jugador --</option>
                      {eligiblePlayers.map(p => (
                        <option key={p.id} value={p.id} className="bg-slate-900">{p.nombre} {p.apellidos} ({p.puntos} pts)</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {/* TEAM B selectors Block */}
              <div className="space-y-3.5 bg-[var(--surface-input)] p-3.5 rounded-2xl border border-[var(--border-subtle)]">
                <span className="text-[11px] font-black text-ball-safe tracking-widest block border-b border-[var(--border-subtle)] pb-1 uppercase">EQUIPO B</span>
                
                <div>
                  <label htmlFor="select-playerb1" className="block text-[9px] font-bold text-ink-muted uppercase tracking-wider mb-1">Jugador Principal</label>
                  <select
                    id="select-playerb1"
                    required
                    value={playerB1Id}
                    onChange={(e) => setPlayerB1Id(e.target.value)}
                    className="w-full bg-slate-900 border border-[var(--border-subtle)] text-ink text-xs py-2 px-2 rounded-lg cursor-pointer"
                  >
                    <option value="">-- Elige jugador --</option>
                    {eligiblePlayers.map(p => (
                      <option key={p.id} value={p.id} className="bg-slate-900">{p.nombre} {p.apellidos} ({p.puntos} pts)</option>
                    ))}
                  </select>
                </div>

                {matchType === '2vs2' && (
                  <div>
                    <label htmlFor="select-playerb2" className="block text-[9px] font-bold text-ink-muted uppercase tracking-wider mb-1">Pareja (Segundo)</label>
                    <select
                      id="select-playerb2"
                      required
                      value={playerB2Id}
                      onChange={(e) => setPlayerB2Id(e.target.value)}
                      className="w-full bg-slate-900 border border-[var(--border-subtle)] text-ink text-xs py-2 px-2 rounded-lg cursor-pointer"
                    >
                      <option value="">-- Elige jugador --</option>
                      {eligiblePlayers.map(p => (
                        <option key={p.id} value={p.id} className="bg-slate-900">{p.nombre} {p.apellidos} ({p.puntos} pts)</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            </div>

            {/* Submit match scheduler triggers */}
            <div className="pt-3 border-t border-[var(--border-strong)]">
              <button
                id="btn-submit-match"
                type="submit"
                disabled={loadingMatch}
                className="w-full bg-ball hover:bg-ball-hover text-black font-black uppercase tracking-widest text-[11px] py-3.5 px-4 rounded-xl flex items-center justify-center gap-1.5 transition-all shadow-md shadow-lime-950/20 cursor-pointer"
              >
                {loadingMatch ? <RefreshCw className="h-4 w-4 animate-spin text-black animate-pulse" /> : <Check className="h-4 w-4 text-black font-bold" />}
                <span>Programar Partido Oficial</span>
              </button>
            </div>
          </form>
        </div>

      </div>
      )}

      {adminSection === 'escalera' && (
      <div className="space-y-6">

        {/* Migración a ranking por posiciones con Ordenamiento Manual */}
        {playersNeedingMigration.length > 0 && (
          <div className="glass-card rounded-2xl border border-amber-500/30 bg-amber-950/10 shadow-2xl p-5 sm:p-6 text-ink">
            <h3 className="font-display font-black text-amber-500 text-sm uppercase tracking-wide flex items-center gap-2 mb-2">
              <AlertTriangle className="h-4 w-4 animate-pulse" />
              <span>Inicializar Ranking por Posiciones (Configuración Manual)</span>
            </h3>
            <p className="text-ink-muted text-xs leading-relaxed mb-4">
              {playersNeedingMigration.length} jugador(es) todavía no tienen una posición asignada en la escalera. 
              <strong> ¡Puedes ordenar la lista arrastrando o indicando el número de posición inicial que desees asignar a cada uno!</strong>
            </p>

            {/* Division Selector */}
            <div className="flex gap-2 mb-4">
              <button
                type="button"
                onClick={() => setInitialRankDivision('Masculina')}
                className={`flex-1 py-2 px-3 rounded-xl text-xs font-black uppercase tracking-wider border transition-all cursor-pointer ${
                  initialRankDivision === 'Masculina'
                    ? 'bg-amber-500 border-amber-500 text-black shadow-md shadow-amber-950/20'
                    : 'bg-[var(--surface-input)] border-[var(--border-subtle)] text-ink-muted hover:text-ink'
                }`}
              >
                Masculina ({customOrderMasc.length})
              </button>
              <button
                type="button"
                onClick={() => setInitialRankDivision('Femenina')}
                className={`flex-1 py-2 px-3 rounded-xl text-xs font-black uppercase tracking-wider border transition-all cursor-pointer ${
                  initialRankDivision === 'Femenina'
                    ? 'bg-amber-500 border-amber-500 text-black shadow-md shadow-amber-950/20'
                    : 'bg-[var(--surface-input)] border-[var(--border-subtle)] text-ink-muted hover:text-ink'
                }`}
              >
                Femenina ({customOrderFem.length})
              </button>
            </div>

            {/* Player List Reordering */}
            <div className="space-y-2 max-h-96 overflow-y-auto mb-4 p-1 rounded-xl bg-black/10 border border-amber-500/10 divide-y divide-amber-500/10">
              {((initialRankDivision === 'Masculina' ? customOrderMasc : customOrderFem)).length === 0 ? (
                <div className="text-center py-6 text-ink-faint text-xs italic">
                  No hay jugadores pendientes en esta división.
                </div>
              ) : (
                (initialRankDivision === 'Masculina' ? customOrderMasc : customOrderFem).map((p, i, arr) => (
                  <div key={p.id} className="flex items-center gap-3 p-2.5 hover:bg-amber-500/5 transition-all rounded-lg text-xs">
                    {/* Position indicator */}
                    <span className="w-7 h-7 rounded-lg bg-amber-500/10 text-amber-500 border border-amber-500/25 flex items-center justify-center font-mono font-bold shrink-0">
                      #{i + 1}
                    </span>

                    {/* Name */}
                    <div className="flex-1 truncate">
                      <div className="font-semibold text-ink truncate">{p.nombre} {p.apellidos}</div>
                      <div className="text-[10px] text-ink-faint font-mono">Puntos: {p.puntos} | Nivel: {p.categoria}</div>
                    </div>

                    {/* Quick Move input and Up/Down Buttons */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      <label className="text-[10px] text-ink-faint font-mono font-bold">Pos:</label>
                      <input
                        type="number"
                        min={1}
                        max={arr.length}
                        value={i + 1}
                        onChange={(e) => {
                          const val = parseInt(e.target.value) || 1;
                          handleSetInitialPlayerPosition(initialRankDivision, i, val);
                        }}
                        className="w-12 text-center bg-[var(--surface-input)] border border-amber-500/30 text-ink rounded-lg py-1 text-xs focus:outline-none focus:border-amber-500"
                      />
                      <div className="flex flex-col gap-0.5">
                        <button
                          type="button"
                          onClick={() => handleMoveInitialPlayer(initialRankDivision, i, 'up')}
                          disabled={i === 0}
                          className="p-1 rounded-md hover:bg-amber-500/20 text-ink-muted hover:text-amber-400 disabled:opacity-20 transition-all cursor-pointer"
                        >
                          <ChevronUp className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleMoveInitialPlayer(initialRankDivision, i, 'down')}
                          disabled={i === arr.length - 1}
                          className="p-1 rounded-md hover:bg-amber-500/20 text-ink-muted hover:text-amber-400 disabled:opacity-20 transition-all cursor-pointer"
                        >
                          <ChevronDown className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Actions */}
            <div className="flex flex-col sm:flex-row gap-2 mt-4">
              <button
                type="button"
                onClick={() => setHasInitializedCustomOrder(false)}
                className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-amber-500/30 text-amber-500 hover:bg-amber-500/10 font-bold text-xs transition-all cursor-pointer"
              >
                <RefreshCw className="h-4 w-4" />
                <span>Restablecer Orden por Defecto (Puntos)</span>
              </button>
              <button
                onClick={handleMigrarAPosiciones}
                disabled={migrationLoading}
                className="flex-1 flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black font-black text-xs uppercase tracking-wider px-5 py-3 rounded-xl shadow-md shadow-amber-950/15 transition-all cursor-pointer"
              >
                {migrationLoading ? <RefreshCw className="h-4 w-4 animate-spin text-black" /> : <ArrowUpDown className="h-4 w-4 text-black" />}
                <span>Confirmar y Guardar Ranking por Posiciones</span>
              </button>
            </div>
          </div>
        )}

        {/* Registrar Jornada Oficial */}
        <div className="glass-card rounded-2xl border border-[var(--border-subtle)] shadow-2xl p-5 sm:p-6 text-ink">
          <h2 className="font-display text-xl font-black flex items-center gap-2.5 border-b border-[var(--border-subtle)] pb-3 mb-5">
            <ListOrdered className="h-5 w-5 text-ball-safe" />
            <span>Registrar Jornada Oficial (Grupo de 4)</span>
          </h2>

          <p className="text-ink-muted text-[11px] leading-relaxed mb-4">
            Introduce los juegos ganados/perdidos por cada jugador del grupo en sus 3 rotaciones. La app calcula la clasificación 1º-4º y mueve las posiciones según las reglas oficiales de la liga, incluyendo el ascenso/descenso con el grupo superior si corresponde.
          </p>

          <div className="grid grid-cols-2 gap-3 mb-4">
            <div>
              <label className="block text-[10px] font-bold text-ink-muted uppercase tracking-widest mb-1.5">División</label>
              <select
                value={jornadaDivision}
                onChange={(e) => { setJornadaDivision(e.target.value as DivisionType); setJornadaGrupo(1); setJornadaPreview(null); setJornadaJuegos({}); }}
                className="w-full bg-[var(--surface-input)] border border-[var(--border-subtle)] text-ink text-sm py-2.5 px-3 rounded-xl focus:outline-none focus:border-ball/50 cursor-pointer"
              >
                <option value="Masculina" className="bg-slate-900 text-ink">Masculina</option>
                <option value="Femenina" className="bg-slate-900 text-ink">Femenina</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-ink-muted uppercase tracking-widest mb-1.5">Grupo</label>
              <select
                value={jornadaGrupo}
                onChange={(e) => { setJornadaGrupo(parseInt(e.target.value)); setJornadaPreview(null); setJornadaJuegos({}); }}
                className="w-full bg-[var(--surface-input)] border border-[var(--border-subtle)] text-ink text-sm py-2.5 px-3 rounded-xl focus:outline-none focus:border-ball/50 cursor-pointer"
              >
                {gruposDisponibles.map(g => {
                  const { desde, hasta } = getRangoGrupo(g);
                  return <option key={g} value={g} className="bg-slate-900 text-ink">Grupo {g} (puestos {desde}-{hasta})</option>;
                })}
              </select>
            </div>
          </div>

          {jugadoresDelGrupo.length > 0 && (
            <div className={`mb-4 p-3 rounded-xl border text-[11px] leading-relaxed flex items-start gap-2.5 ${
              partidosJugadosGrupo.length > 0
                ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                : 'bg-amber-500/10 border-amber-500/20 text-amber-400'
            }`}>
              {partidosJugadosGrupo.length > 0 ? (
                <>
                  <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0 animate-pulse text-emerald-400" />
                  <div>
                    <span className="font-bold uppercase tracking-wider block mb-0.5">Juegos Auto-calculados ({partidosJugadosGrupo.length}/3 partidos)</span>
                    Se han cargado automáticamente los juegos ganados y perdidos a partir de los <strong>{partidosJugadosGrupo.length}</strong> partidos jugados registrados para este grupo esta semana. Puedes editarlos manualmente si es necesario.
                  </div>
                </>
              ) : (
                <>
                  <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-amber-400" />
                  <div>
                    <span className="font-bold uppercase tracking-wider block mb-0.5">Sin partidos registrados</span>
                    No hay partidos jugados registrados para este grupo. Puedes ingresar los juegos manualmente o registrar los marcadores primero en la pestaña "Partidos" para que se calculen solos.
                  </div>
                </>
              )}
            </div>
          )}

          {jugadoresDelGrupo.length === 0 ? (
            <p className="text-ink-faint text-xs italic">No hay jugadores con posición asignada en este grupo.</p>
          ) : (
            <div className="space-y-2.5 mb-4">
              {jugadoresDelGrupo.map(j => (
                <div key={j.playerId} className="flex items-center gap-3 bg-[var(--surface-2)] border border-[var(--border-subtle)] rounded-xl p-3">
                  <span className="w-8 h-8 rounded-full bg-court/10 text-court border border-court/20 flex items-center justify-center font-mono font-bold text-xs shrink-0">
                    {j.posicion}
                  </span>
                  <span className="flex-1 text-sm font-semibold text-ink truncate">{j.playerName}</span>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      min={0}
                      placeholder="G"
                      title="Juegos ganados (3 rotaciones)"
                      value={jornadaJuegos[j.playerId]?.ganados ?? ''}
                      onChange={(e) => setJornadaJuegos(prev => ({ ...prev, [j.playerId]: { ganados: e.target.value, perdidos: prev[j.playerId]?.perdidos ?? '' } }))}
                      className="w-14 bg-[var(--surface-input)] border border-[var(--border-subtle)] text-ink text-center text-sm py-1.5 rounded-lg focus:outline-none focus:border-emerald-500/50"
                    />
                    <span className="text-ink-faint text-xs">/</span>
                    <input
                      type="number"
                      min={0}
                      placeholder="P"
                      title="Juegos perdidos (3 rotaciones)"
                      value={jornadaJuegos[j.playerId]?.perdidos ?? ''}
                      onChange={(e) => setJornadaJuegos(prev => ({ ...prev, [j.playerId]: { ganados: prev[j.playerId]?.ganados ?? '', perdidos: e.target.value } }))}
                      className="w-14 bg-[var(--surface-input)] border border-[var(--border-subtle)] text-ink text-center text-sm py-1.5 rounded-lg focus:outline-none focus:border-rose-500/50"
                    />
                  </div>
                </div>
              ))}
            </div>
          )}

          {!jornadaPreview ? (
            <button
              onClick={handleCalcularJornada}
              disabled={jugadoresDelGrupo.length < 2}
              className="flex items-center gap-2 bg-court/15 hover:bg-court/25 border border-court/30 text-court font-black text-xs uppercase tracking-wider px-5 py-2.5 rounded-xl transition-all cursor-pointer disabled:opacity-30"
            >
              <Eye className="h-4 w-4" />
              <span>Calcular Movimiento</span>
            </button>
          ) : (
            <div className="space-y-3">
              <div className="bg-black/20 border border-[var(--border-subtle)] rounded-xl divide-y divide-[var(--border-subtle)]">
                {jornadaPreview.movimientos.map((mov, i) => (
                  <div key={i} className="flex items-center justify-between p-3 text-xs">
                    <span className="font-semibold text-ink">{mov.playerName}</span>
                    <div className="flex items-center gap-2 font-mono">
                      <span className="text-ink-faint">#{mov.posicionAntes}</span>
                      <span className="text-ink-faint">→</span>
                      <span className={mov.posicionDespues < mov.posicionAntes ? 'text-emerald-500 font-bold' : mov.posicionDespues > mov.posicionAntes ? 'text-rose-500 font-bold' : 'text-ink-muted font-bold'}>
                        #{mov.posicionDespues}
                      </span>
                      {mov.posicionDespues < mov.posicionAntes && <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />}
                      {mov.posicionDespues > mov.posicionAntes && <TrendingDown className="h-3.5 w-3.5 text-rose-500" />}
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleConfirmarJornada}
                  disabled={jornadaLoading}
                  className="flex-1 flex items-center justify-center gap-2 bg-ball hover:bg-ball-hover disabled:opacity-50 text-black font-black text-xs uppercase tracking-wider py-3 rounded-xl transition-all cursor-pointer"
                >
                  {jornadaLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  <span>Confirmar y Aplicar</span>
                </button>
                <button
                  onClick={() => setJornadaPreview(null)}
                  disabled={jornadaLoading}
                  className="bg-[var(--surface-2)] hover:bg-[var(--border-subtle)] text-ink font-black text-xs uppercase px-4 py-3 rounded-xl cursor-pointer disabled:opacity-50"
                >
                  Recalcular
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Mover Posiciones Manualmente */}
        <div className="glass-card rounded-2xl border border-[var(--border-subtle)] shadow-2xl p-5 sm:p-6 text-ink">
          <h2 className="font-display text-xl font-black flex items-center gap-2.5 border-b border-[var(--border-subtle)] pb-3 mb-5">
            <ArrowUpDown className="h-5 w-5 text-ball-safe" />
            <span>Mover Posiciones Manualmente (Reordenar Escalera)</span>
          </h2>

          <p className="text-ink-muted text-[11px] leading-relaxed mb-4">
            Selecciona un jugador activo para cambiar su posición oficial. La app calculará automáticamente el desplazamiento en cascada del resto de jugadores de la división para evitar colisiones y mantener el ranking correlativo de forma limpia.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-[10px] font-bold text-ink-muted uppercase tracking-widest mb-1.5 font-mono">
                Seleccionar Jugador
              </label>
              <select
                value={moverPlayerId}
                onChange={(e) => {
                  const id = e.target.value;
                  setMoverPlayerId(id);
                  const player = players.find(p => p.id === id);
                  if (player && player.posicion != null) {
                    setMoverNuevaPosicion(player.posicion);
                  }
                }}
                className="w-full bg-[var(--surface-input)] border border-[var(--border-subtle)] text-ink text-sm py-2.5 px-3 rounded-xl focus:outline-none focus:border-ball/50 cursor-pointer"
              >
                <option value="" className="bg-slate-900 text-ink">-- Seleccionar jugador --</option>
                {players
                  .filter(p => isCompetitivePlayer(p) && p.posicion != null && p.posicion > 0)
                  .sort((a, b) => a.division.localeCompare(b.division) || a.posicion! - b.posicion!)
                  .map(p => {
                    const grupo = Math.ceil(p.posicion! / 4);
                    const grupoName = categories[grupo - 1]?.name || `Grupo ${grupo}`;
                    return (
                      <option key={p.id} value={p.id} className="bg-slate-900 text-ink">
                        [{p.division}] #{p.posicion} - {p.nombre} {p.apellidos} ({grupoName})
                      </option>
                    );
                  })}
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-ink-muted uppercase tracking-widest mb-1.5 font-mono">
                Nueva Posición (Puesto en Escalera)
              </label>
              <input
                type="number"
                min={1}
                disabled={!moverPlayerId}
                value={moverNuevaPosicion}
                onChange={(e) => setMoverNuevaPosicion(parseInt(e.target.value) || 1)}
                className="w-full bg-[var(--surface-input)] border border-[var(--border-subtle)] text-ink text-sm py-2.5 px-3 rounded-xl focus:outline-none focus:border-ball/50 disabled:opacity-40"
              />
            </div>
          </div>

          {moverPreview && moverPreview.length > 0 && (
            <div className="space-y-3 mb-4">
              <label className="block text-[10px] font-bold text-emerald-400 uppercase tracking-widest mb-1 font-mono">
                Vista Previa de los Cambios en Cascada:
              </label>
              <div className="bg-black/25 border border-[var(--border-subtle)] rounded-xl divide-y divide-[var(--border-subtle)] max-h-60 overflow-y-auto">
                {moverPreview.map((mov, i) => (
                  <div key={i} className="flex items-center justify-between p-3 text-xs">
                    <span className="font-semibold text-ink">{mov.playerName}</span>
                    <div className="flex items-center gap-2 font-mono">
                      <span className="text-ink-faint">#{mov.posicionAntes}</span>
                      <span className="text-ink-faint font-sans text-[10px] ml-1">
                        ({categories[Math.ceil(mov.posicionAntes / 4) - 1]?.name || `Grupo ${Math.ceil(mov.posicionAntes / 4)}`})
                      </span>
                      <span className="text-ink-faint">→</span>
                      <span className={mov.posicionDespues < mov.posicionAntes ? 'text-emerald-500 font-bold' : mov.posicionDespues > mov.posicionAntes ? 'text-rose-500 font-bold' : 'text-ink-muted font-bold'}>
                        #{mov.posicionDespues}
                      </span>
                      <span className="text-ink-faint font-sans text-[10px] ml-1">
                        ({categories[Math.ceil(mov.posicionDespues / 4) - 1]?.name || `Grupo ${Math.ceil(mov.posicionDespues / 4)}`})
                      </span>
                      {mov.posicionDespues < mov.posicionAntes && <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />}
                      {mov.posicionDespues > mov.posicionAntes && <TrendingDown className="h-3.5 w-3.5 text-rose-500" />}
                    </div>
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={handleConfirmarMoverPosicion}
                disabled={moverLoading}
                className="w-full flex items-center justify-center gap-2 bg-ball hover:bg-ball-hover disabled:opacity-50 text-black font-black text-xs uppercase tracking-wider py-3 rounded-xl transition-all cursor-pointer shadow-md shadow-lime-950/20"
              >
                {moverLoading ? <RefreshCw className="h-4 w-4 animate-spin text-black" /> : <Check className="h-4 w-4 text-black font-bold" />}
                <span>Confirmar y Guardar Cambios de Posición</span>
              </button>
            </div>
          )}
        </div>

        {/* Gestor Rápido de Posiciones y Grupos */}
        <div className="glass-card rounded-2xl border border-[var(--border-subtle)] shadow-2xl p-5 sm:p-6 text-ink">
          <h2 className="font-display text-xl font-black flex items-center gap-2.5 border-b border-[var(--border-subtle)] pb-3 mb-5">
            <ArrowUpDown className="h-5 w-5 text-ball-safe" />
            <span>Gestor Rápido de Posiciones y Grupos</span>
          </h2>

          <p className="text-ink-muted text-[11px] leading-relaxed mb-5">
            Reordena la escalera al instante. Filtra por división y grupo para tener una lista compacta. Puedes mover a un jugador arriba/abajo una posición, o escribir directamente un número de puesto y pulsar <em>Intro</em> para desplazar en cascada al resto. También puedes cambiar su grupo en el acto.
          </p>

          {/* Filters Bar */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5 p-4 bg-black/15 rounded-xl border border-[var(--border-subtle)]">
            <div>
              <label className="block text-[10px] font-bold text-ink-muted uppercase tracking-widest mb-1.5 font-mono">
                Filtrar por División
              </label>
              <select
                value={gestorDivision}
                onChange={(e) => setGestorDivision(e.target.value as DivisionType)}
                className="w-full bg-[var(--surface-input)] border border-[var(--border-subtle)] text-ink text-xs py-2 px-2.5 rounded-lg focus:outline-none focus:border-ball/50 cursor-pointer font-bold"
              >
                <option value="Masculina" className="bg-slate-900 text-ink">Masculina</option>
                <option value="Femenina" className="bg-slate-900 text-ink">Femenina</option>
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-ink-muted uppercase tracking-widest mb-1.5 font-mono">
                Filtrar por Grupo
              </label>
              <select
                value={gestorCategoria}
                onChange={(e) => setGestorCategoria(e.target.value)}
                className="w-full bg-[var(--surface-input)] border border-[var(--border-subtle)] text-ink text-xs py-2 px-2.5 rounded-lg focus:outline-none focus:border-ball/50 cursor-pointer font-bold"
              >
                <option value="Todos" className="bg-slate-900 text-ink">-- Todos los grupos --</option>
                {categories?.map((cat) => (
                  <option key={cat.id} value={cat.name} className="bg-slate-900 text-ink">
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Players Interactive List */}
          {(() => {
            const filteredPlayers = players
              .filter(p => isCompetitivePlayer(p) && p.division === gestorDivision && (gestorCategoria === 'Todos' || p.categoria === gestorCategoria))
              .sort((a, b) => (a.posicion ?? 999) - (b.posicion ?? 999));

            if (filteredPlayers.length === 0) {
              return (
                <div className="text-center py-8 text-ink-muted text-xs bg-[var(--surface-2)] rounded-xl border border-[var(--border-subtle)] border-dashed">
                  No hay jugadores activos que coincidan con los filtros.
                </div>
              );
            }

            return (
              <div className="border border-[var(--border-subtle)] rounded-xl divide-y divide-[var(--border-subtle)] bg-black/10 overflow-hidden">
                <div className="hidden sm:grid sm:grid-cols-12 gap-2 p-3 bg-[var(--surface-2)] text-[10px] font-bold text-ink-muted uppercase tracking-wider font-mono">
                  <div className="col-span-2 text-center">Puesto (Intro)</div>
                  <div className="col-span-4">Nombre y Apellidos</div>
                  <div className="col-span-3">Grupo / Nivel</div>
                  <div className="col-span-3 text-right">Reordenar 1 a 1</div>
                </div>

                <div className="max-h-[480px] overflow-y-auto divide-y divide-[var(--border-subtle)]">
                  {filteredPlayers.map((p, idx) => {
                    const isSaving = gestorSavingId === p.id;
                    const canMoveUp = p.posicion != null && p.posicion > 1;
                    const sameDivPlayersCount = players.filter(pl => isCompetitivePlayer(pl) && pl.division === gestorDivision && pl.posicion != null && pl.posicion > 0).length;
                    const canMoveDown = p.posicion != null && p.posicion < sameDivPlayersCount;

                    return (
                      <div
                        key={p.id}
                        className={`grid grid-cols-1 sm:grid-cols-12 gap-3 p-3 items-center text-xs transition-colors hover:bg-white/[0.02] ${isSaving ? 'opacity-40 pointer-events-none' : ''}`}
                      >
                        {/* Position input field */}
                        <div className="col-span-1 sm:col-span-2 flex items-center gap-2 justify-center">
                          <span className="text-[10px] font-mono text-ink-faint font-bold sm:hidden">PUESTO:</span>
                          <PositionInputWrapper
                            initialValue={p.posicion || 1}
                            onSave={(newVal) => handleQuickChangePosition(p, newVal)}
                          />
                        </div>

                        {/* Player name */}
                        <div className="col-span-1 sm:col-span-4 flex items-center gap-2">
                          <div className="w-6 h-6 rounded-lg bg-ball/10 flex items-center justify-center font-bold text-ball-safe text-[10px] shrink-0">
                            {p.nombre.charAt(0)}{p.apellidos.charAt(0)}
                          </div>
                          <span className="font-semibold text-ink truncate">
                            {p.nombre} {p.apellidos}
                          </span>
                        </div>

                        {/* Category/Group Selector */}
                        <div className="col-span-1 sm:col-span-3 flex items-center gap-2">
                          <span className="text-[10px] font-mono text-ink-faint font-bold sm:hidden">GRUPO:</span>
                          <select
                            value={p.categoria}
                            onChange={(e) => handleQuickChangeCategory(p, e.target.value)}
                            className="flex-1 bg-[var(--surface-input)] border border-[var(--border-subtle)] text-ink text-[11px] py-1 px-1.5 rounded-lg focus:outline-none cursor-pointer"
                          >
                            {categories?.map((cat) => (
                              <option key={cat.id} value={cat.name}>
                                {cat.name}
                              </option>
                            ))}
                          </select>
                        </div>

                        {/* Up/Down buttons */}
                        <div className="col-span-1 sm:col-span-3 flex justify-end gap-1.5">
                          <button
                            type="button"
                            disabled={!canMoveUp}
                            onClick={() => handleQuickMoveOneStep(p, 'up')}
                            className="p-1.5 rounded-lg bg-[var(--surface-2)] border border-[var(--border-subtle)] hover:border-ball/50 disabled:opacity-20 text-ink-muted hover:text-ball-safe transition-colors cursor-pointer"
                            title="Subir un puesto"
                          >
                            <ChevronUp className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            disabled={!canMoveDown}
                            onClick={() => handleQuickMoveOneStep(p, 'down')}
                            className="p-1.5 rounded-lg bg-[var(--surface-2)] border border-[var(--border-subtle)] hover:border-ball/50 disabled:opacity-20 text-ink-muted hover:text-ball-safe transition-colors cursor-pointer"
                            title="Bajar un puesto"
                          >
                            <ChevronDown className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}
        </div>

        {/* Historial de jornadas */}
        {jornadas.length > 0 && (
          <div className="glass-card rounded-2xl border border-[var(--border-subtle)] shadow-2xl p-5 sm:p-6 text-ink">
            <h2 className="font-display text-sm font-black text-ink-muted uppercase tracking-wider mb-3">
              Historial de Jornadas Oficiales
            </h2>
            <div className="space-y-2 max-h-72 overflow-y-auto custom-scrollbar">
              {[...jornadas].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 15).map(j => (
                <div key={j.id} className="bg-[var(--surface-2)] border border-[var(--border-subtle)] rounded-xl p-3 text-[11px]">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-bold text-ink">
                      {(categories[Number(j.grupo) - 1]?.name || `Grupo ${j.grupo}`)} · {j.division}
                    </span>
                    <span className="text-ink-faint">{new Date(j.fecha).toLocaleDateString('es-ES')}</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {j.movimientos.map((m, i) => (
                      <span key={i} className={`px-2 py-0.5 rounded-full font-semibold ${m.posicionDespues < m.posicionAntes ? 'bg-emerald-500/15 text-emerald-500' : m.posicionDespues > m.posicionAntes ? 'bg-rose-500/15 text-rose-500' : 'bg-[var(--surface-1)] text-ink-muted'}`}>
                        {m.playerName}: #{m.posicionAntes}→#{m.posicionDespues}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Cierre de Jornada: Ascensos y Descensos ──────────────────────── */}
        <div className="glass-card rounded-2xl border border-amber-500/15 bg-amber-950/5 shadow-2xl p-5 sm:p-6 text-ink antialiased mt-6">
          <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3 mb-5">
            <h2 className="font-display text-xl font-black text-ink flex items-center gap-2.5">
              <History className="h-5 w-5 text-amber-400" />
              <span>Cierre de Jornada · Ascensos y Descensos</span>
            </h2>
            {seasons.length > 0 && (
              <button
                type="button"
                onClick={() => setShowSeasonHistory(s => !s)}
                className="text-[10px] font-bold uppercase tracking-wider text-ink-faint hover:text-ink-muted flex items-center gap-1.5 cursor-pointer"
              >
                <Eye className="h-3.5 w-3.5" />
                {showSeasonHistory ? 'Ocultar historial de cierres' : `Ver historial de cierres (${seasons.length})`}
              </button>
            )}
          </div>

          <p className="text-ink-muted text-[11px] leading-relaxed mb-4">
            Calcula quién asciende y quién desciende de categoría según las posiciones actuales de la escalera y la configuración de "Suben/Bajan" de cada categoría. No se aplica nada hasta que confirmes el cierre de la jornada.
          </p>

          {/* Historial de jornadas cerradas */}
          {showSeasonHistory && (
            <div className="mb-5 bg-[var(--surface-input)] border border-[var(--border-subtle)] rounded-xl max-h-64 overflow-y-auto divide-y divide-[var(--border-subtle)] custom-scrollbar">
              {seasons.map(season => (
                <div key={season.id} className="p-3 text-xs">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-bold text-ink">
                      {new Date(season.closedAt).toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' })}
                    </span>
                    <span className="text-ink-faint text-[10px]">{season.totalJugadoresAfectados} movimiento(s) · por {season.closedByName}</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {season.movimientos.map((m, i) => (
                      <span
                        key={i}
                        className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                          m.tipo === 'ascenso'
                            ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20'
                            : 'bg-rose-500/15 text-rose-400 border border-rose-500/20'
                        }`}
                      >
                        {m.playerName}: {m.fromCategoria} → {m.toCategoria}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Botón inicial: calcular preview */}
          {seasonConfirmStep === 0 && (
            <button
              type="button"
              onClick={handleCalculateSeasonPreview}
              className="flex items-center gap-2 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-400 font-black text-xs uppercase tracking-wider px-5 py-3 rounded-xl transition-all cursor-pointer"
            >
              <Eye className="h-4 w-4" />
              <span>Calcular Vista Previa</span>
            </button>
          )}

          {/* Vista previa de movimientos */}
          {seasonConfirmStep >= 1 && seasonPreview && (
            <div className="space-y-4">
              {seasonPreview.length === 0 ? (
                <div className="bg-[var(--surface-2)] border border-[var(--border-subtle)] rounded-xl p-4 text-center text-ink-muted text-xs">
                  No hay movimientos que aplicar. Revisa que las categorías tengan configurado "Suben" / "Bajan" mayor que 0.
                </div>
              ) : (
                <div className="bg-[var(--surface-input)] border border-[var(--border-subtle)] rounded-xl max-h-72 overflow-y-auto divide-y divide-[var(--border-subtle)] custom-scrollbar">
                  {seasonPreview.map((mov, i) => (
                    <div key={i} className="flex items-center justify-between p-3 text-xs">
                      <div className="flex items-center gap-2.5">
                        {mov.tipo === 'ascenso' ? (
                          <TrendingUp className="h-4 w-4 text-emerald-400 shrink-0" />
                        ) : (
                          <TrendingDown className="h-4 w-4 text-rose-400 shrink-0" />
                        )}
                        <div>
                          <span className="font-bold text-ink">{mov.playerName}</span>
                          <span className="text-ink-faint ml-2 font-mono text-[10px]">{mov.division}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 font-mono text-[11px]">
                        <span className="text-ink-muted">{mov.fromCategoria}</span>
                        <span className="text-ink-faint">→</span>
                        <span className={mov.tipo === 'ascenso' ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                          {mov.toCategoria}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Botones de acción */}
              <div className="flex flex-wrap items-center gap-2.5 pt-1">
                {seasonConfirmStep === 1 && (
                  <>
                    <button
                      type="button"
                      onClick={() => setSeasonConfirmStep(2)}
                      disabled={!seasonPreview.length}
                      className="flex items-center gap-2 bg-rose-950 hover:bg-rose-900 border border-rose-500/30 hover:border-rose-500/50 text-rose-400 disabled:opacity-30 font-black text-xs uppercase tracking-wider px-5 py-3 rounded-xl transition-all cursor-pointer"
                    >
                      <Lock className="h-4 w-4" />
                      <span>Cerrar Jornada y Aplicar Cambios</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => { setSeasonPreview(null); setSeasonConfirmStep(0); }}
                      className="text-ink-faint hover:text-ink-muted text-xs font-bold uppercase tracking-wider px-3 py-3 cursor-pointer"
                    >
                      Cancelar
                    </button>
                  </>
                )}

                {seasonConfirmStep === 2 && (
                  <div className="flex items-center gap-2 bg-rose-500/10 border border-rose-500/20 p-2.5 rounded-xl w-full">
                    <AlertTriangle className="h-4 w-4 text-rose-400 shrink-0" />
                    <span className="text-[11px] text-rose-400 font-bold flex-1">
                      ¿Confirmas? Esto moverá a {seasonPreview.length} jugador(es) de categoría. No se puede deshacer automáticamente.
                    </span>
                    <button
                      type="button"
                      onClick={handleCloseSeason}
                      disabled={seasonLoading}
                      className="bg-rose-500 hover:bg-rose-600 disabled:opacity-50 text-ink font-black text-[10px] uppercase px-3 py-1.5 rounded-lg cursor-pointer whitespace-nowrap"
                    >
                      {seasonLoading ? 'Aplicando...' : 'SÍ, CERRAR JORNADA'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setSeasonConfirmStep(1)}
                      disabled={seasonLoading}
                      className="bg-[var(--surface-2)] hover:bg-[var(--surface-2)] text-ink font-black text-[10px] uppercase px-3 py-1.5 rounded-lg cursor-pointer whitespace-nowrap"
                    >
                      CANCELAR
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
      )}

      {adminSection === 'categorias' && (
      <>
      {/* Dynamic Category Management Section */}
      <div className="glass-card rounded-2xl border border-[var(--border-subtle)] shadow-2xl p-5 sm:p-6 text-ink antialiased">
        <h2 className="font-display text-xl font-black text-ink flex items-center gap-2.5 border-b border-[var(--border-subtle)] pb-3 mb-5">
          <ListCollapse className="h-5 w-5 text-ball-safe" />
          <span>Gestionar Grupos / Niveles</span>
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Create category Form */}
          <form onSubmit={handleCreateCategory} className="space-y-4">
            <div>
              <label htmlFor="input-new-category" className="block text-[10px] font-bold text-ink-muted uppercase tracking-widest mb-1.5 font-mono">Nombre del nuevo grupo</label>
              <div className="flex gap-2">
                <input
                  id="input-new-category"
                  type="text"
                  required
                  placeholder="Ej. Grupo 4 / Cuarta"
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  className="flex-1 bg-[var(--surface-input)] hover:bg-[var(--surface-input)] focus:bg-[var(--surface-input)] border border-[var(--border-subtle)] text-ink rounded-xl py-2.5 px-3.5 text-sm focus:outline-hidden focus:border-ball/55 focus:ring-2 focus:ring-ball/10 transition-all placeholder:text-ink-faint"
                />
                <button
                  type="submit"
                  disabled={loadingCategory}
                  className="bg-ball hover:bg-ball-hover text-black font-black uppercase tracking-widest text-[11px] px-4 rounded-xl flex items-center justify-center gap-1 transition-all cursor-pointer"
                >
                  {loadingCategory ? <RefreshCw className="h-4 w-4 animate-spin text-black" /> : <Plus className="h-4 w-4 text-black font-bold" />}
                  <span>Añadir</span>
                </button>
              </div>
            </div>
            <p className="text-ink-faint text-[10px] font-sans leading-relaxed">
              Los grupos agregados se actualizarán instantáneamente y estarán disponibles para clasificar jugadores, agendar enfrentamientos y filtrar tablas.
            </p>
            <p className="text-ink-faint text-[10px] font-sans leading-relaxed bg-[var(--surface-2)] border border-[var(--border-subtle)] rounded-lg p-2.5">
              <strong className="text-ink-muted">Regla de Ascensos y Descensos (Jornadas):</strong> En cada grupo siempre subirá exactly 1 jugador y bajará 1 (por división), salvo en el grupo más alto que no subirá nadie (0) y en el grupo más bajo que no bajará nadie (0).
            </p>
          </form>

          {/* Current Category List */}
          <div>
            <span className="block text-[10px] font-bold text-ink-muted uppercase tracking-widest mb-3 font-mono">Grupos Instalados</span>
            <div className="bg-[var(--surface-input)] border border-[var(--border-subtle)] rounded-xl max-h-48 overflow-y-auto divide-y divide-[var(--border-subtle)] custom-scrollbar">
              {categories.length === 0 ? (
                <div className="py-4 text-center text-ink-faint text-xs">Cargando grupos...</div>
              ) : (
                categories.map((cat, idx) => (
                  <div key={cat.id} className="flex flex-col gap-2 p-3 hover:bg-[var(--surface-2)] transition-all">
                    <div className="flex items-center justify-between">
                      {editingCategoryId === cat.id ? (
                        <div className="flex items-center gap-1.5 flex-1 mr-2">
                          <input
                            type="text"
                            value={editingCategoryName}
                            onChange={(e) => setEditingCategoryName(e.target.value)}
                            disabled={renamingLoading}
                            className="bg-[var(--surface-input)] border border-ball text-sm text-ink rounded-lg py-1 px-2.5 w-full focus:outline-hidden"
                            autoFocus
                          />
                          <button
                            type="button"
                            onClick={() => handleRenameCategory(cat.id, cat.name, editingCategoryName)}
                            disabled={renamingLoading}
                            className="text-emerald-400 hover:text-emerald-300 p-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-lg cursor-pointer transition-all shrink-0"
                            title="Guardar nombre"
                          >
                            {renamingLoading ? <RefreshCw className="h-4 w-4 animate-spin text-black" /> : <Check className="h-4 w-4" />}
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingCategoryId(null)}
                            disabled={renamingLoading}
                            className="text-rose-400 hover:text-rose-300 p-1.5 bg-rose-500/10 border border-rose-500/20 rounded-lg cursor-pointer transition-all shrink-0"
                            title="Cancelar"
                          >
                            <XCircle className="h-4 w-4" />
                          </button>
                        </div>
                      ) : (
                        <span className="text-sm font-semibold tracking-wide text-slate-100">{cat.name}</span>
                      )}

                      {editingCategoryId !== cat.id && (
                        <div className="flex items-center gap-1.5">
                          {/* Reordering Controls */}
                          <button
                            type="button"
                            disabled={idx === 0}
                            onClick={() => handleMoveCategory(cat.id, 'up')}
                            className="text-ink-faint hover:text-ball-safe p-1.5 rounded-lg hover:bg-[var(--surface-2)] transition-all disabled:opacity-20 disabled:hover:text-ink-faint disabled:hover:bg-transparent cursor-pointer"
                            title="Subir"
                          >
                            <ChevronUp className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            disabled={idx === categories.length - 1}
                            onClick={() => handleMoveCategory(cat.id, 'down')}
                            className="text-ink-faint hover:text-ball-safe p-1.5 rounded-lg hover:bg-[var(--surface-2)] transition-all disabled:opacity-20 disabled:hover:text-ink-faint disabled:hover:bg-transparent cursor-pointer"
                            title="Bajar"
                          >
                            <ChevronDown className="h-4 w-4" />
                          </button>

                          <div className="w-px h-4 bg-[var(--surface-2)] mx-1 shadow-xs" />

                          {/* Pencil/Edit Rename Control */}
                          <button
                            type="button"
                            onClick={() => {
                              setEditingCategoryId(cat.id);
                              setEditingCategoryName(cat.name);
                            }}
                            className="text-ink-faint hover:text-ball-safe p-1.5 rounded-lg hover:bg-[var(--surface-2)] transition-all cursor-pointer"
                            title="Renombrar Grupo"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>

                          <div className="w-px h-4 bg-[var(--surface-2)] mx-1 shadow-xs" />

                          {deleteConfirmCatId === cat.id ? (
                            <div className="flex items-center gap-1 bg-rose-500/10 border border-rose-500/20 p-1.5 rounded-lg">
                              <span className="text-[9px] text-rose-400 font-bold px-1 uppercase tracking-wider">¿Borrar?</span>
                              <button
                                type="button"
                                onClick={async () => {
                                  try {
                                    await deleteDoc(doc(db, 'categories', cat.id));
                                    showToast(`¡Grupo "${cat.name}" eliminado!`);
                                    setDeleteConfirmCatId(null);
                                  } catch (err: any) {
                                    console.error("Error deleting category:", err);
                                    showError("Error al eliminar el grupo");
                                  }
                                }}
                                className="px-1.5 py-0.5 bg-rose-500 hover:bg-rose-600 text-ink text-[10px] font-mono font-bold rounded"
                              >
                                Sí
                              </button>
                              <button
                                type="button"
                                onClick={() => setDeleteConfirmCatId(null)}
                                className="px-1.5 py-0.5 bg-[var(--surface-2)] hover:bg-[var(--surface-2)] text-ink text-[10px] font-mono font-bold rounded"
                              >
                                No
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setDeleteConfirmCatId(cat.id)}
                              className="text-ink-faint hover:text-red-400 p-1.5 rounded-lg hover:bg-red-500/10 transition-all cursor-pointer"
                              title="Eliminar Grupo"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Configuración de ascensos/descensos por grupo */}
                    <div className="flex items-center gap-4 pl-0.5 text-[11px]">
                      <div className="flex items-center gap-1.5">
                        <TrendingUp className="h-3.5 w-3.5 text-emerald-400" />
                        <span className="text-ink-muted">Suben: <strong className={idx === 0 ? "text-ink-faint" : "text-emerald-400"}>{idx === 0 ? '0' : '1'}</strong></span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <TrendingDown className="h-3.5 w-3.5 text-rose-400" />
                        <span className="text-ink-muted">Bajan: <strong className={idx === categories.length - 1 ? "text-ink-faint" : "text-rose-400"}>{idx === categories.length - 1 ? '0' : '1'}</strong></span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
      </>
      )}

      {adminSection === 'jugadores' && (
      <>
      {/* Convivencia y Cortesía — Ajustes de posiciones por incidencias */}
      <div className="glass-card rounded-2xl border border-[var(--border-subtle)] shadow-2xl p-5 sm:p-6 text-ink antialiased">
        <h2 className="font-display text-xl font-black text-ink flex items-center gap-2.5 border-b border-[var(--border-subtle)] pb-3 mb-5">
          <Gavel className="h-5 w-5 text-ball-safe" />
          <span>Normas de Convivencia y Cortesía</span>
        </h2>

        <p className="text-xs text-ink-muted mb-5 leading-relaxed font-sans">
          Las faltas de puntualidad, asistencia o deportividad conllevan el descenso de puestos en la escalera. El jugador implicado desciende los puestos correspondientes, y el resto de la lista se reorganiza automáticamente para cubrir el hueco. Puedes deshacer cualquier ajuste desde el historial de incidencias.
        </p>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Formulario */}
          <form onSubmit={handleSubmitSanction} className="lg:col-span-5 space-y-4 bg-[var(--surface-input)] p-4 rounded-xl border border-[var(--border-subtle)]">
            <span className="block text-xs font-mono uppercase font-black text-rose-500 tracking-widest border-b border-[var(--border-subtle)] pb-1.5">
              Registrar Ajuste / Penalización
            </span>

            <div>
              <label className="block text-[10px] font-bold text-ink-muted uppercase tracking-widest mb-1.5 font-mono">Jugador</label>
              <select
                required
                value={sancJugadorId}
                onChange={(e) => setSancJugadorId(e.target.value)}
                className="w-full bg-[var(--surface-2)] border border-[var(--border-subtle)] text-ink text-xs py-2.5 px-3 rounded-lg cursor-pointer focus:outline-none focus:border-rose-500/50"
              >
                <option value="">-- Elige un jugador --</option>
                {players
                  .filter(p => !isCompetitivePlayer || (isCompetitivePlayer && p.posicion != null))
                  .sort((a, b) => (a.posicion ?? 999) - (b.posicion ?? 999))
                  .map(p => (
                    <option key={p.id} value={p.id} className="bg-slate-900">
                      {p.posicion ? `#${p.posicion} ` : ''}{p.nombre} {p.apellidos} ({p.division})
                    </option>
                  ))}
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-ink-muted uppercase tracking-widest mb-1.5 font-mono">Infracción</label>
              <select
                value={sancTipo}
                onChange={(e) => setSancTipo(e.target.value)}
                className="w-full bg-[var(--surface-2)] border border-[var(--border-subtle)] text-ink text-xs py-2.5 px-3 rounded-lg cursor-pointer focus:outline-none focus:border-rose-500/50"
              >
                {Object.entries(CATALOGO_SANCIONES).map(([key, val]) => (
                  <option key={key} value={key} className="bg-slate-900">
                    {val.label} ({val.articulo}{val.posiciones !== 'ultima' ? ` · -${val.posiciones} pos` : ' · última posición'})
                  </option>
                ))}
              </select>
            </div>

            {(sancTipo === 'custom' || sancTipo === 'antideportiva') && (
              <div>
                <label className="block text-[10px] font-bold text-ink-muted uppercase tracking-widest mb-1.5 font-mono">
                  Nº de posiciones a descender
                </label>
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={sancPosiciones}
                  onChange={(e) => setSancPosiciones(parseInt(e.target.value) || 1)}
                  className="w-full bg-[var(--surface-2)] border border-[var(--border-subtle)] text-ink text-xs py-2 px-3 rounded-lg font-bold font-mono"
                />
              </div>
            )}

            <div>
              <label className="block text-[10px] font-bold text-ink-muted uppercase tracking-widest mb-1.5 font-mono">Observaciones (opcional)</label>
              <textarea
                placeholder="Si se deja vacío, se guarda el nombre oficial de la infracción"
                value={sancMotivo}
                onChange={(e) => setSancMotivo(e.target.value)}
                rows={2}
                className="w-full bg-[var(--surface-2)] border border-[var(--border-subtle)] text-ink text-xs py-2 px-3 rounded-lg focus:outline-none focus:border-rose-500/50 placeholder:text-ink-faint resize-none"
              />
            </div>

            {/* Vista previa de movimientos */}
            {sancionPreview && sancionPreview.length > 0 && (
              <div className="bg-rose-500/5 border border-rose-500/20 rounded-xl p-3 space-y-1.5 text-[11px]">
                <p className="font-bold text-rose-500 uppercase tracking-wider font-mono text-[9px]">Vista previa de la escalera</p>
                {sancionPreview.map((m, i) => (
                  <div key={i} className="flex justify-between font-mono">
                    <span className="text-ink">{m.playerName}</span>
                    <span className={m.posicionDespues > m.posicionAntes ? 'text-rose-500 font-bold' : 'text-emerald-500 font-bold'}>
                      #{m.posicionAntes} → #{m.posicionDespues}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <button
              type="submit"
              disabled={loadingSanc || !sancJugadorId || !sancionPreview}
              className="w-full py-2.5 bg-rose-500 hover:bg-rose-600 disabled:opacity-40 text-white font-black text-xs uppercase tracking-wider rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer"
            >
              {loadingSanc ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Gavel className="h-3.5 w-3.5" />}
              <span>Aplicar Sanción</span>
            </button>
          </form>

          {/* Historial */}
          <div className="lg:col-span-7 space-y-3">
            <span className="block text-xs font-mono uppercase font-black text-ink-muted tracking-widest border-b border-[var(--border-subtle)] pb-1.5">
              Sanciones aplicadas ({sanctions.length})
            </span>

            {sanctions.length === 0 ? (
              <div className="bg-[var(--surface-2)] border border-[var(--border-subtle)] border-dashed rounded-xl p-8 text-center text-xs text-ink-muted italic">
                No hay sanciones registradas en esta temporada.
              </div>
            ) : (
              <div className="space-y-2 max-h-[380px] overflow-y-auto custom-scrollbar">
                {[...sanctions].sort((a, b) => new Date(b.appliedAt).getTime() - new Date(a.appliedAt).getTime()).map((sanc) => (
                  <div key={sanc.id} className="bg-[var(--surface-2)] border border-[var(--border-subtle)] rounded-xl p-3 text-xs">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-ink truncate">{sanc.playerName}</p>
                        <p className="text-ink-muted text-[10px] mt-0.5 leading-snug">{sanc.reason}</p>
                        <p className="text-ink-faint text-[9px] mt-1 font-mono">
                          {new Date(sanc.appliedAt).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}
                          {' · '}{sanc.appliedBy}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="inline-flex items-center font-bold font-mono text-rose-500 bg-rose-500/10 border border-rose-500/20 px-2 py-0.5 rounded text-[10px]">
                          {sanc.positionsPenalty != null ? `-${sanc.positionsPenalty} pos` : `-${sanc.pointsDeduction} pts`}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleDeleteSanction(sanc)}
                          className="text-ink-faint hover:text-emerald-500 p-1.5 rounded-lg hover:bg-emerald-500/10 transition-all cursor-pointer"
                          title="Anular sanción (restaura posiciones)"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                    {sanc.movimientos && sanc.movimientos.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2 pt-2 border-t border-[var(--border-subtle)]">
                        {sanc.movimientos.map((m, i) => (
                          <span key={i} className={`text-[9px] px-1.5 py-0.5 rounded font-mono font-bold ${m.posicionDespues > m.posicionAntes ? 'bg-rose-500/10 text-rose-500' : 'bg-emerald-500/10 text-emerald-500'}`}>
                            {m.playerName}: #{m.posicionAntes}→#{m.posicionDespues}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
      </>
      )}

      {adminSection === 'sistema' && (
      <>
      {/* Administrators Management Section */}
      <div className="glass-card rounded-2xl border border-[var(--border-subtle)] shadow-2xl p-5 sm:p-6 text-ink antialiased">
        <h2 className="font-display text-xl font-black text-ink flex items-center gap-2.5 border-b border-[var(--border-subtle)] pb-3 mb-5">
          <Shield className="h-5 w-5 text-ball-safe" />
          <span>Gestión de Administradores de la Escalera</span>
        </h2>
        
        <p className="text-xs text-ink-muted mb-4 leading-relaxed font-sans">
          Solo los administradores autorizados pueden ver esta sección y marcar/desmarcar privilegios de acceso para otros jugadores que ya se hayan registrado mediante su correo en la plataforma.
        </p>

        {players.filter(p => !!p.email).length === 0 ? (
          <div className="bg-[var(--surface-2)] border border-[var(--border-subtle)] border-dashed rounded-xl p-8 text-center text-xs text-ink-muted">
            No hay jugadores adicionales registrados con cuenta y correo electrónico en este momento. Cuando se registren, aparecerán aquí para otorgarles permisos de administrador.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-input)]">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[var(--border-subtle)] bg-[var(--surface-2)] text-[9px] font-mono uppercase tracking-widest text-ball-safe">
                  <th className="py-2.5 px-4 font-bold">Jugador</th>
                  <th className="py-2.5 px-4 font-bold">Email de Acceso</th>
                  <th className="py-2.5 px-4 font-bold">Rol Actual</th>
                  <th className="py-2.5 px-4 font-bold text-right">Pasar a Admin / Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)] text-xs font-sans">
                {players.filter(p => !!p.email).map((p) => {
                  const isPlayerAdmin = adminIds.includes(p.id) || p.email === 'alvaroestradacabello@gmail.com';
                  const isMainAdmin = p.email === 'alvaroestradacabello@gmail.com';
                  
                  return (
                    <tr key={p.id} className="hover:bg-[var(--surface-2)] transition-colors">
                      <td className="py-3 px-4 font-bold">{p.nombre} {p.apellidos}</td>
                      <td className="py-3 px-4 text-ink-muted font-mono">{p.email}</td>
                      <td className="py-3 px-4">
                        {isMainAdmin ? (
                          <span className="inline-flex bg-amber-500/20 text-amber-300 font-bold text-[9px] uppercase tracking-wider py-0.5 px-2 rounded-md">Director Principal</span>
                        ) : isPlayerAdmin ? (
                          <span className="inline-flex bg-emerald-500/20 text-ball-safe font-bold text-[9px] uppercase tracking-wider py-0.5 px-2 rounded-md">Administrador</span>
                        ) : (
                          <span className="inline-flex bg-[var(--surface-2)] text-ink-muted font-medium text-[9px] uppercase tracking-wider py-0.5 px-2 rounded-md font-mono">Jugador</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        {isMainAdmin ? (
                          <span className="text-[10px] text-ink-muted italic">Inmutable</span>
                        ) : (
                          <button
                            type="button"
                            onClick={async () => {
                              try {
                                const adminDocRef = doc(db, 'admins', p.id);
                                if (!isPlayerAdmin) {
                                  await setDoc(adminDocRef, {
                                    email: p.email || '',
                                    assignedAt: new Date().toISOString()
                                  });
                                } else {
                                  await deleteDoc(adminDocRef);
                                }
                              } catch (err: any) {
                                console.error("Error setting admin status:", err);
                                setErrorMessage("Error al cambiar permisos de administrador: " + err.message);
                              }
                            }}
                            className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                              isPlayerAdmin 
                                ? 'bg-rose-500/10 text-rose-400 hover:bg-rose-500/25' 
                                : 'bg-ball/10 text-ball-safe hover:bg-ball/25'
                            }`}
                          >
                            {isPlayerAdmin ? 'Revocar Admin' : 'Hacer Admin'}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Maintenance Controls */}
      {onResetTournament && (
        <div className="glass-card rounded-2xl border border-rose-500/10 hover:border-rose-500/20 bg-rose-950/10 shadow-2xl p-5 sm:p-6 text-ink antialiased">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h3 className="font-display font-black text-rose-400 text-sm uppercase tracking-wide flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-rose-400 animate-pulse" />
                <span>Zona de Peligro / Resetear Torneo</span>
              </h3>
              <p className="text-ink-muted text-[11px] leading-relaxed mt-1">
                ¿Deseas volver a la configuración original de fábrica? Esta acción eliminará permanentemente todos los jugadores, marcadores y categorías registrados actualmente, y volverá a cargar de forma limpia toda la plantilla con los 24 deportistas estrella y enfrentamientos simulados listos para puntuar.
              </p>
            </div>
            <div className="shrink-0">
              {resetConfirm ? (
                <div className="flex items-center gap-2 bg-rose-500/10 border border-rose-500/20 p-2 rounded-xl">
                  <span className="text-[10px] text-rose-400 font-bold uppercase tracking-widest px-1">¿Confirmas reiniciar todo?</span>
                  <button
                    onClick={async () => {
                      setResetLoading(true);
                      try {
                        await onResetTournament();
                        setResetConfirm(false);
                      } catch (err) {
                        console.error(err);
                      } finally {
                        setResetLoading(false);
                      }
                    }}
                    disabled={resetLoading}
                    className="bg-rose-500 hover:bg-rose-600 disabled:opacity-50 text-ink font-black text-[10px] uppercase px-3 py-1.5 rounded-lg cursor-pointer"
                  >
                    {resetLoading ? 'Iniciando...' : 'SÍ, RESETEAR'}
                  </button>
                  <button
                    onClick={() => setResetConfirm(false)}
                    className="bg-[var(--surface-2)] hover:bg-[var(--surface-2)] text-ink font-black text-[10px] uppercase px-3 py-1.5 rounded-lg cursor-pointer"
                  >
                    CANCELAR
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setResetConfirm(true)}
                  className="bg-rose-950 hover:bg-rose-900 border border-rose-500/30 hover:border-rose-500/50 text-rose-400 font-black text-xs uppercase tracking-wider px-5 py-3 rounded-xl transition-all flex items-center gap-2 cursor-pointer shadow-md"
                >
                  <RefreshCw className="h-4 w-4" />
                  <span>Restablecer Datos de Ejemplo</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Reinicio para Producción ──────────────────────────────────────── */}
      {onFactoryReset && (
        <div className="glass-card rounded-2xl border border-rose-500/30 bg-rose-950/20 shadow-2xl p-5 sm:p-6 text-ink antialiased">
          <h3 className="font-display font-black text-rose-400 text-sm uppercase tracking-wide flex items-center gap-2 mb-1">
            <Flame className="h-4 w-4 text-rose-400 animate-pulse" />
            <span>Reinicio para Producción</span>
          </h3>
          <p className="text-ink-muted text-[11px] leading-relaxed mb-4 max-w-2xl">
            Borra todos los datos de pruebas (jugadores, partidos, retos, sanciones e historial de temporadas) de golpe, justo antes de poner la web en marcha de verdad.
            <strong className="text-ink"> Se conservan los administradores y las categorías configuradas.</strong> Esta acción no se puede deshacer.
          </p>

          {factoryResetStep === 0 ? (
            <button
              onClick={() => setFactoryResetStep(1)}
              className="bg-rose-600 hover:bg-rose-500 text-ink font-black text-xs uppercase tracking-wider px-5 py-3 rounded-xl transition-all flex items-center gap-2 cursor-pointer shadow-md shadow-rose-950/40"
            >
              <Flame className="h-4 w-4" />
              <span>Reiniciar Web para Producción</span>
            </button>
          ) : (
            <div className="bg-[var(--surface-input)] border border-rose-500/30 rounded-xl p-4 space-y-3.5">

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-[11px]">
                <div className="bg-rose-500/10 border border-rose-500/20 rounded-lg p-2.5">
                  <span className="block text-rose-400 font-black text-lg">{factoryResetCounts.playersToDelete}</span>
                  <span className="text-ink-muted">Jugadores a borrar</span>
                </div>
                <div className="bg-rose-500/10 border border-rose-500/20 rounded-lg p-2.5">
                  <span className="block text-rose-400 font-black text-lg">{factoryResetCounts.matches}</span>
                  <span className="text-ink-muted">Partidos a borrar</span>
                </div>
                <div className="bg-rose-500/10 border border-rose-500/20 rounded-lg p-2.5">
                  <span className="block text-rose-400 font-black text-lg">{factoryResetCounts.challenges}</span>
                  <span className="text-ink-muted">Retos a borrar</span>
                </div>
                <div className="bg-rose-500/10 border border-rose-500/20 rounded-lg p-2.5">
                  <span className="block text-rose-400 font-black text-lg">{factoryResetCounts.sanctions}</span>
                  <span className="text-ink-muted">Sanciones a borrar</span>
                </div>
                <div className="bg-rose-500/10 border border-rose-500/20 rounded-lg p-2.5">
                  <span className="block text-rose-400 font-black text-lg">{factoryResetCounts.seasons}</span>
                  <span className="text-ink-muted">Temporadas a borrar</span>
                </div>
                <div className="bg-rose-500/10 border border-rose-500/20 rounded-lg p-2.5">
                  <span className="block text-rose-400 font-black text-lg">{factoryResetCounts.jornadas}</span>
                  <span className="text-ink-muted">Jornadas a borrar</span>
                </div>
                <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-2.5">
                  <span className="block text-emerald-400 font-black text-lg">{factoryResetCounts.playersToKeep}</span>
                  <span className="text-ink-muted">Admin(s) que se conservan</span>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-rose-400 uppercase tracking-widest mb-1.5">
                  Para confirmar, escribe exactamente: <span className="font-mono text-ink">{FACTORY_RESET_PHRASE}</span>
                </label>
                <input
                  type="text"
                  value={factoryResetText}
                  onChange={(e) => setFactoryResetText(e.target.value)}
                  placeholder={FACTORY_RESET_PHRASE}
                  className="w-full bg-[var(--surface-input)] border border-rose-500/30 text-ink rounded-xl py-2.5 px-3.5 text-sm font-mono focus:outline-none focus:border-rose-500 transition-all"
                  autoFocus
                />
              </div>

              <div className="flex gap-2">
                <button
                  onClick={handleConfirmFactoryReset}
                  disabled={factoryResetLoading || factoryResetText.trim().toUpperCase() !== FACTORY_RESET_PHRASE}
                  className="flex-1 flex items-center justify-center gap-2 bg-rose-600 hover:bg-rose-500 disabled:opacity-30 disabled:cursor-not-allowed text-ink font-black text-xs uppercase tracking-wider py-3 rounded-xl transition-all cursor-pointer"
                >
                  {factoryResetLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Flame className="h-4 w-4" />}
                  <span>Borrar Todo y Reiniciar</span>
                </button>
                <button
                  onClick={() => { setFactoryResetStep(0); setFactoryResetText(''); }}
                  disabled={factoryResetLoading}
                  className="bg-[var(--surface-2)] hover:bg-[var(--surface-2)] text-ink font-black text-xs uppercase px-4 py-3 rounded-xl cursor-pointer disabled:opacity-50"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>
      )}
      </>
      )}

    </div>
  );
}

function PositionInputWrapper({ initialValue, onSave }: { initialValue: number; onSave: (val: number) => void }) {
  const [val, setVal] = React.useState(initialValue);

  React.useEffect(() => {
    setVal(initialValue);
  }, [initialValue]);

  const handleBlurOrEnter = () => {
    if (val !== initialValue && val > 0) {
      onSave(val);
    }
  };

  return (
    <input
      type="number"
      min={1}
      value={val}
      onChange={(e) => setVal(parseInt(e.target.value) || 0)}
      onBlur={handleBlurOrEnter}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          handleBlurOrEnter();
          e.currentTarget.blur();
        }
      }}
      className="w-16 bg-[var(--surface-input)] border border-ball/30 text-ball-safe font-mono font-bold text-center py-1 px-1.5 rounded-lg focus:outline-none focus:border-ball"
      title="Pulsa Enter o sal del campo para guardar"
    />
  );
}