import React, { useState, useEffect } from 'react';
import { collection, query, orderBy, limit, getDocs, where } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { db, handleFirestoreError, OperationType, getDocsWithCacheFallback } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { Ad, DailyMetric } from '../types';
import { motion } from 'motion/react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, 
  LineChart, Line, PieChart, Pie, Cell 
} from 'recharts';
import { Users, ShoppingBag, MousePointer2, Bell, TrendingUp, MapPin, Calendar, Clock, Download } from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { pt } from 'date-fns/locale';
import OptimizedImage from '../components/OptimizedImage';

const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

// Recursive helper to convert Firestore timestamp structures to ISO dates in the exported JSON
const convertTimestamps = (obj: any): any => {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj.toDate === 'function') {
    return obj.toDate().toISOString();
  }
  if (Array.isArray(obj)) {
    return obj.map(convertTimestamps);
  }
  if (typeof obj === 'object') {
    const newObj: any = {};
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        newObj[key] = convertTimestamps(obj[key]);
      }
    }
    return newObj;
  }
  return obj;
};

const AdminDashboard = () => {
  const { isAdmin, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [metrics, setMetrics] = useState<DailyMetric[]>([]);
  const [pendingAds, setPendingAds] = useState<Ad[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<'7d' | '30d' | 'all'>('7d');
  const [backupLoading, setBackupLoading] = useState(false);

  const handleDownloadBackup = async () => {
    setBackupLoading(true);
    try {
      // 1. Fetch ads
      const adsSnapshot = await getDocs(collection(db, 'ads'));
      const adsData = adsSnapshot.docs.map(doc => {
        const rawData = doc.data();
        return {
          id: doc.id,
          ...convertTimestamps(rawData)
        };
      });

      // 2. Fetch users
      const usersSnapshot = await getDocs(collection(db, 'users'));
      const usersData = usersSnapshot.docs.map(doc => {
        const rawData = doc.data();
        return {
          id: doc.id,
          ...convertTimestamps(rawData)
        };
      });

      // 3. Assemble full backup
      const backupPayload = {
        metadata: {
          exportedAt: new Date().toISOString(),
          version: "1.0",
          totalAds: adsData.length,
          totalUsers: usersData.length,
          exportedBy: "Marketplace Admin Dashboard"
        },
        collections: {
          ads: adsData,
          users: usersData
        }
      };

      // 4. Transform to JSON structure and build virtual download event
      const jsonStr = JSON.stringify(backupPayload, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      
      const formattedDate = format(new Date(), 'yyyy-MM-dd_HH-mm-ss');
      link.download = `backup_mercadoluso_${formattedDate}.json`;
      
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Backup generation error:', err);
      alert('Ocorreu um erro ao gerar o arquivo de backup. Por favor, tente novamente.');
    } finally {
      setBackupLoading(false);
    }
  };

  useEffect(() => {
    if (isAdmin && !authLoading) {
      fetchMetrics();
      fetchPendingAds();
    }
  }, [isAdmin, authLoading, timeRange]);

  const fetchPendingAds = async () => {
    try {
      // Simple query that does not require any composite indexes! Set limit to 50
      const q = query(collection(db, 'ads'), where('status', '==', 'pending'), limit(50));
      const snap = await getDocsWithCacheFallback(q, 'admin/pending-ads-dashboard');
      const adsData = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Ad));
      
      // Sort client-side by createdAt desc
      adsData.sort((a, b) => {
        const dateA = a.createdAt ? (typeof a.createdAt.toDate === 'function' ? a.createdAt.toDate().getTime() : new Date(a.createdAt).getTime()) : 0;
        const dateB = b.createdAt ? (typeof b.createdAt.toDate === 'function' ? b.createdAt.toDate().getTime() : new Date(b.createdAt).getTime()) : 0;
        return dateB - dateA;
      });
      
      setPendingAds(adsData.slice(0, 10));
    } catch (err) {
      console.error('Error fetching pending ads:', err);
    }
  };

  const fetchMetrics = async () => {
    if (!isAdmin) return;
    setLoading(true);
    try {
      let q = query(collection(db, 'metrics'), orderBy('date', 'desc'), limit(50));
      
      if (timeRange === '7d') {
        q = query(collection(db, 'metrics'), orderBy('date', 'desc'), limit(7));
      } else if (timeRange === '30d') {
        q = query(collection(db, 'metrics'), orderBy('date', 'desc'), limit(30));
      }

      const snap = await getDocsWithCacheFallback(q, `admin/metrics-${timeRange}`);
      const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as DailyMetric));
      
      // Ensure unique IDs in data to avoid React key issues
      const uniqueData = Array.from(new Map(data.map(item => [item.id, item])).values());
      setMetrics(uniqueData.reverse()); 
    } catch (err) {
      console.error('Metrics fetch error:', err);
      // Don't throw to prevent UI crash if metrics are not yet generated
    } finally {
      setLoading(false);
    }
  };

  const latest = metrics[metrics.length - 1];

  const adStatusData = latest ? Object.entries(latest.ads.byStatus).map(([name, value]) => ({ name, value })) : [];
  const adCategoryData = latest ? Object.entries(latest.ads.byCategory).map(([name, value]) => ({ name, value })) : [];
  const cityData = latest ? Object.entries(latest.users.distributionByCity)
    .map(([name, value]) => ({ name, value: value as number }))
    .sort((a, b) => (b.value as number) - (a.value as number))
    .slice(0, 5) : [];

  const growthData = metrics.map(m => ({
    date: m.date ? format(m.date.toDate(), 'dd/MM') : m.id.split('-').reverse().slice(0, 2).join('/'),
    users: m.users.total,
    ads: m.ads.total
  }));

  const interactionData = metrics.map(m => ({
    date: m.date ? format(m.date.toDate(), 'dd/MM') : m.id.split('-').reverse().slice(0, 2).join('/'),
    clicks: m.interactions.whatsappClicks,
    views: m.interactions.views
  }));

  const conversionRate = latest && latest.interactions.views > 0 
    ? ((latest.interactions.whatsappClicks / latest.interactions.views) * 100).toFixed(1) 
    : 0;

  const notificationEfficiency = latest && latest.notifications.warningsSent > 0
    ? ((latest.notifications.renewalsAfterWarning / latest.notifications.warningsSent) * 100).toFixed(1)
    : 0;

  return (
    <div className="space-y-8 pb-20">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">Dashboard de Métricas</h1>
          <p className="text-slate-500 font-medium">Acompanhe o crescimento e engajamento do Mercado Luso.</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-3 self-start lg:self-auto">
          {/* Download Backup Button */}
          <button
            onClick={handleDownloadBackup}
            disabled={backupLoading}
            className={`h-11 px-5 flex items-center gap-2.5 font-bold text-xs rounded-2xl transition-all shadow-sm ${
              backupLoading 
                ? 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200' 
                : 'bg-indigo-600 hover:bg-indigo-700 hover:scale-[1.02] active:scale-[0.98] text-white shadow-md shadow-indigo-100'
            }`}
          >
            <Download size={15} className={backupLoading ? 'animate-spin' : ''} />
            <span>{backupLoading ? 'A processar Backup...' : 'Download Backup'}</span>
          </button>

          <div className="flex bg-slate-100 p-1 rounded-2xl">
            {(['7d', '30d', 'all'] as const).map((range, index) => (
              <button
                key={`range-${range}-${index}`}
                onClick={() => setTimeRange(range)}
                className={`px-6 py-2 rounded-xl text-sm font-bold transition-all ${timeRange === range ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                {range === '7d' ? '7 Dias' : range === '30d' ? '30 Dias' : 'Tudo'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Pending Ads Alert */}
      {pendingAds.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-amber-50 border border-amber-200 rounded-2xl p-6 shadow-sm"
        >
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center text-amber-600">
                <Bell size={20} className="animate-bounce" />
              </div>
              <div>
                <h2 className="text-lg font-black text-slate-900">Anúncios Pendentes</h2>
                <p className="text-slate-500 text-sm font-medium">Existem anúncios aguardando a sua aprovação.</p>
              </div>
            </div>
            <button 
              onClick={() => navigate('/admin/ads')}
              className="text-amber-600 font-bold text-sm hover:underline"
            >
              Ver todos
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {pendingAds.slice(0, 3).map((ad, idx) => (
              <div key={`summary-${ad.id}-${idx}`} className="bg-white p-3 rounded-xl border border-amber-100 shadow-sm flex gap-3">
                <OptimizedImage 
                  src={ad.imageUrl} 
                  alt={ad.title} 
                  className="w-full h-full object-cover" 
                  containerClassName="w-12 h-12 bg-slate-50 shrink-0 rounded-lg overflow-hidden"
                />
                <div className="min-w-0">
                  <h3 className="font-bold text-slate-900 truncate text-xs">{ad.title}</h3>
                  <p className="text-[10px] text-slate-500 mt-0.5 truncate">Vendedor: {ad.sellerName}</p>
                  <p className="text-[9px] text-amber-600 font-bold uppercase tracking-wider mt-1 flex items-center gap-1">
                    <Clock size={10} />
                    {ad.createdAt?.toDate ? formatDistanceToNow(ad.createdAt.toDate(), { addSuffix: true, locale: pt }) : 'Recentemente'}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {loading ? (
        <div className="text-center py-20 text-slate-400 font-bold animate-pulse">Carregando métricas...</div>
      ) : !latest ? (
        <div className="text-center py-20 bg-white rounded-3xl border-2 border-dashed border-slate-200">
          <Calendar className="mx-auto text-slate-300 mb-4" size={48} />
          <p className="text-slate-500 font-bold">Nenhuma métrica disponível ainda.</p>
          <p className="text-slate-400 text-sm">Aguarde o processamento diário do sistema.</p>
        </div>
      ) : (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <MetricCard 
              title="Total Usuários" 
              value={latest.users.total} 
              icon={<Users />} 
              color="indigo"
              subtitle={`${latest.users.activeLast7Days} ativos (7d)`}
            />
            <MetricCard 
              title="Total Anúncios" 
              value={latest.ads.total} 
              icon={<ShoppingBag />} 
              color="emerald"
              subtitle={`${latest.ads.createdToday} criados hoje`}
            />
            <MetricCard 
              title="Cliques WhatsApp" 
              value={latest.interactions.whatsappClicks} 
              icon={<MousePointer2 />} 
              color="amber"
              subtitle={`Taxa de conv: ${conversionRate}%`}
            />
            <MetricCard 
              title="Avisos Enviados" 
              value={latest.notifications.warningsSent} 
              icon={<Bell />} 
              color="rose"
              subtitle={`Eficiência: ${notificationEfficiency}%`}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Growth Chart */}
            <ChartContainer title="Crescimento da Plataforma" icon={<TrendingUp />}>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={growthData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 12 }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 12 }} />
                  <Tooltip 
                    contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                  />
                  <Legend iconType="circle" />
                  <Line type="monotone" dataKey="users" name="Usuários" stroke="#6366f1" strokeWidth={3} dot={{ r: 4, fill: '#6366f1' }} activeDot={{ r: 6 }} />
                  <Line type="monotone" dataKey="ads" name="Anúncios" stroke="#10b981" strokeWidth={3} dot={{ r: 4, fill: '#10b981' }} activeDot={{ r: 6 }} />
                </LineChart>
              </ResponsiveContainer>
            </ChartContainer>

            {/* Interaction Chart */}
            <ChartContainer title="Engajamento Diário" icon={<MousePointer2 />}>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={interactionData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 12 }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 12 }} />
                  <Tooltip 
                    contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                  />
                  <Legend iconType="circle" />
                  <Bar dataKey="clicks" name="Cliques" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="views" name="Visualizações" fill="#6366f1" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartContainer>

            {/* Ad Status Distribution */}
            <ChartContainer title="Status dos Anúncios" icon={<ShoppingBag />}>
              <div className="flex flex-col md:flex-row items-center justify-around">
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart>
                    <Pie
                      data={adStatusData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {adStatusData.map((entry, index) => (
                        <Cell key={`status-cell-${entry.name}-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-2">
                  {adStatusData.map((entry, index) => (
                    <div key={`status-legend-${entry.name}-${index}`} className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                      <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">{entry.name}: {entry.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </ChartContainer>

            {/* Geographic Distribution */}
            <ChartContainer title="Distribuição por Cidade (Top 5)" icon={<MapPin />}>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={cityData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                  <XAxis type="number" hide />
                  <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fill: '#475569', fontSize: 12, fontWeight: 'bold' }} width={100} />
                  <Tooltip />
                  <Bar dataKey="value" name="Usuários" fill="#6366f1" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartContainer>
          </div>

          {/* Detailed Stats Section */}
          <div className="bg-white rounded-[2.5rem] p-8 shadow-xl border border-slate-100">
            <h3 className="text-xl font-black text-slate-900 mb-6 flex items-center gap-2">
              <TrendingUp className="text-indigo-600" />
              Eficiência das Notificações
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div className="p-6 bg-slate-50 rounded-3xl border border-slate-100">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Renovações após Aviso</p>
                <p className="text-3xl font-black text-emerald-600">{latest.notifications.renewalsAfterWarning}</p>
                <p className="text-xs text-slate-500 mt-1">Usuários que relistaram após receber alerta.</p>
              </div>
              <div className="p-6 bg-slate-50 rounded-3xl border border-slate-100">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Avisos Ignorados</p>
                <p className="text-3xl font-black text-rose-600">{latest.notifications.ignoresAfterWarning}</p>
                <p className="text-xs text-slate-500 mt-1">Anúncios que expiraram sem ação do usuário.</p>
              </div>
              <div className="p-6 bg-slate-50 rounded-3xl border border-slate-100">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Total de Renovações</p>
                <p className="text-3xl font-black text-indigo-600">{latest.interactions.renewals}</p>
                <p className="text-xs text-slate-500 mt-1">Histórico total de renovações na plataforma.</p>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

const MetricCard = ({ title, value, icon, color, subtitle }: { title: string, value: number | string, icon: React.ReactNode, color: string, subtitle?: string }) => {
  const colorClasses: Record<string, string> = {
    indigo: 'bg-indigo-50 text-indigo-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    amber: 'bg-amber-50 text-amber-600',
    rose: 'bg-rose-50 text-rose-600',
  };

  return (
    <motion.div
      whileHover={{ y: -5 }}
      className="bg-white p-6 rounded-[2rem] shadow-lg border border-slate-100 flex flex-col"
    >
      <div className={`w-12 h-12 ${colorClasses[color]} rounded-2xl flex items-center justify-center mb-4`}>
        {icon}
      </div>
      <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">{title}</p>
      <p className="text-3xl font-black text-slate-900">{value}</p>
      {subtitle && <p className="text-xs text-slate-500 mt-2 font-medium">{subtitle}</p>}
    </motion.div>
  );
};

const ChartContainer = ({ title, icon, children }: { title: string, icon: React.ReactNode, children: React.ReactNode }) => (
  <div className="bg-white p-8 rounded-[2.5rem] shadow-xl border border-slate-100">
    <div className="flex items-center gap-2 mb-6">
      <div className="text-indigo-600">{icon}</div>
      <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight">{title}</h3>
    </div>
    {children}
  </div>
);

export default AdminDashboard;
