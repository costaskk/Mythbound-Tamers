// IMPORTANT:
// 1) Change this package line to match your app package from MainActivity.java.
// 2) Put this file next to MainActivity.java.
// Example path:
// android/app/src/main/java/com/YOUR/PACKAGE/MythboundUpdaterPlugin.java

package com.yourpackage.mythbound;

import android.Manifest;
import android.app.DownloadManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.io.File;

@CapacitorPlugin(
  name = "MythboundUpdater",
  permissions = {
    @Permission(strings = { Manifest.permission.REQUEST_INSTALL_PACKAGES }, alias = "installPackages")
  }
)
public class MythboundUpdaterPlugin extends Plugin {
  private long activeDownloadId = -1L;
  private String activeFileName = "mythbound-update.apk";

  @PluginMethod
  public void downloadAndInstallApk(PluginCall call) {
    String url = call.getString("url");
    String fileName = call.getString("fileName", "mythbound-update.apk");

    if (url == null || url.trim().isEmpty()) {
      call.reject("Missing APK url");
      return;
    }

    activeFileName = fileName;

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !getContext().getPackageManager().canRequestPackageInstalls()) {
      Intent settingsIntent = new Intent(android.provider.Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES);
      settingsIntent.setData(Uri.parse("package:" + getContext().getPackageName()));
      settingsIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
      getContext().startActivity(settingsIntent);
      call.reject("Allow 'Install unknown apps' for Mythbound Tamers, then press update again.");
      return;
    }

    try {
      File dir = getContext().getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
      if (dir != null && !dir.exists()) dir.mkdirs();

      // Delete old Mythbound APKs before starting the new download.
      cleanupApkFiles();

      DownloadManager.Request request = new DownloadManager.Request(Uri.parse(url));
      request.setTitle("Mythbound Tamers Update");
      request.setDescription("Downloading " + fileName);
      request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
      request.setDestinationInExternalFilesDir(getContext(), Environment.DIRECTORY_DOWNLOADS, fileName);
      request.setAllowedOverMetered(true);
      request.setAllowedOverRoaming(true);

      DownloadManager manager = (DownloadManager) getContext().getSystemService(Context.DOWNLOAD_SERVICE);
      activeDownloadId = manager.enqueue(request);

      BroadcastReceiver receiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
          long id = intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1L);
          if (id != activeDownloadId) return;
          try {
            context.unregisterReceiver(this);
          } catch (Exception ignored) {}
          installDownloadedApk(fileName, call);
        }
      };

      if (Build.VERSION.SDK_INT >= 33) {
        getContext().registerReceiver(receiver, new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE), Context.RECEIVER_NOT_EXPORTED);
      } else {
        getContext().registerReceiver(receiver, new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE));
      }

      JSObject ret = new JSObject();
      ret.put("started", true);
      ret.put("downloadId", activeDownloadId);
      ret.put("fileName", fileName);
      call.resolve(ret);
    } catch (Exception e) {
      call.reject("Download failed: " + e.getMessage(), e);
    }
  }

  private void installDownloadedApk(String fileName, PluginCall call) {
    try {
      File apk = new File(getContext().getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS), fileName);
      if (!apk.exists()) return;

      Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", apk);
      Intent install = new Intent(Intent.ACTION_VIEW);
      install.setDataAndType(uri, "application/vnd.android.package-archive");
      install.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
      install.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
      getContext().startActivity(install);

      // Do not delete here; Android still needs the file while package installer is open.
      // The JS app calls cleanupDownloadedApks() on next launch, after successful update.
    } catch (Exception e) {
      // Cannot call.reject reliably here because the original call may already be resolved.
      android.util.Log.e("MythboundUpdater", "Install failed", e);
    }
  }

  @PluginMethod
  public void cleanupDownloadedApks(PluginCall call) {
    int deleted = cleanupApkFiles();
    JSObject ret = new JSObject();
    ret.put("deleted", deleted);
    call.resolve(ret);
  }

  private int cleanupApkFiles() {
    int deleted = 0;
    try {
      File dir = getContext().getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
      if (dir == null || !dir.exists()) return 0;
      File[] files = dir.listFiles();
      if (files == null) return 0;
      for (File f : files) {
        String n = f.getName().toLowerCase();
        if (n.startsWith("mythbound") && n.endsWith(".apk")) {
          if (f.delete()) deleted++;
        }
      }
    } catch (Exception ignored) {}
    return deleted;
  }
}
