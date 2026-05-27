import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronLeft, Share2, Copy, Check, Megaphone, Image as ImageIcon, MessageSquare, Facebook, Instagram, Send } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface MarketingTemplate {
  id: string;
  title: string;
  category: 'Geral' | 'Vendedores' | 'Compradores' | 'Sazonal';
  description: string;
  copy: string;
  visualType: 'gradient' | 'image';
  visualValue: string;
}

const AdminMarketing = () => {
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const baseUrl = window.location.origin;

  const templates: MarketingTemplate[] = [
    {
      id: '1',
      title: 'Boas-vindas ao Mercado Luso',
      category: 'Geral',
      description: 'Ideal para apresentar o app a novos utilizadores.',
      copy: `Já conheces o Mercado Luso? 🇵🇹 O novo marketplace focado em simplicidade e segurança. Vende o que não usas e encontra oportunidades incríveis na tua região. Tudo via WhatsApp! 🚀\n\nVisita agora: ${baseUrl}`,
      visualType: 'gradient',
      visualValue: 'from-indigo-600 to-indigo-400'
    },
    {
      id: '2',
      title: 'Venda Rápida de Carros',
      category: 'Vendedores',
      description: 'Focado em quem quer vender veículos rapidamente.',
      copy: `Queres vender o teu carro sem complicações? 🚗 No Mercado Luso, anuncias em minutos e falas direto com os interessados pelo WhatsApp. Rápido, grátis e seguro! 🏁\n\nAnuncia aqui: ${baseUrl}/create-ad`,
      visualType: 'gradient',
      visualValue: 'from-emerald-600 to-emerald-400'
    },
    {
      id: '3',
      title: 'Oportunidades em Tecnologia',
      category: 'Compradores',
      description: 'Destaque para a categoria de tecnologia e gadgets.',
      copy: `À procura de um novo smartphone ou portátil? 💻 No Mercado Luso as melhores ofertas de tecnologia estão à tua espera. Negocia direto com o vendedor e poupa dinheiro! 📱\n\nExplora agora: ${baseUrl}?category=Tecnologia`,
      visualType: 'gradient',
      visualValue: 'from-blue-600 to-blue-400'
    },
    {
      id: '4',
      title: 'Casa e Jardim Renovados',
      category: 'Compradores',
      description: 'Promover itens de decoração e mobiliário.',
      copy: `Dá uma nova vida à tua casa! 🏠 Encontra móveis, decoração e utensílios de jardim com preços imbatíveis no Mercado Luso. O marketplace feito para ti. 🌿\n\nVer ofertas: ${baseUrl}?category=Casa%20e%20Jardim`,
      visualType: 'gradient',
      visualValue: 'from-amber-600 to-amber-400'
    },
    {
      id: '5',
      title: 'Limpeza de Primavera',
      category: 'Sazonal',
      description: 'Incentivar as pessoas a desapegarem do que não usam.',
      copy: `Hora da limpeza de primavera! 🌸 Aquilo que já não usas pode ser o tesouro de outra pessoa. Ganha dinheiro extra e liberta espaço em casa com o Mercado Luso. 💰\n\nComeça a vender: ${baseUrl}/create-ad`,
      visualType: 'gradient',
      visualValue: 'from-rose-600 to-rose-400'
    }
  ];

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleShare = async (template: MarketingTemplate) => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: template.title,
          text: template.copy,
          url: baseUrl,
        });
      } catch (err) {
        console.log('Erro ao partilhar:', err);
      }
    } else {
      handleCopy(template.copy, template.id);
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-black text-slate-900 tracking-tight">Kit de Marketing</h1>
        <p className="text-slate-500 font-medium">Modelos prontos para partilhar e promover o Mercado Luso.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {templates.map((template) => (
          <motion.div
            key={template.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-[2.5rem] overflow-hidden shadow-xl border border-slate-100 flex flex-col group"
          >
            {/* Visual Preview */}
            <div className={`aspect-video bg-gradient-to-br ${template.visualValue} p-6 flex flex-col justify-center items-center text-center relative overflow-hidden`}>
              <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2 blur-2xl" />
              <div className="absolute bottom-0 left-0 w-24 h-24 bg-black/10 rounded-full translate-y-1/2 -translate-x-1/2 blur-xl" />
              
              <div className="relative z-10">
                <div className="bg-white/20 backdrop-blur-md p-3 rounded-2xl mb-3 inline-block">
                  <ImageIcon className="text-white" size={24} />
                </div>
                <h3 className="text-white font-black text-xl leading-tight px-4">
                  {template.title}
                </h3>
                <p className="text-white/80 text-[10px] font-bold uppercase tracking-widest mt-2">
                  Mercado Luso 🇵🇹
                </p>
              </div>
            </div>

            {/* Content */}
            <div className="p-6 flex-1 flex flex-col">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-[10px] font-black text-indigo-600 bg-indigo-50 px-2 py-1 rounded-lg uppercase tracking-wider">
                  {template.category}
                </span>
              </div>
              
              <h4 className="font-bold text-slate-900 mb-2">{template.title}</h4>
              <p className="text-slate-500 text-sm mb-6 line-clamp-2">{template.description}</p>

              <div className="mt-auto space-y-3">
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 relative group/copy">
                  <p className="text-slate-600 text-xs leading-relaxed line-clamp-3 italic">
                    "{template.copy}"
                  </p>
                  <button 
                    onClick={() => handleCopy(template.copy, template.id)}
                    className="absolute top-2 right-2 p-2 bg-white shadow-sm border border-slate-100 rounded-xl text-slate-400 hover:text-indigo-600 transition-all opacity-0 group-hover/copy:opacity-100"
                  >
                    {copiedId === template.id ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                  </button>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => handleShare(template)}
                    className="flex-1 bg-indigo-600 text-white py-3 rounded-2xl font-bold text-sm hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 flex items-center justify-center gap-2"
                  >
                    <Share2 size={16} />
                    Partilhar
                  </button>
                  <button
                    onClick={() => handleCopy(template.copy, template.id)}
                    className="p-3 bg-slate-100 text-slate-600 rounded-2xl hover:bg-slate-200 transition-all"
                    title="Copiar Texto"
                  >
                    {copiedId === template.id ? <Check size={18} className="text-emerald-500" /> : <Copy size={18} />}
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        ))}

        {/* Custom Template Placeholder */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-slate-50 rounded-[2.5rem] border-2 border-dashed border-slate-200 p-8 flex flex-col items-center justify-center text-center group hover:border-indigo-300 transition-all"
        >
          <div className="w-16 h-16 bg-white rounded-3xl shadow-sm flex items-center justify-center text-slate-300 group-hover:text-indigo-400 transition-all mb-4">
            <Megaphone size={32} />
          </div>
          <h4 className="font-bold text-slate-400 group-hover:text-slate-600 transition-all">Novo Template?</h4>
          <p className="text-slate-400 text-xs mt-2 max-w-[200px]">
            Em breve poderá criar os seus próprios templates de marketing aqui.
          </p>
        </motion.div>
      </div>

      {/* Quick Tips */}
      <div className="mt-16 bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm">
        <h3 className="text-xl font-bold text-slate-900 mb-6 flex items-center gap-2">
          <MessageSquare className="text-indigo-600" size={24} />
          Dicas para Partilhar
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="space-y-3">
            <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center">
              <Facebook size={20} />
            </div>
            <h4 className="font-bold text-slate-900">Grupos de Facebook</h4>
            <p className="text-slate-500 text-sm">Partilhe o link do app em grupos locais de "Vendas e Trocas" da sua cidade.</p>
          </div>
          <div className="space-y-3">
            <div className="w-10 h-10 bg-pink-50 text-pink-600 rounded-xl flex items-center justify-center">
              <Instagram size={20} />
            </div>
            <h4 className="font-bold text-slate-900">Stories do Instagram</h4>
            <p className="text-slate-500 text-sm">Use os textos curtos e adicione um sticker de "Link" para o Mercado Luso.</p>
          </div>
          <div className="space-y-3">
            <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center">
              <Send size={20} />
            </div>
            <h4 className="font-bold text-slate-900">Status do WhatsApp</h4>
            <p className="text-slate-500 text-sm">A forma mais direta! Copie o texto e cole no seu Status para os seus contactos verem.</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminMarketing;
