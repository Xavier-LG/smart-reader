// Simple API service for local server
import { Article, Folder } from '../app/types';

const BASE_URL = '/api';

export interface ProxySettings {
  enabled: boolean;
  url: string;
}

async function safeFetch(url: string, options: RequestInit = {}) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), 60000); // 60s timeout
  
  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    
    clearTimeout(id);
    
    if (!res.ok && res.status !== 204) {
      const text = await res.text();
      let errorMsg = `API Error: ${res.status} ${res.statusText}`;
      try {
        const json = JSON.parse(text);
        if (json.error) {
          errorMsg = json.error;
        }
      } catch (e) {
        // Not a JSON
      }
      
      // Don't pollute console for known handled application errors (like 422)
      if (res.status !== 422) {
        console.error(`[API] Error response (${res.status}) from ${url}: ${text.substring(0, 500)}`);
      }
      
      throw new Error(errorMsg);
    }

    if (res.status === 204) return null;

    const contentType = res.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      const text = await res.text();
      // If we get HTML, it's likely a 404 handled by the SPA router or a server error
      if (text.includes('<!DOCTYPE html>') || text.includes('<html')) {
         console.error(`[API] Received HTML instead of JSON from ${url}. Check if the endpoint exists.`);
         throw new Error(`API returned HTML (likely 404 or SPA fallback) from ${url}`);
      }
      console.error(`[API] Expected JSON but got ${contentType} from ${url}. Body sample: ${text.substring(0, 100)}`);
      throw new Error(`API returned non-JSON response from ${url}: ${contentType}`);
    }

    return res.json();
  } catch (err: any) {
    clearTimeout(id);
    if (err.name === 'AbortError') {
      console.error(`[API] Request timed out: ${url}`);
      throw new Error(`API Timeout (60s) on ${url}`);
    }
    
    // Generic fetch error (usually network connectivity or CORS)
    if (err.message === 'Failed to fetch') {
      console.error(`[API] Network error: Failed to fetch ${url}. Check if the server is running and accessible at ${window.location.origin}`);
    }
    
    throw err;
  }
}

export const api = {
  async getProxySettings(): Promise<ProxySettings> {
    return await safeFetch(`${BASE_URL}/settings/proxy`);
  },

  async updateProxySettings(settings: ProxySettings): Promise<ProxySettings> {
    return await safeFetch(`${BASE_URL}/settings/proxy`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    });
  },

  // Articles
  async getArticles(retries = 3): Promise<Article[]> {
    try {
      return await safeFetch(`${BASE_URL}/articles`);
    } catch (err) {
      if (retries > 0) {
        console.warn(`[API] getArticles failed, retrying... (${retries} left)`, err);
        await new Promise(r => setTimeout(r, 2000));
        return this.getArticles(retries - 1);
      }
      throw err;
    }
  },

  async searchArticles(query: string): Promise<Article[]> {
    return await safeFetch(`${BASE_URL}/search?q=${encodeURIComponent(query)}`);
  },

  async getArticleContent(id: string): Promise<{ content: string; isUrl?: boolean }> {
    return await safeFetch(`${BASE_URL}/articles/${id}/content`);
  },
  
  async toggleArticleReadStatus(id: string): Promise<Article> {
    return await safeFetch(`${BASE_URL}/articles/${id}/toggle-read`, {
      method: 'POST',
    });
  },
  
  async addArticle(article: Partial<Article>): Promise<Article> {
    return await safeFetch(`${BASE_URL}/articles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(article),
    });
  },

  async batchAddArticles(articles: Partial<Article>[]): Promise<Article[]> {
    return await safeFetch(`${BASE_URL}/articles/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ articles }),
    });
  },
  
  async updateArticle(id: string, updates: Partial<Article>): Promise<Article> {
    return await safeFetch(`${BASE_URL}/articles/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
  },
  
  async deleteArticle(id: string): Promise<void> {
    await safeFetch(`${BASE_URL}/articles/${id}`, { method: 'DELETE' });
  },

  async batchDeleteArticles(ids: string[]): Promise<void> {
    await safeFetch(`${BASE_URL}/articles/batch-delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    });
  },

  async batchUpdateArticles(ids: string[], updates: Partial<Article>): Promise<void> {
    await safeFetch(`${BASE_URL}/articles/batch-update`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids, updates }),
    });
  },

  // Folders
  async getFolders(retries = 3): Promise<Folder[]> {
    try {
      return await safeFetch(`${BASE_URL}/folders`);
    } catch (err) {
      if (retries > 0) {
        console.warn(`[API] getFolders failed, retrying... (${retries} left)`, err);
        await new Promise(r => setTimeout(r, 2000));
        return this.getFolders(retries - 1);
      }
      throw err;
    }
  },
  
  async addFolder(folder: Partial<Folder>): Promise<Folder> {
    return await safeFetch(`${BASE_URL}/folders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(folder),
    });
  },
  
  async deleteFolder(id: string): Promise<void> {
    await safeFetch(`${BASE_URL}/folders/${id}`, { method: 'DELETE' });
  },
  
  async updateFolder(id: string, updates: Partial<Folder>): Promise<Folder> {
    return await safeFetch(`${BASE_URL}/folders/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
  },

  async batchUpdateFolders(updates: { id: string; order: number }[]): Promise<void> {
    await safeFetch(`${BASE_URL}/folders/batch-update`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ updates }),
    });
  },

  async importWeChatArticle(url: string, folderId: string | null = null): Promise<Article> {
    return await safeFetch(`${BASE_URL}/articles/import-wechat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, folderId })
    });
  },

  async parseWeChatHtml(html: string, folderId: string | null = null): Promise<Article> {
    return await safeFetch(`${BASE_URL}/articles/parse-html`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ html, folderId })
    });
  },

  async uploadFiles(files: File[]): Promise<{ files: { filename: string; path: string }[] }> {
    const formData = new FormData();
    files.forEach(file => {
      formData.append('files', file);
    });

    const res = await fetch(`${BASE_URL}/upload-files`, {
      method: 'POST',
      body: formData,
    });

    if (!res.ok) {
      throw new Error('Failed to upload files');
    }

    return res.json();
  }
};

// Mock Auth logic
export const mockUser = {
  uid: 'local-user-id',
  email: 'user@example.com',
  displayName: 'Local User'
};
