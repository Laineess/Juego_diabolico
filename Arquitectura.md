E# Guía de Arquitectura y Planificación: Shooter Web Multiplayer para Torneo

Este documento define la arquitectura técnica, el stack tecnológico, los flujos de comunicación y la estructura de directorios para desarrollar e implementar un shooter en línea optimizado para un torneo de 15+ personas, desplegado en **Amazon EC2**.

---

## 1. Arquitectura del Sistema

La arquitectura implementa un **servidor autoritativo** para mantener la equidad competitiva y prevenir trampas (*cheating*). La instancia de AWS EC2 centraliza toda la lógica de juego, procesamiento de impactos y estados de la partida.

```text
[ Jugador 1 (Cliente Web) ] ---\
[ Jugador 2 (Cliente Web) ] ----> ( WebSockets / TCP ) ----> [ Servidor en AWS EC2 ] 
[      ... 15+ Jugadores  ] ---/                                     |
                                                                     v
                                                            [ Base de Datos MySQL ]
                                                          (Puntuaciones y Torneo)
```

* **Frontend (Cliente Web):** Renderizado en 3D mediante Three.js, captura de eventos de teclado/mouse y comunicación en tiempo real.
* **Backend / Servidor de Juego (AWS EC2):** Procesa los inputs a una tasa fija (Ticks), resuelve colisiones y emite actualizaciones globales.
* **Persistencia (MySQL):** Almacena perfiles, registros de bajas/muertes y la tabla de posiciones oficial del torneo.

---

## 2. Stack Tecnológico

### **Frontend (Cliente)**
* **HTML5 / CSS3 / JavaScript (ES6+):** Estructura y lógica de la interfaz y controles.
* **Three.js:** Motor gráfico 3D para el renderizado del entorno, armas y avatares.
* **Socket.io-client:** Cliente de WebSockets para la sincronización con el servidor.

### **Backend (Servidor)**
* **Node.js + Express:** Servidor HTTP y entorno de ejecución.
* **Socket.io:** Gestión de conexiones bidireccionales en tiempo real de baja latencia.
* **MySQL:** Base de datos relacional para datos persistentes del torneo.

### **Infraestructura AWS**
* **Amazon EC2 (`t3.medium` o `c6i.large`):** Instancia principal con IP elástica y puertos abiertos para HTTP y WebSockets.
* **Amazon S3 + CloudFront (Opcional para producción):** Distribución de archivos estáticos del cliente web.

---

## 3. Flujos de Comunicación

1. **Fase de Conexión:**
   * El cliente carga la interfaz estática.
   * El usuario ingresa su nickname y establece una conexión persistente vía **Socket.io** con la IP Elástica de la instancia EC2.
2. **Bucle del Juego (Game Loop / Ticks):**
   * El cliente envía continuamente las acciones de movimiento y eventos de disparo (`player:input`).
   * El servidor en EC2 procesa las posiciones, valida la lógica, actualiza el estado y transmite la posición de todos los jugadores (`game:update`) a 30 FPS.
3. **Cierre de Partida:**
   * Al finalizar el tiempo o alcanzar el límite de bajas, el servidor calcula el puntaje final y ejecuta una consulta SQL para actualizar la tabla de clasificación en la base de datos.

---

## 4. Estructura de Directorios del Proyecto

```text
web-fps-tournament/
│
├── server/                      # Código del Backend (Corre en EC2)
│   ├── config/
│   │   └── db.js                # Conexión a MySQL
│   ├── models/
│   │   └── playerModel.js       # Consultas SQL para usuarios y puntajes
│   ├── game/
│   │   └── gameState.js         # Lógica central del juego, posiciones y colisiones
│   ├── server.js                # Punto de entrada de Node.js + Socket.io
│   └── package.json             # Dependencias del backend
│
├── client/                      # Código del Frontend (Cliente web)
│   ├── public/
│   │   └── index.html           # Estructura HTML principal
│   ├── src/
│   │   ├── css/
│   │   │   └── style.css        # Estilos de la UI (HUD, mira, marcador)
│   │   ├── js/
│   │   │   ├── network.js       # Gestión de Socket.io
│   │   │   ├── player.js        # Controles y movimiento
│   │   │   └── renderer.js      # Escena y renderizado con Three.js
│   │   └── main.js              # Inicializador del cliente
│   └── package.json             # Dependencias del frontend
│
├── database/
│   └── schema.sql               # Script SQL para tablas del torneo
│
├── .env                         # Variables de entorno
└── README.md                    # Documentación de despliegue en EC2
```

---

## 5. Próximos Pasos Operativos

1. Inicializar el repositorio con la estructura de carpetas definida.
2. Configurar el esquema de la base de datos (`schema.sql`).
3. Desarrollar el servidor básico de WebSockets en Node.js y verificar la conexión con un cliente HTML simple.
4. Integrar Three.js en el cliente para el movimiento básico en un plano 3D.
5. Desplegar la aplicación en la instancia de Amazon EC2 configurando los *Security Groups* correspondientes.