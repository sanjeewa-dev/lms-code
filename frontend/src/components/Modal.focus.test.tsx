import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Modal } from './ui';

afterEach(() => cleanup());

describe('Modal focus trap', () => {
  it('keeps focus in the field while typing when onClose is recreated each render', async () => {
    const user = userEvent.setup();

    function Parent() {
      const [value, setValue] = useState('');
      return (
        <Modal open onClose={() => undefined} title="Edit enrollment">
          <label>
            Name
            <input
              aria-label="Name"
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
          </label>
          <p data-testid="mirror">{value}</p>
        </Modal>
      );
    }

    render(<Parent />);
    const input = screen.getByLabelText('Name');
    expect(input).toHaveFocus();
    await user.type(input, 'Alice');
    expect(input).toHaveFocus();
    expect(screen.getByTestId('mirror')).toHaveTextContent('Alice');
  });
});
