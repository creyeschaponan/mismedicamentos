const { Telegraf, Markup } = require('telegraf');
const { 
  getOrCreateUser, 
  createPrescription, 
  setFirstDose, 
  activateTimesSchedule,
  getActiveMedications, 
  deactivateMedication,
  getPendingMedications 
} = require('./supabase');
const { analyzePrescriptionText, analyzePrescriptionImage, chat } = require('./geminiService');

// Estado temporal de conversaciones (en memoria)
const userStates = new Map();

function setupBot(bot) {
  // ─── /start ───
  bot.start(async (ctx) => {
    try {
      const user = await getOrCreateUser(ctx.chat.id, ctx.from.first_name);
      const name = ctx.from.first_name || 'amigo/a';

      await ctx.replyWithHTML(
        `¡Hola <b>${name}</b>! 👋💊\n\n` +
        `Soy <b>MediBot</b>, tu asistente personal de medicamentos. ` +
        `Estoy aquí para ayudarte a nunca olvidar tus tomas. 😊\n\n` +
        `<b>¿Qué puedo hacer por ti?</b>\n\n` +
        `📋 Envíame una <b>foto</b> o <b>texto</b> de tu receta y la analizo automáticamente\n` +
        `💊 <code>/mis_medicamentos</code> — Ver tus medicamentos activos\n` +
        `❌ <code>/cancelar</code> — Cancelar un recordatorio\n` +
        `❓ <code>/ayuda</code> — Ver todos los comandos\n\n` +
        `<b>Ejemplos de lo que puedo entender:</b>\n` +
        `• <i>"Ibuprofeno 600mg cada 8 horas por 5 días"</i>\n` +
        `• <i>"Paracetamol a las 8am, 2pm y 10pm"</i>\n` +
        `• <i>"Omeprazol en ayunas por 14 días"</i>\n\n` +
        `También puedes <b>hablarme como quieras</b>, entiendo lenguaje natural. ` +
        `¡Prueba enviarme tu receta! 📸`
      );
    } catch (error) {
      console.error('Error en /start:', error);
      await ctx.reply('Ups, hubo un error al iniciar. Intenta de nuevo. 😅');
    }
  });

  // ─── /ayuda ───
  bot.help(async (ctx) => {
    await ctx.replyWithHTML(
      `📖 <b>Comandos disponibles:</b>\n\n` +
      `▸ /start — Reiniciar el bot\n` +
      `▸ /receta — Agregar una nueva receta\n` +
      `▸ /mis_medicamentos — Ver medicamentos activos\n` +
      `▸ /cancelar — Cancelar un recordatorio\n` +
      `▸ /ayuda — Mostrar esta ayuda\n\n` +
      `💡 <b>Formas de enviar tu receta:</b>\n` +
      `📸 Envía una <b>foto</b> de tu receta\n` +
      `✍️ Escribe tu receta como texto\n\n` +
      `<b>Formatos de horario que entiendo:</b>\n` +
      `• "cada 8 horas" → Te aviso cada 8h\n` +
      `• "a las 8am, 2pm y 10pm" → Te aviso a esas horas exactas\n` +
      `• "en ayunas" → Te aviso por la mañana\n` +
      `• "después de cada comida" → 3 recordatorios al día\n\n` +
      `También puedes hablarme de lo que quieras, ¡soy buena compañía! 😊`
    );
  });

  // ─── /receta ───
  bot.command('receta', async (ctx) => {
    await ctx.replyWithHTML(
      `📋 <b>¡Vamos a agregar una receta!</b>\n\n` +
      `Puedes enviarme:\n` +
      `📸 Una <b>foto</b> de tu receta\n` +
      `✍️ O escríbela como <b>texto</b>\n\n` +
      `<b>Ejemplos:</b>\n` +
      `<i>• "Amoxicilina 500mg cada 8 horas por 7 días"</i>\n` +
      `<i>• "Ibuprofeno a las 8am y 8pm por 5 días"</i>\n` +
      `<i>• "Omeprazol en ayunas, Vitamina D después del almuerzo"</i>`
    );
    userStates.set(ctx.chat.id, { state: 'waiting_prescription' });
  });

  // ─── /mis_medicamentos ───
  bot.command('mis_medicamentos', async (ctx) => {
    try {
      const user = await getOrCreateUser(ctx.chat.id, ctx.from.first_name);
      const meds = await getActiveMedications(user.id);

      if (meds.length === 0) {
        await ctx.replyWithHTML(
          `📭 No tienes medicamentos activos en este momento.\n\n` +
          `Envíame una receta (foto o texto) para empezar. 📋`
        );
        return;
      }

      let message = `💊 <b>Tus medicamentos activos:</b>\n\n`;

      for (const med of meds) {
        const nextDose = med.next_dose_at
          ? formatDateTime(new Date(med.next_dose_at))
          : '⏳ Pendiente de configurar';

        message += `▸ <b>${med.name}</b>`;
        if (med.dosage) message += ` (${med.dosage})`;
        message += `\n`;

        // Mostrar modo de programación
        if (med.schedule_mode === 'times' && med.schedule_times) {
          message += `  🕐 Horarios: ${med.schedule_times.join(', ')}\n`;
        } else if (med.frequency_hours) {
          message += `  ⏰ Cada ${med.frequency_hours}h\n`;
        }

        if (med.duration_days) message += `  📅 Por ${med.duration_days} días\n`;
        message += `  📌 Próxima toma: ${nextDose}\n`;

        if (med.ends_at) {
          const daysLeft = Math.ceil(
            (new Date(med.ends_at) - new Date()) / (24 * 60 * 60 * 1000)
          );
          if (daysLeft > 0) {
            message += `  ⏳ Quedan ${daysLeft} día${daysLeft !== 1 ? 's' : ''}\n`;
          }
        }
        message += `\n`;
      }

      await ctx.replyWithHTML(message);
    } catch (error) {
      console.error('Error en /mis_medicamentos:', error);
      await ctx.reply('Error al obtener tus medicamentos. Intenta de nuevo. 😅');
    }
  });

  // ─── /cancelar ───
  bot.command('cancelar', async (ctx) => {
    try {
      const user = await getOrCreateUser(ctx.chat.id, ctx.from.first_name);
      const meds = await getActiveMedications(user.id);

      if (meds.length === 0) {
        await ctx.reply('No tienes medicamentos activos para cancelar. 📭');
        return;
      }

      const buttons = meds.map((med) => [
        Markup.button.callback(
          `❌ ${med.name}${med.dosage ? ` (${med.dosage})` : ''}`,
          `cancel_med_${med.id}`
        ),
      ]);

      buttons.push([Markup.button.callback('↩️ No cancelar nada', 'cancel_none')]);

      await ctx.replyWithHTML(
        `🗑️ <b>¿Qué medicamento quieres cancelar?</b>`,
        Markup.inlineKeyboard(buttons)
      );
    } catch (error) {
      console.error('Error en /cancelar:', error);
      await ctx.reply('Error al cargar tus medicamentos. Intenta de nuevo. 😅');
    }
  });

  // ─── Callback: Cancelar medicamento ───
  bot.action(/cancel_med_(.+)/, async (ctx) => {
    try {
      const medId = ctx.match[1];
      const med = await deactivateMedication(medId);
      await ctx.answerCbQuery('✅ Medicamento cancelado');
      await ctx.editMessageText(
        `✅ Se canceló el recordatorio de <b>${med.name}</b>.\n\n` +
        `Si necesitas reactivarlo, agrega la receta de nuevo.`,
        { parse_mode: 'HTML' }
      );
    } catch (error) {
      console.error('Error cancelando medicamento:', error);
      await ctx.answerCbQuery('Error al cancelar');
    }
  });

  bot.action('cancel_none', async (ctx) => {
    await ctx.answerCbQuery('👍 No se canceló nada');
    await ctx.editMessageText('👍 Perfecto, no se canceló ningún medicamento.');
  });

  // ─── Recibir FOTO ───
  bot.on('photo', async (ctx) => {
    await handlePhotoMessage(ctx);
  });

  // ─── Recibir TEXTO (mensajes sin comando) ───
  bot.on('text', async (ctx) => {
    if (ctx.message.text.startsWith('/')) return;
    await handleTextMessage(ctx);
  });

  // ─── Callbacks: Configurar primera toma ───

  // Modo TIMES: activar directamente con los horarios de la receta
  bot.action(/activate_times_(.+)/, async (ctx) => {
    try {
      const medId = ctx.match[1];
      const med = await activateTimesSchedule(medId);
      await ctx.answerCbQuery('✅ Horarios activados');

      const nextDoseStr = formatDateTime(new Date(med.next_dose_at));
      const timesStr = med.schedule_times.join(', ');
      await ctx.editMessageText(
        `✅ ¡Listo! Horarios de <b>${med.name}</b> activados.\n\n` +
        `🕐 Tomas diarias: <b>${timesStr}</b>\n` +
        `⏰ Próximo recordatorio: <b>${nextDoseStr}</b>`,
        { parse_mode: 'HTML' }
      );
    } catch (error) {
      console.error('Error activando horarios:', error);
      await ctx.answerCbQuery('Error al configurar');
    }
  });

  // Modo INTERVAL: tomar ahora
  bot.action(/set_dose_now_(.+)/, async (ctx) => {
    try {
      const medId = ctx.match[1];
      const now = new Date();
      const med = await setFirstDose(medId, now);
      await ctx.answerCbQuery('✅ Primera toma registrada');
      
      const nextDoseStr = formatDateTime(new Date(med.next_dose_at));
      await ctx.editMessageText(
        `✅ ¡Listo! Primera toma de <b>${med.name}</b> registrada ahora.\n\n` +
        `⏰ Tu próximo recordatorio será: <b>${nextDoseStr}</b>`,
        { parse_mode: 'HTML' }
      );
    } catch (error) {
      console.error('Error configurando primera toma:', error);
      await ctx.answerCbQuery('Error al configurar');
    }
  });

  // Modo INTERVAL: hora personalizada
  bot.action(/set_dose_custom_(.+)/, async (ctx) => {
    try {
      const medId = ctx.match[1];
      userStates.set(ctx.chat.id, { state: 'waiting_custom_time', medId });
      await ctx.answerCbQuery();
      await ctx.editMessageText(
        `🕐 Escríbeme la hora de tu primera toma.\n\n` +
        `<i>Ejemplos: 08:00, 2:30pm, 14:30, 8am</i>`,
        { parse_mode: 'HTML' }
      );
    } catch (error) {
      console.error('Error:', error);
      await ctx.answerCbQuery('Error');
    }
  });
}

