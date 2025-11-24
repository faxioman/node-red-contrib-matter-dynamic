# Node-RED Matter Dynamic - Architecture Documentation

## Project Overview

This project implements dynamic Matter device nodes for Node-RED, allowing users to create Matter devices by specifying only the device type in JSON configuration, without hardcoding device-specific characteristics.

## Key Components

### 1. Matter Bridge (`matter-bridge.js` / `matter-bridge.html`)
- **Purpose**: Creates a Matter Bridge that hosts multiple dynamic devices
- **Key Features**:
  - Manages Matter server lifecycle
  - Handles device registration via `registerChild()` function
  - Provides HTTP endpoints for commissioning QR codes
  - Auto-starts when all registered devices are ready

### 2. Matter Device (`matter-device.js` / `matter-device.html`)
- **Purpose**: Generic node that can represent any Matter device type
- **Configuration**: Simple JSON specifying only `deviceType` (e.g., "OnOffLightDevice")
- **Key Features**:
  - Dynamically subscribes to all device events
  - Maps Matter.js cluster structure for input/output
  - No hardcoded device-specific logic

## Architecture Design

### CRITICAL DESIGN PRINCIPLE: NO HARDCODED DEVICE-SPECIFIC LOGIC
**This system MUST remain completely generic. NEVER hardcode behaviors, attributes, or logic for specific device types. All device capabilities must be discovered and handled dynamically at runtime.**

### Device Creation Flow
```
1. User configures device with JSON: {"deviceType": "OnOffLightDevice"}
2. Device node waits for bridge to be ready
3. Creates Matter.js Endpoint with specified device type
4. Registers with bridge using registerChild()
5. Bridge adds device to aggregator
6. On server ready, device subscribes to all events dynamically
```

### Event System
- **Input**: Expects Matter.js cluster format (e.g., `{onOff: {onOff: true}}`)
- **Output**: Emits changes in same format when device state changes
- **Dynamic Subscription**: Iterates through all clusters and subscribes to `$Changed` events

### Key Differences from Static Approach
- No separate node for each device type
- No hardcoded cluster names or attributes
- All device capabilities discovered at runtime
- Single codebase handles all Matter device types

## Current Issues & Solutions

### ✅ Issue 4: Video Player Commands Not Implemented (RESOLVED)
- **Symptom**: Matter.js logs "Throws unimplemented exception" for play/pause/stop/sendKey
- **Root Cause**: Behaviors with commands require method implementations
- **Solution**: Dynamically patch ALL behavior prototypes at module load time:
  - Iterate through all behaviors that have cluster.commands
  - Add command method implementations before devices are loaded
  - Each method sends command to Node-RED and returns appropriate response
```javascript
// Patch behaviors before loading devices
Object.values(matterBehaviors).forEach(BehaviorClass => {
    if (BehaviorClass?.cluster?.commands) {
        Object.entries(BehaviorClass.cluster.commands).forEach(([cmd, def]) => {
            BehaviorClass.prototype[cmd] = async function(request) {
                // Send to Node-RED
                // Return success
            };
        });
    }
});
```
- **Note**: Video player devices are part of Matter 1.4 spec but may not be supported by all controllers yet.

### ✅ Issue 1: Events Not Firing (RESOLVED)
- **Symptom**: Matter.js logs showed commands but Node-RED didn't emit messages
- **Root Cause**: Event properties ending with `$Changed` are not enumerable in Matter.js
- **Solution**: Subscribe to events based on state attributes instead of iterating event properties
```javascript
// Instead of iterating events, use state attributes:
if (node.device.state && node.device.state[clusterName]) {
    Object.keys(node.device.state[clusterName]).forEach(attributeName => {
        const eventName = `${attributeName}$Changed`;
        if (clusterEvents[eventName]) {
            clusterEvents[eventName].on(handler);
        }
    });
}
```

### ✅ Issue 2: Multiple Event Emissions (RESOLVED)
- **Symptom**: Each HomeKit action triggered 3 identical messages
- **Root Cause**: `serverReady` event emitted multiple times when devices register
- **Solution**: Added flag to prevent multiple subscriptions
```javascript
if (node.eventsSubscribed) {
    return; // Prevent duplicate subscriptions
}
node.eventsSubscribed = true;
```

## Code Structure

### Bridge Registration
```javascript
// Bridge exposes function
node.registerChild = function(child) {
    // Add to registered devices
    // Add device to aggregator
    // Start server when ready
}

// Device calls it
node.bridge.registerChild(node);
```

### Dynamic Event Subscription
```javascript
// Events ending with $Changed are not enumerable, so we use state attributes
Object.keys(node.device.events).forEach(clusterName => {
    if (node.device.state && node.device.state[clusterName]) {
        Object.keys(node.device.state[clusterName]).forEach(attributeName => {
            const eventName = `${attributeName}$Changed`;
            if (node.device.events[clusterName][eventName]) {
                // Subscribe to state change
                node.device.events[clusterName][eventName].on((value, oldValue, context) => {
                    const msg = { payload: {} };
                    msg.payload[clusterName] = {};
                    msg.payload[clusterName][attributeName] = value;
                    node.send(msg);
                });
            }
        });
    }
});
```

### Event Cleanup
Proper cleanup on node close to prevent memory leaks:
```javascript
// Store handlers for cleanup
node.eventHandlers[`${clusterName}.${eventName}`] = handler;

// On close, remove all event listeners
for (const [handlerKey, handler] of Object.entries(node.eventHandlers)) {
    const [clusterName, eventName] = handlerKey.split('.');
    await node.device.events[clusterName][eventName].off(handler);
}
node.removeAllListeners('serverReady');
```

## Payload Format Examples

