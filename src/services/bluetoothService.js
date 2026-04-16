// Bluetooth service for ESP32 connection (Driver Side)
// This service handles BLE communication with the ESP32 blackbox

import CryptoJS from 'crypto-js';

const SERVICE_UUID = process.env.REACT_APP_BLE_SERVICE_UUID;
const CHARACTERISTIC_UUID = process.env.REACT_APP_BLE_CHARACTERISTIC_UUID;
const HMAC_SECRET = process.env.REACT_APP_HMAC_SECRET;

class BluetoothService {
  constructor() {
    this.device = null;
    this.server = null;
    this.service = null;
    this.characteristic = null;
    this.isConnected = false;
    this.onDataReceived = null;
    this.dataBuffer = ''; // Buffer for accumulating fragmented data
  }

  // Check if browser supports Web Bluetooth
  isBluetoothSupported() {
    return !!(navigator.bluetooth || navigator.webkitBluetooth);
  }

  // Request and connect to device
  async connectToDevice() {
    try {
      const bluetoothApi = navigator.bluetooth || navigator.webkitBluetooth;
      if (!bluetoothApi) {
        throw new Error('Bluetooth API not available in this browser');
      }

      // Prefer targeted filters first: service UUID OR known ESP32 name prefixes.
      try {
        this.device = await bluetoothApi.requestDevice({
          filters: [
            {
              services: [SERVICE_UUID],
            },
            {
              name: 'BLACKBOX_101',
            },
            {
              namePrefix: 'BLACKBOX',
            },
            {
              namePrefix: 'ESP32',
            },
          ],
          optionalServices: [SERVICE_UUID],
        });
      } catch (requestError) {
        if (requestError && requestError.name === 'NotFoundError') {
          this.device = await bluetoothApi.requestDevice({
            acceptAllDevices: true,
            optionalServices: [SERVICE_UUID],
          });
        } else {
          throw requestError;
        }
      }

      // When disconnected, set flags
      this.device.addEventListener('gattserverdisconnected', () => {
        this.isConnected = false;
        console.log('BLE Device disconnected');
      });

      // Connect to GATT Server
      this.server = await this.device.gatt.connect();
      console.log('Connected to GATT Server');

      // Get the service
      this.service = await this.server.getPrimaryService(SERVICE_UUID);

      // Get the characteristic
      this.characteristic = await this.service.getCharacteristic(CHARACTERISTIC_UUID);

      // Start notifications
      await this.characteristic.startNotifications();
      this.characteristic.addEventListener('characteristicvaluechanged', (event) => {
        const decoder = new TextDecoder();
        const value = decoder.decode(event.target.value);
        this.handleFragmentedData(value);
      });

      this.isConnected = true;
      return true;
    } catch (error) {
      console.error('Bluetooth connection error:', error);
      this.isConnected = false;
      throw error;
    }
  }

  // Handle fragmented BLE data (reassemble if truncated)
  handleFragmentedData(fragment) {
    this.dataBuffer += fragment;
    
    // Check if we have a complete JSON payload (ends with })
    if (this.dataBuffer.endsWith('}')) {
      // Try to parse complete JSON
      try {
        JSON.parse(this.dataBuffer);
        // If valid JSON, process it
        this.parseAndHandleData(this.dataBuffer);
        this.dataBuffer = ''; // Reset buffer after successful parse
      } catch (e) {
        // Invalid JSON, keep buffering (might be incomplete)
        console.log('Buffering fragmented data... Current length:', this.dataBuffer.length);
      }
    }
  }

  // Parse sensor data from ESP32 with HMAC verification
  parseAndHandleData(jsonString) {
    try {
      // Extract the data string BEFORE parsing to maintain exact format
      const dataJsonMatch = jsonString.match(/"data"\s*:\s*(\{[^}]+\})/);
      if (!dataJsonMatch) {
        console.error('Could not extract data from payload');
        return;
      }
      const dataString = dataJsonMatch[1];

      // Now parse the full payload
      const payload = JSON.parse(jsonString);
      console.log('Received BLE payload:', payload);

      // Extract HMAC
      const { hmac } = payload;
      if (!hmac) {
        console.error('Invalid payload: missing hmac');
        return;
      }

      console.log('Data string for HMAC:', dataString);
      console.log('Received HMAC:', hmac);

      // Recompute HMAC using the exact data string
      const computedHmac = CryptoJS.HmacSHA256(dataString, HMAC_SECRET).toString();
      console.log('Computed HMAC:', computedHmac);

      // Verify HMAC
      if (computedHmac !== hmac) {
        console.error('❌ HMAC verification failed: data may be tampered');
        console.error('Expected:', hmac);
        console.error('Got:', computedHmac);
        return;
      }

      console.log('✅ HMAC verified: data integrity confirmed');

      // Call user-provided callback with verified data
      if (this.onDataReceived) {
        this.onDataReceived(payload.data);
      }
    } catch (error) {
      console.error('Error parsing/verifying BLE data:', error);
    }
  }

  // Disconnect from device
  async disconnect() {
    if (this.device && this.device.gatt.connected) {
      await this.device.gatt.disconnect();
      this.isConnected = false;
      console.log('Disconnected from BLE device');
    }
  }

  // Set callback for data reception
  setDataCallback(callback) {
    this.onDataReceived = callback;
  }
}

const bluetoothService = new BluetoothService();

export default bluetoothService;
