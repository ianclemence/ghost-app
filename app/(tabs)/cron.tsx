import {
  Clock,
  ListChecks,
  Pause,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Trash2,
  X,
} from "lucide-react-native";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import DateTimePicker from "@react-native-community/datetimepicker";

import { Colors, Fonts, Ghost, Radius, UI } from "@/constants/theme";
import {
  createCronJob,
  CronJob,
  CronJobCreateInput,
  CronSchedule,
  deleteCronJob,
  fetchCronJobs,
  onWSMessage,
  pauseCronJob,
  resumeCronJob,
  runCronJobNow,
  updateCronJob,
} from "../../lib/ghostApi";
import { useGhostStore } from "../../lib/store";
import { ConnectionPill, EmptyState } from "@/components/ghost";

const C = Colors.dark;
const FONT_MONO = Fonts.mono;
const FONT_SANS = Fonts.sans;

function TaskModal({
  visible,
  title,
  message,
  onClose,
}: {
  visible: boolean;
  title: string;
  message: string;
  onClose: () => void;
}) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <TouchableOpacity style={styles.modalBackdrop} onPress={onClose} />
      <View style={styles.modalContent}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>{title}</Text>
          <TouchableOpacity onPress={onClose}>
            <X size={20} color={C.text} />
          </TouchableOpacity>
        </View>
        <View style={styles.modalBody}>
          <Text style={styles.modalMessage}>{message}</Text>
          <TouchableOpacity style={styles.modalButton} onPress={onClose}>
            <Text style={styles.modalButtonText}>OK</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

