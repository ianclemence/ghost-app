package expo.modules.ghostdevice

import android.content.Context
import android.content.pm.PackageManager
import androidx.core.app.NotificationManagerCompat
import org.json.JSONArray
import org.json.JSONObject

/**
 * What the notification listener keeps until Ghost collects it: only the
 * notifications of the apps the owner chose, cut short, at most a few hundred.
 * The apps that posted anything are remembered by name alone (no content), so
 * the owner can choose among them.
 */
object NotificationStore {
  private const val PREFS = "ghost_device_notifications"
  private const val KEY_QUEUE = "queue"
  private const val KEY_ALLOWED = "allowed"
  private const val KEY_SEEN = "seen"
  private const val MAX_QUEUE = 300
  private const val MAX_SEEN = 60

  private fun prefs(context: Context) = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  fun accessGranted(context: Context): Boolean =
    NotificationManagerCompat.getEnabledListenerPackages(context).contains(context.packageName)

  fun setAllowed(context: Context, packages: List<String>) {
    prefs(context).edit().putStringSet(KEY_ALLOWED, packages.toSet()).apply()
    if (packages.isEmpty()) {
      prefs(context).edit().remove(KEY_QUEUE).apply()
    }
  }

  fun allowed(context: Context): Set<String> = prefs(context).getStringSet(KEY_ALLOWED, emptySet()) ?: emptySet()

  fun label(context: Context, pkg: String): String = try {
    val pm = context.packageManager
    pm.getApplicationLabel(pm.getApplicationInfo(pkg, PackageManager.GET_META_DATA)).toString()
  } catch (e: Exception) {
    pkg
  }

  @Synchronized
  fun seen(context: Context, pkg: String) {
    val p = prefs(context)
    val arr = JSONArray(p.getString(KEY_SEEN, "[]"))
    val out = JSONArray()
    out.put(JSONObject().put("package", pkg).put("app", label(context, pkg)).put("at", System.currentTimeMillis()))
    for (i in 0 until arr.length()) {
      val o = arr.getJSONObject(i)
      if (o.optString("package") != pkg && out.length() < MAX_SEEN) out.put(o)
    }
    p.edit().putString(KEY_SEEN, out.toString()).apply()
  }

  fun recentApps(context: Context): List<Map<String, Any>> {
    val arr = JSONArray(prefs(context).getString(KEY_SEEN, "[]"))
    val out = ArrayList<Map<String, Any>>()
    for (i in 0 until arr.length()) {
      val o = arr.getJSONObject(i)
      out.add(mapOf("package" to o.optString("package"), "app" to o.optString("app"), "at" to o.optLong("at").toDouble()))
    }
    return out
  }

  @Synchronized
  fun add(context: Context, pkg: String, app: String, title: String, text: String, at: Long) {
    val p = prefs(context)
    val arr = JSONArray(p.getString(KEY_QUEUE, "[]"))
    arr.put(JSONObject().put("package", pkg).put("app", app).put("title", title.take(160)).put("text", text.take(500)).put("at", at))
    val start = if (arr.length() > MAX_QUEUE) arr.length() - MAX_QUEUE else 0
    val kept = JSONArray()
    for (i in start until arr.length()) kept.put(arr.getJSONObject(i))
    p.edit().putString(KEY_QUEUE, kept.toString()).apply()
  }

  /** Everything kept since the last call; the queue is emptied. */
  @Synchronized
  fun take(context: Context): List<Map<String, Any>> {
    val p = prefs(context)
    val arr = JSONArray(p.getString(KEY_QUEUE, "[]"))
    p.edit().remove(KEY_QUEUE).apply()
    val out = ArrayList<Map<String, Any>>()
    for (i in 0 until arr.length()) {
      val o = arr.getJSONObject(i)
      out.add(mapOf(
        "package" to o.optString("package"),
        "app" to o.optString("app"),
        "title" to o.optString("title"),
        "text" to o.optString("text"),
        "at" to o.optLong("at").toDouble(),
      ))
    }
    return out
  }

  /** Puts collected notifications back (sending them to the Pod failed). */
  @Synchronized
  fun putBack(context: Context, items: List<Map<String, Any?>>) {
    for (m in items) {
      add(
        context,
        m["package"]?.toString() ?: continue,
        m["app"]?.toString() ?: "",
        m["title"]?.toString() ?: "",
        m["text"]?.toString() ?: "",
        (m["at"] as? Number)?.toLong() ?: System.currentTimeMillis(),
      )
    }
  }
}
