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
    ? hexToRgba(settings?.searchGroupBgColor, settings?.searchGroupOpacity === 0 ? 0 : Math.min(100, (settings?.searchGroupOpacity ?? 10) + 15))
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
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [ads, setAds] = useState<Ad[]>([]);
  const [featuredAds, setFeaturedAds] = useState<Ad[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [reloadCounter, setReloadCounter] = useState(0);
  const [category, setCategory] = useState('Todas');
  const [city, setCity] = useState('Todas');
  
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

  // Onboarding states for country selection
  const [showTooltip, setShowTooltip] = useState(false);
  const [shouldAnimateButton, setShouldAnimateButton] = useState(false);

  // Custom Dropdown states
  const [countryDropdownOpen, setCountryDropdownOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(true);
  const dropdownRef = useRef<HTMLDivElement>(null);

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

    return finalResult.slice(0, 20);
  }, [featuredAds, searchTerm, category, city, country]);

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
  }, [ads, searchTerm, category, city, country]);

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

  return (
    <div className="flex flex-col gap-2 md:gap-4">
      {/* HERO BANNER LUXURY SLIM + PAINEL LUSÓFONO */}
      <section className="relative -mt-6 md:-mt-8 transition-all duration-500">

        {/* Imagem de Fundo dinâmica: Portugal / Reino Unido */}
        <div className="absolute inset-0 z-0 overflow-hidden shadow-2xl rounded-b-[2rem] md:rounded-b-[3rem]">
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
          {/* Overlay suave para contraste (ajustado para aspeto de dia radiante, claro e nítido) */}
          <div className="absolute inset-0 bg-gradient-to-b from-black/15 via-transparent to-black/35 backdrop-saturate-[1.1]" />
          <div className="absolute inset-0 bg-gradient-to-r from-black/20 via-transparent to-black/10 hidden lg:block" />
        </div>

        <div className="relative z-10 mx-auto w-full px-1.5 xs:px-2 sm:px-6 py-3 md:py-6 lg:py-7.5">
          <motion.div 
            initial={{ opacity: 0, y: 10 }} 
            animate={{ opacity: 1, y: 0 }}
            className="mx-auto max-w-5xl"
          >
            <div className="flex flex-col items-center justify-center text-center gap-3.5 md:gap-4 w-full">

              {/* Painel Lusófono elegante integrado diretamente sobre a imagem sem quadro translúcido (Proposta A Melhorada e Purificada) */}
              <motion.div 
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                className="w-full max-w-4xl flex flex-col items-center justify-center gap-3.5 md:gap-4 select-none tracking-tight relative overflow-hidden px-2 py-2"
              >
                <div className="text-center space-y-2.5 md:space-y-4">
                  {/* Badge da comunidade com as cores clássicas (verde e amarelo) integradas de forma luxuosa */}
                  <div className="inline-flex items-center gap-2 bg-[#046a38]/90 text-amber-300 px-5 py-2 rounded-full border border-amber-400/30 text-[10px] md:text-xs font-black uppercase tracking-[0.25em] shadow-lg hover:scale-105 transition-transform duration-300 select-none drop-shadow-md">
                    <span>🌍</span> Comunidade Lusófona
                  </div>

                  <h1 className="text-3xl sm:text-4xl md:text-5xl font-black text-white tracking-tight leading-none drop-shadow-2xl">
                    Mais de <span className="bg-gradient-to-r from-amber-200 via-amber-300 to-amber-100 bg-clip-text text-transparent drop-shadow-sm font-black">300 Milhões</span>
                  </h1>
                  
                  <p className="text-sm sm:text-base md:text-xl font-bold text-white/95 tracking-wide drop-shadow-md max-w-2xl mx-auto leading-relaxed">
                    de falantes de português unidos no mundo.
                  </p>
                </div>

                {/* Bandeiras dos países integradas com hover interativo e rebordo personalizado para cada nação (sem painel translúcido atrás) */}
                <div className="grid grid-cols-3 md:flex md:flex-wrap items-center justify-center gap-2 md:gap-3.5 w-full max-w-4xl mx-auto px-1">
                  {[
                    { flag: '🇵🇹', name: 'Portugal', code: 'pt', border: 'border-green-400/80' },
                    { flag: '🇧🇷', name: 'Brasil', code: 'br', border: 'border-yellow-400/80' },
                    { flag: '🇦🇴', name: 'Angola', code: 'ao', border: 'border-red-400/80' },
                    { flag: '🇲🇿', name: 'Moçambique', code: 'mz', border: 'border-amber-400/80' },
                    { flag: '🇨🇻', name: 'Cabo Verde', code: 'cv', border: 'border-blue-400/80' },
                    { flag: '🇬🇼', name: 'Guiné-Bissau', code: 'gw', border: 'border-red-400/80' },
                    { flag: '🇸🇹', name: 'São Tomé', code: 'st', border: 'border-yellow-400/80' },
                    { flag: '🇹🇱', name: 'Timor-Leste', code: 'tl', border: 'border-red-400/80' },
                    { flag: '🇬🇶', name: 'Guiné Eq.', code: 'gq', border: 'border-green-400/80' },
                  ].map((item, idx) => (
                    <motion.div 
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.04 }}
                      key={item.name} 
                      className={`group/flag flex items-center justify-center gap-1.5 md:gap-2.5 bg-slate-950/50 hover:bg-slate-950/75 active:scale-95 border-2 ${item.border} rounded-full py-1.5 px-2 md:py-2 md:px-4.5 transition-all duration-300 cursor-default shadow-lg hover:shadow-2xl hover:scale-[1.05]`}
                      title={item.name}
                    >
                      <div className="w-6.5 h-6.5 md:w-8 md:h-8 rounded-full overflow-hidden flex items-center justify-center border-2 border-white/30 shadow-inner shrink-0 relative">
                        <img 
                          src={`https://flagcdn.com/w40/${item.code}.png`} 
                          alt={item.flag} 
                          className="h-full w-full object-cover shrink-0 select-none scale-120 group-hover/flag:scale-135 transition-transform duration-300"
                          referrerPolicy="no-referrer"
                        />
                      </div>
                      <span className="text-[9px] xs:text-[10px] md:text-sm font-black text-white group-hover/flag:text-amber-300 transition-colors duration-300 select-none uppercase tracking-wide truncate max-w-[65px] xs:max-w-none">
                        {item.name}
                      </span>
                    </motion.div>
                  ))}
                </div>
              </motion.div>

              {/* Barra de Pesquisa Minimalista - Destaque Central */}
              <div className="relative w-full max-w-xl md:max-w-2xl mx-auto group px-1">
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  onFocus={handleSearchFocus}
                  placeholder="✨ O que procura hoje? Digite aqui..."
                  className={`w-full ${blurClass} rounded-full py-3 sm:py-3.5 pl-6 sm:pl-7 pr-12 sm:pr-14 ${txtColorClass} ${placeholderClass} outline-none border transition-all duration-300 font-extrabold tracking-wide text-sm sm:text-base focus:scale-[1.03] focus:shadow-[0_0_25px_rgba(255,255,255,0.25)] hover:border-white/40 focus:border-white/60`}
                  style={{
                    backgroundColor: customBg || 'rgba(15,23,42,0.3)',
                    borderColor: customBorder || 'rgba(255,255,255,0.2)',
                  }}
                />
                <div className="absolute inset-y-0 right-5 flex items-center pointer-events-none">
                  <Search size={20} className={`${txtMutedClass} group-focus-within:${txtColorClass} transition-colors group-focus-within:scale-110 duration-300`} />
                </div>
              </div>

              {/* Ícones de Filtro e Contador - Centralizados com Elegância */}
              <div className="flex items-center justify-center gap-3 md:gap-4 flex-wrap w-full">

                {/* Botão Categoria - Ícone com Texto Abaixo */}
                <div className="relative group flex flex-col items-center">
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
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === 'Trabalho/Empregos') {
                          navigate('/trabalhos');
                        } else {
                          setCategory(val);
                        }
                      }} 
                      className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                    >
                      <option value="Todas">Categorias</option>
                      {categories.map((c, i) => <option key={i} value={c} className="bg-slate-900">{c}</option>)}
                    </select>
                  </div>
                  <span className="text-[9px] md:text-[10px] font-bold text-white/90 drop-shadow-sm mt-1 select-none pointer-events-none whitespace-nowrap">
                    {category === 'Todas' ? 'Categoria' : category}
                  </span>
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
                      borderColor: customBorder || 'rgba(255,255,255,0.25)',
                    }}
                    className={`relative overflow-hidden h-10 md:h-12 w-28 md:w-32 flex items-center justify-center gap-1 ${blurClass} rounded-full border ${txtColorClass} hover:opacity-90 hover:scale-105 active:scale-95 transition-all cursor-pointer shadow-lg font-bold outline-none select-none animate-country-pulse`}
                    title="Mudar de Comunidade"
                    id="community-toggle-button"
                  >
                    {/* Camada 1: Bandeira de fundo com 100% de opacidade (sem transparência nem desbotamento) */}
                    {getFlagSvgUrl(country) && (
                      <div 
                        className="absolute inset-0 z-0 pointer-events-none select-none"
                        style={{
                          backgroundImage: `url("${getFlagSvgUrl(country)}")`,
                          backgroundSize: 'cover',
                          backgroundPosition: 'center',
                          opacity: 1,
                        }}
                      />
                    )}

                    {/* Camada 2: Cor de fundo transparente configurável / máscara de sobreposição */}
                    <div 
                      className="absolute inset-0 z-10 pointer-events-none select-none"
                      style={{
                        backgroundColor: customBg || 'rgba(15,23,42,0.35)',
                      }}
                    />

                    {/* Camada 3: Conteúdo interativo */}
                    <div className="relative z-20 flex items-center justify-center w-full h-full">
                      <span className="text-[10px] md:text-xs opacity-90 text-white font-black drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)] filter shrink-0">▼</span>
                    </div>
                  </button>

                  {/* Dropdown de Países Personalizado */}
                  <AnimatePresence>
                    {countryDropdownOpen && (
                      <motion.div
                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 10, scale: 0.95 }}
                        transition={{ duration: 0.15 }}
                        className="absolute left-1/2 -translate-x-1/2 md:left-0 md:translate-x-0 top-12 md:top-14 z-[9999] w-52 rounded-2xl p-2.5 shadow-2xl flex flex-col gap-1.5 border border-slate-200 bg-white text-slate-800"
                      >
                        <button
                          type="button"
                          onClick={() => {
                            handleCountryChange('Portugal');
                            setCountryDropdownOpen(false);
                          }}
                          className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left text-sm font-bold transition-all cursor-pointer select-none border ${
                            country === 'Portugal'
                              ? 'bg-emerald-50 text-[#046a38] border-emerald-200 font-extrabold shadow-sm'
                              : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-[#e3f6ea] hover:border-[#bfead0] hover:text-[#046a38] hover:scale-[1.01] font-semibold'
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
                          className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left text-sm font-bold transition-all cursor-pointer select-none border ${
                            country === 'Reino Unido'
                              ? 'bg-blue-50 text-blue-800 border-blue-200 font-extrabold shadow-sm'
                              : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-blue-50 hover:border-blue-150 hover:text-blue-800 hover:scale-[1.01] font-semibold'
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

                {/* Botão Localização - Ícone com Texto Abaixo */}
                <div className="relative group flex flex-col items-center">
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
                  <span className="text-[9px] md:text-[10px] font-bold text-white/90 drop-shadow-sm mt-1 select-none pointer-events-none whitespace-nowrap">
                    {city === 'Todas' ? 'Cidade' : city}
                  </span>
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
            </div>
          </motion.div>
        </div>
      </section>

      {/* ✨ ANÚNCIOS EM DESTAQUE */}
      {filteredFeaturedAds.length > 0 && (
        <section className="space-y-1 pt-0 pb-1.5 md:space-y-1.5 md:pb-2">
          <div className="flex items-center justify-between border-b border-slate-100 pb-1">
            <div className="flex items-center gap-2">
              <span className="text-xl">✨</span>
              <div>
                <h2 className="text-base md:text-lg font-black text-slate-800 tracking-tight leading-none">
                  Anúncios em Destaque
                </h2>
                <p className="text-[10px] md:text-xs text-slate-500 font-bold tracking-wide uppercase mt-0.5">
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

      {/* 🏪 EMPREENDEDORES EM DESTAQUE */}
      {featuredVitrines.length > 0 && (
        <section className="space-y-2 pt-2.5 pb-4 md:pt-3 md:pb-5" id="featured-entrepreneurs">
          <div className="flex items-center justify-between border-b border-slate-100 pb-1">
            <div className="flex items-center gap-2">
              <span className="text-xl">🏪</span>
              <div>
                <h2 className="text-base md:text-lg font-black text-slate-800 tracking-tight leading-none">
                  Empreendedores em Destaque
                </h2>
                <p className="text-[10px] md:text-xs text-slate-500 font-bold tracking-wide uppercase mt-0.5">
                  Vitrines Digitais em alta na comunidade
                </p>
              </div>
            </div>
            <Link
              to="/empreendedores"
              className="group flex items-center gap-1 text-xs font-black text-indigo-600 hover:text-indigo-700 transition-colors uppercase tracking-wider"
            >
              <span>Ver Todos</span>
              <ArrowRight size={14} className="group-hover:translate-x-0.5 transition-transform" />
            </Link>
          </div>

          <div className="flex gap-4 sm:gap-6 overflow-x-auto pb-4 -mx-1.5 px-1.5 xs:-mx-2 xs:px-2 sm:mx-0 sm:px-0 no-scrollbar" style={{ scrollSnapType: 'x mandatory' }}>
            {featuredVitrines.map((vitrine) => {
              const linkTo = `/empreendedores/${vitrine.showcaseSlug}`;
              const fallbackCover = 'https://images.unsplash.com/photo-1557804506-669a67965ba0?auto=format&fit=crop&w=450&h=150&fit=crop&q=80';
              return (
                <Link 
                  key={vitrine.uid} 
                  to={linkTo}
                  className="w-[270px] sm:w-[300px] h-[340px] shrink-0 bg-[#0d0e12] rounded-[1.75rem] border border-slate-800/60 shadow-xl hover:shadow-2xl hover:-translate-y-1 transition-all duration-300 flex flex-col justify-between overflow-hidden group scroll-snap-align-start cursor-pointer"
                  style={{ scrollSnapAlign: 'start' }}
                >
                  {/* Banner Cover taking ~80% of the card height */}
                  <div className="relative h-[275px] w-full bg-slate-900 overflow-hidden">
                    <img 
                      src={vitrine.showcaseCover || fallbackCover} 
                      alt={vitrine.showcaseName} 
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" 
                      referrerPolicy="no-referrer"
                    />
                    
                    {/* Centered circular logo at the top over the banner */}
                    <div className="absolute top-4 left-1/2 -translate-x-1/2 w-14 h-14 rounded-full bg-white border-2 border-white shadow-md flex items-center justify-center overflow-hidden z-20">
                      {vitrine.showcaseLogo && vitrine.showcaseLogo.trim() !== '' ? (
                        <img src={vitrine.showcaseLogo} alt="Logo" className="w-full h-full object-cover rounded-full" referrerPolicy="no-referrer" />
                      ) : (
                        <span className="text-xl">🏬</span>
                      )}
                    </div>

                    {/* Dark gradient overlay on bottom of the image for text contrast */}
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/45 to-transparent pt-16 p-4 flex flex-col justify-end z-10">
                      <div className="flex justify-between items-end gap-2 text-white">
                        <div className="min-w-0 flex-1">
                          {/* Name */}
                          <h3 className="font-extrabold text-white text-base sm:text-lg leading-tight line-clamp-1 truncate drop-shadow-md">
                            {vitrine.showcaseName}
                          </h3>
                          {/* Location */}
                          <div className="flex items-center gap-1 text-[11px] sm:text-xs text-slate-350 font-medium mt-1 truncate drop-shadow-sm">
                            <MapPin size={11} className="text-slate-400 shrink-0" />
                            <span className="truncate">{vitrine.city ? `${vitrine.city}, ` : ''}{vitrine.country === 'Portugal' ? '🇵🇹 pt' : '🇬🇧 uk'}</span>
                          </div>
                        </div>
                        
                        {/* Compact items badge on bottom right corner of image */}
                        <div className="px-2 py-1 bg-black/65 border border-white/10 text-white rounded-lg text-[10px] font-black flex items-center gap-1 shrink-0 shadow-xs">
                          <span>📦</span>
                          <span>{vitrine.productsCount} {vitrine.productsCount === 1 ? 'item' : 'itens'}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Bottom ~20% of the card - CTA button */}
                  <div className="p-3 bg-[#0d0e12] flex items-center justify-center h-[65px] shrink-0 border-t border-slate-900/35">
                    <div
                      className="w-full py-2 bg-[#136338] group-hover:bg-[#1a5e37] text-white font-extrabold text-xs sm:text-sm flex items-center justify-center gap-1.5 rounded-xl transition-all shadow-md text-center border border-emerald-800/10"
                    >
                      <Store size={14} className="text-white shrink-0" />
                      <span>Meu Negócio</span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* Grid de Anúncios */}
      <div ref={resultsSectionRef} className="px-0">
        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2 xs:gap-2.5 sm:gap-4 md:gap-6">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="bg-slate-100 rounded-3xl h-64 animate-pulse" />
            ))}
          </div>
        ) : errorMsg ? (
          <div className="text-center py-16 bg-white rounded-[3rem] border border-red-100 shadow-md max-w-md mx-auto p-8 flex flex-col items-center">
            <span className="text-4xl">⚠️</span>
            <h3 className="text-lg font-extrabold text-slate-800 mt-3">Problema de Ligação ao Banco de Dados</h3>
            <p className="text-slate-500 text-sm mt-1.5 leading-relaxed">
              O servidor do banco de dados está temporariamente sob sobrecarga ou em standby. Deseja tentar estabelecer ligação novamente?
            </p>
            <button
              onClick={() => {
                setErrorMsg(null);
                setLoading(true);
                clearHomeCache();
                setReloadCounter(prev => prev + 1);
              }}
              className="mt-5 px-6 py-2.5 bg-slate-900 text-white font-bold text-xs rounded-xl hover:bg-slate-800 transition active:scale-95 shadow-md shadow-slate-900/10 cursor-pointer flex items-center gap-2"
            >
              <RefreshCcw size={14} />
              Tentar Novamente
            </button>
          </div>
        ) : filteredAds.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-[3rem] border border-slate-100 shadow-sm">
            <ShoppingBag size={48} className="mx-auto text-slate-200 mb-4" />
            <h3 className="text-xl font-bold text-slate-400">Nenhum tesouro encontrado</h3>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2 xs:gap-2.5 sm:gap-4 md:gap-6">
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