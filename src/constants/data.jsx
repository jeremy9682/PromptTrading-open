import React from 'react';

// AI Logo 组件 - 使用真实品牌 Logo
export const AILogo = ({ modelId, size = 32, className = '' }) => {
  const domainMap = {
    deepseek: 'https://deepseek.com',
    // qwen: 'https://qianwen.aliyun.com',
    qwen: undefined,
    gpt4: 'https://openai.com',
    claude: 'https://claude.ai',
    grok: 'https://x.ai',
    gemini: 'https://gemini.google.com',
    mixtral: 'https://mistral.ai',
    llama3: 'https://llama.meta.com',
    openrouter: 'https://openrouter.ai'
  };

  const directLogos = {
    deepseek: 'https://deepseek.com/favicon.ico',
    // qwen: 'https://qianwen.aliyun.com/favicon.ico',
    qwen: 'https://resouces.modelscope.cn/avatar/992f4cdf-8158-464b-b37b-e855100ea14e.png',
    gpt4: 'https://cdn.oaistatic.com/_next/static/media/apple-touch-icon.59f2e898.png',
    claude: 'https://claude.ai/favicon.ico',
    grok: 'https://x.ai/favicon.ico',
    gemini: 'https://www.gstatic.com/lamda/images/favicon_v1_150160cddff7f294ce30.svg',
    mixtral: 'https://mistral.ai/favicon.svg',
    llama3: 'https://llama.meta.com/favicon.ico',
    openrouter: 'https://openrouter.ai/favicon-32x32.png'
  };

  const domain = domainMap[modelId];
  const primarySize = Math.max(64, Math.ceil(size));

  const sources = [
    domain ? `https://www.google.com/s2/favicons?sz=${primarySize}&domain_url=${encodeURIComponent(domain)}` : null,
    directLogos[modelId] || null
  ].filter(Boolean);

  if (sources.length === 0) {
    return <span style={{ fontSize: size }} className={className}>🤖</span>;
  }

  const remainingSources = sources.slice(1);

  return (
    <img
      src={sources[0]}
      alt={`${modelId} logo`}
      width={size}
      height={size}
      className={className}
      style={{
        objectFit: 'contain',
        borderRadius: '4px'
      }}
      data-fallbacks={remainingSources.join('|')}
      onError={(e) => {
        const fallbackString = e.target.getAttribute('data-fallbacks') || '';
        const fallbacks = fallbackString.split('|').filter(Boolean);

        if (fallbacks.length > 0) {
          const next = fallbacks.shift();
          e.target.setAttribute('data-fallbacks', fallbacks.join('|'));
          e.target.src = next;
          return;
        }

        e.target.replaceWith(
          Object.assign(document.createElement('span'), {
            textContent: '🤖',
            style: `font-size: ${size}px; display: inline-flex; align-items: center; justify-content: center;`
          })
        );
      }}
    />
  );
};

// AI 模型配置
// 按照用户要求的顺序：deepseek, 通义千问, chatgpt, claude, grok
export const getAiModels = (language) => [
  { 
    id: 'deepseek', 
    name: 'DeepSeek', 
    icon: '🔮', 
    strength: language === 'zh' ? '深度推理' : 'Deep Reasoning',
    free: 10,
    rating: 4.9,
    users: '15.3k',
    profitRate: '+25.8%',
    apiCost: '$0.014/1k tokens',
    brandColor: 'from-indigo-500 to-purple-600'
  },
  { 
    id: 'qwen', 
    name: language === 'zh' ? '通义千问' : 'Qwen', 
    icon: '💫', 
    strength: language === 'zh' ? '中文优化' : 'Chinese Optimized',
    free: 8,
    rating: 4.6,
    users: '10.5k',
    profitRate: '+22.1%',
    apiCost: '$0.012/1k tokens',
    brandColor: 'from-red-500 to-orange-500'
  },
  { 
    id: 'gpt4', 
    name: 'GPT-4o', 
    icon: '🧠', 
    strength: language === 'zh' ? '市场预测' : 'Market Prediction',
    free: 5,
    rating: 4.7,
    users: '18.2k',
    profitRate: '+21.3%',
    apiCost: '$0.03/1k tokens',
    brandColor: 'from-green-600 to-teal-600'
  },
  { 
    id: 'claude', 
    name: 'Claude 3.5', 
    icon: '🤖', 
    strength: language === 'zh' ? '深度分析' : 'Deep Analysis',
    free: 5,
    rating: 4.8,
    users: '12.5k',
    profitRate: '+23.5%',
    apiCost: '$0.02/1k tokens',
    brandColor: 'from-amber-600 to-orange-600'
  },
  { 
    id: 'grok', 
    name: 'Grok', 
    icon: '⚡', 
    strength: language === 'zh' ? '实时数据' : 'Real-time Data',
    free: 3,
    rating: 4.5,
    users: '9.8k',
    profitRate: '+20.7%',
    apiCost: '$0.025/1k tokens',
    brandColor: 'from-sky-500 to-blue-600'
  }
];

