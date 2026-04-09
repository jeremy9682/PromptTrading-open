/**
 * Polymarket Prompt 生成服务
 * 基于 Superforecaster 方法论生成 AI 分析 Prompt
 */

/**
 * 生成系统 Prompt
 * 结合 Superforecaster 方法论 + 顶级 Polymarket 交易员角色
 */
export function generateSystemPrompt(language = 'zh') {
  if (language === 'en') {
    return `You are a Superforecaster and top Polymarket trader with exceptional ability to predict event outcomes.

Your approach combines systematic forecasting methodology with elite trading instincts:

## Superforecaster Framework (5 Steps)

1. **Break Down the Question**
   - Decompose the event into smaller, analyzable components
   - Identify key factors that will determine the outcome
   - Clarify any ambiguities in how the market will resolve

2. **Gather Information**
   - Analyze the provided news articles and search results
   - Look for both quantitative data and qualitative insights
   - Identify credible vs unreliable sources

3. **Consider Base Rates**
   - What is the historical frequency of similar events?
   - How accurate have prediction markets been for similar questions?
   - What biases might affect current market pricing?

4. **Identify and Evaluate Factors**
   - List all factors that could influence the outcome
   - Assess each factor's impact (positive/negative) and weight (1-10)
   - Avoid over-reliance on any single piece of information

5. **Think Probabilistically**
   - Express your prediction as a probability (0-1), not a certainty
   - Embrace uncertainty - acknowledge what you don't know
   - Compare your fair value estimate to current market price

## Trading Perspective

As a top Polymarket trader, you:
- Identify mispriced markets where crowd sentiment diverges from fundamentals
- Consider liquidity, timing, and position sizing
- Manage risk by acknowledging uncertainty levels
- Make decisive recommendations when edge is clear

## Trading Actions (IMPORTANT)

You must choose ONE of the following actions based on your analysis:
- **buy_yes**: Buy YES shares (you believe the event WILL happen)
- **buy_no**: Buy NO shares (you believe the event will NOT happen)
- **sell_yes**: Sell existing YES position (take profit or cut loss on YES)
- **sell_no**: Sell existing NO position (take profit or cut loss on NO)
- **hold**: No action needed (uncertain or already optimal position)

**When to SELL**:
- When you hold a position and your probability estimate has changed unfavorably
- When stop-loss or take-profit targets are reached
- When risk has increased and you want to reduce exposure
- When better opportunities exist elsewhere

## Multi-Option Markets (IMPORTANT)

Some markets have multiple options (e.g., "Who will win the game?" with options like "Team A", "Team B", "Team C").
For multi-option markets:
- Each option has its own YES/NO prices
- Buying YES on "Team A" means you believe Team A will win
- Buying NO on "Team A" means you believe Team A will NOT win
- You must select WHICH OPTION to trade, not just YES/NO
- Include your selected option in the decision.selectedOutcome field

Return your analysis in the specified JSON format. Be objective, data-driven, and intellectually honest about uncertainty.`;
  }

  return `你是一位超级预测者（Superforecaster）和 Polymarket 顶级交易员，拥有卓越的事件结果预测能力。

你的方法结合了系统性预测方法论和精英交易直觉：

## Superforecaster 分析框架（5 步法）

1. **问题分解**
   - 将事件拆解为更小的可分析组成部分
   - 识别决定结果的关键因素
   - 澄清市场如何判定结果的任何模糊之处

2. **信息收集**
   - 分析提供的新闻文章和搜索结果
   - 寻找定量数据和定性洞察
   - 区分可信来源和不可靠来源

3. **基准率参考**
   - 类似事件的历史发生频率是多少？
   - 预测市场对类似问题的准确率如何？
   - 哪些偏见可能影响当前市场定价？

4. **因素识别与评估**
   - 列出所有可能影响结果的因素
   - 评估每个因素的影响（正面/负面）和权重（1-10）
   - 避免过度依赖任何单一信息

5. **概率思维**
   - 用概率（0-1）而非确定性表达预测
   - 拥抱不确定性 - 承认你不知道的事情
   - 将你的公允价值估计与当前市场价格比较

## 交易视角

作为 Polymarket 顶级交易员，你：
- 识别市场定价偏差（群体情绪与基本面背离的机会）
- 考虑流动性、时机和仓位配置
- 通过承认不确定性水平来管理风险
- 在优势明确时做出果断建议

## 交易操作类型（重要）

你必须根据分析选择以下操作之一：
- **buy_yes**: 买入 YES（你认为事件会发生）
- **buy_no**: 买入 NO（你认为事件不会发生）
- **sell_yes**: 卖出 YES 持仓（止盈或止损）
- **sell_no**: 卖出 NO 持仓（止盈或止损）
- **hold**: 不操作（不确定或当前仓位已最优）

**何时应该卖出 (SELL)**：
- 当你持有仓位，但概率估计发生不利变化时
- 当达到止损或止盈目标时
- 当风险增加，需要降低敞口时
- 当有更好的机会时

## 多选项市场（重要）

某些市场有多个选项（例如"谁会赢得比赛？"可能有"队伍A"、"队伍B"、"队伍C"等选项）。
对于多选项市场：
- 每个选项都有自己的 YES/NO 价格
- 买入"队伍A"的 YES 表示你认为队伍A会赢
- 买入"队伍A"的 NO 表示你认为队伍A不会赢
- 你必须选择要交易哪个选项，而不仅仅是 YES/NO
- 在 decision.selectedOutcome 字段中包含你选择的选项

请按指定的 JSON 格式返回分析结果。保持客观、数据驱动，对不确定性保持诚实。`;
}

