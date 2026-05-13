import React from 'react';
import { X, Folder as FolderIcon, Hash, ChevronRight } from 'lucide-react';
import { Article, Folder } from '../../app/types';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../../lib/utils';

interface MoveToFolderModalProps {
  article: Article;
  folders: Folder[];
  onClose: () => void;
  onMove: (articleId: string, folderId: string | null) => void;
}

export default function MoveToFolderModal({ 
  article, 
  folders, 
  onClose, 
  onMove 
}: MoveToFolderModalProps) {
  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[60] bg-black/30 backdrop-blur-sm flex items-center justify-center p-4"
    >
      <motion.div 
        initial={{ scale: 0.95, y: 10 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.95, y: 10 }}
        className="bg-white w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden flex flex-col"
      >
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-bold text-slate-800 tracking-tight">移动文章</h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg text-gray-400">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-2 max-h-[400px] overflow-y-auto custom-scrollbar">
          <div className="px-4 py-3 mb-2">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">正在移动</p>
            <p className="text-sm font-semibold text-slate-700 truncate">{article.title}</p>
          </div>

          <div className="space-y-1">
            <button
              onClick={() => onMove(article.id, null)}
              className={cn(
                "w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all group",
                article.folderId === null ? "bg-indigo-50 text-indigo-700" : "hover:bg-gray-50 text-gray-600"
              )}
            >
              <div className="w-8 h-8 rounded-lg bg-gray-100 text-gray-400 flex items-center justify-center group-hover:bg-indigo-100 group-hover:text-indigo-600 transition-colors">
                <Hash className="h-4 w-4" />
              </div>
              <span className="flex-1 text-left">未分类 (根目录)</span>
              {article.folderId === null && <div className="w-1.5 h-1.5 rounded-full bg-indigo-600" />}
            </button>

            {folders.map(folder => (
              <button
                key={folder.id}
                onClick={() => onMove(article.id, folder.id)}
                className={cn(
                  "w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all group",
                  article.folderId === folder.id ? "bg-indigo-50 text-indigo-700" : "hover:bg-gray-50 text-gray-600"
                )}
              >
                <div className="w-8 h-8 rounded-lg bg-gray-100 text-gray-400 flex items-center justify-center group-hover:bg-indigo-100 group-hover:text-indigo-600 transition-colors">
                  <FolderIcon className="h-4 w-4" />
                </div>
                <span className="flex-1 text-left truncate">{folder.name}</span>
                {article.folderId === folder.id && <div className="w-1.5 h-1.5 rounded-full bg-indigo-600" />}
              </button>
            ))}
          </div>
        </div>

        <div className="p-4 bg-gray-50 border-t border-gray-100 text-center">
          <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">
            点击下方文件夹以立即移动
          </p>
        </div>
      </motion.div>
    </motion.div>
  );
}
