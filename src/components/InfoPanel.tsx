import React from 'react';
import {
  BookOpen, Users, Mail, Phone, Instagram, Facebook,
  ListOrdered, CalendarDays, Swords, Gavel, Lock,
  ArrowUpDown, ChevronDown, ChevronUp, Trophy, Clock
} from 'lucide-react';

interface CollapsibleChapterProps {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

function CollapsibleChapter({ title, icon: Icon, children, defaultOpen = false }: CollapsibleChapterProps) {
  const [isOpen, setIsOpen] = React.useState(defaultOpen);

  return (
    <div className="border border-[var(--border-subtle)] rounded-2xl overflow-hidden bg-[var(--surface-1)] transition-all">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between font-display text-sm sm:text-base font-black text-ink uppercase tracking-wide py-4 px-5 bg-[var(--surface-2)] hover:bg-ball/5 transition-all text-left cursor-pointer"
      >
        <div className="flex items-center gap-3">
          {Icon && <Icon className="h-5 w-5 text-ball-safe shrink-0 filter drop-shadow-[0_0_4px_var(--glow-ball)]" />}
          <span>{title}</span>
        </div>
        {isOpen ? (
          <ChevronUp className="h-5 w-5 text-ink-muted" />
        ) : (
          <ChevronDown className="h-5 w-5 text-ink-muted" />
        )}
      </button>
      
      {isOpen && (
        <div className="p-5 space-y-4 animate-in fade-in duration-150 border-t border-[var(--border-subtle)] bg-[var(--surface-1)]">
          {children}
        </div>
      )}
    </div>
  );
}

function InfoCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-[var(--surface-2)] border border-[var(--border-subtle)] p-4 rounded-2xl text-xs leading-relaxed space-y-1.5">
      <div className="font-bold text-ink">
        {title}
      </div>
      <div className="text-ink-muted space-y-1.5">{children}</div>
    </div>
  );
}

function InfoCardDestacado({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-ball/5 border border-ball/20 p-4 rounded-2xl text-xs leading-relaxed space-y-1.5">
      <div className="font-bold text-ink flex items-center gap-1.5">
        <span className="text-ball-safe">★</span>
        <span>{title}</span>
      </div>
      <div className="text-ink-muted space-y-1.5">{children}</div>
    </div>
  );
}

