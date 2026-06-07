import React, { useState, useEffect } from 'react';
import { collection, query, orderBy, limit, updateDoc, doc, getDocs } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType, parseFirestoreDate } from '../firebase';
import { UserProfile } from '../types';
import { motion } from 'motion/react';
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
  Sparkles
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
                          <p className="font-bold text-slate-900 truncate">{user.name || 'Sem nome'}</p>
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
    </div>
  );
};

export default AdminUsers;
