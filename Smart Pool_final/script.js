// =======================
// Firebase Config
// =======================
const firebaseConfig = {
  apiKey: "AIzaSyCn_8feuqYk1adlH3vD0M0UyCm5bAqSavA",
  authDomain: "tt-iot-5c88a.firebaseapp.com",
  databaseURL: "https://tt-iot-5c88a-default-rtdb.firebaseio.com",
  projectId: "tt-iot-5c88a",
  storageBucket: "tt-iot-5c88a.firebasestorage.app",
  messagingSenderId: "377354753520",
  appId: "1:377354753520:web:e5089218b8a58c704ab935",
  measurementId: "G-H01SR7DJ3S"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.database();
const fs = firebase.firestore();

// =======================
// HTTP Service 
// =======================
class HTTPService {
  constructor() {
    this.baseURL = 'https://jsonplaceholder.typicode.com'; // Demo API
    this.isConnected = false;
  }

  // Kiểm tra kết nối HTTP
  async checkConnection() {
    try {
      const response = await fetch(`${this.baseURL}/posts/1`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      });
      this.isConnected = response.ok;
      return response.ok;
    } catch (error) {
      this.isConnected = false;
      return false;
    }
  }

  // Gửi dữ liệu sensor qua HTTP (song song với MQTT)
  async sendSensorData(poolId, data) {
    try {
      console.log(`Sending sensor data via HTTP for pool ${poolId}:`, data);
      
      // DEMO: Gửi đến mock API
      const response = await fetch(`${this.baseURL}/posts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          poolId: poolId,
          ...data,
          timestamp: new Date().toISOString(),
          protocol: 'http'
        })
      });
      
      if (response.ok) {
        console.log(`HTTP data sent successfully for pool ${poolId}`);
        return { success: true };
      }
      return { success: false, error: 'HTTP request failed' };
    } catch (error) {
      console.error('HTTP sendSensorData error:', error);
      return { success: false, error: error.message };
    }
  }

  // Lấy cấu hình thiết bị (HTTP tốt cho cấu hình)
  async getDeviceConfig(poolId) {
    try {
      console.log(`Getting device config for pool ${poolId} via HTTP`);
      
      // DEMO: Trả về cấu hình mẫu
      return {
        success: true,
        config: {
          poolId: poolId,
          pressureThreshold: 200,
          temperatureThreshold: 36,
          phThreshold: { min: 7.0, max: 8.0 },
          updateInterval: 5000
        }
      };
    } catch (error) {
      console.error('HTTP getDeviceConfig error:', error);
      return { success: false, error: error.message };
    }
  }
}

// =======================
// WebSocket Service (Đơn giản)
// =======================
class WebSocketService {
  constructor() {
    this.ws = null;
    this.isConnected = false;
  }

  connect(url = 'wss://echo.websocket.org') { // Demo WebSocket server
    try {
      this.ws = new WebSocket(url);
      
      this.ws.onopen = () => {
        console.log('WebSocket connected');
        this.isConnected = true;
        setPill('ws-pill', 'WS: Connected', true);
      };
      
      this.ws.onmessage = (event) => {
        console.log('WebSocket message:', event.data);
        // Có thể xử lý thông báo real-time ở đây
      };
      
      this.ws.onclose = () => {
        console.log('WebSocket disconnected');
        this.isConnected = false;
        setPill('ws-pill', 'WS: Disconnected', false);
      };
      
      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        this.isConnected = false;
        setPill('ws-pill', 'WS: Error', false);
      };
    } catch (error) {
      console.error('WebSocket connection error:', error);
    }
  }

  send(data) {
    if (this.isConnected && this.ws) {
      this.ws.send(JSON.stringify(data));
    }
  }
}

// =======================
// Global Instances
// =======================
const httpService = new HTTPService();
const wsService = new WebSocketService();

// =======================
// Global Variables
// =======================
const chartStyle = {
  pressure:    { label: "Áp suất nước (kPa)", color: "#2f6fed", unit: " kPa" },
  temperature: { label: "Nhiệt độ (°C)",      color: "#ef4444", unit: "°C" },
  ph:          { label: "Độ pH",              color: "#22c55e", unit: " pH" }
};

let charts = {};
let currentChart = {1:"pressure", 2:"pressure", 3:"pressure"};
let history = {1:{}, 2:{}, 3:{}};
let lastSave = {1:{}, 2:{}, 3:{}};

const pauseChart = {
  1: { pressure:false, temperature:false, ph:false },
  2: { pressure:false, temperature:false, ph:false },
  3: { pressure:false, temperature:false, ph:false }
};

const SAVE_INTERVAL_MS = 2000;
const HISTORY_LIMIT = 60;
const ONLINE_MS = 8000;

// =======================
// Utility Functions
// =======================
function setPill(id, text, ok = true) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = text;
  el.classList.toggle("good", ok);
  el.classList.toggle("bad", !ok);
}

function safeNum(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function setButtonUI(btn, label, isOn) {
  if (!btn) return;
  btn.classList.remove("on", "off");
  btn.classList.add(isOn ? "on" : "off");
  btn.textContent = `${label} ${isOn ? "ON" : "OFF"}`;
}

function setOverviewBadge(pool, level, text) {
  const el = document.getElementById(`ov-badge-${pool}`);
  if (!el) return;
  el.classList.remove("ok", "warn", "danger");
  el.classList.add(level);
  el.textContent = text;
}

function setOverviewOnline(pool, online) {
  const t = document.getElementById(`ov-online-${pool}`);
  const dot = document.getElementById(`ov-dot-${pool}`);
  if (t) t.textContent = online ? "Online" : "Offline";
  if (dot) {
    dot.classList.remove("online", "offline");
    dot.classList.add(online ? "online" : "offline");
  }
}

// =======================
// Chart Functions
// =======================
function createChart(pool, type) {
  const canvas = document.getElementById(`main-pool-chart-${pool}`);
  if (!canvas) {
    console.error(`Chart canvas not found for pool ${pool}`);
    return;
  }

  const ctx = canvas.getContext("2d");
  const style = chartStyle[type];

  charts[pool] = new Chart(ctx, {
    type: "line",
    data: {
      datasets: [{
        label: style.label,
        data: [],
        borderColor: style.color,
        backgroundColor: style.color + "20",
        borderWidth: 3,
        fill: true,
        tension: 0.3,
        pointRadius: 4,
        pointHoverRadius: 7
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      scales: {
        x: {
          type: "time",
          time: { unit: "minute", tooltipFormat: "HH:mm:ss" },
          title: { display: true, text: "Thời gian" }
        },
        y: { title: { display: true, text: style.label } }
      },
      plugins: {
        legend: { display: true, position: "top" },
        title: { display: true, text: `Biểu đồ ${style.label}` }
      }
    }
  });
}

function trimHistory(pool, type) {
  const obj = history[pool]?.[type];
  if (!obj) return;
  const keys = Object.keys(obj).sort((a, b) => Number(a) - Number(b));
  while (keys.length > HISTORY_LIMIT) {
    const k = keys.shift();
    delete obj[k];
  }
}

function updateChart(pool) {
  const type = currentChart[pool];
  const chart = charts[pool];
  if (!chart) {
    console.error(`Chart not found for pool ${pool}`);
    return;
  }

  const style = chartStyle[type];
  const bucket = history[pool]?.[type] || {};
  const points = Object.keys(bucket)
    .map(ts => ({ x: Number(ts), y: Number(bucket[ts]) }))
    .sort((a, b) => a.x - b.x);

  chart.data.datasets[0].data = points;
  chart.data.datasets[0].label = style.label;
  chart.data.datasets[0].borderColor = style.color;
  chart.data.datasets[0].backgroundColor = style.color + "20";
  chart.options.plugins.title.text = `Biểu đồ ${style.label}`;
  chart.update();
}

// =======================
// Firestore History
// =======================
async function saveToHistory(pool, type, value) {
  const now = Date.now();
  if (lastSave[pool][type] && now - lastSave[pool][type] < SAVE_INTERVAL_MS) return false;

  try {
    await fs.collection("pool_history").add({
      poolId: pool,
      sensorType: type,
      value: Number(value),
      timestamp: new Date(now)
    });

    history[pool][type] ??= {};
    history[pool][type][now] = Number(value);
    trimHistory(pool, type);
    lastSave[pool][type] = now;

    updateChart(pool);
    return true;
  } catch (e) {
    console.error("Firestore save error:", e);
    return false;
  }
}

async function loadHistory(pool) {
  try {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const snap = await fs.collection("pool_history")
      .where("poolId", "==", pool)
      .where("timestamp", ">=", oneHourAgo)
      .orderBy("timestamp", "asc")
      .get();

    history[pool].pressure ??= {};
    history[pool].temperature ??= {};
    history[pool].ph ??= {};

    snap.forEach(doc => {
      const d = doc.data();
      const ts = d.timestamp?.toDate?.().getTime?.() || 0;
      const type = d.sensorType;
      if (ts && history[pool][type]) {
        history[pool][type][ts] = Number(d.value);
      }
    });

    ["pressure", "temperature", "ph"].forEach(t => trimHistory(pool, t));
    updateChart(pool);
  } catch (e) {
    console.error("Firestore load error:", e);
  }
}

// =======================
// HTTP Helper Functions
// =======================
// Gửi dữ liệu qua HTTP khi có dữ liệu mới
async function sendDataViaHTTP(poolId, sensorData) {
  const result = await httpService.sendSensorData(poolId, sensorData);
  
  if (result.success) {
    console.log(`Pool ${poolId}: Data sent via HTTP successfully`);
  } else {
    console.warn(`Pool ${poolId}: HTTP send failed: ${result.error}`);
  }
}

// =======================
// Overview Watcher
// =======================
function updateOverview(pool, pressure, temp, ph, updatedAt) {
  const pEl = document.getElementById(`ov-pressure-${pool}`);
  const tEl = document.getElementById(`ov-temp-${pool}`);
  const phEl = document.getElementById(`ov-ph-${pool}`);

  if (pEl) pEl.textContent = pressure.toFixed(1) + " kPa";
  if (tEl) tEl.textContent = temp.toFixed(1) + "°C";
  if (phEl) phEl.textContent = ph.toFixed(1) + " pH";

  const online = updatedAt && (Date.now() - updatedAt) <= ONLINE_MS;
  setOverviewOnline(pool, online);

  let level = "ok", text = "OK";
  if (temp >= 36 || pressure >= 200 || ph < 6.5 || ph > 8.5) { 
    level="danger"; text="Cần can thiệp"; 
  }
  else if (temp >= 32 || pressure >= 150 || ph < 7.0 || ph > 8.0) { 
    level="warn"; text="Cảnh báo"; 
  }
  setOverviewBadge(pool, level, text);
}

function watchOverview() {
  [1,2,3].forEach(pool=>{
    db.ref(`sensors-${pool}`).on("value", (snap)=>{
      const d = snap.val() || {};
      const pressure = safeNum(d.pressure, 0);
      const temp = safeNum(d.temperature, 0);
      const ph = safeNum(d.ph, 0);
      const updatedAt = safeNum(d.updatedAt, 0);
      updateOverview(pool, pressure, temp, ph, updatedAt);
      
      // Gửi dữ liệu qua HTTP (song song với MQTT)
      sendDataViaHTTP(pool, {
        pressure: pressure,
        temperature: temp,
        ph: ph,
        updatedAt: updatedAt
      });
    });
  });
}

// =======================
// Pool Initialization
// =======================
function initPool(pool) {
  console.log(`Initializing pool ${pool}`);
  
  history[pool].pressure ??= {};
  history[pool].temperature ??= {};
  history[pool].ph ??= {};
  lastSave[pool] = { pressure:0, temperature:0, ph:0 };

  loadHistory(pool);

  // Kiểm tra các phần tử DOM tồn tại
  const pumpBtn = document.getElementById(`pump-toggle-${pool}`);
  const heaterBtn = document.getElementById(`heater-toggle-${pool}`);
  const co2Btn = document.getElementById(`co2-toggle-${pool}`);
  
  console.log(`Pool ${pool} buttons:`, {
    pumpBtn: !!pumpBtn,
    heaterBtn: !!heaterBtn,
    co2Btn: !!co2Btn
  });

  // devices -> pause + button UI
  db.ref(`devices-${pool}`).on("value", (snap)=>{
    const dev = snap.val() || {};

    // quy ước: 0 = ON, 1 = OFF
    const pumpOn = Number(dev.pump ?? 0) === 0;
    const heaterOn = Number(dev.heater ?? 0) === 0;
    const co2On = Number(dev.co2 ?? 0) === 0;

    pauseChart[pool].pressure = !pumpOn;
    pauseChart[pool].temperature = !heaterOn;
    pauseChart[pool].ph = !co2On;

    setButtonUI(pumpBtn, "Sóng", pumpOn);
    setButtonUI(heaterBtn, "Nhiệt độ", heaterOn);
    setButtonUI(co2Btn, "Sục CO2", co2On);
  });

  // click -> toggle
  function toggleDevice(key, btn) {
    const isOnNow = btn.classList.contains("on");
    const newState = isOnNow ? 1 : 0;
    db.ref(`devices-${pool}/${key}`).set(newState);
    
    // Gửi command qua WebSocket (nếu có)
    if (wsService.isConnected) {
      wsService.send({
        type: 'device_control',
        poolId: pool,
        device: key,
        state: newState,
        timestamp: Date.now()
      });
    }
  }

  pumpBtn?.addEventListener("click", ()=>toggleDevice("pump", pumpBtn));
  heaterBtn?.addEventListener("click", ()=>toggleDevice("heater", heaterBtn));
  co2Btn?.addEventListener("click", ()=>toggleDevice("co2", co2Btn));

  // sensors -> metrics + save history (respect pause)
  db.ref(`sensors-${pool}`).on("value", async (snap)=>{
    const d = snap.val();
    if (!d) {
      console.log(`No data for pool ${pool}`);
      return;
    }

    const pressure = safeNum(d.pressure, 0);
    const temp = safeNum(d.temperature, 0);
    const ph = safeNum(d.ph, 0);
    
    console.log(`Pool ${pool} data:`, { pressure, temp, ph });

    // Kiểm tra các phần tử metric
    const pressureEl = document.getElementById(`pressure-${pool}`);
    const tempEl = document.getElementById(`temperature-${pool}`);
    const phEl = document.getElementById(`ph-${pool}`);
    
    console.log(`Pool ${pool} metric elements:`, {
      pressureEl: !!pressureEl,
      tempEl: !!tempEl,
      phEl: !!phEl
    });

    // metrics only update if not paused
    if (!pauseChart[pool].pressure && pressureEl) {
      pressureEl.textContent = pressure.toFixed(1) + " kPa";
    }
    if (!pauseChart[pool].temperature && tempEl) {
      tempEl.textContent = temp.toFixed(1) + "°C";
    }
    if (!pauseChart[pool].ph && phEl) {
      phEl.textContent = ph.toFixed(1) + " pH";
    }

    // history only save if not paused
    if (!pauseChart[pool].pressure) await saveToHistory(pool, "pressure", pressure);
    if (!pauseChart[pool].temperature) await saveToHistory(pool, "temperature", temp);
    if (!pauseChart[pool].ph) await saveToHistory(pool, "ph", ph);
  });

  // chart type buttons (within this page)
  const chartBtns = document.querySelectorAll(`#pool-${pool} .chart-btn`);
  console.log(`Pool ${pool} chart buttons:`, chartBtns.length);
  
  chartBtns.forEach(btn=>{
    btn.addEventListener("click", ()=>{
      document.querySelectorAll(`#pool-${pool} .chart-btn`).forEach(b=>b.classList.remove("active"));
      btn.classList.add("active");
      currentChart[pool] = btn.dataset.chart;
      updateChart(pool);
    });
  });
}

// =======================
// Navigation
// =======================
function switchToOverview() {
  document.querySelectorAll(".page").forEach(p=>p.classList.remove("active"));
  document.getElementById("overview")?.classList.add("active");

  document.querySelectorAll(".nav-link").forEach(a=>{
    a.classList.toggle("active", a.dataset.page === "overview");
  });
}

function switchToPool(pool) {
  document.querySelectorAll(".page").forEach(p=>p.classList.remove("active"));
  document.getElementById(`pool-${pool}`)?.classList.add("active");

  document.querySelectorAll(".nav-link").forEach(a=>{
    a.classList.toggle("active", a.dataset.page === `pool-${pool}`);
  });

  if (charts[pool]) {
    charts[pool].resize();
    updateChart(pool);
  }
}

// =======================
// MQTT Configuration
// =======================
//const MQTT_URL = "wss://test.mosquitto.org:8081/mqtt";
//const MQTT_URL = "wss://test.mosquitto.org:8080/mqtt";  // Port 8080 cho unencrypted
const MQTT_URL = "wss://broker.emqx.io:8084/mqtt";

const mqttClient = mqtt.connect(MQTT_URL, {
  clientId: "smartpool-web-" + Math.random().toString(16).slice(2),
  clean: true,
  reconnectPeriod: 5000,
  connectTimeout: 30000,
  keepalive: 60
});

const MQTT_TOPICS = [
  "smartpool/pool1/sensors",
  "smartpool/pool2/sensors",
  "smartpool/pool3/sensors"
];

function publishDemoMQTT() {
  if (!mqttClient.connected) {
    console.log("MQTT not connected, skipping publish");
    return;
  }

  // Biến lưu giá trị cũ để tạo xu hướng
  if (!window.demoValues) {
    window.demoValues = {
      1: { pressure: 150, temperature: 30, ph: 7.5 },
      2: { pressure: 145, temperature: 29, ph: 7.3 },
      3: { pressure: 155, temperature: 31, ph: 7.7 }
    };
  }

  for (let pool = 1; pool <= 3; pool++) {
    const current = window.demoValues[pool];
    
    // Tạo dao động nhẹ (±5-10% so với giá trị hiện tại)
    const pressure = current.pressure + (Math.random() * 20 - 10);
    const temperature = current.temperature + (Math.random() * 2 - 1);
    const ph = current.ph + (Math.random() * 0.4 - 0.2);
    
    // Giới hạn trong phạm vi thực tế
    const clampedPressure = Math.min(Math.max(pressure, 80), 220);
    const clampedTemp = Math.min(Math.max(temperature, 26), 36);
    const clampedPh = Math.min(Math.max(ph, 6.0), 9.0);
    
    // Lưu giá trị mới
    window.demoValues[pool] = {
      pressure: clampedPressure,
      temperature: clampedTemp,
      ph: clampedPh
    };

    const payload = {
      pressure: +clampedPressure.toFixed(1),
      temperature: +clampedTemp.toFixed(1),
      ph: +clampedPh.toFixed(1),
      updatedAt: Date.now()
    };
    
    console.log(`Publishing to pool ${pool}:`, payload);
    mqttClient.publish(`smartpool/pool${pool}/sensors`, JSON.stringify(payload), { qos: 0 });
  }
}

let demoTimer = null;

mqttClient.on("connect", ()=>{
  setPill("mqtt-pill", "MQTT: Connected", true);
  console.log("MQTT connected:", MQTT_URL);

  MQTT_TOPICS.forEach(t=>mqttClient.subscribe(t));
  if (!demoTimer) demoTimer = setInterval(publishDemoMQTT, 2000);
});

mqttClient.on("close", ()=>{
  setPill("mqtt-pill", "MQTT: Disconnected", false);
  console.log("MQTT closed");
  if (demoTimer) { clearInterval(demoTimer); demoTimer = null; }
});

mqttClient.on("error", (e)=>console.error("MQTT error:", e));

mqttClient.on("message", (topic, message)=>{
  try {
    const data = JSON.parse(message.toString());
    const m = topic.match(/pool(\d+)/);
    if (!m) return;
    const pool = Number(m[1]);
    if (pool < 1 || pool > 3) return;

    console.log(`MQTT received for pool ${pool}:`, data);
    
    db.ref(`sensors-${pool}`).update({
      pressure: safeNum(data.pressure, 0),
      temperature: safeNum(data.temperature, 0),
      ph: safeNum(data.ph, 0),
      updatedAt: Date.now()
    });

  } catch (e) {
    console.error("MQTT parse error:", e);
  }
});

// =======================
// Application Start
// =======================
document.addEventListener("DOMContentLoaded", ()=>{
  console.log("DOM loaded, initializing...");
  setPill("firebase-pill", "Firebase: Ready", true);

  // Initialize HTTP service
  httpService.checkConnection().then(connected => {
    setPill("http-pill", connected ? "HTTP: Connected" : "HTTP: Offline", connected);
  });

  // Initialize WebSocket (optional)
  // wsService.connect();

  // clock
  setInterval(()=>{
    const t = new Date().toLocaleTimeString("vi-VN", { hour12:false });
    const el = document.getElementById("time-pill");
    if (el) el.textContent = t;
  }, 500);

  // create charts + init pools
  for (let i = 1; i <= 3; i++) {
    createChart(i, currentChart[i]);
    initPool(i);
  }

  // overview
  watchOverview();

  // nav click
  document.querySelectorAll(".nav-link").forEach(link=>{
    link.addEventListener("click", (e)=>{
      e.preventDefault();
      const pageId = link.dataset.page;
      if (pageId === "overview") { 
        switchToOverview(); 
        return; 
      }
      const pool = Number(pageId.replace("pool-", ""));
      if (pool >= 1 && pool <= 3) {
        switchToPool(pool);
      }
    });
  });

  // overview drilldown
  document.querySelectorAll("[data-open-pool]").forEach(btn=>{
    btn.addEventListener("click", (e)=>{
      e.stopPropagation();
      const pool = Number(btn.dataset.openPool);
      if (pool >= 1 && pool <= 3) {
        switchToPool(pool);
      }
    });
  });
  
  document.querySelectorAll(".pool-card").forEach(card=>{
    card.addEventListener("click", ()=>{
      const pool = Number(card.dataset.pool);
      if (pool >= 1 && pool <= 3) {
        switchToPool(pool);
      }
    });
  });

  // default
  switchToOverview();
  
  console.log("Initialization complete");
});