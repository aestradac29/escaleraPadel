import React from 'react';
import { db, auth, handleFirestoreError, OperationType, dbName, isProdDb } from './firebase';
import { collection, onSnapshot, query, deleteDoc, doc, writeBatch, setDoc, deleteField } from 'firebase/firestore';
import { onAuthStateChanged, User, signOut } from 'firebase/auth';
import { Player, Match, Category, Sanction, Season, Challenge, JornadaOficial } from './types';
import Navbar from './components/Navbar';
import Ranking from './components/Ranking';
import Partidos from './components/Partidos';
import AdminPanel from './components/AdminPanel';
import InfoPanel from './components/InfoPanel';
import AuthModal from './components/AuthModal';
import OnboardingForm from './components/OnboardingForm';
import ProfileModal from './components/ProfileModal';
import EditPlayerModal from './components/EditPlayerModal';
import ChallengeModal from './components/ChallengeModal';
import RetosPanel from './components/RetosPanel';
import { Trophy, Calendar, Shield, ListCollapse, Users, Sparkles, Heart, BookOpen, AlertCircle, Check, Sword } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export default function App() {
  const [players, setPlayers] = React.useState<Player[]>([]);
  const [matches, setMatches] = React.useState<Match[]>([]);
  const [categories, setCategories] = React.useState<Category[]>([]);
  const [sanctions, setSanctions] = React.useState<Sanction[]>([]);
  const [seasons, setSeasons] = React.useState<Season[]>([]);
  const [challenges, setChallenges] = React.useState<Challenge[]>([]);
  const [jornadas, setJornadas] = React.useState<JornadaOficial[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [errorStatus, setErrorStatus] = React.useState<string | null>(null);

  // Authentication & Profile states
  const [currentUser, setCurrentUser] = React.useState<User | null>(null);
  const [adminIds, setAdminIds] = React.useState<string[]>([]);
  const [isProfileModalOpen, setIsProfileModalOpen] = React.useState(false);

  // Layout navigation states
  const [activeTab, setActiveTab] = React.useState<'ranking' | 'partidos' | 'retos' | 'admin' | 'info'>('ranking');

  // ── Tema claro/oscuro, con memoria entre sesiones ─────────────────────────
  const [theme, setTheme] = React.useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('padel_theme');
    return saved === 'light' || saved === 'dark' ? saved : 'dark';
  });

  React.useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('padel_theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme(t => (t === 'dark' ? 'light' : 'dark'));
  const [isAuthModalOpen, setIsAuthModalOpen] = React.useState(false);
  const [isAdminMode, setIsAdminMode] = React.useState<boolean>(false);
  const [editingPlayer, setEditingPlayer] = React.useState<Player | null>(null);
  const [isEditPlayerModalOpen, setIsEditPlayerModalOpen] = React.useState(false);
  const [challengingPlayer, setChallengingPlayer] = React.useState<Player | null>(null);
  const [isChallengeModalOpen, setIsChallengeModalOpen] = React.useState(false);
  const hasCheckedInitialCategories = React.useRef(false);

  // Auto-resolve active profile matching logged-in user email or uid
  const myProfile = React.useMemo(() => {
    if (!currentUser) return null;
    return players.find(p => p.id === currentUser.uid || (p.email && p.email.toLowerCase() === currentUser.email?.toLowerCase()));
  }, [currentUser, players]);

  // 1. Subscribe to real-time collections using firestore onSnapshot
  React.useEffect(() => {
    setLoading(true);
    
    // Subscribe to Players list
    const qPlayers = query(collection(db, 'players'));
    const unsubPlayers = onSnapshot(qPlayers, (snapshot) => {
      const playersList: Player[] = [];
      snapshot.forEach((doc) => {
        playersList.push({ id: doc.id, ...doc.data() } as Player);
      });
      setPlayers(playersList);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'players');
      setLoading(false);
    });

    // Subscribe to Matches history list
    const qMatches = query(collection(db, 'matches'));
    const unsubMatches = onSnapshot(qMatches, (snapshot) => {
      const matchesList: Match[] = [];
      snapshot.forEach((doc) => {
        matchesList.push({ id: doc.id, ...doc.data() } as Match);
      });
      setMatches(matchesList);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'matches');
    });

    // Subscribe to Categories list
    const qCategories = query(collection(db, 'categories'));
    const unsubCategories = onSnapshot(qCategories, (snapshot) => {
      const categoriesList: Category[] = [];
      snapshot.forEach((doc) => {
        categoriesList.push({ id: doc.id, ...doc.data() } as Category);
      });
      
      if (categoriesList.length === 0 && !hasCheckedInitialCategories.current) {
        hasCheckedInitialCategories.current = true;
        // Automatically write default categories if none exist
        const defaults = ['Primera', 'Segunda', 'Tercera', 'Cuarta'];
        const batch = writeBatch(db);
        defaults.forEach((name, index) => {
          const catRef = doc(collection(db, 'categories'));
          batch.set(catRef, { id: catRef.id, name, order: index, createdAt: new Date().toISOString() });
        });
        batch.commit()
          .then(() => console.log("Auto-seeded initial categories with order"))
          .catch(err => console.error("Auto seeding default categories failed", err));
      } else {
        hasCheckedInitialCategories.current = true;
        // Sort by order field, fallback to alphabetical name comparison
        categoriesList.sort((a, b) => {
          const orderA = a.order !== undefined ? a.order : 999;
          const orderB = b.order !== undefined ? b.order : 999;
          if (orderA !== orderB) {
            return orderA - orderB;
          }
          return a.name.localeCompare(b.name);
        });
        setCategories(categoriesList);
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'categories');
    });

    // Subscribe to Sanctions list
    const qSanctions = query(collection(db, 'sanctions'));
    const unsubSanctions = onSnapshot(qSanctions, (snapshot) => {
      const sanctionsList: Sanction[] = [];
      snapshot.forEach((doc) => {
        sanctionsList.push({ id: doc.id, ...doc.data() } as Sanction);
      });
      // Integrate any local sanctions with the backend ones so the UI is seamless
      const localSancsRaw = localStorage.getItem('padel_sanctions_local') || '[]';
      const localSancs: Sanction[] = JSON.parse(localSancsRaw);
      setSanctions([...sanctionsList, ...localSancs]);
    }, (error) => {
      if (error.message?.includes('permission') || error.message?.includes('insufficient') || (error as any).code === 'permission-denied') {
        console.warn("Firestore 'sanctions' access restricted by security rules. Gracefully switching to dynamic LocalStorage fallback.");
        const localSancsRaw = localStorage.getItem('padel_sanctions_local') || '[]';
        const localSancs: Sanction[] = JSON.parse(localSancsRaw);
        setSanctions(localSancs);
      } else {
        handleFirestoreError(error, OperationType.GET, 'sanctions');
      }
    });

    // Listener for direct LocalStorage updates from AdminPanel
    const handleLocalUpdate = () => {
      const localSancsRaw = localStorage.getItem('padel_sanctions_local') || '[]';
      const localSancs: Sanction[] = JSON.parse(localSancsRaw);
      setSanctions(prev => {
        const firestoreSancs = prev.filter(s => !s.id.startsWith('local_'));
        return [...firestoreSancs, ...localSancs];
      });
    };
    window.addEventListener('local-sanctions-updated', handleLocalUpdate);

    // Subscribe to Seasons history (cierres de temporada / ascensos-descensos)
    const qSeasons = query(collection(db, 'seasons'));
    const unsubSeasons = onSnapshot(qSeasons, (snapshot) => {
      const seasonsList: Season[] = [];
      snapshot.forEach((doc) => {
        seasonsList.push({ id: doc.id, ...doc.data() } as Season);
      });
      seasonsList.sort((a, b) => new Date(b.closedAt).getTime() - new Date(a.closedAt).getTime());
      setSeasons(seasonsList);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'seasons');
    });

    // Subscribe to Challenges (retos)
    const qChallenges = query(collection(db, 'challenges'));
    const unsubChallenges = onSnapshot(qChallenges, (snapshot) => {
      const challengesList: Challenge[] = [];
      snapshot.forEach((doc) => {
        challengesList.push({ id: doc.id, ...doc.data() } as Challenge);
      });
      setChallenges(challengesList);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'challenges');
    });

    // Subscribe to Jornadas Oficiales (historial de movimientos de la escalera)
    const qJornadas = query(collection(db, 'jornadas'));
    const unsubJornadas = onSnapshot(qJornadas, (snapshot) => {
      const jornadasList: JornadaOficial[] = [];
      snapshot.forEach((doc) => {
        jornadasList.push({ id: doc.id, ...doc.data() } as JornadaOficial);
      });
      setJornadas(jornadasList);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'jornadas');
    });

    // Listen to Firebase Authenticated User
    const unsubAuth = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
    });

    return () => {
      unsubPlayers();
      unsubMatches();
      unsubCategories();
      unsubSanctions();
      unsubSeasons();
      unsubChallenges();
      unsubJornadas();
      unsubAuth();
      window.removeEventListener('local-sanctions-updated', handleLocalUpdate);
    };
  }, []);

  // 1b. Subscribe to Admins list conditionally when logged in
  React.useEffect(() => {
    if (!currentUser) {
      setAdminIds([]);
      return;
    }

    const qAdmins = query(collection(db, 'admins'));
    const unsubAdmins = onSnapshot(qAdmins, (snapshot) => {
      const adminIdsList: string[] = [];
      snapshot.forEach((doc) => {
        adminIdsList.push(doc.id);
      });
      setAdminIds(adminIdsList);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'admins');
    });

    return () => {
      unsubAdmins();
    };
  }, [currentUser]);

  // 1c. Compute user admin mode reactively in real-time
  React.useEffect(() => {
    if (!currentUser) {
      setIsAdminMode(false);
      return;
    }
    const isUserAdmin = currentUser.email === 'alvaroestradacabello@gmail.com' || adminIds.includes(currentUser.uid);
    setIsAdminMode(isUserAdmin);
  }, [currentUser, adminIds]);

  // Redirect to Info/Reglas when just registered, and handle post-logout / unauthorized tab redirects
  React.useEffect(() => {
    if (myProfile && localStorage.getItem('just_registered_rules') === 'true') {
      setActiveTab('info');
      localStorage.removeItem('just_registered_rules');
    }

    if (!currentUser) {
      if (activeTab === 'retos' || activeTab === 'admin') {
        setActiveTab('ranking');
      }
    } else if (!isAdminMode && activeTab === 'admin') {
      setActiveTab('ranking');
    }
  }, [myProfile, currentUser, isAdminMode, activeTab]);

  // 2. Action to delete a Match
  const handleDeleteMatch = async (id: string) => {
    try {
      const matchToDelete = matches.find(m => m.id === id);
      if (matchToDelete && (matchToDelete.winner === 'A' || matchToDelete.winner === 'B')) {
        const batch = writeBatch(db);
        const oldPointsChange = matchToDelete.pointsChange || 0;
        
        const playerA1 = players.find(p => p.id === matchToDelete.playerA1Id);
        const playerB1 = players.find(p => p.id === matchToDelete.playerB1Id);
        const playerA2 = matchToDelete.playerA2Id ? players.find(p => p.id === matchToDelete.playerA2Id) : null;
        const playerB2 = matchToDelete.playerB2Id ? players.find(p => p.id === matchToDelete.playerB2Id) : null;

        const ptsA1ToSub = matchToDelete.pointsA1 !== undefined ? (matchToDelete.pointsA1 || 0) : (matchToDelete.winner === 'A' ? oldPointsChange : -oldPointsChange);
        const ptsA2ToSub = matchToDelete.pointsA2 !== undefined ? (matchToDelete.pointsA2 || 0) : (playerA2 ? (matchToDelete.winner === 'A' ? oldPointsChange : -oldPointsChange) : 0);
        const ptsB1ToSub = matchToDelete.pointsB1 !== undefined ? (matchToDelete.pointsB1 || 0) : (matchToDelete.winner === 'B' ? oldPointsChange : -oldPointsChange);
        const ptsB2ToSub = matchToDelete.pointsB2 !== undefined ? (matchToDelete.pointsB2 || 0) : (playerB2 ? (matchToDelete.winner === 'B' ? oldPointsChange : -oldPointsChange) : 0);

        if (playerA1) {
          const pA1Ref = doc(db, 'players', playerA1.id);
          const newPoints = Math.max(0, playerA1.puntos - ptsA1ToSub);
          batch.update(pA1Ref, { puntos: newPoints, updatedAt: new Date().toISOString() });
        }
        if (playerB1) {
          const pB1Ref = doc(db, 'players', playerB1.id);
          const newPoints = Math.max(0, playerB1.puntos - ptsB1ToSub);
          batch.update(pB1Ref, { puntos: newPoints, updatedAt: new Date().toISOString() });
        }
        if (playerA2) {
          const pA2Ref = doc(db, 'players', playerA2.id);
          const newPoints = Math.max(0, playerA2.puntos - ptsA2ToSub);
          batch.update(pA2Ref, { puntos: newPoints, updatedAt: new Date().toISOString() });
        }
        if (playerB2) {
          const pB2Ref = doc(db, 'players', playerB2.id);
          const newPoints = Math.max(0, playerB2.puntos - ptsB2ToSub);
          batch.update(pB2Ref, { puntos: newPoints, updatedAt: new Date().toISOString() });
        }
        
        batch.delete(doc(db, 'matches', id));
        await batch.commit();
      } else {
        await deleteDoc(doc(db, 'matches', id));
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `matches/${id}`);
    }
  };

  // Action to restart a played match (setting it back to pending)
  const handleRestartMatch = async (id: string) => {
    try {
      const matchToRestart = matches.find(m => m.id === id);
      if (matchToRestart && (matchToRestart.winner === 'A' || matchToRestart.winner === 'B')) {
        const batch = writeBatch(db);
        const oldPointsChange = matchToRestart.pointsChange || 0;
        
        const playerA1 = players.find(p => p.id === matchToRestart.playerA1Id);
        const playerB1 = players.find(p => p.id === matchToRestart.playerB1Id);
        const playerA2 = matchToRestart.playerA2Id ? players.find(p => p.id === matchToRestart.playerA2Id) : null;
        const playerB2 = matchToRestart.playerB2Id ? players.find(p => p.id === matchToRestart.playerB2Id) : null;

        const ptsA1ToSub = matchToRestart.pointsA1 !== undefined ? (matchToRestart.pointsA1 || 0) : (matchToRestart.winner === 'A' ? oldPointsChange : -oldPointsChange);
        const ptsA2ToSub = matchToRestart.pointsA2 !== undefined ? (matchToRestart.pointsA2 || 0) : (playerA2 ? (matchToRestart.winner === 'A' ? oldPointsChange : -oldPointsChange) : 0);
        const ptsB1ToSub = matchToRestart.pointsB1 !== undefined ? (matchToRestart.pointsB1 || 0) : (matchToRestart.winner === 'B' ? oldPointsChange : -oldPointsChange);
        const ptsB2ToSub = matchToRestart.pointsB2 !== undefined ? (matchToRestart.pointsB2 || 0) : (playerB2 ? (matchToRestart.winner === 'B' ? oldPointsChange : -oldPointsChange) : 0);

        if (playerA1) {
          const pA1Ref = doc(db, 'players', playerA1.id);
          const newPoints = Math.max(0, playerA1.puntos - ptsA1ToSub);
          batch.update(pA1Ref, { puntos: newPoints, updatedAt: new Date().toISOString() });
        }
        if (playerB1) {
          const pB1Ref = doc(db, 'players', playerB1.id);
          const newPoints = Math.max(0, playerB1.puntos - ptsB1ToSub);
          batch.update(pB1Ref, { puntos: newPoints, updatedAt: new Date().toISOString() });
        }
        if (playerA2) {
          const pA2Ref = doc(db, 'players', playerA2.id);
          const newPoints = Math.max(0, playerA2.puntos - ptsA2ToSub);
          batch.update(pA2Ref, { puntos: newPoints, updatedAt: new Date().toISOString() });
        }
        if (playerB2) {
          const pB2Ref = doc(db, 'players', playerB2.id);
          const newPoints = Math.max(0, playerB2.puntos - ptsB2ToSub);
          batch.update(pB2Ref, { puntos: newPoints, updatedAt: new Date().toISOString() });
        }
        
        // Remove scores, winner and pointsChange to set it back to "Pending"
        const matchRef = doc(db, 'matches', id);
        batch.update(matchRef, {
          set1A: deleteField(),
          set1B: deleteField(),
          set2A: deleteField(),
          set2B: deleteField(),
          set3A: deleteField(),
          set3B: deleteField(),
          winner: 'playing',
          pointsChange: deleteField(),
          pointsA1: deleteField(),
          pointsA2: deleteField(),
          pointsB1: deleteField(),
          pointsB2: deleteField(),
          posA1: deleteField(),
          posA2: deleteField(),
          posB1: deleteField(),
          posB2: deleteField(),
          isReto: deleteField(),
          playedAt: deleteField(),
          updatedAt: new Date().toISOString()
        });
        
        await batch.commit();
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `matches/${id}/restart`);
    }
  };

  // 3. Action to delete a Player
  const handleDeletePlayer = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'players', id));
      if (editingPlayer?.id === id) {
        setEditingPlayer(null);
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `players/${id}`);
    }
  };

  // 4b. Reset entire tournament database & clean install default seeds
  const handleResetTournament = async () => {
    setLoading(true);
    try {
      const batchDelete = writeBatch(db);
      // Delete players
      players.forEach(p => {
        batchDelete.delete(doc(db, 'players', p.id));
      });
      // Delete matches
      matches.forEach(m => {
        batchDelete.delete(doc(db, 'matches', m.id));
      });
      // Delete categories
      categories.forEach(c => {
        batchDelete.delete(doc(db, 'categories', c.id));
      });
      await batchDelete.commit();

      // Seed default categories with explicit indexes
      const defaults = ['Primera', 'Segunda', 'Tercera', 'Cuarta'];
      const catBatch = writeBatch(db);
      defaults.forEach((name, index) => {
        const catRef = doc(collection(db, 'categories'));
        catBatch.set(catRef, { id: catRef.id, name, order: index, createdAt: new Date().toISOString() });
      });
      await catBatch.commit();

      // Now load seed players and matches!
      await handleSeedMockData();
    } catch (error) {
      console.error("Resetting tournament failed:", error);
      setLoading(false);
    }
  };

  // 4c. Reinicio para producción: borra TODOS los datos generados (jugadores,
  // partidos, retos, sanciones, historial de temporadas) PERO conserva:
  //   - Las fichas de jugador de los administradores (no se borran)
  //   - La colección 'admins' (no se toca)
  //   - Las categorías configuradas (estructura de la competición)
  // Pensado para usarse una sola vez, justo antes de poner la web en producción,
  // para limpiar todos los datos de pruebas sin perder la configuración de admins.
  const handleFactoryReset = async () => {
    try {
      const isProtectedAdmin = (p: Player) =>
        p.email === 'alvaroestradacabello@gmail.com' || adminIds.includes(p.id);

      const playersToDelete = players.filter(p => !isProtectedAdmin(p));

      // writeBatch tiene un límite de 500 operaciones; se reparte en trozos
      // por seguridad aunque en la práctica nunca debería acercarse a eso.
      const allDeletes: { collection: string; id: string }[] = [
        ...playersToDelete.map(p => ({ collection: 'players', id: p.id })),
        ...matches.map(m => ({ collection: 'matches', id: m.id })),
        ...challenges.map(c => ({ collection: 'challenges', id: c.id })),
        ...sanctions.filter(s => !s.id.startsWith('local_')).map(s => ({ collection: 'sanctions', id: s.id })),
        ...seasons.map(s => ({ collection: 'seasons', id: s.id })),
        ...jornadas.map(j => ({ collection: 'jornadas', id: j.id })),
      ];

      const chunkSize = 450;
      for (let i = 0; i < allDeletes.length; i += chunkSize) {
        const chunk = allDeletes.slice(i, i + chunkSize);
        const batchDelete = writeBatch(db);
        chunk.forEach(item => batchDelete.delete(doc(db, item.collection, item.id)));
        await batchDelete.commit();
      }

      // Limpiar también las sanciones locales (fallback de localStorage)
      localStorage.removeItem('padel_sanctions_local');
      window.dispatchEvent(new Event('local-sanctions-updated'));

      setEditingPlayer(null);
    } catch (error) {
      console.error("Factory reset failed:", error);
      throw error;
    }
  };

  // 4. Seeding utility to pre-fill database with high fidelity initial data
  const handleSeedMockData = async () => {
    setLoading(true);
    try {
      const samplePlayers: Omit<Player, 'id'>[] = [
        // Primera Masculina (4 players) - Indices: 0, 1, 2, 3
        { nombre: 'Carlos', apellidos: 'Alcaraz', categoria: 'Primera', division: 'Masculina', puntos: 1000 },
        { nombre: 'Juan', apellidos: 'Lebrón', categoria: 'Primera', division: 'Masculina', puntos: 1000 },
        { nombre: 'Alejandro', apellidos: 'Galán', categoria: 'Primera', division: 'Masculina', puntos: 1000 },
        { nombre: 'Fernando', apellidos: 'Belasteguín', categoria: 'Primera', division: 'Masculina', puntos: 1000 },

        // Primera Femenina (4 players) - Indices: 4, 5, 6, 7
        { nombre: 'Alejandra', apellidos: 'Salazar', categoria: 'Primera', division: 'Femenina', puntos: 1000 },
        { nombre: 'Paula', apellidos: 'Josemaría', categoria: 'Primera', division: 'Femenina', puntos: 1000 },
        { nombre: 'Ariana', apellidos: 'Sánchez', categoria: 'Primera', division: 'Femenina', puntos: 1000 },
        { nombre: 'Marta', apellidos: 'Ortega', categoria: 'Primera', division: 'Femenina', puntos: 1000 },

        // Segunda Masculina (4 players) - Indices: 8, 9, 10, 11
        { nombre: 'Paquito', apellidos: 'Navarro', categoria: 'Segunda', division: 'Masculina', puntos: 1000 },
        { nombre: 'Sanyo', apellidos: 'Gutiérrez', categoria: 'Segunda', division: 'Masculina', puntos: 1000 },
        { nombre: 'Franco', apellidos: 'Stupaczuk', categoria: 'Segunda', division: 'Masculina', puntos: 1000 },
        { nombre: 'Martín', apellidos: 'Di Nenno', categoria: 'Segunda', division: 'Masculina', puntos: 1000 },

        // Segunda Femenina (4 players) - Indices: 12, 13, 14, 15
        { nombre: 'Beatriz', apellidos: 'González', categoria: 'Segunda', division: 'Femenina', puntos: 1000 },
        { nombre: 'Gemma', apellidos: 'Triay', categoria: 'Segunda', division: 'Femenina', puntos: 1000 },
        { nombre: 'Delfina', apellidos: 'Brea', categoria: 'Segunda', division: 'Femenina', puntos: 1000 },
        { nombre: 'Claudia', apellidos: 'Jensen', categoria: 'Segunda', division: 'Femenina', puntos: 1000 },

        // Tercera Masculina (4 players) - Indices: 16, 17, 18, 19
        { nombre: 'Miguel', apellidos: 'Yanguas', categoria: 'Tercera', division: 'Masculina', puntos: 1000 },
        { nombre: 'Jon', apellidos: 'Sanz', categoria: 'Tercera', division: 'Masculina', puntos: 1000 },
        { nombre: 'Jerónimo', apellidos: 'González', categoria: 'Tercera', division: 'Masculina', puntos: 1000 },
        { nombre: 'Francisco', apellidos: 'Gil', categoria: 'Tercera', division: 'Masculina', puntos: 1000 },

        // Tercera Femenina (4 players) - Indices: 20, 21, 22, 23
        { nombre: 'Virginia', apellidos: 'Riera', categoria: 'Tercera', division: 'Femenina', puntos: 1000 },
        { nombre: 'Tamara', apellidos: 'Icardo', categoria: 'Tercera', division: 'Femenina', puntos: 1000 },
        { nombre: 'Jessica', apellidos: 'Castelló', categoria: 'Tercera', division: 'Femenina', puntos: 1000 },
        { nombre: 'Aranza', apellidos: 'Osoro', categoria: 'Tercera', division: 'Femenina', puntos: 1000 }
      ];

      const batch = writeBatch(db);

      // Create Players
      const createdPlayers: Player[] = [];
      samplePlayers.forEach((p) => {
        const pRef = doc(collection(db, 'players'));
        batch.set(pRef, {
          ...p,
          id: pRef.id,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
        createdPlayers.push({ id: pRef.id, ...p });
      });

      // Commit players database batch
      await batch.commit();

      // Create 4 pre-configured matches as 2vs2 (doubles) across levels
      const batchMatches = writeBatch(db);
      const now = new Date();
      
      const date1 = new Date(now);
      date1.setDate(date1.getDate() - 4);
      date1.setHours(18, 0, 0, 0);

      const date2 = new Date(now);
      date2.setDate(date2.getDate() - 2);
      date2.setHours(19, 30, 0, 0);

      const date3 = new Date(now);
      // Scheduled 1 hour ago so it shows as En Juego (In progress)
      date3.setHours(date3.getHours() - 1);

      const date4 = new Date(now);
      date4.setDate(date4.getDate() - 3);
      date4.setHours(20, 0, 0, 0);
      
      // Match 1: Primera Masculina (Played)
      const match1Ref = doc(collection(db, 'matches'));
      batchMatches.set(match1Ref, {
        id: match1Ref.id,
        type: '2vs2',
        categoria: 'Primera',
        division: 'Masculina',
        playerA1Id: createdPlayers[0].id,
        playerA1Name: `${createdPlayers[0].nombre} ${createdPlayers[0].apellidos}`,
        playerA2Id: createdPlayers[2].id,
        playerA2Name: `${createdPlayers[2].nombre} ${createdPlayers[2].apellidos}`,
        playerB1Id: createdPlayers[1].id,
        playerB1Name: `${createdPlayers[1].nombre} ${createdPlayers[1].apellidos}`,
        playerB2Id: createdPlayers[3].id,
        playerB2Name: `${createdPlayers[3].nombre} ${createdPlayers[3].apellidos}`,
        set1A: 6,
        set1B: 4,
        set2A: 7,
        set2B: 5,
        set3A: null,
        set3B: null,
        winner: 'A',
        pointsChange: 35,
        playedAt: new Date().toISOString(),
        scheduledAt: date1.toISOString(),
        createdAt: new Date().toISOString(),
      });

      // Match 2: Primera Femenina (Played)
      const match2Ref = doc(collection(db, 'matches'));
      batchMatches.set(match2Ref, {
        id: match2Ref.id,
        type: '2vs2',
        categoria: 'Primera',
        division: 'Femenina',
        playerA1Id: createdPlayers[4].id,
        playerA1Name: `${createdPlayers[4].nombre} ${createdPlayers[4].apellidos}`,
        playerA2Id: createdPlayers[5].id,
        playerA2Name: `${createdPlayers[5].nombre} ${createdPlayers[5].apellidos}`,
        playerB1Id: createdPlayers[6].id,
        playerB1Name: `${createdPlayers[6].nombre} ${createdPlayers[6].apellidos}`,
        playerB2Id: createdPlayers[7].id,
        playerB2Name: `${createdPlayers[7].nombre} ${createdPlayers[7].apellidos}`,
        set1A: 3,
        set1B: 6,
        set2A: 6,
        set2B: 4,
        set3A: 4,
        set3B: 6,
        winner: 'B',
        pointsChange: 28,
        playedAt: new Date().toISOString(),
        scheduledAt: date2.toISOString(),
        createdAt: new Date().toISOString(),
      });

      // Match 3: Segunda Masculina (Playing / Scheduled)
      const match3Ref = doc(collection(db, 'matches'));
      batchMatches.set(match3Ref, {
        id: match3Ref.id,
        type: '2vs2',
        categoria: 'Segunda',
        division: 'Masculina',
        playerA1Id: createdPlayers[8].id,
        playerA1Name: `${createdPlayers[8].nombre} ${createdPlayers[8].apellidos}`,
        playerA2Id: createdPlayers[9].id,
        playerA2Name: `${createdPlayers[9].nombre} ${createdPlayers[9].apellidos}`,
        playerB1Id: createdPlayers[10].id,
        playerB1Name: `${createdPlayers[10].nombre} ${createdPlayers[10].apellidos}`,
        playerB2Id: createdPlayers[11].id,
        playerB2Name: `${createdPlayers[11].nombre} ${createdPlayers[11].apellidos}`,
        set1A: 0,
        set1B: 0,
        set2A: 0,
        set2B: 0,
        set3A: null,
        set3B: null,
        winner: 'playing',
        pointsChange: 0,
        playedAt: null,
        scheduledAt: date3.toISOString(),
        createdAt: new Date().toISOString(),
      });

      // Match 4: Segunda Femenina (Played)
      const match4Ref = doc(collection(db, 'matches'));
      batchMatches.set(match4Ref, {
        id: match4Ref.id,
        type: '2vs2',
        categoria: 'Segunda',
        division: 'Femenina',
        playerA1Id: createdPlayers[12].id,
        playerA1Name: `${createdPlayers[12].nombre} ${createdPlayers[12].apellidos}`,
        playerA2Id: createdPlayers[13].id,
        playerA2Name: `${createdPlayers[13].nombre} ${createdPlayers[13].apellidos}`,
        playerB1Id: createdPlayers[14].id,
        playerB1Name: `${createdPlayers[14].nombre} ${createdPlayers[14].apellidos}`,
        playerB2Id: createdPlayers[15].id,
        playerB2Name: `${createdPlayers[15].nombre} ${createdPlayers[15].apellidos}`,
        set1A: 6,
        set1B: 4,
        set2A: 6,
        set2B: 3,
        set3A: null,
        set3B: null,
        winner: 'A',
        pointsChange: 30,
        playedAt: new Date().toISOString(),
        scheduledAt: date4.toISOString(),
        createdAt: new Date().toISOString(),
      });

      await batchMatches.commit();
    } catch (error) {
      console.error("Seeding error:", error);
    } finally {
      setLoading(false);
    }
  };

  // Edit player handler (opens a clean editing modal)
  const handleEditPlayerInitiate = (player: Player) => {
    setEditingPlayer(player);
    setIsEditPlayerModalOpen(true);
  };

  const handleSaveEditedPlayer = async (id: string, updatedData: Partial<Player>) => {
    try {
      const playerRef = doc(db, 'players', id);
      await setDoc(playerRef, updatedData, { merge: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'players');
      throw error;
    }
  };

  // Challenge player handler (opens the weekly challenge scheduling modal)
  const handleChallengePlayerInitiate = (player: Player) => {
    setChallengingPlayer(player);
    setIsChallengeModalOpen(true);
  };

  return (
    <div className="min-h-screen bg-transparent flex flex-col font-sans text-ink">
      
      {/* Navigation Brand Header */}
      <Navbar
        isAdminMode={isAdminMode}
        setIsAdminMode={setIsAdminMode}
        adminIds={adminIds}
        onLoginClick={() => setIsAuthModalOpen(true)}
        myProfile={myProfile}
        onProfileClick={() => setIsProfileModalOpen(true)}
        theme={theme}
        onToggleTheme={toggleTheme}
      />

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 pb-28 sm:pb-8">
        
        {/* Banner de retos pendientes por responder — visible en cualquier pestaña */}
        {myProfile && activeTab !== 'retos' && (() => {
          const pendingReceived = challenges.filter(c => c.challengedB1Id === myProfile.id && c.status === 'pending');
          if (pendingReceived.length === 0) return null;
          return (
            <motion.button
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              onClick={() => setActiveTab('retos')}
              className="mb-6 w-full flex items-center justify-between gap-3 bg-ball/10 hover:bg-ball/15 border border-ball/30 rounded-2xl py-3.5 px-4 sm:px-5 text-left transition-all cursor-pointer group"
            >
              <div className="flex items-center gap-3">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-ball opacity-75 animate-ping" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-ball" />
                </span>
                <Sword className="h-4 w-4 text-ball-safe shrink-0" />
                <span className="text-sm font-bold text-ink">
                  Tienes <span className="text-ball-safe">{pendingReceived.length}</span> reto{pendingReceived.length > 1 ? 's' : ''} pendiente{pendingReceived.length > 1 ? 's' : ''} de responder
                </span>
              </div>
              <span className="text-[10px] font-black uppercase tracking-wider text-ball-safe group-hover:underline shrink-0">
                Ver y Responder →
              </span>
            </motion.button>
          );
        })()}

        {/* Sync loading or offline indicator banner */}
        {errorStatus && (
          <div className="mb-6 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-2xl py-3.5 px-4 text-xs font-semibold flex items-center gap-2">
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping" />
            <span>Atención: Error de conexión con Firestore ({errorStatus}). Revisa permisos de red.</span>
          </div>
        )}

        {/* Dynamic Empty State Call-to-action */}
        {!loading && players.length === 0 && (
          <motion.div 
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-8 bg-gradient-to-r from-ball/10 to-court/10 rounded-3xl p-6 sm:p-8 text-ink border border-ball/20 shadow-xl relative overflow-hidden"
          >
            <div className="relative z-10 max-w-lg">
              <span className="bg-ball/20 text-ball-safe text-[10px] font-mono tracking-widest uppercase px-3 py-1 rounded-lg border border-ball/20">
                Nuevo Torneo Detectado
              </span>
              <h2 className="font-display text-2xl sm:text-3xl font-black mt-4 uppercase tracking-tighter text-ink">
                ¡Comienza el campeonato!
              </h2>
              <p className="text-ink-muted text-sm mt-2 leading-relaxed font-sans">
                Parece que no hay competidores en la base de datos. Haz clic en el botón de abajo para cargar un plantel inicial con enfrentamientos y listo para evaluar.
              </p>
              <button
                id="btn-seed-data"
                onClick={handleSeedMockData}
                className="mt-5 inline-flex items-center gap-2 bg-ball hover:bg-ball-hover text-black font-black uppercase text-xs tracking-wider py-3 px-5 rounded-xl transition-all shadow-md cursor-pointer"
              >
                <Sparkles className="h-4 w-4" />
                <span>Cargar Jugadores de Prueba</span>
              </button>
            </div>
            
            {/* Visual aesthetic element */}
            <div className="absolute right-0 bottom-0 opacity-10 translate-x-12 translate-y-12">
              <Trophy className="h-48 w-48 text-ink transform -rotate-12" />
            </div>
          </motion.div>
        )}

        {/* Tab Buttons Navigation (desktop/tablet) */}
        <div className="hidden sm:flex border-b border-[var(--border-subtle)] pb-px mb-6 sm:mb-8 scrollbar-none overflow-x-auto gap-5">
          
          <button
            id="tab-ranking"
            onClick={() => setActiveTab('ranking')}
            className={`flex items-center whitespace-nowrap gap-2 py-3 px-1 text-sm font-bold uppercase tracking-wider border-b-2 transition-all relative cursor-pointer ${
              activeTab === 'ranking' 
                ? 'border-ball text-ball-safe' 
                : 'border-transparent text-ink-muted hover:text-ink'
            }`}
          >
            <Trophy className="h-4 w-4 shrink-0" />
            <span>Clasificación</span>
            {activeTab === 'ranking' && (
              <motion.div layoutId="active-tab-indicator" className="absolute bottom-0 inset-x-0 h-0.5 bg-ball" />
            )}
          </button>

          <button
            id="tab-partidos"
            onClick={() => setActiveTab('partidos')}
            className={`flex items-center whitespace-nowrap gap-2 py-3 px-1 text-sm font-bold uppercase tracking-wider border-b-2 transition-all relative cursor-pointer ${
              activeTab === 'partidos' 
                ? 'border-ball text-ball-safe' 
                : 'border-transparent text-ink-muted hover:text-ink'
            }`}
          >
            <Calendar className="h-4 w-4 shrink-0" />
            <span>Calendario & Resultados</span>
            {activeTab === 'partidos' && (
              <motion.div layoutId="active-tab-indicator" className="absolute bottom-0 inset-x-0 h-0.5 bg-ball" />
            )}
          </button>

          {myProfile && (
            <button
              id="tab-retos"
              onClick={() => setActiveTab('retos')}
              className={`flex items-center whitespace-nowrap gap-2 py-3 px-1 text-sm font-bold uppercase tracking-wider border-b-2 transition-all relative cursor-pointer ${
                activeTab === 'retos'
                  ? 'border-ball text-ball-safe'
                  : 'border-transparent text-ink-muted hover:text-ink'
              }`}
            >
              <Sword className="h-4 w-4 shrink-0" />
              <span>Retos</span>
              {challenges.filter(c => c.challengedB1Id === myProfile.id && c.status === 'pending').length > 0 && (
                <span className="bg-ball text-black text-[9px] font-black px-1.5 py-0.5 rounded-full leading-none">
                  {challenges.filter(c => c.challengedB1Id === myProfile.id && c.status === 'pending').length}
                </span>
              )}
              {activeTab === 'retos' && (
                <motion.div layoutId="active-tab-indicator" className="absolute bottom-0 inset-x-0 h-0.5 bg-ball" />
              )}
            </button>
          )}

          <button
            id="tab-info"
            onClick={() => setActiveTab('info')}
            className={`flex items-center whitespace-nowrap gap-2 py-3 px-1 text-sm font-bold uppercase tracking-wider border-b-2 transition-all relative cursor-pointer ${
              activeTab === 'info' 
                ? 'border-ball text-ball-safe' 
                : 'border-transparent text-ink-muted hover:text-ink'
            }`}
          >
            <BookOpen className="h-4 w-4 shrink-0" />
            <span>Reglas & Info</span>
            {activeTab === 'info' && (
              <motion.div layoutId="active-tab-indicator" className="absolute bottom-0 inset-x-0 h-0.5 bg-ball" />
            )}
          </button>

          {isAdminMode ? (
            <button
              id="tab-admin"
              onClick={() => setActiveTab('admin')}
              className={`flex items-center whitespace-nowrap gap-2 py-3 px-1 text-sm font-bold uppercase tracking-wider border-b-2 transition-all relative cursor-pointer ${
                activeTab === 'admin' 
                  ? 'border-ball text-ball-safe' 
                  : 'border-transparent text-ink-muted hover:text-ink'
              }`}
            >
              <Shield className="h-4 w-4 shrink-0" />
              <span>{editingPlayer ? 'Editar Jugador' : 'Crear Jugadores / Partidos'}</span>
              {activeTab === 'admin' && (
                <motion.div layoutId="active-tab-indicator" className="absolute bottom-0 inset-x-0 h-0.5 bg-ball" />
              )}
            </button>
          ) : null}
        </div>

        {/* View Layout Renderer */}
        <div className="min-h-[400px]">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-24">
              <div className="w-10 h-10 border-4 border-ball border-t-transparent rounded-full animate-spin filter drop-shadow-[0_0_5px_var(--glow-ball)]" />
              <p className="text-ink-muted text-sm font-semibold mt-4">Conectando con base de datos en tiempo real...</p>
            </div>
          ) : (
            <AnimatePresence mode="wait">
              {activeTab === 'ranking' && (
                <motion.div
                  key="ranking-panel"
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                  transition={{ duration: 0.15 }}
                >
                  <Ranking
                    players={players}
                    matches={matches}
                    categories={categories}
                    isAdminMode={isAdminMode}
                    sanctions={sanctions}
                    onEditPlayer={handleEditPlayerInitiate}
                    onDeletePlayer={handleDeletePlayer}
                    myProfile={myProfile}
                    onChallengePlayer={handleChallengePlayerInitiate}
                    adminIds={adminIds}
                  />
                </motion.div>
              )}

              {activeTab === 'partidos' && (
                <motion.div
                  key="partidos-panel"
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                  transition={{ duration: 0.15 }}
                >
                  <Partidos
                    matches={matches}
                    players={players}
                    categories={categories}
                    isAdminMode={isAdminMode}
                    currentUser={currentUser}
                    myProfile={myProfile}
                    adminEmail="alvaroestradacabello@gmail.com"
                    onDeleteMatch={handleDeleteMatch}
                    onRestartMatch={handleRestartMatch}
                    onRefreshData={() => {}}
                  />
                </motion.div>
              )}

              {activeTab === 'retos' && myProfile && (
                <motion.div
                  key="retos-panel"
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                  transition={{ duration: 0.15 }}
                >
                  <RetosPanel
                    challenges={challenges}
                    players={players}
                    myProfile={myProfile}
                    adminIds={adminIds}
                    onRefreshData={() => {}}
                  />
                </motion.div>
              )}

              {activeTab === 'info' && (
                <motion.div
                  key="info-panel"
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                  transition={{ duration: 0.15 }}
                >
                  <InfoPanel />
                </motion.div>
              )}

              {activeTab === 'admin' && isAdminMode && (
                <motion.div
                  key="admin-panel"
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                  transition={{ duration: 0.15 }}
                >
                  <AdminPanel
                    players={players}
                    matches={matches}
                    categories={categories}
                    editingPlayer={editingPlayer}
                    setEditingPlayer={setEditingPlayer}
                    onRefreshData={() => {}}
                    onResetTournament={handleResetTournament}
                    onFactoryReset={handleFactoryReset}
                    adminIds={adminIds}
                    sanctions={sanctions}
                    seasons={seasons}
                    challenges={challenges}
                    jornadas={jornadas}
                    currentUser={currentUser}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          )}
        </div>

      </main>

      {/* Footer */}
      <footer className="border-t border-[var(--border-subtle)] mt-12 py-6 text-center text-[11px] text-ink-faint font-mono uppercase tracking-widest flex flex-col sm:flex-row sm:justify-between sm:items-center px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto w-full gap-2">
        <div className="flex items-center justify-center gap-1.5">
          <span>LIGA ESCALERA RACKET 2026</span>
          <Heart className="h-3.5 w-3.5 text-rose-500 fill-rose-500 animate-pulse" />
        </div>
        <div className="flex flex-col sm:flex-row items-center gap-2 text-ink-faint text-[10px]">
          <span>Firestore DB Status: {db ? 'ONLINE' : 'OFFLINE'}</span>
          <span className="hidden sm:inline opacity-40">|</span>
          <span className="flex items-center gap-1">
            Entorno: <strong className={isProdDb ? "text-amber-500 font-extrabold" : "text-sky-500 font-semibold"}>{isProdDb ? 'PRO' : 'DES'}</strong>
            <span className={`inline-block w-1.5 h-1.5 rounded-full ${isProdDb ? "bg-amber-500 animate-pulse" : "bg-sky-400 animate-pulse"}`}></span>
          </span>
        </div>
      </footer>

      {/* Bottom Tab Navigation (mobile only) — thumb-friendly, always visible */}
      <nav className="sm:hidden fixed bottom-0 inset-x-0 z-40 glass-card border-t border-[var(--border-subtle)] shadow-[0_-4px_20px_rgba(0,0,0,0.25)] pb-[env(safe-area-inset-bottom)]">
        <div className="flex items-stretch justify-around">
          <button
            onClick={() => setActiveTab('ranking')}
            className={`flex flex-1 flex-col items-center justify-center gap-0.5 py-2.5 text-[10px] font-bold uppercase tracking-wide transition-colors cursor-pointer ${
              activeTab === 'ranking' ? 'text-ball-safe' : 'text-ink-faint'
            }`}
          >
            <Trophy className="h-5 w-5" />
            <span>Ranking</span>
          </button>

          <button
            onClick={() => setActiveTab('partidos')}
            className={`flex flex-1 flex-col items-center justify-center gap-0.5 py-2.5 text-[10px] font-bold uppercase tracking-wide transition-colors cursor-pointer ${
              activeTab === 'partidos' ? 'text-ball-safe' : 'text-ink-faint'
            }`}
          >
            <Calendar className="h-5 w-5" />
            <span>Partidos</span>
          </button>

          {myProfile && (
            <button
              onClick={() => setActiveTab('retos')}
              className={`relative flex flex-1 flex-col items-center justify-center gap-0.5 py-2.5 text-[10px] font-bold uppercase tracking-wide transition-colors cursor-pointer ${
                activeTab === 'retos' ? 'text-ball-safe' : 'text-ink-faint'
              }`}
            >
              <span className="relative">
                <Sword className="h-5 w-5" />
                {challenges.filter(c => c.challengedB1Id === myProfile.id && c.status === 'pending').length > 0 && (
                  <span className="absolute -top-1 -right-1.5 bg-ball text-black text-[8px] font-black w-3.5 h-3.5 flex items-center justify-center rounded-full leading-none">
                    {challenges.filter(c => c.challengedB1Id === myProfile.id && c.status === 'pending').length}
                  </span>
                )}
              </span>
              <span>Retos</span>
            </button>
          )}

          <button
            onClick={() => setActiveTab('info')}
            className={`flex flex-1 flex-col items-center justify-center gap-0.5 py-2.5 text-[10px] font-bold uppercase tracking-wide transition-colors cursor-pointer ${
              activeTab === 'info' ? 'text-ball-safe' : 'text-ink-faint'
            }`}
          >
            <BookOpen className="h-5 w-5" />
            <span>Info</span>
          </button>

          {isAdminMode && (
            <button
              onClick={() => setActiveTab('admin')}
              className={`flex flex-1 flex-col items-center justify-center gap-0.5 py-2.5 text-[10px] font-bold uppercase tracking-wide transition-colors cursor-pointer ${
                activeTab === 'admin' ? 'text-ball-safe' : 'text-ink-faint'
              }`}
            >
              <Shield className="h-5 w-5" />
              <span>Admin</span>
            </button>
          )}
        </div>
      </nav>

      {/* Auth Modal at the root hierarchy level */}
      <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} />

      {/* Onboarding Gate for new registered players */}
      {currentUser && !myProfile && !loading && (
        <div className="fixed inset-0 z-45 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-md" />
          
          <div className="relative w-full max-w-md glass-card border border-[var(--border-subtle)] rounded-2xl shadow-xl p-6 overflow-hidden text-ink z-10">
            <div className="absolute top-0 left-1/4 right-1/4 h-[1px] bg-gradient-to-r from-transparent via-ball/40 to-transparent" />
            
            <div className="text-center space-y-2 mb-4">
              <Trophy className="h-10 w-10 text-ball-safe mx-auto filter drop-shadow-[0_0_8px_var(--glow-ball)] animate-pulse" />
              <h3 className="font-display text-xl font-black uppercase tracking-tight text-ink">Completa tu Ficha de Jugador</h3>
              <p className="text-xs text-ink-muted">
                Registra tus datos de juego para emparejarte en los partidos y figurar en la clasificación oficial.
              </p>
            </div>

            <OnboardingForm currentUser={currentUser} categories={categories} players={players} adminIds={adminIds} />

            <div className="text-center mt-5 pt-3 border-t border-[var(--border-subtle)]">
              <button
                type="button"
                onClick={() => signOut(auth)}
                className="text-xs text-rose-400/80 hover:text-rose-400 font-bold uppercase tracking-wider font-mono transition-colors cursor-pointer"
              >
                Cerrar Sesión
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Profiling Editor Modal */}
      <ProfileModal 
        isOpen={isProfileModalOpen} 
        onClose={() => setIsProfileModalOpen(false)} 
        profile={myProfile} 
        categories={categories}
        isAdmin={isAdminMode}
      />

      {/* Admin Edit Player Modal */}
      <EditPlayerModal
        isOpen={isEditPlayerModalOpen}
        onClose={() => {
          setIsEditPlayerModalOpen(false);
          setEditingPlayer(null);
        }}
        player={editingPlayer}
        categories={categories}
        onSave={handleSaveEditedPlayer}
      />

      {/* Weekly Challenge Scheduler Modal */}
      <ChallengeModal
        isOpen={isChallengeModalOpen}
        onClose={() => {
          setIsChallengeModalOpen(false);
          setChallengingPlayer(null);
        }}
        myProfile={myProfile}
        otherPlayer={challengingPlayer}
        players={players}
        challenges={challenges}
        adminIds={adminIds}
        onChallengeScheduled={() => {}}
      />
    </div>
  );
}