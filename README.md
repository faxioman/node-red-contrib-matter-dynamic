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

- Create Matter devices dynamically via JSON configuration
- No need to create separate nodes for each device type
- Automatic event subscription and state management
- Compatible with Apple HomeKit, Google Home, Amazon Alexa (via Matter)
- Support for all Matter.js device types
- Composite devices support (e.g., thermostat with battery)
- Auto-confirm commands for immediate state feedback (OnOff cluster only)

## Quick Start

### 1. Add Your First Matter Device

1. Add a **Matter Device** node and configure:
   - **Name**: Device name
   - **Bridge**: Create a new bridge from the device configuration
   - **Config**: JSON configuration (see examples below)
2. Configure the bridge with name, port (default 5540), and network interface
3. Deploy the flow
4. Open the bridge node to get the QR code for pairing

### 2. Add More Devices

1. Add additional **Matter Device** nodes
2. Select your existing bridge and configure with JSON
3. Deploy and connect as needed

### 3. Pair with HomeKit/Google/Alexa

1. Open your Matter controller app
2. Add new device
3. Scan QR code from bridge or enter manual pairing code

## Configuration Examples

> **Note:** All examples below are real configurations tested and confirmed working with actual Matter devices.
> **Contributions welcome:** If you have tested other device configurations that work well, please consider contributing them to improve this documentation.
> **Compatibility:** Virtually all Matter devices specified in the [Matter.js library](https://github.com/matter-js/matter.js) are supported.

### Simple On/Off Light
```json
{
  "deviceType": "OnOffLightDevice"
}
```

### Color Temperature Light (Dimmable)
```json
{
  "deviceType": "ColorTemperatureLightDevice",
  "initialState": {
    "colorControl": {
      "colorMode": 2,
      "ColorTemperatureMireds": 454,
      "coupleColorTempToLevelMinMireds": 250,
      "startUpColorTemperatureMireds": 454,
      "colorTempPhysicalMinMireds": 250,
      "colorTempPhysicalMaxMireds": 454
    },
    "levelControl": {
      "currentLevel": 254
    }
  }
}
```

### Extended Color Light (RGB)
```json
{
  "deviceType": "ExtendedColorLightDevice",
  "behaviorFeatures": {
    "ColorControl": [
      "HueSaturation"
    ]
  },
  "initialState": {
    "colorControl": {
      "colorMode": 0,
      "colorCapabilities": 1,
      "numberOfPrimaries": 0
    }
  }
}
```

### Smart Plug / On/Off Switch
```json
{
  "deviceType": "OnOffPlugInUnitDevice"
}
```

### Temperature Sensor
```json
{
  "deviceType": "TemperatureSensorDevice"
}
```

### Humidity Sensor
```json
{
  "deviceType": "HumiditySensorDevice"
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
- `FanControlServer` - Fan control
- `RelativeHumidityMeasurementServer` - Humidity measurement

### Thermostat (Heating + Cooling + Fan + Humidity + Battery)
```json
{
  "deviceType": "ThermostatDevice",
  "additionalBehaviors": [
    "PowerSourceServer",
    "FanControlServer",
    "RelativeHumidityMeasurementServer"
  ],
  "behaviorFeatures": {
    "Thermostat": [
      "Heating",
      "Cooling"
    ],
    "PowerSource": [
      "Battery",
      "Replaceable"
    ],
    "FanControl": [
      "MultiSpeed"
    ],
    "RelativeHumidityMeasurement": [
      "Percentage"
    ]
  },
  "initialState": {
    "thermostat": {
      "localTemperature": 2000,
      "systemMode": 4,
      "controlSequenceOfOperation": 4,
      "minHeatSetpointLimit": 1600,
      "maxHeatSetpointLimit": 3200,
      "minCoolSetpointLimit": 1600,
      "maxCoolSetpointLimit": 3200,
      "occupiedHeatingSetpoint": 2100,
      "occupiedCoolingSetpoint": 2200,
      "absMinHeatSetpointLimit": 1600,
      "absMaxHeatSetpointLimit": 3200,
      "absMinCoolSetpointLimit": 1600,
      "absMaxCoolSetpointLimit": 3200
    },
    "powerSource": {
      "status": 1,
      "order": 1,
      "description": "Battery",
      "batChargeLevel": 0,
      "batPercentRemaining": 200,
      "batReplacementNeeded": false,
      "batReplaceability": 1,
      "batReplacementDescription": "CR2032",
      "batQuantity": 1
    },
    "fanControl": {
      "fanModeSequence": 5,
      "percentCurrent": 0,
      "percentSetting": 0,
      "speedMax": 100,
      "speedCurrent": 0
    },
    "relativeHumidityMeasurement": {
      "measuredValue": 5000,
      "minMeasuredValue": 0,
      "maxMeasuredValue": 10000
    }
  }
}
```

### Thermostat (Heating Only + Humidity + Battery)
```json
{
  "deviceType": "ThermostatDevice",
  "additionalBehaviors": [
    "PowerSourceServer",
    "RelativeHumidityMeasurementServer"
  ],
  "behaviorFeatures": {
    "Thermostat": [
      "Heating"
    ],
    "PowerSource": [
      "Battery",
      "Replaceable"
    ],
    "RelativeHumidityMeasurement": [
      "Percentage"
    ]
  },
  "initialState": {
    "thermostat": {
      "localTemperature": 2000,
      "systemMode": 4,
      "controlSequenceOfOperation": 2,
      "minHeatSetpointLimit": 1600,
      "maxHeatSetpointLimit": 3200,
      "occupiedHeatingSetpoint": 2100,
      "absMinHeatSetpointLimit": 1600,
      "absMaxHeatSetpointLimit": 3200
    },
    "powerSource": {
      "status": 1,
      "order": 1,
      "description": "Battery",
      "batChargeLevel": 0,
      "batPercentRemaining": 200,
      "batReplacementNeeded": false,
      "batReplaceability": 1,
      "batReplacementDescription": "CR2032",
      "batQuantity": 1
    },
    "relativeHumidityMeasurement": {
      "measuredValue": 5000,
      "minMeasuredValue": 0,
      "maxMeasuredValue": 10000
    }
  }
}
```

### Enhanced Devices with Additional Behaviors
Add extra functionality to any device using additional behaviors/clusters.

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
      "occupancy": { "occupied": false }
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

// Thermostat temperature changed
msg.payload = {
  thermostat: {
    occupiedHeatingSetpoint: 2100
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

### Command vs State Change Behavior

**Some Matter devices may use attribute writes instead of commands:**

In Matter, not all device operations use explicit commands. Some devices (like thermostats) primarily use direct attribute writes rather than commands.

**When this happens:**
- **Commands** (Output 2): Only appear for explicit device commands
- **State Changes** (Output 1): Appear when controllers write directly to device attributes

**Example - Thermostat:**
- Setting temperature via HomeKit → Appears as state change in Output 1
- Using `setpointRaiseLower` command → Appears as command in Output 2

**This behavior varies by device type** and depends on how the Matter specification defines each device's interaction model. Always check both outputs to ensure you capture all device interactions.

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

## Auto-Confirm Feature

The auto-confirm feature provides immediate state feedback when interactions are received from Matter controllers (HomeKit, Alexa, etc.). This prevents the controller from reverting the device state due to timeout.

**Currently supports both:**
- **Commands**: Explicit device commands (e.g., `on`, `off`, `toggle`)
- **Events**: Attribute writes that may require additional confirmation (e.g., fan speed synchronization)

The feature automatically handles device-specific behaviors to ensure proper state synchronization with Matter controllers.

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

### Commands not appearing in Output 2
Some devices (like thermostats) may not show commands in Output 2 when controlled from HomeKit/Alexa. This is expected behavior - these devices use direct attribute writes instead of commands.

**Solution:** Monitor Output 1 for state changes, as this is where attribute modifications will appear.

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