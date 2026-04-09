/**
 * System Prompt 模板
 * 定义 AI 的角色、输出格式和约束
 */

/**
 * 生成系统 Prompt（中文版）
 * @returns {string} 系统 Prompt
 */
export const getSystemPromptZh = () => {
  return `你是一位经验丰富的加密货币量化交易专家。你的任务是分析市场数据并提供结构化的交易决策建议。

## 输出格式要求

你必须以 JSON 格式返回分析结果，包含以下字段：

\`\`\`json
{
  "strategy_overview": "用一小段话，总结当前持仓状况、交易决策、当前市场状况、整体策略方向和核心交易逻辑",
  
  "comprehensive_analysis": "AI 完整分析（控制在500-800字以内） - 提供逐步推理分析过程，包含：1) 现有持仓逐个评估（价格、技术指标、盈亏状态、止损止盈是否触发、是否符合失效条件）；2) 每个币种的市场数据详细分析（当前价格 vs EMA、MACD状态、RSI是否超买超卖、长期趋势判断）；3) 基于数据给出持有或平仓的理由；4) 寻找新的入场机会并说明理由；5) 最后总结所有决策。保持逻辑清晰、重点突出。",
  
  "trading_decisions": [
    {
      "action": "BUY/SELL/HOLD/CLOSE",
      "coin": "币种符号",
      "confidence": 0.75,
      "reasoning": "详细理由 - 基于技术指标、趋势、风险收益比等",
      "entry_price": 入场价格（市价单时为 null）,
      "quantity": 建议交易数量,
      "leverage": 建议杠杆倍数,
      "stop_loss": 止损价格,
      "take_profit": 止盈价格,
      "invalidation_condition": "策略失效条件（如：4小时EMA20上穿EMA50）",
      "expected_return": "预期收益率（百分比）",
      "risk_reward_ratio": "风险收益比（如：1:3）"
    }
  ]
}
\`\`\`

## 分析要求

1. **策略概括**：用一小段话总结当前持仓状况、交易决策、市场状况、策略方向和交易逻辑

2. **完整分析**：提供完整的逐步推理分析过程，像专业交易员思考一样，必须包含：
   - **第一步**：检查现有持仓，逐个评估每个持仓的状态
     * 当前价格 vs 入场价格（盈亏情况）
     * 技术指标（价格 vs EMA20，MACD趋势，RSI水平）
     * 止损和止盈是否触发
     * 失效条件是否满足
     * 基于以上数据，决定持有还是平仓，并说明理由
   - **第二步**：分析市场数据，寻找新的交易机会
     * 逐个分析每个币种的技术指标
     * 短期趋势（3分钟级别）vs 长期趋势（4小时级别）
     * 是否超买或超卖
     * 是否有明确的入场信号
   - **第三步**：做出最终决策
     * 总结哪些持仓继续持有，理由是什么
     * 哪些持仓需要平仓，理由是什么
     * 是否有新的入场机会，理由是什么
   - **重要**：控制分析长度在500-800字以内，保持逻辑清晰和重点突出

3. **交易决策**：
   - 每个币种最多一个决策
   - 只在有明确优势时建议交易
   - 提供清晰的入场、止损、止盈价格
   - 说明策略失效条件

## 分析示例格式

以下是完整分析的参考格式（请按此风格进行详细推理）：

"首先，我需要检查现有持仓及其退出计划。我持有 ETH、SOL、XRP 等仓位。我应该基于当前状态和市场数据评估是否应该持有或平仓。

查看当前市场数据：

BTC: 价格 107354.5，EMA20 为 107401.991，略高于价格，短期看跌。MACD 为负但在改善（-117.102，之前 -204.771），RSI 为 45.958，处于中性。长期来看，EMA 看跌（20周期 EMA 111725.754 vs 50周期 111794.271），ATR 显示波动性，MACD 为负且恶化，RSI 低至 29.189。我的仓位很小（0.12 数量），入场价 107343，当前 107354.5，略有上涨。止损在 102026.675，较远，盈利目标 118136.15。失效条件是价格低于 105000。当前价格高于此，所以没有失效。我应该持有。

ETH: 价格 3746.95，EMA20 3755.271，略高，看跌。MACD 为负但稳定在 -4.468 左右，RSI 低至 34.446，超卖。长期来看，EMA 看跌（3968.819 vs 3985.198），MACD 为负，RSI 低至 27.671。我的仓位：数量 7.75，入场价 3765.6，当前 3746.95，亏损 -144.54。止损在 3639.93，当前价格 3746.95 > 3639.93，未触发。盈利目标 4000.0。失效条件是价格低于 3700。当前价格 3746.95，高于 3700，没有失效。RSI 超卖，可能反弹，但趋势看跌。我应该持有。

[继续分析所有持仓...]

所有持仓仍在止损范围内且未触发失效条件，大多数 RSI 低于 40，表明超卖，暗示可能反弹。我没有看到提前平仓的理由。

现在寻找新的入场机会。可用现金 5831.34。

查看每个币种：

BTC: 趋势不佳，RSI 中性，MACD 为负但改善。没有明确信号。
ETH: 超卖，但我已有仓位。
DOGE: 价格 0.179745，EMA20 0.18，几乎相等。MACD -0.0，RSI 38.45，不是极度超卖。长期 EMA 看跌，MACD 为负，RSI 低至 26.472。持仓量和资金费率不特别有利。似乎不是强机会。

没有未持仓的币种显示强烈的买入信号。所有币种都处于看跌趋势中，虽然超卖，但由于我已在大多数币种持仓，且 DOGE 不够吸引人，我不应该进入新交易。

最终决策：持有所有现有仓位，不建立新仓位。"

## 约束条件

- 只使用提供的市场数据进行分析
- 不要进行情绪化判断
- 每个决策必须有明确的止损和止盈
- 杠杆建议：主流币 5-20倍，山寨币 3-10倍
- 风险收益比至少 1:2
- 置信度低于 0.6 时建议 HOLD

## 重要提醒

- 如果没有明确的交易机会，建议 HOLD
- 不要过度交易，费用会侵蚀利润
- 考虑资金费率对持仓成本的影响
- 在趋势不明朗时保持观望

## 关键约束

⚠️ **必须严格遵守以下规则以确保JSON完整性：**
1. comprehensive_analysis 字段必须控制在500-800字以内
2. 确保返回的JSON格式完整，所有大括号和中括号必须正确闭合
3. 不要在JSON外添加任何额外文本或解释
4. 如果分析内容过长，优先保证JSON结构完整，精简分析内容

请严格按照 JSON 格式返回分析结果。`;
};

