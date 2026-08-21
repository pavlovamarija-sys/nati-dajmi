export type ListingPreparationUiStatus =
  | 'UNAUTHENTICATED'
  | 'SOURCE_NOT_FOUND'
  | 'CROP_NOT_READY'
  | 'VALUATION_MISSING'
  | 'CONDITION_NOT_CONFIRMED'
  | 'UNSUPPORTED_VALUATION'
  | 'INVALID_AUTHORITATIVE_DATA';

export type ListingPreparationUiState = {
  title: string;
  message: string;
  returnToResults: boolean;
};

const PREPARATION_UI_STATES: Record<ListingPreparationUiStatus, ListingPreparationUiState> = {
  UNAUTHENTICATED: {
    title: 'Потребна е најава',
    message: 'Најави се повторно за да ја подготвиш играчката за размена.',
    returnToResults: false,
  },
  SOURCE_NOT_FOUND: {
    title: 'Играчката не е достапна',
    message: 'Не можевме да ја најдеме оваа анализирана играчка.',
    returnToResults: true,
  },
  CROP_NOT_READY: {
    title: 'Фотографијата не е подготвена',
    message: 'Фотографијата од играчката сè уште не е подготвена за оглас.',
    returnToResults: true,
  },
  VALUATION_MISSING: {
    title: 'Недостасува проценка',
    message: 'Прво треба да се подготви проценката на играчката.',
    returnToResults: true,
  },
  CONDITION_NOT_CONFIRMED: {
    title: 'Потврди ја состојбата',
    message: 'Потврди ја состојбата на играчката во резултатите пред да продолжиш.',
    returnToResults: true,
  },
  UNSUPPORTED_VALUATION: {
    title: 'Потребна е понова проценка',
    message: 'Оваа постара проценка сè уште не може да се користи за оглас.',
    returnToResults: true,
  },
  INVALID_AUTHORITATIVE_DATA: {
    title: 'Не можеме да го подготвиме огласот',
    message: 'Податоците за играчката не се целосни. Обиди се повторно подоцна.',
    returnToResults: true,
  },
};

export function getListingPreparationUiState(status: ListingPreparationUiStatus): ListingPreparationUiState {
  return PREPARATION_UI_STATES[status];
}

export type ParsedAskingValue =
  | { valid: true; value: number }
  | { valid: false; value: null };

export function parseToyExchangeAskingValue(input: string): ParsedAskingValue {
  const normalized = input.trim();
  if (!/^\d+$/.test(normalized)) {
    return { valid: false, value: null };
  }

  const value = Number(normalized);
  return Number.isSafeInteger(value) && value >= 0
    ? { valid: true, value }
    : { valid: false, value: null };
}

export function getInitialAskingValueInput(suggestedValue: number): string {
  if (!Number.isSafeInteger(suggestedValue) || suggestedValue < 0) {
    throw new Error('Suggested asking value must be a nonnegative integer.');
  }
  return String(suggestedValue);
}

export function buildToyExchangeListingReviewRoute(toyAnalysisItemId: string): {
  pathname: '/listings/new';
  params: { toyAnalysisItemId: string };
} {
  const normalizedItemId = toyAnalysisItemId.trim();
  if (!normalizedItemId) {
    throw new Error('A valid toy analysis item ID is required.');
  }
  return {
    pathname: '/listings/new',
    params: { toyAnalysisItemId: normalizedItemId },
  };
}
