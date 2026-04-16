const { Telegraf, Markup } = require('telegraf');
const { 
  getOrCreateUser, 
  createPrescription, 
  setFirstDose, 
  activateTimesSchedule,
  getActiveMedications, 
  deactivateMedication,
  deactivateAllMedications,
  updateMedicationSchedule,
  getPendingMedications 
} = require('./supabase');
const { analyzePrescriptionText, analyzePrescriptionImage, chat, RateLimitError } = require('./geminiService');

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
        `🗑️ <code>/borrar_todo</code> — Borrar absolutamente todos tus recordatorios\n` +
        `❓ <code>/ayuda</code> — Ver todos los comandos\n\n` +
        `<b>Ejemplos de lo que puedo entender:</b>\n` +
        `• <i>"Ibuprofeno 600mg cada 8 horas por 5 días"</i>\n` +
        `• <i>"Reprogramar el Ibuprofeno a las 3:30 de la tarde"</i>\n\n` +
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
      `▸ /borrar_todo — Borrar todos los recordatorios\n` +
      `▸ /ayuda — Mostrar esta ayuda\n\n` +
      `💡 <b>Formas de enviar tu receta o reprogramar:</b>\n` +
      `📸 Envía una <b>foto</b> de tu receta\n` +
      `✍️ Escribe tu receta o lo que deseas, ej: "Reprogramar Paracetamol a las 8pm"`
    );
  });

  // ─── /receta ───
  bot.command('receta', async (ctx) => {
    await ctx.replyWithHTML(
      `📋 <b>¡Vamos a agregar una receta!</b>\n\n` +
      `Puedes enviarme una <b>foto</b> de tu receta o escríbela como <b>texto</b>.`
    );
    userStates.set(ctx.chat.id, { state: 'waiting_prescription' });
  });

  // ─── /borrar_todo ───
  bot.command('borrar_todo', async (ctx) => {
    try {
      const user = await getOrCreateUser(ctx.chat.id, ctx.from.first_name);
      await deactivateAllMedications(user.id);
      userStates.delete(ctx.chat.id);
      await ctx.reply('🗑️ ✅ Todos tus medicamentos y recordatorios han sido eliminados por completo.');
    } catch(err) {
      console.error('Error en /borrar_todo:', err);
      await ctx.reply('Error al intentar borrar todo.');
    }
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

        if (med.schedule_mode === 'times' && med.schedule_times) {
          message += `  🕐 Horarios: ${med.schedule_times.join(', ')}\n`;
        } else if (med.frequency_hours) {
          message += `  ⏰ Cada ${med.frequency_hours}h\n`;
        }

        if (med.duration_days) message += `  📅 Por ${med.duration_days} días\n`;
        message += `  📌 Próxima toma: ${nextDose}\n\n`;
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
      // Si el usuario está a medio confirmar algo progresivo
      if (userStates.has(ctx.chat.id)) {
        userStates.delete(ctx.chat.id);
        await ctx.reply('🚫 Se ha cancelado la acción actual.');
        return;
      }

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
      await promptNextMedication(ctx, ctx.chat.id);
    } catch (error) {
      console.error('Error activando horarios:', error);
      await ctx.answerCbQuery('Error al configurar');
    }
  });

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
      await promptNextMedication(ctx, ctx.chat.id);
    } catch (error) {
      console.error('Error configurando primera toma:', error);
      await ctx.answerCbQuery('Error al configurar');
    }
  });

  bot.action(/set_dose_custom_(.+)/, async (ctx) => {
    try {
      const medId = ctx.match[1];
      const previousState = userStates.get(ctx.chat.id) || {};
      userStates.set(ctx.chat.id, { ...previousState, state: 'waiting_custom_time', currentMedId: medId });
      await ctx.answerCbQuery();
      await ctx.editMessageText(
        `🕐 Escríbeme la hora deseada (ej: 08:00, 2:30pm, 14:30, 8am).`,
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
    const result = await analyzePrescriptionImage(buffer, mimeType);

    if (!result || !result.medications || result.medications.length === 0) {
       await ctx.reply('No pude encontrar medicamentos en esta imagen.');
       return;
    }

    await processMedications(ctx, user, result.medications, '(imagen de receta)');
  } catch (error) {
    if (error.name === 'RateLimitError') {
      await ctx.reply('⚠️ El sistema está recibiendo muchos mensajes a la vez (límite de velocidad por ser capa gratuita). Por favor, aguarda un par de minutos e inténtalo de nuevo. 🙏');
      return;
    }
    console.error('Error procesando foto:', error);
    await ctx.reply('Error al procesar la foto. ¿Podrías intentar de nuevo o enviarla como texto? 😅');
  }
}

async function handleTextMessage(ctx) {
  const chatId = ctx.chat.id;
  const text = ctx.message.text;
  const currentState = userStates.get(chatId);

  // Si estamos esperando una hora personalizada para un medicamento
  if (currentState?.state === 'waiting_custom_time') {
    await handleCustomTime(ctx, currentState.currentMedId, text);
    return;
  }

  try {
    const user = await getOrCreateUser(chatId, ctx.from.first_name);
    await ctx.reply('🔍 Déjame analizar tu mensaje...');
    
    const result = await analyzePrescriptionText(text);

    if (!result || result.intent === 'chat' || (result.intent === 'prescription' && (!result.medications || result.medications.length === 0))) {
      // Chat normal
      const activeMeds = await getActiveMedications(user.id);
      const context = buildContext(activeMeds);
      const response = await chat(text, context);
      await ctx.reply(response);
      return;
    }

    if (result.intent === 'reschedule' && result.reschedule) {
      await handleReschedule(ctx, user, result.reschedule);
      return;
    }

    await processMedications(ctx, user, result.medications, text);
  } catch (error) {
    if (error.name === 'RateLimitError') {
      await ctx.reply('⚠️ El sistema está recibiendo muchos mensajes a la vez (límite alcanzado). Por favor, intenta enviarme el mensaje en un par de minutos. 🙏');
      return;
    }
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

async function handleReschedule(ctx, user, rescheduleData) {
  const activeMeds = await getActiveMedications(user.id);
  const targetMed = activeMeds.find(m => m.name.toLowerCase().includes(rescheduleData.medicamento.toLowerCase()));
  
  if (!targetMed) {
    await ctx.replyWithHTML(`⚠️ No encontré ningún medicamento activo llamado <b>${rescheduleData.medicamento}</b> para reprogramar.`);
    return;
  }
  
  try {
    const updated = await updateMedicationSchedule(targetMed.id, rescheduleData.modo, rescheduleData.frecuencia_horas, rescheduleData.horarios);
    await ctx.replyWithHTML(`✅ Horario de <b>${updated.name}</b> actualizado correctamente.\n⏰ Próximo recordatorio: <b>${formatDateTime(new Date(updated.next_dose_at))}</b>`);
  } catch(e) {
    console.error('Error intentando reprogramar:', e);
    await ctx.reply('Error interno al intentar reprogramar tu medicamento.');
  }
}

async function handleCustomTime(ctx, medId, text) {
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
    
    // Restaurar estado progresivo para continuar con el siguiente si hay
    const currentState = userStates.get(ctx.chat.id);
    if (currentState && currentState.medsToConfirm) {
      userStates.set(ctx.chat.id, { state: 'confirming_medications', medsToConfirm: currentState.medsToConfirm });
    } else {
      userStates.delete(ctx.chat.id);
    }

    const nextDoseStr = formatDateTime(new Date(med.next_dose_at));
    const timeStr = `${parsed.hours.toString().padStart(2, '0')}:${parsed.minutes.toString().padStart(2, '0')}`;
    await ctx.replyWithHTML(
      `✅ ¡Perfecto! Primera toma de <b>${med.name}</b> configurada a las <b>${timeStr}</b>\n\n` +
      `⏰ Tu próximo recordatorio será: <b>${nextDoseStr}</b>`
    );
    
    await promptNextMedication(ctx, ctx.chat.id);
  } catch (error) {
    console.error('Error configurando hora:', error);
    await ctx.reply('Error al configurar la hora. Intenta de nuevo. 😅');
  }
}

function parseTimeString(str) {
  str = str.toLowerCase().replace(/\s+/g, '');

  let match = str.match(/^(\d{1,2}):(\d{2})$/);
  if (match) {
    const h = parseInt(match[1]);
    const m = parseInt(match[2]);
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59) return { hours: h, minutes: m };
  }

  match = str.match(/^(\d{1,2}):(\d{2})(am|pm)$/);
  if (match) {
    let h = parseInt(match[1]);
    const m = parseInt(match[2]);
    const period = match[3];
    if (period === 'pm' && h !== 12) h += 12;
    if (period === 'am' && h === 12) h = 0;
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59) return { hours: h, minutes: m };
  }

  match = str.match(/^(\d{1,2})(am|pm)$/);
  if (match) {
    let h = parseInt(match[1]);
    const period = match[2];
    if (period === 'pm' && h !== 12) h += 12;
    if (period === 'am' && h === 12) h = 0;
    if (h >= 0 && h <= 23) return { hours: h, minutes: 0 };
  }
  return null;
}

async function processMedications(ctx, user, medications, rawText) {
  if (!medications || medications.length === 0) {
    await ctx.replyWithHTML(
      `🤔 No pude identificar medicamentos en lo que me enviaste.\n\n` +
      `<b>Intenta decirme algo como:</b>\n` +
      `<i>• "Amoxicilina 500mg cada 8 horas"</i>`
    );
    return;
  }

  const { medications: savedMeds } = await createPrescription(user.id, rawText, medications);

  let summary = `✅ Encontré ${savedMeds.length} medicamento${savedMeds.length > 1 ? 's' : ''}:\n\n`;
  for (let i = 0; i < savedMeds.length; i++) {
    const med = savedMeds[i];
    const orig = medications[i];
    summary += `💊 <b>${med.name}</b>`;
    if (med.dosage) summary += ` — ${med.dosage}\n`; else summary += `\n`;
    if (med.schedule_mode === 'times' && med.schedule_times) summary += `  🕐 Horarios: ${med.schedule_times.join(', ')}\n`;
    else if (med.frequency_hours) summary += `  ⏰ Cada ${med.frequency_hours} horas\n`;
  }
  await ctx.replyWithHTML(summary);

  // Iniciar configuración progresiva (un medicamento y luego el siguiente)
  userStates.set(ctx.chat.id, { state: 'confirming_medications', medsToConfirm: [...savedMeds] });
  await promptNextMedication(ctx, ctx.chat.id);
}

async function promptNextMedication(ctx, chatId) {
  const currentState = userStates.get(chatId);
  if (!currentState || (currentState.state !== 'confirming_medications')) return;

  const { medsToConfirm } = currentState;
  
  if (medsToConfirm.length === 0) {
    // Hemos terminado 
    userStates.delete(chatId);
    await ctx.reply('🎉 ¡Listo! Todos tus medicamentos han quedado programados confirmados.');
    return;
  }

  const med = medsToConfirm.shift(); // Extraer el primero de la cola
  // Actualizamos el estado con la lista reducida de pendientes
  userStates.set(chatId, { state: 'confirming_medications', medsToConfirm });

  if (med.schedule_mode === 'times' && med.schedule_times && med.schedule_times.length > 0) {
    const timesStr = med.schedule_times.join(', ');
    await ctx.replyWithHTML(
      `🕐 <b>${med.name}</b> tiene horarios específicos: <b>${timesStr}</b>\n\n¿Están bien estos horarios para activarlos ahora?`,
      Markup.inlineKeyboard([
        [Markup.button.callback('✅ Sí, activar recordatorios', `activate_times_${med.id}`)],
        [Markup.button.callback('🕐 Quienes cambiarlos', `set_dose_custom_${med.id}`)],
      ])
    );
  } else {
    await ctx.replyWithHTML(
      `🕐 <b>¿Cuándo tomas la siguiente dosis de ${med.name}?</b>`,
      Markup.inlineKeyboard([
        [Markup.button.callback('⏰ Ahora mismo', `set_dose_now_${med.id}`)],
        [Markup.button.callback('🕐 Escribiré una hora exacta', `set_dose_custom_${med.id}`)],
      ])
    );
  }
}

function formatDateTime(date) {
  return date.toLocaleString('es-PE', {
    timeZone: 'America/Lima',
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
  });
}

module.exports = { setupBot, parseTimeString };
