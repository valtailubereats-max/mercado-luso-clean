import React, { useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Ad } from '../types';
import { MapPin, MessageCircle, Clock, X, User, Phone, AlertTriangle, Heart, Flag, Search, ChevronLeft, ChevronRight, Tag, Star, ShoppingBag, Mail, Globe } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { pt } from 'date-fns/locale';
import { motion, AnimatePresence } from 'motion/react';
import { formatPrice } from '../utils';
import OptimizedImage from './OptimizedImage';
import ReviewModal from './ReviewModal';

import { doc, updateDoc, increment, setDoc, deleteDoc, collection, query, where, limit } from 'firebase/firestore';
import { db, getDocWithCacheFallback, getDocsWithCacheFallback } from '../firebase';
import { useAuth } from '../context/AuthContext';

interface AdCardProps {
  ad: Ad;
}

const AdCard: React.FC<AdCardProps> = ({ ad }) => {
  const { user, favorites, toggleFavoriteGlobal } = useAuth();
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

  const images = ad.images && ad.images.length > 0 ? ad.images : [ad.imageUrl];

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
      let profileData: any = {};
      const docSnap = await getDocWithCacheFallback(doc(db, 'users', ad.sellerId), `users/${ad.sellerId}`);
      if (docSnap.exists()) {
        profileData = docSnap.data();
      }
      setReviewsLoading(true);
      const q = query(collection(db, 'reviews'), where('sellerId', '==', ad.sellerId), limit(5));
      const snap = await getDocsWithCacheFallback(q, `reviews/sellerId-${ad.sellerId}`);
      const reviewsData = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      reviewsData.sort((a: any, b: any) => {
        const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
        const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
        return timeB - timeA;
      });
      setSellerReviews(reviewsData);

      // Calc fallback
      let ratingCount = profileData.ratingCount !== undefined ? profileData.ratingCount : 0;
      let ratingAverage = profileData.ratingAverage !== undefined ? profileData.ratingAverage : (profileData.rating !== undefined ? profileData.rating : 0);

      if (reviewsData.length > 0 && (ratingCount === 0 || ratingAverage === 0)) {
        ratingCount = reviewsData.length;
        const totalStars = reviewsData.reduce((sum: number, rev: any) => sum + (rev.rating || 0), 0);
        ratingAverage = parseFloat((totalStars / ratingCount).toFixed(1));
      }

      setSellerProfile({
        ...profileData,
        ratingAverage,
        ratingCount
      });
    } catch (err) {
      console.error('Error fetching seller profile or reviews:', err);
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

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        whileInView={{ opacity: 1, y: 0 }}
        whileHover={{ y: -5, scale: 1.02 }}
        transition={{ type: 'spring', stiffness: 300, damping: 20 }}
        viewport={{ once: true }}
        onClick={() => {
          setShowDetails(true);
          incrementViews();
        }}
        className="bg-white rounded-xl md:rounded-2xl shadow-sm border border-slate-100 overflow-hidden hover:shadow-xl hover:border-indigo-200 transition-shadow group flex flex-col h-full cursor-pointer"
      >
        <div className="relative aspect-square overflow-hidden bg-slate-50">
          <OptimizedImage
            src={ad.imageUrl}
            alt={ad.title}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
            referrerPolicy="no-referrer"
          />
          <button
            onClick={toggleFavorite}
            className={`absolute top-3 right-3 p-2 rounded-full backdrop-blur-md transition-all ${isFavorite ? 'bg-red-500 text-white' : 'bg-white/80 text-slate-400 hover:text-red-500'}`}
          >
            <Heart size={18} fill={isFavorite ? 'currentColor' : 'none'} />
          </button>
        </div>

        <div className="p-2.5 md:p-3.5 flex-1 flex flex-col">
          <div className="flex justify-between items-start mb-1 md:mb-1.5">
            <h3 className="text-sm md:text-[15px] font-extrabold text-slate-900 line-clamp-2 leading-snug group-hover:text-pt-green transition-colors tracking-tight">
              {ad.title}
            </h3>
          </div>

          <div className="flex flex-col gap-1 text-slate-400 text-[10px] md:text-[11px] font-medium mb-2 md:mb-3">
            <div className="flex items-center gap-1 text-slate-600">
              <MapPin size={12} className="text-indigo-500 shrink-0 md:w-3 md:h-3" />
              <span className="truncate">{ad.city}</span>
            </div>
            <div className="flex items-center gap-1 text-slate-500">
              <Tag size={12} className="text-teal-600 shrink-0 md:w-3 md:h-3" />
              <span className="truncate">{ad.category}</span>
            </div>
          </div>

          <div className="flex items-center justify-between mt-auto pt-1.5 md:pt-2.5 border-t border-slate-50">
            <div className="flex flex-col">
              <div className="text-sm md:text-[17px] font-black text-slate-900">
                {ad.category === 'Imigração' ? (
                  <span className="text-[10px] bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-md border border-emerald-100 font-bold uppercase tracking-wider">
                    Informação
                  </span>
                ) : (
                  formatPrice(ad.price)
                )}
              </div>
              {(ad.status === 'sold' || ad.adStatus === 'sold') && ad.category !== 'Imigração' && ad.price !== undefined && Number(ad.price) > 0 && (
                <span className="text-[9px] font-bold text-indigo-600 uppercase tracking-tight flex items-center gap-1 mt-0.5">
                  <ShoppingBag size={9} /> Vendido
                </span>
              )}
            </div>

            {ad.category !== 'Imigração' && (
              <div className="flex items-center justify-center bg-emerald-50 text-emerald-700 p-1 rounded-full border border-emerald-100/60 shadow-sm" title="WhatsApp disponível no anúncio">
                <svg className="w-3.5 h-3.5 fill-current text-[#25D366]" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L0 24l6.335-1.662c1.746.953 3.71 1.458 5.704 1.459h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                </svg>
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

              <div className="overflow-y-auto">
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
                  <div className="mb-3 flex gap-2">
                    <span className="bg-indigo-50 text-indigo-600 text-[10px] font-bold px-2.5 py-1 rounded-lg uppercase tracking-wider border border-indigo-100">
                      {ad.category}
                    </span>
                  </div>
                  <div className="flex flex-wrap justify-between items-start gap-2 mb-4">
                    <div>
                      <h2 className="text-xl md:text-2xl font-black text-slate-900 leading-tight mb-1">
                        {ad.title}
                      </h2>
                      <div className="flex items-center gap-3 text-slate-500 text-xs font-medium">
                        <div className="flex items-center gap-1">
                          <MapPin size={14} className="text-indigo-600" />
                          <span>{ad.city}</span>
                        </div>
                      </div>
                    </div>
                    {ad.category !== 'Imigração' && (
                      <div className="text-2xl md:text-3xl font-black text-indigo-600">
                        {formatPrice(ad.price)}
                      </div>
                    )}
                  </div>

                  <div className="space-y-4">
                    <div>
                      <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Descrição</h4>
                      <p className="text-slate-600 text-sm leading-relaxed whitespace-pre-wrap">
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
                          className="flex items-center justify-center gap-2 bg-emerald-500 text-white py-3 px-4 rounded-xl font-bold hover:bg-emerald-600 transition-all shadow-md text-sm active:scale-95"
                        >
                          <MessageCircle size={18} />
                          <span>Contactar via WhatsApp</span>
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