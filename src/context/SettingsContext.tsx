import React, { createContext, useContext, useEffect, useState } from 'react';
import { doc, setDoc, onSnapshot } from 'firebase/firestore';
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
    // Safety timer to ensure UI isn't locked if there's any problem
    const safetyTimer = setTimeout(() => {
      console.warn("Settings fetch took too long, fallback loading initiated.");
      setLoading(false);
    }, 15000);

    const docRef = doc(db, 'settings', 'global');
    
    const unsubscribe = onSnapshot(docRef, 
      (docSnap) => {
        console.log('[READ] Settings');
        clearTimeout(safetyTimer);
        if (docSnap.exists()) {
          const data = docSnap.data() as MarketplaceSettings;
          setSettings({
            ...data,
            showTotalAdsBadge: data.showTotalAdsBadge !== undefined ? data.showTotalAdsBadge : true,
            showTotalUsersBadge: data.showTotalUsersBadge !== undefined ? data.showTotalUsersBadge : false,
            compactCardMode: data.compactCardMode !== undefined ? data.compactCardMode : false,
            enableFotosFeature: data.enableFotosFeature !== undefined ? data.enableFotosFeature : false
          });
        } else {
          // Initialize if doesn't exist
          const defaultSettings: MarketplaceSettings = {
            id: 'global',
            planDurations: { free: 30, intermediate: 180, premium: 365 },
            maxImages: { free: 1, intermediate: 3, premium: 5 },
            expirationAction: 'archive',
            warningDays: 3,
            categories: CATEGORIES,
            showTotalAdsBadge: true,
            showTotalUsersBadge: false,
            compactCardMode: false,
            enableFotosFeature: false
          };
          setDoc(doc(db, 'settings', 'global'), defaultSettings).catch((err) => {
            console.error("Error initializing default settings:", err);
          });
          setSettings(defaultSettings);
        }
        setLoading(false);
      },
      (error) => {
        clearTimeout(safetyTimer);
        console.error("Settings listener error:", error);
        setLoading(false);
      }
    );

    return () => {
      clearTimeout(safetyTimer);
      unsubscribe();
    };
  }, []);

  const rawCategories = settings?.categories || CATEGORIES;
  let categories = rawCategories.includes('Imigração') ? rawCategories : [...rawCategories, 'Imigração'];
  if (!categories.includes('Trabalho/Empregos')) {
    const othersIndex = categories.indexOf('Outros');
    if (othersIndex !== -1) {
      const copy = [...categories];
      copy.splice(othersIndex, 0, 'Trabalho/Empregos');
      categories = copy;
    } else {
      categories = [...categories, 'Trabalho/Empregos'];
    }
  }

  return (
    <SettingsContext.Provider value={{ settings, categories, loading }}>
      {children}
    </SettingsContext.Provider>
  );
};

export const useSettings = () => useContext(SettingsContext);
