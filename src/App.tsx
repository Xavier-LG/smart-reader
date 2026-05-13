/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useCallback, useRef, Suspense, lazy } from 'react';
import { 
  LogOut, 
  Plus, 
  FileText, 
  MoreVertical, 
  Trash2, 
  History, 
  LayoutGrid, 
  List as ListIcon, 
  Tag as TagIcon,
  Clock,
  Search,
  FolderInput,
  Loader2,
  X,
  Hash,
  CheckCircle2,
  Download,
  Shuffle,
  Settings
} from 'lucide-react';
import { Article, Folder } from './app/types';
import { formatDate, cn } from './lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { api, mockUser } from './lib/api';

import { useDataStore, useUIStore } from './app/store';
import { useThemeEffect } from './app/hooks/useThemeEffect';
import AppShellSkeleton from './components/app/AppShellSkeleton';
import GuestScreen from './components/app/GuestScreen';

const Sidebar = lazy(() => import('./components/layout/Sidebar'));
const ArticleReader = lazy(() => import('./components/reader/ArticleReader'));
const Uploader = lazy(() => import('./components/modals/Uploader'));
const MoveToFolderModal = lazy(() => import('./components/modals/MoveToFolderModal'));
const NoticeModal = lazy(() => import('./components/modals/NoticeModal'));
const SettingsModal = lazy(() => import('./components/modals/SettingsModal'));

const initialDataPromise = Promise.all([
  api.getArticles(),
  api.getFolders()
]).catch(err => {
  console.error("Initial fetch failed", err);
  return null;
});

