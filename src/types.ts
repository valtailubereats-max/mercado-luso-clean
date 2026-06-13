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
  reviewerId?: string;
  revieweeId?: string;
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
  ptRibbonScale?: number;
  showTotalAdsBadge?: boolean;
  highlightSpeed?: number;
  showTotalUsersBadge?: boolean;
  searchGroupBgColor?: string;
  searchGroupOpacity?: number;
}

export interface UserProfile {
  id?: string;
  uid: string;
  name: string;
  email: string;
  phone: string;
  city?: string;
  role?: 'user' | 'admin' | 'moderator';
  acceptedTerms: boolean;
  acceptedTermsAt: any; // Firestore Timestamp
  lastLoginAt?: any; // Firestore Timestamp
  ratingAverage?: number;
  ratingCount?: number;
  referralCode?: string;
  referredUsersCount?: number;
  referredBy?: string;
  referralCredits?: number;
  pointsFromAds?: number;
  country?: 'Portugal' | 'Reino Unido';
}

export interface Ad {
  id: string;
  title: string;
  description: string;
  price?: number;
  imageUrl: string; // Keep for backward compatibility, but use images[0]
  images: string[];
  city: string;
  country?: 'Portugal' | 'Reino Unido';
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
  isFeatured?: boolean;
  featuredUntil?: any; // Firestore Timestamp
  pointsEarned?: boolean;
  imagePositionX?: number;
  imagePositionY?: number;
  imageZoom?: number;
  buyerId?: string;
  buyerName?: string;
  soldAt?: any; // Firestore Timestamp
  soldOutsidePlatform?: boolean;
  sourceUrl?: string;
  salary?: string;
  contractType?: string;
  workSchedule?: string;
  companyName?: string;
  experienceRequired?: string;
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
  'Trabalho/Empregos',
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

export const PORTUGAL_CITIES = [
  'Lisboa',
  'Porto',
  'Braga',
  'Faro',
  'Coimbra',
  'Aveiro',
  'Setúbal',
  'Leiria',
  'Madeira',
  'Açores',
  'Outra'
];

export const UK_CITIES = [
  // Cidades prioritárias para a comunidade lusófona
  'London',
  'Manchester',
  'Birmingham',
  'Liverpool',
  'Leeds',
  'Bristol',
  'Southampton',
  'Portsmouth',
  'Bournemouth',
  'Reading',
  'Milton Keynes',
  'Leicester',
  'Coventry',
  'Nottingham',
  'Glasgow',
  'Edinburgh',
  'Cardiff',
  'Belfast',
  'Weymouth',

  // Restantes cidades em ordem alfabética
  'Aberdeen',
  'Ayr',
  'Bangor',
  'Blackpool',
  'Bradford',
  'Cambridge',
  'Canterbury',
  'Carlisle',
  'Chelmsford',
  'Derby',
  'Derry / Londonderry',
  'Dundee',
  'Exeter',
  'Gloucester',
  'Hull',
  'Inverness',
  'Ipswich',
  'Lisburn',
  'Luton',
  'Newcastle upon Tyne',
  'Newport',
  'Newry',
  'Northampton',
  'Norwich',
  'Oxford',
  'Peterborough',
  'Perth',
  'Plymouth',
  'Preston',
  'Sheffield',
  'Stirling',
  'Stoke-on-Trent',
  'Swansea',
  'Swindon',
  'Warrington',
  'Wolverhampton',
  'Wrexham',
  'York',

  // Manter cidade personalizada
  'Outra'
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

export interface AdInterest {
  id: string; // deterministic ID: `${adId}_${interestedUserId}`
  adId: string;
  sellerId: string;
  interestedUserId: string;
  interestedUserName: string;
  createdAt: any; // Firestore Timestamp
  source: 'whatsapp';
}

export interface PhotoStoreItem {
  id: string;
  title: string;
  description: string;
  price: number;
  imageUrl: string;
  active: boolean;
  createdAt: any; // Firestore Timestamp
  updatedAt?: any; // Firestore Timestamp
  createdBy: string;
}