// ───────────────────────────────────────────
// Handlers de mensajes
// ───────────────────────────────────────────

async function handlePhotoMessage(ctx) {
  try {
    const user = await getOrCreateUser(ctx.chat.id, ctx.from.first_name);
    await ctx.reply('📸 Analizando tu receta... dame un momento 🔍');

    const photos = ctx.message.photo;
    const photo = photos[photos.length - 1];
    const file = await ctx.telegram.getFile(photo.file_id);
    const fileUrl = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${file.file_path}`;

    const response = await fetch(fileUrl);
    const buffer = Buffer.from(await response.arrayBuffer());

    const mimeType = file.file_path.endsWith('.png') ? 'image/png' : 'image/jpeg';
    const medications = await analyzePrescriptionImage(buffer, mimeType);

    await processMedications(ctx, user, medications, '(imagen de receta)');
  } catch (error) {
    console.error('Error procesando foto:', error);
    await ctx.reply('Error al procesar la foto. ¿Podrías intentar de nuevo o enviarla como texto? 😅');
  }
}

async function handleTextMessage(ctx) {
  const chatId = ctx.chat.id;
  const text = ctx.message.text;
  const currentState = userStates.get(chatId);

  // Si estamos esperando una hora personalizada
  if (currentState?.state === 'waiting_custom_time') {
    await handleCustomTime(ctx, currentState.medId, text);
    return;
  }

  try {
    const user = await getOrCreateUser(chatId, ctx.from.first_name);

    await ctx.reply('🔍 Déjame analizar tu mensaje...');
    const medications = await analyzePrescriptionText(text);

    if (medications === null) {
      // Error en el análisis, usar chat normal
      const activeMeds = await getActiveMedications(user.id);
      const context = buildContext(activeMeds);
      const response = await chat(text, context);
      await ctx.reply(response);
      return;
    }

    if (medications.length === 0) {
      // No es una receta, conversar naturalmente
      const activeMeds = await getActiveMedications(user.id);
      const context = buildContext(activeMeds);
      const response = await chat(text, context);
      await ctx.reply(response);
      return;
    }

    await processMedications(ctx, user, medications, text);
  } catch (error) {
    console.error('Error procesando texto:', error);
    await ctx.reply('Ups, algo salió mal. ¿Podrías intentar de nuevo? 😅');
  }
}

function buildContext(activeMeds) {
  if (activeMeds.length > 0) {
    const medList = activeMeds.map(m => {
      let info = m.name;
      if (m.dosage) info += ` (${m.dosage})`;
      if (m.schedule_mode === 'times' && m.schedule_times) {
        info += ` a las ${m.schedule_times.join(', ')}`;
      } else if (m.frequency_hours) {
        info += ` cada ${m.frequency_hours}h`;
      }
      return info;
    }).join('; ');
    return `Tiene ${activeMeds.length} medicamentos activos: ${medList}`;
  }
  return 'No tiene medicamentos activos actualmente.';
}

async function handleCustomTime(ctx, medId, text) {
  // Soportar varios formatos: 8:00, 08:00, 2:30pm, 2:30PM, 14:30
  const parsed = parseTimeString(text.trim());

  if (parsed === null) {
    await ctx.replyWithHTML(
      `⚠️ No pude entender esa hora. Intenta con estos formatos:\n\n` +
      `<i>Ejemplos: 08:00, 2:30pm, 14:30, 8am, 10:00 PM</i>`
    );
    return;
  }

  try {
    const now = new Date();
    const doseTime = new Date(now);
    doseTime.setHours(parsed.hours, parsed.minutes, 0, 0);

    const med = await setFirstDose(medId, doseTime);
    userStates.delete(ctx.chat.id);

    const nextDoseStr = formatDateTime(new Date(med.next_dose_at));
    const timeStr = `${parsed.hours.toString().padStart(2, '0')}:${parsed.minutes.toString().padStart(2, '0')}`;
    await ctx.replyWithHTML(
      `✅ ¡Perfecto! Primera toma de <b>${med.name}</b> configurada a las <b>${timeStr}</b>\n\n` +
      `⏰ Tu próximo recordatorio será: <b>${nextDoseStr}</b>`
    );
  } catch (error) {
    console.error('Error configurando hora:', error);
    await ctx.reply('Error al configurar la hora. Intenta de nuevo. 😅');
  }
}

/**
 * Parsea un string de hora flexible: "8:00", "08:00", "2:30pm", "2:30 PM", "14:30", "8am"
 */
function parseTimeString(str) {
  str = str.toLowerCase().replace(/\s+/g, '');

  // Formato 24h: 14:30, 08:00
  let match = str.match(/^(\d{1,2}):(\d{2})$/);
  if (match) {
    const h = parseInt(match[1]);
    const m = parseInt(match[2]);
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
      return { hours: h, minutes: m };
    }
  }

  // Formato 12h con minutos: 2:30pm, 2:30am
  match = str.match(/^(\d{1,2}):(\d{2})(am|pm)$/);
  if (match) {
    let h = parseInt(match[1]);
    const m = parseInt(match[2]);
    const period = match[3];
    if (period === 'pm' && h !== 12) h += 12;
    if (period === 'am' && h === 12) h = 0;
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
      return { hours: h, minutes: m };
    }
  }

  // Formato 12h sin minutos: 8am, 2pm
  match = str.match(/^(\d{1,2})(am|pm)$/);
  if (match) {
    let h = parseInt(match[1]);
    const period = match[2];
    if (period === 'pm' && h !== 12) h += 12;
    if (period === 'am' && h === 12) h = 0;
    if (h >= 0 && h <= 23) {
      return { hours: h, minutes: 0 };
    }
  }

  return null;
}

async function processMedications(ctx, user, medications, rawText) {
  if (!medications || medications.length === 0) {
    await ctx.replyWithHTML(
      `🤔 No pude identificar medicamentos en lo que me enviaste.\n\n` +
      `<b>Intenta de nuevo, por ejemplo:</b>\n` +
      `<i>• "Amoxicilina 500mg cada 8 horas por 7 días"</i>\n` +
      `<i>• "Paracetamol a las 8am, 2pm y 10pm"</i>\n` +
      `<i>• "Ibuprofeno 600mg tomar a las 14:00 y 22:00"</i>`
    );
    return;
  }

  // Guardar en base de datos
  const { prescription, medications: savedMeds } = await createPrescription(
    user.id,
    rawText,
    medications
  );

  // Mostrar resumen
  let summary = `✅ <b>¡Receta registrada!</b> Encontré ${savedMeds.length} medicamento${savedMeds.length > 1 ? 's' : ''}:\n\n`;

  for (let i = 0; i < savedMeds.length; i++) {
    const med = savedMeds[i];
    const orig = medications[i];

    summary += `💊 <b>${med.name}</b>`;
    if (med.dosage) summary += ` — ${med.dosage}`;
    summary += `\n`;

    if (med.schedule_mode === 'times' && med.schedule_times) {
      summary += `  🕐 Horarios: ${med.schedule_times.join(', ')}\n`;
    } else if (med.frequency_hours) {
      summary += `  ⏰ Cada ${med.frequency_hours} horas\n`;
    }

    if (med.duration_days) summary += `  📅 Por ${med.duration_days} días\n`;
    if (orig.instrucciones) summary += `  📝 ${orig.instrucciones}\n`;
    summary += `\n`;
  }

  await ctx.replyWithHTML(summary);

  // Preguntar por la primera toma según el modo
  for (const med of savedMeds) {
    if (med.schedule_mode === 'times' && med.schedule_times && med.schedule_times.length > 0) {
      // Modo horarios: ofrecer activar directamente
      const timesStr = med.schedule_times.join(', ');
      await ctx.replyWithHTML(
        `🕐 <b>${med.name}</b> tiene horarios específicos: <b>${timesStr}</b>\n\n` +
        `¿Activo los recordatorios?`,
        Markup.inlineKeyboard([
          [Markup.button.callback('✅ Sí, activar recordatorios', `activate_times_${med.id}`)],
          [Markup.button.callback('🕐 Cambiar horarios', `set_dose_custom_${med.id}`)],
        ])
      );
    } else {
      // Modo intervalo: preguntar primera toma
      await ctx.replyWithHTML(
        `🕐 <b>¿Cuándo tomas tu primera dosis de ${med.name}?</b>`,
        Markup.inlineKeyboard([
          [Markup.button.callback('⏰ Ahora mismo', `set_dose_now_${med.id}`)],
          [Markup.button.callback('🕐 A otra hora', `set_dose_custom_${med.id}`)],
        ])
      );
    }
  }
}

// ───────────────────────────────────────────
// Utilidades
// ───────────────────────────────────────────

function formatDateTime(date) {
  return date.toLocaleString('es-PE', {
    timeZone: 'America/Lima',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

module.exports = { setupBot };
