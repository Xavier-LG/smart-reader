import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import { nanoid } from 'nanoid';
import fs from 'fs';
import cors from 'cors';
import morgan from 'morgan';
import multer from 'multer';
import { convertWeChatToMarkdown, parseWeChatHtml } from './src/lib/wechatConverter.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Local data structures
interface Article {
  id: string;
  title: string;
  content: string;
  type: string;
  status: string;
  folderId: string | null;
  ownerId: string;
  createdAt: string;
  updatedAt?: string;
}

interface Folder {
  id: string;
  name: string;
  ownerId: string;
  createdAt: string;
  order?: number;
}

interface ProxySettings {
  enabled: boolean;
  url: string;
}

// Simple JSON file DB
const DB_FILE = path.join(process.cwd(), 'data', 'db.json');
const UPLOADS_DIR = path.join(process.cwd(), 'uploads');

// Cache DB in memory
let dbCache: any = null;

// Memory log for debugging
const logs: string[] = [];
const log = (msg: string) => {
  const entry = `${new Date().toISOString()} - ${msg}`;
  console.log(entry);
  logs.push(entry);
  if (logs.length > 100) logs.shift();
};

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const DATA_DIR = path.join(process.cwd(), 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readDB() {
  if (dbCache) return dbCache;
  if (!fs.existsSync(DB_FILE)) {
    dbCache = { articles: [], folders: [], settings: { proxy: { enabled: false, url: '' } } };
    return dbCache;
  }
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf-8').trim();
    if (!raw) {
       dbCache = { articles: [], folders: [], settings: { proxy: { enabled: false, url: '' } } };
       return dbCache;
    }
    const data = JSON.parse(raw);
    if (!data.articles) data.articles = [];
    if (!data.folders) data.folders = [];
    if (!data.settings) data.settings = {};
    if (!data.settings.proxy) data.settings.proxy = { enabled: false, url: '' };
    dbCache = data;
    return data;
  } catch (e) {
    log(`Failed to parse DB file: ${e}`);
    dbCache = { articles: [], folders: [], settings: { proxy: { enabled: false, url: '' } } };
    return dbCache;
  }
}

function getProxySettings(): ProxySettings {
  const db = readDB();
  return {
    enabled: Boolean(db.settings?.proxy?.enabled),
    url: typeof db.settings?.proxy?.url === 'string' ? db.settings.proxy.url : ''
  };
}

function writeDB(data: any) {
  dbCache = data;
  try {
    // Atomic-like write: write to temp and rename is safer, but for this size writeFileSync is usually enough 
    // to avoid truncation race conditions with readFileSync in the same Node process.
    const tempFile = `${DB_FILE}.tmp`;
    fs.writeFileSync(tempFile, JSON.stringify(data, null, 2));
    fs.renameSync(tempFile, DB_FILE);
  } catch (err) {
    console.error("Failed to write to DB file:", err);
  }
}

// Simple content cache for search performance
const contentCache = new Map<string, { content: string, mtime: number }>();

