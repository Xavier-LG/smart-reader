import React, { useState, useEffect } from 'react';
import { 
  Folder as FolderIcon, 
  Plus, 
  Search, 
  FileText, 
  ChevronRight, 
  Hash, 
  Clock, 
  MoreVertical,
  Trash2,
  Edit2,
  CheckCircle2,
  Circle,
  FolderOpen,
  BookOpen,
  Moon,
  Sun,
  GripVertical,
  Settings
} from 'lucide-react';
import { Article, Folder } from '../../app/types';
import { cn } from '../../lib/utils';
import { motion, Reorder } from 'motion/react';
import { api, mockUser } from '../../lib/api';

interface SidebarProps {
  currentFolderId: string | null;
  onSelectFolder: (id: string | null) => void;
  showHistory: boolean;
  onSelectHistory: () => void;
  onDailyRead: () => void;
  isDailyReadMode?: boolean;
  searchTerm: string;
  onSearchChange: (val: string) => void;
  isOpen?: boolean;
  onClose?: () => void;
  onFileUpload: (file: File, folderId: string | null) => void;
  articles: Article[];
  folders: Folder[];
  onFoldersChange: () => void;
  onBulkMove: (ids: string[], folderId: string | null) => void;
  onNotice: (title: string, description: string, type: 'info' | 'success' | 'warning') => void;
  theme: 'light' | 'dark';
  onThemeToggle: () => void;
  onSettingsOpen: () => void;
}

