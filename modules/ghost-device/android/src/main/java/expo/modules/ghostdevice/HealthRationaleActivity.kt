package expo.modules.ghostdevice

import android.app.Activity
import android.os.Bundle

/**
 * What Health Connect opens when the owner asks why Ghost wants their health
 * data. Ghost's answer lives in the app (Settings → Phone), so this opens Ghost
 * there and steps aside.
 */
class HealthRationaleActivity : Activity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    packageManager.getLaunchIntentForPackage(packageName)?.let { startActivity(it) }
    finish()
  }
}