export default function InfoPanel() {
  return (
    <div className="glass-card rounded-2xl border border-[var(--border-subtle)] shadow-2xl p-5 sm:p-8 text-ink space-y-6">

      {/* Header */}
      <div className="border-b border-[var(--border-subtle)] pb-5">
        <h2 className="font-display text-2xl sm:text-3xl font-black text-ink flex items-center gap-2.5">
          <BookOpen className="h-6 w-6 sm:h-7 sm:w-7 text-ball-safe filter drop-shadow-[0_0_8px_var(--glow-ball)]" />
          <span>Guía de Juego y Convivencia</span>
        </h2>
        <p className="text-ink-muted text-sm mt-1">Liga Escalera RACKET® 2026 — Todo lo que necesitas saber para disfrutar de la liga.</p>
      </div>

      <div className="bg-gradient-to-r from-ball/10 to-court/10 border border-ball/15 p-5 rounded-2xl text-center">
        <p className="font-display text-lg sm:text-xl font-black text-ink italic">
          "En RACKET no ascienden los que esperan. Ascienden los que aceptan el reto."
        </p>
      </div>

      {/* 1. Aspectos Generales */}
      <CollapsibleChapter title="Aspectos Generales" icon={Users} defaultOpen={true}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <InfoCard title="Sobre la Liga">
            <p>Esta guía recoge el funcionamiento y el espíritu de la Liga Escalera RACKET®, organizada con mucha ilusión por RACKET Sport Center. Al inscribirte, te comprometes a disfrutar del juego, respetar a tus compañeros de pista y pasarlo en grande.</p>
          </InfoCard>
          <InfoCard title="La Organización">
            <p>Detrás de la liga está el equipo de RACKET, que se encarga de gestionar las inscripciones, coordinar los grupos cada semana, actualizar el ranking de la escalera, resolver incidencias y echaros una mano con cualquier duda o imprevisto para que todo fluya. <strong className="text-ink">Su criterio es de confianza y definitivo.</strong></p>
            <div className="flex flex-col gap-1.5 bg-[var(--surface-1)] border border-[var(--border-subtle)] rounded-xl p-3 mt-2 text-[10px]">
              <span className="flex items-center gap-1.5"><Users className="h-3 w-3 text-court" />Coordinación: <strong className="text-ink">Patri</strong></span>
              <span className="flex items-center gap-1.5"><Phone className="h-3 w-3 text-court" />673 20 77 14</span>
              <span className="flex items-center gap-1.5"><Mail className="h-3 w-3 text-court" />racketsportoficial@gmail.com</span>
            </div>
          </InfoCard>
        </div>
        <InfoCardDestacado title="¿Cómo se compite?">
          <p>¡Aquí jugamos al pádel de una forma súper dinámica! Es una competición individual basada en un <strong className="text-ball-safe">sistema de posiciones, no en acumular puntos</strong>: la famosa <strong className="text-ink">Escalera Oficial RACKET</strong>. El objetivo es ir escalando puestos mediante tus partidos semanales de grupo, los Retos Directos que propongas y, por supuesto, tu regularidad, deportividad y buen rollo en las pistas.</p>
        </InfoCardDestacado>
        <InfoCard title="Nuestros Valores">
          <p className="mb-2">Creemos firmemente que el buen ambiente y la cortesía dentro y fuera de la pista son la clave de la liga:</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10px] pt-1">
            {['Respeto mutuo', 'Puntualidad', 'Compromiso', 'Fair Play', 'Deportividad', 'Cuidado del club', 'Buen ambiente'].map(v => (
              <span key={v} className="bg-[var(--surface-1)] border border-[var(--border-subtle)] rounded-lg px-2 py-1 text-center font-medium">{v}</span>
            ))}
          </div>
        </InfoCard>
      </CollapsibleChapter>

      {/* 2. Inscripciones y Precios */}
      <CollapsibleChapter title="Inscripciones y Precios" icon={Trophy}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <InfoCard title="Cómo Apuntarse">
            <p>La inscripción tiene un coste único de <strong className="text-ink">20 € por jugador</strong>. El periodo principal de inscripción para la temporada 2026 está abierto del <strong className="text-ink">23 de junio al 10 de julio</strong>. Si la liga ya ha empezado y quieres apuntarte, ¡escríbenos! Siempre intentamos hacer un hueco si hay disponibilidad para que nadie se quede sin jugar.</p>
          </InfoCard>
          <InfoCard title="Precio de las Pistas">
            <div className="space-y-1.5">
              <div className="flex justify-between bg-[var(--surface-1)] border border-[var(--border-subtle)] rounded-lg px-3 py-1.5">
                <span>Socios del club</span><span className="font-bold text-ink">5,50 € / jugador</span>
              </div>
              <div className="flex justify-between bg-[var(--surface-1)] border border-[var(--border-subtle)] rounded-lg px-3 py-1.5">
                <span>No socios</span><span className="font-bold text-ink">6,50 € / jugador</span>
              </div>
            </div>
            <p className="text-[10px] text-ink-faint mt-1.5">El coste de alquiler de cada partido es responsabilidad de los jugadores del encuentro.</p>
          </InfoCard>
        </div>
      </CollapsibleChapter>

      {/* 3. Calendario y Escalera */}
      <CollapsibleChapter title="Calendario y Escalera" icon={CalendarDays}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <InfoCard title="¿Cuándo Jugamos?">
            <p>La Liga Escalera 2026 arranca con energía el <strong className="text-ink">13 de julio</strong> y se desarrolla durante los meses de <strong className="text-ink">julio, agosto y septiembre de 2026</strong>. La clasificación en la app se irá actualizando de manera dinámica para que puedas ver tu evolución al momento.</p>
          </InfoCard>
          <InfoCard title="Punto de Partida">
            <p>Para empezar de la forma más equilibrada posible, la organización asignará los puestos de salida basándose en el nivel estimado de cada jugador, sorteos entre perfiles similares o su trayectoria previa en el club.</p>
          </InfoCard>
        </div>
        <InfoCardDestacado title="Olvídate de las Matemáticas">
          <p><strong className="text-ball-safe">En esta liga no dependes de sumar o restar puntos en una tabla gigante.</strong> Cada jugador ocupa un peldaño exacto en el Ranking Oficial RACKET. Los resultados de los partidos de grupo semanales y los Retos Directos hacen que subas o bajes peldaños. ¡Tu misión es llegar tan alto como puedas!</p>
        </InfoCardDestacado>
      </CollapsibleChapter>

      {/* 4. Tus Partidos Semanales */}
      <CollapsibleChapter title="Tus Partidos Semanales" icon={ListOrdered}>
        <InfoCard title="Grupos de Juego">
          <p>Cada semana, la aplicación publicará automáticamente los enfrentamientos agrupando a los jugadores <strong className="text-ink">en grupos de cuatro personas</strong> según su posición actual en la escalera. Por ejemplo:</p>
          <div className="grid grid-cols-3 gap-2 text-[11px] pt-1 mt-2">
            {[['Grupo 1', 'Puestos 1 al 4'],['Grupo 2','Puestos 5 al 8'],['Grupo 3','Puestos 9 al 12']].map(([g,p]) => (
              <div key={g} className="bg-[var(--surface-1)] border border-[var(--border-subtle)] rounded-lg p-2 text-center">
                <p className="font-bold text-ink text-[10px]">{g}</p>
                <p className="text-ink-faint text-[10px]">{p}</p>
              </div>
            ))}
          </div>
          <p className="text-ink-faint text-[10px] mt-2">Los grupos se adaptan con total naturalidad si el número total de jugadores no es múltiplo de 4 o si hay bajas de última hora.</p>
        </InfoCard>
        <InfoCard title="Flexibilidad de Horarios">
          <p>Los 4 integrantes de cada grupo os ponéis de acuerdo de forma libre para elegir el día y la hora de esa semana que mejor os venga a todos. Una vez decidido, reserváis vuestra pista en el club. Si veis que pasan los días y se os hace difícil poneros de acuerdo, avisad a Patri con tiempo para que os ayude a cuadrar un horario cómodo.</p>
        </InfoCard>
      </CollapsibleChapter>

      {/* 5. Cómo es el Partido Semanal */}
      <CollapsibleChapter title="Cómo es el Partido Semanal" icon={Trophy}>
        <InfoCard title="Formato Dinámico de Rotaciones">
          <p>Cada encuentro semanal reúne a <strong className="text-ink">4 jugadores</strong> para jugar durante <strong className="text-ink">1 hora y 30 minutos</strong> (15 min de calentamiento y 3 bloques de juego de 25 min). Lo divertido de este formato es que jugarás una rotación como compañero de cada uno de los otros tres jugadores, y también te enfrentarás a todos ellos:</p>
          <div className="grid grid-cols-3 gap-2 text-[11px] pt-1 mt-2">
            <div className="bg-[var(--surface-1)] border border-[var(--border-subtle)] rounded-lg p-2 text-center"><p className="font-bold text-ink text-[9px] uppercase tracking-wider">1ª Rotación</p><p className="text-ink-muted mt-0.5">A+B contra C+D</p></div>
            <div className="bg-[var(--surface-1)] border border-[var(--border-subtle)] rounded-lg p-2 text-center"><p className="font-bold text-ink text-[9px] uppercase tracking-wider">2ª Rotación</p><p className="text-ink-muted mt-0.5">A+C contra B+D</p></div>
            <div className="bg-[var(--surface-1)] border border-[var(--border-subtle)] rounded-lg p-2 text-center"><p className="font-bold text-ink text-[9px] uppercase tracking-wider">3ª Rotación</p><p className="text-ink-muted mt-0.5">A+D contra B+C</p></div>
          </div>
        </InfoCard>
        <InfoCard title="Reglas Sencillas de Juego">
          <ul className="list-disc pl-4 space-y-1">
            <li>Jugamos juegos seguidos con <strong className="text-ink">Punto de Oro</strong> en el 40-40 (quien recibe elige el lado).</li>
            <li>El saque inicial se decide a bola al aire. No se cambia de lado de pista para aprovechar cada minuto al máximo.</li>
            <li>Si el tiempo de un bloque de 25 minutos se agota durante un juego en disputa: la pareja que vaya liderando ese juego se lo adjudica. Si hay empate, ¡se juega un Punto de Oro decisivo en el acto!</li>
          </ul>
        </InfoCard>
        <InfoCardDestacado title="Clasificación en el Grupo">
          <p>Al terminar, cada jugador suma los juegos que ha conseguido ganar en sus 3 bloques de forma individual. Así se establece la clasificación del 1º al 4º de vuestro grupo semanal. Si hay empate en juegos ganados, se desempata por:</p>
          <ol className="list-decimal pl-5 space-y-1 mt-1.5">
            <li>Mayor número de juegos totales ganados.</li>
            <li>Mejor diferencia de juegos (juegos ganados menos perdidos).</li>
            <li>La posición que teníais en la escalera antes de empezar el partido esa semana.</li>
          </ol>
        </InfoCardDestacado>
      </CollapsibleChapter>

      {/* 6. Subidas y Bajadas en la Escalera */}
      <CollapsibleChapter title="Subidas y Bajadas en la Escalera" icon={ArrowUpDown}>
        <InfoCard title="Reajuste en el Grupo">
          <p>Tras vuestro partido semanal, vuestros puestos dentro de la escalera se actualizan según cómo hayáis quedado: el 1º se queda con el peldaño más alto asignado a vuestro grupo, el 2º con el segundo, y así hasta el 4º.</p>
          <p className="text-ink-faint text-[10px] italic mt-1.5">Ejemplo: si juegan los que ocupan los puestos 5, 6, 7 y 8; quien quede 1º en el encuentro pasará al puesto 5, el 2º al puesto 6, el 3º al 7 y el 4º al 8.</p>
        </InfoCard>
        <InfoCardDestacado title="¡Ascender de Grupo!">
          <p>Para mantener la liga súper emocionante, el <strong className="text-ink">ganador de cada grupo</strong> (excepto el Grupo 1, que es la cima) sube al <strong className="text-ink">último puesto del grupo que tiene justo encima</strong> para la siguiente semana. A cambio, el que quede último de ese grupo de arriba baja para ocupar el primer peldaño del tuyo. ¡Un intercambio de puestos genial!</p>
          <div className="bg-[var(--surface-1)] border border-[var(--border-subtle)] rounded-xl p-3 text-[10px] mt-2 space-y-1">
            <p className="font-bold text-ink uppercase tracking-wide text-[9px]">Un ejemplo muy claro</p>
            <p>Ranking antes de jugar: Ana(1) Bea(2) Carla(3) Dani(4) Eva(5) Marta(6) Laura(7) Sonia(8)</p>
            <p>Laura gana su partido en el Grupo 2 y Dani queda último en el Grupo 1 →</p>
            <p className="font-bold text-ball-safe">Laura sube al puesto 4 · Dani pasa al puesto 5</p>
          </div>
        </InfoCardDestacado>
        <InfoCard title="La Cima de la Escalera (Grupo 1)">
          <p>El primer grupo representa el Olimpo de la competición. Al no tener ningún grupo por encima, sus jugadores se reordenan entre ellos. Quien logre el primer puesto en el partido del Grupo 1 se corona esa semana como el <strong className="text-ink">número 1 de toda la Liga RACKET</strong>.</p>
        </InfoCard>
      </CollapsibleChapter>

      {/* 7. Los Retos Directos (Desafíos) */}
      <CollapsibleChapter title="Los Retos Directos (Desafíos)" icon={Swords}>
        <InfoCard title="¿Qué es un Reto Directo?">
          <p>Es una alternativa súper divertida al partido semanal que te permite desafiar directamente a un jugador mejor clasificado que tú para arrebatarle el puesto de manera inmediata.</p>
        </InfoCard>
        <InfoCard title="Cómo Lanzar un Reto">
          <p className="mb-2">Para que los retos sean ordenados y amigables, tenemos unas pautas sencillas:</p>
          <ul className="list-disc pl-4 space-y-1">
            <li>Puedes proponer como máximo <strong className="text-ink">un reto cada dos semanas</strong>.</li>
            <li>Solo puedes desafiar a rivales que estén hasta <strong className="text-ink">3 puestos por encima de ti</strong> en la escalera.</li>
            <li>Debes proponerlo con un mínimo de <strong className="text-ink">6 días de antelación</strong> para que el rival pueda organizarse.</li>
            <li>No se puede retar al mismo rival de forma consecutiva sin que pase un tiempo, salvo que os apetezca y la organización lo vea bien.</li>
          </ul>
        </InfoCard>
        <InfoCard title="Cómo se Organiza el Encuentro">
          <p>El <strong className="text-ink">jugador retado tiene la cortesía de elegir el día y la hora</strong> de juego que mejor le vengan; y el retador se encarga de reservar la pista en el club. ¡El partido se juega por parejas! Cada uno de vosotros elegirá libremente a su compañero de juego de entre todos los jugadores inscritos en la liga. Las parejas se mantienen fijas durante todo el partido.</p>
        </InfoCard>
        <InfoCard title="Formato del Reto">
          <ul className="list-disc pl-4 space-y-1">
            <li>Se juega de forma independiente al partido semanal, con una duración de <strong className="text-ink">1 hora y 30 minutos</strong>.</li>
            <li>Es un partido completo al mejor de dos sets con Punto de Oro.</li>
            <li>Si empatáis a un set, se jugará un súper tie-break decisivo a 10 puntos para resolver el ganador.</li>
          </ul>
        </InfoCard>
        <InfoCardDestacado title="¿Cómo se altera la Escalera tras el Reto?">
          <p>Solo se mueven los puestos del <strong className="text-ink">retador y del retado</strong> (vuestros compañeros invitados mantienen sus puestos intactos):</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3">
              <p className="font-bold text-emerald-400 text-[10px] uppercase tracking-wider mb-1">Si gana el equipo del retador</p>
              <p>¡Victoria! El retador sube directo al peldaño del retado. El retado y todos los jugadores que estaban en medio descienden un peldaño.</p>
            </div>
            <div className="bg-[var(--surface-1)] border border-[var(--border-subtle)] rounded-xl p-3">
              <p className="font-bold text-ink-muted text-[10px] uppercase tracking-wider mb-1">Si gana el equipo del retado</p>
              <p>¡Defensa con éxito! La escalera se queda exactamente como estaba y el retado mantiene su peldaño. ¡Bien jugado por ambos!</p>
            </div>
          </div>
        </InfoCardDestacado>
      </CollapsibleChapter>

      {/* 8. Anotar Resultados */}
      <CollapsibleChapter title="Anotar Resultados" icon={BookOpen}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <InfoCard title="Subir el Marcador">
            <p>Al terminar vuestro partido o reto, cualquier jugador implicado puede anotar el marcador en la aplicación. Para que sea definitivo, basta con que un rival pulse el botón de confirmar en su pantalla. Si no se confirma de forma manual en 24 horas, la app lo dará por bueno automáticamente para agilizar el calendario.</p>
          </InfoCard>
          <InfoCard title="Ranking Siempre al Día">
            <p>La Escalera Oficial RACKET se recalcula de forma automática en cuanto se aprueba un marcador. La clasificación de la app es la única válida; si detectas cualquier error de anotación, háznoslo saber y lo solucionamos en un santiamén.</p>
          </InfoCard>
        </div>
      </CollapsibleChapter>

      {/* 9. Convivencia, Cortesía y Fair Play */}
      <CollapsibleChapter title="Convivencia, Cortesía y Fair Play" icon={Gavel}>
        <InfoCard title="Pautas de Convivencia">
          <p>Queremos que la liga destaque por el buen ambiente. Cuando hay faltas de puntualidad, asistencia sin previo aviso o retrasos injustificados, se aplican pequeños reajustes de posiciones en la escalera para que la organización del torneo siga siendo cómoda para todos. Al descender un jugador, los que estaban por debajo <strong className="text-ink">suben un puesto de forma automática</strong> para mantener la escalera completa.</p>
        </InfoCard>

        <div className="overflow-x-auto rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-2)]">
          <table className="w-full text-[11px]">
            <thead className="bg-[var(--surface-1)] text-ink-faint text-[9px] uppercase font-mono tracking-widest">
              <tr>
                <th className="py-2 px-3 text-left font-bold">Situación o Incidencia</th>
                <th className="py-2 px-3 text-right font-bold">Área</th>
                <th className="py-2 px-3 text-right font-bold whitespace-nowrap">Ajuste en la Escalera</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]">
              {[
                ['Retraso injustificado de 10 a 15 minutos','Puntualidad','-1 puesto'],
                ['Retraso de más de 15 minutos sin justificar','Asistencia','Pasa a considerarse no presentado'],
                ['No poder asistir (avisando con más de 24h)','Asistencia','-1 puesto'],
                ['No poder asistir (avisando con menos de 24h)','Asistencia','-2 puestos + coste de pista'],
                ['No presentarse al encuentro sin avisar a nadie','Cortesía','-4 puestos + sin opción de reto + coste de pista'],
                ['Causas de fuerza mayor justificadas','Asistencia','Sin penalización (se busca otra fecha)'],
                ['No responder para concertar el partido en 48h','Organización','-1 puesto'],
                ['Dificultar injustificadamente la celebración del partido','Compañerismo','-2 puestos'],
                ['Falta de iniciativa general para concretar en el grupo (los 4)','Compromiso','-1 puesto a cada jugador del grupo'],
                ['Abandonar el partido a medias sin causa de fuerza mayor','Deportividad','-3 puestos'],
                ['Anotar resultados de forma incorrecta o ficticia','Fair Play','Descenso al último puesto de la escalera'],
                ['Comportamiento antideportivo (según criterio de la organización)','Respeto','Advertencia, descenso de puestos o salida de la liga'],
                ['Acumular 3 incidencias serias en la misma temporada','Compromiso','Baja definitiva de la liga'],
              ].map(([inf, area, sanc]) => (
                <tr key={inf} className="hover:bg-[var(--surface-1)] transition-colors">
                  <td className="py-2 px-3 text-ink-muted">{inf}</td>
                  <td className="py-2 px-3 text-right text-court font-medium">{area}</td>
                  <td className="py-2 px-3 text-right font-bold text-rose-500">{sanc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CollapsibleChapter>

      {/* 10. Premios y Clausura */}
      <CollapsibleChapter title="Premios y Clausura" icon={Trophy}>
        <InfoCard title="¡A por la Victoria!">
          <p>La clasificación final de la temporada será la que marque la escalera en su última actualización de septiembre. El jugador que logre finalizar en el <strong className="text-ink">Puesto 1</strong> se alzará como el campeón absoluto de la Liga Escalera RACKET 2026 y recibirá el gran trofeo de la temporada. ¡También tendremos premios sorpresa, obsequios de consolación y reconocimiento al fair play y la regularidad para celebrar el final de la liga!</p>
        </InfoCard>
      </CollapsibleChapter>

      {/* 11. Privacidad, Datos y Buen Uso */}
      <CollapsibleChapter title="Privacidad, Datos y Buen Uso" icon={Lock}>
        <div className="bg-[var(--surface-2)] border border-[var(--border-subtle)] p-4 rounded-2xl flex items-start gap-3 text-xs leading-relaxed">
          <Lock className="h-4 w-4 text-court shrink-0 mt-0.5" />
          <p className="text-ink-muted"><strong className="text-ink">Protección de Datos y Comunicación:</strong> Al apuntarte a la liga, nos autorizas a facilitar tu teléfono de contacto a tus compañeros de grupo para que os resulte súper sencillo coordinar los horarios de vuestros partidos. Tus datos están totalmente seguros con nosotros, no se utilizarán para ningún otro fin, y os pedimos usar los grupos de comunicación exclusivamente para la liga.</p>
        </div>
        <div className="bg-[var(--surface-2)] border border-[var(--border-subtle)] p-4 rounded-2xl text-[11px] text-ink-faint leading-relaxed">
          <strong className="text-ink-muted">Resolución de dudas:</strong> La interpretación de estas pautas de juego corresponde con total confianza al equipo de organización de RACKET, cuyas decisiones buscarán siempre la justicia deportiva, el juego limpio y mantener el fabuloso ambiente que nos une. ¡Muchísima suerte a todos y a disfrutar en la pista! — RACKET Sport Center, Liga Escalera RACKET® 2026.
        </div>
      </CollapsibleChapter>

    </div>
  );
}
