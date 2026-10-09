package expo.modules.ghostdevice

import android.app.Notification
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification

/**
 * Android hands every notification here once the owner grants Ghost access.
 * Ghost keeps only those of the apps the owner chose; for the rest it notes
 * the app's name (so it can be offered as a choice) and nothing else.
 */
class GhostNotificationService : NotificationListenerService() {
  override fun onNotificationPosted(sbn: StatusBarNotification?) {
    val n = sbn ?: return
    val ctx = applicationContext ?: return
    if (n.packageName == ctx.packageName) return
    val notification = n.notification ?: return
    // Ongoing ones (music, navigation, downloads) and group summaries are not messages.
    if (n.isOngoing || (notification.flags and Notification.FLAG_GROUP_SUMMARY) != 0) return
    try {
      NotificationStore.seen(ctx, n.packageName)
      if (!NotificationStore.allowed(ctx).contains(n.packageName)) return
      val extras = notification.extras ?: return
      val title = extras.getCharSequence(Notification.EXTRA_TITLE)?.toString() ?: ""
      val text = (extras.getCharSequence(Notification.EXTRA_BIG_TEXT) ?: extras.getCharSequence(Notification.EXTRA_TEXT))?.toString() ?: ""
      if (title.isBlank() && text.isBlank()) return
      NotificationStore.add(ctx, n.packageName, NotificationStore.label(ctx, n.packageName), title, text, n.postTime)
    } catch (e: Exception) {
      // A notification Ghost could not read is simply not kept.
    }
  }
}
