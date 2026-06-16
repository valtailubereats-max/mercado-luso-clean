import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate, useLocation } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { motion, AnimatePresence } from 'motion/react';
import { 
  MapPin, MessageCircle, Clock, ChevronLeft, ChevronRight, X, Heart, Star, 
  Trash2, Edit, AlertCircle, ShieldAlert, ShoppingBag, Eye, Award, Calendar, Share2, ExternalLink
} from 'lucide-react';
import { 
  doc, updateDoc, increment, setDoc, collection, query, where, limit, getDoc, serverTimestamp 
} from 'firebase/firestore';
import { db, getDocWithCacheFallback, getDocsWithCacheFallback, parseFirestoreDate } from '../firebase';
import { Ad, UserProfile, Review } from '../types';
import { useAuth } from '../context/AuthContext';
import { formatPrice, getAdUrl, extractIdFromSlug } from '../utils';
import { formatDistanceToNow } from 'date-fns';
import { pt } from 'date-fns/locale';
import ReviewModal from '../components/ReviewModal';
import { normalizeDescription } from '../utils/textFormatter';

const AdDetails = () => {
  const { id } = useParams<{ id: string }>();
  const { user, profile, favorites, toggleFavoriteGlobal, isAdmin } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [ad, setAd] = useState<Ad | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Imagens e galeria
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [showFullImage, setShowFullImage] = useState(false);

  // Vendedor e avaliações gerais
  const [sellerProfile, setSellerProfile] = useState<UserProfile | null>(null);
  const [sellerReviews, setSellerReviews] = useState<Review[]>([]);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [showReviewsSection, setShowReviewsSection] = useState(true);
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [toast, setToast] = useState<{ show: boolean; type: 'success' | 'error' | 'loading'; message: string } | null>(null);

  // Estados da Vitrine
  const [showcaseActive, setShowcaseActive] = useState(false);
  const [showcaseSlug, setShowcaseSlug] = useState('');

  const showToastMsg = (type: 'success' | 'error' | 'loading', message: string, duration = 4000) => {
    setToast({ show: true, type, message });
    if (type !== 'loading') {
      setTimeout(() => {
        setToast(prev => prev && prev.message === message ? null : prev);
      }, duration);
    }
  };

  // Segurança de Contacto WhatsApp
  const [showContactWarning, setShowContactWarning] = useState(false);
  const [acceptedContactTerms, setAcceptedContactTerms] = useState(() => {
    return localStorage.getItem('safety_terms_accepted') === 'true';
  });

  // Denúncia
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [reportDetails, setReportDetails] = useState('');
  const [reporting, setReporting] = useState(false);

  const isFavorite = ad ? favorites.includes(ad.id) : false;

  // Carregar anúncio e incrementar visualização
  useEffect(() => {
    if (!id) return;

    let active = true;
    const fetchAdData = async () => {
      try {
        setLoading(true);
        setErrorMsg(null);

        const realId = extractIdFromSlug(id);
        const adRef = doc(db, 'ads', realId);
        const adSnap = await getDocWithCacheFallback(adRef, `ads/${realId}`);

        if (!active) return;

        if (!adSnap.exists()) {
          setErrorMsg('Anúncio não encontrado ou já expirado.');
          setLoading(false);
          return;
        }

        const adData = { id: adSnap.id, ...adSnap.data() } as Ad;
        setAd(adData);

        // Incrementar visualização no Firestore
        try {
          await updateDoc(adRef, { views: increment(1) });
        } catch (vErr) {
          console.error('Erro ao incrementar visualizações:', vErr);
        }

        // Carregar vendedor e avaliações
        if (adData.sellerId) {
          fetchSellerDetails(adData.sellerId);
        }
      } catch (err) {
        console.error('Erro ao carregar anúncio:', err);
        setErrorMsg('Erro de rede ao conectar à base de dados. Tente novamente.');
      } finally {
        if (active) setLoading(false);
      }
    };

    fetchAdData();
    return () => { active = false; };
  }, [id]);

  useEffect(() => {
    if (!loading && ad && location.hash === '#localizacao') {
      const timer = setTimeout(() => {
        const element = document.getElementById('localizacao');
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [loading, ad, location.hash]);

  const fetchSellerDetails = async (sellerId: string) => {
    try {
      setReviewsLoading(true);

      // Verificar se o vendedor possui Vitrine Digital ativa
      try {
        const pRef = doc(db, 'sellerPublicProfiles', sellerId);
        const pSnap = await getDocWithCacheFallback(pRef, `sellerPublicProfiles/${sellerId}`);
        if (pSnap.exists()) {
          const pData = pSnap.data();
          if (pData?.showcaseActive) {
            setShowcaseActive(true);
            setShowcaseSlug(pData.showcaseSlug || '');
          } else {
            setShowcaseActive(false);
            setShowcaseSlug('');
          }
        } else {
          setShowcaseActive(false);
          setShowcaseSlug('');
        }
      } catch (pErr) {
        console.error('Erro ao verificar vitrine do vendedor:', pErr);
      }
      
      const ratingAverage = (ad as any)?.sellerRating !== undefined ? (ad as any).sellerRating : ((ad as any)?.rating !== undefined ? (ad as any).rating : 0);
      const ratingCount = (ad as any)?.sellerReviewCount !== undefined ? (ad as any).sellerReviewCount : ((ad as any)?.reviewCount !== undefined ? (ad as any).reviewCount : 0);

      const profileData: any = {
        uid: sellerId,
        displayName: (ad && ad.sourceUrl && /^https?:\/\//i.test(ad.sourceUrl)) ? 'Parceiro' : (ad?.sellerName || 'Vendedor'),
        city: ad?.city || '',
        country: ad?.country || 'Portugal',
        ratingAverage,
        ratingCount
      };

      console.log(`[AdDetails] Evitando fetch de sellerPublicProfiles para o vendedor ${sellerId} para poupar leituras Firestore.`);

      // Carregar reviews enviadas a este vendedor se o utilizador estiver autenticado
      let reviewsData: Review[] = [];
      if (user) {
        try {
          const q = query(collection(db, 'reviews'), where('sellerId', '==', sellerId), limit(8));
          const snap = await getDocsWithCacheFallback(q, `reviews/sellerId-${sellerId}`);
          reviewsData = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Review));
          
          // Ordenação decrescente de data
          reviewsData.sort((a, b) => {
            const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
            const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
            return timeB - timeA;
          });
        } catch (reviewErr) {
          console.warn('Erro ao carregar avaliações do vendedor:', reviewErr);
        }
      }

      setSellerReviews(reviewsData);

      // Calcular fallback de estatísticas se campos inexistirem no doc principal
      let finalCount = profileData.ratingCount;
      let finalAverage = profileData.ratingAverage;

      if (reviewsData.length > 0 && (finalCount === 0 || finalAverage === 0)) {
        finalCount = reviewsData.length;
        const totalStars = reviewsData.reduce((sum, rev) => sum + (rev.rating || 0), 0);
        finalAverage = parseFloat((totalStars / finalCount).toFixed(1));
      }

      setSellerProfile({
        ...profileData,
        ratingAverage: finalAverage,
        ratingCount: finalCount
      } as UserProfile);

    } catch (err) {
      console.error('Erro ao carregar detalhes do vendedor:', err);
    } finally {
      setReviewsLoading(false);
    }
  };

  const handleToggleFavorite = async () => {
    if (!ad) return;
    try {
      await toggleFavoriteGlobal(ad.id);
    } catch (err) {
      console.error('Erro ao favoritar:', err);
    }
  };

  const getAdPhone = () => {
    if (!ad) return '';
    if (ad.useProfilePhone === false && ad.contactPhone) {
      return ad.contactPhone;
    }
    return ad.sellerPhone || '';
  };

  const cleanPhone = (phone: string) => {
    return phone.replace(/\D/g, '');
  };

  const getWhatsappUrl = () => {
    if (!ad) return '';
    const phone = cleanPhone(getAdPhone());
    return `https://wa.me/${phone}?text=${encodeURIComponent(`Olá, vi o seu anúncio "${ad.title}" no Mercado Luso e tenho grande interesse. Está disponível?`)}`;
  };

  const hasSourceUrl = !!(ad && ad.sourceUrl && /^https?:\/\//i.test(ad.sourceUrl));

  const getTargetContactUrl = () => {
    if (!ad) return '';
    if (hasSourceUrl && ad.sourceUrl) {
      return ad.sourceUrl;
    }
    return getWhatsappUrl();
  };

  const incrementWhatsappClicks = async () => {
    if (!ad) return;
    try {
      await updateDoc(doc(db, 'ads', ad.id), {
        whatsappClicks: increment(1)
      });
    } catch (err) {
      console.error('Erro ao registar clique no WhatsApp:', err);
    }
  };

  const handleContactClick = () => {
    if (ad?.adStatus === 'sold' || ad?.status === 'sold') {
      showToastMsg('error', 'Este anúncio já foi vendido. Não é possível contactar o vendedor.');
      return;
    }
    if (!user) {
      navigate(`/login?message=${encodeURIComponent('Para contactar o vendedor, faça login ou crie uma conta gratuita.')}`);
      return;
    }

    const accepted = localStorage.getItem('safety_terms_accepted') === 'true';
    if (accepted && ad) {
      console.log('[AdDetails] Safety terms already accepted. Registering interest directly.');
      incrementWhatsappClicks();
      showToastMsg('loading', 'A registar o seu interesse no anúncio...');
      registerInterest().then((res: any) => {
        if (res.success) {
          if (res.bypassed) {
            showToastMsg('success', hasSourceUrl ? 'A abrir o link de contacto...' : 'A abrir o WhatsApp...', 2000);
          } else {
            showToastMsg('success', hasSourceUrl ? '👥 Interesse registado! A abrir o contacto...' : '👥 Interesse registado! A abrir o WhatsApp...', 3000);
          }
          setTimeout(() => {
            window.open(getTargetContactUrl(), '_blank', 'noopener,noreferrer');
          }, 1000);
        } else {
          showToastMsg('error', `⚠️ Erro na BD: ${res.error || 'Falha ao registar'}. A abrir contacto...`, 6000);
          setTimeout(() => {
            window.open(getTargetContactUrl(), '_blank', 'noopener,noreferrer');
          }, 2500);
        }
      });
    } else {
      setShowContactWarning(true);
    }
  };

  const registerInterest = async (): Promise<{ success: boolean; error?: string; bypassed?: boolean }> => {
    if (!user || !ad) {
      console.warn('[AdDetails] Cannot register interest: user or ad is missing.');
      return { success: false, error: 'Sessão expirada ou anúncio indisponível.' };
    }

    // 3. Em adInterests: não usar sellerId vazio. se ad.sellerId estiver ausente, não gravar adInterest e registrar erro claro no console. não tentar notification. abrir WhatsApp normalmente.
    if (!ad.sellerId || !ad.sellerId.trim()) {
      console.error(`[AdDetails] Erro de Integridade: ad.sellerId está ausente ou vazio para o anúncio ID "${ad.id}". Registro de adInterests cancelado e abertura de WhatsApp liberada.`);
      return { success: true, bypassed: true };
    }

    const docId = `${ad.id}_${user.uid}`;
    const rawName = (profile?.name || user.displayName || user.email || '').trim();
    const sanitizedName = rawName.length > 0 ? rawName : 'Utilizador do Mercado Luso';
    const truncatedName = sanitizedName.substring(0, 95); // Ensure it's under 100 character limit of rules
    
    const interestData = {
      id: docId,
      adId: ad.id,
      sellerId: ad.sellerId.trim(),
      interestedUserId: user.uid,
      interestedUserName: truncatedName,
      createdAt: serverTimestamp(),
      source: 'whatsapp'
    };
    
    // 5. Logs obrigatórios
    console.log(`[AdDetails] Iniciando gravação de adInterest.`);
    console.log(`- user.uid: "${user.uid}"`);
    console.log(`- ad.id: "${ad.id}"`);
    console.log(`- ad.sellerId: "${ad.sellerId.trim()}"`);
    console.log(`- interestId: "${docId}"`);
    console.log(`- payload:`, JSON.stringify(interestData, null, 2));

    try {
      await setDoc(doc(db, 'adInterests', docId), interestData);
      console.log(`[AdDetails] Sucesso ao gravar adInterest na coleção: "${docId}".`);

      const cacheKey = `interest_reg_${ad.id}_${user.uid}`;
      localStorage.setItem(cacheKey, 'true');

      // 2. Separar completamente: gravar adInterest e criar notification. O erro de notification NÃO pode impedir o registro de adInterest.
      // Tentar criar notification em bloco separado; se notification falhar, apenas console.warn
      if (ad.sellerId && ad.sellerId.trim() !== user.uid) {
        try {
          const notifId = `interest_${ad.id}_${user.uid}_${Date.now()}`;
          const notifData = {
            userId: ad.sellerId.trim(),
            title: 'Novo interesse em ' + ad.title.substring(0, 25) + '...',
            message: `${truncatedName} clicou no botão para o contactar via WhatsApp para o anúncio "${ad.title}".`,
            createdAt: serverTimestamp(),
            read: false,
            adId: ad.id,
            type: 'whatsapp_interest'
          };
          console.log('[AdDetails] Tentando criar notificação em bloco separado:', notifData);
          await setDoc(doc(db, 'notifications', notifId), notifData);
          console.log('[AdDetails] Notificação gravada com sucesso!');
        } catch (notifErr) {
          console.warn('[AdDetails] Falha não bloqueante ao criar notificação de interesse:', notifErr);
        }
      }

      return { success: true };
    } catch (err) {
      console.error(`[AdDetails] Erro ao gravar adInterest com ID ${docId}:`, err);
      const errMsg = err instanceof Error ? err.message : String(err);
      return { success: false, error: errMsg };
    }
  };

  const handleConfirmWhatsapp = async () => {
    if (ad?.adStatus === 'sold' || ad?.status === 'sold') {
      showToastMsg('error', 'Este anúncio já foi vendido. Não é possível contactar o vendedor.');
      return;
    }
    if (acceptedContactTerms && ad) {
      localStorage.setItem('safety_terms_accepted', 'true');
      incrementWhatsappClicks();
      if (user) {
        showToastMsg('loading', 'A registar o seu interesse no anúncio...');
        const res = await registerInterest();
        if (res.success) {
          if (res.bypassed) {
            showToastMsg('success', hasSourceUrl ? 'A abrir o link de contacto...' : 'A abrir o WhatsApp...', 2000);
          } else {
            showToastMsg('success', hasSourceUrl ? '👥 Interesse registado! A abrir o contacto...' : '👥 Interesse registado! A abrir o WhatsApp...', 3000);
          }
          setTimeout(() => {
            window.open(getTargetContactUrl(), '_blank', 'noopener,noreferrer');
          }, 1000);
        } else {
          showToastMsg('error', `⚠️ Erro na BD: ${res.error || 'Falha ao registar'}. A abrir contacto...`, 6000);
          setTimeout(() => {
            window.open(getTargetContactUrl(), '_blank', 'noopener,noreferrer');
          }, 2500);
        }
      } else {
        window.open(getTargetContactUrl(), '_blank', 'noopener,noreferrer');
      }
      setShowContactWarning(false);
    }
  };

  const handleShare = async () => {
    if (!ad) return;

    const url = `${window.location.origin}${getAdUrl(ad)}`;
    const priceText = hasPrice ? ` - ${formatPrice(ad.price, ad.country)}` : '';
    const shareText = `${url}\n\nVeja este anúncio no Mercado Luso: ${ad.title}${priceText} em ${ad.city}`;
    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(shareText)}`;

    try {
      const opened = window.open(whatsappUrl, '_blank');
      if (!opened) {
        await navigator.clipboard.writeText(url);
        setShareCopied(true);
        setTimeout(() => setShareCopied(false), 2500);
      }
    } catch (err) {
      console.error('Erro ao abrir o WhatsApp:', err);
      try {
        await navigator.clipboard.writeText(url);
        setShareCopied(true);
        setTimeout(() => setShareCopied(false), 2500);
      } catch (clipErr) {
        console.error('Erro de cópia alternativa:', clipErr);
      }
    }
  };

  const handleReportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ad) return;
    if (!user) {
      alert('Faça login primeiro para denunciar este anúncio.');
      return;
    }
    if (!reportReason) {
      alert('Por favor, selecione o motivo da denúncia.');
      return;
    }

    setReporting(true);
    try {
      const reportId = `rep_${Date.now()}_${user.uid}`;
      await setDoc(doc(db, 'reports', reportId), {
        id: reportId,
        adId: ad.id,
        userId: user.uid,
        reason: reportReason,
        details: reportDetails,
        status: 'pending',
        createdAt: new Date()
      });
      alert('Denúncia enviada à nossa equipa. Agradecemos a ajuda na segurança!');
      setShowReportModal(false);
      setReportReason('');
      setReportDetails('');
    } catch (err) {
      console.error('Erro ao registar denúncia:', err);
      alert('Erro inesperado ao enviar. Tente novamente.');
    } finally {
      setReporting(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12 flex flex-col items-center justify-center min-h-[50vh]">
        <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mb-4" />
        <span className="text-slate-500 font-medium">A carregar anúncio...</span>
      </div>
    );
  }

  if (errorMsg || !ad) {
    return (
      <div className="max-w-xl mx-auto px-4 py-16 text-center">
        <div className="w-16 h-16 bg-red-50 text-red-600 rounded-full flex items-center justify-center mx-auto mb-6">
          <AlertCircle size={32} />
        </div>
        <h1 className="text-2xl font-black text-slate-900 mb-2">Ops! Ocorreu um problema</h1>
        <p className="text-slate-600 mb-8 leading-relaxed">{errorMsg || 'Anúncio indisponível.'}</p>
        <Link 
          to="/"
          className="inline-flex items-center justify-center bg-indigo-600 font-bold text-white px-6 py-3 rounded-2xl shadow-md hover:bg-indigo-700 transition"
        >
          Voltar para Explorar
        </Link>
      </div>
    );
  }

  const rawImages = ad.images && ad.images.length > 0 ? ad.images : [ad.imageUrl];
  const images = rawImages.filter((img): img is string => typeof img === 'string' && img.trim() !== '');
  if (images.length === 0) {
    images.push('https://images.unsplash.com/photo-1557804506-669a67965ba0?auto=format&fit=crop&w=600&q=80');
  }
  const normalizedDescription = normalizeDescription(ad.description);
  
  const hasPrice =
    ad.category !== 'Imigração' &&
    ad.category !== 'Apoio ao Imigrante' &&
    ad.category !== 'Serviços Gratuitos' &&
    ad.category !== 'Informação' &&
    ad.price !== undefined &&
    ad.price !== null &&
    String(ad.price).trim() !== '' &&
    Number(ad.price) > 0;

  const dateObject = parseFirestoreDate(ad.createdAt);
  const timeStr = dateObject 
    ? formatDistanceToNow(dateObject, { addSuffix: true, locale: pt }) 
    : 'data indisponível';

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      {ad && (
        <Helmet>
          <title>{ad.title} - {ad.city}, {ad.country || 'Portugal'} | Mercado Luso</title>
          <meta name="description" content={normalizedDescription.substring(0, 160)} />
          <link rel="canonical" href={`https://www.mercado-luso.com${getAdUrl(ad)}`} />
          <meta property="og:url" content={`https://www.mercado-luso.com${getAdUrl(ad)}`} />
          <meta property="og:title" content={`${ad.title} - ${ad.city}, ${ad.country || 'Portugal'} | Mercado Luso`} />
          <meta property="og:description" content={normalizedDescription.substring(0, 160)} />
          <meta property="og:image" content={ad.imageUrl} />
        </Helmet>
      )}

      {/* Botão Voltar */}
      <div className="mb-6">
        <button 
          onClick={() => navigate(-1)} 
          className="inline-flex items-center gap-2 text-slate-500 hover:text-indigo-600 font-bold transition-all p-2 hover:bg-slate-50 rounded-xl"
        >
          <ChevronLeft size={20} /> Voltar
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* LADO ESQUERDO: Imagens e Galeria */}
        <div className="lg:col-span-7 space-y-4">
          <div className="relative aspect-[4/3] md:aspect-[16/10] bg-slate-950 rounded-3xl overflow-hidden shadow-lg group touch-none flex items-center justify-center">
            {/* Ambient Background Blur Effect */}
            <div 
              className="absolute inset-0 bg-cover bg-center blur-2xl opacity-25 select-none pointer-events-none scale-110"
              style={{ backgroundImage: `url(${images[currentImageIndex]})` }}
            />
            {/* Main Carousel Image */}
            <img
              src={images[currentImageIndex]}
              alt={ad.title}
              className="w-full h-full object-cover relative z-10 cursor-zoom-in"
              onClick={() => setShowFullImage(true)}
              referrerPolicy="no-referrer"
              style={currentImageIndex === 0 ? {
                objectPosition: ad.imagePositionX !== undefined && ad.imagePositionY !== undefined
                  ? `${ad.imagePositionX}% ${ad.imagePositionY}%`
                  : '50% 50%',
                transform: `scale(${ad.imageZoom || 1}) translate(${
                  ad.imageZoom && ad.imageZoom > 1
                    ? ((ad.imagePositionX || 50) - 50) * (ad.imageZoom - 1) / ad.imageZoom
                    : 0
                }%, ${
                  ad.imageZoom && ad.imageZoom > 1
                    ? ((ad.imagePositionY || 50) - 50) * (ad.imageZoom - 1) / ad.imageZoom
                    : 0
                }%)`
              } : undefined}
            />

            {/* Favorito Button */}
            <button
              onClick={handleToggleFavorite}
              className={`absolute top-4 right-4 p-3 rounded-full z-20 backdrop-blur-md transition-all shadow-md ${
                isFavorite ? 'bg-red-500 text-white hover:bg-red-600' : 'bg-white/90 text-slate-400 hover:text-red-500 hover:bg-white'
              }`}
            >
              <Heart size={20} fill={isFavorite ? 'currentColor' : 'none'} />
            </button>

            {/* Carousel Buttons */}
            {images.length > 1 && (
              <>
                <button
                  onClick={() => setCurrentImageIndex((prev) => (prev === 0 ? images.length - 1 : prev - 1))}
                  className="absolute left-4 top-1/2 -translate-y-1/2 p-2.5 bg-white/90 dark:bg-slate-900/90 hover:bg-white backdrop-blur-md rounded-full text-slate-900 shadow-md z-20"
                >
                  <ChevronLeft size={20} />
                </button>
                <button
                  onClick={() => setCurrentImageIndex((prev) => (prev === images.length - 1 ? 0 : prev + 1))}
                  className="absolute right-4 top-1/2 -translate-y-1/2 p-2.5 bg-white/90 dark:bg-slate-900/90 hover:bg-white backdrop-blur-md rounded-full text-slate-900 shadow-md z-20"
                >
                  <ChevronRight size={20} />
                </button>
              </>
            )}
          </div>

          {/* Thumbnails strip */}
          {images.length > 1 && (
            <div className="flex gap-2 mr-1 overflow-x-auto py-2">
              {images.map((img, i) => (
                <button
                  key={i}
                  onClick={() => setCurrentImageIndex(i)}
                  className={`w-20 h-16 rounded-xl overflow-hidden shrink-0 border-2 transition-all ${
                    currentImageIndex === i ? 'border-indigo-600 scale-95 shadow-sm' : 'border-transparent opacity-60 hover:opacity-100'
                  }`}
                >
                  <img 
                    src={img} 
                    alt={`Miniatura ${i}`} 
                    className="w-full h-full object-cover" 
                    style={i === 0 ? {
                      objectPosition: ad.imagePositionX !== undefined && ad.imagePositionY !== undefined
                        ? `${ad.imagePositionX}% ${ad.imagePositionY}%`
                        : '50% 50%',
                      transform: `scale(${ad.imageZoom || 1}) translate(${
                        ad.imageZoom && ad.imageZoom > 1
                          ? ((ad.imagePositionX || 50) - 50) * (ad.imageZoom - 1) / ad.imageZoom
                          : 0
                      }%, ${
                        ad.imageZoom && ad.imageZoom > 1
                          ? ((ad.imagePositionY || 50) - 50) * (ad.imageZoom - 1) / ad.imageZoom
                          : 0
                      }%)`
                    } : undefined}
                  />
                </button>
              ))}
            </div>
          )}

          {/* SECÇÃO DE LOCALIZAÇÃO */}
          <div id="localizacao" className="bg-white rounded-[2rem] p-6 md:p-8 border border-slate-100 shadow-xl space-y-6 mt-6 scroll-mt-24 text-left">
            <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
              <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center">
                <MapPin size={22} />
              </div>
              <div>
                <h2 className="text-xl font-black text-slate-900 leading-none">📍 Localização Aproximada</h2>
                <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-1.5 font-sans">Região de referência do anúncio</p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-50 p-5 rounded-2xl border border-slate-100 font-sans">
              <div className="space-y-1">
                <span className="block text-[10px] text-slate-400 uppercase font-black tracking-wider">Cidade</span>
                <span className="text-lg font-extrabold text-slate-900">{ad.city || 'Não informada'}</span>
              </div>
              <div className="space-y-1">
                <span className="block text-[10px] text-slate-400 uppercase font-black tracking-wider">País</span>
                <span className="text-lg font-extrabold text-slate-900">
                  {ad.country === 'Reino Unido' ? '🇬🇧 Reino Unido' : '🇵🇹 Portugal'}
                </span>
              </div>
            </div>

            {ad.city && ad.city.trim() !== '' && ad.city.toLowerCase() !== 'todas' && (
              <div className="w-full h-64 md:h-80 rounded-2xl overflow-hidden border border-slate-100 shadow-sm bg-slate-100 relative">
                <iframe
                  title={`Mapa de ${ad.city}`}
                  width="100%"
                  height="100%"
                  style={{ border: 0 }}
                  loading="lazy"
                  allowFullScreen
                  referrerPolicy="no-referrer-when-downgrade"
                  src={`https://maps.google.com/maps?q=${encodeURIComponent(ad.city + ', ' + ad.country)}&t=&z=13&ie=UTF8&iwloc=&output=embed`}
                />
              </div>
            )}

            <div className="flex items-start gap-2.5 text-slate-500 bg-amber-50/40 border border-amber-100 rounded-2xl p-4 text-xs font-semibold font-sans">
              <span className="text-amber-500 text-lg leading-none mt-0.5">⚠️</span>
              <div className="space-y-1">
                <p className="leading-relaxed text-amber-900">
                  A localização apresentada é aproximada e serve apenas como referência.
                </p>
                <p className="leading-relaxed text-amber-800/80">
                  Localização aproximada baseada na cidade informada pelo anunciante.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* LADO DIREITO: Dados, Vendedor e WhatsApp */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-white rounded-[2rem] p-6 md:p-8 border border-slate-100 shadow-xl space-y-6">
            
            {/* Categoria & Visualizações / Tempo */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-4">
              <span className="bg-indigo-50 text-indigo-600 text-[11px] font-black px-3 py-1.5 rounded-xl uppercase tracking-wider border border-indigo-100">
                {ad.category}
              </span>
              <div className="flex items-center gap-3 text-slate-400 text-xs font-semibold">
                <span className="flex items-center gap-1">
                  <Eye size={14} /> {ad.views || 0}
                </span>
                <span className="flex items-center gap-1">
                  <Clock size={14} /> {timeStr}
                </span>
              </div>
            </div>

            {/* Título & Preço */}
            <div className="space-y-2">
              <h1 className="text-2xl md:text-3xl font-black text-slate-900 leading-tight">
                {ad.title}
              </h1>
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-1.5 text-slate-500 font-bold text-sm">
                  <MapPin size={16} className="text-indigo-600" />
                  <span>{ad.country === 'Reino Unido' ? '🇬🇧' : '🇵🇹'} {ad.city}, {ad.country || 'Portugal'}</span>
                </div>
                {hasPrice ? (
                  <div className="text-3.5xl font-black text-indigo-600 bg-indigo-50/50 py-1.5 px-4 rounded-2xl border border-indigo-100/50 flex items-center justify-center">
                    {formatPrice(ad.price, ad.country)}
                  </div>
                ) : (
                  <span className="text-xs bg-emerald-50 text-emerald-700 font-bold px-3 py-1 rounded-full uppercase tracking-wider border border-emerald-100 flex items-center justify-center">
                    Sob Consulta
                  </span>
                )}
              </div>
            </div>

            {/* Descrição */}
            <div className="space-y-2">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Descrição detalhada</h3>
              <p className="text-slate-600 text-[15px] leading-relaxed whitespace-pre-line break-words overflow-hidden bg-slate-50/40 p-4 rounded-2xl border border-slate-50">
                {normalizedDescription.length > 400 && !descriptionExpanded
                  ? `${normalizedDescription.substring(0, 400).trim()}...`
                  : normalizedDescription}
              </p>
              {normalizedDescription.length > 400 && (
                <button
                  onClick={() => setDescriptionExpanded(!descriptionExpanded)}
                  className="text-xs font-black text-indigo-600 hover:text-indigo-800 transition-colors cursor-pointer"
                >
                  {descriptionExpanded ? 'Ver Menor' : 'Ler mais completo'}
                </button>
              )}
            </div>

            {/* Cartão do Vendedor e Avaliações */}
            <div className="bg-slate-50 rounded-2xl p-4 md:p-6 border border-slate-100 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200/60">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-indigo-600/10 text-indigo-700 rounded-xl flex items-center justify-center font-black text-lg flex-shrink-0">
                    {(hasSourceUrl ? 'Parceiro' : ad.sellerName).slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <h4 className="font-extrabold text-slate-900 leading-tight flex items-center gap-1 truncate">
                      {hasSourceUrl ? 'Parceiro' : ad.sellerName}
                      <Award size={14} className="text-indigo-500 flex-shrink-0" />
                    </h4>
                    
                    {/* Estrelas */}
                    <div className="flex items-center gap-0.5 mt-1" title={`${sellerProfile?.ratingAverage || 0} / 5`}>
                      <div className="flex items-center gap-0.5">
                        {[1, 2, 3, 4, 5].map((star) => {
                          const ratingVal = sellerProfile?.ratingAverage || 0;
                          const isFilled = star <= Math.round(ratingVal);
                          return (
                            <Star
                              key={star}
                              size={12}
                              className={isFilled ? "text-amber-400 fill-amber-400" : "text-slate-200"}
                            />
                          );
                        })}
                      </div>
                      <span className="text-[10px] text-slate-500 font-bold ml-1">
                        ({sellerProfile?.ratingCount || 0} avs.)
                      </span>
                    </div>
                  </div>
                </div>

                {/* Botão de Avaliar */}
                {user && user.uid !== ad.sellerId && (
                  <button
                    onClick={() => setShowReviewModal(true)}
                    className="text-[11px] font-black bg-indigo-50 text-indigo-600 py-1.5 px-3.5 rounded-xl border border-indigo-100 hover:bg-indigo-100/80 hover:text-indigo-700 font-bold transition-all text-center w-full sm:w-auto self-start sm:self-center flex-shrink-0"
                  >
                    Avaliar Vendedor
                  </button>
                )}
              </div>

              {/* Bloco da Vitrine Digital do Vendedor se estiver ativa */}
              {showcaseActive && (
                <div className="bg-indigo-50/70 border border-indigo-150 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 animate-fade-in">
                  <div className="flex items-center gap-2.5">
                    <span className="text-2xl">🏪</span>
                    <div>
                      <span className="font-extrabold text-indigo-950 text-sm block">Este vendedor possui uma Vitrine Digital.</span>
                      <span className="text-[10px] text-indigo-650 font-bold block">Conheça todos os seus produtos, marcas e serviços especiais.</span>
                    </div>
                  </div>
                  <Link
                    to={`/empreendedores/${showcaseSlug}`}
                    className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black rounded-xl transition-all shadow-md flex items-center justify-center gap-1.5 shrink-0 hover:scale-[1.02] active:scale-[0.98]"
                  >
                    <span>Ver Vitrine</span>
                  </Link>
                </div>
              )}

              {/* CTAs */}
              <div className="flex flex-col gap-3">
                {/* WhatsApp Button */}
                {ad.adStatus === 'sold' || ad.status === 'sold' ? (
                  <div className="flex items-center justify-center gap-2 bg-slate-100 text-slate-500 py-3.5 px-6 rounded-2xl font-black text-sm border border-slate-200">
                    <ShoppingBag size={20} className="flex-shrink-0 text-slate-400" />
                    <span className="leading-tight">Anúncio Vendido</span>
                  </div>
                ) : (
                  <button
                    onClick={handleContactClick}
                    className={`flex items-center justify-center gap-2 ${
                      hasSourceUrl ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-emerald-500 hover:bg-emerald-600'
                    } text-white py-3.5 px-6 rounded-2xl font-black transition-all shadow-md active:scale-[0.98] w-full text-center`}
                  >
                    {hasSourceUrl ? (
                      <ExternalLink size={20} className="flex-shrink-0" />
                    ) : (
                      <MessageCircle size={20} className="flex-shrink-0" />
                    )}
                    <span className="leading-tight">{hasSourceUrl ? 'Contato' : 'Contactar via WhatsApp'}</span>
                  </button>
                )}

                <div className="flex gap-2">
                  {/* Share button */}
                  <button
                    onClick={handleShare}
                    className={`flex-1 flex items-center justify-center gap-2 border py-3 px-3 rounded-xl font-bold text-xs transition-all ${
                      shareCopied 
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-600' 
                        : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <Share2 size={16} className={shareCopied ? 'text-emerald-500 animate-bounce' : ''} />
                    <span>{shareCopied ? 'Link copiado!' : 'Partilhar'}</span>
                  </button>

                  {/* Report Button */}
                  <button
                    onClick={() => setShowReportModal(true)}
                    className="flex items-center justify-center gap-1.5 border border-rose-100 hover:border-rose-200 text-rose-500 bg-rose-50/50 hover:bg-rose-50 py-3 px-4 rounded-xl font-bold text-xs transition"
                  >
                    <ShieldAlert size={16} /> Denunciar
                  </button>
                </div>
              </div>

              {/* Seção das avaliações do vendedor */}
              {sellerReviews.length > 0 && (
                <div className="pt-3 border-t border-slate-200/60 font-sans">
                  <button
                    onClick={() => setShowReviewsSection(!showReviewsSection)}
                    className="flex items-center justify-between w-full text-xs font-bold text-indigo-500 uppercase tracking-widest"
                  >
                    <span>Avaliações do Vendedor ({sellerReviews.length})</span>
                    <span className="text-slate-400 text-[10px] uppercase font-bold">{showReviewsSection ? 'Recolher' : 'Expandir'}</span>
                  </button>

                  <AnimatePresence>
                    {showReviewsSection && (
                      <motion.div 
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="mt-3 space-y-3 max-h-56 overflow-y-auto pr-1"
                      >
                        {sellerReviews.map((rev) => (
                          <div key={rev.id} className="bg-white p-3 rounded-xl border border-slate-100 text-xs shadow-sm">
                            <div className="flex justify-between items-start mb-1">
                              <span className="font-extrabold text-slate-800">{rev.buyerName}</span>
                              <div className="flex gap-0.5">
                                {[1, 2, 3, 4, 5].map((s) => (
                                  <Star key={s} size={10} className={`${s <= rev.rating ? 'text-amber-400 fill-amber-400' : 'text-slate-100'}`} />
                                ))}
                              </div>
                            </div>
                            {rev.comment ? (
                              <p className="text-slate-600 italic">"{rev.comment}"</p>
                            ) : (
                              <p className="text-slate-400 italic">Classificou sem comentário escrito.</p>
                            )}
                            <div className="text-[9px] text-slate-400 mt-1 flex justify-between">
                              <span className="font-semibold text-emerald-600">{rev.success ? '✓ Negócio Correto' : 'ℹ Incompleto'}</span>
                              <span>{rev.createdAt?.toDate ? formatDistanceToNow(rev.createdAt.toDate(), { addSuffix: true, locale: pt }) : 'Recentemente'}</span>
                            </div>
                          </div>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Review Modal para deixar novas review*/}
      {showReviewModal && (
        <ReviewModal
          isOpen={showReviewModal}
          onClose={() => setShowReviewModal(false)}
          adId={ad.id}
          adTitle={ad.title}
          adCategory={ad.category}
          sellerId={ad.sellerId}
          sellerName={hasSourceUrl ? 'Parceiro' : ad.sellerName}
          isBuyerRating={true}
          onSuccess={() => {
            alert('A sua avaliação foi enviada com sucesso!');
            fetchSellerDetails(ad.sellerId);
          }}
        />
      )}

      {/* Lightbox full screen */}
      <AnimatePresence>
        {showFullImage && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/95 backdrop-blur-md p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="relative w-full h-full flex items-center justify-center"
              onClick={() => setShowFullImage(false)}
            >
              <button
                onClick={() => setShowFullImage(false)}
                className="absolute top-4 right-4 p-3 text-white/70 hover:text-white transition-colors z-10 bg-black/40 rounded-full"
              >
                <X size={24} />
              </button>
              <img
                src={images[currentImageIndex]}
                alt={ad.title}
                className="max-w-full max-h-full object-contain rounded-2xl shadow-2xl"
                referrerPolicy="no-referrer"
              />
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Aviso de Contacto WhatsApp */}
      <AnimatePresence>
        {showContactWarning && (
          <div className="fixed inset-0 z-[190] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowContactWarning(false)}
              className="absolute inset-0 bg-slate-900/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="relative bg-white w-full max-w-md rounded-3xl p-6 md:p-8 shadow-2xl text-center z-10"
            >
              <AlertCircle className="mx-auto text-amber-500 mb-4" size={48} />
              <h3 className="text-xl font-black text-slate-950 mb-2">Aviso de Segurança</h3>
              <p className="text-slate-600 text-sm leading-relaxed mb-6">
                Ao contactar este anunciante, tenha em conta que o Mercado Luso funciona apenas como um classificado gratuito local. Nunca realize pagamentos de reservas ou adiantados sem inspecionar pessoalmente o produto e o vendedor.
              </p>
              <div className="flex flex-col gap-4">
                <label className="flex items-center gap-2 cursor-pointer text-left text-xs text-slate-500">
                  <input 
                    type="checkbox" 
                    checked={acceptedContactTerms} 
                    onChange={(e) => setAcceptedContactTerms(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 shrink-0"
                  />
                  <span>Compreendo plenamente e aceito seguir as diretrizes de segurança.</span>
                </label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowContactWarning(false)}
                    className="flex-1 py-3 text-sm font-bold text-slate-500 bg-slate-50 hover:bg-slate-100 rounded-xl border border-slate-200 transition"
                  >
                    Voltar
                  </button>
                  <button
                    disabled={!acceptedContactTerms}
                    onClick={handleConfirmWhatsapp}
                    className={`flex-1 py-3 text-sm font-bold rounded-xl transition ${
                      acceptedContactTerms 
                        ? hasSourceUrl ? 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-md' : 'bg-emerald-500 hover:bg-emerald-600 text-white shadow-md'
                        : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                    }`}
                  >
                    {hasSourceUrl ? 'Abrir Contato' : 'Abrir WhatsApp'}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal de Denúncia */}
      <AnimatePresence>
        {showReportModal && (
          <div className="fixed inset-0 z-[190] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowReportModal(false)}
              className="absolute inset-0 bg-slate-900/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="relative bg-white w-full max-w-lg rounded-3xl p-6 md:p-8 shadow-2xl z-10"
            >
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-black text-slate-900">Denunciar Anúncio</h3>
                <button onClick={() => setShowReportModal(false)} className="text-slate-400 hover:text-slate-600 p-1 bg-slate-50 rounded-full border border-slate-150">
                  <X size={20} />
                </button>
              </div>

              <form onSubmit={handleReportSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Motivo principal</label>
                  <select
                    required
                    value={reportReason}
                    onChange={(e) => setReportReason(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3 text-sm font-medium focus:ring-2 focus:ring-red-500 focus:bg-white focus:outline-none transition"
                  >
                    <option value="">-- Escolha um motivo --</option>
                    <option value="fraude">Anúncio Falso ou Fraude</option>
                    <option value="spam">Spam / Conteúdo Irrelevante</option>
                    <option value="arma">Armas, drogas ou violência</option>
                    <option value="ofensivo">Linguagem Ofensiva / Racismo</option>
                    <option value="outro">Outro Motivo</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Detalhes adicionais (opcional)</label>
                  <textarea
                    value={reportDetails}
                    onChange={(e) => setReportDetails(e.target.value)}
                    rows={4}
                    placeholder="Explique resumidamente o que está incorreto neste anúncio..."
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-sm font-medium focus:ring-2 focus:ring-red-500 focus:bg-white focus:outline-none transition resize-none"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowReportModal(false)}
                    className="py-2.5 px-5 text-sm font-bold text-slate-500 bg-slate-50 hover:bg-slate-100 rounded-xl border border-slate-200 transition"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={reporting}
                    className="py-2.5 px-6 text-sm font-extrabold bg-red-500 hover:bg-red-600 text-white rounded-xl shadow-md transition disabled:opacity-50"
                  >
                    {reporting ? 'A Enviar...' : 'Denunciar Anúncio'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Floating Toast Proof of Interest */}
      {toast && toast.show && (
        <div className="fixed top-24 right-4 z-[400] max-w-sm w-full bg-slate-900 border border-slate-800 text-white rounded-2xl shadow-2xl p-4 flex items-center gap-3 animate-bounce">
          {toast.type === 'loading' && (
            <div className="w-5 h-5 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin shrink-0"></div>
          )}
          {toast.type === 'success' && (
            <div className="w-6 h-6 bg-emerald-500 rounded-full flex items-center justify-center text-white shrink-0 font-bold text-xs font-sans">✓</div>
          )}
          {toast.type === 'error' && (
            <div className="w-6 h-6 bg-rose-500 rounded-full flex items-center justify-center text-white shrink-0 font-bold text-xs font-sans text-center">✕</div>
          )}
          <div className="flex-1 font-sans">
            <p className="text-xs font-bold tracking-tight">{toast.message}</p>
            {toast.type === 'success' && (
              <p className="text-[10px] text-slate-400 mt-0.5 font-medium">O vendedor foi notificado no Mercado Luso.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default AdDetails;
