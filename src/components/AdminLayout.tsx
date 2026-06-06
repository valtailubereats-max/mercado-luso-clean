import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { 
  LayoutDashboard, 
  Upload, 
  ShoppingBag, 
  Users, 
  Settings, 
  Menu, 
  X, 
  ChevronRight,
  LogOut,
  Bell,
  Megaphone,
  Briefcase,
  MessageSquare
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface AdminLayoutProps {
  children: React.ReactNode;
}

const AdminLayout: React.FC<AdminLayoutProps> = ({ children }) => {
  const { isAdmin, loading, user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const menuItems = [
    { icon: LayoutDashboard, label: 'Dashboard', path: '/admin/dashboard' },
    { icon: Upload, label: 'Importar via IA', path: '/admin/import' },
    { icon: ShoppingBag, label: 'Gerir Anúncios', path: '/admin/ads' },
    { icon: Users, label: 'Utilizadores', path: '/admin/users' },
    { icon: Briefcase, label: 'Gestão de Equipe', path: '/admin/team' },
    { icon: Megaphone, label: 'Marketing', path: '/admin/marketing' },
    { icon: MessageSquare, label: 'Sugestões', path: '/admin/suggestions' },
    { icon: Settings, label: 'Definições', path: '/admin/settings' },
  ];

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <div className="max-w-md w-full bg-white p-8 rounded-2xl shadow-sm border border-slate-200 text-center">
          <div className="w-16 h-16 bg-red-50 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
            <X size={32} />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Acesso Negado</h1>
          <p className="text-slate-500 mb-6">Você não tem permissões suficientes para aceder a esta área.</p>
          <button 
            onClick={() => navigate('/')}
            className="w-full bg-indigo-600 text-white py-3 rounded-xl font-bold hover:bg-indigo-700 transition-all"
          >
            Voltar ao Início
          </button>
        </div>
      </div>
    );
  }

  const SidebarContent = () => (
    <div className="flex flex-col h-full py-6 px-4">
      <div className="flex items-center gap-3 px-2 mb-10">
        <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-indigo-200">
          <ShoppingBag size={24} />
        </div>
        <div>
          <h2 className="text-lg font-black text-slate-900 leading-none">Admin</h2>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Mercado Luso</p>
        </div>
      </div>

      <nav className="flex-1 space-y-1">
        {menuItems.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <Link
              key={item.path}
              to={item.path}
              onClick={() => setIsMobileMenuOpen(false)}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl font-bold transition-all group ${
                isActive 
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100' 
                  : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <item.icon size={20} className={isActive ? 'text-white' : 'text-slate-400 group-hover:text-indigo-600'} />
              <span className="flex-1">{item.label}</span>
              {isActive && <ChevronRight size={16} />}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto pt-6 border-t border-slate-100">
        <div className="flex items-center gap-3 px-2 mb-6">
          <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center text-slate-600 font-bold">
            {user?.email?.[0].toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-slate-900 truncate">{user?.email?.split('@')[0]}</p>
            <p className="text-[10px] text-slate-400 truncate">Administrador</p>
          </div>
        </div>
        <button 
          onClick={() => navigate('/')}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold text-slate-500 hover:bg-red-50 hover:text-red-600 transition-all group"
        >
          <LogOut size={20} className="text-slate-400 group-hover:text-red-600" />
          <span>Sair do Painel</span>
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:block w-72 bg-white border-r border-slate-200 sticky top-0 h-screen">
        <SidebarContent />
      </aside>

      {/* Mobile Menu Overlay */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsMobileMenuOpen(false)}
              className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-40 lg:hidden"
            />
            <motion.aside
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed inset-y-0 left-0 w-72 bg-white z-50 lg:hidden shadow-2xl"
            >
              <SidebarContent />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile Header */}
        <header className="lg:hidden bg-white border-b border-slate-200 h-16 flex items-center justify-between px-4 sticky top-0 z-30">
          <button 
            onClick={() => setIsMobileMenuOpen(true)}
            className="p-2 -ml-2 text-slate-600 hover:bg-slate-50 rounded-xl transition-colors"
          >
            <Menu size={24} />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white">
              <ShoppingBag size={18} />
            </div>
            <span className="font-black text-slate-900">Admin</span>
          </div>
          <div className="w-10 h-10" /> {/* Spacer for centering */}
        </header>

        <main className="flex-1 overflow-y-auto">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
};

export default AdminLayout;
