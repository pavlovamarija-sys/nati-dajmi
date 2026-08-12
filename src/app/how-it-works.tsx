import {
  Nunito_400Regular,
  Nunito_700Bold,
  Nunito_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/nunito';
import { router } from 'expo-router';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { InstructionTopicSlug } from '@/features/instructions/instruction-content';

type TopicVisualKind = 'camera' | 'scan' | 'cycle' | 'ideas' | 'stars';

type HelpTopic = {
  accent: string;
  description: string;
  id: InstructionTopicSlug;
  tint: string;
  title: string;
  visualKind: TopicVisualKind;
};

const helpTopics = [
  {
    accent: '#E98262',
    id: 'photo',
    tint: '#FFF0EA',
    title: 'Како да сликаш?',
    description: 'Совети за фотографија со која најдобро ќе ги препознаеме играчките.',
    visualKind: 'camera',
  },
  {
    accent: '#E99A3A',
    id: 'analysis',
    tint: '#FFF5E5',
    title: 'Како да анализираш?',
    description: 'Како од фотографијата добиваш препораки за играчките.',
    visualKind: 'scan',
  },
  {
    accent: '#2E6B4F',
    id: 'recommendations',
    tint: '#EEF6EF',
    title: 'Задржи • Ротирај • Размени',
    description: 'Што значи секоја препорака и како да ја користиш.',
    visualKind: 'cycle',
  },
  {
    accent: '#31858A',
    id: 'play-ideas',
    tint: '#ECF7F6',
    title: 'Идеи за игра',
    description: 'Нова инспирација за играчките што остануваат.',
    visualKind: 'ideas',
  },
  {
    accent: '#D5A62E',
    id: 'stars',
    tint: '#FFF8E7',
    title: 'Како функционираат ѕвездичките?',
    description: 'Како заработуваш и користиш ѕвездички при размена.',
    visualKind: 'stars',
  },
] as const satisfies ReadonlyArray<HelpTopic>;

function TopicVisual({ kind }: { kind: TopicVisualKind }) {
  if (kind === 'camera') {
    return (
      <View style={styles.visualStage}>
        <View style={styles.cameraFocusTopLeft} />
        <View style={styles.cameraFocusBottomRight} />
        <View style={styles.cameraBody}>
          <View style={styles.cameraTop} />
          <View style={styles.cameraLens}>
            <View style={styles.cameraLensCenter} />
          </View>
          <View style={styles.cameraFlash} />
        </View>
        <View style={styles.cameraSparkle} />
      </View>
    );
  }

  if (kind === 'scan') {
    return (
      <View style={styles.visualStage}>
        <View style={[styles.scanCorner, styles.scanTopLeft]} />
        <View style={[styles.scanCorner, styles.scanTopRight]} />
        <View style={[styles.scanCorner, styles.scanBottomLeft]} />
        <View style={[styles.scanCorner, styles.scanBottomRight]} />
        <View style={styles.scanCubeFront} />
        <View style={styles.scanCubeBack} />
        <Text style={styles.scanSparkle}>✦</Text>
      </View>
    );
  }

  if (kind === 'cycle') {
    return (
      <View style={styles.visualStage}>
        <View style={[styles.cycleToy, styles.cycleToyCoral]} />
        <View style={[styles.cycleToy, styles.cycleToyYellow]} />
        <View style={[styles.cycleToy, styles.cycleToyTeal]} />
        <Text style={styles.cycleArrow}>↻</Text>
        <View style={styles.cycleHeart}>
          <Text style={styles.cycleHeartLabel}>♡</Text>
        </View>
      </View>
    );
  }

  if (kind === 'ideas') {
    return (
      <View style={styles.visualStage}>
        <View style={styles.ideaBulb}>
          <View style={styles.ideaBulbCore} />
        </View>
        <View style={styles.ideaBulbBase} />
        <View style={[styles.ideaBlock, styles.ideaBlockCoral]} />
        <View style={[styles.ideaBlock, styles.ideaBlockYellow]} />
        <View style={[styles.ideaBlock, styles.ideaBlockTeal]} />
        <Text style={styles.ideaSparkle}>✦</Text>
      </View>
    );
  }

  return (
    <View style={styles.visualStage}>
      <View style={styles.starToken}>
        <Text style={styles.starMain}>★</Text>
      </View>
      <Text style={styles.starSmallCoral}>✦</Text>
      <Text style={styles.starSmallTeal}>✦</Text>
      <View style={styles.starOrbit} />
    </View>
  );
}

export default function HowItWorksScreen() {
  const [fontsLoaded, fontError] = useFonts({
    Nunito_400Regular,
    Nunito_700Bold,
    Nunito_800ExtraBold,
  });
  const { width } = useWindowDimensions();

  if (!fontsLoaded && !fontError) {
    return <SafeAreaView style={styles.safeArea} />;
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Назад"
            hitSlop={8}
            onPress={() => router.back()}
            style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
          >
            <Text style={styles.backArrow}>←</Text>
          </Pressable>
          <Text style={styles.screenTitle}>Како функционира?</Text>
        </View>

        <View style={styles.helpGrid}>
          {helpTopics.map((topic, index) => (
            <Pressable
              accessibilityRole="button"
              accessibilityHint="Го отвора деталното упатство"
              key={topic.title}
              onPress={() =>
                router.push({ pathname: '/instructions/[topic]', params: { topic: topic.id } })
              }
              style={({ pressed }) => [
                styles.helpCard,
                { backgroundColor: topic.tint, borderColor: `${topic.accent}33` },
                width < 340 && styles.narrowHelpCard,
                index === helpTopics.length - 1 && width >= 340 && styles.wideHelpCard,
                pressed && styles.helpCardPressed,
              ]}
            >
              <Text style={styles.cardArrow}>›</Text>
              <TopicVisual kind={topic.visualKind} />
              <Text style={styles.helpTitle}>{topic.title}</Text>
              <Text style={styles.helpDescription}>{topic.description}</Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.brandMessage}>
          <Text accessibilityElementsHidden style={styles.brandHeart}>♡</Text>
          <Text style={styles.brandMessageText}>
            Играчките заслужуваат{`\n`}повеќе од една приказна.
          </Text>
          <View accessibilityElementsHidden style={styles.rainbowDecoration}>
            <View style={styles.rainbowCoral} />
            <View style={styles.rainbowYellow} />
            <View style={styles.rainbowGreen} />
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: '#FBF4E8',
    flex: 1,
  },
  content: {
    paddingBottom: 34,
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    marginBottom: 24,
    minHeight: 48,
  },
  backButton: {
    alignItems: 'center',
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  backArrow: {
    color: '#356C53',
    fontFamily: 'Nunito_700Bold',
    fontSize: 29,
  },
  screenTitle: {
    color: '#2D2925',
    flex: 1,
    fontFamily: 'Nunito_800ExtraBold',
    fontSize: 25,
    marginLeft: 5,
  },
  pressed: { opacity: 0.6 },
  helpGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  helpCard: {
    alignItems: 'center',
    borderRadius: 20,
    borderWidth: 1,
    minHeight: 218,
    paddingBottom: 16,
    paddingHorizontal: 12,
    paddingTop: 14,
    shadowColor: '#594C40',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 6,
    width: '48%',
    elevation: 1,
  },
  narrowHelpCard: {
    minHeight: 196,
    width: '100%',
  },
  wideHelpCard: {
    minHeight: 185,
    paddingHorizontal: 24,
    width: '100%',
  },
  helpCardPressed: {
    opacity: 0.78,
    transform: [{ scale: 0.99 }],
  },
  helpTitle: {
    color: '#342F2B',
    fontFamily: 'Nunito_800ExtraBold',
    fontSize: 15.5,
    lineHeight: 19,
    marginTop: 7,
    textAlign: 'center',
  },
  helpDescription: {
    color: '#716960',
    fontFamily: 'Nunito_400Regular',
    fontSize: 12.5,
    lineHeight: 17,
    marginTop: 7,
    textAlign: 'center',
  },
  cardArrow: {
    color: '#A69B90',
    fontFamily: 'Nunito_700Bold',
    fontSize: 22,
    position: 'absolute',
    right: 11,
    top: 7,
  },
  visualStage: {
    height: 74,
    position: 'relative',
    width: 88,
  },
  cameraBody: {
    alignItems: 'center',
    backgroundColor: '#E98262',
    borderRadius: 12,
    height: 46,
    justifyContent: 'center',
    left: 17,
    position: 'absolute',
    top: 17,
    width: 58,
  },
  cameraTop: {
    backgroundColor: '#E98262',
    borderRadius: 4,
    height: 10,
    left: 9,
    position: 'absolute',
    top: -7,
    width: 22,
  },
  cameraLens: {
    alignItems: 'center',
    backgroundColor: '#FFF8F1',
    borderRadius: 13,
    height: 26,
    justifyContent: 'center',
    width: 26,
  },
  cameraLensCenter: {
    borderColor: '#C95F43',
    borderRadius: 7,
    borderWidth: 3,
    height: 14,
    width: 14,
  },
  cameraFlash: {
    backgroundColor: '#F5C34A',
    borderRadius: 3,
    height: 6,
    position: 'absolute',
    right: 8,
    top: 8,
    width: 6,
  },
  cameraFocusTopLeft: {
    borderLeftColor: '#E98262',
    borderLeftWidth: 3,
    borderTopColor: '#E98262',
    borderTopLeftRadius: 3,
    borderTopWidth: 3,
    height: 14,
    left: 5,
    position: 'absolute',
    top: 5,
    width: 14,
  },
  cameraFocusBottomRight: {
    borderBottomColor: '#E98262',
    borderBottomRightRadius: 3,
    borderBottomWidth: 3,
    borderRightColor: '#E98262',
    borderRightWidth: 3,
    bottom: 2,
    height: 14,
    position: 'absolute',
    right: 2,
    width: 14,
  },
  cameraSparkle: {
    backgroundColor: '#F5C34A',
    borderRadius: 2,
    height: 5,
    position: 'absolute',
    right: 5,
    top: 8,
    transform: [{ rotate: '45deg' }],
    width: 5,
  },
  scanCorner: {
    height: 17,
    position: 'absolute',
    width: 17,
  },
  scanTopLeft: {
    borderLeftColor: '#E99A3A',
    borderLeftWidth: 4,
    borderTopColor: '#E99A3A',
    borderTopLeftRadius: 4,
    borderTopWidth: 4,
    left: 8,
    top: 7,
  },
  scanTopRight: {
    borderRightColor: '#E99A3A',
    borderRightWidth: 4,
    borderTopColor: '#E99A3A',
    borderTopRightRadius: 4,
    borderTopWidth: 4,
    right: 8,
    top: 7,
  },
  scanBottomLeft: {
    borderBottomColor: '#E99A3A',
    borderBottomLeftRadius: 4,
    borderBottomWidth: 4,
    borderLeftColor: '#E99A3A',
    borderLeftWidth: 4,
    bottom: 7,
    left: 8,
  },
  scanBottomRight: {
    borderBottomColor: '#E99A3A',
    borderBottomRightRadius: 4,
    borderBottomWidth: 4,
    borderRightColor: '#E99A3A',
    borderRightWidth: 4,
    bottom: 7,
    right: 8,
  },
  scanCubeFront: {
    backgroundColor: '#F5C34A',
    borderRadius: 5,
    height: 29,
    left: 30,
    position: 'absolute',
    top: 27,
    transform: [{ rotate: '8deg' }],
    width: 29,
  },
  scanCubeBack: {
    borderColor: '#D87255',
    borderRadius: 4,
    borderWidth: 3,
    height: 24,
    left: 25,
    position: 'absolute',
    top: 22,
    width: 24,
  },
  scanSparkle: {
    color: '#31858A',
    fontFamily: 'Nunito_700Bold',
    fontSize: 18,
    position: 'absolute',
    right: 3,
    top: 0,
  },
  cycleArrow: {
    color: '#2E6B4F',
    fontFamily: 'Nunito_400Regular',
    fontSize: 54,
    left: 20,
    lineHeight: 66,
    position: 'absolute',
    top: 1,
  },
  cycleToy: {
    borderRadius: 6,
    height: 18,
    position: 'absolute',
    width: 18,
    zIndex: 2,
  },
  cycleToyCoral: { backgroundColor: '#E98262', left: 10, top: 26 },
  cycleToyYellow: { backgroundColor: '#F2B543', right: 12, top: 17 },
  cycleToyTeal: { backgroundColor: '#4B9C91', bottom: 5, right: 22 },
  cycleHeart: {
    alignItems: 'center',
    backgroundColor: '#E4F0E6',
    borderRadius: 11,
    bottom: 2,
    height: 22,
    justifyContent: 'center',
    left: 6,
    position: 'absolute',
    width: 22,
  },
  cycleHeartLabel: {
    color: '#2E6B4F',
    fontSize: 17,
    lineHeight: 20,
  },
  ideaBulb: {
    alignItems: 'center',
    borderColor: '#31858A',
    borderRadius: 20,
    borderWidth: 4,
    height: 40,
    justifyContent: 'center',
    left: 24,
    position: 'absolute',
    top: 4,
    width: 40,
  },
  ideaBulbCore: {
    backgroundColor: '#F5C34A',
    borderRadius: 8,
    height: 16,
    width: 16,
  },
  ideaBulbBase: {
    backgroundColor: '#31858A',
    borderRadius: 3,
    height: 8,
    left: 35,
    position: 'absolute',
    top: 43,
    width: 18,
  },
  ideaBlock: {
    borderRadius: 4,
    bottom: 3,
    height: 19,
    position: 'absolute',
    width: 19,
  },
  ideaBlockCoral: { backgroundColor: '#E98262', left: 8, transform: [{ rotate: '-8deg' }] },
  ideaBlockYellow: { backgroundColor: '#F5C34A', left: 34 },
  ideaBlockTeal: { backgroundColor: '#4B9C91', right: 8, transform: [{ rotate: '8deg' }] },
  ideaSparkle: {
    color: '#E98262',
    fontFamily: 'Nunito_700Bold',
    fontSize: 17,
    position: 'absolute',
    right: 4,
    top: 2,
  },
  starToken: {
    alignItems: 'center',
    backgroundColor: '#F8E5A8',
    borderColor: '#E2B745',
    borderRadius: 28,
    borderWidth: 2,
    height: 56,
    justifyContent: 'center',
    left: 17,
    position: 'absolute',
    top: 9,
    width: 56,
  },
  starMain: {
    color: '#D9A72F',
    fontFamily: 'Nunito_700Bold',
    fontSize: 33,
    lineHeight: 38,
  },
  starSmallCoral: {
    color: '#E98262',
    fontFamily: 'Nunito_700Bold',
    fontSize: 16,
    left: 5,
    position: 'absolute',
    top: 3,
  },
  starSmallTeal: {
    bottom: 0,
    color: '#31858A',
    fontFamily: 'Nunito_700Bold',
    fontSize: 15,
    position: 'absolute',
    right: 3,
  },
  starOrbit: {
    borderColor: '#E9826266',
    borderRadius: 38,
    borderStyle: 'dashed',
    borderWidth: 2,
    height: 72,
    left: 8,
    position: 'absolute',
    top: 1,
    transform: [{ rotate: '-12deg' }],
    width: 72,
  },
  brandMessage: {
    alignItems: 'center',
    backgroundColor: '#FFF2E5',
    borderColor: '#F1DCCB',
    borderRadius: 20,
    borderWidth: 1,
    flexDirection: 'row',
    marginTop: 28,
    minHeight: 94,
    paddingHorizontal: 14,
    shadowColor: '#795B48',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.1,
    shadowRadius: 7,
    elevation: 2,
  },
  brandHeart: {
    color: '#E96F55',
    fontFamily: 'Nunito_400Regular',
    fontSize: 43,
    lineHeight: 48,
    marginRight: 9,
    transform: [{ rotate: '-8deg' }],
  },
  rainbowDecoration: {
    alignItems: 'center',
    height: 34,
    justifyContent: 'flex-end',
    marginLeft: 9,
    overflow: 'hidden',
    width: 56,
  },
  rainbowCoral: {
    borderColor: '#E96F55',
    borderBottomColor: 'transparent',
    borderRadius: 28,
    borderWidth: 5,
    bottom: -24,
    height: 56,
    position: 'absolute',
    width: 56,
  },
  rainbowYellow: {
    borderColor: '#F2AC2F',
    borderBottomColor: 'transparent',
    borderRadius: 22,
    borderWidth: 5,
    bottom: -18,
    height: 44,
    position: 'absolute',
    width: 44,
  },
  rainbowGreen: {
    borderColor: '#4F8B70',
    borderBottomColor: 'transparent',
    borderRadius: 16,
    borderWidth: 5,
    bottom: -12,
    height: 32,
    position: 'absolute',
    width: 32,
  },
  brandMessageText: {
    color: '#5B4031',
    flex: 1,
    fontFamily: 'Nunito_400Regular',
    fontSize: 14.5,
    lineHeight: 22,
    textAlign: 'center',
  },
});
