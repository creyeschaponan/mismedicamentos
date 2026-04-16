<p align="center">
  <img src="https://img.icons8.com/3d-fluency/94/pill.png" alt="MisMedicamentosBot Logo" width="80"/>
</p>

<h1 align="center">MisMedicamentosBot 💊</h1>

<p align="center">
  <b>Tu asistente inteligente de medicamentos en Telegram</b>
</p>

<p align="center">
  <a href="#características">Características</a> •
  <a href="#demo">Demo</a> •
  <a href="#tecnologías">Tecnologías</a> •
  <a href="#instalación">Instalación</a> •
  <a href="#despliegue-en-render">Despliegue</a> •
  <a href="#comandos">Comandos</a> •
  <a href="#arquitectura">Arquitectura</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Node.js-18+-339933?style=for-the-badge&logo=node.js&logoColor=white" alt="Node.js"/>
  <img src="https://img.shields.io/badge/Telegram-Bot%20API-26A5E4?style=for-the-badge&logo=telegram&logoColor=white" alt="Telegram"/>
  <img src="https://img.shields.io/badge/Google-Gemini%20AI-4285F4?style=for-the-badge&logo=google&logoColor=white" alt="Gemini"/>
  <img src="https://img.shields.io/badge/Supabase-PostgreSQL-3FCF8E?style=for-the-badge&logo=supabase&logoColor=white" alt="Supabase"/>
  <img src="https://img.shields.io/badge/Render-Deploy-46E3B7?style=for-the-badge&logo=render&logoColor=white" alt="Render"/>
</p>

---

## 📋 Descripción

**MisMedicamentosBot** es un bot de Telegram que te ayuda a nunca olvidar tus medicamentos. Envíale una **foto** o **texto** de tu receta médica y él se encargará de:

1. 🔍 **Analizar** la receta usando Inteligencia Artificial (Google Gemini)
2. 💊 **Extraer** los medicamentos, dosis y horarios automáticamente
3. ⏰ **Programar** recordatorios para cada toma
4. 🔔 **Enviarte** notificaciones a la hora exacta
5. 🗣️ **Conversar** contigo de forma natural y amigable

---

## ✨ Características

### 🤖 Análisis Inteligente con IA
- Procesa **fotos de recetas** usando visión por computadora (Gemini multimodal)
- Entiende **texto libre** con lenguaje natural
- Extrae automáticamente: medicamento, dosis, frecuencia y duración

### ⏰ Horarios Flexibles
Soporta múltiples formatos de programación:

| Formato | Ejemplo | Modo |
|---------|---------|------|
| Cada N horas | `"cada 8 horas"` | Intervalo |
| Horas específicas | `"a las 8am, 2pm y 10pm"` | Horarios fijos |
| Lenguaje natural | `"en ayunas"`, `"después de cada comida"` | Horarios fijos |
| Una vez al día | `"una vez al día"` | Intervalo (24h) |

### 💬 Conversación Natural
MisMedicamentosBot no es un bot rígido. Puedes hablarle como a un amigo y responderá de forma cálida y empática, siempre enfocado en tu bienestar.

### 📊 Gestión Completa
- 📋 Ver todos tus medicamentos activos
- ❌ Cancelar recordatorios individuales
- 📸 Agregar múltiples recetas en cualquier momento
- 🎉 Notificación al completar un tratamiento

---

## 🛠️ Tecnologías

