import React from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useNavigate, useSearchParams } from 'react-router-dom';
import { LogOut, PlusCircle, Plus, User as UserIcon, ShieldCheck, ShoppingBag, Search, Menu, X, Share2, Bell, AlertTriangle } from 'lucide-react';
import { auth, db } from './firebase';
import { signOut } from 'firebase/auth';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SettingsProvider } from './context/SettingsContext';
import { collection, query, where, onSnapshot, orderBy, doc, updateDoc, limit } from 'firebase/firestore';
import Home from './pages/Home';
import Login from './pages/Login';
import Profile from './pages/Profile';
import CreateAd from './pages/CreateAd';
import AdminDashboard from './pages/AdminDashboard';
import AdminImport from './pages/AdminImport';
import AdminMarketing from './pages/AdminMarketing';
import AdminAds from './pages/AdminAds';
import AdminSettings from './pages/AdminSettings';
import AdminUsers from './pages/AdminUsers';
import AdminTeam from './pages/AdminTeam';
import Terms from './pages/Terms';
import AdminLayout from './components/AdminLayout';
import OptimizedImage from './components/OptimizedImage';
import { motion, AnimatePresence } from 'motion/react';

import { Ad } from './types';
import { formatDistanceToNow } from 'date-fns';
import { pt } from 'date-fns/locale';

