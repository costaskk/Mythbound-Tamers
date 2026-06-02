// Change this package to match your app package from MainActivity.java.
package com.yourpackage.mythbound;

import android.Manifest;
import android.app.DownloadManager;
import android.content.*;
import android.net.Uri;
import android.os.*;
import androidx.core.content.FileProvider;
import com.getcapacitor.*;
import com.getcapacitor.annotation.*;
import java.io.File;

@CapacitorPlugin(name = "MythboundUpdater", permissions = { @Permission(strings = { Manifest.permission.REQUEST_INSTALL_PACKAGES }, alias = "installPackages") })
public class MythboundUpdaterPlugin extends Plugin {
  private long activeDownloadId = -1L;

  @PluginMethod
  public void downloadAndInstallApk(PluginCall call) {
    String url = call.getString("url");
    String fileName = call.getString("fileName", "mythbound-update.apk");
    if (url == null || url.trim().isEmpty()) { call.reject("Missing APK url"); return; }

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !getContext().getPackageManager().canRequestPackageInstalls()) {
      Intent settingsIntent = new Intent(android.provider.Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES);
      settingsIntent.setData(Uri.parse("package:" + getContext().getPackageName()));
      settingsIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
      getContext().startActivity(settingsIntent);
      call.reject("Allow 'Install unknown apps' for Mythbound Tamers, then press update again.");
      return;
    }

    try {
      cleanupApkFiles();
      DownloadManager.Request request = new DownloadManager.Request(Uri.parse(url));
      request.setTitle("Mythbound Tamers Update");
      request.setDescription("Downloading " + fileName);
      request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
      request.setDestinationInExternalFilesDir(getContext(), Environment.DIRECTORY_DOWNLOADS, fileName);
      request.setAllowedOverMetered(true);
      DownloadManager manager = (DownloadManager) getContext().getSystemService(Context.DOWNLOAD_SERVICE);
      activeDownloadId = manager.enqueue(request);

      BroadcastReceiver receiver = new BroadcastReceiver() {
        @Override public void onReceive(Context context, Intent intent) {
          long id = intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1L);
          if (id != activeDownloadId) return;
          try { context.unregisterReceiver(this); } catch (Exception ignored) {}
          openInstaller(fileName);
        }
      };
      if (Build.VERSION.SDK_INT >= 33) getContext().registerReceiver(receiver, new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE), Context.RECEIVER_NOT_EXPORTED);
      else getContext().registerReceiver(receiver, new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE));

      JSObject ret = new JSObject(); ret.put("started", true); ret.put("fileName", fileName); ret.put("downloadId", activeDownloadId); call.resolve(ret);
    } catch (Exception e) { call.reject("Download failed: " + e.getMessage(), e); }
  }

  private void openInstaller(String fileName) {
    try {
      File apk = new File(getContext().getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS), fileName);
      Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", apk);
      Intent install = new Intent(Intent.ACTION_VIEW);
      install.setDataAndType(uri, "application/vnd.android.package-archive");
      install.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_GRANT_READ_URI_PERMISSION);
      getContext().startActivity(install);
    } catch (Exception e) { android.util.Log.e("MythboundUpdater", "Install failed", e); }
  }

  @PluginMethod public void cleanupDownloadedApks(PluginCall call) { JSObject ret = new JSObject(); ret.put("deleted", cleanupApkFiles()); call.resolve(ret); }

  private int cleanupApkFiles() {
    int deleted = 0;
    try {
      File dir = getContext().getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
      File[] files = dir == null ? null : dir.listFiles();
      if (files == null) return 0;
      for (File f : files) if (f.getName().toLowerCase().startsWith("mythbound") && f.getName().toLowerCase().endsWith(".apk") && f.delete()) deleted++;
    } catch (Exception ignored) {}
    return deleted;
  }
}
