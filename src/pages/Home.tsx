import React, { useState, useEffect, useMemo, useRef } from 'react';
import { collection, query, where, limit, getCountFromServer, orderBy } from 'firebase/firestore';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { db, withTimeout, getDocsWithCacheFallback } from '../firebase';
import { Ad, CITIES, PORTUGAL_CITIES, UK_CITIES } from '../types';
import { useSettings } from '../context/SettingsContext';
import { useAuth } from '../context/AuthContext';
import { 
  getCachedAds, 
  setCachedAds, 
  getLastFetchTime, 
  getCachedFeaturedAds, 
  setCachedFeaturedAds, 
  getLastFeaturedFetchTime,
  clearHomeCache
} from '../utils/cache';
import AdCard from '../components/AdCard';
import { Search, Tag, MapPin, ShoppingBag, ArrowRight, AlertCircle, RefreshCcw, ArrowUp, Store } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
// @ts-ignore
import lisbonAerial from '../assets/images/lisbon_aerial_1780755446715.png';
// @ts-ignore
import londonAerialOriginalStandby from '../assets/images/london_aerial_1780755464204.png';
// Nova foto bem clara, nítida e com aspeto de dia radiante:
const londonAerialSunny = "https://images.unsplash.com/photo-1505761671935-60b6a7453675?auto=format&fit=crop&w=1600&q=80";

import { useClickOutside } from '../hooks/useClickOutside';

const PAGE_SIZE = 30; 

