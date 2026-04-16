<p align="center">
  <img src="https://img.icons8.com/3d-fluency/94/pill.png" alt="MediBot Logo" width="80"/>
</p>

<h1 align="center">MediBot 💊</h1>

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

**MediBot** es un bot de Telegram que te ayuda a nunca olvidar tus medicamentos. Envíale una **foto** o **texto** de tu receta médica y él se encargará de:

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
MediBot no es un bot rígido. Puedes hablarle como a un amigo y responderá de forma cálida y empática, siempre enfocado en tu bienestar.

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

## 🗂️ Estructura del Proyecto

```
📦 mismedicamentos/
├── 📄 index.js              # Entry point: Express + Bot startup
├── 📁 src/
│   ├── 📄 bot.js            # Handlers de comandos y mensajes de Telegram
│   ├── 📄 geminiService.js  # Integración con Google Gemini AI
│   ├── 📄 scheduler.js      # Motor de recordatorios (cada minuto)
│   └── 📄 supabase.js       # Capa de datos (CRUD medicamentos)
├── 📄 package.json
├── 📄 render.yaml           # Configuración de despliegue en Render
├── 📄 .env                  # Variables de entorno (no versionado)
└── 📄 .gitignore
```

---

## 🚀 Instalación

### Prerrequisitos

- [Node.js](https://nodejs.org/) v18 o superior
- Un bot de Telegram creado con [@BotFather](https://t.me/BotFather)
- Una clave de [Google AI Studio](https://aistudio.google.com/apikey) (Gemini API)
- Un proyecto en [Supabase](https://supabase.com/)

### 1. Clonar el repositorio

```bash
git clone git@github.com:creyeschaponan/mismedicamentos.git
cd mismedicamentos
```

### 2. Instalar dependencias

```bash
npm install
```

### 3. Configurar variables de entorno

Crea un archivo `.env` en la raíz del proyecto:

```env
# Telegram
TELEGRAM_BOT_TOKEN=tu_token_de_bot_aquí

# Google Gemini AI
GEMINI_API_KEY=tu_api_key_de_gemini_aquí

# Supabase
SUPABASE_URL=https://tu-proyecto.supabase.co
SUPABASE_SERVICE_KEY=tu_service_role_key_aquí

# Server
PORT=3000
```

### 4. Configurar la base de datos

Ejecuta las siguientes migraciones en el **SQL Editor** de Supabase:

```sql
-- Tabla de usuarios
CREATE TABLE public.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id bigint UNIQUE NOT NULL,
  first_name text,
  timezone text DEFAULT 'America/Lima',
  created_at timestamptz DEFAULT now()
);

-- Tabla de recetas
CREATE TABLE public.prescriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  raw_text text,
  created_at timestamptz DEFAULT now()
);

-- Tabla de medicamentos
CREATE TABLE public.medications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prescription_id uuid REFERENCES public.prescriptions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  dosage text,
  frequency_hours integer,
  duration_days integer,
  first_dose_at timestamptz,
  next_dose_at timestamptz,
  ends_at timestamptz,
  is_active boolean DEFAULT true,
  schedule_times text[] DEFAULT NULL,
  schedule_mode text DEFAULT 'interval' CHECK (schedule_mode IN ('interval', 'times')),
  created_at timestamptz DEFAULT now()
);

-- Índices
CREATE INDEX idx_medications_user_active ON public.medications(user_id, is_active) WHERE is_active = true;
CREATE INDEX idx_medications_next_dose ON public.medications(next_dose_at) WHERE is_active = true;
CREATE INDEX idx_users_chat_id ON public.users(chat_id);

-- RLS
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prescriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access" ON public.users FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON public.prescriptions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON public.medications FOR ALL USING (true) WITH CHECK (true);
```

### 5. Iniciar el bot

```bash
node index.js
```

Si todo está correcto verás:

```
⏰ Scheduler de recordatorios iniciado
🌐 Servidor Express escuchando en puerto 3000
🤖 MediBot iniciado correctamente ✅
```

---

## 🌐 Despliegue en Render

### Opción 1: Con `render.yaml` (automático)

1. Sube tu repositorio a **GitHub**
2. Ve a [Render Dashboard](https://dashboard.render.com/)
3. Clic en **New** → **Blueprint**
4. Conecta tu repositorio — Render detectará el `render.yaml` automáticamente
5. Configura las **variables de entorno** en el panel de Render

### Opción 2: Manual

1. Ve a [Render Dashboard](https://dashboard.render.com/)
2. Clic en **New** → **Web Service**
3. Conecta tu repositorio de GitHub
4. Configura:

| Campo | Valor |
|-------|-------|
| **Runtime** | Node |
| **Build Command** | `npm install` |
| **Start Command** | `node index.js` |
| **Plan** | Free |

5. En **Environment Variables**, agrega:
   - `TELEGRAM_BOT_TOKEN`
   - `GEMINI_API_KEY`
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_KEY`

6. Clic en **Deploy** 🚀

> ⚠️ **Nota:** En el plan gratuito de Render, el servicio se "duerme" tras 15 minutos de inactividad. Esto puede provocar que los recordatorios se retrasen hasta que el servicio despierte. Considera un plan Starter ($7/mes) para servicio continuo 24/7.

---

## 🤖 Comandos

| Comando | Descripción |
|---------|-------------|
| `/start` | Mensaje de bienvenida e instrucciones |
| `/receta` | Agregar una nueva receta médica |
| `/mis_medicamentos` | Ver medicamentos activos y próximas tomas |
| `/cancelar` | Cancelar el recordatorio de un medicamento |
| `/ayuda` | Mostrar todos los comandos disponibles |

### Uso sin comandos

También puedes interactuar directamente:
- 📸 **Envía una foto** de tu receta
- ✍️ **Escribe tu receta** como texto
- 💬 **Conversa** con el bot sobre cualquier tema de salud

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
  Hecho con ❤️ y mucha ☕ | Powered by <b>Google Gemini AI</b>
</p>
