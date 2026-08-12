import {
  Nunito_400Regular,
  Nunito_700Bold,
  Nunito_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/nunito';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/features/auth/auth-provider';

export default function ProfileScreen() {
  const { session } = useAuth();
  const [fontsLoaded, fontError] = useFonts({
    Nunito_400Regular,
    Nunito_700Bold,
    Nunito_800ExtraBold,
  });

  if (!fontsLoaded && !fontError) {
    return <SafeAreaView style={styles.safeArea} />;
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.content}>
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
          <Text style={styles.title}>Мој профил</Text>
        </View>

        <View style={styles.profileCard}>
          <View style={styles.profileIcon}>
            <View style={styles.profileHead} />
            <View style={styles.profileShoulders} />
          </View>
          <Text style={styles.emailLabel}>Е-пошта</Text>
          <Text selectable style={styles.email}>
            {session?.user.email ?? '—'}
          </Text>
          <Text style={styles.placeholderText}>
            Дополнителни поставки за профилот ќе бидат достапни подоцна.
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: '#FBF4E8',
    flex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
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
  pressed: { opacity: 0.6 },
  title: {
    color: '#2D2925',
    flex: 1,
    fontFamily: 'Nunito_800ExtraBold',
    fontSize: 25,
    marginLeft: 5,
  },
  profileCard: {
    alignItems: 'center',
    backgroundColor: '#FFFDFC',
    borderColor: '#E8DED1',
    borderRadius: 22,
    borderWidth: 1,
    marginTop: 26,
    padding: 24,
    shadowColor: '#594C40',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.07,
    shadowRadius: 7,
    elevation: 2,
  },
  profileIcon: {
    alignItems: 'center',
    backgroundColor: '#DFECE3',
    borderRadius: 32,
    height: 64,
    justifyContent: 'center',
    width: 64,
  },
  profileHead: {
    borderColor: '#356C53',
    borderRadius: 8,
    borderWidth: 2.5,
    height: 16,
    width: 16,
  },
  profileShoulders: {
    borderColor: '#356C53',
    borderRadius: 13,
    borderWidth: 2.5,
    height: 14,
    marginTop: 4,
    width: 29,
  },
  emailLabel: {
    color: '#746C64',
    fontFamily: 'Nunito_400Regular',
    fontSize: 13,
    marginTop: 18,
  },
  email: {
    color: '#342F2B',
    fontFamily: 'Nunito_700Bold',
    fontSize: 16,
    marginTop: 5,
    textAlign: 'center',
  },
  placeholderText: {
    color: '#746C64',
    fontFamily: 'Nunito_400Regular',
    fontSize: 14,
    lineHeight: 21,
    marginTop: 22,
    textAlign: 'center',
  },
});
