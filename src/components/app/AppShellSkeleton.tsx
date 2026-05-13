export default function AppShellSkeleton() {
  return (
    <div className="h-screen w-screen bg-gray-50 dark:bg-[#0a0a0b] flex overflow-hidden font-sans">
      <div className="w-64 md:w-72 lg:w-80 h-full border-r border-gray-100 dark:border-white/5 bg-white dark:bg-[#0f0f12] hidden md:flex flex-col animate-pulse">
        <div className="p-6 space-y-8">
          <div className="h-8 w-32 bg-gray-200 dark:bg-gray-800 rounded-lg"></div>
          <div className="space-y-4">
            <div className="h-4 w-24 bg-gray-200 dark:bg-gray-800 rounded"></div>
            {[...Array(4)].map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="w-5 h-5 bg-gray-200 dark:bg-gray-800 rounded"></div>
                <div className="h-4 w-full bg-gray-200 dark:bg-gray-800 rounded"></div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col min-w-0 h-full bg-gray-50 dark:bg-[#0a0a0b] animate-pulse">
        <div className="h-16 md:h-20 border-b border-gray-100 dark:border-white/5 bg-white dark:bg-[#0f0f12] flex items-center px-4 md:px-10">
          <div className="h-10 w-full max-w-lg bg-gray-200 dark:bg-gray-800 rounded-2xl"></div>
        </div>

        <div className="p-4 md:p-10 space-y-8 flex-1">
          <div className="flex justify-between items-center">
            <div className="h-8 w-48 bg-gray-200 dark:bg-gray-800 rounded-lg"></div>
            <div className="h-8 w-32 bg-gray-200 dark:bg-gray-800 rounded-lg hidden sm:block"></div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="bg-white dark:bg-[#1a1b1e] rounded-3xl p-5 border border-gray-100 dark:border-white/5 h-48 flex flex-col justify-between">
                <div className="space-y-3">
                  <div className="h-4 w-20 bg-gray-200 dark:bg-gray-800 rounded"></div>
                  <div className="space-y-2">
                    <div className="h-5 w-full bg-gray-200 dark:bg-gray-800 rounded"></div>
                    <div className="h-5 w-4/5 bg-gray-200 dark:bg-gray-800 rounded"></div>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <div className="h-3 w-16 bg-gray-200 dark:bg-gray-800 rounded"></div>
                  <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-800"></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
