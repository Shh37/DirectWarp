export type SearchEngine = 'google' | 'bing';
export type ThemePreference = 'system' | 'light' | 'dark';

export interface DirectWarpSettings {
  trigger: string;
  searchEngine: SearchEngine;
  theme: ThemePreference;
}

export interface SearchResult {
  url: string;
  title: string;
}

export interface SearchError {
  message: string;
  code?: string;
  details?: any;
}

export type SearchResponse = 
  | { success: true; result: SearchResult }
  | { success: false; error: SearchError };
