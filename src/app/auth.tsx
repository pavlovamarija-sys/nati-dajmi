import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  getParentFriendlyAuthError,
  signInWithEmail,
  signUpWithEmail,
} from '@/features/auth/services/auth-service';

type AuthAction = 'sign-in' | 'sign-up';

export default function AuthScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pendingAction, setPendingAction] = useState<AuthAction | null>(null);
  const isBusy = pendingAction !== null;
  const canSubmit = email.trim().length > 0 && password.length > 0 && !isBusy;

  const submit = async (action: AuthAction) => {
    if (!canSubmit) {
      return;
    }

    setPendingAction(action);

    try {
      if (action === 'sign-in') {
        await signInWithEmail(email, password);
      } else {
        const result = await signUpWithEmail(email, password);

        if (result.confirmationRequired) {
          Alert.alert(
            'Провери ја е-поштата',
            'Отвори ја врската за потврда што ти ја испративме, па врати се тука за да се најавиш.',
          );
        }
      }
    } catch (error) {
      Alert.alert('Не можевме да продолжиме', getParentFriendlyAuthError(error));
    } finally {
      setPendingAction(null);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardView}
      >
        <View style={styles.container}>
          <View style={styles.header}>
            <Text style={styles.title}>Добредојде</Text>
            <Text style={styles.subtitle}>Најави се за да ги анализираш играчките.</Text>
          </View>

          <View style={styles.form}>
            <View style={styles.field}>
              <Text style={styles.label}>Е-пошта</Text>
              <TextInput
                accessibilityLabel="Е-пошта"
                autoCapitalize="none"
                autoComplete="email"
                editable={!isBusy}
                keyboardType="email-address"
                onChangeText={setEmail}
                placeholder="parent@example.com"
                returnKeyType="next"
                style={styles.input}
                textContentType="emailAddress"
                value={email}
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Лозинка</Text>
              <TextInput
                accessibilityLabel="Лозинка"
                autoCapitalize="none"
                autoComplete="password"
                editable={!isBusy}
                onChangeText={setPassword}
                onSubmitEditing={() => void submit('sign-in')}
                placeholder="Твојата лозинка"
                returnKeyType="done"
                secureTextEntry
                style={styles.input}
                textContentType="password"
                value={password}
              />
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityState={{ busy: pendingAction === 'sign-in', disabled: !canSubmit }}
              disabled={!canSubmit}
              onPress={() => void submit('sign-in')}
              style={({ pressed }) => [
                styles.primaryButton,
                !canSubmit && styles.disabledButton,
                pressed && canSubmit && styles.pressedButton,
              ]}
            >
              {pendingAction === 'sign-in' ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.primaryButtonLabel}>Најави се</Text>
              )}
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityState={{ busy: pendingAction === 'sign-up', disabled: !canSubmit }}
              disabled={!canSubmit}
              onPress={() => void submit('sign-up')}
              style={({ pressed }) => [
                styles.secondaryButton,
                !canSubmit && styles.disabledSecondaryButton,
                pressed && canSubmit && styles.pressedButton,
              ]}
            >
              {pendingAction === 'sign-up' ? (
                <ActivityIndicator color="#2E6B4F" />
              ) : (
                <Text style={styles.secondaryButtonLabel}>Креирај профил</Text>
              )}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: '#F7F5F0', flex: 1 },
  keyboardView: { flex: 1 },
  container: { flex: 1, justifyContent: 'center', paddingHorizontal: 24 },
  header: { marginBottom: 32 },
  title: { color: '#1E2A24', fontSize: 34, fontWeight: '700', marginBottom: 10 },
  subtitle: { color: '#59635E', fontSize: 17, lineHeight: 25 },
  form: { gap: 18 },
  field: { gap: 8 },
  label: { color: '#34453C', fontSize: 15, fontWeight: '600' },
  input: {
    backgroundColor: '#FFFFFF',
    borderColor: '#D8D4CA',
    borderRadius: 12,
    borderWidth: 1,
    color: '#1E2A24',
    fontSize: 16,
    minHeight: 52,
    paddingHorizontal: 16,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: '#2E6B4F',
    borderRadius: 14,
    justifyContent: 'center',
    marginTop: 6,
    minHeight: 54,
  },
  primaryButtonLabel: { color: '#FFFFFF', fontSize: 17, fontWeight: '700' },
  secondaryButton: {
    alignItems: 'center',
    borderColor: '#2E6B4F',
    borderRadius: 14,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 54,
  },
  secondaryButtonLabel: { color: '#2E6B4F', fontSize: 17, fontWeight: '700' },
  disabledButton: { backgroundColor: '#D9D8D2' },
  disabledSecondaryButton: { borderColor: '#C8C7C1' },
  pressedButton: { opacity: 0.85 },
});