const Home = () => {
  const { settings, categories } = useSettings();
  const resultsSectionRef = useRef<HTMLDivElement>(null);
  const [londonBg, setLondonBg] = useState(londonAerialSunny);

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
    ? hexToRgba(settings?.searchGroupBgColor, Math.max(50, Math.min(100, (settings?.searchGroupOpacity ?? 10) + 25)))
    : undefined;

  const isLightText = !(isColorLight(settings?.searchGroupBgColor) && (settings?.searchGroupOpacity || 10) > 40);
  
  const txtColorClass = isLightText ? 'text-white' : 'text-slate-900';
  const txtMutedClass = isLightText ? 'text-white/75' : 'text-slate-900/75';
  const placeholderClass = isLightText 
    ? 'placeholder:text-white/80 placeholder:font-black placeholder:tracking-wide placeholder:uppercase placeholder:text-[10px] sm:placeholder:text-[11px]' 
    : 'placeholder:text-slate-900/80 placeholder:font-black placeholder:tracking-wide placeholder:uppercase placeholder:text-[10px] sm:placeholder:text-[11px]';
  const blurClass = settings?.searchGroupOpacity === 0 ? '' : 'backdrop-blur-3xl';

  const getFlagSvgUrl = (currentCountry: string) => {
    if (currentCountry === 'Portugal') {
      return `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 600 400'%3E%3Crect width='240' height='400' fill='%23006600'/%3E%3Crect x='240' width='360' height='400' fill='%23ff0000'/%3E%3Ccircle cx='240' cy='200' r='65' fill='%23ffe600'/%3E%3Cpath d='M240,165 v70 M205,200 h70' stroke='%23ff0000' stroke-width='10'/%3E%3C/svg%3E`;
    } else if (currentCountry === 'Reino Unido') {
      return `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 60 30'%3E%3Crect width='60' height='30' fill='%23012169'/%3E%3Cpath d='M0%2C0 L60%2C30 M60%2C0 L0%2C30' stroke='%23fff' stroke-width='6'/%3E%3Cpath d='M0%2C0 L60%2C30 M60%2C0 L0%2C30' stroke='%23c8102e' stroke-width='4'/%3E%3Cpath d='M0%2C15 H60 M30%2C0 V30' stroke='%23fff' stroke-width='10'/%3E%3Cpath d='M0%2C15 H60 M30%2C0 V30' stroke='%23c8102e' stroke-width='6'/%3E%3C/svg%3E`;
    }
    return '';
  };

  const { user, profile, isAdmin, loading: authLoading } = useAuth();
  const isModeratorOrAdmin = isAdmin || profile?.role === 'admin' || profile?.role === 'moderator';
  // Só consideramos administrador confirmado para consultas restritas de contagem de users.
  const isConfirmedAdminOnly = !authLoading && profile?.role === 'admin';
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const [ads, setAds] = useState<Ad[]>([]);
  const [featuredAds, setFeaturedAds] = useState<Ad[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [reloadCounter, setReloadCounter] = useState(0);
  const [category, setCategory] = useState('Todas');
  const [city, setCity] = useState('Todas');
  const [filterRegion, setFilterRegion] = useState(false);
  const [filterNational, setFilterNational] = useState(false);
  const [filterOnline, setFilterOnline] = useState(false);
  
  const [country, setCountry] = useState<'Portugal' | 'Reino Unido'>(() => {
    // 1. Check URL parameters first for initial load precision
    try {
      const params = new URLSearchParams(window.location.search);
      const urlCountry = params.get('country') as 'Portugal' | 'Reino Unido' | null;
      if (urlCountry === 'Portugal' || urlCountry === 'Reino Unido') {
        return urlCountry;
      }
    } catch (e) {
      console.warn("Could not determine country from URL parameters:", e);
    }

    // 2. Check localStorage second
    const saved = localStorage.getItem('selectedCountry') as 'Portugal' | 'Reino Unido' | null;
    if (saved === 'Portugal' || saved === 'Reino Unido') return saved;
    
    // 3. Try safe detection based on browser timezone and language
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
    
    // 4. Fallback per instructions: Reino Unido
    return 'Reino Unido';
  });

  const [searchTerm, setSearchTerm] = useState('');
  const [totalUsersCount, setTotalUsersCount] = useState<number | null>(null);
  const [featuredVitrines, setFeaturedVitrines] = useState<any[]>([]);
  const [vitrinesLoading, setVitrinesLoading] = useState(true);

  // Estados de paginação de 30 em 30 itens
  const [limitAmount, setLimitAmount] = useState(PAGE_SIZE);
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  const [dbLimit, setDbLimit] = useState(48);
  const [allDbAdsFetched, setAllDbAdsFetched] = useState(false);

  // State to pause marquee on hover
  const [isHovered, setIsHovered] = useState(false);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [isSearchHovered, setIsSearchHovered] = useState(false);

  // Onboarding states for country selection
  const [showTooltip, setShowTooltip] = useState(false);
  const [shouldAnimateButton, setShouldAnimateButton] = useState(false);

  // Custom Dropdown states
  const [countryDropdownOpen, setCountryDropdownOpen] = useState(false);
  const [mobileCountryDropdownOpen, setMobileCountryDropdownOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(true);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const mobileCountryDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Manter controle atualizado do país selecionado em uma ref mutável para o cleanup do useEffect
  const countryRef = useRef(country);
  useEffect(() => {
    countryRef.current = country;
  }, [country]);

  // Controle de requisições de anúncios gerais
  const inFlightAdsCountry = useRef<'Portugal' | 'Reino Unido' | null>(null);
  const fetchedAdsCountry = useRef<'Portugal' | 'Reino Unido' | null>(null);
  const fetchedLimit = useRef<number>(48);

  // Controle de requisições de anúncios destacados
  const inFlightFeaturedCountry = useRef<'Portugal' | 'Reino Unido' | null>(null);
  const fetchedFeaturedCountry = useRef<'Portugal' | 'Reino Unido' | null>(null);

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

  // Click outside to close dropdown using unified hook
  useClickOutside(dropdownRef, () => {
    setCountryDropdownOpen(false);
  });

  useClickOutside(mobileCountryDropdownRef, () => {
    setMobileCountryDropdownOpen(false);
  });

  // Handle Country Change
  const handleCountryChange = (val: 'Portugal' | 'Reino Unido') => {
    setCountry(val);
    setCity('Todas');
    localStorage.setItem('selectedCountry', val);
    setShowTooltip(false);

    // Sync country URL parameter to prevent useSearchParams useEffect from reverting the value
    const currentParams = new URLSearchParams(window.location.search);
    currentParams.set('country', val);
    setSearchParams(currentParams);
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
    setDbLimit(48);
    setAllDbAdsFetched(false);
  }, [country, category, city, searchTerm]);

  // Buscar total de utilizadores no banco de dados se permitido/configurado
  useEffect(() => {
    let active = true;

    // Log de diagnóstico temporário para confirmar quem e por que está executando a contagem de users
    console.log('[ROLE DEBUG]', {
      authLoading,
      isAdmin,
      profileRole: profile?.role,
      uid: user?.uid,
      email: user?.email,
      isConfirmedAdminOnly
    });

    // Se ainda está carregando a autenticação ou perfil, não podemos confirmar se é admin/moderador
    if (authLoading) {
      console.log('[USERS COUNT] skipped for non-admin (auth loading incerteza)');
      if (active) {
        setTotalUsersCount(852); // Fallback estático seguro
      }
      return;
    }

    // Se de fato não é admin confirmado, use o fallback estático e não execute a consulta
    if (!isConfirmedAdminOnly) {
      if (profile?.role === 'moderator') {
        console.log('[USERS COUNT] skipped for moderator');
      } else {
        console.log('[USERS COUNT] skipped for non-admin');
      }
      if (active) {
        setTotalUsersCount(852); // Fallback estático seguro
      }
      return;
    }

    const fetchUsersCount = async () => {
      console.log('[USERS COUNT] running for admin');
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
  }, [settings?.showTotalUsersBadge, isConfirmedAdminOnly, authLoading]);

  // Buscar vitrines (empreendedores) ativas e seus produtos para destaque na Home
  useEffect(() => {
    let active = true;
    const fetchVitrines = async () => {
      setVitrinesLoading(true);
      try {
        const q = query(
          collection(db, 'sellerPublicProfiles'),
          where('showcaseActive', '==', true)
        );
        const snap = await getDocsWithCacheFallback(q, 'home/active-showcases');
        
        let allVitrines = snap.docs.map(docSnap => ({
          uid: docSnap.id,
          ...docSnap.data()
        }));

        // Filtragem por país e aprovação da moderação para robustez sem exigir índice composto
        allVitrines = allVitrines.filter((v: any) => v.country === country && v.showcaseApproved === true);

        const loadedVitrines = await Promise.all(
          allVitrines.map(async (v: any) => {
            let productsCount = 0;
            try {
              const pRef = query(
                collection(db, 'sellerPublicProfiles', v.uid, 'products'),
                where('active', '==', true)
              );
              const pSnap = await getDocsWithCacheFallback(pRef, `products_active_${v.uid}`);
              productsCount = pSnap.size;
            } catch (err) {
              console.error('Erro ao buscar produtos da vitrine no Home para', v.uid, err);
            }
            return {
              ...v,
              productsCount
            };
          })
        );

        if (active) {
          // Ordenação: mais produtos desc, updatedAt desc
          loadedVitrines.sort((a: any, b: any) => {
            if (b.productsCount !== a.productsCount) {
              return b.productsCount - a.productsCount;
            }
            const timeA = a.updatedAt?.toMillis ? a.updatedAt.toMillis() : (a.updatedAt ? new Date(a.updatedAt).getTime() : 0);
            const timeB = b.updatedAt?.toMillis ? b.updatedAt.toMillis() : (b.updatedAt ? new Date(b.updatedAt).getTime() : 0);
            return timeB - timeA;
          });

          setFeaturedVitrines(loadedVitrines.slice(0, 10));
        }
      } catch (err) {
        console.error('Erro ao buscar vitrines em destaque na Home:', err);
      } finally {
        if (active) {
          setVitrinesLoading(false);
        }
      }
    };

    fetchVitrines();
    return () => { active = false; };
  }, [country]);

  // Buscar anúncios destacados para carrossel no topo
  useEffect(() => {
    // Se ainda está carregando a autenticação e não temos país explícito definido pelo utilizador, 
    // esperamos para não disparar consultas desnecessárias de Reino Unido (fallback) antes do perfil estar pronto
    const hasExplicitCountry = localStorage.getItem('selectedCountry') || 
      new URLSearchParams(window.location.search).get('country');
    if (authLoading && !hasExplicitCountry) {
      console.log('[FEATURED ADS] loading delayed until auth load complete');
      return;
    }

    // Se já foi buscado com sucesso para este país, evitamos chamar novamente
    if (fetchedFeaturedCountry.current === country) {
      console.log(`[FEATURED ADS] Já carregado com sucesso para o país: ${country}`);
      return;
    }

    // Se já existe uma requisição em andamento para este mesmo país, não iniciamos outra
    if (inFlightFeaturedCountry.current === country) {
      console.log(`[FEATURED ADS] Fetch em andamento para o país: ${country}`);
      return;
    }
    inFlightFeaturedCountry.current = country;

    let active = true;
    const fetchFeatured = async () => {
      // Verificação de cache de sessão de 5 minutos
      const now = Date.now();
      const featuredFromCache = getCachedFeaturedAds(country);
      const lastFeaturedFetch = getLastFeaturedFetchTime(country);
      if (lastFeaturedFetch > 0 && (now - lastFeaturedFetch < 5 * 60 * 1000)) {
        console.log(`[Cache HIT] Recuperou destacados da sessão (${country}). Total: ${featuredFromCache.length}`);
        setFeaturedAds(featuredFromCache);
        fetchedFeaturedCountry.current = country;
        inFlightFeaturedCountry.current = null;
        return;
      }
      try {
        const qPaid = query(
          collection(db, 'ads'),
          where('status', '==', 'approved'),
          where('isFeatured', '==', true),
          where('country', '==', country),
          limit(20)
        );
        const qPerm = query(
          collection(db, 'ads'),
          where('status', '==', 'approved'),
          where('isPermanentFeatured', '==', true)
        );

        const [paySnap, permSnap] = await Promise.all([
          getDocsWithCacheFallback(qPaid, `home/featured-ads/${country}`),
          getDocsWithCacheFallback(qPerm, `home/featured-permanent`)
        ]);

        if (!active) return;

        const payDocs = paySnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Ad));
        const permDocs = permSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Ad));

        const allDocs = [...payDocs];
        permDocs.forEach(pAd => {
          if (!allDocs.some(f => f.id === pAd.id)) {
            allDocs.push(pAd);
          }
        });
        
        setCachedFeaturedAds(allDocs, country);
        setFeaturedAds(allDocs);
        fetchedFeaturedCountry.current = country;
      } catch (err) {
        console.error('Erro ao buscar anúncios destacados:', err);
        // Se der erro, limpamos as refs para permitir nova tentativa
        fetchedFeaturedCountry.current = null;
      } finally {
        if (active) {
          inFlightFeaturedCountry.current = null;
        }
      }
    };
    fetchFeatured();
    return () => { 
      // Apenas consideramos inativo se houver real mudança de país.
      if (countryRef.current !== country) {
        active = false;
        inFlightFeaturedCountry.current = null;
      }
    };
  }, [country, authLoading]);

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
    // Se ainda está carregando a autenticação e não temos país explícito definido pelo utilizador, 
    // esperamos para não disparar consultas desnecessárias de Reino Unido (fallback) antes do perfil estar pronto
    const hasExplicitCountry = localStorage.getItem('selectedCountry') || 
      new URLSearchParams(window.location.search).get('country');
    if (authLoading && !hasExplicitCountry) {
      console.log('[ADS] loading delayed until auth load complete');
      return;
    }

    // Se já foi carregado com sucesso para este país E com o mesmo limite, evitamos chamar novamente
    if (fetchedAdsCountry.current === country && fetchedLimit.current === dbLimit) {
      console.log(`[ADS] Já carregado com sucesso para o país: ${country} com limite ${dbLimit}`);
      return;
    }

    // Se já existe uma requisição em andamento para este mesmo país, não iniciamos outra
    if (inFlightAdsCountry.current === country) {
      if (fetchedLimit.current === dbLimit) {
        console.log(`[ADS] Fetch em andamento para o país: ${country}`);
        return;
      }
    }
    inFlightAdsCountry.current = country;

    let active = true;
    const fetchAds = async () => {
      // Verificação de cache de sessão de 5 minutos
      const now = Date.now();
      const adsFromCache = getCachedAds(country);
      const lastFetch = getLastFetchTime(country);
      if (adsFromCache && adsFromCache.length >= dbLimit && (now - lastFetch < 5 * 60 * 1000)) {
        console.log(`[Cache HIT] Recuperou anúncios gerais da sessão (${country}). Total:`, adsFromCache.length);
        setAds(adsFromCache);
        setLoading(false);
        setIsFetchingMore(false);
        fetchedAdsCountry.current = country;
        fetchedLimit.current = dbLimit;
        inFlightAdsCountry.current = null;
        return;
      }

      const isLoadMore = dbLimit > 48 || ads.length > 0;
      if (!isLoadMore) {
        setLoading(true);
      } else {
        setIsFetchingMore(true);
      }
      setErrorMsg(null);

      // Delay visual rápido e subtil de carregamento inicial apenas se não for load-more
      if (!isLoadMore) {
        await new Promise(resolve => setTimeout(resolve, 800));
      }
      if (!active) return;

      try {
        let snapshot;
        // Primeira tentativa: Buscar anúncios ordenados pela criação (createdAt desc), limitando a dbLimit documentos (otimização de leituras)
        try {
          const q = query(
            collection(db, 'ads'),
            where('status', '==', 'approved'),
            where('country', '==', country),
            // @ts-ignore
            orderBy('createdAt', 'desc'),
            limit(dbLimit)
          );
          snapshot = await withTimeout(getDocsWithCacheFallback(q, `home/approved-ads-${country}-ordered-${dbLimit}`), 20000);
        } catch (idxErr) {
          console.warn("[Home] Query ordenada falhou (falta de índice composto), recorrendo a query plana e ordenação em memória:", idxErr);
          const q = query(
            collection(db, 'ads'),
            where('status', '==', 'approved'),
            where('country', '==', country),
            limit(dbLimit)
          );
          snapshot = await withTimeout(getDocsWithCacheFallback(q, `home/approved-ads-${country}-flat-${dbLimit}`), 20000);
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

        if (adsData.length < dbLimit) {
          setAllDbAdsFetched(true);
        } else {
          setAllDbAdsFetched(false);
        }

        setCachedAds(adsData, country);
        setAds(adsData);
        fetchedAdsCountry.current = country;
        fetchedLimit.current = dbLimit;
      } catch (err: any) {
        console.error("[Home] Erro ao carregar anúncios do Firestore:", err);
        if (active) setErrorMsg("Erro ao carregar anúncios.");
        // Se der erro, limpamos as refs para permitir nova tentativa
        fetchedAdsCountry.current = null;
      } finally {
        if (active) {
          setLoading(false);
          setIsFetchingMore(false);
          inFlightAdsCountry.current = null;
        }
      }
    };

    fetchAds();
    return () => { 
      // Apenas consideramos inativo se houver real mudança de país.
      if (countryRef.current !== country) {
        active = false;
        inFlightAdsCountry.current = null;
      }
    };
  }, [country, authLoading, reloadCounter, dbLimit]); // Recarrega sempre que mudar de país ou com dbLimit

  const handleLoadMore = () => {
    if (isFetchingMore) return;
    
    // Incrementa o limitAmount de anúncios mostrados na tela
    const nextLimitAmount = limitAmount + PAGE_SIZE;
    setLimitAmount(nextLimitAmount);
    
    // Se não tivermos anúncios suficientes carregados offline no estado ads
    // E soubermos que ainda existem anúncios a buscar no Firestore
    if (nextLimitAmount > ads.length && !allDbAdsFetched) {
      setIsFetchingMore(true);
      setDbLimit(prev => prev + 48);
    }
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
      if (ad.category === 'Trabalho/Empregos') return false;
      
      const search = searchTerm.toLowerCase().trim();
      const matchesSearch = !search || ad.title?.toLowerCase().includes(search) || ad.description?.toLowerCase().includes(search);
      const matchesStatus = ad.status === 'approved' && (ad.adStatus === 'active' || ad.adStatus === 'sold' || !ad.adStatus);
      if (!matchesSearch || !matchesStatus) return false;

      // Allow country match or Ambos (for permanent)
      const adCountry = ad.country || 'Portugal';
      const matchesCountry = adCountry === country || (ad.isPermanentFeatured && adCountry === 'Ambos');
      if (!matchesCountry) return false;

      // Category filter
      if (category !== 'Todas' && ad.category !== category) return false;

      // Service coverage filter
      const isServiceCategory = category === 'Serviços' || category?.startsWith('Serviços') || category?.includes('Serviços');
      if (isServiceCategory && (filterRegion || filterNational || filterOnline)) {
        const coverage = ad.serviceCoverage || 'city';
        let matchesServiceFilter = false;
        
        if (filterRegion && (coverage === 'city' || coverage === 'radius20' || coverage === 'radius50' || coverage === 'county')) {
          matchesServiceFilter = true;
        }
        if (filterNational) {
          if (country === 'Reino Unido' && coverage === 'uk') matchesServiceFilter = true;
          if (country === 'Portugal' && coverage === 'portugal') matchesServiceFilter = true;
        }
        if (filterOnline && coverage === 'online') {
          matchesServiceFilter = true;
        }
        
        if (!matchesServiceFilter) return false;
      }

      // City / Regional limits
      const isNational = ad.featuredLevel === 'national' || ad.plan === 'national' || !ad.featuredLevel;
      if (city !== 'Todas') {
        const isLocal = ad.featuredLevel === 'local' || ad.plan === 'local' || ad.plan === 'highlight' || ad.plan === 'intermediate';
        if (isLocal) {
          if (ad.city?.toLowerCase().trim() !== city.toLowerCase().trim()) return false;
        } else if (!isNational) {
          return false;
        }
      } else {
        // city === 'Todas': show National (or all permanent if national or without city constraints)
        if (!isNational) return false;
      }

      return true;
    });

    // Check expiration only for non-permanent ads
    const filteredActivePaid = result.filter(ad => {
      if (ad.isPermanentFeatured) return false;
      if (!ad.isFeatured || !ad.featuredUntil) return false;
      
      const featuredUntilDate = ad.featuredUntil.seconds
        ? ad.featuredUntil.toDate()
        : new Date(ad.featuredUntil);
      return featuredUntilDate > now;
    });

    const filteredActivePermanent = result.filter(ad => ad.isPermanentFeatured);

    // Priorities:
    // 1. Destaques Nacionais ativos
    // 2. Destaques Locais ativos
    // 3. Destaques Permanentes
    const paidNational = filteredActivePaid.filter(ad => ad.featuredLevel === 'national' || ad.plan === 'national' || !ad.featuredLevel);
    const paidLocal = filteredActivePaid.filter(ad => ad.featuredLevel === 'local' || ad.plan === 'local' || ad.plan === 'highlight' || ad.plan === 'intermediate');

    const sortByFeaturedUntilDesc = (a: Ad, b: Ad) => {
      const timeA = a.featuredUntil?.seconds ? a.featuredUntil.seconds * 1000 : new Date(a.featuredUntil).getTime();
      const timeB = b.featuredUntil?.seconds ? b.featuredUntil.seconds * 1000 : new Date(b.featuredUntil).getTime();
      return (timeB || 0) - (timeA || 0);
    };

    paidNational.sort(sortByFeaturedUntilDesc);
    paidLocal.sort(sortByFeaturedUntilDesc);

    // Sort permanent highlights by creation date descending
    filteredActivePermanent.sort((a, b) => {
      const timeA = a.createdAt?.seconds ? a.createdAt.seconds * 1000 : new Date(a.createdAt).getTime();
      const timeB = b.createdAt?.seconds ? b.createdAt.seconds * 1000 : new Date(b.createdAt).getTime();
      return (timeB || 0) - (timeA || 0);
    });

    // Combine them in priority order: Paid National, Paid Local, Permanent Featured
    let finalResult = [...paidNational, ...paidLocal, ...filteredActivePermanent];

    return finalResult.slice(0, 50);
  }, [featuredAds, searchTerm, category, city, country, filterRegion, filterNational, filterOnline]);

  const marqueeData = useMemo(() => {
    if (filteredFeaturedAds.length === 0) return { items: [], duration: '35s' };
    // Para um loop contínuo elegante e 100% livre de espaços vazios ou saltos,
    // o conjunto base de itens (sem duplicação) precisa estender-se além do limite
    // visual das maiores telas. Usamos no mínimo 12 itens no conjunto base.
    const targetCount = 12;
    const repetitions = Math.ceil(targetCount / filteredFeaturedAds.length);
    const baseArray = [];
    for (let i = 0; i < repetitions; i++) {
      baseArray.push(...filteredFeaturedAds);
    }
    const items = [...baseArray, ...baseArray];
    const speedMultiplier = settings?.highlightSpeed !== undefined ? settings.highlightSpeed : 6;
    let duration = '35s';
    if (speedMultiplier > 0) {
      // Cada item no conjunto base demora ~2.8 segundos para deslocar em velocidade padrão
      const seconds = (baseArray.length * 2.8) / speedMultiplier;
      duration = `${seconds}s`;
    }
    return { items, duration };
  }, [filteredFeaturedAds, settings?.highlightSpeed]);



  const filteredAds = useMemo(() => {
    let result = ads.filter(ad => {
      if (ad.category === 'Trabalho/Empregos') return false;
      const search = searchTerm.toLowerCase().trim();
      const matchesSearch = !search || ad.title?.toLowerCase().includes(search) || ad.description?.toLowerCase().includes(search);
      const matchesStatus = ad.status === 'approved' && (ad.adStatus === 'active' || ad.adStatus === 'sold' || !ad.adStatus);
      return matchesSearch && matchesStatus;
    });
    result = result.filter(ad => {
      const adCountry = ad.country || 'Portugal';
      return adCountry === country;
    });
    if (category !== 'Todas') result = result.filter(ad => ad.category === category);

    // Service coverage filter
    const isServiceCategory = category === 'Serviços' || category?.startsWith('Serviços') || category?.includes('Serviços');
    if (isServiceCategory && (filterRegion || filterNational || filterOnline)) {
      result = result.filter(ad => {
        const coverage = ad.serviceCoverage || 'city';
        
        if (filterRegion && (coverage === 'city' || coverage === 'radius20' || coverage === 'radius50' || coverage === 'county')) {
          return true;
        }
        if (filterNational) {
          if (country === 'Reino Unido' && coverage === 'uk') return true;
          if (country === 'Portugal' && coverage === 'portugal') return true;
        }
        if (filterOnline && coverage === 'online') {
          return true;
        }
        return false;
      });
    }

    if (city !== 'Todas') result = result.filter(ad => ad.city === city);
    return result.sort((a, b) => {
      // Prioridade:
      // 1. Premium Nacional Pago (plan == 'national' ou featuredLevel == 'national')
      // 2. Premium Local Pago (plan == 'local' ou featuredLevel == 'local' mas não solidário)
      // 3. Doação Solidária (categoria '💚 Doações & Solidariedade' ou donationBoost, donationBadge, featuredReason == 'donation')
      // 4. Anúncio normal
      const getPriority = (ad: any) => {
        const isFeatured = ad.isFeatured && ad.featuredUntil && (
          ad.isPermanentFeatured || (
            ad.featuredUntil.seconds 
              ? ad.featuredUntil.toDate() > new Date() 
              : new Date(ad.featuredUntil) > new Date()
          )
        );

        if (isFeatured) {
          const isNational = ad.featuredLevel === 'national' || ad.plan === 'national' || !ad.featuredLevel;
          if (isNational) return 4; // Top 1: Premium Nacional Pago
          
          const isDonation = ad.category === '💚 Doações & Solidariedade' || ad.donationBoost === true || ad.featuredReason === 'donation';
          if (isDonation) return 2; // Top 3: Doação Solidária
          
          return 3; // Top 2: Premium Local Pago
        }
        
        if (ad.category === '💚 Doações & Solidariedade' || ad.donationBoost === true) {
          return 2; // Top 3: Doação Solidária
        }
        
        return 1; // Top 4: Anúncios normais
      };

      const pA = getPriority(a);
      const pB = getPriority(b);
      
      if (pA !== pB) {
        return pB - pA; // maior prioridade primeiro
      }

      const timeA = a.createdAt?.seconds ? a.createdAt.seconds : (a.createdAt ? new Date(a.createdAt).getTime() / 1000 : 0);
      const timeB = b.createdAt?.seconds ? b.createdAt.seconds : (b.createdAt ? new Date(b.createdAt).getTime() / 1000 : 0);
      return timeB - timeA;
    });
  }, [ads, searchTerm, category, city, country, filterRegion, filterNational, filterOnline]);

  // Contagem calculada de anúncios aprovados em tempo real de acordo com as diretrizes de contexto de país e expiração de anúncios
  const totalApprovedCount = useMemo(() => {
    return ads.filter(ad => {
      const adCountry = ad.country || 'Portugal';
      const isActive = ad.status === 'approved' && (ad.adStatus === 'active' || ad.adStatus === 'sold' || !ad.adStatus);
      return adCountry === country && isActive;
    }).length;
  }, [ads, country]);

  // Paginação inteligente de anúncios filtrados em memória (carregamento instantâneo offline-first)
  const displayedAds = useMemo(() => {
    return filteredAds.slice(0, limitAmount);
  }, [filteredAds, limitAmount]);

  const hasMore = useMemo(() => {
    return filteredAds.length > limitAmount;
  }, [filteredAds, limitAmount]);

  const flagItemsMarquee = [
    { flag: '🇵🇹', name: 'Portugal', code: 'pt', border: 'border-green-400/80' },
    { flag: '🇧🇷', name: 'Brasil', code: 'br', border: 'border-yellow-400/80' },
    { flag: '🇦🇴', name: 'Angola', code: 'ao', border: 'border-red-400/80' },
    { flag: '🇲🇿', name: 'Moçambique', code: 'mz', border: 'border-amber-400/80' },
    { flag: '🇨🇻', name: 'Cabo Verde', code: 'cv', border: 'border-blue-400/80' },
    { flag: '🇬🇼', name: 'Guiné-Bissau', code: 'gw', border: 'border-red-400/80' },
    { flag: '🇸🇹', name: 'São Tomé e Príncipe', code: 'st', border: 'border-yellow-400/80' },
    { flag: '🇹🇱', name: 'Timor-Leste', code: 'tl', border: 'border-red-400/80' },
    { flag: '🇬🇶', name: 'Guiné Equatorial', code: 'gq', border: 'border-green-400/80' },
  ];

  return (
    <div className="w-full">
      {/* ============================================================== */}
      {/* 💻 LAYOUT DESKTOP (Aparece apenas em ecrãs médios e superiores) */}
      {/* ============================================================== */}
      <div className="hidden md:flex flex-col gap-6 md:gap-8 max-w-full">
        {/* 1. BARRA DE PESQUISA PRINCIPAL (Estilo OLX / Mercado Livre / Airbnb) */}
        <section className="w-full" id="desktop-search-section">
          <div className="w-full bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-3 md:p-4 shadow-xl hover:shadow-2xl transition-all duration-300">
            <div className="flex flex-col lg:flex-row items-stretch lg:items-center gap-3">
              
              {/* Campo de Pesquisa Textual */}
              <div className="flex-1 flex items-center gap-3 px-3.5 py-2.5 bg-slate-100/80 dark:bg-slate-800 rounded-2xl border border-slate-250 dark:border-slate-700/80 focus-within:ring-2 focus-within:ring-indigo-500/30 focus-within:border-indigo-500 transition-all">
                <Search size={20} className="text-slate-500 dark:text-slate-300 shrink-0" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  onFocus={() => {
                    handleSearchFocus();
                    setIsSearchFocused(true);
                  }}
                  onBlur={() => setIsSearchFocused(false)}
                  placeholder="O que procura hoje? Digite aqui..."
                  className="w-full bg-transparent text-slate-900 dark:text-slate-100 font-extrabold placeholder:text-slate-450 dark:placeholder:text-slate-450 focus:outline-none text-base"
                />
              </div>

              {/* Seletor de Categoria */}
              <div className="w-full lg:w-56 flex items-center gap-2.5 px-3.5 py-2.5 bg-slate-100/80 dark:bg-slate-800 rounded-2xl border border-slate-250 dark:border-slate-700/80 focus-within:ring-2 focus-within:ring-indigo-500/30 focus-within:border-indigo-500 transition-all relative">
                <Tag size={18} className="text-slate-500 dark:text-slate-300 shrink-0" />
                <select 
                  value={category} 
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === 'Trabalho/Empregos') {
                      navigate('/trabalhos');
                    } else {
                      setCategory(val);
                      setFilterRegion(false);
                      setFilterNational(false);
                      setFilterOnline(false);
                    }
                  }} 
                  className="w-full bg-transparent text-slate-900 dark:text-white font-black text-sm md:text-base focus:outline-none cursor-pointer appearance-none pr-6"
                >
                  <option value="Todas" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-extrabold">Todas as Categorias</option>
                  {categories.map((c, i) => (
                    <option key={i} value={c} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-extrabold">{c}</option>
                  ))}
                </select>
                <span className="absolute right-3.5 text-slate-600 dark:text-slate-300 text-xs pointer-events-none">▼</span>
              </div>

              {/* Seletor de Cidade / Região */}
              <div className="w-full lg:w-48 flex items-center gap-2.5 px-3.5 py-2.5 bg-slate-100/80 dark:bg-slate-800 rounded-2xl border border-slate-250 dark:border-slate-700/80 focus-within:ring-2 focus-within:ring-indigo-500/30 focus-within:border-indigo-500 transition-all relative">
                <MapPin size={18} className="text-slate-500 dark:text-slate-300 shrink-0" />
                <select 
                  value={city} 
                  onChange={(e) => setCity(e.target.value)} 
                  className="w-full bg-transparent text-slate-900 dark:text-white font-black text-sm md:text-base focus:outline-none cursor-pointer appearance-none pr-6"
                >
                  <option value="Todas" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-extrabold">Todas as Cidades</option>
                  {selectableCitiesOnHome.map((c, i) => (
                    <option key={i} value={c} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-extrabold">{c}</option>
                  ))}
                </select>
                <span className="absolute right-3.5 text-slate-600 dark:text-slate-300 text-xs pointer-events-none">▼</span>
              </div>

              {/* Seletor de País / Comunidade */}
              <div className="w-full lg:w-20 relative shrink-0" ref={dropdownRef}>
                <button 
                  type="button"
                  onClick={() => {
                    setCountryDropdownOpen(prev => !prev);
                    setShowTooltip(false);
                  }}
                  className="w-full flex items-center justify-between gap-1.5 px-3 py-2.5 bg-slate-100/80 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-750 text-sm md:text-base font-black text-slate-900 dark:text-white rounded-2xl border border-slate-250 dark:border-slate-700/80 transition-all cursor-pointer"
                  id="community-toggle-button-search"
                >
                  <span className="text-xl select-none leading-none">
                    {country === 'Portugal' ? '🇵🇹' : '🇬🇧'}
                  </span>
                  <span className="text-slate-600 dark:text-slate-300 text-[10px] shrink-0 leading-none">▼</span>
                </button>

                {/* Dropdown de Países */}
                <AnimatePresence>
                  {countryDropdownOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: 10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 10, scale: 0.95 }}
                      transition={{ duration: 0.15 }}
                      className="absolute right-0 mt-2 z-50 w-48 rounded-2xl p-2 shadow-2xl flex flex-col gap-1.5 border border-slate-150 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-white"
                    >
                      <button
                        type="button"
                        onClick={() => {
                          handleCountryChange('Portugal');
                          setCountryDropdownOpen(false);
                        }}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left text-sm font-black transition-all cursor-pointer select-none border ${
                          country === 'Portugal'
                            ? 'bg-emerald-50 dark:bg-emerald-950/40 text-[#046a38] dark:text-emerald-400 border-emerald-250 dark:border-emerald-800 font-black'
                            : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 hover:bg-emerald-50 dark:hover:bg-emerald-950/20'
                        }`}
                      >
                        <span className="text-base">🇵🇹</span>
                        <span>Portugal</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          handleCountryChange('Reino Unido');
                          setCountryDropdownOpen(false);
                        }}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left text-sm font-black transition-all cursor-pointer select-none border ${
                          country === 'Reino Unido'
                            ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-800 dark:text-blue-400 border-blue-200 dark:border-blue-800 font-black'
                            : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 hover:bg-blue-50 dark:hover:bg-blue-950/20'
                        }`}
                      >
                        <span className="text-base">🇬🇧</span>
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

              {/* Botão de Pesquisa */}
              <button
                type="button"
                onClick={() => handleSearchFocus()}
                className="w-full lg:w-auto bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-sm px-7 py-3.5 lg:py-3 rounded-2xl transition-all flex items-center justify-center gap-2 shrink-0 active:scale-95 shadow-md shadow-indigo-600/15 cursor-pointer"
              >
                <Search size={18} />
                <span>Pesquisar</span>
              </button>

            </div>

            {/* Filtro de Área de Atendimento para Categoria Serviços */}
            {(() => {
              const isServiceCategory = category === 'Serviços' || category?.startsWith('Serviços') || category?.includes('Serviços');
              return isServiceCategory && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  className="w-full mt-3 border-t border-slate-100 dark:border-slate-800 pt-3"
                >
                  <div className="text-left">
                    <h3 className="text-xs font-black uppercase tracking-wider mb-2 text-slate-500 flex items-center gap-2">
                      <span>📍</span> Filtro de Área de Atendimento
                    </h3>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <label className="flex items-center gap-3 p-3 rounded-2xl cursor-pointer transition-all hover:bg-slate-50 dark:hover:bg-slate-800/50 border border-slate-100 dark:border-slate-800 select-none bg-slate-50/50 dark:bg-slate-900/50 text-slate-700 dark:text-slate-200">
                        <input 
                          type="checkbox" 
                          checked={filterRegion} 
                          onChange={(e) => setFilterRegion(e.target.checked)}
                          className="w-5 h-5 rounded-lg border-2 border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer accent-indigo-500"
                        />
                        <div className="flex flex-col">
                          <span className="text-xs md:text-sm font-extrabold">Apenas minha região</span>
                          <span className="text-[10px] text-slate-400">Local, raio 20/50km ou distrito</span>
                        </div>
                      </label>

                      <label className="flex items-center gap-3 p-3 rounded-2xl cursor-pointer transition-all hover:bg-slate-50 dark:hover:bg-slate-800/50 border border-slate-100 dark:border-slate-800 select-none bg-slate-50/50 dark:bg-slate-900/50 text-slate-700 dark:text-slate-200">
                        <input 
                          type="checkbox" 
                          checked={filterNational} 
                          onChange={(e) => setFilterNational(e.target.checked)}
                          className="w-5 h-5 rounded-lg border-2 border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer accent-indigo-500"
                        />
                        <div className="flex flex-col">
                          <span className="text-xs md:text-sm font-extrabold">Atendimento Nacional</span>
                          <span className="text-[10px] text-slate-400">Todo o {country === 'Reino Unido' ? 'Reino Unido' : 'Portugal'}</span>
                        </div>
                      </label>

                      <label className="flex items-center gap-3 p-3 rounded-2xl cursor-pointer transition-all hover:bg-slate-50 dark:hover:bg-slate-800/50 border border-slate-100 dark:border-slate-800 select-none bg-slate-50/50 dark:bg-slate-900/50 text-slate-700 dark:text-slate-200">
                        <input 
                          type="checkbox" 
                          checked={filterOnline} 
                          onChange={(e) => setFilterOnline(e.target.checked)}
                          className="w-5 h-5 rounded-lg border-2 border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer accent-indigo-500"
                        />
                        <div className="flex flex-col">
                          <span className="text-xs md:text-sm font-extrabold">Atendimento Online</span>
                          <span className="text-[10px] text-slate-400">Serviços 100% remotos</span>
                        </div>
                      </label>
                    </div>
                  </div>
                </motion.div>
              );
            })()}
          </div>
        </section>

        {/* 2. HERO BANNER LUXURY SLIM (Altura Reduzida em 40%, Elegante, Foco Institucional) */}
        <section className="relative overflow-hidden shadow-lg rounded-3xl transition-all duration-500 max-w-full">
          {/* Imagem de Fundo dinâmica */}
          <div className="absolute inset-0 z-0 overflow-hidden">
            <img 
              src={country === 'Portugal' ? lisbonAerial : londonBg} 
              alt={country} 
              className="w-full h-full object-cover scale-105 transition-all duration-700 ease-in-out"
              onError={() => {
                if (londonBg !== londonAerialOriginalStandby) {
                  setLondonBg(londonAerialOriginalStandby);
                }
              }}
            />
            {/* Overlay suave para alto contraste */}
            <div className="absolute inset-0 bg-black/18" />
          </div>

          <div className="relative z-10 mx-auto w-full px-6 py-4 md:py-6 lg:py-7">
            <motion.div 
              initial={{ opacity: 0, y: 10 }} 
              animate={{ opacity: 1, y: 0 }}
              className="mx-auto max-w-5xl"
            >
              <div className="flex flex-col md:flex-row items-center justify-between gap-4 w-full">
                
                {/* Bloco de Texto Principal: Badge e Título */}
                <div className="flex-1 text-center md:text-left space-y-2">
                  <div className="inline-flex items-center gap-1.5 bg-[#046a38]/90 text-amber-300 px-3 py-1 rounded-full border border-amber-400/20 text-[9px] md:text-xs font-black uppercase tracking-[0.15em] shadow-sm">
                    <span>🌍</span> Comunidade Lusófona
                  </div>

                  <h1 className="text-xl sm:text-2xl md:text-3xl font-black text-white tracking-tight leading-tight drop-shadow-lg">
                    Mais de <span className="bg-gradient-to-r from-amber-200 via-amber-300 to-amber-100 bg-clip-text text-transparent font-black">300 Milhões</span> de falantes de português unidos.
                  </h1>
                </div>

                {/* Estatísticas (Stats) do Marketplace como Cards Flutuantes de Vidro */}
                <div className="flex flex-row md:flex-row items-center gap-3 shrink-0">
                  {/* Contador de Anúncios Slim */}
                  {(settings?.showTotalAdsBadge === true || isModeratorOrAdmin) && (
                    <div 
                      className="flex items-center bg-black/45 backdrop-blur-md border border-white/10 rounded-xl px-3 py-1.5 shadow-md select-none min-w-[110px] relative group"
                    >
                      <span className="text-white font-black text-base md:text-xl mr-2">
                        {totalApprovedCount !== null ? totalApprovedCount : filteredAds.length}
                      </span>
                      <span className="text-white/70 text-[8px] md:text-[9px] uppercase font-black tracking-wider leading-none">Anúncios<br/>Ativos</span>

                      {!settings?.showTotalAdsBadge && isModeratorOrAdmin && (
                        <span className="absolute -top-10 left-1/2 -translate-x-1/2 bg-slate-950 border border-indigo-500/40 text-indigo-300 text-[10px] font-bold px-3 py-1 rounded-xl shadow-2xl opacity-0 group-hover:opacity-100 transition-all duration-200 whitespace-nowrap pointer-events-none z-10">
                          🔒 Oculto (Visto por Staff)
                        </span>
                      )}
                    </div>
                  )}

                  {/* Contador de Utilizadores Slim */}
                  {(settings?.showTotalUsersBadge || isModeratorOrAdmin) && totalUsersCount !== null && (
                    <div 
                      className="flex items-center bg-white/10 backdrop-blur-md border border-white/15 rounded-xl px-3 py-1.5 shadow-md select-none min-w-[110px] relative group"
                    >
                      <span className="text-amber-300 font-black text-base md:text-xl mr-2">
                        {totalUsersCount}
                      </span>
                      <span className="text-white/80 text-[8px] md:text-[9px] uppercase font-black tracking-wider leading-none">Membros<br/>Mundiais</span>

                      {!settings?.showTotalUsersBadge && isModeratorOrAdmin && (
                        <span className="absolute -top-10 left-1/2 -translate-x-1/2 bg-slate-950 border border-indigo-500/40 text-indigo-300 text-[10px] font-bold px-3 py-1 rounded-xl shadow-2xl opacity-0 group-hover:opacity-100 transition-all duration-200 whitespace-nowrap pointer-events-none z-10">
                          🔒 Oculto (Visto por Staff)
                        </span>
                      )}
                    </div>
                  )}
                </div>

              </div>

              <style>{`
                @keyframes flagMarquee {
                  0% {
                    transform: translateX(0);
                  }
                  100% {
                    transform: translateX(-50%);
                  }
                }
                .animate-flag-marquee {
                  display: flex;
                  width: max-content;
                  animation: flagMarquee 26s linear infinite;
                }
                .animate-flag-marquee:hover {
                  animation-play-state: paused;
                }
              `}</style>

              {/* Bandeiras dos países em carrossel elegante na base do banner */}
              <div className="w-full overflow-hidden relative pt-1 mt-4 border-t border-white/10" id="desktop-flags-marquee-container">
                <div className="absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-black/20 to-transparent z-10 pointer-events-none" />
                <div className="absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-black/20 to-transparent z-10 pointer-events-none" />
                
                <div className="animate-flag-marquee flex gap-3">
                  {flagItemsMarquee.map((item, idx) => (
                    <div 
                      key={`flag-1-dt-${idx}`} 
                      className={`group/flag shrink-0 flex items-center justify-center gap-1.5 bg-slate-950/40 hover:bg-slate-950/60 border ${item.border} rounded-full py-0.5 px-2.5 transition-all duration-300 cursor-default shadow-sm`}
                      title={item.name}
                    >
                      <div className="w-4 h-4 rounded-full overflow-hidden flex items-center justify-center border border-white/20 shadow-inner shrink-0 relative">
                        <img 
                          src={`https://flagcdn.com/w40/${item.code}.png`} 
                          alt={item.flag} 
                          className="h-full w-full object-cover shrink-0 select-none scale-120 group-hover/flag:scale-135 transition-transform duration-300"
                          referrerPolicy="no-referrer"
                        />
                      </div>
                      <span className="text-[8px] md:text-[9px] font-black text-white group-hover/flag:text-amber-300 transition-colors duration-300 select-none uppercase tracking-wider">
                        {item.name}
                      </span>
                    </div>
                  ))}

                  {flagItemsMarquee.map((item, idx) => (
                    <div 
                      key={`flag-2-dt-${idx}`} 
                      className={`group/flag shrink-0 flex items-center justify-center gap-1.5 bg-slate-950/40 hover:bg-slate-950/60 border ${item.border} rounded-full py-0.5 px-2.5 transition-all duration-300 cursor-default shadow-sm`}
                      title={item.name}
                    >
                      <div className="w-4 h-4 rounded-full overflow-hidden flex items-center justify-center border border-white/20 shadow-inner shrink-0 relative">
                        <img 
                          src={`https://flagcdn.com/w40/${item.code}.png`} 
                          alt={item.flag} 
                          className="h-full w-full object-cover shrink-0 select-none scale-120 group-hover/flag:scale-135 transition-transform duration-300"
                          referrerPolicy="no-referrer"
                        />
                      </div>
                      <span className="text-[8px] md:text-[9px] font-black text-white group-hover/flag:text-amber-300 transition-colors duration-300 select-none uppercase tracking-wider">
                        {item.name}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          </div>
        </section>

        {/* 3. ✨ ANÚNCIOS EM DESTAQUE */}
        {filteredFeaturedAds.length > 0 && (
          <section className="py-2 md:py-4 border-b border-slate-250/20">
            <div className="flex flex-col gap-0.5 mb-4 text-left">
              <div className="flex items-center gap-2">
                <span className="text-lg md:text-xl">✨</span>
                <h2 className="text-md md:text-lg lg:text-xl font-black text-slate-800 dark:text-white tracking-tight leading-none">
                  Anúncios em Destaque
                </h2>
              </div>
              <p className="text-[9px] md:text-[10px] text-slate-500 dark:text-slate-400 font-extrabold tracking-wider uppercase">
                Anúncios promovidos de forma especial pela comunidade
              </p>
            </div>
            
            {/* Carrossel Horizontal Responsivo */}
            <div className="relative w-full overflow-hidden py-1">
              <div 
                onMouseEnter={() => setIsHovered(true)}
                onMouseLeave={() => setIsHovered(false)}
                onTouchStart={() => setIsHovered(true)}
                onTouchEnd={() => setIsHovered(false)}
                className="carouselTrack flex gap-4 md:gap-6"
                style={{
                  animationName: (settings?.highlightSpeed !== 0) ? 'scrollCarousel' : 'none',
                  animationDuration: marqueeData.duration,
                  animationTimingFunction: 'linear',
                  animationIterationCount: 'infinite',
                  animationPlayState: (isHovered || settings?.highlightSpeed === 0) ? 'paused' : 'running',
                }}
              >
                {marqueeData.items.map((ad, idx) => (
                  <div key={`${ad.id}-${idx}`} className="w-[140px] sm:w-[165px] md:w-[195px] shrink-0">
                    <AdCard ad={ad} variant="featured" />
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* 4. 🏪 EMPREENDEDORES EM DESTAQUE */}
        {featuredVitrines.length > 0 && (
          <section className="py-2 md:py-4 border-b border-slate-250/20 overflow-hidden max-w-full" id="desktop-featured-entrepreneurs">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2 mb-4 text-left">
              <div className="flex flex-col gap-0.5">
                <div className="flex items-center gap-2">
                  <span className="text-lg md:text-xl">🏪</span>
                  <h2 className="text-md md:text-lg lg:text-xl font-black text-slate-800 dark:text-white tracking-tight leading-none">
                    Empreendedores em Destaque
                  </h2>
                </div>
                <p className="text-[9px] md:text-[10px] text-slate-500 dark:text-slate-400 font-extrabold tracking-wider uppercase">
                  Vitrines Digitais em alta na comunidade
                </p>
              </div>
              <Link
                to="/empreendedores"
                className="group flex items-center gap-1.5 text-[10px] font-black text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 transition-colors uppercase tracking-wider bg-indigo-50 dark:bg-slate-800 hover:bg-indigo-100/80 px-3.5 py-1.5 rounded-full shadow-sm"
              >
                <span>Ver Todos</span>
                <ArrowRight size={12} className="group-hover:translate-x-0.5 transition-transform" />
              </Link>
            </div>

            <div className="flex gap-4 sm:gap-6 overflow-x-auto pb-4 no-scrollbar" style={{ scrollSnapType: 'x mandatory' }}>
              {featuredVitrines.map((vitrine) => {
                const linkTo = `/empreendedores/${vitrine.showcaseSlug}`;
                const fallbackCover = 'https://images.unsplash.com/photo-1557804506-669a67965ba0?auto=format&fit=crop&w=450&h=150&fit=crop&q=80';
                return (
                  <Link 
                    key={vitrine.uid} 
                    to={linkTo}
                    className="w-[260px] sm:w-[280px] h-[320px] shrink-0 bg-[#0d0e12] rounded-[1.5rem] border border-slate-800/60 shadow-xl hover:shadow-2xl hover:-translate-y-1 transition-all duration-300 flex flex-col justify-between overflow-hidden group scroll-snap-align-start cursor-pointer"
                    style={{ scrollSnapAlign: 'start' }}
                  >
                    <div className="relative h-[255px] w-full bg-slate-900 overflow-hidden">
                      <img 
                        src={vitrine.showcaseCover || fallbackCover} 
                        alt={vitrine.showcaseName} 
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" 
                        referrerPolicy="no-referrer"
                      />
                      
                      <div className="absolute top-3 left-1/2 -translate-x-1/2 w-12 h-12 rounded-full bg-white border-2 border-white shadow-md flex items-center justify-center overflow-hidden z-20">
                        {vitrine.showcaseLogo && vitrine.showcaseLogo.trim() !== '' ? (
                          <img src={vitrine.showcaseLogo} alt="Logo" className="w-full h-full object-cover rounded-full" referrerPolicy="no-referrer" />
                        ) : (
                          <span className="text-lg">🏬</span>
                        )}
                      </div>

                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/15 to-transparent pt-12 p-3.5 flex flex-col justify-end z-10">
                        <div className="flex justify-between items-end gap-2 text-white">
                          <div className="min-w-0 flex-1">
                            <h3 className="font-black text-white text-sm sm:text-base leading-tight line-clamp-1 truncate drop-shadow-md">
                              {vitrine.showcaseName}
                            </h3>
                            <div className="flex items-center gap-1 text-[10px] sm:text-xs text-slate-300 font-semibold mt-0.5 truncate drop-shadow-sm">
                              <MapPin size={10} className="text-slate-400 shrink-0" />
                              <span className="truncate">{vitrine.city ? `${vitrine.city}, ` : ''}{vitrine.country === 'Portugal' ? '🇵🇹 pt' : '🇬🇧 uk'}</span>
                            </div>
                          </div>
                          
                          <div className="px-1.5 py-0.5 bg-black/70 border border-white/15 text-white rounded-md text-[9px] font-black flex items-center gap-1 shrink-0 shadow-sm">
                            <span>📦</span>
                            <span>{vitrine.productsCount} {vitrine.productsCount === 1 ? 'item' : 'itens'}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="p-2.5 bg-[#0d0e12] flex items-center justify-center h-[60px] shrink-0 border-t border-slate-900/35">
                      <div
                        className="w-full py-1.5 bg-[#136338] group-hover:bg-[#1a5e37] text-white font-black text-xs flex items-center justify-center gap-1.5 rounded-lg transition-all shadow-md text-center border border-emerald-800/10"
                      >
                        <Store size={12} className="text-white shrink-0" />
                        <span>Meu Negócio</span>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        )}

        {/* 5. 🛍️ GRID DE ANÚNCIOS (Últimos anúncios) */}
        <section className="py-2 md:py-4 text-left">
          <div className="flex flex-col gap-0.5 mb-4">
            <div className="flex items-center gap-2">
              <span className="text-lg md:text-xl">🛍️</span>
              <h2 className="text-md md:text-lg lg:text-xl font-black text-slate-800 dark:text-white tracking-tight leading-none">
                Últimos Anúncios
              </h2>
            </div>
            <p className="text-[9px] md:text-[10px] text-slate-500 dark:text-slate-400 font-extrabold tracking-wider uppercase">
              Descubra os anúncios e ofertas mais recentes em tempo real
            </p>
          </div>

          <div className="px-0">
            {loading ? (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 md:gap-6">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="bg-slate-100 dark:bg-slate-800 rounded-2xl h-64 animate-pulse" />
                ))}
              </div>
            ) : errorMsg ? (
              <div className="text-center py-12 bg-white dark:bg-slate-900 rounded-3xl border border-red-100 dark:border-red-950 shadow-md max-w-md mx-auto p-6 flex flex-col items-center">
                <span className="text-3xl">⚠️</span>
                <h3 className="text-md font-extrabold text-slate-850 dark:text-slate-100 mt-2">Problema de Ligação</h3>
                <p className="text-slate-500 dark:text-slate-400 text-xs mt-1 leading-relaxed">
                  Não foi possível ligar ao banco de dados neste momento.
                </p>
                <button
                  onClick={() => {
                    setErrorMsg(null);
                    setLoading(true);
                    clearHomeCache();
                    setReloadCounter(prev => prev + 1);
                  }}
                  className="mt-4 px-5 py-2 bg-slate-900 dark:bg-slate-850 text-white font-black text-xs rounded-lg hover:bg-slate-800 transition active:scale-95 shadow-md cursor-pointer flex items-center gap-1.5"
                >
                  <RefreshCcw size={12} />
                  Tentar Novamente
                </button>
              </div>
            ) : filteredAds.length === 0 ? (
              <div className="text-center py-16 bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm">
                <ShoppingBag size={40} className="mx-auto text-slate-200 dark:text-slate-700 mb-3" />
                <h3 className="text-md font-extrabold text-slate-400">Nenhum anúncio encontrado</h3>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 md:gap-6">
                {displayedAds.map((ad) => (
                  <AdCard key={ad.id} ad={ad} />
                ))}
              </div>
            )}

            {hasMore && !loading && (
              <div className="flex justify-center mt-10 pb-6">
                <button
                  onClick={handleLoadMore}
                  disabled={isFetchingMore}
                  className="flex items-center gap-2 px-8 py-3 bg-slate-900 hover:bg-slate-800 text-white font-extrabold text-xs rounded-full shadow-md active:scale-95 disabled:opacity-50 transition-all duration-300 cursor-pointer"
                >
                  {isFetchingMore ? (
                    <>
                      <RefreshCcw className="animate-spin" size={14} />
                      A carregar mais...
                    </>
                  ) : (
                    <>
                      Ver mais anúncios
                      <ArrowRight size={14} />
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        </section>
      </div>

      {/* ============================================================== */}
      {/* 📱 LAYOUT MOBILE (Aparece apenas em ecrãs menores que md) */}
      {/* ============================================================== */}
      <div className="flex md:hidden flex-col gap-4 w-full max-w-full overflow-hidden" id="mobile-home-root">
        {/* 1. PESQUISA MOBILE (Exatamente uma única linha, ultra-compacta) */}
        <section className="w-full" id="mobile-search-section">
          <div className="flex items-center gap-2 px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-md">
            <Search size={18} className="text-slate-400 shrink-0" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onFocus={() => {
                handleSearchFocus();
                setIsSearchFocused(true);
              }}
              placeholder="O que procura hoje?"
              className="w-full bg-transparent text-slate-900 dark:text-white font-black placeholder:text-slate-400 focus:outline-none text-sm"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="text-slate-400 hover:text-slate-600 px-1 font-extrabold text-sm"
              >
                ✕
              </button>
            )}
          </div>
        </section>

        {/* 2. FILTROS COMPACTOS EM UMA ÚNICA LINHA (Compacto, Proporcional sem Extravasar Viewport) */}
        <section className="w-full px-0.5" id="mobile-filters-section">
          <div className="flex items-stretch gap-1.5 w-full max-w-full overflow-visible">
            
            {/* Categoria (~41% de largura) */}
            <div className="relative flex-1 min-w-0 flex items-center gap-1 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-750 border border-slate-200 dark:border-slate-700/60 rounded-xl px-2 py-1.5 transition-all">
              <Tag size={11} className="text-slate-400 dark:text-slate-300 shrink-0 select-none" />
              <select
                value={category}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === 'Trabalho/Empregos') {
                    navigate('/trabalhos');
                  } else {
                    setCategory(val);
                    setFilterRegion(false);
                    setFilterNational(false);
                    setFilterOnline(false);
                  }
                }}
                className="w-full bg-transparent text-[10px] md:text-xs font-black text-slate-900 dark:text-white focus:outline-none appearance-none cursor-pointer pr-4 border-none py-0 pl-0 min-w-0"
              >
                <option value="Todas" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-extrabold">Categorias</option>
                {categories.map((c, i) => (
                  <option key={i} value={c} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-extrabold">{c}</option>
                ))}
              </select>
              <span className="text-[6px] text-slate-400 dark:text-slate-300 absolute right-1.5 pointer-events-none select-none">▼</span>
            </div>

            {/* Cidade (~41% de largura) */}
            <div className="relative flex-1 min-w-0 flex items-center gap-1 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-750 border border-slate-200 dark:border-slate-700/60 rounded-xl px-2 py-1.5 transition-all">
              <MapPin size={11} className="text-slate-400 dark:text-slate-300 shrink-0 select-none" />
              <select
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="w-full bg-transparent text-[10px] md:text-xs font-black text-slate-900 dark:text-white focus:outline-none appearance-none cursor-pointer pr-4 border-none py-0 pl-0 min-w-0"
              >
                <option value="Todas" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-extrabold">Cidades</option>
                {selectableCitiesOnHome.map((c, i) => (
                  <option key={i} value={c} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-extrabold">{c}</option>
                ))}
              </select>
              <span className="text-[6px] text-slate-400 dark:text-slate-300 absolute right-1.5 pointer-events-none select-none">▼</span>
            </div>

            {/* País (~18% de largura) */}
            <div ref={mobileCountryDropdownRef} className="relative w-[18%] shrink-0 flex items-stretch" id="mobile-country-dropdown-wrapper">
              <button
                type="button"
                onClick={() => setMobileCountryDropdownOpen(prev => !prev)}
                aria-expanded={mobileCountryDropdownOpen}
                aria-haspopup="menu"
                className="w-full h-full flex items-center justify-between gap-0.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-750 border border-slate-200 dark:border-slate-700/60 rounded-xl px-1.5 py-1.5 transition-all cursor-pointer"
              >
                {/* Bandeira oficial diretamente dentro do botão, mantendo proporção ideal, cantos arredondados e sem bordas adicionais */}
                <img
                  src={getFlagSvgUrl(country)}
                  alt={country}
                  className="w-[25px] h-[16px] object-cover rounded-sm pointer-events-none select-none shrink-0"
                  referrerPolicy="no-referrer"
                />
                {/* Pequena seta discreta alinhada à direita */}
                <span className="text-[6px] text-slate-400 dark:text-slate-300 pointer-events-none select-none leading-none">▼</span>
              </button>

              {/* Menu suspenso personalizado em React com AnimatePresence */}
              <AnimatePresence>
                {mobileCountryDropdownOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: 4, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 4, scale: 0.95 }}
                    transition={{ duration: 0.12 }}
                    className="absolute right-0 top-full mt-1.5 z-50 w-44 rounded-2xl p-2 shadow-2xl flex flex-col gap-1 border border-slate-150 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-white"
                    role="menu"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        handleCountryChange('Portugal');
                        setMobileCountryDropdownOpen(false);
                      }}
                      role="menuitem"
                      className={`flex items-center gap-2.5 w-full text-left px-3 py-2 rounded-xl text-xs font-black transition-all cursor-pointer ${
                        country === 'Portugal'
                          ? 'bg-slate-100 dark:bg-slate-800 text-slate-950 dark:text-white'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-850 text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      <img
                        src={getFlagSvgUrl('Portugal')}
                        alt="Portugal"
                        className="w-5 h-3.5 object-cover rounded border border-slate-200 dark:border-slate-700 shrink-0"
                        referrerPolicy="no-referrer"
                      />
                      <span>🇵🇹 Portugal</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        handleCountryChange('Reino Unido');
                        setMobileCountryDropdownOpen(false);
                      }}
                      role="menuitem"
                      className={`flex items-center gap-2.5 w-full text-left px-3 py-2 rounded-xl text-xs font-black transition-all cursor-pointer ${
                        country === 'Reino Unido'
                          ? 'bg-slate-100 dark:bg-slate-800 text-slate-950 dark:text-white'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-850 text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      <img
                        src={getFlagSvgUrl('Reino Unido')}
                        alt="Reino Unido"
                        className="w-5 h-3.5 object-cover rounded border border-slate-200 dark:border-slate-700 shrink-0"
                        referrerPolicy="no-referrer"
                      />
                      <span>🇬🇧 Reino Unido</span>
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

          </div>

          {/* Filtros expandidos de serviços se categoria for Serviços */}
          {(() => {
            const isServiceCategory = category === 'Serviços' || category?.startsWith('Serviços') || category?.includes('Serviços');
            return isServiceCategory && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="w-full mt-2 bg-slate-50 dark:bg-slate-900 rounded-xl p-2.5 border border-slate-200 dark:border-slate-800"
              >
                <div className="flex flex-col gap-2 text-left">
                  <span className="text-[10px] font-black uppercase text-slate-400">Filtro de Atendimento:</span>
                  <div className="flex flex-wrap gap-2">
                    <label className="flex items-center gap-1.5 px-2.5 py-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-bold text-slate-700 dark:text-slate-200">
                      <input type="checkbox" checked={filterRegion} onChange={(e) => setFilterRegion(e.target.checked)} className="rounded text-indigo-600 focus:ring-indigo-500" />
                      <span>Região</span>
                    </label>
                    <label className="flex items-center gap-1.5 px-2.5 py-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-bold text-slate-700 dark:text-slate-200">
                      <input type="checkbox" checked={filterNational} onChange={(e) => setFilterNational(e.target.checked)} className="rounded text-indigo-600 focus:ring-indigo-500" />
                      <span>Nacional</span>
                    </label>
                    <label className="flex items-center gap-1.5 px-2.5 py-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-bold text-slate-700 dark:text-slate-200">
                      <input type="checkbox" checked={filterOnline} onChange={(e) => setFilterOnline(e.target.checked)} className="rounded text-indigo-600 focus:ring-indigo-500" />
                      <span>Online</span>
                    </label>
                  </div>
                </div>
              </motion.div>
            );
          })()}
        </section>

        {/* 3. BANNER PEQUENO (Reduzido para ~120px de Altura, Simplificado, Extremamente Compacto) */}
        <section className="w-full" id="mobile-banner-section">
          <div className="relative overflow-hidden rounded-2xl h-[115px] shadow-sm">
            <img 
              src={country === 'Portugal' ? lisbonAerial : londonBg} 
              alt={country} 
              className="absolute inset-0 w-full h-full object-cover"
              referrerPolicy="no-referrer"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-black/25 via-black/15 to-black/10" />
            
            <div className="relative z-10 h-full flex flex-col justify-center px-4 text-left">
              <span className="text-[10px] font-black uppercase tracking-widest text-amber-400">Comunidade Lusófona</span>
              <h2 className="text-base font-black text-white mt-0.5 leading-tight">Mercado Luso Marketplace</h2>
              <p className="text-[10px] text-white/80 font-bold mt-1">Negócios locais perto de si.</p>
            </div>
          </div>
        </section>

        {/* 4. ANÚNCIOS EM DESTAQUE (Carrossel Compacto) */}
        {filteredFeaturedAds.length > 0 && (
          <section className="w-full border-b border-slate-100 dark:border-slate-800/60 pb-3" id="mobile-featured-section">
            <div className="flex items-center gap-1.5 mb-2.5 text-left">
              <span className="text-base">✨</span>
              <h2 className="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-white">
                Destaques
              </h2>
            </div>
            
            {/* Esteira horizontal compacta */}
            <div className="relative w-full overflow-hidden">
              <div 
                className="carouselTrack flex gap-3"
                style={{
                  animationName: (settings?.highlightSpeed !== 0) ? 'scrollCarousel' : 'none',
                  animationDuration: marqueeData.duration,
                  animationTimingFunction: 'linear',
                  animationIterationCount: 'infinite',
                }}
              >
                {marqueeData.items.map((ad, idx) => (
                  <div key={`${ad.id}-${idx}`} className="w-[125px] shrink-0">
                    <AdCard ad={ad} variant="featured" />
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* 5. EMPREENDEDORES MOBILE (Compact scroller) */}
        {featuredVitrines.length > 0 && (
          <section className="w-full border-b border-slate-100 dark:border-slate-800/60 pb-3" id="mobile-entrepreneurs-section">
            <div className="flex items-center justify-between mb-2.5 text-left">
              <div className="flex items-center gap-1.5">
                <span className="text-base">🏪</span>
                <h2 className="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-white">
                  Vitrine Empreendedora
                </h2>
              </div>
              <Link to="/empreendedores" className="text-[10px] font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-widest bg-indigo-50 dark:bg-slate-800 px-2.5 py-1 rounded-full">
                Ver todos
              </Link>
            </div>

            <div className="flex gap-3 overflow-x-auto pb-1 no-scrollbar" style={{ scrollSnapType: 'x mandatory' }}>
              {featuredVitrines.map((vitrine) => (
                <Link 
                  key={`mb-${vitrine.uid}`} 
                  to={`/empreendedores/${vitrine.showcaseSlug}`}
                  className="w-[190px] h-[135px] shrink-0 bg-slate-950 rounded-xl overflow-hidden relative flex flex-col justify-end p-2 border border-slate-800"
                  style={{ scrollSnapAlign: 'start' }}
                >
                  <img src={vitrine.showcaseCover || 'https://images.unsplash.com/photo-1557804506-669a67965ba0?auto=format&fit=crop&w=350&q=85'} alt="" className="absolute inset-0 w-full h-full object-cover" referrerPolicy="no-referrer" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/15 to-transparent" />
                  <div className="relative z-10">
                    <h3 className="text-xs font-black text-white truncate line-clamp-1">{vitrine.showcaseName}</h3>
                    <p className="text-[8px] text-slate-300 font-bold mt-0.5 truncate">{vitrine.city || 'Portugal'}</p>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* 6. ÚLTIMOS ANÚNCIOS (Grid Compacta de 2 Colunas) */}
        <section className="w-full text-left" id="mobile-latest-section">
          <div className="flex items-center gap-1.5 mb-3">
            <span className="text-base">🛍️</span>
            <h2 className="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-white">
              Últimas Ofertas
            </h2>
          </div>

          <div ref={resultsSectionRef}>
            {loading ? (
              <div className="grid grid-cols-2 gap-2">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="bg-slate-100 dark:bg-slate-850 rounded-xl h-44 animate-pulse" />
                ))}
              </div>
            ) : errorMsg ? (
              <div className="text-center py-8 bg-slate-50 dark:bg-slate-900 rounded-2xl border border-red-100 dark:border-red-950 p-4">
                <span className="text-2xl">⚠️</span>
                <p className="text-slate-600 dark:text-slate-400 text-xs mt-1 font-bold">Lamentamos, não foi possível carregar.</p>
              </div>
            ) : filteredAds.length === 0 ? (
              <div className="text-center py-10 bg-slate-50 dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800">
                <p className="text-xs font-black text-slate-400">Nenhum anúncio disponível.</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {displayedAds.map((ad) => (
                  <AdCard key={`mb-ad-${ad.id}`} ad={ad} />
                ))}
              </div>
            )}

            {hasMore && !loading && (
              <div className="flex justify-center mt-6 pb-4">
                <button
                  onClick={handleLoadMore}
                  disabled={isFetchingMore}
                  className="flex items-center gap-1.5 px-6 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-extrabold text-xs rounded-full shadow-md transition-all cursor-pointer"
                >
                  {isFetchingMore ? (
                    <span>A carregar...</span>
                  ) : (
                    <>
                      <span>Carregar mais</span>
                      <ArrowRight size={12} />
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        </section>
      </div>

      {/* Voltar ao Topo (Comum a ambos os layouts) */}
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
  );
};

export default Home;