export default function Sidebar({ 
  currentFolderId, 
  onSelectFolder,
  showHistory,
  onSelectHistory,
  onDailyRead,
  isDailyReadMode,
  searchTerm,
  onSearchChange,
  isOpen,
  onClose,
  onFileUpload,
  articles,
  folders,
  onFoldersChange,
  onBulkMove,
  onNotice,
  theme,
  onThemeToggle,
  onSettingsOpen
}: SidebarProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [deletingFolder, setDeletingFolder] = useState<Folder | null>(null);
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null);

  // For Reorder tracking
  const [orderedFolders, setOrderedFolders] = useState<Folder[]>([]);

  useEffect(() => {
    // Sort folders by order if priority exists, else by createdAt
    const sorted = [...folders].sort((a, b) => {
      if (a.order !== undefined && b.order !== undefined) return a.order - b.order;
      if (a.order !== undefined) return -1;
      if (b.order !== undefined) return 1;
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });
    setOrderedFolders(sorted);
  }, [folders]);

  const handleReorder = async (newOrder: Folder[]) => {
    setOrderedFolders(newOrder);
    // Persist to backend
    const updates = newOrder.map((f, index) => ({ id: f.id, order: index }));
    try {
      await api.batchUpdateFolders(updates);
      // Wait for backend to settle or just let it finish in background
    } catch (err) {
      console.error("Failed to update folder order", err);
    }
  };

  const handleDragOver = (e: React.DragEvent, id: string | null) => {
    e.preventDefault();
    setDragOverFolderId(id);
  };

  const handleDrop = (e: React.DragEvent, id: string | null) => {
    e.preventDefault();
    setDragOverFolderId(null);

    // Handle Article Drag (IDs)
    const articleIdsStr = e.dataTransfer.getData('articleIds');
    if (articleIdsStr) {
      try {
        const ids = JSON.parse(articleIdsStr);
        if (Array.isArray(ids) && ids.length > 0) {
          onBulkMove(ids, id);
          return;
        }
      } catch (err) {
        console.error("Failed to parse article IDs during drop", err);
      }
    }

    // Handle File Drop
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      onFileUpload(e.dataTransfer.files[0], id);
    }
  };

  const readCount = articles.filter(a => a.status === 'read').length;
  const totalCount = articles.length;
  const progressPercent = totalCount > 0 ? Math.round((readCount / totalCount) * 100) : 0;

  const handleAddFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;

    try {
      await api.addFolder({
        name: newFolderName,
        ownerId: mockUser.uid
      });
      setNewFolderName('');
      setIsAdding(false);
      onFoldersChange();
    } catch (error) {
      console.error("Error adding folder", error);
    }
  };

  const handleRenameFolder = async (folderId: string) => {
    if (!editingName.trim()) {
      setEditingFolderId(null);
      return;
    }

    try {
      await api.updateFolder(folderId, { name: editingName.trim() });
      setEditingFolderId(null);
      setEditingName('');
      onFoldersChange();
    } catch (error) {
      console.error("Error renaming folder", error);
      onNotice('操作失败', '文件夹重命名失败，请稍后重试。', 'warning');
    }
  };

  const handleDeleteFolderClick = (e: React.MouseEvent, folder: Folder) => {
    e.stopPropagation();
    setDeletingFolder(folder);
  };

  const confirmDeleteFolder = async () => {
    if (!deletingFolder) return;
    const folderId = deletingFolder.id;

    setDeletingFolder(null);

    try {
      await api.deleteFolder(folderId);
      onFoldersChange();
      if (currentFolderId === folderId) onSelectFolder(null);
    } catch (error) {
      console.error("Error deleting folder", error);
      onNotice('操作失败', '文件夹删除失败，请稍后重试。', 'warning');
    }
  };

  return (
    <>
      {/* Mobile Overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40 md:hidden"
          onClick={onClose}
        />
      )}
      
      <aside className={cn(
        "fixed inset-y-0 left-0 z-50 w-64 border-r h-full flex flex-col pt-8 overflow-hidden select-none transition-all duration-300 ease-in-out md:relative md:translate-x-0",
        theme === 'dark' ? "bg-[#0f0f12] border-white/5" : "bg-white border-gray-200",
        isOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="px-8 mb-8 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-slate-900 dark:bg-white rounded-xl flex items-center justify-center text-white dark:text-slate-900 shadow-lg shadow-indigo-200/20 dark:shadow-none group-hover:scale-110 transition-transform duration-300">
              <BookOpen className="h-5 w-5" />
            </div>
            <div className="flex flex-col -space-y-1">
              <span className="font-black tracking-tighter text-xl text-slate-900 dark:text-white uppercase">Smart</span>
              <span className="font-medium tracking-[0.2em] text-[10px] text-indigo-600 dark:text-indigo-400 uppercase">Reader</span>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button 
              onClick={onSettingsOpen}
              className="p-2 hover:bg-gray-100 dark:hover:bg-white/5 rounded-lg text-gray-400 transition-colors"
              title="设置 / 过滤规则"
            >
              <Settings className="h-4 w-4" />
            </button>
            <button 
              onClick={onThemeToggle}
              className="p-2 hover:bg-gray-100 dark:hover:bg-white/5 rounded-lg text-gray-400 transition-colors"
              title={theme === 'dark' ? "切换到浅色模式" : "切换到深色模式"}
            >
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            {onClose && (
              <button 
                onClick={onClose}
                className="p-1 hover:bg-gray-100 dark:hover:bg-white/5 rounded-lg md:hidden"
              >
                <ChevronRight className="h-5 w-5 text-gray-400 rotate-180" />
              </button>
            )}
          </div>
        </div>
        
        <div className="px-8 mb-8">
          <nav className="space-y-2 relative">
            <button 
              onClick={() => {
                onSelectFolder(null);
                onClose?.();
              }}
              onDragOver={(e) => handleDragOver(e, null)}
              onDragLeave={() => setDragOverFolderId(null)}
              onDrop={(e) => handleDrop(e, null)}
              className={cn(
                "w-full flex items-center gap-3 px-5 py-3.5 rounded-2xl text-sm font-black transition-all border-2 relative z-10",
                (currentFolderId === null && !showHistory && !isDailyReadMode) 
                   ? "text-indigo-700 bg-indigo-50/50 border-indigo-100/50 dark:text-indigo-400 dark:bg-indigo-500/10 dark:border-indigo-500/20 shadow-xl shadow-indigo-500/10 translate-y-[-1px]" 
                  : "bg-white dark:bg-transparent border-transparent text-gray-400 hover:bg-gray-50 dark:hover:bg-white/5 hover:text-gray-500",
                dragOverFolderId === null && currentFolderId !== null && "ring-4 ring-indigo-500/20 bg-indigo-50 dark:bg-indigo-500/10"
              )}
            >
              <FileText className={cn("h-4.5 w-4.5", (currentFolderId === null && !showHistory && !isDailyReadMode) ? "text-indigo-600 dark:text-indigo-400" : "text-gray-300 dark:text-gray-600")} />
              所有文章
              {(currentFolderId === null && !showHistory && !isDailyReadMode) && (
                <motion.div 
                  layoutId="sidebar-active"
                  className="absolute inset-0 bg-indigo-600/5 dark:bg-indigo-400/5 border-indigo-600 dark:border-indigo-400 rounded-2xl -z-10"
                  transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                />
              )}
            </button>
            <button 
              onClick={() => {
                onSelectHistory();
                onClose?.();
              }}
              className={cn(
                "w-full flex items-center gap-3 px-5 py-3.5 rounded-2xl text-sm font-black transition-all border-2 relative z-10",
                showHistory 
                  ? "text-indigo-700 bg-indigo-50/50 border-indigo-100/50 dark:text-indigo-400 dark:bg-indigo-500/10 dark:border-indigo-500/20 shadow-xl shadow-indigo-500/10 translate-y-[-1px]" 
                  : "bg-white dark:bg-transparent border-transparent text-gray-400 hover:bg-gray-50 dark:hover:bg-white/5 hover:text-gray-500 dark:hover:text-gray-300"
              )}
            >
              <Clock className={cn("h-4.5 w-4.5", showHistory ? "text-indigo-600 dark:text-indigo-400" : "text-gray-300 dark:text-gray-600")} />
              阅读历史
              {showHistory && (
                <motion.div 
                  layoutId="sidebar-active"
                  className="absolute inset-0 bg-indigo-600/5 dark:bg-indigo-400/5 border-indigo-600 dark:border-indigo-400 rounded-2xl -z-10"
                  transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                />
              )}
            </button>
            <button 
              onClick={() => {
                onDailyRead();
                onClose?.();
              }}
              className={cn(
                "w-full flex items-center gap-3 px-5 py-3.5 rounded-2xl text-sm font-black transition-all border-2 relative z-10",
                isDailyReadMode 
                  ? "text-indigo-700 bg-indigo-50/50 border-indigo-100/50 dark:text-indigo-400 dark:bg-indigo-500/10 dark:border-indigo-500/20 shadow-xl shadow-indigo-500/10 translate-y-[-1px]" 
                  : "bg-white dark:bg-transparent border-transparent text-gray-400 hover:bg-gray-50 dark:hover:bg-white/5 hover:text-gray-500 dark:hover:text-gray-300 group"
              )}
            >
              <div className={cn(
                "p-1 rounded-md shadow-sm border transition-colors",
                isDailyReadMode ? "bg-indigo-100 border-indigo-200" : "bg-white dark:bg-transparent border-gray-100 dark:border-white/10 group-hover:bg-indigo-100 dark:group-hover:bg-indigo-500/20 group-hover:border-indigo-200"
              )}>
                <div className={cn(
                  "w-2 h-2 bg-indigo-500 rounded-full",
                  !isDailyReadMode && "animate-pulse"
                )} />
              </div>
              <span className="flex-1 text-left">每日一读</span>
              <div className="px-1.5 py-0.5 rounded text-[9px] bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 font-extrabold tracking-tighter">NEW</div>
              {isDailyReadMode && (
                <motion.div 
                  layoutId="sidebar-active"
                  className="absolute inset-0 bg-indigo-600/5 dark:bg-indigo-400/5 border-indigo-600 dark:border-indigo-400 rounded-2xl -z-10"
                  transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                />
              )}
            </button>
          </nav>

        <div className="mt-10">
          <div className="flex justify-between items-center px-3 mb-4">
            <span className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest">文件夹</span>
            <button 
              onClick={() => setIsAdding(true)}
              className="text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
          
          <Reorder.Group 
            axis="y" 
            values={orderedFolders} 
            onReorder={handleReorder}
            className="space-y-1 max-h-[300px] overflow-y-auto custom-scrollbar pr-1"
          >
            {isAdding && (
              <motion.form layout initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} onSubmit={handleAddFolder} className="px-3 py-1">
                <input 
                  autoFocus
                  className="w-full px-2 py-1 text-sm border-b border-indigo-500 bg-transparent focus:outline-none dark:text-white"
                  placeholder="新文件夹..."
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  onBlur={() => !newFolderName && setIsAdding(false)}
                />
              </motion.form>
            )}

            {orderedFolders.map(folder => (
              <Reorder.Item 
                key={folder.id} 
                value={folder}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                onClick={() => {
                  if (editingFolderId === folder.id) return;
                  onSelectFolder(folder.id);
                  onClose?.();
                }}
                onDragOver={(e) => handleDragOver(e, folder.id)}
                onDragLeave={() => setDragOverFolderId(null)}
                onDrop={(e) => handleDrop(e, folder.id)}
                className={cn(
                  "group relative w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-all cursor-pointer",
                  currentFolderId === folder.id 
                    ? "text-indigo-700 dark:text-indigo-400 font-semibold bg-indigo-50/50 dark:bg-indigo-500/10" 
                    : "text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-white/5",
                  dragOverFolderId === folder.id && "ring-2 ring-indigo-500 bg-indigo-50 dark:bg-indigo-500/20"
                )}
              >
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <GripVertical className="h-3.5 w-3.5 text-gray-300 dark:text-gray-600 opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing shrink-0" />
                  
                  <div className={cn(
                    "w-1.5 h-1.5 rounded-full transition-all shrink-0",
                    currentFolderId === folder.id ? "bg-indigo-600 dark:bg-indigo-400 scale-100" : "bg-gray-200 dark:bg-gray-700 scale-10 scale-0 group-hover:scale-100"
                  )} />
                  
                  {editingFolderId === folder.id ? (
                    <input
                      autoFocus
                      className="flex-1 min-w-0 bg-transparent border-b border-indigo-500 focus:outline-none py-0 text-sm dark:text-white"
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      onBlur={() => handleRenameFolder(folder.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleRenameFolder(folder.id);
                        if (e.key === 'Escape') setEditingFolderId(null);
                      }}
                      onClick={(e) => e.stopPropagation()}
                    />
                  ) : (
                    <span 
                      className="truncate flex-1"
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        setEditingFolderId(folder.id);
                        setEditingName(folder.name);
                      }}
                    >
                      {folder.name}
                    </span>
                  )}
                </div>

                <div className="flex items-center opacity-0 group-hover:opacity-100 transition-all shrink-0">
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingFolderId(folder.id);
                      setEditingName(folder.name);
                    }}
                    className="p-1 text-gray-300 dark:text-gray-600 hover:text-indigo-500 dark:hover:text-indigo-400"
                    title="重命名"
                  >
                    <Edit2 className="h-3 w-3" />
                  </button>
                  <button 
                    onClick={(e) => handleDeleteFolderClick(e, folder)}
                    className="p-1 text-gray-300 dark:text-gray-600 hover:text-red-500"
                    title="删除"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </Reorder.Item>
            ))}
          </Reorder.Group>
        </div>

        {deletingFolder && (
          <div className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="bg-white dark:bg-[#1a1a1e] rounded-2xl p-6 w-full max-w-xs shadow-2xl text-center border border-gray-100 dark:border-white/5"
            >
              <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-2">删除文件夹？</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-6 leading-relaxed">
                删除 “<span className="font-bold text-slate-700 dark:text-white">{deletingFolder.name}</span>” 文件夹？内含文章将变为未分类。
              </p>
              <div className="flex gap-2">
                <button 
                  onClick={() => setDeletingFolder(null)}
                  className="flex-1 px-4 py-2 text-slate-500 dark:text-gray-400 text-xs font-bold rounded-lg hover:bg-gray-100 dark:hover:bg-white/5 transition-colors"
                >
                  取消
                </button>
                <button 
                  onClick={confirmDeleteFolder}
                  className="flex-1 px-4 py-2 bg-red-500 text-white rounded-lg text-xs font-bold shadow-lg shadow-red-100 dark:shadow-none hover:bg-red-600"
                >
                  确定
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </div>
      
      <div className="mt-auto p-6 bg-indigo-50 dark:bg-indigo-500/5 m-4 rounded-2xl shadow-sm border border-indigo-100/50 dark:border-indigo-500/10">
        <p className="text-xs text-indigo-700 dark:text-indigo-400 font-bold uppercase tracking-wider mb-3">阅读目标</p>
        <div className="w-full bg-indigo-200/50 dark:bg-indigo-500/20 h-2 rounded-full overflow-hidden shadow-inner">
          <motion.div 
            initial={{ width: 0 }}
            animate={{ width: `${progressPercent}%` }}
            transition={{ duration: 1, ease: "easeOut" }}
            className="bg-indigo-600 dark:bg-indigo-500 h-full rounded-full shadow-inner shadow-indigo-400"
          />
        </div>
        <p className="text-[10px] items-center flex justify-between text-indigo-600 dark:text-indigo-400 mt-2 font-semibold">
          <span>阅读进度</span>
          <span>{readCount}/{totalCount} 篇 ({progressPercent}%)</span>
        </p>
      </div>
    </aside>
    </>
  );
}
