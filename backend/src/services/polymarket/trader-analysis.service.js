/**
 * Trader Analysis Service
 *
 * 为自动交易 Trader 提供 AI 分析服务
 * 整合现有的 AI 分析逻辑，专门用于自动交易场景
 *
 * 支持免费数据源: Reddit, Google News
 *
 * 支持市场来源:
 * - POLYMARKET: Polygon 链上的预测市场
 * - KALSHI: 通过 DFlow 在 Solana 上的预测市场
 */

import { callSingleModel } from '../ai/openrouter.service.js';
import { generateSystemPrompt } from './prompt-generator.service.js';
import { parsePolymarketResponse } from './response-parser.service.js';
import { fetchAllFreeData } from './free-data.service.js';

/**
 * 根据 Trader 配置分析市场
 *
 * @param {object} params - 分析参数
 * @param {object} params.trader - Trader 配置
 * @param {object} params.marketData - 市场数据
 * @param {string} [params.userApiKey] - 用户的 OpenRouter API Key（可选）
 * @param {object} [params.accountInfo] - 用户账户信息（可选）
 * @param {string} [params.source='POLYMARKET'] - 市场来源 ('POLYMARKET' | 'KALSHI')
 * @returns {Promise<{action: string, confidence: number, reasoning: string}>}
 */
export async function analyzeMarketForTrader(params) {
  const { trader, marketData, userApiKey, accountInfo, source = 'POLYMARKET' } = params;

  console.log(`[TraderAnalysis] Analyzing market for trader ${trader.id}:`, {
    event: marketData.eventTitle,
    source: source,
    aiModel: trader.aiModel,
    weights: {
      news: trader.newsWeight,
      data: trader.dataWeight,
      sentiment: trader.sentimentWeight,
    },
  });

  try {
    // 获取外部数据（如果启用了新闻/情绪权重）
    let externalData = null;
    const dataSources = trader.dataSources || {};
    const useReddit = dataSources.reddit !== false; // 默认启用
    const useGoogleNews = dataSources.googleNews !== false; // 默认启用
    
    if ((trader.newsWeight > 0 || trader.sentimentWeight > 0) && (useReddit || useGoogleNews)) {
      console.log(`[TraderAnalysis] Fetching external data (Reddit: ${useReddit}, GoogleNews: ${useGoogleNews})`);
      try {
        externalData = await fetchAllFreeData(
          marketData.eventTitle,
          marketData.description || '',
          { useReddit, useGoogleNews, language: 'en' }
        );
        console.log(`[TraderAnalysis] External data fetched:`, {
          reddit: !!externalData?.reddit,
          redditPosts: externalData?.reddit?.totalPosts || 0,
          googleNews: !!externalData?.googleNews,
          newsArticles: externalData?.googleNews?.articlesCount || 0
        });
      } catch (err) {
        console.warn(`[TraderAnalysis] Failed to fetch external data:`, err.message);
      }
    }

    // 检查是否有 API Key
    if (!userApiKey) {
      console.warn('[TraderAnalysis] No userApiKey provided, using fallback analysis');
      throw new Error('MISSING_OPENROUTER_API_KEY');
    }

    // 构建分析 Prompt（包含账户信息和市场来源）
    const prompt = buildTraderAnalysisPrompt(trader, marketData, externalData, accountInfo, source);
    const systemPrompt = generateSystemPrompt('zh');

    // 调用 AI 模型
    const modelId = getModelId(trader.aiModel);
    const response = await callSingleModel(
      modelId,
      prompt,
      {
        systemPrompt,
        temperature: 0.3, // 低温度以获得更一致的结果
        maxTokens: 1000,
        userApiKey, // 使用用户的 API Key
      }
    );

    // 解析响应 (callSingleModel 返回 { content, ... })
    const result = parseTraderAnalysisResponse(response.content);

    console.log(`[TraderAnalysis] Analysis result:`, result);

    return result;

  } catch (error) {
    console.error(`[TraderAnalysis] Analysis failed:`, error);

    // 返回保守的 hold 信号
    return {
      action: 'hold',
      confidence: 0,
      reasoning: `Analysis failed: ${error.message}`,
    };
  }
}

