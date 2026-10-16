import { StyleSheet, Text, View } from 'react-native';

export default function AppHomeScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>My Trips</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: '#F7F4EE', flex: 1, padding: 24 },
  title: { color: '#24211D', fontSize: 32, fontWeight: '700' },
});

