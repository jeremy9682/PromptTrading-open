import React from 'react';
import { Plus, Star, Copy } from 'lucide-react';

const StrategyTab = ({ t, language, strategies }) => (
  <div className="space-y-6">
    {/* Popular Strategies */}
    <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-white font-semibold text-lg">{t[language].popularStrategies}</h3>
        <button className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 flex items-center gap-2">
          <Plus size={16} />
          {t[language].createStrategy}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {strategies.map(strategy => (
          <div key={strategy.id} className="border border-gray-700 rounded-lg p-4 hover:border-gray-600">
            <div className="flex items-start justify-between mb-3">
              <div>
                <h4 className="text-white font-medium flex items-center gap-2">
                  {strategy.name}
                  {strategy.beginner && (
                    <span className="text-xs bg-green-500/20 text-green-400 px-2 py-0.5 rounded">
                      {t[language].beginnerFriendly}
                    </span>
                  )}
                </h4>
                <p className="text-gray-400 text-sm mt-1">{strategy.description}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <span className="text-gray-500 text-xs">{t[language].winRate}</span>
                <div className="text-white font-medium">{strategy.winRate}</div>
              </div>
              <div>
                <span className="text-gray-500 text-xs">{language === 'zh' ? '平均收益' : 'Avg Profit'}</span>
                <div className="text-green-400 font-medium">{strategy.avgProfit}</div>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1">
                  <Star className="text-yellow-400" size={14} />
                  <span className="text-sm text-gray-400">{strategy.rating}</span>
                </div>
                <span className="text-gray-500 text-sm">·</span>
                <span className="text-sm text-gray-400">{strategy.users} users</span>
              </div>
              <button className="text-blue-400 text-sm hover:underline">
                {language === 'zh' ? '使用' : 'Use'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>

    {/* Custom Prompt Builder */}
    <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-6">
      <h3 className="text-white font-semibold text-lg mb-4">{t[language].customPrompt}</h3>
      
      <div className="bg-gray-900/50 rounded-lg p-4 border border-gray-700">
        <div className="mb-4">
          <label className="text-gray-400 text-sm mb-2 block">
            {language === 'zh' ? 'Prompt 模板' : 'Prompt Template'}
          </label>
          <textarea 
            className="w-full bg-gray-900 border border-gray-700 text-white rounded-lg px-4 py-3 h-32 font-mono text-sm"
            defaultValue={language === 'zh' 
              ? `你是一家顶级量化基金的期权研究主管。
分析以下数据：
- 当前价格: {current_price}
- 24小时成交量: {volume_24h}
- RSI指标: {rsi}
- 市场情绪: {sentiment}
- 链上数据: {on_chain_data}

请给出买入/卖出建议，包含：
1. 操作建议（买入/卖出/持有）
2. 置信度（0-100%）
3. 止损价位
4. 目标价位
5. 风险评估`
              : `You are a top quant fund options research director.
Analyze the following data:
- Current price: {current_price}
- 24h volume: {volume_24h}
- RSI: {rsi}
- Market sentiment: {sentiment}
- On-chain data: {on_chain_data}

Please provide trade recommendation including:
1. Action (buy/sell/hold)
2. Confidence (0-100%)
3. Stop loss price
4. Target price
5. Risk assessment`}
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <span className="text-xs text-gray-500">{language === 'zh' ? '可用变量:' : 'Available variables:'}</span>
          {['{current_price}', '{volume_24h}', '{rsi}', '{macd}', '{sentiment}', '{on_chain_data}'].map(variable => (
            <button 
              key={variable}
              className="px-2 py-1 bg-gray-800 text-blue-400 rounded text-xs hover:bg-gray-700"
            >
              <Copy size={10} className="inline mr-1" />
              {variable}
            </button>
          ))}
        </div>
      </div>
    </div>
  </div>
);

export default StrategyTab;

