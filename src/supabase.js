const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

/**
 * Obtiene o crea un usuario a partir del chat de Telegram
 */
async function getOrCreateUser(chatId, firstName) {
  const { data: existing } = await supabase
    .from('users')
    .select('*')
    .eq('chat_id', chatId)
    .single();

  if (existing) return existing;

  const { data: newUser, error } = await supabase
    .from('users')
    .insert({ chat_id: chatId, first_name: firstName })
    .select()
    .single();

  if (error) throw error;
  return newUser;
}

/**
 * Crea una receta y sus medicamentos asociados
 */
async function createPrescription(userId, rawText, medications) {
  // Crear la receta
  const { data: prescription, error: prescError } = await supabase
    .from('prescriptions')
    .insert({ user_id: userId, raw_text: rawText })
    .select()
    .single();

  if (prescError) throw prescError;

  // Crear los medicamentos
  const medsToInsert = medications.map(med => ({
    prescription_id: prescription.id,
    user_id: userId,
    name: med.medicamento,
    dosage: med.dosis || null,
    frequency_hours: med.frecuencia_horas || null,
    duration_days: med.duracion_dias || null,
    schedule_mode: med.modo || 'interval',
    schedule_times: med.horarios || null,
    is_active: true,
  }));

  const { data: meds, error: medsError } = await supabase
    .from('medications')
    .insert(medsToInsert)
    .select();

  if (medsError) throw medsError;
  return { prescription, medications: meds };
}

/**
 * Programa la primera toma de un medicamento según su modo
 */
