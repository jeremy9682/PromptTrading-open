import React from 'react';
import { Trophy, TrendingUp, Award, Users, Activity, Star, Info } from 'lucide-react';

// 演示数据 - Demo data for MVP
const demoLeaderboard = [
  { rank: 1, address: '0xABC...123', profit: '+125.5%', trades: 342, winRate: 68.5, badge: '🏆' },
  { rank: 2, address: '0xDEF...456', profit: '+98.2%', trades: 256, winRate: 65.2, badge: '🥈' },
  { rank: 3, address: '0x789...GHI', profit: '+87.3%', trades: 198, winRate: 63.8, badge: '🥉' },
  { rank: 4, address: '0xJKL...012', profit: '+72.1%', trades: 287, winRate: 61.5, badge: '⭐' },
  { rank: 5, address: '0x345...MNO', profit: '+65.8%', trades: 223, winRate: 60.2, badge: '⭐' },
  { rank: 6, address: '0xPQR...678', profit: '+58.4%', trades: 195, winRate: 59.1, badge: '⭐' },
  { rank: 7, address: '0x901...STU', profit: '+52.9%', trades: 167, winRate: 58.3, badge: '⭐' },
  { rank: 8, address: '0xVWX...234', profit: '+48.7%', trades: 201, winRate: 57.6, badge: '⭐' },
  { rank: 9, address: '0x567...YZA', profit: '+45.2%', trades: 178, winRate: 56.8, badge: '⭐' },
  { rank: 10, address: '0xBCD...890', profit: '+42.6%', trades: 156, winRate: 55.9, badge: '⭐' },
];

const demoAIModels = [
  { name: 'Claude 3.5 Sonnet', totalPnl: '+$12,456', winRate: 68.5, trades: 856, avgProfit: '+$14.55' },
  { name: 'GPT-4o', totalPnl: '+$10,234', winRate: 65.2, trades: 742, avgProfit: '+$13.79' },
  { name: 'Gemini 1.5 Pro', totalPnl: '+$8,967', winRate: 63.1, trades: 689, avgProfit: '+$13.01' },
  { name: 'GPT-4', totalPnl: '+$7,543', winRate: 61.8, trades: 634, avgProfit: '+$11.90' },
];

const cardClass = 'bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-700 rounded-2xl shadow-sm';
const mutedText = 'text-gray-600 dark:text-gray-400';

