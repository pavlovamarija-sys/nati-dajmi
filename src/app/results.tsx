import { useCallback, useEffect, useRef, useState } from 'react';
import { router } from 'expo-router';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  confirmToyCondition,
  getOrCreateToyValuation,
} from '@/features/toy-analysis/services/toy-valuation';
import { getToyValuation } from '@/features/toy-analysis/repositories/toy-valuation-repository';
import {
  clearToyCropUploadStatus,
  ensureCropReadyForValuation,
  retryToyCropUpload,
} from '@/features/toy-analysis/services/toy-crop-readiness';
import { supabase } from '@/lib/supabase/client';
import { useToyAnalysisResult } from '@/features/toy-analysis/toy-analysis-result-context';
import type {
  ToyAnalysisItem,
  ToyRecommendation,
} from '@/features/toy-analysis/types/toy-analysis';
import type {
  ImageAwareToyValuation,
  ParentReportedToyIssue,
  PersistedToyValuation,
  ToyCondition,
} from '@/features/toy-analysis/types/toy-valuation';
import {
  getSuggestedToyPriceRange,
  isValidAskingPrice,
} from '@/features/toy-analysis/domain/suggested-toy-price';
import {
  hasSuggestedToyPriceRange,
  shouldWarnForToyAskingPrice,
} from '@/features/toy-analysis/domain/toy-price-presentation';

const sections: { recommendation: ToyRecommendation; title: string; color: string }[] = [
  { recommendation: 'KEEP', title: 'Задржи', color: '#2E6B4F' },
  { recommendation: 'ROTATE', title: 'Ротирај', color: '#A2622D' },
  { recommendation: 'PASS_ON', title: 'Размени', color: '#8A4D51' },
];

