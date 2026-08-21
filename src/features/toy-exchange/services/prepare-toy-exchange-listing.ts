import { evaluateToyExchangeListingSource } from '@/features/toy-exchange/domain/toy-exchange-listing-preparation';
import { getAuthoritativeToyExchangeListingSource } from '@/features/toy-exchange/repositories/toy-exchange-repository';
import type { ToyExchangeListingPreparationResult } from '@/features/toy-exchange/types/toy-exchange-listing';
import { supabase } from '@/lib/supabase/client';

export async function prepareToyExchangeListing(
  toyAnalysisItemId: string,
): Promise<ToyExchangeListingPreparationResult> {
  const normalizedItemId = readNonblankString(toyAnalysisItemId);

  if (!normalizedItemId) {
    return { status: 'INVALID_AUTHORITATIVE_DATA' };
  }

  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    return { status: 'UNAUTHENTICATED' };
  }

  const source = await getAuthoritativeToyExchangeListingSource(normalizedItemId);
  return evaluateToyExchangeListingSource(source);
}

function readNonblankString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}