const CommunityTab = ({ t, language }) => {
  return (
    <div className="space-y-6 text-gray-900 dark:text-white">
      {/* MVP Notice */}
      <div className="bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/30 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <Info className="text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" size={20} />
          <div>
            <h4 className="text-blue-700 dark:text-blue-400 font-medium mb-1">
              {language === 'zh' ? '演示数据展示' : 'Demo Data Display'}
            </h4>
            <p className="text-blue-600 dark:text-blue-300 text-sm">
              {language === 'zh' 
                ? '当前显示的是演示数据，用于展示功能界面。真实的用户排行榜和AI模型对比功能将在V2.0版本中上线。' 
                : 'Currently showing demo data to showcase the interface. Real user leaderboard and AI model comparison will be available in V2.0.'}
            </p>
          </div>
        </div>
      </div>

      {/* Leaderboard */}
      <div className={`${cardClass} p-6`}>
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-gray-900 dark:text-white font-semibold text-lg flex items-center gap-2">
            <Trophy className="text-yellow-500 dark:text-yellow-400" size={24} />
            {t[language].leaderboard}
          </h3>
          <div className="flex gap-2">
            <button className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition-colors">
              {language === 'zh' ? '24小时' : '24H'}
            </button>
            <button className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200 transition-colors dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600">
              {language === 'zh' ? '7天' : '7D'}
            </button>
            <button className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200 transition-colors dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600">
              {language === 'zh' ? '30天' : '30D'}
            </button>
          </div>
        </div>

        <div className="space-y-3">
          {demoLeaderboard.map((user) => (
            <div
              key={user.rank}
              className={`bg-gray-50 dark:bg-gray-900/50 rounded-2xl p-4 border transition-all hover:border-blue-500/50 ${
                user.rank <= 3 ? 'border-yellow-300 dark:border-yellow-500/30' : 'border-gray-200 dark:border-gray-700'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  {/* Rank */}
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">{user.badge}</span>
                    <span className={`text-lg font-bold ${
                      user.rank <= 3 ? 'text-yellow-400' : 'text-gray-400'
                    }`}>
                      #{user.rank}
                    </span>
                  </div>
                  
                  {/* User Address */}
                  <div>
                    <div className="text-gray-900 dark:text-white font-medium font-mono">{user.address}</div>
                    <div className="flex items-center gap-3 text-sm text-gray-600 dark:text-gray-400 mt-1">
                      <span className="flex items-center gap-1">
                        <Activity size={14} />
                        {user.trades} {language === 'zh' ? '笔交易' : 'trades'}
                      </span>
                      <span className="flex items-center gap-1">
                        <Award size={14} />
                        {user.winRate}% {language === 'zh' ? '胜率' : 'win rate'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Profit */}
                <div className="text-right">
                  <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                    {user.profit}
                  </div>
                  <div className={`${mutedText} text-sm`}>
                    {language === 'zh' ? '总收益' : 'Total Profit'}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 text-center">
          <button className="px-6 py-2 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-lg hover:opacity-90 transition-opacity">
            {language === 'zh' ? '查看完整排行榜' : 'View Full Leaderboard'}
          </button>
        </div>
      </div>

      {/* AI Model Comparison */}
      <div className={`${cardClass} p-6`}>
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-gray-900 dark:text-white font-semibold text-lg flex items-center gap-2">
            <Star className="text-purple-600 dark:text-purple-400" size={24} />
            {language === 'zh' ? 'AI模型对比排行' : 'AI Model Comparison'}
          </h3>
        </div>

        <div className="space-y-4">
          {demoAIModels.map((model, index) => (
            <div
              key={model.name}
              className="bg-gray-50 dark:bg-gray-900/50 rounded-2xl p-4 border border-gray-200 dark:border-gray-700 hover:border-purple-300 dark:hover:border-purple-500/50 transition-all"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  {/* Rank Badge */}
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold ${
                    index === 0 ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-500/20 dark:text-yellow-400' :
                    index === 1 ? 'bg-gray-200 text-gray-700 dark:bg-gray-500/20 dark:text-gray-400' :
                    index === 2 ? 'bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-400' :
                    'bg-gray-100 text-gray-600 dark:bg-gray-700/20 dark:text-gray-500'
                  }`}>
                    {index + 1}
                  </div>
                  
                  {/* Model Name */}
                  <div>
                    <h4 className="text-gray-900 dark:text-white font-medium">{model.name}</h4>
                    <p className={`${mutedText} text-sm`}>{model.trades} {language === 'zh' ? '个决策' : 'decisions'}</p>
                  </div>
                </div>
                
                {/* Total PnL */}
                <div className="text-right">
                  <div className="text-xl font-bold text-green-600 dark:text-green-400">
                    {model.totalPnl}
                  </div>
                  <p className={`${mutedText} text-sm`}>{language === 'zh' ? '总收益' : 'Total PnL'}</p>
                </div>
              </div>
              
              {/* Metrics Grid */}
              <div className="grid grid-cols-3 gap-3 pt-3 border-t border-gray-200 dark:border-gray-700">
                <div>
                  <span className={`${mutedText} text-xs`}>{language === 'zh' ? '胜率' : 'Win Rate'}</span>
                  <div className="text-gray-900 dark:text-white font-medium">{model.winRate}%</div>
                </div>
                <div>
                  <span className={`${mutedText} text-xs`}>{language === 'zh' ? '平均收益' : 'Avg Profit'}</span>
                  <div className="text-gray-900 dark:text-white font-medium">{model.avgProfit}</div>
                </div>
                <div>
                  <span className={`${mutedText} text-xs`}>{language === 'zh' ? '决策数' : 'Decisions'}</span>
                  <div className="text-gray-900 dark:text-white font-medium">{model.trades}</div>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 text-center">
          <button className="px-6 py-2 bg-gradient-to-r from-purple-500 to-pink-600 text-white rounded-lg hover:opacity-90 transition-opacity">
            {language === 'zh' ? '查看详细对比' : 'View Detailed Comparison'}
          </button>
        </div>
      </div>

      {/* Community Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className={`${cardClass} p-6`}>
          <div className="flex items-center gap-3 mb-2">
            <Users className="text-blue-600 dark:text-blue-400" size={24} />
            <span className={`${mutedText} text-sm`}>{language === 'zh' ? '活跃交易者' : 'Active Traders'}</span>
          </div>
          <div className="text-3xl font-bold text-gray-900 dark:text-white">2,847</div>
        </div>
        
        <div className={`${cardClass} p-6`}>
          <div className="flex items-center gap-3 mb-2">
            <TrendingUp className="text-green-600 dark:text-green-400" size={24} />
            <span className={`${mutedText} text-sm`}>{language === 'zh' ? '今日交易量' : 'Today\'s Volume'}</span>
          </div>
          <div className="text-3xl font-bold text-gray-900 dark:text-white">$8.4M</div>
        </div>
        
        <div className={`${cardClass} p-6`}>
          <div className="flex items-center gap-3 mb-2">
            <Activity className="text-purple-600 dark:text-purple-400" size={24} />
            <span className={`${mutedText} text-sm`}>{language === 'zh' ? 'AI决策数' : 'AI Decisions'}</span>
          </div>
          <div className="text-3xl font-bold text-gray-900 dark:text-white">12,453</div>
        </div>
      </div>
    </div>
  );
};

export default CommunityTab;

