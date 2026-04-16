require('dotenv').config();
const express = require('express');
const { Telegraf } = require('telegraf');
const { setupBot } = require('./src/bot');
const { startScheduler } = require('./src/scheduler');

// ─── Validación de variables de entorno ───
const requiredEnvVars = [
  'TELEGRAM_BOT_TOKEN',
  'GEMINI_API_KEY',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_KEY',
];

for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    console.error(`❌ Falta la variable de entorno: ${envVar}`);
    process.exit(1);
  }
}

// ─── Express server (health check para Render) ───
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    bot: 'MediBot 💊',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'healthy' });
});

// ─── Iniciar Bot de Telegram ───
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

// Configurar handlers
setupBot(bot);

// Manejo de errores globales
bot.catch((err, ctx) => {
  console.error(`Error en bot para ${ctx.updateType}:`, err);
});

// ─── Arrancar todo ───
async function start() {
  try {
    // Iniciar Express
    app.listen(PORT, () => {
      console.log(`🌐 Servidor Express escuchando en puerto ${PORT}`);
    });

    // Iniciar scheduler de recordatorios
    startScheduler(bot);

    // Iniciar bot (polling)
    await bot.launch();
    console.log('🤖 MediBot iniciado correctamente ✅');
    console.log('💊 Listo para recibir recetas y programar recordatorios');

    // ─── Keep-alive: evita que Render duerma el servicio ───
    startKeepAlive();
  } catch (error) {
    console.error('❌ Error al iniciar:', error);
    process.exit(1);
  }
}

/**
 * Self-ping cada 14 minutos para evitar que Render (free tier)
 * ponga el servicio a dormir tras 15 min de inactividad.
 * Solo se activa si RENDER_EXTERNAL_URL está configurado.
 */
function startKeepAlive() {
  const url = process.env.RENDER_EXTERNAL_URL;
  if (!url) {
    console.log('💤 Keep-alive desactivado (no se detectó RENDER_EXTERNAL_URL)');
    return;
  }

  const INTERVAL_MS = 14 * 60 * 1000; // 14 minutos

  setInterval(async () => {
    try {
      await fetch(`${url}/health`);
      console.log(`🏓 Keep-alive ping OK — ${new Date().toLocaleTimeString()}`);
    } catch (err) {
      console.error('🏓 Keep-alive ping falló:', err.message);
    }
  }, INTERVAL_MS);

  console.log(`🏓 Keep-alive activado: ping cada 14 min a ${url}/health`);
}

// Graceful shutdown
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

start();
