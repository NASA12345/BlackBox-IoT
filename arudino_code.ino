#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>

#include <Adafruit_MPU6050.h>
#include <Adafruit_Sensor.h>
#include <DHT.h>
#include <Wire.h>

// -------- HMAC for Integrity --------
#include <Crypto.h>
#include <SHA256.h>
#include <string.h>

const char* HMAC_SECRET = "8fcd141aa2f81eca1970c7d013e5deebdd77884f4ebf6e03db7dc308b5964458";

// -------- CONFIG --------
#define DHTPIN 4
#define DHTTYPE DHT11
#define REED_PIN 13

#define MAX_BUFFER 50

// -------- BLE UUIDs --------
#define SERVICE_UUID        "12345678-1234-1234-1234-1234567890ab"
#define CHARACTERISTIC_UUID "abcd1234-5678-1234-5678-abcdef123456"

// -------- OBJECTS --------
BLECharacteristic *pCharacteristic;
Adafruit_MPU6050 mpu;
DHT dht(DHTPIN, DHTTYPE);

// -------- STATE --------
float ax = 0, ay = 0, az = 0;
float gx = 0, gy = 0, gz = 0;
bool tamper = false;
bool mpuReady = false;
bool deviceConnected = false;

// -------- WARMUP --------
int warmupCount = 0;
const int WARMUP_READINGS = 3;

// -------- BUFFER --------
String buffer[MAX_BUFFER];
int bufferStart = 0;
int bufferEnd = 0;

// -------- BUFFER FUNCTIONS --------
void addToBuffer(String data) {
  int next = (bufferEnd + 1) % MAX_BUFFER;
  if (next == bufferStart) {
    bufferStart = (bufferStart + 1) % MAX_BUFFER;
  }
  buffer[bufferEnd] = data;
  bufferEnd = next;
}

bool bufferEmpty() {
  return bufferStart == bufferEnd;
}

String popBuffer() {
  if (bufferEmpty()) return "";
  String data = buffer[bufferStart];
  bufferStart = (bufferStart + 1) % MAX_BUFFER;
  return data;
}

// -------- HMAC --------
String computeHMAC(String data) {
  SHA256 sha256;
  uint8_t hash[32];
  char hexHash[65];

  sha256.resetHMAC((uint8_t*)HMAC_SECRET, strlen(HMAC_SECRET));
  sha256.update((uint8_t*)data.c_str(), data.length());
  sha256.finalizeHMAC((uint8_t*)HMAC_SECRET, strlen(HMAC_SECRET), hash, sizeof(hash));

  for (int i = 0; i < 32; i++) {
    sprintf(&hexHash[i * 2], "%02x", hash[i]);
  }
  hexHash[64] = '\0';

  return String(hexHash);
}

// -------- BLE CALLBACK --------
class MyServerCallbacks: public BLEServerCallbacks {
  void onConnect(BLEServer* pServer) {
    Serial.println("✅ Client Connected");
    deviceConnected = true;
  }

  void onDisconnect(BLEServer* pServer) {
    Serial.println("❌ Client Disconnected");
    deviceConnected = false;
    delay(100);
    BLEDevice::startAdvertising();
  }
};

// -------- SETUP --------
void setup() {
  Serial.begin(115200);

  pinMode(REED_PIN, INPUT_PULLUP);
  dht.begin();

  Wire.begin(21, 22);

  if (mpu.begin()) {
    mpuReady = true;
    Serial.println("✅ MPU6050 Ready");
  } else {
    Serial.println("❌ MPU6050 NOT found");
  }

  // // ✅ Warm-up delay
  // Serial.println("⏳ Warming up sensors...");
  // delay(3000);

  // BLE Init
  BLEDevice::init("BLACKBOX_101");
  BLEDevice::setMTU(512);

  BLEServer *pServer = BLEDevice::createServer();
  pServer->setCallbacks(new MyServerCallbacks());

  BLEService *pService = pServer->createService(SERVICE_UUID);

  pCharacteristic = pService->createCharacteristic(
                      CHARACTERISTIC_UUID,
                      BLECharacteristic::PROPERTY_READ |
                      BLECharacteristic::PROPERTY_NOTIFY
                    );

  pCharacteristic->addDescriptor(new BLE2902());
  pService->start();

  BLEAdvertising *pAdvertising = BLEDevice::getAdvertising();
  pAdvertising->addServiceUUID(SERVICE_UUID);
  pAdvertising->setScanResponse(true);

  BLEDevice::startAdvertising();

  Serial.println("🚀 BLE Started. Waiting for client...");
}

// -------- LOOP --------
void loop() {

  // ✅ Skip first few readings
  if (warmupCount < WARMUP_READINGS) {
    warmupCount++;
    Serial.println("⏳ Stabilizing...");
    delay(2000);
    return;
  }

  // --- Tamper ---
  tamper = (digitalRead(REED_PIN) == HIGH);

  // --- MPU6050 ---
  if (mpuReady) {
    sensors_event_t a, g, temp;
    mpu.getEvent(&a, &g, &temp);

    ax = a.acceleration.x;
    ay = a.acceleration.y;
    az = a.acceleration.z;

    gx = g.gyro.x;
    gy = g.gyro.y;
    gz = g.gyro.z;
  }

  // --- DHT ---
  float temperature = dht.readTemperature();
  float humidity = dht.readHumidity();

  // ✅ Skip invalid DHT readings
  if (isnan(temperature) || isnan(humidity)) {
    Serial.println("⚠️ DHT read failed, skipping...");
    delay(2000);
    return;
  }

  // --- JSON DATA ---
  String dataJson = "{";
  dataJson += "\"temp\":" + String(temperature, 1) + ",";
  dataJson += "\"humidity\":" + String(humidity, 1) + ",";
  dataJson += "\"tamper\":" + String(tamper ? 1 : 0) + ",";
  dataJson += "\"ax\":" + String(ax, 2) + ",";
  dataJson += "\"ay\":" + String(ay, 2) + ",";
  dataJson += "\"az\":" + String(az, 2) + ",";
  dataJson += "\"gx\":" + String(gx, 2) + ",";
  dataJson += "\"gy\":" + String(gy, 2) + ",";
  dataJson += "\"gz\":" + String(gz, 2);
  dataJson += "}";

  String hmac = computeHMAC(dataJson);

  String payload = "{";
  payload += "\"data\":" + dataJson + ",";
  payload += "\"hmac\":\"" + hmac + "\"";
  payload += "}";

  // -------- SEND / BUFFER --------
  if (deviceConnected) {

    if (!bufferEmpty()) {
      String oldData = popBuffer();
      pCharacteristic->setValue(oldData.c_str());
      pCharacteristic->notify();
      Serial.println("📤 Buffered Sent: " + oldData);
      delay(5000);
    } 
    else {
      pCharacteristic->setValue(payload.c_str());
      pCharacteristic->notify();
      Serial.println("📡 Live: " + payload);
      delay(5000);
    }

  } else {
    addToBuffer(payload);
    Serial.println("💾 Stored: " + payload);
    delay(5000);
  }
}