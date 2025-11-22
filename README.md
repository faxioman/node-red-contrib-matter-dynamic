# Node-RED Matter Dynamic

Dynamic Matter device nodes for Node-RED. Create any Matter device by specifying only the device type in JSON configuration - no need for device-specific nodes!

## Installation

```bash
npm install @faxioman/node-red-contrib-matter-dynamic
```

## Requirements

- Node.js >= 18.0.0
- Node-RED >= 3.0.0

## Features

- ✨ Create Matter devices dynamically via JSON configuration
- 🔌 No need to create separate nodes for each device type
- 🔄 Automatic event subscription and state management
- 📱 Compatible with Apple HomeKit, Google Home, Amazon Alexa (via Matter)
- 🎯 Support for all Matter.js device types
- 🔋 **NEW:** Composite devices support (e.g., thermostat with battery)

## Quick Start

### 1. Setup Matter Bridge

1. Drag a **Matter Dynamic Bridge** node from the palette
2. Double-click to configure:
   - **Name**: Give your bridge a name
   - **Port**: Default 5540 (change if needed)
   - **Network Interface**: Select your network interface or leave default
3. Deploy the flow
4. Open the bridge node to see the QR code for pairing

### 2. Add Dynamic Devices

1. Drag a **Matter Device** node
2. Configure:
   - **Name**: Device name
   - **Bridge**: Select your bridge
   - **Config**: JSON configuration (see examples below)
3. Connect input/output nodes as needed
4. Deploy

### 3. Pair with HomeKit/Google/Alexa

1. Open your Matter controller app
2. Add new device
3. Scan QR code from bridge or enter manual pairing code

### 4. Multi-Admin Support (NEW!)

Matter supports **Multi-Admin**, allowing you to add the same devices to multiple ecosystems simultaneously (HomeKit + Alexa + Google Home + SmartThings, etc.).

#### How to add to multiple controllers:

**First Controller (e.g., HomeKit):**
1. Scan the QR code or enter manual code as usual
2. Complete the pairing process

**Additional Controllers (e.g., Alexa):**

**From HomeKit:**
1. Long press the bridge in the Home app
2. Tap the Settings icon (gear)
3. Select "Turn On Pairing Mode"
4. Copy the code shown
5. Use this code in Google Home or Alexa

**From Google Home:**
1. Open device settings
2. Tap "Linked Matter apps & services"
3. Select "Link apps"
4. Copy the setup code
5. Use this code in HomeKit or Alexa

**From Alexa:**
1. Go to device settings
2. Select "Other assistants & apps"
3. Enable pairing mode
4. Note the pairing code
5. Use this code in HomeKit or Google Home

**Important:**
The bridge can be connected to all three ecosystems simultaneously. Multi-admin pairing must be initiated from an existing controller for security reasons - the Matter specification doesn't allow devices to autonomously open new commissioning windows after initial pairing.

#### Benefits of Multi-Admin:
- ✅ **Local control** from all ecosystems - no cloud dependency
- ✅ **Simultaneous access** - use Siri, Alexa, and Google Assistant
- ✅ **Ecosystem features** - leverage unique features from each platform
- ✅ **Redundancy** - if one hub fails, others continue working
- ✅ **Family flexibility** - different family members can use their preferred app

#### Technical Details:
- Each controller creates its own "Fabric" in the Matter network
- Devices can belong to multiple Fabrics simultaneously (up to 5 typically)
- All controllers communicate locally with the device
- No performance impact from multiple controllers

## Configuration Examples

### Simple Light
```json
{
  "deviceType": "OnOffLightDevice"
}
```

### Advanced Configuration

#### Behavior Features
Some devices require specific features to be enabled on their behaviors:
```json
{
  "deviceType": "DeviceType",
  "behaviorFeatures": {
    "BehaviorName": ["Feature1", "Feature2"]
  }
}
```

#### Additional Behaviors
You can add extra behaviors (clusters) to any device type. This is useful for adding battery status, power monitoring, or other capabilities:
```json
{
  "deviceType": "YourDeviceType",
  "additionalBehaviors": ["PowerSourceServer", "ElectricalEnergyMeasurementServer"],
  "initialState": {
    "powerSource": {
      "status": 1,
      "batPercentRemaining": 100
    }
  }
}
```

**Common Additional Behaviors:**
- `PowerSourceServer` - Battery/power status
- `ElectricalEnergyMeasurementServer` - Energy monitoring
- `BooleanStateServer` - Binary state indication

### Dimmable Light
```json
{
  "deviceType": "DimmableLightDevice"
}
```

### Color Temperature Light
```json
{
  "deviceType": "ColorTemperatureLightDevice"
}
```

### Temperature Sensor
```json
{
  "deviceType": "TemperatureSensorDevice"
}
```

