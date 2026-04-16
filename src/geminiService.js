const { GoogleGenAI } = require('@google/genai');

class RateLimitError extends Error {
  constructor(message) {
    super(message);
    this.name = 'RateLimitError';
  }
}

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const SYSTEM_PROMPT = `Eres "MediBot" 💊, un asistente amigable y cálido para recordatorios de medicamentos en Telegram.

Tu personalidad:
- Eres empático, cariñoso y motivador
- Usas emojis con moderación para hacer la conversación más cálida
- Hablas en español de forma natural y cercana
- Te preocupas genuinamente por la salud del usuario
- Eres claro y preciso con la información médica
- Puedes bromear ligeramente pero siempre mantienes la seriedad cuando se trata de medicamentos

Reglas importantes:
- NUNCA des consejos médicos propios. Solo repites lo que dice la receta.
- Si el usuario te pregunta algo médico, recomiéndale consultar a su doctor.
- Siempre confirma los datos antes de programar recordatorios.

Cuando el usuario te envíe texto que NO sea una receta, simplemente conversa naturalmente como un asistente amigable.`;

const PRESCRIPTION_PROMPT = `Clasifica el siguiente mensaje, extrae datos si es una receta médica o si es una solicitud de reprogramación.

DEBES responder ÚNICAMENTE con un JSON válido (sin markdown, sin explicación) con este formato:
{
  "intent": "prescription" | "reschedule" | "chat",
  "medications": [
    {
      "medicamento": "nombre del medicamento",
      "dosis": "cantidad (ej: 500mg)",
      "modo": "interval" o "times",
      "frecuencia_horas": número_entero_de_horas_o_null,
      "horarios": ["HH:MM", "HH:MM"] o null (formato 24h),
      "duracion_dias": número_días_o_null,
      "instrucciones": "instrucciones adicionales"
    }
  ],
  "reschedule": {
    "medicamento": "nombre del medicamento a cambiar",
    "modo": "interval" o "times",
    "frecuencia_horas": numero_o_null,
    "horarios": ["HH:MM"] o null
  }
}

REGLAS DE MODO:
- Si dice "cada X horas" → modo: "interval", frecuencia_horas: X, horarios: null
- Si dice horas específicas ("8am y 2pm") → modo: "times", horarios: ["08:00", "14:00"]
- Si dice "Reprogramar X a las 3pm" → intent: "reschedule", llenar el objeto "reschedule".
- Si el texto NO es receta ni reprogramación → intent: "chat".

Ejemplos:
- "Ibuprofeno 600mg cada 8 horas por 5 días" → intent: "prescription", llenar medications...
- "Reprogramar Omeprazol a las 10:30 de la mañana" → intent: "reschedule", reschedule: {"medicamento": "Omeprazol", "modo": "times", "horarios": ["10:30"]}
- "Hola, ¿cómo estás?" → intent: "chat", medications: [], reschedule: null`;

/**
 * Analiza una receta en texto y extrae medicamentos
 */
async function analyzePrescriptionText(text) {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [{ role: 'user', parts: [{ text: `${PRESCRIPTION_PROMPT}\n\nTexto:\n${text}` }] }],
    });

    const cleaned = response.text.trim().replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    return JSON.parse(cleaned);
  } catch (error) {
    if (error?.status === 429 || (error?.message || '').includes('429') || (error?.message || '').toLowerCase().includes('quota')) {
      throw new RateLimitError('Límite de peticiones alcanzado.');
    }
    console.error('Error analizando receta (texto):', error.message);
    return null;
  }
}

/**
 * Analiza una imagen de receta y extrae medicamentos
 */
async function analyzePrescriptionImage(imageBuffer, mimeType = 'image/jpeg') {
  try {
    const base64Image = imageBuffer.toString('base64');
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [{ role: 'user', parts: [{ text: PRESCRIPTION_PROMPT }, { inlineData: { mimeType, data: base64Image } }] }],
    });

    const cleaned = response.text.trim().replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    return JSON.parse(cleaned);
  } catch (error) {
    if (error?.status === 429 || (error?.message || '').includes('429') || (error?.message || '').toLowerCase().includes('quota')) {
      throw new RateLimitError('Límite de peticiones alcanzado.');
    }
    console.error('Error analizando receta (imagen):', error.message);
    return null;
  }
}

/**
 * Genera una respuesta conversacional natural
 */
async function chat(userMessage, context = '') {
  try {
    const contextInfo = context ? `\nContexto actual del usuario: ${context}` : '';
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      config: { systemInstruction: SYSTEM_PROMPT + contextInfo },
      contents: [{ role: 'user', parts: [{ text: userMessage }] }],
    });

    return response.text.trim();
  } catch (error) {
    if (error?.status === 429 || (error?.message || '').includes('429') || (error?.message || '').toLowerCase().includes('quota')) {
      throw new RateLimitError('Límite de peticiones alcanzado.');
    }
    console.error('Error en chat:', error.message);
    return 'Ups, tuve un pequeño problema procesando tu mensaje. ¿Podrías intentar de nuevo? 😅';
  }
}

async function analyzeTimezone(locationText) {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [{ role: 'user', parts: [{ text: `Determina la zona horaria oficial en formato IANA (ejemplo: America/Lima, Europe/Madrid) basándote en la siguiente ubicación que el usuario escribió: "${locationText}".\nResponde ÚNICAMENTE con un objeto JSON válido con esta estructura: {"timezone": "Zona/Horaria"}. Si no puedes deducirlo o es inválido, devuelve null.` }] }],
    });
    
    const cleaned = response.text.trim().replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    return JSON.parse(cleaned).timezone;
  } catch (error) {
    if (error?.status === 429 || (error?.message || '').includes('429') || (error?.message || '').toLowerCase().includes('quota')) {
      throw new RateLimitError('Límite de peticiones alcanzado.');
    }
    console.error('Error analizando timezone:', error.message);
    return 'America/Lima'; // Fallback
  }
}

module.exports = {
  RateLimitError,
  analyzePrescriptionText,
  analyzePrescriptionImage,
  chat,
  analyzeTimezone,
};