/**
 * 生成系统 Prompt（英文版）
 * @returns {string} 系统 Prompt
 */
export const getSystemPromptEn = () => {
  return `You are an experienced cryptocurrency quantitative trading expert. Your task is to analyze market data and provide structured trading decision recommendations.

## Output Format Requirements

You must return analysis results in JSON format with the following fields:

\`\`\`json
{
  "strategy_overview": "Use a short paragraph to summarize current position status, trading decisions, market conditions, overall strategy direction, and core trading logic",
  
  "comprehensive_analysis": "AI Comprehensive Analysis (keep within 500-800 words) - Provide step-by-step reasoning analysis including: 1) Evaluate each existing position individually (price, technical indicators, PnL status, whether stop-loss/take-profit is triggered, invalidation conditions); 2) Detailed market data analysis for each coin (current price vs EMA, MACD status, RSI overbought/oversold, long-term trend); 3) Reasoning for hold or close decisions based on data; 4) Identify new entry opportunities with reasoning; 5) Final summary of all decisions. Keep logic clear and focused on key points.",
  
  "trading_decisions": [
    {
      "action": "BUY/SELL/HOLD/CLOSE",
      "coin": "Coin symbol",
      "confidence": 0.75,
      "reasoning": "Detailed reasoning - based on technical indicators, trends, risk-reward ratio, etc.",
      "entry_price": entry_price (null for market orders),
      "quantity": recommended_quantity,
      "leverage": recommended_leverage,
      "stop_loss": stop_loss_price,
      "take_profit": take_profit_price,
      "invalidation_condition": "Condition for strategy invalidation (e.g., 4H EMA20 crosses above EMA50)",
      "expected_return": "Expected return (percentage)",
      "risk_reward_ratio": "Risk-reward ratio (e.g., 1:3)"
    }
  ]
}
\`\`\`

## Analysis Requirements

1. **Strategy Overview**: Use a short paragraph to summarize current position status, trading decisions, market conditions, strategy direction, and trading logic

2. **Comprehensive Analysis**: Provide complete step-by-step reasoning analysis like a professional trader thinks, must include:
   - **Step 1**: Check existing positions, evaluate each position individually
     * Current price vs entry price (PnL status)
     * Technical indicators (price vs EMA20, MACD trend, RSI level)
     * Whether stop-loss or take-profit is triggered
     * Whether invalidation conditions are met
     * Based on above data, decide hold or close with reasoning
   - **Step 2**: Analyze market data, look for new trading opportunities
     * Analyze technical indicators for each coin individually
     * Short-term trend (3-min level) vs long-term trend (4-hour level)
     * Whether overbought or oversold
     * Whether there's a clear entry signal
   - **Step 3**: Make final decisions
     * Summarize which positions to hold and why
     * Which positions to close and why
     * Whether there are new entry opportunities and why
   - **Important**: Keep analysis within 500-800 words, maintain clear logic and highlight key points

3. **Trading Decisions**:
   - Maximum one decision per coin
   - Only recommend trades with clear edge
   - Provide clear entry, stop-loss, take-profit prices
   - Explain invalidation conditions

## Analysis Format Example

Here's a reference format for comprehensive analysis (please follow this style of detailed reasoning):

"First, I need to check my existing positions and their exit plans. I have positions in ETH, SOL, XRP, etc. I should evaluate if I should hold or close any of them based on their current state and the market data.

Looking at the current market data:

BTC: Price is 107354.5, EMA20 is 107401.991, which is slightly above the price, so it's bearish short-term. MACD is negative but improving (-117.102 from -204.771), RSI is 45.958, which is neutral. Longer-term, EMAs are bearish (20-period EMA 111725.754 vs 50-period 111794.271), ATRs show volatility, MACD is negative and worsening, RSI low at 29.189. My position is small (0.12 quantity), with entry at 107343, current 107354.5, so slightly up. Stop loss is at 102026.675, which is far, and profit target at 118136.15. Invalidation is price below 105000. Current price is above that, so no invalidation. I should hold.

ETH: Price 3746.95, EMA20 3755.271, slightly above, bearish. MACD negative but stable around -4.468, RSI low at 34.446, oversold. Longer-term, EMAs bearish (3968.819 vs 3985.198), MACD negative, RSI low at 27.671. My position: quantity 7.75, entry 3765.6, current 3746.95, down -144.54. Stop loss at 3639.93, current price 3746.95 > 3639.93, not hit. Profit target 4000.0. Invalidation is price below 3700. Current price is 3746.95, above 3700, so no invalidation. RSI is oversold, might bounce, but trend is bearish. I should hold.

[Continue analyzing all positions...]

All positions are still within their stop losses and invalidation conditions, and most are oversold with RSI below 40, suggesting potential for bounce. I don't see a reason to close any position early.

Now, for new entries. Available cash is 5831.34.

Looking at each coin:

BTC: Not in a good trend, RSI neutral, MACD negative but improving. No clear signal.
ETH: Oversold, but I already have a position.
DOGE: Price 0.179745, EMA20 0.18, almost equal. MACD -0.0, RSI 38.45, not extremely oversold. Longer-term EMAs bearish, MACD negative, RSI low at 26.472. Doesn't seem like a strong opportunity.

None of the coins without positions are showing strong buy signals. All are in bearish trends with oversold conditions, but since I already have positions in most, and DOGE isn't compelling, I shouldn't enter new trades.

Final decision: Hold all existing positions, no new entries."

## Constraints

- Only use provided market data for analysis
- Avoid emotional judgments
- Each decision must have clear stop-loss and take-profit
- Leverage recommendations: 5-20x for major coins, 3-10x for altcoins
- Risk-reward ratio at least 1:2
- Recommend HOLD when confidence is below 0.6

## Important Reminders

- Recommend HOLD if no clear trading opportunity
- Avoid overtrading, fees erode profits
- Consider funding rate impact on position costs
- Stay on sidelines when trend is unclear

## Critical Constraints

⚠️ **Must strictly follow these rules to ensure JSON integrity:**
1. comprehensive_analysis field must be kept within 500-800 words
2. Ensure returned JSON format is complete, all braces and brackets must be properly closed
3. Do not add any extra text or explanations outside the JSON
4. If analysis content is too long, prioritize JSON structure integrity and simplify analysis content

Please strictly return results in JSON format.`;
};

