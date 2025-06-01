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

### 2. Dynamic Device (`dynamic-device.js` / `dynamic-device.html`)
- **Purpose**: Generic node that can represent any Matter device type
- **Configuration**: Simple JSON specifying only `deviceType` (e.g., "OnOffLightDevice")
- **Key Features**:
  - Dynamically subscribes to all device events
  - Maps Matter.js cluster structure for input/output
  - No hardcoded device-specific logic

## Architecture Design

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

### Issue 1: Events Not Firing
- **Symptom**: Matter.js logs show commands but Node-RED doesn't emit

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
Object.keys(node.device.events).forEach(clusterName => {
    Object.keys(node.device.events[clusterName]).forEach(eventName => {
        if (eventName.endsWith('$Changed')) {
            // Subscribe to state changes
        }
    });
});
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

## Next Steps

1. **Fix Event Emission**: Ensure events properly propagate from Matter.js to Node-RED
2. **Add Examples**: Create comprehensive examples for common device types
3. **Error Handling**: Better error messages for invalid configurations

## Dependencies

- `@matter/main`: Core Matter.js implementation
- Node-RED >= 3.0.0
- Node.js >= 18.0.0

## Testing

Current test flow in `examples/flows.json` includes:
- OnOffLightDevice
- TemperatureSensorDevice

Both should respond to HomeKit commands and emit state changes to Node-RED.