export default function App() {
  const [user, setUser] = useState<any>(mockUser); // Using mock user for self-hosted demo
  const [isInitDataLoading, setIsInitDataLoading] = useState(true);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const {
    theme, setTheme,
    viewMode, setViewMode,
    isSidebarOpen, setIsSidebarOpen,
    isUploaderOpen, setIsUploaderOpen,
    isDailyReadMode, setIsDailyReadMode,
    readerSettings, setReaderSettings,
    noticeModal, setNoticeModal,
  } = useUIStore();

  const {
    articles, setArticles,
    folders, setFolders,
    selectedFolderId, setSelectedFolderId,
    showHistory, setShowHistory,
    searchTerm, setSearchTerm,
    statusFilter, setStatusFilter,
    timeFilter, setTimeFilter,
    currentPage, setCurrentPage,
    isRandomSort, setIsRandomSort,
    randomWeights, setRandomWeights,
    selectedArticleIds, setSelectedArticleIds,
    toggleArticleSelection, clearSelection,
    readingArticle, setReadingArticle,
    movingArticle, setMovingArticle,
    deletingArticle, setDeletingArticle,
  } = useDataStore();

  const [searchResults, setSearchResults] = useState<Article[] | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  
  const pageSize = 50;

  const fetchData = useCallback(async (useInitialCache = false) => {
    try {
      console.log(`[App] Fetching data from API... origin: ${window.location.origin}`);
      
      let fetchedArticles: Article[], fetchedFolders: Folder[];
      
      if (useInitialCache) {
        const cached = await initialDataPromise;
        if (cached) {
          [fetchedArticles, fetchedFolders] = cached as [Article[], Folder[]];
        } else {
          [fetchedArticles, fetchedFolders] = await Promise.all([
            api.getArticles(),
            api.getFolders()
          ]);
        }
      } else {
        [fetchedArticles, fetchedFolders] = await Promise.all([
          api.getArticles(),
          api.getFolders()
        ]);
      }
      
      console.log(`Fetched ${fetchedArticles.length} articles and ${fetchedFolders.length} folders`);
      setArticles(fetchedArticles);
      setFolders(fetchedFolders);
    } catch (err) {
      console.error("Failed to fetch data:", err instanceof Error ? err.message : String(err));
      // If we get specific non-JSON error from our improved api.ts
      if (err instanceof Error && err.message.includes('non-JSON response')) {
        setNoticeModal({
          isOpen: true,
          title: '服务器配置错误',
          description: 'API 请求返回了意外的 HTML 响应。这通常意味着请求了不存在的接口或服务器重启中，请刷新页面重试。',
          type: 'warning'
        });
      }
    } finally {
      setIsInitDataLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData(true);
  }, [fetchData]);

  useThemeEffect(theme);

  useEffect(() => {
    if (!searchTerm.trim()) {
      setSearchResults(null);
      setIsSearching(false);
      return;
    }

    const delayDebounceFn = setTimeout(async () => {
      setIsSearching(true);
      try {
        const results = await api.searchArticles(searchTerm);
        setSearchResults(results);
      } catch (err) {
        console.error("Search failed", err);
      } finally {
        setIsSearching(false);
      }
    }, 350);

    return () => clearTimeout(delayDebounceFn);
  }, [searchTerm]);

  const filteredArticles = useMemo(() => {
    return (searchResults || articles).filter(article => {
      // If in history mode, we only show articles that have been opened
      if (showHistory && !article.lastOpenedAt) return false;

      const matchesFolder = showHistory ? true : (selectedFolderId === null || article.folderId === selectedFolderId);
      
      // IF we have server search results, we trust them and don't re-filter by title
      // UNLESS there is no search term (in which case searchResults is null)
      const matchesSearch = searchResults 
        ? true 
        : (
            article.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (article.tags && article.tags.some(tag => tag.toLowerCase().includes(searchTerm.toLowerCase())))
          );

      const matchesStatus = statusFilter === 'all' || article.status === statusFilter;
      
      let matchesTime = true;
      if (timeFilter !== 'all') {
        const dateToCompare = showHistory ? article.lastOpenedAt : article.createdAt;
        if (!dateToCompare) return false;

        const timestamp = new Date(dateToCompare).getTime();
        const now = Date.now();
        const oneDay = 86400000;
        
        if (timeFilter === 'today') {
          matchesTime = now - timestamp < oneDay;
        } else if (timeFilter === 'week') {
          matchesTime = now - timestamp < oneDay * 7;
        } else if (timeFilter === 'month') {
          matchesTime = now - timestamp < oneDay * 30;
        }
      }

      return matchesFolder && matchesSearch && matchesStatus && matchesTime;
    });
  }, [searchResults, articles, showHistory, selectedFolderId, searchTerm, statusFilter, timeFilter]);

  // Collect all unique tags for reuse
  const allTags = useMemo(() => {
    return Array.from(new Set(
      articles.flatMap(article => article.tags || [])
    )).sort();
  }, [articles]);

  // Stable random shuffle - only changes when specifically requested
  const shuffleArticles = useCallback(() => {
    const weights: Record<string, number> = {};
    articles.forEach(article => {
      weights[article.id] = Math.random();
    });
    setRandomWeights(weights);
  }, [articles]);

  const handleToggleRandomSort = useCallback(() => {
    shuffleArticles();
    setIsRandomSort(true);
  }, [shuffleArticles]);

  // Sort articles: history mode should be sorted by lastOpenedAt desc
  const sortedArticles = useMemo(() => {
    let result = [...filteredArticles];

    if (isRandomSort) {
      // Use stable weights to prevent unexpected reshuffling on updates
      return result.sort((a, b) => (randomWeights[a.id] || 0) - (randomWeights[b.id] || 0));
    }

    return result.sort((a, b) => {
      if (showHistory) {
        return new Date(b.lastOpenedAt || 0).getTime() - new Date(a.lastOpenedAt || 0).getTime();
      }
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [filteredArticles, showHistory, isRandomSort, randomWeights]);

  // Reset pagination when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [filteredArticles, showHistory, isRandomSort]);

  const paginatedArticles = useMemo(() => {
    return sortedArticles.slice(0, currentPage * pageSize);
  }, [sortedArticles, currentPage, pageSize]);

  const totalPages = Math.ceil(sortedArticles.length / pageSize);

  const loadMoreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && currentPage < totalPages) {
        setCurrentPage(p => p + 1);
      }
    }, { threshold: 0.1 });

    if (loadMoreRef.current) {
      observer.observe(loadMoreRef.current);
    }

    return () => observer.disconnect();
  }, [currentPage, totalPages]);

  const handleDeleteArticle = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const article = articles.find(a => a.id === id);
    if (article) {
      setDeletingArticle(article);
    }
  };

  const confirmDelete = async () => {
    if (!deletingArticle) return;
    const articleId = deletingArticle.id;
    
    const previousArticles = [...articles];
    setArticles(prev => prev.filter(article => article.id !== articleId));
    setDeletingArticle(null);

    try {
      await api.deleteArticle(articleId);
      fetchData();
    } catch (err) {
      console.error("Failed to delete article", err);
      setArticles(previousArticles);
      alert('删除失败，文章已还原。请检查网络。');
    }
  };

  const handleBulkDelete = async () => {
    if (selectedArticleIds.length === 0) return;
    setIsBulkDeleting(true);
  };

  const handleBulkExportMarkdown = async () => {
    if (selectedArticleIds.length === 0) return;
    const selectedArticles = articles.filter(a => selectedArticleIds.includes(a.id));
    
    for (let index = 0; index < selectedArticles.length; index++) {
      const article = selectedArticles[index];
      try {
        let exportContent = '';
        if (article.type === 'pdf') {
           // PDF won't be exported via text download
           continue;
        }
        
        // Fetch real content
        const response = await api.getArticleContent(article.id);
        exportContent = response.content || '';

        const blob = new Blob([exportContent], { type: 'text/markdown;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        // Use title for a clean file name
        link.download = `${article.title || 'article'}.md`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        
        // Add a small delay if there are many articles to prevent browser freezing
        if (index < selectedArticles.length - 1) {
           await new Promise(r => setTimeout(r, 200));
        }
      } catch (err) {
        console.error(`Failed to export article ${article.id}:`, err);
      }
    }

    setSelectedArticleIds([]);
  };

  const confirmBulkDelete = async () => {
    const previousArticles = [...articles];
    const idsToDelete = [...selectedArticleIds];
    
    setArticles(prev => prev.filter(article => !idsToDelete.includes(article.id)));
    setSelectedArticleIds([]);
    setIsBulkDeleting(false);

    try {
      await api.batchDeleteArticles(idsToDelete);
      fetchData();
    } catch (err) {
      console.error("Failed to bulk delete articles", err);
      setArticles(previousArticles);
      setNoticeModal({
        isOpen: true,
        title: '操作失败',
        description: '批量删除失败，文章已还原。',
        type: 'warning'
      });
    }
  };

  const toggleSelectAll = () => {
    if (selectedArticleIds.length === sortedArticles.length && sortedArticles.length > 0) {
      setSelectedArticleIds([]);
    } else {
      setSelectedArticleIds(sortedArticles.map(a => a.id));
    }
  };

  const handleBulkMove = async (ids: string[], folderId: string | null) => {
    try {
      await api.batchUpdateArticles(ids, { folderId: folderId as any });
      setSelectedArticleIds([]);
      fetchData();
    } catch (err) {
      console.error("Failed to bulk move articles", err);
      setNoticeModal({
        isOpen: true,
        title: '移动失败',
        description: '批量移动文章到文件夹失败，请稍后重试。',
        type: 'warning'
      });
    }
  };

  const handleDragStart = (e: React.DragEvent, id: string) => {
    // If the article being dragged is part of a selection, drag all selected items
    const idsToDrag = selectedArticleIds.includes(id) ? selectedArticleIds : [id];
    e.dataTransfer.setData('articleIds', JSON.stringify(idsToDrag));
    e.dataTransfer.effectAllowed = 'move';
    
    // Create a ghost image/label to show we are dragging multiple
    if (idsToDrag.length > 1) {
      const dragPreview = document.createElement('div');
      dragPreview.style.padding = '8px 16px';
      dragPreview.style.background = '#4f46e5';
      dragPreview.style.color = 'white';
      dragPreview.style.borderRadius = '8px';
      dragPreview.style.fontSize = '12px';
      dragPreview.style.fontWeight = 'bold';
      dragPreview.style.position = 'absolute';
      dragPreview.style.top = '-1000px';
      dragPreview.innerText = `正在移动 ${idsToDrag.length} 篇文章`;
      document.body.appendChild(dragPreview);
      e.dataTransfer.setDragImage(dragPreview, 0, 0);
      setTimeout(() => document.body.removeChild(dragPreview), 0);
    }
  };

  const handleMoveArticle = async (articleId: string, folderId: string | null) => {
    try {
      await api.updateArticle(articleId, { folderId: folderId as any });
      setMovingArticle(null);
      fetchData();
    } catch (err) {
      console.error("Failed to move article", err);
    }
  };

  const handleOpenArticle = async (article: Article) => {
    if (article.type === 'pdf' || article.type === 'html') {
      if (article.fileName) {
        window.open(`/uploads/${article.fileName}`, '_blank');
        // Track last opened on server and update history local state
        try {
          await api.getArticleContent(article.id);
          fetchData();
        } catch (e) {
          console.error("Failed to track article view", e);
        }
      } else {
        setNoticeModal({
          isOpen: true,
          title: '文件丢失',
          description: '该文章没有关联的物理文件，无法打开。',
          type: 'warning'
        });
      }
    } else {
      setReadingArticle(article);
    }
  };

  const handleReadStatus = async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      const updatedArticle = await api.toggleArticleReadStatus(id);
      setArticles(prev => prev.map(a => a.id === id ? updatedArticle : a));
      if (readingArticle?.id === id) {
        setReadingArticle(updatedArticle);
      }
    } catch (error) {
      console.error('Failed to toggle read status:', error);
    }
  };

  const handleArticleUpdate = useCallback((updatedArticle: Article) => {
    setArticles(prev => prev.map(a => a.id === updatedArticle.id ? updatedArticle : a));
    setReadingArticle(prev => prev?.id === updatedArticle.id ? updatedArticle : prev);
  }, [setArticles, setReadingArticle]);

  const handleFileUpload = async (file: File, folderId: string | null) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      const content = e.target?.result as string;
      const extension = file.name.split('.').pop()?.toLowerCase();
      
      let type: 'html' | 'markdown' | 'pdf' | 'docx' = 'markdown';
      if (extension === 'html' || extension === 'htm') type = 'html';
      if (extension === 'pdf') type = 'pdf';
      if (extension === 'docx' || extension === 'doc') type = 'docx';
      if (extension === 'md') type = 'markdown';

      try {
        await api.addArticle({
          title: file.name.replace(/\.[^/.]+$/, ""),
          content: content,
          type: type,
          status: 'unread',
          folderId: folderId,
          tags: [],
          ownerId: mockUser.uid
        });
        fetchData();
      } catch (err) {
        console.error("Failed to upload file drop", err);
        alert('文件上传失败');
      }
    };

    if (file.name.endsWith('.md') || file.name.endsWith('.html') || file.name.endsWith('.txt')) {
      reader.readAsText(file);
    } else {
      reader.readAsDataURL(file);
    }
  };

  const handleDailyRead = async () => {
    const unreadArticles = articles.filter(a => a.status === 'unread');
    if (unreadArticles.length === 0) {
      setNoticeModal({
        isOpen: true,
        title: '书库暂空',
        description: '书库中暂无未读文章，快去上传一些吧！',
        type: 'info'
      });
      return;
    }
    const randomIndex = Math.floor(Math.random() * unreadArticles.length);
    const article = unreadArticles[randomIndex];
    
    setIsDailyReadMode(true);
    setSelectedFolderId(null);
    handleOpenArticle(article);
  };

  const handleNextDailyRead = () => {
    const unreadArticles = articles.filter(a => a.status === 'unread' && (!readingArticle || a.id !== readingArticle.id));
    if (unreadArticles.length === 0) {
      setNoticeModal({
        isOpen: true,
        title: '阅读完成',
        description: '所有未读文章已阅！去书库看看其它内容吧。',
        type: 'success'
      });
      setReadingArticle(null);
      setIsDailyReadMode(false);
      return;
    }
    const randomIndex = Math.floor(Math.random() * unreadArticles.length);
    const article = unreadArticles[randomIndex];
    handleOpenArticle(article);
  };

  const handleNextArticle = () => {
    if (isDailyReadMode) {
      handleNextDailyRead();
      return;
    }
    
    if (!readingArticle) return;
    const currentIndex = sortedArticles.findIndex(a => a.id === readingArticle.id);
    if (currentIndex !== -1 && currentIndex < sortedArticles.length - 1) {
      handleOpenArticle(sortedArticles[currentIndex + 1]);
    } else {
      handleCloseReader();
    }
  };

  const handleCloseReader = () => {
    setReadingArticle(null);
    setIsDailyReadMode(false);
  };

  const seedTestData = async () => {
    try {
      const test1: Partial<Article> = {
        title: "极简主义设计：少即是多",
        type: "markdown",
        status: "unread",
        ownerId: user.uid,
        content: `
# 极简主义设计：少即是多

极简主义不仅仅是一种审美，更是一种生活哲学。在现代信息爆炸的时代，“少”反而能带给我们“多”的感悟。

## 核心原则

1. **功能第一**：去除非必要的装饰。
2. **留白的力量**：呼吸感是设计的灵魂。
3. **质感优于数量**：选择高质量的材质与元素。

> “简单就是终极的复杂。” —— 达·芬奇
        `
      };

      const test2: Partial<Article> = {
        title: "现代建筑中的光影艺术",
        type: "html",
        status: "unread",
        ownerId: user.uid,
        content: `
          <h1>现代建筑中的光影艺术</h1>
          <p>光是建筑的第四个维度。它不仅照亮了空间，更赋予了材料以生命。在现代主义建筑大师的作品中，我们能看到光是如何被精确捕捉并转化为情感的。</p>
          <img src="https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?q=80&w=2070&auto=format&fit=crop" style="width:100%; border-radius:12px; margin:20px 0;" />
          <h3>安藤忠雄的“光之教堂”</h3>
          <p>通过极致的混凝土构造，光在这里不再是填充物，而是主体本身。十字形的切片让自然光在黑暗中刻画出神圣的一幕。</p>
        `
      };

      await Promise.all([
        api.addArticle(test1),
        api.addArticle(test2)
      ]);
      
      fetchData();
      setNoticeModal({
        isOpen: true,
        title: '导入成功',
        description: '测试数据已成功导入书库！',
        type: 'success'
      });
    } catch (err) {
      console.error(err);
    }
  };

  if (isInitDataLoading && articles.length === 0) {
    return <AppShellSkeleton />;
  }

  if (!user) {
    return <GuestScreen onEnter={() => setUser(mockUser)} />;
  }

  return (
    <div className="h-screen w-screen bg-gray-50 dark:bg-[#0a0a0b] flex overflow-hidden font-sans transition-colors duration-300">
      <Suspense fallback={null}>
        <NoticeModal 
          isOpen={noticeModal.isOpen}
          onClose={() => setNoticeModal(prev => ({ ...prev, isOpen: false }))}
          title={noticeModal.title}
          description={noticeModal.description}
          type={noticeModal.type}
        />
      </Suspense>

      <Suspense fallback={null}>
        <Sidebar 
          currentFolderId={selectedFolderId}
          onSelectFolder={(id) => {
            setSelectedFolderId(id);
            setIsDailyReadMode(false);
          }}
          showHistory={showHistory}
          onSelectHistory={() => {
            setShowHistory(true);
            setIsDailyReadMode(false);
          }}
          onDailyRead={handleDailyRead}
          isDailyReadMode={isDailyReadMode}
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
          isOpen={isSidebarOpen}
          onClose={() => setIsSidebarOpen(false)}
          onFileUpload={handleFileUpload}
          articles={articles}
          folders={folders}
          onFoldersChange={fetchData}
          onBulkMove={handleBulkMove}
          onNotice={(title, description, type) => setNoticeModal({ isOpen: true, title, description, type })}
          theme={theme}
          onThemeToggle={() => setTheme(t => t === 'light' ? 'dark' : 'light')}
          onSettingsOpen={() => setIsSettingsOpen(true)}
        />
      </Suspense>

      <main className={cn(
        "flex-1 flex flex-col min-w-0 h-full overflow-hidden transition-colors duration-500",
        theme === 'dark' ? "bg-[#0a0a0b]" : "bg-gray-50"
      )}>
        {/* Header */}
        <header className={cn(
          "h-16 md:h-20 border-b flex items-center justify-between px-4 md:px-10 flex-shrink-0 sticky top-0 z-10 shadow-[0_2px_10px_rgba(0,0,0,0.02)] transition-colors",
          theme === 'dark' ? "bg-[#0f0f12] border-white/5" : "bg-white border-gray-100"
        )}>
          <div className="flex items-center gap-3 md:gap-4 flex-1 max-w-lg">
            <button 
              onClick={() => setIsSidebarOpen(true)}
              className="p-2 hover:bg-gray-100 dark:hover:bg-white/5 rounded-lg md:hidden text-gray-400"
            >
              <MoreVertical className="h-5 w-5" />
            </button>
            
            <div className="relative w-full group">
              <span className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                {isSearching ? (
                  <Loader2 className="h-4 w-4 text-indigo-500 animate-spin" />
                ) : (
                  <Search className="h-5 w-5 text-gray-300 group-focus-within:text-indigo-500 transition-colors" />
                )}
              </span>
              <input 
                type="text" 
                className="block w-full pl-12 pr-10 py-3 border-2 border-gray-100 dark:border-white/5 rounded-2xl bg-gray-50/50 dark:bg-white/5 text-sm dark:text-white placeholder-gray-400 focus:outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-400 focus:bg-white dark:focus:bg-white/10 transition-all shadow-[0_4px_12px_rgba(0,0,0,0.03)]" 
                placeholder="搜索标题、全文内容..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              {searchTerm && (
                <button 
                  onClick={() => setSearchTerm('')}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-300 hover:text-gray-500 transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 md:gap-4 ml-4 md:ml-8">
            {selectedArticleIds.length > 0 && (
              <>
                <button 
                  onClick={handleBulkDelete}
                  className="flex items-center gap-2 bg-red-50 dark:bg-red-500/10 hover:bg-red-100 dark:hover:bg-red-500/20 text-red-600 dark:text-red-400 px-3 md:px-4 py-2 rounded-lg text-sm font-bold transition-all border border-red-100 dark:border-red-500/20 shadow-sm active:scale-95 whitespace-nowrap"
                >
                  <Trash2 className="h-4 w-4 shrink-0" />
                  <span>删除 ({selectedArticleIds.length})</span>
                </button>
                <button 
                  onClick={handleBulkExportMarkdown}
                  className="flex items-center gap-2 bg-indigo-50 dark:bg-indigo-500/10 hover:bg-indigo-100 dark:hover:bg-indigo-500/20 text-indigo-700 dark:text-indigo-400 px-3 md:px-4 py-2 rounded-lg text-sm font-bold transition-all border border-indigo-100 dark:border-indigo-500/20 shadow-sm active:scale-95 whitespace-nowrap"
                >
                  <Download className="h-4 w-4 shrink-0" />
                  <span>导出 Markdown ({selectedArticleIds.length})</span>
                </button>
              </>
            )}
            <div className="hidden sm:flex bg-gray-100/50 dark:bg-white/5 p-1 rounded-xl border border-gray-100 dark:border-white/5 shadow-inner">
              <button 
                onClick={() => setViewMode('grid')}
                className={cn("p-1.5 rounded-lg transition-all", viewMode === 'grid' ? "bg-white dark:bg-white/10 shadow-sm text-indigo-600 dark:text-indigo-400" : "text-gray-400 hover:text-gray-500")}
              >
                <LayoutGrid className="h-4.5 w-4.5" />
              </button>
              <button 
                onClick={() => setViewMode('list')}
                className={cn("p-1.5 rounded-lg transition-all", viewMode === 'list' ? "bg-white dark:bg-white/10 shadow-sm text-indigo-600 dark:text-indigo-400" : "text-gray-400 hover:text-gray-500")}
              >
                <ListIcon className="h-4.5 w-4.5" />
              </button>
            </div>

            <div className="flex items-center gap-1.5">
              <button 
                onClick={handleToggleRandomSort}
                title={isRandomSort ? "随机乱序 (点击重新打乱)" : "切换随机排列"}
                className={cn(
                  "p-1.5 rounded-lg transition-all border shadow-sm active:scale-95 flex items-center justify-center",
                  isRandomSort 
                    ? "bg-indigo-50 dark:bg-indigo-500/10 border-indigo-200 dark:border-indigo-500/30 text-indigo-600 dark:text-indigo-400 shadow-indigo-100 dark:shadow-none" 
                    : "bg-white dark:bg-white/5 border-gray-100 dark:border-white/10 text-gray-400 hover:text-indigo-500 hover:border-indigo-100 dark:hover:border-indigo-500/30"
                )}
              >
                <Shuffle className={cn("h-4.5 w-4.5", isRandomSort && "animate-pulse")} />
              </button>

              {isRandomSort && (
                <button 
                  onClick={() => setIsRandomSort(false)}
                  title="返回顺序排列"
                  className="hidden md:flex items-center gap-1.5 h-[34px] px-3.5 rounded-xl text-[10px] font-black uppercase tracking-wider text-indigo-600 bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-100 dark:border-indigo-500/20 hover:bg-indigo-100 dark:hover:bg-indigo-500/20 transition-colors shadow-sm"
                >
                  顺序显示
                </button>
              )}
            </div>

            <button 
              onClick={() => setIsUploaderOpen(true)}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-5 md:px-7 py-2.5 rounded-xl text-sm font-bold transition-all shadow-lg active:scale-95 border-b shadow-[0_4px_0_rgb(67,56,202)] dark:shadow-[0_4px_0_rgb(67,56,202)] active:shadow-none translate-y-[-2px] active:translate-y-0"
            >
              <Plus className="h-4 w-4" />
              <span className="hidden xs:inline">文章</span>
            </button>
            <button 
              onClick={() => setUser(null)}
              className="w-8 h-8 rounded-full bg-slate-100 dark:bg-white/5 flex items-center justify-center text-slate-400 hover:text-red-500 transition-colors"
              title="退出登录"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </header>

        {/* Library Content */}
        <section className="p-4 md:p-10 flex-1 overflow-hidden flex flex-col selection:bg-indigo-100 dark:selection:bg-indigo-500/20">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 gap-6">
            <div className="flex items-center gap-8">
              <motion.div layout>
                <h1 className="text-4xl font-black text-slate-800 dark:text-white tracking-tighter leading-none mb-4">
                  {showHistory ? '最近阅读' : '我的书库'}
                </h1>
                <p className="text-sm text-gray-400 dark:text-gray-500 font-bold tracking-tight">
                  {searchTerm ? (
                    <span className="flex items-center gap-2">
                      正在搜索 <span className="text-indigo-600 dark:text-indigo-400">"{searchTerm}"</span> 
                      {isSearching ? '...' : `，共 ${sortedArticles.length} 条结果`}
                    </span>
                  ) : showHistory 
                    ? `显示最近打开的 ${sortedArticles.length} 篇文章` 
                    : (
                      <>
                        {selectedFolderId && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 rounded-md mr-4 border border-indigo-100 dark:border-indigo-500/20 font-black text-xs uppercase">
                            文件夹: {folders.find(f => f.id === selectedFolderId)?.name}
                          </span>
                        )}
                        共有 {sortedArticles.length} 篇文章，已读 {sortedArticles.filter(a => a.status === 'read').length} 篇
                      </>
                    )}
                </p>
              </motion.div>

              {selectedArticleIds.length > 0 && (
                <button 
                  onClick={toggleSelectAll}
                  className={cn(
                    "h-10 px-4 flex flex-row items-center justify-center gap-2 rounded-2xl text-[13px] font-black uppercase tracking-tighter transition-all border-2",
                    selectedArticleIds.length === sortedArticles.length 
                      ? "bg-indigo-600 border-indigo-600 text-white shadow-lg shadow-indigo-200 dark:shadow-indigo-900/20" 
                      : "bg-white dark:bg-white/5 border-gray-100 dark:border-white/5 text-gray-400 hover:border-indigo-200 dark:hover:border-indigo-500/30 hover:text-indigo-600 dark:hover:text-indigo-400 shadow-sm"
                  )}
                >
                   <CheckCircle2 className={cn("h-4 w-4", selectedArticleIds.length === sortedArticles.length ? "text-indigo-200" : "text-gray-400 dark:text-gray-500")} />
                   <div>{selectedArticleIds.length === sortedArticles.length ? '取消全选' : '全部选择'}</div>
                </button>
              )}
            </div>

            <div className="flex flex-col gap-4">
              {/* Status Filter */}
            <div className="flex bg-gray-100/50 dark:bg-white/5 p-1.5 rounded-2xl border border-gray-100 dark:border-white/5 shadow-inner relative">
                {(['all', 'unread', 'read'] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => setStatusFilter(s)}
                    className={cn(
                      "px-6 py-2 rounded-xl text-xs font-black transition-all whitespace-nowrap relative z-10",
                      statusFilter === s 
                        ? "text-indigo-700 dark:text-indigo-400" 
                        : "text-gray-400 dark:text-gray-600 hover:text-gray-500"
                    )}
                  >
                    {s === 'all' ? '全部状态' : s === 'unread' ? '未读' : '已阅'}
                    {statusFilter === s && (
                      <motion.div 
                        layoutId="status-filter"
                        className="absolute inset-0 bg-white dark:bg-white/10 shadow-lg shadow-indigo-500/5 dark:shadow-none border-b-2 border-indigo-600 dark:border-indigo-400 rounded-xl -z-10"
                        transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                      />
                    )}
                  </button>
                ))}
              </div>

              {/* Time Filter */}
              <div className="flex bg-gray-100/50 dark:bg-white/5 p-1.5 rounded-2xl border border-gray-100 dark:border-white/5 shadow-inner relative">
                {(['all', 'today', 'week', 'month'] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setTimeFilter(t)}
                    className={cn(
                      "px-6 py-2 rounded-xl text-xs font-black transition-all whitespace-nowrap relative z-10",
                      timeFilter === t 
                        ? "text-indigo-700 dark:text-indigo-400" 
                        : "text-gray-400 dark:text-gray-600 hover:text-gray-500"
                    )}
                  >
                    {t === 'all' ? '全部时间' : t === 'today' ? '今天' : t === 'week' ? '本周' : '本月'}
                    {timeFilter === t && (
                      <motion.div 
                        layoutId="time-filter"
                        className="absolute inset-0 bg-white dark:bg-white/10 shadow-lg shadow-indigo-500/5 dark:shadow-none border-b-2 border-indigo-600 dark:border-indigo-400 rounded-xl -z-10"
                        transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                      />
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar">
            <AnimatePresence mode='popLayout'>
              {sortedArticles.length === 0 ? (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="h-full flex flex-col items-center justify-center"
                >
                  <div className="bg-white dark:bg-[#141417] p-12 rounded-[2rem] shadow-sm border border-gray-100 dark:border-white/5 text-center max-w-sm">
                    <div className="w-16 h-16 bg-gray-50 dark:bg-white/5 rounded-2xl flex items-center justify-center mx-auto mb-6">
                      <FileText className="h-8 w-8 text-gray-200 dark:text-gray-700" />
                    </div>
                    <p className="text-lg font-bold text-slate-600 dark:text-gray-300 mb-2">
                      {showHistory ? '暂无阅读记录' : '书库空空如也'}
                    </p>
                    <p className="text-sm text-gray-400 dark:text-gray-500 mb-8 leading-relaxed">
                      {showHistory ? '打开一篇文章开始阅读，记录将出现在这里。' : '开始上传您的第一篇文章，或者导入测试数据体验。'}
                    </p>
                    <div className="flex flex-col gap-3">
                      {!showHistory && (
                        <>
                          <button 
                            onClick={() => setIsUploaderOpen(true)}
                            className="bg-indigo-600 text-white px-6 py-2.5 rounded-xl text-sm font-bold shadow-lg shadow-indigo-100 hover:bg-indigo-700 transition-all hover:translate-y-[-1px]"
                          >
                            立即上传
                          </button>
                          <button 
                            onClick={seedTestData}
                            className="text-gray-400 hover:text-indigo-600 text-xs font-semibold py-2 transition-colors uppercase tracking-widest"
                          >
                            导入测试文章
                          </button>
                        </>
                      )}
                      {showHistory && (
                        <button 
                          onClick={() => setShowHistory(false)}
                          className="bg-indigo-600 text-white px-6 py-2.5 rounded-xl text-sm font-bold shadow-lg shadow-indigo-100 hover:bg-indigo-700 transition-all hover:translate-y-[-1px]"
                        >
                          回书库首页
                        </button>
                      )}
                    </div>
                  </div>
                </motion.div>
              ) : (viewMode === 'grid' || (typeof window !== 'undefined' && window.innerWidth <= 768)) ? (
                <motion.div 
                  layout={paginatedArticles.length < 20}
                  className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6 p-1"
                >
                  {paginatedArticles.map((article, index) => (
                      <motion.div
                        layout={paginatedArticles.length < 20}
                        key={article.id}
                        initial={{ opacity: 0, y: 20, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
                        transition={{ 
                          duration: 0.4, 
                          delay: paginatedArticles.length > 20 ? 0 : Math.min(index * 0.05, 0.3),
                          layout: { type: "spring", stiffness: 300, damping: 30 }
                        }}
                        draggable
                        onDragStart={(e) => handleDragStart(e as any, article.id)}
                        onClick={() => handleOpenArticle(article)}
                        className={cn(
                          "group bg-white dark:bg-[#0f1115] rounded-[2.5rem] p-7 border-2 transition-all cursor-pointer relative flex flex-col h-60 md:h-64 overflow-hidden",
                          selectedArticleIds.includes(article.id) 
                            ? "border-indigo-600 bg-indigo-50/20 shadow-2xl shadow-indigo-500/10 ring-4 ring-indigo-500/5 translate-y-[-4px]" 
                            : "border-gray-100 dark:border-white/5 shadow-sm hover:shadow-2xl hover:shadow-indigo-500/5 hover:translate-y-[-4px] hover:border-indigo-300 dark:hover:border-indigo-500/30",
                          "active:cursor-grabbing"
                        )}
                      >
                        <div className="flex justify-between items-start mb-4">
                          <div className="flex items-center gap-3">
                            <button 
                              onClick={(e) => { e.stopPropagation(); toggleArticleSelection(article.id); }}
                              className={cn(
                                "w-6 h-6 rounded-lg border-2 transition-all flex items-center justify-center",
                                selectedArticleIds.includes(article.id) 
                                  ? "bg-indigo-600 border-indigo-600 text-white" 
                                  : "bg-white dark:bg-white/5 border-gray-200 dark:border-white/10 text-transparent hover:border-indigo-300 dark:hover:border-indigo-500/30 shadow-sm"
                              )}
                            >
                              <CheckCircle2 className="h-3.5 w-3.5" />
                            </button>
                            <div className={cn(
                              "w-10 h-10 rounded-2xl flex items-center justify-center transition-colors shadow-sm",
                              article.status === 'read' ? "bg-gray-100 dark:bg-white/5 text-gray-400 dark:text-gray-600" : "bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400"
                            )}>
                              <FileText className="h-5 w-5" />
                            </div>
                          </div>
                          
                          <div className={cn(
                            "px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-tighter shadow-sm border",
                            article.status === 'read' ? "bg-gray-50 dark:bg-white/5 text-gray-400 dark:text-gray-600 border-gray-100 dark:border-white/5" : "bg-indigo-100 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 border-indigo-200/50 dark:border-indigo-500/30"
                          )}>
                            {article.status === 'read' ? '已阅' : '未读'}
                          </div>
                        </div>

                        <h3 className={cn(
                          "font-black text-lg md:text-xl leading-tight line-clamp-2 mb-2 group-hover:text-indigo-700 dark:group-hover:text-indigo-400 transition-colors tracking-tight",
                          article.status === 'read' ? "text-slate-400 dark:text-gray-600" : "text-slate-800 dark:text-white"
                        )}>
                          {article.title}
                        </h3>
                        <div className="flex items-center gap-1 flex-wrap justify-end mt-auto relative pb-2 group-hover:pb-1 transition-all">
                          {article.tags && article.tags.length > 0 && (
                            <div className="group/tags relative flex items-center h-6">
                              {/* Summary View */}
                              <div className="flex items-center gap-1 mr-1 transition-opacity group-hover/tags:opacity-0">
                                <span className="flex items-center gap-0.5 px-2 py-0.5 bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 rounded text-[9px] font-black uppercase tracking-tight border border-indigo-100/50 dark:border-indigo-500/20">
                                  {article.tags[0]}
                                </span>
                                {article.tags.length > 1 && (
                                  <span className="text-[9px] bg-slate-100 dark:bg-white/10 text-slate-500 dark:text-gray-400 px-1.25 py-0.5 rounded font-black">
                                    +{article.tags.length - 1}
                                  </span>
                                )}
                              </div>

                              {/* Full List View (Hover) */}
                              <div className="absolute right-0 top-0 hidden group-hover/tags:flex flex-wrap gap-1 justify-end items-center bg-white/95 dark:bg-[#1a1b1e]/95 backdrop-blur-sm p-1 rounded-lg border border-indigo-100 dark:border-indigo-500/30 shadow-xl shadow-indigo-500/10 z-10 min-w-max animate-in fade-in zoom-in-95 duration-200">
                                {article.tags.map(tag => (
                                  <span key={tag} className="flex items-center gap-0.5 px-2 py-0.5 bg-indigo-600 text-white rounded text-[9px] font-bold uppercase tracking-tight shadow-sm shadow-indigo-200">
                                    {tag}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                          {article.status === 'read' ? (
                            <button
                              onClick={(e) => handleReadStatus(article.id, e)}
                              className="bg-green-100 dark:bg-green-500/10 text-green-700 dark:text-green-400 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-tighter shadow-sm border border-green-200/50 dark:border-green-500/20 h-5 mt-0.5 flex items-center justify-center hover:bg-green-200 dark:hover:bg-green-500/20 transition-colors"
                              title="设为未读"
                            >
                              已阅
                            </button>
                          ) : (
                            <button
                              onClick={(e) => handleReadStatus(article.id, e)}
                              className="bg-slate-100 dark:bg-white/5 text-slate-400 dark:text-gray-600 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-tighter shadow-sm border border-slate-200/50 dark:border-white/5 h-5 mt-0.5 flex items-center justify-center hover:bg-indigo-50 dark:hover:bg-indigo-500/10 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                              title="设为已读"
                            >
                              未读
                            </button>
                          )}
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              setMovingArticle(article);
                            }}
                            className="md:opacity-0 group-hover:opacity-100 p-1 hover:bg-indigo-50 dark:hover:bg-white/10 hover:text-indigo-600 dark:hover:text-indigo-400 rounded-lg transition-all"
                            title="移动到文件夹"
                          >
                            <FolderInput className="h-3.5 w-3.5" />
                          </button>
                          <button 
                            onClick={(e) => handleDeleteArticle(e, article.id)}
                            className="md:opacity-0 group-hover:opacity-100 p-1 hover:bg-red-50 dark:hover:bg-red-500/10 hover:text-red-500 rounded-lg transition-all"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>

                      <div className="mt-auto pt-4 flex items-center justify-between text-[10px] text-gray-400 dark:text-gray-600 font-bold uppercase tracking-wider">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3 opacity-50" />
                          {formatDate(showHistory ? (article.lastOpenedAt || article.createdAt) : article.createdAt).split(' ')[0]}
                        </span>
                      </div>
                    </motion.div>
                  ))}
                </motion.div>
              ) : (
                <motion.div layout className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden mb-10 overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="px-6 py-4 w-10">
                          <button 
                            onClick={() => {
                              if (selectedArticleIds.length === sortedArticles.length) {
                                setSelectedArticleIds([]);
                              } else {
                                setSelectedArticleIds(sortedArticles.map(a => a.id));
                              }
                            }}
                            className={cn(
                              "w-5 h-5 rounded-md border transition-all flex items-center justify-center",
                              selectedArticleIds.length === sortedArticles.length && sortedArticles.length > 0 ? "bg-indigo-600 border-indigo-600 text-white" : "bg-gray-50 border-gray-200 text-transparent"
                            )}
                          >
                            <CheckCircle2 className="h-3 w-3" />
                          </button>
                        </th>
                        <th className="px-6 py-4 text-[11px] font-bold text-gray-400 uppercase tracking-widest w-1/2">标题</th>
                        <th className="px-6 py-4 text-[11px] font-bold text-gray-400 uppercase tracking-widest">状态</th>
                        <th className="px-6 py-4 text-[11px] font-bold text-gray-400 uppercase tracking-widest">日期</th>
                        <th className="px-6 py-4 text-[11px] font-bold text-gray-400 uppercase tracking-widest text-right">操作</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      <AnimatePresence mode="popLayout">
                        {paginatedArticles.map((article, index) => (
                          <motion.tr 
                            layout={paginatedArticles.length < 20}
                            key={article.id}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 10 }}
                            transition={{ delay: paginatedArticles.length > 20 ? 0 : Math.min(index * 0.03, 0.2) }}
                            draggable
                            onDragStart={(e) => handleDragStart(e as any, article.id)}
                            onClick={() => handleOpenArticle(article)}
                            className={cn(
                              "hover:bg-gray-50 transition-colors group cursor-pointer",
                              selectedArticleIds.includes(article.id) && "bg-indigo-50/30",
                              "active:cursor-grabbing"
                            )}
                          >
                          <td className="px-6 py-4" onClick={(e) => e.stopPropagation()}>
                             <button 
                                onClick={(e) => { e.stopPropagation(); toggleArticleSelection(article.id); }}
                                className={cn(
                                  "w-5 h-5 rounded-md border transition-all flex items-center justify-center",
                                  selectedArticleIds.includes(article.id) ? "bg-indigo-600 border-indigo-600 text-white" : "bg-gray-50 border-gray-200 text-transparent"
                                )}
                              >
                                <CheckCircle2 className="h-3 w-3" />
                              </button>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center text-gray-400 flex-shrink-0">
                                <FileText className="h-4 w-4" />
                              </div>
                              <div>
                                <p className="text-sm font-semibold text-slate-800 group-hover:text-indigo-600 transition-colors truncate max-w-md">{article.title}</p>
                                <div className="flex items-center gap-2 mt-0.5">
                                  {article.folderId && (
                                    <p className="text-[10px] text-gray-400 font-bold uppercase tracking-tighter">
                                      {(folders.find(f => f.id === article.folderId)?.name) || '文件夹'}
                                    </p>
                                  )}
                                  {article.tags && article.tags.length > 0 && (
                                    <div className="flex gap-1">
                                      {article.tags.slice(0, 3).map(tag => (
                                        <span key={tag} className="flex items-center gap-0.5 px-1 py-0.25 bg-gray-50 text-gray-400 rounded text-[8px] font-black uppercase">
                                          #{tag}
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          </td>
                           <td className="px-6 py-4">
                            <button
                              onClick={(e) => handleReadStatus(article.id, e)}
                              className={cn(
                                "inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider shadow-sm transition-colors",
                                article.status === 'read' 
                                  ? "bg-green-100 text-green-700 hover:bg-green-200" 
                                  : "bg-gray-100 text-gray-400 hover:bg-indigo-50 hover:text-indigo-600"
                              )}
                              title={article.status === 'read' ? "设为未读" : "设为已读"}
                            >
                              {article.status === 'read' ? '已阅' : '未读'}
                            </button>
                          </td>
                          <td className="px-6 py-4 text-xs text-gray-400 italic font-medium">
                            {formatDate(showHistory ? (article.lastOpenedAt || article.createdAt) : article.createdAt).split(' ')[0]}
                          </td>
                          <td className="px-6 py-4 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setMovingArticle(article);
                                }}
                                className="text-gray-300 hover:text-indigo-600 transition-colors p-2 rounded-lg hover:bg-indigo-50"
                                title="移动到文件夹"
                              >
                                <FolderInput className="h-4 w-4" />
                              </button>
                              <button 
                                onClick={(e) => handleDeleteArticle(e, article.id)}
                                className="text-gray-300 hover:text-red-500 transition-colors p-2 rounded-lg hover:bg-red-50"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </td>
                        </motion.tr>
                      ))}
                      </AnimatePresence>
                    </tbody>
                  </table>
                </motion.div>
              )}
            </AnimatePresence>

            {currentPage < totalPages && sortedArticles.length > 0 && (
              <div ref={loadMoreRef} className="flex justify-center py-8 mb-4">
                <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
              </div>
            )}
          </div>
        </section>

        <AnimatePresence>
          {isUploaderOpen && (
            <Uploader 
              onClose={() => {
                setIsUploaderOpen(false);
                fetchData();
              }} 
              folderId={selectedFolderId}
              allTags={allTags}
              folders={folders}
              onImportSuccess={(title) => {
                setNoticeModal({
                  isOpen: true,
                  title: '导入成功',
                  description: `文章《${title}》已成功从微信公众号导入！`,
                  type: 'success'
                });
              }}
            />
          )}
          {readingArticle && (
            <ArticleReader 
              article={readingArticle} 
              isDailyReadMode={isDailyReadMode}
              onClose={handleCloseReader}
              onNext={handleNextArticle}
              onStatusChange={handleReadStatus}
              onArticleUpdate={handleArticleUpdate}
              allTags={allTags}
              settings={readerSettings}
              theme={theme}
            />
          )}
          {movingArticle && (
            <MoveToFolderModal
              article={movingArticle}
              folders={folders}
              onClose={() => setMovingArticle(null)}
              onMove={handleMoveArticle}
            />
          )}
          {deletingArticle && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4"
            >
              <motion.div 
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="bg-white rounded-[2rem] p-8 w-full max-w-sm shadow-2xl text-center border border-gray-100"
              >
                <div className="w-16 h-16 bg-red-50 rounded-2xl flex items-center justify-center mx-auto mb-6">
                  <Trash2 className="h-8 w-8 text-red-500" />
                </div>
                <h3 className="text-xl font-bold text-slate-800 mb-2">确定删除文章？</h3>
                <p className="text-sm text-gray-500 mb-8 leading-relaxed">
                  文章 “<span className="font-bold text-slate-700">{deletingArticle.title}</span>” 将被永久删除，此操作不可撤销。
                </p>
                <div className="flex gap-3">
                  <button 
                    onClick={() => setDeletingArticle(null)}
                    className="flex-1 px-6 py-3 text-slate-500 text-sm font-bold rounded-xl hover:bg-gray-100 transition-colors"
                  >
                    取消
                  </button>
                  <button 
                    onClick={confirmDelete}
                    className="flex-1 px-6 py-3 bg-red-500 text-white rounded-xl text-sm font-bold shadow-lg shadow-red-100 hover:bg-red-600 transition-all active:scale-95"
                  >
                    确认删除
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
          {isBulkDeleting && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4"
            >
              <motion.div 
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="bg-white rounded-[2rem] p-8 w-full max-w-sm shadow-2xl text-center border border-gray-100"
              >
                <div className="w-16 h-16 bg-red-50 rounded-2xl flex items-center justify-center mx-auto mb-6">
                  <Trash2 className="h-8 w-8 text-red-500" />
                </div>
                <h3 className="text-xl font-bold text-slate-800 mb-2">批量删除文章？</h3>
                <p className="text-sm text-gray-500 mb-8 leading-relaxed">
                  确定要删除选中的 <span className="font-bold text-slate-700">{selectedArticleIds.length}</span> 篇文章吗？此操作不可撤销。
                </p>
                <div className="flex gap-3">
                  <button 
                    onClick={() => setIsBulkDeleting(false)}
                    className="flex-1 px-6 py-3 text-slate-500 text-sm font-bold rounded-xl hover:bg-gray-100 transition-colors"
                  >
                    取消
                  </button>
                  <button 
                    onClick={confirmBulkDelete}
                    className="flex-1 px-6 py-3 bg-red-500 text-white rounded-xl text-sm font-bold shadow-lg shadow-red-100 hover:bg-red-600 transition-all active:scale-95"
                  >
                    确认删除
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        <Suspense fallback={null}>
          {isSettingsOpen && (
            <SettingsModal 
              isOpen={isSettingsOpen}
              onClose={() => setIsSettingsOpen(false)}
            />
          )}
        </Suspense>
      </main>
    </div>
  );
}
