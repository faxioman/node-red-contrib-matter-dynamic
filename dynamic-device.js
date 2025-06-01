const { Endpoint } = require("@matter/main");
const { BridgedDeviceBasicInformationServer, IdentifyServer } = require("@matter/main/behaviors");
const matterDevices = require("@matter/main/devices");
const matterBehaviors = require("@matter/main/behaviors");

// Custom IdentifyServer
class DynamicIdentifyServer extends IdentifyServer {
    async triggerEffect(identifier, variant) {
        console.log(`triggerEffect received identifier:${identifier}, variant: ${variant}`);
    }
}

module.exports = function(RED) {
    function MatterDynamicDevice(config) {
        RED.nodes.createNode(this, config);
        var node = this;
        node.bridge = RED.nodes.getNode(config.bridge);
        node.name = config.name;
        node.type = 'matter-dynamic-device';

        // Parse device configuration
        let deviceConfig;
        try {
            deviceConfig = typeof config.deviceConfig === 'string'
                ? JSON.parse(config.deviceConfig)
                : config.deviceConfig;
        } catch (e) {
            node.error("Invalid device configuration JSON: " + e.message);
            return;
        }

        this.log(`Loading Dynamic Device: ${deviceConfig.deviceType}`);
        node.status({fill:"red", shape:"ring", text:"not running"});

        node.pending = false;
        node.pendingmsg = null;
        node.passthrough = /^true$/i.test(config.passthrough);

        // Dynamic event subscription
        node.subscribeToEvents = function() {
            if (!node.device || !node.device.events) {
                node.error("Device or device.events not available");
                return;
            }
            
            node.log(`Subscribing to events for device type: ${deviceConfig.deviceType}`);
            
            
            // Subscribe to all $Changed events dynamically
            node.log("BEFORE FOREACH");
            node.log(`Clusters available: ${Object.keys(node.device.events).join(', ')}`);
            
            Object.keys(node.device.events).forEach(clusterName => {
                node.log(`INSIDE FOREACH: ${clusterName}`);
                if (clusterName === 'identify') {
                    node.log("Skipping identify cluster");
                    // Handle identify separately
                    if (node.device.events.identify.startIdentifying) {
                        node.device.events.identify.startIdentifying.on(() => {
                            node.status({fill:"blue", shape:"dot", text:"identify"});
                        });
                    }
                    if (node.device.events.identify.stopIdentifying) {
                        node.device.events.identify.stopIdentifying.on(() => {
                            node.status({fill:"green", shape:"dot", text:"ready"});
                        });
                    }
                    return;
                }
                
                const clusterEvents = node.device.events[clusterName];
                if (!clusterEvents) {
                    return;
                }
                
                node.log(`Checking events in cluster: ${clusterName}`);
                
                // Try different methods to get all properties
                const eventNames = Object.keys(clusterEvents);
                const propNames = Object.getOwnPropertyNames(clusterEvents);
                const allNames = [...new Set([...eventNames, ...propNames])];
                
                node.log(`Object.keys in ${clusterName}: ${eventNames.join(', ')}`);
                node.log(`getOwnPropertyNames in ${clusterName}: ${propNames.join(', ')}`);
                node.log(`All properties in ${clusterName}: ${allNames.join(', ')}`);
                
                // Subscribe based on state attributes
                if (node.device.state && node.device.state[clusterName]) {
                    Object.keys(node.device.state[clusterName]).forEach(attributeName => {
                        const eventName = `${attributeName}$Changed`;
                        if (clusterEvents[eventName]) {
                            node.log(`Found ${clusterName}.${eventName}, subscribing...`);
                            try {
                                clusterEvents[eventName].on((value, oldValue, context) => {
                                    const msg = {
                                        payload: {}
                                    };
                                    msg.payload[clusterName] = {};
                                    msg.payload[clusterName][attributeName] = value;
                                    
                                    if (context) {
                                        msg.eventSource = {
                                            local: context.offline || false
                                        };
                                        if (context.exchange && context.exchange.channel) {
                                            msg.eventSource.srcAddress = context.exchange.channel.channel.peerAddress;
                                            msg.eventSource.srcPort = context.exchange.channel.channel.peerPort;
                                        }
                                    }
                                    
                                    node.send(msg);
                                });
                                node.log(`Subscribed to ${clusterName}.${eventName}`);
                            } catch (err) {
                                node.error(`Failed to subscribe: ${err.message}`);
                            }
                        }
                    });
                }
            });
        };

        // Handle input messages
        this.on('input', function(msg) {
            if (!node.device || !node.device.state) {
                node.error("Device not ready");
                return;
            }

            // Handle state queries
            if (msg.topic === 'state') {
                msg.payload = {};
                Object.keys(node.device.state).forEach(cluster => {
                    msg.payload[cluster] = {...node.device.state[cluster]};
                });
                node.send(msg);
                return;
            }

            // Handle attribute updates
            if (msg.payload && typeof msg.payload === 'object') {
                node.log(`Setting device state: ${JSON.stringify(msg.payload)}`);

                // Simply use device.set
                node.device.set(msg.payload).then(() => {
                    node.log("Device updated successfully");
                    if (node.passthrough) {
                        node.send(msg);
                    }
                }).catch((err) => {
                    node.error(`Failed to update: ${err.message}`);
                });
            }
        });

        this.on('serverReady', function() {
            var node = this;
            node.log("Server ready event received");
            
            // Check device state immediately
            if (!node.device) {
                node.error("Device not available on serverReady");
                return;
            }
            
            node.log(`Device state available: ${!!node.device.state}`);
            node.log(`Device events available: ${!!node.device.events}`);
            
            // Log device structure for debugging
            if (node.device.state) {
                node.log(`Device state structure: ${JSON.stringify(Object.keys(node.device.state))}`);
            }
            if (node.device.events) {
                Object.keys(node.device.events).forEach(cluster => {
                    const eventNames = Object.keys(node.device.events[cluster]);
                    node.log(`Events in ${cluster}: ${eventNames.join(', ')}`);
                });
            }
            
            // NEED delay for Matter.js device initialization
            setTimeout(() => {
                node.log("Starting event subscription after delay");
                node.subscribeToEvents();
                node.status({fill:"green", shape:"dot", text:"ready"});
            }, 2000);
        });

        this.on('close', async function(removed, done) {
            node.log(`Closing device: ${this.id}`);

            // Remove from bridge
            if (node.bridge && node.bridge.registered) {
                let index = node.bridge.registered.indexOf(node);
                if (index > -1) {
                    node.bridge.registered.splice(index, 1);
                }
            }

            if (removed && node.device) {
                await node.device.close();
            }

            done();
        });

        // Create device dynamically based on configuration
        function createDevice() {
            const DeviceClass = matterDevices[deviceConfig.deviceType];
            if (!DeviceClass) {
                throw new Error(`Device type '${deviceConfig.deviceType}' not found`);
            }

            // Base behaviors
            const behaviors = [BridgedDeviceBasicInformationServer, DynamicIdentifyServer];

            // Add additional behaviors if specified
            if (deviceConfig.additionalBehaviors) {
                deviceConfig.additionalBehaviors.forEach(behaviorName => {
                    const BehaviorClass = matterBehaviors[behaviorName];
                    if (BehaviorClass) {
                        behaviors.push(BehaviorClass);
                    }
                });
            }

            // Create endpoint configuration
            const endpointConfig = {
                id: node.id.replace(/-/g, ''),  // Remove all hyphens
                bridgedDeviceBasicInformation: {
                    nodeLabel: node.name,
                    productName: node.name,
                    productLabel: node.name,
                    serialNumber: node.id.replace(/-/g, ''),
                    uniqueId: node.id.replace(/-/g, '').split("").reverse().join(""),
                    reachable: true,
                }
            };

            // Add initial state if provided
            if (deviceConfig.initialState) {
                Object.assign(endpointConfig, deviceConfig.initialState);
            }

            return new Endpoint(
                DeviceClass.with(...behaviors),
                endpointConfig
            );
        }

        // Wait for bridge and register
        function waitForBridge(node) {
            if (!node.bridge) {
                node.error("Bridge not found");
                node.status({fill:"red", shape:"ring", text:"no bridge"});
                return;
            }

            if (!node.bridge.serverReady) {
                setTimeout(waitForBridge, 100, node);
            } else {
                try {
                    node.device = createDevice();
                    // Call registerChild function directly (NOT emit)
                    if (typeof node.bridge.registerChild === 'function') {
                        node.bridge.registerChild(node);
                    } else {
                        node.error("Bridge registerChild function not found");
                    }
                } catch (e) {
                    node.error("Failed to create device: " + e.message);
                    node.status({fill:"red", shape:"ring", text:"error"});
                }
            }
        }

        if (node.bridge) {
            waitForBridge(node);
        } else {
            node.error("Bridge configuration not found");
            node.status({fill:"red", shape:"ring", text:"no bridge"});
        }
    }

    RED.nodes.registerType("matter-dynamic-device", MatterDynamicDevice);
};
