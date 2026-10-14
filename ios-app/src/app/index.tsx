import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function StartupScreen() {
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <Text accessibilityRole="header" style={styles.wordmark}>
          Trailogue
        </Text>
        <Text style={styles.title}>Turn journeys into stories.</Text>
        <Text style={styles.description}>
          The iOS foundation is ready. Sign-in and trip creation arrive in the next milestone.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F4EFE6',
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  wordmark: {
    color: '#7D5C3C',
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 1.4,
    marginBottom: 24,
    textTransform: 'uppercase',
  },
  title: {
    color: '#24211D',
    fontSize: 44,
    fontWeight: '700',
    letterSpacing: -1.2,
    lineHeight: 50,
  },
  description: {
    color: '#655F57',
    fontSize: 17,
    lineHeight: 26,
    marginTop: 18,
    maxWidth: 420,
  },
});
