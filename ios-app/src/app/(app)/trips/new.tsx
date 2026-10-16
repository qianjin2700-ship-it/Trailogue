import { StyleSheet, Text, View } from 'react-native';

export default function NewTripPlaceholderScreen() {
  return (
    <View style={styles.container}>
      <Text accessibilityRole="header" style={styles.title}>Create a new trip</Text>
      <Text style={styles.description}>Trip creation and photo upload arrive in Wave 3.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: '#F7F4EE', flex: 1, padding: 24 },
  title: { color: '#24211D', fontSize: 30, fontWeight: '700' },
  description: { color: '#655F57', fontSize: 16, lineHeight: 24, marginTop: 12 },
});

