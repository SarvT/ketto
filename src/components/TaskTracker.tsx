"use client";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
// NOTE: This is a single-file, working starter UI with localStorage persistence
// and in-browser notifications. It follows the glassmorphism style in your
// reference. Hook real Email/WhatsApp + AI later by wiring the provided
// placeholders to your backend (Django/Node) and Gemini/Together AI.
// TailwindCSS is assumed. If not present, add Tailwind to your app.

// ------------------------------------------------------------
// Types
// ------------------------------------------------------------
interface Category {
  key: string;
  label: string;
}

interface RepeatOption {
  key: string;
  label: string;
}

interface Task {
  id: string;
  title: string;
  category: string;
  whenISO: string;
  estimateMin: number;
  repeat: string;
  channels: {
    email: boolean;
    whatsapp: boolean;
    push: boolean;
  };
  done: boolean;
  createdAt: string;
}

interface Log {
  id: string;
  taskId: string;
  title: string;
  whenISO: string;
  outcome: {
    status: string;
    lateMin: number;
    note: string;
  };
  timestamp: string;
}

const CATEGORIES: Category[] = [
  { key: "health", label: "Health" },
  { key: "work", label: "Work" },
  { key: "personal", label: "Personal" },
  { key: "habit", label: "Habit" },
];

const REPEAT: RepeatOption[] = [
  { key: "none", label: "Once" },
  { key: "daily", label: "Daily" },
  { key: "weekdays", label: "Weekdays" },
  { key: "weekly", label: "Weekly" },
];

function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------
function classNames(...a: (string | boolean | undefined)[]): string {
  return a.filter(Boolean).join(" ");
}

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function isDueSoon(whenISO: string, leadMinutes = 1): boolean {
  const now = new Date();
  const when = new Date(whenISO);
  const diffMs = when.getTime() - now.getTime();
  return diffMs > 0 && diffMs <= leadMinutes * 60 * 1000; // within lead time
}

function withinToday(iso: string): boolean {
  const d = new Date(iso);
  const n = new Date();
  return (
    d.getFullYear() === n.getFullYear() &&
    d.getMonth() === n.getMonth() &&
    d.getDate() === n.getDate()
  );
}

function notify(title: string, body: string): void {
  if (typeof window === "undefined") return;
  if (!("Notification" in window)) return;
  if (Notification.permission === "granted") {
    new Notification(title, { body });
  }
}

