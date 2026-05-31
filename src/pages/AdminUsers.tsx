import React, { useState, useEffect } from 'react';
import { collection, query, orderBy, limit, updateDoc, doc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType, parseFirestoreDate, getDocsWithCacheFallback } from '../firebase';
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
  AlertCircle
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { pt } from 'date-fns/locale';

const AdminUsers = () => {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const q = query(collection(db, 'users'), limit(50));
      const querySnapshot = await getDocsWithCacheFallback(q, 'admin/users');
      const usersData = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as unknown as UserProfile));
      
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

  const handleToggleAdmin = async (userId: string, currentRole: string) => {
    const newRole = currentRole === 'admin' ? 'user' : 'admin';
    if (!window.confirm(`Tem certeza que deseja alterar o cargo deste utilizador para ${newRole}?`)) return;

    try {
      await updateDoc(doc(db, 'users', userId), { role: newRole });
      setUsers(users.map(u => u.id === userId ? { ...u, role: newRole as 'admin' | 'user' } : u));
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${userId}`);
    }
  };

  const filteredUsers = users.filter(user => 
    user.email?.toLowerCase().includes(searchTerm.toLowerCase()) || 
    user.name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

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
                          : 'bg-slate-100 text-slate-600'
                      }`}>
                        {user.role === 'admin' ? <Shield size={12} /> : <Users size={12} />}
                        {user.role}
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
                      <button
                        onClick={() => handleToggleAdmin(user.id, user.role)}
                        className={`h-10 px-4 rounded-xl font-bold text-xs transition-all flex items-center gap-2 ml-auto ${
                          user.role === 'admin'
                            ? 'bg-red-50 text-red-600 hover:bg-red-600 hover:text-white'
                            : 'bg-indigo-50 text-indigo-600 hover:bg-indigo-600 hover:text-white'
                        }`}
                      >
                        {user.role === 'admin' ? (
                          <>
                            <ShieldAlert size={16} />
                            Remover Admin
                          </>
                        ) : (
                          <>
                            <Shield size={16} />
                            Tornar Admin
                          </>
                        )}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
