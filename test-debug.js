#!/usr/bin/env node

// Quick test to verify Matter.js device types are accessible
const devices = require("@matter/main/devices");
const behaviors = require("@matter/main/behaviors");

console.log("Available device types:");
Object.keys(devices).filter(k => k.endsWith('Device')).forEach(k => {
    console.log(`  - ${k}`);
});

console.log("\nAvailable behaviors:");
Object.keys(behaviors).filter(k => k.endsWith('Server')).slice(0, 10).forEach(k => {
    console.log(`  - ${k}`);
});

// Test device creation
const { Endpoint } = require("@matter/main");
const { BridgedDeviceBasicInformationServer, IdentifyServer } = require("@matter/main/behaviors");
const { OnOffLightDevice } = require("@matter/main/devices");

try {
    const testDevice = new Endpoint(
        OnOffLightDevice.with(BridgedDeviceBasicInformationServer, IdentifyServer),
        {
            id: "test-device",
            bridgedDeviceBasicInformation: {
                nodeLabel: "Test Device",
                productName: "Test",
                productLabel: "Test",
                serialNumber: "123456",
                uniqueId: "654321",
                reachable: true,
            }
        }
    );
    console.log("\n✓ Successfully created test device");
} catch (e) {
    console.error("\n✗ Failed to create test device:", e.message);
}