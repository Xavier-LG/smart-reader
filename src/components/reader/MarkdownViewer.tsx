import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneLight, vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Copy, Check } from 'lucide-react';

const CodeBlock = ({ className, children, theme, ...props }: any) => {
  const match = /language-(\w+)/.exec(className || '');
  const [copied, setCopied] = useState(false);
  const codeString = typeof children === 'string' 
    ? children 
    : (Array.isArray(children) && typeof children[0] === 'string' ? children[0] : String(children));
  const finalCode = codeString.replace(/\n$/, '');

  const handleCopy = async () => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(finalCode);
      } else {
        const textArea = document.createElement("textarea");
        textArea.value = finalCode;
        textArea.style.position = "fixed";
        textArea.style.left = "-9999px";
        textArea.style.top = "0";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand('copy');
        textArea.remove();
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  };

  const codeTheme = theme === 'dark' ? vscDarkPlus : oneLight;

  return (
    <div className="relative group rounded-xl overflow-hidden my-6 border border-slate-200/50 dark:border-slate-700/50">
      <div className="flex items-center justify-between px-4 py-2 bg-slate-100/80 dark:bg-slate-800/80 border-b border-slate-200/50 dark:border-slate-700/50">
        <div className="flex items-center space-x-2">
          <div className="flex space-x-1.5">
            <div className="w-3 h-3 rounded-full bg-rose-500/80"></div>
            <div className="w-3 h-3 rounded-full bg-amber-500/80"></div>
            <div className="w-3 h-3 rounded-full bg-emerald-500/80"></div>
          </div>
          {match && match[1] && (
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400 font-mono ml-2 lowercase">
              {match[1]}
            </span>
          )}
        </div>
        <button
          onClick={handleCopy}
          className="p-1.5 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all focus:outline-none"
          title="Copy code"
        >
          {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
        </button>
      </div>
      <div className="text-sm font-mono p-4 overflow-x-auto bg-[#fafafa] dark:bg-[#1e1e1e]">
        <SyntaxHighlighter
          style={codeTheme as any}
          language={match ? match[1] : 'text'}
          PreTag="div"
          customStyle={{
            margin: 0,
            padding: 0,
            background: 'transparent',
            fontSize: '14px',
            lineHeight: '1.6',
          }}
          {...props}
        >
          {finalCode}
        </SyntaxHighlighter>
      </div>
    </div>
  );
};

