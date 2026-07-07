/**
 * excelMatches.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Generación y lectura de la plantilla Excel para crear partidos semanales
 * en bloque. Usa la librería SheetJS (xlsx), que funciona enteramente en el
 * navegador (no requiere backend).
 */

import * as XLSX from 'xlsx';
import { Player, Category, DivisionType } from '../types';

export const SHEET_PARTIDOS = 'Partidos';
export const SHEET_JUGADORES = 'Jugadores';
export const SHEET_INSTRUCCIONES = 'Instrucciones';

export const HEADERS = [
  'Categoria',
  'Division',
  'Jugador A1',
  'Jugador A2 (opcional)',
  'Jugador B1',
  'Jugador B2 (opcional)',
  'Fecha (AAAA-MM-DD)',
  'Hora (HH:MM)',
];

function fullName(p: Player) {
  return `${p.nombre} ${p.apellidos}`.trim();
}

// Excluye administradores de los listados/sugerencias
function isCompetitivePlayer(p: Player, adminIds: string[]) {
  const isA = p.email === 'alvaroestradacabello@gmail.com' || adminIds.includes(p.id);
  return !isA;
}

/**
 * Sugiere parejas por categoría+división usando seeding tipo "snake":
 * dentro de cada grupo de 4 jugadores consecutivos por puntos,
 * Equipo A = #1 y #4, Equipo B = #2 y #3 (reparte fuerza entre equipos).
 * Si sobran 2 jugadores, se sugiere un 1vs1. Si sobra 1 o 3, se deja sin sugerir.
 */
function suggestPairings(players: Player[], categories: Category[], adminIds: string[]) {
  const sortedCategories = [...categories].sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
  const divisions: DivisionType[] = ['Masculina', 'Femenina'];
  const rows: any[] = [];
  const sinPartido: string[] = [];

  sortedCategories.forEach(cat => {
    divisions.forEach(div => {
      const grupo = players
        .filter(p => p.categoria === cat.name && p.division === div && isCompetitivePlayer(p, adminIds))
        .sort((a, b) => (b.puntos - a.puntos) || a.nombre.localeCompare(b.nombre));

      let i = 0;
      while (i + 4 <= grupo.length) {
        const [p1, p2, p3, p4] = grupo.slice(i, i + 4);
        rows.push([cat.name, div, fullName(p1), fullName(p4), fullName(p2), fullName(p3), '', '']);
        i += 4;
      }
      const resto = grupo.slice(i);
      if (resto.length === 2) {
        rows.push([cat.name, div, fullName(resto[0]), '', fullName(resto[1]), '', '', '']);
      } else if (resto.length > 0) {
        resto.forEach(p => sinPartido.push(`${fullName(p)} (${cat.name}, ${div})`));
      }
    });
  });

  return { rows, sinPartido };
}

