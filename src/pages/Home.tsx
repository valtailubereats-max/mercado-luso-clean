import React, { useState, useEffect, useMemo, useRef } from 'react';
import { collection, query, where, limit } from 'firebase/firestore';
import { useSearchParams } from 'react-router-dom';
import { db, withTimeout, getDocsWithCacheFallback } from '../firebase';
import { Ad, CITIES } from '../types';
import { useSettings } from '../context/SettingsContext';
import AdCard from '../components/AdCard';
import { Search, Tag, MapPin, ShoppingBag, ArrowRight, AlertCircle, RefreshCcw } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
// @ts-ignore
import cplpCollage from '../assets/images/cplp_flags_collage_1780303992447.png';

// Baixamos temporariamente para 5 itens para teste severo de consumo de cotas
const INITIAL_LIMIT = 5; 

// Trava de segurança contra leituras excessivas (30s)
let lastFetchTime = 0;
let cachedAds: Ad[] = [];

const Home = () => {
  const { categories, settings } = useSettings();
  const [searchParams] = useSearchParams();
  const [ads, setAds] = useState<Ad[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [category, setCategory] = useState('Todas');
  const [city, setCity] = useState('Todas');
  const [searchTerm, setSearchTerm] = useState('');
  const [isSearchFocused, setIsSearchFocused] = useState(false);

  useEffect(() => {
    const search = searchParams.get('search');
    if (search) setSearchTerm(search);
    const cat = searchParams.get('category');
    if (cat) setCategory(cat);
    const cty = searchParams.get('city');
    if (cty) setCity(cty);
  }, [searchParams]);

  useEffect(() => {
    const handleReset = () => {
      setCategory('Todas');
      setCity('Todas');
      setSearchTerm('');
    };
    window.addEventListener('reset-category', handleReset);
    return () => {
      window.removeEventListener('reset-category', handleReset);
    };
  }, []);

  useEffect(() => {
    let active = true;
    const fetchAds = async () => {
      setLoading(true);
      setErrorMsg(null);

      // Delay de Segurança: 2 segundos antes de efetuar qualquer consulta do Firestore
      await new Promise(resolve => setTimeout(resolve, 2000));
      if (!active) return;

      const now = Date.now();
      if (now - lastFetchTime < 30000 && cachedAds.length > 0) {
        setAds(cachedAds);
        setLoading(false);
        return;
      }

      console.log('🔥 CHAMADA AO FIREBASE DETECTADA');
      try {
        // Query otimizada para baixo consumo de leituras
        const q = query(
          collection(db, 'ads'),
          where('status', '==', 'approved'),
          limit(INITIAL_LIMIT) 
        );

        const snapshot = await withTimeout(getDocsWithCacheFallback(q, 'home/approved-ads'), 30000);
        if (!active) return;

        const adsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Ad));
        setAds(adsData);
        cachedAds = adsData;
        lastFetchTime = now;
      } catch (err: any) {
        console.error("Error loading ads:", err);
        if (active) {
          setErrorMsg("Não foi possível carregar os anúncios neste momento. Tente recarregar a página.");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    fetchAds();
    return () => {
      active = false;
    };
  }, []);

  const filteredAds = useMemo(() => {
    let result = ads.filter(ad => {
      const title = ad.title?.toLowerCase() || '';
      const desc = ad.description?.toLowerCase() || '';
      const search = searchTerm.toLowerCase().trim();
      
      const matchesSearch = !search || title.includes(search) || desc.includes(search);
      const isActive = !ad.adStatus || ad.adStatus === 'active' || ad.adStatus === 'near_expiration' || ad.adStatus === 'sold';
      
      return matchesSearch && isActive;
    });

    if (category && category !== 'Todas') {
      result = result.filter(ad => ad.category === category);
    }

    if (city && city !== 'Todas') {
      result = result.filter(ad => ad.city === city);
    }

    // Ordenação local (0 leituras extras)
    result.sort((a, b) => {
      const dateA = a.createdAt?.seconds || 0;
      const dateB = b.createdAt?.seconds || 0;
      return dateB - dateA;
    });

    return result;
  }, [ads, searchTerm, category, city]);

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Hero Section */}
      <section className={`relative -mt-6 md:-mt-8 rounded-2xl md:rounded-3xl overflow-hidden transition-all duration-300 shadow-lg ${isSearchFocused ? 'p-2 md:p-4' : 'p-3 md:p-6'}`}>
        {/* Colagem de Bandeiras da CPLP (Fundo do Banner) */}
        <div className="absolute inset-0 pointer-events-none select-none z-0">
          <img 
            src={cplpCollage} 
            alt="Colagem de Bandeiras da Comunidade de Língua Portuguesa" 
            className="w-full h-full object-cover object-center transition-all duration-300 pointer-events-none select-none"
            referrerPolicy="no-referrer"
          />
          {/* Capa translúcida vibrante: aumenta saturação, aumenta com brilho e mantém transparência pura */}
          <div className="absolute inset-0 bg-gradient-to-tr from-slate-950/30 via-transparent to-slate-950/25 backdrop-brightness-[1.10] backdrop-saturate-[1.40]" />
        </div>
        
        <div className="relative z-10 max-w-2xl mx-auto text-center py-1">
          <motion.div layout className="flex flex-col items-center gap-2 md:gap-3">
            
            {/* Título e Subtítulo Legíveis no Banner */}
            {!isSearchFocused && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="mb-1"
              >
                <h1 className="text-xl md:text-3xl font-black leading-tight tracking-tight text-white drop-shadow-[0_4px_12px_rgba(0,0,0,0.85)]">
                  Mercado da Língua Portuguesa
                </h1>
                <h2 className="mt-1 text-[10px] md:text-xs font-bold text-slate-50 tracking-wide drop-shadow-[0_2px_8px_rgba(0,0,0,0.85)]">
                  Conectando o Mundo Lusófono
                </h2>
              </motion.div>
            )}

            {/* Caixas de Interface com Vidro Fosco de Alta Intensidade */}
            <div className="bg-white/45 backdrop-blur-3xl p-1 rounded-xl flex items-center shadow-2xl w-full max-w-md border border-white/40 focus-within:bg-white/70 focus-within:border-emerald-400 focus-within:shadow-emerald-500/10 transition-all">
              <Search className="text-slate-900 ml-2" size={16} />
              <input
                id="home-search-input"
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onFocus={() => setIsSearchFocused(true)}
                onBlur={() => setTimeout(() => setIsSearchFocused(false), 200)}
                placeholder="O que procura hoje?"
                className="flex-1 px-3 py-1.5 outline-none bg-transparent text-slate-950 text-xs md:text-sm font-black placeholder:text-slate-800/80"
              />
            </div>

            {!isSearchFocused && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-wrap gap-2 items-center justify-center">
                <div className="flex items-center gap-1.5 bg-white/45 backdrop-blur-3xl shadow-xl px-2.5 h-7 rounded-lg border border-white/40 hover:bg-white/60 hover:border-white/50 transition-all">
                  <Tag size={12} className="text-slate-900" />
                  <select value={category} onChange={(e) => setCategory(e.target.value)} className="bg-transparent outline-none text-xs font-black text-slate-950 appearance-none cursor-pointer">
                    <option value="Todas" className="bg-white text-slate-900">Categorias</option>
                    {categories.map((c, i) => <option key={i} value={c} className="bg-white text-slate-900">{c}</option>)}
                  </select>
                </div>
                <div className="flex items-center gap-1.5 bg-white/45 backdrop-blur-3xl shadow-xl px-2.5 h-7 rounded-lg border border-white/40 hover:bg-white/60 hover:border-white/50 transition-all">
                  <MapPin size={12} className="text-slate-900" />
                  <select value={city} onChange={(e) => setCity(e.target.value)} className="bg-transparent outline-none text-xs font-black text-slate-950 appearance-none cursor-pointer">
                    <option value="Todas" className="bg-white text-slate-900">Localização</option>
                    {CITIES.map((c, i) => <option key={i} value={c} className="bg-white text-slate-900">{c}</option>)}
                  </select>
                </div>
                <div className="flex items-center gap-1.5 bg-slate-950/50 backdrop-blur-2xl px-2.5 h-7 rounded-lg border border-white/20 text-white shadow-xl text-[10px] font-black">
                  <span className="text-xs font-black text-white">{filteredAds.length}</span> anúncios
                </div>
              </motion.div>
            )}
          </motion.div>
        </div>
      </section>

      {/* Grid de Anúncios */}
      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 md:gap-8">
          {[...Array(10)].map((_, i) => (
            <div key={i} className="bg-white rounded-2xl h-[300px] animate-pulse border border-slate-100" />
          ))}
        </div>
      ) : errorMsg ? (
        <div className="text-center py-16 bg-white rounded-[3rem] border border-red-100 max-w-md mx-auto px-6">
          <div className="w-12 h-12 bg-rose-50 text-rose-500 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertCircle size={24} />
          </div>
          <h3 className="text-lg font-bold text-slate-900">Erro ao carregar os anúncios</h3>
          <p className="text-slate-500 text-xs mt-2 leading-relaxed">{errorMsg}</p>
          <button 
            onClick={() => window.location.reload()} 
            className="mt-6 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-5 py-2.5 rounded-xl transition-all shadow-md flex items-center gap-1.5 mx-auto active:scale-95"
          >
            <RefreshCcw size={14} /> Tentar Novamente
          </button>
        </div>
      ) : filteredAds.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-[3rem] border border-slate-100">
          <ShoppingBag size={40} className="mx-auto text-slate-200 mb-4" />
          <h3 className="text-xl font-bold text-slate-900">Nada encontrado</h3>
          <button onClick={() => { setCategory('Todas'); setCity('Todas'); setSearchTerm(''); }} className="mt-4 text-indigo-600 font-bold flex items-center gap-2 mx-auto hover:underline">
            Limpar filtros <ArrowRight size={18} />
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 md:gap-8">
          {filteredAds.map((ad) => (
            <AdCard key={ad.id} ad={ad} />
          ))}
        </div>
      )}
    </div>
  );
};

export default Home;