import {
  Nunito_400Regular,
  Nunito_700Bold,
  Nunito_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/nunito';
import { router, useLocalSearchParams } from 'expo-router';
import {
  Image,
  type ImageSourcePropType,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  instructionTopics,
  isInstructionTopicSlug,
  type InstructionSection,
  type InstructionTopicSlug,
} from '@/features/instructions/instruction-content';

const topicSymbols: Record<InstructionTopicSlug, string> = {
  photo: '▣',
  analysis: '◎',
  recommendations: '♡',
  'play-ideas': '✦',
  stars: '★',
};

const photoGuideImages: readonly ImageSourcePropType[] = [
  require('../../../assets/images/photo-guide-crowded-vs-separated.png'),
  require('../../../assets/images/photo-guide-dark-vs-bright.png'),
  require('../../../assets/images/photo-guide-angled-vs-direct.png'),
  require('../../../assets/images/photo-guide-overlap-vs-visible.png'),
  require('../../../assets/images/photo-guide-far-vs-close.png'),
];

export default function InstructionTopicScreen() {
  const { topic: topicParam } = useLocalSearchParams<{ topic?: string | string[] }>();
  const [fontsLoaded, fontError] = useFonts({
    Nunito_400Regular,
    Nunito_700Bold,
    Nunito_800ExtraBold,
  });
  const topicSlug = Array.isArray(topicParam) ? topicParam[0] : topicParam;

  if (!fontsLoaded && !fontError) {
    return <SafeAreaView style={styles.safeArea} />;
  }

  if (!topicSlug || !isInstructionTopicSlug(topicSlug)) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.unavailableContent}>
          <Text style={styles.unavailableTitle}>Ова упатство не е достапно.</Text>
          <Pressable onPress={() => router.back()} style={styles.primaryButton}>
            <Text style={styles.primaryButtonLabel}>Назад</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const topic = instructionTopics[topicSlug];

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Pressable
            accessibilityLabel="Назад"
            accessibilityRole="button"
            hitSlop={8}
            onPress={() => router.back()}
            style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
          >
            <Text style={styles.backArrow}>←</Text>
          </Pressable>
          <Text style={styles.screenTitle}>{topic.title}</Text>
        </View>

        <View style={[styles.introCard, { borderColor: `${topic.accent}33` }]}>
          <View style={[styles.topicSymbol, { backgroundColor: `${topic.accent}1A` }]}>
            <Text style={[styles.topicSymbolLabel, { color: topic.accent }]}>
              {topicSymbols[topic.kind]}
            </Text>
          </View>
          <Text style={styles.introText}>{topic.intro}</Text>
        </View>

        {topic.kind === 'photo' ? (
          <PhotoGuideSections
            accent={topic.accent}
            sections={[
              ...topic.sections,
              ...(topic.specialCard?.text
                ? [{ title: topic.specialCard.title, text: topic.specialCard.text }]
                : []),
            ]}
          />
        ) : (
          <View style={styles.sectionList}>
            {topic.sections.map((section, index) => (
              <InstructionSectionCard
                accent={topic.accent}
                index={index}
                key={section.title}
                section={section}
              />
            ))}
          </View>
        )}

        {topic.kind !== 'photo' && topic.specialCard?.type === 'example' ? (
          <View style={[styles.specialCard, { borderColor: `${topic.accent}55` }]}>
            {topic.kind === 'recommendations' ? (
              <Text accessibilityElementsHidden style={[styles.specialHeart, { color: topic.accent }]}>
                ♡
              </Text>
            ) : null}
            <Text style={styles.specialTitle}>{topic.specialCard.title}</Text>
            <Text style={styles.specialText}>{topic.specialCard.text}</Text>
          </View>
        ) : null}

        {topic.specialCard?.type === 'stars-example' ? <StarsExample /> : null}

        {topic.actionLabel ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/analyze')}
            style={({ pressed }) => [styles.primaryButton, pressed && styles.primaryPressed]}
          >
            <Text style={styles.primaryButtonLabel}>{topic.actionLabel}</Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function PhotoGuideSections({
  accent,
  sections,
}: {
  accent: string;
  sections: Pick<InstructionSection, 'text' | 'title'>[];
}) {
  return (
    <>
      <View style={styles.photoGuideList}>
        {sections.map((section, index) => {
          const illustration = photoGuideImages[index];

          return (
            <View key={section.title} style={styles.photoGuideCard}>
              <View style={styles.photoGuideHeading}>
                <View style={[styles.sectionNumber, { backgroundColor: `${accent}1A` }]}>
                  <Text style={[styles.sectionNumberLabel, { color: accent }]}>{index + 1}</Text>
                </View>
                <Text style={styles.photoGuideTitle}>{section.title}</Text>
              </View>
              <Text style={styles.photoGuideText}>{section.text}</Text>
              {illustration ? (
                <Image
                  accessibilityLabel={`Илустрација за: ${section.title}`}
                  resizeMode="contain"
                  source={illustration}
                  style={styles.photoGuideImage}
                />
              ) : null}
            </View>
          );
        })}
      </View>

      <View style={styles.photoEncouragementCard}>
        <Text accessibilityElementsHidden style={styles.photoEncouragementHeart}>
          ♡
        </Text>
        <Text style={styles.photoEncouragementText}>
          Колку подобра фотографија, толку подобри препораки!
        </Text>
      </View>
    </>
  );
}

function InstructionSectionCard({
  accent,
  index,
  section,
}: {
  accent: string;
  index: number;
  section: InstructionSection;
}) {
  const toneStyle =
    section.tone === 'coral'
      ? styles.coralSection
      : section.tone === 'green'
        ? styles.greenSection
        : section.tone === 'teal'
          ? styles.tealSection
          : null;

  return (
    <View style={[styles.sectionCard, toneStyle]}>
      <View style={[styles.sectionNumber, { backgroundColor: `${accent}1A` }]}>
        <Text style={[styles.sectionNumberLabel, { color: accent }]}>{index + 1}</Text>
      </View>
      <View style={styles.sectionCopy}>
        {section.label ? <Text style={[styles.sectionLabel, { color: accent }]}>{section.label}</Text> : null}
        <Text style={styles.sectionTitle}>{section.title}</Text>
        <Text style={styles.sectionText}>{section.text}</Text>
        {section.supportingText ? (
          <Text style={[styles.supportingText, { color: accent }]}>{section.supportingText}</Text>
        ) : null}
      </View>
    </View>
  );
}

function StarsExample() {
  return (
    <>
      <View style={styles.starsExample}>
        <View style={styles.starRuleCard}>
          <Text style={styles.starRuleText}>1 ѕвездичка = 1 денар</Text>
        </View>

        <Text style={[styles.specialTitle, styles.starExampleTitle]}>Пример</Text>
        <View style={styles.starValueCard}>
          <Text style={styles.starItem}>Проценета вредност на играчката:</Text>
          <Text style={styles.starValue}>1.000 денари</Text>
        </View>
        <Text style={styles.flowArrow}>↓ успешна размена</Text>
        <Text style={styles.starItem}>По успешна размена добиваш:</Text>
        <Text style={styles.earnedStars}>1.000 ѕвездички</Text>
        <Text style={styles.flowArrow}>↓ потоа</Text>
        <Text style={styles.starExplanation}>
          Овие ѕвездички можеш да ги искористиш за друга играчка достапна преку платформата.
        </Text>
      </View>

      <View style={styles.starsNotice}>
        <Text style={styles.starsNoticeTitle}>Важно</Text>
        <Text style={styles.starsNoticeText}>
          Ѕвездичките се користат исклучиво во рамките на платформата На ти • Дај ми и не можат
          во ниту еден момент да се заменат или исплатат за пари.
        </Text>
      </View>

      <View style={styles.accountDeletionNotice}>
        <Text style={styles.starsNoticeText}>
          Ако го избришеш твојот профил, сите ѕвездички што ги имаш собрано ќе бидат изгубени и
          нема да можат да се вратат или исплатат.
        </Text>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: '#FBF4E8',
    flex: 1,
  },
  content: {
    paddingBottom: 36,
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    marginBottom: 20,
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
    fontSize: 22,
    lineHeight: 27,
    marginLeft: 5,
  },
  pressed: { opacity: 0.6 },
  introCard: {
    alignItems: 'center',
    backgroundColor: '#FFFDFC',
    borderRadius: 20,
    borderWidth: 1,
    flexDirection: 'row',
    padding: 17,
  },
  topicSymbol: {
    alignItems: 'center',
    borderRadius: 24,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  topicSymbolLabel: {
    fontFamily: 'Nunito_700Bold',
    fontSize: 24,
  },
  introText: {
    color: '#4F4943',
    flex: 1,
    fontFamily: 'Nunito_400Regular',
    fontSize: 15.5,
    lineHeight: 22,
    marginLeft: 14,
  },
  sectionList: {
    gap: 11,
    marginTop: 18,
  },
  photoGuideList: {
    gap: 16,
    marginTop: 18,
  },
  photoGuideCard: {
    backgroundColor: '#FFFDFC',
    borderColor: '#E8DED1',
    borderRadius: 20,
    borderWidth: 1,
    padding: 20,
  },
  photoGuideHeading: {
    alignItems: 'center',
    flexDirection: 'row',
  },
  photoGuideTitle: {
    color: '#342F2B',
    flex: 1,
    fontFamily: 'Nunito_800ExtraBold',
    fontSize: 17,
    lineHeight: 22,
    marginLeft: 12,
  },
  photoGuideText: {
    color: '#6D655E',
    fontFamily: 'Nunito_400Regular',
    fontSize: 14,
    lineHeight: 20,
    marginTop: 12,
  },
  photoGuideImage: {
    alignSelf: 'stretch',
    height: 180,
    marginTop: 16,
    maxHeight: 180,
    width: '100%',
  },
  photoEncouragementCard: {
    alignItems: 'center',
    backgroundColor: '#FFF2E8',
    borderColor: '#F0CFC1',
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    marginTop: 16,
    paddingHorizontal: 18,
    paddingVertical: 16,
  },
  photoEncouragementHeart: {
    color: '#E98262',
    fontFamily: 'Nunito_400Regular',
    fontSize: 30,
    lineHeight: 34,
    marginRight: 12,
  },
  photoEncouragementText: {
    color: '#4F4943',
    flex: 1,
    fontFamily: 'Nunito_700Bold',
    fontSize: 15,
    lineHeight: 21,
  },
  sectionCard: {
    alignItems: 'flex-start',
    backgroundColor: '#FFFDFC',
    borderColor: '#E8DED1',
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    padding: 16,
  },
  coralSection: { backgroundColor: '#FFF2ED' },
  greenSection: { backgroundColor: '#EFF6F0' },
  tealSection: { backgroundColor: '#EDF7F6' },
  sectionNumber: {
    alignItems: 'center',
    borderRadius: 16,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  sectionNumberLabel: {
    fontFamily: 'Nunito_800ExtraBold',
    fontSize: 15,
  },
  sectionCopy: {
    flex: 1,
    marginLeft: 12,
  },
  sectionLabel: {
    fontFamily: 'Nunito_700Bold',
    fontSize: 10.5,
    letterSpacing: 0.7,
  },
  sectionTitle: {
    color: '#342F2B',
    fontFamily: 'Nunito_800ExtraBold',
    fontSize: 16,
    lineHeight: 21,
    marginTop: 2,
  },
  sectionText: {
    color: '#6D655E',
    fontFamily: 'Nunito_400Regular',
    fontSize: 14,
    lineHeight: 20,
    marginTop: 6,
  },
  supportingText: {
    fontFamily: 'Nunito_700Bold',
    fontSize: 13,
    lineHeight: 18,
    marginTop: 8,
  },
  specialCard: {
    alignItems: 'center',
    backgroundColor: '#FFF3E7',
    borderRadius: 18,
    borderWidth: 1,
    marginTop: 16,
    padding: 18,
  },
  specialHeart: {
    fontFamily: 'Nunito_400Regular',
    fontSize: 35,
    lineHeight: 39,
  },
  specialTitle: {
    color: '#342F2B',
    fontFamily: 'Nunito_800ExtraBold',
    fontSize: 17,
    textAlign: 'center',
  },
  specialText: {
    color: '#6D655E',
    fontFamily: 'Nunito_400Regular',
    fontSize: 14,
    lineHeight: 21,
    marginTop: 7,
    textAlign: 'center',
  },
  starsExample: {
    alignItems: 'center',
    backgroundColor: '#FFF7E1',
    borderColor: '#E8CC78',
    borderRadius: 18,
    borderWidth: 1,
    marginTop: 16,
    padding: 18,
  },
  starRuleCard: {
    backgroundColor: '#FFFDF8',
    borderColor: '#D9B54A',
    borderRadius: 13,
    borderWidth: 1,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  starRuleText: {
    color: '#8D6A12',
    fontFamily: 'Nunito_800ExtraBold',
    fontSize: 16,
  },
  starExampleTitle: {
    marginTop: 16,
  },
  starValueCard: {
    alignItems: 'center',
    backgroundColor: '#FFFDF8',
    borderRadius: 14,
    marginTop: 12,
    paddingHorizontal: 22,
    paddingVertical: 12,
  },
  starItem: {
    color: '#4F4943',
    fontFamily: 'Nunito_700Bold',
    fontSize: 15,
  },
  starValue: {
    color: '#B68518',
    fontFamily: 'Nunito_800ExtraBold',
    fontSize: 17,
    marginTop: 3,
  },
  flowArrow: {
    color: '#8A7762',
    fontFamily: 'Nunito_400Regular',
    fontSize: 13,
    marginVertical: 7,
  },
  earnedStars: {
    color: '#2E6B4F',
    fontFamily: 'Nunito_800ExtraBold',
    fontSize: 19,
  },
  starExplanation: {
    color: '#5F574F',
    fontFamily: 'Nunito_400Regular',
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  starsNotice: {
    backgroundColor: '#F2F8F4',
    borderColor: '#BFD8C8',
    borderRadius: 18,
    borderWidth: 1,
    marginTop: 14,
    padding: 18,
  },
  starsNoticeTitle: {
    color: '#2E6B4F',
    fontFamily: 'Nunito_800ExtraBold',
    fontSize: 16,
    marginBottom: 6,
  },
  starsNoticeText: {
    color: '#5F574F',
    fontFamily: 'Nunito_400Regular',
    fontSize: 14,
    lineHeight: 21,
  },
  accountDeletionNotice: {
    backgroundColor: '#FFF3E7',
    borderColor: '#EACDB6',
    borderRadius: 18,
    borderWidth: 1,
    marginTop: 10,
    padding: 18,
  },
  primaryButton: {
    alignItems: 'center',
    alignSelf: 'stretch',
    backgroundColor: '#2E6B4F',
    borderRadius: 15,
    justifyContent: 'center',
    marginTop: 20,
    minHeight: 52,
    paddingHorizontal: 18,
  },
  primaryButtonLabel: {
    color: '#FFFFFF',
    fontFamily: 'Nunito_700Bold',
    fontSize: 16,
  },
  primaryPressed: { opacity: 0.85 },
  unavailableContent: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  unavailableTitle: {
    color: '#342F2B',
    fontFamily: 'Nunito_700Bold',
    fontSize: 18,
    textAlign: 'center',
  },
});