export default function MarkdownViewer({ content, theme }: { content: string, theme?: string }) {
  return (
    <div className="markdown-body">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          pre: ({ children, ...props }: any) => {
            const childProps = (children as any)?.props;
            if (childProps && childProps.node?.tagName === 'code') {
              const codeProps = childProps;
              return (
                <CodeBlock className={codeProps.className} theme={theme} {...props}>
                  {codeProps.children}
                </CodeBlock>
              );
            }
            return <pre {...props}>{children}</pre>;
          },
          code: ({ className, children, node, ...props }: any) => {
            return (
              <code className="bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 px-1.5 py-0.5 rounded-md font-mono text-sm font-bold break-words whitespace-normal" {...props}>
                {children}
              </code>
            );
          },
          img: ({ src, alt, title }) => {
            if (!src) return null;
            
            // Transform relative paths to point to the server's uploads directory
            let imgSrc = src;
            if (!imgSrc.startsWith('http') && !imgSrc.startsWith('data:') && !imgSrc.startsWith('/')) {
              // Extract just the filename in case the md has paths like "images/pic.png"
              const parts = imgSrc.split('/');
              const filename = parts[parts.length - 1];
              imgSrc = `/uploads/${filename}`;
            }
            
            return (
              <div className="my-8">
                <img 
                  src={imgSrc}
                  alt={alt}
                  title={title}
                  referrerPolicy="no-referrer" 
                  className="rounded-xl mx-auto shadow-sm"
                  loading="lazy"
                />
                {(() => {
                  const caption = title || alt;
                  if (!caption || caption.trim() === '图片' || caption.trim() === 'image') return null;
                  return (
                    <p className="text-center text-sm text-slate-500 mt-2">
                      {caption}
                    </p>
                  );
                })()}
              </div>
            );
          },
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:text-indigo-700 underline underline-offset-2 decoration-indigo-200 hover:decoration-indigo-400 transition-colors">
              {children}
            </a>
          ),
          h1: ({ children }) => {
            const id = children?.toString().toLowerCase().replace(/\s+/g, '-');
            return <h1 id={id} className="text-3xl sm:text-5xl font-black text-slate-900 dark:text-white mb-10 mt-16 border-b border-gray-200 dark:border-white/5 pb-4 tracking-tight">{children}</h1>;
          },
          h2: ({ children }) => {
            const id = children?.toString().toLowerCase().replace(/\s+/g, '-');
            return <h2 id={id} className="text-2xl sm:text-4xl font-black text-slate-900 dark:text-white mb-8 mt-14 border-b border-gray-200 dark:border-white/5 pb-3 tracking-tight">{children}</h2>;
          },
          h3: ({ children }) => {
            const id = children?.toString().toLowerCase().replace(/\s+/g, '-');
            return <h3 id={id} className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white mb-4 mt-8 tracking-tight">{children}</h3>;
          },
          p: ({ children }: any) => {
            const hasBlockElement = React.Children.toArray(children).some(
              (child: any) => {
                if (!React.isValidElement(child)) return false;
                const props = child.props as any;
                return (props?.node?.tagName === 'code' && !props?.inline) || 
                       (props?.node?.tagName === 'img') || 
                       (child.type === 'img');
              }
            );
            
            if (hasBlockElement) {
              return <div className="mb-6">{children}</div>;
            }
            
            return <p className="text-slate-700 dark:text-gray-300 leading-relaxed mb-6 whitespace-pre-wrap">{children}</p>;
          },
          ul: ({ children }) => <ul className="list-disc list-outside ml-6 mb-6 space-y-2 text-slate-700 dark:text-gray-300">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal list-outside ml-6 mb-6 space-y-2 text-slate-700 dark:text-gray-300">{children}</ol>,
          blockquote: ({ children }) => (
            <blockquote className="border-l-8 border-indigo-500 bg-indigo-50/30 dark:bg-indigo-500/10 px-6 sm:px-10 py-6 sm:py-8 rounded-r-3xl italic text-indigo-900/80 dark:text-indigo-400 my-10 text-lg sm:text-xl relative overflow-hidden">
              <div className="absolute top-0 left-0 w-1 h-full bg-indigo-600/10"></div>
              {children}
            </blockquote>
          ),
          table: ({ node, ...props }) => (
            <div className="overflow-x-auto my-10 rounded-xl ring-1 ring-slate-200 dark:ring-slate-800 shadow-sm bg-white dark:bg-[#1a1b1e]">
              <table className="min-w-full text-left border-collapse" {...props} />
            </div>
          ),
          thead: ({ node, ...props }) => <thead className="bg-slate-50 dark:bg-slate-800/80" {...props} />,
          tbody: ({ node, ...props }) => <tbody className="divide-y divide-slate-200 dark:divide-slate-800/80" {...props} />,
          tr: ({ node, ...props }) => <tr className="even:bg-slate-50/60 dark:even:bg-slate-800/20 hover:bg-indigo-50/40 dark:hover:bg-indigo-500/10 transition-colors" {...props} />,
          th: ({ node, ...props }) => <th className="px-5 py-4 font-semibold text-slate-800 dark:text-slate-200 border-b-2 border-r border-slate-200 dark:border-slate-700/80 last:border-r-0 whitespace-nowrap" {...props} />,
          td: ({ node, ...props }) => <td className="px-5 py-4 border-r border-slate-200 dark:border-slate-800/80 last:border-r-0 align-top leading-relaxed text-sm dark:text-slate-300 break-words" {...props} />,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
