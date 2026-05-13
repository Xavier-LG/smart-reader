import axios from 'axios';
import * as cheerio from 'cheerio';
import TurndownService from 'turndown';
// @ts-ignore
import { gfm } from 'turndown-plugin-gfm';
import { HttpsProxyAgent } from 'https-proxy-agent';

// 辅助函数：生成随机中国区 IP 以降低被拦截概率
function getRandomChineseIP() {
  const ips = [
    '218.85.118.', '117.25.13.', '125.77.25.', '120.36.168.', '110.84.129.',
    '113.108.139.', '121.14.161.', '221.232.129.', '114.247.50.', '222.128.31.'
  ];
  return ips[Math.floor(Math.random() * ips.length)] + Math.floor(Math.random() * 254 + 1);
}

// 辅助函数：获取随机 User-Agent
function getRandomUA() {
  const uas = [
    'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.10(0x18000a2f) NetType/WIFI Language/zh_CN',
    'Mozilla/5.0 (Linux; Android 10; SM-G960F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/81.0.4044.138 Mobile Safari/537.36 MicroMessenger/7.0.15.1680(0x27000F35) NetType/WIFI Language/zh_CN',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 14_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.1(0x18000123) NetType/WIFI Language/zh_CN',
    'Mozilla/5.0 (Linux; Android 11; Pixel 4 XL) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.4430.210 Mobile Safari/537.36 MicroMessenger/8.0.6(0x28000639) NetType/WIFI Language/zh_CN'
  ];
  return uas[Math.floor(Math.random() * uas.length)];
}

/**
 * 核心转换函数
 * @param url 微信公众号文章链接
 * @returns 包含标题、作者、日期和 Markdown 内容的对象
 */
export async function convertWeChatToMarkdown(url: string, customProxyUrl?: string | null) {
  if (!url || !url.includes('mp.weixin.qq.com')) {
    throw new Error('Invalid WeChat URL');
  }

  try {
    const chineseIP = getRandomChineseIP();
    const headers = {
      'User-Agent': getRandomUA(),
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      'X-Forwarded-For': chineseIP,
      'X-Real-IP': chineseIP,
      'Referer': 'https://mp.weixin.qq.com/',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache'
    };

    // 配置代理：读取环墧变量中的 HTTP_PROXY / HTTPS_PROXY
    const proxyUrl = customProxyUrl || process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
    const httpsAgent = proxyUrl ? new HttpsProxyAgent(proxyUrl) : undefined;

    const response = await axios.get(url, { 
      headers, 
      timeout: 15000,
      httpsAgent,
      proxy: false // 如果使用了 httpsAgent，需要关闭 axios 默认的 proxy
    });
    
    return parseWeChatHtml(response.data);
  } catch (error: any) {
    if (!error.message?.includes('微信触发了安全验证')) {
      console.error('WeChat Conversion Error:', error.message);
    }
    throw error;
  }
}

/**
 * 将获取到的微信公众号 HTML 内容转换为 Markdown
 * @param htmlString 微信公众号网页源内容
 * @returns 包含标题、作者、日期和 Markdown 内容的对象
 */
