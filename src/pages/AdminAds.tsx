import React, { useState, useEffect } from 'react';
import { collection, query, orderBy, limit, updateDoc, doc, serverTimestamp } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { db, handleFirestoreError, OperationType, getDocsWithCacheFallback } from '../firebase';
import { Ad } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import OptimizedImage from '../components/OptimizedImage';
import { awardAdApprovalPoints } from '../utils/rewards';
import { 
  Clock, 
  Archive, 
  Trash2, 
  Edit,
  RefreshCcw,
  CheckCircle, 
  XCircle, 
  Eye, 
  MessageSquare,
  Search,
  Filter,
  AlertCircle,
  X,
  MapPin,
  Tag
} from 'lucide-react';
import { format, formatDistanceToNow, addDays } from 'date-fns';
import { pt } from 'date-fns/locale';
import { formatPrice } from '../utils';

const AdminAds = () => {
  const navigate = useNavigate();
  const [ads, setAds] = useState<Ad[]>([]);
  const [loading, setLoading] = useState(true);
  const [adFilter, setAdFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedAd, setSelectedAd] = useState<Ad | null>(null);

  useEffect(() => {
    fetchAds();
  }, []);

  const [renewingId, setRenewingId] = useState<string | null>(null);

  const fetchAds = async () => {
    try {
      const q = query(collection(db, 'ads'), orderBy('createdAt', 'desc'), limit(5));
      const querySnapshot = await getDocsWithCacheFallback(q, 'admin/ads');
      const adsData = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Ad));
      setAds(adsData);
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, 'ads');
    } finally {
      setLoading(false);
    }
  };

  const handleAdAction = async (adId: string, status: string) => {
    try {
      const adToUpdate = ads.find(a => a.id === adId) || (selectedAd?.id === adId ? selectedAd : null);

      await updateDoc(doc(db, 'ads', adId), { 
        status,
        updatedAt: serverTimestamp()
      });

      if (status === 'approved' && adToUpdate && adToUpdate.sellerId) {
        try {
          await awardAdApprovalPoints(adToUpdate.sellerId, adId);
        } catch (pointsErr) {
          console.error("Error awarding ad approved points:", pointsErr);
        }
      }

      setAds(prevAds => prevAds.map(ad => ad.id === adId ? { ...ad, status } as Ad : ad));
      setSelectedAd(prev => prev && prev.id === adId ? { ...prev, status: status as any } : prev);
      return true;
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `ads/${adId}`);
      return false;
    }
  };

  const handleRenewAd = async (adId: string) => {
    setRenewingId(adId);
    try {
      const newExpirationDate = addDays(new Date(), 30);
      await updateDoc(doc(db, 'ads', adId), {
        status: 'approved',
        adStatus: 'active',
        expirationDate: newExpirationDate,
        updatedAt: serverTimestamp(),
        userNotified: true
      });
      
      // Update local state with a mock timestamp to avoid .toDate() errors in components
      const mockTimestamp = { toDate: () => newExpirationDate };
      
      setAds(prevAds => prevAds.map(ad => ad.id === adId ? { 
        ...ad, 
        status: 'approved', 
        adStatus: 'active',
        expirationDate: mockTimestamp 
      } as Ad : ad));
      
      alert('Anúncio renovado com sucesso por mais 30 dias!');
    } catch (err) {
      console.error('Renew error:', err);
      handleFirestoreError(err, OperationType.UPDATE, `ads/${adId}`);
    } finally {
      setRenewingId(null);
    }
  };

  const filteredAds = ads.filter(ad => {
    const matchesFilter = adFilter === 'all' ? true : (ad.status === adFilter || ad.adStatus === adFilter);
    const matchesSearch = ad.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          ad.sellerName?.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  const stats = {
    total: ads.length,
    pending: ads.filter(a => a.status === 'pending').length,
    approved: ads.filter(a => a.status === 'approved' || a.adStatus === 'active').length,
    expired: ads.filter(a => a.status === 'expired' || a.adStatus === 'expired').length,
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-black text-slate-900 tracking-tight">Gerir Anúncios</h1>
        <p className="text-slate-500 font-medium">Aprove, rejeite ou modere os anúncios da plataforma.</p>
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total', value: stats.total, color: 'bg-slate-100 text-slate-600' },
          { label: 'Pendentes', value: stats.pending, color: 'bg-amber-50 text-amber-600' },
          { label: 'Aprovados', value: stats.approved, color: 'bg-emerald-50 text-emerald-600' },
          { label: 'Expirados', value: stats.expired, color: 'bg-red-50 text-red-600' },
        ].map((stat, idx) => (
          <div key={idx} className={`p-4 rounded-2xl border border-slate-100 shadow-sm ${stat.color}`}>
            <p className="text-[10px] font-black uppercase tracking-widest opacity-70">{stat.label}</p>
            <p className="text-2xl font-black mt-1">{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Filters & Search */}
      <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 flex flex-col md:flex-row gap-4 items-center">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input 
            type="text"
            placeholder="Pesquisar por título ou vendedor..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 transition-all"
          />
        </div>
        <div className="flex gap-2 overflow-x-auto w-full md:w-auto pb-2 md:pb-0">
          {[
            { id: 'all', label: 'Todos' },
            { id: 'pending', label: 'Pendentes' },
            { id: 'approved', label: 'Ativos' },
            { id: 'expired', label: 'Expirados' },
            { id: 'rejected', label: 'Rejeitados' },
            { id: 'archived', label: 'Arquivados' }
          ].map((filter) => (
            <button
              key={filter.id}
              onClick={() => setAdFilter(filter.id)}
              className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider whitespace-nowrap transition-all ${
                adFilter === filter.id 
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-100' 
                  : 'bg-white text-slate-500 hover:bg-slate-50 border border-slate-200'
              }`}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="text-center py-20 text-slate-400 font-bold animate-pulse">A carregar anúncios...</div>
      ) : filteredAds.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-3xl border-2 border-dashed border-slate-200">
          <AlertCircle className="mx-auto text-slate-300 mb-4" size={48} />
          <p className="text-slate-500 font-bold">Nenhum anúncio encontrado.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {filteredAds.map((ad, idx) => (
            <motion.div
              key={`${ad.id}-${idx}`}
              layout
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden hover:border-indigo-200 transition-all flex flex-col"
            >
              {/* Card Header Info */}
              <div className="p-4 sm:p-5 flex gap-4 items-start">
                {/* Image Container */}
                <div className="relative w-20 h-20 sm:w-24 sm:h-24 shrink-0 rounded-xl overflow-hidden bg-slate-50 border border-slate-100 flex items-center justify-center">
                  <OptimizedImage 
                    src={ad.imageUrl} 
                    alt={ad.title} 
                    className="w-full h-full object-cover" 
                    containerClassName="w-full h-full"
                  />
                  {ad.status === 'pending' && (
                    <div className="absolute top-1 left-1 w-5 h-5 bg-amber-500 text-white rounded-full flex items-center justify-center border border-white animate-pulse z-10">
                      <Clock size={10} />
                    </div>
                  )}
                </div>

                {/* Primary Metadata */}
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5 mb-1 bg-white">
                    <span className={`inline-block text-[9px] font-black px-1.5 py-0.5 rounded uppercase whitespace-nowrap tracking-wider ${
                      ad.status === 'approved' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 
                      ad.status === 'pending' ? 'bg-amber-50 text-amber-600 border border-amber-100' : 
                      'bg-red-50 text-red-600 border border-red-100'
                    }`}>
                      {ad.status}
                    </span>
                    {ad.adStatus && ad.adStatus !== ad.status && (
                      <span className={`inline-block text-[9px] font-black px-1.5 py-0.5 rounded uppercase whitespace-nowrap tracking-wider ${
                        ad.adStatus === 'active' ? 'bg-indigo-50 text-indigo-600 border border-indigo-100' : 
                        ad.adStatus === 'expired' ? 'bg-red-50 text-red-600 border border-red-100' : 
                        'bg-amber-50 text-amber-600 border border-amber-100'
                      }`}>
                        {ad.adStatus}
                      </span>
                    )}
                  </div>

                  <h3 className="font-bold text-slate-900 text-sm sm:text-base leading-snug line-clamp-2 break-all mb-1.5" title={ad.title}>
                    {ad.title}
                  </h3>

                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="text-sm sm:text-base font-black text-indigo-600">
                      {formatPrice(ad.price, ad.country)}
                    </span>
                    <span className="text-xs text-slate-400 font-medium whitespace-nowrap">
                      • Vendedor: <span className="text-slate-600 font-semibold">{ad.sellerName || 'ValtailAdmin'}</span>
                    </span>
                  </div>
                </div>
              </div>

              {/* Card Meta Row (Dates & Clicks) */}
              <div className="px-4 pb-3 sm:px-5 flex flex-wrap gap-x-4 gap-y-1.5 text-[11px] font-medium text-slate-400 border-b border-dashed border-slate-100 bg-white">
                <div className="flex items-center gap-1" title="Data de Criação">
                  <Clock size={13} className="text-indigo-400" />
                  <span>Criado: {ad.createdAt?.toDate ? format(ad.createdAt.toDate(), 'dd MMM yyyy') : 'Recentemente'}</span>
                </div>
                {ad.expirationDate && (
                  <div className="flex items-center gap-1" title="Data de Expiração">
                    <AlertCircle size={13} className="text-amber-400" />
                    <span>EXP: {ad.expirationDate.toDate ? format(ad.expirationDate.toDate(), 'dd MMM yyyy') : 'N/A'}</span>
                  </div>
                )}
                <div className="flex items-center gap-1">
                  <Eye size={13} className="text-slate-400" />
                  <span>{ad.views || 0} vistas</span>
                </div>
                <div className="flex items-center gap-1">
                  <MessageSquare size={13} className="text-slate-400" />
                  <span>{ad.whatsappClicks || 0} cliques</span>
                </div>
              </div>

              {/* Card Actions Footer */}
              <div className="bg-slate-50/50 p-3 sm:px-5 sm:py-3.5 flex flex-wrap gap-2 items-center justify-between">
                {/* Secondary Navigation Tools */}
                <div className="flex gap-1.5">
                  <button
                    onClick={() => setSelectedAd(ad)}
                    className="h-9 px-3 flex items-center gap-1.5 text-indigo-600 bg-white hover:bg-indigo-50 border border-indigo-100 rounded-xl transition-all font-bold text-[11px]"
                    title="Visualizar Anúncio Completo"
                  >
                    <Eye size={14} />
                    <span>Visualizar</span>
                  </button>

                  <button
                    onClick={() => navigate(`/edit-ad/${ad.id}`)}
                    className="h-9 px-3 flex items-center gap-1.5 text-slate-600 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl transition-all font-bold text-[11px]"
                    title="Editar Anúncio"
                  >
                    <Edit size={14} />
                    <span>Editar</span>
                  </button>
                </div>

                {/* Moderation / State Controls */}
                <div className="flex gap-1.5 items-center ml-auto">
                  {(ad.status === 'expired' || ad.adStatus === 'expired') && (
                    <button
                      onClick={() => {
                        if (window.confirm('Reativar este anúncio por mais 30 dias?')) {
                          handleRenewAd(ad.id);
                        }
                      }}
                      disabled={renewingId === ad.id}
                      className={`h-9 px-3.5 flex items-center gap-1.5 rounded-xl transition-all font-bold text-[11px] ${
                        renewingId === ad.id 
                          ? 'bg-slate-100 text-slate-400' 
                          : 'bg-emerald-500 text-white hover:bg-emerald-600 shadow-sm shadow-emerald-100'
                      }`}
                    >
                      {renewingId === ad.id ? (
                        <div className="w-3.5 h-3.5 border-2 border-slate-300 border-t-white rounded-full animate-spin" />
                      ) : (
                        <RefreshCcw size={13} />
                      )}
                      <span>Reativar</span>
                    </button>
                  )}

                  {ad.status === 'approved' && !ad.adStatus?.includes('expired') && (
                    <div className="flex gap-1.5 items-center">
                      <button
                        onClick={() => {
                          if (window.confirm('Renovar este anúncio por mais 30 dias?')) {
                            handleRenewAd(ad.id);
                          }
                        }}
                        disabled={renewingId === ad.id}
                        className={`h-9 px-3.5 flex items-center gap-1.5 bg-white hover:bg-emerald-50 text-emerald-600 border border-emerald-100 rounded-xl transition-all font-bold text-[11px] ${
                          renewingId === ad.id ? 'opacity-50' : ''
                        }`}
                        title="Renovar anúncio por mais 30 dias"
                      >
                        {renewingId === ad.id ? (
                          <div className="w-3.5 h-3.5 border-2 border-slate-300 border-t-emerald-600 rounded-full animate-spin" />
                        ) : (
                          <RefreshCcw size={13} />
                        )}
                        <span>Renovar</span>
                      </button>

                      <button
                        onClick={() => handleAdAction(ad.id, 'archived')}
                        className="h-9 px-3 flex items-center gap-1.5 text-slate-500 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl transition-all font-bold text-[11px]"
                      >
                        <Archive size={14} />
                        <span>Arquivar</span>
                      </button>
                    </div>
                  )}

                  {ad.status === 'pending' && (
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => handleAdAction(ad.id, 'approved')}
                        className="h-9 px-3.5 bg-emerald-500 text-white hover:bg-emerald-600 rounded-xl transition-all font-bold flex items-center gap-1.5 text-[11px] shadow-sm shadow-emerald-100"
                      >
                        <CheckCircle size={14} />
                        <span>Aprovar</span>
                      </button>
                      <button
                        onClick={() => handleAdAction(ad.id, 'rejected')}
                        className="h-9 px-3.5 bg-red-50 text-red-600 hover:bg-red-600 hover:text-white rounded-xl transition-all font-bold flex items-center gap-1.5 text-[11px]"
                      >
                        <XCircle size={14} />
                        <span>Rejeitar</span>
                      </button>
                    </div>
                  )}

                  <button
                    onClick={() => {
                      if (window.confirm('Eliminar anúncio permanentemente?')) {
                        handleAdAction(ad.id, 'deleted');
                      }
                    }}
                    className="h-9 w-9 flex items-center justify-center text-slate-400 hover:text-red-600 hover:bg-red-50 border border-slate-200 hover:border-red-100 rounded-xl transition-all shrink-0 animate-none"
                    title="Eliminar permanentemente"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Detail Modal */}
      <AnimatePresence>
        {selectedAd && (
          <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center z-[9999] p-4 overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-3xl shadow-2xl border border-slate-100 max-w-2xl w-full max-h-[90vh] overflow-y-auto flex flex-col"
            >
              {/* Header */}
              <div className="p-6 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white z-10">
                <div>
                  <h2 className="text-xl font-black text-slate-900 truncate max-w-[280px] sm:max-w-[450px]" title={selectedAd.title}>
                    {selectedAd.title}
                  </h2>
                  <p className="text-xs text-slate-500 font-medium mt-1">
                    ID do Anúncio: <span className="font-mono">{selectedAd.id}</span>
                  </p>
                </div>
                <button
                  onClick={() => setSelectedAd(null)}
                  className="h-10 w-10 flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-xl transition-all"
                  aria-label="Fechar"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Content */}
              <div className="p-6 space-y-6 flex-1 overflow-y-auto">
                {/* Image Gallery */}
                <div className="space-y-3">
                  <div className="relative aspect-video w-full rounded-2xl overflow-hidden bg-slate-50 border border-slate-100 flex items-center justify-center">
                    <OptimizedImage
                      src={selectedAd.imageUrl}
                      alt={selectedAd.title}
                      className="max-h-[300px] w-full object-contain"
                    />
                  </div>
                  {selectedAd.images && selectedAd.images.length > 1 && (
                    <div className="grid grid-cols-4 gap-2">
                      {selectedAd.images.map((img, i) => (
                        <div key={i} className="aspect-video bg-slate-50 rounded-xl overflow-hidden border border-slate-100 flex items-center justify-center">
                          <img
                            src={img}
                            alt={`Imagem ${i + 1}`}
                            className="max-h-full max-w-full object-contain"
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Badges Info */}
                <div className="flex flex-wrap gap-2">
                  <span className={`inline-block text-xs font-black px-3 py-1.5 rounded-lg uppercase whitespace-nowrap ${
                    selectedAd.status === 'approved' ? 'bg-emerald-50 text-emerald-600' : 
                    selectedAd.status === 'pending' ? 'bg-amber-50 text-amber-600' : 
                    'bg-red-50 text-red-600'
                  }`}>
                    Status: {selectedAd.status}
                  </span>
                  {selectedAd.adStatus && selectedAd.adStatus !== selectedAd.status && (
                    <span className="inline-block text-xs font-black px-3 py-1.5 rounded-lg uppercase whitespace-nowrap bg-indigo-50 text-indigo-600 font-sans">
                      Ciclo: {selectedAd.adStatus}
                    </span>
                  )}
                  {selectedAd.plan && (
                    <span className="inline-block text-xs font-black px-3 py-1.5 rounded-lg uppercase whitespace-nowrap bg-purple-50 text-purple-600 font-sans">
                      Plano: {selectedAd.plan}
                    </span>
                  )}
                </div>

                {/* Primary Details Row */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="bg-indigo-50/50 p-4 rounded-2xl border border-indigo-100/50">
                    <p className="text-[10px] font-black uppercase text-indigo-600 tracking-wider">Preço</p>
                    <p className="text-2xl font-black text-slate-950 mt-1">{formatPrice(selectedAd.price, selectedAd.country)}</p>
                  </div>

                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                    <p className="text-[10px] font-black uppercase text-slate-500 tracking-wider">Localização & Categoria</p>
                    <div className="space-y-1.5 mt-2">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
                        <MapPin size={14} className="text-red-500 shrink-0" />
                        <span>{selectedAd.country === 'Reino Unido' ? '🇬🇧' : '🇵🇹'} {selectedAd.city}, {selectedAd.country || 'Portugal'}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
                        <Tag size={14} className="text-indigo-500 shrink-0" />
                        <span>{selectedAd.category}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Description */}
                <div className="space-y-2">
                  <h4 className="text-xs font-black text-slate-500 uppercase tracking-wider">Descrição Completa</h4>
                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 text-sm text-slate-700 font-medium whitespace-pre-wrap break-words overflow-hidden leading-relaxed">
                    {selectedAd.description || 'Sem descrição fornecida.'}
                  </div>
                </div>

                {/* Seller Info */}
                <div className="p-4 rounded-2xl border border-slate-100 bg-slate-50/50 space-y-2">
                  <h4 className="text-xs font-black text-slate-500 uppercase tracking-wider">Informações do Vendedor</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    <p className="text-slate-600 font-medium">Nome: <span className="text-slate-900 font-bold">{selectedAd.sellerName}</span></p>
                    <p className="text-slate-600 font-medium">Telemóvel: <span className="text-slate-900 font-bold">{selectedAd.sellerPhone}</span></p>
                    <p className="text-slate-600 font-medium sm:col-span-2">ID do Vendedor: <span className="text-slate-950 font-mono select-all bg-slate-100 px-1 py-0.5 rounded">{selectedAd.sellerId}</span></p>
                  </div>
                </div>
              </div>

              {/* Actions Footer */}
              <div className="p-6 border-t border-slate-100 bg-slate-50/80 flex flex-wrap gap-3 items-center justify-between">
                <div>
                  <p className="text-[10px] font-black uppercase text-slate-400">Criado em</p>
                  <p className="text-xs font-bold text-slate-700 mt-1 flex items-center gap-1">
                    <Clock size={12} />
                    {selectedAd.createdAt?.toDate ? format(selectedAd.createdAt.toDate(), 'dd MMM yyyy HH:mm', { locale: pt }) : 'Recentemente'}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => {
                      setSelectedAd(null);
                      navigate(`/edit-ad/${selectedAd.id}`);
                    }}
                    className="h-10 px-4 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 font-bold text-xs rounded-xl transition-all flex items-center gap-2"
                    title="Editar Anúncio"
                  >
                    <Edit size={16} />
                    <span>Editar</span>
                  </button>
                  {selectedAd.status === 'pending' && (
                    <>
                      <button
                        onClick={async () => {
                          const success = await handleAdAction(selectedAd.id, 'approved');
                          if (success) {
                            setSelectedAd(null);
                            alert('Anúncio aprovado com sucesso!');
                          }
                        }}
                        className="h-10 px-4 bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-xs rounded-xl transition-all flex items-center gap-2 shadow-sm shadow-emerald-100"
                      >
                        <CheckCircle size={16} />
                        <span>Aprovar</span>
                      </button>
                      <button
                        onClick={async () => {
                          const success = await handleAdAction(selectedAd.id, 'rejected');
                          if (success) {
                            setSelectedAd(null);
                            alert('Anúncio rejeitado com sucesso!');
                          }
                        }}
                        className="h-10 px-4 bg-red-50 hover:bg-red-100 text-red-600 font-bold text-xs rounded-xl transition-all flex items-center gap-1.5"
                      >
                        <XCircle size={16} />
                        <span>Rejeitar</span>
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => setSelectedAd(null)}
                    className="h-10 px-4 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-xs rounded-xl transition-all"
                  >
                    Fechar
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default AdminAds;
