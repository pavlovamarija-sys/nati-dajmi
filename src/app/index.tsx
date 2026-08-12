import {
  Nunito_400Regular,
  Nunito_700Bold,
  Nunito_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/nunito';
import { router } from 'expo-router';
import { useState } from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppMenu } from '@/components/app-menu';

const recommendationIndicators = ['♡ Задржи', '↻ Ротирај', '⇄ Размени'] as const;

export default function HomeScreen() {
  const [fontsLoaded, fontError] = useFonts({
    Nunito_400Regular,
    Nunito_700Bold,
    Nunito_800ExtraBold,
  });
  const [isMenuVisible, setIsMenuVisible] = useState(false);
  const { fontScale, height } = useWindowDimensions();

  if (!fontsLoaded && !fontError) {
    return <SafeAreaView style={styles.safeArea} />;
  }

  const isCompact = height < 720;
  const needsScrollFallback = height < 620 || fontScale > 1.25;
  const contentStyle = [styles.content, isCompact && styles.compactContent];

  const homeContent = (
    <>
      <View style={styles.header}>
        <View style={styles.brandLockup}>
          <Image
            accessibilityLabel="Лого На ти • Дај ми"
            source={require('../../assets/images/nati-dajmi-logo.png')}
            style={[styles.logo, isCompact && styles.compactLogo]}
          />
          <Text style={styles.brandTagline}>
            <Text style={styles.taglineCoral}>Поиграј</Text>
            <Text style={styles.taglineSeparator}> • </Text>
            <Text style={styles.taglineGreen}>Порасни</Text>
            <Text style={styles.taglineSeparator}> • </Text>
            <Text style={styles.taglineTeal}>Размени</Text>
          </Text>
        </View>

        <Pressable
          accessibilityLabel="Отвори го менито"
          accessibilityRole="button"
          hitSlop={6}
          onPress={() => setIsMenuVisible(true)}
          style={({ pressed }) => [styles.menuButton, pressed && styles.quietPressed]}
        >
          <View style={styles.menuLine} />
          <View style={styles.menuLine} />
          <View style={styles.menuLine} />
        </Pressable>
      </View>

      <View style={[styles.hero, isCompact && styles.compactHero]}>
        <View style={styles.heroHeadlineRow}>
          <View>
            <Text style={[styles.heroTitle, isCompact && styles.compactHeroTitle]}>
              Помалку хаос.
            </Text>
            <Text
              style={[
                styles.heroTitle,
                styles.heroTitleAccent,
                isCompact && styles.compactHeroTitle,
              ]}
            >
              Повеќе игра.
            </Text>
          </View>
          <View accessibilityElementsHidden style={styles.heartDecoration}>
            <View style={[styles.heartRay, styles.heartRayOne]} />
            <View style={[styles.heartRay, styles.heartRayTwo]} />
            <View style={[styles.heartRay, styles.heartRayThree]} />
            <Text style={styles.heart}>♡</Text>
          </View>
        </View>
        <Text style={[styles.heroText, isCompact && styles.compactHeroText]}>
          Сликај ги играчките и откриј што да{`\n`}оставиш, ротираш или{' '}
          <Text style={styles.heroTextHighlight}>размениш</Text> —{`\n`}плус нови идеи за игра.
        </Text>
      </View>

      <View style={[styles.analysisCard, isCompact && styles.compactAnalysisCard]}>
        <View style={styles.analysisCardInner}>
          <View style={styles.analysisTopRow}>
            <Image
              accessibilityLabel="Камера"
              resizeMode="contain"
              source={require('../../assets/images/home-analysis-camera.png')}
              style={[styles.cameraImage, isCompact && styles.compactCameraImage]}
            />
            <View style={styles.analysisCopy}>
              <Text style={[styles.analysisTitle, isCompact && styles.compactAnalysisTitle]}>
                Сликај ги{`\n`}играчките
              </Text>
              <Text style={[styles.analysisText, isCompact && styles.compactAnalysisText]}>
                Една фотографија{`\n`}е доволна.
              </Text>
            </View>
          </View>

          <View style={[styles.analysisBottomRow, isCompact && styles.compactAnalysisBottomRow]}>
            <Pressable
              accessibilityRole="button"
              accessibilityHint="Го отвора екранот за фотографирање и анализа"
              onPress={() => router.push('/analyze')}
              style={({ pressed }) => [
                styles.analysisActionButton,
                isCompact && styles.compactAnalysisActionButton,
                pressed && styles.analysisActionPressed,
              ]}
            >
              <Text style={styles.analysisAction}>Сликај →</Text>
            </Pressable>

            <View accessibilityElementsHidden style={styles.toyIllustration}>
              <Image
                resizeMode="contain"
                source={require('../../assets/images/home-analysis-toys.png')}
                style={styles.toyImage}
              />
            </View>
          </View>
        </View>
      </View>

      <View style={styles.indicators}>
        {recommendationIndicators.map((indicator, index) => (
          <View
            key={indicator}
            style={[
              styles.indicator,
              index === 0 && styles.indicatorPeachBackground,
              index === 1 && styles.indicatorGreenBackground,
              index === 2 && styles.indicatorTealBackground,
            ]}
          >
            <Text
              style={[
                styles.indicatorText,
                index === 0 && styles.indicatorCoral,
                index === 1 && styles.indicatorGreen,
                index === 2 && styles.indicatorTeal,
              ]}
            >
              {indicator}
            </Text>
          </View>
        ))}
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityHint="Го отвора екранот со објаснувања"
        onPress={() => router.push('/how-it-works')}
        style={({ pressed }) => [styles.howItWorksButton, pressed && styles.quietPressed]}
      >
        <Text style={styles.howItWorksLabel}>Како функционира? →</Text>
      </Pressable>
    </>
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      {needsScrollFallback ? (
        <ScrollView
          contentContainerStyle={contentStyle}
          showsVerticalScrollIndicator={false}
        >
          {homeContent}
        </ScrollView>
      ) : (
        <View style={contentStyle}>{homeContent}</View>
      )}
      <AppMenu onClose={() => setIsMenuVisible(false)} visible={isMenuVisible} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: '#FBF4E8',
    flex: 1,
  },
  content: {
    flexGrow: 1,
    paddingBottom: 10,
    paddingHorizontal: 20,
    paddingTop: 6,
  },
  compactContent: {
    paddingBottom: 6,
    paddingTop: 3,
  },
  header: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  brandLockup: {
    alignItems: 'center',
    alignSelf: 'flex-start',
  },
  menuButton: {
    alignItems: 'center',
    backgroundColor: '#F7E9D9',
    borderRadius: 21,
    height: 42,
    justifyContent: 'center',
    marginTop: 4,
    width: 46,
  },
  menuLine: {
    backgroundColor: '#356C53',
    borderRadius: 2,
    height: 2.5,
    marginVertical: 2.5,
    width: 21,
  },
  logo: {
    backgroundColor: '#FFFDFC',
    borderRadius: 50,
    height: 100,
    shadowColor: '#5D4436',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 5,
    width: 100,
  },
  compactLogo: {
    borderRadius: 44,
    height: 88,
    width: 88,
  },
  brandTagline: {
    fontFamily: 'Nunito_700Bold',
    fontSize: 11.5,
    letterSpacing: -0.1,
    marginTop: 4,
    textAlign: 'center',
  },
  taglineCoral: { color: '#DF6F51' },
  taglineGreen: { color: '#397357' },
  taglineTeal: { color: '#31858A' },
  taglineSeparator: { color: '#615950' },
  hero: {
    marginBottom: 14,
    marginTop: 14,
  },
  compactHero: {
    marginBottom: 10,
    marginTop: 9,
  },
  heroHeadlineRow: {
    alignItems: 'flex-end',
    flexDirection: 'row',
  },
  heroTitle: {
    color: '#2D2925',
    fontFamily: 'Nunito_800ExtraBold',
    fontSize: 36,
    letterSpacing: -1.1,
    lineHeight: 39,
  },
  compactHeroTitle: {
    fontSize: 32,
    lineHeight: 35,
  },
  heroTitleAccent: { color: '#DD6F50' },
  heartDecoration: {
    height: 55,
    marginBottom: 0,
    marginLeft: 7,
    width: 48,
  },
  heart: {
    bottom: -2,
    color: '#E66E52',
    fontSize: 41,
    fontWeight: '500',
    left: 0,
    position: 'absolute',
    transform: [{ rotate: '-10deg' }],
  },
  heartRay: {
    backgroundColor: '#EDB341',
    borderRadius: 2,
    height: 4,
    position: 'absolute',
    width: 17,
  },
  heartRayOne: { right: 12, top: 3, transform: [{ rotate: '-68deg' }] },
  heartRayTwo: { right: 1, top: 14, transform: [{ rotate: '-35deg' }] },
  heartRayThree: { right: -1, top: 29, transform: [{ rotate: '-9deg' }] },
  heroText: {
    color: '#625B54',
    fontFamily: 'Nunito_400Regular',
    fontSize: 15.5,
    lineHeight: 22,
    marginTop: 10,
    maxWidth: 370,
  },
  compactHeroText: {
    fontSize: 14.5,
    lineHeight: 20,
    marginTop: 7,
  },
  heroTextHighlight: {
    color: '#31858A',
    fontFamily: 'Nunito_700Bold',
  },
  analysisCard: {
    backgroundColor: '#FFFCF6',
    borderColor: '#E9DDCE',
    borderRadius: 23,
    borderWidth: 1,
    minHeight: 218,
    padding: 5,
    shadowColor: '#5D4436',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.11,
    shadowRadius: 9,
    elevation: 3,
  },
  compactAnalysisCard: {
    minHeight: 202,
  },
  analysisCardInner: {
    borderColor: '#E9DCCE',
    borderRadius: 18,
    borderStyle: 'dashed',
    borderWidth: 1,
    flex: 1,
    padding: 10,
  },
  analysisTopRow: {
    alignItems: 'center',
    flexDirection: 'row',
  },
  cameraImage: {
    height: 84,
    marginLeft: -3,
    width: 84,
  },
  compactCameraImage: {
    height: 75,
    width: 75,
  },
  analysisCopy: {
    flex: 1,
    marginLeft: 8,
    paddingRight: 2,
  },
  analysisTitle: {
    color: '#2E2A24',
    fontFamily: 'Nunito_800ExtraBold',
    fontSize: 21,
    letterSpacing: -0.3,
    lineHeight: 25,
  },
  compactAnalysisTitle: {
    fontSize: 19,
    lineHeight: 22,
  },
  analysisText: {
    color: '#696159',
    fontFamily: 'Nunito_400Regular',
    fontSize: 13.5,
    lineHeight: 18,
    marginTop: 5,
  },
  compactAnalysisText: {
    fontSize: 12.5,
    lineHeight: 16,
    marginTop: 3,
  },
  analysisBottomRow: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    gap: 9,
    marginTop: 8,
  },
  compactAnalysisBottomRow: {
    marginTop: 4,
  },
  analysisActionButton: {
    alignItems: 'center',
    alignSelf: 'flex-end',
    backgroundColor: '#2E6B4F',
    borderRadius: 13,
    flexBasis: '47%',
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: 15,
  },
  compactAnalysisActionButton: {
    minHeight: 44,
  },
  analysisActionPressed: {
    opacity: 0.86,
    transform: [{ scale: 0.99 }],
  },
  analysisAction: {
    color: '#FFFFFF',
    fontFamily: 'Nunito_700Bold',
    fontSize: 18,
  },
  toyIllustration: {
    flex: 1,
    height: 88,
    minWidth: 0,
  },
  toyImage: {
    height: '100%',
    width: '100%',
  },
  indicators: {
    flexDirection: 'row',
    gap: 7,
    marginTop: 9,
  },
  indicator: {
    alignItems: 'center',
    borderColor: 'transparent',
    borderRadius: 18,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 37,
    paddingHorizontal: 4,
  },
  indicatorText: {
    fontFamily: 'Nunito_700Bold',
    fontSize: 12,
  },
  indicatorCoral: { color: '#C95F43' },
  indicatorGreen: { color: '#2E6B4F' },
  indicatorTeal: { color: '#27777A' },
  indicatorPeachBackground: { backgroundColor: '#F9DED5', borderColor: '#F0C7BA' },
  indicatorGreenBackground: { backgroundColor: '#DFECE3', borderColor: '#C9DDCF' },
  indicatorTealBackground: { backgroundColor: '#DCEEEE', borderColor: '#C4DFDE' },
  howItWorksButton: {
    alignItems: 'center',
    alignSelf: 'flex-end',
    justifyContent: 'center',
    marginTop: 8,
    minHeight: 44,
    paddingHorizontal: 4,
  },
  howItWorksLabel: {
    color: '#356C53',
    fontFamily: 'Nunito_700Bold',
    fontSize: 15,
  },
  quietPressed: { opacity: 0.6 },
});
