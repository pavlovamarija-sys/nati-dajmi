import { useCallback, useEffect, useRef, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  getInitialAskingValueInput,
  getListingPreparationUiState,
  parseToyExchangeAskingValue,
  type ListingPreparationUiStatus,
} from '@/features/toy-exchange/domain/toy-exchange-listing-review';
import { prepareToyExchangeListing } from '@/features/toy-exchange/services/prepare-toy-exchange-listing';
import {
  publishToyExchangeListing,
  ToyExchangePublicationError,
} from '@/features/toy-exchange/services/publish-toy-exchange-listing';
import type { PreparedToyExchangeListing } from '@/features/toy-exchange/types/toy-exchange-listing';
import {
  TOY_EXCHANGE_LISTING_CATEGORY_MAX_LENGTH,
  TOY_EXCHANGE_LISTING_DESCRIPTION_MAX_LENGTH,
  TOY_EXCHANGE_LISTING_NAME_MAX_LENGTH,
} from '@/features/toy-exchange/domain/toy-exchange-listing-preparation';
import { TOY_CONDITION_LABELS } from '@/features/toy-analysis/domain/toy-condition-presentation';
import { getSuggestedToyPriceRange } from '@/features/toy-analysis/domain/suggested-toy-price';
import { shouldWarnForToyAskingPrice } from '@/features/toy-analysis/domain/toy-price-presentation';
import { supabase } from '@/lib/supabase/client';

const SIGNED_IMAGE_URL_LIFETIME_SECONDS = 30 * 60;

type ScreenState =
  | { status: 'loading' }
  | { status: 'failure'; reason: ListingPreparationUiStatus }
  | { status: 'error' }
  | { status: 'ready'; listing: PreparedToyExchangeListing };

