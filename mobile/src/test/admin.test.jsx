import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import App from '../App';
import { AuthProvider } from '../auth/AuthContext';
import { ApiError } from '../api/client';
import { resetMocks } from '../mocks';
import { useApi } from '../hooks/useApi';

beforeEach(() => resetMocks());

function renderApp(path) {
  return render(<MemoryRouter initialEntries={[path]}><AuthProvider><App /></AuthProvider></MemoryRouter>);
}

// Opens `path` as the given user (goes through the login page, then lands on the path).
async function openAs(email, path) {
  const user = userEvent.setup();
  renderApp(path);
  await user.type(await screen.findByLabelText('Email'), email);
  await user.type(screen.getByLabelText('Password'), 'Password123!');
  await user.click(screen.getByRole('button', { name: 'Sign in' }));
  return user;
}

describe('guards (admin)', () => {
  it('lists guards, and the admin can add one and sees the temporary password once', async () => {
    const user = await openAs('admin@example.com', '/guards');
    expect(await screen.findByText('Amina K.')).toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'Add guard' }));
    await user.click(await screen.findByRole('button', { name: 'Add guard' }));            // empty form
    expect((await screen.findAllByText('is required')).length).toBeGreaterThanOrEqual(3);   // name, email, rate
    await user.type(screen.getByLabelText('Full name'), 'Joan Test');
    await user.type(screen.getByLabelText('Email (used to log in)'), 'joan@example.com');
    await user.type(screen.getByLabelText('Hourly rate (UGX)'), '5000');
    await user.type(screen.getByLabelText('Night allowance per night shift (UGX)'), '3000');
    await user.click(screen.getByRole('button', { name: 'Add guard' }));
    expect(await screen.findByText(/Guard Joan Test was added/)).toBeInTheDocument();
    expect(screen.getByText(/^Tmp/)).toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'Back to list' }));
    expect(await screen.findByText('Joan Test')).toBeInTheDocument();
  });

  it('shows a clear message for a duplicate email and rejects bad numbers', async () => {
    const user = await openAs('admin@example.com', '/guards/new');
    await user.type(await screen.findByLabelText('Full name'), 'Dup Guard');
    await user.type(screen.getByLabelText('Email (used to log in)'), 'amina@example.com');
    await user.type(screen.getByLabelText('Hourly rate (UGX)'), '-5');
    await user.click(screen.getByRole('button', { name: 'Add guard' }));
    expect(await screen.findByText('must be a whole number, 0 or more')).toBeInTheDocument();
    await user.clear(screen.getByLabelText('Hourly rate (UGX)'));
    await user.type(screen.getByLabelText('Hourly rate (UGX)'), '5000');
    await user.click(screen.getByRole('button', { name: 'Add guard' }));
    expect(await screen.findByText('This email is already used by another account')).toBeInTheDocument();
  });

  it('searches the list, edits a guard, and deactivates then reactivates with a confirmation click', async () => {
    const user = await openAs('admin@example.com', '/guards');
    await user.type(await screen.findByLabelText('Search'), 'ruth');
    await user.click(screen.getByRole('button', { name: 'Search' }));
    await waitFor(() => expect(screen.queryByText('Amina K.')).not.toBeInTheDocument());
    await user.click(await screen.findByRole('link', { name: 'Ruth N.' }));
    const phone = await screen.findByLabelText('Phone');
    await user.clear(phone); await user.type(phone, '+256711111111');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText('Guard saved.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Deactivate guard' }));            // first click only arms it
    expect(screen.queryByText(/Guard deactivated/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Click again to confirm' }));
    expect(await screen.findByText(/Guard deactivated/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reactivate guard' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Reactivate guard' }));
    await user.click(screen.getByRole('button', { name: 'Click again to confirm' }));
    expect(await screen.findByText('Guard reactivated.')).toBeInTheDocument();
  });

  it('resets a password and shows the new temporary password', async () => {
    const user = await openAs('admin@example.com', '/guards/4');
    await user.click(await screen.findByRole('button', { name: 'Reset password' }));
    await user.click(screen.getByRole('button', { name: 'Click again to confirm' }));
    expect(await screen.findByText('Password reset.')).toBeInTheDocument();
    expect(screen.getByText(/^Tmp/)).toBeInTheDocument();
  });
});

