import React, { useState, useEffect } from 'react';
import { 
  collection, 
  query, 
  getDocs, 
  where, 
  doc, 
  setDoc,
  Timestamp 
} from 'firebase/firestore';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Trophy, 
  Gift, 
  Calendar, 
  Globe, 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  User, 
  Heart, 
  ChevronRight, 
  BookOpen, 
  LogIn, 
  Check, 
  HelpCircle,
  Share2
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { Giveaway, GiveawayParticipation } from '../types';

export default function Sorteios() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [giveaways, setGiveaways] = useState<Giveaway[]>([]);
  const [participatedMap, setParticipatedMap] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [participatingId, setParticipatingId] = useState<string | null>(null);

  // Stats Counters
  const [totalPrizesVal, setTotalPrizesVal] = useState(0);

  // Selected giveaway rules modal
  const [rulesGiveaway, setRulesGiveaway] = useState<Giveaway | null>(null);

  useEffect(() => {
    fetchData();
  }, [user]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, 'giveaways'));
      const list: Giveaway[] = [];
      snap.forEach(d => {
        list.push({ id: d.id, ...d.data() } as Giveaway);
      });

      // Sort: Active first, then concluded
      const sorted = list.sort((a, b) => {
        if (a.status === 'Ativo' && b.status !== 'Ativo') return -1;
        if (a.status !== 'Ativo' && b.status === 'Ativo') return 1;
        return 0;
      });
      setGiveaways(sorted);

      // If user is authenticated, check which giveaways they are already participating in
      if (user) {
        const partsQuery = query(collection(db, 'participations'), where('userId', '==', user.uid));
        const partsSnap = await getDocs(partsQuery);
        const map: Record<string, boolean> = {};
        partsSnap.forEach(docSnap => {
          const partData = docSnap.data() as GiveawayParticipation;
          map[partData.giveawayId] = true;
        });
        setParticipatedMap(map);
      }
    } catch (err) {
      console.error('Error loading public giveaways:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleParticipate = async (g: Giveaway) => {
    if (!user) {
      // Direct user to login with context saved or simple alert + navigate
      if (window.confirm('Necessita de iniciar sessão para poder entrar nos sorteios. Deseja iniciar sessão agora?')) {
        navigate('/login');
      }
      return;
    }

    // Check country restrictions
    const userCountry = (user as any).country || 'Ambos';
    if (g.country !== 'Ambos' && userCountry !== 'Ambos' && g.country !== userCountry) {
      alert(`Lamentamos, mas este sorteio é exclusivo para residentes em: ${g.country}. O seu perfil está registado como: ${userCountry}.`);
      return;
    }

    setParticipatingId(g.id);
    try {
      const partId = `${g.id}_${user.uid}`;
      const participationData: GiveawayParticipation = {
        id: partId,
        giveawayId: g.id,
        userId: user.uid,
        name: user.displayName || 'Utilizador',
        email: user.email || '',
        participationDate: Timestamp.now()
      };

      // Add to Firestore using unique deterministic document ID to prevent double entries!
      await setDoc(doc(db, 'participations', partId), participationData);
      
      // Update local state
      setParticipatedMap(prev => ({ ...prev, [g.id]: true }));
      alert('Inscrito com sucesso! Desejamos-lhe muita sorte! 🍀');
    } catch (err) {
      console.error('Error participating:', err);
      alert('Não foi possível registar a sua participação. Por favor, tente novamente.');
    } finally {
      setParticipatingId(null);
    }
  };

  const activeGiveaways = giveaways.filter(g => g.status === 'Ativo');
  const pastGiveaways = giveaways.filter(g => g.status !== 'Ativo');

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-12">
      {/* Visual Header */}
      <div className="relative rounded-3xl bg-gradient-to-br from-indigo-900 to-slate-900 p-8 md:p-12 text-white overflow-hidden shadow-xl ring-1 ring-white/10">
        {/* Abstract background decorative shapes */}
        <div className="absolute top-0 right-0 -mt-20 -mr-20 w-80 h-80 rounded-full bg-indigo-500/10 blur-3xl"></div>
        <div className="absolute bottom-0 left-1/3 -mb-20 -ml-20 w-80 h-80 rounded-full bg-amber-500/10 blur-3xl"></div>

        <div className="max-w-xl space-y-4 relative z-10">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-amber-500/20 text-amber-300 uppercase tracking-wider">
            <Gift size={14} />
            Campanhas Activas
          </span>
          <h1 className="text-4xl md:text-5xl font-black tracking-tight leading-none">
            Campanhas e Sorteios <span className="text-amber-400">Gratuitos</span>
          </h1>
          <p className="text-slate-300 text-sm md:text-base leading-relaxed">
            Participe nos sorteios promocionais do Mercado Luso e habilite-se a ganhar prémios fantásticos. Totalmente grátis para toda a comunidade!
          </p>
        </div>
      </div>

      {/* Sorteios Ativos Section */}
      <div className="space-y-6">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-6 bg-indigo-600 rounded-full"></div>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight">Passatempos a Decorrer</h2>
        </div>

        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center gap-3">
            <div className="w-10 h-10 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin"></div>
            <p className="text-slate-400 text-xs font-bold">A procurar sorteios ativos...</p>
          </div>
        ) : activeGiveaways.length === 0 ? (
          <div className="p-12 bg-slate-50 rounded-2xl text-center border border-slate-100">
            <Gift className="mx-auto text-slate-300 mb-3" size={40} />
            <h3 className="font-bold text-slate-800">Sem sorteios ativos de momento</h3>
            <p className="text-slate-400 text-xs mt-1">Fique atento, novas campanhas promocionais serão lançadas brevemente!</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {activeGiveaways.map((g) => {
              const isRegistered = participatedMap[g.id];
              return (
                <div 
                  id={`public-giveaway-${g.id}`}
                  key={g.id} 
                  className="bg-white rounded-3xl border border-slate-100 overflow-hidden shadow-sm flex flex-col justify-between hover:shadow-md transition-all group"
                >
                  {/* Prize Cover Photo */}
                  <div className="h-52 relative overflow-hidden bg-slate-100">
                    <img 
                      src={g.prizeImage} 
                      alt={g.title} 
                      className="w-full h-full object-cover group-hover:scale-105 transition-all duration-500"
                    />

                    {/* Eligible Country Badge */}
                    <div className="absolute top-4 left-4 bg-white/95 backdrop-blur-md px-3.5 py-1 rounded-full text-[10px] font-black uppercase flex items-center gap-1 shadow-sm text-slate-800">
                      <Globe size={11} className="text-slate-400" />
                      <span>{g.country === 'Ambos' ? 'PT + UK 🌍' : g.country}</span>
                    </div>

                    {/* Urgent end timer badge */}
                    <div className="absolute bottom-4 left-4 bg-slate-900/80 backdrop-blur px-3 py-1 rounded-lg text-[10px] font-bold text-white flex items-center gap-1">
                      <Clock size={11} className="text-amber-400" />
                      <span>Fim: {g.endDate}</span>
                    </div>
                  </div>

                  {/* Body Info */}
                  <div className="p-6 flex-1 flex flex-col justify-between space-y-6">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold bg-amber-100 text-amber-800 px-2 py-0.5 rounded-md">Prémio</span>
                        <span className="text-[10px] font-bold bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-md">
                          {g.winnersCount} {g.winnersCount === 1 ? 'Vencedor' : 'Vencedores'}
                        </span>
                      </div>
                      <h3 className="text-xl font-black text-slate-900 tracking-tight leading-snug group-hover:text-indigo-600 transition-all">{g.title}</h3>
                      <p className="text-slate-500 text-xs leading-relaxed line-clamp-3">{g.description}</p>
                    </div>

                    {/* Bottom Actions */}
                    <div className="space-y-3">
                      {/* Rules button */}
                      <button 
                        onClick={() => setRulesGiveaway(g)}
                        className="w-full text-center text-xs font-bold text-slate-600 hover:text-indigo-600 flex items-center justify-center gap-1 py-2 border border-slate-150 rounded-xl hover:bg-slate-50 transition-all"
                      >
                        <BookOpen size={13} />
                        <span>Ver Regras do Passatempo</span>
                      </button>

                      {/* Main Entry CTA */}
                      {isRegistered ? (
                        <div className="w-full h-11 bg-emerald-50 text-emerald-700 rounded-xl flex items-center justify-center gap-1.5 text-xs font-black border border-emerald-200">
                          <Check size={16} />
                          <span>Já estás a participar! Boa sorte!</span>
                        </div>
                      ) : (
                        <button
                          onClick={() => handleParticipate(g)}
                          disabled={participatingId === g.id}
                          className="w-full h-11 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl flex items-center justify-center gap-1.5 text-xs font-black transition-all shadow-md shadow-indigo-100 hover:scale-[1.01] active:scale-[0.99] disabled:opacity-75"
                        >
                          {participatingId === g.id ? (
                            <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                          ) : (
                            <>
                              <LogIn size={15} />
                              <span>Participar no Sorteio</span>
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Histórico e Transparência Section */}
      <div className="space-y-6 pt-6">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-6 bg-slate-700 rounded-full"></div>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight">Histórico de Premiados</h2>
        </div>

        {loading ? (
          <div className="py-12 flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-slate-200 border-t-slate-700 rounded-full animate-spin"></div>
          </div>
        ) : pastGiveaways.length === 0 ? (
          <div className="p-8 bg-slate-50 rounded-2xl text-center text-slate-400 text-xs border border-slate-100">
            Nenhuma campanha anterior registada.
          </div>
        ) : (
          <div className="bg-slate-50 rounded-3xl p-6 border border-slate-100/60 divide-y divide-slate-200/80">
            {pastGiveaways.map((g) => (
              <div key={g.id} className="py-6 first:pt-0 last:pb-0 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                
                {/* Giveaway Details mini */}
                <div className="flex items-center gap-4 min-w-0">
                  <div className="w-16 h-16 rounded-2xl overflow-hidden bg-slate-200 shrink-0 border border-slate-200">
                    <img src={g.prizeImage} alt={g.title} className="w-full h-full object-cover" />
                  </div>
                  <div className="min-w-0">
                    <span className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Passatempo Encerrado</span>
                    <h3 className="font-extrabold text-slate-900 truncate text-base">{g.title}</h3>
                    <p className="text-[10px] text-slate-500 mt-0.5">Sorteado em: {g.endDate}</p>
                  </div>
                </div>

                {/* Winners showcase */}
                <div className="flex-1 max-w-xl">
                  {g.winners && g.winners.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {g.winners.map((win, winIdx) => (
                        <div key={winIdx} className="bg-white px-4 py-3 rounded-2xl border border-slate-150 flex items-center justify-between gap-3 shadow-none hover:shadow-sm transition-all">
                          <div className="min-w-0">
                            <p className="text-xs font-black text-slate-900 truncate flex items-center gap-1">
                              <Trophy size={12} className="text-amber-500 shrink-0" />
                              {win.name}
                            </p>
                            <p className="text-[10px] text-emerald-600 font-bold uppercase tracking-wider mt-0.5">
                              {win.status === 'Prémio Entregue' ? '🎁 Prémio Entregue' : '🕒 Contactado'}
                            </p>
                          </div>
                          <span className="text-[20px]" title={g.country === 'Portugal' ? 'Portugal' : 'Reino Unido'}>
                            {g.country === 'Portugal' ? '🇵🇹' : g.country === 'Reino Unido' ? '🇬🇧' : '🌍'}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <span className="text-xs text-slate-400 italic">Sorteio encerrado. Lista de vencedores a ser validada.</span>
                  )}
                </div>

              </div>
            ))}
          </div>
        )}
      </div>

      {/* Rules Modal Dialog */}
      <AnimatePresence>
        {rulesGiveaway && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.5 }}
              exit={{ opacity: 0 }}
              onClick={() => setRulesGiveaway(null)}
              className="absolute inset-0 bg-black"
            />

            {/* Modal Box */}
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="relative w-full max-w-md bg-white rounded-3xl overflow-hidden shadow-2xl flex flex-col p-6 space-y-4"
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <BookOpen className="text-indigo-600" size={20} />
                  <h3 className="font-extrabold text-slate-900 text-lg">Regras do Passatempo</h3>
                </div>
                <button 
                  onClick={() => setRulesGiveaway(null)}
                  className="p-1 hover:bg-slate-100 rounded-xl"
                >
                  &times;
                </button>
              </div>

              <div className="space-y-4 text-xs leading-relaxed text-slate-600">
                <h4 className="font-black text-slate-900 text-sm">{rulesGiveaway.title}</h4>
                
                {/* Process rule breaks */}
                <div className="whitespace-pre-line bg-slate-50 p-4 rounded-2xl border border-slate-100 text-slate-500 font-medium">
                  {rulesGiveaway.rules}
                </div>

                <div className="bg-indigo-50/50 p-3 rounded-2xl flex items-center gap-2.5 text-indigo-800 font-semibold">
                  <AlertCircle size={16} className="text-indigo-600 shrink-0" />
                  <span>A participação é completamente livre de encargos financeiros!</span>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
