import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Article, Folder } from './types';

interface UIState {
  theme: 'light' | 'dark';
  setTheme: (theme: 'light' | 'dark' | ((prev: 'light' | 'dark') => 'light' | 'dark')) => void;
  viewMode: 'grid' | 'list';
  setViewMode: (mode: 'grid' | 'list') => void;
  isSidebarOpen: boolean;
  setIsSidebarOpen: (isOpen: boolean) => void;
  isUploaderOpen: boolean;
  setIsUploaderOpen: (isOpen: boolean) => void;
  isDailyReadMode: boolean;
  setIsDailyReadMode: (isDaily: boolean) => void;
  readerSettings: {
    fontSize: number;
    lineHeight: number;
    fontFamily: string;
  };
  setReaderSettings: (settings: any) => void;
  noticeModal: {
    isOpen: boolean;
    title: string;
    description: string;
    type?: 'info' | 'success' | 'warning';
  };
  setNoticeModal: (modal: any | ((prev: any) => any)) => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      theme: typeof window !== 'undefined' ? (localStorage.getItem('theme') as 'light' | 'dark' | null) || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : 'light',
      setTheme: (updater) => set((state) => ({ theme: typeof updater === 'function' ? updater(state.theme) : updater })),
      viewMode: 'grid',
      setViewMode: (viewMode) => set({ viewMode }),
      isSidebarOpen: false,
      setIsSidebarOpen: (isSidebarOpen) => set({ isSidebarOpen }),
      isUploaderOpen: false,
      setIsUploaderOpen: (isUploaderOpen) => set({ isUploaderOpen }),
      isDailyReadMode: false,
      setIsDailyReadMode: (isDailyReadMode) => set({ isDailyReadMode }),
      readerSettings: typeof window !== 'undefined' && localStorage.getItem('readerSettings') 
        ? JSON.parse(localStorage.getItem('readerSettings')!) 
        : {
            fontSize: 18,
            lineHeight: 1.6,
            fontFamily: 'font-reader-sans'
          },
      setReaderSettings: (readerSettings) => set({ readerSettings }),
      noticeModal: {
        isOpen: false,
        title: '',
        description: ''
      },
      setNoticeModal: (updater) => set((state) => ({ noticeModal: typeof updater === 'function' ? updater(state.noticeModal) : updater })),
    }),
    {
      name: 'ui-storage',
      partialize: (state) => ({ 
        theme: state.theme, 
        viewMode: state.viewMode, 
        readerSettings: state.readerSettings 
      }),
    }
  )
);

interface DataState {
  articles: Article[];
  setArticles: (articles: Article[] | ((prev: Article[]) => Article[])) => void;
  folders: Folder[];
  setFolders: (folders: Folder[]) => void;
  selectedFolderId: string | null;
  setSelectedFolderId: (id: string | null) => void;
  showHistory: boolean;
  setShowHistory: (show: boolean) => void;
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  statusFilter: 'all' | 'read' | 'unread';
  setStatusFilter: (filter: 'all' | 'read' | 'unread') => void;
  timeFilter: 'all' | 'today' | 'week' | 'month';
  setTimeFilter: (filter: 'all' | 'today' | 'week' | 'month') => void;
  currentPage: number;
  setCurrentPage: (page: number | ((prev: number) => number)) => void;
  isRandomSort: boolean;
  setIsRandomSort: (random: boolean) => void;
  randomWeights: Record<string, number>;
  setRandomWeights: (weights: Record<string, number>) => void;
  
  // Selection
  selectedArticleIds: string[];
  setSelectedArticleIds: (ids: string[] | ((prev: string[]) => string[])) => void;
  toggleArticleSelection: (id: string) => void;
  clearSelection: () => void;
  
  // Interactions
  readingArticle: Article | null;
  setReadingArticle: (article: Article | null) => void;
  movingArticle: Article | null;
  setMovingArticle: (article: Article | null) => void;
  deletingArticle: Article | null;
  setDeletingArticle: (article: Article | null) => void;
}

export const useDataStore = create<DataState>()(
  persist(
    (set, get) => ({
      articles: [],
      setArticles: (updater) => set((state) => ({ articles: typeof updater === 'function' ? updater(state.articles) : updater })),
      folders: [],
      setFolders: (folders) => set({ folders }),
      
      selectedFolderId: null,
      setSelectedFolderId: (selectedFolderId) => set({ selectedFolderId, showHistory: false, currentPage: 1 }),
      
      showHistory: false,
      setShowHistory: (showHistory) => set({ showHistory, selectedFolderId: null, currentPage: 1 }),
      
      searchTerm: '',
      setSearchTerm: (searchTerm) => set({ searchTerm, currentPage: 1 }),
      
      statusFilter: 'all',
      setStatusFilter: (statusFilter) => set({ statusFilter, currentPage: 1 }),
      
      timeFilter: 'all',
      setTimeFilter: (timeFilter) => set({ timeFilter, currentPage: 1 }),
      
      currentPage: 1,
      setCurrentPage: (updater) => set((state) => ({ currentPage: typeof updater === 'function' ? updater(state.currentPage) : updater })),
      
      isRandomSort: false,
      setIsRandomSort: (isRandomSort) => set({ isRandomSort, currentPage: 1 }),
      
      randomWeights: {},
      setRandomWeights: (randomWeights) => set({ randomWeights }),
      
      selectedArticleIds: [],
      setSelectedArticleIds: (updater) => set((state) => ({ selectedArticleIds: typeof updater === 'function' ? updater(state.selectedArticleIds) : updater })),
      toggleArticleSelection: (id) => set((state) => {
        const isSelected = state.selectedArticleIds.includes(id);
        return {
          selectedArticleIds: isSelected 
            ? state.selectedArticleIds.filter(a => a !== id)
            : [...state.selectedArticleIds, id]
        };
      }),
      clearSelection: () => set({ selectedArticleIds: [] }),
      
      readingArticle: null,
      setReadingArticle: (readingArticle) => set({ readingArticle }),
      
      movingArticle: null,
      setMovingArticle: (movingArticle) => set({ movingArticle }),
      
      deletingArticle: null,
      setDeletingArticle: (deletingArticle) => set({ deletingArticle }),
    }),
    {
      name: 'data-storage',
      partialize: (state) => ({ 
        randomWeights: state.randomWeights 
      }),
    }
  )
);
