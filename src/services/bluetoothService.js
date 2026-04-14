// Bluetooth service for ESP32 connection (Driver Side)
// This service handles BLE communication with the ESP32 blackbox

const SERVICE_UUID = '12345678-1234-1234-1234-1234567890ab';
const CHARACTERISTIC_UUID = 'abcd1234-5678-1234-5678-abcdef123456';

class BluetoothService {
  constructor() {
    this.device = null;
    this.server = null;
    this.service = null;
    this.characteristic = null;
    this.isConnected = false;
    this.onDataReceived = null;
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
        this.parseAndHandleData(value);
      });

      this.isConnected = true;
      return true;
    } catch (error) {
      console.error('Bluetooth connection error:', error);
      this.isConnected = false;
      throw error;
    }
  }

  // Parse sensor data from ESP32
  parseAndHandleData(jsonString) {
    try {
      const sensorData = JSON.parse(jsonString);
      console.log('Received sensor data:', sensorData);

      // Call user-provided callback
      if (this.onDataReceived) {
        this.onDataReceived(sensorData);
      }
    } catch (error) {
      console.error('Error parsing sensor data:', error);
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

export default new BluetoothService();
