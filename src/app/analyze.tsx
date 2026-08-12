import { router } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ChildAgeInput } from '@/features/toy-analysis/components/child-age-input';
import { ImageInput } from '@/features/toy-analysis/components/image-input';
import {
  childAgeToMonths,
  isValidChildAge,
} from '@/features/toy-analysis/domain/child-age';
import { analyzeToyShelf } from '@/features/toy-analysis/services/analyze-toy-shelf';
import {
  chooseToyShelfPhoto,
  takeToyShelfPhoto,
} from '@/features/toy-analysis/services/select-toy-shelf-image';
import { useToyAnalysisResult } from '@/features/toy-analysis/toy-analysis-result-context';
import type {
  AgeUnit,
  ImageSelectionResult,
  ToyShelfImage,
} from '@/features/toy-analysis/types/toy-analysis';

export default function AnalyzeToyShelfScreen() {
  const { setResult } = useToyAnalysisResult();
  const [image, setImage] = useState<ToyShelfImage | null>(null);
  const [ageValue, setAgeValue] = useState<number | null>(null);
  const [ageUnit, setAgeUnit] = useState<AgeUnit>('years');
  const [isSelectingImage, setIsSelectingImage] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const childAge = { value: ageValue ?? 0, unit: ageUnit };
  const canAnalyze = image !== null && isValidChildAge(childAge);

  const handleSelectionResult = (result: ImageSelectionResult) => {
    if (result.status === 'selected') {
      setImage(result.image);
    } else if (result.status === 'permission-denied') {
      Alert.alert(
        'Camera permission needed',
        'Allow camera access in your device settings to take a toy shelf photo.',
      );
    } else if (result.status === 'error') {
      Alert.alert('Could not add photo', 'Please try again.');
    }
  };

  const selectImage = async (source: 'camera' | 'library') => {
    setIsSelectingImage(true);
    const result =
      source === 'camera' ? await takeToyShelfPhoto() : await chooseToyShelfPhoto();
    handleSelectionResult(result);
    setIsSelectingImage(false);
  };

  const handleAnalyze = async () => {
    if (!image || !canAnalyze || isAnalyzing) {
      return;
    }

    setIsAnalyzing(true);

    try {
      const childAgeMonths = childAgeToMonths(childAge);
      const analysisResult = await analyzeToyShelf(image, childAgeMonths);
      setResult(analysisResult);
      router.push('/results');
    } catch {
      Alert.alert(
        'Analysis unavailable',
        "We couldn't analyze this photo. Please try again.",
      );
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Pressable
          accessibilityLabel="Go back"
          accessibilityRole="button"
          hitSlop={12}
          onPress={() => router.back()}
          style={styles.backButton}
        >
          <Text style={styles.backLabel}>‹ Back</Text>
        </Pressable>

        <View style={styles.header}>
          <Text style={styles.title}>Analyze Toy Shelf</Text>
          <Text style={styles.subtitle}>
            Add a photo and your child&apos;s age to get started.
          </Text>
        </View>

        <ImageInput
          busy={isSelectingImage}
          image={image}
          onChoosePhoto={() => selectImage('library')}
          onTakePhoto={() => selectImage('camera')}
        />

        <View style={styles.ageSection}>
          <ChildAgeInput
            onUnitChange={setAgeUnit}
            onValueChange={setAgeValue}
            unit={ageUnit}
            value={ageValue}
          />
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityState={{ busy: isAnalyzing, disabled: !canAnalyze || isAnalyzing }}
          disabled={!canAnalyze || isAnalyzing}
          onPress={handleAnalyze}
          style={({ pressed }) => [
            styles.analyzeButton,
            (!canAnalyze || isAnalyzing) && styles.analyzeButtonDisabled,
            pressed && canAnalyze && !isAnalyzing && styles.analyzeButtonPressed,
          ]}
        >
          {isAnalyzing ? (
            <View style={styles.loadingContent}>
              <ActivityIndicator color="#FFFFFF" />
              <Text style={styles.analyzeButtonLabel}>Looking at the toys...</Text>
            </View>
          ) : (
            <Text
              style={[
                styles.analyzeButtonLabel,
                !canAnalyze && styles.analyzeButtonLabelDisabled,
              ]}
            >
              Analyze Toys
            </Text>
          )}
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: '#F7F5F0',
    flex: 1,
  },
  content: {
    paddingBottom: 32,
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
    marginBottom: 28,
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
  ageSection: {
    marginTop: 32,
  },
  analyzeButton: {
    alignItems: 'center',
    backgroundColor: '#2E6B4F',
    borderRadius: 14,
    justifyContent: 'center',
    marginTop: 36,
    minHeight: 56,
    paddingHorizontal: 20,
  },
  analyzeButtonDisabled: {
    backgroundColor: '#D9D8D2',
  },
  analyzeButtonPressed: {
    opacity: 0.85,
  },
  analyzeButtonLabel: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
  },
  analyzeButtonLabelDisabled: {
    color: '#8A8D89',
  },
  loadingContent: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
});
