import { Stack } from 'expo-router';

export default function AppLayout() {
  return (
    <Stack screenOptions={{ headerBackTitle: 'Back', headerTintColor: '#24211D' }}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="trips/index" options={{ title: 'My Trips' }} />
      <Stack.Screen name="trips/[id]" options={{ title: 'Trip' }} />
      <Stack.Screen name="trips/new" options={{ title: 'New Trip' }} />
      <Stack.Screen name="trips/edit" options={{ title: 'Edit Trip' }} />
      <Stack.Screen name="trips/story" options={{ title: 'Travel Story' }} />
      <Stack.Screen name="trips/book" options={{ title: 'Book Preview' }} />
      <Stack.Screen name="settings" options={{ title: 'Settings' }} />
    </Stack>
  );
}

