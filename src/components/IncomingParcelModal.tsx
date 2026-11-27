import { FileText, Laptop, Smartphone, XCircle, CheckCircle2 } from 'lucide-preact';
import { Modal } from './ui/Modal';
import { Switch } from './ui/Switch';
import { TactileButton } from './ui/TactileButton';
import { formatBytes } from '../lib/crypto';
import { useT } from '../lib/i18n';
import { respondToPendingOffer } from '../lib/transfer';
import {
  isTrustedCourier,
  setCourierTrusted,
  trustedCouriers,
} from '../lib/trustedDevices';
import {
  autoAcceptEnabled,
  pendingOffer,
  setAutoAccept,
} from '../state/transferState';

export function IncomingParcelModal() {
  const t = useT();
  const offer = pendingOffer.value;
  // Read trustedCouriers signal so toggle updates reactively
  void trustedCouriers.value;
  const senderTrusted = offer ? isTrustedCourier(offer.peerName, offer.peerId) : false;

  return (
    <Modal
      open={Boolean(offer)}
      onOpenChange={(open) => {
        if (!open && offer) {
          respondToPendingOffer(false);
        }
      }}
      title={t.incoming.title}
      description={t.incoming.subtitle}
      maxWidthClass="max-w-md"
    >
      {offer && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3 rounded-[5px] border border-dashed border-[var(--border-dashed)] bg-[var(--surface-inset)] p-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="h-10 w-10 rounded-full border border-[var(--border-dashed)] bg-[var(--surface-receipt)] flex items-center justify-center text-[var(--accent-airmail)] shrink-0">
                {offer.peerKind === 'mobile' ? (
                  <Smartphone size={18} strokeWidth={1.5} />
                ) : (
                  <Laptop size={18} strokeWidth={1.5} />
                )}
              </div>
              <div className="min-w-0">
                <span className="tabular-mono text-[10px] uppercase text-[var(--ink-secondary)] block">
                  {t.incoming.fromLabel}
                </span>
                <p className="font-bold text-sm text-[var(--ink-primary)] truncate">
                  {offer.peerName}
                </p>
              </div>
            </div>
            <span className="tabular-mono text-[11px] font-bold px-2 py-0.5 rounded-[3px] border border-[var(--border-dashed)] bg-[var(--surface-receipt)] text-[var(--ink-secondary)]">
              {offer.peerOs}
            </span>
          </div>

          {/* Itemized parcel contents */}
          <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
            {offer.files.map((file, idx) => (
              <div
                key={`${file.name}-${idx}`}
                className="flex items-center justify-between gap-2 rounded-[4px] border border-dashed border-[var(--border-dashed)] bg-[var(--surface-inset)] px-2.5 py-2 text-xs"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <FileText size={14} className="text-[var(--ink-secondary)] shrink-0" />
                  <span className="font-semibold text-[var(--ink-primary)] truncate">
                    {file.name}
                  </span>
                </div>
                <span className="tabular-mono text-[var(--ink-secondary)] shrink-0">
                  {formatBytes(file.size)}
                </span>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between text-xs tabular-mono border-t border-dashed border-[var(--border-dashed)] pt-2.5">
            <span className="text-[var(--ink-secondary)]">{t.incoming.totalLabel}</span>
            <span className="font-bold text-[var(--ink-primary)]">
              {offer.files.length} · {formatBytes(offer.totalSize)}
            </span>
          </div>

          <div className="space-y-2">
            <label className="flex items-center justify-between gap-2 text-xs text-[var(--ink-secondary)] cursor-pointer select-none">
              <span>{t.incoming.trustSenderInline.replace('{name}', offer.peerName)}</span>
              <Switch
                checked={senderTrusted}
                onCheckedChange={(checked) => setCourierTrusted(offer.peerName, checked)}
                label={t.incoming.trustSenderInline.replace('{name}', offer.peerName)}
              />
            </label>

            <label className="flex items-center justify-between gap-2 text-xs text-[var(--ink-secondary)] cursor-pointer select-none">
              <span>{t.incoming.autoAcceptInline}</span>
              <Switch
                checked={autoAcceptEnabled.value}
                onCheckedChange={(checked) => setAutoAccept(checked)}
                label={t.incoming.autoAcceptInline}
              />
            </label>
          </div>

          <div className="flex items-center gap-2.5 pt-1">
            <TactileButton
              variant="danger"
              size="md"
              className="flex-1"
              onClick={() => respondToPendingOffer(false)}
            >
              <XCircle size={15} strokeWidth={1.5} />
              <span>{t.incoming.decline}</span>
            </TactileButton>
            <TactileButton
              variant="cleared"
              size="md"
              className="flex-1"
              onClick={() => respondToPendingOffer(true)}
            >
              <CheckCircle2 size={15} strokeWidth={1.5} />
              <span>{t.incoming.accept}</span>
            </TactileButton>
          </div>
        </div>
      )}
    </Modal>
  );
}