export default function ResultsScreen() {
  const { result } = useToyAnalysisResult();

  if (!result) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.emptyState}>
          <Text style={styles.title}>Сè уште нема резултати</Text>
          <Text style={styles.subtitle}>Анализирај ги играчките за да добиеш препораки.</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.replace('/analyze')}
            style={styles.primaryButton}
          >
            <Text style={styles.primaryButtonLabel}>Анализирај ги играчките</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <Pressable
          accessibilityLabel="Назад"
          accessibilityRole="button"
          hitSlop={12}
          onPress={() => router.back()}
          style={styles.backButton}
        >
          <Text style={styles.backLabel}>‹ Назад</Text>
        </Pressable>

        <View style={styles.header}>
          <Text style={styles.title}>Препораки за играчките</Text>
          <Text style={styles.subtitle}>
            Едноставен почеток за да одлучиш што да задржиш, ротираш или размениш.
          </Text>
        </View>

        {sections.map((section) => {
          const toys = result.toys.filter(
            (toy) => toy.recommendation === section.recommendation,
          );

          return (
            <View key={section.recommendation} style={styles.section}>
              <View style={styles.sectionHeading}>
                <View style={[styles.indicator, { backgroundColor: section.color }]} />
                <Text style={[styles.sectionTitle, { color: section.color }]}>
                  {section.title}
                </Text>
              </View>

              <View style={styles.cardList}>
                {toys.map((toy) => (
                  <ToyCard
                    analysisId={result.analysisId}
                    key={toy.id}
                    toy={toy}
                  />
                ))}
              </View>
            </View>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

function ToyCard({
  analysisId,
  toy,
}: {
  analysisId: string;
  toy: ToyAnalysisItem;
}) {
  const showPlayIdeas =
    toy.recommendation === 'KEEP' &&
    Array.isArray(toy.playIdeas) &&
    toy.playIdeas.length > 0;

  return (
    <View style={styles.card}>
      {toy.imageUri ? (
        <View style={styles.toyImageFrame}>
          <Image
            accessibilityLabel={`Фотографија: ${toy.name}`}
            resizeMode="contain"
            source={{ uri: toy.imageUri }}
            style={styles.toyImage}
          />
        </View>
      ) : null}
      <Text style={styles.toyName}>{toy.name}</Text>
      {toy.category ? <Text style={styles.category}>{toy.category}</Text> : null}
      <Text style={styles.reason}>{toy.reason}</Text>

      {showPlayIdeas ? (
        <View style={styles.playIdeasSection}>
          <Text style={styles.playIdeasHeading}>Идеи за игра</Text>
          <View style={styles.playIdeasList}>
            {toy.playIdeas.map((idea, index) => (
              <View key={`${toy.id}-play-idea-${index}`} style={styles.playIdea}>
                <Text style={styles.playIdeaTitle}>
                  {index + 1}. {idea.title}
                </Text>
                <Text style={styles.playIdeaDescription}>{idea.description}</Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      <ToyValuationPanel
        analysisId={analysisId}
        toyAnalysisItemId={toy.id}
        toyImageUri={toy.imageUri}
      />
    </View>
  );
}

const CONDITION_LABELS: Record<ToyCondition, string> = {
  EXCELLENT: 'Одлична',
  GOOD: 'Добра',
  FAIR: 'Солидна',
  POOR: 'Лоша',
  UNKNOWN: 'Не може да се процени',
};

const ISSUE_LABELS: Record<ParentReportedToyIssue, string> = {
  MISSING_PART: 'Недостасува дел',
  BROKEN_PART: 'Скршен дел',
  DOES_NOT_WORK: 'Не работи',
  HEAVY_WEAR: 'Многу е излижана',
  OTHER: 'Друго',
};

const CONDITION_OPTIONS: ToyCondition[] = [
  'EXCELLENT',
  'GOOD',
  'FAIR',
  'POOR',
  'UNKNOWN',
];

const ISSUE_OPTIONS: ParentReportedToyIssue[] = [
  'MISSING_PART',
  'BROKEN_PART',
  'DOES_NOT_WORK',
  'HEAVY_WEAR',
  'OTHER',
];

function ToyValuationPanel({
  analysisId,
  toyAnalysisItemId,
  toyImageUri,
}: {
  analysisId?: string;
  toyAnalysisItemId: string;
  toyImageUri?: string;
}) {
  const [state, setState] = useState<
    | { status: 'loading' }
    | { status: 'crop-failed' }
    | { status: 'success'; valuation: PersistedToyValuation }
    | { status: 'error' }
  >({ status: 'loading' });
  const [loadingMessage, setLoadingMessage] = useState(
    'Ја проценуваме состојбата...',
  );
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [editingCondition, setEditingCondition] = useState<ToyCondition>('GOOD');
  const [editingIssues, setEditingIssues] = useState<ParentReportedToyIssue[]>([]);
  const [editingNote, setEditingNote] = useState('');
  const [askingPrice, setAskingPrice] = useState('');
  const [isGifted, setIsGifted] = useState(false);
  const hasLoaded = useRef(false);
  const isMounted = useRef(true);
  const retryInFlight = useRef(false);
  const confirmationInFlight = useRef(false);

  const loadValuation = useCallback(async () => {
    if (isMounted.current) {
      setLoadingMessage('Ја проценуваме состојбата...');
      setState({ status: 'loading' });
    }
    try {
      const existingValuation = await getToyValuation(toyAnalysisItemId);
      if (!isMounted.current) {
        return;
      }
      if (existingValuation) {
        if (existingValuation.generation === 'v2') {
          setEditingCondition(
            existingValuation.confirmedCondition ?? existingValuation.aiCondition,
          );
          setEditingIssues([...existingValuation.parentReportedIssues]);
          setEditingNote(existingValuation.parentConditionNote ?? '');
        }
        setState({ status: 'success', valuation: existingValuation });
        return;
      }

      const isReady = await ensureCropReadyForValuation({
        toyAnalysisItemId,
        analysisId,
        toyImageUri,
        onUploadPending: () => {
          if (isMounted.current) {
            setLoadingMessage('Ја подготвуваме фотографијата...');
          }
        },
      });

      if (!isMounted.current) {
        return;
      }
      if (!isReady.ready) {
        setState({
          status: isReady.reason === 'crop-unavailable' ? 'crop-failed' : 'error',
        });
        return;
      }

      setLoadingMessage('Ја проценуваме состојбата...');
      const result = await getOrCreateToyValuation(toyAnalysisItemId);
      if (!isMounted.current) {
        return;
      }
      if (result.valuation.generation === 'v2') {
        setEditingCondition(
          result.valuation.confirmedCondition ?? result.valuation.aiCondition,
        );
        setEditingIssues([...result.valuation.parentReportedIssues]);
        setEditingNote(result.valuation.parentConditionNote ?? '');
      }
      setState({ status: 'success', valuation: result.valuation });
    } catch {
      if (isMounted.current) {
        setState({ status: 'error' });
      }
    }
  }, [toyAnalysisItemId, analysisId, toyImageUri]);

  useEffect(() => {
    isMounted.current = true;
    if (!hasLoaded.current) {
      hasLoaded.current = true;
      void loadValuation();
    }
    return () => {
      isMounted.current = false;
    };
  }, [loadValuation]);

  async function handleRetryCrop() {
    if (retryInFlight.current) {
      return;
    }
    retryInFlight.current = true;
    if (isMounted.current) {
      setLoadingMessage('Ја подготвуваме фотографијата...');
      setState({ status: 'loading' });
    }
    try {
      if (toyImageUri && analysisId) {
        const { data: authData, error } = await supabase.auth.getUser();
        if (error || !authData.user?.id) {
          if (isMounted.current) {
            setState({ status: 'error' });
          }
          return;
        }
        await retryToyCropUpload(authData.user.id, analysisId, {
          toyItemId: toyAnalysisItemId,
          imageUri: toyImageUri,
        });
      } else {
        clearToyCropUploadStatus(toyAnalysisItemId);
      }
      await loadValuation();
    } catch {
      if (isMounted.current) {
        setState({ status: 'error' });
      }
    } finally {
      retryInFlight.current = false;
    }
  }

  function openEditor(valuation: ImageAwareToyValuation): void {
    setEditingCondition(valuation.confirmedCondition ?? valuation.aiCondition);
    setEditingIssues([...valuation.parentReportedIssues]);
    setEditingNote(valuation.parentConditionNote ?? '');
    setSaveError(null);
    setIsEditing(true);
  }

  function cancelEditor(valuation: ImageAwareToyValuation): void {
    setEditingCondition(valuation.confirmedCondition ?? valuation.aiCondition);
    setEditingIssues([...valuation.parentReportedIssues]);
    setEditingNote(valuation.parentConditionNote ?? '');
    setSaveError(null);
    setIsEditing(false);
  }

  async function saveEditedCondition(): Promise<void> {
    const current = state.status === 'success' && state.valuation.generation === 'v2'
      ? state.valuation
      : null;
    if (!current || confirmationInFlight.current) {
      return;
    }

    confirmationInFlight.current = true;
    setIsSaving(true);
    setSaveError(null);
    try {
      const updated = await confirmToyCondition({
        toyAnalysisItemId,
        confirmedCondition: editingCondition,
        parentReportedIssues: editingIssues,
        parentConditionNote: editingNote.trim() || null,
      });
      setState({ status: 'success', valuation: updated });
      setIsEditing(false);
    } catch {
      // Keep the modal open so the parent can retry without losing their choices.
      setSaveError('Не можевме да ја зачуваме состојбата. Обиди се повторно.');
    } finally {
      confirmationInFlight.current = false;
      setIsSaving(false);
    }
  }

  function toggleIssue(issue: ParentReportedToyIssue): void {
    setEditingIssues((current) => current.includes(issue)
      ? current.filter((item) => item !== issue)
      : [...current, issue]);
  }

  function setGiftSelection(gifted: boolean): void {
    setIsGifted(gifted);
    setAskingPrice(gifted ? '0' : '');
  }

  if (state.status === 'loading') {
    return (
      <View style={styles.valuationPanel}>
        <View style={styles.valuationLoading}>
          <ActivityIndicator color="#2E6B4F" size="small" />
          <Text style={styles.valuationLoadingText}>{loadingMessage}</Text>
        </View>
      </View>
    );
  }

  if (state.status === 'crop-failed') {
    return (
      <View style={styles.valuationPanel}>
        <Text style={styles.valuationUnavailable}>
          Не успеавме да ја подготвиме фотографијата за проценка.
        </Text>
        <Pressable
          onPress={() => void handleRetryCrop()}
          style={styles.valuationRetry}
        >
          <Text style={styles.valuationRetryLabel}>Обиди се повторно</Text>
        </Pressable>
      </View>
    );
  }

  if (state.status === 'error') {
    return (
      <View style={styles.valuationPanel}>
        <Text style={styles.valuationUnavailable}>Проценката моментално не е достапна.</Text>
        <Pressable onPress={() => void loadValuation()} style={styles.valuationRetry}>
          <Text style={styles.valuationRetryLabel}>Обиди се повторно</Text>
        </Pressable>
      </View>
    );
  }

  const valuation = state.valuation;
  if (valuation.generation === 'v1') {
    const priceRange = getSuggestedToyPriceRange(valuation.estimatedValueDenars);
    return (
      <View style={styles.valuationPanel}>
        <PriceGuidance
          askingPrice={askingPrice}
          condition={null}
          isGifted={false}
          onAskingPriceChange={setAskingPrice}
          onGiftChange={setGiftSelection}
          range={priceRange}
        />
      </View>
    );
  }

  const isConfirmed = valuation.confirmedCondition !== null;
  const isConditionEditable = !isConfirmed || isEditing;
  const showAuthoritativePrice = isConfirmed && !isEditing;
  const displayedCondition = valuation.confirmedCondition ?? valuation.aiCondition;
  const issues = valuation.parentReportedIssues.length > 0
    ? valuation.parentReportedIssues.map((issue) => ISSUE_LABELS[issue]).join(', ')
    : null;
  const effectiveCondition = valuation.confirmedCondition ?? valuation.aiCondition;
  const priceRange = showAuthoritativePrice && hasSuggestedToyPriceRange(effectiveCondition)
    ? getSuggestedToyPriceRange(valuation.estimatedValueDenars)
    : null;

  return (
    <View style={styles.valuationPanel}>
      <Text style={styles.valuationHeading}>Состојба</Text>
      <Text style={styles.valuationConditionCaption}>
        Проценето од фотографијата: {CONDITION_LABELS[valuation.aiCondition]}
      </Text>
      <Text style={styles.conditionExplanation}>
        Проценката се базира само на она што е видливо на фотографијата. Провери ја состојбата пред да продолжиш.
      </Text>

      {isConditionEditable ? (
        <>
          <View style={styles.conditionOptions}>
            {CONDITION_OPTIONS.map((condition) => (
              <Pressable
                accessibilityRole="button"
                disabled={isSaving}
                key={condition}
                onPress={() => setEditingCondition(condition)}
                style={[
                  styles.conditionOption,
                  editingCondition === condition && styles.conditionOptionSelected,
                ]}
              >
                <Text style={[
                  styles.conditionOptionLabel,
                  editingCondition === condition && styles.conditionOptionLabelSelected,
                ]}>
                  {CONDITION_LABELS[condition]}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.issueHeading}>Дали има оштетување или недостасува дел?</Text>
          <View style={styles.issueOptions}>
            {ISSUE_OPTIONS.map((issue) => (
              <Pressable
                disabled={isSaving}
                key={issue}
                onPress={() => toggleIssue(issue)}
                style={styles.issueOption}
              >
                <View style={[
                  styles.issueCheckbox,
                  editingIssues.includes(issue) && styles.issueCheckboxSelected,
                ]}>
                  {editingIssues.includes(issue) ? <Text style={styles.issueCheckmark}>✓</Text> : null}
                </View>
                <Text style={styles.issueLabel}>{ISSUE_LABELS[issue]}</Text>
              </Pressable>
            ))}
          </View>

          <TextInput
            accessibilityLabel="Забелешка (по избор)"
            editable={!isSaving}
            multiline
            onChangeText={setEditingNote}
            placeholder="Забелешка (по избор)"
            style={styles.conditionNoteInput}
            value={editingNote}
          />

          <View style={styles.valuationActions}>
            {isConfirmed ? (
              <Pressable
                disabled={isSaving}
                onPress={() => cancelEditor(valuation)}
                style={styles.valuationSecondaryAction}
              >
                <Text style={styles.valuationSecondaryActionLabel}>Откажи</Text>
              </Pressable>
            ) : null}
            <Pressable
              disabled={isSaving}
              onPress={() => void saveEditedCondition()}
              style={styles.valuationPrimaryAction}
            >
              <Text style={styles.valuationPrimaryActionLabel}>
                {isSaving ? 'Ја потврдуваме состојбата...' : 'Потврди состојба'}
              </Text>
            </Pressable>
          </View>
          {saveError ? <Text style={styles.valuationSaveError}>{saveError}</Text> : null}
          <Text style={styles.prePriceMessage}>
            Потврди ја состојбата за да ја видиш предложената цена.
          </Text>
        </>
      ) : (
        <>
          <Text style={styles.confirmedMessage}>Состојбата е потврдена.</Text>
          <Text style={styles.valuationCondition}>{CONDITION_LABELS[displayedCondition]}</Text>
          {valuation.aiCondition !== valuation.confirmedCondition ? (
            <Text style={styles.valuationProvenance}>
              Проценка од фотографијата: {CONDITION_LABELS[valuation.aiCondition]}
            </Text>
          ) : null}
          {issues ? <Text style={styles.valuationIssues}>Пријавено: {issues}</Text> : null}
          <Pressable
            disabled={isSaving}
            onPress={() => openEditor(valuation)}
            style={styles.valuationSecondaryAction}
          >
            <Text style={styles.valuationSecondaryActionLabel}>Измени</Text>
          </Pressable>
        </>
      )}

      {showAuthoritativePrice ? (
        <PriceGuidance
          askingPrice={askingPrice}
          condition={effectiveCondition}
          isGifted={isGifted}
          onAskingPriceChange={setAskingPrice}
          onGiftChange={setGiftSelection}
          range={priceRange}
        />
      ) : null}
    </View>
  );
}

function PriceGuidance({
  askingPrice,
  condition,
  isGifted,
  onAskingPriceChange,
  onGiftChange,
  range,
}: {
  askingPrice: string;
  condition: ToyCondition | null;
  isGifted: boolean;
  onAskingPriceChange: (value: string) => void;
  onGiftChange: (gifted: boolean) => void;
  range: { minDenars: number; maxDenars: number } | null;
}) {
  const isPoor = condition === 'POOR';
  const giftSelected = isPoor && isGifted;
  const parsedAskingPrice = askingPrice === '' ? null : Number(askingPrice);
  const showWarning = parsedAskingPrice !== null &&
    condition !== null &&
    range !== null &&
    isValidAskingPrice(parsedAskingPrice) &&
    shouldWarnForToyAskingPrice(
      condition,
      parsedAskingPrice,
      range.maxDenars,
    );

  return (
    <View style={styles.priceGuidance}>
      {range ? (
        <>
          <Text style={styles.valuationHeading}>Предложен ценовен опсег</Text>
          <Text style={styles.valuationValue}>
            {range.minDenars}–{range.maxDenars} денари
          </Text>
          <Text style={styles.priceExplanation}>
            Ова е само предлог врз основа на видот, состојбата и достапните информации за играчката. Ти ја одредуваш цената.
          </Text>
        </>
      ) : null}

      {isPoor ? (
        <View style={styles.safetyNotice}>
          <Text style={styles.safetyNoticeTitle}>Внимание</Text>
          <Text style={styles.safetyNoticeText}>
            Оваа играчка е означена дека е во лоша состојба. Оштетените или скршените делови може да претставуваат ризик од повреда, а малите или одвоените делови може да претставуваат опасност од задушување за мали деца. Провери дали играчката е безбедна пред да ја понудиш или подариш.
          </Text>
        </View>
      ) : null}

      <Text style={styles.askingPriceHeading}>Колку ѕвездички бараш?</Text>
      <TextInput
        accessibilityLabel="Колку ѕвездички бараш?"
        editable={!giftSelected}
        keyboardType="number-pad"
        onChangeText={(value) => onAskingPriceChange(value.replace(/[^0-9]/g, ''))}
        placeholder="Внеси цена"
        style={[
          styles.askingPriceInput,
          giftSelected && styles.askingPriceInputDisabled,
        ]}
        value={askingPrice}
      />

      {isPoor ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => onGiftChange(!giftSelected)}
          style={[
            styles.giftButton,
            giftSelected && styles.giftButtonSelected,
          ]}
        >
          <Text style={[
            styles.giftButtonLabel,
            giftSelected && styles.giftButtonLabelSelected,
          ]}>
            {giftSelected ? '✓ Подари' : 'Подари'}
          </Text>
        </Pressable>
      ) : null}

      {showWarning ? (
        <View style={styles.priceWarning}>
          <Text style={styles.priceWarningTitle}>Цената е повисока од предложениот опсег.</Text>
          <Text style={styles.priceWarningText}>
            Играчките со значително повисока цена може потешко да најдат заинтересиран родител. Секако, ти ја одредуваш цената.
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: '#F7F5F0',
    flex: 1,
  },
  content: {
    paddingBottom: 40,
    paddingHorizontal: 24,
    paddingTop: 8,
  },
  backButton: {
    alignSelf: 'flex-start',
    justifyContent: 'center',
    minHeight: 44,
  },
  backLabel: {
    color: '#285B43',
    fontSize: 17,
    fontWeight: '600',
  },
  header: {
    marginBottom: 30,
    marginTop: 10,
  },
  title: {
    color: '#1E2A24',
    fontSize: 32,
    fontWeight: '700',
    letterSpacing: -0.8,
    marginBottom: 8,
  },
  subtitle: {
    color: '#59635E',
    fontSize: 16,
    lineHeight: 24,
  },
  section: {
    marginBottom: 30,
  },
  sectionHeading: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 9,
    marginBottom: 12,
  },
  indicator: {
    borderRadius: 4,
    height: 8,
    width: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  cardList: {
    gap: 12,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E4DFD5',
    borderRadius: 14,
    borderWidth: 1,
    padding: 18,
  },
  toyName: {
    color: '#1E2A24',
    fontSize: 17,
    fontWeight: '700',
  },
  toyImageFrame: {
    backgroundColor: '#F5F2EC',
    borderColor: '#E8E2D8',
    borderRadius: 12,
    borderWidth: 1,
    height: 180,
    marginBottom: 15,
    overflow: 'hidden',
    width: '100%',
  },
  toyImage: {
    height: '100%',
    width: '100%',
  },
  category: {
    color: '#6B746F',
    fontSize: 13,
    fontWeight: '600',
    marginTop: 4,
  },
  reason: {
    color: '#4F5A54',
    fontSize: 15,
    lineHeight: 22,
    marginTop: 10,
  },
  playIdeasSection: {
    borderTopColor: '#E8E4DB',
    borderTopWidth: 1,
    marginTop: 16,
    paddingTop: 14,
  },
  playIdeasHeading: {
    color: '#2E6B4F',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 10,
  },
  playIdeasList: {
    gap: 12,
  },
  playIdea: {
    gap: 3,
  },
  playIdeaTitle: {
    color: '#2D3B34',
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 21,
  },
  playIdeaDescription: {
    color: '#59635E',
    fontSize: 14,
    lineHeight: 20,
    paddingLeft: 18,
  },
  valuationPanel: {
    borderTopColor: '#E8E4DB',
    borderTopWidth: 1,
    marginTop: 18,
    paddingTop: 15,
  },
  valuationLoading: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 9,
  },
  valuationLoadingText: {
    color: '#6B746F',
    fontSize: 13,
  },
  valuationUnavailable: {
    color: '#6B746F',
    fontSize: 13,
    lineHeight: 19,
  },
  valuationRetry: {
    alignSelf: 'flex-start',
    marginTop: 8,
    minHeight: 32,
    justifyContent: 'center',
  },
  valuationRetryLabel: {
    color: '#2E6B4F',
    fontSize: 13,
    fontWeight: '700',
  },
  valuationHeading: {
    color: '#2D3B34',
    fontSize: 14,
    fontWeight: '700',
  },
  valuationValue: {
    color: '#2E6B4F',
    fontSize: 23,
    fontWeight: '800',
    marginTop: 3,
  },
  priceGuidance: {
    gap: 4,
    marginTop: 18,
  },
  priceExplanation: {
    color: '#6B746F',
    fontSize: 12,
    lineHeight: 18,
    marginTop: 5,
  },
  askingPriceHeading: {
    color: '#2D3B34',
    fontSize: 14,
    fontWeight: '700',
    marginTop: 13,
  },
  askingPriceInput: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E4DFD5',
    borderRadius: 9,
    borderWidth: 1,
    color: '#2D3B34',
    fontSize: 16,
    minHeight: 42,
    marginTop: 6,
    paddingHorizontal: 12,
  },
  askingPriceInputDisabled: {
    backgroundColor: '#F0EDE7',
    color: '#6B746F',
  },
  giftButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderColor: '#D58C76',
    borderRadius: 9,
    borderWidth: 1,
    justifyContent: 'center',
    marginTop: 8,
    minHeight: 40,
    paddingHorizontal: 16,
  },
  giftButtonSelected: {
    backgroundColor: '#FBE8E1',
    borderColor: '#C86F55',
  },
  giftButtonLabel: {
    color: '#A8523C',
    fontSize: 14,
    fontWeight: '700',
  },
  giftButtonLabelSelected: {
    color: '#8E3F2D',
  },
  safetyNotice: {
    backgroundColor: '#FFF4E6',
    borderColor: '#E7C58F',
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 4,
    padding: 12,
  },
  safetyNoticeTitle: {
    color: '#76511F',
    fontSize: 14,
    fontWeight: '800',
  },
  safetyNoticeText: {
    color: '#76511F',
    fontSize: 12,
    lineHeight: 18,
    marginTop: 4,
  },
  priceWarning: {
    backgroundColor: '#FFF6E5',
    borderColor: '#F0D9A8',
    borderRadius: 9,
    borderWidth: 1,
    marginTop: 10,
    padding: 10,
  },
  priceWarningTitle: {
    color: '#76551E',
    fontSize: 13,
    fontWeight: '700',
  },
  priceWarningText: {
    color: '#76551E',
    fontSize: 12,
    lineHeight: 18,
    marginTop: 3,
  },
  valuationConditionCaption: {
    color: '#59635E',
    fontSize: 13,
    marginTop: 12,
  },
  conditionExplanation: {
    color: '#6B746F',
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 14,
    marginTop: 6,
  },
  confirmedMessage: {
    color: '#2E6B4F',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 12,
  },
  prePriceMessage: {
    color: '#6B746F',
    fontSize: 12,
    lineHeight: 18,
    marginTop: 12,
  },
  valuationCondition: {
    color: '#1E2A24',
    fontSize: 16,
    fontWeight: '700',
    marginTop: 3,
  },
  valuationProvenance: {
    color: '#7A837E',
    fontSize: 12,
    fontStyle: 'italic',
    marginTop: 5,
  },
  valuationIssues: {
    color: '#59635E',
    fontSize: 13,
    lineHeight: 19,
    marginTop: 7,
  },
  valuationActions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  valuationPrimaryAction: {
    alignItems: 'center',
    backgroundColor: '#2E6B4F',
    borderRadius: 9,
    justifyContent: 'center',
    minHeight: 40,
    paddingHorizontal: 16,
  },
  valuationPrimaryActionLabel: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  valuationSecondaryAction: {
    alignItems: 'center',
    borderColor: '#C9D5CC',
    borderRadius: 9,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 40,
    paddingHorizontal: 16,
  },
  valuationSecondaryActionLabel: {
    color: '#2E6B4F',
    fontSize: 14,
    fontWeight: '700',
  },
  valuationSaveError: {
    color: '#8A4D51',
    fontSize: 13,
    lineHeight: 19,
    marginTop: 9,
  },
  modalBackdrop: {
    backgroundColor: 'rgba(24, 35, 29, 0.35)',
    flex: 1,
    justifyContent: 'flex-end',
  },
  conditionModal: {
    backgroundColor: '#F7F5F0',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    padding: 22,
    paddingBottom: 30,
  },
  conditionModalTitle: {
    color: '#1E2A24',
    fontSize: 20,
    fontWeight: '800',
    lineHeight: 27,
    marginBottom: 16,
  },
  conditionOptions: {
    gap: 8,
  },
  conditionOption: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E4DFD5',
    borderRadius: 10,
    borderWidth: 1,
    minHeight: 42,
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  conditionOptionSelected: {
    backgroundColor: '#E4F0E8',
    borderColor: '#2E6B4F',
  },
  conditionOptionLabel: {
    color: '#3F4B44',
    fontSize: 15,
    fontWeight: '600',
  },
  conditionOptionLabelSelected: {
    color: '#2E6B4F',
    fontWeight: '800',
  },
  issueHeading: {
    color: '#3F4B44',
    fontSize: 14,
    fontWeight: '700',
    marginTop: 18,
    marginBottom: 9,
  },
  issueOptions: {
    gap: 8,
  },
  issueOption: {
    alignItems: 'center',
    flexDirection: 'row',
    minHeight: 30,
  },
  issueCheckbox: {
    alignItems: 'center',
    borderColor: '#B9C6BC',
    borderRadius: 5,
    borderWidth: 1,
    height: 21,
    justifyContent: 'center',
    marginRight: 9,
    width: 21,
  },
  issueCheckboxSelected: {
    backgroundColor: '#2E6B4F',
    borderColor: '#2E6B4F',
  },
  issueCheckmark: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  issueLabel: {
    color: '#4F5A54',
    fontSize: 14,
  },
  conditionNoteInput: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E4DFD5',
    borderRadius: 10,
    borderWidth: 1,
    color: '#2D3B34',
    fontSize: 14,
    minHeight: 68,
    marginTop: 16,
    padding: 12,
    textAlignVertical: 'top',
  },
  modalSaveError: {
    color: '#8A4D51',
    fontSize: 13,
    lineHeight: 19,
    marginTop: 9,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'flex-end',
    marginTop: 18,
  },
  modalCancelButton: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: 14,
  },
  modalCancelLabel: {
    color: '#6B746F',
    fontSize: 15,
    fontWeight: '700',
  },
  modalSaveButton: {
    alignItems: 'center',
    backgroundColor: '#2E6B4F',
    borderRadius: 10,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: 20,
  },
  modalSaveLabel: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: '#2E6B4F',
    borderRadius: 14,
    justifyContent: 'center',
    marginTop: 28,
    minHeight: 54,
    paddingHorizontal: 20,
  },
  primaryButtonLabel: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
  },
});
