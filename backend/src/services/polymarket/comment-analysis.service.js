/**
 * Comment Analysis Service
 * Analyzes Polymarket event comments using LLM to extract community sentiment
 */

import { callSingleModel } from '../ai/openrouter.service.js';
import { getOpenRouterApiKey } from '../../config/secrets.js';

// Cache for analysis results (5 minute TTL)
const analysisCache = new Map();
const CACHE_TTL = 5 * 60 * 1000;

/**
 * Analyze comments for a Polymarket event
 * @param {object} params - Analysis parameters
 * @param {string} params.eventId - Event ID
 * @param {string} params.eventTitle - Event title
 * @param {string[]} params.outcomes - List of outcome names
 * @param {object[]} params.comments - Top comments to analyze
 * @param {string} params.language - Language ('zh' or 'en')
 * @returns {Promise<object>} Analysis result
 */
export async function analyzeComments({ eventId, eventTitle, outcomes, comments, language = 'en' }) {
  // Check cache
  const cacheKey = `${eventId}:${comments.length}`;
  const cached = analysisCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    console.log('[CommentAnalysis] Cache hit for:', eventId);
    return cached.data;
  }

  // If no comments, return empty result
  if (!comments || comments.length === 0) {
    return {
      overallSentiment: 'neutral',
      confidenceLevel: 'low',
      summary: language === 'zh'
        ? '暂无社区评论数据'
        : 'No community comments available',
      keyArguments: [],
      optionMentions: [],
      notableComments: [],
      analyzedCount: 0,
      totalComments: 0,
      fetchedAt: new Date().toISOString()
    };
  }

  try {
    // Get platform API key
    const apiKey = await getOpenRouterApiKey();
    if (!apiKey) {
      console.error('[CommentAnalysis] No API key available');
      return null;
    }

    // Build prompt
    const prompt = buildAnalysisPrompt(eventTitle, outcomes, comments, language);
    const systemPrompt = language === 'zh'
      ? '你是一个预测市场分析师，擅长分析社区讨论和用户情绪。请以 JSON 格式输出分析结果。'
      : 'You are a prediction market analyst specializing in community discussion and sentiment analysis. Output your analysis in JSON format.';

    console.log('[CommentAnalysis] Analyzing', comments.length, 'comments for:', eventTitle?.substring(0, 50));

    // Call LLM
    const response = await callSingleModel('deepseek/deepseek-chat', prompt, {
      systemPrompt,
      userApiKey: apiKey,
      usePlatformKey: true
    });

    // Log token usage and cost (OpenRouter returns actual cost via usage.total_cost)
    if (response.usage) {
      console.log('[CommentAnalysis] Token usage:', {
        model: 'deepseek/deepseek-chat',
        inputTokens: response.usage.prompt_tokens,
        outputTokens: response.usage.completion_tokens,
        totalTokens: response.usage.total_tokens,
        cost: response.usage.total_cost ? `$${response.usage.total_cost.toFixed(6)}` : 'N/A'
      });
    }

    // Parse response with Wilson Score calculation
    const result = parseAnalysisResponse(response.content, comments, language, outcomes);
    result.fetchedAt = new Date().toISOString();

    // Cache result
    analysisCache.set(cacheKey, {
      data: result,
      timestamp: Date.now()
    });

    console.log('[CommentAnalysis] Analysis complete:', {
      sentiment: result.overallSentiment,
      wilsonCI: result.stats ? `${(result.stats.wilsonLower * 100).toFixed(0)}%-${(result.stats.wilsonUpper * 100).toFixed(0)}%` : 'N/A',
      reliability: result.stats?.reliability,
      summary: result.summary?.substring(0, 50),
      analyzedCount: result.analyzedCount,
      keyArguments: result.keyArguments?.length || 0
    });

    return result;
  } catch (error) {
    console.error('[CommentAnalysis] Error:', error.message);
    throw error;
  }
}

/**
 * Calculate Wilson Score confidence interval
 * @param {number} positive - Number of positive votes
 * @param {number} total - Total number of votes
 * @param {number} z - Z-score for confidence level (1.96 for 95%)
 * @returns {object} { lower, upper, rate }
 */
