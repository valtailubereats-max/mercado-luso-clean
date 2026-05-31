import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { GoogleGenAI, Type } from "@google/genai";
import { motion, AnimatePresence } from 'motion/react';
import { Upload, Sparkles, ChevronLeft, Check, AlertCircle, RefreshCcw } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';
import { CITIES } from '../types';

const AdminImport = () => {
  const { categories } = useSettings();
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const [image, setImage] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setImage(reader.result as string);
        setResult(null);
        setError(null);
      };
      reader.readAsDataURL(file);
    }
  };

  const analyzePrint = async () => {
    if (!image) return;

    setAnalyzing(true);
    setError(null);

    try {
      const apiKey = (import.meta as any).env.VITE_GEMINI_API_KEY;
      console.log('Chave Gemini detetada:', !!apiKey);
      if (!apiKey) {
        throw new Error('A chave de API do Gemini (VITE_GEMINI_API_KEY) não está configurada no seu ficheiro .env.');
      }
      const ai = new GoogleGenAI({ apiKey });
      
      const base64Data = image.split(',')[1];
      
      const prompt = `Você é um assistente especializado em extrair informações de anúncios de classificados a partir de imagens (prints).
Extraia as seguintes informações da imagem fornecida:
- Título do produto
- Preço (apenas o número, em Euros)
- Descrição detalhada (incluindo estado do produto, se mencionado)
- Localização (Cidade/Região) - Tente mapear para uma destas cidades: ${CITIES.join(', ')}. Se não encontrar, use 'Todas'.
- Categoria - Tente mapear para uma destas categorias: ${categories.join(', ')}. Se não encontrar, use 'Outros'.

Retorne APENAS um objeto JSON com as seguintes chaves:
{
  "title": string,
  "price": number,
  "description": string,
  "city": string,
  "category": string
}`;

      const response = await ai.models.generateContent({
        model: "gemini-1.5-flash",
        contents: [
          {
            parts: [
              { text: prompt },
              { inlineData: { mimeType: "image/jpeg", data: base64Data } }
            ]
          }
        ],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              price: { type: Type.NUMBER },
              description: { type: Type.STRING },
              city: { type: Type.STRING },
              category: { type: Type.STRING }
            },
            required: ["title", "price", "description", "city", "category"]
          }
        }
      });

      const extractedData = JSON.parse(response.text);
      setResult(extractedData);
    } catch (err: any) {
      console.error('Erro na análise do Gemini:', err);
      const errMsg = err?.message || '';
      let friendlyMessage = 'Não foi possível analisar a imagem. Verifique se é um print claro de um anúncio.';
      
      if (err?.status === 403 || err?.status === 400 || errMsg.toLowerCase().includes('key') || errMsg.toLowerCase().includes('api')) {
        friendlyMessage = `⚠️ Erro com a Chave de API do Gemini: ${errMsg || 'Chave inválida, expirada ou não autorizada'}. Por favor configure-a corretamente no ficheiro .env.`;
      } else if (errMsg) {
        friendlyMessage = `⚠️ Não conseguimos processar o print: ${errMsg}`;
      }
      
      setError(friendlyMessage);
    } finally {
      setAnalyzing(false);
    }
  };

  const confirmAndRedirect = () => {
    if (!result) return;
    navigate('/create-ad', { state: { prefill: result } });
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-black text-slate-900 tracking-tight">Importar via IA</h1>
        <p className="text-slate-500 font-medium">Extraia informações de anúncios automaticamente a partir de imagens.</p>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white p-8 rounded-3xl shadow-xl border border-slate-100"
      >
        <div className="flex items-center gap-3 mb-8">
          <div className="w-12 h-12 bg-indigo-100 rounded-2xl flex items-center justify-center text-indigo-600">
            <Sparkles size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Importador Inteligente</h1>
            <p className="text-slate-500 text-sm">Use a IA para preencher anúncios a partir de prints</p>
          </div>
        </div>

        <div className="space-y-8">
          {/* Upload Section */}
          <div 
            onClick={() => !analyzing && fileInputRef.current?.click()}
            className={`aspect-video rounded-3xl border-2 border-dashed flex flex-col items-center justify-center cursor-pointer transition-all overflow-hidden relative group ${
              image ? 'border-indigo-400' : 'border-slate-200 hover:border-indigo-400 bg-slate-50'
            } ${analyzing ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            {image ? (
              <>
                <img src={image} alt="Print" className="w-full h-full object-contain" />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <p className="text-white font-bold flex items-center gap-2">
                    <RefreshCcw size={20} /> Alterar Imagem
                  </p>
                </div>
              </>
            ) : (
              <div className="text-center p-8">
                <div className="w-16 h-16 bg-white rounded-2xl shadow-sm border border-slate-100 flex items-center justify-center mx-auto mb-4 text-slate-400 group-hover:text-indigo-600 transition-colors">
                  <Upload size={32} />
                </div>
                <p className="text-slate-600 font-bold">Clique para subir o print do anúncio</p>
                <p className="text-slate-400 text-xs mt-1">PNG, JPG ou JPEG</p>
              </div>
            )}
            <input 
              ref={fileInputRef}
              type="file" 
              accept="image/*" 
              onChange={handleImageChange} 
              className="hidden" 
            />
          </div>

          {image && !result && !analyzing && (
            <button
              onClick={analyzePrint}
              className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-bold text-lg hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-100 flex items-center justify-center gap-2"
            >
              <Sparkles size={20} />
              Analisar Print com IA
            </button>
          )}

          {analyzing && (
            <div className="text-center py-8 space-y-4">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
                className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full mx-auto"
              />
              <p className="text-indigo-600 font-bold animate-pulse">A IA está a ler o seu print...</p>
            </div>
          )}

          {error && (
            <div className="bg-rose-50 border border-rose-100 p-4 rounded-2xl flex items-center gap-3 text-rose-600">
              <AlertCircle size={20} />
              <p className="text-sm font-medium">{error}</p>
            </div>
          )}

          {/* Result Section */}
          <AnimatePresence>
            {result && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="space-y-6 pt-6 border-t border-slate-100"
              >
                <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <Check className="text-emerald-500" size={20} />
                  Dados Extraídos
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Título</p>
                    <p className="text-slate-900 font-bold">{result.title}</p>
                  </div>
                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Preço</p>
                    <p className="text-indigo-600 font-black text-lg">{result.price} €</p>
                  </div>
                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Cidade</p>
                    <p className="text-slate-900 font-bold">{result.city}</p>
                  </div>
                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Categoria</p>
                    <p className="text-slate-900 font-bold">{result.category}</p>
                  </div>
                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 md:col-span-2">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Descrição</p>
                    <p className="text-slate-600 text-sm line-clamp-3">{result.description}</p>
                  </div>
                </div>

                <button
                  onClick={confirmAndRedirect}
                  className="w-full bg-emerald-500 text-white py-4 rounded-2xl font-bold text-lg hover:bg-emerald-600 transition-all shadow-xl shadow-emerald-100"
                >
                  Confirmar e Criar Anúncio
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
};

export default AdminImport;
