import React, { useState } from 'react';
import { IDockviewPanelProps } from 'dockview';
import { Send, Plus, X, Bot, User } from 'lucide-react';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface ContextItem {
  id: string;
  type: string;
  title: string;
}

interface AIAgentWidgetProps extends IDockviewPanelProps {
  params?: Record<string, any>;
}

export const AIAgentWidget: React.FC<AIAgentWidgetProps> = ({ params }) => {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'assistant',
      content: 'Hello! I\'m your AI trading assistant. You can drag charts, order books, or news to me for analysis. How can I help you today?',
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState('');
  const [context, setContext] = useState<ContextItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const handleSend = async () => {
    if (!input.trim()) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    // Simulate AI response
    setTimeout(() => {
      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `Based on the current market data, I see that... [This is a placeholder response. The AI integration will provide real analysis based on the context you provide.]`,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, aiMessage]);
      setIsLoading(false);
    }, 1500);
  };

  const removeContext = (id: string) => {
    setContext((prev) => prev.filter((item) => item.id !== id));
  };

  return (
    <div className="h-full flex flex-col bg-gray-900 text-white">
      {/* Context Area */}
      {context.length > 0 && (
        <div className="p-3 border-b border-gray-800">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs text-gray-500">Context:</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {context.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-1 px-2 py-1 bg-gray-800 rounded-full text-xs"
              >
                <span>{item.type === 'chart' ? '📊' : item.type === 'orderbook' ? '📋' : '📰'}</span>
                <span className="max-w-[100px] truncate">{item.title}</span>
                <button
                  onClick={() => removeContext(item.id)}
                  className="ml-1 hover:text-red-400"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Drop Zone (when empty) */}
      {context.length === 0 && (
        <div className="px-3 pt-3">
          <div className="border-2 border-dashed border-gray-700 rounded-lg p-3 text-center text-xs text-gray-500">
            <Plus size={16} className="mx-auto mb-1 opacity-50" />
            Drag widgets here to add context
          </div>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-auto p-3 space-y-4">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            {msg.role === 'assistant' && (
              <div className="w-6 h-6 rounded-full bg-purple-600 flex items-center justify-center flex-shrink-0">
                <Bot size={14} />
              </div>
            )}
            <div
              className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                msg.role === 'user'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-800 text-gray-200'
              }`}
            >
              {msg.content}
            </div>
            {msg.role === 'user' && (
              <div className="w-6 h-6 rounded-full bg-gray-600 flex items-center justify-center flex-shrink-0">
                <User size={14} />
              </div>
            )}
          </div>
        ))}

        {isLoading && (
          <div className="flex gap-2">
            <div className="w-6 h-6 rounded-full bg-purple-600 flex items-center justify-center">
              <Bot size={14} />
            </div>
            <div className="bg-gray-800 rounded-lg px-3 py-2">
              <div className="flex gap-1">
                <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="p-3 border-t border-gray-800">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder="Ask about the market..."
            className="flex-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm focus:outline-none focus:border-blue-500"
          />
          <button
            onClick={handleSend}
            disabled={isLoading || !input.trim()}
            className="px-3 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:cursor-not-allowed rounded-lg transition-colors"
          >
            <Send size={16} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default AIAgentWidget;