export function parseWeChatHtml(htmlString: string) {
  const $ = cheerio.load(htmlString);
  
  // Basic info with fallbacks
  let title = $('#activity-name').text().trim() || 
              $('.rich_media_title').text().trim() || 
              $('meta[property="og:title"]').attr('content') || 
              $('title').text().trim() ||
              'Untitled';
  
  let author = $('#js_name').text().trim() || 
               $('.rich_media_meta_nickname').text().trim() || 
               $('meta[name="author"]').attr('content') ||
               'Anonymous';
  
  let date = $('#publish_time').text().trim() || 
             $('#post-date').text().trim() || 
             $('meta[name="date"]').attr('content') ||
             '';

  // Fallback from script variables if DOM is dynamic
  if (title === 'Untitled' || !author || author === 'Anonymous') {
    if (title === 'Untitled') {
      const m = htmlString.match(/var msg_title\s*=\s*["'](.*?)["']/);
      if (m) title = m[1];
    }
    if (author === 'Anonymous') {
      const m = htmlString.match(/var nickname\s*=\s*["'](.*?)["']/);
      if (m) author = m[1];
    }
  }

  // Main content with multiple selectors and fallback to raw content lookup
  let contentElement: any = $('#js_content');
  if (contentElement.length === 0 || contentElement.text().trim().length < 5) contentElement = $('.rich_media_content');
  if (contentElement.length === 0 || contentElement.text().trim().length < 5) contentElement = $('#img-content');
  if (contentElement.length === 0 || contentElement.text().trim().length < 5) contentElement = $('.rich_media_area_primary');
  
  // Check for common error states
  const bodyTextLength = $('body').text().length;
  const titleText = $('title').text().trim();
  if ((titleText === '环境异常' || titleText === '安全验证') && bodyTextLength < 500) {
    throw new Error('微信触发了安全验证，暂时无法自动抓取。请在浏览器中打开文章，将网页保存成HTML格式后上传。');
  }

  let usedFallback = false;
  // If we still didn't find specific containers, look for the largest text-containing element
  if (contentElement.length === 0 || contentElement.text().trim().length < 5) {
    usedFallback = true;
    let maxLen = 0;
    $('div, main, article, section').each((i, el) => {
      const textLen = $(el).text().trim().length;
      if (textLen > maxLen && textLen < 200000) { // Safety bound
        maxLen = textLen;
        contentElement = $(el);
      }
    });

    if (contentElement.length === 0 || contentElement.text().trim().length < 5) {
      contentElement = $('body');
    }
  }

  // Remove the strict error throwing to allow general web page reading
  // if (title === 'Untitled' && usedFallback) { ... }
  // if (contentElement.length === 0 || contentElement.text().trim().length < 10) { ... }
  
  // Select a copy to modify
  const $content = cheerio.load(contentElement.html() || '');
  const cleanContent = $content('body');

  // 1. 处理微信特定的代码块格式 (增强版)
  // 微信代码块通常是 <pre> 内有多个 <code>，每个 <code> 是一行
  // 有些代码块使用特殊的 class 如 .code-snippet__js
  cleanContent.find('pre, [class*="code-snippet"]').each((i, el) => {
    const $el = $content(el);
    
    // 跳过已经被处理过的内部元素
    if ($el.parents('pre').length > 0) return;

    const codeLines: string[] = [];
    const language = $el.attr('data-lang') || 
                     $el.attr('class')?.match(/code-snippet__(\w+)/)?.[1] || 
                     '';
    
    // 尝试多种行提取方式
    const $lines = $el.find('code, .code-snippet__p, .code-snippet__line');
    
    if ($lines.length > 0) {
      $lines.each((j, line) => {
        // 移除微信可能添加的行号 span
        const $line = $content(line).clone();
        $line.find('[class*="line-index"]').remove();
        // 处理空行：如果一行只有空白，转为一个空字符串
        const lineText = $line.text().replace(/\u00A0/g, ' ');
        codeLines.push(lineText);
      });
    } else {
      // 如果没有明显的行标签，直接按文字内容提取，但要处理换行
      const rawText = $el.text().replace(/\u00A0/g, ' ');
      if (rawText.trim()) {
        codeLines.push(rawText);
      }
    }

    if (codeLines.length > 0) {
      const combinedCode = codeLines.join('\n');
      // 将其转化为标准的 Markdown-friendly HTML 结构
      const $newPre = $content('<pre></pre>');
      const $newCode = $content('<code></code>');
      if (language) $newCode.addClass(`language-${language}`);
      $newCode.text(combinedCode);
      $newPre.append($newCode);
      $el.replaceWith($newPre);
    }
  });

  // 2. 处理图片 (微信使用 data-src 懒加载)
  cleanContent.find('img').each((i, el) => {
    const $el = $content(el);
    const dataSrc = $el.attr('data-src') || $el.attr('data-actualsrc') || $el.attr('src');
    if (dataSrc) {
      let finalSrc = dataSrc;
      if (finalSrc.startsWith('//')) finalSrc = 'https:' + finalSrc;
      $el.attr('src', finalSrc);
    } else {
      $el.remove();
    }
  });

  // 确保所有 table 能被 turndown-plugin-gfm 正确识别为 markdown 表格
  cleanContent.find('table').each((i, el) => {
    const $table = $content(el);
    // 很多微信表格没有 thead/th，这会导致 Turndown 放弃转码为 markdown table
    if ($table.find('thead').length === 0 && $table.find('th').length === 0) {
      const $firstRow = $table.find('tr').first();
      // 将第一行的 td 改为 th
      $firstRow.find('td').each((j, td) => {
        const $td = $content(td);
        const $th = $content('<th></th>').html($td.html() || '');
        $td.replaceWith($th);
      });
      // 提取出第一行到 thead
      const $thead = $content('<thead></thead>').append($firstRow.clone());
      $firstRow.remove();
      $table.prepend($thead);
    }
  });

  // 确保 table 的单元格中没有会引起换行的标签 (如 <p>, <br>, \n)，否则会破坏 markdown 表格的解析
  cleanContent.find('th, td').each((i, el) => {
    const $cell = $content(el);
    let innerHtml = $cell.html() || '';
    innerHtml = innerHtml.replace(/<br[^>]*>/gi, ' ');
    innerHtml = innerHtml.replace(/<\/?(p|div|section|blockquote)[^>]*>/gi, ' ');
    innerHtml = innerHtml.replace(/[\r\n]+/g, ' ');
    $cell.html(innerHtml.trim());
  });

  // 3. 移除干扰元素
  cleanContent.find('script, style, .qr_code_pc_outer, .reward_area, #js_profile_qrcode, .rich_media_tool, .js_uneditable, .edit_area').remove();

  // 微信文章具有极深的嵌套 section，会导致 Turndown stack overflow。将其拍平：
  // 将所有 section 的内容提取出来，替换掉 section 标签
  let hasSections = true;
  while(hasSections) {
    const $sections = cleanContent.find('section, fieldset');
    if ($sections.length === 0) {
      hasSections = false;
    } else {
      $sections.each((i, el) => {
        const $el = $content(el);
        $el.replaceWith($el.html() || '');
      });
    }
  }

  const html = cleanContent.html() || '';

  const turndownService = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    emDelimiter: '*'
  });
  
  turndownService.use(gfm);

  // 处理 blockquote
  turndownService.addRule('unwrapSection', {
    filter: ['blockquote'],
    replacement: function (content, node: any) {
      if (node.nodeName === 'BLOCKQUOTE') {
        return '\n> ' + content.trim().split('\n').join('\n> ') + '\n';
      }
      return '\n' + content + '\n';
    }
  });

  // 图片处理
  turndownService.addRule('wechatImages', {
    filter: 'img',
    replacement: function (content, node: any) {
      let src = node.getAttribute('src');
      if (!src) return '';
      const alt = node.getAttribute('alt') || '';
      return `\n![${alt}](${src})\n`;
    }
  });

  // 强化代码块转换，确保语言信息被保留并使用 Fenced Code Blocks
  turndownService.addRule('fencedCodeBlock', {
    filter: function (node, options) {
      return (
        options.codeBlockStyle === 'fenced' &&
        node.nodeName === 'PRE' &&
        node.firstChild &&
        node.firstChild.nodeName === 'CODE'
      );
    },
    replacement: function (content, node: any, options) {
      const className = node.firstChild.getAttribute('class') || '';
      const language = className.match(/language-(\S+)/)?.[1] || '';
      // 这里的 content 已经由内部 code 转换过了
      // 但我们需要原始文本以避免转义字符问题（Turndown 有时会转义 `*` 或 `_`）
      const rawCode = node.firstChild.textContent || '';
      return (
        '\n\n' + options.fence + language + '\n' +
        rawCode.replace(/\n$/, '') +
        '\n' + options.fence + '\n\n'
      );
    }
  });

  // 处理 section/fieldset/div，如果有非常深的嵌套会导致堆栈溢出
  let markdown = '';
  try {
    markdown = turndownService.turndown(html);
  } catch (e: any) {
    console.warn('Turndown conversion failed, falling back to basic text extraction:', e.message);
    // 粗暴提取文本
    cleanContent.find('p, div, section').append('\n');
    markdown = cleanContent.text();
  }

  const finalMarkdown = `# ${title}\n\n**Author:** ${author}\n**Date:** ${date}\n\n---\n\n${markdown}`;

  return {
    title, author, date,
    markdown: finalMarkdown
  };
}
