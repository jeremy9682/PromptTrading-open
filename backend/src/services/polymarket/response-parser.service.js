/**
 * Polymarket AI 响应解析服务
 * 将 AI 返回的文本解析为结构化数据
 */

/**
 * 解析 AI 响应为结构化数据
 * @param {string} content - AI 返回的原始文本
 * @param {string} language - 语言
 * @returns {object} 解析后的结构化数据
 */
export function parsePolymarketResponse(content, language = 'zh') {
  const isZh = language === 'zh';

  try {
    // 尝试提取 JSON 块
    const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
    let jsonStr = jsonMatch ? jsonMatch[1] : content;

    // 清理 JSON 字符串
    jsonStr = cleanJsonString(jsonStr);

    // 尝试解析 JSON
    const parsed = JSON.parse(jsonStr);

    // 验证和规范化数据
    return normalizeResponse(parsed, isZh);
  } catch (parseError) {
    console.error('JSON parse error:', parseError.message);

    // 尝试更宽松的解析
    try {
      return extractFromText(content, isZh);
    } catch (extractError) {
      console.error('Text extraction error:', extractError.message);

      // 返回默认结构，包含原始响应
      return getDefaultResponse(content, isZh);
    }
  }
}

/**
 * 清理 JSON 字符串
 */
function cleanJsonString(str) {
  if (!str) return '{}';

  // 移除可能的 markdown 代码块标记
  str = str.replace(/^```(json)?\s*/i, '').replace(/\s*```$/i, '');

  // 移除注释（小心不要破坏字符串内的内容）
  // 只移除行尾的单行注释
  str = str.replace(/,\s*\/\/[^\n]*/g, ',');

  // 修复常见的 JSON 格式问题
  // 处理尾随逗号
  str = str.replace(/,(\s*[}\]])/g, '$1');

  return str.trim();
}

/**
 * 规范化响应数据
 */
function normalizeResponse(parsed, isZh) {
  return {
    summary: parsed.summary || (isZh ? '分析完成' : 'Analysis complete'),

    reasoning: {
      questionBreakdown: Array.isArray(parsed.reasoning?.questionBreakdown)
        ? parsed.reasoning.questionBreakdown
        : [],
      baseRateAnalysis: parsed.reasoning?.baseRateAnalysis || '',
      factors: normalizeFactors(parsed.reasoning?.factors, isZh),
      detailedAnalysis: parsed.reasoning?.detailedAnalysis || ''
    },

    probability: {
      yes: normalizeNumber(parsed.probability?.yes, 0, 1, 0.5),
      confidence: normalizeNumber(parsed.probability?.confidence, 0, 100, 50)
    },

    marketAssessment: {
      currentPrice: normalizeNumber(parsed.marketAssessment?.currentPrice, 0, 1, 0.5),
      fairValue: normalizeNumber(parsed.marketAssessment?.fairValue, 0, 1, 0.5),
      mispricing: parsed.marketAssessment?.mispricing || 0,
      direction: normalizeDirection(parsed.marketAssessment?.direction)
    },

    decision: {
      action: normalizeAction(parsed.decision?.action),
      confidence: normalizeNumber(parsed.decision?.confidence, 0, 100, 50),
      reasoning: parsed.decision?.reasoning || '',
      riskLevel: normalizeRiskLevel(parsed.decision?.riskLevel),
      suggestedPosition: normalizeNumber(parsed.decision?.suggestedPosition, 0, 100, 10),
      // Multi-option market support
      selectedOutcome: parsed.decision?.selectedOutcome || null,
      selectedOutcomeId: parsed.decision?.selectedOutcomeId || null,
      outcomeSide: normalizeOutcomeSide(parsed.decision?.outcomeSide)
    },

    risks: Array.isArray(parsed.risks) ? parsed.risks : [],
    keyInsights: Array.isArray(parsed.keyInsights) ? parsed.keyInsights : [],

    // Multi-option analysis
    multiOptionAnalysis: normalizeMultiOptionAnalysis(parsed.multiOptionAnalysis, isZh)
  };
}

/**
 * 规范化因素数组
 */
function normalizeFactors(factors, isZh) {
  if (!Array.isArray(factors)) return [];

  return factors.map(factor => ({
    name: factor.name || (isZh ? '未命名因素' : 'Unnamed factor'),
    impact: normalizeImpact(factor.impact),
    weight: normalizeNumber(factor.weight, 1, 10, 5),
    explanation: factor.explanation || ''
  }));
}

/**
 * 规范化数值
 */
function normalizeNumber(value, min, max, defaultValue) {
  if (value === undefined || value === null) return defaultValue;

  // 如果是字符串，尝试解析
  if (typeof value === 'string') {
    value = parseFloat(value);
  }

  if (isNaN(value)) return defaultValue;

  return Math.min(Math.max(value, min), max);
}

/**
 * 规范化影响类型
 */
function normalizeImpact(impact) {
  if (!impact) return 'neutral';
  const normalized = String(impact).toLowerCase().trim();
  if (['positive', 'negative', 'neutral'].includes(normalized)) {
    return normalized;
  }
  return 'neutral';
}

/**
 * 规范化方向
 */
function normalizeDirection(direction) {
  if (!direction) return 'fair';
  const normalized = String(direction).toLowerCase().trim();
  if (['underpriced', 'overpriced', 'fair'].includes(normalized)) {
    return normalized;
  }
  return 'fair';
}

/**
 * 规范化操作
 */
