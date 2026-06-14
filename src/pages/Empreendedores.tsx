import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { UserProfile } from '../types';
import { motion } from 'motion/react';
import { Search, MapPin, Globe, ArrowRight, ShoppingBag, ExternalLink } from 'lucide-react';

const CATEGORIES = [
  'Alimentação',
  'Beleza',
  'Construção',
  'Limpeza',
  'Automóvel',
  'Serviços',
  'Lojas',
  'Outros'
];

export const mapCategoryToNew = (cat: string): string => {
  if (!cat) return 'Outros';
  const c = cat.toLowerCase().trim();
  if (c.includes('alimentac') || c.includes('restaura') || c.includes('pizza') || c.includes('bolo') || c.includes('comida') || c.includes('bebida') || c.includes('alimento')) {
    return 'Alimentação';
  }
  if (c.includes('beleza') || c.includes('estetic') || c.includes('unha') || c.includes('cabelo') || c.includes('cosm')) {
    return 'Beleza';
  }
  if (c.includes('constru') || c.includes('reforma') || c.includes('obra')) {
    return 'Construção';
  }
  if (c.includes('limpeza') || c.includes('lavand') || c.includes('limp')) {
    return 'Limpeza';
  }
  if (c.includes('autom') || c.includes('carro') || c.includes('mecan')) {
    return 'Automóvel';
  }
  if (c.includes('servi') || c.includes('profission') || c.includes('tecnolog') || c.includes('digital') || c.includes('turism') || c.includes('lazer') || c.includes('consult')) {
    return 'Serviços';
  }
  if (c.includes('comerc') || c.includes('loja') || c.includes('venda') || c.includes('compr')) {
    return 'Lojas';
  }
  return 'Outros';
};