function calculateWilsonScore(positive, total, z = 1.96) {
  if (total === 0) {
    return { lower: 0.5, upper: 0.5, rate: 0.5 };
  }

  const p = positive / total;
  const denominator = 1 + z * z / total;
  const centre = p + z * z / (2 * total);
  const spread = z * Math.sqrt((p * (1 - p) + z * z / (4 * total)) / total);

  return {
    lower: Math.max(0, (centre - spread) / denominator),
    upper: Math.min(1, (centre + spread) / denominator),
    rate: p
  };
}

/**
 * Determine sentiment reliability based on sample size
 */
function getSampleReliability(total) {
  if (total >= 50) return 'high';
  if (total >= 20) return 'medium';
  return 'low';
}

/**
 * Calculate discussion velocity (acceleration/deceleration)
 * Compares recent activity (0-3 days) vs older activity (4-10 days)
 * @param {object[]} comments - Comments with daysAgo field
 * @returns {object} { ratio, trend, recentCount, olderCount }
 */
function calculateVelocity(comments) {
  if (!comments || comments.length === 0) {
    return { ratio: 1, trend: 'stable', recentCount: 0, olderCount: 0 };
  }

  // Count comments in each period
  const recentCount = comments.filter(c => (c.daysAgo || 0) <= 3).length;
  const olderCount = comments.filter(c => (c.daysAgo || 0) > 3 && (c.daysAgo || 0) <= 10).length;

  // Normalize to same time period (3 days vs 7 days)
  // recentCount is for 3 days, olderCount is for 7 days
  // Normalize olderCount to 3-day equivalent: olderCount * (3/7)
  const normalizedOlder = olderCount * (3 / 7);

  // Calculate ratio (avoid division by zero)
  const ratio = normalizedOlder > 0 ? recentCount / normalizedOlder : (recentCount > 0 ? 3 : 1);

  // Determine trend
  let trend = 'stable';
  if (ratio >= 2) trend = 'accelerating';      // 2x or more = strong acceleration
  else if (ratio >= 1.3) trend = 'increasing'; // 1.3x-2x = moderate increase
  else if (ratio <= 0.5) trend = 'declining';  // 0.5x or less = declining
  else if (ratio <= 0.7) trend = 'slowing';    // 0.7x-0.5x = slowing down

  return {
    ratio: Math.round(ratio * 100) / 100,
    trend,
    recentCount,
    olderCount
  };
}

/**
 * Build the analysis prompt
 */