/**
 * 生成用户 Prompt
 * 包含事件数据、市场数据、搜索结果和账户信息
 */
export function generatePolymarketPrompt({
  event,
  marketData,
  searchData,
  customPrompt,
  dataSources,
  accountInfo,  // 用户账户信息
  riskConfig,   // 风控配置 { minConfidence, maxPosition, stopLoss, takeProfit }
  language = 'zh'
}) {
  const isZh = language === 'zh';

  let prompt = '';

  // ========== 事件信息 ==========
  prompt += isZh ? `## 预测市场事件\n\n` : `## Prediction Market Event\n\n`;
  prompt += `**${isZh ? '问题' : 'Question'}**: ${event.title}\n\n`;

  if (event.description) {
    prompt += `**${isZh ? '描述' : 'Description'}**: ${event.description}\n\n`;
  }

  prompt += `**${isZh ? '分类' : 'Category'}**: ${event.category || 'N/A'}\n`;
  prompt += `**${isZh ? '截止日期' : 'End Date'}**: ${event.endDate || 'N/A'}\n`;

  // 市场选项
  if (event.outcomes && event.outcomes.length > 0) {
    // 检查是否是多选项市场（不是标准 Yes/No）
    const isMultiOption = event.isMultiOptionMarket ||
      (event.outcomes.length >= 2 &&
       !event.outcomes.some(o => o.name === 'Yes' || o.name === 'No' || o.name === 'YES' || o.name === 'NO'));

    if (isMultiOption) {
      prompt += `\n**⚠️ ${isZh ? '这是一个多选项市场' : 'This is a multi-option market'}**\n`;
      prompt += `\n**${isZh ? '所有选项' : 'All Options'}**:\n`;
      prompt += `| ${isZh ? '选项' : 'Option'} | YES ${isZh ? '价格' : 'Price'} | NO ${isZh ? '价格' : 'Price'} |\n`;
      prompt += `|--------|----------|----------|\n`;
      event.outcomes.forEach((outcome, index) => {
        const yesPrice = outcome.yesPrice ?? outcome.price ?? 0.5;
        const noPrice = outcome.noPrice ?? (1 - yesPrice);
        prompt += `| ${outcome.name} | ${(yesPrice * 100).toFixed(1)}% | ${(noPrice * 100).toFixed(1)}% |\n`;
      });
      prompt += `\n${isZh
        ? '> 💡 对于多选项市场，你需要选择一个具体的选项来交易，而不仅仅是 YES/NO。'
        : '> 💡 For multi-option markets, you need to select a specific option to trade, not just YES/NO.'}\n`;
    } else {
      prompt += `\n**${isZh ? '可能结果' : 'Possible Outcomes'}**:\n`;
      event.outcomes.forEach((outcome, index) => {
        prompt += `- ${outcome.name}: ${(outcome.price * 100).toFixed(1)}%\n`;
      });
    }
  }

  // ========== 市场数据 ==========
  if (dataSources?.market !== false) {
    prompt += isZh ? `\n## 当前市场数据\n\n` : `\n## Current Market Data\n\n`;
    prompt += `| ${isZh ? '指标' : 'Metric'} | ${isZh ? '数值' : 'Value'} |\n`;
    prompt += `|--------|-------|\n`;
    prompt += `| YES ${isZh ? '价格' : 'Price'} | ${(marketData.price * 100).toFixed(1)}% |\n`;
    prompt += `| NO ${isZh ? '价格' : 'Price'} | ${(marketData.noPrice * 100).toFixed(1)}% |\n`;
    prompt += `| ${isZh ? '总交易量' : 'Total Volume'} | $${formatNumber(marketData.volume)} |\n`;

    if (marketData.volume24h) {
      prompt += `| ${isZh ? '24h 交易量' : '24h Volume'} | $${formatNumber(marketData.volume24h)} |\n`;
    }
    if (marketData.liquidity) {
      prompt += `| ${isZh ? '流动性' : 'Liquidity'} | $${formatNumber(marketData.liquidity)} |\n`;
    }
    if (marketData.spread) {
      prompt += `| ${isZh ? '买卖价差' : 'Spread'} | ${(marketData.spread * 100).toFixed(2)}% |\n`;
    }
    if (marketData.oneDayPriceChange !== undefined) {
      const change = marketData.oneDayPriceChange;
      prompt += `| ${isZh ? '24h 变化' : '24h Change'} | ${change >= 0 ? '+' : ''}${(change * 100).toFixed(2)}% |\n`;
    }
  }

  // ========== 网络搜索结果 ==========
  if (dataSources?.news && searchData?.perplexity?.summary) {
    prompt += isZh ? `\n## AI 网络搜索分析\n\n` : `\n## AI Web Search Analysis\n\n`;
    prompt += searchData.perplexity.summary + '\n';

    if (searchData.perplexity.sources?.length > 0) {
      prompt += `\n**${isZh ? '信息来源' : 'Sources'}**:\n`;
      searchData.perplexity.sources.slice(0, 5).forEach((source, index) => {
        prompt += `${index + 1}. ${source}\n`;
      });
    }
  }

  if (dataSources?.news && searchData?.tavily?.results?.length > 0) {
    prompt += isZh ? `\n## 补充搜索结果\n\n` : `\n## Additional Search Results\n\n`;
    searchData.tavily.results.slice(0, 5).forEach((result, index) => {
      prompt += `${index + 1}. **${result.title}**\n`;
      if (result.content) {
        prompt += `   ${result.content.substring(0, 200)}...\n`;
      }
      prompt += '\n';
    });
  }

  // ========== Reddit 社区讨论 ==========
  if ((dataSources?.social || dataSources?.reddit) && searchData?.reddit) {
    const reddit = searchData.reddit;
    prompt += isZh ? `\n## Reddit 社区讨论\n\n` : `\n## Reddit Community Discussion\n\n`;
    
    // 情绪概览
    if (reddit.sentiment) {
      const sentimentMap = {
        bullish: isZh ? '看涨' : 'Bullish',
        bearish: isZh ? '看跌' : 'Bearish',
        neutral: isZh ? '中性' : 'Neutral'
      };
      prompt += `**${isZh ? '社区情绪' : 'Community Sentiment'}**: ${sentimentMap[reddit.sentiment.overall] || reddit.sentiment.overall}`;
      prompt += ` (${isZh ? '置信度' : 'Confidence'}: ${Math.round(reddit.sentiment.confidence * 100)}%)\n`;
      
      if (reddit.sentiment.breakdown) {
        const { positive, negative, neutral } = reddit.sentiment.breakdown;
        prompt += `- ${isZh ? '正面' : 'Positive'}: ${positive} | ${isZh ? '负面' : 'Negative'}: ${negative} | ${isZh ? '中性' : 'Neutral'}: ${neutral}\n`;
      }
    }
    
    // 统计数据
    prompt += `\n**${isZh ? '讨论热度' : 'Discussion Activity'}**:\n`;
    prompt += `- ${isZh ? '相关帖子' : 'Related Posts'}: ${reddit.totalPosts || 0}\n`;
    prompt += `- ${isZh ? '平均热度' : 'Average Score'}: ${reddit.avgScore || 0}\n`;
    prompt += `- ${isZh ? '总评论数' : 'Total Comments'}: ${reddit.totalComments || 0}\n`;
    prompt += `- ${isZh ? '活跃度' : 'Activity Level'}: ${reddit.activityLevel || 'N/A'}\n`;
    
    // 热门讨论
    if (reddit.topDiscussions?.length > 0) {
      prompt += `\n**${isZh ? '热门讨论' : 'Top Discussions'}**:\n`;
      reddit.topDiscussions.slice(0, 5).forEach((post, index) => {
        const sentimentEmoji = post.sentiment === 'positive' ? '🟢' : post.sentiment === 'negative' ? '🔴' : '🟡';
        prompt += `${index + 1}. ${sentimentEmoji} [r/${post.subreddit}] "${post.title}"\n`;
        prompt += `   👍 ${post.score} | 💬 ${post.comments} | ${post.timeAgo}\n`;
      });
    }
    
    // 热门关键词
    if (reddit.trendingKeywords?.length > 0) {
      prompt += `\n**${isZh ? '热门关键词' : 'Trending Keywords'}**: ${reddit.trendingKeywords.slice(0, 8).join(', ')}\n`;
    }
  }

  // ========== Google News 新闻 ==========
  if ((dataSources?.news || dataSources?.googleNews) && searchData?.googleNews?.articles?.length > 0) {
    const news = searchData.googleNews;
    prompt += isZh ? `\n## 最新新闻报道\n\n` : `\n## Latest News Coverage\n\n`;
    
    prompt += `**${isZh ? '新闻数量' : 'Articles Found'}**: ${news.articlesCount}\n`;
    
    // 新闻来源统计
    if (news.sources?.length > 0) {
      const sourceList = news.sources.slice(0, 5).map(s => `${s.name}(${s.count})`).join(', ');
      prompt += `**${isZh ? '主要来源' : 'Main Sources'}**: ${sourceList}\n\n`;
    }
    
    // 新闻列表
    prompt += `**${isZh ? '近期新闻' : 'Recent Articles'}**:\n`;
    news.articles.slice(0, 5).forEach((article, index) => {
      prompt += `${index + 1}. **${article.title}**\n`;
      prompt += `   📰 ${article.source} | ${article.pubDateFormatted || article.pubDate}\n`;
      if (article.description) {
        prompt += `   ${article.description.substring(0, 150)}${article.description.length > 150 ? '...' : ''}\n`;
      }
    });
  }

  // ========== Wikipedia 背景信息 ==========
  if (searchData?.wikipedia?.articles?.length > 0) {
    const wiki = searchData.wikipedia;
    prompt += isZh ? `\n## 背景知识 (Wikipedia)\n\n` : `\n## Background Knowledge (Wikipedia)\n\n`;

    wiki.articles.forEach((article, index) => {
      prompt += `### ${index + 1}. ${article.title}\n`;
      if (article.description) {
        prompt += `*${article.description}*\n\n`;
      }
      prompt += `${article.extract}\n\n`;
      prompt += `🔗 ${article.url}\n\n`;
    });

    prompt += isZh
      ? `> 💡 以上背景信息来自 Wikipedia，可帮助理解事件相关的人物、组织或历史背景。\n`
      : `> 💡 The above background information from Wikipedia helps understand relevant people, organizations, or historical context.\n`;
  }

  // ========== 价格走势分析 (Dome API K线数据) ==========
  if (searchData?.priceAnalysis) {
    const p = searchData.priceAnalysis;
    const trendEmoji = p.trend === 'bullish' ? '📈' : p.trend === 'bearish' ? '📉' : '➡️';

    prompt += isZh ? `\n## 价格走势分析 (过去 ${p.timeRangeHours} 小时)\n\n` : `\n## Price Trend Analysis (Past ${p.timeRangeHours} hours)\n\n`;

    const trendMap = {
      bullish: isZh ? '上涨' : 'Bullish',
      bearish: isZh ? '下跌' : 'Bearish',
      stable: isZh ? '稳定' : 'Stable'
    };

    const strengthMap = {
      strong: isZh ? '强' : 'Strong',
      moderate: isZh ? '中等' : 'Moderate',
      weak: isZh ? '弱' : 'Weak'
    };

    prompt += `${trendEmoji} **${isZh ? '趋势' : 'Trend'}**: ${trendMap[p.trend]} (${strengthMap[p.trendStrength]})\n\n`;

    prompt += isZh ? `**价格数据**:\n` : `**Price Data**:\n`;
    prompt += `- ${isZh ? '当前价格' : 'Current Price'}: $${p.currentPrice.toFixed(4)} (${(p.currentPrice * 100).toFixed(1)}%)\n`;
    prompt += `- ${isZh ? '起始价格' : 'Start Price'}: $${p.startPrice.toFixed(4)}\n`;
    prompt += `- ${isZh ? '价格变化' : 'Price Change'}: ${p.priceChange >= 0 ? '+' : ''}${p.priceChange.toFixed(4)} (${p.priceChangePercent >= 0 ? '+' : ''}${p.priceChangePercent.toFixed(2)}%)\n`;
    prompt += `- ${isZh ? '最高/最低' : 'High/Low'}: $${p.high.toFixed(4)} / $${p.low.toFixed(4)}\n\n`;

    prompt += isZh ? `**市场指标**:\n` : `**Market Indicators**:\n`;
    prompt += `- ${isZh ? '波动率' : 'Volatility'}: ${p.volatilityPercent.toFixed(2)}%\n`;
    prompt += `- ${isZh ? '动量' : 'Momentum'}: ${p.momentum > 0 ? '+' + p.momentum : p.momentum} (${p.momentum > 0 ? (isZh ? '上涨动量' : 'Upward') : p.momentum < 0 ? (isZh ? '下跌动量' : 'Downward') : (isZh ? '中性' : 'Neutral')})\n`;
    prompt += `- ${isZh ? '数据点数' : 'Data Points'}: ${p.dataPoints}\n\n`;

    prompt += isZh
      ? `> 💡 以上价格走势数据来自 Dome API，可帮助分析市场情绪和趋势动量。\n`
      : `> 💡 The above price trend data from Dome API helps analyze market sentiment and trend momentum.\n`;
  }

  // ========== 用户账户信息 ==========
  if (accountInfo) {
    prompt += isZh ? `\n## 用户账户状况\n\n` : `\n## User Account Status\n\n`;
    prompt += isZh
      ? `**⚠️ 重要：交易建议必须考虑以下账户实际状况**\n\n`
      : `**⚠️ Important: Trading recommendations must consider the following account status**\n\n`;

    prompt += `**${isZh ? '可用余额' : 'Available Balance'}**: $${(accountInfo.availableBalance || 0).toFixed(2)}\n`;
    prompt += `**${isZh ? '持仓总值' : 'Total Positions Value'}**: $${(accountInfo.totalPositionsValue || 0).toFixed(2)}\n`;
    prompt += `**${isZh ? '总盈亏' : 'Total P&L'}**: ${(accountInfo.totalPnL || 0) >= 0 ? '+' : ''}$${(accountInfo.totalPnL || 0).toFixed(2)}\n`;

    // 检查是否持有当前分析事件的仓位
    const currentEventTitle = event?.title || marketData?.eventTitle || '';
    const currentEventId = event?.id || event?.conditionId || '';
    const currentEventTicker = event?.ticker || marketData?.eventTicker || '';
    
    // 查找当前事件的持仓
    const currentEventPosition = accountInfo.positions?.find(pos => {
      // 检查事件ID匹配
      if (pos.eventId && currentEventId && pos.eventId === currentEventId) return true;
      // 检查事件标题匹配（模糊匹配）
      if (pos.eventTitle && currentEventTitle) {
        const posTitle = pos.eventTitle.toLowerCase();
        const eventTitle = currentEventTitle.toLowerCase();
        // 如果标题相同或包含关系
        if (posTitle === eventTitle || posTitle.includes(eventTitle) || eventTitle.includes(posTitle)) return true;
      }
      // 检查 ticker 匹配 (for Kalshi)
      if (pos.marketSlug && currentEventTicker && pos.marketSlug.includes(currentEventTicker)) return true;
      return false;
    });
    
    // 如果用户持有当前事件的仓位，重点提示
    if (currentEventPosition) {
      const pnlSign = (currentEventPosition.pnl || 0) >= 0 ? '+' : '';
      prompt += isZh
        ? `\n### ⚠️ 重要：你持有当前分析事件的仓位！\n\n`
        : `\n### ⚠️ IMPORTANT: You hold a position in this event!\n\n`;
      prompt += `**${isZh ? '当前事件持仓' : 'Position in This Event'}**:\n`;
      prompt += `- ${isZh ? '方向' : 'Side'}: **${currentEventPosition.outcome || 'N/A'}**\n`;
      prompt += `- ${isZh ? '数量' : 'Size'}: **${(currentEventPosition.size || 0).toFixed(2)} ${isZh ? '股' : 'shares'}**\n`;
      prompt += `- ${isZh ? '均价' : 'Avg Price'}: $${(currentEventPosition.avgPrice || 0).toFixed(4)}\n`;
      prompt += `- ${isZh ? '当前价' : 'Current Price'}: $${(currentEventPosition.currentPrice || 0).toFixed(4)}\n`;
      prompt += `- ${isZh ? '盈亏' : 'P&L'}: ${pnlSign}$${(currentEventPosition.pnl || 0).toFixed(2)}\n\n`;
      prompt += isZh
        ? `> 🔔 **你必须考虑是否应该卖出此仓位！** 如果触发止损或止盈条件，必须返回 \`sell_${currentEventPosition.outcome?.toLowerCase()}\`。\n`
        : `> 🔔 **You MUST consider whether to sell this position!** If stop-loss or take-profit is triggered, you must return \`sell_${currentEventPosition.outcome?.toLowerCase()}\`.\n`;
    }
    
    // 显示当前持仓
    if (accountInfo.positions && accountInfo.positions.length > 0) {
      prompt += `\n**${isZh ? '全部持仓' : 'All Positions'}** (${accountInfo.positions.length}):\n`;
      accountInfo.positions.forEach((pos, index) => {
        const pnlSign = (pos.pnl || 0) >= 0 ? '+' : '';
        const isCurrentEvent = pos === currentEventPosition;
        const marker = isCurrentEvent ? (isZh ? ' ⬅ 当前事件' : ' ⬅ This Event') : '';
        prompt += `${index + 1}. ${pos.eventTitle || 'Unknown'}${marker}\n`;
        prompt += `   - ${isZh ? '方向' : 'Side'}: ${pos.outcome || 'N/A'}\n`;
        prompt += `   - ${isZh ? '数量' : 'Size'}: ${(pos.size || 0).toFixed(2)} ${isZh ? '股' : 'shares'}\n`;
        prompt += `   - ${isZh ? '均价' : 'Avg Price'}: $${(pos.avgPrice || 0).toFixed(4)}\n`;
        prompt += `   - ${isZh ? '当前价' : 'Current Price'}: $${(pos.currentPrice || 0).toFixed(4)}\n`;
        prompt += `   - ${isZh ? '市值' : 'Value'}: $${(pos.value || 0).toFixed(2)}\n`;
        prompt += `   - ${isZh ? '盈亏' : 'P&L'}: ${pnlSign}$${(pos.pnl || 0).toFixed(2)}\n`;
      });
    } else {
      prompt += `\n**${isZh ? '当前持仓' : 'Current Positions'}**: ${isZh ? '无' : 'None'}\n`;
    }

    prompt += isZh
      ? `\n> 💡 **约束条件**：建议的交易金额不得超过可用余额 $${(accountInfo.availableBalance || 0).toFixed(2)}。如果已持有该市场的仓位，请考虑是否应该加仓、减仓或持有。\n`
      : `\n> 💡 **Constraint**: Suggested trade amount must not exceed available balance $${(accountInfo.availableBalance || 0).toFixed(2)}. If already holding a position in this market, consider whether to add, reduce, or hold.\n`;
  }

  // ========== 风控规则（如果提供） ==========
  if (riskConfig) {
    const minConf = riskConfig.minConfidence || 60;
    const maxPos = riskConfig.maxPosition || 10;
    const stopLoss = riskConfig.stopLoss || 20;
    const takeProfit = riskConfig.takeProfit || 80;

    prompt += isZh ? `\n## ⚠️ 风控规则（必须严格遵守）\n\n` : `\n## ⚠️ Risk Management Rules (Must Follow Strictly)\n\n`;

    prompt += isZh
      ? `以下规则是**强制性的**，任何交易建议都必须符合这些约束：\n\n`
      : `The following rules are **mandatory**, all trading recommendations must comply:\n\n`;

    prompt += isZh
      ? `1. **最低置信度 (${minConf}%)**：
   - 如果分析置信度 < ${minConf}%，**必须**返回 \`hold\`
   - 禁止在低置信度时建议买入或卖出

2. **最大仓位比例 (${maxPos}%)**：
   - \`suggestedPosition\` 字段**不得超过** ${maxPos}
   - 这是用户愿意承担的最大风险敞口

3. **止损价格 (${stopLoss}%)**：
   - 如果用户持有 YES 仓位，且当前 YES 价格 <= ${stopLoss}%，**必须**返回 \`sell_yes\`
   - 如果用户持有 NO 仓位，且当前 NO 价格 <= ${stopLoss}%，**必须**返回 \`sell_no\`
   - 止损是保护资金的最后防线，必须执行

4. **止盈价格 (${takeProfit}%)**：
   - 如果用户持有 YES 仓位，且当前 YES 价格 >= ${takeProfit}%，**建议**返回 \`sell_yes\` 锁定利润
   - 如果用户持有 NO 仓位，且当前 NO 价格 >= ${takeProfit}%，**建议**返回 \`sell_no\` 锁定利润

> ❗ **重要**：违反最低置信度或止损规则的建议将被视为无效。请在 reasoning 中说明你如何遵守了这些风控规则。
`
      : `1. **Minimum Confidence (${minConf}%)**:
   - If analysis confidence < ${minConf}%, **must** return \`hold\`
   - No buy/sell recommendations at low confidence

2. **Maximum Position Size (${maxPos}%)**:
   - \`suggestedPosition\` field **must not exceed** ${maxPos}
   - This is the maximum risk exposure the user is willing to take

3. **Stop Loss Price (${stopLoss}%)**:
   - If user holds YES position and current YES price <= ${stopLoss}%, **must** return \`sell_yes\`
   - If user holds NO position and current NO price <= ${stopLoss}%, **must** return \`sell_no\`
   - Stop loss is the last line of defense, must execute

4. **Take Profit Price (${takeProfit}%)**:
   - If user holds YES position and current YES price >= ${takeProfit}%, **recommend** \`sell_yes\` to lock profit
   - If user holds NO position and current NO price >= ${takeProfit}%, **recommend** \`sell_no\` to lock profit

> ❗ **Important**: Recommendations violating minimum confidence or stop loss rules will be considered invalid. Explain in reasoning how you followed these risk rules.
`;
  }

  // ========== 用户自定义策略 ==========
  if (customPrompt) {
    prompt += isZh ? `\n## 用户分析策略指令\n\n` : `\n## User Analysis Strategy\n\n`;
    prompt += `${customPrompt}\n`;
  }

  // ========== 交易决策指南（重要！） ==========
  prompt += isZh
    ? `\n## ⚠️ 交易决策指南（必读）

根据用户持仓状态和你的分析，选择正确的操作：

| 场景 | 推荐操作 |
|------|----------|
| 无持仓 + 看好 YES | **buy_yes** |
| 无持仓 + 看好 NO | **buy_no** |
| 持有 YES + 概率下降/风险增加 | **sell_yes** |
| 持有 NO + 概率上升/风险增加 | **sell_no** |
| 持有仓位 + 继续看好 | **hold** |
| 不确定/风险太高 | **hold** |

**注意**：如果用户已有持仓（见上方"用户账户状况"），你必须考虑是否需要卖出！不要只考虑买入。

`
    : `\n## ⚠️ Trading Decision Guide (Must Read)

Choose the correct action based on user's position status and your analysis:

| Scenario | Recommended Action |
|----------|-------------------|
| No position + Bullish on YES | **buy_yes** |
| No position + Bullish on NO | **buy_no** |
| Holding YES + Probability decreased/Risk increased | **sell_yes** |
| Holding NO + Probability increased/Risk increased | **sell_no** |
| Holding position + Still bullish | **hold** |
| Uncertain/Risk too high | **hold** |

**Note**: If user has existing positions (see "User Account Status" above), you MUST consider whether to sell! Don't only consider buying.

`;

  // ========== 输出格式要求 ==========
  prompt += isZh
    ? `\n## 请按以下 JSON 格式返回分析结果\n\n`
    : `\n## Return your analysis in the following JSON format\n\n`;

  prompt += '```json\n';
  prompt += `{
  "summary": "${isZh ? '一句话总结你的分析结论和交易建议' : 'One sentence summary of your analysis and trading recommendation'}",

  "reasoning": {
    "questionBreakdown": [
      "${isZh ? '分解后的关键问题1' : 'Key question component 1'}",
      "${isZh ? '分解后的关键问题2' : 'Key question component 2'}"
    ],
    "baseRateAnalysis": "${isZh ? '历史基准率分析：类似事件的历史发生频率和预测市场准确率' : 'Base rate analysis: historical frequency of similar events and prediction market accuracy'}",
    "factors": [
      {
        "name": "${isZh ? '因素名称' : 'Factor name'}",
        "impact": "positive | negative | neutral",
        "weight": 8,
        "explanation": "${isZh ? '该因素如何影响结果的详细解释' : 'Detailed explanation of how this factor affects the outcome'}"
      }
    ],
    "detailedAnalysis": "${isZh ? '完整的推理过程，包括你如何权衡各种因素得出结论' : 'Complete reasoning process, including how you weighed various factors to reach your conclusion'}"
  },

  "probability": {
    "yes": ${isZh ? '你预测的 YES 概率 (0-1 之间的小数)' : 'Your predicted YES probability (decimal between 0-1)'},
    "confidence": ${isZh ? '你对这个预测的置信度 (0-100)' : 'Your confidence in this prediction (0-100)'}
  },

  "marketAssessment": {
    "currentPrice": ${marketData.price.toFixed(2)},
    "fairValue": ${isZh ? '你评估的公允价值 (0-1)' : 'Your assessed fair value (0-1)'},
    "mispricing": ${isZh ? '定价偏差百分比（正数=低估，负数=高估）' : 'Mispricing percentage (positive=underpriced, negative=overpriced)'},
    "direction": "underpriced | overpriced | fair"
  },

  "decision": {
    "action": "${isZh
      ? 'buy_yes(买入YES) | buy_no(买入NO) | sell_yes(卖出YES持仓) | sell_no(卖出NO持仓) | hold(持有不动)'
      : 'buy_yes(buy YES) | buy_no(buy NO) | sell_yes(sell YES position) | sell_no(sell NO position) | hold(no action)'}",
    "confidence": ${isZh ? '交易决策的置信度 (0-100)' : 'Trading decision confidence (0-100)'},
    "reasoning": "${isZh ? '为什么做出这个交易决策的简短解释' : 'Brief explanation of why you made this trading decision'}",
    "riskLevel": "low | medium | high",
    "suggestedPosition": ${isZh ? '建议的仓位比例 (0-100)，基于风险和置信度' : 'Suggested position size (0-100), based on risk and confidence'},
    "selectedOutcome": "${isZh ? '(多选项市场必填) 选择的选项名称，如 Team A' : '(Required for multi-option markets) Selected option name, e.g., Team A'}",
    "outcomeSide": "${isZh ? '(多选项市场必填) yes 或 no - 买入该选项的YES还是NO' : '(Required for multi-option markets) yes or no - buy YES or NO on this option'}"
  },

  "risks": [
    "${isZh ? '主要风险因素1' : 'Key risk factor 1'}",
    "${isZh ? '主要风险因素2' : 'Key risk factor 2'}"
  ],

  "keyInsights": [
    "${isZh ? '关键洞察1' : 'Key insight 1'}",
    "${isZh ? '关键洞察2' : 'Key insight 2'}"
  ],

  "multiOptionAnalysis": {
    "_comment": "${isZh ? '(仅多选项市场需要) 对每个选项的分析' : '(Only for multi-option markets) Analysis for each option'}",
    "outcomes": [
      {
        "name": "${isZh ? '选项名称' : 'Option name'}",
        "predictedProbability": ${isZh ? '你预测该选项获胜的概率 (0-1)' : 'Your predicted probability this option wins (0-1)'},
        "currentPrice": ${isZh ? '当前市场 YES 价格' : 'Current market YES price'},
        "recommendation": "buy_yes | buy_no | hold",
        "reasoning": "${isZh ? '对该选项的简短分析' : 'Brief analysis for this option'}"
      }
    ],
    "bestPick": "${isZh ? 'AI 推荐的最佳选项名称' : 'AI recommended best option name'}"
  }
}
\`\`\`

${isZh ? `
**格式要求**：
1. 返回有效的 JSON 格式，不要有语法错误
2. 所有数值字段使用数字，不是字符串
3. probability.yes 必须在 0-1 之间
4. confidence 值必须在 0-100 之间
5. 基于提供的数据进行客观分析，不要凭空猜测
6. 如果数据不足，在 reasoning 中说明，并相应降低 confidence
7. **suggestedPosition 必须考虑用户可用余额**，不要建议超出可用资金的交易
8. **action 字段只能是以下值之一**：buy_yes, buy_no, sell_yes, sell_no, hold
9. **多选项市场**：必须填写 decision.selectedOutcome 和 decision.outcomeSide，并提供 multiOptionAnalysis
` : `
**Format Requirements**:
1. Return valid JSON format without syntax errors
2. All numeric fields should be numbers, not strings
3. probability.yes must be between 0-1
4. confidence values must be between 0-100
5. Base your analysis on provided data, don't speculate without evidence
6. If data is insufficient, explain in reasoning and lower confidence accordingly
7. **suggestedPosition must consider user's available balance**, do not suggest trades exceeding available funds
8. **action field must be one of**: buy_yes, buy_no, sell_yes, sell_no, hold
9. **Multi-option markets**: Must fill decision.selectedOutcome and decision.outcomeSide, and provide multiOptionAnalysis
`}`;

  return prompt;
}

/**
 * 格式化数字显示
 */
function formatNumber(num) {
  if (!num) return '0';
  if (num >= 1000000) {
    return (num / 1000000).toFixed(2) + 'M';
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(2) + 'K';
  }
  return num.toFixed(2);
}
