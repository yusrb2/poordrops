package com.poordrops.app;

import android.Manifest;
import android.annotation.SuppressLint;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothGatt;
import android.bluetooth.BluetoothGattCallback;
import android.bluetooth.BluetoothGattCharacteristic;
import android.bluetooth.BluetoothGattService;
import android.bluetooth.BluetoothManager;
import android.bluetooth.BluetoothProfile;
import android.bluetooth.le.BluetoothLeScanner;
import android.bluetooth.le.ScanCallback;
import android.bluetooth.le.ScanResult;
import android.content.ClipData;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.util.Base64;
import androidx.core.content.ContextCompat;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.atomic.AtomicBoolean;
import org.json.JSONObject;

@CapacitorPlugin(
    name = "BluetoothTransfer",
    permissions = {
        @Permission(strings = { Manifest.permission.BLUETOOTH_SCAN }, alias = "scan"),
        @Permission(strings = { Manifest.permission.BLUETOOTH_CONNECT }, alias = "connect"),
        @Permission(strings = { Manifest.permission.ACCESS_FINE_LOCATION }, alias = "location")
    }
)
public class BluetoothTransferPlugin extends Plugin {
    private BluetoothAdapter getAdapter() {
        BluetoothManager manager = (BluetoothManager) getContext().getSystemService(Context.BLUETOOTH_SERVICE);
        if (manager != null && manager.getAdapter() != null) {
            return manager.getAdapter();
        }
        return BluetoothAdapter.getDefaultAdapter();
    }

