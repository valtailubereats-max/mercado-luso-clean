import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDoc, setDoc, deleteDoc, updateDoc, serverTimestamp, collection, query, where, getDocs } from 'firebase/firestore';
import { auth, db, withTimeout } from '../firebase';
import { UserProfile } from '../types';

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  isAdmin: boolean;
  favorites: string[]; // Novo: Lista global de IDs favoritos
  refreshProfile: () => Promise<void>;
  toggleFavoriteGlobal: (adId: string) => Promise<void>; // Novo: Função para atualizar a lista localmente
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  loading: true,
  isAdmin: false,
  favorites: [],
  refreshProfile: async () => {},
  toggleFavoriteGlobal: async () => {},
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [favorites, setFavorites] = useState<string[]>(() => {
    // Inicialização síncrona para evitar delays visuais
    const localRaw = localStorage.getItem('mercado_luso_favorites');
    try {
      return localRaw ? JSON.parse(localRaw) : [];
    } catch {
      return [];
    }
  }); 
  const [loading, setLoading] = useState(true);

  // Sincroniza favoritos locais pré-existentes (quando logava sem conta)
  const syncLocalFavoritesToFirestore = async (uid: string) => {
    const localRaw = localStorage.getItem('mercado_luso_favorites');
    if (!localRaw) return;
    try {
      const localIds = JSON.parse(localRaw);
      if (Array.isArray(localIds) && localIds.length > 0) {
        // Busca favoritos existentes no Firestore para evitar duplicados
        const q = query(collection(db, 'favorites'), where('userId', '==', uid));
        const snap = await getDocs(q);
        const existingAdIds = new Set(snap.docs.map(doc => doc.data().adId));

        const promises = localIds
          .filter(id => !existingAdIds.has(id))
          .map(async (adId) => {
            const newFavId = `fav_${Date.now()}_${uid}_${Math.random().toString(36).substring(2, 7)}`;
            await setDoc(doc(db, 'favorites', newFavId), {
              id: newFavId,
              userId: uid,
              adId: adId,
              createdAt: new Date()
            });
          });

        if (promises.length > 0) {
          await Promise.all(promises);
        }
        localStorage.removeItem('mercado_luso_favorites');
      }
    } catch (e) {
      console.error("Erro ao sincronizar favoritos locais:", e);
    }
  };

  const fetchFavorites = async (uid: string) => {
    try {
      const q = query(collection(db, 'favorites'), where('userId', '==', uid));
      const snap = await getDocs(q);
      const favIds = snap.docs.map(doc => doc.data().adId);
      setFavorites(favIds);
    } catch (err) {
      console.error("Error fetching favorites:", err);
    }
  };

  // Carrega e atualiza o Cache de Perfil no sessionStorage
  const fetchProfile = async (uid: string, forceRefresh = false) => {
    try {
      if (!forceRefresh) {
        const cached = sessionStorage.getItem(`profile_cache_${uid}`);
        if (cached) {
          const parsed = JSON.parse(cached) as UserProfile;
          setProfile(parsed);
          return;
        }
      }

      console.log('🔥 CHAMADA AO FIREBASE DETECTADA');
      const docRef = doc(db, 'users', uid);
      const docSnap = await withTimeout(getDoc(docRef), 45000);
      if (docSnap.exists()) {
        const data = docSnap.data() as UserProfile;
        setProfile(data);
        sessionStorage.setItem(`profile_cache_${uid}`, JSON.stringify(data));
      }
    } catch (err) {
      console.error("Error fetching profile:", err);
    }
  };

  // Função híbrida para favoritar/desfavoritar
  const toggleFavoriteGlobal = async (adId: string) => {
    if (!user) {
      // Guardar local no localStorage
      const localRaw = localStorage.getItem('mercado_luso_favorites');
      let localFavs: string[] = [];
      try {
        localFavs = localRaw ? JSON.parse(localRaw) : [];
      } catch {
        localFavs = [];
      }
      if (!Array.isArray(localFavs)) localFavs = [];

      let updated: string[];
      if (localFavs.includes(adId)) {
        updated = localFavs.filter(id => id !== adId);
      } else {
        updated = [...localFavs, adId];
      }
      localStorage.setItem('mercado_luso_favorites', JSON.stringify(updated));
      setFavorites(updated);
    } else {
      // Sincronizado com o Firestore
      const isFav = favorites.includes(adId);
      
      // Resposta otimista instantânea na UI
      setFavorites(prev => 
        prev.includes(adId) ? prev.filter(id => id !== adId) : [...prev, adId]
      );

      try {
        if (isFav) {
          const q = query(
            collection(db, 'favorites'), 
            where('userId', '==', user.uid), 
            where('adId', '==', adId)
          );
          const snap = await getDocs(q);
          const deletePromises = snap.docs.map(docSnapshot => deleteDoc(docSnapshot.ref));
          await Promise.all(deletePromises);
        } else {
          const newFavId = `fav_${Date.now()}_${user.uid}`;
          await setDoc(doc(db, 'favorites', newFavId), {
            id: newFavId,
            userId: user.uid,
            adId: adId,
            createdAt: new Date()
          });
        }
      } catch (err) {
        console.error("Erro ao favoritar/desfavoritar:", err);
        // Reverte estado local se falhar
        setFavorites(prev => 
          prev.includes(adId) ? prev.filter(id => id !== adId) : [...prev, adId]
        );
      }
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      setLoading(true);
      if (u) {
        setUser(u);
        try {
          await syncLocalFavoritesToFirestore(u.uid);
        } catch (e) {
          console.error("Erro no fluxo do sync:", e);
        }
        
        // Carrega Perfil e Favoritos (o fetchProfile utilizará cache)
        await Promise.all([
          fetchProfile(u.uid),
          fetchFavorites(u.uid)
        ]);
        setLoading(false);

        updateDoc(doc(db, 'users', u.uid), {
          lastLoginAt: serverTimestamp()
        }).catch(() => {});
      } else {
        setUser(null);
        setProfile(null);
        // Restaura favoritos do LocalStorage offline
        const localRaw = localStorage.getItem('mercado_luso_favorites');
        try {
          const localFavs = localRaw ? JSON.parse(localRaw) : [];
          setFavorites(Array.isArray(localFavs) ? localFavs : []);
        } catch {
          setFavorites([]);
        }
        setLoading(false);
      }
    });
    return unsubscribe;
  }, []);

  const refreshProfile = async () => {
    if (user) {
      await Promise.all([
        fetchProfile(user.uid, true), // forceRefresh = true
        fetchFavorites(user.uid)
      ]);
    }
  };

  const isAdmin = profile?.role === 'admin' || 
    user?.email === 'valtailubereats@gmail.com' || 
    user?.email === 'generalsales2021@gmail.com';

  const value = React.useMemo(() => ({
    user,
    profile,
    loading,
    isAdmin,
    favorites,
    refreshProfile,
    toggleFavoriteGlobal
  }), [user, profile, loading, isAdmin, favorites]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);