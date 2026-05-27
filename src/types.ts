export type AdStatus = 'pending' | 'approved' | 'rejected' | 'expired' | 'archived' | 'sold';
export type AdLifecycleStatus = 'active' | 'near_expiration' | 'expired' | 'archived' | 'sold';
export type AdPlan = 'free' | 'intermediate' | 'premium';

export interface RenewalAction {
  date: any; // Firestore Timestamp
  action: 'renewal' | 'plan_change';
  previousExpiration: any;
  newExpiration: any;
  plan: AdPlan;
}

export interface Review {
  id: string;
  adId: string;
  adTitle: string;
  adCategory?: string;
  sellerId: string;
  buyerId?: string;
  buyerName: string;
  rating: number; // 1-5
  comment: string;
  success: boolean; // "Correu tudo bem com a negociação?"
  createdAt: any; // Firestore Timestamp
}

export interface MarketplaceSettings {
  id: 'global';
  planDurations: {
    free: number; // days
    intermediate: number;
    premium: number;
  };
  maxImages: {
    free: number;
    intermediate: number;
    premium: number;
  };
  expirationAction: 'archive' | 'delete';
  warningDays: number;
  categories?: string[];
}

export interface UserProfile {
  uid: string;
  name: string;
  email: string;
  phone: string;
  city?: string;
  role: 'user' | 'admin';
  acceptedTerms: boolean;
  acceptedTermsAt: any; // Firestore Timestamp
  lastLoginAt?: any; // Firestore Timestamp
  ratingAverage?: number;
  ratingCount?: number;
}

export interface Ad {
  id: string;
  title: string;
  description: string;
  price?: number;
  imageUrl: string; // Keep for backward compatibility, but use images[0]
  images: string[];
  city: string;
  category: string;
  sellerId: string;
  sellerPhone: string;
  sellerName: string;
  status: AdStatus;
  adStatus?: AdLifecycleStatus;
  plan?: AdPlan;
  expirationDate?: any; // Firestore Timestamp
  renewalHistory?: RenewalAction[];
  views?: number;
  whatsappClicks?: number;
  userNotified?: boolean;
  createdAt: any; // Firestore Timestamp
  contactEmail?: string;
  externalUrl?: string;
}

export interface Favorite {
  id: string;
  userId: string;
  adId: string;
  createdAt: any; // Firestore Timestamp
}

export interface Report {
  id: string;
  adId: string;
  userId: string;
  reason: string;
  details?: string;
  status: 'pending' | 'resolved' | 'dismissed';
  createdAt: any; // Firestore Timestamp
}

export interface DailyMetric {
  id: string; // YYYY-MM-DD
  date: any; // Firestore Timestamp
  users: {
    total: number;
    activeLast7Days: number;
    distributionByCity: { [city: string]: number };
  };
  ads: {
    total: number;
    byStatus: { [status: string]: number };
    byCategory: { [category: string]: number };
    createdToday: number;
  };
  interactions: {
    whatsappClicks: number;
    views: number;
    renewals: number;
    favorites: number;
  };
  notifications: {
    warningsSent: number;
    renewalsAfterWarning: number;
    ignoresAfterWarning: number;
  };
}

export const CATEGORIES = [
  'Imóveis',
  'Carros, motos e barcos',
  'Tecnologia',
  'Casa e Jardim',
  'Moda e Acessórios',
  'Lazer e Desporto',
  'Bebés e Crianças',
  'Imigração',
  'Outros'
];

export const CITIES = [
  'Lisboa',
  'Porto',
  'Braga',
  'Coimbra',
  'Faro',
  'Setúbal',
  'Aveiro',
  'Viseu',
  'Leiria',
  'Guarda',
  'Castelo Branco',
  'Santarém',
  'Évora',
  'Beja',
  'Portalegre',
  'Bragança',
  'Vila Real',
  'Viana do Castelo',
  'Funchal',
  'Ponta Delgada'
];

export const COUNTRY_CODES = [
  { code: '+351', country: 'Portugal', flag: '🇵🇹' },
  { code: '+55', country: 'Brasil', flag: '🇧🇷' },
  { code: '+34', country: 'Espanha', flag: '🇪🇸' },
  { code: '+33', country: 'França', flag: '🇫🇷' },
  { code: '+44', country: 'Reino Unido', flag: '🇬🇧' },
  { code: '+49', country: 'Alemanha', flag: '🇩🇪' },
  { code: '+39', country: 'Itália', flag: '🇮🇹' },
  { code: '+244', country: 'Angola', flag: '🇦🇴' },
  { code: '+238', country: 'Cabo Verde', flag: '🇨🇻' },
  { code: '+258', country: 'Moçambique', flag: '🇲🇿' },
  { code: '+245', country: 'Guiné-Bissau', flag: '🇬🇼' },
  { code: '+239', country: 'São Tomé e Príncipe', flag: '🇸🇹' },
  { code: '+670', country: 'Timor-Leste', flag: '🇹🇱' },
];
