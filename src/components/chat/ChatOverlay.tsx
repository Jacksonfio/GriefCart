import { useState, useRef, useEffect } from 'react';
import { MessageCircle, X, Send, Bot, User, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { sendChatMessage } from '@/services/griefcart-client';
import type { ChatMessage } from '@/types';

export function ChatOverlay() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: 'assistant', content: "Hi, I'm your GriefCart AI assistant. Ask me anything about your financial continuity.", timestamp: new Date().toISOString() },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, open]);

  const send = async () => {
    if (!input.trim() || loading) return;
    const userMsg: ChatMessage = { role: 'user', content: input, timestamp: new Date().toISOString() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);
    try {
      const res = await sendChatMessage(input, messages.slice(-6));
      const aiMsg: ChatMessage = { role: 'assistant', content: res.message, timestamp: res.timestamp };
      setMessages(prev => [...prev, aiMsg]);
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Sorry, I encountered an error. Please try again.', timestamp: new Date().toISOString() }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {!open && (
        <button
          aria-label="Open AI assistant"
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-red-600 to-red-700 text-purple-400 shadow-xl shadow-red-600/30 hover:shadow-red-600/50 transition-all duration-300 hover:scale-105 animate-float"
        >
          <MessageCircle className="h-6 w-6" />
        </button>
      )}

      {open && (
        <div className="fixed bottom-6 right-6 z-50 flex h-[520px] w-[380px] flex-col rounded-2xl border border-red-600/20 bg-bg-card/95 backdrop-blur-2xl shadow-2xl shadow-red-600/10 animate-scale-in">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-purple-500 to-purple-600">
                <Bot className="h-4 w-4 text-purple-400" />
              </div>
              <div>
                <p className="text-sm font-semibold text-purple-400">GriefCart AI</p>
                <p className="text-[11px] text-purple-400">Financial Continuity Assistant</p>
              </div>
            </div>
            <button aria-label="Close AI assistant" onClick={() => setOpen(false)} className="rounded-lg p-1.5 text-purple-400 hover:bg-white/5 transition-all">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.map((msg, i) => (
              <div key={i} className={cn('flex', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
                <div className={cn('flex gap-2 max-w-[85%]', msg.role === 'user' ? 'flex-row-reverse' : 'flex-row')}>
                  <div className={cn(
                    'flex h-7 w-7 shrink-0 items-center justify-center rounded-full',
                    msg.role === 'user' ? 'bg-red-600' : 'bg-purple-500/20'
                  )}>
                    {msg.role === 'user' ? <User className="h-3.5 w-3.5 text-purple-400" /> : <Bot className="h-3.5 w-3.5 text-purple-400" />}
                  </div>
                  <div className={cn(
                    'rounded-2xl px-4 py-2.5 text-sm leading-relaxed',
                    msg.role === 'user'
                      ? 'bg-gradient-to-br from-red-600 to-red-700 text-purple-400 rounded-tr-md'
                      : 'bg-purple-500/10 text-purple-400 rounded-tl-md'
                  )}>
                    {msg.content}
                  </div>
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="flex items-center gap-2 rounded-2xl rounded-tl-md bg-purple-500/10 px-4 py-2.5">
                  <Loader2 className="h-4 w-4 animate-spin text-purple-400" />
                  <span className="text-sm text-purple-400">Thinking...</span>
                </div>
              </div>
            )}
            <div ref={endRef} />
          </div>

          <div className="border-t border-border p-4">
            <div className="flex gap-2">
              <input
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && send()}
                placeholder="Ask about your finances..."
                className="flex-1 rounded-xl border border-border bg-white/5 px-4 py-2.5 text-sm text-purple-400 placeholder:text-purple-400/40 outline-none focus:border-red-600/50 focus:ring-1 focus:ring-red-600/20 transition-all"
              />
              <button
                aria-label="Send message"
                onClick={send}
                disabled={loading || !input.trim()}
                className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-red-600 to-red-700 text-purple-400 disabled:opacity-50 hover:shadow-lg hover:shadow-red-600/20 transition-all"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