| Tecnología | Uso |
|------------|-----|
| **[Node.js](https://nodejs.org/)** | Runtime del servidor |
| **[Telegraf](https://telegraf.js.org/)** | Framework para el bot de Telegram |
| **[Google Gemini AI](https://ai.google.dev/)** | Análisis de recetas (texto + imágenes) |
| **[Supabase](https://supabase.com/)** | Base de datos PostgreSQL en la nube |
| **[node-schedule](https://github.com/node-schedule/node-schedule)** | Programación de recordatorios |
| **[Express](https://expressjs.com/)** | Health check para Render |

---

## 🤖 Comandos del Bot

### `/start` — Iniciar el bot
Muestra el mensaje de bienvenida con instrucciones y ejemplos de uso.

```
Usuario: /start
MisMedicamentosBot: ¡Hola Juan! 👋💊
         Soy MisMedicamentosBot, tu asistente personal de medicamentos...
```

---

### `/receta` — Agregar nueva receta
Inicia el flujo para agregar una nueva receta. Puedes enviar una **foto** o escribir el **texto** de tu receta.

```
Usuario: /receta
MisMedicamentosBot: 📋 ¡Vamos a agregar una receta!
         Puedes enviarme:
         📸 Una foto de tu receta
         ✍️ O escríbela como texto
```

**Ejemplos de texto que el bot entiende:**

```
• "Amoxicilina 500mg cada 8 horas por 7 días"
• "Ibuprofeno 600mg a las 8am y 8pm por 5 días"
• "Paracetamol a las 2:00 PM y a las 4:00 PM"
• "Omeprazol en ayunas por 14 días"
• "Vitamina D después del almuerzo, Hierro antes de dormir"
```

Después de analizar la receta, el bot te preguntará:
- **Modo intervalo** ("cada 8 horas"): ¿Cuándo es tu primera toma? → "Ahora mismo" o "A otra hora"
- **Modo horarios** ("a las 8am y 2pm"): ¿Activo los recordatorios? → "Sí, activar"

---

### `/mis_medicamentos` — Ver medicamentos activos
Lista todos tus medicamentos activos con próxima toma, horarios y días restantes.

```
Usuario: /mis_medicamentos
MisMedicamentosBot: 💊 Tus medicamentos activos:

         ▸ Amoxicilina (500mg)
           ⏰ Cada 8h
           📅 Por 7 días
           📌 Próxima toma: 15/04/2026, 02:00 p.m.
           ⏳ Quedan 5 días

         ▸ Paracetamol (500mg)
           🕐 Horarios: 08:00, 14:00, 22:00
           📌 Próxima toma: 15/04/2026, 08:00 a.m.
```

---

### `/cancelar` — Cancelar un recordatorio
Muestra una lista de tus medicamentos activos con botones para cancelar el que elijas.

```
Usuario: /cancelar
MisMedicamentosBot: 🗑️ ¿Qué medicamento quieres cancelar?
         [❌ Amoxicilina (500mg)]
         [❌ Paracetamol (500mg)]
         [↩️ No cancelar nada]
```

---

### `/ayuda` — Mostrar ayuda
Muestra todos los comandos disponibles y los formatos de horario que el bot entiende.

```
Usuario: /ayuda
MisMedicamentosBot: 📖 Comandos disponibles:
         ▸ /start — Reiniciar el bot
         ▸ /receta — Agregar una nueva receta
         ▸ /mis_medicamentos — Ver medicamentos activos
         ▸ /cancelar — Cancelar un recordatorio
         ▸ /ayuda — Mostrar esta ayuda
```

---

### 📸 Enviar foto de receta (sin comando)
Simplemente envía una foto de tu receta y MisMedicamentosBot la analizará automáticamente con Gemini Vision.

```
Usuario: [envía foto de receta]
MisMedicamentosBot: 📸 Analizando tu receta... dame un momento 🔍
         ✅ ¡Receta registrada! Encontré 2 medicamentos:
         💊 Ibuprofeno — 600mg
           ⏰ Cada 8 horas
           📅 Por 5 días
         💊 Omeprazol — 20mg
           🕐 Horarios: 07:00
```

---

### 💬 Conversación natural (sin comando)
Escribe lo que quieras y MisMedicamentosBot responderá de forma natural y amigable. Sabe sobre tus medicamentos activos y te puede dar contexto.

```
Usuario: Hola, ¿cómo estás?
MisMedicamentosBot: ¡Hola! 😊 Estoy muy bien, gracias por preguntar.
         ¿En qué te puedo ayudar hoy? ¿Necesitas agregar
         alguna receta o ver tus medicamentos?

Usuario: ¿Cuántas pastillas me faltan?
MisMedicamentosBot: Según tus registros, tienes 2 medicamentos activos:
         Amoxicilina y Paracetamol. Si necesitas más detalle
         usa /mis_medicamentos 💊
```

---

### ⏰ Recordatorio automático
Cuando es hora de tomar tu medicamento, MisMedicamentosBot te envía un mensaje:

```
MisMedicamentosBot: ⏰ ¡Hora de tu medicamento!
         Hola Juan 👋
         💊 Amoxicilina — 500mg
         🕐 Son las 14:00
         📅 Te quedan 5 días de tratamiento
         ¡No olvides tomarlo! Tu salud es lo primero 💪
```

Al completar un tratamiento:
```
MisMedicamentosBot: 🎉 ¡Tratamiento completado!
         Has terminado tu tratamiento de Amoxicilina.
         ¡Felicidades por ser constante! 💪
         Recuerda consultar con tu doctor si tienes alguna duda.
```

---

### 📋 Resumen de comandos

| Comando | Descripción |
|---------|-------------|
| `/start` | 👋 Mensaje de bienvenida e instrucciones |
| `/receta` | 📋 Agregar una nueva receta (foto o texto) |
| `/mis_medicamentos` | 💊 Ver medicamentos activos y próximas tomas |
| `/cancelar` | ❌ Cancelar el recordatorio de un medicamento |
| `/ayuda` | ❓ Mostrar comandos y formatos soportados |
| *Enviar foto* | 📸 Analizar foto de receta automáticamente |
| *Escribir texto* | ✍️ Analizar texto o conversar con el bot |

---

## 🏗️ Arquitectura

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Telegram   │────▸│   Telegraf    │────▸│  Gemini AI   │
│   (Usuario)  │◂────│   (Bot)      │◂────│  (Análisis)  │
└──────────────┘     └──────┬───────┘     └──────────────┘
                           │
                    ┌──────┴───────┐
                    │              │
              ┌─────▾─────┐ ┌─────▾──────┐
              │ Supabase  │ │ Scheduler  │
              │ (Datos)   │ │ (Cron 1m)  │
              └───────────┘ └────────────┘
```

### Flujo principal

1. **Usuario** envía foto/texto de receta al bot
2. **Telegraf** recibe el mensaje y lo envía a **Gemini AI**
3. **Gemini** analiza la receta y devuelve los medicamentos en JSON
4. Los medicamentos se guardan en **Supabase**
5. El **Scheduler** revisa cada minuto si hay tomas pendientes
6. Cuando es hora, envía un recordatorio al usuario por **Telegram**

---

## 📄 Licencia

Este proyecto es de uso personal. Desarrollado por [@creyeschaponan](https://github.com/creyeschaponan).

---

<p align="center">
  Hecho con ❤️ y mucha ☕</b>
</p>