/**
 * 构建 Trader 分析 Prompt
 * @param {object} trader - Trader 配置
 * @param {object} marketData - 市场数据
 * @param {object} externalData - 外部数据（Reddit, Google News 等）
 * @param {object} accountInfo - 用户账户信息（可选）
 * @param {string} source - 市场来源 ('POLYMARKET' | 'KALSHI')
 */
function buildTraderAnalysisPrompt(trader, marketData, externalData = null, accountInfo = null, source = 'POLYMARKET') {
  const {
    eventTitle,
    description,
    yesPrice,
    noPrice,
    volume,
    liquidity,
    endDate,
  } = marketData;

  // 权重配置
  const weights = {
    news: trader.newsWeight,
    data: trader.dataWeight,
    sentiment: trader.sentimentWeight,
  };

  // 用户自定义策略
  const customStrategy = trader.prompt || '';

  // 风控配置
  const riskConfig = {
    minConfidence: trader.minConfidence,
    maxPosition: trader.maxPosition,
    stopLoss: trader.stopLossPrice,
    takeProfit: trader.takeProfitPrice,
  };

  // Market source specific info
  const sourceInfo = source === 'KALSHI'
    ? '**市场来源**: Kalshi (via DFlow on Solana)'
    : '**市场来源**: Polymarket (Polygon)';

  let prompt = `
# 预测市场分析任务

## 市场信息
- ${sourceInfo}
- **标题**: ${eventTitle}
- **描述**: ${description || '无描述'}
- **当前价格**:
  - YES: ${(yesPrice * 100).toFixed(1)}%
  - NO: ${(noPrice * 100).toFixed(1)}%
- **交易量**: $${volume?.toLocaleString() || 'N/A'}
- **流动性**: $${liquidity?.toLocaleString() || 'N/A'}
- **结束时间**: ${endDate || 'N/A'}

## 分析权重配置
- 新闻分析权重: ${weights.news}%
- 数据分析权重: ${weights.data}%
- 情绪分析权重: ${weights.sentiment}%

## ⚠️ 风控规则（必须严格遵守）

以下规则是**强制性的**，任何交易建议都必须符合这些约束：

1. **最低置信度 (${riskConfig.minConfidence}%)**：
   - 如果你的分析置信度 < ${riskConfig.minConfidence}%，**必须**返回 \`hold\`
   - 禁止在低置信度时建议买入或卖出

2. **最大仓位比例 (${riskConfig.maxPosition}%)**：
   - \`suggestedPosition\` 字段**不得超过** ${riskConfig.maxPosition}
   - 这是用户愿意承担的最大风险敞口

3. **止损价格 (${riskConfig.stopLoss}%)**：
   - 如果用户持有 YES 仓位，且当前 YES 价格 <= ${riskConfig.stopLoss}%，**必须**返回 \`sell_yes\`
   - 如果用户持有 NO 仓位，且当前 NO 价格 <= ${riskConfig.stopLoss}%，**必须**返回 \`sell_no\`
   - 止损是保护资金的最后防线，必须执行

4. **止盈价格 (${riskConfig.takeProfit}%)**：
   - 如果用户持有 YES 仓位，且当前 YES 价格 >= ${riskConfig.takeProfit}%，**建议**返回 \`sell_yes\` 锁定利润
   - 如果用户持有 NO 仓位，且当前 NO 价格 >= ${riskConfig.takeProfit}%，**建议**返回 \`sell_no\` 锁定利润

> ❗ **重要**：违反最低置信度或止损规则的建议将被视为无效。请在 reasoning 中说明你如何遵守了这些风控规则。
`;

  // 添加 Reddit 社区讨论数据
  if (externalData?.reddit) {
    const reddit = externalData.reddit;
    prompt += `
## Reddit 社区讨论

**情绪分析**:
- 整体情绪: ${reddit.sentiment?.overall === 'bullish' ? '看涨' : reddit.sentiment?.overall === 'bearish' ? '看跌' : '中性'}
- 情绪分数: ${Math.round((reddit.sentiment?.score || 0.5) * 100)}%
- 正面/负面/中性: ${reddit.sentiment?.breakdown?.positive || 0}/${reddit.sentiment?.breakdown?.negative || 0}/${reddit.sentiment?.breakdown?.neutral || 0}

**讨论热度**:
- 相关帖子: ${reddit.totalPosts || 0}
- 平均热度: ${reddit.avgScore || 0}
- 活跃度: ${reddit.activityLevel || 'N/A'}
`;
    
    if (reddit.topDiscussions?.length > 0) {
      prompt += `\n**热门讨论**:\n`;
      reddit.topDiscussions.slice(0, 3).forEach((post, i) => {
        const emoji = post.sentiment === 'positive' ? '🟢' : post.sentiment === 'negative' ? '🔴' : '🟡';
        prompt += `${i + 1}. ${emoji} [r/${post.subreddit}] "${post.title}" (👍${post.score})\n`;
      });
    }
    
    if (reddit.trendingKeywords?.length > 0) {
      prompt += `\n**热门关键词**: ${reddit.trendingKeywords.slice(0, 5).join(', ')}\n`;
    }
  }

  // 添加 Google News 新闻数据
  if (externalData?.googleNews?.articles?.length > 0) {
    const news = externalData.googleNews;
    prompt += `
## 最新新闻报道

**新闻数量**: ${news.articlesCount || 0}
`;
    
    prompt += `\n**近期新闻**:\n`;
    news.articles.slice(0, 3).forEach((article, i) => {
      prompt += `${i + 1}. "${article.title}" - ${article.source} (${article.pubDateFormatted || article.pubDate})\n`;
    });
  }

  // 添加账户信息（如果提供）
  if (accountInfo) {
    prompt += `
## 用户账户状况

**⚠️ 重要：交易建议必须考虑以下账户实际状况**

- **可用余额**: $${(accountInfo.availableBalance || 0).toFixed(2)}
- **持仓总值**: $${(accountInfo.totalPositionsValue || 0).toFixed(2)}
- **总盈亏**: ${(accountInfo.totalPnL || 0) >= 0 ? '+' : ''}$${(accountInfo.totalPnL || 0).toFixed(2)}
`;

    if (accountInfo.positions && accountInfo.positions.length > 0) {
      prompt += `\n**当前持仓** (${accountInfo.positions.length}):\n`;
      accountInfo.positions.forEach((pos, index) => {
        const pnlSign = (pos.pnl || 0) >= 0 ? '+' : '';
        prompt += `${index + 1}. ${pos.eventTitle || 'Unknown'}\n`;
        prompt += `   - 方向: ${pos.outcome || 'N/A'}\n`;
        prompt += `   - 数量: ${(pos.size || 0).toFixed(2)} 股\n`;
        prompt += `   - 均价: $${(pos.avgPrice || 0).toFixed(4)}\n`;
        prompt += `   - 当前价: $${(pos.currentPrice || 0).toFixed(4)}\n`;
        prompt += `   - 市值: $${(pos.value || 0).toFixed(2)}\n`;
        prompt += `   - 盈亏: ${pnlSign}$${(pos.pnl || 0).toFixed(2)}\n`;
      });
    } else {
      prompt += `\n**当前持仓**: 无\n`;
    }

    prompt += `
> 💡 **约束条件**：建议的交易金额不得超过可用余额 $${(accountInfo.availableBalance || 0).toFixed(2)}。如果已持有该市场的仓位，请考虑是否应该加仓、减仓或持有。
`;
  }

  // 用户自定义策略
  if (customStrategy) {
    prompt += `\n## 用户自定义策略\n${customStrategy}\n`;
  }

  prompt += `
## 任务要求
请根据以上信息进行分析，并给出交易建议。

**输出格式（JSON）**:
\`\`\`json
{
  "action": "buy_yes" | "buy_no" | "sell_yes" | "sell_no" | "hold",
  "confidence": 0-100,
  "reasoning": "分析理由（需说明如何遵守风控规则）",
  "priceTarget": 0.0-1.0,
  "riskLevel": "low" | "medium" | "high",
  "suggestedPosition": 0-${riskConfig.maxPosition}
}
\`\`\`

## 决策流程（按优先级执行）

**第一步：检查止损条件**
${accountInfo?.positions?.length > 0 ? `- 用户有持仓，检查是否触发止损 (价格 <= ${riskConfig.stopLoss}%)` : '- 用户无持仓，跳过止损检查'}

**第二步：检查止盈条件**
${accountInfo?.positions?.length > 0 ? `- 用户有持仓，检查是否触发止盈 (价格 >= ${riskConfig.takeProfit}%)` : '- 用户无持仓，跳过止盈检查'}

**第三步：评估市场机会**
- 分析市场是否被低估或高估
- 计算置信度

**第四步：应用风控规则**
- 置信度 < ${riskConfig.minConfidence}% → 返回 hold
- suggestedPosition 不得超过 ${riskConfig.maxPosition}%
${accountInfo ? `- 交易金额不得超过可用余额 $${(accountInfo.availableBalance || 0).toFixed(2)}` : ''}

注意事项:
1. ⚠️ **风控规则是强制性的**，必须在 reasoning 中说明遵守情况
2. 当前价格已经反映市场预期，需要找到被低估的机会
3. 考虑流动性风险，低流动性市场应降低置信度
4. 临近结束时间应更谨慎
${externalData?.reddit ? '5. 参考 Reddit 社区情绪，但不要过度依赖' : ''}
${externalData?.googleNews ? '6. 关注最新新闻报道的影响' : ''}
${accountInfo?.positions?.length > 0 ? '7. 持仓管理：根据止损/止盈条件决定是否平仓' : ''}
`;

  return prompt;
}

