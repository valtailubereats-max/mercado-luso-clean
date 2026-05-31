import React, { createContext, useContext, useEffect, useState } from 'react';
import { doc, setDoc } from 'firebase/firestore';
import { db, getDocWithCacheFallback } from '../firebase';
import { MarketplaceSettings, CATEGORIES } from '../types';

interface SettingsContextType {
  settings: MarketplaceSettings | null;
  categories: string[];
  loading: boolean;
}

const SettingsContext = createContext<SettingsContextType>({
  settings: null,
  categories: CATEGORIES,
  loading: true,
});

export const SettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<MarketplaceSettings | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Safety timer to ensure UI isn't locked if there's any problem
    const safetyTimer = setTimeout(() => {
      console.warn("Settings fetch took too long, fallback loading initiated.");
      setLoading(false);
    }, 45000);

    const fetchSettings = async () => {
      try {
        const docRef = doc(db, 'settings', 'global');
        const docSnap = await getDocWithCacheFallback(docRef, 'settings/global');
        
        clearTimeout(safetyTimer);
        
        if (docSnap.exists()) {
          const data = docSnap.data() as MarketplaceSettings;
          setSettings(data);
        } else {
          // Initialize if doesn't exist
          const defaultSettings: MarketplaceSettings = {
            id: 'global',
            planDurations: { free: 30, intermediate: 180, premium: 365 },
            maxImages: { free: 1, intermediate: 3, premium: 5 },
            expirationAction: 'archive',
            warningDays: 3,
            categories: CATEGORIES
          };
          setDoc(doc(db, 'settings', 'global'), defaultSettings).catch((err) => {
            console.error("Error initializing default settings:", err);
          });
          setSettings(defaultSettings);
        }
      } catch (error) {
        clearTimeout(safetyTimer);
        console.error("Settings fetch error:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchSettings();

    return () => {
      clearTimeout(safetyTimer);
    };
  }, []);

  const rawCategories = settings?.categories || CATEGORIES;
  const categories = rawCategories.includes('Imigração') ? rawCategories : [...rawCategories, 'Imigração'];

  return (
    <SettingsContext.Provider value={{ settings, categories, loading }}>
      {children}
    </SettingsContext.Provider>
  );
};

export const useSettings = () => useContext(SettingsContext);
