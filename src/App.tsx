import React from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { LogOut, PlusCircle, Plus, User as UserIcon, ShieldCheck, ShoppingBag, Search, Menu, X, Share2, Bell, AlertTriangle } from 'lucide-react';
import { auth, db, getDocsWithCacheFallback } from './firebase';
import { signOut } from 'firebase/auth';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SettingsProvider } from './context/SettingsContext';
import { collection, query, where, orderBy, doc, updateDoc, limit, onSnapshot, addDoc, serverTimestamp } from 'firebase/firestore';
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
import Suggestions from './pages/Suggestions';
import FAQ from './pages/FAQ';
import AdminSuggestions from './pages/AdminSuggestions';
import { Helmet, HelmetProvider } from 'react-helmet-async';
import AdminLayout from './components/AdminLayout';
import OptimizedImage from './components/OptimizedImage';
import { motion, AnimatePresence } from 'motion/react';
import Links from './pages/Links';

import { Ad } from './types';
import { formatDistanceToNow } from 'date-fns';
import { pt } from 'date-fns/locale';
import { useClickOutside } from './hooks/useClickOutside';

const Navbar = () => {
  const { user, isAdmin, isModerator, loading } = useAuth();
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = React.useState(false);
  const [adminNotificationCount, setAdminNotificationCount] = React.useState(0);
  const [adminPendingAds, setAdminPendingAds] = React.useState<any[]>([]);
  const [showAdminNotifications, setShowAdminNotifications] = React.useState(false);
  const [userNotificationCount, setUserNotificationCount] = React.useState(0);
  const [notifications, setNotifications] = React.useState<any[]>([]);
  const [showNotifications, setShowNotifications] = React.useState(false);
  const [navSearch, setNavSearch] = React.useState('');
  const [showUserDropdown, setShowUserDropdown] = React.useState(false);
  
  const userDropdownRef = React.useRef<HTMLDivElement>(null);
  const adminNotificationsRef = React.useRef<HTMLDivElement>(null);
  const notificationsRef = React.useRef<HTMLDivElement>(null);
  const navRef = React.useRef<HTMLElement>(null);

  useClickOutside(userDropdownRef, () => {
    setShowUserDropdown(false);
  });

  useClickOutside(adminNotificationsRef, () => {
    setShowAdminNotifications(false);
  });

  useClickOutside(notificationsRef, () => {
    setShowNotifications(false);
  });

  useClickOutside(navRef, () => {
    setIsOpen(false);
  });

  const handleNavSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (navSearch.trim()) {
      navigate(`/?search=${encodeURIComponent(navSearch.trim())}`);
      setNavSearch('');
    }
  };

  React.useEffect(() => {
    if (!user) {
      setNotifications([]);
      return;
    }
    const q = query(
      collection(db, 'notifications'),
      where('userId', '==', user.uid),
      where('read', '==', false)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as any[];
      // Ordena por criação decrescente (já estão filtradas por read == false)
      const unreadList = list.sort((a, b) => {
        const timeA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
        const timeB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
        return timeB - timeA;
      });
      setNotifications(unreadList);
    }, (err) => {
      console.error('Erro ao ouvir notificações:', err);
    });
    return () => unsubscribe();
  }, [user]);

  // Notificações do usuário, pending ads do admin e contagem de ads desativados do Firestore globais
  // para blindagem total contra consumo excessivo de leituras. O Navbar agora é 100% estático.

  const handleMarkAsRead = async (id: string, adId?: string, type?: string) => {
    // 2. Remover a notificação do estado local imediatamente.
    setNotifications(prev => prev.filter(n => n.id !== id));

    const notificationObject = notifications.find(n => n.id === id);
    const notificationType = type || notificationObject?.type;

    // 3 & 4. Se existir adId, navegar para /profile?tab=anuncios&highlight=<adId>. Se for ad_pending, ir para /admin/ads. Se não, apenas fechar o menu.
    if (notificationType === 'ad_pending') {
      navigate('/admin/ads');
    } else if (adId) {
      navigate(`/profile?tab=anuncios&highlight=${adId}`);
    }
    setShowNotifications(false);

    try { 
      // 1. Ao clicar, atualizar Firestore: read = true.
      await updateDoc(doc(db, 'notifications', id), { read: true });
    }
    catch (err) { 
      // 5. Mostrar no console se updateDoc falhar.
      console.error('Error marking notification as read in Firestore:', err); 
    }
  };

  const handleLogout = async () => {
    localStorage.removeItem('demo_user');
    await signOut(auth);
    navigate('/');
    window.location.reload();
  };

  const handleShare = async () => {
    const officialUrl = 'https://www.mercado-luso.com';
    const shareData = {
      title: 'Mercado Luso',
      text: 'Confira o Mercado Luso - Compre e venda em Portugal de forma simples e segura!',
      url: officialUrl,
    };
    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          try {
            await navigator.clipboard.writeText(officialUrl);
            alert('Link copiado com sucesso.');
          } catch (clipErr) {
            console.error('Failed to copy fallback:', clipErr);
          }
        }
      }
    } else {
      try {
        await navigator.clipboard.writeText(officialUrl);
        alert('Link copiado com sucesso.');
      } catch (err) {
        console.error('Clipboard copy failed:', err);
      }
    }
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
    <nav ref={navRef} className="bg-[#bfead0] border-b border-[#a8dec0] sticky top-0 z-50 shadow-sm/50">
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
                placeholder="✨ O que procura hoje? Digite aqui..."
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

              {isAdmin && <div className="relative" ref={adminNotificationsRef}>
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

              <div className="relative" ref={notificationsRef}>
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
                            <div key={`nav-notif-${notif.id || idx}-${idx}`} onClick={() => handleMarkAsRead(notif.id, notif.adId, notif.type)} className="p-4 border-b border-slate-50 hover:bg-slate-50 transition-colors cursor-pointer">
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

              {/* User Dropdown de Conta */}
              <div className="relative" ref={userDropdownRef}>
                <button
                  onClick={() => setShowUserDropdown(!showUserDropdown)}
                  className="relative text-slate-600 hover:text-indigo-600 font-medium flex items-center gap-1.5 p-2 cursor-pointer outline-none transition-all"
                  id="user-account-dropdown-toggle"
                >
                  <div className="w-8 h-8 rounded-full bg-white border border-indigo-200/60 flex items-center justify-center text-indigo-600 shrink-0 select-none shadow-sm">
                    <UserIcon size={16} />
                  </div>
                  <span className="hidden sm:inline">Conta</span>
                  {userNotificationCount > 0 && (
                    <span className="absolute -top-1 -right-1 bg-indigo-600 text-white text-[10px] font-black w-5 h-5 flex items-center justify-center rounded-full border-2 border-white animate-pulse">
                      {userNotificationCount}
                    </span>
                  )}
                </button>

                <AnimatePresence>
                  {showUserDropdown && (
                    <motion.div
                      initial={{ opacity: 0, y: 10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 10, scale: 0.95 }}
                      className="absolute right-0 mt-2 w-56 bg-white rounded-2xl shadow-xl border border-slate-100 py-2.5 z-[100] text-slate-800"
                      id="desktop-account-menu"
                    >
                      <Link
                        to="/profile"
                        onClick={() => setShowUserDropdown(false)}
                        className="flex items-center gap-2 px-4 py-2 hover:bg-slate-50 transition-colors text-sm font-semibold text-slate-700"
                        id="menu-meu-perfil"
                      >
                        Meu Perfil
                      </Link>

                      {isModerator && !isAdmin && (
                        <Link
                          to="/admin/ads"
                          onClick={() => setShowUserDropdown(false)}
                          className="flex items-center gap-2 px-4 py-2 hover:bg-slate-50 transition-colors text-sm font-semibold text-slate-700"
                          id="menu-gerir-anuncios"
                        >
                          Gerir Anúncios
                        </Link>
                      )}

                      <Link
                        to="/profile?tab=favorites"
                        onClick={() => setShowUserDropdown(false)}
                        className="flex items-center gap-2 px-4 py-2 hover:bg-slate-50 transition-colors text-sm font-semibold text-slate-700"
                        id="menu-favoritos"
                      >
                        Favoritos
                      </Link>

                      <Link
                        to="/profile?tab=anuncios"
                        onClick={() => setShowUserDropdown(false)}
                        className="flex items-center gap-2 px-4 py-2 hover:bg-slate-50 transition-colors text-sm font-semibold text-slate-700"
                        id="menu-meus-anuncios"
                      >
                        Meus Anúncios
                      </Link>

                      <Link
                        to="/create-ad"
                        onClick={() => setShowUserDropdown(false)}
                        className="flex items-center gap-2 px-4 py-2 hover:bg-slate-50 transition-colors text-sm font-semibold text-slate-700"
                        id="menu-criar-anuncio"
                      >
                        Criar Anúncio
                      </Link>

                      <Link
                        to="/sugestoes"
                        onClick={() => setShowUserDropdown(false)}
                        className="flex items-center gap-2 px-4 py-2 hover:bg-slate-50 transition-colors text-sm font-semibold text-slate-700"
                        id="menu-sugestoes"
                      >
                        Sugestões
                      </Link>

                      <div className="border-t border-slate-100 my-2" />

                      <Link
                        to="/links"
                        onClick={() => setShowUserDropdown(false)}
                        className="flex items-center gap-2 px-4 py-2 hover:bg-emerald-50 text-emerald-600 transition-colors text-sm font-black"
                        id="menu-links-uteis"
                      >
                        <span>🔗 Links Úteis</span>
                      </Link>

                      <div className="border-t border-slate-100 my-2" />

                      <button
                        onClick={() => {
                          setShowUserDropdown(false);
                          handleLogout();
                        }}
                        className="flex items-center gap-2 w-full text-left px-4 py-2 hover:bg-rose-50 text-rose-600 transition-colors text-sm font-bold"
                        id="menu-sair"
                      >
                        <LogOut size={16} />
                        <span>Sair</span>
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </> :
            <Link to="/login" className="bg-indigo-600 text-white px-6 py-2 rounded-xl hover:bg-indigo-700 transition-all shadow-sm font-medium">Entrar</Link>}
          </div>

          {/* Mobile Menu */}
          <div className="md:hidden flex items-center gap-3">
            <button 
              onClick={handlePublishClick} 
              title="Anunciar" 
              className="text-slate-600 hover:text-indigo-600 transition-colors flex flex-col items-center justify-center p-1.5 cursor-pointer hover:bg-slate-50 rounded-xl"
            >
              <Plus size={20}/>
              <span className="text-[9px] font-bold tracking-tight mt-0.5 leading-none">Anunciar</span>
            </button>
            <button 
              onClick={handleShare} 
              title="Partilhar"
              className="text-slate-600 hover:text-indigo-600 transition-colors flex flex-col items-center justify-center p-1.5 cursor-pointer hover:bg-slate-50 rounded-xl"
            >
              <Share2 size={20}/>
              <span className="text-[9px] font-bold tracking-tight mt-0.5 leading-none">Partilhar</span>
            </button>
            <button 
              onClick={() => setIsOpen(!isOpen)} 
              title="Menu"
              className="text-slate-600 hover:text-indigo-600 transition-colors flex flex-col items-center justify-center p-1.5 cursor-pointer hover:bg-slate-50 rounded-xl"
            >
              {isOpen ? <X size={20}/> : <Menu size={20}/>}
              <span className="text-[9px] font-bold tracking-tight mt-0.5 leading-none">Menu</span>
            </button>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {isOpen && (
          <motion.div initial={{opacity:0,height:0}} animate={{opacity:1,height:'auto'}} exit={{opacity:0,height:0}} className="md:hidden bg-white border-t border-slate-100 overflow-hidden shadow-inner">
            <div className="px-4 py-6 space-y-4 flex flex-col">
              <Link to="/" onClick={() => setIsOpen(false)} className="text-lg font-black text-slate-700">Explorar</Link>
              
              {user ? <>
                {isAdmin && (
                  <Link to="/admin" onClick={() => setIsOpen(false)} className="text-lg font-medium text-slate-700 flex items-center gap-2">
                    Admin {adminNotificationCount > 0 && <span className="bg-red-600 text-white text-xs px-2 py-0.5 rounded-full">{adminNotificationCount}</span>}
                  </Link>
                )}

                {isModerator && !isAdmin && (
                  <Link to="/admin/ads" onClick={() => setIsOpen(false)} className="text-lg font-medium text-slate-700 flex items-center gap-2">
                    Gerir Anúncios
                  </Link>
                )}

                <div className="border-t border-slate-100 pt-4 space-y-3.5 flex flex-col">
                  <Link to="/profile" onClick={() => setIsOpen(false)} className="text-md font-bold text-slate-700">
                    Meu Perfil
                  </Link>
                  <Link to="/profile?tab=favorites" onClick={() => setIsOpen(false)} className="text-md font-bold text-slate-700">
                    Favoritos
                  </Link>
                  <Link to="/profile?tab=anuncios" onClick={() => setIsOpen(false)} className="text-md font-bold text-slate-700">
                    Meus Anúncios
                  </Link>
                  <Link to="/create-ad" onClick={() => setIsOpen(false)} className="text-md font-bold text-slate-700">
                    Criar Anuncio
                  </Link>
                  <Link to="/sugestoes" onClick={() => setIsOpen(false)} className="text-md font-bold text-slate-700">
                    Sugestões
                  </Link>
                  
                  <div className="border-t border-slate-100 pt-4" />
                  
                  <Link to="/links" onClick={() => setIsOpen(false)} className="text-md font-black text-emerald-600 flex items-center gap-1">
                    🔗 Links Úteis
                  </Link>
                  
                  <div className="border-t border-slate-100 pt-4" />
                  
                  <button onClick={() => { handleLogout(); setIsOpen(false); }} className="text-md font-bold text-red-600 text-left">
                    Sair
                  </button>
                </div>
              </> : (
                <Link to="/login" onClick={() => setIsOpen(false)} className="text-lg font-black text-indigo-600">Entrar</Link>
              )}
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
        <meta name="description" content="O Mercado Luso é uma plataforma de anúncios e negócios criada para conectar toda a comunidade de língua portuguesa em qualquer lugar do mundo." />
        <link rel="canonical" href="https://www.mercado-luso.com" />
        <meta property="og:url" content="https://www.mercado-luso.com" />
        <meta property="og:type" content="website" />
        <meta property="og:title" content="Mercado Luso - Classificados & IA Copilot" />
        <meta property="og:description" content="O Mercado Luso é uma plataforma de anúncios e negócios criada para conectar toda a comunidade de língua portuguesa em qualquer lugar do mundo." />
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
                <Route path="/sugestoes" element={<Suggestions />} />
                <Route path="/faq" element={<FAQ />} />
                <Route path="/links" element={<Links />} />
                <Route path="/admin/suggestions" element={<AdminLayout><AdminSuggestions /></AdminLayout>} />
              </Routes>
            </main>
            <footer className="bg-white border-t border-slate-200 py-12 mt-20">
              <div className="max-w-7xl mx-auto px-4 text-center">
                <p className="text-sm font-extrabold transition-colors" style={{ color: '#52b64d' }}>© 2026 Mercado Luso. Simples, rápido e seguro.</p>
                <div className="mt-4 flex justify-center gap-6 text-slate-400 text-xs uppercase tracking-widest font-semibold flex-wrap items-center">
                  <Link to="/faq" className="hover:text-indigo-600">Perguntas Frequentes</Link>
                  <Link to="/sugestoes" className="hover:text-indigo-600">Sugestões</Link>
                  <Link to="/terms" className="hover:text-indigo-600" style={{ color: '#ff2056' }}>Termos de Uso</Link>
                  <Link to="/privacy" className="hover:text-indigo-600">Privacidade</Link>
                  <Link to="/cookies" className="hover:text-indigo-600">Política de Cookies</Link>
                  <Link to="/denuncia" className="text-rose-500 hover:text-rose-600 transition-colors">Denúncia</Link>
                  <a href="https://wa.me/4407508309536" target="_blank" rel="noopener noreferrer" className="hover:text-indigo-600">Suporte</a>
                  <a href="mailto:mercadolusopt@gmail.com" className="hover:text-indigo-600 text-slate-500 transition-colors normal-case flex items-center gap-1 font-semibold">
                    <span>📧</span> Contacto: mercadolusopt@gmail.com
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
