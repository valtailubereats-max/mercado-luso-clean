import { db } from '../firebase';
import { collection, doc, setDoc, deleteDoc, getDocs, serverTimestamp } from 'firebase/firestore';

export interface MarketingMaterial {
  id: string;
  title: string;
  category: 'Geral' | 'Vendedores' | 'Compradores' | 'Sazonal' | string;
  type: 'Texto' | 'Imagem/Banner' | 'Vídeo' | 'Link';
  description: string;
  content: string; // The copy text or main URL
  mediaUrl?: string; // Additional image/video/file URL when applicable
  createdAt: string; // ISO date string
  createdBy: string; // email or identifier of creator
  visualType?: 'gradient' | 'image';
  visualValue?: string; // tailwind class or background style
}

const LOCAL_STORAGE_KEY = 'mercado_luso_marketing_materials';

const DEFAULT_MATERIALS: MarketingMaterial[] = [
  {
    id: 'convite-testes-luso-1',
    title: 'Convite de Testes - Mercado Luso',
    category: 'Geral',
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
    category: 'Vendedores',
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
    category: 'Compradores',
    type: 'Texto',
    description: 'Promover a categoria de informática, tecnologia e gadgets.',
    content: `À procura de um novo smartphone ou portátil? 💻 No Mercado Luso as melhores ofertas de tecnologia estão à tua espera. Negocia direto com o vendedor e poupa dinheiro! 📱\n\nExplora agora: ${window.location.origin}?category=Tecnologia`,
    mediaUrl: '',
    createdAt: '2026-06-13T10:11:52Z',
    createdBy: 'Administração',
    visualType: 'gradient',
    visualValue: 'from-blue-600 to-blue-400'
  },
  {
    id: 'casa-jardim-5',
    title: 'Casa e Jardim Renovados',
    category: 'Compradores',
    type: 'Texto',
    description: 'Promover móveis, sofás e artigos decorativos da categoria.',
    content: `Dá uma nova vida à tua casa! 🏠 Encontra móveis, decoração e utensílios de jardim com preços imbatíveis no Mercado Luso. O marketplace feito para ti. 🌿\n\nVer ofertas: ${window.location.origin}?category=Casa%20e%20Jardim`,
    mediaUrl: '',
    createdAt: '2026-06-13T10:11:52Z',
    createdBy: 'Administração',
    visualType: 'gradient',
    visualValue: 'from-amber-600 to-amber-400'
  },
  {
    id: 'limpeza-primavera-6',
    title: 'Limpeza de Primavera',
    category: 'Sazonal',
    type: 'Texto',
    description: 'Promover desapego e reciclagem consciente de bens.',
    content: `Hora da limpeza de primavera! 🌸 Aquilo que já não usas pode ser o tesouro de outra pessoa. Ganha dinheiro extra e liberta espaço em casa com o Mercado Luso. 💰\n\nComeça a publicar: ${window.location.origin}/create-ad`,
    mediaUrl: '',
    createdAt: '2026-06-13T10:11:52Z',
    createdBy: 'Administração',
    visualType: 'gradient',
    visualValue: 'from-rose-600 to-rose-400'
  }
];

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
