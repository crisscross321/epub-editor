package com.sujian.epubeditor;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.provider.DocumentsContract;
import android.provider.OpenableColumns;
import android.util.Base64;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;

@CapacitorPlugin(name = "SaveDocument")
public class SaveDocumentPlugin extends Plugin {

    @PluginMethod
    public void save(PluginCall call) {
        String filename = call.getString("filename", "未命名.epub");
        String mime = call.getString("mime", "application/epub+zip");
        String payload = call.getString("data");
        if (payload == null) {
            call.reject("缺少文件内容");
            return;
        }
        if (getActivity() == null) {
            call.reject("现在不能保存");
            return;
        }
        // Capacitor writes the pending call into the activity state when the
        // document picker opens. A multi-megabyte EPUB in that parcel crashes
        // the app with TransactionTooLargeException, so keep the bytes in cache.
        File cache;
        try {
            cache = writeCache(call.getCallbackId(), payload);
        } catch (IOException | IllegalArgumentException error) {
            call.reject("无法准备要保存的文件");
            return;
        }
        if (call.getData() != null) {
            call.getData().remove("data");
            call.getData().put("cachePath", cache.getAbsolutePath());
        }
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType(mime);
        intent.putExtra(Intent.EXTRA_TITLE, filename);
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
        try {
            startActivityForResult(call, intent, "saveResult");
        } catch (ActivityNotFoundException error) {
            deleteCache(cache);
            call.reject("这台手机没有文件选择器");
        }
    }