### Generic Switch (Multi-button)
```json
{
  "deviceType": "GenericSwitchDevice",
  "initialState": {
    "switch": {
      "numberOfPositions": 2,     // Number of buttons (2 = on/off)
      "currentPosition": 0,       // Initial position (0-based)
      "multiPressMax": 2         // Max consecutive presses
    }
  }
}
```

For a 3-button switch:
```json
{
  "deviceType": "GenericSwitchDevice",
  "initialState": {
    "switch": {
      "numberOfPositions": 3,
      "currentPosition": 0
    }
  }
}
```

### Thermostat
Thermostats require features to be specified:
```json
{
  "deviceType": "ThermostatDevice",
  "behaviorFeatures": {
    "Thermostat": ["Heating", "Cooling"]  // Specify features needed
  },
  "initialState": {
    "thermostat": {
      "localTemperature": 2000,
      "systemMode": 4,
      "controlSequenceOfOperation": 4,  // 2=HeatingOnly, 4=CoolingAndHeating
      "minHeatSetpointLimit": 500,
      "maxHeatSetpointLimit": 3500,
      "minCoolSetpointLimit": 0,
      "maxCoolSetpointLimit": 2100,
      "occupiedHeatingSetpoint": 2000,
      "occupiedCoolingSetpoint": 2600
    }
  }
}
```

### Enhanced Devices with Additional Behaviors (NEW!)
Add extra functionality to any device using additional behaviors/clusters.

**Important Note**: In Matter, each endpoint can only have ONE primary device type. Additional functionality (like battery status) is added through behaviors/clusters, NOT by combining device types.

#### Thermostat with Battery Status
```json
{
  "deviceType": "ThermostatDevice",
  "additionalBehaviors": ["PowerSourceServer"],
  "behaviorFeatures": {
    "Thermostat": ["Heating", "Cooling"],
    "PowerSource": ["Battery", "Replaceable"]
  },
  "initialState": {
    "thermostat": {
      "localTemperature": 2000,
      "systemMode": 4,
      "controlSequenceOfOperation": 4,
      "occupiedHeatingSetpoint": 2000,
      "occupiedCoolingSetpoint": 2600
    },
    "powerSource": {
      "status": 1,
      "order": 1,
      "description": "Battery",
      "batChargeLevel": 0,
      "batPercentRemaining": 200,
      "batReplacementNeeded": false,
      "batReplaceability": 1
    }
  }
}
```

**Key Points:**
- `controlSequenceOfOperation` is mandatory for Thermostat (4 = Cooling and Heating)
- `PowerSource` with Battery feature requires specifying `["Battery", "Replaceable"]` in behaviorFeatures
- `batPercentRemaining`: 200 = 100% (value is percentage × 2)
- `batChargeLevel`: 0=Ok, 1=Warning, 2=Critical
- `batReplacementNeeded`: Mandatory with Battery feature (true/false)
- `batReplaceability`: Mandatory with Battery feature (0=Unspecified, 1=NotReplaceable, 2=UserReplaceable, 3=FactoryReplaceable)

#### Motion Sensor with Battery
```json
{
  "deviceType": "MotionSensorDevice",
  "additionalBehaviors": ["PowerSourceServer"],
  "initialState": {
    "occupancySensing": {
      "occupancy": { occupied: false }
    },
    "powerSource": {
      "status": 1,
      "order": 1,
      "batPercentRemaining": 100,
      "batChargeLevel": 1,
      "description": "Battery"
    }
  }
}
```

#### Contact Sensor with Battery
```json
{
  "deviceType": "ContactSensorDevice",
  "additionalBehaviors": ["PowerSourceServer"],
  "behaviorFeatures": {
    "PowerSource": ["Battery", "Replaceable"]
  },
  "initialState": {
    "booleanState": {
      "stateValue": false
    },
    "powerSource": {
      "status": 1,
      "order": 1,
      "description": "CR2032 Battery",
      "batChargeLevel": 0,
      "batPercentRemaining": 190,
      "batReplaceability": 1,
      "batReplacementNeeded": false
    }
  }
}
```

### Updating Battery Status

To update the battery level or other PowerSource attributes, send a message with the `powerSource` object:

```json
{
  "payload": {
    "powerSource": {
      "batPercentRemaining": 150,      // 75% (value × 2)
      "batReplacementNeeded": false
    }
  }
}
```

You can update any combination of PowerSource attributes:

```json
{
  "payload": {
    "powerSource": {
      "status": 0,                     // 0=Active, 1=Standby, 2=Unavailable
      "batPercentRemaining": 100,      // 50% battery (value × 2)
      "batReplacementNeeded": true,    // Battery needs replacement
      "batChargeLevel": 1              // 0=OK, 1=Warning, 2=Critical
    }
  }
}
```

