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
  } catch (error) {
    console.error('❌ Error al iniciar:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

start();