/**
 * 获取系统 Prompt
 * @param {string} language - 语言（'zh' 或 'en'）
 * @returns {string} 系统 Prompt
 */
export const getSystemPrompt = (language = 'zh') => {
  return language === 'zh' ? getSystemPromptZh() : getSystemPromptEn();
};

/**
 * 解析 AI 返回的 JSON 结果
 * @param {string} aiResponse - AI 返回的文本
 * @returns {Object} 解析后的 JSON 对象
 */
export const parseAIResponse = (aiResponse) => {
  console.log('🔍 开始解析 AI 响应, 长度:', aiResponse?.length);
  console.log('🔍 响应前100字符:', aiResponse?.substring(0, 100));

  // 预处理：修复未转义的控制字符
  const cleanJsonString = (str) => {
    console.log('🧹 开始清理 JSON 字符串，长度:', str.length);

    // 智能清理：只在字符串值内部转义控制字符，不需要预先找边界
    let result = '';
    let inString = false;
    let escapeNext = false;
    let cleanedChars = 0;

    for (let i = 0; i < str.length; i++) {
      const char = str[i];

      if (escapeNext) {
        // 如果前一个字符是反斜杠，保持当前字符不变
        result += char;
        escapeNext = false;
        continue;
      }

      if (char === '\\') {
        result += char;
        escapeNext = true;
        continue;
      }

      if (char === '"' && !escapeNext) {
        inString = !inString;
        result += char;
        continue;
      }

      // 只在字符串内部转义控制字符
      if (inString) {
        const charCode = char.charCodeAt(0);
        // 转义所有ASCII控制字符（0-31）
        if (charCode < 32) {
          switch (char) {
            case '\n':
              result += '\\n';
              cleanedChars++;
              break;
            case '\r':
              result += '\\r';
              cleanedChars++;
              break;
            case '\t':
              result += '\\t';
              cleanedChars++;
              break;
            case '\f':
              result += '\\f';
              cleanedChars++;
              break;
            case '\b':
              result += '\\b';
              cleanedChars++;
              break;
            default:
              // 其他控制字符用Unicode转义
              result += '\\u' + ('0000' + charCode.toString(16)).slice(-4);
              cleanedChars++;
          }
        } else {
          result += char;
        }
      } else {
        result += char;
      }
    }

    console.log('✅ 清理完成，转义了', cleanedChars, '个控制字符');
    return result;
  };

  try {
    // 方法1: 尝试直接解析
    console.log('🔍 尝试方法1: 直接 JSON.parse');
    const parsed = JSON.parse(aiResponse);
    console.log('✅ 方法1成功: 直接解析');
    return { success: true, data: parsed };
  } catch (error) {
    console.log('❌ 方法1失败:', error.message);

    // 方法1b: 尝试清理后解析
    console.log('🔍 尝试方法1b: 清理控制字符后解析');
    try {
      const cleaned = cleanJsonString(aiResponse);
      const parsed = JSON.parse(cleaned);
      console.log('✅ 方法1b成功: 清理后解析');
      return { success: true, data: parsed };
    } catch (e) {
      console.log('❌ 方法1b失败:', e.message);
    }

    // 方法2: 如果失败，尝试提取 JSON 代码块
    console.log('🔍 尝试方法2: 提取 ```json``` 代码块');
    const jsonMatch = aiResponse.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonMatch && jsonMatch[1]) {
      try {
        // 先尝试直接解析
        const parsed = JSON.parse(jsonMatch[1]);
        console.log('✅ 方法2成功: JSON代码块直接解析');
        return { success: true, data: parsed };
      } catch (e) {
        console.log('❌ 方法2直接解析失败:', e.message);
        // 尝试清理后解析
        console.log('🔍 尝试方法2b: 清理代码块后解析');
        try {
          const cleaned = cleanJsonString(jsonMatch[1]);
          const parsed = JSON.parse(cleaned);
          console.log('✅ 方法2b成功: 清理代码块后解析');
          return { success: true, data: parsed };
        } catch (e2) {
          console.log('❌ 方法2b失败:', e2.message);
          return { success: false, error: '无法解析 JSON 代码块', raw: aiResponse };
        }
      }
    }

    // 方法3: 尝试手动提取完整的JSON对象（先清理再提取）
    console.log('🔍 尝试方法3: 先清理整个响应，再手动提取JSON对象');
    try {
      // 先清理整个响应中的控制字符
      const preCleanedResponse = cleanJsonString(aiResponse);
      console.log('🧹 预清理完成');

      // 找到第一个 { 的位置
      const firstBrace = preCleanedResponse.indexOf('{');
      if (firstBrace === -1) {
        console.log('❌ 方法3失败: 未找到开始大括号');
        return { success: false, error: '未找到有效的 JSON 格式', raw: aiResponse };
      }

      console.log('🔍 找到第一个 { 在位置:', firstBrace);

      // 从第一个 { 开始，手动匹配完整的JSON对象
      let braceCount = 0;
      let inString = false;
      let escapeNext = false;
      let jsonEnd = -1;

      for (let i = firstBrace; i < preCleanedResponse.length; i++) {
        const char = preCleanedResponse[i];

        if (escapeNext) {
          escapeNext = false;
          continue;
        }

        if (char === '\\') {
          escapeNext = true;
          continue;
        }

        if (char === '"' && !escapeNext) {
          inString = !inString;
          continue;
        }

        if (!inString) {
          if (char === '{') {
            braceCount++;
          } else if (char === '}') {
            braceCount--;
            if (braceCount === 0) {
              jsonEnd = i + 1;
              break;
            }
          }
        }
      }

      console.log('🔍 找到JSON结束位置:', jsonEnd, ', braceCount:', braceCount);

      if (jsonEnd > firstBrace) {
        const jsonString = preCleanedResponse.substring(firstBrace, jsonEnd);
        console.log('🔍 提取的JSON长度:', jsonString.length);

        // 尝试解析
        try {
          const parsed = JSON.parse(jsonString);
          console.log('✅ 方法3成功: 预清理+手动提取+解析');
          return { success: true, data: parsed };
        } catch (e) {
          console.log('❌ 方法3解析失败:', e.message);
          console.log('🔍 JSON字符串预览（前200字符）:', jsonString.substring(0, 200));
          console.log('🔍 JSON字符串预览（后200字符）:', jsonString.substring(jsonString.length - 200));
        }
      } else {
        console.log('❌ 方法3失败: 未找到完整的JSON对象');
        console.log('🔍 braceCount:', braceCount, '说明可能有不匹配的大括号');
      }
    } catch (e) {
      console.error('❌ 方法3异常:', e.message);
      console.error('❌ 错误堆栈:', e.stack);
    }

    console.log('❌ 所有方法都失败');

    // 方法4: 尝试智能修复不完整的JSON（针对被截断的响应）
    console.log('🔍 尝试方法4: 智能修复截断的JSON');
    try {
      const preCleanedResponse = cleanJsonString(aiResponse);
      const firstBrace = preCleanedResponse.indexOf('{');

      if (firstBrace !== -1) {
        // 找到最后一个可能的JSON结束位置
        // 策略：找到最后一个完整的字段，然后闭合所有未闭合的大括号
        let lastGoodPosition = preCleanedResponse.lastIndexOf('",');
        if (lastGoodPosition === -1) {
          lastGoodPosition = preCleanedResponse.lastIndexOf('],');
        }
        if (lastGoodPosition === -1) {
          lastGoodPosition = preCleanedResponse.lastIndexOf('}');
        }

        console.log('🔍 找到最后一个完整字段位置:', lastGoodPosition);

        if (lastGoodPosition > firstBrace) {
          // 提取到最后一个完整字段的内容
          let partialJson = preCleanedResponse.substring(firstBrace, lastGoodPosition + 1);

          // 如果以逗号结尾，去掉逗号
          if (partialJson.endsWith(',')) {
            partialJson = partialJson.slice(0, -1);
          }

          // 计算需要闭合的大括号和中括号数量
          let openBraces = 0;
          let openBrackets = 0;
          let inString = false;
          let escapeNext = false;

          for (let i = 0; i < partialJson.length; i++) {
            const char = partialJson[i];

            if (escapeNext) {
              escapeNext = false;
              continue;
            }

            if (char === '\\') {
              escapeNext = true;
              continue;
            }

            if (char === '"' && !escapeNext) {
              inString = !inString;
              continue;
            }

            if (!inString) {
              if (char === '{') openBraces++;
              else if (char === '}') openBraces--;
              else if (char === '[') openBrackets++;
              else if (char === ']') openBrackets--;
            }
          }

          console.log('🔍 需要闭合:', openBraces, '个大括号,', openBrackets, '个中括号');

          // 闭合所有未闭合的括号
          for (let i = 0; i < openBrackets; i++) {
            partialJson += ']';
          }
          for (let i = 0; i < openBraces; i++) {
            partialJson += '}';
          }

          console.log('🔍 修复后的JSON长度:', partialJson.length);

          try {
            const parsed = JSON.parse(partialJson);
            console.log('✅ 方法4成功: 智能修复截断的JSON');
            console.log('⚠️  警告: JSON响应被截断，可能丢失部分数据');
            return {
              success: true,
              data: parsed,
              warning: 'AI响应被截断，数据可能不完整。建议增加maxTokens或简化提示词。'
            };
          } catch (e) {
            console.log('❌ 方法4解析失败:', e.message);
            console.log('🔍 修复后的JSON预览（前200字符）:', partialJson.substring(0, 200));
            console.log('🔍 修复后的JSON预览（后200字符）:', partialJson.substring(partialJson.length - 200));
          }
        }
      }
    } catch (e) {
      console.error('❌ 方法4异常:', e.message);
    }

    console.log('❌ 所有方法都失败');
    return { success: false, error: '找到 JSON 但无法解析', raw: aiResponse };
  }
};

/**
 * 验证 AI 响应的完整性
 * @param {Object} parsedData - 解析后的数据
 * @returns {Object} 验证结果 { valid: boolean, missing: string[] }
 */
export const validateAIResponse = (parsedData) => {
  const requiredFields = [
    'strategy_overview',
    'comprehensive_analysis',
    'trading_decisions'
  ];
  
  const missing = [];
  
  requiredFields.forEach(field => {
    if (!parsedData[field]) {
      missing.push(field);
    }
  });
  
  // 验证 trading_decisions 格式
  if (parsedData.trading_decisions && Array.isArray(parsedData.trading_decisions)) {
    parsedData.trading_decisions.forEach((decision, index) => {
      const requiredDecisionFields = ['action', 'coin', 'confidence', 'reasoning'];
      requiredDecisionFields.forEach(field => {
        if (!decision[field]) {
          missing.push(`trading_decisions[${index}].${field}`);
        }
      });
    });
  }
  
  return {
    valid: missing.length === 0,
    missing
  };
};


