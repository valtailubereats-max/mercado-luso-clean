import React, { createContext, useContext, useEffect, useState } from 'react';
import { doc, onSnapshot, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
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
    // Safety timer: if Firebase subscription doesn't load within 45000ms, set loading to false to unlock UI
    const safetyTimer = setTimeout(() => {
      console.warn("Settings subscription took too long, fallback loading initiated.");
      setLoading(false);
    }, 45000);

    const unsubscribe = onSnapshot(doc(db, 'settings', 'global'), (docSnap) => {
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
      setLoading(false);
    }, (error) => {
      clearTimeout(safetyTimer);
      console.error("Settings subscription error:", error);
      setLoading(false);
    });

    return () => {
      clearTimeout(safetyTimer);
      unsubscribe();
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
