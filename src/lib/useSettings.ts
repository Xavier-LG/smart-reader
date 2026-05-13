import { useState, useEffect } from 'react';

export interface FilterRule {
  id: string;
  type?: 'text' | 'regex' | 'line' | 'from_to_end';
  pattern: string;
  isRegex?: boolean;
  isActive: boolean;
}

const defaultRules: FilterRule[] = [
  {
    id: 'default-wx-sticker',
    pattern: '<div[^>]*class="[^"]*wx_sticker[^"]*"[^>]*>[\\s\\S]*?<\\/div><\\/div>',
    type: 'regex',
    isRegex: true,
    isActive: true,
  },
  {
    id: 'default-wx-ad-end',
    pattern: '后台回复加群加入交流群',
    type: 'from_to_end',
    isActive: true,
  },
];

export function useSettings() {
  const [filterRules, setFilterRules] = useState<FilterRule[]>(() => {
    const stored = localStorage.getItem('app_filter_rules');
    if (!stored) return defaultRules;

    try {
      const parsed = JSON.parse(stored);
      return parsed.map((rule: any) => ({
        ...rule,
        type: rule.type || (rule.isRegex ? 'regex' : 'text'),
      }));
    } catch {
      return defaultRules;
    }
  });

  useEffect(() => {
    localStorage.setItem('app_filter_rules', JSON.stringify(filterRules));
  }, [filterRules]);

  return { filterRules, setFilterRules };
}
