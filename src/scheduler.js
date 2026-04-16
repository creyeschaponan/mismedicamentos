const schedule = require('node-schedule');
const { getMedicationsDueNow, advanceNextDose } = require('./supabase');

let checkJob = null;

/**
 * Inicia el scheduler que revisa medicamentos pendientes cada minuto
 */
function startScheduler(bot) {
  console.log('⏰ Scheduler de recordatorios iniciado');

  // Revisar cada minuto si hay medicamentos pendientes
  checkJob = schedule.scheduleJob('* * * * *', async () => {
    try {
      const dueMeds = await getMedicationsDueNow();

      for (const med of dueMeds) {
        if (!med.users) continue;

        const chatId = med.users.chat_id;
        const firstName = med.users.first_name || 'amigo/a';

        const message = formatReminderMessage(med, firstName);

        try {
          await bot.telegram.sendMessage(chatId, message, { parse_mode: 'HTML' });
          console.log(`💊 Recordatorio enviado: ${med.name} → chat ${chatId}`);
        } catch (sendError) {
          console.error(`Error enviando recordatorio a ${chatId}:`, sendError.message);
        }

        // Avanzar a la próxima dosis
        const updated = await advanceNextDose(med.id);
        if (updated && !updated.is_active) {
          try {
            await bot.telegram.sendMessage(
              chatId,
              `🎉 <b>¡Tratamiento completado!</b>\n\n` +
              `Has terminado tu tratamiento de <b>${med.name}</b>. ` +
              `¡Felicidades por ser constante! 💪\n\n` +
              `Recuerda consultar con tu doctor si tienes alguna duda.`,
              { parse_mode: 'HTML' }
            );
          } catch (err) {
            console.error('Error enviando mensaje de fin de tratamiento:', err.message);
          }
        }
      }
    } catch (error) {
      console.error('Error en scheduler:', error.message);
    }
  });
}

/**
 * Formatea el mensaje de recordatorio
 */
function formatReminderMessage(med, firstName) {
  const now = new Date();
  const hours = now.getHours().toString().padStart(2, '0');
  const minutes = now.getMinutes().toString().padStart(2, '0');

  let message = `⏰ <b>¡Hora de tu medicamento!</b>\n\n`;
  message += `Hola ${firstName} 👋\n\n`;
  message += `💊 <b>${med.name}</b>`;

  if (med.dosage) {
    message += ` — ${med.dosage}`;
  }

  message += `\n🕐 Son las ${hours}:${minutes}\n`;

  if (med.ends_at) {
    const endsAt = new Date(med.ends_at);
    const daysLeft = Math.ceil((endsAt - now) / (24 * 60 * 60 * 1000));
    if (daysLeft > 0) {
      message += `📅 Te quedan <b>${daysLeft} día${daysLeft !== 1 ? 's' : ''}</b> de tratamiento\n`;
    }
  }

  message += `\n<i>¡No olvides tomarlo! Tu salud es lo primero 💪</i>`;

  return message;
}

/**
 * Detiene el scheduler
 */
function stopScheduler() {
  if (checkJob) {
    checkJob.cancel();
    checkJob = null;
    console.log('⏰ Scheduler detenido');
  }
}

module.exports = { startScheduler, stopScheduler };