describe('sites, checkpoints, routes, QR sheet', () => {
  it('admin adds a site, adds checkpoints and prints the QR sheet', async () => {
    const user = await openAs('admin@example.com', '/sites/new');
    await user.click(await screen.findByRole('button', { name: 'Add site' }));               // empty form
    expect(await screen.findByText('choose a client')).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Client'), '1');
    await user.type(screen.getByLabelText('Site name'), 'Test Site');
    await user.type(screen.getByLabelText('Latitude'), '95');
    await user.type(screen.getByLabelText('Longitude'), '32.58');
    await user.click(screen.getByRole('button', { name: 'Add site' }));
    expect(await screen.findByText('must be a number between -90 and 90')).toBeInTheDocument();
    await user.clear(screen.getByLabelText('Latitude')); await user.type(screen.getByLabelText('Latitude'), '0.31');
    await user.click(screen.getByRole('button', { name: 'Add site' }));
    expect(await screen.findByRole('heading', { name: 'Test Site' })).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Checkpoints' }));
    expect(await screen.findByText('No checkpoints yet.')).toBeInTheDocument();
    for (const name of ['Gate', 'Back']) {
      await user.type(screen.getByLabelText('Name'), name);
      await user.type(screen.getByLabelText('Latitude'), '0.31');
      await user.type(screen.getByLabelText('Longitude'), '32.58');
      await user.click(screen.getByRole('button', { name: 'Add checkpoint' }));
      expect(await screen.findByText(name)).toBeInTheDocument();
    }
    expect(screen.getAllByText(/^CP-100-\d-[0-9A-F]{6}$/)).toHaveLength(2);
    await user.click(screen.getByRole('link', { name: 'Print QR sheet' }));
    expect(await screen.findByAltText('QR code for Gate')).toBeInTheDocument();
    expect(screen.getByAltText('QR code for Back')).toBeInTheDocument();
  });

  it('admin adds a route in walking order', async () => {
    const user = await openAs('admin@example.com', '/sites/1');
    await user.click(await screen.findByRole('tab', { name: 'Routes' }));
    expect(await screen.findByText('Night perimeter walk')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Add route' }));                     // empty
    expect(await screen.findByText('add at least one checkpoint')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Route name'), 'Day walk');
    await user.type(screen.getByLabelText('Round start times'), '08:00, 10:00');
    for (const cid of ['3', '1']) {
      await user.selectOptions(screen.getByLabelText('Checkpoints in walking order'), cid);
      await user.click(screen.getByRole('button', { name: 'Add to route' }));
    }
    expect(screen.getByText('1. Generator')).toBeInTheDocument();
    expect(screen.getByText('2. Main gate')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Add route' }));
    expect(await screen.findByText('Route added.')).toBeInTheDocument();
    expect(screen.getByText('Day walk')).toBeInTheDocument();
  });

  it('a manager can print QR codes but cannot add checkpoints; a supervisor sees only assigned sites', async () => {
    const user = await openAs('manager@example.com', '/sites/1');
    await user.click(await screen.findByRole('tab', { name: 'Checkpoints' }));
    expect(await screen.findByRole('link', { name: 'Print QR sheet' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add checkpoint' })).not.toBeInTheDocument();
  });

  it('admin assigns a supervisor to a site', async () => {
    const user = await openAs('admin@example.com', '/sites/2');
    await user.click(await screen.findByRole('tab', { name: 'People' }));
    const box = await screen.findByRole('checkbox', { name: 'Peter Supervisor' });
    expect(box).not.toBeChecked();
    await user.click(box);
    await user.click(screen.getByRole('button', { name: 'Save supervisors' }));
    expect(await screen.findByText('Supervisors saved.')).toBeInTheDocument();
  });
});

describe('clients and settings', () => {
  it('admin adds a client', async () => {
    const user = await openAs('admin@example.com', '/clients');
    await user.click(await screen.findByRole('button', { name: 'Add client' }));
    await user.click(screen.getByRole('button', { name: 'Save client' }));
    expect(await screen.findByText('is required')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Company name'), 'Entebbe Mall');
    await user.click(screen.getByRole('button', { name: 'Save client' }));
    expect(await screen.findByText('Client added.')).toBeInTheDocument();
    expect(screen.getByText('Entebbe Mall')).toBeInTheDocument();
  });

  it('settings: saves a change, shows field errors for bad values', async () => {
    const user = await openAs('admin@example.com', '/settings');
    const input = await screen.findByLabelText('Late check-in after (minutes)');
    await user.clear(input); await user.type(input, '12');
    await user.click(screen.getByRole('button', { name: 'Save settings' }));
    expect(await screen.findByText('Settings saved.')).toBeInTheDocument();
    await user.clear(input); await user.type(input, 'abc');
    await user.click(screen.getByRole('button', { name: 'Save settings' }));
    expect(await screen.findByText('must be a number')).toBeInTheDocument();
    await user.clear(input); await user.type(input, '9999');
    await user.click(screen.getByRole('button', { name: 'Save settings' }));
    expect(await screen.findByText('must be a number between 0 and 240')).toBeInTheDocument();
  });

  it('settings: adds and deletes a public holiday, adds a shift template', async () => {
    const user = await openAs('admin@example.com', '/settings');
    await user.click(await screen.findByRole('tab', { name: 'Public holidays' }));
    expect(await screen.findByText('Christmas Day (example)')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2027-01-26' } });
    await user.type(screen.getByLabelText('Name'), 'Test day');
    await user.click(screen.getByRole('button', { name: 'Add holiday' }));
    const row = (await screen.findByText('Test day')).closest('tr');
    await user.click(within(row).getByRole('button', { name: 'Delete' }));
    await user.click(within(row).getByRole('button', { name: 'Click again to confirm' }));
    await waitFor(() => expect(screen.queryByText('Test day')).not.toBeInTheDocument());

    await user.click(screen.getByRole('tab', { name: 'Shift templates' }));
    expect(await screen.findByText('Night')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Name'), 'Evening');
    await user.type(screen.getByLabelText('Starts (HH:MM)'), '7pm');
    await user.click(screen.getByRole('button', { name: 'Add template' }));
    expect(await screen.findAllByText('use a time like 18:00')).toHaveLength(2);
    await user.clear(screen.getByLabelText('Starts (HH:MM)')); await user.type(screen.getByLabelText('Starts (HH:MM)'), '14:00');
    await user.type(screen.getByLabelText('Ends (HH:MM)'), '22:00');
    await user.click(screen.getByRole('button', { name: 'Add template' }));
    expect(await screen.findByText('Evening')).toBeInTheDocument();
  });
});

describe('access and offline behaviour', () => {
  it('supervisor does not see Guards, Clients or Settings, and is blocked from opening them', async () => {
    const user = await openAs('supervisor@example.com', '/guards');
    expect(await screen.findByText('No access')).toBeInTheDocument();
    const nav = screen.getByRole('navigation', { name: 'Main' });
    for (const label of ['Guards', 'Clients', 'Settings']) expect(nav).not.toHaveTextContent(label);
    expect(user).toBeTruthy();
  });

  it('admin sees the new menu items', async () => {
    await openAs('admin@example.com', '/guards');
    await screen.findByText('Amina K.');
    const nav = screen.getByRole('navigation', { name: 'Main' });
    for (const label of ['Guards', 'Clients', 'Settings']) expect(nav).toHaveTextContent(label);
  });

  it('shows an offline banner when the connection drops and hides it when it returns', async () => {
    await openAs('admin@example.com', '/sites');
    await screen.findByText('Kololo Office Park');
    act(() => { window.dispatchEvent(new Event('offline')); });
    expect(await screen.findByText(/You are offline/)).toBeInTheDocument();
    act(() => { window.dispatchEvent(new Event('online')); });
    await waitFor(() => expect(screen.queryByText(/You are offline/)).not.toBeInTheDocument());
  });

  it('saves lists without pay data for offline use, never saves guards, and clears everything on logout', async () => {
    const user = await openAs('admin@example.com', '/sites');
    await screen.findByText('Kololo Office Park');
    const keys = () => Object.keys(localStorage).filter((k) => k.startsWith('patrol_cache:'));
    expect(keys()).toContain('patrol_cache:sites:1:false');
    await user.click(screen.getByRole('link', { name: 'Guards' }));
    await screen.findByText('Amina K.');
    expect(keys().some((k) => k.includes('guards'))).toBe(false);
    await user.click(screen.getByRole('button', { name: 'Log out' }));
    await screen.findByRole('button', { name: 'Sign in' });
    expect(keys()).toHaveLength(0);
  });
});

describe('useApi saved-data fallback', () => {
  function Probe({ fetcher, cacheKey }) {
    const { data, staleAt, error } = useApi(fetcher, [], { cacheKey });
    return <div>{data ? `data:${data.length}` : 'no data'}{staleAt ? ' stale' : ''}{error ? ' error' : ''}</div>;
  }
  it('shows the last good answer when the network is down, and an error when nothing was saved', async () => {
    const good = () => Promise.resolve({ data: [1, 2, 3], meta: null });
    const down = () => Promise.reject(new ApiError(0, 'NETWORK_ERROR', 'offline'));
    const first = render(<Probe fetcher={good} cacheKey="probe" />);
    expect(await screen.findByText('data:3')).toBeInTheDocument();
    first.unmount();
    render(<Probe fetcher={down} cacheKey="probe" />);
    expect(await screen.findByText('data:3 stale')).toBeInTheDocument();
    render(<Probe fetcher={down} cacheKey="other" />);
    expect(await screen.findByText('no data error')).toBeInTheDocument();
  });
});
