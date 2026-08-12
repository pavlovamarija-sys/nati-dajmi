import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  getToyAnalysisById,
  getToyAnalysisHistory,
} from '@/features/toy-analysis/repositories/toy-analysis-repository';
import { useToyAnalysisResult } from '@/features/toy-analysis/toy-analysis-result-context';
import type { ToyAnalysisHistoryItem } from '@/features/toy-analysis/types/toy-analysis';

const monthNames = [
  'јануари',
  'февруари',
  'март',
  'април',
  'мај',
  'јуни',
  'јули',
  'август',
  'септември',
  'октомври',
  'ноември',
  'декември',
] as const;

export default function HistoryScreen() {
  const { setResult } = useToyAnalysisResult();
  const [history, setHistory] = useState<ToyAnalysisHistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [openingAnalysisId, setOpeningAnalysisId] = useState<string | null>(null);
  const requestId = useRef(0);
  const openingAnalysisIdRef = useRef<string | null>(null);

  const loadHistory = useCallback(async () => {
    const currentRequestId = ++requestId.current;
    setIsLoading(true);
    setHasError(false);

    try {
      const result = await getToyAnalysisHistory();

      if (requestId.current === currentRequestId) {
        setHistory(result);
      }
    } catch {
      if (requestId.current === currentRequestId) {
        setHasError(true);
      }
    } finally {
      if (requestId.current === currentRequestId) {
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void loadHistory();

    return () => {
      requestId.current += 1;
    };
  }, [loadHistory]);

  const openAnalysis = async (analysisId: string) => {
    if (openingAnalysisIdRef.current !== null) {
      return;
    }

    openingAnalysisIdRef.current = analysisId;
    setOpeningAnalysisId(analysisId);

    try {
      const analysisResult = await getToyAnalysisById(analysisId);

      if (!analysisResult) {
        Alert.alert('Анализата не е достапна', 'Оваа анализа повеќе не е достапна.');
        return;
      }

      setResult(analysisResult);
      router.push('/results');
    } catch {
      Alert.alert('Неуспешно отворање', 'Не можевме да ја отвориме анализата.');
    } finally {
      openingAnalysisIdRef.current = null;
      setOpeningAnalysisId(null);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <Pressable
          accessibilityLabel="Назад"
          accessibilityRole="button"
          hitSlop={12}
          onPress={() => router.back()}
          style={styles.backButton}
        >
          <Text style={styles.backLabel}>Назад</Text>
        </Pressable>
        <Text style={styles.title}>Мои анализи</Text>
      </View>

      {isLoading ? (
        <View style={styles.centeredState}>
          <ActivityIndicator color="#2E6B4F" size="large" />
          <Text style={styles.stateMessage}>Ги вчитуваме анализите...</Text>
        </View>
      ) : hasError ? (
        <View style={styles.centeredState}>
          <Text style={styles.stateMessage}>Не можевме да ги вчитаме анализите.</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => void loadHistory()}
            style={({ pressed }) => [
              styles.primaryButton,
              pressed && styles.pressedButton,
            ]}
          >
            <Text style={styles.primaryButtonLabel}>Обиди се повторно</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          contentContainerStyle={[
            styles.listContent,
            history.length === 0 && styles.emptyListContent,
          ]}
          data={history}
          keyExtractor={(item) => item.analysisId}
          ListEmptyComponent={<EmptyHistory />}
          renderItem={({ item }) => (
            <HistoryCard
              disabled={openingAnalysisId !== null}
              isOpening={openingAnalysisId === item.analysisId}
              item={item}
              onOpen={() => void openAnalysis(item.analysisId)}
            />
          )}
        />
      )}
    </SafeAreaView>
  );
}

function HistoryCard({
  disabled,
  isOpening,
  item,
  onOpen,
}: {
  disabled: boolean;
  isOpening: boolean;
  item: ToyAnalysisHistoryItem;
  onOpen: () => void;
}) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardDate}>{formatDate(item.createdAt)}</Text>
      <Text style={styles.cardDetail}>Возраст: {formatAge(item.childAgeMonths)}</Text>
      <Text style={styles.cardDetail}>{formatToyCount(item.toyCount)}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ busy: isOpening, disabled }}
        disabled={disabled}
        onPress={onOpen}
        style={({ pressed }) => [
          styles.openButton,
          disabled && !isOpening && styles.openButtonDisabled,
          pressed && !disabled && styles.pressedButton,
        ]}
      >
        {isOpening ? (
          <View style={styles.openingContent}>
            <ActivityIndicator color="#2E6B4F" size="small" />
            <Text style={styles.openButtonLabel}>Се отвора...</Text>
          </View>
        ) : (
          <Text style={styles.openButtonLabel}>Отвори →</Text>
        )}
      </Pressable>
    </View>
  );
}

function EmptyHistory() {
  return (
    <View style={styles.centeredState}>
      <Text style={styles.stateMessage}>Сè уште немаш анализи.</Text>
      <Pressable
        accessibilityRole="button"
        onPress={() => router.push('/analyze')}
        style={({ pressed }) => [styles.primaryButton, pressed && styles.pressedButton]}
      >
        <Text style={styles.primaryButtonLabel}>Анализирај играчки</Text>
      </Pressable>
    </View>
  );
}

function formatAge(childAgeMonths: number): string {
  if (childAgeMonths % 12 !== 0) {
    return childAgeMonths === 1 ? '1 месец' : `${childAgeMonths} месеци`;
  }

  const years = childAgeMonths / 12;
  return years === 1 ? '1 година' : `${years} години`;
}

function formatDate(value: string): string {
  const date = new Date(value);
  return `${date.getDate()} ${monthNames[date.getMonth()]} ${date.getFullYear()}`;
}

function formatToyCount(toyCount: number): string {
  return toyCount === 1 ? '1 играчка' : `${toyCount} играчки`;
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: '#F7F5F0',
    flex: 1,
  },
  header: {
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
    fontSize: 16,
    fontWeight: '600',
  },
  title: {
    color: '#1E2A24',
    fontSize: 32,
    fontWeight: '700',
    letterSpacing: -0.8,
    marginBottom: 22,
    marginTop: 10,
  },
  listContent: {
    gap: 12,
    paddingBottom: 40,
    paddingHorizontal: 24,
  },
  emptyListContent: {
    flexGrow: 1,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E4DFD5',
    borderRadius: 14,
    borderWidth: 1,
    padding: 18,
  },
  cardDate: {
    color: '#1E2A24',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 10,
  },
  cardDetail: {
    color: '#59635E',
    fontSize: 15,
    lineHeight: 22,
  },
  openButton: {
    alignSelf: 'flex-start',
    marginTop: 14,
    minHeight: 36,
    paddingVertical: 7,
  },
  openButtonDisabled: {
    opacity: 0.5,
  },
  openButtonLabel: {
    color: '#2E6B4F',
    fontSize: 15,
    fontWeight: '700',
  },
  openingContent: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  centeredState: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  stateMessage: {
    color: '#59635E',
    fontSize: 17,
    lineHeight: 25,
    marginTop: 14,
    textAlign: 'center',
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: '#2E6B4F',
    borderRadius: 14,
    justifyContent: 'center',
    marginTop: 24,
    minHeight: 52,
    paddingHorizontal: 20,
  },
  primaryButtonLabel: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  pressedButton: {
    opacity: 0.85,
  },
});
