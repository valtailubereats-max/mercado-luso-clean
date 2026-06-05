import React, { useState, useEffect } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword,
  updateProfile,
  sendPasswordResetEmail
} from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType, getDocWithCacheFallback } from '../firebase';
import { motion, AnimatePresence } from 'motion/react';
import { ShoppingBag, ShieldCheck, Mail, Lock, User as UserIcon, ArrowRight, Github, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const Login = () => {
  const navigate = useNavigate();
  const { refreshProfile } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  
  const queryMode = searchParams.get('mode');
  const initialMode = (queryMode === 'register' || queryMode === 'login' || queryMode === 'forgot') ? queryMode : 'login';
  const [mode, setMode] = useState<'login' | 'register' | 'forgot'>(initialMode);

  useEffect(() => {
    const qm = searchParams.get('mode');
    if (qm === 'register' || qm === 'login' || qm === 'forgot') {
      setMode(qm);
    }
  }, [searchParams]);
  
  // Email/Password states
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  const handleDemoLogin = (role: 'admin' | 'user') => {
    if (!acceptedTerms) {
      setError('Deve aceitar os Termos de Uso para continuar.');
      return;
    }
    const demoProfile = role === 'admin' 
      ? {
          uid: 'valtair-demo-admin-uid',
          email: 'valtailubereats@gmail.com',
          displayName: 'Valtair Santos (Admin)',
          role: 'admin',
          phone: '+351 912 345 678'
        }
      : {
          uid: 'utilizador-demo-uid',
          email: 'visitante@mercadoluso.pt',
          displayName: 'Utilizador de Teste',
          role: 'user',
          phone: '+351 922 111 222'
        };

    localStorage.setItem('demo_user', JSON.stringify(demoProfile));
    navigate('/');
    window.location.reload();
  };

  const handleGoogleLogin = async () => {
    if (!acceptedTerms) {
      setError('Deve aceitar os Termos de Uso para continuar.');
      return;
    }
    setLoading(true);
    setError('');
    const provider = new GoogleAuthProvider();
    // Force account selection to allow switching accounts
    provider.setCustomParameters({ prompt: 'select_account' });
    
    try {
      const result = await signInWithPopup(auth, provider);
      const user = result.user;

      // Check if profile exists
      const docRef = doc(db, 'users', user.uid);
      let docSnap;
      try {
        docSnap = await getDocWithCacheFallback(docRef, `users/${user.uid}`);
      } catch (err) {
        handleFirestoreError(err, OperationType.GET, `users/${user.uid}`);
      }

      if (!docSnap?.exists()) {
        // Create basic profile if it doesn't exist
        const isAdminEmail = user.email === 'valtailubereats@gmail.com' || user.email === 'generalsales2021@gmail.com';
        try {
          await setDoc(docRef, {
            uid: user.uid,
            name: user.displayName || 'Utilizador',
            email: user.email || '',
            phone: '', 
            role: isAdminEmail ? 'admin' : 'user',
            acceptedTerms: true,
            acceptedTermsAt: serverTimestamp()
          });
        } catch (err) {
          handleFirestoreError(err, OperationType.CREATE, `users/${user.uid}`);
        }
        await refreshProfile();
        navigate('/profile');
      } else {
        await refreshProfile();
        navigate('/');
      }
    } catch (err: any) {
      console.error('Login error:', err);
      if (err.code === 'auth/popup-closed-by-user') {
        setError('A janela de login foi fechada.');
      } else if (err.code === 'auth/network-request-failed') {
        setError('Erro de rede. Verifique a sua ligação à internet.');
      } else if (err.code === 'auth/operation-not-allowed') {
        setError('Este método de login não está ativado no Firebase Console.');
      } else if (err.message && err.message.startsWith('{')) {
        try {
          const parsed = JSON.parse(err.message);
          setError(`Erro ao criar perfil (${parsed.operationType}): ${parsed.error}`);
        } catch {
          setError('Erro de permissões ao criar perfil. Verifique se aceitou os termos.');
        }
      } else {
        setError(err.message || 'Erro ao entrar com Google. Tente novamente.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!acceptedTerms) {
      setError('Deve aceitar os Termos de Uso para continuar.');
      return;
    }
    if (!email || !password || (mode === 'register' && !name)) {
      setError('Preencha todos os campos.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      if (mode === 'register') {
        const result = await createUserWithEmailAndPassword(auth, email, password);
        const user = result.user;
        
        await updateProfile(user, { displayName: name });

        const docRef = doc(db, 'users', user.uid);
        const isAdminEmail = user.email === 'valtailubereats@gmail.com' || user.email === 'generalsales2021@gmail.com';
        try {
          await setDoc(docRef, {
            uid: user.uid,
            name: name,
            email: user.email || '',
            phone: '',
            role: isAdminEmail ? 'admin' : 'user',
            acceptedTerms: true,
            acceptedTermsAt: serverTimestamp()
          });
        } catch (err) {
          handleFirestoreError(err, OperationType.CREATE, `users/${user.uid}`);
        }
        await refreshProfile();
        navigate('/profile');
      } else {
        await signInWithEmailAndPassword(auth, email, password);
        await refreshProfile();
        navigate('/');
      }
    } catch (err: any) {
      console.error('Email auth error:', err);
      if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        setError('E-mail ou senha incorretos.');
      } else if (err.code === 'auth/email-already-in-use') {
        setError('Este e-mail já está em uso.');
      } else if (err.code === 'auth/weak-password') {
        setError('A senha deve ter pelo menos 6 caracteres.');
      } else if (err.code === 'auth/operation-not-allowed') {
        setError('O login por e-mail/senha não está ativado no Firebase Console.');
      } else if (err.code === 'auth/network-request-failed') {
        setError('Erro de rede. Verifique a sua ligação à internet.');
      } else if (err.message && err.message.startsWith('{')) {
        try {
          const parsed = JSON.parse(err.message);
          setError(`Erro no banco de dados (${parsed.operationType}): ${parsed.error}`);
        } catch {
          setError('Erro de permissão ou de rede ao comunicar com o servidor.');
        }
      } else {
        setError(err.message || 'Ocorreu um erro. Tente novamente.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      setError('Por favor, introduza o seu e-mail.');
      return;
    }
    setLoading(true);
    setError('');
    setSuccessMessage('');
    try {
      await sendPasswordResetEmail(auth, email);
      setSuccessMessage('E-mail de recuperação enviado com sucesso! Verifique a sua caixa de entrada.');
    } catch (err: any) {
      console.error('Password reset error:', err);
      if (err.code === 'auth/user-not-found' || err.code === 'auth/invalid-email') {
        setError('E-mail não registado ou inválido.');
      } else if (err.code === 'auth/network-request-failed') {
        setError('Erro de rede. Verifique a sua ligação à internet.');
      } else {
        setError('Erro ao enviar e-mail de recuperação. Tente novamente.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto mt-12 px-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white p-8 rounded-[2.5rem] shadow-2xl border border-slate-100"
      >
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center text-white mx-auto mb-4 shadow-lg shadow-indigo-200">
            <ShoppingBag size={32} />
          </div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">
            {mode === 'login' ? 'Bem-vindo de volta!' : mode === 'register' ? 'Criar conta' : 'Recuperar senha'}
          </h1>
          <p className="text-slate-500 mt-2 font-medium">
            {mode === 'login' 
              ? 'Entre para continuar a negociar.' 
              : mode === 'register' ? 'Junte-se ao maior mercado de Portugal.' : 'Introduza o seu e-mail para receber as instruções.'}
          </p>
        </div>

        {error && (
          <motion.div 
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            className="bg-red-50 text-red-600 p-4 rounded-2xl mb-6 text-sm font-bold border border-red-100 flex items-center gap-2"
          >
            <div className="w-1.5 h-1.5 bg-red-600 rounded-full shrink-0" />
            {error}
          </motion.div>
        )}

        {successMessage && (
          <motion.div 
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            className="bg-emerald-50 text-emerald-600 p-4 rounded-2xl mb-6 text-sm font-bold border border-emerald-100 flex items-center gap-2"
          >
            <div className="w-1.5 h-1.5 bg-emerald-600 rounded-full shrink-0" />
            {successMessage}
          </motion.div>
        )}

        <form onSubmit={mode === 'forgot' ? handlePasswordReset : handleEmailAuth} className="space-y-4 mb-6">
          {mode === 'register' && (
            <div className="relative">
              <UserIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
              <input
                type="text"
                placeholder="Nome completo"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full pl-12 pr-4 py-4 bg-slate-50 border-2 border-transparent focus:border-indigo-500 focus:bg-white rounded-2xl outline-none transition-all font-medium text-slate-900"
              />
            </div>
          )}
          <div className="relative">
            <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
            <input
              type="email"
              placeholder="E-mail"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full pl-12 pr-4 py-4 bg-slate-50 border-2 border-transparent focus:border-indigo-500 focus:bg-white rounded-2xl outline-none transition-all font-medium text-slate-900"
            />
          </div>
          {mode !== 'forgot' && (
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
              <input
                type={showPassword ? "text" : "password"}
                placeholder="Senha"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-12 pr-12 py-4 bg-slate-50 border-2 border-transparent focus:border-indigo-500 focus:bg-white rounded-2xl outline-none transition-all font-medium text-slate-900"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-indigo-600 transition-colors"
              >
                {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
          )}

          {mode === 'login' && (
            <div className="text-right">
              <button
                type="button"
                onClick={() => {
                  setMode('forgot');
                  setError('');
                  setSuccessMessage('');
                }}
                className="text-xs font-bold text-indigo-600 hover:text-indigo-700 transition-colors"
              >
                Esqueci-me da senha?
              </button>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-black hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 flex items-center justify-center gap-2 disabled:opacity-50 group"
          >
            <span>{loading ? 'A processar...' : (mode === 'login' ? 'Entrar' : mode === 'register' ? 'Criar Conta' : 'Enviar E-mail')}</span>
            {!loading && <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />}
          </button>
        </form>

        {mode !== 'forgot' && (
          <>
            <div className="flex items-start gap-3 p-4 bg-slate-50 rounded-2xl border border-slate-100 mb-6">
              <input
                type="checkbox"
                id="terms"
                checked={acceptedTerms}
                onChange={(e) => setAcceptedTerms(e.target.checked)}
                className="mt-1 w-5 h-5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
              />
              <label htmlFor="terms" className="text-xs text-slate-600 cursor-pointer leading-relaxed font-medium">
                Li e concordo com os <Link to="/terms" className="text-indigo-600 font-bold hover:underline">Termos de Uso</Link> e reconheço que a plataforma é apenas intermediária.
              </label>
            </div>

            <div className="relative mb-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-100"></div>
              </div>
              <div className="relative flex justify-center text-xs uppercase tracking-widest font-bold">
                <span className="bg-white px-4 text-slate-400">Aceder com Chave Google</span>
              </div>
            </div>

            <button
              onClick={handleGoogleLogin}
              disabled={loading}
              className="w-full flex items-center justify-center gap-3 bg-white border-2 border-slate-200 text-slate-700 py-4 rounded-2xl font-bold hover:bg-slate-50 hover:border-indigo-200 transition-all disabled:opacity-50"
            >
              <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" className="w-6 h-6" />
              <span>Google</span>
            </button>
          </>
        )}

        <div className="text-center mt-6">
          {mode === 'forgot' ? (
            <button
              onClick={() => {
                setMode('login');
                setSearchParams({ mode: 'login' });
                setError('');
                setSuccessMessage('');
              }}
              className="text-sm font-bold text-indigo-600 hover:text-indigo-700 transition-colors"
            >
              Voltar para o Login
            </button>
          ) : (
            <button
              onClick={() => {
                const newMode = mode === 'login' ? 'register' : 'login';
                setSearchParams({ mode: newMode });
                setMode(newMode);
                setError('');
                setSuccessMessage('');
              }}
              className="text-sm font-bold text-slate-500 hover:text-indigo-600 transition-colors"
            >
              {mode === 'login' ? 'Não tem conta? Registe-se' : 'Já tem conta? Entre aqui'}
            </button>
          )}
        </div>

        <div className="mt-8 pt-6 border-t border-slate-50 text-center text-slate-400 text-[10px] uppercase tracking-[0.2em] font-black flex items-center justify-center gap-2">
          <ShieldCheck size={14} />
          <span>Seguro e Rápido</span>
        </div>
      </motion.div>
    </div>
  );
};

export default Login;