const Empreendedores = () => {
  const [showcases, setShowcases] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedCountry, setSelectedCountry] = useState<'' | 'Portugal' | 'Reino Unido'>('');
  
  // Estatísticas públicas
  const [activeEntrepreneursCount, setActiveEntrepreneursCount] = useState(0);
  const [availableProductsCount, setAvailableProductsCount] = useState(0);

  useEffect(() => {
    const fetchShowcasesData = async () => {
      setLoading(true);
      try {
        const q = query(
          collection(db, 'sellerPublicProfiles'),
          where('showcaseActive', '==', true)
        );
        const snap = await getDocs(q);
        
        const rawShowcases = snap.docs.map(doc => ({
          uid: doc.id,
          ...doc.data()
        }));

        let totalProducts = 0;
        const processed = await Promise.all(rawShowcases.map(async (elem: any) => {
          let productsCount = 0;
          try {
            const pRef = query(
              collection(db, 'sellerPublicProfiles', elem.uid, 'products'),
              where('active', '==', true)
            );
            const pSnap = await getDocs(pRef);
            productsCount = pSnap.size;
            totalProducts += productsCount;
          } catch (pErr) {
            console.error('Erro ao buscar produtos da vitrine para', elem.uid, pErr);
          }
          return {
            ...elem,
            productsCount
          };
        }));

        // Ordenação: priorizar mais produtos, depois updatedAt mais recente
        processed.sort((a: any, b: any) => {
          if (b.productsCount !== a.productsCount) {
            return b.productsCount - a.productsCount;
          }
          const timeA = a.updatedAt?.toMillis ? a.updatedAt.toMillis() : (a.updatedAt ? new Date(a.updatedAt).getTime() : 0);
          const timeB = b.updatedAt?.toMillis ? b.updatedAt.toMillis() : (b.updatedAt ? new Date(b.updatedAt).getTime() : 0);
          return timeB - timeA;
        });

        setShowcases(processed);
        setActiveEntrepreneursCount(processed.length);
        setAvailableProductsCount(totalProducts);
      } catch (err) {
        console.error('Erro ao buscar vitrines digitais:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchShowcasesData();
  }, []);

  // Filter showcases based on search and selected categories
  const filteredShowcases = showcases.filter(item => {
    const matchesSearch = 
      (item.showcaseName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (item.showcaseDescription || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (item.city || '').toLowerCase().includes(searchTerm.toLowerCase());

    const matchesCategory = selectedCategory === '' || mapCategoryToNew(item.showcaseCategory || '') === selectedCategory;
    const matchesCountry = selectedCountry === '' || item.country === selectedCountry;

    return matchesSearch && matchesCategory && matchesCountry;
  });

  return (
    <div className="space-y-6 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4" id="entrepreneurs-page">
      {/* Header Banner */}
      <div className="relative rounded-3xl overflow-hidden bg-gradient-to-r from-indigo-900 via-indigo-800 to-slate-950 text-white p-8 md:p-12 shadow-xl border border-indigo-950">
        <div className="absolute top-0 right-0 h-full w-1/3 opacity-10 bg-[radial-gradient(circle_at_right,_var(--tw-gradient-stops))] from-indigo-400 via-transparent to-transparent pointer-events-none" />
        <div className="relative z-10 max-w-2xl space-y-4">
          <div className="inline-flex items-center gap-2 bg-indigo-500/20 text-indigo-200 px-3.5 py-1.5 rounded-full text-xs font-black tracking-wider uppercase border border-indigo-400/30">
            <ShoppingBag size={14} />
            <span>Vitrine Digital</span>
          </div>
          <h1 className="text-4xl md:text-5xl font-black tracking-tight leading-none bg-gradient-to-r from-white to-indigo-100 bg-clip-text text-transparent">
            Espaço de Empreendedores
          </h1>
          <p className="text-indigo-200/90 text-sm md:text-base font-medium leading-relaxed">
            Consuma local, apoie pequenos negócios liderados por lusófonos na sua região. Conecte-se diretamente via WhatsApp e descubra talentos inovadores!
          </p>
        </div>
      </div>

      {/* Estatísticas Públicas */}
      <div className="grid grid-cols-2 gap-4 sm:gap-6">
        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-3.5 sm:gap-4 transition-all hover:shadow-md">
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center text-lg sm:text-xl">
            🏪
          </div>
          <div>
            <span className="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-widest block leading-none">Empreendedores Ativos</span>
            <span className="text-xl sm:text-2xl font-black text-slate-800 mt-1 block tracking-tight">{loading ? '...' : activeEntrepreneursCount}</span>
          </div>
        </div>
        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-3.5 sm:gap-4 transition-all hover:shadow-md">
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center text-lg sm:text-xl">
            📦
          </div>
          <div>
            <span className="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-widest block leading-none">Produtos Disponíveis</span>
            <span className="text-xl sm:text-2xl font-black text-slate-800 mt-1 block tracking-tight">{loading ? '...' : availableProductsCount}</span>
          </div>
        </div>
      </div>

      {/* Search and Filters Bar */}
      <div className="bg-white p-6 rounded-2xl shadow-md border border-slate-100 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Search Term Input */}
          <div className="relative md:col-span-2">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
            <input
              type="text"
              placeholder="Pesquisar por negócio, descrição ou cidade..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border-2 border-slate-100 rounded-xl focus:border-indigo-600 focus:bg-white outline-none transition-all font-medium text-slate-800"
            />
          </div>

          {/* Category Filter */}
          <div className="relative col-span-1">
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full px-4 py-3.5 bg-slate-50 border-2 border-slate-100 rounded-xl focus:border-indigo-600 focus:bg-white outline-none transition-all font-semibold text-slate-700 cursor-pointer appearance-none"
            >
              <option value="">Todas as Categorias</option>
              {CATEGORIES.map(cat => (
                <option key={`filter-cat-${cat}`} value={cat}>{cat}</option>
              ))}
            </select>
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">▼</span>
          </div>

          {/* Country Filter */}
          <div className="relative col-span-1">
            <select
              value={selectedCountry}
              onChange={(e) => setSelectedCountry(e.target.value as any)}
              className="w-full px-4 py-3.5 bg-slate-50 border-2 border-slate-100 rounded-xl focus:border-indigo-600 focus:bg-white outline-none transition-all font-semibold text-slate-700 cursor-pointer appearance-none"
            >
              <option value="">Todos os Países</option>
              <option value="Portugal">🇵🇹 Portugal</option>
              <option value="Reino Unido">🇬🇧 Reino Unido</option>
            </select>
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">▼</span>
          </div>
        </div>
      </div>

      {/* List / Grid of Showcases */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map(n => (
            <div key={`shw-shimmer-${n}`} className="bg-white rounded-3xl border border-slate-100 overflow-hidden shadow-sm animate-pulse h-96">
              <div className="bg-slate-200 h-28 w-full" />
              <div className="p-6 space-y-4">
                <div className="w-16 h-16 bg-slate-300 rounded-2xl -mt-14 border-4 border-white" />
                <div className="h-6 bg-slate-200 rounded w-2/3" />
                <div className="h-4 bg-slate-200 rounded w-1/3" />
                <div className="space-y-2 pt-2">
                  <div className="h-3 bg-slate-200 rounded" />
                  <div className="h-3 bg-slate-200 rounded w-5/6" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : filteredShowcases.length === 0 ? (
        <div className="bg-white border-2 border-dashed border-slate-200 rounded-3xl p-16 text-center space-y-4 shadow-sm" id="empty-showcases">
          <span className="text-5xl block">🛍️</span>
          <h3 className="text-xl font-bold text-slate-800">Nenhum Empreendedor Encontrado</h3>
          <p className="text-slate-500 max-w-md mx-auto text-sm">
            Não encontramos nenhuma vitrine ativa correspondente aos critérios de pesquisa selecionados atualmente.
          </p>
          {searchTerm || selectedCategory || selectedCountry ? (
            <button
              onClick={() => {
                setSearchTerm('');
                setSelectedCategory('');
                setSelectedCountry('');
              }}
              className="px-5 py-2.5 bg-indigo-50 text-indigo-600 font-bold rounded-xl text-sm hover:bg-indigo-100 transition-colors"
            >
              Limpar Filtros
            </button>
          ) : (
            <Link
              to="/profile?tab=perfil"
              className="inline-flex items-center gap-2 bg-indigo-600 text-white font-bold px-6 py-3 rounded-2xl hover:bg-indigo-700 transition-all shadow-md shadow-indigo-100 text-sm"
            >
              Ativar Minha Vitrine
              <ArrowRight size={16} />
            </Link>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-fade-in" id="showcases-grid">
          {filteredShowcases.map((elem, idx) => {
            const linkTo = `/empreendedores/${elem.showcaseSlug}`;
            const fallbackCover = 'https://images.unsplash.com/photo-1557804506-669a67965ba0?auto=format&fit=crop&w=600&q=80'; // professional back pattern
            
            return (
              <motion.div
                key={`showcase-card-${elem.uid || idx}`}
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.04 }}
                className="group bg-white rounded-3xl border border-slate-100 overflow-hidden shadow-md hover:shadow-xl transition-all flex flex-col justify-between"
              >
                {/* Visual Top Area with Capa & Logo overlap */}
                <div className="relative">
                  <div className="h-28 w-full bg-slate-100 overflow-hidden relative">
                    <img 
                      src={elem.showcaseCover || fallbackCover} 
                      alt="Capa do negócio" 
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" 
                      referrerPolicy="no-referrer"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent" />
                  </div>
                  
                  {/* Logo block */}
                  <div className="absolute left-6 -bottom-6 w-16 h-16 rounded-2xl bg-white border-2 border-white shadow-md flex items-center justify-center overflow-hidden z-10">
                    {elem.showcaseLogo && elem.showcaseLogo.trim() !== '' ? (
                      <img src={elem.showcaseLogo || null} alt="Logo" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    ) : (
                      <span className="text-xl">🏬</span>
                    )}
                  </div>
                </div>

                {/* Info Area */}
                <div className="p-6 pt-8 flex-1 flex flex-col justify-between">
                  <div className="space-y-2">
                    {/* Category Label & Products count */}
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-black text-indigo-600 bg-indigo-50 px-2 py-1 rounded-md uppercase tracking-wider block w-fit">
                        {mapCategoryToNew(elem.showcaseCategory || '')}
                      </span>
                      <span className="text-[11px] font-bold text-slate-500 bg-slate-50 border border-slate-150 px-2 py-0.5 rounded-lg flex items-center gap-1 shrink-0">
                        📦 {elem.productsCount} {elem.productsCount === 1 ? 'item ativo' : 'itens ativos'}
                      </span>
                    </div>

                    {/* Business Name */}
                    <h2 className="text-xl font-bold text-slate-900 leading-snug group-hover:text-indigo-600 transition-colors pt-1">
                      {elem.showcaseName}
                    </h2>

                    {/* Location Badge */}
                    <div className="flex items-center gap-1.5 text-xs text-slate-500 font-semibold">
                      <MapPin size={13} className="text-slate-400" />
                      <span>{elem.city ? `${elem.city}, ` : ''}{elem.country === 'Portugal' ? '🇵🇹 Portugal' : elem.country === 'Reino Unido' ? '🇬🇧 Reino Unido' : elem.country}</span>
                    </div>

                    {/* Description Excerpt */}
                    <p className="text-slate-500 text-xs leading-relaxed pt-2 line-clamp-3">
                      {elem.showcaseDescription}
                    </p>
                  </div>

                  {/* Action Link block */}
                  <div className="pt-5 mt-auto border-t border-slate-50">
                    <Link
                      to={linkTo}
                      className="w-full flex items-center justify-between font-black text-sm text-indigo-600 group-hover:text-indigo-700 transition-colors"
                    >
                      <span>Ver Vitrine</span>
                      <div className="w-8 h-8 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center group-hover:translate-x-1 transition-transform group-hover:bg-indigo-600 group-hover:text-white">
                        <ArrowRight size={14} />
                      </div>
                    </Link>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default Empreendedores;
