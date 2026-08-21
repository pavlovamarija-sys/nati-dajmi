import type { MarketplaceListing } from '@/features/toy-exchange/types/marketplace-listing';
import { supabase } from '@/lib/supabase/client';
import { parseMarketplaceResponse } from '../../../../shared/toy-exchange-marketplace-response';

const FUNCTION_NAME = 'browse-toy-listings';

export async function browseToyExchangeListings(): Promise<MarketplaceListing[]> {
  let invocation: Awaited<ReturnType<typeof supabase.functions.invoke>>;
  try { invocation = await supabase.functions.invoke(FUNCTION_NAME, { body: {} }); }
  catch { throw new Error('Could not load marketplace listings.'); }
  if (invocation.error) throw new Error('Could not load marketplace listings.');
  return parseMarketplaceResponse(invocation.data);
}