export default function NewToyExchangeListingScreen() {
  const params = useLocalSearchParams<{ toyAnalysisItemId?: string | string[] }>();
  const toyAnalysisItemId = readRouteItemId(params.toyAnalysisItemId);
  const [state, setState] = useState<ScreenState>({ status: 'loading' });
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageUnavailable, setImageUnavailable] = useState(false);
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [askingValue, setAskingValue] = useState('');
  const [publicationState, setPublicationState] = useState<
    'idle' | 'publishing' | 'success' | 'conflict' | 'error'
  >('idle');
  const isMounted = useRef(true);
  const publicationInFlight = useRef(false);

  const loadListing = useCallback(async () => {
    if (!toyAnalysisItemId) {
      setState({ status: 'failure', reason: 'INVALID_AUTHORITATIVE_DATA' });
      return;
    }

    setState({ status: 'loading' });
    setImageUrl(null);
    setImageUnavailable(false);

    try {
      const result = await prepareToyExchangeListing(toyAnalysisItemId);
      if (!isMounted.current) {
        return;
      }
      if (result.status !== 'READY') {
        setState({ status: 'failure', reason: result.status });
        return;
      }

      setName(result.listing.name);
      setCategory(result.listing.category ?? '');
      setDescription('');
      setAskingValue(
        getInitialAskingValueInput(result.listing.suggestedAskingValueStars),
      );
      setState({ status: 'ready', listing: result.listing });

      const { data, error } = await supabase.storage
        .from('toy-shelf-images')
        .createSignedUrl(
          result.listing.imagePath,
          SIGNED_IMAGE_URL_LIFETIME_SECONDS,
        );

      if (!isMounted.current) {
        return;
      }
      if (error || !data?.signedUrl) {
        setImageUnavailable(true);
        return;
      }

      setImageUrl(data.signedUrl);
    } catch {
      if (isMounted.current) {
        setState({ status: 'error' });
      }
    }
  }, [toyAnalysisItemId]);

  useEffect(() => {
    isMounted.current = true;
    void loadListing();

    return () => {
      isMounted.current = false;
    };
  }, [loadListing]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <Pressable
            accessibilityLabel="Назад"
            accessibilityRole="button"
            hitSlop={12}
            onPress={() => router.back()}
            style={styles.backButton}
          >
            <Text style={styles.backLabel}>‹ Назад</Text>
          </Pressable>

          <Text style={styles.title}>Понуди играчка</Text>
          <Text style={styles.subtitle}>
            Провери ги податоците пред огласот да биде објавен.
          </Text>

          {renderContent()}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );

  function renderContent() {
    if (state.status === 'loading') {
      return (
        <View style={styles.centerState}>
          <ActivityIndicator color="#2E6B4F" size="large" />
          <Text style={styles.stateMessage}>Ја подготвуваме играчката...</Text>
        </View>
      );
    }

    if (state.status === 'error') {
      return (
        <FailureState
          message="Не можевме да го подготвиме огласот. Обиди се повторно."
          onAction={() => void loadListing()}
          title="Нешто не успеа"
          actionLabel="Обиди се повторно"
        />
      );
    }

    if (state.status === 'failure') {
      const uiState = getListingPreparationUiState(state.reason);
      return (
        <FailureState
          actionLabel={uiState.returnToResults ? 'Назад кон резултатите' : 'Назад'}
          message={uiState.message}
          onAction={() => router.back()}
          title={uiState.title}
        />
      );
    }

    const listing = state.listing;

    if (publicationState === 'success') {
      return (
        <View style={styles.failureCard}>
          <Text style={styles.successMark}>✓</Text>
          <Text style={styles.failureTitle}>Играчката е објавена.</Text>
          <Text style={styles.stateMessage}>
            Понудата е подготвена за идната размена.
          </Text>
          <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonLabel}>Назад</Text>
          </Pressable>
        </View>
      );
    }

    const parsedAskingValue = parseToyExchangeAskingValue(askingValue);
    const priceRange = getSuggestedToyPriceRange(
      listing.sourceEstimatedValueDenars,
    );
    const showHighPriceWarning = parsedAskingValue.valid &&
      shouldWarnForToyAskingPrice(
        listing.confirmedCondition,
        parsedAskingValue.value,
        priceRange.maxDenars,
      );
    const nameIsValid = Boolean(name.trim()) &&
      name.trim().length <= TOY_EXCHANGE_LISTING_NAME_MAX_LENGTH;
    const categoryIsValid = !category.length || (
      Boolean(category.trim()) &&
      category.trim().length <= TOY_EXCHANGE_LISTING_CATEGORY_MAX_LENGTH
    );
    const descriptionLength = Array.from(description).length;
    const descriptionIsValid = descriptionLength <= TOY_EXCHANGE_LISTING_DESCRIPTION_MAX_LENGTH;
    const formIsValid = nameIsValid && categoryIsValid &&
      descriptionIsValid && parsedAskingValue.valid;

    return (
      <View style={styles.formCard}>
        <View style={styles.imageFrame}>
          {imageUrl && !imageUnavailable ? (
            <Image
              accessibilityLabel={`Фотографија: ${listing.name}`}
              onError={() => setImageUnavailable(true)}
              resizeMode="contain"
              source={{ uri: imageUrl }}
              style={styles.image}
            />
          ) : imageUnavailable ? (
            <Text style={styles.imageUnavailable}>
              Фотографијата моментално не е достапна.
            </Text>
          ) : (
            <ActivityIndicator color="#2E6B4F" />
          )}
        </View>

        <Text style={styles.fieldLabel}>Име на играчката</Text>
        <TextInput
          accessibilityLabel="Име на играчката"
          maxLength={TOY_EXCHANGE_LISTING_NAME_MAX_LENGTH}
          onChangeText={setName}
          style={[styles.input, !nameIsValid && styles.inputInvalid]}
          value={name}
        />
        {!nameIsValid ? <Text style={styles.validationText}>Внеси име.</Text> : null}

        <Text style={styles.fieldLabel}>Категорија</Text>
        <TextInput
          accessibilityLabel="Категорија"
          maxLength={TOY_EXCHANGE_LISTING_CATEGORY_MAX_LENGTH}
          onChangeText={setCategory}
          placeholder="По избор"
          style={[styles.input, !categoryIsValid && styles.inputInvalid]}
          value={category}
        />

        <Text style={styles.fieldLabel}>Опис</Text>
        <TextInput
          accessibilityLabel="Опис (незадолжително)"
          multiline
          onChangeText={setDescription}
          style={[
            styles.input,
            styles.descriptionInput,
            !descriptionIsValid && styles.inputInvalid,
          ]}
          textAlignVertical="top"
          value={description}
        />
        <Text style={styles.characterCount}>
          {descriptionLength}/{TOY_EXCHANGE_LISTING_DESCRIPTION_MAX_LENGTH}
        </Text>
        {!descriptionIsValid ? (
          <Text style={styles.validationText}>
            Описот може да има најмногу {TOY_EXCHANGE_LISTING_DESCRIPTION_MAX_LENGTH} знаци.
          </Text>
        ) : null}

        <View style={styles.readonlySection}>
          <Text style={styles.readonlyLabel}>Потврдена состојба</Text>
          <Text style={styles.readonlyValue}>
            {TOY_CONDITION_LABELS[listing.confirmedCondition]}
          </Text>
          <Text style={styles.readonlyHint}>
            Состојбата можеш да ја измениш во резултатите од анализата.
          </Text>
        </View>

        <View style={styles.valueRow}>
          <Text style={styles.readonlyLabel}>Проценета вредност</Text>
          <Text style={styles.estimatedValue}>
            {listing.sourceEstimatedValueDenars} денари
          </Text>
        </View>

        <Text style={styles.fieldLabel}>Вредност за размена</Text>
        <TextInput
          accessibilityLabel="Вредност за размена во ѕвездички"
          inputMode="numeric"
          keyboardType="number-pad"
          onChangeText={setAskingValue}
          placeholder="Внеси број на ѕвездички"
          style={[styles.input, !parsedAskingValue.valid && styles.inputInvalid]}
          value={askingValue}
        />
        <Text style={styles.helperText}>1 ѕвездичка = 1 денар</Text>
        {!parsedAskingValue.valid ? (
          <Text style={styles.validationText}>
            Внеси цел број од 0 или повеќе.
          </Text>
        ) : null}

        {showHighPriceWarning ? (
          <View style={styles.warningBox}>
            <Text style={styles.warningTitle}>Вредноста е повисока од предложениот опсег.</Text>
            <Text style={styles.warningText}>
              Играчките со значително повисока вредност може потешко да најдат заинтересиран родител.
            </Text>
          </View>
        ) : null}

        {publicationState === 'conflict' ? (
          <Text style={styles.publicationError}>
            Оваа играчка веќе е понудена за размена.
          </Text>
        ) : null}
        {publicationState === 'error' ? (
          <Text style={styles.publicationError}>
            Не успеавме да ја објавиме играчката. Обиди се повторно.
          </Text>
        ) : null}

        <Pressable
          accessibilityRole="button"
          disabled={!formIsValid || publicationState === 'publishing'}
          onPress={() => void publishListing(listing)}
          style={[
            styles.publishButton,
            (!formIsValid || publicationState === 'publishing') && styles.publishButtonDisabled,
          ]}
        >
          <Text style={styles.publishButtonLabel}>
            {publicationState === 'publishing'
              ? 'Ја објавуваме играчката...'
              : 'Објави'}
          </Text>
        </Pressable>
      </View>
    );
  }

  async function publishListing(listing: PreparedToyExchangeListing): Promise<void> {
    if (publicationInFlight.current) {
      return;
    }

    const parsedAskingValue = parseToyExchangeAskingValue(askingValue);
    const normalizedName = name.trim();
    const normalizedCategory = category.trim();
    const normalizedDescription = description.trim();
    if (
      !parsedAskingValue.valid ||
      !normalizedName ||
      normalizedName.length > TOY_EXCHANGE_LISTING_NAME_MAX_LENGTH ||
      normalizedCategory.length > TOY_EXCHANGE_LISTING_CATEGORY_MAX_LENGTH ||
      Array.from(normalizedDescription).length > TOY_EXCHANGE_LISTING_DESCRIPTION_MAX_LENGTH
    ) {
      return;
    }

    publicationInFlight.current = true;
    setPublicationState('publishing');
    try {
      await publishToyExchangeListing({
        toyAnalysisItemId: listing.sourceToyAnalysisItemId,
        name: normalizedName,
        category: normalizedCategory || null,
        description: normalizedDescription || null,
        askingValueStars: parsedAskingValue.value,
      });
      if (isMounted.current) {
        setPublicationState('success');
      }
    } catch (error) {
      if (isMounted.current) {
        setPublicationState(
          error instanceof ToyExchangePublicationError &&
              error.code === 'ACTIVE_LISTING_EXISTS'
            ? 'conflict'
            : 'error',
        );
      }
    } finally {
      publicationInFlight.current = false;
    }
  }
}

