// background用。資格情報の取得は各アダプターだけが行う。
import { prepareCustomSearchProvider } from './customSearchProvider';
import { searchFailure, type PreparedSearchProvider, type SearchContext } from './types';

export async function prepareSearchProvider(id: unknown, context: SearchContext): Promise<PreparedSearchProvider> {
  if (id === 'none') return searchFailure('not_configured');
  if (id === 'custom-search') return prepareCustomSearchProvider(context);
  return searchFailure('unsupported_provider');
}