function buildAnalysisPrompt(eventTitle, outcomes, comments, language) {
  // Include comment index and time info for classification
  // Format: [1] [❤️24, 3天前] @user: "comment"
  const commentsText = comments
    .slice(0, 20)
    .map((c, index) => {
      const daysAgo = c.daysAgo || 0;
      const timeLabel = language === 'zh'
        ? (daysAgo === 0 ? '今天' : daysAgo === 1 ? '昨天' : `${daysAgo}天前`)
        : (daysAgo === 0 ? 'today' : daysAgo === 1 ? 'yesterday' : `${daysAgo}d ago`);
      return `[${index + 1}] [❤️${c.reactionCount}, ${timeLabel}] @${c.username}: "${c.body}"`;
    })
    .join('\n');

  const outcomesText = outcomes && outcomes.length > 0
    ? outcomes.join(', ')
    : 'Yes, No';

  // Detect if this is a multi-option event (more than Yes/No)
  const isMultiOption = outcomes && outcomes.length > 2;

  if (language === 'zh') {
    if (isMultiOption) {
      // Multi-option event prompt (e.g., "Who will win?", "Which candidate?")
      return `请分析以下 Polymarket 多选项事件的社区评论：

**事件**: ${eventTitle}
**选项**: ${outcomesText}

**时间加权 Top ${comments.length} 评论** (格式: [序号] [❤️点赞数, 时间] @用户):
${commentsText}

请输出 JSON 格式分析（不要包含 markdown 代码块）：
{
  "commentClassifications": [
    { "id": 1, "favoredOption": "该评论支持的选项名" | null }
  ],
  "summary": "一句话总结社区对各选项的看法（中文）",
  "keyArguments": [
    { "point": "论点描述（中文）", "forOption": "支持的选项名", "mentions": 数字 }
  ],
  "notableComments": [
    { "text": "精选评论原文", "reason": "为什么值得关注（中文）" }
  ]
}

注意：
1. commentClassifications 必须对每条评论分类：favoredOption 填写该评论支持的选项名，如果中立或无明确立场则填 null
2. 评论已按时间加权排序，近期评论更重要
3. keyArguments 中 forOption 填写该论点支持的选项名
4. 最多返回 5 个 keyArguments 和 3 个 notableComments`;
    }

    // Binary Yes/No event prompt
    return `请分析以下 Polymarket 事件的社区评论：

**事件**: ${eventTitle}
**选项**: ${outcomesText}

**时间加权 Top ${comments.length} 评论** (格式: [序号] [❤️点赞数, 时间] @用户):
${commentsText}

请输出 JSON 格式分析（不要包含 markdown 代码块）：
{
  "commentClassifications": [
    { "id": 1, "sentiment": "bullish" | "bearish" | "neutral" },
    { "id": 2, "sentiment": "bullish" | "bearish" | "neutral" }
  ],
  "summary": "一句话总结社区主流观点（中文）",
  "keyArguments": [
    { "point": "论点描述（中文）", "sentiment": "support" | "oppose", "mentions": 数字 }
  ],
  "notableComments": [
    { "text": "精选评论原文", "reason": "为什么值得关注（中文）" }
  ]
}

注意：
1. commentClassifications 必须对每条评论分类：bullish=看涨/支持事件发生，bearish=看跌/反对，neutral=中立/无明确立场
2. 评论已按时间加权排序，近期评论更重要
3. keyArguments 中 sentiment 为 support 表示支持事件发生，oppose 表示反对
4. 最多返回 5 个 keyArguments 和 3 个 notableComments`;
  }

  // English prompts
  if (isMultiOption) {
    return `Analyze the following Polymarket multi-option event community comments:

**Event**: ${eventTitle}
**Options**: ${outcomesText}

**Time-Weighted Top ${comments.length} Comments** (format: [index] [❤️likes, time] @user):
${commentsText}

Output your analysis in JSON format (no markdown code blocks):
{
  "commentClassifications": [
    { "id": 1, "favoredOption": "Option name this comment supports" | null }
  ],
  "summary": "One sentence summarizing community views on the options",
  "keyArguments": [
    { "point": "Argument description", "forOption": "Option name this supports", "mentions": number }
  ],
  "notableComments": [
    { "text": "Selected comment text", "reason": "Why it's notable" }
  ]
}

Guidelines:
1. commentClassifications: Classify each comment - favoredOption is the option name the comment supports, null if neutral or unclear
2. Comments are sorted by time-weighted score (recent comments weighted higher)
3. keyArguments forOption: which option this argument supports
4. Return at most 5 keyArguments and 3 notableComments`;
  }

  return `Analyze the following Polymarket event community comments:

**Event**: ${eventTitle}
**Outcomes**: ${outcomesText}

**Time-Weighted Top ${comments.length} Comments** (format: [index] [❤️likes, time] @user):
${commentsText}

Output your analysis in JSON format (no markdown code blocks):
{
  "commentClassifications": [
    { "id": 1, "sentiment": "bullish" | "bearish" | "neutral" },
    { "id": 2, "sentiment": "bullish" | "bearish" | "neutral" }
  ],
  "summary": "One sentence summarizing the community's main view",
  "keyArguments": [
    { "point": "Argument description", "sentiment": "support" | "oppose", "mentions": number }
  ],
  "notableComments": [
    { "text": "Selected comment text", "reason": "Why it's notable" }
  ]
}

Guidelines:
1. commentClassifications: Classify each comment - bullish=supports event happening, bearish=opposes, neutral=unclear stance
2. Comments are sorted by time-weighted score (recent comments weighted higher)
3. keyArguments sentiment: support=agrees event will happen, oppose=disagrees
4. Return at most 5 keyArguments and 3 notableComments`;
}

/**
 * Parse LLM response, calculate Wilson Score, and extract structured data
 */