function FailureState({
  actionLabel,
  message,
  onAction,
  title,
}: {
  actionLabel: string;
  message: string;
  onAction: () => void;
  title: string;
}) {
  return (
    <View style={styles.failureCard}>
      <Text style={styles.failureTitle}>{title}</Text>
      <Text style={styles.stateMessage}>{message}</Text>
      <Pressable accessibilityRole="button" onPress={onAction} style={styles.secondaryButton}>
        <Text style={styles.secondaryButtonLabel}>{actionLabel}</Text>
      </Pressable>
    </View>
  );
}

function readRouteItemId(value: string | string[] | undefined): string | null {
  if (typeof value !== 'string' || !value.trim()) {
    return null;
  }
  return value.trim();
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safeArea: { backgroundColor: '#F7F5F0', flex: 1 },
  content: { paddingBottom: 42, paddingHorizontal: 24, paddingTop: 8 },
  backButton: { alignSelf: 'flex-start', justifyContent: 'center', minHeight: 44 },
  backLabel: { color: '#285B43', fontSize: 17, fontWeight: '700' },
  title: { color: '#1E2A24', fontSize: 31, fontWeight: '800', marginTop: 8 },
  subtitle: { color: '#59635E', fontSize: 15, lineHeight: 22, marginTop: 7 },
  centerState: { alignItems: 'center', gap: 12, paddingVertical: 70 },
  stateMessage: { color: '#59635E', fontSize: 15, lineHeight: 22, textAlign: 'center' },
  formCard: { backgroundColor: '#FFFFFF', borderColor: '#E4DFD5', borderRadius: 16, borderWidth: 1, marginTop: 24, padding: 18 },
  imageFrame: { alignItems: 'center', backgroundColor: '#F5F2EC', borderRadius: 13, height: 210, justifyContent: 'center', marginBottom: 20, overflow: 'hidden' },
  image: { height: '100%', width: '100%' },
  imageUnavailable: { color: '#6B746F', fontSize: 14, paddingHorizontal: 20, textAlign: 'center' },
  fieldLabel: { color: '#2D3B34', fontSize: 14, fontWeight: '800', marginBottom: 7, marginTop: 16 },
  input: { backgroundColor: '#FFFFFF', borderColor: '#D9D5CC', borderRadius: 10, borderWidth: 1, color: '#1E2A24', fontSize: 16, minHeight: 48, paddingHorizontal: 13 },
  inputInvalid: { borderColor: '#B96A5A' },
  descriptionInput: { minHeight: 110, paddingTop: 12 },
  characterCount: { color: '#7A837E', fontSize: 12, marginTop: 5, textAlign: 'right' },
  validationText: { color: '#9A4E43', fontSize: 12, marginTop: 5 },
  helperText: { color: '#6B746F', fontSize: 12, marginTop: 6 },
  readonlySection: { backgroundColor: '#F1F6F2', borderRadius: 11, marginTop: 20, padding: 14 },
  readonlyLabel: { color: '#59635E', fontSize: 13, fontWeight: '700' },
  readonlyValue: { color: '#2E6B4F', fontSize: 19, fontWeight: '800', marginTop: 3 },
  readonlyHint: { color: '#6B746F', fontSize: 12, lineHeight: 18, marginTop: 5 },
  valueRow: { marginTop: 20 },
  estimatedValue: { color: '#1E2A24', fontSize: 21, fontWeight: '800', marginTop: 4 },
  warningBox: { backgroundColor: '#FFF6E5', borderColor: '#F0D9A8', borderRadius: 10, borderWidth: 1, marginTop: 14, padding: 11 },
  warningTitle: { color: '#76551E', fontSize: 13, fontWeight: '800' },
  warningText: { color: '#76551E', fontSize: 12, lineHeight: 18, marginTop: 4 },
  publishButton: { alignItems: 'center', backgroundColor: '#2E6B4F', borderRadius: 11, justifyContent: 'center', marginTop: 24, minHeight: 50, paddingHorizontal: 18 },
  publishButtonDisabled: { backgroundColor: '#B8C2BC' },
  publishButtonLabel: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
  publicationError: { color: '#9A4E43', fontSize: 13, lineHeight: 19, marginTop: 14 },
  successMark: { color: '#2E6B4F', fontSize: 34, fontWeight: '900', marginBottom: 8 },
  failureCard: { alignItems: 'center', backgroundColor: '#FFFFFF', borderColor: '#E4DFD5', borderRadius: 15, borderWidth: 1, marginTop: 30, padding: 24 },
  failureTitle: { color: '#1E2A24', fontSize: 20, fontWeight: '800', marginBottom: 8, textAlign: 'center' },
  secondaryButton: { borderColor: '#2E6B4F', borderRadius: 10, borderWidth: 1, justifyContent: 'center', marginTop: 18, minHeight: 44, paddingHorizontal: 18 },
  secondaryButtonLabel: { color: '#2E6B4F', fontSize: 14, fontWeight: '800' },
});
