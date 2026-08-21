import {
  TOY_EXCHANGE_LISTING_CATEGORY_MAX_LENGTH,
  TOY_EXCHANGE_LISTING_DESCRIPTION_MAX_LENGTH,
  TOY_EXCHANGE_LISTING_NAME_MAX_LENGTH,
} from '@/features/toy-exchange/domain/toy-exchange-listing-preparation';
import type {
  ListableToyCondition,
  PublishedToyExchangeListing,
} from '@/features/toy-exchange/types/toy-exchange-listing';
import { supabase } from '@/lib/supabase/client';

const FUNCTION_NAME = 'publish-toy-listing';

export type PublishToyExchangeListingInput = {
  toyAnalysisItemId: string;
  name: string;
  category: string | null;
  description: string | null;
  askingValueStars: number;
};

export type ToyExchangePublicationErrorCode =
  | 'ACTIVE_LISTING_EXISTS'
  | 'UNAUTHENTICATED'
  | 'PUBLICATION_FAILED';

export class ToyExchangePublicationError extends Error {
  constructor(readonly code: ToyExchangePublicationErrorCode) {
    super('Could not publish the toy listing.');
    this.name = 'ToyExchangePublicationError';
  }
}

export async function publishToyExchangeListing(
  input: PublishToyExchangeListingInput,
): Promise<PublishedToyExchangeListing> {
  const request = validatePublicationInput(input);
  let invocation: Awaited<ReturnType<typeof supabase.functions.invoke>>;

  try {
    invocation = await supabase.functions.invoke(FUNCTION_NAME, { body: request });
  } catch {
    throw new ToyExchangePublicationError('PUBLICATION_FAILED');
  }

  if (invocation.error) {
    const providerCode = await readProviderErrorCode(invocation.error);
    throw new ToyExchangePublicationError(
      providerCode === 'ACTIVE_LISTING_EXISTS'
        ? 'ACTIVE_LISTING_EXISTS'
        : providerCode === 'UNAUTHENTICATED'
          ? 'UNAUTHENTICATED'
          : 'PUBLICATION_FAILED',
    );
  }

  return parsePublicationResponse(invocation.data);
}

function validatePublicationInput(
  input: PublishToyExchangeListingInput,
): PublishToyExchangeListingInput {
  if (!isRecord(input)) {
    throw new ToyExchangePublicationError('PUBLICATION_FAILED');
  }
  const toyAnalysisItemId = readNonblankString(input.toyAnalysisItemId);
  const name = readNonblankString(input.name);
  const category = input.category === null
    ? null
    : typeof input.category === 'string'
      ? input.category.trim() || null
      : undefined;
  const description = input.description === null
    ? null
    : typeof input.description === 'string'
      ? input.description.trim() || null
      : undefined;

  if (!toyAnalysisItemId || !name || name.length > TOY_EXCHANGE_LISTING_NAME_MAX_LENGTH) {
    throw new ToyExchangePublicationError('PUBLICATION_FAILED');
  }
  if (category === undefined || (category !== null && category.length > TOY_EXCHANGE_LISTING_CATEGORY_MAX_LENGTH)) {
    throw new ToyExchangePublicationError('PUBLICATION_FAILED');
  }
  if (description === undefined || (description !== null && Array.from(description).length > TOY_EXCHANGE_LISTING_DESCRIPTION_MAX_LENGTH)) {
    throw new ToyExchangePublicationError('PUBLICATION_FAILED');
  }
  if (!Number.isSafeInteger(input.askingValueStars) || input.askingValueStars < 0) {
    throw new ToyExchangePublicationError('PUBLICATION_FAILED');
  }

  return { toyAnalysisItemId, name, category, description, askingValueStars: input.askingValueStars };
}

function parsePublicationResponse(value: unknown): PublishedToyExchangeListing {
  if (!isRecord(value) || !hasExactKeys(value, ['listing']) || !isRecord(value.listing)) {
    throw new ToyExchangePublicationError('PUBLICATION_FAILED');
  }
  const listing = value.listing;
  if (!hasExactKeys(listing, [
    'id', 'sourceToyAnalysisItemId', 'name', 'category', 'description', 'condition',
    'askingValueStars', 'status', 'publishedAt',
  ])) {
    throw new ToyExchangePublicationError('PUBLICATION_FAILED');
  }

  const id = readNonblankString(listing.id);
  const sourceToyAnalysisItemId = readNonblankString(listing.sourceToyAnalysisItemId);
  const name = readNonblankString(listing.name);
  const category = listing.category === null ? null : readNonblankString(listing.category);
  const description = listing.description === null ? null : readNonblankString(listing.description);
  const condition = listing.condition;
  const publishedAt = readTimestamp(listing.publishedAt);

  if (
    !id || !sourceToyAnalysisItemId || !name ||
    (listing.category !== null && !category) ||
    (listing.description !== null && !description) ||
    !isListableCondition(condition) ||
    !Number.isSafeInteger(listing.askingValueStars) || Number(listing.askingValueStars) < 0 ||
    listing.status !== 'AVAILABLE' || !publishedAt
  ) {
    throw new ToyExchangePublicationError('PUBLICATION_FAILED');
  }

  return {
    id,
    sourceToyAnalysisItemId,
    name,
    category,
    description,
    condition,
    askingValueStars: Number(listing.askingValueStars),
    status: 'AVAILABLE',
    publishedAt,
  };
}

async function readProviderErrorCode(error: unknown): Promise<string | null> {
  if (!isRecord(error) || !('context' in error)) {
    return null;
  }
  const context = error.context;
  if (!isRecord(context) && !(context instanceof Response)) {
    return null;
  }
  try {
    const body = await (context as Response).clone().json();
    return isRecord(body) && isRecord(body.error) && typeof body.error.code === 'string'
      ? body.error.code
      : null;
  } catch {
    return null;
  }
}

function isListableCondition(value: unknown): value is ListableToyCondition {
  return value === 'EXCELLENT' || value === 'GOOD' || value === 'FAIR' || value === 'POOR';
}

function readNonblankString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function readTimestamp(value: unknown): string | null {
  return typeof value === 'string' && value.trim() && !Number.isNaN(Date.parse(value))
    ? value
    : null;
}

function hasExactKeys(value: Record<string, unknown>, keys: string[]): boolean {
  return Object.keys(value).length === keys.length &&
    keys.every((key) => Object.prototype.hasOwnProperty.call(value, key));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