You can also update device state and battery together:
```json
{
  "payload": {
    "thermostat": {
      "localTemperature": 2150        // 21.5°C
    },
    "powerSource": {
      "batPercentRemaining": 120      // 60% battery
    }
  }
}
```

The device will emit events when these values change, allowing you to monitor battery status in real-time.

### Fan Device
```json
{
  "deviceType": "FanDevice",
  "initialState": {
    "fanControl": {
      "fanModeSequence": 2,  // 0-5 based on supported modes
      "percentCurrent": 0    // 0-100
    }
  }
}
```

### Basic Video Player
```json
{
  "deviceType": "BasicVideoPlayerDevice",
  "initialState": {
    "mediaPlayback": {
      "currentState": 0  // 0=Playing, 1=Paused, 2=NotPlaying, 3=Buffering
    }
  }
}
```

### Casting Video Player
```json
{
  "deviceType": "CastingVideoPlayerDevice",
  "initialState": {
    "mediaPlayback": {
      "currentState": 0  // 0=Playing, 1=Paused, 2=NotPlaying, 3=Buffering
    },
    "contentLauncher": {
      "supportedStreamingProtocols": 0,  // Bitmask of supported protocols
      "acceptHeader": []  // Array of accepted content types
    }
  }
}
```

### Video Player Command Messages

Video players emit command messages when controlled via Matter:

**Media Playback Commands**
```javascript
// Received when play is pressed
msg.payload = {
  command: "play",
  cluster: "mediaPlayback"
}

// Other commands: pause, stop, next, previous, startOver
// Commands with data: skipForward, skipBackward, seek, rewind, fastForward
msg.payload = {
  command: "skipForward",
  cluster: "mediaPlayback",
  data: { deltaPositionMilliseconds: 30000 }
}
```

**Keypad Input Commands**
```javascript
// Received when a key is pressed
msg.payload = {
  command: "sendKey",
  cluster: "keypadInput",
  data: { keyCode: 0 }  // 0=Select, 1=Up, 2=Down, etc.
}
```

## Input/Output Format

The Matter Device node has **2 outputs**:
- **Output 1**: Commands received from Matter controllers (HomeKit, Alexa, etc.)
- **Output 2**: State change events from the device

### Input Messages

Messages must use Matter cluster format:

**Light On/Off**
```javascript
// Turn on
msg.payload = {
  onOff: {
    onOff: true
  }
}

// Turn off
msg.payload = {
  onOff: {
    onOff: false
  }
}
```

**Dimmer Level**
```javascript
msg.payload = {
  levelControl: {
    currentLevel: 128  // 0-255
  }
}
```

**Temperature Sensor**
```javascript
// Set to 21.5°C (value × 100)
msg.payload = {
  temperatureMeasurement: {
    measuredValue: 2150
  }
}
```

**Query State**
```javascript
msg.topic = "state"
// Returns current device state in payload
```

### Output Messages

**Output 1 - Events** (state changes):
```javascript
// Light state changed
msg.payload = {
  onOff: {
    onOff: true
  }
}

// Dimmer level changed
msg.payload = {
  levelControl: {
    currentLevel: 200
  }
}
```

**Output 2 - Commands** (from Matter controllers):
```javascript
// Command received from HomeKit/Alexa
msg.payload = {
  command: "on",      // or "off", "toggle"
  cluster: "OnOff",
  data: undefined     // Some commands have data
}

// Command with data
msg.payload = {
  command: "moveToLevel",
  cluster: "LevelControl",
  data: { level: 128, transitionTime: 10 }
}

// Video player commands
msg.payload = {
  command: "play",
  cluster: "MediaPlayback"
}
```

## Complete Flow Example

```json
[
  {
    "id": "bridge1",
    "type": "matter-dynamic-bridge",
    "name": "My Matter Bridge"
  },
  {
    "id": "light1",
    "type": "matter-device",
    "name": "Living Room Light",
    "bridge": "bridge1",
    "deviceConfig": "{\"deviceType\": \"OnOffLightDevice\"}",
    "x": 300,
    "y": 100,
    "wires": [["debug1"]]
  },
  {
    "id": "inject1",
    "type": "inject",
    "name": "Turn On",
    "payload": "{\"onOff\":{\"onOff\":true}}",
    "payloadType": "json",
    "x": 100,
    "y": 100,
    "wires": [["light1"]]
  },
  {
    "id": "debug1",
    "type": "debug",
    "name": "Light State",
    "x": 500,
    "y": 100
  }
]
```

## Supported Device Types

### Lighting
- `OnOffLightDevice` - Simple on/off light
- `DimmableLightDevice` - Dimmable light
- `ColorTemperatureLightDevice` - Adjustable color temperature
- `ExtendedColorLightDevice` - Full RGB color control