function normalizeAction(action) {
  if (!action) return 'hold';
  const normalized = String(action).toLowerCase().trim().replace(/_/g, '_');
  if (['buy_yes', 'buy_no', 'sell_yes', 'sell_no', 'hold'].includes(normalized)) {
    return normalized;
  }
  // 兼容其他格式
  if (normalized.includes('yes') && normalized.includes('sell')) return 'sell_yes';
  if (normalized.includes('no') && normalized.includes('sell')) return 'sell_no';
  if (normalized.includes('yes') && normalized.includes('buy')) return 'buy_yes';
  if (normalized.includes('no') && normalized.includes('buy')) return 'buy_no';
  return 'hold';
}

/**
 * 规范化风险等级
 */
function normalizeRiskLevel(level) {
  if (!level) return 'medium';
  const normalized = String(level).toLowerCase().trim();
  if (['low', 'medium', 'high'].includes(normalized)) {
    return normalized;
  }
  return 'medium';
}

/**
 * 规范化 outcome side (yes/no)
 */
function normalizeOutcomeSide(side) {
  if (!side) return null;
  const normalized = String(side).toLowerCase().trim();
  if (['yes', 'no'].includes(normalized)) {
    return normalized;
  }
  return null;
}

/**
 * 规范化多选项分析
 */
function normalizeMultiOptionAnalysis(analysis, isZh) {
  if (!analysis) return null;

  const outcomes = Array.isArray(analysis.outcomes)
    ? analysis.outcomes.map(outcome => ({
        name: outcome.name || '',
        id: outcome.id || null,
        predictedProbability: normalizeNumber(outcome.predictedProbability, 0, 1, 0.5),
        currentPrice: normalizeNumber(outcome.currentPrice, 0, 1, 0.5),
        recommendation: normalizeAction(outcome.recommendation),
        reasoning: outcome.reasoning || ''
      }))
    : [];

  return {
    outcomes,
    bestPick: analysis.bestPick || null
  };
}

/**
 * 从文本中提取信息（备用方法）
 */
function extractFromText(content, isZh) {
  const result = getDefaultResponse(content, isZh);

  // 尝试提取概率
  const probMatch = content.match(/(?:probability|概率|likelihood)[\s:：]*(\d+(?:\.\d+)?)\s*%?/i);
  if (probMatch) {
    let prob = parseFloat(probMatch[1]);
    if (prob > 1) prob = prob / 100;
    result.probability.yes = normalizeNumber(prob, 0, 1, 0.5);
  }

  // 尝试提取置信度
  const confMatch = content.match(/(?:confidence|置信度)[\s:：]*(\d+(?:\.\d+)?)\s*%?/i);
  if (confMatch) {
    result.probability.confidence = normalizeNumber(parseFloat(confMatch[1]), 0, 100, 50);
  }

  // 尝试提取操作
  if (/sell\s*yes|卖出\s*yes|平多|减仓\s*yes/i.test(content)) {
    result.decision.action = 'sell_yes';
  } else if (/sell\s*no|卖出\s*no|平空|减仓\s*no/i.test(content)) {
    result.decision.action = 'sell_no';
  } else if (/buy\s*yes|买入\s*yes|做多/i.test(content)) {
    result.decision.action = 'buy_yes';
  } else if (/buy\s*no|买入\s*no|做空/i.test(content)) {
    result.decision.action = 'buy_no';
  } else if (/hold|观望|持有/i.test(content)) {
    result.decision.action = 'hold';
  }

  // 提取风险等级
  if (/high\s*risk|高风险/i.test(content)) {
    result.decision.riskLevel = 'high';
  } else if (/low\s*risk|低风险/i.test(content)) {
    result.decision.riskLevel = 'low';
  }

  // 提取第一段作为摘要
  const firstPara = content.split(/\n\n/)[0];
  if (firstPara && firstPara.length < 500) {
    result.summary = firstPara.replace(/^#+\s*/, '').trim();
  }

  return result;
}

/**
 * 获取默认响应结构（仅在 AI 响应格式确实无法解析时使用）
 */
function getDefaultResponse(rawContent, isZh) {
  // 如果没有原始内容，说明 AI 调用本身失败了
  const hasContent = rawContent && rawContent.trim().length > 0;

  return {
    summary: isZh
      ? (hasContent ? '⚠️ AI 响应解析失败' : '❌ AI 调用失败，未收到响应')
      : (hasContent ? '⚠️ AI response parsing failed' : '❌ AI call failed, no response received'),
    reasoning: {
      questionBreakdown: [],
      baseRateAnalysis: '',
      factors: [],
      detailedAnalysis: hasContent ? rawContent : ''
    },
    probability: {
      yes: null,  // 使用 null 表示无有效数据，而不是误导性的 0.5
      confidence: 0
    },
    marketAssessment: {
      currentPrice: null,
      fairValue: null,
      mispricing: null,
      direction: null
    },
    decision: {
      action: 'error',  // 使用 'error' 而不是 'hold'
      confidence: 0,
      reasoning: isZh
        ? (hasContent ? 'AI 响应格式无法解析，请查看原始内容或重试' : 'AI 调用失败，请检查配置后重试')
        : (hasContent ? 'AI response format could not be parsed, see raw content or retry' : 'AI call failed, please check configuration and retry'),
      riskLevel: 'high',
      suggestedPosition: 0
    },
    risks: [
      isZh
        ? (hasContent ? 'AI 响应格式异常' : 'AI 服务连接失败')
        : (hasContent ? 'AI response format error' : 'AI service connection failed')
    ],
    keyInsights: [],
    parseError: true,  // 明确标记这是解析错误
    parseWarning: isZh
      ? (hasContent ? 'AI 响应格式异常，无法提取有效分析' : 'AI 未返回有效响应')
      : (hasContent ? 'AI response format unexpected, could not extract valid analysis' : 'AI did not return a valid response')
  };
}
