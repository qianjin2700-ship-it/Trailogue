import { render } from '@testing-library/react-native';

import StartupScreen from '@/app/index';

describe('<StartupScreen />', () => {
  it('shows the product name and milestone message', () => {
    const screen = render(<StartupScreen />);

    expect(screen.getByRole('header', { name: 'Trailogue' })).toBeTruthy();
    expect(screen.getByText('Turn journeys into stories.')).toBeTruthy();
  });
});
