// Mock de GoogleGenAI
const mockGenerateContent = jest.fn();

jest.mock('@google/genai', () => ({
  GoogleGenAI: jest.fn().mockImplementation(() => ({
    models: {
      generateContent: mockGenerateContent
    }
  }))
}));

const { RateLimitError, analyzePrescriptionText, chat } = require('../src/geminiService');

describe('Gemini Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should parse prescription intent correctly', async () => {
    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify({
        intent: "prescription",
        medications: [{ medicamento: "Ibuprofeno", modo: "interval", frecuencia_horas: 8 }]
      })
    });

    const result = await analyzePrescriptionText('Ibuprofeno 600mg cada 8 horas');
    expect(result.intent).toBe("prescription");
    expect(result.medications[0].medicamento).toBe("Ibuprofeno");
  });

  it('should parse reschedule intent correctly', async () => {
    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify({
        intent: "reschedule",
        reschedule: { medicamento: "Paracetamol", modo: "times", horarios: ["20:00"] }
      })
    });

    const result = await analyzePrescriptionText('Reprogramar el paracetamol a las 8pm');
    expect(result.intent).toBe("reschedule");
    expect(result.reschedule.medicamento).toBe("Paracetamol");
  });

  it('should throw RateLimitError on 429 status', async () => {
    const quotaError = new Error('Quota exceeded');
    quotaError.status = 429;
    mockGenerateContent.mockRejectedValueOnce(quotaError);

    await expect(analyzePrescriptionText('test')).rejects.toThrow(RateLimitError);
  });

  it('should throw RateLimitError on quota message', async () => {
    const error = new Error('Rate limit quota reach');
    mockGenerateContent.mockRejectedValueOnce(error);

    await expect(chat('hola')).rejects.toThrow(RateLimitError);
  });
});