const Navbar = ({ quotaExceeded, setQuotaExceeded }: { quotaExceeded: boolean, setQuotaExceeded: (v: boolean) => void }) => {
  const { user, isAdmin, loading } = useAuth();
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = React.useState(false);
  const [adminNotificationCount, setAdminNotificationCount] = React.useState(0);
  const [adminPendingAds, setAdminPendingAds] = React.useState<any[]>([]);
  const [showAdminNotifications, setShowAdminNotifications] = React.useState(false);
  const [userNotificationCount, setUserNotificationCount] = React.useState(0);
  const [notifications, setNotifications] = React.useState<any[]>([]);
  const [showNotifications, setShowNotifications] = React.useState(false);
  const [navSearch, setNavSearch] = React.useState('');

  const handleNavSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (navSearch.trim()) {
      navigate(`/?search=${encodeURIComponent(navSearch.trim())}`);
      setNavSearch('');
    }
  };

  // Notificações do usuário (limitadas para reduzir leitura)
  React.useEffect(() => {
    if (!loading && user) {
      const q = query(
        collection(db, 'notifications'),
        where('userId', '==', user.uid),
        limit(100)
      );
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const notifs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        // Filtrar e ordenar em memória para não precisar de Índices Compostos
        const filtered = notifs
          .filter(n => (n as any).read === false)
          .sort((a: any, b: any) => {
            const dateA = a.createdAt ? (typeof a.createdAt.toDate === 'function' ? a.createdAt.toDate().getTime() : new Date(a.createdAt).getTime()) : 0;
            const dateB = b.createdAt ? (typeof b.createdAt.toDate === 'function' ? b.createdAt.toDate().getTime() : new Date(b.createdAt).getTime()) : 0;
            return dateB - dateA;
          });
        setNotifications(filtered.slice(0, 20));
      }, (error) => console.error('Notifications error:', error));
      return () => unsubscribe();
    }
  }, [loading, user]);

  // Pending ads do admin (limitadas)
  React.useEffect(() => {
    if (!loading && isAdmin) {
      const q = query(
        collection(db, 'ads'),
        where('status', '==', 'pending'),
        limit(50)
      );
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const adsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Ad));
        
        // Ordenar em memória para evitar Índice Composto
        adsData.sort((a, b) => {
          const dateA = a.createdAt ? (typeof a.createdAt.toDate === 'function' ? a.createdAt.toDate().getTime() : new Date(a.createdAt).getTime()) : 0;
          const dateB = b.createdAt ? (typeof b.createdAt.toDate === 'function' ? b.createdAt.toDate().getTime() : new Date(b.createdAt).getTime()) : 0;
          return dateB - dateA;
        });

        setAdminNotificationCount(adsData.length);
        setAdminPendingAds(adsData.slice(0, 10));
      }, (error) => {
        console.error('Admin notification error:', error);
        if (error.code === 'resource-exhausted') setQuotaExceeded(true);
      });
      return () => unsubscribe();
    }
  }, [loading, isAdmin]);

  // Contagem de ads do usuário (limitadas)
  React.useEffect(() => {
    if (!loading && user) {
      const q = query(
        collection(db, 'ads'),
        where('sellerId', '==', user.uid),
        limit(100)
      );
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const userAds = snapshot.docs.map(doc => doc.data());
        const unnotifiedCount = userAds.filter(ad => 
          ['approved', 'rejected'].includes(ad.status) && 
          ad.userNotified === false
        ).length;
        setUserNotificationCount(unnotifiedCount);
      }, (error) => {
        console.error('User notification error:', error);
        if (error.code === 'resource-exhausted') setQuotaExceeded(true);
      });
      return () => unsubscribe();
    }
  }, [loading, user]);

  const handleMarkAsRead = async (id: string, adId?: string) => {
    try { 
      await updateDoc(doc(db, 'notifications', id), { read: true });
    }
    catch (err) { 
      console.error('Error marking as read:', err); 
    }
    if (adId) {
      navigate(`/profile?highlight=${adId}`);
      setShowNotifications(false);
    }
  };

  const handleLogout = async () => {
    localStorage.removeItem('demo_user');
    await signOut(auth);
    navigate('/');
    window.location.reload();
  };

  const handleShare = async () => {
    const shareData = {
      title: 'Mercado Luso',
      text: 'Confira o Mercado Luso - Compre e venda em Portugal de forma simples e segura!',
      url: window.location.origin,
    };
    try {
      if (navigator.share) await navigator.share(shareData);
      else { await navigator.clipboard.writeText(window.location.origin); alert('Link copiado para a área de transferência!'); }
    } catch (err) { console.error('Error sharing:', err); }
  };

  const handlePublishClick = () => {
    if (user) {
      navigate('/create-ad');
    } else {
      navigate('/login?mode=register');
    }
  };

  const handleLogoClick = () => {
    window.dispatchEvent(new CustomEvent('reset-category'));
  };

  return (
    <nav className="bg-white border-b border-slate-200 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16 items-center">
          <Link to="/" onClick={handleLogoClick} className="flex items-center gap-2 group">
            <div className="w-9 h-9 bg-pt-green rounded-xl flex items-center justify-center text-white group-hover:bg-pt-green/90 transition-colors shadow-sm">
              <ShoppingBag size={20} />
            </div>
            <div className="flex flex-col">
              <span className="text-xl font-brand font-bold tracking-tight leading-none">
                <span className="text-pt-green">Mercado</span>
                <span className="text-pt-red">Luso</span>
              </span>
              <span className="text-[10px] font-medium text-slate-500 tracking-wide leading-none mt-1">Compre, Venda e Negocie</span>
            </div>
          </Link>

          {/* Search Desktop */}
          <div className="hidden lg:flex flex-1 max-w-md mx-8">
            <form onSubmit={handleNavSearch} className="w-full relative">
              <input
                type="text"
                placeholder="O que procura?"
                value={navSearch}
                onChange={(e) => setNavSearch(e.target.value)}
                className="w-full bg-slate-100 border-none rounded-xl py-2 pl-10 pr-4 text-sm font-medium focus:ring-2 focus:ring-indigo-500 transition-all"
              />
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            </form>
          </div>

          {/* Desktop Nav */}
          <div className="hidden md:flex items-center gap-6">
            <button onClick={handlePublishClick} className="text-slate-600 hover:text-indigo-600 font-medium flex items-center gap-1 cursor-pointer transition-colors">
              <Plus size={20} /> <span>Publicar</span>
            </button>
            <button onClick={handleShare} className="text-slate-600 hover:text-indigo-600 font-medium flex items-center gap-1">
              <Share2 size={20} /> <span>Partilhar</span>
            </button>
            <Link to="/" className="text-slate-600 hover:text-indigo-600 font-medium transition-colors">Explorar</Link>

            {user ? <>
              <Link to="/create-ad" className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-xl hover:bg-indigo-700 transition-all shadow-sm font-medium">
                <PlusCircle size={20} /> <span>Anunciar</span>
              </Link>

              {isAdmin && <div className="relative">
                <button onClick={() => setShowAdminNotifications(!showAdminNotifications)} className="relative text-slate-600 hover:text-indigo-600 font-medium flex items-center gap-1 p-2">
                  <ShieldCheck size={20} /> <span>Admin</span>
                  {adminNotificationCount > 0 && <span className="absolute -top-1 -right-1 bg-red-600 text-white text-[10px] font-black w-5 h-5 flex items-center justify-center rounded-full border-2 border-white animate-pulse">{adminNotificationCount}</span>}
                </button>

                <AnimatePresence>
                  {showAdminNotifications && (
                    <motion.div initial={{ opacity: 0, y: 10, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10, scale: 0.95 }} className="absolute right-0 mt-2 w-80 bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden z-50">
                      <div className="p-4 border-b border-slate-50 bg-amber-50/50 flex justify-between items-center">
                        <h3 className="font-bold text-slate-900 flex items-center gap-2"><Bell size={16} className="text-amber-600" />Anúncios Pendentes</h3>
                        <div className="flex flex-col gap-2">
                          <Link to="/admin/import" onClick={() => setShowAdminNotifications(false)} className="w-full bg-emerald-500 text-white text-center py-2 rounded-xl text-[10px] font-bold hover:bg-emerald-600 transition-all uppercase tracking-wider">🚀 Importar Anúncio com IA</Link>
                          <Link to="/admin/marketing" onClick={() => setShowAdminNotifications(false)} className="w-full bg-indigo-600 text-white text-center py-2 rounded-xl text-[10px] font-bold hover:bg-indigo-700 transition-all uppercase tracking-wider">📢 Kit de Marketing</Link>
                          <Link to="/admin" onClick={() => setShowAdminNotifications(false)} className="w-full bg-indigo-50 text-indigo-600 text-center py-2 rounded-xl text-[10px] font-bold hover:bg-indigo-100 transition-all uppercase tracking-wider">Ver Painel Completo</Link>
                        </div>
                      </div>
                      <div className="max-h-96 overflow-y-auto">
                        {adminPendingAds.length === 0 ? <div className="p-8 text-center text-slate-400 text-sm">Não há anúncios pendentes.</div> :
                        adminPendingAds.map((ad, idx) => (
                          <Link key={`nav-ad-${ad.id || idx}-${idx}`} to="/admin" onClick={() => setShowAdminNotifications(false)} className="p-4 border-b border-slate-50 hover:bg-slate-50 transition-colors cursor-pointer flex gap-3">
                            <img src={ad.imageUrl} alt={ad.title} className="w-12 h-12 object-cover rounded-lg bg-slate-100 shrink-0" />
                            <div className="min-w-0">
                              <p className="text-sm font-bold text-slate-900 truncate">{ad.title}</p>
                              <p className="text-xs text-slate-500 mt-0.5">Vendedor: {ad.sellerName}</p>
                              <p className="text-[10px] text-amber-600 font-bold mt-2">{ad.createdAt?.toDate ? formatDistanceToNow(ad.createdAt.toDate(), { addSuffix: true, locale: pt }) : 'Recentemente'}</p>
                            </div>
                          </Link>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>}

              <div className="relative">
                <button onClick={() => setShowNotifications(!showNotifications)} className="relative text-slate-600 hover:text-indigo-600 font-medium flex items-center gap-1 p-2">
                  <Bell size={20}/>
                  {notifications.length > 0 && <span className="absolute top-1 right-1 bg-red-600 text-white text-[10px] font-black w-4 h-4 flex items-center justify-center rounded-full border-2 border-white">{notifications.length}</span>}
                </button>
                <AnimatePresence>
                  {showNotifications && (
                    <motion.div initial={{ opacity:0,y:10,scale:0.95 }} animate={{ opacity:1,y:0,scale:1 }} exit={{ opacity:0,y:10,scale:0.95 }} className="absolute right-0 mt-2 w-80 bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden z-50">
                      <div className="p-4 border-b border-slate-50 bg-slate-50/50">
                        <h3 className="font-bold text-slate-900">Notificações</h3>
                      </div>
                      <div className="max-h-96 overflow-y-auto">
                        {notifications.length === 0 ? <div className="p-8 text-center text-slate-400 text-sm">Não há novas notificações.</div> :
                          notifications.map((notif, idx) => (
                            <div key={`nav-notif-${notif.id || idx}-${idx}`} onClick={() => handleMarkAsRead(notif.id, notif.adId)} className="p-4 border-b border-slate-50 hover:bg-slate-50 transition-colors cursor-pointer">
                              <p className="text-xs font-bold text-indigo-600 uppercase tracking-wider mb-1">{notif.title}</p>
                              <p className="text-sm text-slate-700 leading-relaxed">{notif.message}</p>
                              <p className="text-[10px] text-slate-400 mt-2">{notif.createdAt?.toDate ? formatDistanceToNow(notif.createdAt.toDate(), { addSuffix: true, locale: pt }) : 'Recentemente'}</p>
                            </div>
                          ))
                        }
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <Link to="/profile" className="relative text-slate-600 hover:text-indigo-600 font-medium flex items-center gap-1 p-2">
                <UserIcon size={20}/> Perfil
                {userNotificationCount > 0 && <span className="absolute -top-1 -right-1 bg-indigo-600 text-white text-[10px] font-black w-5 h-5 flex items-center justify-center rounded-full border-2 border-white animate-pulse">{userNotificationCount}</span>}
              </Link>

              <button onClick={handleLogout} className="text-slate-600 hover:text-red-600 font-medium flex items-center gap-1 p-2">
                <LogOut size={20}/> Sair
              </button>
            </> :
            <Link to="/login" className="bg-indigo-600 text-white px-6 py-2 rounded-xl hover:bg-indigo-700 transition-all shadow-sm font-medium">Entrar</Link>}
          </div>

          {/* Mobile Menu */}
          <div className="md:hidden flex items-center gap-2">
            <button onClick={handlePublishClick} title="Publicar" className="text-slate-600 p-2 hover:bg-slate-100 rounded-full transition-colors flex items-center justify-center">
              <Plus size={24}/>
            </button>
            <button onClick={handleShare} className="text-slate-600 p-2 hover:bg-slate-100 rounded-full transition-colors"><Share2 size={24}/></button>
            <button onClick={() => setIsOpen(!isOpen)} className="text-slate-600 p-2">{isOpen ? <X size={28}/> : <Menu size={28}/>}</button>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {isOpen && (
          <motion.div initial={{opacity:0,height:0}} animate={{opacity:1,height:'auto'}} exit={{opacity:0,height:0}} className="md:hidden bg-white border-t border-slate-100 overflow-hidden">
            <div className="px-4 py-6 space-y-4 flex flex-col">
              <Link to="/" onClick={() => setIsOpen(false)} className="text-lg font-medium text-slate-700">Explorar</Link>
              {user ? <>
                <Link to="/create-ad" onClick={() => setIsOpen(false)} className="text-lg font-medium text-indigo-600">Anunciar</Link>
                {isAdmin && <Link to="/admin" onClick={() => setIsOpen(false)} className="text-lg font-medium text-slate-700 flex items-center gap-2">Admin {adminNotificationCount>0 && <span className="bg-red-600 text-white text-xs px-2 py-0.5 rounded-full">{adminNotificationCount}</span>}</Link>}
                <Link to="/profile" onClick={() => setIsOpen(false)} className="text-lg font-medium text-slate-700 flex items-center gap-2">Perfil {userNotificationCount>0 && <span className="bg-indigo-600 text-white text-xs px-2 py-0.5 rounded-full">{userNotificationCount}</span>}</Link>
                <button onClick={() => {handleLogout(); setIsOpen(false);}} className="text-lg font-medium text-red-600 text-left">Sair</button>
              </> : <Link to="/login" onClick={() => setIsOpen(false)} className="text-lg font-medium text-indigo-600">Entrar</Link>}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
};

export default function App() {
  const mainRef = React.useRef<HTMLDivElement>(null);
  const [quotaExceeded, setQuotaExceeded] = React.useState(false);

  React.useEffect(() => {
    const slider = mainRef.current;
    if (!slider) return;

    let isDown = false;
    let startY: number;
    let scrollTop: number;

    const onMouseDown = (e: MouseEvent) => {
      isDown = true;
      slider.classList.add('active');
      startY = e.pageY - slider.offsetTop;
      scrollTop = window.scrollY;
    };

    const onMouseLeave = () => {
      isDown = false;
      slider.classList.remove('active');
    };

    const onMouseUp = () => {
      isDown = false;
      slider.classList.remove('active');
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!isDown) return;
      e.preventDefault();
      const y = e.pageY - slider.offsetTop;
      const walk = (y - startY) * 2; // Scroll speed
      window.scrollTo(0, scrollTop - walk);
    };

    slider.addEventListener('mousedown', onMouseDown);
    slider.addEventListener('mouseleave', onMouseLeave);
    slider.addEventListener('mouseup', onMouseUp);
    slider.addEventListener('mousemove', onMouseMove);

    return () => {
      slider.removeEventListener('mousedown', onMouseDown);
      slider.removeEventListener('mouseleave', onMouseLeave);
      slider.removeEventListener('mouseup', onMouseUp);
      slider.removeEventListener('mousemove', onMouseMove);
    };
  }, []);

  return (
    <SettingsProvider>
      <AuthProvider>
        <Router>
        <div className="min-h-screen font-sans text-slate-900 selection:bg-pt-green/10">
          <Navbar quotaExceeded={quotaExceeded} setQuotaExceeded={setQuotaExceeded} />
          
          <AnimatePresence>
            {quotaExceeded && (
              <div key="quota-alert" className="fixed bottom-4 left-4 right-4 z-[9999]">
                <motion.div 
                  initial={{ y: 50, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: 50, opacity: 0 }}
                  className="bg-amber-50 border border-amber-200 p-4 rounded-2xl shadow-2xl flex items-center gap-3 max-w-lg mx-auto"
                >
                  <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center text-amber-600 shrink-0">
                    <AlertTriangle size={20} />
                  </div>
                  <div className="flex-1 text-left">
                    <p className="text-amber-900 font-bold text-sm">Limite Diário Atingido</p>
                    <p className="text-amber-700 text-xs mt-0.5">
                      O marketplace atingiu o limite de consultas gratuitas do dia. Algumas informações podem estar desatualizadas.
                    </p>
                  </div>
                  <button 
                    onClick={() => setQuotaExceeded(false)}
                    className="p-2 text-amber-400 hover:text-amber-600"
                  >
                    <X size={20} />
                  </button>
                </motion.div>
              </div>
            )}
          </AnimatePresence>

          <main ref={mainRef} className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 cursor-grab active:cursor-grabbing">
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/login" element={<Login />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="/create-ad" element={<CreateAd />} />
              <Route path="/edit-ad/:id" element={<CreateAd />} />
              <Route path="/admin" element={<AdminLayout><AdminDashboard /></AdminLayout>} />
              <Route path="/admin/dashboard" element={<AdminLayout><AdminDashboard /></AdminLayout>} />
              <Route path="/admin/import" element={<AdminLayout><AdminImport /></AdminLayout>} />
              <Route path="/admin/marketing" element={<AdminLayout><AdminMarketing /></AdminLayout>} />
              <Route path="/admin/ads" element={<AdminLayout><AdminAds /></AdminLayout>} />
              <Route path="/admin/settings" element={<AdminLayout><AdminSettings /></AdminLayout>} />
              <Route path="/admin/users" element={<AdminLayout><AdminUsers /></AdminLayout>} />
              <Route path="/admin/team" element={<AdminLayout><AdminTeam /></AdminLayout>} />
              <Route path="/terms" element={<Terms />} />
            </Routes>
          </main>
          <footer className="bg-white border-t border-slate-200 py-12 mt-20">
            <div className="max-w-7xl mx-auto px-4 text-center">
              <p className="text-slate-500 text-sm">© 2026 Mercado Luso. Simples, rápido e seguro.</p>
              <div className="mt-4 flex justify-center gap-6 text-slate-400 text-xs uppercase tracking-widest font-semibold">
                <Link to="/terms" className="hover:text-indigo-600">Termos de Uso</Link>
                <Link to="/terms" className="hover:text-indigo-600">Privacidade</Link>
                <a href="https://wa.me/4407508309536" target="_blank" rel="noopener noreferrer" className="hover:text-indigo-600">Suporte</a>
              </div>
            </div>
          </footer>
        </div>
      </Router>
    </AuthProvider>
  </SettingsProvider>
);
}
