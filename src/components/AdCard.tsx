import React, { useState } from 'react';
import { Ad } from '../types';
import { MapPin, MessageCircle, Clock, X, User, Phone, AlertTriangle, Heart, Flag, Search, ChevronLeft, ChevronRight, Tag, Star, ShoppingBag, Mail, Globe } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import OptimizedImage from './OptimizedImage';
import ReviewModal from './ReviewModal';
import { Link } from 'react-router-dom';

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
      setReviewsLoading(true);
      const q = query(collection(db, 'reviews'), where('sellerId', '==', ad.sellerId));
      const snap = await getDocs(q);
      const reviewsData = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setSellerReviews(reviewsData);
    } catch (err) {
      console.error('Error fetching seller profile:', err);
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
    if (!user) return;
    try {
      if (isFavorite && favoriteId) {
        await deleteDoc(doc(db, 'favorites', favoriteId));
        setIsFavorite(false);
        setFavoriteId(null);
      } else {
        const newFavId = `fav_${Date.now()}_${user.uid}`;
        await setDoc(doc(db, 'favorites', newFavId), {
          id: newFavId, userId: user.uid, adId: ad.id, createdAt: new Date()
        });
        setIsFavorite(true);
        setFavoriteId(newFavId);
      }
    } catch (err) { console.error(err); }
  };

  const cleanPhone = (ad.sellerPhone || '').replace(/\D/g, '');
  const whatsappUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(`Olá, interesse no anúncio "${ad.title}"`)}`;

  const confirmContact = () => {
    if (acceptedContactTerms) {
      window.open(whatsappUrl, '_blank');
      setShowContactWarning(false);
    }
  };

  return (
    <>
      <motion.div
        onClick={() => setShowDetails(true)}
        className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden flex flex-col h-full cursor-pointer"
      >
        <div className="relative aspect-square">
          <OptimizedImage src={ad.imageUrl} alt={ad.title} className="w-full h-full object-cover" />
        </div>
        <div className="p-4 flex-1 flex flex-col">
          <h3 className="font-bold text-slate-900 mb-2">{ad.title}</h3>
          <div className="text-lg font-black text-indigo-600 mt-auto">
            {ad.price ? `€ ${ad.price}` : 'Grátis'}
          </div>
        </div>
      </motion.div>

      <AnimatePresence>
        {showDetails && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/60" onClick={() => setShowDetails(false)} />
            <motion.div className="relative bg-white w-full max-w-2xl rounded-3xl overflow-hidden max-h-[90vh] overflow-y-auto p-6">
              <button onClick={() => setShowDetails(false)} className="absolute top-4 right-4"><X /></button>
              <h2 className="text-2xl font-black mb-4">{ad.title}</h2>
              <p className="text-slate-600 mb-6">{ad.description}</p>
              <div className="text-3xl font-black text-indigo-600 mb-6">
                 {ad.price ? `€ ${ad.price}` : 'Grátis'}
              </div>
              <button 
                onClick={() => setShowContactWarning(true)}
                className="w-full bg-emerald-500 text-white py-4 rounded-2xl font-bold"
              >
                Contactar via WhatsApp
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {showContactWarning && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/80">
          <div className="bg-white p-8 rounded-[2.5rem] max-w-md w-full">
            <h3 className="text-xl font-bold mb-4">Aviso de Segurança</h3>
            <p className="text-sm text-slate-600 mb-6">Verifique sempre a veracidade antes de pagar.</p>
            <div className="flex items-center gap-2 mb-6">
              <input type="checkbox" checked={acceptedContactTerms} onChange={e => setAcceptedContactTerms(e.target.checked)} />
              <label className="text-xs">Aceito os termos.</label>
            </div>
            <button onClick={confirmContact} disabled={!acceptedContactTerms} className="w-full bg-indigo-600 text-white py-3 rounded-xl disabled:opacity-50">Continuar</button>
          </div>
        </div>
      )}
    </>
  );
};

export default AdCard;
