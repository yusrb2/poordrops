import { useEffect, useRef, useState } from 'preact/hooks';
import {
  Bluetooth,
  BluetoothSearching,
  Check,
  FileUp,
  Info,
  QrCode,
  Radio,
  Send,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-preact';
import { ReceiptCard } from './ui/ReceiptCard';
import { TactileButton } from './ui/TactileButton';
import { cn } from '../lib/cn';
import { formatBytes } from '../lib/crypto';
import { useT } from '../lib/i18n';
import {
  getBluetoothEnvironment,
  requestNativeBtPermissions,
  scanNearbyBleDevices,
  sendBleClipboardText,
  shareFilesViaAndroidBluetooth,
  type BleDeviceItem,
  type BluetoothStatus,
} from '../lib/bluetooth';
import { playClick, playStamp } from '../lib/sound';
import {
  addManifestItem,
  addStagedFiles,
  clearStagedFiles,
  clipboardText,
  removeStagedFile,
  stagedFiles,
} from '../state/transferState';
import { setActiveMode } from '../state/uiState';

function rssiToBars(rssi: number): number {
  if (rssi >= -55) return 4;
  if (rssi >= -68) return 3;
  if (rssi >= -82) return 2;
  return 1;
}

export function BluetoothDesk() {
  const t = useT();
  const pickerRef = useRef<HTMLInputElement>(null);

  const [env, setEnv] = useState<BluetoothStatus | null>(null);
  const [btText, setBtText] = useState(clipboardText.value);
  const [devices, setDevices] = useState<BleDeviceItem[]>([]);
  const [scanning, setScanning] = useState(false);
  const [sharingOpp, setSharingOpp] = useState(false);
  const [sentDeviceId, setSentDeviceId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const staged = stagedFiles.value;

  async function refreshEnv() {
    const status = await getBluetoothEnvironment();
    setEnv(status);
    return status;
  }

  useEffect(() => {
    refreshEnv();
  }, []);

  async function handleGrantPermissions() {
    setFeedback(null);
    await requestNativeBtPermissions();
    await refreshEnv();
  }

  async function handleOppShare() {
    if (staged.length === 0 && !btText.trim()) return;
    setFeedback(null);
    setSharingOpp(true);
    try {
      const batch = [...staged];
      const res = await shareFilesViaAndroidBluetooth(batch, btText);
      if (res.launched) {
        playStamp();
        for (const f of batch) {
          addManifestItem({
            id: `bt-${Date.now()}-${f.name}`,
            direction: 'send',
            name: f.name,
            size: f.size,
            mime: f.type || 'application/octet-stream',
            sha256: null,
            verification: 'unverified',
            speedMBps: 0,
            timestamp: Date.now(),
            peerName: 'Bluetooth OPP',
            objectUrl: f.type.startsWith('image/') ? URL.createObjectURL(f) : undefined,
          });
        }
        clearStagedFiles();
      }
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : String(err));
    } finally {
      setSharingOpp(false);
    }
  }

  async function handleBleScan() {
    setFeedback(null);
    setScanning(true);
    try {
      if (env?.isNativeAndroid && !env.hasPermission) {
        const granted = await requestNativeBtPermissions();
        await refreshEnv();
        if (!granted) {
          setScanning(false);
          return;
        }
      }
      const list = await scanNearbyBleDevices();
      setDevices(list);
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : String(err));
    } finally {
      setScanning(false);
    }
  }

  async function handleSendBleText(dev: BleDeviceItem) {
    const payload = btText.trim() || clipboardText.value.trim();
    if (!payload) return;
    setFeedback(null);
    try {
      await sendBleClipboardText(dev.id, payload);
      playStamp();
      setSentDeviceId(dev.id);
      setTimeout(() => setSentDeviceId(null), 1800);
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : String(err));
    }
  }

  const isNative = Boolean(env?.isNativeAndroid);
  const webBtOk = Boolean(env?.webBluetoothSupported);

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* Card 1: Universal Offline Bluetooth Share (Android OPP) + Cargo */}
      <ReceiptCard airmailTop className="p-4 sm:p-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-2 pb-3 border-b border-dashed border-[var(--border-dashed)]">
          <div>
            <div className="flex items-center gap-2">
              <Bluetooth size={18} strokeWidth={1.5} className="text-[var(--accent-airmail)]" />
              <h2 className="font-display-tsuki text-lg sm:text-xl font-bold text-[var(--ink-primary)]">
                {t.bluetooth.title}
              </h2>
            </div>
            <p className="text-xs text-[var(--ink-secondary)] mt-0.5">{t.bluetooth.subtitle}</p>
          </div>
        </div>

        <input
          ref={pickerRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            const input = e.target as HTMLInputElement;
            if (input.files && input.files.length > 0) {
              playClick();
              addStagedFiles(Array.from(input.files));
            }
            input.value = '';
          }}
        />

        <div className="rounded-[6px] border border-dashed border-[var(--border-dashed)] bg-[var(--surface-inset)] p-3.5 sm:p-4 space-y-3">
          <div className="space-y-1">
            <h3 className="text-sm font-bold text-[var(--ink-primary)]">{t.bluetooth.oppTitle}</h3>
            <p className="text-xs text-[var(--ink-secondary)] leading-relaxed">
              {t.bluetooth.oppBody}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <TactileButton
              size="sm"
              variant="secondary"
              onClick={() => pickerRef.current?.click()}
            >
              <FileUp size={14} strokeWidth={1.5} />
              <span>{t.bluetooth.pickCargoBtn}</span>
            </TactileButton>

            {staged.length > 0 && (
              <span className="tabular-mono text-xs font-bold text-[var(--accent-cleared)]">
                {t.bluetooth.stagedReady.replace('{n}', String(staged.length))}
              </span>
            )}
          </div>

          {staged.length > 0 && (
            <div className="space-y-1.5 max-h-32 overflow-y-auto pr-1">
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => {
                    playClick();
                    clearStagedFiles();
                  }}
                  className="inline-flex items-center gap-1 tabular-mono text-[11px] text-[var(--ink-secondary)] hover:text-[var(--accent-airmail)] cursor-pointer"
                >
                  <Trash2 size={11} />
                  <span>{t.cargo.clearStaged}</span>
                </button>
              </div>
              {staged.map((f, idx) => (
                <div
                  key={`${f.name}-${idx}`}
                  className="flex items-center justify-between gap-2 rounded-[4px] border border-dashed border-[var(--border-dashed)] bg-[var(--surface-receipt)] px-2.5 py-1.5 text-xs"
                >
                  <span className="truncate font-semibold text-[var(--ink-primary)]">{f.name}</span>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="tabular-mono text-[var(--ink-secondary)]">
                      {formatBytes(f.size)}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeStagedFile(idx)}
                      className="text-[var(--ink-secondary)] hover:text-[var(--accent-airmail)] cursor-pointer"
                    >
                      <X size={13} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <textarea
            rows={2}
            value={btText}
            onInput={(e) => setBtText((e.target as HTMLTextAreaElement).value)}
            placeholder={t.bluetooth.textInputPlaceholder}
            className="w-full rounded-[5px] border border-dashed border-[var(--border-dashed)] bg-[var(--surface-receipt)] p-2.5 text-xs tabular-mono text-[var(--ink-primary)] placeholder:text-[var(--ink-secondary)]/60 focus:border-solid focus:border-[var(--accent-airmail)] focus:outline-none"
          />

          {isNative ? (
            <TactileButton
              size="md"
              variant="primary"
              disabled={sharingOpp || (staged.length === 0 && !btText.trim())}
              onClick={handleOppShare}
              className="w-full sm:w-auto min-h-[42px]"
            >
              <Send size={15} strokeWidth={1.5} />
              <span>{sharingOpp ? t.bluetooth.oppSending : t.bluetooth.oppBtn}</span>
            </TactileButton>
          ) : (
            <div className="rounded-[5px] border border-dashed border-[var(--border-dashed)] bg-[var(--surface-receipt)] p-3 flex items-start gap-2 text-xs text-[var(--ink-secondary)]">
              <Info size={15} className="text-[var(--accent-amber)] shrink-0 mt-0.5" />
              <p>{t.bluetooth.oppDesktopNote}</p>
            </div>
          )}
        </div>
      </ReceiptCard>

      {/* Card 2: Direct BLE Device Radar (Native Android BLE or Desktop Web Bluetooth) */}
      <ReceiptCard className="p-4 sm:p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-3 border-b border-dashed border-[var(--border-dashed)]">
          <div>
            <h3 className="font-display-tsuki text-base sm:text-lg font-bold text-[var(--ink-primary)]">
              {t.bluetooth.bleTitle}
            </h3>
            <p className="text-xs text-[var(--ink-secondary)] mt-0.5">{t.bluetooth.bleBody}</p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {isNative && env && !env.hasPermission && (
              <TactileButton size="sm" variant="cleared" onClick={handleGrantPermissions}>
                <ShieldCheck size={14} />
                <span>{t.bluetooth.bleGrantBtn}</span>
              </TactileButton>
            )}

            {(isNative || webBtOk) && (
              <TactileButton
                size="sm"
                variant="primary"
                disabled={scanning}
                onClick={handleBleScan}
                className="min-h-[40px]"
              >
                <BluetoothSearching size={15} className={cn(scanning && 'animate-pulse')} />
                <span>
                  {scanning
                    ? t.bluetooth.bleScanning
                    : isNative
                    ? t.bluetooth.bleScanBtn
                    : t.bluetooth.blePickBtn}
                </span>
              </TactileButton>
            )}
          </div>
        </div>

        {feedback && (
          <div className="rounded-[5px] border border-dashed border-[var(--accent-amber)] bg-[var(--accent-amber)]/10 px-3 py-2 text-xs text-[var(--ink-primary)]">
            {feedback}
          </div>
        )}

        {!isNative && !webBtOk ? (
          <div className="rounded-[6px] border border-dashed border-[var(--border-dashed)] bg-[var(--surface-inset)] p-4 space-y-3">
            <div className="space-y-1">
              <p className="text-sm font-bold text-[var(--ink-primary)]">
                {t.bluetooth.bleUnsupportedTitle}
              </p>
              <p className="text-xs text-[var(--ink-secondary)] leading-relaxed">
                {t.bluetooth.bleUnsupportedBody}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <TactileButton size="sm" variant="primary" onClick={() => setActiveMode('radar')}>
                <Radio size={13} />
                <span>{t.bluetooth.switchToRadar}</span>
              </TactileButton>
              <TactileButton size="sm" variant="secondary" onClick={() => setActiveMode('qr')}>
                <QrCode size={13} />
                <span>{t.bluetooth.switchToQr}</span>
              </TactileButton>
            </div>
          </div>
        ) : devices.length === 0 ? (
          <div className="rounded-[5px] border border-dashed border-[var(--border-dashed)] bg-[var(--surface-inset)] p-5 text-center text-xs text-[var(--ink-secondary)]">
            {t.bluetooth.bleEmpty}
          </div>
        ) : (
          <div className="divide-y divide-dashed divide-[var(--border-dashed)]">
            {devices.map((dev) => {
              const bars = rssiToBars(dev.rssi);
              return (
                <div
                  key={dev.id}
                  className="py-3 first:pt-1 last:pb-1 flex flex-wrap items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {/* Analog 4-bar RSSI meter */}
                    <div
                      className="flex items-end gap-[2px] h-5 px-1.5 py-1 rounded-[4px] border border-[var(--border-dashed)] bg-[var(--surface-inset)] shrink-0"
                      title={`RSSI ${dev.rssi} dBm`}
                    >
                      {[1, 2, 3, 4].map((lvl) => (
                        <span
                          key={lvl}
                          className={cn(
                            'w-[3px] rounded-[1px]',
                            lvl <= bars ? 'bg-[var(--accent-cleared)]' : 'bg-[var(--border-dashed)]'
                          )}
                          style={{ height: `${lvl * 3 + 2}px` }}
                        />
                      ))}
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-[var(--ink-primary)] truncate max-w-[180px] sm:max-w-[260px]">
                          {dev.name}
                        </span>
                        <span className="tabular-mono text-[9px] uppercase px-1.5 py-0.2 rounded-[3px] border border-[var(--border-dashed)] bg-[var(--surface-inset)] text-[var(--ink-secondary)]">
                          {dev.bonded ? t.bluetooth.bleBonded : t.bluetooth.bleNearby}
                        </span>
                      </div>
                      <span className="tabular-mono text-[10px] text-[var(--ink-secondary)]">
                        {dev.id} · {dev.rssi} dBm
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <TactileButton
                      size="sm"
                      variant="secondary"
                      disabled={!btText.trim() && !clipboardText.value.trim()}
                      onClick={() => handleSendBleText(dev)}
                    >
                      {sentDeviceId === dev.id ? <Check size={13} /> : <Send size={13} />}
                      <span>
                        {sentDeviceId === dev.id ? t.bluetooth.bleSent : t.bluetooth.bleSendText}
                      </span>
                    </TactileButton>

                    {isNative && staged.length > 0 && (
                      <TactileButton size="sm" variant="primary" onClick={handleOppShare}>
                        <Bluetooth size={13} />
                        <span>{t.bluetooth.oppBtn}</span>
                      </TactileButton>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </ReceiptCard>
    </div>
  );
}
