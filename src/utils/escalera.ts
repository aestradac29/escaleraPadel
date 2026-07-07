/**
 * escalera.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Motor de movimiento de la escalera, según el Manual Oficial de Competición
 * de la Liga Escalera RACKET® 2026 (Capítulos V y VI).
 *
 * La Liga NO funciona por puntos acumulados (Art. 9): cada jugador ocupa una
 * posición concreta dentro de su división, organizada en grupos de 4
 * (Art. 10). Tras cada Jornada Oficial, las posiciones se recolocan según
 * estas reglas — son funciones puras, sin efectos secundarios, para que sean
 * fáciles de probar y de razonar sobre ellas.
 */

export interface JugadorGrupo {
  playerId: string;
  playerName: string;
  posicion: number;
}

export interface ResultadoMovimiento {
  playerId: string;
  playerName: string;
  posicionAntes: number;
  posicionDespues: number;
}

/** Art. 10: cada grupo tiene 4 posiciones. Grupo 1 = puestos 1-4, Grupo 2 = 5-8... */
export function getGrupo(posicion: number): number {
  return Math.max(1, Math.ceil(posicion / 4));
}

export function getRangoGrupo(grupo: number): { desde: number; hasta: number } {
  return { desde: (grupo - 1) * 4 + 1, hasta: grupo * 4 };
}

/**
 * Art. 17: determina el orden 1º a 4º de un partido a partir de los juegos
 * ganados por cada jugador, aplicando el desempate oficial:
 *   1) Mayor nº de juegos ganados.
 *   2) Mejor diferencia de juegos ganados/perdidos.
 *   3) Mejor posición previa en el Ranking Oficial.
 * Devuelve un array de playerIds ordenado (1º primero).
 */
export function calcularClasificacionPartido(
  jugadores: { playerId: string; juegosGanados: number; juegosPerdidos: number; posicionPrevia: number }[]
): string[] {
  return [...jugadores]
    .sort((a, b) => {
      if (b.juegosGanados !== a.juegosGanados) return b.juegosGanados - a.juegosGanados;
      const diffA = a.juegosGanados - a.juegosPerdidos;
      const diffB = b.juegosGanados - b.juegosPerdidos;
      if (diffB !== diffA) return diffB - diffA;
      return a.posicionPrevia - b.posicionPrevia; // mejor puesto previo = gana el desempate
    })
    .map(j => j.playerId);
}

/**
 * Art. 18, 19 y 20: calcula el movimiento de posiciones tras una Jornada Oficial.
 *
 * - Art. 18: dentro del propio grupo, cada jugador pasa a ocupar la posición
 *   correspondiente a su puesto en el partido (1º → mejor posición del grupo, etc).
 * - Art. 19: si el grupo NO es el Grupo 1, el ganador del grupo asciende al
 *   ÚLTIMO puesto del grupo inmediatamente superior, y el último clasificado
 *   de ese grupo superior desciende al PRIMER puesto del grupo inferior.
 * - Art. 20: el Grupo 1 no tiene grupo superior; su 1º pasa a ser el nº 1
 *   absoluto del Ranking (no hay intercambio).
 *
 * @param jugadoresGrupo Los jugadores que disputaron el partido, con su posición ANTES de jugar.
 * @param clasificacionIds playerIds en el orden 1º→4º resultante del partido (ver calcularClasificacionPartido).
 * @param jugadorUltimoGrupoSuperior El último clasificado del grupo inmediatamente superior, si existe y aplica el intercambio (Art. 19). Omitir si el grupo jugado es el Grupo 1 (Art. 20) o si el grupo superior no tiene jugadores.
 */
