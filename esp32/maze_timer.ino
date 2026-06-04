/*
 * ASU Maze Competition – ESP32 Timer Firmware
 *
 * Hardware:
 *   GPIO 19 → START IR sensor (active-LOW on beam break)
 *   GPIO 18 → STOP  IR sensor (active-LOW on beam break)
 *
 * Flow:
 *   1. Boot → connect WiFi → fetch active team → send READY event
 *   2. START beam broken → ISR captures startMs → loop sends STARTED event
 *   3. STOP  beam broken → ISR captures finishMs → loop sends FINISHED event + saves run
 *   4. Poll settings every SETTINGS_POLL_MS when idle (not timing)
 */

#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

// ── WiFi ─────────────────────────────────────────────────────────────────────
const char* WIFI_SSID     = "Moh'dQasem_2.4Ghz";
const char* WIFI_PASSWORD = "T%ufmvn4";

// ── Supabase ──────────────────────────────────────────────────────────────────
const char* SUPABASE_URL = "https://qdazjbrfytdtpklgxeyg.supabase.co";
const char* SUPABASE_KEY = "sb_publishable_IKkvtQe200-M5FtSgue1Vw_Z8myoTH-";

// ── Sensor pins ───────────────────────────────────────────────────────────────
const int PIN_START = 19;
const int PIN_STOP  = 18;

// ── Timing constants ──────────────────────────────────────────────────────────
// How long to ignore the same sensor after it fires (prevents optical noise).
// 300 ms is plenty to filter bounce; well under any realistic maze finish time.
const unsigned long DEBOUNCE_MS      = 300;
const unsigned long SETTINGS_POLL_MS = 3000;
const int           HTTP_TIMEOUT_MS  = 5000;   // abort hung requests

// ── ISR-shared state (written in ISR, read in loop) ───────────────────────────
// All volatile; reads in loop() must be done inside a critical section.
volatile bool          startFired          = false;
volatile bool          stopFired           = false;
volatile bool          isTiming            = false;
volatile unsigned long startMs             = 0;
volatile unsigned long stopMs              = 0;
volatile unsigned long lastStartDebounceMs = 0;
volatile unsigned long lastStopDebounceMs  = 0;

// ── Non-ISR state ────────────────────────────────────────────────────────────
String activeTeamId   = "";
String activeTeamName = "No active team";
unsigned long lastSettingsPoll = 0;

// ─────────────────────────────────────────────────────────────────────────────
// ISR handlers — MUST be fast; no Serial, no malloc, no blocking calls
// ─────────────────────────────────────────────────────────────────────────────

void IRAM_ATTR onStartSensor() {
  unsigned long now = millis();
  if (!isTiming && (now - lastStartDebounceMs > DEBOUNCE_MS)) {
    startMs             = now;
    isTiming            = true;
    startFired          = true;
    lastStartDebounceMs = now;
  }
}