### Sensors
- `ContactSensorDevice` - Door/window sensor
- `LightSensorDevice` - Ambient light sensor
- `OccupancySensorDevice` - Occupancy detection
- `MotionSensorDevice` - Motion detection
- `TemperatureSensorDevice` - Temperature measurement
- `PressureSensorDevice` - Pressure measurement
- `FlowSensorDevice` - Flow rate measurement
- `HumiditySensorDevice` - Humidity measurement
- `WaterLeakDetectorDevice` - Water leak detection
- `RainSensorDevice` - Rain detection
- `SmokeCoAlarmDevice` - Smoke/CO detection

### Switches & Controls
- `GenericSwitchDevice` - Multi-button switch
- `OnOffSensorDevice` - Binary sensor
- `DimmableSwitchDevice` - Dimmer switch
- `ColorDimmerSwitchDevice` - Color control switch

### Smart Plugs
- `OnOffPlugInUnitDevice` - Simple smart plug
- `DimmablePlugInUnitDevice` - Dimmable plug

### HVAC & Comfort
- `ThermostatDevice` - Heating/cooling control
- `FanDevice` - Fan control
- `HeatingCoolingUnitDevice` - HVAC unit
- `AirQualitySensorDevice` - Air quality monitoring
- `AirPurifierDevice` - Air purifier control

### Appliances
- `DishwasherDevice` - Dishwasher control
- `LaundryWasherDevice` - Washing machine
- `LaundryDryerDevice` - Dryer
- `RefrigeratorDevice` - Refrigerator
- `CookSurfaceDevice` - Cooktop
- `CooktopDevice` - Cooktop control
- `OvenDevice` - Oven control
- `ExtractorHoodDevice` - Range hood
- `MicrowaveOvenDevice` - Microwave

### Other Devices
- `WindowCoveringDevice` - Blinds/curtains
- `DoorLockDevice` - Smart lock
- `PumpDevice` - Pump control
- `RoboticVacuumCleanerDevice` - Robot vacuum
- `RoomAirConditionerDevice` - AC unit
- `WaterFreezeDetectorDevice` - Freeze detection

### Media & Entertainment
- `BasicVideoPlayerDevice` - Basic video control
- `CastingVideoPlayerDevice` - Casting device
- `VideoRemoteControlDevice` - Remote control
- `SpeakerDevice` - Speaker control

## Troubleshooting

### Device shows "Not Responding" in HomeKit
- Check Node-RED logs for errors
- Ensure Matter bridge is running (green status)
- Try redeploying the flow
- Check network connectivity

### Events not triggering
- Verify the device is showing "ready" status
- Check the debug output for errors
- Ensure payload format matches Matter cluster structure

### Cannot pair with controller
- Make sure bridge is not already paired (check bridge config)
- Use "Reopen Commissioning" if already paired
- Check firewall settings for port 5540 (or configured port)
- Ensure mDNS is working on your network

### Device validation errors
Some devices have complex requirements:
- **GenericSwitchDevice**: Requires explicit button configuration
- **ThermostatDevice**: Requires features to be specified via `behaviorFeatures`
- **BasicVideoPlayerDevice**: Not supported by Alexa (Matter 1.4 device)

When devices fail validation, check Node-RED logs for specific missing attributes.

### Common Payload Format Reference

| Device Type | Action | Payload |
|------------|--------|---------|
| Light | On/Off | `{onOff: {onOff: true/false}}` |
| Dimmer | Set Level | `{levelControl: {currentLevel: 0-255}}` |
| Color Light | Set Color | `{colorControl: {currentHue: 0-254, currentSaturation: 0-254}}` |
| Temperature | Set Temp | `{temperatureMeasurement: {measuredValue: value*100}}` |
| Thermostat | Set Target | `{thermostat: {occupiedHeatingSetpoint: value*100}}` |
| Lock | Lock/Unlock | `{doorLock: {lockState: 1/2}}` |
| Contact | Open/Close | `{booleanState: {stateValue: true/false}}` |
| Fan | Speed | `{fanControl: {percentSetting: 0-100}}` |
| Video Player | State | `{mediaPlayback: {currentState: 0/1/2}}` |

## Support

- GitHub Issues: [Report bugs or request features](https://github.com/faxioman/node-red-contrib-matter-dynamic/issues)
- Node-RED Forum: [Get help from the community](https://discourse.nodered.org)

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT

## Acknowledgments

This project was heavily inspired by and based on the excellent work done in [node-red-matter-bridge](https://github.com/sammachin/node-red-matter-bridge) by Sam Machin. The architecture and implementation patterns from that project served as a fundamental guide for developing this dynamic Matter bridge implementation.

Built on top of the excellent [Matter.js](https://github.com/project-chip/matter.js) library.