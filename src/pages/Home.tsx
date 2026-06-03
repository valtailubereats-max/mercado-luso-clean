import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, where, limit } from 'firebase/firestore';
import { useSearchParams } from 'react-router-dom';
import { db, withTimeout, getDocsWithCacheFallback } from '../firebase';
import { Ad, CITIES } from '../types';
import { useSettings } from '../context/SettingsContext';
import AdCard from '../components/AdCard';
import { Search, Tag, MapPin, ShoppingBag, ArrowRight, AlertCircle, RefreshCcw } from 'lucide-react';
import { motion } from 'motion/react';
// @ts-ignore
import cplpCollage from '../assets/images/cplp_flags_collage_1780303992447.png';

const INITIAL_LIMIT = 15; 

let lastFetchTime = 0;
let cachedAds: Ad[] = [];

const Home = () => {
  const { categories } = useSettings();
  const [searchParams] = useSearchParams();
  const [ads, setAds] = useState<Ad[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [category, setCategory] = useState('Todas');
  const [city, setCity] = useState('Todas');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    const search = searchParams.get('search');
    if (search) setSearchTerm(search);
    const cat = searchParams.get('category');
    if (cat) setCategory(cat);
    const cty = searchParams.get('city');
    if (cty) setCity(cty);
  }, [searchParams]);

  useEffect(() => {
    let active = true;
    const fetchAds = async () => {
      setLoading(true);
      setErrorMsg(null);
      await new Promise(resolve => setTimeout(resolve, 2000));
      if (!active) return;

      const now = Date.now();
      if (now - lastFetchTime < 30000 && cachedAds.length > 0) {
        setAds(cachedAds);
        setLoading(false);
        return;
      }

      try {
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
        if (active) setErrorMsg("Erro ao carregar anúncios.");
      } finally {
        if (active) setLoading(false);
      }
    };
    fetchAds();
    return () => { active = false; };
  }, []);

  const filteredAds = useMemo(() => {
    let result = ads.filter(ad => {
      const search = searchTerm.toLowerCase().trim();
      const matchesSearch = !search || ad.title?.toLowerCase().includes(search) || ad.description?.toLowerCase().includes(search);
      return matchesSearch && (!ad.adStatus || ad.adStatus !== 'expired');
    });
    if (category !== 'Todas') result = result.filter(ad => ad.category === category);
    if (city !== 'Todas') result = result.filter(ad => ad.city === city);
    return result.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
  }, [ads, searchTerm, category, city]);

  return (
    <div className="space-y-6">
      {/* HERO BANNER LUXURY SLIM */}
      <section className="relative -mt-6 md:-mt-8 overflow-hidden shadow-2xl transition-all duration-500 rounded-b-[2rem] md:rounded-b-[3rem]">
        
        {/* Imagem de Fundo (Bandeiras) */}
        <div className="absolute inset-0 z-0">
          <img 
            src={cplpCollage} 
            alt="Lusofonia" 
            className="w-full h-full object-cover scale-105"
          />
          {/* Overlay suave para dar brilho e profundidade */}
          <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-black/40 backdrop-saturate-[1.4]" />
        </div>
        
        <div className="relative z-10 max-w-4xl mx-auto text-center py-5 md:py-12 px-6">
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            
            {/* Título com Tipografia Premium */}
            <h1 
              onClick={() => {
                setCategory('Todas');
                setCity('Todas');
                setSearchTerm('');
              }}
              title="Resetar filtros"
              className="text-2xl md:text-5xl font-black text-white tracking-tight drop-shadow-[0_4px_8px_rgba(0,0,0,0.7)] mb-1 cursor-pointer hover:opacity-90 active:scale-[0.98] transition-all select-none"
            >
              Mercado da Língua Portuguesa
            </h1>
            <p className="text-xs md:text-lg font-medium text-white/90 mb-4 md:mb-6 tracking-widest uppercase drop-shadow-md">
              Conectando o Mundo Lusófono
            </p>

            {/* Barra de Pesquisa Minimalista */}
            <div className="relative max-w-lg mx-auto mb-3 md:mb-4.5 group">
              <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
                <Search size={18} className="text-white/60 group-focus-within:text-white transition-colors" />
              </div>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="O que procura hoje?"
                className="w-full bg-white/10 backdrop-blur-3xl border border-white/20 rounded-full py-3 px-12 text-white placeholder:text-white/50 outline-none focus:ring-2 focus:ring-white/30 focus:bg-white/15 transition-all shadow-xl text-sm"
              />
            </div>

            {/* Ícones de Filtro e Contador (Layout Limpo) */}
            <div className="flex items-center justify-center gap-4">
              
              {/* Botão Categoria - Apenas Ícone */}
              <div className="relative group">
                <div className="w-10 h-10 md:w-12 md:h-12 flex items-center justify-center bg-white/10 backdrop-blur-3xl rounded-full border border-white/20 text-white hover:bg-white/25 hover:scale-110 transition-all cursor-pointer shadow-lg">
                  <Tag size={18} />
                  <select 
                    value={category} 
                    onChange={(e) => setCategory(e.target.value)} 
                    className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                  >
                    <option value="Todas">Categorias</option>
                    {categories.map((c, i) => <option key={i} value={c} className="bg-slate-900">{c}</option>)}
                  </select>
                </div>
              </div>

              {/* Botão Localização - Apenas Ícone */}
              <div className="relative group">
                <div className="w-10 h-10 md:w-12 md:h-12 flex items-center justify-center bg-white/10 backdrop-blur-3xl rounded-full border border-white/20 text-white hover:bg-white/25 hover:scale-110 transition-all cursor-pointer shadow-lg">
                  <MapPin size={18} />
                  <select 
                    value={city} 
                    onChange={(e) => setCity(e.target.value)} 
                    className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                  >
                    <option value="Todas">Localização</option>
                    {CITIES.map((c, i) => <option key={i} value={c} className="bg-slate-900">{c}</option>)}
                  </select>
                </div>
              </div>

              {/* Contador de Anúncios Slim */}
              <div className="h-10 md:h-12 px-5 flex items-center bg-black/30 backdrop-blur-3xl rounded-full border border-white/10 shadow-inner">
                <span className="text-white font-black text-sm md:text-lg mr-2">{filteredAds.length}</span>
                <span className="text-white/60 text-[10px] md:text-xs uppercase font-bold tracking-tighter">Anúncios</span>
              </div>

            </div>
          </motion.div>
        </div>
      </section>

      {/* Grid de Anúncios */}
      <div className="px-0">
        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 md:gap-6">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="bg-slate-100 rounded-3xl h-64 animate-pulse" />
            ))}
          </div>
        ) : filteredAds.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-[3rem] border border-slate-100 shadow-sm">
            <ShoppingBag size={48} className="mx-auto text-slate-200 mb-4" />
            <h3 className="text-xl font-bold text-slate-400">Nenhum tesouro encontrado</h3>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 md:gap-6">
            {filteredAds.map((ad) => (
              <AdCard key={ad.id} ad={ad} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Home;