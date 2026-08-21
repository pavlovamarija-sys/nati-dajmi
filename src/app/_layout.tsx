import { Stack } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { AuthProvider, useAuth } from '@/features/auth/auth-provider';
import { ToyAnalysisResultProvider } from '@/features/toy-analysis/toy-analysis-result-context';

export default function RootLayout() {
  return (
    <AuthProvider>
      <ToyAnalysisResultProvider>
        <RootNavigator />
      </ToyAnalysisResultProvider>
    </AuthProvider>
  );
}

function RootNavigator() {
  const { isLoading, session } = useAuth();

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color="#2E6B4F" size="large" />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={!session}>
        <Stack.Screen name="auth" />
      </Stack.Protected>
      <Stack.Protected guard={Boolean(session)}>
        <Stack.Screen name="index" />
        <Stack.Screen name="analyze" />
        <Stack.Screen name="how-it-works" />
        <Stack.Screen name="history" />
        <Stack.Screen name="instructions/[topic]" />
        <Stack.Screen name="profile" />
        <Stack.Screen name="results" />
        <Stack.Screen name="exchange" />
        <Stack.Screen name="listings/new" />
        <Stack.Screen name="listings/index" />
      </Stack.Protected>
    </Stack>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    alignItems: 'center',
    backgroundColor: '#F7F5F0',
    flex: 1,
    justifyContent: 'center',
  },
});
