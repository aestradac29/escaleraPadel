# 🎾 Liga Escalera Racket 2026

Un gestor moderno y en tiempo real para la **Liga Escalera Racket de pádel**, diseñado para la administración de jugadores, partidos, retos y clasificaciones dinámicas de acuerdo con el Reglamento Oficial 2026.

---

## 🚀 Características Principales

- **Clasificación en Tiempo Real (Ranking):** Clasificación interactiva basada en puntos y posiciones de la escalera con soporte para divisiones (Masculina/Femenina) y categorías.
- **Sistema de Retos Inteligente (Challenges):** Permite a los jugadores retar a otros oponentes, seleccionar compañeros de juego, y registrar partidos directamente en el sistema conforme a la normativa oficial de la liga.
- **Gestión de Partidos (1vs1 y 2vs2):** Registro e historial de partidos jugados, con flujos de aprobación y reporte de resultados directos por los participantes para evitar cargas administrativas.
- **Panel de Administración Completo:** Control total para los organizadores, permitiendo la edición de jugadores, aplicación de sanciones, gestión de jornadas oficiales, cierre de temporadas y ascensos/descensos.
- **Interfaz Fluida y Adaptable:** Diseño moderno y receptivo construido con React, Tailwind CSS y animaciones fluidas con Motion, con soporte completo para temas claro y oscuro (con persistencia).

---

## 🛠️ Stack Tecnológico

- **Frontend:** [React](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/)
- **Build Tool:** [Vite](https://vite.dev/)
- **Estilos:** [Tailwind CSS v4](https://tailwindcss.com/) & [Lucide Icons](https://lucide.dev/)
- **Animaciones:** [Motion](https://motion.dev/)
- **Base de Datos & Auth:** [Firebase Firestore](https://firebase.google.com/docs/firestore) y [Firebase Authentication](https://firebase.google.com/docs/auth)

---

## 📂 Estructura del Proyecto

```bash
├── assets/                       # Recursos estáticos e imágenes del proyecto
├── firebase-applet-config.json   # Configuración de Firebase para desarrollo local
├── firebase-blueprint.json       # Esquema y blueprint de base de datos
├── firestore.rules               # Reglas de seguridad robustas para Firestore
├── src/
│   ├── App.tsx                   # Punto de entrada principal y orquestador del estado
│   ├── firebase.ts               # Inicialización y configuración dinámica de Firebase (Dev/Prod)
│   ├── types.ts                  # Definiciones de tipos TypeScript para todo el modelo de datos
│   ├── components/               # Componentes interactivos de UI
│   │   ├── AdminPanel.tsx        # Gestión administrativa, sanciones e importaciones
│   │   ├── AuthModal.tsx         # Inicio de sesión y registro de participantes
│   │   ├── ChallengeModal.tsx    # Modal de creación de nuevos retos oficiales
│   │   ├── EditPlayerModal.tsx   # Modal de edición de perfiles por el administrador
│   │   ├── InfoPanel.tsx         # Visualización de reglamentos y manual de la liga
│   │   ├── Navbar.tsx            # Navegación responsive y selector de temas
│   │   ├── OnboardingForm.tsx    # Formulario para nuevos jugadores
│   │   ├── Partidos.tsx          # Gestión, visualización y aprobación de partidos
│   │   ├── ProfileModal.tsx      # Edición de datos personales del perfil del jugador
│   │   ├── Ranking.tsx           # Tabla de clasificación interactiva de la escalera
│   │   └── RetosPanel.tsx        # Panel dinámico con los retos activos e históricos
│   └── utils/                    # Funciones auxiliares y algoritmos de cálculo
│       ├── escalera.ts           # Lógica matemática de posiciones de la escalera
│       ├── excelMatches.ts       # Utilidades para exportación/importación de Excel
│       ├── generateGroupMatches.tsx # Generador automatizado de partidos de grupo
│       ├── notifications.ts      # Utilidades para control de notificaciones
│       └── points.ts             # Algoritmo de cálculo de puntos de los partidos
```

---

## 🔒 Seguridad y Protección de Datos en Git

Se ha realizado una auditoría completa del repositorio para garantizar que **no se exponga ningún dato crítico ni credenciales privadas** en el historial de Git:

1. **Gestión de variables de entorno (`.gitignore`):** El archivo `.gitignore` está configurado de manera estricta para ignorar cualquier archivo de entorno sensible (como `.env`, `.env.local`, `.env.production`) mientras conserva únicamente el archivo libre de secretos `.env.example`.
2. **Exclusión de llaves privadas:** No se encuentra ninguna clave de cuenta de servicio de Firebase (Service Account) ni llaves privadas de backend dentro del repositorio.
3. **Credenciales de Firebase Client:** Las credenciales que residen en `firebase-applet-config.json` y `src/firebase.ts` son **claves públicas del cliente**. Estas claves son necesarias para inicializar la conexión del navegador con Firebase y son seguras de exponer, ya que no otorgan acceso privilegiado.
4. **Reglas de Seguridad Robustas (`firestore.rules`):** La seguridad del sistema no depende del secreto de las claves de cliente, sino de las **reglas de seguridad a nivel de base de datos**. El archivo `firestore.rules` implementa verificaciones sumamente rigurosas que validan:
   - Que los usuarios normales solo puedan editar sus propios perfiles (nombre, apellidos, teléfono) y no su puntuación ni posición.
   - Que los participantes de un partido solo puedan enviar resultados para aprobación mutua.
   - Restricciones estrictas de administrador mediante validación de correo electrónico de confianza (`alvaroestradacabello@gmail.com`) y el rol explícito en la colección de `admins`.

---

## ⚙️ Instalación y Configuración Local

Sigue estos pasos para levantar el entorno de desarrollo localmente:

### 1. Clonar el repositorio
```bash
git clone <url-del-repositorio>
cd liga-escalera-racket
```

### 2. Instalar dependencias
Se recomienda utilizar `npm` para la instalación de los paquetes requeridos:
```bash
npm install
```

### 3. Configurar Firebase
Para el desarrollo local, el sistema utiliza por defecto el archivo `firebase-applet-config.json` que contiene la configuración del entorno sandbox. Si deseas conectar tu propia instancia de desarrollo de Firebase, puedes crear un archivo `.env` en la raíz (que está ignorado automáticamente por Git) y rellenarlo según tus necesidades.

### 4. Ejecutar el servidor de desarrollo
Inicia el entorno de desarrollo interactivo de Vite:
```bash
npm run dev
```
El servidor se levantará en el puerto `3000` (accesible en `http://localhost:3000`).

### 5. Compilar para Producción
Para compilar y optimizar la aplicación para su distribución:
```bash
npm run build
```
Los archivos optimizados se guardarán en la carpeta `dist/`.

---

## 📄 Licencia

Este proyecto es privado para uso de la **Liga Escalera Racket de pádel**. Todos los derechos reservados.
