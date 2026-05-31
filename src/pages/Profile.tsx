import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { doc, setDoc, updateDoc, serverTimestamp, collection, query, where, getDocs, deleteDoc, writeBatch, increment } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { Ad, UserProfile, COUNTRY_CODES, CITIES } from '../types';
import { motion } from 'motion/react';
import { User, Phone, Mail, Edit, Trash2, Clock, CheckCircle, XCircle, Globe, RefreshCcw, Archive, AlertTriangle, Eye, MessageSquare, MapPin, ShoppingBag, Star } from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { pt } from 'date-fns/locale';
import { formatPrice } from '../utils';
import OptimizedImage from '../components/OptimizedImage';
import ReviewModal from '../components/ReviewModal';

const Profile = () => {
  const { user, profile, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const highlightAdId = searchParams.get('highlight');

  const [phone, setPhone] = useState('');
  const [countryCode, setCountryCode] = useState('+351');
  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [loading, setLoading] = useState(false);
  const [ads, setAds] = useState<Ad[]>([]);
  const [adsLoading, setAdsLoading] = useState(true);
  const [selectedAdForReview, setSelectedAdForReview] = useState<Ad | null>(null);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [reviews, setReviews] = useState<any[]>([]);
  const [reviewsLoading, setReviewsLoading] = useState(true);

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
      fetchUserAds();
      fetchUserReviews(user?.uid || '');
    }
  }, [profile]);

  const fetchUserReviews = async (sellerId: string) => {
    if (!sellerId) return;
    setReviewsLoading(true);
    try {
      const q = query(collection(db, 'reviews'), where('sellerId', '==', sellerId));
      const snap = await getDocs(q);
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
      const q = query(collection(db, 'ads'), where('sellerId', '==', user.uid));
      const querySnapshot = await getDocs(q);
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
      await setDoc(docRef, { name, phone: fullPhone, city }, { merge: true });
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
      alert('Anúncio marcado como disponível de novo!');
      fetchUserAds();
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `ads/${adId}`);
    }
  };

  if (!user) return <div className="text-center py-20">Por favor, faça login para ver seu perfil.</div>;

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
            <label className="text-sm font-bold text-slate-700 uppercase tracking-wider">Cidade</label>
            <div className="relative">
              <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
              <input
                type="text"
                list="profile-cities-list"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="Escreva ou escolha a sua cidade"
                className="w-full pl-12 pr-4 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:border-indigo-600 focus:bg-white outline-none transition-all placeholder:text-slate-400 font-medium"
                required
              />
              <datalist id="profile-cities-list">
                {CITIES.map((c, index) => (
                  <option key={`profile-city-datalist-${c}-${index}`} value={c} />
                ))}
              </datalist>
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
            {ads.map((ad, idx) => (
              <motion.div
                key={`profile-ad-${ad.id}-${idx}`}
                id={`ad-profile-${ad.id}`}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className={`bg-white p-4 rounded-3xl shadow-md border flex gap-4 transition-all duration-500 ${
                  highlightAdId === ad.id 
                    ? 'border-amber-400 ring-4 ring-amber-100 bg-amber-50/10 scale-[1.02]' 
                    : 'border-slate-100'
                }`}
              >
                <OptimizedImage 
                  src={ad.imageUrl} 
                  alt={ad.title} 
                  className="w-full h-full object-contain" 
                  containerClassName="w-24 h-24 rounded-2xl bg-slate-50 overflow-hidden"
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
                  <p className="text-indigo-600 font-bold mt-1">{formatPrice(ad.price)}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
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
            ))}
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
