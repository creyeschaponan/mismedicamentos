const { GoogleGenAI } = require('@google/genai');

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

const PRESCRIPTION_PROMPT = `Analiza el siguiente texto/imagen de una receta médica y extrae los medicamentos.

DEBES responder ÚNICAMENTE con un JSON válido (sin markdown, sin backticks, sin explicación) con este formato:
[
  {
    "medicamento": "nombre del medicamento",
    "dosis": "cantidad y unidad (ej: 500mg, 1 tableta)",
    "modo": "interval" o "times",
    "frecuencia_horas": número_entero_de_horas_entre_tomas (solo si modo es "interval"),
    "horarios": ["HH:MM", "HH:MM"] (solo si modo es "times", en formato 24h),
    "duracion_dias": número_de_días_del_tratamiento_o_null,
    "instrucciones": "instrucciones adicionales si las hay"
  }
]

REGLAS DE MODO:
- Si dice "cada X horas" → modo: "interval", frecuencia_horas: X, horarios: null
- Si dice "X veces al día" sin especificar horas → modo: "interval", calcular frecuencia_horas (ej: 3 veces al día = 8 horas)
- Si dice horas específicas como "a las 8am y 2pm" o "tomar a las 14:00 y 20:00" → modo: "times", frecuencia_horas: null, horarios: ["08:00", "14:00"]
- Si dice "en la mañana y en la noche" → modo: "times", horarios: ["08:00", "20:00"]
- Si dice "antes de dormir" → modo: "times", horarios: ["22:00"]
- Si dice "en ayunas" o "al despertar" → modo: "times", horarios: ["07:00"]
- Si dice "después de cada comida" → modo: "times", horarios: ["08:00", "13:00", "20:00"]
- Si no se especifica frecuencia ni horario → modo: "interval", frecuencia_horas: 24 (asumir 1 vez al día)

IMPORTANTE: 
- Los horarios SIEMPRE en formato 24 horas (HH:MM)
- 2:00 PM = "14:00", 8:00 AM = "08:00"
- Si el texto NO es una receta médica o no contiene medicamentos, responde exactamente con: []

Ejemplos completos:
- "Ibuprofeno 600mg cada 8 horas por 5 días" → {"modo": "interval", "frecuencia_horas": 8, "horarios": null}
- "Paracetamol a las 8am, 2pm y 10pm" → {"modo": "times", "frecuencia_horas": null, "horarios": ["08:00", "14:00", "22:00"]}
- "Amoxicilina 500mg tome a las 7:00, 15:00 y 23:00" → {"modo": "times", "frecuencia_horas": null, "horarios": ["07:00", "15:00", "23:00"]}
- "Omeprazol en ayunas" → {"modo": "times", "frecuencia_horas": null, "horarios": ["07:00"]}
- "Vitamina D una vez al día" → {"modo": "interval", "frecuencia_horas": 24, "horarios": null}`;

/**
 * Analiza una receta en texto y extrae medicamentos
 */
async function analyzePrescriptionText(text) {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        {
          role: 'user',
          parts: [{ text: `${PRESCRIPTION_PROMPT}\n\nTexto de la receta:\n${text}` }],
        },
      ],
    });

    const responseText = response.text.trim();
    
    // Limpiar posible markdown
    const cleaned = responseText
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim();

    const medications = JSON.parse(cleaned);
    return Array.isArray(medications) ? medications : [];
  } catch (error) {
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
      contents: [
        {
          role: 'user',
          parts: [
            { text: PRESCRIPTION_PROMPT },
            {
              inlineData: {
                mimeType: mimeType,
                data: base64Image,
              },
            },
          ],
        },
      ],
    });

    const responseText = response.text.trim();
    
    const cleaned = responseText
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim();

    const medications = JSON.parse(cleaned);
    return Array.isArray(medications) ? medications : [];
  } catch (error) {
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
      config: {
        systemInstruction: SYSTEM_PROMPT + contextInfo,
      },
      contents: [
        {
          role: 'user',
          parts: [{ text: userMessage }],
        },
      ],
    });

    return response.text.trim();
  } catch (error) {
    console.error('Error en chat:', error.message);
    return 'Ups, tuve un pequeño problema procesando tu mensaje. ¿Podrías intentar de nuevo? 😅';
  }
}

module.exports = {
  analyzePrescriptionText,
  analyzePrescriptionImage,
  chat,
};
