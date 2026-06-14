import React, { useState, useEffect } from 'react';
import { collection, query, orderBy, limit, updateDoc, doc, getDocs, getDoc, setDoc, where } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType, parseFirestoreDate } from '../firebase';
import { UserProfile } from '../types';
import { useAuth } from '../context/AuthContext';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Users, 
  Search, 
  Shield, 
  ShieldAlert, 
  UserCheck, 
  UserX,
  Mail,
  Calendar,
  Clock,
  MoreVertical,
  AlertCircle,
  Sparkles,
  Pencil,
  X,
  MapPin,
  Phone
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { pt } from 'date-fns/locale';
import { manualAddCredits, manualAddPoints } from '../utils/rewards';

const AdminUsers = () => {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);
  const [limitAmount, setLimitAmount] = useState(100);
  const [hasMore, setHasMore] = useState(false);
  
  // Debug Tool States
  const [debugSelectedUserId, setDebugSelectedUserId] = useState<string>('');
  const [debugStatus, setDebugStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null);
  const [debugLoading, setDebugLoading] = useState(false);
  
  const { isAdmin } = useAuth();

  // User Profile Editing States
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editCity, setEditCity] = useState('');
  const [editCountry, setEditCountry] = useState<'Portugal' | 'Reino Unido' | ''>('');
  const [editRole, setEditRole] = useState<'user' | 'moderator' | 'admin'>('user');
  const [editReferralCredits, setEditReferralCredits] = useState<number>(0);
  const [editPointsFromAds, setEditPointsFromAds] = useState<number>(0);
  const [editError, setEditError] = useState<string | null>(null);
  const [editSuccess, setEditSuccess] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const [editShowcaseActive, setEditShowcaseActive] = useState(false);
  const [editShowcaseApproved, setEditShowcaseApproved] = useState(false);
  const [editShowcaseName, setEditShowcaseName] = useState('');

  const handleOpenEditModal = (user: UserProfile) => {
    setEditingUser(user);
    setEditName(user.name || '');
    setEditEmail(user.email || '');
    setEditPhone(user.phone || '');
    setEditCity(user.city || '');
    setEditCountry(user.country || '');
    setEditRole(user.role || 'user');
    setEditReferralCredits(user.referralCredits || 0);
    setEditPointsFromAds(user.pointsFromAds || 0);
    setEditShowcaseActive(user.showcaseActive || false);
    setEditShowcaseApproved(user.showcaseApproved || false);
    setEditShowcaseName(user.showcaseName || '');
    setEditError(null);
    setEditSuccess(null);
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    if (!isAdmin) {
      setEditError("Apenas administradores podem editar dados dos utilizadores.");
      return;
    }

    const editingUserId = editingUser.id || editingUser.uid;
    if (!editingUserId) {
      setEditError("ID do utilizador inválido.");
      return;
    }

    setIsSaving(true);
    setEditError(null);
    setEditSuccess(null);

    try {
      // Validate Name
      if (!editName.trim()) {
        setEditError("O nome não pode estar vazio.");
        setIsSaving(false);
        return;
      }

      // Check if phone has at least 7 digits (if provided)
      let finalPhone = editPhone.trim();
      if (finalPhone) {
        const digitsOnly = finalPhone.replace(/\D/g, '').trim();
        if (digitsOnly.length < 7) {
          setEditError("Por favor, insira um número de telemóvel válido (mínimo 7 dígitos).");
          setIsSaving(false);
          return;
        }

        // Validate phone uniqueness: same logic as Profile
        const usersQuery = query(
          collection(db, 'users'),
          where('phone', '==', finalPhone)
        );
        const querySnap = await getDocs(usersQuery);
        const duplicateUser = querySnap.docs.find(doc => doc.id !== editingUserId);
        if (duplicateUser) {
          setEditError("Este número de telemóvel já está associado a outro utilizador. Por favor, utilize outro número.");
          setIsSaving(false);
          return;
        }
      }

      // Update basic fields in user document (SetDoc with merge: true)
      const userDocRef = doc(db, 'users', editingUserId);
      const updatedFields: any = {
        name: editName.trim(),
        phone: finalPhone,
        city: editCity.trim(),
        country: editCountry || null,
        role: editRole,
        referralCredits: Number(editReferralCredits) || 0,
        pointsFromAds: Number(editPointsFromAds) || 0,
        showcaseActive: editShowcaseActive,
        showcaseApproved: editShowcaseApproved,
      };

      await setDoc(userDocRef, updatedFields, { merge: true });

      // Synchronize to sellerPublicProfiles
      try {
        const publicRef = doc(db, 'sellerPublicProfiles', editingUserId);
        const publicSnap = await getDoc(publicRef);
        const now = new Date();
        
        const publicPayload: any = {
          displayName: editName.trim(),
          city: editCity.trim(),
          country: editCountry || null,
          updatedAt: now,
          showcaseActive: editShowcaseActive,
          showcaseApproved: editShowcaseApproved,
        };
        
        if (!publicSnap.exists()) {
          const fallbackCreated = editingUser?.acceptedTermsAt 
            ? (typeof editingUser.acceptedTermsAt.toDate === 'function' 
                ? editingUser.acceptedTermsAt.toDate() 
                : (editingUser.acceptedTermsAt instanceof Date ? editingUser.acceptedTermsAt : new Date(editingUser.acceptedTermsAt))) 
            : now;
          publicPayload.createdAt = fallbackCreated instanceof Date && !isNaN(fallbackCreated.getTime()) ? fallbackCreated : now;
        }
        
        await setDoc(publicRef, publicPayload, { merge: true });
      } catch (syncErr) {
        console.error('[Sync] Erro ao sincronizar para sellerPublicProfiles:', syncErr);
      }

      // Success feedback
      setEditSuccess("Dados do utilizador atualizados com sucesso!");
      
      // Update local state list to reflect changes immediately
      setUsers(users.map(u => (u.id === editingUserId || u.uid === editingUserId) ? { 
        ...u, 
        name: editName.trim(),
        phone: finalPhone,
        city: editCity.trim(),
        country: editCountry as 'Portugal' | 'Reino Unido' | undefined,
        role: editRole,
        referralCredits: Number(editReferralCredits) || 0,
        pointsFromAds: Number(editPointsFromAds) || 0,
        showcaseActive: editShowcaseActive,
        showcaseApproved: editShowcaseApproved,
      } : u));

      // Close modal gracefully after a short delay
      setTimeout(() => {
        setEditingUser(null);
      }, 1500);

    } catch (err: any) {
      console.error("Error editing user:", err);
      let errMsg = "Ocorreu um erro ao guardar as alterações.";
      if (err?.code === 'permission-denied') {
        errMsg = "Erro de Permissão (Firestore Rules): Sem privilégios de administrador adequados.";
      } else if (err instanceof Error) {
        errMsg = err.message;
      }
      setEditError(errMsg);
    } finally {
      setIsSaving(false);
    }
  };

  useEffect(() => {
    fetchUsers(limitAmount);
  }, [limitAmount]);

  const fetchUsers = async (currentLimit: number = limitAmount) => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const q = query(collection(db, 'users'), limit(currentLimit + 1));
      const querySnapshot = await getDocs(q);
      let usersData = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as unknown as UserProfile));
      
      if (usersData.length > currentLimit) {
        setHasMore(true);
        usersData = usersData.slice(0, currentLimit);
      } else {
        setHasMore(false);
      }
      
      // Sort client-side to be robust against missing indexes and missing fields
      usersData.sort((a, b) => {
        const dateA = parseFirestoreDate(a.acceptedTermsAt);
        const dateB = parseFirestoreDate(b.acceptedTermsAt);
        if (!dateA && !dateB) return 0;
        if (!dateA) return 1;
        if (!dateB) return -1;
        return dateB.getTime() - dateA.getTime();
      });

      setUsers(usersData);
      
      if (usersData.length > 0) {
        setDebugSelectedUserId(usersData[0].id);
      }
    } catch (err: any) {
      console.error("Error loading users:", err);
      let message = "Ocorreu um erro ao carregar os utilizadores.";
      if (err?.code === 'permission-denied') {
        message = "Erro de Permissão (Firestore Rules): A sua conta de administrador não tem privilégios delegados nas regras de segurança para listar utilizadores.";
      } else if (err?.code === 'resource-exhausted') {
        message = "Erro de Limite (Quota): O marketplace atingiu a cota diária de leitura gratuita do Firebase. Por favor, tente novamente amanhã.";
      } else if (err instanceof Error) {
        try {
          const details = JSON.parse(err.message);
          message = `Erro: ${details.error || err.message}`;
        } catch {
          message = err.message;
        }
      }
      setErrorMsg(message);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateRole = async (userId: string, newRole: 'user' | 'moderator' | 'admin', currentRole: string) => {
    if (newRole === currentRole) return;
    
    const roleLabels = {
      user: 'Utilizador Comum',
      moderator: 'Moderador',
      admin: 'Administrador'
    };

    if (!window.confirm(`Tem a certeza que deseja alterar o cargo deste utilizador para ${roleLabels[newRole]}?`)) return;

    setUpdatingUserId(userId);
    try {
      await updateDoc(doc(db, 'users', userId), { role: newRole });
      setUsers(users.map(u => u.uid === userId || u.id === userId ? { ...u, role: newRole } : u));
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${userId}`);
    } finally {
      setUpdatingUserId(null);
    }
  };

  const handleDebugAction = async (actionType: 'credit' | 'points50' | 'points150') => {
    if (!debugSelectedUserId) {
      setDebugStatus({ type: 'error', message: 'Selecione um utilizador primeiro.' });
      return;
    }
    setDebugLoading(true);
    setDebugStatus(null);
    try {
      let success = false;
      const targetUser = users.find(u => u.id === debugSelectedUserId);
      const name = targetUser ? (targetUser.name || targetUser.email || debugSelectedUserId) : debugSelectedUserId;
      
      if (actionType === 'credit') {
        success = await manualAddCredits(debugSelectedUserId, 1);
        if (success) {
          setDebugStatus({ type: 'success', message: `1 Crédito de Destaque adicionado com sucesso a ${name}!` });
        }
      } else if (actionType === 'points50') {
        success = await manualAddPoints(debugSelectedUserId, 50);
        if (success) {
          setDebugStatus({ type: 'success', message: `50 Pontos adicionados com sucesso a ${name}!` });
        }
      } else if (actionType === 'points150') {
        success = await manualAddPoints(debugSelectedUserId, 150);
        if (success) {
          setDebugStatus({ type: 'success', message: `150 Pontos adicionados com sucesso a ${name}! (Destaques adicionais gerados se elegível)` });
        }
      }

      if (success) {
        // Refresh local user list to show changes immediately
        await fetchUsers();
      } else {
        setDebugStatus({ type: 'error', message: `Não foi possível atualizar o utilizador. Verifique as permissões.` });
      }
    } catch (err: any) {
      console.error(err);
      setDebugStatus({ type: 'error', message: `Erro ao executar ação debug: ${err.message}` });
    } finally {
      setDebugLoading(false);
    }
  };

  const filteredUsers = users.filter(user => {
    const search = searchTerm.toLowerCase();
    if (!search) return true;
    const nameMatch = (user.name || '').toLowerCase().includes(search);
    const emailMatch = (user.email || '').toLowerCase().includes(search);
    return nameMatch || emailMatch;
  });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-black text-slate-900 tracking-tight">Utilizadores</h1>
        <p className="text-slate-500 font-medium">Gerencie os utilizadores e permissões da plataforma.</p>
      </div>

      {errorMsg && (
        <div className="bg-red-50 border border-red-200 text-red-700 p-5 rounded-2xl flex items-start gap-3.5 text-sm font-bold shadow-sm">
          <AlertCircle size={20} className="shrink-0 text-red-600 mt-0.5" />
          <div className="space-y-1">
            <p className="font-extrabold text-red-950">Falha ao obter lista (Firestore ERROR)</p>
            <p className="font-medium text-red-700 leading-relaxed text-xs">{errorMsg}</p>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200">
        <div className="relative w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input 
            type="text"
            placeholder="Pesquisar por nome ou email..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-3 bg-slate-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 transition-all font-medium"
          />
        </div>
      </div>

      {/* Ferramenta de Teste de Recompensas (Apenas Admin) */}
      <div className="bg-amber-50/70 border border-amber-200 p-6 rounded-2xl shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="text-amber-600 animate-pulse" size={18} />
          <h2 className="text-sm font-black text-amber-900 uppercase tracking-wider">🔬 Ferramenta de Teste de Recompensas (Modo Debug)</h2>
        </div>
        <p className="text-xs text-amber-800 font-semibold mb-4 leading-relaxed">
          Utilize esta ferramenta para simular e testar o recebimento de pontos de destaques para o utilizador selecionado. 
          O limite para conversão automática é de 150 pontos para gerar 1 crédito de destaque.
        </p>
        
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
          <div className="md:col-span-4 space-y-1">
            <label className="block text-[10px] font-black text-amber-900 uppercase tracking-widest leading-none">Selecionar Utilizador</label>
            <select
              value={debugSelectedUserId}
              onChange={(e) => setDebugSelectedUserId(e.target.value)}
              disabled={debugLoading || users.length === 0}
              className="w-full bg-white border border-amber-200 rounded-xl px-3 py-2.5 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500 cursor-pointer"
            >
              {users.length === 0 ? (
                <option value="">A carregar utilizadores...</option>
              ) : (
                users.map(u => (
                  <option key={u.id} value={u.id}>
                    {u.name || 'Sem nome'} ({u.email || u.id})
                  </option>
                ))
              )}
            </select>
          </div>
          
          <div className="md:col-span-8 flex flex-wrap gap-2 pt-2 md:pt-4">
            <button
              onClick={() => handleDebugAction('points50')}
              disabled={debugLoading || !debugSelectedUserId}
              className="px-4 py-2.5 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white rounded-xl font-bold text-xs shadow-sm transition-colors cursor-pointer"
            >
              Adicionar 50 Pontos
            </button>
            <button
              onClick={() => handleDebugAction('points150')}
              disabled={debugLoading || !debugSelectedUserId}
              className="px-4 py-2.5 bg-amber-700 hover:bg-amber-800 disabled:opacity-50 text-white rounded-xl font-bold text-xs shadow-sm transition-colors cursor-pointer"
            >
              Adicionar 150 Pontos (Gera Crédito)
            </button>
            <button
              onClick={() => handleDebugAction('credit')}
              disabled={debugLoading || !debugSelectedUserId}
              className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl font-bold text-xs shadow-sm transition-colors cursor-pointer"
            >
              Adicionar 1 Crédito Destaque
            </button>
          </div>
        </div>
        
        {debugStatus && (
          <div className={`mt-4 p-3 rounded-xl text-xs font-bold transition-all ${
            debugStatus.type === 'success' 
              ? 'bg-emerald-50 border border-emerald-100 text-emerald-800' 
              : 'bg-rose-50 border border-rose-100 text-rose-800'
          }`}>
            {debugStatus.message}
          </div>
        )}
      </div>

      {loading ? (
        <div className="text-center py-20 text-slate-400 font-bold animate-pulse">A carregar utilizadores...</div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="px-6 py-4 text-xs font-black text-slate-400 uppercase tracking-widest">Utilizador</th>
                  <th className="px-6 py-4 text-xs font-black text-slate-400 uppercase tracking-widest">Contacto</th>
                  <th className="px-6 py-4 text-xs font-black text-slate-400 uppercase tracking-widest">Cargo</th>
                  <th className="px-6 py-4 text-xs font-black text-slate-400 uppercase tracking-widest">Último Acesso</th>
                  <th className="px-6 py-4 text-xs font-black text-slate-400 uppercase tracking-widest">Data de Registo</th>
                  <th className="px-6 py-4 text-xs font-black text-slate-400 uppercase tracking-widest text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredUsers.map((user, idx) => (
                  <tr key={`${user.id}-${idx}`} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center font-bold">
                          {(user.name?.[0] || user.email?.[0] || '?').toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="font-bold text-slate-900 truncate flex items-center gap-1.5">
                            {user.name || 'Sem nome'}
                            {user.showcaseActive && (
                              <span className={`inline-flex items-center text-[9px] font-black px-1.5 py-0.5 rounded-md ${
                                user.showcaseApproved 
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' 
                                  : 'bg-amber-50 text-amber-700 border border-amber-200 animate-pulse'
                              }`}>
                                {user.showcaseApproved ? '💚 Vitrine' : '⏳ Pendente'}
                              </span>
                            )}
                          </p>
                          <p className="text-xs text-slate-500 truncate flex items-center gap-1">
                            <Mail size={12} />
                            {user.email}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col gap-1">
                        <span className="text-xs font-bold text-slate-700">{user.phone || 'Sem telefone'}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
                        user.role === 'admin' 
                          ? 'bg-indigo-100 text-indigo-700' 
                          : user.role === 'moderator'
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-slate-100 text-slate-600'
                      }`}>
                        {user.role === 'admin' ? <Shield size={12} /> : user.role === 'moderator' ? <ShieldAlert size={12} /> : <Users size={12} />}
                        {user.role || 'user'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-slate-500">
                        <Clock size={14} className="text-indigo-400" />
                        {parseFirestoreDate(user.lastLoginAt) 
                          ? formatDistanceToNow(parseFirestoreDate(user.lastLoginAt)!, { addSuffix: true, locale: pt }) 
                          : 'Nunca'}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-slate-500">
                        <Calendar size={14} />
                        {parseFirestoreDate(user.acceptedTermsAt) 
                          ? format(parseFirestoreDate(user.acceptedTermsAt)!, 'dd/MM/yyyy') 
                          : 'N/A'}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      {updatingUserId === user.id ? (
                        <div className="flex justify-end pr-8">
                          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-indigo-600"></div>
                        </div>
                      ) : (
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => handleOpenEditModal(user)}
                            className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 hover:text-emerald-800 font-bold text-xs rounded-xl transition-all border border-emerald-100 flex items-center gap-1 cursor-pointer"
                            title="Editar Perfil do Utilizador"
                          >
                            <Pencil size={12} />
                            Editar
                          </button>
                          {user.role !== 'user' && user.role !== undefined && (
                            <button
                              onClick={() => handleUpdateRole(user.id || '', 'user', user.role || 'user')}
                              className="px-3 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-600 font-bold text-xs rounded-xl transition-all"
                              title="Configurar como Utilizador Comum"
                            >
                              Fazer Comum
                            </button>
                          )}
                          {user.role !== 'moderator' && (
                            <button
                              onClick={() => handleUpdateRole(user.id || '', 'moderator', user.role || 'user')}
                              className="px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-600 font-bold text-xs rounded-xl transition-all border border-amber-100/50"
                              title="Tornar Moderador"
                            >
                              Tornar Moderador
                            </button>
                          )}
                          {user.role !== 'admin' && (
                            <button
                              onClick={() => handleUpdateRole(user.id || '', 'admin', user.role || 'user')}
                              className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 font-bold text-xs rounded-xl transition-all border border-indigo-100/50"
                              title="Tornar Administrador"
                            >
                              Tornar Admin
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {hasMore && (
            <div className="p-4 border-t border-slate-100 flex justify-center bg-slate-50/50">
              <button
                onClick={() => setLimitAmount(prev => prev + 100)}
                className="px-6 py-2.5 bg-white border border-slate-200 hover:border-indigo-500 hover:bg-slate-50 text-indigo-600 font-extrabold text-xs rounded-xl shadow-sm transition-all cursor-pointer flex items-center gap-2"
              >
                <Users size={14} className="text-indigo-500 animate-pulse" />
                Carregar mais utilizadores
              </button>
            </div>
          )}
          {filteredUsers.length === 0 && (
            <div className="p-12 text-center text-slate-400 font-medium">
              Nenhum utilizador encontrado para esta pesquisa.
            </div>
          )}
        </div>
      )}

      {/* Edit User Profile Modal */}
      <AnimatePresence>
        {editingUser && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="bg-white rounded-3xl shadow-xl border border-slate-200 w-full max-w-lg overflow-hidden animate-in fade-in-50 duration-200"
            >
              {/* Modal Header */}
              <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center">
                    <Pencil size={18} />
                  </div>
                  <div>
                    <h3 className="font-black text-slate-950 text-base leading-tight">Editar Perfil do Utilizador</h3>
                    <p className="text-xs text-slate-500 font-medium">Modifique as informações de forma segura.</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setEditingUser(null)}
                  className="w-8 h-8 rounded-full border border-slate-200 hover:border-slate-300 hover:bg-slate-100 flex items-center justify-center text-slate-500 hover:text-slate-700 transition-colors shadow-sm cursor-pointer"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Modal Body / Form */}
              <form onSubmit={handleSaveUser} className="p-6 space-y-4">
                {editError && (
                  <div className="bg-rose-50 border border-rose-200 text-rose-700 p-4 rounded-2xl flex items-start gap-2.5 text-xs font-bold leading-relaxed shadow-sm">
                    <AlertCircle size={16} className="shrink-0 text-rose-600 mt-0.5" />
                    <span>{editError}</span>
                  </div>
                )}

                {editSuccess && (
                  <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-4 rounded-2xl flex items-start gap-2.5 text-xs font-bold leading-relaxed shadow-sm">
                    <UserCheck size={16} className="shrink-0 text-emerald-600 mt-0.5" />
                    <span>{editSuccess}</span>
                  </div>
                )}

                {/* Email Field (ReadOnly) */}
                <div className="space-y-1.5">
                  <label className="block text-[10px] font-black text-slate-800 uppercase tracking-widest">Email de Login (Apenas Leitura)</label>
                  <div className="relative">
                    <input
                      type="text"
                      value={editEmail}
                      readOnly
                      disabled
                      className="w-full bg-slate-100 border border-slate-200 rounded-2xl px-4 py-3 text-sm font-semibold text-slate-500 cursor-not-allowed focus:outline-none"
                    />
                  </div>
                  <div className="flex items-start gap-1.5 text-[10px] text-amber-700 bg-amber-50/50 border border-amber-200/50 rounded-xl p-2.5 font-bold leading-relaxed">
                    <AlertCircle size={14} className="shrink-0 text-amber-600 mt-0.5" />
                    <span>O email de login não pode ser alterado diretamente aqui para preservar a integridade do Firebase Authentication.</span>
                  </div>
                </div>

                {/* Display Name Field */}
                <div className="space-y-1.5">
                  <label className="block text-[10px] font-black text-slate-800 uppercase tracking-widest">Nome Completo / Exibição</label>
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    placeholder="Ex: João Silva"
                    required
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all shadow-sm"
                  />
                </div>

                {/* Phone Field */}
                <div className="space-y-1.5">
                  <label className="block text-[10px] font-black text-slate-800 uppercase tracking-widest">Telefone / Telemóvel</label>
                  <div className="relative">
                    <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                    <input
                      type="text"
                      value={editPhone}
                      onChange={(e) => setEditPhone(e.target.value)}
                      placeholder="Ex: +351912345678"
                      className="w-full bg-slate-50 border border-slate-200 rounded-2xl pl-10 pr-4 py-3 text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all shadow-sm"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {/* City Field */}
                  <div className="space-y-1.5">
                    <label className="block text-[10px] font-black text-slate-800 uppercase tracking-widest">Cidade</label>
                    <div className="relative">
                      <MapPin className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                      <input
                        type="text"
                        value={editCity}
                        onChange={(e) => setEditCity(e.target.value)}
                        placeholder="Ex: Lisboa"
                        className="w-full bg-slate-50 border border-slate-200 rounded-2xl pl-10 pr-4 py-3 text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all shadow-sm"
                      />
                    </div>
                  </div>

                  {/* Country Field */}
                  <div className="space-y-1.5">
                    <label className="block text-[10px] font-black text-slate-800 uppercase tracking-widest">País</label>
                    <select
                      value={editCountry}
                      onChange={(e) => setEditCountry(e.target.value as 'Portugal' | 'Reino Unido' | '')}
                      className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-3.5 py-3 text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all shadow-sm cursor-pointer"
                    >
                      <option value="">Selecione o País...</option>
                      <option value="Portugal">Portugal</option>
                      <option value="Reino Unido">Reino Unido</option>
                    </select>
                  </div>
                </div>

                {/* Role Field */}
                <div className="space-y-1.5">
                  <label className="block text-[10px] font-black text-slate-800 uppercase tracking-widest">Cargo de Autenticação</label>
                  <select
                    value={editRole}
                    onChange={(e) => setEditRole(e.target.value as 'user' | 'moderator' | 'admin')}
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-3.5 py-3 text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all shadow-sm cursor-pointer"
                  >
                    <option value="user">Utilizador Comum (user)</option>
                    <option value="moderator">Moderador (moderator)</option>
                    <option value="admin">Administrador (admin)</option>
                  </select>
                </div>

                {/* Rewards / Points and Credits Fields */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="block text-[10px] font-black text-slate-800 uppercase tracking-widest">Créditos de Destaque</label>
                    <input
                      type="number"
                      min="0"
                      value={editReferralCredits}
                      onChange={(e) => setEditReferralCredits(Math.max(0, parseInt(e.target.value) || 0))}
                      className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-3.5 py-3 text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all shadow-sm"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-[10px] font-black text-slate-800 uppercase tracking-widest">Pontos de Progresso</label>
                    <input
                      type="number"
                      min="0"
                      value={editPointsFromAds}
                      onChange={(e) => setEditPointsFromAds(Math.max(0, parseInt(e.target.value) || 0))}
                      className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-3.5 py-3 text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all shadow-sm"
                    />
                  </div>
                </div>

                {/* Showcase Moderation Block */}
                <div className="bg-indigo-50/50 border border-indigo-100 p-4 rounded-2xl space-y-4">
                  <h4 className="text-[11px] font-black text-indigo-950 uppercase tracking-wider">Moderação de Vitrine Digital</h4>
                  
                  {editShowcaseActive && editShowcaseName && (
                    <p className="text-xs font-extrabold text-indigo-800">
                      Nome da Vitrine: <span className="text-slate-900">"{editShowcaseName}"</span>
                    </p>
                  )}

                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <span className="text-xs font-bold text-slate-800 block">Vitrine Ativada pelo Dono:</span>
                      <span className="text-[10px] text-slate-500 block">Indica se o empreendedor ativou a vitrine na conta dele.</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setEditShowcaseActive(!editShowcaseActive)}
                      className={`relative inline-flex h-5 w-10 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        editShowcaseActive ? 'bg-indigo-600' : 'bg-slate-200'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                          editShowcaseActive ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>

                  <div className="flex items-center justify-between gap-4 border-t border-indigo-100/50 pt-3">
                    <div>
                      <span className="text-xs font-bold text-slate-800 block flex items-center gap-1">Aprovado pela Moderação: {editShowcaseApproved ? '💚' : '⏳'}</span>
                      <span className="text-[10px] text-slate-500 block">Se desmarcado, a vitrine fica em análise e oculta do público.</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setEditShowcaseApproved(!editShowcaseApproved)}
                      className={`relative inline-flex h-5 w-10 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        editShowcaseApproved ? 'bg-emerald-600' : 'bg-slate-200'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                          editShowcaseApproved ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                </div>

                {/* Submit Action Buttons */}
                <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setEditingUser(null)}
                    disabled={isSaving}
                    className="px-5 py-3 bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-2xl font-bold text-xs transition-colors cursor-pointer disabled:opacity-50"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-bold text-xs transition-colors shadow-md shadow-indigo-100 flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    {isSaving ? (
                      <div className="w-4 h-4 border-2 border-white border-b-transparent rounded-full animate-spin"></div>
                    ) : (
                      <UserCheck size={14} />
                    )}
                    {isSaving ? 'A guardar...' : 'Guardar Alterações'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default AdminUsers;
