import React from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { LogOut, PlusCircle, Plus, User as UserIcon, ShieldCheck, ShoppingBag, Search, Menu, X, Share2, Bell, AlertTriangle } from 'lucide-react';
import { auth, db, getDocsWithCacheFallback } from './firebase';
import { signOut } from 'firebase/auth';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SettingsProvider } from './context/SettingsContext';
import { collection, query, where, orderBy, doc, updateDoc, limit } from 'firebase/firestore';
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
import Privacy from './pages/Privacy';
import Cookies from './pages/Cookies';
import Report from './pages/Report';
import AdDetails from './pages/AdDetails';
import { Helmet, HelmetProvider } from 'react-helmet-async';
import AdminLayout from './components/AdminLayout';
import OptimizedImage from './components/OptimizedImage';
import { motion, AnimatePresence } from 'motion/react';

import { Ad } from './types';
import { formatDistanceToNow } from 'date-fns';
import { pt } from 'date-fns/locale';

const Navbar = () => {
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

  // Notificações do usuário, pending ads do admin e contagem de ads desativados do Firestore globais
  // para blindagem total contra consumo excessivo de leituras. O Navbar agora é 100% estático.

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
    <nav className="bg-[#bfead0] border-b border-[#a8dec0] sticky top-0 z-50 shadow-sm/50">
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
              <span className="text-[10px] font-medium text-slate-600 tracking-wide leading-none mt-1">Compre, Venda e Negocie</span>
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
                className="w-full bg-white/90 border border-[#a8dec0]/60 rounded-xl py-2 pl-10 pr-4 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-pt-green/50 focus:bg-white transition-all shadow-sm"
              />
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
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

const ScrollToTop = () => {
  const { pathname } = useLocation();

  React.useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return null;
};

export default function App() {
  const mainRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    try {
      const searchParams = new URLSearchParams(window.location.search);
      const refCode = searchParams.get('ref');
      if (refCode) {
        localStorage.setItem('referred_by_code', refCode.trim().toUpperCase());
        console.log('Saved referral code to localStorage:', refCode);
      }
    } catch (e) {
      console.error('Error parsing referral query:', e);
    }
  }, []);

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
    <HelmetProvider>
      <Helmet>
        <title>Mercado Luso - Classificados & IA Copilot</title>
        <meta name="description" content="Marketplace moderno para Portugal, focado em simplicidade, conexão via WhatsApp e com copiloto de Inteligência Artificial." />
        <link rel="canonical" href="https://www.mercado-luso.com" />
        <meta property="og:url" content="https://www.mercado-luso.com" />
        <meta property="og:type" content="website" />
        <meta property="og:title" content="Mercado Luso - Classificados & IA Copilot" />
        <meta property="og:description" content="Marketplace moderno para Portugal, focado em simplicidade, conexão via WhatsApp e com copiloto de Inteligência Artificial." />
        <meta name="twitter:card" content="summary_large_image" />
      </Helmet>
      <SettingsProvider>
        <AuthProvider>
          <Router>
            <ScrollToTop />
            <div className="min-h-screen font-sans text-slate-900 selection:bg-pt-green/10">
            <Navbar />

            <main ref={mainRef} className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 cursor-grab active:cursor-grabbing">
              <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/login" element={<Login />} />
                <Route path="/profile" element={<Profile />} />
                <Route path="/create-ad" element={<CreateAd />} />
                <Route path="/edit-ad/:id" element={<CreateAd />} />
                <Route path="/anuncio/:id" element={<AdDetails />} />
                <Route path="/admin" element={<AdminLayout><AdminDashboard /></AdminLayout>} />
                <Route path="/admin/dashboard" element={<AdminLayout><AdminDashboard /></AdminLayout>} />
                <Route path="/admin/import" element={<AdminLayout><AdminImport /></AdminLayout>} />
                <Route path="/admin/marketing" element={<AdminLayout><AdminMarketing /></AdminLayout>} />
                <Route path="/admin/ads" element={<AdminLayout><AdminAds /></AdminLayout>} />
                <Route path="/admin/settings" element={<AdminLayout><AdminSettings /></AdminLayout>} />
                <Route path="/admin/users" element={<AdminLayout><AdminUsers /></AdminLayout>} />
                <Route path="/admin/team" element={<AdminLayout><AdminTeam /></AdminLayout>} />
                <Route path="/terms" element={<Terms />} />
                <Route path="/privacy" element={<Privacy />} />
                <Route path="/cookies" element={<Cookies />} />
                <Route path="/denuncia" element={<Report />} />
              </Routes>
            </main>
            <footer className="bg-white border-t border-slate-200 py-12 mt-20">
              <div className="max-w-7xl mx-auto px-4 text-center">
                <p className="text-sm font-extrabold transition-colors" style={{ color: '#52b64d' }}>© 2026 Mercado Luso. Simples, rápido e seguro.</p>
                <div className="mt-4 flex justify-center gap-6 text-slate-400 text-xs uppercase tracking-widest font-semibold flex-wrap items-center">
                  <Link to="/terms" className="hover:text-indigo-600" style={{ color: '#ff2056' }}>Termos de Uso</Link>
                  <Link to="/privacy" className="hover:text-indigo-600">Privacidade</Link>
                  <Link to="/cookies" className="hover:text-indigo-600">Política de Cookies</Link>
                  <Link to="/denuncia" className="text-rose-500 hover:text-rose-600 transition-colors">Denúncia</Link>
                  <a href="https://wa.me/4407508309536" target="_blank" rel="noopener noreferrer" className="hover:text-indigo-600">Suporte</a>
                  <a href="mailto:mercalusopt@gmail.com" className="hover:text-indigo-600 text-slate-500 transition-colors normal-case flex items-center gap-1 font-semibold">
                    <span>📧</span> Contacto: mercalusopt@gmail.com
                  </a>
                </div>
              </div>
            </footer>
          </div>
        </Router>
      </AuthProvider>
    </SettingsProvider>
  </HelmetProvider>
);
}
