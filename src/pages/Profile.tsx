import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { doc, getDoc, setDoc, updateDoc, serverTimestamp, collection, query, where, deleteDoc, writeBatch, increment, limit, getDocs, onSnapshot } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage, handleFirestoreError, OperationType, getDocsWithCacheFallback } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { clearHomeCache } from '../utils/cache';
import { Ad, UserProfile, COUNTRY_CODES, CITIES } from '../types';
import { SearchableCitySelect } from '../components/SearchableCitySelect';
import { motion } from 'motion/react';
import { User, Phone, Mail, Edit, Trash2, Clock, CheckCircle, XCircle, Globe, RefreshCcw, Archive, AlertTriangle, Eye, MessageSquare, MapPin, ShoppingBag, Star, Plus } from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { pt } from 'date-fns/locale';
import { formatPrice } from '../utils';
import OptimizedImage from '../components/OptimizedImage';
import ReviewModal from '../components/ReviewModal';
import AdCard from '../components/AdCard';
import ShowcaseStats from '../components/ShowcaseStats';
import { calculateTotalPoints, calculateProgressPoints, POINTS_THRESHOLD, POINTS_PER_REFERRAL, POINTS_PER_AD } from '../utils/rewards';

const Profile = () => {
  const { user, profile, refreshProfile, favorites } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const highlightAdId = searchParams.get('highlight');
  const rawTab = searchParams.get('tab') || 'perfil';
  const currentTab = rawTab === 'ads' ? 'anuncios' : rawTab;

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
  const [favoriteAds, setFavoriteAds] = useState<Ad[]>([]);
  const [favoritesLoading, setFavoritesLoading] = useState(false);
  const [purchasedAds, setPurchasedAds] = useState<Ad[]>([]);
  const [purchasedAdsLoading, setPurchasedAdsLoading] = useState(true);
  const [isBuyerRating, setIsBuyerRating] = useState(false);
  const [reviewedAdIds, setReviewedAdIds] = useState<Set<string>>(new Set());
  const [adsCountryTab, setAdsCountryTab] = useState<'Portugal' | 'Reino Unido'>('Portugal');

  const [showcaseActive, setShowcaseActive] = useState(false);
  const [showcaseName, setShowcaseName] = useState('');
  const [showcaseCategory, setShowcaseCategory] = useState('');
  const [showcaseLogo, setShowcaseLogo] = useState('');
  const [showcaseCover, setShowcaseCover] = useState('');
  const [showcaseDescription, setShowcaseDescription] = useState('');
  const [showcaseWhatsapp, setShowcaseWhatsapp] = useState('');
  const [showcaseFacebook, setShowcaseFacebook] = useState('');
  const [showcaseInstagram, setShowcaseInstagram] = useState('');
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);

  const [showcasePlan, setShowcasePlan] = useState<'basic' | 'premium'>('basic');
  const [showcaseProducts, setShowcaseProducts] = useState<any[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [editingProduct, setEditingProduct] = useState<any | null>(null);
  const [showProductModal, setShowProductModal] = useState(false);
  const [productName, setProductName] = useState('');
  const [productDescription, setProductDescription] = useState('');
  const [productPrice, setProductPrice] = useState<string>('');
  const [productActive, setProductActive] = useState(true);
  const [productOrder, setProductOrder] = useState(0);
  const [productImages, setProductImages] = useState<string[]>([]);
  const [isSavingProduct, setIsSavingProduct] = useState(false);
  const [isUploadingProductImg, setIsUploadingProductImg] = useState<boolean[]>([false, false]);

  const fetchShowcaseProducts = async () => {
    if (!user) return;
    setProductsLoading(true);
    try {
      const q = query(
        collection(db, 'sellerPublicProfiles', user.uid, 'products')
      );
      const snap = await getDocs(q);
      const items = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      items.sort((a: any, b: any) => (a.order || 0) - (b.order || 0));
      setShowcaseProducts(items);
    } catch (err) {
      console.error('Error fetching showcase products:', err);
    } finally {
      setProductsLoading(false);
    }
  };

  const handleAddProductClick = () => {
    const currentPlan = showcasePlan || 'basic';
    const limitMax = currentPlan === 'premium' ? 10 : 5;
    if (showcaseProducts.length >= limitMax) {
      alert(`Atingiu o limite de ${limitMax} produtos/serviços para o plano ${currentPlan === 'premium' ? 'Premium' : 'Básico'}.`);
      return;
    }
    const newDocRef = doc(collection(db, 'sellerPublicProfiles', user!.uid, 'products'));
    setEditingProduct({
      id: newDocRef.id,
      userId: user!.uid,
      name: '',
      description: '',
      price: null,
      images: [],
      active: true,
      order: showcaseProducts.length,
      createdAt: null
    });
    setProductName('');
    setProductDescription('');
    setProductPrice('');
    setProductActive(true);
    setProductOrder(showcaseProducts.length);
    setProductImages([]);
    setShowProductModal(true);
  };

  const handleEditProductClick = (product: any) => {
    setEditingProduct(product);
    setProductName(product.name || '');
    setProductDescription(product.description || '');
    setProductPrice(product.price != null ? String(product.price) : '');
    setProductActive(product.active !== false);
    setProductOrder(product.order || 0);
    setProductImages(product.images || []);
    setShowProductModal(true);
  };

  const handleDeleteProduct = async (productId: string) => {
    if (!user) return;
    if (!window.confirm('Tem a certeza que deseja eliminar este item?')) return;
    try {
      await deleteDoc(doc(db, 'sellerPublicProfiles', user.uid, 'products', productId));
      alert('Item eliminado com sucesso!');
      fetchShowcaseProducts();
    } catch (err) {
      console.error('Error deleting product:', err);
      handleFirestoreError(err, OperationType.DELETE, `sellerPublicProfiles/${user.uid}/products/${productId}`);
    }
  };

  const uploadProductImage = async (file: File, index: number, targetProductId: string) => {
    if (!user) return;
    const updatedUploading = [...isUploadingProductImg];
    updatedUploading[index] = true;
    setIsUploadingProductImg(updatedUploading);

    try {
      const fileName = `image_${index}_${Date.now()}__${file.name.replace(/[^a-zA-Z0-9.]/g, "_")}`;
      const fileRef = ref(storage, `showcases/${user.uid}/products/${targetProductId}/${fileName}`);
      const uploadSnapshot = await uploadBytes(fileRef, file);
      const url = await getDownloadURL(uploadSnapshot.ref);

      const newImages = [...productImages];
      newImages[index] = url;
      // Filter out empty spaces and limit to 2
      const cleanedImages = newImages.filter(val => val);
      setProductImages(cleanedImages);
    } catch (err) {
      console.error('Error uploading product image:', err);
      alert('Erro ao carregar imagem: ' + err);
    } finally {
      const updatedUploadingDone = [...isUploadingProductImg];
      updatedUploadingDone[index] = false;
      setIsUploadingProductImg(updatedUploadingDone);
    }
  };

  const removeProductImage = (index: number) => {
    const newImages = [...productImages];
    newImages.splice(index, 1);
    setProductImages(newImages);
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !editingProduct) return;
    if (!productName.trim()) {
      alert('O nome do item é mandatório.');
      return;
    }
    if (!productDescription.trim()) {
      alert('A descrição do item é mandatória.');
      return;
    }

    setIsSavingProduct(true);
    try {
      const parsedPrice = productPrice.trim() !== '' ? parseFloat(productPrice) : null;
      const productRef = doc(db, 'sellerPublicProfiles', user.uid, 'products', editingProduct.id);
      
      const payload: any = {
        id: editingProduct.id,
        userId: user.uid,
        name: productName.trim(),
        description: productDescription.trim(),
        price: parsedPrice,
        images: productImages,
        active: productActive,
        order: Number(productOrder),
        createdAt: editingProduct.createdAt || serverTimestamp(),
        updatedAt: serverTimestamp()
      };

      await setDoc(productRef, payload, { merge: true });
      alert('Item guardado com sucesso!');
      setShowProductModal(false);
      setEditingProduct(null);
      fetchShowcaseProducts();
    } catch (err) {
      console.error('Error saving product:', err);
      handleFirestoreError(err, OperationType.WRITE, `sellerPublicProfiles/${user.uid}/products/${editingProduct.id}`);
    } finally {
      setIsSavingProduct(false);
    }
  };

  useEffect(() => {
    if (profile?.country === 'Reino Unido' || profile?.country === 'Portugal') {
      setAdsCountryTab(profile.country);
    }
  }, [profile?.country]);

  const ptAds = React.useMemo(() => {
    return ads.filter(ad => !ad.country || ad.country === 'Portugal');
  }, [ads]);

  const ukAds = React.useMemo(() => {
    return ads.filter(ad => ad.country === 'Reino Unido');
  }, [ads]);

  const [adInterests, setAdInterests] = useState<Record<string, { loading: boolean, data: any[] }>>({});
  const [expandedInterestsAdId, setExpandedInterestsAdId] = useState<string | null>(null);

  const handleToggleInterests = async (adId: string) => {
    if (expandedInterestsAdId === adId) {
      setExpandedInterestsAdId(null);
      return;
    }
    setExpandedInterestsAdId(adId);

    if (!user) return;

    setAdInterests(prev => ({ ...prev, [adId]: { loading: true, data: [] } }));
    try {
      const q = query(
        collection(db, 'adInterests'),
        where('adId', '==', adId),
        where('sellerId', '==', user.uid),
        limit(50)
      );
      
      const snapshot = await getDocs(q);
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      setAdInterests(prev => ({
        ...prev,
        [adId]: { loading: false, data: list }
      }));
    } catch (err) {
      console.error('[Profile] Erro ao buscar manual adInterests:', err);
      setAdInterests(prev => ({
        ...prev,
        [adId]: { loading: false, data: [] }
      }));
      handleFirestoreError(err, OperationType.GET, `adInterests/${adId}`);
    }
  };

  useEffect(() => {
    const fetchFavoriteAds = async () => {
      if (!user || !favorites || favorites.length === 0) {
        setFavoriteAds([]);
        setFavoritesLoading(false);
        return;
      }
      setFavoritesLoading(true);
      try {
        const q = query(
          collection(db, 'ads'),
          where('__name__', 'in', favorites.slice(0, 30))
        );
        const snapshot = await getDocsWithCacheFallback(q, `favorites/profile-${user.uid}`);
        const adsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Ad));
        setFavoriteAds(adsData);
      } catch (err) {
        console.error('Error loading favorite ads:', err);
        handleFirestoreError(err, OperationType.LIST, 'ads');
      } finally {
        setFavoritesLoading(false);
      }
    };

    if (currentTab === 'favorites') {
      fetchFavoriteAds();
    }
  }, [favorites, currentTab, user]);

  const fetchPurchasedAds = async () => {
    if (!user) return;
    setPurchasedAdsLoading(true);
    try {
      // Fetch reviewed ads by this user (to show "Já avaliado")
      const revQuery = query(
        collection(db, 'reviews'),
        where('reviewerId', '==', user.uid)
      );
      const revSnap = await getDocs(revQuery);
      const reviewedIds = new Set(revSnap.docs.map(doc => doc.data().adId));
      setReviewedAdIds(reviewedIds);

      const q = query(
        collection(db, 'ads'),
        where('buyerId', '==', user.uid),
       
        limit(50)
      );
      const querySnapshot = await getDocs(q);
      const adsData = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Ad));
      adsData.sort((a, b) => {
        const timeA = a.soldAt?.seconds ? a.soldAt.seconds * 1000 : (a.createdAt?.seconds ? a.createdAt.seconds * 1000 : 0);
        const timeB = b.soldAt?.seconds ? b.soldAt.seconds * 1000 : (b.createdAt?.seconds ? b.createdAt.seconds * 1000 : 0);
        return (timeB || 0) - (timeA || 0);
      });
      setPurchasedAds(adsData);
    } catch (err) {
      console.error('Error fetching purchased ads:', err);
      handleFirestoreError(err, OperationType.LIST, 'ads');
    } finally {
      setPurchasedAdsLoading(false);
    }
  };

  useEffect(() => {
  if (user) {
    fetchPurchasedAds();
  }
}, [user]);

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
      setShowcaseActive(profile.showcaseActive || false);
      setShowcaseName(profile.showcaseName || '');
      setShowcaseCategory(profile.showcaseCategory || '');
      setShowcaseLogo(profile.showcaseLogo || '');
      setShowcaseCover(profile.showcaseCover || '');
      setShowcaseDescription(profile.showcaseDescription || '');
      setShowcaseWhatsapp(profile.showcaseWhatsapp || profile.phone || '');
      setShowcaseFacebook(profile.showcaseFacebook || '');
      setShowcaseInstagram(profile.showcaseInstagram || '');
      setShowcasePlan(profile.showcasePlan || 'basic');
      fetchUserAds();
      fetchUserReviews(user?.uid || '');
      updateReferralStatsAndCredits();
      fetchShowcaseProducts();
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
      const q = query(collection(db, 'ads'), where('sellerId', '==', user.uid), limit(100));
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
      console.error('Error in fetchUserAds:', err);
      handleFirestoreError(err, OperationType.LIST, 'ads');
    } finally {
      setAdsLoading(false);
    }
  };

  const uploadShowcaseFile = async (file: File, type: 'logo' | 'cover'): Promise<string> => {
    const isLogo = type === 'logo';
    if (isLogo) setUploadingLogo(true);
    else setUploadingCover(true);

    try {
      const uniqueName = `showcases/${type}_${user?.uid}_${Date.now()}__${file.name.replace(/[^a-zA-Z0-9.]/g, "_")}`;
      const fileRef = ref(storage, uniqueName);
      const uploadSnapshot = await uploadBytes(fileRef, file);
      const downloadUrl = await getDownloadURL(uploadSnapshot.ref);
      return downloadUrl;
    } catch (err) {
      console.error('Erro no upload de showcase file:', err);
      alert('Ocorreu um erro ao fazer upload do ficheiro para o Firebase Storage.');
      throw err;
    } finally {
      if (isLogo) setUploadingLogo(false);
      else setUploadingCover(false);
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
      const digitsOnly = phone.replace(/\D/g, '').trim();
      if (digitsOnly.length < 7) {
        alert('Por favor, insira um número de telemóvel válido.');
        setLoading(false);
        return;
      }
      const fullPhone = `${countryCode}${digitsOnly}`.trim();

      // Verificar se o telemóvel já se encontra registado por outro utilizador
      const usersQuery = query(
        collection(db, 'users'),
        where('phone', '==', fullPhone)
      );
      const querySnap = await getDocs(usersQuery);
      const duplicateUser = querySnap.docs.find(doc => doc.id !== user.uid);
      if (duplicateUser) {
        alert('Este número de telemóvel já está associado a outro utilizador. Por favor, utilize outro número.');
        setLoading(false);
        return;
      }

      let generatedSlug = '';
      if (showcaseActive) {
        if (!showcaseName.trim()) {
          alert('Nome do negócio da Vitrine Digital é obrigatório.');
          setLoading(false);
          return;
        }
        if (!showcaseCategory.trim()) {
          alert('Categoria principal do negócio é obrigatória.');
          setLoading(false);
          return;
        }
        if (!showcaseLogo) {
          alert('Logotipo do negócio é obrigatório.');
          setLoading(false);
          return;
        }
        if (!showcaseDescription.trim()) {
          alert('Descrição do negócio é obrigatória.');
          setLoading(false);
          return;
        }
        if (!showcaseWhatsapp.trim()) {
          alert('Telemóvel (WhatsApp) do negócio é obrigatório.');
          setLoading(false);
          return;
        }
        const cleanedSlug = showcaseName
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-z0-9\s-]/g, '')
          .replace(/\s+/g, '-')
          .replace(/-+/g, '-')
          .trim()
          .replace(/(^-|-$)+/g, '');
        generatedSlug = `${cleanedSlug}-${user.uid.substring(0, 5)}`;
      }

      const showcasePayload = {
        showcaseActive,
        showcaseName: showcaseActive ? showcaseName : '',
        showcaseSlug: showcaseActive ? generatedSlug : '',
        showcaseCategory: showcaseActive ? showcaseCategory : '',
        showcaseLogo: showcaseActive ? showcaseLogo : '',
        showcaseCover: showcaseActive ? showcaseCover : '',
        showcaseDescription: showcaseActive ? showcaseDescription : '',
        showcaseWhatsapp: showcaseActive ? showcaseWhatsapp : '',
        showcaseFacebook: showcaseActive ? (showcaseFacebook || '') : '',
        showcaseInstagram: showcaseActive ? (showcaseInstagram || '') : '',
        showcasePlan: showcaseActive ? showcasePlan : 'basic',
      };

      // Use setDoc with merge: true to avoid "No document to update" if creation failed
      await setDoc(docRef, { 
        name, 
        phone: fullPhone, 
        city, 
        country,
        ...showcasePayload
      }, { merge: true });
      
      // Sincronizar para o perfil público (sellerPublicProfiles)
      try {
        const publicRef = doc(db, 'sellerPublicProfiles', user.uid);
        const publicSnap = await getDoc(publicRef);
        const now = new Date();
        const fallbackCreated = profile?.acceptedTermsAt ? (profile.acceptedTermsAt.toDate ? profile.acceptedTermsAt.toDate() : profile.acceptedTermsAt) : now;
        
        await setDoc(publicRef, {
          displayName: name,
          city: city,
          country: country,
          createdAt: publicSnap.exists() && publicSnap.data().createdAt ? publicSnap.data().createdAt : fallbackCreated,
          updatedAt: now,
          ...showcasePayload
        }, { merge: true });
      } catch (syncErr) {
        console.error('[Sync] Erro ao sincronizar para sellerPublicProfiles:', syncErr);
      }

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

  const handleMarkAsSoldOutside = async (adId: string) => {
    if (!window.confirm('Deseja marcar este anúncio como vendido fora da plataforma? O anúncio ficará com status de vendido e não exigirá avaliações.')) return;
    try {
      const adRef = doc(db, 'ads', adId);
      await updateDoc(adRef, {
        adStatus: 'sold',
        status: 'approved',
        soldOutsidePlatform: true,
        soldAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      clearHomeCache();
      alert('Anúncio marcado como vendido fora da plataforma!');
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
      {/* Tabs Selector Navigation */}
      <div className="flex bg-slate-100 p-1.5 rounded-2xl border border-slate-200 w-fit flex-row overflow-x-auto max-w-full" id="profile-tabs-selectors">
        <button
          onClick={() => navigate('/profile?tab=perfil')}
          className={`px-5 py-2.5 rounded-xl text-xs sm:text-sm font-black transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
            currentTab === 'perfil' || !['perfil', 'anuncios', 'favorites', 'compras', 'reviews'].includes(currentTab)
              ? 'bg-white text-indigo-600 shadow-sm'
              : 'text-slate-500 hover:text-slate-800'
          }`}
          id="btn-tab-perfil"
        >
          Meu Perfil
        </button>
        <button
          onClick={() => navigate('/profile?tab=anuncios')}
          className={`px-5 py-2.5 rounded-xl text-xs sm:text-sm font-black transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
            currentTab === 'anuncios'
              ? 'bg-white text-indigo-600 shadow-sm'
              : 'text-slate-500 hover:text-slate-800'
          }`}
          id="btn-tab-anuncios"
        >
          Meus Anúncios <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-black ml-1 scale-90 ${currentTab === 'anuncios' ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-200 text-slate-600'}`}>{ads.length}</span>
        </button>
        <button
          onClick={() => navigate('/profile?tab=reviews')}
          className={`px-5 py-2.5 rounded-xl text-xs sm:text-sm font-black transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
            currentTab === 'reviews'
              ? 'bg-white text-indigo-600 shadow-sm'
              : 'text-slate-500 hover:text-slate-800'
          }`}
          id="btn-tab-reviews"
        >
          Avaliações <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-black ml-1 scale-90 ${currentTab === 'reviews' ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-200 text-slate-600'}`}>{reviews.length}</span>
        </button>
        <button
          onClick={() => navigate('/profile?tab=compras')}
          className={`px-5 py-2.5 rounded-xl text-xs sm:text-sm font-black transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
            currentTab === 'compras'
              ? 'bg-white text-indigo-600 shadow-sm'
              : 'text-slate-500 hover:text-slate-800'
          }`}
          id="btn-tab-compras"
        >
          Compras <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-black ml-1 scale-90 ${currentTab === 'compras' ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-200 text-slate-600'}`}>{purchasedAds.length}</span>
        </button>
        <button
          onClick={() => navigate('/profile?tab=favorites')}
          className={`px-5 py-2.5 rounded-xl text-xs sm:text-sm font-black transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
            currentTab === 'favorites'
              ? 'bg-white text-indigo-600 shadow-sm'
              : 'text-slate-500 hover:text-slate-800'
          }`}
          id="btn-tab-favorites"
        >
          Favoritos <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-black ml-1 scale-90 ${currentTab === 'favorites' ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-200 text-slate-600'}`}>{favorites?.length || 0}</span>
        </button>
      </div>

      {(currentTab === 'perfil' || !['perfil', 'anuncios', 'favorites', 'compras', 'reviews'].includes(currentTab)) && (
        <div className="space-y-12" id="profile-perfil-tab-content">
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
          {/* DIVISOR DE VITRINE DIGITAL */}
          <div className="md:col-span-2 border-t border-slate-100 my-4 pt-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center text-indigo-600">
                <ShoppingBag size={20} />
              </div>
              <div>
                <h3 className="text-xl font-bold text-slate-900">Vitrine Digital para Empreendedores</h3>
                <p className="text-xs text-slate-500 mt-0.5">Ative a sua própria montra exclusiva de pequenos negócios no Mercado Luso</p>
              </div>
            </div>

            {/* TOGGLE DA VITRINE */}
            <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100 flex items-center justify-between gap-4 mb-6">
              <div>
                <span className="text-base font-bold text-slate-800 block">Ativar Minha Vitrine Digital</span>
                <span className="text-xs text-slate-500 block">Apenas negócios ativos serão listados na página pública de Empreendedores.</span>
              </div>
              <button
                type="button"
                onClick={() => setShowcaseActive(!showcaseActive)}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  showcaseActive ? 'bg-indigo-600' : 'bg-slate-200'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    showcaseActive ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* FORMULÁRIO COMPLETO SE ATIVO */}
            {showcaseActive && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2 overflow-hidden"
              >
                {/* Nome do Negócio */}
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700 uppercase tracking-wider">Nome do Negócio *</label>
                  <input
                    type="text"
                    value={showcaseName}
                    onChange={(e) => setShowcaseName(e.target.value)}
                    required={showcaseActive}
                    className="w-full px-4 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:border-indigo-600 focus:bg-white outline-none transition-all font-semibold"
                    placeholder="Nome da sua empresa ou negócio"
                  />
                  {showcaseName && (
                    <p className="text-xs text-indigo-500 font-mono">
                      Link da Vitrine: /empreendedores/{showcaseName.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').trim().replace(/(^-|-$)+/g, '')}-{user?.uid.substring(0, 5)}
                    </p>
                  )}
                </div>

                {/* Categoria Principal */}
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700 uppercase tracking-wider">Categoria Principal *</label>
                  <select
                    value={showcaseCategory}
                    onChange={(e) => setShowcaseCategory(e.target.value)}
                    required={showcaseActive}
                    className="w-full px-4 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:border-indigo-600 focus:bg-white outline-none transition-all font-semibold cursor-pointer appearance-none text-slate-700"
                  >
                    <option value="">Selecione a categoria principal</option>
                    <option value="Restauração & Alimentos">🍕 Restauração & Alimentos</option>
                    <option value="Beleza & Estética">💄 Beleza & Estética</option>
                    <option value="Serviços Profissionais">💼 Serviços Profissionais</option>
                    <option value="Construção & Reformas">🛠️ Construção & Reformas</option>
                    <option value="Comércio & Lojas">🛍️ Comércio & Lojas</option>
                    <option value="Tecnologia & Digital">💻 Tecnologia & Digital</option>
                    <option value="Turismo & Lazer">✈️ Turismo & Lazer</option>
                    <option value="Outros">🌟 Outros</option>
                  </select>
                </div>

                {/* WhatsApp do Negócio */}
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700 uppercase tracking-wider">Telemóvel / WhatsApp do Negócio *</label>
                  <input
                    type="text"
                    value={showcaseWhatsapp}
                    onChange={(e) => setShowcaseWhatsapp(e.target.value)}
                    required={showcaseActive}
                    className="w-full px-4 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:border-indigo-600 focus:bg-white outline-none transition-all font-semibold"
                    placeholder="Ex: +351 912 345 678"
                  />
                  <p className="text-xs text-slate-400">Insira com o código do país (ex: +351 para Portugal, +44 para Reino Unido).</p>
                </div>

                {/* Facebook */}
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700 uppercase tracking-wider">Facebook (Opcional)</label>
                  <input
                    type="url"
                    value={showcaseFacebook}
                    onChange={(e) => setShowcaseFacebook(e.target.value)}
                    className="w-full px-4 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:border-indigo-600 focus:bg-white outline-none transition-all font-semibold"
                    placeholder="Link da sua página (ex: facebook.com/suapagina)"
                  />
                </div>

                {/* Instagram */}
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700 uppercase tracking-wider">Instagram (Opcional)</label>
                  <input
                    type="url"
                    value={showcaseInstagram}
                    onChange={(e) => setShowcaseInstagram(e.target.value)}
                    className="w-full px-4 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:border-indigo-600 focus:bg-white outline-none transition-all font-semibold"
                    placeholder="Link do seu perfil (ex: instagram.com/seuusuario)"
                  />
                </div>

                <div className="hidden md:block">
                  {/* Spacing layout keeper */}
                </div>

                {/* Logotipo */}
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700 uppercase tracking-wider font-sans block">Logotipo do Negócio (1:1) *</label>
                  
                  <div className="flex gap-4 items-center bg-slate-50 p-4 border-2 border-slate-100 rounded-2xl">
                    <div className="w-20 h-20 shrink-0 bg-slate-200 border border-slate-200 rounded-2xl flex items-center justify-center overflow-hidden">
                      {showcaseLogo && showcaseLogo.trim() !== '' ? (
                        <img src={showcaseLogo || null} alt="Logo preview" className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-2xl">🏬</span>
                      )}
                    </div>
                    
                    <div className="flex-1 space-y-2">
                      <input
                        type="file"
                        accept="image/*"
                        id="showcase-logo-picker"
                        className="hidden"
                        onChange={async (e) => {
                          if (e.target.files && e.target.files[0]) {
                            try {
                              const url = await uploadShowcaseFile(e.target.files[0], 'logo');
                              setShowcaseLogo(url);
                            } catch (err) {
                              console.error(err);
                            }
                          }
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => document.getElementById('showcase-logo-picker')?.click()}
                        disabled={uploadingLogo}
                        className="px-4 py-2 text-xs font-black rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-600 transition-colors disabled:opacity-50"
                      >
                        {uploadingLogo ? 'A carregar...' : 'Selecionar logotipo'}
                      </button>
                      <p className="text-[10px] text-slate-400 block">Ficheiro quadrado (PNG ou JPG) recomendado.</p>
                    </div>
                  </div>
                </div>

                {/* Imagem de Capa */}
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700 uppercase tracking-wider font-sans block">Imagem de Capa (Opcional)</label>
                  
                  <div className="flex gap-4 items-center bg-slate-50 p-4 border-2 border-slate-100 rounded-2xl">
                    <div className="w-20 h-12 shrink-0 bg-slate-200 border border-slate-200 rounded-xl flex items-center justify-center overflow-hidden">
                      {showcaseCover && showcaseCover.trim() !== '' ? (
                        <img src={showcaseCover || null} alt="Cover preview" className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-lg">🖼️</span>
                      )}
                    </div>
                    
                    <div className="flex-1 space-y-2">
                      <input
                        type="file"
                        accept="image/*"
                        id="showcase-cover-picker"
                        className="hidden"
                        onChange={async (e) => {
                          if (e.target.files && e.target.files[0]) {
                            try {
                              const url = await uploadShowcaseFile(e.target.files[0], 'cover');
                              setShowcaseCover(url);
                            } catch (err) {
                              console.error(err);
                            }
                          }
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => document.getElementById('showcase-cover-picker')?.click()}
                        disabled={uploadingCover}
                        className="px-4 py-2 text-xs font-black rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-600 transition-colors disabled:opacity-50"
                      >
                        {uploadingCover ? 'A carregar...' : 'Selecionar capa'}
                      </button>
                      <p className="text-[10px] text-slate-400 block">Imagem horizontal (1200x400) recomendada.</p>
                    </div>
                  </div>
                </div>

                {/* Descrição */}
                <div className="md:col-span-2 space-y-2">
                  <label className="text-sm font-bold text-slate-700 uppercase tracking-wider">Descrição do Negócio / Quem Somos *</label>
                  <textarea
                    value={showcaseDescription}
                    onChange={(e) => setShowcaseDescription(e.target.value)}
                    required={showcaseActive}
                    rows={4}
                    className="w-full px-4 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:border-indigo-600 focus:bg-white outline-none transition-all font-semibold resize-none text-sm text-slate-800"
                    placeholder="Fale brevemente do seu negócio, os produtos ou serviços que vende e os seus diferenciais competitivos..."
                  />
                </div>

                {/* Plano da Vitrine Digital */}
                <div className="md:col-span-2 bg-indigo-50/50 p-6 border border-indigo-150 rounded-2xl space-y-3 mt-2">
                  <label className="text-sm font-black text-indigo-950 uppercase tracking-wider block">Plano da Vitrine Digital</label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <button
                      type="button"
                      onClick={() => setShowcasePlan('basic')}
                      className={`p-4 rounded-xl border-2 text-left flex flex-col justify-between transition-all ${
                        showcasePlan === 'basic'
                          ? 'border-indigo-600 bg-white ring-2 ring-indigo-100'
                          : 'border-slate-200 bg-slate-50 hover:bg-slate-100'
                      }`}
                    >
                      <div>
                        <span className="font-bold text-slate-900 text-sm block">Plano Básico (Grátis)</span>
                        <span className="text-xs text-slate-500 mt-1 block">Limite Máximo: Até 5 produtos ou serviços</span>
                      </div>
                      <span className="text-[10px] text-indigo-600 font-extrabold mt-3 uppercase tracking-wide">
                        {showcasePlan === 'basic' ? '✅ Ativo' : 'Selecionar'}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowcasePlan('premium')}
                      className={`p-4 rounded-xl border-2 text-left flex flex-col justify-between transition-all ${
                        showcasePlan === 'premium'
                          ? 'border-indigo-600 bg-white ring-2 ring-indigo-100'
                          : 'border-slate-200 bg-slate-50 hover:bg-slate-100'
                      }`}
                    >
                      <div>
                        <span className="font-bold text-slate-900 text-sm block">Plano Premium</span>
                        <span className="text-xs text-slate-500 mt-1 block">Limite Máximo: Até 10 produtos ou serviços</span>
                      </div>
                      <span className="text-[10px] text-indigo-600 font-extrabold mt-3 uppercase tracking-wide">
                        {showcasePlan === 'premium' ? '✅ Ativo' : 'Selecionar'}
                      </span>
                    </button>
                  </div>
                </div>

                {/* PRODUTOS E SERVIÇOS DA VITRINE */}
                <div className="md:col-span-2 border-t border-slate-150 my-6 pt-6 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div>
                      <h4 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                        📦 Produtos e Serviços da Vitrine
                        <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-100 text-slate-600">
                          {showcaseProducts.length} / {showcasePlan === 'premium' ? 10 : 5}
                        </span>
                      </h4>
                      <p className="text-xs text-slate-500 mt-0.5">Cadastre e organize os itens que quer mostrar diretamente na sua Vitrine Digital pública.</p>
                    </div>
                    <button
                      type="button"
                      onClick={handleAddProductClick}
                      className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs transition-colors flex items-center justify-center gap-2 shadow-sm"
                    >
                      <Plus size={16} />
                      Adicionar Item
                    </button>
                  </div>

                  {productsLoading ? (
                    <div className="p-8 text-center text-slate-400 text-xs">A carregar itens da vitrine...</div>
                  ) : showcaseProducts.length === 0 ? (
                    <div className="p-8 border-2 border-dashed border-slate-150 rounded-2xl text-center text-slate-400 text-sm">
                      Ainda não cadastrou produtos ou serviços para a sua Vitrine Digital. O limite do seu plano é de até {showcasePlan === 'premium' ? 10 : 5} itens.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {showcaseProducts.map((p) => (
                        <div key={p.id} className="p-4 bg-white border border-slate-150 rounded-2xl flex gap-3 shadow-xs items-center justify-between">
                          <div className="flex gap-3 items-center min-w-0">
                            <div className="w-16 h-16 rounded-xl bg-slate-100 overflow-hidden shrink-0 flex items-center justify-center border border-slate-100">
                              {p.images && p.images[0] ? (
                                <img src={p.images[0]} alt={p.name} className="w-full h-full object-cover" />
                              ) : (
                                <span className="text-lg text-slate-400">📦</span>
                              )}
                            </div>
                            <div className="min-w-0">
                              <h5 className="font-bold text-slate-900 truncate text-sm">{p.name}</h5>
                              <p className="text-xs text-slate-500 line-clamp-1 mt-0.5">{p.description}</p>
                              <div className="flex items-center gap-2 mt-1">
                                {p.price != null && (
                                  <span className="text-xs font-semibold text-indigo-600">{formatPrice(p.price)}</span>
                                )}
                                <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-bold ${
                                  p.active ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'
                                }`}>
                                  {p.active ? 'Ativo' : 'Inativo'}
                                </span>
                              </div>
                            </div>
                          </div>
                          
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => handleEditProductClick(p)}
                              className="p-2 text-slate-500 hover:text-slate-950 hover:bg-slate-50 rounded-lg transition-all"
                              title="Editar"
                            >
                              <Edit size={16} />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteProduct(p.id)}
                              className="p-2 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition-all"
                              title="Eliminar"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* ESTATÍSTICAS DA VITRINE */}
                <div className="md:col-span-2 border-t border-slate-150 pt-6">
                  <ShowcaseStats sellerId={user?.uid || ''} products={showcaseProducts} />
                </div>
              </motion.div>
            )}
          </div>

          <div className="md:col-span-2">
            <button
              type="submit"
              disabled={loading || uploadingLogo || uploadingCover}
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
        </div>
      )}

      {currentTab === 'anuncios' && (
        <div className="space-y-12" id="profile-anuncios-tab-content">
          <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            Meus Anúncios
            <span className="bg-slate-200 text-slate-600 text-sm px-3 py-1 rounded-full">{ads.length}</span>
          </h2>

          {/* Sub-abas de divisão por país */}
          <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 w-fit gap-1" id="ads-country-sub-tabs">
            <button
              onClick={() => setAdsCountryTab('Portugal')}
              className={`px-4 py-2 rounded-lg text-xs font-black transition-all cursor-pointer flex items-center gap-2 whitespace-nowrap ${
                adsCountryTab === 'Portugal'
                  ? 'bg-white text-indigo-600 shadow-sm border border-slate-200/50'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
              id="btn-sub-tab-portugal"
            >
              <span>🇵🇹</span> Portugal
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-black ${
                adsCountryTab === 'Portugal' ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-200/80 text-slate-600'
              }`}>
                {ptAds.length}
              </span>
            </button>
            <button
              onClick={() => setAdsCountryTab('Reino Unido')}
              className={`px-4 py-2 rounded-lg text-xs font-black transition-all cursor-pointer flex items-center gap-2 whitespace-nowrap ${
                adsCountryTab === 'Reino Unido'
                  ? 'bg-white text-indigo-600 shadow-sm border border-slate-200/50'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
              id="btn-sub-tab-uk"
            >
              <span>🇬🇧</span> Reino Unido
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-black ${
                adsCountryTab === 'Reino Unido' ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-200/80 text-slate-600'
              }`}>
                {ukAds.length}
              </span>
            </button>
          </div>
        </div>

        {adsLoading ? (
          <div className="text-center py-12 text-slate-400">A carregar anúncios...</div>
        ) : (adsCountryTab === 'Portugal' ? ptAds : ukAds).length === 0 ? (
          <div className="bg-white p-12 rounded-3xl text-center border-2 border-dashed border-slate-200">
            <p className="text-slate-500 mb-4">
              {ads.length === 0 
                ? 'Ainda não publicou nenhum anúncio.' 
                : `Ainda não publicou nenhum anúncio em ${adsCountryTab}.`}
            </p>
            <button
              onClick={() => navigate('/create-ad')}
              className="bg-indigo-600 text-white px-8 py-3 rounded-xl font-bold hover:bg-indigo-700 transition-all"
            >
              Criar Primeiro Anúncio
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {(adsCountryTab === 'Portugal' ? ptAds : ukAds).map((ad, idx) => {
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
                      <div className="flex flex-col gap-2 mt-3 text-center">
                        <button
                          onClick={() => {
                            setSelectedAdForReview(ad);
                            setIsBuyerRating(false);
                            setShowReviewModal(true);
                          }}
                          className="w-full flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-bold bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition-all border border-emerald-100 cursor-pointer"
                        >
                          <ShoppingBag size={14} /> Marcar como Vendido (com avaliação)
                        </button>
                        <button
                          onClick={() => handleMarkAsSoldOutside(ad.id)}
                          className="w-full flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-bold bg-slate-50 text-slate-600 hover:bg-slate-100 transition-all border border-slate-200 cursor-pointer"
                        >
                          <Globe size={14} /> Vendido fora da plataforma
                        </button>
                      </div>
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

                  {/* Interessados Section */}
                  <button
                    onClick={() => handleToggleInterests(ad.id)}
                    className="mt-2 w-full flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-bold bg-indigo-50/50 text-indigo-700 hover:bg-indigo-50 border border-slate-200 transition-all cursor-pointer"
                  >
                    <span>👥</span>
                    <span>
                      {expandedInterestsAdId === ad.id ? 'Ocultar Interessados' : 'Ver Interessados'}
                    </span>
                  </button>

                  {/* Expanded Interests List */}
                  {expandedInterestsAdId === ad.id && (
                    <div className="mt-3 p-3 bg-slate-50 rounded-2xl border border-slate-100 text-xs">
                      <div className="flex justify-between items-center mb-2 font-bold text-slate-700">
                        <span>Interessados ({adInterests[ad.id]?.data?.length || 0})</span>
                      </div>
                      {adInterests[ad.id]?.loading ? (
                        <div className="py-3 text-center text-slate-400">Aprimorando consulta...</div>
                      ) : !adInterests[ad.id]?.data || adInterests[ad.id]?.data.length === 0 ? (
                        <div className="py-3 text-center text-slate-400">Ainda sem interessados registados neste anúncio.</div>
                      ) : (
                        <div className="max-h-40 overflow-y-auto space-y-2">
                          {adInterests[ad.id].data.map((interest: any, subIdx: number) => {
                            const contactDate = interest.createdAt?.toDate 
                              ? format(interest.createdAt.toDate(), "dd/MM/yyyy HH:mm")
                              : 'Recentemente';
                            return (
                              <div key={interest.id || subIdx} className="bg-white p-2 rounded-xl border border-slate-100 flex justify-between items-center gap-2">
                                <div className="min-w-0">
                                  <p className="font-semibold text-slate-800 truncate">{interest.interestedUserName}</p>
                                  <p className="text-[10px] text-slate-400">Contacto: {contactDate}</p>
                                </div>
                                <span className="text-[10px] bg-emerald-50 text-emerald-600 px-2 py-0.5 rounded-full font-bold uppercase tracking-wide shrink-0">
                                  WhatsApp
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </motion.div>
            );
          })}
          </div>
        )}
      </div>
        </div>
      )}

      {currentTab === 'reviews' && (
        <div className="space-y-6" id="reviews-tab-content">
          <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            Avaliações Recebidas
            <span className="bg-amber-100 text-amber-800 text-sm px-3 py-1 rounded-full">{reviews.length}</span>
          </h2>

          {reviewsLoading ? (
            <div className="text-center py-12 text-slate-400">A carregar avaliações...</div>
          ) : reviews.length === 0 ? (
            <div className="bg-white p-16 rounded-3xl text-center border-2 border-dashed border-slate-200" id="no-reviews-box">
              <span className="text-4xl text-amber-400">★</span>
              <p className="text-slate-500 mt-4 font-semibold">Ainda não recebeu nenhuma avaliação.</p>
            </div>
          ) : (
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
          )}
        </div>
      )}

      {currentTab === 'favorites' && (
        <div className="space-y-6" id="favorites-tab-content">
          <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            Anúncios Favoritos
            <span className="bg-[#bfead0] text-emerald-800 text-sm px-3 py-1 rounded-full font-bold">{favoriteAds.length}</span>
          </h2>

          {favoritesLoading ? (
            <div className="text-center py-12 text-slate-400">A carregar anúncios favoritos...</div>
          ) : favoriteAds.length === 0 ? (
            <div className="bg-white p-16 rounded-3xl text-center border-2 border-dashed border-slate-200" id="no-favorites-box">
              <span className="text-4xl">❤️</span>
              <p className="text-slate-500 mt-4 mb-4 font-semibold">Ainda não marcou nenhum anúncio como favorito.</p>
              <button
                onClick={() => navigate('/')}
                className="bg-indigo-600 text-white px-8 py-3 rounded-xl font-bold hover:bg-indigo-700 transition-all cursor-pointer shadow-md shadow-indigo-100"
              >
                Explorar Anúncios
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-fade-in" id="favorites-ads-grid">
              {favoriteAds.map((ad, idx) => (
                <AdCard key={`fav-ad-card-${ad.id || idx}`} ad={ad} />
              ))}
            </div>
          )}
        </div>
      )}

      {currentTab === 'compras' && (
        <div className="space-y-6" id="compras-tab-content">
          <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            Minhas Compras
            <span className="bg-indigo-100 text-indigo-800 text-sm px-3 py-1 rounded-full font-bold">{purchasedAds.length}</span>
          </h2>

          {purchasedAdsLoading ? (
            <div className="text-center py-12 text-slate-400">A carregar o seu histórico de compras...</div>
          ) : purchasedAds.length === 0 ? (
            <div className="bg-white p-16 rounded-3xl text-center border-2 border-dashed border-slate-200" id="no-compras-box">
              <span className="text-4xl">🛍️</span>
              <p className="text-slate-500 mt-4 mb-4 font-semibold">Ainda não efetuou nenhuma compra na plataforma.</p>
              <button
                onClick={() => navigate('/')}
                className="bg-indigo-600 text-white px-8 py-3 rounded-xl font-bold hover:bg-indigo-700 transition-all cursor-pointer shadow-md shadow-indigo-100"
              >
                Explorar Anúncios
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-fade-in" id="purchased-ads-grid">
              {purchasedAds.map((ad, idx) => {
                const soldDate = ad.soldAt?.toDate ? ad.soldAt.toDate() : (ad.soldAt ? new Date(ad.soldAt) : null);
                const dateLabel = soldDate 
                  ? format(soldDate, "dd 'de' MMMM 'de' yyyy", { locale: pt }) 
                  : 'Recém-adquirido';

                return (
                  <div key={`purchased-ad-${ad.id || idx}`} className="bg-white rounded-3xl border border-slate-100 shadow-lg hover:shadow-xl transition-all overflow-hidden flex flex-col h-full">
                    <div className="relative h-48 w-full bg-slate-100 overflow-hidden">
                      {ad.imageUrl ? (
                        <OptimizedImage 
                          src={ad.imageUrl} 
                          alt={ad.title} 
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-slate-50 text-slate-400">
                          Sem Imagem
                        </div>
                      )}
                      <span className="absolute top-4 right-4 bg-indigo-600 text-white text-[10px] font-black uppercase tracking-wider px-3 py-1.5 rounded-full shadow-lg">
                        Adquirido
                      </span>
                    </div>

                    <div className="p-6 flex flex-col flex-1 gap-2">
                      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex justify-between">
                        <span>{ad.category}</span>
                        <span>{ad.city}</span>
                      </div>
                      
                      <h3 className="font-bold text-slate-900 text-lg line-clamp-1">{ad.title}</h3>
                      
                      {ad.price !== undefined && (
                        <p className="font-extrabold text-[#006600] text-xl">
                          {formatPrice(ad.price, ad.country || 'Portugal')}
                        </p>
                      )}

                      <div className="border-t border-slate-100 my-2 pt-3 flex flex-col gap-1 text-xs text-slate-500">
                        <div className="flex justify-between">
                          <span>Vendedor:</span>
                          <span className="font-bold text-slate-800">{ad.sellerName || 'Vendedor'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Data da compra:</span>
                          <span className="font-medium text-slate-400">{dateLabel}</span>
                        </div>
                      </div>

                      {reviewedAdIds.has(ad.id) ? (
                        <button
                          disabled
                          className="mt-4 w-full flex items-center justify-center gap-2 py-3 rounded-2xl text-xs font-bold bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed"
                        >
                          <CheckCircle size={14} className="text-slate-400" /> 
                          Já avaliado
                        </button>
                      ) : (
                        <button
                          onClick={() => {
                            setSelectedAdForReview(ad);
                            setIsBuyerRating(true);
                            setShowReviewModal(true);
                          }}
                          className="mt-4 w-full flex items-center justify-center gap-2 py-3 rounded-2xl text-xs font-black bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-all border border-indigo-100 group"
                        >
                          <Star size={14} className="fill-indigo-100 group-hover:fill-indigo-200 group-hover:scale-110 transition-all text-indigo-600" /> 
                          Avaliar vendedor
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

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
          sellerId={selectedAdForReview.sellerId || ''}
          sellerName={selectedAdForReview.sellerName || ''}
          isBuyerRating={isBuyerRating}
          onSuccess={() => {
            if (isBuyerRating) {
              fetchPurchasedAds();
              alert('Obrigado! Avaliação enviada com sucesso.');
            } else {
              fetchUserAds();
              alert('Parabéns pela venda! O seu anúncio foi finalizado com sucesso.');
            }
          }}
        />
      )}

      {/* MODAL CADASTRAR/EDITAR ITEM DA VITRINE */}
      {showProductModal && editingProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-3xl w-full max-w-xl shadow-2xl overflow-hidden border border-slate-100 flex flex-col max-h-[90vh]"
          >
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
              <h3 className="text-lg font-bold text-slate-900">
                {productName ? `Editar: ${productName}` : 'Adicionar Item à Vitrine'}
              </h3>
              <button
                type="button"
                onClick={() => {
                  setShowProductModal(false);
                  setEditingProduct(null);
                }}
                className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-400 hover:text-slate-600"
              >
                <XCircle size={20} />
              </button>
            </div>

            {/* Modal Body (Scrollable) */}
            <form onSubmit={handleSaveProduct} className="p-6 overflow-y-auto space-y-4">
              {/* Nome */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">Nome do Produto/Serviço *</label>
                <input
                  type="text"
                  value={productName}
                  onChange={(e) => setProductName(e.target.value)}
                  required
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-indigo-600 focus:bg-white outline-none transition-all font-semibold"
                  placeholder="Ex: Bolo de Chocolate Personalizado"
                />
              </div>

              {/* Descrição */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">Descrição *</label>
                <textarea
                  value={productDescription}
                  onChange={(e) => setProductDescription(e.target.value)}
                  required
                  rows={3}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-indigo-600 focus:bg-white outline-none transition-all text-sm resize-none"
                  placeholder="Descreva detalhes como ingredientes, prazos ou especificações..."
                />
              </div>

              {/* Preço & Ordem & Ativo em uma fila */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">Preço Opcional (€ / £)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={productPrice}
                    onChange={(e) => setProductPrice(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-indigo-600 focus:bg-white outline-none transition-all font-semibold"
                    placeholder="Ex: 25.00 (sob consulta se vazio)"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">Ordem de Exibição (0, 1...)</label>
                  <input
                    type="number"
                    min="0"
                    value={productOrder}
                    onChange={(e) => setProductOrder(parseInt(e.target.value) || 0)}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-indigo-600 focus:bg-white outline-none transition-all font-semibold"
                  />
                </div>
              </div>

              {/* Status Ativo/Inativo */}
              <div className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-xl">
                <div>
                  <span className="text-sm font-bold text-slate-700 block">Item Ativo</span>
                  <span className="text-[10px] text-slate-400">Itens inativos não serão exibidos aos clientes.</span>
                </div>
                <button
                  type="button"
                  onClick={() => setProductActive(!productActive)}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    productActive ? 'bg-emerald-500' : 'bg-slate-300'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      productActive ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* Fotos (Até 2) */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-600 uppercase tracking-wider block">Fotos do Item (Até 2)</label>
                <div className="grid grid-cols-2 gap-4">
                  {[0, 1].map((idx) => {
                    const currentImg = productImages[idx];
                    const isUploading = isUploadingProductImg[idx];
                    return (
                      <div key={`product-img-upload-${idx}`} className="border-2 border-dashed border-slate-200 rounded-2xl aspect-[4/3] flex flex-col items-center justify-center relative overflow-hidden bg-slate-50">
                        {currentImg ? (
                          <>
                            <img src={currentImg} alt={`Foto ${idx + 1}`} className="w-full h-full object-cover" />
                            <div className="absolute top-2 right-2 flex gap-1">
                              <button
                                type="button"
                                onClick={() => removeProductImage(idx)}
                                className="p-1 px-2 text-[10px] font-black uppercase text-white bg-rose-600 hover:bg-rose-700 rounded-lg shadow"
                              >
                                Remover
                              </button>
                            </div>
                          </>
                        ) : (
                          <div className="p-3 text-center space-y-2 flex flex-col items-center">
                            <span className="text-2xl">📸</span>
                            <span className="text-[9px] font-bold text-slate-400 block line-clamp-2">Foto {idx + 1}</span>
                            <input
                              type="file"
                              accept="image/*"
                              id={`product-image-picker-${idx}`}
                              className="hidden"
                              onChange={(e) => {
                                if (e.target.files && e.target.files[0]) {
                                  uploadProductImage(e.target.files[0], idx, editingProduct.id);
                                }
                              }}
                            />
                            <button
                              type="button"
                              disabled={isUploading}
                              onClick={() => document.getElementById(`product-image-picker-${idx}`)?.click()}
                              className="px-2 py-1 text-[9px] font-black rounded bg-indigo-50 hover:bg-indigo-100 text-indigo-600 disabled:opacity-50"
                            >
                              {isUploading ? 'A carregar...' : 'Fazer Upload'}
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Action buttons */}
              <div className="pt-4 border-t border-slate-100 flex gap-3 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setShowProductModal(false);
                    setEditingProduct(null);
                  }}
                  className="w-1/2 py-3 bg-slate-150 text-slate-700 font-bold rounded-xl text-sm hover:bg-slate-200 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSavingProduct || isUploadingProductImg.some(Boolean)}
                  className="w-1/2 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-sm transition-colors disabled:opacity-50"
                >
                  {isSavingProduct ? 'A guardar...' : 'Guardar Item'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </div>
  );
};

export default Profile;
