import { db } from '../firebase';
import { collection, doc, setDoc, deleteDoc, getDocs, serverTimestamp } from 'firebase/firestore';

export interface MarketingMaterial {
  id: string;
  title: string;
  category: string;
  type: 'Texto' | 'Imagem/Banner' | 'Vídeo' | 'Link';
  description: string;
  content: string; // The copy text or main URL
  mediaUrl?: string; // Additional image/video/file URL when applicable
  createdAt: string; // ISO date string
  createdBy: string; // email or identifier of creator
  visualType?: 'gradient' | 'image';
  visualValue?: string; // tailwind class or background style
}

export interface MarketingCategory {
  id: string;
  name: string;
}

const LOCAL_STORAGE_KEY = 'mercado_luso_marketing_materials';
const CATEGORIES_LOCAL_STORAGE_KEY = 'mercado_luso_marketing_categories';

const DEFAULT_CATEGORIES: MarketingCategory[] = [
  { id: 'cat-geral', name: 'Geral' },
  { id: 'cat-convites', name: 'Convites' },
  { id: 'cat-whatsapp', name: 'WhatsApp' },
  { id: 'cat-facebook', name: 'Facebook' },
  { id: 'cat-instagram', name: 'Instagram' },
  { id: 'cat-banners', name: 'Banners' },
  { id: 'cat-videos', name: 'Vídeos' },
  { id: 'cat-empresas', name: 'Empresas' },
  { id: 'cat-lancamentos', name: 'Lançamentos' }
];

const DEFAULT_MATERIALS: MarketingMaterial[] = [
  {
    id: 'convite-testes-luso-1',
    title: 'Convite de Testes - Mercado Luso',
    category: 'Convites',
    type: 'Texto',
    description: 'Convite oficial para novos utilizadores participarem na fase de testes do Mercado Luso.',
    content: `Olá! 👋 Estás convidado a testar a versão antecipada do Mercado Luso! 🇵🇹\n\nSomos um marketplace focado em simplicidade, segurança e proximidade para a comunidade lusófona. Sem taxas fáceis nem intermediações complicadas, onde negoceias diretamente por WhatsApp! 🚀\n\nCria o teu anúncio grátis e encontra grandes oportunidades perto de ti!\nAcede agora: ${window.location.origin}\n\nO teu feedback vale ouro para nós! 🤝`,
    mediaUrl: '',
    createdAt: '2026-06-13T10:11:52Z',
    createdBy: 'Administração',
    visualType: 'gradient',
    visualValue: 'from-violet-600 to-indigo-500'
  },
  {
    id: 'boas-vindas-geral-2',
    title: 'Boas-vindas ao Mercado Luso',
    category: 'Geral',
    type: 'Texto',
    description: 'Apresentação geral da plataforma para novos utilizadores.',
    content: `Já conheces o Mercado Luso? 🇵🇹 O novo marketplace focado em simplicidade e segurança. Vende o que já não usas e encontra oportunidades incríveis na tua região. Tudo de forma direta via WhatsApp! 🚀\n\nVisita agora: ${window.location.origin}`,
    mediaUrl: '',
    createdAt: '2026-06-13T10:11:52Z',
    createdBy: 'Administração',
    visualType: 'gradient',
    visualValue: 'from-indigo-600 to-indigo-400'
  },
  {
    id: 'venda-carros-3',
    title: 'Venda Rápida de Carros',
    category: 'WhatsApp',
    type: 'Texto',
    description: 'Campanha de incentivo para venda rápida de veículos no portal.',
    content: `Queres vender o teu carro sem complicações? 🚗 No Mercado Luso, anuncias em minutos e falas direto com os interessados pelo WhatsApp. Rápido, grátis e seguro! 🏁\n\nAnuncia aqui: ${window.location.origin}/create-ad`,
    mediaUrl: '',
    createdAt: '2026-06-13T10:11:52Z',
    createdBy: 'Administração',
    visualType: 'gradient',
    visualValue: 'from-emerald-600 to-emerald-400'
  },
  {
    id: 'oportunidades-tech-4',
    title: 'Oportunidades em Tecnologia',
    category: 'Facebook',
    type: 'Texto',
    description: 'Promover a categoria de informática, tecnologia e gadgets.',
    content: `À procura de um novo smartphone ou portátil? 💻 No Mercado Luso as melhores ofertas de tecnologia estão à tua espera. Negocia direto com o vendedor e poupa dinheiro! 📱\n\nExplora agora: ${window.location.origin}?category=Tecnologia`,
    mediaUrl: '',
    createdAt: '2026-06-13T10:11:52Z',
    createdBy: 'Administração',
    visualType: 'gradient',
    visualValue: 'from-blue-600 to-blue-400'
  }
];

