package expo.modules.ghostdevice

import android.content.Context
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.RestingHeartRateRecord
import androidx.health.connect.client.records.SleepSessionRecord
import androidx.health.connect.client.records.StepsRecord
import androidx.health.connect.client.request.AggregateGroupByPeriodRequest
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import java.time.Duration
import java.time.LocalDate
import java.time.Period
import java.time.ZoneId

/**
 * Daily totals from Health Connect: steps, minutes asleep (by the day the
 * sleep ended), and resting heart rate (the day's average). Only what the
 * owner granted is read; nothing finer than a day leaves the phone.
 */
object HealthBridge {
  val PERMISSIONS: Set<String> = setOf(
    HealthPermission.getReadPermission(StepsRecord::class),
    HealthPermission.getReadPermission(SleepSessionRecord::class),
    HealthPermission.getReadPermission(RestingHeartRateRecord::class),
  )

  /** unavailable | needs_update | not_granted | partial | granted */
  suspend fun status(context: Context): String {
    when (HealthConnectClient.getSdkStatus(context)) {
      HealthConnectClient.SDK_UNAVAILABLE -> return "unavailable"
      HealthConnectClient.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED -> return "needs_update"
    }
    val granted = HealthConnectClient.getOrCreate(context).permissionController.getGrantedPermissions()
    return when {
      granted.containsAll(PERMISSIONS) -> "granted"
      granted.any { it in PERMISSIONS } -> "partial"
      else -> "not_granted"
    }
  }

  suspend fun read(context: Context, days: Int): List<Map<String, Any>> {
    if (HealthConnectClient.getSdkStatus(context) != HealthConnectClient.SDK_AVAILABLE) return emptyList()
    val client = HealthConnectClient.getOrCreate(context)
    val granted = client.permissionController.getGrantedPermissions()
    val zone = ZoneId.systemDefault()
    val n = days.coerceIn(1, 60)
    val endDay = LocalDate.now(zone).plusDays(1)
    val startDay = endDay.minusDays(n.toLong())
    val totals = sortedMapOf<String, MutableMap<String, Any>>()
    fun day(d: LocalDate) = totals.getOrPut(d.toString()) { mutableMapOf("date" to d.toString()) }

    if (HealthPermission.getReadPermission(StepsRecord::class) in granted) {
      val groups = client.aggregateGroupByPeriod(
        AggregateGroupByPeriodRequest(
          metrics = setOf(StepsRecord.COUNT_TOTAL),
          timeRangeFilter = TimeRangeFilter.between(startDay.atStartOfDay(), endDay.atStartOfDay()),
          timeRangeSlicer = Period.ofDays(1),
        ),
      )
      for (g in groups) {
        val steps = g.result[StepsRecord.COUNT_TOTAL] ?: continue
        day(g.startTime.toLocalDate())["steps"] = steps.toDouble()
      }
    }

    if (HealthPermission.getReadPermission(SleepSessionRecord::class) in granted) {
      val from = startDay.atStartOfDay(zone).toInstant().minus(Duration.ofHours(12))
      val to = endDay.atStartOfDay(zone).toInstant()
      val sleep = client.readRecords(ReadRecordsRequest(SleepSessionRecord::class, TimeRangeFilter.between(from, to)))
      val minutes = mutableMapOf<LocalDate, Long>()
      for (s in sleep.records) {
        val d = s.endTime.atZone(zone).toLocalDate()
        if (d.isBefore(startDay)) continue
        minutes[d] = (minutes[d] ?: 0L) + Duration.between(s.startTime, s.endTime).toMinutes()
      }
      for ((d, m) in minutes) day(d)["sleep_minutes"] = m.coerceAtMost(24 * 60).toDouble()
    }

    if (HealthPermission.getReadPermission(RestingHeartRateRecord::class) in granted) {
      val from = startDay.atStartOfDay(zone).toInstant()
      val to = endDay.atStartOfDay(zone).toInstant()
      val hr = client.readRecords(ReadRecordsRequest(RestingHeartRateRecord::class, TimeRangeFilter.between(from, to)))
      val sums = mutableMapOf<LocalDate, Pair<Long, Int>>()
      for (r in hr.records) {
        val d = r.time.atZone(zone).toLocalDate()
        val (sum, count) = sums[d] ?: Pair(0L, 0)
        sums[d] = Pair(sum + r.beatsPerMinute, count + 1)
      }
      for ((d, sc) in sums) if (sc.second > 0) day(d)["resting_hr"] = Math.round(sc.first.toDouble() / sc.second).toDouble()
    }
    return totals.values.map { it.toMap() }
  }
}
