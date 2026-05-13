import React, { useState } from 'react';
import { Upload, X, FileText, Check, AlertCircle, Loader2, Hash, Link as LinkIcon } from 'lucide-react';
import { api, mockUser } from '../../lib/api';
import { motion, AnimatePresence } from 'motion/react';

import { Folder, Article } from '../../app/types';

interface UploaderProps {
  onClose: () => void;
  folderId: string | null;
  allTags: string[];
  folders: Folder[];
  onSuccess?: () => void;
  onImportSuccess?: (title: string) => void;
}

export default function Uploader({ onClose, folderId: initialFolderId, allTags, folders, onSuccess, onImportSuccess }: UploaderProps) {
  const [activeTab, setActiveTab] = useState<'file' | 'wechat'>('file');
  const [files, setFiles] = useState<File[]>([]);
  const [wechatUrl, setWechatUrl] = useState('');
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(initialFolderId);
  const [isProcessing, setIsProcessing] = useState(false);
  const [tagsInput, setTagsInput] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validateFileSize = (selectedFile: File) => {
    return true;
  };

  const isImageFile = (file: File) => {
    return file.type.startsWith('image/');
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const selectedFiles = Array.from(e.target.files);
      const validFiles = selectedFiles.filter(validateFileSize);
      setFiles(prev => [...prev, ...validFiles]);
      setError(null);
    }
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleUpload = async () => {
    setIsProcessing(true);
    setError(null);

    try {
      const tags = tagsInput.split(/[,，]/).map(tag => tag.trim().toLowerCase()).filter(tag => tag !== '');
      
      if (activeTab === 'file') {
        if (files.length === 0) return;

        const imageFiles = files.filter(f => isImageFile(f));
        const documentFiles = files.filter(f => !isImageFile(f));

        if (imageFiles.length > 0) {
          await api.uploadFiles(imageFiles);
        }

        if (documentFiles.length > 0) {
          const articlePromises = documentFiles.map(async (file) => {
            const extension = file.name.split('.').pop()?.toLowerCase();
            const textExtensions = ['md', 'html', 'htm', 'txt'];
            const isText = textExtensions.includes(extension || '');

            const fileContentForTextOrDataURL = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = (e) => resolve(e.target?.result as string);
              reader.onerror = () => reject(new Error(`Failed to read file ${file.name}`));
              if (isText) {
                reader.readAsText(file);
              } else {
                reader.readAsDataURL(file);
              }
            });

            if (extension === 'html' || extension === 'htm') {
              try {
                // If it's an HTML file, attempt to parse it as a WeChat article
                // The API actually saves it inside the DB and returns the created Article.
                const parsedArticle = await api.parseWeChatHtml(fileContentForTextOrDataURL, selectedFolderId);
                
                // If there are additional tags, we can patch the parsed article
                if (tags.length > 0) {
                  const newTags = [...(parsedArticle.tags || []), ...tags].filter((v, i, a) => a.indexOf(v) === i);
                  await api.updateArticle(parsedArticle.id, { tags: newTags });
                }

                // Return null so we don't save it again in batchAddArticles
                return null;
              } catch (e) {
                console.warn(`Failed to parse HTML ${file.name} as WeChat format, falling back to raw html.`, e);
              }
            }

            let type: 'html' | 'markdown' | 'pdf' | 'docx' = 'markdown';
            if (extension === 'html' || extension === 'htm') type = 'html';
            if (extension === 'pdf') type = 'pdf';
            if (extension === 'docx' || extension === 'doc') type = 'docx';
            if (extension === 'md') type = 'markdown';

            return {
              title: file.name.replace(/\.[^/.]+$/, ""),
              content: fileContentForTextOrDataURL,
              type: type,
              status: 'unread',
              folderId: selectedFolderId,
              tags: tags,
              ownerId: mockUser.uid
            } as Partial<Article>;
          });

          // Some promises might return already fully-formed Article from parseWeChatHtml, some will be Partial<Article>.
          // `batchAddArticles` accepts Partial<Article>.
          const articlesToUploadRaw = await Promise.all(articlePromises);
          const articlesToUpload = articlesToUploadRaw.filter(Boolean) as Partial<Article>[];
          if (articlesToUpload.length > 0) {
            await api.batchAddArticles(articlesToUpload);
          }
        }
      } else {
        if (!wechatUrl) throw new Error('请输入微信公众号文章链接');
        if (!wechatUrl.includes('mp.weixin.qq.com')) throw new Error('无效的微信公众号文章链接');
        
        const imported = await api.importWeChatArticle(wechatUrl, selectedFolderId);
        onImportSuccess?.(imported.title);
      }

      onSuccess?.();
      if (activeTab === 'wechat') {
        // We could pass a success message back, but for now let's just close and fetch
      }
      onClose();
    } catch (err: any) {
      if (activeTab === 'wechat') {
        setError('微信公众号文章导入失败：可能遇到了微信的安全验证机制限制。\n\n💡 解决方法：\n请在浏览器中打开文章，将其保存成HTML格式，然后再使用"文件上传"功能本地上传。');
      } else {
        setError(err.message || '上传失败，请重试。');
      }
      console.error(err);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/20 backdrop-blur-sm flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white rounded-3xl p-8 w-full max-w-md shadow-2xl border border-gray-100/50 max-h-[90vh] overflow-y-auto"
      >
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold text-slate-800 tracking-tight">添加文章</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full text-gray-400 transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tab Selection */}
        <div className="flex p-1 bg-gray-50 rounded-2xl mb-8">
          <button 
            onClick={() => setActiveTab('file')}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'file' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'
            }`}
          >
            <Upload className="h-4 w-4" />
            文件上传
          </button>
          <button 
            onClick={() => setActiveTab('wechat')}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'wechat' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'
            }`}
          >
            <LinkIcon className="h-4 w-4" />
            公众号导入
          </button>
        </div>

        {activeTab === 'file' ? (
          <div 
            className="relative border-2 border-dashed border-gray-100 bg-gray-50/50 rounded-2xl p-6 text-center flex flex-col items-center transition-all hover:border-indigo-400 hover:bg-indigo-50/10 group cursor-pointer mb-6"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                const droppedFiles = Array.from(e.dataTransfer.files);
                const validFiles = droppedFiles.filter(validateFileSize);
                setFiles(prev => [...prev, ...validFiles]);
                setError(null);
              }
            }}
          >
            <div className="bg-white p-3 rounded-2xl mb-3 shadow-sm group-hover:scale-110 transition-transform duration-300">
              <Upload className="h-6 w-6 text-indigo-500" />
            </div>
            <p className="text-sm font-bold text-slate-600">点击或拖拽文件与图片</p>
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-1">支持 HTML, MD, PDF, DOCX, 图片</p>
            <input 
              type="file" 
              multiple
              className="absolute inset-0 opacity-0 cursor-pointer"
              accept=".html,.htm,.md,.pdf,.docx,.txt,image/*"
              onChange={handleFileChange}
            />
          </div>
        ) : (
          <div className="mb-6 space-y-4">
            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 px-1">
                微信公众号文章链接
              </label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <LinkIcon className="h-4 w-4 text-gray-300 group-focus-within:text-indigo-500 transition-colors" />
                </div>
                <input 
                  type="url"
                  className="w-full pl-11 pr-4 py-3.5 bg-gray-50 border border-gray-100 rounded-xl text-sm focus:outline-none focus:ring-4 focus:ring-indigo-100 focus:border-indigo-500 focus:bg-white transition-all placeholder-gray-300"
                  placeholder="https://mp.weixin.qq.com/s/..."
                  value={wechatUrl}
                  onChange={(e) => setWechatUrl(e.target.value)}
                />
              </div>
              <p className="mt-2 text-[9px] text-gray-400 font-medium px-1">
                输入文章 URL，我们将自动提取正文并转换为 Markdown。
              </p>
            </div>
          </div>
        )}

        {files.length > 0 && activeTab === 'file' && (
          <div className="mb-6 space-y-2 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
            {files.map((f, i) => (
              <div key={i} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl group border border-transparent hover:border-indigo-100 transition-all">
                <div className="flex items-center gap-3 overflow-hidden">
                  <div className="p-2 bg-white rounded-lg shadow-sm">
                    <FileText className="h-4 w-4 text-indigo-500" />
                  </div>
                  <div className="flex flex-col overflow-hidden">
                    <span className="text-sm font-bold text-slate-700 truncate">{f.name}</span>
                    <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">{(f.size / 1024).toFixed(1)} KB</span>
                  </div>
                </div>
                <button 
                  onClick={() => removeFile(i)}
                  className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="mt-6">
          <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 px-1">
            保存至文件夹
          </label>
          <select 
            value={selectedFolderId || ''} 
            onChange={(e) => setSelectedFolderId(e.target.value || null)}
            className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl text-sm focus:outline-none focus:ring-4 focus:ring-indigo-100 focus:border-indigo-500 focus:bg-white transition-all appearance-none cursor-pointer"
          >
            <option value="">全部文章 (默认)</option>
            {folders.map(folder => (
              <option key={folder.id} value={folder.id}>{folder.name}</option>
            ))}
          </select>
        </div>

        <div className="mt-6 relative">
          <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 px-1">
            添加标签 (可选，用逗号分隔)
          </label>
          <input 
            type="text" 
            className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl text-sm focus:outline-none focus:ring-4 focus:ring-indigo-100 focus:border-indigo-500 focus:bg-white transition-all placeholder-gray-300"
            placeholder="例如: sql注入, xss攻击"
            value={tagsInput}
            onChange={(e) => {
              setTagsInput(e.target.value);
              setShowSuggestions(true);
            }}
            onFocus={() => setShowSuggestions(true)}
            onBlur={() => {
              setTimeout(() => setShowSuggestions(false), 200);
            }}
          />
          
          {/* Tag Suggestions */}
          {showSuggestions && allTags.length > 0 && (
            <div className="absolute left-0 right-0 mt-2 bg-white border border-gray-100 rounded-2xl shadow-2xl z-30 max-h-40 overflow-y-auto p-2">
              <div className="px-3 py-2 border-b border-gray-50 mb-1">
                <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest">已有标签库</p>
              </div>
              <div className="flex flex-wrap gap-2 p-1">
                {allTags.map(tag => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => {
                      const currentTags = tagsInput.split(/[,，]/).map(t => t.trim());
                      if (!currentTags.includes(tag)) {
                        const newTags = [...currentTags.filter(t => t !== ''), tag];
                        setTagsInput(newTags.join(', '));
                      }
                      setShowSuggestions(false);
                    }}
                    className="px-2.5 py-1.5 bg-indigo-50 text-indigo-600 rounded-lg text-[10px] font-bold hover:bg-indigo-600 hover:text-white transition-all flex items-center gap-1.5"
                  >
                    <Hash className="h-3 w-3" />
                    {tag}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {error && (
          <div className="mt-6 p-4 bg-red-50 border border-red-100 rounded-xl flex items-start gap-3 text-red-700 text-sm animate-in fade-in slide-in-from-top-2 duration-300">
            <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <p className="font-medium text-xs leading-relaxed">{error}</p>
          </div>
        )}

        <div className="mt-10 flex gap-3">
          <button 
            disabled={isProcessing}
            onClick={onClose}
            className="flex-1 px-4 py-3 text-slate-500 text-sm font-bold rounded-xl hover:bg-gray-100 transition-colors"
          >
            取消
          </button>
          <button 
            disabled={(activeTab === 'file' ? files.length === 0 : !wechatUrl) || isProcessing}
            onClick={handleUpload}
            className="flex-1 px-6 py-3 bg-indigo-600 text-white rounded-xl text-sm font-bold shadow-lg shadow-indigo-100 hover:bg-indigo-700 transition-all active:scale-95 disabled:opacity-30 disabled:grayscale disabled:scale-100 flex items-center justify-center gap-2"
          >
            {isProcessing ? (
              <Loader2 className="h-4 w-4 animate-spin text-white/50" />
            ) : (
              <Check className="h-4 w-4" />
            )}
            {isProcessing ? '正在处理...' : activeTab === 'file' ? `上传 ${files.filter(f => !isImageFile(f)).length}文件 ${files.filter(f => isImageFile(f)).length}图片` : '开始转换'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
