import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [
      react(), 
      tailwindcss(),
      {
        name: 'local-api-emulator',
        configureServer(server) {
          server.middlewares.use(async (req, res, next) => {
            if (req.url?.startsWith('/api/gemini/analyze') && req.method === 'POST') {
              let body = '';
              req.on('data', chunk => { body += chunk; });
              req.on('end', async () => {
                try {
                  const { image, categories } = JSON.parse(body);
                  if (!image) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: "Falta a imagem do print." }));
                    return;
                  }

                  // Importação lazy e dinâmica do GoogleGenAI do SDK @google/genai
                  const { GoogleGenAI } = await import("@google/genai");
                  const apiKey = env.GEMINI_API_KEY || process.env.GEMINI_API_KEY || "AIzaSyBewRCSZ-nNqXiaVCRzgpfI1ieWf5QEyq4";
                  
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
                    console.warn("[Emulator] falha gemini-3.5-flash, tentando fallback gemini-2.5-flash-image:", err.message);
                    response = await ai.models.generateContent({
                      model: "gemini-2.5-flash-image",
                      contents: { parts: [imagePart, textPart] }
                    });
                  }

                  const text = response.text;
                  if (!text) {
                    throw new Error("A IA retornou uma resposta vazia.");
                  }

                  const cleanJson = text.replace(/```json/gi, '').replace(/```/gi, '').trim();
                  const extractedData = JSON.parse(cleanJson);

                  res.writeHead(200, { 'Content-Type': 'application/json' });
                  res.end(JSON.stringify({ success: true, data: extractedData }));
                } catch (err: any) {
                  console.error("[Emulator] Erro na requisição do Gemini:", err);
                  res.writeHead(200, { 'Content-Type': 'application/json' });
                  res.end(JSON.stringify({ success: false, error: err.message || 'Erro inesperado' }));
                }
              });
            } else if (req.url?.startsWith('/api/email/send') && req.method === 'POST') {
              let body = '';
              req.on('data', chunk => { body += chunk; });
              req.on('end', async () => {
                try {
                  const { template, to, data } = JSON.parse(body);
                  const { default: handler } = await import('./api/email/send.ts');
                  
                  const mockRes = {
                    status(code: number) {
                      res.writeHead(code, { 'Content-Type': 'application/json' });
                      return this;
                    },
                    json(payload: any) {
                      res.end(JSON.stringify(payload));
                      return this;
                    },
                    setHeader() {},
                    end() {
                      res.end();
                    }
                  };
                  
                  await handler({ method: 'POST', body: { template, to, data } }, mockRes);
                } catch (err: any) {
                  console.error("[Emulator] Erro no emulador de email:", err);
                  res.writeHead(500, { 'Content-Type': 'application/json' });
                  res.end(JSON.stringify({ success: false, error: err.message || 'Erro no emulador de email' }));
                }
              });
            } else if (req.url?.startsWith('/api/health')) {
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ status: "ok" }));
            } else {
              next();
            }
          });
        }
      }
    ],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      port: 3000,
      host: '0.0.0.0',
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
