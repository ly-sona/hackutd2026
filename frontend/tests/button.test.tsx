import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { Button } from '@/components/ui/button';

it('prevents reducer submission while its action button is disabled', async () => {
  const onClick = vi.fn();
  render(<Button disabled onClick={onClick}>Send health check</Button>);
  await userEvent.click(screen.getByRole('button', { name: 'Send health check' }));
  expect(onClick).not.toHaveBeenCalled();
});
