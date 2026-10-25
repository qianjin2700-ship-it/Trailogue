import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { Pressable, Text } from 'react-native';

import { AuthProvider, useAuth } from '@/auth/AuthProvider';

const mockGetToken = jest.fn();
const mockRemoveToken = jest.fn();

jest.mock('@/services/authStorage', () => ({
  authStorage: {
    saveToken: jest.fn(),
    getToken: () => mockGetToken(),
    removeToken: () => mockRemoveToken(),
  },
}));
jest.mock('@/composition/services', () => ({
  authApi: { signInWithApple: jest.fn() },
  usersApi: { getCurrentUser: jest.fn() },
}));

function SessionProbe() {
  const { signOut, status } = useAuth();
  return (
    <>
      <Text>{status}</Text>
      <Pressable accessibilityRole="button" onPress={() => void signOut()}>
        <Text>Clear local session</Text>
      </Pressable>
    </>
  );
}

describe('<AuthProvider /> sign out', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetToken.mockResolvedValue(null);
    mockRemoveToken.mockResolvedValue(undefined);
  });

  it('removes the stored token and transitions the app to the unauthenticated login gate', async () => {
    const screen = render(
      <AuthProvider>
        <SessionProbe />
      </AuthProvider>,
    );

    await waitFor(() => expect(screen.getByText('unauthenticated')).toBeTruthy());
    fireEvent.press(screen.getByRole('button', { name: 'Clear local session' }));

    await waitFor(() => expect(mockRemoveToken).toHaveBeenCalledTimes(1));
    expect(screen.getByText('unauthenticated')).toBeTruthy();
  });
});
