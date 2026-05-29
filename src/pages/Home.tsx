import React, { useState, useEffect, useMemo, useRef } from 'react';
import { collection, query, where, getDocs, limit } from 'firebase/firestore';
import { useSearchParams } from 'react-router-dom';
import { db, withTimeout } from '../firebase';
import { Ad, CITIES } from '../types';
import { useSettings } from '../context/SettingsContext';
import AdCard from '../components/AdCard';
import { Search, Tag, MapPin, ShoppingBag, ArrowRight } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// Baixamos para 60 para economizar cota (múltiplo de 2, 3, 4 e 5 para o grid ficar bonito)
const INITIAL_LIMIT = 60; 

const Home = () => {
  const { categories } = useSettings();
  const [searchParams] = useSearchParams();
  const [ads, setAds] = useState<Ad[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [category, setCategory] = useState('Todas');
  const [city, setCity] = useState('Todas');
  const [searchTerm, setSearchTerm] = useState('');
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  
  // Impede que o useEffect rode duas vezes seguidas em StrictMode (comum no desenvolvimento)
  const hasFetched = useRef(false);

  useEffect(() => {
    const search = searchParams.get('search');
    if (search) setSearchTerm(search);
  }, [searchParams]);

  useEffect(() => {
    const fetchAds = async () => {
      if (hasFetched.current) return;
      
      setLoading(true);
      setErrorMsg(null);
      try {
        // Query otimizada para baixo consumo
        const q = query(
          collection(db, 'ads'),
          where('status', '==', 'approved'),
          limit(INITIAL_LIMIT) 
        );

        const snapshot = await withTimeout(getDocs(q), 30000);
        const adsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Ad));
        setAds(adsData);
        hasFetched.current = true;
      } catch (err: any) {
        console.error("Error loading ads:", err);
        setErrorMsg("O site está com tráfego intenso. Tente recarregar em instantes.");
      } finally {
        setLoading(false);
      }
    };

    fetchAds();
  }, []);

  const filteredAds = useMemo(() => {
    let result = ads.filter(ad => {
      const title = ad.title?.toLowerCase() || '';
      const desc = ad.description?.toLowerCase() || '';
      const search = searchTerm.toLowerCase();
      
      const matchesSearch = title.includes(search) || desc.includes(search);
      const isActive = !ad.adStatus || ad.adStatus === 'active' || ad.adStatus === 'near_expiration' || ad.adStatus === 'sold';
      
      return matchesSearch && isActive;
    });

    if (category !== 'Todas') {
      result = result.filter(ad => ad.category === category);
    }

    if (city !== 'Todas') {
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
    <div className="space-y-4 md:space-y-12">
      {/* Hero Section */}
      <section className={`relative bg-pt-green rounded-2xl md:rounded-3xl overflow-hidden shadow-xl shadow-pt-green/20 transition-all duration-300 ${isSearchFocused ? 'p-2 md:p-6' : 'p-3 md:p-6'}`}>
        <div className="absolute top-0 right-0 w-1/2 h-full bg-white/5 skew-x-[-20deg] translate-x-1/4" />
        <div className="relative z-10 max-w-2xl mx-auto text-center">
          <AnimatePresence>
            {!isSearchFocused && (
              <motion.div
                initial={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                className="hidden md:block"
              >
                <motion.h1 className="text-[19px] md:text-4xl font-black leading-tight tracking-wide text-center text-white">
                  Compre e venda em <span className="text-amber-300">Portugal</span>.
                </motion.h1>
                <motion.p className="mt-1 md:mt-2 text-xs md:text-base font-medium max-w-md mx-auto text-center text-emerald-100">
                  Um jeito simples de comprar e vender na sua região.
                </motion.p>
              </motion.div>
            )}
          </AnimatePresence>

          <motion.div layout className={`flex flex-col items-center gap-3 ${isSearchFocused ? 'mt-0' : 'mt-4 md:mt-6'}`}>
            <div className="bg-white p-1 md:p-1.5 rounded-xl flex items-center shadow-md w-full max-w-md">
              <Search className="text-slate-400 ml-2" size={18} />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onFocus={() => setIsSearchFocused(true)}
                onBlur={() => setTimeout(() => setIsSearchFocused(false), 200)}
                placeholder="O que procura hoje?"
                className="flex-1 px-3 py-2 outline-none text-pt-green text-sm font-semibold placeholder:text-pt-green/45"
              />
            </div>

            {!isSearchFocused && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-wrap gap-2 md:gap-3 items-center justify-center">
                <div className="flex items-center gap-2 bg-white/10 backdrop-blur-md px-3 h-8 rounded-lg border border-white/20">
                  <Tag size={14} className="text-white" />
                  <select value={category} onChange={(e) => setCategory(e.target.value)} className="bg-transparent outline-none text-sm font-bold text-white appearance-none">
                    <option value="Todas" className="text-slate-900">Categorias</option>
                    {categories.map((c, i) => <option key={i} value={c} className="text-slate-900">{c}</option>)}
                  </select>
                </div>
                <div className="flex items-center gap-2 bg-white/10 backdrop-blur-md px-3 h-8 rounded-lg border border-white/20">
                  <MapPin size={14} className="text-white" />
                  <select value={city} onChange={(e) => setCity(e.target.value)} className="bg-transparent outline-none text-sm font-bold text-white appearance-none">
                    <option value="Todas" className="text-slate-900">Localização</option>
                    {CITIES.map((c, i) => <option key={i} value={c} className="text-slate-900">{c}</option>)}
                  </select>
                </div>
                <div className="text-[10px] md:text-sm font-medium text-emerald-100">
                  <span className="font-bold text-white text-lg">{filteredAds.length}</span> anúncios
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