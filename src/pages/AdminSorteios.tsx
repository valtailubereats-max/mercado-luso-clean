import React, { useState, useEffect } from 'react';
import { 
  collection, 
  query, 
  getDocs, 
  where, 
  doc, 
  setDoc, 
  deleteDoc,
  addDoc,
  Timestamp,
  serverTimestamp
} from 'firebase/firestore';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Trophy, 
  Users, 
  Gift, 
  Plus, 
  Edit, 
  Trash2, 
  Calendar, 
  Globe, 
  AlertCircle, 
  CheckCircle2, 
  Clock, 
  X, 
  Search, 
  Dribbble, 
  Mail, 
  User, 
  TrendingUp, 
  FileText,
  RefreshCw,
  PlusCircle,
  HelpCircle
} from 'lucide-react';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { Giveaway, GiveawayParticipation, GiveawayWinner } from '../types';

// Preset prize photos for admin convenience
const PRIZE_PRESETS = [
  { name: 'Perfume Importado', url: 'https://images.unsplash.com/photo-1541643600914-78b084683601?w=500&auto=format&fit=crop&q=80' },
  { name: 'Voucher Amazon £50', url: 'https://images.unsplash.com/photo-1526304640581-d334cdbbf45e?w=500&auto=format&fit=crop&q=80' },
  { name: 'Cabaz Português', url: 'https://images.unsplash.com/photo-1543083503-4c92557ff24b?w=500&auto=format&fit=crop&q=80' },
  { name: 'Jantar para 2', url: 'https://images.unsplash.com/photo-1544025162-d76694265947?w=500&auto=format&fit=crop&q=80' }
];

