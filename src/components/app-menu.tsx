import {
  Nunito_400Regular,
  Nunito_700Bold,
  Nunito_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/nunito';
import { type Href, router } from 'expo-router';
import { useState } from 'react';
import { Alert, Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { signOut } from '@/features/auth/services/auth-service';

type AppMenuProps = {
  onClose: () => void;
  visible: boolean;
};

const menuItems = [
  { icon: '⌂', label: 'Почетна', route: '/' },
  { icon: '▣', label: 'Анализирај играчки', route: '/analyze' },
  { icon: '≡', label: 'Мои анализи', route: '/history' },
  { icon: '◇', label: 'Моите играчки', route: '/listings' as Href },
  { icon: '⇄', label: 'Размена', route: '/exchange' },
  { icon: '?', label: 'Како функционира?', route: '/how-it-works' },
  { icon: '○', label: 'Мој профил', route: '/profile' },
] satisfies ReadonlyArray<{ icon: string; label: string; route: Href }>;

export function AppMenu({ onClose, visible }: AppMenuProps) {
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [fontsLoaded, fontError] = useFonts({
    Nunito_400Regular,
    Nunito_700Bold,
    Nunito_800ExtraBold,
  });

  const handleNavigation = (route: Href) => {
    onClose();

    if (route !== '/') {
      requestAnimationFrame(() => router.push(route));
    }
  };

  const handleSignOut = async () => {
    if (isSigningOut) {
      return;
    }

    setIsSigningOut(true);

    try {
      await signOut();
      onClose();
    } catch {
      Alert.alert('Не можевме да те одјавиме.', 'Обиди се повторно.');
    } finally {
      setIsSigningOut(false);
    }
  };

  if (!fontsLoaded && !fontError) {
    return null;
  }

  return (
    <Modal
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
      transparent
      visible={visible}
    >
      <View style={styles.overlay}>
        <Pressable
          accessibilityLabel="Затвори го менито"
          accessibilityRole="button"
          onPress={onClose}
          style={styles.backdrop}
        />

        <SafeAreaView edges={['top', 'bottom', 'right']} style={styles.sheet}>
          <View style={styles.brandHeader}>
            <Image
              accessibilityLabel="Лого На ти • Дај ми"
              source={require('../../assets/images/nati-dajmi-logo.png')}
              style={styles.logo}
            />
            <View style={styles.brandCopy}>
              <Text style={styles.brandName}>На ти • Дај ми</Text>
              <Text style={styles.brandTagline}>Поиграј • Порасни • Размени</Text>
            </View>
            <Pressable
              accessibilityLabel="Затвори"
              accessibilityRole="button"
              hitSlop={8}
              onPress={onClose}
              style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}
            >
              <Text style={styles.closeLabel}>×</Text>
            </Pressable>
          </View>

          <View style={styles.menuList}>
            {menuItems.map((item, index) => (
              <Pressable
                accessibilityRole="button"
                key={item.label}
                onPress={() => handleNavigation(item.route)}
                style={({ pressed }) => [styles.menuItem, pressed && styles.menuItemPressed]}
              >
                <View
                  style={[
                    styles.menuIcon,
                    index % 3 === 0 && styles.coralIcon,
                    index % 3 === 1 && styles.greenIcon,
                    index % 3 === 2 && styles.tealIcon,
                  ]}
                >
                  <Text style={styles.menuIconLabel}>{item.icon}</Text>
                </View>
                <Text style={styles.menuLabel}>{item.label}</Text>
                <Text style={styles.menuArrow}>›</Text>
              </Pressable>
            ))}
          </View>

          <View style={styles.signOutArea}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ busy: isSigningOut, disabled: isSigningOut }}
              disabled={isSigningOut}
              onPress={() => void handleSignOut()}
              style={({ pressed }) => [
                styles.signOutButton,
                pressed && !isSigningOut && styles.menuItemPressed,
              ]}
            >
              <Text style={styles.signOutIcon}>↪</Text>
              <Text style={styles.signOutLabel}>
                {isSigningOut ? 'Се одјавуваме...' : 'Одјави се'}
              </Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  backdrop: {
    backgroundColor: 'rgba(45, 41, 37, 0.36)',
    ...StyleSheet.absoluteFillObject,
  },
  sheet: {
    backgroundColor: '#FBF4E8',
    borderBottomLeftRadius: 26,
    borderTopLeftRadius: 26,
    maxWidth: 350,
    paddingBottom: 12,
    paddingHorizontal: 18,
    shadowColor: '#2D2925',
    shadowOffset: { width: -4, height: 0 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    width: '86%',
    elevation: 12,
  },
  brandHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    paddingBottom: 18,
    paddingTop: 10,
  },
  logo: {
    borderRadius: 27,
    height: 54,
    width: 54,
  },
  brandCopy: {
    flex: 1,
    marginLeft: 10,
  },
  brandName: {
    color: '#2D2925',
    fontFamily: 'Nunito_800ExtraBold',
    fontSize: 17,
  },
  brandTagline: {
    color: '#716960',
    fontFamily: 'Nunito_400Regular',
    fontSize: 9.5,
    marginTop: 2,
  },
  closeButton: {
    alignItems: 'center',
    height: 44,
    justifyContent: 'center',
    width: 38,
  },
  closeLabel: {
    color: '#716960',
    fontFamily: 'Nunito_400Regular',
    fontSize: 29,
  },
  pressed: { opacity: 0.6 },
  menuList: {
    gap: 6,
  },
  menuItem: {
    alignItems: 'center',
    borderRadius: 15,
    flexDirection: 'row',
    minHeight: 56,
    paddingHorizontal: 8,
  },
  menuItemPressed: {
    backgroundColor: '#F2E5D7',
  },
  menuIcon: {
    alignItems: 'center',
    borderRadius: 18,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  coralIcon: { backgroundColor: '#F8DED5' },
  greenIcon: { backgroundColor: '#DFECE3' },
  tealIcon: { backgroundColor: '#DCEEEE' },
  menuIconLabel: {
    color: '#4E4943',
    fontFamily: 'Nunito_700Bold',
    fontSize: 19,
  },
  menuLabel: {
    color: '#342F2B',
    flex: 1,
    fontFamily: 'Nunito_700Bold',
    fontSize: 16,
    marginLeft: 12,
  },
  menuArrow: {
    color: '#9B9187',
    fontFamily: 'Nunito_700Bold',
    fontSize: 24,
    paddingHorizontal: 6,
  },
  signOutArea: {
    borderTopColor: '#E4D8CA',
    borderTopWidth: 1,
    marginTop: 'auto',
    paddingTop: 13,
  },
  signOutButton: {
    alignItems: 'center',
    borderRadius: 15,
    flexDirection: 'row',
    minHeight: 54,
    paddingHorizontal: 13,
  },
  signOutIcon: {
    color: '#C95F43',
    fontFamily: 'Nunito_700Bold',
    fontSize: 23,
    width: 34,
  },
  signOutLabel: {
    color: '#A94E38',
    fontFamily: 'Nunito_700Bold',
    fontSize: 16,
    marginLeft: 7,
  },
});
