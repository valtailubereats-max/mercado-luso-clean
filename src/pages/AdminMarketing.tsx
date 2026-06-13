import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ChevronLeft, 
  Share2, 
  Copy, 
  Check, 
  Megaphone, 
  Image as ImageIcon, 
  MessageSquare, 
  Facebook, 
  Instagram, 
  Send, 
  Plus, 
  Trash2, 
  Edit, 
  FileText, 
  Video, 
  Link2, 
  User, 
  Calendar, 
  Clock, 
  X
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { 
  MarketingMaterial, 
  getLocalMaterials, 
  saveLocalMaterial, 
  deleteLocalMaterial, 
  syncToFirestore, 
  deleteFromFirestore 
} from '../utils/marketingService';

const AdminMarketing = () => {
  const { isAdmin, isModerator, user } = useAuth();
  const navigate = useNavigate();
  
  const [materials, setMaterials] = useState<MarketingMaterial[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  
  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingMaterial, setEditingMaterial] = useState<MarketingMaterial | null>(null);
  
  // Form fields
  const [formTitle, setFormTitle] = useState('');
  const [formCategory, setFormCategory] = useState('Geral');
  const [formType, setFormType] = useState<'Texto' | 'Imagem/Banner' | 'Vídeo' | 'Link'>('Texto');
  const [formDescription, setFormDescription] = useState('');
  const [formContent, setFormContent] = useState('');
  const [formMediaUrl, setFormMediaUrl] = useState('');
  const [formVisualValue, setFormVisualValue] = useState('from-indigo-600 to-indigo-400');
  
  const baseUrl = window.location.origin;

  // Load materials from storage
  useEffect(() => {
    const loaded = getLocalMaterials();
    setMaterials(loaded);
  }, []);

  const hasWritePermission = isAdmin || isModerator;
  const hasDeletePermission = isAdmin;

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleShare = async (material: MarketingMaterial) => {
    const shareText = material.content;
    if (navigator.share) {
      try {
        await navigator.share({
          title: material.title,
          text: shareText,
          url: baseUrl,
        });
      } catch (err) {
        console.log('Erro ao partilhar:', err);
      }
    } else {
      handleCopy(shareText, material.id);
    }
  };

  const openCreateModal = () => {
    setEditingMaterial(null);
    setFormTitle('');
    setFormCategory('Geral');
    setFormType('Texto');
    setFormDescription('');
    setFormContent('');
    setFormMediaUrl('');
    setFormVisualValue('from-indigo-600 to-indigo-400');
    setIsModalOpen(true);
  };

  const openEditModal = (material: MarketingMaterial) => {
    setEditingMaterial(material);
    setFormTitle(material.title);
    setFormCategory(material.category);
    setFormType(material.type);
    setFormDescription(material.description);
    setFormContent(material.content);
    setFormMediaUrl(material.mediaUrl || '');
    setFormVisualValue(material.visualValue || 'from-indigo-600 to-indigo-400');
    setIsModalOpen(true);
  };

  const handleDelete = async (id: string, name: string) => {
    if (!hasDeletePermission) {
      alert('Apenas administradores podem eliminar materiais de marketing.');
      return;
    }
    if (!window.confirm(`Tem a certeza que deseja eliminar o material de marketing "${name}"?`)) {
      return;
    }
    
    // Update local state and storage
    const updated = deleteLocalMaterial(id);
    setMaterials(updated);
    
    // Attempt background Firestore sync
    await deleteFromFirestore(id);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hasWritePermission) {
      alert('Não possui permissão para editar ou criar materiais.');
      return;
    }

    if (!formTitle.trim() || !formDescription.trim() || !formContent.trim()) {
      alert('Preencha todos os campos obrigatórios (Título, Descrição e Conteúdo).');
      return;
    }

    const materialId = editingMaterial ? editingMaterial.id : `marketing_${Date.now()}`;
    const newMaterial: MarketingMaterial = {
      id: materialId,
      title: formTitle.trim(),
      category: formCategory,
      type: formType,
      description: formDescription.trim(),
      content: formContent.trim(),
      mediaUrl: formMediaUrl.trim() || undefined,
      createdAt: editingMaterial ? editingMaterial.createdAt : new Date().toISOString(),
      createdBy: editingMaterial ? editingMaterial.createdBy : (user?.email || 'Administração'),
      visualType: 'gradient',
      visualValue: formVisualValue
    };

    // Save locally
    const updated = saveLocalMaterial(newMaterial);
    setMaterials(updated);
    setIsModalOpen(false);

    // Attempt background Firestore sync
    await syncToFirestore(newMaterial);
  };

  // Filter materials based on category
  const filteredMaterials = selectedCategory === 'all'
    ? materials
    : materials.filter(m => m.category.toLowerCase() === selectedCategory.toLowerCase());

  const categoriesList = ['all', 'Geral', 'Vendedores', 'Compradores', 'Sazonal'];

  const gradientsList = [
    { value: 'from-violet-600 to-indigo-500', name: 'Roxo Elétrico' },
    { value: 'from-indigo-600 to-indigo-400', name: 'Indigo Noite' },
    { value: 'from-emerald-600 to-emerald-400', name: 'Verde Esmeralda' },
    { value: 'from-blue-600 to-blue-400', name: 'Azul Elétrico' },
    { value: 'from-amber-600 to-amber-400', name: 'Dourado Quente' },
    { value: 'from-rose-600 to-rose-400', name: 'Rosa Suave' },
    { value: 'from-red-600 to-orange-500', name: 'Fogo Energizante' },
  ];

  const getTypeIcon = (type: 'Texto' | 'Imagem/Banner' | 'Vídeo' | 'Link') => {
    switch (type) {
      case 'Imagem/Banner':
        return <ImageIcon size={20} />;
      case 'Vídeo':
        return <Video size={20} />;
      case 'Link':
        return <Link2 size={20} />;
      default:
        return <FileText size={20} />;
    }
  };

  return (
    <div className="space-y-8">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">Kit de Marketing Dinâmico</h1>
          <p className="text-slate-500 font-medium">Biblioteca de materiais promocionais e copys prontos para promover o Mercado Luso.</p>
        </div>
        
        {hasWritePermission && (
          <button
            onClick={openCreateModal}
            className="self-start sm:self-auto bg-indigo-600 text-white font-bold text-sm px-6 py-3.5 rounded-2xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 flex items-center gap-2"
          >
            <Plus size={18} />
            Novo Material
          </button>
        )}
      </div>

      {/* Category filters */}
      <div className="flex flex-wrap items-center gap-2">
        {categoriesList.map((cat) => (
          <button
            key={cat}
            onClick={() => setSelectedCategory(cat)}
            className={`px-4 py-2 rounded-xl text-xs font-black transition-all ${
              selectedCategory === cat
                ? 'bg-indigo-600 text-white shadow-md'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            {cat === 'all' ? 'Ver Todos' : cat}
          </button>
        ))}
      </div>

      {/* Grid of Materials */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {filteredMaterials.map((material) => (
          <motion.div
            key={material.id}
            layoutId={material.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-[2.5rem] overflow-hidden shadow-xl border border-slate-100 flex flex-col group relative"
          >
            {/* Visual Preview */}
            <div className={`aspect-video bg-gradient-to-br ${material.visualValue || 'from-indigo-600 to-indigo-400'} p-6 flex flex-col justify-center items-center text-center relative overflow-hidden`}>
              <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2 blur-2xl" />
              <div className="absolute bottom-0 left-0 w-24 h-24 bg-black/10 rounded-full translate-y-1/2 -translate-x-1/2 blur-xl" />
              
              <div className="relative z-10 flex flex-col items-center">
                <div className="bg-white/20 backdrop-blur-md p-3 rounded-2xl mb-3 inline-block text-white">
                  {getTypeIcon(material.type)}
                </div>
                <h3 className="text-white font-black text-xl leading-tight px-4 line-clamp-2">
                  {material.title}
                </h3>
                <p className="text-white/80 text-[10px] font-bold uppercase tracking-widest mt-2 flex items-center gap-1">
                  <span>Mercado Luso 🇵🇹</span>
                  <span className="opacity-70">•</span>
                  <span>{material.type}</span>
                </p>
              </div>

              {/* Action Buttons Overlay for Staff */}
              {hasWritePermission && (
                <div className="absolute top-4 right-4 z-20 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-all">
                  <button
                    onClick={() => openEditModal(material)}
                    className="p-2 bg-white/90 backdrop-blur-sm rounded-xl text-slate-700 hover:text-indigo-600 transition-all shadow-md"
                    title="Editar Material"
                  >
                    <Edit size={14} />
                  </button>
                  {hasDeletePermission && (
                    <button
                      onClick={() => handleDelete(material.id, material.title)}
                      className="p-2 bg-white/90 backdrop-blur-sm rounded-xl text-slate-700 hover:text-red-600 transition-all shadow-md"
                      title="Eliminar Material"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Content Body */}
            <div className="p-6 flex-1 flex flex-col">
              <div className="flex items-center justify-between gap-2 mb-3">
                <span className="text-[10px] font-black text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-lg uppercase tracking-wider">
                  {material.category}
                </span>
                
                {material.createdAt && (
                  <span className="text-[10px] text-slate-400 font-bold flex items-center gap-1">
                    <Clock size={10} />
                    {new Date(material.createdAt).toLocaleDateString('pt-PT', { day: '2-digit', month: 'short' })}
                  </span>
                )}
              </div>
              
              <h4 className="font-bold text-slate-900 mb-2 leading-tight">{material.title}</h4>
              <p className="text-slate-500 text-sm mb-4 line-clamp-2">{material.description}</p>

              {/* Conditional Display of Attachment/Media Link */}
              {material.mediaUrl && (
                <div className="mb-4 bg-slate-50 border border-slate-100 p-2.5 rounded-xl flex items-center gap-2">
                  <div className="p-1 px-2 bg-indigo-50 text-indigo-600 text-[10px] font-bold rounded">URL</div>
                  <span className="text-xs text-slate-500 font-medium truncate flex-1">{material.mediaUrl}</span>
                  <a 
                    href={material.mediaUrl} 
                    target="_blank" 
                    rel="noreferrer" 
                    className="text-xs text-indigo-600 hover:underline font-bold"
                  >
                    Abrir
                  </a>
                </div>
              )}

              {/* Created By badge */}
              <div className="mb-4 flex items-center gap-1.5 text-[10px] text-slate-400 font-semibold uppercase tracking-wider">
                <User size={10} />
                <span>Criado por: {material.createdBy}</span>
              </div>

              {/* Copy Block & Action Buttons */}
              <div className="mt-auto space-y-3">
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 relative group/copy">
                  <p className="text-slate-600 text-xs leading-relaxed line-clamp-3 italic whitespace-pre-line">
                    "{material.content}"
                  </p>
                  <button 
                    onClick={() => handleCopy(material.content, material.id)}
                    className="absolute top-2 right-2 p-2 bg-white shadow-sm border border-slate-100 rounded-xl text-slate-400 hover:text-indigo-600 transition-all opacity-0 group-hover/copy:opacity-100"
                    title="Copiar Texto"
                  >
                    {copiedId === material.id ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                  </button>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => handleShare(material)}
                    className="flex-1 bg-indigo-600 text-white py-3 rounded-2xl font-bold text-sm hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 flex items-center justify-center gap-2"
                  >
                    <Share2 size={16} />
                    Partilhar / Copiar
                  </button>
                  <button
                    onClick={() => handleCopy(material.content, material.id)}
                    className="p-3 bg-slate-100 text-slate-600 rounded-2xl hover:bg-slate-200 transition-all flex items-center justify-center"
                    title="Copiar Texto"
                  >
                    {copiedId === material.id ? <Check size={18} className="text-emerald-500" /> : <Copy size={18} />}
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        ))}

        {/* Empty state or Add New Button placeholder */}
        {hasWritePermission && (
          <motion.button
            onClick={openCreateModal}
            className="bg-slate-50 rounded-[2.5rem] border-2 border-dashed border-slate-200 p-8 flex flex-col items-center justify-center text-center group hover:border-indigo-300 hover:bg-slate-100/50 transition-all h-full min-h-[380px]"
          >
            <div className="w-16 h-16 bg-white rounded-3xl shadow-sm flex items-center justify-center text-slate-400 group-hover:text-indigo-500 transition-all mb-4">
              <Plus size={32} />
            </div>
            <h4 className="font-bold text-slate-500 group-hover:text-indigo-600 transition-all">Adicionar Material</h4>
            <p className="text-slate-400 text-xs mt-2 max-w-[200px]">
              Crie um novo template promocional com copy, banners, vídeos ou links importantes.
            </p>
          </motion.button>
        )}
      </div>

      {/* Quick Sharing Tips */}
      <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm">
        <h3 className="text-xl font-bold text-slate-900 mb-6 flex items-center gap-2">
          <MessageSquare className="text-indigo-600" size={24} />
          Dicas de Divulgação para a Equipa
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="space-y-3">
            <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center">
              <Facebook size={20} />
            </div>
            <h4 className="font-bold text-slate-900">Grupos Segmentados</h4>
            <p className="text-slate-500 text-sm">Partilhe materiais específicos nos grupos certos. Templates de carros funcionam maravilhosamente em grupos automóveis do Facebook.</p>
          </div>
          <div className="space-y-3">
            <div className="w-10 h-10 bg-pink-50 text-pink-600 rounded-xl flex items-center justify-center">
              <Instagram size={20} />
            </div>
            <h4 className="font-bold text-slate-900">Instagram Stories & Reels</h4>
            <p className="text-slate-500 text-sm">Crie stories chamativos usando o visual colorido das cards e utilize um sticker de link apontando diretamente para o Mercado Luso.</p>
          </div>
          <div className="space-y-3">
            <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center">
              <Send size={20} />
            </div>
            <h4 className="font-bold text-slate-900">Mensagens & Status</h4>
            <p className="text-slate-500 text-sm font-medium">Copie o convite de testes rápido e partilhe no Status do WhatsApp ou envie aos seus contactos principais para trazer feedback valioso.</p>
          </div>
        </div>
      </div>

      {/* Create / Edit Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 overflow-y-auto">
            {/* Backdrop */}
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsModalOpen(false)}
              className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm"
            />

            {/* Modal Container */}
            <div className="flex min-h-full items-center justify-center p-4 sm:p-6">
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="relative bg-white rounded-[2.5rem] shadow-2xl border border-slate-100 w-full max-w-2xl overflow-hidden p-6 sm:p-10 z-10 space-y-6"
              >
                {/* Modal Header */}
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-2xl font-black text-slate-900 tracking-tight">
                      {editingMaterial ? 'Editar Material de Marketing' : 'Criar Novo Material de Marketing'}
                    </h2>
                    <p className="text-sm font-medium text-slate-400">
                      Preencha o formulário para expandir a biblioteca oficial da equipa.
                    </p>
                  </div>
                  <button 
                    onClick={() => setIsModalOpen(false)}
                    className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-all"
                  >
                    <X size={20} />
                  </button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-6">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    {/* Title */}
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Título do Material *</label>
                      <input 
                        type="text" 
                        required
                        value={formTitle}
                        onChange={(e) => setFormTitle(e.target.value)}
                        placeholder="Ex: Novo Canal de Empregos"
                        className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm text-slate-900 focus:outline-none focus:border-indigo-500 font-medium transition-all"
                      />
                    </div>

                    {/* Category */}
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Categoria</label>
                      <select 
                        value={formCategory}
                        onChange={(e) => setFormCategory(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm text-slate-900 focus:outline-none focus:border-indigo-500 font-semibold transition-all"
                      >
                        <option value="Geral">Geral</option>
                        <option value="Vendedores">Vendedores</option>
                        <option value="Compradores">Compradores</option>
                        <option value="Sazonal">Sazonal</option>
                      </select>
                    </div>

                    {/* Type selection */}
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Tipo de Material</label>
                      <select 
                        value={formType}
                        onChange={(e) => setFormType(e.target.value as any)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm text-slate-900 focus:outline-none focus:border-indigo-500 font-semibold transition-all"
                      >
                        <option value="Texto">Texto / Mensagem</option>
                        <option value="Imagem/Banner">Imagem / Banner</option>
                        <option value="Vídeo">Vídeo</option>
                        <option value="Link">Link Externo</option>
                      </select>
                    </div>

                    {/* Background Visual Design Choice */}
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Estilo de Gradiente (Preview)</label>
                      <select 
                        value={formVisualValue}
                        onChange={(e) => setFormVisualValue(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm text-slate-900 focus:outline-none focus:border-indigo-500 font-semibold transition-all"
                      >
                        {gradientsList.map(g => (
                          <option key={g.value} value={g.value}>{g.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Short Description */}
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Breve Descrição *</label>
                    <input 
                      type="text" 
                      required
                      value={formDescription}
                      onChange={(e) => setFormDescription(e.target.value)}
                      placeholder="Ex: Resumo sobre onde partilhar este material."
                      className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm text-slate-900 focus:outline-none focus:border-indigo-500 font-medium transition-all"
                    />
                  </div>

                  {/* Attachment/Media File link (Optional, show depending on type or universally as optional) */}
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">
                      Ficheiro / Link de Mídia (Opcional)
                    </label>
                    <input 
                      type="text" 
                      value={formMediaUrl}
                      onChange={(e) => setFormMediaUrl(e.target.value)}
                      placeholder="Ex: https://assets.mercadoluso.com/flyer.png"
                      className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm text-slate-900 focus:outline-none focus:border-indigo-500 font-medium transition-all"
                    />
                    <p className="text-[10px] text-slate-400 font-semibold">Anexe o link do design no Canva, vídeo explicativo ou imagem promocional.</p>
                  </div>

                  {/* Main Content (Text / Template copy) */}
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Conteúdo / Texto de Copy para Cópia *</label>
                    <textarea 
                      required
                      rows={5}
                      value={formContent}
                      onChange={(e) => setFormContent(e.target.value)}
                      placeholder={`Escreva aqui o copy do anúncio.\nDica: Use emojis e mencione o link de forma natural.`}
                      className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm text-slate-900 focus:outline-none focus:border-indigo-500 font-medium transition-all font-sans leading-relaxed"
                    />
                  </div>

                  {/* Action buttons */}
                  <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => setIsModalOpen(false)}
                      className="w-full sm:w-auto bg-slate-100 text-slate-600 font-bold px-6 py-3 rounded-2xl hover:bg-slate-200 transition-all text-sm"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      className="w-full sm:w-auto bg-indigo-600 text-white font-bold px-8 py-3 rounded-2xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 text-sm sm:ml-auto"
                    >
                      {editingMaterial ? 'Atualizar Material' : 'Gravar Material'}
                    </button>
                  </div>
                </form>
              </motion.div>
            </div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default AdminMarketing;