export function generateMatchesTemplate(players: Player[], categories: Category[], adminIds: string[] = []) {
  const wb = XLSX.utils.book_new();

  // ── Sheet 1: Instrucciones ──────────────────────────────────────────────
  const instrucciones = [
    ['Cómo usar esta plantilla'],
    [''],
    ['1. En la pestaña "Partidos" ya hay sugerencias de enfrentamientos basadas en la clasificación actual.'],
    ['2. Puedes editarlas libremente: cambiar nombres, añadir filas nuevas, borrar las que no quieras.'],
    ['3. Escribe los nombres EXACTAMENTE igual que aparecen en la pestaña "Jugadores" (copia y pega para evitar errores).'],
    ['4. Jugador A2 y B2 son opcionales: déjalos en blanco para crear un partido 1vs1.'],
    ['5. Fecha y Hora son opcionales. Si los dejas en blanco, el partido se crea sin fecha asignada.'],
    ['6. Guarda el archivo y súbelo de nuevo en la web, en "Generar Partidos desde Excel".'],
    ['7. Revisarás una vista previa con cualquier error antes de crear nada — no se crea ningún partido hasta que lo confirmes.'],
    [''],
    ['Importante: no subas el mismo Excel dos veces sin borrar las filas ya creadas, o se duplicarán los partidos.'],
  ];
  const wsInstrucciones = XLSX.utils.aoa_to_sheet(instrucciones);
  wsInstrucciones['!cols'] = [{ wch: 100 }];
  XLSX.utils.book_append_sheet(wb, wsInstrucciones, SHEET_INSTRUCCIONES);

  // ── Sheet 2: Partidos (con sugerencias precargadas) ─────────────────────
  const { rows, sinPartido } = suggestPairings(players, categories, adminIds);
  const partidosData = [HEADERS, ...rows];
  const wsPartidos = XLSX.utils.aoa_to_sheet(partidosData);
  wsPartidos['!cols'] = HEADERS.map(() => ({ wch: 22 }));
  XLSX.utils.book_append_sheet(wb, wsPartidos, SHEET_PARTIDOS);

  // ── Sheet 3: Jugadores (referencia para copiar nombres exactos) ────────
  const sortedCategories = [...categories].sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
  const jugadoresRows: any[] = [['Nombre Completo', 'Categoria', 'Division', 'Puntos', 'Posición']];
  sortedCategories.forEach(cat => {
    (['Masculina', 'Femenina'] as DivisionType[]).forEach(div => {
      const grupo = players
        .filter(p => p.categoria === cat.name && p.division === div && isCompetitivePlayer(p, adminIds))
        .sort((a, b) => (b.puntos - a.puntos) || a.nombre.localeCompare(b.nombre));
      grupo.forEach((p, idx) => {
        jugadoresRows.push([fullName(p), cat.name, div, p.puntos, idx + 1]);
      });
    });
  });
  if (sinPartido.length > 0) {
    jugadoresRows.push([]);
    jugadoresRows.push(['Jugadores sin pareja sugerida esta semana (nº impar en su grupo):']);
    sinPartido.forEach(s => jugadoresRows.push([s]));
  }
  const wsJugadores = XLSX.utils.aoa_to_sheet(jugadoresRows);
  wsJugadores['!cols'] = [{ wch: 28 }, { wch: 16 }, { wch: 12 }, { wch: 10 }, { wch: 10 }];
  XLSX.utils.book_append_sheet(wb, wsJugadores, SHEET_JUGADORES);

  const today = new Date().toISOString().split('T')[0];
  XLSX.writeFile(wb, `partidos-semanales-${today}.xlsx`);
}

// ─── Lectura y parseo del Excel subido ────────────────────────────────────

export interface ParsedMatchRow {
  rowIndex: number; // fila original en el Excel (para mostrar al usuario)
  categoria: string;
  division: string;
  nombreA1: string;
  nombreA2: string;
  nombreB1: string;
  nombreB2: string;
  fecha: string;
  hora: string;
  status: 'ok' | 'error';
  errorMsg?: string;
  playerA1Id?: string;
  playerA2Id?: string;
  playerB1Id?: string;
  playerB2Id?: string;
}

