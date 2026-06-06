import React, { useState, useEffect, useMemo, useRef } from 'react';
import { collection, query, where, limit, getCountFromServer } from 'firebase/firestore';
import { useSearchParams } from 'react-router-dom';
import { db, withTimeout, getDocsWithCacheFallback } from '../firebase';
import { Ad, CITIES, PORTUGAL_CITIES, UK_CITIES } from '../types';
import { useSettings } from '../context/SettingsContext';
import { useAuth } from '../context/AuthContext';
import AdCard from '../components/AdCard';
import { Search, Tag, MapPin, ShoppingBag, ArrowRight, AlertCircle, RefreshCcw, ArrowUp } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
// @ts-ignore
import cplpCollage from '../assets/images/cplp_flags_collage_1780303992447.png';

const PAGE_SIZE = 30; 

let lastFetchTime = 0;
let cachedAds: Ad[] = [];
let cachedHasMore = false;
let cachedLimit = PAGE_SIZE;

const Home = () => {
  const { settings, categories } = useSettings();
  const { profile, isAdmin } = useAuth();
  const isModeratorOrAdmin = isAdmin || profile?.role === 'admin' || profile?.role === 'moderator';
  const [searchParams] = useSearchParams();
  const [ads, setAds] = useState<Ad[]>([]);
  const [featuredAds, setFeaturedAds] = useState<Ad[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [category, setCategory] = useState('Todas');
  const [city, setCity] = useState('Todas');
  
  const [country, setCountry] = useState<'Portugal' | 'Reino Unido'>(() => {
    // 1. Check localStorage first
    const saved = localStorage.getItem('selectedCountry') as 'Portugal' | 'Reino Unido' | null;
    if (saved === 'Portugal' || saved === 'Reino Unido') return saved;
    
    // 2. Try safe detection based on browser timezone and language
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const lang = navigator.language;
      if (
        tz.includes('Lisbon') || 
        tz.includes('Atlantic/Madeira') || 
        tz.includes('Atlantic/Azores') || 
        lang.startsWith('pt')
      ) {
        return 'Portugal';
      }
      if (
        tz.includes('London') || 
        tz.includes('Europe/Belfast') || 
        lang.startsWith('en-GB')
      ) {
        return 'Reino Unido';
      }
    } catch (e) {
      console.warn("Could not determine timezone:", e);
    }
    
    // 3. Fallback per instructions: Reino Unido
    return 'Reino Unido';
  });

  const [searchTerm, setSearchTerm] = useState('');
  const [totalApprovedCount, setTotalApprovedCount] = useState<number | null>(null);
  const [totalUsersCount, setTotalUsersCount] = useState<number | null>(null);

  // Estados de paginação de 30 em 30 itens
  const [limitAmount, setLimitAmount] = useState(PAGE_SIZE);
  const [hasMore, setHasMore] = useState(false);
  const [isFetchingMore, setIsFetchingMore] = useState(false);

  // State to pause marquee on hover
  const [isHovered, setIsHovered] = useState(false);
  const [showScrollTop, setShowScrollTop] = useState(false);

  // Onboarding states for country selection
  const [showTooltip, setShowTooltip] = useState(false);
  const [shouldAnimateButton, setShouldAnimateButton] = useState(false);

  // Custom Dropdown states
  const [countryDropdownOpen, setCountryDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Helpers for country flags and labels
  const getCountryFlag = (countryVal: 'Portugal' | 'Reino Unido') => {
    return countryVal === 'Portugal' ? '🇵🇹' : '🇬🇧';
  };

  const getCommunityLabel = (countryVal: 'Portugal' | 'Reino Unido') => {
    if (countryVal === 'Portugal') {
      return { flag: '🇵🇹', text: 'Você está na comunidade de Portugal' };
    }
    return { flag: '🇬🇧', text: 'Você está na comunidade do Reino Unido' };
  };

  // Sync with Profile country if registered
  useEffect(() => {
    if (profile?.country && (profile.country === 'Portugal' || profile.country === 'Reino Unido')) {
      setCountry(profile.country);
      localStorage.setItem('selectedCountry', profile.country);
    }
  }, [profile]);

  // Click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setCountryDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Handle Country Change
  const handleCountryChange = (val: 'Portugal' | 'Reino Unido') => {
    setCountry(val);
    setCity('Todas');
    localStorage.setItem('selectedCountry', val);
    setShowTooltip(false);
  };

  const handleOnboardingButtonClick = () => {
    setShowTooltip(false);
    setCountryDropdownOpen(true);
  };

  useEffect(() => {
    const sessionVisited = sessionStorage.getItem('countryOnboardingSessionInit');
    const storedViews = localStorage.getItem('countryOnboardingViews');
    let current = storedViews ? parseInt(storedViews, 10) : 0;
    if (isNaN(current)) current = 0;

    if (!sessionVisited) {
      current = current + 1;
      localStorage.setItem('countryOnboardingViews', current.toString());
      sessionStorage.setItem('countryOnboardingSessionInit', 'true');
    }

    if (current === 1) {
      setShowTooltip(true);
    } else if (current === 2 || current === 3) {
      setShouldAnimateButton(true);
      const timer = setTimeout(() => {
        setShouldAnimateButton(false);
      }, 4500);
      return () => clearTimeout(timer);
    }
  }, []);

  // Monitorar scroll para exibir/esconder o botão de "Voltar ao topo"
  useEffect(() => {
    const handleScroll = () => {
      if (window.scrollY > 400) {
        setShowScrollTop(true);
      } else {
        setShowScrollTop(false);
      }
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Buscar total de anúncios aprovados no banco de dados para estatísticas da Home
  useEffect(() => {
    let active = true;
    const fetchTotalCount = async () => {
      try {
        const q = query(collection(db, 'ads'), where('status', '==', 'approved'));
        const snapshot = await getCountFromServer(q);
        if (active) {
          setTotalApprovedCount(snapshot.data().count);
        }
      } catch (err) {
        console.error('Erro ao buscar total de anúncios aprovados:', err);
      }
    };
    fetchTotalCount();
    return () => { active = false; };
  }, []);

  // Buscar total de utilizadores no banco de dados se permitido/configurado
  useEffect(() => {
    const shouldFetch = settings?.showTotalUsersBadge || isModeratorOrAdmin;
    if (!shouldFetch) return;

    let active = true;
    const fetchUsersCount = async () => {
      try {
        const q = query(collection(db, 'users'));
        const snapshot = await getCountFromServer(q);
        if (active) {
          setTotalUsersCount(snapshot.data().count);
        }
      } catch (err) {
        console.error('Erro ao buscar total de utilizadores:', err);
      }
    };
    fetchUsersCount();
    return () => { active = false; };
  }, [settings?.showTotalUsersBadge, isModeratorOrAdmin]);

  // Buscar anúncios destacados para carrossel no topo
  useEffect(() => {
    let active = true;
    const fetchFeatured = async () => {
      try {
        const q = query(
          collection(db, 'ads'),
          where('status', '==', 'approved'),
          where('isFeatured', '==', true),
          limit(20)
        );
        const snapshot = await getDocsWithCacheFallback(q, 'home/featured-ads');
        if (!active) return;
        const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Ad));
        setFeaturedAds(docs);
      } catch (err) {
        console.error('Erro ao buscar anúncios destacados:', err);
      }
    };
    fetchFeatured();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const search = searchParams.get('search');
    if (search) setSearchTerm(search);
    const cat = searchParams.get('category');
    if (cat) setCategory(cat);
    const cty = searchParams.get('city');
    if (cty) setCity(cty);
    const countr = searchParams.get('country') as 'Portugal' | 'Reino Unido' | null;
    if (countr === 'Portugal' || countr === 'Reino Unido') {
      setCountry(countr);
      localStorage.setItem('selectedCountry', countr);
    }
  }, [searchParams]);

  useEffect(() => {
    let active = true;
    const fetchAds = async (isMore = false) => {
      if (isMore) {
        setIsFetchingMore(true);
      } else {
        setLoading(true);
      }
      setErrorMsg(null);

      // Delay visual rápido e subtil de carregamento inicial
      if (!isMore) {
        await new Promise(resolve => setTimeout(resolve, 1500));
      }
      if (!active) return;

      const now = Date.now();
      // Reutiliza a cache local se o limite for idêntico e o intervalo for < 30s
      if (!isMore && now - lastFetchTime < 30000 && cachedAds.length > 0 && cachedLimit === limitAmount) {
        setAds(cachedAds);
        setHasMore(cachedHasMore);
        setLoading(false);
        return;
      }

      try {
        const queryLimit = limitAmount + 30; // Garante margem para não contar destacados ativos no limite
        const q = query(
          collection(db, 'ads'),
          where('status', '==', 'approved'),
          limit(queryLimit)
        );

        const snapshot = await withTimeout(getDocsWithCacheFallback(q, `home/approved-ads-limit-${limitAmount}`), 30000);
        if (!active) return;

        const docs = snapshot.docs;
        
        let normalDocsCount = 0;
        const visibleDocs: typeof docs = [];
        const currentDate = new Date();

        for (const doc of docs) {
          const data = doc.data() as Ad;
          const isFeatured = data.isFeatured && data.featuredUntil && (
            data.featuredUntil.seconds 
              ? data.featuredUntil.toDate() > currentDate
              : new Date(data.featuredUntil) > currentDate
          ) && data.adStatus !== 'expired';

          if (isFeatured) {
            visibleDocs.push(doc);
          } else {
            if (normalDocsCount < limitAmount) {
              visibleDocs.push(doc);
              normalDocsCount++;
            }
          }
        }

        const adsData = visibleDocs.map(doc => ({ id: doc.id, ...doc.data() } as Ad));
        const gotMore = docs.length === queryLimit;

        setAds(adsData);
        setHasMore(gotMore);

        cachedAds = adsData;
        cachedHasMore = gotMore;
        cachedLimit = limitAmount;
        lastFetchTime = now;
      } catch (err: any) {
        console.error("[Home] Erro ao carregar anúncios do Firestore:", err);
        if (active) setErrorMsg("Erro ao carregar anúncios.");
      } finally {
        if (active) {
          setLoading(false);
          setIsFetchingMore(false);
        }
      }
    };

    const isMoreFetch = limitAmount > PAGE_SIZE;
    fetchAds(isMoreFetch);

    return () => { active = false; };
  }, [limitAmount]);

  const handleLoadMore = () => {
    if (!isFetchingMore) {
      setLimitAmount(prev => prev + PAGE_SIZE);
    }
  };

  const selectableCitiesOnHome = useMemo(() => {
    if (country === 'Portugal') return PORTUGAL_CITIES;
    return UK_CITIES;
  }, [country]);

  const filteredFeaturedAds = useMemo(() => {
    const now = new Date();
    let result = featuredAds.filter(ad => {
      if (!ad.isFeatured || !ad.featuredUntil) return false;
      const featuredUntilDate = ad.featuredUntil.seconds
        ? ad.featuredUntil.toDate()
        : new Date(ad.featuredUntil);
      if (featuredUntilDate <= now) return false;

      const search = searchTerm.toLowerCase().trim();
      const matchesSearch = !search || ad.title?.toLowerCase().includes(search) || ad.description?.toLowerCase().includes(search);
      const matchesStatus = !ad.adStatus || ad.adStatus !== 'expired';
      return matchesSearch && matchesStatus;
    });

    result = result.filter(ad => {
      const adCountry = ad.country || 'Portugal';
      return adCountry === country;
    });
    if (category !== 'Todas') result = result.filter(ad => ad.category === category);
    if (city !== 'Todas') result = result.filter(ad => ad.city === city);

    return result.sort((a, b) => {
      const timeA = a.featuredUntil?.seconds ? a.featuredUntil.seconds * 1000 : new Date(a.featuredUntil).getTime();
      const timeB = b.featuredUntil?.seconds ? b.featuredUntil.seconds * 1000 : new Date(b.featuredUntil).getTime();
      return (timeB || 0) - (timeA || 0);
    }).slice(0, 20);
  }, [featuredAds, searchTerm, category, city, country]);



  const filteredAds = useMemo(() => {
    let result = ads.filter(ad => {
      const search = searchTerm.toLowerCase().trim();
      const matchesSearch = !search || ad.title?.toLowerCase().includes(search) || ad.description?.toLowerCase().includes(search);
      return matchesSearch && (!ad.adStatus || ad.adStatus !== 'expired');
    });
    result = result.filter(ad => {
      const adCountry = ad.country || 'Portugal';
      return adCountry === country;
    });
    if (category !== 'Todas') result = result.filter(ad => ad.category === category);
    if (city !== 'Todas') result = result.filter(ad => ad.city === city);
    return result.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
  }, [ads, searchTerm, category, city, country]);

  return (
    <div className="flex flex-col gap-3 md:gap-6">
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
                setCountry('Todos');
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
                <div className="w-10 h-10 md:w-12 md:h-12 flex items-center justify-center bg-white/10 backdrop-blur-3xl rounded-full border border-white/20 text-white hover:bg-white/25 hover:scale-110 transition-all cursor-pointer shadow-lg" title="Categoria">
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

              {/* Botão País com Bandeira e Nome da Comunidade */}
              <div className="relative" ref={dropdownRef}>
                <button 
                  type="button"
                  onClick={() => {
                    setCountryDropdownOpen(prev => !prev);
                    setShowTooltip(false);
                  }}
                  className={`h-10 md:h-12 px-4 md:px-5 flex items-center gap-2 bg-white/10 backdrop-blur-3xl rounded-full border border-white/20 text-white hover:bg-white/25 hover:scale-105 active:scale-95 transition-all cursor-pointer shadow-lg font-bold text-xs md:text-sm tracking-tight outline-none select-none ${
                    shouldAnimateButton ? 'animate-country-pulse border-amber-400' : ''
                  }`}
                  title="Mudar de Comunidade"
                  id="community-toggle-button"
                >
                  <span className="text-base md:text-lg leading-none shrink-0">{getCountryFlag(country)}</span>
                  <span className="truncate max-w-[85px] sm:max-w-none">{country}</span>
                  <span className="text-[10px] opacity-60 ml-0.5">▼</span>
                </button>

                {/* Dropdown de Países Personalizado */}
                <AnimatePresence>
                  {countryDropdownOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: 10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 10, scale: 0.95 }}
                      transition={{ duration: 0.15 }}
                      className="absolute right-0 md:left-0 md:right-auto top-12 md:top-14 z-[60] w-48 bg-slate-900 border border-indigo-500/30 text-white rounded-2xl p-2 shadow-2xl divide-y divide-slate-800"
                    >
                      <button
                        type="button"
                        onClick={() => {
                          handleCountryChange('Portugal');
                          setCountryDropdownOpen(false);
                        }}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-white/10 text-left text-sm font-bold transition-all cursor-pointer border-none outline-none ${
                          country === 'Portugal' ? 'bg-indigo-600/30 text-indigo-300' : ''
                        }`}
                      >
                        <span className="text-lg">🇵🇹</span>
                        <span>Portugal</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          handleCountryChange('Reino Unido');
                          setCountryDropdownOpen(false);
                        }}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-white/10 text-left text-sm font-bold transition-all cursor-pointer border-none outline-none ${
                          country === 'Reino Unido' ? 'bg-indigo-600/30 text-indigo-300' : ''
                        }`}
                      >
                        <span className="text-lg">🇬🇧</span>
                        <span>Reino Unido</span>
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Tooltip de Onboarding no 1º acesso */}
                {showTooltip && (
                  <AnimatePresence>
                    <motion.div
                      initial={{ opacity: 0, y: 12, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 12, scale: 0.95 }}
                      className="absolute top-14 left-1/2 -translate-x-1/2 z-50 w-64 bg-slate-900 border border-indigo-500/30 text-white rounded-2xl p-4 shadow-2xl text-center"
                    >
                      {/* Seta do Balão */}
                      <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-b-[6px] border-b-slate-900" />
                      <p className="text-xs font-semibold leading-relaxed text-slate-200">
                        Escolha a sua comunidade para ver anúncios perto de si.
                      </p>
                      <button
                        type="button"
                        onClick={handleOnboardingButtonClick}
                        className="mt-3 text-xs bg-indigo-600 hover:bg-indigo-500 text-white py-1.5 px-4 rounded-full font-bold transition-all shadow-md cursor-pointer hover:scale-105 w-full text-center"
                        id="onboarding-community-select"
                      >
                        Escolher Comunidade
                      </button>
                    </motion.div>
                  </AnimatePresence>
                )}
              </div>

              {/* Botão Localização - Apenas Ícone */}
              <div className="relative group">
                <div className="w-10 h-10 md:w-12 md:h-12 flex items-center justify-center bg-white/10 backdrop-blur-3xl rounded-full border border-white/20 text-white hover:bg-white/25 hover:scale-110 transition-all cursor-pointer shadow-lg" title="Cidade">
                  <MapPin size={18} />
                  <select 
                    value={city} 
                    onChange={(e) => setCity(e.target.value)} 
                    className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                  >
                    <option value="Todas">Cidade / Região</option>
                    {selectableCitiesOnHome.map((c, i) => <option key={i} value={c} className="bg-slate-900">{c}</option>)}
                  </select>
                </div>
              </div>

              {/* Contador de Anúncios Slim */}
              {settings?.showTotalAdsBadge !== false && (
                <div className="h-10 md:h-12 px-5 flex items-center bg-black/30 backdrop-blur-3xl rounded-full border border-white/10 shadow-inner">
                  <span className="text-white font-black text-sm md:text-lg mr-2">
                    {totalApprovedCount !== null ? totalApprovedCount : filteredAds.length}
                  </span>
                  <span className="text-white/60 text-[10px] md:text-xs uppercase font-bold tracking-tighter">Anúncios</span>
                </div>
              )}

              {/* Contador de Utilizadores Slim */}
              {(settings?.showTotalUsersBadge || isModeratorOrAdmin) && totalUsersCount !== null && (
                <div className="h-10 md:h-12 px-5 flex items-center bg-slate-900/40 backdrop-blur-3xl rounded-full border border-indigo-500/30 shadow-inner group relative select-none">
                  <span className="text-indigo-300 font-black text-sm md:text-lg mr-2">
                    {totalUsersCount}
                  </span>
                  <span className="text-indigo-400/80 text-[10px] md:text-xs uppercase font-bold tracking-tighter">Membros</span>
                  
                  {/* Tooltip para admin/moderador se estiver oculto para utilizadores comuns */}
                  {!settings?.showTotalUsersBadge && isModeratorOrAdmin && (
                    <span className="absolute -top-10 left-1/2 -translate-x-1/2 bg-slate-950 border border-indigo-500/40 text-indigo-300 text-[10px] font-bold px-3 py-1 rounded-xl shadow-2xl opacity-0 group-hover:opacity-100 transition-all duration-200 whitespace-nowrap pointer-events-none z-10">
                      🔒 Oculto para o público (Visto por Staff)
                    </span>
                  )}
                </div>
              )}

            </div>
          </motion.div>
        </div>
      </section>

      {/* Etiqueta Informativa de Comunidade */}
      <AnimatePresence mode="wait">
        <motion.div 
          key={country}
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          transition={{ duration: 0.25, ease: "easeInOut" }}
          className="bg-emerald-50/80 border border-emerald-100 rounded-3xl py-2.5 px-4 md:py-4 md:px-6 flex items-center justify-between text-emerald-800 text-sm md:text-base font-semibold shadow-sm transition-all duration-300"
        >
          <div className="flex items-center gap-3">
            <span className="text-2xl leading-none">{getCommunityLabel(country).flag}</span>
            <span className="tracking-tight">{getCommunityLabel(country).text}</span>
          </div>
          <span className="text-xs text-emerald-600/90 font-bold bg-white/60 px-3 py-1 rounded-full border border-emerald-200/50 hidden sm:inline-block uppercase tracking-wider">
            Comunidade Ativa
          </span>
        </motion.div>
      </AnimatePresence>

      {/* ✨ ANÚNCIOS EM DESTAQUE */}
      {filteredFeaturedAds.length > 0 && (
        <section className="space-y-3 md:space-y-4 pt-0.5 pb-2 md:py-2">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <div className="flex items-center gap-2">
              <span className="text-xl">✨</span>
              <div>
                <h2 className="text-base md:text-lg font-black text-slate-800 tracking-tight leading-none">
                  Anúncios em Destaque
                </h2>
                <p className="text-[10px] md:text-xs text-slate-500 font-bold tracking-wide uppercase mt-1">
                  Anúncios promovidos pela comunidade
                </p>
              </div>
            </div>
          </div>
          
          {/* Carrossel Horizontal Responsivo (Esteira Contínua/Marquee) */}
          <div className="relative w-full overflow-hidden py-1">
            <div 
              onMouseEnter={() => setIsHovered(true)}
              onMouseLeave={() => setIsHovered(false)}
              onTouchStart={() => setIsHovered(true)}
              onTouchEnd={() => setIsHovered(false)}
              className="carouselTrack flex gap-4 md:gap-6"
              style={{
                animationName: (settings?.highlightSpeed !== 0) ? 'scrollCarousel' : 'none',
                animationDuration: settings?.highlightSpeed ? `${105 / settings.highlightSpeed}s` : '35s',
                animationTimingFunction: 'linear',
                animationIterationCount: 'infinite',
                animationPlayState: (isHovered || settings?.highlightSpeed === 0) ? 'paused' : 'running',
              }}
            >
              {[...filteredFeaturedAds, ...filteredFeaturedAds].map((ad, idx) => (
                <div key={`${ad.id}-${idx}`} className="w-[140px] sm:w-[165px] md:w-[195px] shrink-0">
                  <AdCard ad={ad} variant="featured" />
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

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

        {hasMore && !loading && (
          <div className="flex justify-center mt-12 pb-8">
            <button
              onClick={handleLoadMore}
              disabled={isFetchingMore}
              className="flex items-center gap-2 px-8 py-3.5 bg-slate-900 hover:bg-slate-800 text-white font-semibold text-sm rounded-full shadow-lg hover:shadow-xl active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300"
            >
              {isFetchingMore ? (
                <>
                  <RefreshCcw className="animate-spin" size={16} />
                  A carregar mais...
                </>
              ) : (
                <>
                  Ver mais anúncios
                  <ArrowRight size={16} />
                </>
              )}
            </button>
          </div>
        )}

        <AnimatePresence>
          {showScrollTop && (
            <motion.button
              initial={{ opacity: 0, scale: 0.8, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.8, y: 15 }}
              onClick={scrollToTop}
              title="Voltar ao topo"
              aria-label="Voltar ao topo"
              className="fixed bottom-6 right-6 z-50 p-3.5 md:p-4 bg-white text-indigo-600 hover:text-indigo-700 border border-slate-150 rounded-full shadow-2xl transition-transform hover:scale-110 active:scale-95 cursor-pointer flex items-center justify-center"
              id="back-to-top-btn"
            >
              <ArrowUp size={20} className="md:w-6 md:h-6" />
            </motion.button>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default Home;