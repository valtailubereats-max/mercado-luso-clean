import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Star, CheckCircle, AlertCircle } from 'lucide-react';
import { db } from '../firebase';
import { doc, getDoc, setDoc, updateDoc, increment, serverTimestamp, runTransaction, collection, query, getDocs, limit, orderBy, startAt, endAt } from 'firebase/firestore';
import { Review, UserProfile } from '../types';
import { useAuth } from '../context/AuthContext';

interface ReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  adId: string;
  adTitle: string;
  adCategory?: string;
  sellerId: string;
  sellerName: string;
  onSuccess: () => void;
  isBuyerRating?: boolean;
}

const ReviewModal: React.FC<ReviewModalProps> = ({
  isOpen,
  onClose,
  adId,
  adTitle,
  adCategory = '',
  sellerId,
  sellerName,
  onSuccess,
  isBuyerRating = false
}) => {
  const { user, profile: currentUserProfile } = useAuth();
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [success, setSuccess] = useState<boolean | null>(null);
  const [buyerName, setBuyerName] = useState('');
  const [loading, setLoading] = useState(false);
  const [hoverRating, setHoverRating] = useState(0);

  // States for selecting buyer
  const [selectedBuyerId, setSelectedBuyerId] = useState<string>('');
  const [usersList, setUsersList] = useState<any[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);

  // Clear states when the modal is closed
  useEffect(() => {
    if (!isOpen) {
      setRating(0);
      setComment('');
      setSuccess(null);
      setBuyerName('');
      setSelectedBuyerId('');
      setUsersList([]);
      setShowDropdown(false);
    }
  }, [isOpen]);

  useEffect(() => {
    if (user && isBuyerRating) {
      setBuyerName(currentUserProfile?.name || '');
      setSelectedBuyerId(user.uid);
    }
  }, [user, isBuyerRating, currentUserProfile]);

  // Debounced search on sellerPublicProfiles when seller is reviewing a buyer
  useEffect(() => {
    if (!isOpen || isBuyerRating) return;

    const searchTerm = buyerName.trim();

    // Do not search if less than 3 characters or if a user is already selected
    if (searchTerm.length < 3 || selectedBuyerId) {
      setUsersList([]);
      return;
    }

    console.log(`[ReviewModal] Agendando pesquisa debouncada para: "${searchTerm}"`);
    setLoadingUsers(true);

    const delayDebounceFn = setTimeout(async () => {
      try {
        console.log(`[ReviewModal] Executando consulta Firestore para termo: "${searchTerm}" (max limit 10)...`);
        
        // Formulate prefix queries to search display names: original term and capitalized term (case friendliness)
        const capitalizedTerm = searchTerm.charAt(0).toUpperCase() + searchTerm.slice(1);
        const queryPromises = [];

        const q1 = query(
          collection(db, 'sellerPublicProfiles'),
          orderBy('displayName'),
          startAt(searchTerm),
          endAt(searchTerm + '\uf8ff'),
          limit(10)
        );
        queryPromises.push(getDocs(q1));

        if (capitalizedTerm !== searchTerm) {
          const q2 = query(
            collection(db, 'sellerPublicProfiles'),
            orderBy('displayName'),
            startAt(capitalizedTerm),
            endAt(capitalizedTerm + '\uf8ff'),
            limit(10)
          );
          queryPromises.push(getDocs(q2));
        }

        const snaps = await Promise.all(queryPromises);
        const mergedMap = new Map();

        snaps.forEach(snap => {
          snap.docs.forEach(d => {
            if (d.id !== user?.uid) {
              const displayName = d.data().displayName || 'Sem Nome';
              mergedMap.set(d.id, {
                uid: d.id,
                displayName
              });
            }
          });
        });

        const profiles = Array.from(mergedMap.values()).slice(0, 10);
        console.log(`[ReviewModal] Firestore retornou ${profiles.length} resultados após mesclagem.`);
        setUsersList(profiles);
      } catch (err) {
        console.error('[ReviewModal] Erro ao carregar perfis públicos de utilizadores para seleção:', err);
      } finally {
        setLoadingUsers(false);
      }
    }, 400); // 400ms debounce

    return () => clearTimeout(delayDebounceFn);
  }, [buyerName, isOpen, isBuyerRating, selectedBuyerId, user]);

  const handleSelectUser = (u: any) => {
    setBuyerName(u.displayName);
    setSelectedBuyerId(u.uid);
    setShowDropdown(false);
  };

  const filteredUsers = usersList;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (rating === 0 || success === null || !buyerName) {
      alert('Por favor, preencha todos os campos.');
      return;
    }

    if (!isBuyerRating && !selectedBuyerId) {
      alert('Por favor, selecione um comprador real da lista de resultados.');
      return;
    }

    setLoading(true);
    try {
      const reviewId = `rev_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      let determinedSellerId = sellerId;
      let determinedBuyerId = '';
      let reviewerId = '';
      let revieweeId = '';

      if (isBuyerRating) {
        // Buyer is reviewing Seller
        determinedSellerId = sellerId;
        determinedBuyerId = user?.uid || '';
        reviewerId = user?.uid || '';
        revieweeId = sellerId;
      } else {
        // Seller is reviewing Buyer
        determinedSellerId = user?.uid || sellerId;
        determinedBuyerId = selectedBuyerId;
        reviewerId = user?.uid || '';
        revieweeId = selectedBuyerId;
      }

      console.log(`[ReviewModal] Creating review with role: isBuyerRating=${isBuyerRating}. sellerId=${determinedSellerId}, buyerId=${determinedBuyerId}, reviewerId=${reviewerId}, revieweeId=${revieweeId}`);

      const reviewData: Review = {
        id: reviewId,
        adId,
        adTitle,
        adCategory,
        sellerId: determinedSellerId,
        buyerId: determinedBuyerId,
        buyerName,
        rating,
        comment,
        success,
        reviewerId,
        revieweeId,
        createdAt: serverTimestamp()
      };

      await runTransaction(db, async (transaction) => {
        // Create review
        const reviewRef = doc(db, 'reviews', reviewId);
        transaction.set(reviewRef, reviewData);

        // Update Seller statistics ONLY if it's a buyer rating
        if (isBuyerRating) {
          const sellerRef = doc(db, 'users', sellerId);
          const sellerDoc = await transaction.get(sellerRef);
          
          if (sellerDoc.exists()) {
            const data = sellerDoc.data() as UserProfile;
            const currentAvg = data.ratingAverage || 0;
            const currentCount = data.ratingCount || 0;
            
            const newCount = currentCount + 1;
            const newAvg = (currentAvg * currentCount + rating) / newCount;
            const finalAvg = parseFloat(newAvg.toFixed(1));
            
            transaction.update(sellerRef, {
              ratingCount: newCount,
              ratingAverage: finalAvg
            });
          }
        }

        // Update AD status to sold if requested by seller
        if (!isBuyerRating) {
          const adRef = doc(db, 'ads', adId);
          transaction.update(adRef, {
            status: 'approved',
            adStatus: 'sold',
            updatedAt: serverTimestamp()
          });
        }
      });

      onSuccess();
      onClose();
    } catch (err: any) {
      const isPermissionDenied = err?.code === 'permission-denied' || String(err).includes('PERMISSION_DENIED') || String(err).includes('permission-denied');
      if (isPermissionDenied) {
        console.error('[ReviewModal] ERRO CRÍTICO: Falha de Permissão Firestore (PERMISSION_DENIED). Verifique as regras de segurança para escrita/update do comprador em reviews, users ou ads:', err);
      } else {
        console.error('Error submitting review:', err);
      }
      alert('Erro ao enviar feedback. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-slate-900/80 backdrop-blur-md"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="relative bg-white w-full max-w-md rounded-[2.5rem] p-8 shadow-2xl overflow-hidden"
          >
            <div className="absolute top-0 left-0 w-full h-2 bg-indigo-600" />
            
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-2xl font-black text-slate-900">
                {isBuyerRating ? 'Avaliar Vendedor' : 'Finalizar Negócio'}
              </h3>
              <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
                <X size={24} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <p className="text-sm text-slate-600 mb-4 font-medium">
                  {isBuyerRating 
                    ? `Como foi negociar com ${sellerName} no anúncio "${adTitle}"?`
                    : `Parabéns pela venda de "${adTitle}"! Como correu a negociação com o comprador?`
                  }
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 text-center">
                  Avaliação em Estrelas
                </label>
                <div className="flex justify-center gap-2">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={`star-${star}`}
                      type="button"
                      onMouseEnter={() => setHoverRating(star)}
                      onMouseLeave={() => setHoverRating(0)}
                      onClick={() => setRating(star)}
                      className="p-1 transition-transform active:scale-125"
                    >
                      <Star
                        size={36}
                        className={`transition-colors ${
                          (hoverRating || rating) >= star ? 'text-amber-400 fill-amber-400' : 'text-slate-200'
                        }`}
                      />
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest">
                  Correu tudo bem com a negociação?
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setSuccess(true)}
                    className={`flex items-center justify-center gap-2 py-3 rounded-2xl font-bold border-2 transition-all ${
                      success === true 
                        ? 'bg-emerald-50 border-emerald-500 text-emerald-600' 
                        : 'bg-slate-50 border-slate-100 text-slate-500 hover:border-slate-200'
                    }`}
                  >
                    <CheckCircle size={18} /> Sim
                  </button>
                  <button
                    type="button"
                    onClick={() => setSuccess(false)}
                    className={`flex items-center justify-center gap-2 py-3 rounded-2xl font-bold border-2 transition-all ${
                      success === false 
                        ? 'bg-red-50 border-red-500 text-red-600' 
                        : 'bg-slate-50 border-slate-100 text-slate-500 hover:border-slate-200'
                    }`}
                  >
                    <AlertCircle size={18} /> Não
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">
                  {isBuyerRating ? 'O seu nome' : 'Pesquisar Comprador (Selecione da Lista)'}
                </label>
                {isBuyerRating ? (
                  <input
                    type="text"
                    value={buyerName}
                    onChange={(e) => setBuyerName(e.target.value)}
                    placeholder="O seu nome"
                    className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-4 py-3 font-medium mb-3 focus:border-indigo-500 outline-none transition-all"
                    required
                  />
                ) : (
                  <div className="relative mb-3">
                    <input
                      type="text"
                      value={buyerName}
                      onFocus={() => setShowDropdown(true)}
                      onChange={(e) => {
                        setBuyerName(e.target.value);
                        setSelectedBuyerId(''); // Reset selected user ID if seller types manually
                        setShowDropdown(true);
                      }}
                      placeholder="Comece a digitar o nome do comprador..."
                      className={`w-full bg-slate-50 border-2 rounded-2xl px-4 py-3 font-medium outline-none transition-all ${
                        selectedBuyerId ? 'border-emerald-500 bg-emerald-50/20 text-emerald-800' : 'border-slate-100 focus:border-indigo-500'
                      }`}
                      required
                    />
                    
                    {selectedBuyerId && (
                      <div className="text-xs text-emerald-600 font-bold mt-1.5 flex items-center gap-1 animate-fade-in">
                        <CheckCircle size={14} className="text-emerald-500" /> Comprador selecionado com sucesso!
                      </div>
                    )}

                    {showDropdown && (
                      <>
                        <div className="fixed inset-0 z-40" onClick={() => setShowDropdown(false)} />
                        <div className="absolute left-0 right-0 top-full mt-1 bg-white border-2 border-slate-100 rounded-2xl shadow-xl max-h-48 overflow-y-auto z-50 p-2 space-y-1">
                          {loadingUsers ? (
                            <p className="text-center py-4 text-xs text-slate-400 font-medium">A carregar utilizadores...</p>
                          ) : filteredUsers.length === 0 ? (
                            <p className="text-center py-4 text-xs text-slate-400 font-medium">Nenhum utilizador encontrado com "{buyerName}"</p>
                          ) : (
                            filteredUsers.map((u) => (
                              <button
                                key={`user-option-${u.uid}`}
                                type="button"
                                onClick={() => handleSelectUser(u)}
                                className="w-full text-left px-4 py-2 hover:bg-slate-50 rounded-xl transition-colors flex flex-col"
                              >
                                <span className="font-semibold text-slate-900 text-sm">{u.displayName}</span>
                                <span className="text-[10px] text-slate-400 font-mono">ID: {u.uid.substring(0, 10)}...</span>
                              </button>
                            ))
                          )}
                        </div>
                      </>
                    )}
                  </div>
                )}
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Conte-nos brevemente como foi a experiência..."
                  rows={3}
                  className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-4 py-3 font-medium focus:border-indigo-500 outline-none transition-all resize-none"
                />
              </div>

              <button
                type="submit"
                disabled={loading || rating === 0 || success === null}
                className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 disabled:opacity-50 disabled:shadow-none"
              >
                {loading ? 'A processar...' : isBuyerRating ? 'Enviar Avaliação' : 'Finalizar Anúncio'}
              </button>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default ReviewModal;