function getFileContent(fileName: string) {
  const filePath = path.join(UPLOADS_DIR, fileName);
  try {
    const stats = fs.statSync(filePath);
    const cached = contentCache.get(fileName);
    
    if (cached && cached.mtime === stats.mtimeMs) {
      return cached.content;
    }
    
    const content = fs.readFileSync(filePath, 'utf-8');
    contentCache.set(fileName, { content, mtime: stats.mtimeMs });
    return content;
  } catch (e) {
    return null;
  }
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT || 3000);
  const HOST = process.env.HOST || '0.0.0.0';
  const viteWarmupFiles = [
    '/src/main.tsx',
    '/src/App.tsx',
    '/src/index.css',
    '/src/components/layout/Sidebar.tsx',
    '/src/components/modals/Uploader.tsx',
    '/src/components/modals/NoticeModal.tsx',
    '/src/components/modals/SettingsModal.tsx'
  ];
  console.log(`[Server] Starting in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
  console.log(`[Server] Current Working Directory: ${process.cwd()}`);

  // Initialize DB
  readDB();

  // Middleware to log EVERY request for debugging
  app.use((req, res, next) => {
    log(`${req.method} ${req.url} (Origin: ${req.headers.origin || 'none'})`);
    next();
  });

  app.get('/health', (req, res) => res.json({ status: 'ok' }));

  app.use(express.json({ limit: '100mb' }));
  app.use(cors());
  app.use(morgan('dev'));

  app.get('/api/debug/logs', (req, res) => {
    res.json({ logs });
  });

  app.get('/api/debug', (req, res) => {
    res.json({ 
      message: "Debug endpoint reached", 
      dbArticles: readDB().articles.length,
      env: process.env.NODE_ENV,
      port: PORT,
      cwd: process.cwd()
    });
  });

  // Serve static files from uploads directory
  app.use('/uploads', express.static(UPLOADS_DIR));

  // Helper to sync filesystem with DB - optimized to run less frequently or on demand
  const syncArticlesWithFiles = () => {
    const db = readDB();
    if (!fs.existsSync(UPLOADS_DIR)) return;
    
    const files = fs.readdirSync(UPLOADS_DIR);
    let changed = false;

    // Indexes for matching
    const articlesById = new Map(db.articles.map((a: any) => [a.id, a]));
    const articlesByFileName = new Map(db.articles.map((a: any) => [a.fileName, a]));
    // We clean titles for matching (strip _ID if present)
    const articlesByCleanTitle = new Map();
    db.articles.forEach((a: any) => {
      const clean = a.title.split('_').length > 1 && a.title.endsWith(a.id) 
        ? a.title.substring(0, a.title.length - a.id.length - 1)
        : a.title;
      if (!articlesByCleanTitle.has(clean)) articlesByCleanTitle.set(clean, a);
    });

    const processedFileNames = new Set();

    // 1. Check current files on disk
    files.forEach(file => {
      const ext = path.extname(file).toLowerCase();
      if (ext !== '.md' && ext !== '.html' && ext !== '.pdf' && ext !== '.docx') return;
      
      processedFileNames.add(file);
      
      // If file already correctly mapped to an article we know about, skip
      if (articlesByFileName.has(file)) {
        // Heal polluted title if necessary even for correctly mapped files
        const article: any = articlesByFileName.get(file);
        if (article.title.endsWith('_' + article.id)) {
           article.title = article.title.substring(0, article.title.length - article.id.length - 1);
           changed = true;
        }
        return;
      }

      // Format expected: safeTitle_ID.ext
      const rawTitle = file.substring(0, file.length - ext.length);
      const idMatch = rawTitle.match(/(.+)_([a-zA-Z0-9_-]{10,})$/);
      
      let candidateId = idMatch ? idMatch[2] : null;
      let originalTitle = idMatch ? idMatch[1] : rawTitle;
      
      // Attempt to heal: 
      // 1. Try to find by candidateId extracted from filename
      let existingArticle: any = candidateId ? articlesById.get(candidateId) : null;
      
      // 2. If not found by ID, try by exact current filename (maybe changed in previous turn?)
      if (!existingArticle) {
        existingArticle = db.articles.find((a: any) => a.fileName === file);
      }
      
      // 3. Fallback: try title match
      if (!existingArticle) {
        existingArticle = articlesByCleanTitle.get(originalTitle);
      }
      
      if (existingArticle) {
        // Heal mapping
        log(`Healing article: "${existingArticle.title}" (ID: ${existingArticle.id}) -> file ${file}`);
        existingArticle.fileName = file;
        
        // Ensure title is clean
        if (existingArticle.title.endsWith('_' + existingArticle.id)) {
           existingArticle.title = originalTitle;
        }
        
        changed = true;
      } else {
        // New file entirely
        const id = candidateId || nanoid(10);
        let type = 'markdown';
        if (ext === '.html') type = 'html';
        if (ext === '.pdf') type = 'pdf';
        if (ext === '.docx') type = 'docx';

        log(`New file discovered: ${file} (Assigned ID: ${id})`);
        db.articles.push({
          id,
          title: originalTitle,
          type: type,
          status: 'unread',
          ownerId: 'manual-user',
          fileName: file,
          tags: [],
          folderId: null,
          createdAt: new Date().toISOString()
        });
        changed = true;
      }
    });

    // 2. Mark DB entries as missing if files no longer exist
    db.articles.forEach((article: any) => {
      if (!article.fileName) return; // Keep manual entries with no file
      const fileExistsOnDisk = processedFileNames.has(article.fileName);
      
      if (!fileExistsOnDisk) {
        if (!article.isMissing) {
          log(`Article file missing: ${article.fileName}`);
          article.isMissing = true;
          changed = true;
        }
      } else {
        if (article.isMissing) {
          article.isMissing = false;
          changed = true;
        }
      }
    });

    if (changed) {
      writeDB(db);
    }
  };

  // Run sync asynchronously to not block startup
  setTimeout(() => {
    try {
      console.log(`${new Date().toISOString()} - Starting background sync...`);
      syncArticlesWithFiles();
      console.log(`${new Date().toISOString()} - Background sync completed`);
    } catch (err) {
      console.error("Background sync failed:", err);
    }
  }, 2000);

  // Improved article creation logic helper
  const createArticleEntry = (articleData: any) => {
    const id = nanoid(10);
    const title = String(articleData.title || 'Untitled');
    const safeTitle = title.replace(/[^a-z0-9\u4e00-\u9fa5]/gi, '_').toLowerCase();
    
    let type = articleData.type || 'markdown';
    let ext = 'txt';
    if (type === 'markdown') ext = 'md';
    else if (type === 'html') ext = 'html';
    else if (type === 'pdf') ext = 'pdf';
    else if (type === 'docx') ext = 'docx';

    const fileName = `${safeTitle}_${id}.${ext}`;
    const filePath = path.join(UPLOADS_DIR, fileName);
    
    // Handle content (detect base64)
    let content = articleData.content || '';
    if (typeof content === 'string' && content.startsWith('data:')) {
      const parts = content.split(',');
      if (parts.length > 1) {
        const base64Data = parts[1];
        fs.writeFileSync(filePath, Buffer.from(base64Data, 'base64'));
      } else {
        fs.writeFileSync(filePath, content);
      }
    } else {
      fs.writeFileSync(filePath, content);
    }

    return {
      id,
      title: title,
      type: type,
      status: articleData.status || 'unread',
      folderId: articleData.folderId || null,
      ownerId: articleData.ownerId || 'local-user',
      tags: Array.isArray(articleData.tags) ? articleData.tags : [],
      fileName: fileName,
      createdAt: new Date().toISOString()
    };
  };

  // API Routes Router
  const apiRouter = express.Router();

  apiRouter.get('/health', (req, res) => {
    const db = readDB();
    res.json({ 
      status: 'ok', 
      timestamp: new Date().toISOString(),
      stats: {
        articles: db.articles.length,
        folders: db.folders.length,
        missing: db.articles.filter((a: any) => a.isMissing).length
      }
    });
  });

  apiRouter.get('/debug', (req, res) => {
    res.json({ message: "Debug endpoint reached", dbArticles: readDB().articles.length });
  });

  apiRouter.get('/settings/proxy', (req, res) => {
    res.json(getProxySettings());
  });

  apiRouter.put('/settings/proxy', (req, res) => {
    const { enabled, url } = req.body || {};
    const normalizedUrl = typeof url === 'string' ? url.trim() : '';

    if (enabled && !normalizedUrl) {
      return res.status(400).json({ error: 'Proxy URL is required when proxy is enabled' });
    }

    if (normalizedUrl) {
      try {
        const parsed = new URL(normalizedUrl);
        if (!['http:', 'https:'].includes(parsed.protocol)) {
          return res.status(400).json({ error: 'Unsupported proxy protocol' });
        }
      } catch {
        return res.status(400).json({ error: 'Invalid proxy URL' });
      }
    }

    const db = readDB();
    if (!db.settings) db.settings = {};
    db.settings.proxy = {
      enabled: Boolean(enabled),
      url: normalizedUrl
    };
    writeDB(db);
    res.json(db.settings.proxy);
  });

  apiRouter.post('/articles/import-wechat', async (req, res) => {
    try {
      const { url, folderId } = req.body;
      if (!url) return res.status(400).json({ error: 'URL is required' });

      console.log(`[API] Importing WeChat article: ${url}`);
      const proxySettings = getProxySettings();
      const data = await convertWeChatToMarkdown(
        url,
        proxySettings.enabled && proxySettings.url ? proxySettings.url : null
      );
      
      const db = readDB();
      const newArticle = createArticleEntry({
        title: data.title,
        content: data.markdown,
        type: 'markdown',
        folderId: folderId || null,
        status: 'unread',
        tags: ['WeChat']
      });

      db.articles.push(newArticle);
      writeDB(db);
      
      console.log(`[API] Successfully imported: ${data.title}`);
      res.status(201).json(newArticle);
    } catch (err: any) {
      if (err.message && err.message.includes('微信触发了安全验证')) {
        console.warn(`[API] WeChat validation tripped for: ${req.body?.url}`);
        return res.status(422).json({ error: err.message });
      }
      console.error("WeChat import failed:", err);
      res.status(500).json({ error: err.message || "Failed to import WeChat article" });
    }
  });

  apiRouter.post('/articles/parse-html', async (req, res) => {
    try {
      const { html, folderId } = req.body;
      if (!html) return res.status(400).json({ error: 'HTML content is required' });

      console.log(`[API] Parsing HTML for WeChat format...`);
      const data = parseWeChatHtml(html);
      
      const db = readDB();
      const newArticle = createArticleEntry({
        title: data.title,
        content: data.markdown,
        type: 'markdown',
        folderId: folderId || null,
        status: 'unread',
        tags: ['WeChat']
      });

      db.articles.unshift(newArticle);
      writeDB(db);
      
      console.log(`[API] Successfully parsed HTML: ${data.title}`);
      res.status(201).json(newArticle);
    } catch (err: any) {
      if (err.message && err.message.includes('微信触发了安全验证')) {
        console.warn(`[API] Uploaded HTML is a微信 validation page`);
        return res.status(422).json({ error: err.message });
      }
      console.error("HTML parse failed:", err);
      res.status(500).json({ error: err.message || "Failed to parse HTML" });
    }
  });

  apiRouter.get('/articles', (req, res) => {
    log(`[API] Fetching articles list...`);
    const { articles } = readDB();
    const metadataOnly = articles.map(({ content, ...rest }: any) => rest);
    log(`[API] Returning ${metadataOnly.length} articles`);
    res.json(metadataOnly);
  });

  apiRouter.get('/search', (req, res) => {
    try {
      const { q } = req.query;
      if (!q || typeof q !== 'string') return res.json([]);
      
      const db = readDB();
      const query = q.toLowerCase();
      
      const results = db.articles.filter((article: any) => {
        const titleMatch = article.title && article.title.toLowerCase().includes(query);
        if (titleMatch) return true;
        
        if (article.tags && Array.isArray(article.tags)) {
          if (article.tags.some((tag: string) => tag.toLowerCase().includes(query))) return true;
        }

        const directContentMatch = article.content && article.content.toLowerCase().includes(query);
        if (directContentMatch) return true;
        
        if (article.fileName) {
          const fileContent = getFileContent(article.fileName);
          if (fileContent && fileContent.toLowerCase().includes(query)) return true;
        }
        return false;
      });

      console.log(`[API] Search for "${query}" found ${results.length} results`);
      const metadataOnly = results.map(({ content, ...rest }: any) => rest);
      res.json(metadataOnly);
    } catch (err) {
      console.error("Search API failed:", err);
      res.status(500).json([]);
    }
  });

  apiRouter.get('/articles/:id/content', (req, res) => {
    const db = readDB();
    const index = db.articles.findIndex((a: any) => a.id === req.params.id);
    if (index === -1) return res.status(404).send('Article not found');
    
    const article = db.articles[index];
    if (article.fileName) {
      if (article.type === 'pdf') {
        db.articles[index].lastOpenedAt = new Date().toISOString();
        writeDB(db);
        res.json({ content: `/uploads/${article.fileName}`, isUrl: true });
      } else {
        const content = getFileContent(article.fileName);
        if (content !== null) {
          db.articles[index].lastOpenedAt = new Date().toISOString();
          writeDB(db);
          res.json({ content });
        } else {
          res.status(404).send('File not found');
        }
      }
    } else {
      res.status(404).send('File name not found in database');
    }
  });

  apiRouter.post('/articles', (req, res) => {
    try {
      const db = readDB();
      const newArticle = createArticleEntry(req.body);
      db.articles.push(newArticle);
      writeDB(db);
      res.status(201).json(newArticle);
    } catch (err) {
      console.error("Failed to create article:", err);
      res.status(500).json({ error: "Failed to create article" });
    }
  });

  apiRouter.post('/articles/batch', (req, res) => {
    try {
      const db = readDB();
      const articlesData = req.body.articles || [];
      const results = [];

      for (const articleData of articlesData) {
        const newArticle = createArticleEntry(articleData);
        db.articles.push(newArticle);
        results.push(newArticle);
      }

      writeDB(db);
      res.status(201).json(results);
    } catch (err) {
      console.error("Batch upload failed:", err);
      res.status(500).json({ error: "Batch upload failed" });
    }
  });

  apiRouter.post('/articles/:id/toggle-read', (req, res) => {
    const db = readDB();
    const index = db.articles.findIndex((a: any) => a.id === req.params.id);
    if (index === -1) return res.status(404).json({ error: 'Article not found' });

    const article = db.articles[index];
    const newStatus = article.status === 'read' ? 'unread' : 'read';
    
    db.articles[index] = { 
      ...article, 
      status: newStatus,
      updatedAt: new Date().toISOString()
    };
    
    if (newStatus === 'read') {
      db.articles[index].lastOpenedAt = new Date().toISOString();
    }

    writeDB(db);
    res.json(db.articles[index]);
  });

  apiRouter.post('/articles/batch-delete', (req, res) => {
    const { ids } = req.body;
    if (!Array.isArray(ids)) return res.status(400).json({ error: 'IDs must be an array' });

    const db = readDB();
    const articlesToDelete = db.articles.filter((a: any) => ids.includes(a.id));
    
    articlesToDelete.forEach((article: any) => {
      if (article.fileName) {
        const filePath = path.join(UPLOADS_DIR, article.fileName);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      }
    });

    db.articles = db.articles.filter((a: any) => !ids.includes(a.id));
    writeDB(db);
    res.status(204).send();
  });

  apiRouter.post('/articles/batch-update', (req, res) => {
    const { ids, updates } = req.body;
    if (!Array.isArray(ids)) return res.status(400).json({ error: 'IDs must be an array' });
    
    const db = readDB();
    db.articles = db.articles.map((a: any) => {
      if (ids.includes(a.id)) {
        return { ...a, ...updates, updatedAt: new Date().toISOString() };
      }
      return a;
    });
    
    writeDB(db);
    res.status(204).send();
  });

  apiRouter.patch('/articles/:id', (req, res) => {
    const db = readDB();
    const index = db.articles.findIndex((a: any) => a.id === req.params.id);
    if (index !== -1) {
      db.articles[index] = { ...db.articles[index], ...req.body, updatedAt: new Date().toISOString() };
      writeDB(db);
      res.json(db.articles[index]);
    } else {
      res.status(404).send('Article not found');
    }
  });

  apiRouter.delete('/articles/:id', (req, res) => {
    const db = readDB();
    const article = db.articles.find((a: any) => a.id === req.params.id);
    if (article && article.fileName) {
      const filePath = path.join(UPLOADS_DIR, article.fileName);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }
    db.articles = db.articles.filter((a: any) => a.id !== req.params.id);
    writeDB(db);
    res.status(204).send();
  });

  apiRouter.get('/folders', (req, res) => {
    log(`[API] Fetching folders list...`);
    const { folders } = readDB();
    log(`[API] Returning ${folders.length} folders`);
    res.json(folders);
  });

  apiRouter.post('/folders', (req, res) => {
    const db = readDB();
    const newFolder = {
      ...req.body,
      id: nanoid(),
      createdAt: new Date().toISOString()
    };
    db.folders.push(newFolder);
    writeDB(db);
    res.status(201).json(newFolder);
  });

  apiRouter.post('/folders/batch-update', (req, res) => {
    const { updates } = req.body;
    if (!Array.isArray(updates)) return res.status(400).json({ error: 'Updates must be an array' });
    
    const db = readDB();
    updates.forEach((update: any) => {
      const index = db.folders.findIndex((f: any) => f.id === update.id);
      if (index !== -1) {
        db.folders[index] = { ...db.folders[index], ...update };
      }
    });
    
    writeDB(db);
    res.status(204).send();
  });

  apiRouter.delete('/folders/:id', (req, res) => {
    const db = readDB();
    db.folders = db.folders.filter((f: any) => f.id !== req.params.id);
    db.articles = db.articles.map((a: any) => a.folderId === req.params.id ? { ...a, folderId: null } : a);
    writeDB(db);
    res.status(204).send();
  });

  apiRouter.patch('/folders/:id', (req, res) => {
    const db = readDB();
    const index = db.folders.findIndex((f: any) => f.id === req.params.id);
    if (index !== -1) {
      db.folders[index] = { ...db.folders[index], ...req.body };
      writeDB(db);
      res.json(db.folders[index]);
    } else {
      res.status(404).json({ error: 'Folder not found' });
    }
  });

  // Removed apiRouter.all('*') from here

  // Mount API Router
  app.use('/api', apiRouter);

  // Multer config for file uploads
  const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, UPLOADS_DIR);
    },
    filename: (req, file, cb) => {
      // Use originalname, but sanitize it or use a unique name depending on choice.
      // To preserve local paths nicely, we use the original name
      cb(null, file.originalname);
    }
  });

  const upload = multer({ storage });

  apiRouter.post('/upload-file', upload.single('file'), (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    log(`[API] Uploaded file: ${req.file.originalname}`);
    res.json({ filename: req.file.originalname, path: `/uploads/${req.file.originalname}` });
  });

  apiRouter.post('/upload-files', upload.array('files'), (req, res) => {
    if (!req.files || !Array.isArray(req.files)) {
      return res.status(400).json({ error: 'No files uploaded' });
    }
    log(`[API] Uploaded ${req.files.length} files`);
    res.json({ 
      files: req.files.map(f => ({
        filename: f.originalname,
        path: `/uploads/${f.originalname}`
      }))
    });
  });

  apiRouter.all('*', (req, res) => {
    console.warn(`[API] 404 Not Found: ${req.method} ${req.url}`);
    res.status(404).json({ error: `API route not found: ${req.method} ${req.originalUrl}` });
  });

  // Vite development middleware
  if (process.env.NODE_ENV !== 'production') {
    try {
      const vite = await createViteServer({
        server: { 
          middlewareMode: true,
          watch: {
            ignored: ['**/data/**', '**/uploads/**', '**/node_modules/**']
          }
        },
        appType: 'spa',
      });
      app.use(vite.middlewares);
      await Promise.allSettled(viteWarmupFiles.map((file) => vite.transformRequest(file)));
      log(`Vite warmup completed for ${viteWarmupFiles.length} client modules`);
      log("Vite middleware initialized");
    } catch (err) {
      log(`Failed to initialize Vite middleware: ${err}`);
    }
  } else {
    // Statics for production
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.use((err: any, req: any, res: any, next: any) => {
    console.error("Unhandled error:", err);
    res.status(500).json({ error: "Internal Server Error" });
  });

  app.listen(PORT, HOST, () => {
    console.log(`[Server] Success: Listening on ${HOST}:${PORT} (PID: ${process.pid})`);
  }).on('error', (err: any) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`Port ${PORT} is already in use. Please wait while the environment clears stale processes.`);
      process.exit(1);
    } else {
      console.error("Server failed to start:", err);
    }
  });
}

startServer().catch(err => {
  console.error("FATAL: Server failed to start:", err);
  fs.writeFileSync('server-error.log', err.stack || String(err));
});
