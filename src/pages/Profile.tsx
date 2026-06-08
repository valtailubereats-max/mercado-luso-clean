import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { doc, setDoc, updateDoc, serverTimestamp, collection, query, where, deleteDoc, writeBatch, increment, limit } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType, getDocsWithCacheFallback } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { clearHomeCache } from '../utils/cache';
import { Ad, UserProfile, COUNTRY_CODES, CITIES } from '../types';
import { SearchableCitySelect } from '../components/SearchableCitySelect';
import { motion } from 'motion/react';
import { User, Phone, Mail, Edit, Trash2, Clock, CheckCircle, XCircle, Globe, RefreshCcw, Archive, AlertTriangle, Eye, MessageSquare, MapPin, ShoppingBag, Star } from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { pt } from 'date-fns/locale';
import { formatPrice } from '../utils';
import OptimizedImage from '../components/OptimizedImage';
import ReviewModal from '../components/ReviewModal';
import { calculateTotalPoints, calculateProgressPoints, POINTS_THRESHOLD, POINTS_PER_REFERRAL, POINTS_PER_AD } from '../utils/rewards';

const Profile = () => {
  const { user, profile, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const highlightAdId = searchParams.get('highlight');

  const [phone, setPhone] = useState('');
  const [countryCode, setCountryCode] = useState('+351');
  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [country, setCountry] = useState<'Portugal' | 'Reino Unido' | ''>('');
  const [loading, setLoading] = useState(false);
  const [ads, setAds] = useState<Ad[]>([]);
  const [adsLoading, setAdsLoading] = useState(true);
  const [selectedAdForReview, setSelectedAdForReview] = useState<Ad | null>(null);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [reviews, setReviews] = useState<any[]>([]);
  const [reviewsLoading, setReviewsLoading] = useState(true);
  const [referralsCount, setReferralsCount] = useState(0);
  const [referralsLoading, setReferralsLoading] = useState(true);
  const [copiedReferral, setCopiedReferral] = useState(false);

  const updateReferralStatsAndCredits = async () => {
    if (!user || !profile) return;
    try {
      const q = query(collection(db, 'referrals'), where('inviterId', '==', user.uid));
      const snap = await getDocsWithCacheFallback(q, `referrals/inviterId-${user.uid}`);
      const realCount = snap.size;
      setReferralsCount(realCount);
      setReferralsLoading(false);

      const profileCount = profile.referredUsersCount || 0;
      const pointsFromAds = (profile as any).pointsFromAds || 0;
      const currentCredits = profile.referralCredits || 0;

      if (realCount !== profileCount) {
        console.log(`Updating user referral stats. DB Count: ${realCount}, Profile Count: ${profileCount}`);
        
        const oldPoints = calculateTotalPoints(profileCount, pointsFromAds);
        const newPoints = calculateTotalPoints(realCount, pointsFromAds);
        
        const oldCreditsEarned = Math.floor(oldPoints / POINTS_THRESHOLD);
        const newCreditsEarned = Math.floor(newPoints / POINTS_THRESHOLD);
        const creditsToGrant = Math.max(0, newCreditsEarned - oldCreditsEarned);
        const nextCredits = currentCredits + creditsToGrant;

        await updateDoc(doc(db, 'users', user.uid), {
          referredUsersCount: realCount,
          referralCredits: nextCredits
        });

        await refreshProfile();
      }
    } catch (err) {
      console.error("Error updating referral stats:", err);
      setReferralsLoading(false);
    }
  };

  const handleFeatureAd = async (ad: Ad) => {
    if (!user || !profile) return;
    
    const credits = profile.referralCredits || 0;
    if (credits <= 0) {
      alert("Não possui Créditos de Destaque disponíveis. Convide mais amigos para ganhar!");
      return;
    }
    
    if (!window.confirm("Deseja utilizar 1 Crédito de Destaque para destacar este anúncio por 24 horas? Ele receberá destaque e uma moldura premium dourada no Mercado Luso!")) {
      return;
    }
    
    try {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      
      await updateDoc(doc(db, 'ads', ad.id), {
        isFeatured: true,
        featuredUntil: tomorrow
      });
      clearHomeCache();
      
      await updateDoc(doc(db, 'users', user.uid), {
        referralCredits: credits - 1
      });
      
      alert("Anúncio destacado com sucesso por 24 horas!");
      
      await refreshProfile();
      await fetchUserAds();
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `ads/${ad.id}`);
    }
  };

  useEffect(() => {
    if (!highlightAdId) {
      window.scrollTo(0, 0);
    }
  }, [highlightAdId]);

  useEffect(() => {
    if (!adsLoading && ads.length > 0 && highlightAdId) {
      const timer = setTimeout(() => {
        const element = document.getElementById(`ad-profile-${highlightAdId}`);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [adsLoading, ads, highlightAdId]);

  useEffect(() => {
    if (profile) {
      const fullPhone = profile.phone || '';
      const foundCode = COUNTRY_CODES.find(c => fullPhone.startsWith(c.code));
      if (foundCode) {
        setCountryCode(foundCode.code);
        setPhone(fullPhone.replace(foundCode.code, '').trim());
      } else {
        setCountryCode('+351');
        setPhone(fullPhone);
      }
      setName(profile.name || '');
      setCity(profile.city || '');
      if (profile.country === 'Portugal' || profile.country === 'Reino Unido') {
        setCountry(profile.country);
      } else {
        // Primeira vez: Deixa em branco para forçar o utilizador a escolher o país
        setCountry('');
      }
      fetchUserAds();
      fetchUserReviews(user?.uid || '');
      updateReferralStatsAndCredits();
    }
  }, [profile]);

  const fetchUserReviews = async (sellerId: string) => {
    if (!sellerId) return;
    setReviewsLoading(true);
    try {
      const q = query(collection(db, 'reviews'), where('sellerId', '==', sellerId), limit(5));
      const snap = await getDocsWithCacheFallback(q, `reviews/sellerId-${sellerId}`);
      const reviewsData = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      reviewsData.sort((a: any, b: any) => {
        const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
        const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
        return timeB - timeA;
      });
      setReviews(reviewsData);
    } catch (err) {
      console.error('Error fetching user reviews:', err);
    } finally {
      setReviewsLoading(false);
    }
  };

  const fetchUserAds = async () => {
    if (!user) return;
    setAdsLoading(true);
    try {
      const q = query(collection(db, 'ads'), where('sellerId', '==', user.uid), limit(5));
      const querySnapshot = await getDocsWithCacheFallback(q, `ads/sellerId-${user.uid}`);
      const adsData = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Ad));
      setAds(adsData.sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis()));

      // Clear notifications for these ads
      const unnotifiedAds = adsData.filter(ad => ad.userNotified === false && ad.status !== 'pending');
      if (unnotifiedAds.length > 0) {
        const batch = writeBatch(db);
        unnotifiedAds.forEach(ad => {
          batch.update(doc(db, 'ads', ad.id), { userNotified: true });
        });
        await batch.commit();
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, 'ads');
    } finally {
      setAdsLoading(false);
    }
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!country) {
      alert('Por favor, selecione primeiro o país.');
      return;
    }
    setLoading(true);
    try {
      const docRef = doc(db, 'users', user.uid);
      const digitsOnly = phone.replace(/\D/g, '');
      if (digitsOnly.length < 7) {
        alert('Por favor, insira um número de telemóvel válido.');
        setLoading(false);
        return;
      }
      const fullPhone = `${countryCode}${digitsOnly}`;
      // Use setDoc with merge: true to avoid "No document to update" if creation failed
      await setDoc(docRef, { name, phone: fullPhone, city, country }, { merge: true });
      localStorage.setItem('selectedCountry', country);
      await refreshProfile();
      navigate('/');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${user.uid}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteAd = async (id: string) => {
    if (!window.confirm('Tem certeza que deseja excluir este anúncio?')) return;
    try {
      await deleteDoc(doc(db, 'ads', id));
      clearHomeCache();
      setAds(ads.filter(ad => ad.id !== id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `ads/${id}`);
    }
  };

  const handleRelistAd = async (ad: Ad) => {
    if (!window.confirm('Deseja relistar este anúncio? Ele voltará para a fila de aprovação.')) return;
    try {
      const adRef = doc(db, 'ads', ad.id);
      
      // Calculate new expiration date (default 30 days for relisting)
      const expirationDate = new Date();
      expirationDate.setDate(expirationDate.getDate() + 30);

      // Track renewal after warning metric
      if (ad.adStatus === 'near_expiration' || ad.adStatus === 'expired') {
        const todayStr = new Date().toISOString().split('T')[0];
        const metricsRef = doc(db, 'metrics', todayStr);
        try {
          await setDoc(metricsRef, {
            notifications: {
              renewalsAfterWarning: increment(1)
            }
          }, { merge: true });
        } catch (err) {
          console.error('Error updating renewal metrics:', err);
        }
      }

      await setDoc(adRef, {
        status: 'pending',
        adStatus: 'active',
        expirationDate: expirationDate,
        userNotified: false,
        createdAt: new Date()
      }, { merge: true });
      clearHomeCache();
      
      alert('Anúncio enviado para aprovação!');
      fetchUserAds();
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `ads/${ad.id}`);
    }
  };

  const handleMarkAsAvailable = async (adId: string) => {
    if (!window.confirm('Deseja marcar este anúncio como disponível de novo?')) return;
    try {
      const adRef = doc(db, 'ads', adId);
      await updateDoc(adRef, {
        adStatus: 'active',
        status: 'approved',
        updatedAt: serverTimestamp()
      });
      clearHomeCache();
      alert('Anúncio marcado como disponível de novo!');
      fetchUserAds();
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `ads/${adId}`);
    }
  };

  if (!user) return <div className="text-center py-20">Por favor, faça login para ver seu perfil.</div>;

  const pointsFromAds = (profile as any)?.pointsFromAds || 0;
  const pointsFromReferrals = (referralsLoading ? 0 : referralsCount) * POINTS_PER_REFERRAL;
  const totalPoints = calculateTotalPoints(referralsLoading ? 0 : referralsCount, pointsFromAds);
  const progressPoints = calculateProgressPoints(totalPoints);
  const progressPercent = Math.min(100, Math.round((progressPoints / POINTS_THRESHOLD) * 100));
  const pointsNeeded = POINTS_THRESHOLD - progressPoints;

  return (
    <div className="max-w-4xl mx-auto space-y-12">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white p-8 rounded-3xl shadow-xl border border-slate-100"
      >
        <div className="flex items-center gap-4 mb-8">
          <div className="w-16 h-16 bg-indigo-100 rounded-2xl flex items-center justify-center text-indigo-600">
            <User size={32} />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-3xl font-bold text-slate-900">Meu Perfil</h1>
              {profile?.ratingCount ? (
                <div className="flex items-center gap-1 bg-amber-50 text-amber-700 px-2.5 py-0.5 rounded-full text-xs font-black border border-amber-100">
                  <Star size={12} className="fill-amber-400 text-amber-400" />
                  <span>{profile.ratingAverage}</span>
                  <span className="text-[10px] font-medium text-slate-400 ml-0.5">({profile.ratingCount})</span>
                </div>
              ) : null}
            </div>
            <p className="text-slate-500">{user.email}</p>
          </div>
        </div>

        <form onSubmit={handleUpdateProfile} className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <label className="text-sm font-bold text-slate-700 uppercase tracking-wider">Nome Completo</label>
            <div className="relative">
              <User className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="w-full pl-12 pr-4 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:border-indigo-600 focus:bg-white outline-none transition-all"
                placeholder="Seu nome"
              />
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-bold text-slate-700 uppercase tracking-wider">Telemóvel (WhatsApp)</label>
            <div className="flex gap-2">
              <div className="relative w-32 shrink-0">
                <Globe className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <select
                  value={countryCode}
                  onChange={(e) => setCountryCode(e.target.value)}
                  className="w-full pl-9 pr-2 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:border-indigo-600 focus:bg-white outline-none transition-all appearance-none text-sm font-bold"
                >
                  {COUNTRY_CODES.map((c, index) => (
                    <option key={`country-${c.code}-${index}`} value={c.code}>{c.flag} {c.code}</option>
                  ))}
                </select>
              </div>
              <div className="relative flex-1">
                <Phone className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  required
                  className="w-full pl-12 pr-4 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:border-indigo-600 focus:bg-white outline-none transition-all"
                  placeholder="Ex: 912345678"
                />
              </div>
            </div>
            <p className="text-xs text-slate-400 mt-1">Necessário para que os compradores entrem em contacto.</p>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-bold text-slate-700 uppercase tracking-wider">País / Comunidade</label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-base leading-none select-none pointer-events-none z-10">
                {country === 'Portugal' ? '🇵🇹' : country === 'Reino Unido' ? '🇬🇧' : '🌍'}
              </span>
              <select
                value={country}
                onChange={(e) => {
                  const newVal = e.target.value as 'Portugal' | 'Reino Unido' | '';
                  setCountry(newVal);
                  setCity('');
                  if (newVal === 'Reino Unido') {
                    setCountryCode('+44');
                  } else if (newVal === 'Portugal') {
                    setCountryCode('+351');
                  }
                }}
                required
                className="w-full pl-12 pr-10 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:border-indigo-600 focus:bg-white outline-none transition-all appearance-none font-bold text-slate-800 cursor-pointer"
              >
                <option value="" disabled className="text-slate-400">Selecione o seu país</option>
                <option value="Portugal">🇵🇹 Portugal</option>
                <option value="Reino Unido">🇬🇧 Reino Unido</option>
              </select>
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">▼</span>
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-bold text-slate-700 uppercase tracking-wider">Cidade</label>
            <div className="relative">
              <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 z-10" size={20} />
              <SearchableCitySelect
                value={city}
                onChange={(val) => setCity(val)}
                placeholder="Escreva ou escolha a sua cidade"
                country={country}
              />
            </div>
          </div>
          <div className="md:col-span-2">
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 disabled:opacity-50"
            >
              {loading ? 'A guardar...' : 'Guardar Alterações'}
            </button>
          </div>
        </form>
      </motion.div>

      {/* Secção de Convites / Ganhe Destaque */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-gradient-to-br from-emerald-50 via-teal-50/20 to-indigo-50/10 p-8 rounded-3xl shadow-lg border border-emerald-100 space-y-8"
      >
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center text-emerald-600 shrink-0 shadow-sm">
            <span className="text-2xl">🎁</span>
          </div>
          <div className="flex-1">
            <h2 className="text-2xl font-bold text-slate-900">Ganhe Destaque ao Partilhar</h2>
            <p className="text-slate-500 mt-1">Consegue novos amigos recomendados para entrarem no Mercado Luso! Receba 24 horas de Destaque Gratuito para qualquer anúncio à sua escolha a cada 3 novos registos recomendados por si.</p>
          </div>
        </div>

        {/* Dynamic Reward Banner when user has unused credits */}
        {!referralsLoading && profile?.referralCredits && profile.referralCredits > 0 ? (
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 100 }}
            className="bg-gradient-to-r from-amber-500 via-amber-400 to-yellow-400 p-6 rounded-2xl text-white shadow-lg border border-amber-300 relative overflow-hidden"
          >
            {/* Ambient shine decoration */}
            <div className="absolute -right-12 -top-12 w-40 h-40 bg-white/10 rounded-full blur-2xl pointer-events-none" />
            
            <div className="flex items-start gap-4">
              <span className="text-3xl animate-pulse shrink-0 mt-1">🎉</span>
              <div className="space-y-1">
                <h3 className="text-lg font-black tracking-tight uppercase">Parabéns!</h3>
                <p className="font-bold text-sm">Recebeu 1 Crédito de Destaque.</p>
                <p className="text-xs text-amber-50 font-medium">Escolha um anúncio para promover durante 24 horas.</p>
              </div>
            </div>
          </motion.div>
        ) : null}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
          <div className="space-y-3 col-span-1 md:col-span-2">
            <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest">O Seu Link de Convite</h4>
            <div className="flex flex-col sm:flex-row gap-2.5 w-full">
              <input
                type="text"
                readOnly
                value={`${window.location.origin}/?ref=${profile?.referralCode || ''}`}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold font-mono text-slate-700 focus:outline-none select-all"
              />
              <div className="flex gap-2 shrink-0">
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(`${window.location.origin}/?ref=${profile?.referralCode || ''}`);
                      setCopiedReferral(true);
                      setTimeout(() => setCopiedReferral(false), 2000);
                    } catch (e) {
                      console.error(e);
                    }
                  }}
                  className={`px-5 py-3 rounded-xl font-bold text-sm flex-1 sm:flex-none transition-all ${
                    copiedReferral 
                      ? 'bg-emerald-600 text-white shadow-md shadow-emerald-100' 
                      : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-md shadow-indigo-100'
                  }`}
                >
                  {copiedReferral ? 'Copiado!' : 'Copiar Link'}
                </button>
                <a
                  href={`https://api.whatsapp.com/send?text=${encodeURIComponent(
                    `Olá! 👋 Recomendo o Marketplace da nossa Comunidade Lusófona! Regista-te pelo meu link de convite para começares já a ver anúncios ou criar publicações, e ganharmos pontos de destaque grátis! 🎉 Abraço!\n\n${window.location.origin}/?ref=${profile?.referralCode || ''}`
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-5 py-3 rounded-xl font-bold text-sm bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 text-white hover:scale-102 active:scale-98 transition-all flex items-center justify-center gap-2 shadow-md shadow-emerald-100/50 cursor-pointer flex-1 sm:flex-none whitespace-nowrap"
                >
                  <MessageSquare size={16} />
                  <span>Convidar no WhatsApp</span>
                </a>
              </div>
            </div>
          </div>
        </div>

        {/* Bento Grid layout for Reward Points */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm text-center flex flex-col justify-between">
            <div>
              <span className="text-xs font-black text-slate-400 uppercase tracking-widest block">Pontos de Convites</span>
              <span className="text-2xl font-brand font-black text-emerald-600 block mt-2">{referralsLoading ? '...' : `${pointsFromReferrals} pts`}</span>
            </div>
            <span className="text-[10px] text-slate-500 font-bold block mt-2 border-t border-slate-50 pt-1.5">{referralsCount} amigos ({POINTS_PER_REFERRAL} pts/cada)</span>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm text-center flex flex-col justify-between">
            <div>
              <span className="text-xs font-black text-slate-400 uppercase tracking-widest block">Pontos de Anúncios</span>
              <span className="text-2xl font-brand font-black text-indigo-600 block mt-2">{referralsLoading ? '...' : `${pointsFromAds} pts`}</span>
            </div>
            <span className="text-[10px] text-slate-500 font-bold block mt-2 border-t border-slate-50 pt-1.5">Aprovados ({POINTS_PER_AD} pts/cada)</span>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm text-center flex flex-col justify-between">
            <div>
              <span className="text-xs font-black text-slate-400 uppercase tracking-widest block">Próximo Destaque</span>
              <span className="text-2xl font-brand font-black text-amber-500 block mt-2">{referralsLoading ? '...' : `${progressPoints} / 150`}</span>
            </div>
            <span className="text-[10px] text-slate-500 font-bold block mt-2 border-t border-slate-50 pt-1.5">Faltam {pointsNeeded} pts para o destaque</span>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm text-center flex flex-col justify-between">
            <div>
              <span className="text-xs font-black text-slate-400 uppercase tracking-widest block">Destaques Disponíveis</span>
              <span className="text-2xl font-brand font-black text-indigo-700 block mt-2">{profile?.referralCredits || 0}</span>
            </div>
            <span className="text-[10px] text-slate-500 font-bold block mt-2 border-t border-slate-50 pt-1.5">Créditos de destaque de 24h</span>
          </div>
        </div>

        {/* Visual Progress Section */}
        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm space-y-4">
          <div className="flex justify-between items-center flex-wrap gap-2">
            <div className="space-y-1">
              <span className="text-xs font-black text-slate-400 uppercase tracking-widest block">Próximo Crédito</span>
              <h4 className="text-sm font-bold text-slate-700">
                {referralsLoading ? (
                  "A carregar convidados..."
                ) : (
                  <>
                    Faltam {pointsNeeded} pontos para ganhar automaticamente 1 crédito de destaque.
                  </>
                )}
              </h4>
            </div>
            <div className="text-right">
              <span className="text-xs font-black text-slate-400 uppercase tracking-widest block font-mono">Progresso</span>
              <span className="text-sm font-black text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-100 block mt-0.5">
                {referralsLoading ? '...' : `${progressPercent}%`}
              </span>
            </div>
          </div>

          {/* Progress Bar with rounded corners and animated fill */}
          <div className="relative w-full bg-slate-100 rounded-full h-4 overflow-hidden border border-slate-200/60 shadow-inner">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: referralsLoading ? "0%" : `${progressPercent}%` }}
              transition={{ duration: 0.8, ease: "easeOut" }}
              className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-emerald-500 shadow-sm relative overflow-hidden"
            >
              {/* Animated gleam effect to feel premium */}
              <div 
                className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-pulse"
                style={{ width: '40%' }}
              />
            </motion.div>
          </div>

          <div className="flex justify-between text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">
            <span>0%</span>
            <span>25%</span>
            <span>50%</span>
            <span>75%</span>
            <span>100% 🎁</span>
          </div>
        </div>
      </motion.div>

      {reviews.length > 0 && (
        <div className="space-y-6">
          <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            Avaliações Recebidas
            <span className="bg-amber-100 text-amber-800 text-sm px-3 py-1 rounded-full">{reviews.length}</span>
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {reviews.map((rev) => (
              <div key={rev.id} className="bg-white p-5 rounded-3xl shadow-sm border border-slate-100 flex flex-col justify-between space-y-3">
                <div className="space-y-2">
                  <div className="flex justify-between items-start">
                    <div>
                      <h4 className="font-bold text-slate-800">{rev.buyerName}</h4>
                      <div className="flex flex-wrap gap-1.5 items-center mt-1">
                        {rev.adCategory && (
                          <span className="text-[9px] bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded-md font-semibold font-sans">
                            {rev.adCategory}
                          </span>
                        )}
                        <span className="text-[10px] text-slate-400 font-medium truncate max-w-[200px]" title={rev.adTitle}>
                          {rev.adTitle}
                        </span>
                      </div>
                    </div>
                    <div className="flex gap-0.5">
                      {[1, 2, 3, 4, 5].map((s) => (
                        <Star key={s} size={12} className={`${s <= rev.rating ? 'text-amber-400 fill-amber-400' : 'text-slate-100'}`} />
                      ))}
                    </div>
                  </div>
                  {rev.comment ? (
                    <p className="text-slate-600 text-xs leading-relaxed italic">"{rev.comment}"</p>
                  ) : (
                    <p className="text-slate-400 text-xs italic">Sem comentário escrito.</p>
                  )}
                </div>
                <div className="flex justify-between items-center pt-2 border-t border-slate-50 text-[10px]">
                  <span className={`px-2 py-0.5 rounded-full font-bold ${rev.success ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                    {rev.success ? 'Negócio Fechado ✓' : 'Negócio Incompleto'}
                  </span>
                  <span className="text-slate-400 font-medium">
                    {rev.createdAt?.toDate ? formatDistanceToNow(rev.createdAt.toDate(), { addSuffix: true, locale: pt }) : 'Recentemente'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-6">
        <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          Meus Anúncios
          <span className="bg-slate-200 text-slate-600 text-sm px-3 py-1 rounded-full">{ads.length}</span>
        </h2>

        {adsLoading ? (
          <div className="text-center py-12 text-slate-400">A carregar anúncios...</div>
        ) : ads.length === 0 ? (
          <div className="bg-white p-12 rounded-3xl text-center border-2 border-dashed border-slate-200">
            <p className="text-slate-500 mb-4">Ainda não publicou nenhum anúncio.</p>
            <button
              onClick={() => navigate('/create-ad')}
              className="bg-indigo-600 text-white px-8 py-3 rounded-xl font-bold hover:bg-indigo-700 transition-all"
            >
              Criar Primeiro Anúncio
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {ads.map((ad, idx) => {
              const isAdFeatured = ad.isFeatured && ad.featuredUntil && (
                ad.featuredUntil.seconds 
                  ? ad.featuredUntil.toDate() > new Date() 
                  : new Date(ad.featuredUntil) > new Date()
              );

              return (
                <motion.div
                  key={`profile-ad-${ad.id}-${idx}`}
                  id={`ad-profile-${ad.id}`}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className={`bg-white p-4 rounded-3xl shadow-md border flex gap-4 transition-all duration-500 relative ${
                    isAdFeatured
                      ? 'border-amber-400 ring-4 ring-amber-300 bg-amber-50/5'
                      : highlightAdId === ad.id 
                      ? 'border-amber-400 ring-4 ring-amber-100 bg-amber-50/10 scale-[1.02]' 
                      : 'border-slate-100'
                  }`}
                >
                  <OptimizedImage 
                    src={ad.imageUrl} 
                    alt={ad.title} 
                    className="w-full h-full object-cover" 
                    containerClassName="w-24 h-24 rounded-2xl bg-slate-50 overflow-hidden"
                    style={{
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
                    }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-start">
                      <h3 className="font-bold text-slate-900 truncate">{ad.title}</h3>
                      <div className="flex gap-2">
                        <button 
                          onClick={() => {
                            if (ad.status === 'approved') {
                              alert('Atenção: Qualquer alteração fará com que o anúncio volte para a fila de aprovação do administrador.');
                            }
                            navigate(`/edit-ad/${ad.id}`);
                          }} 
                          className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                        >
                          <Edit size={18} />
                        </button>
                        <button onClick={() => handleDeleteAd(ad.id)} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all">
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </div>
                    <p className="text-indigo-600 font-bold mt-1">{formatPrice(ad.price, ad.country)}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {isAdFeatured && (
                        <span className="flex items-center gap-1 text-xs font-bold text-amber-600 bg-amber-50 px-2 py-1 rounded-lg border border-amber-200 shadow-sm animate-pulse">
                          ✨ Destacado 24h
                        </span>
                      )}
                      {ad.status === 'pending' && (
                        <span className="flex items-center gap-1 text-xs font-bold text-amber-600 bg-amber-50 px-2 py-1 rounded-lg">
                          <Clock size={14} /> Pendente
                        </span>
                      )}
                      {ad.status === 'approved' && ad.adStatus === 'active' && (
                        <span className="flex items-center gap-1 text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-lg">
                          <CheckCircle size={14} /> Aprovado
                        </span>
                      )}
                      {ad.adStatus === 'near_expiration' && ad.status === 'approved' && (
                        <span className="flex items-center gap-1 text-xs font-bold text-amber-600 bg-amber-50 px-2 py-1 rounded-lg">
                          <AlertTriangle size={14} /> Expira em breve
                        </span>
                      )}
                      {(ad.status === 'expired' || ad.adStatus === 'expired') && (
                        <span className="flex items-center gap-1 text-xs font-bold text-red-600 bg-red-50 px-2 py-1 rounded-lg">
                          <XCircle size={14} /> Expirado
                        </span>
                      )}
                      {ad.status === 'archived' && (
                        <span className="flex items-center gap-1 text-xs font-bold text-slate-600 bg-slate-50 px-2 py-1 rounded-lg">
                          <Archive size={14} /> Arquivado
                        </span>
                      )}
                      {ad.status === 'rejected' && (
                        <span className="flex items-center gap-1 text-xs font-bold text-red-600 bg-red-50 px-2 py-1 rounded-lg">
                          <XCircle size={14} /> Rejeitado
                        </span>
                      )}
                      {(ad.status === 'sold' || ad.adStatus === 'sold') && ad.category !== 'Imigração' && ad.price !== undefined && Number(ad.price) > 0 && (
                        <span className="flex items-center gap-1 text-xs font-bold text-indigo-600 bg-indigo-50 px-2 py-1 rounded-lg">
                          <ShoppingBag size={14} /> Vendido
                        </span>
                      )}
                    </div>
                    
                    {ad.expirationDate && (
                      <p className="text-[10px] text-slate-400 mt-2 font-medium uppercase tracking-wider">
                        Expira em: {format(ad.expirationDate.toDate(), "dd 'de' MMMM", { locale: pt })}
                      </p>
                    )}

                    <div className="mt-3 flex items-center gap-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                      <span className="flex items-center gap-1"><Eye size={12} /> {ad.views || 0}</span>
                      <span className="flex items-center gap-1"><MessageSquare size={12} /> {ad.whatsappClicks || 0}</span>
                    </div>

                    {(ad.status === 'approved' || ad.adStatus === 'active' || ad.adStatus === 'near_expiration') && ad.adStatus !== 'sold' && ad.category !== 'Imigração' && ad.price !== undefined && Number(ad.price) > 0 && (
                      <button
                        onClick={() => {
                          setSelectedAdForReview(ad);
                          setShowReviewModal(true);
                        }}
                        className="mt-3 w-full flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-bold bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition-all border border-emerald-100"
                      >
                        <ShoppingBag size={14} /> Marcar como Vendido
                      </button>
                    )}

                    {ad.status === 'approved' && ad.adStatus === 'active' && !isAdFeatured && (
                      <button
                        onClick={() => handleFeatureAd(ad)}
                        className={`mt-2 w-full flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                          (profile?.referralCredits || 0) > 0
                            ? 'bg-amber-500 hover:bg-amber-600 text-white border-amber-600 shadow-sm'
                            : 'bg-slate-50 text-slate-400 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        <span>✨</span>
                        <span>Destacar Anúncio (1 crédito)</span>
                      </button>
                    )}

                    {ad.adStatus === 'sold' && ad.category !== 'Imigração' && ad.price !== undefined && Number(ad.price) > 0 && (
                      <button
                      onClick={() => handleMarkAsAvailable(ad.id)}
                      className="mt-3 w-full flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-bold bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-all border border-indigo-100"
                    >
                      <RefreshCcw size={14} /> Reverter para Disponível
                    </button>
                  )}

                  {(ad.status === 'expired' || ad.adStatus === 'expired' || ad.status === 'archived' || ad.adStatus === 'near_expiration') && (
                    <button
                      onClick={() => handleRelistAd(ad)}
                      className={`mt-3 w-full flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-bold transition-all ${
                        ad.adStatus === 'near_expiration' 
                          ? 'bg-amber-50 text-amber-600 hover:bg-amber-100' 
                          : 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100'
                      }`}
                    >
                      <RefreshCcw size={14} /> 
                      {ad.adStatus === 'near_expiration' ? 'Renovar Anúncio' : 'Relistar Anúncio'}
                    </button>
                  )}
                </div>
              </motion.div>
            );
          })}
          </div>
        )}
      </div>

      {selectedAdForReview && (
        <ReviewModal
          isOpen={showReviewModal}
          onClose={() => {
            setShowReviewModal(false);
            setSelectedAdForReview(null);
          }}
          adId={selectedAdForReview.id}
          adTitle={selectedAdForReview.title}
          adCategory={selectedAdForReview.category}
          sellerId={user.uid}
          sellerName={profile?.name || ''}
          onSuccess={() => {
            fetchUserAds();
            alert('Parabéns pela venda! O seu anúncio foi finalizado com sucesso.');
          }}
        />
      )}
    </div>
  );
};

export default Profile;
