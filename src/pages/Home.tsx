import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, where, getDocs, orderBy, limit } from 'firebase/firestore';
import { useSearchParams } from 'react-router-dom';
import { db, handleFirestoreError, OperationType, withTimeout } from '../firebase';
import { Ad, CITIES } from '../types';
import { useSettings } from '../context/SettingsContext';
import AdCard from '../components/AdCard';
import { Search, Tag, MapPin, ShoppingBag, ArrowRight } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

const MAX_FETCH = 50; // Limite de anúncios por query para não estourar quota

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

  // Define a pesquisa inicial
  useEffect(() => {
    const search = searchParams.get('search');
    if (search) setSearchTerm(search);
  }, [searchParams]);

  // Função que busca anúncios do Firestore
  useEffect(() => {
    const fetchAds = async () => {
      setLoading(true);
      setErrorMsg(null);
      try {
        // Simple query that does not require any composite indexes!
        const q = query(
          collection(db, 'ads'),
          where('status', '==', 'approved'),
          limit(200)
        );

        const snapshot = await withTimeout(getDocs(q), 45000);
        const adsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Ad));
        setAds(adsData);
      } catch (err: any) {
        console.error("Error loading ads:", err);
        setErrorMsg("Não foi possível carregar os anúncios do Firestore. Verifique sua ligação ou configuração.");
      } finally {
        setLoading(false);
      }
    };

    fetchAds();
  }, []);

  // Filtro local com memo para reduzir leituras repetidas e ser 100% livre de problemas de índices
  const filteredAds = useMemo(() => {
    let result = ads.filter(ad => {
      const matchesSearch = ad.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        ad.description.toLowerCase().includes(searchTerm.toLowerCase());

      const isActive = !ad.adStatus || ad.adStatus === 'active' || ad.adStatus === 'near_expiration' || ad.adStatus === 'sold';
      return matchesSearch && isActive;
    });

    if (category !== 'Todas') {
      result = result.filter(ad => ad.category === category);
    }

    if (city !== 'Todas') {
      result = result.filter(ad => ad.city === city);
    }

    // Sort client-side by createdAt desc
    result.sort((a, b) => {
      const dateA = a.createdAt ? (typeof a.createdAt.toDate === 'function' ? a.createdAt.toDate().getTime() : new Date(a.createdAt).getTime()) : 0;
      const dateB = b.createdAt ? (typeof b.createdAt.toDate === 'function' ? b.createdAt.toDate().getTime() : new Date(b.createdAt).getTime()) : 0;
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
                <motion.h1
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="text-[19px] md:text-4xl font-black leading-tight tracking-wide text-center text-white"
                >
                  Compre e venda em <span className="text-amber-300">Portugal</span>.
                </motion.h1>
                <motion.p
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.1 }}
                  className="mt-1 md:mt-2 text-xs md:text-base font-medium max-w-md mx-auto text-center text-emerald-100"
                >
                  Um jeito simples de comprar e vender na sua região.
                </motion.p>
              </motion.div>
            )}
          </AnimatePresence>

          <motion.div
            layout
            className={`flex flex-col items-center gap-3 ${isSearchFocused ? 'mt-0' : 'mt-4 md:mt-6'}`}
          >
            <div className="bg-white p-1 md:p-1.5 rounded-xl flex items-center shadow-md w-full max-w-md">
              <Search className="text-slate-400 ml-2" size={18} />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onFocus={() => setIsSearchFocused(true)}
                onBlur={() => setTimeout(() => setIsSearchFocused(false), 200)}
                placeholder="O que procura hoje?"
                className="flex-1 px-3 py-2 outline-none text-slate-700 text-sm font-medium placeholder:text-slate-300"
              />
              <button className="bg-pt-green text-white p-2 rounded-lg hover:bg-pt-green/90 transition-all flex items-center justify-center">
                <Search size={20} className="md:hidden" />
                <span className="hidden md:inline px-2 text-sm font-bold">Procurar</span>
                <Search size={18} className="hidden md:inline" />
              </button>
            </div>

            {!isSearchFocused && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex flex-wrap gap-2 md:gap-3 items-center justify-center"
              >
                <div 
                  style={{ width: '151px', height: '28px', marginLeft: '-6px' }}
                  className="flex items-center gap-2 bg-white/10 backdrop-blur-md px-3 rounded-lg md:rounded-xl border border-white/20 text-left"
                >
                  <Tag size={14} className="shrink-0 text-white" />
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="bg-transparent outline-none text-[15px] font-bold appearance-none pr-4 cursor-pointer w-full text-white"
                  >
                    <option value="Todas" className="text-slate-900">Categorias</option>
                    {categories.map((c, index) => <option key={`category-${c}-${index}`} value={c} className="text-slate-900">{c}</option>)}
                  </select>
                </div>
                <div 
                  style={{ width: '151px', height: '28px' }}
                  className="flex items-center gap-2 bg-white/10 backdrop-blur-md px-3 rounded-lg md:rounded-xl border border-white/20"
                >
                  <MapPin size={14} className="shrink-0 text-white" />
                  <select
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    className="bg-transparent outline-none text-[15px] font-bold appearance-none pr-4 cursor-pointer w-full text-white"
                  >
                    <option value="Todas" className="text-slate-900">Localização</option>
                    {CITIES.map((c, index) => <option key={`city-${c}-${index}`} value={c} className="text-slate-900">{c}</option>)}
                  </select>
                </div>
                <div className="text-[10px] md:text-sm font-medium ml-2 text-emerald-100">
                  <span className="font-bold text-white" style={{ fontSize: '18px' }}>{filteredAds.length}</span> anúncios
                </div>
              </motion.div>
            )}
          </motion.div>
        </div>
      </section>

      {/* Ads Grid */}
      {errorMsg && (
        <div className="bg-amber-50 border border-amber-200 text-amber-700 p-5 rounded-2xl flex items-center justify-between gap-3 text-xs md:text-sm font-bold shadow-sm">
          <div className="flex items-center gap-2">
            <span>⚠️</span>
            <span>{errorMsg}</span>
          </div>
          <button 
            onClick={() => {
              setAds([]);
              setCategory('Todas');
              setCity('Todas');
            }}
            className="bg-amber-600 hover:bg-amber-700 text-white font-extrabold px-3 py-1.5 rounded-xl transition-all shrink-0"
          >
            Recarregar
          </button>
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 md:gap-8">
          {Array.from({ length: 10 }).map((_, idx) => (
            <div key={`skeleton-ad-${idx}`} className="bg-white rounded-2xl h-[400px] animate-pulse border border-slate-100" />
          ))}
        </div>
      ) : filteredAds.length === 0 ? (
        <div className="text-center py-24 bg-white rounded-[3rem] border border-slate-100">
          <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-6">
            <ShoppingBag size={40} className="text-slate-200" />
          </div>
          <h3 className="text-2xl font-bold text-slate-900">Nenhum anúncio encontrado</h3>
          <p className="text-slate-500 mt-2">Tente ajustar os filtros ou procure por outro termo.</p>
          <button
            onClick={() => { setCategory('Todas'); setCity('Todas'); setSearchTerm(''); }}
            className="mt-8 text-indigo-600 font-bold hover:underline flex items-center gap-2 mx-auto"
          >
            Limpar todos os filtros <ArrowRight size={18} />
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 md:gap-8">
          {filteredAds.map((ad, idx) => (
            <AdCard key={ad.id} ad={ad} />
          ))}
        </div>
      )}
    </div>
  );
};

export default Home;