import { useRef, useState } from 'react';
import { api } from '../api/client';

export function DataControls({ onDeleted }: { onDeleted: () => void }) {
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const commandId = useRef<string | null>(null);
  const running = useRef(false);
  async function download() {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError('');
    try {
      const result = await api('/api/account/export', 'ExportView');
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' }),
      );
      const link = document.createElement('a');
      link.href = url;
      link.download = 'tricks-coach-local-export.json';
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Export unavailable.');
    } finally {
      running.current = false;
      setBusy(false);
    }
  }
  async function remove() {
    if (running.current || confirmation !== 'DELETE LOCAL ACCOUNT') return;
    running.current = true;
    setBusy(true);
    setError('');
    commandId.current ??= crypto.randomUUID();
    try {
      await api('/api/account/delete', 'AccountDeleteView', {
        commandId: commandId.current,
        confirmation: 'DELETE LOCAL ACCOUNT',
      });
      onDeleted();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Deletion could not be confirmed. Retry the same request.');
    } finally {
      running.current = false;
      setBusy(false);
    }
  }
  return (
    <section className="account-section">
      <h2>Your local data</h2>
      <p>
        Download your account and permitted game records. The export does not contain other players’ private
        hands.
      </p>
      <button className="text-button" disabled={busy} onClick={() => void download()}>
        Download my local data
      </button>
      <details>
        <summary>Delete local test account</summary>
        <p>
          This deletes your local test account and game records. It does not cancel a real paid subscription.
          Other family members keep their own accounts and records.
        </p>
        <label className="local-account-id">
          Type DELETE LOCAL ACCOUNT
          <input
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            autoComplete="off"
          />
        </label>
        <button
          className="text-button"
          disabled={busy || confirmation !== 'DELETE LOCAL ACCOUNT'}
          onClick={() => void remove()}
        >
          Delete my local account
        </button>
      </details>
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