export function getLocalCategories(): MarketingCategory[] {
  try {
    const raw = localStorage.getItem(CATEGORIES_LOCAL_STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(CATEGORIES_LOCAL_STORAGE_KEY, JSON.stringify(DEFAULT_CATEGORIES));
      return DEFAULT_CATEGORIES;
    }
    return JSON.parse(raw);
  } catch (err) {
    console.error('[MarketingService] Error reading categories from localStorage:', err);
    return DEFAULT_CATEGORIES;
  }
}

export function saveLocalCategory(category: MarketingCategory): MarketingCategory[] {
  const current = getLocalCategories();
  const existingIndex = current.findIndex(c => c.id === category.id);
  
  if (existingIndex > -1) {
    current[existingIndex] = category;
  } else {
    current.push(category);
  }
  
  localStorage.setItem(CATEGORIES_LOCAL_STORAGE_KEY, JSON.stringify(current));
  return current;
}

export function deleteLocalCategory(id: string): MarketingCategory[] {
  const current = getLocalCategories();
  const filtered = current.filter(c => c.id !== id);
  localStorage.setItem(CATEGORIES_LOCAL_STORAGE_KEY, JSON.stringify(filtered));
  return filtered;
}

export async function syncCategoryToFirestore(category: MarketingCategory): Promise<void> {
  try {
    await setDoc(doc(db, 'marketing_categories', category.id), {
      ...category,
      updatedAt: serverTimestamp()
    }, { merge: true });
    console.log('[MarketingService] Synced category with firestore successfully');
  } catch (err) {
    console.warn('[MarketingService] Firestore category sync skipped or failed:', err);
  }
}

export async function deleteCategoryFromFirestore(id: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'marketing_categories', id));
    console.log('[MarketingService] Deleted category from firestore successfully');
  } catch (err) {
    console.warn('[MarketingService] Firestore category delete skipped or failed:', err);
  }
}

export function getLocalMaterials(): MarketingMaterial[] {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(DEFAULT_MATERIALS));
      return DEFAULT_MATERIALS;
    }
    return JSON.parse(raw);
  } catch (err) {
    console.error('[MarketingService] Error reading from localStorage:', err);
    return DEFAULT_MATERIALS;
  }
}

export function saveLocalMaterial(material: MarketingMaterial): MarketingMaterial[] {
  const current = getLocalMaterials();
  const existingIndex = current.findIndex(m => m.id === material.id);
  
  if (existingIndex > -1) {
    current[existingIndex] = material;
  } else {
    current.push(material);
  }
  
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(current));
  return current;
}

export function deleteLocalMaterial(id: string): MarketingMaterial[] {
  const current = getLocalMaterials();
  const filtered = current.filter(m => m.id !== id);
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(filtered));
  return filtered;
}

// Transparently handle Firestore updates so that if rules are deployed later, we are 100% ready!
export async function syncToFirestore(material: MarketingMaterial): Promise<void> {
  try {
    await setDoc(doc(db, 'marketing_materials', material.id), {
      ...material,
      updatedAt: serverTimestamp()
    }, { merge: true });
    console.log('[MarketingService] Synced material with firestore successfully');
  } catch (err) {
    // Graceously catch and ignore permission errors, since localStorage acts as the primary sandbox database
    console.warn('[MarketingService] Firestore sync skipped or failed (unconfigured rules):', err);
  }
}

export async function deleteFromFirestore(id: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'marketing_materials', id));
    console.log('[MarketingService] Deleted material from firestore successfully');
  } catch (err) {
    console.warn('[MarketingService] Firestore delete skipped or failed:', err);
  }
}
