import React, { useState, useEffect, useMemo, useRef } from 'react';
import { collection, query, where, limit, getCountFromServer, orderBy } from 'firebase/firestore';
import { useSearchParams } from 'react-router-dom';
import { db, withTimeout, getDocsWithCacheFallback } from '../firebase';
import { Ad, CITIES, PORTUGAL_CITIES, UK_CITIES } from '../types';
import { useSettings } from '../context/SettingsContext';
import { useAuth } from '../context/AuthContext';
import AdCard from '../components/AdCard';
import { Search, Tag, MapPin, ShoppingBag, ArrowRight, AlertCircle, RefreshCcw, ArrowUp } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
// @ts-ignore
import lisbonAerial from '../assets/images/lisbon_aerial_1780755446715.png';
// @ts-ignore
import londonAerial from '../assets/images/london_aerial_1780755464204.png';

const PAGE_SIZE = 30; 

let lastFetchTime = 0;
let cachedAds: Ad[] = [];
let cachedHasMore = false;
let cachedLimit = PAGE_SIZE;

const Home = () => {
  const { settings, categories } = useSettings();
  const resultsSectionRef = useRef<HTMLDivElement>(null);

  const handleSearchFocus = () => {
    setTimeout(() => {
      if (resultsSectionRef.current) {
        resultsSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 150);
  };
  
  const hexToRgba = (hex: string | undefined, opacity: number | undefined) => {
    const color = hex || '#ffffff';
    const alpha = opacity !== undefined ? opacity / 100 : 0.1;
    const cleanHex = color.replace('#', '');
    const r = parseInt(cleanHex.substring(0, 2), 16) || 255;
    const g = parseInt(cleanHex.substring(2, 4), 16) || 255;
    const b = parseInt(cleanHex.substring(4, 6), 16) || 255;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  };

  const isColorLight = (hex: string | undefined) => {
    if (!hex) return false;
    const cleanHex = hex.replace('#', '');
    const r = parseInt(cleanHex.substring(0, 2), 16) || 255;
    const g = parseInt(cleanHex.substring(2, 4), 16) || 255;
    const b = parseInt(cleanHex.substring(4, 6), 16) || 255;
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.6;
  };

  const hasCustomStyles = settings?.searchGroupBgColor !== undefined || settings?.searchGroupOpacity !== undefined;
  
  const customBg = hasCustomStyles 
    ? hexToRgba(settings?.searchGroupBgColor, settings?.searchGroupOpacity)
    : undefined;

  const customBorder = hasCustomStyles
    ? hexToRgba(settings?.searchGroupBgColor, settings?.searchGroupOpacity === 0 ? 0 : Math.min(100, (settings?.searchGroupOpacity ?? 10) + 15))
    : undefined;

  const isLightText = !(isColorLight(settings?.searchGroupBgColor) && (settings?.searchGroupOpacity || 10) > 40);
  
  const txtColorClass = isLightText ? 'text-white' : 'text-slate-900';
  const txtMutedClass = isLightText ? 'text-white/60' : 'text-slate-900/60';
  const placeholderClass = isLightText ? 'placeholder:text-white/50' : 'placeholder:text-slate-900/50';
  const blurClass = settings?.searchGroupOpacity === 0 ? '' : 'backdrop-blur-3xl';

  const getDropdownBgStyle = (currentCountry: string) => {
    let flagSvg = '';
    if (currentCountry === 'Portugal') {
      flagSvg = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 600 400'%3E%3Crect width='240' height='400' fill='%23006600'/%3E%3Crect x='240' width='360' height='400' fill='%23ff0000'/%3E%3Ccircle cx='240' cy='200' r='65' fill='%23ffe600'/%3E%3Cpath d='M240,165 v70 M205,200 h70' stroke='%23ff0000' stroke-width='10'/%3E%3C/svg%3E")`;
    } else if (currentCountry === 'Reino Unido') {
      flagSvg = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 60 30'%3E%3Crect width='60' height='30' fill='%23012169'/%3E%3Cpath d='M0%2C0 L60%2C30 M60%2C0 L0%2C30' stroke='%23fff' stroke-width='6'/%3E%3Cpath d='M0%2C0 L60%2C30 M60%2C0 L0%2C30' stroke='%23c8102e' stroke-width='4'/%3E%3Cpath d='M0%2C15 H60 M30%2C0 V30' stroke='%23fff' stroke-width='10'/%3E%3Cpath d='M0%2C15 H60 M30%2C0 V30' stroke='%23c8102e' stroke-width='6'/%3E%3C/svg%3E")`;
    } else {
      return { backgroundColor: '#0f172a' };
    }
    return {
      backgroundImage: flagSvg,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
    };
  };

  const getFlagBgStyle = (currentCountry: string) => {
    let flagSvg = '';
    if (currentCountry === 'Portugal') {
      flagSvg = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 600 400'%3E%3Crect width='240' height='400' fill='%23006600'/%3E%3Crect x='240' width='360' height='400' fill='%23ff0000'/%3E%3Ccircle cx='240' cy='200' r='65' fill='%23ffe600'/%3E%3Cpath d='M240,165 v70 M205,200 h70' stroke='%23ff0000' stroke-width='10'/%3E%3C/svg%3E")`;
    } else if (currentCountry === 'Reino Unido') {
      flagSvg = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 60 30'%3E%3Crect width='60' height='30' fill='%23012169'/%3E%3Cpath d='M0%2C0 L60%2C30 M60%2C0 L0%2C30' stroke='%23fff' stroke-width='6'/%3E%3Cpath d='M0%2C0 L60%2C30 M60%2C0 L0%2C30' stroke='%23c8102e' stroke-width='4'/%3E%3Cpath d='M0%2C15 H60 M30%2C0 V30' stroke='%23fff' stroke-width='10'/%3E%3Cpath d='M0%2C15 H60 M30%2C0 V30' stroke='%23c8102e' stroke-width='6'/%3E%3C/svg%3E")`;
    } else {
      return {
        backgroundColor: customBg || 'rgba(255,255,255,0.25)',
      };
    }

    const userOpacity = settings?.searchGroupOpacity !== undefined ? settings.searchGroupOpacity / 100 : 0.25;
    
    // Dynamically inject opacity attribute in original SVG node string for exact alpha control
    const dimmedFlagSvg = flagSvg.replace('%3Csvg', `%3Csvg opacity='${userOpacity}'`);

    const overlayColor = hasCustomStyles
      ? hexToRgba(settings?.searchGroupBgColor, settings?.searchGroupOpacity)
      : (isLightText ? 'rgba(15, 23, 42, 0.45)' : 'rgba(255, 255, 255, 0.45)');

    return {
      backgroundImage: `linear-gradient(${overlayColor}, ${overlayColor}), ${dimmedFlagSvg}`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
    };
  };

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
  const [totalUsersCount, setTotalUsersCount] = useState<number | null>(null);

  // Estados de paginação de 30 em 30 itens
  const [limitAmount, setLimitAmount] = useState(PAGE_SIZE);
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

  // Resetar paginação ao alterar qualquer filtro principal
  useEffect(() => {
    setLimitAmount(PAGE_SIZE);
  }, [country, category, city, searchTerm]);

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
    const fetchAds = async () => {
      setLoading(true);
      setErrorMsg(null);

      // Delay visual rápido e subtil de carregamento inicial
      await new Promise(resolve => setTimeout(resolve, 800));
      if (!active) return;

      try {
        let snapshot;
        // Primeira tentativa: Buscar anúncios ordenados pela criação (createdAt desc), limitando a 1000 documentos
        try {
          const q = query(
            collection(db, 'ads'),
            where('status', '==', 'approved'),
            // @ts-ignore
            orderBy('createdAt', 'desc'),
            limit(1000)
          );
          snapshot = await withTimeout(getDocsWithCacheFallback(q, 'home/approved-ads-ordered'), 20000);
        } catch (idxErr) {
          console.warn("[Home] Query ordenada falhou (falta de índice composto), recorrendo a query plana e ordenação em memória:", idxErr);
          const q = query(
            collection(db, 'ads'),
            where('status', '==', 'approved'),
            limit(1000)
          );
          snapshot = await withTimeout(getDocsWithCacheFallback(q, 'home/approved-ads-flat'), 20000);
        }

        if (!active) return;

        const docs = snapshot.docs;
        const adsData = docs.map(doc => ({ id: doc.id, ...doc.data() } as Ad));

        // Garantir ordenação por data de criação de forma estrita em memória para evitar variações não-determinísticas
        adsData.sort((a, b) => {
          const timeA = a.createdAt?.seconds ? a.createdAt.seconds * 1000 : (a.createdAt ? new Date(a.createdAt).getTime() : 0);
          const timeB = b.createdAt?.seconds ? b.createdAt.seconds * 1050 : (b.createdAt ? new Date(b.createdAt).getTime() : 0);
          return (timeB || 0) - (timeA || 0);
        });

        setAds(adsData);
      } catch (err: any) {
        console.error("[Home] Erro ao carregar anúncios do Firestore:", err);
        if (active) setErrorMsg("Erro ao carregar anúncios.");
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    fetchAds();
    return () => { active = false; };
  }, []); // Carrega uma única vez ao montar de forma altamente otimizada, ou depende apenas da montagem

  const handleLoadMore = () => {
    if (isFetchingMore) return;
    setIsFetchingMore(true);
    // Simula delay de carregamento estético rápido para transição suave de paginação local
    setTimeout(() => {
      setLimitAmount(prev => prev + PAGE_SIZE);
      setIsFetchingMore(false);
    }, 450);
  };

  const selectableCitiesOnHome = useMemo(() => {
    const defaultCities = country === 'Portugal' ? PORTUGAL_CITIES : UK_CITIES;
    const customCities = ads
      .filter(ad => ad.country === country && ad.city && !defaultCities.includes(ad.city))
      .map(ad => ad.city) as string[];
    const uniqueCustom = Array.from(new Set(customCities)).filter(Boolean).sort();
    return [...defaultCities, ...uniqueCustom];
  }, [country, ads]);

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

  // Contagem calculada de anúncios aprovados em tempo real de acordo com as diretrizes de contexto de país e expiração de anúncios
  const totalApprovedCount = useMemo(() => {
    return ads.filter(ad => {
      const adCountry = ad.country || 'Portugal';
      const isNotExpired = !ad.adStatus || ad.adStatus !== 'expired';
      return adCountry === country && isNotExpired;
    }).length;
  }, [ads, country]);

  // Paginação inteligente de anúncios filtrados em memória (carregamento instantâneo offline-first)
  const displayedAds = useMemo(() => {
    return filteredAds.slice(0, limitAmount);
  }, [filteredAds, limitAmount]);

  const hasMore = useMemo(() => {
    return filteredAds.length > limitAmount;
  }, [filteredAds, limitAmount]);

  return (
    <div className="flex flex-col gap-3 md:gap-6">
      {/* HERO BANNER LUXURY SLIM + PAINEL LUSÓFONO */}
      <section className="relative -mt-6 md:-mt-8 transition-all duration-500">

        {/* Imagem de Fundo dinâmica: Portugal / Reino Unido */}
        <div className="absolute inset-0 z-0 overflow-hidden shadow-2xl rounded-b-[2rem] md:rounded-b-[3rem]">
          <img 
            src={country === 'Portugal' ? lisbonAerial : londonAerial} 
            alt={country} 
            className="w-full h-full object-cover scale-105 transition-all duration-700 ease-in-out"
            referrerPolicy="no-referrer"
          />
          {/* Overlay suave para contraste */}
          <div className="absolute inset-0 bg-gradient-to-b from-black/25 via-black/5 to-black/55 backdrop-saturate-[1.25]" />
          <div className="absolute inset-0 bg-gradient-to-r from-black/35 via-transparent to-black/20 hidden lg:block" />
        </div>

        <div className="relative z-10 mx-auto w-full px-4 sm:px-6 py-3 md:py-8 lg:py-10">
          <motion.div 
            initial={{ opacity: 0, y: 10 }} 
            animate={{ opacity: 1, y: 0 }}
            className="mx-auto max-w-7xl"
          >
            <div className="flex flex-col lg:flex-row gap-4 lg:gap-5 items-stretch">

              {/* Área principal: comunidade ativa */}
              <div className="flex-1 lg:basis-[70%] text-center lg:text-left flex flex-col justify-center min-h-[175px] md:min-h-[340px] lg:min-h-[390px] px-2 sm:px-5 lg:px-10 py-2 sm:py-4 lg:py-8">

                {/* Título com Tipografia Premium */}
                <h1 
                  onClick={() => {
                    setCategory('Todas');
                    setCity('Todas');
                    setSearchTerm('');
                  }}
                  title="Resetar filtros"
                  className="text-2xl sm:text-3xl md:text-5xl lg:text-6xl font-black text-white tracking-tight drop-shadow-[0_4px_8px_rgba(0,0,0,0.75)] mb-1 cursor-pointer hover:opacity-90 active:scale-[0.98] transition-all select-none"
                >
                  Mercado da Língua Portuguesa
                </h1>
                <p className="text-xs md:text-lg font-medium text-white/90 mb-4 md:mb-6 tracking-widest uppercase drop-shadow-md">
                  Conectando o Mundo Lusófono
                </p>

                {/* Barra de Pesquisa Minimalista */}
                <div className="relative w-full max-w-lg mx-auto lg:mx-0 mb-3 md:mb-4 group">
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    onFocus={handleSearchFocus}
                    placeholder="O que procura hoje?"
                    className={`w-full ${blurClass} rounded-full py-3 pl-6 pr-12 ${txtColorClass} ${placeholderClass} outline-none focus:ring-2 focus:ring-white/30 transition-all shadow-xl text-sm border`}
                    style={{
                      backgroundColor: customBg || 'rgba(255,255,255,0.1)',
                      borderColor: customBorder || 'rgba(255,255,255,0.2)',
                    }}
                  />
                  <div className="absolute inset-y-0 right-4 flex items-center pointer-events-none">
                    <Search size={18} className={`${txtMutedClass} group-focus-within:${txtColorClass} transition-colors`} />
                  </div>
                </div>

                {/* Ícones de Filtro e Contador */}
                <div className="flex items-center justify-center lg:justify-start gap-3 md:gap-4 flex-wrap">

                  {/* Botão Categoria - Apenas Ícone */}
                  <div className="relative group">
                    <div 
                      style={{
                        backgroundColor: customBg || 'rgba(255,255,255,0.1)',
                        borderColor: customBorder || 'rgba(255,255,255,0.2)',
                      }}
                      className={`w-10 h-10 md:w-12 md:h-12 flex items-center justify-center ${blurClass} rounded-full border ${txtColorClass} hover:opacity-85 hover:scale-110 transition-all cursor-pointer shadow-lg`} 
                      title="Categoria"
                    >
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
                      style={{
                        borderColor: customBorder || 'rgba(255,255,255,0.4)',
                        ...getFlagBgStyle(country)
                      }}
                      className={`h-10 md:h-12 px-4 md:px-5 flex items-center gap-2 ${blurClass} rounded-full border ${txtColorClass} hover:opacity-90 hover:scale-105 active:scale-95 transition-all cursor-pointer shadow-lg font-bold text-xs md:text-sm tracking-tight outline-none select-none`}
                      title="Mudar de Comunidade"
                      id="community-toggle-button"
                    >
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
                          style={getDropdownBgStyle(country)}
                          className="absolute right-0 md:left-0 md:right-auto top-12 md:top-14 z-[9999] w-48 border border-white/10 text-white rounded-2xl p-2.5 shadow-2xl flex flex-col gap-1.5"
                        >
                          <button
                            type="button"
                            onClick={() => {
                              handleCountryChange('Portugal');
                              setCountryDropdownOpen(false);
                            }}
                            className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-left text-sm font-black transition-all cursor-pointer border border-white/15 select-none ${
                              country === 'Portugal' 
                                ? 'bg-indigo-600 text-white shadow-[0_0_12px_rgba(99,102,241,0.4)] ring-1 ring-white/20' 
                                : 'bg-slate-950/85 hover:bg-slate-900/95 hover:scale-[1.02] text-white'
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
                            className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-left text-sm font-black transition-all cursor-pointer border border-white/15 select-none ${
                              country === 'Reino Unido' 
                                ? 'bg-indigo-600 text-white shadow-[0_0_12px_rgba(99,102,241,0.4)] ring-1 ring-white/20' 
                                : 'bg-slate-950/85 hover:bg-slate-900/95 hover:scale-[1.02] text-white'
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
                          className="absolute top-14 left-1/2 -translate-x-1/2 z-[9998] w-64 bg-slate-900 border border-indigo-500/30 text-white rounded-2xl p-4 shadow-2xl text-center"
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
                    <div 
                      style={{
                        backgroundColor: customBg || 'rgba(255,255,255,0.1)',
                        borderColor: customBorder || 'rgba(255,255,255,0.2)',
                      }}
                      className={`w-10 h-10 md:w-12 md:h-12 flex items-center justify-center ${blurClass} rounded-full border ${txtColorClass} hover:opacity-85 hover:scale-110 transition-all cursor-pointer shadow-lg`} 
                      title="Cidade"
                    >
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
                  {(settings?.showTotalAdsBadge === true || isModeratorOrAdmin) && (
                    <div 
                      style={{
                        backgroundColor: customBg || 'rgba(0,0,0,0.3)',
                        borderColor: customBorder || 'rgba(255,255,255,0.1)',
                      }}
                      className={`h-10 md:h-12 px-4 md:px-5 flex items-center ${blurClass} rounded-full border shadow-inner group relative select-none`}
                    >
                      <span className={`${txtColorClass} font-black text-sm md:text-lg mr-2`}>
                        {totalApprovedCount !== null ? totalApprovedCount : filteredAds.length}
                      </span>
                      <span className={`${txtMutedClass} text-[10px] md:text-xs uppercase font-bold tracking-tighter`}>Anúncios</span>

                      {!settings?.showTotalAdsBadge && isModeratorOrAdmin && (
                        <span className="absolute -top-10 left-1/2 -translate-x-1/2 bg-slate-950 border border-indigo-500/40 text-indigo-300 text-[10px] font-bold px-3 py-1 rounded-xl shadow-2xl opacity-0 group-hover:opacity-100 transition-all duration-200 whitespace-nowrap pointer-events-none z-10">
                          🔒 Oculto para o público (Visto por Staff)
                        </span>
                      )}
                    </div>
                  )}

                  {/* Contador de Utilizadores Slim */}
                  {(settings?.showTotalUsersBadge || isModeratorOrAdmin) && totalUsersCount !== null && (
                    <div 
                      style={{
                        backgroundColor: customBg || 'rgba(15,23,42,0.4)',
                        borderColor: customBorder || 'rgba(99,102,241,0.3)',
                      }}
                      className={`h-10 md:h-12 px-4 md:px-5 flex items-center ${blurClass} rounded-full border shadow-inner group relative select-none`}
                    >
                      <span className={`${isLightText ? 'text-indigo-300' : 'text-indigo-950'} font-black text-sm md:text-lg mr-2`}>
                        {totalUsersCount}
                      </span>
                      <span className={`${isLightText ? 'text-indigo-400/80' : 'text-indigo-800/80'} text-[10px] md:text-xs uppercase font-bold tracking-tighter`}>Membros</span>

                      {!settings?.showTotalUsersBadge && isModeratorOrAdmin && (
                        <span className="absolute -top-10 left-1/2 -translate-x-1/2 bg-slate-950 border border-indigo-500/40 text-indigo-300 text-[10px] font-bold px-3 py-1 rounded-xl shadow-2xl opacity-0 group-hover:opacity-100 transition-all duration-200 whitespace-nowrap pointer-events-none z-10">
                          🔒 Oculto para o público (Visto por Staff)
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Painel Lusófono compacto no mobile */}
                <div className="lg:hidden mt-4 mx-auto w-full max-w-md rounded-[1.5rem] bg-emerald-950/80 border border-amber-300/25 backdrop-blur-2xl p-3 shadow-2xl">
                  <p className="text-[10px] font-black uppercase tracking-[0.22em] text-amber-300 mb-2">
                    🌍 Comunidade Lusófona
                  </p>
                  <div className="grid grid-cols-9 gap-1.5 text-lg leading-none mb-2">
                    {[
                      { code: 'pt', flag: '🇵🇹' },
                      { code: 'br', flag: '🇧🇷' },
                      { code: 'ao', flag: '🇦🇴' },
                      { code: 'mz', flag: '🇲🇿' },
                      { code: 'cv', flag: '🇨🇻' },
                      { code: 'gw', flag: '🇬🇼' },
                      { code: 'st', flag: '🇸🇹' },
                      { code: 'tl', flag: '🇹🇱' },
                      { code: 'gq', flag: '🇬🇶' },
                    ].map((item, idx) => (
                      <span key={idx} className="flex items-center justify-center rounded-lg bg-white/10 py-1 px-0.5 shadow-inner">
                        <img 
                          src={`https://flagcdn.com/w40/${item.code}.png`} 
                          alt={item.flag} 
                          title={item.flag}
                          className="h-4.5 w-auto object-contain rounded-sm"
                          referrerPolicy="no-referrer"
                        />
                      </span>
                    ))}
                  </div>
                  <p className="text-[10px] text-white/80 font-semibold">
                    Mais de 300 milhões de falantes de português no mundo.
                  </p>
                </div>
              </div>

              {/* Painel lateral: Comunidade Lusófona */}
              <aside className="hidden lg:flex lg:basis-[30%] min-h-[390px] rounded-[2rem] overflow-hidden border border-amber-200/20 bg-gradient-to-br from-emerald-950/95 via-emerald-900/95 to-emerald-950/95 shadow-2xl backdrop-blur-2xl">
                <div className="relative w-full p-6 xl:p-8 flex flex-col justify-center text-center text-white">
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(250,204,21,0.20),transparent_38%)] pointer-events-none" />
                  <div className="relative z-10">
                    <p className="text-amber-300 text-xs font-black uppercase tracking-[0.22em] mb-4">
                      🌍 Comunidade Lusófona
                    </p>
                    <h2 className="text-2xl xl:text-3xl font-black leading-tight mb-2">
                      Mais de 300 milhões
                    </h2>
                    <p className="text-sm xl:text-base font-semibold text-white/85 mb-5">
                      de falantes de português no mundo.
                    </p>

                    <div className="h-px w-24 mx-auto bg-amber-300/50 mb-5" />

                    <div className="grid grid-cols-3 gap-3 xl:gap-4">
                      {[
                        { flag: '🇵🇹', name: 'Portugal', code: 'pt' },
                        { flag: '🇧🇷', name: 'Brasil', code: 'br' },
                        { flag: '🇦🇴', name: 'Angola', code: 'ao' },
                        { flag: '🇲🇿', name: 'Moçambique', code: 'mz' },
                        { flag: '🇨🇻', name: 'Cabo Verde', code: 'cv' },
                        { flag: '🇬🇼', name: 'Guiné-Bissau', code: 'gw' },
                        { flag: '🇸🇹', name: 'São Tomé', code: 'st' },
                        { flag: '🇹🇱', name: 'Timor-Leste', code: 'tl' },
                        { flag: '🇬🇶', name: 'Guiné Eq.', code: 'gq' },
                      ].map((item) => (
                        <div key={item.name} className="rounded-2xl bg-white/8 border border-white/10 p-2.5 shadow-inner hover:bg-white/12 transition-colors flex flex-col items-center justify-center">
                          <img 
                            src={`https://flagcdn.com/w80/${item.code}.png`} 
                            alt={item.flag} 
                            title={item.name}
                            className="h-6.5 w-auto object-contain rounded shadow-sm mb-1"
                            referrerPolicy="no-referrer"
                          />
                          <div className="text-[10px] font-bold text-white/85 leading-tight">{item.name}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </aside>
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
          className="bg-emerald-50/80 border border-emerald-100 rounded-2xl py-1 px-3 md:py-2 md:px-5 flex items-center justify-between text-emerald-800 text-xs md:text-sm font-semibold shadow-sm transition-all duration-300 -my-2 md:-my-1"
        >
          <div className="flex items-center gap-3">
            <span className="text-xl md:text-2xl leading-none">{getCommunityLabel(country).flag}</span>
            <span className="tracking-tight">{getCommunityLabel(country).text}</span>
          </div>
          <span className="text-[10px] md:text-xs text-emerald-600/90 font-bold bg-white/60 px-3 py-1 rounded-full border border-emerald-200/50 hidden sm:inline-block uppercase tracking-wider">
            Comunidade Ativa
          </span>
        </motion.div>
      </AnimatePresence>

      {/* ✨ ANÚNCIOS EM DESTAQUE */}
      {filteredFeaturedAds.length > 0 && (
        <section className="space-y-2 md:space-y-3 pt-0 pb-2 md:py-1">
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
      <div ref={resultsSectionRef} className="px-0">
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
            {displayedAds.map((ad) => (
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