    @ActivityCallback
    private void saveResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        Intent data = result.getData();
        if (result.getResultCode() != Activity.RESULT_OK || data == null || data.getData() == null) {
            deleteCache(call.getString("cachePath"));
            call.reject("已取消", "cancelled");
            return;
        }
        Uri uri = data.getData();
        String cachePath = call.getString("cachePath");
        if (cachePath == null || cachePath.isEmpty()) {
            call.reject("缺少文件内容");
            return;
        }
        File cache = new File(cachePath);
        getBridge().execute(() -> {
            try {
                copyFile(cache, uri);
                persistPermission(data, uri);
                JSObject saved = new JSObject();
                saved.put("uri", uri.toString());
                String path = displayPath(uri);
                if (path != null && !path.isEmpty()) saved.put("displayPath", path);
                getBridge().executeOnMainThread(() -> call.resolve(saved));
            } catch (Exception error) {
                String message = error.getLocalizedMessage();
                getBridge().executeOnMainThread(() -> call.reject(message == null || message.isEmpty() ? "无法写入这个位置" : message));
            } finally {
                deleteCache(cache);
            }
        });
    }

    @PluginMethod
    public void pickDirectory(PluginCall call) {
        if (getActivity() == null) {
            call.reject("现在不能保存");
            return;
        }
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
        intent.addFlags(
            Intent.FLAG_GRANT_READ_URI_PERMISSION
                | Intent.FLAG_GRANT_WRITE_URI_PERMISSION
                | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION
                | Intent.FLAG_GRANT_PREFIX_URI_PERMISSION
        );
        startActivityForResult(call, intent, "directoryResult");
    }

    @ActivityCallback
    private void directoryResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        Intent data = result.getData();
        if (result.getResultCode() != Activity.RESULT_OK || data == null || data.getData() == null) {
            call.reject("已取消", "cancelled");
            return;
        }
        Uri uri = data.getData();
        persistPermission(data, uri);
        JSObject saved = new JSObject();
        saved.put("uri", uri.toString());
        String path = treeDisplayPath(uri);
        if (path != null && !path.isEmpty()) saved.put("displayPath", path);
        call.resolve(saved);
    }

    @PluginMethod
    public void saveInDirectory(PluginCall call) {
        String directoryUri = call.getString("directoryUri");
        String filename = call.getString("filename");
        String mime = call.getString("mime", "application/octet-stream");
        String payload = call.getString("data");
        if (directoryUri == null || filename == null || payload == null) {
            call.reject("缺少文件内容");
            return;
        }
        Uri tree = Uri.parse(directoryUri);
        getBridge().execute(() -> {
            try {
                Uri file = createOrReplace(tree, mime, filename);
                writeBase64(file, payload);
                String folder = treeDisplayPath(tree);
                String display = folder == null || folder.isEmpty() ? filename : folder + "/" + filename;
                JSObject saved = new JSObject();
                saved.put("uri", file.toString());
                saved.put("displayPath", display);
                getBridge().executeOnMainThread(() -> call.resolve(saved));
            } catch (Exception error) {
                String message = error.getLocalizedMessage();
                getBridge().executeOnMainThread(() -> call.reject(message == null || message.isEmpty() ? "无法写入这个位置" : message));
            }
        });
    }

    @PluginMethod
    public void share(PluginCall call) {
        String uriString = call.getString("uri");
        String mime = call.getString("mime", "application/epub+zip");
        String title = call.getString("title", "分享");
        if (uriString == null || uriString.isEmpty()) {
            call.reject("没有可分享的文件");
            return;
        }
        Activity activity = getActivity();
        if (activity == null) {
            call.reject("现在不能分享");
            return;
        }
        Uri uri = Uri.parse(uriString);
        Intent send = new Intent(Intent.ACTION_SEND);
        send.setType(mime);
        send.putExtra(Intent.EXTRA_STREAM, uri);
        send.putExtra(Intent.EXTRA_SUBJECT, title);
        send.setClipData(ClipData.newRawUri(title, uri));
        send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        Intent chooser = Intent.createChooser(send, "分享");
        chooser.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        try {
            activity.startActivity(chooser);
            call.resolve();
        } catch (ActivityNotFoundException error) {
            call.reject("没有可以分享的应用");
        }
    }

    private File writeCache(String callbackId, String data) throws IOException {
        File dir = new File(getContext().getCacheDir(), "exports");
        if (!dir.exists() && !dir.mkdirs()) throw new IOException("无法准备要保存的文件");
        String name = callbackId == null ? "export" : callbackId.replaceAll("[^A-Za-z0-9._-]", "_");
        File file = new File(dir, name + ".epub");
        byte[] bytes = Base64.decode(data, Base64.DEFAULT);
        try (OutputStream out = new FileOutputStream(file)) {
            out.write(bytes);
        }
        return file;
    }

    private void copyFile(File file, Uri uri) throws IOException {
        try (InputStream in = new FileInputStream(file); OutputStream out = getContext().getContentResolver().openOutputStream(uri)) {
            if (out == null) throw new IOException("无法写入这个位置");
            byte[] buffer = new byte[8192];
            int read;
            while ((read = in.read(buffer)) != -1) out.write(buffer, 0, read);
            out.flush();
        }
    }

    private void deleteCache(String path) {
        if (path == null || path.isEmpty()) return;
        deleteCache(new File(path));
    }

    private void deleteCache(File file) {
        if (file == null || getContext() == null) return;
        File dir = new File(getContext().getCacheDir(), "exports");
        try {
            if (!file.getCanonicalPath().startsWith(dir.getCanonicalPath() + File.separator)) return;
        } catch (IOException error) {
            return;
        }
        file.delete();
    }

    private void writeBase64(Uri uri, String data) throws IOException {
        byte[] bytes = Base64.decode(data, Base64.DEFAULT);
        try (OutputStream out = getContext().getContentResolver().openOutputStream(uri)) {
            if (out == null) throw new IOException("无法写入这个位置");
            out.write(bytes);
            out.flush();
        }
    }

    private String treeDisplayPath(Uri uri) {
        try {
            return friendlyDocumentId(DocumentsContract.getTreeDocumentId(uri));
        } catch (Exception ignored) {
            return displayPath(uri);
        }
    }

    private Uri createOrReplace(Uri treeUri, String mime, String filename) throws IOException {
        String treeId = DocumentsContract.getTreeDocumentId(treeUri);
        Uri parent = DocumentsContract.buildDocumentUriUsingTree(treeUri, treeId);
        Uri existing = findChild(treeUri, filename);
        if (existing != null) return existing;
        Uri created = DocumentsContract.createDocument(getContext().getContentResolver(), parent, mime, filename);
        if (created == null) throw new IOException("无法写入这个位置");
        return created;
    }

    private Uri findChild(Uri treeUri, String filename) {
        Uri children = DocumentsContract.buildChildDocumentsUriUsingTree(treeUri, DocumentsContract.getTreeDocumentId(treeUri));
        try (Cursor cursor = getContext().getContentResolver().query(
            children,
            new String[] { DocumentsContract.Document.COLUMN_DOCUMENT_ID, DocumentsContract.Document.COLUMN_DISPLAY_NAME },
            null,
            null,
            null
        )) {
            if (cursor == null) return null;
            while (cursor.moveToNext()) {
                if (!filename.equals(cursor.getString(1))) continue;
                return DocumentsContract.buildDocumentUriUsingTree(treeUri, cursor.getString(0));
            }
        } catch (Exception ignored) {
        }
        return null;
    }

    private String displayPath(Uri uri) {
        try {
            if (DocumentsContract.isDocumentUri(getContext(), uri)) {
                String friendly = friendlyDocumentId(DocumentsContract.getDocumentId(uri));
                if (friendly != null && !friendly.isEmpty()) return friendly;
            }
        } catch (Exception ignored) {
        }
        return displayName(uri);
    }

    private String friendlyDocumentId(String id) {
        if (id == null || id.isEmpty()) return "";
        if (id.startsWith("raw:")) return friendlyStoragePath(id.substring(4));
        int colon = id.indexOf(':');
        return friendlyStoragePath(colon >= 0 ? id.substring(colon + 1) : id);
    }

    private String friendlyStoragePath(String path) {
        if (path == null) return "";
        String normalized = path;
        String root = "/storage/emulated/0/";
        if (normalized.startsWith(root)) normalized = normalized.substring(root.length());
        while (normalized.startsWith("/")) normalized = normalized.substring(1);
        if (normalized.isEmpty()) return "";
        int slash = normalized.indexOf('/');
        String head = slash >= 0 ? normalized.substring(0, slash) : normalized;
        String tail = slash >= 0 ? normalized.substring(slash) : "";
        return folderName(head) + tail;
    }

    private String folderName(String name) {
        if ("Download".equals(name) || "Downloads".equals(name)) return "下载";
        if ("Documents".equals(name)) return "文档";
        return name;
    }

    private String displayName(Uri uri) {
        try (Cursor cursor = getContext().getContentResolver().query(uri, new String[] { OpenableColumns.DISPLAY_NAME }, null, null, null)) {
            if (cursor != null && cursor.moveToFirst()) return cursor.getString(0);
        } catch (Exception ignored) {
        }
        return "";
    }

    private void persistPermission(Intent data, Uri uri) {
        try {
            int flags = data.getFlags() & (Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
            if (flags == 0) return;
            getContext().getContentResolver().takePersistableUriPermission(uri, flags);
        } catch (SecurityException ignored) {
            // The picker grant still covers this session, which is enough to share.
        }
    }
}
