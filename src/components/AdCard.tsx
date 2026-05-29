import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Ad } from '../types';
import { MapPin, MessageCircle, Clock, X, User, Phone, AlertTriangle, Heart, Flag, Search, ChevronLeft, ChevronRight, Tag, Star, ShoppingBag, Mail, Globe } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { pt } from 'date-fns/locale';
import { motion, AnimatePresence } from 'motion/react';
import { formatPrice } from '../utils';
import OptimizedImage from './OptimizedImage';
import ReviewModal from './ReviewModal';

import { doc, updateDoc, increment, setDoc, deleteDoc, collection, query, where, getDocs, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';

interface AdCardProps {
  ad: Ad;
}

const AdCard: React.FC<AdCardProps> = ({ ad }) => {
  const { user } = useAuth();
  const [showDetails, setShowDetails] = useState(false);
  const [showFullImage, setShowFullImage] = useState(false);
  const [isFavorite, setIsFavorite] = useState(false);
  const [favoriteId, setFavoriteId] = useState<string | null>(null);
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

  const images = ad.images && ad.images.length > 0 ? ad.images : [ad.imageUrl];

  React.useEffect(() => {
    if (user) {
      checkIfFavorite();
    }
    if (showDetails && ad.sellerId) {
      fetchSellerProfile();
    }
  }, [user, ad.id, showDetails]);

  const fetchSellerProfile = async () => {
    try {
      const docSnap = await getDoc(doc(db, 'users', ad.sellerId));
      if (docSnap.exists()) {
        setSellerProfile(docSnap.data());
      }
      // Load seller's reviews
      setReviewsLoading(true);
      const q = query(collection(db, 'reviews'), where('sellerId', '==', ad.sellerId));
      const snap = await getDocs(q);
      const reviewsData = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      reviewsData.sort((a: any, b: any) => {
        const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
        const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
        return timeB - timeA;
      });
      setSellerReviews(reviewsData);
    } catch (err) {
      console.error('Error fetching seller profile or reviews:', err);
    } finally {
      setReviewsLoading(false);
    }
  };

  const checkIfFavorite = async () => {
    try {
      const q = query(collection(db, 'favorites'), where('userId', '==', user?.uid), where('adId', '==', ad.id));
      const snap = await getDocs(q);
      if (!snap.empty) {
        setIsFavorite(true);
        setFavoriteId(snap.docs[0].id);
      }
    } catch (err) {
      console.error('Error checking favorite:', err);
    }
  };

  const toggleFavorite = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!user) {
      alert('Faça login para salvar favoritos!');
      return;
    }

    try {
      if (isFavorite && favoriteId) {
        await deleteDoc(doc(db, 'favorites', favoriteId));
        setIsFavorite(false);
        setFavoriteId(null);
      } else {
        const newFavId = `fav_${Date.now()}_${user.uid}`;
        await setDoc(doc(db, 'favorites', newFavId), {
          id: newFavId,
          userId: user.uid,
          adId: ad.id,
          createdAt: new Date()
        });
        setIsFavorite(true);
        setFavoriteId(newFavId);
      }
    } catch (err) {
      console.error('Error toggling favorite:', err);
    }
  };

  const cleanPhone = (ad.sellerPhone || '').replace(/\D/g, ''); // Remove all non-digits including +
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

        <div className="p-3 md:p-5 flex-1 flex flex-col">
          <div className="flex justify-between items-start mb-1 md:mb-2">
            <h3 className="text-xs md:text-base font-bold text-slate-900 line-clamp-1 leading-tight group-hover:text-indigo-600 transition-colors">
              {ad.title}
            </h3>
          </div>

          <div className="flex items-center gap-3 text-slate-400 text-[10px] md:text-xs font-medium mb-3 md:mb-5">
            <div className="flex items-center gap-1">
              <MapPin size={12} className="md:w-3.5 md:h-3.5" />
              <span>{ad.city}</span>
            </div>
            <div className="flex items-center gap-1">
              <Tag size={12} className="md:w-3.5 md:h-3.5" />
              <span>{ad.category}</span>
            </div>
          </div>

          <div className="flex items-center justify-between mt-auto pt-2 md:pt-4 border-t border-slate-50">
            <div className="flex flex-col">
              <div className="text-base md:text-xl font-black text-slate-900">
                {ad.category === 'Imigração' ? (
                  <span className="text-[11px] bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded-lg border border-emerald-100 font-bold uppercase tracking-wider">
                    Informação
                  </span>
                ) : (
                  formatPrice(ad.price)
                )}
              </div>
              {(ad.status === 'sold' || ad.adStatus === 'sold') && ad.category !== 'Imigração' && ad.price !== undefined && Number(ad.price) > 0 && (
                <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-tight flex items-center gap-1 mt-0.5">
                  <ShoppingBag size={10} /> Vendido
                </span>
              )}
            </div>
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
                className="absolute top-4 right-4 z-10 p-2 bg-white/80 backdrop-blur-md rounded-full text-slate-900 hover:bg-white transition-colors shadow-sm"
              >
                <X size={24} />
              </button>

              <div className="overflow-y-auto">
                <div className="h-64 md:h-80 bg-slate-100 relative group/img overflow-hidden touch-none">
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={currentImageIndex}
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      className="w-full h-full"
                    >
                      <OptimizedImage
                        src={images[currentImageIndex]}
                        alt={ad.title}
                        className="w-full h-full object-cover cursor-grab active:cursor-grabbing"
                        onClick={() => setShowFullImage(true)}
                        referrerPolicy="no-referrer"
                        drag="x"
                        dragConstraints={{ left: 0, right: 0 }}
                        dragElastic={0.2}
                        onDragEnd={(_, info) => {
                          const threshold = 50;
                          if (info.offset.x < -threshold) {
                            setCurrentImageIndex((prev) => (prev === images.length - 1 ? 0 : prev + 1));
                          } else if (info.offset.x > threshold) {
                            setCurrentImageIndex((prev) => (prev === 0 ? images.length - 1 : prev - 1));
                          }
                        }}
                        // @ts-ignore
                        as={motion.img}
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
                      <div className="absolute bottom-4 right-4 bg-black/50 backdrop-blur-md text-white text-[10px] font-bold px-2 py-1 rounded-lg z-10">
                        {currentImageIndex + 1} / {images.length}
                      </div>
                    </>
                  )}
                </div>

                <div className="p-4 md:p-6">
                  <div className="mb-3 flex gap-2">
                    <span className="bg-indigo-50 text-indigo-600 text-[10px] font-bold px-2.5 py-1 rounded-lg uppercase tracking-wider border border-indigo-100">
                      {ad.category}
                    </span>
                    {(ad.status === 'sold' || ad.adStatus === 'sold') && ad.category !== 'Imigração' && ad.price !== undefined && Number(ad.price) > 0 && (
                      <span className="bg-rose-50 text-rose-600 text-[10px] font-bold px-2.5 py-1 rounded-lg uppercase tracking-wider border border-rose-100 flex items-center gap-1">
                        <ShoppingBag size={10} /> Vendido
                      </span>
                    )}
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
                        <div className="flex items-center gap-1">
                          <Clock size={14} className="text-indigo-600" />
                          <span>{ad.createdAt?.toDate ? formatDistanceToNow(ad.createdAt.toDate(), { addSuffix: true, locale: pt }) : (ad.createdAt ? formatDistanceToNow(new Date(ad.createdAt), { addSuffix: true, locale: pt }) : 'Recentemente')}</span>
                        </div>
                      </div>
                    </div>
                    {ad.category === 'Imigração' ? (
                      <span className="text-xs bg-emerald-50 text-emerald-700 px-3 py-1.5 rounded-xl border border-emerald-100 font-bold uppercase tracking-widest self-center md:self-start">
                        Página de Informação
                      </span>
                    ) : (
                      <div className="text-2xl md:text-3xl font-black text-indigo-600">
                        {formatPrice(ad.price)}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-4 mb-4">
                    <button
                      onClick={() => setShowReportModal(true)}
                      className="flex items-center gap-2 text-slate-400 hover:text-rose-500 font-bold text-[10px] uppercase tracking-widest transition-colors"
                    >
                      <Flag size={12} />
                      Denunciar Anúncio
                    </button>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Descrição</h4>
                      <p className="text-slate-600 text-sm leading-relaxed whitespace-pre-wrap line-clamp-4 hover:line-clamp-none transition-all cursor-default">
                        {ad.description}
                      </p>
                    </div>

                    {ad.category === 'Imigração' ? (
                      <div className="bg-slate-50 rounded-xl p-4 md:p-6 space-y-4 border border-slate-100">
                        <div className="flex items-center gap-3 border-b border-slate-200 pb-3">
                          <div className="w-10 h-10 bg-indigo-600 rounded-lg flex items-center justify-center text-white shadow-sm">
                            <User size={20} />
                          </div>
                          <div>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Publicador / Moderador</p>
                            <p className="text-base font-bold text-slate-900">{ad.sellerName}</p>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
                          {/* WhatsApp contact */}
                          <button
                            onClick={handleContactClick}
                            className="flex items-center justify-center gap-2 bg-emerald-500 text-white py-3 px-4 rounded-xl font-bold hover:bg-emerald-600 transition-all shadow-md shadow-emerald-50 text-sm active:scale-95 cursor-pointer"
                          >
                            <MessageCircle size={18} />
                            <span>WhatsApp</span>
                          </button>

                          {/* Email contact */}
                          {ad.contactEmail ? (
                            <a
                              href={`mailto:${ad.contactEmail}`}
                              className="flex items-center justify-center gap-2 bg-indigo-600 text-white py-3 px-4 rounded-xl font-bold hover:bg-indigo-700 transition-all shadow-md shadow-indigo-50 text-sm active:scale-95 text-center cursor-pointer"
                            >
                              <Mail size={18} />
                              <span>E-mail</span>
                            </a>
                          ) : (
                            <div className="flex items-center justify-center gap-2 bg-slate-100 text-slate-400 py-3 px-4 rounded-xl font-bold text-sm cursor-not-allowed">
                              <Mail size={18} />
                              <span>Sem E-mail</span>
                            </div>
                          )}

                          {/* External URL link */}
                          {ad.externalUrl ? (
                            <a
                              href={ad.externalUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center justify-center gap-2 bg-amber-500 text-white py-3 px-4 rounded-xl font-bold hover:bg-amber-600 transition-all shadow-md shadow-amber-50 text-sm active:scale-95 text-center cursor-pointer"
                            >
                              <Globe size={18} />
                              <span>Website/Link</span>
                            </a>
                          ) : (
                            <div className="flex items-center justify-center gap-2 bg-slate-100 text-slate-400 py-3 px-4 rounded-xl font-bold text-sm cursor-not-allowed">
                              <Globe size={18} />
                              <span>Sem Website</span>
                            </div>
                          )}
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="bg-slate-50 rounded-xl p-3 md:p-4 flex flex-wrap items-center justify-between gap-4 border border-slate-100">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center text-indigo-600 shadow-sm border border-slate-100">
                            <User size={20} />
                          </div>
                          <div>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Vendedor</p>
                            <p className="text-base font-bold text-slate-900">{ad.sellerName}</p>
                            {sellerProfile && (
                              <div className="flex items-center gap-1 mt-0.5">
                                <Star size={12} className="text-amber-400 fill-amber-400" />
                                <span className="text-[10px] font-bold text-slate-600">
                                  {sellerProfile.ratingAverage || 'N/A'} 
                                  <span className="font-medium text-slate-400 ml-1">({sellerProfile.ratingCount || 0})</span>
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                        
                        <div className="flex flex-col gap-2">
                          <button
                            onClick={handleContactClick}
                            className="flex items-center gap-2 bg-emerald-500 text-white px-5 py-2.5 rounded-lg font-bold hover:bg-emerald-600 transition-all shadow-lg shadow-emerald-100 active:scale-95 text-sm"
                          >
                            <MessageCircle size={18} />
                            <span>WhatsApp</span>
                          </button>
                          
                          {(ad.status === 'sold' || ad.adStatus === 'sold') && ad.category !== 'Imigração' && ad.price !== undefined && Number(ad.price) > 0 && user && user.uid !== ad.sellerId && (
                            <button
                              onClick={() => setShowReviewModal(true)}
                              className="flex items-center justify-center gap-2 bg-indigo-50 text-indigo-600 px-5 py-2 rounded-lg font-bold hover:bg-indigo-100 transition-all text-xs border border-indigo-100"
                            >
                              <Star size={14} />
                              Avaliar Vendedor
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Conversational and beautiful reviews list */}
                      {sellerReviews.length > 0 && (
                        <div className="mt-4 p-4 bg-slate-50 border border-slate-100 rounded-2xl">
                          <button
                            type="button"
                            onClick={() => setShowReviewsSection(!showReviewsSection)}
                            className="flex items-center justify-between w-full text-slate-700 hover:text-indigo-600 font-bold text-xs uppercase tracking-wider transition-colors outline-none cursor-pointer"
                          >
                            <span className="flex items-center gap-1.5">
                              <Star size={14} className="text-amber-400 fill-amber-400" />
                              Avaliações do Vendedor ({sellerReviews.length})
                            </span>
                            <span className="text-[10px] text-indigo-600 font-bold">{showReviewsSection ? '▲ Ocultar' : '▼ Ver'}</span>
                          </button>
                          
                          {showReviewsSection && (
                            <motion.div 
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: 'auto' }}
                              className="mt-3 space-y-3 max-h-48 overflow-y-auto pr-1"
                            >
                              {sellerReviews.map((rev) => (
                                <div key={rev.id} className="bg-white p-3 rounded-xl border border-slate-100 space-y-1.5 text-xs">
                                  <div className="flex justify-between items-start">
                                    <div>
                                      <span className="font-bold text-slate-800 block">{rev.buyerName}</span>
                                      <div className="flex flex-wrap gap-1 items-center mt-0.5">
                                        {rev.adCategory && (
                                          <span className="text-[8px] bg-indigo-50 text-indigo-600 px-1 py-0.2 rounded font-semibold">
                                            {rev.adCategory}
                                          </span>
                                        )}
                                        <span className="text-[9px] text-slate-400 font-medium truncate max-w-[140px]" title={rev.adTitle}>
                                          {rev.adTitle}
                                        </span>
                                      </div>
                                    </div>
                                    <div className="flex gap-0.5 shrink-0">
                                      {[1, 2, 3, 4, 5].map((s) => (
                                        <Star key={s} size={10} className={`${s <= rev.rating ? 'text-amber-400 fill-amber-400' : 'text-slate-200'}`} />
                                      ))}
                                    </div>
                                  </div>
                                  {rev.comment ? (
                                    <p className="text-slate-600 leading-relaxed italic">"{rev.comment}"</p>
                                  ) : (
                                    <p className="text-slate-400 italic">Sem comentário escrito.</p>
                                  )}
                                  <div className="text-[9px] text-slate-400 text-right">
                                    {rev.createdAt?.toDate ? formatDistanceToNow(rev.createdAt.toDate(), { addSuffix: true, locale: pt }) : 'Recentemente'}
                                  </div>
                                </div>
                              ))}
                            </motion.div>
                          )}
                        </div>
                      )}
                    </>
                    )}
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
            alert('A sua avaliação foi enviada com sucesso! Obrigado por ajudar a comunidade.');
            fetchSellerProfile();
          }}
        />
      )}

      {/* Contact Warning Modal */}
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
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative bg-white w-full max-w-md rounded-[2.5rem] p-8 shadow-2xl overflow-hidden"
            >
              <div className="absolute top-0 left-0 w-full h-2 bg-amber-500" />
              
              <div className="flex flex-col items-center text-center">
                <div className="w-16 h-16 bg-amber-50 rounded-2xl flex items-center justify-center text-amber-600 mb-6">
                  <AlertTriangle size={32} />
                </div>
                
                <h3 className="text-2xl font-black text-slate-900 mb-4 leading-tight">
                  Antes de continuar, atenção:
                </h3>
                
                <div className="space-y-4 text-slate-600 text-sm leading-relaxed mb-8">
                  <p>
                    Este marketplace <strong>apenas conecta</strong> compradores e vendedores. Não participamos das negociações, pagamentos ou entregas.
                  </p>
                  <p>
                    Ao entrar em contacto, reconhece que é <strong>totalmente responsável</strong> por verificar a veracidade do anúncio e a segurança da transação.
                  </p>
                  <p className="font-bold text-amber-700">
                    Recomendamos que nunca faça pagamentos antecipados sem garantias.
                  </p>
                </div>

                <div className="w-full space-y-4">
                  <div className="flex items-start gap-3 p-4 bg-slate-50 rounded-2xl border border-slate-100 text-left">
                    <input
                      type="checkbox"
                      id="contact-terms"
                      checked={acceptedContactTerms}
                      onChange={(e) => setAcceptedContactTerms(e.target.checked)}
                      className="mt-1 w-5 h-5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                    />
                    <label htmlFor="contact-terms" className="text-xs text-slate-600 cursor-pointer font-medium">
                      Li e concordo com os riscos da negociação e com os <Link to="/terms" className="text-indigo-600 font-bold hover:underline">Termos de Uso</Link>.
                    </label>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() => setShowContactWarning(false)}
                      className="py-4 rounded-2xl font-bold text-slate-500 hover:bg-slate-50 transition-colors"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={confirmContact}
                      disabled={!acceptedContactTerms}
                      className="py-4 bg-indigo-600 text-white rounded-2xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 disabled:opacity-50 disabled:shadow-none"
                    >
                      Continuar
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Report Modal */}
      <AnimatePresence>
        {showReportModal && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowReportModal(false)}
              className="absolute inset-0 bg-slate-900/80 backdrop-blur-md"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative bg-white w-full max-w-md rounded-[2.5rem] p-8 shadow-2xl overflow-hidden"
            >
              <div className="absolute top-0 left-0 w-full h-2 bg-rose-500" />
              
              <div className="flex flex-col">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-2xl font-black text-slate-900 leading-tight">
                    Denunciar Anúncio
                  </h3>
                  <button onClick={() => setShowReportModal(false)} className="text-slate-400 hover:text-slate-600">
                    <X size={24} />
                  </button>
                </div>

                <form onSubmit={handleReport} className="space-y-6">
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Motivo</label>
                    <select
                      required
                      value={reportReason}
                      onChange={(e) => setReportReason(e.target.value)}
                      className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-4 py-3 font-medium focus:border-indigo-500 focus:ring-0 transition-all"
                    >
                      <option value="">Selecione um motivo...</option>
                      <option value="Conteúdo inapropriado">Conteúdo inapropriado</option>
                      <option value="Fraude ou golpe">Fraude ou golpe</option>
                      <option value="Produto proibido">Produto proibido</option>
                      <option value="Vendedor suspeito">Vendedor suspeito</option>
                      <option value="Outro">Outro</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Detalhes (Opcional)</label>
                    <textarea
                      value={reportDetails}
                      onChange={(e) => setReportDetails(e.target.value)}
                      placeholder="Descreva o problema..."
                      rows={4}
                      className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-4 py-3 font-medium focus:border-indigo-500 focus:ring-0 transition-all resize-none"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setShowReportModal(false)}
                      className="py-4 rounded-2xl font-bold text-slate-500 hover:bg-slate-50 transition-colors"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={reporting}
                      className="py-4 bg-rose-600 text-white rounded-2xl font-bold hover:bg-rose-700 transition-all shadow-lg shadow-rose-100 disabled:opacity-50 disabled:shadow-none"
                    >
                      {reporting ? 'Enviando...' : 'Enviar Denúncia'}
                    </button>
                  </div>
                </form>
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
                className="absolute top-0 right-0 p-3 text-white/70 hover:text-white transition-colors z-10"
              >
                <X size={32} />
              </button>
              <img
                src={images[currentImageIndex]}
                alt={ad.title}
                className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
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