/**
 * 获取 OpenRouter 模型 ID
 *
 * 支持两种格式:
 * 1. 完整的 OpenRouter 模型 ID (如 'openai/gpt-4o') - 直接使用
 * 2. 旧版短名称 (如 'gpt-4o') - 通过映射转换
 */
function getModelId(aiModel) {
  // 如果已经是完整的 OpenRouter 模型 ID（包含 /），直接返回
  if (aiModel && aiModel.includes('/')) {
    return aiModel;
  }

  // 旧版短名称映射（向后兼容）
  const modelMap = {
    'gpt-4': 'openai/gpt-4-turbo',
    'gpt-4o': 'openai/gpt-4o',
    'gpt-4o-mini': 'openai/gpt-4o-mini',
    'claude-3-5-sonnet': 'anthropic/claude-3.5-sonnet',
    'claude-3.5-sonnet': 'anthropic/claude-3.5-sonnet',
    'claude-3-opus': 'anthropic/claude-3-opus',
    'deepseek': 'deepseek/deepseek-chat',
    'deepseek-reasoner': 'deepseek/deepseek-r1',
    'gemini-pro': 'google/gemini-pro',
    'gemini-2.0-flash': 'google/gemini-2.0-flash-exp:free',
  };

  return modelMap[aiModel] || 'deepseek/deepseek-chat';
}