export function calcularMovimientoEscalera(
  jugadoresGrupo: JugadorGrupo[],
  clasificacionIds: string[],
  jugadorUltimoGrupoSuperior?: JugadorGrupo
): ResultadoMovimiento[] {
  const posicionesGrupo = jugadoresGrupo.map(j => j.posicion).sort((a, b) => a - b);

  const movimientos: ResultadoMovimiento[] = clasificacionIds.map((playerId, idx) => {
    const jugador = jugadoresGrupo.find(j => j.playerId === playerId);
    if (!jugador) throw new Error(`Jugador ${playerId} no pertenece al grupo indicado`);
    return {
      playerId: jugador.playerId,
      playerName: jugador.playerName,
      posicionAntes: jugador.posicion,
      posicionDespues: posicionesGrupo[idx],
    };
  });

  // Art. 19: intercambio con el grupo superior (no aplica al Grupo 1, Art. 20)
  if (jugadorUltimoGrupoSuperior) {
    const ganadorGrupo = movimientos[0];
    const posicionOriginalGanador = posicionesGrupo[0];

    ganadorGrupo.posicionDespues = jugadorUltimoGrupoSuperior.posicion;

    movimientos.push({
      playerId: jugadorUltimoGrupoSuperior.playerId,
      playerName: jugadorUltimoGrupoSuperior.playerName,
      posicionAntes: jugadorUltimoGrupoSuperior.posicion,
      posicionDespues: posicionOriginalGanador,
    });
  }

  return movimientos;
}

/**
 * Art. 26: movimiento en el ranking tras un Reto Oficial.
 * Solo se mueven retador y retado (los compañeros no cambian de posición por
 * este resultado, salvo que sean ellos mismos retador/retado en otro reto).
 *
 * - Si gana el retador: ocupa la posición del retado; el retado y todos los
 *   jugadores intermedios bajan una posición.
 * - Si gana el retado: no hay ningún cambio de ranking.
 */
export function calcularMovimientoReto(
  retador: { playerId: string; playerName: string; posicion: number },
  retado: { playerId: string; playerName: string; posicion: number },
  ganaRetador: boolean,
  jugadoresIntermedios: { playerId: string; playerName: string; posicion: number }[] = []
): ResultadoMovimiento[] {
  if (!ganaRetador) return [];

  const movimientos: ResultadoMovimiento[] = [
    { playerId: retador.playerId, playerName: retador.playerName, posicionAntes: retador.posicion, posicionDespues: retado.posicion },
    { playerId: retado.playerId, playerName: retado.playerName, posicionAntes: retado.posicion, posicionDespues: retado.posicion + 1 },
  ];

  jugadoresIntermedios.forEach(j => {
    movimientos.push({
      playerId: j.playerId,
      playerName: j.playerName,
      posicionAntes: j.posicion,
      posicionDespues: j.posicion + 1,
    });
  });

  return movimientos;
}

/**
 * Art. 30-38: descenso de posiciones por sanción disciplinaria.
 * El jugador sancionado baja `descensoPosiciones` puestos (o hasta el final
 * de su división si hay menos jugadores por debajo); los jugadores que
 * ocupaban esos puestos ascienden uno cada uno para llenar el hueco.
 *
 * @param jugadoresAfectados Los jugadores inmediatamente por debajo del
 *   sancionado, en orden ascendente de posición, hasta `descensoPosiciones`
 *   de ellos (el llamador los recorta a la división y al rango correcto).
 */
export function calcularDescensoSancion(
  sancionado: { playerId: string; playerName: string; posicion: number },
  jugadoresAfectados: { playerId: string; playerName: string; posicion: number }[]
): ResultadoMovimiento[] {
  if (jugadoresAfectados.length === 0) return [];

  const nuevaPosicionSancionado = jugadoresAfectados[jugadoresAfectados.length - 1].posicion;

  const movimientos: ResultadoMovimiento[] = [
    { playerId: sancionado.playerId, playerName: sancionado.playerName, posicionAntes: sancionado.posicion, posicionDespues: nuevaPosicionSancionado },
  ];

  jugadoresAfectados.forEach(j => {
    movimientos.push({
      playerId: j.playerId,
      playerName: j.playerName,
      posicionAntes: j.posicion,
      posicionDespues: j.posicion - 1,
    });
  });

  return movimientos;
}