### Light Control
```javascript
// Input to turn on
msg.payload = {onOff: {onOff: true}}

// Output when state changes
msg.payload = {onOff: {onOff: false}}
```

### Temperature Sensor
```javascript
// Input to set temperature (21.5°C)
msg.payload = {temperatureMeasurement: {measuredValue: 2150}}
```

## Key Implementation Details

### Event Discovery
Matter.js events ending with `$Changed` are not enumerable properties. The solution uses the device state to discover available attributes and then checks for corresponding events:

1. Iterate through `node.device.state` clusters
2. For each attribute in the state, check if `${attribute}$Changed` event exists
3. Subscribe only to existing events

### Performance Considerations
- Single event subscription per attribute (prevented by flag)
- Proper cleanup prevents memory leaks
- 2-second delay after `serverReady` ensures Matter.js initialization

### ✅ Issue 3: Matter.js Validation Errors Crash Node-RED (RESOLVED)
- **Symptom**: Node-RED crashes when creating devices with missing mandatory attributes
- **Root Cause**: Unhandled Promise rejection from Matter.js validation
- **Solution**: Added unhandled rejection handler in bridge to catch Matter.js errors
```javascript
process.on('unhandledRejection', (reason, promise) => {
    if (reason && reason.message && reason.message.includes('Behaviors have errors')) {
        // Handle gracefully, mark device as failed
        // Prevent Node-RED crash
    }
});
```

## Command Handling Architecture

### Dynamic Command Interception
The system dynamically intercepts ALL commands for ANY device type without hardcoding:
1. At module load time, patches all behavior prototypes that have commands
2. Each command method sends message to Node-RED when invoked
3. Returns appropriate Matter response based on command schema
4. Works for all current and future device types

### Two-Output System
Device nodes have two outputs for different message types:
- **Output 1**: State change events (when attributes change)
- **Output 2**: Commands received from Matter controllers

This separation allows:
- Backward compatibility with existing flows using events
- Clear distinction between state changes and commands
- Easy routing of different message types

Example messages:
```javascript
// Output 1 - Event
{ onOff: { onOff: true } }

// Output 2 - Command  
{ command: "on", cluster: "OnOff", data: undefined }
```

### Controller Support Status
- **Fully Supported**: Lights, Switches, Sensors, Thermostats, Locks
- **Limited Support**: 
  - Video Players (Matter 1.4) - Not recognized by HomeKit/Tuya yet
  - Advanced features may require specific controller support

## Enhanced Devices Architecture

### Overview
The system supports creating enhanced devices by adding additional behaviors/clusters to a primary device type using the `additionalBehaviors` configuration.

### Enhanced Device Implementation
Adds extra functionality to a primary device type:
```javascript
{
  "deviceType": "ThermostatDevice",
  "additionalBehaviors": ["PowerSourceServer", "RelativeHumidityMeasurementServer"]
}
```

### How It Works
1. **Primary Device Type**: The main device type (e.g., ThermostatDevice)
2. **Additional Behaviors**: Extra clusters added to the same endpoint
3. **Behavior Aggregation**: All behaviors are merged into a single endpoint
4. **Single Endpoint**: Everything runs on one BridgedNodeEndpoint

### Example: Thermostat with Battery and Humidity
```javascript
// Configuration
{
  "deviceType": "ThermostatDevice",
  "additionalBehaviors": ["PowerSourceServer", "RelativeHumidityMeasurementServer"],
  "behaviorFeatures": {
    "Thermostat": ["Heating", "Cooling"],
    "PowerSource": ["Battery", "Replaceable"],
    "RelativeHumidityMeasurement": ["Percentage"]
  },
  "initialState": {
    "thermostat": {
      "localTemperature": 2000,
      "systemMode": 4,
      "occupiedHeatingSetpoint": 2000
    },
    "powerSource": {
      "batPercentRemaining": 100,
      "batChargeLevel": 1
    },
    "relativeHumidityMeasurement": {
      "measuredValue": 5000
    }
  }
}

// Results in single endpoint with:
// - ThermostatServer (with Heating/Cooling features)
// - PowerSourceServer (with Battery features)
// - RelativeHumidityMeasurementServer
// - BridgedDeviceBasicInformationServer
// - IdentifyServer
```

### Benefits
- **Simple**: One endpoint manages all functionality
- **Compatible**: Works with all Matter controllers
- **Efficient**: No complex child endpoint management
- **Flexible**: Add only the behaviors you need

### Event Handling
All events come from the same endpoint:
```javascript
// Thermostat event
{ payload: { thermostat: { localTemperature: 2150 } } }

// Battery event
{ payload: { powerSource: { batPercentRemaining: 90 } } }

// Humidity event
{ payload: { relativeHumidityMeasurement: { measuredValue: 6000 } } }
```

## Next Steps

1. **Add More Examples**: Create comprehensive examples for all device types
2. **Error Handling**: Better error messages for invalid configurations
   - **Future Enhancement**: Parse Matter.js validation warnings to show specific missing attributes
   - Example: Extract `fanModeSequence`, `percentCurrent` from validation logs
   - Goal: Show user-friendly list of missing mandatory attributes
3. **Documentation**: Expand user documentation with more device examples
4. **Testing**: Add automated tests for various device types including composite devices
5. **Generic Command Handler**: Extend dynamic command handling to all clusters with commands

## Dependencies

- `@matter/main`: Core Matter.js implementation
- Node-RED >= 3.0.0
- Node.js >= 18.0.0

## Testing

Current test flow in `examples/flows.json` includes:
- OnOffLightDevice
- TemperatureSensorDevice

Both should respond to HomeKit commands and emit state changes to Node-RED.
