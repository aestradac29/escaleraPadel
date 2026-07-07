/**
 * notifications.ts — Solo WhatsApp
 * Genera enlaces wa.me con el mensaje pre-escrito y los abre en una nueva
 * pestaña. No requiere ninguna API, cuenta ni configuración adicional.
 */

import { Player } from '../types';

const TOURNAMENT_NAME = 'Escalera de Pádel';
const APP_URL = typeof window !== 'undefined' ? window.location.origin : '';

// ─── WhatsApp ─────────────────────────────────────────────────────────────────

export function buildWhatsAppUrl(phone: string, message: string): string {
  const clean = phone.replace(/\D/g, '');
  // Prefijo España si son 9 dígitos empezando por 6, 7 o 9
  const intl = clean.length === 9 && /^[679]/.test(clean) ? `34${clean}` : clean;
  return `https://wa.me/${intl}?text=${encodeURIComponent(message)}`;
}

export function sendWhatsApp(phone: string | undefined, message: string) {
  if (phone) {
    window.open(buildWhatsAppUrl(phone, message), '_blank');
  }
  // Si no hay teléfono no hacemos nada: el campo es obligatorio en el registro,
  // pero puede que sean jugadores de prueba sin teléfono.
}

// ─── Retos ────────────────────────────────────────────────────────────────────

export function notifyRetoRecibido(recipient: Player, challengerName: string) {
  sendWhatsApp(
    recipient.telefono,
    `Hola ${recipient.nombre} 👋\n` +
    `*${challengerName}* te ha enviado un reto en la ${TOURNAMENT_NAME}.\n\n` +
    `Entra en la app para aceptarlo o rechazarlo:\n${APP_URL}`
  );
}

export function notifyRetoAceptado(recipient: Player, accepterName: string) {
  sendWhatsApp(
    recipient.telefono,
    `Hola ${recipient.nombre} 🎾\n` +
    `*${accepterName}* ha aceptado tu reto en la ${TOURNAMENT_NAME}.\n` +
    `Poneos de acuerdo para quedar. ¡Mucha suerte!\n${APP_URL}`
  );
}

export function notifyRetoCancelado(recipient: Player, cancelerName: string) {
  sendWhatsApp(
    recipient.telefono,
    `Hola ${recipient.nombre} ❌\n` +
    `*${cancelerName}* ha cancelado el reto en la ${TOURNAMENT_NAME}.\n` +
    `Puedes retar a otro jugador desde la app:\n${APP_URL}`
  );
}

// ─── Resultados ───────────────────────────────────────────────────────────────

export function notifyResultadoPendiente(
  recipients: Player[],
  submitterName: string,
  matchSummary: string
) {
  for (const recipient of recipients) {
    sendWhatsApp(
      recipient.telefono,
      `Hola ${recipient.nombre} 🏆\n` +
      `*${submitterName}* ha introducido el resultado de vuestro partido.\n\n` +
      `Resultado: *${matchSummary}*\n\n` +
      `Tienes *24 horas* para aprobarlo o impugnarlo:\n${APP_URL}\n\n` +
      `Si no haces nada, se aprobará automáticamente.`
    );
  }
}

export function notifyResultadoAprobado(
  recipients: Player[],
  approverName: string,
  matchSummary: string
) {
  for (const recipient of recipients) {
    sendWhatsApp(
      recipient.telefono,
      `Hola ${recipient.nombre} ✅\n` +
      `El resultado *${matchSummary}* ha sido aprobado por *${approverName}*.\n` +
      `Los puntos ya están actualizados en la clasificación:\n${APP_URL}`
    );
  }
}

export function notifyResultadoDisputado(
  allPlayers: Player[],
  disputerName: string,
  reason: string,
  adminPhone?: string
) {
  // Notificar a todos los jugadores del partido
  for (const p of allPlayers) {
    sendWhatsApp(
      p.telefono,
      `Hola ${p.nombre} ⚠️\n` +
      `*${disputerName}* ha impugnado el resultado del partido.\n\n` +
      `Motivo: ${reason}\n\n` +
      `Un administrador lo revisará próximamente:\n${APP_URL}`
    );
  }

  // Notificar al admin si tiene teléfono configurado
  if (adminPhone) {
    sendWhatsApp(
      adminPhone,
      `⚠️ *Disputa de resultado*\n` +
      `*${disputerName}* ha impugnado el resultado de un partido.\n\n` +
      `Motivo: ${reason}\n\n` +
      `Entra en el panel de admin:\n${APP_URL}`
    );
  }
}