// 获取 OpenRouter 支持的其他模型（用于下拉选择）
// 只保留验证可用的模型
export const getOpenRouterModels = (language) => [
  { 
    id: 'gemini', 
    name: 'Gemini 2.5 Pro', 
    icon: '✨', 
    strength: language === 'zh' ? '快速决策' : 'Fast Decision',
    rating: 4.5,
    apiCost: '$1.25/M input',
    brandColor: 'from-blue-500 to-red-500'
  },
  { 
    id: 'mixtral', 
    name: 'Mixtral 8x7B', 
    icon: '🎯', 
    strength: language === 'zh' ? '高频交易' : 'High-Frequency',
    rating: 4.3,
    apiCost: '$0.005/1k tokens',
    brandColor: 'from-pink-500 to-purple-600'
  },
  { 
    id: 'llama3', 
    name: 'LLaMA 3.1 70B', 
    icon: '🦙', 
    strength: language === 'zh' ? '开源强大' : 'Open Source Power',
    rating: 4.4,
    apiCost: '$0.004/1k tokens',
    brandColor: 'from-sky-500 to-blue-600'
  }
  // 注意：command-r-plus 和 yi-large 在 OpenRouter 可能不可用，已暂时移除
  // 用户可以通过 OpenRouter 官网确认可用模型后再添加
];

// DEX 交易所配置
export const getDexOptions = (language) => [
  { id: 'hyperliquid', name: 'Hyperliquid', fee: '0.02%', speed: language === 'zh' ? '极快' : 'Ultra Fast', testnet: true },
  { id: 'aster', name: 'Aster', fee: '0.03%', speed: language === 'zh' ? '快' : 'Fast', testnet: true },
  { id: 'uniswap', name: 'Uniswap V3', fee: '0.05%', speed: language === 'zh' ? '标准' : 'Standard', testnet: true },
  { id: 'jupiter', name: 'Jupiter', fee: '0.04%', speed: language === 'zh' ? '快' : 'Fast', testnet: true }
];

// 策略配置
export const getStrategies = (language, t) => [
  {
    id: 'smart_money',
    name: t[language].smartMoney,
    description: language === 'zh' ? '跟踪聪明钱的动向，识别大户建仓信号' : 'Track smart money movements',
    winRate: '72%',
    avgProfit: '+8.5%',
    riskLevel: 'medium',
    rating: 4.7,
    users: 1823,
    beginner: true
  },
  {
    id: 'trend_following',
    name: t[language].trendFollowing,
    description: language === 'zh' ? '识别并跟随市场主要趋势' : 'Identify and follow market trends',
    winRate: '65%',
    avgProfit: '+12.3%',
    riskLevel: 'low',
    rating: 4.5,
    users: 2341,
    beginner: true
  },
  {
    id: 'grid_trading',
    name: t[language].gridTrading,
    description: language === 'zh' ? '在震荡市场中自动低买高卖' : 'Auto buy low sell high in ranging markets',
    winRate: '78%',
    avgProfit: '+5.2%',
    riskLevel: 'low',
    rating: 4.8,
    users: 3102,
    beginner: false
  }
];