async function setFirstDose(medicationId, firstDoseAt) {
  const firstDose = new Date(firstDoseAt);

  const { data: med } = await supabase
    .from('medications')
    .select('*')
    .eq('id', medicationId)
    .single();

  if (!med) throw new Error('Medicamento no encontrado');

  const endsAt = med.duration_days
    ? new Date(firstDose.getTime() + med.duration_days * 24 * 60 * 60 * 1000)
    : null;

  let nextDose;

  if (med.schedule_mode === 'times' && med.schedule_times && med.schedule_times.length > 0) {
    // Modo horarios específicos: calcular la próxima toma después de ahora
    nextDose = calculateNextScheduledTime(med.schedule_times, firstDose);
  } else if (med.frequency_hours) {
    // Modo intervalo: siguiente toma = primera + frecuencia
    nextDose = new Date(firstDose.getTime() + med.frequency_hours * 60 * 60 * 1000);
  } else {
    // Fallback: 24 horas
    nextDose = new Date(firstDose.getTime() + 24 * 60 * 60 * 1000);
  }

  const { data, error } = await supabase
    .from('medications')
    .update({
      first_dose_at: firstDose.toISOString(),
      next_dose_at: nextDose.toISOString(),
      ends_at: endsAt ? endsAt.toISOString() : null,
    })
    .eq('id', medicationId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Configura un medicamento con horarios específicos y programa la primera toma automáticamente
 */
async function activateTimesSchedule(medicationId) {
  const { data: med } = await supabase
    .from('medications')
    .select('*')
    .eq('id', medicationId)
    .single();

  if (!med || !med.schedule_times || med.schedule_times.length === 0) {
    throw new Error('Medicamento sin horarios configurados');
  }

  const now = new Date();
  const nextDose = calculateNextScheduledTime(med.schedule_times, now);

  const endsAt = med.duration_days
    ? new Date(now.getTime() + med.duration_days * 24 * 60 * 60 * 1000)
    : null;

  const { data, error } = await supabase
    .from('medications')
    .update({
      first_dose_at: now.toISOString(),
      next_dose_at: nextDose.toISOString(),
      ends_at: endsAt ? endsAt.toISOString() : null,
    })
    .eq('id', medicationId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Calcula la próxima hora programada basándose en una lista de horarios diarios
 */
function calculateNextScheduledTime(scheduleTimes, fromDate) {
  const now = fromDate || new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  // Convertir horarios a minutos y ordenar
  const timeSlots = scheduleTimes
    .map(t => {
      const [h, m] = t.split(':').map(Number);
      return { hours: h, minutes: m, totalMinutes: h * 60 + m, original: t };
    })
    .sort((a, b) => a.totalMinutes - b.totalMinutes);

  // Buscar el próximo horario hoy
  for (const slot of timeSlots) {
    if (slot.totalMinutes > currentMinutes) {
      const next = new Date(now);
      next.setHours(slot.hours, slot.minutes, 0, 0);
      return next;
    }
  }

  // Si ya pasaron todos los horarios de hoy, programar el primero de mañana
  const firstSlot = timeSlots[0];
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(firstSlot.hours, firstSlot.minutes, 0, 0);
  return tomorrow;
}

/**
 * Obtiene medicamentos activos de un usuario
 */
async function getActiveMedications(userId) {
  const { data, error } = await supabase
    .from('medications')
    .select('*, prescriptions(raw_text)')
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('next_dose_at', { ascending: true, nullsFirst: false });

  if (error) throw error;
  return data || [];
}

/**
 * Obtiene medicamentos que necesitan recordatorio ahora
 */
async function getMedicationsDueNow() {
  const now = new Date();

  const { data, error } = await supabase
    .from('medications')
    .select('*, users(chat_id, first_name)')
    .eq('is_active', true)
    .not('next_dose_at', 'is', null)
    .lte('next_dose_at', now.toISOString());

  if (error) throw error;
  return data || [];
}

/**
 * Actualiza la próxima dosis después de enviar un recordatorio
 */
async function advanceNextDose(medicationId) {
  const { data: med } = await supabase
    .from('medications')
    .select('*')
    .eq('id', medicationId)
    .single();

  if (!med) return null;

  let nextDose;

  if (med.schedule_mode === 'times' && med.schedule_times && med.schedule_times.length > 0) {
    // Modo horarios: calcular la próxima hora programada
    const currentNextDose = new Date(med.next_dose_at);
    nextDose = calculateNextScheduledTime(med.schedule_times, currentNextDose);
    
    // Si la siguiente hora calculada es la misma (porque acabamos de pasar), avanzar 1 minuto y recalcular
    if (nextDose.getTime() <= currentNextDose.getTime()) {
      const adjusted = new Date(currentNextDose.getTime() + 60000);
      nextDose = calculateNextScheduledTime(med.schedule_times, adjusted);
    }
  } else if (med.frequency_hours) {
    // Modo intervalo
    nextDose = new Date(
      new Date(med.next_dose_at).getTime() + med.frequency_hours * 60 * 60 * 1000
    );
  } else {
    // Fallback: 24h
    nextDose = new Date(
      new Date(med.next_dose_at).getTime() + 24 * 60 * 60 * 1000
    );
  }

  // Si ya pasó la fecha de finalización, desactivar
  if (med.ends_at && nextDose > new Date(med.ends_at)) {
    const { data } = await supabase
      .from('medications')
      .update({ is_active: false, next_dose_at: null })
      .eq('id', medicationId)
      .select()
      .single();
    return data;
  }

  const { data, error } = await supabase
    .from('medications')
    .update({ next_dose_at: nextDose.toISOString() })
    .eq('id', medicationId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Desactiva un medicamento
 */
async function deactivateMedication(medicationId) {
  const { data, error } = await supabase
    .from('medications')
    .update({ is_active: false, next_dose_at: null })
    .eq('id', medicationId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Obtiene medicamentos pendientes de configurar primera toma
 */
async function getPendingMedications(userId) {
  const { data, error } = await supabase
    .from('medications')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true)
    .is('first_dose_at', null);

  if (error) throw error;
  return data || [];
}

/**
 * Desactiva todos los medicamentos activos de un usuario
 */
async function deactivateAllMedications(userId) {
  const { data, error } = await supabase
    .from('medications')
    .update({ is_active: false, next_dose_at: null })
    .eq('user_id', userId)
    .eq('is_active', true)
    .select();

  if (error) throw error;
  return data;
}

/**
 * Actualiza el horario de un medicamento existente (reprogramación total)
 */
async function updateMedicationSchedule(medicationId, mode, frequencyHours, scheduleTimes) {
  const { data: med } = await supabase
    .from('medications')
    .select('*')
    .eq('id', medicationId)
    .single();

  if (!med) throw new Error('Medicamento no encontrado');

  const now = new Date();
  let nextDose;
  
  if (mode === 'times' && scheduleTimes && scheduleTimes.length > 0) {
    nextDose = calculateNextScheduledTime(scheduleTimes, now);
  } else if (frequencyHours) {
    nextDose = new Date(now.getTime() + frequencyHours * 60 * 60 * 1000);
  } else {
    nextDose = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  }

  const { data, error } = await supabase
    .from('medications')
    .update({
      schedule_mode: mode || med.schedule_mode,
      frequency_hours: frequencyHours || null,
      schedule_times: scheduleTimes || null,
      next_dose_at: nextDose.toISOString()
    })
    .eq('id', medicationId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

module.exports = {
  supabase,
  getOrCreateUser,
  createPrescription,
  setFirstDose,
  activateTimesSchedule,
  getActiveMedications,
  getMedicationsDueNow,
  advanceNextDose,
  deactivateMedication,
  deactivateAllMedications,
  updateMedicationSchedule,
  getPendingMedications,
  calculateNextScheduledTime,
};
