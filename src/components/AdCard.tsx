import React, { useState, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Ad } from '../types';
import { MapPin, MessageCircle, Clock, X, User, Phone, AlertTriangle, Heart, Flag, Search, ChevronLeft, ChevronRight, Tag, Star, ShoppingBag, Mail, Globe, Share2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { pt } from 'date-fns/locale';
import { motion, AnimatePresence } from 'motion/react';
import { formatPrice, getAdUrl } from '../utils';
import OptimizedImage from './OptimizedImage';
import ReviewModal from './ReviewModal';

import { doc, updateDoc, increment, setDoc, deleteDoc, collection, query, where, limit } from 'firebase/firestore';
import { db, getDocWithCacheFallback, getDocsWithCacheFallback } from '../firebase';
import { useAuth } from '../context/AuthContext';

interface AdCardProps {
  ad: Ad;
  variant?: 'normal' | 'featured';
}

const AdCard: React.FC<AdCardProps> = ({ ad, variant = 'normal' }) => {
  const { user, favorites, toggleFavoriteGlobal } = useAuth();
  const navigate = useNavigate();
  const [isHovered, setIsHovered] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [showFullImage, setShowFullImage] = useState(false);
  const [showContactWarning, setShowContactWarning] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [reportDetails, setReportDetails] = useState('');
  const [reporting, setReporting] = useState(false);
  const [acceptedContactTerms, setAcceptedContactTerms] = useState(false);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [sellerProfile, setSellerProfile] = useState<any>(null);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [sellerReviews, setSellerReviews] = useState<any[]>([]);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [showReviewsSection, setShowReviewsSection] = useState(false);
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);

  const isFavorite = favorites.includes(ad.id);

  const isAdFeatured = ad.isFeatured && ad.featuredUntil && (
    ad.featuredUntil.seconds 
      ? ad.featuredUntil.toDate() > new Date() 
      : new Date(ad.featuredUntil) > new Date()
  );

  const images = ad.images && ad.images.length > 0 ? ad.images : [ad.imageUrl];

  const hasPrice =
    ad.category !== 'Imigração' &&
    ad.category !== 'Apoio ao Imigrante' &&
    ad.category !== 'Serviços Gratuitos' &&
    ad.category !== 'Informação' &&
    ad.price !== undefined &&
    ad.price !== null &&
    String(ad.price).trim() !== '' &&
    Number(ad.price) > 0;

  const isDetailsOpenRef = useRef(false);
  const isPopStateChange = useRef(false);

  React.useEffect(() => {
    if (showDetails) {
      isDetailsOpenRef.current = true;
      window.history.pushState({ modalOpen: true }, '', '');

      const handlePopState = (event: PopStateEvent) => {
        isPopStateChange.current = true;
        setShowDetails(false);
      };

      window.addEventListener('popstate', handlePopState);
      return () => {
        window.removeEventListener('popstate', handlePopState);
      };
    } else {
      if (isDetailsOpenRef.current && !isPopStateChange.current) {
        if (window.history.state?.modalOpen) {
          window.history.back();
        }
      }
      isDetailsOpenRef.current = false;
      isPopStateChange.current = false;
    }
  }, [showDetails]);

  React.useEffect(() => {
    if (showDetails && ad.sellerId) {
      fetchSellerProfile();
    }
  }, [ad.sellerId, showDetails]);

  const fetchSellerProfile = async () => {
    try {
      setReviewsLoading(true);
      const ratingCount = (ad as any).sellerReviewCount !== undefined ? (ad as any).sellerReviewCount : ((ad as any).reviewCount !== undefined ? (ad as any).reviewCount : 0);
      const ratingAverage = (ad as any).sellerRating !== undefined ? (ad as any).sellerRating : ((ad as any).rating !== undefined ? (ad as any).rating : 0);

      const profileData: any = {
        uid: ad.sellerId,
        displayName: ad.sellerName || 'Vendedor',
        city: ad.city || '',
        country: ad.country || 'Portugal',
        ratingAverage,
        ratingCount
      };

      console.log(`[AdCard] Evitando consultas Firestore para o vendedor ${ad.sellerId}. Usando dados integrados no documento de anúncio.`);
      setSellerProfile(profileData);
      setSellerReviews([]);
    } catch (err) {
      console.error('Error configuring seller profile fallback:', err);
    } finally {
      setReviewsLoading(false);
    }
  };

  const toggleFavorite = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await toggleFavoriteGlobal(ad.id);
    } catch (err) {
      console.error('Error toggling favorite:', err);
    }
  };

  const handleShare = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const url = `${window.location.origin}${getAdUrl(ad)}`;
    const priceText = hasPrice ? ` - ${formatPrice(ad.price, ad.country)}` : '';
    const shareText = `${url}\n\nVeja este anúncio no Mercado Luso: ${ad.title}${priceText} em ${ad.city}`;
    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(shareText)}`;

    try {
      const opened = window.open(whatsappUrl, '_blank');
      if (!opened) {
        await navigator.clipboard.writeText(url);
        alert('Link copiado para a área de transferência! (O WhatsApp não pôde ser aberto automaticamente)');
      }
    } catch (err) {
      console.error('Erro ao abrir o WhatsApp:', err);
      try {
        await navigator.clipboard.writeText(url);
        alert('Link copiado para a área de transferência com sucesso!');
      } catch (clipErr) {
        console.error('Erro de cópia alternativa:', clipErr);
      }
    }
  };

  const cleanPhone = (ad.sellerPhone || '').replace(/\D/g, '');
  const whatsappUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(`Olá ${ad.sellerName}, tenho interesse no seu anúncio "${ad.title}" no Mercado Luso.`)}`;

  const incrementViews = async () => {
    try {
      await updateDoc(doc(db, 'ads', ad.id), {
        views: increment(1)
      });
    } catch (err) {
      console.error('Error incrementing views:', err);
    }
  };

  const incrementClicks = async () => {
    try {
      await updateDoc(doc(db, 'ads', ad.id), {
        whatsappClicks: increment(1)
      });
    } catch (err) {
      console.error('Error incrementing clicks:', err);
    }
  };

  const handleContactClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setShowContactWarning(true);
  };

  const confirmContact = () => {
    if (acceptedContactTerms) {
      incrementClicks();
      window.open(whatsappUrl, '_blank');
      setShowContactWarning(false);
    }
  };

  const handleReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      alert('Faça login para denunciar!');
      return;
    }
    if (!reportReason) {
      alert('Selecione um motivo para a denúncia.');
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
      alert('Denúncia enviada com sucesso. Nossa equipe irá analisar.');
      setShowReportModal(false);
      setReportReason('');
      setReportDetails('');
    } catch (err) {
      console.error('Error submitting report:', err);
      alert('Erro ao enviar denúncia. Tente novamente.');
    } finally {
      setReporting(false);
    }
  };

  const isFeaturedVariant = variant === 'featured';

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.4 }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onClick={() => {
          navigate(getAdUrl(ad));
        }}
        className={`card-flutuante overflow-hidden group flex flex-col h-full cursor-pointer relative transition-all duration-300 ${
          isFeaturedVariant
            ? '!bg-gradient-to-br !from-[#fffdf4] !to-[#faf5e6] !border-amber-200/80 shadow-lg shadow-amber-100/40 hover:!border-amber-300 hover:shadow-xl hover:shadow-amber-100/60'
            : isAdFeatured 
              ? 'ring-2 ring-amber-400 border border-amber-300 shadow-md shadow-amber-100/50 scale-[1.01]' 
              : ''
        }`}
      >
        <div className={`relative aspect-square overflow-hidden ${isFeaturedVariant ? 'bg-[#faf5e6]' : 'bg-slate-50'}`}>
          {isAdFeatured && (
            <div className={`absolute z-10 bg-gradient-to-r from-amber-500 to-yellow-400 text-white font-black rounded-full shadow-md flex items-center justify-center ${
              isFeaturedVariant 
                ? 'top-2 left-2 text-[10px] w-6 h-6' 
                : 'top-3 left-3 text-xs w-7 h-7'
            }`}>
              <span>✨</span>
            </div>
          )}
          <OptimizedImage
            src={ad.imageUrl}
            alt={ad.title}
            className="w-full h-full object-cover transition-transform duration-500"
            referrerPolicy="no-referrer"
            style={{
              objectPosition: ad.imagePositionX !== undefined && ad.imagePositionY !== undefined
                ? `${ad.imagePositionX}% ${ad.imagePositionY}%`
                : '50% 50%',
              transform: `scale(${(ad.imageZoom || 1) * (isHovered ? 1.08 : 1)}) translate(${
                ad.imageZoom && ad.imageZoom > 1
                  ? ((ad.imagePositionX || 50) - 50) * (ad.imageZoom - 1) / ad.imageZoom
                  : 0
              }%, ${
                ad.imageZoom && ad.imageZoom > 1
                  ? ((ad.imagePositionY || 50) - 50) * (ad.imageZoom - 1) / ad.imageZoom
                  : 0
              }%)`
            }}
          />
        </div>

        <div className={isFeaturedVariant ? "p-2 md:p-3 flex-1 flex flex-col" : "p-2.5 md:p-3.5 flex-1 flex flex-col"}>
          <div className="flex justify-between items-start mb-1 md:mb-1.5">
            <h3 className={`font-extrabold text-slate-900 line-clamp-2 leading-snug group-hover:text-pt-green transition-colors tracking-tight ${
              isFeaturedVariant ? 'text-xs md:text-sm' : 'text-sm md:text-[15px]'
            }`}>
              {ad.title}
            </h3>
          </div>

          <div className={`flex flex-col gap-0.5 text-slate-400 font-medium ${
            isFeaturedVariant ? 'text-[9px] md:text-[10px] mb-1.5 md:mb-2' : 'text-[10px] md:text-[11px] mb-2 md:mb-3'
          }`}>
            <div className="flex items-center gap-1 text-slate-600">
              <MapPin size={isFeaturedVariant ? 10 : 12} className="text-indigo-500 shrink-0 opacity-75" />
              <span className="truncate">
                {ad.country === 'Reino Unido' ? '🇬🇧' : '🇵🇹'} {ad.city}
              </span>
            </div>
            <div className="flex items-center gap-1 text-slate-500">
              <Tag size={isFeaturedVariant ? 10 : 12} className="text-teal-600 shrink-0 opacity-75" />
              <span className="truncate">{ad.category}</span>
            </div>
          </div>

          {/* Linha horizontal de ações */}
          <div className={`flex items-center justify-center border-t border-b border-dashed border-slate-100 ${
            isFeaturedVariant ? 'gap-3 py-1 mb-1.5' : 'gap-5 py-1.5 mb-2'
          }`}>
            {/* Favoritar */}
            <button
              onClick={toggleFavorite}
              className={`transition-all border shadow-sm cursor-pointer hover:scale-110 active:scale-95 ${
                isFeaturedVariant ? 'p-1.5' : 'p-2'
              } ${
                isFavorite
                  ? 'bg-rose-50 border-rose-100 text-rose-600'
                  : 'bg-slate-50 border-slate-100 text-slate-400 hover:bg-rose-50 hover:border-rose-100 hover:text-rose-600'
              }`}
              title={isFavorite ? "Remover dos favoritos" : "Adicionar aos favoritos"}
            >
              <Heart size={isFeaturedVariant ? 12 : 14} fill={isFavorite ? 'currentColor' : 'none'} className={isFavorite ? "text-rose-500" : ""} />
            </button>

            {/* Partilhar */}
            <button
              onClick={handleShare}
              className={`transition-all border shadow-sm cursor-pointer hover:scale-110 active:scale-95 bg-slate-50 border-slate-100 text-slate-400 hover:bg-indigo-50 hover:border-indigo-100 hover:text-indigo-600 ${
                isFeaturedVariant ? 'p-1.5' : 'p-2'
              }`}
              title="Partilhar Anúncio"
            >
              <Share2 size={isFeaturedVariant ? 12 : 14} />
            </button>

            {/* WhatsApp */}
            {ad.sellerPhone && ad.sellerPhone.trim() !== '' && (
              <button
                onClick={handleContactClick}
                className={`transition-all border shadow-sm cursor-pointer hover:scale-110 active:scale-95 bg-slate-50 border-slate-100 text-slate-400 hover:bg-emerald-50 hover:border-emerald-100 hover:text-emerald-600 ${
                  isFeaturedVariant ? 'p-1.5' : 'p-2'
                }`}
                title="Contactar via WhatsApp"
              >
                <MessageCircle size={isFeaturedVariant ? 12 : 14} className="text-[#25D366]" />
              </button>
            )}
          </div>

          {/* Preço (Elemento final de maior destaque) */}
          <div className="mt-auto pt-1 flex flex-col items-center justify-center text-center">
            {hasPrice ? (
              <div className="flex flex-col items-center justify-center">
                <div className={`font-black text-indigo-600 tracking-tight leading-none ${
                  isFeaturedVariant ? 'text-sm md:text-base' : 'text-base md:text-lg'
                }`}>
                  {formatPrice(ad.price, ad.country)}
                </div>
                {(ad.status === 'sold' || ad.adStatus === 'sold') && ad.price !== undefined && Number(ad.price) > 0 && (
                  <span className="text-[9px] font-bold text-indigo-600 uppercase tracking-tight flex items-center justify-center gap-1 mt-1">
                    <ShoppingBag size={10} /> Vendido
                  </span>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center">
                <div className={`font-extrabold text-emerald-600 uppercase tracking-wide leading-none ${
                  isFeaturedVariant ? 'text-[10px] md:text-xs' : 'text-xs md:text-sm'
                }`}>
                  Sob Consulta
                </div>
              </div>
            )}
          </div>
        </div>
      </motion.div>

      {/* Details Modal */}
      <AnimatePresence>
        {showDetails && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowDetails(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative bg-white w-full max-w-2xl rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]"
            >
              <button
                onClick={() => setShowDetails(false)}
                className="absolute top-4 right-4 z-20 p-2 bg-white/80 backdrop-blur-md rounded-full text-slate-900 hover:bg-white transition-colors shadow-sm"
              >
                <X size={24} />
              </button>

              <div className="overflow-y-auto flex-1 min-h-0">
                <div className="h-72 md:h-96 bg-slate-950 relative group/img overflow-hidden touch-none flex items-center justify-center">
                  {/* Backdrop com desfoque ambiente premium para fotos verticais/horizontais se integrarem sem cortes */}
                  <div 
                    className="absolute inset-0 bg-cover bg-center blur-xl opacity-35 select-none pointer-events-none scale-110"
                    style={{ backgroundImage: `url(${images[currentImageIndex]})` }}
                  />
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={currentImageIndex}
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      className="w-full h-full relative z-10 flex items-center justify-center"
                    >
                      <img
                        src={images[currentImageIndex]}
                        alt={ad.title}
                        className="max-w-full max-h-full object-contain cursor-grab active:cursor-grabbing"
                        onClick={() => setShowFullImage(true)}
                        referrerPolicy="no-referrer"
                      />
                    </motion.div>
                  </AnimatePresence>

                  {images.length > 1 && (
                    <>
                      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-1.5 z-10">
                        {images.map((_, i) => (
                          <div
                            key={i}
                            className={`w-1.5 h-1.5 rounded-full transition-all duration-300 ${
                              currentImageIndex === i ? 'bg-white w-4 shadow-sm' : 'bg-white/40'
                            }`}
                          />
                        ))}
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setCurrentImageIndex((prev) => (prev === 0 ? images.length - 1 : prev - 1));
                        }}
                        className="absolute left-2 top-1/2 -translate-y-1/2 p-2 bg-white/80 backdrop-blur-md rounded-full text-slate-900 opacity-0 group-hover/img:opacity-100 transition-opacity shadow-lg z-10"
                      >
                        <ChevronLeft size={20} />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setCurrentImageIndex((prev) => (prev === images.length - 1 ? 0 : prev + 1));
                        }}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-white/80 backdrop-blur-md rounded-full text-slate-900 opacity-0 group-hover/img:opacity-100 transition-opacity shadow-lg z-10"
                      >
                        <ChevronRight size={20} />
                      </button>
                    </>
                  )}
                </div>

                <div className="p-4 md:p-6 pb-12 md:pb-16 font-sans">
                  <div className="mb-3 flex flex-wrap gap-2">
                    {isAdFeatured && (
                      <span className="bg-amber-500 text-white text-[10px] font-bold px-2.5 py-1 rounded-lg uppercase tracking-wider shadow-sm flex items-center gap-1 animate-pulse">
                        <span>✨</span>
                        <span>Anúncio Destacado</span>
                      </span>
                    )}
                    <span className="bg-indigo-50 text-indigo-600 text-[10px] font-bold px-2.5 py-1 rounded-lg uppercase tracking-wider border border-indigo-100">
                      {ad.category}
                    </span>
                  </div>
                  <div className="flex flex-wrap justify-between items-center gap-2 mb-4">
                    <div>
                      <h2 className="text-xl md:text-2xl font-black text-slate-900 leading-tight mb-1">
                        {ad.title}
                      </h2>
                      <div className="flex items-center gap-3 text-slate-500 text-xs font-medium">
                        <div className="flex items-center gap-1">
                          <MapPin size={14} className="text-indigo-600" />
                          <span>{ad.country === 'Reino Unido' ? '🇬🇧' : '🇵🇹'} {ad.city}</span>
                        </div>
                      </div>
                    </div>
                    {ad.category !== 'Imigração' && (
                      <div className="text-2xl md:text-3xl font-black text-indigo-600 flex items-center justify-center">
                        {formatPrice(ad.price, ad.country)}
                      </div>
                    )}
                  </div>

                  <div className="space-y-4">
                    <div>
                      <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Descrição</h4>
                      <p className="text-slate-600 text-sm leading-relaxed whitespace-pre-wrap break-words overflow-hidden">
                        {ad.description.length > 200 && !descriptionExpanded
                          ? `${ad.description.substring(0, 200).trim()}...`
                          : ad.description}
                      </p>
                      {ad.description.length > 200 && (
                        <button
                          onClick={() => setDescriptionExpanded(!descriptionExpanded)}
                          className="text-xs font-bold text-indigo-600 hover:text-indigo-800 transition-colors mt-1 active:scale-95 duration-200"
                        >
                          {descriptionExpanded ? 'Ver menos' : 'Ver mais'}
                        </button>
                      )}
                    </div>

                    <div className="bg-slate-50 rounded-xl p-4 md:p-6 space-y-4 border border-slate-100">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-indigo-600 rounded-lg flex items-center justify-center text-white shadow-sm">
                          <User size={20} />
                        </div>
                        <div>
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Vendedor</p>
                          <div className="flex flex-wrap items-center gap-2 mt-0.5">
                            <span className="text-base font-bold text-slate-900">{ad.sellerName}</span>
                            <div className="flex items-center gap-0.5 text-amber-500" title={`${sellerProfile?.ratingAverage || sellerProfile?.rating || 0} / 5`}>
                              {[1, 2, 3, 4, 5].map((star) => {
                                const ratingVal = sellerProfile?.ratingAverage || sellerProfile?.rating || 0;
                                const isFilled = star <= Math.round(ratingVal);
                                return (
                                  <Star
                                    key={star}
                                    size={12}
                                    className={isFilled ? "text-amber-400 fill-amber-400" : "text-slate-200"}
                                  />
                                );
                              })}
                              <span className="text-[10px] text-slate-500 font-bold ml-1">
                                ({sellerProfile?.ratingCount || 0})
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-col gap-3">
                        <button
                          onClick={handleContactClick}
                          className="flex items-center justify-center gap-2 bg-emerald-500 text-white py-3 px-4 rounded-xl font-bold hover:bg-emerald-600 transition-all shadow-md text-sm active:scale-95 text-center"
                        >
                          <MessageCircle size={18} className="flex-shrink-0" />
                          <span className="leading-tight">Contactar via WhatsApp</span>
                        </button>
                      </div>

                      {sellerReviews.length > 0 && (
                        <div className="pt-4 border-t border-slate-200">
                          <button
                            onClick={() => setShowReviewsSection(!showReviewsSection)}
                            className="flex items-center justify-between w-full text-xs font-bold text-indigo-600 uppercase tracking-wider"
                          >
                            <span>Avaliações do Vendedor ({sellerReviews.length})</span>
                            <span className="text-slate-400">{showReviewsSection ? 'Ocultar' : 'Mostrar'}</span>
                          </button>
                          
                          {showReviewsSection && (
                            <div className="mt-3 space-y-3 max-h-48 overflow-y-auto pr-1">
                              {sellerReviews.map((rev) => (
                                <div key={rev.id} className="bg-white p-3 rounded-xl border border-slate-100 text-xs shadow-sm">
                                  <div className="flex justify-between items-start mb-1">
                                    <span className="font-bold text-slate-800">{rev.buyerName}</span>
                                    <div className="flex gap-0.5">
                                      {[1, 2, 3, 4, 5].map((s) => (
                                        <Star key={s} size={10} className={`${s <= rev.rating ? 'text-amber-400 fill-amber-400' : 'text-slate-100'}`} />
                                      ))}
                                    </div>
                                  </div>
                                  {rev.comment ? (
                                    <p className="text-slate-600 italic">"{rev.comment}"</p>
                                  ) : (
                                    <p className="text-slate-400 italic">Sem comentário escrito.</p>
                                  )}
                                  <div className="text-[9px] text-slate-400 mt-1">
                                    {rev.createdAt?.toDate ? formatDistanceToNow(rev.createdAt.toDate(), { addSuffix: true, locale: pt }) : 'Recentemente'}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {showReviewModal && (
        <ReviewModal
          isOpen={showReviewModal}
          onClose={() => setShowReviewModal(false)}
          adId={ad.id}
          adTitle={ad.title}
          adCategory={ad.category}
          sellerId={ad.sellerId}
          sellerName={ad.sellerName}
          isBuyerRating={true}
          onSuccess={() => {
            alert('A sua avaliação foi enviada com sucesso!');
            fetchSellerProfile();
          }}
        />
      )}

      {/* Modal de Aviso de Contacto (Simpificado para o código não ficar gigante) */}
      <AnimatePresence>
        {showContactWarning && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowContactWarning(false)}
              className="absolute inset-0 bg-slate-900/80 backdrop-blur-md"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="relative bg-white w-full max-w-md rounded-3xl p-8 shadow-2xl text-center"
            >
              <AlertTriangle className="mx-auto text-amber-500 mb-4" size={48} />
              <h3 className="text-xl font-bold mb-4">Aviso de Segurança</h3>
              <p className="text-slate-600 mb-6 text-sm">
                Ao contactar o vendedor, lembre-se que o Mercado Luso apenas facilita o contacto. 
                Nunca faça pagamentos adiantados sem verificar o produto.
              </p>
              <div className="flex flex-col gap-3">
                <label className="flex items-center gap-2 cursor-pointer justify-center text-sm">
                  <input 
                    type="checkbox" 
                    checked={acceptedContactTerms} 
                    onChange={(e) => setAcceptedContactTerms(e.target.checked)}
                  />
                  <span>Compreendo os riscos</span>
                </label>
                <button
                  disabled={!acceptedContactTerms}
                  onClick={confirmContact}
                  className={`py-3 rounded-xl font-bold transition-all ${acceptedContactTerms ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-400 cursor-not-allowed'}`}
                >
                  Confirmar e Abrir WhatsApp
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Full Image Modal */}
      <AnimatePresence>
        {showFullImage && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/95 backdrop-blur-md p-4 md:p-8">
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
    </>
  );
};

export default AdCard;