// Ask for notification permission on mount
function useNotificationPermission(): void {
  useEffect(() => {
    if (!("Notification" in window)) return;
    if (Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);
}

// ------------------------------------------------------------
// Local Storage
// ------------------------------------------------------------
const LS_KEY = "glass_tracker_tasks_v1";
const LS_LOGS_KEY = "glass_tracker_logs_v1";

function loadLS<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function saveLS<T>(key: string, value: T): void {
  localStorage.setItem(key, JSON.stringify(value));
}

// ------------------------------------------------------------
// Root Component
// ------------------------------------------------------------
export default function GlassTaskTracker(): JSX.Element {
  useNotificationPermission();

  const [tasks, setTasks] = useState<Task[]>(() =>
    loadLS(LS_KEY, [
      {
        id: uid(),
        title: "Drink Water",
        category: "health",
        whenISO: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
        estimateMin: 1,
        repeat: "daily",
        channels: { email: false, whatsapp: false, push: true },
        done: false,
        createdAt: new Date().toISOString(),
      },
      {
        id: uid(),
        title: "Deep Work Sprint",
        category: "work",
        whenISO: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        estimateMin: 50,
        repeat: "weekdays",
        channels: { email: true, whatsapp: false, push: true },
        done: false,
        createdAt: new Date().toISOString(),
      },
    ])
  );

  const [logs, setLogs] = useState<Log[]>(() => loadLS(LS_LOGS_KEY, []));
  const [query, setQuery] = useState<string>("");
  const [filterCat, setFilterCat] = useState<string>("all");
  const [showAdd, setShowAdd] = useState<boolean>(false);
  const [view, setView] = useState<string>("weekly");
  const [aiCardOpen, setAiCardOpen] = useState<boolean>(true);

  // Persist
  useEffect(() => saveLS(LS_KEY, tasks), [tasks]);
  useEffect(() => saveLS(LS_LOGS_KEY, logs), [logs]);

  // Reminder checker (every 20s)
  useEffect(() => {
    const t = setInterval(() => {
      const upcoming = tasks.filter(
        (tk) => !tk.done && withinToday(tk.whenISO) && isDueSoon(tk.whenISO, 1)
      );
      upcoming.forEach((u) => {
        notify("Reminder", `${u.title} at ${formatTime(u.whenISO)}`);
      });
    }, 20000);
    return () => clearInterval(t);
  }, [tasks]);

  const filtered = useMemo(() => {
    return tasks
      .filter((t) =>
        filterCat === "all" ? true : t.category === filterCat
      )
      .filter((t) => t.title.toLowerCase().includes(query.toLowerCase()))
      .sort((a, b) => new Date(a.whenISO).getTime() - new Date(b.whenISO).getTime());
  }, [tasks, filterCat, query]);

  // ----------------------------------------------------------
  // Event Handlers
  // ----------------------------------------------------------
  function addTask(task: Task): void {
    setTasks((p) => [...p, task]);
    setShowAdd(false);
  }

  function toggleDone(id: string): void {
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t))
    );
  }

  function removeTask(id: string): void {
    setTasks((prev) => prev.filter((t) => t.id !== id));
  }

  function logOutcome(task: Task, outcome: { status: string; lateMin: number; note: string }): void {
    const entry: Log = {
      id: uid(),
      taskId: task.id,
      title: task.title,
      whenISO: task.whenISO,
      outcome,
      timestamp: new Date().toISOString(),
    };
    setLogs((p) => [entry, ...p]);
  }

  function completeTask(task: Task): void {
    const start = new Date(task.whenISO).getTime();
    const end = Date.now();
    const lateMin = Math.max(0, Math.round((end - start) / 60000));
    const why = lateMin > 0 ? window.prompt(`You were late by ~${lateMin} min. Why?`) : "on-time";
    toggleDone(task.id);
    logOutcome(task, { status: "done", lateMin, note: why || "" });
  }

  // Placeholder: wire these to your backend for Email / WhatsApp
  async function sendReminder(task: Task, channel: string): Promise<void> {
    // Example POST body you can send to your server
    const payload = { taskId: task.id, title: task.title, whenISO: task.whenISO };
    console.log("[stub] sendReminder", channel, payload);
    alert(`${channel.toUpperCase()} reminder would be sent via backend.`);
  }

  // Placeholder AI suggestion (replace with Gemini or Together API)
  function aiSuggestion(): string {
    if (logs.length === 0) return "Log a few tasks and I’ll spot patterns for you.";
    const late = logs.filter((l) => l.outcome?.lateMin > 0);
    if (late.length >= 3) {
      return "I noticed multiple late completions. Try scheduling deep-work tasks before lunch and keep water reminders every 90 min.";
    }
    return "Nice momentum! Consider creating a small habit streak: 3-day run for water + 20-min walk.";
  }

  // ----------------------------------------------------------
  // UI
  // ----------------------------------------------------------
  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-slate-100 p-6 sm:p-10">
      <div className="mx-auto max-w-6xl">
        {/* Top Bar */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="text-3xl sm:text-5xl font-semibold tracking-tight">Your Week</div>
            <span className="text-slate-300/70 hidden sm:block">— Focus, hydrate, move.</span>
          </div>
          <div className="flex gap-2 bg-white/5 backdrop-blur-xl rounded-2xl p-1 shadow-lg shadow-slate-900/30">
            {[("weekly"), ("monthly")].map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={classNames(
                  "px-3 py-1.5 rounded-xl text-sm transition",
                  view === v ? "bg-white/70 text-slate-900" : "text-slate-200 hover:bg-white/10"
                )}
              >
                {v[0].toUpperCase() + v.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Header Card resembling the reference */}
        <motion.div
          layout
          className="relative rounded-3xl p-6 sm:p-8 mb-8 bg-white/10 backdrop-blur-2xl border border-white/10 shadow-2xl shadow-slate-900/40"
        >
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
            <div>
              <div className="text-5xl sm:text-7xl font-semibold leading-none">{new Date().toLocaleString(undefined, { month: 'long' })}</div>
              <div className="text-6xl sm:text-8xl font-bold -mt-2">{new Date().getDate()}</div>
            </div>
            <div className="flex flex-col items-start sm:items-end gap-3 w-full sm:w-auto">
              <div className="flex gap-2 w-full">
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search tasks…"
                  className="flex-1 bg-white/10 focus:bg-white/20 transition outline-none rounded-2xl px-4 py-2 placeholder:text-slate-300/60"
                />
                <select
                  value={filterCat}
                  onChange={(e) => setFilterCat(e.target.value)}
                  className="bg-white/10 rounded-2xl px-3 py-2 outline-none"
                >
                  <option value="all">All</option>
                  {CATEGORIES.map((c) => (
                    <option key={c.key} value={c.key}>{c.label}</option>
                  ))}
                </select>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowAdd(true)}
                  className="rounded-2xl px-4 py-2 bg-white/70 text-slate-900 font-medium hover:bg-white/90 transition"
                >
                  + New Task
                </button>
                <button
                  onClick={() => setAiCardOpen((v) => !v)}
                  className="rounded-2xl px-4 py-2 bg-white/10 text-slate-100 hover:bg-white/20 transition"
                >
                  {aiCardOpen ? "Hide" : "Show"} Coach
                </button>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            <SectionTitle>Today</SectionTitle>
            <AnimatePresence initial={false}>
              {filtered.length === 0 && (
                <EmptyState onAdd={() => setShowAdd(true)} />
              )}
              {filtered.map((t) => (
                <TaskRow
                  key={t.id}
                  task={t}
                  onDone={() => completeTask(t)}
                  onToggle={() => toggleDone(t.id)}
                  onRemove={() => removeTask(t.id)}
                  onChannel={(ch) => sendReminder(t, ch)}
                />
              ))}
            </AnimatePresence>
          </div>

          <div className="space-y-6">
            {aiCardOpen && (
              <AICoachCard suggestion={aiSuggestion()} />
            )}
            <WeeklyInsights tasks={tasks} logs={logs} />
            <History logs={logs} />
          </div>
        </div>

        {showAdd && (
          <AddTaskModal
            onClose={() => setShowAdd(false)}
            onCreate={(payload) => addTask(payload)}
          />
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------
// Subcomponents
// ------------------------------------------------------------
function SectionTitle({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <div className="text-sm uppercase tracking-widest text-slate-300/80 pl-1">
      {children}
    </div>
  );
}

function Chip({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <span className="inline-flex items-center gap-1 rounded-xl px-2 py-1 text-xs bg-white/10 border border-white/10">
      {children}
    </span>
  );
}

interface TaskRowProps {
  task: Task;
  onDone: () => void;
  onToggle: () => void;
  onRemove: () => void;
  onChannel: (channel: string) => void;
}

function TaskRow({ task, onDone, onToggle, onRemove, onChannel }: TaskRowProps): JSX.Element {
  const dueSoon = isDueSoon(task.whenISO, 30);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className={classNames(
        "rounded-3xl p-4 md:p-5 bg-white/10 backdrop-blur-xl border border-white/10",
        "shadow-xl shadow-slate-950/30"
      )}
    >
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={task.done}
            onChange={onToggle}
            className="mt-1 h-5 w-5 accent-white/80"
          />
          <div>
            <div className="text-lg font-medium tracking-tight">
              {task.title}
            </div>
            <div className="flex flex-wrap gap-2 mt-1 text-slate-200/90">
              <Chip>{CATEGORIES.find((c) => c.key === task.category)?.label}</Chip>
              <Chip>⏰ {formatTime(task.whenISO)}</Chip>
              <Chip>⏳ {task.estimateMin}m</Chip>
              <Chip>↻ {REPEAT.find((r) => r.key === task.repeat)?.label}</Chip>
              {dueSoon && <Chip>⚡ Due soon</Chip>}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => onChannel("email")}
            className="rounded-xl px-3 py-2 bg-white/10 hover:bg-white/20 text-sm"
            title="Send Email Reminder"
          >
            📧 Email
          </button>
          <button
            onClick={() => onChannel("whatsapp")}
            className="rounded-xl px-3 py-2 bg-white/10 hover:bg-white/20 text-sm"
            title="Send WhatsApp Reminder"
          >
            💬 WhatsApp
          </button>
          <button
            onClick={onDone}
            className="rounded-xl px-3 py-2 bg-white/80 text-slate-900 font-medium hover:bg-white"
          >
            Mark Done
          </button>
          <button
            onClick={onRemove}
            className="rounded-xl px-3 py-2 bg-white/10 hover:bg-white/20 text-sm"
          >
            Remove
          </button>
        </div>
      </div>
    </motion.div>
  );
}

function AICoachCard({ suggestion }: { suggestion: string }): JSX.Element {
  return (
    <div className="rounded-3xl p-5 bg-white/10 backdrop-blur-xl border border-white/10 shadow-xl shadow-slate-950/30">
      <div className="text-sm uppercase tracking-widest text-slate-300/80 mb-2">AI Coach</div>
      <div className="text-base leading-relaxed">
        {suggestion}
      </div>
      <div className="text-xs text-slate-300/70 mt-3">
        Hook to Gemini/Together: call your backend endpoint like
        <code className="ml-1">/api/ai/suggest</code> with recent logs.
      </div>
    </div>
  );
}

interface WeeklyInsightsProps {
  tasks: Task[];
  logs: Log[];
}

function WeeklyInsights({ tasks, logs }: WeeklyInsightsProps): JSX.Element {
  const todayTasks = tasks.filter((t) => withinToday(t.whenISO));
  const completed = todayTasks.filter((t) => t.done).length;
  const due = todayTasks.length;
  const lateness = logs
    .filter((l) => l.outcome?.lateMin)
    .slice(0, 30)
    .reduce((acc, l) => acc + (l.outcome?.lateMin || 0), 0);

  return (
    <div className="rounded-3xl p-5 bg-white/10 backdrop-blur-xl border border-white/10 shadow-xl shadow-slate-950/30">
      <div className="text-sm uppercase tracking-widest text-slate-300/80 mb-3">Today — Quick Stats</div>
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Tasks" value={String(due)} note="scheduled" />
        <StatCard label="Done" value={String(completed)} note="completed" />
        <StatCard label="Late" value={`~${lateness}m`} note="accumulated" />
      </div>
    </div>
  );
}

interface StatCardProps {
  label: string;
  value: string;
  note: string;
}

function StatCard({ label, value, note }: StatCardProps): JSX.Element {
  return (
    <div className="rounded-2xl p-4 bg-white/5 border border-white/10 text-center">
      <div className="text-slate-300/80 text-xs uppercase tracking-wider">{label}</div>
      <div className="text-3xl font-semibold mt-1">{value}</div>
      <div className="text-slate-300/70 text-xs mt-1">{note}</div>
    </div>
  );
}

function History({ logs }: { logs: Log[] }): JSX.Element {
  return (
    <div className="rounded-3xl p-5 bg-white/10 backdrop-blur-xl border border-white/10 shadow-xl shadow-slate-950/30">
      <div className="text-sm uppercase tracking-widest text-slate-300/80 mb-3">Recent Activity</div>
      {logs.length === 0 ? (
        <div className="text-slate-300/70">No activity yet.</div>
      ) : (
        <div className="space-y-3 max-h-[380px] overflow-auto pr-1">
          {logs.slice(0, 20).map((l) => (
            <div key={l.id} className="rounded-2xl p-3 bg-white/5 border border-white/10">
              <div className="text-sm font-medium">{l.title}</div>
              <div className="text-xs text-slate-300/80">
                {new Date(l.timestamp).toLocaleString()} — {l.outcome?.status}
                {l.outcome?.lateMin > 0 && ` (late ${l.outcome.lateMin}m)`}
              </div>
              {l.outcome?.note && (
                <div className="text-xs text-slate-200/90 mt-1">“{l.outcome.note}”</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }): JSX.Element {
  return (
    <div className="rounded-3xl p-8 bg-white/5 backdrop-blur-xl border border-white/10 text-center">
      <div className="text-xl">No tasks match your filters.</div>
      <button onClick={onAdd} className="mt-4 rounded-2xl px-4 py-2 bg-white/80 text-slate-900 font-medium">
        Add a Task
      </button>
    </div>
  );
}

interface AddTaskModalProps {
  onClose: () => void;
  onCreate: (task: Task) => void;
}

function AddTaskModal({ onClose, onCreate }: AddTaskModalProps): JSX.Element {
  const [title, setTitle] = useState<string>("");
  const [category, setCategory] = useState<string>("health");
  const [when, setWhen] = useState<string>(() => new Date().toISOString().slice(0, 16)); // yyyy-mm-ddThh:mm
  const [repeat, setRepeat] = useState<string>("none");
  const [estimateMin, setEstimateMin] = useState<number>(15);
  const [email, setEmail] = useState<boolean>(false);
  const [whatsapp, setWhatsapp] = useState<boolean>(false);
  const [push, setPush] = useState<boolean>(true);

  function submit(): void {
    if (!title.trim()) return window.alert("Please enter a title");
    const payload: Task = {
      id: uid(),
      title: title.trim(),
      category,
      whenISO: new Date(when).toISOString(),
      estimateMin: Number(estimateMin) || 0,
      repeat,
      channels: { email, whatsapp, push },
      done: false,
      createdAt: new Date().toISOString(),
    };
    onCreate(payload);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-950/70" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -12 }}
        className="relative w-full max-w-lg rounded-3xl p-6 bg-white/10 backdrop-blur-2xl border border-white/10 shadow-2xl"
      >
        <div className="text-xl font-semibold mb-4">New Task</div>
        <div className="space-y-4">
          <div>
            <label className="block text-sm mb-1">Title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-2xl px-3 py-2 bg-white/10 outline-none"
              placeholder="e.g., 20 push-ups / Write report"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm mb-1">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full rounded-2xl px-3 py-2 bg-white/10 outline-none"
              >
                {CATEGORIES.map((c) => (
                  <option key={c.key} value={c.key}>{c.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm mb-1">Estimated Minutes</label>
              <input
                type="number"
                value={estimateMin}
                onChange={(e) => setEstimateMin(Number(e.target.value))}
                className="w-full rounded-2xl px-3 py-2 bg-white/10 outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm mb-1">When</label>
              <input
                type="datetime-local"
                value={when}
                onChange={(e) => setWhen(e.target.value)}
                className="w-full rounded-2xl px-3 py-2 bg-white/10 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm mb-1">Repeat</label>
              <select
                value={repeat}
                onChange={(e) => setRepeat(e.target.value)}
                className="w-full rounded-2xl px-3 py-2 bg-white/10 outline-none"
              >
                {REPEAT.map((r) => (
                  <option key={r.key} value={r.key}>{r.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <div className="text-sm mb-2">Reminder Channels</div>
            <div className="flex flex-wrap gap-2">
              <label className="flex items-center gap-2 bg-white/10 rounded-2xl px-3 py-2">
                <input type="checkbox" checked={email} onChange={(e) => setEmail(e.target.checked)} />
                Email
              </label>
              <label className="flex items-center gap-2 bg-white/10 rounded-2xl px-3 py-2">
                <input type="checkbox" checked={whatsapp} onChange={(e) => setWhatsapp(e.target.checked)} />
                WhatsApp
              </label>
              <label className="flex items-center gap-2 bg-white/10 rounded-2xl px-3 py-2">
                <input type="checkbox" checked={push} onChange={(e) => setPush(e.target.checked)} />
                Push
              </label>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button onClick={onClose} className="rounded-2xl px-4 py-2 bg-white/10 hover:bg-white/20">Cancel</button>
            <button onClick={submit} className="rounded-2xl px-4 py-2 bg-white/80 text-slate-900 font-medium">Create</button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}