function TaskFormModal({
  visible,
  initial,
  onClose,
  onSave,
  saving,
}: {
  visible: boolean;
  initial: CronJob | null;
  onClose: () => void;
  onSave: (input: CronJobCreateInput) => Promise<void>;
  saving: boolean;
}) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"every" | "cron" | "at">("every");
  const [everySec, setEverySec] = useState("3600");
  const [cronExpr, setCronExpr] = useState("0 9 * * *");
  const [atDate, setAtDate] = useState<Date | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [message, setMessage] = useState("");
  const [command, setCommand] = useState("");
  const [deliver, setDeliver] = useState(false);
  const [showAdvancedForm, setShowAdvancedForm] = useState(false);

  useEffect(() => {
    if (!visible) return;
    if (initial) {
      setName(initial.name);
      setKind(
        initial.schedule.kind === "cron"
          ? "cron"
          : initial.schedule.kind === "at"
            ? "at"
            : "every",
      );
      setEverySec(
        String(Math.round((initial.schedule.everyMs ?? 3600000) / 1000)),
      );
      setCronExpr(initial.schedule.expr || "0 9 * * *");
      setAtDate(initial.schedule.atMs ? new Date(initial.schedule.atMs) : null);
      setMessage(initial.payload.message ?? "");
      setCommand(initial.payload.command ?? "");
      setDeliver(initial.payload.deliver ?? false);
    } else {
      setName("");
      setKind("every");
      setEverySec("3600");
      setCronExpr("0 9 * * *");
      setAtDate(null);
      setMessage("");
      setCommand("");
      setDeliver(false);
    }
  }, [visible, initial]);

  const submit = () => {
    const trimmedName = name.trim();
    if (!trimmedName) return;
    const schedule: CronSchedule =
      kind === "every"
        ? {
            kind: "every",
            everyMs: Math.max(5, parseInt(everySec, 10) || 3600) * 1000,
          }
        : kind === "at"
          ? { kind: "at", atMs: atDate?.getTime() ?? 0 }
          : { kind: "cron", expr: cronExpr.trim() };
    const input: CronJobCreateInput = {
      name: trimmedName,
      schedule,
      message: message.trim(),
      command: command.trim() || undefined,
      deliver,
      channel: deliver ? "mobile" : undefined,
    };
    void onSave(input);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <TouchableOpacity style={styles.modalBackdrop} onPress={onClose} />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.formModal}
      >
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>
            {initial ? "Edit Task" : "New Task"}
          </Text>
          <TouchableOpacity onPress={onClose}>
            <X size={20} color={C.text} />
          </TouchableOpacity>
        </View>
        <ScrollView
          style={styles.formBody}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.fieldLabel}>NAME</Text>
          <TextInput
            style={styles.fieldInput}
            value={name}
            onChangeText={setName}
            placeholder="Morning briefing"
            placeholderTextColor={C.icon}
          />

          <Text style={styles.fieldLabel}>SCHEDULE</Text>
          <View style={styles.kindRow}>
            {(showAdvancedForm
              ? (["every", "at", "cron"] as const)
              : (["every"] as const)
            ).map((k) => (
              <TouchableOpacity
                key={k}
                style={[
                  styles.kindBtn,
                  kind === k && styles.kindBtnActive,
                ]}
                onPress={() => setKind(k)}
              >
                <Text
                  style={[
                    styles.kindBtnText,
                    kind === k && { color: C.terminalGreen },
                  ]}
                >
                  {k.toUpperCase()}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {kind === "every" ? (
            <>
              <Text style={styles.fieldLabel}>EVERY (SECONDS)</Text>
              <TextInput
                style={styles.fieldInput}
                value={everySec}
                onChangeText={setEverySec}
                keyboardType="numeric"
                placeholder="3600"
                placeholderTextColor={C.icon}
              />
              <View style={styles.chipRow}>
                {[
                  { label: "5 min", v: 300 },
                  { label: "30 min", v: 1800 },
                  { label: "1 hour", v: 3600 },
                  { label: "6 hours", v: 21600 },
                  { label: "1 day", v: 86400 },
                ].map((c) => (
                  <TouchableOpacity
                    key={c.v}
                    style={[
                      styles.chip,
                      Number(everySec) === c.v && styles.chipActive,
                    ]}
                    onPress={() => setEverySec(String(c.v))}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        Number(everySec) === c.v && { color: C.terminalGreen },
                      ]}
                    >
                      {c.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={styles.fieldHint}>
                e.g. 3600 = hourly, 86400 = daily
              </Text>
            </>
          ) : kind === "at" ? (
            <>
              <Text style={styles.fieldLabel}>FIRE ONCE AT</Text>
              <TouchableOpacity
                style={styles.dateBtn}
                onPress={() => setShowDatePicker(true)}
              >
                <Clock size={14} color={C.terminalGreen} />
                <Text style={styles.dateBtnText}>
                  {atDate
                    ? atDate.toLocaleString([], {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    : "Pick a date & time"}
                </Text>
              </TouchableOpacity>
              {showDatePicker && (
                <DateTimePicker
                  value={atDate ?? new Date(Date.now() + 3600_000)}
                  mode="datetime"
                  display={Platform.OS === "ios" ? "spinner" : "default"}
                  minimumDate={new Date(Date.now() - 60_000)}
                  onChange={(event, date) => {
                    if (Platform.OS === "android") setShowDatePicker(false);
                    if (event.type === "set" && date) setAtDate(date);
                  }}
                />
              )}
              <Text style={styles.fieldHint}>
                Runs one time at the selected moment, then completes.
              </Text>
            </>
          ) : (
            <>
              <Text style={styles.fieldLabel}>CRON EXPRESSION</Text>
              <TextInput
                style={styles.fieldInput}
                value={cronExpr}
                onChangeText={setCronExpr}
                placeholder="0 9 * * *"
                placeholderTextColor={C.icon}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <Text style={styles.fieldHint}>
                e.g. 0 9 * * * = every day at 09:00
              </Text>
            </>
          )}

          <Text style={styles.fieldLabel}>MESSAGE (what Ghost should do)</Text>
          <TextInput
            style={[styles.fieldInput, styles.fieldMultiline]}
            value={message}
            onChangeText={setMessage}
            placeholder="Summarize my notes for today"
            placeholderTextColor={C.icon}
            multiline
          />

          {showAdvancedForm && (
            <>
              <Text style={styles.fieldLabel}>
                COMMAND (optional, runs directly)
              </Text>
              <TextInput
                style={[styles.fieldInput, styles.fieldMultiline]}
                value={command}
                onChangeText={setCommand}
                placeholder="df -h"
                placeholderTextColor={C.icon}
                autoCapitalize="none"
                autoCorrect={false}
                multiline
              />
            </>
          )}

          <View style={styles.toggleRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.toggleLabel}>ADVANCED</Text>
              <Text style={styles.fieldHint}>
                Cron syntax, one-time schedules & direct commands
              </Text>
            </View>
            <Switch
              value={showAdvancedForm}
              onValueChange={setShowAdvancedForm}
              trackColor={{ false: C.border, true: Ghost.accentSoft }}
              thumbColor={showAdvancedForm ? Ghost.accent : C.icon}
            />
          </View>

          <View style={styles.toggleRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.toggleLabel}>DELIVER RESPONSE</Text>
              <Text style={styles.fieldHint}>Push the result to this app</Text>
            </View>
            <Switch
              value={deliver}
              onValueChange={setDeliver}
              trackColor={{
                false: C.border,
                true: "Ghost.accentSoft",
              }}
              thumbColor={deliver ? C.terminalGreen : C.icon}
            />
          </View>

          <TouchableOpacity
            style={[styles.saveBtn, (saving || !name.trim()) && { opacity: 0.6 }]}
            onPress={submit}
            disabled={saving || !name.trim()}
          >
            {saving ? (
              <ActivityIndicator color={C.background} size="small" />
            ) : (
              <Text style={styles.saveBtnText}>
                {initial ? "Save Changes" : "Create Task"}
              </Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function timeAgo(date: number | string | Date): string {
  const seconds = Math.floor(
    (new Date().getTime() - new Date(date).getTime()) / 1000,
  );
  let interval = seconds / 31536000;
  if (interval > 1) return Math.floor(interval) + "y ago";
  interval = seconds / 2592000;
  if (interval > 1) return Math.floor(interval) + "mo ago";
  interval = seconds / 86400;
  if (interval > 1) return Math.floor(interval) + "d ago";
  interval = seconds / 3600;
  if (interval > 1) return Math.floor(interval) + "h ago";
  interval = seconds / 60;
  if (interval > 1) return Math.floor(interval) + "m ago";
  return Math.floor(seconds) + "s ago";
}

function humanSchedule(job: CronJob): string {
  const s = job.schedule;
  if (s.kind === "every") {
    const secs = (s.everyMs ?? 0) / 1000;
    if (secs % 86400 === 0)
      return `Every ${secs / 86400} day${secs / 86400 > 1 ? "s" : ""}`;
    if (secs % 3600 === 0)
      return `Every ${secs / 3600} hour${secs / 3600 > 1 ? "s" : ""}`;
    if (secs % 60 === 0) return `Every ${secs / 60} min`;
    return `Every ${secs}s`;
  }
  if (s.kind === "at") {
    const d = new Date(s.atMs ?? 0);
    return `Once · ${d.toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })}`;
  }
  return "Custom schedule";
}

function JobCard({
  job,
  onAction,
  onEdit,
  onDelete,
}: {
  job: CronJob;
  onAction: (id: string, action: "pause" | "resume" | "run") => void;
  onEdit: (job: CronJob) => void;
  onDelete: (job: CronJob) => void;
}) {
  const isPaused = job.lifecycle_state === "paused";
  const statusColor = isPaused
    ? C.icon
    : job.state.lastStatus === "error"
      ? C.error
      : C.terminalGreen;

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.jobName}>{job.name}</Text>
          <Text style={styles.jobSchedule}>{humanSchedule(job)}</Text>
        </View>
        <View
          style={[
            styles.statusBadge,
            {
              borderColor: statusColor,
              backgroundColor: isPaused ? "transparent" : `${statusColor}20`,
            },
          ]}
        >
          <Text style={[styles.statusText, { color: statusColor }]}>
            {job.lifecycle_state.toUpperCase()}
          </Text>
        </View>
      </View>

      <View style={styles.statsRow}>
        {job.payload.command ? (
          <Text style={styles.commandText} numberOfLines={2}>
            {job.payload.command}
          </Text>
        ) : null}
        <Text style={styles.statText}>
          Run: {job.run_count} • Last:{" "}
          {job.state.lastRunAtMs ? timeAgo(job.state.lastRunAtMs) : "Never"}
        </Text>
        {job.state.lastError ? (
          <Text style={[styles.statText, { color: C.error }]}>
            Error: {job.state.lastError}
          </Text>
        ) : null}
      </View>

      <View style={styles.actionsRow}>
        <TouchableOpacity
          style={[styles.actionBtn, styles.runBtn]}
          onPress={() => onAction(job.id, "run")}
        >
          <Play size={12} color={C.terminalGreen} style={{ marginRight: 6 }} />
          <Text style={styles.runBtnText}>Run Now</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionBtn, styles.editBtn]}
          onPress={() => onEdit(job)}
        >
          <Pencil size={12} color={C.text} style={{ marginRight: 6 }} />
          <Text style={styles.editBtnText}>Edit</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionBtn, styles.deleteBtn]}
          onPress={() => onDelete(job)}
        >
          <Trash2 size={12} color={C.error} style={{ marginRight: 6 }} />
          <Text style={styles.deleteBtnText}>Delete</Text>
        </TouchableOpacity>

        {isPaused ? (
          <TouchableOpacity
            style={[styles.actionBtn, styles.resumeBtn]}
            onPress={() => onAction(job.id, "resume")}
          >
            <RotateCcw
              size={12}
              color={C.terminalGreen}
              style={{ marginRight: 6 }}
            />
            <Text style={styles.resumeBtnText}>Resume</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.actionBtn, styles.pauseBtn]}
            onPress={() => onAction(job.id, "pause")}
          >
            <Pause size={12} color={C.icon} style={{ marginRight: 6 }} />
            <Text style={styles.pauseBtnText}>Pause</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

export default function CronScreen() {
  const insets = useSafeAreaInsets();
  const { config, connectionState } = useGhostStore();
  const [jobs, setJobs] = useState<CronJob[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [formVisible, setFormVisible] = useState(false);
  const [editingJob, setEditingJob] = useState<CronJob | null>(null);
  const [saving, setSaving] = useState(false);
  const [taskModal, setTaskModal] = useState<{
    visible: boolean;
    title: string;
    message: string;
  }>({
    visible: false,
    title: "",
    message: "",
  });

  const loadJobs = useCallback(
    async (showSilent = false) => {
      if (!config) return;
      if (!showSilent) setLoading(true);
      try {
        const list = await fetchCronJobs(config);
        setJobs(list);
      } catch (e) {
        console.warn("Failed to load jobs", e);
      } finally {
        if (!showSilent) setLoading(false);
      }
    },
    [config],
  );

  useEffect(() => {
    loadJobs();

    // Listen for WebSocket updates for cron jobs
    const unsub = onWSMessage((msg: any) => {
      if (msg.type === "cron_update" || msg.metadata?.type === "cron_update") {
        console.log("Cron update received, refreshing list...");
        loadJobs(true); // Silent refresh for background updates
      }
    });

    return () => unsub();
  }, [loadJobs]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadJobs();
    setRefreshing(false);
  };

  const handleAction = async (
    id: string,
    action: "pause" | "resume" | "run",
  ) => {
    if (!config) return;
    // Optimistic update
    const oldJobs = [...jobs];
    if (action !== "run") {
      setJobs((prev) =>
        prev.map((j) => {
          if (j.id !== id) return j;
          return {
            ...j,
            lifecycle_state: action === "pause" ? "paused" : "active",
          };
        }),
      );
    }

    try {
      if (action === "pause") {
        await pauseCronJob(config, id);
      } else if (action === "resume") {
        await resumeCronJob(config, id);
      } else {
        await runCronJobNow(config, id);
      }
      if (action === "run") {
        setTaskModal({
          visible: true,
          title: "Task Triggered",
          message: "Job triggered successfully.",
        });
      }
      // Reload to get exact state
      setTimeout(loadJobs, 500);
    } catch (e: any) {
      setTaskModal({
        visible: true,
        title: "Task Error",
        message: e?.message || "Failed to perform task action.",
      });
      setJobs(oldJobs); // Revert
    }
  };

  const openCreate = () => {
    setEditingJob(null);
    setFormVisible(true);
  };

  const openEdit = (job: CronJob) => {
    setEditingJob(job);
    setFormVisible(true);
  };

  const handleSave = async (input: CronJobCreateInput) => {
    if (!config || saving) return;
    setSaving(true);
    try {
      if (editingJob) {
        await updateCronJob(config, editingJob.id, {
          name: input.name,
          schedule: input.schedule,
          message: input.message,
          command: input.command,
          deliver: input.deliver,
          channel: input.channel,
        });
      } else {
        await createCronJob(config, input);
      }
      setFormVisible(false);
      loadJobs(true);
    } catch (e: any) {
      setTaskModal({
        visible: true,
        title: editingJob ? "Edit Failed" : "Create Failed",
        message: e?.message || "Failed to save task.",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (job: CronJob) => {
    if (!config) return;
    Alert.alert(
      "Delete Task",
      `Permanently delete "${job.name}"?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteCronJob(config, job.id);
              loadJobs(true);
            } catch (e: any) {
              setTaskModal({
                visible: true,
                title: "Delete Failed",
                message: e?.message || "Failed to delete task.",
              });
            }
          },
        },
      ],
    );
  };

  if (!config) {
    return (
      <View
        style={[styles.container, styles.centered, { paddingTop: insets.top }]}
      >
        <EmptyState
          icon={<ListChecks size={34} color={Ghost.accent} />}
          title="You’re not connected"
          subtitle="Connect to your Ghost to schedule what it does."
        />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <ListChecks size={20} color={Ghost.accent} />
          <Text style={styles.headerTitle}>Activity</Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <ConnectionPill
            connected={connectionState === "online"}
            degraded={connectionState === "syncing"}
          />
          <TouchableOpacity onPress={openCreate} style={styles.newTaskBtn}>
            <Plus size={16} color={Ghost.accentInk} />
            <Text style={styles.newTaskBtnText}>New</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => loadJobs()} disabled={loading}>
            {loading ? (
              <ActivityIndicator color={Ghost.accent} size="small" />
            ) : (
              <RefreshCw size={18} color={Ghost.text.secondary} />
            )}
          </TouchableOpacity>
        </View>
      </View>

      <FlatList
        data={jobs}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <JobCard
            job={item}
            onAction={handleAction}
            onEdit={openEdit}
            onDelete={handleDelete}
          />
        )}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={C.terminalGreen}
          />
        }
        ListEmptyComponent={
          loading && jobs.length === 0 ? (
            <View style={{ marginTop: 100, alignItems: "center" }}>
              <ActivityIndicator color={C.terminalGreen} size="large" />
              <Text style={[styles.emptyText, { marginTop: 20 }]}>
                Loading tasks...
              </Text>
            </View>
          ) : !loading ? (
            <Text style={styles.emptyText}>No active schedules found.</Text>
          ) : null
        }
      />
      <TaskModal
        visible={taskModal.visible}
        title={taskModal.title}
        message={taskModal.message}
        onClose={() =>
          setTaskModal({ visible: false, title: "", message: "" })
        }
      />
      <TaskFormModal
        visible={formVisible}
        initial={editingJob}
        onClose={() => setFormVisible(false)}
        onSave={handleSave}
        saving={saving}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.background },
  centered: { justifyContent: "center", alignItems: "center", flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: UI.spacing.screenX,
    paddingVertical: UI.spacing.headerY,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  headerTitle: {
    fontFamily: FONT_SANS,
    fontSize: 16,
    fontWeight: "700",
    color: C.terminalGreen,
    letterSpacing: 1,
  },
  noConfigTitle: {
    color: C.terminalGreen,
    fontSize: 18,
    fontWeight: "700",
    fontFamily: FONT_SANS,
  },
  noConfigSub: {
    color: C.icon,
    fontSize: 13,
    marginTop: 8,
    fontFamily: FONT_SANS,
  },
  listContent: { padding: UI.spacing.section, gap: UI.spacing.section },
  card: {
    backgroundColor: C.card,
    borderRadius: UI.radius.panel,
    borderWidth: 1,
    borderColor: C.border,
    padding: UI.spacing.card,
    gap: 12,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  jobName: {
    color: C.text,
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 4,
    fontFamily: FONT_SANS,
  },
  jobSchedule: {
    color: C.icon,
    fontSize: 11,
    fontFamily: FONT_SANS,
  },
  statusBadge: {
    borderWidth: 1,
    borderRadius: 0,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  statusText: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5,
    fontFamily: FONT_SANS,
  },
  statsRow: {
    flexDirection: "column",
    gap: 6,
  },
  statText: {
    color: C.icon,
    fontSize: 11,
    fontFamily: FONT_SANS,
  },
  commandText: {
    color: C.text,
    fontSize: 11,
    fontFamily: FONT_SANS,
    backgroundColor: "#ffffff08",
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: C.border,
  },
  actionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 4,
  },
  actionBtn: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 0,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    flexGrow: 1,
    flexBasis: "46%",
    flexDirection: "row",
  },
  runBtn: {
    borderColor: C.terminalGreen,
    backgroundColor: "rgba(74, 222, 128, 0.1)",
  },
  runBtnText: {
    color: C.terminalGreen,
    fontSize: 11,
    fontWeight: "700",
    fontFamily: FONT_SANS,
  },
  pauseBtn: {
    borderColor: C.icon,
  },
  pauseBtnText: {
    color: C.icon,
    fontSize: 11,
    fontWeight: "700",
    fontFamily: FONT_SANS,
  },
  resumeBtn: {
    borderColor: C.terminalGreen,
  },
  resumeBtnText: {
    color: C.terminalGreen,
    fontSize: 11,
    fontWeight: "700",
    fontFamily: FONT_SANS,
  },
  editBtn: {
    borderColor: C.icon,
  },
  editBtnText: {
    color: C.text,
    fontSize: 11,
    fontWeight: "700",
    fontFamily: FONT_SANS,
  },
  deleteBtn: {
    borderColor: C.error,
  },
  deleteBtnText: {
    color: C.error,
    fontSize: 11,
    fontWeight: "700",
    fontFamily: FONT_SANS,
  },
  newTaskBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: C.terminalGreen,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  newTaskBtnText: {
    color: C.background,
    fontFamily: FONT_SANS,
    fontSize: 11,
    fontWeight: "700",
  },
  formModal: {
    position: "absolute",
    top: 60,
    left: 20,
    right: 20,
    maxHeight: "80%",
    backgroundColor: C.background,
    borderWidth: 1,
    borderColor: C.terminalGreen,
    borderRadius: UI.radius.panel,
  },
  formBody: {
    padding: UI.modal.bodyPadding,
    backgroundColor: C.card,
  },
  fieldLabel: {
    color: C.icon,
    fontSize: UI.typography.meta,
    letterSpacing: 1.2,
    fontFamily: FONT_SANS,
    fontWeight: "700",
    marginTop: 12,
    marginBottom: 6,
  },
  fieldInput: {
    backgroundColor: "#ffffff08",
    borderWidth: 1,
    borderColor: C.border,
    color: C.text,
    fontFamily: FONT_SANS,
    fontSize: 13,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  fieldMultiline: {
    minHeight: 64,
    textAlignVertical: "top",
  },
  fieldHint: {
    color: C.icon,
    fontSize: 10,
    fontFamily: FONT_SANS,
    marginTop: 4,
  },
  kindRow: {
    flexDirection: "row",
    gap: 8,
  },
  kindBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: C.border,
    paddingVertical: 8,
    alignItems: "center",
  },
  kindBtnActive: {
    borderColor: C.terminalGreen,
    backgroundColor: "rgba(74, 222, 128, 0.1)",
  },
  kindBtnText: {
    color: C.icon,
    fontFamily: FONT_SANS,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 8,
  },
  chip: {
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  chipActive: {
    borderColor: C.terminalGreen,
    backgroundColor: "rgba(74, 222, 128, 0.1)",
  },
  chipText: {
    color: C.icon,
    fontFamily: FONT_SANS,
    fontSize: 10,
    fontWeight: "700",
  },
  dateBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#ffffff08",
    borderWidth: 1,
    borderColor: C.border,
    color: C.text,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  dateBtnText: {
    color: C.text,
    fontFamily: FONT_SANS,
    fontSize: 13,
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 14,
    paddingVertical: 6,
  },
  toggleLabel: {
    color: C.text,
    fontFamily: FONT_SANS,
    fontSize: 12,
    fontWeight: "700",
  },
  saveBtn: {
    marginTop: 16,
    backgroundColor: C.terminalGreen,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
  },
  saveBtnText: {
    color: C.background,
    fontFamily: FONT_SANS,
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  emptyText: {
    color: C.icon,
    textAlign: "center",
    marginTop: 40,
    fontSize: 14,
    fontFamily: FONT_SANS,
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: UI.modal.backdrop,
  },
  modalContent: {
    position: "absolute",
    top: UI.modal.top,
    left: UI.modal.side,
    right: UI.modal.side,
    backgroundColor: C.background,
    borderWidth: 1,
    borderColor: C.terminalGreen,
    borderRadius: UI.radius.panel,
    padding: 0,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: UI.modal.headerPadding,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    backgroundColor: C.card,
  },
  modalTitle: {
    color: C.terminalGreen,
    fontFamily: FONT_SANS,
    fontSize: 14,
    fontWeight: "700",
    letterSpacing: 1,
  },
  modalBody: {
    padding: UI.modal.bodyPadding,
    backgroundColor: C.card,
    gap: 14,
  },
  modalMessage: {
    color: C.text,
    fontFamily: FONT_SANS,
    fontSize: 13,
    lineHeight: 18,
  },
  modalButton: {
    alignSelf: "flex-end",
    backgroundColor: C.terminalGreen,
    paddingVertical: UI.modal.buttonY,
    paddingHorizontal: UI.modal.buttonX,
  },
  modalButtonText: {
    color: C.background,
    fontFamily: FONT_SANS,
    fontWeight: "700",
    fontSize: 12,
  },
});
