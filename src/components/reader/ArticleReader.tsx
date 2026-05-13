import React, { useState, useEffect, useRef, Suspense, lazy, useMemo } from 'react';
import { X, CheckCircle2, Clock, Share2, Download, FileText, Loader2, ArrowRight, Home, Tag as TagIcon, Plus, Hash, Copy, Check, Search, ChevronUp, ChevronDown } from 'lucide-react';
import { Article } from '../../app/types';
import { formatDate, cn } from '../../lib/utils';
import { motion, AnimatePresence, useScroll, useSpring, useMotionValueEvent } from 'motion/react';
import { api, mockUser } from '../../lib/api';
import { useSettings } from '../../lib/useSettings';
import Mark from 'mark.js';

const MarkdownViewer = lazy(() => import('./MarkdownViewer'));

interface ArticleReaderProps {
  article: Article;
  onClose: () => void;
  onStatusChange: (id: string, e?: React.MouseEvent) => void;
  onArticleUpdate?: (article: Article) => void;
  isDailyReadMode?: boolean;
  onNext?: () => void;
  allTags: string[];
  settings: {
    fontSize: number;
    lineHeight: number;
    fontFamily: string;
  };
  onSettingsChange?: (settings: any) => void;
  theme: 'light' | 'dark';
}

export default function ArticleReader({ 
  article, 
  onClose, 
  onStatusChange, 
  onArticleUpdate,
  isDailyReadMode, 
  onNext, 
  allTags,
  settings,
  onSettingsChange,
  theme
}: ArticleReaderProps) {
  const [content, setContent] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLocallyRead, setIsLocallyRead] = useState(article.status === 'read');
  const [tags, setTags] = useState<string[]>(article.tags || []);
  const [newTag, setNewTag] = useState('');
  const [isAddingTag, setIsAddingTag] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isRestoringScroll, setIsRestoringScroll] = useState(false);
  const isSelfScrolling = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const scrollRestoredRef = useRef(false);
  const autoMarked = useRef(false);
  const [isExportDropdownOpen, setIsExportDropdownOpen] = useState(false);
  
  // Search state
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [searchContext, setSearchContext] = useState({ matches: 0, current: 0 });
  const markInstance = useRef<Mark | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 250);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  // Key for localStorage scroll tracking
  const getScrollKey = (id: string) => `article_scroll_${id}`;

  const handleExportMarkdown = () => {
    if (!content) return;
    
    // 原md文件直接下载
    const exportContent = content;

    const blob = new Blob([exportContent], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${article.title || 'article'}.md`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    setIsExportDropdownOpen(false);
  };

  useEffect(() => {
    setIsLocallyRead(article.status === 'read');
    setTags(article.tags || []);
    autoMarked.current = false;
    scrollRestoredRef.current = false;
  }, [article.id, article.status]);

  const { scrollYProgress } = useScroll({
    container: containerRef,
  });

  const scaleX = useSpring(scrollYProgress, {
    stiffness: 100,
    damping: 30,
    restDelta: 0.001
  });

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        setIsSearchOpen(true);
        setTimeout(() => searchInputRef.current?.focus(), 100);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const [rawContent, setRawContent] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    const fetchContent = async () => {
      try {
        setIsLoading(true);
        const data = await api.getArticleContent(article.id);
        if (!isMounted) return;
        setRawContent(data.content);
      } catch (err) {
        console.error("Failed to load article content", err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };
    fetchContent();
    return () => { isMounted = false; };
  }, [article.id]);

  const { filterRules } = useSettings();

  useEffect(() => {
    if (!rawContent) {
      setContent(null);
      return;
    }
    
    // Defer processing slightly so UI can feel responsive when switching articles quickly
    const timeoutId = setTimeout(() => {
      try {
        let processedContent = rawContent;
        const activeRules = filterRules.filter(r => r.isActive && r.pattern);
        
        const lineRules = activeRules.filter(r => r.type === 'line');
        const otherRules = activeRules.filter(r => r.type !== 'line');

        for (const rule of otherRules) {
          try {
            const ruleType = rule.type || (rule.isRegex ? 'regex' : 'text');
            
            if (ruleType === 'regex') {
              const regex = new RegExp(rule.pattern, 'gm');
              processedContent = processedContent.replace(regex, '');
            } else if (ruleType === 'text') {
              let currentContent = processedContent;
              // Exact match first
              currentContent = currentContent.split(rule.pattern).join('');
              
              // Relaxed match
              const escapedChars = rule.pattern.split('').map(c => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
              const relaxedPattern = escapedChars.join('[\\s\\*_\\u200B\\uFEFF]*');
              try {
                const regex = new RegExp(relaxedPattern, 'gm');
                currentContent = currentContent.replace(regex, '');
              } catch (e) {}
              
              processedContent = currentContent;
            } else if (ruleType === 'from_to_end') {
              let index = processedContent.indexOf(rule.pattern);
              if (index === -1) {
                // Relaxed match: allow spaces, newlines, asterisks, underscores, and zero-width spaces between characters
                const escapedChars = rule.pattern.split('').map(c => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
                const relaxedPattern = escapedChars.join('[\\s\\*_\\u200B\\uFEFF]*');
                try {
                  const match = new RegExp(relaxedPattern).exec(processedContent);
                  if (match) {
                    index = match.index;
                  }
                } catch (e) {
                  // Ignore regex errors
                }
              }
              if (index !== -1) {
                processedContent = processedContent.substring(0, index);
              }
            }
          } catch (e) {
            console.error("Invalid filter rule", rule, e);
          }
        }

        if (lineRules.length > 0) {
          const lines = processedContent.split('\n');
          processedContent = lines.filter(line => !lineRules.some(r => line.includes(r.pattern))).join('\n');
        }

        setContent(processedContent);
      } catch (e) {
        setContent(rawContent);
      }
    }, 0);

    return () => clearTimeout(timeoutId);
  }, [rawContent, filterRules]);

  useEffect(() => {
    if (!contentRef.current || isLoading || !content) return;
    if (!markInstance.current) {
      markInstance.current = new Mark(contentRef.current);
    }

    markInstance.current.unmark({
      done: () => {
        if (!debouncedSearchQuery.trim() || !isSearchOpen) {
          setSearchContext({ matches: 0, current: 0 });
          return;
        }

        let matches = 0;
        markInstance.current?.mark(debouncedSearchQuery, {
          element: 'mark',
          className: 'bg-yellow-300 dark:bg-yellow-600 text-black dark:text-white rounded-sm py-0.5 px-0 transition-colors duration-200',
          each: (element) => {
            element.setAttribute('data-markjs', 'true');
            element.setAttribute('data-match-index', matches.toString());
            matches++;
          },
          done: () => {
            setSearchContext({ matches, current: matches > 0 ? 1 : 0 });
            if (matches > 0) {
              scrollToMatch(0);
            }
          }
        });
      }
    });
  }, [debouncedSearchQuery, isLoading, content, isSearchOpen]);
  
  const scrollToMatch = (index: number) => {
    if (!contentRef.current) return;
    const marks = contentRef.current.querySelectorAll('mark[data-markjs="true"]');
    
    marks.forEach(m => {
       m.classList.remove('ring-2', 'ring-orange-500', 'bg-orange-400');
    });

    if (marks[index]) {
      const el = marks[index] as HTMLElement;
      el.classList.add('ring-2', 'ring-orange-500', 'bg-orange-400');
      // Adding a slight delay allows the browser to compute properly inside the long scrolling div
      setTimeout(() => {
         el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 50);
    }
  };

  const handleNextMatch = () => {
    if (searchContext.matches === 0) return;
    const next = searchContext.current === searchContext.matches ? 1 : searchContext.current + 1;
    setSearchContext(prev => ({ ...prev, current: next }));
    scrollToMatch(next - 1);
  };

  const handlePrevMatch = () => {
    if (searchContext.matches === 0) return;
    const prevMatch = searchContext.current <= 1 ? searchContext.matches : searchContext.current - 1;
    setSearchContext(prevState => ({ ...prevState, current: prevMatch }));
    scrollToMatch(prevMatch - 1);
  };

  // Robust Scroll Restoration using ResizeObserver
  useEffect(() => {
    if (isLoading || !content || scrollRestoredRef.current) return;

    const savedPos = localStorage.getItem(getScrollKey(article.id));
    if (!savedPos) {
      scrollRestoredRef.current = true;
      return;
    }

    const progress = parseFloat(savedPos);
    if (progress < 0.02 || progress > 0.98) {
      scrollRestoredRef.current = true;
      return;
    }

    const restore = () => {
      if (!containerRef.current || !contentRef.current) return;
      
      const scrollHeight = containerRef.current.scrollHeight;
      const clientHeight = containerRef.current.clientHeight;
      const totalScrollable = scrollHeight - clientHeight;

      // If we haven't rendered enough content yet to reach the target, don't mark as finished
      // Total scrollable should be reasonably large for articles
      if (totalScrollable <= 200 && content.length > 500) return; 

      const targetScroll = Math.floor(progress * totalScrollable);
      
      // Perform the scroll
      isSelfScrolling.current = true;
      containerRef.current.scrollTop = targetScroll;
      
      // Check if we reached the target (or as close as possible)
      const currentScroll = containerRef.current.scrollTop;
      const stuck = Math.abs(currentScroll - targetScroll) < 10 || (currentScroll >= totalScrollable - 5);
      
      if (stuck) {
        scrollRestoredRef.current = true;
        setIsRestoringScroll(true);
        setTimeout(() => setIsRestoringScroll(false), 3000);
        
        // Use a longer delay before letting users save again to avoid overwriting during reflows
        setTimeout(() => { 
          isSelfScrolling.current = false; 
        }, 800);
      }
    };

    // Watch for size changes (like images loading) to re-trigger scroll
    const ro = new ResizeObserver(() => {
      if (!scrollRestoredRef.current) {
        restore();
      }
    });

    if (contentRef.current) ro.observe(contentRef.current);
    
    // Initial and periodic attempts
    const timers = [
       setTimeout(restore, 100),
       setTimeout(restore, 500),
       setTimeout(restore, 1500)
    ];
    
    return () => {
      ro.disconnect();
      timers.forEach(t => clearTimeout(t));
    };
  }, [isLoading, content, article.id]);

  useMotionValueEvent(scrollYProgress, "change", (latest) => {
    // Save scroll position - only if we aren't currently restoring
    if (!isLoading && !isSelfScrolling.current && latest > 0) {
      localStorage.setItem(getScrollKey(article.id), latest.toString());
    }

    // If user reaches 99% of the article and it's unread
    if (latest >= 0.99 && article.status === 'unread' && !autoMarked.current && !isLoading) {
      autoMarked.current = true;
      handleAutoMarkAsRead();
    }
  });

  const handleAutoMarkAsRead = async () => {
    try {
      setIsLocallyRead(true);
      await onStatusChange(article.id);
    } catch (error) {
      console.error("Error auto marking as read", error);
      autoMarked.current = false; 
    }
  };

  const handleAddTag = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTag.trim()) return;
    
    const tag = newTag.trim().toLowerCase();
    if (tags.includes(tag)) {
      setNewTag('');
      setIsAddingTag(false);
      return;
    }

    const updatedTags = [...tags, tag];
    setTags(updatedTags);
    setNewTag('');
    setIsAddingTag(false);

    try {
      const updatedArticle = await api.updateArticle(article.id, { tags: updatedTags });
      onArticleUpdate?.(updatedArticle);
    } catch (error) {
      console.error("Failed to add tag", error);
    }
  };

  const handleRemoveTag = async (tagToRemove: string) => {
    const updatedTags = tags.filter(t => t !== tagToRemove);
    setTags(updatedTags);

    try {
      const updatedArticle = await api.updateArticle(article.id, { tags: updatedTags });
      onArticleUpdate?.(updatedArticle);
    } catch (error) {
      console.error("Failed to remove tag", error);
    }
  };

  const handleSelectSuggestedTag = async (tag: string) => {
    if (tags.includes(tag)) {
      setNewTag('');
      setIsAddingTag(false);
      return;
    }

    const updatedTags = [...tags, tag];
    setTags(updatedTags);
    setNewTag('');
    setIsAddingTag(false);

    try {
      const updatedArticle = await api.updateArticle(article.id, { tags: updatedTags });
      onArticleUpdate?.(updatedArticle);
    } catch (error) {
      console.error("Failed to add suggested tag", error);
    }
  };

  const markAsRead = async () => {
    try {
      await api.updateArticle(article.id, {
        status: 'read'
      });
      onClose();
    } catch (error) {
      console.error("Error marking as read", error);
    }
  };

  const memoizedMarkdownContent = useMemo(() => {
    return (
      <div className="markdown-body rich-rendering dark:prose-invert max-w-none">
        <Suspense fallback={
          <div className="animate-pulse space-y-8 py-8 w-full">
            <div className="h-6 w-[90%] bg-gray-200 dark:bg-gray-800 rounded"></div>
            <div className="h-6 w-full bg-gray-200 dark:bg-gray-800 rounded"></div>
            <div className="h-6 w-[80%] bg-gray-200 dark:bg-gray-800 rounded"></div>
            <div className="h-40 w-full bg-gray-200 dark:bg-gray-800 rounded-xl my-8"></div>
            <div className="h-6 w-[95%] bg-gray-200 dark:bg-gray-800 rounded"></div>
            <div className="h-6 w-[85%] bg-gray-200 dark:bg-gray-800 rounded"></div>
          </div>
        }>
          <MarkdownViewer content={content || ''} theme={theme} />
        </Suspense>
      </div>
    );
  }, [content, theme]);

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center sm:p-4"
    >
      <motion.div 
        initial={{ y: 20, opacity: 0, scale: 0.98 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        exit={{ y: 20, opacity: 0, scale: 0.98 }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        className="bg-white dark:bg-[#0f1115] w-full max-w-4xl h-full sm:h-[90vh] flex flex-col sm:rounded-2xl shadow-2xl overflow-hidden transition-colors"
      >
        {/* Toolbar */}
        <div className="bg-white dark:bg-[#0f1115] border-b border-gray-200 dark:border-white/5 px-4 sm:px-8 py-3 sm:py-5 flex items-center justify-between shadow-sm relative z-20">
          {/* Progress Bar */}
          <motion.div 
            className="absolute bottom-0 left-0 right-0 h-1 bg-indigo-600 origin-left z-20"
            style={{ scaleX }}
          />
          
          <div className="flex items-center gap-4">
            <button 
              onClick={onClose}
              className="p-2.5 hover:bg-gray-100 dark:hover:bg-white/5 rounded-full transition-all hover:scale-110 active:scale-95"
              title={isDailyReadMode ? "返回首页" : "关闭"}
            >
              {isDailyReadMode ? <Home className="h-5 w-5 text-slate-400" /> : <X className="h-5 w-5 text-slate-400" />}
            </button>
            <div className="h-8 w-[1px] bg-gray-100 dark:bg-white/5" />
            <div className="flex items-center gap-2 sm:gap-3">
              {isDailyReadMode && (
                <span className="bg-indigo-600 text-white px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest shadow-sm">
                  每日一读
                </span>
              )}
              <span className={cn(
                "px-2 sm:px-3 py-0.5 sm:py-1 rounded-lg text-[9px] sm:text-[10px] font-extrabold uppercase tracking-widest shadow-sm whitespace-nowrap",
                isLocallyRead ? "bg-green-50 dark:bg-green-500/10 text-green-600 dark:text-green-400 border border-green-100 dark:border-green-500/20" : "bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-500/20"
              )}>
                {isLocallyRead ? '已阅' : '正在阅读'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            {/* Search Top Bar */}
            <div className="relative flex items-center">
              <AnimatePresence>
                {isSearchOpen && (
                  <motion.div
                    initial={{ width: 0, opacity: 0 }}
                    animate={{ width: 'auto', opacity: 1 }}
                    exit={{ width: 0, opacity: 0 }}
                    className="flex items-center gap-2 overflow-hidden mr-2"
                  >
                    <div className="relative flex items-center bg-gray-100 dark:bg-white/5 rounded-lg px-2 py-1 sm:py-1.5 border border-gray-200 dark:border-white/10 w-32 sm:w-48">
                      <Search className="h-3 w-3 text-gray-500 absolute left-2.5" />
                      <input 
                        ref={searchInputRef}
                        type="text" 
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        placeholder="在文章中搜索..."
                        className="bg-transparent text-xs outline-none w-full pl-6 pr-12 text-slate-700 dark:text-slate-200"
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            if (e.shiftKey) handlePrevMatch();
                            else handleNextMatch();
                          }
                          if (e.key === 'Escape') {
                            setIsSearchOpen(false);
                            setSearchQuery('');
                          }
                        }}
                      />
                      <div className="absolute right-2 flex items-center gap-1 text-[10px] text-gray-400">
                        {searchContext.matches > 0 ? (
                          <span>{searchContext.current}/{searchContext.matches}</span>
                        ) : searchQuery ? (
                          <span>0/0</span>
                        ) : null}
                      </div>
                    </div>
                    {searchContext.matches > 0 && (
                      <div className="flex items-center bg-gray-100 dark:bg-white/5 rounded-lg border border-gray-200 dark:border-white/10">
                        <button onClick={handlePrevMatch} className="p-1 hover:bg-gray-200 dark:hover:bg-white/10 rounded-l-lg transition-colors"><ChevronUp className="h-4 w-4 text-gray-600 dark:text-gray-300" /></button>
                        <div className="w-[1px] h-4 bg-gray-300 dark:bg-white/10"></div>
                        <button onClick={handleNextMatch} className="p-1 hover:bg-gray-200 dark:hover:bg-white/10 rounded-r-lg transition-colors"><ChevronDown className="h-4 w-4 text-gray-600 dark:text-gray-300" /></button>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
              <button
                onClick={() => {
                  const toOpen = !isSearchOpen;
                  setIsSearchOpen(toOpen);
                  if (!toOpen) setSearchQuery('');
                  else setTimeout(() => searchInputRef.current?.focus(), 100);
                }}
                className={cn(
                  "p-2 rounded-xl transition-all active:scale-95",
                  isSearchOpen ? "bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400" : "bg-gray-100 dark:bg-white/5 hover:bg-gray-200 dark:hover:bg-white/10 text-gray-700 dark:text-gray-300"
                )}
                title="在文章中搜索"
              >
                <Search className="h-4 w-4" />
              </button>
            </div>

            <div className="relative">
              <button
                onClick={() => setIsExportDropdownOpen(!isExportDropdownOpen)}
                className="flex items-center gap-1.5 px-3 sm:px-4 py-1.5 sm:py-2.5 bg-gray-100 dark:bg-white/5 hover:bg-gray-200 dark:hover:bg-white/10 text-gray-700 dark:text-gray-300 rounded-lg sm:rounded-xl text-[11px] sm:text-sm font-bold transition-all active:scale-95 whitespace-nowrap"
              >
                <Download className="h-4 w-4" />
                <span className="hidden sm:inline">导出</span>
              </button>

              <AnimatePresence>
                {isExportDropdownOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    transition={{ duration: 0.15 }}
                    className="absolute right-0 top-full mt-2 w-40 bg-white dark:bg-[#1a1b1e] rounded-xl shadow-[0_10px_40px_-10px_rgba(0,0,0,0.15)] border border-gray-100 dark:border-white/10 overflow-hidden z-20"
                  >
                    <div className="p-1">
                      <button
                        onClick={handleExportMarkdown}
                        className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-indigo-50 dark:hover:bg-white/5 hover:text-indigo-600 dark:hover:text-indigo-400 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-400 transition-colors"
                      >
                        <FileText className="h-4 w-4" />
                        导出 Markdown
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {isDailyReadMode && onNext && !isLocallyRead && (
              <button 
                onClick={onNext}
                className="flex items-center gap-2 px-3 sm:px-4 py-1.5 sm:py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg sm:rounded-xl text-[11px] sm:text-sm font-bold transition-all active:scale-95 whitespace-nowrap"
              >
                <ArrowRight className="h-4 w-4" />
                换一篇
              </button>
            )}
            {onNext && isLocallyRead && (
              <motion.button 
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                onClick={onNext}
                className="flex items-center gap-2 px-3 sm:px-5 py-1.5 sm:py-2.5 bg-slate-900 hover:bg-black text-white rounded-lg sm:rounded-xl text-[11px] sm:text-sm font-bold transition-all shadow-lg active:scale-95 whitespace-nowrap"
              >
                下一篇
                <ArrowRight className="h-4 w-4" />
              </motion.button>
            )}
            {isLocallyRead ? (
              <motion.button 
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={(e) => onStatusChange(article.id, e)}
                className="flex items-center gap-2 px-3 sm:px-5 py-1.5 sm:py-2.5 bg-green-500 hover:bg-green-600 text-white rounded-lg sm:rounded-xl text-[11px] sm:text-sm font-bold transition-all shadow-lg shadow-green-100 active:scale-95 whitespace-nowrap"
              >
                <CheckCircle2 className="h-4 w-4" />
                已阅
              </motion.button>
            ) : (
              <motion.button 
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={(e) => onStatusChange(article.id, e)}
                className="flex items-center gap-2 px-3 sm:px-5 py-1.5 sm:py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg sm:rounded-xl text-[11px] sm:text-sm font-bold transition-all shadow-lg shadow-indigo-100 active:scale-95 whitespace-nowrap"
              >
                <CheckCircle2 className="h-4 w-4" />
                标记为已阅
              </motion.button>
            )}
          </div>
        </div>

        {/* Content */}
        <div 
          ref={containerRef}
          className={cn(
            "flex-1 bg-gray-50/50 dark:bg-[#0a0a0b] custom-scrollbar selection:bg-indigo-100 dark:selection:bg-indigo-500/20",
            isLoading ? "overflow-hidden" : "overflow-y-auto"
          )}
        >
          <div 
            className={cn(
              "w-full max-w-4xl mx-auto px-6 sm:px-16 py-12 sm:py-24 bg-white dark:bg-[#0f1115] min-h-full transition-colors relative",
              "before:absolute before:inset-y-0 before:left-0 before:w-1 before:bg-indigo-600/10",
              settings.fontFamily
            )}
            style={{ 
              fontSize: `${settings.fontSize}px`,
              lineHeight: settings.lineHeight
            }}
          >
            <AnimatePresence mode="wait">
              {isLoading ? (
                <motion.div 
                  key="loader"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="animate-pulse space-y-12"
                >
                  {/* Header Skeleton */}
                  <div className="space-y-6 mb-12 sm:mb-20">
                    <div className="flex items-center gap-4">
                      <div className="h-6 w-24 bg-gray-200 dark:bg-gray-800 rounded-full"></div>
                      <div className="h-6 w-32 bg-gray-200 dark:bg-gray-800 rounded-full"></div>
                    </div>
                    <div className="space-y-4">
                      <div className="h-12 w-3/4 bg-gray-200 dark:bg-gray-800 rounded-2xl"></div>
                      <div className="h-12 w-1/2 bg-gray-200 dark:bg-gray-800 rounded-2xl"></div>
                    </div>
                    <div className="flex gap-4 pt-4">
                      <div className="h-4 w-20 bg-gray-200 dark:bg-gray-800 rounded"></div>
                      <div className="h-4 w-20 bg-gray-200 dark:bg-gray-800 rounded"></div>
                    </div>
                  </div>

                  {/* Content Skeleton */}
                  <div className="space-y-8">
                    <div className="space-y-4">
                      <div className="h-5 w-full bg-gray-200 dark:bg-gray-800 rounded"></div>
                      <div className="h-5 w-[95%] bg-gray-200 dark:bg-gray-800 rounded"></div>
                      <div className="h-5 w-[90%] bg-gray-200 dark:bg-gray-800 rounded"></div>
                      <div className="h-5 w-[80%] bg-gray-200 dark:bg-gray-800 rounded"></div>
                    </div>

                    <div className="h-64 w-full bg-gray-200 dark:bg-gray-800 rounded-2xl"></div>

                    <div className="space-y-4">
                      <div className="h-5 w-[90%] bg-gray-200 dark:bg-gray-800 rounded"></div>
                      <div className="h-5 w-[95%] bg-gray-200 dark:bg-gray-800 rounded"></div>
                      <div className="h-5 w-full bg-gray-200 dark:bg-gray-800 rounded"></div>
                      <div className="h-5 w-[85%] bg-gray-200 dark:bg-gray-800 rounded"></div>
                    </div>

                    <div className="space-y-4">
                      <div className="h-5 w-[95%] bg-gray-200 dark:bg-gray-800 rounded"></div>
                      <div className="h-5 w-[80%] bg-gray-200 dark:bg-gray-800 rounded"></div>
                      <div className="h-5 w-[90%] bg-gray-200 dark:bg-gray-800 rounded"></div>
                    </div>
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="content"
                  initial={{ opacity: 0, y: 30 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                >
                  <header className="mb-12 sm:mb-20">
                    <motion.div 
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.2 }}
                      className="flex items-center gap-3 mb-6 sm:mb-8"
                    >
                       <div className="px-2 py-0.5 rounded bg-indigo-600 text-white text-[9px] font-black uppercase tracking-[0.2em] shadow-lg shadow-indigo-200">
                         {article.folderId ? 'Folder' : 'Library'}
                       </div>
                       <div className="h-px w-8 bg-gray-200 dark:bg-white/5"></div>
                       <span className="text-[10px] font-bold text-gray-400 dark:text-gray-600 uppercase tracking-[0.2em]">智能导读系统</span>
                    </motion.div>
                    <motion.h1 
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.3, duration: 0.7 }}
                      className="text-4xl sm:text-6xl font-black text-slate-900 dark:text-white leading-[1.05] mb-8 sm:mb-10 tracking-[-0.04em]"
                    >
                      {article.title}
                    </motion.h1>
                    <motion.div 
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.4 }}
                      className="flex flex-wrap items-center gap-5 sm:gap-8 text-[11px] text-gray-400 dark:text-gray-500 font-bold uppercase tracking-widest mb-10 border-b border-gray-100 dark:border-white/5 pb-8"
                    >
                      <span className="flex items-center gap-2.5 group cursor-default">
                        <Clock className="h-4 w-4 text-gray-300 group-hover:text-indigo-400 transition-colors" /> 
                        上传日期 <span className="text-slate-600 dark:text-gray-400">{formatDate(article.createdAt).split(' ')[0]}</span>
                      </span>
                      {article.updatedAt && (
                        <span className="flex items-center gap-2.5 group cursor-default">
                          <CheckCircle2 className="h-4 w-4 text-green-400" />
                          最近阅读 <span className="text-slate-600 dark:text-gray-400">{formatDate(article.updatedAt).split(' ')[0]}</span>
                        </span>
                      )}
                    </motion.div>

                    {/* Tags Section */}
                    <motion.div 
                      initial={{ opacity: 0, y: 15 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.5 }}
                      className="flex flex-wrap items-center gap-4 py-6 px-6 bg-slate-50/50 dark:bg-white/5 rounded-2xl border border-slate-100 dark:border-white/5 mb-12 group/tags"
                    >
                      <div className="flex items-center gap-1.5 text-slate-900 dark:text-white mr-3">
                        <TagIcon className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                        <span className="text-xs font-black uppercase tracking-wider">分类标签</span>
                      </div>
                      
                      <div className="flex flex-wrap items-center gap-2">
                        {tags.map(tag => (
                          <span 
                            key={tag}
                            className="group flex items-center gap-1.5 px-3.5 py-1.5 bg-indigo-50/50 dark:bg-indigo-500/10 border border-indigo-100 dark:border-indigo-500/20 text-indigo-700 dark:text-indigo-400 rounded-full text-xs font-bold hover:bg-indigo-600 hover:text-white transition-all cursor-default shadow-sm tracking-tight"
                          >
                            <Hash className="h-3.5 w-3.5 opacity-50" />
                            {tag}
                            <button 
                              onClick={() => handleRemoveTag(tag)}
                              className="opacity-0 group-hover:opacity-100 hover:text-red-200 transition-all ml-1"
                              title="删除标签"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </span>
                        ))}

                        {isAddingTag ? (
                          <div className="relative">
                            <form onSubmit={handleAddTag} className="animate-in fade-in slide-in-from-left-2 duration-300">
                              <input 
                                autoFocus
                                type="text"
                                value={newTag}
                                onChange={(e) => setNewTag(e.target.value)}
                                onFocus={() => setShowSuggestions(true)}
                                onBlur={() => {
                                  // Delay to allow suggestion click
                                  setTimeout(() => {
                                    if (!newTag) setIsAddingTag(false);
                                    setShowSuggestions(false);
                                  }, 200);
                                }}
                                className="px-4 py-1.5 bg-white dark:bg-[#1a1b1e] border-2 border-indigo-500 dark:border-indigo-400 text-indigo-700 dark:text-indigo-400 rounded-full text-xs font-bold outline-none focus:ring-4 focus:ring-indigo-100 dark:focus:ring-indigo-500/10 transition-all min-w-[140px] shadow-lg tracking-tight"
                                placeholder="输入标签名称..."
                              />
                            </form>
                            
                            {/* Tag Suggestions Dropdown */}
                            {(showSuggestions || newTag.trim()) && allTags.length > 0 && (
                              <div className="absolute top-full left-0 mt-2 bg-white dark:bg-[#1a1b1e] border border-gray-100 dark:border-white/10 rounded-2xl shadow-2xl z-30 min-w-[200px] max-h-56 overflow-y-auto py-2 animate-in fade-in zoom-in-95 duration-200 border-t-4 border-t-indigo-600 dark:border-t-indigo-400">
                                <p className="px-4 py-2 text-[10px] font-black text-gray-400 dark:text-gray-600 uppercase tracking-[0.2em] border-b border-gray-50 dark:border-white/10 mb-1">
                                  复用已有标签
                                </p>
                                {allTags
                                  .filter(t => !tags.includes(t) && (!newTag || t.includes(newTag.toLowerCase())))
                                  .map(suggestedTag => (
                                    <button
                                      key={suggestedTag}
                                      onClick={() => handleSelectSuggestedTag(suggestedTag)}
                                      className="w-full text-left px-5 py-2.5 text-xs font-bold text-slate-600 dark:text-gray-400 hover:bg-indigo-50 dark:hover:bg-white/5 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors flex items-center gap-3 group/item"
                                    >
                                      <Hash className="h-4 w-4 text-indigo-300 dark:text-indigo-600 group-hover/item:text-indigo-500" />
                                      {suggestedTag}
                                    </button>
                                  ))
                                }
                                {allTags.filter(t => !tags.includes(t) && (!newTag || t.includes(newTag.toLowerCase()))).length === 0 && (
                                  <p className="px-4 py-3 text-xs text-gray-400 italic">按回车创建新标签...</p>
                                )}
                              </div>
                            )}
                          </div>
                        ) : (
                          <button 
                            onClick={() => setIsAddingTag(true)}
                            className="flex items-center gap-2 px-4 py-1.5 bg-white dark:bg-[#1a1b1e] border-2 border-dashed border-gray-200 dark:border-white/10 text-gray-400 dark:text-gray-500 rounded-full text-xs font-bold hover:border-indigo-500 hover:text-indigo-600 hover:bg-indigo-50/30 dark:hover:bg-indigo-500/10 transition-all group shadow-sm tracking-tight"
                          >
                            <Plus className="h-4 w-4 group-hover:scale-125 transition-transform" />
                            添加标签
                          </button>
                        )}
                      </div>
                    </motion.div>
                  </header>

                  {/* Content Section */}
                  <motion.article 
                    ref={contentRef}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.6, duration: 0.8 }}
                    className="selection:bg-indigo-100 dark:selection:bg-indigo-500/30"
                  >
                    {article.type === 'markdown' ? (
                      memoizedMarkdownContent
                    ) : article.type === 'html' ? (
                      <div className="html-body rich-rendering bg-white dark:bg-[#0a0a0b] dark:text-gray-300 max-w-none">
                        <iframe 
                          srcDoc={content} 
                          className="w-full min-h-[70vh] border-0 bg-white"
                          title="HTML Preview"
                          sandbox="allow-same-origin"
                          onLoad={(e) => {
                             const iframe = e.target as HTMLIFrameElement;
                             if (iframe.contentWindow && iframe.contentDocument) {
                               iframe.style.height = iframe.contentDocument.documentElement.scrollHeight + 'px';
                             }
                          }}
                        />
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center py-20 text-gray-400 dark:text-gray-600 bg-gray-50 dark:bg-white/5 rounded-xl border-2 border-dashed border-gray-200 dark:border-white/10">
                        <FileText className="h-16 w-16 mb-4 opacity-20" />
                        <p className="text-lg font-medium">{article.type.toUpperCase()} 文件预览暂不支持</p>
                        <p className="text-sm mt-2">建议返回列表通过 PDF 阅读器打开</p>
                      </div>
                    )}
                  </motion.article>

                  {/* Next Article Footer */}
                  {onNext && isLocallyRead && (
                    <motion.div 
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.8 }}
                      className="mt-20 pt-16 border-t border-gray-100 dark:border-white/5 text-center"
                    >
                      <p className="text-[10px] font-black text-gray-400 dark:text-gray-600 uppercase tracking-[0.3em] mb-6">阅读已完成</p>
                      <h3 className="text-2xl font-bold text-slate-800 dark:text-white mb-8">继续探索下一篇？</h3>
                      <button 
                        onClick={onNext}
                        className="group relative inline-flex items-center gap-3 px-8 py-4 bg-slate-900 dark:bg-white text-white dark:text-black rounded-2xl font-bold text-lg hover:bg-black dark:hover:bg-gray-200 transition-all shadow-xl hover:shadow-indigo-500/20 dark:hover:shadow-none active:scale-95 overflow-hidden"
                      >
                        <span className="relative z-10">阅读下一篇</span>
                        <ArrowRight className="h-5 w-5 relative z-10 group-hover:translate-x-1 transition-transform" />
                        <div className="absolute inset-0 bg-indigo-600 translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
                      </button>
                    </motion.div>
                  )}

                  {isDailyReadMode && onNext && !isLocallyRead && (
                    <motion.div 
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.8 }}
                      className="mt-20 pt-16 border-t border-gray-100 dark:border-white/5 text-center"
                    >
                      <p className="text-[10px] font-black text-gray-400 dark:text-gray-600 uppercase tracking-[0.3em] mb-6">没兴趣？</p>
                      <h3 className="text-2xl font-bold text-slate-800 dark:text-white mb-8">换个内容看看</h3>
                      <button 
                        onClick={onNext}
                        className="group relative inline-flex items-center gap-3 px-8 py-4 bg-gray-100 dark:bg-white/5 text-gray-800 dark:text-gray-200 rounded-2xl font-bold text-lg hover:bg-gray-200 dark:hover:bg-white/10 transition-all shadow-md active:scale-95"
                      >
                        <span>换一篇看看</span>
                        <ArrowRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" />
                      </button>
                    </motion.div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Scroll Restoration Notification */}
        <AnimatePresence>
          {isRestoringScroll && (
            <motion.div
              initial={{ opacity: 0, y: 50 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="fixed bottom-10 left-1/2 -translate-x-1/2 z-50 bg-slate-900 dark:bg-white text-white dark:text-black px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-3 border border-slate-800 dark:border-gray-200"
            >
              <div className="flex items-center justify-center w-6 h-6 rounded-full bg-indigo-500">
                <Clock className="w-3.5 h-3.5 text-white" />
              </div>
              <span className="text-sm font-bold tracking-tight">已恢复到上次阅读位置</span>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
}
