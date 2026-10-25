import { render } from '@testing-library/react-native';
import RootLayout from '@/app/_layout';

jest.mock('@/auth/AuthProvider', () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
  useAuth: () => ({
    status: 'unauthenticated',
    error: null,
    retryRestore: jest.fn(),
  }),
}));
jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));
jest.mock('expo-router', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');

  function Stack({ children }: { children: React.ReactNode }) {
    return React.createElement(React.Fragment, null, children);
  }

  function Protected({ children, guard }: { children: React.ReactNode; guard: boolean }) {
    return guard ? React.createElement(React.Fragment, null, children) : null;
  }

  function Screen({ name }: { name: string }) {
    return React.createElement(Text, null, name);
  }

  return { Stack: Object.assign(Stack, { Protected, Screen }) };
});

describe('<RootLayout /> unauthenticated gate', () => {
  it('renders the login route and excludes the authenticated app route', () => {
    const screen = render(<RootLayout />);

    expect(screen.getByText('(auth)')).toBeTruthy();
    expect(screen.queryByText('(app)')).toBeNull();
  });
});
