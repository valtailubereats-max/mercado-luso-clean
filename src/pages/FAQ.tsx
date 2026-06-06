import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { HelpCircle, ChevronDown, ChevronUp, Search, MessageCircle, Mail } from 'lucide-react';

interface FAQItem {
  question: string;
  answer: string;
}

const FAQ = () => {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  React.useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, []);

  const faqData: FAQItem[] = [
    {
      question: 'O que é o Mercado Luso?',
      answer: 'O Mercado Luso é uma plataforma de anúncios e negócios criada para conectar toda a comunidade de língua portuguesa em qualquer lugar do mundo. O nosso objetivo é guiar compradores e vendedores para negociarem excelentes artigos de forma simples, direta e segura, tirando partido de ferramentas intuitivas e suporte via WhatsApp.'
    },
    {
      question: 'Como publicar um anúncio?',
      answer: 'Basta aceder ao botão "Anunciar" no menu ou "Publicar" no telemóvel. Caso ainda não tenha uma conta, será convidado a registar-se em segundos. Depois, preencha as informações do artigo (título, preço, descrição, fotos, cidade e categoria) e submeta. O seu anúncio ficará pendente de uma aprovação rápida pela nossa moderação para manter a comunidade fidedigna.'
    },
    {
      question: 'O anúncio é gratuito?',
      answer: 'Sim! Publicar anúncios básicos no Mercado Luso é inteiramente gratuito. Não há comissões sobre as suas vendas e não cobramos mensalidades para manter os seus negócios ativos.'
    },
    {
      question: 'Como contacto o vendedor?',
      answer: 'Dispomos de contactos diretos. Na página de detalhes de cada anúncio, poderá clicar no botão do WhatsApp para abrir uma conversa imediata e segura com o vendedor do artigo.'
    },
    {
      question: 'Como funciona o destaque de anúncios?',
      answer: 'Os anúncios com Destaque aparecem em áreas nobres no carrossel da página principal, aumentando drasticamente a visibilidade do seu artigo e acelerando a venda. O destaque dura por um período específico e pode ser adquirido ou ativado através de créditos.'
    },
    {
      question: 'Como ganho créditos de destaque?',
      answer: 'Pode ganhar créditos convidando novos utilizadores para a plataforma! Aceda ao seu Perfil, copie o seu link personalizado e partilhe-o com os seus amigos. Quando eles se registarem, ambos ganham créditos promocionais para destacar os vossos anúncios gratuitamente.'
    },
    {
      question: 'Como denunciar um anúncio?',
      answer: 'Se encontrar algum anúncio suspeito, enganador ou inadequado, clique no link "Denúncia" presente no rodapé do site. Preencha o formulário com o motivo e pormenores, e a nossa equipa de moderação tratará de auditar e limpar o conteúdo imediatamente.'
    },
    {
      question: 'Como entro em contacto com o suporte?',
      answer: 'Pode falar connosco diretamente em tempo real utilizando o link do "Suporte" via WhatsApp no rodapé ou enviando um correio eletrónico para mercadolusopt@gmail.com. Estamos sempre disponíveis para o ajudar com qualquer dúvida!'
    }
  ];

  const toggleAccordion = (index: number) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  const filteredFaq = faqData.filter(item =>
    item.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.answer.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="max-w-4xl mx-auto px-4 py-12" id="faq-page">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-8"
      >
        {/* Header */}
        <div className="text-center space-y-3">
          <div className="w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-600 mx-auto">
            <HelpCircle size={28} />
          </div>
          <h1 className="text-3xl md:text-4xl font-black text-slate-900 tracking-tight">Perguntas Frequentes</h1>
          <p className="text-slate-500 text-sm max-w-lg mx-auto">
            Encontre respostas rápidas para as dúvidas mais comuns sobre o funcionamento do Mercado Luso.
          </p>
        </div>

        {/* Search tool */}
        <div className="relative max-w-lg mx-auto">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Procure por uma pergunta ou tema..."
            className="w-full bg-white border border-slate-200 rounded-2xl py-3 pl-11 pr-4 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 transition-all shadow-sm"
            id="faq-search-input"
          />
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
        </div>

        {/* FAQ Items (Accordion) */}
        <div className="bg-white rounded-[2rem] p-6 md:p-8 shadow-xl border border-slate-100 divide-y divide-slate-100" id="faq-accordion-container">
          {filteredFaq.length === 0 ? (
            <div className="text-center py-12 text-slate-400 text-sm font-medium">
              Nenhuma pergunta corresponde à sua pesquisa.
            </div>
          ) : (
            filteredFaq.map((item, index) => {
              const isOpen = openIndex === index;
              return (
                <div key={`faq-item-${index}`} className="py-4 first:pt-0 last:pb-0" id={`faq-item-${index}`}>
                  <button
                    onClick={() => toggleAccordion(index)}
                    className="w-full flex justify-between items-center py-2 text-left font-bold text-slate-800 hover:text-indigo-600 gap-4 transition-colors focus:outline-none text-base cursor-pointer"
                    aria-expanded={isOpen}
                    id={`faq-btn-${index}`}
                  >
                    <span>{item.question}</span>
                    <span className="shrink-0 text-slate-400">
                      {isOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                    </span>
                  </button>

                  <AnimatePresence initial={false}>
                    {isOpen && (
                      <motion.div
                        initial={{ height: 0, opacity: 0, marginTop: 0 }}
                        animate={{ height: 'auto', opacity: 1, marginTop: 12 }}
                        exit={{ height: 0, opacity: 0, marginTop: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        <p className="text-sm text-slate-600 leading-relaxed bg-slate-50 p-4 rounded-xl border border-slate-100" id={`faq-answer-${index}`}>
                          {item.answer}
                        </p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })
          )}
        </div>

        {/* Still need help? */}
        <div className="bg-[#bfead0]/30 rounded-[2.5rem] p-8 border border-[#a8dec0]/40 text-center max-w-xl mx-auto mt-12">
          <h3 className="font-bold text-slate-800 mb-2">Ainda precisa de esclarecimento?</h3>
          <p className="text-xs text-slate-500 mb-6 leading-relaxed">
            Se não encontrou o que procurava, a nossa equipa de apoio está sempre pronta para responder aos seus contactos.
          </p>
          <div className="flex flex-col sm:flex-row justify-center gap-4">
            <a
              href="https://wa.me/4407508309536" 
              target="_blank" 
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 px-5 py-2.5 bg-emerald-600 text-white font-bold text-xs rounded-xl hover:bg-emerald-700 shadow-sm transition-all uppercase tracking-wider cursor-pointer"
              id="faq-whatsapp-support-link"
            >
              <MessageCircle size={16} /> Suporte WhatsApp
            </a>
            <a
              href="mailto:mercadolusopt@gmail.com"
              className="flex items-center justify-center gap-2 px-5 py-2.5 bg-white border border-slate-200 text-slate-700 font-bold text-xs rounded-xl hover:bg-slate-50 shadow-sm transition-all uppercase tracking-wider cursor-pointer"
              id="faq-email-support-link"
            >
              <Mail size={16} /> Enviar E-mail
            </a>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default FAQ;
