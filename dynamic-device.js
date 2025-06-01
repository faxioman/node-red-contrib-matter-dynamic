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
        node.eventHandlers = {}; // Store event handlers for cleanup
        node.deviceInitFailed = false; // Track initialization failures

        // Dynamic event subscription
        node.subscribeToEvents = function() {
            if (node.eventsSubscribed) {
                node.log("Events already subscribed, skipping");
                return;
            }
            
            if (!node.device || !node.device.events) {
                node.error("Device or device.events not available");
                return;
            }
            
            // Check if device is properly initialized
            try {
                // Test access to device properties
                const testAccess = node.device.state;
            } catch (err) {
                node.error(`Device not properly initialized: ${err.message}`);
                node.status({fill:"red", shape:"ring", text:"init failed"});
                node.deviceInitFailed = true;
                return;
            }
            
            node.eventsSubscribed = true;
            
            // Subscribe to all $Changed events dynamically
            try {
                Object.keys(node.device.events).forEach(clusterName => {
                if (clusterName === 'identify') {
                    // Handle identify separately
                    node.identifyStartHandler = () => {
                        node.status({fill:"blue", shape:"dot", text:"identify"});
                    };
                    node.identifyStopHandler = () => {
                        node.status({fill:"green", shape:"dot", text:"ready"});
                    };
                    
                    if (node.device.events.identify.startIdentifying) {
                        node.device.events.identify.startIdentifying.on(node.identifyStartHandler);
                    }
                    if (node.device.events.identify.stopIdentifying) {
                        node.device.events.identify.stopIdentifying.on(node.identifyStopHandler);
                    }
                    return;
                }
                
                const clusterEvents = node.device.events[clusterName];
                if (!clusterEvents) {
                    return;
                }
                
                // Subscribe based on state attributes
                if (node.device.state && node.device.state[clusterName]) {
                    Object.keys(node.device.state[clusterName]).forEach(attributeName => {
                        const eventName = `${attributeName}$Changed`;
                        if (clusterEvents[eventName]) {
                            try {
                                // Create handler function
                                const handlerKey = `${clusterName}.${eventName}`;
                                node.eventHandlers[handlerKey] = (value, oldValue, context) => {
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
                                };
                                
                                clusterEvents[eventName].on(node.eventHandlers[handlerKey]);
                            } catch (err) {
                                node.error(`Failed to subscribe to ${clusterName}.${eventName}: ${err.message}`);
                            }
                        }
                    });
                }
            });
            } catch (err) {
                node.error(`Error during event subscription: ${err.message}`);
                node.status({fill:"red", shape:"ring", text:"init failed"});
                node.deviceInitFailed = true;
            }
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

        // Handle device initialization failure
        this.on('deviceInitFailed', function(errorMsg) {
            node.error(`Device validation failed: ${errorMsg}`);
            node.deviceInitFailed = true;
            // Force immediate status update
            node.status({fill:"red", shape:"ring", text:"validation error"});
            // Clear any pending status updates
            if (node.statusTimer) {
                clearTimeout(node.statusTimer);
            }
        });
        
        this.on('serverReady', function() {
            var node = this;
            
            // Check device state immediately
            if (!node.device) {
                node.error("Device not available on serverReady");
                return;
            }
            
            // Check if device was added successfully or failed init
            if (node.deviceAddedSuccessfully === false || node.deviceInitFailed) {
                node.log("Device initialization failed, skipping event subscription");
                return;
            }
            
            node.log(`Device state available: ${!!node.device.state}`);
            node.log(`Device events available: ${!!node.device.events}`);
            
            // Simple direct check for device initialization
            setTimeout(() => {
                if (node.deviceInitFailed) {
                    return; // Already handled
                }
                
                try {
                    // Direct test - if this fails, device is not initialized
                    if (!node.device || !node.device.state || !node.device.events) {
                        throw new Error("Device structure incomplete");
                    }
                    
                    // Try to access a property that would fail if not initialized
                    const testAccess = Object.keys(node.device.state);
                    
                    // If we get here, device seems OK, subscribe to events
                    node.subscribeToEvents();
                    
                    // Only set ready if subscribeToEvents didn't fail
                    if (!node.deviceInitFailed) {
                        node.status({fill:"green", shape:"dot", text:"ready"});
                    }
                    
                } catch (err) {
                    node.error(`Device not properly initialized: ${err.message}`);
                    node.status({fill:"red", shape:"ring", text:"init failed"});
                    node.deviceInitFailed = true;
                }
            }, 2000);
        });

        this.on('close', async function(removed, done) {
            const rtype = removed ? 'Device was removed/disabled' : 'Device was restarted';
            node.log(`Closing device: ${this.id}, ${rtype}`);

            // Remove Matter.js Events
            if (node.device && node.device.events) {
                for (const [handlerKey, handler] of Object.entries(node.eventHandlers)) {
                    const [clusterName, eventName] = handlerKey.split('.');
                    if (node.device.events[clusterName] && node.device.events[clusterName][eventName]) {
                        await node.device.events[clusterName][eventName].off(handler);
                    }
                }
                
                // Remove identify events
                if (node.device.events.identify) {
                    if (node.identifyStartHandler && node.device.events.identify.startIdentifying) {
                        await node.device.events.identify.startIdentifying.off(node.identifyStartHandler);
                    }
                    if (node.identifyStopHandler && node.device.events.identify.stopIdentifying) {
                        await node.device.events.identify.stopIdentifying.off(node.identifyStopHandler);
                    }
                }
            }

            // Remove Node-RED Custom Events
            node.removeAllListeners('serverReady');
            node.removeAllListeners('deviceInitFailed');

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
