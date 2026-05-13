export interface Folder {
  id: string;
  name: string;
  ownerId: string;
  createdAt: string;
  order?: number;
}

export interface Article {
  id: string;
  title: string;
  content: string;
  type: 'html' | 'markdown' | 'pdf' | 'docx';
  folderId?: string;
  status: 'unread' | 'read';
  tags?: string[];
  ownerId: string;
  fileName?: string;
  createdAt: string;
  updatedAt?: string;
  lastOpenedAt?: string;
}

export interface ReadingRecord {
  id: string;
  articleId: string;
  ownerId: string;
  timestamp: string;
}