function parseAnalysisResponse(content, comments, language, outcomes = []) {
  // Default fallback
  const fallback = {
    overallSentiment: 'neutral',
    summary: language === 'zh'
      ? '无法解析社区情绪'
      : 'Unable to parse community sentiment',
    keyArguments: [],
    notableComments: [],
    stats: {
      bullishCount: 0,
      bearishCount: 0,
      neutralCount: 0,
      totalOpinionated: 0,
      bullishRate: 0.5,
      wilsonLower: 0.5,
      wilsonUpper: 0.5,
      reliability: 'low',
      velocity: { ratio: 1, trend: 'stable', recentCount: 0, olderCount: 0 }
    },
    analyzedCount: comments.length,
    totalComments: comments.length
  };

  try {
    // Remove markdown code blocks if present
    let jsonStr = content;
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1].trim();
    }

    // Try to find JSON object
    const jsonObjMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (jsonObjMatch) {
      jsonStr = jsonObjMatch[0];
    }

    const parsed = JSON.parse(jsonStr);

    // Process comment classifications and calculate Wilson Score
    const classifications = Array.isArray(parsed.commentClassifications)
      ? parsed.commentClassifications
      : [];

    const isMultiOption = outcomes && outcomes.length > 2;
    let stats;
    let overallSentiment;
    let favoredOption;
    let optionMentions = [];

    if (isMultiOption) {
      // Multi-option: count support for each option
      const optionCounts = {};
      let totalWithOpinion = 0;
      let neutralCount = 0;

      for (const c of classifications) {
        if (c.favoredOption && c.favoredOption !== null) {
          optionCounts[c.favoredOption] = (optionCounts[c.favoredOption] || 0) + 1;
          totalWithOpinion++;
        } else {
          neutralCount++;
        }
      }

      // Find the most favored option
      let maxCount = 0;
      let topOption = null;
      for (const [option, count] of Object.entries(optionCounts)) {
        if (count > maxCount) {
          maxCount = count;
          topOption = option;
        }
      }

      // Calculate Wilson Score for each option (for per-option confidence intervals)
      const optionWilsonScores = {};
      for (const [option, count] of Object.entries(optionCounts)) {
        optionWilsonScores[option] = calculateWilsonScore(count, totalWithOpinion);
      }

      // Calculate Wilson Score for the top option (for overall consensus detection)
      const topWilson = topOption ? optionWilsonScores[topOption] : { lower: 0, upper: 1, rate: 0 };

      // Build option mentions from classifications with Wilson Score CI
      optionMentions = Object.entries(optionCounts).map(([option, count]) => {
        const wilson = optionWilsonScores[option];
        return {
          option,
          mentions: count,
          sentiment: option === topOption ? 'favored' : 'neutral',
          supportRate: totalWithOpinion > 0 ? count / totalWithOpinion : 0,
          // Wilson Score confidence interval for this option
          wilsonLower: wilson.lower,
          wilsonUpper: wilson.upper
        };
      }).sort((a, b) => b.mentions - a.mentions);

      // Calculate consensus strength: gap between top option and second option
      const sortedCounts = Object.values(optionCounts).sort((a, b) => b - a);
      const leadGap = sortedCounts.length >= 2
        ? (sortedCounts[0] - sortedCounts[1]) / totalWithOpinion
        : (sortedCounts[0] || 0) / Math.max(totalWithOpinion, 1);

      // Determine sentiment based on Wilson Score and lead gap
      if (topWilson.lower > 0.35 && leadGap > 0.2 && topOption) {
        overallSentiment = 'consensus';
        favoredOption = topOption;
      } else if (topWilson.upper - topWilson.lower > 0.5 || totalWithOpinion < 5) {
        overallSentiment = 'uncertain';
      } else {
        overallSentiment = 'divided';
      }

      stats = {
        optionCounts,
        neutralCount,
        totalOpinionated: totalWithOpinion,
        topOption,
        topOptionRate: topWilson.rate,
        wilsonLower: topWilson.lower,
        wilsonUpper: topWilson.upper,
        leadGap: Math.round(leadGap * 100), // percentage lead over second place
        reliability: getSampleReliability(totalWithOpinion)
      };
    } else {
      // Binary: count bullish vs bearish
      let bullishCount = 0;
      let bearishCount = 0;
      let neutralCount = 0;

      for (const c of classifications) {
        if (c.sentiment === 'bullish') bullishCount++;
        else if (c.sentiment === 'bearish') bearishCount++;
        else neutralCount++;
      }

      const totalOpinionated = bullishCount + bearishCount;
      const wilson = calculateWilsonScore(bullishCount, totalOpinionated);

      // Determine sentiment based on Wilson Score lower bound
      if (wilson.lower > 0.6) {
        overallSentiment = 'bullish';
      } else if (wilson.upper < 0.4) {
        overallSentiment = 'bearish';
      } else if (wilson.upper - wilson.lower > 0.4) {
        overallSentiment = 'uncertain'; // Wide interval = not enough data
      } else {
        overallSentiment = 'divided'; // Close to 50-50
      }

      stats = {
        bullishCount,
        bearishCount,
        neutralCount,
        totalOpinionated,
        bullishRate: wilson.rate,
        wilsonLower: wilson.lower,
        wilsonUpper: wilson.upper,
        reliability: getSampleReliability(totalOpinionated)
      };
    }

    // Calculate discussion velocity
    const velocity = calculateVelocity(comments);

    // Add velocity to stats
    stats.velocity = velocity;

    console.log('[CommentAnalysis] Analysis calculated:', {
      overallSentiment,
      velocity: velocity.trend,
      wilsonCI: `${Math.round(stats.wilsonLower * 100)}%-${Math.round(stats.wilsonUpper * 100)}%`,
      classificationsCount: classifications.length
    });

    // Build final result
    const result = {
      overallSentiment,
      summary: parsed.summary || fallback.summary,
      favoredOption,
      keyArguments: normalizeKeyArguments(parsed.keyArguments),
      optionMentions,
      notableComments: normalizeNotableComments(parsed.notableComments, comments),
      stats,
      analyzedCount: comments.length,
      totalComments: comments.length,
      // Explicit flag for frontend to use
      isMultiOption
    };

    return result;
  } catch (error) {
    console.error('[CommentAnalysis] Parse error:', error.message);
    return fallback;
  }
}

