/**
 * Agent 列表弹窗
 * 显示用户在 Hyperliquid 上已授权的所有 Agent
 */

import React, { useState, useEffect } from 'react';
import { Shield, X, RefreshCw, Clock, CheckCircle, XCircle, Loader, AlertCircle, Trash2 } from 'lucide-react';
import { agentAPI } from '../utils/api';
import { useAuth } from '../contexts/AuthContext';

const AgentListModal = ({ isOpen, onClose, userAddress, onSelectAgent, language = 'zh' }) => {
  // Use Privy authentication
  const { authenticated, revokeAgentByName, effectiveChainId } = useAuth();
  const chainId = effectiveChainId;
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedAgent, setSelectedAgent] = useState(null);
  const [showImportKey, setShowImportKey] = useState(false);
  const [importPrivateKey, setImportPrivateKey] = useState('');
  const [agentToDelete, setAgentToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const fetchAgents = async () => {
    if (!userAddress) return;

    setLoading(true);
    setError(null);

    try {
      // 传递当前网络的 chainId
      const result = await agentAPI.list(userAddress, chainId || 421614);
      if (result.success) {
        setAgents(result.data.agents || []);
        console.log(`✅ 获取到 ${result.data.agents?.length || 0} 个 Agent (${chainId === 42161 ? '主网' : '测试网'})`);
      } else {
        setError(result.error || '获取 Agent 列表失败');
      }
    } catch (err) {
      console.error('获取 Agent 列表失败:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteAgent = async (agent) => {
    if (!authenticated) {
      alert(language === 'zh' ? '请先登录' : 'Please login first');
      return;
    }

    setDeleting(true);

    try {
      console.log('🗑️  开始删除 Agent:', agent.name, agent.address);

      // Use revokeAgentByName from AuthContext (uses Privy wallet signing)
      await revokeAgentByName(agent.name || '', chainId);

      console.log('✅ [Hyperliquid] Agent 删除成功!');
      alert(language === 'zh'
        ? `✅ Agent "${agent.name}" 已成功从 Hyperliquid 删除`
        : `✅ Agent "${agent.name}" successfully deleted from Hyperliquid`);

      // 刷新列表
      await fetchAgents();
      setAgentToDelete(null);

    } catch (error) {
      console.error('❌ 删除 Agent 失败:', error);
      alert(language === 'zh'
        ? `❌ 删除失败: ${error.message}`
        : `❌ Delete failed: ${error.message}`);
    } finally {
      setDeleting(false);
    }
  };

  useEffect(() => {
    if (isOpen && userAddress) {
      fetchAgents();
    }
  }, [isOpen, userAddress, chainId]); // 添加 chainId 依赖，网络切换时重新加载

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-gray-900 rounded-xl max-w-2xl w-full border border-gray-800 shadow-2xl max-h-[80vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
              <Shield className="text-blue-400" size={20} />
            </div>
            <div>
              <h3 className="text-xl font-bold text-white flex items-center gap-2">
                {language === 'zh' ? 'Hyperliquid Agent 列表' : 'Hyperliquid Agents'}
                {chainId && (
                  <span className={`px-2 py-0.5 text-xs rounded ${
                    chainId === 42161 
                      ? 'bg-green-500/20 text-green-400' 
                      : 'bg-blue-500/20 text-blue-400'
                  }`}>
                    {chainId === 42161 
                      ? (language === 'zh' ? '主网' : 'Mainnet')
                      : (language === 'zh' ? '测试网' : 'Testnet')}
                  </span>
                )}
              </h3>
              <p className="text-sm text-gray-400">
                {language === 'zh' ? '您在当前网络上已授权的 Agent' : 'Your authorized agents on current network'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={fetchAgents}
              disabled={loading}
              className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
              title={language === 'zh' ? '刷新' : 'Refresh'}
            >
              <RefreshCw size={16} className={`text-gray-400 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
            >
              <X size={20} className="text-gray-400" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <Loader size={32} className="text-blue-400 animate-spin" />
            </div>
          )}

          {error && (
            <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}

          {!loading && !error && agents.length === 0 && (
            <div className="text-center py-12">
              <Shield size={48} className="text-gray-600 mx-auto mb-4" />
              <p className="text-gray-400">
                {language === 'zh' ? '未找到已授权的 Agent' : 'No authorized agents found'}
              </p>
              <p className="text-gray-500 text-sm mt-2">
                {language === 'zh' 
                  ? '创建新的 Agent Wallet 后会显示在这里'
                  : 'Create a new Agent Wallet to see it here'}
              </p>
            </div>
          )}

          {!loading && agents.length > 0 && (
            <div className="space-y-3">
              {agents.map((agent, index) => {
                const isExpired = agent.isExpired || agent.validUntil < Date.now();
                const validUntil = new Date(agent.validUntil);
                const isSelected = selectedAgent?.address === agent.address;
                
                return (
                  <div
                    key={index}
                    className={`bg-gray-800/50 border rounded-lg p-4 transition-all cursor-pointer ${
                      isExpired 
                        ? 'border-gray-700 opacity-60' 
                        : isSelected
                        ? 'border-blue-500 bg-blue-500/10'
                        : 'border-green-500/30 hover:border-green-500/50'
                    }`}
                    onClick={() => !isExpired && setSelectedAgent(agent)}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                          isExpired 
                            ? 'bg-gray-700' 
                            : isSelected
                            ? 'bg-blue-500/20'
                            : 'bg-green-500/20'
                        }`}>
                          <Shield className={
                            isExpired 
                              ? 'text-gray-400' 
                              : isSelected
                              ? 'text-blue-400'
                              : 'text-green-400'
                          } size={16} />
                        </div>
                        <div>
                          <h4 className="text-white font-medium flex items-center gap-2">
                            {agent.name}
                            {isSelected && (
                              <span className="px-1.5 py-0.5 bg-blue-500 text-white text-xs rounded">
                                {language === 'zh' ? '已选' : 'Selected'}
                              </span>
                            )}
                          </h4>
                          <p className="text-gray-400 text-xs font-mono">
                            {agent.address.slice(0, 10)}...{agent.address.slice(-8)}
                          </p>
                        </div>
                      </div>
                      {isExpired ? (
                        <span className="flex items-center gap-1 px-2 py-1 bg-gray-700 text-gray-400 rounded text-xs">
                          <XCircle size={12} />
                          {language === 'zh' ? '已过期' : 'Expired'}
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 px-2 py-1 bg-green-500/20 text-green-400 rounded text-xs">
                          <CheckCircle size={12} />
                          {language === 'zh' ? '活跃' : 'Active'}
                        </span>
                      )}
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-xs text-gray-400">
                        <Clock size={12} />
                        <span>
                          {language === 'zh' ? '有效期至' : 'Valid until'}: {validUntil.toLocaleString()}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        {/* 删除按钮 */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setAgentToDelete(agent);
                          }}
                          className="p-1.5 hover:bg-red-500/20 rounded transition-colors group"
                          title={language === 'zh' ? '删除 Agent' : 'Delete Agent'}
                        >
                          <Trash2 size={14} className="text-gray-400 group-hover:text-red-400" />
                        </button>

                        {/* 导入按钮 */}
                        {isSelected && !isExpired && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setShowImportKey(true);
                            }}
                            className="px-3 py-1 bg-blue-500 text-white rounded text-xs hover:bg-blue-600"
                          >
                            {language === 'zh' ? '导入私钥' : 'Import Key'}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-800">
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-400">
              {language === 'zh' ? '总计' : 'Total'}: {agents.length} Agent(s)
            </span>
            <div className="flex gap-2">
              <button
                onClick={onClose}
                className="px-4 py-2 bg-gray-800 text-gray-300 rounded-lg hover:bg-gray-700 transition-colors"
              >
                {language === 'zh' ? '关闭' : 'Close'}
              </button>
              {selectedAgent && !selectedAgent.isExpired && (
                <button
                  onClick={() => setShowImportKey(true)}
                  className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
                >
                  {language === 'zh' ? '使用此 Agent' : 'Use This Agent'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 导入私钥弹窗 */}
      {showImportKey && selectedAgent && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-60 flex items-center justify-center p-4">
          <div className="bg-gray-900 rounded-xl p-6 max-w-md border border-gray-800">
            <h3 className="text-xl font-bold text-white mb-4">
              {language === 'zh' ? '导入 Agent 私钥' : 'Import Agent Private Key'}
            </h3>
            
            <div className="mb-4">
              <p className="text-gray-400 text-sm mb-2">
                {language === 'zh' 
                  ? `将使用 Agent: ${selectedAgent.name} (${selectedAgent.address.slice(0, 10)}...)`
                  : `Using Agent: ${selectedAgent.name} (${selectedAgent.address.slice(0, 10)}...)`}
              </p>
              
              <label className="text-gray-300 text-sm mb-2 block">
                {language === 'zh' ? 'Agent 私钥' : 'Agent Private Key'}
              </label>
              <input
                type="password"
                value={importPrivateKey}
                onChange={(e) => setImportPrivateKey(e.target.value)}
                placeholder="0x..."
                className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-4 py-3 font-mono text-sm"
              />
              <p className="text-xs text-gray-500 mt-2">
                {language === 'zh' 
                  ? '⚠️ 私钥将加密存储在您的浏览器中'
                  : '⚠️ Private key will be encrypted and stored in your browser'}
              </p>
            </div>

            <div className="p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg mb-4">
              <p className="text-yellow-400 text-sm flex items-start gap-2">
                <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
                {language === 'zh' 
                  ? '请确保这个私钥对应上述 Agent 地址。如果不匹配，交易将失败。'
                  : 'Ensure this private key matches the Agent address above. Mismatch will cause transaction failures.'}
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowImportKey(false);
                  setImportPrivateKey('');
                }}
                className="flex-1 px-4 py-2 bg-gray-800 text-gray-300 rounded-lg hover:bg-gray-700"
              >
                {language === 'zh' ? '取消' : 'Cancel'}
              </button>
              <button
                onClick={async () => {
                  if (!importPrivateKey.startsWith('0x') || importPrivateKey.length !== 66) {
                    alert(language === 'zh' ? '请输入有效的私钥格式 (0x...)' : 'Please enter a valid private key (0x...)');
                    return;
                  }
                  
                  // 验证私钥是否匹配地址
                  try {
                    const { ethers } = await import('ethers');
                    const wallet = new ethers.Wallet(importPrivateKey);
                    
                    if (wallet.address.toLowerCase() !== selectedAgent.address.toLowerCase()) {
                      alert(language === 'zh' 
                        ? '❌ 私钥与 Agent 地址不匹配！'
                        : '❌ Private key does not match Agent address!');
                      return;
                    }
                    
                    // 调用回调函数，加载这个 Agent
                    if (onSelectAgent) {
                      await onSelectAgent(selectedAgent, importPrivateKey);
                    }
                    
                    setShowImportKey(false);
                    setImportPrivateKey('');
                    onClose();
                  } catch (err) {
                    alert(language === 'zh' ? '❌ 无效的私钥' : '❌ Invalid private key');
                  }
                }}
                disabled={!importPrivateKey}
                className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {language === 'zh' ? '确认导入' : 'Confirm Import'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 删除确认弹窗 */}
      {agentToDelete && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-60 flex items-center justify-center p-4">
          <div className="bg-gray-900 rounded-xl p-6 max-w-md border border-gray-800">
            <h3 className="text-xl font-bold text-white mb-3">
              {language === 'zh' ? '确认删除 Agent' : 'Confirm Delete Agent'}
            </h3>

            <p className="text-gray-300 mb-2">
              {language === 'zh'
                ? `确定要从 Hyperliquid 删除以下 Agent 吗？`
                : `Are you sure you want to delete this Agent from Hyperliquid?`}
            </p>

            <div className="p-3 bg-gray-800 rounded-lg mb-4">
              <p className="text-white font-medium">{agentToDelete.name}</p>
              <p className="text-gray-400 text-sm font-mono">
                {agentToDelete.address}
              </p>
            </div>

            <div className="p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg mb-4">
              <p className="text-yellow-400 text-sm flex items-start gap-2">
                <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
                {language === 'zh'
                  ? '此操作将从 Hyperliquid 链上撤销 Agent 授权。删除后，此 Agent 将无法执行任何交易。'
                  : 'This will revoke the Agent authorization on Hyperliquid chain. After deletion, this Agent cannot execute any trades.'}
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setAgentToDelete(null)}
                disabled={deleting}
                className="flex-1 px-4 py-2 bg-gray-800 text-gray-300 rounded-lg hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {language === 'zh' ? '取消' : 'Cancel'}
              </button>
              <button
                onClick={() => handleDeleteAgent(agentToDelete)}
                disabled={deleting}
                className="flex-1 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {deleting && <RefreshCw size={16} className="animate-spin" />}
                {deleting
                  ? (language === 'zh' ? '删除中...' : 'Deleting...')
                  : (language === 'zh' ? '确认删除' : 'Confirm Delete')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AgentListModal;

