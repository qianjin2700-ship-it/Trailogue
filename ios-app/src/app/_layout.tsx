import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { AuthProvider, useAuth } from '@/auth/AuthProvider';

export default function RootLayout() {
  return (
    <AuthProvider>
      <StatusBar style="dark" />
      <RootNavigator />
    </AuthProvider>
  );
}

function RootNavigator() {
  const { status, error, retryRestore } = useAuth();

  if (status === 'unknown') {
    return (
      <View style={styles.bootstrap}>
        {error ? (
          <>
            <Text style={styles.message}>We couldn&apos;t restore your session.</Text>
            <Pressable accessibilityRole="button" onPress={() => void retryRestore()} style={styles.retry}>
              <Text style={styles.retryLabel}>Try again</Text>
            </Pressable>
          </>
        ) : (
          <ActivityIndicator accessibilityLabel="Restoring session" color="#7D5C3C" size="large" />
        )}
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={status === 'unauthenticated'}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
      <Stack.Protected guard={status === 'authenticated'}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>
    </Stack>
  );
}

const styles = StyleSheet.create({
  bootstrap: {
    alignItems: 'center',
    backgroundColor: '#F4EFE6',
    flex: 1,
    justifyContent: 'center',
    padding: 32,
  },
  message: {
    color: '#24211D',
    fontSize: 17,
    textAlign: 'center',
  },
  retry: {
    backgroundColor: '#24211D',
    borderRadius: 12,
    marginTop: 20,
    paddingHorizontal: 22,
    paddingVertical: 12,
  },
  retryLabel: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
});