void IRAM_ATTR onStopSensor() {
  unsigned long now = millis();
  if (isTiming && (now - lastStopDebounceMs > DEBOUNCE_MS)) {
    stopMs             = now;
    isTiming           = false;
    stopFired          = true;
    lastStopDebounceMs = now;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

// Safely snapshot ISR-written unsigned longs without corruption on 32-bit MCU.
// On Xtensa LX6 (ESP32), 32-bit aligned reads are atomic, but we disable
// interrupts anyway for safety when reading pairs of related values together.
struct RunSnapshot { unsigned long start; unsigned long stop; };
RunSnapshot snapshotRun() {
  RunSnapshot s;
  portDISABLE_INTERRUPTS();
  s.start = startMs;
  s.stop  = stopMs;
  portENABLE_INTERRUPTS();
  return s;
}

void attachSupabaseHeaders(HTTPClient& http, bool withJson = false) {
  http.setTimeout(HTTP_TIMEOUT_MS);
  http.addHeader("apikey",        SUPABASE_KEY);
  http.addHeader("Authorization", String("Bearer ") + SUPABASE_KEY);
  if (withJson) {
    http.addHeader("Content-Type", "application/json");
    http.addHeader("Prefer",       "return=minimal");
  }
}

bool wifiReady() {
  return WiFi.status() == WL_CONNECTED;
}

// Non-blocking WiFi check — if disconnected, attempt reconnect once and return.
// The caller is responsible for retrying next loop iteration.
void ensureWiFi() {
  if (wifiReady()) return;
  Serial.println("[WiFi] Disconnected — reconnecting…");
  WiFi.disconnect();
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  // Wait up to 5 s so we don't spam reconnects, but don't block indefinitely.
  unsigned long deadline = millis() + 5000;
  while (WiFi.status() != WL_CONNECTED && millis() < deadline) delay(100);
  if (wifiReady()) Serial.println("[WiFi] Reconnected.");
  else             Serial.println("[WiFi] Still offline — will retry.");
}

// ─────────────────────────────────────────────────────────────────────────────
// Supabase REST calls
// ─────────────────────────────────────────────────────────────────────────────

void fetchActiveTeamName() {
  if (activeTeamId.isEmpty() || !wifiReady()) return;

  HTTPClient http;
  http.begin(String(SUPABASE_URL) + "/rest/v1/maze_teams?id=eq." + activeTeamId + "&select=name");
  attachSupabaseHeaders(http);

  int code = http.GET();
  if (code == 200) {
    JsonDocument doc;
    DeserializationError err = deserializeJson(doc, http.getString());
    if (!err && doc.size() > 0 && !doc[0]["name"].isNull()) {
      activeTeamName = doc[0]["name"].as<String>();
    }
  } else {
    Serial.printf("[Supabase] fetchTeamName → HTTP %d\n", code);
  }
  http.end();
}

void fetchSettings() {
  if (!wifiReady()) return;

  HTTPClient http;
  http.begin(String(SUPABASE_URL) + "/rest/v1/maze_settings?id=eq.default&select=active_team_id");
  attachSupabaseHeaders(http);

  int code = http.GET();
  if (code == 200) {
    JsonDocument doc;
    if (!deserializeJson(doc, http.getString()) && doc.size() > 0) {
      String newId = doc[0]["active_team_id"].isNull()
                       ? ""
                       : doc[0]["active_team_id"].as<String>();
      if (newId != activeTeamId) {
        activeTeamId   = newId;
        activeTeamName = newId.isEmpty() ? "No active team" : "Loading…";
        fetchActiveTeamName();
        Serial.println("[Settings] Active team → " + activeTeamName);
      }
    }
  } else {
    Serial.printf("[Supabase] fetchSettings → HTTP %d\n", code);
  }
  http.end();
}

// Send a transient event row (drives live UI updates via Realtime).
void sendEvent(const char* status, int timeMs = 0) {
  if (!wifiReady()) return;

  JsonDocument doc;
  if (!activeTeamId.isEmpty()) doc["team_id"]  = activeTeamId;
  doc["team_name"] = activeTeamName;
  doc["status"]    = status;
  if (timeMs > 0) doc["time_ms"] = timeMs;

  String body;
  serializeJson(doc, body);

  HTTPClient http;
  http.begin(String(SUPABASE_URL) + "/rest/v1/maze_events");
  attachSupabaseHeaders(http, true);
  int code = http.POST(body);
  http.end();

  Serial.printf("[Event] %-9s → HTTP %d\n", status, code);
}

// Save an official run record (drives leaderboard updates).
void saveRun(int timeMs) {
  if (!wifiReady() || activeTeamId.isEmpty()) {
    Serial.println("[Run] Skipped — no WiFi or no active team.");
    return;
  }

  JsonDocument doc;
  doc["team_id"] = activeTeamId;
  doc["time_ms"] = timeMs;
  doc["source"]  = "esp32";

  String body;
  serializeJson(doc, body);

  HTTPClient http;
  http.begin(String(SUPABASE_URL) + "/rest/v1/maze_runs");
  attachSupabaseHeaders(http, true);
  int code = http.POST(body);
  http.end();

  Serial.printf("[Run] Saved %d ms → HTTP %d\n", timeMs, code);
}

// ─────────────────────────────────────────────────────────────────────────────
// Arduino entry points
// ─────────────────────────────────────────────────────────────────────────────

void setup() {
  Serial.begin(115200);
  delay(200);  // wait for Serial to settle

  pinMode(PIN_START, INPUT_PULLUP);
  pinMode(PIN_STOP,  INPUT_PULLUP);

  // Block here until WiFi is up — acceptable only at boot.
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("[WiFi] Connecting");
  while (WiFi.status() != WL_CONNECTED) { delay(500); Serial.print('.'); }
  Serial.println("\n[WiFi] Connected — IP: " + WiFi.localIP().toString());

  fetchSettings();

  // Attach interrupts AFTER settings are known so team info is ready on first run.
  attachInterrupt(digitalPinToInterrupt(PIN_START), onStartSensor, FALLING);
  attachInterrupt(digitalPinToInterrupt(PIN_STOP),  onStopSensor,  FALLING);

  sendEvent("READY");
  Serial.println("\n========== SYSTEM READY ==========");
}

void loop() {
  ensureWiFi();

  // ── Handle START sensor trigger ──────────────────────────────────────────
  if (startFired) {
    startFired = false;                 // clear flag first (ISR-safe: bool write is atomic)
    Serial.println("[Timer] START");
    sendEvent("STARTED");
  }

  // ── Handle STOP sensor trigger ───────────────────────────────────────────
  if (stopFired) {
    stopFired = false;

    RunSnapshot snap  = snapshotRun();
    int elapsedMs     = (int)(snap.stop - snap.start);

    Serial.printf("[Timer] STOP — elapsed: %d ms (%.2f s)\n",
                  elapsedMs, elapsedMs / 1000.0f);

    // Send FINISHED event first so the live display updates immediately,
    // then persist the run record for the leaderboard.
    sendEvent("FINISHED", elapsedMs);
    saveRun(elapsedMs);
  }

  // ── Periodic settings poll (only when not timing) ────────────────────────
  if (!isTiming && (millis() - lastSettingsPoll >= SETTINGS_POLL_MS)) {
    lastSettingsPoll = millis();
    fetchSettings();
  }
}
