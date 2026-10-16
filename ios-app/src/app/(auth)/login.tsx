import * as AppleAuthentication from 'expo-apple-authentication';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/auth/AuthProvider';

export default function LoginScreen() {
  const { error, isSigningIn, signInWithApple } = useAuth();

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View>
          <Text accessibilityRole="header" style={styles.wordmark}>
            Trailogue
          </Text>
          <Text style={styles.title}>Turn journeys into stories.</Text>
          <Text style={styles.description}>
            Organize your travel photos and shape them into a story worth keeping.
          </Text>
        </View>

        <View>
          <AppleAuthentication.AppleAuthenticationButton
            buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
            buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
            cornerRadius={12}
            onPress={() => !isSigningIn && void signInWithApple()}
            style={[styles.appleButton, isSigningIn && styles.disabled]}
          />
          {error ? <Text style={styles.error}>{error.message}</Text> : null}
          <View style={styles.legalRow}>
            <LegalLink label="Privacy Policy" url={process.env.EXPO_PUBLIC_PRIVACY_URL} />
            <Text style={styles.legalSeparator}>·</Text>
            <LegalLink label="Terms of Service" url={process.env.EXPO_PUBLIC_TERMS_URL} />
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}

function LegalLink({ label, url }: { label: string; url?: string }) {
  return (
    <Pressable
      accessibilityRole="link"
      disabled={!url}
      onPress={() => url && void Linking.openURL(url)}
    >
      <Text style={[styles.legalLink, !url && styles.disabled]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: '#F4EFE6', flex: 1 },
  container: { flex: 1, justifyContent: 'space-between', padding: 32, paddingBottom: 24 },
  wordmark: {
    color: '#7D5C3C',
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 1.4,
    marginBottom: 24,
    textTransform: 'uppercase',
  },
  title: { color: '#24211D', fontSize: 42, fontWeight: '700', letterSpacing: -1.1, lineHeight: 48 },
  description: { color: '#655F57', fontSize: 17, lineHeight: 26, marginTop: 18 },
  appleButton: { height: 52, width: '100%' },
  error: { color: '#A33A2B', fontSize: 14, lineHeight: 20, marginTop: 12, textAlign: 'center' },
  legalRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'center', marginTop: 18 },
  legalLink: { color: '#655F57', fontSize: 13, textDecorationLine: 'underline' },
  legalSeparator: { color: '#8C857B', marginHorizontal: 8 },
  disabled: { opacity: 0.45 },
});

