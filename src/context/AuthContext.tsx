import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDoc, updateDoc, serverTimestamp, collection, query, where, getDocs } from 'firebase/firestore';
import { auth, db, withTimeout } from '../firebase';
import { UserProfile } from '../types';

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  isAdmin: boolean;
  favorites: string[]; // Novo: Lista global de IDs favoritos
  refreshProfile: () => Promise<void>;
  toggleFavoriteGlobal: (adId: string) => void; // Novo: Função para atualizar a lista localmente
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  loading: true,
  isAdmin: false,
  favorites: [],
  refreshProfile: async () => {},
  toggleFavoriteGlobal: () => {},
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [favorites, setFavorites] = useState<string[]>([]); // Estado global dos favoritos
  const [loading, setLoading] = useState(true);

  // Função para buscar os favoritos do usuário (carrega tudo de uma vez)
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

  const fetchProfile = async (uid: string) => {
    try {
      const docRef = doc(db, 'users', uid);
      const docSnap = await withTimeout(getDoc(docRef), 45000);
      if (docSnap.exists()) {
        setProfile(docSnap.data() as UserProfile);
      }
    } catch (err) {
      console.error("Error fetching profile:", err);
    }
  };

  // Função para adicionar/remover da lista local (evita nova leitura após o clique)
  const toggleFavoriteGlobal = (adId: string) => {
    setFavorites(prev => 
      prev.includes(adId) ? prev.filter(id => id !== adId) : [...prev, adId]
    );
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      if (u) {
        setUser(u);
        // Carrega Perfil e Favoritos em paralelo para ganhar tempo
        Promise.all([
          fetchProfile(u.uid),
          fetchFavorites(u.uid)
        ]).finally(() => {
          setLoading(false);
        });

        updateDoc(doc(db, 'users', u.uid), {
          lastLoginAt: serverTimestamp()
        }).catch(() => {});
      } else {
        setUser(null);
        setProfile(null);
        setFavorites([]);
        setLoading(false);
      }
    });
    return unsubscribe;
  }, []);

  const refreshProfile = async () => {
    if (user) {
      await Promise.all([fetchProfile(user.uid), fetchFavorites(user.uid)]);
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
    favorites, // Expõe os favoritos para todo o app
    refreshProfile,
    toggleFavoriteGlobal // Expõe a função de atualização
  }), [user, profile, loading, isAdmin, favorites]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
