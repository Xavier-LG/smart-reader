import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, BookOpen, CheckCircle2, AlertCircle } from 'lucide-react';
import { cn } from '../../lib/utils';

interface NoticeModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description: string;
  type?: 'info' | 'success' | 'warning';
}

export default function NoticeModal({ 
  isOpen, 
  onClose, 
  title, 
  description, 
  type = 'info' 
}: NoticeModalProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
          />
          
          <motion.div 
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            className="bg-white w-full max-w-sm rounded-[2.5rem] shadow-2xl relative overflow-hidden p-8 text-center"
          >
            <div className={cn(
              "w-20 h-20 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-xl",
              type === 'info' && "bg-indigo-600 text-white shadow-indigo-100",
              type === 'success' && "bg-green-500 text-white shadow-green-100",
              type === 'warning' && "bg-amber-500 text-white shadow-amber-100"
            )}>
              {type === 'info' && <BookOpen className="h-10 w-10" />}
              {type === 'success' && <CheckCircle2 className="h-10 w-10" />}
              {type === 'warning' && <AlertCircle className="h-10 w-10" />}
            </div>

            <h3 className="text-2xl font-black text-slate-800 mb-2 tracking-tight">{title}</h3>
            <p className="text-sm text-gray-500 leading-relaxed font-medium mb-8">
              {description}
            </p>

            <button 
              onClick={onClose}
              className={cn(
                "w-full py-4 rounded-2xl font-black text-sm uppercase tracking-widest transition-all active:scale-95 shadow-lg",
                type === 'info' && "bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-100",
                type === 'success' && "bg-green-600 hover:bg-green-700 text-white shadow-green-100",
                type === 'warning' && "bg-amber-600 hover:bg-amber-700 text-white shadow-amber-100"
              )}
            >
              我知道了
            </button>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
