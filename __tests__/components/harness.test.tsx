import { render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

describe('ui jest harness', () => {
  it('runs the ui project', () => {
    expect(true).toBe(true);
  });

  // Known limitation, inherited from water-tracker and its-a-rock: RN 0.83
  // new-arch host components render to a null stub under jest-expo ~55, so RNTL
  // queries find nothing. Keep a render smoke test wired but skipped until it is
  // resolved; un-skip this first, then the component specs alongside it.
  // See docs/testing.md.
  it.skip('renders a host component', async () => {
    await render(<Text>hello</Text>);
    expect(screen.getByText('hello')).toBeOnTheScreen();
  });
});
