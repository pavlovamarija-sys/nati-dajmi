import { router } from 'expo-router';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useToyAnalysisResult } from '@/features/toy-analysis/toy-analysis-result-context';
import type {
  ToyAnalysisItem,
  ToyRecommendation,
} from '@/features/toy-analysis/types/toy-analysis';

const sections: { recommendation: ToyRecommendation; title: string; color: string }[] = [
  { recommendation: 'KEEP', title: 'KEEP', color: '#2E6B4F' },
  { recommendation: 'ROTATE', title: 'ROTATE', color: '#A2622D' },
  { recommendation: 'PASS_ON', title: 'PASS ON', color: '#8A4D51' },
];

export default function ResultsScreen() {
  const { result } = useToyAnalysisResult();

  if (!result) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.emptyState}>
          <Text style={styles.title}>No results yet</Text>
          <Text style={styles.subtitle}>Analyze a toy shelf to see recommendations.</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.replace('/analyze')}
            style={styles.primaryButton}
          >
            <Text style={styles.primaryButtonLabel}>Analyze Toy Shelf</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
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
          <Text style={styles.title}>Toy recommendations</Text>
          <Text style={styles.subtitle}>
            A simple starting point for refreshing the shelf.
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
                  <ToyCard key={toy.id} toy={toy} />
                ))}
              </View>
            </View>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

function ToyCard({ toy }: { toy: ToyAnalysisItem }) {
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