/**
 * 解析 AI 分析响应
 */
function parseTraderAnalysisResponse(response) {
  try {
    // 尝试从响应中提取 JSON
    const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[1]);
      return {
        action: parsed.action || 'hold',
        confidence: Math.min(100, Math.max(0, parsed.confidence || 0)),
        reasoning: parsed.reasoning || '',
        priceTarget: parsed.priceTarget,
        riskLevel: parsed.riskLevel,
      };
    }

    // 尝试直接解析 JSON
    const directParse = JSON.parse(response);
    return {
      action: directParse.action || 'hold',
      confidence: Math.min(100, Math.max(0, directParse.confidence || 0)),
      reasoning: directParse.reasoning || '',
      priceTarget: directParse.priceTarget,
      riskLevel: directParse.riskLevel,
    };

  } catch (error) {
    console.error('[TraderAnalysis] Failed to parse response:', error);

    // 尝试从文本中提取关键信息
    const actionMatch = response.match(/(buy_yes|buy_no|sell_yes|sell_no|hold)/i);
    const confidenceMatch = response.match(/confidence[:\s]+(\d+)/i);

    return {
      action: actionMatch ? actionMatch[1].toLowerCase() : 'hold',
      confidence: confidenceMatch ? parseInt(confidenceMatch[1]) : 0,
      reasoning: 'Failed to parse AI response',
    };
  }
}

export default {
  analyzeMarketForTrader,
};