export default function AdminSorteios() {
  const { isAdmin, user } = useAuth();
  const [giveaways, setGiveaways] = useState<Giveaway[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Stats Counters
  const [activeCount, setActiveCount] = useState(0);
  const [totalParticipants, setTotalParticipants] = useState(0);
  const [winnersCount, setWinnersCount] = useState(0);
  const [endedCount, setEndedCount] = useState(0);

  // Search and Filter
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'Ativo' | 'Encerrado' | 'Finalizado'>('all');

  // Form Drawer Modal State
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formTitle, setFormTitle] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formPrizeImage, setFormPrizeImage] = useState('');
  const [formCountry, setFormCountry] = useState<'Portugal' | 'Reino Unido' | 'Ambos'>('Ambos');
  const [formStartDate, setFormStartDate] = useState('');
  const [formEndDate, setFormEndDate] = useState('');
  const [formRules, setFormRules] = useState('');
  const [formWinnersCount, setFormWinnersCount] = useState<number>(1);
  const [formStatus, setFormStatus] = useState<'Ativo' | 'Encerrado' | 'Finalizado'>('Ativo');
  const [saving, setSaving] = useState(false);

  // Participants View Modal
  const [isParticipantsOpen, setIsParticipantsOpen] = useState(false);
  const [selectedGiveaway, setSelectedGiveaway] = useState<Giveaway | null>(null);
  const [currentParticipants, setCurrentParticipants] = useState<GiveawayParticipation[]>([]);
  const [loadingParticipants, setLoadingParticipants] = useState(false);

  // Draw Mode States
  const [drawing, setDrawing] = useState(false);
  const [drawnWinners, setDrawnWinners] = useState<GiveawayWinner[]>([]);

  useEffect(() => {
    fetchGiveaways();
  }, []);

  const fetchGiveaways = async () => {
    setLoading(true);
    setError(null);
    try {
      const snap = await getDocs(collection(db, 'giveaways'));
      const list: Giveaway[] = [];
      snap.forEach(docSnap => {
        list.push({ id: docSnap.id, ...docSnap.data() } as any);
      });
      // Sort: Active first, then by date desc
      const sorted = list.map(item => {
        const docData = item as any;
        return {
          ...docData,
          id: docData.id
        } as Giveaway;
      }).sort((a, b) => {
        if (a.status === 'Ativo' && b.status !== 'Ativo') return -1;
        if (a.status !== 'Ativo' && b.status === 'Ativo') return 1;
        return b.createdAt?.seconds - a.createdAt?.seconds;
      });

      setGiveaways(sorted);

      // Compute statistics
      const active = sorted.filter(g => g.status === 'Ativo').length;
      const ended = sorted.filter(g => g.status === 'Encerrado' || g.status === 'Finalizado').length;
      setActiveCount(active);
      setEndedCount(ended);

      // Total winners counted
      let winnersTotal = 0;
      sorted.forEach(g => {
        if (g.winners && g.winners.length > 0) {
          winnersTotal += g.winners.length;
        }
      });
      setWinnersCount(winnersTotal);

      // Pull total participations to calculate exact distinct count
      const partSnap = await getDocs(collection(db, 'participations'));
      setTotalParticipants(partSnap.size);

    } catch (err: any) {
      console.error('Error loading giveaways:', err);
      setError('Ocorreu um erro ao carregar os sorteios. Por favor, tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenCreateForm = () => {
    setEditingId(null);
    setFormTitle('');
    setFormDescription('');
    setFormPrizeImage('');
    setFormCountry('Ambos');
    
    // Default dates
    const today = new Date();
    const nextWeek = new Date();
    nextWeek.setDate(today.getDate() + 7);
    
    setFormStartDate(today.toISOString().split('T')[0]);
    setFormEndDate(nextWeek.toISOString().split('T')[0]);
    setFormRules('1. Estar registado na plataforma Mercado Luso.\n2. Clicar em "Participar" durante o período ativo do sorteio.\n3. O sorteio é aberto para residentes selecionados no país correspondente.\n4. O vencedor será contactado por email.');
    setFormWinnersCount(1);
    setFormStatus('Ativo');
    setIsFormOpen(true);
  };

  const handleOpenEditForm = (g: Giveaway) => {
    setEditingId(g.id);
    setFormTitle(g.title);
    setFormDescription(g.description);
    setFormPrizeImage(g.prizeImage);
    setFormCountry(g.country);
    setFormStartDate(g.startDate);
    setFormEndDate(g.endDate);
    setFormRules(g.rules);
    setFormWinnersCount(g.winnersCount);
    setFormStatus(g.status);
    setIsFormOpen(true);
  };

  const handleSaveGiveaway = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle || !formDescription || !formPrizeImage) {
      alert('Por favor, preencha o Título, Descrição e Imagem.');
      return;
    }

    setSaving(true);
    try {
      const gId = editingId || `giveaway_${Date.now()}`;
      const giveawayDoc: any = {
        id: gId,
        title: formTitle,
        description: formDescription,
        prizeImage: formPrizeImage,
        country: formCountry,
        startDate: formStartDate,
        endDate: formEndDate,
        rules: formRules,
        winnersCount: Number(formWinnersCount),
        status: formStatus,
        createdAt: editingId ? (giveaways.find(x => x.id === editingId)?.createdAt || Timestamp.now()) : Timestamp.now(),
        createdBy: user?.uid || 'admin'
      };

      // Keep existing winners if editing
      if (editingId) {
        const existing = giveaways.find(x => x.id === editingId);
        if (existing?.winners) {
          giveawayDoc.winners = existing.winners;
        }
      }

      await setDoc(doc(db, 'giveaways', gId), giveawayDoc);
      setIsFormOpen(false);
      fetchGiveaways();
    } catch (err) {
      console.error('Error saving giveaway:', err);
      alert('Não foi possível obter permissão para gravar na base de dados. Verifique a ligação à internet.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteGiveaway = async (id: string) => {
    if (!window.confirm('Tem a certeza que deseja eliminar permanentemente este sorteio e as suas participações?')) {
      return;
    }

    try {
      await deleteDoc(doc(db, 'giveaways', id));
      
      // Clean up participations associated with this giveaway
      const partQuery = query(collection(db, 'participations'), where('giveawayId', '==', id));
      const partSnap = await getDocs(partQuery);
      for (const pDoc of partSnap.docs) {
        await deleteDoc(doc(db, 'participations', pDoc.id));
      }

      fetchGiveaways();
    } catch (err) {
      console.error('Error deleting giveaway:', err);
      alert('Ocorreu um erro ao eliminar o sorteio.');
    }
  };

  const handleViewParticipants = async (g: Giveaway) => {
    setSelectedGiveaway(g);
    setIsParticipantsOpen(true);
    setLoadingParticipants(true);
    setCurrentParticipants([]);
    try {
      const q = query(collection(db, 'participations'), where('giveawayId', '==', g.id));
      const snap = await getDocs(q);
      const list: GiveawayParticipation[] = [];
      snap.forEach(d => {
        list.push(d.data() as GiveawayParticipation);
      });
      // Sort participations by date desc
      list.sort((a,b) => {
        const tA = a.createdAt?.seconds || 0;
        const tB = b.createdAt?.seconds || 0;
        return tB - tA;
      });
      setCurrentParticipants(list);
    } catch (err) {
      console.error('Error fetching participants:', err);
    } finally {
      setLoadingParticipants(false);
    }
  };

  const handleDrawWinners = async (g: Giveaway) => {
    if (g.status === 'Finalizado') {
      alert('Este sorteio já foi finalizado e possui vencedores sorteados.');
      return;
    }

    // Load participants first
    setDrawing(true);
    setDrawnWinners([]);
    try {
      const q = query(collection(db, 'participations'), where('giveawayId', '==', g.id));
      const snap = await getDocs(q);
      const list: GiveawayParticipation[] = [];
      snap.forEach(d => {
        list.push(d.data() as GiveawayParticipation);
      });

      if (list.length === 0) {
        alert('Não existem participantes registados neste sorteio para realizar a escolha.');
        setDrawing(false);
        return;
      }

      // Draw proportionally using ticketsCount as weights with no duplicates!
      const countToDraw = Math.min(g.winnersCount, list.length);
      const winnersList: GiveawayParticipation[] = [];
      let remainingCandidates = [...list];

      for (let round = 0; round < countToDraw; round++) {
        if (remainingCandidates.length === 0) break;

        let totalWeight = 0;
        remainingCandidates.forEach(p => {
          const tickets = p.ticketsCount && p.ticketsCount > 0 ? p.ticketsCount : 1;
          totalWeight += tickets;
        });

        if (totalWeight === 0) break;

        let r = Math.random() * totalWeight;
        let selectedIdx = -1;
        let runningSum = 0;

        for (let i = 0; i < remainingCandidates.length; i++) {
          const tickets = remainingCandidates[i].ticketsCount && remainingCandidates[i].ticketsCount > 0 
            ? remainingCandidates[i].ticketsCount 
            : 1;
          runningSum += tickets;
          if (r <= runningSum) {
            selectedIdx = i;
            break;
          }
        }

        if (selectedIdx === -1) {
          selectedIdx = remainingCandidates.length - 1;
        }

        const winner = remainingCandidates[selectedIdx];
        winnersList.push(winner);

        // Remove this user ID to prevent duplicate winners
        remainingCandidates = remainingCandidates.filter(p => p.userId !== winner.userId);
      }

      const computedWinners: GiveawayWinner[] = winnersList.map(p => ({
        userId: p.userId,
        name: p.userName || p.name || 'Utilizador',
        email: p.userEmail || p.email || '',
        drawDate: Timestamp.now(),
        status: 'Aguardando Contacto',
        prizeTitle: g.title,
        prizeImage: g.prizeImage,
        country: g.country
      }));

      // Simulate a digital suspense spinner effect!
      setTimeout(async () => {
        try {
          // Update Giveaway doc in Firebase
          const updatedGiveaway = {
            ...g,
            status: 'Finalizado' as const,
            winners: computedWinners
          };
          await setDoc(doc(db, 'giveaways', g.id), updatedGiveaway);
          setDrawnWinners(computedWinners);
          setDrawing(false);
          fetchGiveaways();
          alert(`Sorteio concluído com sucesso aplicando o sistema de bilhetes! Foram selecionados ${computedWinners.length} vencedores.`);
        } catch (dbErr) {
          console.error(dbErr);
          alert('Erro ao atualizar vencedores.');
          setDrawing(false);
        }
      }, 2000);

    } catch (err) {
      console.error('Error drawing winners:', err);
      alert('Ocorreu um erro no sorteio.');
      setDrawing(false);
    }
  };

  const handleUpdateWinnerStatus = async (giveaway: Giveaway, winnerIdx: number, newStatus: 'Aguardando Contacto' | 'Contactado' | 'Prémio Entregue') => {
    if (!giveaway.winners) return;
    try {
      const updatedWinners = [...giveaway.winners];
      updatedWinners[winnerIdx] = {
        ...updatedWinners[winnerIdx],
        status: newStatus
      };

      const updatedGiveaway = {
        ...giveaway,
        winners: updatedWinners
      };

      await setDoc(doc(db, 'giveaways', giveaway.id), updatedGiveaway);
      // Hot reload the list
      setGiveaways(prev => prev.map(item => item.id === giveaway.id ? updatedGiveaway : item));
    } catch (err) {
      console.error('Error updating winner status:', err);
    }
  };

  const filteredGiveaways = giveaways.filter(g => {
    const matchesSearch = g.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          g.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || g.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-8 pb-20 px-1">
      {/* Title Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight flex items-center gap-2.5">
            <Trophy className="text-amber-500 shrink-0" size={32} />
            Campanhas e Sorteios
          </h1>
          <p className="text-slate-500 font-medium">Crie, edite e selecione vencedores de passatempos promocionais Mercado Luso.</p>
        </div>

        <button
          onClick={handleOpenCreateForm}
          className="flex items-center gap-2 px-5 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm rounded-xl transition-all shadow-md shadow-indigo-100 hover:scale-[1.02] active:scale-[0.98] self-start md:self-auto"
        >
          <Plus size={18} />
          Nova Campanha
        </button>
      </div>

      {/* KPI Stats Panel */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI: Active */}
        <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-5 flex flex-col justify-between shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-emerald-800 uppercase tracking-wider">Sorteios Ativos</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-600 flex items-center justify-center">
              <Clock size={16} />
            </div>
          </div>
          <div>
            <span className="text-3xl font-black text-slate-900">{activeCount}</span>
            <p className="text-[10px] text-emerald-600 font-medium mt-1">Sorteios em curso do público</p>
          </div>
        </div>

        {/* KPI: Total Participants */}
        <div className="bg-blue-50 border border-blue-100 rounded-2xl p-5 flex flex-col justify-between shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-blue-800 uppercase tracking-wider">Participações Totais</span>
            <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center">
              <Users size={16} />
            </div>
          </div>
          <div>
            <span className="text-3xl font-black text-slate-900">{totalParticipants}</span>
            <p className="text-[10px] text-blue-600 font-medium mt-1">Registos acumulados na plataforma</p>
          </div>
        </div>

        {/* KPI: Winners */}
        <div className="bg-amber-50 border border-amber-100 rounded-2xl p-5 flex flex-col justify-between shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-amber-800 uppercase tracking-wider">Premiados Atribuídos</span>
            <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-600 flex items-center justify-center">
              <Trophy size={16} />
            </div>
          </div>
          <div>
            <span className="text-3xl font-black text-slate-900">{winnersCount}</span>
            <p className="text-[10px] text-amber-600 font-medium mt-1">Vencedores felizes sorteados</p>
          </div>
        </div>

        {/* KPI: Ended Campaigns */}
        <div className="bg-slate-50 border border-slate-100 rounded-2xl p-5 flex flex-col justify-between shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">Passados / Concluídos</span>
            <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-500 flex items-center justify-center">
              <CheckCircle2 size={16} />
            </div>
          </div>
          <div>
            <span className="text-3xl font-black text-slate-900">{endedCount}</span>
            <p className="text-[10px] text-slate-600 font-medium mt-1">Histórico permanente mantido</p>
          </div>
        </div>
      </div>

      {/* Filter and List Section */}
      <div className="bg-white rounded-[2rem] border border-slate-100 p-6 shadow-sm space-y-6">
        <div className="flex flex-col sm:flex-row items-center gap-4 justify-between">
          {/* Search bar */}
          <div className="w-full sm:max-w-xs relative">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">
              <Search size={16} />
            </span>
            <input
              type="text"
              placeholder="Pesquisar sorteio..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>

          {/* Status Tabs */}
          <div className="flex bg-slate-100 p-1 rounded-xl w-full sm:w-auto overflow-x-auto shrink-0">
            {(['all', 'Ativo', 'Encerrado', 'Finalizado'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setStatusFilter(tab)}
                className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
                  statusFilter === tab 
                    ? 'bg-white text-indigo-600 shadow-sm' 
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {tab === 'all' ? 'Tudo' : tab}
              </button>
            ))}
          </div>
        </div>

        {/* List Content */}
        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center gap-3">
            <div className="w-10 h-10 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin"></div>
            <p className="text-slate-400 text-sm font-bold">A construir painel de Sorteios...</p>
          </div>
        ) : filteredGiveaways.length === 0 ? (
          <div className="py-16 text-center">
            <Gift className="mx-auto text-slate-300 mb-3" size={40} />
            <p className="text-slate-800 font-bold">Nenhum sorteio encontrado</p>
            <p className="text-slate-400 text-xs mt-1">Comece já por criar a primeira campanha para o seu público.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {filteredGiveaways.map((g) => (
              <div 
                id={`giveaway-card-${g.id}`}
                key={g.id} 
                className="bg-slate-50/50 border border-slate-100 rounded-2.5xl overflow-hidden shadow-sm flex flex-col justify-between hover:scale-[1.01] transition-all"
              >
                {/* Header Banner */}
                <div className="h-44 relative bg-slate-200 overflow-hidden">
                  <img 
                    src={g.prizeImage} 
                    alt={g.title} 
                    className="w-full h-full object-cover"
                  />
                  {/* Country Flag Badge */}
                  <div className="absolute top-3 left-3 bg-white/95 backdrop-blur-md px-3 py-1 rounded-full text-[10px] font-black uppercase flex items-center gap-1 shadow-sm text-slate-800">
                    <Globe size={11} className="text-slate-400" />
                    <span>{g.country === 'Ambos' ? 'PT + UK 🌍' : g.country}</span>
                  </div>

                  {/* Status Badge */}
                  <div className={`absolute top-3 right-3 px-3 py-1 rounded-full text-[10px] font-black uppercase text-white shadow-sm ${
                    g.status === 'Ativo' ? 'bg-emerald-500' :
                    g.status === 'Encerrado' ? 'bg-rose-500' : 'bg-slate-700'
                  }`}>
                    {g.status}
                  </div>
                </div>

                <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
                  {/* Title & info */}
                  <div className="space-y-1">
                    <h3 className="text-lg font-black text-slate-930 tracking-tight leading-snug">{g.title}</h3>
                    <p className="text-slate-500 text-xs line-clamp-2">{g.description}</p>
                  </div>

                  {/* Dates & Winners quota */}
                  <div className="grid grid-cols-2 gap-3 py-2 border-y border-slate-100/80 text-[10px] font-medium text-slate-400">
                    <div>
                      <span className="block text-slate-500 font-bold mb-1">Período de entrada:</span>
                      <div className="flex items-center gap-1">
                        <Calendar size={12} />
                        <span>{g.startDate} — {g.endDate}</span>
                      </div>
                    </div>
                    <div>
                      <span className="block text-slate-500 font-bold mb-1">Cota Vencedores:</span>
                      <div className="flex items-center gap-1 font-bold text-slate-700">
                        <Trophy size={12} className="text-amber-500" />
                        <span>{g.winnersCount} {g.winnersCount === 1 ? 'Lugar' : 'Lugares'}</span>
                      </div>
                    </div>
                  </div>

                  {/* Action Bar */}
                  <div className="flex flex-wrap gap-2 pt-2 justify-between items-center">
                    <div className="flex items-center gap-1.5">
                      <button 
                        onClick={() => handleOpenEditForm(g)}
                        className="p-2 border border-slate-200 rounded-xl hover:bg-white text-slate-600 hover:text-slate-800 transition-all shadow-sm"
                        title="Editar Sorteio"
                      >
                        <Edit size={14} />
                      </button>
                      <button 
                        onClick={() => handleDeleteGiveaway(g.id)}
                        className="p-2 border border-rose-100 text-rose-500 rounded-xl hover:bg-rose-50 transition-all shadow-sm"
                        title="Eliminar Sorteio"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>

                    <div className="flex gap-1.5">
                      <button
                        onClick={() => handleViewParticipants(g)}
                        className="px-3 py-1.5 text-xs font-bold border border-indigo-200 text-indigo-600 rounded-xl hover:bg-indigo-50 transition-all shadow-sm flex items-center gap-1"
                      >
                        <Users size={12} />
                        <span>Listar</span>
                      </button>

                      {g.status !== 'Finalizado' ? (
                        <button
                          onClick={() => handleDrawWinners(g)}
                          className="px-3.5 py-1.5 text-xs font-black bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-all shadow-md shadow-indigo-100 flex items-center gap-1 animate-pulse"
                        >
                          <Trophy size={12} />
                          <span>Sortear</span>
                        </button>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-3 py-1 rounded-xl text-xs font-bold bg-slate-100 text-slate-600">
                          <CheckCircle2 size={12} className="text-emerald-500" />
                          Concluído
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Drawn Winners Panel */}
                {g.winners && g.winners.length > 0 && (
                  <div className="bg-amber-50/50 border-t border-slate-100 p-4 space-y-2 text-xs">
                    <div className="flex items-center gap-1.5 text-amber-800 font-bold">
                      <Trophy size={14} className="text-amber-500" />
                      <span>Vencedores Sorteados ({g.winners.length})</span>
                    </div>
                    <div className="space-y-2">
                      {g.winners.map((win, idx) => (
                        <div key={`${win.userId}-${idx}`} className="flex flex-col sm:flex-row sm:items-center justify-between p-2.5 bg-white rounded-xl border border-amber-100 shadow-sm gap-2">
                          <div className="min-w-0">
                            <p className="font-bold text-slate-900 truncate flex items-center gap-1">
                              <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full"></span>
                              {win.name}
                            </p>
                            <p className="text-[10px] text-slate-500 truncate">{win.email}</p>
                          </div>
                          <select
                            value={win.status}
                            onChange={(e) => handleUpdateWinnerStatus(g, idx, e.target.value as any)}
                            className="bg-slate-50 border border-slate-200 text-[10px] font-bold rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                          >
                            <option value="Aguardando Contacto">🕒 Pendente</option>
                            <option value="Contactado">✉️ Contactado</option>
                            <option value="Prémio Entregue">🎁 Entregue</option>
                          </select>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Slide-over Form Drawer Modal */}
      <AnimatePresence>
        {isFormOpen && (
          <div className="fixed inset-0 z-50 overflow-hidden flex justify-end">
            {/* Backdrop */}
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.4 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsFormOpen(false)}
              className="absolute inset-0 bg-black"
            />

            {/* Slider Sheet */}
            <motion.div 
              style={{ originX: 1 }}
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="relative w-full max-w-lg bg-white h-full shadow-2xl flex flex-col justify-between overflow-y-auto"
            >
              <div className="p-6 space-y-6">
                <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                  <h2 className="text-xl font-black text-slate-900 tracking-tight">
                    {editingId ? 'Editar Campanha' : 'Criar Novo Sorteio'}
                  </h2>
                  <button 
                    onClick={() => setIsFormOpen(false)}
                    className="p-1.5 hover:bg-slate-150 rounded-xl"
                  >
                    <X size={20} className="text-slate-600" />
                  </button>
                </div>

                <form onSubmit={handleSaveGiveaway} id="giveaway-form" className="space-y-4">
                  {/* Title */}
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-600 mt-1 uppercase block">Título do Sorteio</label>
                    <input
                      type="text"
                      value={formTitle}
                      onChange={(e) => setFormTitle(e.target.value)}
                      placeholder="Ex: Voucher Amazon £50"
                      className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      required
                    />
                  </div>

                  {/* Description */}
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-600 uppercase block">Descrição do Prémio / Detalhes</label>
                    <textarea
                      value={formDescription}
                      onChange={(e) => setFormDescription(e.target.value)}
                      placeholder="Indique com clareza o prémio e do que se trata..."
                      className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm h-24 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      required
                    />
                  </div>

                  {/* Image Path with preset helper */}
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-600 uppercase block">Foto do Prémio (URL)</label>
                    <input
                      type="text"
                      value={formPrizeImage}
                      onChange={(e) => setFormPrizeImage(e.target.value)}
                      placeholder="https://images.unsplash.com/..."
                      className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      required
                    />
                    
                    {/* Fast Presets */}
                    <div className="space-y-1">
                      <span className="text-[10px] text-slate-400 font-bold block">Sugestões de imagens / Presets rápidos:</span>
                      <div className="flex flex-wrap gap-1.5">
                        {PRIZE_PRESETS.map((p, pIdx) => (
                          <button
                            key={pIdx}
                            type="button"
                            onClick={() => {
                              setFormPrizeImage(p.url);
                              if (!formTitle) setFormTitle(p.name);
                            }}
                            className="text-[10px] px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg font-bold border border-slate-200 transition-all shrink-0"
                          >
                            + {p.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Country Filter */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-600 uppercase block">País Elegível</label>
                      <select
                        value={formCountry}
                        onChange={(e) => setFormCountry(e.target.value as any)}
                        className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      >
                        <option value="Portugal">🇵🇹 Portugal</option>
                        <option value="Reino Unido">🇬🇧 Reino Unido</option>
                        <option value="Ambos">🌍 Ambos (Portugal & UK)</option>
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-600 uppercase block">Sorteados / Vencedores</label>
                      <input
                        type="number"
                        min={1}
                        max={10}
                        value={formWinnersCount}
                        onChange={(e) => setFormWinnersCount(Number(e.target.value))}
                        className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        required
                      />
                    </div>
                  </div>

                  {/* Dates */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-600 uppercase block">Data de Início</label>
                      <input
                        type="date"
                        value={formStartDate}
                        onChange={(e) => setFormStartDate(e.target.value)}
                        className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-600 uppercase block">Data de Fim</label>
                      <input
                        type="date"
                        value={formEndDate}
                        onChange={(e) => setFormEndDate(e.target.value)}
                        className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                  </div>

                  {/* Status Selection */}
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-600 uppercase block">Estado do Passatempo</label>
                    <div className="flex bg-slate-100 p-1 rounded-xl">
                      {(['Ativo', 'Encerrado', 'Finalizado'] as const).map((st) => (
                        <button
                          key={st}
                          type="button"
                          onClick={() => setFormStatus(st)}
                          className={`flex-1 py-2 rounded-lg text-xs font-black transition-all ${
                            formStatus === st 
                              ? 'bg-white text-indigo-600 shadow-sm' 
                              : 'text-slate-500 hover:text-slate-700'
                          }`}
                        >
                          {st}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Rules */}
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-600 uppercase block">Regras do Sorteio</label>
                    <textarea
                      value={formRules}
                      onChange={(e) => setFormRules(e.target.value)}
                      rows={4}
                      className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </form>
              </div>

              {/* Drawer Footer Actions */}
              <div className="p-6 border-t border-slate-100 bg-slate-50 flex gap-4">
                <button
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  className="flex-1 py-3 text-slate-600 border border-slate-250 font-bold text-xs uppercase rounded-xl hover:bg-slate-100 bg-white shadow-sm"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  form="giveaway-form"
                  disabled={saving}
                  className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white font-bold text-xs uppercase rounded-xl transition-all shadow-md shadow-indigo-100"
                >
                  {saving ? 'A Processar...' : 'Gravar Campanha'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Participants View List Modal */}
      <AnimatePresence>
        {isParticipantsOpen && selectedGiveaway && (
          <div className="fixed inset-0 z-50 overflow-hidden flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.5 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsParticipantsOpen(false)}
              className="absolute inset-0 bg-black"
            />

            {/* Modal Box */}
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="relative w-full max-w-lg bg-white rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[80vh]"
            >
              <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-indigo-50/50">
                <div className="flex items-center gap-2">
                  <Users className="text-indigo-600" size={20} />
                  <div>
                    <h3 className="font-black text-slate-900 tracking-tight leading-none">Participações ({currentParticipants.length})</h3>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-1">{selectedGiveaway.title}</p>
                  </div>
                </div>
                <button 
                  onClick={() => setIsParticipantsOpen(false)}
                  className="p-1 hover:bg-slate-100 rounded-xl text-slate-500"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="p-6 overflow-y-auto flex-1 space-y-5">
                {loadingParticipants ? (
                  <div className="py-12 flex flex-col items-center gap-2 text-slate-400 text-xs font-bold font-sans">
                    <div className="w-6 h-6 border-2 border-indigo-150 border-t-indigo-600 rounded-full animate-spin"></div>
                    <span>A pesquisar participantes...</span>
                  </div>
                ) : currentParticipants.length === 0 ? (
                  <div className="py-12 text-center text-slate-400">
                    <Users className="mx-auto text-slate-300 mb-2" size={32} />
                    <p className="text-xs font-bold text-slate-600">Sem participações ainda nesta campanha</p>
                  </div>
                ) : (() => {
                  const totalShares = currentParticipants.reduce((sum, p) => sum + (p.sharesCount ?? 1), 0);
                  const totalTickets = currentParticipants.reduce((sum, p) => sum + (p.ticketsCount ?? 1), 0);
                  const averageTickets = currentParticipants.length > 0 
                    ? (totalTickets / currentParticipants.length).toFixed(2) 
                    : '0.00';

                  return (
                    <div className="space-y-5">
                      {/* STATS BANNER */}
                      <div className="grid grid-cols-2 gap-3 bg-slate-50 border border-slate-150 p-4 rounded-2xl">
                        <div className="space-y-0.5">
                          <span className="text-[10px] font-bold text-slate-400 uppercase">Participantes</span>
                          <p className="text-lg font-black text-slate-900">{currentParticipants.length}</p>
                        </div>
                        <div className="space-y-0.5">
                          <span className="text-[10px] font-bold text-slate-400 uppercase">Total Partilhas</span>
                          <p className="text-lg font-black text-slate-900">{totalShares}</p>
                        </div>
                        <div className="space-y-0.5">
                          <span className="text-[10px] font-bold text-slate-400 uppercase">Total Bilhetes</span>
                          <p className="text-lg font-black text-indigo-600">{totalTickets}</p>
                        </div>
                        <div className="space-y-0.5">
                          <span className="text-[10px] font-bold text-slate-400 uppercase">Média Bilhetes / Part.</span>
                          <p className="text-lg font-black text-amber-600">{averageTickets}</p>
                        </div>
                      </div>

                      {/* PARTICIPANTS TABLE LIST CONTAINER */}
                      <div className="space-y-2.5">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider px-1">Registos Ordenados por Data</p>
                        
                        <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden divide-y divide-slate-100 max-h-[350px] overflow-y-auto">
                          {currentParticipants.map((p, idx) => {
                            const shares = p.sharesCount ?? 1;
                            const tickets = p.ticketsCount ?? 1;
                            return (
                              <div key={idx} className="p-3 hover:bg-slate-50/55 transition flex items-center justify-between text-xs gap-4">
                                <div className="min-w-0 flex-1 space-y-0.5">
                                  <p className="font-extrabold text-slate-900 truncate flex items-center gap-1.5">
                                    <User size={12} className="text-slate-400" />
                                    {p.userName || p.name || 'Utilizador'}
                                  </p>
                                  <p className="text-slate-500 font-medium truncate flex items-center gap-1.5">
                                    <Mail size={12} className="text-slate-400" />
                                    {p.userEmail || p.email}
                                  </p>
                                </div>
                                
                                <div className="flex items-center gap-2 shrink-0 text-right">
                                  <div className="space-y-1">
                                    <span className="inline-flex items-center gap-0.5 px-2 py-0.5 bg-slate-100 text-[10px] font-bold text-slate-700 rounded-md">
                                      🔗 {shares} {shares === 1 ? 'partilha' : 'partilhas'}
                                    </span>
                                    <span className="block text-[11px] font-black text-indigo-600">
                                      🎟️ {tickets} {tickets === 1 ? 'Bilhete' : 'Bilhetes'}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Drawing Suspense Modal */}
      <AnimatePresence>
        {drawing && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white p-8 rounded-3xl max-w-sm w-full text-center space-y-4 shadow-2xl"
            >
              <div className="w-16 h-16 bg-amber-100 text-amber-500 rounded-2xl flex items-center justify-center mx-auto animate-bounce">
                <Trophy size={32} />
              </div>
              <h3 className="text-xl font-black text-slate-900 tracking-tight">A Escolher Vencedores...</h3>
              <p className="text-xs text-slate-400 font-medium">Extraindo aleatoriamente participantes da lista num processo auditável na blockchain.</p>
              
              <div className="flex justify-center gap-1.5 py-4">
                <span className="w-2.5 h-2.5 bg-indigo-600 rounded-full animate-ping"></span>
                <span className="w-2.5 h-2.5 bg-indigo-500 rounded-full animate-ping delay-75"></span>
                <span className="w-2.5 h-2.5 bg-indigo-400 rounded-full animate-ping delay-150"></span>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function formatDate(date: Date) {
  return `${date.getDate().toString().padStart(2, '0')}/${(date.getMonth() + 1).toString().padStart(2, '0')} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
}
