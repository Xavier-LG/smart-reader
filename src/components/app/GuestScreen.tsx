import { motion } from 'motion/react';
import { BookOpen, LogIn } from 'lucide-react';

interface GuestScreenProps {
  onEnter: () => void;
}

export default function GuestScreen({ onEnter }: GuestScreenProps) {
  return (
    <div className="h-screen w-screen flex flex-col items-center justify-center bg-white">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center max-w-sm px-6"
      >
        <div className="bg-blue-600 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-8 shadow-xl shadow-blue-200">
          <BookOpen className="text-white h-8 w-8" />
        </div>
        <h1 className="text-3xl font-bold text-gray-900 mb-3 tracking-tight">Smart Reader</h1>
        <p className="text-gray-500 mb-10 leading-relaxed font-medium">
          A local-first reading space for articles, notes, and technical writeups.
        </p>
        <button
          onClick={onEnter}
          className="w-full flex items-center justify-center gap-3 bg-gray-900 hover:bg-black text-white px-6 py-3 rounded-xl font-semibold transition-all shadow-lg hover:translate-y-[-2px] active:translate-y-[0px]"
        >
          <LogIn className="h-5 w-5" />
          Enter Smart Reader
        </button>
      </motion.div>
    </div>
  );
}
