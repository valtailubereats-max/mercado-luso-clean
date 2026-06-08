import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { doc, getDoc, setDoc, updateDoc, collection, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { db, storage, handleFirestoreError, OperationType, getDocWithCacheFallback } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';
import { clearHomeCache } from '../utils/cache';
import { CITIES, Ad, MarketplaceSettings, PORTUGAL_CITIES, UK_CITIES } from '../types';
import { SearchableCitySelect } from '../components/SearchableCitySelect';
import { motion, AnimatePresence } from 'motion/react';
import { Image as ImageIcon, Tag, MapPin, Euro, FileText, ChevronLeft, Upload, X, Plus, RefreshCcw } from 'lucide-react';
import { compressImage } from '../lib/imageUtils';

const CreateAd = () => {
  const { categories } = useSettings();
  const { id } = useParams();
  const { user, profile, isAdmin, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [originalAd, setOriginalAd] = useState<Ad | null>(null);

  const prefill = location.state?.prefill;

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/login');
    }
  }, [user, authLoading]);

  const [formData, setFormData] = useState({
    title: prefill?.title || '',
    description: prefill?.description || '',
    price: prefill?.price?.toString() || '',
    images: [] as string[],
    city: prefill?.city || PORTUGAL_CITIES[0],
    country: (prefill?.country || 'Portugal') as 'Portugal' | 'Reino Unido',
    category: prefill?.category || categories[0] || 'Outros',
    plan: 'free' as 'free' | 'intermediate' | 'premium',
    duration: 30, // Default for free
    contactEmail: '',
    externalUrl: '',
    sellerPhone: prefill?.sellerPhone || ''
  });

  const [imagePositionX, setImagePositionX] = useState<number>(50);
  const [imagePositionY, setImagePositionY] = useState<number>(50);
  const [imageZoom, setImageZoom] = useState<number>(1);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isDraggingImage, setIsDraggingImage] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0, posX: 50, posY: 50 });

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setIsDraggingImage(true);
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      posX: imagePositionX,
      posY: imagePositionY
    };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingImage || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const deltaX = e.clientX - dragStartRef.current.x;
    const deltaY = e.clientY - dragStartRef.current.y;

    const scaleFactor = imageZoom > 1 ? 1 / imageZoom : 1.5;
    const shiftX = (deltaX / rect.width) * 100 * scaleFactor;
    const shiftY = (deltaY / rect.height) * 100 * scaleFactor;

    const nextX = Math.min(100, Math.max(0, dragStartRef.current.posX - shiftX));
    const nextY = Math.min(100, Math.max(0, dragStartRef.current.posY - shiftY));

    setImagePositionX(Math.round(nextX));
    setImagePositionY(Math.round(nextY));
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isDraggingImage) {
      e.currentTarget.releasePointerCapture(e.pointerId);
      setIsDraggingImage(false);
    }
  };

  const getAdImageStyle = (x: number, y: number, z: number) => {
    const scale = z;
    const translateX = scale > 1 ? ((x - 50) * (scale - 1)) / scale : 0;
    const translateY = scale > 1 ? ((y - 50) * (scale - 1)) / scale : 0;
    return {
      objectPosition: `${x}% ${y}%`,
      transform: `scale(${scale}) translate(${translateX}%, ${translateY}%)`,
    };
  };

  const handleCountryChange = (newCountry: 'Portugal' | 'Reino Unido') => {
    const defaultCity = newCountry === 'Reino Unido' ? UK_CITIES[0] : PORTUGAL_CITIES[0];
    
    setFormData(prev => ({
      ...prev,
      country: newCountry,
      city: defaultCity
    }));
  };
  const [settings, setSettings] = useState<MarketplaceSettings | null>(null);
  const [uploading, setUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const uploadRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchSettings();
    if (id) {
      fetchAd();
    }
  }, [id]);

  const fetchSettings = async () => {
    try {
      const settingsSnap = await getDocWithCacheFallback(doc(db, 'settings', 'global'), 'settings/global');
      if (settingsSnap.exists()) {
        setSettings(settingsSnap.data());
      }
    } catch (err) {
      console.error('Error fetching settings:', err);
    }
  };

  const prefilledFromProfileRef = useRef(false);

  useEffect(() => {
    if (!id && !prefill && !authLoading && !prefilledFromProfileRef.current) {
      prefilledFromProfileRef.current = true;
      const saved = localStorage.getItem('selectedCountry') as 'Portugal' | 'Reino Unido' | null;
      let targetCountry: 'Portugal' | 'Reino Unido' = 'Portugal';
      
      if (profile?.country === 'Portugal' || profile?.country === 'Reino Unido') {
        targetCountry = profile.country;
      } else if (saved === 'Portugal' || saved === 'Reino Unido') {
        targetCountry = saved;
      }
      
      let targetCity = targetCountry === 'Reino Unido' ? UK_CITIES[0] : PORTUGAL_CITIES[0];
      if (profile?.city) {
        targetCity = profile.city;
      }
      
      setFormData(prev => ({
        ...prev,
        country: targetCountry,
        city: targetCity
      }));
    }
  }, [profile, authLoading, id, prefill]);

  const fetchAd = async () => {
    setFetching(true);
    try {
      const docRef = doc(db, 'ads', id!);
      const docSnap = await getDocWithCacheFallback(docRef, `ads/${id}`);
      if (docSnap.exists()) {
        const data = docSnap.data() as Ad;
        if (data.sellerId !== user?.uid && !isAdmin) {
          navigate('/');
          return;
        }
        setOriginalAd(data);
        setFormData({
          title: data.title,
          description: data.description,
          price: data.price?.toString() || '',
          images: data.images || (data.imageUrl ? [data.imageUrl] : []),
          city: data.city,
          country: data.country || 'Portugal',
          category: data.category,
          plan: data.plan || 'free',
          duration: 30, // Duration is only used for calculation on submit
          contactEmail: data.contactEmail || '',
          externalUrl: data.externalUrl || '',
          sellerPhone: data.sellerPhone || ''
        });
        setImagePositionX(data.imagePositionX !== undefined ? data.imagePositionX : 50);
        setImagePositionY(data.imagePositionY !== undefined ? data.imagePositionY : 50);
        setImageZoom(data.imageZoom !== undefined ? data.imageZoom : 1);
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, `ads/${id}`);
    } finally {
      setFetching(false);
    }
  };

  const maxAllowed = React.useMemo(() => {
    if (formData.category === 'Imigração') return 2;
    if (!settings) return 1;
    return settings.maxImages?.[formData.plan] || (formData.plan === 'free' ? 1 : formData.plan === 'intermediate' ? 3 : 5);
  }, [settings, formData.plan, formData.category]);

  // Se o utilizador selecionar 'Imigração' mas tiver mais do que 2 imagens do produto, corta para 2.
  useEffect(() => {
    if (formData.category === 'Imigração' && formData.images.length > 2) {
      alert('A categoria Imigração permite apenas 2 fotos. As imagens excedentes foram removidas.');
      setFormData(prev => ({
        ...prev,
        images: prev.images.slice(0, 2)
      }));
    }
  }, [formData.category]);

  const processFiles = async (files: File[]) => {
    if (uploadRef.current) return;

    const currentImagesCount = formData.images.length;
    const remainingSlots = maxAllowed - currentImagesCount;

    if (remainingSlots <= 0) {
      alert(`Limite de ${maxAllowed} imagens atingido para este plano.`);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    const filesToUpload = files.slice(0, remainingSlots);

    // List any oversized files to warn the user
    const oversized = filesToUpload.filter(file => file.size > 5 * 1024 * 1024);
    if (oversized.length > 0) {
      alert(`As seguintes imagens excedem o limite de 5MB e foram puladas:\n${oversized.map(f => f.name).join('\n')}`);
    }

    const filesToProceed = filesToUpload.filter(file => file.size <= 5 * 1024 * 1024);
    if (filesToProceed.length === 0) {
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    uploadRef.current = true;
    setUploading(true);

    try {
      const uploadPromises = filesToProceed.map(async (file) => {
        const compressedBlob = await compressImage(file, 1200, 0.8);
        const fileName = `${Date.now()}_${file.name}`;
        const imageRef = ref(storage, `ads/${fileName}`);
        
        // Upload directly to Firebase Storage
        const uploadResult = await uploadBytes(imageRef, compressedBlob);
        const downloadUrl = await getDownloadURL(uploadResult.ref);
        return downloadUrl;
      });

      const urls = await Promise.all(uploadPromises);
      const validUrls = urls.filter((url): url is string => url !== null);

      if (validUrls.length > 0) {
        setFormData(prev => ({
          ...prev,
          images: [...prev.images, ...validUrls].slice(0, maxAllowed)
        }));
      }

    } catch (err) {
      console.error('Erro no upload real:', err);
      alert(`Erro ao carregar imagens: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setUploading(false);
      uploadRef.current = false;
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []) as File[];
    processFiles(files);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files || []) as File[];
    processFiles(files);
  };
  const removeImage = async (index: number) => {
    setFormData(prev => {
      const imageUrl = prev.images[index];
      const newImages = prev.images.filter((_, i) => i !== index);
      
      // Optional: Delete from storage if it's a firebase storage URL
      if (imageUrl && imageUrl.includes('firebasestorage.googleapis.com')) {
        const imageRef = ref(storage, imageUrl);
        deleteObject(imageRef).catch(err => {
          console.error('Error deleting image from storage:', err);
        });
      }
      
      return { ...prev, images: newImages };
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !profile) {
      alert('Erro ao carregar o seu perfil. Por favor, tente recarregar a página.');
      return;
    }

    if (formData.category !== 'Imigração' && !profile.phone) {
      alert('Por favor, adicione seu telemóvel no perfil antes de criar um anúncio.');
      navigate('/profile');
      return;
    }

    if (formData.category === 'Imigração' && !formData.sellerPhone.trim()) {
      alert('Por favor, insira o número de telemóvel / WhatsApp do contacto.');
      return;
    }

    setLoading(true);
    try {
      if (!formData.title.trim() || !formData.description.trim()) {
        alert('Por favor, preencha o título e a descrição do seu anúncio.');
        setLoading(false);
        return;
      }

      if (formData.images.length === 0) {
        alert('Por favor, carregue pelo menos uma imagem para o seu anúncio.');
        setLoading(false);
        return;
      }

      const adId = id || doc(collection(db, 'ads')).id;
      
      // Calculate expiration date
      let days = 30;
      if (settings?.planDurations) {
        if (formData.plan === 'free') {
          days = formData.duration;
        } else {
          days = settings.planDurations[formData.plan] || 30;
        }
      } else {
        // Fallback defaults
        if (formData.plan === 'free') days = formData.duration;
        else if (formData.plan === 'intermediate') days = 180;
        else if (formData.plan === 'premium') days = 365;
      }

      const expirationDate = new Date();
      expirationDate.setDate(expirationDate.getDate() + days);

      const adData = {
        id: adId,
        title: formData.title,
        description: formData.description,
        price: formData.category === 'Imigração' ? 0 : (formData.price ? parseFloat(formData.price) : 0),
        imageUrl: formData.images[0], // Primary image
        images: formData.images,
        city: formData.city,
        country: formData.country,
        category: formData.category,
        sellerId: id && originalAd ? originalAd.sellerId : user.uid,
        sellerPhone: formData.category === 'Imigração' ? formData.sellerPhone.trim() : (id && originalAd ? originalAd.sellerPhone : profile.phone),
        sellerName: id && originalAd ? originalAd.sellerName : profile.name,
        status: isAdmin && id ? (originalAd?.status || 'pending') : 'pending',
        adStatus: id && originalAd ? originalAd.adStatus : 'active',
        plan: formData.plan,
        expirationDate: expirationDate,
        userNotified: isAdmin && id ? true : false,
        createdAt: id && originalAd ? originalAd.createdAt : serverTimestamp(),
        updatedAt: serverTimestamp(),
        contactEmail: formData.category === 'Imigração' ? (formData.contactEmail || '') : '',
        externalUrl: formData.category === 'Imigração' ? (formData.externalUrl || '') : '',
        imagePositionX: imagePositionX,
        imagePositionY: imagePositionY,
        imageZoom: imageZoom
      };

      await setDoc(doc(db, 'ads', adId), adData, { merge: true });
      clearHomeCache();
      if (id) {
        if (isAdmin && originalAd?.sellerId !== user.uid) {
          alert('Anúncio atualizado com sucesso (Edição de Administrador).');
          navigate('/admin/ads');
        } else {
          alert('Anúncio atualizado! O seu anúncio voltou para a fila de aprovação do administrador.');
          navigate('/profile');
        }
      } else {
        alert('Anúncio enviado! Receberá um alerta quando o seu anúncio estiver aprovado.');
        navigate('/profile');
      }
    } catch (err) {
      handleFirestoreError(err, id ? OperationType.UPDATE : OperationType.CREATE, `ads/${id || 'new'}`);
    } finally {
      setLoading(false);
    }
  };

  if (fetching) return <div className="text-center py-20">A carregar...</div>;

  return (
    <div className="max-w-3xl mx-auto">
      <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-slate-500 hover:text-indigo-600 mb-6 font-medium transition-colors">
        <ChevronLeft size={20} /> Voltar
      </button>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white p-8 rounded-3xl shadow-xl border border-slate-100"
      >
        <h1 className="text-3xl font-bold text-slate-900 mb-8">{id ? 'Editar Anúncio' : 'Novo Anúncio'}</h1>

        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Image Upload */}
          <div className="space-y-4">
            <div className="flex justify-between items-end">
              <label className="text-sm font-bold text-slate-700 uppercase tracking-wider">Imagens do Produto</label>
              <span className="text-xs font-bold text-slate-400">
                {formData.images.length} de {maxAllowed} imagens
              </span>
            </div>
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*"
                onChange={handleImageUpload}
                className="hidden"
                disabled={uploading}
              />
              <AnimatePresence mode="popLayout">
                {formData.images.map((url, index) => (
                  url && (
                    <motion.div
                      key={`${url}-${index}`}
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                      className="aspect-square bg-slate-100 rounded-2xl overflow-hidden relative group border border-slate-200"
                    >
                      <img 
                        src={url} 
                        alt={`Preview ${index}`} 
                        className="w-full h-full object-cover" 
                        style={index === 0 ? getAdImageStyle(imagePositionX, imagePositionY, imageZoom) : undefined} 
                      />
                      <button
                        type="button"
                        onClick={() => removeImage(index)}
                        className="absolute top-2 right-2 bg-red-500 text-white p-1.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
                      >
                        <X size={14} />
                      </button>
                      {index === 0 && (
                        <div className="absolute bottom-0 left-0 right-0 bg-indigo-600 text-white text-[10px] font-bold py-1 text-center uppercase tracking-tighter">
                          Principal
                        </div>
                      )}
                    </motion.div>
                  )
                ))}
              </AnimatePresence>

              {formData.images.length < maxAllowed && (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  disabled={uploading}
                  className={`aspect-square border-2 border-dashed rounded-2xl flex items-center justify-center relative transition-colors duration-200 group disabled:opacity-50 disabled:cursor-not-allowed ${
                    isDragging
                      ? 'border-indigo-500 bg-indigo-50/50 text-indigo-600 scale-[1.02]'
                      : 'bg-slate-50 border-slate-200 hover:border-indigo-400 hover:bg-slate-100/50'
                  }`}
                >
                  <div className="text-center p-4">
                    {uploading ? (
                      <div className="flex flex-col items-center gap-2">
                        <RefreshCcw className="animate-spin text-indigo-600" size={32} />
                        <span className="text-xs font-bold text-indigo-600">A carregar...</span>
                      </div>
                    ) : (
                      <>
                        <Plus className={`mx-auto mb-1 transition-colors ${isDragging ? 'text-indigo-600' : 'text-slate-300 group-hover:text-indigo-400'}`} size={32} />
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tighter">
                          {isDragging ? 'Largar aqui' : 'Arrastar ou Clique'}
                        </p>
                        <p className="text-[9px] text-slate-400 mt-0.5 uppercase tracking-tighter font-semibold">
                          (Fotos)
                        </p>
                      </>
                    )}
                  </div>
                </button>
              )}
            </div>
            <p className="text-[10px] text-slate-400 font-medium">
              * A primeira imagem será a principal. Máximo 5MB por arquivo. Otimização automática aplicada.
            </p>

            {formData.images.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-6 p-5 bg-slate-50 rounded-2xl border border-slate-200/60"
              >
                <h4 className="text-sm font-bold text-slate-800 uppercase tracking-wide mb-3 flex items-center gap-2">
                  <ImageIcon size={16} className="text-indigo-500" />
                  Enquadramento da Foto Principal (Ajuste Visual)
                </h4>
                <p className="text-xs text-slate-500 mb-4">
                  Ajuste o foco, o alinhamento e o zoom usando os sliders abaixo ou <strong>arraste a imagem diretamente com o rato/dedo</strong> no preview à esquerda. No mobile, arraste para ajustar.
                </p>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
                  {/* Both Previews Box (Original + Card Crop) - Spans 7 cols on large screens */}
                  <div className="lg:col-span-7 flex flex-col sm:flex-row gap-4 justify-center items-center">
                    
                    {/* Imagem Original Preview - Reference */}
                    <div className="flex flex-col items-center">
                      <div className="text-[10px] font-bold text-slate-400 uppercase mb-2 tracking-tighter text-center">
                        Imagem Original (Referência)
                      </div>
                      <div className="w-[170px] h-[170px] sm:w-[180px] sm:h-[180px] bg-slate-950 rounded-2xl overflow-hidden border border-slate-300 shadow-inner relative flex items-center justify-center">
                        <img 
                          src={formData.images[0]} 
                          alt="Imagem original sem corte" 
                          className="w-full h-full object-contain pointer-events-none"
                        />
                      </div>
                    </div>

                    {/* Como Ficará No Card Preview - Interactive */}
                    <div className="flex flex-col items-center">
                      <div className="text-[10px] font-bold text-indigo-500 uppercase mb-2 tracking-tighter text-center">
                        Como ficará no Card (Arraste)
                      </div>
                      <div 
                        ref={containerRef}
                        onPointerDown={handlePointerDown}
                        onPointerMove={handlePointerMove}
                        onPointerUp={handlePointerUp}
                        onPointerCancel={handlePointerUp}
                        className="w-[170px] h-[170px] sm:w-[180px] sm:h-[180px] bg-slate-200 rounded-2xl overflow-hidden border-2 border-indigo-500 shadow-lg relative cursor-move select-none touch-none group"
                      >
                        <img 
                          src={formData.images[0]} 
                          alt="Ajuste de enquadramento" 
                          className="w-full h-full object-cover pointer-events-none transition-all duration-75"
                          style={getAdImageStyle(imagePositionX, imagePositionY, imageZoom)}
                        />
                        <div className="absolute top-2 right-2 bg-indigo-600/90 backdrop-blur-sm text-white text-[9px] font-black uppercase tracking-tight py-1 px-2 rounded-full pointer-events-none shadow">
                          Arraste 🖐️
                        </div>
                      </div>
                    </div>

                  </div>

                  {/* Slider Controls Box - Spans 5 cols on large screens */}
                  <div className="lg:col-span-5 space-y-4">
                    {/* Horizontal Slider */}
                    <div>
                      <div className="flex justify-between text-xs font-bold text-slate-600 mb-1 uppercase tracking-tight">
                        <span>Ajuste Horizontal</span>
                        <span className="text-indigo-600 font-mono">{imagePositionX}%</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={imagePositionX}
                        onChange={(e) => setImagePositionX(Number(e.target.value))}
                        className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-ew-resize accent-indigo-600 focus:outline-none"
                      />
                      <div className="flex justify-between text-[10px] text-slate-400 mt-1 uppercase font-bold">
                        <span>Esquerda</span>
                        <span>Centro</span>
                        <span>Direita</span>
                      </div>
                    </div>

                    {/* Vertical Slider */}
                    <div>
                      <div className="flex justify-between text-xs font-bold text-slate-600 mb-1 uppercase tracking-tight">
                        <span>Ajuste Vertical</span>
                        <span className="text-indigo-600 font-mono">{imagePositionY}%</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={imagePositionY}
                        onChange={(e) => setImagePositionY(Number(e.target.value))}
                        className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-ns-resize accent-indigo-600 focus:outline-none"
                      />
                      <div className="flex justify-between text-[10px] text-slate-400 mt-1 uppercase font-bold">
                        <span>Topo</span>
                        <span>Centro</span>
                        <span>Fundo</span>
                      </div>
                    </div>

                    {/* Zoom Slider */}
                    <div>
                      <div className="flex justify-between text-xs font-bold text-slate-600 mb-1 uppercase tracking-tight">
                        <span>Zoom</span>
                        <span className="text-indigo-600 font-mono">{imageZoom.toFixed(2)}x</span>
                      </div>
                      <input
                        type="range"
                        min="1"
                        max="1.8"
                        step="0.05"
                        value={imageZoom}
                        onChange={(e) => setImageZoom(Number(e.target.value))}
                        className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-zoom-in accent-indigo-600 focus:outline-none"
                      />
                      <div className="flex justify-between text-[10px] text-slate-400 mt-1 uppercase font-bold">
                        <span>Mínimo (1x)</span>
                        <span>Zoom</span>
                        <span>Máximo (1.8x)</span>
                      </div>
                    </div>

                    {/* Reset/Center Buttons */}
                    <div className="flex gap-2 pt-2">
                      <button
                        type="button"
                        onClick={() => {
                          setImagePositionX(50);
                          setImagePositionY(50);
                        }}
                        className="flex-1 py-1.5 px-3 text-xs font-bold text-indigo-600 bg-indigo-50 border border-indigo-100 hover:bg-indigo-100/70 rounded-xl transition-colors cursor-pointer text-center"
                      >
                        Centralizar
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setImagePositionX(50);
                          setImagePositionY(50);
                          setImageZoom(1);
                        }}
                        className="flex-1 py-1.5 px-3 text-xs font-bold text-slate-600 bg-slate-100 border border-slate-200 hover:bg-slate-200/70 rounded-xl transition-colors cursor-pointer text-center"
                      >
                        Repor Ajuste
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2 md:col-span-2">
              <label className="text-sm font-bold text-slate-700 uppercase tracking-wider">Título do Anúncio</label>
              <div className="relative">
                <Tag className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  required
                  className="w-full pl-12 pr-4 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:border-indigo-600 focus:bg-white outline-none transition-all"
                  placeholder="Ex: Guia Completo de Imigração para Portugal"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-bold text-slate-700 uppercase tracking-wider">Categoria</label>
              <select
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                className="w-full px-4 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:border-indigo-600 focus:bg-white outline-none transition-all appearance-none"
              >
                {categories
                  .filter(c => c !== 'Imigração' || isAdmin || profile?.role === 'admin' || profile?.role === 'moderator')
                  .map((c, index) => <option key={`category-${c}-${index}`} value={c}>{c}</option>)}
              </select>
            </div>

            {formData.category !== 'Imigração' ? (
              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-700 uppercase tracking-wider">
                  Preço ({formData.country === 'Reino Unido' ? '£' : '€'})
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-xl select-none leading-none z-10">
                    {formData.country === 'Reino Unido' ? '£' : '€'}
                  </span>
                  <input
                    type="number"
                    value={formData.price}
                    onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                    className="w-full pl-12 pr-4 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:border-indigo-600 focus:bg-white outline-none transition-all"
                    placeholder="0.00"
                  />
                </div>
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700 uppercase tracking-wider">Telemóvel / WhatsApp (Obrigatório)</label>
                  <input
                    type="tel"
                    value={formData.sellerPhone}
                    onChange={(e) => setFormData({ ...formData, sellerPhone: e.target.value })}
                    required={formData.category === 'Imigração'}
                    className="w-full px-4 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:border-indigo-600 focus:bg-white outline-none transition-all"
                    placeholder="Ex: +351 912 345 678"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700 uppercase tracking-wider">E-mail de Contacto (Opcional)</label>
                  <input
                    type="email"
                    value={formData.contactEmail}
                    onChange={(e) => setFormData({ ...formData, contactEmail: e.target.value })}
                    className="w-full px-4 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:border-indigo-600 focus:bg-white outline-none transition-all"
                    placeholder="exemplo@dominio.com"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700 uppercase tracking-wider">Link Externo / Website (URL)</label>
                  <input
                    type="url"
                    value={formData.externalUrl}
                    onChange={(e) => setFormData({ ...formData, externalUrl: e.target.value })}
                    className="w-full px-4 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:border-indigo-600 focus:bg-white outline-none transition-all"
                    placeholder="https://exemplo.com"
                  />
                </div>
              </>
            )}

            <div className="space-y-2">
              <label className="text-sm font-bold text-slate-700 uppercase tracking-wider">Comunidade de Publicação</label>
              <div className="relative">
                <select
                  value={formData.country}
                  onChange={(e) => handleCountryChange(e.target.value as 'Portugal' | 'Reino Unido')}
                  className="w-full px-4 py-4 bg-emerald-50 border-2 border-emerald-100 rounded-2xl font-bold text-emerald-800 outline-none cursor-pointer appearance-none shadow-sm hover:border-emerald-200 transition-all font-sans"
                >
                  <option value="Portugal" className="font-bold text-slate-900 bg-white">🇵🇹 Portugal</option>
                  <option value="Reino Unido" className="font-bold text-slate-900 bg-white">🇬🇧 Reino Unido</option>
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-emerald-800 font-bold select-none">
                  ▼
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-bold text-slate-700 uppercase tracking-wider">Cidade / Região</label>
              <div className="relative">
                <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 z-10" size={20} />
                <SearchableCitySelect
                  value={formData.city}
                  onChange={(val) => setFormData({ ...formData, city: val })}
                  placeholder="Escreva ou escolha a sua cidade"
                  country={formData.country}
                />
              </div>
            </div>

            <div className="space-y-4 md:col-span-2">
              <label className="text-sm font-bold text-slate-700 uppercase tracking-wider">Plano de Duração</label>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, plan: 'free' })}
                  className={`p-4 rounded-2xl border-2 transition-all text-left ${formData.plan === 'free' ? 'border-indigo-600 bg-indigo-50' : 'border-slate-100 bg-slate-50'}`}
                >
                  <p className="font-bold text-slate-900">Plano Gratuito</p>
                  <p className="text-xs text-slate-500 mb-2">Ideal para vendas rápidas</p>
                  <select
                    value={formData.duration}
                    onChange={(e) => setFormData({ ...formData, duration: parseInt(e.target.value) || 0, plan: 'free' })}
                    className="w-full p-2 bg-white border border-slate-200 rounded-lg text-sm outline-none"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <option value={15}>15 Dias</option>
                    <option value={30}>30 Dias</option>
                  </select>
                </button>

                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, plan: 'intermediate' })}
                  className={`p-4 rounded-2xl border-2 transition-all text-left ${formData.plan === 'intermediate' ? 'border-indigo-600 bg-indigo-50' : 'border-slate-100 bg-slate-50'}`}
                >
                  <p className="font-bold text-slate-900">Plano Intermédio</p>
                  <p className="text-xs text-slate-500 mb-2">Maior visibilidade</p>
                  <p className="text-sm font-bold text-indigo-600">180 Dias</p>
                </button>

                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, plan: 'premium' })}
                  className={`p-4 rounded-2xl border-2 transition-all text-left ${formData.plan === 'premium' ? 'border-indigo-600 bg-indigo-50' : 'border-slate-100 bg-slate-50'}`}
                >
                  <p className="font-bold text-slate-900">Plano Premium</p>
                  <p className="text-xs text-slate-500 mb-2">Duração máxima</p>
                  <p className="text-sm font-bold text-indigo-600">1 Ano</p>
                </button>
              </div>
            </div>

            <div className="space-y-2 md:col-span-2">
              <label className="text-sm font-bold text-slate-700 uppercase tracking-wider">Descrição Detalhada</label>
              <div className="relative">
                <FileText className="absolute left-4 top-6 text-slate-400" size={20} />
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  required
                  rows={6}
                  className="w-full pl-12 pr-4 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:border-indigo-600 focus:bg-white outline-none transition-all resize-none"
                  placeholder="Descreva o estado do produto, acessórios incluídos, etc."
                />
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-indigo-600 text-white py-5 rounded-2xl font-bold text-lg hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-100 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'A processar...' : id ? 'Atualizar Anúncio' : 'Publicar Anúncio'}
          </button>
        </form>
      </motion.div>
    </div>
  );
};

export default CreateAd;
