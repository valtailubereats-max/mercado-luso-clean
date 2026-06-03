import { GoogleGenAI } from "@google/genai";

export default async function handler(req: any, res: any) {
  // Configuração rápida de CORS para segurança e compatibilidade
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const { image, categories } = req.body;
    if (!image) {
      return res.status(400).json({ error: "Falta a imagem do print." });
    }

    // Usar process.env.GEMINI_API_KEY no servidor
    const apiKey = process.env.GEMINI_API_KEY || "AIzaSyBewRCSZ-nNqXiaVCRzgpfI1ieWf5QEyq4";
    const ai = new GoogleGenAI({
      apiKey: apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });

    const base64Data = image.includes(",") ? image.split(",")[1] : image;
    
    const prompt = `Você é um assistente especializado em extrair informações de anúncios de classificados.
Extraia as seguintes informações da imagem fornecida e retorne APENAS um objeto JSON válido:
- title: Título do produto
- price: Preço (apenas o número)
- description: Descrição detalhada
- city: Escolha a mais próxima de: Todas, Lisboa, Porto, Braga, Coimbra, Faro, Funchal, Ponta Delgada
- category: Escolha a mais próxima de: ${categories ? categories.join(', ') : 'Outros'}

Estrutura JSON esperada:
{
  "title": "string",
  "price": number,
  "description": "string",
  "city": "string",
  "category": "string"
}`;

    const imagePart = {
      inlineData: {
        mimeType: "image/jpeg",
        data: base64Data
      }
    };

    const textPart = {
      text: prompt
    };

    let response;
    try {
      response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: { parts: [imagePart, textPart] },
        config: {
          responseMimeType: "application/json"
        }
      });
    } catch (err: any) {
      console.warn("Generativa com gemini-3.5-flash falhou, tentando fallback gemini-2.5-flash-image:", err.message);
      response = await ai.models.generateContent({
        model: "gemini-2.5-flash-image",
        contents: { parts: [imagePart, textPart] }
      });
    }

    const text = response.text;
    if (!text) {
      throw new Error("A IA retornou uma resposta sem texto.");
    }

    const cleanJson = text.replace(/```json/gi, '').replace(/```/gi, '').trim();
    const extractedData = JSON.parse(cleanJson);

    return res.status(200).json({ success: true, data: extractedData });
  } catch (err: any) {
    console.error("Erro na análise do Gemini na Vercel Function:", err);
    return res.status(200).json({ 
      success: false, 
      error: `Falha na IA no servidor: ${err.message || 'Verifique a chave de API'}` 
    });
  }
}