export async function parseMatchesExcelFile(file: File, players: Player[]): Promise<ParsedMatchRow[]> {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: 'array' });

  const sheetName = wb.SheetNames.includes(SHEET_PARTIDOS) ? SHEET_PARTIDOS : wb.SheetNames[0];
  const sheet = wb.Sheets[sheetName];
  const raw: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

  // Saltar la fila de cabecera
  const dataRows = raw.slice(1).filter(r => r.some(cell => String(cell ?? '').trim() !== ''));

  const findPlayer = (name: string, categoria: string, division: string): Player | undefined => {
    const target = name.trim().toLowerCase();
    if (!target) return undefined;
    return players.find(p =>
      `${p.nombre} ${p.apellidos}`.trim().toLowerCase() === target &&
      p.categoria.toLowerCase() === categoria.trim().toLowerCase() &&
      p.division.toLowerCase() === division.trim().toLowerCase()
    );
  };

  const usedPlayerIds = new Set<string>();
  const results: ParsedMatchRow[] = [];

  dataRows.forEach((row, idx) => {
    const [categoria, division, nombreA1, nombreA2, nombreB1, nombreB2, fecha, hora] =
      [0, 1, 2, 3, 4, 5, 6, 7].map(i => String(row[i] ?? '').trim());

    const parsed: ParsedMatchRow = {
      rowIndex: idx + 2, // +2 = +1 por la cabecera, +1 por base-1 de Excel
      categoria, division, nombreA1, nombreA2, nombreB1, nombreB2, fecha, hora,
      status: 'ok',
    };

    if (!categoria || !division) {
      parsed.status = 'error';
      parsed.errorMsg = 'Falta categoría o división.';
      results.push(parsed);
      return;
    }
    if (division !== 'Masculina' && division !== 'Femenina') {
      parsed.status = 'error';
      parsed.errorMsg = `División "${division}" no válida (debe ser Masculina o Femenina).`;
      results.push(parsed);
      return;
    }
    if (!nombreA1 || !nombreB1) {
      parsed.status = 'error';
      parsed.errorMsg = 'Faltan los jugadores principales (A1 y B1).';
      results.push(parsed);
      return;
    }
    if ((!!nombreA2) !== (!!nombreB2)) {
      parsed.status = 'error';
      parsed.errorMsg = 'Si es un partido de parejas, completa A2 y B2; si es 1vs1, deja ambos en blanco.';
      results.push(parsed);
      return;
    }

    const pA1 = findPlayer(nombreA1, categoria, division);
    const pB1 = findPlayer(nombreB1, categoria, division);
    const pA2 = nombreA2 ? findPlayer(nombreA2, categoria, division) : undefined;
    const pB2 = nombreB2 ? findPlayer(nombreB2, categoria, division) : undefined;

    if (!pA1) { parsed.status = 'error'; parsed.errorMsg = `No se encontró a "${nombreA1}" en ${categoria}/${division}.`; results.push(parsed); return; }
    if (!pB1) { parsed.status = 'error'; parsed.errorMsg = `No se encontró a "${nombreB1}" en ${categoria}/${division}.`; results.push(parsed); return; }
    if (nombreA2 && !pA2) { parsed.status = 'error'; parsed.errorMsg = `No se encontró a "${nombreA2}" en ${categoria}/${division}.`; results.push(parsed); return; }
    if (nombreB2 && !pB2) { parsed.status = 'error'; parsed.errorMsg = `No se encontró a "${nombreB2}" en ${categoria}/${division}.`; results.push(parsed); return; }

    const ids = [pA1.id, pB1.id, pA2?.id, pB2?.id].filter(Boolean) as string[];
    if (new Set(ids).size !== ids.length) {
      parsed.status = 'error';
      parsed.errorMsg = 'Hay un jugador duplicado dentro del mismo partido.';
      results.push(parsed);
      return;
    }
    const repetido = ids.find(id => usedPlayerIds.has(id));
    if (repetido) {
      const p = players.find(pp => pp.id === repetido);
      parsed.status = 'error';
      parsed.errorMsg = `${p ? `${p.nombre} ${p.apellidos}` : 'Un jugador'} ya aparece en otro partido de esta misma hoja.`;
      results.push(parsed);
      return;
    }

    if (fecha && !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
      parsed.status = 'error';
      parsed.errorMsg = `Formato de fecha no válido: "${fecha}" (usa AAAA-MM-DD).`;
      results.push(parsed);
      return;
    }
    if (hora && !/^\d{1,2}:\d{2}$/.test(hora)) {
      parsed.status = 'error';
      parsed.errorMsg = `Formato de hora no válido: "${hora}" (usa HH:MM).`;
      results.push(parsed);
      return;
    }

    ids.forEach(id => usedPlayerIds.add(id));
    parsed.playerA1Id = pA1.id;
    parsed.playerB1Id = pB1.id;
    parsed.playerA2Id = pA2?.id;
    parsed.playerB2Id = pB2?.id;
    results.push(parsed);
  });

  return results;
}