    private boolean hasBtPermissions() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            return ContextCompat.checkSelfPermission(getContext(), Manifest.permission.BLUETOOTH_SCAN) == PackageManager.PERMISSION_GRANTED
                && ContextCompat.checkSelfPermission(getContext(), Manifest.permission.BLUETOOTH_CONNECT) == PackageManager.PERMISSION_GRANTED;
        }
        return ContextCompat.checkSelfPermission(getContext(), Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED;
    }

    @PluginMethod
    public void checkStatus(PluginCall call) {
        BluetoothAdapter adapter = getAdapter();
        JSObject ret = new JSObject();
        ret.put("available", adapter != null);
        ret.put("enabled", adapter != null && adapter.isEnabled());
        ret.put("hasPermission", hasBtPermissions());
        call.resolve(ret);
    }

    @PluginMethod
    public void requestBluetoothPermissions(PluginCall call) {
        if (hasBtPermissions()) {
            JSObject ret = new JSObject();
            ret.put("granted", true);
            call.resolve(ret);
            return;
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            requestPermissionForAliases(new String[]{"scan", "connect"}, call, "btPermissionsCallback");
        } else {
            requestPermissionForAlias("location", call, "btPermissionsCallback");
        }
    }

    @PermissionCallback
    private void btPermissionsCallback(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("granted", hasBtPermissions());
        call.resolve(ret);
    }

    @PluginMethod
    public void shareViaBluetooth(PluginCall call) {
        String text = call.getString("text", "");
        JSArray filesArr = call.getArray("files");

        ArrayList<Uri> uris = new ArrayList<>();
        String primaryMime = "*/*";

        try {
            if (filesArr != null && filesArr.length() > 0) {
                File outDir = new File(getContext().getCacheDir(), "bt_outbox");
                if (!outDir.exists()) outDir.mkdirs();
                cleanupOutbox(outDir);

                String authority = getContext().getPackageName() + ".fileprovider";

                for (int i = 0; i < filesArr.length(); i++) {
                    JSONObject item = filesArr.getJSONObject(i);
                    String rawName = item.optString("name", "parcel_" + i);
                    String mime = item.optString("mime", "application/octet-stream");
                    String b64 = item.optString("dataBase64", "");
                    if (b64.isEmpty()) continue;

                    if (i == 0 && !mime.isEmpty()) {
                        primaryMime = mime;
                    } else if (!primaryMime.equals(mime)) {
                        primaryMime = "*/*";
                    }

                    String safeName = rawName.replaceAll("[^a-zA-Z0-9._-]", "_");
                    if (safeName.isEmpty()) safeName = "parcel_" + i;

                    File outFile = new File(outDir, System.currentTimeMillis() + "_" + safeName);
                    byte[] bytes = Base64.decode(b64, Base64.DEFAULT);
                    try (FileOutputStream fos = new FileOutputStream(outFile)) {
                        fos.write(bytes);
                        fos.flush();
                    }

                    Uri uri = FileProvider.getUriForFile(getContext(), authority, outFile);
                    uris.add(uri);
                }
            }

            if (uris.isEmpty() && (text == null || text.trim().isEmpty())) {
                call.reject("No files or text provided for Bluetooth share.");
                return;
            }

            Intent shareIntent;
            if (uris.size() > 1) {
                shareIntent = new Intent(Intent.ACTION_SEND_MULTIPLE);
                shareIntent.setType(primaryMime);
                shareIntent.putParcelableArrayListExtra(Intent.EXTRA_STREAM, uris);
                ClipData clip = ClipData.newUri(getContext().getContentResolver(), "PoorDrops", uris.get(0));
                for (int i = 1; i < uris.size(); i++) {
                    clip.addItem(new ClipData.Item(uris.get(i)));
                }
                shareIntent.setClipData(clip);
            } else if (uris.size() == 1) {
                shareIntent = new Intent(Intent.ACTION_SEND);
                shareIntent.setType(primaryMime);
                shareIntent.putExtra(Intent.EXTRA_STREAM, uris.get(0));
                shareIntent.setClipData(ClipData.newUri(getContext().getContentResolver(), "PoorDrops", uris.get(0)));
            } else {
                shareIntent = new Intent(Intent.ACTION_SEND);
                shareIntent.setType("text/plain");
                shareIntent.putExtra(Intent.EXTRA_TEXT, text);
            }

            if (text != null && !text.trim().isEmpty() && !uris.isEmpty()) {
                shareIntent.putExtra(Intent.EXTRA_TEXT, text);
            }

            shareIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);

            // Prefer system Bluetooth OPP handler when available
            PackageManager pm = getContext().getPackageManager();
            List<ResolveInfo> candidates = pm.queryIntentActivities(shareIntent, PackageManager.MATCH_DEFAULT_ONLY);
            String btPackage = null;
            String btActivity = null;
            for (ResolveInfo info : candidates) {
                String pkg = info.activityInfo.packageName;
                String cls = info.activityInfo.name;
                String lowerPkg = pkg.toLowerCase();
                String lowerCls = cls.toLowerCase();
                if (lowerPkg.contains("bluetooth") || lowerCls.contains("bluetooth") || lowerCls.contains("opp")) {
                    btPackage = pkg;
                    btActivity = cls;
                    break;
                }
            }

            if (btPackage != null && btActivity != null) {
                shareIntent.setClassName(btPackage, btActivity);
                getActivity().startActivity(shareIntent);
            } else {
                Intent chooser = Intent.createChooser(shareIntent, "Send via Bluetooth");
                chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getActivity().startActivity(chooser);
            }

            JSObject ret = new JSObject();
            ret.put("launched", true);
            ret.put("directBluetooth", btPackage != null);
            call.resolve(ret);
        } catch (Exception ex) {
            call.reject("Failed to open Bluetooth share sheet: " + ex.getMessage());
        }
    }

    @SuppressLint("MissingPermission")
    @PluginMethod
    public void scanBleDevices(PluginCall call) {
        BluetoothAdapter adapter = getAdapter();
        if (adapter == null) {
            call.reject("Bluetooth hardware unavailable on this device.");
            return;
        }
        if (!adapter.isEnabled()) {
            call.reject("Bluetooth is turned off. Enable Bluetooth and try again.");
            return;
        }
        if (!hasBtPermissions()) {
            call.reject("Bluetooth permission not granted.");
            return;
        }

        Map<String, JSObject> found = new LinkedHashMap<>();

        try {
            Set<BluetoothDevice> bonded = adapter.getBondedDevices();
            if (bonded != null) {
                for (BluetoothDevice dev : bonded) {
                    if (dev == null || dev.getAddress() == null) continue;
                    String name = dev.getName();
                    JSObject item = new JSObject();
                    item.put("id", dev.getAddress());
                    item.put("name", (name != null && !name.isEmpty()) ? name : dev.getAddress());
                    item.put("rssi", -55);
                    item.put("bonded", true);
                    found.put(dev.getAddress(), item);
                }
            }
        } catch (Exception ignored) {
        }

        BluetoothLeScanner scanner = adapter.getBluetoothLeScanner();
        if (scanner == null) {
            JSArray arr = new JSArray();
            for (JSObject o : found.values()) arr.put(o);
            JSObject ret = new JSObject();
            ret.put("devices", arr);
            call.resolve(ret);
            return;
        }

        AtomicBoolean finished = new AtomicBoolean(false);
        Handler mainHandler = new Handler(Looper.getMainLooper());

        ScanCallback scanCallback = new ScanCallback() {
            @Override
            public void onScanResult(int callbackType, ScanResult result) {
                if (result == null || result.getDevice() == null) return;
                BluetoothDevice dev = result.getDevice();
                String addr = dev.getAddress();
                if (addr == null) return;
                String name = dev.getName();
                if ((name == null || name.isEmpty()) && result.getScanRecord() != null) {
                    name = result.getScanRecord().getDeviceName();
                }
                if (name == null || name.isEmpty()) return;

                JSObject existing = found.get(addr);
                boolean isBonded = existing != null && existing.optBoolean("bonded", false);
                JSObject item = new JSObject();
                item.put("id", addr);
                item.put("name", name);
                item.put("rssi", result.getRssi());
                item.put("bonded", isBonded);
                found.put(addr, item);
            }
        };

        try {
            scanner.startScan(scanCallback);
        } catch (Exception ex) {
            JSArray arr = new JSArray();
            for (JSObject o : found.values()) arr.put(o);
            JSObject ret = new JSObject();
            ret.put("devices", arr);
            call.resolve(ret);
            return;
        }

        mainHandler.postDelayed(() -> {
            if (!finished.compareAndSet(false, true)) return;
            try {
                scanner.stopScan(scanCallback);
            } catch (Exception ignored) {
            }
            JSArray arr = new JSArray();
            for (JSObject o : found.values()) arr.put(o);
            JSObject ret = new JSObject();
            ret.put("devices", arr);
            call.resolve(ret);
        }, 4200);
    }

    @SuppressLint("MissingPermission")
    @PluginMethod
    public void sendBleText(PluginCall call) {
        String address = call.getString("deviceId", "");
        String text = call.getString("text", "");
        if (address == null || address.isEmpty() || text == null || text.isEmpty()) {
            call.reject("Missing deviceId or text.");
            return;
        }

        BluetoothAdapter adapter = getAdapter();
        if (adapter == null || !adapter.isEnabled() || !hasBtPermissions()) {
            call.reject("Bluetooth unavailable or permission denied.");
            return;
        }

        BluetoothDevice device;
        try {
            device = adapter.getRemoteDevice(address);
        } catch (Exception ex) {
            call.reject("Invalid Bluetooth device address.");
            return;
        }

        AtomicBoolean settled = new AtomicBoolean(false);
        Handler handler = new Handler(Looper.getMainLooper());
        byte[] bytes = text.getBytes(StandardCharsets.UTF_8);

        BluetoothGattCallback gattCallback = new BluetoothGattCallback() {
            @Override
            public void onConnectionStateChange(BluetoothGatt gatt, int status, int newState) {
                if (newState == BluetoothProfile.STATE_CONNECTED) {
                    gatt.discoverServices();
                } else if (newState == BluetoothProfile.STATE_DISCONNECTED && settled.compareAndSet(false, true)) {
                    gatt.close();
                    call.reject("BLE device disconnected. Use Bluetooth Share Sheet for standard file transfers.");
                }
            }

            @Override
            public void onServicesDiscovered(BluetoothGatt gatt, int status) {
                if (status != BluetoothGatt.GATT_SUCCESS) {
                    if (settled.compareAndSet(false, true)) {
                        gatt.close();
                        call.reject("No writable BLE GATT service discovered.");
                    }
                    return;
                }

                BluetoothGattCharacteristic targetChar = null;
                for (BluetoothGattService svc : gatt.getServices()) {
                    for (BluetoothGattCharacteristic ch : svc.getCharacteristics()) {
                        int props = ch.getProperties();
                        if ((props & BluetoothGattCharacteristic.PROPERTY_WRITE) != 0
                            || (props & BluetoothGattCharacteristic.PROPERTY_WRITE_NO_RESPONSE) != 0) {
                            targetChar = ch;
                            break;
                        }
                    }
                    if (targetChar != null) break;
                }

                if (targetChar == null) {
                    if (settled.compareAndSet(false, true)) {
                        gatt.close();
                        call.reject("Target device has no writable BLE GATT characteristic. Use Bluetooth Share Sheet instead.");
                    }
                    return;
                }

                try {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                        int writeType = (targetChar.getProperties() & BluetoothGattCharacteristic.PROPERTY_WRITE_NO_RESPONSE) != 0
                            ? BluetoothGattCharacteristic.WRITE_TYPE_NO_RESPONSE
                            : BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT;
                        gatt.writeCharacteristic(targetChar, bytes, writeType);
                    } else {
                        targetChar.setValue(bytes);
                        gatt.writeCharacteristic(targetChar);
                    }
                    if (settled.compareAndSet(false, true)) {
                        JSObject ret = new JSObject();
                        ret.put("sent", true);
                        call.resolve(ret);
                    }
                    handler.postDelayed(gatt::close, 400);
                } catch (Exception ex) {
                    if (settled.compareAndSet(false, true)) {
                        gatt.close();
                        call.reject("BLE write failed: " + ex.getMessage());
                    }
                }
            }
        };

        BluetoothGatt gatt = device.connectGatt(getContext(), false, gattCallback);
        handler.postDelayed(() -> {
            if (settled.compareAndSet(false, true)) {
                if (gatt != null) gatt.close();
                call.reject("BLE GATT connection timed out. Use Bluetooth Share Sheet for standard devices.");
            }
        }, 6500);
    }

    private void cleanupOutbox(File dir) {
        File[] files = dir.listFiles();
        if (files == null) return;
        long cutoff = System.currentTimeMillis() - 86_400_000L;
        for (File f : files) {
            if (f.lastModified() < cutoff) f.delete();
        }
    }
}
