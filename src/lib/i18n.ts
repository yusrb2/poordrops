import { signal } from '@preact/signals';

export type Locale = 'en' | 'id';

const LOCALE_KEY = 'poordrops_locale';

function loadInitialLocale(): Locale {
  try {
    const saved = localStorage.getItem(LOCALE_KEY);
    if (saved === 'id' || saved === 'en') return saved;
  } catch {
    // ignore
  }
  return 'en';
}

export const locale = signal<Locale>(loadInitialLocale());

export function setLocale(next: Locale) {
  locale.value = next;
  try {
    localStorage.setItem(LOCALE_KEY, next);
  } catch {
    // ignore
  }
}

export function toggleLocale() {
  setLocale(locale.value === 'en' ? 'id' : 'en');
}

export const dict = {
  en: {
    tagline: 'AirDrop without the ecosystem tax.',
    header: {
      deviceLabel: 'Parcel Alias',
      renameHint: 'Click to rename',
      soundOn: 'Mechanical click: ON',
      soundOff: 'Mechanical click: OFF',
      themeDark: 'Night Cargo Depot',
      themeLight: 'Unbleached Kraft',
      help: 'Field Manual',
      langToggle: 'ID',
    },
    pairing: {
      title: 'Dispatch Counter',
      subtitle: 'Zero login. Zero cloud upload. Just two browsers shaking hands.',
      yourCode: 'Your 4-Digit Waybill',
      scanNote: 'Point your phone camera at this QR — connects in 1s with zero typing.',
      copyPin: 'Copy PIN',
      copyLink: 'Copy Link',
      copied: 'Copied!',
      newCode: 'Fresh PIN',
      enterCodeTitle: 'Enter Other Device’s PIN',
      enterCodeHint: 'Type 4 digits — auto-connects on the 4th keystroke.',
      scanQrBtn: 'Scan QR',
      quickReconnect: 'Quick Reconnect',
      statusWaiting: 'Waiting at customs...',
      statusConnecting: 'Handshaking WebRTC...',
      statusConnected: 'Customs Cleared',
      statusIdle: 'Counter closed',
      statusError: 'Relay hiccup',
      peerConnectedOne: '1 courier connected',
      peerConnectedMany: '{n} couriers connected',
      leaveRoom: 'Disconnect',
      qrScannerTitle: 'Scan Waybill QR',
      qrScannerHint: 'Point camera at another screen’s PoorDrops QR code.',
      qrScannerPermission: 'Camera access needed to read QR codes. No photos are stored or uploaded.',
      qrScannerUnsupported: 'Camera unavailable on this device. Type the 4-digit PIN instead.',
      close: 'Close',
    },
    clipboard: {
      title: 'Live Clipboard & Link Toss',
      subtitle: 'Stop texting links to your own WhatsApp chat like a caveman.',
      placeholder: 'Type or Ctrl+V a URL, Wi-Fi password, or cursed snippet — beams live on paste...',
      pasteBtn: 'Paste & Toss',
      sendBtn: 'Toss Now',
      copyBtn: 'Copy',
      copied: 'Copied',
      openLink: 'Open Link',
      autoCopy: 'Auto-Copy incoming',
      autoCopyBlocked: 'Browser blocked background clipboard write — tap Copy.',
      fromPeer: 'From {name}',
      noLinks: 'Any URLs you paste will pop up here as 1-tap launch buttons.',
      waitingPeer: 'Pair another device to start tossing text live.',
    },
    cargo: {
      title: 'Parcel Cargo Drop',
      subtitle: '64KB chunked WebRTC stream. Photos stay uncompressed, unlike chat apps.',
      dropHere: 'Drop files here, or tap to pick cargo',
      dropActive: 'Drop it right on the parcel scale!',
      dropSub: 'Multiple files, huge videos, raw photos — zero server middleman.',
      pickFiles: 'Choose Files',
      stagedCount: '{n} parcel(s) on the scale',
      clearStaged: 'Clear',
      sendUncompressed: 'Send Uncompressed',
      bundleZip: 'Bundle as ZIP',
      bundlingZip: 'Taping ZIP box...',
      needPeer: 'Connect a peer first before shipping cargo.',
      sending: 'Shipping',
      receiving: 'Receiving',
      cancel: 'Abort',
      eta: 'ETA',
    },
    manifest: {
      title: 'PARCEL MANIFEST',
      subtitle: 'Session thermal receipt — disappears when shredded.',
      emptyTitle: 'Manifest is suspiciously clean.',
      emptyBody: 'Drop a file or toss a link. No cloud server will ever inspect it.',
      sent: 'SENT',
      recv: 'RECV',
      verified: 'SHA-256 VERIFIED',
      mismatch: 'HASH MISMATCH',
      unverified: 'NO CRYPTO API',
      saveFile: 'Save',
      preview: 'Inspect',
      copyHash: 'Copy SHA-256',
      shredBtn: 'Shred Receipt',
      shredded: 'Receipt shredded. Evidence destroyed.',
    },
    onboarding: {
      badge: '4-Step Field Manual',
      skip: 'Skip',
      back: 'Back',
      next: 'Next',
      done: 'Start Shipping',
      step1Title: '1. Zero-Server Cargo',
      step1Body:
        'Stop emailing yourself 12MB PDFs or compressing vacation photos through WhatsApp. PoorDrops streams straight from device A to device B over WebRTC.',
      step2Title: '2. Lazy 1-Tap Pairing',
      step2Body:
        'Scan the QR code with your phone’s normal camera and it opens & connects automatically. Or punch 4 digits — no "Connect" button required.',
      step3Title: '3. Live Clipboard & ZIP',
      step3Body:
        'Paste a messy URL or secret key and it beams instantly to the other screen. Sending 30 tiny files? Hit "Bundle as ZIP" to tape them into one parcel.',
      step4Title: '4. Stamp & Verify Integrity',
      step4Body:
        'Every file is hashed with SHA-256 before and after transit so nothing arrives half-baked. Give the test stamp a whack below:',
      sandboxBtn: 'Stamp Parcel',
      sandboxStamped: 'Approved by Customs! Ready to ship.',
      sandboxLabel: 'DEMO WAYBILL #0420',
      sandboxHint: 'Swipe left/right or tap Next',
    },
    footer: {
      license: 'GNU GPL-3.0 · Zero Telemetry · Direct WebRTC P2P',
      stageNote: 'Thermal Receipt Engine v1.0',
    },
  },
  id: {
    tagline: 'AirDrop tanpa pajak ekosistem mahal.',
    header: {
      deviceLabel: 'Julukan Paket',
      renameHint: 'Klik untuk ganti nama',
      soundOn: 'Suara klik mekanis: ON',
      soundOff: 'Suara klik mekanis: OFF',
      themeDark: 'Gudang Malam',
      themeLight: 'Kertas Kraft',
      help: 'Buku Panduan',
      langToggle: 'EN',
    },
    pairing: {
      title: 'Loket Pengiriman',
      subtitle: 'Tanpa login. Tanpa unggah ke cloud. Dua browser langsung berjabat tangan.',
      yourCode: 'Resi 4 Digit Anda',
      scanNote: 'Arahkan kamera HP ke QR ini — langsung tersambung 1 detik tanpa mengetik.',
      copyPin: 'Salin PIN',
      copyLink: 'Salin Tautan',
      copied: 'Tersalin!',
      newCode: 'PIN Baru',
      enterCodeTitle: 'Masukkan PIN Perangkat Lawan',
      enterCodeHint: 'Ketik 4 angka — langsung tersambung otomatis di angka ke-4.',
      scanQrBtn: 'Pindai QR',
      quickReconnect: 'Sambung Cepat',
      statusWaiting: 'Menunggu kurir di bea cukai...',
      statusConnecting: 'Menghubungkan WebRTC...',
      statusConnected: 'Bea Cukai Lolos',
      statusIdle: 'Loket tutup',
      statusError: 'Relay agak ngambek',
      peerConnectedOne: '1 kurir terhubung',
      peerConnectedMany: '{n} kurir terhubung',
      leaveRoom: 'Putus',
      qrScannerTitle: 'Pindai QR Resi',
      qrScannerHint: 'Arahkan kamera ke kode QR PoorDrops di layar sebelah.',
      qrScannerPermission: 'Izin kamera dipakai khusus membaca QR. Tidak ada foto yang disimpan.',
      qrScannerUnsupported: 'Kamera tidak tersedia di perangkat ini. Ketik PIN 4 digit saja.',
      close: 'Tutup',
    },
    clipboard: {
      title: 'Clipboard Instan & Lempar Tautan',
      subtitle: 'Berhenti mengirim link ke chat WhatsApp diri sendiri.',
      placeholder: 'Ketik atau Ctrl+V URL, kata sandi Wi-Fi, atau potongan kode — langsung meluncur...',
      pasteBtn: 'Tempel & Kirim',
      sendBtn: 'Kirim Teks',
      copyBtn: 'Salin',
      copied: 'Tersalin',
      openLink: 'Buka Tautan',
      autoCopy: 'Auto-Salin masuk',
      autoCopyBlocked: 'Browser menahan auto-salin di latar — klik tombol Salin.',
      fromPeer: 'Dari {name}',
      noLinks: 'URL yang ditempel akan muncul di sini sebagai tombol buka 1 ketuk.',
      waitingPeer: 'Sambungkan perangkat lain untuk mulai melempar teks real-time.',
    },
    cargo: {
      title: 'Timbangan Kargo File',
      subtitle: 'Stream WebRTC potongan 64KB. Foto tetap mentah tanpa dikompres paksa.',
      dropHere: 'Seret file ke sini, atau ketuk untuk pilih kargo',
      dropActive: 'Lepaskan tepat di atas timbangan paket!',
      dropSub: 'Banyak file, video besar, foto asli — tanpa perantara server.',
      pickFiles: 'Pilih File',
      stagedCount: '{n} paket di atas timbangan',
      clearStaged: 'Kosongkan',
      sendUncompressed: 'Kirim Tanpa Kompresi',
      bundleZip: 'Bungkus Jadi ZIP',
      bundlingZip: 'Melakban kotak ZIP...',
      needPeer: 'Sambungkan perangkat lawan dulu sebelum mengirim paket.',
      sending: 'Mengirim',
      receiving: 'Menerima',
      cancel: 'Batal',
      eta: 'Sisa',
    },
    manifest: {
      title: 'MANIFES PAKET',
      subtitle: 'Resi termal sesi ini — lenyap saat dicabik.',
      emptyTitle: 'Manifes masih bersih mencurigakan.',
      emptyBody: 'Jatuhkan file atau lempar tautan. Tidak ada server cloud yang mengintip.',
      sent: 'TERKIRIM',
      recv: 'DITERIMA',
      verified: 'SHA-256 VERIFIED',
      mismatch: 'HASH TIDAK COCOK',
      unverified: 'TANPA CRYPTO API',
      saveFile: 'Simpan',
      preview: 'Intip',
      copyHash: 'Salin SHA-256',
      shredBtn: 'Cabik Resi',
      shredded: 'Resi dicabik. Jejak sesi bersih.',
    },
    onboarding: {
      badge: 'Panduan 4 Langkah',
      skip: 'Lewati',
      back: 'Kembali',
      next: 'Lanjut',
      done: 'Mulai Kirim',
      step1Title: '1. Kargo Tanpa Server',
      step1Body:
        'Berhenti mengirim PDF ke email sendiri atau mengorbankan resolusi foto lewat chat. PoorDrops mengalirkan data langsung antar-perangkat via WebRTC.',
      step2Title: '2. Pairing Kaum Rebahan',
      step2Body:
        'Pindai QR pakai kamera bawaan HP dan langsung tersambung dalam 1 detik. Atau ketik 4 angka — tanpa tombol "Connect".',
      step3Title: '3. Clipboard & Bungkus ZIP',
      step3Body:
        'Tempel tautan panjang atau token rahasia, langsung muncul di layar lawan. Mengirim 30 file kecil? Tekan "Bungkus Jadi ZIP" seketika.',
      step4Title: '4. Stempel & Cek SHA-256',
      step4Body:
        'Setiap paket dihitung sidik jari SHA-256 sebelum dan sesudah tiba agar tidak ada bit yang nyasar. Coba ketuk stempel resi di bawah:',
      sandboxBtn: 'Cap Paket',
      sandboxStamped: 'Lolos Bea Cukai! Siap dikirim.',
      sandboxLabel: 'CONTOH RESI #0420',
      sandboxHint: 'Geser kiri/kanan atau tekan Lanjut',
    },
    footer: {
      license: 'GNU GPL-3.0 · Tanpa Telemetri · WebRTC P2P Langsung',
      stageNote: 'Mesin Resi Termal v1.0',
    },
  },
} as const;

export function useT() {
  return dict[locale.value];
}