function validateSentiment(sentiment) {
  // Binary events: bullish, bearish, neutral, divided
  // Multi-option events: consensus, divided, uncertain
  const valid = ['bullish', 'bearish', 'neutral', 'divided', 'consensus', 'uncertain', 'favored', 'opposed'];
  return valid.includes(sentiment) ? sentiment : 'neutral';
}

function validateConfidence(confidence) {
  const valid = ['high', 'medium', 'low'];
  return valid.includes(confidence) ? confidence : 'medium';
}

function normalizeKeyArguments(args) {
  if (!Array.isArray(args)) return [];
  return args.slice(0, 5).map(arg => ({
    point: String(arg.point || ''),
    // Binary events use sentiment: 'support' | 'oppose'
    // Multi-option events use forOption: 'option name'
    sentiment: arg.sentiment === 'support' || arg.sentiment === 'oppose' ? arg.sentiment : 'support',
    forOption: arg.forOption ? String(arg.forOption) : undefined,
    mentions: parseInt(arg.mentions, 10) || 1
  })).filter(a => a.point);
}

function normalizeOptionMentions(mentions) {
  if (!Array.isArray(mentions)) return [];
  return mentions.map(m => ({
    option: String(m.option || ''),
    mentions: parseInt(m.mentions, 10) || 0,
    sentiment: validateSentiment(m.sentiment),
    supportRate: Math.min(1, Math.max(0, parseFloat(m.supportRate) || 0.5))
  })).filter(m => m.option);
}

function normalizeNotableComments(notable, originalComments) {
  if (!Array.isArray(notable)) return [];
  return notable.slice(0, 3).map(n => {
    // Find the original comment to get reaction count and username
    const original = originalComments.find(c =>
      c.body && n.text && c.body.includes(n.text.substring(0, 30))
    );
    return {
      text: String(n.text || '').substring(0, 200),
      reason: String(n.reason || ''),
      reactionCount: original?.reactionCount || 0,
      username: original?.username || ''
    };
  }).filter(n => n.text);
}

/**
 * Cleanup expired cache entries
 */
export function cleanupAnalysisCache() {
  const now = Date.now();
  for (const [key, value] of analysisCache.entries()) {
    if (now - value.timestamp > CACHE_TTL) {
      analysisCache.delete(key);
    }
  }
}

// Run cleanup every 5 minutes
setInterval(cleanupAnalysisCache, 5 * 60 * 1000);
