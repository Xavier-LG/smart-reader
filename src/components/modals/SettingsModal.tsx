import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Plus, Trash2, ShieldAlert, Globe, Save } from 'lucide-react';
import { useSettings, FilterRule } from '../../lib/useSettings';
import { nanoid } from 'nanoid';
import { cn } from '../../lib/utils';
import { api, ProxySettings } from '../../lib/api';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const { filterRules, setFilterRules } = useSettings();
  const [newPattern, setNewPattern] = useState('');
  const [ruleType, setRuleType] = useState<'text' | 'regex' | 'line' | 'from_to_end'>('text');
  const [proxySettings, setProxySettings] = useState<ProxySettings>({ enabled: false, url: '' });
  const [proxySaving, setProxySaving] = useState(false);

  React.useEffect(() => {
    if (!isOpen) return;

    let cancelled = false;
    api.getProxySettings()
      .then((settings) => {
        if (!cancelled) {
          setProxySettings(settings);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          alert(err.message || '加载代理设置失败');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  const handleAddRule = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPattern.trim()) return;

    // Test regex validity
    if (ruleType === 'regex') {
      try {
        new RegExp(newPattern, 'gm');
      } catch (err) {
        alert("无效的正则表达式！");
        return;
      }
    }

    const newRule: FilterRule = {
      id: nanoid(),
      pattern: newPattern,
      type: ruleType,
      isActive: true
    };

    setFilterRules([...filterRules, newRule]);
    setNewPattern('');
  };

  const handleToggleRule = (id: string) => {
    setFilterRules(filterRules.map(r => r.id === id ? { ...r, isActive: !r.isActive } : r));
  };

  const handleDeleteRule = (id: string) => {
    setFilterRules(filterRules.filter(r => r.id !== id));
  };

  const handleSaveProxy = async () => {
    setProxySaving(true);
    try {
      const saved = await api.updateProxySettings(proxySettings);
      setProxySettings(saved);
      alert('代理设置已保存');
    } catch (err: any) {
      alert(err.message || '保存代理设置失败');
    } finally {
      setProxySaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6">
      <motion.div 
        initial={{ scale: 0.95, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0, y: 20 }}
        className="bg-white dark:bg-[#1a1b1e] rounded-3xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[85vh] overflow-hidden border border-gray-100 dark:border-white/10"
      >
        {/* Header */}
        <div className="px-6 py-5 border-b border-gray-100 dark:border-white/10 flex items-center justify-between shrink-0 bg-white/50 dark:bg-white/5 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-500/10 flex items-center justify-center">
              <ShieldAlert className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <h2 className="text-xl font-bold tracking-tight text-slate-800 dark:text-white">设置 / 广告过滤</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">管理文章显示时的文本过滤规则</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-white/10 rounded-full transition-colors text-gray-400 dark:text-gray-500"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar">
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
              <Globe className="w-4 h-4" />
              代理设置
            </h3>

            <div className="rounded-3xl border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-[#0a0a0b] p-4 space-y-4">
              <label className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-sm font-semibold text-slate-800 dark:text-white">启用代理</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">用于服务端抓取微信公众号文章</div>
                </div>
                <input
                  type="checkbox"
                  checked={proxySettings.enabled}
                  onChange={(e) => setProxySettings((prev) => ({ ...prev, enabled: e.target.checked }))}
                  className="w-4 h-4 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500 dark:border-white/20 dark:bg-transparent"
                />
              </label>

              <div className="space-y-2">
                <label className="text-xs font-bold tracking-wider text-gray-500 dark:text-gray-400 uppercase">
                  代理地址
                </label>
                <input
                  type="text"
                  value={proxySettings.url}
                  onChange={(e) => setProxySettings((prev) => ({ ...prev, url: e.target.value }))}
                  placeholder="http://127.0.0.1:7890"
                  className="w-full rounded-2xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 px-4 py-3 text-sm text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <p className="text-xs text-gray-400 dark:text-gray-500">
                  支持 `http://`、`https://`。保存后导入微信文章会使用这个代理。
                </p>
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleSaveProxy}
                  disabled={proxySaving}
                  className="px-4 py-2.5 bg-indigo-600 text-white font-bold text-sm rounded-2xl hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2"
                >
                  <Save className="w-4 h-4" />
                  保存代理
                </button>
              </div>
            </div>
          </div>
          
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
              添加过滤规则
            </h3>
            
            <form onSubmit={handleAddRule} className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1 flex flex-col sm:flex-row items-stretch sm:items-center gap-3 bg-gray-50 dark:bg-[#0a0a0b] p-2 rounded-2xl border border-gray-200 dark:border-white/10 focus-within:border-indigo-500 dark:focus-within:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-200 dark:focus-within:ring-indigo-500/20 transition-all">
                <select
                  value={ruleType}
                  onChange={(e) => setRuleType(e.target.value as any)}
                  className="px-3 py-2 rounded-xl text-xs font-bold bg-white text-gray-700 dark:bg-white/10 dark:text-gray-200 border border-gray-200 dark:border-white/10 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="text">普通提取</option>
                  <option value="line">删除包含该行</option>
                  <option value="from_to_end">从截断到结尾</option>
                  <option value="regex">正则表达式</option>
                </select>
                <input 
                  type="text"
                  value={newPattern}
                  onChange={e => setNewPattern(e.target.value)}
                  placeholder="输入要过滤/匹配的文本内容..."
                  className="flex-1 bg-transparent border-none focus:outline-none text-sm dark:text-white px-2"
                />
              </div>
              <button 
                type="submit"
                disabled={!newPattern.trim()}
                className="px-6 py-3 bg-indigo-600 text-white font-bold text-sm rounded-2xl hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 shrink-0"
              >
                <Plus className="w-4 h-4" />
                <span className="hidden sm:inline">添加</span>
              </button>
            </form>
            <p className="text-xs text-gray-400 dark:text-gray-500">提示: 过滤规则会在文章加载时动态生效（不修改原文数据）。</p>
          </div>

          <div className="space-y-4">
             <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider">
              当前过滤规则 ({filterRules.length})
            </h3>
            
            {filterRules.length === 0 ? (
              <div className="text-center py-10 bg-gray-50 dark:bg-white/5 rounded-3xl border border-dashed border-gray-200 dark:border-white/10">
                <ShieldAlert className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">目前没有过滤规则</p>
              </div>
            ) : (
              <ul className="space-y-2">
                <AnimatePresence>
                  {filterRules.map(rule => (
                    <motion.li 
                      key={rule.id}
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="group flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between p-3 sm:px-4 sm:py-3 bg-white dark:bg-[#0a0a0b] rounded-2xl border border-gray-100 dark:border-white/5 shadow-sm hover:border-indigo-100 dark:hover:border-indigo-500/30 transition-colors"
                    >
                      <div className="flex items-center gap-3 overflow-hidden w-full sm:w-auto">
                        <input 
                          type="checkbox"
                          checked={rule.isActive}
                          onChange={() => handleToggleRule(rule.id)}
                          className="w-4 h-4 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500 dark:border-white/20 dark:bg-transparent"
                        />
                        <div className={cn(
                          "px-2 py-0.5 rounded text-[10px] font-bold tracking-wider shrink-0",
                          (rule.type === 'regex' || rule.isRegex) ? "bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-300" : 
                          rule.type === 'line' ? "bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-300" :
                          rule.type === 'from_to_end' ? "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300" :
                          "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300"
                        )}>
                          {(rule.type === 'regex' || rule.isRegex) ? 'REGEX' : rule.type?.toUpperCase() || 'TEXT'}
                        </div>
                        <span className={cn(
                          "text-sm font-mono truncate",
                          rule.isActive ? "text-slate-700 dark:text-gray-300" : "text-gray-400 line-through"
                        )}>
                          {rule.pattern}
                        </span>
                      </div>
                      
                      <button 
                        onClick={() => handleDeleteRule(rule.id)}
                        className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-xl transition-colors sm:opacity-0 group-hover:opacity-100 self-end sm:self-auto shrink-0"
                        title="删除规则"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ul>
            )}
          </div>

        </div>
      </motion.div>
    </div>
  );
}
