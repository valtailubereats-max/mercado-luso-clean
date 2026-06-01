import React, { useState, useEffect } from 'react';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType, getDocWithCacheFallback } from '../firebase';
import { MarketplaceSettings, CATEGORIES } from '../types';
import { motion } from 'motion/react';
import { 
  Settings, 
  Save, 
  Plus, 
  X as CloseIcon,
  Clock,
  Image as ImageIcon,
  AlertTriangle,
  Tag
} from 'lucide-react';

const AdminSettings = () => {
  const [settings, setSettings] = useState<MarketplaceSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newCategory, setNewCategory] = useState('');

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const settingsSnap = await getDocWithCacheFallback(doc(db, 'settings', 'global'), 'settings/global');
      if (settingsSnap.exists()) {
        const data = settingsSnap.data() as MarketplaceSettings;
        setSettings({
          ...data,
          maxImages: data.maxImages || { free: 1, intermediate: 3, premium: 5 },
          categories: data.categories || CATEGORIES,
          ptRibbonScale: data.ptRibbonScale !== undefined ? data.ptRibbonScale : 150
        });
      } else {
        const defaultSettings: MarketplaceSettings = {
          id: 'global',
          planDurations: { free: 30, intermediate: 180, premium: 365 },
          maxImages: { free: 1, intermediate: 3, premium: 5 },
          expirationAction: 'archive',
          warningDays: 3,
          categories: CATEGORIES,
          ptRibbonScale: 150
        };
        await setDoc(doc(db, 'settings', 'global'), defaultSettings);
        setSettings(defaultSettings);
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, 'settings/global');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settings) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, 'settings', 'global'), { ...settings });
      alert('Configurações atualizadas com sucesso!');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, 'settings/global');
    } finally {
      setSaving(false);
    }
  };

  const handleAddCategory = () => {
    if (!newCategory.trim() || !settings) return;
    if (settings.categories?.includes(newCategory.trim())) {
      alert('Esta categoria já existe.');
      return;
    }
    setSettings({
      ...settings,
      categories: [...(settings.categories || CATEGORIES), newCategory.trim()]
    });
    setNewCategory('');
  };

  const handleRemoveCategory = (cat: string) => {
    if (!settings) return;
    setSettings({
      ...settings,
      categories: (settings.categories || CATEGORIES).filter(c => c !== cat)
    });
  };

  if (loading) {
    return <div className="text-center py-20 text-slate-400 font-bold animate-pulse">A carregar definições...</div>;
  }

  if (!settings) return null;

  return (
    <div className="space-y-8 pb-20">
      <div>
        <h1 className="text-3xl font-black text-slate-900 tracking-tight">Definições do Marketplace</h1>
        <p className="text-slate-500 font-medium">Configure as regras de negócio, planos e categorias.</p>
      </div>

      <form onSubmit={handleUpdateSettings} className="space-y-8">
        {/* Plan Durations */}
        <section className="bg-white p-6 md:p-8 rounded-2xl shadow-sm border border-slate-200">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center">
              <Clock size={20} />
            </div>
            <h2 className="text-xl font-bold text-slate-900">Duração dos Planos (Dias)</h2>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              { label: 'Plano Grátis', key: 'free' },
              { label: 'Plano Intermédio', key: 'intermediate' },
              { label: 'Plano Premium', key: 'premium' },
            ].map((plan) => (
              <div key={plan.key} className="space-y-2">
                <label className="text-xs font-black text-slate-400 uppercase tracking-widest">{plan.label}</label>
                <input
                  type="number"
                  value={settings.planDurations[plan.key as keyof typeof settings.planDurations]}
                  onChange={(e) => setSettings({ 
                    ...settings, 
                    planDurations: { ...settings.planDurations, [plan.key]: parseInt(e.target.value) || 0 } 
                  })}
                  className="w-full px-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-xl focus:border-indigo-600 focus:bg-white outline-none transition-all font-bold"
                />
              </div>
            ))}
          </div>
        </section>

        {/* Image Limits */}
        <section className="bg-white p-6 md:p-8 rounded-2xl shadow-sm border border-slate-200">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center">
              <ImageIcon size={20} />
            </div>
            <h2 className="text-xl font-bold text-slate-900">Limite de Imagens</h2>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              { label: 'Plano Grátis', key: 'free' },
              { label: 'Plano Intermédio', key: 'intermediate' },
              { label: 'Plano Premium', key: 'premium' },
            ].map((plan) => (
              <div key={plan.key} className="space-y-2">
                <label className="text-xs font-black text-slate-400 uppercase tracking-widest">{plan.label}</label>
                <input
                  type="number"
                  value={settings.maxImages[plan.key as keyof typeof settings.maxImages]}
                  onChange={(e) => setSettings({ 
                    ...settings, 
                    maxImages: { ...settings.maxImages, [plan.key]: parseInt(e.target.value) || 0 } 
                  })}
                  className="w-full px-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-xl focus:border-indigo-600 focus:bg-white outline-none transition-all font-bold"
                />
              </div>
            ))}
          </div>
        </section>

        {/* Expiration Rules */}
        <section className="bg-white p-6 md:p-8 rounded-2xl shadow-sm border border-slate-200">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-amber-50 text-amber-600 rounded-xl flex items-center justify-center">
              <AlertTriangle size={20} />
            </div>
            <h2 className="text-xl font-bold text-slate-900">Regras de Expiração</h2>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Ação ao Expirar</label>
              <select
                value={settings.expirationAction}
                onChange={(e) => setSettings({ ...settings, expirationAction: e.target.value as 'archive' | 'delete' })}
                className="w-full px-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-xl focus:border-indigo-600 focus:bg-white outline-none transition-all font-bold appearance-none"
              >
                <option value="archive">Arquivar (Ocultar do público)</option>
                <option value="delete">Eliminar Permanentemente</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Dias para Aviso Prévio</label>
              <input
                type="number"
                value={settings.warningDays}
                onChange={(e) => setSettings({ ...settings, warningDays: parseInt(e.target.value) || 0 })}
                className="w-full px-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-xl focus:border-indigo-600 focus:bg-white outline-none transition-all font-bold"
              />
            </div>
          </div>
        </section>

        {/* Categories Management */}
        <section className="bg-white p-6 md:p-8 rounded-2xl shadow-sm border border-slate-200">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center">
              <Tag size={20} />
            </div>
            <h2 className="text-xl font-bold text-slate-900">Gerir Categorias</h2>
          </div>
          
          <div className="space-y-6">
            <div className="flex gap-2">
              <input
                type="text"
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                placeholder="Nova categoria..."
                className="flex-1 px-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-xl focus:border-indigo-600 focus:bg-white outline-none transition-all font-bold"
              />
              <button
                type="button"
                onClick={handleAddCategory}
                className="h-[48px] bg-indigo-600 text-white px-6 rounded-xl font-bold hover:bg-indigo-700 transition-all flex items-center gap-2 shadow-lg shadow-indigo-100"
              >
                <Plus size={20} />
                Adicionar
              </button>
            </div>
            
            <div className="flex flex-wrap gap-2">
              {(settings.categories || CATEGORIES).map((cat, idx) => (
                <div 
                  key={`cat-manage-${idx}`}
                  className="flex items-center gap-2 bg-slate-50 px-4 py-2 rounded-xl border border-slate-100 group hover:border-indigo-200 transition-all"
                >
                  <span className="text-sm font-bold text-slate-700">{cat}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveCategory(cat)}
                    className="text-slate-400 hover:text-red-500 transition-colors"
                  >
                    <CloseIcon size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </section>

        <div className="sticky bottom-8 z-20">
          <button
            type="submit"
            disabled={saving}
            className="w-full md:w-auto flex items-center justify-center gap-3 bg-indigo-600 text-white px-10 py-4 rounded-2xl font-black text-lg hover:bg-indigo-700 transition-all shadow-2xl shadow-indigo-200 disabled:opacity-50"
          >
            <Save size={24} />
            {saving ? 'A GUARDAR...' : 'GUARDAR CONFIGURAÇÕES'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default AdminSettings;
