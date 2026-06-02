import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
// Alteramos para a biblioteca oficial do Google
import { GoogleGenerativeAI } from "@google/generative-ai";
import { motion, AnimatePresence } from 'motion/react';
import { Upload, Sparkles, Check, AlertCircle, RefreshCcw } from 'lucide-react';
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
      // Chamamos o nosso endpoint do servidor, que possui a API KEY real configurada no backend
      const response = await fetch('/api/gemini/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ image, categories })
      });

      if (!response.ok) {
        throw new Error('Falha de rede ao conectar com o serviço de IA.');
      }

      const serverResult = await response.json();
      if (serverResult.success && serverResult.data) {
        setResult(serverResult.data);
      } else {
        throw new Error(serverResult.error || 'Não foi possível extrair os dados do print.');
      }
    } catch (err: any) {
      console.warn('Servidor indisponível ou erro no endpoint, a tentar processar localmente no cliente:', err);
      
      try {
        // Puxa a chave e o modelo diretamente conforme instrução
        const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
      const modelName = import.meta.env.VITE_GEMINI_MODEL || "gemini-1.5-flash";
       
        if (!apiKey) {
          throw new Error('A chave de API do Gemini não foi encontrada no ficheiro .env.');
        }

        // Inicialização correta seguindo a documentação atual do Google
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ 
          model: modelName
        });
        
        const base64Data = image.split(',')[1];
        
        const prompt = `Você é um assistente especializado em extrair informações de anúncios de classificados.
Extraia as seguintes informações da imagem fornecida e retorne APENAS um objeto JSON válido:
- title: Título do produto
- price: Preço (apenas o número)
- description: Descrição detalhada
- city: Escolha a mais próxima de: ${CITIES.join(', ')}
- category: Escolha a mais próxima de: ${categories.join(', ')}

Estrutura JSON esperada:
{
  "title": "string",
  "price": number,
  "description": "string",
  "city": "string",
  "category": "string"
}`;

        // Ordem dos Dados: Objeto da imagem colocado antes do prompt de texto
        const result = await model.generateContent([
          {
            inlineData: {
              mimeType: "image/jpeg",
              data: base64Data
            }
          },
          prompt
        ]);

        const response = await result.response;
        const text = response.text();
        
        // Limpeza de blocos markdown ```json ... ```
        const cleanJson = text.replace(/```json/gi, '').replace(/```/gi, '').trim();
        const extractedData = JSON.parse(cleanJson);
        
        setResult(extractedData);
      } catch (clientErr: any) {
        console.error('Erro na análise local do Gemini:', clientErr);
        setError(`⚠️ Falha na IA: ${clientErr.message || err.message || 'Verifique sua chave de API e conexão.'}`);
      }
    } finally {
      setAnalyzing(false);
    }
  };

  const confirmAndRedirect = () => {
    if (!result) return;
    navigate('/create-ad', { state: { prefill: result } });
  };

  if (!isAdmin) {
    return <div className="p-8 text-center font-bold">Acesso restrito a administradores.</div>;
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-black text-slate-900 tracking-tight">Importador Inteligente</h1>
        <p className="text-slate-500 font-medium">Extraia informações de anúncios via IA.</p>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white p-8 rounded-3xl shadow-xl border border-slate-100"
      >
        <div className="space-y-8">
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
                <Upload size={32} className="mx-auto mb-4 text-slate-400 group-hover:text-indigo-600" />
                <p className="text-slate-600 font-bold">Suba o print do anúncio</p>
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
              className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-bold text-lg hover:bg-indigo-700 transition-all shadow-xl flex items-center justify-center gap-2"
            >
              <Sparkles size={20} /> Analisar Print com IA
            </button>
          )}

          {analyzing && (
            <div className="text-center py-8">
              <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
              <p className="text-indigo-600 font-bold animate-pulse">Lendo dados do print...</p>
            </div>
          )}

          {error && (
            <div className="bg-rose-50 border border-rose-100 p-4 rounded-2xl flex items-center gap-3 text-rose-600">
              <AlertCircle size={20} />
              <p className="text-sm font-medium">{error}</p>
            </div>
          )}

          <AnimatePresence>
            {result && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="space-y-6 pt-6 border-t border-slate-100"
              >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  <div className="bg-slate-50 p-4 rounded-2xl">
                    <p className="text-xs font-bold text-slate-400 uppercase">Título</p>
                    <p className="text-slate-900 font-bold">{result.title}</p>
                  </div>
                  <div className="bg-slate-50 p-4 rounded-2xl">
                    <p className="text-xs font-bold text-slate-400 uppercase">Preço</p>
                    <p className="text-indigo-600 font-black text-lg">{result.price} €</p>
                  </div>
                </div>

                <button
                  onClick={confirmAndRedirect}
                  className="w-full bg-emerald-500 text-white py-4 rounded-2xl font-bold text-lg hover:bg-emerald-600 transition-all shadow-xl"
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
