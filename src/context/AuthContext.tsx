import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db, withTimeout } from '../firebase';
import { UserProfile } from '../types';

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  isAdmin: boolean;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  loading: true,
  isAdmin: false,
  refreshProfile: async () => {},
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = async (uid: string) => {
    try {
      const docRef = doc(db, 'users', uid);
      // Fetch with threshold timeout (45 seconds) to prevent infinite hang if offline
      const docSnap = await withTimeout(getDoc(docRef), 45000);
      if (docSnap.exists()) {
        setProfile(docSnap.data() as UserProfile);
      } else {
        setProfile(null);
      }
    } catch (err) {
      console.error("Error fetching profile from Firestore:", err);
      setProfile(null);
    }
  };

  useEffect(() => {
    const checkDemoUser = () => {
      const stored = localStorage.getItem('demo_user');
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          setUser({
            uid: parsed.uid,
            email: parsed.email,
            displayName: parsed.displayName,
            emailVerified: true,
            isAnonymous: false,
            providerData: [],
          } as any);
          setProfile({
            uid: parsed.uid,
            name: parsed.displayName,
            email: parsed.email,
            phone: parsed.phone || '',
            role: parsed.role || 'user',
            acceptedTerms: true,
          } as any);
          setLoading(false);
          return true;
        } catch (e) {
          console.error("Error parsing demo user session:", e);
        }
      }
      return false;
    };

    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      if (u) {
        setUser(u);
        // Use finally to guarantee loading is unset even if Firestore is completely offline/timed out
        fetchProfile(u.uid).finally(() => {
          setLoading(false);
        });
        // Non-blocking background login update
        updateDoc(doc(db, 'users', u.uid), {
          lastLoginAt: serverTimestamp()
        }).catch((err) => {
          console.error("Error updating last login in Firestore:", err);
        });
      } else {
        const hasDemo = checkDemoUser();
        if (!hasDemo) {
          setUser(null);
          setProfile(null);
          setLoading(false);
        }
      }
    });
    return unsubscribe;
  }, []);

  const refreshProfile = async () => {
    if (user) await fetchProfile(user.uid);
  };

  const isAdmin = profile?.role === 'admin' || 
    user?.email === 'valtailubereats@gmail.com' || 
    user?.email === 'generalsales2021@gmail.com';

  const value = React.useMemo(() => ({
    user,
    profile,
    loading,
    isAdmin,
    refreshProfile
  }), [user, profile, loading, isAdmin]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
