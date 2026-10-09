package expo.modules.ghostdevice

import android.content.Context
import android.content.Intent
import android.provider.Settings
import androidx.health.connect.client.PermissionController
import expo.modules.kotlin.activityresult.AppContextActivityResultContract
import expo.modules.kotlin.activityresult.AppContextActivityResultLauncher
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.Serializable

/** The Health Connect permission request, wrapped the way Expo launches activities. */
data class HealthRequest(val permissions: ArrayList<String>) : Serializable

class HealthPermissionContract : AppContextActivityResultContract<HealthRequest, Set<String>> {
  private val inner = PermissionController.createRequestPermissionResultContract()
  override fun createIntent(context: Context, input: HealthRequest): Intent = inner.createIntent(context, input.permissions.toSet())
  override fun parseResult(input: HealthRequest, resultCode: Int, intent: Intent?): Set<String> = inner.parseResult(resultCode, intent)
}

/**
 * The phone as Ghost's senses, only as far as the owner allows: the
 * notifications of the apps they chose (after they grant notification access
 * in Android settings) and daily totals from Health Connect.
 */
class GhostDeviceModule : Module() {
  private val context: Context
    get() = requireNotNull(appContext.reactContext) { "React context is not ready" }

  private lateinit var healthLauncher: AppContextActivityResultLauncher<HealthRequest, Set<String>>

  override fun definition() = ModuleDefinition {
    Name("GhostDevice")

    Function("notificationAccessGranted") { NotificationStore.accessGranted(context) }

    Function("openNotificationAccessSettings") {
      val intent = Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      context.startActivity(intent)
    }

    Function("setAllowedApps") { packages: List<String> -> NotificationStore.setAllowed(context, packages) }

    Function("allowedApps") { NotificationStore.allowed(context).toList() }

    Function("recentApps") { NotificationStore.recentApps(context) }

    Function("takeNotifications") { NotificationStore.take(context) }

    Function("putBackNotifications") { items: List<Map<String, Any?>> -> NotificationStore.putBack(context, items) }

    AsyncFunction("healthStatus") Coroutine { -> HealthBridge.status(context) }

    AsyncFunction("requestHealth") Coroutine { ->
      healthLauncher.launch(HealthRequest(ArrayList(HealthBridge.PERMISSIONS)))
      HealthBridge.status(context)
    }

    AsyncFunction("readHealth") Coroutine { days: Int -> HealthBridge.read(context, days) }

    RegisterActivityContracts {
      healthLauncher = registerForActivityResult(HealthPermissionContract())
    }
  }
}
